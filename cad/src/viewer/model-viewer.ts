import {
  ACESFilmicToneMapping,
  AxesHelper,
  Box3,
  Box3Helper,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  Raycaster,
  Vector2,
  Texture,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AiModelDescriptor } from "../cad/ai/aiAdapter";
import type { Vec3 } from "../../../src/render/camera.ts";
/**
 * Look-around viewer for generated models. Everything here is display: the
 * asset is shown in its own Y-up frame (sixview and glTF agree, and so does
 * three.js), recentred on the ground and scaled so its longest side is `SIZE`,
 * so a flat car and a tall figure frame alike. Colour comes from the asset: a
 * GLB's texture or vertex colours, or an OBJ's per-vertex colours.
 *
 * The ground carries the input frame — FRONT at +Z, BACK at -Z, LEFT at -X
 * (where the `left` view's camera stands), RIGHT at +X — so any orbit, including
 * straight down, shows which way the model faces.
 */
export type PickMode = "inspect" | "point" | "brush-add" | "brush-remove";
export interface OverlayGroup {
  readonly points: readonly Vec3[];
  readonly label: string;
  readonly line?: boolean;
  readonly closed?: boolean;
  readonly region?: boolean;
  readonly probe?: boolean;
}
export interface ViewerOptions {
  readonly onPick?: (point: Vec3, remove: boolean) => void;
  readonly onStatus?: (message: string) => void;
  readonly onRotation?: (active: boolean) => void;
}
export function mountModelViewer(
  host: HTMLElement,
  options: ViewerOptions = {},
) {
  const SIZE = 2;
  const canvas = document.createElement("canvas");
  canvas.className = "model-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "3D 모델. 선택 중 방향키로 커서 이동, Enter로 점 선택, Tab으로 나가기. 관찰 중 방향키로 시점 조절, 더하기·빼기로 확대 축소.",
  );
  const status = document.createElement("p");
  status.className = "model-status";
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.classList.add("model-overlay");
  overlay.setAttribute("aria-hidden", "true");
  host.append(canvas, overlay, status);
  let disposed = false,
    sequence = 0,
    loading = false,
    abort: AbortController | null = null;
  let annotation: Object3D | null = null,
    mode: PickMode = "inspect",
    brush = 24;
  const regionLayer = new Group();
  let overlays: readonly OverlayGroup[] = [],
    cursor = { x: 0.5, y: 0.5 };
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  // Environment + key light already sum past 1 on a white albedo; this keeps white
  // subjects (a white character body) from clipping to a flat, shapeless white.
  renderer.toneMappingExposure = 0.8;
  const scene = new Scene();
  scene.add(regionLayer);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  const key = new DirectionalLight(new Color("#ffffff"), 0.9);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  scene.add(contactShadow());
  scene.add(directionMarkers());
  const camera = new PerspectiveCamera(35, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = !query.matches;
  controls.autoRotateSpeed = 1.5;
  const stage = new Group();
  scene.add(stage);
  /** Camera offsets per preset, in units of `SIZE`; the orbit target is the model centre. */
  const PRESETS: Record<string, readonly [number, number, number]> = {
    front: [0, 0.35, 2.2],
    back: [0, 0.35, -2.2],
    left: [-2.2, 0.35, 0],
    right: [2.2, 0.35, 0],
    // A hair of +Z keeps OrbitControls off its pole; FRONT then sits at the bottom of the screen.
    top: [0, 2.4, 0.001],
  };
  /** Height of the loaded model's centre above the ground; the orbit target and every preset aim at it. */
  let focusY = SIZE * 0.25;
  function frame(
    preset: readonly [number, number, number] = [1.3, 0.8, 1.9],
  ): void {
    camera.position.set(
      preset[0] * SIZE,
      focusY + (preset[1] - 0.25) * SIZE,
      preset[2] * SIZE,
    );
    controls.target.set(0, focusY, 0);
    controls.update();
  }
  /** Flat text label lying on the ground plane, readable from the default camera. */
  function groundLabel(text: string, colour: string): Mesh {
    const paint = document.createElement("canvas");
    paint.width = 256;
    paint.height = 64;
    const context = paint.getContext("2d");
    if (context) {
      context.font = "bold 40px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = colour;
      context.fillText(text, 128, 34);
    }
    const label = new Mesh(
      new PlaneGeometry(SIZE * 0.36, SIZE * 0.09),
      new MeshBasicMaterial({
        map: new CanvasTexture(paint),
        transparent: true,
        depthWrite: false,
      }),
    );
    label.rotation.x = -Math.PI / 2;
    return label;
  }
  /** FRONT/BACK/LEFT/RIGHT on the ground plus an arrow toward FRONT, fixed in the input frame. */
  function directionMarkers(): Group {
    const markers = new Group();
    const reach = SIZE * 0.68;
    const place = (label: Mesh, x: number, z: number): void => {
      label.position.set(x, 0.002, z);
      markers.add(label);
    };
    place(groundLabel("FRONT", "#fbbf24"), 0, reach);
    place(groundLabel("BACK", "#9aa3b2"), 0, -reach);
    place(groundLabel("LEFT", "#9aa3b2"), -reach, 0);
    place(groundLabel("RIGHT", "#9aa3b2"), reach, 0);
    const arrowPaint = document.createElement("canvas");
    arrowPaint.width = arrowPaint.height = 64;
    const context = arrowPaint.getContext("2d");
    if (context) {
      context.fillStyle = "#fbbf24";
      context.beginPath();
      context.moveTo(32, 60);
      context.lineTo(8, 20);
      context.lineTo(56, 20);
      context.closePath();
      context.fill();
    }
    const arrow = new Mesh(
      new PlaneGeometry(SIZE * 0.1, SIZE * 0.1),
      new MeshBasicMaterial({
        map: new CanvasTexture(arrowPaint),
        transparent: true,
        depthWrite: false,
      }),
    );
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.002, reach - SIZE * 0.11);
    markers.add(arrow);
    return markers;
  }
  function resize(): void {
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  /** Soft radial blob under the model: grounds it without a shadow-map pass. */
  function contactShadow(): Mesh {
    const size = 128;
    const paint = document.createElement("canvas");
    paint.width = paint.height = size;
    const context = paint.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0.35)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    const plane = new Mesh(
      new PlaneGeometry(SIZE * 1.4, SIZE * 1.4),
      new MeshBasicMaterial({
        map: new CanvasTexture(paint),
        transparent: true,
        depthWrite: false,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    return plane;
  }
  /**
   * OBJ output carries colour per vertex and repeats vertices per face; welding
   * them gives smooth normals, so the surface shades as a surface instead of as
   * faceted clay.
   */
  function smoothVertexColoured(root: Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const geometry: BufferGeometry = child.geometry;
      const hasColor = geometry.getAttribute("color") !== undefined;
      geometry.deleteAttribute("normal");
      const welded = mergeVertices(geometry, 1e-5);
      welded.computeVertexNormals();
      geometry.dispose();
      const old = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const m of old) m.dispose();
      child.geometry = welded;
      child.material = new MeshStandardMaterial({
        vertexColors: hasColor,
        roughness: 0.55,
        metalness: 0,
      });
    });
  }
  /** Faces meeting at less than this share a normal; sharper edges (wing tips, tyre walls) stay crisp. */
  const CREASE_ANGLE = (50 * Math.PI) / 180;
  /**
   * Generated GLBs (TRELLIS) ship positions and UVs but no normals, so GLTFLoader
   * falls back to flat shading and every triangle shows. They also omit
   * `metallicFactor`, whose glTF default of 1 turns the texture into dark metal,
   * and pin roughness to 1. Creased normals plus a dielectric, semi-gloss
   * material show the surface as painted instead of as faceted clay.
   */
  function smoothGeneratedGlb(root: Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const geometry: BufferGeometry = child.geometry;
      if (geometry.getAttribute("normal") !== undefined) return;
      child.geometry = toCreasedNormals(geometry, CREASE_ANGLE);
      geometry.dispose();
      const materials: Material[] = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.flatShading = false;
        if (!material.metalnessMap) material.metalness = 0;
        if (!material.roughnessMap) material.roughness = 0.45;
        material.needsUpdate = true;
      }
    });
  }
  function dispose(root: Object3D): void {
    const freed = new Set<unknown>();
    root.traverse((child) => {
      const node = child as Mesh;
      if (node.geometry && !freed.has(node.geometry)) {
        node.geometry.dispose();
        freed.add(node.geometry);
      }
      for (const material of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : []) {
        for (const value of Object.values(material))
          if (value instanceof Texture && !freed.has(value)) {
            value.dispose();
            freed.add(value);
          }
        if (!freed.has(material)) {
          material.dispose();
          freed.add(material);
        }
      }
    });
  }
  function clearAnnotation() {
    annotation?.traverse((child) => {
      if (child instanceof Mesh) child.geometry.dispose();
    });
    annotation = null;
    pickedFaces.clear();
    regionKey = "";
    for (const child of [...regionLayer.children]) {
      regionLayer.remove(child);
      dispose(child);
    }
  }
  async function load(model: AiModelDescriptor): Promise<void> {
    const token = ++sequence;
    abort?.abort();
    abort = new AbortController();
    loading = true;
    stage.visible = false;
    regionLayer.visible = false;
    const asset = model.asset;
    if (!asset?.url) throw new Error(`${model.name}: 3D 파일이 없습니다`);
    status!.textContent = `${model.name} 불러오는 중…`;
    const response = await fetch(asset.url, {
      signal: abort.signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("모델을 읽지 못했습니다 (" + response.status + ")");
    const buffer = await response.arrayBuffer();
    let root: Object3D;
    if (asset.format === "glb" || asset.format === "gltf") {
      root = (await new GLTFLoader().parseAsync(buffer, "")).scene;
    } else if (asset.format === "obj") {
      root = new OBJLoader().parse(new TextDecoder().decode(buffer));
    } else {
      throw new Error(
        `${model.name}: 뷰어가 읽지 못하는 형식 (${asset.format})`,
      );
    }
    if (disposed || token !== sequence) {
      dispose(root);
      return;
    }
    clearAnnotation();
    annotation = root.clone(true);
    annotation.traverse((child) => {
      if (child instanceof Mesh) child.geometry = child.geometry.clone();
    });
    if (asset.format === "obj") smoothVertexColoured(root);
    else smoothGeneratedGlb(root);
    // Longest side to SIZE, centred over the origin, resting on the ground plane.
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const scale = SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(scale);
    const centre = box.getCenter(new Vector3());
    root.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
    annotation.scale.copy(root.scale);
    annotation.position.copy(root.position);
    annotation.updateMatrixWorld(true);
    focusY = (size.y * scale) / 2;
    for (const previous of [...stage.children]) {
      stage.remove(previous);
      dispose(previous);
    }
    stage.add(root);
    current = { id: model.id, root };
    stage.visible = true;
    regionLayer.visible = true;
    loading = false;
    applyDisplay();
    frame();
    status!.textContent = `${model.name} · ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`;
    options.onStatus?.(status.textContent);
  }
  /** Display toggles; they restyle whatever is loaded and survive switching models. */
  const display = { wireframe: false, flat: false, bbox: false };
  let current: {
    id: string;
    root: Object3D;
  } | null = null;
  const bboxHelper = new Box3Helper(new Box3(), new Color("#fbbf24"));
  bboxHelper.visible = false;
  scene.add(bboxHelper);
  function applyDisplay(): void {
    if (!current) return;
    current.root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials: Material[] = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.wireframe = display.wireframe;
        material.flatShading = display.flat;
        material.needsUpdate = true;
      }
    });
    current.root.updateWorldMatrix(true, true);
    bboxHelper.box.setFromObject(current.root);
    bboxHelper.visible = display.bbox;
  }
  /** XYZ gizmo at the ground centre: red +X (object right), green +Y (up), blue +Z (front). */
  function axesGizmo(): Group {
    const gizmo = new Group();
    const length = SIZE * 0.45;
    gizmo.add(new AxesHelper(length));
    const labels: Array<[string, string, Vector3]> = [
      ["+X", "#f87171", new Vector3(length * 1.08, 0, 0)],
      ["+Y", "#4ade80", new Vector3(0, length * 1.08, 0)],
      ["+Z", "#60a5fa", new Vector3(0, 0, length * 1.08)],
    ];
    for (const [text, colour, at] of labels) {
      const paint = document.createElement("canvas");
      paint.width = paint.height = 64;
      const context = paint.getContext("2d");
      if (context) {
        context.font = "bold 34px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = colour;
        context.fillText(text, 32, 34);
      }
      const sprite = new Sprite(
        new SpriteMaterial({ map: new CanvasTexture(paint), depthTest: false }),
      );
      sprite.scale.setScalar(SIZE * 0.08);
      sprite.position.copy(at);
      gizmo.add(sprite);
    }
    return gizmo;
  }
  const gizmo = axesGizmo();
  scene.add(gizmo);
  function showError(error: unknown) {
    if (disposed) return;
    loading = false;
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = message;
    options.onStatus?.(message);
  }
  const raycaster = new Raycaster();
  const pickedFaces = new Map<string, Vector3[]>();
  const pointKey = (p: Vec3) => p.map((v) => v.toFixed(7)).join(",");
  function hit(x: number, y: number): Vec3 | null {
    if (!annotation || loading) return null;
    raycaster.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), camera);
    const pick = raycaster.intersectObject(annotation, true)[0];
    if (!pick) return null;
    const point = annotation.worldToLocal(pick.point.clone()),
      result: Vec3 = [point.x, point.y, point.z];
    if (pick.face && pick.object instanceof Mesh) {
      const positions = pick.object.geometry.getAttribute("position");
      pickedFaces.set(
        pointKey(result),
        [pick.face.a, pick.face.b, pick.face.c].map((i) =>
          annotation!.worldToLocal(
            pick.object.localToWorld(
              new Vector3().fromBufferAttribute(positions, i),
            ),
          ),
        ),
      );
      if (pickedFaces.size > 4096)
        pickedFaces.delete(pickedFaces.keys().next().value!);
    }
    return result;
  }
  function pick() {
    if (mode === "inspect" || loading) return;
    const offsets = mode.startsWith("brush") ? [-brush / 2, 0, brush / 2] : [0];
    let count = 0;
    for (const dx of offsets)
      for (const dy of offsets) {
        const point = hit(
          cursor.x + dx / Math.max(1, canvas.clientWidth),
          cursor.y + dy / Math.max(1, canvas.clientHeight),
        );
        if (point) {
          options.onPick?.(point, mode === "brush-remove");
          count++;
        }
      }
    status.textContent = count
      ? "선택 후보를 확인하고 도구에서 등록하세요."
      : "선택한 위치에 초기 모델의 표면이 없습니다.";
    options.onStatus?.(status.textContent);
  }
  function pointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    cursor = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }
  const down = (event: PointerEvent) => {
    if (mode === "inspect") return;
    event.preventDefault();
    canvas.focus();
    pointer(event);
    canvas.setPointerCapture(event.pointerId);
    pick();
  };
  const move = (event: PointerEvent) => {
    pointer(event);
    if (event.buttons & 1 && mode.startsWith("brush")) pick();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Tab") return;
    if (event.key === "Enter" && mode !== "inspect") {
      event.preventDefault();
      pick();
      return;
    }
    const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (mode !== "inspect" && arrows.includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 20 : 5;
      cursor.x = Math.max(
        0,
        Math.min(
          1,
          cursor.x +
            (event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0) /
              Math.max(1, canvas.clientWidth),
        ),
      );
      cursor.y = Math.max(
        0,
        Math.min(
          1,
          cursor.y +
            (event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0) /
              Math.max(1, canvas.clientHeight),
        ),
      );
      return;
    }
    if (
      mode === "inspect" &&
      (arrows.includes(event.key) || event.key === "+" || event.key === "-")
    ) {
      event.preventDefault();
      controls.autoRotate = false;
      options.onRotation?.(false);
      const offset = camera.position.clone().sub(controls.target);
      if (event.key === "+" || event.key === "-")
        offset.multiplyScalar(event.key === "+" ? 0.9 : 1.1);
      else {
        const horizontal =
          event.key === "ArrowLeft" || event.key === "ArrowRight";
        const axis = horizontal
          ? new Vector3(0, 1, 0)
          : new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        offset.applyAxisAngle(
          axis,
          ((event.key === "ArrowLeft" || event.key === "ArrowUp" ? 1 : -1) *
            Math.PI) /
            36,
        );
      }
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("keydown", keyboard);
  const preference = () => {
    if (query.matches) {
      controls.autoRotate = false;
      options.onRotation?.(false);
    }
  };
  query.addEventListener("change", preference);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function element(name: string, attributes: Record<string, string>) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attributes)) el.setAttribute(k, v);
    return el;
  }
  let lastOverlayKey = "",
    overlayVersion = 0;
  let regionKey = "",
    pendingRegionFaces = false;
  /** Surface patches are clipped to the picked triangle and depth-tested by WebGL. */
  function updateRegions() {
    if (!annotation) return;
    const key =
      overlays
        .filter((g) => g.region)
        .map((g) => g.points.map(pointKey).join(";"))
        .join("|") +
      (pendingRegionFaces ? camera.matrixWorld.elements.join(",") : "");
    if (key === regionKey) return;
    regionKey = key;
    pendingRegionFaces = false;
    for (const child of [...regionLayer.children]) {
      regionLayer.remove(child);
      dispose(child);
    }
    const box = new Box3().setFromObject(annotation),
      radius = box.getSize(new Vector3()).length() * 0.006;
    const vertices: number[] = [];
    for (const group of overlays.filter((g) => g.region))
      for (const p of group.points) {
        const world = annotation.localToWorld(new Vector3(...p));
        let face = pickedFaces.get(pointKey(p));
        if (!face) {
          // Restored anchors are located once. Hidden anchors wait until visible.
          const projected = world.clone().project(camera);
          const found = hit((projected.x + 1) / 2, (1 - projected.y) / 2);
          if (
            found &&
            new Vector3(...found).distanceTo(new Vector3(...p)) < radius
          )
            face = pickedFaces.get(pointKey(found));
        }
        if (!face) {
          pendingRegionFaces = true;
          continue;
        }
        const [a, b, c] = face.map((v) =>
          annotation!.localToWorld(v.clone()),
        ) as [Vector3, Vector3, Vector3];
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(),
          u = b.clone().sub(a).normalize(),
          v = normal.clone().cross(u);
        let polygon = Array.from({ length: 12 }, (_, i) =>
          world
            .clone()
            .addScaledVector(u, Math.cos((i * Math.PI) / 6) * radius)
            .addScaledVector(v, Math.sin((i * Math.PI) / 6) * radius),
        );
        for (const [from, to] of [
          [a, b],
          [b, c],
          [c, a],
        ] as const) {
          const edge = to.clone().sub(from),
            distance = (q: Vector3) =>
              edge.clone().cross(q.clone().sub(from)).dot(normal),
            input = polygon;
          polygon = [];
          for (let i = 0; i < input.length; i++) {
            const first = input[i]!,
              second = input[(i + 1) % input.length]!,
              d1 = distance(first),
              d2 = distance(second);
            if (d1 >= 0) polygon.push(first);
            if (d1 >= 0 !== d2 >= 0)
              polygon.push(first.clone().lerp(second, d1 / (d1 - d2)));
          }
        }
        for (let i = 1; i + 1 < polygon.length; i++)
          for (const q of [polygon[0]!, polygon[i]!, polygon[i + 1]!])
            vertices.push(q.x, q.y, q.z);
      }
    if (vertices.length) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(vertices, 3),
      );
      regionLayer.add(
        new Mesh(
          geometry,
          new MeshBasicMaterial({
            color: "#60a5fa",
            side: DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        ),
      );
    }
  }
  function drawOverlay() {
    const key =
      camera.matrixWorld.elements.join(",") +
      ":" +
      host.clientWidth +
      ":" +
      host.clientHeight +
      ":" +
      mode +
      ":" +
      brush +
      ":" +
      cursor.x +
      ":" +
      cursor.y +
      ":" +
      overlayVersion;
    if (key === lastOverlayKey) return;
    lastOverlayKey = key;
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    overlay.setAttribute("viewBox", "0 0 " + width + " " + height);
    overlay.replaceChildren();
    if (annotation)
      for (const group of overlays) {
        const selected = group.region ? group.points.slice(0, 1) : group.points;
        const points = selected.map((p) => {
          const world = annotation!.localToWorld(new Vector3(...p)),
            v = world.clone().project(camera);
          let visible = v.z >= -1 && v.z <= 1;
          if (visible && !group.probe) {
            raycaster.setFromCamera(new Vector2(v.x, v.y), camera);
            const first = raycaster.intersectObject(annotation!, true)[0];
            visible = !!first && first.point.distanceTo(world) < SIZE * 0.007;
          }
          return {
            x: ((v.x + 1) / 2) * width,
            y: ((1 - v.y) / 2) * height,
            visible,
          };
        });
        if (group.line && points.length > 1) {
          for (let i = 0; i < points.length - (group.closed ? 0 : 1); i++) {
            const a = points[i]!,
              b = points[(i + 1) % points.length]!;
            if (!a.visible || !b.visible) continue;
            for (const [color, stroke] of [
              ["#111827", "6"],
              ["#ffffff", "3"],
            ])
              overlay.append(
                element("line", {
                  x1: String(a.x),
                  y1: String(a.y),
                  x2: String(b.x),
                  y2: String(b.y),
                  stroke: color!,
                  "stroke-width": stroke!,
                }),
              );
          }
        }
        points.forEach((p, i) => {
          if (!p.visible) return;
          overlay.append(
            element("circle", {
              cx: String(p.x),
              cy: String(p.y),
              r: "6",
              fill: "#60a5fa",
              stroke: "#ffffff",
              "stroke-width": "2",
            }),
            element("circle", {
              cx: String(p.x),
              cy: String(p.y),
              r: "8",
              fill: "none",
              stroke: "#111827",
              "stroke-width": "2",
            }),
          );
          const text =
            group.label + (group.points.length > 1 ? " " + (i + 1) : "");
          overlay.append(
            element("rect", {
              x: String(p.x + 9),
              y: String(p.y - 20),
              width: String(Math.max(28, text.length * 11)),
              height: "24",
              rx: "3",
              fill: "#0f1115",
              stroke: "#ffffff",
            }),
          );
          const label = element("text", {
            x: String(p.x + 13),
            y: String(p.y - 3),
            fill: "#ffffff",
            "font-size": "16",
          });
          label.textContent = text;
          overlay.append(label);
        });
      }
    updateRegions();
    if (mode !== "inspect")
      for (const [color, stroke] of [
        ["#111827", "5"],
        ["#ffffff", "2"],
      ])
        overlay.append(
          element("circle", {
            cx: String(cursor.x * width),
            cy: String(cursor.y * height),
            r: String(mode.startsWith("brush") ? brush / 2 : 11),
            fill: "none",
            stroke: color!,
            "stroke-width": stroke!,
          }),
        );
  }
  resize();
  frame();
  renderer.setAnimationLoop(() => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    drawOverlay();
  });
  let modelKey = "";
  return {
    async setModel(model: AiModelDescriptor | null) {
      const key = model?.asset?.url ?? "";
      if (key === modelKey) return;
      modelKey = key;
      if (!model) {
        ++sequence;
        abort?.abort();
        clearAnnotation();
        for (const child of [...stage.children]) {
          stage.remove(child);
          dispose(child);
        }
        current = null;
        status.textContent = "초기 3D 모델을 가져오거나 생성하세요.";
        return;
      }
      canvas.setAttribute(
        "aria-label",
        model.name +
          ". 선택 중 방향키와 Enter로 점 선택, Tab으로 나가기. 관찰 중 방향키로 시점 조절, 더하기·빼기로 확대 축소.",
      );
      try {
        await load(model);
      } catch (error) {
        if (
          !disposed &&
          key === modelKey &&
          (error as Error).name !== "AbortError"
        ) {
          modelKey = "";
          showError(error);
        }
      }
    },
    setMode(next: PickMode) {
      mode = next;
      controls.enabled = next === "inspect";
      if (next !== "inspect") controls.autoRotate = false;
      options.onRotation?.(controls.autoRotate);
    },
    setBrush(value: number) {
      brush = Number.isFinite(value) ? Math.max(8, Math.min(96, value)) : 24;
    },
    setOverlays(value: readonly OverlayGroup[]) {
      overlays = value;
      overlayVersion++;
    },
    rotation() {
      return controls.autoRotate;
    },
    toggleRotation() {
      if (mode === "inspect") controls.autoRotate = !controls.autoRotate;
      options.onRotation?.(controls.autoRotate);
      return controls.autoRotate;
    },
    preset(name: string) {
      controls.autoRotate = false;
      options.onRotation?.(false);
      frame(PRESETS[name]);
    },
    reset() {
      frame();
    },
    toggle(key: "wireframe" | "flat" | "bbox" | "axes") {
      if (key === "axes") {
        gizmo.visible = !gizmo.visible;
        return gizmo.visible;
      }
      display[key] = !display[key];
      applyDisplay();
      return display[key];
    },
    direction(): Vec3 | null {
      if (!annotation) return null;
      annotation.updateMatrixWorld(true);
      const d = camera
        .getWorldDirection(new Vector3())
        .transformDirection(annotation.matrixWorld.clone().invert())
        .normalize();
      return [d.x, d.y, d.z];
    },
    cursor() {
      const p = hit(cursor.x, cursor.y);
      return p
        ? "현재 표면 후보: " + p.map((v) => v.toFixed(4)).join(", ")
        : "현재 커서에 표면이 없습니다.";
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++sequence;
      abort?.abort();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      query.removeEventListener("change", preference);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("keydown", keyboard);
      clearAnnotation();
      controls.dispose();
      dispose(scene);
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
      overlay.remove();
      status.remove();
    },
  };
}
export type ModelViewer = ReturnType<typeof mountModelViewer>;
