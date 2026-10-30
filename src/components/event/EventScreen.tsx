"use client";

// Frame 05 Disruption detail (docs/design/glass-html/Disruption.dc.html): tall sheet over the map.
// Big numbers first (stat tiles), evidence below (photo, sources, timeline). Every number is "~".
import { CarFront, Check, CircleHelp, Clock, Image as ImageIcon, Newspaper, ScanSearch, Share2, ShieldCheck, TrendingUp, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { approxRange, clearWindow } from "@/lib/events/format";
import { ago, STATUS_STYLE, type EventDetail, type InvestigationSummary } from "@/lib/events/types";
import { eventTitle } from "@/components/route/routeData";
import CrewCard from "@/components/repairs/CrewCard";
import ModelChecks from "@/components/verification/ModelChecks";
import SheetMessage from "@/components/glass/SheetMessage";
import type { Repair } from "@/lib/repairs/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const t = (iso: string) => TIME.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

export default function EventScreen({ id }: { id: string }) {
  const router = useRouter();
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repair, setRepair] = useState<Repair | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((b: { data?: EventDetail | null; error?: string; degraded?: string }) => {
        if (!alive) return;
        if (b.data) setEv(b.data);
        else setError(b.error ?? b.degraded ?? "Event not found");
      })
      .catch(() => alive && setError("Couldn't load this event"));
    // Crew progress card (frame 05): official field updates / assigned crew, if any.
    fetch(`/api/repairs?ids=${id}`)
      .then((r) => r.json() as Promise<{ data?: Repair[] }>)
      .then((b) => alive && setRepair(b.data?.[0] ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const close = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const st = ev ? (STATUS_STYLE[ev.status] ?? STATUS_STYLE.unknown) : null;
  const m = ev?.measurements ?? {};
  const total = typeof m.roadTotalWidthM === "number" ? m.roadTotalWidthM : m.roadTotalWidthM ? (m.roadTotalWidthM.min + m.roadTotalWidthM.max) / 2 : null;
  // Newest official progress photo first (the road has changed since); else the best annotated one.
  const photo = (ev?.photos[0]?.source === "official" ? ev.photos[0] : undefined) ?? ev?.photos.find((p) => p.annotatedUrl) ?? ev?.photos[0];
  const src = ev?.sources;
  const newsOnly = Boolean(src && !src.reports && !src.official && src.news);
  const sourceText = src
    ? [
        src.reports && `${src.reports} report${src.reports > 1 ? "s" : ""}`,
        src.official && `${src.official} official update${src.official > 1 ? "s" : ""}`,
        src.news && `${src.news} news item${src.news > 1 ? "s" : ""}`,
        ev?.modelsAgreed && ev.modelsAgreed >= 2 ? "2 AI models agree" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView
        events={ev ? [ev] : []}
        selectedEventId={ev?.id ?? null}
        // The sheet leaves ~110 px of map at the top: centre ~0.2° south so the pin sits in that strip.
        initialView={ev ? { latitude: ev.lat - 0.2, longitude: ev.lng, zoom: 10 } : undefined}
        showRoadLayer={false}
        key={ev ? "ready" : "loading"}
      />

      <section
        aria-label="Disruption detail"
        className="glass absolute inset-x-0 bottom-0 top-[112px] z-10 mx-auto flex max-w-[480px] flex-col gap-[14px] overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2"
      >
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />

        {error && (
          <SheetMessage
            title={/not found/i.test(error) ? "This road report has cleared or doesn't exist" : "Couldn't load this report"}
            body={/not found/i.test(error) ? "It may have been resolved since the link was shared. The map shows what's open right now." : "Check your connection and try again."}
          />
        )}
        {!ev && !error && (
          <div className="flex flex-col gap-3" aria-busy>
            <span className="h-7 w-52 animate-pulse rounded-lg bg-black/10" />
            <span className="h-[168px] animate-pulse rounded-[18px] bg-black/10" />
          </div>
        )}

        {ev && st && (
          <>
            <div className="flex items-start justify-between gap-[10px]">
              <div className="flex min-w-0 flex-col gap-[3px]">
                <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">{eventTitle(ev.type, ev.placeName)}</h1>
                <span className="text-[14px] text-ink-2">
                  {[ev.roadRef, `since ${t(ev.startedAt)}`, `updated ${ago(ev.lastConfirmedAt)}`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-ink-2">
                <X size={16} strokeWidth={2.6} aria-hidden />
              </button>
            </div>

            {/* evidence photo (AI-annotated, faces/plates blurred) */}
            {photo ? (
              <Link href={`/event/${ev.id}/photos`} className="relative block h-[168px] shrink-0 overflow-hidden rounded-[18px] bg-[#3D4245]">
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
                <img src={photo.annotatedUrl ?? photo.publicUrl ?? ""} alt={`${photo.annotatedUrl ? "AI-annotated photo" : photo.source === "official" ? "Official progress photo" : "Photo"}: ${ev.summary ?? ""}`} className="size-full object-cover" />
                <span className="absolute left-[10px] top-[10px] rounded-[8px] bg-black/50 px-[9px] py-[5px] text-[12px] font-bold text-white backdrop-blur-[10px]">
                  {st.word === "One lane" ? "One lane open" : st.word}
                </span>
                <span className="absolute bottom-[10px] right-[10px] flex items-center gap-1.5 rounded-full bg-white/85 px-[10px] py-[5px] text-[13px] font-semibold text-ink">
                  <ImageIcon size={14} aria-hidden /> See {ev.photos.length} photo{ev.photos.length > 1 ? "s" : ""}
                </span>
              </Link>
            ) : (
              <div className="flex h-[88px] shrink-0 items-center justify-center rounded-[18px] bg-white/60 px-6 text-center text-[13px] text-ink-2">
                No photos yet — reported by {sourceText || "travellers"}
              </div>
            )}

            {/* big numbers */}
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Blocked stretch" value={approxRange(m.blockedLengthM, "m")} />
              <Tile
                label="Road left"
                value={m.roadWidthLeftM && m.roadWidthLeftM.max < 0.5 ? "None" : approxRange(m.roadWidthLeftM, "m")}
                suffix={total && m.roadWidthLeftM ? `of ~${Math.round(total)}` : undefined}
              />
              {/* Reported/official window first; else the predictor's estimate (marked "est."). */}
              <Tile
                label="Clears around"
                value={clearWindow(ev.etaClear) ?? clearWindow(ev.reopening?.fullyOpen ?? null) ?? "Unknown"}
                suffix={!ev.etaClear && ev.reopening?.fullyOpen ? "est." : undefined}
              />
              {m.debrisVolumeM3 ? <Tile label="Debris" value={approxRange(m.debrisVolumeM3, "m³")} /> : <Tile label="Last confirmed" value={ago(ev.lastConfirmedAt)} />}
            </div>

            {/* passability: word + colour */}
            <div className="flex gap-2" role="list" aria-label="Who can pass">
              {(
                [
                  ["Bikes", ev.passable.bike],
                  ["Cars", ev.passable.car],
                  ["Buses", ev.passable.bus],
                ] as const
              ).map(([label, ok]) => (
                <span
                  key={label}
                  role="listitem"
                  className="flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-semibold"
                  style={
                    ok === true
                      ? { background: "rgba(52,199,89,0.16)", color: "#1A6B35" }
                      : ok === false
                        ? { background: "rgba(255,59,48,0.14)", color: "#A1251C" }
                        : { background: "rgba(142,142,147,0.16)", color: "#48484A" }
                  }
                >
                  {ok === true ? <Check size={15} strokeWidth={3} aria-hidden /> : ok === false ? <X size={15} strokeWidth={3} aria-hidden /> : <CircleHelp size={15} aria-hidden />}
                  {label}
                  <span className="sr-only">{ok === true ? "can pass" : ok === false ? "cannot pass" : "unknown"}</span>
                </span>
              ))}
            </div>

            {/* Phase 6C: vehicle-fit check (closed = "for when it reopens to one lane") */}
            {["one_lane", "slow", "closed"].includes(ev.status) && !["traffic", "accident", "closure_notice"].includes(ev.type) && (
              <Link
                href={`/event/${ev.id}/fit`}
                className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink no-underline"
              >
                <CarFront size={17} aria-hidden /> Check if my vehicle can cross
              </Link>
            )}

            {/* what's happening, in English + Hindi */}
            {ev.summary && (
              <div className="glass-card flex flex-col gap-1 px-[14px] py-3">
                <span className="text-[14px]">{ev.summary}</span>
                {ev.summaryHi && (
                  <span lang="hi" className="text-[14px] text-ink-2">
                    {ev.summaryHi}
                  </span>
                )}
              </div>
            )}

            {ev.reopening && ev.reopening.method !== "none" && <Predictor r={ev.reopening} />}
            {repair && <CrewCard r={repair} link={false} />}

            <div className="glass-card flex items-start gap-[10px] px-[14px] py-3">
              {newsOnly ? (
                <Newspaper size={20} className="mt-px shrink-0 text-slow" aria-hidden />
              ) : (
                <ShieldCheck size={20} className="mt-px shrink-0 text-open" aria-hidden />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                  {newsOnly ? "From news reports · not yet confirmed" : "Verified"} · {Math.round(ev.confidence * 100)}% confidence
                </span>
                {sourceText && <span className="text-[12px] text-ink-2">{sourceText}</span>}
                {ev.verification?.latest && <ModelChecks v={ev.verification} />}
              </span>
            </div>

            {(ev.investigation || ev.checkReason) && (
              <AiCheck
                eventId={ev.id}
                note={ev.investigation}
                reason={ev.checkReason}
                onDone={(n) => setEv((e) => (e ? { ...e, investigation: n, confidence: n.confidenceAfter } : e))}
              />
            )}

            {/* AI checks have their own card above. */}
            {ev.timeline.some((i) => i.kind !== "ai") && (
              <div className="glass-card flex flex-col px-[14px] py-1">
                {ev.timeline.filter((i) => i.kind !== "ai").slice(0, 4).map((item, i, arr) => (
                  <div key={`${item.at}-${i}`} className={`flex gap-[10px] py-[10px] ${i < arr.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                    <Clock size={14} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[14px]">{item.text}</span>
                      <span className="text-[12px] text-ink-3">
                        {item.actor ?? item.kind} · {ago(item.at)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Link
              href={`/share/${ev.id}`}
              className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline"
            >
              <Share2 size={18} aria-hidden /> Share alert card
            </Link>
            <p className="mt-auto text-center text-[12px] text-ink-2">Estimates from photos and reports · verify with official sources</p>
          </>
        )}
      </section>
    </main>
  );
}

function Tile({ label, value, suffix }: { label: string; value: string | null; suffix?: string }) {
  return (
    <div className="flex flex-col gap-px rounded-[14px] bg-white/82 p-3">
      <span className="text-[12px] text-ink-2">{label}</span>
      <span className="text-[20px] font-bold">
        {value ?? "Unknown"}
        {suffix && <span className="ml-1 text-[13px] font-medium text-ink-2">{suffix}</span>}
      </span>
    </div>
  );
}

/** Reopening predictor (plain code): from the photo trend, else debris volume ÷ machine rate. */
function Predictor({ r }: { r: NonNullable<EventDetail["reopening"]> }) {
  const one = clearWindow(r.oneLane);
  const full = clearWindow(r.fullyOpen);
  const line = [one && `one lane ~${one}`, full && `fully open ~${full}`].filter(Boolean).join(" · ");
  return (
    <div className="glass-card flex items-start gap-[10px] px-[14px] py-3">
      <TrendingUp size={20} className={`mt-px shrink-0 ${r.stalled ? "text-slow" : "text-accent"}`} aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">
          {line ? `Reopening predictor: ${line}` : r.stalled ? "Reopening predictor: no progress visible yet" : "Reopening predictor: waiting for a crew"}
        </span>
        <span className="text-[12px] text-ink-2">
          {r.method === "photo_trend" ? "From the photo sequence" : "From debris volume"} · {r.basis} · estimate
        </span>
      </span>
    </div>
  );
}

const FINDING: Record<InvestigationSummary["finding"], { word: string; tone: "ok" | "warn" | "muted" }> = {
  still_there: { word: "Still there", tone: "ok" },
  likely_changed: { word: "May have changed", tone: "warn" },
  likely_cleared: { word: "May have cleared", tone: "warn" },
  conflicting: { word: "Sources disagree", tone: "warn" },
  no_new_evidence: { word: "No new evidence", tone: "muted" },
  unavailable: { word: "Unavailable", tone: "muted" },
};
const BY: Record<string, string> = { baseten: "Muse Spark Open", meta: "Muse Spark", code: "rules", mock: "mock" };

/** Investigator (Phase 5): last AI check of a doubtful event + "Check again". */
function AiCheck({ eventId, note, reason, onDone }: { eventId: string; note: InvestigationSummary | null; reason: string | null; onDone: (n: InvestigationSummary) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/events/${eventId}/investigate`, { method: "POST" });
      const b = (await r.json()) as { data?: { note: InvestigationSummary | null; ran: boolean; skipped?: string } | null; degraded?: string };
      if (b.data?.note) onDone(b.data.note);
      if (b.data && !b.data.ran && b.data.skipped) setMsg(`Not re-checked: ${b.data.skipped}.`);
      else if (!b.data?.note) setMsg(b.degraded ?? "AI check unavailable right now.");
    } catch {
      setMsg("AI check unavailable right now.");
    } finally {
      setBusy(false);
    }
  };
  const f = note ? FINDING[note.finding] : null;
  return (
    <div className="glass-card flex flex-col gap-2 px-[14px] py-3">
      <div className="flex items-start gap-[10px]">
        <ScanSearch size={20} className={`mt-px shrink-0 ${f?.tone === "warn" ? "text-slow" : f?.tone === "ok" ? "text-open" : "text-ink-3"}`} aria-hidden />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {note && f ? `AI check: ${f.word}` : "Needs a fresh look"}
            {note && <span className="font-normal text-ink-2"> · {ago(note.at)}</span>}
          </span>
          {note ? (
            <>
              <span className="text-[14px]">{note.explanation}</span>
              {note.explanationHi && (
                <span lang="hi" className="text-[13px] text-ink-2">
                  {note.explanationHi}
                </span>
              )}
              {note.evidence.length > 0 && (
                <details className="text-[12px] text-ink-2">
                  <summary className="cursor-pointer py-1 font-semibold text-link">Evidence ({note.evidence.length})</summary>
                  <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4">
                    {note.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
              <span className="text-[12px] text-ink-2">
                Investigator agent · {BY[note.by] ?? note.by}
                {note.scoutRequested ? " · asked nearby scouts for a fresh photo" : ""} · it never changes the status itself
              </span>
            </>
          ) : (
            <span className="text-[13px] text-ink-2">{reason ? `${reason[0]!.toUpperCase()}${reason.slice(1)}.` : null}</span>
          )}
        </span>
      </div>
      {reason && (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          aria-busy={busy}
          className="flex min-h-[44px] items-center justify-center rounded-[14px] bg-accent-tint px-4 text-[15px] font-semibold text-accent-tint-ink disabled:opacity-60"
        >
          {busy ? "Checking reports, updates and news…" : note ? "Check again" : "Check with AI"}
        </button>
      )}
      {msg && <span className="text-[12px] text-ink-2" role="status">{msg}</span>}
    </div>
  );
}
