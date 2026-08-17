# Component API

```ts
import { createRegistry, World } from '@protomake/core';
import type { ComponentDefinition } from '@protomake/core';

const Health: ComponentDefinition<{ value: number }> = {
  type: 'example.health',
  displayName: 'Health',
  defaults: () => ({ value: 100 }),
  inspector: [{ path: 'value', label: 'Value', kind: 'number' }],
  schema: {
    parse(input) {
      if (
        !input ||
        typeof input !== 'object' ||
        !('value' in input) ||
        typeof input.value !== 'number' ||
        !Number.isFinite(input.value)
      )
        throw new Error('Expected a finite health value');
      return { value: input.value };
    },
  },
};
const registry = createRegistry();
registry.register(Health);
const world = new World(registry);
const actor = world.create('Actor');
world.add(actor, Health.type);
world.set(actor, Health.type, { value: 80 });
console.log(world.read(actor, Health));
```

This is project/example logic using the public API. Core contains no Health component. A type can be registered only once; payload writes pass its schema. Defaults use a factory. Runtime reads are frozen; replace a value with `set` instead of mutating it. `read` checks that the supplied definition uses the registered schema before returning its typed value. Missing optional components return undefined; dead entities throw. Transform is required and cannot be removed.

Inspector metadata currently supports string, number and boolean paths. It is a data contract only: no Inspector UI is present. More field kinds should arrive alongside working editor consumers. A component's schema defines its serialization representation in v1; custom binary codecs are not implemented.
