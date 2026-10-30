"use client";

// Drive Watch (Phase 6A, scoped-down frame 10c): runs alongside Google Maps. Live GPS on the chosen
// route, distance left, spoken hazard-ahead alerts at 5 km and 1 km (distance ALONG the route),
// Road Watch changes during the drive (polling /api/events), screen wake lock. No turn-by-turn, no AI.
// ?simulate=1 replays a fake GPS track along the route at high speed for the demo (clearly labelled).
import { Crosshair, Radar, Volume2, VolumeX, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import GlassButton from "@/components/glass/GlassButton";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { googleMapsUrl, pickWaypoints } from "@/lib/drive/handoff";
import { changeMessage, diffEvents, dueAnnouncements, hazardMessage, type DriveEvent, type Lang } from "@/lib/drive/hazards";
import { cumulative, pointAt, project, type Coord } from "@/lib/drive/line";
import { STATUS_STYLE, type EventStatus, type MapEvent } from "@/lib/events/types";
import { clock } from "@/lib/geo/format";
import type { RoutePlan } from "@/lib/geo/routeTypes";
import { eventTitle, loadCheck } from "@/components/route/routeData";
import { hasHindiVoice, speak, useLang, useWakeLock } from "./device";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

// Same rule as the planner: ≤300 m when the event is on a road the route uses, else ≤75 m
// (a side road beside NH-3 must not raise an alert on NH-3).
const NEAR_SAME_ROAD_KM = 0.3;
const NEAR_OTHER_ROAD_KM = 0.075;
const norm = (r: string) => r.replace(/[^a-z0-9]/gi, "").toUpperCase();
const OFF_ROUTE_KM = 1; // farther than this from the line → you left the route, alerts pause
const POLL_MS = 45_000; // Road Watch during the drive
const SIM_KM_PER_S = 0.25; // simulate: 1 km every 4 s (~900 km/h)
const SIM_LEAD_KM = 7; // simulate: start this far before the first hazard
const BANNER_MS = 20_000;

type Hazard = DriveEvent & { lat: number; lng: number };
interface Banner {
  key: number;
  status: string;
  title: string;
  text: string;
  /** Shown under the main text: Hindi when the phone has no Hindi voice, or English under Hindi. */
  sub?: string;
  roadWatch: boolean;
}

const isHazard = (e: { status: string; type: string }) => e.status !== "open" && e.type !== "clear";

export default function DriveScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const simulate = params.get("simulate") === "1";
  const routeQuery = useMemo(() => {
    const q = new URLSearchParams(params);
    q.delete("simulate");
    return q.toString();
  }, [params]);

  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [lang, setLang] = useLang();
  const [muted, setMuted] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number; km: number; offKm: number } | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [follow, setFollow] = useState(true);
  const wake = useWakeLock(videoRef);

  const announced = useRef(new Set<string>());
  const known = useRef(new Map<string, Hazard>());
  const meKm = useRef(0);
  const prefs = useRef({ lang, muted });
  prefs.current = { lang, muted };

  // The chosen route: reuse /route's hand-off when it matches, else the (3-min cached) plan.
  useEffect(() => {
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to) return setError("Open Drive Watch from a route");
    const saved = loadCheck();
    if (saved && saved.query === routeQuery) return setPlan(saved.plan);
    let alive = true;
    fetch(`/api/route?${routeQuery}`)
      .then((r) => r.json() as Promise<{ data: RoutePlan | null; degraded?: string }>)
      .then((b) => {
        if (!alive) return;
        if (b.data) setPlan(b.data);
        else setError(b.degraded ?? "Routing is unavailable right now");
      })
      .catch(() => alive && setError("Couldn't reach the server"));
    return () => {
      alive = false;
    };
  }, [params, routeQuery]);

  const route = plan?.routes[0];
  const line = useMemo(() => (route?.geometry.coordinates ?? []) as Coord[], [route]);
  const cum = useMemo(() => cumulative(line), [line]);
  const totalKm = cum[cum.length - 1] ?? 0;
  const google = useMemo(() => {
    if (!plan || !route) return null;
    const others = plan.routes.slice(1).map((o) => o.geometry.coordinates as Coord[]);
    return googleMapsUrl(plan.from, plan.to, pickWaypoints(line, others));
  }, [plan, route, line]);

  const toHazard = useCallback(
    (e: MapEvent): Hazard & { offKm: number; roadRef: string | null } => {
      const p = project(line, cum, [e.lng, e.lat]);
      return { id: e.id, type: e.type, status: e.status, placeName: e.placeName, roadRef: e.roadRef, lat: e.lat, lng: e.lng, alongKm: p.alongKm, offKm: p.offKm };
    },
    [line, cum],
  );
  const onRoute = useCallback(
    (h: { id: string; offKm: number; roadRef: string | null }) => {
      if (route?.events.some((e) => e.id === h.id)) return true; // the planner already put it on this route
      const sameRoad = Boolean(h.roadRef && route?.viaRoads.some((r) => norm(r) === norm(h.roadRef!)));
      return h.offKm <= (sameRoad ? NEAR_SAME_ROAD_KM : NEAR_OTHER_ROAD_KM);
    },
    [route],
  );

  // Hazards on the chosen route, from the plan.
  useEffect(() => {
    if (!route || line.length < 2) return;
    const list = route.events.filter(isHazard).map(toHazard);
    known.current = new Map(list.map((h) => [h.id, h]));
    setHazards(list);
  }, [route, line, toHazard]);

  const show = useCallback((b: Omit<Banner, "key">, spoken: string) => {
    setBanner({ ...b, key: Date.now() });
    const { lang: l, muted: m } = prefs.current;
    if (m) return;
    // No Hindi voice on this phone → speak English, the Hindi text stays on screen.
    if (l === "hi" && !hasHindiVoice()) speak(spoken.split("\u0000")[1] ?? spoken, "en");
    else speak(spoken.split("\u0000")[0]!, l);
  }, []);

  // Texts in both languages: [chosen, english] so a missing Hindi voice can fall back.
  const announce = useCallback(
    (h: DriveEvent, aheadKm: number, text: (l: Lang) => string, roadWatch: boolean) => {
      const l = prefs.current.lang;
      const main = text(l);
      const en = text("en");
      show(
        {
          status: h.status,
          title: roadWatch ? "Road Watch" : `${Math.max(0.1, aheadKm).toFixed(aheadKm < 1 ? 1 : 0)} km ahead`,
          text: main,
          sub: l === "hi" ? en : undefined,
          roadWatch,
        },
        `${main}\u0000${en}`,
      );
    },
    [show],
  );

  // Position → along-route km → hazard alerts.
  const onPosition = useCallback(
    (lat: number, lng: number) => {
      if (line.length < 2) return;
      const p = project(line, cum, [lng, lat]);
      meKm.current = p.alongKm;
      setMe({ lat, lng, km: p.alongKm, offKm: p.offKm });
      if (p.offKm > OFF_ROUTE_KM) return; // off the planned road: distances would be wrong
      const due = dueAnnouncements([...known.current.values()], p.alongKm, announced.current);
      for (const d of due.slice(0, 2)) announce(d.event, d.aheadKm, (l) => hazardMessage(d.event, d.aheadKm, l), false);
    },
    [line, cum, announce],
  );

  // GPS (or the simulated track) while driving.
  useEffect(() => {
    if (!started || line.length < 2) return;
    if (simulate) {
      const first = Math.min(...[...known.current.values()].map((h) => h.alongKm), totalKm);
      let km = Math.max(0, first - SIM_LEAD_KM);
      const tick = () => {
        const [lng, lat] = pointAt(line, cum, km);
        onPosition(lat, lng);
        km = Math.min(totalKm, km + SIM_KM_PER_S);
      };
      tick();
      const t = setInterval(tick, 1000);
      return () => clearInterval(t);
    }
    if (!("geolocation" in navigator)) {
      setToast("This phone can't share its location");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => onPosition(pos.coords.latitude, pos.coords.longitude),
      (err) => setToast(err.code === 1 ? "Allow location to use Drive Watch" : "Waiting for GPS…"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [started, simulate, line, cum, totalKm, onPosition]);

  // Road Watch during the drive: poll open events around the route; new / changed / cleared → banner + voice.
  useEffect(() => {
    if (!started || line.length < 2) return;
    const xs = line.map((c) => c[0]);
    const ys = line.map((c) => c[1]);
    const bbox = [Math.min(...xs) - 0.02, Math.min(...ys) - 0.02, Math.max(...xs) + 0.02, Math.max(...ys) + 0.02].map((v) => v.toFixed(3));
    let alive = true;
    let baseline = true; // the first poll only lines up our list with /api/events (no alerts)
    const poll = async () => {
      try {
        const b = (await (await fetch(`/api/events?bbox=${bbox.join(",")}`)).json()) as { data: MapEvent[] };
        if (!alive || !Array.isArray(b.data)) return;
        const next = b.data.filter(isHazard).map(toHazard).filter(onRoute);
        const ahead = (h: DriveEvent) => h.alongKm - meKm.current;
        for (const c of baseline ? [] : diffEvents(known.current, next)) {
          if (ahead(c.event) < -0.3) continue; // behind you: map only
          if (c.kind !== "new") for (const k of [1, 5]) announced.current.delete(`${c.event.id}:${k}`);
          const event = c.kind === "cleared" ? { ...c.event, status: "open" } : c.event;
          announce(event, ahead(c.event), (l) => changeMessage(c, Math.max(0, ahead(c.event)), l), true);
        }
        known.current = new Map(next.map((h) => [h.id, h]));
        setHazards(next);
        baseline = false;
      } catch {
        // offline for a moment: keep the last known hazards
      }
    };
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [started, line, toHazard, onRoute, announce]);

  // Map follows the dot unless the user pans away.
  useEffect(() => {
    if (!me || !follow) return;
    // Padding keeps the dot in the visible map between the banners and the sheet.
    mapRef.current?.easeTo({
      center: [me.lng, me.lat],
      zoom: Math.max(mapRef.current.getZoom(), 11.5),
      padding: { top: 220, bottom: 440, left: 0, right: 0 },
      duration: 800,
    });
  }, [me, follow]);
  const onMapReady = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || (map as unknown as { _pfDrag?: boolean })._pfDrag) return;
    (map as unknown as { _pfDrag?: boolean })._pfDrag = true;
    map.on("dragstart", () => setFollow(false));
  }, []);
  // Before the drive starts, show the whole route above the sheet.
  const fitted = useRef(false);
  const fitRoute = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || fitted.current || line.length < 2) return;
    fitted.current = true;
    const xs = line.map((c) => c[0]);
    const ys = line.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: { top: 140, bottom: 440, left: 40, right: 40 }, duration: 0 },
    );
  }, [line]);
  useEffect(fitRoute, [fitRoute]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  function startDrive() {
    // Inside the tap: unlocks speech on iOS and lets the wake lock / video start.
    window.speechSynthesis?.cancel();
    if (!muted) speak(lang === "hi" && hasHindiVoice() ? "ड्राइव वॉच चालू" : "Drive Watch on", lang === "hi" && hasHindiVoice() ? "hi" : "en");
    wake.start();
    announced.current.clear();
    setFollow(true);
    setStarted(true);
  }

  function endDrive() {
    window.speechSynthesis?.cancel();
    wake.stop();
    setStarted(false);
    router.push(`/route?${routeQuery}`);
  }

  const ahead = hazards.filter((h) => h.alongKm - (me?.km ?? 0) > -0.3).sort((a, b) => a.alongKm - b.alongKm);
  const next = ahead[0];
  const leftKm = Math.max(0, totalKm - (me?.km ?? 0));
  const arrive = route ? new Date(Date.now() + (route.totalMin * leftKm * 60_000) / Math.max(totalKm, 1)) : null;
  const offRoute = !simulate && me && me.offKm > OFF_ROUTE_KM;
  const title = plan ? `${plan.from.name} → ${plan.to.name}` : "Drive Watch";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        events={hazards.map((h) => ({ ...(route?.events.find((e) => e.id === h.id) ?? blankEvent(h)), status: h.status as EventStatus }))}
        onSelectEvent={(e) => router.push(`/event/${e.id}`)}
        onViewChange={() => {
          onMapReady();
          fitRoute();
        }}
        routes={route ? [route.geometry] : []}
        showRoadLayer={false}
        myLocation={me ? { latitude: me.lat, longitude: me.lng } : null}
      />
      {/* NoSleep-style fallback when the Wake Lock API is missing (muted, hidden, looping). */}
      <video ref={videoRef} src="/drive/keep-awake.mp4" muted loop playsInline aria-hidden className="pointer-events-none absolute size-px opacity-0" />

      {/* top: status card (10c) + hazard banner */}
      <div className="absolute inset-x-[14px] top-[14px] z-10 mx-auto flex max-w-[452px] flex-col gap-[10px]" style={{ top: "max(14px, env(safe-area-inset-top))" }}>
        <div className="glass-float flex items-center gap-3 rounded-[18px] px-4 py-3">
          <span className="relative flex size-3 shrink-0" aria-hidden>
            {started && <span className="absolute inset-0 animate-ping rounded-full bg-open opacity-60 motion-reduce:animate-none" />}
            <span className={`relative size-3 rounded-full ${started ? "bg-open" : "bg-unknown"}`} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[16px] font-semibold">{started ? "Drive Watch is on" : "Drive Watch"}</span>
            <span className="truncate text-[13px] text-ink-2">
              {offRoute ? "You're off this route · alerts paused" : started ? "Phone on dashboard · voice alerts on" : "Watches the road ahead"}
            </span>
          </span>
          {simulate && <span className="shrink-0 rounded-full bg-risk-bg px-[9px] py-1 text-[11px] font-bold text-risk-ink">SIMULATED</span>}
        </div>

        {banner && (
          <button
            key={banner.key}
            type="button"
            role="alert"
            onClick={() => setBanner(null)}
            className="glass flex w-full items-start gap-3 rounded-[18px] px-4 py-[14px] text-left"
            style={{ borderLeft: `6px solid ${(STATUS_STYLE[banner.status as EventStatus] ?? STATUS_STYLE.unknown).dot}`, boxShadow: "0 8px 30px rgba(0,0,0,0.22)" }}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-bold uppercase tracking-[0.4px] text-ink-2">{banner.title}</span>
                <StatusPill status={banner.status} />
              </span>
              <span lang={lang} className="text-[21px] font-bold leading-[1.25] text-ink">
                {banner.text}
              </span>
              {banner.sub && <span className="text-[14px] text-ink-2">{banner.sub}</span>}
            </span>
            <X size={20} className="mt-1 shrink-0 text-ink-3" aria-label="Dismiss" />
          </button>
        )}
      </div>

      {started && !follow && (
        <div className="absolute right-[14px] z-10" style={{ bottom: 440 }}>
          <GlassButton label="Follow my location" onClick={() => setFollow(true)}>
            <Crosshair size={20} aria-hidden />
          </GlassButton>
        </div>
      )}

      {toast && (
        <div className="absolute inset-x-[14px] top-[96px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Drive Watch" initial="half" halfPx={420}>
        {error ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-[15px] text-ink-2">{error}</p>
            <Link href="/" className="flex h-[52px] items-center rounded-[14px] bg-accent px-6 text-[17px] font-semibold text-white no-underline">
              Search a place
            </Link>
          </div>
        ) : !route ? (
          <div className="flex flex-col gap-3 py-2" aria-busy>
            <span className="h-7 w-56 animate-pulse rounded-lg bg-black/10" />
            <span className="h-4 w-40 animate-pulse rounded bg-black/10" />
            <span className="h-24 animate-pulse rounded-[16px] bg-white/70" />
          </div>
        ) : (
          <div className="flex flex-col gap-[14px]">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[22px] font-bold tracking-[-0.3px]">{title}</span>
                <span className="text-[14px] text-ink-2">
                  {started
                    ? next
                      ? `Next: ${eventTitle(next.type, next.placeName)} · ${Math.max(0, next.alongKm - (me?.km ?? 0)).toFixed(0)} km`
                      : "No hazards ahead on this route"
                    : `${ahead.length || "No"} hazard${ahead.length === 1 ? "" : "s"} on the route · spoken at 5 km and 1 km`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Turn voice alerts on" : "Mute voice alerts"}
                aria-pressed={muted}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink"
              >
                {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
              </button>
            </div>

            <KmStrip hazards={hazards} meKm={me?.km ?? 0} totalKm={totalKm} toName={plan!.to.name} />

            <div className="grid grid-cols-3 gap-[10px]">
              <Tile big={`${leftKm.toFixed(0)}`} unit="km" label="left on route" />
              <Tile big={`${ahead.length}`} label={`hazard${ahead.length === 1 ? "" : "s"} ahead`} />
              <Tile big={arrive ? `~${clock(arrive.toISOString())}` : "—"} label="arrive (est.)" small />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] text-ink-2">Voice</span>
              <div role="radiogroup" aria-label="Alert language" className="flex rounded-[10px] bg-[rgba(118,118,128,0.12)] p-[2px]">
                {(["en", "hi"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={lang === l}
                    onClick={() => setLang(l)}
                    className={`h-9 min-w-[72px] rounded-[8px] px-3 text-[14px] font-semibold ${lang === l ? "bg-white text-ink shadow-sm" : "text-ink-2"}`}
                  >
                    {l === "en" ? "English" : "हिन्दी"}
                  </button>
                ))}
              </div>
              {google && (
                <a href={google} target="_blank" rel="noopener noreferrer" className="ml-auto text-[14px] font-semibold text-link no-underline">
                  Google Maps
                </a>
              )}
            </div>

            {started ? (
              <button
                type="button"
                onClick={endDrive}
                className="flex min-h-[56px] items-center justify-center rounded-[16px] bg-accent text-[18px] font-semibold text-white"
              >
                End drive
              </button>
            ) : (
              <button
                type="button"
                onClick={startDrive}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-[16px] bg-accent text-[18px] font-semibold text-white"
              >
                <Radar size={20} aria-hidden /> Start Drive Watch{simulate ? " (simulated)" : ""}
              </button>
            )}

            <p className="text-center text-[11px] leading-snug text-ink-3">
              {wake.mode === "none" || wake.mode === "video" ? "Keep screen on · " : ""}
              On iPhone, GPS pauses when the screen locks, so keep it on. No turn-by-turn: follow Google Maps. Only look when safely stopped · verify
              with official sources.
            </p>
          </div>
        )}
      </Sheet>
    </main>
  );
}

function blankEvent(h: Hazard): MapEvent {
  return {
    id: h.id,
    type: h.type,
    status: h.status as EventStatus,
    placeName: h.placeName,
    roadRef: null,
    lat: h.lat,
    lng: h.lng,
    summary: null,
    confidence: 0.5,
    lastConfirmedAt: new Date().toISOString(),
    reports: 0,
    news: 0,
    modelsAgreed: null,
    photoUrl: null,
  };
}

function StatusPill({ status }: { status: string }) {
  const st = STATUS_STYLE[status as EventStatus] ?? STATUS_STYLE.unknown;
  return (
    <span className="rounded-full px-[9px] py-[3px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
      {st.word}
    </span>
  );
}

function Tile({ big, unit, label, small = false }: { big: string; unit?: string; label: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] px-3 py-[10px]" style={{ background: "rgba(255,255,255,0.84)" }}>
      <span className={`${small ? "text-[18px]" : "text-[24px]"} font-bold leading-tight tracking-[-0.3px]`}>
        {big}
        {unit && <span className="text-[15px] font-semibold"> {unit}</span>}
      </span>
      <span className="text-[12px] text-ink-2">{label}</span>
    </div>
  );
}

/** 10c's km condition strip: from where you are to the destination, hazards in their status colour. */
function KmStrip({ hazards, meKm, totalKm, toName }: { hazards: Hazard[]; meKm: number; totalKm: number; toName: string }) {
  const span = Math.max(1, totalKm - meKm);
  const pos = (km: number) => `${Math.max(0, Math.min(100, ((km - meKm) / span) * 100))}%`;
  const ahead = hazards.filter((h) => h.alongKm >= meKm - 0.3);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-[10px] overflow-hidden rounded-full" style={{ background: STATUS_STYLE.open.dot }} role="img" aria-label={`${ahead.length} hazards on the ${totalKm.toFixed(0)} km route ahead`}>
        {ahead.map((h) => (
          <span
            key={h.id}
            className="absolute inset-y-0 border-x-2 border-white"
            style={{ left: pos(h.alongKm - 1.5), width: `max(10px, ${(3 / span) * 100}%)`, background: (STATUS_STYLE[h.status as EventStatus] ?? STATUS_STYLE.unknown).dot }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[12px] text-ink-2">
        <span>You · km {meKm.toFixed(0)}</span>
        <span>
          {toName} · km {totalKm.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
