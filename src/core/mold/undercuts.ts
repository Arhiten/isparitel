import type { ProfilePoint } from "../types";
import type { UndercutReport } from "./types";

/**
 * Анализ поднутрений тела вращения при съёме вверх (из цельной формы).
 *
 * Изделие выходит вверх, только если радиус не убывает с высотой.
 * Уклон участка = atan(Δr / Δz): > 0 — стенка раскрывается кверху (хорошо),
 * < 0 — поднутрение, около 0 — вертикальная стенка (снимается с трудом, нужен уклон 1–3°).
 *
 * Для схемы «две боковины + дно» (съём боковин горизонтально) у тела вращения поднутрений нет,
 * поэтому достаточно этой проверки, чтобы выбрать схему.
 */
export function analyzeUndercuts(profile: ProfilePoint[], minDraftDeg = 1, epsR = 0.25): UndercutReport {
  const undercut: [number, number][] = [];
  const lowDraft: [number, number][] = [];
  let minDraft = 90;
  const push = (arr: [number, number][], z0: number, z1: number) => {
    const last = arr[arr.length - 1];
    if (last && Math.abs(last[1] - z0) < 1e-6) last[1] = z1;
    else arr.push([z0, z1]);
  };
  // Критерий поднутрения: точка заперта, если НИЖЕ неё есть место шире (изделие не пройдёт вверх).
  // Сравниваем с накопленным максимумом радиуса, а не с соседней точкой — иначе медленное сужение
  // на мелком шаге профиля проскакивает. EPS_R — допуск на шум профиля, мм: должен быть больше
  // размера пикселя фото в мм (иначе сглаживание края силуэта у дна даёт ложное поднутрение).
  // Сужение меньше 0,25 мм на практике снимается за счёт эластичности сырого черепка.
  const EPS_R = epsR;
  let runMax = profile[0].r;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    const dz = b.z - a.z;
    runMax = Math.max(runMax, a.r);
    if (dz <= 1e-9) continue; // горизонтальная ступенька (засор) — не мешает съёму вверх
    const dr = b.r - a.r;
    const deg = (Math.atan2(dr, dz) * 180) / Math.PI;
    if (deg < minDraft) minDraft = deg;
    if (b.r < runMax - EPS_R) push(undercut, a.z, b.z);
    else if (deg < minDraftDeg) push(lowDraft, a.z, b.z);
  }

  // Горло: минимальный радиус выше самой широкой точки
  let iMax = 0;
  for (let i = 1; i < profile.length; i++) if (profile[i].r > profile[iMax].r) iMax = i;
  let neck = Infinity;
  for (let i = iMax; i < profile.length; i++) neck = Math.min(neck, profile[i].r);

  return {
    pullUpFree: undercut.length === 0,
    undercutZones: undercut,
    lowDraftZones: lowDraft,
    minDraftDeg: minDraft,
    neckDiameterMm: neck * 2,
  };
}
