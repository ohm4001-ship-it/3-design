import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import { VIEWS, VIEW_IDS, imageAxes, isViewId, type ViewId } from "../views.ts";
import {
  loadTransforms,
  saveTransforms,
  updateTransform,
  type ViewTransform,
} from "../orientation.ts";
import { prepareViewSet } from "../preprocess.ts";
import { validate } from "../validation.ts";
import {
  reconstructFromViews,
  viewPathsFromDirectory,
  writePrepared,
  type ReconstructMethod,
} from "../pipeline.ts";
import type { ViewSetReport } from "../analyze/types.ts";
import { handleCadRequest, readCurrentManifest } from "./cad.ts";
import {
  inputIdentity,
  loadReconstruction,
  saveReconstruction,
  resetReconstruction,
  reconstructionIdentity,
  blankCamera,
  validateReconstruction,
  emptyReconstruction,
  type ReconstructionState,
} from "../orientation.ts";
import {
  defaultPhotoCamera,
  IDENTITY_AFFINE,
  type Camera,
} from "../render/camera.ts";
import { renderCamera } from "../render/ortho.ts";
import { fitCamera } from "../reconstruct/camera-fit.ts";
import {
  checkProtection,
  EMPTY_PROTECTION,
  surfaceAnchor,
} from "../reconstruct/protection.ts";
import {
  center,
  scaleMesh,
  parseMesh,
  writeGlb,
  loadMesh,
  type Mesh,
} from "../mesh/index.ts";
import { resolveProvider, aiProvider } from "../generate/index.ts";
import { createHunyuanHandler } from "./hunyuan.ts";
export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  /** Give each browser an unguessable, server-issued workspace for public sharing. */
  readonly isolatedSessions?: boolean;
  /** Directory holding `front.png` … `top.png`, `views.json`, and every derived file. */
  readonly directory: string;
}
export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
/** Saved after a successful build; cleared whenever an input or correction changes. */
const RESULT_FILE = "result.json";
interface StoredResult {
  readonly sourceId?: string;
  readonly meshId?: string;
  readonly outcome?: string;
  readonly reason?: string;
  readonly measurement?: unknown;
  readonly triangles: number;
  readonly resolution: number;
  readonly method: ReconstructMethod;
  readonly warning?: string;
  readonly score: number;
  readonly colourScore: number;
  readonly comparisons: ReadonlyArray<{
    readonly id: ViewId;
    readonly iou: number;
    readonly colour: number;
  }>;
  /** `ai` only: the generated shape fitted to the views, before silhouette correction. */
  readonly generated?: {
    readonly score: number;
    readonly colourScore: number;
    readonly yaw: number;
  };
}
/**
 * Studio backend: uploads, per-view corrections, live alignment validation, and
 * the visual-hull build, all against one view directory. The page itself is the
 * Vite build served by `cad.ts`; this module owns the JSON API and the files.
 */
export async function startServer(
  options: ServerOptions,
): Promise<RunningServer> {
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true });
  const sessions = new Map<string, string>();
  const handleHunyuan = createHunyuanHandler();
  // Mutations and builds touch the same files; run them one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  const server = createServer((request, response) => {
    if (request.url === "/healthz") return json(response, { status: "ok" });
    let workspace = directory;
    if (options.isolatedSessions) {
      const cookie = request.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("sixview-session="))
        ?.slice("sixview-session=".length);
      let session = cookie && sessions.has(cookie) ? cookie : undefined;
      if (!session) {
        session = randomUUID();
        sessions.set(session, join(directory, session));
        const secure =
          request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
        response.setHeader(
          "Set-Cookie",
          `sixview-session=${session}; HttpOnly; SameSite=Lax; Path=/${secure}`,
        );
      }
      workspace = sessions.get(session)!;
      response.setHeader("Vary", "Cookie");
      if (request.method === "POST" && request.headers.origin) {
        let sameOrigin = false;
        try {
          sameOrigin =
            new URL(request.headers.origin).host === request.headers.host;
        } catch {
          /* Invalid origins are rejected below. */
        }
        if (!sameOrigin) {
          response.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8",
          });
          response.end("현재 사이트에서 작업을 다시 실행하세요.");
          return;
        }
      }
    }
    const run = async () => {
      if (options.isolatedSessions) await mkdir(workspace, { recursive: true });
      if (await handleHunyuan(request, response, workspace)) return;
      return handle(
        request,
        response,
        workspace,
        serial,
        options.isolatedSessions,
      );
    };
    run().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) {
        response.writeHead(error instanceof HttpError ? error.status : 500, {
          "Content-Type": "text/plain; charset=utf-8",
        });
      }
      response.end(message);
    });
  });

  const {
    promise,
    resolve: ready,
    reject,
  } = Promise.withResolvers<RunningServer>();
  server.once("error", reject);
  server.listen(options.port, options.host ?? "127.0.0.1", () => {
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : options.port;
    ready({
      url: `http://127.0.0.1:${port}/`,
      close: async () => {
        const closed = Promise.withResolvers<void>();
        server.close(() => closed.resolve());
        await closed.promise;
      },
    });
  });
  return promise;
}
type Serial = <T>(task: () => Promise<T>) => Promise<T>;
async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  serial: Serial,
  publicWorkspace = false,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const post = request.method === "POST";
  // `/`, `/viewer`, built assets, and the viewer's model listing.
  if (await handleCadRequest(request, response, directory)) return;
  if (path === "/api/state")
    return json(
      response,
      await serial(() => state(directory, publicWorkspace)),
    );
  const projectionRoute =
    /^\/api\/reprojection\/(front|back|left|right|top)$/.exec(path);
  if (projectionRoute) {
    const paths = await viewPathsFromDirectory(directory),
      transforms = await loadTransforms(directory),
      sourceId = await inputIdentity(paths, transforms),
      saved = await loadReconstruction(directory, sourceId),
      id = projectionRoute[1] as ViewId,
      camera = saved.views[id].camera;
    if (!saved.meshId || !camera || url.searchParams.get("source") !== sourceId)
      return notFound(response);
    const mesh = await readInitial(directory, saved.meshId),
      size = 384;
    const pixels = renderCamera(
      mesh,
      id,
      {
        camera,
        image: IDENTITY_AFFINE,
        width: camera.width,
        height: camera.height,
      },
      size,
    ).pixels;
    const outline = new Uint8Array(pixels.length);
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        if (
          pixels[i * 4 + 3] &&
          [-1, 1, -size, size].some((d) => !pixels[(i + d) * 4 + 3])
        )
          outline.set([96, 165, 250, 255], i * 4);
      }
    const png = await sharp(Buffer.from(outline), {
      raw: { width: size, height: size, channels: 4 },
    })
      .png()
      .toBuffer();
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    });
    response.end(png);
    return;
  }
  if (
    post &&
    [
      "/api/reconstruction",
      "/api/reconstruction/reset",
      "/api/camera/fit",
      "/api/initial",
      "/api/initial/generate",
    ].includes(path)
  ) {
    const body = await readBody(request);
    return json(
      response,
      await serial(async () => {
        const paths = await viewPathsFromDirectory(directory),
          transforms = await loadTransforms(directory),
          sourceId = await inputIdentity(paths, transforms);
        let saved = await loadReconstruction(directory, sourceId);
        const expected = request.headers["x-sixview-revision"];
        if (expected && expected !== reconstructionIdentity(saved))
          throw new HttpError(
            409,
            "보정 정보가 변경됐습니다. 다시 불러온 뒤 작업을 확인하세요.",
          );
        if (path === "/api/initial" || path === "/api/initial/generate") {
          let mesh: Mesh;
          let origin: Record<string, unknown>,
            rawBytes: Uint8Array,
            format: "glb" | "obj";
          if (path === "/api/initial") {
            if (body.length < 4)
              throw new HttpError(400, "GLB 또는 OBJ 파일이 필요합니다.");
            format = body.readUInt32LE(0) === 0x46546c67 ? "glb" : "obj";
            rawBytes = new Uint8Array(body);
            mesh = clientCheck(() => parseMesh(rawBytes, format));
            origin = { kind: "import", sourceId };
          } else {
            const input = jsonObject(body) as {
              view?: string;
              sourceId?: string;
            };
            if (input.sourceId !== sourceId)
              throw new HttpError(
                409,
                "사진이 변경되었습니다. 다시 불러오세요.",
              );
            const id = isViewId(input.view ?? "")
              ? (input.view as ViewId)
              : "front";
            const file = paths[id];
            if (!file) throw new HttpError(400, "선택한 기준 사진이 없습니다.");
            const provider = resolveProvider(await aiProvider());
            const prepared = (
              await prepareViewSet(paths, transforms)
            ).views.get(id);
            if (!prepared)
              throw new HttpError(
                400,
                "기준 사진의 전경을 준비하지 못했습니다.",
              );
            const generated = await provider.generate({
              views: {
                front: {
                  bytes: new Uint8Array(prepared.png),
                  mime: "image/png",
                },
              },
            });
            rawBytes = generated.bytes;
            format = generated.format;
            mesh = parseMesh(rawBytes, format);
            origin = {
              kind: "provider",
              provider: generated.provider,
              model: generated.model,
              sourceId,
              selectedView: id,
              singlePhotoAcceptance: "unverified",
            };
          }
          mesh = center(mesh);
          const span = Math.max(
            ...mesh.bounds.max.map((v, i) => v - mesh.bounds.min[i]!),
          );
          if (
            !(span > 0) ||
            mesh.indices.length < 3 ||
            mesh.indices.length % 3 !== 0 ||
            !mesh.positions.every(Number.isFinite) ||
            mesh.indices.some((i) => i >= mesh.positions.length / 3)
          )
            throw new HttpError(
              400,
              "초기 모델의 유효한 삼각형을 확인할 수 없습니다.",
            );
          mesh = scaleMesh(mesh, [1 / span, 1 / span, 1 / span]);
          const glb = writeGlb(mesh),
            meshId = createHash("sha256").update(glb).digest("hex");
          await writeFile(join(directory, "initial.glb"), glb);
          await writeFile(
            join(directory, "initial-source." + format),
            rawBytes,
          );
          await writeFile(
            join(directory, "initial-source.json"),
            JSON.stringify(
              {
                ...origin,
                meshId,
                rawHash: createHash("sha256").update(rawBytes).digest("hex"),
                rawFile: "initial-source." + format,
                createdAt: new Date().toISOString(),
              },
              null,
              2,
            ) + "\n",
          );
          saved = { ...emptyReconstruction(sourceId, "photo"), meshId };
          await saveReconstruction(directory, saved);
        } else {
          const input = jsonObject(body);
          if (
            input["sourceId"] !== sourceId ||
            input["meshId"] !== saved.meshId
          )
            throw new HttpError(
              409,
              "사진 또는 초기 모델이 변경되었습니다. 현재 상태를 다시 불러오세요.",
            );
          const mesh = saved.meshId
            ? await readInitial(directory, saved.meshId)
            : null;
          if (path === "/api/reconstruction/reset") {
            saved = {
              ...emptyReconstruction(sourceId, saved.kind),
              meshId: saved.meshId,
            };
            await resetReconstruction(directory, saved);
          } else if (path === "/api/camera/fit") {
            if (!mesh) throw new HttpError(400, "초기 3D 모델이 필요합니다.");
            const set = await prepareViewSet(paths, transforms),
              views = { ...saved.views };
            for (const [id, v] of set.views) {
              if ((input["view"] && input["view"] !== id) || views[id].excluded)
                continue;
              const previous = views[id],
                base =
                  previous.camera ??
                  photoCamera(id, v.source.width, v.source.height);
              const fit = fitCamera(
                mesh,
                id,
                {
                  camera: base,
                  image: v.rawToPrepared,
                  width: v.prepared.width,
                  height: v.prepared.height,
                },
                v.silhouette,
                previous.landmarks,
                previous.locked,
              );
              views[id] = {
                ...previous,
                camera: fit.camera,
                confidence: fit.confidence,
                status: fit.status,
                reason: `${fit.reason} 외곽 ${(fit.iou * 100).toFixed(1)}%${fit.landmarkError === null ? "" : ` · 기준점 잔차 ${fit.landmarkError.toFixed(1)} px`}`,
                iou: fit.iou,
              };
            }
            saved = { ...saved, views };
          } else {
            if (input["kind"] !== undefined) {
              if (!["reference", "photo"].includes(String(input["kind"])))
                throw new HttpError(400, "입력 종류를 확인하세요.");
              saved = {
                ...saved,
                kind: input["kind"] as ReconstructionState["kind"],
              };
            }
            if (input["view"] !== undefined) {
              if (!isViewId(String(input["view"])))
                throw new HttpError(400, "사진 이름을 확인하세요.");
              const id = input["view"] as ViewId,
                old = saved.views[id],
                patch = input["record"] as Partial<typeof old>;
              if (!patch || typeof patch !== "object")
                throw new HttpError(400, "사진 보정값이 필요합니다.");
              const changed =
                patch.camera !== undefined || patch.landmarks !== undefined;
              const record = {
                ...old,
                ...patch,
                ...(changed
                  ? {
                      confidence: 0,
                      status: "input-review" as const,
                      iou: null,
                      reason:
                        "수동 입력이 변경됐습니다. 정렬 검증을 다시 실행하세요.",
                    }
                  : {
                      confidence: old.confidence,
                      status: old.status,
                      iou: old.iou,
                      reason: old.reason,
                    }),
              };
              clientCheck(() =>
                validateReconstruction({
                  ...saved,
                  views: { ...saved.views, [id]: record },
                }),
              );
              for (const l of record.landmarks) {
                if (!mesh)
                  throw new HttpError(
                    400,
                    "기준점을 연결할 초기 모델이 없습니다.",
                  );
                clientCheck(() => surfaceAnchor(mesh, l.world));
              }
              saved = { ...saved, views: { ...saved.views, [id]: record } };
            }
            if (input["protection"] !== undefined) {
              const candidate = clientCheck(() =>
                validateReconstruction({
                  ...saved,
                  protection: input["protection"],
                }),
              );
              const original = candidate.protection;
              const protection = {
                ...original,
                direction: original.direction
                  ? (original.direction.map(
                      (v) => v / Math.hypot(...original.direction!),
                    ) as unknown as NonNullable<typeof original.direction>)
                  : null,
              };
              if (protection.confirmed) {
                if (!mesh) throw new HttpError(400, "초기 모델이 없습니다.");
                const check = checkProtection(mesh, protection);
                if (!check.ok) throw new HttpError(400, check.reason);
              }
              saved = { ...candidate, protection };
            }
            if (input["measurements"] !== undefined) {
              saved = clientCheck(() =>
                validateReconstruction({
                  ...saved,
                  measurements: input["measurements"],
                }),
              );
              if (saved.measurements.length && !mesh)
                throw new HttpError(400, "치수를 연결할 초기 모델이 없습니다.");
              if (mesh)
                for (const m of saved.measurements) {
                  clientCheck(() => surfaceAnchor(mesh, m.a));
                  clientCheck(() => surfaceAnchor(mesh, m.b));
                }
            }
          }
          if (path !== "/api/reconstruction/reset")
            await saveReconstruction(directory, validateReconstruction(saved));
        }
        await rm(join(directory, RESULT_FILE), { force: true });
        await rm(join(directory, "model-manifest.json"), { force: true });
        return state(directory, publicWorkspace);
      }),
    );
  }
  const mutation = /^\/api\/(upload|clear|transform)\/([a-z]+)$/.exec(path);
  if (mutation && post) {
    const [, action, id = ""] = mutation;
    if (!isViewId(id)) return text(response, 400, "알 수 없는 뷰 이름입니다.");
    const body = await readBody(request);
    return json(
      response,
      await serial(async () => {
        await checkRevision(request, directory);
        if (action === "upload") await upload(directory, id, body);
        else if (action === "clear") await clearView(directory, id);
        else await transform(directory, id, body);
        await rm(join(directory, RESULT_FILE), { force: true });
        await rm(join(directory, "model-manifest.json"), { force: true });
        return state(directory, publicWorkspace);
      }),
    );
  }
  if (path === "/api/swap" && post) {
    const a = url.searchParams.get("a") ?? "";
    const b = url.searchParams.get("b") ?? "";
    if (!isViewId(a) || !isViewId(b) || a === b)
      return text(response, 400, "서로 다른 두 뷰 이름이 필요합니다.");
    return json(
      response,
      await serial(async () => {
        await checkRevision(request, directory);
        await swapViews(directory, a, b);
        await rm(join(directory, "model-manifest.json"), { force: true });
        await rm(join(directory, RESULT_FILE), { force: true });
        return state(directory, publicWorkspace);
      }),
    );
  }
  if (path === "/api/generate" && post) {
    const options = parseJson(await readBody(request));
    return json(
      response,
      await serial(async () => {
        await checkRevision(request, directory);
        return generate(directory, options, publicWorkspace);
      }),
    );
  }
  const raw = /^\/views\/([a-z]+)\/raw$/.exec(path);
  if (raw) {
    const id = raw[1] ?? "";
    const file = isViewId(id)
      ? (await viewPathsFromDirectory(directory))[id]
      : undefined;
    return file
      ? sendFile(
          response,
          file,
          CONTENT_TYPES[extname(file).toLowerCase()] ??
            "application/octet-stream",
        )
      : notFound(response);
  }
  const derived = /^\/(prepared|outline|result|conflict)\/([a-z]+)$/.exec(path);
  if (derived) {
    const [, kind, id = ""] = derived;
    if (!isViewId(id)) return notFound(response);
    if (kind === "result" || kind === "conflict") {
      const manifest = await readCurrentManifest(directory);
      if (
        !manifest ||
        (url.searchParams.has("id") &&
          url.searchParams.get("id") !== manifest["meshId"])
      )
        return notFound(response);
    }
    const file =
      kind === "prepared"
        ? join(directory, "prepared", `${id}.png`)
        : kind === "outline"
          ? join(directory, "prepared", `${id}.outline.png`)
          : kind === "conflict"
            ? join(directory, "result", `${id}.conflict.png`)
            : join(directory, "result", `${id}.png`);
    return sendFile(response, file, "image/png");
  }
  const download = {
    "/model.glb": "model/gltf-binary",
    "/voxels.glb": "model/gltf-binary",
    "/ai-raw.glb": "model/gltf-binary",
    "/model.obj": "model/obj",
  }[path];
  if (download) {
    const manifest = await readCurrentManifest(directory);
    if (
      !manifest ||
      (url.searchParams.has("id") &&
        url.searchParams.get("id") !== manifest["meshId"]) ||
      (path === "/voxels.glb" && manifest["voxel"] === false) ||
      (path === "/ai-raw.glb" && !manifest["generated"])
    )
      return notFound(response);
    return sendFile(
      response,
      join(directory, path.slice(1)),
      download,
      path.slice(1),
    );
  }
  notFound(response);
}
async function upload(
  directory: string,
  id: ViewId,
  body: Buffer,
): Promise<void> {
  if (body.length === 0) throw new HttpError(400, "빈 파일입니다.");
  let png: Buffer;
  try {
    // Normalised to PNG so the slots stay one predictable format; alpha survives.
    png = await sharp(body).autoOrient().png().toBuffer();
  } catch {
    throw new HttpError(400, "이미지로 읽을 수 없는 파일입니다.");
  }
  await clearView(directory, id);
  await writeFile(join(directory, `${id}.png`), png);
  // A new image starts from the identity transform.
  const transforms = await loadTransforms(directory);
  await saveTransforms(directory, {
    ...transforms,
    [id]: updateTransform(transforms[id], {
      rotation: 0,
      flip: false,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
    }),
  });
}
async function clearView(directory: string, id: ViewId): Promise<void> {
  for (const extension of [".png", ".jpg", ".jpeg", ".webp"])
    await rm(join(directory, `${id}${extension}`), { force: true });
  await rm(join(directory, "prepared", `${id}.png`), { force: true });
  await rm(join(directory, "prepared", `${id}.outline.png`), { force: true });
}
async function transform(
  directory: string,
  id: ViewId,
  body: Buffer,
): Promise<void> {
  const transforms = await loadTransforms(directory);
  await saveTransforms(directory, {
    ...transforms,
    [id]: updateTransform(transforms[id], parseJson(body)),
  });
}
/** Exchanges two slots: their uploads and their stored corrections move together. */
async function swapViews(
  directory: string,
  a: ViewId,
  b: ViewId,
): Promise<void> {
  const paths = await viewPathsFromDirectory(directory);
  const staged = join(directory, `.swap-${a}`);
  const pathA = paths[a];
  const pathB = paths[b];
  if (pathA) await rename(pathA, staged);
  if (pathB) await rename(pathB, join(directory, `${a}${extname(pathB)}`));
  if (pathA) await rename(staged, join(directory, `${b}${extname(pathA)}`));
  const transforms = await loadTransforms(directory);
  await saveTransforms(directory, {
    ...transforms,
    [a]: transforms[b],
    [b]: transforms[a],
  });
}
async function generate(
  directory: string,
  body: unknown,
  publicWorkspace = false,
): Promise<unknown> {
  const options =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  for (const key of ["resolution", "smoothing", "rounding"])
    if (
      options[key] !== undefined &&
      (typeof options[key] !== "number" || !Number.isFinite(options[key]))
    )
      throw new HttpError(400, `${key} 값은 유한한 숫자여야 합니다.`);
  const resolution =
    typeof options["resolution"] === "number"
      ? Math.min(384, Math.max(32, Math.round(options["resolution"])))
      : undefined;
  const smoothing =
    typeof options["smoothing"] === "number"
      ? Math.min(30, Math.max(0, Math.round(options["smoothing"])))
      : undefined;
  const paths = await viewPathsFromDirectory(directory);
  const transforms = await loadTransforms(directory),
    sourceId = await inputIdentity(paths, transforms),
    reconstruction = await loadReconstruction(directory, sourceId);
  const missing = VIEW_IDS.filter((id) => VIEWS[id].required && !paths[id]);
  if (missing.length > 0)
    throw new HttpError(400, `필수 뷰가 없습니다: ${missing.join(", ")}`);
  await rm(join(directory, "model-manifest.json"), { force: true });
  const result = await reconstructFromViews(paths, transforms, {
    reconstruction,
    ...(reconstruction.kind === "photo" && reconstruction.meshId
      ? { initialMesh: await readInitial(directory, reconstruction.meshId) }
      : {}),
    outputDirectory: directory,
    method: options["method"] === "ai" ? "ai" : "silhouette",
    ...(resolution === undefined ? {} : { resolution }),
    ...(smoothing === undefined ? {} : { smoothing }),
    symmetry: options["symmetry"] === true,
    rounding:
      typeof options["rounding"] === "number"
        ? Math.min(1, Math.max(0, options["rounding"]))
        : 0,
    onProgress: (message) => process.stdout.write(`· ${message}\n`),
  });
  if (result.method !== "ai")
    await rm(join(directory, "ai-raw.glb"), { force: true });
  const stored: StoredResult = {
    sourceId: result.sourceId ?? sourceId,
    meshId: result.meshId ?? "",
    outcome: result.outcome ?? "reference",
    reason: result.reason ?? result.warning ?? "",
    measurement: result.measurement,
    triangles: result.mesh.indices.length / 3,
    resolution: result.resolution,
    method: result.method,
    ...(result.warning ? { warning: result.warning } : {}),
    score: result.score,
    colourScore: result.colourScore,
    comparisons: result.comparisons,
    ...(result.generated
      ? {
          generated: {
            score: result.generated.score,
            colourScore: result.generated.colourScore,
            yaw: result.generated.yaw,
          },
        }
      : {}),
  };
  await writeFile(
    join(directory, RESULT_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
    "utf8",
  );
  return state(directory, publicWorkspace);
}
/** The whole page state: views (prepared on the fly), validation, and the last build. */
async function state(
  directory: string,
  publicWorkspace = false,
): Promise<unknown> {
  const paths = await viewPathsFromDirectory(directory);
  const transforms = await loadTransforms(directory);
  const set = await prepareViewSet(paths, transforms);
  const sourceId = await inputIdentity(paths, transforms),
    reconstruction = await loadReconstruction(directory, sourceId);
  await writePrepared(set, directory);
  const validation: ViewSetReport =
    reconstruction.kind === "photo"
      ? {
          score: 0,
          verdict: "review",
          checks: [],
          issues: [
            {
              severity: "info",
              views: [],
              message:
                "사진 모드에서는 반대면 거울상 검사를 적용하지 않습니다. 초기 모델과 사진별 재투영으로 정렬을 확인하세요.",
            },
          ],
          axes: [],
          proportions: { x: 1, y: 1, z: 1 },
          views: [],
          missing: set.missing,
        }
      : validate(set);
  const stamp = Date.now();
  const views = VIEW_IDS.map((id) => {
    const view = set.views.get(id);
    const box = view?.silhouette.bbox ?? null;
    const size = view?.silhouette.width ?? 1;
    return {
      id,
      label: VIEWS[id].label,
      required: VIEWS[id].required,
      axes: imageAxes(id),
      hasImage: view !== undefined,
      rawUrl: view ? `/views/${id}/raw?t=${stamp}` : null,
      preparedUrl: view ? `/prepared/${id}?t=${stamp}` : null,
      outlineUrl: view ? `/outline/${id}?t=${stamp}` : null,
      transform: transforms[id] satisfies ViewTransform,
      source: view?.source ?? null,
      rawToPrepared: view?.rawToPrepared ?? null,
      bbox: box
        ? {
            x0: box.x0 / size,
            y0: box.y0 / size,
            x1: box.x1 / size,
            y1: box.y1 / size,
          }
        : null,
    };
  });
  const blockers = set.missing
    .filter((id) => VIEWS[id].required)
    .map((id) =>
      id === "top"
        ? "top 뷰가 없습니다. 윗면이 없으면 길이·폭·윗면 형상을 제한할 수 없어 생성을 막습니다."
        : `${id} 뷰가 없습니다.`,
    );
  let result: unknown = null;
  try {
    const stored = JSON.parse(
      await readFile(join(directory, RESULT_FILE), "utf8"),
    ) as StoredResult;
    if (stored.sourceId !== sourceId) throw new Error("stale input");
    const manifest = await readCurrentManifest(directory);
    if (
      !manifest ||
      manifest["meshId"] !== stored.meshId ||
      manifest["sourceId"] !== sourceId
    )
      throw new Error("stale manifest");
    await stat(join(directory, "model.glb"));
    // Results saved before colour agreement existed are rebuilt rather than shown half-empty.
    if (typeof stored.colourScore !== "number") throw new Error("stale result");
    result = {
      glbUrl: `/model.glb?id=${stored.meshId}`,
      objUrl: `/model.obj?id=${stored.meshId}`,
      voxelUrl: `/voxels.glb?id=${stored.meshId}`,
      triangles: stored.triangles,
      resolution: stored.resolution,
      method: stored.method ?? "silhouette",
      outcome: stored.outcome ?? "reference",
      reason: stored.reason ?? stored.warning ?? "",
      meshId: stored.meshId,
      measurement: stored.measurement,
      warning: stored.warning ?? null,
      generated: stored.generated
        ? { ...stored.generated, glbUrl: `/ai-raw.glb?t=${stamp}` }
        : null,
      score: stored.score,
      colourScore: stored.colourScore,
      comparisons: stored.comparisons.map((c) => ({
        id: c.id,
        iou: c.iou,
        colour: c.colour,
        colourUsed:
          reconstruction.kind === "reference" ||
          (!reconstruction.views[c.id].excluded &&
            reconstruction.views[c.id].confidence >= 0.65),
        originalUrl: `/prepared/${c.id}?t=${stamp}`,
        renderUrl: `/result/${c.id}?id=${stored.meshId}`,
        conflictUrl: `/conflict/${c.id}?id=${stored.meshId}`,
      })),
    };
  } catch {
    // No build since the inputs last changed.
  }
  return {
    directory: publicWorkspace ? "이 브라우저 전용 작업 공간" : directory,
    revision: reconstructionIdentity(reconstruction),
    reconstruction,
    initialUrl: reconstruction.meshId
      ? `/api/cad/asset/initial?id=${reconstruction.meshId}`
      : null,
    views,
    validation: {
      score: validation.score,
      verdict: validation.verdict,
      checks: validation.checks.map((c) => ({
        id: c.id,
        label: c.label,
        score: c.score,
        detail: c.detail,
      })),
      issues: validation.issues,
    },
    canGenerate:
      blockers.length === 0 &&
      (reconstruction.kind === "reference" || !!reconstruction.meshId),
    blockers: [
      ...blockers,
      ...(reconstruction.kind === "photo" && !reconstruction.meshId
        ? ["초기 모델을 가져오거나 기준 사진에서 생성하세요."]
        : []),
    ],
    result,
  };
}
export function photoCamera(id: ViewId, width: number, height: number): Camera {
  return defaultPhotoCamera(id, width, height);
}
async function readInitial(directory: string, meshId: string): Promise<Mesh> {
  const file = join(directory, "initial.glb"),
    bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== meshId)
    throw new HttpError(
      409,
      "초기 모델 파일이 변경되었습니다. 다시 가져오세요.",
    );
  return loadMesh(file);
}
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function checkRevision(
  request: IncomingMessage,
  directory: string,
): Promise<void> {
  const expected = request.headers["x-sixview-revision"];
  if (!expected) return;
  const sourceId = await inputIdentity(
    await viewPathsFromDirectory(directory),
    await loadTransforms(directory),
  );
  if (
    expected !==
    reconstructionIdentity(await loadReconstruction(directory, sourceId))
  )
    throw new HttpError(
      409,
      "입력 또는 보정 정보가 변경됐습니다. 다시 불러온 뒤 작업을 확인하세요.",
    );
}
function parseJson(body: Buffer): unknown {
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON 본문을 읽을 수 없습니다.");
  }
}
function jsonObject(body: Buffer): Record<string, unknown> {
  const value = parseJson(body);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "JSON 객체가 필요합니다.");
  return value as Record<string, unknown>;
}
function clientCheck<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : String(error),
    );
  }
}
function json(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}
function text(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
function notFound(response: ServerResponse): void {
  text(response, 404, "없음");
}
async function sendFile(
  response: ServerResponse,
  file: string,
  type: string,
  download?: string,
): Promise<void> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return notFound(response);
  }
  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...(download
      ? { "Content-Disposition": `attachment; filename="${download}"` }
      : {}),
  });
  response.end(bytes);
}
/** Collects a raw request body; uploads post the file bytes directly. */
async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
