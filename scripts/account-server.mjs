import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PROTOMAKE_ACCOUNT_PORT || 4174);
const host = process.env.PROTOMAKE_ACCOUNT_HOST || '127.0.0.1';
const allowedOrigin = process.env.PROTOMAKE_ACCOUNT_ORIGIN || '';
const dataFile = resolve(process.env.PROTOMAKE_ACCOUNT_DATA || '.protomake/accounts.json');
const sessions = new Map();
const authAttempts = new Map();
const sessionTtlMs = Math.max(60_000, Number(process.env.PROTOMAKE_SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000));
const authWindowMs = Math.max(60_000, Number(process.env.PROTOMAKE_AUTH_WINDOW_MS || 15 * 60 * 1000));
const authLimit = Math.max(1, Number(process.env.PROTOMAKE_AUTH_LIMIT || 20));
const maxProjectsPerUser = Math.max(1, Number(process.env.PROTOMAKE_MAX_PROJECTS || 100));
const maxProjectBytes = Math.max(1024, Number(process.env.PROTOMAKE_MAX_PROJECT_BYTES || 20 * 1024 * 1024));
let state = { users: [], projects: [] };
let mutationTail = Promise.resolve();

try {
  state = JSON.parse(await readFile(dataFile, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

async function persist() {
  await mkdir(dirname(dataFile), { recursive: true });
  const temp = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2));
  await rename(temp, dataFile);
}

function mutate(action) {
  const run = mutationTail.then(action, action);
  mutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function headers() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': allowedOrigin ? 'cross-origin' : 'same-origin',
    ...(allowedOrigin
      ? {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          Vary: 'Origin',
        }
      : {}),
  };
}

function json(response, status, payload) {
  response.writeHead(status, {
    ...headers(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function validPassword(password, user) {
  const actual = Buffer.from(passwordHash(password, user.salt).hash, 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bearer(request) {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function auth(request) {
  const token = bearer(request), session = sessions.get(token);
  if (!session) return undefined;
  if (session.expires <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return state.users.find((user) => user.id === session.userId);
}

function issue(user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expires: Date.now() + sessionTtlMs });
  return { token, expires: Date.now() + sessionTtlMs, user: { id: user.id, email: user.email } };
}

function rateLimited(request) {
  const key = request.socket.remoteAddress || 'unknown', now = Date.now(),
    recent = (authAttempts.get(key) || []).filter((timestamp) => now - timestamp < authWindowMs);
  recent.push(now);
  authAttempts.set(key, recent);
  return recent.length > authLimit;
}

function routeProject(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`),
      method = request.method || 'GET';

    if (method === 'OPTIONS' && allowedOrigin) {
      response.writeHead(204, headers());
      return response.end();
    }

    if (url.pathname === '/api/health') return json(response, 200, { ok: true });

    if (url.pathname === '/api/auth/signup' && method === 'POST') {
      if (rateLimited(request)) return json(response, 429, { error: 'Too many account attempts; try again later' });
      const value = await body(request),
        email = String(value.email || '').trim().toLowerCase(),
        password = String(value.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(response, 400, { error: 'Enter a valid email address' });
      if (password.length < 8) return json(response, 400, { error: 'Password must contain at least 8 characters' });
      if (password.length > 512) return json(response, 400, { error: 'Password is too long' });
      const created = await mutate(async () => {
        if (state.users.some((user) => user.email === email)) return undefined;
        const { salt, hash } = passwordHash(password),
          user = { id: randomUUID(), email, salt, passwordHash: hash, created: Date.now() };
        state.users.push(user);
        await persist();
        return user;
      });
      if (!created) return json(response, 409, { error: 'Account already exists' });
      return json(response, 201, issue(created));
    }

    if (url.pathname === '/api/auth/signin' && method === 'POST') {
      if (rateLimited(request)) return json(response, 429, { error: 'Too many account attempts; try again later' });
      const value = await body(request),
        email = String(value.email || '').trim().toLowerCase(),
        password = String(value.password || '');
      if (password.length > 512) return json(response, 400, { error: 'Password is too long' });
      const user = state.users.find((candidate) => candidate.email === email);
      if (!user || !validPassword(password, user)) return json(response, 401, { error: 'Incorrect email or password' });
      return json(response, 200, issue(user));
    }

    const user = auth(request);
    if (!user) return json(response, 401, { error: 'Sign in required' });

    if (url.pathname === '/api/auth/signout' && method === 'POST') {
      sessions.delete(bearer(request));
      return json(response, 200, { ok: true });
    }

    if (url.pathname === '/api/projects' && method === 'GET') {
      const projects = state.projects
        .filter((project) => project.userId === user.id)
        .map(({ id, name, updated, revision }) => ({ id, name, updated, revision }))
        .sort((a, b) => b.updated - a.updated);
      return json(response, 200, { projects });
    }

    const projectId = routeProject(url.pathname);
    if (projectId) {
      const index = state.projects.findIndex((project) => project.userId === user.id && project.id === projectId),
        existing = index >= 0 ? state.projects[index] : undefined;
      if (method === 'GET') {
        if (!existing) return json(response, 404, { error: 'Cloud project not found' });
        const { id, name, updated, revision, project, activeScene } = existing;
        return json(response, 200, {
          id, name, updated, revision, project,
          ...(typeof activeScene === 'string' ? { activeScene } : {}),
        });
      }
      if (method === 'PUT') {
        const value = await body(request),
          project = value.project;
        if (!project || typeof project !== 'object' || project.id !== projectId || typeof project.name !== 'string')
          return json(response, 400, { error: 'Invalid project payload' });
        if (Buffer.byteLength(JSON.stringify(project), 'utf8') > maxProjectBytes)
          return json(response, 413, { error: 'Project exceeds this server’s per-project storage limit' });
        const result = await mutate(async () => {
          const currentIndex = state.projects.findIndex(
              (candidate) => candidate.userId === user.id && candidate.id === projectId,
            ),
            current = currentIndex >= 0 ? state.projects[currentIndex] : undefined;
          if (current && value.revision !== current.revision)
            return {
              conflict: true,
              current: { id: current.id, name: current.name, updated: current.updated, revision: current.revision },
            };
          if (!current && value.revision !== undefined) return { conflict: true };
          if (!current && state.projects.filter((candidate) => candidate.userId === user.id).length >= maxProjectsPerUser)
            return { quota: true };
          const record = {
            userId: user.id,
            id: projectId,
            name: project.name,
            updated: Date.now(),
            revision: (current?.revision ?? 0) + 1,
            project,
            ...(typeof value.activeScene === 'string' ? { activeScene: value.activeScene } : {}),
          };
          if (currentIndex >= 0) state.projects[currentIndex] = record;
          else state.projects.push(record);
          await persist();
          return { record };
        });
        if (result.quota) return json(response, 413, { error: 'Account project limit reached' });
        if (result.conflict)
          return json(response, 409, {
            error: 'revision_conflict',
            ...(result.current ? { current: result.current } : {}),
          });
        return json(response, 200, { revision: result.record.revision, updated: result.record.updated });
      }
      if (method === 'DELETE') {
        const deleted = await mutate(async () => {
          const currentIndex = state.projects.findIndex(
            (candidate) => candidate.userId === user.id && candidate.id === projectId,
          );
          if (currentIndex < 0) return false;
          state.projects.splice(currentIndex, 1);
          await persist();
          return true;
        });
        return deleted
          ? json(response, 200, { ok: true })
          : json(response, 404, { error: 'Cloud project not found' });
      }
    }

    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`ProtoMake account server listening on http://${host}:${port}`);
  console.log(`Account data: ${dataFile}`);
});
