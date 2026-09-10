import { it, expect } from 'vitest';
import { EditorModel } from '@protomake/editor';
import {
  Light2D,
  SpriteRenderer,
  lightTint,
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
