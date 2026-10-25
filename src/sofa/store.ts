// Хранилище серии на диске: у каждого экземпляра своя рабочая папка с unit.json и чертежами деталей.
// Только для сервера (route handlers). Папка серии — series.folder:
//
// sofa-projects/ (shukhlyatka-projects/ …)
//   base.json                         — модель, с которой размножена серия (снимок эталона на момент создания)
//   ДЯ-01 Диван с ящиками/unit.json   — статусы и история деталей экземпляра
//   ДЯ-01 Диван с ящиками/drawings/   — чертежи: «ДЯ-01-Ф-017 rev2.dwg»
//   Заказы/orders.json, Заказы/З-001/ — заказы изготовления и их раскладки
//   Закуп/stock.json                  — что уже куплено
//   Исходник/                         — исходный чертёж серии, если модель построена из DWG

import { promises as fs } from "node:fs";
import path from "node:path";
import { type Panel, matchPanel, orient, pocketsLikeModel, readPanels } from "./dwg";
import type { AppState, Part } from "./frame/model";
import { type Fleet, type HistoryEntry, NEEDS_COMMENT, NEXT, type Order, STATUSES, type Status, type Stock, type Unit, extraNo, kindOf, newUnit, orderNo, partFor } from "./fleet";
import type { Series } from "./series";
import { SOURCE_DWG, shukhlyatkaBase } from "./shukhlyatka";
import { type CabinetSize, FIRST, type Rails, checkRails, evaporatorBase } from "./evaporator";

/** Эталон дивана — проект «Фанерный каркас дивана». */
const REFERENCE = "C:\\Users\\User\\Desktop\\Работа\\Claude\\.claude\\worktrees\\plywood-sofa-frame-c0aefd\\public\\frame\\divan-s-yashchikami.json";

const rootOf = (s: Series) => path.join(process.cwd(), s.folder);
const ordersDir = (root: string) => path.join(root, "Заказы");
const stockFile = (root: string) => path.join(root, "Закуп", "stock.json");

/** Модель серии при её создании: диван — снимок эталона, шухлятка — сборка из чертежа ЧПУ (чертёж копируется в «Исходник»), шкаф испарителя — параметрическая. */
async function sourceModel(s: Series, root: string): Promise<AppState> {
  if (s.id === "evaporator") return evaporatorBase(await evaporatorSize(root));
  if (s.id === "shukhlyatka") {
    const data = await fs.readFile(SOURCE_DWG).catch(() => null);
    if (!data) throw new Error(`Не найден чертёж модели: ${SOURCE_DWG}`);
    await fs.mkdir(path.join(root, "Исходник"), { recursive: true });
    await fs.writeFile(path.join(root, "Исходник", path.basename(SOURCE_DWG)), data);
    return shukhlyatkaBase(data);
  }
  const base = await readJson<AppState>(REFERENCE);
  if (!base) throw new Error(`Не найден файл модели: ${REFERENCE}`);
  return base;
}

/** Параметры шкафа испарителя, заданные на странице (привязка швеллеров под установку), — params.json в папке серии. */
const paramsFile = (root: string) => path.join(root, "params.json");
export async function evaporatorSize(root: string): Promise<CabinetSize> {
  const saved = await readJson<{ rails?: Rails }>(paramsFile(root));
  return { ...FIRST, ...(saved?.rails ? { rails: saved.rails } : {}) };
}

/**
 * Новая привязка швеллеров 8П под установку: сохраняется в params.json, модель серии (base.json) строится заново.
 * Детали экземпляров остаются со своими номерами, статусами и чертежами — меняется только положение швеллеров в модели.
 */
export async function setRails(series: Series, rails: Rails) {
  if (series.id !== "evaporator") throw new Error("Привязка швеллеров — только у шкафа испарителя");
  const root = rootOf(series);
  const size = { ...(await evaporatorSize(root)), rails: { left: Math.round(rails.left * 10) / 10, span: Math.round(rails.span * 10) / 10 } };
  const err = checkRails(size.rails, size);
  if (err) throw new Error(err);
  await writeJson(paramsFile(root), { rails: size.rails });
  await writeJson(path.join(root, "base.json"), evaporatorBase(size));
  return size.rails;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

const unitFile = (root: string, u: Pick<Unit, "folder">) => path.join(root, u.folder, "unit.json");

/** Создаёт серию при первом обращении: снимок модели и папка на каждый экземпляр (unitCount). Существующие папки не трогает, недостающие досоздаёт. */
export async function loadFleet(series: Series): Promise<Fleet> {
  const root = rootOf(series);
  let base = await readJson<AppState>(path.join(root, "base.json"));
  if (!base) {
    base = await sourceModel(series, root);
    await writeJson(path.join(root, "base.json"), base);
  }
  const units: Unit[] = [];
  for (let n = 1; n <= series.unitCount; n++) {
    const fresh = newUnit(series, base, n);
    let unit = await readJson<Unit>(unitFile(root, fresh));
    if (!unit) {
      unit = fresh;
      await fs.mkdir(path.join(root, unit.folder, "drawings"), { recursive: true });
      await writeJson(unitFile(root, unit), unit);
    } else {
      // Детали, добавленные в модель после создания экземпляра (например, фасады шухлятки), — дописываются со своими номерами.
      const missing = Object.keys(fresh.parts).filter((id) => !unit!.parts[id]);
      if (missing.length) {
        for (const id of missing) unit.parts[id] = { ...fresh.parts[id], history: [{ at: Date.now(), status: "none", rev: 0, comment: "Деталь добавлена в модель серии" }] };
        await writeJson(unitFile(root, unit), unit);
      }
    }
    units.push(unit);
  }
  const orders = (await readJson<Order[]>(path.join(ordersDir(root), "orders.json"))) ?? [];
  const stock = (await readJson<Stock>(stockFile(root))) ?? {};
  return { series, base, units, orders, stock, root };
}

const saveUnit = (fleet: Fleet, u: Unit) => writeJson(unitFile(fleet.root, u), u);

function target(fleet: Fleet, unit: string, partId: string, all: boolean) {
  const units = all ? fleet.units : fleet.units.filter((u) => u.code === unit);
  if (!units.length) throw new Error(`Нет экземпляра ${unit}`);
  return units.map((u) => {
    const r = u.parts[partId];
    if (!r) throw new Error(`Нет детали ${partId} в ${u.code}`);
    return { u, r };
  });
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

/**
 * Новая ревизия чертежа: файл кладётся в папку каждого выбранного экземпляра, деталь — в «Чертёж загружен».
 * all — та же деталь во всех экземплярах серии (одна модель — один чертёж). Принятые детали не перезаписываются.
 * deviation — описание отличия от модели; пусто — ревизия соответствует модели, прежняя отметка снимается.
 * correction — уточнение чертежа факта у принятой детали (только этого экземпляра): ревизия добавляется, деталь остаётся принятой.
 * Из DWG читается фактический контур детали: модель экземпляра рисует его вместо проектного.
 * panel — номер детали в чертеже, где их несколько (слева направо, с 0); без него деталь подбирается по модели.
 */
export async function uploadDrawing(
  series: Series,
  unit: string,
  partId: string,
  name: string,
  data: Buffer,
  opts: { all?: boolean; comment?: string; deviation?: string; correction?: boolean; panel?: number } = {},
) {
  const { all = false, comment, deviation, correction = false } = opts;
  const fleet = await loadFleet(series);
  const dev = deviation?.trim().replace(/\s+/g, " ") || undefined;
  if (dev && dev.length > 500) throw new Error("Описание отклонения длиннее 500 символов");
  if (correction && all) throw new Error("Чертёж факта уточняется только для одного экземпляра");
  const own = fleet.units.find((u) => u.code === unit)?.parts[partId];
  if (own?.extra && all) throw new Error("Деталь сверх модели есть только в своём экземпляре");
  const ext = path.extname(name).toLowerCase() || ".dwg";
  const model = own ? partFor(fleet.base, own) : undefined;
  let panel: Panel | undefined;
  if (ext === ".dwg" || ext === ".dxf") {
    try {
      const panels = await readPanels(data, !!series.dwgPieces);
      panel = opts.panel !== undefined ? panels[opts.panel] : model && !own?.extra ? matchPanel(panels, model) : panels[0];
      // Чертежи ArchiCAD: деталь бывает повёрнута относительно модели, а выборка нарисована тем же слоем, что и рез.
      if (panel && model && !own?.extra && series.dwgPieces) panel = pocketsLikeModel(orient(panel, model), model);
    } catch {
      panel = undefined;
    }
  }
  const touched: string[] = [];
  for (const { u, r } of target(fleet, unit, partId, all)) {
    if (correction) {
      if (r.status !== "accepted") throw new Error(`${r.no}: уточнять чертёж факта можно только у принятой детали`);
    } else if (r.status === "accepted" || r.status === "production" || r.status === "skipped") {
      if (all && u.code !== unit) continue;
      if (r.status === "skipped") throw new Error(`${r.no}: деталь не изготавливается в этом экземпляре — сначала верните её`);
      throw new Error(`${r.no}: деталь ${r.status === "accepted" ? "принята" : "в изготовлении"} — сначала отметьте корректировку`);
    }
    r.rev += 1;
    r.file = `${safe(r.no)} rev${r.rev}${ext}`;
    await fs.writeFile(path.join(fleet.root, u.folder, "drawings", r.file), data);
    if (!correction) {
      r.status = "loaded";
      r.order = undefined;
    }
    r.asBuilt = panel ? { ...panel, rev: r.rev } : undefined;
    // У детали сверх модели проекта нет — её размеры и контур берутся из чертежа.
    if (r.extra && panel) r.extra = { ...r.extra, a: panel.a, b: panel.b, shape: panel.shape };
    const at = Date.now();
    r.deviation = dev ? { text: dev, rev: r.rev, at } : undefined;
    r.history.push({ at, status: r.status, rev: r.rev, comment: comment || `${correction ? "Уточнён чертёж факта" : "Загружен"} ${name}`, deviation: dev });
    await saveUnit(fleet, u);
    touched.push(r.no);
  }
  // Контур чертежа, который по габариту не похож на деталь модели (ни как есть, ни повёрнутый; допуск 5 %), — скорее всего, не тот файл.
  const near = (p: number, q: number) => Math.abs(p - q) <= 0.05 * Math.max(p, q);
  const misfit = panel && model && !own?.extra && model.a > 0 && !((near(panel.a, model.a) && near(panel.b, model.b)) || (near(panel.a, model.b) && near(panel.b, model.a)));
  const warning = misfit ? `Контур чертежа ${panel!.a.toFixed(1)} × ${panel!.b.toFixed(1)} мм не похож на деталь «${model!.name}» ${model!.a.toFixed(1)} × ${model!.b.toFixed(1)} мм — проверьте, тот ли файл загружен.` : null;
  return { touched, warning, contour: panel ? `${panel.a.toFixed(1)} × ${panel.b.toFixed(1)} мм, окон ${panel.shape.cutouts.length}, отверстий ${panel.shape.drills.length}` : null };
}

export async function setStatus(series: Series, unit: string, partId: string, status: Status, comment: string | undefined, all: boolean) {
  const fleet = await loadFleet(series);
  if (NEEDS_COMMENT.includes(status) && !comment?.trim()) throw new Error("Укажите, что нужно исправить");
  const touched: string[] = [];
  for (const { u, r } of target(fleet, unit, partId, all)) {
    if (!NEXT[r.status].includes(status)) {
      if (all && u.code !== unit) continue;
      throw new Error(`${r.no}: из «${STATUSES[r.status].title}» нельзя перейти в «${STATUSES[status].title}»`);
    }
    r.status = status;
    r.history.push({ at: Date.now(), status, rev: r.rev, comment: comment?.trim() || undefined, order: r.order });
    await saveUnit(fleet, u);
    touched.push(r.no);
  }
  return touched;
}

/** Заказ изготовления: детали уходят «в изготовление» с номером заказа, раскладка сохраняется в папку заказа. */
export async function createOrder(series: Series, items: { unit: string; partId: string }[], layouts: { name: string; text: string }[]) {
  const fleet = await loadFleet(series);
  if (!items.length) throw new Error("В заказе нет деталей");
  const no = orderNo(fleet.orders.length + 1);
  const parts: string[] = [];
  const changed = new Set<Unit>();
  for (const it of items) {
    const u = fleet.units.find((x) => x.code === it.unit);
    const r = u?.parts[it.partId];
    if (!u || !r || r.status !== "loaded") continue;
    r.status = "production";
    r.order = no;
    const entry: HistoryEntry = { at: Date.now(), status: "production", rev: r.rev, order: no, comment: `Заказ ${no}` };
    r.history.push(entry);
    parts.push(r.no);
    changed.add(u);
  }
  if (!parts.length) throw new Error("Ни одна деталь не готова к заказу");
  const dir = path.join(ordersDir(fleet.root), no);
  await fs.mkdir(dir, { recursive: true });
  for (const l of layouts) await fs.writeFile(path.join(dir, safe(l.name)), l.text, "utf8");
  // Чертежи деталей заказа — копией в папку заказа: исполнитель получает одну папку.
  await fs.mkdir(path.join(dir, "чертежи"), { recursive: true });
  for (const u of changed)
    for (const r of Object.values(u.parts))
      if (r.order === no && r.file) await fs.copyFile(path.join(fleet.root, u.folder, "drawings", r.file), path.join(dir, "чертежи", r.file)).catch(() => {});
  await writeJson(path.join(dir, "детали.json"), parts);
  for (const u of changed) await saveUnit(fleet, u);
  const order: Order = { no, at: Date.now(), parts, file: layouts[0]?.name };
  await writeJson(path.join(ordersDir(fleet.root), "orders.json"), [...fleet.orders, order]);
  return order;
}

/** Деталь сверх модели: есть в факте изготовления этого экземпляра, в модели серии её нет. Чертёж загружается к ней отдельно. */
export async function addExtraPart(series: Series, unit: string, name: string, materialId: string) {
  const fleet = await loadFleet(series);
  const u = fleet.units.find((x) => x.code === unit);
  if (!u) throw new Error(`Нет экземпляра ${unit}`);
  const material = fleet.base.materials.find((m) => m.id === materialId);
  if (!material) throw new Error(`Нет материала ${materialId}`);
  const clean = name.trim();
  if (!clean) throw new Error("Укажите наименование детали");
  const id = `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const no = extraNo(u, kindOf(material));
  const extra: Part = { id, name: clean, materialId, plane: "xy", a: 0, b: 0, x: 0, y: 0, z: 0, seat: false, back: false };
  u.parts[id] = { no, partId: id, status: "none", rev: 0, extra, history: [{ at: Date.now(), status: "none", rev: 0, comment: "Добавлена деталь сверх модели" }] };
  await saveUnit(fleet, u);
  return { id, no };
}

/** Меняется только наименование: код, номера деталей и папка остаются прежними — на них держится прослеживаемость. */
export async function renameUnit(series: Series, unit: string, name: string) {
  const fleet = await loadFleet(series);
  const u = fleet.units.find((x) => x.code === unit);
  if (!u) throw new Error(`Нет экземпляра ${unit}`);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Название не может быть пустым");
  if (clean.length > 80) throw new Error("Название длиннее 80 символов");
  u.name = clean;
  await saveUnit(fleet, u);
  return u.name;
}

export async function setStock(series: Series, key: string, qty: number) {
  const stock = (await readJson<Stock>(stockFile(rootOf(series)))) ?? {};
  stock[key] = Math.max(0, qty);
  await writeJson(stockFile(rootOf(series)), stock);
  return stock;
}

/** Путь к чертежу детали; имя проверяется, чтобы нельзя было выйти из папки экземпляра. */
export async function drawingPath(series: Series, unit: string, file: string) {
  const fleet = await loadFleet(series);
  const u = fleet.units.find((x) => x.code === unit);
  if (!u || path.basename(file) !== file) return null;
  return path.join(fleet.root, u.folder, "drawings", file);
}
