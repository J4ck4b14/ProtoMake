import {
  composeAffine,
  decompose,
  type ComponentRegistry,
  type Guid,
  type World,
} from '@protomake/core';
import type { AssetData } from '@protomake/assets';
import { instantiatePrefab, PREFAB_MIME } from '@protomake/prefabs';
import { validateScene } from '@protomake/serialization';
import type { RuntimePrefabService } from '@protomake/scripting';

export class RuntimePrefabs implements RuntimePrefabService {
  constructor(
    private readonly world: World,
    private readonly registry: ComponentRegistry,
    private readonly assets: readonly AssetData[],
  ) {}

  instantiate(
    prefab: string,
    options: {
      readonly position?: readonly [number, number];
      readonly rotation?: number;
      readonly parent?: Guid;
    } = {},
  ): Guid {
    const asset = this.assets.find(
      (candidate) => candidate.id === prefab && candidate.mime === PREFAB_MIME,
    );
    if (!asset) throw new Error(`Missing prefab asset ${prefab}`);
    const parent = options.parent ? this.world.find(options.parent) : undefined;
    if (options.parent && parent === undefined)
      throw new Error(`Missing parent entity ${options.parent}`);
    const base = validateScene(
        JSON.parse(asset.data) as unknown,
        this.registry,
      ),
      entities = instantiatePrefab(base, prefab),
      ids = new Map<string, number>();
    for (const entity of entities) {
      const id = this.world.create(entity.name, entity.id);
      ids.set(entity.id, id);
      this.world.setEnabled(id, entity.enabled);
      for (const [type, value] of Object.entries(entity.components))
        if (type === 'protomake.transform') this.world.set(id, type, value);
        else this.world.add(id, type, value);
    }
    for (const entity of entities)
      if (entity.parent !== null)
        this.world.setParent(ids.get(entity.id)!, ids.get(entity.parent)!);
    const rootEntity = entities.find((entity) => entity.parent === null)!,
      root = ids.get(rootEntity.id)!,
      parts = decompose(this.world.worldMatrix(root));
    if (options.position || options.rotation !== undefined) {
      const desired = composeAffine({
        ...parts,
        ...(options.position
          ? { x: options.position[0], y: options.position[1] }
          : {}),
        ...(options.rotation !== undefined
          ? { rotation: options.rotation }
          : {}),
      });
      this.world.setLocalMatrix(root, desired);
    }
    if (parent !== undefined) this.world.setParent(root, parent, 'world');
    return this.world.get(root).guid;
  }

  destroy(entity: Guid): void {
    const id = this.world.find(entity);
    if (id === undefined) throw new Error(`Missing entity reference ${entity}`);
    this.world.destroy(id);
  }
}
