// POST /api/slopes/[id]/assess[?replay=1] → re-run the Slope risk agent now ("Check again" / demo with replayed rain).
// Budget rule (5.4): at most once per 15 min per site unless a new photo arrived since the last assessment.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { assessSite } from "@/lib/slope/assess.ts";
import { getSite } from "@/lib/slope/sites.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });
  const replay = new URL(req.url).searchParams.get("replay") === "1";
  const site = await getSite(id).catch(() => null);
  if (!site) return NextResponse.json({ ok: false, error: "slope site not found" }, { status: 404 });
  const recent = site.last_assessed_at && Date.now() - new Date(site.last_assessed_at).getTime() < 15 * 60_000;
  const newPhoto = site.last_observed_at && site.last_assessed_at && site.last_observed_at > site.last_assessed_at;
  const sameRain = (site.risk?.rain?.source === "replay") === replay;
  if (recent && !newPhoto && sameRain) return NextResponse.json({ ok: true, data: { site, cached: true } });
  try {
    const r = await assessSite(id, { trigger: replay ? "a demo re-check with replayed real monsoon rain" : "a traveller asked to check again", replay, site });
    return NextResponse.json({ ok: true, data: { site: await getSite(id), alerts: r?.alerts ?? 0 } });
  } catch (err) {
    console.error("[slopes] assess failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: { site }, degraded: "slope check unavailable right now" });
  }
}
