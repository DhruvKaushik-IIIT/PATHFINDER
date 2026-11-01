// GET  /api/official/crew/[eventId]          → proposed crew for this site (code: needs + nearest on-duty people + free machines)
// GET  /api/official/crew/[eventId]?brief=1  → + "why this crew" note EN/HI + safety (Baseten → Meta → template)
// POST /api/official/crew/[eventId] {workerIds, machineIds} → approve: create the crew, alert every worker
import { NextResponse } from "next/server";
import { z } from "zod";
import { approveCrew, briefFor, CrewError, proposeCrew } from "@/lib/crew/builder.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";
import { requireOffice } from "@/lib/official/guard.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(err: unknown) {
  if (err instanceof CrewError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  console.error(JSON.stringify({ level: "warn", event: "crew_builder_failed", error: (err as Error).message }));
  return NextResponse.json({ ok: false, error: "The crew builder is unavailable right now" }, { status: 503 });
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const official = await requireOffice();
  if (official instanceof NextResponse) return official;
  const { eventId } = await params;
  try {
    const proposal = await proposeCrew(official, eventId);
    if (new URL(req.url).searchParams.get("brief") !== "1" || proposal.existingCrew || !proposal.people.length) return NextResponse.json({ ok: true, data: { proposal } });
    const limited = checkLimit(req, "official");
    if (limited) return NextResponse.json({ ok: true, data: { proposal }, degraded: limited.message });
    const { brief, by } = await briefFor(proposal);
    return NextResponse.json({ ok: true, data: { proposal, brief, briefBy: by }, ...(by === "code" && { degraded: "AI note unavailable — showing the basic summary" }) });
  } catch (err) {
    return fail(err);
  }
}

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Body = z.object({ workerIds: z.array(Id).min(1).max(40), machineIds: z.array(Id).max(20) });

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const official = await requireOffice();
  if (official instanceof NextResponse) return official;
  const limited = checkLimit(req, "official");
  if (limited) return limitedResponse(limited);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: false, error: "workerIds and machineIds required" }, { status: 400 });
  const { eventId } = await params;
  try {
    return NextResponse.json({ ok: true, data: await approveCrew(official, eventId, b.data.workerIds, b.data.machineIds) });
  } catch (err) {
    return fail(err);
  }
}
