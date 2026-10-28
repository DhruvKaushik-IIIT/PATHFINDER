// Server-only: the traveller's own profile for /me (frame 12) — points, verified reports, first reports,
// badges, district leaderboard, settings. Plain code over reports/users; no AI.
import { select } from "../db/supabase.ts";
import type { MeProfile } from "./types.ts";

interface UserRow {
  id: string;
  display_name: string | null;
  points: number;
  district: string | null;
  scout_opt_in: boolean;
  location_mode: "off" | "while_using" | "always";
}

export const defaultName = (id: string) => `Scout ${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

const BADGES = [
  { id: "pahad_scout", name: "Pahad Scout", need: "1 verified report", ok: (s: Stats) => s.verified >= 1 },
  { id: "first_responder", name: "First Responder", need: "first to report a problem", ok: (s: Stats) => s.firstReports >= 1 },
  { id: "road_guardian", name: "Road Guardian", need: "10 verified reports", ok: (s: Stats) => s.verified >= 10 },
] as const;

interface Stats {
  verified: number;
  firstReports: number;
}

/** Badge from points, shown next to names on the leaderboard. */
const title = (points: number) => (points >= 1000 ? "Road Guardian" : points >= 300 ? "First Responder" : "Pahad Scout");

export async function profileFor(userId: string | null): Promise<MeProfile> {
  const [u] = userId
    ? await select<UserRow>("users", `select=id,display_name,points,district,scout_opt_in,location_mode&id=eq.${userId}&limit=1`)
    : [];
  const stats: Stats = { verified: 0, firstReports: 0 };
  let scoutAnswers = 0;
  if (u) {
    const mine = await select<{ id: string; event_id: string | null; status: string; created_at: string }>(
      "reports",
      `select=id,event_id,status,created_at&user_id=eq.${u.id}&limit=500`,
    );
    const accepted = mine.filter((r) => r.status === "accepted");
    stats.verified = accepted.length;
    const eventIds = [...new Set(accepted.map((r) => r.event_id).filter(Boolean))] as string[];
    if (eventIds.length) {
      // First to report = the earliest report on that event is this user's.
      const all = await select<{ event_id: string; user_id: string | null; created_at: string }>(
        "reports",
        `select=event_id,user_id,created_at&event_id=in.(${eventIds.join(",")})&order=created_at.asc&limit=2000`,
      );
      const first = new Map<string, string | null>();
      for (const r of all) if (!first.has(r.event_id)) first.set(r.event_id, r.user_id);
      stats.firstReports = [...first.values()].filter((id) => id === u.id).length;
    }
    if (mine.length) {
      const answered = await select<{ id: string }>("scout_requests", `select=id&fulfilled_by_report_id=in.(${mine.map((r) => r.id).join(",")})`);
      scoutAnswers = answered.length;
    }
  }

  const district = u?.district ?? null;
  let leaderboard: MeProfile["leaderboard"] = null;
  if (district) {
    const top = await select<{ id: string; display_name: string | null; points: number; is_demo: boolean }>(
      "users",
      `select=id,display_name,points,is_demo&district=eq.${encodeURIComponent(district)}&role=eq.public&points=gt.0&order=points.desc&limit=3`,
    );
    const above = await select<{ id: string }>("users", `select=id&district=eq.${encodeURIComponent(district)}&role=eq.public&points=gt.${u!.points}&limit=1000`);
    leaderboard = {
      district,
      rows: top.map((r, i) => ({ rank: i + 1, name: r.display_name ?? defaultName(r.id), badge: title(r.points), points: r.points, you: r.id === u!.id })),
      you: { rank: above.length + 1, points: u!.points },
      includesDemo: top.some((r) => r.is_demo),
    };
  }

  return {
    exists: Boolean(u),
    name: u ? (u.display_name ?? defaultName(u.id)) : "You",
    title: title(u?.points ?? 0),
    district,
    points: u?.points ?? 0,
    verified: stats.verified,
    firstReports: stats.firstReports,
    scoutAnswers,
    badges: BADGES.map((b) => ({ id: b.id, name: b.name, need: b.need, earned: b.ok(stats) })),
    leaderboard,
    settings: { scoutOptIn: u?.scout_opt_in ?? false, locationMode: u?.location_mode === "always" ? "while_using" : (u?.location_mode ?? "off") },
  };
}
