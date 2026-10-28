// Server-only: claims about OTHER places in a report's voice note / text (atReportLocation=false).
// There's no photo of those places, so they never create or change an event. Plain code (no AI):
// geocode the place hint; if an open event is within ~5 km, add the mention to its timeline as
// evidence the Investigator reads. Otherwise the claim stays stored on the report only.
import type { Claim } from "../ai/schemas.ts";
import { insert, select } from "../db/supabase.ts";
import { distanceM } from "../geo/snap.ts";
import { locate } from "../news/ingest.ts";

const NEAR_M = 5_000;
const BOX = 0.05; // ~5 km

export interface MentionResult {
  placeHint: string;
  eventId: string | null;
}

export async function noteMentions(claims: Claim[], reportId: string): Promise<MentionResult[]> {
  const out: MentionResult[] = [];
  for (const c of claims.filter((x) => !x.atReportLocation && x.placeHint).slice(0, 4)) {
    const hint = c.placeHint!;
    const at = await locate(hint).catch(() => null);
    if (!at) {
      out.push({ placeHint: hint, eventId: null });
      continue;
    }
    const rows = await select<{ id: string; lat: number; lng: number }>(
      "events",
      `select=id,lat,lng&resolved_at=is.null&lat=gte.${at.lat - BOX}&lat=lte.${at.lat + BOX}&lng=gte.${at.lng - BOX}&lng=lte.${at.lng + BOX}`,
    );
    const near = rows
      .map((r) => ({ ...r, d: distanceM(at.lat, at.lng, r.lat, r.lng) }))
      .filter((r) => r.d < NEAR_M)
      .sort((a, b) => a.d - b.d)[0];
    if (near) {
      await insert("event_timeline", {
        event_id: near.id,
        kind: "report",
        actor: "Traveller (voice note)",
        text: `Also mentioned in a traveller's voice note from elsewhere: ${c.summary} (no photo of this spot)`,
        data: { reportId, mention: true, placeHint: hint, status: c.status, type: c.eventType },
      });
    }
    out.push({ placeHint: hint, eventId: near?.id ?? null });
  }
  return out;
}
