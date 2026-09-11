import { inverse, multiply, type World, type Guid } from '@protomake/core';
import type { EngineContext, System } from '@protomake/runtime';
import type { InputService } from '@protomake/input';
import type { Physics2D, ContactEvent } from '@protomake/physics2d/rapier';
import {
  hasLineOfSight,
  sampleLighting,
  SpriteRenderer,
  type LightingChannel,
} from '@protomake/renderer';
import { ScriptBehaviour, type ScriptFields } from './component';
export interface MediaServices {
  animation?: {
    setParameter(id: Guid, name: string, value: boolean | number): void;
    trigger(id: Guid, name: string): void;
    state(id: Guid): string;
  };
  audio?: {
    play(id: Guid, resume?: boolean): void;
    pauseSource(id: Guid): void;
    stopSource(id: Guid): void;
    setBus(name: string, volume: number, muted?: boolean): void;
  };
}
export interface ScriptContext {
  setParameter(name: string, value: boolean | number, entity?: Guid): void;
  trigger(name: string, entity?: Guid): void;
  animationState(entity?: Guid): string;
  playAudio(entity?: Guid, resume?: boolean): void;
  pauseAudio(entity?: Guid): void;
  stopAudio(entity?: Guid): void;
  setBus(name: string, volume: number, muted?: boolean): void;
  readonly entity: Guid;
  readonly world: World;
  readonly input: InputService;
  readonly physics: Physics2D;
  readonly delta: number;
  readonly elapsed: number;
  position(entity?: Guid): readonly [number, number];
  setPosition(x: number, y: number, entity?: Guid): void;
  /** Perceptual 0..1 illumination at an entity centre, including sprite shadow occlusion. */
  illumination(entity?: Guid): number;
  /** Perceptual 0..1 illumination at an arbitrary world point. */
  lightAt(x: number, y: number, channel?: LightingChannel): number;
  /** True when target is within range/FOV and not blocked by a shadow-caster shape. */
  canSee(
    target: Guid,
    range?: number,
    fovDegrees?: number,
    observer?: Guid,
  ): boolean;
  get<T = unknown>(type: string, entity?: Guid): T | undefined;
  set(type: string, value: unknown, entity?: Guid): void;
  find(name: string): Guid | undefined;
  loadScene(idOrName: string): void;
  log(message: string): void;
}
export interface Behaviour {
  awake?(context: ScriptContext): void;
  start?(context: ScriptContext): void;
  update?(context: ScriptContext): void;
  fixedUpdate?(context: ScriptContext): void;
  lateUpdate?(context: ScriptContext): void;
  onEnable?(context: ScriptContext): void;
  onDisable?(context: ScriptContext): void;
  onDestroy?(context: ScriptContext): void;
  onCollisionEnter?(context: ScriptContext, event: ContactEvent): void;
  onCollisionExit?(context: ScriptContext, event: ContactEvent): void;
  onTriggerEnter?(context: ScriptContext, event: ContactEvent): void;
  onTriggerExit?(context: ScriptContext, event: ContactEvent): void;
}
export interface ScriptModule {
  default: new () => Behaviour;
  fields?: ScriptFields;
}
interface Instance {
  id: Guid;
  script: string;
  behaviour: Behaviour;
  active: boolean;
  started: boolean;
  context: ScriptContext;
}
export class ScriptSystem implements System {
  readonly id = 'protomake.scripts';
  private instances = new Map<Guid, Instance>();
  private off: (() => void) | undefined;
  private time = { delta: 0, elapsed: 0 };
  constructor(
    private readonly world: World,
    private readonly input: InputService,
    private readonly physics: Physics2D,
    private readonly modules: ReadonlyMap<string, ScriptModule>,
    private readonly fields: ReadonlyMap<string, ScriptFields>,
    private readonly log: (message: string) => void,
    private readonly loadScene: (id: string) => void,
    private readonly media: MediaServices = {},
  ) {}
  private context(id: Guid): ScriptContext {
    const clock = () => this.time,
      entity = (stable: Guid = id) => {
        const found = this.world.find(stable);
        if (found === undefined)
          throw new Error(`Missing entity reference ${stable}`);
        return found;
      };
    return {
      setParameter: (name, value, stable = id) => {
        if (!this.media.animation)
          throw new Error('Animation service unavailable');
        this.media.animation.setParameter(stable, name, value);
      },
      trigger: (name, stable = id) => {
        if (!this.media.animation)
          throw new Error('Animation service unavailable');
        this.media.animation.trigger(stable, name);
      },
      animationState: (stable = id) => {
        if (!this.media.animation)
          throw new Error('Animation service unavailable');
        return this.media.animation.state(stable);
      },
      playAudio: (stable = id, resume = false) => {
        if (!this.media.audio) throw new Error('Audio service unavailable');
        this.media.audio.play(stable, resume);
      },
      pauseAudio: (stable = id) => this.media.audio?.pauseSource(stable),
      stopAudio: (stable = id) => this.media.audio?.stopSource(stable),
      setBus: (name, volume, muted = false) => {
        if (!this.media.audio) throw new Error('Audio service unavailable');
        this.media.audio.setBus(name, volume, muted);
      },
      entity: id,
      world: this.world,
      input: this.input,
      physics: this.physics,
      get delta() {
        return clock().delta;
      },
      get elapsed() {
        return clock().elapsed;
      },
      position: (stable = id) => this.world.worldPosition(entity(stable)),
      illumination: (stable = id) => {
        const target = entity(stable),
          [x, y] = this.world.worldPosition(target),
          channel =
            this.world.read(target, SpriteRenderer)?.lightingChannel ?? 'World';
        return sampleLighting(this.world, x, y, stable, channel).intensity;
      },
      lightAt: (x, y, channel = 'World') => {
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new Error('Light sample position must be finite');
        return sampleLighting(this.world, x, y, undefined, channel).intensity;
      },
      canSee: (target, range = 500, fovDegrees = 90, observer = id) => {
        if (
          !Number.isFinite(range) ||
          range < 0 ||
          !Number.isFinite(fovDegrees) ||
          fovDegrees < 0 ||
          fovDegrees > 360
        )
          throw new Error(
            'canSee expects a non-negative range and FOV between 0 and 360 degrees',
          );
        const observerId = entity(observer),
          targetId = entity(target),
          observerMatrix = this.world.worldMatrix(observerId),
          [ax, ay] = this.world.worldPosition(observerId),
          [bx, by] = this.world.worldPosition(targetId),
          dx = bx - ax,
          dy = by - ay,
          distance = Math.hypot(dx, dy);
        if (distance > range) return false;
        if (distance > Number.EPSILON && fovDegrees < 360) {
          const forward = Math.atan2(observerMatrix[1], observerMatrix[0]),
            targetAngle = Math.atan2(dy, dx),
            delta = Math.atan2(
              Math.sin(targetAngle - forward),
              Math.cos(targetAngle - forward),
            );
          if (Math.abs(delta) > (fovDegrees * Math.PI) / 360) return false;
        }
        const channel =
          this.world.read(targetId, SpriteRenderer)?.lightingChannel ?? 'World';
        return hasLineOfSight(this.world, observer, target, channel);
      },
      setPosition: (x, y, stable = id) => {
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new Error('Position must be finite');
        if (this.physics.hasBody(stable))
          this.physics.movePosition(stable, x, y);
        else {
          const target = entity(stable),
            m = this.world.worldMatrix(target),
            parent = this.world.get(target).parent;
          const desired = [m[0], m[1], m[2], m[3], x, y] as const;
          this.world.setLocalMatrix(
            target,
            parent === null
              ? desired
              : multiply(inverse(this.world.worldMatrix(parent)), desired),
          );
        }
      },
      get: <T>(type: string, stable = id) =>
        this.world.components(entity(stable)).get(type) as T | undefined,
      set: (type, value, stable = id) =>
        this.world.set(entity(stable), type, value),
      find: (name) => [...this.world.all()].find((e) => e.name === name)?.guid,
      loadScene: this.loadScene,
      log: (message) => this.log(`[${id}] ${message}`),
    };
  }
  private call(
    instance: Instance,
    hook: keyof Behaviour,
    event?: ContactEvent,
  ): void {
    try {
      const method = instance.behaviour[hook];
      if (method)
        (method as (context: ScriptContext, event?: ContactEvent) => void).call(
          instance.behaviour,
          instance.context,
          event,
        );
    } catch (error) {
      throw new Error(
        `Script ${instance.script}, entity ${instance.id}, ${hook}: ${String(error)}`,
        { cause: error },
      );
    }
  }
  private synchronize(): void {
    const present = new Set<Guid>();
    for (const [numeric] of this.world.query(ScriptBehaviour.type)) {
      const data = this.world.read(numeric, ScriptBehaviour)!;
      if (!data.script) continue;
      const id = this.world.get(numeric).guid;
      present.add(id);
      let instance = this.instances.get(id);
      if (instance && instance.script !== data.script) {
        if (instance.active) this.call(instance, 'onDisable');
        this.call(instance, 'onDestroy');
        this.instances.delete(id);
        instance = undefined;
      }
      if (!instance) {
        const module = this.modules.get(data.script),
          fields = this.fields.get(data.script);
        if (!module || typeof module.default !== 'function' || !fields)
          throw new Error(
            `Entity ${this.world.get(numeric).name}: missing compiled script ${data.script}`,
          );
        const behaviour = new module.default();
        for (const [name, field] of Object.entries(fields)) {
          const value = data.values[name] ?? field.default;
          const expected =
            field.type === 'number'
              ? 'number'
              : field.type === 'boolean'
                ? 'boolean'
                : 'string';
          if (typeof value !== expected)
            throw new Error(`Invalid script property ${name}`);
          if (
            field.type === 'entity' &&
            value !== '' &&
            this.world.find(String(value)) === undefined
          )
            throw new Error(`Missing entity reference ${value} in ${name}`);
          Object.defineProperty(behaviour, name, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
        instance = {
          id,
          script: data.script,
          behaviour,
          active: false,
          started: false,
          context: this.context(id),
        };
        this.instances.set(id, instance);
        this.call(instance, 'awake');
      }
      const active = this.world.isActive(numeric);
      if (active !== instance.active) {
        instance.active = active;
        this.call(instance, active ? 'onEnable' : 'onDisable');
      }
      if (active && !instance.started) {
        instance.started = true;
        this.call(instance, 'start');
      }
    }
    for (const [id, instance] of this.instances)
      if (!present.has(id)) {
        if (instance.active) this.call(instance, 'onDisable');
        this.call(instance, 'onDestroy');
        this.instances.delete(id);
      }
  }
  start(): void {
    this.off = this.physics.events.on('contact', (event) => {
      for (const id of new Set([event.a, event.b])) {
        const instance = this.instances.get(id);
        if (instance?.active)
          this.call(
            instance,
            event.sensor
              ? event.started
                ? 'onTriggerEnter'
                : 'onTriggerExit'
              : event.started
                ? 'onCollisionEnter'
                : 'onCollisionExit',
            event,
          );
      }
    });
    this.synchronize();
  }
  private phase(
    context: EngineContext,
    phase: 'fixedUpdate' | 'update' | 'lateUpdate',
  ): void {
    this.time = {
      delta:
        phase === 'fixedUpdate' ? context.time.fixedDelta : context.time.delta,
      elapsed:
        phase === 'fixedUpdate'
          ? context.time.fixedElapsed
          : context.time.elapsed,
    };
    this.synchronize();
    for (const instance of this.instances.values())
      if (instance.active) this.call(instance, phase);
  }
  fixedUpdate(context: EngineContext): void {
    this.phase(context, 'fixedUpdate');
  }
  update(context: EngineContext): void {
    this.phase(context, 'update');
  }
  lateUpdate(context: EngineContext): void {
    this.phase(context, 'lateUpdate');
  }
  stop(): void {
    this.off?.();
    this.off = undefined;
    const errors: unknown[] = [];
    for (const instance of [...this.instances.values()].reverse()) {
      try {
        if (instance.active) this.call(instance, 'onDisable');
      } catch (error) {
        errors.push(error);
      }
      try {
        this.call(instance, 'onDestroy');
      } catch (error) {
        errors.push(error);
      }
    }
    this.instances.clear();
    if (errors.length)
      throw new AggregateError(errors, 'Script cleanup failed');
  }
}
