import { BASES } from "./basis.ts";
import type { ViewId } from "../views.ts";
export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
/** Row-major 2×3 affine: [a,b,c,d,e,f] maps (x,y) to (ax+by+c,dx+ey+f). */
export type Affine = readonly [number, number, number, number, number, number];
export const IDENTITY_AFFINE: Affine = [1, 0, 0, 0, 1, 0];
/** World -> physical camera (+x right, +y down, +z forward) -> raw pixel. */
export interface Camera {
  readonly projection: "orthographic" | "perspective";
  readonly rotation: Mat3;
  readonly translation: Vec3;
  /** Pixels/world unit for orthographic; focal pixels for perspective. */
  readonly fx: number;
  readonly fy: number;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly near: number;
  readonly far: number;
}
export interface Landmark {
  readonly id: string;
  readonly image: readonly [number, number];
  readonly world: Vec3;
}
export function affinePoint(
  m: Affine,
  p: readonly [number, number],
): [number, number] {
  return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]];
}
/** Compose A after B; image mirrors belong here, never in a physical rotation. */
export function composeAffine(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}
export function invertAffine(m: Affine): Affine {
  const det = m[0] * m[4] - m[1] * m[3];
  if (!m.every(Number.isFinite) || Math.abs(det) < 1e-12)
    throw new Error("이미지 좌표 변환이 유효하지 않습니다.");
  return [
    m[4] / det,
    -m[1] / det,
    (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det,
    m[0] / det,
    (m[3] * m[2] - m[0] * m[5]) / det,
  ];
}
export function rotatePoint(r: Mat3, p: Vec3): [number, number, number] {
  return [
    r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
    r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
    r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
  ];
}
export function multiplyRotation(a: Mat3, b: Mat3): Mat3 {
  const v = Array.from({ length: 9 }, (_, i) => {
    const row = Math.floor(i / 3) * 3,
      col = i % 3;
    return (
      (a[row] ?? 0) * (b[col] ?? 0) +
      (a[row + 1] ?? 0) * (b[col + 3] ?? 0) +
      (a[row + 2] ?? 0) * (b[col + 6] ?? 0)
    );
  });
  return v as unknown as Mat3;
}
export function angleRotation(yaw: number, pitch: number, roll: number): Mat3 {
  const y = (yaw * Math.PI) / 180,
    p = (pitch * Math.PI) / 180,
    r = (roll * Math.PI) / 180;
  const cy = Math.cos(y),
    sy = Math.sin(y),
    cp = Math.cos(p),
    sp = Math.sin(p),
    cr = Math.cos(r),
    sr = Math.sin(r);
  return multiplyRotation(
    [cr, -sr, 0, sr, cr, 0, 0, 0, 1],
    multiplyRotation(
      [1, 0, 0, 0, cp, -sp, 0, sp, cp],
      [cy, 0, sy, 0, 1, 0, -sy, 0, cy],
    ),
  );
}
export function canonicalCamera(
  id: ViewId,
  width: number,
  height: number,
  pixelsPerUnit: number,
): Camera {
  const b = BASES[id];
  return {
    projection: "orthographic",
    rotation: [...b.right, -b.up[0], -b.up[1], -b.up[2], ...b.forward],
    translation: [0, 0, 0],
    fx: pixelsPerUnit,
    fy: pixelsPerUnit,
    cx: width / 2,
    cy: height / 2,
    width,
    height,
    near: -1e12,
    far: 1e12,
  };
}
export function validateCamera(value: unknown): Camera {
  if (!value || typeof value !== "object")
    throw new Error("카메라 정보가 없습니다.");
  const c = value as Camera;
  if (
    !["orthographic", "perspective"].includes(c.projection) ||
    !Array.isArray(c.rotation) ||
    c.rotation.length !== 9 ||
    !c.rotation.every(Number.isFinite) ||
    !Array.isArray(c.translation) ||
    c.translation.length !== 3 ||
    !c.translation.every(Number.isFinite) ||
    ![c.fx, c.fy, c.cx, c.cy, c.width, c.height, c.near, c.far].every(
      Number.isFinite,
    ) ||
    c.fx <= 0 ||
    c.fy <= 0 ||
    c.width <= 0 ||
    c.height <= 0 ||
    c.far <= c.near ||
    (c.projection === "perspective" && c.near <= 0)
  )
    throw new Error("카메라 값이 유효하지 않습니다.");
  const r = c.rotation;
  const det =
    r[0] * (r[4] * r[8] - r[5] * r[7]) -
    r[1] * (r[3] * r[8] - r[5] * r[6]) +
    r[2] * (r[3] * r[7] - r[4] * r[6]);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const dot =
        (r[i * 3] ?? 0) * (r[j * 3] ?? 0) +
        (r[i * 3 + 1] ?? 0) * (r[j * 3 + 1] ?? 0) +
        (r[i * 3 + 2] ?? 0) * (r[j * 3 + 2] ?? 0);
      if (Math.abs(dot - (i === j ? 1 : 0)) > 1e-5)
        throw new Error("카메라 회전은 직교 회전이어야 합니다.");
    }
  if (Math.abs(det - 1) > 1e-5)
    throw new Error("카메라 회전에 이미지 반전을 사용할 수 없습니다.");
  return c;
}
export function projectPoint(
  camera: Camera,
  point: Vec3,
  image: Affine = IDENTITY_AFFINE,
): {
  x: number;
  y: number;
  depth: number;
  valid: boolean;
} {
  const q = rotatePoint(camera.rotation, point);
  const x = q[0] + camera.translation[0],
    y = q[1] + camera.translation[1],
    depth = q[2] + camera.translation[2];
  const divisor = camera.projection === "perspective" ? depth : 1;
  if (
    ![x, y, depth].every(Number.isFinite) ||
    depth < camera.near ||
    depth > camera.far ||
    divisor === 0
  )
    return { x: NaN, y: NaN, depth, valid: false };
  const p = affinePoint(image, [
    camera.cx + (camera.fx * x) / divisor,
    camera.cy + (camera.fy * y) / divisor,
  ]);
  return { x: p[0], y: p[1], depth, valid: p.every(Number.isFinite) };
}
export function scaledCamera(c: Camera, width: number, height: number): Camera {
  const sx = width / c.width,
    sy = height / c.height;
  return {
    ...c,
    width,
    height,
    fx: c.fx * sx,
    fy: c.fy * sy,
    cx: c.cx * sx,
    cy: c.cy * sy,
  };
}
/** Perspective rays vary across the image; orthographic rays share a direction. */
export function cameraFacing(c: Camera, p: Vec3): Vec3 {
  if (c.projection === "orthographic")
    return [-c.rotation[6], -c.rotation[7], -c.rotation[8]];
  const r = c.rotation,
    t = c.translation;
  const v: Vec3 = [
    -r[0] * t[0] - r[3] * t[1] - r[6] * t[2] - p[0],
    -r[1] * t[0] - r[4] * t[1] - r[7] * t[2] - p[1],
    -r[2] * t[0] - r[5] * t[1] - r[8] * t[2] - p[2],
  ];
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
}
export interface ViewCamera {
  readonly camera: Camera;
  /** Raw (EXIF-oriented) pixel edges -> prepared pixel edges. */
  readonly image: Affine;
  readonly width: number;
  readonly height: number;
}
export function projectView(
  c: ViewCamera,
  p: Vec3,
  width = c.width,
  height = c.height,
) {
  return projectPoint(
    c.camera,
    p,
    composeAffine([width / c.width, 0, 0, 0, height / c.height, 0], c.image),
  );
}
export function canonicalView(
  id: ViewId,
  width: number,
  height: number,
  scale: number,
): ViewCamera {
  return {
    camera: canonicalCamera(id, width, height, scale),
    image: IDENTITY_AFFINE,
    width,
    height,
  };
}
export function defaultPhotoCamera(
  id: ViewId,
  width: number,
  height: number,
): Camera {
  return {
    ...canonicalCamera(id, width, height, Math.max(width, height) * 2),
    projection: "perspective",
    translation: [0, 0, 2.5],
    near: 0.001,
    far: 100,
  };
}
/** Image operations use pixel edges; mirrors never change the physical rotation. */
export function orientedImage(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270,
  flip: boolean,
): {
  matrix: Affine;
  width: number;
  height: number;
} {
  const matrix: Affine =
    rotation === 90
      ? [0, -1, height, 1, 0, 0]
      : rotation === 180
        ? [-1, 0, width, 0, -1, height]
        : rotation === 270
          ? [0, 1, 0, -1, 0, width]
          : IDENTITY_AFFINE;
  const w = rotation === 90 || rotation === 270 ? height : width,
    h = rotation === 90 || rotation === 270 ? width : height;
  return {
    matrix: flip ? composeAffine([-1, 0, w, 0, 1, 0], matrix) : matrix,
    width: w,
    height: h,
  };
}
