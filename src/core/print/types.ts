import type { Mesh } from "../types";
import type { Vec3 } from "../geometry/csg";

/**
 * Модуль 4: подготовка к печати — размещение на столе, нарезка крупных деталей на секции
 * со штифтами, калибровка масштаба, экспорт.
 */

export interface PrintItem {
  id: string;
  label: string;
  mesh: Mesh;
  /** Предпочтительная грань вниз (из модуля 3), если есть. */
  preferredDown?: Vec3;
  /** Лицевая деталь (блок): ступеньки слоёв перейдут в силикон → гипс → керамику. */
  cosmetic: boolean;
}

export interface FitResult {
  fits: boolean;
  /** Габарит детали, мм, отсортированный по убыванию. */
  size: Vec3;
  /** Перестановка осей детали, при которой она влезает (индексы x,y,z детали → оси стола). */
  axisOrder?: [number, number, number];
  /** Сколько секций нужно по каждой оси детали, если не влезает. */
  sections: Vec3;
}

export interface SplitParams {
  /** Диаметр и длина штифтов-соединителей между секциями, мм. */
  dowelDiameterMm: number;
  dowelLengthMm: number;
  /** Минимальный отступ штифта от края и от полостей, мм. */
  dowelEdgeMm: number;
  /** Плоскость реза по возможности проводить вне лицевых (рабочих) граней. */
  avoidCosmeticFaces: boolean;
}

export const DEFAULT_SPLIT: SplitParams = {
  dowelDiameterMm: 6,
  dowelLengthMm: 16,
  dowelEdgeMm: 8,
  avoidCosmeticFaces: true,
};

export interface PrintJob {
  items: { id: string; label: string; mesh: Mesh; note?: string }[];
  warnings: string[];
}
