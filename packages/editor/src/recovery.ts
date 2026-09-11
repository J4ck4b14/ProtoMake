import type { EditorModel } from './model';
import { ProjectStorage, type RecoverySnapshot } from './storage';

const EMERGENCY_PREFIX = 'protomake.recovery.emergency.v2:';
const LEGACY_EMERGENCY_KEY = 'protomake.recovery.emergency.v1';

export interface RecoveryOptions {
  delayMs?: number;
  maxSnapshots?: number;
}

/** Debounced rotating crash journal. It never marks the project saved. */
export class RecoveryManager {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private lastFingerprint = '';
  private readonly delayMs: number;
  private readonly maxSnapshots: number;
  private readonly off: () => void;

  constructor(
    private readonly model: EditorModel,
    private readonly storage: ProjectStorage,
    private readonly report: (message: string, error?: boolean) => void,
    options: RecoveryOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 1800;
    this.maxSnapshots = options.maxSnapshots ?? 10;
    this.off = model.onChange(() => this.schedule());
  }

  private fingerprint(): string {
    // Cheap enough for editor-scale documents and avoids duplicate snapshots from selection-only changes.
    return JSON.stringify(this.model.project);
  }

  private schedule(): void {
    if (this.disposed || this.model.locked || !this.model.dirty) return;
    this.saveEmergency();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.capture(), this.delayMs);
  }

  /** Synchronous last-line recovery for tab/browser termination before IndexedDB can finish. */
  saveEmergency(): void {
    if (this.model.locked || !this.model.dirty) return;
    try {
      localStorage.setItem(
        EMERGENCY_PREFIX + this.model.project.id,
        JSON.stringify({
          key: `emergency:${this.model.project.id}`,
          projectId: this.model.project.id,
          projectName: this.model.project.name,
          updated: Date.now(),
          reason: 'autosave',
          activeScene: this.model.sceneId,
          project: this.model.project,
        } satisfies RecoverySnapshot),
      );
    } catch {
      // Large projects can exceed localStorage quota; IndexedDB remains the primary journal.
    }
  }

  private emergencies(): RecoverySnapshot[] {
    const snapshots: RecoverySnapshot[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || (!key.startsWith(EMERGENCY_PREFIX) && key !== LEGACY_EMERGENCY_KEY)) continue;
        try {
          const value = JSON.parse(localStorage.getItem(key) ?? 'null') as RecoverySnapshot | null;
          if (value?.project && typeof value.updated === 'number') snapshots.push(value);
        } catch {
          // Ignore one corrupt emergency entry without hiding the rest.
        }
      }
    } catch {
      // Optional browser storage.
    }
    return snapshots;
  }

  clearEmergency(projectId?: string): void {
    try {
      if (projectId) {
        localStorage.removeItem(EMERGENCY_PREFIX + projectId);
        const legacy = localStorage.getItem(LEGACY_EMERGENCY_KEY);
        if (legacy) {
          try {
            const value = JSON.parse(legacy) as RecoverySnapshot;
            if (value.projectId === projectId) localStorage.removeItem(LEGACY_EMERGENCY_KEY);
          } catch {
            localStorage.removeItem(LEGACY_EMERGENCY_KEY);
          }
        }
      } else {
        for (const snapshot of this.emergencies())
          localStorage.removeItem(EMERGENCY_PREFIX + snapshot.projectId);
        localStorage.removeItem(LEGACY_EMERGENCY_KEY);
      }
    } catch {
      /* Optional browser storage. */
    }
  }

  async capture(reason: RecoverySnapshot['reason'] = 'autosave'): Promise<void> {
    if (this.disposed || this.model.locked) return;
    if (!this.model.dirty) {
      if (reason === 'checkpoint') this.report('No unsaved changes to checkpoint');
      return;
    }
    const fingerprint = this.fingerprint();
    if (reason === 'autosave' && fingerprint === this.lastFingerprint) return;
    try {
      await this.storage.saveRecovery(
        structuredClone(this.model.project),
        this.model.sceneId,
        reason,
        this.maxSnapshots,
      );
      this.lastFingerprint = fingerprint;
      this.clearEmergency(this.model.project.id);
      this.report(reason === 'checkpoint' ? 'Recovery checkpoint created' : 'Autosave recovery snapshot updated');
    } catch (error) {
      this.report(`Recovery snapshot failed: ${String(error)}`, true);
    }
  }

  async newestRecoverable(): Promise<RecoverySnapshot | undefined> {
    const snapshots = await this.storage.listRecovery();
    snapshots.push(...this.emergencies());
    snapshots.sort((a, b) => b.updated - a.updated);
    for (const snapshot of snapshots) {
      const saved = await this.storage.summary(snapshot.projectId);
      if (!saved || snapshot.updated > saved.updated) return snapshot;
    }
    return undefined;
  }

  async list(): Promise<RecoverySnapshot[]> {
    const snapshots = await this.storage.listRecovery();
    for (const emergency of this.emergencies())
      if (!snapshots.some((item) => item.key === emergency.key)) snapshots.push(emergency);
    return snapshots.sort((a, b) => b.updated - a.updated);
  }

  async discard(snapshot: RecoverySnapshot): Promise<void> {
    if (snapshot.key.startsWith('emergency:')) this.clearEmergency(snapshot.projectId);
    else await this.storage.deleteRecovery(snapshot.key);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.off();
  }
}
