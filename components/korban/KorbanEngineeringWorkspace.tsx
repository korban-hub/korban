"use client";

import type { ReactNode } from "react";

type KorbanEngineeringWorkspaceProps = {
  canvas: ReactNode;
  rail: ReactNode;
  className?: string;
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanEngineeringWorkspace({
  canvas,
  rail,
  className = "",
}: KorbanEngineeringWorkspaceProps) {
  return (
    <section
      className={mergeClass(
        "grid h-[calc(100vh-125px)] grid-cols-[minmax(0,1fr)_400px]",
        className,
      )}
    >
      <section className="relative min-h-0 overflow-hidden border-r border-orange-500/20 bg-black">
        {canvas}
      </section>
      <aside className="min-h-0 overflow-y-auto bg-[#080604] p-4">{rail}</aside>
    </section>
  );
}

type KorbanViewerFrameProps = {
  children: ReactNode;
  className?: string;
  fill?: boolean;
};

export function KorbanViewerFrame({
  children,
  className = "",
  fill = false,
}: KorbanViewerFrameProps) {
  if (fill) {
    return (
      <div
        className={mergeClass(
          "relative min-h-0 overflow-hidden rounded-[1.25rem] border border-zinc-800 bg-[#050505] shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-10">
      <div
        className={mergeClass(
          "relative h-full w-full max-w-[1220px] rounded-[2rem] border border-zinc-800 bg-[#050505] shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

type KorbanWorkspaceHudProps = {
  children: ReactNode;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center";
  className?: string;
};

const hudPositionClasses: Record<NonNullable<KorbanWorkspaceHudProps["position"]>, string> = {
  "top-left": "left-6 top-5",
  "top-right": "right-6 top-5",
  "bottom-left": "bottom-5 left-5",
  "bottom-right": "bottom-5 right-5",
  "bottom-center": "bottom-5 left-1/2 -translate-x-1/2",
};

export function KorbanWorkspaceHud({
  children,
  position = "top-left",
  className = "",
}: KorbanWorkspaceHudProps) {
  return (
    <div
      className={mergeClass(
        "absolute z-20 flex max-w-[calc(100%-3rem)] flex-wrap items-center gap-2",
        hudPositionClasses[position],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function KorbanWorkspaceGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:36px_36px]" />
  );
}

export function KorbanStatusPill({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={mergeClass(
        "rounded-2xl border px-4 py-2 text-xs font-bold backdrop-blur",
        active === undefined
          ? "border-zinc-800 bg-black/80 text-zinc-300"
          : active
            ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
            : "border-zinc-800 bg-black/80 text-zinc-500",
      )}
    >
      {label}
      {value && <span className="ml-2 font-mono text-orange-300">{value}</span>}
    </Tag>
  );
}
