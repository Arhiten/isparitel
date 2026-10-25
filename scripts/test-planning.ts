/**
 * Проверка «плановых» частей модулей 2, 4, 5 (без CSG).
 * Запуск: npx tsx scripts/test-planning.ts  (входит в npm test)
 */
import { addSpare, analyzeUndercuts, planMold, DEFAULT_MOLD_PARAMS } from "../src/core/mold";
import { fitOnBed, calibrationFactor } from "../src/core/print";
import { estimateMoldSet, DEFAULT_CASE_PARAMS } from "../src/core/case";
import { plasterForVolume, siliconeForVolume, slipPerCast, profileSurfaceArea } from "../src/core/materials";
import { DEFAULT_CLAY, DEFAULT_PLASTER, DEFAULT_PRINTER, DEFAULT_SILICONE } from "../src/core/settings/profiles";
import { profileVolume } from "../src/core/mesh/validate";
import type { ProfilePoint } from "../src/core/types";

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}
const prof = (f: (z: number) => number, H: number, n = 200): ProfilePoint[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ z: (H * i) / n, r: f((H * i) / n) }));

console.log("\n=== Модуль 2: план формы ===");
// Пиала: расширяется кверху → цельная форма
const bowl = prof((z) => 30 + z * 0.6, 60);
const bowlPlan = planMold(bowl, DEFAULT_MOLD_PARAMS);
check("пиала → цельная форма", bowlPlan.scheme === "one-piece", bowlPlan.scheme);
check("у цельной формы нет замков", bowlPlan.keys.length === 0);

// Ваза с горлом → поднутрение → две боковины + дно
const vase = prof((z) => 42 + 20 * Math.sin((Math.PI * z) / 130), 200);
const uc = analyzeUndercuts(vase);
check("ваза: найдено поднутрение", !uc.pullUpFree, `зоны ${uc.undercutZones.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)}`).join(", ")} мм`);
check("ваза: поднутрение начинается сразу над пузом (z=65)", Math.abs(uc.undercutZones[0][0] - 65) < 8 /* допуск EPS_R=0.25 мм набирается за ~6.5 мм над пузом */, `${uc.undercutZones[0][0].toFixed(1)} мм`);
// Медленное сужение на мелком шаге: каждый шаг меньше допуска, но в сумме — поднутрение 3 мм
const slowNeck = prof((z) => 50 - z * 0.03, 100, 1000);
check("медленное сужение тоже поднутрение", !analyzeUndercuts(slowNeck).pullUpFree);
const straight = prof(() => 40, 100);
check("цилиндр без уклона: не поднутрение, но мало уклона", analyzeUndercuts(straight).pullUpFree && analyzeUndercuts(straight).lowDraftZones.length > 0);
const vasePlan = planMold(vase, DEFAULT_MOLD_PARAMS);
check("ваза → две боковины + дно", vasePlan.scheme === "two-sides-base");
check("замки: 4 на боковинах + 4 на дне", vasePlan.keys.length === 8);
check("пазы под резинки", vasePlan.strapZ.length === 2);

// Засор
const spared = addSpare(vase, DEFAULT_MOLD_PARAMS.spare);
const top = spared[spared.length - 1];
check("засор: высота", Math.abs(top.z - 230) < 1e-9, `${top.z} мм`);
check("засор не создаёт поднутрения", analyzeUndercuts(spared.slice(vase.length - 1)).pullUpFree);
const rim = vase[vase.length - 1].r;
check("засор: ступенька и раскрытие", top.r > rim + 2, `край r=${rim.toFixed(1)}, верх засора r=${top.r.toFixed(1)}`);
check("блок: стенка гипса", Math.abs(vasePlan.block.halfWidth - (62 + 30)) < 0.5, `полуширина ${vasePlan.block.halfWidth.toFixed(1)} мм`);
console.log("предупреждения:", vasePlan.warnings.length ? vasePlan.warnings : "нет");

// Узкое горло
const bottle = prof((z) => (z < 120 ? 40 : Math.max(6, 40 - (z - 120) * 1.5)), 160);
const bottlePlan = planMold(bottle, DEFAULT_MOLD_PARAMS);
check("бутылка: предупреждение про горло", bottlePlan.warnings.some((w) => w.includes("Горло")));

console.log("\n=== Модуль 3: оценка кейсов ===");
{
  // Цилиндр r=40, h=100 без засора → объём гипса проверяется аналитически
  const cylP = prof(() => 40, 100, 10);
  const params = { ...DEFAULT_MOLD_PARAMS, scheme: "two-sides-base" as const, spare: { heightMm: 0, flareDeg: 0, stepMm: 0 } };
  const plan = planMold(cylP, params);
  const est = estimateMoldSet(plan, DEFAULT_CASE_PARAMS);
  const W = 70;
  const expectPlaster = ((2 * W) ** 2 * (100 + 30) - Math.PI * 1600 * 100) / 1000;
  check("три части: 2 боковины + дно", est.parts.length === 3);
  check("гипс = блок − полость", Math.abs(est.plasterCm3 - expectPlaster) < 0.01, `${est.plasterCm3.toFixed(0)} см³`);
  const side = est.parts[0];
  // боковина A несёт выступы замков — блок выше на их высоту
  const inner = (140 + 20) * (100 + 20) * (70 + plan.keys[0].depthMm + 10);
  check("силикон боковины = кожух − блок", Math.abs(side.siliconeCm3 * 1000 - (inner - side.plasterCm3 * 1000)) < 1, `${side.siliconeCm3.toFixed(0)} см³`);
}

console.log("\n=== Модуль 4: стол принтера ===");
const f1 = fitOnBed([200, 120, 240], DEFAULT_PRINTER);
check("200×120×240 влезает на 256³", f1.fits);
const f2 = fitOnBed([300, 184, 260], DEFAULT_PRINTER);
check("300×184×260 не влезает, нужны секции", !f2.fits, `секции ${f2.sections.join("×")}`);
check("калибровка: 100 → 99.5", Math.abs(calibrationFactor(100, 99.5) - 1.005025) < 1e-5);

console.log("\n=== Модуль 5: материалы ===");
const pl = plasterForVolume(1000, DEFAULT_PLASTER, 0);
check("гипс 1 л при консистенции 70 ≈ 920 г", Math.abs(pl.plasterG - 922) < 5, `${pl.plasterG.toFixed(0)} г гипса + ${pl.waterG.toFixed(0)} г воды`);
const si = siliconeForVolume(500, DEFAULT_SILICONE, 1);
check("силикон 500 см³ +10%", Math.abs(si.totalG - 605) < 0.01, `${si.totalG.toFixed(0)} г (A ${si.partAG.toFixed(0)} / B ${si.partBG.toFixed(0)})`);
const cyl = prof(() => 50, 100, 10);
check("площадь цилиндра r50 h100", Math.abs(profileSurfaceArea(cyl) - (Math.PI * 2500 + 2 * Math.PI * 50 * 100)) < 1e-6);
const cav = profileVolume(addSpare(vase, DEFAULT_MOLD_PARAMS.spare)) / 1000;
const slip = slipPerCast(cav, vase, 4, DEFAULT_CLAY);
check("шликер: залить > остаётся", slip.fillMl > slip.retainedMl, `залить ${(slip.fillMl / 1000).toFixed(2)} л, в стенке ≈ ${slip.retainedMl.toFixed(0)} мл`);
