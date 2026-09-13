import { Behaviours, Perception2D } from '@protomake/scripting';
import { PrefabLink } from '@protomake/prefabs';
import { Animator } from '@protomake/animation';
import { AudioSource } from '@protomake/audio';
import { registerPhysics } from '@protomake/physics2d';
import { ParticleEmitter2D, registerRendering } from '@protomake/renderer';
import { registerUi } from '@protomake/ui';
import { registerTilemap } from '@protomake/tilemap';
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
  registry.register(ParticleEmitter2D);
  registerPhysics(registry);
  registerUi(registry);
  registerTilemap(registry);
  registry.register(Behaviours);
  registry.register(Perception2D);
  registry.register(PrefabLink);
  registry.register(Animator);
  registry.register(AudioSource);
  return registry;
}
