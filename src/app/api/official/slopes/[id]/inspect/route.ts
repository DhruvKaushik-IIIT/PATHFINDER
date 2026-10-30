// POST /api/official/slopes/[id]/inspect → "Send crew to inspect" (timeline item only; officials, own district).
import { NextResponse } from "next/server";
import { requireOfficial } from "@/lib/official/guard.ts";
import { sendInspection } from "@/lib/slope/inspect.ts";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const { id } = await params;
  try {
    const ok = await sendInspection(id, official.org, official.district.name, official.isDemo);
    return ok ? NextResponse.json({ ok: true, data: { sent: true } }) : NextResponse.json({ ok: false, error: "slope not found in your district" }, { status: 404 });
  } catch (err) {
    console.error("[official] inspect failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "could not record the inspection, try again" }, { status: 503 });
  }
}
