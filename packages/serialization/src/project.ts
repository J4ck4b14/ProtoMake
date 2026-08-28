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
export const PROJECT_SCHEMA_VERSION = 3;
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
export function createProject(name: string): ProjectData {
  return ProjectSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: guid(),
    name,
    engineVersion: '0.1.0',
    startupScene: null,
    scenes: [],
    assets: [],
    physics: defaultPhysics(),
    input: defaultInput(),
  });
}
export function validateProject(
  input: unknown,
  registry: ComponentRegistry,
): ProjectData {
  const project = ProjectSchema.parse(projectMigrations.run(input)),
    ids = new Set<string>();
  for (const scene of project.scenes) {
    validateScene(scene, registry);
    if (ids.has(scene.id))
      throw new Error(`Project ${project.name}: duplicate scene ${scene.id}`);
    ids.add(scene.id);
  }
  if (project.startupScene !== null && !ids.has(project.startupScene))
    throw new Error(
      `Project ${project.name}: missing startup scene ${project.startupScene}`,
    );
  const database = new AssetDatabase(project.assets);
  const missing = database.missing(assetReferences(project.scenes, registry));
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
