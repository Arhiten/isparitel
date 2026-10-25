import type { ProfilePoint } from "./types";
import type { PhotoToSolidParams } from "./pipeline";
import type { CaseParams } from "./case/types";
import type { MoldParams, MoldPlan } from "./mold/types";
import type { SplitParams } from "./print/types";
import type { ClayProfile, PlasterProfile, PrinterProfile, SiliconeProfile } from "./settings/profiles";

/**
 * Состояние проекта целиком — то, что сохраняется в файл (*.ceramic.json) и восстанавливается.
 * Тяжёлые результаты (тела, сетки) не сохраняются: они пересчитываются из параметров.
 *
 * Шаги мастера в UI:
 *   1. Профиль    — модуль 1 (готов): фото → профиль модели
 *   2. Форма      — модуль 2: план (мгновенно) → построение частей (по кнопке)
 *   3. Кейс       — модуль 3: для каждой части формы — блок + кожух
 *   4. Печать     — модуль 4: размещение на столе, нарезка, экспорт 3MF/STL
 *   5. Материалы  — модуль 5: гипс, силикон, шликер, стоимость
 *
 * Правило зависимостей: изменение на шаге N сбрасывает результаты шагов > N.
 */
export interface ProjectState {
  version: 1;
  name: string;
  /** Фото храним как dataURL уменьшенной копии (≤1600 px), чтобы проект открывался без исходника. */
  photoDataUrl?: string;
  profileParams?: PhotoToSolidParams;
  /** Профиль модели (с усадкой) — результат шага 1; кэш, чтобы шаги 2+ работали без фото. */
  modelProfile?: ProfilePoint[];
  /** Профиль можно поправить вручную (кривая поверх фото) — тогда он заменяет автоматический. */
  profileEdited?: boolean;

  moldParams: MoldParams;
  caseParams: CaseParams;
  splitParams: SplitParams;

  materials: {
    clay: ClayProfile;
    plaster: PlasterProfile;
    silicone: SiliconeProfile;
    siliconeMixRatio: number;
    wallThicknessMm: number;
  };
  printer: PrinterProfile;
}

/** Производные данные текущего сеанса (не сохраняются). */
export interface ProjectRuntime {
  moldPlan?: MoldPlan;
  // moldDesign?: MoldDesign; caseDesigns?: CaseDesign[]; printJob?: PrintJob; — по мере реализации
}

export function serializeProject(p: ProjectState): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(json: string): ProjectState {
  const p = JSON.parse(json) as ProjectState;
  if (p.version !== 1) throw new Error("Неизвестная версия файла проекта.");
  return p;
}
