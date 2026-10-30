// GET /api/official/dispatch[?ai=1] → AI Dispatch Plan (code plan instantly; ai=1 runs the Crew Dispatch
// agent, cached 30 min per event/crew state). POST {steps} → approve: move crews + timeline items.
import { NextResponse } from "next/server";
import { z } from "zod";
import { approveDispatch } from "@/lib/official/approve.ts";
import { requireOfficial } from "@/lib/official/guard.ts";
import { dispatchPlan } from "@/lib/official/planDispatch.ts";
import { checkLimit } from "@/lib/guard/rateLimit.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const limited = new URL(req.url).searchParams.get("ai") === "1" ? checkLimit(req, "official") : null;
  const ai = new URL(req.url).searchParams.get("ai") === "1" && !limited;
  try {
    const { plan, degraded: d } = await dispatchPlan(official.district, official.org, { ai });
    // Over the limit: the instant code plan instead of the agent.
    const degraded = limited ? limited.message : d;
    return NextResponse.json({ ok: true, data: plan, ...(degraded && { degraded }) });
  } catch (err) {
    console.error("[official] dispatch plan failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "Dispatch plan unavailable right now" });
  }
}

const Body = z.object({
  steps: z
    .array(
      z.object({
        crewId: z.string().uuid(),
        eventId: z.string().uuid(),
        action: z.enum(["keep", "send", "send_later"]),
        text: z.string().max(400),
      }),
    )
    .min(1)
    .max(12),
});

export async function POST(req: Request) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "steps expected" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, data: await approveDispatch(official, body.data.steps) });
  } catch (err) {
    console.error("[official] approve failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Couldn't save the plan — try again" }, { status: 503 });
  }
}
