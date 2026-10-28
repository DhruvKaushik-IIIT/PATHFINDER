// Client-safe shapes for /me and scout alerts.
export interface MeProfile {
  /** false → this device has never reported or changed a setting (no row yet). */
  exists: boolean;
  name: string;
  title: string;
  district: string | null;
  points: number;
  verified: number;
  firstReports: number;
  scoutAnswers: number;
  badges: { id: string; name: string; need: string; earned: boolean }[];
  leaderboard: {
    district: string;
    rows: { rank: number; name: string; badge: string; points: number; you: boolean }[];
    you: { rank: number; points: number };
    includesDemo: boolean;
  } | null;
  settings: { scoutOptIn: boolean; locationMode: "off" | "while_using" };
}
