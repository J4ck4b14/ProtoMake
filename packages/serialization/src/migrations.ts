/** Each migration advances exactly one schema version. No historical schemas are invented. */
export class MigrationChain {
  private readonly steps = new Map<number, (input: unknown) => unknown>();
  constructor(readonly currentVersion: number) {
    if (!Number.isSafeInteger(currentVersion) || currentVersion < 1)
      throw new Error('Invalid current schema version');
  }
  register(from: number, migrate: (input: unknown) => unknown): void {
    if (
      !Number.isSafeInteger(from) ||
      from < 1 ||
      from >= this.currentVersion ||
      this.steps.has(from)
    )
      throw new Error(`Invalid or duplicate migration from v${from}`);
    this.steps.set(from, migrate);
  }
  run(input: unknown): unknown {
    let data: unknown = structuredClone(input),
      version = this.version(data);
    if (version > this.currentVersion)
      throw new Error(
        `Unsupported schema version ${version}; maximum is ${this.currentVersion}`,
      );
    while (version < this.currentVersion) {
      const step = this.steps.get(version);
      if (!step) throw new Error(`Missing migration from schema v${version}`);
      data = step(data);
      const next = this.version(data);
      if (next !== version + 1)
        throw new Error(`Migration v${version} must produce v${version + 1}`);
      version = next;
    }
    return data;
  }
  private version(data: unknown): number {
    if (
      !data ||
      typeof data !== 'object' ||
      !('schemaVersion' in data) ||
      typeof data.schemaVersion !== 'number' ||
      !Number.isSafeInteger(data.schemaVersion) ||
      data.schemaVersion < 1
    )
      throw new Error('Missing or invalid schemaVersion');
    return data.schemaVersion;
  }
}
