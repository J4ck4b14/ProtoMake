import { z } from 'zod';
import type { ComponentDefinition, World, Guid } from '@protomake/core';
import type { AssetData } from '@protomake/assets';
import { SPRITE_REGION_MIME } from '@protomake/assets';
import type { EngineContext, System } from '@protomake/runtime';
import { SpriteRenderer } from '@protomake/renderer';
export const CLIP_MIME = 'application/x-protomake-animation',
  CONTROLLER_MIME = 'application/x-protomake-animator';
export const AnimationClipSchema = z
  .strictObject({
    version: z.literal(1),
    name: z.string().min(1),
    loop: z.boolean(),
    speed: z.number().finite().positive(),
    events: z
      .array(
        z.strictObject({
          time: z.number().finite().nonnegative(),
          name: z.string().min(1),
          payload: z
            .union([z.string(), z.number().finite(), z.boolean(), z.null()])
            .optional(),
        }),
      )
      .default([]),
    frames: z
      .array(
        z.strictObject({
          texture: z.string().min(1),
          duration: z.number().finite().positive(),
        }),
      )
      .min(1),
  })
  .superRefine((clip, context) => {
    const duration = clip.frames.reduce(
      (sum, frame) => sum + frame.duration,
      0,
    );
    for (const event of clip.events)
      if (event.time > duration)
        context.addIssue({
          code: 'custom',
          message: `Animation event ${event.name} exceeds clip duration`,
        });
  });
export type AnimationClip = z.infer<typeof AnimationClipSchema>;
export interface AnimationEvent {
  readonly entity: Guid;
  readonly state: string;
  readonly name: string;
  readonly payload?: string | number | boolean | null | undefined;
}
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
        blend: z.number().finite().nonnegative().default(0),
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
      if (
        !assets.some(
          (a) =>
            a.id === f.texture &&
            (a.kind === 'image' || a.mime === SPRITE_REGION_MIME),
        )
      )
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
  previousTexture: string;
  blendElapsed: number;
  blendDuration: number;
  eventsStarted: boolean;
}
export class AnimationSystem implements System {
  readonly id = 'protomake.animation';
  private readonly data: ReturnType<typeof animationAssets>;
  private readonly players = new Map<Guid, Playback>();
  constructor(
    private readonly world: World,
    assets: readonly AssetData[],
    private readonly onEvent: (event: AnimationEvent) => void = () => {},
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
        previousTexture: '',
        blendElapsed: 0,
        blendDuration: 0,
        eventsStarted: false,
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
      const before = p.elapsed;
      p.elapsed += delta * data.speed * state.speed * clip.speed;
      if (!p.eventsStarted) {
        p.eventsStarted = true;
        for (const event of clip.events.filter((item) => item.time === 0))
          this.onEvent({ entity: stable, state: p.state, ...event });
      }
      this.emitEvents(stable, p.state, clip, before, p.elapsed);
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
        p.previousTexture = clip.frames[frameAt(clip, p.elapsed)]!.texture;
        p.blendDuration = transition.blend;
        p.blendElapsed = 0;
        p.state = transition.to;
        p.elapsed = 0;
        p.eventsStarted = false;
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
      p.blendElapsed += delta;
      const blend =
        p.blendDuration > 0 ? Math.min(1, p.blendElapsed / p.blendDuration) : 1;
      if (sprite.texture !== texture || sprite.blend !== blend)
        this.world.set(id, SpriteRenderer.type, {
          ...sprite,
          texture,
          secondaryTexture: blend < 1 ? p.previousTexture : '',
          blend,
        });
    }
    for (const id of this.players.keys())
      if (!present.has(id)) this.players.delete(id);
  }
  private emitEvents(
    entity: Guid,
    state: string,
    clip: AnimationClip,
    from: number,
    to: number,
  ): void {
    if (to <= from || !clip.events.length) return;
    const duration = clip.frames.reduce(
        (sum, frame) => sum + frame.duration,
        0,
      ),
      firstCycle = clip.loop ? Math.floor(from / duration) : 0,
      lastCycle = clip.loop ? Math.floor(to / duration) : 0;
    for (
      let cycle = firstCycle;
      cycle <= Math.min(lastCycle, firstCycle + 64);
      cycle++
    )
      for (const event of clip.events) {
        const at = event.time + cycle * duration;
        if (at > from && at <= to) this.onEvent({ entity, state, ...event });
      }
  }
  stop(): void {
    this.players.clear();
  }
}
