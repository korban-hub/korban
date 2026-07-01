"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// ── Demo building outline — Mare Island Apartments ────────────────────────────
// Clean rectangular apartment block with a courtyard recess on the east side.
// Perimeter ≈ 625 LF at this SVG scale. Used when no real overlay is stored.
// North wall 180', East walls 45' each, South wall 180', West wall 90', notch 90'x45'
const currentLevelOutline: PlanPoint[] = [
  // NW corner → NE corner (North wall, 180')
  { x: 160, y: 120 }, { x: 880, y: 120 },
  // NE corner → notch start (East upper, 45')
  { x: 880, y: 300 },
  // Notch — courtyard recess (90' wide × 45' deep into building)
  { x: 700, y: 300 }, { x: 700, y: 480 }, { x: 880, y: 480 },
  // SE corner (East lower, 45')
  { x: 880, y: 600 },
  // SE → SW corner (South wall, 180')
  { x: 160, y: 600 },
  // SW → NW corner (West wall, 90')
  { x: 160, y: 120 },
];

const runSummary = [
  { label: "North Run",    lf: "180'-0\"", bays: 18, legs: 19 },
  { label: "East Return",  lf: "135'-0\"", bays: 13, legs: 14 },
  { label: "South Run",    lf: "180'-0\"", bays: 18, legs: 19 },
  { label: "West Run",     lf: "90'-0\"",  bays: 9,  legs: 10 },
  { label: "Courtyard",    lf: "40'-0\"",  bays: 4,  legs: 5  },
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

// Outward normal — winding-based with per-segment correction.
// Uses pointInPolygon to verify the candidate normal points outward.
// If it points inward, flips to the opposite normal.
function computeOutwardNormal(
  a: PlanPoint,
  b: PlanPoint,
  polygon: PlanPoint[],
): PlanPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };

  const n1 = { x:  dy / len, y: -dx / len }; // right of travel
  const n2 = { x: -dy / len, y:  dx / len }; // left of travel

  if (polygon.length < 3) return n1;

  // Winding-based initial guess
  const area = signedArea(polygon);
  const candidate = area > 0 ? n2 : n1;
  const opposite  = area > 0 ? n1 : n2;

  // Per-segment correction: test midpoint offset in candidate direction
  // If it lands inside the polygon, the candidate is inward — flip it
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const testDist = Math.max(len * 0.05, 2);
  const testPt = { x: mx + candidate.x * testDist, y: my + candidate.y * testDist };

  if (pointInPolygon(testPt, polygon)) return opposite;
  return candidate;
}

// Point-in-polygon test — used to reject ticks that land inside the building
function pointInPolygon(point: PlanPoint, polygon: PlanPoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
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
    // CW polygon in SVG: re-entrant corner turns left = cross product < 0
    // CCW polygon in SVG: re-entrant corner turns right = cross product > 0
    return isCW ? cross < 0 : cross > 0;
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
  // Case A: Normal outside corner
  //   → place start tick scaffoldWidth+1' BEFORE the start corner
  //   → first bay tick is startTick + 10'
  //
  // Case B: Inside corner (re-entrant / notch)
  //   → NO start tick before corner (would land inside building)
  //   → place first leg AT the corner point (dist=0), 1' outward offset
  //   → continue with 10' bays from there

  let runCursorPx: number;

  if (startCornerIsInside) {
    // Case B: inside corner — first leg at corner, then 10' bays
    legs.push(makeLeg(0, false, true, false));
    runCursorPx = bayPx;
  } else {
    // Case A: outside corner — start tick before corner, first bay = startTick + 10'
    legs.push(makeLeg(-cornerOffPx, false, true, false));
    runCursorPx = -cornerOffPx + bayPx;
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
  const [editMode, setEditMode] = useState(false);
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const [deletedLegKeys, setDeletedLegKeys] = useState<Set<string>>(new Set());
  const [overriddenFrameCounts, setOverriddenFrameCounts] = useState<Record<string, number>>({});
  const [draggedLegKey, setDraggedLegKey] = useState<string | null>(null);
  const [legOffsets, setLegOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const svgRef = useRef<SVGSVGElement>(null);
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
    // of segment[i+1].
    // Gap ≤ 8' → remove end tick, gap is acceptable
    // Gap > 8' at outside corner → add a leg at the corner point
    const maxGapPx = 8 * puf;
    const n = scaffoldOutline.length;

    for (let i = 0; i < n; i++) {
      const curr = results[i];
      const next = results[(i + 1) % n];
      if (!curr || !next) continue;

      const cornerPt  = scaffoldOutline[(i + 1) % n];
      const cornerIsInside = insideCorners[(i + 1) % n];

      // End tick of current segment (last non-start, non-mirror leg)
      const endTick  = curr.legs.filter(l => !l.isStartLeg && !l.isTurnaroundMirror).slice(-1)[0];
      // Start tick of next segment (the leg placed at or before the next corner)
      const startTick = next.legs.find(l => l.isStartLeg);

      // Reference points for distance
      const endPt   = endTick   ? endTick.wallPoint   : cornerPt;
      const startPt = startTick ? startTick.wallPoint  : cornerPt;

      const dist = Math.sqrt((endPt.x - startPt.x) ** 2 + (endPt.y - startPt.y) ** 2);

      if (dist <= maxGapPx) {
        // Gap acceptable — remove end tick to avoid crowding
        if (endTick) curr.legs = curr.legs.filter(l => l !== endTick);

      } else if (!cornerIsInside) {
        // Gap too large at outside corner — always add a leg at the corner point
        // Use the outward normal of the CURRENT segment at the corner
        const currStart = scaffoldOutline[i];
        const currEnd   = scaffoldOutline[(i + 1) % n];
        const normalAtCorner = computeOutwardNormal(currStart, currEnd, scaffoldOutline);
        const wallGapPx  = 1 * puf;
        const tickLenPx  = scaffoldWidthFt * puf;
        const labelOffPx = wallGapPx + tickLenPx + puf * 0.6;

        const cornerLeg: LegResult = {
          wallPoint:  { x: cornerPt.x + normalAtCorner.x * wallGapPx,              y: cornerPt.y + normalAtCorner.y * wallGapPx },
          tickTip:    { x: cornerPt.x + normalAtCorner.x * (wallGapPx + tickLenPx), y: cornerPt.y + normalAtCorner.y * (wallGapPx + tickLenPx) },
          labelPoint: { x: cornerPt.x + normalAtCorner.x * labelOffPx,              y: cornerPt.y + normalAtCorner.y * labelOffPx },
          isTurnaroundMirror: false,
          isStartLeg: false,
          isEndLeg: true,
        };

        // Only add if it doesn't land inside the building
        if (!pointInPolygon(cornerLeg.tickTip, scaffoldOutline)) {
          curr.legs.push(cornerLeg);
        }
      }
    }

    return results;
  }, [scaffoldOutline, scaffoldWidthFt, bayLengthFt, turnaroundBays, scaleIsSet, pageUnitsPerFoot]);

  // ── Quantities derived from actual rendered legs (Rule Q3) ────────────────
  const totals = useMemo(() => {
    if (!scaleIsSet) {
      const bayCount = activeElevationData?.quantityEngine.bayCount ?? runSummary.reduce((s, r) => s + r.bays, 0);
      const legCount = activeElevationData?.quantityEngine.legCount ?? runSummary.reduce((s, r) => s + r.legs, 0);
      const frames = legCount * frameHeightCount;
      const planks = bayCount * plankCountPerBay * frameHeightCount;
      const braces = activeElevationData?.quantityEngine.crossBraceCount ?? Math.max(0, bayCount - 5);
      return { bays: bayCount, legs: legCount, frames, planks, braces };
    }

    // Count actual rendered legs — excluding deleted and turnaround mirrors
    let legCount = 0;
    let bayCount = 0;
    let totalFrames = 0;

    for (const seg of allSegmentLegs) {
      const structLegs = seg.legs.filter(l => !l.isTurnaroundMirror);
      const activeLegIndices: number[] = [];
      structLegs.forEach((_, i) => {
        const key = `${seg.segIndex}-${i}`;
        if (!deletedLegKeys.has(key)) activeLegIndices.push(i);
      });

      const activeCount = activeLegIndices.length;
      legCount += activeCount;
      if (activeCount > 1) bayCount += activeCount - 1;

      // Frame count per leg — use override if set, else default frameHeightCount
      activeLegIndices.forEach(i => {
        const key = `${seg.segIndex}-${i}`;
        totalFrames += overriddenFrameCounts[key] ?? frameHeightCount;
      });
    }

    const planks = bayCount * plankCountPerBay;
    const braces = Math.max(0, bayCount - scaffoldOutline.length);

    return { bays: bayCount, legs: legCount, frames: totalFrames, planks, braces };
  }, [allSegmentLegs, frameHeightCount, plankCountPerBay, scaleIsSet, activeElevationData, scaffoldOutline.length, deletedLegKeys, overriddenFrameCounts]);

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
            {scaleIsSet && scaffoldOutline.length >= 3 && (
              <span className="rounded-xl border border-zinc-800 bg-black/80 px-2.5 py-1.5 font-mono text-[9px] text-zinc-500">
                {signedArea(scaffoldOutline) > 0 ? "CW" : "CCW"} {signedArea(scaffoldOutline).toFixed(0)}
              </span>
            )}
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
                ref={svgRef}
                viewBox={`${svgViewBox.x + (svgViewBox.w * (1 - 1/viewerZoom)) / 2} ${svgViewBox.y + (svgViewBox.h * (1 - 1/viewerZoom)) / 2} ${svgViewBox.w / viewerZoom} ${svgViewBox.h / viewerZoom}`}
                className="h-full w-full"
                onMouseMove={e => {
                  if (!draggedLegKey || !svgRef.current) return;
                  const rect = svgRef.current.getBoundingClientRect();
                  const vb = svgRef.current.viewBox.baseVal;
                  const scaleX = vb.width / rect.width;
                  const scaleY = vb.height / rect.height;
                  const dx = (e.movementX * scaleX);
                  const dy = (e.movementY * scaleY);
                  setLegOffsets(prev => ({
                    ...prev,
                    [draggedLegKey]: {
                      dx: (prev[draggedLegKey]?.dx ?? 0) + dx,
                      dy: (prev[draggedLegKey]?.dy ?? 0) + dy,
                    }
                  }));
                }}
                onMouseUp={() => setDraggedLegKey(null)}
                onMouseLeave={() => setDraggedLegKey(null)}
              >
                <GridAxisLabels viewBox={svgViewBox} pageUnitsPerFoot={pageUnitsPerFoot ?? 18} />
                <CompassLabels viewBox={svgViewBox} />

                {showOverlay && (
                  rawOverlayRows.length ? (
                    <StoredTakeoffOverlay rows={rawOverlayRows} referencePoints={rawReferencePoints} />
                  ) : (
                    <g>
                      {/* Mare Island Apartments — clean demo footprint */}
                      <path
                        d="M160 120 L880 120 L880 300 L700 300 L700 480 L880 480 L880 600 L160 600 Z"
                        fill="rgba(37,99,235,0.06)" stroke="#2563eb" strokeWidth="1.2" strokeLinejoin="miter"
                      />
                      <path
                        d="M172 132 L868 132 L868 312 L712 312 L712 468 L868 468 L868 588 L172 588 Z"
                        fill="transparent" stroke="#22c55e" strokeWidth="0.8" strokeLinejoin="miter" opacity="0.8"
                      />
                      {/* Reference point marker */}
                      <circle cx="160" cy="120" r="5" fill="#f97316" opacity="0.8" />
                      <line x1="150" y1="120" x2="180" y2="120" stroke="#f97316" strokeWidth="0.8" opacity="0.6" />
                      <line x1="160" y1="110" x2="160" y2="130" stroke="#f97316" strokeWidth="0.8" opacity="0.6" />
                      <text x="175" y="112" fill="#f97316" fontSize="9" fontFamily="monospace" opacity="0.7">REF A-1</text>
                      {/* Dimension labels */}
                      <text x="510" y="108" fill="#2563eb" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.7">180'-0"</text>
                      <text x="148" y="365" fill="#2563eb" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.7">90'</text>
                      <text x="510" y="614" fill="#2563eb" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.7">180'-0"</text>
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
                      editMode={editMode}
                      selectedLegKey={selectedLegKey}
                      deletedLegKeys={deletedLegKeys}
                      overriddenFrameCounts={overriddenFrameCounts}
                      legOffsets={legOffsets}
                      onLegClick={(key) => editMode && setSelectedLegKey(k => k === key ? null : key)}
                      onLegDragStart={(key) => { if (editMode) { setDraggedLegKey(key); setSelectedLegKey(key); } }}
                    />
                  </g>
                )}

                {/* Edit mode — delete & frame count controls */}
                {editMode && selectedLegKey && (() => {
                  const [si, li] = selectedLegKey.split("-").map(Number);
                  const seg = allSegmentLegs.find(s => s.segIndex === si);
                  const legs = seg?.legs.filter(l => !l.isTurnaroundMirror) ?? [];
                  const leg = legs[li];
                  if (!leg) return null;
                  const cx = leg.tickTip.x;
                  const cy = leg.tickTip.y - 18;
                  const currentFrames = overriddenFrameCounts[selectedLegKey] ?? frameHeightCount;
                  return (
                    <g>
                      <rect x={cx - 54} y={cy - 14} width={108} height={28} rx={6}
                        fill="#18181b" stroke="#f97316" strokeWidth="1" opacity="0.97" />
                      <text x={cx - 48} y={cy + 5} fontSize="8" fill="#f97316" fontFamily="monospace" fontWeight="bold">
                        Frames: {currentFrames}
                      </text>
                      {/* − button */}
                      <rect x={cx + 14} y={cy - 10} width={16} height={16} rx={3} fill="#f97316"
                        style={{ cursor: "pointer" }}
                        onClick={() => setOverriddenFrameCounts(p => ({ ...p, [selectedLegKey]: Math.max(1, (p[selectedLegKey] ?? frameHeightCount) - 1) }))} />
                      <text x={cx + 22} y={cy + 4} fontSize="10" fill="black" textAnchor="middle" fontWeight="bold" style={{ pointerEvents: "none" }}>−</text>
                      {/* + button */}
                      <rect x={cx + 32} y={cy - 10} width={16} height={16} rx={3} fill="#f97316"
                        style={{ cursor: "pointer" }}
                        onClick={() => setOverriddenFrameCounts(p => ({ ...p, [selectedLegKey]: (p[selectedLegKey] ?? frameHeightCount) + 1 }))} />
                      <text x={cx + 40} y={cy + 4} fontSize="10" fill="black" textAnchor="middle" fontWeight="bold" style={{ pointerEvents: "none" }}>+</text>
                      {/* Delete tick */}
                      <rect x={cx - 54} y={cy + 16} width={108} height={16} rx={4} fill="#ef4444" opacity="0.85"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setDeletedLegKeys(p => { const n = new Set(p); n.add(selectedLegKey); return n; });
                          setSelectedLegKey(null);
                        }} />
                      <text x={cx} y={cy + 28} fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold" style={{ pointerEvents: "none" }}>
                        DELETE TICK
                      </text>
                    </g>
                  );
                })()}

              </svg>
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 border-t border-zinc-900 bg-[#080604] px-6 py-2.5">
            <KorbanButton variant="ghost" className="px-3 py-2 text-[10px]" onClick={() => setEditMode(false)}>
              Regenerate
            </KorbanButton>
            <KorbanButton
              variant={editMode ? "primary" : "ghost"}
              className="px-3 py-2 text-[10px]"
              onClick={() => setEditMode(m => !m)}
            >
              {editMode ? "✓ Editing" : "Edit Bay"}
            </KorbanButton>
            <KorbanButton variant="primary" className="px-3 py-2 text-[10px]" onClick={() => setEditMode(false)}>
              Save Layout
            </KorbanButton>
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

function ScaffoldRunTicks({
  segmentLegs, points, elevationHeights, frameHeight, workerReachHeight,
  frameTall, polygon, svgPageUnitsPerFoot, scaffoldWidthFt,
  editMode = false, selectedLegKey = null, deletedLegKeys = new Set(),
  overriddenFrameCounts = {}, legOffsets = {}, onLegClick, onLegDragStart,
}: {
  segmentLegs: { segIndex: number; legs: LegResult[] }[];
  points: PlanPoint[];
  elevationHeights: Array<{ elevation: string; overallHeightInput: string; belowGradeEnabled: boolean; belowGradeInput: string }>;
  frameHeight: number; workerReachHeight: number; frameTall: number;
  polygon: PlanPoint[]; svgPageUnitsPerFoot: number; scaffoldWidthFt: number;
  editMode?: boolean; selectedLegKey?: string | null;
  deletedLegKeys?: Set<string>; overriddenFrameCounts?: Record<string, number>;
  legOffsets?: Record<string, { dx: number; dy: number }>;
  onLegClick?: (key: string) => void;
  onLegDragStart?: (key: string) => void;
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
        const dx = segEnd.x - segStart.x; const dy = segEnd.y - segStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const wallGapPx = 1 * svgPageUnitsPerFoot;
        const tickLengthPx = scaffoldWidthFt * svgPageUnitsPerFoot;
        const structuralLegs = legs.filter(l => !l.isTurnaroundMirror);
        return (
          <g key={`seg-${segIndex}`}>
            {/* Diagonal braces */}
            {structuralLegs.filter(l => !l.isStartLeg).slice(0, -1).map((leg, i) => {
              const bayLegs = structuralLegs.filter(l => !l.isStartLeg);
              const next = bayLegs[i + 1]; if (!next) return null;
              const legKey = `${segIndex}-${i}`;
              const nextKey = `${segIndex}-${i+1}`;
              const off1 = legOffsets[legKey] ?? { dx: 0, dy: 0 };
              const off2 = legOffsets[nextKey] ?? { dx: 0, dy: 0 };
              const cx = (leg.wallPoint.x + off1.dx + next.wallPoint.x + off2.dx) / 2;
              const cy = (leg.wallPoint.y + off1.dy + next.wallPoint.y + off2.dy) / 2;
              const bayPx = Math.sqrt((next.wallPoint.x - leg.wallPoint.x) ** 2 + (next.wallPoint.y - leg.wallPoint.y) ** 2);
              const halfBrace = bayPx * 0.3;
              const along = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
              return (
                <line key={`brace-${segIndex}-${i}`}
                  x1={cx - along.x * halfBrace + normal.x * wallGapPx * 0.5}
                  y1={cy - along.y * halfBrace + normal.y * wallGapPx * 0.5}
                  x2={cx + along.x * halfBrace + normal.x * (wallGapPx + tickLengthPx) * 0.9}
                  y2={cy + along.y * halfBrace + normal.y * (wallGapPx + tickLengthPx) * 0.9}
                  strokeWidth="0.7" opacity="0.55" />
              );
            })}
            {/* Tick lines */}
            {structuralLegs.filter(leg => !pointInPolygon(leg.tickTip, polygon)).map((leg, i) => {
              const legKey = `${segIndex}-${i}`;
              if (deletedLegKeys.has(legKey)) return null;
              if (!isFiniteNumber(leg.wallPoint.x) || !isFiniteNumber(leg.tickTip.x)) return null;
              const isSelected = selectedLegKey === legKey;
              const localFrameTall = overriddenFrameCounts[legKey] ?? getLocalFrameTall(leg.wallPoint);
              const off = legOffsets[legKey] ?? { dx: 0, dy: 0 };
              const wp = { x: leg.wallPoint.x + off.dx, y: leg.wallPoint.y + off.dy };
              const tp = { x: leg.tickTip.x + off.dx,  y: leg.tickTip.y + off.dy };
              const lp = { x: leg.labelPoint.x + off.dx, y: leg.labelPoint.y + off.dy };
              return (
                <g key={`leg-${segIndex}-${i}`}
                  style={{ cursor: editMode ? (isSelected ? "grab" : "pointer") : "default" }}
                  onClick={() => onLegClick?.(legKey)}
                  onMouseDown={e => { if (editMode) { e.preventDefault(); onLegDragStart?.(legKey); } }}>
                  {editMode && (
                    <circle
                      cx={(wp.x + tp.x) / 2} cy={(wp.y + tp.y) / 2}
                      r={tickLengthPx * 0.55}
                      fill={isSelected ? "rgba(249,115,22,0.18)" : "rgba(249,115,22,0.04)"}
                      stroke={isSelected ? "#f97316" : "rgba(249,115,22,0.25)"}
                      strokeWidth={isSelected ? "1.5" : "0.7"}
                      strokeDasharray={isSelected ? "none" : "3,2"}
                    />
                  )}
                  <line x1={wp.x} y1={wp.y} x2={tp.x} y2={tp.y}
                    strokeWidth={isSelected ? "2.5" : "1.8"}
                    stroke={isSelected ? "#f97316" : "#f8fafc"} />
                  <text x={lp.x} y={lp.y}
                    fontSize={svgPageUnitsPerFoot * 0.5} fontFamily="monospace"
                    fontWeight="600" opacity="0.85" textAnchor="middle"
                    dominantBaseline="middle" fill={isSelected ? "#f97316" : "#f8fafc"}>
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
