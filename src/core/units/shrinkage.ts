import type { ProfilePoint } from "../types";

/**
 * Усадка керамики.
 * Модель должна быть БОЛЬШЕ готового изделия: размер_модели = размер_готового / (1 − усадка).
 * Не путать с «× (1 + усадка)»: при 13% это даёт ошибку ~1.7%.
 */

/** Общая усадка из воздушной и огневой (в процентах): 1 − (1 − d)(1 − f). */
export function combineShrinkage(dryingPct: number, firingPct: number): number {
  return (1 - (1 - dryingPct / 100) * (1 - firingPct / 100)) * 100;
}

export function shrinkageFactor(totalPct: number): number {
  if (!(totalPct >= 0 && totalPct < 40)) throw new Error("Усадка должна быть в диапазоне 0–40%.");
  return 1 / (1 - totalPct / 100);
}

/**
 * Итоговый коэффициент масштабирования модели с учётом поправок оснастки.
 * Знак: положительный % — материал увеличивает размер отливки (компенсируем уменьшением модели).
 */
export interface ScaleChain {
  clayShrinkPct: number;
  /** Расширение гипса при схватывании, % (типично 0.1–0.3). Гипсовая полость получается больше. */
  plasterExpansionPct?: number;
  /** Линейная усадка силикона, % (платиновый ≈0.1, оловянный до 0.5–1). */
  siliconeShrinkPct?: number;
}

export function modelScale(chain: ScaleChain): number {
  let k = shrinkageFactor(chain.clayShrinkPct);
  // Гипс расширяется → полость больше модели → модель уменьшаем
  if (chain.plasterExpansionPct) k /= 1 + chain.plasterExpansionPct / 100;
  // Силикон садится → отливка в нём меньше мастера → мастер увеличиваем
  if (chain.siliconeShrinkPct) k /= 1 - chain.siliconeShrinkPct / 100;
  return k;
}

export function scalePoints(points: ProfilePoint[], k: number): ProfilePoint[] {
  return points.map((p) => ({ r: p.r * k, z: p.z * k }));
}
