import type { Matrix2D, World } from '@protomake/core';
import {
  Light2D,
  ShadowCaster2D,
  SpriteRenderer,
  channelBit,
  channelEnabled,
  type LightData,
  type LightingChannel,
} from './components';

export interface LightSample {
  id?: string;
  data: LightData;
  x: number;
  y: number;
  angle: number;
}

export interface ShadowCaster {
  id: string;
  points: readonly [number, number][];
  /** Channels whose receivers this caster can shadow. */
  channelMask: number;
}

export interface LightingSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Perceptual 0..1 light level. Handy for stealth / visibility rules. */
  readonly intensity: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const channel = (color: string, shift: number) =>
  ((Number.parseInt(color.slice(1), 16) >> shift) & 255) / 255;

export function sceneLights(world: World): LightSample[] {
  return [...world.query(Light2D.type)]
    .filter(([id]) => world.isActive(id))
    .map(([id]) => {
      const m = world.worldMatrix(id);
      return {
        id: world.get(id).guid,
        data: world.read(id, Light2D)!,
        x: m[4],
        y: m[5],
        angle: Math.atan2(m[1], m[0]),
      };
    });
}

function point(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Sprite rectangles and explicit shapes are the current 2D caster geometry. */
export function sceneShadowCasters(world: World): ShadowCaster[] {
  const result: ShadowCaster[] = [],
    explicit = new Set<number>();
  for (const [id] of world.query(ShadowCaster2D.type)) {
    if (!world.isActive(id)) continue;
    const caster = world.read(id, ShadowCaster2D)!,
      m = world.worldMatrix(id),
      x0 = caster.offsetX - caster.width / 2,
      y0 = caster.offsetY - caster.height / 2,
      x1 = x0 + caster.width,
      y1 = y0 + caster.height;
    explicit.add(id);
    result.push({
      id: world.get(id).guid,
      channelMask: caster.channelMask,
      points: [
        point(m, x0, y0),
        point(m, x1, y0),
        point(m, x1, y1),
        point(m, x0, y1),
      ],
    });
  }
  for (const [id] of world.query(SpriteRenderer.type)) {
    if (explicit.has(id) || !world.isActive(id)) continue;
    const sprite = world.read(id, SpriteRenderer)!;
    if (!sprite.visible || !sprite.castShadow) continue;
    const m = world.worldMatrix(id),
      x0 = -sprite.anchorX * sprite.width,
      y0 = -sprite.anchorY * sprite.height,
      x1 = x0 + sprite.width,
      y1 = y0 + sprite.height;
    result.push({
      id: world.get(id).guid,
      channelMask: channelBit(sprite.lightingChannel),
      points: [
        point(m, x0, y0),
        point(m, x1, y0),
        point(m, x1, y1),
        point(m, x0, y1),
      ],
    });
  }
  return result;
}

export function lightWeight(light: LightSample, x: number, y: number): number {
  const { data: l, x: lx, y: ly, angle } = light;
  let weight = l.intensity;
  if (l.kind === 'ambient') return weight;
  const dx = x - lx,
    dy = y - ly,
    localX = Math.cos(angle) * dx + Math.sin(angle) * dy,
    localY = -Math.sin(angle) * dx + Math.cos(angle) * dy,
    distance =
      l.kind === 'area'
        ? Math.hypot(
            Math.max(0, Math.abs(localX) - l.width / 2),
            Math.max(0, Math.abs(localY) - l.height / 2),
          )
        : Math.hypot(dx, dy);
  weight *= Math.pow(Math.max(0, 1 - distance / l.range), l.falloff);
  if (l.kind === 'spot' && distance > 0) {
    const degrees = (Math.abs(Math.atan2(localY, localX)) * 180) / Math.PI,
      inner = l.innerAngle / 2,
      outer = l.outerAngle / 2;
    weight *=
      degrees <= inner
        ? 1
        : degrees >= outer
          ? 0
          : (outer - degrees) / Math.max(1e-9, outer - inner);
  }
  return Math.max(0, weight);
}

function cross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function pointInPolygon(
  x: number,
  y: number,
  points: readonly [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!,
      [xj, yj] = points[j]!;
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi
    )
      inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const c1 = cross(ax, ay, bx, by, cx, cy),
    c2 = cross(ax, ay, bx, by, dx, dy),
    c3 = cross(cx, cy, dx, dy, ax, ay),
    c4 = cross(cx, cy, dx, dy, bx, by),
    eps = 1e-9;
  if (
    Math.abs(c1) < eps ||
    Math.abs(c2) < eps ||
    Math.abs(c3) < eps ||
    Math.abs(c4) < eps
  )
    return false; // grazing a corner should not flicker visibility
  return c1 > 0 !== c2 > 0 && c3 > 0 !== c4 > 0;
}

export function isOccluded(
  lightX: number,
  lightY: number,
  x: number,
  y: number,
  casters: readonly ShadowCaster[],
  ignoreCaster?: string,
  receiverChannel: LightingChannel | number = 'World',
): boolean {
  for (const caster of casters) {
    if (
      caster.id === ignoreCaster ||
      !channelEnabled(caster.channelMask, receiverChannel)
    )
      continue;
    if (pointInPolygon(lightX, lightY, caster.points)) continue;
    const p = caster.points;
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!,
        b = p[(i + 1) % p.length]!;
      if (segmentsIntersect(lightX, lightY, x, y, a[0], a[1], b[0], b[1]))
        return true;
    }
  }
  return false;
}

/**
 * Occlusion-aware world lighting. The same calculation is used by scripts for
 * stealth/visibility decisions, while the renderer uses denser per-channel surfaces.
 */
function samplePrepared(
  lights: readonly LightSample[],
  casters: readonly ShadowCaster[],
  x: number,
  y: number,
  ignoreCaster?: string,
  receiverChannel: LightingChannel | number = 'World',
): LightingSample {
  if (!lights.length) return { r: 1, g: 1, b: 1, intensity: 1 };
  let r = 0,
    g = 0,
    b = 0;
  for (const light of lights) {
    if (!channelEnabled(light.data.channelMask, receiverChannel)) continue;
    let weight = lightWeight(light, x, y);
    if (
      weight > 0 &&
      light.data.castShadows &&
      light.data.kind !== 'ambient' &&
      isOccluded(light.x, light.y, x, y, casters, ignoreCaster, receiverChannel)
    )
      weight *= 1 - light.data.shadowOpacity;
    r += channel(light.data.color, 16) * weight;
    g += channel(light.data.color, 8) * weight;
    b += channel(light.data.color, 0) * weight;
  }
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);
  return {
    r,
    g,
    b,
    intensity: clamp01(r * 0.2126 + g * 0.7152 + b * 0.0722),
  };
}

/** Line-of-sight primitive shared by stealth/gameplay scripts and editor debug tools. */
export function hasLineOfSight(
  world: World,
  from: string,
  to: string,
  receiverChannel: LightingChannel | number = 'World',
): boolean {
  const fromId = world.find(from),
    toId = world.find(to);
  if (fromId === undefined || toId === undefined) return false;
  const [ax, ay] = world.worldPosition(fromId),
    [bx, by] = world.worldPosition(toId),
    casters = sceneShadowCasters(world).filter(
      (caster) => caster.id !== from && caster.id !== to,
    );
  return !isOccluded(ax, ay, bx, by, casters, undefined, receiverChannel);
}

/** Build one cached query for debug heatmaps or systems that need many samples in a frame. */
export function createLightingSampler(
  world: World,
): (
  x: number,
  y: number,
  ignoreCaster?: string,
  receiverChannel?: LightingChannel | number,
) => LightingSample {
  const lights = sceneLights(world),
    casters = sceneShadowCasters(world);
  return (x, y, ignoreCaster, receiverChannel = 'World') =>
    samplePrepared(lights, casters, x, y, ignoreCaster, receiverChannel);
}

export function sampleLighting(
  world: World,
  x: number,
  y: number,
  ignoreCaster?: string,
  receiverChannel: LightingChannel | number = 'World',
): LightingSample {
  return samplePrepared(
    sceneLights(world),
    sceneShadowCasters(world),
    x,
    y,
    ignoreCaster,
    receiverChannel,
  );
}

/** Compatibility helper retained for tests and simple CPU consumers. */
export function lightTint(
  tint: string,
  x: number,
  y: number,
  lights: readonly LightSample[],
): number {
  const base = Number.parseInt(tint.slice(1), 16);
  if (!lights.length) return base;
  const rgb = [0, 0, 0];
  for (const light of lights) {
    const weight = lightWeight(light, x, y),
      color = Number.parseInt(light.data.color.slice(1), 16);
    for (let i = 0; i < 3; i++)
      rgb[i]! += (((color >> (16 - i * 8)) & 255) / 255) * weight;
  }
  return rgb.reduce(
    (color, light, i) =>
      color |
      (Math.round(((base >> (16 - i * 8)) & 255) * Math.min(1, light)) <<
        (16 - i * 8)),
    0,
  );
}
