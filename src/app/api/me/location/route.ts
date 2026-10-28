// POST /api/me/location {lat, lng, speedKmh?} — a scout's coarse location while the app is open.
// Stored rounded to ~1 km and overwritten each time (no history, 6.2 rule 5). Only when the user turned
// location on. A stationary opted-in scout near an open scout request gets it as an alert (after the reply).
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, select, update } from "@/lib/db/supabase.ts";
import { currentUserId } from "@/lib/me.ts";
import { dispatchForUser } from "@/lib/scout/requests.ts";

export const dynamic = "force-dynamic";

const Body = z.object({
  lat: z.number().min(26).max(35),
  lng: z.number().min(72).max(82),
  speedKmh: z.number().min(0).max(300).nullable().optional(),
});
const coarse = (x: number) => Math.round(x * 100) / 100; // ~1.1 km

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid location" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: true, data: { stored: false } });
  const id = await currentUserId();
  if (!id) return NextResponse.json({ ok: true, data: { stored: false, reason: "location is off" } });
  const [u] = await select<{ location_mode: string; scout_opt_in: boolean }>("users", `select=location_mode,scout_opt_in&id=eq.${id}&limit=1`);
  if (!u || u.location_mode === "off") return NextResponse.json({ ok: true, data: { stored: false, reason: "location is off" } });
  const loc = { coarse_lat: coarse(parsed.data.lat), coarse_lng: coarse(parsed.data.lng), speed_kmh: parsed.data.speedKmh ?? null };
  await update("users", `id=eq.${id}`, { ...loc, coarse_updated_at: new Date().toISOString() });
  if (u.scout_opt_in) {
    after(() =>
      dispatchForUser({ id, ...loc }).catch((err: Error) => console.warn("[scout] dispatch on ping failed:", err.message)),
    );
  }
  return NextResponse.json({ ok: true, data: { stored: true } });
}
