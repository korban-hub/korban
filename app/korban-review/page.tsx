"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, KorbanHeaderMeta } from "@/components/korban";
import {
  buildPhaseReport, computeCourtyardTotals, computeElevationOnlyTotals,
  calculateQuantityEngine, getActiveElevation, getActiveProject, getEstimateDepth, readTier,
  type EstimateDepth, type ProjectElevation,
} from "@/lib/projectStore";

/**
 * Korban Review - three readings of the same job, side by side.
 *
 * The point of this page is comparison: what does this job look like if you
 * price it from elevations alone, versus from traced plan geometry, versus
 * from the full model? Stacking those vertically hid the comparison, so they
 * sit horizontally now.
 *
 * Each tier reports from its OWN source. Quick Bid reads gripped elevation
 * areas; Full Bid and Korban Bid read the quantity engine, which only has
 * anything in it once a plan is traced. Showing the same counts under all
 * three - which is what this did before - implied depth buys nothing.
 *
 * Korban's own read is set apart from the numbers deliberately. Counts are
 * measurements; the commentary is a judgement, and the two should never be
 * mistaken for each other.
 */

type LevelMeta = {
  id: EstimateDepth;
  name: string;
  blurb: string;
  /** What this tier is for, and how closely it looks. */
  serves: string;
  detail: string;
  source: string;
};

const LEVELS: LevelMeta[] = [
  /*
   * What each tier is for, rather than a percentage.
   *
   * The accuracy bands read like a promise nobody made - an estimator knows
   * what a budget number is worth without being given a range for it.
   */
  { id: "quick-bid",  name: "Quick Bid",  blurb: "Elevation coverage only",    serves: "Budget Number",  detail: "Low Detail",         source: "Gripped elevation areas" },
  { id: "full-bid",   name: "Full Bid",   blurb: "Highlighted runs and grips", serves: "Most Bids",         detail: "Good Coverage",      source: "Highlighted runs" },
  { id: "korban-bid", name: "Korban Bid", blurb: "Sections, 3D and my review", serves: "Hard Bids",         detail: "Detailed & Precise", source: "Traced plan and sections" },
];

const LEVEL_RANK: Record<EstimateDepth, number> = {
  "quick-bid": 0,
  "full-bid": 1,
  "korban-bid": 2,
};

// -----------------------------------------------------------------------------
// Motion - the same vocabulary as Estimate Review
// -----------------------------------------------------------------------------

function useRollingNumber(value: number, durationMs = 260) {
  const [display, setDisplay] = useState(value);
  const settled = useRef(value);

  useEffect(() => {
    const from = settled.current;
    if (from === value) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
      else { settled.current = value; setDisplay(value); }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan { animation: none; opacity: 0; }
      }
    `}</style>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function KorbanReviewPage() {
  const router = useRouter();
  const [elevation, setElevation] = useState<ProjectElevation | null>(null);
  const [projectName, setProjectName] = useState("");
  const [proposalNumber, setProposalNumber] = useState("");
  const [depth, setDepth] = useState<EstimateDepth>("quick-bid");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const activeElevation = getActiveElevation();
      const project = getActiveProject();
      setElevation(activeElevation);
      setProjectName(project.projectName || "Untitled project");
      // The number typed in Plan Desk, as everywhere else - the project id is
      // only a fallback for a job that has not been given one.
      setProposalNumber(project.proposalNumber || project.projectId || "");
      setDepth(getEstimateDepth());
    } catch {
      // Storage unavailable - the page still renders, everything reads empty.
    }
    setMounted(true);
  }, []);


  /*
   * Each tier read from its own work.
   *
   * This used to read the one elevation three times and ask a Korban Bid's
   * question of all three - "are there traced levels?" - which a Full Bid can
   * never answer yes to, because it measures with the highlighter. So Full Bid
   * showed nothing on every job, however much had been done in it.
   */
  const tiers = useMemo(() => ({
    "quick-bid": readTier(elevation, "quick-bid"),
    "full-bid": readTier(elevation, "full-bid"),
    "korban-bid": readTier(elevation, "korban-bid"),
  }), [elevation]);

  /** A tier is reached when the work it is built on actually exists in it. */
  function reached(id: EstimateDepth): boolean {
    const snap = tiers[id];
    if (id === "quick-bid") return (snap.linearFeet ?? 0) > 0;
    if (id === "full-bid") return (snap.highlights ?? []).some((h) => (h.lf ?? 0) > 0);
    return (snap.overlayGeometry?.fullOverlayRows ?? []).filter((row) => row.points.length >= 3).length > 0;
  }

  /**
   * Counts for a tier, from that tier's own measurements. A Quick Bid knows
   * only what was typed; Full Bid knows its strokes; Korban Bid knows its
   * traced plan. They genuinely differ, and should.
   */
  function countsFor(id: EstimateDepth) {
    const snap = tiers[id];
    const engine = snap.quantityEngine;
    const strokes = snap.highlights ?? [];
    const strokeLf = strokes.reduce((sum, h) => sum + (h.lf ?? 0), 0);

    /*
     * The stored counts, or the strokes themselves.
     *
     * A tier's quantities are written when its layout is worked out in Set
     * Scaffold, and until that has happened there is nothing stored to read -
     * so a Full Bid with its faces swiped and gripped showed dashes. Each run
     * is a length at a height, which is all the engine needs, so Review can
     * work it out from the strokes rather than report nothing.
     *
     * The stored figures win when they exist, because those came from the real
     * layout - corners joined, runs counted as drawn.
     */
    const stored = {
      frames: engine?.frameCount ?? 0,
      planks: engine?.plankCount ?? 0,
      bays: engine?.bayCount ?? 0,
      legs: engine?.legCount ?? 0,
    };
    const laidOut = stored.frames > 0 || stored.legs > 0;

    if (id === "full-bid" && !laidOut && strokes.length > 0) {
      const fromStrokes = { frames: 0, planks: 0, bays: 0, legs: 0 };
      for (const run of strokes) {
        if ((run.lf ?? 0) <= 0 || (run.heightFt ?? 0) <= 0) continue;
        const e = calculateQuantityEngine({
          linearFeet: run.lf,
          wallHeight: run.heightFt,
          standardBayLength: elevation?.scaffoldInput.standardBayLength ?? 10,
          scaffoldWidth: elevation?.scaffoldInput.scaffoldWidth ?? 3,
          frameHeight: elevation?.scaffoldInput.frameHeight ?? 6.333,
          plankCountPerBay: elevation?.scaffoldInput.plankCountPerBay ?? 3,
          bracePattern: elevation?.scaffoldInput.bracePattern ?? "Every Bay",
          wallOffset: elevation?.scaffoldInput.wallOffset ?? 1,
        });
        fromStrokes.frames += e.frameCount;
        fromStrokes.planks += e.plankCount;
        fromStrokes.bays += e.bayCount;
        fromStrokes.legs += e.legCount;
      }
      return { linearFeet: strokeLf, ...fromStrokes };
    }

    return {
      linearFeet: id === "full-bid" && strokeLf > 0 ? strokeLf : (snap.linearFeet ?? 0),
      ...stored,
    };
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Loading review...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      {/*
        * The same header as every other page.
        *
        * This one was hand-built, so it carried a different mark, a different
        * title treatment and its own buttons - the one page in the flow that
        * did not look like the rest of it.
        */}
      <KorbanHeader
        title="Review"
        subtitle="The same job read three ways"
        actionsAlwaysVisible
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={projectName} />
            <KorbanHeaderMeta label="Job No." value={proposalNumber || "-"} />
            <KorbanButton as="a" href="/set-scaffold-v2" variant="ghost">&larr; Set Scaffold</KorbanButton>
            <KorbanButton as="a" href="/dashboard" variant="ghost">Bid Room</KorbanButton>
            <KorbanButton as="a" href="/estimate-review" variant="primary">Estimate &rarr;</KorbanButton>
          </>
        }
      />

      {/* Workspace */}
      <div className="relative mx-auto w-full max-w-[1500px] px-5 py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1
                className="text-[30px] font-semibold uppercase leading-none tracking-[0.04em] text-white"
                style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
              >
                {projectName}
              </h1>
              <p className="mt-1.5 text-[12px] text-zinc-500">
                The same job read three ways. What each depth knows, and what it doesn&apos;t.
              </p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Currently at{" "}
              <span className="text-orange-400">
                {LEVELS.find((item) => item.id === depth)?.name ?? depth}
              </span>
            </p>
          </div>

          {/* Three tiers, side by side, so they can actually be compared */}
          <div className="mt-5 grid items-start gap-3 lg:grid-cols-3">
            {LEVELS.map((meta) => {
              // Each panel is shown that tier's own takeoff, not the one that
              // happens to be loaded.
              const asTier = elevation ? { ...elevation, ...tiers[meta.id] } : elevation;
              const tierCourtyards = computeCourtyardTotals(asTier);
              return (
              <LevelPanel
                key={meta.id}
                meta={meta}
                counts={countsFor(meta.id)}
                report={buildPhaseReport(asTier, meta.id, computeElevationOnlyTotals(asTier))}
                reached={reached(meta.id)}
                isCurrent={meta.id === depth}
                isBelowCurrent={LEVEL_RANK[meta.id] < LEVEL_RANK[depth]}
                courtyardCount={tierCourtyards.courtyardCount}
                courtyardLinearFeet={tierCourtyards.linearFeet}
                onGo={() => router.push("/takeoff-workspace-advanced")}
              />
              );
            })}
          </div>

          <p className="mt-6 font-mono text-[10px] leading-5 tracking-[0.06em] text-zinc-700">
            Deeper tiers reuse everything from the ones below. Nothing is entered twice.
          </p>
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Tier panel
// -----------------------------------------------------------------------------

type Counts = {
  linearFeet: number;
  frames: number;
  planks: number;
  bays: number;
  legs: number;
};

function LevelPanel({
  meta, counts, report, reached, isCurrent, isBelowCurrent,
  courtyardCount, courtyardLinearFeet, onGo,
}: {
  meta: LevelMeta;
  counts: Counts;
  report: { covered: string; gaps: string[]; nextStep?: string };
  reached: boolean;
  isCurrent: boolean;
  isBelowCurrent: boolean;
  courtyardCount: number;
  courtyardLinearFeet: number;
  onGo: () => void;
}) {
  const router = useRouter();
  return (
    <section
      className={`relative rounded-lg border p-3 transition ${
        isCurrent
          ? "border-orange-500/45 bg-orange-500/[0.04]"
          : reached
          ? "border-zinc-800 bg-korban-raised"
          : "border-zinc-900 bg-korban-inset"
      }`}
    >
      {/* Corner ticks read as instrumentation - only on tiers that hold data */}
      {reached && (
        <>
          <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
          <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
        </>
      )}
      {isCurrent && (
        <span
          aria-hidden
          className="korban-scan pointer-events-none absolute -top-px left-0 h-px w-[36%]"
          style={{ background: "linear-gradient(90deg,transparent,#F97316,transparent)" }}
        />
      )}

      {/* Head */}
      <div className="flex items-start justify-between gap-2 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${reached ? "bg-orange-500" : "bg-zinc-700"}`}
            />
            <h2
              className="text-[19px] font-semibold uppercase leading-none tracking-[0.05em] text-white"
              style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
            >
              {meta.name}
            </h2>
            {isCurrent && (
              <span className="rounded border border-orange-400/45 bg-orange-400/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-orange-200">
                current
              </span>
            )}
            {isBelowCurrent && (
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-700">
                superseded
              </span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-zinc-500">{meta.blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[11px] font-bold text-zinc-200">{meta.serves}</p>
          <p className="font-mono text-[8.5px] text-amber-200/60">{meta.detail}</p>
        </div>
      </div>

      {!reached ? (
        <div className="rounded border border-zinc-900 bg-black px-3 py-4">
          <p className="text-[11.5px] leading-[1.6] text-zinc-500">
            {meta.id === "full-bid"
              ? "No floor plan traced yet, so there's no plan geometry to read. A full bid needs at least one level traced."
              : meta.id === "korban-bid"
              ? "No section views drawn yet. Sections are what let me check wall steps and setbacks against the layout."
              : "Nothing gripped yet. Grip the areas that need coverage on each elevation and this fills in."}
          </p>
          <button
            onClick={onGo}
            className="mt-3 rounded border border-orange-500/40 bg-orange-500/10 px-3.5 py-1.5 font-mono text-[10px] font-bold text-orange-300 transition hover:border-orange-500 hover:bg-orange-500/20"
          >
            {meta.id === "quick-bid"
              ? "Let's do it"
              : meta.id === "full-bid"
              ? "Take me back"
              : "Set it up"}
          </button>
        </div>
      ) : (
        <div className="rounded border border-zinc-900 bg-black p-2.5">
          {/* Measurements. Plain, tabular, no commentary. */}
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900 pb-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
              Coverage
            </span>
            <span className="font-mono text-[24px] font-bold leading-none text-orange-400">
              <RollingCount value={counts.linearFeet} />
              <span className="ml-1.5 text-[11px] font-normal text-zinc-600">LF</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <CountRow label="Frames" value={counts.frames} />
            <CountRow label="Planks" value={counts.planks} />
            <CountRow label="Bays" value={counts.bays} />
            <CountRow label="Legs" value={counts.legs} />
          </div>

          <p className="mt-1.5 border-t border-zinc-900 pt-1.5 font-mono text-[9px] text-zinc-700">
            From: {meta.source}
          </p>

          {courtyardCount > 0 && (
            <p className="mt-1 font-mono text-[9px] text-zinc-600">
              Includes {courtyardCount} courtyard{courtyardCount > 1 ? "s" : ""} -{" "}
              {courtyardLinearFeet.toLocaleString()} LF
            </p>
          )}

          {/* Korban's read. Set apart on purpose - the counts above are
              measurements, this is a judgement, and they shouldn't blur. */}
          <div className="mt-3 rounded border-l-2 border-orange-500 bg-orange-500/[0.05] px-2.5 py-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <svg width="9" height="9" viewBox="0 0 44 44" aria-hidden>
                <path d="M22 4 L40 38 L4 38 Z" fill="#F97316" />
              </svg>
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-orange-400">
                Korban thinks...
              </span>
            </div>
            <p className="text-[11.5px] leading-[1.55] text-zinc-300">{report.covered}</p>

            {report.gaps.length > 0 && (
              <>
                <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                  What I don&apos;t know yet
                </p>
                <ul className="mt-1 space-y-1">
                  {report.gaps.map((gap) => (
                    <li key={gap} className="flex gap-1.5 text-[11px] leading-[1.5] text-zinc-400">
                      <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-amber-500/70" />
                      {gap}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.nextStep && (
              <p className="mt-2.5 border-t border-orange-500/20 pt-2 text-[11px] leading-[1.5] text-zinc-400">
                {report.nextStep}
              </p>
            )}

            {/*
              * Somewhere to go.
              *
              * Korban said what was missing and then left you looking at it -
              * the one thing you want at that moment is the page where you can
              * fix it.
              */}
            <div className="mt-2.5 flex gap-1.5">
              <button
                onClick={onGo}
                className="rounded border border-zinc-700 px-2 py-1 font-mono text-[9.5px] text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                Takeoff
              </button>
              <button
                onClick={() => router.push("/set-scaffold-v2")}
                className="rounded border border-zinc-700 px-2 py-1 font-mono text-[9.5px] text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                Set Scaffold
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RollingCount({ value }: { value: number }) {
  const rolled = useRollingNumber(value);
  return <>{Math.round(rolled).toLocaleString()}</>;
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-900/70 py-1">
      <span className="text-[10.5px] text-zinc-500">{label}</span>
      <span className="font-mono text-[12px] font-bold text-zinc-200">
        {value > 0 ? value.toLocaleString() : <span className="text-zinc-700">-</span>}
      </span>
    </div>
  );
}
