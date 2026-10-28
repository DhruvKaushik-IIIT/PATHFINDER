// Small glass toast (CLAUDE.md 5.7 rule 3): degraded AI or a recoverable error, never an error screen.
export default function Toast({ message, dark = false, onClose }: { message: string; dark?: boolean; onClose?: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${dark ? "glass-dark" : "glass text-ink"} mx-auto flex max-w-[420px] items-center gap-3 rounded-[16px] px-4 py-3 text-[14px]`}
    >
      <span className="flex-1">{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="-my-2 h-11 shrink-0 px-1 text-[14px] font-semibold opacity-80">
          OK
        </button>
      )}
    </div>
  );
}
