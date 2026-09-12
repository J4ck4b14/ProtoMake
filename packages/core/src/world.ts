import {
  ComponentRegistry,
  ComponentStore,
  type ComponentDefinition,
} from './components';
import { assertGuid, guid, type EntityId, type Guid } from './identity';
import { IDENTITY, inverse, matrix, multiply, type Matrix2D } from './math';
const tagPattern = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
export interface TagsData {
  readonly values: readonly string[];
}
export const Tags: ComponentDefinition<TagsData> = {
  type: 'protomake.tags',
  displayName: 'Tags',
  defaults: () => ({ values: [] }),
  schema: {
    parse(value: unknown): TagsData {
      if (
        !value ||
        typeof value !== 'object' ||
        !('values' in value) ||
        !Array.isArray(value.values) ||
        !value.values.every(
          (tag) => typeof tag === 'string' && tagPattern.test(tag),
        ) ||
        new Set(value.values).size !== value.values.length
      )
        throw new Error('Tags: expected unique identifier-like names');
      return { values: [...value.values] };
    },
  },
  inspector: [],
};
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
  registry.register(Tags);
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
  private readonly tagIndex = new Map<string, Set<EntityId>>();
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
    if (type === Tags.type) this.indexTags(id, undefined, store.get(id));
  }
  set(id: EntityId, type: string, value: unknown): void {
    this.get(id);
    const store = this.store(type);
    if (!store.has(id)) throw new Error(`Entity ${id} has no ${type}`);
    const previous = store.get(id);
    store.set(id, value);
    if (type === Tags.type) this.indexTags(id, previous, store.get(id));
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
  withTag(tag: string): readonly EntityId[] {
    return [...(this.tagIndex.get(tag) ?? [])].filter((id) => this.has(id));
  }
  withComponent(type: string): readonly EntityId[] {
    this.registry.get(type);
    return [...this.store(type).entries()].map(([id]) => id);
  }
  withComponents(...types: readonly string[]): readonly EntityId[] {
    if (!types.length) return [...this.entities.keys()];
    const stores = types.map((type) => {
      this.registry.get(type);
      return this.store(type);
    });
    return [...stores[0]!.entries()]
      .map(([id]) => id)
      .filter((id) => stores.slice(1).every((store) => store.has(id)));
  }
  closestWithTag(
    tag: string,
    position: readonly [number, number],
  ): EntityId | undefined {
    if (!position.every(Number.isFinite))
      throw new Error('Position must be finite');
    let closest: EntityId | undefined,
      best = Infinity;
    for (const id of this.withTag(tag)) {
      const [x, y] = this.worldPosition(id),
        distance = (x - position[0]) ** 2 + (y - position[1]) ** 2;
      if (distance < best) {
        best = distance;
        closest = id;
      }
    }
    return closest;
  }
  inRadius(
    position: readonly [number, number],
    radius: number,
  ): readonly EntityId[] {
    if (
      !position.every(Number.isFinite) ||
      !Number.isFinite(radius) ||
      radius < 0
    )
      throw new Error(
        'Radius query expects a finite position and non-negative radius',
      );
    const squared = radius * radius;
    return [...this.entities.keys()].filter((id) => {
      const [x, y] = this.worldPosition(id);
      return (x - position[0]) ** 2 + (y - position[1]) ** 2 <= squared;
    });
  }
  remove(id: EntityId, type: string): void {
    this.get(id);
    if (type === TransformComponent.type)
      throw new Error('Transform is required');
    this.registry.get(type);
    if (type === Tags.type)
      this.indexTags(id, this.stores.get(type)?.get(id), undefined);
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
      this.indexTags(
        target,
        this.stores.get(Tags.type)?.get(target),
        undefined,
      );
      for (const store of this.stores.values()) store.delete(target);
      this.childIndex.delete(target);
      this.entities.delete(target);
    }
  }
  private indexTags(id: EntityId, before: unknown, after: unknown): void {
    const previous = (before as TagsData | undefined)?.values ?? [],
      next = (after as TagsData | undefined)?.values ?? [];
    for (const tag of previous)
      if (!next.includes(tag)) {
        const group = this.tagIndex.get(tag);
        group?.delete(id);
        if (group?.size === 0) this.tagIndex.delete(tag);
      }
    for (const tag of next)
      if (!previous.includes(tag)) {
        let group = this.tagIndex.get(tag);
        if (!group) {
          group = new Set();
          this.tagIndex.set(tag, group);
        }
        group.add(id);
      }
  }
}
