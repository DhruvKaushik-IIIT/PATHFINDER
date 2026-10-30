// Server-only: assess one slope site (Phase 6B). The risk agent proposes a level (Muse Wonder → Spark Open),
// the code matrix is the fallback, and code caps decide what is stored. No AI when nothing changed:
// callers only run this after a new photo, or when the forecast turns wet (cron).
import { assessSlopeRisk } from "../ai/router.ts";
import { update } from "../db/supabase.ts";
import { pointRisk } from "../risk/forecast.ts";
import { slideHistory } from "../ai/tools/slope.ts";
import { applyCaps, codeLevel, type Overall } from "./caps.ts";
import { changeLines } from "./metrics.ts";
import { addHistory, getSite, siteObservations } from "./sites.ts";
import { SLOPE_RANK, SLOPE_WORD, type SlopeAssessment, type SlopeLevel, type SlopeSite } from "./types.ts";
import { slopeWatchAlerts } from "./watch.ts";

const h = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : null);

/** Code-written advice for the fallback / mock path. */
function codeAdvice(level: SlopeLevel, place: string | null): { advice: string; adviceHi: string } {
  const at = place ? ` near ${place}` : "";
  if (level === "high" || level === "elevated")
    return {
      advice: `Warning signs on the slope${at}. Cross in daylight, don't stop or park under it, and check with police / PWD before driving in heavy rain.`,
      adviceHi: `${place ? `${place} के पास ` : ""}ढलान पर ख़तरे के संकेत हैं। दिन में पार करें, इसके नीचे न रुकें, और तेज़ बारिश में पुलिस / PWD से पूछ लें।`,
    };
  return {
    advice: `Minor signs on the slope${at}. Drive normally, don't stop right under it.`,
    adviceHi: `${place ? `${place} के पास ` : ""}ढलान पर हल्के संकेत हैं। सामान्य रूप से चलें, ठीक नीचे न रुकें।`,
  };
}

export interface AssessResult {
  siteId: string;
  previous: SlopeLevel;
  level: SlopeLevel;
  assessment: SlopeAssessment;
  alerts: number;
}

export async function assessSite(siteId: string, opts: { trigger: string; replay?: boolean; site?: SlopeSite }): Promise<AssessResult | null> {
  const site = opts.site ?? (await getSite(siteId));
  if (!site) return null;
  const observations = await siteObservations(site.id, 10);
  const valid = observations.filter((o) => o.check && o.check.verdict !== "reject");
  const latest = valid[0];
  const replay = opts.replay ?? false;

  // Inputs code always needs (the agent's tools see the same numbers).
  const [rain, slides] = await Promise.all([pointRisk(site.lat, site.lng, 24, { replay }).catch(() => null), slideHistory(site)]);
  const changes = changeLines(observations);
  const growing = changes.some((c) => /larger|new since/.test(c));
  const matrix = codeLevel({ overall: (latest?.check?.finalOverall ?? "none") as Overall, rain: rain?.level ?? null, slides90d: slides.length, growing });

  const ctx = { site, observations, replay, seen: {} };
  const res = await assessSlopeRisk(ctx, opts.trigger);
  const agent = res.data.risk;
  const proposed: SlopeLevel = agent?.level ?? matrix.level;

  const qualifying = valid.find((o) => o.check!.twoModels && (o.check!.finalOverall === "concerning" || o.check!.finalOverall === "severe"));
  const newPhoto = !site.last_assessed_at || (latest ? latest.created_at > site.last_assessed_at : false);
  const capped = applyCaps({
    proposed,
    previous: site.risk_level,
    newPhoto,
    qualifyingReadingAgeH: qualifying ? h(qualifying.created_at) : null,
    lastPhotoAgeH: h(latest?.created_at ?? site.last_observed_at),
  });
  const advice = agent ?? { ...codeAdvice(capped.level, site.place_name), reasons: matrix.reasons, confidence: 0.5, recheckInHours: rain && rain.level !== "none" ? 6 : 24 };

  const assessment: SlopeAssessment = {
    level: capped.level,
    confidence: advice.confidence,
    reasons: advice.reasons,
    advice: advice.advice,
    adviceHi: advice.adviceHi,
    recheckInHours: advice.recheckInHours,
    by: agent ? (res.data.by as SlopeAssessment["by"]) : "code",
    modelLevel: capped.level !== proposed ? proposed : null,
    capNote: capped.note,
    rain: rain ? { mm: rain.rainMm, maxHourlyMm: rain.maxHourlyMm, level: rain.level, source: rain.source, replayDate: rain.replayDate, wettestAt: rain.wettestAt } : null,
    slides90d: slides.length,
    changes,
    trace: res.data.trace,
    at: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  const patch = { risk_level: capped.level, risk: assessment, last_assessed_at: now };
  if (capped.level !== site.risk_level) {
    const who = assessment.by === "meta" ? "Muse Wonder" : assessment.by === "baseten" ? "Muse Spark Open" : "code rules";
    site.history = await addHistory(site, { at: now, kind: "risk", text: `Risk ${SLOPE_WORD[site.risk_level].toLowerCase()} → ${SLOPE_WORD[capped.level].toLowerCase()}: ${assessment.reasons[0] ?? ""}`, actor: `Slope Sentinel · ${who}` }, patch);
  } else await update("slope_sites", `id=eq.${site.id}`, patch);

  // Road Watch: a site on a watched route rising to elevated/high → alert (plain code, no AI).
  let alerts = 0;
  if (SLOPE_RANK[capped.level] >= 2 && SLOPE_RANK[capped.level] > SLOPE_RANK[site.risk_level]) {
    alerts = await slopeWatchAlerts({ ...site, risk_level: capped.level, risk: assessment }).catch((err: Error) => {
      console.warn("[slope] watch alerts failed:", err.message);
      return 0;
    });
  }
  return { siteId: site.id, previous: site.risk_level, level: capped.level, assessment, alerts };
}

/** No new photo for 72 h → a site above "watch" decays to "watch" (plain code, no AI). */
export async function decaySite(site: SlopeSite): Promise<boolean> {
  const age = h(site.last_observed_at);
  if (SLOPE_RANK[site.risk_level] <= 1 || age === null || age <= 72) return false;
  const now = new Date().toISOString();
  await addHistory(site, { at: now, kind: "decay", text: `Risk ${SLOPE_WORD[site.risk_level].toLowerCase()} → watch: no new photo for 3 days`, actor: "Slope Sentinel · code" }, {
    risk_level: "watch",
    risk: site.risk ? { ...site.risk, level: "watch", capNote: "Capped by code: no new photo for 72 h", at: now } : null,
  });
  return true;
}
