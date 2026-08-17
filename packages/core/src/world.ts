import {
  ComponentRegistry,
  ComponentStore,
  type ComponentDefinition,
} from './components';
import { assertGuid, guid, type EntityId, type Guid } from './identity';
import { IDENTITY, inverse, matrix, multiply, type Matrix2D } from './math';
export interface Transform {
  readonly local: Matrix2D;
}
export const TransformComponent: ComponentDefinition<Transform> = {
  type: 'protomake.transform',
  displayName: 'Transform',
  defaults: () => ({ local: IDENTITY }),
  schema: {
    parse(value: unknown): Transform {
      if (
        !value ||
        typeof value !== 'object' ||
        !('local' in value) ||
        Object.keys(value).length !== 1
      )
        throw new Error('Transform: expected { local: Matrix2D }');
      return { local: matrix(value.local) };
    },
  },
  inspector: ['a', 'b', 'c', 'd', 'x', 'y'].map((label, index) => ({
    path: `local.${index}`,
    label,
    kind: 'number',
  })),
};
export function createRegistry(): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register(TransformComponent);
  return registry;
}
export interface Entity {
  readonly id: EntityId;
  readonly guid: Guid;
  readonly name: string;
  readonly enabled: boolean;
  readonly parent: EntityId | null;
}
/** Numeric IDs never recycle within a world. All public writes enforce liveness. */
export class World {
  private nextId = 1;
  private readonly entities = new Map<EntityId, Entity>();
  private readonly identities = new Map<Guid, EntityId>();
  private readonly stores = new Map<string, ComponentStore<unknown>>();
  private readonly childIndex = new Map<EntityId, Set<EntityId>>();
  constructor(readonly registry: ComponentRegistry) {
    registry.get(TransformComponent.type);
  }
  create(name = 'Entity', stableId = guid()): EntityId {
    assertGuid(stableId);
    if (this.identities.has(stableId))
      throw new Error(`Duplicate entity GUID: ${stableId}`);
    if (typeof name !== 'string')
      throw new Error('Entity name must be a string');
    if (!Number.isSafeInteger(this.nextId))
      throw new Error('Entity ID space exhausted');
    const id = this.nextId++;
    this.entities.set(
      id,
      Object.freeze({ id, guid: stableId, name, enabled: true, parent: null }),
    );
    this.identities.set(stableId, id);
    this.childIndex.set(id, new Set());
    this.add(id, TransformComponent.type);
    return id;
  }
  get(id: EntityId): Entity {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Entity ${id} does not exist in this world`);
    return entity;
  }
  has(id: EntityId): boolean {
    return this.entities.has(id);
  }
  find(stableId: Guid): EntityId | undefined {
    return this.identities.get(stableId);
  }
  all(): IterableIterator<Entity> {
    return this.entities.values();
  }
  children(id: EntityId): readonly EntityId[] {
    this.get(id);
    return [...(this.childIndex.get(id) ?? [])];
  }
  rename(id: EntityId, name: string): void {
    if (typeof name !== 'string')
      throw new Error('Entity name must be a string');
    this.entities.set(id, Object.freeze({ ...this.get(id), name }));
  }
  setEnabled(id: EntityId, enabled: boolean): void {
    if (typeof enabled !== 'boolean')
      throw new Error('Enabled must be boolean');
    this.entities.set(id, Object.freeze({ ...this.get(id), enabled }));
  }
  isActive(id: EntityId): boolean {
    let current: EntityId | null = id;
    while (current !== null) {
      const e = this.get(current);
      if (!e.enabled) return false;
      current = e.parent;
    }
    return true;
  }
  private store(type: string): ComponentStore<unknown> {
    let store = this.stores.get(type);
    if (!store) {
      store = new ComponentStore(this.registry.get(type).schema);
      this.stores.set(type, store);
    }
    return store;
  }
  add(id: EntityId, type: string, value?: unknown): void {
    this.get(id);
    const store = this.store(type);
    if (store.has(id)) throw new Error(`Entity ${id} already has ${type}`);
    store.set(
      id,
      value === undefined ? this.registry.get(type).defaults() : value,
    );
  }
  set(id: EntityId, type: string, value: unknown): void {
    this.get(id);
    const store = this.store(type);
    if (!store.has(id)) throw new Error(`Entity ${id} has no ${type}`);
    store.set(id, value);
  }
  read<T>(id: EntityId, definition: ComponentDefinition<T>): T | undefined {
    this.get(id);
    if (this.registry.get(definition.type).schema !== definition.schema)
      throw new Error(`Component definition mismatch: ${definition.type}`);
    return this.stores.get(definition.type)?.get(id) as T | undefined;
  }
  components(id: EntityId): ReadonlyMap<string, unknown> {
    this.get(id);
    return new Map(
      [...this.stores]
        .filter(([, s]) => s.has(id))
        .map(([type, s]) => [type, s.get(id)]),
    );
  }
  query(type: string): IterableIterator<[EntityId, unknown]> {
    return this.store(type).entries();
  }
  remove(id: EntityId, type: string): void {
    this.get(id);
    if (type === TransformComponent.type)
      throw new Error('Transform is required');
    this.registry.get(type);
    this.stores.get(type)?.delete(id);
  }
  localMatrix(id: EntityId): Matrix2D {
    const value = this.read(id, TransformComponent);
    if (!value) throw new Error(`Entity ${id} has no Transform`);
    return value.local;
  }
  setLocalMatrix(id: EntityId, local: Matrix2D): void {
    this.set(id, TransformComponent.type, { local });
  }
  worldMatrix(id: EntityId): Matrix2D {
    const chain: EntityId[] = [];
    let current: EntityId | null = id;
    while (current !== null) {
      chain.push(current);
      current = this.get(current).parent;
    }
    let result = IDENTITY;
    for (let i = chain.length - 1; i >= 0; i--)
      result = multiply(result, this.localMatrix(chain[i]!));
    return result;
  }
  worldPosition(id: EntityId): readonly [number, number] {
    const m = this.worldMatrix(id);
    return [m[4], m[5]];
  }
  setParent(
    id: EntityId,
    parent: EntityId | null,
    mode: 'local' | 'world' = 'local',
  ): void {
    const entity = this.get(id);
    let cursor = parent;
    while (cursor !== null) {
      if (cursor === id) throw new Error(`Cyclic hierarchy at entity ${id}`);
      cursor = this.get(cursor).parent;
    }
    if (entity.parent === parent) return;
    // Compute before mutation: a singular parent must not leave a partially changed hierarchy.
    const local =
      mode === 'world'
        ? parent === null
          ? this.worldMatrix(id)
          : multiply(inverse(this.worldMatrix(parent)), this.worldMatrix(id))
        : this.localMatrix(id);
    this.setLocalMatrix(id, local);
    if (entity.parent !== null) this.childIndex.get(entity.parent)?.delete(id);
    if (parent !== null) this.childIndex.get(parent)?.add(id);
    this.entities.set(id, Object.freeze({ ...entity, parent }));
  }
  /** Destruction removes the entire subtree, including every associated component. */
  destroy(id: EntityId): void {
    const root = this.get(id),
      pending = [id],
      ordered: EntityId[] = [];
    while (pending.length) {
      const next = pending.pop()!;
      ordered.push(next);
      pending.push(...this.children(next));
    }
    if (root.parent !== null) this.childIndex.get(root.parent)?.delete(id);
    for (const target of ordered.reverse()) {
      this.identities.delete(this.get(target).guid);
      for (const store of this.stores.values()) store.delete(target);
      this.childIndex.delete(target);
      this.entities.delete(target);
    }
  }
}
