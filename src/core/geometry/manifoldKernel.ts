import type { Mesh, ProfilePoint } from "../types";
import type { CsgKernel, Solid, Vec3 } from "./csg";

/**
 * Реализация CsgKernel на manifold-3d (WASM).
 *
 * Модуль грузится асинхронно, поэтому ядро создаётся один раз через createManifoldKernel()
 * и передаётся дальше. В Next.js вызывать только на клиенте (dynamic import / по кнопке).
 */

// Типы manifold-3d подключаем только как типы — сам модуль грузится динамически.
type ManifoldToplevel = Awaited<ReturnType<typeof import("manifold-3d")["default"]>>;
type Manifold = InstanceType<ManifoldToplevel["Manifold"]>;

let cached: Promise<CsgKernel> | null = null;

export function createManifoldKernel(): Promise<CsgKernel> {
  if (!cached) {
    cached = (async () => {
      const wasm = await (await import("manifold-3d")).default();
      wasm.setup();
      return wrap(wasm);
    })();
    cached.catch(() => (cached = null));
  }
  return cached;
}

/** Число сегментов окружности, при котором хорда отклоняется от дуги не больше tol, мм. */
export function segmentsFor(radius: number, tol = 0.05, min = 24, max = 360): number {
  if (radius <= tol) return min;
  const n = Math.ceil(Math.PI / Math.acos(1 - tol / radius));
  return Math.min(max, Math.max(min, n + (n % 4 === 0 ? 0 : 4 - (n % 4))));
}

function wrap(wasm: ManifoldToplevel): CsgKernel {
  const { Manifold, CrossSection, Mesh: WMesh } = wasm;
  const S = (m: Manifold) => m as unknown as Solid;
  const M = (s: Solid) => s as unknown as Manifold;

  const checked = (m: Manifold, what: string): Manifold => {
    const st = m.status();
    if (st !== "NoError") throw new Error(`CSG: ${what} — ${st}`);
    return m;
  };

  return {
    fromMesh(mesh: Mesh) {
      const wm = new WMesh({
        numProp: 3,
        vertProperties: new Float32Array(mesh.positions),
        triVerts: new Uint32Array(mesh.indices),
      });
      wm.merge();
      return S(checked(new Manifold(wm), "fromMesh"));
    },
    toMesh(s) {
      const m = M(s).getMesh();
      const numVert = m.vertProperties.length / m.numProp;
      const positions = new Float32Array(numVert * 3);
      for (let i = 0; i < numVert; i++) {
        positions[i * 3] = m.vertProperties[i * m.numProp];
        positions[i * 3 + 1] = m.vertProperties[i * m.numProp + 1];
        positions[i * 3 + 2] = m.vertProperties[i * m.numProp + 2];
      }
      return { positions, indices: new Uint32Array(m.triVerts) };
    },

    box(min: Vec3, max: Vec3) {
      const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      return S(Manifold.cube(size, false).translate(min));
    },
    cylinder(r0, r1, z0, z1, segments) {
      const n = segments ?? segmentsFor(Math.max(r0, r1));
      // manifold не допускает r0 = 0 — строим перевёрнутым
      if (r0 <= 0 && r1 > 0) return S(Manifold.cylinder(z1 - z0, r1, 0, n).mirror([0, 0, 1]).translate([0, 0, z1]));
      return S(Manifold.cylinder(z1 - z0, r0, r1, n).translate([0, 0, z0]));
    },
    revolve(profile: ProfilePoint[], segments?: number) {
      if (profile.length < 2) throw new Error("revolve: профиль пуст.");
      let maxR = 0;
      for (const p of profile) maxR = Math.max(maxR, p.r);
      // Замкнуть по оси: (0, z_низ) → профиль снизу вверх → (0, z_верх). Обход против часовой.
      const pts: [number, number][] = [[0, profile[0].z]];
      for (const p of profile) pts.push([Math.max(0, p.r), p.z]);
      pts.push([0, profile[profile.length - 1].z]);
      const cs = new CrossSection([pts], "Positive");
      const m = cs.revolve(segments ?? segmentsFor(maxR));
      cs.delete();
      return S(checked(m, "revolve"));
    },

    union(...solids) {
      if (solids.length === 0) throw new Error("union: пусто.");
      if (solids.length === 1) return solids[0];
      return S(Manifold.union(solids.map(M)));
    },
    subtract(a, ...b) {
      let r = M(a);
      for (const x of b) r = r.subtract(M(x));
      return S(r);
    },
    intersect(a, b) {
      return S(M(a).intersect(M(b)));
    },

    translate(s, v) {
      return S(M(s).translate(v));
    },
    rotate(s, deg) {
      return S(M(s).rotate(deg));
    },
    mirror(s, normal) {
      return S(M(s).mirror(normal));
    },
    splitByPlane(s, normal, offset) {
      const [a, b] = M(s).splitByPlane(normal, offset);
      return [S(a), S(b)];
    },

    volume(s) {
      return M(s).volume();
    },
    bbox(s) {
      const b = M(s).boundingBox();
      return { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] };
    },
    isEmpty(s) {
      return M(s).isEmpty();
    },
    dispose(...solids) {
      for (const s of solids) M(s).delete();
    },
  };
}
