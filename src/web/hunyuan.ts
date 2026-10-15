import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  GradioSpace,
  asGradioFile,
  newSessionHash,
} from "../generate/gradio.ts";
import { downloadMesh } from "../generate/provider.ts";
import { localAiAvailable, localAiUrl } from "../generate/local.ts";

const VIEWS = ["front", "back", "left", "right"] as const;
type Views = Partial<Record<(typeof VIEWS)[number], Uint8Array>>;
export interface DirectInput {
  views: Views;
  steps: number;
  guidance: number;
  seed: number;
  resolution: number;
  chunks: number;
  removeBackground: boolean;
  randomizeSeed: boolean;
}
export interface DirectResult {
  bytes: Uint8Array;
  seed: unknown;
  stats: unknown;
}
export type DirectGenerator = (
  input: DirectInput,
  progress: (message: string) => void,
  signal: AbortSignal,
) => Promise<DirectResult>;

/** Official UI slot order, without axis fitting, carving, recolouring or fallback. */
export const generateDirect: DirectGenerator = async (
  input,
  progress,
  signal,
) => {
  if (await localAiAvailable()) {
    progress("이 PC의 GPU에서 Hunyuan3D-2mv 생성 중…");
    const response = await fetch(`${localAiUrl()}/generate`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        views: Object.fromEntries(
          VIEWS.filter((id) => input.views[id]).map((id) => [
            id,
            Buffer.from(input.views[id]!).toString("base64"),
          ]),
        ),
        seed: input.seed,
        steps: input.steps,
        guidance: input.guidance,
        octree: input.resolution,
        chunks: input.chunks,
        removeBackground: input.removeBackground,
        randomizeSeed: input.randomizeSeed,
      }),
    });
    if (!response.ok)
      throw new Error(
        `로컬 Hunyuan 생성 실패 (${response.status}): ${await response.text()}`,
      );
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      seed: response.headers.get("x-hunyuan-seed"),
      stats: {
        engine: "local",
        model: "tencent/Hunyuan3D-2mv",
        faces: response.headers.get("x-hunyuan-faces"),
      },
    };
  }
  const space = new GradioSpace("https://tencent-hunyuan3d-2mv.hf.space", {
    signal,
    onProgress: progress,
    timeoutSeconds: 300,
  });
  progress("공식 Space에 이미지 업로드 중…");
  const files = await Promise.all(
    VIEWS.map((id) =>
      input.views[id]
        ? space.upload(input.views[id]!, `${id}.png`, "image/png")
        : null,
    ),
  );
  const output = await space.call(
    "shape_generation",
    [
      null,
      null,
      ...files,
      input.steps,
      input.guidance,
      input.seed,
      input.resolution,
      input.removeBackground,
      input.chunks,
      input.randomizeSeed,
    ],
    newSessionHash(),
  );
  const file = asGradioFile(output[0]);
  if (!file) throw new Error("공식 Space가 GLB 파일을 반환하지 않았습니다.");
  progress("생성된 원본 GLB 다운로드 중…");
  return {
    bytes: await downloadMesh(space.fileUrl(file), signal),
    seed: output[3],
    stats: output[2],
  };
};

class InputError extends Error {}
function number(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = true,
): number {
  const n = value === undefined ? fallback : value;
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new InputError(
      `설정 값은 ${min}~${max} 범위${integer ? "의 정수" : ""}여야 합니다.`,
    );
  return n;
}
async function parseInput(body: unknown): Promise<DirectInput> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new InputError("입력 객체가 필요합니다.");
  const b = body as Record<string, unknown>;
  if (!b.views || typeof b.views !== "object" || Array.isArray(b.views))
    throw new InputError("이미지를 넣어주세요.");
  const source = b.views as Record<string, unknown>;
  if (!source.front)
    throw new InputError(
      "Front 이미지를 넣어주세요. 나머지 방향은 선택입니다.",
    );
  for (const key of Object.keys(source))
    if (!VIEWS.includes(key as (typeof VIEWS)[number]))
      throw new InputError("지원하지 않는 이미지 방향입니다.");
  const views: Views = {};
  for (const id of VIEWS) {
    const value = source[id];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > 16 * 1024 * 1024)
      throw new InputError("각 이미지는 12MB 이하여야 합니다.");
    const match =
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        value,
      );
    if (!match) throw new InputError("PNG·JPEG·WebP 이미지만 지원합니다.");
    try {
      views[id] = await sharp(Buffer.from(match[1]!, "base64"), {
        limitInputPixels: 16_000_000,
      })
        .autoOrient()
        .ensureAlpha()
        .png()
        .toBuffer();
    } catch {
      throw new InputError("이미지를 읽지 못했습니다. 다른 사진을 넣어주세요.");
    }
  }
  for (const key of ["removeBackground", "randomizeSeed"])
    if (b[key] !== undefined && typeof b[key] !== "boolean")
      throw new InputError("체크 항목 값이 올바르지 않습니다.");
  return {
    views,
    steps: number(b.steps, 5, 1, 100),
    guidance: number(b.guidance, 5, 0, 30, false),
    seed: number(b.seed, 1234, 0, 10_000_000),
    resolution: number(b.resolution, 256, 16, 512),
    chunks: number(b.chunks, 8000, 1000, 5_000_000),
    removeBackground: b.removeBackground !== false,
    randomizeSeed: b.randomizeSeed !== false,
  };
}
interface Job {
  id: string;
  status: "running" | "succeeded" | "failed";
  message: string;
  seed?: unknown;
  stats?: unknown;
  download?: string;
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}
/** One job per browser workspace; long inference is polled, not held across a tunnel request. */
export function createHunyuanHandler(
  generate: DirectGenerator = generateDirect,
) {
  const jobs = new Map<string, Job>();
  let active = false;
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    directory: string,
  ): Promise<boolean> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/hunyuan/")) return false;
    if (url.pathname === "/api/hunyuan/job" && request.method === "GET") {
      json(response, 200, { job: jobs.get(directory) ?? null });
      return true;
    }
    if (url.pathname === "/api/hunyuan/result" && request.method === "GET") {
      const job = jobs.get(directory);
      if (
        !job ||
        job.status !== "succeeded" ||
        job.id !== url.searchParams.get("id")
      ) {
        json(response, 404, { error: "이 작업 공간에 생성 결과가 없습니다." });
        return true;
      }
      const bytes = await readFile(
        join(directory, "hunyuan", `${job.id}.glb`),
      ).catch(() => null);
      if (!bytes) {
        json(response, 404, {
          error: "결과 파일을 찾지 못했습니다. 다시 생성해주세요.",
        });
        return true;
      }
      response.writeHead(200, {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="hunyuan3d.glb"',
      });
      response.end(bytes);
      return true;
    }
    if (url.pathname !== "/api/hunyuan/generate" || request.method !== "POST") {
      json(response, 404, { error: "없는 경로입니다." });
      return true;
    }
    if (active) {
      json(response, 429, {
        error: "다른 생성 작업을 처리 중입니다. 잠시 후 다시 시도해주세요.",
      });
      return true;
    }
    active = true;
    let input: DirectInput;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 64 * 1024 * 1024)
          throw new InputError("전체 입력 크기가 64MB를 넘습니다.");
        chunks.push(bytes);
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new InputError("입력 데이터를 읽을 수 없습니다.");
      }
      input = await parseInput(body);
    } catch (error) {
      active = false;
      json(response, error instanceof InputError ? 400 : 500, {
        error: error instanceof Error ? error.message : "입력 오류",
      });
      return true;
    }
    const job: Job = {
      id: randomUUID(),
      status: "running",
      message: "Hunyuan3D-2mv 생성 요청 중…",
    };
    jobs.set(directory, job);
    json(response, 202, { job });
    void (async () => {
      try {
        const output = await generate(
          input,
          (message) => {
            job.message = message;
          },
          AbortSignal.timeout(300_000),
        );
        if (
          output.bytes.length < 12 ||
          Buffer.from(output.bytes.subarray(0, 4)).toString() !== "glTF"
        )
          throw new Error("공식 Space에서 유효한 GLB를 받지 못했습니다.");
        const target = join(directory, "hunyuan");
        await mkdir(target, { recursive: true });
        await writeFile(join(target, `${job.id}.glb`), output.bytes);
        Object.assign(job, {
          status: "succeeded",
          message: "Hunyuan3D-2mv 형상 생성 완료",
          seed: output.seed,
          stats: output.stats,
          download: `/api/hunyuan/result?id=${job.id}`,
        });
      } catch (error) {
        job.status = "failed";
        job.message =
          error instanceof Error ? error.message : "AI 생성에 실패했습니다.";
      } finally {
        active = false;
      }
    })();
    return true;
  };
}
