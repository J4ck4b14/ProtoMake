import { EventBus, type World } from '@protomake/core';
import { TimeService, type TimeSnapshot } from './time';
export interface EngineContext {
  readonly world: World;
  readonly time: TimeSnapshot;
}
export interface System {
  readonly id: string;
  start?(context: EngineContext): void;
  fixedUpdate?(context: EngineContext): void;
  update?(context: EngineContext): void;
  lateUpdate?(context: EngineContext): void;
  stop?(context: EngineContext): void;
}
export type EngineState = 'stopped' | 'running' | 'paused' | 'faulted';
interface EngineEvents {
  state: EngineState;
  error: { system: string; phase: string; cause: unknown };
  frame: TimeSnapshot;
}
export interface EngineProfile {
  readonly frameMs: number;
  readonly fixedSteps: number;
  readonly droppedSeconds: number;
  readonly systems: Readonly<Record<string, number>>;
}
const now = () => globalThis.performance?.now() ?? Date.now();
/** Coordinates lifecycle only. Scheduling is supplied by the host (browser, tests, or future worker). */
export class Engine {
  readonly events = new EventBus<EngineEvents>();
  private readonly systems: System[] = [];
  private started: System[] = [];
  private status: EngineState = 'stopped';
  private busy = false;
  private profiling: Map<string, number> | undefined;
  private profileValue: EngineProfile = {
    frameMs: 0,
    fixedSteps: 0,
    droppedSeconds: 0,
    systems: {},
  };
  constructor(
    readonly world: World,
    readonly time = new TimeService(),
  ) {}
  get state(): EngineState {
    return this.status;
  }
  get profile(): EngineProfile {
    return structuredClone(this.profileValue);
  }
  addSystem(system: System): void {
    if (this.status !== 'stopped' || this.busy)
      throw new Error('Systems can only be added while stopped');
    if (this.systems.some((s) => s.id === system.id))
      throw new Error(`Duplicate system ${system.id}`);
    this.systems.push(system);
  }
  private context(): EngineContext {
    return { world: this.world, time: this.time.snapshot() };
  }
  private setState(state: EngineState): void {
    this.status = state;
    this.events.emit('state', state);
  }
  private invoke(
    system: System,
    phase: 'start' | 'fixedUpdate' | 'update' | 'lateUpdate' | 'stop',
  ): void {
    const started = now();
    try {
      system[phase]?.(this.context());
    } catch (cause) {
      this.status = 'faulted';
      this.events.emit('error', { system: system.id, phase, cause });
      throw cause;
    } finally {
      if (this.profiling)
        this.profiling.set(
          system.id,
          (this.profiling.get(system.id) ?? 0) + now() - started,
        );
    }
  }
  private guard(): void {
    if (this.busy) throw new Error('Reentrant lifecycle operation');
  }
  start(): void {
    this.guard();
    if (this.status !== 'stopped')
      throw new Error('Engine must be stopped before start');
    this.busy = true;
    try {
      this.time.reset();
      for (const system of this.systems) {
        this.started.push(system);
        this.invoke(system, 'start');
      }
      this.setState('running');
    } finally {
      this.busy = false;
    }
  }
  pause(): void {
    this.guard();
    if (this.status !== 'running') throw new Error('Engine is not running');
    this.setState('paused');
  }
  resume(): void {
    this.guard();
    if (this.status !== 'paused') throw new Error('Engine is not paused');
    this.setState('running');
  }
  tick(seconds: number): void {
    this.guard();
    if (this.status === 'paused' || this.status === 'stopped') return;
    if (this.status === 'faulted')
      throw new Error('Engine faulted; stop before restarting');
    this.advance(seconds);
  }
  step(): void {
    this.guard();
    if (this.status !== 'paused')
      throw new Error('Step requires a paused engine');
    this.advance(this.time.fixedDelta);
  }
  private advance(seconds: number): void {
    this.busy = true;
    const started = now();
    this.profiling = new Map();
    let steps = 0;
    try {
      steps = this.time.advance(seconds);
      for (let i = 0; i < steps; i++) {
        this.time.consumeFixed();
        for (const system of this.systems) this.invoke(system, 'fixedUpdate');
      }
      for (const system of this.systems) this.invoke(system, 'update');
      for (const system of this.systems) this.invoke(system, 'lateUpdate');
      this.events.emit('frame', this.time.snapshot());
    } finally {
      this.profileValue = {
        frameMs: now() - started,
        fixedSteps: steps,
        droppedSeconds: this.time.snapshot().dropped,
        systems: Object.fromEntries(this.profiling),
      };
      this.profiling = undefined;
      this.busy = false;
    }
  }
  stop(): void {
    this.guard();
    this.busy = true;
    const failures: unknown[] = [];
    try {
      for (const system of [...this.started].reverse()) {
        try {
          this.invoke(system, 'stop');
        } catch (error) {
          failures.push(error);
        }
      }
      this.started = [];
      this.setState('stopped');
    } finally {
      this.busy = false;
    }
    if (failures.length)
      throw new AggregateError(failures, 'System cleanup failed');
  }
}
