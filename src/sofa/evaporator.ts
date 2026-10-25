// Модель серии «Шкаф испарителя»: параметрическая, по контуру каркаса в плане и высоте. Чистый TS.
// Контур — по чертежу «контур дна.dwg» (копия в evaporator-projects/Исходник): W × D со скруглёнными углами R = INSET, это наружные грани каркаса; обшивка — снаружи.
// Узлы (пересечение основания, опора стойки, верх стойки) одинаковы во всей серии — от габарита меняются только длины.
// Оси как у дивана: X — ширина, Y — глубина (перед → задняя стенка), Z — вверх; мм.
//
// Основание — решётка «#» в одном уровне (верх на 100): два швеллера 10П вдоль X — сплошные, на всю ширину контура,
// два швеллера 8П вдоль Y — разрезаны и вварены между 10П. Все полками наружу; наружные грани — на линиях начала скруглений (INSET от контура).
// Снаружи пересечений — косынки-опоры 8 мм в плоскости верха (жёлтое на чертеже).
// Стойки 60×60×3 (зелёное) — на боковых сторонах контура у начала скруглений: торец на конце полки 10П и косынке-опоре у консоли.
// Стойки — до низа верхнего пояса; связывающие трубы пояса лежат на их торцах, продольные — по наружной грани 8П, торцы у обшивки заглушены. Обшивка 09Г2С 2 мм — по контуру, на углах гнутая по R.

import { solidsOf } from "./frame/calc";
import { EMPTY, type AppState, type Item, type Material, type Note, type Part, type Plane, type Pt } from "./frame/model";

/**
 * Привязка двух швеллеров 8П под установку (испаритель встаёт на них), мм: left — от левого края шкафа (по обшивке) до оси левого 8П,
 * span — между осями двух 8П. Задаётся на странице серии («Привязка швеллеров под установку»).
 */
export type Rails = { left: number; span: number };
export type CabinetSize = { W: number; D: number; H: number; rails?: Rails };
/** Первый экземпляр: 900 × 900 в плане по обшивке, 1800 по высоте (может уточняться). */
export const FIRST: CabinetSize = { W: 900, D: 900, H: 1800 };
/** Пока установка не задана — пара 8П симметрично, оси через 300. */
export const DEFAULT_RAILS: Rails = { left: 300, span: 300 };
export const SOURCE_DWG = "C:\\Users\\User\\Desktop\\Работа\\Испаритель\\для claude\\контур дна.dwg";

/** Сортамент: швеллер 10П/8П — ГОСТ 8240-97, труба 60×60×3 — ГОСТ 30245-2003. */
const CH10 = { kind: "channel" as const, h: 100, w: 46, s: 4.5, t: 7.6, kgm: 8.59 };
const CH8 = { kind: "channel" as const, h: 80, w: 40, s: 4.5, t: 7.4, kgm: 7.05 };
const TUBE = { kind: "tube" as const, h: 60, w: 60, s: 3, t: 3, kgm: 5.13 };

/** Пределы привязки: швеллеры под установку — между стенками боковых 8П основания (оси от и до), между собой — не ближе ширины полки + 20. */
export function railLimits(size: CabinetSize = FIRST) {
  const inner0 = INSET + CH8.w, inner1 = size.W - INSET - CH8.w;
  return { min: inner0 + CH8.w / 2, max: inner1 - CH8.w / 2, minSpan: CH8.w + 20 };
}

/** Ошибка привязки или null. */
export function checkRails(rails: Rails, size: CabinetSize = FIRST): string | null {
  const { min, max, minSpan } = railLimits(size);
  if (!Number.isFinite(rails.left) || !Number.isFinite(rails.span)) return "Привязка — числа в мм";
  if (rails.span < minSpan) return `Между осями 8П — не меньше ${minSpan} мм (полка 8П — ${CH8.w})`;
  if (rails.left < min) return `Ось левого 8П — не ближе ${min} мм к левому краю: левее стоит 8П основания`;
  if (rails.left + rails.span > max) return `Ось правого 8П (${rails.left + rails.span}) — не дальше ${max} мм от левого края: правее стоит 8П основания`;
  return null;
}

/** Отступ каркаса от контура и радиус угла обшивки: наружные грани швеллеров и стоек — на линиях начала скруглений. */
const INSET = 130;
const SKIN = 2;
/** Косынки-опоры в плоскости верха швеллеров — лист 8 мм. */
const STAY_T = 8;
/** Панель прямого участка: отгиб по низу и верху — от наружной грани, мм (по «узел обвязки-1.dwg»). Цоколь: нижняя полка под основанием. */
const PANEL = { ret: 45 }, PLINTH = { leg: 45 };
/** Фигурный вырез стенки швеллеров у контура: длина от торца и ширина скоса, мм (огибает отгиб панели и цоколь с зазором 2). */
const NOTCH = { len: 47, slope: 17 };
/** Косынки у основания стоек (узел обвязки-2): катет и ось плоскости от внутренней грани трубы, мм. */
const POST_GUSSET = { a: 60, off: 10 };
/** Опорная полоса по периметру под отгибы панелей: ширина от контура, ось отверстий (по отгибу), шаг и отступ крайних от концов, мм. */
const BAND = { w: 50, hole: 22, step: 300, end: 40 };
/** Узел Д: анкеры — ось от наружной кромки нижней полки 10П и от торцов, мм. Узел Ж: бобышка под рым-болт — ⌀ и высота. */
const ANCHOR = { edge: 20, end: 100 }, LIFT = { d: 50, h: 25, off: 60 };
/** Заглушки торцов труб верхнего пояса у обшивки — лист 3 мм. */
const CAP = 3;
/** Полупрозрачная на 3D — обшивка: за ней виден каркас и его узлы. */
const GHOST = /^(s2|k3)$/;

// Цены — ориентировочные (уточнить по прайсу); металл — за хлыст 6 м, лист 1250 × 2500 или мерную заготовку.
const steel = (id: string, name: string, thickness: number, price: number, sheet = 1250, len = 2500): Material => ({ id, name, thickness, sheetW: sheet, sheetL: len, price, density: 7850, E: 206000, strength: 345, gap: 10, margin: 10 });
const bar = (id: string, name: string, p: typeof CH10 | typeof TUBE, price: number): Material => ({ id, name, thickness: p.w, sheetW: p.h, sheetL: 6000, price, density: 7850, E: 206000, strength: 345, bar: true, gap: 3, profile: p });
const MATERIALS: Material[] = [
  bar("ch10", "Швеллер 10П ГОСТ 8240-97", CH10, 4400),
  bar("ch8", "Швеллер 8П ГОСТ 8240-97", CH8, 3600),
  bar("tube60", "Труба 60×60×3 ГОСТ 30245-2003", TUBE, 2900),
  // Бобышки под рым-болты — из круга 50 ГОСТ 2590-2006 (09Г2С), режется в размер 25.
  { id: "rd50", name: "Круг 50 ГОСТ 2590-2006 (бобышки)", thickness: 50, sheetW: 50, sheetL: 1000, price: 900, density: 7850, E: 206000, strength: 345, bar: true, gap: 3 },
  // Мелкие детали узлов — из мерной заготовки 500 × 500 (обрезь / лазер подрядчика), цена по весу; лист 1250 × 2500 на серию из 1–2 шкафов не нужен.
  steel("s8", "Лист 09Г2С (косынки-опоры)", 8, 1700, 500, 500),
  steel("s3", "Лист 09Г2С (заглушки торцов)", 3, 700, 500, 500),
  steel("k3", "Лист 09Г2С (кассеты обшивки)", 3, 8100),
  // Декоративная полоса-вставка между кассетами: нержавейка, плоский прокат 65 × 4, хлыст 6 м.
  { id: "ss4", name: "Полоса нержавеющая 45×4 AISI 304", thickness: 4, sheetW: 45, sheetL: 6000, price: 3100, density: 7900, E: 193000, strength: 520, bar: true, gap: 3 },
  steel("s2", "Лист 09Г2С (наружная обшивка)", SKIN, 5400),
  // Утеплитель кассет и панелей: жёсткая базальтовая минвата 80–100 кг/м³ (НГ), плита 1000 × 600 × 50; цена не задана.
  { id: "mw50", name: "Минвата базальтовая жёсткая 80–100 кг/м³, плита 1000×600×50", thickness: 50, sheetW: 600, sheetL: 1000, price: 0, density: 90, E: 1, strength: 0.01, gap: 5, margin: 0 },
];

const r = (n: number) => +n.toFixed(2);
/** Число в названии: дробь через запятую (1,5). */
const fmtMm = (n: number) => String(n).replace(".", ",");
const shape = (outer: Pt[]) => ({ outer, cutouts: [], pockets: [], drills: [] });

/** Замкнутый контур из вершин с выпуклостью (bulge, как у полилинии DWG: tg четверти угла дуги, + — против часовой) — точками через ~5°. */
function bulged(verts: [number, number, number][]): Pt[] {
  const out: Pt[] = [];
  verts.forEach(([x, y, b], i) => {
    out.push([x, y]);
    if (!b) return;
    const [qx, qy] = verts[(i + 1) % verts.length], d = Math.hypot(qx - x, qy - y), sweep = 4 * Math.atan(b);
    const off = (d * (1 - b * b)) / (4 * b), cx = (x + qx) / 2 - ((qy - y) / d) * off, cy = (y + qy) / 2 + ((qx - x) / d) * off;
    const a0 = Math.atan2(y - cy, x - cx), rad = Math.hypot(x - cx, y - cy), n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    for (let k = 1; k < n; k++) out.push([cx + rad * Math.cos(a0 + (sweep * k) / n), cy + rad * Math.sin(a0 + (sweep * k) / n)]);
  });
  return out;
}

/** Выпуклость дуги 90°. */
const Q = Math.tan(Math.PI / 8);
/** Ширина отгиба кассеты (рабочая; на чертеже узла — 60) и ось заклёпки крепления — от наружной грани трубы, мм. */const FLANGE = 40, RIVET_AXIS = 20;
/**
 * Косынки-опоры в плоскости верха швеллеров (по «контур дна.dwg», жёлтое), лист 8 мм — у переднего левого узла, в координатах изделия;
 * остальные узлы — зеркально. Кромки по контуру — как на чертеже (контур — несущий каркас, обшивка снаружи); skin > 0 — уменьшить их, если каркас окажется внутри обшивки.
 * corner — угловая (rev2): под кассетой — наружная дуга R126 кассеты, внутренняя дуга, кромки у полос-вставок; между консолями 10П и 8П;
 * cantilever — у консоли 10П: за стенкой 10П, снаружи 8П, вырез R70 вокруг угла узла, свободная кромка — дуга ≈ R150;
 * inner — у второй стойки (rev2): с внутренней стороны 8П за 10П, сектор между вырезом R≈70 и дугой R126 вокруг угла пересечения — опора свободной части торца второй стойки.
 * corner и inner — вершины из чертежа (угол зад-лево) в координаты переднего левого: (X − 886.1804, 1027.9267 − Y).
 */
const BASE_DWG = {
  corner: [[1016.1804, 967.9267, 0], [1009.1804, 967.9267, 0.357], [946.1804, 904.9267, 0], [946.1804, 897.9267, 0], [886.1804, 897.9267, 0], [886.242, 901.9267, -0.3963], [1012.1804, 1027.8652, 0], [1016.1804, 1027.8652, 0]],
  inner: [[1182.1189, 897.9267, 0], [1182.1189, 901.9267, 0.396], [1056.1804, 1027.9267, 0], [1056.1804, 967.9267, -0.3837], [1122.4157, 901.9267, 0], [1122.4157, 897.9267, 0]],
} as const;
const fromBase = (verts: readonly (readonly [number, number, number])[]): Pt[] => bulged(verts.map(([x, y, b]) => [x, y, b])).map(([x, y]): Pt => [r(x - 886.1804), r(1027.9267 - y)]);
const STAYS = (inset: number, w10: number, skin: number, cut = 70) => ({
  corner: fromBase(BASE_DWG.corner),
  cantilever: bulged([[inset, inset + 181.5, 0], [inset, inset + w10 + cut, Q], [inset - cut, inset + w10, 0], [skin, inset + w10, -0.35]]),
  inner: fromBase(BASE_DWG.inner),
});

/**
 * Типовой угол обшивки (пирог панели) — по чертежу «узел обвязки.dwg» (угол зад-лево, вершины с выпуклостями как в DWG).
 * В координаты переднего левого угла: (X − 265.1081, 322.4197 − Y) — от левой грани и от передней грани каркаса.
 * cassette — гнутый лист кассеты 3 мм (лиловое): наружная дуга R≈126 и два отгиба (на чертеже 60, в модели FLANGE) внутрь к полосам-вставкам;
 * lid — верхняя и нижняя плоскость кассеты (оранжевое); strip — нержавеющая полоса-вставка 4 × 65 (серое), выступает за контур на 5;
 * post — вторая труба-стойка 60×60 на передней (задней) стороне (зелёное): x 130…190, по контуру.
 */
// Отгиб кассеты сужен с 60 (по чертежу) до FLANGE: концы отгибов и концы внутренней дуги крышки — на FLANGE от граней каркаса;
// дуга крышки — с той же выпуклостью, что на чертеже.
const NODE_DWG = {
  cassette: [[265.1697, 196.4197, 0], [265.1081 + FLANGE, 196.4197, 0], [265.1081 + FLANGE, 199.4197, 0], [268.3012, 199.4197, -0.3823], [388.1081, 319.2267, 0], [388.1081, 322.4197 - FLANGE, 0], [391.1081, 322.4197 - FLANGE, 0], [391.1081, 322.3582, 0.3963]],
  lid: [[265.1081 + FLANGE, 196.4197, 0], [265.1081 + FLANGE, 199.4197, -0.357], [388.1081, 322.4197 - FLANGE, 0], [391.1081, 322.4197 - FLANGE, 0], [391.1081, 322.3582, 0.3963], [265.1697, 196.4197, 0], [265.1081 + FLANGE - 0.2353, 196.4197, 0]],
} as const;
const fromNode = (verts: readonly (readonly [number, number, number])[]): Pt[] => bulged(verts.map(([x, y, b]) => [x, y, b])).map(([x, y]): Pt => [r(x - 265.1081), r(322.4197 - y)]);
/** Сечения угла в координатах переднего левого угла каркаса. */
const NODE = {
  cassette: fromNode(NODE_DWG.cassette),
  lid: fromNode(NODE_DWG.lid),
  // Полосы-вставки: у второй стойки (по её левой грани) и у основной стойки (по её передней грани): [x0, y0, x1, y1].
  strips: [
    [126, -5, 130, FLANGE],
    [-5, 126, FLANGE, 130],
  ] as [number, number, number, number][],
  post: [130, 0] as Pt,
};
/** Утеплитель кассет и панелей: толщина слоя и число кусков по высоте (плита 1000 — шкаф выше режется на ряды). */
const WOOL = { t: 50, rows: 2 };
/**
 * Слой утеплителя угловой кассеты в плане (координаты переднего левого угла): по внутренней дуге гнутого листа,
 * толщина WOOL.t к центру дуги. Дуга — вершины между концами внутренней дуги чертежа узла; центр — по трём точкам.
 */
const WOOL_CORNER: Pt[] = (() => {
  const c = NODE.cassette, near = (q: Pt) => c.reduce((best, p, i) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(c[best][0] - q[0], c[best][1] - q[1]) ? i : best), 0);
  const arc = c.slice(near([3.19, 123]), near([123, 3.19]) + 1);
  const [a, b, d] = [arc[0], arc[Math.floor(arc.length / 2)], arc[arc.length - 1]];
  const k = 2 * (a[0] * (b[1] - d[1]) + b[0] * (d[1] - a[1]) + d[0] * (a[1] - b[1]));
  const sq = (p: Pt) => p[0] ** 2 + p[1] ** 2;
  const cx = (sq(a) * (b[1] - d[1]) + sq(b) * (d[1] - a[1]) + sq(d) * (a[1] - b[1])) / k, cy = (sq(a) * (d[0] - b[0]) + sq(b) * (a[0] - d[0]) + sq(d) * (b[0] - a[0])) / k;
  const inner = arc.map(([x, y]): Pt => {
    const l = Math.hypot(cx - x, cy - y);
    return [r(x + ((cx - x) * WOOL.t) / l), r(y + ((cy - y) * WOOL.t) / l)];
  });
  return [...arc, ...inner.reverse()];
})();
/** Развёртка слоя угловой кассеты по средней линии (ширина набора ламелей). */
const WOOL_CORNER_DEV = (() => {
  const half = WOOL_CORNER.length / 2, outer = WOOL_CORNER.slice(0, half), inner = WOOL_CORNER.slice(half).reverse();
  const mid = outer.map((p, i): Pt => [(p[0] + inner[i][0]) / 2, (p[1] + inner[i][1]) / 2]);
  return mid.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - mid[i][0], p[1] - mid[i][1]), 0);
})();
/** Лист кассеты: толщина и развёртка (отгиб 60 + дуга по средней линии + отгиб 60). */
/** Полоса-вставка — по глубине отгиба кассеты: выступ за контур 5 + отгиб FLANGE (45 при отгибе 40). Лента EPDM — по 2 полосы шириной TAPE.w у кромок отгиба. */
const CASSETTE_T = 3, STRIP = { t: 4, w: 5 + FLANGE }, TAPE = { w: 12, under: 1.5, over: 1 };
/** Крепление кассет к стойкам: шаг заклёпок по высоте отгиба и отступ крайних от торцов, мм. */
const FIX = { step: 350, edge: 60 };
/** Отверстие в стойке под резьбовую заклёпку М6 полушестигранную — ⌀9 (уточнить по каталогу; под шестигранник — шестигранное отверстие). */
const RIVET_HOLE = 9;

/**
 * «Учесть при монтажных работах» — если трубы сверлят на ЧПУ до сварки каркаса (текст согласован с технологом).
 * post — длина стойки; posts(z) — метки у стоек на высоте z.
 */
function mountNotes(post: number, posts: (z: number) => [number, number, number][]): Note[] {
  const n = (i: number, title: string, detail: string, points: [number, number, number][] = []): Note => ({ id: `m-${i}`, kind: "mount", title: `${i}. ${title}`, detail, points });
  return [
    n(1, "Отверстия привязать к торцу стойки, а не к основанию", `Стойка режется в размер ${r(post)} и нижним торцом встаёт на полку 10П и косынку-опору. Значит, высоту каждого отверстия задаёт сама деталь. Чертёж стойки с размерами от нижнего торца — это и есть программа для ЧПУ.`, posts(100)),
    n(2, "Кондуктор под сварку базировать по отверстиям", "В кондукторе ставятся фиксаторы — штифты ⌀8,8 или болты М6 в отверстия. Стойка встаёт строго по отверстиям, и каждая кассета приходит на свои места на любом шкафу серии. Без этого сварка уведёт стойку на 1–2 мм, и отверстия разойдутся с отгибами."),
    n(3, "Отверстия держать подальше от швов", "Ближайшие швы у стойки: внизу (к основанию, на 100) и вверху (под связывающей трубой, на 1740). Крайние заклёпки сейчас примерно в 63 мм от них — это не ближе 50–60 мм, в зоне нагрева края отверстия не поведёт. Отступ 60 мм в модели оставляем как есть."),
    n(4, "Защитить отверстия при сварке", "На время сварки — временные болты М8 или керамические заглушки, иначе брызги попадут в отверстие и заклёпка не сядет. Плюс антипригарный спрей у швов."),
    n(5, "Защитить отверстия при покраске", "Порошок 60–80 мкм сузит отверстие на 0,15 мм, и заклёпка будет вставать туго. Закрыть силиконовыми заглушками или сразу дать ⌀9,1–9,2. Заклёпки ставить после окраски."),
    n(6, "Шестигранные отверстия — сразу на ЧПУ", "Труборез лазером вырежет под полушестигранное тело шестигранное отверстие, и проворот заклёпки исключён полностью. В готовой стойке такое отверстие уже не сделать. Размер под ключ — по каталогу заклёпки, обычно 9 мм. Лазер оставляет закалённую кромку: заклёпке она не мешает, но отверстие проверять калибром."),
    n(7, "Одна деталь на все места", "Все 8 стоек (основные и вторые) — одна деталь: отверстия в одной грани, ось в 20 мм от ребра, по высоте симметрично (63 от обоих торцов). У правой стороны стойку ставят другим торцом вверх — отверстия снова у наружного ребра. Метка «ВЕРХ» не нужна; контроль при сборке — ряд отверстий у наружной грани каркаса.", posts(1740)),
    n(8, "Запас на остаточную погрешность", "Отверстия в отгибах кассеты — овал 7×10 поперёк. Он выберет оставшиеся ±1–1,5 мм, и монтаж пройдёт без подгонки."),
  ];
}


/** Раскладка заклёпок крепления кассет по высоте шкафа H: в стойке (rivetZ, отметки от пола) и одна в трубе верхнего пояса (beltZ). */
function fixLayout(H: number) {
  const zPost = CH10.h, zTop = H - TUBE.h;
  // Симметрично по высоте стойки (одинаково от обоих торцов): стойка с отверстиями у одного ребра ставится любым торцом вверх — одна деталь на все места.
  const z0 = zPost + CASSETTE_T + FIX.edge, z1 = zTop - CASSETTE_T - FIX.edge;
  const perPost = Math.ceil((z1 - z0) / FIX.step) + 1;
  const rivetZ = Array.from({ length: perPost }, (_, i) => z0 + (i * (z1 - z0)) / (perPost - 1));
  return { zPost, zTop, post: zTop - zPost, perPost, perFlange: perPost + 1, rivetZ, beltZ: zTop + TUBE.h / 2 };
}

/**
 * Данные узла монтажа угловой кассеты для чертежа КМ (в координатах переднего левого угла, мм):
 * сечения кассеты и стоек, полосы-вставки, крепёж и сверловка стойки (высоты от нижнего торца).
 */
export function cassetteNode(size: CabinetSize = FIRST) {
  const fix = fixLayout(size.H);
  return {
    ...fix,
    holesFromBottom: fix.rivetZ.map((z) => r(z - fix.zPost)),
    tube: { a: TUBE.h, s: TUBE.s, r: 2 * TUBE.s },
    inset: INSET,
    cassette: NODE.cassette,
    cassetteT: CASSETTE_T,
    /** Утеплитель угловой кассеты в плане и его толщина (лист КМ 1). */
    wool: WOOL_CORNER,
    woolT: WOOL.t,
    unfold: r(2 * FLANGE + (Math.PI / 2) * (126 - CASSETTE_T / 2)),
    flange: FLANGE,
    axis: RIVET_AXIS,
    strips: NODE.strips,
    strip: STRIP,
    post2: NODE.post,
    hole: RIVET_HOLE,
    step: FIX.step,
    edge: FIX.edge,
    height: size.H,
    /** Узлы поясов (листы КМ 2 и 3): основание, косынки каркаса, панель с отгибами, цоколь. */
    belt: { zPost: CH10.h, stay: STAY_T, ch10: CH10, tube: TUBE.h, tubeS: TUBE.s, skin: SKIN, ret: PANEL.ret, plinthLeg: PLINTH.leg, notch: NOTCH, band: BAND },
    /** Швеллеры основания (лист КМ 4): 10П во всю ширину каркаса, консоли и пролёты 8П. */
    channels: { ch10: CH10, ch8: CH8, l10: size.W, console: INSET, span: size.D - 2 * INSET - 2 * CH10.w, zg: CH10.h - STAY_T },
    /** Узлы Д, Е, Ж (листы КМ 5, 6): анкеры в полках 10П, заземление на 8П, бобышки строповки над осями стоек. */
    site: { anchor: ANCHOR, lift: LIFT, W: size.W, D: size.D, inset: INSET, ch10: CH10, ch8: CH8, tube: TUBE.h },
  };
}
export function evaporatorBase(size: CabinetSize = FIRST): AppState {
  const { W, D, H } = size;
  const parts: Part[] = [];
  const add = (id: string, name: string, materialId: string, plane: Plane, a: number, b: number, x: number, y: number, z: number, extra: Partial<Part> = {}) =>
    parts.push({ id, name, materialId, plane, a: r(a), b: r(b), x: r(x), y: r(y), z: r(z), seat: false, back: false, ...(GHOST.test(materialId) ? { ghost: true } : {}), ...extra });

  // Контур чертежа W × D — несущий каркас (подтверждено): концы швеллеров, косынки-опоры, стойки и верхний пояс доходят до него; обшивка — снаружи (W + 2·SKIN).
  // Линии начала скруглений: x0, x1, y0, y1 — по ним наружные грани швеллеров основания (как на чертеже).
  /** Отступ каркаса от контура: 0 — контур чертежа и есть каркас. */
  const e = 0, CW = W - 2 * e, CD = D - 2 * e;
  const x0 = INSET, y0 = INSET, x1 = W - INSET, y1 = D - INSET, FW = x1 - x0, FD = y1 - y0;
  const T = TUBE.h, zPost = CH10.h, zTop = H - T, post = zTop - zPost;

  // --- Основание «#»: 10П вдоль X — сплошные, на всю ширину контура; полками наружу (к переду у переднего, к задней стенке у заднего) ---
  // Фигурный вырез стенки на концах, выходящих на контур: под нижний отгиб панели, верхнюю полку и скос цоколя (зазор 2 мм).
  // От торца: на отметке zg − 25 по скосу до (NOTCH.slope; zg − 6), горизонтально до NOTCH.len, вверх до низа верхней полки.
  // Контур выреза — окно в стенке (вид по стенке: A — по длине, B — по высоте от низа швеллера); идёт в DXF детали.
  const zgN = CH10.h - STAY_T;
  const notched = (len: number, h: number, flangeT: number, zBase: number, ends: ("start" | "end")[]) => {
    const top = h - flangeT, low = zgN - 25 - zBase, mid = zgN - 6 - zBase;
    const at = (u: number, end: "start" | "end") => (end === "start" ? u : len - u);
    return {
      outer: [[0, 0], [len, 0], [len, h], [0, h]] as Pt[],
      cutouts: ends.map((end) => [[at(0, end), low], [at(NOTCH.slope, end), mid], [at(NOTCH.len, end), mid], [at(NOTCH.len, end), top], [at(0, end), top]] as Pt[]),
      pockets: [],
      drills: [],
    };
  };
  const notch10 = notched(CW, CH10.h, CH10.t, 0, ["start", "end"]);
  add("base-front", `Основание, швеллер 10П L=${CW} (перед), фигурный вырез стенки на концах`, "ch10", "xz", CW, CH10.h, e, y0, 0, { openBack: true, shape: notch10 });
  add("base-back", `Основание, швеллер 10П L=${CW} (зад), фигурный вырез стенки на концах`, "ch10", "xz", CW, CH10.h, e, y1 - CH10.w, 0, { shape: notch10 });
  // 8П вдоль Y — в одном уровне с 10П (верх на 100), разрезан: консоль до контура, пролёт между стенками 10П, консоль до контура.
  const z8 = CH10.h - CH8.h;
  const spans: [string, number, number][] = [
    ["консоль перед", e, y0],
    ["пролёт", y0 + CH10.w, y1 - CH10.w],
    ["консоль зад", y1, D - e],
  ];
  for (const [side, x, open] of [["лево", x0, true], ["право", x1 - CH8.w, false]] as const)
    spans.forEach(([part, from, to], i) => {
      // Консоли выходят торцом на контур (перед — в начале, зад — в конце) — фигурный вырез стенки там же.
      const end = i === 0 ? "start" : i === 2 ? "end" : null;
      const shape8 = end ? { shape: notched(to - from, CH8.h, CH8.t, z8, [end]) } : {};
      add(`base8-${side === "лево" ? "l" : "r"}-${i + 1}`, `Основание, швеллер 8П L=${r(to - from)} (${side}, ${part})${end ? ", фигурный вырез стенки у торца" : ""}`, "ch8", "yz", to - from, CH8.h, x, from, z8, { ...(open ? { openBack: true } : {}), ...shape8 });
    });
  // Ещё два 8П под установку — в том же уровне, между стенками 10П; положение по привязке (оси), полками наружу — к своей стороне.
  const rails = size.rails ?? DEFAULT_RAILS, railLen = y1 - y0 - 2 * CH10.w;
  for (const [id, side, axis, open] of [["rail-l", "левый", rails.left, true], ["rail-r", "правый", rails.left + rails.span, false]] as const)
    add(id, `Швеллер 8П под установку L=${r(railLen)} (${side}, ось ${r(axis)} от левого края)`, "ch8", "yz", railLen, CH8.h, axis - CH8.w / 2, y0 + CH10.w, z8, open ? { openBack: true } : {});

  // Узлы: sx, sy — куда от узла внутрь шкафа (+1 от левого/переднего, −1 от правого/заднего).
  const corners = [
    { id: "fl", name: "перед-лево", sx: 1, sy: 1 },
    { id: "fr", name: "перед-право", sx: -1, sy: 1 },
    { id: "bl", name: "зад-лево", sx: 1, sy: -1 },
    { id: "br", name: "зад-право", sx: -1, sy: -1 },
  ] as const;
  /** Начало отрезка длиной len от линии lo/hi внутрь (с отступом off). */
  const from = (s: 1 | -1, lo: number, hi: number, len: number, off = 0) => (s > 0 ? lo + off : hi - off - len);

  // Отверстия под резьбовые заклёпки крепления кассет. Отгиб кассеты (zPost + CAS … H − CAS) лежит на стойке до низа пояса (zTop),
  // выше — на трубе верхнего пояса (та же плоскость). В стойке: от FIX.edge над низом кассеты до FIX.edge под поясом, шаг ≤ FIX.step;
  // в трубе пояса — одна заклёпка на отгиб по оси трубы. Сверловка стоек — в грани к кассете, в RIVET_AXIS от наружного ребра, высоты от нижнего торца (база для ЧПУ); у правых стоек — flip (та же деталь другим торцом вверх).
  const { perPost, perFlange, rivetZ, beltZ } = fixLayout(H);
  const drilled = { outer: [[0, 0], [T, 0], [T, post], [0, post]] as Pt[], cutouts: [], pockets: [], drills: rivetZ.map((z) => ({ x: RIVET_AXIS, y: r(z - zPost), d: RIVET_HOLE })) };
  /** Труба пояса длиной len с отверстиями на расстояниях at от её начала, по оси грани. */
  const beltDrilled = (len: number, at: number[]) => ({ outer: [[0, 0], [len, 0], [len, T], [0, T]] as Pt[], cutouts: [], pockets: [], drills: at.map((x) => ({ x: r(x), y: T / 2, d: RIVET_HOLE })) });
  const stays = STAYS(INSET, CH10.w, e), topStays = STAYS(INSET, T, e);
  for (const c of corners) {
    // Косынки-опоры 8 мм в плоскости верха швеллеров (по чертежу, жёлтое): контур переднего левого узла — зеркально к своему.
    const mirror = (p: Pt): Pt => [c.sx > 0 ? p[0] : W - p[0], c.sy > 0 ? p[1] : D - p[1]];
    for (const [key, title] of [["corner", "угловая (под кассетой)"], ["cantilever", "у консоли 10П (опора стойки)"], ["inner", "у второй стойки"]] as const) {
      const pts = stays[key].map(mirror);
      const lo: Pt = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))];
      const local = pts.map((p): Pt => [r(p[0] - lo[0]), r(p[1] - lo[1])]);
      add(`stay-${c.id}-${key}`, `Косынка-опора ${title}, лист 8 мм (${c.name})`, "s8", "xy", Math.max(...local.map((p) => p[0])), Math.max(...local.map((p) => p[1])), lo[0], lo[1], CH10.h - STAY_T, { shape: shape(local) });
    }
    // Косынки верха каркаса — те же три формы, заподлицо с верхом верхнего пояса (H − 8 … H); на них заворачиваются панели.
    // У консоли — за связывающей трубой (вместо стенки 10П — грань трубы 60), у второй стойки — за консолью трубы пояса (+20 по X).
    for (const [key, title, pts0] of [
      ["corner", "угловая (над кассетой)", stays.corner],
      ["cantilever", "за связывающей трубой", topStays.cantilever],
      ["inner", "за консолью пояса", stays.inner.map(([x, y]): Pt => [x + T - CH8.w, y])],
    ] as const) {
      const pts = pts0.map(mirror);
      const lo: Pt = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))];
      const local = pts.map((p): Pt => [r(p[0] - lo[0]), r(p[1] - lo[1])]);
      add(`stayT-${c.id}-${key}`, `Косынка верха каркаса ${title}, лист 8 мм (${c.name})`, "s8", "xy", Math.max(...local.map((p) => p[0])), Math.max(...local.map((p) => p[1])), lo[0], lo[1], H - STAY_T, { shape: shape(local) });
    }

    // Стойка (по чертежу, зелёное): на боковой стороне контура, наружной гранью по контуру, у начала скругления;
    // опора — конец полки 10П (46) и косынка у консоли (ещё 14): торец трубы опёрт целиком.
    // Отверстия — в грани к кассете: у передних стоек это грань у начала толщины (Y), у задних — у конца.
    add(`post-${c.id}`, `Стойка, труба 60×60×3 L=${r(post)}, ${perPost} отв. ⌀${RIVET_HOLE} (${c.name})`, "tube60", "xz", T, post, c.sx > 0 ? e : W - e - T, from(c.sy, y0, y1, T), zPost, { alongB: true, shape: drilled, drillsUnder: c.sy > 0, flip: c.sx < 0 });

    // --- Типовой угол обшивки (узел обвязки): вторая стойка, полосы-вставки, кассета на угловой косынке-опоре ---
    const within = (pts: Pt[]) => {
      const m = pts.map(mirror), lo: Pt = [Math.min(...m.map((p) => p[0])), Math.min(...m.map((p) => p[1]))];
      return { lo, local: m.map((p): Pt => [r(p[0] - lo[0]), r(p[1] - lo[1])]) };
    };
    const rect2 = ([ax, ay, bx, by]: [number, number, number, number]) => within([[ax, ay], [bx, by]]).lo;
    // Вторая стойка — на передней (задней) стороне у начала скругления: опора — консоль 8П (40 из 60).
    const p2 = rect2([NODE.post[0], NODE.post[1], NODE.post[0] + T, NODE.post[1] + T]);
    // Вторая стойка — в плоскости YZ: в чертёж идёт грань к кассете (по X); у левых — у начала толщины.
    add(`post2-${c.id}`, `Стойка кассеты, труба 60×60×3 L=${r(post)}, ${perPost} отв. ⌀${RIVET_HOLE} (${c.name}, на ${c.sy > 0 ? "передней" : "задней"} стороне)`, "tube60", "yz", T, post, p2[0], p2[1], zPost, { alongB: true, shape: drilled, drillsUnder: c.sx > 0, flip: c.sy < 0 });
    // Косынки у основания стоек (по «узел обвязки-2.dwg»): по 2 треугольные на стойку — на боковых гранях трубы (перпендикулярных стене),
    // в плоскости, параллельной стене, ближе к внутренней грани (ось — POST_GUSSET.off от неё); нижний катет — на косынке-опоре, вертикальный — к трубе.
    // Лист 8 мм вместо 6 по чертежу — одна толщина с косынками-опорами.
    const tri = (postAtEnd: boolean): Pt[] => (postAtEnd ? [[0, 0], [POST_GUSSET.a, 0], [POST_GUSSET.a, POST_GUSSET.a]] : [[0, 0], [POST_GUSSET.a, 0], [0, POST_GUSSET.a]]);
    const g = POST_GUSSET.a, gt = STAY_T;
    {
      // Основная стойка — на боковой стене: косынки в плоскости YZ, по Y перед стойкой и за ней.
      const px = c.sx > 0 ? e : W - e - T, py = from(c.sy, y0, y1, T), inner = c.sx > 0 ? px + T : px;
      const gx = c.sx > 0 ? inner - POST_GUSSET.off - gt / 2 : inner + POST_GUSSET.off - gt / 2;
      add(`pgus-${c.id}-1`, `Косынка у основания стойки −${gt}×${g}×${g} (${c.name}, основная, к переду)`, "s8", "yz", g, g, gx, py - g, zPost, { shape: shape(tri(true)) });
      add(`pgus-${c.id}-2`, `Косынка у основания стойки −${gt}×${g}×${g} (${c.name}, основная, к заду)`, "s8", "yz", g, g, gx, py + T, zPost, { shape: shape(tri(false)) });
    }
    {
      // Вторая стойка — на передней/задней стене: косынки в плоскости XZ, по X слева и справа от стойки.
      const inner = c.sy > 0 ? p2[1] + T : p2[1];
      const gy = c.sy > 0 ? inner - POST_GUSSET.off - gt / 2 : inner + POST_GUSSET.off - gt / 2;
      add(`pgus2-${c.id}-1`, `Косынка у основания стойки −${gt}×${g}×${g} (${c.name}, вторая, слева)`, "s8", "xz", g, g, p2[0] - g, gy, zPost, { shape: shape(tri(true)) });
      add(`pgus2-${c.id}-2`, `Косынка у основания стойки −${gt}×${g}×${g} (${c.name}, вторая, справа)`, "s8", "xz", g, g, p2[0] + T, gy, zPost, { shape: shape(tri(false)) });
    }
    // Полосы-вставки: первая — по грани второй стойки (лежит в плоскости YZ), вторая — по грани основной стойки (в плоскости XZ).
    NODE.strips.forEach((s, i) => {
      const lo = rect2(s);
      // От верха нижних косынок до низа верхних (верхняя угловая косынка заходит на место полосы).
      add(`strip-${c.id}-${i + 1}`, `Полоса-вставка нерж. ${STRIP.w}×${STRIP.t} L=${r(H - STAY_T - zPost)} (${c.name}, у ${i ? "основной" : "второй"} стойки)`, "ss4", i ? "xz" : "yz", STRIP.w, H - STAY_T - zPost, lo[0], lo[1], zPost);
    });
    // Кассета: гнутый лист между верхней и нижней плоскостью. Заворачивается по низу и верху каркаса: нижняя плоскость — под нижней
    // угловой косынкой (z 89…92 при косынке на 92…100), верхняя — над верхней (H … H + 3).
    const sheet = within(NODE.cassette), lid = within(NODE.lid);
    const unfold = 2 * FLANGE + (Math.PI / 2) * (126 - CASSETTE_T / 2);
    add(`cassette-${c.id}`, `Кассета угловая, гнутый лист 3 мм, развёртка ${r(unfold)} (${c.name})`, "k3", "xz", unfold, H - (zPost - STAY_T), sheet.lo[0], sheet.lo[1], zPost - STAY_T, { plan: sheet.local });
    const lw = Math.max(...lid.local.map((p) => p[0])), lh = Math.max(...lid.local.map((p) => p[1]));
    add(`lid-${c.id}-b`, `Кассета угловая, нижняя плоскость 3 мм (${c.name})`, "k3", "xy", lw, lh, lid.lo[0], lid.lo[1], zPost - STAY_T - CASSETTE_T, { shape: shape(lid.local) });
    add(`lid-${c.id}-t`, `Кассета угловая, верхняя плоскость 3 мм (${c.name})`, "k3", "xy", lw, lh, lid.lo[0], lid.lo[1], H, { shape: shape(lid.local) });
    // Утеплитель кассеты: по внутренней дуге листа, от верха нижней угловой косынки до низа верхней; жёсткая плита по R не гнётся —
    // набирается ламелями (полосы из плиты шириной ≈ 50, волокна поперёк) на клею; в модели — слой по дуге, по высоте WOOL.rows кусков.
    const wool = within(WOOL_CORNER), wh = (H - STAY_T - zPost) / WOOL.rows;
    for (let row = 0; row < WOOL.rows; row++)
      add(`wool-${c.id}-${row + 1}`, `Утеплитель угловой кассеты, минвата базальтовая ${WOOL.t}, ламели по дуге, развёртка ${r(WOOL_CORNER_DEV)} (${c.name}, ряд ${row + 1})`, "mw50", "xz", r(WOOL_CORNER_DEV), r(wh), wool.lo[0], wool.lo[1], zPost + row * wh, { plan: wool.local });
  }

  // --- Верхний пояс, трубы 60×60×3 на отметке zTop…H, рез 90°; торцы у обшивки — заглушки −3×60×60 (трубы короче на CAP) ---
  // Связывающие (передняя и задняя, вдоль X) — сплошные от обшивки до обшивки, лежат на торцах стоек и закрывают их.
  // Перпендикулярные фасаду (вдоль Y) — по наружной грани основного 8П нижнего контура (x0 / x1), разрезаны связывающими:
  // консоль до обшивки — пролёт между связывающими — консоль; торцы консолей держат верх передней и задней обшивки.
  const belt = (side: string, len: number, where: string) => `Верхний пояс ${side}, труба 60×60×3 L=${r(len)}, рез 90°, ${where}`;
  // Отверстия под заклёпки верха кассет: в связывающих — у обоих концов (в грани к кассете, x = RIVET_AXIS от боковых граней каркаса),
  // в консолях продольных — у обшивки (y = RIVET_AXIS от передней/задней грани); в грани к кассете — у начала толщины спереди и слева.
  for (const [id, side, y, under] of [["front", "передний", y0, true], ["back", "задний", y1 - T, false]] as const)
    add(`top-${id}`, belt(side, CW - 2 * CAP, "связывающая, на торцах стоек, от обшивки до обшивки, 2 отв. ⌀" + RIVET_HOLE), "tube60", "xz", CW - 2 * CAP, T, e + CAP, y, zTop, {
      shape: beltDrilled(CW - 2 * CAP, [RIVET_AXIS - CAP, CW - 2 * CAP - (RIVET_AXIS - CAP)]),
      drillsUnder: under,
    });
  const along: [string, number, number][] = [
    ["консоль перед", e + CAP, y0],
    ["пролёт", y0 + T, y1 - T],
    ["консоль зад", y1, D - e - CAP],
  ];
  for (const [id, side, x, under] of [["left", "левый", x0, true], ["right", "правый", x1 - T, false]] as const)
    along.forEach(([part, from, to], i) => {
      const hole = i === 0 ? RIVET_AXIS - from : i === 2 ? D - RIVET_AXIS - from : null;
      add(`top-${id}-${i + 1}`, belt(side, to - from, `по наружной грани 8П основания (${part})${hole === null ? "" : `, 1 отв. ⌀${RIVET_HOLE}`}`), "tube60", "yz", to - from, T, x, from, zTop, hole === null ? {} : { shape: beltDrilled(to - from, [hole]), drillsUnder: under });
    });
  // Заглушки торцов у обшивки: связывающих — по бокам, продольных консолей — спереди и сзади.
  const cap = (id: string, where: string, plane: Plane, x: number, y: number) => add(`cap-${id}`, `Заглушка торца трубы −3×60×60 (${where})`, "s3", plane, T, T, x, y, zTop);
  cap("front-l", "передняя связывающая, слева", "yz", e, y0);
  cap("front-r", "передняя связывающая, справа", "yz", W - e - CAP, y0);
  cap("back-l", "задняя связывающая, слева", "yz", e, y1 - T);
  cap("back-r", "задняя связывающая, справа", "yz", W - e - CAP, y1 - T);
  cap("left-f", "левая продольная, спереди", "xz", x0, e);
  cap("left-b", "левая продольная, сзади", "xz", x0, D - e - CAP);
  cap("right-f", "правая продольная, спереди", "xz", x1 - T, e);
  cap("right-b", "правая продольная, сзади", "xz", x1 - T, D - e - CAP);

  // --- Опорная полоса 50×8 по периметру (низ и верх каркаса): под/над отгибами прямых панелей в пролёте ---
  // В плоскости косынок (лист 8 мм, одна толщина), от контура внутрь на BAND.w. Концы — по месту: полоса заполняет полосу вдоль стены
  // между соседними деталями каркаса на той же отметке (косынки, консоли 8П, торцы 10П, трубы пояса), торец обрезан по их контуру.
  // Отверстия ⌀5 под резьбу М6 — по оси отгиба (BAND.hole от контура), шаг ≤ BAND.step: снизу винт держит отгиб панели и полку цоколя, сверху — отгиб.
  const frameIds = /^(ch10|ch8|tube60|s8|s3)$/;
  /** Контур детали в плане (мир): у пластины xy — её форма, у остальных — габарит. */
  const planOf = (p: Part): Pt[] => {
    const t = MATERIALS.find((m) => m.id === p.materialId)!.thickness;
    if (p.plane === "xy" && p.shape) return p.shape.outer.map(([u, v]): Pt => [p.x + u, p.y + v]);
    const [w, d] = p.plane === "xy" ? [p.a, p.b] : p.plane === "xz" ? [p.a, t] : [t, p.a];
    return [[p.x, p.y], [p.x + w, p.y], [p.x + w, p.y + d], [p.x, p.y + d]];
  };
  const zRange = (p: Part): [number, number] => {
    const t = MATERIALS.find((m) => m.id === p.materialId)!.thickness;
    return p.plane === "xy" ? [p.z, p.z + t] : [p.z, p.z + p.b];
  };
  /** Пересечения горизонтали v с многоугольником — отрезки по u, которые он занимает. */
  const crossings = (poly: Pt[], v: number): [number, number][] => {
    const xs: number[] = [];
    poly.forEach(([x0, y0], i) => {
      const [x1, y1] = poly[(i + 1) % poly.length];
      if ((y0 <= v && y1 > v) || (y1 <= v && y0 > v)) xs.push(x0 + ((v - y0) * (x1 - x0)) / (y1 - y0));
    });
    xs.sort((a, b) => a - b);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
    return out;
  };
  const bands: { id: string; name: string; z0: number; along: "x" | "y"; outward: 1 | -1; len: number }[] = [];
  for (const [lvl, lname, z0] of [["b", "низ", zgN], ["t", "верх", H - STAY_T]] as const)
    for (const [wid, wname, along, outward] of [["front", "перед", "x", 1], ["back", "зад", "x", -1], ["left", "лево", "y", 1], ["right", "право", "y", -1]] as const)
      bands.push({ id: `band-${lvl}-${wid}`, name: `${lname}, ${wname}`, z0, along, outward, len: along === "x" ? W : D });
  const bandParts: Part[] = [];
  for (const bd of bands) {
    // (s, w): s — вдоль стены, w — от контура внутрь.
    const toSW = ([x, y]: Pt): Pt => (bd.along === "x" ? [x, bd.outward > 0 ? y : D - y] : [y, bd.outward > 0 ? x : W - x]);
    const toXY = ([s, w]: Pt): Pt => (bd.along === "x" ? [s, bd.outward > 0 ? w : D - w] : [bd.outward > 0 ? w : W - w, s]);
    const obstacles = parts
      .filter((p) => frameIds.test(p.materialId) && zRange(p)[0] < bd.z0 + STAY_T - 0.1 && zRange(p)[1] > bd.z0 + 0.1)
      .map((p) => planOf(p).map(toSW));
    const mid = bd.len / 2, levels = Array.from({ length: 21 }, (_, i) => (BAND.w * i) / 20);
    const left: Pt[] = [], right: Pt[] = [];
    for (const w of levels) {
      const v = Math.min(Math.max(w, 0.05), BAND.w - 0.05);
      let lo = 0, hi = bd.len;
      for (const poly of obstacles)
        for (const [a, b] of crossings(poly, v)) {
          if (b <= mid) lo = Math.max(lo, b);
          else if (a >= mid) hi = Math.min(hi, a);
        }
      left.push([r(lo), w]);
      right.push([r(hi), w]);
    }
    const ring = [...left, ...right.reverse()].map(toXY);
    const lo: Pt = [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1]))];
    // Отверстия — по оси отгиба (w = BAND.hole): границы полосы на этой линии.
    const freeAt = (v: number) => {
      let a0 = 0, b0 = bd.len;
      for (const poly of obstacles)
        for (const [a, b] of crossings(poly, v)) {
          if (b <= mid) a0 = Math.max(a0, b);
          else if (a >= mid) b0 = Math.min(b0, a);
        }
      return [a0, b0];
    };
    const [sMin, sMax] = freeAt(BAND.hole);
    const n = Math.max(2, Math.ceil((sMax - sMin - 2 * BAND.end) / BAND.step) + 1);
    const holes = Array.from({ length: n }, (_, i) => toXY([sMin + BAND.end + (i * (sMax - sMin - 2 * BAND.end)) / (n - 1), BAND.hole]));
    const local = ring.map((p): Pt => [r(p[0] - lo[0]), r(p[1] - lo[1])]);
    bandParts.push({
      id: bd.id, name: `Полоса опорная ${BAND.w}×${STAY_T} (${bd.name}), ${n} отв. ⌀5 под М6, концы по месту`, materialId: "s8", plane: "xy",
      a: r(Math.max(...local.map((p) => p[0]))), b: r(Math.max(...local.map((p) => p[1]))), x: r(lo[0]), y: r(lo[1]), z: bd.z0, seat: false, back: false,
      shape: { outer: local, cutouts: [], pockets: [], drills: holes.map(([x, y]) => ({ x: r(x - lo[0]), y: r(y - lo[1]), d: 5 })) },
    });
  }
  parts.push(...bandParts);

  // --- Узел Д: привязка к фундаменту — химические анкеры М16 в нижних полках 10П ---
  // Ось анкера — ANCHOR.edge от наружной кромки полки 10П (полки наружу), по длине — ANCHOR.end от торцов (у торцов снизу — полка цоколя,
  // туда не встаёт подкладка 60×88). В полке — отверстие 20×40 вдоль швеллера (допуск разбивки ±10), шайба −8×38×60 отв. ⌀18 — на полку,
  // приваривается после выверки; под швеллером — пакет вилочных подкладок 5×60×88, 20 мм (зазор не замоноличивать).
  const anchors: Pt[] = [];
  for (const y of [y0 + ANCHOR.edge, y1 - ANCHOR.edge]) for (const x of [ANCHOR.end, W - ANCHOR.end]) anchors.push([x, y]);
  anchors.forEach(([x, y], i) =>
    add(`anchor-wash-${i + 1}`, "Шайба анкера −8×38×60, отв. ⌀18 (приварить к полке после выверки)", "s8", "xy", 60, 38, x - 30, y - 19, CH10.t, {
      shape: { outer: [[0, 0], [60, 0], [60, 38], [0, 38]], cutouts: [], pockets: [], drills: [{ x: 30, y: 19, d: 18 }] },
    }),
  );
  // --- Узел Е: заземление — пластина с болтом М10 на стенке левого 8П посередине, внутри полости; болт — к контуру ---
  const g8 = parts.find((p) => p.id === "base8-l-2")!, webIn = g8.x + CH8.w - CH8.s;
  add("ground-plate", "Пластина заземления −8×60×50 + болт М10×40 (приварить к стенке 8П)", "s8", "yz", 60, 50, webIn - STAY_T, D / 2 - 30, z8 + (CH8.h - 50) / 2);
  // --- Узел Ж: строповка — бобышки ⌀50×25 под рым-болт М20 на связывающих трубах над осями основных стоек ---
  const boss: Pt[] = Array.from({ length: 24 }, (_, i): Pt => [25 + 25 * Math.cos((i * Math.PI) / 12), 25 + 25 * Math.sin((i * Math.PI) / 12)]);
  // По «транспортировочные крюки.dwg»: на пролётах продольных труб пояса, в LIFT.off от связывающих.
  // Правило: бобышка — всегда по оси трубы (на чертеже была по оси 8П основания, на 10 к краю).
  const lugs: Pt[] = corners.map((c): Pt => [c.sx > 0 ? x0 + T / 2 : x1 - T / 2, c.sy > 0 ? y0 + T + LIFT.off : y1 - T - LIFT.off]);
  lugs.forEach(([x, y], i) => add(`boss-${i + 1}`, `Бобышка ⌀50×25, резьба М20 гл. 20 (круг 50), на продольной трубе пояса в ${LIFT.off} от связывающей`, "rd50", "xz", LIFT.h, LIFT.h, x - 25, y - 25, H, { plan: boss }));
  const bandScrews = bandParts.reduce((sum, p) => sum + p.shape!.drills.length, 0);

  // --- Панели прямых участков (по «узел обвязки-1.dwg», розовое): лист 09Г2С 2 мм снаружи каркаса, заворачивается по низу и верху ---
  // Низ: отгиб 2 мм внутрь на PANEL.ret от наружной грани — под косынками низа каркаса (z zg − 2 … zg); верх: отгиб поверх косынок верха (H … H + 2).
  // Сечение (поперёк стены от угла габарита, Z от низа отгиба); у задней/правой стены — зеркально.
  const zg = zPost - STAY_T, pTop = H + SKIN - (zg - SKIN), ret = PANEL.ret;
  const panelSection: Pt[] = [[0, 0], [ret, 0], [ret, SKIN], [SKIN, SKIN], [SKIN, pTop - SKIN], [ret, pTop - SKIN], [ret, pTop], [0, pTop]];
  const mirrorU = (sec: Pt[], width: number): Pt[] => sec.map(([u, z]): Pt => [width - u, z]);
  const panelDev = pTop - 2 * SKIN + 2 * (ret - SKIN);
  const wall = (id: string, name: string, plane: Plane, len: number, x: number, y: number, z: number, section: Pt[], dev: number, material: string) =>
    add(id, name, material, plane, len, dev, x, y, z, { section });
  wall("panel-front", `Панель передняя, лист 09Г2С 2 мм с отгибами ${ret} по низу и верху, развёртка ${r(panelDev)}`, "xz", FW, x0, -SKIN, zg - SKIN, panelSection, panelDev, "s2");
  wall("panel-back", `Панель задняя, лист 09Г2С 2 мм с отгибами ${ret} по низу и верху, развёртка ${r(panelDev)}`, "xz", FW, x0, D + SKIN - ret, zg - SKIN, mirrorU(panelSection, ret), panelDev, "s2");
  wall("panel-left", `Панель левая, лист 09Г2С 2 мм с отгибами ${ret} по низу и верху, развёртка ${r(panelDev)}`, "yz", FD, -SKIN, y0, zg - SKIN, panelSection, panelDev, "s2");
  wall("panel-right", `Панель правая, лист 09Г2С 2 мм с отгибами ${ret} по низу и верху, развёртка ${r(panelDev)}`, "yz", FD, W + SKIN - ret, y0, zg - SKIN, mirrorU(panelSection, ret), panelDev, "s2");
  // Утеплитель прямых панелей — вклеен в панель изнутри: между стойками (у передней и задней стены — между вторыми стойками,
  // у боковых — между основными), от верха нижних косынок до низа верхних; слой 50 на 5 глубже отгибов панели (45).
  {
    const wh = (H - STAY_T - zPost) / WOOL.rows, lx = FW - 2 * T, ly = FD - 2 * T;
    for (let row = 0; row < WOOL.rows; row++) {
      const z = zPost + row * wh, name = (side: string, len: number) => `Утеплитель панели ${side}, минвата базальтовая ${WOOL.t}, ${r(len)}×${r(wh)} (ряд ${row + 1})`;
      add(`wool-front-${row + 1}`, name("передней", lx), "mw50", "xz", lx, r(wh), x0 + T, e, z);
      add(`wool-back-${row + 1}`, name("задней", lx), "mw50", "xz", lx, r(wh), x0 + T, D - e - WOOL.t, z);
      add(`wool-left-${row + 1}`, name("левой", ly), "mw50", "yz", ly, r(wh), e, y0 + T, z);
      add(`wool-right-${row + 1}`, name("правой", ly), "mw50", "yz", ly, r(wh), W - e - WOOL.t, y0 + T, z);
    }
  }

  // --- Декоративная накладка цоколя (синее): гнутый лист 2 мм, по всему периметру; наружная грань — заподлицо с панелью ---
  // Профиль: нижняя полка PLINTH.leg под низом основания (z −2…0), стенка до zg − 22, скос внутрь 15 на 20, верхняя полка до PANEL.ret под отгибом панели.
  const plinthSection: Pt[] = [[SKIN, SKIN], [PLINTH.leg + SKIN, SKIN], [PLINTH.leg + SKIN, 0], [0, 0], [0, zg - 20], [15, zg], [ret, zg], [ret, zg - SKIN], [16, zg - SKIN], [SKIN, zg - 20.67]];
  const plinthW = PLINTH.leg + SKIN, plinthDev = PLINTH.leg + (zg - 22) + Math.hypot(15, 20) + (ret - 15);
  wall("plinth-front", `Цоколь передний, лист 2 мм гнутый, развёртка ${r(plinthDev)}`, "xz", FW, x0, -SKIN, -SKIN, plinthSection, plinthDev, "s2");
  wall("plinth-back", `Цоколь задний, лист 2 мм гнутый, развёртка ${r(plinthDev)}`, "xz", FW, x0, D + SKIN - plinthW, -SKIN, mirrorU(plinthSection, plinthW), plinthDev, "s2");
  wall("plinth-left", `Цоколь левый, лист 2 мм гнутый, развёртка ${r(plinthDev)}`, "yz", FD, -SKIN, y0, -SKIN, plinthSection, plinthDev, "s2");
  wall("plinth-right", `Цоколь правый, лист 2 мм гнутый, развёртка ${r(plinthDev)}`, "yz", FD, W + SKIN - plinthW, y0, -SKIN, mirrorU(plinthSection, plinthW), plinthDev, "s2");
  // Углы цоколя — гнутая стенка по R (заподлицо с прямыми); полки и скос на дуге — вытяжкой или сегментами (замечание n-plinth).
  const pR = INSET + SKIN, pBend = (Math.PI / 2) * (INSET + SKIN / 2);
  for (const a of [
    { id: "fl", name: "перед-лево", cx: x0, cy: y0, from: 180, y: -SKIN },
    { id: "fr", name: "перед-право", cx: x1, cy: y0, from: 270, y: -SKIN },
    { id: "br", name: "зад-право", cx: x1, cy: y1, from: 0, y: y1 },
    { id: "bl", name: "зад-лево", cx: x0, cy: y1, from: 90, y: y1 },
  ])
    add(`plinth-r-${a.id}`, `Цоколь угловой, лист 2 мм гнутый R${pR} (${a.name}), развёртка стенки ${r(pBend)}`, "s2", "xz", pBend, zg, a.cx > W / 2 ? W + SKIN - pBend : -SKIN, a.y, -SKIN, { arc: { cx: a.cx, cy: a.cy, r: pR, from: a.from } });

  // --- Сварка (ГОСТ 14771-76, CO₂, Св-08Г2С): длины швов на шкаф ---
  const welds = {
    // Стойка к полке 10П и косынке-опоре — по контуру трубы.
    // Стойки к основанию — основные и вторые (кассетные), по контуру трубы; вторые сверху — к консоли продольной трубы пояса.
    post: (8 + 4) * 4 * T,
    // Косынки у основания стоек: 16 шт., Т3-УП 4 мм по двум катетам с двух сторон.
    postGussets: 16 * 2 * 2 * POST_GUSSET.a,
    // Косынки-опоры к полкам и стенкам швеллеров: угловая — две кромки по 60, у консоли — кромка вдоль 8П и вдоль стенки 10П; сверху и снизу.
    // + у второй стойки — по 60 вдоль 8П и вдоль полок 10П.
    stays: 4 * 2 * (2 * 60 + (181.5 - CH10.w - 70) + 60 + 2 * 60),
    // Верхний пояс: связывающие на торцах 4 стоек + продольные к связывающим (консоли — 1, пролёт — 2 примыкания) — по контуру сечения трубы.
    caps: 8 * 4 * T,
    belt: 12 * 4 * T,
    // 8П к 10П: 4 примыкания на каждый 8П основания и по 2 у швеллеров под установку — по контуру сечения 8П (полки и стенка).
    cross: (2 * 4 + 2 * 2) * (2 * CH8.w + CH8.h),
  };
  // Наплавка на 1 м углового шва катетом k ≈ 5,4·k² г (с усилением и потерями на разбрызгивание в CO₂); стык С2 при s = 3 — как угловой k = 4.
  const wire = (((welds.post + welds.belt + welds.caps) * 9 + (welds.stays + welds.cross + welds.postGussets) * 16) / 1000) * 5.4;

  // --- Крепление кассет: винт изнутри кассеты через отгиб → полосу-вставку → стенку стойки, в резьбовую заклёпку М6 в стойке ---
  // Шаг по высоте FIX.step, крайние точки — FIX.edge от торцов отгиба; низ кассеты — 2 винта в резьбу М6 в угловой косынке-опоре 8 мм.
  const rivets = 4 * 2 * perFlange, bottom = 4 * 2;
  // Лента — на всю высоту отгиба кассеты.
  const tapeLen = H - zPost - 2 * CASSETTE_T;
// Лента — на всю высоту отгиба кассеты.  const tapeLen = H - zPost - 2 * CASSETTE_T;
  const items: Item[] = [
    { id: "wire", name: "Проволока сварочная Св-08Г2С ⌀1,0", unit: "кг", qty: Math.max(1, Math.ceil(wire / 1000)), price: 250 },
    { id: "rivnut", name: "Заклёпка резьбовая М6, цилиндрический бортик, полушестигранная, нерж. A2 (крепление кассет к стойкам)", unit: "шт", qty: rivets, price: 28 },
    { id: "screw", name: "Винт М6×25 ISO 7380 A2 (кассета → полоса → бортик заклёпки; длина — по каталогу заклёпки)", unit: "шт", qty: rivets, price: 0 },
    { id: "screw-bottom", name: "Винт М6×12 ISO 7380 A2 (низ кассеты в косынку-опору, резьба в косынке)", unit: "шт", qty: bottom, price: 0 },
    { id: "washer-epdm", name: "Шайба М6 с EPDM (под головки винтов кассет)", unit: "шт", qty: rivets + bottom, price: 0 },
    // Ленты — по 2 полосы на отгиб (у кромок, зазор под бортик и винт), на всю высоту отгиба; 4 кассеты × 2 отгиба.
    { id: "tape-under", name: `Лента EPDM самоклеящаяся ${TAPE.w}×${fmtMm(TAPE.under)} (полоса-вставка ↔ стойка, толщина = бортик заклёпки)`, unit: "м", qty: Math.ceil((4 * 2 * 2 * tapeLen) / 1000), price: 0 },
    { id: "tape-over", name: `Лента EPDM самоклеящаяся ${TAPE.w}×${fmtMm(TAPE.over)} (полоса-вставка ↔ отгиб кассеты)`, unit: "м", qty: Math.ceil((4 * 2 * 2 * tapeLen) / 1000), price: 0 },
    // Отгибы панелей и полка цоколя — к опорной полосе: снизу винт через полку цоколя и отгиб в резьбу полосы, сверху — через отгиб.
    { id: "screw-band-b", name: "Винт М6×16 ISO 7380 A2 (полка цоколя + отгиб панели → резьба в опорной полосе, низ)", unit: "шт", qty: bandScrews / 2, price: 0 },
    { id: "screw-band-t", name: "Винт М6×12 ISO 7380 A2 (отгиб панели → резьба в опорной полосе, верх)", unit: "шт", qty: bandScrews / 2, price: 0 },
    // Узлы Д, Е, Ж — монтажные и инвентарные позиции (по листам ШИУ-01-МК 6–7).
    { id: "anchor", name: "Анкер химический М16, шпилька 5.8 оцинк., L=200, hef=125 (с составом по паспорту)", unit: "шт", qty: 4, price: 0 },
    { id: "anchor-nut", name: "Гайка М16 ГОСТ ISO 4032 (2 на анкер, контргайка)", unit: "шт", qty: 8, price: 0 },
    { id: "anchor-shim", name: "Подкладка вилочная −5×60×88 (пакет 20 мм под анкер)", unit: "шт", qty: 16, price: 0 },
    { id: "ground-bolt", name: "Болт М10×40 оцинк. + гайка и шайбы (заземление, ГОСТ 21130)", unit: "шт", qty: 1, price: 0 },
    { id: "eyebolt", name: "Рым-болт М20 ГОСТ 4751-73 (инвентарный, на время подъёма)", unit: "шт", qty: 4, price: 0 },
    { id: "boss-plug", name: "Болт-заглушка М20×20 ГОСТ 7798-70 + шайба EPDM (в бобышки после монтажа)", unit: "шт", qty: 4, price: 0 },
  ];

  const at = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const nodes = (z: number) => [at(x0, y0, z), at(x1, y0, z), at(x0, y1, z), at(x1, y1, z)];
  const posts = (z: number) => [at(e, y0, z), at(W - e, y0, z), at(e, y1, z), at(W - e, y1, z)];
  // Масса шкафа по модели (без оборудования) — для указаний по строповке.
  const massKg = solidsOf({ ...EMPTY, materials: MATERIALS, parts }).reduce((sum, s) => sum + s.weight, 0);
  const notes: Note[] = [
    {
      id: "n-size",
      kind: "info",
      title: `Несущий каркас ${W} × ${D} со скруглениями R${INSET}, высота ${H}; по обшивке ${W + 2 * SKIN} × ${D + 2 * SKIN}`,
      detail: `По чертежу «контур дна.dwg», контур — несущий каркас (принято): концы швеллеров, косынки-опоры, стойки и верхний пояс доходят до контура, обшивка ${SKIN} мм снаружи — габарит по обшивке ${W + 2 * SKIN} × ${D + 2 * SKIN}; швеллеры основания — на ${INSET} от контура. Стойка L = ${r(post)} = ${H} − 100 (основание) − 60 (верхний пояс). Обшивка: прямые участки ${FW} (временно, 2 мм снаружи каркаса), углы — кассеты узла обвязки.`,
      points: [],
    },
    {
      id: "n-base",
      kind: "info",
      title: "Основание «#»: 10П сплошные, 8П вварены между ними в одном уровне",
      detail: `10П вдоль X — ${CW} мм от обшивки до обшивки. 8П вдоль Y — 3 куска на сторону: консоли ${INSET - e} мм до обшивки и пролёт ${r(y1 - y0 - 2 * CH10.w)} между стенками 10П; верх 8П на 100 (низ на ${z8} — над полом). Сварка 8П к 10П не задана: в модели — по контуру сечения 8П. Наружная консоль 8П упирается в концы полок 10П (10П открыт наружу) — шов только по кромкам полок; проверить, не нужна ли закладная пластина в полость 10П.`,
      points: nodes(CH10.h),
    },
    {
      id: "n-rails",
      kind: "info",
      title: `Швеллеры 8П под установку: ось левого — ${rails.left} от левого края, между осями — ${rails.span}`,
      detail: `Два 8П по ${r(railLen)} мм вварены между стенками 10П в одном уровне с основанием (верх на 100), полками наружу. Привязка — от левого края шкафа по обшивке до оси левого 8П и между осями; меняется кнопкой «Привязка швеллеров под установку» на вкладке «Серия». Отверстия под крепление установки не заданы — нужен чертёж опор испарителя.`,
      points: [at(rails.left, D / 2, CH10.h), at(rails.left + rails.span, D / 2, CH10.h)],
    },
    {
      id: "n-post",
      kind: "risk",
      title: "Стойки на контуре: торец на полке 10П и косынке-опоре 8 мм",
      detail:
        `Стойка 60×60 стоит на боковой стороне, наружной гранью по контуру каркаса (x ${e}…${e + T}), по y — от начала скругления (${y0}…${y0 + T}). Под торцом: полка 10П 46 мм и косынка-опора у консоли 10П (8 мм, заподлицо с верхом) — ещё 14 мм, опора сплошная. Угловая косынка-опора закрывает угол между консолями 10П и 8П по дуге обшивки (R128 — внутри неё). Пластина 120×120 и косынки стойки −5×60×60 убраны: узел у стойки другой — уточнить, нужны ли косынки стойки.`,
      points: posts(zPost),
    },
    {
      id: "n-top-corner",
      kind: "info",
      title: "Верхний пояс: связывающие трубы на торцах стоек, торцы у обшивки заглушены",
      detail: `Стойки 60×60×3 по ${r(post)} мм — от верха основания до низа пояса (${zTop}). Связывающие трубы (передняя и задняя) — сплошные ${r(CW - 2 * CAP)} мм от обшивки до обшивки, лежат на торцах стоек и закрывают их. Перпендикулярные фасаду — по наружной грани основного 8П нижнего контура (x ${x0} и ${x1}), разрезаны связывающими: консоли ${r(y0 - e - CAP)} до обшивки и пролёт ${r(y1 - y0 - 2 * T)}; торцы консолей держат верх передней и задней обшивки. Все торцы у обшивки — заглушки −3×60×60 (8 шт.), трубы короче на 3 мм. Т1-УП 3 мм по контуру сечения (12 примыканий), заглушки — сплошной шов по периметру (герметично: внутрь труб не пойдут вода и конденсат); диагонали верха ≤ 3 мм.`,
      points: posts(H),
    },
    {
      id: "n-corner-node",
      title: "Типовой угол обшивки: кассета, полосы-вставки, вторая стойка",
      detail:
        `По чертежу «узел обвязки.dwg» (угол зад-лево, остальные — зеркально). Кассета — гнутый лист 3 мм: наружная дуга R≈126, два отгиба по ${FLANGE} внутрь (на чертеже узла — 60, сужены); верхняя и нижняя плоскость 3 мм; заворачивается по низу и верху каркаса: нижняя плоскость под нижней угловой косынкой, верхняя — над верхней (z ${zg - CASSETTE_T}…${H + CASSETTE_T}). Отгибы ложатся через нержавеющие полосы-вставки ${STRIP.w}×${STRIP.t} (по глубине отгиба: выступ 5 + отгиб ${FLANGE}) на грани стоек: основной (по её передней/задней грани) и второй стойки 60×60 на передней/задней стороне (x 130…190); полосы выступают за контур на 5 мм. ` +
        `Уточнить: толщина верхней и нижней плоскости (в модели 3), материал кассет (в модели 09Г2С), крепление отгибов к стойкам через полосу (винты/заклёпки — нержавейку к чёрной стали не варить: контактная коррозия, нужна изолирующая прокладка), высота полос (в модели ${zPost}…${H}).`,
      kind: "risk",
      points: posts(zPost + 300),
    },
    {
      id: "n-fix",
      kind: "risk",
      title: `Крепление кассет: резьбовая заклёпка М6 A2 в стойке, ${rivets} шт. на шкаф`,
      detail:
        `Принято: заклёпка резьбовая М6 с цилиндрическим бортиком, полушестигранная, нерж. A2 (28 ₽/шт). Винт М6 ISO 7380 A2 с шайбой EPDM — изнутри кассеты: отгиб → полоса-вставка → стенка стойки, в заклёпку. На каждый отгиб ${perFlange} шт.: ${perPost} в стойке (шаг ≤ ${FIX.step}, от ${FIX.edge} над низом кассеты до ${FIX.edge} под верхним поясом) и 1 в трубе верхнего пояса (по оси трубы, z ${beltZ}) — выше стойки отгиб лежит на поясе; ось — в ${RIVET_AXIS} мм от наружной грани трубы (бортик ⌀13 — на плоской части грани, ключу под винтом ≈ 54 мм). Отверстия ⌀${RIVET_HOLE} — в модели (сверловка стоек и труб пояса, попадают в DXF деталей). Низ кассеты — 2 винта М6 в резьбу в косынке-опоре 8 мм. ` +
        `Отверстия в стойках — после сварки каркаса, по накладному шаблону от верха основания; при окраске закрыть заглушками; заклёпки — после окраски, заклёпочником с упором хода. ` +
        `Проверить по каталогу: диапазон захвата должен включать стенку 3 мм с запасом; отверстие под полушестигранное тело (круглое ⌀9 или шестигранное) и обжатие; глухая или открытая — открытая разгерметизирует стойку (стойки закрыты сверху и снизу), нужна глухая или герметик на резьбу. ` +
        `Стыковка с полосой-вставкой: цилиндрический бортик заклёпки (≈1,5 мм) — дистанционная шайба. Лента EPDM под полосой той же толщины (1,5) — 2 полосы ${TAPE.w} мм у кромок отгиба (0…${TAPE.w} и ${FLANGE - TAPE.w}…${FLANGE} от наружной грани), между ними зазор под бортик и винт — вырубать не нужно; полоса лежит на ленте и опирается на бортики — затяжка металл по металлу (A2 по AISI 304 — одна сталь), лента не пережимается. В полосе — только под винт: овал 6,6×12 вдоль полосы (разное удлинение нержавейки и стали). Между полосой и отгибом — так же 2 полосы ленты ${TAPE.w}×1. Пакет под головкой: шайба 2 + отгиб 3 + лента 1 + полоса 4 + бортик 1,5 + стенка 3 = 14,5 → винт ≈ М6×25 (конец — в резьбе заклёпки, не в дно глухой). Выносной элемент «Б» — лист КМ.`,
      // Метки — заклёпки одного угла (перед-лево): по грани основной стойки и второй стойки.
      points: [...rivetZ, beltZ].flatMap((z) => [at(RIVET_AXIS, y0, z), at(x0, RIVET_AXIS, z)]),
    },
    {
      id: "n-wrap",
      kind: "info",
      title: "Низ и верх панелей: отгибы под нижние и над верхними косынками каркаса, цоколь",
      detail:
        `По «узел обвязки-1.dwg». Косынки каркаса — внизу (заподлицо с верхом основания, z ${zg}…${zPost}) и вверху (заподлицо с верхом пояса, z ${H - STAY_T}…${H}), одинаковые по форме; верхняя у консоли — за связывающей трубой, у второй стойки — за консолью пояса. ` +
        `Панели прямых участков — лист 2 мм снаружи каркаса, заворачиваются: внизу отгиб ${ret} от наружной грани под косынку (z ${zg - SKIN}…${zg}), вверху — поверх (z ${H}…${H + SKIN}); развёртка ${r(panelDev)}. Угловые кассеты так же: нижняя плоскость под косынкой, верхняя — над. ` +
        `Цоколь — гнутый лист 2 мм по периметру, заподлицо с панелью: нижняя полка ${PLINTH.leg} под основанием (z −2…0), стенка, скос 15 на 20, верхняя полка до ${ret} под отгибом панели (z ${zg - 2 * SKIN}…${zg - SKIN}).`,
      points: [],
    },
    {
      id: "n-notch",
      kind: "info",
      title: "Фигурный вырез стенки швеллеров у контура (решено)",
      detail:
        `10П по бокам (оба конца) и консоли 8П спереди/сзади (наружный конец) выходят торцами на контур. Отгиб панели (z ${zg - SKIN}…${zg}, на ${ret} внутрь), скос и верхняя полка цоколя заходят внутрь — стенка у торца вырезана по огибающей с зазором 2 мм: ` +
        `от торца на z ${zg - 25} по скосу до (${NOTCH.slope}; ${zg - 6}), горизонтально до ${NOTCH.len} от торца, вверх до низа верхней полки. Верхняя полка (опора стойки) и низ стенки сохранены. Контур выреза — в DXF швеллеров (окно в стенке у торца), лист КМ 2 — вид Г. Резка — плазма/лазер по шаблону до сварки основания.`,
      points: [at(0, y0 + 23, zg), at(0, y1 - 23, zg), at(W, y0 + 23, zg), at(W, y1 - 23, zg), at(x0 + 20, 0, zg), at(x1 - 20, 0, zg), at(x0 + 20, D, zg), at(x1 - 20, D, zg)],
    },
    {
      id: "n-post-gussets",
      kind: "risk",
      title: "Косынки у основания стоек (узел обвязки-2): по прочности не нужны, решить — оставлять ли в серии",
      detail:
        `По 2 треугольные −${STAY_T}×${POST_GUSSET.a}×${POST_GUSSET.a} на стойку (16 на шкаф, лист 8 вместо 6 по чертежу — одна толщина), на косынках-опорах. Оценка без них: стойка приварена по контуру трубы швом 3 мм (катет 2,1 мм, момент сопротивления шва ≈ 10 000 мм³). ` +
        `Ветер 0,6 кПа на грань 0,9 × 1,8 м ≈ 1 кН на шкаф; даже если обшивка не работает на сдвиг и стойки — консоли, момент у основания ≈ 0,1 кН·м на стойку → напряжение в шве ≈ 10 МПа при допускаемом ~180 (запас > 15). ` +
        `Строповка за верх с испарителем внутри (до ~700 кг, динамика ×2) — растяжение шва основных стоек ≈ 7 МПа. Вывод: по прочности не обязательны. Что дают: жёсткость основания стойки на перекос (транспорт, монтаж без обшивки), стойка держит вертикаль при сварке верхнего пояса. ` +
        `Цена в серии: 16 деталей, ≈ ${(16 * 2 * 2 * POST_GUSSET.a) / 1000} м шва Т3 4 мм — порядка часа сварщика на шкаф; косынка основной стойки со стороны угла — внутри объёма кассеты (утеплитель подрезать). Рекомендация: опытный образец — с косынками; в серии — убрать, если стойки держат вертикаль в кондукторе и обшивка закреплена до транспортировки.`,
      points: corners.flatMap((c) => [at(c.sx > 0 ? 50 : W - 50, from(c.sy, y0, y1, T) + T / 2, zPost + 20), at(c.sx > 0 ? x0 + T / 2 : x1 - T / 2, c.sy > 0 ? 50 : D - 50, zPost + 20)]),
    },
    {
      id: "n-ret-support",
      kind: "info",
      title: `Опорная полоса ${BAND.w}×${STAY_T} по периметру под отгибы панелей (решено)`,
      detail: `Полоса из листа 8 мм (та же толщина, что косынки) в их плоскости: внизу z ${zgN}…${zgN + STAY_T}, вверху z ${H - STAY_T}…${H}; от контура внутрь на ${BAND.w}, по каждой стене между узлами — концы обрезаны по контуру соседних косынок, консолей 8П, торцов 10П, труб пояса (лазер в одной раскладке с косынками). Отверстия ⌀5 под резьбу М6 по оси отгиба (${BAND.hole} от контура), шаг ≤ ${BAND.step}: снизу винт М6×16 держит полку цоколя и отгиб панели, сверху М6×12 — отгиб. Сварка к косынкам и швеллерам встык, изнутри шкафа. Крепёж отгибов на косынках у углов — по месту (не заведён).`,
      points: [at(W / 2, 0, zg), at(W / 2, 0, H), at(W / 2, D, zg), at(W / 2, D, H), at(0, D / 2, zg), at(W, D / 2, H)],
    },
    {
      id: "n-plinth",
      kind: "risk",
      title: "Цоколь и отгибы угловой кассеты на дуге",
      detail: `На углах цоколь и кассета гнутые по радиусу (цоколь R${pR}, кассета R≈126): полки и скос цоколя, отгибы кассеты по дуге гибкой не делаются — нужна вытяжка (штамп/роликовый отбортовщик) или сегменты с подрезкой и сваркой; у кассеты сейчас — приварные верхняя и нижняя плоскости. В модели угловой цоколь — только гнутая стенка. Наружная дуга цоколя (R${pR} от угла каркаса) и кассеты (R≈126) не совпадают на ~2 мм — согласовать.`,
      points: corners.map((c) => at(c.sx > 0 ? 40 : W - 40, c.sy > 0 ? 40 : D - 40, 40)),
    },
    {
      id: "n-anchor",
      kind: "info",
      title: "Привязка к фундаменту (узел Д): 4 химических анкера М16 в нижних полках 10П",
      detail:
        `По листу ШИУ-01-МК 6, применено к основанию «#»: анкеры — в нижних полках 10П, ось ${ANCHOR.edge} от наружной кромки полки (y ${y0 + ANCHOR.edge} и ${y1 - ANCHOR.edge}), по длине — ${ANCHOR.end} от торцов (по осям ${W - 2 * ANCHOR.end} × ${y1 - y0 - 2 * ANCHOR.edge}); у торцов снизу полка цоколя — подкладка 60×88 там не встаёт. ` +
        `В полке — отверстие 20×40 вдоль швеллера (выполнить при изготовлении; допуск разбивки ±10). Шайба −8×38×60 отв. ⌀18 — на полку, приварить Н1-△4 по контуру после выверки; гайки — две (контргайка), затяжка изнутри швеллера с открытой стороны (полки наружу). ` +
        "Фундамент — ж/б плита ≥ 1100×1100, ≥ 250 мм, бетон ≥ B20; анкер — до края плиты ≥ 120. Выставить на пакетах подкладок 5×60×88 (20 мм) по уровню, зазор 20 под основанием не замоноличивать (проветривание). Заземление (узел Е) — болт М10 на пластине по середине левого 8П, к контуру заземления по проекту ЭС; к болту — подход снизу под цоколем или лючок в цоколе.",
      points: anchors.map(([x, y]): [number, number, number] => [x, y, 0]),
    },
    {
      id: "n-ground",
      title: "Заземление панелей обшивки не предусмотрено",
      detail:
        "Обязательно для газового шкафа. Изолирующие шайбы и лента (EPDM под полосой-вставкой и под головками винтов) разрывают электрический контакт панели с каркасом, а панель должна быть заземлена — от статики и по требованиям к оборудованию. " +
        "На каждую панель нужна перемычка: медный многожильный провод 6 мм² с наконечниками, от отгиба на болт заземления каркаса. Второй вариант — один крепёж с зубчатой контактной шайбой, но перемычка надёжнее и проще проверяется. " +
        "Болт заземления каркаса есть (узел Е: пластина на левом 8П, болт М10). Не заведены: места перемычек на кассетах и панелях, перемычки в закупе.",
      // Метки — на угловых кассетах, посередине высоты.
      points: corners.map((c) => at(c.sx > 0 ? 60 : W - 60, c.sy > 0 ? 60 : D - 60, (zPost + H) / 2)),
    },
    {
      id: "n-post2-support",
      kind: "info",
      title: "Опора второй стойки: консоль 8П и косынка-опора у второй стойки (решено, «контур дна.dwg» rev2)",
      detail: `Вторая стойка 60×60 (x ${x0}…${x0 + T} от боковой грани) стоит на консоли 8П (${CH8.w} мм) и на косынке-опоре 8 мм с внутренней стороны 8П (x ${x0 + CH8.w}…${x0 + T}), заподлицо с верхом швеллеров. Маленький угол торца (≈ 2 мм) выходит за дугу косынки R126 — допустимо. Белая полудуга R3,5 на чертеже у угла второй стойки (x ${x0 - 3.5}, на 60 мм от грани) — в модели не учтена, уточнить назначение (вырез под шов?).`,
      // Маркеры — у торца каждой второй стойки над косынкой.
      points: corners.map((c) => at(c.sx > 0 ? x0 + CH8.w + 10 : W - x0 - CH8.w - 10, c.sy > 0 ? T / 2 : D - T / 2, zPost)),
    },
    {
      id: "n-wall",
      title: "Прямые участки обшивки — временно, без кассет",
      detail: `Прямые участки обшивки (${FW} мм) пока листом 2 мм снаружи каркаса — до проработки прямых кассет и их размеров. Боковая обшивка сверху между стойками без опоры (продольные трубы пояса в ${INSET - e} мм от неё). Утеплитель — см. замечание об утеплителе кассет.`,
      kind: "risk",
      points: [at(W / 2, 0, H / 2), at(W / 2, D, H / 2)],
    },
    {
      id: "n-wool",
      kind: "info",
      title: `Утеплитель кассет и панелей: жёсткая базальтовая минвата 80–100 кг/м³, ${WOOL.t} мм`,
      detail:
        `Плиты НГ (негорючие), гидрофобизированные, 1000×600×${WOOL.t}; по высоте — ${WOOL.rows} ряда по ${r((H - STAY_T - CH10.h) / WOOL.rows)} (от верха нижних косынок, +${CH10.h}, до низа верхних, +${H - STAY_T}). ` +
        `Угловые кассеты: слой по внутренней дуге листа (R≈127 → R≈77); жёсткая плита по радиусу не гнётся — набирать ламелями (полосы из плиты шириной ≈ 50, волокна поперёк листа) на негорючем клею, развёртка набора по средней линии ≈ ${r(WOOL_CORNER_DEV)}. ` +
        `Прямые панели: плита вклеивается в панель изнутри между стойками (${FW - 2 * T} в свету), слой ${WOOL.t} на ${WOOL.t - PANEL.ret} глубже отгибов ${PANEL.ret}; панель с утеплителем ставится как кассета. ` +
        `Подрезать по месту: нижний ряд у косынок основания стоек (16 шт. −8×60×60) — паз 60×60 на глубину до 50 (у угловых кассет косынка основной стойки проходит через слой). ` +
        `Масса утеплителя по модели ≈ ${fmtMm(+solidsOf({ ...EMPTY, materials: MATERIALS, parts: parts.filter((q) => q.materialId === "mw50") }).reduce((sum, q) => sum + q.weight, 0).toFixed(1))} кг. Пароизоляция и крепление дюбелями в модели не заданы.`,
      points: corners.map((c) => at(c.sx > 0 ? 40 : W - 40, c.sy > 0 ? 40 : D - 40, H / 2)),
    },
    {
      id: "n-lift",
      kind: "info",
      title: `Строповка (узел Ж): 4 бобышки ⌀${LIFT.d}×${LIFT.h} под рым-болт М20 на пролётах продольных труб пояса`,
      detail:
        `По «транспортировочные крюки.dwg»: бобышки из круга 50 — на продольных трубах верхнего пояса, в ${LIFT.off} от связывающих (план по осям ${x1 - x0 - T} × ${y1 - y0 - 2 * T - 2 * LIFT.off}); по правилу — по оси трубы (на чертеже по оси 8П основания); Т1-△5 по контуру. ` +
        `Масса шкафа по модели ≈ ${Math.round(massKg)} кг (без оборудования). Подъём — четырёхветвевым стропом за 4 рым-болта М20, ветвь ≥ 1200 (угол от вертикали ≈ 17°); расчёт — на 2 ветви, kдин 1,3. ` +
        `Проверка при 600 кг: на бобышку ≈ 3,8 кН вертикально + 1,2 кН к центру; продольная труба (пролёт ${y1 - y0 - 2 * T}, груз в ${LIFT.off} от опоры) — σ ≈ 21 МПа, связывающая (груз в ${x0 + T / 2 - e - T / 2} от оси стойки) — ≈ 30 МПа, шов продольной к связывающей (по контуру, kf 3) — τ ≈ 7 МПа; по прочности пояса предел ≈ 3 т. Усиление пояса не требуется; стык продольной трубы со связывающей — обварить по всему контуру сечения (kf 4). Ограничение — грузоподъёмность рым-болтов М20 по ГОСТ 4751-73 с учётом угла; при массе с оборудованием выше неё — траверса или рым-болты большего размера. ` +
        `Бобышки внутри контура — отгибы панелей не задевают. После монтажа рым-болты вывернуть, поставить болты-заглушки М20 с шайбой EPDM. Временная связь через проём двери — когда появится дверь.`,
      points: lugs.map(([x, y]) => at(x, y, H + LIFT.h)),
    },
    {
      id: "n-missing",
      title: "Не заведено в модели: дно, крыша, дверь, вентиляция, ригель",
      detail: "Нет пола (полки швеллеров наружу собирают воду — дренаж), крыши с уклоном, двери/проёма обслуживания испарителя, вентпроёмов вверху и внизу, ввода/вывода газа и кабеля, болта заземления; место ригеля не задано.",
      kind: "risk",
      points: [],
    },
    {
      id: "n-welds",
      kind: "info",
      title: "Сварка на шкаф",
      detail: `Т1-УП 3 мм по контуру стоек ≈ ${welds.post} мм; косынки-опоры к швеллерам (сверху и снизу, тип не задан) ≈ ${welds.stays} мм; 8П к 10П ≈ ${welds.cross} мм (тип не задан); верхний пояс Т1-УП 3 мм по контуру трубы (12 примыканий) ≈ ${welds.belt} мм, заглушки торцов по периметру ≈ ${welds.caps} мм; проволока ≈ ${Math.round(wire)} г.`,
      points: [],
    },
    {
      id: "n-assembly",
      kind: "info",
      title: "Порядок сборки каркаса",
      detail:
        "1) Основание в кондукторе: 10П, между ними 8П в одном уровне; разность диагоналей ≤ 3 мм. 2) Косынки-опоры — заподлицо с верхом швеллеров, наружные кромки — по контуру каркаса. 3) Стойки на прихватки, вертикаль ≤ 2 мм на высоту, временно раскрепить. 4) Обварить контур стоек, чередуя стороны и стойки крест-накрест. 5) Связывающие трубы — на торцы стоек, продольные — между ними по наружной грани 8П; прихватить, проверить диагонали верха (≤ 3 мм) и вертикаль, обварить; заглушки торцов у обшивки — сплошным швом. 6) Снять временные связи, повторно проверить геометрию: диагонали верха и низа, вертикаль стоек.",
      points: [],
    },
    // --- Лист «Учесть при монтажных работах»: отверстия на ЧПУ до сварки ---
    ...mountNotes(post, posts),
  ];


  return {
    ...EMPTY,
    name: `Шкаф испарителя ${W} × ${D} × ${H}`,
    materials: MATERIALS,
    connectors: [],
    parts,
    joints: [],
    notes,
    items,
    holeConnectors: {},
    settings: { ...EMPTY.settings, gap: 10, margin: 10, partLength: 2500, partWeight: 25 },
    savedAt: Date.now(),
  };
}
