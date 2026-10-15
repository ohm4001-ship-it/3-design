import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  canonicalCamera,
  canonicalView,
  projectPoint,
  validateCamera,
  affinePoint,
  composeAffine,
  invertAffine,
  orientedImage,
  multiplyRotation,
  type Camera,
} from "../src/render/camera.ts";
import { renderCamera } from "../src/render/ortho.ts";
import { demoMesh, boxMesh } from "../src/mesh/primitives.ts";
import { extractSilhouette } from "../src/analyze/silhouette.ts";
import { fitCamera } from "../src/reconstruct/camera-fit.ts";
test("physical camera projects known world points with +Y down and rejects behind camera", () => {
  const c: Camera = {
    ...canonicalCamera("front", 640, 480, 100),
    projection: "perspective",
    translation: [0, 0, 5],
    near: 0.01,
    far: 100,
  };
  assert.deepEqual(projectPoint(c, [1, 2, 0]), {
    x: 340,
    y: 200,
    depth: 5,
    valid: true,
  });
  assert.equal(projectPoint(c, [0, 0, 6]).valid, false);
  assert.deepEqual(projectPoint(c, [1, 2, 0], [2, 0, -10, 0, 3, 5]), {
    x: 670,
    y: 605,
    depth: 5,
    valid: true,
  });
  for (const id of ["front", "back", "left", "right", "top"] as const)
    assert.equal(
      validateCamera(canonicalCamera(id, 640, 480, 100)).projection,
      "orthographic",
    );
  assert.throws(
    () => validateCamera({ ...c, rotation: [-1, 0, 0, 0, -1, 0, 0, 0, -1] }),
    /반전/,
  );
  assert.throws(() => validateCamera({ ...c, fx: NaN }), /유효/);
});
test("duplicate landmarks do not resolve the direction of a symmetric object", () => {
  const mesh = boxMesh({ size: [1, 1, 1] }),
    view = canonicalView("front", 128, 128, 80),
    rendered = renderCamera(mesh, "front", view, 128);
  const silhouette = extractSilhouette({
    width: 128,
    height: 128,
    data: rendered.pixels,
    hadAlpha: true,
    source: { width: 128, height: 128 },
  });
  const landmarks = [0, 1, 2].map((id) => ({
    id: String(id),
    world: [0, 0, 0.5] as const,
    image: [64, 64] as const,
  }));
  const fit = fitCamera(mesh, "front", view, silhouette, landmarks);
  assert.equal(fit.ambiguous, true);
  assert.equal(fit.status, "landmarks-needed");
  assert.ok(fit.confidence <= 0.6);
});
test("raw orientation, crop and resize preserve invertible pixel coordinates", () => {
  const rotated = orientedImage(400, 300, 90, false);
  assert.deepEqual(affinePoint(rotated.matrix, [50, 20]), [280, 50]);
  const mirrored = orientedImage(400, 300, 90, true);
  assert.deepEqual(affinePoint(mirrored.matrix, [50, 20]), [20, 50]);
  const transform = composeAffine([2, 0, -10, 0, 3, -30], mirrored.matrix),
    point = [50, 20] as const;
  assert.deepEqual(affinePoint(transform, point), [30, 120]);
  assert.deepEqual(affinePoint(invertAffine(transform), [30, 120]), [50, 20]);
  assert.throws(() => invertAffine([0, 0, 0, 0, 1, 0]), /有効|유효/);
});
test("known canonical axes share the same projection contract used by the renderer", () => {
  const point = [0.2, 0.3, 0.4] as const;
  assert.deepEqual(
    projectPoint(canonicalCamera("front", 200, 200, 100), point),
    { x: 120, y: 70, depth: -0.4, valid: true },
  );
  assert.deepEqual(
    projectPoint(canonicalCamera("right", 200, 200, 100), point),
    { x: 60, y: 70, depth: -0.2, valid: true },
  );
  assert.deepEqual(projectPoint(canonicalCamera("top", 200, 200, 100), point), {
    x: 120,
    y: 140,
    depth: -0.3,
    valid: true,
  });
});
test("finite photo fit corrects tilted physical cameras using fixed-mesh correspondences", () => {
  const mesh = demoMesh(),
    base = {
      ...canonicalCamera("front", 256, 256, 380),
      projection: "perspective" as const,
      translation: [0, 0, 4] as const,
      near: 0.01,
      far: 100,
    };
  const a = (12 * Math.PI) / 180,
    b = (-9 * Math.PI) / 180;
  const rotation = multiplyRotation(
    [1, 0, 0, 0, Math.cos(b), -Math.sin(b), 0, Math.sin(b), Math.cos(b)],
    [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)],
  );
  const truth = {
    ...base,
    rotation: multiplyRotation(rotation, base.rotation),
  };
  const view = { ...canonicalView("front", 256, 256, 100), camera: truth };
  const rendered = renderCamera(mesh, "front", view, 256);
  const silhouette = extractSilhouette({
    width: 256,
    height: 256,
    data: rendered.pixels,
    hadAlpha: true,
    source: { width: 256, height: 256 },
  });
  const points = [
    [-0.5, 0, 0.2],
    [0.5, 1, 0.2],
    [-0.3, 1.7, -0.3],
    [0.3, -0.2, 0.4],
  ] as const;
  const landmarks = points.map((world, i) => {
    const p = projectPoint(truth, world);
    return { id: String(i), world, image: [p.x, p.y] as const };
  });
  const fit = fitCamera(
    mesh,
    "front",
    { ...view, camera: base },
    silhouette,
    landmarks,
  );
  assert.ok(fit.iou > 0.9, JSON.stringify(fit));
  assert.ok((fit.landmarkError ?? Infinity) < 3, JSON.stringify(fit));
  assert.equal(fit.status, "aligned");
  assert.ok(fit.evaluations < 200);
});
test("photo fitting covers both signs of 5/10/15 degree yaw, pitch and roll without moving the mesh", () => {
  const mesh = demoMesh(),
    original = new Float32Array(mesh.positions);
  const base = {
    ...canonicalCamera("front", 256, 256, 380),
    projection: "perspective" as const,
    translation: [0, 0, 4] as const,
    near: 0.01,
    far: 100,
  };
  const points = [
    [-0.5, 0, 0.2],
    [0.5, 1, 0.2],
    [-0.3, 1.7, -0.3],
    [0.3, -0.2, 0.4],
  ] as const;
  for (const axis of [0, 1, 2])
    for (const degrees of [-15, -10, -5, 5, 10, 15]) {
      const t = (degrees * Math.PI) / 180,
        c = Math.cos(t),
        s = Math.sin(t);
      const r = (
        axis === 0
          ? [c, 0, s, 0, 1, 0, -s, 0, c]
          : axis === 1
            ? [1, 0, 0, 0, c, -s, 0, s, c]
            : [c, -s, 0, s, c, 0, 0, 0, 1]
      ) as Parameters<typeof multiplyRotation>[0];
      const truth = { ...base, rotation: multiplyRotation(r, base.rotation) },
        view = { ...canonicalView("front", 256, 256, 100), camera: truth };
      const rendered = renderCamera(mesh, "front", view, 256),
        silhouette = extractSilhouette({
          width: 256,
          height: 256,
          data: rendered.pixels,
          hadAlpha: true,
          source: { width: 256, height: 256 },
        });
      const landmarks = points.map((world, i) => {
        // Independent scalar projection of the front camera, rather than projectPoint.
        const q = [world[0], -world[1], -world[2]],
          x = r[0] * q[0]! + r[1] * q[1]! + r[2] * q[2]!,
          y = r[3] * q[0]! + r[4] * q[1]! + r[5] * q[2]!,
          z = r[6] * q[0]! + r[7] * q[1]! + r[8] * q[2]! + 4;
        return {
          id: String(i),
          world,
          image: [128 + (380 * x) / z, 128 + (380 * y) / z] as const,
        };
      });
      const fit = fitCamera(
        mesh,
        "front",
        { ...view, camera: base },
        silhouette,
        landmarks,
      );
      assert.ok(
        fit.iou > 0.88 && fit.landmarkError !== null && fit.landmarkError < 3,
        `axis=${axis}, angle=${degrees}: ${JSON.stringify(fit)}`,
      );
      assert.equal(fit.status, "aligned");
      assert.ok(fit.evaluations < 200);
    }
  assert.deepEqual(mesh.positions, original);
});
