"use client";

import { KorbanButton } from "./KorbanButton";

export type KorbanMenuLink = {
  href: string;
  label: string;
};

type KorbanMenuProps = {
  links: KorbanMenuLink[];
  open: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  widthClass?: string;
};

export function KorbanMenu({
  links,
  open,
  onToggle,
  size = "md",
  widthClass = "w-60",
}: KorbanMenuProps) {
  const menuTop = size === "sm" ? "top-11" : "top-12";

  return (
    <div className="relative">
      <KorbanButton variant="menu" menuSize={size} onClick={onToggle} aria-expanded={open}>
        ▾
      </KorbanButton>

      {open && (
        <div
          className={`absolute left-0 ${menuTop} z-[999] ${widthClass} rounded-2xl border border-orange-500/20 bg-korban-header p-2 shadow-2xl`}
        >
          {links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
