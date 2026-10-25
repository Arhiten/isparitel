import type { ProfilePoint } from "../types";
import type { SilhouetteResult } from "../image/silhouette";

/**
 * Силуэт (пиксели) → профиль тела вращения (мм).
 *
 * Для каждой строки силуэта берём левую и правую границу. Ось вращения — медиана
 * центров строк в средней части изделия. Радиус по умолчанию — половина ширины строки
 * (усредняет левую и правую стороны и гасит небольшой наклон камеры).
 */

export type ProfileSide = "average" | "left" | "right";

export interface PixelRow {
  y: number;
  left: number;
  right: number;
}

export interface PixelProfile {
  rows: PixelRow[];
  axisX: number;
  topY: number;
  bottomY: number;
  /** Радиус в пикселях для каждой строки сверху вниз (после интерполяции пропусков). */
  radiusPx: Float64Array;
  /** Насколько изделие несимметрично: среднее |левый − правый радиус| / макс. радиус. */
  asymmetry: number;
}

export function measureRows(sil: SilhouetteResult, side: ProfileSide = "average"): PixelProfile {
  const { mask, width: w, bbox } = sil;
  const rows: PixelRow[] = [];
  for (let y = bbox.y0; y <= bbox.y1; y++) {
    let left = -1;
    let right = -1;
    const off = y * w;
    for (let x = bbox.x0; x <= bbox.x1; x++) if (mask[off + x]) { left = x; break; }
    for (let x = bbox.x1; x >= bbox.x0; x--) if (mask[off + x]) { right = x; break; }
    if (left >= 0) rows.push({ y, left, right });
  }
  if (rows.length < 10) throw new Error("Силуэт слишком маленький: изделие должно занимать большую часть кадра.");

  // Ось: медиана центров по средним 80% высоты (дно и край часто искажены тенью/перспективой)
  const a = Math.floor(rows.length * 0.1);
  const b = Math.max(a + 1, Math.ceil(rows.length * 0.9));
  const centers = rows.slice(a, b).map((r) => (r.left + r.right + 1) / 2).sort((p, q) => p - q);
  const axisX = centers[Math.floor(centers.length / 2)];

  const topY = bbox.y0;
  const bottomY = bbox.y1;
  const n = bottomY - topY + 1;
  const radiusPx = new Float64Array(n).fill(NaN);
  let asymSum = 0;
  let maxR = 0;
  for (const r of rows) {
    const rl = axisX - r.left;
    const rr = r.right + 1 - axisX;
    const rad = side === "left" ? rl : side === "right" ? rr : (r.right + 1 - r.left) / 2;
    radiusPx[r.y - topY] = Math.max(0, rad);
    asymSum += Math.abs(rl - rr);
    if (rad > maxR) maxR = rad;
  }
  // Пропуски строк (если силуэт где-то разорван) — линейная интерполяция
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(radiusPx[i])) {
      if (last >= 0 && i - last > 1) {
        for (let k = last + 1; k < i; k++) {
          const t = (k - last) / (i - last);
          radiusPx[k] = radiusPx[last] * (1 - t) + radiusPx[i] * t;
        }
      }
      last = i;
    }
  }
  return { rows, axisX, topY, bottomY, radiusPx, asymmetry: asymSum / rows.length / (maxR || 1) };
}

export interface ScaleOptions {
  /** Габаритная высота изделия, мм (готового, после обжига). Обязательна. */
  heightMm: number;
  /** Максимальный диаметр, мм. Если задан — радиальный масштаб считается по нему (компенсирует перспективу). */
  maxDiameterMm?: number;
  /** Окно сглаживания в строках пикселей (нечётное). 1 — без сглаживания. */
  smoothing?: number;
  /** Шаг профиля по высоте, мм. */
  stepMm?: number;
}

export interface Profile {
  points: ProfilePoint[];
  heightMm: number;
  maxDiameterMm: number;
  rimDiameterMm: number;
  baseDiameterMm: number;
  scaleZ: number;
  scaleR: number;
  warnings: string[];
}

function movingAverage(src: Float64Array, win: number): Float64Array {
  if (win <= 1) return Float64Array.from(src);
  const half = Math.floor(win / 2);
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let s = 0;
    let c = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < src.length) { s += src[k]; c++; }
    }
    out[i] = s / c;
  }
  return out;
}

export function scaleProfile(px: PixelProfile, opts: ScaleOptions): Profile {
  const warnings: string[] = [];
  const nRows = px.radiusPx.length;
  const scaleZ = opts.heightMm / nRows;
  const smoothed = movingAverage(px.radiusPx, opts.smoothing ?? 3);
  let maxRpx = 0;
  for (const r of smoothed) if (r > maxRpx) maxRpx = r;

  let scaleR = scaleZ;
  if (opts.maxDiameterMm && opts.maxDiameterMm > 0) {
    scaleR = opts.maxDiameterMm / 2 / maxRpx;
    const diff = Math.abs(scaleR - scaleZ) / scaleZ;
    if (diff > 0.03) {
      warnings.push(
        `Пропорции фото расходятся с введёнными размерами на ${(diff * 100).toFixed(1)}%. ` +
          `Возможна перспектива (снимайте издалека с зумом) или ошибка в размерах. Радиусы отмасштабированы по диаметру.`,
      );
    }
  }
  if (px.asymmetry > 0.04) {
    warnings.push(
      `Силуэт несимметричен (≈${(px.asymmetry * 100).toFixed(0)}% от радиуса). Проверьте, что фото строго сбоку и изделие — тело вращения.`,
    );
  }

  // Строка i (сверху вниз) имеет центр на высоте z = (nRows - i - 0.5) * scaleZ
  const radiusAtZ = (z: number): number => {
    const fi = nRows - 0.5 - z / scaleZ; // дробный индекс строки
    if (fi <= 0) return smoothed[0] * scaleR;
    if (fi >= nRows - 1) return smoothed[nRows - 1] * scaleR;
    const i0 = Math.floor(fi);
    const t = fi - i0;
    return (smoothed[i0] * (1 - t) + smoothed[i0 + 1] * t) * scaleR;
  };

  const step = opts.stepMm ?? 0.5;
  const H = opts.heightMm;
  const count = Math.max(2, Math.ceil(H / step) + 1);
  const points: ProfilePoint[] = [];
  for (let k = 0; k < count; k++) {
    const z = Math.min(H, k * step);
    points.push({ r: radiusAtZ(z), z });
  }
  if (points[points.length - 1].z < H) points.push({ r: radiusAtZ(H), z: H });

  let maxR = 0;
  for (const p of points) if (p.r > maxR) maxR = p.r;
  return {
    points,
    heightMm: H,
    maxDiameterMm: maxR * 2,
    rimDiameterMm: points[points.length - 1].r * 2,
    baseDiameterMm: points[0].r * 2,
    scaleZ,
    scaleR,
    warnings,
  };
}
