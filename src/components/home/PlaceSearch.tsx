"use client";

// "Where to?" search (frame 02): our HP places + Photon via GET /api/places, debounced 300 ms.
import { MapPin, Mic, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/geo/placeTypes";

export default function PlaceSearch({ onPick, onFocusChange }: { onPick: (p: Place) => void; onFocusChange?: (active: boolean) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    onFocusChange?.(term.length > 0);
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const body = (await (await fetch(`/api/places?q=${encodeURIComponent(term)}`)).json()) as { data?: Place[]; degraded?: string };
        if (mine !== seq.current) return; // a newer keystroke won
        setResults(body.data ?? []);
        setFailed(Boolean(body.degraded));
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, onFocusChange]);

  const term = q.trim();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-12 items-center gap-[10px] rounded-[14px] bg-[rgba(118,118,128,0.14)] px-[14px]">
        <Search size={18} strokeWidth={2.2} className="shrink-0 text-[#3C3C43]" aria-hidden />
        <span className="sr-only">Where to?</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Where to?"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              onPick(results[0]);
              setQ("");
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="-mr-2 flex size-11 items-center justify-center text-ink-3">
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          // TODO(phase-3): voice search
          <span className="flex size-8 items-center justify-center text-[#3C3C43]" aria-hidden>
            <Mic size={18} strokeWidth={2} />
          </span>
        )}
      </label>

      {term.length >= 2 && (
        <ul className="glass-card flex flex-col py-1" aria-label="Search results" aria-busy={loading}>
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQ("");
                }}
                className="flex min-h-[52px] w-full items-center gap-3 px-[14px] py-2 text-left"
              >
                <MapPin size={18} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  <span className="truncate text-[13px] text-ink-2">{p.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && (
            <li className="px-[14px] py-3 text-[14px] text-ink-2">{failed ? "Search is unavailable right now" : `No places found for “${term}”`}</li>
          )}
          {loading && results.length === 0 && <li className="px-[14px] py-3 text-[14px] text-ink-3">Searching…</li>}
        </ul>
      )}
    </div>
  );
}
