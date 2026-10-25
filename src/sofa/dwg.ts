// Фактический контур детали из DWG (только сервер): замкнутые полилинии — контур и окна, окружности — отверстия.
// Чертёж может содержать несколько деталей (например, две зеркальные панели спинки) — каждая возвращается отдельно,
// а к детали модели подбирается та, у которой окна расположены так же.

import path from "node:path";
import type { Pt, Shape } from "./frame/model";

export type Panel = { shape: Shape; a: number; b: number };

type XY = { x: number; y: number };
type Vertex = XY & { bulge?: number };
type Entity = {
  type: string;
  layer?: string;
  isInPaperSpace?: boolean;
  vertices?: Vertex[];
  flag?: number;
  center?: XY;
  radius?: number;
  name?: string;
  insertionPoint?: XY;
  xScale?: number;
  yScale?: number;
  rotation?: number;
  /** Цвет AutoCAD: 256 — по слою. */
  colorIndex?: number;
  startPoint?: XY;
  endPoint?: XY;
  startAngle?: number;
  endAngle?: number;
};
type Block = { name: string; entities?: Entity[]; basePoint?: XY };

/** Дуга по выпуклости (bulge) отрезка полилинии — точками через ~10°. */
function arc(p: Pt, q: Pt, bulge: number): Pt[] {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (!d) return [];
  const sweep = 4 * Math.atan(bulge);
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  const nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d;
  const off = (d * (1 - bulge * bulge)) / (4 * bulge);
  const cx = mx + nx * off, cy = my + ny * off, r = Math.hypot(p[0] - cx, p[1] - cy);
  const a0 = Math.atan2(p[1] - cy, p[0] - cx), steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  const out: Pt[] = [];
  for (let i = 1; i < steps; i++) out.push([cx + r * Math.cos(a0 + (sweep * i) / steps), cy + r * Math.sin(a0 + (sweep * i) / steps)]);
  return out;
}

type Ring = Pt[] & { layer?: string; pocket?: boolean };
type Circle = { x: number; y: number; d: number };
type Transform = (p: XY) => Pt;

/** Слой выборки на неполную глубину (фрезеровка, карман): такие контуры — не окна, деталь под ними не прорезана. */
export const POCKET_LAYER = /выборк|фрез|карман|pocket|глуб/i;

/** Отрезок контура с меткой слоя: из них собираются контуры, нарисованные по кускам. pocket — кусок контура выборки. */
type Piece = { pts: Pt[]; layer?: string; pocket?: boolean };

/** Жёлтый (цвет 2 AutoCAD) — выборка на неполную глубину: так паз 3 мм отмечен в чертежах боков шухлятки, голубым — сквозной рез. */
const YELLOW = 2, BYLAYER = 256;

/**
 * segs — куда складывать незамкнутые куски (отрезки, дуги, открытые полилинии); null — куски не нужны.
 * Так рисует ArchiCAD: контур детали — набор отрезков и дуг скругления, а не одна замкнутая полилиния.
 * Выборка — контур со слоя выборки или жёлтого цвета (свой цвет или цвет слоя); yellow — жёлтые слои чертежа.
 */
function collect(entities: Entity[], blocks: Map<string, Block>, at: Transform, mirrored: boolean, rings: Ring[], circles: Circle[], pockets: Ring[], segs: Piece[] | null, yellow: Set<string>, depth = 0) {
  for (const e of entities) {
    if (e.isInPaperSpace) continue;
    const pocket = POCKET_LAYER.test(e.layer ?? "") || e.colorIndex === YELLOW || (e.colorIndex === BYLAYER && yellow.has(e.layer ?? ""));
    if (segs && e.type === "LINE" && e.startPoint && e.endPoint) segs.push({ pts: [at(e.startPoint), at(e.endPoint)], layer: e.layer, pocket });
    else if (segs && e.type === "ARC" && e.center && e.radius && e.startAngle !== undefined && e.endAngle !== undefined) {
      const c = e.center, r = e.radius, a0 = e.startAngle, a1 = e.endAngle < a0 ? e.endAngle + 2 * Math.PI : e.endAngle;
      const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 18)));
      segs.push({ pts: Array.from({ length: steps + 1 }, (_, i) => at({ x: c.x + r * Math.cos(a0 + ((a1 - a0) * i) / steps), y: c.y + r * Math.sin(a0 + ((a1 - a0) * i) / steps) })), layer: e.layer, pocket });
    }
    if (e.type === "LWPOLYLINE" && e.vertices && e.vertices.length > 1) {
      const v = e.vertices, closed = !!((e.flag ?? 0) & 1) || !!((e.flag ?? 0) & 512) || (v.length > 2 && Math.hypot(v[0].x - v.at(-1)!.x, v[0].y - v.at(-1)!.y) < 0.01);
      // Замкнутая полилиния из двух вершин с дугами — окружность (так рисуют круглую выборку), тоже контур.
      if (!closed || (v.length < 3 && !v.some((p) => p.bulge))) {
        // Незамкнутая полилиния — кусок контура; дуги по выпуклости вершин сохраняются (иначе скругление под фрезу
        // превращалось бы в хорду под 45° и давало ложные пересечения на шипах).
        if (segs) {
          const pts: Pt[] = [];
          for (let i = 0; i < v.length; i++) {
            const p = at(v[i]);
            pts.push(p);
            const b = (v[i].bulge ?? 0) * (mirrored ? -1 : 1);
            if (b && i + 1 < v.length) pts.push(...arc(p, at(v[i + 1]), b));
          }
          segs.push({ pts, layer: e.layer, pocket });
        }
        continue;
      }
      const ring: Ring = [];
      for (let i = 0; i < v.length; i++) {
        const p = at(v[i]), q = at(v[(i + 1) % v.length]);
        ring.push(p);
        const b = (v[i].bulge ?? 0) * (mirrored ? -1 : 1);
        if (b) ring.push(...arc(p, q, b));
      }
      const tagged: Ring = Object.assign(ring, { layer: e.layer });
      (pocket ? pockets : rings).push(tagged);
    } else if (e.type === "CIRCLE" && e.center && e.radius) {
      const [x, y] = at(e.center);
      circles.push({ x, y, d: 2 * e.radius });
    } else if (e.type === "INSERT" && e.name && depth < 4) {
      const blk = blocks.get(e.name);
      if (!blk?.entities) continue;
      const sx = e.xScale ?? 1, sy = e.yScale ?? 1, rot = e.rotation ?? 0, ip = e.insertionPoint ?? { x: 0, y: 0 }, bp = blk.basePoint ?? { x: 0, y: 0 };
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const inner: Transform = (p) => {
        const x = (p.x - bp.x) * sx, y = (p.y - bp.y) * sy;
        return at({ x: ip.x + x * cos - y * sin, y: ip.y + x * sin + y * cos });
      };
      collect(blk.entities, blocks, inner, mirrored !== sx * sy < 0, rings, circles, pockets, segs, yellow, depth + 1);
    }
  }
}

/** Собирает куски в замкнутые контуры: концы сходятся с допуском 0,05 мм; незамкнувшиеся цепочки отбрасываются. Есть жёлтый кусок — контур выборки. */
export function chain(pieces: Piece[]): Ring[] {
  const tol = 0.05, same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  const left = pieces.filter((p) => p.pts.length > 1);
  const rings: Ring[] = [];
  while (left.length) {
    const first = left.pop()!;
    let pts = first.pts.slice(), pocket = !!first.pocket;
    for (let grown = true; grown && !(pts.length > 3 && same(pts[0], pts.at(-1)!)); ) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i].pts, head = pts[0], tail = pts.at(-1)!;
        if (same(s[0], tail)) pts = pts.concat(s.slice(1));
        else if (same(s.at(-1)!, tail)) pts = pts.concat(s.slice(0, -1).reverse());
        else if (same(s.at(-1)!, head)) pts = s.concat(pts.slice(1));
        else if (same(s[0], head)) pts = s.slice(1).reverse().concat(pts);
        else continue;
        pocket ||= !!left[i].pocket;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (pts.length > 3 && same(pts[0], pts.at(-1)!)) rings.push(Object.assign(pts.slice(0, -1), { layer: first.layer, pocket }));
  }
  return rings;
}

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const bbox = (pts: Pt[]) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/**
 * Детали чертежа: внешний контур — замкнутая полилиния вне других; окна — полилинии внутри неё; отверстия — окружности внутри.
 * pockets — контуры со слоя выборки: остаются выборкой детали (кольцо из двух контуров — выборка между ними).
 */
export function panelsOf(all: Ring[], circles: Circle[], pockets: Ring[] = []): Panel[] {
  // Есть слой «контур» — детали только на нём; остальное (слой 0 и др.) — вспомогательные виды, сечения, рамки.
  const contour = all.filter((r) => /контур|contour|cut/i.test(r.layer ?? ""));
  const rings = contour.length ? contour : all;
  const outers = rings.filter((r) => !rings.some((o) => o !== r && inside(r[0], o)));
  return outers
    .map((outer) => {
      const cutouts = rings.filter((r) => r !== outer && inside(r[0], outer) && !rings.some((o) => o !== r && o !== outer && inside(r[0], o)));
      // Ступенчатое отверстие рисуют двумя окружностями с общим центром — берётся большая.
      const drills: Circle[] = [];
      for (const c of circles) {
        if (!inside([c.x, c.y], outer) || cutouts.some((k) => inside([c.x, c.y], k))) continue;
        const same = drills.find((h) => Math.hypot(h.x - c.x, h.y - c.y) < 0.5);
        if (same) same.d = Math.max(same.d, c.d);
        else drills.push({ ...c });
      }
      const b = bbox(outer), move = (p: Pt): Pt => [p[0] - b.x0, p[1] - b.y0];
      const own = pockets.filter((k) => {
        const c = bbox(k);
        return inside([(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2], outer);
      });
      const shape: Shape = { outer: outer.map(move), cutouts: cutouts.map((c) => c.map(move)), pockets: own.map((c) => c.map(move)), drills: drills.map((h) => ({ x: h.x - b.x0, y: h.y - b.y0, d: +h.d.toFixed(2) })) };
      return { shape, a: b.x1 - b.x0, b: b.y1 - b.y0, x0: b.x0 };
    })
    .sort((p, q) => p.x0 - q.x0)
    .map(({ shape, a, b }) => ({ shape, a, b }));
}

/** Файл — текстовый DXF (начинается с секции), а не двоичный DWG. */
export const isDxf = (data: Buffer) => /^\s*0\s*\r?\n\s*SECTION/.test(data.subarray(0, 64).toString("latin1"));

/**
 * Чтение текстового DXF в те же объекты, что даёт DWG: отрезки, дуги, окружности, полилинии (LWPOLYLINE и POLYLINE R12
 * с выпуклостью вершин), блоки и их вставки; цвета слоёв — из таблицы LAYER. Углы дуг в DXF — в градусах.
 */
function readDxf(data: Buffer) {
  const lines = data.toString("utf8").split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([+lines[i].trim(), lines[i + 1].trim()]);
  const yellow = new Set<string>();
  const blocks: Block[] = [];
  const entities: Entity[] = [];
  let section = "", target: Entity[] = entities, block: Block | null = null;
  let cur: (Entity & { _layerTable?: boolean }) | null = null, poly: Entity | null = null, vertex: Vertex | null = null;
  let layerName = "", inLayer = false;
  const finish = () => {
    if (vertex && poly) poly.vertices!.push(vertex);
    vertex = null;
    if (cur && cur.type !== "VERTEX" && cur.type !== "SEQEND" && cur.type !== "POLYLINE") target.push(cur);
    cur = null;
  };
  for (const [code, value] of pairs) {
    if (code === 0) {
      finish();
      if (inLayer) inLayer = false;
      if (value === "SECTION" || value === "ENDSEC" || value === "EOF") { section = value === "SECTION" ? "?" : ""; continue; }
      if (section === "TABLES" && value === "LAYER") { inLayer = true; layerName = ""; continue; }
      if (section === "BLOCKS" && value === "BLOCK") { block = { name: "", entities: [], basePoint: { x: 0, y: 0 } }; blocks.push(block); target = block.entities!; continue; }
      if (section === "BLOCKS" && value === "ENDBLK") { block = null; target = entities; continue; }
      if (value === "POLYLINE") { poly = { type: "LWPOLYLINE", vertices: [], flag: 0 }; target.push(poly); cur = { type: "POLYLINE" }; continue; }
      if (value === "VERTEX" && poly) { vertex = { x: 0, y: 0 }; cur = { type: "VERTEX" }; continue; }
      if (value === "SEQEND") { poly = null; cur = { type: "SEQEND" }; continue; }
      if (section === "ENTITIES" || section === "BLOCKS") cur = { type: value, vertices: value === "LWPOLYLINE" ? [] : undefined };
      continue;
    }
    if (section === "?" && code === 2) { section = value; continue; }
    if (inLayer) {
      if (code === 2) layerName = value;
      if (code === 62 && Math.abs(+value) === YELLOW) yellow.add(layerName);
      continue;
    }
    if (block && !cur && code === 2) { block.name = value; continue; }
    if (block && !cur && code === 10) { block.basePoint!.x = +value; continue; }
    if (block && !cur && code === 20) { block.basePoint!.y = +value; continue; }
    if (vertex) {
      if (code === 10) vertex.x = +value;
      if (code === 20) vertex.y = +value;
      if (code === 42) vertex.bulge = +value;
      continue;
    }
    const header = cur?.type === "POLYLINE", e = header ? poly : cur;
    if (!e) continue;
    // У заголовка POLYLINE точка 10/20 — не вершина (вершины идут отдельными VERTEX).
    if (header && (code === 10 || code === 20 || code === 30)) continue;
    if (code === 8) e.layer = value;
    else if (code === 62) e.colorIndex = +value;
    else if (code === 70) e.flag = +value;
    else if (code === 2) e.name = value;
    else if (e.type === "LWPOLYLINE" && e.vertices && (code === 10 || code === 20 || code === 42)) {
      if (code === 10) e.vertices.push({ x: +value, y: 0 });
      else if (code === 20) e.vertices.at(-1)!.y = +value;
      else e.vertices.at(-1)!.bulge = +value;
    } else if (code === 10 || code === 20) {
      const k = code === 10 ? "x" : "y";
      if (e.type === "LINE") (e.startPoint ??= { x: 0, y: 0 })[k] = +value;
      else if (e.type === "INSERT") (e.insertionPoint ??= { x: 0, y: 0 })[k] = +value;
      else (e.center ??= { x: 0, y: 0 })[k] = +value;
    } else if (code === 11 || code === 21) (e.endPoint ??= { x: 0, y: 0 })[code === 11 ? "x" : "y"] = +value;
    else if (code === 40) e.radius = +value;
    else if (code === 41) e.xScale = +value;
    else if (code === 42) e.yScale = +value;
    else if (code === 50 && e.type === "INSERT") e.rotation = (+value * Math.PI) / 180;
    else if (code === 50) e.startAngle = (+value * Math.PI) / 180;
    else if (code === 51) e.endAngle = (+value * Math.PI) / 180;
  }
  finish();
  // R12 POLYLINE: признак замкнутости — бит 1 флага 70 у заголовка, как у LWPOLYLINE.
  return { entities, blocks, yellow };
}

/** Чтение чертежа: DXF — своим разбором, DWG — библиотекой. */
async function readDrawing(data: Buffer) {
  return isDxf(data) ? readDxf(data) : readDwg(data);
}

/** Чтение DWG. Экземпляр библиотеки — на каждый файл: повторное чтение тем же экземпляром падает внутри WASM. */
async function readDwg(data: Buffer) {
  const { Dwg_File_Type, LibreDwg } = await import("@mlightcad/libredwg-web");
  const l = await LibreDwg.create(path.join(process.cwd(), "node_modules", "@mlightcad", "libredwg-web", "wasm") + path.sep);
  const ptr = l.dwg_read_data(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, Dwg_File_Type.DWG);
  if (!ptr) throw new Error("Не удалось прочитать DWG");
  const db = l.convert(ptr);
  l.dwg_free(ptr);
  const yellow = new Set((db.tables.LAYER.entries as unknown as { name: string; colorIndex?: number }[]).filter((x) => x.colorIndex === YELLOW).map((x) => x.name));
  return { entities: db.entities as unknown as Entity[], blocks: db.tables.BLOCK_RECORD.entries as unknown as Block[], yellow };
}

/** Замкнутые контуры: сразу замкнутые полилинии и собранные из кусков; собранные из кусков выборки уходят к выборкам. */
const split = (rings: Ring[], pockets: Ring[], segs: Piece[]) => {
  const chained = chain(segs);
  return { rings: [...rings, ...chained.filter((r) => !r.pocket)], pockets: [...pockets, ...chained.filter((r) => r.pocket)] };
};

/**
 * Детали из DWG; пустой список — в чертеже нет замкнутого контура (или файл не DWG).
 * pieces — собирать контуры и из отдельных отрезков и дуг (чертежи из ArchiCAD); у дивана выключено:
 * там отрезки на слое 0 — вспомогательные виды, и они не должны становиться деталями.
 */
export async function readPanels(data: Buffer, pieces = false): Promise<Panel[]> {
  const { entities, blocks, yellow } = await readDrawing(data);
  const byName = new Map(blocks.filter((b) => !b.name.startsWith("*")).map((b) => [b.name, b]));
  const rings: Ring[] = [], circles: Circle[] = [], pockets: Ring[] = [], segs: Piece[] = [];
  collect(entities, byName, (p) => [p.x, p.y], false, rings, circles, pockets, pieces ? segs : null, yellow);
  const all = split(rings, pockets, segs);
  return panelsOf(all.rings, circles, all.pockets);
}

/** Деталь каждого блока чертежа в его собственных координатах: имя блока → деталь (первая, если их в блоке несколько). */
export async function readBlockPanels(data: Buffer): Promise<Map<string, Panel>> {
  const { blocks, yellow } = await readDrawing(data);
  const byName = new Map(blocks.filter((b) => !b.name.startsWith("*")).map((b) => [b.name, b]));
  const out = new Map<string, Panel>();
  for (const [name, b] of byName) {
    const rings: Ring[] = [], circles: Circle[] = [], pockets: Ring[] = [], segs: Piece[] = [];
    collect(b.entities ?? [], byName, (p) => [p.x, p.y], false, rings, circles, pockets, segs, yellow);
    const all = split(rings, pockets, segs);
    const panels = panelsOf(all.rings, circles, all.pockets);
    if (panels.length) out.set(name, panels[0]);
  }
  return out;
}

type Box = ReturnType<typeof bbox>;
const near = (p: Box, q: Box, tol = 2) => Math.abs(p.x0 - q.x0) < tol && Math.abs(p.y0 - q.y0) < tol && Math.abs(p.x1 - q.x1) < tol && Math.abs(p.y1 - q.y1) < tol;

/** Точки контура на каждой кромке (низ, право, верх, лево) — по ним видно, где шипы. */
const edgeProfile = (s: Shape, a: number, b: number) => [(p: Pt) => p[1] < 0.5, (p: Pt) => p[0] > a - 0.5, (p: Pt) => p[1] > b - 0.5, (p: Pt) => p[0] < 0.5].map((on) => s.outer.filter(on).length);

/**
 * Деталь чертежа в положении детали модели: чертёж бывает повёрнут или зеркален относительно модели
 * (дно 359,8 × 299,8 при модели 299,8 × 359,8). Перебираются 8 положений прямоугольника с подходящим габаритом,
 * берётся то, где шипы на тех же кромках, а внутренние контуры — на тех же местах. Не подошло ни одно — деталь как есть.
 */
export function orient(panel: Panel, model: { shape?: Shape; a: number; b: number }): Panel {
  if (!model.shape) return panel;
  const { a, b } = panel;
  const moves: [number, number, (p: Pt) => Pt][] = [
    [a, b, (p) => p],
    [a, b, (p) => [a - p[0], b - p[1]]],
    [a, b, (p) => [a - p[0], p[1]]],
    [a, b, (p) => [p[0], b - p[1]]],
    [b, a, (p) => [p[1], p[0]]],
    [b, a, (p) => [b - p[1], a - p[0]]],
    [b, a, (p) => [b - p[1], p[0]]],
    [b, a, (p) => [p[1], a - p[0]]],
  ];
  const want = edgeProfile(model.shape, model.a, model.b);
  const inner = [...model.shape.cutouts, ...model.shape.pockets].map(bbox);
  let best: { p: Panel; score: number } | null = null;
  for (const [w, h, f] of moves) {
    if (Math.abs(w - model.a) > 2 || Math.abs(h - model.b) > 2) continue;
    const s = panel.shape;
    const shape: Shape = { outer: s.outer.map(f), cutouts: s.cutouts.map((c) => c.map(f)), pockets: s.pockets.map((c) => c.map(f)), drills: s.drills.map((d) => {
        const [x, y] = f([d.x, d.y]);
        return { x, y, d: d.d };
      }) };
    const have = edgeProfile(shape, w, h);
    const lost = [...shape.cutouts, ...shape.pockets].map(bbox).filter((k) => !inner.some((m) => near(k, m))).length;
    const score = have.reduce((sum, n, i) => sum + Math.abs(n - want[i]), 0) + 10 * lost;
    if (!best || score < best.score) best = { p: { shape, a: w, b: h }, score };
  }
  return best?.p ?? panel;
}

/**
 * Окна чертежа, которые совпадают с выборками модели, — тоже выборки: в чертежах ArchiCAD выборка нарисована
 * на том же слое, что и рез (дно шухлятки, выборка 2 мм), и иначе стала бы сквозным окном.
 */
export function pocketsLikeModel(panel: Panel, model: { shape?: Shape }): Panel {
  // Открытый паз рисуют с выходом за кромку (проход фрезы, у боков шухлятки — на 20 мм): сравнивается часть внутри детали.
  const clip = (k: Box): Box => ({ x0: Math.max(0, k.x0), y0: Math.max(0, k.y0), x1: Math.min(panel.a, k.x1), y1: Math.min(panel.b, k.y1) });
  const ref = model.shape?.pockets.map((c) => clip(bbox(c))) ?? [];
  if (!ref.length) return panel;
  const isPocket = (c: Pt[]) => ref.some((m) => near(clip(bbox(c)), m));
  const s = panel.shape;
  return { ...panel, shape: { ...s, cutouts: s.cutouts.filter((c) => !isPocket(c)), pockets: [...s.pockets, ...s.cutouts.filter(isPocket)] } };
}

/** Центры окон в долях габарита — по ним деталь чертежа узнаёт свою деталь модели (например, левую и правую панель). */
const windows = (s: Shape, a: number, b: number) =>
  s.cutouts.map((c) => {
    const k = bbox(c);
    return [(k.x0 + k.x1) / 2 / a, (k.y0 + k.y1) / 2 / b] as Pt;
  });

export function matchPanel(panels: Panel[], model: { shape?: Shape; a: number; b: number }): Panel | undefined {
  if (panels.length <= 1 || !model.shape) return panels[0];
  const want = windows(model.shape, model.a, model.b);
  const score = (p: Panel) => {
    const have = windows(p.shape, p.a, p.b);
    const miss = want.reduce((sum, w) => sum + Math.min(1, ...have.map((h) => Math.hypot(h[0] - w[0], h[1] - w[1]))), 0);
    return miss + Math.abs(have.length - want.length) + Math.abs(p.a / p.b - model.a / model.b);
  };
  return panels.reduce((best, p) => (score(p) < score(best) ? p : best));
}
