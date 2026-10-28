"use client";

// Frame 13 Official sign-in: blurred map + glass card (same recipe as Welcome.dc.html). Invite-only —
// Department ID + password, no sign-up link. A note explains the demo account for judges.
import { ChevronLeft, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-land" />,
});

const field =
  "h-[50px] w-full rounded-[12px] border-[0.5px] border-[rgba(60,60,67,0.18)] bg-white/90 px-[14px] text-[17px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export default function LoginScreen() {
  const router = useRouter();
  const [deptId, setDeptId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/official/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId, password }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (j.ok) {
        router.replace("/official");
        return;
      }
      setError(j.error ?? "Sign-in failed.");
    } catch {
      setError("Couldn't reach the server — try again.");
    }
    setBusy(false);
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      <MapView showRoadLayer={false} />
      <div className="pointer-events-none absolute inset-0 bg-white/25 backdrop-blur-[6px]" />

      <Link
        href="/"
        aria-label="Back to the map"
        className="glass-float absolute left-[14px] top-[54px] z-10 flex size-[46px] items-center justify-center rounded-full text-ink"
      >
        <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
      </Link>

      <form
        onSubmit={submit}
        className="glass absolute inset-x-[14px] bottom-[28px] z-10 mx-auto flex max-w-[452px] flex-col gap-[18px] rounded-[32px] px-[22px] pb-[18px] pt-[30px] shadow-[0_12px_40px_rgba(0,0,0,0.16)]"
      >
        <div className="flex flex-col items-center gap-[10px] text-center">
          <span className="flex size-16 items-center justify-center rounded-[17px] bg-accent text-white">
            <ShieldCheck size={32} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.4px]">Command Centre</h1>
          <p className="m-0 text-[16px] leading-[1.4] text-ink-2">For PWD, BRO, district administration and road crews.</p>
        </div>

        <div className="flex flex-col gap-[10px]">
          <label className="flex flex-col gap-[6px]">
            <span className="px-1 text-[13px] font-semibold text-ink-2">Department ID</span>
            <input
              className={field}
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. PWD-MANDI-01"
              required
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="px-1 text-[13px] font-semibold text-ink-2">Password</span>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="m-0 rounded-[12px] bg-closed-bg px-[14px] py-[10px] text-[14px] leading-[1.4] text-closed-ink">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-[10px]">
          <button
            type="submit"
            disabled={busy}
            className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="m-0 text-center text-[13px] leading-[1.4] text-ink-2">
            Invite only — there is no public sign-up. Ask your district admin for an account.
          </p>
          <p className="m-0 rounded-[12px] bg-accent-tint px-[14px] py-[10px] text-[13px] leading-[1.45] text-accent-tint-ink">
            <strong>Demo account:</strong> Department ID <span className="whitespace-nowrap font-mono">PWD-MANDI-DEMO</span>, password{" "}
            <span className="whitespace-nowrap font-mono">himachal-demo</span>. It sees demo data for Mandi district.
          </p>
        </div>
      </form>
    </main>
  );
}
