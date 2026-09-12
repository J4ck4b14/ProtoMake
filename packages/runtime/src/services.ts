import {
  composeAffine,
  decompose,
  guid,
  inverse,
  multiply,
  type Guid,
  type World,
} from '@protomake/core';
import type { EngineContext, System } from './engine';

export type SignalHandler = (payload: unknown) => void;

/** Project signals are named runtime channels. Ownership makes behaviour teardown deterministic. */
export class SignalService {
  private readonly listeners = new Map<
    string,
    Map<string, Set<SignalHandler>>
  >();

  on(name: string, owner: string, handler: SignalHandler): () => void {
    if (!name.trim()) throw new Error('Signal name is required');
    let channel = this.listeners.get(name);
    if (!channel) {
      channel = new Map();
      this.listeners.set(name, channel);
    }
    let handlers = channel.get(owner);
    if (!handlers) {
      handlers = new Set();
      channel.set(owner, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
      if (!handlers!.size) channel!.delete(owner);
      if (!channel!.size) this.listeners.delete(name);
    };
  }

  emit(name: string, payload?: unknown): void {
    if (!name.trim()) throw new Error('Signal name is required');
    const handlers = [...(this.listeners.get(name)?.values() ?? [])].flatMap(
      (group) => [...group],
    );
    for (const handler of handlers) handler(payload);
  }

  clearOwner(owner: string): void {
    for (const [name, channel] of this.listeners) {
      channel.delete(owner);
      if (!channel.size) this.listeners.delete(name);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export type TimerHandle = string;
interface TimerRecord {
  readonly handle: TimerHandle;
  readonly owner: string;
  readonly interval: number;
  readonly repeat: boolean;
  readonly callback: () => void;
  remaining: number;
}

export class TimerService implements System {
  readonly id = 'protomake.timers';
  private readonly timers = new Map<TimerHandle, TimerRecord>();

  after(owner: string, seconds: number, callback: () => void): TimerHandle {
    return this.add(owner, seconds, false, callback);
  }

  every(owner: string, seconds: number, callback: () => void): TimerHandle {
    return this.add(owner, seconds, true, callback);
  }

  private add(
    owner: string,
    seconds: number,
    repeat: boolean,
    callback: () => void,
  ): TimerHandle {
    if (!Number.isFinite(seconds) || seconds < 0 || (repeat && seconds === 0))
      throw new Error('Timer duration must be finite and non-negative');
    const handle = guid();
    this.timers.set(handle, {
      handle,
      owner,
      interval: seconds,
      repeat,
      callback,
      remaining: seconds,
    });
    return handle;
  }

  cancel(handle: TimerHandle): void {
    this.timers.delete(handle);
  }

  cancelOwner(owner: string): void {
    for (const [handle, timer] of this.timers)
      if (timer.owner === owner) this.timers.delete(handle);
  }

  update(context: EngineContext): void {
    for (const timer of [...this.timers.values()]) {
      if (!this.timers.has(timer.handle)) continue;
      timer.remaining -= context.time.delta;
      if (timer.remaining > 0) continue;
      if (timer.repeat) {
        timer.remaining += timer.interval;
        if (timer.remaining <= 0) timer.remaining = timer.interval;
      } else this.timers.delete(timer.handle);
      timer.callback();
    }
  }

  stop(): void {
    this.timers.clear();
  }
}

export type TweenHandle = string;
export type TweenEasing =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeOutCubic';
export interface TweenOptions {
  readonly position?: readonly [number, number];
  readonly rotation?: number;
  readonly scale?: readonly [number, number];
  readonly opacity?: number;
  readonly duration: number;
  readonly easing?: TweenEasing;
  readonly onComplete?: () => void;
}
interface TweenRecord {
  readonly handle: TweenHandle;
  readonly owner: string;
  readonly entity: Guid;
  readonly duration: number;
  readonly easing: TweenEasing;
  readonly from: ReturnType<typeof decompose>;
  readonly to: ReturnType<typeof decompose>;
  readonly fromOpacity?: number;
  readonly toOpacity?: number;
  readonly onComplete?: () => void;
  elapsed: number;
}

const easings: Record<TweenEasing, (value: number) => number> = {
  linear: (value) => value,
  easeInQuad: (value) => value * value,
  easeOutQuad: (value) => 1 - (1 - value) ** 2,
  easeInOutQuad: (value) =>
    value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2,
  easeOutCubic: (value) => 1 - (1 - value) ** 3,
};

export class TweenService implements System {
  readonly id = 'protomake.tweens';
  private readonly tweens = new Map<TweenHandle, TweenRecord>();

  constructor(private readonly world: World) {}

  to(owner: string, entity: Guid, options: TweenOptions): TweenHandle {
    if (!Number.isFinite(options.duration) || options.duration < 0)
      throw new Error('Tween duration must be finite and non-negative');
    if (
      options.opacity !== undefined &&
      (!Number.isFinite(options.opacity) ||
        options.opacity < 0 ||
        options.opacity > 1)
    )
      throw new Error('Tween opacity must be between 0 and 1');
    const id = this.world.find(entity);
    if (id === undefined) throw new Error(`Missing entity reference ${entity}`);
    const from = decompose(this.world.worldMatrix(id)),
      sprite = this.world.components(id).get('protomake.sprite') as
        | { opacity?: number }
        | undefined,
      handle = guid(),
      tween: TweenRecord = {
        handle,
        owner,
        entity,
        duration: options.duration,
        easing: options.easing ?? 'linear',
        from,
        to: {
          ...from,
          ...(options.position
            ? { x: options.position[0], y: options.position[1] }
            : {}),
          ...(options.rotation !== undefined
            ? { rotation: options.rotation }
            : {}),
          ...(options.scale
            ? { scaleX: options.scale[0], scaleY: options.scale[1] }
            : {}),
        },
        ...(sprite?.opacity !== undefined
          ? { fromOpacity: sprite.opacity }
          : {}),
        ...(options.opacity !== undefined
          ? { toOpacity: options.opacity }
          : {}),
        ...(options.onComplete ? { onComplete: options.onComplete } : {}),
        elapsed: 0,
      };
    this.tweens.set(handle, tween);
    if (options.duration === 0) this.apply(tween, 1);
    return handle;
  }

  cancel(handle: TweenHandle): void {
    this.tweens.delete(handle);
  }

  cancelOwner(owner: string): void {
    for (const [handle, tween] of this.tweens)
      if (tween.owner === owner) this.tweens.delete(handle);
  }

  update(context: EngineContext): void {
    for (const tween of [...this.tweens.values()]) {
      if (!this.tweens.has(tween.handle)) continue;
      tween.elapsed += context.time.delta;
      const progress =
        tween.duration === 0 ? 1 : Math.min(1, tween.elapsed / tween.duration);
      this.apply(tween, easings[tween.easing](progress));
      if (progress === 1) {
        this.tweens.delete(tween.handle);
        tween.onComplete?.();
      }
    }
  }

  private apply(tween: TweenRecord, progress: number): void {
    const id = this.world.find(tween.entity);
    if (id === undefined) {
      this.tweens.delete(tween.handle);
      return;
    }
    const lerp = (a: number, b: number) => a + (b - a) * progress,
      world = composeAffine({
        x: lerp(tween.from.x, tween.to.x),
        y: lerp(tween.from.y, tween.to.y),
        rotation: lerp(tween.from.rotation, tween.to.rotation),
        scaleX: lerp(tween.from.scaleX, tween.to.scaleX),
        scaleY: lerp(tween.from.scaleY, tween.to.scaleY),
        shear: lerp(tween.from.shear, tween.to.shear),
      }),
      parent = this.world.get(id).parent;
    this.world.setLocalMatrix(
      id,
      parent === null
        ? world
        : multiply(inverse(this.world.worldMatrix(parent)), world),
    );
    if (tween.toOpacity !== undefined) {
      const sprite = this.world.components(id).get('protomake.sprite');
      if (sprite && typeof sprite === 'object')
        this.world.set(id, 'protomake.sprite', {
          ...sprite,
          opacity: lerp(tween.fromOpacity ?? 1, tween.toOpacity),
        });
    }
  }

  stop(): void {
    this.tweens.clear();
  }
}
