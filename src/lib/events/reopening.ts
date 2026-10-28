// Server-only: gather an event's progress evidence (measured photos, official % cleared, machines on
// site) and run the plain-code reopening predictor (lib/clearing/estimate.ts). No AI.
import { diggingMachines, predictReopening, type ProgressPoint, type Range, type Reopening } from "../clearing/estimate.ts";
import { select } from "../db/supabase.ts";

interface PhotoRow {
  id: string;
  created_at: string;
  source: string;
  measurements: { blockedPct?: Range | null } | null;
}
interface UpdateRow {
  created_at: string;
  pct_cleared: number | null;
  machines: string[] | null;
  photo_id: string | null;
}

export interface ReopeningEvent {
  id: string;
  type: string;
  status: string;
  measurements: Record<string, unknown> | null;
}

/** Points for the trend: every measured photo, plus official "% cleared" where its photo couldn't be measured. */
export function progressPoints(photos: PhotoRow[], updates: UpdateRow[]): ProgressPoint[] {
  const measured = photos
    .filter((p) => p.measurements?.blockedPct)
    .map((p) => ({ id: p.id, at: p.created_at, blockedPct: (p.measurements!.blockedPct!.min + p.measurements!.blockedPct!.max) / 2, source: "photo" as const }));
  const first = [...measured].sort((a, b) => a.at.localeCompare(b.at))[0];
  const points: ProgressPoint[] = measured.map((p) => ({ at: p.at, blockedPct: p.blockedPct, source: p.source }));
  if (first) {
    const measuredIds = new Set(measured.map((p) => p.id));
    for (const u of updates) {
      if (u.pct_cleared == null || (u.photo_id && measuredIds.has(u.photo_id)) || u.created_at <= first.at) continue;
      points.push({ at: u.created_at, blockedPct: first.blockedPct * (1 - u.pct_cleared / 100), source: "official" });
    }
  }
  return points;
}

export async function reopeningFor(ev: ReopeningEvent): Promise<Reopening> {
  const [photos, updates, crews] = await Promise.all([
    select<PhotoRow>("photos", `select=id,created_at,source,measurements&event_id=eq.${ev.id}&order=created_at.asc&limit=40`),
    select<UpdateRow>("official_updates", `select=created_at,pct_cleared,machines,photo_id&event_id=eq.${ev.id}&order=created_at.desc&limit=20`),
    select<{ machines: string[] | null }>("crews", `select=machines&current_event_id=eq.${ev.id}`),
  ]);
  // Machines on site: the latest field update says what's actually working; else the assigned crews.
  const latest = updates[0];
  const machines = latest?.machines?.length && Date.now() - new Date(latest.created_at).getTime() < 12 * 3_600_000
    ? diggingMachines(latest.machines)
    : crews.reduce((n, c) => n + diggingMachines(c.machines), 0);
  return predictReopening({
    type: ev.type,
    status: ev.status,
    measurements: ev.measurements as Parameters<typeof predictReopening>[0]["measurements"],
    points: progressPoints(photos, updates),
    machines: Math.min(4, machines),
  });
}
