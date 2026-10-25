import { promises as fs } from "node:fs";
import { seriesOf } from "@/sofa/series";
import { drawingPath } from "@/sofa/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Скачивание чертежа: ?series=sofa&unit=ДЯ-01&file=ДЯ-01-Ф-017 rev2.dwg */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const file = q.get("file") ?? "";
  const p = await drawingPath(seriesOf(q.get("series")), q.get("unit") ?? "", file);
  if (!p) return new Response("Нет такого чертежа", { status: 404 });
  try {
    const data = await fs.readFile(p);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}` } });
  } catch {
    return new Response("Файл не найден", { status: 404 });
  }
}
