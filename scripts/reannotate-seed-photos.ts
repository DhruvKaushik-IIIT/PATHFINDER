// Phase 6E: re-draw the AI-annotated copies of photos attached to SEED events, so the info strip names the
// seed place ("Aut · NH3") instead of where the photo was first tested in Phase 1. Uses the blurred public
// copy (never the private original), re-runs SAM for the masks (~$0.0125 per photo — masks aren't stored),
// keeps the photo's own stored claim, writes a NEW file name (the old one may be CDN-cached).
// Usage: node --env-file-if-exists=.env.local scripts/reannotate-seed-photos.ts [--dry]
import { segment } from "../src/lib/ai/router.ts";
import type { Claim } from "../src/lib/ai/schemas.ts";
import { publicUrl, select, update, upload } from "../src/lib/db/supabase.ts";
import { annotate } from "../src/lib/images/annotate.ts";
import type { ConceptResults } from "../src/lib/images/measure.ts";

const dry = process.argv.includes("--dry");
const CONCEPTS = ["road", "vehicle", "excavator", "landslide", "rock"];
type Row = { id: string; report_id: string; public_url: string; width: number; height: number; events: { place_name: string | null; status: string; is_demo: boolean; confidence: number; road_segments: { road_ref: string | null } | null } | null };

const rows = await select<Row>(
  "photos",
  `select=id,report_id,public_url,width,height,events(place_name,status,is_demo,confidence,road_segments(road_ref))&event_id=in.(${Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`).join(",")})&source=eq.traveller&faces_blurred=is.true`,
);
console.log(`${rows.length} traveller photo(s) on seed events`);
for (const p of rows) {
  const ev = p.events;
  if (!ev?.is_demo) continue;
  const [c] = await select<{ payload: Claim & { atReportLocation?: boolean } }>("claims", `select=payload&report_id=eq.${p.report_id}&order=created_at.asc&limit=5`);
  if (!c) {
    console.log(`  ${p.id.slice(0, 8)} no stored claim — skipped`);
    continue;
  }
  const title = [ev.place_name, ev.road_segments?.road_ref].filter(Boolean).join(" · ");
  console.log(`  ${p.id.slice(0, 8)} → "${title}" (${c.payload.eventType}, ${ev.status})`);
  if (dry) continue;
  const jpeg = Buffer.from(await (await fetch(p.public_url)).arrayBuffer());
  const sam: ConceptResults = {};
  for (const [i, r] of (await Promise.all(CONCEPTS.map((k) => segment(jpeg, k)))).entries()) sam[CONCEPTS[i]!] = r.data;
  // The event's current status (seed) wins over the old claim's, so the chip matches the event page.
  const claim = { ...c.payload, status: ev.status as Claim["status"] };
  const out = await annotate({ jpeg, width: p.width, height: p.height, sam, claim, title, subtitle: `Traveller · Verified ${Math.round(ev.confidence * 100)}% · 2 AI models agree` });
  const path = `${p.report_id}-annotated-v2.jpg`;
  await upload("photos-public", path, out, "image/jpeg");
  await update("photos", `id=eq.${p.id}`, { annotated_url: publicUrl("photos-public", path) });
  console.log(`    ✓ ${publicUrl("photos-public", path)}`);
}
