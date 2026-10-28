// Versioned prompts: news ingest (cold start). Step 1 = Meta Spark + web_search grounding;
// step 2 = a different model turns the cited text into structured NewsItems.
export const NEWS_PROMPT_VERSION = "news-v1";

export function newsSearchPrompt(nowIst: string): string {
  return `Today is ${nowIst} (IST). Search the web for NEWS PUBLISHED IN THE LAST 72 HOURS about road disruptions in Himachal Pradesh, India: closures, one-lane traffic, landslides, snow, flooding, road collapse — and roads reported reopened.
Only include an item if you opened the article and its publication date is visible and within the last 72 hours. Old articles (earlier months or years) must be left out even if they look relevant.
For each item give: the place (nearest village/town to the spot), district, the road (name and NH/SH number if given), the status (closed / one lane / slow / reopened), what happened in a few words, the article's publication date as shown on the page (ISO), and the article URL.
If you find nothing recent, say "No recent reports". Be brief: a plain list, no introduction.`;
}

export const NEWS_PARSE_SYSTEM = `You turn a short, web-search-grounded news digest about roads in Himachal Pradesh, India into structured items for a road-conditions app.
Rules:
- One item per place + road. Use ONLY facts in the digest. Never invent places, roads, dates or URLs.
- sourceUrl must be copied exactly from the numbered source list. If an item has no matching source, leave it out.
- publishedAt: the article's publication date from the digest (ISO 8601). null if the digest does not give one.
- placeName: the single most specific village/town/pass where the disruption is (e.g. "Banala", "Khalota", "Baralacha Pass"), not a district or a whole stretch "A to B" (pick the first place of a stretch).
- status: "closed" = no vehicles; "one_lane" = one-way / alternate traffic; "slow" = delays; "open" = reopened; "unknown".
- reopened: true when the news says the road was restored/reopened.
- eventType: landslide (rock/earth onto road) · road_damage (road caved in/collapsed/washed away) · snow · ice · flood_water · traffic · accident · closure_notice (closed by order, e.g. pass shut for winter) · other.
- summary: one short plain-English sentence for travellers. summaryHi: the same in simple Hindi (Devanagari).
- confidence 0..1: how clearly the digest supports the item (vague wording or a guessed date → low).
Reply with JSON only, matching the schema.`;

export function newsParseUserText(input: { nowIst: string; digest: string; sources: { url: string; title: string | null }[] }): string {
  return [
    `Now: ${input.nowIst} (IST).`,
    `Digest:`,
    input.digest,
    ``,
    `Sources:`,
    ...input.sources.map((s, i) => `[${i + 1}] ${s.url}${s.title ? ` — ${s.title}` : ""}`),
  ].join("\n");
}
