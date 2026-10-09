/**
 * cobe's projection, reimplemented so the landing globe can hit-test hovers and clicks and place
 * tooltips. It mirrors cobe 2.x (dist/index.esm.js: U(), O(), W()) with offset [0,0], scale 1,
 * markerElevation 0 and a square canvas: the sphere has radius 0.8 in clip space.
 */
export const GLOBE_RADIUS = 0.8;
const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];

/** lat/lng (degrees) → cobe's unit-sphere coordinates. */
export function latLngToVec([lat, lng]: [number, number]): Vec3 {
  const r = lat * DEG;
  const a = lng * DEG - Math.PI;
  const c = Math.cos(r);
  return [-c * Math.cos(a), Math.sin(r), c * Math.sin(a)];
}

/** Inverse of latLngToVec (expects a unit vector). */
export function vecToLatLng([x, y, z]: Vec3): [number, number] {
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) / DEG;
  let lng = (Math.atan2(z, -x) + Math.PI) / DEG;
  if (lng > 180) lng -= 360;
  return [lat, lng];
}

/** Rotated coordinates: [screen x, screen y (up), depth toward the viewer]. */
function rotate([x, y, z]: Vec3, phi: number, theta: number): Vec3 {
  const ct = Math.cos(theta);
  const cp = Math.cos(phi);
  const st = Math.sin(theta);
  const sp = Math.sin(phi);
  return [cp * x + sp * z, sp * st * x + ct * y - cp * st * z, -sp * ct * x + st * y + cp * ct * z];
}

/** Transpose of rotate (rotations are orthonormal). */
function unrotate([c, s, d]: Vec3, phi: number, theta: number): Vec3 {
  const ct = Math.cos(theta);
  const cp = Math.cos(phi);
  const st = Math.sin(theta);
  const sp = Math.sin(phi);
  return [cp * c + sp * st * s - sp * ct * d, ct * s + st * d, sp * c - cp * st * s + cp * ct * d];
}

export interface ScreenPoint {
  /** Fraction of the canvas width/height (0..1, top-left origin). */
  x: number;
  y: number;
  /** On the side facing the viewer. */
  visible: boolean;
}

/** Where a lat/lng lands on the canvas for the given rotation. */
export function project(latLng: [number, number], phi: number, theta: number): ScreenPoint {
  const v = latLngToVec(latLng);
  const [c, s, d] = rotate(
    [v[0] * GLOBE_RADIUS, v[1] * GLOBE_RADIUS, v[2] * GLOBE_RADIUS],
    phi,
    theta,
  );
  return { x: (c + 1) / 2, y: (-s + 1) / 2, visible: d >= 0 };
}

/** The lat/lng under a canvas point (fractions), or null off the sphere. */
export function unproject(
  x: number,
  y: number,
  phi: number,
  theta: number,
): [number, number] | null {
  const c = x * 2 - 1;
  const s = 1 - y * 2;
  const rr = GLOBE_RADIUS * GLOBE_RADIUS - c * c - s * s;
  if (rr < 0) return null;
  const d = Math.sqrt(rr);
  const v = unrotate([c, s, d], phi, theta);
  return vecToLatLng([v[0] / GLOBE_RADIUS, v[1] / GLOBE_RADIUS, v[2] / GLOBE_RADIUS]);
}

/** Great-circle distance in degrees. */
export function angularDistance(a: [number, number], b: [number, number]): number {
  const va = latLngToVec(a);
  const vb = latLngToVec(b);
  const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
  return Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
}

/** Nearest item within maxDeg of a point (e.g. the venue cluster under a click). */
export function nearestWithin<T extends { lat: number; lng: number }>(
  items: T[],
  point: [number, number],
  maxDeg: number,
): T | null {
  let best: T | null = null;
  let bestD = maxDeg;
  for (const it of items) {
    const d = angularDistance([it.lat, it.lng], point);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** The phi (spin) that brings a longitude to the front of the globe. */
export function phiFacing(lng: number): number {
  // At theta 0, depth d = -sin(phi)·x + cos(phi)·z with x = -cos(lat)·cos(a), z = cos(lat)·sin(a),
  // a = lng - 180°, so d = cos(lat)·sin(a + phi): largest when phi = 90° - a.
  const a = lng * DEG - Math.PI;
  return Math.PI / 2 - a;
}
