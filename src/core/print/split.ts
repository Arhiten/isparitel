import type { CsgKernel, Solid } from "../geometry/csg";
import type { PrinterProfile } from "../settings/profiles";
import type { SplitParams } from "./types";

/**
 * Нарезка детали, не влезающей на стол, на секции со штифтами.
 *
 * TODO (модуль 4):
 *  1. fitOnBed(bbox) → число секций по осям.
 *  2. Плоскости реза: равномерно, затем сдвинуть так, чтобы рез не проходил через рабочие грани
 *     блока (для блока — резать по тыльной части или вдоль оси формы, а не поперёк профиля полости).
 *  3. splitByPlane по каждой плоскости.
 *  4. На каждой плоскости реза: 2–4 отверстия под штифты Ø (dowel + fitClearance) в обеих половинах,
 *     в зонах сечения, где до края и до полостей ≥ dowelEdgeMm (сетка точек → фильтр по расстоянию).
 *  5. Для кожуха вместо штифтов можно делать фланцы с болтами (решает модуль 3).
 *  6. Каждую секцию повернуть «большой плоской гранью вниз».
 */
export function splitForBed(
  _kernel: CsgKernel,
  _solid: Solid,
  _printer: PrinterProfile,
  _params: SplitParams,
): Solid[] {
  throw new Error("splitForBed: не реализовано. См. TODO в src/core/print/split.ts");
}
