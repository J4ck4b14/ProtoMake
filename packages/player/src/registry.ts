import { ScriptBehaviour } from '@protomake/scripting';
import { PrefabLink } from '@protomake/prefabs';
import { Animator } from '@protomake/animation';
import { AudioSource } from '@protomake/audio';
import { registerPhysics } from '@protomake/physics2d';
import { registerRendering } from '@protomake/renderer';
import {
  createRegistry,
  type ComponentRegistry,
  type ComponentDefinition,
} from '@protomake/core';
export const NoteComponent: ComponentDefinition<{ text: string }> = {
  type: 'editor.note',
  displayName: 'Author note',
  defaults: () => ({ text: '' }),
  schema: {
    parse(value) {
      if (
        !value ||
        typeof value !== 'object' ||
        !('text' in value) ||
        typeof value.text !== 'string'
      )
        throw new Error('Note text must be a string');
      return { text: value.text };
    },
  },
  inspector: [{ path: 'text', label: 'Note', kind: 'string' }],
};
export function runtimeRegistry(): ComponentRegistry {
  const registry = createRegistry();
  registry.register(NoteComponent);
  registerRendering(registry);
  registerPhysics(registry);
  registry.register(ScriptBehaviour);
  registry.register(PrefabLink);
  registry.register(Animator);
  registry.register(AudioSource);
  return registry;
}
