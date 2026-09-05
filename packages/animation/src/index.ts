import { z } from 'zod';
import type { ComponentDefinition, World, Guid } from '@protomake/core';
import type { AssetData } from '@protomake/assets';
import type { EngineContext, System } from '@protomake/runtime';
import { SpriteRenderer } from '@protomake/renderer';
export const CLIP_MIME = 'application/x-protomake-animation',
  CONTROLLER_MIME = 'application/x-protomake-animator';
export const AnimationClipSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().min(1),
  loop: z.boolean(),
  speed: z.number().finite().positive(),
  frames: z
    .array(
      z.strictObject({
        texture: z.string().min(1),
        duration: z.number().finite().positive(),
      }),
    )
    .min(1),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;
const ParameterSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bool'), default: z.boolean() }),
  z.strictObject({ type: z.literal('trigger'), default: z.literal(false) }),
  z.strictObject({ type: z.literal('float'), default: z.number().finite() }),
  z.strictObject({ type: z.literal('int'), default: z.number().int() }),
]);
export const AnimatorControllerSchema = z
  .strictObject({
    version: z.literal(1),
    initial: z.string().min(1),
    parameters: z.record(z.string(), ParameterSchema),
    states: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          clip: z.string().min(1),
          speed: z.number().finite().positive(),
        }),
      )
      .min(1),
    transitions: z.array(
      z.strictObject({
        from: z.string(),
        to: z.string(),
        exitTime: z.number().finite().nonnegative().nullable(),
        conditions: z.array(
          z.strictObject({
            parameter: z.string(),
            operator: z.enum(['==', '!=', '>', '<', '>=', '<=']),
            value: z.union([z.boolean(), z.number().finite()]),
          }),
        ),
      }),
    ),
  })
  .superRefine((c, ctx) => {
    const names = new Set(c.states.map((s) => s.name));
    if (names.size !== c.states.length || !names.has(c.initial))
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate state or missing initial state',
      });
    for (const t of c.transitions) {
      if ((t.from !== '*' && !names.has(t.from)) || !names.has(t.to))
        ctx.addIssue({
          code: 'custom',
          message: 'Transition references missing state',
        });
      for (const condition of t.conditions) {
        const p = c.parameters[condition.parameter];
        if (
          !p ||
          typeof p.default !== typeof condition.value ||
          (typeof p.default === 'boolean' &&
            !['==', '!='].includes(condition.operator))
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid transition parameter/condition',
          });
      }
    }
  });
export type AnimatorController = z.infer<typeof AnimatorControllerSchema>;
const AnimatorSchema = z.strictObject({
  controller: z.string(),
  speed: z.number().finite().nonnegative(),
});
export const Animator: ComponentDefinition<z.infer<typeof AnimatorSchema>> = {
  type: 'protomake.animator',
  displayName: 'Animator',
  schema: AnimatorSchema,
  defaults: () => ({ controller: '', speed: 1 }),
  inspector: [
    { path: 'controller', label: 'Controller', kind: 'asset' },
    { path: 'speed', label: 'Playback speed', kind: 'number' },
  ],
};
export function animationAssets(assets: readonly AssetData[]): {
  clips: Map<string, AnimationClip>;
  controllers: Map<string, AnimatorController>;
} {
  const clips = new Map(
    assets
      .filter((a) => a.mime === CLIP_MIME)
      .map((a) => [a.id, AnimationClipSchema.parse(JSON.parse(a.data))]),
  );
  const controllers = new Map(
    assets
      .filter((a) => a.mime === CONTROLLER_MIME)
      .map((a) => [a.id, AnimatorControllerSchema.parse(JSON.parse(a.data))]),
  );
  for (const clip of clips.values())
    for (const f of clip.frames)
      if (!assets.some((a) => a.id === f.texture && a.kind === 'image'))
        throw new Error(`Animation ${clip.name}: missing image ${f.texture}`);
  for (const c of controllers.values())
    for (const s of c.states)
      if (!clips.has(s.clip))
        throw new Error(`Animator state ${s.name}: missing clip ${s.clip}`);
  return { clips, controllers };
}
export function frameAt(clip: AnimationClip, time: number): number {
  const duration = clip.frames.reduce((n, f) => n + f.duration, 0);
  let position = clip.loop
    ? ((time % duration) + duration) % duration
    : Math.max(0, Math.min(time, duration));
  for (let i = 0; i < clip.frames.length; i++) {
    if (position < clip.frames[i]!.duration) return i;
    position -= clip.frames[i]!.duration;
  }
  return clip.frames.length - 1;
}
interface Playback {
  controller: string;
  state: string;
  elapsed: number;
  parameters: Record<string, boolean | number>;
}
export class AnimationSystem implements System {
  readonly id = 'protomake.animation';
  private readonly data: ReturnType<typeof animationAssets>;
  private readonly players = new Map<Guid, Playback>();
  constructor(
    private readonly world: World,
    assets: readonly AssetData[],
  ) {
    this.data = animationAssets(assets);
  }
  private player(id: Guid): Playback {
    const entity = this.world.find(id);
    const component =
      entity === undefined ? undefined : this.world.read(entity, Animator);
    if (!component?.controller)
      throw new Error(`Entity ${id} has no Animator controller`);
    const controller = this.data.controllers.get(component.controller);
    if (!controller)
      throw new Error(`Missing Animator controller ${component.controller}`);
    let player = this.players.get(id);
    if (!player || player.controller !== component.controller) {
      player = {
        controller: component.controller,
        state: controller.initial,
        elapsed: 0,
        parameters: Object.fromEntries(
          Object.entries(controller.parameters).map(([k, p]) => [k, p.default]),
        ),
      };
      this.players.set(id, player);
    }
    return player;
  }
  setParameter(id: Guid, name: string, value: boolean | number): void {
    const player = this.player(id),
      definition = this.data.controllers.get(player.controller)!.parameters[
        name
      ];
    if (
      !definition ||
      typeof value !== typeof definition.default ||
      (typeof value === 'number' &&
        (!Number.isFinite(value) ||
          (definition.type === 'int' && !Number.isInteger(value))))
    )
      throw new Error(`Invalid Animator parameter ${name}`);
    player.parameters[name] = value;
  }
  trigger(id: Guid, name: string): void {
    const player = this.player(id);
    if (
      this.data.controllers.get(player.controller)!.parameters[name]?.type !==
      'trigger'
    )
      throw new Error(`Not a trigger: ${name}`);
    player.parameters[name] = true;
  }
  state(id: Guid): string {
    return this.player(id).state;
  }
  start(): void {
    this.advance(0);
  }
  update(context: EngineContext): void {
    this.advance(context.time.delta);
  }
  private advance(delta: number): void {
    const present = new Set<string>();
    for (const [id] of this.world.query(Animator.type)) {
      const data = this.world.read(id, Animator)!;
      if (!data.controller) continue;
      const stable = this.world.get(id).guid;
      present.add(stable);
      const p = this.player(stable);
      if (!this.world.isActive(id)) continue;
      const c = this.data.controllers.get(p.controller)!,
        state = c.states.find((s) => s.name === p.state)!,
        clip = this.data.clips.get(state.clip)!;
      p.elapsed += delta * data.speed * state.speed * clip.speed;
      const duration = clip.frames.reduce((sum, f) => sum + f.duration, 0);
      const transition = c.transitions.find(
        (t) =>
          (t.from === p.state || t.from === '*') &&
          (t.exitTime === null || p.elapsed / duration >= t.exitTime) &&
          t.conditions.every((condition) => {
            const a = p.parameters[condition.parameter]!,
              b = condition.value;
            switch (condition.operator) {
              case '==':
                return a === b;
              case '!=':
                return a !== b;
              case '>':
                return a > b;
              case '<':
                return a < b;
              case '>=':
                return a >= b;
              case '<=':
                return a <= b;
            }
          }),
      );
      if (transition) {
        p.state = transition.to;
        p.elapsed = 0;
        for (const condition of transition.conditions)
          if (c.parameters[condition.parameter]!.type === 'trigger')
            p.parameters[condition.parameter] = false;
      }
      const current = this.data.clips.get(
        c.states.find((s) => s.name === p.state)!.clip,
      )!;
      const sprite = this.world.read(id, SpriteRenderer);
      if (!sprite)
        throw new Error(`Animator entity ${stable} requires Sprite Renderer`);
      const texture = current.frames[frameAt(current, p.elapsed)]!.texture;
      if (sprite.texture !== texture)
        this.world.set(id, SpriteRenderer.type, { ...sprite, texture });
    }
    for (const id of this.players.keys())
      if (!present.has(id)) this.players.delete(id);
  }
  stop(): void {
    this.players.clear();
  }
}
