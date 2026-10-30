// Full-screen Glass state card (Phase 6E): errors, 404 and offline-style messages over the land colour,
// same look as the sign-in card (frame 13). Server- and client-safe (no hooks).
import { Mountain } from "lucide-react";

export default function StatusCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="fixed inset-0 flex items-end justify-center bg-land px-[14px] pb-[28px]">
      <section className="glass flex w-full max-w-[452px] flex-col items-center gap-3 rounded-[32px] px-[22px] pb-[18px] pt-[30px] text-center shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
        <span className="flex size-16 items-center justify-center rounded-[17px] bg-accent text-white">
          <Mountain size={32} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="m-0 text-[26px] font-bold tracking-[-0.3px]">{title}</h1>
        <p className="m-0 text-[16px] leading-[1.45] text-ink-2">{body}</p>
        <div className="mt-2 flex w-full flex-col gap-[10px]">{children}</div>
      </section>
    </main>
  );
}
