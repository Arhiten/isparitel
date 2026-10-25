import type { ProfilePoint } from "../types";
import type { SpareParams } from "./types";

/**
 * Засор (прибыль) — воронка над краем изделия.
 * Пока шликер впитывается, его уровень падает. Засор держит запас, чтобы край не получился рваным.
 * После набора стенки край подрезается по линии ступеньки.
 *
 * Профиль изделия заканчивается на краю (rimZ). Добавляем:
 *   ступеньку наружу на stepMm → коническую воронку высотой heightMm с раскрытием flareDeg.
 */
export function addSpare(profile: ProfilePoint[], p: SpareParams): ProfilePoint[] {
  if (profile.length < 2) throw new Error("Профиль пуст.");
  const rim = profile[profile.length - 1];
  const out = profile.map((q) => ({ ...q }));
  if (p.heightMm <= 0) return out;

  const tan = Math.tan((p.flareDeg * Math.PI) / 180);
  const r0 = rim.r + Math.max(0, p.stepMm);
  // Ступенька: та же высота, радиус больше. Для тела вращения это горизонтальное кольцо.
  // revolve() корректно обрабатывает две точки на одной высоте.
  if (p.stepMm > 0) out.push({ r: r0, z: rim.z });
  const steps = Math.max(2, Math.ceil(p.heightMm / 2));
  for (let i = 1; i <= steps; i++) {
    const dz = (p.heightMm * i) / steps;
    out.push({ r: r0 + dz * tan, z: rim.z + dz });
  }
  return out;
}
