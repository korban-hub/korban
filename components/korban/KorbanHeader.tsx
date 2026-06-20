"use client";

import type { ReactNode } from "react";
import { KorbanMenu, type KorbanMenuLink } from "./KorbanMenu";

export type KorbanHeaderVariant = "standard" | "compact" | "cad";

type KorbanHeaderProps = {
  variant?: KorbanHeaderVariant;
  title: string;
  subtitle?: string;
  titleWeight?: "black" | "bold" | "semibold";
  subtitleStyle?: "uppercase" | "sentence";
  brandStyle?: "label" | "hero";
  brandWeight?: "black" | "bold";
  menuLinks?: KorbanMenuLink[];
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  showMenu?: boolean;
  menuSize?: "sm" | "md";
  menuWidthClass?: string;
  actions?: ReactNode;
  actionsClassName?: string;
  actionsAlwaysVisible?: boolean;
  leading?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
  className?: string;
  as?: "header" | "section";
  paddingClass?: string;
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanHeader({
  variant = "standard",
  title,
  subtitle,
  titleWeight = "black",
  subtitleStyle = "uppercase",
  brandStyle = "label",
  brandWeight = "black",
  menuLinks = [],
  menuOpen = false,
  onMenuToggle,
  showMenu = true,
  menuSize = "md",
  menuWidthClass,
  actions,
  actionsClassName,
  actionsAlwaysVisible = false,
  leading,
  meta,
  footer,
  className,
  as = "header",
  paddingClass,
}: KorbanHeaderProps) {
  const Tag = as;

  // Page titles use Fira Code with wide letter-spacing (0.12em) and
  // medium weight — a deliberate, engineering-drawing-label feel that
  // matches KORBAN's restrained aesthetic better than a bold display
  // font. Locked in after reviewing five spacing/weight options
  // side-by-side. Color stays white; only KORBAN branding stays orange.
  const titleWeightClass = "font-medium";

  const subtitleClass =
    subtitleStyle === "sentence"
      ? "mt-1 text-sm text-zinc-500"
      : "mt-1 text-[13px] normal-case tracking-[0.04em] text-zinc-500";

  const brandWeightClass = brandWeight === "bold" ? "font-bold" : "font-black";

  const brandBlock =
    brandStyle === "hero" ? (
      <div>
        <h1 className="text-xl font-bold tracking-[0.35em] text-korban-accent">KORBAN</h1>
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      </div>
    ) : (
      <div>
        <p
          className={mergeClass(
            "uppercase text-korban-accent",
            brandWeightClass,
            variant === "cad" ? "text-[11px] tracking-[0.48em]" : "text-xs tracking-[0.5em]",
          )}
        >
          KORBAN
        </p>
        <h1
          className={mergeClass(
            "uppercase tracking-[0.12em] text-white",
            variant === "cad"
              ? "mt-1 text-base text-zinc-100"
              : mergeClass("text-[24px] leading-[1.2]", titleWeight === "bold" ? "mt-2" : "mt-1"),
            titleWeightClass,
          )}
          style={{ fontFamily: "var(--font-fira-code), ui-monospace, SFMono-Regular, Menlo, Monaco, monospace" }}
        >
          {title}
        </h1>
        {subtitle && <p className={subtitleClass}>{subtitle}</p>}
        {meta}
      </div>
    );

  const shellClass =
    variant === "compact"
        ? "flex h-16 items-center justify-between border-b border-orange-500/20 bg-korban-header px-6"
      : variant === "cad"
        ? "flex h-[76px] items-center justify-between border-b border-orange-500/25 bg-korban-cad-header px-5 shadow-[0_8px_26px_rgba(0,0,0,0.55)]"
        : mergeClass(
            "border-b border-orange-500/20 bg-korban-header px-6 py-5",
            paddingClass,
          );

  const actionsWrapClass = actionsAlwaysVisible
    ? mergeClass("flex items-center gap-3", variant === "cad" && "gap-2")
    : variant === "cad"
      ? "hidden items-center gap-2 xl:flex"
      : variant === "compact"
        ? "flex items-center gap-3"
        : "hidden items-center gap-3 xl:flex";

  return (
    <Tag className={mergeClass(shellClass, className)}>
      <div className={mergeClass("flex items-center justify-between gap-5", variant === "cad" && "w-full")}>
        {/*
          items-start (not items-center) keeps the menu button pinned to the
          top-left even if the title/subtitle block wraps to multiple lines
          on narrow screens. shrink-0 on the menu prevents it from ever being
          squeezed by a long title.
        */}
        <div className={mergeClass("flex items-start gap-4", variant === "cad" && "items-center gap-4")}>
          {showMenu && onMenuToggle && menuLinks.length > 0 && (
            <div className="shrink-0 pt-1">
              <KorbanMenu
                links={menuLinks}
                open={menuOpen}
                onToggle={onMenuToggle}
                size={menuSize}
                widthClass={menuWidthClass}
              />
            </div>
          )}
          {brandBlock}
          {leading}
        </div>

        {actions && <div className={mergeClass(actionsWrapClass, actionsClassName)}>{actions}</div>}
      </div>

      {footer}
    </Tag>
  );
}

type KorbanHeaderMetaProps = {
  label: string;
  value: string;
};

export function KorbanHeaderMeta({ label, value }: KorbanHeaderMetaProps) {
  return (
    <div className="min-w-36">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-zinc-200">{value}</p>
    </div>
  );
}
