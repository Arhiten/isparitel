// Пересборка модели серии «Шухлятка» после правок сборки в src/sofa/shukhlyatka.ts:
// base.json строится заново из исходного чертежа (shukhlyatka-projects/Исходник), а фактические контуры уже загруженных
// чертежей (asBuilt) заново выравниваются по новой модели. Статусы, ревизии и история деталей не меняются.
//   npx tsx scripts/shukhlyatka-rebuild.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { orient, pocketsLikeModel } from "../src/sofa/dwg";
import type { Unit } from "../src/sofa/fleet";
import { SERIES } from "../src/sofa/series";
import { SOURCE_DWG, shukhlyatkaBase } from "../src/sofa/shukhlyatka";

const root = path.join(process.cwd(), SERIES.shukhlyatka.folder);

(async () => {
  const base = await shukhlyatkaBase(await fs.readFile(path.join(root, "Исходник", path.basename(SOURCE_DWG))));
  await fs.writeFile(path.join(root, "base.json"), JSON.stringify(base, null, 2), "utf8");
  console.log(`base.json: ${base.parts.length} дет.`);
  for (const dir of await fs.readdir(root)) {
    const file = path.join(root, dir, "unit.json");
    const unit = JSON.parse(await fs.readFile(file, "utf8").catch(() => "null")) as Unit | null;
    if (!unit) continue;
    let n = 0;
    for (const r of Object.values(unit.parts)) {
      const model = base.parts.find((p) => p.id === r.partId);
      if (!r.asBuilt || !model || r.extra) continue;
      const p = pocketsLikeModel(orient({ shape: r.asBuilt.shape, a: r.asBuilt.a, b: r.asBuilt.b }, model), model);
      r.asBuilt = { ...p, rev: r.asBuilt.rev };
      n++;
    }
    await fs.writeFile(file, JSON.stringify(unit, null, 2), "utf8");
    console.log(`${unit.code}: фактических контуров выровнено ${n}`);
  }
})();
