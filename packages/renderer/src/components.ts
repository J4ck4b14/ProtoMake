import { z } from 'zod';
import type { ComponentDefinition, ComponentRegistry } from '@protomake/core';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/),
  finite = z.number().finite();
const SpriteSchema = z.strictObject({
  texture: z.string(),
  lit: z.boolean().default(true),
  width: finite.positive(),
  height: finite.positive(),
  tint: color,
  opacity: finite.min(0).max(1),
  visible: z.boolean(),
  flipX: z.boolean(),
  flipY: z.boolean(),
  anchorX: finite,
  anchorY: finite,
  layer: z.number().int(),
  order: z.number().int(),
});
export type SpriteData = z.infer<typeof SpriteSchema>;
export const SpriteRenderer: ComponentDefinition<SpriteData> = {
  type: 'protomake.sprite',
  displayName: 'Sprite Renderer',
  schema: SpriteSchema,
  defaults: () => ({
    texture: '',
    lit: true,
    width: 64,
    height: 64,
    tint: '#ffffff',
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    anchorX: 0.5,
    anchorY: 0.5,
    layer: 0,
    order: 0,
  }),
  inspector: [
    { path: 'texture', label: 'Texture', kind: 'asset' },
    ...[
      'width',
      'height',
      'opacity',
      'anchorX',
      'anchorY',
      'layer',
      'order',
    ].map((path) => ({ path, label: path, kind: 'number' as const })),
    { path: 'tint', label: 'Tint', kind: 'color' },
    ...['visible', 'flipX', 'flipY', 'lit'].map((path) => ({
      path,
      label: path,
      kind: 'boolean' as const,
    })),
  ],
};
const CameraSchema = z
  .strictObject({
    zoom: finite.positive(),
    background: color,
    priority: z.number().int(),
    viewportX: finite.min(0).max(1),
    viewportY: finite.min(0).max(1),
    viewportWidth: finite.positive().max(1),
    viewportHeight: finite.positive().max(1),
  })
  .refine(
    (v) =>
      v.viewportX + v.viewportWidth <= 1 && v.viewportY + v.viewportHeight <= 1,
    'Camera viewport must fit within [0,1]',
  );
export type CameraData = z.infer<typeof CameraSchema>;
export const Camera2D: ComponentDefinition<CameraData> = {
  type: 'protomake.camera',
  displayName: 'Camera 2D',
  schema: CameraSchema,
  defaults: () => ({
    zoom: 1,
    background: '#101820',
    priority: 0,
    viewportX: 0,
    viewportY: 0,
    viewportWidth: 1,
    viewportHeight: 1,
  }),
  inspector: [
    ...[
      'zoom',
      'priority',
      'viewportX',
      'viewportY',
      'viewportWidth',
      'viewportHeight',
    ].map((path) => ({ path, label: path, kind: 'number' as const })),
    { path: 'background', label: 'Background', kind: 'color' },
  ],
};
const LightSchema = z
  .strictObject({
    kind: z.enum(['ambient', 'point', 'spot', 'area']),
    color,
    intensity: finite.nonnegative(),
    range: finite.positive(),
    falloff: finite.positive(),
    innerAngle: finite.min(0).max(360),
    outerAngle: finite.positive().max(360),
    width: finite.positive(),
    height: finite.positive(),
  })
  .refine(
    (l) => l.innerAngle <= l.outerAngle,
    'Inner angle must not exceed outer angle',
  );
export type LightData = z.infer<typeof LightSchema>;
export const Light2D: ComponentDefinition<LightData> = {
  type: 'protomake.light',
  displayName: 'Light 2D',
  schema: LightSchema,
  defaults: () => ({
    kind: 'point',
    color: '#ffffff',
    intensity: 1,
    range: 300,
    falloff: 1,
    innerAngle: 40,
    outerAngle: 70,
    width: 160,
    height: 80,
  }),
  inspector: [
    {
      path: 'kind',
      label: 'Light type',
      kind: 'enum',
      options: ['ambient', 'point', 'spot', 'area'],
    },
    { path: 'color', label: 'Color', kind: 'color' },
    ...[
      'intensity',
      'range',
      'falloff',
      'innerAngle',
      'outerAngle',
      'width',
      'height',
    ].map((path) => ({ path, label: path, kind: 'number' as const })),
  ],
};
export function registerRendering(registry: ComponentRegistry): void {
  registry.register(SpriteRenderer);
  registry.register(Camera2D);
  registry.register(Light2D);
}
