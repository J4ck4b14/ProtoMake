export interface TimeSnapshot {
  readonly delta: number;
  readonly elapsed: number;
  readonly fixedDelta: number;
  readonly fixedElapsed: number;
  readonly frame: number;
  readonly alpha: number;
  readonly dropped: number;
}

/**
 * Converts two browser frame timestamps into a safe engine delta.
 *
 * requestAnimationFrame timestamps can be fractionally older than a
 * performance.now() value captured by a load/resume handler in the same
 * refresh cycle. Treat that clock-boundary skew as a zero-length frame rather
 * than faulting an otherwise healthy play session.
 */
export function frameDeltaSeconds(now: number, previous: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(previous)) return 0;
  return Math.max(0, (now - previous) / 1000);
}

export class TimeService {
  private elapsed = 0;
  private fixedElapsed = 0;
  private delta = 0;
  private frame = 0;
  private accumulator = 0;
  private dropped = 0;
  constructor(
    readonly fixedDelta = 1 / 60,
    readonly maxFrameDelta = 0.25,
    readonly maxSubsteps = 8,
  ) {
    if (
      !Number.isFinite(fixedDelta) ||
      fixedDelta <= 0 ||
      !Number.isFinite(maxFrameDelta) ||
      maxFrameDelta < fixedDelta ||
      !Number.isSafeInteger(maxSubsteps) ||
      maxSubsteps < 1
    )
      throw new Error('Invalid time settings');
  }
  reset(): void {
    this.elapsed = 0;
    this.fixedElapsed = 0;
    this.delta = 0;
    this.frame = 0;
    this.accumulator = 0;
    this.dropped = 0;
  }
  advance(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error('Frame delta must be finite and nonnegative');
    this.delta = Math.min(seconds, this.maxFrameDelta);
    this.dropped += seconds - this.delta;
    this.elapsed += this.delta;
    this.frame++;
    this.accumulator += this.delta;
    const available = Math.floor((this.accumulator + 1e-12) / this.fixedDelta),
      steps = Math.min(available, this.maxSubsteps);
    if (available > steps) {
      const discarded = (available - steps) * this.fixedDelta;
      this.accumulator -= discarded;
      this.dropped += discarded;
    }
    return steps;
  }
  consumeFixed(): void {
    if (this.accumulator + 1e-12 < this.fixedDelta)
      throw new Error('No fixed step available');
    this.accumulator = Math.max(0, this.accumulator - this.fixedDelta);
    this.fixedElapsed += this.fixedDelta;
  }
  snapshot(): TimeSnapshot {
    return Object.freeze({
      delta: this.delta,
      elapsed: this.elapsed,
      fixedDelta: this.fixedDelta,
      fixedElapsed: this.fixedElapsed,
      frame: this.frame,
      alpha: this.accumulator / this.fixedDelta,
      dropped: this.dropped,
    });
  }
}
