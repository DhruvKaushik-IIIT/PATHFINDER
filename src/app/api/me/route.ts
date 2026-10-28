// GET /api/me → profile for /me (frame 12). PATCH /api/me {displayName?, scoutOptIn?, locationMode?} → settings.
// Anonymous device users (lib/me.ts): reading never creates a row; changing a setting does.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, update } from "@/lib/db/supabase.ts";
import { currentUserId, ensureUserId } from "@/lib/me.ts";
import { profileFor } from "@/lib/scout/profile.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  try {
    return NextResponse.json({ ok: true, data: await profileFor(await currentUserId()) });
  } catch (err) {
    console.error("[me] failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: null, degraded: "profile unavailable right now" });
  }
}

const Patch = z
  .object({
    displayName: z.string().trim().min(1).max(40).optional(),
    scoutOptIn: z.boolean().optional(),
    locationMode: z.enum(["off", "while_using"]).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid settings" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: null, degraded: "database not configured" });
  const id = await ensureUserId();
  const p = parsed.data;
  const patch: Record<string, unknown> = {};
  if (p.displayName !== undefined) patch.display_name = p.displayName;
  if (p.scoutOptIn !== undefined) patch.scout_opt_in = p.scoutOptIn;
  if (p.locationMode !== undefined) patch.location_mode = p.locationMode;
  // Location off → forget the last coarse location too (6.2 rule 5: no location history).
  if (p.locationMode === "off") Object.assign(patch, { coarse_lat: null, coarse_lng: null, coarse_updated_at: null, speed_kmh: null });
  if (Object.keys(patch).length) await update("users", `id=eq.${id}`, patch);
  return NextResponse.json({ ok: true, data: await profileFor(id) });
}
