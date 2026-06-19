"use client";

import type { ReactNode } from "react";

type KorbanPanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  compact?: boolean;
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
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
      </div>
      <div className={compact ? "mt-3" : "mt-4"}>{children}</div>
    </section>
  );
}
