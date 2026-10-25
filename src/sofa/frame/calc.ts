import { area } from "./area";
import { type Angle, nestShapes } from "./nest";
import { type AppState, type Connector, type Joint, type Material, type Part, type Plane, type Pt, type Shape, materialLabel, num, uid } from "./model";

export type V = [number, number, number];
/** Отверстие или метка коннектора в координатах детали: x — по стороне A, y — по стороне B. edge — коннектор входит в кромку. */
export type Hole = { x: number; y: number; d: number; edge: boolean };
/** Панель в сборе: габаритный брус в координатах изделия; shape — её контуры, area — чистая площадь без вырезов. */
export type Solid = { part: Part; material: Material; code: string; min: V; max: V; t: number; area: number; weight: number; shape: Shape; holes: Hole[] };
/** Пятно касания двух панелей: axis — ось, по которой они прижаты друг к другу. */
export type Contact = { axis: number; lo: V; hi: V };
export type Link = { joint: Joint; a: Solid; b: Solid; connector: Connector; contact: Contact | null; points: V[] };

export type Status = "ok" | "warn" | "fail";
export type Check = { title: string; detail: string; status: Status; k?: number };

/** Оси сторон A, B и толщины для каждой плоскости. */
const AXES: Record<Plane, V> = { xy: [0, 1, 2], xz: [0, 2, 1], yz: [1, 2, 0] };
const EPS = 0.5;
const G = 9.81;
/** Запас на опрокидывание, ниже которого диван считается неустойчивым. */
const TIP = 1.5;
/** Ширина полосы настила, которая работает под одним человеком. */
const SEAT_STRIP = 400;

const worse = (a: Status, b: Status): Status => (a === "fail" || b === "fail" ? "fail" : a === "warn" || b === "warn" ? "warn" : "ok");
const grade = (k: number, need: number): Status => (k >= need ? "ok" : k >= 1 ? "warn" : "fail");

function touch(a: Solid, b: Solid): Contact | "clash" | null {
  const lo: V = [0, 0, 0], hi: V = [0, 0, 0];
  let axis = -1, flat = 0;
  for (let k = 0; k < 3; k++) {
    lo[k] = Math.max(a.min[k], b.min[k]);
    hi[k] = Math.min(a.max[k], b.max[k]);
    if (hi[k] - lo[k] < -EPS) return null;
    if (hi[k] - lo[k] <= EPS) {
      axis = k;
      flat++;
    }
  }
  if (!flat) return "clash";
  return flat === 1 ? { axis, lo, hi } : null;
}

/** Длинная и короткая оси пятна касания. */
function along(c: Contact) {
  const [u, v] = [0, 1, 2].filter((k) => k !== c.axis);
  return c.hi[u] - c.lo[u] >= c.hi[v] - c.lo[v] ? [u, v] : [v, u];
}

/** Коннекторы стоят равномерно по длине стыка, по оси пятна касания. */
function spread(c: Contact, n: number): V[] {
  const [long, short] = along(c);
  return Array.from({ length: n }, (_, i) => {
    const p: V = [0, 0, 0];
    p[c.axis] = (c.lo[c.axis] + c.hi[c.axis]) / 2;
    p[short] = (c.lo[short] + c.hi[short]) / 2;
    p[long] = c.lo[long] + ((c.hi[long] - c.lo[long]) * (i + 0.5)) / n;
    return p;
  });
}

export function solidsOf(state: AppState): Solid[] {
  return state.parts.map((part) => {
    const material = state.materials.find((m) => m.id === part.materialId) ?? state.materials[0];
    const [ia, ib, it] = AXES[part.plane];
    const min: V = [part.x, part.y, part.z], max: V = [part.x, part.y, part.z];
    // Наклонённая панель занимает габарит повёрнутого бруса: нижнее ребро остаётся на своей высоте.
    const t = material.thickness, angle = part.plane === "xy" ? 0 : ((part.tilt ?? 0) * Math.PI) / 180, sin = Math.sin(angle), cos = Math.cos(angle);
    max[ia] += part.a;
    max[ib] += part.b * cos + t * Math.abs(sin);
    min[it] += Math.min(0, part.b * sin);
    max[it] += Math.max(0, part.b * sin) + t * cos;
    const shape = part.shape ?? { outer: [[0, 0], [part.a, 0], [part.a, part.b], [0, part.b]], cutouts: [], pockets: [], drills: [] };
    const net = area(shape.outer) - shape.cutouts.reduce((sum, c) => sum + area(c), 0);
    // У детали с чертежа отверстия под метизы уже заданы; у прямоугольной их расставят стыки.
    const holes = shape.drills.map((h) => ({ ...h, edge: false }));
    // Профиль весит по сортаменту (кг/м), а не по объёму габаритного бруса.
    const weight = material.profile ? (material.profile.kgm * (part.alongB ? part.b : part.a)) / 1000 : (net * material.thickness * material.density) / 1e9;
    return { part, material, code: "", min, max, t: material.thickness, area: net, weight, shape, holes };
  });
}

function linksOf(state: AppState, solids: Solid[]): Link[] {
  const byId = new Map(solids.map((s) => [s.part.id, s]));
  const links: Link[] = [];
  for (const joint of state.joints) {
    const a = byId.get(joint.a), b = byId.get(joint.b), connector = state.connectors.find((c) => c.id === joint.connectorId);
    if (!a || !b || a === b || !connector) continue;
    const found = touch(a, b);
    const contact = found && found !== "clash" ? found : null;
    const points = contact ? spread(contact, Math.max(1, Math.round(joint.qty))) : [];
    for (const s of [a, b]) {
      if (s.part.shape) continue;
      const [ia, ib, it] = AXES[s.part.plane];
      for (const p of points) s.holes.push({ x: p[ia] - s.min[ia], y: p[ib] - s.min[ib], d: connector.holeD, edge: contact!.axis !== it });
    }
    links.push({ joint, a, b, connector, contact, points });
  }
  return links;
}

/** Предлагает стыки для всех касающихся панелей, между которыми стыка ещё нет. */
export function autoJoints(state: AppState): Joint[] {
  const solids = solidsOf(state), connectorId = state.connectors[0]?.id;
  if (!connectorId) return [];
  const known = new Set(state.joints.flatMap((j) => [`${j.a}|${j.b}`, `${j.b}|${j.a}`]));
  const found: Joint[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const c = touch(solids[i], solids[j]);
      if (!c || c === "clash" || known.has(`${solids[i].part.id}|${solids[j].part.id}`)) continue;
      const [long] = along(c), length = c.hi[long] - c.lo[long];
      if (length < 30) continue;
      found.push({ id: uid(), a: solids[i].part.id, b: solids[j].part.id, connectorId, qty: Math.max(2, Math.round(length / Math.max(50, state.settings.jointStep))) });
    }
  }
  return found;
}

// --- Раскладка прямоугольников: MaxRects — деталь ставится в один из свободных прямоугольников по правилу выбора места ---

type Rect = { x: number; y: number; w: number; h: number };
/** angle — поворот детали против часовой стрелки; rot — повёрнута на 90° (для раскладки по габариту). */
export type Placed = Rect & { id: string; rot: boolean; angle?: Angle };
type Bin = { free: Rect[]; placed: Placed[] };

const inside = (o: Rect, r: Rect) => r.x >= o.x - 1e-6 && r.y >= o.y - 1e-6 && r.x + r.w <= o.x + o.w + 1e-6 && r.y + r.h <= o.y + o.h + 1e-6;

type Item = { id: string; w: number; h: number };
/** Правило выбора места: самый тесный прямоугольник по короткой или длинной стороне, по площади, или ниже-левее. */
type Fit = "short" | "long" | "area" | "corner";

const FITS: Record<Fit, (f: Rect, w: number, h: number) => [number, number]> = {
  short: (f, w, h) => [Math.min(f.w - w, f.h - h), Math.max(f.w - w, f.h - h)],
  long: (f, w, h) => [Math.max(f.w - w, f.h - h), Math.min(f.w - w, f.h - h)],
  area: (f, w, h) => [f.w * f.h - w * h, Math.min(f.w - w, f.h - h)],
  corner: (f, _w, h) => [f.y + h, f.x],
};

/** Лучшее место для детали в листе: [оценка, место] или null, если не помещается. */
function spot(bin: Bin, item: Item, gap: number, rotate: boolean, fit: Fit) {
  let best: (Rect & { rot: boolean; score: [number, number] }) | null = null;
  for (const f of bin.free) {
    for (const rot of rotate ? [false, true] : [false]) {
      const w = (rot ? item.h : item.w) + gap, h = (rot ? item.w : item.h) + gap;
      if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
      const score = FITS[fit](f, w, h);
      if (!best || score[0] < best.score[0] - 1e-6 || (Math.abs(score[0] - best.score[0]) <= 1e-6 && score[1] < best.score[1])) best = { x: f.x, y: f.y, w, h, rot, score };
    }
  }
  return best;
}

function put(bin: Bin, item: Item, gap: number, rotate: boolean, fit: Fit = "short") {
  const best = spot(bin, item, gap, rotate, fit);
  if (!best) return false;
  const u = best;
  bin.placed.push({ id: item.id, x: u.x, y: u.y, w: u.w - gap, h: u.h - gap, rot: u.rot });
  const next: Rect[] = [];
  for (const f of bin.free) {
    if (u.x >= f.x + f.w || u.x + u.w <= f.x || u.y >= f.y + f.h || u.y + u.h <= f.y) {
      next.push(f);
      continue;
    }
    if (u.x > f.x) next.push({ x: f.x, y: f.y, w: u.x - f.x, h: f.h });
    if (u.x + u.w < f.x + f.w) next.push({ x: u.x + u.w, y: f.y, w: f.x + f.w - u.x - u.w, h: f.h });
    if (u.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: u.y - f.y });
    if (u.y + u.h < f.y + f.h) next.push({ x: f.x, y: u.y + u.h, w: f.w, h: f.y + f.h - u.y - u.h });
  }
  bin.free = next.filter((r, i) => !next.some((o, j) => j !== i && inside(o, r) && (j < i || !inside(r, o))));
  return true;
}

/** Порядок укладки: сначала крупные — по длинной стороне, площади, периметру, ширине или высоте. */
const ORDERS: ((p: Item, q: Item) => number)[] = [
  (p, q) => Math.max(q.w, q.h) - Math.max(p.w, p.h) || q.w * q.h - p.w * p.h,
  (p, q) => q.w * q.h - p.w * p.h,
  (p, q) => q.w + q.h - p.w - p.h,
  (p, q) => Math.min(q.w, q.h) - Math.min(p.w, p.h) || Math.max(q.w, q.h) - Math.max(p.w, p.h),
  (p, q) => q.h - p.h || q.w - p.w,
  (p, q) => q.w - p.w || q.h - p.h,
];

/** Раскладывает детали по одинаковым полям W × H; зазор gap остаётся между деталями. */
export function pack(items: Item[], W: number, H: number, gap: number, rotate: boolean, order = ORDERS[0], fit: Fit = "short") {
  const bins: Bin[] = [], unplaced: string[] = [];
  const fresh = (): Bin => ({ free: [{ x: 0, y: 0, w: W + gap, h: H + gap }], placed: [] });
  for (const item of [...items].sort(order)) {
    if (bins.some((bin) => put(bin, item, gap, rotate, fit))) continue;
    const bin = fresh();
    if (put(bin, item, gap, rotate, fit)) bins.push(bin);
    else unplaced.push(item.id);
  }
  return { bins: bins.map((b) => b.placed), unplaced };
}

/**
 * Самая плотная раскладка из перебора порядков укладки и правил выбора места.
 * Лучшая — с наименьшим числом листов, а при равенстве — где последний лист занят меньше всего:
 * остальные листы тогда заполнены плотнее, и остаётся крупный цельный обрезок.
 */
export function bestPack(items: Item[], W: number, H: number, gap: number, rotate: boolean) {
  let best: (ReturnType<typeof pack> & { waste: number }) | null = null;
  for (const order of ORDERS) {
    for (const fit of Object.keys(FITS) as Fit[]) {
      const r = pack(items, W, H, gap, rotate, order, fit);
      const last = r.bins.at(-1) ?? [];
      // Занятая часть последнего листа — по высоте верхней детали: обрезок над ней остаётся цельной полосой.
      const waste = last.length ? Math.max(...last.map((p) => p.y + p.h)) : 0;
      const better = !best || r.unplaced.length < best.unplaced.length || (r.unplaced.length === best.unplaced.length && (r.bins.length < best.bins.length || (r.bins.length === best.bins.length && waste < best.waste - 1e-6)));
      if (better) best = { ...r, waste };
    }
  }
  return best!;
}

// --- Деталировка и раскрой ---

export type Row = { code: string; name: string; material: Material; a: number; b: number; qty: number; weight: number; shape: Shape; holes: Hole[] };
/** W × H — лист в раскладке: x идёт по ширине, y — снизу вверх по высоте. Фанерный лист стоит вертикально, хлыст бруска — лёжа. */
export type Nest = { material: Material; W: number; H: number; sheets: Placed[][]; unplaced: Solid[]; pieces: number; netArea: number; cost: number };

/** Одинаковые детали — один материал, размеры и разметка под коннекторы — получают общее обозначение. */
function rowsOf(solids: Solid[]): Row[] {
  const rows = new Map<string, Row>();
  for (const s of solids) {
    const mark = s.holes.map((h) => `${h.x.toFixed(0)},${h.y.toFixed(0)},${h.d},${+h.edge}`).sort().join(";");
    const key = `${s.material.id}|${s.part.a}|${s.part.b}|${mark}|${s.part.shape ? JSON.stringify([s.shape.outer, s.shape.cutouts, s.shape.pockets]) : ""}`;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { code: `Ф-${String(rows.size + 1).padStart(2, "0")}`, name: s.part.name, material: s.material, a: s.part.a, b: s.part.b, qty: 0, weight: s.weight, shape: s.shape, holes: s.holes }));
    row.qty++;
    s.code = row.code;
  }
  return [...rows.values()];
}

/** Раскладка по контуру считается заметное время, поэтому результаты запоминаются по составу деталей и параметрам. */
const shapeNests = new Map<string, ReturnType<typeof nestShapes>>();

function shapeNest(own: Solid[], W: number, H: number, margin: number, gap: number, rotate: boolean) {
  const pieces = own.map((s) => ({ id: s.part.id, a: s.part.a, b: s.part.b, outer: s.shape.outer, cutouts: s.shape.cutouts }));
  const key = JSON.stringify([W, H, margin, gap, rotate, pieces]);
  let result = shapeNests.get(key);
  if (!result) {
    result = nestShapes(pieces, W, H, margin, gap, rotate);
    if (shapeNests.size > 50) shapeNests.clear();
    shapeNests.set(key, result);
  }
  return result;
}

/** Расстояние между деталями и полоса по краю для материала: свои значения материала важнее общих; у бруска полосы нет. */
export function nestParams(state: AppState, material: Material) {
  return { gap: material.gap ?? state.settings.gap, margin: material.bar ? 0 : (material.margin ?? state.settings.margin) };
}

function nestsOf(state: AppState, solids: Solid[]): Nest[] {
  return state.materials.flatMap((material) => {
    // Брусок режется из хлыста по длине и без отступа от кромки; деталь, заданная стоймя (короткой стороной вдоль), поворачивается — поперёк хлыста она всё равно не ляжет.
    const { gap, margin } = nestParams(state, material), rotate = material.bar || state.settings.rotate;
    const own = solids.filter((s) => s.material === material);
    if (!own.length) return [];
    const W = material.bar ? material.sheetL : Math.min(material.sheetW, material.sheetL), H = material.bar ? material.sheetW : Math.max(material.sheetW, material.sheetL);
    const boxes = bestPack(own.map((s) => ({ id: s.part.id, w: s.part.a, h: s.part.b })), W - 2 * margin, H - 2 * margin, gap, rotate);
    let sheets: Placed[][] = boxes.bins.map((bin) => bin.map((p) => ({ ...p, x: p.x + margin, y: p.y + margin, angle: (p.rot ? 90 : 0) as Angle })));
    let unplaced = boxes.unplaced;
    // Лист фанеры раскладывается ещё и по контурам; берётся тот вариант, где меньше листов, а при равенстве — ниже верх последнего листа.
    if (!material.bar) {
      const shaped = shapeNest(own, W, H, margin, gap, rotate);
      const top = (list: { y: number; h: number }[][]) => Math.max(0, ...(list.at(-1) ?? []).map((p) => p.y + p.h));
      if (shaped.unplaced.length < unplaced.length || (shaped.unplaced.length === unplaced.length && (shaped.sheets.length < sheets.length || (shaped.sheets.length === sheets.length && top(shaped.sheets) < top(sheets))))) {
        sheets = shaped.sheets.map((sheet) => sheet.map((p) => ({ ...p, rot: p.angle % 180 !== 0 })));
        unplaced = shaped.unplaced;
      }
    }
    return [{ material, W, H, sheets, unplaced: own.filter((s) => unplaced.includes(s.part.id)), pieces: own.length, netArea: own.reduce((sum, s) => sum + s.area, 0), cost: sheets.length * material.price }];
  });
}

// --- Метизы: сквозные отверстия с чертежей, собранные по диаметрам ---

export type Hardware = { d: number; count: number; where: { solid: Solid; count: number }[]; connector?: Connector };

/** Диаметр отверстия опознаёт метиз: ему соответствует коннектор с таким же отверстием. */
function hardwareOf(state: AppState, solids: Solid[]): Hardware[] {
  const groups = new Map<number, Hardware>();
  for (const solid of solids) {
    for (const h of solid.shape.drills) {
      let g = groups.get(h.d);
      if (!g) groups.set(h.d, (g = { d: h.d, count: 0, where: [], connector: state.connectors.find((c) => Math.abs(c.holeD - h.d) < 0.05) }));
      g.count++;
      const at = g.where.find((w) => w.solid === solid);
      if (at) at.count++;
      else g.where.push({ solid, count: 1 });
    }
  }
  return [...groups.values()].sort((p, q) => q.d - p.d);
}

// --- Метизы по месту: отверстия соседних деталей на одной оси — один метиз ---

/**
 * key — узел: диаметр отверстия и детали пакета (по обозначениям), в нём метизы одинаковые;
 * stack — толщина пакета деталей, который стягивает метиз, мм (наименьшая и наибольшая).
 */
export type Fastener = { key: string; d: number; count: number; stack: [number, number]; names: string; connector?: Connector };

const insidePoly = ([x, y]: Pt, poly: Pt[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
/** Плоскость пласти по оси её нормали. */
const holePlane = (axis: number): Plane => (axis === 2 ? "xy" : axis === 1 ? "xz" : "yz");
/** Мелкий вырез (до этого размера, мм) на оси метиза — его же отверстие, например квадратное под подголовник болта. */
const FASTENER_CUTOUT = 15;

/**
 * Отверстия всех деталей переводятся в координаты изделия; отверстия на одной оси (по нормали к пласти),
 * чьи детали прилегают друг к другу с зазором до 3 мм, — один крепёж через весь пакет. К пакету добавляются
 * прилегающие детали без отверстия, через которые проходит ось (пластина с квадратным отверстием, брусок под саморез).
 */
function fastenersOf(state: AppState, solids: Solid[]): Fastener[] {
  type H = { axis: number; u: number; v: number; lo: number; hi: number; d: number; solid: Solid };
  const local = (s: Solid, u: number, v: number): Pt => {
    const p = s.part, [ia, ib] = AXES[p.plane], base = [p.x, p.y, p.z], x = u - base[ia];
    return [p.flip ? p.a - x : x, v - base[ib]];
  };
  const holes: H[] = [];
  for (const s of solids) {
    const p = s.part, [ia, ib, it] = AXES[p.plane], base = [p.x, p.y, p.z];
    const angle = p.plane === "xy" ? 0 : ((p.tilt ?? 0) * Math.PI) / 180;
    for (const h of s.shape.drills) {
      const w = base[it] + h.y * Math.sin(angle);
      holes.push({ axis: it, u: base[ia] + (p.flip ? p.a - h.x : h.x), v: base[ib] + h.y * Math.cos(angle), lo: w, hi: w + s.t, d: h.d, solid: s });
    }
  }
  const root = holes.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i], b = holes[j];
      if (a.axis === b.axis && Math.abs(a.u - b.u) < 0.6 && Math.abs(a.v - b.v) < 0.6 && Math.max(a.lo, b.lo) - Math.min(a.hi, b.hi) <= 3) root[find(i)] = find(j);
    }
  const sets = new Map<number, H[]>();
  holes.forEach((h, i) => sets.set(find(i), [...(sets.get(find(i)) ?? []), h]));
  const groups = new Map<string, Fastener>();
  for (const set of sets.values()) {
    const { axis, u, v } = set[0], d = Math.max(...set.map((h) => h.d));
    const layers = set.map((h) => ({ solid: h.solid, lo: h.lo, hi: h.hi }));
    for (let grew = true; grew; ) {
      grew = false;
      const lo = Math.min(...layers.map((l) => l.lo)), hi = Math.max(...layers.map((l) => l.hi));
      for (const s of solids) {
        if (layers.some((l) => l.solid === s) || s.min[axis] > hi + 3 || s.max[axis] < lo - 3) continue;
        // Деталь в той же плоскости проверяется по контуру; повёрнутая (брусок под крышкой) — по габариту.
        if (AXES[s.part.plane][2] === axis) {
          const at = local(s, u, v);
          if (!insidePoly(at, s.shape.outer) || s.shape.cutouts.some((c) => insidePoly(at, c) && Math.max(...c.map((q) => q[0])) - Math.min(...c.map((q) => q[0])) > FASTENER_CUTOUT)) continue;
        } else {
          const [ia, ib] = AXES[holePlane(axis)], point: V = [0, 0, 0];
          point[ia] = u;
          point[ib] = v;
          if ([ia, ib].some((k) => point[k] < s.min[k] || point[k] > s.max[k])) continue;
        }
        layers.push({ solid: s, lo: s.min[axis], hi: s.max[axis] });
        grew = true;
      }
    }
    layers.sort((p, q) => p.lo - q.lo);
    const stack = Math.max(...layers.map((l) => l.hi)) - Math.min(...layers.map((l) => l.lo));
    const key = `${d}|${[...new Set(layers.map((l) => l.solid.code))].join("+")}`;
    let g = groups.get(key);
    if (!g) {
      const chosen = state.holeConnectors?.[key];
      const connector = chosen === "none" ? undefined : chosen ? state.connectors.find((c) => c.id === chosen) : state.connectors.find((c) => Math.abs(c.holeD - d) < 0.05);
      groups.set(key, (g = { key, d, count: 0, stack: [stack, stack], names: layers.map((l) => `${l.solid.code} ${l.solid.part.name}`).join(" + "), connector }));
    }
    g.count++;
    g.stack = [Math.min(g.stack[0], stack), Math.max(g.stack[1], stack)];
  }
  return [...groups.values()].sort((p, q) => q.d - p.d || q.count - p.count);
}

// --- Упаковка: плоские коробки, панели лежат слоями ---

export type Layer = { t: number; items: { id: string; w: number; h: number }[]; placed: Placed[] };
export type Carton = { layers: Layer[]; weight: number; L: number; W: number; H: number };
export type Packing = { cartons: Carton[]; oversize: Solid[]; weight: number; byWeight: number; byVolume: number };

function packingOf(state: AppState, solids: Solid[]): Packing {
  const { boxL, boxW, boxH, boxWeight, boxPad } = state.settings;
  const L = boxL - 2 * boxPad, W = boxW - 2 * boxPad, H = boxH - 2 * boxPad;
  const cartons: { layers: Layer[]; weight: number; height: number }[] = [], oversize: Solid[] = [];
  const fits = (items: Layer["items"]) => {
    const r = pack(items, L, W, 5, true);
    return r.bins.length === 1 && !r.unplaced.length ? r.bins[0] : null;
  };
  for (const s of [...solids].sort((p, q) => q.part.a * q.part.b - p.part.a * p.part.b)) {
    const item = { id: s.part.id, w: s.part.a, h: s.part.b };
    if (!fits([item]) || s.t > H || s.weight > boxWeight) {
      oversize.push(s);
      continue;
    }
    let done = false;
    for (const c of cartons) {
      if (c.weight + s.weight > boxWeight) continue;
      for (const layer of c.layers) {
        const placed = layer.t >= s.t && fits([...layer.items, item]);
        if (!placed) continue;
        layer.items.push(item);
        layer.placed = placed;
        done = true;
        break;
      }
      if (!done && c.height + s.t <= H) {
        c.layers.push({ t: s.t, items: [item], placed: fits([item])! });
        c.height += s.t;
        done = true;
      }
      if (done) {
        c.weight += s.weight;
        break;
      }
    }
    if (!done) cartons.push({ layers: [{ t: s.t, items: [item], placed: fits([item])! }], weight: s.weight, height: s.t });
  }
  const packed = solids.filter((s) => !oversize.includes(s));
  const weight = packed.reduce((sum, s) => sum + s.weight, 0);
  const volume = packed.reduce((sum, s) => sum + s.part.a * s.part.b * s.t, 0);
  return {
    cartons: cartons.map((c) => {
      const all = c.layers.flatMap((l) => l.placed);
      return { layers: c.layers, weight: c.weight, L: Math.max(...all.map((p) => p.x + p.w)) + 2 * boxPad, W: Math.max(...all.map((p) => p.y + p.h)) + 2 * boxPad, H: c.height + 2 * boxPad };
    }),
    oversize,
    weight,
    // Нижние границы числа коробок: меньше не получится ни при какой укладке.
    byWeight: Math.ceil(weight / boxWeight - 1e-9),
    byVolume: Math.ceil(volume / (L * W * H) - 1e-9),
  };
}

// --- Устойчивость: опрокидывание пустого каркаса вокруг края опоры ---

export type Stability = { mass: number; com: V; support: [number, number, number, number]; checks: Check[] };

function stabilityOf(state: AppState, solids: Solid[]): Stability | null {
  if (!solids.length) return null;
  const mass = solids.reduce((sum, s) => sum + s.weight, 0);
  const com = [0, 1, 2].map((k) => solids.reduce((sum, s) => sum + (s.weight * (s.min[k] + s.max[k])) / 2, 0) / mass) as V;
  const lo = (list: Solid[], k: number) => Math.min(...list.map((s) => s.min[k])), hi = (list: Solid[], k: number) => Math.max(...list.map((s) => s.max[k]));
  const floor = lo(solids, 2), feet = solids.filter((s) => s.min[2] <= floor + EPS);
  const [x0, x1, y0, y1] = [lo(feet, 0), hi(feet, 0), lo(feet, 1), hi(feet, 1)];
  const seats = solids.filter((s) => s.part.seat), backs = solids.filter((s) => s.part.back);
  const P = state.settings.person * G, weight = mass * G;

  const tip = (title: string, where: string, overturn: number, hold: number): Check => {
    if (overturn <= 1e-6) return { title, detail: `${where} — нагрузка внутри опорного контура, опрокидывающего момента нет.`, status: "ok" };
    const k = hold / overturn;
    return { title, detail: `${where}. Опрокидывает ${num(overturn / 1000, 0)} Н·м, удерживает ${num(hold / 1000, 0)} Н·м.`, status: grade(k, TIP), k };
  };
  const front = seats.length ? lo(seats, 1) : lo(solids, 1), top = (backs.length ? hi(backs, 2) : hi(solids, 2)) - floor;
  const left = lo(solids, 0), right = hi(solids, 0);
  return {
    mass,
    com,
    support: [x0, x1, y0, y1],
    checks: [
      tip("Сели на передний край", `${num(state.settings.person)} кг на переднюю кромку сиденья`, P * (y0 - front), weight * (com[1] - y0)),
      tip("Сели на левый край", `${num(state.settings.person)} кг на крайнюю левую кромку`, P * (x0 - left), weight * (com[0] - x0)),
      tip("Сели на правый край", `${num(state.settings.person)} кг на крайнюю правую кромку`, P * (right - x1), weight * (x1 - com[0])),
      tip("Толкнули верх спинки назад", `${num(state.settings.push)} кгс на высоте ${num(top)} мм, диван пустой`, state.settings.push * G * top, weight * (y1 - com[1])),
    ],
  };
}

// --- Надёжность: изгиб настила, коннекторы под нагрузкой, узел спинки ---

/** Наибольший пролёт между опорами на отрезке [lo, hi]; свес за крайнюю опору считается как пролёт двойной длины. */
function span(cover: [number, number][], lo: number, hi: number) {
  if (!cover.length) return Infinity;
  const sorted = [...cover].sort((p, q) => p[0] - q[0]);
  let reach = sorted[0][1], worst = 2 * Math.max(0, sorted[0][0] - lo);
  for (const [a, b] of sorted.slice(1)) {
    worst = Math.max(worst, a - reach);
    reach = Math.max(reach, b);
  }
  return Math.max(worst, 2 * (hi - reach), 0);
}

function strengthOf(state: AppState, solids: Solid[], links: Link[]): Check[] {
  const { person, dynamic, safety, deflection, push } = state.settings;
  const load = person * dynamic, P = load * G;
  const checks: Check[] = [];
  const floor = Math.min(...solids.map((s) => s.min[2]));
  const linksAt = (s: Solid) => links.filter((l) => l.a === s || l.b === s);
  const bearers = (s: Solid) =>
    solids.filter((o) => {
      const c = o !== s && touch(s, o);
      return c && c !== "clash" && c.axis === 2 && o.max[2] <= s.min[2] + EPS;
    });

  // Настил: полоса под человеком работает как балка на двух опорах с грузом посередине пролёта.
  for (const s of solids.filter((x) => x.part.seat)) {
    const title = `${s.code} ${s.part.name}: изгиб`;
    if (s.part.plane !== "xy") {
      checks.push({ title, detail: "Отмечена как сиденье, но стоит вертикально — изгиб не проверяется.", status: "warn" });
      continue;
    }
    const cover: [number, number][][] = [[], []];
    const below = bearers(s);
    for (const o of solids) {
      const c = o !== s && touch(s, o);
      if (!c || c === "clash") continue;
      const joined = linksAt(s).some((l) => l.a === o || l.b === o);
      if (!(below.includes(o) || (c.axis !== 2 && joined))) continue;
      // Опора, вытянутая вдоль X, держит пролёт по Y, и наоборот.
      const k = c.hi[0] - c.lo[0] >= c.hi[1] - c.lo[1] ? 1 : 0;
      cover[k].push([c.lo[k], c.hi[k]]);
    }
    const gx = span(cover[0], s.min[0], s.max[0]), gy = span(cover[1], s.min[1], s.max[1]);
    const L = Math.min(gx, gy);
    if (!Number.isFinite(L)) {
      checks.push({ title, detail: "Под панелью нет опоры: ни одна деталь её не подпирает и не держит за кромку через стык.", status: "fail" });
      continue;
    }
    if (L < 1) {
      checks.push({ title, detail: "Панель лежит на сплошной опоре.", status: "ok" });
      continue;
    }
    const width = Math.min(SEAT_STRIP, gy <= gx ? s.part.a : s.part.b);
    const sigma = (P * L) / 4 / ((width * s.t ** 2) / 6), k = s.material.strength / sigma;
    const sag = (P * L ** 3) / (48 * s.material.E * ((width * s.t ** 3) / 12)), ratio = L / sag;
    checks.push({
      title,
      detail: `Пролёт ${num(L)} мм, груз ${num(load)} кг. Напряжение ${num(sigma, 1)} из ${num(s.material.strength)} МПа, прогиб ${num(sag, 1)} мм (пролёт/${num(ratio)}, допустимо пролёт/${num(deflection)}).`,
      status: worse(grade(k, safety), ratio >= deflection ? "ok" : "warn"),
      k,
    });
  }

  // Путь нагрузки от сиденья к полу: где деталь не стоит на другой, весь груз идёт через коннекторы стыка.
  const seen = new Set<Solid>(), judged = new Set<Link>();
  const queue = solids.filter((x) => x.part.seat);
  queue.forEach((s) => seen.add(s));
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    if (s.min[2] <= floor + EPS) continue;
    const below = bearers(s);
    const next = [...below];
    if (!below.length) {
      // Стык с деталью, которая лежит сверху, груз вниз не передаёт.
      const onTop = (l: Link) => l.contact?.axis === 2 && (l.a === s ? l.b : l.a).min[2] >= s.max[2] - EPS;
      const own = linksAt(s).filter((l) => !judged.has(l) && !onTop(l));
      if (!linksAt(s).length) checks.push({ title: `${s.code} ${s.part.name}: опора`, detail: "Деталь не стоит на полу, ни на что не опирается и не закреплена ни одним стыком.", status: "fail" });
      for (const l of own) {
        judged.add(l);
        const other = l.a === s ? l.b : l.a, title = `Стык «${l.a.part.name}» + «${l.b.part.name}»: срез`;
        if (!l.contact) continue;
        if (!l.connector.shear) checks.push({ title, detail: `${l.connector.name}: не задана несущая способность на срез.`, status: "warn" });
        else {
          const k = (l.joint.qty * l.connector.shear) / load;
          checks.push({ title, detail: `${l.joint.qty} × ${l.connector.name} держат ${num(l.joint.qty * l.connector.shear)} кгс, худший случай — ${num(load)} кгс у самого стыка.`, status: grade(k, safety), k });
        }
        next.push(other);
      }
    }
    for (const o of next) {
      if (seen.has(o)) continue;
      seen.add(o);
      queue.push(o);
    }
  }

  // Спинка: усилие на верхнюю кромку выворачивает её из стыков, коннекторы работают на отрыв.
  for (const s of solids.filter((x) => x.part.back)) {
    const title = `${s.code} ${s.part.name}: узел спинки`;
    const own = linksAt(s).filter((l) => l.contact);
    if (!own.length) {
      checks.push({ title, detail: "Спинка не закреплена ни одним стыком.", status: "fail" });
      continue;
    }
    const zLo = Math.min(...own.map((l) => l.contact!.lo[2])), zHi = Math.max(...own.map((l) => l.contact!.hi[2]));
    const arm = Math.max(zHi - zLo, s.t), lever = s.max[2] - zLo;
    const count = own.reduce((sum, l) => sum + l.joint.qty, 0), pull = Math.min(...own.map((l) => l.connector.pull));
    const each = (push * lever) / arm / Math.max(1, count / 2);
    const about = `Усилие ${num(push)} кгс на плече ${num(lever)} мм, стыки разнесены по высоте на ${num(arm)} мм: на коннектор ${num(each, 1)} кгс отрыва`;
    if (!pull) checks.push({ title, detail: `${about}. Несущая способность на отрыв не задана.`, status: "warn" });
    else checks.push({ title, detail: `${about} при допустимых ${num(pull)} кгс.`, status: grade(pull / each, safety), k: pull / each });
  }
  return checks;
}

/** Ошибки самой модели: пересечения, незакреплённые детали, стыки без касания. */
function issuesOf(solids: Solid[], links: Link[]): Check[] {
  const issues: Check[] = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      // Детали с чертежа входят друг в друга шипами и пазами: пересечение их габаритов — не ошибка.
      if (!solids[i].part.shape && !solids[j].part.shape && touch(solids[i], solids[j]) === "clash") issues.push({ title: `${solids[i].code} ${solids[i].part.name} и ${solids[j].code} ${solids[j].part.name}`, detail: "Детали пересекаются: проверьте координаты и размеры.", status: "fail" });
    }
  }
  for (const l of links) if (!l.contact) issues.push({ title: `Стык «${l.a.part.name}» + «${l.b.part.name}»`, detail: "Детали не касаются друг друга плоскостями — коннекторам негде стоять.", status: "warn" });
  if (solids.length > 1) for (const s of solids) if (!links.some((l) => l.a === s || l.b === s)) issues.push({ title: `${s.code} ${s.part.name}`, detail: "Деталь не входит ни в один стык.", status: "warn" });
  return issues;
}

// --- Сборка: порядок от пола вверх и то, с чем придётся справиться покупателю ---

export type Step = { solid: Solid; to: { other: Solid; qty: number; connector: Connector }[] };
export type Assembly = { steps: Step[]; loose: Solid[]; connectors: number; kinds: number; tools: string[]; minutes: number; checks: Check[] };

function assemblyOf(state: AppState, solids: Solid[], links: Link[], rows: Row[]): Assembly {
  const { partWeight, partLength } = state.settings;
  const floor = Math.min(...solids.map((s) => s.min[2]));
  const placed: Solid[] = [], steps: Step[] = [];
  const rest = [...solids].sort((p, q) => p.min[2] - q.min[2] || q.weight - p.weight);
  while (rest.length) {
    const linked = (s: Solid) => links.filter((l) => (l.a === s && placed.includes(l.b)) || (l.b === s && placed.includes(l.a)));
    const i = rest.findIndex((s) => linked(s).length > 0 || (!placed.length && s.min[2] <= floor + EPS));
    if (i < 0) break;
    const [solid] = rest.splice(i, 1);
    steps.push({ solid, to: linked(solid).map((l) => ({ other: l.a === solid ? l.b : l.a, qty: l.joint.qty, connector: l.connector })) });
    placed.push(solid);
  }
  const used = links.filter((l) => l.joint.qty > 0);
  const connectors = used.reduce((sum, l) => sum + l.joint.qty, 0);
  const kinds = new Set(used.map((l) => l.connector.id)).size;
  const tools = [...new Set(used.map((l) => l.connector.tool.trim()).filter(Boolean))];
  const minutes = (used.reduce((sum, l) => sum + l.joint.qty * l.connector.seconds, 0) + solids.length * 60) / 60;
  const heavy = solids.filter((s) => s.weight > partWeight), long = solids.filter((s) => Math.max(s.part.a, s.part.b) > partLength);
  const names = (list: Solid[]) => [...new Set(list.map((s) => `${s.code} ${s.part.name}`))].join(", ");
  const checks: Check[] = [
    { title: "Инструмент", detail: tools.length ? `Понадобится: ${tools.join(", ")}.` : "Собирается руками, без инструмента.", status: tools.length > 1 ? "warn" : "ok" },
    { title: "Виды коннекторов", detail: kinds > 2 ? `${kinds} разных — легко перепутать. Лучше свести к одному-двум.` : `${kinds || "нет"} — перепутать нечего.`, status: kinds > 2 ? "warn" : "ok" },
    { title: "Разных деталей", detail: `${rows.length} обозначений на ${solids.length} деталей. Чем меньше разных, тем проще инструкция; похожие, но не одинаковые детали стоит пометить.`, status: "ok" },
    { title: "Вес деталей", detail: heavy.length ? `Тяжелее ${num(partWeight)} кг: ${names(heavy)} — понадобится помощник.` : `Все детали легче ${num(partWeight)} кг.`, status: heavy.length ? "warn" : "ok" },
    { title: "Длина деталей", detail: long.length ? `Длиннее ${num(partLength)} мм: ${names(long)} — неудобно держать и стыковать одному.` : `Все детали короче ${num(partLength)} мм.`, status: long.length ? "warn" : "ok" },
  ];
  if (rest.length) checks.push({ title: "Порядок сборки", detail: `Не привязаны к остальным стыками: ${names(rest)}.`, status: "fail" });
  return { steps, loose: rest, connectors, kinds, tools, minutes, checks };
}

// --- Закупка ---

export type Purchase = { lines: { name: string; qty: number; unit: string; price: number; cost: number }[]; total: number };

function purchaseOf(state: AppState, nests: Nest[], links: Link[], fasteners: Fastener[]): Purchase {
  const lines = nests.map((n) => ({ name: n.material.bar ? `${materialLabel(n.material)}, хлыст ${num(n.material.sheetL)} мм` : `${materialLabel(n.material)}, лист ${num(n.material.sheetL)} × ${num(n.material.sheetW)}`, qty: n.sheets.length, unit: n.material.bar ? "хлыст" : "лист", price: n.material.price, cost: n.cost }));
  for (const c of state.connectors) {
    const qty = links.filter((l) => l.connector === c).reduce((sum, l) => sum + l.joint.qty, 0);
    if (qty) lines.push({ name: c.name, qty, unit: "шт", price: c.price, cost: qty * c.price });
  }
  // Метизы по отверстиям чертежей: по одному на ось через пакет деталей.
  const used = new Map<Connector, number>();
  for (const f of fasteners) if (f.connector) used.set(f.connector, (used.get(f.connector) ?? 0) + f.count);
  for (const [c, qty] of used) lines.push({ name: `${c.name} — по отверстиям`, qty, unit: "шт", price: c.price, cost: qty * c.price });
  for (const i of state.items ?? []) if (i.qty) lines.push({ name: i.name, qty: i.qty, unit: i.unit, price: i.price, cost: i.qty * i.price });
  return { lines, total: lines.reduce((sum, l) => sum + l.cost, 0) };
}

export type Calc = ReturnType<typeof calculate>;

export function calculate(state: AppState) {
  const solids = solidsOf(state), links = linksOf(state, solids), rows = rowsOf(solids), nests = nestsOf(state, solids), fasteners = fastenersOf(state, solids);
  const size = solids.length ? ([0, 1, 2].map((k) => Math.max(...solids.map((s) => s.max[k])) - Math.min(...solids.map((s) => s.min[k]))) as V) : ([0, 0, 0] as V);
  return {
    solids,
    links,
    rows,
    nests,
    size,
    weight: solids.reduce((sum, s) => sum + s.weight, 0),
    hardware: hardwareOf(state, solids),
    fasteners,
    packing: packingOf(state, solids),
    stability: stabilityOf(state, solids),
    strength: solids.length ? strengthOf(state, solids, links) : [],
    issues: issuesOf(solids, links),
    assembly: assemblyOf(state, solids, links, rows),
    purchase: purchaseOf(state, nests, links, fasteners),
  };
}
