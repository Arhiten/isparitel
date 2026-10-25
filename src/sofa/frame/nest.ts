import type { Pt } from "./model";

// Раскладка по настоящему контуру: детали входят выступами в выемки соседей и в окна крупных деталей.
// Лист разбит на клетки CELL × CELL. Поставленная деталь занимает клетки своего материала вместе с полосой
// шириной в расстояние между деталями; новая деталь ищет место ниже-левее, где её клетки свободны.
// Клетки берутся с запасом, поэтому расстояние между деталями выходит не меньше заданного (до клетки больше).
// Клетка — 5 мм, а при меньшем расстоянии между деталями — по нему, но не мельче 2 мм: иначе раскладка считается слишком долго.

export type Angle = 0 | 90 | 180 | 270;
export type Piece = { id: string; a: number; b: number; outer: Pt[]; cutouts: Pt[][] };
/** Деталь на листе: x, y — левый нижний угол габарита после поворота, w × h — этот габарит. */
export type Spot = { id: string; x: number; y: number; w: number; h: number; angle: Angle };

const cellFor = (gap: number) => Math.min(5, Math.max(2, gap));

/** Точка детали a × b после поворота против часовой стрелки, от левого нижнего угла нового габарита. */
export function turn([x, y]: Pt, a: number, b: number, angle: Angle): Pt {
  if (angle === 90) return [b - y, x];
  if (angle === 180) return [a - x, b - y];
  if (angle === 270) return [y, a - x];
  return [x, y];
}

function inside(x: number, y: number, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDistance(x: number, y: number, rings: Pt[][]) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return best;
}

/** Деталь в одном из поворотов и её клетки: сначала у кромки — там столкновения находятся быстрее. */
type Form = { angle: Angle; w: number; h: number; outer: Pt[]; cutouts: Pt[][]; cells: Int32Array };

const solid = (x: number, y: number, f: Pick<Form, "outer" | "cutouts">) => inside(x, y, f.outer) && !f.cutouts.some((c) => inside(x, y, c));

function formsOf(p: Piece, rotate: boolean, CELL: number): Form[] {
  const HALF = CELL * Math.SQRT1_2;
  return ((rotate ? [0, 90, 180, 270] : [0]) as Angle[]).map((angle) => {
    const outer = p.outer.map((q) => turn(q, p.a, p.b, angle)), cutouts = p.cutouts.map((c) => c.map((q) => turn(q, p.a, p.b, angle)));
    const w = angle % 180 ? p.b : p.a, h = angle % 180 ? p.a : p.b, rings = [outer, ...cutouts];
    const edge: number[] = [], body: number[] = [];
    for (let cy = -1; cy <= Math.ceil(h / CELL); cy++) {
      for (let cx = -1; cx <= Math.ceil(w / CELL); cx++) {
        const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL, d = edgeDistance(x, y, rings);
        if (!solid(x, y, { outer, cutouts }) && d > HALF) continue;
        (d <= 3 * CELL ? edge : body).push(cx, cy);
      }
    }
    return { angle, w, h, outer, cutouts, cells: Int32Array.from([...edge, ...body]) };
  });
}

type Sheet = { busy: Uint8Array; spots: Spot[] };

export function nestShapes(pieces: Piece[], W: number, H: number, margin: number, gap: number, rotate: boolean) {
  const CELL = cellFor(gap), HALF = CELL * Math.SQRT1_2;
  const NX = Math.ceil(W / CELL), NY = Math.ceil(H / CELL);
  const forms = new Map(pieces.map((p) => [p.id, formsOf(p, rotate, CELL)]));

  const fits = (s: Sheet, f: Form, ox: number, oy: number) => {
    const c = f.cells;
    for (let i = 0; i < c.length; i += 2) {
      const gx = ox + c[i], gy = oy + c[i + 1];
      if (gx >= 0 && gy >= 0 && gx < NX && gy < NY && s.busy[gy * NX + gx]) return false;
    }
    return true;
  };

  /** Самое нижнее, затем самое левое место для детали среди всех её поворотов. */
  const find = (s: Sheet, list: Form[]) => {
    let best: { f: Form; ox: number; oy: number } | null = null;
    for (const f of list) {
      const x0 = Math.ceil(margin / CELL), y0 = Math.ceil(margin / CELL), x1 = Math.floor((W - margin - f.w) / CELL), y1 = Math.floor((H - margin - f.h) / CELL);
      search: for (let oy = y0; oy <= y1; oy++) {
        if (best && oy * CELL + f.h > best.oy * CELL + best.f.h) break;
        for (let ox = x0; ox <= x1; ox++) {
          if (!fits(s, f, ox, oy)) continue;
          const top = oy * CELL + f.h, bestTop = best ? best.oy * CELL + best.f.h : Infinity;
          if (top < bestTop - 1e-6 || (Math.abs(top - bestTop) <= 1e-6 && ox < best!.ox)) best = { f, ox, oy };
          break search;
        }
      }
    }
    return best;
  };

  /** Помечает клетки детали и полосу шириной gap вокруг её материала. */
  const occupy = (s: Sheet, f: Form, ox: number, oy: number) => {
    const reach = gap + HALF, rings = [f.outer, ...f.cutouts];
    const gx0 = Math.max(0, ox - Math.ceil(reach / CELL) - 1), gx1 = Math.min(NX - 1, ox + Math.ceil((f.w + reach) / CELL) + 1);
    const gy0 = Math.max(0, oy - Math.ceil(reach / CELL) - 1), gy1 = Math.min(NY - 1, oy + Math.ceil((f.h + reach) / CELL) + 1);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (s.busy[gy * NX + gx]) continue;
        const x = (gx - ox + 0.5) * CELL, y = (gy - oy + 0.5) * CELL;
        if (solid(x, y, f) || edgeDistance(x, y, rings) <= reach) s.busy[gy * NX + gx] = 1;
      }
    }
  };

  const run = (order: Piece[]) => {
    const sheets: Sheet[] = [], unplaced: string[] = [];
    for (const p of order) {
      const list = forms.get(p.id)!;
      let done = false;
      for (const s of [...sheets, null]) {
        const sheet = s ?? { busy: new Uint8Array(NX * NY), spots: [] };
        const at = find(sheet, list);
        if (!at) continue;
        occupy(sheet, at.f, at.ox, at.oy);
        sheet.spots.push({ id: p.id, x: at.ox * CELL, y: at.oy * CELL, w: at.f.w, h: at.f.h, angle: at.f.angle });
        if (!s) sheets.push(sheet);
        done = true;
        break;
      }
      if (!done) unplaced.push(p.id);
    }
    return { sheets: sheets.map((s) => s.spots), unplaced };
  };

  // Два порядка укладки — по площади и по длинной стороне; берётся вариант с меньшим числом листов и более низким верхом последнего.
  const area = (p: Piece) => p.a * p.b;
  const results = [[...pieces].sort((p, q) => area(q) - area(p)), [...pieces].sort((p, q) => Math.max(q.a, q.b) - Math.max(p.a, p.b) || area(q) - area(p))].map(run);
  const top = (r: (typeof results)[number]) => Math.max(0, ...(r.sheets.at(-1) ?? []).map((s) => s.y + s.h));
  return results.reduce((best, r) => (r.unplaced.length < best.unplaced.length || (r.unplaced.length === best.unplaced.length && (r.sheets.length < best.sheets.length || (r.sheets.length === best.sheets.length && top(r) < top(best)))) ? r : best));
}
