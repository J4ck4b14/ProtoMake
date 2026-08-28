import { it, expect } from 'vitest';
import { EditorModel } from '@protomake/editor';
import { compose } from '@protomake/core';
import { Physics2D } from '@protomake/physics2d/rapier';
import {
  Rigidbody2D,
  BoxCollider2D,
  CircleCollider2D,
  CapsuleCollider2D,
  defaultPhysics,
  collisionGroups,
} from '@protomake/physics2d';
import { InputService, defaultInput } from '@protomake/input';
function body(
  e: EditorModel,
  name: string,
  x: number,
  y: number,
  mode: 'static' | 'dynamic' | 'kinematic' = 'dynamic',
  sensor = false,
) {
  const stable = e.createEntity(name),
    id = e.entity(stable);
  e.world.setLocalMatrix(id, compose(x, y));
  e.world.add(id, Rigidbody2D.type, { ...Rigidbody2D.defaults(), mode });
  e.world.add(id, BoxCollider2D.type, {
    ...BoxCollider2D.defaults(),
    width: mode === 'static' ? 500 : 32,
    height: 32,
    sensor,
  });
  return stable;
}
it('Rapier integration: dynamic body falls, lands, raycasts and jumps using input actions', async () => {
  const e = new EditorModel(),
    player = body(e, 'Player', 0, 0),
    floor = body(e, 'Floor', 0, 160, 'static'),
    physics = await Physics2D.create(e.world, defaultPhysics());
  try {
    for (let i = 0; i < 120; i++) physics.step(1 / 60);
    const y = e.world.worldPosition(e.entity(player))[1];
    expect(y).toBeGreaterThan(120);
    expect(y).toBeLessThan(130);
    expect(physics.raycast([0, y], [0, 1], 30, player)?.entity).toBe(floor);
    const input = new InputService(defaultInput());
    input.setPhysical('Space', true);
    input.sample();
    if (input.wasPressed('Jump')) physics.setVelocity(player, 120, -400);
    for (let i = 0; i < 10; i++) physics.step(1 / 60);
    expect(e.world.worldPosition(e.entity(player))[1]).toBeLessThan(y - 30);
    expect(e.world.worldPosition(e.entity(player))[0]).toBeGreaterThan(10);
  } finally {
    physics.destroy();
  }
});
it('sensors report enter/exit and do not block motion', async () => {
  const e = new EditorModel(),
    player = body(e, 'Player', 0, 0),
    sensor = body(e, 'Sensor', 0, 100, 'static', true),
    physics = await Physics2D.create(e.world, defaultPhysics()),
    events: boolean[] = [];
  physics.events.on('contact', (event) => {
    if (event.sensor && (event.a === sensor || event.b === sensor))
      events.push(event.started);
  });
  try {
    for (let i = 0; i < 70; i++) physics.step(1 / 60);
    expect(events).toContain(true);
    expect(events).toContain(false);
    expect(e.world.worldPosition(e.entity(player))[1]).toBeGreaterThan(300);
  } finally {
    physics.destroy();
  }
});
it('collision matrix disables selected layer pairs', async () => {
  const e = new EditorModel(),
    player = body(e, 'Player', 0, 0);
  const floor = body(e, 'Floor', 0, 100, 'static');
  e.world.set(e.entity(floor), BoxCollider2D.type, {
    ...e.world.read(e.entity(floor), BoxCollider2D)!,
    layer: 1,
  });
  const settings = defaultPhysics();
  settings.matrix[0]![1] = false;
  settings.matrix[1]![0] = false;
  const physics = await Physics2D.create(e.world, settings);
  try {
    for (let i = 0; i < 60; i++) physics.step(1 / 60);
    expect(e.world.worldPosition(e.entity(player))[1]).toBeGreaterThan(200);
    expect(collisionGroups(1, settings) & 1).toBe(0);
  } finally {
    physics.destroy();
  }
});
it('supports circle/capsule shapes, kinematic motion and cleanup of destroyed entities', async () => {
  const e = new EditorModel(),
    id = e.createEntity('Circle');
  e.world.add(e.entity(id), Rigidbody2D.type, {
    ...Rigidbody2D.defaults(),
    mode: 'kinematic',
  });
  e.world.add(e.entity(id), CircleCollider2D.type);
  const capsule = e.createEntity('Capsule');
  e.world.add(e.entity(capsule), CapsuleCollider2D.type);
  const physics = await Physics2D.create(e.world, defaultPhysics());
  try {
    e.world.setLocalMatrix(e.entity(id), compose(80, 0));
    physics.step(1 / 60);
    expect(physics.debug().vertices.length).toBeGreaterThan(0);
    e.world.destroy(e.entity(id));
    physics.step(1 / 60);
    expect(physics.hasBody(id)).toBe(false);
    expect(() => physics.velocity(id)).toThrow();
  } finally {
    physics.destroy();
  }
});
it('input bindings normalize diagonals, track edges and clear on focus loss', () => {
  const input = new InputService(defaultInput());
  input.setPhysical('KeyD', true);
  input.setPhysical('KeyW', true);
  input.setPhysical('Space', true);
  input.sample();
  expect(Math.hypot(...input.getVector('Move'))).toBeCloseTo(1);
  expect(input.wasPressed('Jump')).toBe(true);
  input.endFrame();
  input.sample();
  expect(input.wasPressed('Jump')).toBe(false);
  input.setPhysical('Space', false);
  input.sample();
  expect(input.wasReleased('Jump')).toBe(true);
  input.clear();
  expect(input.isPressed('Move')).toBe(false);
  expect(() => input.getAxis('Missing')).toThrow();
});
