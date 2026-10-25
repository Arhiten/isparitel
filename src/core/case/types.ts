import type { Mesh } from "../types";
import type { Solid, Vec3 } from "../geometry/csg";
import type { MoldPartId } from "../mold/types";

/**
 * Модуль 3: силиконовый кейс и печатный кожух для каждой части гипсовой формы.
 *
 * Схема (метод «блок-форма»):
 *   1. Печатаем БЛОК — точную копию части гипсовой формы (тот же Solid из модуля 2).
 *   2. Кладём блок тыльной (заливочной) гранью на ОСНОВАНИЕ кожуха, рабочими гранями вверх.
 *   3. Ставим СТЕНКИ кожуха вокруг с зазором = толщина силикона, заливаем силикон сверху
 *      открытой заливкой до уровня «высший пункт блока + толщина».
 *   4. Получаем силиконовый КЕЙС — негатив рабочих граней.
 *   5. Переворачиваем кейс полостью вверх, ставим обратно в кожух (он же жёсткая рубашка),
 *      льём гипс → копия части гипсовой формы. Тыльная грань — свободная поверхность заливки.
 *
 * Отсюда требование к модулю 2: тыльная грань каждой части должна быть ПЛОСКОЙ (blockShape = "box").
 */

export type HousingShape =
  /** Прямоугольный ящик: проще печатать и собирать, больше силикона. */
  | "box"
  /** Стенки повторяют контур блока в плане (эквидистанта): экономия силикона. */
  | "contour";

export interface CaseParams {
  /** Толщина силикона над рабочими гранями и по бокам, мм. Типично 8–15. */
  siliconeMm: number;
  housing: HousingShape;
  /** Толщина стенки кожуха, мм. */
  wallMm: number;
  /** Ширина фланцев для стяжки болтами, мм. */
  flangeMm: number;
  /** Диаметр болтов (М4/М5), мм; отверстия = диаметр + зазор принтера. */
  boltDiameterMm: number;
  /** Шаг болтов по фланцу, мм. */
  boltPitchMm: number;
  /** Сколько частей у стенок кожуха: 2 (две «Г») или 4 (четыре стенки). */
  wallPieces: 2 | 4;
  /** Высота центрирующих штифтов блока на основании, мм (чтобы блок не сдвинулся при заливке). */
  locatorPinMm: number;
  /** Паз под уплотнение (пруток/пластилин) по стыкам стенок и основания. */
  sealGroove: boolean;
  /** Ступенька-«замок» по периметру кейса, которая фиксирует его в кожухе при заливке гипса, мм. */
  registrationLipMm: number;
}

export const DEFAULT_CASE_PARAMS: CaseParams = {
  siliconeMm: 10,
  housing: "box",
  wallMm: 4,
  flangeMm: 14,
  boltDiameterMm: 5,
  boltPitchMm: 60,
  wallPieces: 4,
  locatorPinMm: 5,
  sealGroove: true,
  registrationLipMm: 4,
};

export interface CasePrintPart {
  id: string; // например "side-a/block", "side-a/base", "side-a/wall-1"
  label: string;
  solid: Solid;
  /** Сколько одинаковых деталей печатать. */
  count: number;
  /** Рекомендуемая ориентация для печати: какая грань вниз. */
  printDown: Vec3;
}

export interface CaseDesign {
  moldPartId: MoldPartId;
  /** Поворот, переводящий часть формы в положение «тыльной гранью вниз». */
  placement: { rotateDeg: Vec3; translate: Vec3 };
  /** Печатные детали: блок, основание, стенки. */
  printParts: CasePrintPart[];
  /** Внутренний объём кожуха минус блок — объём силикона, см³. */
  siliconeVolumeCm3: number;
  /** Высота заливки силикона от основания, мм (нарисовать риску на стенке). */
  siliconeFillHeightMm: number;
  /** Самая низкая точка заливки (где лить струйкой) — в координатах кожуха. */
  pourPoint: Vec3;
  warnings: string[];
}

export interface CaseMeshes {
  moldPartId: MoldPartId;
  parts: { id: string; label: string; mesh: Mesh }[];
}
