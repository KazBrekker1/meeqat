// Small vector helpers for the sky. Directions are unit 3-vectors; matrices are row-major 3×3.
// Horizon frame: x east, y north, z up. Equatorial frame: x toward RA 0h, z toward the north pole.

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const RAD = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Angle wrapped to [0, 2π). */
export const wrapTau = (a: number) => ((a % TAU) + TAU) % TAU;
/** Angle wrapped to (−π, π]. */
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function vecFromRaDec(ra: number, dec: number): Vec3 {
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

/** Horizon direction for an altitude and an azimuth (from north, eastward), radians. */
export function vecFromAltAz(alt: number, az: number): Vec3 {
  const c = Math.cos(alt);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(alt)];
}

export function altAzOf(d: ArrayLike<number>, o = 0): { alt: number; az: number } {
  return { alt: Math.asin(clamp(d[o + 2]!, -1, 1)), az: wrapTau(Math.atan2(d[o]!, d[o + 1]!)) };
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const m = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) m[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return m;
}

/** m · v, reading v from `o` (so it works on packed Float32Arrays too). */
export function mulVec(m: Mat3, v: ArrayLike<number>, o = 0): Vec3 {
  const x = v[o]!, y = v[o + 1]!, z = v[o + 2]!;
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

/** Angle between two unit vectors, radians (stable for tiny angles). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

/** Column-major copy for gl.uniformMatrix3fv. */
export function toColumnMajor(m: Mat3, out = new Float32Array(9)): Float32Array {
  out[0] = m[0]; out[1] = m[3]; out[2] = m[6];
  out[3] = m[1]; out[4] = m[4]; out[5] = m[7];
  out[6] = m[2]; out[7] = m[5]; out[8] = m[8];
  return out;
}
