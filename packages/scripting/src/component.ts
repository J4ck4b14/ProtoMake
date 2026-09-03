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
export interface ScriptField {
  type: 'number' | 'boolean' | 'string' | 'color' | 'entity' | 'asset';
  default: string | number | boolean;
}
export type ScriptFields = Record<string, ScriptField>;
