import { animationAssets, CONTROLLER_MIME } from '@protomake/animation';
import { MixerSchema, defaultMixer } from '@protomake/audio';
import {
  PREFAB_MIME,
  validatePrefab,
  validateLinks,
  propagatePrefab,
} from '@protomake/prefabs';
import { PhysicsSettingsSchema, defaultPhysics } from '@protomake/physics2d';
import { InputMapSchema, defaultInput } from '@protomake/input';
import {
  AssetSchema,
  AssetDatabase,
  SPRITE_REGION_MIME,
  SpriteRegionSchema,
  assetReferences,
} from '@protomake/assets';
import { TILESET_MIME, TileSetSchema } from '@protomake/tilemap';
import { z } from 'zod';
import {
  PersistenceSettingsSchema,
  defaultPersistence,
} from '@protomake/persistence';
import { guid, type ComponentRegistry } from '@protomake/core';
import {
  BehaviourGraphSchema,
  GRAPH_MIME,
  coreNodeRegistry,
} from '@protomake/graphs';
import {
  GuidSchema,
  SceneSchema,
  deterministicJSON,
  validateScene,
} from './scene';
import { MigrationChain } from './migrations';
export const PROJECT_SCHEMA_VERSION = 11;
export const ProjectSchema = z.strictObject({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: GuidSchema,
  name: z.string().min(1),
  engineVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  startupScene: GuidSchema.nullable(),
  scenes: z.array(SceneSchema),
  assets: z.array(AssetSchema),
  physics: PhysicsSettingsSchema,
  input: InputMapSchema,
  mixer: MixerSchema,
  folders: z.array(z.string()),
  sceneFolders: z.record(z.string(), z.string()),
  persistence: PersistenceSettingsSchema,
});
export type ProjectData = z.infer<typeof ProjectSchema>;
export const projectMigrations = new MigrationChain(PROJECT_SCHEMA_VERSION);
projectMigrations.register(1, (input) => ({
  ...(input as object),
  schemaVersion: 2,
  assets: [],
}));
projectMigrations.register(2, (input) => ({
  ...(input as object),
  schemaVersion: 3,
  physics: defaultPhysics(),
  input: defaultInput(),
}));
projectMigrations.register(3, (input) => ({
  ...(input as object),
  schemaVersion: 4,
  mixer: defaultMixer(),
  folders: ['Assets', 'Scenes'],
  sceneFolders: {},
}));
projectMigrations.register(4, (input) => {
  const project = input as {
    engineVersion?: string;
    schemaVersion: number;
    scenes?: unknown[];
    assets?: { mime?: string; data?: string }[];
  };
  const migrateScene = (candidate: unknown): void => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('entities' in candidate)
    )
      return;
    const entities = (candidate as { entities?: unknown }).entities;
    if (!Array.isArray(entities)) return;
    for (const entity of entities) {
      if (!entity || typeof entity !== 'object' || !('components' in entity))
        continue;
      const components = (entity as { components?: unknown }).components;
      if (
        !components ||
        typeof components !== 'object' ||
        Array.isArray(components)
      )
        continue;
      const record = components as Record<string, unknown>,
        legacy = record['protomake.script'];
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        const item = legacy as { script?: unknown; values?: unknown };
        record['protomake.behaviours'] = {
          order: ['script'],
          items: {
            script: {
              id: 'script',
              kind: 'script',
              enabled: true,
              script: typeof item.script === 'string' ? item.script : '',
              values:
                item.values &&
                typeof item.values === 'object' &&
                !Array.isArray(item.values)
                  ? item.values
                  : {},
            },
          },
        };
        delete record['protomake.script'];
      }
      const link = record['protomake.prefab'];
      if (
        link &&
        typeof link === 'object' &&
        !Array.isArray(link) &&
        'overrides' in link &&
        Array.isArray(link.overrides)
      )
        for (const override of link.overrides)
          if (
            override &&
            typeof override === 'object' &&
            'path' in override &&
            Array.isArray(override.path)
          ) {
            const index = override.path.indexOf('protomake.script');
            if (index >= 0)
              override.path.splice(
                index,
                1,
                'protomake.behaviours',
                'items',
                'script',
              );
          }
    }
  };
  for (const scene of project.scenes ?? []) migrateScene(scene);
  for (const asset of project.assets ?? [])
    if (asset.mime === PREFAB_MIME && typeof asset.data === 'string') {
      const document = JSON.parse(asset.data) as unknown;
      migrateScene(document);
      asset.data = JSON.stringify(document);
    }
  project.schemaVersion = 5;
  project.engineVersion = '0.10.0';
  return project;
});
projectMigrations.register(5, (input) => ({
  ...(input as object),
  schemaVersion: 6,
  engineVersion: '0.11.0',
}));
projectMigrations.register(6, (input) => ({
  ...(input as object),
  schemaVersion: 7,
  engineVersion: '0.12.0',
  persistence: defaultPersistence(),
}));
projectMigrations.register(7, (input) => ({
  ...(input as object),
  schemaVersion: 8,
  engineVersion: '0.13.0',
}));
projectMigrations.register(8, (input) => ({
  ...(input as object),
  schemaVersion: 9,
  engineVersion: '0.14.0',
}));
projectMigrations.register(9, (input) => ({
  ...(input as object),
  schemaVersion: 10,
  engineVersion: '0.15.0',
}));
projectMigrations.register(10, (input) => ({
  ...(input as object),
  schemaVersion: 11,
  engineVersion: '0.16.0',
}));
export function createProject(name: string): ProjectData {
  return ProjectSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: guid(),
    name,
    engineVersion: '0.16.1',
    startupScene: null,
    scenes: [],
    assets: [],
    physics: defaultPhysics(),
    input: defaultInput(),
    mixer: defaultMixer(),
    folders: ['Assets', 'Scenes'],
    sceneFolders: {},
    persistence: defaultPersistence(),
  });
}
export function validateProject(
  input: unknown,
  registry: ComponentRegistry,
): ProjectData {
  const project = ProjectSchema.parse(projectMigrations.run(input)),
    ids = new Set<string>();
  validateFolders(project);
  for (const achievement of project.persistence.achievements)
    if (
      achievement.icon &&
      !project.assets.some(
        (asset) => asset.id === achievement.icon && asset.kind === 'image',
      )
    )
      throw new Error(`Achievement ${achievement.id}: invalid icon asset`);
  animationAssets(project.assets);
  for (const asset of project.assets) {
    if (asset.mime === SPRITE_REGION_MIME) {
      const region = SpriteRegionSchema.parse(JSON.parse(asset.data)),
        source = project.assets.find(
          (candidate) => candidate.id === region.source,
        );
      if (!source || source.kind !== 'image')
        throw new Error(`${asset.path}: missing sprite source image`);
      if (
        region.x + region.width > source.width ||
        region.y + region.height > source.height
      )
        throw new Error(`${asset.path}: sprite region exceeds source image`);
    }
    if (asset.mime === TILESET_MIME) {
      const tileset = TileSetSchema.parse(JSON.parse(asset.data));
      for (const tile of tileset.tiles)
        for (const texture of [
          tile.texture,
          ...tile.animation.map((frame) => frame.texture),
        ])
          if (
            !project.assets.some(
              (candidate) =>
                candidate.id === texture &&
                (candidate.kind === 'image' ||
                  candidate.mime === SPRITE_REGION_MIME),
            )
          )
            throw new Error(`${asset.path}/${tile.name}: missing tile texture`);
    }
  }
  const graphRegistry = coreNodeRegistry();
  for (const asset of project.assets)
    if (asset.mime === GRAPH_MIME) {
      const graph = BehaviourGraphSchema.parse(JSON.parse(asset.data)),
        diagnostics = graphRegistry.validate(graph);
      if (diagnostics.length)
        throw new Error(
          `${asset.path}: ${diagnostics.map((item) => item.message).join('; ')}`,
        );
      for (const node of graph.nodes)
        if (node.type === 'prefab.spawn') {
          const prefab = node.properties.prefab;
          if (
            prefab &&
            (typeof prefab !== 'string' ||
              !project.assets.some(
                (candidate) =>
                  candidate.id === prefab && candidate.mime === PREFAB_MIME,
              ))
          )
            throw new Error(
              `${asset.path}: missing prefab reference on ${node.id}`,
            );
        }
    }
  const bases = new Map(
    project.assets
      .filter((a) => a.mime === PREFAB_MIME)
      .map((a) => {
        const base = validateScene(JSON.parse(a.data), registry);
        validatePrefab(base);
        a.data = deterministicJSON(base);
        return [a.id, base] as const;
      }),
  );
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex++) {
    let scene = validateScene(project.scenes[sceneIndex], registry);
    project.scenes[sceneIndex] = scene;
    validateLinks(scene, bases);
    for (const [id, base] of bases) propagatePrefab(scene, id, base);
    scene = validateScene(scene, registry);
    project.scenes[sceneIndex] = scene;
    for (const entity of scene.entities) {
      const animator = entity.components['protomake.animator'] as
        | { controller?: string }
        | undefined;
      if (animator?.controller && !entity.components['protomake.sprite'])
        throw new Error('Animator requires Sprite Renderer');
    }
    for (const entity of scene.entities)
      for (const [type, data] of Object.entries(entity.components)) {
        if (
          type === 'protomake.animator' &&
          data &&
          typeof data === 'object' &&
          'controller' in data &&
          data.controller &&
          !project.assets.some(
            (a) => a.id === data.controller && a.mime === CONTROLLER_MIME,
          )
        )
          throw new Error('Invalid Animator controller asset');
        if (type === 'protomake.audio-source' && data && typeof data === 'object') {
          if (
            'clip' in data &&
            data.clip &&
            !project.assets.some(
              (a) => a.id === data.clip && a.kind === 'audio',
            )
          )
            throw new Error('Invalid AudioClip asset');
          if ('bus' in data && !project.mixer.some((b) => b.name === data.bus))
            throw new Error('Missing audio mixer bus');
        }
        if (
          type.endsWith('-collider') &&
          data &&
          typeof data === 'object' &&
          'layer' in data &&
          typeof data.layer === 'number' &&
          data.layer >= project.physics.layers.length
        )
          throw new Error(
            `${scene.name}/${entity.name}: physics layer ${data.layer} is not defined`,
          );
        if (
          (type === 'protomake.sprite' ||
            type === 'protomake.particle-emitter' ||
            type === 'protomake.ui-image' ||
            type === 'protomake.behaviours') &&
          data &&
          typeof data === 'object'
        ) {
          const references: { id: unknown; mime: string }[] =
            'texture' in data
              ? [{ id: data.texture, mime: 'image' }]
              : 'items' in data && data.items && typeof data.items === 'object'
                ? Object.values(data.items).map((item) =>
                    item && typeof item === 'object' && 'script' in item
                      ? { id: item.script, mime: 'text/typescript' }
                      : item && typeof item === 'object' && 'graph' in item
                        ? { id: item.graph, mime: GRAPH_MIME }
                        : { id: '', mime: '' },
                  )
                : [];
          for (const reference of references)
            if (reference.id) {
              const asset = project.assets.find((a) => a.id === reference.id);
              if (
                asset &&
                (((type === 'protomake.sprite' ||
                  type === 'protomake.particle-emitter' ||
                  type === 'protomake.ui-image') &&
                  asset.kind !== 'image' &&
                  asset.mime !== SPRITE_REGION_MIME) ||
                  (type === 'protomake.behaviours' &&
                    asset.mime !== reference.mime))
              )
                throw new Error(
                  `${scene.name}/${entity.name}: incompatible asset type on ${type}`,
                );
            }
        }
      }
    if (ids.has(scene.id))
      throw new Error(`Project ${project.name}: duplicate scene ${scene.id}`);
    ids.add(scene.id);
  }
  if (project.startupScene !== null && !ids.has(project.startupScene))
    throw new Error(
      `Project ${project.name}: missing startup scene ${project.startupScene}`,
    );
  const database = new AssetDatabase(project.assets);
  const documents = [...project.scenes, ...bases.values()],
    behaviourReferences = documents.flatMap((scene) =>
      scene.entities.flatMap((entity) => {
        const data = entity.components['protomake.behaviours'];
        if (
          !data ||
          typeof data !== 'object' ||
          !('items' in data) ||
          !data.items ||
          typeof data.items !== 'object'
        )
          return [];
        return Object.values(data.items).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const record = item as Record<string, unknown>,
            field =
              'script' in record
                ? 'script'
                : 'graph' in record
                  ? 'graph'
                  : undefined,
            asset =
              field && typeof record[field] === 'string' ? record[field] : '';
          return asset
            ? [
                {
                  scene: scene.name,
                  entity: entity.name,
                  component: 'protomake.behaviours',
                  path: `items.${'id' in item ? String(item.id) : 'unknown'}.${field}`,
                  asset,
                },
              ]
            : [];
        });
      }),
    ),
    missing = database.missing([
      ...assetReferences(documents, registry),
      ...behaviourReferences,
    ]);
  if (missing.length)
    throw new Error(
      `Missing asset ${missing[0]!.asset} on ${missing[0]!.scene}/${missing[0]!.entity}`,
    );
  return project;
}
export function serializeProject(
  project: ProjectData,
  registry: ComponentRegistry,
): string {
  return deterministicJSON(validateProject(project, registry));
}
export function deserializeProject(
  json: string,
  registry: ComponentRegistry,
): ProjectData {
  return validateProject(JSON.parse(json) as unknown, registry);
}

export function validateFolders(
  project: Pick<ProjectData, 'folders' | 'assets' | 'sceneFolders' | 'scenes'>,
): void {
  const valid = (p: string) =>
    p.length > 0 &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !p.split('/').some((s) => !s || s === '.' || s === '..');
  const paths = new Set<string>();
  for (const folder of project.folders) {
    if (!valid(folder) || paths.has(folder.toLowerCase()))
      throw new Error('Invalid or duplicate folder');
    paths.add(folder.toLowerCase());
  }
  for (const folder of project.folders)
    for (const asset of project.assets)
      if (folder.toLowerCase().startsWith(asset.path.toLowerCase() + '/'))
        throw new Error('A file cannot contain a folder');
  for (const asset of project.assets) {
    if (paths.has(asset.path.toLowerCase()))
      throw new Error('A file and folder cannot share a path');
    for (const other of project.assets)
      if (
        other.id !== asset.id &&
        other.path.toLowerCase().startsWith(asset.path.toLowerCase() + '/')
      )
        throw new Error('A file cannot contain another file');
  }
  for (const [id, path] of Object.entries(project.sceneFolders))
    if (
      !project.scenes.some((s) => s.id === id) ||
      !project.folders.includes(path)
    )
      throw new Error('Invalid scene folder');
}
