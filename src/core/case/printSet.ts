import type { CsgKernel } from "../geometry/csg";
import type { Mesh } from "../types";
import { buildMold } from "../mold/build";
import type { MoldParams, MoldPartId, MoldPlan } from "../mold/types";
import { buildCase, orientForPrint } from "./build";
import type { CaseParams } from "./types";

/** Деталь, готовая к печати: уже лежит на столе (z = 0) рекомендуемой гранью вниз. */
export interface PrintPiece3D {
  id: string;
  label: string;
  count: number;
  mesh: Mesh;
  size: [number, number, number];
}

export interface PrintSetPart {
  moldPartId: MoldPartId;
  label: string;
  /** Часть гипсовой формы в координатах формы — для контроля. */
  moldMesh: Mesh;
  pieces: PrintPiece3D[];
  siliconeCm3: number;
  siliconeFillHeightMm: number;
  warnings: string[];
}

export interface PrintSet {
  parts: PrintSetPart[];
  plasterCm3: number;
  cavityCm3: number;
}

/**
 * Полный комплект для печати: части гипсовой формы → для каждой блок + основание + стенки кожуха.
 * Все тела ядра освобождаются внутри, наружу уходят только сетки.
 */
export function buildPrintSet(kernel: CsgKernel, plan: MoldPlan, moldParams: MoldParams, caseParams: CaseParams): PrintSet {
  const mold = buildMold(kernel, plan, moldParams);
  const parts: PrintSetPart[] = mold.parts.map((part) => {
    const cs = buildCase(kernel, part, caseParams);
    const pieces = cs.printParts.map((pp) => {
      const oriented = orientForPrint(kernel, pp.solid, pp.printDown);
      const bb = kernel.bbox(oriented);
      const mesh = kernel.toMesh(oriented);
      kernel.dispose(oriented, pp.solid);
      return {
        id: pp.id,
        label: pp.label,
        count: pp.count,
        mesh,
        size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]] as [number, number, number],
      };
    });
    const moldMesh = kernel.toMesh(part.solid);
    return {
      moldPartId: part.id,
      label: part.label,
      moldMesh,
      pieces,
      siliconeCm3: cs.siliconeVolumeCm3,
      siliconeFillHeightMm: cs.siliconeFillHeightMm,
      warnings: cs.warnings,
    };
  });
  kernel.dispose(...mold.parts.map((p) => p.solid));
  return { parts, plasterCm3: mold.plasterVolumeCm3, cavityCm3: mold.cavityVolumeCm3 };
}
