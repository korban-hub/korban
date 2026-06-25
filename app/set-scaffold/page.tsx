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

// Compute signed area of polygon (positive = CCW in standard math, negative = CW)
// In SVG coords (Y down), positive = CW visually, negative = CCW visually
function signedArea(points: PlanPoint[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

// Returns true if polygon is wound clockwise in SVG space (Y-down)
// Note: in SVG coords (Y increases downward), signedArea > 0 means CCW visually,
// signedArea < 0 means CW visually — opposite of standard math convention
function isClockwiseSVG(points: PlanPoint[]): boolean {
  return signedArea(points) < 0;
}

// Outward normal using polygon winding order.
// In SVG coords (Y increases downward):
//   If polygon is CW (signedArea > 0):  outward = LEFT of travel direction
//   If polygon is CCW (signedArea < 0): outward = RIGHT of travel direction
// This is mathematically guaranteed correct for any simple polygon.
function computeOutwardNormal(
  a: PlanPoint,
  b: PlanPoint,
  polygon: PlanPoint[],
): PlanPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };

  // Right of travel direction (standard CCW outward in math coords)
  const rightNormal = { x:  dy / len, y: -dx / len };
  // Left of travel direction
  const leftNormal  = { x: -dy / len, y:  dx / len };

  if (polygon.length < 3) return rightNormal;

  const area = signedArea(polygon);
  // SVG Y-down: CW polygon has area > 0, CCW has area < 0
  // CW polygon → outward is LEFT of travel
  // CCW polygon → outward is RIGHT of travel
  return area > 0 ? rightNormal : leftNormal;
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

// ── Scaffold Run Algorithm — Rule Set v4.0 ───────────────────────────────────

type LegResult = {
  wallPoint: PlanPoint;
  tickTip: PlanPoint;
  labelPoint: PlanPoint;
  isTurnaroundMirror: boolean;
  isStartLeg: boolean;
  isEndLeg: boolean;
};

const STANDARD_BAY_LENGTHS_FT = [10, 8, 7, 5];
const CROSS_PLANK_MAX_FT = 8; // wing walls ≤ 8' get cross-planked, no independent run
const ANGLE_SNAP_THRESHOLD_DEG = 5; // snap to 90° if within this many degrees

// Snap a direction vector to nearest 90° if close enough
function snapNormal(normal: PlanPoint): PlanPoint {
  const angle = Math.atan2(normal.y, normal.x);
  const snapAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI];
  let closest = snapAngles[0];
  let minDiff = Math.abs(angle - snapAngles[0]);
  for (const a of snapAngles) {
    const diff = Math.abs(angle - a);
    if (diff < minDiff) { minDiff = diff; closest = a; }
  }
  const thresholdRad = (ANGLE_SNAP_THRESHOLD_DEG * Math.PI) / 180;
  if (minDiff < thresholdRad) {
    return { x: Math.round(Math.cos(closest)), y: Math.round(Math.sin(closest)) };
  }
  return normal;
}

// Snap along direction to nearest 90°
function snapAlong(along: PlanPoint): PlanPoint {
  return snapNormal(along);
}

// Detect inside corners (re-entrant) using cross product
// Returns array of booleans — true = inside corner (re-entrant) at that vertex
function detectInsideCorners(polygon: PlanPoint[]): boolean[] {
  const n = polygon.length;
  const area = signedArea(polygon);
  const isCW = area > 0; // CW in SVG Y-down space

  return polygon.map((_, i) => {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    // Cross product z-component
    const cross = d1x * d2y - d1y * d2x;
    // For CW polygon in SVG (area > 0): re-entrant = cross < 0 (turns right)
    // For CCW polygon in SVG (area < 0): re-entrant = cross > 0 (turns left)
    return isCW ? cross > 0 : cross < 0;
  });
}

function computeSegmentLegs(
  start: PlanPoint,
  end: PlanPoint,
  segIndex: number,
  scaffoldWidthFt: number,
  bayLengthFt: number,
  pageUnitsPerFoot: number,
  turnaroundOn: boolean,
  polygon: PlanPoint[],
  insideCorners: boolean[],
): LegResult[] {
  const rawDx = end.x - start.x;
  const rawDy = end.y - start.y;
  const segLengthPx = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
  if (!isFiniteNumber(segLengthPx) || segLengthPx <= 0) return [];

  const puf = pageUnitsPerFoot;

  // Snap along direction to avoid skewed ticks on nearly-axis-aligned walls
  const rawAlong = { x: rawDx / segLengthPx, y: rawDy / segLengthPx };
  const along = snapAlong(rawAlong);

  const rawNormal = computeOutwardNormal(start, end, polygon.length >= 3 ? polygon : [start, end]);
  const normal = snapNormal(rawNormal);

  const bayPx        = bayLengthFt * puf;
  const wallGapPx    = 1 * puf;               // 1' gap from wall face to start of tick
  const tickLengthPx = scaffoldWidthFt * puf; // tick = scaffold width long
  const labelOffPx   = wallGapPx + tickLengthPx + puf * 0.6;
  const cornerOffPx  = (scaffoldWidthFt + 1) * puf; // 4' for 3' scaffold

  // Check if end corners are inside corners — if so, stop run 1' before
  const n = polygon.length;
  const startCornerIsInside = insideCorners[segIndex];
  const endCornerIsInside   = insideCorners[(segIndex + 1) % n];

  // Effective run end — stop 1' (wallGapPx) before inside end corner
  const runEndPx = endCornerIsInside
    ? segLengthPx - wallGapPx
    : segLengthPx;

  // Wing wall cross-plank check — skip short walls entirely
  const segLengthFt = segLengthPx / puf;
  if (segLengthFt <= CROSS_PLANK_MAX_FT) return [];

  function makeLeg(distAlongWall: number, isMirror = false, isStart = false, isEnd = false): LegResult {
    const wp = {
      x: start.x + along.x * distAlongWall,
      y: start.y + along.y * distAlongWall,
    };
    const tickStart = { x: wp.x + normal.x * wallGapPx,                  y: wp.y + normal.y * wallGapPx };
    const tickTip   = { x: wp.x + normal.x * (wallGapPx + tickLengthPx), y: wp.y + normal.y * (wallGapPx + tickLengthPx) };
    const lp        = { x: wp.x + normal.x * labelOffPx,                 y: wp.y + normal.y * labelOffPx };
    return { wallPoint: tickStart, tickTip, labelPoint: lp, isTurnaroundMirror: isMirror, isStartLeg: isStart, isEndLeg: isEnd };
  }

  const legs: LegResult[] = [];

  // ── START TICK placement ──────────────────────────────────────────────────
  // Case A: Normal outside corner OR inside corner gap >= 3'
  //   → place start tick scaffoldWidth+1' BEFORE the start corner
  //   → first bay tick is startTick + 10' (so 10' from start tick, never >10' bay)
  //
  // Case B: Inside corner with gap < 3' (tight notch)
  //   → skip start tick entirely
  //   → begin run at dist=0 (the corner) with 1' clearance, then 10' bays

  const startCornerTightNotch = startCornerIsInside && (cornerOffPx / puf < 3);
  let runCursorPx: number;

  if (startCornerTightNotch) {
    // Case B: tight inside corner — no start tick, begin bays from corner
    runCursorPx = 0;
  } else {
    // Case A: place start tick before corner, first bay is 10' from start tick
    legs.push(makeLeg(-cornerOffPx, false, true, false));
    runCursorPx = -cornerOffPx + bayPx; // FIX 2: first bay = startTick + 10'
  }

  // ── BAY TICKS — 10' from start tick, stopping at runEndPx ────────────────
  // No bay ever exceeds 10'. The 4' corner offset is included in coverage.
  let cursor = runCursorPx;
  while (cursor < runEndPx - puf * 0.1) {
    if (cursor >= 0) legs.push(makeLeg(cursor)); // only draw if on segment
    cursor += bayPx;
  }

  // ── END TICK — try standard bay lengths from last placed tick ─────────────
  // Only place if remaining distance >= 5' (smallest standard bay)
  // If < 5' remaining, absorb into last full bay — no bastard bay
  const bayLegs = legs.filter(l => !l.isStartLeg);
  const lastAlongDist = bayLegs.length > 0
    ? Math.max(...bayLegs.map(l => {
        const wbx = l.wallPoint.x - normal.x * wallGapPx;
        const wby = l.wallPoint.y - normal.y * wallGapPx;
        return (wbx - start.x) * along.x + (wby - start.y) * along.y;
      }))
    : runCursorPx;

  const remainingFt = (runEndPx - lastAlongDist) / puf;

  if (remainingFt >= 5) {
    let endDist = runEndPx;
    for (const bayFt of STANDARD_BAY_LENGTHS_FT) {
      const candidate = lastAlongDist + bayFt * puf;
      if (candidate <= runEndPx + puf * 0.1) {
        endDist = Math.min(candidate, runEndPx);
        break;
      }
    }
    if ((endDist - lastAlongDist) / puf >= 5) {
      legs.push(makeLeg(endDist, false, false, true));
    }
  }

  return legs.filter(l => isFinitePoint(l.tickTip) && isFinitePoint(l.wallPoint));
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
  const [viewerZoom, setViewerZoom] = useState(1);
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState(projectInfo.projectName);

  const frameHeight = 6 + 4 / 12;
  const workerReachHeight = getBackendSettings().scaffold.workerReachHeight ?? 6;
  const frameHeightCount = activeElevationData?.quantityEngine.frameTall ?? 7;

  // pageUnitsPerFoot — from scale calibration in Takeoff Workspace
  // If not set, Set Scaffold is locked (scale required before proceeding)
  const pageUnitsPerFoot = activeElevationData?.scale?.pageUnitsPerFoot ?? null;
  const scaleIsSet = pageUnitsPerFoot != null && pageUnitsPerFoot > 0;

  // ── Raw PDF coordinate approach ──────────────────────────────────────────
  // Instead of rescaling points to fit a fixed 1200×720 SVG, keep points in
  // their original PDF coordinate space. Set the SVG viewBox to match the
  // bounding box of the raw points (with padding). This means:
  //   svgPUF = pdfPUF exactly — no conversion, no scaling errors.

  const rawPrimaryPoints = useMemo(
    () => getPrimaryGeometryPoints(activeElevationData),
    [activeElevationData],
  );

  // Compute bounding box of raw points for the SVG viewBox
  const svgViewBox = useMemo(() => {
    const pts = rawPrimaryPoints.filter(isFinitePoint);
    if (pts.length < 2) return { x: 0, y: 0, w: 1200, h: 720 };
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    const pad = pageUnitsPerFoot ? pageUnitsPerFoot * 8 : 80; // 8ft padding around building
    return {
      x: minX - pad,
      y: minY - pad,
      w: (maxX - minX) + pad * 2,
      h: (maxY - minY) + pad * 2,
    };
  }, [rawPrimaryPoints, pageUnitsPerFoot]);

  // Raw overlay rows — points in PDF coordinate space, no rescaling
  const rawOverlayRows = useMemo(() => {
    const geometry = activeElevationData?.overlayGeometry;
    if (!geometry) return [];
    const allRows = geometry.fullOverlayRows.filter(row => row.points.length >= 2);
    if (allRows.length === 0) return [];
    return allRows.map((row, index) => ({
      id: row.id ?? index,
      level: row.level,
      isKeyFloor: Boolean(row.isKeyFloor),
      closed: Boolean(row.closed),
      color: row.color || (index === 0 ? "#2563eb" : "#22c55e"),
      points: row.points.filter(isFinitePoint),
    })).filter(row => row.points.length >= 2);
  }, [activeElevationData]);

  // Raw reference points
  const rawReferencePoints = useMemo(() => {
    return activeElevationData?.overlayGeometry?.referencePoints?.filter(isFinitePoint) ?? [];
  }, [activeElevationData]);

  // The scaffold outline in raw PDF coordinates
  const rawScaffoldOutline = useMemo(() => {
    const pts = rawPrimaryPoints.filter(isFinitePoint);
    return pts.length >= 3 ? pts : null;
  }, [rawPrimaryPoints]);

  // Use raw points if available, fall back to the scaled version for the fallback shape
  const scaffoldOutline = rawScaffoldOutline ?? currentLevelOutline;
  const isUsingFallbackGeometry = !rawScaffoldOutline;

  // svgPageUnitsPerFoot = pdfPUF directly since we're in PDF coordinate space
  // svgScale is 1.0 — no rescaling applied
  const svgScale = 1;
  const svgPageUnitsPerFoot = pageUnitsPerFoot;

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
    if (!scaleIsSet || !pageUnitsPerFoot || !scaffoldOutline.length) return [];
    const puf = pageUnitsPerFoot;
    const insideCorners = detectInsideCorners(scaffoldOutline);
    const results: { segIndex: number; legs: LegResult[] }[] = [];

    for (let i = 0; i < scaffoldOutline.length; i++) {
      const start = scaffoldOutline[i];
      const end = scaffoldOutline[(i + 1) % scaffoldOutline.length];
      const legs = computeSegmentLegs(
        start, end, i, scaffoldWidthFt, bayLengthFt, puf, turnaroundBays, scaffoldOutline, insideCorners
      );
      results.push({ segIndex: i, legs });
    }

    // ── Cross-segment deduplication ──────────────────────────────────────────
    // At each corner, check the end tick of segment[i] against the start tick
    // of segment[i+1]. If they are within 8' of each other, remove the end
    // tick of segment[i] — keep the start tick of the new run.
    const maxGapPx = 8 * puf;
    const n = scaffoldOutline.length;

    for (let i = 0; i < n; i++) {
      const curr = results[i];
      const next = results[(i + 1) % n];
      if (!curr || !next) continue;

      // End tick of current segment
      const endTick = curr.legs.filter(l => !l.isStartLeg && !l.isTurnaroundMirror).slice(-1)[0];
      // Start tick of next segment
      const startTick = next.legs.find(l => l.isStartLeg);

      if (!endTick || !startTick) continue;

      const dist = Math.sqrt(
        (endTick.wallPoint.x - startTick.wallPoint.x) ** 2 +
        (endTick.wallPoint.y - startTick.wallPoint.y) ** 2
      );

      if (dist <= maxGapPx) {
        // Remove end tick from current segment — gap is acceptable
        curr.legs = curr.legs.filter(l => l !== endTick);
      }
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

      <section className="grid h-[calc(100vh-125px)] grid-cols-[minmax(0,1fr)_340px]">
        {/* Canvas */}
        <section className="relative overflow-hidden border-r border-orange-500/20 bg-black flex flex-col">

          {/* Scale lock overlay */}
          {!scaleIsSet && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
              <div className="rounded-[2rem] border border-yellow-500/40 bg-yellow-500/10 p-10 text-center shadow-2xl">
                <div className="mb-4 text-4xl">⚠</div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-300">Scale Not Set</p>
                <p className="mt-3 max-w-xs text-xs leading-5 text-zinc-400">
                  Scale must be calibrated in Takeoff Workspace before scaffold layout can be generated.
                </p>
                <a href="/takeoff-workspace" className="mt-6 inline-block rounded-xl bg-yellow-400 px-6 py-3 text-xs font-bold text-black hover:bg-yellow-300">
                  Go to Takeoff Workspace →
                </a>
              </div>
            </div>
          )}

          {/* HUD — status pills + zoom controls */}
          <div className="absolute left-6 top-5 z-20 flex flex-wrap items-center gap-3">
            <StatusPill label="Overlay" active={showOverlay} onClick={() => setShowOverlay(c => !c)} />
            <StatusPill label="Scaffold" active={showScaffold} onClick={() => setShowScaffold(c => !c)} />
            <StatusPill label="Frame Tall" value={String(frameHeightCount)} />
            <StatusPill label="Turnaround" active={turnaroundBays} onClick={() => setTurnaroundBays(c => !c)} value={turnaroundBays ? "ON" : "OFF"} />
            <StatusPill label="Scale" active={scaleIsSet} value={scaleIsSet ? "Calibrated" : "Not Set"} />
            {isUsingFallbackGeometry && (
              <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs font-bold text-yellow-300">
                ⚠ Placeholder shape
              </div>
            )}
          </div>

          {/* Zoom controls — top right */}
          <div className="absolute right-5 top-5 z-20 flex items-center gap-1.5">
            <button
              onClick={() => setViewerZoom(z => Math.min(3, z + 0.15))}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-black/80 text-zinc-400 hover:text-zinc-200 hover:border-orange-500/30 text-sm font-bold"
            >+</button>
            <span className="rounded-xl border border-zinc-800 bg-black/80 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
              {Math.round(viewerZoom * 100)}%
            </span>
            <button
              onClick={() => setViewerZoom(z => Math.max(0.3, z - 0.15))}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-black/80 text-zinc-400 hover:text-zinc-200 hover:border-orange-500/30 text-sm font-bold"
            >−</button>
            <button
              onClick={() => setViewerZoom(1)}
              className="rounded-xl border border-zinc-800 bg-black/80 px-2.5 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300"
            >Fit</button>
          </div>

          {/* Background grid */}
          <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:36px_36px]" />

          {/* SVG viewer — fills available height above bottom bar */}
          <div className="absolute inset-0 bottom-12 overflow-hidden">
            <div className="relative h-full w-full rounded-[2rem]">

              {/* Project name — vertical text on left edge */}
              <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2 -rotate-90 whitespace-nowrap">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-700">
                  {activeProjectName}
                </span>
              </div>

              {/* Overlay legend — small, bottom-left of viewer */}
              <div className="absolute bottom-3 left-8 z-20 flex items-center gap-3 rounded-xl border border-zinc-900 bg-black/70 px-3 py-1.5 backdrop-blur">
                <div className="flex items-center gap-1.5">
                  <div className="h-px w-5 bg-[#2563eb]" />
                  <span className="text-[9px] text-zinc-600">Current</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-px w-5 bg-[#22c55e]" />
                  <span className="text-[9px] text-zinc-600">Below</span>
                </div>
              </div>

              <svg
                viewBox={`${svgViewBox.x + (svgViewBox.w * (1 - 1/viewerZoom)) / 2} ${svgViewBox.y + (svgViewBox.h * (1 - 1/viewerZoom)) / 2} ${svgViewBox.w / viewerZoom} ${svgViewBox.h / viewerZoom}`}
                className="h-full w-full"
              >
                <GridAxisLabels viewBox={svgViewBox} pageUnitsPerFoot={pageUnitsPerFoot ?? 18} />
                <CompassLabels viewBox={svgViewBox} />

                {showOverlay && (
                  rawOverlayRows.length ? (
                    <StoredTakeoffOverlay rows={rawOverlayRows} referencePoints={rawReferencePoints} />
                  ) : (
                    <g>
                      <path d="M250 150 L835 150 L835 230 L770 230 L770 300 L910 300 L910 505 L805 505 L805 575 L350 575 L350 520 L215 520 L215 345 L165 345 L165 230 L250 230 Z" fill="transparent" stroke="#2563eb" strokeWidth="0.7" strokeLinejoin="miter" />
                      <path d="M280 180 L790 180 L790 250 L735 250 L735 322 L872 322 L872 475 L775 475 L775 540 L385 540 L385 490 L250 490 L250 318 L198 318 L198 258 L280 258 Z" fill="transparent" stroke="#22c55e" strokeWidth="0.6" strokeLinejoin="miter" opacity="0.9" />
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
                      polygon={scaffoldOutline}
                      svgPageUnitsPerFoot={pageUnitsPerFoot ?? 8}
                      scaffoldWidthFt={scaffoldWidthFt}
                    />
                  </g>
                )}
              </svg>
            </div>
          </div>

          {/* Bottom action bar — centered below viewer */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 border-t border-zinc-900 bg-[#080604] px-6 py-2.5">
            <ViewerTool label="Regenerate" />
            <ViewerTool label="Edit Bay" />
            <ViewerTool label="Save Layout" primary />
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
  polygon,
  svgPageUnitsPerFoot,
  scaffoldWidthFt,
}: {
  segmentLegs: { segIndex: number; legs: LegResult[] }[];
  points: PlanPoint[];
  elevationHeights: Array<{ elevation: string; overallHeightInput: string; belowGradeEnabled: boolean; belowGradeInput: string }>;
  frameHeight: number;
  workerReachHeight: number;
  frameTall: number;
  polygon: PlanPoint[];
  svgPageUnitsPerFoot: number;
  scaffoldWidthFt: number;
}) {
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

        const normal = computeOutwardNormal(segStart, segEnd, polygon);
        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const wallGapPx    = 1 * svgPageUnitsPerFoot;
        const tickLengthPx = scaffoldWidthFt * svgPageUnitsPerFoot;

        const structuralLegs = legs.filter(l => !l.isTurnaroundMirror);

        return (
          <g key={`seg-${segIndex}`}>

            {/* Diagonal braces — from base of one tick to tip of next, 60% centered */}
            {structuralLegs.filter(l => !l.isStartLeg).slice(0, -1).map((leg, i) => {
              const bayLegs = structuralLegs.filter(l => !l.isStartLeg);
              const next = bayLegs[i + 1];
              if (!next) return null;
              const cx = (leg.wallPoint.x + next.wallPoint.x) / 2;
              const cy = (leg.wallPoint.y + next.wallPoint.y) / 2;
              const bayPx = Math.sqrt(
                (next.wallPoint.x - leg.wallPoint.x) ** 2 +
                (next.wallPoint.y - leg.wallPoint.y) ** 2
              );
              const braceLen = bayPx * 0.6;
              const halfBrace = braceLen / 2;
              const along = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
              // Brace: from near wall on one side to near tip on other side
              // x1 side = back along wall, close to wall face
              // x2 side = forward along wall, close to tick tip
              return (
                <line
                  key={`brace-${segIndex}-${i}`}
                  x1={cx - along.x * halfBrace + normal.x * wallGapPx * 0.5}
                  y1={cy - along.y * halfBrace + normal.y * wallGapPx * 0.5}
                  x2={cx + along.x * halfBrace + normal.x * (wallGapPx + tickLengthPx) * 0.9}
                  y2={cy + along.y * halfBrace + normal.y * (wallGapPx + tickLengthPx) * 0.9}
                  strokeWidth="0.7"
                  opacity="0.55"
                />
              );
            })}

            {/* Tick lines — from wall face outward, perpendicular, scaffoldWidth long */}
            {structuralLegs.map((leg, i) => {
              const localFrameTall = getLocalFrameTall(leg.wallPoint);
              if (!isFiniteNumber(leg.wallPoint.x) || !isFiniteNumber(leg.tickTip.x)) return null;
              return (
                <g key={`leg-${segIndex}-${i}`}>
                  <line
                    x1={leg.wallPoint.x}
                    y1={leg.wallPoint.y}
                    x2={leg.tickTip.x}
                    y2={leg.tickTip.y}
                    strokeWidth="1.8"
                  />
                  <text
                    x={leg.labelPoint.x}
                    y={leg.labelPoint.y}
                    fontSize={svgPageUnitsPerFoot * 0.5}
                    fontFamily="monospace"
                    fontWeight="600"
                    opacity="0.85"
                    textAnchor="middle"
                    dominantBaseline="middle"
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

function mapGeometryPoints(points: PlanPoint[], width: number, height: number, padding: number): { points: PlanPoint[]; svgScale: number } {
  const validPoints = points.filter(isFinitePoint);
  if (validPoints.length < 2) return { points: [], svgScale: 1 };
  const minX = Math.min(...validPoints.map(p => p.x));
  const maxX = Math.max(...validPoints.map(p => p.x));
  const minY = Math.min(...validPoints.map(p => p.y));
  const maxY = Math.max(...validPoints.map(p => p.y));
  const gW = Math.max(1, maxX - minX); const gH = Math.max(1, maxY - minY);
  const svgScale = Math.min((width - padding * 2) / gW, (height - padding * 2) / gH);
  const dW = gW * svgScale; const dH = gH * svgScale;
  const oX = padding + (width - padding * 2 - dW) / 2;
  const oY = padding + (height - padding * 2 - dH) / 2;
  return {
    points: validPoints.map(p => ({ x: oX + (p.x - minX) * svgScale, y: oY + (p.y - minY) * svgScale })),
    svgScale,
  };
}

function getScaledPrimaryOutline(elevation: ProjectElevation | null, width: number, height: number, padding: number): { points: PlanPoint[]; svgScale: number } | null {
  const points = getPrimaryGeometryPoints(elevation);
  const { points: mapped, svgScale } = mapGeometryPoints(points, width, height, padding);
  return mapped.length >= 3 ? { points: mapped, svgScale } : null;
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
    points: mapGeometryPoints(allPoints.length >= 2 ? row.points : basePoints, width, height, padding).points,
  })).filter(row => row.points.length >= 2);
}

function getScaledReferencePoints(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry || geometry.referencePoints.length < 1) return [];
  const basePoints = getPrimaryGeometryPoints(elevation);
  const allPoints = [...basePoints, ...geometry.referencePoints];
  const mappedAllPoints = mapGeometryPoints(allPoints, width, height, padding).points;
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

function CompassLabels({ viewBox }: { viewBox: { x: number; y: number; w: number; h: number } }) {
  const style = { fontSize: String(viewBox.w * 0.012), fontFamily: "monospace", fontWeight: "700", fill: "#f97316", opacity: "0.55" };
  const cx = viewBox.x + viewBox.w / 2;
  const cy = viewBox.y + viewBox.h / 2;
  const pad = viewBox.w * 0.025;
  return (
    <g>
      <text x={cx} y={viewBox.y + pad} textAnchor="middle" {...style}>N</text>
      <text x={cx} y={viewBox.y + viewBox.h - pad * 0.3} textAnchor="middle" {...style}>S</text>
      <text x={viewBox.x + pad * 0.5} y={cy} textAnchor="middle" {...style}>W</text>
      <text x={viewBox.x + viewBox.w - pad * 0.5} y={cy} textAnchor="middle" {...style}>E</text>
    </g>
  );
}

function GridAxisLabels({ viewBox, pageUnitsPerFoot }: { viewBox: { x: number; y: number; w: number; h: number }; pageUnitsPerFoot: number }) {
  // Draw tick marks every 5' along the edges of the viewBox
  const fiveFootPx = pageUnitsPerFoot * 5;
  const fontSize = Math.max(6, Math.min(11, viewBox.w * 0.009));

  // How many 5' increments fit across the building
  const xCount = Math.ceil(viewBox.w / fiveFootPx) + 1;
  const yCount = Math.ceil(viewBox.h / fiveFootPx) + 1;

  // Start labels from the building's real-world 0,0 origin (viewBox.x)
  const xLabels = Array.from({ length: Math.min(xCount, 30) }, (_, i) => i);
  const yLabels = Array.from({ length: Math.min(yCount, 20) }, (_, i) => i);

  const tickLen = viewBox.w * 0.008;
  const labelOffX = viewBox.x + viewBox.w * 0.015;
  const labelOffY = viewBox.y + viewBox.h * 0.04;

  return (
    <g opacity="0.4">
      {xLabels.map((i) => {
        const x = viewBox.x + i * fiveFootPx;
        if (x > viewBox.x + viewBox.w) return null;
        return (
          <g key={`x-${i}`}>
            <text x={x} y={viewBox.y + tickLen * 2.5} fill="#a1a1aa" fontSize={fontSize} fontFamily="monospace" textAnchor="middle">
              {i * 5}'
            </text>
            <line x1={x} y1={viewBox.y + tickLen} x2={x} y2={viewBox.y + tickLen * 2} stroke="#a1a1aa" strokeWidth={viewBox.w * 0.0005} />
          </g>
        );
      })}
      {yLabels.map((i) => {
        const y = viewBox.y + i * fiveFootPx;
        if (y > viewBox.y + viewBox.h) return null;
        return (
          <g key={`y-${i}`}>
            <text x={viewBox.x + tickLen * 2.5} y={y} fill="#a1a1aa" fontSize={fontSize} fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">
              {i * 5}'
            </text>
            <line x1={viewBox.x + tickLen} y1={y} x2={viewBox.x + tickLen * 2} y2={y} stroke="#a1a1aa" strokeWidth={viewBox.w * 0.0005} />
          </g>
        );
      })}
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
