"use client";

// Чертёж марки КМ: узел монтажа угловой кассеты шкафа испарителя — лист A3 (420 × 297), единицы листа — мм.
// Разрез 1-1 (М 1:1) — горизонтальный разрез угла: стойки, полосы-вставки, отгибы кассеты, крепёж в резьбовую заклёпку;
// вид А (М 1:10) — сверловка стойки с отметками от нижнего торца; спецификация, технические требования, штамп.
// Все размеры — из модели серии (cassetteNode), поэтому чертёж меняется вместе с ней.

import { useMemo, useRef, useState } from "react";
import { cassetteNode, evaporatorBase } from "./evaporator";
import { solidsOf, type Solid } from "./frame/calc";
import { frameMarks, type FrameMark } from "./evaporatorMarks";
import type { Pt } from "./frame/model";

const FONT = "ISOCPEUR, 'GOST type B', Arial, sans-serif";
const THICK = 0.5, THIN = 0.25;
/** Высота шрифта, мм: все надписи — прописные 3, наименования (виды, таблицы, штамп) — 4 жирным. */
const TXT = 3, HEAD = 4;
/** Перенос строки по ширине колонки: примерно 0,62 высоты на прописную букву. */
const wrap = (text: string, width: number, size = TXT) => {
  const max = Math.max(8, Math.floor(width / (size * 0.62)));
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
};
/** Пакет крепления (выносной элемент Б), мм: бортик заклёпки = лента под полосой, лента полоса/отгиб, шайба EPDM, головка и длина винта, тело заклёпки. */
/** cut — зазор между двумя полосами ленты (у кромок отгиба 12 мм, ось заклёпки посередине). */
const STACK = { head: 1.5, headD: 13, tape1: 1.5, cut: 16, tape2: 1, washer: 2, washerD: 12, k: 3.3, dk: 10.5, screw: 25, body: 17, bulge: [3, 6], thread: [9, 17], stripHole: 6.6, flangeHole: 10 };

/** Число в размере: без лишних нулей, дробь через запятую. */
const fmt = (n: number) => String(+n.toFixed(1)).replace(".", ",");

const dim = (a: [number, number], b: [number, number], off: [number, number], text: string, rotate = false) => {
    const A: [number, number] = [a[0] + off[0], a[1] + off[1]], B: [number, number] = [b[0] + off[0], b[1] + off[1]];
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const tick = (p: [number, number]) => <line x1={p[0] - 1.2} y1={p[1] + 1.2} x2={p[0] + 1.2} y2={p[1] - 1.2} stroke="#000" strokeWidth={THICK} />;
    return (
      <g>
        <line x1={a[0]} y1={a[1]} x2={A[0] + Math.sign(off[0]) * 1.5} y2={A[1] + Math.sign(off[1]) * 1.5} stroke="#000" strokeWidth={THIN} />
        <line x1={b[0]} y1={b[1]} x2={B[0] + Math.sign(off[0]) * 1.5} y2={B[1] + Math.sign(off[1]) * 1.5} stroke="#000" strokeWidth={THIN} />
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#000" strokeWidth={THIN} />
        {tick(A)}
        {tick(B)}
        <text x={mx} y={my - 1} fontSize={TXT} textAnchor="middle" transform={rotate ? `rotate(-90 ${mx} ${my})` : undefined}>
          {text}
        </text>
      </g>
    );
  };
/** Позиция: выноска от точки к кружку с номером. */
const pos = (at: [number, number], to: [number, number], num: number) => (
    <g>
      <line x1={at[0]} y1={at[1]} x2={to[0]} y2={to[1]} stroke="#000" strokeWidth={THIN} />
      <circle cx={at[0]} cy={at[1]} r={0.6} fill="#000" />
      <circle cx={to[0]} cy={to[1]} r={3.5} fill="#fff" stroke="#000" strokeWidth={THIN} />
      <text x={to[0]} y={to[1] + 1.2} fontSize={TXT} textAnchor="middle">
        {num}
      </text>
    </g>
  );
type Dim = (a: [number, number], b: [number, number], off: [number, number], text: string, rotate?: boolean) => React.ReactElement;
type Pos = (at: [number, number], to: [number, number], num: number) => React.ReactElement;

/**
 * Выносной элемент Б (М 2,2:1): разрез по оси крепежа основной стойки. Ось вертикальна, стойка сверху, кассета снизу.
 * d — глубина от наружной грани стойки (в трубу — плюс), u — поперёк оси. Слои: стенка трубы, бортик заклёпки в вырезе ленты 1,5,
 * полоса на бортике, лента 1, отгиб кассеты, шайба EPDM, винт; тело заклёпки с зоной обжатия и резьбы.
 */
function DetailB({ hole, wall, strip, flange, dim, pos }: { hole: number; wall: number; strip: number; flange: number; dim: Dim; pos: Pos }) {
  const S = 2.2, U = 14, DMAX = 20, BX = 314, BY = 140;
  const Q = (u: number, d: number): [number, number] => [BX + (u + U) * S, BY + (DMAX - d) * S];
  /** Прямоугольник слоя: по ширине u0…u1, по глубине d0…d1. */
  const layer = (u0: number, u1: number, d0: number, d1: number, fill: string, key?: string | number) => {
    const [x, y] = Q(u0, Math.max(d0, d1));
    return <rect key={key} x={x} y={y} width={(u1 - u0) * S} height={Math.abs(d1 - d0) * S} fill={fill} stroke="#000" strokeWidth={THIN} />;
  };
  /** Слой с отверстием ⌀h по оси — две части. */
  const holed = (h: number, d0: number, d1: number, fill: string) => (
    <>
      {layer(-U, -h / 2, d0, d1, fill)}
      {layer(h / 2, U, d0, d1, fill)}
    </>
  );
  // Глубины слоёв от грани стойки наружу (к кассете — минус).
  const strip0 = -STACK.tape1, strip1 = strip0 - strip, tape2 = strip1 - STACK.tape2, flange1 = tape2 - flange, washer1 = flange1 - STACK.washer, head1 = washer1 - STACK.k;
  return (
    <g>
      <text x={BX} y={BY - 3} fontSize={HEAD} fontWeight="bold">
        Б (М 2,2:1)
      </text>
      {/* Стенка трубы (разрез, штриховка) и полость трубы. */}
      {holed(hole, 0, wall, "url(#hatch)")}
      {/* Ленты EPDM 1,5 — две полосы 12 у кромок отгиба, между ними зазор под бортик; бортик заклёпки ⌀13 × 1,5 — вровень с лентой. */}
      {holed(STACK.cut, 0, -STACK.tape1, "#c33")}
      {layer(-STACK.headD / 2, STACK.headD / 2, 0, -STACK.head, "#bbb")}
      {/* Полоса-вставка 4 (нержавейка) — на ленте и бортике; отверстие под винт 6,6 (овал вдоль полосы). */}
      {holed(STACK.stripHole, strip0, strip1, "url(#hatch2)")}
      {/* Лента EPDM 1 между полосой и отгибом. */}
      {holed(STACK.cut, strip1, tape2, "#c33")}
      {/* Отгиб кассеты 3 — отверстие (овал 7×10 поперёк, в разрезе — 10). */}
      {holed(STACK.flangeHole, tape2, flange1, "#000")}
      {/* Шайба EPDM и головка винта ISO 7380. */}
      {layer(-STACK.washerD / 2, STACK.washerD / 2, flange1, washer1, "#c33")}
      {layer(-STACK.dk / 2, STACK.dk / 2, washer1, head1, "#ddd")}
      {/* Тело заклёпки ⌀9 в стенке и в трубе; зона обжатия (юбка) и резьба. */}
      {layer(-hole / 2, hole / 2, 0, STACK.body, "#bbb")}
      {layer(-6, 6, STACK.bulge[0], STACK.bulge[1], "#bbb")}
      {/* Стержень винта ⌀6 — от головки до конца в резьбе. */}
      {layer(-3, 3, washer1, washer1 + STACK.screw, "#ddd")}
      {[-3, 3].map((u) => (
        <line key={u} x1={Q(u, STACK.thread[0])[0]} y1={Q(u, STACK.thread[0])[1]} x2={Q(u, STACK.thread[1])[0]} y2={Q(u, STACK.thread[1])[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="1 0.8" />
      ))}
      {/* Ось крепежа. */}
      <line x1={Q(0, head1 - 3)[0]} y1={Q(0, head1 - 3)[1]} x2={Q(0, STACK.body + 3)[0]} y2={Q(0, STACK.body + 3)[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="6 1.5 1 1.5" />
      {/* Цепочка толщин слева. */}
      {dim(Q(-U, wall), Q(-U, 0), [-5, 0], fmt(wall), true)}
      {dim(Q(-U, 0), Q(-U, strip0), [-11, 0], fmt(STACK.tape1), true)}
      {dim(Q(-U, strip0), Q(-U, strip1), [-5, 0], fmt(strip), true)}
      {dim(Q(-U, strip1), Q(-U, tape2), [-11, 0], fmt(STACK.tape2), true)}
      {dim(Q(-U, tape2), Q(-U, flange1), [-5, 0], fmt(flange), true)}
      {/* Длина винта и диаметры. */}
      {dim(Q(STACK.dk / 2, washer1), Q(STACK.dk / 2, washer1 + STACK.screw), [16, 0], "М6×" + STACK.screw, true)}
      {dim(Q(-hole / 2, STACK.body), Q(hole / 2, STACK.body), [0, -4], "⌀" + hole)}
      {dim(Q(-STACK.headD / 2, -STACK.head), Q(STACK.headD / 2, -STACK.head), [0, 0], "")}
      <text x={Q(STACK.headD / 2 + 1, -STACK.head)[0] + 9} y={Q(0, -STACK.head)[1] + 1} fontSize={TXT}>
        бортик ⌀{STACK.headD}×{fmt(STACK.head)} = лента
      </text>
      <text x={Q(-U, wall + 4)[0]} y={Q(-U, wall + 4)[1]} fontSize={TXT}>
        стойка (внутри трубы)
      </text>
      {/* Позиции. */}
      {pos(Q(-U + 2, strip0 - 2), Q(-U - 2, strip0 - 14), 2)}
      {pos(Q(4, STACK.bulge[1]), Q(U + 3, 14), 4)}
      {pos(Q(2, head1 + 1), Q(U + 3, head1 - 2), 5)}
      {pos(Q(-5, washer1 + 1), Q(-U - 2, washer1 - 6), 6)}
      {pos(Q(10, -0.8), Q(U + 4, 5), 7)}
      {pos(Q(10, tape2 - 1.5), Q(U + 4, tape2 - 6), 3)}
    </g>
  );
}

/** Листы комплекта КМ. */
const SHEETS = ["Монтаж угловой кассеты", "Узел нижнего пояса", "Узел верхнего пояса", "Швеллеры основания", "Привязка и заземление", "Строповка", "Схема каркаса", "Стойки и трубы пояса", "Листовые детали каркаса", "Общие данные"];

/** Штамп 185 × 55 в правом нижнем углу листа. */
function Stamp({ code, title, height, node, sheet, scale }: { code: string; title: string; height: number; node: string; sheet: number; scale: string }) {
  const line = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={THIN} />;
  const t = (x: number, y: number, text: string | number, head = false) => (
    <text x={x} y={y} fontSize={head ? HEAD : TXT} fontWeight={head ? "bold" : undefined} textAnchor="middle">
      {text}
    </text>
  );
  return (
    <g transform="translate(230 237)">
      <rect x={0} y={0} width={185} height={55} fill="none" stroke="#000" strokeWidth={0.7} />
      {line(0, 15, 185, 15)}
      {line(0, 35, 185, 35)}
      {line(120, 15, 120, 55)}
      {line(140, 35, 140, 55)}
      {line(160, 35, 160, 55)}
      {t(92, 10, `${code}-КМ`, true)}
      {t(60, 24, title, true)}
      {t(60, 30, `Несущий каркас 900 × 900 × ${height}`)}
      {t(60, 46, node, true)}
      {t(152, 26, "Металлические конструкции")}
      {t(130, 42, "Стадия")}
      {t(130, 50, "Р", true)}
      {t(150, 42, "Лист")}
      {t(150, 50, sheet, true)}
      {t(172, 42, "Масштаб")}
      {t(172, 50, scale)}
    </g>
  );
}

/**
 * Вид Г (М 1:1,4): стенка швеллера 10П у торца, выходящего на контур, с фигурным вырезом под отгиб панели и цоколь.
 * u — от торца по длине, z — от низа швеллера; полки — тонкими линиями, вырез — по огибающей (скос, горизонталь, до низа верхней полки).
 */
function ViewG({ ch, zg, notch }: { ch: { h: number; t: number }; zg: number; notch: { len: number; slope: number } }) {
  const S = 0.7, GX = 330, GY = 228, L = 80;
  const G = (u: number, z: number): [number, number] => [GX + u * S, GY - z * S];
  const low = zg - 25, mid = zg - 6, top = ch.h - ch.t;
  const cut: [number, number][] = [[0, low], [notch.slope, mid], [notch.len, mid], [notch.len, top], [0, top]];
  return (
    <g>
      <text x={GX - 8} y={GY - ch.h * S - 7} fontSize={HEAD} fontWeight="bold">
        Г (М 1:1,4)
      </text>
      {/* Стенка у торца с линией обрыва справа. */}
      <polygon points={[[0, 0], [L, 0], [L, ch.h], [0, ch.h]].map(([u, z]) => G(u, z).join(",")).join(" ")} fill="url(#hatch2)" stroke="#000" strokeWidth={THICK} />
      <polygon points={cut.map(([u, z]) => G(u, z).join(",")).join(" ")} fill="#fff" stroke="#000" strokeWidth={THICK} />
      {[ch.t, top].map((z) => (
        <line key={z} x1={G(0, z)[0]} y1={G(0, z)[1]} x2={G(L, z)[0]} y2={G(L, z)[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="2 1" />
      ))}
      {dim(G(0, ch.h), G(notch.len, ch.h), [0, -5], String(notch.len))}
      {dim(G(0, mid), G(notch.slope, mid), [0, 16], String(notch.slope))}
      {dim(G(0, 0), G(0, low), [-6, 0], String(low), true)}
      {dim(G(0, 0), G(0, mid), [-13, 0], String(mid), true)}
      {dim(G(L, 0), G(L, top), [6, 0], fmt(top), true)}
      <text x={G(0, -12)[0]} y={G(0, -12)[1]} fontSize={TXT}>
        торец / контур
      </text>
    </g>
  );
}

type Ch = { h: number; w: number; s: number; t: number; kgm: number };

/**
 * Вид по стенке швеллера: длина × высота, полки — штрихом, фигурные вырезы у торцов (ends) — по огибающей отгиба панели и цоколя.
 * (X, Y) — левый нижний угол на листе, k — масштаб; zBase — отметка низа швеллера (у 8П — 20), zg — низ косынок.
 */
function ChannelWeb({ X, Y, k, len, ch, ends, zBase, zg, notch }: { X: number; Y: number; k: number; len: number; ch: Ch; ends: ("start" | "end")[]; zBase: number; zg: number; notch: { len: number; slope: number } }) {
  const Q = (u: number, z: number): [number, number] => [X + u * k, Y - z * k];
  const low = zg - 25 - zBase, mid = zg - 6 - zBase, top = ch.h - ch.t;
  const at = (u: number, end: "start" | "end") => (end === "start" ? u : len - u);
  return (
    <g>
      <polygon points={[[0, 0], [len, 0], [len, ch.h], [0, ch.h]].map(([u, z]) => Q(u, z).join(",")).join(" ")} fill="none" stroke="#000" strokeWidth={THICK} />
      {[ch.t, top].map((z) => (
        <line key={z} x1={Q(0, z)[0]} y1={Q(0, z)[1]} x2={Q(len, z)[0]} y2={Q(len, z)[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="2 1" />
      ))}
      {ends.map((end) => (
        <polygon key={end} points={[[0, low], [notch.slope, mid], [notch.len, mid], [notch.len, top], [0, top]].map(([u, z]) => Q(at(u, end), z).join(",")).join(" ")} fill="#fff" stroke="#000" strokeWidth={THICK} />
      ))}
    </g>
  );
}

/** Сечение швеллера (М k): стенка слева, полки вправо; размеры h, b, s, t. */
function ChannelSection({ X, Y, k, ch, name }: { X: number; Y: number; k: number; ch: Ch; name: string }) {
  const Q = (u: number, z: number): [number, number] => [X + u * k, Y - z * k];
  const ring: [number, number][] = [[0, 0], [ch.w, 0], [ch.w, ch.t], [ch.s, ch.t], [ch.s, ch.h - ch.t], [ch.w, ch.h - ch.t], [ch.w, ch.h], [0, ch.h]];
  return (
    <g>
      <text x={X - 2} y={Q(0, ch.h)[1] - 8} fontSize={TXT}>
        {name}
      </text>
      <polygon points={ring.map(([u, z]) => Q(u, z).join(",")).join(" ")} fill="url(#hatch)" stroke="#000" strokeWidth={THICK} />
      {dim(Q(0, 0), Q(0, ch.h), [-5, 0], String(ch.h), true)}
      {dim(Q(0, ch.h), Q(ch.w, ch.h), [0, -3], String(ch.w))}
      {dim(Q(0, 0), Q(ch.s, 0), [0, 5], fmt(ch.s))}
      {dim(Q(ch.w, 0), Q(ch.w, ch.t), [5, 0], fmt(ch.t), true)}
    </g>
  );
}

/** Лист 4: швеллеры основания — марки Ш1 (10П), Ш2 (консоль 8П), Ш3 (8П пролёт и под установку), вырез у торца, сечения, ведомость. */
function ChannelsSheet({ code, title }: { code: string; title: string }) {
  const n = cassetteNode(), c = n.channels, notch = n.belt.notch, H = n.height;
  const z8 = c.ch10.h - c.ch8.h;
  const marks: [string, string, number, number, Ch, string][] = [
    ["Ш1", "Швеллер 10П ГОСТ 8240-97", c.l10, 2, c.ch10, "фигурный вырез на обоих концах"],
    ["Ш2", "Швеллер 8П ГОСТ 8240-97 (консоль)", c.console, 4, c.ch8, "фигурный вырез у наружного торца"],
    ["Ш3", "Швеллер 8П ГОСТ 8240-97 (пролёт, под установку)", c.span, 4, c.ch8, "без вырезов; пролёт 2 + под установку 2"],
  ];
  const total = marks.reduce((sum, m) => sum + (m[4].kgm * m[2] * m[3]) / 1000, 0);
  const notes = [
    "1. Размеры в мм. Резка в размер под 90°, допуск длины ±1; торцы зачистить.",
    `2. Фигурный вырез стенки — плазма/лазер по шаблону до сварки основания; зазор до отгиба панели и цоколя 2 (лист 2, вид Г).`,
    "3. Ш2 — вырез только у торца, выходящего на контур; Ш1 — на обоих концах.",
    "4. Полки 10П и 8П наружу, верх всех швеллеров основания — на отметке 100 (8П на подкладках 20 в кондукторе).",
  ];
  return (
    <g>
      {/* Ш1 — вид по стенке, М 1:4, и конец с вырезом крупно, М 1:2. */}
      <text x={30} y={16} fontSize={HEAD} fontWeight="bold">
        Ш1. 10П L={c.l10} — 2 шт. (М 1:4)
      </text>
      <ChannelWeb X={35} Y={52} k={0.25} len={c.l10} ch={c.ch10} ends={["start", "end"]} zBase={0} zg={c.zg} notch={notch} />
      {dim([35, 52], [35 + c.l10 * 0.25, 52], [0, 7], String(c.l10))}
      <text x={35} y={70} fontSize={TXT}>
        Вырез Ш1-1 — на обоих концах
      </text>

      <text x={30} y={86} fontSize={HEAD} fontWeight="bold">
        Ш1-1 (М 1:2)
      </text>
      <ChannelWeb X={40} Y={150} k={0.5} len={110} ch={c.ch10} ends={["start"]} zBase={0} zg={c.zg} notch={notch} />
      {dim([40, 150 - 100 * 0.5], [40 + notch.len * 0.5, 150 - 100 * 0.5], [0, -4], String(notch.len))}
      {dim([40, 150 - (c.zg - 6) * 0.5], [40 + notch.slope * 0.5, 150 - (c.zg - 6) * 0.5], [0, 14], String(notch.slope))}
      {dim([40, 150], [40, 150 - (c.zg - 25) * 0.5], [-6, 0], String(c.zg - 25), true)}
      {dim([40, 150], [40, 150 - (c.zg - 6) * 0.5], [-13, 0], String(c.zg - 6), true)}
      {dim([40 + 110 * 0.5, 150], [40 + 110 * 0.5, 150 - (c.ch10.h - c.ch10.t) * 0.5], [6, 0], fmt(c.ch10.h - c.ch10.t), true)}
      <text x={40} y={157} fontSize={TXT}>
        торец
      </text>

      {/* Ш2 — консоль 8П, М 1:2. */}
      <text x={130} y={86} fontSize={HEAD} fontWeight="bold">
        Ш2. 8П L={c.console} — 4 шт. (М 1:2)
      </text>
      <ChannelWeb X={140} Y={150} k={0.5} len={c.console} ch={c.ch8} ends={["start"]} zBase={z8} zg={c.zg} notch={notch} />
      {dim([140, 150], [140 + c.console * 0.5, 150], [0, 7], String(c.console))}
      {dim([140, 150], [140, 150 - (c.zg - 25 - z8) * 0.5], [-6, 0], String(c.zg - 25 - z8), true)}
      {dim([140, 150], [140, 150 - (c.zg - 6 - z8) * 0.5], [-13, 0], String(c.zg - 6 - z8), true)}
      <text x={140} y={164} fontSize={TXT}>
        торец к контуру — слева
      </text>

      {/* Ш3 — 8П пролёт, М 1:4. */}
      <text x={30} y={186} fontSize={HEAD} fontWeight="bold">
        Ш3. 8П L={c.span} — 4 шт. (М 1:4)
      </text>
      <ChannelWeb X={35} Y={215} k={0.25} len={c.span} ch={c.ch8} ends={[]} zBase={z8} zg={c.zg} notch={notch} />
      {dim([35, 215], [35 + c.span * 0.25, 215], [0, 7], String(c.span))}

      {/* Сечения, М 1:2. */}
      <ChannelSection X={230} Y={150} k={0.5} ch={c.ch10} name="10П (М 1:2)" />
      <ChannelSection X={230} Y={215} k={0.5} ch={c.ch8} name="8П (М 1:2)" />

      {/* Ведомость марок. */}
      <g transform="translate(300 12)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Ведомость марок
        </text>
        {marks.map(([mark, profile, len, qty, ch, note], i) => (
          <g key={mark} transform={`translate(0 ${4 + i * 18})`}>
            <rect x={0} y={0} width={110} height={18} fill="none" stroke="#000" strokeWidth={THIN} />
            {wrap(`${mark}. ${profile}, L=${len}`, 104).map((t, j) => (
              <text key={j} x={2} y={4 + j * 4} fontSize={TXT}>
                {t}
              </text>
            ))}
            <text x={2} y={12.5} fontSize={TXT}>
              {qty} шт. × {fmt((ch.kgm * len) / 1000)} кг = {fmt((ch.kgm * len * qty) / 1000)} кг
            </text>
            <text x={2} y={16.5} fontSize={TXT} fill="#444">
              {note}
            </text>
          </g>
        ))}
        <text x={2} y={65} fontSize={TXT}>
          Итого швеллеров основания: {fmt(total)} кг
        </text>
      </g>
      <g transform="translate(300 90)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Технические требования
        </text>
        {notes
          .flatMap((t) => wrap(t, 110))
          .map((t, i) => (
            <text key={i} x={0} y={6 + i * 4.2} fontSize={TXT}>
              {t}
            </text>
          ))}
      </g>
      <Stamp code={code} title={title} height={H} node="Швеллеры основания (Ш1–Ш3)" sheet={4} scale="1:4; 1:2" />
    </g>
  );
}

/** Блок «спецификация + технические требования» справа на листе (x 300…410). */
function SideText({ spec, notes, top = 12 }: { spec: [string, string, string, string][]; notes: string[]; top?: number }) {
  let y = 4;
  const rows = spec.map((row) => {
    const name = wrap(`${row[0]}. ${row[1]}`, 92), note = row[3] ? wrap(row[3], 104) : [];
    const h = (name.length + note.length) * 4 + 2, at = y;
    y += h;
    return { row, name, note, h, at };
  });
  return (
    <>
      <g transform={`translate(300 ${top})`}>
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Спецификация
        </text>
        {rows.map(({ row, name, note, h, at }) => (
          <g key={row[0]} transform={`translate(0 ${at})`}>
            <rect x={0} y={0} width={110} height={h} fill="none" stroke="#000" strokeWidth={THIN} />
            {name.map((t, i) => (
              <text key={i} x={2} y={4 + i * 4} fontSize={TXT}>
                {t}
              </text>
            ))}
            <text x={108} y={4} fontSize={TXT} textAnchor="end">
              {row[2]}
            </text>
            {note.map((t, i) => (
              <text key={i} x={5} y={4 + (name.length + i) * 4} fontSize={TXT} fill="#444">
                {t}
              </text>
            ))}
          </g>
        ))}
      </g>
      <g transform={`translate(300 ${top + y + 12})`}>
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Технические требования
        </text>
        {notes
          .flatMap((t) => wrap(t, 110))
          .map((t, i) => (
            <text key={i} x={0} y={6 + i * 4.2} fontSize={TXT}>
              {t}
            </text>
          ))}
      </g>
    </>
  );
}

/** План шкафа (М 1:10): контур каркаса со скруглениями, линии швеллеров основания или труб пояса — тонко. */
function PlanOutline({ X, Y, k, W, D, R }: { X: number; Y: number; k: number; W: number; D: number; R: number }) {
  const P = (x: number, y: number): [number, number] => [X + x * k, Y - y * k];
  const d = `M ${P(R, 0).join(" ")} L ${P(W - R, 0).join(" ")} A ${R * k} ${R * k} 0 0 0 ${P(W, R).join(" ")} L ${P(W, D - R).join(" ")} A ${R * k} ${R * k} 0 0 0 ${P(W - R, D).join(" ")} L ${P(R, D).join(" ")} A ${R * k} ${R * k} 0 0 0 ${P(0, D - R).join(" ")} L ${P(0, R).join(" ")} A ${R * k} ${R * k} 0 0 0 ${P(R, 0).join(" ")} Z`;
  return <path d={d} fill="none" stroke="#000" strokeWidth={THICK} />;
}

/** Лист 5: привязка к фундаменту (узел Д, схема анкеров) и заземление (узел Е). */
function AnchorSheet({ code, title }: { code: string; title: string }) {
  const n = cassetteNode(), s = n.site, H = n.height, C = s.ch10, C8 = s.ch8;
  const ay = [s.inset + s.anchor.edge, s.D - s.inset - s.anchor.edge], ax = [s.anchor.end, s.W - s.anchor.end];
  // Схема анкеров, М 1:10.
  const k = 0.1, SX = 45, SY = 135, P = (x: number, y: number): [number, number] => [SX + x * k, SY - y * k];
  const line = (a: [number, number], b: [number, number], w = THIN, dash?: string) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#000" strokeWidth={w} strokeDasharray={dash} />;
  // Узел Д, М 1:2,5: разрез поперёк 10П по анкеру; u — от наружной кромки полки (к контуру — минус), z — от низа швеллера.
  const kd = 0.4, DX = 175, DY = 120, Q = (u: number, z: number): [number, number] => [DX + u * kd, DY - z * kd];
  const rect = (u0: number, z0: number, u1: number, z1: number, fill: string, w = THIN) => {
    const [x0, y0] = Q(u0, z1), [x1, y1] = Q(u1, z0);
    return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={fill} stroke="#000" strokeWidth={w} />;
  };
  const a = s.anchor.edge, gap = 20, hef = 125, nutH = 13;
  // Узел Е, М 1:2,5: сечение 8П (стенка справа, полки к контуру — влево), пластина на стенке внутри полости, болт к контуру.
  const ke = 0.4, EX = 120, EY = 220, E = (u: number, z: number): [number, number] => [EX + u * ke, EY - z * ke];
  const erect = (u0: number, z0: number, u1: number, z1: number, fill: string, w = THIN) => {
    const [x0, y0] = E(u0, z1), [x1, y1] = E(u1, z0);
    return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={fill} stroke="#000" strokeWidth={w} />;
  };
  const spec: [string, string, string, string][] = [
    ["28", "Шайба −8×38×60, отв. ⌀18", "4", "приварить к полке Н1-△4 после выверки"],
    ["29", "Подкладка вилочная −5×60×88", "16", "4 пакета по 20 мм"],
    ["30", "Анкер химический М16, шпилька 5.8, L=200", "4", "hef 125, состав — по паспорту"],
    ["", "Гайка М16 ГОСТ ISO 4032", "8", "2 на анкер"],
    ["31", "Пластина заземления −8×60×50 + болт М10×40", "1", "на стенке левого 8П, посередине"],
  ];
  const notes = [
    "1. Фундамент — ж/б плита ≥ 1100×1100, толщина ≥ 250, бетон ≥ B20 F150 W4; неплоскостность под опорами ≤ 5.",
    `2. Анкеры — в нижних полках 10П: ось ${a} от наружной кромки полки, ${s.anchor.end} от торцов (у торцов — полка цоколя). Отверстие 20×40 вдоль швеллера — при изготовлении.`,
    "3. Выставить на пакетах подкладок 29 по уровню (вертикаль ≤ 3), затянуть гайки, законтрить; шайбы 28 приварить, подкладки прихватить.",
    "4. Зазор 20 под основанием не замоноличивать — проветривание и отвод воды.",
    "5. Болт 31 — к контуру заземления (проект ЭС); знак — ГОСТ 21130. Подход — под цоколем или лючок в цоколе.",
  ];
  return (
    <g>
      <text x={30} y={16} fontSize={HEAD} fontWeight="bold">
        Схема анкеров (М 1:10)
      </text>
      <rect x={P(-100, s.D + 100)[0]} y={P(-100, s.D + 100)[1]} width={1100 * k} height={1100 * k} fill="none" stroke="#000" strokeWidth={THIN} strokeDasharray="3 1.5" />
      <PlanOutline X={SX} Y={SY} k={k} W={s.W} D={s.D} R={s.inset} />
      {/* 10П — вдоль X; 8П — вдоль Y (тонко). */}
      {[s.inset, s.D - s.inset - C.w].map((y) => (
        <rect key={y} x={P(0, y + C.w)[0]} y={P(0, y + C.w)[1]} width={s.W * k} height={C.w * k} fill="#ddd" stroke="#000" strokeWidth={THIN} />
      ))}
      {[s.inset, s.W - s.inset - C8.w].map((x) => (
        <rect key={x} x={P(x, s.D)[0]} y={P(x, s.D)[1]} width={C8.w * k} height={s.D * k} fill="none" stroke="#000" strokeWidth={THIN} />
      ))}
      {ax.flatMap((x) => ay.map((y) => <circle key={`${x}-${y}`} cx={P(x, y)[0]} cy={P(x, y)[1]} r={1.4} fill="#000" />))}
      {dim(P(ax[0], ay[0]), P(ax[1], ay[0]), [0, 9], `${ax[1] - ax[0]} между осями`)}
      {dim(P(0, ay[0]), P(ax[0], ay[0]), [0, 15], String(s.anchor.end))}
      {dim(P(ax[1], ay[0]), P(ax[1], ay[1]), [12, 0], String(ay[1] - ay[0]), true)}
      {dim(P(ax[1], 0), P(ax[1], ay[0]), [20, 0], String(ay[0]), true)}
      {dim(P(-100, -100), P(1000, -100), [0, 6], "1100 плита")}
      <text x={30} y={156} fontSize={TXT}>
        Контур плиты — штрихом; анкеры — точки
      </text>

      <text x={160} y={16} fontSize={HEAD} fontWeight="bold">
        Д (М 1:2,5) — разрез по анкеру
      </text>
      {/* Бетон, подкладки, нижняя полка 10П с отверстием, стенка, верхняя полка; шайба, гайки, шпилька. */}
      {line(Q(-70, -gap), Q(110, -gap), THICK)}
      {rect(-70, -gap - 140, 110, -gap, "url(#hatch2)")}
      {rect(a - 44, -gap, a + 44, 0, "#ddd")}
      {rect(0, 0, a - 10, C.t, "url(#hatch)", THICK)}
      {rect(a + 10, 0, C.w, C.t, "url(#hatch)", THICK)}
      {rect(C.w - C.s, C.t, C.w, C.h - C.t, "url(#hatch)", THICK)}
      {rect(0, C.h - C.t, C.w, C.h, "url(#hatch)", THICK)}
      {rect(a - 19, C.t, a + 19, C.t + 8, "#999", THICK)}
      {rect(a - 12, C.t + 8, a + 12, C.t + 8 + nutH, "#ccc")}
      {rect(a - 12, C.t + 8 + nutH, a + 12, C.t + 8 + 2 * nutH, "#ccc")}
      {rect(a - 8, -gap - hef, a + 8, C.t + 8 + 2 * nutH + 8, "#fff")}
      {dim(Q(a - 8, -gap - hef), Q(a - 8, -gap), [-14, 0], `hef=${hef}`, true)}
      {dim(Q(C.w + 4, -gap), Q(C.w + 4, 0), [10, 0], String(gap), true)}
      {dim(Q(0, C.h), Q(a, C.h), [0, -5], String(a))}
      {dim(Q(a - 10, 0), Q(a + 10, 0), [0, 14], "20 (отв. 20×40)")}
      {pos(Q(a + 19, C.t + 4), Q(a + 60, C.t + 40), 28)}
      {pos(Q(a + 40, -gap / 2), Q(a + 80, -gap - 30), 29)}
      {pos(Q(a + 8, -gap - 70), Q(a + 60, -gap - 90), 30)}
      <text x={Q(-68, C.h + 6)[0]} y={Q(-68, C.h + 6)[1]} fontSize={TXT}>
        к контуру ←
      </text>

      <text x={100} y={168} fontSize={HEAD} fontWeight="bold">
        Е (М 1:2,5) — заземление
      </text>
      {/* 8П: стенка справа (u 40−s…40), полки влево к контуру; пластина 8 на стенке внутри полости; болт М10 к контуру. */}
      {erect(C8.w - C8.s, 0, C8.w, C8.h, "url(#hatch)", THICK)}
      {erect(0, 0, C8.w, C8.t, "url(#hatch)", THICK)}
      {erect(0, C8.h - C8.t, C8.w, C8.h, "url(#hatch)", THICK)}
      {erect(C8.w - C8.s - 8, (C8.h - 50) / 2, C8.w - C8.s, (C8.h + 50) / 2, "#999", THICK)}
      {erect(C8.w - C8.s - 8 - 40, C8.h / 2 - 5, C8.w - C8.s - 8, C8.h / 2 + 5, "#ccc")}
      {erect(C8.w - C8.s - 8 - 40, C8.h / 2 - 8, C8.w - C8.s - 8 - 32, C8.h / 2 + 8, "#ccc")}
      {dim(E(C8.w - C8.s - 8, (C8.h - 50) / 2), E(C8.w - C8.s - 8, (C8.h + 50) / 2), [-30, 0], "50", true)}
      {pos(E(C8.w - C8.s - 4, C8.h / 2 + 20), E(C8.w + 30, C8.h + 15), 31)}
      <text x={EX + 60} y={EY - 20} fontSize={TXT}>
        Болт М10 приварить к пластине,
      </text>
      <text x={EX + 60} y={EY - 15} fontSize={TXT}>
        резьбу смазать; середина левого 8П
      </text>

      <SideText spec={spec} notes={notes} />
      <Stamp code={code} title={title} height={H} node="Узлы Д, Е. Привязка, заземление" sheet={5} scale="1:10; 1:2,5" />
    </g>
  );
}

/** Лист 6: строповка — узел Ж (бобышка под рым-болт), план верха, схема строповки, указания. */
function LiftSheet({ code, title, mass }: { code: string; title: string; mass: number }) {
  const n = cassetteNode(), s = n.site, H = n.height, T = s.tube, L = s.lift;
  // Бобышки — на пролётах продольных труб пояса, всегда по оси трубы, в L.off от связывающих («транспортировочные крюки.dwg»).
  const lugX = [s.inset + T / 2, s.W - s.inset - T / 2], lugY = [s.inset + T + L.off, s.D - s.inset - T - L.off];
  const half = Math.hypot((lugX[1] - lugX[0]) / 2, (lugY[1] - lugY[0]) / 2), sling = 1200, cos = Math.sqrt(sling ** 2 - half ** 2) / sling;
  const angle = Math.round((Math.acos(cos) * 180) / Math.PI);
  // План верха, М 1:10.
  const k = 0.1, SX = 45, SY = 135, P = (x: number, y: number): [number, number] => [SX + x * k, SY - y * k];
  // Узел Ж, М 1:2,5: разрез по оси бобышки поперёк продольной трубы пояса — труба, бобышка, рым-болт (условно).
  const kz = 0.4, ZX = 190, ZY = 120, Q = (u: number, z: number): [number, number] => [ZX + u * kz, ZY - (z - H) * kz];
  const rect = (u0: number, z0: number, u1: number, z1: number, fill: string, w = THIN) => {
    const [x0, y0] = Q(u0, z1), [x1, y1] = Q(u1, z0);
    return <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={fill} stroke="#000" strokeWidth={w} />;
  };
  // Ось бобышки в сечении трубы — по оси трубы (правило).
  const bc = T / 2;
  const line2 = (p1: [number, number], p2: [number, number], w = THICK, dash?: string) => <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#000" strokeWidth={w} strokeDasharray={dash} />;
  const branch = ((600 * 9.81 * 1.3) / 2 / cos / 1000).toFixed(1).replace(".", ",");
  const spec: [string, string, string, string][] = [
    ["38", `Бобышка ⌀${L.d}×${L.h}, резьба М20 гл. 20 (круг 50 ГОСТ 2590-2006)`, "4", "09Г2С, Т1-△5 по контуру; на продольной трубе"],
    ["39", "Рым-болт М20 ГОСТ 4751-73", "4", "инвентарный"],
    ["40", "Болт М20×20 ГОСТ 7798-70 + шайба EPDM", "4", "заглушка после монтажа"],
  ];
  const notes = [
    `1. Масса шкафа без оборудования по модели ≈ ${Math.round(mass)} кг; с оборудованием — по паспорту.`,
    `2. Подъём — только за 4 рым-болта 39 четырёхветвевым стропом; ветвь ≥ ${sling}, угол от вертикали ≈ ${angle}°; расчётно нагрузку воспринимают 2 ветви.`,
    "3. Рым-болты ввернуть до упора бурта, кольцо — в плоскости ветви; грузоподъёмность — по ГОСТ 4751-73 с учётом угла; при массе с оборудованием > 800 кг — с траверсой.",
    `4. Проверка (600 кг, kдин 1,3, 2 ветви): на ветвь ≈ ${branch} кН; продольная труба σ ≈ 21 МПа, связывающая ≈ 30 МПа, шов τ ≈ 7 МПа — усиление пояса не требуется, предел по поясу ≈ 3 т.`,
    "5. Стык продольной трубы со связывающей — обварить по всему контуру сечения, kf 4. После монтажа рым-болты вывернуть, поставить заглушки 40, резьбу смазать.",
    "6. Временная связь по проёму двери — когда в модели появится дверь.",
  ];
  return (
    <g>
      <text x={30} y={16} fontSize={HEAD} fontWeight="bold">
        План верха (М 1:10)
      </text>
      <PlanOutline X={SX} Y={SY} k={k} W={s.W} D={s.D} R={s.inset} />
      {/* Связывающие трубы пояса — по осям стоек. */}
      {[s.inset, s.D - s.inset - T].map((y) => (
        <rect key={y} x={P(0, y + T)[0]} y={P(0, y + T)[1]} width={s.W * k} height={T * k} fill="#ddd" stroke="#000" strokeWidth={THIN} />
      ))}
      {[s.inset, s.W - s.inset - T].map((x) => (
        <rect key={`l${x}`} x={P(x, s.D - s.inset - T)[0]} y={P(x, s.D - s.inset - T)[1]} width={T * k} height={(s.D - 2 * s.inset - 2 * T) * k} fill="#eee" stroke="#000" strokeWidth={THIN} />
      ))}
      {lugX.flatMap((x) => lugY.map((y) => <circle key={`${x}-${y}`} cx={P(x, y)[0]} cy={P(x, y)[1]} r={(L.d / 2) * k} fill="#fff" stroke="#000" strokeWidth={THICK} />))}
      {dim(P(lugX[0], lugY[0]), P(lugX[1], lugY[0]), [0, 18], String(lugX[1] - lugX[0]))}
      {dim(P(0, lugY[0]), P(lugX[0], lugY[0]), [0, 24], String(lugX[0]))}
      {dim(P(lugX[1], 0), P(lugX[1], lugY[0]), [26, 0], String(lugY[0]), true)}
      {dim(P(lugX[1], lugY[0]), P(lugX[1], lugY[1]), [14, 0], String(lugY[1] - lugY[0]), true)}
      {pos(P(lugX[1], lugY[1]), P(lugX[1] + 120, lugY[1] + 150), 38)}

      <text x={30} y={168} fontSize={HEAD} fontWeight="bold">
        Схема строповки (М 1:25)
      </text>
      {(() => {
        const g = 0.04, GX = 50, GY = 280, W2 = s.W + 4, hook: [number, number] = [GX + (W2 / 2) * g, GY - (H + 800) * g];
        return (
          <>
            <rect x={GX} y={GY - H * g} width={W2 * g} height={H * g} fill="none" stroke="#000" strokeWidth={THICK} />
            {[GX + (lugX[0] + 2) * g, GX + (lugX[1] + 2) * g].map((x) => (
              <line key={x} x1={x} y1={GY - H * g} x2={hook[0]} y2={hook[1]} stroke="#000" strokeWidth={THICK} />
            ))}
            <circle cx={hook[0]} cy={hook[1] - 1.5} r={1.5} fill="none" stroke="#000" strokeWidth={THICK} />
            {dim([GX, GY], [GX + W2 * g, GY], [0, 5], String(W2))}
            {dim([GX + W2 * g, GY], [GX + W2 * g, GY - H * g], [8, 0], String(H), true)}
            <text x={GX + W2 * g + 4} y={hook[1] + 14} fontSize={TXT}>
              L ветви ≥ 1200
            </text>
          </>
        );
      })()}

      <text x={170} y={16} fontSize={HEAD} fontWeight="bold">
        Ж (М 1:2,5) — рым-болт
      </text>
      {/* Слева — сечение продольной трубы по оси бобышки; справа — вид вдоль трубы: связывающая труба (сечение) и пролёт с бобышкой в L.off. */}
      {rect(0, H - T, T, H, "url(#hatch)", THICK)}
      {rect(3, H - T + 3, T - 3, H - 3, "#fff")}
      {rect(bc - L.d / 2, H, bc + L.d / 2, H + L.h, "url(#hatch2)", THICK)}
      <circle cx={Q(bc, H + L.h + 32)[0]} cy={Q(bc, H + L.h + 32)[1]} r={30 * kz} fill="none" stroke="#000" strokeWidth={THICK} />
      <circle cx={Q(bc, H + L.h + 32)[0]} cy={Q(bc, H + L.h + 32)[1]} r={18 * kz} fill="none" stroke="#000" strokeWidth={THIN} />
      {rect(bc - 10, H + L.h - 20, bc + 10, H + L.h + 4, "none")}
      {dim(Q(bc - L.d / 2, H + L.h), Q(bc + L.d / 2, H + L.h), [0, -6], `⌀${L.d}`)}
      {dim(Q(bc + L.d / 2, H), Q(bc + L.d / 2, H + L.h), [10, 0], String(L.h), true)}
      {dim(Q(0, H - T), Q(T, H - T), [0, 8], String(T))}
      {pos(Q(bc + 20, H + L.h + 50), Q(T + 40, H + L.h + 75), 39)}
      {pos(Q(bc - 20, H + 12), Q(-40, H + 50), 38)}
      {(() => {
        const u0 = 95, tie = [u0, u0 + T], c = u0 + T + L.off, end = c + 70;
        return (
          <>
            {rect(tie[0], H - T, tie[1], H, "url(#hatch)", THICK)}
            {rect(tie[0] + 3, H - T + 3, tie[1] - 3, H - 3, "#fff")}
            {line2(Q(tie[1], H), Q(end, H))}
            {line2(Q(tie[1], H - T), Q(end, H - T))}
            {line2(Q(end, H + 4), Q(end, H - T - 4), THIN, "2 1")}
            {rect(c - L.d / 2, H, c + L.d / 2, H + L.h, "none", THICK)}
            {line2(Q(c, H + L.h + 6), Q(c, H - 6), THIN, "4 1 1 1")}
            {dim(Q(tie[1], H + L.h), Q(c, H + L.h), [0, -6], String(L.off))}
            <text x={Q(tie[0], H - T - 14)[0]} y={Q(tie[0], H - T - 14)[1]} fontSize={TXT}>
              Связывающая
            </text>
            <text x={Q(tie[1] + 8, H - T - 30)[0]} y={Q(tie[1] + 8, H - T - 30)[1]} fontSize={TXT}>
              Продольная, пролёт
            </text>
          </>
        );
      })()}
      <text x={Q(-30, H - T - 70)[0]} y={Q(-30, H - T - 70)[1]} fontSize={TXT}>
        Т1-△5 по контуру бобышки; стык продольной со связывающей — по контуру, kf 4
      </text>

      <SideText spec={spec} notes={notes} />
      <Stamp code={code} title={title} height={H} node="Узел Ж. Строповка" sheet={6} scale="1:10; 1:2,5; 1:25" />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Листы 7–10: основной каркас — схема с марками, трубы, листовые детали, общие данные.
// Марки — frameMarks (evaporatorMarks.ts): одинаковые детали одной маркой, всё из модели серии.
// ---------------------------------------------------------------------------------------------

type Item = { s: Solid; m: FrameMark };
const itemsOf = (marks: FrameMark[]) => marks.flatMap((m) => m.solids.map((s) => ({ s, m })));
const center = (s: Solid): [number, number, number] => [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2];

/** Марка на схеме: выноска от точки к рамке с текстом. */
const tag = (at: [number, number], to: [number, number], text: string, key?: string) => (
  <g key={key ?? text}>
    <line x1={at[0]} y1={at[1]} x2={to[0]} y2={to[1]} stroke="#000" strokeWidth={THIN} />
    <circle cx={at[0]} cy={at[1]} r={0.5} fill="#000" />
    <rect x={to[0] - 5.5} y={to[1] - 3.2} width={11} height={4.8} fill="#fff" stroke="#000" strokeWidth={THIN} />
    <text x={to[0]} y={to[1] + 0.9} fontSize={TXT} textAnchor="middle">
      {text}
    </text>
  </g>
);

const FILL: Record<string, string> = { channel: "#e4e4e4", tube: "#cfcfcf", bar: "#fff", plate: "#f7f7f7" };

/**
 * План каркаса (М k): вид сверху на выбранные детали; front — к низу листа. Марки — по одной выноске на марку,
 * экземпляр берётся в «своём» углу (по порядку марок), выноска — наружу от центра плана на квадратное кольцо.
 */
function FramePlan({ X, Y, k, W, D, items, cut = [] }: { X: number; Y: number; k: number; W: number; D: number; items: Item[]; cut?: string[] }) {
  const P = (x: number, y: number): [number, number] => [X + x * k, Y - y * k];
  const rank = (i: Item) => (cut.includes(i.m.mark) ? 3 : i.m.kind === "channel" ? 0 : i.m.kind === "plate" ? 1 : 2);
  const sorted = [...items].sort((a, b) => rank(a) - rank(b));
  const marks = [...new Set(items.map((i) => i.m.mark))];
  const C = P(W / 2, D / 2), half = (Math.max(W, D) * k) / 2;
  return (
    <g>
      {sorted.map(({ s, m }) => {
        const key = s.part.id;
        if (m.kind === "bar") {
          const [cx, cy] = center(s);
          return <circle key={key} cx={P(cx, cy)[0]} cy={P(cx, cy)[1]} r={((s.max[0] - s.min[0]) / 2) * k} fill="#fff" stroke="#000" strokeWidth={THICK} />;
        }
        const fill = cut.includes(m.mark) ? "url(#hatch)" : FILL[m.kind];
        if (s.part.plane === "xy" && s.part.shape) {
          const pts = s.shape.outer.map(([u, v]) => P(s.min[0] + u, s.min[1] + v).join(",")).join(" ");
          return <polygon key={key} points={pts} fill={fill} stroke="#000" strokeWidth={THIN} />;
        }
        const [x0, y0] = P(s.min[0], s.max[1]);
        return <rect key={key} x={x0} y={y0} width={(s.max[0] - s.min[0]) * k} height={(s.max[1] - s.min[1]) * k} fill={fill} stroke="#000" strokeWidth={m.kind === "plate" ? THIN : THICK} />;
      })}
      {(() => {
        // Рамки марок не должны налезать друг на друга: занятые места запоминаются, новая рамка сдвигается вдоль кольца.
        const taken: [number, number][] = [];
        return marks.map((mark, j) => {
        const own = items.filter((i) => i.m.mark === mark);
        // Экземпляр в «своём» углу: перед-лево, перед-право, зад-право, зад-лево по кругу.
        const want = [[0, 0], [1, 0], [1, 1], [0, 1]][j % 4];
        const pick = own.find(({ s }) => {
          const [cx, cy] = center(s);
          return (cx > W / 2 ? 1 : 0) === want[0] && (cy > D / 2 ? 1 : 0) === want[1];
        }) ?? own[0];
        const [cx, cy] = center(pick.s), at = P(cx, cy);
        let dx = at[0] - C[0], dy = at[1] - C[1];
        if (Math.hypot(dx, dy) < 5) [dx, dy] = [-1, 0.3];
        const r = (half + 6 + 6 * (Math.floor(j / 4) % 3)) / Math.max(Math.abs(dx), Math.abs(dy));
        const to: [number, number] = [C[0] + dx * r, C[1] + dy * r];
        const side = Math.abs(dx) * r > Math.abs(dy) * r - 0.1;
        while (taken.some(([x, y]) => Math.abs(x - to[0]) < 12 && Math.abs(y - to[1]) < 6)) {
          if (side) to[1] += 6;
          else to[0] += 12;
        }
        taken.push(to);
        return tag(at, to, mark);
        });
      })()}
    </g>
  );
}

/** Вид каркаса сбоку (М k): профили контуром; along — ось листа по горизонтали ("x" — фасад, "y" — бок, перед слева). */
function FrameElevation({ X, Y, k, items, along }: { X: number; Y: number; k: number; items: Item[]; along: 0 | 1 }) {
  const Q = (u: number, z: number): [number, number] => [X + u * k, Y - z * k];
  return (
    <g>
      {items
        .filter(({ m }) => m.kind !== "plate")
        .map(({ s, m }) => {
          const [x0, y0] = Q(s.min[along], s.max[2]);
          return <rect key={s.part.id} x={x0} y={y0} width={(s.max[along] - s.min[along]) * k} height={(s.max[2] - s.min[2]) * k} fill="none" stroke="#000" strokeWidth={m.kind === "channel" ? THICK : THIN} />;
        })}
    </g>
  );
}

/** Лист 7: схема каркаса — план основания, план верха, фасад и бок с марками; перечень марок. */
function FrameScheme({ code, title, marks, W, D, H }: { code: string; title: string; marks: FrameMark[]; W: number; D: number; H: number }) {
  const all = itemsOf(marks);
  const zTop = Math.min(...all.filter((i) => i.m.mark === "Т1").map((i) => i.s.min[2]));
  const low = all.filter(({ s, m }) => s.max[2] <= 101 || m.mark === "С1");
  const high = all.filter(({ s }) => s.min[2] >= zTop - 10);
  const k = 0.1, e = 0.05;
  const B = { X: 45, Y: 122 }, T = { X: 175, Y: 122 }, F = { X: 40, Y: 262 }, S = { X: 125, Y: 262 };
  const pick = (mark: string, along: 0 | 1, prefer?: (s: Solid) => boolean) => {
    const own = all.filter((i) => i.m.mark === mark).map((i) => i.s);
    const s = own.find((x) => (prefer ? prefer(x) : true)) ?? own[0], c = center(s);
    return (o: [number, number]) => {
      const base = along === 0 ? F : S, at: [number, number] = [base.X + c[along] * e, base.Y - c[2] * e];
      return tag(at, [at[0] + o[0], at[1] + o[1]], mark, `${mark}-${along}`);
    };
  };
  const notes = [
    "1. Размеры в мм. Марки деталей — см. ведомость элементов (лист 10), деталировка — листы 4, 8, 9.",
    "2. План основания — вид сверху с разрезом по стойкам (стойки заштрихованы); план верха — вид сверху; на планах перед шкафа — внизу.",
    `3. Отметки: верх основания +100, низ верхнего пояса +${zTop}, верх каркаса +${H}.`,
    `4. Одинаковые листовые детали внизу и вверху каркаса — одна марка (${marks.filter((m) => m.name.endsWith("низ и верх каркаса")).map((m) => m.mark).join(", ")}).`,
    "5. Сборка и сварка — в кондукторе (вкладка «Кондуктор»), порядок — в справке модели.",
  ];
  return (
    <g>
      <text x={25} y={16} fontSize={HEAD} fontWeight="bold">
        План основания (М 1:10)
      </text>
      <FramePlan X={B.X} Y={B.Y} k={k} W={W} D={D} items={low} cut={["С1"]} />
      {dim([B.X, B.Y], [B.X + W * k, B.Y], [0, 30], String(W))}

      <text x={152} y={16} fontSize={HEAD} fontWeight="bold">
        План верха (М 1:10)
      </text>
      <FramePlan X={T.X} Y={T.Y} k={k} W={W} D={D} items={high} />
      {dim([T.X + W * k, T.Y], [T.X + W * k, T.Y - D * k], [30, 0], String(D), true)}

      <text x={25} y={160} fontSize={HEAD} fontWeight="bold">
        Фасад (М 1:20)
      </text>
      <FrameElevation X={F.X} Y={F.Y} k={e} items={all} along={0} />
      {pick("С1", 0)([-12, -40])}
      {pick("Т1", 0)([-12, -6])}
      {pick("Ш1", 0)([-12, 8])}
      {dim([F.X + W * e, F.Y], [F.X + W * e, F.Y - H * e], [8, 0], String(H), true)}
      {dim([F.X, F.Y], [F.X + W * e, F.Y], [0, 6], String(W))}

      <text x={110} y={160} fontSize={HEAD} fontWeight="bold">
        Бок, слева (М 1:20)
      </text>
      <FrameElevation X={S.X} Y={S.Y} k={e} items={all} along={1} />
      {pick("Т2", 1)([-10, -8])}
      {pick("Т3", 1)([8, -10])}
      {pick("Б1", 1)([18, -4])}
      {pick("Ш2", 1)([-10, 8])}
      {pick("Ш3", 1, (s) => s.part.id.startsWith("base8"))([20, 8])}
      {dim([S.X + D * e, F.Y], [S.X + D * e, F.Y - 100 * e], [8, 0], "100", true)}
      {dim([S.X, F.Y], [S.X + D * e, F.Y], [0, 6], String(D))}

      <g transform="translate(300 12)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Перечень марок
        </text>
        {marks.map((m, i) => (
          <text key={m.mark} x={0} y={6 + i * 4.2} fontSize={TXT}>
            {wrap(`${m.mark} — ${m.name}`, 92)[0]}
          </text>
        ))}
        {marks.map((m, i) => (
          <text key={m.mark + "q"} x={110} y={6 + i * 4.2} fontSize={TXT} textAnchor="end">
            {m.qty}
          </text>
        ))}
      </g>
      <g transform={`translate(300 ${24 + marks.length * 4.2})`}>
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Примечания
        </text>
        {notes
          .flatMap((t) => wrap(t, 110))
          .map((t, i) => (
            <text key={i} x={0} y={6 + i * 4.2} fontSize={TXT}>
              {t}
            </text>
          ))}
      </g>
      <Stamp code={code} title={title} height={H} node="Схема каркаса. Марки" sheet={7} scale="1:10; 1:20" />
    </g>
  );
}

/** Отверстия детали-трубы вдоль/поперёк грани (у стойки ось детали — b). */
const tubeHoles = (m: FrameMark) => m.shape.drills.map((d) => (m.solids[0].part.alongB ? { along: d.y, across: d.x, d: d.d } : { along: d.x, across: d.y, d: d.d }));

/** Грань трубы (М k): длина × ширина, отверстия; цепочка размеров по отверстиям снизу, привязка поперёк — слева. */
function TubeFace({ X, Y, k, len, w, holes, extra = [] }: { X: number; Y: number; k: number; len: number; w: number; holes: { along: number; across: number; d: number }[]; extra?: number[] }) {
  const Q = (u: number, v: number): [number, number] => [X + u * k, Y - v * k];
  const stops = [0, ...[...new Set([...holes.map((h) => h.along), ...extra].map((v) => +v.toFixed(1)))].sort((a, b) => a - b), len];
  return (
    <g>
      <rect x={X} y={Y - w * k} width={len * k} height={w * k} fill="#fff" stroke="#000" strokeWidth={THICK} />
      {[3, w - 3].map((v) => (
        <line key={v} x1={Q(0, v)[0]} y1={Q(0, v)[1]} x2={Q(len, v)[0]} y2={Q(len, v)[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="2 1" />
      ))}
      {holes.map((h, i) => (
        <circle key={i} cx={Q(h.along, h.across)[0]} cy={Q(h.along, h.across)[1]} r={Math.max(0.6, (h.d / 2) * k)} fill="#fff" stroke="#000" strokeWidth={THICK} />
      ))}
      {stops.slice(1).map((v, i) => <g key={i}>{dim(Q(stops[i], 0), Q(v, 0), [0, 6], fmt(v - stops[i]))}</g>)}
      {stops.length > 2 && dim(Q(0, 0), Q(len, 0), [0, 12], fmt(len))}
      {holes.length > 0 && dim(Q(0, 0), Q(0, holes[0].across), [-5, 0], fmt(holes[0].across), true)}
    </g>
  );
}

/** Лист 8: стойки и трубы верхнего пояса — С1, Т1, Т2, Т3 (с бобышками Б1), сечение трубы, бобышка. */
function TubesSheet({ code, title, marks, H }: { code: string; title: string; marks: FrameMark[]; H: number }) {
  const n = cassetteNode(), { a: T, s: ts, r: R } = n.tube;
  const by = (mark: string) => marks.find((m) => m.mark === mark)!;
  const c1 = by("С1"), t1 = by("Т1"), t2 = by("Т2"), t3 = by("Т3"), b1 = by("Б1");
  // Бобышки на Т3: положение вдоль трубы от её начала.
  const t3s = t3.solids[0], bossAt = by("Б1").solids.map((s) => center(s)).filter((c) => Math.abs(c[0] - center(t3s)[0]) < T).map((c) => c[1] - t3s.min[1]);
  const L = n.site.lift;
  const rows = [c1, t1, t2, t3, b1];
  const notes = [
    `1. Трубы 60×60×${ts} ГОСТ 30245-2003, рез 90°, допуск длины ±1; торцы зачистить от грата.`,
    `2. Отверстия ⌀${n.hole} — на ЧПУ (лазер/сверловка) до сварки, в грани к кассете; привязка — от торца и от наружного ребра.`,
    `3. С1 — все 8 стоек одна деталь: у правых стоек ставится другим торцом вверх (отверстия симметричны).`,
    `4. Б1 приварить к Т3 до сборки пояса: Т1-△5 по контуру, по оси трубы, в ${L.off} от торцов, резьба М20 — после сварки или защитить.`,
    `5. Торцы труб на контуре закрыть заглушками ${marks.find((m) => m.ids.includes("cap-front-l"))?.mark ?? "—"} сплошным швом (лист 9).`,
  ];
  return (
    <g>
      <text x={25} y={16} fontSize={HEAD} fontWeight="bold">
        С1. Стойка, труба 60×60×{ts} L={fmt(c1.a)} — {c1.qty} шт. (М 1:10)
      </text>
      <TubeFace X={35} Y={34} k={0.1} len={c1.a} w={T} holes={tubeHoles(c1)} />
      <text x={35} y={58} fontSize={TXT}>
        Грань к кассете; низ стойки — слева
      </text>

      <text x={25} y={72} fontSize={HEAD} fontWeight="bold">
        Т1. Связывающая L={fmt(t1.a)} — {t1.qty} шт. (М 1:5)
      </text>
      <TubeFace X={35} Y={92} k={0.2} len={t1.a} w={T} holes={tubeHoles(t1)} />

      <text x={25} y={124} fontSize={HEAD} fontWeight="bold">
        Т2. Консоль L={fmt(t2.a)} — {t2.qty} шт. (М 1:2)
      </text>
      <TubeFace X={35} Y={164} k={0.5} len={t2.a} w={T} holes={tubeHoles(t2)} />

      <text x={125} y={124} fontSize={HEAD} fontWeight="bold">
        Т3. Пролёт L={fmt(t3.a)} — {t3.qty} шт. (М 1:5)
      </text>
      <TubeFace X={130} Y={152} k={0.2} len={t3.a} w={T} holes={[]} extra={bossAt} />
      {bossAt.map((u) => (
        <rect key={u} x={130 + (u - L.d / 2) * 0.2} y={152 - T * 0.2 - L.h * 0.2} width={L.d * 0.2} height={L.h * 0.2} fill="url(#hatch2)" stroke="#000" strokeWidth={THICK} />
      ))}
      {pos([130 + bossAt[0] * 0.2, 152 - T * 0.2 - L.h * 0.2], [130 + bossAt[0] * 0.2 + 14, 152 - T * 0.2 - L.h * 0.2 - 8], 1)}
      <text x={130 + bossAt[0] * 0.2 + 19} y={152 - T * 0.2 - L.h * 0.2 - 7} fontSize={TXT}>
        Б1, по оси трубы
      </text>

      {/* Сечение трубы, М 1:1. */}
      <text x={25} y={186} fontSize={HEAD} fontWeight="bold">
        Сечение трубы (М 1:1)
      </text>
      <rect x={40} y={196} width={T} height={T} rx={R} fill="url(#hatch)" stroke="#000" strokeWidth={THICK} />
      <rect x={40 + ts} y={196 + ts} width={T - 2 * ts} height={T - 2 * ts} rx={R - ts} fill="#fff" stroke="#000" strokeWidth={THIN} />
      {dim([40, 196 + T], [40 + T, 196 + T], [0, 6], String(T))}
      {dim([40 + T, 196], [40 + T, 196 + T], [6, 0], String(T), true)}
      {dim([40, 196 + T / 2], [40 + ts, 196 + T / 2], [0, -4], fmt(ts))}

      {/* Б1, М 1:1: разрез по оси — круг 50, резьба М20 гл. 20, фаска 1,5×45°. */}
      <text x={125} y={186} fontSize={HEAD} fontWeight="bold">
        Б1. Бобышка — {b1.qty} шт. (М 1:1)
      </text>
      {(() => {
        const X = 140, Y = 230, h = L.h, d = L.d, ch = 1.5, dr = 17.3, dt = 20;
        const body: [number, number][] = [[0, 0], [d, 0], [d, h - ch], [d - ch, h], [0 + ch, h], [0, h - ch]];
        return (
          <>
            <polygon points={body.map(([u, v]) => `${X + u},${Y - v}`).join(" ")} fill="url(#hatch2)" stroke="#000" strokeWidth={THICK} />
            <polygon points={[[d / 2 - dr / 2, h], [d / 2 + dr / 2, h], [d / 2 + dr / 2, h - 23], [d / 2, h - 23 - 5], [d / 2 - dr / 2, h - 23]].map(([u, v]) => `${X + u},${Y - v}`).join(" ")} fill="#fff" stroke="#000" strokeWidth={THICK} />
            {[d / 2 - dt / 2, d / 2 + dt / 2].map((u) => (
              <line key={u} x1={X + u} y1={Y - h} x2={X + u} y2={Y - h + 20} stroke="#000" strokeWidth={THIN} />
            ))}
            <line x1={X + d / 2} y1={Y + 3} x2={X + d / 2} y2={Y - h - 3} stroke="#000" strokeWidth={THIN} strokeDasharray="5 1 1 1" />
            {dim([X, Y], [X + d, Y], [0, 6], `⌀${d}`)}
            {dim([X + d, Y], [X + d, Y - h], [6, 0], String(h), true)}
            {dim([X + d / 2 - dt / 2, Y - h], [X + d / 2 + dt / 2, Y - h], [0, -5], "М20")}
            {dim([X, Y - h], [X, Y - h + 20], [-6, 0], "20", true)}
            <text x={X + d + 14} y={Y - 14} fontSize={TXT}>
              Круг 50 ГОСТ 2590-2006,
            </text>
            <text x={X + d + 14} y={Y - 10} fontSize={TXT}>
              фаски 1,5×45°
            </text>
          </>
        );
      })()}

      <SideText spec={rows.map((m) => [m.mark, `${m.name}, ${m.kind === "bar" ? "круг 50" : `труба 60×60×${ts}`}${m.kind === "bar" ? "" : ` L=${fmt(m.a)}`}`, String(m.qty), `${fmt(m.mass)} кг/шт., всего ${fmt(m.mass * m.qty)} кг`])} notes={notes} />
      <Stamp code={code} title={title} height={H} node="Стойки и трубы пояса (С1, Т1–Т3, Б1)" sheet={8} scale="1:10; 1:5; 1:2; 1:1" />
    </g>
  );
}

/** Листовая деталь (М k): контур, вырезы, отверстия; габариты снизу и слева, отверстия — цепочкой по длине для длинных. */
function PlateView({ X, Y, k, m, chain = false }: { X: number; Y: number; k: number; m: FrameMark; chain?: boolean }) {
  const xs = m.shape.outer.map((p) => p[0]), ys = m.shape.outer.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  // Длинная деталь «стоя» (лево/право) — кладём вдоль листа.
  const swap = chain && h > w;
  const Q = (u: number, v: number): [number, number] => (swap ? [X + (v - y0) * k, Y - (u - x0) * k] : [X + (u - x0) * k, Y - (v - y0) * k]);
  const L = swap ? h : w, B = swap ? w : h;
  const ring = (pts: Pt[]) => pts.map(([u, v]) => Q(u, v).join(",")).join(" ");
  const holes = m.shape.drills.map((d) => ({ u: swap ? d.y - y0 : d.x - x0, d: d.d, at: Q(d.x, d.y) }));
  const stops = [0, ...[...new Set(holes.map((h) => +h.u.toFixed(1)))].sort((a, b) => a - b), L];
  return (
    <g>
      <polygon points={ring(m.shape.outer)} fill="#f7f7f7" stroke="#000" strokeWidth={THICK} />
      {m.shape.cutouts.map((c, i) => (
        <polygon key={i} points={ring(c)} fill="#fff" stroke="#000" strokeWidth={THICK} />
      ))}
      {holes.map((h, i) => (
        <circle key={i} cx={h.at[0]} cy={h.at[1]} r={Math.max(0.6, (h.d / 2) * k)} fill="#fff" stroke="#000" strokeWidth={THICK} />
      ))}
      {chain && stops.length > 2 ? stops.slice(1).map((v, i) => <g key={i}>{dim([X + stops[i] * k, Y], [X + v * k, Y], [0, 5], fmt(v - stops[i]))}</g>) : dim([X, Y], [X + L * k, Y], [0, 5], fmt(L))}
      {chain && stops.length > 2 && dim([X, Y], [X + L * k, Y], [0, 10], fmt(L))}
      {dim([X, Y], [X, Y - B * k], [-5, 0], fmt(B), true)}
    </g>
  );
}

/** Лист 9: листовые детали каркаса — косынки, заглушки, шайбы, пластина (М 1:2), опорные полосы (М 1:10). */
function PlatesSheet({ code, title, marks, H }: { code: string; title: string; marks: FrameMark[]; H: number }) {
  const of = (prefix: string) => marks.find((m) => m.ids.some((id) => id.startsWith(prefix)))?.mark ?? "—";
  const plates = marks.filter((m) => m.kind === "plate");
  const small = plates.filter((m) => Math.max(m.a, m.b) <= 200), long = plates.filter((m) => Math.max(m.a, m.b) > 200);
  const notes = [
    "1. Сталь 09Г2С ГОСТ 19281-2014; лист 8 — косынки, полосы, шайбы, пластина; лист 3 — заглушки.",
    "2. Резка — лазер/плазма по DXF модели; кромки зачистить.",
    "3. Зеркальные экземпляры — та же деталь, перевёрнутая при сборке (одна марка).",
    "4. Отв. ⌀5 в опорных полосах — под резьбу М6; концы полос — по модели, подгонка по месту.",
    `5. ${of("anchor-wash")} (шайбы анкеров) — к полке 10П после выверки на месте; ${of("ground-plate")} — с болтом М10×40, приварить к стенке 8П.`,
  ];
  return (
    <g>
      {small.map((m, i) => {
        const col = i % 4, row = Math.floor(i / 4), X = 32 + col * 68, Y = 20 + row * 92;
        const k = Math.max(m.a, m.b) > 100 ? 0.5 : 0.5;
        return (
          <g key={m.mark}>
            <text x={X - 7} y={Y} fontSize={HEAD} fontWeight="bold">
              {m.mark} — {m.qty} шт., −{m.t} (М 1:2)
            </text>
            {wrap(m.name, 62)
              .slice(0, 2)
              .map((t, j) => (
                <text key={j} x={X - 7} y={Y + 5 + j * 4} fontSize={TXT}>
                  {t}
                </text>
              ))}
            <PlateView X={X} Y={Y + 82} k={k} m={m} />
            {m.shape.drills.length > 0 && (
              <text x={X + m.a * k + 3} y={Y + 80} fontSize={TXT}>
                отв. ⌀{m.shape.drills[0].d}
              </text>
            )}
          </g>
        );
      })}
      {long.map((m, i) => {
        const X = 32 + i * 68, Y = 222;
        return (
          <g key={m.mark}>
            <text x={X - 7} y={Y - 14} fontSize={HEAD} fontWeight="bold">
              {m.mark} — {m.qty} шт. (М 1:10)
            </text>
            <PlateView X={X} Y={Y} k={0.1} m={m} chain />
          </g>
        );
      })}
      <SideText spec={plates.map((m) => [m.mark, m.name, String(m.qty), `−${m.t}, ${fmt(m.a)}×${fmt(m.b)}; ${fmt(m.mass)} кг/шт., всего ${fmt(m.mass * m.qty)} кг`])} notes={notes} />
      <Stamp code={code} title={title} height={H} node={`Листовые детали каркаса (Д1–Д${plates.length})`} sheet={9} scale="1:2; 1:10" />
    </g>
  );
}

/** Лист 10: общие данные — ведомость листов, ведомость элементов, расход стали, общие указания. */
/** Материал детали для ведомостей: без ГОСТа и назначения; лист — с толщиной. */
const stuff = (m: FrameMark) => (m.kind === "plate" ? `Лист 09Г2С −${m.t}` : m.material.replace(/\s*\(.*\)/, ""));

function GeneralSheet({ code, title, marks, H }: { code: string; title: string; marks: FrameMark[]; H: number }) {
  const cols = [0, 14, 112, 126, 150, 176, 195];
  const head = ["Марка", "Наименование", "Кол.", "Масса 1, кг", "Всего, кг", "Лист"];
  let y = 26;
  const rows = marks.map((m) => {
    const name = wrap(`${m.name} — ${stuff(m).replace(/ ГОСТ.*$/, "")}${m.kind === "plate" || m.kind === "bar" ? "" : `, L=${fmt(m.a)}`}`, cols[2] - cols[1] - 2);
    const h = name.length * 3.8 + 1.4, at = y;
    y += h;
    return { m, name, h, at };
  });
  const steel = new Map<string, number>();
  for (const m of marks) steel.set(stuff(m), (steel.get(stuff(m)) ?? 0) + m.mass * m.qty);
  const total = [...steel.values()].reduce((a, b) => a + b, 0);
  const notes = [
    "1. Комплект КМ несущего каркаса шкафа испарителя; обшивка и угловые кассеты — листы 1–3, привязка, заземление, строповка — листы 5, 6.",
    "2. Сталь: швеллеры ГОСТ 8240-97, трубы ГОСТ 30245-2003, листы ГОСТ 19903-2015 — 09Г2С (С345) по ГОСТ 19281-2014; полосы-вставки — AISI 304.",
    "3. Сварка — полуавтомат в CO2 (ГОСТ 14771-76), проволока Св-08Г2С; катет — по наименьшей толщине, не менее 3; швы сплошные, если на листах узлов не указано иное.",
    "4. Отверстия в стойках и трубах пояса — на ЧПУ до сварки; сборка — в кондукторе по отверстиям стоек.",
    "5. Допуски сборки: разность диагоналей основания и верха ≤ 3, отклонение стоек от вертикали ≤ 2 на высоту, отметка верха ±2.",
    "6. Перед окраской — очистка от окалины и брызг; покрытие — по проекту АКЗ (в модели не задано). Резьбу бобышек и отверстия под заклёпки защитить.",
    "7. Маркировка: на каждой детали — марка (Ш1, С1, Д1…) краской или клеймом.",
  ];
  const line = (x1: number, y1: number, x2: number, y2: number, key?: string) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={THIN} />;
  return (
    <g>
      <g transform="translate(25 0)">
        <text x={0} y={16} fontSize={HEAD} fontWeight="bold">
          Ведомость элементов каркаса
        </text>
        <rect x={0} y={20} width={cols[6]} height={y - 20} fill="none" stroke="#000" strokeWidth={THICK} />
        {head.map((t, i) => (
          <text key={t} x={cols[i] + 1} y={24.5} fontSize={TXT}>
            {t}
          </text>
        ))}
        {line(0, 26, cols[6], 26)}
        {cols.slice(1, -1).map((c) => line(c, 20, c, y, `c${c}`))}
        {rows.map(({ m, name, h, at }) => (
          <g key={m.mark}>
            {line(0, at + h, cols[6], at + h)}
            <text x={1} y={at + 3.6} fontSize={TXT}>
              {m.mark}
            </text>
            {name.map((t, j) => (
              <text key={j} x={cols[1] + 1} y={at + 3.6 + j * 3.8} fontSize={TXT}>
                {t}
              </text>
            ))}
            <text x={cols[3] - 1} y={at + 3.6} fontSize={TXT} textAnchor="end">
              {m.qty}
            </text>
            <text x={cols[4] - 1} y={at + 3.6} fontSize={TXT} textAnchor="end">
              {fmt(m.mass)}
            </text>
            <text x={cols[5] - 1} y={at + 3.6} fontSize={TXT} textAnchor="end">
              {fmt(m.mass * m.qty)}
            </text>
            <text x={cols[6] - 1} y={at + 3.6} fontSize={TXT} textAnchor="end">
              {m.sheet}
            </text>
          </g>
        ))}
        <text x={cols[1] + 1} y={y + 5} fontSize={TXT}>
          Итого каркас:
        </text>
        <text x={cols[5] - 1} y={y + 5} fontSize={TXT} textAnchor="end">
          {fmt(total)}
        </text>

        <text x={0} y={y + 16} fontSize={HEAD} fontWeight="bold">
          Расход стали, кг
        </text>
        {[...steel.entries()].map(([name, kg], i) => (
          <g key={name}>
            <text x={1} y={y + 22 + i * 4.2} fontSize={TXT}>
              {name}
            </text>
            <text x={cols[5] - 1} y={y + 22 + i * 4.2} fontSize={TXT} textAnchor="end">
              {fmt(kg)}
            </text>
          </g>
        ))}
      </g>

      <g transform="translate(300 12)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Ведомость листов
        </text>
        {SHEETS.map((name, i) => (
          <text key={name} x={0} y={6 + i * 4.2} fontSize={TXT}>
            {i + 1}. {name}
          </text>
        ))}
      </g>
      <g transform={`translate(300 ${24 + SHEETS.length * 4.2})`}>
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Общие указания
        </text>
        {notes
          .flatMap((t) => wrap(t, 110))
          .map((t, i) => (
            <text key={i} x={0} y={6 + i * 4.2} fontSize={TXT}>
              {t}
            </text>
          ))}
      </g>
      <Stamp code={code} title={title} height={H} node="Общие данные" sheet={10} scale="—" />
    </g>
  );
}

/**
 * Листы 2 и 3: узлы нижнего и верхнего пояса (М 1:1) — вертикальный разрез стены у стойки, типовой (как «узел обвязки-1.dwg»).
 * u — от наружной грани каркаса внутрь (вправо), z — отметка от низа основания. Низ: косынка каркаса заподлицо с верхом основания,
 * под ней отгиб панели, ниже — накладка цоколя; верх: труба пояса на стойке, косынка заподлицо с верхом пояса, отгиб панели поверх.
 */
function BeltNode({ which, code, title }: { which: "bottom" | "top"; code: string; title: string }) {
  const n = cassetteNode(), b = n.belt, H = n.height, bottom = which === "bottom";
  const { zPost, stay, skin, ret, ch10: C, tube: T, tubeS: s } = b;
  const zg = zPost - stay;
  // Привязка листа: u = 0 — на x = 60; низ — z = 0 на y = 222; верх — z = H на y = 70.
  const OX = 60, Z0 = bottom ? 0 : H, OY = bottom ? 222 : 70;
  const P = (u: number, z: number): [number, number] => [OX + u, OY - (z - Z0)];
  const poly = (list: [number, number][], fill: string, w = THIN) => <polygon points={list.map(([u, z]) => P(u, z).join(",")).join(" ")} fill={fill} stroke="#000" strokeWidth={w} />;
  const rect = (u0: number, z0: number, u1: number, z1: number, fill: string, w = THIN) => poly([[u0, z0], [u1, z0], [u1, z1], [u0, z1]], fill, w);
  const text = (u: number, z: number, value: string, head = false) => (
    <text x={P(u, z)[0]} y={P(u, z)[1]} fontSize={head ? HEAD : TXT} fontWeight={head ? "bold" : undefined}>
      {value}
    </text>
  );
  /** Отметка уровня: полка со стрелкой слева от контура. */
  const level = (z: number, label: string) => (
    <g>
      <line x1={P(-38, z)[0]} y1={P(-38, z)[1]} x2={P(-4, z)[0]} y2={P(-4, z)[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="3 1.5" />
      <text x={P(-38, z)[0]} y={P(-38, z)[1] - 1} fontSize={TXT}>
        {label}
      </text>
    </g>
  );
  const contour = <line x1={P(0, Z0 - (bottom ? 12 : 150))[0]} y1={P(0, Z0 - (bottom ? 12 : 150))[1]} x2={P(0, Z0 + (bottom ? 200 : 20))[0]} y2={P(0, Z0 + (bottom ? 200 : 20))[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="6 1.5 1 1.5" />;

  const panelBottom = bottom ? zg - skin : null;
  // Панель: стенка снаружи контура (u −2…0); внизу — отгиб под косынку, вверху — поверх.
  const panel = bottom
    ? poly([[-skin, panelBottom!], [ret - skin, panelBottom!], [ret - skin, zg], [0, zg], [0, 200], [-skin, 200]], "#d6a")
    : poly([[-skin, H - 150], [0, H - 150], [0, H], [ret - skin, H], [ret - skin, H + skin], [-skin, H + skin]], "#d6a");
  // Накладка цоколя (только низ): нижняя полка под основанием, стенка, скос 15 на 20, верхняя полка под отгибом панели.
  const plinth = poly(
    [[0, 0], [b.plinthLeg, 0], [b.plinthLeg, -skin], [-skin, -skin], [-skin, zg - 22], [13, zg - skin], [ret - skin, zg - skin], [ret - skin, zg - 2 * skin], [14, zg - 2 * skin], [0, zg - 22.67]],
    "#69c",
  );

  const spec: [string, string, string][] = bottom
    ? [
        ["1", "Стойка, труба 60×60×3", "основная / вторая"],
        ["2", "Швеллер 10П ГОСТ 8240-97 (основание)", "в разрезе — условно"],
        ["3", `Косынка / полоса опорная ${b.band.w}×${stay}`, "лист 8, заподлицо с верхом основания"],
        ["4", "Панель, лист 2 09Г2С", `отгиб ${ret} под косынку`],
        ["5", "Накладка цоколя, лист 2 гнутый", `полки ${b.plinthLeg} и 30, скос 15×20`],
        ["6", "Винт М6×16 ISO 7380 A2", `полка цоколя + отгиб → резьба в полосе, шаг ≤ ${b.band.step}`],
      ]
    : [
        ["1", "Стойка, труба 60×60×3", `до низа пояса, z ${H - T}`],
        ["2", "Труба верхнего пояса 60×60×3", "на торце стойки"],
        ["3", `Косынка / полоса опорная ${b.band.w}×${stay}`, "лист 8, заподлицо с верхом пояса"],
        ["4", "Панель, лист 2 09Г2С", `отгиб ${ret} поверх косынки`],
        ["5", "Винт М6×12 ISO 7380 A2", `отгиб → резьба в полосе, шаг ≤ ${b.band.step}`],
      ];
  const notes = bottom
    ? [
        "1. Размеры в мм. Узел типовой, условно; на углах — так же под кассету.",
        `2. Косынки и опорная полоса ${b.band.w}×${stay} — заподлицо с верхом основания (z ${zg}…${zPost}); отгиб панели — под ними.`,
        `3. Полка цоколя и отгиб панели — одним винтом М6 снизу в резьбу полосы (${b.band.hole} от контура), шаг ≤ ${b.band.step}.`,
        "4. У торцов швеллеров — фигурный вырез стенки (вид Г), зазор 2; резка до сварки.",
        "5. На углах цоколь гнутый по R; полки на дуге — вытяжкой или сегментами.",
      ]
    : [
        "1. Размеры в мм. Узел типовой, показан условно (разрез у стойки по стене).",
        `2. Косынки каркаса — заподлицо с верхом пояса (z ${H - stay}…${H}); отгиб панели — поверх косынки и трубы пояса.`,
        `3. Отгиб — винтами М6×12 в резьбу опорной полосы ${b.band.w}×${stay} (${b.band.hole} от контура), шаг ≤ ${b.band.step}; стык с крышей — отдельным узлом.`,
        "4. Торцы труб пояса у контура — заглушки −3×60×60 сплошным швом.",
      ];

  return (
    <g>
      <text x={OX + 40} y={14} fontSize={HEAD} fontWeight="bold">
        {bottom ? "2-2 (М 1:1) — узел нижнего пояса" : "3-3 (М 1:1) — узел верхнего пояса"}
      </text>
      {contour}
      {text(-28, bottom ? 195 : H + 14, "Контур каркаса")}

      {bottom ? (
        <>
          {/* Пол / низ основания. */}
          <line x1={P(-35, -skin)[0]} y1={P(-35, -skin)[1]} x2={P(240, -skin)[0]} y2={P(240, -skin)[1]} stroke="#000" strokeWidth={THICK} />
          {/* Швеллер основания вдоль разреза (полки) и поперёк (сечение). */}
          {rect(0, 0, 175, C.t, "url(#hatch)")}
          {rect(0, C.h - C.t, 175, C.h, "url(#hatch)")}
          {poly([[180, 0], [180 + C.w, 0], [180 + C.w, C.t], [180 + C.s, C.t], [180 + C.s, C.h - C.t], [180 + C.w, C.h - C.t], [180 + C.w, C.h], [180, C.h]], "url(#hatch)", THICK)}
          {/* Косынка каркаса — заподлицо с верхом швеллеров. */}
          {rect(0, zg, 180, zPost, "#ec5", THICK)}
          {/* Стойка (разрез): стенки 3, полость. */}
          {rect(0, zPost, s, 200, "url(#hatch)", THICK)}
          {rect(T - s, zPost, T, 200, "url(#hatch)", THICK)}
          {plinth}
          {panel}
          {level(0, "±0,000 низ основания")}
          {level(zg, `+${zg}`)}
          {level(zPost, `+${zPost} верх основания`)}
          {dim(P(-skin, zg - skin), P(ret - skin, zg - skin), [0, 26], String(ret))}
          {dim(P(-skin, -skin), P(b.plinthLeg, -skin), [0, 10], String(b.plinthLeg + skin))}
          {dim(P(13, zg - skin), P(ret - skin, zg - skin), [0, -10], "30")}
          {dim(P(-skin, -skin), P(-skin, zg - 22), [-14, 0], fmt(zg - 22 + skin), true)}
          {dim(P(-skin, zg - 22), P(-skin, zg - skin), [-14, 0], "20", true)}
          {dim(P(180, zg), P(180, zPost), [55, 0], String(stay), true)}
          {dim(P(180, 0), P(180, zPost), [70, 0], String(zPost), true)}
          {pos(P(T - 10, 170), P(T + 30, 185), 1)}
          {pos(P(200, 50), P(235, 70), 2)}
          {pos(P(120, zg + 4), P(140, 140), 3)}
          {pos(P(-1, 150), P(-25, 160), 4)}
          {pos(P(-1, 30), P(-25, 45), 5)}
          {/* Винт М6×16 снизу: через полку цоколя и отгиб панели в резьбу опорной полосы. */}
          {rect(b.band.hole - 5.25, zg - 2 * skin - 3.3, b.band.hole + 5.25, zg - 2 * skin, "#ddd")}
          {rect(b.band.hole - 3, zg - 2 * skin, b.band.hole + 3, zg - 2 * skin + 16, "#ddd")}
          {pos(P(b.band.hole + 3, zg - 2 * skin - 2), P(b.band.hole + 30, zg - 40), 6)}
          {/* Вид Г: стенка швеллера 10П у торца с фигурным вырезом (М 1:1,4). */}
          <ViewG ch={C} zg={zg} notch={b.notch} />
        </>
      ) : (
        <>
          {/* Стойка до низа пояса. */}
          {rect(0, H - 150, s, H - T, "url(#hatch)", THICK)}
          {rect(T - s, H - 150, T, H - T, "url(#hatch)", THICK)}
          {/* Труба пояса на торце стойки (сечение). */}
          {rect(0, H - T, T, H, "url(#hatch)", THICK)}
          {rect(s, H - T + s, T - s, H - s, "#fff")}
          {/* Косынка верха каркаса — заподлицо с верхом пояса. */}
          {rect(T, H - stay, 180, H, "#ec5", THICK)}
          {panel}
          {level(H - T, `+${H - T} низ пояса`)}
          {level(H - stay, `+${H - stay}`)}
          {level(H, `+${H} верх каркаса`)}
          {dim(P(-skin, H + skin), P(ret - skin, H + skin), [0, -10], String(ret))}
          {dim(P(0, H - T), P(T, H - T), [0, 8], String(T))}
          {dim(P(180, H - stay), P(180, H), [12, 0], String(stay), true)}
          {dim(P(ret - skin, H), P(ret - skin, H + skin), [8, 0], String(skin), true)}
          {pos(P(T / 2, H - 120), P(T + 40, H - 110), 1)}
          {pos(P(T / 2, H - 30), P(T + 50, H - 70), 2)}
          {pos(P(130, H - 4), P(150, H - 40), 3)}
          {pos(P(-1, H - 100), P(-25, H - 90), 4)}
          {/* Винт М6×12 сверху: через отгиб панели в резьбу опорной полосы. */}
          {rect(b.band.hole - 5.25, H + skin, b.band.hole + 5.25, H + skin + 3.3, "#ddd")}
          {rect(b.band.hole - 3, H + skin - 12, b.band.hole + 3, H + skin, "#ddd")}
          {pos(P(b.band.hole + 3, H + skin + 2), P(b.band.hole + 40, H + 14), 5)}
        </>
      )}

      {/* Спецификация узла. */}
      <g transform="translate(305 12)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Спецификация узла
        </text>
        {spec.map((row, i) => (
          <g key={row[0]} transform={`translate(0 ${4 + i * 10})`}>
            <rect x={0} y={0} width={105} height={10} fill="none" stroke="#000" strokeWidth={THIN} />
            <text x={2} y={4} fontSize={TXT}>
              {row[0]}. {row[1]}
            </text>
            <text x={5} y={8.3} fontSize={TXT} fill="#444">
              {row[2]}
            </text>
          </g>
        ))}
      </g>
      {/* Технические требования. */}
      <g transform="translate(305 80)">
        <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
          Технические требования
        </text>
        {notes
          .flatMap((t) => wrap(t, 105))
          .map((t, i) => (
            <text key={i} x={0} y={6 + i * 4.2} fontSize={TXT}>
              {t}
            </text>
          ))}
      </g>
      <Stamp code={code} title={title} height={H} node={bottom ? "Узел 2. Нижний пояс" : "Узел 3. Верхний пояс"} sheet={bottom ? 2 : 3} scale="1:1" />
    </g>
  );
}

export default function KmSheet({ code, title }: { code: string; title: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [sheet, setSheet] = useState(1);
  // Масса шкафа по модели — для указаний по строповке (лист 6).
  const base = useMemo(() => evaporatorBase(), []);
  const mass = useMemo(() => solidsOf(base).reduce((sum, s) => sum + s.weight, 0), [base]);
  // Марки несущего каркаса — для листов 7–10.
  const marks = useMemo(() => frameMarks(base), [base]);
  const n = cassetteNode();
  const { a: T, s, r: R } = n.tube;

  // --- Разрез 1-1, М 1:1: модель (X вправо, Y к задней стенке) → лист ---
  const X0 = -15, Y0 = -15, OX = 35, OY = 228;
  const P = (x: number, y: number): [number, number] => [OX + (x - X0), OY - (y - Y0)];
  const pts = (list: Pt[]) => list.map(([x, y]) => P(x, y).join(",")).join(" ");
  /** Прямоугольник модели (x0, y0, x1, y1) → атрибуты SVG. */
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    const [ax, ay] = P(x0, y1);
    return { x: ax, y: ay, width: x1 - x0, height: y1 - y0 };
  };
  const tube = (x: number, y: number) => (
    <g>
      <rect {...box(x, y, x + T, y + T)} rx={R} fill="url(#hatch)" stroke="#000" strokeWidth={THICK} />
      <rect {...box(x + s, y + s, x + T - s, y + T - s)} rx={R - s} fill="#fff" stroke="#000" strokeWidth={THIN} />
    </g>
  );

  // Крепёж: ось — по середине грани стойки; винт изнутри кассеты (со стороны отгиба), заклёпка — в стенке стойки.
  // dir — куда смотрит ось от кассеты к стойке; at — координата оси поперёк; face — грань стойки.
  const fastener = (axis: "x" | "y", at: number, face: number) => {
    const span = (from: number, to: number, w: number) => (axis === "y" ? box(at - w / 2, Math.min(from, to), at + w / 2, Math.max(from, to)) : box(Math.min(from, to), at - w / 2, Math.max(from, to), at + w / 2));
    const flange = face - n.strip.t - n.cassetteT;
    return (
      <g>
        {/* Заклёпка: бортик ⌀13 × 1,5 в отверстии полосы, тело ⌀9 в стенке и внутри трубы. */}
        <rect {...span(face - 1.5, face, 13)} fill="#bbb" stroke="#000" strokeWidth={THIN} />
        <rect {...span(face, face + 16, n.hole)} fill="#bbb" stroke="#000" strokeWidth={THIN} />
        {/* Винт М6×16 ISO 7380: головка ⌀10,5 × 3,3, шайба EPDM ⌀12 × 2, стержень ⌀6. */}
        <rect {...span(flange - 2, flange, 12)} fill="#333" stroke="#000" strokeWidth={THIN} />
        <rect {...span(flange - 5.3, flange - 2, 10.5)} rx={1.5} fill="#ddd" stroke="#000" strokeWidth={THIN} />
        <rect {...span(flange, flange + STACK.screw, 6)} fill="#ddd" stroke="#000" strokeWidth={THIN} />
      </g>
    );
  };

  // Размер: отрезок между точками листа с засечками, выносные линии от элементов, текст посередине.

  const [s1, s2] = n.strips;
  const post2: Pt = n.post2;

  // --- Вид А, М 1:10: грань стойки с отверстиями, отметки от нижнего торца ---
  const EX = 268, EY = 210, k = 0.1;
  const E = (u: number, h: number): [number, number] => [EX + u * k, EY - h * k];

  const spec: [string, string, string, string][] = [
    ["1", "Стойка, труба 60×60×3 ГОСТ 30245-2003, L=" + fmt(n.post), "2", `${n.perPost} отв. ⌀${n.hole} в ${n.axis} от ребра, см. вид А; все 8 стоек — одна деталь`],
    ["2", `Полоса-вставка ${n.strip.w}×${n.strip.t} AISI 304`, "2", "отв. овал 6,6×12 вдоль полосы; выступ за контур 5"],
    ["3", `Кассета угловая, лист ${n.cassetteT} 09Г2С, развёртка ${fmt(n.unfold)}`, "1", `отгибы ${n.flange} (на чертеже узла 60), в отгибах овал 7×10`],
    ["4", "Заклёпка резьбовая М6, цил. бортик, полушестигр., A2", String(2 * n.perFlange), `по ${n.perFlange} на отгиб (${n.perPost} в стойке + 1 в поясе)`],
    ["5", "Винт М6×25 ISO 7380 A2", String(2 * n.perFlange), "длина — по каталогу заклёпки, см. Б"],
    ["6", "Шайба М6 EPDM", String(2 * n.perFlange), "под головку винта"],
    ["7", "Лента EPDM самоклеящаяся 12×1,5 и 12×1", "—", "по 2 полосы на отгиб у кромок: 12×1,5 под полосой, 12×1 — полоса/отгиб"],
    ["8", `Утеплитель — минвата базальтовая жёсткая 80–100 кг/м³, ${n.woolT}`, "—", "ламели по дуге на негорючем клею, 2 ряда по высоте"],
  ];
  const notes = [
    "1. Размеры в мм. Узел показан для угла перед-лево, остальные углы — зеркально.",
    `2. Отверстия ⌀${n.hole} в стойках — на ЧПУ до сварки, в ${n.axis} от наружного ребра, отметки от нижнего торца, симметрично (вид А); стойку правой стороны ставить другим торцом вверх; под полушестигранное тело — шестигранное по каталогу заклёпки.`,
    "3. Кондуктор под сварку базировать по отверстиям стоек (штифты ⌀8,8). Отверстия при сварке и окраске закрыть; заклёпки ставить после окраски.",
    "4. Нержавеющую полосу к стали не приваривать; между ними — лента EPDM.",
    "5. Полоса опирается на бортики заклёпок (бортик 1,5 = лента), см. Б; в полосе — овал 6,6×12 вдоль полосы, ленты — 2 полосы 12 у кромок отгиба, зазор под бортик.",
    "6. Панель заземлить перемычкой на болт заземления каркаса.",
  ];

  const download = () => {
    const el = svg.current;
    if (!el) return;
    // В файле — прописные сами по себе: CAD-программы не применяют CSS text-transform.
    const copy = el.cloneNode(true) as SVGSVGElement;
    copy.querySelectorAll("text").forEach((t) => void (t.textContent = (t.textContent ?? "").toUpperCase()));
    const text = `<?xml version="1.0" encoding="UTF-8"?>
${new XMLSerializer().serializeToString(copy)}`;
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${code} КМ лист ${sheet} ${SHEETS[sheet - 1]}.svg` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="km-sheet">
      <div className="km-bar">
        <div className="km-tabs">
          {SHEETS.map((name, i) => (
            <button key={name} className={`btn small ${sheet === i + 1 ? "primary" : ""}`} onClick={() => setSheet(i + 1)}>
              Лист {i + 1}. {name}
            </button>
          ))}
        </div>
        <span className="muted small">A3, размеры из модели серии; печать из SVG в масштабе 1:1.</span>
        <button className="btn" onClick={download}>
          Скачать SVG
        </button>
      </div>
      <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297" width="100%" style={{ background: "#fff", fontFamily: FONT, fontStyle: "italic", textTransform: "uppercase" }}>
        <defs>
          <pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="2" stroke="#000" strokeWidth={0.18} />
          </pattern>
          <pattern id="hatch2" width="1.4" height="1.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="1.4" stroke="#000" strokeWidth={0.15} />
          </pattern>
          {/* Утеплитель — перекрёстная редкая штриховка. */}
          <pattern id="wool" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 0 L4 4 M4 0 L0 4" stroke="#000" strokeWidth={0.15} />
          </pattern>
        </defs>
        {/* Рамка листа: поле подшивки 20, остальные 5. */}
        <rect x={20} y={5} width={395} height={287} fill="none" stroke="#000" strokeWidth={0.7} />

        {sheet === 1 && (
          <>
        {/* --- Разрез 1-1 --- */}
        <text x={OX + 60} y={13} fontSize={HEAD} fontWeight="bold">
          1-1 (М 1:1)
        </text>
        {/* Контур каркаса (оси — штрихпунктир): грани x = 0 и y = 0, линии начала скругления. */}
        {[
          [P(0, -12), P(0, 200)],
          [P(-12, 0), P(200, 0)],
        ].map(([p, q], i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#000" strokeWidth={THIN} strokeDasharray="6 1.5 1 1.5" />
        ))}
        {tube(0, n.inset)}
        {tube(post2[0], post2[1])}
        <rect {...box(s1[0], s1[1], s1[2], s1[3])} fill="url(#hatch2)" stroke="#000" strokeWidth={THICK} />
        <rect {...box(s2[0], s2[1], s2[2], s2[3])} fill="url(#hatch2)" stroke="#000" strokeWidth={THICK} />
        <polygon points={pts(n.wool)} fill="url(#wool)" stroke="#000" strokeWidth={THIN} />
        <polygon points={pts(n.cassette)} fill="#000" stroke="#000" strokeWidth={THIN} />
        {/* Лента EPDM — условно: штриховая линия по стыкам полоса/стойка и полоса/отгиб. */}
        {[
          // Две полосы ленты 12 у кромок отгиба (0…12 и отгиб−12…отгиб) — по обе стороны полосы-вставки, у основной и второй стойки.
          ...[0, n.flange - 12].flatMap((a): [[number, number], [number, number]][] => [
            [P(a, n.inset), P(a + 12, n.inset)],
            [P(a, n.inset - n.strip.t), P(a + 12, n.inset - n.strip.t)],
            [P(n.inset, a), P(n.inset, a + 12)],
            [P(n.inset - n.strip.t, a), P(n.inset - n.strip.t, a + 12)],
          ]),
        ].map(([p, q], i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#c00" strokeWidth={0.4} strokeDasharray="1.5 1" />
        ))}
        {fastener("y", n.axis, n.inset)}
        {fastener("x", n.axis, n.inset)}

        {/* Размеры разреза. */}
        {dim(P(0, n.inset + T), P(T, n.inset + T), [0, -6], String(T))}
        {dim(P(0, n.inset + T), P(n.axis, n.inset + T), [0, -12], fmt(n.axis))}
        {dim(P(post2[0] + T, 0), P(post2[0] + T, T), [6, 0], String(T), true)}
        {dim(P(-5, n.inset - n.strip.t), P(-5, n.inset), [-6, 0], String(n.strip.t), true)}
        {dim(P(0, -5), P(n.inset, -5), [0, 9], String(n.inset))}
        {dim(P(n.inset - n.strip.t, -5), P(n.inset, -5), [0, 15], String(n.strip.t))}
        {dim(P(n.inset, -5), P(n.inset, 0), [6, 0], "5", true)}
        <text x={P(40, 40)[0]} y={P(40, 40)[1]} fontSize={TXT}>
          R126 (наружн.)
        </text>
        <text x={P(-12, n.inset + T + 8)[0]} y={P(-12, n.inset + T + 8)[1]} fontSize={TXT}>
          Контур каркаса
        </text>

        {/* Позиции. */}
        {pos(P(T - 4, n.inset + T - 4), P(T + 25, n.inset + T + 15), 1)}
        {pos(P(post2[0] + T - 4, T - 4), P(post2[0] + T + 15, T + 18), 1)}
        {pos(P(-3, n.inset - 2), P(-12, n.inset + 20), 2)}
        {pos(P(n.inset - 2, -3), P(n.inset - 20, -12), 2)}
        {pos(P(70, 25), P(95, 45), 3)}
        {pos(P(n.axis + 5, n.inset + 10), P(T + 25, n.inset + 35), 4)}
        {pos(P(n.axis - 4, n.inset - n.strip.t - n.cassetteT - 4), P(T + 25, n.inset - 25), 5)}
        {pos(P(n.axis + 6, n.inset - n.strip.t - n.cassetteT - 1), P(T + 40, n.inset - 12), 6)}
        {pos(P(n.inset - 1, T + 2), P(n.inset + 30, T + 30), 7)}
        {pos(P(62, 62), P(100, 100), 8)}

        {/* Выноска «Б» — на крепёж основной стойки. */}
        <circle cx={P(n.axis, n.inset - 2)[0]} cy={P(n.axis, n.inset - 2)[1]} r={13} fill="none" stroke="#000" strokeWidth={THIN} />
        <line x1={P(n.axis + 9, n.inset + 8)[0]} y1={P(n.axis + 9, n.inset + 8)[1]} x2={P(n.axis + 22, n.inset + 22)[0]} y2={P(n.axis + 22, n.inset + 22)[1]} stroke="#000" strokeWidth={THIN} />
        <text x={P(n.axis + 23, n.inset + 23)[0]} y={P(n.axis + 23, n.inset + 23)[1]} fontSize={HEAD} fontWeight="bold">
          Б
        </text>

        {/* --- Выносной элемент Б: пакет крепления в истинных толщинах --- */}
        <DetailB hole={n.hole} wall={s} strip={n.strip.t} flange={n.cassetteT} dim={dim} pos={pos} />

        {/* --- Вид А: сверловка стойки --- */}
        <text x={EX - 10} y={13} fontSize={HEAD} fontWeight="bold">
          А (М 1:10)
        </text>
        <rect x={E(0, n.post)[0]} y={E(0, n.post)[1]} width={T * k} height={n.post * k} fill="none" stroke="#000" strokeWidth={THICK} />
        {n.holesFromBottom.map((h, i) => (
          <g key={i}>
            <circle cx={E(n.axis, h)[0]} cy={E(n.axis, h)[1]} r={Math.max(0.6, (n.hole / 2) * k)} fill="#fff" stroke="#000" strokeWidth={THIN} />
            {/* Отметка от нижнего торца — выносная вправо. */}
            <line x1={E(T, h)[0]} y1={E(T, h)[1]} x2={E(T, h)[0] + 10} y2={E(T, h)[1]} stroke="#000" strokeWidth={THIN} />
            <text x={E(T, h)[0] + 11} y={E(T, h)[1] + 1} fontSize={TXT}>
              {fmt(h)}
            </text>
          </g>
        ))}
        <line x1={E(0, 0)[0] - 3} y1={E(0, 0)[1]} x2={E(T, 0)[0] + 10} y2={E(T, 0)[1]} stroke="#000" strokeWidth={THIN} />
        <text x={E(T, 0)[0] + 11} y={E(T, 0)[1] + 1} fontSize={TXT}>
          0 — торец
        </text>
        <text x={E(0, n.post)[0] - 2} y={E(0, n.post)[1] - 2} fontSize={TXT}>
          L={fmt(n.post)}, любым торцом
        </text>
        <text x={EX - 10} y={EY + 8} fontSize={TXT}>
          {n.perPost} отв. ⌀{n.hole}
        </text>
        <text x={EX - 10} y={EY + 12} fontSize={TXT}>
          шаг ≤ {n.step}
        </text>
        <text x={EX - 10} y={EY + 16} fontSize={TXT}>
          ось {n.axis} от ребра
        </text>

        {/* --- Спецификация: перенос по ширине колонки, высота строки — по числу строк --- */}
        <g transform="translate(305 12)">
          <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
            Спецификация узла
          </text>
          {(() => {
            let y = 4;
            return spec.map((row) => {
              const name = wrap(`${row[0]}. ${row[1]}`, 88), note = row[3] ? wrap(row[3], 100) : [];
              const h = (name.length + note.length) * 4 + 2, top = y;
              y += h;
              return (
                <g key={row[0]} transform={`translate(0 ${top})`}>
                  <rect x={0} y={0} width={105} height={h} fill="none" stroke="#000" strokeWidth={THIN} />
                  {name.map((t, i) => (
                    <text key={i} x={2} y={4 + i * 4} fontSize={TXT}>
                      {t}
                    </text>
                  ))}
                  <text x={103} y={4} fontSize={TXT} textAnchor="end">
                    {row[2]} шт.
                  </text>
                  {note.map((t, i) => (
                    <text key={i} x={5} y={4 + (name.length + i) * 4} fontSize={TXT} fill="#444">
                      {t}
                    </text>
                  ))}
                </g>
              );
            });
          })()}
        </g>

        {/* --- Технические требования — внизу слева, рядом со штампом --- */}
        <g transform="translate(25 241)">
          <text x={0} y={0} fontSize={HEAD} fontWeight="bold">
            Технические требования
          </text>
          {notes
            .flatMap((t) => wrap(t, 200))
            .map((t, i) => (
              <text key={i} x={0} y={5.5 + i * 4.2} fontSize={TXT}>
                {t}
              </text>
            ))}
        </g>

            <Stamp code={code} title={title} height={n.height} node="Узел 1. Монтаж угловой кассеты" sheet={1} scale="1:1; 1:10" />
          </>
        )}
        {sheet === 2 && <BeltNode which="bottom" code={code} title={title} />}
        {sheet === 3 && <BeltNode which="top" code={code} title={title} />}
        {sheet === 4 && <ChannelsSheet code={code} title={title} />}
        {sheet === 5 && <AnchorSheet code={code} title={title} />}
        {sheet === 6 && <LiftSheet code={code} title={title} mass={mass} />}
        {sheet === 7 && <FrameScheme code={code} title={title} marks={marks} W={n.site.W} D={n.site.D} H={n.height} />}
        {sheet === 8 && <TubesSheet code={code} title={title} marks={marks} H={n.height} />}
        {sheet === 9 && <PlatesSheet code={code} title={title} marks={marks} H={n.height} />}
        {sheet === 10 && <GeneralSheet code={code} title={title} marks={marks} H={n.height} />}
      </svg>
    </div>
  );
}
