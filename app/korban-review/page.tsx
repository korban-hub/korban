"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildPhaseReport, computeCourtyardTotals, computeElevationOnlyTotals,
  getActiveElevation, getActiveProject,
  type EstimateDepth, type ProjectElevation,
} from "@/lib/projectStore";

/**
 * Korban Review — three summaries of the same job, one per bid depth.
 *
 * Each panel reports what that depth actually knows and what it doesn't,
 * in the voice of someone who did the work reporting back. Panels for
 * depths you haven't reached say so plainly rather than showing numbers
 * that would imply more certainty than exists.
 */

type DepthMeta = {
  id: EstimateDepth;
  name: string;
  blurb: string;
};

const DEPTHS: DepthMeta[] = [
  { id: "quick-bid",  name: "Quick Bid",  blurb: "Elevation coverage only" },
  { id: "full-bid",   name: "Full Bid",   blurb: "Plan geometry and layout" },
  { id: "korban-bid", name: "Korban Bid", blurb: "Sections, 3D, and my review" },
];

const ORDER: EstimateDepth[] = ["quick-bid", "full-bid", "korban-bid"];

export default function KorbanReviewPage() {
  const router = useRouter();
  const [elevation, setElevation] = useState<ProjectElevation | null>(null);
  const [projectName, setProjectName] = useState("");
  const [depth, setDepth] = useState<EstimateDepth>("quick-bid");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const e = getActiveElevation();
      const p = getActiveProject();
      setElevation(e);
      setProjectName(p.projectName || "Untitled project");
      const d = p.estimateDepth ?? "quick-bid";
      setDepth(d);
      // Open the depth the job is actually at; the others stay collapsed.
      setOpen({ [d]: true });
    } catch { /* storage unavailable */ }
    setMounted(true);
  }, []);

  const totals = useMemo(() => computeElevationOnlyTotals(elevation), [elevation]);
  const courtyards = useMemo(() => computeCourtyardTotals(elevation), [elevation]);

  const tracedLevels = (elevation?.overlayGeometry?.fullOverlayRows ?? [])
    .filter(r => r.points.length >= 3).length;
  const hasSections = (elevation?.sectionView?.wallOutline?.length ?? 0) >= 2;

  /** A depth is reached when the work it depends on actually exists. */
  function reached(d: EstimateDepth): boolean {
    if (d === "quick-bid")  return totals.areaCount > 0;
    if (d === "full-bid")   return totals.areaCount > 0 && tracedLevels > 0;
    return totals.areaCount > 0 && tracedLevels > 0 && hasSections;
  }

  if (!mounted) {
    return <main className="flex min-h-screen items-center justify-center bg-[#070604]">
      <p className="text-xs text-zinc-600">Loading review…</p>
    </main>;
  }

  return (
    <main className="min-h-screen bg-[#070604] text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#070604]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-4 px-6 py-3">
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 44 44">
              <defs>
                <linearGradient id="kRev" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FDBA74" /><stop offset="100%" stopColor="#F97316" />
                </linearGradient>
              </defs>
              <path d="M22 4 L40 38 L4 38 Z" fill="url(#kRev)" />
              <path d="M22 4 L40 38 L22 38 Z" fill="#000" opacity="0.18" />
            </svg>
            <span className="uppercase text-[#F97316]"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "22px", fontWeight: 700, letterSpacing: ".14em", lineHeight: 1 }}>
              Korban
            </span>
          </button>
          <span className="text-[12px] text-zinc-500">Review</span>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => router.push("/takeoff-workspace-advanced")}
              className="text-[12px] text-zinc-400 transition hover:text-white">← Takeoff</button>
            <button onClick={() => router.push("/estimate-review")}
              className="rounded-xl bg-[#F97316] px-4 py-2 text-[11px] font-bold text-black transition hover:bg-[#fb923c]">
              Complete bid →
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1000px] px-6 py-6">
        <h1 className="text-white" style={{ fontFamily: "Geist, sans-serif", fontSize: "22px", fontWeight: 600 }}>
          {projectName}
        </h1>
        <p className="mt-1 text-[14px] text-zinc-400">
          Three ways to read this job. Expand whichever you&apos;re pricing from.
        </p>

        <div className="mt-6 space-y-3">
          {DEPTHS.map(d => {
            const isOpen = Boolean(open[d.id]);
            const isReached = reached(d.id);
            const isCurrent = d.id === depth;
            const report = buildPhaseReport(elevation, d.id, totals);

            return (
              <section key={d.id}
                className={`overflow-hidden rounded-xl border transition ${
                  isCurrent ? "border-[#F97316]/40 bg-[#F97316]/[0.03]" : "border-white/10 bg-white/[0.02]"
                }`}>
                <button onClick={() => setOpen(o => ({ ...o, [d.id]: !o[d.id] }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    isReached ? "bg-[#F97316]" : "bg-zinc-700"
                  }`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-white">{d.name}</span>
                      {isCurrent && (
                        <span className="rounded-full border border-[#F97316]/40 bg-[#F97316]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-300">
                          current
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-zinc-500">{d.blurb}</span>
                  </span>
                  {isReached ? (
                    <span className="hidden text-right sm:block">
                      <span className="block text-[15px] font-semibold text-orange-300" style={{ fontFamily: "ui-monospace, monospace" }}>
                        {totals.linearFeet.toLocaleString()}
                      </span>
                      <span className="block text-[10px] text-zinc-600">LF</span>
                    </span>
                  ) : (
                    <span className="hidden text-[11px] text-zinc-600 sm:block">not reached</span>
                  )}
                  <span className={`text-zinc-600 transition ${isOpen ? "rotate-90" : ""}`}
                    style={{ fontFamily: "ui-monospace, monospace" }}>›</span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/8 px-4 py-4">
                    {!isReached ? (
                      <div>
                        <p className="text-[13px] leading-relaxed text-zinc-400">
                          {d.id === "full-bid"
                            ? "No floor plan traced yet, so there's no plan geometry to review. A full bid needs at least one level traced."
                            : d.id === "korban-bid"
                              ? "No section views drawn yet. Sections are what let me check wall steps and setbacks against the layout."
                              : "Nothing gripped yet. Grip the areas that need coverage on each elevation and this fills in."}
                        </p>
                        <button onClick={() => router.push("/takeoff-workspace-advanced")}
                          className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-[#F97316]/50 hover:text-[#F97316]">
                          Go do that →
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[13px] leading-relaxed text-zinc-300">{report.covered}</p>

                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            ["Frames", totals.frameCount], ["Planks", totals.plankCount],
                            ["Bays", totals.bayCount], ["Legs", totals.legCount],
                          ].map(([l, v]) => (
                            <div key={l as string} className="rounded-lg border border-white/8 bg-black/40 px-3 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-zinc-600">{l}</p>
                              <p className="mt-0.5 text-[16px] font-semibold text-zinc-100" style={{ fontFamily: "ui-monospace, monospace" }}>
                                {Number(v).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>

                        {courtyards.courtyardCount > 0 && (
                          <p className="mt-2 text-[11px] text-zinc-500">
                            Includes {courtyards.courtyardCount} courtyard{courtyards.courtyardCount > 1 ? "s" : ""} · {courtyards.linearFeet.toLocaleString()} LF
                          </p>
                        )}

                        {report.gaps.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[12px] text-zinc-400">What I don&apos;t know yet:</p>
                            <ul className="mt-1.5 space-y-1.5">
                              {report.gaps.map((g, i) => (
                                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-zinc-400">
                                  <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-amber-500/70" />
                                  {g}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {report.nextStep && (
                          <p className="mt-4 border-t border-white/8 pt-3 text-[12.5px] leading-relaxed text-zinc-400">
                            {report.nextStep}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-8 text-zinc-700" style={{ fontFamily: "ui-monospace, monospace", fontSize: "10.5px", letterSpacing: ".06em" }}>
          Deeper tiers reuse everything from the ones below — nothing is entered twice.
        </p>
      </div>
    </main>
  );
}
