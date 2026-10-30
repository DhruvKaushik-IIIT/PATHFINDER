// Server-only: photo half of the report pipeline (CLAUDE.md 6.1 INGEST).
// raw upload → strip EXIF + resize → SAM (privacy + measurement concepts, in parallel)
// → blurred public copy → measurements. Never throws on AI failure; it degrades instead.
import { createHash } from "node:crypto";
import { segment, SAM_COST_PER_IMAGE } from "../ai/router.ts";
import type { SamResult } from "../ai/sam.ts";
import { measure, type ConceptResults, type PhotoMeasurements } from "../images/measure.ts";
import { prepareImage } from "../images/prepare.ts";
import { blurRegions, heavyBlurThumb } from "../images/privacy.ts";
import { SLOPE_SAM_CONCEPTS } from "../slope/types.ts";

export const PRIVACY_CONCEPTS = ["face", "license plate"] as const;
// Phase 0 finding: "debris" finds nothing on real slides → "landslide" (whole slide) + "rock" (stones).
export const MEASURE_CONCEPTS = ["road", "vehicle", "excavator", "landslide", "rock", "snow"] as const;

/** Compact per-concept summary stored in photos.sam_masks (raw RLE masks are not kept). */
export interface SamSummary {
  concept: string;
  ok: boolean;
  boxes: { left: number; top: number; right: number; bottom: number; confidence?: number }[];
  areaPct: number;
}

export interface ProcessedPhoto {
  sha256: string;
  original: Buffer; // EXIF-stripped, ≤1280 px, NOT blurred → private bucket only
  public: Buffer; // faces + plates blurred, or a heavy-blur thumbnail if the privacy pass failed
  width: number;
  height: number;
  facesBlurred: boolean;
  blurredRegions: number;
  measurements: PhotoMeasurements;
  sam: SamSummary[];
  /** SAM concept results, kept in memory for the annotation step (Part C). */
  samResults: ConceptResults;
  samCostUsd: number;
  degraded: string[];
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface PreparedPhoto {
  jpeg: Buffer;
  width: number;
  height: number;
  sha256: string;
}

/** Cheap first step (no AI): normalise + hash, so the caller can skip photos it has already analysed. */
export async function preparePhoto(raw: Buffer): Promise<PreparedPhoto> {
  const { jpeg, width, height } = await prepareImage(raw);
  return { jpeg, width, height, sha256: sha256(jpeg) };
}

/**
 * kind "road" (default): privacy + road measurement concepts.
 * kind "slope" (Phase 6B): privacy + slope concepts; no road measurement (signMetrics() works on `sam`).
 */
export async function processPhoto(
  { jpeg, width, height, sha256: hash }: PreparedPhoto,
  opts: { kind?: "road" | "slope" } = {},
): Promise<ProcessedPhoto> {
  const degraded: string[] = [];
  const slope = opts.kind === "slope";
  const work: readonly string[] = slope ? SLOPE_SAM_CONCEPTS : MEASURE_CONCEPTS;

  const concepts = [...PRIVACY_CONCEPTS, ...work];
  const runs = await Promise.all(concepts.map((c) => segment(jpeg, c)));
  const samResults: ConceptResults = {};
  concepts.forEach((c, i) => (samResults[c] = runs[i]!.data));
  const samCalls = runs.filter((r) => r.source === "meta").length;

  // Privacy: only publish a full-size copy if BOTH privacy concepts actually ran.
  const privacy = PRIVACY_CONCEPTS.map((c) => samResults[c]);
  let pub: Buffer;
  let facesBlurred = false;
  let blurredRegions = 0;
  if (privacy.every((r): r is SamResult => Boolean(r))) {
    const boxes = privacy.flatMap((r) => r.boxes);
    pub = await blurRegions(jpeg, boxes);
    facesBlurred = true;
    blurredRegions = boxes.length;
  } else {
    pub = await heavyBlurThumb(jpeg);
    degraded.push("privacy check unavailable — photo kept private, only a blurred thumbnail is public");
  }

  const measurements: PhotoMeasurements = slope
    ? { method: { reference: "none", notes: ["slope photo: no road measurement"] }, confidence: 0 }
    : measure(samResults, width, height);
  if (work.some((c) => !samResults[c])) degraded.push("AI measurement unavailable right now");

  const imgArea = width * height;
  const sam: SamSummary[] = concepts.map((c) => {
    const r = samResults[c];
    return {
      concept: c,
      ok: Boolean(r),
      boxes: (r?.boxes ?? []).map(({ left, top, right, bottom, confidence }) => ({ left, top, right, bottom, confidence })),
      areaPct: r ? Math.round((r.masks.reduce((t, m) => t + m.areaPx, 0) / imgArea) * 1000) / 10 : 0,
    };
  });

  return {
    sha256: hash,
    original: jpeg,
    public: pub,
    width,
    height,
    facesBlurred,
    blurredRegions,
    measurements,
    sam,
    samResults,
    samCostUsd: samCalls * SAM_COST_PER_IMAGE,
    degraded,
  };
}
