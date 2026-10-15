import {
  angleRotation,
  multiplyRotation,
  projectPoint,
  projectView,
  affinePoint,
  invertAffine,
  rotatePoint,
  validateCamera,
  type Camera,
  type Landmark,
  type ViewCamera,
} from "../render/camera.ts";
import { renderCamera } from "../render/ortho.ts";
import type { Mesh } from "../mesh/types.ts";
import type { Silhouette } from "../analyze/silhouette.ts";
import type { ViewId } from "../views.ts";
export interface CameraFit {
  readonly camera: Camera;
  readonly iou: number;
  readonly landmarkError: number | null;
  readonly confidence: number;
  readonly ambiguous: boolean;
  readonly evaluations: number;
  readonly status: "aligned" | "landmarks-needed" | "input-review";
  readonly reason: string;
}
function overlap(mask: Silhouette, render: Uint8Array, size: number): number {
  let intersection = 0,
    union = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a =
          mask.mask[
            Math.min(
              mask.height - 1,
              Math.floor(((y + 0.5) * mask.height) / size),
            ) *
              mask.width +
              Math.min(
                mask.width - 1,
                Math.floor(((x + 0.5) * mask.width) / size),
              )
          ] === 1,
        b = (render[(y * size + x) * 4 + 3] ?? 0) > 0;
      if (a && b) intersection++;
      if (a || b) union++;
    }
  return union ? intersection / union : 0;
}
/** Fixed world/model gauge. Local physical pose and bounded intrinsics only. */
export function fitCamera(
  mesh: Mesh,
  id: ViewId,
  view: ViewCamera,
  silhouette: Silhouette,
  landmarks: readonly Landmark[] = [],
  locked = false,
): CameraFit {
  validateCamera(view.camera);
  const size = 96,
    base = view.camera;
  let evaluations = 0;
  type Candidate = {
    p: number[];
    camera: Camera;
    iou: number;
    landmarkError: number | null;
    loss: number;
  };
  const evaluate = (p: number[]): Candidate => {
    const camera: Camera = {
      ...base,
      rotation: multiplyRotation(
        angleRotation(p[0]!, p[1]!, p[2]!),
        base.rotation,
      ),
      translation: [
        base.translation[0] + p[3]!,
        base.translation[1] + p[4]!,
        base.translation[2] + p[5]!,
      ],
      fx: base.fx * Math.exp(p[6]!),
      fy: base.fy * Math.exp(p[6]!),
    };
    const iou = overlap(
      silhouette,
      renderCamera(mesh, id, { ...view, camera }, size).pixels,
      size,
    );
    const errors = landmarks.map((l) => {
      const q = projectPoint(camera, l.world);
      return q.valid
        ? Math.hypot(q.x - l.image[0], q.y - l.image[1])
        : Math.hypot(base.width, base.height);
    });
    const landmarkError = errors.length
      ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
      : null;
    evaluations++;
    return {
      p,
      camera,
      iou,
      landmarkError,
      loss:
        1 -
        iou +
        ((landmarkError ?? 0) / Math.hypot(base.width, base.height)) * 4,
    };
  };
  let best = evaluate([0, 0, 0, 0, 0, 0, 0]);
  const seed = [0, 0, 0, 0, 0, 0, 0];
  if (!locked && silhouette.bbox) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const q = projectView(
        view,
        [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!],
        silhouette.width,
        silhouette.height,
      );
      if (q.valid) {
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y);
        maxY = Math.max(maxY, q.y);
      }
    }
    const b = silhouette.bbox;
    if (maxX > minX && maxY > minY) {
      const ratio = Math.max(
        0.5,
        Math.min(
          2,
          Math.min(
            (b.x1 - b.x0) / (maxX - minX),
            (b.y1 - b.y0) / (maxY - minY),
          ),
        ),
      );
      seed[6] = Math.log(ratio);
      const inverse = invertAffine(view.image);
      const target = affinePoint(inverse, [
        (((b.x0 + b.x1) / 2) * view.width) / silhouette.width,
        (((b.y0 + b.y1) / 2) * view.height) / silhouette.height,
      ]);
      const predicted = affinePoint(inverse, [
        (((minX + maxX) / 2) * view.width) / silhouette.width,
        (((minY + maxY) / 2) * view.height) / silhouette.height,
      ]);
      const center = mesh.bounds.min.map(
        (v, i) => (v + mesh.bounds.max[i]!) / 2,
      ) as unknown as readonly [number, number, number];
      const depth =
        base.projection === "perspective"
          ? rotatePoint(base.rotation, center)[2] + base.translation[2]
          : 1;
      seed[3] =
        ((target[0] - (base.cx + ratio * (predicted[0] - base.cx))) * depth) /
        (base.fx * ratio);
      seed[4] =
        ((target[1] - (base.cy + ratio * (predicted[1] - base.cy))) * depth) /
        (base.fy * ratio);
      const framed = evaluate(seed);
      if (framed.loss < best.loss) best = framed;
    }
  }
  const coarse: Candidate[] = [best];
  if (!locked) {
    for (const yaw of [-180, -90, -30, 0, 30, 90])
      for (const pitch of [-15, 0, 15]) {
        if (yaw === 0 && pitch === 0) continue;
        const c = evaluate([yaw, pitch, 0, seed[3]!, seed[4]!, 0, seed[6]!]);
        coarse.push(c);
        if (c.loss < best.loss) best = c;
      }
    // Finite coordinate descent; scratch is per run, no cross-source cache.
    for (const angle of [10, 4, 1.5, 0.5]) {
      const steps = [
        angle,
        angle,
        angle,
        angle / 300,
        angle / 300,
        base.projection === "perspective" ? angle / 50 : 0,
        angle / 100,
      ];
      for (let round = 0; round < 3; round++)
        for (let axis = 0; axis < 7; axis++) {
          if (steps[axis] === 0) continue;
          for (const sign of [-1, 1]) {
            const p = [...best.p];
            p[axis]! += sign * steps[axis]!;
            // Keep focal/scale and positive perspective depth in a bounded neighbourhood.
            if (
              Math.abs(p[6]!) > Math.log(2) ||
              (base.projection === "perspective" &&
                base.translation[2] + p[5]! <= 0.1)
            )
              continue;
            const c = evaluate(p);
            if (c.loss < best.loss) best = c;
          }
        }
    }
  }
  const alternatives = coarse
    .filter((c) => Math.abs(c.p[0]! - best.p[0]!) > 45)
    .sort((a, b) => a.loss - b.loss);
  const noncollinear = (
    points: readonly (readonly number[])[],
    tolerance: number,
  ) => {
    if (points.length < 3) return false;
    const a = points[0]!,
      delta = (p: readonly number[]) =>
        [0, 1, 2].map((k) => (p[k] ?? 0) - (a[k] ?? 0));
    const b = points
      .map(delta)
      .sort((p, q) => Math.hypot(...q) - Math.hypot(...p))[0]!;
    return points.some((p) => {
      const c = delta(p);
      return (
        Math.hypot(
          b[1]! * c[2]! - b[2]! * c[1]!,
          b[2]! * c[0]! - b[0]! * c[2]!,
          b[0]! * c[1]! - b[1]! * c[0]!,
        ) > tolerance
      );
    });
  };
  const spread =
    noncollinear(
      landmarks.map((l) => l.world),
      Math.hypot(...mesh.bounds.max.map((v, i) => v - mesh.bounds.min[i]!)) **
        2 *
        1e-6,
    ) &&
    noncollinear(
      landmarks.map((l) => l.image),
      Math.hypot(base.width, base.height) ** 2 * 1e-6,
    );
  const ambiguous =
    !spread && !!alternatives[0] && alternatives[0].loss - best.loss < 0.025;
  const landmarkGood =
    best.landmarkError === null ||
    best.landmarkError <= Math.hypot(base.width, base.height) * 0.015;
  const aligned = best.iou >= 0.85 && landmarkGood && !ambiguous;
  const confidence = aligned ? Math.min(1, best.iou) : Math.min(0.6, best.iou);
  return {
    camera: best.camera,
    iou: best.iou,
    landmarkError: best.landmarkError,
    confidence,
    ambiguous,
    evaluations,
    status: aligned
      ? "aligned"
      : ambiguous
        ? "landmarks-needed"
        : "input-review",
    reason: aligned
      ? "외곽과 기준점 오차를 확인했습니다."
      : ambiguous
        ? "비슷한 방향 후보가 여러 개입니다. 비대칭 위치의 기준점을 추가하세요."
        : "외곽·기준점이 충분히 일치하지 않습니다. 촬영 방향과 초기 형상을 확인하세요.",
  };
}
