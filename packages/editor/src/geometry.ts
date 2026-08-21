import { inverse, type Matrix2D } from '@protomake/core';
export type Point = readonly [number, number];
export function point(m: Matrix2D, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
export function hitBox(
  m: Matrix2D,
  p: Point,
  width = 48,
  height = 48,
): boolean {
  try {
    const local = point(inverse(m), p);
    return Math.abs(local[0]) <= width / 2 && Math.abs(local[1]) <= height / 2;
  } catch {
    return false;
  }
}
export function snap(value: number, spacing: number): number {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new Error('Snap spacing must be positive');
  return Math.round(value / spacing) * spacing;
}
export function bounds(
  m: Matrix2D,
  width = 48,
  height = 48,
): { x: number; y: number; width: number; height: number } {
  const points = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map((p) => point(m, p as unknown as Point));
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
