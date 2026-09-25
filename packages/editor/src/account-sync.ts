import type { ProjectData } from '@protomake/serialization';

export interface CloudProjectSummary {
  id: string;
  name: string;
  updated: number;
  revision: number;
}

export interface CloudProject extends CloudProjectSummary {
  project: ProjectData;
  activeScene?: string;
}

interface AuthResponse {
  token: string;
  expires?: number;
  user: { id: string; email: string };
}

export class AccountSync {
  private token = '';
  private userValue: { id: string; email: string } | undefined;
  private revisions = new Map<string, number>();
  endpoint = '/api';

  constructor() {
    try {
      this.endpoint = localStorage.getItem('protomake.sync.endpoint') || '/api';
      this.token = sessionStorage.getItem('protomake.sync.token') ?? '';
      const user = JSON.parse(
        sessionStorage.getItem('protomake.sync.user') ?? 'null',
      ) as { id: string; email: string } | null;
      if (user) this.userValue = user;
      const revisions = JSON.parse(
        localStorage.getItem('protomake.sync.revisions') ?? '{}',
      ) as Record<string, number>;
      this.revisions = new Map(Object.entries(revisions));
    } catch {
      /* Storage is optional. */
    }
  }

  get user(): { id: string; email: string } | undefined {
    return this.userValue;
  }

  get signedIn(): boolean {
    return !!this.token && !!this.userValue;
  }

  setEndpoint(value: string): void {
    const next = value.trim().replace(/\/$/, '');
    if (!next) throw new Error('Sync server URL is required');
    const changed = next !== this.endpoint;
    this.endpoint = next;
    if (changed) {
      // Bearer tokens and cloud revisions belong to one server. Never carry them
      // across an endpoint change, even when a user switches between LAN/prod.
      this.token = '';
      this.userValue = undefined;
      this.revisions.clear();
      this.persist();
    }
    try {
      localStorage.setItem('protomake.sync.endpoint', next);
    } catch {
      /* Endpoint remains active for this session. */
    }
  }

  private persist(): void {
    try {
      if (this.token)
        sessionStorage.setItem('protomake.sync.token', this.token);
      else sessionStorage.removeItem('protomake.sync.token');
      if (this.userValue)
        sessionStorage.setItem(
          'protomake.sync.user',
          JSON.stringify(this.userValue),
        );
      else sessionStorage.removeItem('protomake.sync.user');
      localStorage.setItem(
        'protomake.sync.revisions',
        JSON.stringify(Object.fromEntries(this.revisions)),
      );
    } catch {
      /* Account state remains active for this session. */
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.endpoint + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      if (response.status === 409 && payload.error === 'revision_conflict')
        throw new Error(
          `Cloud save conflict. This device has an older revision; open the cloud copy before saving again.`,
        );
      if (response.status === 401) this.signOut();
      throw new Error(
        String(payload.error ?? `Sync server returned ${response.status}`),
      );
    }
    return payload as T;
  }

  private acceptAuth(value: AuthResponse): void {
    this.token = value.token;
    this.userValue = value.user;
    this.persist();
  }

  async signUp(email: string, password: string): Promise<void> {
    this.acceptAuth(
      await this.request<AuthResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    );
  }

  async signIn(email: string, password: string): Promise<void> {
    this.acceptAuth(
      await this.request<AuthResponse>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    );
  }

  async signOutRemote(): Promise<void> {
    if (this.token) {
      try {
        await this.request<{ ok: true }>('/auth/signout', { method: 'POST' });
      } catch {
        /* Local sign-out must still succeed if the server is unreachable. */
      }
    }
    this.signOut();
  }

  signOut(): void {
    this.token = '';
    this.userValue = undefined;
    this.revisions.clear();
    this.persist();
  }

  isLinked(projectId: string): boolean {
    return this.revisions.has(projectId);
  }

  async list(): Promise<CloudProjectSummary[]> {
    const result = await this.request<{ projects: CloudProjectSummary[] }>(
      '/projects',
    );
    return result.projects;
  }

  async load(id: string): Promise<CloudProject> {
    const result = await this.request<CloudProject>(
      `/projects/${encodeURIComponent(id)}`,
    );
    this.revisions.set(id, result.revision);
    this.persist();
    return result;
  }

  async save(project: ProjectData, activeScene?: string): Promise<number> {
    const revision = this.revisions.get(project.id);
    const result = await this.request<{ revision: number }>(
      `/projects/${encodeURIComponent(project.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          project,
          ...(activeScene ? { activeScene } : {}),
          ...(revision !== undefined ? { revision } : {}),
        }),
      },
    );
    this.revisions.set(project.id, result.revision);
    this.persist();
    return result.revision;
  }

  async delete(id: string): Promise<void> {
    await this.request<{ ok: true }>(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    this.revisions.delete(id);
    this.persist();
  }
}
