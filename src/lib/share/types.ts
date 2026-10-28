// Client-safe: the shareable alert card (frame 11).
export interface AlertCard {
  eventId: string;
  status: "open" | "slow" | "one_lane" | "closed" | "unknown";
  /** "NH-3 near Aut: one lane open" */
  title: string;
  /** Hindi line (the event's Hindi summary), lang="hi". */
  titleHi: string | null;
  /** "Full reopening expected ~2 PM · Buses wait" */
  detail: string | null;
  updatedAt: string;
  /** Illustration: Muse Image (cached per event type + status) or drawn by code when Muse Image is unavailable. */
  artUrl: string;
  artBy: "muse-image" | "code";
  url: string;
}
