"use client";

// Frame 03 Route result (docs/design/glass-html/Route.dc.html). Two steps so it feels instant:
// 1. GET /api/route → map, route line, code verdict (no AI, ~1 s)
// 2. POST /api/route-check → the Route Check agent's verdict replaces it (5–30 s; cached 20 min)
import { ChevronLeft, ChevronRight, CloudRain, Sparkles, Sun, Wrench } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { STATUS_STYLE } from "@/lib/events/types";
import { clock, duration, VERDICT_STYLE } from "@/lib/geo/format";
import type { RoutePlan } from "@/lib/geo/routeTypes";
import type { WatchedTrip } from "@/lib/watch/types";
import RiskLayer from "@/components/map/RiskLayer";
import { replayLabel, type RouteRisk } from "@/lib/risk/types";
import { routeEventIds, type Repair } from "@/lib/repairs/types";
import StartActions from "./StartActions";
import { checkedBy, departLabel, eventTitle, saveCheck, VERDICT_WORD, type CheckResult } from "./routeData";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

export default function RouteScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);
  const [risk, setRisk] = useState<RouteRisk | null>(null);
  const [crewsAtWork, setCrewsAtWork] = useState(0);

  const from = params.get("from");
  const to = params.get("to");
  const fromName = params.get("fromName") ?? "";
  const toName = params.get("toName") ?? "";
  const depart = params.get("depart");
  // ?replay=1 → a saved real past rainy day instead of the live forecast (demo; labelled in the banner).
  const replay = params.get("replay") === "1";
  const query = params.toString();

  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    setPlan(null);
    setCheck(null);
    setError(null);
    setRisk(null);
    (async () => {
      try {
        const qs = new URLSearchParams({ from, to, fromName, toName, ...(depart && { depart }) });
        const body = (await (await fetch(`/api/route?${qs}`)).json()) as { data: RoutePlan | null; degraded?: string };
        if (!alive) return;
        if (!body.data) return setError(body.degraded ?? "Routing is unavailable right now");
        setPlan(body.data);
        if (body.degraded) setToast(body.degraded);

        // Rain risk (no AI) loads alongside the agent; it reuses the plan the server just cached.
        fetch(`/api/risk/route?${qs}${replay ? "&replay=1" : ""}`)
          .then((r) => r.json() as Promise<{ data: RouteRisk | null }>)
          .then((b) => alive && setRisk(b.data))
          .catch(() => {});

        setChecking(true);
        const res = await fetch("/api/route-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from, to, fromName, toName, ...(depart && { departAt: depart }) }),
        });
        const cb = (await res.json()) as { data: { plan: RoutePlan; check: CheckResult } | null; degraded?: string };
        if (!alive) return;
        if (cb.data) {
          setPlan(cb.data.plan);
          setCheck(cb.data.check);
          saveCheck(query, cb.data.plan, cb.data.check);
        }
        if (cb.degraded) setToast(cb.degraded);
      } catch {
        if (alive) setToast("Couldn't reach the server — showing what we have");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to, fromName, toName, depart, query, replay]);

  // Crews at work on this route's events (no AI) → "N repair crews working" link to frame 07.
  const eventKey = plan ? routeEventIds(plan).join(",") : "";
  useEffect(() => {
    if (!eventKey) return setCrewsAtWork(0);
    let alive = true;
    fetch(`/api/repairs?ids=${eventKey}`)
      .then((r) => r.json() as Promise<{ data: Repair[] }>)
      .then((b) => alive && setCrewsAtWork(b.data.filter((x) => x.atWork).length))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [eventKey]);

  // Fit the map to the routes once both the plan and the map are ready (leave room for the sheet).
  const fittedFor = useRef<RoutePlan | null>(null);
  const fit = useCallback(() => {
    const coords = plan?.routes.flatMap((r) => r.geometry.coordinates);
    if (!plan || fittedFor.current === plan || !coords?.length || !mapRef.current) return;
    fittedFor.current = plan;
    const xs = coords.map((c) => c[0]!);
    const ys = coords.map((c) => c[1]!);
    mapRef.current.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: { top: 120, bottom: 470, left: 40, right: 40 }, duration: 600 },
    );
  }, [plan]);
  useEffect(fit, [fit]);

  // Road Watch: is this trip (same from/to names) already watched on this device?
  useEffect(() => {
    let alive = true;
    fetch("/api/watch")
      .then((r) => r.json() as Promise<{ data: WatchedTrip[] }>)
      .then((b) => {
        const hit = (b.data ?? []).find((t) => t.from.name === (fromName || "Start") && t.to.name === (toName || "Destination"));
        if (alive) setWatchId(hit?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fromName, toName]);

  if (!from || !to) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-land px-8 text-center">
        <p className="text-[17px] font-semibold">Choose where you&apos;re going</p>
        <Link href="/" className="flex h-[52px] items-center rounded-[14px] bg-accent px-6 text-[17px] font-semibold text-white no-underline">
          Search a place
        </Link>
      </main>
    );
  }

  async function toggleWatch() {
    if (!from || !to) return;
    setWatchBusy(true);
    try {
      if (watchId) {
        const res = await fetch(`/api/watch/${watchId}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setWatchId(null);
        setToast("Stopped watching this trip");
      } else {
        const v = check?.verdict;
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            from,
            to,
            fromName: plan?.from.name ?? (fromName || "Start"),
            toName: plan?.to.name ?? (toName || "Destination"),
            departAt: depart ?? null,
            verdict: v ? { verdict: v.verdict, headline: v.headline, headlineHi: v.headlineHi } : null,
          }),
        });
        const body = (await res.json()) as { data?: WatchedTrip };
        if (!res.ok || !body.data) throw new Error();
        setWatchId(body.data.id);
        setToast("Watching — Road Watch will alert you if a road on this trip changes");
      }
    } catch {
      setToast("Couldn't update Road Watch — try again");
    } finally {
      setWatchBusy(false);
    }
  }

  const best = plan?.routes[0];
  const issues = best?.events.filter((e) => e.delayMin > 0 || e.blocks) ?? [];
  const v = check?.verdict;
  const verdictKey = v?.verdict ?? best?.verdict.verdict ?? "go";
  const style = VERDICT_STYLE[verdictKey];
  const pill = !v && best && issues.length === 0 ? "ALL CLEAR" : VERDICT_WORD[verdictKey];
  const headline = v?.headline ?? (best ? (best.blocked ? best.verdict.headline : `Arrive ~${clock(best.arriveAt)}`) : "Checking the roads…");
  const impact = new Map(v?.disruptions.map((d) => [d.eventId, d.impact]));
  const others = v?.options.filter((o) => !o.recommended).slice(0, 2) ?? [];
  const outside = best?.legs.filter((l) => !l.insideHp && l.distanceKm >= 1) ?? [];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        events={best?.events ?? []}
        onSelectEvent={(e) => router.push(`/event/${e.id}`)}
        onViewChange={fit}
        routes={plan?.routes.map((r) => r.geometry) ?? []}
        showRoadLayer={false}
      >
        <RiskLayer id="pf-route-risk" areas={risk?.stretches ?? []} />
      </MapView>

      {/* top: back + trip pill */}
      <div className="absolute inset-x-[14px] top-[54px] z-10 mx-auto flex max-w-[480px] items-center gap-[10px]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="glass-float flex size-[46px] shrink-0 items-center justify-center rounded-full text-ink"
        >
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
        </button>
        <div className="glass-float flex h-[46px] min-w-0 flex-1 items-center gap-2 rounded-[23px] px-4">
          <span className="truncate text-[15px] font-semibold">
            {plan?.from.name ?? fromName ?? "Start"} → {plan?.to.name ?? toName ?? "Destination"}
          </span>
          <span className="shrink-0 text-[13px] text-ink-2">· {departLabel(depart)} · Car</span>
        </div>
      </div>

      {toast && (
        <div className="absolute inset-x-[14px] top-[112px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Route result" initial="half" halfPx={440}>
        {error ? (
          <p className="py-6 text-center text-[15px] text-ink-2">{error}</p>
        ) : !best ? (
          <div className="flex flex-col gap-3 py-2" aria-busy>
            <span className="h-6 w-28 animate-pulse rounded-full bg-black/10" />
            <span className="h-7 w-56 animate-pulse rounded-lg bg-black/10" />
            <span className="h-24 animate-pulse rounded-[16px] bg-white/70" />
          </div>
        ) : (
          <div className="flex flex-col gap-[14px]">
            {/* verdict */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full px-[9px] py-1 text-[12px] font-bold" style={{ background: style.bg, color: style.ink }}>
                  {pill}
                </span>
                {checking && (
                  <span className="flex items-center gap-1 text-[12px] text-ink-3" aria-live="polite">
                    <Sparkles size={13} className="animate-pulse text-accent" aria-hidden /> AI is checking the route…
                  </span>
                )}
              </div>
              <span className="text-[22px] font-bold tracking-[-0.3px]">{headline}</span>
              {v?.headlineHi && (
                <span lang="hi" className="text-[14px] text-ink-2">
                  {v.headlineHi}
                </span>
              )}
              <span className="text-[14px] text-ink-2">
                {issues.length ? `${issues.length} disruption${issues.length > 1 ? "s" : ""} · ` : ""}
                {best.distanceKm.toFixed(0)} km · about {duration(best.totalMin)}
                {best.viaRoads[0] ? ` · via ${best.viaRoads[0]}` : ""}
              </span>
            </div>

            {/* Phase 6A: hand-off to Google Maps + Drive Watch, shown for every route */}
            <StartActions plan={plan!} query={query} />

            {/* outside-HP legs (7.5c) */}
            {outside.map((l, i) => (
              <div key={i} className="glass-card px-[14px] py-3 text-[13px] text-ink-2">
                <span className="font-semibold text-ink">
                  {l.fromName ?? "Start"} → {l.toName ?? "Himachal border"}
                </span>{" "}
                · {l.distanceKm.toFixed(0)} km · ~{duration(l.durationMin)} · Outside Himachal: normal drive, live traffic not checked
              </div>
            ))}

            {/* disruptions */}
            {best.events.length > 0 ? (
              <div className="glass-card flex flex-col">
                {best.events.map((e, i) => {
                  const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.unknown;
                  const sub =
                    impact.get(e.id) ??
                    `${st.word} · reach ~${clock(e.etaAt)}${e.delayMin ? ` · ~${e.delayMin} min` : ""}${e.reports ? ` · ${e.reports} report${e.reports > 1 ? "s" : ""}` : ""}`;
                  return (
                    <Link
                      key={e.id}
                      href={`/event/${e.id}`}
                      className={`flex items-center gap-3 px-[14px] py-3 text-ink no-underline ${i < best.events.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ background: st.dot }} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[15px] font-semibold">
                          {eventTitle(e.type, e.placeName)} <span className="sr-only">({st.word})</span>
                        </span>
                        <span className="line-clamp-2 text-[13px] text-ink-2">{sub}</span>
                      </span>
                      <ChevronRight size={15} strokeWidth={2.6} className="shrink-0 text-unknown" aria-hidden />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card px-[14px] py-3 text-[14px] text-ink-2">
                No verified issues on this route · checked {clock(plan!.checkedAt)}
              </div>
            )}

            {crewsAtWork > 0 && (
              <Link
                href={`/route/repairs?${query}`}
                className="glass-card flex items-center gap-[10px] px-[14px] py-3 text-[15px] font-semibold text-link no-underline"
              >
                <Wrench size={17} strokeWidth={2.2} aria-hidden />
                <span className="flex-1">
                  {crewsAtWork} repair crew{crewsAtWork === 1 ? "" : "s"} working on your route
                </span>
                <ChevronRight size={15} strokeWidth={2.6} className="text-unknown" aria-hidden />
              </Link>
            )}
            {/* Rain risk (Risk Forecast v1): purple banner for moderate/high, a calm weather line otherwise */}
            {risk?.headline ? (
              <div role="note" className="flex items-start gap-[10px] rounded-[16px] bg-risk-bg px-[14px] py-3 text-risk-ink">
                <CloudRain size={20} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold leading-snug">{risk.headline}</span>
                  <span className="text-[12px] opacity-90">
                    {risk.weatherLine} ·{" "}
                    {risk.source === "replay" ? `Replay of real rain from ${replayLabel(risk.replayDate)} (demo)` : `Open-Meteo forecast · ${clock(risk.checkedAt)}`}
                  </span>
                </span>
              </div>
            ) : risk ? (
              <div className="flex items-center gap-2 px-1 text-[13px] text-ink-2">
                {risk.level === "low" ? <CloudRain size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
                <span>
                  {risk.weatherLine} · {risk.source === "replay" ? `replay of ${replayLabel(risk.replayDate)}` : "Open-Meteo forecast"}
                </span>
              </div>
            ) : null}

            {/* What-If chips: the agent's other options */}
            {others.length > 0 && (
              <div className="flex gap-2">
                {others.map((o) => (
                  <Link
                    key={o.label}
                    href={`/route/options?${query}`}
                    className="flex min-w-0 flex-1 flex-col gap-px rounded-[14px] bg-white/80 px-3 py-[10px] text-ink no-underline"
                  >
                    <span className="truncate text-[14px] font-semibold">{o.label}</span>
                    <span className="truncate text-[12px] text-ink-2">Arrive ~{clock(o.arriveAt)}</span>
                  </Link>
                ))}
              </div>
            )}

            {others.length === 0 && check && check.by !== "code" && (
              <Link href={`/route/options?${query}`} className="flex items-center justify-between rounded-[14px] bg-white/80 px-[14px] py-3 text-[15px] font-semibold text-link no-underline">
                Compare when to leave
                <ChevronRight size={15} strokeWidth={2.6} aria-hidden />
              </Link>
            )}

            {/* why: which model, which checks, which sources */}
            {check && check.by !== "code" && (
              <div className="glass-card flex flex-col gap-2 px-[14px] py-3">
                <button type="button" onClick={() => setShowWhy((s) => !s)} aria-expanded={showWhy} className="flex items-center justify-between gap-2 text-left">
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                    <Sparkles size={15} className="text-accent" aria-hidden /> Why this advice
                  </span>
                  <span className="text-[12px] text-ink-3">{checkedBy(check)}</span>
                </button>
                {showWhy && (
                  <>
                    <p className="text-[14px] text-ink">{check.verdict.reasoning}</p>
                    <p className="text-[12px] text-ink-3">Sources: {check.verdict.usedSources.join(" · ")}</p>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(watchId)}
              disabled={watchBusy || !from || !to}
              onClick={toggleWatch}
              className="flex items-center gap-3 rounded-[14px] bg-white/80 px-[14px] py-3 text-left disabled:opacity-60"
            >
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-[15px] font-semibold">Watch this trip</span>
                <span className="text-[13px] text-ink-2">
                  {watchId ? "Road Watch is on — you'll get an alert if anything changes" : "Re-plan and alert me if anything changes"}
                </span>
              </span>
              <span
                aria-hidden
                className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${watchId ? "bg-open" : "bg-[rgba(120,120,128,0.16)]"}`}
              >
                <span
                  className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-[left] ${watchId ? "left-[22px]" : "left-[2px]"}`}
                />
              </span>
            </button>

            <p className="text-center text-[11px] text-ink-3">Estimates · checked {clock(plan!.checkedAt)} · verify with official sources</p>
          </div>
        )}
      </Sheet>
    </main>
  );
}
