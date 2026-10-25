import type { Vec3 } from "../geometry/csg";
import type { PrinterProfile } from "../settings/profiles";
import type { FitResult } from "./types";

const PERMS: [number, number, number][] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

/**
 * Влезает ли деталь габаритом size (мм, по осям детали) на стол принтера.
 * Перебирает 6 положений «какой осью вниз». Повороты на 45° по столу не учитывает (консервативно).
 * margin — отступ от краёв стола, мм.
 */
export function fitOnBed(size: Vec3, printer: PrinterProfile, margin = 5): FitResult {
  const bed: Vec3 = [printer.bed.x - 2 * margin, printer.bed.y - 2 * margin, printer.bed.z];
  const sorted = [...size].sort((a, b) => b - a) as Vec3;
  for (const p of PERMS) {
    if (size[p[0]] <= bed[0] && size[p[1]] <= bed[1] && size[p[2]] <= bed[2]) {
      return { fits: true, size: sorted, axisOrder: p, sections: [1, 1, 1] };
    }
  }
  // Не влезает: минимальное число секций по осям детали в лучшей из перестановок
  let best: Vec3 = [Infinity, Infinity, Infinity];
  let bestCount = Infinity;
  for (const p of PERMS) {
    const s: Vec3 = [0, 0, 0];
    s[p[0]] = Math.ceil(size[p[0]] / bed[0]);
    s[p[1]] = Math.ceil(size[p[1]] / bed[1]);
    s[p[2]] = Math.ceil(size[p[2]] / bed[2]);
    const count = s[0] * s[1] * s[2];
    if (count < bestCount) {
      bestCount = count;
      best = s;
    }
  }
  return { fits: false, size: sorted, sections: best };
}

/** Применить калибровку принтера к размерам: что задать в слайсере, чтобы получить нужное. */
export function calibrate(size: Vec3, printer: PrinterProfile): Vec3 {
  return [size[0] * printer.scaleXY, size[1] * printer.scaleXY, size[2] * printer.scaleZ];
}

/**
 * Калибровочный коэффициент по замеру тестового кубика:
 * задано designedMm, после печати измерено measuredMm → коэффициент для профиля принтера.
 */
export function calibrationFactor(designedMm: number, measuredMm: number): number {
  if (!(designedMm > 0 && measuredMm > 0)) throw new Error("Размеры должны быть положительными.");
  return designedMm / measuredMm;
}
