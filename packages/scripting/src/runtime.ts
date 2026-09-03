import { inverse, multiply, type World, type Guid } from '@protomake/core';
import type { EngineContext, System } from '@protomake/runtime';
import type { InputService } from '@protomake/input';
import type { Physics2D, ContactEvent } from '@protomake/physics2d/rapier';
import { ScriptBehaviour, type ScriptFields } from './component';
export interface ScriptContext {
  readonly entity: Guid;
  readonly world: World;
  readonly input: InputService;
  readonly physics: Physics2D;
  readonly delta: number;
  readonly elapsed: number;
  position(entity?: Guid): readonly [number, number];
  setPosition(x: number, y: number, entity?: Guid): void;
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
