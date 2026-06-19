"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export type KorbanButtonVariant =
  | "primary"
  | "primary-pill"
  | "secondary"
  | "ghost"
  | "accent"
  | "tool-active"
  | "tool-inactive"
  | "cad-primary"
  | "cad-ghost"
  | "menu";

type SharedProps = {
  variant?: KorbanButtonVariant;
  className?: string;
  children: ReactNode;
  block?: boolean;
  compact?: boolean;
  menuSize?: "sm" | "md";
};

export type KorbanButtonProps =
  | (SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: "button" })
  | (SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: "a"; href: string })
  | (SharedProps & LabelHTMLAttributes<HTMLLabelElement> & { as: "label" });

const variantClasses: Record<KorbanButtonVariant, string> = {
  primary:
    "rounded-xl bg-korban-accent px-4 py-2 text-xs font-bold text-black transition hover:bg-korban-accent-hover",
  "primary-pill":
    "rounded-full bg-korban-accent px-5 py-2 text-sm font-semibold text-black transition hover:bg-korban-accent-hover",
  secondary:
    "rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500/20",
  ghost:
    "rounded-xl border border-zinc-800 bg-korban-header px-4 py-2 text-xs font-bold text-zinc-300 transition hover:border-orange-500/40 hover:text-orange-300",
  accent:
    "rounded-xl border border-orange-500/30 bg-orange-500/10 text-center font-bold text-orange-300 transition hover:bg-orange-500/20",
  "tool-active":
    "rounded-xl border border-korban-accent bg-korban-accent px-4 py-2.5 text-xs font-semibold text-black shadow-[0_0_20px_var(--korban-glow)] transition",
  "tool-inactive":
    "rounded-xl border border-zinc-700 bg-korban-header px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-orange-500/60",
  "cad-primary":
    "border border-korban-accent bg-korban-accent px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-black shadow-[0_0_18px_rgba(249,115,22,0.18)] transition hover:bg-korban-accent-hover",
  "cad-ghost":
    "border border-zinc-700/80 bg-[#080808] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-orange-500/40 hover:text-orange-300",
  menu: "flex items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 transition hover:bg-orange-500/20",
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanButton(props: KorbanButtonProps) {
  const {
    variant = "ghost",
    className,
    children,
    block,
    compact,
    menuSize = "md",
    as = "button",
    ...rest
  } = props;

  const sizeClass =
    variant === "menu"
      ? menuSize === "sm"
        ? "h-9 w-9"
        : "h-10 w-10"
      : variant === "accent"
        ? compact
          ? "px-3 py-2 text-xs"
          : "px-4 py-3 text-sm"
        : variant === "primary-pill"
          ? ""
          : "";

  const classes = mergeClass(
    variantClasses[variant],
    block && "block w-full",
    block && variant === "accent" && "mt-4",
    sizeClass,
    className,
  );

  if (as === "a") {
    const linkProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} {...linkProps}>
        {children}
      </a>
    );
  }

  if (as === "label") {
    const labelProps = rest as LabelHTMLAttributes<HTMLLabelElement>;
    return (
      <label className={mergeClass(classes, "cursor-pointer")} {...labelProps}>
        {children}
      </label>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
