import {
  Scene,
  Color,
  PerspectiveCamera,
  WebGLRenderer,
  HemisphereLight,
  DirectionalLight,
  MeshBasicMaterial,
  Box3,
  Vector3,
  Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import frontSample from "../assets/sample-mug/front.png?url";
import backSample from "../assets/sample-mug/back.png?url";
// The bundled renders use the old studio's camera-side labels. Hunyuan names
// these views from the subject's side, so label the sample pair accordingly.
import leftSample from "../assets/sample-mug/right.png?url";
import rightSample from "../assets/sample-mug/left.png?url";
import "./style.css";

const root = document.getElementById("app")!;
root.innerHTML = `
<header><div><p class="eyebrow">IMAGE TO 3D</p><h1>Hunyuan3D-2mv</h1><p>사진을 넣고, 3D 형상을 생성하세요.</p></div><a href="https://tencent-hunyuan3d-2mv.hf.space/" target="_blank" rel="noreferrer">공식 데모 ↗</a></header>
<main><section class="inputs" aria-labelledby="input-title"><h2 id="input-title">Multi-view Image Prompt</h2><p class="hint">Front 한 장으로 시작할 수 있습니다. 같은 물체의 다른 방향을 추가하면 형상 파악에 도움이 됩니다.</p><div class="uploads"></div>
<button id="sample" class="secondary" type="button">샘플 컵 넣기</button>
<div class="modes"><label>Generation Mode<select id="mode"><option>Turbo</option><option>Fast</option><option>Standard</option></select></label><label>Decoding Mode<select id="decode"><option value="196">Low</option><option value="256" selected>Standard</option><option value="384">High</option></select></label></div>
<div class="color-option"><label><input id="include-color" type="checkbox" checked aria-describedby="color-help"> 사진의 색과 무늬 입히기</label><p id="color-help">사진에 보이는 색을 모델에 옮깁니다. 안 보이는 면은 주변 색으로 채우며, 촬영 각도가 다르면 무늬가 어긋날 수 있습니다.</p></div>
<details><summary>고급 설정</summary><div class="checks"><label><input id="remove" type="checkbox" checked> 배경 제거</label><label><input id="random" type="checkbox" checked> 시드 무작위 변경</label></div><div class="settings"><label>시드 (시작 번호)<input id="seed" type="number" value="1234" min="0" max="10000000"></label><label>형상 다듬기 횟수<input id="steps" type="number" value="5" min="1" max="100"></label><label>표면 세밀도<input id="resolution" type="number" value="256" min="16" max="512"></label><label>사진 반영 강도<input id="guidance" type="number" value="5" min="0" max="30" step="0.1"></label><label>한 번에 계산할 점 수<input id="chunks" type="number" value="8000" min="1000" max="5000000"></label></div></details>
<button id="generate" class="primary" type="button" disabled>Gen Shape · 3D 생성</button><p class="disclosure">Hunyuan3D-2mv로 형상을 생성합니다. 사진 색 입히기는 이 PC에서 처리하며, 별도 텍스처 생성 AI를 사용하지 않습니다. 색 입히기를 끄고 로컬 GPU 서버가 꺼져 있으면 공식 Hugging Face Space로 이미지를 전송합니다.</p></section>
<section class="output" aria-labelledby="output-title"><div class="output-heading"><h2 id="output-title">Generated Mesh</h2><span id="badge">준비</span></div><div class="viewer-lighting"><label><input id="unlit" type="checkbox" checked aria-describedby="unlit-help"> 음영 없이 보기</label><span id="unlit-help">굴곡을 자세히 보려면 해제하세요. 미리보기에만 적용됩니다.</span></div><div id="viewer"><div id="empty"><span class="empty-icon">◇</span><h3>사진에서 3D로</h3><p>왼쪽에 사진을 넣고 Gen Shape를 눌러보세요.</p></div></div><div class="status"><p id="status" role="status" aria-live="polite">Front 이미지를 넣어주세요.</p><a id="download" hidden download="hunyuan3d.glb">GLB 다운로드 ↓</a></div><p class="result-note">Hunyuan이 반환한 원본 형상입니다. 드래그로 회전하고 스크롤로 확대합니다.</p><details id="stats" hidden><summary>Generation Info</summary><pre></pre></details></section></main>
<footer>Tencent Hunyuan3D-2mv 모델을 로컬 GPU 또는 공식 Space에서 실행하는 독립 클라이언트입니다. 공식 Space 이용 시 해당 서비스의 대기열·GPU 할당량을 따릅니다. <a href="/studio">이전 보정 도구</a></footer>`;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const settingHelp = {
  seed: [
    "결과를 다시 비교할 때 쓰는 번호",
    "같은 사진과 설정에서 비슷한 결과를 다시 만들 때 쓰는 번호입니다. 결과를 비교하려면 ‘시드 무작위 변경’을 끄세요. 켜져 있으면 입력한 번호 대신 새 번호를 사용합니다. 번호가 크다고 품질이 좋아지지는 않습니다.",
  ],
  steps: [
    "형상을 다듬는 횟수",
    "인공지능이 형상을 몇 번 다듬을지 정합니다. 늘리면 생성 시간이 길어지며, 결과가 항상 좋아지는 것은 아닙니다. 처음에는 기본값 5회로 시작해 보세요. 위의 생성 방식을 바꾸면 이 값도 함께 바뀝니다.",
  ],
  resolution: [
    "3D 표면의 세밀함",
    "최종 3D 표면을 얼마나 촘촘하게 만들지 정합니다. 높이면 작은 형태를 더 표현할 수 있지만 시간과 그래픽카드 메모리가 더 필요합니다. 기본값은 256입니다. 높여도 잘못된 형상이 무조건 고쳐지지는 않습니다.",
  ],
  guidance: [
    "사진을 따르는 강도",
    "인공지능이 입력 사진을 얼마나 강하게 따를지 정합니다. 높다고 무조건 좋은 것은 아니며, 너무 높으면 형태가 오히려 부자연스러워질 수 있습니다. 먼저 기본값 5를 사용해 보세요.",
  ],
  chunks: [
    "한 번에 계산하는 양",
    "3D 표면을 만들 때 한 번에 처리할 점의 수입니다. 높이면 빨라질 수 있지만 그래픽카드 메모리를 더 씁니다. 메모리 부족 오류가 나면 기본값 8000보다 낮춰 보세요. 생성은 느려질 수 있으며, 모델의 면 개수를 정하는 값은 아닙니다.",
  ],
} as const;

for (const [id, [title, description]] of Object.entries(settingHelp)) {
  const input = $<HTMLInputElement>(id);
  const label = input.closest("label")!;
  const field = document.createElement("div");
  field.className = "setting-field";
  label.replaceWith(field);
  field.append(label);

  const help = document.createElement("div");
  help.id = `${id}-help`;
  help.className = "setting-help";
  help.setAttribute("role", "tooltip");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const text = document.createElement("span");
  text.textContent = description;
  help.append(heading, text);
  field.append(help);
  input.setAttribute("aria-describedby", help.id);

  // Keep help open while reading it; a new hover or focus shows it again.
  field.addEventListener("pointerenter", () => {
    delete field.dataset.helpDismissed;
  });
  field.addEventListener("focusin", () => {
    delete field.dataset.helpDismissed;
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const field of root.querySelectorAll<HTMLElement>(".setting-field"))
    field.dataset.helpDismissed = "true";
});

const settingsHint = document.createElement("p");
settingsHint.className = "settings-hint";
settingsHint.textContent =
  "수치 위에 마우스를 올리거나 입력칸을 선택하면 설명이 나옵니다. Esc로 닫을 수 있습니다.";
root.querySelector(".settings")!.before(settingsHint);

const generateButton = $<HTMLButtonElement>("generate");
const sampleButton = $<HTMLButtonElement>("sample");
const views = ["front", "back", "left", "right"] as const;
type View = (typeof views)[number];
const images: Partial<Record<View, string>> = {};
let busy = false;
let polling: ReturnType<typeof setTimeout> | undefined;
let displayed = "";
let fileReads = 0;
let epoch = 0;
const files = new Map<View, HTMLInputElement>();
function status(message: string, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function update() {
  generateButton.disabled = busy || fileReads > 0 || !images.front;
  generateButton.textContent = busy ? "생성 중…" : "Gen Shape · 3D 생성";
  sampleButton.disabled = busy || fileReads > 0;
  for (const input of files.values()) input.disabled = busy;
  for (const button of root.querySelectorAll<HTMLButtonElement>(".clear"))
    button.disabled = busy;
  for (const element of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >(".modes select, .settings input, .checks input, .color-option input"))
    element.disabled = busy;
}
function readImage(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}
function showImage(id: View, data: string) {
  images[id] = data;
  const preview = document.querySelector<HTMLImageElement>(
    `img[data-view="${id}"]`,
  )!;
  preview.src = data;
  preview.hidden = false;
  preview.closest(".upload")!.classList.add("filled");
  preview.closest(".slot")!.querySelector<HTMLButtonElement>(".clear")!.hidden =
    false;
}
for (const id of views) {
  const slot = document.createElement("div");
  slot.className = "slot";
  const name = id[0]!.toUpperCase() + id.slice(1);
  slot.innerHTML = `<div class="slot-label"><strong>${name}</strong><span>${id === "front" ? "필수" : "선택"}</span><button class="clear" type="button" aria-label="${name} 이미지 지우기" hidden>×</button></div><label class="upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="${name} 이미지"><img data-view="${id}" alt="${name} 입력 이미지" hidden><span>＋<small>클릭해서 사진 추가</small></span></label>`;
  $("app").querySelector(".uploads")!.append(slot);
  const file = slot.querySelector("input")!;
  files.set(id, file);
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    fileReads++;
    update();
    try {
      if (selected.size > 12 * 1024 * 1024)
        throw new Error("각 이미지는 12MB 이하로 넣어주세요.");
      showImage(id, await readImage(selected));
      status("준비됐습니다. Gen Shape를 눌러주세요.");
    } catch (error) {
      status(String(error), true);
    } finally {
      fileReads--;
      update();
    }
  });
  slot.querySelector("button")!.addEventListener("click", () => {
    if (busy) return;
    delete images[id];
    file.value = "";
    slot.querySelector("img")!.hidden = true;
    slot.querySelector(".upload")!.classList.remove("filled");
    slot.querySelector("button")!.hidden = true;
    update();
  });
}
$("mode").addEventListener("change", () => {
  $<HTMLInputElement>("steps").value = (
    { Turbo: 5, Fast: 10, Standard: 30 } as Record<string, number>
  )[$<HTMLSelectElement>("mode").value]!.toString();
});
$("decode").addEventListener("change", () => {
  $<HTMLInputElement>("resolution").value =
    $<HTMLSelectElement>("decode").value;
});
sampleButton.addEventListener("click", async () => {
  fileReads++;
  update();
  try {
    const samples = [frontSample, backSample, leftSample, rightSample];
    for (let i = 0; i < views.length; i++) {
      const response = await fetch(samples[i]!);
      if (!response.ok) throw new Error("샘플을 불러오지 못했습니다.");
      showImage(views[i]!, await readImage(await response.blob()));
    }
    status("샘플 컵 4장을 넣었습니다. Gen Shape로 AI 생성을 시작하세요.");
  } catch (error) {
    status(String(error), true);
  } finally {
    fileReads--;
    update();
  }
});

const viewerHost = $("viewer");
let renderer: WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let scene: Scene;
let camera: PerspectiveCamera;
const unlitToggle = $<HTMLInputElement>("unlit");
const materialPairs = new Map<
  Mesh,
  { original: Material | Material[]; unlit: Material | Material[] }
>();
unlitToggle.addEventListener("change", () => {
  for (const [mesh, pair] of materialPairs)
    mesh.material = unlitToggle.checked ? pair.unlit : pair.original;
});
let object: Group | null = null;
let frame = 0;
let resizeObserver: ResizeObserver | null = null;
function disposeObject(target = object) {
  target?.traverse((node) => {
    const mesh = node as import("three").Mesh;
    mesh.geometry?.dispose();
    const pair = materialPairs.get(mesh);
    const materials = pair
      ? [pair.original, pair.unlit].flat()
      : [mesh.material].flat();
    for (const material of new Set(materials)) material?.dispose();
    materialPairs.delete(mesh);
  });
  if (target) scene.remove(target);
}
async function showModel(url: string) {
  const expected = epoch;
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    viewerHost.append(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "생성된 Hunyuan 3D 모델");
    scene = new Scene();
    scene.background = new Color("#f7f8fa");
    camera = new PerspectiveCamera(40, 1, 0.01, 100);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new HemisphereLight(0xffffff, 0x596879, 2));
    const light = new DirectionalLight(0xffffff, 2.5);
    light.position.set(3, 5, 4);
    scene.add(light);
    const resize = () => {
      renderer!.setSize(viewerHost.clientWidth, viewerHost.clientHeight);
      camera.aspect = viewerHost.clientWidth / viewerHost.clientHeight;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewerHost);
    resize();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls!.update();
      renderer!.render(scene, camera);
    };
    animate();
  }
  const loaded = await new GLTFLoader().loadAsync(url);
  if (expected !== epoch) {
    disposeObject(loaded.scene);
    return false;
  }
  disposeObject();
  object = loaded.scene;
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const unlit = (material: Material) => {
      const source = material as MeshStandardMaterial;
      return new MeshBasicMaterial({
        color: source.color?.clone() ?? new Color("#cbd2dc"),
        map: source.map ?? null,
        alphaMap: source.alphaMap ?? null,
        vertexColors: source.vertexColors,
        side: source.side,
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
      });
    };
    const original = mesh.material;
    const flat = Array.isArray(original)
      ? original.map(unlit)
      : unlit(original);
    materialPairs.set(mesh, { original, unlit: flat });
    mesh.material = unlitToggle.checked ? flat : original;
  });
  const bounds = new Box3().setFromObject(object),
    size = bounds.getSize(new Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, 0.001);
  object.position.sub(bounds.getCenter(new Vector3()));
  object.scale.setScalar(scale);
  object.position.multiplyScalar(scale);
  scene.add(object);
  controls!.target.set(0, 0, 0);
  camera.position.set(2.7, 1.5, 3.7);
  controls!.update();
  $("empty").hidden = true;
  return true;
}
interface Job {
  id: string;
  status: string;
  message: string;
  download?: string;
  seed?: unknown;
  stats?: unknown;
}
async function apply(job: Job | null) {
  if (!job) {
    update();
    return;
  }
  busy = job.status === "running";
  update();
  $("badge").textContent = busy
    ? "생성 중"
    : job.status === "succeeded"
      ? "완료"
      : "실패";
  status(job.message, job.status === "failed");
  if (job.status === "failed") {
    $("empty").hidden = false;
    $("empty").querySelector("h3")!.textContent = "형상을 생성하지 못했습니다";
    $("empty").querySelector("p")!.textContent =
      "아래 오류를 확인하고 다시 시도해주세요. 공식 Space의 GPU 할당량이나 대기 상태가 원인일 수 있습니다.";
  }
  if (job.status === "succeeded" && job.download) {
    const colored =
      (job.stats as { color?: string } | undefined)?.color ===
      "photo-projection";
    root.querySelector(".result-note")!.textContent = colored
      ? "사진에서 옮긴 색과 무늬가 GLB 다운로드에도 포함됩니다. 드래그로 회전하고 스크롤로 확대합니다."
      : "Hunyuan이 반환한 원본 형상입니다. 드래그로 회전하고 스크롤로 확대합니다.";
    const download = $<HTMLAnchorElement>("download");
    download.href = job.download;
    download.hidden = false;
    $("stats").hidden = false;
    $("stats").querySelector("pre")!.textContent = JSON.stringify(
      { seed: job.seed, info: job.stats },
      null,
      2,
    );
    if (displayed !== job.id) {
      const expected = epoch;
      try {
        if (await showModel(job.download)) displayed = job.id;
      } catch {
        if (expected === epoch)
          status(
            "AI 생성은 완료됐지만 미리보기를 열지 못했습니다. GLB를 다운로드해주세요.",
            true,
          );
      }
    }
  }
  if (busy) polling = setTimeout(poll, 1800);
}
async function poll() {
  const started = epoch;
  try {
    const response = await fetch("/api/hunyuan/job");
    if (!response.ok) throw new Error("생성 상태를 불러오지 못했습니다.");
    const data = await response.json();
    if (started === epoch) await apply(data.job);
  } catch {
    if (started === epoch) {
      status("서버 연결을 확인하고 있습니다…");
      polling = setTimeout(poll, 4000);
    }
  }
}
generateButton.addEventListener("click", async () => {
  if (busy) return;
  epoch++;
  busy = true;
  update();
  clearTimeout(polling);
  $("download").hidden = true;
  $("stats").hidden = true;
  disposeObject();
  object = null;
  $("empty").hidden = false;
  $("empty").querySelector("h3")!.textContent =
    "Hunyuan이 형상을 만들고 있습니다";
  $("empty").querySelector("p")!.textContent =
    "대기열과 처리 상황은 아래에 표시됩니다.";
  status("생성을 요청하고 있습니다…");
  try {
    const payload: Record<string, unknown> = {
      views: images,
      removeBackground: $<HTMLInputElement>("remove").checked,
      randomizeSeed: $<HTMLInputElement>("random").checked,
      includeColor: $<HTMLInputElement>("include-color").checked,
    };
    for (const key of ["steps", "guidance", "seed", "resolution", "chunks"])
      payload[key] = Number($<HTMLInputElement>(key).value);
    const response = await fetch("/api/hunyuan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "생성 요청에 실패했습니다.");
    await apply(data.job);
  } catch (error) {
    busy = false;
    update();
    $("badge").textContent = "실패";
    status(error instanceof Error ? error.message : "생성 요청 실패", true);
    $("empty").querySelector("h3")!.textContent = "생성 요청에 실패했습니다";
    $("empty").querySelector("p")!.textContent =
      "아래 이유를 확인하고 다시 시도해주세요.";
  }
});
window.addEventListener("pagehide", () => {
  epoch++;
  clearTimeout(polling);
  cancelAnimationFrame(frame);
  disposeObject();
  controls?.dispose();
  resizeObserver?.disconnect();
  renderer?.dispose();
});
void poll();
