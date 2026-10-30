// In-sheet empty / error state (Phase 6E): a Glass card with a short title, one line and a way back.
import { Mountain } from "lucide-react";
import Link from "next/link";

export default function SheetMessage({ title, body, href = "/", action = "Back to the map" }: { title: string; body: string; href?: string; action?: string }) {
  return (
    <div className="glass-card flex flex-col items-center gap-2 px-[18px] py-6 text-center" role="status">
      <span className="flex size-11 items-center justify-center rounded-[13px] bg-accent-tint text-accent-tint-ink">
        <Mountain size={22} aria-hidden />
      </span>
      <span className="text-[17px] font-semibold">{title}</span>
      <span className="text-[14px] leading-[1.45] text-ink-2">{body}</span>
      <Link href={href} className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-semibold text-white no-underline">
        {action}
      </Link>
    </div>
  );
}
