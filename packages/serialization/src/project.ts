import { z } from 'zod';
import { guid, type ComponentRegistry } from '@protomake/core';
import {
  GuidSchema,
  SceneSchema,
  deterministicJSON,
  validateScene,
} from './scene';
import { MigrationChain } from './migrations';
export const PROJECT_SCHEMA_VERSION = 1;
export const ProjectSchema = z.strictObject({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: GuidSchema,
  name: z.string().min(1),
  engineVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  startupScene: GuidSchema.nullable(),
  scenes: z.array(SceneSchema),
});
export type ProjectData = z.infer<typeof ProjectSchema>;
export const projectMigrations = new MigrationChain(PROJECT_SCHEMA_VERSION);
export function createProject(name: string): ProjectData {
  return ProjectSchema.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: guid(),
    name,
    engineVersion: '0.1.0',
    startupScene: null,
    scenes: [],
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
