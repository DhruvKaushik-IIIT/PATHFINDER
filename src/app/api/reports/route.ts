// POST /api/reports (multipart: photo, lat, lng, text?, voice? as WAV, kind? road|slope) → claim + verified event,
// or with kind=slope → a checked slope reading on a slope site (Phase 6B).
// The pipeline lives in src/lib/reports/submit.ts.
// Contract (CLAUDE.md 5.7): AI trouble never errors → { ok: true, data, degraded? }.
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { ensureUserId } from "@/lib/me.ts";
import { preparePhoto, processPhoto } from "@/lib/reports/processPhoto.ts";
import { findDuplicate, submitReport } from "@/lib/reports/submit.ts";
import { assessSite } from "@/lib/slope/assess.ts";
import { submitSlopeReport } from "@/lib/slope/submit.ts";
import { roadWatchAfterChange } from "@/lib/watch/roadWatch.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VOICE_BYTES = 10 * 1024 * 1024; // ~3.5 min of 24 kHz mono WAV

// Pan bounds of the app (North India) — reports far outside are a bad GPS fix or a bad client.
const Input = z.object({
  lat: z.coerce.number().min(26).max(35),
  lng: z.coerce.number().min(72).max(82),
  text: z.string().trim().max(1000).optional(),
  scout: z.uuid().optional(),
  takenAt: z.iso.datetime({ offset: true }).optional(),
  kind: z.enum(["road", "slope"]).default("road"),
});

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const limited = checkLimit(req, "report");
  if (limited) return limitedResponse(limited);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("expected multipart/form-data");
  }
  const parsed = Input.safeParse({ lat: form.get("lat"), lng: form.get("lng"), text: form.get("text") ?? undefined, scout: form.get("scout") ?? undefined, takenAt: form.get("takenAt") ?? undefined, kind: form.get("kind") ?? undefined });
  if (!parsed.success) return bad(`invalid input: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return bad("photo (image file) is required");
  if (photo.size > MAX_PHOTO_BYTES) return bad("photo is larger than 15 MB", 413);
  const voice = form.get("voice");
  if (voice !== null && !(voice instanceof File && /wav/.test(voice.type))) return bad("voice must be a WAV file");
  if (voice instanceof File && voice.size > MAX_VOICE_BYTES) return bad("voice note is too long", 413);

  let prepared;
  try {
    prepared = await preparePhoto(Buffer.from(await photo.arrayBuffer()));
  } catch {
    return bad("could not read the image");
  }

  if (!hasDb()) {
    // No storage configured: still measure the photo, but nothing is saved.
    const p = await processPhoto(prepared, { kind: parsed.data.kind });
    return NextResponse.json({
      ok: true,
      data: { reportId: null, measurements: p.measurements, facesBlurred: p.facesBlurred, sam: p.sam },
      degraded: ["database not configured — report not saved", ...p.degraded].join("; "),
    });
  }

  try {
    const known = await findDuplicate(prepared.sha256);
    if (known) {
      return NextResponse.json({
        ok: true,
        data: {
          reportId: known.report_id, photoId: known.id, eventId: known.event_id, publicUrl: known.public_url,
          annotatedUrl: known.annotated_url, measurements: known.measurements, duplicate: true,
        },
      });
    }
    const { lat, lng, text, scout, takenAt, kind } = parsed.data;
    const userId = await ensureUserId();
    const voiceWav = voice instanceof File ? Buffer.from(await voice.arrayBuffer()) : null;
    if (kind === "slope") {
      // Slope Sentinel: never touches road events. The risk agent runs after the response.
      const data = await submitSlopeReport({ userId, scoutRequestId: scout ?? null, takenAt: takenAt ?? null, photo: prepared, lat, lng, text: text || null, voiceWav });
      const { degraded, ...rest } = data;
      if (data.siteId) after(() => assessSite(data.siteId!, { trigger: "a new photo of this slope" }).then(() => undefined, (err: Error) => console.warn("[slope] assess failed:", err.message)));
      return NextResponse.json({ ok: true, data: rest, ...(degraded.length && { degraded: degraded.join("; ") }) });
    }
    const data = await submitReport({
      userId,
      scoutRequestId: scout ?? null,
      takenAt: takenAt ?? null,
      photo: prepared,
      lat,
      lng,
      text: text || null,
      voiceWav,
    });
    const { degraded, ...rest } = data;
    // Road Watch is event-driven: re-check watched trips near this event once the response is sent.
    if (data.eventAction === "created" || data.eventAction === "merged") after(() => roadWatchAfterChange([{ lat, lng }]));
    return NextResponse.json({ ok: true, data: rest, ...(degraded.length && { degraded: degraded.join("; ") }) });
  } catch (err) {
    // Database/storage trouble is a real server error (not an AI fallback case) — report it, don't crash.
    console.error("[reports] save failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "could not save the report, please try again" }, { status: 503 });
  }
}
