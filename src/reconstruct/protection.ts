import { computeBounds, type Mesh } from "../mesh/types.ts";
import { projectView, type Vec3, type ViewCamera } from "../render/camera.ts";
import type { Silhouette } from "../analyze/silhouette.ts";
import { signedDistance } from "./voxel-reconstruct.ts";
import { adjacency } from "./mesh-postprocess.ts";
export interface Protection {
  readonly mode: "required" | "none";
  readonly confirmed: boolean;
  readonly regions: readonly [readonly Vec3[], readonly Vec3[]];
  readonly path: readonly Vec3[];
  readonly boundary: readonly Vec3[];
  readonly direction: Vec3 | null;
  readonly hole: boolean;
}
export const EMPTY_PROTECTION: Protection = {
  mode: "required",
  confirmed: false,
  regions: [[], []],
  path: [],
  boundary: [],
  direction: null,
  hole: true,
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export function vertex(mesh: Mesh, i: number): Vec3 {
  return [
    mesh.positions[i * 3] ?? 0,
    mesh.positions[i * 3 + 1] ?? 0,
    mesh.positions[i * 3 + 2] ?? 0,
  ];
}
export function diagonal(mesh: Mesh): number {
  return Math.hypot(...sub(mesh.bounds.max, mesh.bounds.min));
}
interface SurfaceNode {
  min: Vec3;
  max: Vec3;
  triangles?: number[];
  children?: readonly [SurfaceNode, SurfaceNode];
}
const surfaces = new WeakMap<Mesh, SurfaceNode>();
/** Per-immutable-mesh spatial index; weak ownership releases replaced geometry. */
function surfaceTree(mesh: Mesh): SurfaceNode {
  const cached = surfaces.get(mesh);
  if (cached) return cached;
  const bounds = Array.from(
    { length: Math.floor(mesh.indices.length / 3) },
    (_, t) => {
      const points = [0, 1, 2].map((k) =>
        vertex(mesh, mesh.indices[t * 3 + k]!),
      );
      return {
        min: [0, 1, 2].map((k) =>
          Math.min(...points.map((p) => p[k]!)),
        ) as unknown as Vec3,
        max: [0, 1, 2].map((k) =>
          Math.max(...points.map((p) => p[k]!)),
        ) as unknown as Vec3,
      };
    },
  );
  const build = (ids: number[]): SurfaceNode => {
    const min = [0, 1, 2].map((k) =>
        ids.reduce((v, i) => Math.min(v, bounds[i]!.min[k]!), Infinity),
      ) as unknown as Vec3,
      max = [0, 1, 2].map((k) =>
        ids.reduce((v, i) => Math.max(v, bounds[i]!.max[k]!), -Infinity),
      ) as unknown as Vec3;
    if (ids.length <= 16) return { min, max, triangles: ids };
    const axis = [0, 1, 2].sort(
      (a, b) => max[b]! - min[b]! - (max[a]! - min[a]!),
    )[0]!;
    ids.sort(
      (a, b) =>
        bounds[a]!.min[axis]! +
        bounds[a]!.max[axis]! -
        bounds[b]!.min[axis]! -
        bounds[b]!.max[axis]!,
    );
    const half = Math.floor(ids.length / 2);
    return {
      min,
      max,
      children: [build(ids.slice(0, half)), build(ids.slice(half))],
    };
  };
  const tree = build(bounds.map((_, i) => i));
  surfaces.set(mesh, tree);
  return tree;
}
function boxDistance(node: SurfaceNode, p: Vec3): number {
  return Math.hypot(
    ...p.map((v, k) => Math.max(0, node.min[k]! - v, v - node.max[k]!)),
  );
}
function rayBox(node: SurfaceNode, p: Vec3, d: Vec3, limit: number): boolean {
  let near = 0,
    far = limit;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]!) < 1e-14) {
      if (p[k]! < node.min[k]! - 1e-8 || p[k]! > node.max[k]! + 1e-8)
        return false;
      continue;
    }
    const a = (node.min[k]! - p[k]!) / d[k]!,
      b = (node.max[k]! - p[k]!) / d[k]!;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (far < near) return false;
  }
  return true;
}
/** Closest point on a triangle, with barycentric binding to canonical geometry. */
function closest(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): {
  point: Vec3;
  weights: Vec3;
} {
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a),
    d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  const at = (u: number, v: number) => ({
    point: [
      a[0] + ab[0] * u + ac[0] * v,
      a[1] + ab[1] * u + ac[1] * v,
      a[2] + ab[2] * u + ac[2] * v,
    ] as Vec3,
    weights: [1 - u - v, u, v] as Vec3,
  });
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at(1 - w, w);
  }
  const denom = va + vb + vc;
  if (Math.abs(denom) < 1e-20) return { point: a, weights: [1, 0, 0] };
  return at(vb / denom, vc / denom);
}
export function surfaceAnchor(mesh: Mesh, p: Vec3) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
    throw new Error("표면 위치가 유효하지 않습니다.");
  let best: {
    triangle: number;
    distance: number;
    point: Vec3;
    weights: Vec3;
  } = { triangle: -1, distance: Infinity, point: p, weights: [1, 0, 0] };
  const visit = (node: SurfaceNode): void => {
    if (
      boxDistance(node, p) >
      Math.min(best.distance, Math.max(1e-7, diagonal(mesh) * 0.005))
    )
      return;
    if (node.children) {
      const [a, b] = node.children;
      const first = boxDistance(a, p) < boxDistance(b, p) ? a : b;
      visit(first);
      visit(first === a ? b : a);
      return;
    }
    for (const triangle of node.triangles ?? []) {
      const i = triangle * 3;
      const a = vertex(mesh, mesh.indices[i]!),
        b = vertex(mesh, mesh.indices[i + 1]!),
        c = vertex(mesh, mesh.indices[i + 2]!);
      const lower = Math.hypot(
        ...p.map((v, k) =>
          Math.max(
            0,
            Math.min(a[k]!, b[k]!, c[k]!) - v,
            v - Math.max(a[k]!, b[k]!, c[k]!),
          ),
        ),
      );
      if (lower > best.distance) continue;
      const q = closest(p, a, b, c);
      const distance = Math.hypot(...sub(q.point, p));
      if (distance < best.distance) best = { ...q, triangle: i / 3, distance };
    }
  };
  visit(surfaceTree(mesh));
  if (
    best.triangle < 0 ||
    best.distance > Math.max(1e-7, diagonal(mesh) * 0.005)
  )
    throw new Error("선택 위치가 현재 초기 모델의 표면에 없습니다.");
  return best;
}
function rayDistance(mesh: Mesh, origin: Vec3, d: Vec3, skip = -1): number {
  let nearest = Infinity;
  const visit = (node: SurfaceNode): void => {
    if (!rayBox(node, origin, d, nearest)) return;
    if (node.children) {
      visit(node.children[0]);
      visit(node.children[1]);
      return;
    }
    for (const triangle of node.triangles ?? []) {
      const i = triangle * 3;
      if (triangle === skip) continue;
      const a = vertex(mesh, mesh.indices[i]!),
        b = vertex(mesh, mesh.indices[i + 1]!),
        c = vertex(mesh, mesh.indices[i + 2]!);
      const e1 = sub(b, a),
        e2 = sub(c, a),
        h = cross(d, e2),
        det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(origin, a),
        u = dot(s, h) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1),
        v = dot(d, q) / det;
      if (v < 0 || u + v > 1) continue;
      const t = dot(e2, q) / det;
      if (t > 1e-7 && t < nearest) nearest = t;
    }
  };
  visit(surfaceTree(mesh));
  return nearest;
}
function pathValid(mesh: Mesh, path: readonly Vec3[]): void {
  if (path.length < 3)
    throw new Error("손잡이를 따라 중간 점을 포함한 경로를 선택하세요.");
  for (let i = 0; i < path.length; i++) {
    surfaceAnchor(mesh, path[i]!);
    if (i) {
      // Sample at half the surface tolerance, including short gaps between anchors.
      const steps = Math.max(
        2,
        Math.ceil(
          Math.hypot(...sub(path[i]!, path[i - 1]!)) /
            (diagonal(mesh) * 0.0025),
        ),
      );
      if (steps > 256)
        throw new Error(
          "경로 점 사이가 너무 멉니다. 표면을 따라 중간 점을 추가하세요.",
        );
      for (let step = 1; step < steps; step++)
        surfaceAnchor(mesh, mix(path[i - 1]!, path[i]!, step / steps));
    }
  }
}
function thickness(mesh: Mesh, p: Vec3): number {
  const a = surfaceAnchor(mesh, p),
    i = a.triangle * 3,
    v0 = vertex(mesh, mesh.indices[i]!),
    v1 = vertex(mesh, mesh.indices[i + 1]!),
    v2 = vertex(mesh, mesh.indices[i + 2]!);
  const n = cross(sub(v1, v0), sub(v2, v0)),
    len = Math.hypot(...n);
  if (len < 1e-12) return 0;
  const normal: Vec3 = [n[0] / len, n[1] / len, n[2] / len],
    other: Vec3 = [-normal[0], -normal[1], -normal[2]];
  return Math.min(
    rayDistance(mesh, a.point, normal, a.triangle),
    rayDistance(mesh, a.point, other, a.triangle),
  );
}
export function checkProtection(
  mesh: Mesh,
  p: Protection,
): {
  ok: boolean;
  reason: string;
} {
  try {
    if (!p.confirmed)
      throw new Error(
        "초기 모델의 보호 부위를 지정하고 전체 확인을 완료하세요.",
      );
    if (p.mode === "none") return { ok: true, reason: "보호 부위 없음 확인" };
    for (const region of p.regions) {
      if (region.length < 3)
        throw new Error("연결 부위마다 점 하나가 아닌 표면 영역을 칠하세요.");
      for (const v of region) surfaceAnchor(mesh, v);
      const origin = region[0]!,
        furthest = region.reduce((a, b) =>
          Math.hypot(...sub(a, origin)) > Math.hypot(...sub(b, origin)) ? a : b,
        ),
        edge = sub(furthest, origin);
      if (
        !region.some(
          (v) =>
            Math.hypot(...cross(edge, sub(v, origin))) >
            diagonal(mesh) ** 2 * 1e-6,
        )
      )
        throw new Error(
          "선택한 연결 부위에 면적이 없습니다. 브러시로 주변 표면을 칠하세요.",
        );
    }
    pathValid(mesh, p.path);
    const near = (q: Vec3, r: readonly Vec3[]) =>
      Math.min(...r.map((v) => Math.hypot(...sub(q, v)))) <
      diagonal(mesh) * 0.04;
    if (!near(p.path[0]!, p.regions[0]) || !near(p.path.at(-1)!, p.regions[1]))
      throw new Error("경로의 양 끝을 지정한 두 연결 부위에 연결하세요.");
    if (
      p.path.some((v) => {
        const value = thickness(mesh, v);
        return !Number.isFinite(value) || value <= diagonal(mesh) * 1e-5;
      })
    )
      throw new Error("초기 모델의 연결 경로 두께를 확인할 수 없습니다.");
    if (p.hole) {
      if (
        p.boundary.length < 3 ||
        !p.direction ||
        !p.direction.every(Number.isFinite) ||
        Math.hypot(...p.direction) < 1e-9
      )
        throw new Error("닫힌 구멍 경계와 관통 방향이 필요합니다.");
      pathValid(mesh, [...p.boundary, p.boundary[0]!]);
      const n = Math.hypot(...p.direction),
        d = p.direction.map((v) => v / n) as unknown as Vec3;
      const axis =
          Math.abs(d[0]) < 0.8 ? ([1, 0, 0] as const) : ([0, 1, 0] as const),
        u0 = cross(d, axis),
        ul = Math.hypot(...u0),
        u = u0.map((v) => v / ul) as unknown as Vec3,
        v = cross(d, u);
      const polygon = p.boundary.map((q) => [dot(q, u), dot(q, v)] as const);
      const turn = (
        a: readonly number[],
        b: readonly number[],
        c: readonly number[],
      ) =>
        (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
      for (let i = 0; i < polygon.length; i++)
        for (let j = i + 2; j < polygon.length; j++) {
          if (i === 0 && j === polygon.length - 1) continue;
          const a = polygon[i]!,
            b = polygon[(i + 1) % polygon.length]!,
            c = polygon[j]!,
            e = polygon[(j + 1) % polygon.length]!;
          if (
            turn(a, b, c) * turn(a, b, e) < 0 &&
            turn(c, e, a) * turn(c, e, b) < 0
          )
            throw new Error("구멍 경계가 교차합니다. 점 순서를 확인하세요.");
        }
      const center = p.boundary.reduce(
        (s, v) =>
          [
            s[0] + v[0] / p.boundary.length,
            s[1] + v[1] / p.boundary.length,
            s[2] + v[2] / p.boundary.length,
          ] as Vec3,
        [0, 0, 0] as Vec3,
      );
      let area = 0;
      for (let i = 0; i < p.boundary.length; i++)
        area += dot(
          cross(
            sub(p.boundary[i]!, center),
            sub(p.boundary[(i + 1) % p.boundary.length]!, center),
          ),
          d,
        );
      if (Math.abs(area) < diagonal(mesh) ** 2 * 1e-5)
        throw new Error("구멍 경계의 면적이나 관통 방향을 확인하세요.");
      for (const probe of [
        center,
        ...p.boundary.map((v) => mix(center, v, 0.65)),
      ]) {
        const origin: Vec3 = [
          probe[0] - d[0] * diagonal(mesh) * 2,
          probe[1] - d[1] * diagonal(mesh) * 2,
          probe[2] - d[2] * diagonal(mesh) * 2,
        ];
        if (Number.isFinite(rayDistance(mesh, origin, d)))
          throw new Error(
            "선택한 경계와 방향에서 구멍이 실제로 뚫려 있지 않습니다.",
          );
      }
    }
    return { ok: true, reason: "연결 경로·두께·관통 가시성 확인" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
/** Limit every step around the immutable initial geometry; never intersect all photo masks. */
export function protectedCorrection(
  initial: Mesh,
  observations: readonly {
    camera: ViewCamera;
    silhouette: Silhouette;
    confidence: number;
  }[],
  protection: Protection,
) {
  const before = checkProtection(initial, protection);
  if (!before.ok)
    return {
      mesh: initial,
      outcome: "initial-only" as const,
      reason: before.reason,
    };
  const usable = observations
    .filter((o) => o.confidence >= 0.65)
    .map((o) => ({ ...o, field: signedDistance(o.silhouette) }));
  const directions = usable.map(
    (o) => o.camera.camera.rotation.slice(6, 9) as unknown as Vec3,
  );
  if (
    usable.length < 2 ||
    !directions.some((a, i) =>
      directions.some((b, j) => j !== i && Math.abs(dot(a, b)) < 0.85),
    )
  )
    return {
      mesh: initial,
      outcome: "initial-only" as const,
      reason:
        "서로 다른 방향의 신뢰할 수 있는 관측이 부족합니다. 정렬과 기준점을 확인하세요.",
    };
  const diag = diagonal(initial),
    step = diag * 0.002,
    eps = diag * 0.002;
  const loss = (p: Vec3) => {
    const penalties = usable
      .map((o) => {
        const q = projectView(
          o.camera,
          p,
          o.silhouette.width,
          o.silhouette.height,
        );
        if (
          !q.valid ||
          q.x < 0 ||
          q.y < 0 ||
          q.x >= o.silhouette.width ||
          q.y >= o.silhouette.height
        )
          return 1;
        const w = o.silhouette.width,
          h = o.silhouette.height,
          x = Math.max(0, Math.min(w - 1, q.x - 0.5)),
          y = Math.max(0, Math.min(h - 1, q.y - 0.5)),
          x0 = Math.floor(x),
          y0 = Math.floor(y),
          x1 = Math.min(w - 1, x0 + 1),
          y1 = Math.min(h - 1, y0 + 1),
          fx = x - x0,
          fy = y - y0;
        const distance =
          ((o.field[y0 * w + x0] ?? 0) * (1 - fx) +
            (o.field[y0 * w + x1] ?? 0) * fx) *
            (1 - fy) +
          ((o.field[y1 * w + x0] ?? 0) * (1 - fx) +
            (o.field[y1 * w + x1] ?? 0) * fx) *
            fy;
        return Math.max(0, -distance - 2) / Math.max(w, h);
      })
      .sort((a, b) => a - b);
    // One inconsistent image cannot move otherwise supported geometry.
    return penalties[Math.floor((penalties.length - 1) / 2)] ?? 0;
  };
  const positions = new Float32Array(initial.positions);
  const neighbours = adjacency(initial, positions.length / 3);
  for (let round = 0; round < 3; round++)
    for (let i = 0; i < positions.length; i += 3) {
      const p: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
      if (loss(p) <= 0) continue;
      const g = [0, 1, 2].map((axis) => {
        const a = [...p] as [number, number, number],
          b = [...p] as [number, number, number];
        a[axis]! += eps;
        b[axis]! -= eps;
        return (loss(a) - loss(b)) / (2 * eps);
      });
      const len = Math.hypot(...g);
      if (len < 1e-9) continue;
      for (let k = 0; k < 3; k++) {
        const next = p[k]! - (g[k]! / len) * step;
        positions[i + k] = Math.max(
          initial.positions[i + k]! - step * 3,
          Math.min(initial.positions[i + k]! + step * 3, next),
        );
      }
    }
  // Regularize displacement, not original geometry: preserve the initial anatomy.
  const delta = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++)
    delta[i] = positions[i]! - initial.positions[i]!;
  for (let v = 0; v < positions.length / 3; v++)
    for (let axis = 0; axis < 3; axis++) {
      const from = neighbours.offsets[v]!,
        to = neighbours.offsets[v + 1]!;
      if (to === from) continue;
      let mean = 0;
      for (let i = from; i < to; i++)
        mean += delta[neighbours.neighbours[i]! * 3 + axis]! / (to - from);
      positions[v * 3 + axis] =
        initial.positions[v * 3 + axis]! +
        delta[v * 3 + axis]! * 0.8 +
        mean * 0.2;
    }
  const mesh = { ...initial, positions, bounds: computeBounds(positions) };
  // Bind selections through the original triangle instead of nearest-vertex indices.
  const remap = (p: Vec3): Vec3 => {
    const a = surfaceAnchor(initial, p),
      i = a.triangle * 3;
    const vs = [0, 1, 2].map((k) => vertex(mesh, mesh.indices[i + k]!));
    return [0, 1, 2].map((k) =>
      vs.reduce((s, v, j) => s + v[k]! * a.weights[j]!, 0),
    ) as unknown as Vec3;
  };
  const after: Protection = {
    ...protection,
    regions: [
      protection.regions[0].map(remap),
      protection.regions[1].map(remap),
    ],
    path: protection.path.map(remap),
    boundary: protection.boundary.map(remap),
  };
  const checked = checkProtection(mesh, after);
  const originalSamples = [
      ...protection.path,
      ...protection.regions[0],
      ...protection.regions[1],
    ],
    afterSamples = [...after.path, ...after.regions[0], ...after.regions[1]];
  const thick =
    protection.mode === "none" ||
    originalSamples.every(
      (p, i) =>
        thickness(mesh, afterSamples[i]!) >= thickness(initial, p) * 0.8,
    );
  if (!checked.ok || !thick)
    return {
      mesh: initial,
      outcome: "rollback" as const,
      reason: `보호 조건을 위반해 초기 형상으로 되돌렸습니다. ${checked.reason}`,
    };
  return {
    mesh,
    outcome: "accepted" as const,
    reason: "관측 지지와 변위 제한을 적용하고 보호 조건을 확인했습니다.",
  };
}
