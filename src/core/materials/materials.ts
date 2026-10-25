import type { ProfilePoint } from "../types";
import type { ClayProfile, PlasterProfile, SiliconeProfile } from "../settings/profiles";

/**
 * Модуль 5: расчёт материалов. Чистая арифметика — объёмы приходят из модулей 1–3.
 * Все объёмы на входе — см³, массы на выходе — граммы.
 */

export interface PlasterMix {
  /** Масса сухого гипса, г. */
  plasterG: number;
  /** Масса (≈ объём в мл) воды, г. */
  waterG: number;
  /** Объём замеса, мл. */
  slurryMl: number;
}

/**
 * Гипс по объёму отливки и консистенции (частей воды на 100 частей гипса).
 * Объём замеса из 1 г гипса = W/100 мл воды + 1/ρ мл порошка (воздух в порошке выходит).
 * При консистенции 70 получается ≈ 0,92 г гипса на 1 см³ формы — совпадает с таблицами производителей.
 */
export function plasterForVolume(volumeCm3: number, p: PlasterProfile, wastePct = 10): PlasterMix {
  const perGram = p.waterPer100 / 100 + 1 / p.powderDensity; // мл замеса на 1 г гипса
  const slurryMl = volumeCm3 * (1 + wastePct / 100);
  const plasterG = slurryMl / perGram;
  return { plasterG, waterG: (plasterG * p.waterPer100) / 100, slurryMl };
}

export interface SiliconeMix {
  totalG: number;
  /** Компоненты A и B по массе. */
  partAG: number;
  partBG: number;
}

/** Силикон по объёму кейса. mixRatioAtoB — соотношение A:B по массе (1 = 1:1, 10 = 10:1). */
export function siliconeForVolume(volumeCm3: number, s: SiliconeProfile, mixRatioAtoB = 1): SiliconeMix {
  const totalG = volumeCm3 * s.density * (1 + s.wastePct / 100);
  const partBG = totalG / (1 + mixRatioAtoB);
  return { totalG, partAG: totalG - partBG, partBG };
}

/** Площадь внутренней поверхности тела вращения (боковая + дно), мм². */
export function profileSurfaceArea(profile: ProfilePoint[]): number {
  let a = Math.PI * profile[0].r * profile[0].r; // дно
  for (let i = 0; i < profile.length - 1; i++) {
    const p = profile[i];
    const q = profile[i + 1];
    a += Math.PI * (p.r + q.r) * Math.hypot(q.r - p.r, q.z - p.z);
  }
  return a;
}

export interface SlipEstimate {
  /** Сколько шликера залить в форму (полость + засор), мл и г. */
  fillMl: number;
  fillG: number;
  /** Оценка шликера, который останется в стенке изделия, мл (без засора). */
  retainedMl: number;
  /** Та же оценка в граммах шликера — расход на одно изделие. */
  retainedG: number;
  /** Сколько вернётся при сливе, мл. */
  drainedMl: number;
}

/**
 * Шликер на одну отливку.
 * cavityVolumeCm3 — полость формы вместе с засором (модуль 2).
 * productProfile — профиль модели (без засора), wallMm — желаемая толщина черепка.
 */
export function slipPerCast(
  cavityVolumeCm3: number,
  productProfile: ProfilePoint[],
  wallMm: number,
  clay: ClayProfile,
): SlipEstimate {
  const fillMl = cavityVolumeCm3;
  const retainedMl = Math.min(fillMl, (profileSurfaceArea(productProfile) * wallMm) / 1000);
  return {
    fillMl,
    fillG: fillMl * clay.slipDensity,
    retainedMl,
    retainedG: retainedMl * clay.slipDensity,
    drainedMl: fillMl - retainedMl,
  };
}

export interface MaterialsSummary {
  plaster?: PlasterMix & { perPart?: { id: string; plasterG: number; waterG: number }[] };
  silicone?: SiliconeMix & { perPart?: { id: string; totalG: number }[] };
  slip?: SlipEstimate;
  /** Стоимость, если заданы цены за кг. */
  cost?: { plaster: number; silicone: number; slip: number; total: number };
}

export interface Prices {
  plasterPerKg?: number;
  siliconePerKg?: number;
  slipPerKg?: number;
}

export function costOf(summary: MaterialsSummary, prices: Prices): MaterialsSummary["cost"] {
  const plaster = ((summary.plaster?.plasterG ?? 0) / 1000) * (prices.plasterPerKg ?? 0);
  const silicone = ((summary.silicone?.totalG ?? 0) / 1000) * (prices.siliconePerKg ?? 0);
  const slip = ((summary.slip?.retainedG ?? 0) / 1000) * (prices.slipPerKg ?? 0);
  return { plaster, silicone, slip, total: plaster + silicone + slip };
}
