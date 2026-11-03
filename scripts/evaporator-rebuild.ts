// Пересборка модели серии «Шкаф испарителя» после правок узлов в src/sofa/evaporator.ts:
// base.json строится заново, исходный чертёж контура копируется в «Исходник». У экземпляров убираются записи деталей,
// которых больше нет в модели (если по ним ещё ничего не загружено); новые детали допишутся при загрузке страницы (loadFleet).
//   npx tsx scripts/evaporator-rebuild.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { SOURCE_DWG, evaporatorBase } from "../src/sofa/evaporator";
import { evaporatorSize } from "../src/sofa/store";
import type { Unit } from "../src/sofa/fleet";
import { solidsOf } from "../src/sofa/frame/calc";
import { SERIES } from "../src/sofa/series";

const root = path.join(process.cwd(), SERIES.evaporator.folder);

(async () => {
  const base = evaporatorBase(await evaporatorSize(root));
  await fs.mkdir(path.join(root, "Исходник"), { recursive: true });
  await fs.copyFile(SOURCE_DWG, path.join(root, "Исходник", path.basename(SOURCE_DWG))).catch(() => console.log(`Нет чертежа ${SOURCE_DWG}`));
  await fs.writeFile(path.join(root, "base.json"), JSON.stringify(base, null, 2), "utf8");
  const solids = solidsOf(base);
  // Створки двери — отдельно от каркаса и обшивки.
  const kg = (re: RegExp, door = false) => solids.filter((s) => re.test(s.material.id) && s.part.id.startsWith("door") === door).reduce((sum, s) => sum + s.weight, 0);
  console.log(`base.json: ${base.parts.length} дет.; каркас ${kg(/ch|tube|an|rd|s8|s3/).toFixed(1)} кг, наружные кассеты и цоколь ${kg(/s2|k3/).toFixed(1)} кг, внутренние ${kg(/zn1|ss25/).toFixed(1)} кг, двери ${kg(/./, true).toFixed(1)} кг`);
  const ids = new Set(base.parts.map((p) => p.id));
  for (const dir of await fs.readdir(root)) {
    const file = path.join(root, dir, "unit.json");
    const unit = JSON.parse(await fs.readFile(file, "utf8").catch(() => "null")) as Unit | null;
    if (!unit) continue;
    const gone = Object.keys(unit.parts).filter((id) => !ids.has(id) && !unit.parts[id].extra && !unit.parts[id].rev);
    for (const id of gone) delete unit.parts[id];
    await fs.writeFile(file, JSON.stringify(unit, null, 2), "utf8");
    console.log(`${unit.code}: убрано записей ${gone.length}`);
  }
})();
