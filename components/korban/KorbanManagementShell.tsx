"use client";

import type { ReactNode } from "react";

type KorbanManagementShellProps = {
  header: ReactNode;
  summary?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanManagementShell({
  header,
  summary,
  banner,
  children,
  bodyClassName = "",
}: KorbanManagementShellProps) {
  return (
    <main className="flex min-h-screen flex-col bg-korban-base text-white">
      {header}
      {summary && (
        <section className="shrink-0 border-b border-orange-500/10 bg-black/80 px-4 py-3">
          {summary}
        </section>
      )}
      {banner}
      <section className={mergeClass("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
        {children}
      </section>
    </main>
  );
}

type KorbanSummaryStripProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function KorbanSummaryStrip({
  children,
  className = "",
  title = "Project Metrics",
}: KorbanSummaryStripProps) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">
        {title}
      </p>
      <div
        className={mergeClass(
          "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

type KorbanDemoPanelProps = {
  children: ReactNode;
  className?: string;
};

export function KorbanDemoPanel({ children, className = "" }: KorbanDemoPanelProps) {
  return (
    <div className={mergeClass("opacity-75 [&_.korban-panel-title]:text-zinc-500", className)}>
      {children}
    </div>
  );
}
