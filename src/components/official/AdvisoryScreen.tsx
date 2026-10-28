"use client";

// Frame 14b Public advisory: map on the event; sheet with "Public advisory" + "Draft · written from verified
// events" + close (→ 14), an ENGLISH card and a हिन्दी card (editable — the official has the last word),
// the reach line, and Publish to travellers (alerts + event timeline, then back to 14).
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import Sheet from "@/components/glass/Sheet";
import Toast from "@/components/glass/Toast";
import type { MapEvent } from "@/lib/events/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

interface Draft {
  event: { id: string; title: string; road: string | null; place: string | null; status: MapEvent["status"]; lat: number; lng: number };
  en: string;
  hi: string;
  by: string;
  reach: { travellers: number; trips: number };
}

const card = "flex flex-col gap-[6px] rounded-[16px] bg-white/[0.86] p-[14px]";
const area =
  "w-full resize-none rounded-[10px] border-[0.5px] border-transparent bg-transparent p-0 text-[16px] leading-[1.45] text-ink outline-none focus:border-accent focus:bg-white focus:p-2";

export default function AdvisoryScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [en, setEn] = useState("");
  const [hi, setHi] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/official/advisory?eventId=${encodeURIComponent(eventId)}`);
        if (res.status === 401) {
          router.replace("/official/login");
          return;
        }
        const j = (await res.json()) as { ok: boolean; data?: Draft; degraded?: string; error?: string };
        if (!alive) return;
        if (!j.ok || !j.data) {
          setFailed(j.error ?? "Advisory draft unavailable right now");
          return;
        }
        setDraft(j.data);
        setEn(j.data.en);
        setHi(j.data.hi);
        if (j.degraded) setToast(j.degraded);
      } catch {
        if (alive) setFailed("Couldn't reach the server — try again");
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId, router]);

  async function publish() {
    setBusy(true);
    try {
      const res = await fetch("/api/official/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, en, hi }),
      });
      const j = (await res.json()) as { ok: boolean; data?: { sent: number }; error?: string };
      if (j.ok && j.data) {
        router.push(`/official?published=${j.data.sent}`);
        return;
      }
      setToast(j.error ?? "Couldn't publish — try again");
    } catch {
      setToast("Couldn't publish — try again");
    }
    setBusy(false);
  }

  const e = draft?.event;

  // Put the event in the strip of map above the tall sheet (padding shifts the visual centre).
  const placed = useRef(false);
  const place = useCallback(() => {
    if (!e || placed.current || !mapRef.current) return;
    placed.current = true;
    mapRef.current.jumpTo({ center: [e.lng, e.lat], zoom: 11, padding: { top: 40, bottom: Math.min(640, window.innerHeight - 160), left: 0, right: 0 } });
  }, [e]);
  useEffect(place, [place]);
  const pin: MapEvent[] = e
    ? [
        {
          id: e.id, type: "other", status: e.status, placeName: e.place, roadRef: e.road, lat: e.lat, lng: e.lng, summary: null,
          confidence: 1, lastConfirmedAt: new Date().toISOString(), reports: 0, news: 0, modelsAgreed: null, photoUrl: null,
        },
      ]
    : [];
  const where = e ? `${e.road ?? "this road"} near ${e.place ?? "here"}` : "";
  const reach = draft?.reach.travellers ?? 0;

  return (
    <main className="fixed inset-0 overflow-hidden">
      {e ? (
        <MapView mapRef={mapRef} onViewChange={place} showRoadLayer={false} events={pin} initialView={{ latitude: e.lat, longitude: e.lng, zoom: 11 }} />
      ) : (
        <div className="absolute inset-0 bg-land" />
      )}

      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-30">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <Sheet label="Public advisory" initial="half" halfPx={640}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[2px]">
              <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">Public advisory</h1>
              <span className="text-[14px] text-ink-2">Draft · written from verified events{e ? ` · ${e.title}` : ""}</span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.push("/official")}
              className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.14)] text-ink-2"
            >
              <X size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {failed ? (
            <div className={card}>
              <span className="text-[16px] font-bold">Can’t draft this advisory</span>
              <span className="text-[14px] leading-[1.4] text-ink-2">{failed}</span>
            </div>
          ) : !draft ? (
            <div className="flex flex-col gap-3" aria-busy>
              <span className="h-[110px] animate-pulse rounded-[16px] bg-white/70" />
              <span className="h-[110px] animate-pulse rounded-[16px] bg-white/70" />
              <span className="text-center text-[13px] text-ink-3">Drafting from the verified event…</span>
            </div>
          ) : (
            <>
              <label className={card}>
                <span className="text-[12px] font-bold tracking-[0.5px] text-ink-2">ENGLISH</span>
                <textarea className={area} rows={4} value={en} maxLength={400} onChange={(x) => setEn(x.target.value)} />
              </label>
              <label className={card}>
                <span className="text-[12px] font-bold tracking-[0.5px] text-ink-2" lang="hi">
                  हिन्दी
                </span>
                <textarea className={area} rows={4} lang="hi" value={hi} maxLength={600} onChange={(x) => setHi(x.target.value)} />
              </label>

              <p className="m-0 rounded-[14px] bg-accent-tint px-[14px] py-[10px] text-[14px] leading-[1.4] text-accent-tint-ink">
                {reach > 0 ? (
                  <>
                    Reaches <strong>{reach}</strong> traveller{reach === 1 ? "" : "s"} watching {where}
                  </>
                ) : (
                  <>No one is watching a trip through {where} yet — it will show on the event’s timeline</>
                )}
              </p>

              <button
                type="button"
                onClick={publish}
                disabled={busy || en.trim().length < 10}
                className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish to travellers"}
              </button>
              <p className="m-0 text-center text-[12px] text-ink-3">
                Drafted by {draft.by === "template" ? "a template (AI unavailable)" : draft.by.includes("spark-open") ? "Muse Spark Open" : "Muse Spark"} · you can edit
                both texts · travellers are told to verify locally
              </p>
            </>
          )}
        </div>
      </Sheet>
    </main>
  );
}
