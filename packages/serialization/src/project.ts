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
import { AssetSchema, AssetDatabase, assetReferences } from '@protomake/assets';
import { z } from 'zod';
import { guid, type ComponentRegistry } from '@protomake/core';
import {
  GuidSchema,
  SceneSchema,
  deterministicJSON,
  validateScene,
} from './scene';
import { MigrationChain } from './migrations';
export const PROJECT_SCHEMA_VERSION = 4;
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
export function createProject(name: string): ProjectData {
  return ProjectSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: guid(),
    name,
    engineVersion: '0.9.0',
    startupScene: null,
    scenes: [],
    assets: [],
    physics: defaultPhysics(),
    input: defaultInput(),
    mixer: defaultMixer(),
    folders: ['Assets', 'Scenes'],
    sceneFolders: {},
  });
}
export function validateProject(
  input: unknown,
  registry: ComponentRegistry,
): ProjectData {
  const project = ProjectSchema.parse(projectMigrations.run(input)),
    ids = new Set<string>();
  validateFolders(project);
  animationAssets(project.assets);
  const bases = new Map(
    project.assets
      .filter((a) => a.mime === PREFAB_MIME)
      .map((a) => {
        const base = validateScene(JSON.parse(a.data), registry);
        validatePrefab(base);
        return [a.id, base] as const;
      }),
  );
  for (const scene of project.scenes) {
    validateLinks(scene, bases);
    for (const [id, base] of bases) propagatePrefab(scene, id, base);
    validateScene(scene, registry);
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
          (type === 'protomake.sprite' || type === 'protomake.script') &&
          data &&
          typeof data === 'object'
        ) {
          const reference =
            'texture' in data
              ? data.texture
              : 'script' in data
                ? data.script
                : '';
          if (reference) {
            const asset = project.assets.find((a) => a.id === reference);
            if (
              asset &&
              ((type === 'protomake.sprite' && asset.kind !== 'image') ||
                (type === 'protomake.script' && asset.mime !== 'text/typescript'))
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
  const missing = database.missing(
    assetReferences([...project.scenes, ...bases.values()], registry),
  );
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
