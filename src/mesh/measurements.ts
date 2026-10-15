import { scaleMesh, type Mesh } from "./types.ts";
import type { Vec3 } from "../render/camera.ts";
export interface Measurement {
  readonly id: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly mm: number;
}
export function measurementScale(items: readonly Measurement[]) {
  const rows = items.map((item) => {
    if (
      !item.id ||
      !Array.isArray(item.a) ||
      !Array.isArray(item.b) ||
      item.a.length !== 3 ||
      item.b.length !== 3 ||
      ![...item.a, ...item.b, item.mm].every(Number.isFinite) ||
      item.mm <= 0
    )
      throw new Error("치수 구간과 양수 mm 값을 확인하세요.");
    const length = Math.hypot(
      item.a[0] - item.b[0],
      item.a[1] - item.b[1],
      item.a[2] - item.b[2],
    );
    if (length <= 1e-9)
      throw new Error("길이가 0인 치수 구간은 사용할 수 없습니다.");
    return { ...item, length };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new Error("치수 번호가 중복됐습니다.");
  const mmPerUnit = rows.length
    ? rows.reduce((s, r) => s + r.length * r.mm, 0) /
      rows.reduce((s, r) => s + r.length * r.length, 0)
    : null;
  return {
    mmPerUnit,
    unit: mmPerUnit === null ? ("relative" as const) : ("mm" as const),
    residuals: rows.map((r) => ({
      id: r.id,
      requestedMm: r.mm,
      actualMm: r.length * mmPerUnit!,
      residualMm: r.length * mmPerUnit! - r.mm,
    })),
  };
}
export function measuredExports(mesh: Mesh, items: readonly Measurement[]) {
  const fit = measurementScale(items),
    scale = fit.mmPerUnit;
  return {
    fit,
    glb:
      scale === null
        ? mesh
        : scaleMesh(mesh, [scale / 1000, scale / 1000, scale / 1000]),
    obj: scale === null ? mesh : scaleMesh(mesh, [scale, scale, scale]),
  };
}
