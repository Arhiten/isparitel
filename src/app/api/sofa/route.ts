import { NextResponse } from "next/server";
import type { Status } from "@/sofa/fleet";
import { seriesOf } from "@/sofa/series";
import { addExtraPart, createOrder, loadFleet, renameUnit, setRails, setStatus, setStock } from "@/sofa/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });

/** ?series=shukhlyatka — серия (по умолчанию диван). */
export async function GET(req: Request) {
  try {
    return NextResponse.json(await loadFleet(seriesOf(new URL(req.url).searchParams.get("series"))));
  } catch (e) {
    return fail(e);
  }
}

type Body =
  | { action: "status"; unit: string; partId: string; status: Status; comment?: string; all?: boolean }
  | { action: "order"; items: { unit: string; partId: string }[]; layouts: { name: string; text: string }[] }
  | { action: "stock"; key: string; qty: number }
  | { action: "rename"; unit: string; name: string }
  | { action: "extra"; unit: string; name: string; materialId: string }
  | { action: "rails"; left: number; span: number };

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body & { series?: string };
    const s = seriesOf(b.series);
    if (b.action === "status") return NextResponse.json({ touched: await setStatus(s, b.unit, b.partId, b.status, b.comment, !!b.all) });
    if (b.action === "order") return NextResponse.json({ order: await createOrder(s, b.items, b.layouts ?? []) });
    if (b.action === "extra") return NextResponse.json(await addExtraPart(s, b.unit, String(b.name ?? ""), String(b.materialId ?? "")));
    if (b.action === "rename") return NextResponse.json({ name: await renameUnit(s, b.unit, String(b.name ?? "")) });
    if (b.action === "stock") return NextResponse.json({ stock: await setStock(s, b.key, Number(b.qty) || 0) });
    if (b.action === "rails") return NextResponse.json({ rails: await setRails(s, { left: Number(b.left), span: Number(b.span) }) });
    return fail("Неизвестное действие");
  } catch (e) {
    return fail(e);
  }
}
