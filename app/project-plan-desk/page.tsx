"use client";

/**
 * Project Plan Desk - everything about one bid.
 *
 * The Dashboard holds every project; this page holds one. A new project lands
 * here blank and the estimator fills it in, which makes this the origin of
 * every detail the proposal eventually prints. Nothing downstream can invent
 * what isn't entered here.
 *
 * The page answers three questions, in order: whose job is this, how far has
 * it come, and what does it currently total. Anything not yet done says so
 * plainly rather than showing a plausible-looking zero.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
  getEstimateDepth,
  updateActiveProject,
  computeElevationOnlyTotals,
  computeCourtyardTotals,
  type EstimateDepth,
  type ProjectElevation,
  type ProjectRecord,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";
import { loadEstimateState, type EstimateDerived } from "@/lib/estimateState";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/set-scaffold-v2", label: "Set Scaffold" },
  { href: "/korban-review", label: "Korban Review" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
];

const LEVEL_LABEL: Record<EstimateDepth, string> = {
  "quick-bid": "Quick Bid",
  "full-bid": "Full Bid",
  "korban-bid": "Korban Bid",
};

const LEVEL_ACCURACY: Record<EstimateDepth, string> = {
  "quick-bid": "+/-15-25%",
  "full-bid": "+/-8-12%",
  "korban-bid": "+/-3-6%",
};

// -----------------------------------------------------------------------------
// Motion - same vocabulary as Estimate Review
// -----------------------------------------------------------------------------

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      @keyframes korban-flash {
        0% { opacity: 0.9; transform: translateX(-100%); }
        100% { opacity: 0; transform: translateX(220%); }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      .korban-flash { animation: korban-flash 0.5s ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan, .korban-flash { animation: none; opacity: 0; }
      }
    `}</style>
  );
}

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

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function ProjectPlanDeskPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [elevation, setElevation] = useState<ProjectElevation | null>(null);
  const [depth, setDepth] = useState<EstimateDepth>("quick-bid");
  const [derived, setDerived] = useState<EstimateDerived | null>(null);
  /** Which drawing is open full size. Null means none. */
  const [openView, setOpenView] = useState<{ label: string; ready: boolean } | null>(null);
  const [unionDefault, setUnionDefault] = useState("Union");

  const load = useCallback(() => {
    try {
      setProject(getActiveProject());
      setElevation(getActiveElevation());
      setDepth(getEstimateDepth());
      setDerived(loadEstimateState().derived);
      setUnionDefault(getBackendSettings().company.unionDefault);
    } catch {
      // Storage unavailable - the page renders empty rather than failing.
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  /** Writes a field to the store and keeps local state in step. */
  function setField(key: keyof ProjectRecord, value: string) {
    if (!project) return;
    const next = updateActiveProject({ [key]: value } as Partial<ProjectRecord>);
    setProject(next);
  }

  if (!mounted || !project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening project...</p>
      </main>
    );
  }

  // ---- What's actually been done ------------------------------------------
  const elevationTotals = computeElevationOnlyTotals(elevation);
  const courtyards = computeCourtyardTotals(elevation);
  const tracedLevels = (elevation?.overlayGeometry?.fullOverlayRows ?? []).filter(
    (row) => row.points.length >= 3
  ).length;
  const hasScale = Boolean(elevation?.scale);
  const hasGrips = elevationTotals.areaCount > 0;
  const hasSection = (elevation?.sectionView?.wallOutline?.length ?? 0) >= 2;
  const hasPricing = Boolean(derived && derived.rentalsRevenue > 0);
  // A level only counts as chosen once real takeoff work backs it up.
  const levelChosen = hasScale || hasGrips || tracedLevels > 0;

  const engine = elevation?.quantityEngine;
  const linearFeet = elevation?.linearFeet ?? 0;

  const details: { key: keyof ProjectRecord; label: string; placeholder: string; hint?: string }[] = [
    { key: "projectName", label: "Project", placeholder: "Name this job" },
    { key: "projectAddress", label: "Address", placeholder: "Street, city, state" },
    { key: "customer", label: "Customer", placeholder: "Who is paying" },
    { key: "generalContractor", label: "General contractor", placeholder: "Often the same as customer" },
    { key: "contactName", label: "Contact", placeholder: "Who the proposal is addressed to" },
    { key: "contactEmail", label: "Contact email", placeholder: "name@company.com" },
    { key: "contactPhone", label: "Contact phone", placeholder: "(000) 000-0000" },
    { key: "estimator", label: "Estimator", placeholder: "Who is bidding this" },
    { key: "proposalNumber", label: "Proposal no.", placeholder: "Your own bid number", hint: "Entered, never generated - every company numbers bids differently." },
    { key: "bidDueDate", label: "Bid due", placeholder: "MM/DD/YY" },
  ];

  const filled = details.filter((row) => String(project[row.key] ?? "").trim() !== "").length;
  const complete = filled === details.length;

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Project Plan Desk"
        subtitle={project.projectName || "Untitled project"}
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <div className="rounded-lg border border-zinc-800 bg-korban-raised px-3.5 py-1.5 text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Bid level</p>
              {/* Blank until the estimator chooses one in Takeoff. Showing a
                  level before anything is measured claims an accuracy the job
                  hasn't earned. */}
              {levelChosen ? (
                <p className="font-mono text-[12px] font-bold leading-tight text-zinc-200">
                  {LEVEL_LABEL[depth]}
                  <span className="ml-2 text-[10px] font-normal text-zinc-600">
                    {LEVEL_ACCURACY[depth]}
                  </span>
                </p>
              ) : (
                <p className="font-mono text-[12px] font-bold leading-tight text-zinc-700">
                  Not set
                </p>
              )}
            </div>
            <KorbanButton
              variant="primary"
              onClick={() => router.push("/takeoff-workspace-advanced")}
            >
              {hasGrips ? "Continue takeoff" : "Start takeoff"}
            </KorbanButton>
          </>
        }
      />

      <div className="relative mx-auto w-full max-w-[1500px] px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          {/* ---- Who this job is for ------------------------------------ */}
          <Panel
            title="Job details"
            right={
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                  complete ? "text-emerald-400/70" : "text-zinc-600"
                }`}
              >
                {complete ? "complete" : `${filled} of ${details.length}`}
              </span>
            }
          >
            {!complete && (
              <p className="mb-2 border-l-2 border-orange-500/50 bg-orange-500/[0.05] py-1.5 pl-2.5 text-[10.5px] leading-[1.5] text-zinc-400">
                Everything the proposal prints starts here. Blank fields stay blank
                on the document.
              </p>
            )}

            <div className="grid gap-0.5">
              {details.map((row) => (
                <DetailField
                  key={row.key}
                  label={row.label}
                  placeholder={row.placeholder}
                  hint={row.hint}
                  value={String(project[row.key] ?? "")}
                  onCommit={(value) => setField(row.key, value)}
                />
              ))}

              <div className="grid grid-cols-[132px_1fr] items-center gap-3 border-t border-zinc-900/70 px-1 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                  Union status
                </span>
                <div className="flex gap-1">
                  {["Union", "Non-Union"].map((option) => {
                    const active = (project.unionStatus || unionDefault) === option;
                    return (
                      <button
                        key={option}
                        onClick={() => setField("unionStatus", option)}
                        className={`rounded border px-3 py-1 font-mono text-[10px] font-medium transition ${
                          active
                            ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                            : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                  {!project.unionStatus && (
                    <span className="self-center font-mono text-[9px] text-zinc-700">
                      from Backend
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* The nudge belongs at the bottom of the details, because that's
                where an estimator finishes and wonders what's next. */}
            <div className="mt-2.5 rounded border border-orange-500/25 bg-orange-500/[0.05] px-3 py-2.5">
              <p className="text-[11.5px] font-semibold text-orange-200">
                {complete
                  ? "Details are in. Time to build the estimate."
                  : hasGrips
                  ? "Takeoff is underway - pick up where you left off."
                  : "Now let's go land some work!"}
              </p>
              <p className="mt-1 text-[10.5px] leading-[1.55] text-zinc-500">
                {hasGrips
                  ? "Every measurement you have already taken carries forward. Nothing gets entered twice."
                  : "Upload the plans, set the scale, and grip the elevations that need coverage. Korban does the counting."}
              </p>
              <button
                onClick={() => router.push("/takeoff-workspace-advanced")}
                className="mt-2 rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-bold text-black transition hover:bg-orange-400"
              >
                {hasGrips ? "Back to takeoff" : "Start takeoff"}
              </button>
            </div>
          </Panel>

          <div className="grid items-start gap-3">
            {/* ---- How far it's come ------------------------------------ */}
            <Panel
              title="Where this bid stands"
              right={
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                  {LEVEL_LABEL[depth]}
                </span>
              }
              scan={false}
            >
              <div className="grid gap-1">
                <Stage
                  done={hasScale}
                  label="Scale set"
                  detail={hasScale ? "Drawing measured" : "Nothing measured until scale is locked"}
                  onGo={() => router.push("/takeoff-workspace-advanced")}
                />
                <Stage
                  done={hasGrips}
                  label="Elevations gripped"
                  detail={
                    hasGrips
                      ? `${elevationTotals.areaCount} area${elevationTotals.areaCount === 1 ? "" : "s"} - ${elevationTotals.linearFeet.toLocaleString()} LF`
                      : "No coverage recorded"
                  }
                  onGo={() => router.push("/takeoff-workspace-advanced")}
                />
                <Stage
                  done={tracedLevels > 0}
                  label="Floor plan traced"
                  detail={
                    tracedLevels > 0
                      ? `${tracedLevels} level${tracedLevels === 1 ? "" : "s"} traced`
                      : "Full Bid and above"
                  }
                  optional={depth === "quick-bid"}
                  onGo={() => router.push("/takeoff-workspace-advanced")}
                />
                <Stage
                  done={hasSection}
                  label="Section drawn"
                  detail={hasSection ? "Wall profile captured" : "Korban Bid only"}
                  optional={depth !== "korban-bid"}
                  onGo={() => router.push("/set-scaffold-v2")}
                />
                <Stage
                  done={hasPricing}
                  label="Priced"
                  detail={
                    hasPricing
                      ? "Rental and labor calculated"
                      : "Opens once quantities exist"
                  }
                  onGo={() => router.push("/estimate-review")}
                />
              </div>
            </Panel>

            {/* ---- What it currently totals ------------------------------ */}
            <Panel title="Current quantities" scan={false}>
              {!hasScale && !hasGrips && tracedLevels === 0 ? (
                <p className="px-1 py-3 text-[11px] leading-[1.6] text-zinc-600">
                  Nothing measured yet. Quantities appear here as the takeoff
                  progresses - they are never estimated ahead of the work.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900 pb-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                      Coverage
                    </span>
                    <span className="font-mono text-[26px] font-bold leading-none text-orange-400">
                      <Rolling value={linearFeet || elevationTotals.linearFeet} />
                      <span className="ml-1.5 text-[11px] font-normal text-zinc-600">LF</span>
                    </span>
                  </div>

                  <div className="mt-1 grid grid-cols-3 gap-x-4">
                    <Count label="Frames" value={engine?.frameCount ?? 0} />
                    <Count label="Planks" value={engine?.plankCount ?? 0} />
                    <Count label="Bays" value={engine?.bayCount ?? 0} />
                    <Count label="Legs" value={engine?.legCount ?? 0} />
                    <Count label="Cross braces" value={engine?.crossBraceCount ?? 0} />
                    <Count label="Guardrails" value={engine?.guardrailCount ?? 0} />
                  </div>

                  {courtyards.courtyardCount > 0 && (
                    <p className="mt-2 border-t border-zinc-900 pt-1.5 font-mono text-[9px] text-zinc-600">
                      Includes {courtyards.courtyardCount} courtyard
                      {courtyards.courtyardCount === 1 ? "" : "s"} -{" "}
                      {courtyards.linearFeet.toLocaleString()} LF
                    </p>
                  )}
                </>
              )}
            </Panel>

            {/* ---- What the job looks like ------------------------------- */}
            <Panel title="Project views" scan={false}>
              <p className="mb-2 px-1 text-[10px] leading-[1.5] text-zinc-600">
                Fills in as the takeoff progresses. Click any view to open it.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ViewBay
                  label="Plan overlay"
                  ready={tracedLevels > 0}
                  note={tracedLevels > 0 ? `${tracedLevels} level${tracedLevels === 1 ? "" : "s"}` : "Full Bid and above"}
                  onOpen={() => setOpenView({ label: "Plan overlay", ready: tracedLevels > 0 })}
                />
                <ViewBay
                  label="3D model"
                  ready={hasGrips && tracedLevels > 0}
                  note={hasGrips && tracedLevels > 0 ? "Ready to view" : "Needs a traced plan"}
                  onOpen={() => setOpenView({ label: "3D model", ready: hasGrips && tracedLevels > 0 })}
                />
                <ViewBay
                  label="Section view"
                  ready={hasSection}
                  note={hasSection ? "Wall profile captured" : "Korban Bid only"}
                  onOpen={() => setOpenView({ label: "Section view", ready: hasSection })}
                />
              </div>
            </Panel>

            {/* ---- The number, if there is one --------------------------- */}
            {hasPricing && derived && (
              <Panel title="Estimate so far" scan={false}>
                <div className="grid grid-cols-2 gap-x-4">
                  <Money label="Rental revenue" value={derived.rentalsRevenue} />
                  <Money label="Labor cost" value={derived.laborCost} />
                  <Count label="Erect hours" value={derived.erectHours} />
                  <Count label="Dismantle hours" value={derived.dismantleHours} />
                </div>
                <button
                  onClick={() => router.push("/estimate-review")}
                  className="mt-2 w-full rounded border border-zinc-800 bg-korban-raised py-1.5 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
                >
                  Open Estimate Review
                </button>
              </Panel>
            )}
          </div>
        </div>

        <p className="relative mt-5 font-mono text-[9px] tracking-[0.06em] text-zinc-700">
          Last saved {formatWhen(project.updatedAt)}
        </p>
      </div>

      {/* A drawing is worth looking at properly, so it opens full size rather
          than sending the estimator to another page to squint at it. */}
      {openView && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
          onClick={() => setOpenView(null)}
        >
          <div
            className="relative m-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-korban-base"
            onClick={(event) => event.stopPropagation()}
          >
            <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-4 w-4 border-l border-t border-orange-500" />
            <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b border-r border-orange-500" />

            <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-2.5">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300">
                {openView.label}
              </h2>
              <span className="flex items-center gap-2">
                <button
                  onClick={() =>
                    router.push(
                      openView.label === "Plan overlay"
                        ? "/takeoff-workspace-advanced"
                        : "/set-scaffold-v2"
                    )
                  }
                  className="rounded border border-zinc-800 bg-korban-raised px-3 py-1.5 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
                >
                  Edit in {openView.label === "Plan overlay" ? "Takeoff" : "Set Scaffold"}
                </button>
                <button
                  onClick={() => setOpenView(null)}
                  className="rounded border border-zinc-800 bg-korban-raised px-3 py-1.5 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                >
                  Close
                </button>
              </span>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <div className="text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                  {openView.label}
                </p>
                <p className="mx-auto mt-2 max-w-md text-[11.5px] leading-[1.6] text-zinc-500">
                  {openView.ready
                    ? "The live drawing renders here. Until the viewer is wired through, open it in the tool that owns it."
                    : openView.label === "Plan overlay"
                    ? "Nothing traced yet. Trace a floor plan in Takeoff Workspace and the building outline appears here, stacked level by level."
                    : openView.label === "3D model"
                    ? "Nothing to model yet. Once a plan is traced and elevations are gripped, the scaffold builds itself here and turns so you can walk it."
                    : "No section drawn yet. Trace a wall profile in Set Scaffold and the frame configuration shows here against the real wall."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

function Panel({
  title, right, scan = true, children,
}: {
  title: string;
  right?: React.ReactNode;
  scan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      {scan && (
        <span
          aria-hidden
          className="korban-scan pointer-events-none absolute -top-px left-0 h-px w-[36%]"
          style={{ background: "linear-gradient(90deg,transparent,#F97316,transparent)" }}
        />
      )}
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </h2>
        {right}
      </div>
      <div className="rounded border border-zinc-900 bg-black p-2.5">{children}</div>
    </section>
  );
}

/**
 * One editable detail. Commits on blur or Enter and flashes to confirm - the
 * same signal Estimate Review uses, so "saved" reads identically everywhere.
 */
function DetailField({
  label, value, placeholder, hint, onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [flashKey, setFlashKey] = useState(0);
  const entry = useRef(value);

  useEffect(() => {
    setDraft(value);
    entry.current = value;
  }, [value]);

  function commit() {
    if (draft === entry.current) return;
    onCommit(draft);
    entry.current = draft;
    setFlashKey((key) => key + 1);
  }

  const empty = draft.trim() === "";

  return (
    <div className="grid grid-cols-[132px_1fr] items-center gap-3 border-t border-zinc-900/70 px-1 py-1 first:border-t-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600" title={hint}>
        {label}
      </span>
      <span className="relative flex overflow-hidden rounded">
        {flashKey > 0 && (
          <span
            key={flashKey}
            aria-hidden
            className="korban-flash pointer-events-none absolute inset-y-0 left-0 w-full"
            style={{
              background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.28),transparent)",
            }}
          />
        )}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder={placeholder}
          className={`relative w-full rounded border bg-transparent px-2 py-1 text-[11.5px] outline-none transition placeholder:text-zinc-700 focus:border-orange-500/40 focus:bg-korban-raised ${
            empty ? "border-zinc-900" : "border-transparent"
          } text-zinc-200`}
        />
      </span>
    </div>
  );
}

/** One step of the job, and whether it's been done. */
function Stage({
  done, label, detail, optional, onGo,
}: {
  done: boolean;
  label: string;
  detail: string;
  optional?: boolean;
  onGo: () => void;
}) {
  return (
    <button
      onClick={onGo}
      className={`group grid w-full grid-cols-[16px_1fr_auto] items-center gap-2.5 rounded border px-2 py-1.5 text-left transition ${
        done
          ? "border-zinc-900 bg-korban-raised"
          : optional
          ? "border-zinc-900/60 bg-transparent"
          : "border-orange-500/20 bg-orange-500/[0.03]"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border font-mono text-[9px] font-bold leading-none ${
          done
            ? "border-orange-400 bg-orange-500 text-black"
            : optional
            ? "border-zinc-800 text-zinc-800"
            : "border-orange-500/40 text-transparent"
        }`}
      >
        {done ? "\u2713" : ""}
      </span>
      <span className="min-w-0">
        <span className={`block text-[11.5px] ${done ? "text-zinc-300" : optional ? "text-zinc-600" : "text-zinc-200"}`}>
          {label}
        </span>
        <span className="block font-mono text-[9px] text-zinc-600">{detail}</span>
      </span>
      <span className="font-mono text-[10px] text-zinc-700 transition group-hover:text-orange-400">
        {done ? "review" : optional ? "" : "go"}
      </span>
    </button>
  );
}

/**
 * A reserved slot for a drawing. Empty bays are deliberate - they show what
 * this job will hold once the work is done, so the page reads as a project
 * taking shape rather than a page with things missing.
 */
function ViewBay({
  label, ready, note, onOpen,
}: {
  label: string;
  ready: boolean;
  note: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={ready ? onOpen : undefined}
      disabled={!ready}
      className={`group flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded border transition ${
        ready
          ? "border-orange-500/30 bg-orange-500/[0.04] hover:border-orange-500/60 hover:bg-orange-500/[0.08]"
          : "cursor-default border-dashed border-zinc-800 bg-transparent"
      }`}
    >
      <span
        className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${
          ready ? "text-orange-300" : "text-zinc-700"
        }`}
      >
        {label}
      </span>
      <span className="px-2 text-center font-mono text-[9px] leading-[1.4] text-zinc-600">
        {note}
      </span>
      {ready && (
        <span className="font-mono text-[9px] text-zinc-600 transition group-hover:text-orange-400">
          open
        </span>
      )}
    </button>
  );
}

function Rolling({ value }: { value: number }) {
  const rolled = useRollingNumber(value);
  return <>{Math.round(rolled).toLocaleString()}</>;
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-900/70 py-1">
      <span className="text-[10.5px] text-zinc-500">{label}</span>
      <span className="font-mono text-[12px] font-bold text-zinc-200">
        {value > 0 ? value.toLocaleString() : <span className="text-zinc-700">-</span>}
      </span>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-900/70 py-1">
      <span className="text-[10.5px] text-zinc-500">{label}</span>
      <span className="font-mono text-[12px] font-bold text-orange-300">
        {value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

function formatWhen(iso: string) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}
