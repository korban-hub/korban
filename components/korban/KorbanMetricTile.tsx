"use client";

type KorbanMetricTileProps = {
  label: string;
  value: string;
  suffix?: string;
  size?: "compact" | "hero";
  className?: string;
};

function mergeClass(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function KorbanMetricTile({
  label,
  value,
  suffix,
  size = "compact",
  className = "",
}: KorbanMetricTileProps) {
  if (size === "hero") {
    return (
      <div className={mergeClass("rounded-2xl border border-zinc-800 bg-black p-3", className)}>
        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
        <p className="mt-1 font-mono text-3xl font-black text-orange-300">
          {value}
          {suffix && <span className="ml-2 text-sm font-bold text-zinc-500">{suffix}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className={mergeClass("rounded-2xl border border-zinc-800 bg-black p-3", className)}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-lg font-black text-orange-300">
        {value}
        {suffix && <span className="ml-1 text-xs text-zinc-500">{suffix}</span>}
      </p>
    </div>
  );
}
