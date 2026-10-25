/**
 * Профили материалов и оборудования. Пользователь сохраняет свои («моя глина», «мой принтер»),
 * в UI они хранятся в localStorage, в проекте — копией внутри ProjectState.
 * Значения по умолчанию — типичные ориентиры, а не истина: их надо уточнять пробной отливкой.
 */

export interface ClayProfile {
  name: string;
  /** Общая линейная усадка (сушка + обжиг), %. */
  totalShrinkPct: number;
  /** Плотность шликера, г/см³ (типично 1.70–1.80). */
  slipDensity: number;
  /** Ориентировочная скорость набора стенки, мм за 10 минут (зависит от гипса и шликера). */
  wallBuildMmPer10Min?: number;
}

export interface PlasterProfile {
  name: string;
  /** Консистенция: частей воды на 100 частей гипса по массе (формовочный гипс: 65–80). */
  waterPer100: number;
  /** Истинная плотность сухого гипсового порошка, г/см³. */
  powderDensity: number;
  /** Линейное расширение при схватывании, %. */
  expansionPct: number;
}

export interface SiliconeProfile {
  name: string;
  kind: "platinum" | "tin";
  shoreA: number;
  density: number; // г/см³
  linearShrinkPct: number;
  /** Запас на потери в стакане, на миксере, на литник, %. */
  wastePct: number;
}

export interface PrinterProfile {
  name: string;
  process: "fdm" | "resin";
  bed: { x: number; y: number; z: number }; // мм
  /** Зазор для сопрягаемых деталей (штифт в отверстие, паз), мм на сторону. */
  fitClearanceMm: number;
  /** Минимальная надёжная стенка, мм. */
  minWallMm: number;
  /** Калибровочные коэффициенты масштаба по осям (1 = без поправки). */
  scaleXY: number;
  scaleZ: number;
}

export const DEFAULT_CLAY: ClayProfile = { name: "Фарфоровый шликер", totalShrinkPct: 12, slipDensity: 1.75 };
export const DEFAULT_PLASTER: PlasterProfile = { name: "Гипс формовочный", waterPer100: 70, powderDensity: 2.6, expansionPct: 0.2 };
export const DEFAULT_SILICONE: SiliconeProfile = {
  name: "Платиновый 25A",
  kind: "platinum",
  shoreA: 25,
  density: 1.1,
  linearShrinkPct: 0.1,
  wastePct: 10,
};
export const DEFAULT_PRINTER: PrinterProfile = {
  name: "FDM 256³",
  process: "fdm",
  bed: { x: 256, y: 256, z: 256 },
  fitClearanceMm: 0.25,
  minWallMm: 1.6,
  scaleXY: 1,
  scaleZ: 1,
};
