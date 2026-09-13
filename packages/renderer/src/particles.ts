import { z } from 'zod';
import {
  compose,
  type ComponentDefinition,
  type Guid,
  type World,
} from '@protomake/core';
import type { EngineContext, System } from '@protomake/runtime';
import { SpriteRenderer } from './components';

const finite = z.number().finite(),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ParticleEmitterSchema = z.strictObject({
  texture: z.string(),
  emitting: z.boolean(),
  playOnAwake: z.boolean(),
  rate: finite.nonnegative(),
  burst: z.number().int().nonnegative(),
  lifetimeMin: finite.positive(),
  lifetimeMax: finite.positive(),
  speedMin: finite.nonnegative(),
  speedMax: finite.nonnegative(),
  angle: finite,
  spread: finite.min(0).max(360),
  gravityX: finite,
  gravityY: finite,
  startSize: finite.positive(),
  endSize: finite.nonnegative(),
  startColor: color,
  endColor: color,
  layer: z.number().int(),
  order: z.number().int(),
  maxParticles: z.number().int().positive().max(4096),
});
export type ParticleEmitterData = z.infer<typeof ParticleEmitterSchema>;
export const ParticleEmitter2D: ComponentDefinition<ParticleEmitterData> = {
  type: 'protomake.particle-emitter',
  displayName: 'Particle Emitter 2D',
  schema: ParticleEmitterSchema.refine(
    (value) =>
      value.lifetimeMin <= value.lifetimeMax &&
      value.speedMin <= value.speedMax,
    'Particle minimums must not exceed maximums',
  ),
  defaults: () => ({
    texture: '',
    emitting: true,
    playOnAwake: true,
    rate: 12,
    burst: 0,
    lifetimeMin: 0.3,
    lifetimeMax: 0.7,
    speedMin: 30,
    speedMax: 90,
    angle: -90,
    spread: 35,
    gravityX: 0,
    gravityY: 120,
    startSize: 12,
    endSize: 2,
    startColor: '#ffffff',
    endColor: '#ffffff',
    layer: 0,
    order: 0,
    maxParticles: 256,
  }),
  inspector: [
    { path: 'texture', label: 'Texture', kind: 'asset' },
    ...['emitting', 'playOnAwake'].map((path) => ({
      path,
      label: path,
      kind: 'boolean' as const,
    })),
    ...[
      'rate',
      'burst',
      'lifetimeMin',
      'lifetimeMax',
      'speedMin',
      'speedMax',
      'angle',
      'spread',
      'gravityX',
      'gravityY',
      'startSize',
      'endSize',
      'layer',
      'order',
      'maxParticles',
    ].map((path) => ({ path, label: path, kind: 'number' as const })),
    { path: 'startColor', label: 'Start color', kind: 'color' },
    { path: 'endColor', label: 'End color', kind: 'color' },
  ],
};

interface EmitterState {
  accumulator: number;
  seed: number;
  started: boolean;
}
interface Particle {
  id: number;
  owner: Guid;
  age: number;
  lifetime: number;
  velocity: [number, number];
  gravity: readonly [number, number];
  startSize: number;
  endSize: number;
  startColor: string;
  endColor: string;
}
const hash = (value: string) => {
  let result = 2166136261;
  for (const character of value)
    result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0 || 1;
};
const channel = (hex: string, shift: number) =>
  (Number.parseInt(hex.slice(1), 16) >> shift) & 255;
const mixColor = (a: string, b: string, t: number) => {
  const value = [16, 8, 0].reduce(
    (sum, shift) =>
      sum |
      (Math.round(
        channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t,
      ) <<
        shift),
    0,
  );
  return `#${value.toString(16).padStart(6, '0')}`;
};

export class ParticleSystem implements System {
  readonly id = 'protomake.particles';
  private readonly emitters = new Map<Guid, EmitterState>();
  private readonly particles: Particle[] = [];
  constructor(private readonly world: World) {}
  private random(state: EmitterState): number {
    let value = state.seed;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.seed = value >>> 0;
    return state.seed / 0x1_0000_0000;
  }
  emit(entity: Guid, count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > 4096)
      throw new Error('Particle count must be an integer from 0 to 4096');
    const id = this.world.find(entity),
      data =
        id === undefined ? undefined : this.world.read(id, ParticleEmitter2D);
    if (id === undefined || !data)
      throw new Error(`Missing particle emitter ${entity}`);
    const state = this.emitters.get(entity) ?? {
      accumulator: 0,
      seed: hash(entity),
      started: true,
    };
    this.emitters.set(entity, state);
    const owned = this.particles.filter(
        (particle) => particle.owner === entity,
      ).length,
      allowed = Math.min(count, Math.max(0, data.maxParticles - owned)),
      [x, y] = this.world.worldPosition(id),
      matrix = this.world.worldMatrix(id),
      base = Math.atan2(matrix[1], matrix[0]) + (data.angle * Math.PI) / 180;
    for (let index = 0; index < allowed; index++) {
      const angle =
          base + ((this.random(state) - 0.5) * data.spread * Math.PI) / 180,
        speed =
          data.speedMin + (data.speedMax - data.speedMin) * this.random(state),
        lifetime =
          data.lifetimeMin +
          (data.lifetimeMax - data.lifetimeMin) * this.random(state),
        particleId = this.world.create('Particle');
      this.world.setLocalMatrix(particleId, compose(x, y, angle));
      this.world.add(particleId, SpriteRenderer.type, {
        ...SpriteRenderer.defaults(),
        texture: data.texture,
        lit: false,
        castShadow: false,
        lightingChannel: 'Effects',
        width: data.startSize,
        height: data.startSize,
        tint: data.startColor,
        layer: data.layer,
        order: data.order,
      });
      this.particles.push({
        id: particleId,
        owner: entity,
        age: 0,
        lifetime,
        velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed],
        gravity: [data.gravityX, data.gravityY],
        startSize: data.startSize,
        endSize: data.endSize,
        startColor: data.startColor,
        endColor: data.endColor,
      });
    }
  }
  start(): void {
    for (const [id] of this.world.query(ParticleEmitter2D.type)) {
      const stable = this.world.get(id).guid,
        data = this.world.read(id, ParticleEmitter2D)!;
      this.emitters.set(stable, {
        accumulator: 0,
        seed: hash(stable),
        started: true,
      });
      if (data.playOnAwake && data.burst) this.emit(stable, data.burst);
    }
  }
  update(context: EngineContext): void {
    const present = new Set<Guid>();
    for (const [id] of this.world.query(ParticleEmitter2D.type)) {
      if (!this.world.isActive(id)) continue;
      const stable = this.world.get(id).guid,
        data = this.world.read(id, ParticleEmitter2D)!,
        state = this.emitters.get(stable) ?? {
          accumulator: 0,
          seed: hash(stable),
          started: false,
        };
      present.add(stable);
      this.emitters.set(stable, state);
      if (!state.started) {
        state.started = true;
        if (data.playOnAwake && data.burst) this.emit(stable, data.burst);
      }
      if (data.emitting && data.rate > 0) {
        state.accumulator += context.time.delta * data.rate;
        const count = Math.floor(state.accumulator);
        if (count) {
          state.accumulator -= count;
          this.emit(stable, count);
        }
      }
    }
    for (const id of this.emitters.keys())
      if (!present.has(id)) this.emitters.delete(id);
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!;
      if (!this.world.has(particle.id)) {
        this.particles.splice(index, 1);
        continue;
      }
      particle.age += context.time.delta;
      if (particle.age >= particle.lifetime) {
        this.world.destroy(particle.id);
        this.particles.splice(index, 1);
        continue;
      }
      particle.velocity[0] += particle.gravity[0] * context.time.delta;
      particle.velocity[1] += particle.gravity[1] * context.time.delta;
      const matrix = this.world.localMatrix(particle.id),
        t = particle.age / particle.lifetime,
        size = particle.startSize + (particle.endSize - particle.startSize) * t,
        sprite = this.world.read(particle.id, SpriteRenderer)!;
      this.world.setLocalMatrix(
        particle.id,
        compose(
          matrix[4] + particle.velocity[0] * context.time.delta,
          matrix[5] + particle.velocity[1] * context.time.delta,
          Math.atan2(matrix[1], matrix[0]),
        ),
      );
      this.world.set(particle.id, SpriteRenderer.type, {
        ...sprite,
        width: Math.max(Number.EPSILON, size),
        height: Math.max(Number.EPSILON, size),
        tint: mixColor(particle.startColor, particle.endColor, t),
        opacity: 1 - t,
      });
    }
  }
  stop(): void {
    for (const particle of this.particles)
      if (this.world.has(particle.id)) this.world.destroy(particle.id);
    this.particles.length = 0;
    this.emitters.clear();
  }
}
