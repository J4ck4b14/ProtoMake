import { expect, it } from 'vitest';
import { Engine } from '@protomake/runtime';
import { EditorModel } from '@protomake/editor';
import {
  Camera2D,
  CameraBehaviourSystem,
  CameraFollow2D,
  ParticleEmitter2D,
  ParticleSystem,
  SpriteRenderer,
} from '@protomake/renderer';

it('emits bounded particles and expires their runtime-owned entities', () => {
  const model = new EditorModel(),
    emitter = model.createEntity('Dust');
  model.world.add(model.entity(emitter), ParticleEmitter2D.type, {
    ...ParticleEmitter2D.defaults(),
    burst: 3,
    rate: 0,
    lifetimeMin: 0.1,
    lifetimeMax: 0.1,
    maxParticles: 3,
  });
  const particles = new ParticleSystem(model.world),
    engine = new Engine(model.world);
  engine.addSystem(particles);
  engine.start();
  expect(model.world.withComponent(SpriteRenderer.type)).toHaveLength(3);
  particles.emit(emitter, 5);
  expect(model.world.withComponent(SpriteRenderer.type)).toHaveLength(3);
  engine.tick(0.11);
  expect(model.world.withComponent(SpriteRenderer.type)).toHaveLength(0);
  engine.stop();
});

it('layers directional kick and zoom pulse over camera follow', () => {
  const model = new EditorModel(),
    target = model.createEntity('Target'),
    camera = model.createEntity('Camera');
  model.world.add(model.entity(camera), Camera2D.type);
  model.world.add(model.entity(camera), CameraFollow2D.type, {
    ...CameraFollow2D.defaults(),
    target,
    deadZoneWidth: 0,
    deadZoneHeight: 0,
    smoothing: 0,
  });
  const effects = new CameraBehaviourSystem(model.world),
    engine = new Engine(model.world);
  engine.addSystem(effects);
  engine.start();
  effects.kick(camera, 10, 0, 0.2);
  effects.zoomPulse(camera, 0.5, 0.2);
  engine.tick(0.05);
  expect(model.world.worldPosition(model.entity(camera))[0]).toBeGreaterThan(0);
  expect(
    model.world.read(model.entity(camera), Camera2D)!.zoom,
  ).toBeGreaterThan(1);
  engine.tick(0.2);
  engine.stop();
});
