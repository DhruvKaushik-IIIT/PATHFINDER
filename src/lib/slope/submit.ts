// Server-only: the Slope report pipeline (Phase 6B), used by POST /api/reports with kind=slope.
//   photo → privacy + SAM slope concepts ┐
//   voice → transcript                   ├ in parallel
//   GPS   → road segment + place name    ┘
//   → reading (Baseten Spark Open → Meta Spark) → independent check (Meta Spark → Baseten → rules)
//   → save report/photo → join or create a slope site → observation (+ change metrics) → annotated copy.
// The risk agent runs AFTER the response (the route calls assessSite via after()). Never touches events.
import { checkSlope, readSlope, transcribe } from "../ai/router.ts";
import type { SlopeReading } from "../ai/schemas.ts";
import { insert, publicUrl, update, upload } from "../db/supabase.ts";
import { snapToRoad } from "../geo/snap.ts";
import { annotateSlope } from "../images/annotateSlope.ts";
import { creditUser } from "../me.ts";
import { processPhoto, type PreparedPhoto } from "../reports/processPhoto.ts";
import { fulfilScoutRequest } from "../scout/requests.ts";
import type { ModelSource } from "../verification/types.ts";
import { changeLines, keptSigns, signMetrics } from "./metrics.ts";
import { addHistory, createSite, findSite, siteObservations } from "./sites.ts";
import { SIGN_LABEL, type SlopeCheckRecord, type SlopeObservation } from "./types.ts";

export const SLOPE_POINTS = 20; // accepted photo that adds a new sign or a newer view
const NEWER_VIEW_H = 6;
const DEVANAGARI = /[ऀ-ॿ]/;

export interface SlopeSubmitInput {
  photo: PreparedPhoto;
  lat: number;
  lng: number;
  text: string | null;
  voiceWav: Buffer | null;
  userId?: string | null;
  scoutRequestId?: string | null;
  takenAt?: string | null;
  isDemo?: boolean;
}

export interface SlopeSubmitResult {
  kind: "slope";
  reportId: string;
  photoId: string;
  siteId: string | null;
  siteAction: "created" | "joined" | "none";
  observations: number;
  reportStatus: "accepted" | "pending" | "rejected";
  reading: (SlopeReading & { by: ModelSource }) | null;
  check: SlopeCheckRecord | null;
  changes: string[];
  points: number;
  scoutBonus: number;
  lat: number;
  lng: number;
  placeName: string | null;
  road: { segmentId: string; ref: string | null } | null;
  publicUrl: string;
  annotatedUrl: string | null;
  transcript: string | null;
  facesBlurred: boolean;
  timingsMs: Record<string, number>;
  degraded: string[];
}

const RANK = { none: 0, minor: 1, concerning: 2, severe: 3 } as const;
const OVERALLS = ["none", "minor", "concerning", "severe"] as const;

export async function submitSlopeReport(input: SlopeSubmitInput): Promise<SlopeSubmitResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const degraded: string[] = [];
  const { photo, lat, lng, text } = input;
  const takenMs = input.takenAt ? Date.parse(input.takenAt) : NaN;
  const shotAt = Number.isFinite(takenMs) && takenMs < Date.now() + 3_600_000 ? new Date(takenMs).toISOString() : new Date().toISOString();

  const [p, voice, snap] = await Promise.all([
    processPhoto(photo, { kind: "slope" }).finally(() => (timings.sam = Date.now() - t0)),
    input.voiceWav ? transcribe(input.voiceWav).finally(() => (timings.voice = Date.now() - t0)) : null,
    snapToRoad(lat, lng),
  ]);
  degraded.push(...p.degraded);
  if (voice?.degraded) degraded.push(voice.data ? `voice: ${voice.degraded}` : "transcript unavailable");
  const transcript = voice?.data?.text ?? null;
  const roadRef = snap.segment?.road_ref ?? snap.segment?.road_name ?? null;

  const t1 = Date.now();
  const read = await readSlope({
    jpeg: p.original, placeName: snap.placeName, roadRef, at: shotAt, width: p.width, height: p.height,
    sam: p.sam.filter((s) => s.concept !== "face" && s.concept !== "license plate"), transcript, text,
  });
  timings.read = Date.now() - t1;
  const reading = read.data ? { ...read.data.reading, by: read.data.by as ModelSource } : null;
  if (!reading) degraded.push("AI slope reading unavailable — saved for review");
  else if (read.degraded) degraded.push(`reading: ${read.degraded}`);

  let check: SlopeCheckRecord | null = null;
  if (reading) {
    const t2 = Date.now();
    const ctx = `Photo of the slope at ${snap.placeName ?? "an unknown place"}${roadRef ? ` on ${roadRef}` : ""}, taken ${shotAt}.`;
    const c = await checkSlope(p.original, reading, ctx);
    timings.check = Date.now() - t2;
    if (c.degraded) degraded.push(c.data.by === "rules" ? "second AI check unavailable — rule-based check" : `check: ${c.degraded}`);
    const by = c.data.by as ModelSource;
    const ch = c.data.check;
    // The checker can only lower the level, never raise it.
    const lowered = ch.verdict === "downgrade" && ch.correctedOverall && RANK[ch.correctedOverall] < RANK[reading.overall] ? ch.correctedOverall : null;
    const finalOverall = ch.verdict === "reject" || !reading.isSlopePhoto ? "none" : (lowered ?? reading.overall);
    check = { ...ch, by, readBy: reading.by, twoModels: by !== reading.by && by !== "rules" && by !== "mock", finalOverall };
  }
  const reportStatus: SlopeSubmitResult["reportStatus"] = !reading || !check ? "pending" : check.verdict === "reject" || !reading.isSlopePhoto ? "rejected" : "accepted";

  // ---- persist report + photo (same buckets/privacy rules as road reports)
  const [report] = await insert<{ id: string }>("reports", {
    user_id: input.userId ?? null, lat, lng, text, kind: "slope",
    segment_id: snap.segment?.id ?? null, media_type: "photo", transcript,
    transcript_lang: transcript ? (DEVANAGARI.test(transcript) ? "hi" : "en") : null,
    status: reportStatus, is_demo: input.isDemo ?? false,
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
    report_id: id, sha256: p.sha256, original_url: `photos-original/${id}.jpg`, public_url: pubUrl,
    width: p.width, height: p.height, sam_masks: p.sam, measurements: p.measurements, faces_blurred: p.facesBlurred,
    source: input.scoutRequestId ? "scout" : "traveller", is_demo: input.isDemo ?? false,
  });
  if (reading) {
    await insert("claims", { report_id: id, source: "photo", payload: { slope: true, ...reading, check }, confidence: reading.confidence, is_demo: input.isDemo ?? false });
  }

  // ---- site + observation (accepted only)
  let siteId: string | null = null;
  let siteAction: SlopeSubmitResult["siteAction"] = "none";
  let observations = 0;
  let changes: string[] = [];
  let points = 0;
  if (reportStatus === "accepted" && reading && check) {
    let site = await findSite(lat, lng, snap.segment?.id ?? null);
    const before = site ? await siteObservations(site.id, 10) : [];
    if (!site) {
      site = await createSite({ lat, lng, segment_id: snap.segment?.id ?? null, road_ref: roadRef, place_name: snap.placeName, is_demo: input.isDemo ?? false });
      siteAction = "created";
    } else siteAction = "joined";
    siteId = site.id;
    const metrics = signMetrics(p.sam, p.width, p.height);
    const [obs] = await insert<SlopeObservation>("slope_observations", {
      site_id: site.id, report_id: id, photo_id: photoRow!.id, reading, check, sign_metrics: metrics, created_at: shotAt, is_demo: input.isDemo ?? false,
    });
    const all = [{ ...obs!, reading, check, sign_metrics: metrics }, ...before];
    observations = all.length;
    changes = changeLines(all);
    const signs = keptSigns({ reading, check });
    const latestBefore = before[0]?.created_at ?? null;
    const newerView = !latestBefore || (new Date(shotAt).getTime() - new Date(latestBefore).getTime()) / 3_600_000 >= NEWER_VIEW_H;
    const newSign = signs.some((k) => !before.some((o) => keptSigns(o).includes(k)));
    points = newerView || newSign ? SLOPE_POINTS : 5;
    const newestShot = latestBefore && latestBefore > shotAt ? latestBefore : shotAt;
    await addHistory(
      site,
      {
        at: shotAt,
        kind: "observation",
        text: `Photo: ${signs.length ? signs.map((k) => SIGN_LABEL[k] ?? k).join(", ") : "no clear warning signs"} · ${check.finalOverall}${check.twoModels ? " · 2 models checked" : ""}${changes.length ? ` · ${changes[0]}` : ""}`,
        actor: input.scoutRequestId ? "Scout" : "Traveller",
      },
      { last_observed_at: newestShot, ...(!site.place_name && snap.placeName && { place_name: snap.placeName }) },
    );
  } else if (reportStatus === "pending") points = 5;

  // ---- annotated copy (privacy-checked photos only)
  let annotatedUrl: string | null = null;
  if (reading && check && reportStatus !== "rejected" && p.facesBlurred) {
    try {
      const disputed = new Set(check.disputedSigns);
      const title = [snap.placeName, roadRef].filter(Boolean).join(" · ") || "Slope report";
      const time = new Date(shotAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
      const jpeg = await annotateSlope({
        jpeg: p.public, width: p.width, height: p.height, sam: p.samResults,
        signs: reading.signs.filter((s) => !disputed.has(s.kind)), overall: OVERALLS.includes(check.finalOverall) ? check.finalOverall : "none",
        title, subtitle: `${time} · Slope · ${check.twoModels ? "2 AI models checked" : "1 AI model"}`,
      });
      await upload("photos-public", `${id}-annotated.jpg`, jpeg, "image/jpeg");
      annotatedUrl = publicUrl("photos-public", `${id}-annotated.jpg`);
    } catch (err) {
      degraded.push("annotated photo unavailable");
      console.warn("[slope] annotate failed:", (err as Error).message);
    }
  }

  const scoutBonus = input.scoutRequestId && reportStatus !== "rejected" ? await fulfilScoutRequest(input.scoutRequestId, id) : 0;
  points += scoutBonus;
  if (input.userId) await creditUser(input.userId, points, { lat, lng }).catch((err: Error) => console.warn("[slope] points failed:", err.message));
  await Promise.all([
    update("reports", `id=eq.${id}`, { points_awarded: points }),
    update("photos", `id=eq.${photoRow!.id}`, { annotated_url: annotatedUrl }),
  ]);
  timings.total = Date.now() - t0;

  return {
    kind: "slope", reportId: id, photoId: photoRow!.id, siteId, siteAction, observations, reportStatus, reading, check, changes,
    points, scoutBonus, lat, lng, placeName: snap.placeName,
    road: snap.segment ? { segmentId: snap.segment.id, ref: roadRef } : null,
    publicUrl: pubUrl, annotatedUrl, transcript, facesBlurred: p.facesBlurred, timingsMs: timings, degraded,
  };
}
