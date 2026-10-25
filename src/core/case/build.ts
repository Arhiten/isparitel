import type { CsgKernel, Solid, Vec3 } from "../geometry/csg";
import type { MoldPart } from "../mold/types";
import type { CaseDesign, CaseParams, CasePrintPart } from "./types";

/** Перекрытие тел внутри одной детали, мм. */
const EPS = 0.5;
/** Зазор отверстий под болты и штифты для FDM-печати, мм. */
const FIT = 0.4;
/** Запас высоты стенок над уровнем силикона, мм. */
export const CASE_FREEBOARD_MM = 5;
/** Радиус центрирующих штифтов основания, мм. */
const PIN_R = 4;

/**
 * Кейс и кожух для одной части гипсовой формы.
 *
 * Координаты кожуха: основание сверху на z = 0, внутренний объём — [−hx, hx] × [−hy, hy] × [0, Hz].
 *
 *  1. Часть формы поворачивается тыльной гранью вниз и ставится в центр на z = 0 — это БЛОК (печатаем).
 *     В тыльной грани блока — 2 гнезда под штифты основания.
 *  2. Внутренний объём = габарит блока + толщина силикона с боков и сверху.
 *  3. ОСНОВАНИЕ — плита под всем кожухом со штифтами под блок и отверстиями под болты.
 *  4. СТЕНКИ: длинные (±Y) перекрывают углы и продолжаются за угол ушком; короткие (±X) стоят
 *     между длинными и несут ушки, которые ложатся на ушки длинных — стяжка болтами по углам.
 *     Внизу у каждой стенки полка наружу — болты к основанию. Верх открыт.
 *  5. На внутренней стороне длинных стенок — риска уровня заливки силикона.
 *
 * Стыки стенок и основания перед заливкой промазывают пластилином: силикон течёт в щели от 0,1 мм.
 * Паз под уплотнение (sealGroove) и буртик-фиксатор (registrationLipMm) пока не делаются.
 */
export function buildCase(kernel: CsgKernel, part: MoldPart, params: CaseParams): CaseDesign {
  const k = kernel;
  const warnings: string[] = [];
  const s = params.siliconeMm;
  const w = params.wallMm;
  const f = params.flangeMm;
  const boltR = (params.boltDiameterMm + FIT) / 2;
  const pinH = params.locatorPinMm;

  if (params.housing === "contour") warnings.push("Контурный кожух пока не строится — построен прямоугольный.");

  // 1. Уложить часть тыльной гранью вниз
  const rotateDeg = rotationToDown(part.backNormal);
  const rotated = k.rotate(part.solid, rotateDeg);
  const bb0 = k.bbox(rotated);
  const translate: Vec3 = [-(bb0.min[0] + bb0.max[0]) / 2, -(bb0.min[1] + bb0.max[1]) / 2, -bb0.min[2]];
  const placed = k.translate(rotated, translate);
  k.dispose(rotated);
  const bb = k.bbox(placed);
  const L = bb.max[0] - bb.min[0];
  const D = bb.max[1] - bb.min[1];
  const top = bb.max[2];

  // Гнёзда под штифты основания — по длинной оси блока
  const pinX = L * 0.3;
  const pinY = 0;
  const pinSpots: [number, number][] = L >= D ? [[-pinX, pinY], [pinX, pinY]] : [[0, -D * 0.3], [0, D * 0.3]];
  const sockets = pinSpots.map(([x, y]) => k.translate(k.cylinder(PIN_R + FIT / 2, PIN_R + FIT / 2, -EPS, pinH + 0.5), [x, y, 0]));
  const block = k.subtract(placed, ...sockets);
  k.dispose(placed, ...sockets);

  // 2. Внутренний объём кожуха
  const hx = L / 2 + s;
  const hy = D / 2 + s;
  const fill = top + s;
  const Hz = fill + CASE_FREEBOARD_MM;
  if (s < 6) warnings.push("Силикон тоньше 6 мм над замками и кромками может порваться при съёме.");
  if (fill > 150) warnings.push(`Высота заливки силикона ${fill.toFixed(0)} мм: лейте в 2 приёма или вакуумируйте, иначе останутся пузыри.`);

  // Отверстия под болты основание ↔ полки стенок
  const xs = spread(-hx + f / 2, hx - f / 2, params.boltPitchMm);
  const ys = spread(-hy + w + f / 2, hy - w - f / 2, params.boltPitchMm);
  const vHoles: [number, number][] = [];
  for (const x of xs) for (const sy of [-1, 1]) vHoles.push([x, sy * (hy + w + f / 2)]);
  for (const y of ys) for (const sx of [-1, 1]) vHoles.push([sx * (hx + w + f / 2), y]);
  const vHole = ([x, y]: [number, number]) => k.translate(k.cylinder(boltR, boltR, -w - 1, w + 1, 24), [x, y, 0]);
  // Отверстия в угловых ушках (вдоль Y)
  const zs = spread(12, Hz - 12, params.boltPitchMm);
  const hHoles: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of zs) hHoles.push([sx * (hx + w + f / 2), sy * hy, z]);
  const hHole = ([x, y, z]: Vec3) => k.translate(k.rotate(k.cylinder(boltR, boltR, -w - 1, w + 1, 24), [90, 0, 0]), [x, y, z]);

  // 3. Основание
  const ox = hx + w + f;
  const oy = hy + w + f;
  let base = k.box([-ox, -oy, -w], [ox, oy, 0]);
  const pins = pinSpots.map(([x, y]) => k.translate(k.cylinder(PIN_R, PIN_R * 0.85, -EPS, pinH, 32), [x, y, 0]));
  base = k.union(base, ...pins);
  base = k.subtract(base, ...vHoles.map(vHole));

  // 4. Стенки (строим для +Y и +X, вторые — поворот на 180° вокруг Z)
  const cutHoles = (wall: Solid) => k.subtract(wall, ...vHoles.map(vHole), ...hHoles.map(hHole));
  const longWall = cutHoles(
    k.subtract(
      k.union(
        k.box([-ox, hy, 0], [ox, hy + w, Hz]), // плита с ушками за углами
        k.box([-ox, hy + w - EPS, 0], [ox, oy, w]), // полка к основанию
      ),
      k.box([-hx, hy - 1, fill - 0.5], [hx, hy + 0.8, fill + 0.5]), // риска уровня силикона
    ),
  );
  const shortWall = cutHoles(
    k.union(
      k.box([hx, -hy, 0], [hx + w, hy, Hz]), // плита между длинными стенками
      k.box([hx + w - EPS, hy - w, 0], [ox, hy, Hz]), // ушко
      k.box([hx + w - EPS, -hy, 0], [ox, -hy + w, Hz]), // ушко
      k.box([hx + w - EPS, -hy + w - EPS, 0], [ox, hy - w + EPS, w]), // полка к основанию
    ),
  );

  const printParts: CasePrintPart[] = [
    { id: `${part.id}/block`, label: "Блок — копия части формы", solid: block, count: 1, printDown: [0, 0, -1] },
    { id: `${part.id}/base`, label: "Основание кожуха", solid: base, count: 1, printDown: [0, 0, -1] },
  ];
  if (params.wallPieces === 4) {
    printParts.push({ id: `${part.id}/wall-long`, label: "Стенка длинная", solid: longWall, count: 2, printDown: [0, -1, 0] });
    printParts.push({ id: `${part.id}/wall-short`, label: "Стенка короткая", solid: shortWall, count: 2, printDown: [-1, 0, 0] });
  } else {
    const corner = k.union(longWall, shortWall);
    k.dispose(longWall, shortWall);
    printParts.push({ id: `${part.id}/wall-corner`, label: "Стенка угловая (Г)", solid: corner, count: 2, printDown: [0, 0, -1] });
  }

  const siliconeVolumeCm3 = (4 * hx * hy * fill - k.volume(block)) / 1000;

  return {
    moldPartId: part.id,
    placement: { rotateDeg, translate },
    printParts,
    siliconeVolumeCm3,
    siliconeFillHeightMm: fill,
    pourPoint: [-hx + s / 2, -hy + s / 2, 0],
    warnings,
  };
}

/** Деталь кожуха в сборе → положение для печати: printDown вниз, на z = 0, по центру стола. */
export function orientForPrint(kernel: CsgKernel, solid: Solid, printDown: Vec3): Solid {
  const r = kernel.rotate(solid, rotationToDown(printDown));
  const bb = kernel.bbox(r);
  const moved = kernel.translate(r, [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]);
  kernel.dispose(r);
  return moved;
}

/** Поворот (градусы X, Y, Z), переводящий осевой вектор n в −Z. */
export function rotationToDown(n: Vec3): Vec3 {
  if (n[0] > 0.5) return [0, 90, 0];
  if (n[0] < -0.5) return [0, -90, 0];
  if (n[1] > 0.5) return [-90, 0, 0];
  if (n[1] < -0.5) return [90, 0, 0];
  if (n[2] > 0.5) return [180, 0, 0];
  return [0, 0, 0];
}

/** Точки от a до b с шагом не больше pitch, не меньше двух. */
function spread(a: number, b: number, pitch: number): number[] {
  if (b <= a) return [(a + b) / 2];
  const n = Math.max(1, Math.ceil((b - a) / pitch));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
