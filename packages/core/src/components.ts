import type { EntityId } from './identity';
export interface Schema<T> {
  parse(value: unknown): T;
}
export interface InspectorField {
  readonly path: string;
  readonly label: string;
  readonly options?: readonly string[];
  readonly help?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly kind:
    | 'number'
    | 'boolean'
    | 'string'
    | 'color'
    | 'asset'
    | 'enum'
    | 'entity'
    | 'mask';
}
export interface ComponentDefinition<T> {
  readonly type: string;
  readonly displayName: string;
  readonly defaults: () => T;
  readonly schema: Schema<T>;
  readonly inspector: readonly InspectorField[];
}
export class ComponentRegistry {
  private readonly definitions = new Map<
    string,
    ComponentDefinition<unknown>
  >();
  register<T>(definition: ComponentDefinition<T>): void {
    if (!/^[a-z][a-z0-9.-]+$/.test(definition.type))
      throw new Error(`Invalid component type: ${definition.type}`);
    if (this.definitions.has(definition.type))
      throw new Error(`Duplicate component type: ${definition.type}`);
    definition.schema.parse(definition.defaults());
    this.definitions.set(
      definition.type,
      Object.freeze({
        ...definition,
        inspector: Object.freeze([...definition.inspector]),
      }),
    );
  }
  get(type: string): ComponentDefinition<unknown> {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Unknown component type: ${type}`);
    return definition;
  }
  all(): readonly ComponentDefinition<unknown>[] {
    return [...this.definitions.values()];
  }
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}
/** Sparse per-type storage. Values are immutable snapshots; writes validate and detach input. */
export class ComponentStore<T> {
  private readonly values = new Map<EntityId, T>();
  constructor(private readonly schema: Schema<T>) {}
  set(id: EntityId, value: unknown): void {
    this.values.set(id, freezeDeep(structuredClone(this.schema.parse(value))));
  }
  get(id: EntityId): T | undefined {
    return this.values.get(id);
  }
  has(id: EntityId): boolean {
    return this.values.has(id);
  }
  delete(id: EntityId): void {
    this.values.delete(id);
  }
  entries(): IterableIterator<[EntityId, T]> {
    return this.values.entries();
  }
}
