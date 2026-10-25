import { NextResponse } from "next/server";
import { seriesOf } from "@/sofa/series";
import { uploadDrawing } from "@/sofa/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Чертёж детали: multipart с полями series, unit, partId, all, comment, deviation (отклонение от модели),
 * correction ("1" — уточнение чертежа факта у принятой детали), panel (номер детали в чертеже, слева направо с 0) и файлом file.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Нет файла чертежа");
    const panel = form.get("panel");
    const result = await uploadDrawing(seriesOf(form.get("series") as string | null), String(form.get("unit")), String(form.get("partId")), file.name, Buffer.from(await file.arrayBuffer()), {
      all: form.get("all") === "1",
      comment: String(form.get("comment") ?? ""),
      deviation: String(form.get("deviation") ?? ""),
      correction: form.get("correction") === "1",
      panel: panel === null || panel === "" ? undefined : Number(panel),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
