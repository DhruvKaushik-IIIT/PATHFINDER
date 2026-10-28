// Server-only: build the shareable alert card for an event (frame 11). Text = code (exact EN + HI from
// the verified event); illustration = Muse Image, generated once per event type + status and cached in
// Storage (≈ a few dozen images ever, $0.01 each). Muse Image down → an illustration drawn by code.
// Evidence photos are never sent to or changed by Muse Image (CLAUDE.md 6.2 rule 4).
import sharp from "sharp";
import { alertArt } from "../ai/router.ts";
import { ALERT_ART_PROMPT_VERSION, alertArtPrompt } from "../ai/prompts/alertArt.ts";
import { publicUrl, select, upload } from "../db/supabase.ts";
import { clearWindow } from "../events/format.ts";
import { reopeningFor } from "../events/reopening.ts";
import type { AlertCard } from "./types.ts";

interface Row {
  id: string;
  type: string;
  status: AlertCard["status"];
  place_name: string | null;
  summary: string | null;
  summary_hi: string | null;
  last_confirmed_at: string;
  eta_clear: { earliest: string; latest: string } | null;
  passable: { bike: boolean | null; car: boolean | null; bus: boolean | null } | null;
  measurements: Record<string, unknown> | null;
  road_segments: { road_ref: string | null; road_name: string | null } | null;
}

const STATE: Record<AlertCard["status"], string> = { open: "open again", slow: "slow traffic", one_lane: "one lane open", closed: "closed", unknown: "conditions unclear" };
const WHAT: Record<string, string> = { snow: "snow", ice: "ice", flood_water: "water on road", traffic: "traffic jam", accident: "accident", road_damage: "road damaged" };
/** "NH3" → "NH-3", "MDR23" → "MDR-23" */
export const prettyRef = (r: string | null | undefined) => (r ? r.replace(/^([A-Z]+)\s*-?\s*(\d+\w*)$/i, (_m, a: string, b: string) => `${a.toUpperCase()}-${b}`) : null);

const ART_DIR = `cards/${ALERT_ART_PROMPT_VERSION}`;
const failedAt = new Map<string, number>(); // don't hammer Muse Image after a failure

async function exists(url: string): Promise<boolean> {
  const r = await fetch(url, { method: "HEAD" }).catch(() => null);
  return Boolean(r?.ok);
}

/** Muse Image illustration for this type + status (cached), else a code-drawn one. */
export async function ensureArt(type: string, status: string): Promise<{ url: string; by: AlertCard["artBy"] }> {
  const key = `${type}-${status}`;
  const musePath = `${ART_DIR}/${key}.jpg`;
  const museUrl = publicUrl("photos-public", musePath);
  if (await exists(museUrl)) return { url: museUrl, by: "muse-image" };
  if (Date.now() - (failedAt.get(key) ?? 0) > 30 * 60_000) {
    const r = await alertArt(alertArtPrompt(type, status));
    if (r.data) {
      const jpg = await sharp(r.data).resize(1024, 512, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();
      await upload("photos-public", musePath, jpg, "image/jpeg");
      return { url: museUrl, by: "muse-image" };
    }
    failedAt.set(key, Date.now());
  }
  const codePath = `${ART_DIR}/${key}-code.jpg`;
  const codeUrl = publicUrl("photos-public", codePath);
  if (!(await exists(codeUrl))) await upload("photos-public", codePath, await drawArt(type, status), "image/jpeg");
  return { url: codeUrl, by: "code" };
}

/** Last resort (5.7): the frame-11 style scene drawn as SVG — road, hills, and the problem shape. No text. */
async function drawArt(type: string, status: string): Promise<Buffer> {
  const blob: Record<string, string> = { snow: "#F4F6F7", ice: "#CFE3F2", flood_water: "#8DB4D6", road_damage: "#5B4A3C" };
  const fill = blob[type] ?? "#C98A3E";
  const barrier = status === "closed" ? '<rect x="420" y="330" width="184" height="18" rx="4" fill="#B3261E"/><rect x="440" y="330" width="24" height="18" fill="#fff"/><rect x="500" y="330" width="24" height="18" fill="#fff"/><rect x="560" y="330" width="24" height="18" fill="#fff"/>' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">
    <rect width="1024" height="512" fill="#9AA3A9"/>
    <path d="M0 250 L220 120 L420 210 L640 90 L1024 200 V512 H0Z" fill="#7F8B83"/>
    <path d="M0 300 L300 220 L560 280 L820 200 L1024 260 V512 H0Z" fill="#6E7C6B"/>
    <path d="M380 512 L470 250 L560 250 L760 512Z" fill="#4A4F52"/>
    <path d="M512 262 L512 512" stroke="#E8E8E8" stroke-width="6" stroke-dasharray="26 22"/>
    <path d="M430 400 Q470 300 560 292 Q640 300 690 420 Z" fill="${fill}" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>
    ${barrier}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}

export async function cardFor(eventId: string, origin: string): Promise<AlertCard | null> {
  const [r] = await select<Row>(
    "events",
    `select=id,type,status,place_name,summary,summary_hi,last_confirmed_at,eta_clear,passable,measurements,road_segments(road_ref,road_name)&id=eq.${eventId}&limit=1`,
  );
  if (!r) return null;
  const road = prettyRef(r.road_segments?.road_ref) ?? r.road_segments?.road_name ?? null;
  const place = r.place_name ?? "this road";
  const what = WHAT[r.type] && r.status !== "open" ? `${WHAT[r.type]}, ` : "";
  const title = `${road ? `${road} near ` : ""}${place}: ${what}${STATE[r.status] ?? STATE.unknown}`;

  // Clearing: reported/official window first, else the predictor's estimate.
  let clears: string | null = null;
  if (r.status !== "open") {
    const w = clearWindow(r.eta_clear);
    if (w) clears = `Full reopening expected ~${w}`;
    else {
      const p = await reopeningFor({ id: r.id, type: r.type, status: r.status, measurements: r.measurements }).catch(() => null);
      const pw = clearWindow(p?.fullyOpen ?? null);
      if (pw) clears = `Reopening estimated ~${pw}`;
    }
  }
  const pass = r.passable;
  const who =
    r.status === "closed" ? "No vehicles can pass" : pass?.car && pass.bus === false ? "Buses wait" : pass?.bike && pass.car === false ? "Two-wheelers only" : null;
  const art = await ensureArt(r.type, r.status);
  return {
    eventId: r.id,
    status: r.status,
    title,
    titleHi: r.summary_hi,
    detail: [clears, who].filter(Boolean).join(" · ") || r.summary,
    updatedAt: r.last_confirmed_at,
    artUrl: art.url,
    artBy: art.by,
    url: `${origin}/event/${r.id}`,
  };
}
