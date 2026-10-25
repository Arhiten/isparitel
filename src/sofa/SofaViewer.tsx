"use client";

// Объёмная модель экземпляра: детали окрашены по виду материала (принятые — серые).
// explode > 0 — взрыв-схема: детали разлетаются от центра дивана; щелчок по детали сообщает её id.
// Построение панели — из preview3d.tsx проекта «Фанерный каркас дивана».

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Solid, V } from "./frame/calc";

/** Что нужно модели: детали в сборе и габарит. */
export type Model = { solids: Solid[]; size: V };
import type { Pt } from "./frame/model";

const path = <T extends THREE.Path>(target: T, pts: Pt[]) => target.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x, y)));

/**
 * Стальной профиль — сечение, вытянутое по длине. Сечение в своих осях: p — по стороне B (у стойки — по A), q — по толщине.
 * Швеллер: стенка у q = 0, полки к q = w (openBack — наоборот); труба — кольцо со стенкой s.
 */
function profileGeometry(s: Solid) {
  const pr = s.material.profile!, { h, w } = pr, len = s.part.alongB ? s.part.b : s.part.a;
  const q = (v: number) => (s.part.openBack ? w - v : v);
  const rings: [number, number][][] =
    pr.kind === "channel"
      ? [[[0, q(0)], [h, q(0)], [h, q(w)], [h - pr.t, q(w)], [h - pr.t, q(pr.s)], [pr.t, q(pr.s)], [pr.t, q(w)], [0, q(w)]]]
      : [[[0, 0], [h, 0], [h, w], [0, w]], [[pr.s, pr.s], [h - pr.s, pr.s], [h - pr.s, w - pr.s], [pr.s, w - pr.s]]];
  // Вдоль A: сечение в (B, толщина), вытяжка → A; вдоль B: сечение в (толщина, A), вытяжка → B. Обе замены осей — повороты, без зеркала.
  const xy = (p: number, v: number): Pt => (s.part.alongB ? [v, p] : [p, v]);
  const shape = path(new THREE.Shape(), rings[0].map(([p, v]) => xy(p, v)));
  shape.holes = rings.slice(1).map((r) => path(new THREE.Path(), r.map(([p, v]) => xy(p, v))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  g.applyMatrix4(s.part.alongB ? new THREE.Matrix4().makeBasis(Z, X, Y) : new THREE.Matrix4().makeBasis(Y, Z, X));
  // Рез на ус: торцы сдвигаются внутрь на расстояние от наружной грани — по наружной грани длина полная, по внутренней короче на 2 × ширину.
  if (s.part.miter && !s.part.alongB) {
    const pos = g.getAttribute("position"), far = s.part.miter === "far";
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), inset = far ? w - pos.getZ(i) : pos.getZ(i);
      if (x < 0.01) pos.setX(i, inset);
      else if (x > len - 0.01) pos.setX(i, len - inset);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Гнутый лист по четверти окружности: кольцевой сектор в плане, вытянутый на высоту B. Строится сразу в координатах изделия
 * (X — вправо, Y — вглубь, Z — вверх) относительно угла габарита детали, затем переводится в оси сцены.
 */
function arcGeometry(s: Solid, origin: THREE.Vector3) {
  const { cx, cy, r, from } = s.part.arc!, a0 = (from * Math.PI) / 180, a1 = a0 + Math.PI / 2, ri = r - s.t;
  const ox = cx - s.min[0], oy = cy - s.min[1];
  const at = (rad: number, a: number) => new THREE.Vector2(ox + rad * Math.cos(a), oy + rad * Math.sin(a));
  const shape = new THREE.Shape();
  shape.moveTo(at(r, a0).x, at(r, a0).y);
  shape.absarc(ox, oy, r, a0, a1, false);
  shape.lineTo(at(ri, a1).x, at(ri, a1).y);
  shape.absarc(ox, oy, ri, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(shape, { depth: s.part.b, bevelEnabled: false, curveSegments: 24 });
  // План (X, Y) и высота → сцена: X → X, Y → −Z, высота → Y.
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
  return g.translate(origin.x, origin.y, origin.z);
}

/** Гнутый лист по сечению в плане (кассета шкафа): контур, вытянутый на высоту B; оси — как у arcGeometry. */
function planGeometry(s: Solid, origin: THREE.Vector3) {
  const g = new THREE.ExtrudeGeometry(path(new THREE.Shape(), s.part.plan!), { depth: s.part.b, bevelEnabled: false });
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
  return g.translate(origin.x, origin.y, origin.z);
}

/**
 * Гнутый профиль вдоль стены: сечение (поперёк стены, Z), вытянутое на длину A. Строится сразу в осях сцены от угла габарита детали:
 * у плоскости xz вытяжка по X, поперёк — по Y; у yz — вытяжка по Y, поперёк — по X (обе замены — повороты, без зеркала).
 */
function sectionGeometry(s: Solid, origin: THREE.Vector3) {
  const xz = s.part.plane === "xz";
  const shape = path(new THREE.Shape(), s.part.section!.map(([u, z]): Pt => (xz ? [u, z] : [z, u])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: s.part.a, bevelEnabled: false });
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), back = new THREE.Vector3(0, 0, -1);
  // Сцена: X изделия → X, Y изделия → −Z, Z изделия → Y.
  g.applyMatrix4(xz ? new THREE.Matrix4().makeBasis(back, Y, X) : new THREE.Matrix4().makeBasis(Y, X, back));
  return g.translate(origin.x, origin.y, origin.z);
}

function slab(s: Solid, origin: THREE.Vector3) {
  if (s.part.section) return sectionGeometry(s, origin.clone());
  if (s.part.plan) return planGeometry(s, origin.clone());
  if (s.part.arc) return arcGeometry(s, origin.clone());
  if (s.material.profile) return place(profileGeometry(s), s, origin);
  const turn = (pts: Pt[]) => (s.part.flip ? pts.map(([x, y]): Pt => [s.part.a - x, y]) : pts);
  const shape = path(new THREE.Shape(), turn(s.shape.outer));
  shape.holes = s.shape.cutouts.map((c) => path(new THREE.Path(), turn(c)));
  return place(new THREE.ExtrudeGeometry(shape, { depth: s.t, bevelEnabled: false }), s, origin);
}

/**
 * Рёбра детали — по её контурам (наружный и окна) на обеих пластях и вертикали в изломах контура.
 * EdgesGeometry по треугольникам грани рисовал лишние линии: у детали с прорезями (дно ящика) разбиение даёт
 * вырожденные треугольники, и их рёбра видны «от паза до паза».
 */
function outline(s: Solid, origin: THREE.Vector3) {
  if (s.part.section) return new THREE.EdgesGeometry(sectionGeometry(s, origin.clone()), 20);
  if (s.part.plan) return new THREE.EdgesGeometry(planGeometry(s, origin.clone()), 20);
  if (s.part.arc) return new THREE.EdgesGeometry(arcGeometry(s, origin.clone()), 20);
  if (s.material.profile) return place(new THREE.EdgesGeometry(profileGeometry(s), 20), s, origin);
  const turn = (pts: Pt[]) => (s.part.flip ? pts.map(([x, y]): Pt => [s.part.a - x, y]) : pts);
  const pos: number[] = [];
  for (const ring of [s.shape.outer, ...s.shape.cutouts].map(turn)) {
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length], o = ring[(i - 1 + ring.length) % ring.length];
      for (const z of [0, s.t]) pos.push(p[0], p[1], z, q[0], q[1], z);
      // Вертикальное ребро — где контур поворачивает больше чем на 20° (на дугах скругления шаг меньше, там рёбер нет).
      const a = Math.atan2(p[1] - o[1], p[0] - o[0]), b = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const bend = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      if (bend > (20 * Math.PI) / 180) pos.push(p[0], p[1], 0, p[0], p[1], s.t);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return place(g, s, origin);
}

/** Отверстия детали — тёмные кружки на её пласти (со стороны толщины), чтобы их было видно на модели. */
function holes(s: Solid, origin: THREE.Vector3) {
  if (!s.shape.drills.length || s.part.arc || s.part.plan || s.part.section) return null;
  const parts = s.shape.drills.map((h) => {
    const x = s.part.flip ? s.part.a - h.x : h.x;
    return new THREE.CircleGeometry(Math.max(h.d, 3) / 2, 16).translate(x, h.y, s.part.drillsUnder ? -0.4 : s.t + 0.4);
  });
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const g of parts) {
    const p = g.toNonIndexed().getAttribute("position");
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    g.dispose();
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return place(merged, s, origin);
}

/**
 * Выборка на неполную глубину (фрезеровка) — затемнённая область на пласти: деталь под ней не прорезана.
 * Вложенные контуры чередуются: кольцо из двух контуров — выборка между ними, центр остаётся пластью.
 */
/** Контур, обрезанный по габариту детали: паз под ЧПУ рисуют с выходом за кромку, на модели он виден только на детали. */
function clipToBox(ring: Pt[], a: number, b: number): Pt[] {
  const edges: [(p: Pt) => boolean, (p: Pt, q: Pt) => Pt][] = [
    [(p) => p[0] >= 0, (p, q) => [0, p[1] + ((q[1] - p[1]) * (0 - p[0])) / (q[0] - p[0])]],
    [(p) => p[0] <= a, (p, q) => [a, p[1] + ((q[1] - p[1]) * (a - p[0])) / (q[0] - p[0])]],
    [(p) => p[1] >= 0, (p, q) => [p[0] + ((q[0] - p[0]) * (0 - p[1])) / (q[1] - p[1]), 0]],
    [(p) => p[1] <= b, (p, q) => [p[0] + ((q[0] - p[0]) * (b - p[1])) / (q[1] - p[1]), b]],
  ];
  let out = ring;
  for (const [inside, cross] of edges) {
    const src = out;
    out = [];
    src.forEach((p, i) => {
      const q = src[(i + 1) % src.length];
      if (inside(p)) out.push(p);
      if (inside(p) !== inside(q)) out.push(cross(p, q));
    });
  }
  return out;
}

function pockets(s: Solid, origin: THREE.Vector3) {
  // У швеллера окна в стенке (фигурный вырез у торца) — затемнение на обеих сторонах стенки; сечение профиля их не вырезает.
  const pr = s.material.profile;
  if (pr && pr.kind === "channel" && s.shape.cutouts.length && !s.part.alongB) {
    const geo = new THREE.ShapeGeometry(s.shape.cutouts.map((c) => path(new THREE.Shape(), c)));
    const outer = s.part.openBack ? pr.w + 0.3 : -0.3, inner = s.part.openBack ? pr.w - pr.s - 0.3 : pr.s + 0.3;
    const both = new THREE.BufferGeometry();
    const pos: number[] = [];
    const p = geo.toNonIndexed().getAttribute("position");
    for (const z of [outer, inner]) for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), z);
    geo.dispose();
    both.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return place(both, s, origin);
  }
  if (s.material.profile || s.part.arc || s.part.plan || s.part.section) return null;
  const rings = s.shape.pockets.map((c) => clipToBox(s.part.flip ? c.map(([x, y]): Pt => [s.part.a - x, y]) : c, s.part.a, s.part.b)).filter((c) => c.length > 2);
  if (!rings.length) return null;
  const inside = ([x, y]: Pt, poly: Pt[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const depth = rings.map((r) => rings.filter((o) => o !== r && inside(r[0], o)).length);
  const shapes = rings.flatMap((r, i) => {
    if (depth[i] % 2) return [];
    const shape = path(new THREE.Shape(), r);
    shape.holes = rings.filter((h, j) => depth[j] === depth[i] + 1 && inside(h[0], r)).map((h) => path(new THREE.Path(), h));
    return [shape];
  });
  // По умолчанию выборка — на пласти со стороны толщины; pocketsUnder — на обратной.
  return place(new THREE.ShapeGeometry(shapes).translate(0, 0, s.part.pocketsUnder ? -0.3 : s.t + 0.3), s, origin);
}

/** Плоская деталь в своих координатах (A, B, толщина) — на место в сборе: наклон и поворот в плоскость панели. */
function place(geometry: THREE.BufferGeometry, s: Solid, origin: THREE.Vector3) {
  const angle = s.part.plane === "xy" ? 0 : ((s.part.tilt ?? 0) * Math.PI) / 180;
  if (angle) {
    const along = s.part.plane === "xz";
    if (along) geometry.translate(0, 0, -s.t);
    geometry.rotateX(along ? -angle : angle);
    geometry.translate(0, s.t * Math.max(0, Math.sin(angle)), along ? s.t : 0);
  }
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(0, 0, -1);
  const basis = s.part.plane === "xy" ? [X, back, Y] : s.part.plane === "xz" ? [X, Y, Z] : [back, Y, X];
  if (s.part.plane === "xz") origin.z -= s.t - Math.min(0, s.part.b * Math.sin(angle));
  if (s.part.plane === "yz") origin.x -= Math.min(0, s.part.b * Math.sin(angle));
  return geometry.applyMatrix4(new THREE.Matrix4().makeBasis(basis[0], basis[1], basis[2]).setPosition(origin));
}

/** Разлёт взрыв-схемы: доля расстояния детали от центра, на которую она отодвигается. */
const SPREAD = 1.1;

const NO_MARKERS: [number, number, number][] = [];

/** markers — точки замечаний модели (нестыковки): красные метки поверх модели, в координатах изделия. */
export default function SofaViewer({ calc, colors, explode = 0, picked, onPick, height = 520, markers = NO_MARKERS }: { calc: Model; colors: Record<string, string>; explode?: number; picked?: string | null; onPick?: (partId: string) => void; height?: number; markers?: [number, number, number][] }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; render: () => void; camera: THREE.PerspectiveCamera; controls: OrbitControls; model?: THREE.Group; fit?: number } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  // Во взрыв-схеме детали разлетаются — камера с самого начала отходит дальше.
  const reach = useRef(1 + explode * 0.8);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-1200, 2400, 2000);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(1500, 800, -2000);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(35, 1, 10, 40000);
    camera.position.set(-2600, 1900, 3400).multiplyScalar(reach.current);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 400, 0);
    controls.update();
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      render();
    });
    resize.observe(el);

    // Щелчок без протяжки — выбор детали; протяжка — поворот камеры.
    let down: [number, number] | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => void (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !pick.current || !stage.current?.model) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(stage.current.model.children, false).find((h) => h.object.userData.partId);
      if (hit) pick.current(hit.object.userData.partId);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    stage.current = { scene, render, camera, controls };
    return () => {
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    if (s.model) {
      s.scene.remove(s.model);
      s.model.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        m?.dispose?.();
      });
    }
    const group = new THREE.Group();
    if (calc.solids.length) {
      const lo = [0, 1, 2].map((k) => Math.min(...calc.solids.map((x) => x.min[k])));
      const cx = lo[0] + calc.size[0] / 2, cy = lo[1] + calc.size[1] / 2, z0 = lo[2];
      const centre = new THREE.Vector3(0, calc.size[2] / 2, 0);
      for (const solid of calc.solids) {
        const geometry = slab(solid, new THREE.Vector3(solid.min[0] - cx, solid.min[2] - z0, -(solid.min[1] - cy)));
        const color = solid.part.id === picked ? "#3b5bdb" : (colors[solid.part.id] ?? "#cccccc");
        const steel = solid.material.density > 3000;
        // ghost — полупрозрачная деталь (обшивка шкафа): виден каркас за ней.
        const ghost = !!solid.part.ghost && solid.part.id !== picked;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: steel ? 0.45 : 0.85, metalness: steel ? 0.45 : 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: ghost, opacity: ghost ? 0.18 : 1, depthWrite: !ghost }));
        mesh.userData.partId = solid.part.id;
        mesh.add(new THREE.LineSegments(outline(solid, new THREE.Vector3(solid.min[0] - cx, solid.min[2] - z0, -(solid.min[1] - cy))), new THREE.LineBasicMaterial({ color: 0x3a2e22, transparent: true, opacity: 0.55 })));
        const drilled = holes(solid, new THREE.Vector3(solid.min[0] - cx, solid.min[2] - z0, -(solid.min[1] - cy)));
        if (drilled) mesh.add(new THREE.Mesh(drilled, new THREE.MeshBasicMaterial({ color: 0x1e1a16, side: THREE.DoubleSide })));
        const milled = pockets(solid, new THREE.Vector3(solid.min[0] - cx, solid.min[2] - z0, -(solid.min[1] - cy)));
        if (milled) mesh.add(new THREE.Mesh(milled, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: solid.material.profile ? 0.65 : 0.22, side: THREE.DoubleSide, depthWrite: false })));
        if (explode > 0) {
          geometry.computeBoundingBox();
          const c = geometry.boundingBox!.getCenter(new THREE.Vector3());
          mesh.position.copy(c.sub(centre).multiplyScalar(explode * SPREAD));
        }
        group.add(mesh);
      }
      // Метки замечаний — красные шарики, видны сквозь детали.
      const dot = Math.max(8, Math.hypot(...calc.size) / 120);
      for (const [x, y, z] of markers) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(dot, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe03131, depthTest: false }));
        m.position.set(x - cx, z - z0, -(y - cy));
        m.renderOrder = 10;
        group.add(m);
      }
    }
    s.model = group;
    s.scene.add(group);
    // Камера настроена на диван (диагональ габарита ~2,5 м); изделие другого размера (шухлятка ~0,56 м) — камера подходит соразмерно.
    // Перестраивается только при заметной смене габарита, чтобы не сбрасывать поворот после каждой правки.
    const fit = Math.max(1, Math.hypot(...calc.size)) / 2540;
    if (!s.fit || Math.abs(fit / s.fit - 1) > 0.2) {
      s.fit = fit;
      s.camera.position.set(-2600, 1900, 3400).multiplyScalar(reach.current * fit);
      // Высокое изделие (шкаф) — камера смотрит в середину высоты.
      s.controls.target.set(0, calc.size[2] > Math.max(calc.size[0], calc.size[1]) ? calc.size[2] / 2 : 400 * fit, 0);
      s.controls.update();
    }
    s.render();
  }, [calc, colors, explode, picked, markers]);

  return <div ref={host} role="img" aria-label="Модель дивана: вращается мышью" style={{ height, width: "100%", cursor: onPick ? "pointer" : "grab", borderRadius: 10, overflow: "hidden", background: "var(--viewer-bg)" }} />;
}
