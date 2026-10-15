import { mountModelViewer } from "./model-viewer";
import type { AiModelDescriptor } from "../cad/ai/aiAdapter";
import "./viewer.css";
const host = document.getElementById("model-host");
const select = document.querySelector<HTMLSelectElement>("#model");
const status = document.getElementById("status");
const spin = document.querySelector<HTMLButtonElement>("#spin");
if (!host || !select || !status || !spin)
  throw new Error("viewer.html markup is missing an element");
const viewer = mountModelViewer(host, {
  onStatus: (message) => {
    const reason = models.find((m) => m.id === current)?.meta?.["이유"];
    status.textContent = message + (reason ? " · " + reason : "");
  },
  onRotation: (active) => spin.setAttribute("aria-pressed", String(active)),
});
host.querySelector("canvas")!.id = "stage";
let models: AiModelDescriptor[] = [],
  current = "";
const updateSpin = () =>
  spin.setAttribute("aria-pressed", String(viewer.rotation()));
async function show(id: string) {
  const chosen = models.find((m) => m.id === id);
  if (!chosen) return;
  current = id;
  select!.value = id;
  status!.textContent = chosen.name + " 불러오는 중…";
  await viewer.setModel(chosen);
  updateSpin();
}
select.addEventListener("change", () => void show(select.value));
spin.addEventListener("click", () => {
  viewer.toggleRotation();
  updateSpin();
});
document
  .getElementById("reset")
  ?.addEventListener("click", () => viewer.reset());
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-view]",
))
  button.addEventListener("click", () => {
    viewer.preset(button.dataset.view!);
    updateSpin();
  });
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-toggle]",
))
  button.addEventListener("click", () => {
    const key = button.dataset.toggle;
    if (
      key === "wireframe" ||
      key === "flat" ||
      key === "bbox" ||
      key === "axes"
    )
      button.setAttribute("aria-pressed", String(viewer.toggle(key)));
  });
document
  .getElementById("voxels")
  ?.addEventListener(
    "click",
    () => void show(current === "voxels" ? "model-glb" : "voxels"),
  );
window.addEventListener("pagehide", () => viewer.dispose(), { once: true });
async function load() {
  const response = await fetch("/api/cad/models", { cache: "no-store" });
  if (!response.ok)
    throw new Error("모델 목록을 읽지 못했습니다 (" + response.status + ")");
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("모델 목록 형식이 잘못됐습니다.");
  models = (value as AiModelDescriptor[]).filter((m) => m.asset?.url);
  models.sort(
    (a, b) => Number(b.id === "model-glb") - Number(a.id === "model-glb"),
  );
  for (const model of models) select!.add(new Option(model.name, model.id));
  document.querySelector<HTMLButtonElement>("#voxels")!.disabled = !models.some(
    (m) => m.id === "voxels",
  );
  if (models[0]) await show(models[0].id);
  else
    status!.textContent =
      "현재 입력에 맞는 3D 모델이 없습니다. 입력 화면에서 초기 모델 또는 3D 생성을 진행하세요.";
  updateSpin();
}
void load().catch((error) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.classList.add("status--error");
});
