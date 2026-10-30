// Server-only: "Can my vehicle cross?" (Phase 6C) end to end.
//   vehicle photo → privacy pass (SAM face/plate blur; SAM down → photo never sent, ask to pick)
//     → identifyVehicle (Baseten → Meta Spark); confidence < 0.6 / no match → "confirm" step
//   vehicle (spec table) + event measurements → code verdict (lib/fit/fit.ts)
//   road photo(s) + vehicle photo + code numbers → assessFit (Baseten) → checkFit (Meta, a different model)
//   final = code verdict lowered by the models, never raised. Cached 30 min per event version × vehicle × roof load.
import { assessFit, checkFit, identifyVehicle } from "../ai/router.ts";
import type { FitAssessment, FitCheck, VehicleId } from "../ai/schemas.ts";
import { select } from "../db/supabase.ts";
import { reopeningFor } from "../events/reopening.ts";
import { privacyPass, type PreparedPhoto } from "../reports/processPhoto.ts";
import type { ModelSource } from "../verification/types.ts";
import { computeFit, lowerOnly, profileFor, roadSideOf } from "./fit.ts";
import type { FitResult, FitVerdict, VehicleProfile } from "./types.ts";
import { VEHICLES, vehicleName } from "./vehicles.ts";

const CONFIRM_BELOW = 0.6;
/** A model's suggestion only lowers the verdict when it is at least this sure (else it's shown as advice). */
const MIN_LOWER_CONFIDENCE = 0.6;
const TTL_MS = 30 * 60_000;
const MAX_ROAD_PHOTOS = 2;

export interface FitInput {
  photo?: PreparedPhoto | null;
  vehicleId?: string | null;
  category?: string | null;
  roofLoad?: boolean;
}

export interface Identified extends VehicleId {
  by: ModelSource;
}

export type FitResponse =
  | { stage: "confirm"; identified: Identified | null; reason: string; degraded: string[] }
  | { stage: "report"; report: FitReport; degraded: string[] };

export interface FitReport {
  eventId: string;
  place: string | null;
  roadRef: string | null;
  status: string;
  vehicle: VehicleProfile;
  identified: Identified | null;
  code: FitResult;
  verdict: FitVerdict;
  /** Why the final verdict is lower than the code's (the models' view). */
  loweredBy: string | null;
  assessment: (FitAssessment & { by: ModelSource }) | null;
  check: (FitCheck & { by: ModelSource }) | null;
  twoModels: boolean;
  evidence: { photos: { url: string; ageH: number; source: string }[]; reports: number; official: { at: string; pct: number | null; status: string } | null };
  oneLaneAround: { earliest: string; latest: string } | null;
  usedVehiclePhoto: boolean;
  checkedAt: string;
  cached?: boolean;
}

interface EventRow {
  id: string;
  type: string;
  status: string;
  place_name: string | null;
  measurements: Record<string, unknown> | null;
  last_confirmed_at: string;
  sources: { reports?: number } | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
  photos: { public_url: string | null; annotated_url: string | null; created_at: string; source: string; faces_blurred: boolean }[];
}

const cache = new Map<string, { at: number; report: FitReport }>();
const hAgo = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);

async function fetchJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function loadFitEvent(id: string): Promise<EventRow | null> {
  const [ev] = await select<EventRow>(
    "events",
    `select=id,type,status,place_name,measurements,last_confirmed_at,sources,road_segments(road_ref,road_name),photos(public_url,annotated_url,created_at,source,faces_blurred)` +
      `&id=eq.${id}&resolved_at=is.null&photos.order=created_at.desc&photos.limit=6`,
  );
  return ev ?? null;
}

export async function checkVehicleFit(eventId: string, input: FitInput): Promise<FitResponse | null> {
  const degraded: string[] = [];
  const ev = await loadFitEvent(eventId);
  if (!ev) return null;

  // ---- 1. which vehicle
  let identified: Identified | null = null;
  let vehicleJpeg: Buffer | null = null;
  let sel = { vehicleId: input.vehicleId ?? null, category: input.category ?? null, roofLoad: Boolean(input.roofLoad) };
  if (input.photo) {
    const priv = await privacyPass(input.photo);
    if (!priv) {
      // 5.7: no blur → the vehicle photo never leaves the server. Ask the user to pick instead.
      return { stage: "confirm", identified: null, reason: "Privacy check unavailable right now, so we didn't send your photo anywhere. Pick your vehicle instead.", degraded: ["privacy check unavailable"] };
    }
    vehicleJpeg = priv.jpeg;
    const id = await identifyVehicle(priv.jpeg, VEHICLES.map((v) => ({ id: v.id, name: vehicleName(v) })));
    if (id.degraded) degraded.push(id.data ? `identify: ${id.degraded}` : "vehicle recognition unavailable");
    if (id.data) {
      const known = VEHICLES.some((v) => v.id === id.data!.id.matchedVehicleId);
      identified = { ...id.data.id, matchedVehicleId: known ? id.data.id.matchedVehicleId : null, by: id.data.by as ModelSource };
    }
    if (!identified || !identified.isVehicle) {
      return { stage: "confirm", identified, reason: identified ? "That doesn't look like a vehicle. Pick yours from the list." : "We couldn't recognise the vehicle right now. Pick yours from the list.", degraded };
    }
    if (!sel.vehicleId && !sel.category) {
      if (identified.confidence < CONFIRM_BELOW || !identified.matchedVehicleId) {
        return { stage: "confirm", identified, reason: identified.matchedVehicleId ? "Is this right?" : "This model isn't in our spec table yet — pick the closest one or a vehicle type.", degraded };
      }
      sel = { ...sel, vehicleId: identified.matchedVehicleId };
    }
    sel.roofLoad = sel.roofLoad || identified.roofLoad;
  }
  const vehicle = profileFor(sel);
  if (!vehicle) return { stage: "confirm", identified, reason: "Pick your vehicle from the list.", degraded };

  // ---- 2. cache (a re-check without a new road photo is free)
  const key = `${ev.id}:${ev.last_confirmed_at}:${ev.photos[0]?.created_at ?? ""}:${vehicle.vehicleId ?? vehicle.category}:${vehicle.roofLoad}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { stage: "report", report: { ...hit.report, identified: identified ?? hit.report.identified, cached: true }, degraded };

  // ---- 3. code verdict from the event's measurements
  const photos = ev.photos.filter((p) => p.public_url && p.faces_blurred);
  const newest = photos[0] ?? null;
  const road = roadSideOf({ type: ev.type, status: ev.status, measurements: ev.measurements, photoAt: newest?.created_at ?? null });
  const code = computeFit(vehicle, road);

  const [official] = await select<{ created_at: string; pct_cleared: number | null; status: string }>(
    "official_updates",
    `select=created_at,pct_cleared,status&event_id=eq.${ev.id}&created_at=gte.${new Date(Date.now() - 48 * 3_600_000).toISOString()}&order=created_at.desc&limit=1`,
  ).catch(() => []);
  const reopening = ev.status === "closed" ? await reopeningFor({ id: ev.id, type: ev.type, status: ev.status, measurements: ev.measurements }).catch(() => null) : null;

  // ---- 4. side-by-side reading by two models (skipped when there's no road photo to look at)
  const roadJpegs = (await Promise.all(photos.slice(0, MAX_ROAD_PHOTOS).map((p) => fetchJpeg(p.public_url!)))).filter((b): b is Buffer => Boolean(b));
  const facts = {
    vehicle: {
      name: vehicle.name, source: vehicle.source === "spec" ? "manufacturer spec table" : "vehicle type range",
      bodyWidthM: vehicle.widthM, widthWithMirrorsM: code.widthWithMirrorsM, mirrorsEstimated: true, lengthM: vehicle.lengthM,
      groundClearanceMm: vehicle.clearanceMm, fourByFour: vehicle.fourByFour, roofLoad: vehicle.roofLoad,
      extras: identified?.extras ?? [], loadedHeavily: identified?.loadedHeavily ?? null,
    },
    road: {
      place: ev.place_name, road: ev.road_segments?.road_ref ?? null, eventType: ev.type, status: ev.status,
      gapLeftM: road.gapM, roadTotalWidthM: road.totalM, newestPhotoHoursAgo: newest ? Math.round(hAgo(newest.created_at) * 10) / 10 : null,
      officialUpdate: official ? { hoursAgo: Math.round(hAgo(official.created_at)), pctCleared: official.pct_cleared, status: official.status } : null,
    },
    code: { verdict: code.verdict, neededGapM: Math.round(code.neededM * 100) / 100, safetyMarginM: code.safetyM, caps: code.caps },
  };
  let assessment: FitReport["assessment"] = null;
  let check: FitReport["check"] = null;
  if (roadJpegs.length) {
    const a = await assessFit(roadJpegs, vehicleJpeg, facts);
    if (a.data) {
      assessment = { ...a.data.a, by: a.data.by as ModelSource };
      const c = await checkFit(roadJpegs, vehicleJpeg, a.data.a, facts, a.data.by);
      if (c.data) check = { ...c.data.c, by: c.data.by as ModelSource };
      else degraded.push("second AI check unavailable — 1 model");
    } else degraded.push("AI reading unavailable — numbers only");
  } else degraded.push("no road photo to compare with — numbers only");

  // ---- 5. final verdict: code, lowered (never raised) by a model that is ≥60% sure of its view
  const sure = (x: { confidence: number } | null) => Boolean(x && x.confidence >= MIN_LOWER_CONFIDENCE);
  let verdict = sure(assessment) ? lowerOnly(code.verdict, assessment!.suggestedVerdict) : code.verdict;
  let loweredBy: string | null = verdict !== code.verdict ? `${assessment!.by === "baseten" ? "Muse Spark Open" : "Muse Spark"}: ${assessment!.reasoning}` : null;
  if (check && check.verdict !== "agree" && sure(check)) {
    const v2 = lowerOnly(verdict, check.suggestedVerdict);
    if (v2 !== verdict) [verdict, loweredBy] = [v2, `Second check: ${check.reasoning}`];
  }

  const report: FitReport = {
    eventId: ev.id, place: ev.place_name, roadRef: ev.road_segments?.road_ref ?? ev.road_segments?.road_name ?? null, status: ev.status,
    vehicle, identified, code, verdict, loweredBy, assessment, check,
    twoModels: Boolean(assessment && check && assessment.by !== check.by),
    evidence: {
      photos: photos.slice(0, MAX_ROAD_PHOTOS).map((p) => ({ url: p.annotated_url ?? p.public_url!, ageH: Math.round(hAgo(p.created_at) * 10) / 10, source: p.source })),
      reports: ev.sources?.reports ?? 0,
      official: official ? { at: official.created_at, pct: official.pct_cleared, status: official.status } : null,
    },
    oneLaneAround: reopening?.oneLane ?? null,
    usedVehiclePhoto: Boolean(vehicleJpeg),
    checkedAt: new Date().toISOString(),
  };
  if (assessment) cache.set(key, { at: Date.now(), report });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return { stage: "report", report, degraded };
}
