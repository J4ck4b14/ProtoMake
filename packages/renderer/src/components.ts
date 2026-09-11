import { z } from 'zod';
import type { ComponentDefinition, ComponentRegistry } from '@protomake/core';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/),
  finite = z.number().finite(),
  channelMask = z.number().int().min(0).max(15);

/** Four deliberately small lighting channels keep authoring readable and rendering bounded. */
export const LIGHTING_CHANNELS = ['World', 'Characters', 'Foreground', 'Effects'] as const;
export type LightingChannel = (typeof LIGHTING_CHANNELS)[number];
export const ALL_LIGHTING_CHANNELS = (1 << LIGHTING_CHANNELS.length) - 1;
export function channelIndex(channel: LightingChannel | number): number {
  if (typeof channel === 'number')
    return Math.min(LIGHTING_CHANNELS.length - 1, Math.max(0, Math.trunc(channel)));
  const index = LIGHTING_CHANNELS.indexOf(channel);
  return index < 0 ? 0 : index;
}
export function channelBit(channel: LightingChannel | number): number {
  return 1 << channelIndex(channel);
}
export function channelEnabled(mask: number, channel: LightingChannel | number): boolean {
  return (mask & channelBit(channel)) !== 0;
}

const SpriteSchema = z.strictObject({
  texture: z.string(),
  lit: z.boolean().default(true),
  castShadow: z.boolean().default(false),
  lightingChannel: z.enum(LIGHTING_CHANNELS).default('World'),
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
    castShadow: false,
    lightingChannel: 'World',
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
    {
      path: 'lightingChannel',
      label: 'Lighting channel',
      kind: 'enum',
      options: LIGHTING_CHANNELS,
    },
    ...['visible', 'flipX', 'flipY', 'lit', 'castShadow'].map((path) => ({
      path,
      label: path,
      kind: 'boolean' as const,
    })),
  ],
};

const ShadowCasterSchema = z.strictObject({
  width: finite.positive(),
  height: finite.positive(),
  offsetX: finite,
  offsetY: finite,
  channelMask: channelMask.default(ALL_LIGHTING_CHANNELS),
});
export type ShadowCasterData = z.infer<typeof ShadowCasterSchema>;
export const ShadowCaster2D: ComponentDefinition<ShadowCasterData> = {
  type: 'protomake.shadowCaster',
  displayName: 'Shadow Caster 2D',
  schema: ShadowCasterSchema,
  defaults: () => ({
    width: 64,
    height: 64,
    offsetX: 0,
    offsetY: 0,
    channelMask: ALL_LIGHTING_CHANNELS,
  }),
  inspector: [
    ...['width', 'height', 'offsetX', 'offsetY'].map((path) => ({
      path,
      label: path,
      kind: 'number' as const,
    })),
    {
      path: 'channelMask',
      label: 'Shadow channels',
      kind: 'mask',
      options: LIGHTING_CHANNELS,
    },
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
    mobility: z.enum(['static', 'dynamic', 'mixed']).default('dynamic'),
    color,
    intensity: finite.nonnegative(),
    range: finite.positive(),
    falloff: finite.positive(),
    innerAngle: finite.min(0).max(360),
    outerAngle: finite.positive().max(360),
    width: finite.positive(),
    height: finite.positive(),
    channelMask: channelMask.default(ALL_LIGHTING_CHANNELS),
    castShadows: z.boolean().default(true),
    shadowOpacity: finite.min(0).max(1).default(1),
    shadowBias: finite.min(0).max(64).default(1),
    shadowSoftness: finite.min(0).max(64).default(0),
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
    mobility: 'dynamic',
    color: '#ffffff',
    intensity: 1,
    range: 300,
    falloff: 1,
    innerAngle: 40,
    outerAngle: 70,
    width: 160,
    height: 80,
    channelMask: ALL_LIGHTING_CHANNELS,
    castShadows: true,
    shadowOpacity: 1,
    shadowBias: 1,
    shadowSoftness: 0,
  }),
  inspector: [
    {
      path: 'kind',
      label: 'Light type',
      kind: 'enum',
      options: ['ambient', 'point', 'spot', 'area'],
    },
    {
      path: 'mobility',
      label: 'Mobility',
      kind: 'enum',
      options: ['static', 'mixed', 'dynamic'],
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
    {
      path: 'channelMask',
      label: 'Affects channels',
      kind: 'mask',
      options: LIGHTING_CHANNELS,
    },
    { path: 'castShadows', label: 'Cast shadows', kind: 'boolean' },
    { path: 'shadowOpacity', label: 'Shadow opacity', kind: 'number' },
    { path: 'shadowBias', label: 'Shadow bias', kind: 'number' },
    { path: 'shadowSoftness', label: 'Shadow softness', kind: 'number' },
  ],
};

export function registerRendering(registry: ComponentRegistry): void {
  registry.register(SpriteRenderer);
  registry.register(ShadowCaster2D);
  registry.register(Camera2D);
  registry.register(Light2D);
}
