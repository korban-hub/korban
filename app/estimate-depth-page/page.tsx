"use client";

import { useRouter } from "next/navigation";
import { setEstimateDepth, type EstimateDepth } from "@/lib/projectStore";

type Tier = {
  id: EstimateDepth;
  name: string;
  tagline: string;
  accuracy: string;
  needs: string;
  includes: string[];
};

/**
 * Three depths of the same process, not three separate modes. Each builds
 * on the one below and nothing already entered is discarded when moving
 * up, so an estimator can stop wherever the job justifies stopping.
 *
 * Accuracy expectations are stated plainly on each card — a budget number
 * presented with the same confidence as a full takeoff would be a real
 * hazard, so the limits are part of the offer, not fine print.
 */
const TIERS: Tier[] = [
  {
    id: "quick-bid",
    name: "Quick Bid",
    tagline: "Budgetary and preliminary pricing, fast.",
    accuracy: "Good enough to budget from. Thin for a hard bid — corners and wall connections aren't known yet.",
    needs: "Elevations only",
    includes: ["Grip coverage areas per elevation", "Material counts and load list", "Frame configuration options"],
  },
  {
    id: "full-bid",
    name: "Full Bid",
    tagline: "Real plan geometry behind every number.",
    accuracy: "Solid for most bids. Corners, leg positions, and multi-level step-backs come from actual traced geometry.",
    needs: "Elevations + floor plans",
    includes: ["Everything in Quick Bid", "Floor plan tracing and level stacking", "Scaffold layout with leg positions"],
  },
  {
    id: "korban-bid",
    name: "Korban Bid",
    tagline: "Everything I can assess, for final bid rounds.",
    accuracy: "Everything I can assess. What's left is your judgment on the numbers.",
    needs: "Elevations + floor plans + sections",
    includes: ["Everything in Full Bid", "Section views and 3D model", "My review of the trouble spots"],
  },
];

export default function EstimateDepthPage() {
  const router = useRouter();

  function choose(depth: EstimateDepth) {
    try { setEstimateDepth(depth); } catch { /* storage unavailable — proceed anyway */ }
    router.push("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070604] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]" />
        <div className="absolute -right-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[#F97316]/12 blur-[170px]" />
        <div className="absolute bottom-[-220px] left-1/4 h-[560px] w-[560px] rounded-full bg-[#F97316]/14 blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[980px] flex-col px-6 py-14">
        <header className="flex items-end justify-between">
          <div className="flex items-center gap-3">
            <svg width="26" height="26" viewBox="0 0 44 44" className="shrink-0">
              <defs>
                <linearGradient id="korbanMarkDepth" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FDBA74" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
              </defs>
              <path d="M22 4 L40 38 L4 38 Z" fill="url(#korbanMarkDepth)" />
              <path d="M22 4 L40 38 L22 38 Z" fill="#000000" opacity="0.18" />
            </svg>
            <span className="uppercase text-[#F97316]"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "28px", fontWeight: 700, letterSpacing: ".14em", lineHeight: 1 }}>
              Korban
            </span>
            <span className="ml-1 rounded-full border border-white/15 px-2 py-0.5 text-zinc-400"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "10px", letterSpacing: ".08em" }}>
              scaffold
            </span>
          </div>
          <button onClick={() => router.push("/trades-panel")}
            className="text-[11px] text-zinc-600 transition hover:text-zinc-400"
            style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".05em" }}>
            ‹ trades
          </button>
        </header>

        <div className="mt-10">
          <h1 className="text-white" style={{ fontFamily: "Geist, sans-serif", fontSize: "22px", fontWeight: 600 }}>
            How deep does this one need to go?
          </h1>
          <p className="mt-1.5 max-w-[560px] text-zinc-400" style={{ fontFamily: "Geist, sans-serif", fontSize: "14px" }}>
            Each level builds on the one before it. Start where the job calls for and keep going if it turns
            into a real bid — nothing you enter gets redone.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier, i) => (
            <button key={tier.id} onClick={() => choose(tier.id)}
              className="group flex flex-col rounded-2xl border border-white/12 bg-white/[0.03] p-5 text-left transition hover:border-[#F97316]/60 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70">
              <div className="flex items-center gap-2">
                <span className="text-[#F97316]" style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
                  0{i + 1}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <h2 className="mt-3 text-white" style={{ fontFamily: "Geist, sans-serif", fontSize: "18px", fontWeight: 600 }}>
                {tier.name}
              </h2>
              <p className="mt-1 text-zinc-400" style={{ fontFamily: "Geist, sans-serif", fontSize: "13px" }}>
                {tier.tagline}
              </p>

              <div className="mt-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-zinc-500" style={{ fontFamily: "ui-monospace, monospace", fontSize: "9px", letterSpacing: ".08em" }}>
                  NEEDS
                </p>
                <p className="mt-0.5 text-zinc-300" style={{ fontFamily: "Geist, sans-serif", fontSize: "12px" }}>
                  {tier.needs}
                </p>
              </div>

              <ul className="mt-4 space-y-1.5">
                {tier.includes.map((line) => (
                  <li key={line} className="flex gap-2 text-zinc-400" style={{ fontFamily: "Geist, sans-serif", fontSize: "12.5px" }}>
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#F97316]/70" />
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-white/10 pt-3 text-zinc-500"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "11.5px", lineHeight: 1.5 }}>
                {tier.accuracy}
              </p>

              <span className="mt-4 inline-flex items-center gap-1 text-[#F97316] opacity-70 transition group-hover:opacity-100"
                style={{ fontFamily: "Geist, sans-serif", fontSize: "12px", fontWeight: 600 }}>
                Start here <span style={{ fontFamily: "ui-monospace, monospace" }}>›</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-auto pt-10 text-zinc-700"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "10.5px", letterSpacing: ".06em" }}>
          You can move up a level at any point without re-entering work.
        </p>
      </div>
    </main>
  );
}
