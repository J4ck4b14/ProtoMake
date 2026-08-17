import { z } from 'zod';
import {
  GUID_PATTERN,
  World,
  TransformComponent,
  type ComponentRegistry,
  type Guid,
} from '@protomake/core';
import { MigrationChain } from './migrations';
export const SCENE_SCHEMA_VERSION = 1;
export const GuidSchema = z
  .string()
  .regex(GUID_PATTERN, 'Expected canonical UUID');
const EntitySchema = z.strictObject({
  id: GuidSchema,
  name: z.string(),
  enabled: z.boolean(),
  parent: GuidSchema.nullable(),
  components: z.record(z.string(), z.json()),
});
export const SceneSchema = z.strictObject({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  id: GuidSchema,
  name: z.string(),
  entities: z.array(EntitySchema),
});
export type SceneData = z.infer<typeof SceneSchema>;
export const sceneMigrations = new MigrationChain(SCENE_SCHEMA_VERSION);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
export function deterministicJSON(value: unknown): string {
  return JSON.stringify(canonical(value), null, 2) + '\n';
}
export function validateScene(
  input: unknown,
  registry: ComponentRegistry,
): SceneData {
  const scene = SceneSchema.parse(sceneMigrations.run(input));
  const parents = new Map<Guid, Guid | null>();
  for (const entity of scene.entities) {
    if (parents.has(entity.id))
      throw new Error(`Scene ${scene.name}: duplicate entity ${entity.id}`);
    parents.set(entity.id, entity.parent);
    if (!Object.hasOwn(entity.components, TransformComponent.type))
      throw new Error(
        `Entity ${entity.name} (${entity.id}): missing Transform`,
      );
    for (const [type, value] of Object.entries(entity.components)) {
      try {
        registry.get(type).schema.parse(value);
      } catch (error) {
        throw new Error(
          `Entity ${entity.name} (${entity.id}), component ${type}: ${String(error)}`,
          { cause: error },
        );
      }
    }
  }
  const done = new Set<Guid>();
  for (const entity of scene.entities) {
    const path = new Set<Guid>();
    let cursor: Guid | null = entity.id;
    while (cursor !== null && !done.has(cursor)) {
      if (path.has(cursor))
        throw new Error(
          `Entity ${entity.name} (${entity.id}): cyclic hierarchy`,
        );
      if (!parents.has(cursor))
        throw new Error(
          `Entity ${entity.name} (${entity.id}): missing parent ${cursor}`,
        );
      path.add(cursor);
      cursor = parents.get(cursor)!;
    }
    for (const id of path) done.add(id);
  }
  return scene;
}
export function captureScene(
  world: World,
  metadata: { id: Guid; name: string },
): SceneData {
  return validateScene(
    {
      schemaVersion: SCENE_SCHEMA_VERSION,
      ...metadata,
      entities: [...world.all()]
        .map((entity) => ({
          id: entity.guid,
          name: entity.name,
          enabled: entity.enabled,
          parent: entity.parent === null ? null : world.get(entity.parent).guid,
          components: Object.fromEntries(world.components(entity.id)),
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    },
    world.registry,
  );
}
export function instantiateScene(
  input: unknown,
  registry: ComponentRegistry,
): { world: World; scene: SceneData } {
  // Validate the complete document before creating a fresh world. The caller's world is untouched.
  const scene = validateScene(input, registry),
    world = new World(registry);
  for (const entity of scene.entities) {
    const id = world.create(entity.name, entity.id);
    world.setEnabled(id, entity.enabled);
    for (const [type, value] of Object.entries(entity.components)) {
      if (type === TransformComponent.type) world.set(id, type, value);
      else world.add(id, type, value);
    }
  }
  for (const entity of scene.entities)
    if (entity.parent !== null)
      world.setParent(world.find(entity.id)!, world.find(entity.parent)!);
  return { world, scene };
}
export function serializeScene(
  world: World,
  metadata: { id: Guid; name: string },
): string {
  return deterministicJSON(captureScene(world, metadata));
}
export function deserializeScene(
  json: string,
  registry: ComponentRegistry,
): { world: World; scene: SceneData } {
  return instantiateScene(JSON.parse(json) as unknown, registry);
}
