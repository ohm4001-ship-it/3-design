import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { VIEW_IDS, type ViewId } from "./views.ts";
import { validateCamera, type Camera, type Landmark } from "./render/camera.ts";
import { EMPTY_PROTECTION, type Protection } from "./reconstruct/protection.ts";
import { measurementScale, type Measurement } from "./mesh/measurements.ts";
/**
 * Per-view correction the user applies before reconstruction. It is stored, not
 * baked into the upload: the original file stays untouched and every stage —
 * masking, alignment, carving, colouring — reads the image through this
 * transform, so changing it never compounds resampling loss.
 *
 * Order of application: rotate (clockwise) -> horizontal flip -> crop -> mask ->
 * automatic alignment (centre + common scale) -> user scale -> user offset.
 */
export interface ViewTransform {
  /** Clockwise quarter turns applied to the raw image, in degrees. */
  readonly rotation: 0 | 90 | 180 | 270;
  /** Mirror left-right after rotating. */
  readonly flip: boolean;
  /** Multiplier on the automatically solved scale, 0.5..2. */
  readonly scale: number;
  /** Shift on the prepared canvas, fractions of its size; +x right, +y down. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Fractions trimmed from each edge of the rotated image, 0..0.45. */
  readonly crop: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}
export const IDENTITY_TRANSFORM: ViewTransform = {
  rotation: 0,
  flip: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  crop: { left: 0, top: 0, right: 0, bottom: 0 },
};
export type ViewTransforms = Readonly<Partial<Record<ViewId, ViewTransform>>>;
const STATE_FILE = "views.json";
/** Merges a partial update into `base`, clamping every field into its legal range. */
export function updateTransform(
  base: ViewTransform,
  patch: unknown,
): ViewTransform {
  const input =
    typeof patch === "object" && patch !== null
      ? (patch as Record<string, unknown>)
      : {};
  const number = (
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    const value = input[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  };
  const rotationInput = input["rotation"];
  const rotation =
    typeof rotationInput === "number" && Number.isFinite(rotationInput)
      ? (((((Math.round(rotationInput / 90) * 90) % 360) + 360) %
          360) as ViewTransform["rotation"])
      : base.rotation;
  const cropInput =
    typeof input["crop"] === "object" && input["crop"] !== null
      ? (input["crop"] as Record<string, unknown>)
      : {};
  const edge = (key: keyof ViewTransform["crop"]): number => {
    const value = cropInput[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(0.45, Math.max(0, value))
      : base.crop[key];
  };
  return {
    rotation,
    flip: typeof input["flip"] === "boolean" ? input["flip"] : base.flip,
    scale: number("scale", base.scale, 0.5, 2),
    offsetX: number("offsetX", base.offsetX, -0.25, 0.25),
    offsetY: number("offsetY", base.offsetY, -0.25, 0.25),
    crop: {
      left: edge("left"),
      top: edge("top"),
      right: edge("right"),
      bottom: edge("bottom"),
    },
  };
}
/** Reads `views.json` from a view directory; absent or malformed entries fall back to identity. */
export async function loadTransforms(
  directory: string,
): Promise<Record<ViewId, ViewTransform>> {
  let stored: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(
      await readFile(join(directory, STATE_FILE), "utf8"),
    );
    if (value && typeof value === "object" && !Array.isArray(value))
      stored = value as Record<string, unknown>;
  } catch {
    // No saved corrections yet.
  }
  return Object.fromEntries(
    VIEW_IDS.map((id) => [id, updateTransform(IDENTITY_TRANSFORM, stored[id])]),
  ) as Record<ViewId, ViewTransform>;
}
export async function saveTransforms(
  directory: string,
  transforms: Readonly<Record<ViewId, ViewTransform>>,
): Promise<void> {
  const stored = await storedState(directory);
  await writeState(directory, { ...stored, ...transforms });
}
export interface CameraRecord {
  readonly camera: Camera | null;
  readonly landmarks: readonly Landmark[];
  readonly locked: boolean;
  readonly excluded: boolean;
  readonly confidence: number;
  readonly status: "aligned" | "landmarks-needed" | "input-review";
  readonly reason: string;
  readonly iou: number | null;
}
export interface ReconstructionState {
  readonly version: 2;
  readonly kind: "reference" | "photo";
  readonly sourceId: string;
  readonly meshId: string | null;
  readonly views: Readonly<Record<ViewId, CameraRecord>>;
  readonly protection: Protection;
  readonly measurements: readonly Measurement[];
  readonly warning: string | null;
}
export const blankCamera = (): CameraRecord => ({
  camera: null,
  landmarks: [],
  locked: false,
  excluded: false,
  confidence: 0,
  status: "input-review",
  reason: "카메라를 정렬하세요.",
  iou: null,
});
export function emptyReconstruction(
  sourceId: string,
  kind: ReconstructionState["kind"] = "reference",
): ReconstructionState {
  return {
    version: 2,
    kind,
    sourceId,
    meshId: null,
    views: Object.fromEntries(
      VIEW_IDS.map((id) => [id, blankCamera()]),
    ) as Record<ViewId, CameraRecord>,
    protection: EMPTY_PROTECTION,
    measurements: [],
    warning: null,
  };
}
async function storedState(
  directory: string,
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(
      await readFile(join(directory, STATE_FILE), "utf8"),
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(
      "저장된 views.json을 읽을 수 없습니다. 입력 상태를 확인하세요.",
    );
  }
}
async function writeState(directory: string, value: unknown): Promise<void> {
  const temp = join(directory, STATE_FILE + ".tmp");
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(temp, join(directory, STATE_FILE));
}
export async function inputIdentity(
  paths: Readonly<Partial<Record<ViewId, string>>>,
  transforms: ViewTransforms,
): Promise<string> {
  const hash = createHash("sha256");
  for (const id of VIEW_IDS) {
    hash.update(id);
    hash.update(JSON.stringify(transforms[id] ?? IDENTITY_TRANSFORM));
    if (paths[id]) hash.update(await readFile(paths[id]!));
  }
  return hash.digest("hex");
}
/** Bind exported geometry to calibration, anatomy and measurements as well as photos. */
export function reconstructionIdentity(state: ReconstructionState): string {
  const record = {
    version: state.version,
    kind: state.kind,
    sourceId: state.sourceId,
    meshId: state.meshId,
    views: VIEW_IDS.map((id) => state.views[id]),
    protection: state.protection,
    measurements: state.measurements,
  };
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
export function validateReconstruction(value: unknown): ReconstructionState {
  if (!value || typeof value !== "object")
    throw new Error("보정 상태가 없습니다.");
  const s = value as ReconstructionState;
  if (
    s.version !== 2 ||
    !["reference", "photo"].includes(s.kind) ||
    typeof s.sourceId !== "string" ||
    !(s.meshId === null || typeof s.meshId === "string") ||
    !s.views ||
    !s.protection ||
    !Array.isArray(s.measurements)
  )
    throw new Error("보정 상태 형식이 유효하지 않습니다.");
  for (const id of VIEW_IDS) {
    const c = s.views[id];
    if (
      !c ||
      typeof c.locked !== "boolean" ||
      typeof c.excluded !== "boolean" ||
      !Number.isFinite(c.confidence) ||
      c.confidence < 0 ||
      c.confidence > 1 ||
      !Array.isArray(c.landmarks) ||
      c.landmarks.length > 64 ||
      !["aligned", "landmarks-needed", "input-review"].includes(c.status)
    )
      throw new Error(`${id} 카메라 상태가 유효하지 않습니다.`);
    if (c.camera) validateCamera(c.camera);
    if (!c.camera && (c.confidence > 0 || c.status === "aligned"))
      throw new Error("카메라가 없는 상태를 정렬 완료로 저장할 수 없습니다.");
    for (const l of c.landmarks)
      if (
        !l ||
        !l.id ||
        !Array.isArray(l.image) ||
        l.image.length !== 2 ||
        !Array.isArray(l.world) ||
        l.world.length !== 3 ||
        ![...l.image, ...l.world].every(Number.isFinite) ||
        (c.camera &&
          (l.image[0] < 0 ||
            l.image[1] < 0 ||
            l.image[0] > c.camera.width ||
            l.image[1] > c.camera.height))
      )
        throw new Error("기준점이 유효하지 않습니다.");
    if (new Set(c.landmarks.map((l) => l.id)).size !== c.landmarks.length)
      throw new Error("기준점 번호가 중복됐습니다.");
  }
  const p = s.protection;
  if (
    !["required", "none"].includes(p.mode) ||
    typeof p.confirmed !== "boolean" ||
    typeof p.hole !== "boolean" ||
    !Array.isArray(p.regions) ||
    p.regions.length !== 2 ||
    !Array.isArray(p.path) ||
    !Array.isArray(p.boundary)
  )
    throw new Error("보호 상태가 유효하지 않습니다.");
  for (const points of [...p.regions, p.path, p.boundary]) {
    if (!Array.isArray(points) || points.length > 1024)
      throw new Error("보호 영역의 점 수를 확인하세요.");
    for (const v of points)
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite))
        throw new Error("보호 위치가 유효하지 않습니다.");
  }
  if (
    p.direction !== null &&
    (!Array.isArray(p.direction) ||
      p.direction.length !== 3 ||
      !p.direction.every(Number.isFinite) ||
      Math.hypot(...p.direction) < 1e-9)
  )
    throw new Error("관통 방향이 유효하지 않습니다.");
  if (s.measurements.length > 32) throw new Error("치수는 최대 32개입니다.");
  measurementScale(s.measurements);
  return s;
}
export async function loadReconstruction(
  directory: string,
  sourceId: string,
): Promise<ReconstructionState> {
  let stored: Record<string, unknown>;
  try {
    stored = await storedState(directory);
  } catch (error) {
    return {
      ...emptyReconstruction(sourceId, "photo"),
      warning: error instanceof Error ? error.message : String(error),
    };
  }
  const value = stored["_reconstruction"];
  if (value === undefined) return emptyReconstruction(sourceId);
  try {
    const state = validateReconstruction(value);
    if (state.sourceId === sourceId) return state;
    return {
      ...emptyReconstruction(sourceId, state.kind),
      meshId: state.meshId,
      warning:
        "사진이나 이미지 변환이 변경되어 정렬·기준점·보호·치수를 해제했습니다. 초기 모델을 확인하고 다시 지정하세요.",
    };
  } catch (e) {
    return {
      ...emptyReconstruction(sourceId, "photo"),
      warning: `저장된 보정 정보를 사용할 수 없습니다: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
export async function saveReconstruction(
  directory: string,
  state: ReconstructionState,
): Promise<void> {
  const stored = await storedState(directory);
  await writeState(directory, {
    ...stored,
    _reconstruction: validateReconstruction(state),
  });
}
/** Explicit recovery preserves the original state file before clearing annotations. */
export async function resetReconstruction(
  directory: string,
  state: ReconstructionState,
): Promise<void> {
  const previous = await readFile(join(directory, STATE_FILE)).catch(
    () => null,
  );
  if (previous)
    await writeFile(
      join(directory, `views.backup-${Date.now()}.json`),
      previous,
    );
  await writeState(directory, {
    ...(await loadTransforms(directory)),
    _reconstruction: validateReconstruction(state),
  });
}
