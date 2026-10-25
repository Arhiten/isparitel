"use client";

// Наклейки на детали экземпляра: печать на A4 по 10 штук 105 × 57 мм (стандартные листы самоклеек).
// Силуэт детали — как она видна со стороны наклейки: наклейка клеится на внутреннюю сторону (к центру своей группы —
// корпуса или ящика), обратная сторона — лицо. У стоящих деталей сверху стрелка «ВЕРХ», у лежащих снизу — «ПЕРЕД».

import { useMemo } from "react";
import { type Solid, type V, solidsOf } from "./frame/calc";
import { num } from "./frame/model";
import { type Fleet, type Unit, unitState } from "./fleet";
import { type LabelInfo, labelRules } from "./labelRules";

type Pt = [number, number];
const AX: Record<string, [number, number, number]> = { xy: [0, 1, 2], xz: [0, 2, 1], yz: [1, 2, 0] };
const GROUP_COLORS = ["#3d3d3d", "#1f6fb2", "#2e8b57", "#c0661c", "#7b4fa0", "#a8326e"];
const PER_SHEET = 10;

const sub = (p: V, q: V): V => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: V, q: V) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: V, q: V): V => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const mid = (s: Solid): V => [0, 1, 2].map((k) => (s.min[k] + s.max[k]) / 2) as V;

/** Проекция контуров детали на экран со стороны наклейки. center — центр группы (наклейка смотрит к нему). */
function silhouette(s: Solid, center: V) {
  const [ia, ib, it] = AX[s.part.plane];
  const n: V = [0, 0, 0];
  n[it] = Math.sign(center[it] - mid(s)[it]) || 1;
  const lying = s.part.plane === "xy";
  const up: V = lying ? [0, 1, 0] : [0, 0, 1];
  const right = cross(up, n);
  const world = (q: Pt): V => {
    const p: V = [0, 0, 0];
    p[ia] = s.min[ia] + (s.part.flip ? s.part.a - q[0] : q[0]);
    p[ib] = s.min[ib] + q[1];
    p[it] = s.min[it];
    return p;
  };
  const screen = (q: Pt): Pt => { const w = world(q); return [dot(w, right), -dot(w, up)]; };
  const ring = (r: Pt[]) => r.map(screen);
  return {
    lying,
    outer: ring(s.shape.outer),
    cutouts: s.shape.cutouts.map(ring),
    pockets: s.shape.pockets.map(ring),
    drills: s.shape.drills.map((h) => ({ c: screen([h.x, h.y]), r: h.d / 2 })),
  };
}

function Thumb({ s, center, color }: { s: Solid; center: V; color: string }) {
  const g = silhouette(s, center);
  const xs = g.outer.map((p) => p[0]), ys = g.outer.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0, pad = Math.max(w, h) * 0.04;
  const d = (r: Pt[]) => "M" + r.map((p) => `${(p[0] - x0).toFixed(1)},${(p[1] - y0).toFixed(1)}`).join("L") + "Z";
  const sw = Math.max(w, h) / 160;
  return (
    <svg className="lbl-thumb" viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} preserveAspectRatio="xMidYMid meet">
      <path d={[g.outer, ...g.cutouts].map(d).join("")} fillRule="evenodd" fill="#efe3cf" stroke={color} strokeWidth={sw * 1.6} />
      {g.pockets.map((r, i) => <path key={i} d={d(r)} fill="none" stroke="#b08a00" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />)}
      {g.drills.map((h, i) => <circle key={i} cx={h.c[0] - x0} cy={h.c[1] - y0} r={Math.max(h.r, sw * 2)} fill="#fff" stroke={color} strokeWidth={sw} />)}
    </svg>
  );
}

type Label = { s: Solid; no: string; info: LabelInfo; center: V };

export default function Labels({ fleet, unit }: { fleet: Fleet; unit: Unit }) {
  const rules = useMemo(() => labelRules(fleet.series.id, fleet.series.name), [fleet.series.id, fleet.series.name]);
  const { labels, size, groups } = useMemo(() => {
    const solids = solidsOf(unitState(fleet.base, unit));
    const recOf = new Map(Object.values(unit.parts).map((r) => [r.partId, r]));
    const items = solids.map((s) => ({ s, no: recOf.get(s.part.id)?.no ?? s.part.id, info: rules.info(s.part.id, s.part.name) }));
    // Центр группы: наклейка смотрит внутрь корпуса или своего ящика.
    const centers = new Map<string, V>();
    for (const g of new Set(items.map((i) => i.info.group))) {
      const own = items.filter((i) => i.info.group === g).map((i) => i.s);
      centers.set(g, [0, 1, 2].map((k) => (Math.min(...own.map((s) => s.min[k])) + Math.max(...own.map((s) => s.max[k]))) / 2) as V);
    }
    const labels: Label[] = items.map((i) => ({ ...i, center: centers.get(i.info.group)! }));
    labels.sort((p, q) => p.info.groupNo - q.info.groupNo || (p.info.step?.[0] ?? 99) - (q.info.step?.[0] ?? 99) || p.no.localeCompare(q.no));
    const size = [0, 1, 2].map((k) => Math.max(...solids.map((s) => s.max[k])) - Math.min(...solids.map((s) => s.min[k])));
    const groups = [...centers.keys()].map((g) => `${g || "Детали"} — ${items.filter((i) => i.info.group === g).length}`);
    return { labels, size, groups };
  }, [fleet.base, unit, rules]);

  const memo = (
    <div className="lbl lbl-memo" key="memo">
      <div className="lbl-head">
        <b>{rules.model}</b>
        <span>{unit.code}</span>
      </div>
      <div className="lbl-name">Набор для сборки · {labels.length} деталей</div>
      <div className="lbl-row">
        <span>
          Ш × Г × В: {num(size[0])} × {num(size[1])} × {num(size[2])} мм
        </span>
      </div>
      <div className="lbl-memo-groups">{groups.join(" · ")}</div>
      <ul>
        {rules.memo.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
  const cards = [
    memo,
    ...labels.map(({ s, no, info, center }) => {
      const color = GROUP_COLORS[info.groupNo % GROUP_COLORS.length];
      const lying = s.part.plane === "xy";
      return (
        <div className="lbl" key={s.part.id} style={{ ["--g" as string]: color }}>
          <div className="lbl-head">
            <b>{rules.model}</b>
            <span>{no}</span>
          </div>
          <div className="lbl-name">{s.part.name}</div>
          <div className="lbl-row">
            {info.group && (
              <span className="lbl-group">
                {info.group}
                {info.step ? ` · шаг ${info.step[0]} из ${info.step[1]}` : ""}
              </span>
            )}
            <span>
              {num(s.part.a, 1)} × {num(s.part.b, 1)} × {num(s.t, 1)} мм
            </span>
          </div>
          <div className="lbl-body">
            <div className="lbl-pic">
              {!lying && <div className="lbl-arrow">▲ ВЕРХ</div>}
              <Thumb s={s} center={center} color={color} />
              {lying && <div className="lbl-arrow">▼ ПЕРЕД</div>}
            </div>
            <div className="lbl-text">
              {info.hint && <div>{info.hint}</div>}
              {info.pair && <div className="lbl-pair">Пара: {info.pair}</div>}
            </div>
          </div>
          <div className="lbl-foot">Наклейка — внутренняя сторона · лицо — обратная</div>
        </div>
      );
    }),
  ];
  const sheets: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += PER_SHEET) sheets.push(cards.slice(i, i + PER_SHEET));

  return (
    <>
      <div className="spec-bar">
        <span className="muted small">
          {labels.length + 1} наклеек ({sheets.length} {sheets.length === 1 ? "лист" : sheets.length < 5 ? "листа" : "листов"} A4, наклейки 105 × 57 мм по 10 на листе): первая — памятка, дальше — детали по группам и шагам сборки.
        </span>
        <button className="btn primary" onClick={() => window.print()}>
          Печать наклеек
        </button>
      </div>
      <div className="label-print">
        {sheets.map((sheet, i) => (
          <div className="label-sheet" key={i}>
            {sheet}
          </div>
        ))}
      </div>
    </>
  );
}
