import type { Pt } from "./model";

/** Площадь многоугольника, мм² (из import.ts проекта «Фанерный каркас дивана»). */
export function area(pts: Pt[]) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) sum += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
  return Math.abs(sum) / 2;
}
