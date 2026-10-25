// Исходные данные конструктора каркаса: фанерные панели, коннекторы и стыки. Размеры — в миллиметрах.
// Оси: X — по ширине дивана слева направо, Y — в глубину от переда к спинке, Z — вверх от пола.

/** Плоскость панели: в ней лежат стороны A и B, толщина идёт по третьей оси. */
export type Plane = "xy" | "xz" | "yz";
export const PLANES: Record<Plane, string> = { xy: "лёжа (A по X, B по Y)", xz: "вдоль дивана (A по X, B по Z)", yz: "поперёк дивана (A по Y, B по Z)" };

export type Material = {
  id: string;
  name: string;
  thickness: number;
  sheetW: number;
  sheetL: number;
  /** Цена листа, ₽. */
  price: number;
  /** Плотность, кг/м³. */
  density: number;
  /** Модуль упругости при изгибе, МПа. */
  E: number;
  /** Предел прочности при изгибе, МПа. */
  strength: number;
  /** Погонаж (брусок): «лист» — это хлыст, его ширина — сторона сечения, толщина — вторая сторона; детали режутся по длине без отступов. */
  bar?: boolean;
  /** Свои параметры раскладки для этого материала (например, лазерная резка стали), мм; без них — общие из настроек. */
  gap?: number;
  margin?: number;
  /** Стальной профиль (погонаж, bar): сечение для объёмной модели и масса метра; «лист» — хлыст длиной sheetL. Только в копии ядра для серий. */
  profile?: Profile;
};

/**
 * Сечение профиля, мм: h — по стороне B детали (стенка швеллера), w — по толщине (полка), s — стенка, t — полка; kgm — масса 1 м.
 * Швеллер в своих координатах: стенка у толщины 0, полки смотрят в сторону толщины (openBack — в обратную). Труба — замкнутая, стенка s.
 */
export type Profile = { kind: "channel" | "tube"; h: number; w: number; s: number; t: number; kgm: number };

export type Connector = {
  id: string;
  name: string;
  price: number;
  /** Несущая способность одного коннектора на срез и на отрыв, кгс; 0 — данных нет. */
  shear: number;
  pull: number;
  /** Инструмент для сборки; пусто — собирается руками. */
  tool: string;
  /** Время установки одного коннектора при сборке, с. */
  seconds: number;
  /** Диаметр отверстия в пласти под коннектор; 0 — в DXF ставится только метка. */
  holeD: number;
};

export type Pt = [number, number];
/** Контуры детали с чертежа в её координатах (от левого нижнего угла габарита): рез, карманы на неполную глубину и сквозные отверстия под метизы. */
export type Shape = { outer: Pt[]; cutouts: Pt[][]; pockets: Pt[][]; drills: { x: number; y: number; d: number }[] };

export type Part = {
  id: string;
  name: string;
  materialId: string;
  plane: Plane;
  a: number;
  b: number;
  /** Ближний к началу координат угол панели. */
  x: number;
  y: number;
  z: number;
  /** На панель садятся: проверяется на изгиб под человеком. */
  seat: boolean;
  /** На панель опираются спиной: проверяется узел крепления. */
  back: boolean;
  /** Есть у деталей, загруженных с чертежа; тогда A и B — габарит контура. */
  shape?: Shape;
  /** Наклон стоящей панели от вертикали, градусы: вокруг нижней кромки в сторону своей толщины (спинка — назад). */
  tilt?: number;
  /** Деталь стоит в сборе зеркально — перевёрнута другой пластью; на раскрой не влияет. */
  flip?: boolean;
  /** Не показывать на объёмной модели (например, крышки, чтобы видеть короб изнутри); в расчётах деталь остаётся. */
  hidden?: boolean;
  /** Показывать на объёмной модели полупрозрачной — видно и деталь, и то, что под ней. */
  ghost?: boolean;
  /** Выборки — с обратной пласти: на модели рисуются с другой стороны детали (дно шухлятки — снизу). Только в копии ядра для серий. */
  pocketsUnder?: boolean;
  /** Профиль идёт вдоль стороны B (стойка), а не вдоль A. Только в копии ядра для серий. */
  alongB?: boolean;
  /** Швеллер полками к началу толщины. */
  openBack?: boolean;
  /** Отверстия (shape.drills) — на грани у начала толщины (у трубы — сверловка этой грани); по умолчанию — на грани у конца толщины. */
  drillsUnder?: boolean;
  /** Профиль вдоль A, рез на ус 45° с обоих концов в плоскости A × толщина: длина A — по наружной грани, наружная грань у начала толщины (near) или у конца (far). */
  miter?: "near" | "far";
  /**
   * Гнутый лист — вертикальная цилиндрическая четверть (угол обшивки шкафа): A — развёртка, B — высота.
   * На 3D рисуется дугой: центр (cx, cy) — в координатах изделия, r — наружный радиус, from — начальный угол, градусы (против часовой, 90°).
   * Габарит детали в расчётах — плоская развёртка. Только в копии ядра для серий.
   */
  arc?: { cx: number; cy: number; r: number; from: number };
  /**
   * Гнутый лист произвольного сечения — вертикальная призма: контур сечения в плане (координаты изделия X, Y от угла габарита детали x, y), высота B.
   * A — развёртка (по ней раскрой и закуп). На 3D рисуется по сечению. Только в копии ядра для серий.
   */
  plan?: Pt[];
  /**
   * Гнутый профиль вдоль стены (панель с отгибами, цоколь) — вытяжка сечения вдоль A: сечение — (поперёк стены, Z) от угла габарита детали
   * (у плоскости xz поперёк — Y, у yz — X). B — развёртка сечения (по ней раскрой). Только в копии ядра для серий.
   */
  section?: Pt[];
};

export type Joint = { id: string; a: string; b: string; connectorId: string; qty: number };

export type Settings = {
  /** Масса человека, кг, и коэффициент динамики (садятся с размаху). */
  person: number;
  dynamic: number;
  /** Требуемый запас прочности. */
  safety: number;
  /** Допустимый прогиб: пролёт / n. */
  deflection: number;
  /** Горизонтальное усилие на верх спинки, кгс. */
  push: number;
  /** Раскрой: расстояние между деталями, полоса по периметру листа, поворот деталей на 90°. */
  gap: number;
  margin: number;
  rotate: boolean;
  /** Упаковка: предельные наружные размеры и вес коробки, толщина защиты по каждой стороне. */
  boxL: number;
  boxW: number;
  boxH: number;
  boxWeight: number;
  boxPad: number;
  /** Сборка: предельный вес и длина детали, с которыми справится один человек. */
  partWeight: number;
  partLength: number;
  /** Автостыки: шаг коннекторов вдоль стыка. */
  jointStep: number;
  /** Глубина карманов (жёлтый контур на чертеже), мм. */
  pocketDepth: number;
};

/** Замечание к конструкции: нестыковка, показанная на модели красными маркерами в точках [x, y, z]. */
/** Замечание с маркерами на модели: нестыковка геометрии или (kind: "risk") уязвимый узел по прочности и устойчивости. */
/** kind: без вида — нестыковка (вопрос открыт); "risk" — уязвимый узел или вопрос к узлу; "info" — справка по модели (описание узла, сварка, порядок сборки). */
export type Note = { id: string; title: string; detail: string; points: [number, number, number][]; kind?: "risk" | "info" | "mount" };

/** Комплектующее, которое не следует из отверстий: направляющие, ручки, клей, подпятники… */
/** url — где купить (ссылка показывается в закупе). */
export type Item = { id: string; name: string; unit: string; qty: number; price: number; url?: string };

/**
 * holeConnectors — какой метиз ставится в отверстия данного диаметра (ключ — диаметр, мм);
 * без записи берётся коннектор с тем же диаметром отверстия.
 */
/** savedAt — когда данные последний раз менялись (мс); по нему решается, что новее: браузер или файл проекта. */
export type AppState = { name: string; materials: Material[]; connectors: Connector[]; parts: Part[]; joints: Joint[]; notes: Note[]; items: Item[]; holeConnectors: Record<string, string>; settings: Settings; savedAt?: number };

const panel = (id: string, name: string, plane: Plane, a: number, b: number, x: number, y: number, z: number, role: Partial<Part> = {}): Part => ({ id, name, materialId: "m18", plane, a, b, x, y, z, seat: false, back: false, ...role });
const rib = (n: number, x: number) => panel(`p${4 + n}`, `Ребро ${n}`, "yz", 722, 200, x, 58, 100);

/** Пример: двухместный каркас 2000 × 900 × 600 из фанеры 18 мм. Заменяется своими данными. */
export const SAMPLE_PARTS: Part[] = [
  panel("p1", "Боковина левая", "yz", 900, 600, 0, 0, 0),
  panel("p2", "Боковина правая", "yz", 900, 600, 1982, 0, 0),
  panel("p3", "Царга передняя", "xz", 1964, 200, 18, 40, 100),
  panel("p4", "Царга задняя", "xz", 1964, 200, 18, 780, 100),
  rib(1, 500),
  rib(2, 991),
  rib(3, 1482),
  panel("p8", "Настил сиденья", "xy", 1964, 758, 18, 40, 300, { seat: true }),
  panel("p9", "Спинка", "xz", 1964, 500, 18, 882, 100, { back: true }),
];

const SAMPLE_JOINTS: Joint[] = (
  [
    ["p1", "p3", 2], ["p2", "p3", 2], ["p1", "p4", 2], ["p2", "p4", 2], ["p1", "p9", 2], ["p2", "p9", 2], ["p1", "p8", 3], ["p2", "p8", 3],
    ["p3", "p5", 2], ["p3", "p6", 2], ["p3", "p7", 2], ["p4", "p5", 2], ["p4", "p6", 2], ["p4", "p7", 2],
    ["p3", "p8", 7], ["p4", "p8", 7], ["p5", "p8", 2], ["p6", "p8", 2], ["p7", "p8", 2],
  ] as const
).map(([a, b, qty], i) => ({ id: `j${i + 1}`, a, b, connectorId: "c1", qty }));

export const EMPTY: AppState = {
  name: "Каркас дивана",
  // Свойства и цены — ориентировочные: уточняются по сертификату и прайсу поставщика.
  materials: [
    { id: "m15", name: "Фанера берёзовая ФСФ", thickness: 15, sheetW: 1220, sheetL: 2440, price: 3900, density: 680, E: 6000, strength: 40 },
    { id: "m18", name: "Фанера берёзовая ФСФ", thickness: 18, sheetW: 1220, sheetL: 2440, price: 4500, density: 680, E: 6000, strength: 40 },
    { id: "m12", name: "Фанера берёзовая ФК", thickness: 12, sheetW: 1525, sheetL: 1525, price: 1700, density: 680, E: 6000, strength: 40 },
  ],
  connectors: [{ id: "c1", name: "Коннектор металлический (пример)", price: 60, shear: 80, pull: 50, tool: "", seconds: 20, holeD: 8 }],
  parts: SAMPLE_PARTS,
  joints: SAMPLE_JOINTS,
  notes: [],
  items: [],
  holeConnectors: {},
  settings: { person: 100, dynamic: 1.5, safety: 2, deflection: 150, push: 20, gap: 30, margin: 30, rotate: true, boxL: 2000, boxW: 800, boxH: 200, boxWeight: 25, boxPad: 10, partWeight: 12, partLength: 1800, jointStep: 300, pocketDepth: 1 },
};

// --- Хранилище: состояние живёт в localStorage браузера ---

const KEY = "frame-v1";
let state: AppState | null = null;
const listeners = new Set<() => void>();

/** Дополняет сохранённые данные полями, которых в них ещё не было. */
export function restore(saved: Partial<AppState>): AppState {
  return { ...EMPTY, ...saved, settings: { ...EMPTY.settings, ...saved.settings }, materials: saved.materials?.length ? saved.materials : EMPTY.materials };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return restore(JSON.parse(raw));
  } catch {}
  return EMPTY;
}

export const getState = () => (state ??= load());
export const getServerState = () => EMPTY;

export function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

export function update(fn: (s: AppState) => AppState) {
  state = { ...fn(getState()), savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

/** Файл проекта, который открывается вместо примера. */
export const PROJECT_URL = "/frame/divan-s-yashchikami.json";

/**
 * Подтягивает файл проекта, если в браузере ничего нет или файл новее того, что в браузере:
 * правки в файле не теряются за старой копией, а свои правки в браузере (они новее файла) остаются.
 */
export async function syncProject(url = PROJECT_URL) {
  try {
    const res = await fetch(`${url}?${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const file = (await res.json()) as AppState;
    let local: AppState | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      local = raw ? JSON.parse(raw) : null;
    } catch {}
    if (local && (local.savedAt ?? 0) >= (file.savedAt ?? 0)) return;
    state = restore(file);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
    listeners.forEach((l) => l());
  } catch {}
}

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
export const rub = (n: number) => money.format(n);
export const num = (n: number, digits = 0) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
export const uid = () => Math.random().toString(36).slice(2, 10);
export const materialLabel = (m: Material) => (m.bar ? m.name : `${m.name} ${num(m.thickness, 1)} мм`);
