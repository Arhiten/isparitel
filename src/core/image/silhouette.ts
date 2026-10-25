import type { BBox, ImageLike } from "../types";

/**
 * Выделение силуэта изделия на фото.
 *
 * Требования к фото (их стоит показывать пользователю):
 *  - строго сбоку, камера на уровне середины изделия, как можно дальше (зум) — меньше перспективы;
 *  - однотонный контрастный фон, без тени на фоне за изделием;
 *  - изделие целиком в кадре.
 * PNG с прозрачным фоном тоже подходит — тогда маска берётся по альфа-каналу.
 */

export interface SilhouetteOptions {
  /** Порог яркости 0..255. Не задан — подбирается автоматически (метод Оцу). */
  threshold?: number;
  /** Принудительно считать изделие светлым на тёмном фоне (или наоборот). Не задано — определяется по краям кадра. */
  objectIsDark?: boolean;
  /** Заливать «дырки» внутри силуэта (блики, рисунок на глазури). По умолчанию true. */
  fillHoles?: boolean;
}

export interface SilhouetteResult {
  width: number;
  height: number;
  /** 1 — изделие, 0 — фон. */
  mask: Uint8Array;
  threshold: number;
  objectIsDark: boolean;
  usedAlpha: boolean;
  area: number;
  bbox: BBox;
}

export function toGray(img: ImageLike): Uint8Array {
  const n = img.width * img.height;
  const g = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
  }
  return g;
}

/** Порог Оцу по гистограмме яркости. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

function hasTransparentBorder(img: ImageLike): boolean {
  const { width: w, height: h, data } = img;
  let transparent = 0;
  let count = 0;
  const check = (x: number, y: number) => {
    count++;
    if (data[(y * w + x) * 4 + 3] < 128) transparent++;
  };
  for (let x = 0; x < w; x++) {
    check(x, 0);
    check(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    check(0, y);
    check(w - 1, y);
  }
  return transparent / count > 0.5;
}

function borderMean(gray: Uint8Array, w: number, h: number): number {
  let s = 0;
  let n = 0;
  for (let x = 0; x < w; x++) {
    s += gray[x] + gray[(h - 1) * w + x];
    n += 2;
  }
  for (let y = 0; y < h; y++) {
    s += gray[y * w] + gray[y * w + w - 1];
    n += 2;
  }
  return s / n;
}

/** Оставляет только самую большую связную область (4-связность). Возвращает её площадь. */
function keepLargestComponent(mask: Uint8Array, w: number, h: number): number {
  const labels = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let label = 0;
  let bestLabel = 0;
  let bestSize = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    label++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = label; queue[tail++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = label; queue[tail++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = label; queue[tail++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = label; queue[tail++] = p + w; }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = label;
    }
  }
  for (let i = 0; i < mask.length; i++) mask[i] = labels[i] === bestLabel && bestLabel > 0 ? 1 : 0;
  return bestSize;
}

/** Заливает области фона, не связанные с краем кадра (блики, рисунок внутри силуэта). */
function fillHolesInPlace(mask: Uint8Array, w: number, h: number): void {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  const seed = (p: number) => {
    if (!mask[p] && !outside[p]) {
      outside[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  let head = 0;
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  for (let i = 0; i < mask.length; i++) if (!outside[i]) mask[i] = 1;
}

export function extractSilhouette(img: ImageLike, opts: SilhouetteOptions = {}): SilhouetteResult {
  const { width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  let threshold = opts.threshold ?? -1;
  let objectIsDark = true;
  let usedAlpha = false;

  if (opts.threshold === undefined && hasTransparentBorder(img)) {
    usedAlpha = true;
    threshold = 128;
    for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    const gray = toGray(img);
    if (threshold < 0) threshold = otsuThreshold(gray);
    objectIsDark = opts.objectIsDark ?? borderMean(gray, w, h) > threshold;
    for (let i = 0; i < mask.length; i++) {
      mask[i] = objectIsDark ? (gray[i] <= threshold ? 1 : 0) : gray[i] > threshold ? 1 : 0;
    }
  }

  let area = keepLargestComponent(mask, w, h);
  if (opts.fillHoles !== false) {
    fillHolesInPlace(mask, w, h);
    area = 0;
    for (let i = 0; i < mask.length; i++) area += mask[i];
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("Не удалось найти изделие на фото: проверьте контраст фона или задайте порог вручную.");

  return { width: w, height: h, mask, threshold, objectIsDark, usedAlpha, area, bbox: { x0, y0, x1, y1 } };
}
