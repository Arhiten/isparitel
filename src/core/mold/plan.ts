import type { ProfilePoint } from "../types";
import { addSpare } from "./spare";
import { analyzeUndercuts } from "./undercuts";
import type { MoldParams, MoldPlan, PartingScheme } from "./types";

/** Максимальный радиус профиля на отрезке высот [z0, z1]. */
function maxRIn(profile: ProfilePoint[], z0: number, z1: number): number {
  let m = 0;
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (p.z >= z0 && p.z <= z1) m = Math.max(m, p.r);
    // учитываем отрезок, пересекающий границу окна
    if (i > 0) {
      const q = profile[i - 1];
      if ((q.z - z0) * (p.z - z0) < 0 || (q.z - z1) * (p.z - z1) < 0) m = Math.max(m, p.r, q.r);
    }
  }
  return m;
}

/**
 * План гипсовой формы: схема разъёма, габарит блока, замки, пазы.
 * Считается мгновенно, без CSG. UI показывает план и предупреждения, пока пользователь
 * правит параметры, а тяжёлое построение тел (build.ts) запускается по кнопке.
 */
export function planMold(modelProfile: ProfilePoint[], params: MoldParams): MoldPlan {
  const warnings: string[] = [];
  const rimZ = modelProfile[modelProfile.length - 1].z;
  const cavityProfile = addSpare(modelProfile, params.spare);
  const spareTopZ = cavityProfile[cavityProfile.length - 1].z;

  const undercuts = analyzeUndercuts(modelProfile);
  let scheme: PartingScheme;
  if (params.scheme === "auto") {
    scheme = undercuts.pullUpFree && undercuts.minDraftDeg >= 1 ? "one-piece" : "two-sides-base";
  } else {
    scheme = params.scheme;
    if (scheme === "one-piece" && !undercuts.pullUpFree) {
      warnings.push(
        "Выбрана цельная форма, но у изделия есть поднутрения: оно не выйдет вверх. Нужна схема «две боковины + дно».",
      );
    }
  }
  if (scheme === "one-piece" && undercuts.lowDraftZones.length) {
    warnings.push("Есть вертикальные участки без уклона: из цельной формы изделие может выходить туго.");
  }

  let maxR = 0;
  for (const p of cavityProfile) maxR = Math.max(maxR, p.r);
  const halfWidth = maxR + params.wallMm;
  const zMin = -params.bottomMm;
  const zMax = spareTopZ;
  if (params.wallMm < 25) warnings.push("Стенка гипса тоньше 25 мм: форма быстро насытится водой и может треснуть.");

  const keys: MoldPlan["keys"] = [];
  const strapZ: number[] = [];
  let baseSplitZ: number | null = null;
  const { diameterMm: d, depthMm, clearanceMm } = params.keys;

  if (scheme === "two-sides-base") {
    baseSplitZ = 0;

    // Замки на плоскости разъёма боковин x = 0: по два с каждой стороны от полости, внизу и вверху
    for (const frac of [0.22, 0.78]) {
      const z = baseSplitZ + (zMax - baseSplitZ) * frac;
      const localR = maxRIn(cavityProfile, z - d / 2, z + d / 2);
      let y = localR + clearanceMm + d / 2;
      const yMax = halfWidth - d / 2 - 4;
      if (y > yMax) {
        warnings.push(
          `Замку на высоте ${z.toFixed(0)} мм не хватает места между полостью и краем блока. Увеличьте толщину гипса или уменьшите замки.`,
        );
        y = yMax;
      }
      for (const s of [-1, 1]) keys.push({ center: [0, s * y, z], normal: [1, 0, 0], diameterMm: d, depthMm });
    }

    // Замки на плоскости дна z = 0: по углам, по одному на каждую четверть
    const r0 = maxRIn(cavityProfile, 0, d);
    const k = halfWidth - d / 2 - 4;
    if (Math.SQRT2 * k - d / 2 < r0 + clearanceMm) {
      warnings.push("Замкам дна не хватает места вокруг основания изделия. Увеличьте толщину гипса.");
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      keys.push({ center: [sx * k, sy * k, 0], normal: [0, 0, 1], diameterMm: d, depthMm });
    }

    if (params.straps.enabled) {
      const n = Math.max(1, params.straps.count);
      for (let i = 0; i < n; i++) strapZ.push(zMin + ((zMax - zMin) * (i + 1)) / (n + 1));
    }
  }

  if (undercuts.neckDiameterMm < 15) {
    warnings.push("Горло уже 15 мм: шликер будет плохо сливаться и форму трудно промыть.");
  }

  return {
    scheme,
    cavityProfile,
    rimZ,
    spareTopZ,
    block: { shape: params.blockShape, halfWidth, zMin, zMax },
    baseSplitZ,
    keys,
    strapZ,
    undercuts,
    warnings,
  };
}
