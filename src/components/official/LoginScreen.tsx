"use client";

// Frame 13 Official sign-in: blurred map + glass card (same recipe as Welcome.dc.html). Invite-only, no
// sign-up. Two clean doors (Nov 1):
//   1. "PWD / district office" → pick one of Himachal's 12 districts → Department ID + password → Command Centre
//   2. "On-site crew member"   → Crew ID + password → My job
// The server checks the account matches the door and the district (api/official/login).
import { Building2, ChevronLeft, ChevronRight, HardHat, MapPin, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HP_DISTRICTS } from "@/lib/official/hpDistricts";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const field =
  "h-[50px] w-full rounded-[12px] border-[0.5px] border-[rgba(60,60,67,0.18)] bg-white/90 px-[14px] text-[17px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

type Door = "office" | "crew";
type Step = { at: "choose" } | { at: "district" } | { at: "form"; door: Door; district?: string };

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ at: "choose" });
  const [deptId, setDeptId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }
  function back() {
    if (step.at === "form") go(step.door === "office" ? { at: "district" } : { at: "choose" });
    else if (step.at === "district") go({ at: "choose" });
    else router.push("/");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.at !== "form") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/official/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId, password, as: step.door, ...(step.district && { district: step.district }) }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; data?: { role?: string } };
      if (j.ok) {
        router.replace(j.data?.role === "crew" ? "/crew" : "/official");
        return;
      }
      setError(j.error ?? "Sign-in failed.");
    } catch {
      setError("Couldn't reach the server — try again.");
    }
    setBusy(false);
  }

  const title = step.at === "form" ? (step.door === "office" ? `PWD ${step.district} office` : "On-site crew") : step.at === "district" ? "Choose your district" : "Command Centre";
  const subtitle =
    step.at === "form"
      ? step.door === "office"
        ? "Sign in with your Department ID."
        : "Sign in with your Crew ID to see your job."
      : step.at === "district"
        ? "PWD / district office"
        : "For PWD, BRO, district administration and road crews.";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />
      <div className="pointer-events-none absolute inset-0 bg-white/25 backdrop-blur-[6px]" />

      <button
        type="button"
        onClick={back}
        aria-label={step.at === "choose" ? "Back to the map" : "Back"}
        className="glass-float absolute left-[14px] top-[54px] z-10 flex size-[46px] items-center justify-center rounded-full text-ink"
      >
        <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
      </button>

      <div className="glass absolute inset-x-[14px] bottom-[28px] z-10 mx-auto flex max-h-[calc(100%-120px)] max-w-[452px] flex-col gap-[18px] overflow-y-auto rounded-[32px] px-[22px] pb-[22px] pt-[30px] shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col items-center gap-[10px] text-center">
          <span className="flex size-16 items-center justify-center rounded-[17px] bg-accent text-white">
            {step.at === "form" && step.door === "crew" ? <HardHat size={32} strokeWidth={2} aria-hidden /> : <ShieldCheck size={32} strokeWidth={2} aria-hidden />}
          </span>
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.4px]">{title}</h1>
          <p className="m-0 text-[16px] leading-[1.4] text-ink-2">{subtitle}</p>
        </div>

        {step.at === "choose" && (
          <div className="flex flex-col gap-[10px]">
            <DoorButton
              icon={<Building2 size={22} strokeWidth={2} aria-hidden />}
              title="PWD / district office"
              sub="Command Centre · priority queue, crews, advisories"
              onClick={() => go({ at: "district" })}
            />
            <DoorButton
              icon={<HardHat size={22} strokeWidth={2} aria-hidden />}
              title="On-site crew member"
              sub="My job · on duty, directions, progress updates"
              onClick={() => go({ at: "form", door: "crew" })}
            />
            <p className="m-0 pt-1 text-center text-[13px] leading-[1.4] text-ink-2">Invite only — there is no public sign-up. Ask your district admin for an account.</p>
          </div>
        )}

        {step.at === "district" && (
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" aria-label="Himachal Pradesh districts">
            {HP_DISTRICTS.map((d) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => go({ at: "form", door: "office", district: d.name })}
                  className="flex min-h-[48px] w-full items-center gap-2 rounded-[14px] bg-white/[0.86] px-3 text-left text-[15px] font-semibold text-ink"
                >
                  <MapPin size={15} strokeWidth={2.2} className="shrink-0 text-accent" aria-hidden />
                  <span className="leading-tight">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {step.at === "form" && (
          <form onSubmit={submit} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-[10px]">
              <label className="flex flex-col gap-[6px]">
                <span className="px-1 text-[13px] font-semibold text-ink-2">{step.door === "office" ? "Department ID" : "Crew ID"}</span>
                <input
                  className={field}
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={step.door === "office" ? `e.g. PWD-${(step.district ?? "MANDI").toUpperCase().replace(/[^A-Z]+/g, "-")}-01` : "e.g. CREW-MANDI-07"}
                  required
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="px-1 text-[13px] font-semibold text-ink-2">Password</span>
                <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              {error && (
                <p role="alert" className="m-0 rounded-[12px] bg-closed-bg px-[14px] py-[10px] text-[14px] leading-[1.4] text-closed-ink">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="m-0 text-center text-[13px] leading-[1.4] text-ink-2">
              {step.door === "office" ? "Accounts are issued per district by the department." : "Your supervisor or district office gives you a Crew ID."}{" "}
              <Link href="/" className="text-link no-underline">
                Not staff? Back to the map
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function DoorButton({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[68px] items-center gap-3 rounded-[16px] bg-white/[0.86] px-[14px] py-3 text-left text-ink">
      <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[12px] bg-accent-tint text-accent-tint-ink">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-semibold">{title}</span>
        <span className="text-[13px] text-ink-2">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
    </button>
  );
}
