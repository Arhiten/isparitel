/**
 * Проверка модуля 1 на синтетическом «фото» вазы с известной геометрией.
 * Запуск: npm test   (файлы пишутся в папку out/)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { photoToSolid } from "../src/core/pipeline";
import { profileVolume } from "../src/core/mesh/validate";
import type { ImageLike } from "../src/core/types";

const H = 200; // мм, высота готовой вазы
const trueR = (z: number) => 42 + 20 * Math.sin((Math.PI * z) / 130); // мм
const PX_PER_MM = 4;

function makePhoto(opts: { dark: boolean; noise: number }): ImageLike {
  const w = 700, h = 1000;
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = 351.3; // ось не по центру пикселя — проверка субпиксельности
  const bottom = 900;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  for (let y = 0; y < h; y++) {
    const bg = (opts.dark ? 235 : 30) - (y / h) * 25; // градиент фона
    for (let x = 0; x < w; x++) {
      // Покрытие пикселя силуэтом: суперсэмплинг 4×4
      let cov = 0;
      for (let sy = 0; sy < 4; sy++) {
        const z = (bottom - (y + (sy + 0.5) / 4)) / PX_PER_MM;
        if (z < 0 || z > H) continue;
        const r = trueR(z) * PX_PER_MM;
        for (let sx = 0; sx < 4; sx++) if (Math.abs(x + (sx + 0.5) / 4 - cx) <= r) cov++;
      }
      cov /= 16;
      let fg = opts.dark ? 70 : 200;
      // блик на глазури — светлое пятно внутри силуэта
      if (opts.dark && (x - 300) ** 2 / 400 + (y - 600) ** 2 / 6000 < 1) fg = 250;
      const v = bg * (1 - cov) + fg * cov + rnd() * opts.noise;
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "✔" : "✘"} ${name}: ${detail}`);
  if (!ok) process.exitCode = 1;
}

mkdirSync("out", { recursive: true });

for (const variant of [
  { label: "тёмная ваза на светлом фоне, блик, шум", dark: true, noise: 12 },
  { label: "светлая ваза на тёмном фоне", dark: false, noise: 6 },
]) {
  console.log(`\n=== ${variant.label} ===`);
  const img = makePhoto(variant);
  const res = photoToSolid(img, { heightMm: H, maxDiameterMm: 124, clayShrinkPct: 12, name: "test-vase" });

  let maxErr = 0;
  for (const p of res.finishedProfile.points) {
    if (p.z < 1 || p.z > H - 1) continue; // торцы сглажены — допуск отдельно
    maxErr = Math.max(maxErr, Math.abs(p.r - trueR(p.z)));
  }
  check("точность профиля", maxErr < 0.4, `макс. ошибка радиуса ${maxErr.toFixed(3)} мм`);

  const k = 1 / 0.88;
  check("масштаб усадки", Math.abs(res.scale - k) < 1e-9, `×${res.scale.toFixed(5)}`);
  check("высота модели", Math.abs(res.report.bbox.max[2] - H * k) < 1e-3, `${res.report.bbox.max[2].toFixed(2)} мм`);
  check("замкнутость сетки", res.report.watertight, `${res.report.triangles} треуг., плохих рёбер ${res.report.badEdges}`);

  const trueVol = profileVolume(Array.from({ length: 2001 }, (_, i) => ({ z: (i * H) / 2000, r: trueR((i * H) / 2000) }))) * k ** 3;
  const volErr = Math.abs(res.report.volumeMm3 - trueVol) / trueVol;
  check("объём", volErr < 0.005, `${res.report.modelVolumeCm3.toFixed(1)} см³ (истинный ${(trueVol / 1000).toFixed(1)}), ошибка ${(volErr * 100).toFixed(2)}%`);
  check("нормали наружу", res.report.volumeMm3 > 0, "объём положительный");
  console.log("предупреждения:", res.report.warnings.length ? res.report.warnings : "нет");

  if (variant.dark) writeFileSync("out/test-vase.stl", res.stl);
}

// Перспектива: фото «сжато» по ширине на 5% → должно быть предупреждение
{
  const img = makePhoto({ dark: true, noise: 0 });
  const res = photoToSolid(img, { heightMm: H, maxDiameterMm: 124 * 1.05, clayShrinkPct: 12 });
  check("предупреждение о пропорциях", res.report.warnings.some((w) => w.includes("Пропорции")), "есть");
}
