import type { Mesh, ProfilePoint } from "../types";
import type { Solid, Vec3 } from "../geometry/csg";

/**
 * Модуль 2: гипсовая форма для шликерного литья.
 * Вход — профиль МОДЕЛИ (уже с усадкой, из модуля 1). Выход — части гипсовой формы как тела.
 * Система координат: ось изделия = Z, дно изделия на z = 0, мм.
 */

export interface SpareParams {
  /** Высота засора (прибыли) над краем изделия, мм. Типично 25–40. */
  heightMm: number;
  /** Раскрытие засора наружу, градусы от вертикали. Облегчает слив и съём. */
  flareDeg: number;
  /**
   * Ступенька наружу на уровне края, мм. Даёт чёткую линию подрезки края
   * и не даёт засору «срастись» с краем. 0 — без ступеньки.
   */
  stepMm: number;
}

export type PartingScheme =
  /** Цельная форма: изделие вынимается вверх. Только если нет поднутрений. */
  | "one-piece"
  /** Две боковины (разъём по плоскости через ось) + дно. Стандарт для ваз и бутылок. */
  | "two-sides-base";

export type BlockShape =
  /** Прямоугольный блок: плоская тыльная сторона у каждой части — удобно для заливки гипса в кейс. */
  | "box"
  /** Цилиндр: меньше гипса, но тыльная сторона боковин кривая. */
  | "cylinder";

export interface KeyParams {
  /** Диаметр основания замка, мм. */
  diameterMm: number;
  /** Высота/глубина замка, мм. */
  depthMm: number;
  /** Форма: конус или полусфера — без поднутрений. */
  shape: "cone" | "hemisphere";
  /** Минимальное расстояние от края замка до полости, мм. */
  clearanceMm: number;
}

export interface StrapGrooveParams {
  enabled: boolean;
  /** Ширина и глубина паза под резинку/ремень, мм. */
  widthMm: number;
  depthMm: number;
  /** Количество пазов по высоте. */
  count: number;
}

export interface MoldParams {
  spare: SpareParams;
  scheme: PartingScheme | "auto";
  blockShape: BlockShape;
  /** Минимальная толщина гипса от полости до наружной грани, мм. Типично 25–40. */
  wallMm: number;
  /** Толщина гипса под дном изделия, мм. */
  bottomMm: number;
  keys: KeyParams;
  straps: StrapGrooveParams;
  /** Скругление наружных кромок блока, мм (острые кромки гипса крошатся). */
  outerFilletMm: number;
}

export const DEFAULT_MOLD_PARAMS: MoldParams = {
  spare: { heightMm: 30, flareDeg: 8, stepMm: 2 },
  scheme: "auto",
  blockShape: "box",
  wallMm: 30,
  bottomMm: 30,
  // Замок + отступ от полости должны помещаться в стенку: clearance + diameter + 4 ≤ wallMm
  keys: { diameterMm: 12, depthMm: 6, shape: "cone", clearanceMm: 12 },
  straps: { enabled: true, widthMm: 12, depthMm: 3, count: 2 },
  outerFilletMm: 3,
};

/** Результат анализа поднутрений для тела вращения. */
export interface UndercutReport {
  /** Можно ли вынуть изделие вверх из цельной формы. */
  pullUpFree: boolean;
  /** Участки, где радиус уменьшается кверху (поднутрение при съёме вверх), [z0, z1] мм. */
  undercutZones: [number, number][];
  /** Участки почти без уклона (< minDraftDeg) при съёме вверх, [z0, z1] мм. */
  lowDraftZones: [number, number][];
  /** Минимальный уклон по всей высоте, градусы (отрицательный = поднутрение). */
  minDraftDeg: number;
  /** Самое узкое место над самым широким — «горло», мм (диаметр). */
  neckDiameterMm: number;
}

/** План формы — всё, что считается без CSG. По нему UI может показать схему до тяжёлых расчётов. */
export interface MoldPlan {
  scheme: PartingScheme;
  /** Профиль полости: изделие + засор. */
  cavityProfile: ProfilePoint[];
  rimZ: number;
  spareTopZ: number;
  /** Габарит гипсового блока. */
  block: { shape: BlockShape; halfWidth: number; zMin: number; zMax: number };
  /** Плоскость разъёма боковин: x = 0 (нормаль по X). Дно отделяется плоскостью z = baseSplitZ. */
  baseSplitZ: number | null;
  /** Центры замков и направление (нормаль плоскости разъёма, куда «выступает» замок). */
  keys: { center: Vec3; normal: Vec3; diameterMm: number; depthMm: number }[];
  /** Высоты пазов под резинки. */
  strapZ: number[];
  undercuts: UndercutReport;
  warnings: string[];
}

export type MoldPartId = "whole" | "side-a" | "side-b" | "base";

export interface MoldPart {
  id: MoldPartId;
  /** Человеческое имя для UI и имени файла. */
  label: string;
  solid: Solid;
  /** Направление съёма части с изделия. */
  pullDir: Vec3;
  /**
   * Тыльная (заливочная) грань: нормаль наружу. Для кейса (модуль 3) часть кладётся
   * этой гранью на основание, а при заливке гипса в силикон эта сторона остаётся открытой.
   */
  backNormal: Vec3;
}

export interface MoldDesign {
  plan: MoldPlan;
  parts: MoldPart[];
  /** Объём гипса суммарно, см³. */
  plasterVolumeCm3: number;
  /** Объём полости (изделие + засор), см³ — для расчёта шликера. */
  cavityVolumeCm3: number;
}

export interface MoldMeshes {
  parts: { id: MoldPartId; label: string; mesh: Mesh }[];
}
