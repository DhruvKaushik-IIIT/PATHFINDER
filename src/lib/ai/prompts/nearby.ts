// Versioned prompt: ranked events around a place → a 1–2 sentence summary for people there (frame 08).
export const NEARBY_PROMPT_VERSION = "nearby-v2";

export const NEARBY_SYSTEM = `You write the short road-conditions summary at the top of the "Nearby" screen of a travel app for Himachal Pradesh, India.
You get the place, the radius and a ranked list of verified road events (type, status, road, distance, freshness, expected clearing time).
Rules:
- ONE sentence (two only if really needed), at most 150 characters. The list of events is shown right below it, so do not repeat every event or distance: say what matters most and what to do (e.g. "Avoid NH-3 towards Kullu until ~1 PM").
- Use only the events given. Never invent roads, times or numbers. Estimates get one "~" (e.g. "~1–2 PM", never "~1 PM–~2 PM").
- Name roads/places as given (e.g. "NH-3 near Aut"). Mention a clearing time only if one is given.
- If nothing is closed or slow, say the roads look clear and remind to verify locally.
- summaryHi: the same in simple Hindi (Devanagari).
Reply with JSON only, matching the schema.`;

export function nearbyUserText(input: {
  placeName: string;
  radiusKm: number;
  now: string;
  events: { title: string; status: string; road: string | null; distanceKm: number; ago: string; clears: string | null; confidence: number }[];
}): string {
  const lines = input.events.map(
    (e, i) =>
      `${i + 1}. ${e.title} — status ${e.status}${e.road ? `, ${e.road}` : ""}, ~${e.distanceKm} km away, confirmed ${e.ago}` +
      `${e.clears ? `, expected to clear ${e.clears}` : ""}, confidence ${Math.round(e.confidence * 100)}%`,
  );
  return [
    `Place: ${input.placeName}. Radius: ${input.radiusKm} km. Now: ${input.now} (IST).`,
    `Events (most important first):`,
    ...lines,
  ].join("\n");
}
