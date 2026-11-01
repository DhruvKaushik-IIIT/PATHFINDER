"use client";

// Build a crew (Option B Part C), Command Centre phone layout like 14b: map of the site with the
// proposed people (blue) and machines (dark) around it; sheet with what the site needs (code, from the
// measured debris), the proposed crew (nearest on duty, with distance + time), what's short, a short
// "why this crew" note by Muse Spark, and Approve & send. The officer can untick anyone before sending.
import { Check, HardHat, MapPin, Truck, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import type { CrewBrief } from "@/lib/ai/schemas";
import type { CrewProposal } from "@/lib/crew/builder";
import { SKILL_WORD } from "@/lib/crew/needs";
import { STATUS_STYLE } from "@/lib/events/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const BY: Record<string, string> = { baseten: "Muse Spark Open", meta: "Muse Spark 1.3", mock: "mock data", code: "Pathfinder" };
const time = (m: number) => (m < 60 ? `~${m} min` : `~${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

export default function CrewBuilderScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [p, setP] = useState<CrewProposal | null>(null);
  const [brief, setBrief] = useState<{ brief: CrewBrief; by: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set()); // unticked people/machines
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hindi, setHindi] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/official/crew/${eventId}`).catch(() => null);
      if (!alive) return;
      if (!res) return setFailed("Couldn't reach the server — try again.");
      if (res.status === 401) return router.replace("/official/login");
      if (res.status === 403) return router.replace("/crew");
      const j = (await res.json()) as { ok: boolean; data?: { proposal: CrewProposal }; error?: string };
      if (!j.ok || !j.data) return setFailed(j.error ?? "The crew builder is unavailable right now.");
      setP(j.data.proposal);
      if (j.data.proposal.existingCrew || !j.data.proposal.people.length) return;
      // The AI note comes second so the crew shows at once.
      const r2 = await fetch(`/api/official/crew/${eventId}?brief=1`).catch(() => null);
      const j2 = r2 ? ((await r2.json()) as { data?: { brief?: CrewBrief; briefBy?: string }; degraded?: string }) : null;
      if (!alive) return;
      if (j2?.data?.brief) setBrief({ brief: j2.data.brief, by: j2.data.briefBy ?? "code" });
      if (j2?.degraded) setToast(j2.degraded);
    })();
    return () => {
      alive = false;
    };
  }, [eventId, router]);

  // Fit the site + everyone picked above the sheet (once per proposal; moving the map re-fires onViewChange).
  const needsFit = useRef(true);
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || !p || !needsFit.current) return;
    needsFit.current = false;
    const pts = [p.event, ...p.people, ...p.machines];
    map.fitBounds(
      [
        [Math.min(...pts.map((x) => x.lng)) - 0.01, Math.min(...pts.map((x) => x.lat)) - 0.01],
        [Math.max(...pts.map((x) => x.lng)) + 0.01, Math.max(...pts.map((x) => x.lat)) + 0.01],
      ],
      { padding: { top: 60, bottom: 520, left: 30, right: 30 }, maxZoom: 12, duration: 0 },
    );
  }, [p]);
  useEffect(() => {
    needsFit.current = true;
    fit();
  }, [fit]);

  function toggle(id: string) {
    setOff((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function approve() {
    if (!p) return;
    setBusy(true);
    const res = await fetch(`/api/official/crew/${eventId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerIds: p.people.filter((x) => !off.has(x.id)).map((x) => x.id), machineIds: p.machines.filter((x) => !off.has(x.id)).map((x) => x.id) }),
    }).catch(() => null);
    const j = res ? ((await res.json()) as { ok: boolean; data?: { name: string; alerted: number }; error?: string }) : null;
    setBusy(false);
    if (!j?.ok || !j.data) return setToast(j?.error ?? "Couldn't send the crew — try again");
    router.push(`/official?crew=${encodeURIComponent(j.data.name)}&alerted=${j.data.alerted}`);
  }

  const st = p ? STATUS_STYLE[p.event.status] : null;
  const people = p?.people.filter((x) => !off.has(x.id)) ?? [];
  const machines = p?.machines.filter((x) => !off.has(x.id)) ?? [];
  const ready = [...people.map((x) => x.minutes), ...machines.map((x) => x.minutes)];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView mapRef={mapRef} onViewChange={fit} showRoadLayer={false} events={[]}>
        {p && (
          <>
            {p.machines.map((m) => (
              <Marker key={m.id} latitude={m.lat} longitude={m.lng} anchor="center">
                <span className={`flex size-[22px] items-center justify-center rounded-[6px] border-2 border-white bg-ink text-white shadow ${off.has(m.id) ? "opacity-30" : ""}`} aria-label={`${m.code}, ${m.km} km`}>
                  <Truck size={12} strokeWidth={2.4} aria-hidden />
                </span>
              </Marker>
            ))}
            {p.people.map((w) => (
              <Marker key={w.id} latitude={w.lat} longitude={w.lng} anchor="center">
                <span className={`block size-[14px] rounded-full border-2 border-white bg-accent shadow ${off.has(w.id) ? "opacity-30" : ""}`} aria-label={`${w.name}, ${w.km} km`} />
              </Marker>
            ))}
            <Marker latitude={p.event.lat} longitude={p.event.lng} anchor="bottom">
              <MapPin size={36} strokeWidth={2} fill="white" style={{ color: st?.dot }} className="drop-shadow" aria-label={p.event.title} />
            </Marker>
          </>
        )}
      </MapView>

      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-30">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Build a crew" initial="half" halfPx={560}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[2px]">
              <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">Build a crew</h1>
              <span className="flex flex-wrap items-center gap-x-2 text-[14px] text-ink-2">
                {p?.event.title ?? "Loading…"}
                {st && (
                  <span className="rounded-full px-2 py-[2px] text-[12px] font-bold" style={{ background: st.bg, color: st.ink }}>
                    {st.word}
                  </span>
                )}
                {p?.event.road ?? ""}
              </span>
            </div>
            <button type="button" aria-label="Close" onClick={() => router.push("/official")} className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.14)] text-ink-2">
              <X size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {failed ? (
            <div className="flex flex-col gap-1 rounded-[16px] bg-white/[0.86] p-[14px]">
              <span className="text-[16px] font-bold">Can&apos;t build a crew here</span>
              <span className="text-[14px] text-ink-2">{failed}</span>
            </div>
          ) : !p ? (
            <div className="flex flex-col gap-3" aria-busy>
              <span className="h-[120px] animate-pulse rounded-[16px] bg-white/70" />
              <span className="h-[220px] animate-pulse rounded-[16px] bg-white/70" />
            </div>
          ) : p.existingCrew ? (
            <div className="flex flex-col gap-1 rounded-[16px] bg-white/[0.86] p-[14px]">
              <span className="text-[16px] font-bold">{p.existingCrew.name} is already working here</span>
              <span className="text-[14px] text-ink-2">Follow its progress on the Command Centre under Crews.</span>
            </div>
          ) : (
            <>
              {/* What the site needs (code) */}
              <section className="flex flex-col gap-2 rounded-[16px] bg-white/[0.86] p-[14px]" aria-label="What the site needs">
                <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">What the site needs</span>
                <span className="text-[17px] font-bold leading-snug">
                  {p.needsText.machines || "No machines"} · {p.needs.totalPeople} people
                </span>
                <span className="text-[13px] text-ink-2">{p.needsText.people}</span>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[1.4] text-ink-2">
                  {p.needs.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </section>

              {/* AI note */}
              {brief ? (
                <section className="flex flex-col gap-1.5 rounded-[16px] bg-accent-tint p-[14px] text-accent-tint-ink" aria-label="Why this crew">
                  <span className="flex items-center justify-between gap-2 text-[12px] font-bold uppercase tracking-[0.4px]">
                    Why this crew
                    {brief.brief.whyHi && (
                      <button type="button" lang={hindi ? undefined : "hi"} onClick={() => setHindi((h) => !h)} className="-my-3 h-11 px-1 text-[12px] font-semibold normal-case tracking-normal">
                        {hindi ? "English" : "हिन्दी"}
                      </button>
                    )}
                  </span>
                  <span className="text-[14px] leading-[1.45]" lang={hindi ? "hi" : undefined}>
                    {hindi ? brief.brief.whyHi : brief.brief.why}
                  </span>
                  {brief.brief.safety.length > 0 && (
                    <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13px] leading-[1.4]">
                      {brief.brief.safety.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                  <span className="text-[11px] opacity-80">Note by {BY[brief.by] ?? brief.by} · the crew and numbers are picked by code, not the AI</span>
                </section>
              ) : (
                p.people.length > 0 && <span className="h-[86px] animate-pulse rounded-[16px] bg-accent-tint" aria-label="Writing a short note…" />
              )}

              {p.shortfall && (
                <div className="flex items-start gap-2 rounded-[16px] bg-[rgba(255,159,10,0.20)] px-[14px] py-3 text-[14px] text-[#8A4300]" role="status">
                  <TriangleAlert size={17} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden />
                  <span>
                    <b>Short:</b> {p.shortfall} — nobody free on duty within ~100 km. Ask a neighbouring division or call staff in.
                  </span>
                </div>
              )}

              {/* Proposed crew */}
              <section className="flex flex-col gap-2 rounded-[16px] bg-white/[0.86] p-[14px]" aria-label="Proposed crew">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">Proposed crew · nearest on duty</span>
                  <span className="text-[12px] text-ink-2">tap to leave out</span>
                </span>
                <ul className="m-0 flex list-none flex-col p-0">
                  {p.people.map((w) => (
                    <PickRow key={w.id} on={!off.has(w.id)} onToggle={() => toggle(w.id)} icon={<HardHat size={16} strokeWidth={2.2} aria-hidden />} title={w.name} sub={`${SKILL_WORD[w.skill][0]} · ${w.from}`} right={`${w.km} km · ${time(w.minutes)}`} />
                  ))}
                  {p.machines.map((m) => (
                    <PickRow key={m.id} on={!off.has(m.id)} onToggle={() => toggle(m.id)} icon={<Truck size={16} strokeWidth={2.2} aria-hidden />} title={m.code} sub={`${m.label} · ${m.from}`} right={`${m.km} km · ${time(m.minutes)}`} />
                  ))}
                </ul>
              </section>

              <button
                type="button"
                disabled={busy || people.length === 0}
                onClick={() => void approve()}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-white disabled:opacity-50"
              >
                <Check size={18} strokeWidth={2.4} aria-hidden />
                {busy ? "Sending…" : `Approve & send ${people.length} people${machines.length ? ` + ${machines.length} machines` : ""}`}
              </button>
              <span className="text-center text-[12px] text-ink-2">
                {ready.length ? `Whole crew on site in ${time(Math.max(...ready))} · ` : ""}each worker gets the job on their phone (My job).
              </span>
            </>
          )}
        </div>
      </Sheet>
    </main>
  );
}

function PickRow({ on, onToggle, icon, title, sub, right }: { on: boolean; onToggle: () => void; icon: React.ReactNode; title: string; sub: string; right: string }) {
  return (
    <li className="border-b-[0.5px] border-black/[0.12] last:border-b-0">
      <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className={`flex min-h-[52px] w-full items-center gap-3 py-2 text-left ${on ? "" : "opacity-45"}`}>
        <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-[6px] ${on ? "bg-accent text-white" : "border-[1.5px] border-black/25 text-transparent"}`}>
          <Check size={14} strokeWidth={3} aria-hidden />
        </span>
        <span className="shrink-0 text-ink-3">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{title}</span>
          <span className="truncate text-[12px] capitalize text-ink-2">{sub}</span>
        </span>
        <span className="shrink-0 text-right text-[12px] text-ink-2">{right}</span>
      </button>
    </li>
  );
}
