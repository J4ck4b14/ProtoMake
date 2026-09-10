import type { World } from '@protomake/core';
import { Light2D, type LightData } from './components';
export interface LightSample {
  data: LightData;
  x: number;
  y: number;
  angle: number;
}
export function sceneLights(world: World): LightSample[] {
  return [...world.query(Light2D.type)]
    .filter(([id]) => world.isActive(id))
    .map(([id]) => {
      const m = world.worldMatrix(id);
      return {
        data: world.read(id, Light2D)!,
        x: m[4],
        y: m[5],
        angle: Math.atan2(m[1], m[0]),
      };
    });
}
/** Flat sprite lighting sampled at its visual center; no surface normals or shadows. */
export function lightTint(
  tint: string,
  x: number,
  y: number,
  lights: readonly LightSample[],
): number {
  const base = Number.parseInt(tint.slice(1), 16);
  if (!lights.length) return base;
  const rgb = [0, 0, 0];
  for (const { data: l, x: lx, y: ly, angle } of lights) {
    let weight = l.intensity;
    if (l.kind !== 'ambient') {
      const dx = x - lx,
        dy = y - ly;
      const localX = Math.cos(angle) * dx + Math.sin(angle) * dy;
      const localY = -Math.sin(angle) * dx + Math.cos(angle) * dy;
      const distance =
        l.kind === 'area'
          ? Math.hypot(
              Math.max(0, Math.abs(localX) - l.width / 2),
              Math.max(0, Math.abs(localY) - l.height / 2),
            )
          : Math.hypot(dx, dy);
      weight *= Math.pow(Math.max(0, 1 - distance / l.range), l.falloff);
      if (l.kind === 'spot' && distance > 0) {
        const degrees = (Math.abs(Math.atan2(localY, localX)) * 180) / Math.PI;
        const inner = l.innerAngle / 2,
          outer = l.outerAngle / 2;
        weight *=
          degrees <= inner
            ? 1
            : degrees >= outer
              ? 0
              : (outer - degrees) / (outer - inner);
      }
    }
    const color = Number.parseInt(l.color.slice(1), 16);
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
