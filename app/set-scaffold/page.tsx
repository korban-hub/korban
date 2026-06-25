"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanHeaderMeta,
  type KorbanMenuLink,
} from "@/components/korban";
import {
  calculateQuantityEngine,
  getActiveElevation,
  getActiveProject,
  saveActiveElevation,
  type ProjectElevation,
  type ScaffoldInput,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

type ScaffoldWidth = "3'" | "3'-6\"" | "5'";
type PlankType = "Wood" | "Aluminum" | "Steel";

const projectInfo = {
  projectName: "Mare Island Apartments",
  jobNumber: "KRB-260614-001",
  reference: "Main Level Reference Point A-1",
};

type PlanPoint = { x: number; y: number };

// Fallback placeholder outline — shown when no real takeoff data exists
const currentLevelOutline: PlanPoint[] = [
  { x: 250, y: 150 }, { x: 835, y: 150 }, { x: 835, y: 230 },
  { x: 770, y: 230 }, { x: 770, y: 300 }, { x: 910, y: 300 },
  { x: 910, y: 505 }, { x: 805, y: 505 }, { x: 805, y: 575 },
  { x: 350, y: 575 }, { x: 350, y: 520 }, { x: 215, y: 520 },
  { x: 215, y: 345 }, { x: 165, y: 345 }, { x: 165, y: 230 },
  { x: 250, y: 230 },
];

const runSummary = [
  { label: "North Run", lf: "180'-0\"", bays: 18, legs: 19 },
  { label: "East Return", lf: "68'-0\"", bays: 7, legs: 8 },
  { label: "South Run", lf: "162'-0\"", bays: 17, legs: 18 },
  { label: "West Run", lf: "72'-0\"", bays: 8, legs: 9 },
];

const scaffoldMenuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/takeoff-workspace", label: "Takeoff Workspace" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

// ── Utility ──────────────────────────────────────────────────────────────────

function parseFeetValue(value: string): number {
  if (!value) return 0;
  // Handle feet-inches format: "3'-6\"" → 3.5, "5'" → 5, "10'" → 10
  const feetInchMatch = value.match(/^(\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?)(?:")?)?$/);
  if (feetInchMatch) {
    const feet = Number(feetInchMatch[1]);
    const inches = Number(feetInchMatch[2] || 0);
    return feet + inches / 12;
  }
  // Plain number fallback
  const plain = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(plain) ? plain : 0;
}

function formatScaffoldWidth(value: number): ScaffoldWidth {
  if (value >= 5) return "5'";
  if (value >= 3.5) return "3'-6\"";
  return "3'";
}

function parseFeetInches(input: string): number | null {
  const value = input.trim();
  if (!value || value === "--" || value === "0'") return null;
  const normalized = value.toLowerCase()
    .replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"')
    .replace(/\s+/g, "").replace(/[–—]/g, "-");
  const m = normalized.match(/^(-?\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?))?(?:")?$/);
  if (m) {
    const feet = Number(m[1]); const inches = Number(m[2] || 0);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }
  const plain = Number(normalized.replace(/"/g, ""));
  return Number.isNaN(plain) || plain === 0 ? null : plain;
}

function isFiniteNumber(v: number) { return Number.isFinite(v); }
function isFinitePoint(p: PlanPoint) { return isFiniteNumber(p.x) && isFiniteNumber(p.y); }

function segLen(a: PlanPoint, b: PlanPoint) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Outward normal (left-hand rule for CCW polygon = outward)
function outwardNormal(a: PlanPoint, b: PlanPoint): PlanPoint {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };
  return { x: dy / len, y: -dx / len };
}

function getFrameTallForPoint(
  point: PlanPoint,
  allPoints: PlanPoint[],
  elevationHeights: Array<{ elevation: string; overallHeightInput: string; belowGradeEnabled: boolean; belowGradeInput: string }>,
  frameHeight: number,
  workerReachHeight: number,
  defaultFrameTall: number,
): number {
  if (!allPoints.length || !elevationHeights.length) return defaultFrameTall;
  const minX = Math.min(...allPoints.map(p => p.x));
  const maxX = Math.max(...allPoints.map(p => p.x));
  const minY = Math.min(...allPoints.map(p => p.y));
  const maxY = Math.max(...allPoints.map(p => p.y));
  const dN = Math.abs(point.y - minY), dS = Math.abs(point.y - maxY);
  const dW = Math.abs(point.x - minX), dE = Math.abs(point.x - maxX);
  const minD = Math.min(dN, dS, dW, dE);
  let elevName = "North";
  if (minD === dS) elevName = "South";
  else if (minD === dE) elevName = "East";
  else if (minD === dW) elevName = "West";
  const elev = elevationHeights.find(e => e.elevation === elevName);
  if (!elev) return defaultFrameTall;
  const base = parseFeetInches(elev.overallHeightInput) ?? 0;
  const below = elev.belowGradeEnabled ? parseFeetInches(elev.belowGradeInput) ?? 0 : 0;
  const wallHeight = base + below;
  if (wallHeight <= 0) return defaultFrameTall;
  return Math.ceil((wallHeight - workerReachHeight) / frameHeight);
}

// ── Scaffold run computation — Rule Set v3.0 ─────────────────────────────────
//
// Returns an array of leg positions (SVG coordinates) for a single wall segment.
// Each leg is perpendicular to the wall and offset 1' outward from the wall face.
//
// Rules applied (all distances in SVG pixels, converted from feet via pageUnitsPerFoot):
//   RULE 0  — Every tick 1' offset from wall face
//   RULE 1  — First leg at scaffoldWidth + 1' from start corner
//   RULE 1b — Turnaround: first/last offset legs get inner mirror at scaffoldWidth distance
//   RULE 2  — Maximize full bays; short bay at end always gets a tick
//             Max gap from last leg to end corner = 8'; if >8' place one more leg
//             If short remainder can't reach scaffoldWidth+1' offset → leg at corner itself
//   RULE 7  — Always maximize full standard bays first

type LegResult = {
  wallPoint: PlanPoint;   // point on wall face
  tickCenter: PlanPoint;  // 1' offset outward
  labelPoint: PlanPoint;  // further offset for frame count label
  isTurnaroundMirror: boolean; // is this the inner mirror leg of a turnaround bay?
  isStartLeg: boolean;
  isEndLeg: boolean;
};

function computeSegmentLegs(
  start: PlanPoint,
  end: PlanPoint,
  scaffoldWidthFt: number,
  bayLengthFt: number,
  pageUnitsPerFoot: number,
  turnaroundOn: boolean,
  wallOffsetFt: number = 1,
): LegResult[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segLengthPx = Math.sqrt(dx * dx + dy * dy);
  if (!isFiniteNumber(segLengthPx) || segLengthPx <= 0) return [];

  const along = { x: dx / segLengthPx, y: dy / segLengthPx };
  const normal = { x: dy / segLengthPx, y: -dx / segLengthPx }; // outward normal

  // Convert real-world feet to SVG pixels
  const puf = pageUnitsPerFoot;
  const startOffsetPx = (scaffoldWidthFt + 1) * puf;    // Rule 1: scaffoldWidth + 1'
  const bayLengthPx = bayLengthFt * puf;
  const maxEndGapPx = 8 * puf;                           // Rule 2: max 8' gap to end
  const wallOffsetPx = wallOffsetFt * puf;               // Rule 0: 1' from wall
  const turnaroundMirrorPx = scaffoldWidthFt * puf;      // Rule 1b: mirror at scaffoldWidth
  const labelOffsetPx = wallOffsetPx + 9;                // label slightly further out

  const legs: LegResult[] = [];

  function makeLeg(distAlongWall: number, isTurnaroundMirror = false, isStart = false, isEnd = false): LegResult {
    const wp = { x: start.x + along.x * distAlongWall, y: start.y + along.y * distAlongWall };
    const tc = { x: wp.x + normal.x * wallOffsetPx, y: wp.y + normal.y * wallOffsetPx };
    const lp = { x: wp.x + normal.x * labelOffsetPx, y: wp.y + normal.y * labelOffsetPx };
    return { wallPoint: wp, tickCenter: tc, labelPoint: lp, isTurnaroundMirror, isStartLeg: isStart, isEndLeg: isEnd };
  }

  // ── RULE 1: First leg at scaffoldWidth + 1' from start ──────────────────
  // If segment is too short to even place the first leg, place it at 0 (corner)
  const firstLegDist = Math.min(startOffsetPx, segLengthPx);
  legs.push(makeLeg(firstLegDist, false, true, false));

  // Rule 1b: turnaround mirror for start leg (inner leg toward building)
  if (turnaroundOn && firstLegDist + turnaroundMirrorPx <= segLengthPx) {
    legs.push(makeLeg(firstLegDist + turnaroundMirrorPx, true, false, false));
  }

  // ── RULE 7 + 2: Bay distribution from first leg toward end ──────────────
  // Maximize full bays, then assess short bay
  let cursor = firstLegDist + bayLengthPx;

  while (cursor < segLengthPx) {
    const distToEnd = segLengthPx - cursor;

    if (distToEnd <= 0) break;

    // Rule 2: if remaining distance after this leg would be > 8', we need another leg
    // Place this leg, continue
    if (distToEnd > maxEndGapPx) {
      // Still more than 8' remaining after placing here — place leg and continue
      legs.push(makeLeg(cursor));
      cursor += bayLengthPx;
    } else {
      // Within 8' of end — this is the last interior leg
      legs.push(makeLeg(cursor));
      break;
    }
  }

  // ── End leg: closing the run ─────────────────────────────────────────────
  // Determine where the end leg goes
  const lastPlacedDist = legs.filter(l => !l.isTurnaroundMirror).slice(-1)[0];
  const lastDist = lastPlacedDist ? Math.sqrt(
    (lastPlacedDist.wallPoint.x - start.x) ** 2 +
    (lastPlacedDist.wallPoint.y - start.y) ** 2
  ) : firstLegDist;

  const remainingToEnd = segLengthPx - lastDist;

  // Only add end leg if it's meaningfully different from the last placed leg
  if (remainingToEnd > bayLengthPx * 0.15) {
    // Rule 2: end leg placement
    // Can we fit scaffoldWidth+1' offset from end?
    const endLegIdealDist = segLengthPx - startOffsetPx;

    if (endLegIdealDist > lastDist + bayLengthPx * 0.15) {
      // Enough room for proper offset end leg
      legs.push(makeLeg(endLegIdealDist, false, false, true));
    } else {
      // Short bay — place at segment end (corner point)
      legs.push(makeLeg(segLengthPx, false, false, true));
    }

    // Rule 1b: turnaround mirror for end leg
    if (turnaroundOn) {
      const endLegActualDist = endLegIdealDist > lastDist + bayLengthPx * 0.15
        ? endLegIdealDist
        : segLengthPx;
      const mirrorDist = endLegActualDist - turnaroundMirrorPx;
      if (mirrorDist > lastDist + bayLengthPx * 0.1) {
        legs.push(makeLeg(mirrorDist, true, false, false));
      }
    }
  }

  return legs.filter(l => isFinitePoint(l.tickCenter) && isFinitePoint(l.wallPoint));
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SetScaffoldPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scaffoldWidth, setScaffoldWidth] = useState<ScaffoldWidth>("3'");
  const [plankType, setPlankType] = useState<PlankType>("Wood");
  const [standardBayLength, setStandardBayLength] = useState("10'");
  const [turnaroundBays, setTurnaroundBays] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showScaffold, setShowScaffold] = useState(true);
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState(projectInfo.projectName);

  const frameHeight = 6 + 4 / 12;
  const workerReachHeight = getBackendSettings().scaffold.workerReachHeight ?? 6;
  const frameHeightCount = activeElevationData?.quantityEngine.frameTall ?? 7;

  // pageUnitsPerFoot — from scale calibration in Takeoff Workspace
  // If not set, Set Scaffold is locked (scale required before proceeding)
  const pageUnitsPerFoot = activeElevationData?.scale?.pageUnitsPerFoot ?? null;
  const scaleIsSet = pageUnitsPerFoot != null && pageUnitsPerFoot > 0;

  const storedOverlayRows = useMemo(
    () => getScaledOverlayRows(activeElevationData, 1200, 720, 110),
    [activeElevationData],
  );
  const storedReferencePoints = useMemo(
    () => getScaledReferencePoints(activeElevationData, 1200, 720, 110),
    [activeElevationData],
  );
  const storedScaffoldOutline = useMemo(
    () => getScaledPrimaryOutline(activeElevationData, 1200, 720, 110),
    [activeElevationData],
  );
  const scaffoldOutline = storedScaffoldOutline ?? currentLevelOutline;
  const isUsingFallbackGeometry = !storedScaffoldOutline;

  const storedElevationHeights = useMemo(() => {
    return activeElevationData?.overlayGeometry?.elevationHeights ?? [];
  }, [activeElevationData]);

  // Scaffold width in feet
  const scaffoldWidthFt = useMemo(() => parseFeetValue(scaffoldWidth), [scaffoldWidth]);
  const bayLengthFt = useMemo(() => parseFeetValue(standardBayLength) || 10, [standardBayLength]);

  // Plank per level by width
  const plankCountPerBay = useMemo(() => {
    if (scaffoldWidth === "5'") return 6;
    if (scaffoldWidth === "3'-6\"") return 4;
    return 3;
  }, [scaffoldWidth]);

  // ── Compute all legs via Rule Set v3.0 ────────────────────────────────────
  // Uses real pageUnitsPerFoot if available, otherwise falls back to SVG-unit estimation
  const allSegmentLegs = useMemo(() => {
    if (!scaleIsSet || !scaffoldOutline.length) return [];
    const puf = pageUnitsPerFoot!;
    const results: { segIndex: number; legs: LegResult[] }[] = [];

    for (let i = 0; i < scaffoldOutline.length; i++) {
      const start = scaffoldOutline[i];
      const end = scaffoldOutline[(i + 1) % scaffoldOutline.length];
      const legs = computeSegmentLegs(start, end, scaffoldWidthFt, bayLengthFt, puf, turnaroundBays);
      results.push({ segIndex: i, legs });
    }
    return results;
  }, [scaffoldOutline, scaffoldWidthFt, bayLengthFt, turnaroundBays, scaleIsSet, pageUnitsPerFoot]);

  // ── Quantities derived from actual rendered legs (Rule Q3) ────────────────
  const totals = useMemo(() => {
    if (!scaleIsSet) {
      // Fall back to formula-based when scale not set
      const bayCount = activeElevationData?.quantityEngine.bayCount ?? runSummary.reduce((s, r) => s + r.bays, 0);
      const legCount = activeElevationData?.quantityEngine.legCount ?? runSummary.reduce((s, r) => s + r.legs, 0);
      const frames = legCount * frameHeightCount;
      const planks = bayCount * plankCountPerBay * frameHeightCount;
      const braces = activeElevationData?.quantityEngine.crossBraceCount ?? Math.max(0, bayCount - 5);
      return { bays: bayCount, legs: legCount, frames, planks, braces };
    }

    // Count actual rendered legs (excluding turnaround mirror legs for frame count)
    const structuralLegs = allSegmentLegs.flatMap(s => s.legs.filter(l => !l.isTurnaroundMirror));
    const allLegs = allSegmentLegs.flatMap(s => s.legs);
    const legCount = allLegs.length;

    // Bay count = structural legs - 1 per segment (each segment: legs - 1 = bays)
    let bayCount = 0;
    for (const seg of allSegmentLegs) {
      const structLegsInSeg = seg.legs.filter(l => !l.isTurnaroundMirror).length;
      if (structLegsInSeg > 1) bayCount += structLegsInSeg - 1;
    }

    const frames = legCount * frameHeightCount;
    const planks = bayCount * plankCountPerBay * frameHeightCount;
    const braces = Math.max(0, bayCount - scaffoldOutline.length);

    return { bays: bayCount, legs: legCount, frames, planks, braces };
  }, [allSegmentLegs, frameHeightCount, plankCountPerBay, scaleIsSet, activeElevationData, scaffoldOutline.length]);

  useEffect(() => {
    function loadActiveElevation() {
      const elevation = getActiveElevation();
      const project = getActiveProject();
      setActiveElevationData(elevation);
      setActiveProjectName(project.projectName || projectInfo.projectName);
      setScaffoldWidth(formatScaffoldWidth(elevation.scaffoldInput.scaffoldWidth));
      setStandardBayLength(`${elevation.scaffoldInput.standardBayLength}'`);
    }
    loadActiveElevation();
    window.addEventListener("focus", loadActiveElevation);
    window.addEventListener("pageshow", loadActiveElevation);
    return () => {
      window.removeEventListener("focus", loadActiveElevation);
      window.removeEventListener("pageshow", loadActiveElevation);
    };
  }, []);

  function saveScaffoldInput(updates: Partial<ScaffoldInput>) {
    const current = activeElevationData ?? getActiveElevation();
    const scaffoldInput = { ...current.scaffoldInput, ...updates };
    const quantityEngine = calculateQuantityEngine({
      linearFeet: current.linearFeet,
      wallHeight: current.wallHeight,
      ...scaffoldInput,
      workerReachHeight: getBackendSettings().scaffold.workerReachHeight,
    });
    const nextElevation = {
      ...current, scaffoldInput, quantityEngine,
      sectionView: { ...current.sectionView, wallOffset: scaffoldInput.wallOffset },
    };
    setActiveElevationData(nextElevation);
    saveActiveElevation(nextElevation);
  }

  function updateScaffoldWidth(value: ScaffoldWidth) {
    setScaffoldWidth(value);
    saveScaffoldInput({ scaffoldWidth: parseFeetValue(value) });
  }

  function updateStandardBayLength(value: string) {
    setStandardBayLength(value);
    saveScaffoldInput({ standardBayLength: parseFeetValue(value) || 10 });
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanHeader
        title="Set Scaffold"
        subtitle="Combined overlay to scaffold bay layout"
        menuLinks={scaffoldMenuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(c => !c)}
        actionsClassName="gap-4"
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={activeProjectName} />
            <KorbanHeaderMeta label="Job No." value={projectInfo.jobNumber} />
            <KorbanHeaderMeta label="Reference" value={projectInfo.reference} />
            <KorbanButton as="a" href="/project-plan-desk" variant="ghost">Project Plan Desk</KorbanButton>
            <KorbanButton as="a" href="/frame-configuration" variant="primary">Save & Continue</KorbanButton>
          </>
        }
      />

      <section className="grid h-[calc(100vh-125px)] grid-cols-[minmax(0,1fr)_400px]">
        {/* Canvas */}
        <section className="relative overflow-hidden border-r border-orange-500/20 bg-black">

          {/* Scale lock overlay — blocks canvas when scale not set */}
          {!scaleIsSet && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
              <div className="rounded-[2rem] border border-yellow-500/40 bg-yellow-500/10 p-10 text-center shadow-2xl">
                <div className="mb-4 text-4xl">⚠</div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-300">Scale Not Set</p>
                <p className="mt-3 max-w-xs text-xs leading-5 text-zinc-400">
                  Scale must be calibrated in Takeoff Workspace before scaffold layout can be generated. Return to Takeoff Workspace and set your scale first.
                </p>
                <a
                  href="/takeoff-workspace"
                  className="mt-6 inline-block rounded-xl bg-yellow-400 px-6 py-3 text-xs font-bold text-black hover:bg-yellow-300"
                >
                  Go to Takeoff Workspace →
                </a>
              </div>
            </div>
          )}

          <div className="absolute left-6 top-5 z-20 flex flex-wrap items-center gap-3">
            <StatusPill label="Overlay" active={showOverlay} onClick={() => setShowOverlay(c => !c)} />
            <StatusPill label="Scaffold" active={showScaffold} onClick={() => setShowScaffold(c => !c)} />
            <StatusPill label="Frame Tall" value={String(frameHeightCount)} />
            <StatusPill
              label="Turnaround"
              active={turnaroundBays}
              onClick={() => setTurnaroundBays(c => !c)}
              value={turnaroundBays ? "ON" : "OFF"}
            />
            <StatusPill
              label="Scale"
              active={scaleIsSet}
              value={scaleIsSet ? "Calibrated" : "Not Set"}
            />
            {isUsingFallbackGeometry && (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs font-bold text-yellow-300">
                ⚠ Placeholder shape — trace Full Overlay in Takeoff Workspace
              </div>
            )}
          </div>

          <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:36px_36px]" />

          <div className="absolute inset-0 flex items-center justify-center p-10">
            <div className="relative h-full w-full max-w-[1220px] rounded-[2rem] border border-zinc-800 bg-[#050505] shadow-2xl">
              <svg viewBox="0 0 1200 720" className="h-full w-full">
                <GridAxisLabels />
                <CompassLabels />

                {showOverlay && (
                  storedOverlayRows.length ? (
                    <StoredTakeoffOverlay rows={storedOverlayRows} referencePoints={storedReferencePoints} />
                  ) : (
                    <g>
                      <path
                        d="M250 150 L835 150 L835 230 L770 230 L770 300 L910 300 L910 505 L805 505 L805 575 L350 575 L350 520 L215 520 L215 345 L165 345 L165 230 L250 230 Z"
                        fill="transparent" stroke="#2563eb" strokeWidth="0.7" strokeLinejoin="miter"
                      />
                      <path
                        d="M280 180 L790 180 L790 250 L735 250 L735 322 L872 322 L872 475 L775 475 L775 540 L385 540 L385 490 L250 490 L250 318 L198 318 L198 258 L280 258 Z"
                        fill="transparent" stroke="#22c55e" strokeWidth="0.6" strokeLinejoin="miter" opacity="0.9"
                      />
                    </g>
                  )
                )}

                {showScaffold && scaleIsSet && (
                  <g className="scaffold-plan">
                    <ScaffoldRunTicks
                      segmentLegs={allSegmentLegs}
                      points={scaffoldOutline}
                      elevationHeights={storedElevationHeights}
                      frameHeight={frameHeight}
                      workerReachHeight={workerReachHeight}
                      frameTall={frameHeightCount}
                    />
                  </g>
                )}
              </svg>

              {/* Project info — bottom left */}
              <div className="absolute bottom-5 left-5 z-20 space-y-2">
                {/* Overlay legend */}
                <div className="rounded-2xl border border-zinc-800 bg-black/85 px-4 py-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Overlay</p>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-px w-8 bg-[#2563eb]" />
                    <span className="text-[10px] text-zinc-400">Current Level</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-px w-8 bg-[#22c55e]" />
                    <span className="text-[10px] text-zinc-400">Level Below</span>
                  </div>
                </div>
                {/* Project bubble */}
                <div className="rounded-2xl border border-zinc-800 bg-black/85 px-4 py-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Project</p>
                  <p className="mt-1 text-sm font-bold text-zinc-200">{activeProjectName}</p>
                  <p className="mt-1 font-mono text-[11px] text-orange-300">
                    {projectInfo.jobNumber}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-5 right-5 flex gap-2">
                <ViewerTool label="Regenerate" />
                <ViewerTool label="Edit Bay" />
                <ViewerTool label="Save Layout" primary />
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="overflow-y-auto bg-[#080604] p-4">
          <Panel title="Backend Takeoff Info" subtitle="Current scaffold defaults">
            <ControlLabel label="Frame Width">
              <select value={scaffoldWidth} onChange={e => updateScaffoldWidth(e.target.value as ScaffoldWidth)} className="control-input">
                <option>3'</option>
                <option>3'-6"</option>
                <option>5'</option>
              </select>
            </ControlLabel>
            <ControlLabel label="Plank Count / Width">
              <input className="control-input" readOnly value={plankCountPerBay} />
            </ControlLabel>
            <ControlLabel label="Plank Type">
              <select value={plankType} onChange={e => setPlankType(e.target.value as PlankType)} className="control-input">
                <option>Wood</option>
                <option>Aluminum</option>
                <option>Steel</option>
              </select>
            </ControlLabel>
            <ControlLabel label="Standard Bay Length">
              <input value={standardBayLength} onChange={e => updateStandardBayLength(e.target.value)} className="control-input" />
            </ControlLabel>
            <button
              onClick={() => setTurnaroundBays(c => !c)}
              className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                turnaroundBays ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-black text-zinc-500"
              }`}
            >
              <div>
                <span className="text-xs font-bold">Turnaround Bays</span>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {turnaroundBays ? "ON — double legs at all offset corners" : "OFF — single leg at offset corners"}
                </p>
              </div>
              <span className="font-mono text-xs font-bold">{turnaroundBays ? "ON" : "OFF"}</span>
            </button>
            <ControlLabel label="Frame Height Count">
              <input className="control-input" readOnly value={frameHeightCount} />
            </ControlLabel>
            <ControlLabel label="Scale">
              <input
                className="control-input"
                readOnly
                value={(() => {
                  if (!scaleIsSet) return "Not calibrated — set in Takeoff Workspace";
                  const puf = pageUnitsPerFoot!;
                  const inchesPerFoot = puf / 72;
                  if (Math.abs(inchesPerFoot - 0.125) < 0.02) return "1/8\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.25) < 0.02) return "1/4\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.1875) < 0.02) return "3/16\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.0625) < 0.02) return "1/16\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.5) < 0.02) return "1/2\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.375) < 0.02) return "3/8\" = 1'";
                  if (Math.abs(inchesPerFoot - 0.0833) < 0.015) return "1\" = 12'";
                  const ratio = Math.round(12 / inchesPerFoot);
                  return `1\" = ${ratio}'`;
                })()}
                style={{ color: scaleIsSet ? undefined : "#ef4444" }}
              />
            </ControlLabel>
          </Panel>

          <Panel title="Scaffold Quantities" subtitle="Derived from rendered scaffold legs">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 shadow-[0_0_18px_rgba(249,115,22,0.08)]">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Total Frames</p>
                <p className="mt-1 font-mono text-lg font-bold text-orange-300">{totals.frames.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 shadow-[0_0_18px_rgba(249,115,22,0.08)]">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Total Planks</p>
                <p className="mt-1 font-mono text-lg font-bold text-orange-300">{totals.planks.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-2">
              <QuantityRow label="Total Lineal Ft" value={`${(activeElevationData?.linearFeet ?? 482).toLocaleString()} LF`} />
              <QuantityRow label="Standard Bays" value={totals.bays.toLocaleString()} />
              <QuantityRow label="Total Legs" value={totals.legs.toLocaleString()} />
              <QuantityRow label="Frames Tall" value={String(frameHeightCount)} />
              <QuantityRow label="Cross Braces" value={totals.braces.toLocaleString()} />
              <QuantityRow label="Plank Type" value={plankType} />
              <QuantityRow label="Planks / Level" value={String(plankCountPerBay)} />
            </div>
            <div className="mt-4 space-y-2">
              {activeElevationData ? (
                <div className="rounded-2xl border border-zinc-800 bg-black p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-300">{activeElevationData.elevationName} Run</p>
                    <p className="font-mono text-xs text-orange-300">{activeElevationData.linearFeet.toLocaleString()} LF</p>
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    {totals.bays} Bays · {totals.legs} Legs
                  </p>
                </div>
              ) : (
                runSummary.map(run => (
                  <div key={run.label} className="rounded-2xl border border-zinc-800 bg-black p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-zinc-300">{run.label}</p>
                      <p className="font-mono text-xs text-orange-300">{run.lf}</p>
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                      {run.bays} Bays · {run.legs} Legs
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Next Step" subtitle="Move scaffold layout into section design">
            <div className="grid gap-2">
              <a href="/project-plan-desk" className="next-link">Return To Project Plan Desk</a>
              <a href="/frame-configuration" className="next-link-primary">Save & Continue</a>
            </div>
          </Panel>
        </aside>
      </section>

      <style jsx global>{`
        .control-input {
          width: 100%; border-radius: 0.9rem; border: 1px solid rgb(39 39 42);
          background: #000; padding: 0.75rem 0.9rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.8rem; font-weight: 800; color: rgb(253 186 116); outline: none;
        }
        .control-input:focus { border-color: rgba(249, 115, 22, 0.55); }
        .next-link, .next-link-primary {
          display: block; border-radius: 0.9rem; padding: 0.9rem 1rem;
          text-align: center; font-size: 0.8rem; font-weight: 800;
        }
        .next-link { border: 1px solid rgb(39 39 42); background: #000; color: rgb(212 212 216); }
        .next-link-primary { background: rgb(249 115 22); color: #000; }
      `}</style>
    </main>
  );
}

// ── ScaffoldRunTicks — renders pre-computed leg results ───────────────────────
function ScaffoldRunTicks({
  segmentLegs,
  points,
  elevationHeights,
  frameHeight,
  workerReachHeight,
  frameTall,
}: {
  segmentLegs: { segIndex: number; legs: LegResult[] }[];
  points: PlanPoint[];
  elevationHeights: Array<{ elevation: string; overallHeightInput: string; belowGradeEnabled: boolean; belowGradeInput: string }>;
  frameHeight: number;
  workerReachHeight: number;
  frameTall: number;
}) {
  const tickLength = 10;

  function getLocalFrameTall(point: PlanPoint): number {
    if (elevationHeights.length === 0) return frameTall;
    return getFrameTallForPoint(point, points, elevationHeights, frameHeight, workerReachHeight, frameTall);
  }

  return (
    <g fill="#f8fafc" stroke="#f8fafc" strokeLinecap="square" opacity="0.9">
      {segmentLegs.map(({ segIndex, legs }) => {
        if (legs.length === 0) return null;

        const segStart = points[segIndex];
        const segEnd = points[(segIndex + 1) % points.length];
        if (!segStart || !segEnd) return null;

        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const normal = len > 0 ? { x: dy / len, y: -dx / len } : { x: 0, y: -1 };

        const structuralLegs = legs.filter(l => !l.isTurnaroundMirror);

        return (
          <g key={`seg-${segIndex}`}>
            {/* Diagonal cross-braces between consecutive structural legs */}
            {structuralLegs.slice(0, -1).map((leg, i) => {
              const next = structuralLegs[i + 1];
              const cx = (leg.tickCenter.x + next.tickCenter.x) / 2;
              const cy = (leg.tickCenter.y + next.tickCenter.y) / 2;
              const along = { x: dx / len, y: dy / len };
              const bayPx = Math.sqrt((next.wallPoint.x - leg.wallPoint.x) ** 2 + (next.wallPoint.y - leg.wallPoint.y) ** 2);
              const braceLen = Math.min(14, Math.max(6, bayPx * 0.34));
              const depth = 3;
              return (
                <line
                  key={`brace-${segIndex}-${i}`}
                  x1={cx - along.x * (braceLen / 2) - normal.x * depth}
                  y1={cy - along.y * (braceLen / 2) - normal.y * depth}
                  x2={cx + along.x * (braceLen / 2) + normal.x * depth}
                  y2={cy + along.y * (braceLen / 2) + normal.y * depth}
                  strokeWidth="0.4" opacity="0.34"
                />
              );
            })}

            {/* Tick marks for all legs — identical appearance regardless of type */}
            {legs.map((leg, i) => {
              const localFrameTall = getLocalFrameTall(leg.wallPoint);

              const t1 = {
                x1: leg.tickCenter.x - normal.x * (tickLength / 2),
                y1: leg.tickCenter.y - normal.y * (tickLength / 2),
                x2: leg.tickCenter.x + normal.x * (tickLength / 2),
                y2: leg.tickCenter.y + normal.y * (tickLength / 2),
              };

              if (!isFiniteNumber(t1.x1) || !isFiniteNumber(t1.y1) || !isFiniteNumber(t1.x2) || !isFiniteNumber(t1.y2)) return null;

              return (
                <g key={`leg-${segIndex}-${i}`}>
                  <line x1={t1.x1} y1={t1.y1} x2={t1.x2} y2={t1.y2} strokeWidth="1" />
                  <text
                    x={leg.labelPoint.x} y={leg.labelPoint.y}
                    fontSize="5" fontFamily="monospace" fontWeight="300"
                    opacity="0.62" textAnchor="middle" dominantBaseline="middle"
                  >
                    {localFrameTall}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ── Geometry helpers (unchanged) ─────────────────────────────────────────────

function getPrimaryGeometryPoints(elevation: ProjectElevation | null) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry) return [];
  const keyFullOverlay = geometry.fullOverlayRows.find(row => row.isKeyFloor && row.points.length >= 3);
  const firstFullOverlay = geometry.fullOverlayRows.find(row => row.points.length >= 3);
  if (geometry.tracedPerimeter.length >= 3) return geometry.tracedPerimeter;
  if (geometry.overlayPoints.length >= 3) return geometry.overlayPoints;
  if (keyFullOverlay) return keyFullOverlay.points;
  if (firstFullOverlay) return firstFullOverlay.points;
  if (geometry.elevationPoints.length >= 3) return geometry.elevationPoints;
  return [];
}

function mapGeometryPoints(points: PlanPoint[], width: number, height: number, padding: number) {
  const validPoints = points.filter(isFinitePoint);
  if (validPoints.length < 2) return [];
  const minX = Math.min(...validPoints.map(p => p.x));
  const maxX = Math.max(...validPoints.map(p => p.x));
  const minY = Math.min(...validPoints.map(p => p.y));
  const maxY = Math.max(...validPoints.map(p => p.y));
  const gW = Math.max(1, maxX - minX); const gH = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / gW, (height - padding * 2) / gH);
  const dW = gW * scale; const dH = gH * scale;
  const oX = padding + (width - padding * 2 - dW) / 2;
  const oY = padding + (height - padding * 2 - dH) / 2;
  return validPoints.map(p => ({ x: oX + (p.x - minX) * scale, y: oY + (p.y - minY) * scale }));
}

function getScaledPrimaryOutline(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const points = getPrimaryGeometryPoints(elevation);
  const mapped = mapGeometryPoints(points, width, height, padding);
  return mapped.length >= 3 ? mapped : null;
}

function getScaledOverlayRows(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  const basePoints = getPrimaryGeometryPoints(elevation);
  if (!geometry || basePoints.length < 2) return [];
  const allRows = geometry.fullOverlayRows.filter(row => row.points.length >= 2);
  const fallbackRows = allRows.length
    ? allRows
    : [{ id: 0, isKeyFloor: true, level: geometry.levelName, points: basePoints, closed: basePoints.length >= 3, color: "#2563eb" }];
  const allPoints = fallbackRows.flatMap(row => row.points);
  return fallbackRows.map((row, index) => ({
    id: row.id ?? index, level: row.level, isKeyFloor: Boolean(row.isKeyFloor),
    closed: Boolean(row.closed), color: row.color || (index === 0 ? "#2563eb" : "#22c55e"),
    points: mapGeometryPoints(allPoints.length >= 2 ? row.points : basePoints, width, height, padding),
  })).filter(row => row.points.length >= 2);
}

function getScaledReferencePoints(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry || geometry.referencePoints.length < 1) return [];
  const basePoints = getPrimaryGeometryPoints(elevation);
  const allPoints = [...basePoints, ...geometry.referencePoints];
  const mappedAllPoints = mapGeometryPoints(allPoints, width, height, padding);
  return mappedAllPoints.slice(basePoints.length);
}

function pointsToSvgPath(points: PlanPoint[], closed: boolean) {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return `M${first.x} ${first.y} ${rest.map(p => `L${p.x} ${p.y}`).join(" ")}${closed && points.length >= 3 ? " Z" : ""}`;
}

function StoredTakeoffOverlay({ rows, referencePoints }: {
  rows: Array<{ id: number; level: string; isKeyFloor: boolean; closed: boolean; color: string; points: PlanPoint[] }>;
  referencePoints: PlanPoint[];
}) {
  return (
    <g>
      {rows.map((row, index) => (
        <g key={`${row.id}-${index}`}>
          <path d={pointsToSvgPath(row.points, row.closed)} fill="transparent"
            stroke={row.isKeyFloor ? "#2563eb" : row.color}
            strokeWidth={row.isKeyFloor ? "0.9" : "0.6"} strokeLinejoin="miter"
            opacity={row.isKeyFloor ? 1 : 0.9}
          />
          {row.points.map((point, pi) => (
            <circle key={`${row.id}-pt-${pi}`} cx={point.x} cy={point.y} r="2"
              fill={row.isKeyFloor ? "#60a5fa" : "#22c55e"} opacity="0.75" />
          ))}
        </g>
      ))}
      {referencePoints.map((point, i) => (
        <g key={`ref-${i}`}>
          <line x1={point.x - 5} y1={point.y} x2={point.x + 5} y2={point.y} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
          <line x1={point.x} y1={point.y - 5} x2={point.x} y2={point.y + 5} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
        </g>
      ))}
    </g>
  );
}

function CompassLabels() {
  const style = { fontSize: "13", fontFamily: "monospace", fontWeight: "700", fill: "#f97316", opacity: "0.55" };
  return (
    <g>
      <text x="600" y="72" textAnchor="middle" {...style}>N</text>
      <text x="600" y="700" textAnchor="middle" {...style}>S</text>
      <text x="30" y="365" textAnchor="middle" {...style}>W</text>
      <text x="1170" y="365" textAnchor="middle" {...style}>E</text>
    </g>
  );
}

function GridAxisLabels() {
  const xLabels = Array.from({ length: 21 }, (_, i) => i * 5);
  const yLabels = Array.from({ length: 15 }, (_, i) => i * 5);
  return (
    <g opacity="0.45">
      {xLabels.map((v, i) => (
        <g key={`x-${v}`}>
          <text x={54 + i * 50} y="42" fill="#a1a1aa" fontSize="10" fontFamily="monospace">{v}'</text>
          <line x1={58 + i * 50} y1="49" x2={58 + i * 50} y2="62" stroke="#a1a1aa" strokeWidth="0.7" />
        </g>
      ))}
      {yLabels.map((v, i) => (
        <g key={`y-${v}`}>
          <text x="18" y={76 + i * 38} fill="#a1a1aa" fontSize="10" fontFamily="monospace">{v}'</text>
          <line x1="46" y1={72 + i * 38} x2="60" y2={72 + i * 38} stroke="#a1a1aa" strokeWidth="0.7" />
        </g>
      ))}
    </g>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[1.6rem] border border-zinc-800 bg-korban-raised p-4 shadow-2xl last:mb-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
        </div>
        <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ControlLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function QuantityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-xs font-bold text-zinc-200">{value}</span>
    </div>
  );
}

function StatusPill({ label, value, active, onClick }: { label: string; value?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-2xl border px-4 py-2 text-xs font-bold ${
      active === undefined ? "border-zinc-800 bg-black/80 text-zinc-300"
        : active ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
        : "border-zinc-800 bg-black/80 text-zinc-500"
    }`}>
      {label}
      {value && <span className="ml-2 font-mono text-orange-300">{value}</span>}
    </button>
  );
}

function ViewerTool({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <KorbanButton variant={primary ? "primary" : "ghost"} className="px-3 py-2 text-[10px]">
      {label}
    </KorbanButton>
  );
}
