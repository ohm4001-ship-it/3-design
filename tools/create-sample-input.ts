/** Deterministic five-view inputs: every image is rendered from the same mesh. */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
  computeBounds,
  center,
  scaleMesh,
  type Mesh,
} from "../src/mesh/types.ts";
import { mergeMeshes, boxMesh } from "../src/mesh/primitives.ts";
import { writeGlb } from "../src/mesh/glb.ts";
import { renderToDirectory } from "../src/pipeline.ts";
import { renderCamera } from "../src/render/ortho.ts";
import {
  canonicalView,
  angleRotation,
  multiplyRotation,
} from "../src/render/camera.ts";
import { VIEW_IDS } from "../src/views.ts";
import { analyzeViewSet } from "../src/analyze/report.ts";

type Color = readonly [number, number, number];
function mesh(p: number[], indices: number[], color: Color): Mesh {
  const positions = Float32Array.from(p);
  const colors = new Float32Array(p.length);
  for (let i = 0; i < colors.length; i += 3) colors.set(color, i);
  return {
    positions,
    colors,
    indices: Uint32Array.from(indices),
    bounds: computeBounds(positions),
  };
}
function lathe(
  profile: readonly (readonly [number, number])[],
  color: Color,
): Mesh {
  const p: number[] = [],
    indices: number[] = [],
    segments = 96;
  for (const [radius, y] of profile) {
    for (let k = 0; k < segments; k++) {
      const angle = (k / segments) * Math.PI * 2;
      p.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let k = 0; k < segments; k++) {
      const a = j * segments + k,
        b = j * segments + ((k + 1) % segments);
      const c = a + segments,
        d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  }
  return mesh(p, indices, color);
}
function handle(): Mesh {
  const controls = [
    [0.43, 0.63],
    [0.72, 0.63],
    [0.9, 0.5],
    [0.98, 0.25],
    [0.98, -0.22],
    [0.89, -0.48],
    [0.7, -0.61],
    [0.43, -0.61],
  ];
  const path: number[][] = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[Math.max(0, i - 1)]!,
      b = controls[i]!,
      c = controls[i + 1]!,
      d = controls[Math.min(controls.length - 1, i + 2)]!;
    for (let s = 0; s < 12; s++) {
      const t = s / 12;
      path.push(
        [0, 1].map(
          (axis) =>
            0.5 *
            (2 * b[axis]! +
              (-a[axis]! + c[axis]!) * t +
              (2 * a[axis]! - 5 * b[axis]! + 4 * c[axis]! - d[axis]!) * t * t +
              (-a[axis]! + 3 * b[axis]! - 3 * c[axis]! + d[axis]!) * t * t * t),
        ),
      );
    }
  }
  path.push(controls.at(-1)!);
  const p: number[] = [],
    indices: number[] = [],
    sides = 20;
  for (let j = 0; j < path.length; j++) {
    const before = path[Math.max(0, j - 1)]!,
      after = path[Math.min(path.length - 1, j + 1)]!;
    const dx = after[0]! - before[0]!,
      dy = after[1]! - before[1]!,
      length = Math.hypot(dx, dy);
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      p.push(
        path[j]![0]! - (dy / length) * Math.cos(angle) * 0.095,
        path[j]![1]! + (dx / length) * Math.cos(angle) * 0.095,
        Math.sin(angle) * 0.085,
      );
    }
  }
  for (let j = 0; j < path.length - 1; j++) {
    for (let k = 0; k < sides; k++) {
      const a = j * sides + k,
        b = j * sides + ((k + 1) % sides),
        c = a + sides,
        d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  for (const end of [0, path.length - 1]) {
    const middle = p.length / 3;
    p.push(path[end]![0]!, path[end]![1]!, 0);
    for (let k = 0; k < sides; k++) {
      const a = end * sides + k,
        b = end * sides + ((k + 1) % sides);
      indices.push(...(end === 0 ? [middle, b, a] : [middle, a, b]));
    }
  }
  return mesh(p, indices, [0.12, 0.14, 0.16]);
}

const directory = resolve(process.argv[2] ?? "out-input-mug");
const standard = join(directory, "standard");
await mkdir(standard, { recursive: true });
const raw = center(
  mergeMeshes([
    lathe(
      [
        [0, -0.95],
        [0.37, -0.95],
        [0.41, -0.91],
        [0.42, -0.8],
        [0.43, -0.7],
        [0.46, -0.4],
        [0.49, 0],
        [0.5, 0.65],
        [0.5, 0.82],
        [0.48, 0.86],
        [0, 0.86],
      ],
      [0.9, 0.86, 0.75],
    ),
    lathe(
      [
        [0, 0.81],
        [0.49, 0.81],
        [0.51, 0.84],
        [0.51, 0.95],
        [0.48, 0.99],
        [0, 0.99],
      ],
      [0.72, 0.75, 0.77],
    ),
    lathe(
      [
        [0, 0.985],
        [0.26, 0.985],
        [0.27, 1.005],
        [0.24, 1.025],
        [0, 1.025],
      ],
      [0.32, 0.36, 0.38],
    ),
    lathe(
      [
        [0, -0.95],
        [0.38, -0.95],
        [0.405, -0.92],
        [0.41, -0.86],
        [0, -0.86],
      ],
      [0.42, 0.45, 0.46],
    ),
    handle(),
    boxMesh({
      size: [0.2, 0.05, 0.13],
      at: [0, 1.015, 0.34],
      color: [0.12, 0.14, 0.16],
    }),
  ]),
);
const longest = Math.max(
  ...raw.bounds.max.map((n, i) => n - raw.bounds.min[i]!),
);
const model = scaleMesh(raw, [1 / longest, 1 / longest, 1 / longest]);
await writeFile(join(directory, "initial.glb"), writeGlb(model));
const rendered = await renderToDirectory(model, standard, {
  size: 1024,
  margin: 0.1,
});
const report = await analyzeViewSet(rendered.paths);
await writeFile(
  join(directory, "input-check.json"),
  JSON.stringify(
    {
      synthetic: true,
      triangles: model.indices.length / 3,
      score: report.score,
      verdict: report.verdict,
      bounds: model.bounds,
      checks: report.checks,
    },
    null,
    2,
  ),
);
const camera = canonicalView("front", 768, 768, 610);
const perspectivePreview = renderCamera(
  model,
  "front",
  {
    ...camera,
    camera: {
      ...camera.camera,
      rotation: multiplyRotation(
        angleRotation(-28, 18, 0),
        camera.camera.rotation,
      ),
    },
  },
  768,
);
await sharp(perspectivePreview.pixels, {
  raw: { width: 768, height: 768, channels: 4 },
})
  .png()
  .toFile(join(directory, "preview.png"));
const labels: Record<string, string> = {
  front: "FRONT",
  back: "BACK",
  left: "LEFT",
  right: "RIGHT",
  top: "TOP",
};
const cards = await Promise.all(
  VIEW_IDS.map(async (id, index) => {
    const x = 24 + index * 280;
    const image = (await readFile(rendered.paths[id]!)).toString("base64");
    return `<rect x="${x}" y="66" width="264" height="300" rx="14" fill="#fff"/><text x="${x + 20}" y="98" fill="#243244" font-size="18">${labels[id]}</text><image href="data:image/png;base64,${image}" x="${x + 6}" y="106" width="252" height="252"/>`;
  }),
);
await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="392"><rect width="1440" height="392" fill="#edf1f5"/><text x="24" y="40" font-family="sans-serif" font-size="22" fill="#243244">CONSISTENT MUG INPUTS / SYNTHETIC 3D RENDERS</text><g font-family="sans-serif">${cards.join("")}</g></svg>`,
  ),
)
  .png()
  .toFile(join(directory, "five-views.png"));
await writeFile(
  join(directory, "recommended-settings.json"),
  JSON.stringify(
    {
      kind: "reference",
      method: "silhouette",
      resolution: 128,
      symmetry: false,
      rounding: 0,
      smoothing: 8,
    },
    null,
    2,
  ),
);
await writeFile(
  join(directory, "README.md"),
  `# 컵 테스트 입력 세트

실제 촬영 사진이 아니라 동일한 3D 컵을 다섯 방향에서 렌더링한 합성 입력입니다. Hunyuan이 만든 이미지나 3D가 아닙니다. 상표·로고는 없습니다.

## 사이트에 넣는 방법
1. 사진 전체 관리에서 standard/front.png → front, back.png → back, left.png → left, right.png → right, top.png → top에 각각 넣습니다.
2. 입력 종류: 정투영 참조. 물체 종류: 자동차 · 제품 · 기계.
3. 고급 설정: 해상도 128, 좌우 대칭 끄기, 곡면 보정 0, 스무딩 8.
4. 3D 생성을 실행합니다. 이 경로는 외부 AI 호출 없이 기본 생성 기능을 시험합니다.

## 초기 모델·AI 입력
- initial.glb는 사진 모드의 초기 GLB 가져오기에서 사용할 수 있습니다. 이미지와 정확히 같은 원본 형상이며 긴 축을 1로 정규화했습니다. 초기 모델을 가져오는 것은 AI 생성이 아닙니다.
- Hunyuan AI를 시험하려면 같은 다섯 이미지와 캐릭터 프리셋을 사용할 수 있지만, 품질 비교 시 외부 공급자가 실제로 성공했는지 결과 설명을 확인하세요. AI 실패 후 실루엣 결과를 AI 성공으로 판단하면 안 됩니다.
- Hunyuan의 외부 화면에 직접 넣을 때 좌우 이름은 이 앱과 다를 수 있습니다. 이 앱은 내부에서 공급자 좌우를 변환합니다.
- preview.png와 five-views.png는 확인용입니다. 다섯 입력 슬롯에는 standard 폴더의 PNG만 넣으세요.
- 실측 치수는 필수가 아니며 이 합성 컵에 대한 실제 측정값은 없습니다.

이 세트는 축·업로드·형상 흐름을 점검하기 위한 기준 입력입니다. 실제 촬영 사진의 원근·반사·가림 문제를 검증하는 자료는 아닙니다.
`,
  "utf8",
);
console.log(
  JSON.stringify({
    directory,
    triangles: model.indices.length / 3,
    score: report.score,
    verdict: report.verdict,
  }),
);
