"use client";

// Frame 11 Share alert card (docs/design/frames/11 Share alert card.png): dimmed map, the alert card
// (status header, Muse Image illustration, EN + HI text set by code), share targets in a glass panel.
import { Download, Link as LinkIcon, MessageCircle, MessageSquare, MoreHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Toast from "@/components/glass/Toast";
import type { AlertCard } from "@/lib/share/types";
import { drawCard } from "./drawCard";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const HEAD: Record<AlertCard["status"], string> = { closed: "#B3261E", one_lane: "#C25E00", slow: "#C25E00", open: "#1E7B45", unknown: "#6E6E73" };
const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const at = (iso: string) => TIME.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);

export default function ShareScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [card, setCard] = useState<AlertCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${eventId}`, { method: "POST" })
      .then((r) => r.json() as Promise<{ data?: AlertCard | null; degraded?: string; error?: string }>)
      .then((b) => {
        if (b.data) setCard(b.data);
        else setFailed(true);
        if (b.degraded || b.error) setToast(b.degraded ?? b.error ?? null);
      })
      .catch(() => {
        setFailed(true);
        setToast("Couldn't reach the server — try again");
      });
  }, [eventId]);

  const close = () => (window.history.length > 1 ? router.back() : router.push(`/event/${eventId}`));
  const text = card ? [card.title, card.titleHi, card.detail, `Verify with official sources · ${card.url}`].filter(Boolean).join("\n") : "";

  async function png(): Promise<File | null> {
    if (!card) return null;
    try {
      return new File([await drawCard(card, at(card.updatedAt))], "pathfinder-alert.png", { type: "image/png" });
    } catch {
      setToast("Couldn't make the image — share the link instead");
      return null;
    }
  }
  async function save() {
    const f = await png();
    if (!f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function more() {
    const f = await png();
    try {
      if (f && navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text });
      else if (navigator.share) await navigator.share({ title: card?.title, text });
      else await copy();
    } catch {
      /* share sheet dismissed */
    }
  }
  async function copy() {
    if (!card) return;
    await navigator.clipboard.writeText(card.url).then(
      () => setToast("Link copied"),
      () => setToast(card.url),
    );
  }

  const targets = [
    { label: "WhatsApp", Icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(text)}` },
    { label: "Messages", Icon: MessageSquare, href: `sms:?&body=${encodeURIComponent(text)}` },
    { label: "Copy link", Icon: LinkIcon, onClick: copy },
    { label: "Save image", Icon: Download, onClick: save },
    { label: "More", Icon: MoreHorizontal, onClick: more },
  ];

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-black/35" />
      {toast && (
        <div className="absolute inset-x-[14px] top-[96px] z-30">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[480px] flex-col gap-4 px-[30px] pt-[50px]">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-white">
            {card ? (card.artBy === "muse-image" ? "Alert card · illustration by Muse Image" : "Alert card · illustration drawn by Pathfinder") : "Making the alert card…"}
          </span>
          <button type="button" aria-label="Close" onClick={close} className="glass-float flex size-[44px] items-center justify-center rounded-full text-ink">
            <X size={18} strokeWidth={2.6} aria-hidden />
          </button>
        </div>

        {card ? (
          <article aria-label="Alert card" className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
            <div className="px-4 py-[10px] text-[13px] font-bold tracking-[0.6px] text-white" style={{ background: HEAD[card.status] }}>
              PATHFINDER ROAD ALERT
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
            <img src={card.artUrl} alt="" className="aspect-[2/1] w-full object-cover" />
            <div className="flex flex-col gap-1 px-4 pb-4 pt-3">
              <h1 className="m-0 text-[20px] font-bold leading-tight tracking-[-0.2px]">{card.title}</h1>
              {card.titleHi && (
                <p lang="hi" className="m-0 line-clamp-2 text-[15px] font-semibold text-ink-2">
                  {card.titleHi}
                </p>
              )}
              {card.detail && <p className="m-0 text-[14px] text-ink-2">{card.detail}</p>}
              <p className="m-0 mt-1 text-[12px] text-ink-3">Updated {at(card.updatedAt)} · verify with official sources</p>
            </div>
          </article>
        ) : (
          <div className="flex aspect-[4/3.6] items-center justify-center rounded-[22px] bg-white/80 text-[14px] text-ink-2" aria-busy={!failed}>
            {failed ? "Alert card unavailable right now" : <span className="h-full w-full animate-pulse rounded-[22px] bg-white/60" />}
          </div>
        )}
      </div>

      <nav aria-label="Share" className="glass absolute inset-x-[14px] bottom-[30px] z-10 mx-auto flex max-w-[452px] justify-between rounded-[26px] px-3 py-4">
        {targets.map(({ label, Icon, href, onClick }) => {
          const inner = (
            <>
              <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-white text-accent">
                <Icon size={20} aria-hidden />
              </span>
              <span className="text-[12px] text-ink">{label}</span>
            </>
          );
          const cls = "flex w-[64px] flex-col items-center gap-1.5 text-ink no-underline disabled:opacity-50";
          return href ? (
            <a key={label} href={card ? href : undefined} aria-disabled={!card} target="_blank" rel="noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <button key={label} type="button" onClick={onClick} disabled={!card} className={cls}>
              {inner}
            </button>
          );
        })}
      </nav>
    </main>
  );
}
