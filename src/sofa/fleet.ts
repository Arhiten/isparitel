// Опытная серия: unitCount экземпляров одной модели (series.ts), у каждой детали — свой номер и свой цикл чертежа.
// Чистый TS: им пользуются и страница, и серверные маршруты.

import type { AppState, Material, Part, Shape } from "./frame/model";
import { type Series, unitCode, unitFolder } from "./series";

// --- Виды материала и цвета на модели ---

export type Kind = "plywood" | "mdf" | "bar" | "steel" | "insulation";
export const KINDS: Record<Kind, { title: string; letter: string; color: string }> = {
  plywood: { title: "Фанера", letter: "Ф", color: "#a8703c" },
  // Плита МДФ — «П»: буква «М» уже у металла.
  mdf: { title: "МДФ", letter: "П", color: "#b8946a" },
  bar: { title: "Брусок", letter: "Б", color: "#e2c48e" },
  // Не принятый (не зафиксированный) металл — голубой: сразу видно, каких закладных ещё нет в изделии.
  steel: { title: "Металл", letter: "М", color: "#4aa8e0" },
  // Минвата и базальтовый картон шкафа испарителя.
  insulation: { title: "Утеплитель", letter: "У", color: "#d8c86a" },
};
/** Принятая деталь во всём проекте — светло-серая. */
export const ACCEPTED_COLOR = "#c4c4c4";

export const kindOf = (m: Material): Kind =>
  m.density > 3000 ? "steel" : m.bar ? "bar" : /МДФ|MDF/i.test(m.name) ? "mdf" : /вата|картон|утепл/i.test(m.name) ? "insulation" : "plywood";

/** Номер детали: экземпляр, вид материала и позиция в модели — ДЯ-03-Ф-017. Позиция постоянна, пока не меняется модель. */
export const partNo = (unit: string, kind: Kind, index: number) => `${unit}-${KINDS[kind].letter}-${String(index + 1).padStart(3, "0")}`;

// --- Цикл чертежа детали ---

export type Status = "none" | "loaded" | "production" | "fix" | "accepted" | "skipped";
export const STATUSES: Record<Status, { title: string; color: string }> = {
  none: { title: "Нет чертежа", color: "#9aa0a6" },
  loaded: { title: "Чертёж загружен", color: "#2f6fd6" },
  production: { title: "В изготовлении", color: "#d08a00" },
  fix: { title: "Требует корректировки", color: "#d03a2f" },
  accepted: { title: "Принята", color: "#2e8b57" },
  // Детали модели нет в этом экземпляре (например, две крышки вместо четырёх): на модели не рисуется, в счёт не идёт.
  skipped: { title: "Не изготавливается", color: "#6b5b95" },
};

/**
 * Куда деталь может перейти. Загрузка чертежа (новой ревизии) — отдельное действие, оно всегда ведёт в «загружен».
 * Из корректировки можно вернуть в изготовление без нового чертежа (переделка по тому же чертежу).
 * Приёмку можно отменить только с причиной — так брак после приёмки не теряется.
 */
export const NEXT: Record<Status, Status[]> = {
  none: ["skipped"],
  loaded: ["production"],
  production: ["fix", "accepted"],
  fix: ["production"],
  accepted: ["fix"],
  skipped: ["none"],
};
/** Переходы, при которых нужна причина. */
export const NEEDS_COMMENT: Status[] = ["fix", "skipped"];

/** deviation — с этой ревизией деталь сделана не так, как в модели (описание расхождения). */
export type HistoryEntry = { at: number; status: Status; rev: number; comment?: string; order?: string; who?: string; deviation?: string };

/** Отклонение факта изготовления от модели серии: что изменено и с какой ревизии чертежа. */
export type Deviation = { text: string; rev: number; at: number };

export type PartRecord = {
  no: string;
  /** id детали в базовой модели. */
  partId: string;
  status: Status;
  /** Текущая ревизия чертежа (0 — нет) и имя файла в папке drawings экземпляра. */
  rev: number;
  file?: string;
  order?: string;
  /** Текущее отклонение от модели: задаётся при загрузке ревизии, следующая ревизия без отметки его снимает. */
  deviation?: Deviation;
  /** Фактический контур детали из загруженного DWG (rev — с какой ревизии); есть — модель дивана рисует его вместо проектного. */
  asBuilt?: { shape: Shape; a: number; b: number; rev: number };
  /** Деталь сверх модели (есть в факте изготовления, нет в модели серии): её описание; на 3D-модели не рисуется. */
  extra?: Part;
  history: HistoryEntry[];
};

export type Unit = { code: string; name: string; folder: string; createdAt: number; parts: Record<string, PartRecord> };

export type Order = { no: string; at: number; parts: string[]; file?: string };

export type Stock = Record<string, number>;

export type Fleet = { series: Series; base: AppState; units: Unit[]; orders: Order[]; stock: Stock; root: string };

/** Позиции деталей в модели по видам: номер детали строится из позиции среди деталей своего вида. */
export function numbering(base: AppState) {
  const counters: Record<Kind, number> = { plywood: 0, mdf: 0, bar: 0, steel: 0, insulation: 0 };
  return base.parts.map((p) => {
    const m = base.materials.find((x) => x.id === p.materialId) ?? base.materials[0];
    const kind = kindOf(m);
    return { part: p, material: m, kind, index: counters[kind]++ };
  });
}

export function newUnit(series: Series, base: AppState, n: number): Unit {
  const code = unitCode(series, n);
  const parts: Record<string, PartRecord> = {};
  for (const { part, kind, index } of numbering(base)) {
    const no = partNo(code, kind, index);
    parts[part.id] = { no, partId: part.id, status: "none", rev: 0, history: [] };
  }
  return { code, name: `${series.name} №${n}`, folder: unitFolder(series, code), createdAt: Date.now(), parts };
}

/**
 * Модель экземпляра: детали с фактическим контуром подменяют проектные (положение в сборе — от проектной детали),
 * неизготавливаемые убираются.
 */
export const unitState = (base: AppState, unit: Unit): AppState => ({
  ...base,
  parts: base.parts
    .filter((p) => unit.parts[p.id]?.status !== "skipped")
    .map((p) => {
      const f = unit.parts[p.id]?.asBuilt;
      return f ? { ...p, shape: f.shape, a: f.a, b: f.b } : p;
    }),
});

/** Детали экземпляра в счёте хода работ: без неизготавливаемых, вместе с деталями сверх модели. */
export const counted = (unit: Unit) => Object.values(unit.parts).filter((r) => r.status !== "skipped");

/** Описание детали записи: из модели серии или (для детали сверх модели) из самой записи. */
export const partFor = (base: AppState, r: PartRecord): Part | undefined => r.extra ?? base.parts.find((p) => p.id === r.partId);

/** Деталь записи с фактическим контуром, если он загружен, — для раскладки и чертежей заказа. */
export const factPart = (base: AppState, r: PartRecord): Part | undefined => {
  const p = partFor(base, r);
  return p && r.asBuilt ? { ...p, shape: r.asBuilt.shape, a: r.asBuilt.a, b: r.asBuilt.b } : p;
};

/** Виды материала, которые есть в модели серии или среди деталей сверх модели, — только они показываются в легенде и спецификации. */
export function kindsIn(fleet: Pick<Fleet, "base" | "units">): Kind[] {
  const used = new Set(numbering(fleet.base).map((r) => r.kind));
  for (const u of fleet.units)
    for (const r of Object.values(u.parts)) {
      const m = r.extra && fleet.base.materials.find((x) => x.id === r.extra!.materialId);
      if (m) used.add(kindOf(m));
    }
  return (Object.keys(KINDS) as Kind[]).filter((k) => used.has(k));
}

/** Номер детали сверх модели: ДЯ-01-Ф-Д01 — «Д» отличает её от деталей модели. */
export const extraNo = (unit: Unit, kind: Kind) => {
  const prefix = `${unit.code}-${KINDS[kind].letter}-Д`;
  const n = Object.values(unit.parts).filter((r) => r.no.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
};

export const partOf =(base: AppState, id: string): Part | undefined => base.parts.find((p) => p.id === id);

/** Детали, готовые к заказу: чертёж загружен, в изготовление ещё не ушли. */
export const readyForOrder = (fleet: Fleet) => fleet.units.flatMap((u) => Object.values(u.parts).filter((r) => r.status === "loaded").map((r) => ({ unit: u, record: r })));

export const orderNo = (n: number) => `З-${String(n).padStart(3, "0")}`;
