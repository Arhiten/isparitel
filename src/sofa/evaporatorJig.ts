// Сварочный кондуктор каркаса шкафа испарителя — объёмная схема (не рабочие чертежи). Чистый TS.
// Стол из трубы 80×80 с поперечинами под швеллеры основания; подкладки 20 под 8П (верх всех швеллеров — на 100);
// упоры под торцы и наружные грани швеллеров; прижимы; угловые колонны с кронштейнами и штифтами в отверстия стоек
// (база стойки — по отверстиям под заклёпки, как в «Учесть при монтажных работах»). Оси и размеры — как у модели шкафа, мм.

import { cassetteNode } from "./evaporator";
import type { AppState, Material, Part, Pt } from "./frame/model";

/** Роль детали кондуктора — для цвета и легенды. */
export type JigRole = "table" | "spacer" | "stop" | "clamp" | "column" | "arm" | "pin";
export const JIG_ROLES: Record<JigRole, { title: string; color: string; note: string }> = {
  table: { title: "Стол (труба 80×80)", color: "#868e96", note: "рама и поперечины под 10П, 8П и швеллеры под установку" },
  spacer: { title: "Подкладки 20", color: "#f59f00", note: "под 8П — верх всех швеллеров основания на одной отметке" },
  stop: { title: "Упоры", color: "#e8590c", note: "под торцы 10П и наружные грани 10П и 8П (полки наружу)" },
  clamp: { title: "Прижимы", color: "#c92a2a", note: "рычажные прижимы швеллеров к упорам и подкладкам" },
  column: { title: "Угловые колонны (труба 80×80)", color: "#495057", note: "за контуром, на углах стола" },
  arm: { title: "Кронштейны", color: "#343a40", note: "на 2 уровнях — у нижнего и верхнего ряда отверстий стоек" },
  pin: { title: "Штифты ⌀8,8", color: "#e03131", note: "в отверстия под заклёпки: стойка встаёт по отверстиям" },
};

const TUBE80 = { kind: "tube" as const, h: 80, w: 80, s: 4, t: 4, kgm: 9.38 };
const JIG_MATERIALS: Material[] = [
  { id: "jig80", name: "Труба 80×80×4 (кондуктор)", thickness: 80, sheetW: 80, sheetL: 6000, price: 0, density: 7850, E: 206000, strength: 245, bar: true, profile: TUBE80 },
  { id: "jig20", name: "Сталь 20 мм (кондуктор)", thickness: 20, sheetW: 1000, sheetL: 1000, price: 0, density: 7850, E: 206000, strength: 245 },
  { id: "jig40", name: "Сталь 40 мм (упоры)", thickness: 40, sheetW: 1000, sheetL: 1000, price: 0, density: 7850, E: 206000, strength: 245 },
];

/**
 * Детали кондуктора и их роли. base — модель серии (по ней — положение швеллеров под установку).
 * Отметки: стол z −80…0, низ 10П на 0, 8П — на подкладках 20, кронштейны — у рядов отверстий стоек.
 */
export function evaporatorJig(base: AppState) {
  const n = cassetteNode(), c = n.channels, W = n.channels.l10, D = W, T = n.tube.a, inset = n.inset;
  const parts: Part[] = [];
  const role: Record<string, JigRole> = {};
  const add = (id: string, r: JigRole, name: string, materialId: string, plane: Part["plane"], a: number, b: number, x: number, y: number, z: number, extra: Partial<Part> = {}) => {
    parts.push({ id, name, materialId, plane, a, b, x, y, z, seat: false, back: false, ...extra });
    role[id] = r;
  };
  /** Брусок по габариту [x0, y0, z0] — [x1, y1, z1]: лежачая пластина нужной толщины (20 или 40). */
  const block = (id: string, r: JigRole, name: string, [x0, y0, z0]: number[], [x1, y1, z1]: number[]) => {
    // Толщина материала задаёт высоту бруска: высокие упоры — стопкой (40 + 20), остаток — бруском 20.
    for (let z = z0, i = 0; z < z1 - 0.1; i++) {
      const mat = z1 - z >= 40 ? "jig40" : "jig20", thick = mat === "jig40" ? 40 : 20;
      add(i ? `${id}-${i}` : id, r, name, mat, "xy", x1 - x0, y1 - y0, x0, y0, z);
      z += thick;
    }
  };

  // --- Стол: рама и поперечины, труба 80×80, верх на 0 ---
  const L = W + 300, lo = -150;
  add("jt-front", "table", "Рама стола, перед", "jig80", "xz", L, 80, lo, lo, -80);
  add("jt-back", "table", "Рама стола, зад", "jig80", "xz", L, 80, lo, D + 70, -80);
  add("jt-left", "table", "Рама стола, лево", "jig80", "yz", D + 140, 80, lo, lo + 80, -80);
  add("jt-right", "table", "Рама стола, право", "jig80", "yz", D + 140, 80, W + 70, lo + 80, -80);
  // Поперечины под 10П (по оси полки) и средняя — под швеллеры под установку.
  for (const [id, yc] of [["jt-x1", inset + c.ch10.w / 2], ["jt-x2", D - inset - c.ch10.w / 2], ["jt-x3", D / 2]] as const)
    add(id, "table", "Поперечина стола (вдоль X)", "jig80", "xz", W + 140, 80, -70, yc - 40, -80);
  // Поперечины под 8П основания (по их осям).
  for (const [id, xc] of [["jt-y1", inset + c.ch8.w / 2], ["jt-y2", W - inset - c.ch8.w / 2]] as const)
    add(id, "table", "Поперечина стола (вдоль Y)", "jig80", "yz", D + 140, 80, xc - 40, -70, -80);

  // --- Подкладки 20 под 8П (консоли, пролёт) и под швеллеры под установку ---
  const z8 = c.ch10.h - c.ch8.h;
  for (const [side, x0] of [["l", inset], ["r", W - inset - c.ch8.w]] as const)
    [40, 300, 540, D - 100].forEach((y, i) => block(`js-${side}-${i + 1}`, "spacer", "Подкладка 20 под 8П", [x0, y, 0], [x0 + c.ch8.w, y + 60, z8]));
  const rails = base.parts.filter((p) => p.id.startsWith("rail-"));
  rails.forEach((p, i) => block(`js-rail-${i + 1}`, "spacer", "Подкладка 20 под швеллер под установку", [p.x, D / 2 - 30, 0], [p.x + c.ch8.w, D / 2 + 30, z8]));

  // --- Упоры: торцы 10П (за контуром), наружные грани 10П (полки) и 8П ---
  for (const [i, y0] of [inset, D - inset - c.ch10.w].entries()) {
    block(`jst-end-l${i}`, "stop", "Упор торца 10П", [-40, y0 + 3, 0], [0, y0 + c.ch10.w - 3, 60]);
    block(`jst-end-r${i}`, "stop", "Упор торца 10П", [W, y0 + 3, 0], [W + 40, y0 + c.ch10.w - 3, 60]);
  }
  for (const x of [W * 0.33, W * 0.62]) {
    block(`jst-f-${x.toFixed(0)}`, "stop", "Упор грани 10П (перед)", [x, inset - 40, 0], [x + 40, inset, 60]);
    block(`jst-b-${x.toFixed(0)}`, "stop", "Упор грани 10П (зад)", [x, D - inset, 0], [x + 40, D - inset + 40, 60]);
  }
  for (const y of [40, D - 100]) {
    block(`jst-l-${y}`, "stop", "Упор грани 8П (лево)", [inset - 40, y, z8], [inset, y + 60, z8 + 60]);
    block(`jst-r-${y}`, "stop", "Упор грани 8П (право)", [W - inset, y, z8], [W - inset + 40, y + 60, z8 + 60]);
  }
  // --- Прижимы (условно): над верхней полкой 10П у упоров граней ---
  for (const x of [W * 0.33, W * 0.62])
    for (const [s, y0] of [["f", inset + 5], ["b", D - inset - c.ch10.w + 5]] as const)
      block(`jc-${s}-${x.toFixed(0)}`, "clamp", "Прижим рычажный (условно)", [x, y0, c.ch10.h], [x + 40, y0 + 36, c.ch10.h + 40]);

  // --- Угловые колонны с кронштейнами и штифтами в отверстия стоек ---
  // Отверстия: основная стойка — в грани к углу (по Y), ось n.axis от наружной грани; вторая — в грани к углу (по X), так же.
  const levels = [n.rivetZ[0], n.rivetZ[n.rivetZ.length - 1]];
  const corners = [
    { id: "fl", sx: 1, sy: 1 },
    { id: "fr", sx: -1, sy: 1 },
    { id: "bl", sx: 1, sy: -1 },
    { id: "br", sx: -1, sy: -1 },
  ] as const;
  for (const k of corners) {
    const mx = (x: number) => (k.sx > 0 ? x : W - x), my = (y: number) => (k.sy > 0 ? y : D - y);
    /** Брусок, заданный в координатах переднего левого угла, — в свой угол. */
    const box = (id: string, r: JigRole, name: string, [x0, y0, x1, y1]: number[], z0: number, z1: number) => {
      const xs = [mx(x0), mx(x1)].sort((p, q) => p - q), ys = [my(y0), my(y1)].sort((p, q) => p - q);
      block(id, r, name, [xs[0], ys[0], z0], [xs[1], ys[1], z1]);
    };
    const cx: Pt = [mx(k.sx > 0 ? lo : lo + 80), my(k.sy > 0 ? lo : lo + 80)];
    add(`jcol-${k.id}`, "column", "Угловая колонна, труба 80×80", "jig80", "xz", 80, n.height + 50, Math.min(cx[0], mx(lo + 80)), Math.min(cx[1], my(lo + 80)), 0, { alongB: true });
    levels.forEach((z, i) => {
      const z0 = z - 10, z1 = z + 10, s = `${k.id}-${i + 1}`;
      // К основной стойке: вдоль Y от колонны, затем вдоль X к грани стойки; штифт — в отверстие (ось n.axis от наружной грани).
      box(`jarm-a-${s}`, "arm", "Кронштейн к основной стойке", [-120, -70, -100, inset - 30], z0, z1);
      box(`jarm-b-${s}`, "arm", "Кронштейн к основной стойке", [-120, inset - 30, n.axis + 20, inset - 10], z0, z1);
      box(`jpin-a-${s}`, "pin", "Штифт ⌀8,8 в отверстие стойки", [n.axis - 5, inset - 10, n.axis + 5, inset], z0, z1);
      // Ко второй стойке: вдоль X от колонны, затем вдоль Y к грани стойки.
      box(`jarm-c-${s}`, "arm", "Кронштейн ко второй стойке", [-70, -120, inset - 30, -100], z0, z1);
      box(`jarm-d-${s}`, "arm", "Кронштейн ко второй стойке", [inset - 30, -120, inset - 10, n.axis + 20], z0, z1);
      box(`jpin-b-${s}`, "pin", "Штифт ⌀8,8 в отверстие стойки", [inset - 10, n.axis - 5, inset, n.axis + 5], z0, z1);
    });
  }
  return { parts, role, materials: JIG_MATERIALS, tube: T };
}
