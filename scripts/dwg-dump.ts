// Распечатка примитивов DWG: слой, цвет, координаты — чтобы разобрать чертёж перед моделью.
//   npx tsx scripts/dwg-dump.ts "путь.dwg"
import { promises as fs } from "node:fs";
import path from "node:path";
(async () => {
  const data = await fs.readFile(process.argv[2]);
  const { Dwg_File_Type, LibreDwg } = await import("@mlightcad/libredwg-web");
  const l = await LibreDwg.create(path.join(process.cwd(), "node_modules", "@mlightcad", "libredwg-web", "wasm") + path.sep);
  const ptr = l.dwg_read_data(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, Dwg_File_Type.DWG);
  if (!ptr) throw new Error("Не удалось прочитать DWG");
  const db: any = l.convert(ptr);
  console.log("layers", db.tables.LAYER.entries.map((x: any) => `${x.name}:${x.colorIndex}`).join(" "));
  const r = (n: number) => Math.round(n * 10000) / 10000;
  for (const e of db.entities) {
    if (e.isInPaperSpace) continue;
    // Штриховка — контуры по рёбрам: начала отрезков (дуги — центр и радиус).
    if (e.type === "HATCH") {
      const loops = (e.boundaryPaths ?? []).map((b: any) => (b.edges ?? []).map((g: any) => (g.start ? `(${r(g.start.x)},${r(g.start.y)})` : g.center ? `arc c(${r(g.center.x)},${r(g.center.y)}) r${r(g.radius)}` : "?")).join(" ") || (b.vertices ?? []).map((v: any) => `(${r(v.x)},${r(v.y)}${v.bulge ? ` b${r(v.bulge)}` : ""})`).join(" "));
      console.log("HATCH", "c=" + e.colorIndex, e.patternName, loops.join(" | "));
      continue;
    }
    const pts = e.vertices ? e.vertices.map((v: any) => `(${r(v.x)},${r(v.y)}${v.bulge ? ` b${r(v.bulge)}` : ""})`).join(" ") : e.startPoint ? `(${r(e.startPoint.x)},${r(e.startPoint.y)})-(${r(e.endPoint.x)},${r(e.endPoint.y)})` : e.center ? `c(${r(e.center.x)},${r(e.center.y)}) r${r(e.radius)} ${r(e.startAngle ?? 0)}..${r(e.endAngle ?? 0)}` : e.insertionPoint ? `ins ${e.name} (${r(e.insertionPoint.x)},${r(e.insertionPoint.y)})` : JSON.stringify(e, (_, v) => (typeof v === "bigint" ? Number(v) : v)).slice(0, 1500);
    console.log(e.type, "L=" + e.layer, "c=" + e.colorIndex, "flag=" + e.flag, pts);
  }
})();
