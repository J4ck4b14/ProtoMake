/** Column-major affine matrix: [a, b, c, d, tx, ty]. Coordinates use radians. */
export type Matrix2D = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];
export const IDENTITY: Matrix2D = Object.freeze([1, 0, 0, 1, 0, 0]);
export function matrix(value: unknown): Matrix2D {
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    !value.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
    throw new Error('Transform.local: expected six finite numbers');
  return [...value] as unknown as Matrix2D;
}
export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return matrix([
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]);
}
export function inverse(m: Matrix2D): Matrix2D {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
    throw new Error('Cannot invert singular or near-singular parent transform');
  return matrix([
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]);
}
export function compose(
  x: number,
  y: number,
  rotation = 0,
  sx = 1,
  sy = 1,
): Matrix2D {
  const c = Math.cos(rotation),
    s = Math.sin(rotation);
  return matrix([c * sx, s * sx, -s * sy, c * sy, x, y]);
}
