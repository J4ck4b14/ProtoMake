import { z } from 'zod';
import type { ComponentDefinition } from '@protomake/core';
const Schema = z.strictObject({
  script: z.string(),
  values: z.record(
    z.string(),
    z.union([z.string(), z.number().finite(), z.boolean()]),
  ),
});
export type ScriptData = z.infer<typeof Schema>;
export const ScriptBehaviour: ComponentDefinition<ScriptData> = {
  type: 'protomake.script',
  displayName: 'Script Behaviour',
  schema: Schema,
  defaults: () => ({ script: '', values: {} }),
  inspector: [{ path: 'script', label: 'Script', kind: 'asset' }],
};

const PerceptionSchema = z.strictObject({
  target: z.string(),
  range: z.number().finite().nonnegative(),
  fovDegrees: z.number().finite().min(1).max(360),
  illuminationThreshold: z.number().finite().min(0).max(1),
  debug: z.boolean(),
});
export type PerceptionData = z.infer<typeof PerceptionSchema>;
/** Optional authoring/debug configuration for visibility-driven detection. Scripts remain in control of alert state. */
export const Perception2D: ComponentDefinition<PerceptionData> = {
  type: 'protomake.perception',
  displayName: 'Perception 2D',
  schema: PerceptionSchema,
  defaults: () => ({
    target: '',
    range: 450,
    fovDegrees: 90,
    illuminationThreshold: 0.6,
    debug: true,
  }),
  inspector: [
    { path: 'target', label: 'Target', kind: 'entity' },
    { path: 'range', label: 'View range', kind: 'number', min: 0, step: 10 },
    {
      path: 'fovDegrees',
      label: 'View angle',
      kind: 'number',
      min: 1,
      max: 360,
      step: 1,
    },
    {
      path: 'illuminationThreshold',
      label: 'Light threshold',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
    { path: 'debug', label: 'Debug preview', kind: 'boolean' },
  ],
};

export interface ScriptField {
  type: 'number' | 'boolean' | 'string' | 'color' | 'entity' | 'asset';
  default: string | number | boolean;
  /** Optional authoring metadata; runtime values stay plain serializable primitives. */
  label?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export type ScriptFields = Record<string, ScriptField>;
