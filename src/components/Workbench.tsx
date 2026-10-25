"use client";

import { useEffect, useMemo, useState } from "react";
import type { PhotoToSolidResult } from "@/core/pipeline";
import { planMold, DEFAULT_MOLD_PARAMS, type MoldParams, type PartingScheme, type BlockShape } from "@/core/mold";
import { estimateMoldSet, buildPrintSet, DEFAULT_CASE_PARAMS, type CaseParams, type PrintSet } from "@/core/case";
import { meshToBinarySTL } from "@/core/mesh/stl";
import type { Mesh } from "@/core/types";
import { fitOnBed } from "@/core/print";
import { plasterForVolume, siliconeForVolume, slipPerCast } from "@/core/materials";
import { DEFAULT_CLAY, DEFAULT_PLASTER, DEFAULT_PRINTER, DEFAULT_SILICONE, type PrinterProfile } from "@/core/settings/profiles";
import type { Vec3 } from "@/core/geometry/csg";
import { ProfileTool } from "./ProfileTool";
import { MoldSection } from "./MoldSection";

/**
 * Рабочее место: шаг 1 (профиль) → шаг 2 (гипсовая форма) → шаг 3 (кейс и печать) → шаг 4 (материалы).
 * Шаги 2–4 пересчитываются мгновенно из профиля модели, без построения 3D-тел.
 */

const num = (s: string, fallback: number): number => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
};
const fmtSize = (v: Vec3) => v.map((x) => x.toFixed(0)).join(" × ");
const kg = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} кг` : `${g.toFixed(0)} г`);

export function Workbench() {
  const [profileResult, setProfileResult] = useState<PhotoToSolidResult | null>(null);

  // Шаг 2 — форма
  const [spareH, setSpareH] = useState("30");
  const [spareFlare, setSpareFlare] = useState("8");
  const [spareStep, setSpareStep] = useState("2");
  const [wall, setWall] = useState("30");
  const [bottom, setBottom] = useState("30");
  const [scheme, setScheme] = useState<PartingScheme | "auto">("auto");
  const [blockShape, setBlockShape] = useState<BlockShape>("box");
  const [keyD, setKeyD] = useState("12");
  const [keyClear, setKeyClear] = useState("12");
  const [straps, setStraps] = useState(true);

  // Шаг 3 — кейс и печать
  const [silicone, setSilicone] = useState("10");
  const [housingWall, setHousingWall] = useState("4");
  const [wallPieces, setWallPieces] = useState<2 | 4>(4);
  const [bedX, setBedX] = useState(String(DEFAULT_PRINTER.bed.x));
  const [bedY, setBedY] = useState(String(DEFAULT_PRINTER.bed.y));
  const [bedZ, setBedZ] = useState(String(DEFAULT_PRINTER.bed.z));

  // Шаг 4 — материалы
  const [consistency, setConsistency] = useState(String(DEFAULT_PLASTER.waterPer100));
  const [castWall, setCastWall] = useState("4");
  const [slipDensity, setSlipDensity] = useState(String(DEFAULT_CLAY.slipDensity));
  const [mixRatio, setMixRatio] = useState("1");

  const moldParams: MoldParams = useMemo(
    () => ({
      ...DEFAULT_MOLD_PARAMS,
      spare: { heightMm: num(spareH, 30), flareDeg: num(spareFlare, 8), stepMm: num(spareStep, 2) },
      scheme,
      blockShape,
      wallMm: num(wall, 30),
      bottomMm: num(bottom, 30),
      keys: { ...DEFAULT_MOLD_PARAMS.keys, diameterMm: num(keyD, 12), clearanceMm: num(keyClear, 12) },
      straps: { ...DEFAULT_MOLD_PARAMS.straps, enabled: straps },
    }),
    [spareH, spareFlare, spareStep, scheme, blockShape, wall, bottom, keyD, keyClear, straps],
  );
  const caseParams: CaseParams = useMemo(
    () => ({ ...DEFAULT_CASE_PARAMS, siliconeMm: num(silicone, 10), wallMm: num(housingWall, 4), wallPieces }),
    [silicone, housingWall, wallPieces],
  );
  const printer: PrinterProfile = useMemo(
    () => ({ ...DEFAULT_PRINTER, bed: { x: num(bedX, 256), y: num(bedY, 256), z: num(bedZ, 256) } }),
    [bedX, bedY, bedZ],
  );

  const computed = useMemo(() => {
    if (!profileResult) return null;
    try {
      const plan = planMold(profileResult.modelProfile, moldParams);
      const est = estimateMoldSet(plan, caseParams);
      return { plan, est, error: null as string | null };
    } catch (e) {
      return { plan: null, est: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [profileResult, moldParams, caseParams]);

  const plan = computed?.plan ?? null;
  const est = computed?.est ?? null;

  // Тела для печати строятся по кнопке (CSG в WASM, ~1–3 с); любое изменение параметров их сбрасывает
  const [printSet, setPrintSet] = useState<PrintSet | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  useEffect(() => {
    setPrintSet(null);
    setBuildError(null);
  }, [plan, caseParams]);

  const buildBodies = async () => {
    if (!plan) return;
    setBuilding(true);
    setBuildError(null);
    try {
      await new Promise((r) => setTimeout(r, 30)); // дать отрисоваться «Строю…»
      const { createManifoldKernel } = await import("@/core/geometry/manifoldKernel");
      const kernel = await createManifoldKernel();
      setPrintSet(buildPrintSet(kernel, plan, moldParams, caseParams));
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  const materials = useMemo(() => {
    if (!est || !profileResult) return null;
    const plaster = { ...DEFAULT_PLASTER, waterPer100: num(consistency, 70) };
    const clay = { ...DEFAULT_CLAY, slipDensity: num(slipDensity, 1.75) };
    return {
      plasterSet: plasterForVolume(est.plasterCm3, plaster),
      plasterParts: est.parts.map((p) => ({ label: p.label, mix: plasterForVolume(p.plasterCm3, plaster) })),
      silicone: siliconeForVolume(est.siliconeCm3, DEFAULT_SILICONE, num(mixRatio, 1)),
      slip: slipPerCast(est.cavityCm3, profileResult.modelProfile, num(castWall, 4), clay),
    };
  }, [est, profileResult, consistency, slipDensity, castWall, mixRatio]);

  return (
    <>
      <StepHeader n={1} title="Профиль изделия" />
      <ProfileTool onResult={setProfileResult} />

      <StepHeader n={2} title="Гипсовая форма" />
      {!profileResult ? (
        <Waiting />
      ) : (
        <div className="step">
          <section className="panel inputs">
            <h2>Засор</h2>
            <div className="grid">
              <Field label="Высота, мм" value={spareH} onChange={setSpareH} />
              <Field label="Раскрытие, °" value={spareFlare} onChange={setSpareFlare} />
              <Field label="Ступенька, мм" value={spareStep} onChange={setSpareStep} hint="Линия подрезки края" />
            </div>
            <h2>Блок</h2>
            <div className="grid">
              <label className="field">
                <span>Схема разъёма</span>
                <select value={scheme} onChange={(e) => setScheme(e.target.value as PartingScheme | "auto")}>
                  <option value="auto">Автоматически</option>
                  <option value="one-piece">Цельная</option>
                  <option value="two-sides-base">Две боковины + дно</option>
                </select>
              </label>
              <label className="field">
                <span>Форма блока</span>
                <select value={blockShape} onChange={(e) => setBlockShape(e.target.value as BlockShape)}>
                  <option value="box">Прямоугольный</option>
                  <option value="cylinder">Цилиндр</option>
                </select>
              </label>
              <Field label="Гипс от полости, мм" value={wall} onChange={setWall} />
              <Field label="Гипс под дном, мм" value={bottom} onChange={setBottom} />
            </div>
            <h2>Замки и пазы</h2>
            <div className="grid">
              <Field label="Диаметр замка, мм" value={keyD} onChange={setKeyD} />
              <Field label="От полости, мм" value={keyClear} onChange={setKeyClear} />
            </div>
            <label className="check">
              <input type="checkbox" checked={straps} onChange={(e) => setStraps(e.target.checked)} />
              Пазы под резинки
            </label>
            {blockShape === "cylinder" && (
              <p className="warn">У цилиндрического блока тыльная сторона боковин кривая — заливать гипс в силиконовый кейс неудобно. Для метода с кейсом лучше прямоугольный.</p>
            )}
          </section>

          <section className="panel view single">
            {plan ? <MoldSection plan={plan} keyDepthMm={moldParams.keys.depthMm} /> : <p className="error">{computed?.error}</p>}
          </section>

          <section className="panel results">
            <h2>План формы</h2>
            {plan && est && (
              <>
                <table>
                  <tbody>
                    <Row k="Схема" v={plan.scheme === "one-piece" ? "цельная" : "2 боковины + дно"} />
                    <Row k="Поднутрения" v={plan.undercuts.pullUpFree ? "нет" : plan.undercuts.undercutZones.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)} мм`).join(", ")} />
                    <Row k="Мин. уклон стенки" v={`${plan.undercuts.minDraftDeg.toFixed(1)}°`} />
                    <Row k="Блок" v={`${(2 * plan.block.halfWidth).toFixed(0)} × ${(2 * plan.block.halfWidth).toFixed(0)} × ${(plan.block.zMax - plan.block.zMin).toFixed(0)} мм`} />
                    <Row k="Полость с засором" v={`${est.cavityCm3.toFixed(0)} см³`} />
                    <Row k="Гипс в форме" v={`${est.plasterCm3.toFixed(0)} см³`} />
                    <Row k="Замков" v={String(plan.keys.length)} />
                  </tbody>
                </table>
                {plan.warnings.map((w) => (
                  <p key={w} className="warn">{w}</p>
                ))}
                <p className="hint">Тела частей формы и кожухов строятся в шаге 3 кнопкой «Построить STL для печати».</p>
              </>
            )}
          </section>
        </div>
      )}

      <StepHeader n={3} title="Силиконовые кейсы и печать" />
      {!est ? (
        <Waiting />
      ) : (
        <div className="step wide">
          <section className="panel inputs">
            <h2>Кейс и кожух</h2>
            <div className="grid">
              <Field label="Толщина силикона, мм" value={silicone} onChange={setSilicone} />
              <Field label="Стенка кожуха, мм" value={housingWall} onChange={setHousingWall} />
              <label className="field">
                <span>Стенки кожуха</span>
                <select value={wallPieces} onChange={(e) => setWallPieces(Number(e.target.value) as 2 | 4)}>
                  <option value={4}>4 стенки</option>
                  <option value={2}>2 угловые (Г)</option>
                </select>
              </label>
            </div>
            <h2>Стол принтера, мм</h2>
            <div className="grid three">
              <Field label="X" value={bedX} onChange={setBedX} />
              <Field label="Y" value={bedY} onChange={setBedY} />
              <Field label="Z" value={bedZ} onChange={setBedZ} />
            </div>
            <p className="hint">Блок — копия части гипсовой формы — кладётся тыльной гранью на основание кожуха, силикон заливается сверху. Потом кейс переворачивают, ставят в тот же кожух и льют гипс.</p>
          </section>

          <section className="panel results grow">
            <div className="buildBar">
              <button className="primary" onClick={buildBodies} disabled={building || !plan}>
                {building ? "Строю…" : printSet ? "Перестроить STL" : "Построить STL для печати"}
              </button>
              {printSet && (
                <button onClick={() => downloadAll(printSet)}>Скачать все STL ({printSet.parts.reduce((a, p) => a + p.pieces.length, 0)} файлов)</button>
              )}
            </div>
            {buildError && <p className="error">{buildError}</p>}
            {printSet ? (
              <>
                {printSet.parts.map((part) => (
                  <div key={part.moldPartId} className="partCard">
                    <h3>
                      {part.label}
                      <span>
                        силикон {part.siliconeCm3.toFixed(0)} см³ · заливать до риски {part.siliconeFillHeightMm.toFixed(0)} мм
                      </span>
                    </h3>
                    <table>
                      <tbody>
                        {part.pieces.map((pc) => {
                          const fit = fitOnBed(pc.size, printer);
                          return (
                            <tr key={pc.id}>
                              <th>
                                {pc.label}
                                {pc.count > 1 ? ` ×${pc.count}` : ""}
                              </th>
                              <td>{fmtSize(pc.size)} мм</td>
                              <td className={fit.fits ? "ok" : "bad"}>
                                {fit.fits ? "влезает" : `резать на ${fit.sections[0] * fit.sections[1] * fit.sections[2]}`}
                              </td>
                              <td>
                                <button className="link" onClick={() => downloadMesh(pc.mesh, pc.id, pc.count)}>STL</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {part.warnings.map((w) => (
                      <p key={w} className="warn">{w}</p>
                    ))}
                  </div>
                ))}
                <p className="hint">
                  Детали уже лежат на столе нужной гранью вниз. Блок печатается тыльной гранью вниз, рабочими гранями вверх — их
                  поверхность перейдёт в силикон и гипс, поэтому слой потоньше. Что не влезает на стол — разрежьте в слайсере
                  (инструмент «Разрез» со штифтами). Стыки стенок и основания перед заливкой промажьте пластилином.
                </p>
              </>
            ) : (
              est.parts.map((part) => (
              <div key={part.id} className="partCard">
                <h3>
                  {part.label}
                  <span>
                    гипс {part.plasterCm3.toFixed(0)} см³ · силикон {part.siliconeCm3.toFixed(0)} см³
                  </span>
                </h3>
                <table>
                  <tbody>
                    {part.printPieces.map((pc) => {
                      const fit = fitOnBed(pc.size, printer);
                      return (
                        <tr key={pc.label}>
                          <th>
                            {pc.label}
                            {pc.count > 1 ? ` ×${pc.count}` : ""}
                          </th>
                          <td>{fmtSize(pc.size)} мм</td>
                          <td className={fit.fits ? "ok" : "bad"}>
                            {fit.fits ? "влезает" : `резать на ${fit.sections[0] * fit.sections[1] * fit.sections[2]}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              ))
            )}
            {!printSet && (
              <p className="hint">Оценка для прямоугольного кожуха, без построения тел. Кожух боковин A и B почти одинаковый — можно напечатать один и лить по очереди.</p>
            )}
          </section>
        </div>
      )}

      <StepHeader n={4} title="Материалы" />
      {!materials || !est ? (
        <Waiting />
      ) : (
        <div className="step wide">
          <section className="panel inputs">
            <div className="grid">
              <Field label="Консистенция гипса" value={consistency} onChange={setConsistency} hint="Воды на 100 частей гипса" />
              <Field label="Силикон A:B по массе" value={mixRatio} onChange={setMixRatio} hint="1 = 1:1, 10 = 10:1" />
              <Field label="Плотность шликера, г/см³" value={slipDensity} onChange={setSlipDensity} />
              <Field label="Толщина черепка, мм" value={castWall} onChange={setCastWall} />
            </div>
          </section>
          <section className="panel results grow">
            <div className="matGrid">
              <div>
                <h3>Гипс на комплект формы</h3>
                <p className="big">{kg(materials.plasterSet.plasterG)} гипса + {kg(materials.plasterSet.waterG)} воды</p>
                <table>
                  <tbody>
                    {materials.plasterParts.map((p) => (
                      <Row key={p.label} k={p.label} v={`${kg(p.mix.plasterG)} + ${kg(p.mix.waterG)} воды`} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3>Силикон на все кейсы</h3>
                <p className="big">{kg(materials.silicone.totalG)}</p>
                <table>
                  <tbody>
                    <Row k="Компонент A" v={kg(materials.silicone.partAG)} />
                    <Row k="Компонент B" v={kg(materials.silicone.partBG)} />
                    <Row k="Кейсов" v={String(est.parts.length)} />
                  </tbody>
                </table>
              </div>
              <div>
                <h3>Шликер на отливку</h3>
                <p className="big">{(materials.slip.fillMl / 1000).toFixed(2)} л</p>
                <table>
                  <tbody>
                    <Row k="Залить" v={kg(materials.slip.fillG)} />
                    <Row k="Останется в стенке" v={`≈ ${kg(materials.slip.retainedG)}`} />
                    <Row k="Сольётся обратно" v={`≈ ${(materials.slip.drainedMl / 1000).toFixed(2)} л`} />
                  </tbody>
                </table>
              </div>
            </div>
            <p className="hint">Гипс и шликер — с запасом 10%, силикон — с запасом 10% на потери. Объёмы замков и пазов не учтены (меньше 1%).</p>
          </section>
        </div>
      )}
    </>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="stepHeader">
      <span>{n}</span>
      {title}
    </h2>
  );
}

function Waiting() {
  return <div className="panel waiting">Появится после шага 1: загрузите фото и укажите высоту изделия.</div>;
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <th>{k}</th>
      <td>{v}</td>
    </tr>
  );
}

function stlName(id: string, count: number) {
  return `${id.replace(/[\/]/g, "_")}${count > 1 ? `_x${count}` : ""}.stl`;
}

function downloadMesh(mesh: Mesh, id: string, count = 1) {
  const blob = new Blob([meshToBinarySTL(mesh, id) as BlobPart], { type: "model/stl" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = stlName(id, count);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Все детали по очереди: браузер может один раз спросить разрешение на несколько загрузок. */
function downloadAll(set: PrintSet) {
  const items = set.parts.flatMap((p) => p.pieces);
  items.forEach((pc, i) => setTimeout(() => downloadMesh(pc.mesh, pc.id, pc.count), i * 250));
}
