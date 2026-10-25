"use client";

import type { ProfilePoint } from "@/core/types";

/** Полупрофиль в мм: серый — готовое изделие, оранжевый — модель с учётом усадки. */
export function ProfileChart({ finished, model }: { finished: ProfilePoint[]; model: ProfilePoint[] }) {
  let maxR = 0;
  let maxZ = 0;
  for (const p of model) {
    maxR = Math.max(maxR, p.r);
    maxZ = Math.max(maxZ, p.z);
  }
  const pad = maxZ * 0.08;
  const W = maxR * 2 + pad * 2;
  const Hh = maxZ + pad * 2;
  // SVG: ось Y вниз, поэтому z → Hh - pad - z; ось вращения в центре
  const cx = W / 2;
  const toPath = (pts: ProfilePoint[], side: 1 | -1) =>
    pts.map((p, i) => `${i ? "L" : "M"}${(cx + side * p.r).toFixed(2)},${(Hh - pad - p.z).toFixed(2)}`).join(" ");
  const outline = (pts: ProfilePoint[]) => {
    const right = toPath(pts, 1);
    const left = toPath([...pts].reverse(), -1).replace(/^M/, "L");
    return `${right} ${left} Z`;
  };
  const fs = maxZ / 28;
  const gridStep = maxZ > 150 ? 20 : 10;
  const lines: number[] = [];
  for (let z = 0; z <= maxZ; z += gridStep) lines.push(z);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Профиль изделия и модели">
      {lines.map((z) => (
        <g key={z}>
          <line x1={0} x2={W} y1={Hh - pad - z} y2={Hh - pad - z} className="grid" strokeWidth={fs * 0.05} />
          <text x={fs * 0.3} y={Hh - pad - z - fs * 0.2} fontSize={fs * 0.7} className="gridLabel">{z}</text>
        </g>
      ))}
      <line x1={cx} x2={cx} y1={0} y2={Hh} className="axis" strokeWidth={fs * 0.08} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} />
      <path d={outline(model)} className="model" strokeWidth={fs * 0.12} />
      <path d={outline(finished)} className="finished" strokeWidth={fs * 0.1} />
      <g fontSize={fs * 0.8}>
        <rect x={W - fs * 9.5} y={fs * 0.4} width={fs * 0.8} height={fs * 0.8} className="model" />
        <text x={W - fs * 8.4} y={fs * 1.1}>модель</text>
        <rect x={W - fs * 9.5} y={fs * 1.6} width={fs * 0.8} height={fs * 0.8} className="finished" />
        <text x={W - fs * 8.4} y={fs * 2.3}>готовое</text>
      </g>
    </svg>
  );
}
