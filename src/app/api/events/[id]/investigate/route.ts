// POST /api/events/[id]/investigate — "Check again" on a doubtful event: the Investigator agent gathers
// evidence and explains it. Only runs when the event is doubtful, at most once per 3 h per event unless
// new evidence arrived (otherwise returns the last check, no AI). Never throws to the page.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { investigateEvent } from "@/lib/investigate/investigator.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, error: "invalid event id" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const r = await investigateEvent(id);
    return NextResponse.json({ ok: true, data: r, ...(r.degraded && { degraded: r.degraded }) });
  } catch (err) {
    console.error("[investigate] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "AI check unavailable right now" });
  }
}
