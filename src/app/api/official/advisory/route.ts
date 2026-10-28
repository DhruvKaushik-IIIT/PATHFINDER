// GET /api/official/advisory?eventId= → draft EN + HI + reach · POST {eventId, en, hi} → publish to
// travellers watching a trip through the spot (alerts) + event timeline. Signed-in officials only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { advisoryDraft, publishAdvisory } from "@/lib/official/advisory.ts";
import { requireOfficial } from "@/lib/official/guard.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const eventId = new URL(req.url).searchParams.get("eventId") ?? "";
  try {
    const r = await advisoryDraft(official, eventId);
    if (!r) return NextResponse.json({ ok: false, error: "Event not found in your district (or already cleared)." }, { status: 404 });
    return NextResponse.json({ ok: true, data: r.draft, ...(r.degraded && { degraded: r.degraded }) });
  } catch (err) {
    console.error("[official] advisory draft failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Advisory draft unavailable right now" }, { status: 503 });
  }
}

const Body = z.object({
  eventId: z.string().uuid(),
  en: z.string().trim().min(10).max(400),
  hi: z.string().trim().max(600),
});

export async function POST(req: Request) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "The English text is required (10–400 characters)." }, { status: 400 });
  try {
    const r = await publishAdvisory(official, body.data.eventId, body.data.en, body.data.hi);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, data: { sent: r.sent } });
  } catch (err) {
    console.error("[official] publish failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Couldn't publish — try again" }, { status: 503 });
  }
}
