// Гнутая обшивка подлокотников: тонкая фанера (4 мм) гнётся по контуру рёбер и прибивается к ним степлером.
// В модели такой лист задан плоской развёрткой (так он режется), а на 3D-модели показывается согнутым:
// он огибает контур ребра там, где кончаются плоские листы обшивки, на свою развёрнутую длину.
// Только для показа — раскрой и закуп считаются по плоской развёртке.

import type { AppState, Material, Part, Pt } from "./frame/model";

const BENT = /гнут/i;
const group = (p: Part) => p.name.split(":")[0].trim();

type XZ = [number, number];

/** Контур ребра в координатах сборки (X — вдоль дивана, Z — вверх). */
function ribOutline(rib: Part): XZ[] {
  const outer = rib.shape?.outer ?? [[0, 0], [rib.a, 0], [rib.a, rib.b], [0, rib.b]];
  return outer.map(([x, y]: Pt): XZ => [rib.x + (rib.flip ? rib.a - x : x), rib.z + y]);
}

/** Прилегает ли точка контура ребра к плоскому листу обшивки (с допуском на толщину листа). */
function onFlat([X, Z]: XZ, flat: Part, t: number) {
  const tol = t + 1.5;
  if (flat.plane === "yz") return (Math.abs(X - flat.x) <= tol || Math.abs(X - (flat.x + t)) <= tol) && Z >= flat.z - tol && Z <= flat.z + flat.b + tol;
  if (flat.plane === "xy") return (Math.abs(Z - flat.z) <= tol || Math.abs(Z - (flat.z + t)) <= tol) && X >= flat.x - tol && X <= flat.x + flat.a + tol;
  return false;
}

/**
 * Участок контура длиной len от точки start (индекс вершины) вперёд по обходу; возвращает точки и место, где он кончился.
 * На участке, закрытом плоским листом, лист останавливается: запас развёртки уходит в нахлёст, а не на соседний лист.
 */
function walk(ring: XZ[], start: { i: number; p: XZ }, len: number, covered: boolean[]) {
  const pts: XZ[] = [start.p];
  let left = len, i = start.i, p = start.p;
  for (let guard = 0; guard < ring.length * 2 && left > 1e-6; guard++) {
    if (covered[i]) break;
    const q = ring[(i + 1) % ring.length];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d >= left) {
      const k = left / d;
      p = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
      pts.push(p);
      return { pts, end: { i, p } };
    }
    left -= d;
    pts.push(q);
    p = q;
    i = (i + 1) % ring.length;
  }
  return { pts, end: { i, p } };
}

/** Полоса толщиной t снаружи пути по контуру (по внешней нормали многоугольника ребра). */
function band(path: XZ[], ring: XZ[], t: number): XZ[] {
  let area = 0;
  for (let i = 0; i < ring.length; i++) area += ring[i][0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * ring[i][1];
  const out = area > 0 ? 1 : -1;
  const normal = (a: XZ, b: XZ): XZ => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [(out * dz) / l, (-out * dx) / l];
  };
  const offset = path.map((p, i) => {
    const n1 = i > 0 ? normal(path[i - 1], p) : null, n2 = i < path.length - 1 ? normal(p, path[i + 1]) : null;
    let nx = (n1?.[0] ?? 0) + (n2?.[0] ?? 0), nz = (n1?.[1] ?? 0) + (n2?.[1] ?? 0);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    // На изломе полоса сохраняет толщину: сдвиг делится на косинус половины угла.
    const ref = n1 ?? n2!, cos = Math.max(0.3, nx * ref[0] + nz * ref[1]);
    return [p[0] + (nx * t) / cos, p[1] + (nz * t) / cos] as XZ;
  });
  return [...path, ...offset.reverse()];
}

/**
 * Модель для показа: гнутые листы обшивки заменяются деталью, повторяющей контур рёбер.
 * Лист вытягивается вдоль дивана (Y) на свою длину; его профиль в плоскости X–Z — полоса по контуру ребра.
 */
export function bendSkins(state: AppState): AppState {
  const materials: Material[] = [...state.materials];
  const parts = state.parts.map((p) => p);
  const groups = new Set(state.parts.filter((p) => BENT.test(p.name)).map(group));
  for (const g of groups) {
    const rib = state.parts.find((p) => group(p) === g && /ребро/i.test(p.name) && p.plane === "xz");
    if (!rib) continue;
    const skins = state.parts.filter((p) => group(p) === g && /обшивк/i.test(p.name));
    const bent = skins.filter((p) => BENT.test(p.name)), flats = skins.filter((p) => !BENT.test(p.name));
    const ring = ribOutline(rib);
    const t = state.materials.find((m) => m.id === bent[0].materialId)?.thickness ?? 4;
    // Начало гнутой обшивки — первая точка контура после участка, закрытого плоскими листами.
    const covered = ring.map((p, i) => flats.some((f) => onFlat(p, f, t) && onFlat(ring[(i + 1) % ring.length], f, t)));
    const k = covered.findIndex((c, i) => c && !covered[(i + 1) % ring.length]);
    if (k < 0) continue;
    let at = { i: (k + 1) % ring.length, p: ring[(k + 1) % ring.length] };
    for (const skin of bent) {
      const developed = Math.min(skin.a, skin.b), length = Math.max(skin.a, skin.b);
      const { pts, end } = walk(ring, at, developed, covered);
      at = end;
      const outline = band(pts, ring, t);
      const xs = outline.map((p) => p[0]), zs = outline.map((p) => p[1]);
      const x0 = Math.min(...xs), z0 = Math.min(...zs);
      // Деталь «стоит вдоль дивана» (xz): её толщина по Y — длина листа, поэтому для показа нужен свой материал с такой толщиной.
      const mat = state.materials.find((m) => m.id === skin.materialId)!;
      const id = `${mat.id}#bent${length}`;
      if (!materials.some((m) => m.id === id)) materials.push({ ...mat, id, thickness: length });
      const shaped: Part = {
        ...skin,
        materialId: id,
        plane: "xz",
        tilt: 0,
        flip: false,
        hidden: false,
        x: x0,
        z: z0,
        a: Math.max(...xs) - x0,
        b: Math.max(...zs) - z0,
        shape: { outer: outline.map(([x, z]): Pt => [x - x0, z - z0]), cutouts: [], pockets: [], drills: [] },
      };
      parts[parts.indexOf(skin)] = shaped;
    }
  }
  return { ...state, materials, parts };
}
