// Floating glass button over the map: circle (default) or rounded square (14 px), 46 px (CLAUDE.md 7.3/7.4).
import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function GlassButton({
  label,
  children,
  shape = "circle",
  badge = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  shape?: "circle" | "square";
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`glass-float relative flex size-[46px] items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-accent ${
        shape === "circle" ? "rounded-full" : "rounded-[14px]"
      } ${className}`}
      {...rest}
    >
      {children}
      {badge && (
        <span className="absolute right-[9px] top-2 size-[9px] rounded-full border-[1.5px] border-white bg-[#FF3B30]" />
      )}
    </button>
  );
}
