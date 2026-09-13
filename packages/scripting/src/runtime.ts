import { inverse, multiply, type World, type Guid } from '@protomake/core';
import type { EngineContext, System } from '@protomake/runtime';
import type { InputService } from '@protomake/input';
import type { Physics2D, ContactEvent } from '@protomake/physics2d/rapier';
import type {
  SignalService,
  TimerHandle,
  TimerService,
  TweenHandle,
  TweenOptions,
  TweenService,
} from '@protomake/runtime';
import {
  hasLineOfSight,
  sampleLighting,
  SpriteRenderer,
  type LightingChannel,
} from '@protomake/renderer';
import { Behaviours, type ScriptField, type ScriptFields } from './component';
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
export interface RuntimePrefabService {
  instantiate(
    prefab: string,
    options?: {
      readonly position?: readonly [number, number];
      readonly rotation?: number;
      readonly parent?: Guid;
    },
  ): Guid;
  destroy(entity: Guid): void;
}
export interface CoordinateService {
  screenPosition(): readonly [number, number];
  worldPosition(): readonly [number, number];
  delta(): readonly [number, number];
  wheel(): number;
  screenToWorld(position: readonly [number, number]): readonly [number, number];
  worldToScreen(position: readonly [number, number]): readonly [number, number];
}
export interface RuntimeScriptServices {
  readonly signals?: SignalService;
  readonly timers?: TimerService;
  readonly tweens?: TweenService;
  readonly prefabs?: RuntimePrefabService;
  readonly coordinates?: CoordinateService;
  readonly graphs?: {
    create(graph: string, values: Readonly<Record<string, unknown>>): Behaviour;
  };
  readonly ui?: {
    setText(entity: Guid, text: string): void;
    setVisible(entity: Guid, visible: boolean): void;
    setValue(entity: Guid, value: number | boolean | string): void;
  };
  readonly save?: {
    register(
      owner: string,
      key: string,
      registration: { capture(): unknown; restore(value: unknown): void },
    ): () => void;
    clearOwner(owner: string): void;
    save(profile?: string, slot?: string): Promise<unknown>;
    load(profile?: string, slot?: string): Promise<unknown>;
    list(profile?: string): Promise<readonly unknown[]>;
    delete(profile: string, slot: string): Promise<void>;
  };
  readonly achievements?: {
    unlock(id: string): boolean;
    isUnlocked(id: string): boolean;
  };
  readonly cameraEffects?: {
    shake(camera: Guid, intensity: number, duration: number): void;
    kick(camera: Guid, x: number, y: number, duration: number): void;
    zoomPulse(camera: Guid, amount: number, duration: number): void;
  };
  readonly particles?: {
    emit(entity: Guid, count?: number): void;
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
  readonly behaviour: string;
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
  readonly entities: {
    withTag(tag: string): readonly Guid[];
    withComponent(type: string): readonly Guid[];
    withComponents(...types: readonly string[]): readonly Guid[];
    closestWithTag(
      tag: string,
      position?: readonly [number, number],
    ): Guid | undefined;
    inRadius(
      position: readonly [number, number],
      radius: number,
    ): readonly Guid[];
  };
  readonly events: {
    emit(name: string, payload?: unknown): void;
    on(name: string, handler: (payload: unknown) => void): () => void;
  };
  readonly time: {
    after(seconds: number, callback: () => void): TimerHandle;
    every(seconds: number, callback: () => void): TimerHandle;
    cancel(handle: TimerHandle): void;
  };
  readonly tween: {
    to(entity: Guid, options: TweenOptions): TweenHandle;
    cancel(handle: TweenHandle): void;
  };
  readonly prefabs: RuntimePrefabService;
  readonly pointer: {
    readonly screenPosition: readonly [number, number];
    readonly worldPosition: readonly [number, number];
    readonly delta: readonly [number, number];
    readonly wheel: number;
  };
  readonly camera: {
    screenToWorld(
      position: readonly [number, number],
    ): readonly [number, number];
    worldToScreen(
      position: readonly [number, number],
    ): readonly [number, number];
    shake(camera: Guid, intensity: number, duration: number): void;
    kick(camera: Guid, x: number, y: number, duration: number): void;
    zoomPulse(camera: Guid, amount: number, duration: number): void;
  };
  readonly particles: {
    emit(entity?: Guid, count?: number): void;
  };
  readonly body: {
    velocity(entity?: Guid): readonly [number, number];
    setVelocity(x: number, y: number, entity?: Guid): void;
    impulse(x: number, y: number, entity?: Guid): void;
    teleport(x: number, y: number, entity?: Guid): void;
  };
  readonly character: {
    moveAndSlide(
      velocity: readonly [number, number],
      delta?: number,
      entity?: Guid,
    ): {
      readonly velocity: readonly [number, number];
      readonly grounded: boolean;
      readonly floorNormal: readonly [number, number];
    };
    state(entity?: Guid): {
      readonly grounded: boolean;
      readonly floorNormal: readonly [number, number];
      readonly floorEntity?: string;
      readonly onWall: boolean;
      readonly onCeiling: boolean;
    };
  };
  readonly ui: {
    setText(entity: Guid, text: string): void;
    setVisible(entity: Guid, visible: boolean): void;
    setValue(entity: Guid, value: number | boolean | string): void;
  };
  readonly save: {
    register(
      key: string,
      capture: () => unknown,
      restore: (value: unknown) => void,
    ): () => void;
    save(profile?: string, slot?: string): Promise<unknown>;
    load(profile?: string, slot?: string): Promise<unknown>;
    list(profile?: string): Promise<readonly unknown[]>;
    delete(profile: string, slot: string): Promise<void>;
  };
  readonly achievements: {
    unlock(id: string): boolean;
    isUnlocked(id: string): boolean;
  };
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
  owner: string;
  behaviourId: string;
  source: string;
  behaviour: Behaviour;
  active: boolean;
  started: boolean;
  context: ScriptContext;
}
export interface RuntimeExposedField {
  readonly name: string;
  readonly type: ScriptField['type'] | 'vector2';
  readonly value: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
}
export interface RuntimeBehaviourSnapshot {
  readonly entity: Guid;
  readonly id: string;
  readonly kind: 'script' | 'graph';
  readonly source: string;
  readonly active: boolean;
  readonly fields: readonly RuntimeExposedField[];
}
interface RuntimeInspectableBehaviour extends Behaviour {
  runtimeValues?(): Readonly<Record<string, unknown>>;
  runtimeFields?(): Readonly<
    Record<string, { type: RuntimeExposedField['type'] }>
  >;
  setRuntimeValue?(name: string, value: unknown): void;
}
export class ScriptSystem implements System {
  readonly id = 'protomake.scripts';
  private instances = new Map<string, Instance>();
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
    private readonly services: RuntimeScriptServices = {},
  ) {}
  runtimeBehaviours(): readonly RuntimeBehaviourSnapshot[] {
    return [...this.instances.values()].map((instance) => {
      const numeric = this.world.find(instance.id),
        data =
          numeric === undefined
            ? undefined
            : this.world.read(numeric, Behaviours)?.items[instance.behaviourId],
        inspectable = instance.behaviour as RuntimeInspectableBehaviour;
      if (!data)
        return {
          entity: instance.id,
          id: instance.behaviourId,
          kind: 'script' as const,
          source: instance.source,
          active: instance.active,
          fields: [],
        };
      if (data.kind === 'script') {
        const definitions = this.fields.get(data.script) ?? {};
        return {
          entity: instance.id,
          id: instance.behaviourId,
          kind: data.kind,
          source: data.script,
          active: instance.active,
          fields: Object.entries(definitions).map(([name, field]) => ({
            name,
            type: field.type,
            value: (instance.behaviour as unknown as Record<string, unknown>)[
              name
            ],
            ...(field.min === undefined ? {} : { min: field.min }),
            ...(field.max === undefined ? {} : { max: field.max }),
            ...(field.step === undefined ? {} : { step: field.step }),
            ...(field.options === undefined ? {} : { options: field.options }),
          })),
        };
      }
      const values = inspectable.runtimeValues?.() ?? data.values,
        definitions = inspectable.runtimeFields?.() ?? {};
      return {
        entity: instance.id,
        id: instance.behaviourId,
        kind: data.kind,
        source: data.graph,
        active: instance.active,
        fields: Object.entries(definitions).map(([name, field]) => ({
          name,
          type: field.type,
          value: values[name],
        })),
      };
    });
  }
  setRuntimeValue(
    entity: Guid,
    behaviourId: string,
    name: string,
    value: unknown,
  ): void {
    const owner = `${entity}:${behaviourId}`,
      instance = this.instances.get(owner),
      numeric = this.world.find(entity),
      behaviours =
        numeric === undefined
          ? undefined
          : this.world.read(numeric, Behaviours),
      item = behaviours?.items[behaviourId];
    if (!instance || numeric === undefined || !behaviours || !item)
      throw new Error(`Missing runtime behaviour ${owner}`);
    if (item.kind === 'script') {
      const field = this.fields.get(item.script)?.[name];
      if (!field) throw new Error(`Missing exposed field ${name}`);
      const expected =
        field.type === 'number'
          ? 'number'
          : field.type === 'boolean'
            ? 'boolean'
            : 'string';
      if (
        typeof value !== expected ||
        (typeof value === 'number' && !Number.isFinite(value))
      )
        throw new Error(`${name} must be ${expected}`);
      if (
        typeof value === 'number' &&
        ((field.min !== undefined && value < field.min) ||
          (field.max !== undefined && value > field.max))
      )
        throw new Error(`${name} is outside its exposed range`);
      if (field.options?.length && !field.options.includes(String(value)))
        throw new Error(`${name} is not an exposed option`);
      (instance.behaviour as unknown as Record<string, unknown>)[name] = value;
    } else {
      const inspectable = instance.behaviour as RuntimeInspectableBehaviour;
      if (!inspectable.setRuntimeValue)
        throw new Error('Graph runtime does not support live variables');
      inspectable.setRuntimeValue(name, value);
    }
    const next = structuredClone(behaviours);
    next.items[behaviourId]!.values[name] = value as never;
    this.world.set(numeric, Behaviours.type, next);
  }
  private context(
    id: Guid,
    behaviourId: string,
    owner: string,
    active: () => boolean,
  ): ScriptContext {
    const clock = () => this.time,
      entity = (stable: Guid = id) => {
        const found = this.world.find(stable);
        if (found === undefined)
          throw new Error(`Missing entity reference ${stable}`);
        return found;
      },
      ids = (items: readonly number[]) =>
        items.map((item) => this.world.get(item).guid),
      coordinates = this.services.coordinates,
      unavailable = (name: string): never => {
        throw new Error(`${name} service unavailable`);
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
      behaviour: behaviourId,
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
      entities: {
        withTag: (tag) => ids(this.world.withTag(tag)),
        withComponent: (type) => ids(this.world.withComponent(type)),
        withComponents: (...types) => ids(this.world.withComponents(...types)),
        closestWithTag: (
          tag,
          position = this.world.worldPosition(entity()),
        ) => {
          const found = this.world.closestWithTag(tag, position);
          return found === undefined ? undefined : this.world.get(found).guid;
        },
        inRadius: (position, radius) =>
          ids(this.world.inRadius(position, radius)),
      },
      events: {
        emit: (name, payload) => {
          const signals = this.services.signals;
          if (!signals) throw new Error('Signal service unavailable');
          signals.emit(name, payload);
        },
        on: (name, handler) => {
          const signals = this.services.signals;
          if (!signals) return unavailable('Signal');
          return signals.on(name, owner, (payload) => {
            if (active()) handler(payload);
          });
        },
      },
      time: {
        after: (seconds, callback) =>
          this.services.timers?.after(owner, seconds, () => {
            if (active()) callback();
          }) ?? unavailable('Timer'),
        every: (seconds, callback) =>
          this.services.timers?.every(owner, seconds, () => {
            if (active()) callback();
          }) ?? unavailable('Timer'),
        cancel: (handle) => this.services.timers?.cancel(handle),
      },
      tween: {
        to: (stable, options) =>
          this.services.tweens?.to(owner, stable, options) ??
          unavailable('Tween'),
        cancel: (handle) => this.services.tweens?.cancel(handle),
      },
      prefabs: {
        instantiate: (prefab, options) => {
          const prefabs = this.services.prefabs;
          if (!prefabs) return unavailable('Prefab');
          return prefabs.instantiate(prefab, options);
        },
        destroy: (stable) => {
          const prefabs = this.services.prefabs;
          if (!prefabs) throw new Error('Prefab service unavailable');
          prefabs.destroy(stable);
        },
      },
      pointer: {
        get screenPosition() {
          return coordinates?.screenPosition() ?? [0, 0];
        },
        get worldPosition() {
          return coordinates?.worldPosition() ?? [0, 0];
        },
        get delta() {
          return coordinates?.delta() ?? [0, 0];
        },
        get wheel() {
          return coordinates?.wheel() ?? 0;
        },
      },
      camera: {
        screenToWorld: (position) =>
          coordinates?.screenToWorld(position) ?? position,
        worldToScreen: (position) =>
          coordinates?.worldToScreen(position) ?? position,
        shake: (camera, intensity, duration) => {
          const effects = this.services.cameraEffects;
          if (!effects) return unavailable('Camera effects');
          effects.shake(camera, intensity, duration);
        },
        kick: (camera, x, y, duration) => {
          const effects = this.services.cameraEffects;
          if (!effects) return unavailable('Camera effects');
          effects.kick(camera, x, y, duration);
        },
        zoomPulse: (camera, amount, duration) => {
          const effects = this.services.cameraEffects;
          if (!effects) return unavailable('Camera effects');
          effects.zoomPulse(camera, amount, duration);
        },
      },
      particles: {
        emit: (stable = id, count = 1) => {
          const particles = this.services.particles;
          if (!particles) return unavailable('Particles');
          particles.emit(stable, count);
        },
      },
      body: {
        velocity: (stable = id) => this.physics.velocity(stable),
        setVelocity: (x, y, stable = id) =>
          this.physics.setVelocity(stable, x, y),
        impulse: (x, y, stable = id) => this.physics.impulse(stable, x, y),
        teleport: (x, y, stable = id) => this.physics.teleport(stable, x, y),
      },
      character: {
        moveAndSlide: (velocity, delta = clock().delta, stable = id) =>
          this.physics.moveAndSlide(stable, velocity, delta),
        state: (stable = id) => this.physics.characterState(stable),
      },
      ui: {
        setText: (stable, text) => {
          if (!this.services.ui) return unavailable('UI');
          this.services.ui.setText(stable, text);
        },
        setVisible: (stable, visible) => {
          if (!this.services.ui) return unavailable('UI');
          this.services.ui.setVisible(stable, visible);
        },
        setValue: (stable, value) => {
          if (!this.services.ui) return unavailable('UI');
          this.services.ui.setValue(stable, value);
        },
      },
      save: {
        register: (key, capture, restore) => {
          const save = this.services.save;
          if (!save) return unavailable('Save');
          return save.register(owner, `${id}.${behaviourId}.${key}`, {
            capture,
            restore,
          });
        },
        save: (profile, slot) =>
          this.services.save?.save(profile, slot) ??
          Promise.reject(new Error('Save service unavailable')),
        load: (profile, slot) =>
          this.services.save?.load(profile, slot) ??
          Promise.reject(new Error('Save service unavailable')),
        list: (profile) =>
          this.services.save?.list(profile) ??
          Promise.reject(new Error('Save service unavailable')),
        delete: (profile, slot) =>
          this.services.save?.delete(profile, slot) ??
          Promise.reject(new Error('Save service unavailable')),
      },
      achievements: {
        unlock: (achievement) => {
          const service = this.services.achievements;
          if (!service) return unavailable('Achievement');
          return service.unlock(achievement);
        },
        isUnlocked: (achievement) => {
          const service = this.services.achievements;
          if (!service) return unavailable('Achievement');
          return service.isUnlocked(achievement);
        },
      },
      loadScene: this.loadScene,
      log: (message) => this.log(`[${id}] ${message}`),
    };
  }
  private dispose(instance: Instance): void {
    const errors: unknown[] = [];
    try {
      if (instance.active) this.call(instance, 'onDisable');
    } catch (error) {
      errors.push(error);
    }
    try {
      this.call(instance, 'onDestroy');
    } catch (error) {
      errors.push(error);
    } finally {
      this.services.signals?.clearOwner(instance.owner);
      this.services.timers?.cancelOwner(instance.owner);
      this.services.tweens?.cancelOwner(instance.owner);
      this.services.save?.clearOwner(instance.owner);
      this.instances.delete(instance.owner);
    }
    if (errors.length)
      throw new AggregateError(errors, 'Behaviour cleanup failed');
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
        `Behaviour ${instance.source}, entity ${instance.id}, ${hook}: ${String(error)}`,
        { cause: error },
      );
    }
  }
  private synchronize(): void {
    const present = new Set<Guid>();
    for (const [numeric] of this.world.query(Behaviours.type)) {
      const data = this.world.read(numeric, Behaviours)!,
        id = this.world.get(numeric).guid;
      for (const behaviourId of data.order) {
        const dataItem = data.items[behaviourId]!;
        const source =
          dataItem.kind === 'script' ? dataItem.script : dataItem.graph;
        if (!source) continue;
        const owner = `${id}:${behaviourId}`;
        present.add(owner);
        let instance = this.instances.get(owner);
        if (instance && instance.source !== `${dataItem.kind}:${source}`) {
          this.dispose(instance);
          instance = undefined;
        }
        if (!instance) {
          let behaviour: Behaviour;
          if (dataItem.kind === 'script') {
            const module = this.modules.get(dataItem.script),
              fields = this.fields.get(dataItem.script);
            if (!module || typeof module.default !== 'function' || !fields)
              throw new Error(
                `Entity ${this.world.get(numeric).name}: missing compiled script ${dataItem.script}`,
              );
            behaviour = new module.default();
            for (const [name, field] of Object.entries(fields)) {
              const value = dataItem.values[name] ?? field.default;
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
          } else {
            const graphs = this.services.graphs;
            if (!graphs) throw new Error('Behaviour Graph service unavailable');
            behaviour = graphs.create(dataItem.graph, dataItem.values);
          }
          const context = this.context(
            id,
            behaviourId,
            owner,
            () => this.instances.get(owner)?.active ?? false,
          );
          instance = {
            id,
            owner,
            behaviourId,
            source: `${dataItem.kind}:${source}`,
            behaviour,
            active: false,
            started: false,
            context,
          };
          this.instances.set(owner, instance);
          this.call(instance, 'awake');
        }
        const active = this.world.isActive(numeric) && dataItem.enabled;
        if (active !== instance.active) {
          instance.active = active;
          this.call(instance, active ? 'onEnable' : 'onDisable');
        }
        if (active && !instance.started) {
          instance.started = true;
          this.call(instance, 'start');
        }
      }
    }
    for (const [owner, instance] of [...this.instances])
      if (!present.has(owner)) this.dispose(instance);
  }
  start(): void {
    this.off = this.physics.events.on('contact', (event) => {
      for (const id of new Set([event.a, event.b]))
        for (const instance of this.instances.values())
          if (instance.id === id && instance.active)
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
        this.dispose(instance);
      } catch (error) {
        errors.push(error);
      }
    }
    this.instances.clear();
    if (errors.length)
      throw new AggregateError(errors, 'Script cleanup failed');
  }
}
