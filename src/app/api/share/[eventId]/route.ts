// POST /api/share/[eventId] → the shareable alert card (frame 11): code text EN + HI + a Muse Image
// illustration (cached per event type + status; drawn by code if Muse Image is unavailable).
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { cardFor } from "@/lib/share/card.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) return NextResponse.json({ ok: false, error: "invalid event id" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    const card = await cardFor(eventId, new URL(req.url).origin);
    if (!card) return NextResponse.json({ ok: false, error: "event not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: card, ...(card.artBy === "code" && { degraded: "AI illustration unavailable right now" }) });
  } catch (err) {
    console.error("[share] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "alert card unavailable right now" });
  }
}
