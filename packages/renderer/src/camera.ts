import {
  inverse,
  multiply,
  type Guid,
  type Matrix2D,
  type World,
} from '@protomake/core';
import type { EngineContext, System } from '@protomake/runtime';
import { Camera2D, CameraFollow2D, CameraZone2D } from './components';

interface Shake {
  intensity: number;
  remaining: number;
  duration: number;
}
interface Kick {
  x: number;
  y: number;
  remaining: number;
  duration: number;
}
interface ZoomPulse {
  amount: number;
  remaining: number;
  duration: number;
}
export class CameraBehaviourSystem implements System {
  readonly id = 'protomake.camera-behaviours';
  private readonly previousTargets = new Map<Guid, readonly [number, number]>();
  private readonly shakes = new Map<Guid, Shake>();
  private readonly kicks = new Map<Guid, Kick>();
  private readonly zoomPulses = new Map<Guid, ZoomPulse>();
  private readonly baseZoom = new Map<Guid, number>();
  private readonly lastOffsets = new Map<Guid, readonly [number, number]>();
  constructor(private readonly world: World) {}
  shake(camera: Guid, intensity: number, duration: number): void {
    if (
      !Number.isFinite(intensity) ||
      intensity < 0 ||
      !Number.isFinite(duration) ||
      duration < 0
    )
      throw new Error('Camera shake must be finite and non-negative');
    if (this.world.find(camera) === undefined)
      throw new Error(`Missing camera ${camera}`);
    this.shakes.set(camera, { intensity, remaining: duration, duration });
  }
  kick(camera: Guid, x: number, y: number, duration: number): void {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(duration) ||
      duration < 0
    )
      throw new Error('Camera kick must be finite with non-negative duration');
    if (this.world.find(camera) === undefined)
      throw new Error(`Missing camera ${camera}`);
    this.kicks.set(camera, { x, y, remaining: duration, duration });
  }
  zoomPulse(camera: Guid, amount: number, duration: number): void {
    if (!Number.isFinite(amount) || !Number.isFinite(duration) || duration < 0)
      throw new Error('Camera zoom pulse must be finite');
    if (this.world.find(camera) === undefined)
      throw new Error(`Missing camera ${camera}`);
    this.zoomPulses.set(camera, { amount, remaining: duration, duration });
  }
  lateUpdate(context: EngineContext): void {
    const present = new Set<Guid>();
    for (const [id] of this.world.query(CameraFollow2D.type)) {
      if (
        !this.world.isActive(id) ||
        !this.world.components(id).has(Camera2D.type)
      )
        continue;
      const follow = this.world.read(id, CameraFollow2D)!,
        camera = this.world.read(id, Camera2D)!,
        stable = this.world.get(id).guid,
        targetId = follow.target ? this.world.find(follow.target) : undefined;
      if (targetId === undefined) continue;
      present.add(stable);
      if (!this.baseZoom.has(stable)) this.baseZoom.set(stable, camera.zoom);
      const target = this.world.worldPosition(targetId),
        previous = this.previousTargets.get(stable) ?? target,
        velocity =
          context.time.delta > 0
            ? ([
                (target[0] - previous[0]) / context.time.delta,
                (target[1] - previous[1]) / context.time.delta,
              ] as const)
            : ([0, 0] as const),
        raw = this.world.worldPosition(id),
        last = this.lastOffsets.get(stable) ?? [0, 0],
        current = [raw[0] - last[0], raw[1] - last[1]] as const;
      this.previousTargets.set(stable, target);
      let desiredX = target[0] + velocity[0] * follow.lookAheadSeconds,
        desiredY = target[1] + velocity[1] * follow.lookAheadSeconds;
      const dx = desiredX - current[0],
        dy = desiredY - current[1];
      if (Math.abs(dx) <= follow.deadZoneWidth / 2) desiredX = current[0];
      else desiredX -= (Math.sign(dx) * follow.deadZoneWidth) / 2;
      if (Math.abs(dy) <= follow.deadZoneHeight / 2) desiredY = current[1];
      else desiredY -= (Math.sign(dy) * follow.deadZoneHeight) / 2;
      if (follow.confine) {
        desiredX = Math.max(follow.minX, Math.min(follow.maxX, desiredX));
        desiredY = Math.max(follow.minY, Math.min(follow.maxY, desiredY));
      }
      const alpha =
          follow.smoothing === 0
            ? 1
            : 1 - Math.exp(-follow.smoothing * context.time.delta),
        shake = this.shakeOffset(stable, context),
        kick = this.kickOffset(stable, context),
        offset = [shake[0] + kick[0], shake[1] + kick[1]] as const;
      this.writeWorld(
        id,
        current[0] + (desiredX - current[0]) * alpha + offset[0],
        current[1] + (desiredY - current[1]) * alpha + offset[1],
      );
      const zone = [...this.world.query(CameraZone2D.type)]
        .map(([zoneId]) => ({
          id: zoneId,
          data: this.world.read(zoneId, CameraZone2D)!,
        }))
        .filter((item) => {
          const centre = this.world.worldPosition(item.id);
          return (
            this.world.isActive(item.id) &&
            Math.abs(target[0] - centre[0]) <= item.data.width / 2 &&
            Math.abs(target[1] - centre[1]) <= item.data.height / 2
          );
        })
        .sort((a, b) => b.data.priority - a.data.priority)[0];
      const targetZoom =
        (zone?.data.zoom ?? this.baseZoom.get(stable)!) +
        this.zoomOffset(stable, context);
      if (Math.abs(camera.zoom - targetZoom) > 1e-6) {
        const speed = zone?.data.blendSpeed ?? follow.smoothing,
          blend = speed === 0 ? 1 : 1 - Math.exp(-speed * context.time.delta);
        this.world.set(id, Camera2D.type, {
          ...camera,
          zoom: camera.zoom + (targetZoom - camera.zoom) * blend,
        });
      }
    }
    for (const id of this.previousTargets.keys())
      if (!present.has(id)) this.previousTargets.delete(id);
  }
  private kickOffset(
    camera: Guid,
    context: EngineContext,
  ): readonly [number, number] {
    const kick = this.kicks.get(camera);
    if (!kick) return [0, 0];
    kick.remaining -= context.time.delta;
    const strength =
      kick.duration > 0 ? Math.max(0, kick.remaining / kick.duration) : 0;
    if (kick.remaining <= 0) this.kicks.delete(camera);
    return [kick.x * strength, kick.y * strength];
  }
  private zoomOffset(camera: Guid, context: EngineContext): number {
    const pulse = this.zoomPulses.get(camera);
    if (!pulse) return 0;
    pulse.remaining -= context.time.delta;
    const progress =
        pulse.duration > 0
          ? 1 - Math.max(0, pulse.remaining / pulse.duration)
          : 1,
      envelope = Math.sin(progress * Math.PI);
    if (pulse.remaining <= 0) this.zoomPulses.delete(camera);
    return pulse.amount * envelope;
  }
  private shakeOffset(
    camera: Guid,
    context: EngineContext,
  ): readonly [number, number] {
    const shake = this.shakes.get(camera);
    if (!shake) {
      this.lastOffsets.delete(camera);
      return [0, 0];
    }
    shake.remaining -= context.time.delta;
    const strength =
        shake.duration > 0
          ? Math.max(0, shake.remaining / shake.duration) * shake.intensity
          : 0,
      value = [
        Math.sin(context.time.elapsed * 91.7) * strength,
        Math.cos(context.time.elapsed * 77.3) * strength,
      ] as const;
    if (shake.remaining <= 0) this.shakes.delete(camera);
    if (strength > 0) this.lastOffsets.set(camera, value);
    else this.lastOffsets.delete(camera);
    return value;
  }
  private writeWorld(id: number, x: number, y: number): void {
    const matrix = this.world.worldMatrix(id),
      parent = this.world.get(id).parent,
      desired = [matrix[0], matrix[1], matrix[2], matrix[3], x, y] as Matrix2D;
    this.world.setLocalMatrix(
      id,
      parent === null
        ? desired
        : multiply(inverse(this.world.worldMatrix(parent)), desired),
    );
  }
  stop(): void {
    this.previousTargets.clear();
    this.shakes.clear();
    this.kicks.clear();
    this.zoomPulses.clear();
    this.baseZoom.clear();
    this.lastOffsets.clear();
  }
}
