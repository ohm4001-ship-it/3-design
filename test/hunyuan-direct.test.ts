import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  createHunyuanHandler,
  generateDirect,
  type DirectInput,
} from "../src/web/hunyuan.ts";
import { boxMesh } from "../src/mesh/primitives.ts";
import { writeGlb } from "../src/mesh/glb.ts";

test("local direct generation forwards official view order and controls without modifying GLB", async (t) => {
  const glb = writeGlb(boxMesh({ size: [1, 1, 1] }));
  let received: any;
  let acknowledgeColor = false;
  const server = createServer(async (request, response) => {
    if (request.url === "/health") {
      response.end('{"ready":true}');
      return;
    }
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(Buffer.from(part));
    received = JSON.parse(Buffer.concat(parts).toString());
    response.setHeader("X-Hunyuan-Seed", "1234");
    response.setHeader("X-Hunyuan-Faces", "12");
    if (acknowledgeColor) {
      response.setHeader("X-Hunyuan-Color", "photo-projection");
      response.setHeader("X-Hunyuan-Color-Coverage", "0.8");
    }
    response.end(glb);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const previous = process.env.SIXVIEW_LOCAL_AI;
  process.env.SIXVIEW_LOCAL_AI = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIXVIEW_LOCAL_AI;
    else process.env.SIXVIEW_LOCAL_AI = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const output = await generateDirect(
    {
      views: {
        front: new Uint8Array([1]),
        left: new Uint8Array([2]),
        right: new Uint8Array([3]),
      },
      steps: 10,
      guidance: 4.5,
      seed: 1234,
      resolution: 196,
      chunks: 8000,
      removeBackground: false,
      randomizeSeed: false,
    },
    () => {},
    AbortSignal.timeout(2000),
  );
  assert.equal(received.views.left, Buffer.from([2]).toString("base64"));
  assert.equal(received.views.right, Buffer.from([3]).toString("base64"));
  assert.equal(received.guidance, 4.5);
  assert.equal(received.steps, 10);
  assert.equal(received.removeBackground, false);
  assert.equal(received.includeColor, false);
  assert.deepEqual(output.bytes, glb);
  assert.equal((output.stats as any).engine, "local");
  await assert.rejects(
    generateDirect(
      {
        views: { front: new Uint8Array([1]) },
        steps: 5,
        guidance: 5,
        seed: 1234,
        resolution: 256,
        chunks: 8000,
        removeBackground: false,
        randomizeSeed: false,
        includeColor: true,
      },
      () => {},
      AbortSignal.timeout(2000),
    ),
    /색이 포함된 결과/,
  );
  assert.equal(received.includeColor, true);
  acknowledgeColor = true;
  const colored = await generateDirect(
    {
      views: { front: new Uint8Array([1]) },
      steps: 5,
      guidance: 5,
      seed: 1234,
      resolution: 256,
      chunks: 8000,
      removeBackground: false,
      randomizeSeed: false,
      includeColor: true,
    },
    () => {},
    AbortSignal.timeout(2000),
  );
  assert.equal((colored.stats as any).color, "photo-projection");
  assert.equal((colored.stats as any).colorCoverage, "0.8");
  assert.deepEqual(colored.bytes, glb);
});

test("direct jobs preserve provider GLB bytes, isolate downloads and fail without silhouette fallback", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hunyuan-direct-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const glb = writeGlb(boxMesh({ size: [1, 2, 3] }));
  let input: DirectInput | undefined;
  let finish!: () => void;
  let reject!: (error: Error) => void;
  const handler = createHunyuanHandler(async (value, progress) => {
    input = value;
    progress("test provider running");
    await new Promise<void>((resolve, failure) => {
      finish = resolve;
      reject = failure;
    });
    return { bytes: glb, seed: 42, stats: { test: true } };
  });
  const server = createServer((request, response) => {
    const visitor = request.headers["x-test-visitor"] === "b" ? "b" : "a";
    void handler(request, response, join(directory, visitor)).catch((error) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const png = await sharp({
    create: { width: 16, height: 16, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const image = "data:image/png;base64," + png.toString("base64");
  const post = (body: unknown, visitor = "a") =>
    fetch(base + "/api/hunyuan/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-visitor": visitor,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await post({ views: {} })).status, 400);
  assert.equal(
    (await post({ views: { front: image, top: image } })).status,
    400,
  );
  assert.equal(
    (await post({ views: { front: image }, steps: NaN })).status,
    400,
  );
  assert.equal(
    (await post({ views: { front: image }, includeColor: "yes" })).status,
    400,
  );
  assert.equal(
    (await post({ views: { front: "data:image/png;base64,AAAA" } })).status,
    400,
  );
  const started = await post({
    views: { front: image, left: image },
    steps: 10,
    removeBackground: false,
    seed: 42,
    randomizeSeed: false,
  });
  assert.equal(started.status, 202);
  assert.equal((await started.json()).job.status, "running");
  assert.equal(input?.steps, 10);
  assert.equal(input?.removeBackground, false);
  assert.ok(input?.views.front);
  assert.ok(input?.views.left);
  assert.equal(input?.views.right, undefined);
  assert.equal((await post({ views: { front: image } }, "b")).status, 429);
  assert.equal(
    (
      await fetch(base + "/api/hunyuan/job", {
        headers: { "x-test-visitor": "b" },
      }).then((r) => r.json())
    ).job,
    null,
  );
  finish();
  let succeeded: any;
  for (let i = 0; i < 40; i++) {
    succeeded = (await fetch(base + "/api/hunyuan/job").then((r) => r.json()))
      .job;
    if (succeeded.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(succeeded.status, "succeeded");
  const output = await fetch(base + succeeded.download);
  assert.deepEqual(new Uint8Array(await output.arrayBuffer()), glb);
  assert.equal(
    (
      await fetch(base + succeeded.download, {
        headers: { "x-test-visitor": "b" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(base + "/api/hunyuan/result?id=stale")).status,
    404,
  );
  await post({ views: { front: image } });
  reject(new Error("GPU quota exhausted"));
  let failed: any;
  for (let i = 0; i < 40; i++) {
    failed = (await fetch(base + "/api/hunyuan/job").then((r) => r.json())).job;
    if (failed.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(failed.status, "failed");
  assert.match(failed.message, /GPU quota/);
  assert.equal(failed.download, undefined);
  assert.equal((await fetch(base + succeeded.download)).status, 404);
});
