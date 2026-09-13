import { it, expect } from 'vitest';
import { Tags, World, compose, decompose, guid } from '@protomake/core';
import { EditorModel } from '@protomake/editor';
import {
  Engine,
  SignalService,
  TimerService,
  TweenService,
} from '@protomake/runtime';
import { InputService } from '@protomake/input';
import { Physics2D } from '@protomake/physics2d/rapier';
import {
  Behaviours,
  ScriptSystem,
  type ScriptContext,
  type ScriptFields,
  type ScriptModule,
} from '@protomake/scripting';
import {
  captureScene,
  deterministicJSON,
  serializeProject,
} from '@protomake/serialization';
import { RuntimePrefabs } from '@protomake/player';

it('decomposes ordinary and sheared transforms without losing editor-hidden affine data', () => {
  const source = [1.5, 0.5, 0.25, 2, 12, -7] as const,
    parts = decompose(source);
  expect(parts.x).toBe(12);
  expect(parts.y).toBe(-7);
  const editor = new EditorModel(),
    entity = editor.createEntity();
  editor.world.setLocalMatrix(editor.entity(entity), source);
  editor.setTransformProperty('x', 42);
  const changed = editor.world.localMatrix(editor.entity(entity));
  expect(changed[4]).toBe(42);
  changed
    .slice(0, 4)
    .forEach((value, index) => expect(value).toBeCloseTo(source[index]!));
});

it('indexes tags and provides component, closest and radius queries', () => {
  const model = new EditorModel(),
    near = model.createEntity('Near'),
    far = model.createEntity('Far');
  model.setTags(['Enemy', 'Damageable']);
  model.world.setLocalMatrix(model.entity(far), compose(100, 0));
  model.select([near]);
  model.setTags(['Enemy']);
  expect(model.world.withTag('Enemy')).toHaveLength(2);
  expect(model.world.closestWithTag('Enemy', [10, 0])).toBe(model.entity(near));
  expect(model.world.inRadius([0, 0], 20)).toContain(model.entity(near));
  expect(model.world.withComponents('protomake.transform', Tags.type)).toHaveLength(
    2,
  );
});

it('runs the complete 0.10 behaviour-service acceptance workflow', async () => {
  const model = new EditorModel(),
    player = model.createEntity('Player'),
    door = model.createEntity('Door'),
    moveScript = guid(),
    interactionScript = guid(),
    dormantScript = guid(),
    prefabId = guid();
  const prefabWorld = new World(model.registry),
    prefabRoot = prefabWorld.create('Enemy');
  prefabWorld.add(prefabRoot, Tags.type, { values: ['Enemy', 'Damageable'] });
  const prefabScene = captureScene(prefabWorld, {
    id: guid(),
    name: 'Enemy prefab',
  });
  model.project.assets.push({
    id: prefabId,
    path: 'Assets/Enemy.prefab.json',
    kind: 'text',
    mime: 'application/x-protomake-prefab',
    data: deterministicJSON(prefabScene),
    width: 0,
    height: 0,
  });
  for (const [id, path] of [
    [moveScript, 'Assets/Move.ts'],
    [interactionScript, 'Assets/Interaction.ts'],
    [dormantScript, 'Assets/Dormant.ts'],
  ] as const)
    model.project.assets.push({
      id,
      path,
      kind: 'text',
      mime: 'text/typescript',
      data: 'export default class Behaviour {}',
      width: 0,
      height: 0,
    });
  model.setTags(['Player']);
  model.select([door]);
  model.setTags(['Door']);
  model.select([player]);
  model.addScriptBehaviour(moveScript, { speed: 30 });
  model.addScriptBehaviour(interactionScript, { door, prefab: prefabId });
  model.addScriptBehaviour(dormantScript);
  const behaviourData = model.world.read(model.entity(player), Behaviours)!,
    dormantId = behaviourData.order[2]!;
  model.setBehaviourProperty(dormantId, 'enabled', false);

  let received = 0,
    spawned = '',
    queried = false,
    pointerWorld: readonly [number, number] = [0, 0],
    dormantStarts = 0;
  class Move {
    speed = 0;
    update(context: ScriptContext): void {
      const [x, y] = context.position();
      context.setPosition(x + this.speed * context.delta, y);
      pointerWorld = context.pointer.worldPosition;
    }
  }
  class Interaction {
    door = '';
    prefab = '';
    start(context: ScriptContext): void {
      context.events.on('door.open', () => {
        received++;
        context.tween.to(this.door, {
          position: [12, 0],
          duration: 0.1,
          onComplete: () =>
            context.time.after(0.1, () =>
              context.tween.to(this.door, {
                position: [0, 0],
                duration: 0.1,
              }),
            ),
        });
      });
      context.events.emit('door.open');
      spawned = context.prefabs.instantiate(this.prefab, {
        position: [40, 0],
      });
      queried = context.entities.withTag('Enemy').includes(spawned);
    }
  }
  class Dormant {
    start(): void {
      dormantStarts++;
    }
  }
  const modules = new Map<string, ScriptModule>([
      [moveScript, { default: Move }],
      [interactionScript, { default: Interaction }],
      [dormantScript, { default: Dormant }],
    ]),
    fields = new Map<string, ScriptFields>([
      [moveScript, { speed: { type: 'number', default: 1 } }],
      [
        interactionScript,
        {
          door: { type: 'entity', default: '' },
          prefab: { type: 'asset', default: '' },
        },
      ],
      [dormantScript, {}],
    ]),
    physics = await Physics2D.create(model.world, model.project.physics),
    input = new InputService(model.project.input),
    signals = new SignalService(),
    timers = new TimerService(),
    tweens = new TweenService(model.world),
    prefabs = new RuntimePrefabs(
      model.world,
      model.registry,
      model.project.assets,
    ),
    scripts = new ScriptSystem(
      model.world,
      input,
      physics,
      modules,
      fields,
      () => {},
      () => {},
      {},
      {
        signals,
        timers,
        tweens,
        prefabs,
        coordinates: {
          screenPosition: () => [320, 180],
          worldPosition: () => [17, 23],
          delta: () => [2, -1],
          wheel: () => 4,
          screenToWorld: (position) => position,
          worldToScreen: (position) => position,
        },
      },
    ),
    engine = new Engine(model.world);
  engine.addSystem(timers);
  engine.addSystem(tweens);
  engine.addSystem(scripts);
  engine.start();
  try {
    expect(received).toBe(1);
    expect(queried).toBe(true);
    expect(model.world.find(spawned)).toBeDefined();
    expect(dormantStarts).toBe(0);
    for (let index = 0; index < 24; index++) engine.tick(1 / 60);
    expect(model.world.worldPosition(model.entity(player))[0]).toBeCloseTo(12);
    expect(model.world.worldPosition(model.entity(door))[0]).toBeCloseTo(0);
    expect(pointerWorld).toEqual([17, 23]);
    model.setBehaviourProperty(dormantId, 'enabled', true);
    engine.tick(1 / 60);
    expect(dormantStarts).toBe(1);
  } finally {
    engine.stop();
    physics.destroy();
  }
  expect(
    JSON.parse(serializeProject(model.project, model.registry)),
  ).toMatchObject({
    schemaVersion: 11,
    engineVersion: '0.16.3',
  });
});

it('applies action maps, sensitivity, inversion and pointer frame state', () => {
  const input = new InputService([
    {
      name: 'Aim',
      map: 'Gameplay',
      kind: 'axis',
      sensitivity: 0.5,
      deadZone: 0.15,
      invertX: true,
      invertY: false,
      positiveX: ['KeyD'],
      negativeX: [],
      positiveY: [],
      negativeY: [],
    },
  ]);
  input.setPhysical('KeyD', true);
  input.sample();
  expect(input.getAxis('Aim')).toBe(-0.5);
  input.setMapEnabled('Gameplay', false);
  input.sample();
  expect(input.getAxis('Aim')).toBe(0);
});
