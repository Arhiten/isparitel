import type { Vec3 } from "../geometry/csg";
import type { MoldPartId, MoldPlan } from "../mold/types";
import { profileVolume } from "../mesh/validate";
import type { CaseParams } from "./types";
import { CASE_FREEBOARD_MM } from "./build";

/**
 * Предварительная оценка частей формы, кейсов и кожухов — без CSG, из плана формы.
 * Объём гипса считается точно (блок − полость), без учёта замков и пазов (их вклад < 1%).
 * Силикон и кожух — для прямоугольного кожуха (housing = "box"); контурный кожух даст меньше силикона.
 * Нужна, чтобы шаг «Материалы» и проверка стола работали сразу после шага 1.
 */

export interface PrintPiece {
  label: string;
  /** Габарит детали, мм. */
  size: Vec3;
  count: number;
}

export interface PartEstimate {
  id: MoldPartId;
  label: string;
  /** Объём гипса в части, см³. */
  plasterCm3: number;
  /** Габарит части, уложенной тыльной гранью вниз: длина, ширина, высота, мм. */
  placed: Vec3;
  /** Внутренний объём кожуха, мм: длина, ширина, высота заливки. */
  housingInner: Vec3;
  /** Силикон на кейс этой части, см³. */
  siliconeCm3: number;
  printPieces: PrintPiece[];
}

export interface MoldEstimate {
  parts: PartEstimate[];
  cavityCm3: number;
  plasterCm3: number;
  siliconeCm3: number;
}

export function estimateMoldSet(plan: MoldPlan, cp: CaseParams): MoldEstimate {
  const { halfWidth: W, zMin, zMax, shape } = plan.block;
  const area = shape === "box" ? 4 * W * W : Math.PI * W * W;
  const cavity = profileVolume(plan.cavityProfile); // мм³, вся полость выше z = 0
  const s = cp.siliconeMm;
  const w = cp.wallMm;
  const f = cp.flangeMm;

  const parts: { id: MoldPartId; label: string; plaster: number; placed: Vec3 }[] = [];
  if (plan.scheme === "one-piece") {
    parts.push({ id: "whole", label: "Форма целиком", plaster: area * (zMax - zMin) - cavity, placed: [2 * W, 2 * W, zMax - zMin] });
  } else {
    const split = plan.baseSplitZ ?? 0;
    const upper = area * (zMax - split) - cavity;
    // Выступы замков (на боковине A и на дне) поднимают блок, а с ним и уровень силикона
    const keyH = plan.keys.length ? Math.max(...plan.keys.map((k) => k.depthMm)) : 0;
    // Боковина укладывается наружной гранью вниз: длина = ширина блока, ширина = высота, высота = W
    parts.push({ id: "side-a", label: "Боковина A", plaster: upper / 2, placed: [2 * W, zMax - split, W + keyH] });
    parts.push({ id: "side-b", label: "Боковина B", plaster: upper / 2, placed: [2 * W, zMax - split, W] });
    parts.push({ id: "base", label: "Дно", plaster: area * (split - zMin), placed: [2 * W, 2 * W, split - zMin + keyH] });
  }

  const out: PartEstimate[] = parts.map((p) => {
    const [L, D, H] = p.placed;
    const inner: Vec3 = [L + 2 * s, D + 2 * s, H + s];
    const silicone = inner[0] * inner[1] * inner[2] - p.plaster;
    const pieces: PrintPiece[] = [
      { label: "Блок — копия части формы", size: [L, D, H], count: 1 },
      { label: "Основание кожуха", size: [inner[0] + 2 * w + 2 * f, inner[1] + 2 * w + 2 * f, w], count: 1 },
    ];
    // Размеры как в build.ts: длинные стенки перекрывают углы и несут ушки, короткие стоят между ними
    const wallH = inner[2] + CASE_FREEBOARD_MM;
    if (cp.wallPieces === 4) {
      pieces.push({ label: "Стенка длинная", size: [inner[0] + 2 * w + 2 * f, wallH, w + f], count: 2 });
      pieces.push({ label: "Стенка короткая", size: [inner[1], wallH, w + f], count: 2 });
    } else {
      pieces.push({ label: "Стенка угловая (Г)", size: [inner[0] + 2 * w + 2 * f, inner[1] + w + f, wallH], count: 2 });
    }
    return {
      id: p.id,
      label: p.label,
      plasterCm3: p.plaster / 1000,
      placed: p.placed,
      housingInner: inner,
      siliconeCm3: silicone / 1000,
      printPieces: pieces,
    };
  });

  return {
    parts: out,
    cavityCm3: cavity / 1000,
    plasterCm3: out.reduce((a, p) => a + p.plasterCm3, 0),
    siliconeCm3: out.reduce((a, p) => a + p.siliconeCm3, 0),
  };
}
