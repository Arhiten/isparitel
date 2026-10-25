import type { Mesh, ProfilePoint } from "../types";

export interface RevolveOptions {
  /** Число сегментов по окружности. Не задано — считается из допуска хорды. */
  segments?: number;
  /** Максимальное отклонение хорды от окружности, мм. */
  chordToleranceMm?: number;
  /** Минимальный радиус (точки ближе к оси подтягиваются), мм. */
  minRadiusMm?: number;
}

export function segmentsForTolerance(maxR: number, tolMm: number): number {
  if (maxR <= tolMm) return 64;
  const s = Math.ceil(Math.PI / Math.acos(1 - tolMm / maxR));
  return Math.min(720, Math.max(64, s + (s % 2)));
}

/**
 * Профиль (r, z), упорядоченный по возрастанию z от дна к краю → замкнутое тело вращения
 * с плоским дном и плоской «крышкой» на уровне края. Нормали наружу, сетка «водонепроницаема».
 * Это сплошная мастер-модель (позитив) — именно её форма переносится в гипс.
 */
export function revolveProfile(profile: ProfilePoint[], opts: RevolveOptions = {}): Mesh {
  if (profile.length < 2) throw new Error("Профиль должен содержать минимум 2 точки.");
  const minR = opts.minRadiusMm ?? 0.05;
  const pts = profile.map((p) => ({ r: Math.max(minR, p.r), z: p.z }));
  let maxR = 0;
  for (const p of pts) if (p.r > maxR) maxR = p.r;
  const S = opts.segments ?? segmentsForTolerance(maxR, opts.chordToleranceMm ?? 0.05);
  const n = pts.length;

  const vCount = n * S + 2;
  const positions = new Float32Array(vCount * 3);
  const cos = new Float64Array(S);
  const sin = new Float64Array(S);
  for (let j = 0; j < S; j++) {
    const a = (2 * Math.PI * j) / S;
    cos[j] = Math.cos(a);
    sin[j] = Math.sin(a);
  }
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < S; j++) {
      const o = (k * S + j) * 3;
      positions[o] = pts[k].r * cos[j];
      positions[o + 1] = pts[k].r * sin[j];
      positions[o + 2] = pts[k].z;
    }
  }
  const B = n * S;
  const T = n * S + 1;
  positions.set([0, 0, pts[0].z], B * 3);
  positions.set([0, 0, pts[n - 1].z], T * 3);

  const triCount = 2 * S * (n - 1) + 2 * S;
  const indices = new Uint32Array(triCount * 3);
  let t = 0;
  const tri = (a: number, b: number, c: number) => {
    indices[t++] = a;
    indices[t++] = b;
    indices[t++] = c;
  };
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < S; j++) {
      const j1 = (j + 1) % S;
      const a = k * S + j;
      const b = k * S + j1;
      const c = (k + 1) * S + j1;
      const d = (k + 1) * S + j;
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  const top = (n - 1) * S;
  for (let j = 0; j < S; j++) {
    const j1 = (j + 1) % S;
    tri(B, j1, j); // дно, нормаль −Z
    tri(T, top + j, top + j1); // верх, нормаль +Z
  }
  return { positions, indices };
}
