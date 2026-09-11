import { it, expect } from 'vitest';
import { EditorModel } from '@protomake/editor';
import { compose } from '@protomake/core';
import {
  Light2D,
  ShadowCaster2D,
  SpriteRenderer,
  lightTint,
  sampleLighting,
  sceneLights,
  type LightSample,
} from '@protomake/renderer';
const sample = (
  kind: 'ambient' | 'point' | 'spot' | 'area',
  extra = {},
): LightSample => ({
  x: 0,
  y: 0,
  angle: 0,
  data: { ...Light2D.defaults(), kind, ...extra },
});
it('preserves legacy unlit appearance and serializes lighting defaults', () => {
  expect(
    SpriteRenderer.schema.parse({
      ...SpriteRenderer.defaults(),
      lit: undefined,
    }).lit,
  ).toBe(true);
  expect(lightTint('#abcdef', 500, 500, [])).toBe(0xabcdef);
  expect(SpriteRenderer.defaults().castShadow).toBe(false);
  expect(Light2D.defaults().mobility).toBe('dynamic');
  const m = new EditorModel();
  m.createEntity('Light');
  m.addComponent(Light2D.type);
  const reopened = new EditorModel();
  reopened.load(m.project);
  expect(sceneLights(reopened.world)).toHaveLength(1);
  reopened.world.setEnabled(
    [...reopened.world.all()].find((e) => e.name === 'Light')!.id,
    false,
  );
  expect(sceneLights(reopened.world)).toHaveLength(0);
});
it('combines ambient color, distance falloff, spot direction and rectangular extent', () => {
  expect(
    lightTint('#ffffff', 0, 0, [
      sample('ambient', { intensity: 0.5, color: '#ff0000' }),
    ]),
  ).toBe(0x800000);
  expect(lightTint('#ffffff', 300, 0, [sample('point')])).toBe(0);
  expect(lightTint('#ffffff', 150, 0, [sample('point')])).toBe(0x808080);
  expect(lightTint('#ffffff', 100, 0, [sample('spot')])).toBeGreaterThan(0);
  expect(lightTint('#ffffff', -100, 0, [sample('spot')])).toBe(0);
  expect(lightTint('#ffffff', 70, 30, [sample('area')])).toBe(0xffffff);
  expect(
    lightTint('#ffffff', 0, 100, [{ ...sample('spot'), angle: Math.PI / 2 }]),
  ).toBeGreaterThan(0);
  expect(() =>
    Light2D.schema.parse({
      ...Light2D.defaults(),
      innerAngle: 100,
      outerAngle: 20,
    }),
  ).toThrow();
});


it('casts occlusion-aware shadows and exposes matching point illumination', () => {
  const m = new EditorModel();
  const light = m.createEntity('Light');
  m.addComponent(Light2D.type);
  m.world.set(m.entity(light), Light2D.type, {
    ...Light2D.defaults(),
    kind: 'point',
    range: 300,
  });
  const wall = m.createEntity('Wall');
  m.addComponent(ShadowCaster2D.type);
  m.world.set(m.entity(wall), ShadowCaster2D.type, {
    width: 20,
    height: 100,
    offsetX: 0,
    offsetY: 0,
  });
  m.world.setLocalMatrix(m.entity(wall), compose(50, 0));

  expect(sampleLighting(m.world, 100, 0).intensity).toBe(0);
  expect(sampleLighting(m.world, 0, 100).intensity).toBeGreaterThan(0.5);
  expect(sampleLighting(m.world, 50, 0, wall).intensity).toBeGreaterThan(0);
});

it('respects receiver channels and partial shadow opacity for gameplay samples', () => {
  const m = new EditorModel();
  const light = m.createEntity('Character lamp');
  m.addComponent(Light2D.type);
  m.world.set(m.entity(light), Light2D.type, {
    ...Light2D.defaults(),
    kind: 'point',
    range: 300,
    channelMask: 2,
    shadowOpacity: 0.5,
  });
  const wall = m.createEntity('Wall');
  m.addComponent(ShadowCaster2D.type);
  m.world.set(m.entity(wall), ShadowCaster2D.type, {
    ...ShadowCaster2D.defaults(),
    width: 20,
    height: 100,
    channelMask: 2,
  });
  m.world.setLocalMatrix(m.entity(wall), compose(50, 0));

  expect(sampleLighting(m.world, 100, 0, undefined, 'World').intensity).toBe(0);
  const exposed = sampleLighting(m.world, 100, 100, undefined, 'Characters').intensity,
    shadowed = sampleLighting(m.world, 100, 0, undefined, 'Characters').intensity;
  expect(exposed).toBeGreaterThan(0);
  expect(shadowed).toBeGreaterThan(0);
  expect(shadowed).toBeLessThan(exposed);
});
