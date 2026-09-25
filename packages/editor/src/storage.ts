import type { ProjectData } from '@protomake/serialization';

export interface ProjectSummary {
  id: string;
  name: string;
  updated: number;
}
interface StoredProject extends ProjectSummary {
  activeScene?: string;
  project: ProjectData;
}
export interface RecoverySnapshot {
  key: string;
  projectId: string;
  projectName: string;
  updated: number;
  reason: 'autosave' | 'checkpoint';
  activeScene?: string;
  project: ProjectData;
}

const DB_NAME = 'protomake-projects';
const DB_VERSION = 2;
const PROJECTS = 'projects';
const RECOVERY = 'recovery';

export class ProjectStorage {
  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS))
          db.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(RECOVERY)) {
          const store = db.createObjectStore(RECOVERY, { keyPath: 'key' });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('updated', 'updated', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error('Project storage is blocked by another ProtoMake tab'),
        );
    });
  }

  private async request<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode),
        request = operation(transaction.objectStore(storeName));
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? request.error);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('Storage transaction aborted'));
      };
    });
  }

  async save(project: ProjectData, activeScene?: string): Promise<void> {
    await this.request(PROJECTS, 'readwrite', (store) =>
      store.put({
        id: project.id,
        name: project.name,
        updated: Date.now(),
        project: structuredClone(project),
        ...(activeScene ? { activeScene } : {}),
      } satisfies StoredProject),
    );
  }

  async list(): Promise<ProjectSummary[]> {
    const records = await this.request<StoredProject[]>(
      PROJECTS,
      'readonly',
      (store) => store.getAll(),
    );
    return records
      .map(({ id, name, updated }) => ({ id, name, updated }))
      .sort((a, b) => b.updated - a.updated);
  }

  async summary(id: string): Promise<ProjectSummary | undefined> {
    const record = await this.request<StoredProject | undefined>(
      PROJECTS,
      'readonly',
      (store) => store.get(id),
    );
    return record
      ? { id: record.id, name: record.name, updated: record.updated }
      : undefined;
  }

  async loadSession(
    id: string,
  ): Promise<{ project: ProjectData; activeScene?: string }> {
    const record = await this.request<StoredProject | undefined>(
      PROJECTS,
      'readonly',
      (store) => store.get(id),
    );
    if (!record) throw new Error('Saved project not found');
    return {
      project: structuredClone(record.project),
      ...(record.activeScene ? { activeScene: record.activeScene } : {}),
    };
  }

  async load(id: string): Promise<ProjectData> {
    return (await this.loadSession(id)).project;
  }

  async delete(id: string): Promise<void> {
    await this.request(PROJECTS, 'readwrite', (store) => store.delete(id));
  }

  /**
   * Store a crash-recovery snapshot separately from explicit Save. A project gets
   * at most `limit` rotating snapshots, so recovery never grows without bound.
   */
  async saveRecovery(
    project: ProjectData,
    activeScene?: string,
    reason: RecoverySnapshot['reason'] = 'autosave',
    limit = 10,
  ): Promise<RecoverySnapshot> {
    const updated = Date.now(),
      snapshot: RecoverySnapshot = {
        key: `${project.id}:${updated}:${crypto.randomUUID()}`,
        projectId: project.id,
        projectName: project.name,
        updated,
        reason,
        project: structuredClone(project),
        ...(activeScene ? { activeScene } : {}),
      };
    await this.request(RECOVERY, 'readwrite', (store) => store.put(snapshot));
    const all = await this.listRecovery(project.id);
    for (const stale of all.slice(Math.max(0, limit)))
      await this.deleteRecovery(stale.key);
    return snapshot;
  }

  async listRecovery(projectId?: string): Promise<RecoverySnapshot[]> {
    const records = await this.request<RecoverySnapshot[]>(
      RECOVERY,
      'readonly',
      (store) =>
        projectId ? store.index('projectId').getAll(projectId) : store.getAll(),
    );
    return records.sort((a, b) => b.updated - a.updated);
  }

  async latestRecovery(
    projectId?: string,
  ): Promise<RecoverySnapshot | undefined> {
    return (await this.listRecovery(projectId))[0];
  }

  async loadRecovery(key: string): Promise<RecoverySnapshot> {
    const record = await this.request<RecoverySnapshot | undefined>(
      RECOVERY,
      'readonly',
      (store) => store.get(key),
    );
    if (!record) throw new Error('Recovery snapshot not found');
    return structuredClone(record);
  }

  async deleteRecovery(key: string): Promise<void> {
    await this.request(RECOVERY, 'readwrite', (store) => store.delete(key));
  }

  async clearRecovery(projectId: string): Promise<void> {
    for (const snapshot of await this.listRecovery(projectId))
      await this.deleteRecovery(snapshot.key);
  }
}
