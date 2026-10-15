import type { GenerateOptions, State, ViewId, ViewTransform } from "./types";
/**
 * Typed wrappers for the sixview server. Every call resolves to the new
 * `State`; non-2xx responses carry a plain-text Korean message, which becomes
 * the thrown `Error`'s message.
 */
let lastRevision: string | null = null,
  requestSequence = 0,
  revisionSequence = 0;
async function request(path: string, init?: RequestInit): Promise<State> {
  const sequence = ++requestSequence,
    headers = new Headers(init?.headers);
  if (init?.method === "POST" && lastRevision)
    headers.set("X-Sixview-Revision", lastRevision);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    throw new Error(
      `서버에 연결할 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).trim();
    throw new Error(text || `요청 실패 (${res.status} ${res.statusText})`);
  }
  const value = (await res.json()) as State;
  if (
    !value ||
    typeof value.revision !== "string" ||
    !Array.isArray(value.views) ||
    !value.reconstruction ||
    value.reconstruction.version !== 2 ||
    !["reference", "photo"].includes(value.reconstruction.kind)
  )
    throw new Error(
      "서버 보정 상태 형식을 확인할 수 없습니다. 다시 불러오세요.",
    );
  if (
    value.result &&
    (!["reference", "accepted", "initial-only", "rollback"].includes(
      value.result.outcome,
    ) ||
      typeof value.result.meshId !== "string" ||
      typeof value.result.reason !== "string")
  )
    throw new Error("결과의 실제 상태를 확인할 수 없습니다.");
  if (sequence > revisionSequence) {
    revisionSequence = sequence;
    lastRevision = value.revision;
  }
  return value;
}
function postJson(path: string, body: unknown): Promise<State> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export function getState(): Promise<State> {
  return request("/api/state", { cache: "no-store" });
}
export function uploadView(id: ViewId, file: Blob): Promise<State> {
  return request(`/api/upload/${id}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}
export function clearView(id: ViewId): Promise<State> {
  return request(`/api/clear/${id}`, { method: "POST" });
}
export function setTransform(
  id: ViewId,
  patch: Partial<ViewTransform>,
): Promise<State> {
  return postJson(`/api/transform/${id}`, patch);
}
/** Exchanges two slots' images and corrections (e.g. side views named after the character's own side). */
export function swapViews(a: ViewId, b: ViewId): Promise<State> {
  return request(`/api/swap?a=${a}&b=${b}`, { method: "POST" });
}
export function generate(options: GenerateOptions): Promise<State> {
  return postJson("/api/generate", options);
}
export function updateReconstruction(
  sourceId: string,
  meshId: string | null,
  patch: Record<string, unknown>,
): Promise<State> {
  return postJson("/api/reconstruction", { ...patch, sourceId, meshId });
}
export function fitCameras(
  sourceId: string,
  meshId: string | null,
  view?: ViewId,
): Promise<State> {
  return postJson("/api/camera/fit", {
    sourceId,
    meshId,
    ...(view ? { view } : {}),
  });
}
export function importInitial(file: Blob): Promise<State> {
  return request("/api/initial", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
}
export function generateInitial(
  sourceId: string,
  view: ViewId,
): Promise<State> {
  return postJson("/api/initial/generate", { sourceId, view });
}
export function resetReconstruction(
  sourceId: string,
  meshId: string | null,
): Promise<State> {
  return postJson("/api/reconstruction/reset", { sourceId, meshId });
}
export const FULL_RESET: ViewTransform = {
  rotation: 0,
  flip: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  crop: { left: 0, top: 0, right: 0, bottom: 0 },
};
