/**
 * Проверка построения тел (модули 2–3) на CSG-ядре manifold-3d.
 * Запуск: npx tsx scripts/test-build.ts  (входит в npm test, пишет STL в out/build/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createManifoldKernel } from "../src/core/geometry/manifoldKernel";
import { planMold, buildMold, DEFAULT_MOLD_PARAMS, KEY_CLEARANCE_MM } from "../src/core/mold";
import { buildCase, orientForPrint, estimateMoldSet, DEFAULT_CASE_PARAMS } from "../src/core/case";
import { analyzeMesh, profileVolume } from "../src/core/mesh/validate";
import { meshToBinarySTL } from "../src/core/mesh/stl";
import type { ProfilePoint } from "../src/core/types";

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}
const prof = (f: (z: number) => number, H: number, n = 200): ProfilePoint[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ z: (H * i) / n, r: f((H * i) / n) }));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

async function main() {
  const k = await createManifoldKernel();

  console.log("\n=== CSG-ядро ===");
  {
    const cube = k.box([-50, -50, 0], [50, 50, 100]);
    const cyl = k.cylinder(20, 20, -1, 101, 256);
    const v = k.volume(k.subtract(cube, cyl));
    const expect = 1e6 - Math.PI * 400 * 100;
    check("куб − цилиндр = аналитический объём", rel(v, expect) < 0.002, `${(v / 1000).toFixed(1)} см³, ожид. ${(expect / 1000).toFixed(1)}`);
    const vase = prof((z) => 42 + 20 * Math.sin((Math.PI * z) / 130), 200);
    const rv = k.volume(k.revolve(vase));
    check("revolve = объём профиля", rel(rv, profileVolume(vase)) < 0.002, `${(rv / 1000).toFixed(1)} см³`);
  }

  console.log("\n=== Модуль 2: части формы ===");
  {
    // Цилиндр r=40, h=100 без засора, замков и пазов → гипс = блок − полость
    const cyl = prof(() => 40, 100, 10);
    const params = {
      ...DEFAULT_MOLD_PARAMS,
      scheme: "two-sides-base" as const,
      spare: { heightMm: 0, flareDeg: 0, stepMm: 0 },
      straps: { ...DEFAULT_MOLD_PARAMS.straps, enabled: false },
    };
    const plan = planMold(cyl, { ...params });
    const bare = buildMold(k, { ...plan, keys: [] }, params);
    const W = 70;
    const expect = ((2 * W) ** 2 * 130 - Math.PI * 1600 * 100) / 1000;
    check("три части", bare.parts.length === 3, bare.parts.map((p) => p.id).join(", "));
    check("гипс = блок − полость (±0,5%)", rel(bare.plasterVolumeCm3, expect) < 0.005, `${bare.plasterVolumeCm3.toFixed(1)} см³, ожид. ${expect.toFixed(1)}`);
    const [a, b] = bare.parts.map((p) => k.volume(p.solid));
    check("боковины симметричны", rel(a, b) < 1e-3);

    const keyed = buildMold(k, plan, params);
    // замки: выступы прибавляют объём, гнёзда (больше на зазор) вычитают — итог чуть меньше
    check("с замками: гипса чуть меньше (гнёзда шире выступов)", keyed.plasterVolumeCm3 < bare.plasterVolumeCm3 && keyed.plasterVolumeCm3 > bare.plasterVolumeCm3 * 0.99,
      `${keyed.plasterVolumeCm3.toFixed(1)} см³, зазор ${KEY_CLEARANCE_MM} мм`);
    for (const p of keyed.parts) {
      const rep = analyzeMesh(k.toMesh(p.solid));
      check(`${p.label}: сетка замкнута`, rep.watertight, `${rep.triangles} треуг.`);
    }
  }

  console.log("\n=== Модули 2–3: ваза, форма и кожухи ===");
  mkdirSync("out/build", { recursive: true });
  {
    const scale = 1 / 0.88;
    const vase = prof((z) => (42 + 20 * Math.sin((Math.PI * z) / 130)) * scale, 150 * scale);
    const t0 = Date.now();
    const plan = planMold(vase, DEFAULT_MOLD_PARAMS);
    const mold = buildMold(k, plan, DEFAULT_MOLD_PARAMS);
    const est = estimateMoldSet(plan, DEFAULT_CASE_PARAMS);
    check("гипс: тела ≈ оценке без CSG (±2%)", rel(mold.plasterVolumeCm3, est.plasterCm3) < 0.02, `${mold.plasterVolumeCm3.toFixed(0)} / ${est.plasterCm3.toFixed(0)} см³`);
    for (const part of mold.parts) {
      writeFileSync(`out/build/mold-${part.id}.stl`, meshToBinarySTL(k.toMesh(part.solid), part.id));
      for (const wallPieces of [4, 2] as const) {
        const cs = buildCase(k, part, { ...DEFAULT_CASE_PARAMS, wallPieces });
        const pe = est.parts.find((p) => p.id === part.id)!;
        if (wallPieces === 4) {
          check(`${part.label}: силикон ≈ оценке (±5%)`, rel(cs.siliconeVolumeCm3, pe.siliconeCm3) < 0.05, `${cs.siliconeVolumeCm3.toFixed(0)} / ${pe.siliconeCm3.toFixed(0)} см³`);
        }
        for (const pp of cs.printParts) {
          const oriented = orientForPrint(k, pp.solid, pp.printDown);
          const mesh = k.toMesh(oriented);
          const rep = analyzeMesh(mesh);
          const bb = k.bbox(oriented);
          const size = bb.max.map((v, i) => (v - bb.min[i]).toFixed(0)).join("×");
          check(`${pp.id}: замкнута, на столе z=0`, rep.watertight && Math.abs(bb.min[2]) < 1e-3 && rep.volumeMm3 > 0, `${size} мм ×${pp.count}`);
          writeFileSync(`out/build/${pp.id.replace(/\//g, "_")}.stl`, meshToBinarySTL(mesh, pp.id));
        }
        if (wallPieces === 4 && cs.warnings.length) console.log("  предупреждения:", cs.warnings.join(" | "));
      }
    }
    console.log(`время построения: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
