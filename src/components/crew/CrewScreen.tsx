"use client";

// On-site worker's "My job" (Option B Part B). Phone-first Glass: map on the job site, floating header
// (name · role · Sign out), sheet with the On duty switch and the job: where, what, role, crew, machines,
// progress, Start directions / I've arrived / Post progress / Job done. No queue, no dispatch, no advisories.
import { Check, ChevronDown, HardHat, LogOut, MapPin, Navigation, Truck, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import type { MyJob } from "@/lib/crew/job";
import { SKILL_WORD } from "@/lib/crew/needs";
import { ago, STATUS_STYLE } from "@/lib/events/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const PING_MS = 2 * 60_000;
const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => IST.format(new Date(iso)).replace(/\s?(am|pm)/i, (m) => ` ${m.trim().toUpperCase()}`);
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111);

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export default function CrewScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const mapRef = useRef<MapRef>(null);
  const [data, setData] = useState<MyJob | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/crew/me").catch(() => null);
    if (!res) return setToast("Couldn't reach the server — try again");
    if (res.status === 401) return router.replace("/official/login");
    if (res.status === 403) return router.replace("/official");
    const j = (await res.json()) as { ok: boolean; data?: MyJob; error?: string };
    if (!j.ok || !j.data) return setToast(j.error ?? "Couldn't load your job");
    setData(j.data);
    if (j.data.worker.position) setMe((m) => m ?? j.data!.worker.position);
    // First time this crew sees the job → the office sees "opened".
    if (j.data.job && j.data.crew && !j.data.crew.acknowledgedAt) {
      void fetch("/api/crew/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "opened" }) });
    }
  }, [router]);

  useEffect(() => {
    void load();
    const u = params.get("updated");
    if (u) setToast(u === "open" ? "Road marked fully open — job done. Thank you!" : "Progress update posted — the office and travellers can see it");
  }, [load, params]);

  // While on duty and the app is open: share position every 2 min (rounded on the server, no history).
  const onDuty = data?.worker.onDuty ?? false;
  useEffect(() => {
    if (!onDuty) return;
    const ping = async () => {
      const pos = await getPosition();
      if (!pos) return;
      setMe(pos);
      void fetch("/api/crew/duty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onDuty: true, ...pos }) });
    };
    void ping();
    const t = setInterval(ping, PING_MS);
    return () => clearInterval(t);
  }, [onDuty]);

  async function toggleDuty() {
    if (!data) return;
    setBusy(true);
    const next = !data.worker.onDuty;
    const pos = next ? await getPosition() : null;
    const res = await fetch("/api/crew/duty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onDuty: next, ...(pos ?? {}) }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setToast("Couldn't update your shift — try again");
    if (next && !pos) setToast("On duty — but location is off, so the office can't see where you are");
    else setToast(next ? "On duty — the office can see you're available" : "Off duty — your location is no longer shared");
    if (pos) setMe(pos);
    await load();
  }

  async function arrived() {
    setBusy(true);
    const res = await fetch("/api/crew/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "arrived" }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setToast("Couldn't save that — try again");
    setToast("Marked as arrived — the office can see your crew is on site");
    await load();
  }

  async function signOut() {
    await fetch("/api/official/logout", { method: "POST" }).catch(() => {});
    router.replace("/official/login");
  }

  // Map: the job site (and you) above the sheet.
  const job = data?.job ?? null;
  const needsFit = useRef(true);
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !data || !needsFit.current) return;
    const pts = [job, me].filter(Boolean) as { lat: number; lng: number }[];
    if (!pts.length) return;
    needsFit.current = false; // moving the map fires onViewChange again — fit once per change
    if (pts.length === 1) return void map.jumpTo({ center: [pts[0]!.lng, pts[0]!.lat - 0.06], zoom: 10 });
    map.fitBounds(
      [
        [Math.min(...pts.map((p) => p.lng)) - 0.02, Math.min(...pts.map((p) => p.lat)) - 0.02],
        [Math.max(...pts.map((p) => p.lng)) + 0.02, Math.max(...pts.map((p) => p.lat)) + 0.02],
      ],
      { padding: { top: 140, bottom: 480, left: 40, right: 40 }, maxZoom: 13, duration: 0 },
    );
  }, [data, job, me]);
  useEffect(() => {
    needsFit.current = true;
    fit();
  }, [fit]);

  const w = data?.worker;
  const crew = data?.crew;
  const st = job ? STATUS_STYLE[job.status] : null;
  const distKm = job && me ? kmBetween(job, me) : null;
  const directions = job ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat.toFixed(5)}%2C${job.lng.toFixed(5)}&travelmode=driving` : "#";
  const stage = crew?.arrivedAt ? `On site since ${clock(crew.arrivedAt)}` : crew?.dispatchedAt ? `Sent to your crew at ${clock(crew.dispatchedAt)}` : "Assigned to your crew";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView mapRef={mapRef} onViewChange={fit} showRoadLayer={false} events={[]} myLocation={me ? { latitude: me.lat, longitude: me.lng } : null}>
        {job && (
          <Marker latitude={job.lat} longitude={job.lng} anchor="bottom">
            <MapPin size={36} strokeWidth={2} fill="white" style={{ color: st?.dot }} className="drop-shadow" aria-label={job.title} />
          </Marker>
        )}
      </MapView>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[480px] flex-col px-[14px] pt-[50px]">
        <header className="glass-float pointer-events-auto flex items-center gap-3 rounded-[22px] py-[10px] pl-[12px] pr-[6px]">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-accent text-white">
            <HardHat size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] font-bold leading-tight">My job</span>
            <span className="truncate text-[13px] text-ink-2">{w ? `${w.name} · ${SKILL_WORD[w.skill][0]} · ${w.org}` : "Signing in…"}</span>
          </span>
          <button type="button" onClick={signOut} className="flex h-11 shrink-0 items-center gap-[6px] rounded-full px-3 text-[14px] font-semibold text-link">
            <LogOut size={16} strokeWidth={2.2} aria-hidden />
            Sign out
          </button>
        </header>
      </div>

      {toast && (
        <div className="absolute inset-x-[14px] top-[124px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="My job" initial="half" halfPx={480}>
        {!data ? (
          <div className="flex flex-col gap-3" aria-busy>
            <span className="h-[64px] animate-pulse rounded-[16px] bg-white/70" />
            <span className="h-[220px] animate-pulse rounded-[16px] bg-white/70" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* On duty */}
            <div className="flex items-center gap-3 rounded-[16px] bg-white/[0.86] px-[14px] py-3">
              <span className={`size-[10px] shrink-0 rounded-full ${w!.onDuty ? "bg-open" : "bg-unknown"}`} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-bold" id="duty-label">
                  {w!.onDuty ? "On duty" : "Off duty"}
                </span>
                <span className="text-[12px] leading-snug text-ink-2">
                  {w!.onDuty
                    ? `The office can pick you for jobs · location shared ~100 m${w!.dutyUpdatedAt ? ` · ${ago(w!.dutyUpdatedAt)}` : ""}`
                    : "Start your shift so the office can send you jobs. Location is shared only while on duty."}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={w!.onDuty}
                aria-labelledby="duty-label"
                disabled={busy}
                onClick={() => void toggleDuty()}
                className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${w!.onDuty ? "bg-open" : "bg-[rgba(120,120,128,0.16)]"}`}
              >
                <span className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-[left] ${w!.onDuty ? "left-[22px]" : "left-[2px]"}`} />
              </button>
            </div>

            {job && crew ? (
              <section className="flex flex-col gap-3 rounded-[16px] bg-white/[0.86] p-[14px]" aria-label="Your job">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">Your job</span>
                  <span className="rounded-full bg-accent-tint px-2 py-[3px] text-[12px] font-semibold text-accent-tint-ink">{stage}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[20px] font-bold leading-tight">{job.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
                    {st && (
                      <span className="rounded-full px-2 py-[2px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
                        {st.word}
                      </span>
                    )}
                    {[job.road, distKm != null ? `${distKm < 1 ? "<1" : Math.round(distKm)} km from you` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>

                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[14px]">
                  <dt className="text-ink-2">Your role</dt>
                  <dd className="m-0 font-semibold capitalize">{SKILL_WORD[w!.skill][0]}</dd>
                  <dt className="text-ink-2">Crew</dt>
                  <dd className="m-0">
                    {crew.name} · {crew.members.length} people{crew.supervisor ? (crew.supervisor === w!.name ? " · you're the supervisor" : ` · supervisor ${crew.supervisor}`) : ""}
                  </dd>
                  {crew.machines.length > 0 && (
                    <>
                      <dt className="text-ink-2">Machines</dt>
                      <dd className="m-0">{crew.machines.map((m) => m.code).join(", ")}</dd>
                    </>
                  )}
                  {job.lastUpdate && (
                    <>
                      <dt className="text-ink-2">Progress</dt>
                      <dd className="m-0">
                        {job.lastUpdate.pct != null ? `${job.lastUpdate.pct}% cleared` : "Update posted"} · {ago(job.lastUpdate.at)}
                      </dd>
                    </>
                  )}
                </dl>
                {job.lastUpdate?.pct != null && (
                  <div className="h-[6px] overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={job.lastUpdate.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cleared">
                    <div className="h-full rounded-full bg-open" style={{ width: `${job.lastUpdate.pct}%` }} />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {!crew.arrivedAt && (
                    <a href={directions} target="_blank" rel="noopener" className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline">
                      <Navigation size={17} strokeWidth={2.2} className="rotate-90" fill="currentColor" aria-hidden />
                      Start directions
                    </a>
                  )}
                  {!crew.arrivedAt ? (
                    <button type="button" disabled={busy} onClick={() => void arrived()} className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-[16px] font-semibold text-accent-tint-ink disabled:opacity-60">
                      <Check size={18} strokeWidth={2.4} aria-hidden />
                      I&apos;ve arrived
                    </button>
                  ) : (
                    <Link href={`/official/field/${job.eventId}?from=crew`} className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline">
                      Post progress update
                    </Link>
                  )}
                  {crew.arrivedAt && (
                    <Link href={`/official/field/${job.eventId}?from=crew&final=1`} className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-open-bg text-[16px] font-semibold text-open-ink no-underline">
                      <Check size={18} strokeWidth={2.4} aria-hidden />
                      Job done — road fully open
                    </Link>
                  )}
                  <span className="text-center text-[12px] text-ink-2">Updates need a photo · the AI checks it matches what you report.</span>
                </div>

                <div className="border-t-[0.5px] border-black/[0.15] pt-2">
                  <button type="button" aria-expanded={teamOpen} onClick={() => setTeamOpen((o) => !o)} className="flex min-h-11 w-full items-center gap-2 text-left text-[14px] font-semibold">
                    <Users size={16} strokeWidth={2.2} className="text-accent" aria-hidden />
                    <span className="flex-1">Your crew ({crew.members.length}){crew.machines.length ? ` · ${crew.machines.length} machines` : ""}</span>
                    <ChevronDown size={16} strokeWidth={2.4} className={`text-ink-3 transition-transform ${teamOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {teamOpen && (
                    <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                      {crew.members.map((m) => (
                        <li key={m.name} className="flex justify-between gap-2">
                          <span>
                            {m.name}
                            {m.you ? " (you)" : ""}
                          </span>
                          <span className="text-ink-2">{SKILL_WORD[m.skill][0]}</span>
                        </li>
                      ))}
                      {crew.machines.map((m) => (
                        <li key={m.code} className="flex justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Truck size={14} strokeWidth={2} className="text-ink-3" aria-hidden />
                            {m.code}
                          </span>
                          <span className="text-ink-2">{m.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : (
              <div className="flex flex-col gap-1 rounded-[16px] bg-white/[0.86] p-[14px]">
                <span className="text-[17px] font-bold">No job right now</span>
                <span className="text-[14px] leading-[1.45] text-ink-2">
                  {w!.onDuty
                    ? "You're on duty. When the office sends your crew to a site, the job appears here with directions."
                    : "Start your shift to be picked for jobs near you."}
                  {w!.baseName ? ` Your depot: ${w!.baseName}.` : ""}
                </span>
              </div>
            )}

            <p className="m-0 text-center text-[12px] leading-[1.45] text-ink-2">Use the phone only when safely stopped. Follow your supervisor and site safety rules.</p>
          </div>
        )}
      </Sheet>
    </main>
  );
}
