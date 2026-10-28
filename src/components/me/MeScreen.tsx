"use client";

// Frame 12 Me & Scout (docs/design/frames/12 Me & Scout.png): tall sheet over the map. Profile, points /
// verified / first reports, badges, district leaderboard, location + Scout settings, official sign-in link.
import { Lock, Pencil, Star, Zap, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Toast from "@/components/glass/Toast";
import type { MeProfile } from "@/lib/scout/types";
import { pingOnce, useLocationPing } from "./useLocationPing";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const BADGE_ICON = { pahad_scout: Star, first_responder: Zap, road_guardian: Star } as const;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function MeScreen() {
  const router = useRouter();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json() as Promise<{ data?: MeProfile | null; degraded?: string }>)
      .then((b) => (b.data ? setMe(b.data) : setToast(b.degraded ?? "Profile unavailable right now")))
      .catch(() => setToast("Couldn't reach the server — try again"));
  }, []);
  useLocationPing(me?.settings.locationMode === "while_using");

  async function save(patch: { displayName?: string; scoutOptIn?: boolean; locationMode?: "off" | "while_using" }) {
    const prev = me;
    if (me) setMe({ ...me, ...(patch.displayName && { name: patch.displayName }), settings: { ...me.settings, ...patch } as MeProfile["settings"] });
    const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const b = res?.ok ? ((await res.json()) as { data?: MeProfile | null }) : null;
    if (b?.data) setMe(b.data);
    else {
      setMe(prev);
      setToast("Couldn't save — try again");
    }
  }

  function setScout(on: boolean) {
    // Scout requests need a (coarse) location: switching Scout on turns location on too.
    if (on && me?.settings.locationMode === "off") {
      save({ scoutOptIn: true, locationMode: "while_using" }).then(pingOnce);
    } else save({ scoutOptIn: on });
  }

  const close = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const lb = me?.leaderboard;
  const youInTop = lb?.rows.some((r) => r.you);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />
      {toast && (
        <div className="absolute inset-x-[14px] top-[54px] z-20">
          <Toast message={toast} onClose={() => setToast(null)} />
        </div>
      )}

      <section
        aria-label="Me and Scout"
        className="glass absolute inset-x-0 bottom-0 top-[96px] z-10 mx-auto flex max-w-[480px] flex-col gap-[12px] overflow-y-auto rounded-t-[30px] px-[18px] pb-6 pt-2"
      >
        <span aria-hidden className="h-[5px] w-[38px] shrink-0 self-center rounded-[3px] bg-[rgba(60,60,67,0.3)]" />

        {!me ? (
          <div className="flex flex-col gap-3" aria-busy>
            <span className="h-14 w-60 animate-pulse rounded-xl bg-black/10" />
            <span className="h-20 animate-pulse rounded-[14px] bg-black/10" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-[19px] font-bold text-accent-tint-ink">
                {initials(me.name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditing(false);
                      if (name.trim() && name.trim() !== me.name) save({ displayName: name.trim() });
                    }}
                    className="flex gap-2"
                  >
                    <label className="sr-only" htmlFor="me-name">
                      Your name on the leaderboard
                    </label>
                    <input
                      id="me-name"
                      autoFocus
                      maxLength={40}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-[12px] bg-white/90 px-3 text-[17px] font-semibold outline-none"
                    />
                    <button type="submit" className="h-11 px-2 text-[15px] font-semibold text-link">
                      Save
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setName(me.name);
                      setEditing(true);
                    }}
                    className="flex min-h-[32px] items-center gap-1.5 text-left text-[22px] font-bold tracking-[-0.3px]"
                    aria-label={`Name: ${me.name}. Edit`}
                  >
                    <span className="truncate">{me.name}</span>
                    <Pencil size={14} className="shrink-0 text-ink-3" aria-hidden />
                  </button>
                )}
                <span className="text-[14px] text-ink-2">
                  {me.title}
                  {me.district ? ` · ${me.district} district` : " · no reports yet"}
                </span>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.16)] text-ink-2">
                <X size={16} strokeWidth={2.6} aria-hidden />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat value={me.points} label="Points" />
              <Stat value={me.verified} label="Verified" />
              <Stat value={me.firstReports} label="First reports" />
            </div>

            <div className="grid grid-cols-3 gap-2" role="list" aria-label="Badges">
              {me.badges.map((b) => {
                const Icon = b.earned ? BADGE_ICON[b.id as keyof typeof BADGE_ICON] ?? Star : Lock;
                return (
                  <div
                    key={b.id}
                    role="listitem"
                    className={`flex flex-col items-center gap-1.5 rounded-[14px] px-2 py-3 text-center ${b.earned ? "bg-white/84" : "bg-white/50"}`}
                  >
                    <Icon size={18} className={b.earned ? "text-slow" : "text-ink-3"} aria-hidden />
                    <span className={`text-[12px] font-semibold ${b.earned ? "" : "text-ink-3"}`}>{b.name}</span>
                    <span className="sr-only">{b.earned ? "earned" : `locked — needs ${b.need}`}</span>
                  </div>
                );
              })}
            </div>

            {lb ? (
              <>
                <div className="mt-1 flex items-baseline justify-between">
                  <h2 className="m-0 text-[18px] font-bold">{lb.district} leaderboard</h2>
                  <span className="text-[13px] text-ink-2">All time</span>
                </div>
                <ol className="m-0 flex list-none flex-col rounded-[14px] bg-white/84 p-0">
                  {lb.rows.map((r) => (
                    <Row key={r.rank} rank={r.rank} name={r.you ? "You" : `${r.name} · ${r.badge}`} points={r.points} you={r.you} />
                  ))}
                  {!youInTop && <Row rank={lb.you.rank} name="You" points={lb.you.points} you />}
                </ol>
                {lb.includesDemo && <span className="-mt-1 text-[11px] text-ink-3">Includes demo scouts</span>}
              </>
            ) : (
              <div className="rounded-[14px] bg-white/84 px-[14px] py-3 text-[14px] text-ink-2">
                Report a road with a photo to join your district&apos;s leaderboard.
              </div>
            )}
            <span className="text-[12px] text-ink-2">+25 first to report · +10 confirmed · +5 unconfirmed · +15 scout answer · −10 confident fake</span>

            <div className="flex flex-col rounded-[14px] bg-white/84">
              <div className="flex items-center justify-between gap-2 border-b-[0.5px] border-[rgba(60,60,67,0.18)] px-[14px] py-2">
                <span className="text-[15px]" id="loc-label">
                  Location
                </span>
                <div role="radiogroup" aria-labelledby="loc-label" className="flex rounded-[10px] bg-[rgba(118,118,128,0.12)] p-[2px]">
                  {(
                    [
                      ["off", "Off"],
                      ["while_using", "While using"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={me.settings.locationMode === v}
                      onClick={() => save({ locationMode: v, ...(v === "off" && { scoutOptIn: false }) })}
                      className={`h-9 rounded-[8px] px-3 text-[14px] font-semibold ${me.settings.locationMode === v ? "bg-white shadow-sm" : "text-ink-2"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 px-[14px] py-2">
                <span className="flex flex-col">
                  <span className="text-[15px]" id="scout-label">
                    Scout requests
                  </span>
                  <span className="text-[12px] text-ink-2">Max 2 a day · never while driving · ~1 km location, no history</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={me.settings.scoutOptIn}
                  aria-labelledby="scout-label"
                  onClick={() => setScout(!me.settings.scoutOptIn)}
                  className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${me.settings.scoutOptIn ? "bg-accent" : "bg-[rgba(120,120,128,0.16)]"}`}
                >
                  <span
                    className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-[left] ${me.settings.scoutOptIn ? "left-[22px]" : "left-[2px]"}`}
                  />
                </button>
              </div>
            </div>

            <Link href="/official/login" className="flex min-h-[44px] items-center justify-center gap-1.5 text-[15px] font-semibold text-link no-underline">
              <Lock size={14} aria-hidden /> Road crew or official? Sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-px rounded-[14px] bg-white/84 p-3">
      <span className="text-[22px] font-bold">{value.toLocaleString("en-IN")}</span>
      <span className="text-[12px] text-ink-2">{label}</span>
    </div>
  );
}

function Row({ rank, name, points, you }: { rank: number; name: string; points: number; you: boolean }) {
  return (
    <li className={`flex items-center gap-2 border-b-[0.5px] border-[rgba(60,60,67,0.18)] px-[14px] py-[11px] last:border-b-0 ${you ? "bg-accent-tint" : ""}`}>
      <span className="w-5 text-[15px] font-semibold">{rank}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
      <span className="text-[15px] font-semibold">{points.toLocaleString("en-IN")}</span>
    </li>
  );
}
