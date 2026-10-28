// Server-only: the whole report pipeline (CLAUDE.md 6.1), used by POST /api/reports.
//   photo → privacy + SAM measurements ┐
//   voice → transcript                 ├ in parallel
//   GPS   → road segment + place name  ┘
//   → claim (Baseten Spark Open → Meta Spark) → verifier (Meta Spark, independent)
//   → save report/photo/claims → merge into or create the road event → annotated photo.
// AI failures degrade (5.7); database failures throw (the route turns them into a clean 503).
import { transcribe, verifyClaim, writeClaim } from "../ai/router.ts";
import type { Claim, Verdict } from "../ai/schemas.ts";
import { insert, publicUrl, select, update, upload } from "../db/supabase.ts";
import { snapToRoad } from "../geo/snap.ts";
import { annotate } from "../images/annotate.ts";
import { applyToWorldState, pointsFor, type EventResult } from "./events.ts";
import { processPhoto, type PreparedPhoto } from "./processPhoto.ts";

export interface SubmitInput {
  photo: PreparedPhoto;
  lat: number;
  lng: number;
  text: string | null;
  voiceWav: Buffer | null;
}

export interface SubmitResult {
  reportId: string;
  photoId: string;
  eventId: string | null;
  eventAction: EventResult["action"];
  eventReports: number;
  points: number;
  lat: number;
  lng: number;
  reportStatus: EventResult["reportStatus"];
  publicUrl: string;
  annotatedUrl: string | null;
  placeName: string | null;
  road: { segmentId: string; ref: string | null; name: string | null; distanceM: number } | null;
  claims: Claim[];
  verdict: Verdict | null;
  verifiedBy: string | null;
  modelsAgreed: number;
  transcript: string | null;
  measurements: unknown;
  facesBlurred: boolean;
  timingsMs: Record<string, number>;
  degraded: string[];
}

const DEVANAGARI = /[ऀ-ॿ]/;

export async function submitReport(input: SubmitInput): Promise<SubmitResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const degraded: string[] = [];
  const { photo, lat, lng, text } = input;

  const [p, voice, snap] = await Promise.all([
    processPhoto(photo).finally(() => (timings.sam = Date.now() - t0)),
    input.voiceWav ? transcribe(input.voiceWav).finally(() => (timings.voice = Date.now() - t0)) : null,
    snapToRoad(lat, lng),
  ]);
  degraded.push(...p.degraded);
  if (voice?.degraded) degraded.push(voice.data ? `voice: ${voice.degraded}` : "transcript unavailable");
  const transcript = voice?.data?.text ?? null;

  const t1 = Date.now();
  const claimRes = await writeClaim({
    jpeg: p.original,
    placeName: snap.placeName,
    roadRef: snap.segment?.road_ref ?? snap.segment?.road_name ?? null,
    lat,
    lng,
    at: new Date().toISOString(),
    samMeasurements: p.measurements,
    transcript,
    text,
  });
  timings.claim = Date.now() - t1;
  const claims = claimRes.data?.claims ?? [];
  if (!claimRes.data) degraded.push("AI report unavailable — saved for review");
  else if (claimRes.degraded) degraded.push(`claim: ${claimRes.degraded}`);
  // The first claim is about the photo's spot; a model may still mislabel it, so look it up.
  const here = claims.find((c) => c.atReportLocation) ?? null;

  let verdict: Verdict | null = null;
  let verifiedBy: string | null = null;
  let modelsAgreed = 0;
  if (here) {
    const t2 = Date.now();
    const ctx = `Photo taken by a traveller at ${snap.placeName ?? "an unknown place"}${snap.segment?.road_ref ? ` on ${snap.segment.road_ref}` : ""}, just now.`;
    const v = await verifyClaim(p.original, here, ctx);
    timings.verify = Date.now() - t2;
    verdict = v.data.verdict;
    verifiedBy = v.data.by;
    if (v.degraded) degraded.push(v.data.by === "rules" ? "AI verifier unavailable — rule-based check" : `verify: ${v.degraded}`);
    // Two models agree only if they're different providers (Spark Open on Baseten vs Spark on Meta).
    const differentModels = claimRes.source !== verifiedBy && verifiedBy !== "rules";
    modelsAgreed = verdict.agrees && differentModels ? 2 : 1;
  }

  // ---- persist
  const [report] = await insert<{ id: string }>("reports", {
    lat, lng, text,
    segment_id: snap.segment?.id ?? null,
    media_type: "photo",
    transcript,
    transcript_lang: transcript ? (DEVANAGARI.test(transcript) ? "hi" : "en") : null,
    status: "pending",
  });
  const id = report!.id;
  const publicPath = `${id}${p.facesBlurred ? "" : "-thumb"}.jpg`;
  await Promise.all([
    upload("photos-original", `${id}.jpg`, p.original, "image/jpeg"),
    upload("photos-public", publicPath, p.public, "image/jpeg"),
    input.voiceWav ? upload("photos-original", `voice/${id}.wav`, input.voiceWav, "audio/wav") : null,
  ]);
  const pubUrl = publicUrl("photos-public", publicPath);

  const [photoRow] = await insert<{ id: string }>("photos", {
    report_id: id,
    sha256: p.sha256,
    original_url: `photos-original/${id}.jpg`,
    public_url: pubUrl,
    width: p.width,
    height: p.height,
    sam_masks: p.sam,
    measurements: p.measurements,
    faces_blurred: p.facesBlurred,
    source: "traveller",
  });
  if (claims.length) {
    await insert(
      "claims",
      claims.map((c) => ({ report_id: id, source: "photo", payload: c, confidence: c.confidence })),
    );
  }
  // TODO(phase-5): claims about OTHER places (atReportLocation=false, placeHint) go to the Investigator.

  let ev: EventResult = { eventId: null, action: "none", reportStatus: "pending", eventReports: 0 };
  if (here && verdict) {
    ev = await applyToWorldState({
      claim: here, verdict, verifiedBy: verifiedBy!, modelsAgreed,
      segmentId: snap.segment?.id ?? null, placeName: snap.placeName, lat, lng,
      reportId: id, photoUrl: pubUrl,
    });
  }

  // Annotated copy: only on a privacy-checked photo, never on the private original.
  let annotatedUrl: string | null = null;
  if (here && p.facesBlurred) {
    try {
      const shown = { ...here, status: verdict?.correctedStatus ?? here.status };
      const title = [snap.placeName, snap.segment?.road_ref].filter(Boolean).join(" · ") || "Road report";
      const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
      const conf = verdict ? ` · ${verdict.verdict === "accept" ? "Verified" : "Unverified"} ${Math.round(verdict.confidence * 100)}%` : "";
      const agree = modelsAgreed >= 2 ? " · 2 AI models agree" : "";
      const jpeg = await annotate({
        jpeg: p.public, width: p.width, height: p.height, sam: p.samResults, claim: shown,
        title, subtitle: `${time} · Traveller${conf}${agree}`,
      });
      await upload("photos-public", `${id}-annotated.jpg`, jpeg, "image/jpeg");
      annotatedUrl = publicUrl("photos-public", `${id}-annotated.jpg`);
    } catch (err) {
      degraded.push("annotated photo unavailable");
      console.warn("[reports] annotate failed:", (err as Error).message);
    }
  }

  await Promise.all([
    update("reports", `id=eq.${id}`, { status: ev.reportStatus, event_id: ev.eventId, points_awarded: pointsFor(ev) }),
    update("photos", `id=eq.${photoRow!.id}`, { event_id: ev.eventId, annotated_url: annotatedUrl }),
  ]);
  timings.total = Date.now() - t0;

  return {
    reportId: id,
    photoId: photoRow!.id,
    eventId: ev.eventId,
    eventAction: ev.action,
    eventReports: ev.eventReports,
    points: pointsFor(ev),
    lat,
    lng,
    reportStatus: ev.reportStatus,
    publicUrl: pubUrl,
    annotatedUrl,
    placeName: snap.placeName,
    road: snap.segment
      ? { segmentId: snap.segment.id, ref: snap.segment.road_ref, name: snap.segment.road_name, distanceM: Math.round(snap.segment.distance_m) }
      : null,
    claims,
    verdict,
    verifiedBy,
    modelsAgreed,
    transcript,
    measurements: p.measurements,
    facesBlurred: p.facesBlurred,
    timingsMs: timings,
    degraded,
  };
}

/** Same photo uploaded before → return what we stored (no AI re-run, 5.4). */
export async function findDuplicate(sha: string) {
  const [row] = await select<{ id: string; report_id: string; event_id: string | null; public_url: string; annotated_url: string | null; measurements: unknown }>(
    "photos",
    `sha256=eq.${sha}&select=id,report_id,event_id,public_url,annotated_url,measurements&limit=1`,
  );
  return row ?? null;
}
