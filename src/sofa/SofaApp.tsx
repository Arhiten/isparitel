"use client";

// Опытная серия (диван, шухлятка — series.ts): ярлык на каждый экземпляр, «Раскладка в заказ» и «Закуп».
// У экземпляра три листа: цветная модель, взрыв-схема и спецификация по виду материала с циклом чертежа детали.

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type V, calculate, solidsOf } from "./frame/calc";
import { onSheet, partsFile, sheetsFile } from "./frame/export";
import { type AppState, materialLabel, num, rub } from "./frame/model";
import { ACCEPTED_COLOR, type Fleet, KINDS, counted, factPart, kindOf, kindsIn, partFor, unitState, type Kind, NEEDS_COMMENT, NEXT, type PartRecord, STATUSES, type Status, type Unit, numbering, readyForOrder } from "./fleet";
import { type SeriesId, units } from "./series";

import { Cancelled, type Layout, computeLayout } from "./layout";
import KmSheet from "./KmSheet";
import { JIG_ROLES, type JigRole, evaporatorJig } from "./evaporatorJig";
import Labels from "./Labels";
import { bendSkins } from "./skins";
import { DEFAULT_RAILS, FIRST, checkRails, railLimits } from "./evaporator";
import type { Model } from "./SofaViewer";

const SofaViewer = dynamic(() => import("./SofaViewer"), { ssr: false, loading: () => <div className="viewer-stub">Загрузка модели…</div> });

type Tab = { kind: "home" } | { kind: "unit"; code: string } | { kind: "order" } | { kind: "purchase" };
type Sheet = "model" | "explode" | "cut" | "spec" | "labels" | "notes" | "mount" | "km" | "jig";

const date = (t: number) => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

async function api<T>(series: SeriesId, body: object): Promise<T> {
  const res = await fetch("/api/sofa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, series }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json as T;
}

async function upload(series: SeriesId, unit: string, partId: string, file: File, all: boolean, comment = "", deviation = "", correction = false) {
  const form = new FormData();
  form.set("series", series);
  form.set("unit", unit);
  form.set("partId", partId);
  form.set("all", all ? "1" : "0");
  form.set("comment", comment);
  form.set("deviation", deviation);
  form.set("correction", correction ? "1" : "0");
  form.set("file", file);
  const res = await fetch("/api/sofa/upload", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json as { touched: string[]; contour: string | null; warning: string | null };
}

/** Цвет детали на модели: принятая — серая, остальные — по виду материала. */
function colorsOf(base: AppState, unit: Unit) {
  const colors: Record<string, string> = {};
  for (const { part, kind } of numbering(base)) colors[part.id] = unit.parts[part.id]?.status === "accepted" ? ACCEPTED_COLOR : KINDS[kind].color;
  return colors;
}

const Badge = ({ status }: { status: Status }) => (
  <span className="badge" style={{ background: STATUSES[status].color }}>
    {STATUSES[status].title}
  </span>
);

export default function SofaApp({ series = "sofa" }: { series?: SeriesId }) {
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>({ kind: "home" });

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/sofa?series=${series}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setFleet(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [series]);
  useEffect(() => void reload(), [reload]);

  const run = useCallback(
    async (job: () => Promise<string | void>) => {
      setError(null);
      try {
        const msg = await job();
        if (msg) setNotice(msg);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [reload],
  );

  if (!fleet) return <p className="muted">{error ?? "Открываю серию…"}</p>;
  const unit = tab.kind === "unit" ? fleet.units.find((u) => u.code === tab.code) : undefined;
  const ready = readyForOrder(fleet).length;

  return (
    <>
      <nav className="sofa-tabs">
        <button className={`sofa-tab ${tab.kind === "home" ? "active" : ""}`} onClick={() => setTab({ kind: "home" })}>
          <b>Серия</b>
          <small>{units(fleet.series, fleet.units.length)}</small>
        </button>
        {fleet.units.map((u) => {
          const all = counted(u), done = all.filter((r) => r.status === "accepted").length;
          return (
            <button key={u.code} className={`sofa-tab ${unit?.code === u.code ? "active" : ""}`} onClick={() => setTab({ kind: "unit", code: u.code })} title={`${u.name}\n${fleet.root}\\${u.folder}`}>
              <b>{u.code}</b>
              <small>
                {done}/{all.length}
              </small>
            </button>
          );
        })}
        <span className="sofa-tabs-gap" />
        <button className={`sofa-tab ${tab.kind === "order" ? "active" : ""}`} onClick={() => setTab({ kind: "order" })}>
          <b>Раскладка в заказ</b>
          <small>{ready} дет.</small>
        </button>
        <button className={`sofa-tab ${tab.kind === "purchase" ? "active" : ""}`} onClick={() => setTab({ kind: "purchase" })}>
          <b>Закуп</b>
        </button>
      </nav>
      {error && (
        <div className="err-box" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {notice && (
        <div className="ok-box" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {tab.kind === "home" && <HomeView fleet={fleet} run={run} open={(code) => setTab({ kind: "unit", code })} />}
      {unit && <UnitView key={unit.code} fleet={fleet} unit={unit} run={run} />}
      {tab.kind === "order" && <OrderView fleet={fleet} run={run} />}
      {tab.kind === "purchase" && <PurchaseView fleet={fleet} run={run} />}
    </>
  );
}

type Run = (job: () => Promise<string | void>) => Promise<void>;

const renameJob = (fleet: Fleet, u: Unit, name: string) => async () => `${u.code}: название «${(await api<{ name: string }>(fleet.series.id, { action: "rename", unit: u.code, name })).name}» сохранено`;

/** Название экземпляра в шапке: «✎» открывает правку, Enter — сохранить, Esc — отменить. */
function NameEditor({ fleet, unit, run }: { fleet: Fleet; unit: Unit; run: Run }) {
  const [value, setValue] = useState<string | null>(null);
  if (value === null)
    return (
      <>
        {unit.name}
        <button className="btn small ghost rename" onClick={() => setValue(unit.name)} title="Изменить название" aria-label="Изменить название">
          ✎
        </button>
      </>
    );
  const save = () => {
    setValue(null);
    if (value.trim() && value.trim() !== unit.name) run(renameJob(fleet, unit, value));
  };
  return (
    <span className="rename-edit">
      <input
        className="name-input"
        autoFocus
        value={value}
        maxLength={80}
        aria-label={`Название ${unit.code}`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setValue(null);
        }}
      />
      <button className="btn small primary" onClick={save} disabled={!value.trim()}>
        Сохранить
      </button>
      <button className="btn small" onClick={() => setValue(null)}>
        Отмена
      </button>
    </span>
  );
}

// --- Серия: стартовая вкладка — список экземпляров, наименования и ход работ ---

function HomeView({ fleet, run, open }: { fleet: Fleet; run: Run; open: (code: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = (u: Unit) => {
    const v = draft[u.code];
    setDraft(({ [u.code]: _, ...rest }) => rest);
    if (v === undefined || v.trim() === u.name) return;
    run(renameJob(fleet, u, v));
  };
  const order: Status[] = ["accepted", "production", "fix", "loaded", "none"];

  return (
    <section className="panel">
      <h1 className="unit-title">Серия · {fleet.series.name}</h1>
      <p className="muted small">
        Название экземпляра можно менять в любой момент. Код ({fleet.series.code}-01…) — заводской номер экземпляра: он входит в номера деталей и имена чертежей и не меняется.
      </p>
      <div className="table-wrap">
        <table className="spec">
          <thead>
            <tr>
              <th>Код</th>
              <th>Название</th>
              <th>Ход работ</th>
              <th>Принято</th>
              <th>Рабочая папка</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fleet.units.map((u) => {
              const all = counted(u);
              const count = (s: Status) => Object.values(u.parts).filter((r) => r.status === s).length;
              return (
                <tr key={u.code}>
                  <td className="mono">
                    <b>{u.code}</b>
                  </td>
                  <td>
                    <input
                      className="name-input"
                      value={draft[u.code] ?? u.name}
                      maxLength={80}
                      aria-label={`Название ${u.code}`}
                      onChange={(e) => setDraft((d) => ({ ...d, [u.code]: e.target.value }))}
                      onBlur={() => save(u)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setDraft(({ [u.code]: _, ...rest }) => rest);
                      }}
                    />
                  </td>
                  <td>
                    <div className="progress" title={order.map((s) => `${STATUSES[s].title}: ${count(s)}`).join("\n")}>
                      {order.map((s) => count(s) > 0 && <i key={s} style={{ width: `${(count(s) / all.length) * 100}%`, background: STATUSES[s].color }} />)}
                    </div>
                  </td>
                  <td className="mono">
                    {count("accepted")}/{all.length}
                  </td>
                  <td className="muted small">
                    {fleet.root}\{u.folder}
                  </td>
                  <td>
                    <button className="btn small" onClick={() => open(u.code)}>
                      Открыть →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        {order.map((s) => (
          <span key={s} className="legend-item">
            <i style={{ background: STATUSES[s].color }} />
            {STATUSES[s].title}
          </span>
        ))}
      </div>
      {fleet.series.id === "evaporator" && <RailsPanel fleet={fleet} run={run} />}
    </section>
  );
}

/** Шкаф испарителя: привязка двух 8П под установку — от левого края до оси левого и между осями; «Применить» пересобирает модель серии. */
function RailsPanel({ fleet, run }: { fleet: Fleet; run: Run }) {
  // Текущая привязка — по положению швеллеров в модели (ось = левая грань + половина полки).
  const at = (id: string) => fleet.base.parts.find((p) => p.id === id);
  const l = at("rail-l"), rr = at("rail-r"), half = (fleet.base.materials.find((m) => m.id === "ch8")?.thickness ?? 40) / 2;
  const current = l && rr ? { left: l.x + half, span: rr.x - l.x } : DEFAULT_RAILS;
  const [left, setLeft] = useState(String(current.left));
  const [span, setSpan] = useState(String(current.span));
  const lim = railLimits();
  const value = { left: parseFloat(left.replace(",", ".")), span: parseFloat(span.replace(",", ".")) };
  const err = checkRails(value);
  const changed = value.left !== current.left || value.span !== current.span;
  const apply = () =>
    run(async () => {
      const { rails } = await api<{ rails: { left: number; span: number } }>(fleet.series.id, { action: "rails", ...value });
      return `Швеллеры под установку: ось левого — ${rails.left} мм от левого края, между осями — ${rails.span} мм. Модель серии пересобрана.`;
    });
  return (
    <div className="rails-panel">
      <h2>Привязка швеллеров 8П под установку</h2>
      <p className="muted small">
        Два 8П в нижнем поясе между швеллерами 10П, испаритель встаёт на них. Размеры — по осям швеллеров, от левого края шкафа по обшивке. Допустимо: ось левого от {lim.min}, ось правого до {lim.max}, между осями от {lim.minSpan} мм.
      </p>
      <div className="rails-fields">
        <label>
          От левого края до оси левого 8П, мм
          <input className="name-input" inputMode="decimal" value={left} onChange={(e) => setLeft(e.target.value)} />
        </label>
        <label>
          Между осями двух 8П, мм
          <input className="name-input" inputMode="decimal" value={span} onChange={(e) => setSpan(e.target.value)} />
        </label>
        <button className="btn primary" onClick={apply} disabled={!!err || !changed}>
          Применить привязку
        </button>
      </div>
      <p className={err ? "warn-note" : "muted small"}>
        {err ?? `Ось правого 8П — ${value.left + value.span} мм от левого края; центр между осями — ${value.left + value.span / 2} мм (середина шкафа — ${FIRST.W / 2}).`}
      </p>
    </div>
  );
}

// --- Экземпляр: модель, взрыв-схема, спецификация ---

/** Детали в сборе (мгновенно, без раскладки): полный расчёт — по требованию во вкладках «Раскладка» и «Закуп». */
function modelOf(state: AppState): Model {
  const solids = solidsOf(state);
  const size = [0, 1, 2].map((k) => Math.max(...solids.map((s) => s.max[k])) - Math.min(...solids.map((s) => s.min[k]))) as V;
  return { solids, size };
}

function UnitView({ fleet, unit, run }: { fleet: Fleet; unit: Unit; run: Run }) {
  // Модель именно этого экземпляра: детали с загруженным фактическим контуром рисуются по факту.
  // Гнутая обшивка подлокотников показывается согнутой по рёбрам (раскрой — по плоской развёртке).
  const model = useMemo(() => modelOf(bendSkins(unitState(fleet.base, unit))), [fleet.base, unit]);
  const [sheet, setSheet] = useState<Sheet>("model");
  const [kind, setKind] = useState<Kind>(() => kindsIn(fleet)[0] ?? "plywood");
  const [picked, setPicked] = useState<string | null>(null);
  const [explode, setExplode] = useState(0.6);
  const colors = useMemo(() => colorsOf(fleet.base, unit), [fleet.base, unit]);
  const rows = useMemo(() => numbering(fleet.base), [fleet.base]);
  // Счёт по видам — по деталям экземпляра: без неизготавливаемых, с деталями сверх модели.
  const kinds = kindsIn(fleet).map((k) => {
    const own = counted(unit).filter((r) => {
      const p = partFor(fleet.base, r);
      const m = p && fleet.base.materials.find((x) => x.id === p.materialId);
      return m && kindOf(m) === k;
    });
    return { k, total: own.length, accepted: own.filter((r) => r.status === "accepted").length };
  });

  const openSpec = (partId: string) => {
    const r = rows.find((x) => x.part.id === partId);
    if (!r) return;
    setPicked(partId);
    setKind(r.kind);
    setSheet("spec");
  };

  return (
    <section className="panel">
      <div className="unit-head">
        <div>
          <h1 className="unit-title">
            {unit.code} · <NameEditor fleet={fleet} unit={unit} run={run} />
          </h1>
          <div className="muted small">
            Рабочая папка: {fleet.root}\{unit.folder}
          </div>
        </div>
        <div className="legend">
          {kinds.map(({ k, total, accepted }) => (
            <button key={k} className="legend-item" onClick={() => (setKind(k), setSheet("spec"))} title="Открыть деталировку">
              <i style={{ background: KINDS[k].color }} />
              {KINDS[k].title} · {accepted}/{total}
            </button>
          ))}
          <span className="legend-item">
            <i style={{ background: ACCEPTED_COLOR }} />
            Принята
          </span>
        </div>
      </div>
      <div className="sheet-tabs">
        {(
          [
            ["model", "Лист 1 · Модель"],
            ["explode", "Лист 2 · Взрыв-схема"],
            ["cut", "Лист 3 · Раскрой и спецификация"],
            ["spec", "Спецификация"],
            ["labels", "Наклейки"],
            // В счётчике — только нестыковки (замечания без вида); узлы и справка — на том же листе ниже.
            ...(fleet.base.notes.some((n) => n.kind !== "mount") ? ([["notes", `Нестыковки · ${fleet.base.notes.filter((n) => !n.kind).length}`]] as const) : []),
            ...(fleet.base.notes.some((n) => n.kind === "mount") ? ([["mount", "Учесть при монтажных работах"]] as const) : []),
            // Чертежи марки КМ — пока только у шкафа испарителя (узлы из его параметрической модели).
            ...(fleet.series.id === "evaporator" ? ([["km", "Чертежи КМ"], ["jig", "Кондуктор"]] as const) : []),
          ] as const
        ).map(([s, title]) => (
          <button key={s} className={sheet === s ? "active" : ""} onClick={() => setSheet(s)}>
            {title}
          </button>
        ))}
      </div>
      {sheet === "model" && <SofaViewer calc={model} colors={colors} />}
      {sheet === "explode" && (
        <>
          <div className="explode-bar">
            <label>
              Разлёт
              <input type="range" min={0.2} max={1.5} step={0.05} value={explode} onChange={(e) => setExplode(+e.target.value)} />
            </label>
            <span className="muted small">Щёлкните по детали — откроется деталировка её материала.</span>
          </div>
          <SofaViewer calc={model} colors={colors} explode={explode} onPick={openSpec} picked={picked} />
        </>
      )}
      {sheet === "cut" && <CutView fleet={fleet} unit={unit} />}
      {sheet === "labels" && <Labels fleet={fleet} unit={unit} />}
      {sheet === "spec" && <SpecView fleet={fleet} unit={unit} kind={kind} setKind={setKind} picked={picked} setPicked={setPicked} run={run} />}
      {sheet === "notes" && <NotesView fleet={fleet} model={model} colors={colors} />}
      {sheet === "mount" && <NotesView fleet={fleet} model={model} colors={colors} mount />}
      {sheet === "km" && <KmSheet code={fleet.series.code} title={fleet.series.name} />}
      {sheet === "jig" && <JigView fleet={fleet} />}
    </section>
  );
}

/**
 * Лист «Нестыковки»: замечания модели серии. Без вида — нестыковки (вопрос открыт, геометрия не согласована),
 * «risk» — уязвимые узлы и вопросы к узлам. Щелчок по замечанию — его точки красными метками на модели.
 */
/**
 * Шкаф испарителя: объёмная схема сварочного кондуктора — каркас (основание, косынки, стойки, верхний пояс) в кондукторе.
 * Детали кондуктора окрашены по роли (легенда), каркас — голубым; ниже — порядок работы в кондукторе.
 */
function JigView({ fleet }: { fleet: Fleet }) {
  const { model, colors, counts } = useMemo(() => {
    const jig = evaporatorJig(fleet.base);
    const frame = fleet.base.parts.filter((p) => /^(ch10|ch8|tube60|s8|s3)$/.test(p.materialId));
    const state: AppState = { ...fleet.base, parts: [...frame, ...jig.parts], materials: [...fleet.base.materials, ...jig.materials] };
    const colors: Record<string, string> = {};
    for (const p of frame) colors[p.id] = "#74c0fc";
    const counts: Partial<Record<JigRole, number>> = {};
    for (const p of jig.parts) {
      colors[p.id] = JIG_ROLES[jig.role[p.id]].color;
      counts[jig.role[p.id]] = (counts[jig.role[p.id]] ?? 0) + 1;
    }
    return { model: modelOf(state), colors, counts };
  }, [fleet.base]);
  const steps = [
    "Стол выставить в горизонт (≤ 1 мм на диагональ); подкладки 20 под 8П — по уровню.",
    "Уложить 10П полками наружу до упоров торцов и граней, прижать; затем 8П на подкладки до упоров граней — верх всех швеллеров на 100.",
    "Проверить диагонали основания (разность ≤ 3 мм), прихватить, сварить швы 8П к 10П; уложить косынки-опоры и опорные полосы, приварить.",
    "Стойки — на основание; штифты кронштейнов колонн — в нижний и верхний ряд отверстий: стойка встаёт по отверстиям, вертикаль — по колонне.",
    "Обварить стойки по контуру крест-накрест; косынки у основания стоек; верхний пояс — на торцы стоек, прихватить, проверить диагонали верха, обварить.",
    "Вынуть штифты, снять прижимы, каркас — краном с кондуктора; контроль геометрии вне кондуктора.",
  ];
  return (
    <div className="notes-sheet">
      <SofaViewer calc={model} colors={colors} height={560} />
      <div className="legend" style={{ marginTop: 10 }}>
        <span className="legend-item">
          <i style={{ background: "#74c0fc" }} />
          Каркас шкафа
        </span>
        {(Object.keys(JIG_ROLES) as JigRole[]).map((r) => (
          <span key={r} className="legend-item" title={JIG_ROLES[r].note}>
            <i style={{ background: JIG_ROLES[r].color }} />
            {JIG_ROLES[r].title} · {counts[r] ?? 0}
          </span>
        ))}
      </div>
      <h2 className="notes-head">Порядок работы в кондукторе</h2>
      <ol className="muted small">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="muted small">Схема объёмная, не рабочие чертежи кондуктора: размеры стола, упоров и колонн — по месту, базы — от модели шкафа.</p>
    </div>
  );
}

/** mount — лист «Учесть при монтажных работах»: только замечания kind "mount", все раскрыты. */
function NotesView({ fleet, model, colors, mount = false }: { fleet: Fleet; model: Model; colors: Record<string, string>; mount?: boolean }) {
  const notes = fleet.base.notes;
  const [open, setOpen] = useState<string | null>(notes.find((n) => (mount ? n.kind === "mount" : !n.kind) && n.points.length)?.id ?? null);
  const groups = mount
    ? [{ title: "Учесть при монтажных работах", list: notes.filter((n) => n.kind === "mount") }]
    : [
        { title: "Нестыковки — вопрос открыт", list: notes.filter((n) => !n.kind) },
        { title: "Узлы и вопросы к ним", list: notes.filter((n) => n.kind === "risk") },
        { title: "Справка по модели", list: notes.filter((n) => n.kind === "info") },
      ];
  const markers = useMemo(() => notes.find((n) => n.id === open)?.points ?? [], [notes, open]);
  return (
    <div className="notes-sheet">
      <SofaViewer calc={model} colors={colors} markers={markers} height={420} />
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <div key={g.title}>
              <h2 className="notes-head">{g.title}</h2>
              <ul className="notes-list">
                {g.list.map((n) => (
                  <li key={n.id} className={n.id === open ? "active" : ""}>
                    <button className="note-title" onClick={() => setOpen(n.id === open ? null : n.id)} title={n.points.length ? "Показать на модели" : undefined}>
                      {n.points.length > 0 && <i className="note-dot" />}
                      {n.title}
                    </button>
                    {(mount || n.id === open) && <p className="muted small">{n.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
    </div>
  );
}

function SpecView({ fleet, unit, kind, setKind, picked, setPicked, run }: { fleet: Fleet; unit: Unit; kind: Kind; setKind: (k: Kind) => void; picked: string | null; setPicked: (id: string | null) => void; run: Run }) {
  // В серии из одного экземпляра «во все» не нужно: чертёж — только в него.
  const [all, setAll] = useState(fleet.units.length > 1);
  const [open, setOpen] = useState<string | null>(null);
  // Детали модели и, в конце, детали сверх модели этого экземпляра.
  const rows = useMemo(() => {
    const extras = Object.values(unit.parts).flatMap((r) => {
      const m = r.extra && fleet.base.materials.find((x) => x.id === r.extra!.materialId);
      return r.extra && m && kindOf(m) === kind ? [{ part: r.extra, material: m, kind, index: -1 }] : [];
    });
    return [...numbering(fleet.base).filter((r) => r.kind === kind), ...extras];
  }, [fleet.base, unit, kind]);
  const pickedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    pickedRow.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [picked, kind]);

  const scope = all ? `во всех ${fleet.units.length} ${fleet.series.noun.prepPl}` : `в ${unit.code}`;
  // Выбранный файл сначала попадает в форму: там отмечается, соответствует ли факт изготовления модели.
  // correction — уточнение чертежа факта у принятой детали: только этот экземпляр, деталь остаётся принятой.
  const [pending, setPending] = useState<{ partId: string; file: File; deviated: boolean; text: string; correction: boolean } | null>(null);
  const onFile = (r: PartRecord, file: File | undefined) =>
    file && setPending({ partId: r.partId, file, deviated: !!r.deviation, text: r.deviation?.text ?? "", correction: r.status === "accepted" });
  const send = () => {
    if (!pending) return;
    const { partId, file, deviated, text, correction } = pending;
    setPending(null);
    run(async () => {
      const res = await upload(fleet.series.id, unit.code, partId, file, all && !correction, "", deviated ? text : "", correction);
      const where = correction ? `в ${unit.code}` : scope;
      const geometry = res.contour ? ` Фактический контур на модели: ${res.contour}.` : /\.(dwg|dxf)$/i.test(file.name) ? " Контур в чертеже не распознан — модель рисует деталь по проекту." : "";
      if (res.warning) throw new Error(`Чертёж ${file.name} загружен (${res.touched.join(", ")}), но: ${res.warning}`);
      return `Чертёж ${file.name} загружен ${where}${deviated ? " с отметкой «отклонение от модели»" : ""}: ${res.touched.join(", ")}.${geometry}`;
    });
  };
  // Причина корректировки или неизготовления вводится в строке под деталью: окно prompt() во встроенном браузере не открывается.
  const [ask, setAsk] = useState<{ partId: string; status: Status; text: string } | null>(null);
  const setStatus = (r: PartRecord, status: Status, comment?: string) =>
    // Статус — всегда только этой детали этого экземпляра: принимается и бракуется конкретная физическая деталь.
    run(async () => `${STATUSES[status].title}: ${(await api<{ touched: string[] }>(fleet.series.id, { action: "status", unit: unit.code, partId: r.partId, status, comment })).touched.join(", ")}`);
  const move = (r: PartRecord, status: Status) => (NEEDS_COMMENT.includes(status) ? setAsk({ partId: r.partId, status, text: "" }) : setStatus(r, status));
  /** Чертёж-заготовка DXF по контуру модели — для деталей без чертежа; настоящий DWG загружается потом новой ревизией. */
  const draft = () =>
    run(async () => {
      const todo = rows.filter((r) => unit.parts[r.part.id]?.status === "none" && !unit.parts[r.part.id]?.extra);
      if (!todo.length) return "У всех деталей уже есть чертёж";
      for (const r of todo) {
        // Подпись на чертеже — номер детали (в DXF с all=1 он от того экземпляра, где нажали; номер в имени файла у каждого свой).
        const c = calculate({ ...fleet.base, parts: [r.part] }), no = unit.parts[r.part.id].no;
        for (const row of c.rows) row.code = no;
        await upload(fleet.series.id, unit.code, r.part.id, new File([partsFile(c)], `${no}.dxf`), all, "Заготовка DXF из модели");
      }
      return `DXF из модели: ${todo.length} дет. ${scope}`;
    });

  return (
    <>
      <div className="spec-bar">
        <div className="seg">
          {kindsIn(fleet).map((k) => (
            <button key={k} className={k === kind ? "active" : ""} onClick={() => setKind(k)}>
              <i style={{ background: KINDS[k].color }} />
              {KINDS[k].title}
            </button>
          ))}
        </div>
        {fleet.units.length > 1 && (
          <label className="check">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Чертёж — во все {units(fleet.series, fleet.units.length).replace(fleet.series.noun.few, fleet.series.noun.many)}
          </label>
        )}
        <button className="btn" onClick={draft}>
          DXF из модели для деталей без чертежа
        </button>
      </div>
      <div className="table-wrap">
        <table className="spec">
          <thead>
            <tr>
              <th>№ детали</th>
              <th>Наименование</th>
              <th>Материал</th>
              <th>Размер, мм</th>
              <th>Чертёж</th>
              <th>Статус</th>
              <th>Заказ</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ part, material }) => {
              const r = unit.parts[part.id];
              if (!r) return null;
              const isPicked = picked === part.id;
              return (
                <Fragment key={part.id}>
                  <tr ref={isPicked ? pickedRow : undefined} className={`${isPicked ? "picked" : ""} ${r.status === "accepted" || r.status === "skipped" ? "accepted" : ""}`} onClick={() => setPicked(part.id)}>
                    <td className="mono">{r.no}</td>
                    <td>
                      {part.name}
                      {r.extra && <div className="extra-tag">сверх модели</div>}
                    </td>
                    <td>{materialLabel(material)}</td>
                    <td className="mono">
                      {num(part.a, 1)} × {num(part.b, 1)} × {num(material.thickness, 1)}
                      {r.asBuilt && (
                        <div className="as-built" title={`Фактический контур из чертежа rev${r.asBuilt.rev}: окон ${r.asBuilt.shape.cutouts.length}, отверстий ${r.asBuilt.shape.drills.length}`}>
                          факт {num(r.asBuilt.a, 1)} × {num(r.asBuilt.b, 1)}
                        </div>
                      )}
                    </td>
                    <td>
                      {r.file ? (
                        <a href={`/api/sofa/drawing?series=${fleet.series.id}&unit=${encodeURIComponent(unit.code)}&file=${encodeURIComponent(r.file)}`}>
                          rev{r.rev} · {r.file.split(".").pop()?.toUpperCase()}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {r.deviation && (
                        <div className="deviation" title={`С rev${r.deviation.rev}, ${date(r.deviation.at)}: ${r.deviation.text}`}>
                          ⚠ Отклонение от модели: {r.deviation.text}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td className="mono">{r.order ?? ""}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {r.status !== "production" && r.status !== "skipped" && (
                        <label className="btn small" title={r.status === "accepted" ? "Деталь уже сделана: загрузите точный чертёж того, как она изготовлена. Статус не меняется." : undefined}>
                          {r.status === "accepted" ? "Уточнить чертёж факта" : r.rev ? "Новая ревизия" : "Загрузить DWG"}
                          <input
                            type="file"
                            accept=".dwg,.dxf,.pdf"
                            hidden
                            onChange={(e) => {
                              onFile(r, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      {NEXT[r.status].map((s) => (
                        <button key={s} className="btn small" style={{ borderColor: STATUSES[s].color }} onClick={() => move(r, s)}>
                          {s === "fix" && r.status === "accepted" ? "Отменить приёмку" : s === "none" && r.status === "skipped" ? "Вернуть в изготовление" : STATUSES[s].title}
                        </button>
                      ))}
                      <button className="btn small ghost" onClick={() => setOpen(open === part.id ? null : part.id)}>
                        История ({r.history.length})
                      </button>
                    </td>
                  </tr>
                  {ask?.partId === part.id && (
                    <tr className="upload-form">
                      <td colSpan={8}>
                        <div className="upload-head">
                          {r.no}: {ask.status === "skipped" ? `почему деталь не изготавливается в ${unit.code}?` : r.status === "accepted" ? "почему отменяется приёмка?" : "что нужно исправить?"}
                        </div>
                        <textarea
                          className="dev-text"
                          autoFocus
                          maxLength={500}
                          rows={2}
                          value={ask.text}
                          onChange={(e) => setAsk({ ...ask, text: e.target.value })}
                          onKeyDown={(e) => e.key === "Escape" && setAsk(null)}
                        />
                        <div className="upload-actions">
                          <button
                            className="btn small primary"
                            disabled={!ask.text.trim()}
                            onClick={() => {
                              setAsk(null);
                              setStatus(r, ask.status, ask.text.trim());
                            }}
                          >
                            {STATUSES[ask.status].title}
                          </button>
                          <button className="btn small" onClick={() => setAsk(null)}>
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {pending?.partId === part.id && (
                    <tr className="upload-form">
                      <td colSpan={8}>
                        <div className="upload-head">
                          {r.no}: {pending.correction ? "уточнённый чертёж факта" : "новая ревизия"} rev{r.rev + 1} — <b>{pending.file.name}</b> ({pending.correction ? `только ${unit.code}, деталь остаётся принятой` : scope})
                        </div>
                        <label className="check">
                          <input type="radio" name={`dev-${part.id}`} checked={!pending.deviated} onChange={() => setPending({ ...pending, deviated: false })} />
                          Соответствует модели
                        </label>
                        <label className="check">
                          <input type="radio" name={`dev-${part.id}`} checked={pending.deviated} onChange={() => setPending({ ...pending, deviated: true })} />
                          Отклонение от модели
                        </label>
                        {pending.deviated && (
                          <textarea
                            className="dev-text"
                            autoFocus
                            maxLength={500}
                            rows={2}
                            placeholder="Что изменено относительно модели и почему: размер, вырез, материал, крепёж…"
                            value={pending.text}
                            onChange={(e) => setPending({ ...pending, text: e.target.value })}
                          />
                        )}
                        <div className="upload-actions">
                          <button className="btn small primary" onClick={send} disabled={pending.deviated && !pending.text.trim()}>
                            Загрузить
                          </button>
                          <button className="btn small" onClick={() => setPending(null)}>
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {open === part.id && (
                    <tr className="history">
                      <td colSpan={8}>
                        {r.history.length ? (
                          <ol>
                            {r.history.map((h, i) => (
                              <li key={i}>
                                {date(h.at)} · <Badge status={h.status} /> · rev{h.rev}
                                {h.order ? ` · ${h.order}` : ""}
                                {h.comment ? ` · ${h.comment}` : ""}
                                {h.deviation && <span className="deviation"> · ⚠ Отклонение: {h.deviation}</span>}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span className="muted">Событий ещё нет</span>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --- Раскрой и спецификация экземпляра: все его детали (по факту, где чертёж загружен) на листах ---

/** Раскрой считается в потоке; результат хранится на сеанс, пока у экземпляра не поменялись детали и ревизии. */
const cutCache = new Map<string, Layout>();

/** Наименование позиции: у одинаковых деталей разных ящиков номер ящика убирается («Дно ящика 1» … «4» → «Дно ящика»). */
function rowName(names: string[]) {
  const unique = [...new Set(names)];
  if (unique.length === 1) return unique[0];
  const common = [...new Set(names.map((n) => n.replace(/\s\d+(?=\s|$)/g, "").trim()))];
  return common.length === 1 ? common[0] : unique.join(", ");
}

function CutView({ fleet, unit }: { fleet: Fleet; unit: Unit }) {
  const records = useMemo(() => counted(unit).filter((r) => (factPart(fleet.base, r)?.a ?? 0) > 0), [fleet.base, unit]);
  // На листе подпись — номер детали без кода экземпляра (П-007): он короче и однозначен внутри экземпляра.
  const short = (no: string) => no.slice(unit.code.length + 1);
  const key = `${fleet.series.id}|${unit.code}|${baseKey(fleet)}|${records.map((r) => `${r.no}:${r.rev}`).join(",")}`;
  const [calc, setCalc] = useState<Layout | null>(cutCache.get(key) ?? null);
  const job = useLayoutJob();
  const start = () =>
    job.start({ ...fleet.base, parts: records.map((r) => ({ ...factPart(fleet.base, r)!, id: short(r.no) })) }, (c) => {
      // Позиция — группа одинаковых деталей (материал, размер, контур): номер по порядку и общее наименование.
      c.rows.forEach((row, i) => {
        const own = c.solids.filter((s) => s.code === row.code);
        row.code = String(i + 1);
        row.name = rowName(own.map((s) => s.part.name));
        for (const s of own) s.code = row.code;
      });
      cutCache.set(key, c);
      setCalc(c);
    });
  useEffect(() => {
    if (!calc) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!calc)
    return (
      <div className="spec-bar">
        {job.busy ? <JobProgress started={job.busy} onCancel={job.cancel} /> : <span className="muted">{job.note ?? "Раскрой не рассчитан."}</span>}
        {!job.busy && (
          <button className="btn" onClick={start}>
            Рассчитать раскрой
          </button>
        )}
      </div>
    );

  const byNo = new Map(records.map((r) => [short(r.no), r]));
  const sheetArea = (n: Layout["nests"][number]) => n.sheets.length * n.W * n.H;
  const totalWeight = calc.solids.reduce((s, x) => s + x.weight, 0);
  return (
    <>
      <div className="spec-bar">
        <span className="muted small">
          Раскрой {unit.code} по фактическим контурам загруженных чертежей (без чертежа — по модели). Поле листа {fleet.base.settings.margin} мм, между деталями {fleet.base.settings.gap} мм.
        </span>
        <DxfButtons calc={{ ...calc, solids: calc.solids.map((s) => ({ ...s, code: s.part.id })) }} name={`${unit.code} раскрой`} />
      </div>
      <div className="table-wrap">
        <table className="spec">
          <thead>
            <tr>
              <th>Материал</th>
              <th>Листов</th>
              <th>Лист, мм</th>
              <th>Деталей</th>
              <th>Площадь деталей, м²</th>
              <th>Использование листа</th>
              <th>Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {calc.nests.map((n) => {
              const own = calc.solids.filter((s) => s.material.id === n.material.id), net = own.reduce((s, x) => s + x.area, 0);
              return (
                <tr key={n.material.id}>
                  <td>{materialLabel(n.material)}</td>
                  <td className="mono">{n.sheets.length}</td>
                  <td className="mono">
                    {num(n.W)} × {num(n.H)}
                  </td>
                  <td className="mono">
                    {own.length}
                    {!!n.unplaced.length && <span className="err"> · не помещаются: {n.unplaced.map((s) => s.part.id).join(", ")}</span>}
                  </td>
                  <td className="mono">{num(net / 1e6, 3)}</td>
                  <td className="mono">{num((net / sheetArea(n)) * 100, 1)} %</td>
                  <td className="mono">{rub(n.cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <LayoutView calc={calc} />
      <h2 style={{ marginTop: 24 }}>Спецификация раскроя</h2>
      <div className="table-wrap">
        <table className="spec">
          <thead>
            <tr>
              <th>Поз.</th>
              <th>Наименование</th>
              <th>Детали</th>
              <th>Кол-во</th>
              <th>Размер, мм</th>
              <th>Материал</th>
              <th>Окна / выборки</th>
              <th>Площадь 1 шт, м²</th>
              <th>Масса, кг</th>
              <th>Контур</th>
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((row) => {
              const own = calc.solids.filter((s) => s.code === row.code), recs = own.map((s) => byNo.get(s.part.id)!);
              const fact = recs.filter((r) => r.asBuilt).length;
              return (
                <tr key={row.code}>
                  <td className="mono">
                    <b>{row.code}</b>
                  </td>
                  <td>{row.name}</td>
                  <td className="mono small">{own.map((s) => s.part.id).join(", ")}</td>
                  <td className="mono">{row.qty}</td>
                  <td className="mono">
                    {num(row.a, 1)} × {num(row.b, 1)} × {num(row.material.thickness, 1)}
                  </td>
                  <td>{materialLabel(row.material)}</td>
                  <td className="mono">
                    {row.shape.cutouts.length} / {row.shape.pockets.length}
                  </td>
                  <td className="mono">{num(own[0].area / 1e6, 4)}</td>
                  <td className="mono">{num(own.reduce((s, x) => s + x.weight, 0), 2)}</td>
                  <td className="small">{fact === recs.length ? `по чертежу (rev${[...new Set(recs.map((r) => r.rev))].join(", rev")})` : fact ? `по чертежу ${fact} из ${recs.length}` : "по модели"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Итого</td>
              <td className="mono">
                <b>{calc.solids.length}</b>
              </td>
              <td colSpan={4} />
              <td className="mono">
                <b>{num(totalWeight, 2)}</b>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// --- Раскладка в заказ: детали с загруженным чертежом из всех экземпляров ---

function OrderView({ fleet, run }: { fleet: Fleet; run: Run }) {
  const ready = useMemo(() => readyForOrder(fleet), [fleet]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<Layout | null>(null);
  const job = useLayoutJob();
  const chosen = ready.filter(({ record }) => !off.has(record.no));

  // Раскладка считается по состоянию из выбранных деталей; id детали — её номер, он же подпись на листе.
  const layoutState = (): AppState => ({ ...fleet.base, parts: chosen.map(({ record }) => ({ ...factPart(fleet.base, record)!, id: record.no, name: record.no })) });
  const compute = () =>
    job.start(layoutState(), (c) => {
      for (const s of c.solids) s.code = s.part.id;
      setLayout(c);
    });
  // Состав заказа изменился — старая раскладка и идущий расчёт больше не годятся.
  useEffect(() => {
    job.cancel();
    setLayout(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, off]);

  // Заказ оформляется только по рассчитанной и показанной раскладке — в папку заказа уходит ровно то, что видно на экране.
  const place = (c: Layout) =>
    run(async () => {
      const { order } = await api<{ order: { no: string; parts: string[] } }>(fleet.series.id, {
        action: "order",
        items: chosen.map(({ unit, record }) => ({ unit: unit.code, partId: record.partId })),
        layouts: [
          { name: "раскладка.dxf", text: sheetsFile(c) },
          { name: "детали.dxf", text: partsFile(c) },
        ],
      });
      return `Заказ ${order.no} оформлен: ${order.parts.length} дет. ушли в изготовление. Папка: ${fleet.root}\\Заказы\\${order.no}`;
    });

  const groups = new Map<string, typeof ready>();
  for (const it of ready) {
    const m = fleet.base.materials.find((x) => x.id === partFor(fleet.base, it.record)?.materialId);
    const key = m ? materialLabel(m) : "?";
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <section className="panel">
      <h1 className="unit-title">Раскладка в заказ</h1>
      <p className="muted small">Детали всех экземпляров серии с загруженным чертежом, ещё не отправленные в изготовление. Снимите галочку, чтобы не включать деталь в заказ.</p>
      {!ready.length && <p className="muted">Подготовленных деталей нет — загрузите чертежи в спецификации экземпляров.</p>}
      {!!ready.length && (
        <>
          <div className="spec-bar">
            {job.busy ? (
              <JobProgress started={job.busy} onCancel={job.cancel} />
            ) : (
              <button className="btn" onClick={compute} disabled={!chosen.length}>
                {layout ? "Пересчитать раскладку" : "Рассчитать раскладку"}
              </button>
            )}
            <button className="btn primary" onClick={() => layout && place(layout)} disabled={!!job.busy || !layout || !chosen.length} title={layout ? "" : "Сначала рассчитайте раскладку"}>
              Оформить заказ ({chosen.length} дет.)
            </button>
            {layout && !job.busy && <DxfButtons calc={layout} name={`${fleet.series.code} заказ`} />}
            {job.note && <span className="muted small">{job.note}</span>}
          </div>
          {layout && <LayoutView calc={layout} />}
          {[...groups].map(([title, items]) => (
            <details key={title} open>
              <summary>
                {title} — {items.length} дет.
              </summary>
              <table className="spec">
                <tbody>
                  {items.map(({ unit, record }) => {
                    const p = factPart(fleet.base, record)!;
                    return (
                      <tr key={record.no}>
                        <td>
                          <input type="checkbox" checked={!off.has(record.no)} onChange={(e) => setOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(record.no); else n.add(record.no); return n; })} />
                        </td>
                        <td className="mono">{record.no}</td>
                        <td>{unit.code}</td>
                        <td>{p.name}</td>
                        <td className="mono">
                          {num(p.a, 1)} × {num(p.b, 1)}
                        </td>
                        <td>rev{record.rev}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          ))}
        </>
      )}
      <h2 style={{ marginTop: 24 }}>Заказы</h2>
      {fleet.orders.length ? (
        <table className="spec">
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Деталей</th>
              <th>Папка</th>
            </tr>
          </thead>
          <tbody>
            {[...fleet.orders].reverse().map((o) => (
              <tr key={o.no}>
                <td className="mono">{o.no}</td>
                <td>{date(o.at)}</td>
                <td>{o.parts.length}</td>
                <td className="muted small">
                  {fleet.root}\Заказы\{o.no}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Заказов ещё нет.</p>
      )}
    </section>
  );
}

/** Отдаёт текст файлом браузеру (без сервера): DXF раскладки, посчитанной на странице. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/dxf" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** «Скачать DXF»: листы раскладки (поле и зазор — из настроек модели) и контуры деталей отдельно. */
function DxfButtons({ calc, name }: { calc: Layout; name: string }) {
  return (
    <>
      <button className="btn" onClick={() => download(`${name} раскладка.dxf`, sheetsFile(calc))} title="Листы с разложенными деталями — для ЧПУ">
        Скачать DXF раскладки
      </button>
      <button className="btn" onClick={() => download(`${name} детали.dxf`, partsFile(calc))} title="Контуры деталей в ряд, с подписями">
        Скачать DXF деталей
      </button>
    </>
  );
}

/** Листы раскладки: контуры деталей с номерами. */
function LayoutView({ calc }: { calc: Layout }) {
  const byId = new Map(calc.solids.map((s) => [s.part.id, s]));
  return (
    <div className="layout">
      {calc.nests.map((n) => (
        <div key={n.material.id}>
          <h3>
            {materialLabel(n.material)} — {n.sheets.length} {n.material.bar ? "хлыст." : "лист."}, {rub(n.cost)}
            {!!n.unplaced.length && <span className="err"> · не помещаются: {n.unplaced.map((s) => s.part.id).join(", ")}</span>}
          </h3>
          <div className="sheets">
            {n.sheets.map((sheet, i) => (
              <svg key={i} viewBox={`0 0 ${n.W} ${n.H}`} className="sheet-svg" style={{ aspectRatio: `${n.W} / ${n.H}` }}>
                <g transform={`translate(0 ${n.H}) scale(1 -1)`}>
                  <rect width={n.W} height={n.H} className="stock" />
                  {sheet.map((p) => {
                    const s = byId.get(p.id)!;
                    const d = [s.shape.outer, ...s.shape.cutouts].map((c) => "M" + c.map((q) => onSheet(p, q).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z").join("");
                    return <path key={p.id} d={d} className="piece" fillRule="evenodd" />;
                  })}
                </g>
                {sheet.map((p) => (
                  <text key={p.id} x={p.x + p.w / 2} y={n.H - p.y - p.h / 2} className="piece-label" style={{ fontSize: Math.max(18, Math.min(60, Math.min(p.w, p.h) / 4)) }}>
                    {p.id}
                  </text>
                ))}
              </svg>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Расчёт раскладки в Web Worker: busy — время старта (для секундомера), note — чем закончился прошлый расчёт.
 * Уход со вкладки останавливает поток.
 */
function useLayoutJob() {
  const ref = useRef<ReturnType<typeof computeLayout> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cancel = useCallback(() => ref.current?.cancel(), []);
  useEffect(() => cancel, [cancel]);
  const start = (state: AppState, done: (c: Layout) => void) => {
    ref.current?.cancel();
    const job = computeLayout(state);
    ref.current = job;
    setBusy(Date.now());
    setNote(null);
    job.promise.then(
      (c) => ref.current === job && done(c),
      (e) => ref.current === job && setNote(e instanceof Cancelled ? "Расчёт отменён." : `Ошибка расчёта: ${e.message}`),
    ).finally(() => {
      if (ref.current !== job) return;
      ref.current = null;
      setBusy(null);
    });
  };
  return { busy, note, start, cancel };
}

/** «Считаю… 12 с» и кнопка «Отменить». */
function JobProgress({ started, onCancel }: { started: number; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <span className="muted small">Считаю раскладку… {Math.floor((now - started) / 1000)} с</span>
      <button className="btn" onClick={onCancel}>
        Отменить
      </button>
    </>
  );
}

// --- Закуп: потребность серии минус купленное ---

/** Полный расчёт одного экземпляра (с раскладкой по контурам) занимает секунды — считается один раз за сеанс на версию модели. */
let baseCalc: { key: string; calc: Layout } | null = null;
const baseKey = (f: Fleet) => `${f.series.id}|${f.base.savedAt ?? 0}|${f.base.parts.length}`;

function PurchaseView({ fleet, run }: { fleet: Fleet; run: Run }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [calc, setCalc] = useState<Layout | null>(baseCalc?.key === baseKey(fleet) ?baseCalc.calc : null);
  const job = useLayoutJob();
  const start = () =>
    job.start(fleet.base, (c) => {
      baseCalc = { key: baseKey(fleet), calc: c };
      setCalc(c);
    });
  useEffect(() => {
    if (!calc) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!calc)
    return (
      <section className="panel">
        <div className="spec-bar">
          {job.busy ? (
            <>
              <span className="muted">Считаю раскладку одного экземпляра для потребности серии…</span>
              <JobProgress started={job.busy} onCancel={job.cancel} />
            </>
          ) : (
            <>
              <span className="muted">{job.note ?? "Потребность не рассчитана."}</span>
              <button className="btn" onClick={start}>
                Рассчитать закуп
              </button>
            </>
          )}
        </div>
      </section>
    );
  // Где купить: ссылка позиции из модели (по наименованию строки закупа).
  const urlOf = new Map((fleet.base.items ?? []).filter((i) => i.url).map((i) => [i.name, i.url!]));
  const lines = calc.purchase.lines.map((l) => {
    // Листы, хлысты, рулоны и штуки покупаются целыми: потребность 0,16 рулона — к закупке 1 рулон.
    const whole = /^(лист|хлыст|рулон|шт)/.test(l.unit);
    const need = l.qty * fleet.units.length, have = fleet.stock[l.name] ?? 0, short = Math.max(0, need - have), buy = whole ? Math.ceil(short - 1e-9) : short;
    return { ...l, need, have, buy, sum: buy * l.price };
  });
  const save = (key: string) => {
    const v = draft[key];
    if (v === undefined) return;
    run(async () => void (await api(fleet.series.id, { action: "stock", key, qty: parseFloat(v.replace(",", ".")) || 0 })));
    setDraft(({ [key]: _, ...rest }) => rest);
  };
  return (
    <section className="panel">
      <h1 className="unit-title">Закуп материалов на серию: {units(fleet.series, fleet.units.length)}</h1>
      <p className="muted small">Потребность — по раскладке одного экземпляра × {fleet.units.length}. Общая раскладка заказов обычно даёт меньше листов: сверяйте с вкладкой «Раскладка в заказ».</p>
      <div className="spec-bar">
        <span className="muted small">
          Раскладка одного экземпляра: поле листа {fleet.base.settings.margin} мм, между деталями {fleet.base.settings.gap} мм
        </span>
        <DxfButtons calc={calc} name={`${fleet.series.name} 1 шт.`} />
      </div>
      <div className="table-wrap">
        <table className="spec">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Ед.</th>
              <th>На 1 шт.</th>
              <th>На серию</th>
              <th>Куплено</th>
              <th>К закупке</th>
              <th>Цена</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.name} className={l.buy ? "" : "accepted"}>
                <td>{urlOf.get(l.name) ? <a href={urlOf.get(l.name)} target="_blank" rel="noreferrer">{l.name}</a> : l.name}</td>
                <td>{l.unit}</td>
                <td className="mono">{num(l.qty, 2)}</td>
                <td className="mono">{num(l.need, 2)}</td>
                <td>
                  <input className="qty" value={draft[l.name] ?? String(l.have)} onChange={(e) => setDraft((d) => ({ ...d, [l.name]: e.target.value }))} onBlur={() => save(l.name)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                </td>
                <td className="mono">
                  <b>{num(l.buy, 2)}</b>
                </td>
                <td className="mono">{rub(l.price)}</td>
                <td className="mono">{rub(l.sum)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>Итого к закупке</td>
              <td className="mono">
                <b>{rub(lines.reduce((s, l) => s + l.sum, 0))}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {fleet.series.purchaseNote && <p className="warn-note">{fleet.series.purchaseNote}</p>}
    </section>
  );
}
