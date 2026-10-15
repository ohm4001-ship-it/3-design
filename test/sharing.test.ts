import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { startServer } from "../src/web/server.ts";

test("public sharing isolates browser uploads, assets and mutations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sixview-sharing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Files in the server root must never become a visitor's workspace.
  await writeFile(join(directory, "private.txt"), "private local work");
  const server = await startServer({
    port: 0,
    directory,
    isolatedSessions: true,
  });
  t.after(() => server.close());
  const a = await fetch(server.url + "api/state");
  const b = await fetch(server.url + "api/state");
  const cookieA = a.headers.get("set-cookie")!.split(";")[0]!;
  const cookieB = b.headers.get("set-cookie")!.split(";")[0]!;
  assert.notEqual(cookieA, cookieB);
  assert.match(a.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
  const stateA = await a.json();
  const stateB = await b.json();
  assert.equal(stateA.directory, "이 브라우저 전용 작업 공간");
  assert.equal(stateB.directory, "이 브라우저 전용 작업 공간");
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: "#cc3333",
    },
  })
    .png()
    .toBuffer();
  const upload = await fetch(server.url + "api/upload/front", {
    method: "POST",
    headers: { Cookie: cookieA },
    body: png,
  });
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).views[0].hasImage, true);
  const readA = await fetch(server.url + "views/front/raw", {
    headers: { Cookie: cookieA },
  });
  assert.equal(readA.status, 200);
  assert.equal(
    (
      await fetch(server.url + "views/front/raw", {
        headers: { Cookie: cookieB },
      })
    ).status,
    404,
  );
  const crossOrigin = await fetch(server.url + "api/clear/front", {
    method: "POST",
    headers: { Cookie: cookieA, Origin: "https://other.example" },
  });
  assert.equal(crossOrigin.status, 403);
  const clearB = await fetch(server.url + "api/clear/front", {
    method: "POST",
    headers: { Cookie: cookieB },
  });
  assert.equal(clearB.status, 200);
  const persisted = await fetch(server.url + "api/state", {
    headers: { Cookie: cookieA },
  });
  assert.equal(persisted.headers.get("set-cookie"), null);
  assert.equal((await persisted.json()).views[0].hasImage, true);
  const forged = await fetch(server.url + "api/state", {
    headers: { Cookie: "sixview-session=../../outside" },
  });
  assert.match(
    forged.headers.get("set-cookie")!,
    /^sixview-session=[\da-f-]{36};/,
  );
  assert.equal(
    (await fetch(server.url + "private.txt", { headers: { Cookie: cookieA } }))
      .status,
    404,
  );
  assert.deepEqual(await (await fetch(server.url + "healthz")).json(), {
    status: "ok",
  });
});
