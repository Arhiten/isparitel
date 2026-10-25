import { type Calc, type Hole, type Placed, type Solid } from "./calc";
import { turn } from "./nest";
import { type AppState, type Pt, type Shape, materialLabel, num } from "./model";

// Два DXF (R12): 1) детали с разметкой под коннекторы, 2) раскрой по листам фанеры.
// Слои и цвета — как на исходных чертежах: CUT (голубой) — рез, POCKET (жёлтый) — карман на неполную глубину,
// DRILL (белый) — сквозные отверстия под метизы; MARK — метки коннекторов в кромке, STOCK — контур листа, TEXT — подписи.

const COLOR: Record<string, number> = { CUT: 4, POCKET: 2, DRILL: 7, MARK: 1, STOCK: 8, TEXT: 7 };

function writer() {
  const out: (string | number)[] = [0, "SECTION", 2, "ENTITIES"];
  // Кириллица записывается кодами \U+XXXX — так её читают CAD-программы независимо от кодировки файла.
  const escape = (t: string) => [...t].map((ch) => (ch.charCodeAt(0) > 126 ? `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : ch)).join("");
  const dxf = {
    poly(pts: Pt[], layer: string, closed: boolean) {
      out.push(0, "POLYLINE", 8, layer, 62, COLOR[layer], 66, 1, 70, closed ? 1 : 0);
      for (const [x, y] of pts) out.push(0, "VERTEX", 8, layer, 10, +x.toFixed(3), 20, +y.toFixed(3));
      out.push(0, "SEQEND");
    },
    rect: (x: number, y: number, w: number, h: number, layer: string) => dxf.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], layer, true),
    /** Отверстие в пласти — окружность; коннектор в кромке или без заданного диаметра — крестик. */
    hole(x: number, y: number, h: Hole) {
      if (!h.edge && h.d > 0) return void out.push(0, "CIRCLE", 8, "DRILL", 62, COLOR.DRILL, 10, +x.toFixed(3), 20, +y.toFixed(3), 40, h.d / 2);
      dxf.poly([[x - 6, y], [x + 6, y]], "MARK", false);
      dxf.poly([[x, y - 6], [x, y + 6]], "MARK", false);
    },
    text(x: number, y: number, height: number, value: string) {
      out.push(0, "TEXT", 8, "TEXT", 62, COLOR.TEXT, 10, +x.toFixed(3), 20, +y.toFixed(3), 40, height, 1, escape(value));
    },
    end: () => [...out, 0, "ENDSEC", 0, "EOF"].join("\n") + "\n",
  };
  return dxf;
}

/** Точка детали на листе с учётом её поворота против часовой стрелки. */
export function onSheet(p: Placed, q: Pt): Pt {
  const angle = p.angle ?? (p.rot ? 90 : 0), across = angle % 180 !== 0;
  const [x, y] = turn(q, across ? p.h : p.w, across ? p.w : p.h, angle);
  return [p.x + x, p.y + y];
}

/** Контуры детали, перенесённые функцией at: рез и карманы. */
function contours(dxf: ReturnType<typeof writer>, shape: Shape, at: (p: Pt) => Pt) {
  for (const c of [shape.outer, ...shape.cutouts]) dxf.poly(c.map(at), "CUT", true);
  for (const c of shape.pockets) dxf.poly(c.map(at), "POCKET", true);
}

export function partsFile(calc: Pick<Calc, "rows">) {
  const dxf = writer();
  let x = 0;
  for (const r of calc.rows) {
    dxf.text(x, r.b + 20, 25, `${r.code} ${r.name} | ${materialLabel(r.material)} | ${num(r.a, 1)} x ${num(r.b, 1)} | ${r.qty} шт`);
    const dx = x;
    contours(dxf, r.shape, ([px, py]) => [px + dx, py]);
    for (const h of r.holes) dxf.hole(x + h.x, h.y, h);
    x += r.a + 200;
  }
  return dxf.end();
}

export function sheetsFile(calc: Pick<Calc, "nests" | "solids">) {
  const dxf = writer(), byId = new Map<string, Solid>(calc.solids.map((s) => [s.part.id, s]));
  // Материалы — строками друг под другом, листы одного материала — в ряд слева направо.
  let y = 0;
  for (const n of calc.nests) {
    n.sheets.forEach((sheet, i) => {
      const x = i * (n.W + 300);
      dxf.text(x, y + n.H + 30, 50, `${materialLabel(n.material)} | лист ${i + 1} из ${n.sheets.length}`);
      dxf.rect(x, y, n.W, n.H, "STOCK");
      for (const p of sheet) {
        const s = byId.get(p.id)!;
        const dy = y, at = (q: Pt): Pt => [onSheet(p, q)[0] + x, onSheet(p, q)[1] + dy];
        contours(dxf, s.shape, at);
        for (const h of s.holes) dxf.hole(...at([h.x, h.y]), h);
        dxf.text(x + p.x + 15, y + p.y + 15, 25, s.code);
      }
    });
    y -= n.H + 400;
  }
  return dxf.end();
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDxf(state: AppState, calc: Calc) {
  download(`${state.name} — детали.dxf`, partsFile(calc), "application/dxf");
  download(`${state.name} — раскрой.dxf`, sheetsFile(calc), "application/dxf");
}

export const downloadProject = (state: AppState) => download(`${state.name}.json`, JSON.stringify(state, null, 2), "application/json");
