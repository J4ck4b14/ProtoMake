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
export class ProjectStorage {
  constructor(private readonly factory: IDBFactory = indexedDB) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open('protomake-projects', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('projects', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Project storage is blocked by another tab'));
    });
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', mode),
        request = operation(transaction.objectStore('projects'));
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
    await this.transaction('readwrite', (store) =>
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
    const records = await this.transaction<StoredProject[]>(
      'readonly',
      (store) => store.getAll(),
    );
    return records
      .map(({ id, name, updated }) => ({ id, name, updated }))
      .sort((a, b) => b.updated - a.updated);
  }
  async loadSession(
    id: string,
  ): Promise<{ project: ProjectData; activeScene?: string }> {
    const record = await this.transaction<StoredProject | undefined>(
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
    const record = await this.transaction<StoredProject | undefined>(
      'readonly',
      (store) => store.get(id),
    );
    if (!record) throw new Error('Saved project not found');
    return structuredClone(record.project);
  }
  async delete(id: string): Promise<void> {
    await this.transaction('readwrite', (store) => store.delete(id));
  }
}
