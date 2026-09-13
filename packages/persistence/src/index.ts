import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_.-]+$/);
export const AchievementDefinitionSchema = z.strictObject({
  id,
  name: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  hidden: z.boolean(),
});
export type AchievementDefinition = z.infer<typeof AchievementDefinitionSchema>;
export const PersistenceSettingsSchema = z.strictObject({
  version: z.number().int().positive(),
  autosave: z.boolean(),
  achievements: z
    .array(AchievementDefinitionSchema)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'Achievement IDs must be unique',
    ),
});
export type PersistenceSettings = z.infer<typeof PersistenceSettingsSchema>;
export function defaultPersistence(): PersistenceSettings {
  return { version: 1, autosave: false, achievements: [] };
}

export interface SaveRecord {
  readonly project: string;
  readonly profile: string;
  readonly slot: string;
  readonly version: number;
  readonly updated: number;
  readonly state: Readonly<Record<string, unknown>>;
  readonly integrity: string;
}
export interface SaveBackend {
  write(record: SaveRecord): Promise<void>;
  read(
    project: string,
    profile: string,
    slot: string,
  ): Promise<SaveRecord | undefined>;
  list(project: string, profile?: string): Promise<readonly SaveRecord[]>;
  delete(project: string, profile: string, slot: string): Promise<void>;
}
export class MemorySaveBackend implements SaveBackend {
  private readonly records = new Map<string, SaveRecord>();
  private key(project: string, profile: string, slot: string): string {
    return `${project}:${profile}:${slot}`;
  }
  async write(record: SaveRecord): Promise<void> {
    this.records.set(
      this.key(record.project, record.profile, record.slot),
      structuredClone(record),
    );
  }
  async read(
    project: string,
    profile: string,
    slot: string,
  ): Promise<SaveRecord | undefined> {
    const record = this.records.get(this.key(project, profile, slot));
    return record ? structuredClone(record) : undefined;
  }
  async list(
    project: string,
    profile?: string,
  ): Promise<readonly SaveRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.project === project &&
          (profile === undefined || record.profile === profile),
      )
      .map((record) => structuredClone(record))
      .sort((a, b) => b.updated - a.updated);
  }
  async delete(project: string, profile: string, slot: string): Promise<void> {
    this.records.delete(this.key(project, profile, slot));
  }
}
export class BrowserSaveBackend implements SaveBackend {
  constructor(private readonly storage: Storage = localStorage) {}
  private key(project: string, profile: string, slot: string): string {
    return `protomake.save.${project}.${profile}.${slot}`;
  }
  async write(record: SaveRecord): Promise<void> {
    this.storage.setItem(
      this.key(record.project, record.profile, record.slot),
      JSON.stringify(record),
    );
  }
  async read(
    project: string,
    profile: string,
    slot: string,
  ): Promise<SaveRecord | undefined> {
    const value = this.storage.getItem(this.key(project, profile, slot));
    return value ? (JSON.parse(value) as SaveRecord) : undefined;
  }
  async list(
    project: string,
    profile?: string,
  ): Promise<readonly SaveRecord[]> {
    const records: SaveRecord[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (!key?.startsWith(`protomake.save.${project}.`)) continue;
      const raw = this.storage.getItem(key);
      if (raw) {
        const record = JSON.parse(raw) as SaveRecord;
        if (profile === undefined || record.profile === profile)
          records.push(record);
      }
    }
    return records.sort((a, b) => b.updated - a.updated);
  }
  async delete(project: string, profile: string, slot: string): Promise<void> {
    this.storage.removeItem(this.key(project, profile, slot));
  }
}

export interface SaveRegistration {
  capture(): unknown;
  restore(value: unknown): void;
}
export type SaveMigration = (
  state: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>;
function integrity(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export class SaveService {
  private readonly registrations = new Map<
    string,
    { owner: string; registration: SaveRegistration }
  >();
  private readonly migrations = new Map<number, SaveMigration>();
  constructor(
    readonly project: string,
    readonly version: number,
    private readonly backend: SaveBackend = new BrowserSaveBackend(),
  ) {
    id.parse(project);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new Error('Invalid save version');
  }
  register(
    owner: string,
    key: string,
    registration: SaveRegistration,
  ): () => void {
    id.parse(key);
    if (this.registrations.has(key))
      throw new Error(`Duplicate save state ${key}`);
    this.registrations.set(key, { owner, registration });
    return () => this.registrations.delete(key);
  }
  clearOwner(owner: string): void {
    for (const [key, value] of this.registrations)
      if (value.owner === owner) this.registrations.delete(key);
  }
  migrate(fromVersion: number, migration: SaveMigration): void {
    if (
      fromVersion < 1 ||
      fromVersion >= this.version ||
      this.migrations.has(fromVersion)
    )
      throw new Error(`Invalid save migration ${fromVersion}`);
    this.migrations.set(fromVersion, migration);
  }
  async save(profile = 'default', slot = 'manual'): Promise<SaveRecord> {
    id.parse(profile);
    id.parse(slot);
    const state = Object.fromEntries(
        [...this.registrations].map(([key, value]) => [
          key,
          value.registration.capture(),
        ]),
      ),
      content = JSON.stringify({
        project: this.project,
        profile,
        slot,
        version: this.version,
        state,
      }),
      record: SaveRecord = {
        project: this.project,
        profile,
        slot,
        version: this.version,
        updated: Date.now(),
        state,
        integrity: integrity(content),
      };
    await this.backend.write(record);
    return record;
  }
  async load(profile = 'default', slot = 'manual'): Promise<SaveRecord> {
    id.parse(profile);
    id.parse(slot);
    const record = await this.backend.read(this.project, profile, slot);
    if (!record) throw new Error(`Missing save ${profile}/${slot}`);
    const content = JSON.stringify({
      project: record.project,
      profile: record.profile,
      slot: record.slot,
      version: record.version,
      state: record.state,
    });
    if (integrity(content) !== record.integrity)
      throw new Error('Save integrity check failed');
    if (record.version > this.version)
      throw new Error(
        `Save version ${record.version} is newer than ${this.version}`,
      );
    let state = record.state;
    for (let version = record.version; version < this.version; version++) {
      const migration = this.migrations.get(version);
      if (!migration) throw new Error(`Missing save migration from ${version}`);
      state = migration(state);
    }
    for (const [key, value] of Object.entries(state))
      this.registrations.get(key)?.registration.restore(structuredClone(value));
    return { ...record, version: this.version, state };
  }
  list(profile?: string): Promise<readonly SaveRecord[]> {
    if (profile !== undefined) id.parse(profile);
    return this.backend.list(this.project, profile);
  }
  delete(profile: string, slot: string): Promise<void> {
    id.parse(profile);
    id.parse(slot);
    return this.backend.delete(this.project, profile, slot);
  }
}

export class AchievementService {
  private readonly unlocked = new Set<string>();
  private readonly definitions = new Map<string, AchievementDefinition>();
  constructor(definitions: readonly AchievementDefinition[]) {
    for (const input of definitions) {
      const definition = AchievementDefinitionSchema.parse(input);
      if (this.definitions.has(definition.id))
        throw new Error(`Duplicate achievement ${definition.id}`);
      this.definitions.set(definition.id, definition);
    }
  }
  unlock(id: string): boolean {
    if (!this.definitions.has(id)) throw new Error(`Unknown achievement ${id}`);
    const fresh = !this.unlocked.has(id);
    this.unlocked.add(id);
    return fresh;
  }
  isUnlocked(id: string): boolean {
    if (!this.definitions.has(id)) throw new Error(`Unknown achievement ${id}`);
    return this.unlocked.has(id);
  }
  all(): readonly { definition: AchievementDefinition; unlocked: boolean }[] {
    return [...this.definitions.values()].map((definition) => ({
      definition: structuredClone(definition),
      unlocked: this.unlocked.has(definition.id),
    }));
  }
  capture(): readonly string[] {
    return [...this.unlocked].sort();
  }
  restore(value: unknown): void {
    const ids = z.array(id).parse(value);
    for (const key of ids)
      if (!this.definitions.has(key))
        throw new Error(`Unknown achievement ${key}`);
    this.unlocked.clear();
    for (const key of ids) this.unlocked.add(key);
  }
}

export interface PersistentGameServices {
  readonly save: SaveService;
  readonly achievements: AchievementService;
  readonly autosave?: { tick(deltaSeconds: number): void };
}
export function createPersistentServices(
  project: string,
  settings: PersistenceSettings,
  backend?: SaveBackend,
): PersistentGameServices {
  const validated = PersistenceSettingsSchema.parse(settings),
    save = new SaveService(project, validated.version, backend),
    achievements = new AchievementService(validated.achievements);
  save.register('protomake', 'protomake.achievements', {
    capture: () => achievements.capture(),
    restore: (value) => achievements.restore(value),
  });
  if (!validated.autosave) return { save, achievements };
  let elapsed = 0,
    pending = false;
  return {
    save,
    achievements,
    autosave: {
      tick: (deltaSeconds) => {
        elapsed += deltaSeconds;
        if (elapsed < 30 || pending) return;
        elapsed = 0;
        pending = true;
        void save
          .save('default', 'auto')
          .catch(() => undefined)
          .finally(() => {
            pending = false;
          });
      },
    },
  };
}
