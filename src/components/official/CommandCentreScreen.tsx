"use client";

// Frame 14 Command Centre — PHONE layout (CLAUDE.md 7.5; ControlRoom.dc.html is only the style source):
// map base with the district's events + rain-risk layer, floating glass header (logo, org, Sign out),
// a row of 4 glass stat tiles, and a bottom sheet with the priority queue ranked by impact.
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import RiskLayer from "@/components/map/RiskLayer";
import DispatchCard from "./DispatchCard";
import SlopesToInspect from "./SlopesToInspect";
import { eventTitle, STATUS_STYLE } from "@/lib/events/types";
import { hoursText, roughCount, type CommandCentre, type QueueItem } from "@/lib/official/types";
import type { AreaRisk } from "@/lib/risk/types";
import { machinesLabel } from "@/lib/repairs/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});


function detail(q: QueueItem): string {
  const parts = [`~${roughCount(q.vehiclesPerDay)} veh/day`];
  if (q.road) parts.unshift(q.road);
  if (q.debrisM3) parts.push(`~${roughCount((q.debrisM3.min + q.debrisM3.max) / 2)} m³`);
  parts.push(`${hoursText(q.hoursLeft)}${q.etaKnown ? "" : " est."}`);
  parts.push(q.crew ? `${q.crew.name}${q.crew.machines.length ? ` (${machinesLabel(q.crew.machines)})` : ""}`.replace(/ /g, "\u00a0") : "unassigned");
  return parts.join(" · ");
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-float flex min-w-0 flex-1 flex-col items-start gap-[1px] rounded-[14px] px-[10px] py-[8px]">
      <span className="text-[19px] font-bold leading-tight tracking-[-0.3px]">{value}</span>
      <span className="truncate text-[12px] leading-tight text-ink-2">{label}</span>
    </div>
  );
}

export default function CommandCentreScreen() {
  const router = useRouter();
  const [cc, setCc] = useState<CommandCentre | null>(null);
  const [risk, setRisk] = useState<AreaRisk | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const mapRef = useRef<MapRef>(null);

  // Coming back from Publish (advisory) or Post update (field update).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sent = q.get("published");
    const updated = q.get("updated");
    if (sent === null && updated === null) return;
    if (sent !== null) setToast(`Advisory published — sent to ${sent} traveller${sent === "1" ? "" : "s"} watching this road.`);
    else if (updated === "open") setToast("Marked fully open — the event is closed and the crew is free again. Road Watch is re-checking trips.");
    else if (updated === "warn") setToast("Update posted, but the photo didn't match — it's flagged on the timeline. Road Watch is re-checking trips.");
    else setToast("Update posted — travellers on this road will see it. Road Watch is re-checking trips.");
    window.history.replaceState(null, "", "/official");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/official/queue");
        if (res.status === 401) {
          router.replace("/official/login");
          return;
        }
        const j = (await res.json()) as { ok: boolean; data?: CommandCentre; degraded?: string; error?: string };
        if (!alive) return;
        if (!j.ok || !j.data) {
          setToast(j.error ?? "Command Centre unavailable right now");
          return;
        }
        setCc(j.data);
        if (j.degraded) setToast(j.degraded);
        if (version > 0) return; // refresh after approve: risk layer unchanged
        // Rain-risk layer over the district (no AI; one Open-Meteo request, cached server-side).
        const d = j.data.official.district;
        fetch(`/api/risk/area?lat=${d.lat}&lng=${d.lng}&radiusKm=50`)
          .then((r) => r.json() as Promise<{ data: AreaRisk | null }>)
          .then((b) => alive && setRisk(b.data))
          .catch(() => {});
      } catch {
        if (alive) setToast("Couldn't reach the server — try again");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, version]);

  const onApproved = useCallback(() => setVersion((v) => v + 1), []);

  async function signOut() {
    await fetch("/api/official/logout", { method: "POST" }).catch(() => {});
    router.replace("/official/login");
  }

  const d = cc?.official.district;
  const s = cc?.stats;

  // Frame the district's events in the map area above the sheet, once data and map are both ready.
  const fitted = useRef(false);
  const fit = useCallback(() => {
    if (!cc || fitted.current || !mapRef.current) return;
    fitted.current = true;
    const pts = cc.queue.length ? cc.queue.map((q) => [q.event.lng, q.event.lat]) : [[cc.official.district.lng, cc.official.district.lat]];
    const xs = pts.map((p) => p[0]!);
    const ys = pts.map((p) => p[1]!);
    mapRef.current.fitBounds(
      [
        [Math.min(...xs) - 0.03, Math.min(...ys) - 0.03],
        [Math.max(...xs) + 0.03, Math.max(...ys) + 0.03],
      ],
      { padding: { top: 200, bottom: 560, left: 40, right: 40 }, maxZoom: 11, duration: 600 },
    );
  }, [cc]);
  useEffect(fit, [fit]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        onViewChange={fit}
        showRoadLayer={false}
        events={cc?.queue.map((q) => q.event) ?? []}
        onSelectEvent={(e) => router.push(`/event/${e.id}`)}
        initialView={d ? { latitude: d.lat, longitude: d.lng, zoom: 9.2 } : undefined}
      >
        <RiskLayer id="pf-cc-risk" areas={risk?.cells ?? []} />
      </MapView>

      {/* floating glass header + stat tiles */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[480px] flex-col gap-2 px-[14px] pt-[50px]">
        <header className="glass-float pointer-events-auto flex items-center gap-3 rounded-[22px] py-[10px] pl-[12px] pr-[6px]">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-accent text-white">
            <ShieldCheck size={20} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] font-bold leading-tight">Command Centre</span>
            <span className="truncate text-[13px] text-ink-2">{cc ? `${cc.official.org} · ${cc.official.role}` : "Signing in…"}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            className="flex h-11 shrink-0 items-center gap-[6px] rounded-full px-3 text-[14px] font-semibold text-link"
          >
            <LogOut size={16} strokeWidth={2.2} aria-hidden />
            Sign out
          </button>
        </header>
        <div className="pointer-events-auto flex gap-2" aria-label="District at a glance">
          <StatTile value={s ? String(s.active) : "–"} label="active" />
          <StatTile value={s ? `${s.crewsFree}/${s.crewsTotal}` : "–"} label="crews free" />
          <StatTile value={s ? `~${roughCount(s.vehiclesHit)}` : "–"} label="vehicles hit" />
          <StatTile value={s ? String(s.watching) : "–"} label="watching" />
        </div>
      </div>

      {toast && (
        <div className="absolute inset-x-[14px] top-[190px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Priority queue" initial="half" halfPx={520}>
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-baseline justify-between px-1">
            <h1 className="m-0 text-[20px] font-bold">Priority queue</h1>
            <span className="text-[13px] text-ink-2">Ranked by impact</span>
          </div>

          {!cc ? (
            <div className="flex flex-col gap-[10px]" aria-busy>
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-[74px] animate-pulse rounded-[16px] bg-white/70" />
              ))}
            </div>
          ) : cc.queue.length === 0 ? (
            <div className="flex flex-col gap-1 rounded-[16px] bg-white/[0.86] p-[14px]">
              <span className="text-[16px] font-bold">Nothing open in {d?.name}</span>
              <span className="text-[14px] leading-[1.4] text-ink-2">No verified disruptions right now. New reports appear here as soon as they’re verified.</span>
            </div>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
              {cc.queue.map((q) => {
                const st = STATUS_STYLE[q.status];
                return (
                  <li key={q.event.id}>
                    <Link
                      href={`/official/field/${q.event.id}`}
                      className="flex items-start gap-3 rounded-[16px] bg-white/[0.86] p-[14px] text-ink no-underline"
                    >
                      <span className="w-[18px] shrink-0 text-[15px] font-bold">{q.rank}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-baseline gap-[7px]">
                            <span className="size-2 shrink-0 -translate-y-[1px] rounded-full" style={{ background: st.dot }} />
                            <span className="text-[15px] font-bold leading-tight">{eventTitle(q.event.type, q.event.placeName)}</span>
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-[3px] text-[12px] font-bold"
                            style={{ background: st.bg, color: st.ink }}
                          >
                            {st.word}
                          </span>
                        </span>
                        <span className="text-[13px] leading-[1.35] text-ink-2">{detail(q)}</span>
                      </span>
                      <ChevronRight size={18} className="mt-[1px] shrink-0 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {cc && cc.queue.length > 0 && (
            <DispatchCard version={version} advisoryEventId={cc.queue[0]!.event.id} onApproved={onApproved} onMessage={setToast} />
          )}

          {cc && <SlopesToInspect onMessage={setToast} />}

          <p className="m-0 px-1 text-center text-[12px] leading-[1.4] text-ink-3">
            Impact = vehicles reaching each spot before it clears × time each loses (estimates from road class, status and ETA)
            {risk && risk.level !== "none" ? " · purple = rain risk, next 12 h" : ""}
          </p>
        </div>
      </Sheet>
    </main>
  );
}
