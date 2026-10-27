"use client";

// Bottom sheet with grabber and 3 detents (peek / half / full), drag + snap (CLAUDE.md 7.4).
// Plain pointer events — no animation library. Spring-like easing; instant under reduced motion.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Detent = "peek" | "half" | "full";

const PEEK_PX = 118; // grabber + search bar
const FULL_TOP_GAP = 96; // detail sheets leave ≥ 96 px of map visible (7.7)

function heights(vh: number, halfPx: number): Record<Detent, number> {
  return { peek: PEEK_PX, half: Math.min(halfPx, vh - FULL_TOP_GAP), full: vh - FULL_TOP_GAP };
}

export default function Sheet({
  children,
  initial = "half",
  halfPx = 374,
  label = "Details",
  onDetentChange,
}: {
  children: ReactNode;
  initial?: Detent;
  /** Height of the "half" detent; frame 02 uses 374 px on an 844 px screen. */
  halfPx?: number;
  label?: string;
  onDetentChange?: (d: Detent) => void;
}) {
  const [vh, setVh] = useState(844);
  const [detent, setDetent] = useState<Detent>(initial);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const h = heights(vh, halfPx);
  const height = dragH ?? h[detent];

  const snapTo = useCallback(
    (d: Detent) => {
      setDetent(d);
      onDetentChange?.(d);
    },
    [onDetentChange],
  );

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (d.lastY - e.clientY) / dt; // px/ms, positive = upward
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const next = d.startH + (d.startY - e.clientY);
    setDragH(Math.max(h.peek - 40, Math.min(h.full + 20, next)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || dragH === null) {
      setDragH(null);
      return;
    }
    // Project the release with velocity, then snap to the nearest detent.
    const projected = dragH + d.v * 180;
    const order: Detent[] = ["peek", "half", "full"];
    const best = order.reduce((a, b) => (Math.abs(h[b] - projected) < Math.abs(h[a] - projected) ? b : a));
    setDragH(null);
    snapTo(best);
  }
  function onGrabberKey(e: React.KeyboardEvent) {
    const order: Detent[] = ["peek", "half", "full"];
    const i = order.indexOf(detent);
    if (e.key === "ArrowUp" && i < 2) snapTo(order[i + 1]!);
    else if (e.key === "ArrowDown" && i > 0) snapTo(order[i - 1]!);
    else if (e.key === "Enter" || e.key === " ") snapTo(detent === "full" ? "half" : "full");
    else return;
    e.preventDefault();
  }

  return (
    <section
      aria-label={label}
      className="glass fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] flex-col rounded-t-[30px] motion-safe:transition-[height] motion-safe:duration-[420ms]"
      style={{
        height,
        transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
        transitionDuration: dragH !== null ? "0ms" : undefined,
        touchAction: "none",
      }}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          aria-label={`Resize sheet (now ${detent}). Arrow keys to change.`}
          onKeyDown={onGrabberKey}
          className="flex h-5 w-16 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="h-[5px] w-[38px] rounded-[3px] bg-[rgba(60,60,67,0.3)]" />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 px-[18px] pb-6"
        style={{ overflowY: detent === "full" && dragH === null ? "auto" : "hidden", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </section>
  );
}
