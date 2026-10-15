import * as api from "./api";
import { h } from "./dom";
import {
  CHARACTER,
  renderGenerate,
  renderResult,
  renderValidation,
  type GenerateForm,
} from "./panel";
import { renderSlot } from "./slots";
import type { State, ViewId } from "./types";
import "./studio.css";
import {
  mountModelViewer,
  type ModelViewer,
  type OverlayGroup,
} from "../viewer/model-viewer";
import {
  defaultPhotoCamera,
  angleRotation,
  multiplyRotation,
  type Vec3,
  type Camera,
} from "../../../src/render/camera";
import type { Protection } from "../../../src/reconstruct/protection";
import type { CameraRecord } from "../../../src/orientation";
/**
 * Upload / alignment studio. The page holds no reconstruction logic: it
 * renders whatever `GET /api/state` (or a mutation response) returns, and the
 * only local state is UI-only (busy flags, open sections, form values).
 */
const ui = {
  pending: 0,
  workspace: true,
  stamp: Date.now(),
  busy: new Set<ViewId>(),
  showRaw: new Set<ViewId>(),
  tuneOpen: new Set<ViewId>(),
  generating: false,
  loadingAll: false,
  form: { resolution: 160, smoothing: 12, ...CHARACTER } as GenerateForm,
};
let current: State | null = null;
/** Responses are applied in request order so a slow reply cannot overwrite a newer state. */
let requestSeq = 0;
let appliedSeq = 0;
const root = document.getElementById("app")!;
const toastBox = h("div", { class: "toasts", "aria-live": "polite" });
document.body.append(toastBox);
function toast(message: string, kind: "error" | "ok" | "info" = "info"): void {
  const el = h(
    "div",
    {
      class: `toast toast-${kind}`,
      ...(ui.workspace ? {} : { role: kind === "error" ? "alert" : "status" }),
    },
    h("span", {}, message),
    h(
      "button",
      {
        type: "button",
        class: "btn-icon",
        "aria-label": "닫기",
        onClick: () => el.remove(),
      },
      "✕",
    ),
  );
  toastBox.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 10000 : 4000);
}
/**
 * Runs one server call, marks `slot` busy meanwhile, and applies the returned
 * state. Errors surface as a toast; returns whether the call succeeded.
 */
async function mutate(
  call: () => Promise<State>,
  slot?: ViewId,
): Promise<boolean> {
  const seq = ++requestSeq;
  ui.pending++;
  if (slot) ui.busy.add(slot);
  render(current);
  try {
    const state = await call();
    if (seq > appliedSeq) {
      appliedSeq = seq;
      current = state;
      ui.stamp = Date.now();
    }
    return true;
  } catch (err) {
    if (ui.workspace) note(err instanceof Error ? err.message : String(err));
    toast(err instanceof Error ? err.message : String(err), "error");
    return false;
  } finally {
    ui.pending--;
    if (slot) ui.busy.delete(slot);
    render(current);
  }
}
const slotActions = {
  upload: (id: ViewId, file: File) =>
    void mutate(() => api.uploadView(id, file), id),
  clear: (id: ViewId) => void mutate(() => api.clearView(id), id),
  transform: (id: ViewId, patch: Parameters<typeof api.setTransform>[1]) =>
    void mutate(() => api.setTransform(id, patch), id),
  setShowRaw(id: ViewId, on: boolean) {
    if (on) ui.showRaw.add(id);
    else ui.showRaw.delete(id);
    render(current);
  },
  setTuneOpen(id: ViewId, open: boolean) {
    // Only bookkeeping: <details> already toggled itself, so no re-render.
    if (open) ui.tuneOpen.add(id);
    else ui.tuneOpen.delete(id);
  },
};
const panelActions = {
  updateForm(patch: Partial<GenerateForm>) {
    Object.assign(ui.form, patch);
  },
  async generate() {
    ui.generating = true;
    const ok = await mutate(() => api.generate({ ...ui.form }));
    ui.generating = false;
    render(current);
    if (ok)
      toast(
        current?.result?.reason ?? "결과 상태를 확인하세요.",
        current?.result?.outcome === "accepted" ||
          current?.result?.outcome === "reference"
          ? "ok"
          : "info",
      );
    if (ok && current?.result) {
      edit.task = "inspect";
      edit.showResult = true;
      render(current);
    }
  },
};
async function reload(): Promise<void> {
  ui.loadingAll = true;
  await mutate(api.getState);
  ui.loadingAll = false;
  render(current);
}
async function clearAll(): Promise<void> {
  const filled = current?.views.filter((v) => v.hasImage) ?? [];
  if (!filled.length) {
    toast("비울 이미지가 없습니다.");
    return;
  }
  if (!confirm(`업로드된 이미지 ${filled.length}개를 모두 지울까요?`)) return;
  for (const view of filled) {
    if (!(await mutate(() => api.clearView(view.id), view.id))) break;
  }
}
function renderHeader(state: State | null): HTMLElement {
  const busy = ui.loadingAll || ui.generating || ui.busy.size > 0;
  return h(
    "header",
    { class: "topbar" },
    h("h1", {}, "5면 → 3D"),
    h(
      "span",
      { class: "muted dir", title: state?.directory ?? "" },
      state ? `데이터: ${state.directory}` : "불러오는 중…",
    ),
    h("span", { class: "spacer" }),
    h(
      "button",
      {
        type: "button",
        onClick: () => {
          ui.workspace = !ui.workspace;
          render(current);
        },
      },
      ui.workspace ? "사진 전체 관리" : "사진·모델 보정",
    ),
    h(
      "button",
      { type: "button", disabled: ui.loadingAll, onClick: () => void reload() },
      "다시 불러오기",
    ),
    h(
      "button",
      {
        type: "button",
        title:
          "left/right 슬롯의 이미지와 보정을 서로 바꿉니다. 이미지 이름이 캐릭터 자신의 왼쪽/오른쪽 기준일 때 사용하세요.",
        disabled:
          busy ||
          !state?.views.some(
            (v) => (v.id === "left" || v.id === "right") && v.hasImage,
          ),
        onClick: () => void mutate(() => api.swapViews("left", "right")),
      },
      "left ↔ right 교체",
    ),
    h(
      "button",
      {
        type: "button",
        class: "btn-danger",
        disabled: busy || !state?.views.some((v) => v.hasImage),
        onClick: () => void clearAll(),
      },
      "전부 비우기",
    ),
    h("a", { class: "btn-link primary", href: "/viewer" }, "3D 뷰어 열기 →"),
  );
}
/** Rebuilds the whole page from `state` plus the UI-only flags. */
function render(state: State | null): void {
  toastBox.setAttribute("aria-live", ui.workspace ? "off" : "polite");
  const focused = document.activeElement as HTMLElement | null,
    focusKey = focused?.dataset.key;
  const selection =
    focused instanceof HTMLInputElement && focused.type === "text"
      ? [focused.selectionStart, focused.selectionEnd]
      : null;
  const header = renderHeader(state);
  if (!state) {
    root.replaceChildren(
      header,
      h(
        "p",
        { class: "muted loading" },
        ui.loadingAll
          ? "상태를 불러오는 중…"
          : "상태를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.",
      ),
    );
    return;
  }
  if (ui.workspace) {
    root.replaceChildren(header, renderWorkspace(state));
    restoreFocus(focusKey, selection);
    return;
  }
  modelViewer?.dispose();
  modelViewer = null;
  const slots = h(
    "div",
    { class: "slots" },
    ...state.views.map((v) => renderSlot(v, ui, slotActions)),
  );
  const side = h(
    "aside",
    { class: "side" },
    renderValidation(state.validation),
    renderGenerate(state, ui, panelActions),
  );
  root.replaceChildren(
    header,
    h("main", { class: "layout" }, slots, side),
    ...(state.result ? [renderResult(state.result, ui.stamp)] : []),
  );
  restoreFocus(focusKey, selection);
}
// Canonical task drafts survive normal rerenders; identity changes invalidate them.
const edit = {
  view: "front" as ViewId,
  task: "landmark",
  showResult: false,
  identity: "",
  photo: null as readonly [number, number] | null,
  world: null as Vec3 | null,
  a: null as Vec3 | null,
  b: null as Vec3 | null,
  mm: "",
  step: 0,
  protection: null as Protection | null,
  closed: false,
  brush: 24,
  erase: false,
  cursor: { x: 0.5, y: 0.5 },
  notice: "",
  camera: {} as Record<string, string>,
  pointIndex: null as number | null,
  pointStep: -1,
};
const modelHost = h("div", { class: "model-host" });
let modelViewer: ModelViewer | null = null,
  scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    render(current);
  });
}
function restoreFocus(
  key: string | undefined,
  selection: readonly (number | null)[] | null,
) {
  if (!key) return;
  const target =
    [...root.querySelectorAll<HTMLElement>("[data-key]")].find(
      (el) => el.dataset.key === key,
    ) ?? root.querySelector<HTMLElement>("#task-title");
  target?.focus({ preventScroll: true });
  if (selection && target instanceof HTMLInputElement && target.type === "text")
    target.setSelectionRange(selection[0] ?? 0, selection[1] ?? 0);
}
function note(message: string) {
  edit.notice = message;
  const live = document.getElementById("task-feedback");
  if (live && live.textContent !== message) live.textContent = message;
}
async function change(patch: Record<string, unknown>) {
  if (!current) return false;
  const s = current.reconstruction;
  return mutate(() => api.updateReconstruction(s.sourceId, s.meshId, patch));
}
function record(patch: Partial<CameraRecord>) {
  return change({ view: edit.view, record: patch });
}
function button(
  label: string,
  action: () => void,
  key = label,
  disabled = false,
) {
  return h(
    "button",
    { type: "button", "data-key": key, disabled, onClick: action },
    label,
  );
}
function field(
  label: string,
  value: string,
  update: (value: string) => void,
  key: string,
  type = "number",
) {
  return h(
    "label",
    { class: "edit-field" },
    h("span", {}, label),
    h("input", {
      type,
      value,
      "data-key": key,
      step: "any",
      onInput: (e: Event) => update((e.target as HTMLInputElement).value),
    }),
  );
}
function currentProtection(): Protection {
  return edit.protection!;
}
function picked(point: Vec3, remove: boolean) {
  if (edit.task === "landmark") edit.world = point;
  else if (edit.task === "measure") {
    if (!edit.a || edit.b) {
      edit.a = point;
      edit.b = null;
    } else edit.b = point;
  } else if (edit.task === "protect") {
    const p = currentProtection();
    if (edit.step < 2) {
      const regions = p.regions.map((r) => [...r]) as [Vec3[], Vec3[]],
        index = edit.step as 0 | 1;
      if (remove)
        regions[index] = regions[index].filter(
          (v) =>
            Math.hypot(v[0] - point[0], v[1] - point[1], v[2] - point[2]) >
            0.025,
        );
      else if (
        regions[index].length < 1024 &&
        !regions[index].some(
          (v) =>
            Math.hypot(v[0] - point[0], v[1] - point[1], v[2] - point[2]) <
            0.003,
        )
      )
        regions[index].push(point);
      edit.protection = { ...p, regions, confirmed: false };
    } else if (edit.step === 2 || edit.step === 4) {
      const key = edit.step === 2 ? "path" : "boundary",
        points = [...p[key]];
      if (edit.pointStep === edit.step && edit.pointIndex !== null) {
        points[edit.pointIndex] = point;
        edit.pointIndex = null;
      } else if ((edit.step === 2 || !edit.closed) && points.length < 1024)
        points.push(point);
      if (edit.step === 4) edit.closed = false;
      edit.protection = { ...p, [key]: points, confirmed: false };
    }
  }
  note(
    edit.task === "landmark"
      ? "모델 점을 선택했습니다. 사진 점과 함께 확인하세요."
      : edit.task === "measure"
        ? "치수 구간 후보를 선택했습니다. 구간과 mm 값을 확인하세요."
        : "보호 선택을 갱신했습니다. 다음 단계 전에 선택을 확인하세요.",
  );
  scheduleRender();
}
function syncViewer(state: State) {
  if (!modelViewer) {
    modelViewer = mountModelViewer(modelHost, {
      onPick: picked,
      onStatus: note,
      onRotation: (active) =>
        root
          .querySelector('[data-key="spin-model"]')
          ?.setAttribute("aria-pressed", String(active)),
    });
    modelHost.querySelector("canvas")!.dataset.key = "model-canvas";
  }
  const displayedResult =
    edit.showResult && edit.task === "inspect" && state.result;
  const url = displayedResult ? displayedResult.glbUrl : state.initialUrl;
  void modelViewer.setModel(
    url
      ? {
          id: displayedResult ? "result" : "initial",
          name: displayedResult ? "현재 결과 형상" : "고정 초기 모델",
          createdAt: 0,
          asset: { kind: "mesh", format: "glb", url, byteSize: 0 },
        }
      : null,
  );
  const mode =
    edit.task === "inspect" ||
    (edit.task === "protect" && [3, 5, 6].includes(edit.step))
      ? "inspect"
      : edit.task === "protect" && edit.step < 2
        ? edit.erase
          ? "brush-remove"
          : "brush-add"
        : "point";
  modelViewer.setMode(mode);
  modelViewer.setBrush(edit.brush);
  const groups: OverlayGroup[] = [];
  for (const [index, pair] of state.reconstruction.views[
    edit.view
  ].landmarks.entries())
    groups.push({ points: [pair.world], label: String(index + 1) });
  if (edit.world) groups.push({ points: [edit.world], label: "후보" });
  const p = currentProtection();
  for (let i = 0; i < 2; i++)
    if (p.regions[i]!.length)
      groups.push({
        points: p.regions[i]!,
        label: "연결" + (i + 1),
        region: true,
      });
  if (p.path.length) groups.push({ points: p.path, label: "경로", line: true });
  if (p.boundary.length)
    groups.push({
      points: p.boundary,
      label: "경계",
      line: true,
      closed: edit.closed || p.confirmed,
    });
  if (p.direction && p.boundary.length) {
    const center = p.boundary.reduce(
      (s, v) =>
        [
          s[0] + v[0] / p.boundary.length,
          s[1] + v[1] / p.boundary.length,
          s[2] + v[2] / p.boundary.length,
        ] as Vec3,
      [0, 0, 0] as Vec3,
    );
    groups.push({
      points: [
        center,
        [
          center[0] + p.direction[0] * 0.25,
          center[1] + p.direction[1] * 0.25,
          center[2] + p.direction[2] * 0.25,
        ],
      ],
      label: "관통 방향",
      line: true,
      probe: true,
    });
  }
  for (const m of state.reconstruction.measurements)
    groups.push({ points: [m.a, m.b], label: m.id, line: true });
  if (edit.a)
    groups.push({
      points: edit.b ? [edit.a, edit.b] : [edit.a],
      label: "치수 후보",
      line: !!edit.b,
    });
  modelViewer.setOverlays(displayedResult ? [] : groups);
}
function photoArea(state: State) {
  const view = state.views.find((v) => v.id === edit.view)!,
    c = state.reconstruction.views[edit.view],
    source = view.source;
  const stage = h("div", {
    class: "photo-stage",
    tabIndex: 0,
    "data-key": "photo-stage",
    "aria-label":
      "원본 사진. 방향키로 커서를 옮기고 Enter로 사진 점을 선택하세요. Tab으로 나갑니다.",
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const mark = (name: string, attrs: Record<string, string>) => {
    const node = document.createElementNS(svg.namespaceURI, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
    return node;
  };
  function draw() {
    if (!source) return;
    svg.setAttribute("viewBox", `0 0 ${source.width} ${source.height}`);
    svg.replaceChildren();
    if (c.camera && state.initialUrl)
      mark("image", {
        href: `/api/reprojection/${edit.view}?source=${state.reconstruction.sourceId}&t=${ui.stamp}`,
        width: String(source.width),
        height: String(source.height),
        preserveAspectRatio: "none",
      });
    const markers = [
      ...c.landmarks.map((l, index) => ({
        point: l.image,
        label: String(index + 1),
      })),
      ...(edit.photo ? [{ point: edit.photo, label: "후보" }] : []),
    ];
    const scale =
        1 /
        Math.max(
          0.0001,
          Math.min(
            (stage.clientWidth || 500) / source.width,
            (stage.clientHeight || 400) / source.height,
          ),
        ),
      radius = 7 * scale;
    for (const m of markers) {
      mark("circle", {
        cx: String(m.point[0]),
        cy: String(m.point[1]),
        r: String(radius),
        fill: "#60a5fa",
        stroke: "#111827",
        "stroke-width": String(5 * scale),
      });
      mark("circle", {
        cx: String(m.point[0]),
        cy: String(m.point[1]),
        r: String(radius),
        fill: "none",
        stroke: "#fff",
        "stroke-width": String(2 * scale),
      });
      mark("rect", {
        x: String(m.point[0] + 10 * scale),
        y: String(m.point[1] - 22 * scale),
        width: String(60 * scale),
        height: String(26 * scale),
        fill: "#0f1115",
        stroke: "#fff",
      });
      const text = mark("text", {
        x: String(m.point[0] + 14 * scale),
        y: String(m.point[1] - 3 * scale),
        fill: "#fff",
        "font-size": String(16 * scale),
      });
      text.textContent = m.label;
    }
    if (edit.task === "landmark")
      mark("circle", {
        cx: String(edit.cursor.x * source.width),
        cy: String(edit.cursor.y * source.height),
        r: String(12 * scale),
        fill: "none",
        stroke: "#fff",
        "stroke-width": String(2 * scale),
      });
  }
  if (view.hasImage) {
    const image = h("img", {
      src: `/views/${edit.view}/raw?source=${state.reconstruction.sourceId}`,
      alt: `${edit.view} 원본 사진`,
      onLoad: draw,
    });
    stage.append(image, svg);
  } else stage.append(h("p", {}, "사진 전체 관리에서 이 사진을 추가하세요."));
  const select = () => {
    if (source && edit.task === "landmark") {
      edit.photo = [
        edit.cursor.x * source.width,
        edit.cursor.y * source.height,
      ];
      note("사진 점을 선택했습니다. 초기 모델의 같은 위치를 선택하세요.");
      draw();
      scheduleRender();
    }
  };
  stage.addEventListener("pointerdown", (event) => {
    if (!source || edit.task !== "landmark") return;
    const rect = stage.getBoundingClientRect(),
      s = Math.min(rect.width / source.width, rect.height / source.height),
      x = (event.clientX - rect.left - (rect.width - source.width * s) / 2) / s,
      y =
        (event.clientY - rect.top - (rect.height - source.height * s) / 2) / s;
    if (x < 0 || y < 0 || x > source.width || y > source.height) return;
    stage.focus();
    edit.cursor = { x: x / source.width, y: y / source.height };
    select();
  });
  stage.addEventListener("keydown", (event) => {
    if (event.key === "Tab" || edit.task !== "landmark") return;
    if (event.key === "Enter") {
      event.preventDefault();
      select();
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 0.05 : 0.01;
      edit.cursor.x = Math.min(
        1,
        Math.max(
          0,
          edit.cursor.x +
            (event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0),
        ),
      );
      edit.cursor.y = Math.min(
        1,
        Math.max(
          0,
          edit.cursor.y +
            (event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0),
        ),
      );
      draw();
    }
  });
  stage.addEventListener("photo-resize", draw);
  return h(
    "section",
    { class: "evidence" },
    h("h2", {}, `${edit.view} · 원본 + 재투영 외곽`),
    stage,
    h("p", {}, c.reason),
  );
}
function alignmentTools(state: State) {
  const saved = state.reconstruction.views[edit.view],
    source = state.views.find((v) => v.id === edit.view)?.source;
  const base =
    saved.camera ??
    defaultPhotoCamera(
      edit.view,
      source?.width ?? 1024,
      source?.height ?? 1024,
    );
  const tools = h(
    "div",
    {},
    h(
      "p",
      {},
      "사진의 점 → 모델의 같은 점 → 한 쌍 확인 순서로 등록하세요. Enter는 후보 선택만 합니다.",
    ),
    button(
      "사진·모델 점 한 쌍 확인",
      () => {
        if (!edit.photo || !edit.world) {
          note("사진 점과 모델 점을 모두 선택하세요.");
          return;
        }
        const pair = {
          id: String(Date.now()).slice(-6),
          image: edit.photo,
          world: edit.world,
        };
        void record({
          camera: base,
          landmarks: [...saved.landmarks, pair],
        }).then((ok) => {
          if (ok) {
            edit.photo = null;
            edit.world = null;
            note("기준점 한 쌍을 등록했습니다. 다음 쌍을 선택하세요.");
            render(current);
          }
        });
      },
      "confirm-pair",
      !state.initialUrl,
    ),
    button("후보 선택 취소", () => {
      edit.photo = null;
      edit.world = null;
      render(current);
    }),
    h(
      "p",
      {},
      `등록 ${saved.landmarks.length}쌍 · 사진 후보 ${edit.photo ? "선택됨" : "없음"} · 모델 후보 ${edit.world ? "선택됨" : "없음"}`,
    ),
  );
  for (const l of saved.landmarks)
    tools.append(
      h(
        "div",
        { class: "action-row" },
        h("span", {}, `기준점 ${l.id}`),
        button(
          "이 기준점 삭제",
          () =>
            void record({
              landmarks: saved.landmarks.filter((v) => v.id !== l.id),
            }),
          "delete-" + l.id,
        ),
      ),
    );
  const cameraFields = h(
    "details",
    {},
    h("summary", {}, "촬영 방향·위치 수동 보완"),
  );
  const projection = h(
    "select",
    {
      "data-key": "camera-projection",
      onChange: (e: Event) => {
        edit.camera.projection = (e.target as HTMLSelectElement).value;
      },
    },
    h("option", { value: "perspective" }, "원근 카메라"),
    h("option", { value: "orthographic" }, "정투영 카메라"),
  );
  projection.value = edit.camera.projection ?? base.projection;
  cameraFields.append(
    h("label", { class: "edit-field" }, h("span", {}, "투영 방식"), projection),
  );
  for (const [key, label, fallback] of [
    ["yaw", "좌우 회전 보정 °", "0"],
    ["pitch", "상하 회전 보정 °", "0"],
    ["roll", "기울기 보정 °", "0"],
    ["x", "좌우 위치", String(base.translation[0])],
    ["y", "상하 위치", String(base.translation[1])],
    ["z", "촬영 거리", String(base.translation[2])],
    ["focal", "초점거리 (픽셀)", String(base.fx)],
  ] as const)
    cameraFields.append(
      field(
        label,
        edit.camera[key] ?? fallback,
        (v) => {
          edit.camera[key] = v;
        },
        "camera-" + key,
      ),
    );
  cameraFields.append(
    button("수동 카메라 적용", () => {
      const num = (key: string, fallback: number) =>
        Number(edit.camera[key] ?? fallback);
      const camera: Camera = {
        ...base,
        projection: (edit.camera.projection ??
          base.projection) as Camera["projection"],
        near:
          (edit.camera.projection ?? base.projection) === "perspective"
            ? Math.max(0.001, base.near)
            : -1e12,
        rotation: multiplyRotation(
          angleRotation(num("yaw", 0), num("pitch", 0), num("roll", 0)),
          base.rotation,
        ),
        translation: [
          num("x", base.translation[0]),
          num("y", base.translation[1]),
          num("z", base.translation[2]),
        ],
        fx: num("focal", base.fx),
        fy: (base.fy * num("focal", base.fx)) / base.fx,
      };
      void record({ camera }).then((ok) => {
        if (ok) edit.camera = {};
      });
    }),
  );
  tools.append(
    cameraFields,
    h(
      "label",
      { class: "check-row" },
      h("input", {
        type: "checkbox",
        checked: saved.locked,
        onChange: (e: Event) =>
          void record({ locked: (e.target as HTMLInputElement).checked }),
      }),
      "카메라 잠금 (잠근 상태에서는 검증만)",
    ),
    button(
      saved.excluded ? "이 사진 다시 포함" : "이 사진 제외",
      () => void record({ excluded: !saved.excluded }),
    ),
    button(
      "현재 사진 자동 정렬·검증",
      () =>
        void mutate(() =>
          api.fitCameras(
            state.reconstruction.sourceId,
            state.reconstruction.meshId,
            edit.view,
          ),
        ),
      "fit-current",
      !state.initialUrl,
    ),
    button(
      "사진 전체 자동 정렬",
      () =>
        void mutate(() =>
          api.fitCameras(
            state.reconstruction.sourceId,
            state.reconstruction.meshId,
          ),
        ),
      "fit-all",
      !state.initialUrl,
    ),
  );
  return tools;
}
function protectionTools() {
  const p = currentProtection(),
    titles = [
      "위쪽 연결 부위 칠하기",
      "아래쪽 연결 부위 칠하기",
      "손잡이를 따라 경로 점 추가",
      "연결 부위와 전체 경로 확인",
      "구멍 경계 점 추가",
      "구멍이 보이는 시점에서 방향 저장",
      "보호 선택 전체 확인",
    ];
  const tools = h(
    "div",
    {},
    h("p", { class: "step" }, `${edit.step + 1}/7 · ${titles[edit.step]}`),
    h(
      "p",
      {},
      "선택한 초기 형상 자체에 연결과 구멍이 있어야 합니다. 잘못된 초기 형상은 보호 기준으로 사용할 수 없습니다.",
    ),
  );
  if (edit.step < 2) {
    tools.append(
      field(
        "브러시 크기 (화면 픽셀)",
        String(edit.brush),
        (v) => {
          edit.brush = Number(v);
          modelViewer?.setBrush(edit.brush);
        },
        "brush",
      ),
      button(edit.erase ? "칠하기 모드로" : "잘못 칠한 부분 지우기", () => {
        edit.erase = !edit.erase;
        render(current);
      }),
      button("현재 연결 부위 비우기", () => {
        const regions = p.regions.map((r) => [...r]) as [Vec3[], Vec3[]];
        regions[edit.step as 0 | 1] = [];
        edit.protection = { ...p, regions };
        render(current);
      }),
      h("p", {}, `선택한 표면 위치 ${p.regions[edit.step as 0 | 1].length}개`),
    );
  }
  if (edit.step === 2 || edit.step === 4)
    tools.append(
      button("마지막 점 삭제", () => {
        if (edit.step === 2)
          edit.protection = { ...p, path: p.path.slice(0, -1) };
        else {
          edit.protection = { ...p, boundary: p.boundary.slice(0, -1) };
          edit.closed = false;
        }
        render(current);
      }),
      h(
        "p",
        {},
        `${edit.step === 2 ? "경로" : "경계"} 점 ${(edit.step === 2 ? p.path : p.boundary).length}개`,
      ),
    );
  if (edit.step === 2 || edit.step === 4) {
    const key = edit.step === 2 ? "path" : "boundary";
    p[key].forEach((_, i) =>
      tools.append(
        h(
          "div",
          { class: "action-row" },
          button(
            `점 ${i + 1} 다시 선택`,
            () => {
              edit.pointIndex = i;
              edit.pointStep = edit.step;
              note(`점 ${i + 1}의 새 표면 위치를 선택하세요.`);
            },
            `${key}-replace-${i}`,
          ),
          button(
            `점 ${i + 1} 삭제`,
            () => {
              edit.protection = {
                ...p,
                [key]: p[key].filter((_, j) => j !== i),
                confirmed: false,
              };
              edit.pointIndex = null;
              if (edit.step === 4) edit.closed = false;
              render(current);
            },
            `${key}-delete-${i}`,
          ),
        ),
      ),
    );
  }
  if (edit.step === 3)
    tools.append(
      h(
        "label",
        { class: "check-row" },
        h("input", {
          type: "checkbox",
          checked: p.hole,
          onChange: (e: Event) => {
            edit.protection = {
              ...p,
              hole: (e.target as HTMLInputElement).checked,
            };
          },
        }),
        "구멍도 보호하기",
      ),
    );
  if (edit.step === 4)
    tools.append(
      button("경계 닫기", () => {
        if (p.boundary.length < 3) {
          note("경계 점을 3개 이상 선택하세요.");
          return;
        }
        edit.closed = true;
        note("경계를 닫았습니다. 실제 구멍 여부는 전체 확인에서 검사합니다.");
        render(current);
      }),
    );
  if (edit.step === 5)
    tools.append(
      button("이 방향 사용", () => {
        const direction = modelViewer?.direction();
        if (direction) {
          edit.protection = { ...p, direction };
          note("현재 관통 방향을 저장했습니다. 보기 시점을 바꿔도 유지됩니다.");
          render(current);
        }
      }),
      h(
        "p",
        {},
        p.direction
          ? "저장 방향: " + p.direction.map((v) => v.toFixed(3)).join(", ")
          : "방향을 아직 저장하지 않았습니다.",
      ),
    );
  if (edit.step === 6)
    tools.append(
      button(
        "전체 확인·보호 등록",
        () =>
          void change({
            protection: { ...p, mode: "required", confirmed: true },
          }).then((ok) => {
            if (ok && current) {
              edit.protection = structuredClone(
                current.reconstruction.protection,
              );
              note("보호 입력의 실제 형상을 확인하고 등록했습니다.");
              render(current);
            }
          }),
      ),
    );
  if (edit.step < 6)
    tools.append(
      button(edit.step === 3 ? "연결 부위 확인·다음" : "다음 단계", () => {
        if (
          (edit.step < 2 && !p.regions[edit.step as 0 | 1].length) ||
          (edit.step === 2 && p.path.length < 3) ||
          (edit.step === 4 && !edit.closed) ||
          (edit.step === 5 && !p.direction)
        ) {
          note("현재 단계의 선택과 확인을 먼저 완료하세요.");
          return;
        }
        edit.step = edit.step === 3 && !p.hole ? 6 : edit.step + 1;
        note(titles[edit.step]!);
        render(current);
      }),
    );
  tools.append(
    button(
      "이전 단계",
      () => {
        edit.step = Math.max(0, edit.step - 1);
        render(current);
      },
      "previous-protection",
      edit.step === 0,
    ),
    button("보호 선택 취소", () => {
      if (current)
        edit.protection = structuredClone(current.reconstruction.protection);
      edit.step = 0;
      edit.closed = false;
      render(current);
    }),
    button(
      "보호할 연결·구멍이 없는 물체로 확인",
      () =>
        void change({
          protection: { ...p, mode: "none", confirmed: true },
        }).then((ok) => {
          if (ok && current) {
            edit.protection = structuredClone(
              current.reconstruction.protection,
            );
            render(current);
          }
        }),
    ),
    button(
      "형상 보정 없이 초기 형상만 사용",
      () =>
        void change({
          protection: { ...p, mode: "required", confirmed: false },
        }).then((ok) => {
          if (ok) void panelActions.generate();
        }),
    ),
  );
  return tools;
}
function measurementTools(state: State) {
  const tools = h(
    "div",
    {},
    h(
      "p",
      {},
      "초기 모델에서 구간 양 끝 → 실측 mm 값 → 함께 확인·등록. 치수 입력은 선택 사항입니다.",
    ),
    field(
      "실측값 (mm)",
      edit.mm,
      (v) => {
        edit.mm = v;
      },
      "measurement-mm",
      "text",
    ),
    h(
      "p",
      {},
      `첫 점 ${edit.a ? "선택됨" : "없음"} · 둘째 점 ${edit.b ? "선택됨" : "없음"}`,
    ),
    button("구간·실측값 확인·등록", () => {
      if (
        !edit.a ||
        !edit.b ||
        !Number.isFinite(Number(edit.mm)) ||
        Number(edit.mm) <= 0
      ) {
        note("두 끝점과 양수 mm 값을 입력하세요.");
        return;
      }
      let number = 1;
      while (
        state.reconstruction.measurements.some((m) => m.id === "치수 " + number)
      )
        number++;
      const m = {
        id: "치수 " + number,
        a: edit.a,
        b: edit.b,
        mm: Number(edit.mm),
      };
      void change({
        measurements: [...state.reconstruction.measurements, m],
      }).then((ok) => {
        if (ok) {
          edit.a = null;
          edit.b = null;
          edit.mm = "";
          note("치수 구간과 실측값을 등록했습니다.");
          render(current);
        }
      });
    }),
    button("현재 구간 취소", () => {
      edit.a = null;
      edit.b = null;
      edit.mm = "";
      render(current);
    }),
  );
  for (const m of state.reconstruction.measurements)
    tools.append(
      h(
        "div",
        { class: "action-row" },
        h("span", {}, `${m.id} · ${m.mm} mm`),
        button(
          "치수 삭제",
          () =>
            void change({
              measurements: state.reconstruction.measurements.filter(
                (v) => v.id !== m.id,
              ),
            }),
          "delete-measure-" + m.id,
        ),
      ),
    );
  return tools;
}
function renderWorkspace(state: State) {
  const identity =
    state.reconstruction.sourceId + ":" + state.reconstruction.meshId;
  if (edit.identity !== identity) {
    edit.identity = identity;
    edit.showResult = false;
    edit.photo = null;
    edit.world = null;
    edit.a = null;
    edit.b = null;
    edit.protection = structuredClone(state.reconstruction.protection);
    edit.step = 0;
    edit.closed = state.reconstruction.protection.confirmed;
    edit.camera = {};
  }
  syncViewer(state);
  const result = state.result,
    labels = {
      reference: "정투영 결과",
      accepted: "보정 완료",
      "initial-only": "초기 형상만 제공",
      rollback: "보정 되돌림",
    };
  const feedback = h(
    "p",
    {
      id: "task-feedback",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
    ui.pending ? "처리 중… 입력과 현재 모델을 유지하고 있습니다." : edit.notice,
  );
  const resultState = h(
    "section",
    { class: "result-state", "aria-label": "실제 결과 상태" },
    h("h2", {}, result ? labels[result.outcome] : "아직 결과가 없습니다"),
    h(
      "p",
      {},
      result?.reason ??
        state.reconstruction.warning ??
        "초기 모델을 준비하고 사진을 정렬하세요.",
    ),
    h(
      "p",
      {},
      result
        ? `저장·내보내기 결과: ${labels[result.outcome]} · ${result.meshId.slice(0, 12)}`
        : "아래 모델은 정렬·보호 선택을 위한 초기 형상입니다.",
    ),
    h(
      "p",
      {},
      `지금 표시한 모델: ${edit.showResult && edit.task === "inspect" && result ? labels[result.outcome] : "고정 초기 형상 (선택 기준)"}`,
    ),
    button("정렬 도구로 이동", () => {
      edit.task = "landmark";
      render(current);
    }),
    button("보호 선택 확인", () => {
      edit.task = "protect";
      render(current);
    }),
  );
  const selection = h(
    "nav",
    { class: "photo-selector", "aria-label": "보정할 사진" },
    ...state.views.map((v) =>
      button(
        `${v.id} · ${state.reconstruction.views[v.id].excluded ? "제외" : state.reconstruction.views[v.id].status === "aligned" ? "정렬 완료" : "확인 필요"}`,
        () => {
          edit.view = v.id;
          edit.photo = null;
          edit.world = null;
          edit.camera = {};
          render(current);
        },
        "choose-" + v.id,
      ),
    ),
  );
  const taskLabels = {
    landmark: "사진 정렬·기준점",
    protect: "연결·구멍 보호",
    measure: "실측 치수 (옵션)",
    inspect: "모델 관찰",
  };
  const task = h(
    "select",
    {
      "aria-label": "작업 선택",
      "data-key": "task-select",
      value: edit.task,
      onChange: (e: Event) => {
        edit.task = (e.target as HTMLSelectElement).value;
        edit.world = null;
        note(
          "작업을 변경했습니다. " +
            taskLabels[edit.task as keyof typeof taskLabels],
        );
        render(current);
      },
    },
    ...Object.entries(taskLabels).map(([value, label]) =>
      h("option", { value }, label),
    ),
  );
  task.value = edit.task;
  const file = h("input", {
    type: "file",
    accept: ".glb,.obj",
    "aria-label": "초기 GLB 또는 OBJ 가져오기",
    "data-key": "initial-upload",
    onChange: (e: Event) => {
      const chosen = (e.target as HTMLInputElement).files?.[0];
      if (chosen) void mutate(() => api.importInitial(chosen));
    },
  });
  const tools = h(
    "aside",
    { class: "correction-tools" },
    h("h2", { id: "task-title", tabIndex: -1 }, "정렬·보호·치수 도구"),
    h(
      "label",
      { class: "edit-field" },
      h("span", {}, "입력 종류"),
      h(
        "select",
        {
          "data-key": "input-kind",
          value: state.reconstruction.kind,
          onChange: (e: Event) =>
            void change({ kind: (e.target as HTMLSelectElement).value }),
        },
        h("option", { value: "reference" }, "정투영 참조"),
        h("option", { value: "photo" }, "실제 사진·각도 불일치 사진"),
      ),
    ),
    h(
      "label",
      { class: "edit-field" },
      h("span", {}, "초기 모델 가져오기"),
      file,
    ),
    button(
      "선택한 기준 사진으로 초기 모델 생성",
      () =>
        void mutate(() =>
          api.generateInitial(state.reconstruction.sourceId, edit.view),
        ),
      "generate-initial",
      !state.views.find((v) => v.id === edit.view)?.hasImage,
    ),
    h(
      "p",
      {},
      "단일 사진 생성이 지원되지 않으면 GLB/OBJ 초기 모델을 가져오세요. 임의 각도 사진을 정투영 슬롯으로 대신하지 않습니다.",
    ),
    task,
    feedback,
    edit.task === "landmark"
      ? alignmentTools(state)
      : edit.task === "protect"
        ? protectionTools()
        : edit.task === "measure"
          ? measurementTools(state)
          : h(
              "p",
              {},
              "마우스 또는 방향키로 시점을 조절합니다. + / - 로 확대·축소합니다.",
            ),
    button("현재 커서 위치 확인", () =>
      note(modelViewer?.cursor() ?? "모델이 없습니다."),
    ),
    button(
      "자동 회전",
      () => {
        modelViewer?.toggleRotation();
      },
      "spin-model",
      edit.task !== "inspect",
    ),
    button("시점 초기화", () => modelViewer?.reset()),
    result
      ? button("현재 결과 형상 보기", () => {
          edit.task = "inspect";
          edit.showResult = true;
          render(current);
        })
      : null,
    result
      ? button("선택 기준 초기 모델 보기", () => {
          edit.task = "inspect";
          edit.showResult = false;
          render(current);
        })
      : null,
    state.reconstruction.kind === "photo"
      ? h(
          "section",
          {},
          h("h2", {}, "사진 보정 결과"),
          h(
            "p",
            {},
            "정렬 신뢰도와 보호 조건을 확인합니다. 조건이 부족하면 초기 형상을 유지합니다.",
          ),
          ...state.blockers.map((text) => h("p", {}, text)),
          button(
            ui.generating ? "결과 처리 중…" : "사진 보정 결과 만들기",
            () => void panelActions.generate(),
            "generate-photo",
            ui.generating || !state.canGenerate,
          ),
        )
      : renderGenerate(state, ui, panelActions),
  );
  tools.querySelector<HTMLSelectElement>('[data-key="input-kind"]')!.value =
    state.reconstruction.kind;
  if (state.reconstruction.warning)
    tools.prepend(
      h("p", {}, state.reconstruction.warning),
      button(
        "보정 정보 백업 후 초기화",
        () =>
          void mutate(() =>
            api.resetReconstruction(
              state.reconstruction.sourceId,
              state.reconstruction.meshId,
            ),
          ).then((ok) => {
            if (ok && current) {
              edit.protection = structuredClone(
                current.reconstruction.protection,
              );
              edit.photo = null;
              edit.world = null;
              edit.a = null;
              edit.b = null;
              note(
                "이전 views.json을 백업하고 정렬·보호·치수를 초기화했습니다.",
              );
              render(current);
            }
          }),
      ),
    );
  tools
    .querySelector('[data-key="spin-model"]')
    ?.setAttribute("aria-pressed", String(modelViewer?.rotation() ?? false));
  const mesh = h(
    "section",
    { class: "evidence" },
    h(
      "h2",
      {},
      edit.showResult && edit.task === "inspect" && result
        ? `현재 결과 · ${labels[result.outcome]}`
        : "고정 초기 모델 · 선택 기준",
    ),
    modelHost,
    h(
      "p",
      {},
      "관찰 시점은 촬영 카메라와 별개입니다. 선택은 고정 초기 모델에서 진행하며 자동 회전이 멈춥니다.",
    ),
  );
  return h(
    "main",
    { class: "correction-workspace" },
    h("h1", {}, "사진과 모델을 같은 위치에 맞추기"),
    resultState,
    selection,
    h("div", { class: "correction-grid" }, photoArea(state), mesh, tools),
    ...(result ? [renderResult(result, ui.stamp)] : []),
  );
}
window.addEventListener("pagehide", () => modelViewer?.dispose(), {
  once: true,
});
window.addEventListener("resize", () =>
  root.querySelector(".photo-stage")?.dispatchEvent(new Event("photo-resize")),
);
void reload();
