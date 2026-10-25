"use client";

import type { MoldPlan } from "@/core/mold/types";

/**
 * Схема гипсовой формы в плоскости через ось (Y — по горизонтали, Z — вверх).
 * Для схемы «две боковины + дно» это вид на плоскость разъёма боковины A: видны полость,
 * замки, линия разъёма с дном, пазы под резинки и линия подрезки края.
 */
export function MoldSection({ plan, keyDepthMm }: { plan: MoldPlan; keyDepthMm: number }) {
  const { halfWidth: W, zMin, zMax } = plan.block;
  const pad = Math.max(W, zMax - zMin) * 0.12;
  const x0 = -W - pad;
  const vbW = 2 * (W + pad);
  const vbH = zMax - zMin + 2 * pad;
  const Y = (z: number) => zMax + pad - z; // перевод z → координата SVG
  const fs = vbH / 34;

  const prof = plan.cavityProfile;
  const cavity =
    prof.map((p, i) => `${i ? "L" : "M"}${p.r.toFixed(2)},${Y(p.z).toFixed(2)}`).join(" ") +
    " " +
    [...prof].reverse().map((p) => `L${(-p.r).toFixed(2)},${Y(p.z).toFixed(2)}`).join(" ") +
    " Z";

  const sides = plan.scheme === "two-sides-base";
  const sideKeys = plan.keys.filter((k) => k.normal[0] === 1);
  const baseKeys = plan.keys.filter((k) => k.normal[2] === 1);
  const groove = Math.max(2, keyDepthMm * 0.5);

  return (
    <figure className="moldSection">
      <svg viewBox={`${x0} 0 ${vbW} ${vbH}`} role="img" aria-label="Схема гипсовой формы">
        <rect x={-W} y={Y(zMax)} width={2 * W} height={zMax - zMin} className="plaster" strokeWidth={fs * 0.1} />
        {plan.strapZ.map((z) => (
          <g key={z} className="strap">
            <rect x={-W} y={Y(z) - fs * 0.5} width={groove} height={fs} />
            <rect x={W - groove} y={Y(z) - fs * 0.5} width={groove} height={fs} />
          </g>
        ))}
        <path d={cavity} className="cavity" strokeWidth={fs * 0.1} />
        <line x1={-W} x2={W} y1={Y(plan.rimZ)} y2={Y(plan.rimZ)} className="rim" strokeWidth={fs * 0.08} strokeDasharray={`${fs * 0.4} ${fs * 0.25}`} />
        {sides && plan.baseSplitZ !== null && (
          <line x1={-W} x2={W} y1={Y(plan.baseSplitZ)} y2={Y(plan.baseSplitZ)} className="parting" strokeWidth={fs * 0.14} />
        )}
        {sideKeys.map((k, i) => (
          <circle key={`s${i}`} cx={k.center[1]} cy={Y(k.center[2])} r={k.diameterMm / 2} className="key" strokeWidth={fs * 0.08} />
        ))}
        {baseKeys
          .filter((k) => k.center[0] < 0)
          .map((k, i) => {
            const r = k.diameterMm / 2;
            const y = Y(0);
            return (
              <path
                key={`b${i}`}
                d={`M${k.center[1] - r},${y} L${k.center[1]},${y - k.depthMm} L${k.center[1] + r},${y} Z`}
                className="key"
                strokeWidth={fs * 0.08}
              />
            );
          })}
        <g fontSize={fs * 0.75} className="labels">
          <text x={W + fs * 0.3} y={Y(plan.rimZ) + fs * 0.25}>край</text>
          <text x={0} y={Y(zMax) - fs * 0.5} textAnchor="middle">{(2 * W).toFixed(0)} мм</text>
          <text x={-W - fs * 0.3} y={Y((zMax + zMin) / 2)} textAnchor="end">{(zMax - zMin).toFixed(0)}</text>
          {sides && (
            <>
              <text x={0} y={Y(zMin / 2) + fs * 0.25} textAnchor="middle">дно</text>
              <text x={-W + fs * 0.6} y={Y(zMax) + fs * 1.3}>боковина A</text>
            </>
          )}
        </g>
      </svg>
      <figcaption>
        {sides
          ? "Вид на плоскость разъёма боковины A: кружки — замки, треугольники — замки дна, засечки по краям — пазы под резинки, пунктир — линия подрезки края."
          : "Разрез цельной формы через ось. Пунктир — линия подрезки края, выше — засор."}
      </figcaption>
    </figure>
  );
}
