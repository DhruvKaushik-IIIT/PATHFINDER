"use client";

// Frame 09 Alerts (docs/design/glass-html/Alerts.dc.html): tall sheet over the map. Unread Road Watch
// alerts as big cards with "See new plan"; older alerts as a compact list; then the trips being
// watched (stop watching here). Opening the screen marks everything read.
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import { ago } from "@/lib/events/types";
import { VERDICT_STYLE } from "@/lib/geo/format";
import { routeUrl, type Alert, type WatchedTrip } from "@/lib/watch/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const KIND_WORD: Record<Alert["kind"], string> = { road_watch: "Road Watch", scout_request: "Scout request", info: "Info" };

function dotFor(a: Alert): string {
  if (a.kind === "scout_request") return "#0A84FF";
  if (a.data?.advisory) return "#0071E3";
  if (a.data?.verdict) return VERDICT_STYLE[a.data.verdict].dot;
  return "#8E8E93";
}

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [trips, setTrips] = useState<WatchedTrip[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, w] = await Promise.all([
          fetch("/api/alerts").then((r) => r.json() as Promise<{ data: { alerts: Alert[] }; degraded?: string }>),
          fetch("/api/watch").then((r) => r.json() as Promise<{ data: WatchedTrip[] }>),
        ]);
        if (!alive) return;
        setAlerts(a.data.alerts);
        setTrips(w.data ?? []);
        if (a.degraded) setToast(a.degraded);
        if (a.data.alerts.some((x) => !x.read)) fetch("/api/alerts", { method: "POST", body: JSON.stringify({ read: "all" }) }).catch(() => {});
      } catch {
        if (alive) {
          setAlerts([]);
          setToast("Couldn't reach the server — try again");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function stop(id: string) {
    const res = await fetch(`/api/watch/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setTrips((t) => t.filter((x) => x.id !== id));
    else setToast("Couldn't stop watching — try again");
  }

  // "Not now" on a scout request: drop the card, tell the server (it marks that alert read).
  async function notNow(a: Alert) {
    setAlerts((list) => (list ?? []).map((x) => (x.id === a.id ? { ...x, read: true, data: { ...x.data, url: undefined } } : x)));
    if (a.data?.requestId) fetch("/api/scout/respond", { method: "POST", body: JSON.stringify({ requestId: a.data.requestId, action: "dismiss" }) }).catch(() => {});
  }

  // Unread alerts (max 3) get the big card; the rest go in the compact list.
  const fresh = (alerts ?? []).filter((a) => !a.read).slice(0, 3);
  const earlier = (alerts ?? []).filter((a) => !fresh.includes(a));

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />

      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Alerts" initial="half" halfPx={694}>
        <div className="flex flex-col gap-[14px]">
          <div className="flex items-center justify-between">
            <h1 className="m-0 text-[28px] font-bold tracking-[-0.4px]">Alerts</h1>
            <button
              type="button"
              aria-label="Close"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
              className="flex size-[44px] items-center justify-center rounded-full bg-[rgba(118,118,128,0.14)] text-ink-2"
            >
              <X size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {alerts === null ? (
            <div className="flex flex-col gap-3" aria-busy>
              <span className="h-36 animate-pulse rounded-[18px] bg-white/70" />
              <span className="h-20 animate-pulse rounded-[16px] bg-white/70" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col gap-2 rounded-[18px] bg-white/[0.86] p-4">
              <span className="text-[18px] font-bold leading-tight">No alerts yet</span>
              <span className="text-[15px] leading-[1.45] text-[#3A3A3C]">
                Plan a trip and switch on <strong>Watch this trip</strong>. Road Watch re-plans it and tells you here when a road on
                your way changes.
              </span>
              <Link href="/" className="mt-1 flex h-11 items-center justify-center rounded-[12px] bg-accent text-[16px] font-semibold text-white no-underline">
                Plan a trip
              </Link>
            </div>
          ) : (
            <>
              {fresh.map((a) => (
                <article key={a.id} className="flex flex-col gap-[10px] rounded-[18px] bg-white/[0.86] p-4">
                  <span className="flex items-center gap-[7px] text-[12px] font-bold uppercase tracking-[0.4px] text-ink-2">
                    <span className="size-2 rounded-full" style={{ background: dotFor(a) }} />
                    {a.data?.advisory ? "Official advisory" : KIND_WORD[a.kind]} · {ago(a.createdAt)}
                  </span>
                  <span className="text-[18px] font-bold leading-[1.25]">{a.title}</span>
                  {a.body && <span className="text-[15px] leading-[1.45] text-[#3A3A3C]">{a.body}</span>}
                  {a.data?.hi && (
                    <span lang="hi" className="text-[15px] leading-[1.45] text-[#3A3A3C]">
                      {a.data.hi}
                    </span>
                  )}
                  {a.kind === "scout_request" ? (
                    <div className="flex gap-2">
                      {a.data?.url && (
                        <Link
                          href={a.data.url}
                          className="flex h-11 flex-1 items-center justify-center rounded-[12px] bg-accent-tint text-[16px] font-semibold text-accent-tint-ink no-underline"
                        >
                          Share photo
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => notNow(a)}
                        className="flex h-11 flex-1 items-center justify-center rounded-[12px] bg-[rgba(118,118,128,0.14)] text-[16px] font-medium text-ink"
                      >
                        Not now
                      </button>
                    </div>
                  ) : a.data?.url && (
                    <Link
                      href={a.data.url}
                      className="flex h-11 items-center justify-center rounded-[12px] bg-accent text-[16px] font-semibold text-white no-underline"
                    >
                      {a.data.advisory ? "See details" : "See new plan"}
                    </Link>
                  )}
                </article>
              ))}

              {earlier.length > 0 && (
                <section aria-label="Earlier alerts" className="rounded-[16px] bg-white/[0.86]">
                  {earlier.map((a, i) => {
                    const row = (
                      <>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: dotFor(a) }} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          {/* Lead with what changed; the trip name is the context. */}
                          <span className="truncate text-[15px]">{a.body ? a.body.split(". ")[0]!.replace(/\.$/, "") : a.title}</span>
                          <span className="truncate text-[13px] text-ink-2">{a.data?.trip ?? (a.body ? a.title : "")}</span>
                        </span>
                        <span className="shrink-0 text-[13px] text-ink-2">{ago(a.createdAt)}</span>
                      </>
                    );
                    const cls = `flex items-center gap-3 px-[14px] py-[13px] text-ink no-underline ${
                      i < earlier.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""
                    }`;
                    return a.data?.url ? (
                      <Link key={a.id} href={a.data.url} className={cls}>
                        {row}
                      </Link>
                    ) : (
                      <div key={a.id} className={cls}>
                        {row}
                      </div>
                    );
                  })}
                </section>
              )}
            </>
          )}

          {trips.length > 0 && (
            <section aria-label="Trips you're watching" className="flex flex-col gap-2">
              <h2 className="m-0 px-1 text-[13px] font-semibold uppercase tracking-[0.4px] text-ink-3">Watching</h2>
              <div className="rounded-[16px] bg-white/[0.86]">
                {trips.map((t, i) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-[14px] py-[10px] ${i < trips.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: t.lastVerdict ? VERDICT_STYLE[t.lastVerdict.verdict].dot : "#8E8E93" }}
                    />
                    <Link href={routeUrl(t.from, t.to, t.departAt)} className="flex min-w-0 flex-1 flex-col text-ink no-underline">
                      <span className="truncate text-[15px] font-semibold">
                        {t.from.name} → {t.to.name}
                      </span>
                      {t.lastVerdict && <span className="truncate text-[13px] text-ink-2">{t.lastVerdict.headline}</span>}
                    </Link>
                    <button type="button" onClick={() => stop(t.id)} className="h-11 shrink-0 px-1 text-[14px] font-semibold text-link">
                      Stop
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="m-0 text-center text-[12px] text-ink-3">Road Watch re-checks when a road on your route changes · verify with official sources</p>
        </div>
      </Sheet>
    </main>
  );
}
