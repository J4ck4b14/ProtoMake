import { it, expect } from 'vitest';
import {
  AnimationSystem,
  AnimationClipSchema,
  AnimatorControllerSchema,
  Animator,
  CLIP_MIME,
  CONTROLLER_MIME,
  frameAt,
} from '@protomake/animation';
import { SpriteRenderer } from '@protomake/renderer';
import { EditorModel } from '../packages/editor/src/model';
import { guid } from '@protomake/core';
import { Engine } from '@protomake/runtime';
import type { AssetData } from '@protomake/assets';
const image = (id: string): AssetData => ({
  id,
  path: `Assets/${id}.png`,
  kind: 'image',
  mime: 'image/png',
  data: 'data:image/png;base64,AA==',
  width: 1,
  height: 1,
});
it('uses frame durations, looping and nonlooping last-frame hold', () => {
  const c = AnimationClipSchema.parse({
    version: 1,
    name: 'Test',
    loop: true,
    speed: 1,
    frames: [
      { texture: 'a', duration: 0.1 },
      { texture: 'b', duration: 0.2 },
    ],
  });
  expect(frameAt(c, 0.15)).toBe(1);
  expect(frameAt(c, 0.35)).toBe(0);
  expect(frameAt({ ...c, loop: false }, 3)).toBe(1);
  expect(() =>
    AnimationClipSchema.parse({
      ...c,
      frames: [{ texture: 'a', duration: 0 }],
    }),
  ).toThrow();
});
it('transitions through authored parameters and consumes triggers only when used', () => {
  const m = new EditorModel(),
    id = m.createEntity('Animated'),
    a = guid(),
    b = guid(),
    clip1 = guid(),
    clip2 = guid(),
    controller = guid();
  m.addComponent(SpriteRenderer.type);
  const clip = (id: string, texture: string): AssetData => ({
    id,
    path: `Assets/${id}.json`,
    kind: 'text',
    mime: CLIP_MIME,
    data: JSON.stringify({
      version: 1,
      name: id,
      loop: true,
      speed: 1,
      frames: [{ texture, duration: 0.1 }],
    }),
    width: 0,
    height: 0,
  });
  const c = {
    version: 1,
    initial: 'Rest',
    parameters: {
      moving: { type: 'bool', default: false },
      burst: { type: 'trigger', default: false },
      count: { type: 'int', default: 0 },
    },
    states: [
      { name: 'Rest', clip: clip1, speed: 1 },
      { name: 'Motion', clip: clip2, speed: 1 },
    ],
    transitions: [
      {
        from: 'Rest',
        to: 'Motion',
        exitTime: null,
        conditions: [{ parameter: 'moving', operator: '==', value: true }],
      },
      {
        from: 'Motion',
        to: 'Rest',
        exitTime: 0.5,
        conditions: [{ parameter: 'burst', operator: '==', value: true }],
      },
    ],
  };
  const assets: AssetData[] = [
    image(a),
    image(b),
    clip(clip1, a),
    clip(clip2, b),
    {
      id: controller,
      path: 'Assets/controller.json',
      kind: 'text',
      mime: CONTROLLER_MIME,
      data: JSON.stringify(c),
      width: 0,
      height: 0,
    },
  ];
  m.change('Configure', () => {
    m.project.assets = assets;
    m.world.add(m.entity(id), Animator.type, { controller, speed: 1 });
  });
  const animation = new AnimationSystem(m.world, assets),
    engine = new Engine(m.world);
  engine.addSystem(animation);
  engine.start();
  expect(m.world.read(m.entity(id), SpriteRenderer)!.texture).toBe(a);
  animation.setParameter(id, 'moving', true);
  engine.tick(0.02);
  expect(animation.state(id)).toBe('Motion');
  expect(m.world.read(m.entity(id), SpriteRenderer)!.texture).toBe(b);
  animation.trigger(id, 'burst');
  engine.tick(0.06);
  expect(animation.state(id)).toBe('Rest');
  animation.setParameter(id, 'moving', false);
  engine.tick(0.06);
  expect(animation.state(id)).toBe('Rest');
  expect(() => animation.setParameter(id, 'count', 0.5)).toThrow();
  expect(() => animation.setParameter(id, 'moving', 4)).toThrow();
  engine.pause();
  const texture = m.world.read(m.entity(id), SpriteRenderer)!.texture;
  engine.tick(1);
  expect(m.world.read(m.entity(id), SpriteRenderer)!.texture).toBe(texture);
  engine.stop();
});
it('rejects missing states and inconsistent condition types', () => {
  expect(() =>
    AnimatorControllerSchema.parse({
      version: 1,
      initial: 'Missing',
      parameters: {},
      states: [{ name: 'One', clip: 'x', speed: 1 }],
      transitions: [],
    }),
  ).toThrow();
  expect(() =>
    AnimatorControllerSchema.parse({
      version: 1,
      initial: 'One',
      parameters: { flag: { type: 'bool', default: false } },
      states: [{ name: 'One', clip: 'x', speed: 1 }],
      transitions: [
        {
          from: 'One',
          to: 'One',
          exitTime: null,
          conditions: [{ parameter: 'flag', operator: '>', value: 1 }],
        },
      ],
    }),
  ).toThrow();
});

it('emits timed clip events and exposes a cross-fade during transitions', () => {
  const model = new EditorModel(),
    entity = model.createEntity('Animated'),
    restTexture = guid(),
    hitTexture = guid(),
    restClip = guid(),
    hitClip = guid(),
    controller = guid(),
    events: string[] = [];
  const assets: AssetData[] = [
    image(restTexture),
    image(hitTexture),
    {
      id: restClip,
      path: 'rest.animation',
      kind: 'text',
      mime: CLIP_MIME,
      data: JSON.stringify({
        version: 1,
        name: 'Rest',
        loop: true,
        speed: 1,
        events: [{ time: 0.01, name: 'footstep' }],
        frames: [{ texture: restTexture, duration: 0.2 }],
      }),
      width: 0,
      height: 0,
    },
    {
      id: hitClip,
      path: 'hit.animation',
      kind: 'text',
      mime: CLIP_MIME,
      data: JSON.stringify({
        version: 1,
        name: 'Hit',
        loop: false,
        speed: 1,
        events: [],
        frames: [{ texture: hitTexture, duration: 0.2 }],
      }),
      width: 0,
      height: 0,
    },
    {
      id: controller,
      path: 'controller.animator',
      kind: 'text',
      mime: CONTROLLER_MIME,
      data: JSON.stringify({
        version: 1,
        initial: 'Rest',
        parameters: { hit: { type: 'trigger', default: false } },
        states: [
          { name: 'Rest', clip: restClip, speed: 1 },
          { name: 'Hit', clip: hitClip, speed: 1 },
        ],
        transitions: [
          {
            from: 'Rest',
            to: 'Hit',
            exitTime: null,
            blend: 0.2,
            conditions: [{ parameter: 'hit', operator: '==', value: true }],
          },
        ],
      }),
      width: 0,
      height: 0,
    },
  ];
  model.change('Animation', () => {
    model.project.assets = assets;
    model.world.add(model.entity(entity), SpriteRenderer.type);
    model.world.add(model.entity(entity), Animator.type, {
      controller,
      speed: 1,
    });
  });
  const animation = new AnimationSystem(model.world, assets, (event) =>
      events.push(event.name),
    ),
    engine = new Engine(model.world);
  engine.addSystem(animation);
  engine.start();
  animation.trigger(entity, 'hit');
  engine.tick(0.02);
  const sprite = model.world.read(model.entity(entity), SpriteRenderer)!;
  expect(events).toContain('footstep');
  expect(sprite.texture).toBe(hitTexture);
  expect(sprite.secondaryTexture).toBe(restTexture);
  expect(sprite.blend).toBeGreaterThan(0);
  expect(sprite.blend).toBeLessThan(1);
  engine.stop();
});
