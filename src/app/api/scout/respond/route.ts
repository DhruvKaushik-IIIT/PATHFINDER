// POST /api/scout/respond {requestId, action: "dismiss"} — "Not now" on a scout request card.
// ("Share photo" goes to /report?scout=<requestId>; the report itself fulfils the request.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, update } from "@/lib/db/supabase.ts";
import { currentUserId } from "@/lib/me.ts";

export const dynamic = "force-dynamic";

const Body = z.object({ requestId: z.uuid(), action: z.literal("dismiss") });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null });
  const id = await currentUserId();
  if (!id) return NextResponse.json({ ok: false, error: "no scout request for this device" }, { status: 404 });
  const rows = await update<{ id: string }>(
    "alerts",
    `user_id=eq.${id}&kind=eq.scout_request&data->>requestId=eq.${parsed.data.requestId}`,
    { read: true },
  );
  return NextResponse.json({ ok: true, data: { dismissed: rows.length } });
}
