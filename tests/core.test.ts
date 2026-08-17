import { describe, it, expect } from 'vitest';
import {
  World,
  createRegistry,
  compose,
  IDENTITY,
  TransformComponent,
  guid,
  EventBus,
  type ComponentDefinition,
} from '@protomake/core';
import {
  captureScene,
  serializeScene,
  deserializeScene,
  instantiateScene,
  createProject,
  serializeProject,
  deserializeProject,
  MigrationChain,
} from '@protomake/serialization';
const Counter: ComponentDefinition<{ value: number }> = {
  type: 'test.counter',
  displayName: 'Counter',
  defaults: () => ({ value: 0 }),
  inspector: [{ path: 'value', label: 'Value', kind: 'number' }],
  schema: {
    parse(v: unknown) {
      if (
        !v ||
        typeof v !== 'object' ||
        !('value' in v) ||
        typeof v.value !== 'number' ||
        !Number.isFinite(v.value)
      )
        throw new Error('Expected finite value');
      return { value: v.value };
    },
  },
};
function setup() {
  const registry = createRegistry();
  registry.register(Counter);
  return { registry, world: new World(registry) };
}
describe('entity/component ownership', () => {
  it('creates stable identity, validates components, and detaches input', () => {
    const { world } = setup(),
      id = world.create('A'),
      data = { value: 3 };
    world.add(id, Counter.type, data);
    data.value = 9;
    expect(world.read(id, Counter)).toEqual({ value: 3 });
    expect(() => world.set(id, Counter.type, { value: NaN })).toThrow();
    expect(world.read(id, Counter)?.value).toBe(3);
    expect(world.find(world.get(id).guid)).toBe(id);
    expect(Object.isFrozen(world.read(id, Counter))).toBe(true);
  });
  it('rejects duplicate and unknown types, duplicate IDs and duplicate membership', () => {
    const { world, registry } = setup(),
      id = world.create();
    expect(() => registry.register(Counter)).toThrow();
    expect(() => world.add(id, 'test.unknown')).toThrow();
    expect(() => world.create('B', world.get(id).guid)).toThrow();
    expect(() => world.add(id, TransformComponent.type)).toThrow();
    expect(() => world.remove(id, TransformComponent.type)).toThrow();
  });
  it('destroys descendants and component indexes without recycling handles', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create();
    world.setParent(b, a);
    world.add(b, Counter.type);
    const stable = world.get(b).guid;
    world.destroy(a);
    expect([...world.query(Counter.type)]).toEqual([]);
    expect([...world.all()]).toEqual([]);
    expect(world.find(stable)).toBeUndefined();
    expect(() => world.get(b)).toThrow();
    expect(() => world.set(b, Counter.type, { value: 1 })).toThrow();
    expect(world.create()).toBeGreaterThan(b);
  });
  it('computes inherited activity while preserving local enabled state', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create();
    world.setParent(b, a);
    world.setEnabled(a, false);
    expect(world.isActive(b)).toBe(false);
    expect(world.get(b).enabled).toBe(true);
    world.setEnabled(a, true);
    expect(world.isActive(b)).toBe(true);
  });
  it('removes optional components and renames entities', () => {
    const { world } = setup(),
      id = world.create();
    world.add(id, Counter.type);
    world.remove(id, Counter.type);
    world.rename(id, 'Renamed');
    expect(world.read(id, Counter)).toBeUndefined();
    expect(world.get(id).name).toBe('Renamed');
  });
});
describe('transform hierarchy', () => {
  it('supports local parenting and world position', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create();
    world.setLocalMatrix(a, compose(10, 20));
    world.setLocalMatrix(b, compose(2, 3));
    world.setParent(b, a);
    expect(world.worldPosition(b)).toEqual([12, 23]);
    expect(world.children(a)).toEqual([b]);
    world.setParent(b, null);
    expect(world.worldPosition(b)).toEqual([2, 3]);
    expect(world.children(a)).toEqual([]);
  });
  it('preserves full world matrix across rotated nonuniform/negative scale parents and unparenting', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create(),
      c = world.create();
    world.setLocalMatrix(a, compose(4, -9, 0.7, 2, 0.5));
    world.setLocalMatrix(b, compose(-3, 8, -0.9, -1, 3));
    world.setLocalMatrix(c, compose(5, 7, 1.2, 0.7, 2));
    world.setParent(c, a);
    const before = world.worldMatrix(c);
    world.setParent(c, b, 'world');
    world
      .worldMatrix(c)
      .forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 10));
    world.setParent(c, null, 'world');
    world
      .worldMatrix(c)
      .forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 10));
  });
  it('rejects cycles, self-parenting and dead parents without changes', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create();
    world.setParent(b, a);
    expect(() => world.setParent(a, b)).toThrow(/Cyclic/);
    expect(() => world.setParent(a, a)).toThrow();
    expect(() => world.setParent(b, 999)).toThrow();
    expect(world.get(a).parent).toBeNull();
    expect(world.get(b).parent).toBe(a);
  });
  it('rejects singular parent world preservation atomically, but permits local parenting', () => {
    const { world } = setup(),
      a = world.create(),
      b = world.create();
    world.setLocalMatrix(a, compose(1, 2, 0, 0, 1));
    expect(() => world.setParent(b, a, 'world')).toThrow(/singular/);
    expect(world.get(b).parent).toBeNull();
    expect(world.localMatrix(b)).toEqual(IDENTITY);
    expect(world.children(a)).toEqual([]);
    world.setParent(b, a, 'local');
    expect(world.get(b).parent).toBe(a);
  });
  it('handles a deep hierarchy iteratively', () => {
    const { world } = setup();
    let parent = world.create();
    const root = parent;
    for (let i = 0; i < 1500; i++) {
      const child = world.create();
      world.setParent(child, parent);
      parent = child;
    }
    expect(world.worldMatrix(parent)).toEqual(IDENTITY);
    world.destroy(root);
    expect([...world.all()]).toHaveLength(0);
  });
});
describe('scene acceptance and validation', () => {
  it('creates, attaches, parents, serializes, deserializes and receives equivalent state', () => {
    const { world, registry } = setup(),
      a = world.create('Root'),
      b = world.create('Child');
    world.setLocalMatrix(a, compose(10, 20, 0.4, 2, 3));
    world.setLocalMatrix(b, compose(7, 8));
    world.setParent(b, a);
    world.add(b, Counter.type, { value: 42 });
    world.setEnabled(b, false);
    const metadata = { id: guid(), name: 'Acceptance' },
      json = serializeScene(world, metadata),
      loaded = deserializeScene(json, registry);
    expect(serializeScene(loaded.world, loaded.scene)).toBe(json);
    expect(
      loaded.world.worldMatrix(loaded.world.find(world.get(b).guid)!),
    ).toEqual(world.worldMatrix(b));
  });
  it('clones scene state: runtime changes cannot alter authored state', () => {
    const { world, registry } = setup(),
      a = world.create();
    const snapshot = captureScene(world, { id: guid(), name: 'Original' }),
      runtime = instantiateScene(snapshot, registry).world;
    runtime.setLocalMatrix(runtime.find(world.get(a).guid)!, compose(843, 0));
    expect(world.localMatrix(a)).toEqual(IDENTITY);
    expect(snapshot.entities[0]?.components['protomake.transform']).toEqual({
      local: IDENTITY,
    });
  });
  it('supports empty scene and project round trips', () => {
    const { world, registry } = setup();
    expect(
      deserializeScene(
        serializeScene(world, { id: guid(), name: 'Empty' }),
        registry,
      ).scene.entities,
    ).toEqual([]);
    const project = createProject('Test');
    expect(
      deserializeProject(serializeProject(project, registry), registry),
    ).toEqual(project);
  });
  it.each([
    'duplicate',
    'missingParent',
    'cycle',
    'component',
    'missingTransform',
    'version',
    'guid',
    'unknownField',
  ])('rejects invalid scene: %s', (kind) => {
    const { world, registry } = setup();
    world.create('Guard');
    const scene = captureScene(world, { id: guid(), name: 'Broken' });
    const e = scene.entities[0]!;
    switch (kind) {
      case 'duplicate':
        scene.entities.push(structuredClone(e));
        break;
      case 'missingParent':
        e.parent = guid();
        break;
      case 'cycle':
        e.parent = e.id;
        break;
      case 'component':
        e.components[Counter.type] = { value: 'bad' };
        break;
      case 'missingTransform':
        delete e.components[TransformComponent.type];
        break;
      case 'version':
        Object.assign(scene, { schemaVersion: 999 });
        break;
      case 'guid':
        e.id = 'invalid';
        break;
      case 'unknownField':
        Object.assign(scene, { typo: true });
    }
    expect(() => instantiateScene(scene, registry)).toThrow();
    expect([...world.all()]).toHaveLength(1);
  });
  it('rejects missing startup scene and duplicate scene identities', () => {
    const { world, registry } = setup(),
      project = createProject('Broken');
    project.startupScene = guid();
    expect(() => serializeProject(project, registry)).toThrow(/startup/);
    project.startupScene = null;
    const scene = captureScene(world, { id: guid(), name: 'A' });
    project.scenes = [scene, scene];
    expect(() => serializeProject(project, registry)).toThrow(
      /duplicate scene/,
    );
  });
  it('reports entity and component context', () => {
    const { world, registry } = setup();
    world.create('Guard');
    const scene = captureScene(world, { id: guid(), name: 'Error' });
    scene.entities[0]!.components['test.missing'] = {};
    expect(() => instantiateScene(scene, registry)).toThrow(
      /Guard.*test.missing/,
    );
  });
});
describe('migration infrastructure', () => {
  it('runs ordered migrations without mutating input', () => {
    const chain = new MigrationChain(3);
    chain.register(1, () => ({ schemaVersion: 2, name: 'migrated' }));
    chain.register(2, (v) => ({ ...(v as object), schemaVersion: 3 }));
    const original = { schemaVersion: 1 };
    expect(chain.run(original)).toEqual({ schemaVersion: 3, name: 'migrated' });
    expect(original).toEqual({ schemaVersion: 1 });
  });
  it('rejects missing, malformed and future versions and invalid migration output', () => {
    const chain = new MigrationChain(2);
    expect(() => chain.run({ schemaVersion: 1 })).toThrow(/Missing migration/);
    expect(() => chain.run({ schemaVersion: 3 })).toThrow(/Unsupported/);
    expect(() => chain.run({})).toThrow();
    chain.register(1, () => ({ schemaVersion: 1 }));
    expect(() => chain.run({ schemaVersion: 1 })).toThrow(/must produce/);
  });
});
describe('events', () => {
  it('dispatches ordered snapshots and supports unsubscribe', () => {
    const bus = new EventBus<{ value: number }>(),
      calls: number[] = [];
    let off = () => {};
    bus.on('value', (v) => {
      calls.push(v);
      off();
    });
    off = bus.on('value', (v) => calls.push(v * 10));
    bus.emit('value', 2);
    bus.emit('value', 3);
    expect(calls).toEqual([2, 20, 3]);
    bus.clear();
    bus.emit('value', 4);
    expect(calls).toHaveLength(3);
  });
  it('propagates listener failures', () => {
    const bus = new EventBus<{ value: number }>();
    bus.on('value', () => {
      throw new Error('listener failed');
    });
    expect(() => bus.emit('value', 0)).toThrow('listener failed');
  });
});

it('old event unsubscribe cannot remove a replacement listener group', () => {
  const bus = new EventBus<{ value: number }>();
  const off = bus.on('value', () => {});
  off();
  let count = 0;
  bus.on('value', () => count++);
  off();
  bus.emit('value', 1);
  expect(count).toBe(1);
});
