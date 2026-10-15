import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyReconstruction,
  saveReconstruction,
  loadReconstruction,
  saveTransforms,
  loadTransforms,
  IDENTITY_TRANSFORM,
  validateReconstruction,
} from "../src/orientation.ts";
import { VIEW_IDS } from "../src/views.ts";
import { boxMesh, mergeMeshes } from "../src/mesh/primitives.ts";
import { writeGlb, parseGlb, toObj, parseObj } from "../src/mesh/index.ts";
import { measuredExports, measurementScale } from "../src/mesh/measurements.ts";
import {
  checkProtection,
  protectedCorrection,
  EMPTY_PROTECTION,
  type Protection,
} from "../src/reconstruct/protection.ts";
import { canonicalView } from "../src/render/camera.ts";
import { startServer } from "../src/web/server.ts";
import { renderToDirectory } from "../src/pipeline.ts";
test("versioned records survive legacy transform writes and invalidate stale identities", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "camera-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = emptyReconstruction("source-a", "photo");
  await saveReconstruction(directory, state);
  const transforms = Object.fromEntries(
    VIEW_IDS.map((id) => [
      id,
      { ...IDENTITY_TRANSFORM, rotation: 90 as const },
    ]),
  ) as Awaited<ReturnType<typeof loadTransforms>>;
  await saveTransforms(directory, transforms);
  assert.equal((await loadReconstruction(directory, "source-a")).kind, "photo");
  assert.equal((await loadTransforms(directory)).front.rotation, 90);
  const invalidated = await loadReconstruction(directory, "source-b");
  assert.equal(invalidated.views.front.camera, null);
  assert.equal(invalidated.protection.confirmed, false);
  assert.match(invalidated.warning ?? "", /変更|변경/);
  await writeFile(
    join(directory, "views.json"),
    JSON.stringify({
      _reconstruction: { version: 2, kind: "photo", sourceId: "source-a" },
    }),
  );
  const malformed = await loadReconstruction(directory, "source-a");
  assert.equal(malformed.kind, "photo");
  assert.equal(malformed.views.front.confidence, 0);
  assert.ok(malformed.warning);
  assert.throws(
    () =>
      validateReconstruction({
        ...state,
        views: {
          ...state.views,
          front: { ...state.views.front, confidence: 1, status: "aligned" },
        },
      }),
    /카메라/,
  );
});
test("measured spans use uniform scale, expose conflicts and roundtrip GLB meters / OBJ millimeters", () => {
  const mesh = boxMesh({ size: [1, 1, 1] }),
    a = [-0.5, 0, 0.5] as const,
    b = [0.5, 0, 0.5] as const;
  const output = measuredExports(mesh, [{ id: "폭", a, b, mm: 200 }]);
  const glb = parseGlb(writeGlb(output.glb)),
    obj = parseObj(new TextEncoder().encode(toObj(output.obj, "units=mm")));
  assert.ok(Math.abs(glb.bounds.max[0] - glb.bounds.min[0] - 0.2) < 0.00002);
  assert.equal(obj.bounds.max[0] - obj.bounds.min[0], 200);
  const inconsistent = measurementScale([
    { id: "폭", a, b, mm: 200 },
    { id: "높이", a: [0, -0.5, 0], b: [0, 0.5, 0], mm: 300 },
  ]);
  assert.equal(inconsistent.mmPerUnit, 250);
  assert.deepEqual(
    inconsistent.residuals.map((r) => r.residualMm),
    [50, -50],
  );
  assert.equal(measurementScale([]).mmPerUnit, null);
  assert.throws(
    () => measurementScale([{ id: "0", a, b: a, mm: 200 }]),
    /길이/,
  );
  assert.throws(() => measurementScale([{ id: "0", a, b, mm: -1 }]), /양수/);
});
test("protection validates actual surface paths and through visibility, refusing a filled hole", () => {
  const ring = mergeMeshes([
    boxMesh({ size: [2, 0.5, 0.4], at: [0, 0.75, 0] }),
    boxMesh({ size: [2, 0.5, 0.4], at: [0, -0.75, 0] }),
    boxMesh({ size: [0.5, 1, 0.4], at: [-0.75, 0, 0] }),
    boxMesh({ size: [0.5, 1, 0.4], at: [0.75, 0, 0] }),
  ]);
  const p: Protection = {
    mode: "required",
    confirmed: true,
    hole: true,
    regions: [
      [
        [-0.8, 0.75, 0.2],
        [-0.78, 0.75, 0.2],
        [-0.8, 0.77, 0.2],
      ],
      [
        [0.8, 0.75, 0.2],
        [0.78, 0.75, 0.2],
        [0.8, 0.77, 0.2],
      ],
    ],
    path: [
      [-0.8, 0.75, 0.2],
      [0, 0.75, 0.2],
      [0.8, 0.75, 0.2],
    ],
    boundary: [
      [-0.5, -0.5, 0],
      [0.5, -0.5, 0],
      [0.5, 0.5, 0],
      [-0.5, 0.5, 0],
    ],
    direction: [0, 0, 1],
  };
  assert.equal(
    checkProtection(ring, p).ok,
    true,
    checkProtection(ring, p).reason,
  );
  assert.equal(
    checkProtection(ring, { ...p, regions: [[p.regions[0][0]!], p.regions[1]] })
      .ok,
    false,
    "a lone point is not an attachment area",
  );
  const filled = mergeMeshes([ring, boxMesh({ size: [1, 1, 0.4] })]);
  assert.equal(checkProtection(filled, p).ok, false);
  assert.equal(
    checkProtection(ring, {
      ...p,
      path: [
        [-0.8, 0.75, 0.2],
        [0, 0, 0],
        [0.8, 0.75, 0.2],
      ],
    }).ok,
    false,
  );
  assert.equal(
    protectedCorrection(ring, [], EMPTY_PROTECTION).outcome,
    "initial-only",
  );
  assert.equal(protectedCorrection(ring, [], p).outcome, "initial-only");
  const full = {
    width: 32,
    height: 32,
    mask: new Uint8Array(32 * 32).fill(1),
  } as Parameters<typeof protectedCorrection>[1][number]["silhouette"];
  const result = protectedCorrection(
    ring,
    [
      {
        camera: canonicalView("front", 32, 32, 10),
        silhouette: full,
        confidence: 1,
      },
      {
        camera: canonicalView("left", 32, 32, 10),
        silhouette: full,
        confidence: 1,
      },
    ],
    p,
  );
  assert.equal(result.outcome, "accepted");
  assert.deepEqual(result.mesh.positions, ring.positions);
});
test("real HTTP rejects stale/forged input, keeps initial-only truthful and blocks orphan downloads", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "camera-http-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const mesh = boxMesh({ size: [1, 1, 1] });
  await renderToDirectory(mesh, directory, { size: 256 });
  const server = await startServer({ directory, port: 0 });
  t.after(() => server.close());
  const get = async () => await (await fetch(server.url + "api/state")).json();
  const post = async (path: string, body: unknown) =>
    fetch(server.url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let state = await get();
  assert.equal(state.reconstruction.kind, "reference");
  const imported = await fetch(server.url + "api/initial", {
    method: "POST",
    body: writeGlb(mesh),
  });
  assert.equal(imported.status, 200);
  state = await imported.json();
  const identity = {
    sourceId: state.reconstruction.sourceId,
    meshId: state.reconstruction.meshId,
  };
  assert.equal((await post("api/reconstruction", null)).status, 400);
  assert.equal(
    (
      await post("api/reconstruction", {
        ...identity,
        view: "front",
        record: { landmarks: null },
      })
    ).status,
    400,
  );
  const forged = await post("api/reconstruction", {
    ...identity,
    view: "front",
    record: { confidence: 1, status: "aligned" },
  });
  assert.equal(forged.status, 200);
  assert.equal((await forged.json()).reconstruction.views.front.confidence, 0);
  assert.equal(
    (
      await post("api/reconstruction", {
        ...identity,
        sourceId: "old-source",
        kind: "photo",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post("api/reconstruction", {
        ...identity,
        protection: { ...EMPTY_PROTECTION, confirmed: true },
      })
    ).status,
    400,
  );
  const revision = (await get()).revision;
  const concurrent = await Promise.all(
    [{ locked: true }, { excluded: true }].map((record) =>
      fetch(server.url + "api/reconstruction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sixview-Revision": revision,
        },
        body: JSON.stringify({ ...identity, view: "front", record }),
      }),
    ),
  );
  assert.deepEqual(
    concurrent.map((r) => r.status).sort(),
    [200, 409],
    "a queued stale edit cannot overwrite a newer calibration",
  );
  const built = await post("api/generate", { resolution: 32 });
  assert.equal(built.status, 200);
  state = await built.json();
  assert.equal(state.result.outcome, "initial-only");
  assert.ok(state.result.reason);
  const previousResultId = state.result.meshId;
  const models = await (await fetch(server.url + "api/cad/models")).json();
  assert.equal(
    models.find((m: { id: string }) => m.id === "model-glb").meta["상태"],
    "initial-only",
  );
  const saved = await post("api/reconstruction", {
    ...identity,
    measurements: [{ id: "폭", a: [-0.5, 0, 0.5], b: [0.5, 0, 0.5], mm: 200 }],
  });
  assert.equal(saved.status, 200);
  assert.equal((await fetch(server.url + "model.glb")).status, 404);
  const measured = await post("api/generate", { resolution: 32 });
  assert.equal(measured.status, 200);
  const measuredState = await measured.json();
  assert.equal(measuredState.result.measurement.mmPerUnit, 200);
  const exported = parseGlb(
    new Uint8Array(await (await fetch(server.url + "model.glb")).arrayBuffer()),
  );
  assert.ok(
    Math.abs(exported.bounds.max[0] - exported.bounds.min[0] - 0.2) < 0.00002,
  );
  assert.equal(
    (await fetch(server.url + "model.glb?id=" + previousResultId)).status,
    404,
  );
  assert.equal(
    (await fetch(server.url + "api/cad/asset/model-glb?id=" + previousResultId))
      .status,
    404,
  );
  const measuredModels = await (
    await fetch(server.url + "api/cad/models")
  ).json();
  assert.equal(
    measuredModels.find((m: { id: string }) => m.id === "model-glb").asset
      .normalizeToMm,
    undefined,
  );
  assert.equal((await fetch(server.url + "voxels.glb")).status, 404);
  const persisted = await loadReconstruction(directory, identity.sourceId);
  await saveReconstruction(directory, { ...persisted, measurements: [] });
  assert.equal(
    (await get()).result,
    null,
    "out-of-band calibration edits invalidate manifest as well",
  );
  assert.equal((await fetch(server.url + "model.glb")).status, 404);
  await fetch(server.url + "api/clear/front", { method: "POST" });
  const changed = await get();
  assert.notEqual(changed.reconstruction.sourceId, identity.sourceId);
  assert.equal(changed.result, null);
  assert.equal((await fetch(server.url + "model.glb")).status, 404);
  assert.equal(
    (await (await fetch(server.url + "api/cad/models")).json()).some(
      (m: { id: string }) => m.id === "model-glb",
    ),
    false,
  );
  assert.ok(
    (await readFile(join(directory, "model.glb"))).length > 0,
    "test leaves an actual orphan asset, not a mocked missing file",
  );
  await writeFile(join(directory, "views.json"), "{broken");
  const damaged = await get();
  assert.ok(damaged.reconstruction.warning);
  assert.equal(damaged.reconstruction.kind, "photo");
  const recovered = await post("api/reconstruction/reset", {
    sourceId: damaged.reconstruction.sourceId,
    meshId: damaged.reconstruction.meshId,
  });
  assert.equal(recovered.status, 200);
  const backup = (await readdir(directory)).find((name) =>
    name.startsWith("views.backup-"),
  );
  assert.ok(backup);
  assert.equal(await readFile(join(directory, backup), "utf8"), "{broken");
});
