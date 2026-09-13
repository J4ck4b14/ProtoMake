import { z } from 'zod';
import type {
  ComponentDefinition,
  ComponentRegistry,
  InspectorField,
} from '@protomake/core';
const finite = z.number().finite();
function fields(defaults: Record<string, unknown>): InspectorField[] {
  return Object.entries(defaults).map(([path, value]) => ({
    path,
    label: path,
    kind:
      typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number'
          ? 'number'
          : 'string',
  }));
}
const bodyDefaults = {
  mode: 'dynamic' as const,
  mass: 1,
  gravityScale: 1,
  linearDamping: 0,
  angularDamping: 0,
  freezeRotation: true,
  continuous: true,
  velocityX: 0,
  velocityY: 0,
  angularVelocity: 0,
};
const BodySchema = z.strictObject({
  mode: z.enum(['static', 'dynamic', 'kinematic']),
  mass: finite.positive(),
  gravityScale: finite,
  linearDamping: finite.nonnegative(),
  angularDamping: finite.nonnegative(),
  freezeRotation: z.boolean(),
  continuous: z.boolean(),
  velocityX: finite,
  velocityY: finite,
  angularVelocity: finite,
});
export type BodyData = z.infer<typeof BodySchema>;
export const Rigidbody2D: ComponentDefinition<BodyData> = {
  type: 'protomake.rigidbody',
  displayName: 'Rigidbody 2D',
  defaults: () => ({ ...bodyDefaults }),
  schema: BodySchema,
  inspector: fields(bodyDefaults).map((f) =>
    f.path === 'mode'
      ? { ...f, kind: 'enum', options: ['static', 'dynamic', 'kinematic'] }
      : f,
  ),
};
const common = {
  offsetX: finite,
  offsetY: finite,
  sensor: z.boolean(),
  friction: finite.nonnegative(),
  restitution: finite.nonnegative(),
  layer: z.number().int().min(0).max(15),
  oneWay: z.boolean().default(false),
};
const commonDefaults = {
  offsetX: 0,
  offsetY: 0,
  sensor: false,
  friction: 0.5,
  restitution: 0,
  layer: 0,
  oneWay: false,
};
const BoxSchema = z.strictObject({
  ...common,
  width: finite.positive(),
  height: finite.positive(),
});
const CircleSchema = z.strictObject({ ...common, radius: finite.positive() });
const CapsuleSchema = z.strictObject({
  ...common,
  radius: finite.positive(),
  halfHeight: finite.nonnegative(),
});
export type BoxData = z.infer<typeof BoxSchema>;
export type CircleData = z.infer<typeof CircleSchema>;
export type CapsuleData = z.infer<typeof CapsuleSchema>;
const boxDefaults = { ...commonDefaults, width: 64, height: 64 },
  circleDefaults = { ...commonDefaults, radius: 32 },
  capsuleDefaults = { ...commonDefaults, radius: 16, halfHeight: 16 };
export const BoxCollider2D: ComponentDefinition<BoxData> = {
  type: 'protomake.box-collider',
  displayName: 'Box Collider 2D',
  defaults: () => ({ ...boxDefaults }),
  schema: BoxSchema,
  inspector: fields(boxDefaults),
};
export const CircleCollider2D: ComponentDefinition<CircleData> = {
  type: 'protomake.circle-collider',
  displayName: 'Circle Collider 2D',
  defaults: () => ({ ...circleDefaults }),
  schema: CircleSchema,
  inspector: fields(circleDefaults),
};
export const CapsuleCollider2D: ComponentDefinition<CapsuleData> = {
  type: 'protomake.capsule-collider',
  displayName: 'Capsule Collider 2D',
  defaults: () => ({ ...capsuleDefaults }),
  schema: CapsuleSchema,
  inspector: fields(capsuleDefaults),
};
const CharacterSchema = z.strictObject({
  maxSpeed: finite.positive(),
  acceleration: finite.positive(),
  deceleration: finite.positive(),
  maxSlopeDegrees: finite.min(0).max(89),
  groundSnap: finite.nonnegative(),
  skinWidth: finite.positive(),
  upX: finite,
  upY: finite,
  platformLayer: z.number().int().min(0).max(15),
});
export type CharacterData = z.infer<typeof CharacterSchema>;
export const CharacterBody2D: ComponentDefinition<CharacterData> = {
  type: 'protomake.character-body',
  displayName: 'Character Body 2D',
  schema: CharacterSchema.superRefine((value, context) => {
    if (Math.abs(Math.hypot(value.upX, value.upY) - 1) > 0.01)
      context.addIssue({
        code: 'custom',
        message: 'Character up direction must be normalized',
      });
  }),
  defaults: () => ({
    maxSpeed: 240,
    acceleration: 1800,
    deceleration: 2200,
    maxSlopeDegrees: 50,
    groundSnap: 8,
    skinWidth: 1,
    upX: 0,
    upY: -1,
    platformLayer: 1,
  }),
  inspector: [
    ...[
      'maxSpeed',
      'acceleration',
      'deceleration',
      'maxSlopeDegrees',
      'groundSnap',
      'skinWidth',
      'upX',
      'upY',
      'platformLayer',
    ].map((path) => ({ path, label: path, kind: 'number' as const })),
  ],
};
export const PhysicsSettingsSchema = z
  .strictObject({
    gravityX: finite,
    gravityY: finite,
    layers: z.array(z.string().min(1)).min(1).max(16),
    matrix: z.array(z.array(z.boolean())),
  })
  .refine(
    (s) =>
      new Set(s.layers).size === s.layers.length &&
      s.matrix.length === s.layers.length &&
      s.matrix.every(
        (row, i) =>
          row.length === s.layers.length &&
          row.every((v, j) => s.matrix[j]?.[i] === v),
      ),
    'Collision matrix must be square, symmetric and match unique layer names',
  );
export type PhysicsSettings = z.infer<typeof PhysicsSettingsSchema>;
export function defaultPhysics(): PhysicsSettings {
  return {
    gravityX: 0,
    gravityY: 980,
    layers: ['Default', 'World', 'Actors', 'Triggers'],
    matrix: Array.from({ length: 4 }, () => Array<boolean>(4).fill(true)),
  };
}
export function registerPhysics(registry: ComponentRegistry): void {
  registry.register(Rigidbody2D);
  registry.register(BoxCollider2D);
  registry.register(CircleCollider2D);
  registry.register(CapsuleCollider2D);
  registry.register(CharacterBody2D);
}
export function collisionGroups(
  layer: number,
  settings: PhysicsSettings,
): number {
  if (layer < 0 || layer >= settings.layers.length)
    throw new Error(`Unknown physics layer index ${layer}`);
  let mask = 0;
  settings.matrix[layer]!.forEach((enabled, index) => {
    if (enabled) mask |= 1 << index;
  });
  return (((1 << layer) << 16) | mask) >>> 0;
}
