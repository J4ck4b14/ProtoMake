import {
  validateProject,
  deterministicJSON,
  type ProjectData,
} from '@protomake/serialization';
import { runtimeRegistry } from '@protomake/player';
import {
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import type { EditorModel } from './model';
const encode = (text: string) => new TextEncoder().encode(text);
export interface BuildFile {
  path: string;
  data: Uint8Array;
}
export function projectBuildFiles(input: ProjectData): BuildFile[] {
  const project = validateProject(input, runtimeRegistry());
  if (!project.startupScene)
    throw new Error('Choose a startup scene before building');
  const compiled = compileProjectScripts(project.assets),
    files: BuildFile[] = [],
    scripts: { id: string; url: string; fields: unknown }[] = [];
  moduleSources(compiled, (code, id) => {
    files.push({ path: `scripts/${id}.js`, data: encode(code) });
    return `./${id}.js`;
  });
  for (const script of compiled)
    scripts.push({
      id: script.id,
      url: `./scripts/${script.id}.js`,
      fields: script.fields,
    });
  // Keep every authored scene and asset: scripts can switch scenes and reference IDs at runtime.
  for (const asset of project.assets)
    if (asset.mime === 'text/typescript') asset.data = '';
  files.push(
    { path: 'project.protomake.json', data: encode(deterministicJSON(project)) },
    { path: 'scripts.json', data: encode(JSON.stringify(scripts)) },
    {
      path: 'BUILD-REPORT.json',
      data: encode(
        JSON.stringify(
          {
            engineVersion: project.engineVersion,
            startupScene: project.startupScene,
            scenes: project.scenes.map((s) => ({ id: s.id, name: s.name })),
            assets: project.assets.map((a) => ({
              id: a.id,
              path: a.path,
              kind: a.kind,
            })),
            compiledScripts: compiled.map((s) => s.path),
            collection:
              'All project scenes and assets retained for dynamic references; TypeScript source replaced with compiled ES modules.',
          },
          null,
          2,
        ),
      ),
    },
    {
      path: 'DEPLOY.txt',
      data: encode(
        'Upload this entire folder to static hosting (HTTPS recommended). Open index.html over HTTP(S), not file://. All paths are relative, so subdirectory hosting works. No Node, ProtoMake editor, build service, or CDN is required by the player. Click Start for audio/input. See BUILD-REPORT.json for included content.\n',
      ),
    },
  );
  return files;
}
/** Store-only ZIP with UTF-8 filenames and CRC32. No server or compression dependency needed. */
export function zipFiles(files: readonly BuildFile[]): Uint8Array {
  if (files.length > 65535) throw new Error('Too many export files');
  const seen = new Set<string>(),
    parts: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path.split('/').some((p) => !p || p === '..' || p === '.') ||
      seen.has(file.path)
    )
      throw new Error('Unsafe or duplicate build path');
    seen.add(file.path);
    const name = encode(file.path);
    let crc = 0xffffffff;
    for (const byte of file.data) {
      crc ^= byte;
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, file.data.length, true);
    h.setUint32(22, file.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      d = new DataView(entry.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, file.data.length, true);
    d.setUint32(24, file.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    entry.set(name, 46);
    directory.push(entry);
    parts.push(header, file.data);
    offset += header.length + file.data.length;
  }
  const length = directory.reduce((n, p) => n + p.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, length, true);
  e.setUint32(16, offset, true);
  parts.push(...directory, end);
  const result = new Uint8Array(offset + length + end.length);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}
export async function buildGame(model: EditorModel): Promise<BuildFile[]> {
  if (model.locked) throw new Error('Stop Play before building');
  const files = projectBuildFiles(model.project);
  const response = await fetch('./player/manifest.json');
  if (!response.ok)
    throw new Error(
      'Player bundle missing; run npm run build:player and retry',
    );
  const manifest = (await response.json()) as {
    path: string;
    bytes: number;
    sha256: string;
  }[];
  for (const file of manifest) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.includes('..'))
      throw new Error('Invalid runtime manifest path');
    const response = await fetch(`./player/${file.path}`);
    if (!response.ok) throw new Error(`Missing player file ${file.path}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== file.bytes)
      throw new Error(`Player size mismatch: ${file.path}`);
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    ]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== file.sha256)
      throw new Error(`Player hash mismatch: ${file.path}`);
    files.push({ path: file.path, data });
  }
  if (!files.some((f) => f.path === 'index.html'))
    throw new Error('Player entry missing');
  return files;
}
export function downloadBuild(files: BuildFile[], name: string): void {
  const url = URL.createObjectURL(
      new Blob([zipFiles(files) as Uint8Array<ArrayBuffer>], {
        type: 'application/zip',
      }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '-web.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function previewBuild(
  files: BuildFile[],
  tab: Window | null,
): Promise<void> {
  if (!tab) throw new Error('Allow popups to preview the game');
  try {
    if (!('serviceWorker' in navigator))
      throw new Error(
        'Preview requires HTTPS or localhost and service workers',
      );
    const registration = await navigator.serviceWorker.register(
      './export-preview-sw.js',
    );
    const worker =
      registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) throw new Error('Preview worker unavailable');
    if (worker.state !== 'activated')
      await new Promise<void>((resolve, reject) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant')
            reject(new Error('Preview worker failed'));
        });
      });
    const cache = await caches.open('protomake-game-preview-v1');
    // Keep the latest preview only; exported ZIPs are unaffected.
    for (const request of await cache.keys()) await cache.delete(request);
    const prefix = new URL(
      `./__protomake_preview__/${crypto.randomUUID()}/`,
      location.href,
    );
    for (const file of files) {
      const mime = file.path.endsWith('.html')
        ? 'text/html'
        : file.path.endsWith('.js')
          ? 'text/javascript'
          : file.path.endsWith('.json')
            ? 'application/json'
            : file.path.endsWith('.css')
              ? 'text/css'
              : 'application/octet-stream';
      await cache.put(
        new URL(file.path, prefix),
        new Response(file.data as Uint8Array<ArrayBuffer>, {
          headers: { 'Content-Type': mime },
        }),
      );
    }
    tab.location.href = new URL('index.html', prefix).href;
  } catch (e) {
    tab.close();
    throw e;
  }
}
