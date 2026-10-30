"use client";

// Slope site detail (Phase 6B), frame-05 layout: tall sheet over the map. Level pill + headline first,
// then the annotated photo, 4 stat tiles, reasons + advice EN/HI, the two-model check and the timeline.
// Honesty: warning signs a geologist would look for — never a failure time, never a road closure.
import { Camera, Clock, Image as ImageIcon, Mountain, RefreshCw, ShieldCheck, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SlopeLayer from "@/components/map/SlopeLayer";
import { ago } from "@/lib/events/types";
import { keptSigns } from "@/lib/slope/metrics";
import { SIGN_LABEL, SLOPE_STYLE, SLOPE_WORD, SLOPE_WORD_HI, type SlopeObservation, type SlopeSite } from "@/lib/slope/types";
import { MODEL_NAME, MODEL_WHERE } from "@/lib/verification/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const t = (iso: string) => TIME.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

interface Detail {
  site: SlopeSite;
  observations: SlopeObservation[];
  changes: string[];
}

const BY: Record<string, string> = { meta: "Muse Wonder", baseten: "Muse Spark Open", code: "code rules", mock: "mock" };

export default function SlopeScreen({ id, replay }: { id: string; replay: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hi, setHi] = useState(false);

  const load = () =>
    fetch(`/api/slopes/${id}`)
      .then((r) => r.json())
      .then((b: { data?: Detail; error?: string }) => (b.data ? setD(b.data) : setError(b.error ?? "Slope site not found")))
      .catch(() => setError("Couldn't load this slope"));
  useEffect(() => {
    load();
    try {
      setHi(localStorage.getItem("pf:lang") === "hi");
    } catch {
      // storage blocked: English
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function recheck() {
    setBusy(true);
    setMsg(null);
    try {
      const b = (await (await fetch(`/api/slopes/${id}/assess${replay ? "?replay=1" : ""}`, { method: "POST" })).json()) as { data?: { cached?: boolean; alerts?: number }; degraded?: string };
      if (b.data?.cached) setMsg("Checked in the last 15 minutes — no new photo since.");
      else if (b.degraded) setMsg(b.degraded);
      else if (b.data?.alerts) setMsg(`Travellers watching this road were alerted (${b.data.alerts}).`);
      await load();
    } catch {
      setMsg("Slope check unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const site = d?.site;
  const risk = site?.risk ?? null;
  const st = site ? SLOPE_STYLE[site.risk_level] : null;
  const valid = d?.observations.filter((o) => o.check?.verdict !== "reject") ?? [];
  const latest = valid[0];
  const photo = valid.find((o) => o.photos?.annotated_url) ?? valid[0];
  const signs = latest ? keptSigns(latest) : [];
  const twoModelChecks = valid.filter((o) => o.check?.twoModels).length;
  const rain = risk?.rain;
  const pin = site ? [{ id: site.id, lat: site.lat, lng: site.lng, place: site.place_name, road: site.road_ref, level: site.risk_level, headline: null, lastObservedAt: site.last_observed_at }] : [];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView initialView={site ? { latitude: site.lat - 0.2, longitude: site.lng, zoom: 10 } : undefined} showRoadLayer={false} key={site ? "ready" : "loading"}>
        <SlopeLayer pins={pin} />
      </MapView>

      <section aria-label="Slope detail" className="glass absolute inset-x-0 bottom-0 top-[112px] z-10 mx-auto flex max-w-[480px] flex-col gap-[14px] overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2">
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        {error && <p className="py-8 text-center text-[15px] text-ink-2">{error}</p>}
        {!d && !error && (
          <div className="flex flex-col gap-3" aria-busy>
            <span className="h-7 w-52 animate-pulse rounded-lg bg-black/10" />
            <span className="h-[168px] animate-pulse rounded-[18px] bg-black/10" />
          </div>
        )}

        {site && st && (
          <>
            <div className="flex items-start justify-between gap-[10px]">
              <div className="flex min-w-0 flex-col gap-[3px]">
                <h1 className="m-0 text-[24px] font-bold tracking-[-0.3px]">Slope{site.place_name ? ` near ${site.place_name}` : " above the road"}</h1>
                <span className="text-[14px] text-ink-2">
                  {[site.road_ref, site.last_observed_at && `last photo ${ago(site.last_observed_at)}`, site.last_assessed_at && `checked ${ago(site.last_assessed_at)}`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-ink-2">
                <X size={16} strokeWidth={2.6} aria-hidden />
              </button>
            </div>

            {/* level pill + headline */}
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <span className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold" style={{ background: st.bg, color: st.ink }}>
                  <Mountain size={14} strokeWidth={2.6} aria-hidden /> {SLOPE_WORD[site.risk_level]} slope risk
                </span>
                {risk && <span className="text-[13px] text-ink-2">~{Math.round(risk.confidence * 100)}% sure</span>}
              </span>
              <span className="text-[17px] font-semibold leading-snug">
                {risk?.reasons[0] ?? (site.risk_level === "none" ? "No warning signs in the checked photos" : "Waiting for the first risk check")}
              </span>
            </div>

            {photo?.photos && (
              <Link href={`/slope/${site.id}/photos`} className="relative block h-[168px] shrink-0 overflow-hidden rounded-[18px] bg-[#3D4245]">
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
                <img src={photo.photos.annotated_url ?? photo.photos.public_url ?? ""} alt={`AI-annotated slope photo: ${photo.reading?.summary ?? ""}`} className="size-full object-cover" />
                <span className="absolute bottom-[10px] right-[10px] flex items-center gap-1.5 rounded-full bg-white/85 px-[10px] py-[5px] text-[13px] font-semibold text-ink">
                  <ImageIcon size={14} aria-hidden /> See {valid.length} photo{valid.length > 1 ? "s" : ""}
                </span>
              </Link>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Tile label="Signs found" value={latest ? String(signs.length) : "—"} sub={signs.slice(0, 2).map((k) => SIGN_LABEL[k] ?? k).join(", ") || undefined} />
              <Tile label="Since last photo" value={d!.changes.length ? (d!.changes.some((c) => /larger|new since/.test(c)) ? "Growing" : "Changed") : valid.length > 1 ? "No clear change" : "First photo"} sub={d!.changes.find((c) => /larger|new since/.test(c)) ?? d!.changes[0]} />
              <Tile label="Rain next 24 h" value={rain ? `~${rain.mm} mm` : "Unknown"} sub={rain ? (rain.source === "replay" ? `replay of ${rain.replayDate} (demo)` : rain.level === "none" ? "dry" : `${rain.level} risk`) : undefined} />
              <Tile label="Slides here, 90 days" value={risk?.slides90d != null ? String(risk.slides90d) : "—"} sub="within 3 km" />
            </div>

            {risk && (
              <div className="flex flex-col gap-2 rounded-[16px] px-[14px] py-3" style={{ background: "rgba(123,92,214,0.12)" }}>
                <span className="flex items-center justify-between">
                  <span className="text-[13px] font-bold uppercase tracking-[0.4px] text-risk-ink">Why · what to do</span>
                  <button type="button" onClick={() => setHi((x) => !x)} className="min-h-[32px] text-[13px] font-semibold text-link" aria-pressed={hi}>
                    {hi ? "English" : "हिन्दी में पढ़ें"}
                  </button>
                </span>
                <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[14px] text-ink">
                  {risk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <span className="text-[15px] font-semibold text-risk-ink" lang={hi ? "hi" : undefined}>
                  {hi ? risk.adviceHi : risk.advice}
                </span>
                <span className="text-[12px] text-ink-2">
                  {hi ? SLOPE_WORD_HI[site.risk_level] : "Slope Sentinel"} · {BY[risk.by] ?? risk.by}
                  {risk.trace.length ? ` · ${risk.trace.length} checks` : ""}
                  {risk.capNote ? ` · ${risk.capNote}` : ""} · re-check in ~{risk.recheckInHours} h
                </span>
              </div>
            )}

            {latest?.reading && latest.check && (
              <div className="glass-card flex items-start gap-[10px] px-[14px] py-3">
                <ShieldCheck size={20} className={`mt-px shrink-0 ${latest.check.twoModels ? "text-open" : "text-ink-3"}`} aria-hidden />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] font-semibold">{latest.check.twoModels ? "Checked by 2 models" : "Checked by 1 model"}</span>
                  <span className="text-[13px] text-ink-2">
                    <b className="text-ink">1 {MODEL_NAME[latest.reading.by]}</b> · {MODEL_WHERE[latest.reading.by]} — read the photo: {latest.reading.overall} signs
                  </span>
                  <span className="text-[13px] text-ink-2">
                    <b className="text-ink">2 {MODEL_NAME[latest.check.by]}</b> · {MODEL_WHERE[latest.check.by]} — checked it on its own:{" "}
                    {latest.check.verdict === "agree" ? "agrees" : latest.check.verdict === "downgrade" ? `lowered it to ${latest.check.finalOverall}` : "rejected"} · {Math.round(latest.check.confidence * 100)}% sure
                  </span>
                  <span className="text-[12px] text-ink-3">{twoModelChecks} of {valid.length} photo{valid.length > 1 ? "s" : ""} checked by two different models</span>
                </span>
              </div>
            )}

            {site.history.length > 0 && (
              <div className="glass-card flex flex-col px-[14px] py-1">
                {[...site.history].reverse().slice(0, 5).map((item, i, arr) => (
                  <div key={`${item.at}-${i}`} className={`flex gap-[10px] py-[10px] ${i < arr.length - 1 ? "border-b-[0.5px] border-[rgba(60,60,67,0.18)]" : ""}`}>
                    <Clock size={14} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[14px]">{item.text}</span>
                      <span className="text-[12px] text-ink-3">
                        {item.actor ?? item.kind} · {t(item.at)} · {ago(item.at)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Link
              href={`/report?mode=slope&site=${site.id}&lat=${site.lat}&lng=${site.lng}`}
              className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline"
            >
              <Camera size={18} aria-hidden /> Add a newer photo
            </Link>
            <button
              type="button"
              onClick={recheck}
              disabled={busy}
              aria-busy={busy}
              className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent-tint text-[15px] font-semibold text-accent-tint-ink disabled:opacity-60"
            >
              <RefreshCw size={16} aria-hidden className={busy ? "animate-spin" : undefined} /> {busy ? "Checking photos, rain and history…" : "Check again"}
            </button>
            {msg && (
              <span className="text-center text-[12px] text-ink-2" role="status">
                {msg}
              </span>
            )}
            <p className="mt-auto text-center text-[12px] text-ink-2">
              Warning signs a geologist would look for — not a prediction. Photo comparisons are approximate. Verify with officials / PWD.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-px rounded-[14px] bg-white/82 p-3">
      <span className="text-[12px] text-ink-2">{label}</span>
      <span className="text-[20px] font-bold">{value}</span>
      {sub && <span className="line-clamp-2 text-[12px] text-ink-2">{sub}</span>}
    </div>
  );
}
