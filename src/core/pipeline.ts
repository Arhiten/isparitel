import type { ImageLike, Mesh, ProfilePoint } from "./types";
import { extractSilhouette, type SilhouetteOptions, type SilhouetteResult } from "./image/silhouette";
import { measureRows, scaleProfile, type PixelProfile, type Profile, type ProfileSide } from "./profile/profile";
import { modelScale, scalePoints } from "./units/shrinkage";
import { revolveProfile } from "./mesh/revolve";
import { meshToBinarySTL } from "./mesh/stl";
import { analyzeMesh, profileVolume, type MeshReport } from "./mesh/validate";

/**
 * Модуль 1: фото профиля + габариты → STL мастер-модели тела вращения.
 * Все размеры на входе — размеры ГОТОВОГО (обожжённого) изделия.
 * На выходе — модель, увеличенная на усадку, т.е. то, что пойдёт в форму.
 */
export interface PhotoToSolidParams {
  heightMm: number;
  maxDiameterMm?: number;
  clayShrinkPct: number;
  plasterExpansionPct?: number;
  siliconeShrinkPct?: number;
  side?: ProfileSide;
  smoothing?: number;
  stepMm?: number;
  chordToleranceMm?: number;
  silhouette?: SilhouetteOptions;
  name?: string;
}

export interface PhotoToSolidResult {
  silhouette: SilhouetteResult;
  pixelProfile: PixelProfile;
  /** Профиль готового изделия, мм. */
  finishedProfile: Profile;
  /** Профиль модели с учётом усадок, мм. */
  modelProfile: ProfilePoint[];
  scale: number;
  mesh: Mesh;
  stl: Uint8Array;
  report: MeshReport & {
    finishedVolumeCm3: number;
    modelVolumeCm3: number;
    modelHeightMm: number;
    modelMaxDiameterMm: number;
    warnings: string[];
  };
}

export function photoToSolid(img: ImageLike, p: PhotoToSolidParams): PhotoToSolidResult {
  if (!(p.heightMm > 0)) throw new Error("Укажите высоту изделия в мм.");
  const silhouette = extractSilhouette(img, p.silhouette);
  const pixelProfile = measureRows(silhouette, p.side);
  const finishedProfile = scaleProfile(pixelProfile, {
    heightMm: p.heightMm,
    maxDiameterMm: p.maxDiameterMm,
    smoothing: p.smoothing,
    stepMm: p.stepMm,
  });

  const warnings = [...finishedProfile.warnings];
  const { bbox, width, height } = silhouette;
  if (bbox.x0 === 0 || bbox.y0 === 0 || bbox.x1 === width - 1 || bbox.y1 === height - 1) {
    warnings.push("Силуэт касается края кадра — изделие могло обрезаться. Сделайте фото с полями.");
  }
  if (bbox.y1 - bbox.y0 < 300) {
    warnings.push("Изделие занимает мало пикселей по высоте — точность будет низкой (желательно от 800 px).");
  }

  const scale = modelScale({
    clayShrinkPct: p.clayShrinkPct,
    plasterExpansionPct: p.plasterExpansionPct,
    siliconeShrinkPct: p.siliconeShrinkPct,
  });
  const modelProfile = scalePoints(finishedProfile.points, scale);
  const mesh = revolveProfile(modelProfile, { chordToleranceMm: p.chordToleranceMm });
  const stl = meshToBinarySTL(mesh, p.name);
  const meshReport = analyzeMesh(mesh);

  return {
    silhouette,
    pixelProfile,
    finishedProfile,
    modelProfile,
    scale,
    mesh,
    stl,
    report: {
      ...meshReport,
      finishedVolumeCm3: profileVolume(finishedProfile.points) / 1000,
      modelVolumeCm3: meshReport.volumeMm3 / 1000,
      modelHeightMm: p.heightMm * scale,
      modelMaxDiameterMm: finishedProfile.maxDiameterMm * scale,
      warnings,
    },
  };
}
