"use client";

// Frame 04 What-If planner: the Route Check agent's options (departure time / route), best one outlined.
// Reads the check /route already ran (sessionStorage) — no extra AI call; re-fetches (cached) if missing.
import { ChevronLeft, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { clock } from "@/lib/geo/format";
import type { RoutePlan } from "@/lib/geo/routeTypes";
import { checkedBy, loadCheck, saveCheck, type CheckResult } from "./routeData";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
/** "6:00 AM" today, "Tomorrow 6:00 AM" otherwise. */
function when(iso: string): string {
  const d = DAY.format(new Date(iso));
  const prefix = d === DAY.format(new Date()) ? "" : d === DAY.format(new Date(Date.now() + 86_400_000)) ? "Tomorrow " : "";
  return `${prefix}${clock(iso)}`;
}

export default function OptionsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const query = params.toString();
  const [data, setData] = useState<{ plan: RoutePlan; check: CheckResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadCheck();
    if (saved && saved.query === query) {
      setData(saved);
      return;
    }
    const from = params.get("from");
    const to = params.get("to");
    if (!from || !to) return setError("Choose a trip first");
    fetch("/api/route-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        fromName: params.get("fromName") ?? undefined,
        toName: params.get("toName") ?? undefined,
        ...(params.get("depart") && { departAt: params.get("depart") }),
      }),
    })
      .then((r) => r.json())
      .then((b: { data: { plan: RoutePlan; check: CheckResult } | null; degraded?: string }) => {
        if (!b.data) return setError(b.degraded ?? "Planner unavailable right now");
        setData(b.data);
        saveCheck(query, b.data.plan, b.data.check);
      })
      .catch(() => setError("Planner unavailable right now"));
  }, [params, query]);

  // Fit once, whichever comes last: the data (often instant from sessionStorage) or the map load.
  const fitted = useRef(false);
  const fit = useCallback(() => {
    const coords = data?.plan.routes.flatMap((r) => r.geometry.coordinates);
    if (fitted.current || !coords?.length || !mapRef.current) return;
    fitted.current = true;
    const xs = coords.map((c) => c[0]!);
    const ys = coords.map((c) => c[1]!);
    mapRef.current.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      // Only the strip above the sheet (top 250 px) shows the map.
      { padding: { top: 70, bottom: Math.max(0, window.innerHeight - 240), left: 40, right: 40 }, duration: 600 },
    );
  }, [data]);
  useEffect(fit, [fit]);

  const v = data?.check.verdict;
  const best = v?.options.find((o) => o.recommended);
  // Best first (frame 04); models sometimes write "(recommended)" into the label — the BEST pill says that.
  const options = [...(v?.options ?? [])]
    .sort((a, b) => Number(b.recommended) - Number(a.recommended))
    .map((o) => ({ ...o, label: o.label.replace(/\s*\((recommended|best)\)\s*/gi, " ").trim() }));

  function usePlan() {
    if (!best) return;
    const next = new URLSearchParams(query);
    next.set("depart", best.departAt);
    router.push(`/route?${next}`);
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView mapRef={mapRef} onViewChange={fit} routes={data?.plan.routes.map((r) => r.geometry) ?? []} events={data?.plan.routes[0]?.events ?? []} showRoadLayer={false} />

      <button
        type="button"
        aria-label="Back"
        onClick={() => router.back()}
        className="glass-float absolute left-[14px] top-[54px] z-10 flex size-[46px] items-center justify-center rounded-full text-ink"
      >
        <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
      </button>

      <section
        aria-label="When should you leave?"
        className="glass absolute inset-x-0 bottom-0 top-[250px] z-10 mx-auto flex max-w-[480px] flex-col gap-3 overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2"
      >
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">When should you leave?</h1>
          <span className="text-[14px] text-ink-2">
            {data ? `${data.plan.from.name} → ${data.plan.to.name} · compared by the trip agent` : "Comparing departure times…"}
          </span>
        </div>

        {error && <p className="py-6 text-center text-[15px] text-ink-2">{error}</p>}
        {!data && !error && <span className="h-32 animate-pulse rounded-[16px] bg-white/70" aria-busy />}

        {options.map((o) => (
          <article
            key={o.label}
            className={`flex flex-col gap-1 rounded-[16px] bg-white/84 px-4 py-3 ${o.recommended ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[17px] font-bold">{o.label}</h2>
              {o.recommended && <span className="rounded-full bg-accent px-[10px] py-[3px] text-[12px] font-bold text-white">BEST</span>}
            </div>
            <span className={`text-[15px] font-semibold ${o.recommended ? "text-accent" : "text-ink"}`}>
              Arrive ~{when(o.arriveAt)}
              {/\d/.test(o.label) ? "" : ` · leave ${when(o.departAt)}`}
            </span>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[14px] text-ink-2">
              {o.pros.map((p) => (
                <li key={`+${p}`}>• {p}</li>
              ))}
              {o.cons.map((c) => (
                <li key={`-${c}`} className="text-ink-3">
                  • {c}
                </li>
              ))}
            </ul>
          </article>
        ))}

        {v && data && (
          <div className="flex gap-2 rounded-[14px] bg-accent-tint px-[14px] py-3 text-[13px] text-accent-tint-ink">
            <ShieldCheck size={17} className="mt-px shrink-0" aria-hidden />
            <span className="flex flex-col gap-1">
              <span>{v.reasoning}</span>
              <span className="opacity-80">
                {checkedBy(data.check)} · {v.usedSources.join(" · ")}
              </span>
            </span>
          </div>
        )}

        {best && (
          <button type="button" onClick={usePlan} className="mt-1 flex h-[52px] shrink-0 items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white">
            Use the {best.label.replace(/\s*\((recommended|best)\)\s*/gi, "").replace(/^Leave\s+/i, "").replace(/\s+via.*$/i, "")} plan
          </button>
        )}
        <p className="text-center text-[11px] text-ink-3">Estimates · verify with official sources</p>
      </section>
    </main>
  );
}
