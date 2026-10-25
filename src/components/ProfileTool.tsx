"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { photoToSolid, type PhotoToSolidParams, type PhotoToSolidResult } from "@/core/pipeline";
import type { ImageLike } from "@/core/types";
import { ProfileChart } from "./ProfileChart";

/** Максимальная сторона изображения для обработки (пикселей). Больше — медленнее без выигрыша в точности. */
const MAX_SIDE = 1600;

type DarkMode = "auto" | "dark" | "light";

interface FormState {
  heightMm: string;
  maxDiameterMm: string;
  clayShrinkPct: string;
  plasterExpansionPct: string;
  siliconeShrinkPct: string;
  side: "average" | "left" | "right";
  smoothing: string;
  autoThreshold: boolean;
  threshold: string;
  darkMode: DarkMode;
  chordToleranceMm: string;
}

const DEFAULTS: FormState = {
  heightMm: "",
  maxDiameterMm: "",
  clayShrinkPct: "12",
  plasterExpansionPct: "0",
  siliconeShrinkPct: "0",
  side: "average",
  smoothing: "3",
  autoThreshold: true,
  threshold: "128",
  darkMode: "auto",
  chordToleranceMm: "0.05",
};

const num = (s: string): number | undefined => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

async function loadImage(file: File): Promise<{ image: ImageLike; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { image: ctx.getImageData(0, 0, w, h), url };
}

interface ProfileToolProps {
  /** Сообщает следующим шагам результат шага 1 (или null, если результата нет). */
  onResult?: (result: PhotoToSolidResult | null) => void;
}

export function ProfileTool({ onResult }: ProfileToolProps = {}) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [image, setImage] = useState<ImageLike | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("model");
  const [result, setResult] = useState<PhotoToSolidResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { image, url } = await loadImage(file);
      setImage(image);
      setImageUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setFileName(file.name.replace(/\.[^.]+$/, "") || "model");
    } catch {
      setError("Не удалось открыть изображение.");
    }
  }, []);

  const params = useMemo((): PhotoToSolidParams | null => {
    const heightMm = num(form.heightMm);
    const clay = num(form.clayShrinkPct);
    if (!heightMm || heightMm <= 0 || clay === undefined) return null;
    return {
      heightMm,
      maxDiameterMm: num(form.maxDiameterMm),
      clayShrinkPct: clay,
      plasterExpansionPct: num(form.plasterExpansionPct) ?? 0,
      siliconeShrinkPct: num(form.siliconeShrinkPct) ?? 0,
      side: form.side,
      smoothing: Math.max(1, Math.round(num(form.smoothing) ?? 3)) | 1,
      chordToleranceMm: Math.max(0.01, num(form.chordToleranceMm) ?? 0.05),
      silhouette: {
        threshold: form.autoThreshold ? undefined : num(form.threshold),
        objectIsDark: form.darkMode === "auto" ? undefined : form.darkMode === "dark",
      },
      name: fileName,
    };
  }, [form, fileName]);

  // Пересчёт с небольшой задержкой, чтобы не считать на каждую нажатую цифру
  useEffect(() => {
    if (!image || !params) {
      setResult(null);
      return;
    }
    const id = setTimeout(() => {
      try {
        setResult(photoToSolid(image, params));
        setError(null);
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 200);
    return () => clearTimeout(id);
  }, [image, params]);

  useEffect(() => {
    onResult?.(result);
  }, [result, onResult]);

  // Наложение маски, оси и найденного контура на фото
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    if (!result) return;
    const { mask } = result.silhouette;
    const tint = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        const p = i * 4;
        tint.data[p] = tint.data[p] * 0.55 + 230 * 0.45;
        tint.data[p + 1] = tint.data[p + 1] * 0.55 + 110 * 0.45;
        tint.data[p + 2] = tint.data[p + 2] * 0.55 + 40 * 0.45;
      }
    }
    ctx.putImageData(tint, 0, 0);
    const { axisX, topY, bottomY, rows } = result.pixelProfile;
    const lw = Math.max(1, image.height / 500);
    ctx.lineWidth = lw;
    ctx.setLineDash([lw * 6, lw * 4]);
    ctx.strokeStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.moveTo(axisX, topY - 20);
    ctx.lineTo(axisX, bottomY + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = lw * 1.5;
    for (const key of ["left", "right"] as const) {
      ctx.beginPath();
      rows.forEach((r, i) => {
        const x = key === "left" ? r.left : r.right + 1;
        if (i === 0) ctx.moveTo(x, r.y);
        else ctx.lineTo(x, r.y);
      });
      ctx.stroke();
    }
  }, [image, result]);

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.stl as BlobPart], { type: "model/stl" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}_master_x${result.scale.toFixed(4)}.stl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const r = result?.report;

  return (
    <div className="tool">
      <section className="panel inputs">
        <h2>Фото профиля</h2>
        <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          <span>{imageUrl ? "Заменить фото" : "Выберите или перетащите фото"}</span>
        </label>
        <p className="hint">Строго сбоку, камера на уровне середины, издалека с зумом. Однотонный контрастный фон, без тени. Подойдёт PNG с прозрачным фоном.</p>

        <h2>Размеры готового изделия</h2>
        <div className="grid">
          <Field label="Высота, мм *" value={form.heightMm} onChange={(v) => set("heightMm", v)} />
          <Field label="Макс. диаметр, мм" value={form.maxDiameterMm} onChange={(v) => set("maxDiameterMm", v)} hint="Компенсирует перспективу" />
        </div>

        <h2>Усадки</h2>
        <div className="grid">
          <Field label="Глина (общая), %" value={form.clayShrinkPct} onChange={(v) => set("clayShrinkPct", v)} />
          <Field label="Расширение гипса, %" value={form.plasterExpansionPct} onChange={(v) => set("plasterExpansionPct", v)} />
          <Field label="Усадка силикона, %" value={form.siliconeShrinkPct} onChange={(v) => set("siliconeShrinkPct", v)} />
        </div>

        <details>
          <summary>Тонкая настройка</summary>
          <div className="grid">
            <label className="field">
              <span>Сторона профиля</span>
              <select value={form.side} onChange={(e) => set("side", e.target.value as FormState["side"])}>
                <option value="average">Среднее двух сторон</option>
                <option value="left">Левая</option>
                <option value="right">Правая</option>
              </select>
            </label>
            <label className="field">
              <span>Изделие на фото</span>
              <select value={form.darkMode} onChange={(e) => set("darkMode", e.target.value as DarkMode)}>
                <option value="auto">Определить</option>
                <option value="dark">Темнее фона</option>
                <option value="light">Светлее фона</option>
              </select>
            </label>
            <Field label="Сглаживание, строк" value={form.smoothing} onChange={(v) => set("smoothing", v)} />
            <Field label="Точность окружности, мм" value={form.chordToleranceMm} onChange={(v) => set("chordToleranceMm", v)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={form.autoThreshold} onChange={(e) => set("autoThreshold", e.target.checked)} />
            Порог автоматически
            {result && form.autoThreshold && <em> ({result.silhouette.threshold})</em>}
          </label>
          {!form.autoThreshold && (
            <input type="range" min={1} max={254} value={form.threshold} onChange={(e) => set("threshold", e.target.value)} />
          )}
        </details>
      </section>

      <section className="panel view">
        {imageUrl ? <canvas ref={overlayRef} className="photo" /> : <div className="empty">Здесь появится фото с найденным силуэтом</div>}
        {result && <ProfileChart finished={result.finishedProfile.points} model={result.modelProfile} />}
      </section>

      <section className="panel results">
        <h2>Результат</h2>
        {!image && <p className="muted">Загрузите фото.</p>}
        {image && !params && <p className="muted">Укажите высоту изделия.</p>}
        {error && <p className="error">{error}</p>}
        {r && result && (
          <>
            <table>
              <tbody>
                <Row k="Масштаб модели" v={`× ${result.scale.toFixed(4)}`} />
                <Row k="Высота модели" v={`${r.modelHeightMm.toFixed(1)} мм`} />
                <Row k="Макс. Ø модели" v={`${r.modelMaxDiameterMm.toFixed(1)} мм`} />
                <Row k="Ø края / дна (готов.)" v={`${result.finishedProfile.rimDiameterMm.toFixed(1)} / ${result.finishedProfile.baseDiameterMm.toFixed(1)} мм`} />
                <Row k="Объём модели" v={`${r.modelVolumeCm3.toFixed(0)} см³`} />
                <Row k="Объём готового" v={`${r.finishedVolumeCm3.toFixed(0)} см³`} />
                <Row k="Треугольников" v={r.triangles.toLocaleString("ru")} />
                <Row k="Сетка замкнута" v={r.watertight ? "да" : `нет (${r.badEdges})`} />
              </tbody>
            </table>
            {r.warnings.map((w) => (
              <p key={w} className="warn">{w}</p>
            ))}
            <button className="primary" onClick={download}>Скачать STL мастер-модели</button>
            <p className="hint">Сплошная модель с плоским дном и плоским верхом по краю. Засор и разъёмы — в шаге 2 ниже.</p>
          </>
        )}
      </section>
    </div>
  );
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
