import type { CsgKernel, Solid, Vec3 } from "../geometry/csg";
import type { MoldDesign, MoldParams, MoldPart, MoldPlan } from "./types";

/** Зазор между выступом замка и гнездом, мм. */
export const KEY_CLEARANCE_MM = 0.3;
/** Перекрытие тел, чтобы булевы операции не работали с совпадающими гранями, мм. */
const EPS = 0.5;

/**
 * Построение частей гипсовой формы по плану (нужно CSG-ядро).
 *
 *  1. cavity = изделие + засор (засор продлён над верхом блока — заливочное отверстие).
 *  2. mold = блок − полость − пазы под резинки.
 *  3. Схема «две боковины + дно»: разрез по z = baseSplitZ, затем верх — по x = 0.
 *     Боковина A — x < 0, боковина B — x > 0.
 *  4. Замки: на плоскости x = 0 выступ на боковине A, гнездо в B;
 *     на плоскости z = 0 выступ на дне, гнездо в боковине по знаку x.
 *
 * Скругление наружных кромок (params.outerFilletMm) пока не делается — кромки зачищают после заливки.
 */
export function buildMold(kernel: CsgKernel, plan: MoldPlan, params: MoldParams): MoldDesign {
  const k = kernel;
  const { halfWidth: W, zMin, zMax, shape } = plan.block;

  const prof = plan.cavityProfile.map((p) => ({ ...p }));
  const top = prof[prof.length - 1];
  prof.push({ r: top.r, z: top.z + EPS * 4 });
  const cavity = k.revolve(prof);
  const cavityVolume = k.volume(cavity) - Math.PI * top.r * top.r * EPS * 4;

  const block = shape === "box" ? k.box([-W, -W, zMin], [W, W, zMax]) : k.cylinder(W, W, zMin, zMax);
  let mold = k.subtract(block, cavity);
  k.dispose(block);

  if (params.straps.enabled && plan.strapZ.length) {
    const { widthMm: gw, depthMm: gd } = params.straps;
    const rings: Solid[] = [];
    for (const z of plan.strapZ) {
      const z0 = z - gw / 2, z1 = z + gw / 2;
      if (shape === "box") {
        // Только на гранях ±Y: тыльные грани боковин (±X) должны остаться плоскими —
        // это свободная поверхность при заливке гипса в силиконовый кейс.
        for (const s of [-1, 1]) {
          const y0 = s > 0 ? W - gd : -W - EPS;
          const y1 = s > 0 ? W + EPS : -W + gd;
          rings.push(k.box([-W - EPS, y0, z0], [W + EPS, y1, z1]));
        }
      } else {
        const outer = k.cylinder(W + EPS, W + EPS, z0, z1);
        const inner = k.cylinder(W - gd, W - gd, z0 - EPS, z1 + EPS);
        rings.push(k.subtract(outer, inner));
        k.dispose(outer, inner);
      }
    }
    const next = k.subtract(mold, ...rings);
    k.dispose(mold, ...rings);
    mold = next;
  }

  let parts: MoldPart[];
  if (plan.scheme === "one-piece") {
    parts = [{ id: "whole", label: "Форма целиком", solid: mold, pullDir: [0, 0, 1], backNormal: [0, 0, -1] }];
  } else {
    const splitZ = plan.baseSplitZ ?? 0;
    const [upper, base0] = k.splitByPlane(mold, [0, 0, 1], splitZ);
    const [sideB0, sideA0] = k.splitByPlane(upper, [1, 0, 0], 0);
    k.dispose(mold, upper);

    const addTo: Record<"side-a" | "side-b" | "base", Solid[]> = { "side-a": [], "side-b": [], base: [] };
    const cutFrom: Record<"side-a" | "side-b" | "base", Solid[]> = { "side-a": [], "side-b": [], base: [] };
    const { shape: keyShape } = params.keys;
    for (const key of plan.keys) {
      const male = keySolid(k, key.center, key.normal, key.diameterMm / 2, key.depthMm, 0, keyShape);
      const female = keySolid(k, key.center, key.normal, key.diameterMm / 2, key.depthMm, KEY_CLEARANCE_MM, keyShape);
      if (key.normal[0] === 1) {
        addTo["side-a"].push(male);
        cutFrom["side-b"].push(female);
      } else {
        addTo.base.push(male);
        cutFrom[key.center[0] < 0 ? "side-a" : "side-b"].push(female);
      }
    }
    const finish = (s: Solid, id: "side-a" | "side-b" | "base") => {
      let r = s;
      if (addTo[id].length) {
        const n = k.union(r, ...addTo[id]);
        k.dispose(r, ...addTo[id]);
        r = n;
      }
      if (cutFrom[id].length) {
        const n = k.subtract(r, ...cutFrom[id]);
        k.dispose(r, ...cutFrom[id]);
        r = n;
      }
      return r;
    };
    parts = [
      { id: "side-a", label: "Боковина A", solid: finish(sideA0, "side-a"), pullDir: [-1, 0, 0], backNormal: [-1, 0, 0] },
      { id: "side-b", label: "Боковина B", solid: finish(sideB0, "side-b"), pullDir: [1, 0, 0], backNormal: [1, 0, 0] },
      { id: "base", label: "Дно", solid: finish(base0, "base"), pullDir: [0, 0, -1], backNormal: [0, 0, -1] },
    ];
  }
  k.dispose(cavity);

  for (const p of parts) {
    if (k.isEmpty(p.solid) || k.volume(p.solid) <= 0) throw new Error(`Часть формы «${p.label}» получилась пустой.`);
  }

  return {
    plan,
    parts,
    plasterVolumeCm3: parts.reduce((a, p) => a + k.volume(p.solid), 0) / 1000,
    cavityVolumeCm3: cavityVolume / 1000,
  };
}

/**
 * Замок: усечённый конус (или «купол» из двух конусов) с основанием на плоскости разъёма,
 * выступает по normal. clearance > 0 — гнездо: замок, раздутый на зазор.
 * Основание уходит на EPS за плоскость, чтобы тело надёжно сливалось с частью.
 */
function keySolid(k: CsgKernel, center: Vec3, normal: Vec3, r: number, depth: number, clearance: number, shape: "cone" | "hemisphere"): Solid {
  const R = r + clearance;
  const h = depth + clearance;
  let s: Solid;
  if (shape === "cone") {
    s = k.cylinder(R, Math.max(0.5, R * 0.45), -EPS, h);
  } else {
    // полусфера ≈ два усечённых конуса — без поднутрений, проще для печати
    const a = k.cylinder(R, R * 0.8, -EPS, h * 0.5);
    const b = k.cylinder(R * 0.8, Math.max(0.5, R * 0.3), h * 0.5 - 0.01, h);
    s = k.union(a, b);
  }
  let rot: Vec3 | null = null;
  if (normal[0] === 1) rot = [0, 90, 0];
  else if (normal[0] === -1) rot = [0, -90, 0];
  else if (normal[1] === 1) rot = [-90, 0, 0];
  else if (normal[1] === -1) rot = [90, 0, 0];
  else if (normal[2] === -1) rot = [180, 0, 0];
  if (rot) s = k.rotate(s, rot);
  return k.translate(s, center);
}
