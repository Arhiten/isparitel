import type { Mesh, ProfilePoint } from "../types";

export interface MeshReport {
  triangles: number;
  vertices: number;
  /** Каждое ребро принадлежит ровно двум треугольникам с противоположным обходом. */
  watertight: boolean;
  badEdges: number;
  volumeMm3: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

export function analyzeMesh(mesh: Mesh): MeshReport {
  const { positions: P, indices: I } = mesh;
  const directed = new Map<string, number>();
  let vol = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = `${u}_${v}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let bad = 0;
  for (const [key, count] of directed) {
    const [u, v] = key.split("_");
    if (count !== 1 || directed.get(`${v}_${u}`) !== 1) bad++;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (P[i + k] < min[k]) min[k] = P[i + k];
      if (P[i + k] > max[k]) max[k] = P[i + k];
    }
  }
  return { triangles: I.length / 3, vertices: P.length / 3, watertight: bad === 0, badEdges: bad, volumeMm3: vol, bbox: { min, max } };
}

/** Точный объём тела вращения по профилю (сумма усечённых конусов), мм³. */
export function profileVolume(points: ProfilePoint[]): number {
  let v = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const r1 = points[i].r, r2 = points[i + 1].r;
    const h = points[i + 1].z - points[i].z;
    v += (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
  }
  return v;
}
