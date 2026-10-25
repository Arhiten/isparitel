// Модель серии «Шухлятка» из чертежа ЧПУ (только сервер): короб из МДФ 6 мм на шипах и ящики, задвигаемые дном в пазы боков.
// Детали — блоки чертежа (контур собран из отрезков и дуг), положение в сборе — по пазам боков и прорезям дна ящика.
// Оси как у дивана: X — ширина, Y — глубина (перед → задник), Z — вверх; мм.

import { type Panel, readBlockPanels } from "./dwg";
import { type AppState, EMPTY, type Item, type Note, type Part, type Plane, type Pt, num } from "./frame/model";

export const SOURCE_DWG = "E:\\столярка\\шухлятука ЧПУ.dwg";

const T = 6;
const MDF = { id: "mdf6", name: "МДФ", thickness: T, sheetW: 2070, sheetL: 2800, price: 1500, density: 750, E: 2500, strength: 30 };

/** Блоки чертежа: 1/2 — бока (пазы под ящики — выборка 3 мм, короткий паз — под шип стяжки), 3 — стяжка 300 × 50, 4 — дно (выборка 2 мм), 5 — задник, 6 — крышка,
 *  7 — дно ящика (прорези под шипы боковин), 8 — боковина ящика, 10/11 — перед и задняя стенка ящика. */
const BLOCKS = ["1", "2", "3", "4", "5", "6", "7", "8", "10", "11"];

const bboxOf = (r: Pt[]) => {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/** Деталь, повёрнутая на пласти (оси контура меняются местами): так горизонтальные детали ложатся длинной стороной по глубине. */
function turn(p: Panel): Panel {
  const sw = (q: Pt): Pt => [q[1], q[0]];
  return { a: p.b, b: p.a, shape: { outer: p.shape.outer.map(sw), cutouts: p.shape.cutouts.map((c) => c.map(sw)), pockets: p.shape.pockets.map((c) => c.map(sw)), drills: p.shape.drills.map((h) => ({ x: h.y, y: h.x, d: h.d })) } };
}

/** Деталь, повёрнутая на пласти на 90°: задник в листе ЧПУ лежит повёрнутым, и без поворота его шипы попадают в шипы боков. */
function quarter(p: Panel): Panel {
  const r = (q: Pt): Pt => [p.b - q[1], q[0]];
  return { a: p.b, b: p.a, shape: { outer: p.shape.outer.map(r), cutouts: p.shape.cutouts.map((c) => c.map(r)), pockets: p.shape.pockets.map((c) => c.map(r)), drills: p.shape.drills.map((h) => ({ x: p.b - h.y, y: h.x, d: h.d })) } };
}

/** Деталь, перевёрнутая по высоте (контур отражён по второй оси). */
function upsideDown(p: Panel): Panel {
  const f = (q: Pt): Pt => [q[0], p.b - q[1]];
  return { ...p, shape: { outer: p.shape.outer.map(f), cutouts: p.shape.cutouts.map((c) => c.map(f)), pockets: p.shape.pockets.map((c) => c.map(f)), drills: p.shape.drills.map((h) => ({ ...h, y: p.b - h.y })) } };
}

/** Длинные внутренние контуры — выборка на неполную глубину (пазы под дно ящика, выборка дна); короткие — сквозные пазы под шипы стяжки. */
const asPockets = (p: Panel): Panel => {
  const long = (c: Pt[]) => {
    const k = bboxOf(c);
    return Math.max(k.x1 - k.x0, k.y1 - k.y0) > 200;
  };
  return { ...p, shape: { ...p.shape, pockets: [...p.shape.pockets, ...p.shape.cutouts.filter(long)], cutouts: p.shape.cutouts.filter((c) => !long(c)) } };
};

export async function shukhlyatkaBase(data: Buffer): Promise<AppState> {
  const blocks = await readBlockPanels(data);
  const get = (name: string) => {
    const p = blocks.get(name);
    if (!p) throw new Error(`В чертеже нет блока «${name}» — модель шухлятки строится по блокам 1–11`);
    return p;
  };
  for (const n of BLOCKS) get(n);

  const parts: Part[] = [];
  const add = (id: string, name: string, panel: Panel, plane: Plane, x: number, y: number, z: number, extra: Partial<Part> = {}) =>
    parts.push({ id, name, materialId: MDF.id, plane, a: +panel.a.toFixed(2), b: +panel.b.toFixed(2), x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), seat: false, back: false, shape: panel.shape, ...extra });

  // Короб на шипах: бока стоят поперёк, дно и крышка лежат между ними, задник — сзади.
  // Перед — кромка бока без шипов: к ней открыты пазы под дно ящика. У правого бока (блок 2) она в начале контура,
  // левый (блок 1) — зеркальный: на модели он перевёрнут (flip), иначе пазы смотрели бы в задник.
  const sideL = asPockets(get("1")), sideR = asPockets(get("2")), bottom = asPockets(turn(get("4"))), top = turn(get("6")), back = quarter(get("5"));
  const W = bottom.a, D = sideR.a, H = sideR.b;
  add("box-side-l", "Бок левый", sideL, "yz", 0, 0, 0, { flip: true });
  // Выборки: пазы боков — с внутренней стороны короба, выборка 2 мм дна — снизу.
  add("box-side-r", "Бок правый", sideR, "yz", W - T, 0, 0, { pocketsUnder: true });
  add("box-bottom", "Дно", bottom, "xy", 0, 0, 0, { pocketsUnder: true });
  add("box-top", "Крышка", top, "xy", 0, 0, H - T);
  add("box-back", "Задник", back, "xz", 0, D - T, 0);

  // Стяжка лежит плашмя поперёк короба: шипы на её концах (30 × 6) проходят в сквозные пазы боков (30,9 × 6,9) — по центру паза.
  const strip = turn(get("3"));
  const tab = bboxOf(strip.shape.outer.filter((q) => q[0] < T - 0.5));
  const slot = sideR.shape.cutouts.map(bboxOf)[0];
  if (!slot) throw new Error("В боку нет паза под шип стяжки");
  const stripY = slot.x0 + (slot.x1 - slot.x0 - (tab.y1 - tab.y0)) / 2 - tab.y0, stripZ = slot.y0 + (slot.y1 - slot.y0 - T) / 2;
  add("box-strip", "Стяжка 300×50", strip, "xy", (W - strip.a) / 2, stripY, stripZ);

  // Ящики — по пазам бока (длинные узкие выборки): дно ящика заходит в паз, по центру его ширины,
  // и вдвигается спереди до конца паза (паз не доходит до задника).
  const grooves = sideR.shape.pockets.map(bboxOf).filter((k) => k.x1 - k.x0 > 200).sort((p, q) => p.y0 - q.y0);
  // Перед и задняя стенка ящика — одна деталь: шипами вниз, в дно (проверено по стыкам). Блок 10 в листе лежит шипами вверх — переворачивается.
  const dBottom = turn(get("7")), dSide = get("8"), dFront = upsideDown(turn(get("10"))), dBack = turn(get("11"));
  // Боковины ящика стоят в прорезях дна: две группы прорезей по ширине.
  const slots = [...new Set(dBottom.shape.cutouts.map((c) => +bboxOf(c).x0.toFixed(1)))].sort((p, q) => p - q);
  const slotW = dBottom.shape.cutouts.length ? bboxOf(dBottom.shape.cutouts[0]).x1 - bboxOf(dBottom.shape.cutouts[0]).x0 : T;
  const x0 = (W - dBottom.a) / 2;
  const sideX = [slots[0] ?? 12, slots.at(-1) ?? dBottom.a - 18].map((s) => x0 + s + (slotW - T) / 2);
  // Ящик закрыт, когда накладной фасад упирается в торцы корпуса (y = 0). Перед ящика входит в выборку 1 мм на внутренней
  // стороне фасада — стоит на y = −1. Паз длиннее ящика (до конца паза остаётся запас), так что ящик в задник не упирается.
  const RECESS = 1;
  const y0 = -RECESS;
  if (Math.min(...grooves.map((g) => g.x1)) < dBottom.b) throw new Error("Ящик длиннее паза бока");
  // Дно ящика скользит по пазу на полосах войлока: войлок 4 мм на двустороннем скотче tesa 4965 (0,205 мм) — по низу дна вдоль
  // обеих боковых кромок (разметка красным в «дно ящика.dwg»: 10 мм от кромки, с 20 мм до конца). Ящик лежит войлоком на нижней грани паза.
  // Паз в боках — под дно с войлоком: 6 + 4 + 0,205 + 0,5 мм на ход ≈ 10,7 мм (чертежи «… боковина (пазы 10,7).dxf»).
  const FELT_T = 4, TESA_T = 0.205, SLIDE = FELT_T + TESA_T;
  // Нижний паз опущен на 2 мм («… боковина (пазы 10,7, нижний −2).dxf»): иначе верх ящика 1 виден в зазоре над фасадом 1.
  const GROOVE_SHIFT = [-2, 0, 0, 0];
  const drawerZ = grooves.map((g, i) => g.y0 + (GROOVE_SHIFT[i] ?? 0) + SLIDE);
  const fx = (sideX[0] + sideX[1] + T) / 2 - dFront.a / 2;

  // Фасады (чертёж «фасады.dwg»): накладные, во всю ширину корпуса, снизу вверх 73,9 / 73 / 73 / 73,9 мм с зазором 2 мм —
  // вместе ровно высота корпуса. Стоят перед корпусом (y от −6 до 0). Материал — МДФ 6 мм.
  const FACADES = [73.9, 73, 73, 73.9], FACADE_GAP = 2;
  if (Math.abs(FACADES.reduce((s, h) => s + h, 0) + FACADE_GAP * (FACADES.length - 1) - H) > 0.05) throw new Error("Фасады с зазорами не равны высоте корпуса");
  const facadeZ = FACADES.map((_, i) => FACADES.slice(0, i).reduce((s, h) => s + h + FACADE_GAP, 0));

  // Крепление фасада: болт ручки М4 сквозь фасад и перед ящика (+ две полосы скотча tesa 4965 — от поворота).
  // В фасаде — отверстие ⌀4,5 по центру. Центр фасада у каждого ящика на своей высоте над низом переда, поэтому в переде —
  // вертикальный паз ⌀4,5, одинаковый у всех ящиков (болт с широкой шайбой; заодно фасад подравнивается по высоте).
  // Задняя стенка — без паза (перед отличается от неё пазом и метками).
  const BOLT_D = 4.5, SLOT_SPARE = 1;
  const boltX = W / 2 - fx;
  const boltV = FACADES.map((h, i) => facadeZ[i] + h / 2 - drawerZ[i]);
  const slotV0 = Math.min(...boltV) - SLOT_SPARE, slotV1 = Math.max(...boltV) + SLOT_SPARE;
  /** Паз «стадион» ⌀d между центрами (u, v0) и (u, v1): полуокружности точками через 15°. */
  const stadium = (u: number, v0: number, v1: number, d: number): Pt[] => {
    const r = d / 2, pts: Pt[] = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI + (Math.PI * k) / 12; pts.push([u + r * Math.cos(a), v0 + r * Math.sin(a)]); }
    for (let k = 0; k <= 12; k++) { const a = (Math.PI * k) / 12; pts.push([u + r * Math.cos(a), v1 + r * Math.sin(a)]); }
    return pts;
  };
  const withSlot = (p: Panel): Panel => ({ ...p, shape: { ...p.shape, cutouts: [...p.shape.cutouts, stadium(boltX, slotV0, slotV1, BOLT_D)] } });
  const dFrontSlot = withSlot(dFront);

  // Метки «какой фасад к какому ящику»: n точек ⌀3 (выборка 0,5 мм) в ряд по центру над пазом — снаружи на переде ящика n
  // и напротив них на фасаде n (в выборке). После сборки их не видно. Ряд симметричен — метку не перепутать при зеркальной детали.
  const MARK_D = 3, MARK_STEP = 6, MARK_V = slotV1 + BOLT_D / 2 + 10;
  const circle = (u: number, v: number, d: number): Pt[] => Array.from({ length: 24 }, (_, k) => [u + (d / 2) * Math.cos((k * Math.PI) / 12), v + (d / 2) * Math.sin((k * Math.PI) / 12)] as Pt);
  const marks = (n: number, u: number, v: number) => Array.from({ length: n }, (_, k) => circle(u + (k - (n - 1) / 2) * MARK_STEP, v, MARK_D));

  grooves.forEach((_, i) => {
    const n = i + 1, z = drawerZ[i];
    add(`d${n}-bottom`, `Дно ящика ${n}`, dBottom, "xy", x0, y0, z);
    add(`d${n}-side-l`, `Боковина ящика ${n} левая`, dSide, "yz", sideX[0], y0, z);
    add(`d${n}-side-r`, `Боковина ящика ${n} правая`, dSide, "yz", sideX[1], y0, z, { flip: true });
    const front = { ...dFrontSlot, shape: { ...dFrontSlot.shape, pockets: [...dFrontSlot.shape.pockets, ...marks(n, boltX, MARK_V)] } };
    add(`d${n}-front`, `Перед ящика ${n}`, front, "xz", fx, y0, z);
    add(`d${n}-back`, `Задняя стенка ящика ${n}`, dBack, "xz", fx, y0 + dBottom.b - T, z);
  });

  // Фасады — в конце модели: номера прежних деталей не меняются. На внутренней стороне — выборка 1 мм под перед ящика:
  // прямоугольник по наружным сторонам боковин ящика × высота переда, зазор 0,2 мм по периметру, в углах — скругления под фрезу r 1,6
  // (окружность с центром в углу). Если до кромки фасада остаётся меньше 1 мм — выборка выводится сквозь кромку (фасад 1, верх).
  const RECESS_GAP = 0.2, CORNER_R = 1.6, MIN_LIP = 1;
  const frontH = dFront.b;
  /** Прямоугольник с «костями» в углах (центр окружности — в углу); open — стороны, выведенные за кромку (без угловых скруглений). */
  const recessRing = (u0: number, v0: number, u1: number, v1: number, openTop: boolean): Pt[] => {
    const pts: Pt[] = [];
    const bone = (cu: number, cv: number, from: number) => { for (let k = 0; k <= 18; k++) { const a = from + (k * 1.5 * Math.PI) / 18; pts.push([cu + CORNER_R * Math.cos(a), cv + CORNER_R * Math.sin(a)]); } };
    // Обход против часовой: низ слева → низ справа → верх справа → верх слева; у каждого угла — дуга 270° наружу.
    bone(u0, v0, Math.PI / 2);
    bone(u1, v0, Math.PI);
    if (openTop) pts.push([u1, v1], [u0, v1]);
    else { bone(u1, v1, -Math.PI / 2); bone(u0, v1, 0); }
    return pts;
  };
  FACADES.forEach((h, i) => {
    const n = i + 1, dz = drawerZ[i] - facadeZ[i];
    const u0 = sideX[0] - RECESS_GAP, u1 = sideX[1] + T + RECESS_GAP, v0 = dz - RECESS_GAP, v1 = dz + frontH + RECESS_GAP;
    const openTop = h - v1 < MIN_LIP;
    if (v0 < MIN_LIP) throw new Error(`Фасад ${n}: выборка подходит к нижней кромке ближе ${MIN_LIP} мм`);
    const shape = {
      outer: [[0, 0], [W, 0], [W, h], [0, h]] as Pt[],
      cutouts: [],
      pockets: [recessRing(u0, v0, u1, openTop ? h + 1 : v1, openTop), ...marks(n, fx + boltX, dz + MARK_V)],
      drills: [{ x: W / 2, y: h / 2, d: BOLT_D }],
    };
    add(`d${n}-facade`, `Фасад ящика ${n}`, { a: W, b: h, shape }, "xz", 0, -T, facadeZ[i], { pocketsUnder: true });
  });

  // Полосы войлока на дне ящика: ширина 10 мм от кромки, длина — от 20 мм до конца дна; по две на ящик.
  // Ширина — не больше расстояния от кромки до прорезей под шипы боковин.
  const STRIP_W = 10, STRIP_FROM = 20;
  const stripL = dBottom.b - STRIP_FROM, strips = grooves.length * 2, stripM = (strips * stripL) / 1000;
  const slotFromEdge = Math.min(...dBottom.shape.cutouts.map((c) => { const k = bboxOf(c); return Math.min(k.x0, dBottom.a - k.x1); }));
  if (STRIP_W > slotFromEdge - 0.2) throw new Error(`Полоса войлока ${STRIP_W} мм шире, чем от кромки дна ящика до прорезей под шипы (${slotFromEdge.toFixed(1)} мм)`);

  // Набор собирают дома без инструмента и красят лаком сами: войлок — с клеевым слоем, нарезанный по размеру (клеится после окраски,
  // снять плёнку и прижать). Тонкошерстный 4 мм (арт. vt-3-1-b, шерсть 100 %, ГОСТ 288-72): кусок в выборку 2 мм на дне корпуса
  // (выступает снизу на 2 мм — корпус стоит на войлоке; углы срезаны по выборке) и полосы на дно ящиков.
  // Цена — войлока без клеевого слоя: розничная 2500 ₽/м², оптовая 2000 ₽/м² от 15 м²; клеевой слой и нарезка — уточнить у поставщика.
  const FELT_PRICE = 2500, FELT_WHOLESALE = 2000, FELT_MIN_WHOLESALE = 15;
  const recess = bottom.shape.pockets.map(bboxOf).sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
  const fw = recess ? recess.x1 - recess.x0 : 0, fl = recess ? recess.y1 - recess.y0 : 0;
  const feltM2 = (fw * fl + strips * STRIP_W * stripL) / 1e6;
  // Скотч tesa 4965 — двусторонний на ПЭТ-основе, 10 мм × 50 м, 1481 ₽: по две полосы между передом ящика и фасадом (от поворота фасада).
  const TESA_ROLL = 50, TESA_PRICE = 1481, TESA_STRIP = 240;
  const tesaM = (FACADES.length * 2 * TESA_STRIP) / 1000;
  const items: Item[] = [
    {
      id: "felt",
      name: `Войлок тонкошерстный ${FELT_T} мм с клеевым слоем, нарезанный по размеру (арт. vt-3-1-b, шерсть 100 %, ГОСТ 288-72): дно корпуса ${num(fw)} × ${num(fl)} мм со срезанными углами + ${strips} полос ${STRIP_W} × ${num(stripL, 1)} мм на дно ящиков; цена — войлока без клеевого слоя, опт от ${FELT_MIN_WHOLESALE} м² — ${num(FELT_WHOLESALE)} ₽/м²`,
      unit: "м²",
      qty: +feltM2.toFixed(4),
      price: FELT_PRICE,
      url: "https://fetr-decor.ru/",
    },
    {
      id: "tesa-4965",
      name: `Скотч двусторонний tesa 4965 (ПЭТ-основа) 10 мм × ${TESA_ROLL} м — между передом ящика и фасадом: ${FACADES.length * 2} полос × ${TESA_STRIP} мм = ${num(tesaM, 2)} м`,
      unit: "рулон",
      qty: +(tesaM / TESA_ROLL).toFixed(3),
      price: TESA_PRICE,
    },
    {
      id: "knob",
      name: `Ручка-кнопка мебельная с винтом М4 (длина винта 20–25 мм: фасад 6 + перед ящика 6 + шайба) — на каждый фасад, в отверстие ⌀${num(BOLT_D, 1)} по центру; модель и цену уточнить`,
      unit: "шт",
      qty: FACADES.length,
      price: 0,
    },
    // Расходники для домашней сборки и окраски (оценка по сборке ШХ-01, 24.10.2026):
    // клей — швы шип-паз ≈ 0,055 м² (корпус 0,019, стяжка 0,001, ящики 4 × 0,009) × 250 г/м² ≈ 14 г, с запасом ~20 мл;
    // шпаклёвка — выемки под фрезу на шипах и зазоры 0,2 мм: снаружи корпуса ≈ 4 см³, вместе с ящиками и пазами задних стенок ≈ 10 см³;
    // окраска — все детали целиком с двух сторон: пласти 2,484 м², кромки 0,195 м²; грунт ~100 мл/м² (кромки — 200 мл/м², МДФ впитывает),
    // краска или лак ~90 мл/м² × 2 слоя, +30 % на кисть: грунт 287 мл → ~375 мл, краска 482 мл → ~630 мл. Снаружи только (0,54 м²) было бы 100 и 150 мл.
    { id: "glue-pva", name: "Клей ПВА столярный (D3), флакон 30 мл — шипы корпуса и ящиков, стяжка: ≈ 14 г на шухлятку", unit: "шт", qty: 1, price: 0 },
    { id: "filler", name: "Шпатлёвка акриловая по дереву, туба 50 г — выемки под фрезу на шипах и зазоры: ≈ 4 см³ снаружи корпуса, ≈ 10 см³ со всеми ящиками", unit: "шт", qty: 1, price: 0 },
    { id: "primer", name: "Грунт акриловый по МДФ, ~375 мл — все детали целиком: пласти 2,48 м² + кромки 0,2 м² (кромки вдвое), с запасом 30 %", unit: "шт", qty: 1, price: 0 },
    { id: "paint", name: "Краска (или лак) акриловая, ~630 мл — все детали целиком: 2,68 м² в 2 слоя, с запасом 30 %", unit: "шт", qty: 1, price: 0 },
    {
      id: "washer",
      name: `Шайба М4 увеличенная (DIN 9021, 4,3 × 12 мм) — под винт ручки изнутри ящика, на паз ⌀${num(BOLT_D, 1)} в переде`,
      unit: "шт",
      qty: FACADES.length,
      price: 0,
    },
  ];

  const notes: Note[] = [
    { id: "n-drawers", title: `Ящиков ${grooves.length} — по пазам боков`, detail: "Ящиков 4 — по одному на паз бока (подтверждено). Лист раскладки ЧПУ в чертеже содержит детали только трёх: четвёртый режется отдельно.", points: [[W / 2, 0, H / 2]] },
  ];
  return {
    ...EMPTY,
    name: "Шухлятка",
    materials: [MDF],
    parts,
    joints: [],
    notes,
    items,
    // Раскладка на лист: мёртвое поле по периметру 30 мм, между деталями 20 мм; карманы — выборка 3 мм.
    settings: { ...EMPTY.settings, gap: 20, margin: 30, pocketDepth: 3 },
    savedAt: Date.now(),
  };
}
