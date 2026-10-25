import type { Mesh, ProfilePoint } from "../types";

/**
 * Абстракция над CSG-ядром (булевы операции над замкнутыми телами).
 *
 * Модули 2–4 работают только через этот интерфейс, а не с библиотекой напрямую.
 * Тогда ядро можно заменить или подменить в тестах.
 *
 * Реализация по умолчанию: `manifoldKernel.ts` поверх пакета `manifold-3d` (WASM, работает в браузере).
 * Установка: npm i manifold-3d
 * Важно: manifold-3d грузится асинхронно (await Module()), поэтому ядро создаётся один раз через
 * `createManifoldKernel()` и передаётся дальше.
 */

export type Vec3 = [number, number, number];

/** Непрозрачная ссылка на тело внутри ядра. Ядро само управляет памятью (WASM). */
export interface Solid {
  readonly __solid: unique symbol;
}

export interface CsgKernel {
  fromMesh(mesh: Mesh): Solid;
  toMesh(solid: Solid): Mesh;

  box(min: Vec3, max: Vec3): Solid;
  /** Усечённый конус вдоль +Z от z0 до z1. */
  cylinder(r0: number, r1: number, z0: number, z1: number, segments?: number): Solid;
  /** Тело вращения профиля вокруг оси Z (как mesh/revolve.ts, но сразу в ядре). */
  revolve(profile: ProfilePoint[], segments?: number): Solid;

  union(...solids: Solid[]): Solid;
  subtract(a: Solid, ...b: Solid[]): Solid;
  intersect(a: Solid, b: Solid): Solid;

  translate(s: Solid, v: Vec3): Solid;
  /** Поворот в градусах вокруг осей X, Y, Z (в этом порядке). */
  rotate(s: Solid, deg: Vec3): Solid;
  mirror(s: Solid, normal: Vec3): Solid;

  /** Разрезать тело плоскостью: [часть по направлению normal, часть против]. */
  splitByPlane(s: Solid, normal: Vec3, offset: number): [Solid, Solid];

  volume(s: Solid): number;
  bbox(s: Solid): { min: Vec3; max: Vec3 };
  isEmpty(s: Solid): boolean;

  /** Освободить WASM-память. Вызывать для промежуточных тел. */
  dispose(...solids: Solid[]): void;
}
