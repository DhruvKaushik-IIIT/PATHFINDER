"use client";

// Frame 10b Report sent (docs/design/glass-html/ReportDone.dc.html): map with a ring at your report,
// sheet with what the AI found, matched reports, your transcribed note and Scout points.
import { Check, Clock, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";
import Toast from "@/components/glass/Toast";
import { useEvents } from "@/components/map/useEvents";
import { TYPE_WORD } from "@/lib/events/types";
import { LAST_REPORT_KEY } from "./storage";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

// The subset of POST /api/reports `data` this screen shows.
interface Result {
  lat: number;
  lng: number;
  reportStatus: "accepted" | "pending" | "rejected";
  eventAction: "created" | "merged" | "noted" | "none";
  eventReports: number;
  points: number;
  scoutBonus?: number;
  placeName: string | null;
  road: { ref: string | null; name: string | null } | null;
  claims: { eventType: string; status: string; measurements: { blockedPct: { min: number; max: number } | null } }[];
  verdict: { confidence: number; correctedEventType: string | null; correctedStatus: string | null } | null;
  modelsAgreed: number;
  transcript: string | null;
}

const STATUS_WORD: Record<string, string> = { open: "open", slow: "slow", one_lane: "one lane open", closed: "closed", unknown: "status unclear" };

function aiFound(r: Result): string {
  const c = r.claims[0];
  if (!c) return "Not analysed yet";
  const type = r.verdict?.correctedEventType ?? c.eventType;
  const status = r.verdict?.correctedStatus ?? c.status;
  const b = c.measurements.blockedPct;
  const detail = b && type !== "clear" ? (b.min >= 95 ? "fully blocked" : `~${Math.round((b.min + b.max) / 2)}% blocked`) : STATUS_WORD[status];
  return `${TYPE_WORD[type] ?? "Road issue"} · ${detail}`;
}

export default function ReportDone() {
  const mapRef = useRef<MapRef>(null);
  const { events, refresh } = useEvents(mapRef);
  const [result, setResult] = useState<Result | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [total, setTotal] = useState<{ points: number; verified: number } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ data?: { exists: boolean; points: number; verified: number } | null }>)
      .then((b) => b.data?.exists && setTotal({ points: b.data.points, verified: b.data.verified }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_REPORT_KEY);
      const body = raw ? (JSON.parse(raw) as { data?: Result; degraded?: string }) : null;
      if (body?.data?.lat === undefined) return setMissing(true);
      setResult(body.data);
      // Only the parts a traveller can act on; provider details stay in the logs.
      if (body.degraded) setDegraded(friendly(body.degraded));
    } catch {
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-land px-8 text-center">
        <p className="text-[17px] font-semibold">No recent report on this device</p>
        <Link href="/report" className="flex h-[52px] items-center rounded-[14px] bg-accent px-6 text-[17px] font-semibold text-white no-underline">
          Report a road
        </Link>
      </main>
    );
  }
  if (!result) return <main className="fixed inset-0 bg-land" />;

  const road = result.road?.ref ?? result.road?.name;
  const accepted = result.reportStatus === "accepted";
  const rejected = result.reportStatus === "rejected";
  const others = Math.max(0, result.eventReports - 1);
  const hindi = result.transcript && /[ऀ-ॿ]/.test(result.transcript);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        mapRef={mapRef}
        events={events}
        onViewChange={refresh}
        // Shift the centre down so the ring sits in the visible map above the sheet.
        initialView={{ latitude: result.lat - 0.035, longitude: result.lng, zoom: 11 }}
      >
        <Marker latitude={result.lat} longitude={result.lng} anchor="center" style={{ zIndex: 0 }}>
          <span aria-label="Your report" className="block size-12 rounded-full border-2 border-[rgba(0,113,227,0.5)] bg-[rgba(0,113,227,0.18)]" />
        </Marker>
      </MapView>

      {degraded && (
        <div className="absolute inset-x-[14px] top-[54px] z-20">
          <Toast message={degraded} onClose={() => setDegraded(null)} />
        </div>
      )}

      <section
        aria-label="Report sent"
        className="glass absolute inset-x-0 bottom-0 top-[392px] z-10 mx-auto flex max-w-[480px] flex-col gap-[14px] overflow-y-auto rounded-t-[30px] px-[18px] pb-7 pt-2"
      >
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />

        <div className="flex items-center gap-[14px]">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-full text-white ${
              accepted ? "bg-accent" : rejected ? "bg-unknown" : "bg-slow"
            }`}
          >
            {accepted ? <Check size={24} strokeWidth={2.8} aria-hidden /> : rejected ? <X size={24} strokeWidth={2.8} aria-hidden /> : <Clock size={22} strokeWidth={2.6} aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[20px] font-bold">
              {accepted ? "Thanks, report added" : rejected ? "We couldn't verify this photo" : "Thanks, saved for review"}
            </span>
            <span className="text-[14px] text-ink-2">
              {accepted
                ? `Now on the map for travellers${road ? ` on ${road}` : ""}`
                : rejected
                  ? "It doesn't look like a road condition — try another angle"
                  : "We'll add it once another report or the AI confirms it"}
            </span>
          </span>
        </div>

        <div className="glass-card px-[14px] py-1">
          <Row label="AI found" value={aiFound(result)} />
          {result.modelsAgreed >= 2 && result.verdict && (
            <Row label="Checked by" value={`2 AI models agree · ${Math.round(result.verdict.confidence * 100)}%`} />
          )}
          <Row
            label="Matched with"
            value={result.eventAction === "none" ? "—" : others > 0 ? `${others} other report${others > 1 ? "s" : ""}` : "First report here"}
            last={!result.transcript}
          />
          {result.transcript && (
            <div className="flex flex-col gap-[3px] pb-3 pt-[10px]">
              <span className="text-[14px] text-ink-2">Your note{hindi ? " (transcribed from Hindi)" : ""}</span>
              <span className="line-clamp-3 text-[14px] italic" lang={hindi ? "hi" : undefined}>
                “{result.transcript}”
              </span>
            </div>
          )}
        </div>

        {result.points > 0 && (
          <div className="flex items-center gap-[10px] rounded-[14px] bg-white/84 px-[14px] py-3">
            <span className="rounded-[9px] bg-accent-tint px-[9px] py-[5px] text-[14px] font-bold text-accent-tint-ink">+{result.points}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px]">
                Scout points{result.eventAction === "created" ? " · first to report" : ""}
                {result.scoutBonus ? ` · +${result.scoutBonus} for answering a scout request` : ""}
              </span>
              {total && (
                <span className="text-[12px] text-ink-2">
                  {total.points} points · {total.verified} verified
                </span>
              )}
            </span>
            <Link href="/me" className="shrink-0 text-[14px] font-semibold text-link no-underline">
              Me
            </Link>
          </div>
        )}

        <Link
          href="/"
          className="mt-auto flex h-[52px] shrink-0 items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white no-underline"
        >
          Done
        </Link>
      </section>
    </main>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex h-[42px] items-center justify-between gap-3 ${last ? "" : "border-b-[0.5px] border-[rgba(60,60,67,0.18)]"}`}>
      <span className="shrink-0 text-[14px] text-ink-2">{label}</span>
      <span className="truncate text-[14px] font-semibold">{value}</span>
    </div>
  );
}

function friendly(degraded: string): string | null {
  if (/privacy check/.test(degraded)) return "Photo kept private until faces and plates can be blurred";
  if (/transcript unavailable/.test(degraded)) return "Voice note saved, transcript unavailable right now";
  if (/AI report unavailable/.test(degraded)) return "AI is busy — your report is saved for review";
  if (/measurement unavailable/.test(degraded)) return "AI measurement unavailable right now";
  return null; // provider fallbacks the traveller doesn't need to know about
}
