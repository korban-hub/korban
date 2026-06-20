"use client";

import type { ReactNode } from "react";

type KorbanPanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  compact?: boolean;
  /**
   * When true, the orange status dot in the panel header pulses to
   * indicate the user is actively interacting within this tile (editing
   * a field, picking points, etc). Defaults to false — a still, dim dot.
   */
  active?: boolean;
  /**
   * Optional element rendered in the top-right of the panel header,
   * next to the status dot. Used for small inline actions like "+ Message".
   */
  headerAction?: ReactNode;
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanPanel({
  title,
  subtitle,
  children,
  className = "",
  hero = false,
  compact = false,
  active = false,
  headerAction,
}: KorbanPanelProps) {
  return (
    <section
      className={mergeClass(
        "border border-zinc-800 bg-korban-raised shadow-2xl",
        hero ? "rounded-[2rem] border-orange-500/20 p-4" : compact ? "mb-4 rounded-[1.6rem] p-4 last:mb-0" : "rounded-[1.75rem] p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className={mergeClass(
              "font-black uppercase tracking-[0.24em] text-orange-400",
              hero ? "text-sm" : "text-xs",
            )}
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          <span className="relative flex h-2 w-2">
            {active && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
          </span>
        </div>
      </div>
      <div className={compact ? "mt-3" : "mt-4"}>{children}</div>
    </section>
  );
}
