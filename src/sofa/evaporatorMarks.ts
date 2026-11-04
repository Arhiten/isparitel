// Марки несущего каркаса шкафа испарителя для листов КМ: одинаковые детали — одна марка. Чистый TS.
// Профили — по правилам (Ш1–Ш3 как на листе 4, стойки С1, трубы пояса Т1–Т3, перемычки стен У1 — уголок, бобышка Б1);
// листовые детали — по контуру: зеркальные и повёрнутые на 90° экземпляры считаются одной маркой (лист режется на ЧПУ с любой стороны).

import { solidsOf, type Solid } from "./frame/calc";
import type { AppState, Pt, Shape } from "./frame/model";

export type MarkKind = "channel" | "tube" | "angle" | "bar" | "plate";
export interface FrameMark {
  mark: string;
  kind: MarkKind;
  /** Наименование без привязки к месту (углу, стороне). */
  name: string;
  materialId: string;
  material: string;
  /** Толщина листа или высота профиля, мм. */
  t: number;
  /** Длина профиля / габарит листовой детали a × b, мм. */
  a: number;
  b: number;
  qty: number;
  /** Масса одной, кг. */
  mass: number;
  shape: Shape;
  ids: string[];
  solids: Solid[];
  /** Лист КМ с деталировкой. */
  sheet: number;
}

/** Материалы несущего каркаса (обшивка, кассеты и полосы-вставки — не каркас). */
export const FRAME_MATERIALS = ["ch10", "ch8", "tube60", "tube5030", "an50", "rd50", "s8", "s3"];

const RULES: [RegExp, string, MarkKind, string, number][] = [
  [/^base-(front|back)$/, "Ш1", "channel", "Швеллер основания 10П", 4],
  [/^base8-[lr]-[13]$/, "Ш2", "channel", "Швеллер основания 8П, консоль", 4],
  [/^(base8-[lr]-2|rail-[lr])$/, "Ш3", "channel", "Швеллер 8П, пролёт и под установку", 4],
  [/^post2?-/, "С1", "tube", "Стойка", 8],
  [/^top-(front|back)$/, "Т1", "tube", "Верхний пояс, связывающая труба", 8],
  [/^top-(left|right)-[13]$/, "Т2", "tube", "Верхний пояс, консоль продольной трубы", 8],
  [/^top-(left|right)-2$/, "Т3", "tube", "Верхний пояс, пролёт продольной трубы", 8],
  [/^bar-/, "У1", "angle", "Перемычка горизонтальная стены", 8],
  [/^boss-/, "Б1", "bar", "Бобышка ⌀50×25, резьба М20 гл. 20", 8],
];

const round = (v: number) => Math.round(v * 2) / 2;
/** Канонический ключ контура: минимум по 8 симметриям квадрата, точки как множество. */
function shapeKey(s: Shape): string {
  const variants: string[] = [];
  const pts: Pt[] = [...s.outer, ...s.cutouts.flat()];
  const holes = s.drills.map((d): [number, number, number] => [d.x, d.y, d.d]);
  for (const swap of [false, true])
    for (const fx of [1, -1])
      for (const fy of [1, -1]) {
        const tr = ([x, y]: Pt): Pt => {
          const [u, v] = swap ? [y, x] : [x, y];
          return [u * fx, v * fy];
        };
        const all = pts.map(tr), minX = Math.min(...all.map((p) => p[0])), minY = Math.min(...all.map((p) => p[1]));
        const norm = (p: Pt) => `${round(p[0] - minX)},${round(p[1] - minY)}`;
        const h = holes.map(([x, y, d]) => norm(tr([x, y])) + "/" + d);
        variants.push(all.map(norm).sort().join(";") + "|" + h.sort().join(";"));
      }
  return variants.sort()[0];
}

/** Наименование без места: убирает скобки с углом/стороной и хвост «(…, лево)». */
const plain = (name: string) =>
  name
    .replace(/\s*\((перед|зад|лево|право|низ|верх)[^)]*\)/g, "")
    .replace(/,\s*$/, "")
    .trim();

/** Марки каркаса по модели серии. */
export function frameMarks(base: AppState): FrameMark[] {
  // Створки двери (door-*) — отдельное изделие, не каркас.
  const solids = solidsOf(base).filter((s) => FRAME_MATERIALS.includes(s.material.id) && !s.part.id.startsWith("door"));
  const marks = new Map<string, FrameMark>();
  const plates: FrameMark[] = [];
  for (const s of solids) {
    const p = s.part, rule = RULES.find(([re]) => re.test(p.id));
    if (rule) {
      const [, mark, kind, name, sheet] = rule;
      const m = marks.get(mark);
      if (m) {
        m.qty++;
        m.ids.push(p.id);
        m.solids.push(s);
        continue;
      }
      const len = p.alongB ? p.b : p.a;
      marks.set(mark, { mark, kind, name, materialId: s.material.id, material: s.material.name, t: s.t, a: len, b: kind === "bar" ? 25 : p.b, qty: 1, mass: s.weight, shape: s.shape, ids: [p.id], solids: [s], sheet });
      continue;
    }
    // Листовая деталь: сравнение по контуру.
    const key = s.material.id + "#" + shapeKey(s.shape);
    const found = plates.find((m) => m.materialId + "#" + shapeKey(m.shape) === key);
    if (found) {
      // Одна деталь в разных местах каркаса (внизу и вверху) — общее наименование.
      if (plain(p.name) !== found.name && !found.name.endsWith("низ и верх каркаса")) found.name = `${found.name.split(" (")[0].split(",")[0]}, лист ${found.t} мм; низ и верх каркаса`;
      found.qty++;
      found.ids.push(p.id);
      found.solids.push(s);
      continue;
    }
    const xs = s.shape.outer.map((q) => q[0]), ys = s.shape.outer.map((q) => q[1]);
    plates.push({
      mark: `Д${plates.length + 1}`,
      kind: "plate",
      name: plain(p.name),
      materialId: s.material.id,
      material: s.material.name,
      t: s.t,
      a: Math.max(...xs) - Math.min(...xs),
      b: Math.max(...ys) - Math.min(...ys),
      qty: 1,
      mass: s.weight,
      shape: s.shape,
      ids: [p.id],
      solids: [s],
      sheet: 9,
    });
  }
  const order = ["Ш1", "Ш2", "Ш3", "С1", "Т1", "Т2", "Т3", "У1", "Б1"];
  return [...order.map((k) => marks.get(k)).filter((m): m is FrameMark => !!m), ...plates];
}
