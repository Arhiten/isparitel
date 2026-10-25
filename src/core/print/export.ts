import type { Mesh } from "../types";
import { meshToBinarySTL } from "../mesh/stl";

/**
 * Экспорт задания на печать.
 *
 * Сейчас: по STL на деталь (meshToBinarySTL).
 * TODO (модуль 4):
 *  - 3MF: один файл со всеми деталями (Bambu Studio / PrusaSlicer / Orca откроют как проект).
 *    3MF — это zip с 3D/3dmodel.model (XML: <vertices>, <triangles>, <object> на деталь)
 *    + [Content_Types].xml + _rels/.rels. Zip можно писать без сжатия (store) — без зависимостей.
 *  - ZIP-архив всех STL + instructions.txt (порядок сборки, объёмы, риски уровня).
 */
export function exportSTLs(items: { id: string; mesh: Mesh }[]): { fileName: string; data: Uint8Array }[] {
  return items.map((it) => ({ fileName: `${it.id.replace(/[\\/]/g, "_")}.stl`, data: meshToBinarySTL(it.mesh, it.id) }));
}

export function export3MF(_items: { id: string; label: string; mesh: Mesh }[]): Uint8Array {
  throw new Error("export3MF: не реализовано. См. TODO в src/core/print/export.ts");
}
