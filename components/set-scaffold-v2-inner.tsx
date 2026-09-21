// components/set-scaffold-v2-inner.tsx
// NO SSR — imported via dynamic() from app/set-scaffold-v2/page.tsx
"use client";

import "leaflet/dist/leaflet.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { KorbanButton, KorbanGuidance, KorbanHeader, KorbanHeaderMeta, type KorbanGuidanceFlag, type KorbanMenuLink } from "@/components/korban";
import { buildPhaseReport, calculateQuantityEngine, computeCourtyardTotals, computeElevationOnlyTotals, computeFrameMakeup, depthAtLeast, parseFeetInches, MATERIAL_RULE_DEFAULTS, findFrameMakeupOptions, getActiveElevation, getActiveElevationSource, getActiveProject, getActiveProjectSource, getEstimateDepth, braceForBay, isStandardBay, largestBayWithin, partsForConfiguration, planksPerBayForWidth, readLedger, saveActiveElevation, saveSectionView, setIncludeCourtyards, writeLedgerEntries, type EstimateDepth, type ProjectElevation, type SectionDraftingItem, type ScaffoldInput, type SectionDraftingItem } from "@/lib/projectStore";
import { getBackendSettings, getStockItem } from "@/lib/backendStore";
import SectionDrawing from "@/components/section-drawing";

// ── Types ─────────────────────────────────────────────────────────────────────
type PlanPoint = { x: number; y: number };
type ScaffoldWidth = "3'" | "3'-6\"" | "5'";
type LegResult = {
  wallPoint: PlanPoint; tickTip: PlanPoint; labelPoint: PlanPoint;
  isTurnaroundMirror: boolean; isStartLeg: boolean; isEndLeg: boolean;
};


const menuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/korban-review", label: "Korban Review" },
  { href: "/estimate-review", label: "Estimate" },
];

const FRAME_TYPES: { id: string; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "mason", label: "Mason" },
  { id: "walk-through", label: "Walk-Thru" },
  { id: "half", label: "Half Frame" },
];

const BRACKET_TYPES: { id: string; label: string }[] = [
  { id: "12", label: "12\" Bracket" },
  { id: "18", label: "18\" Bracket" },
  { id: "24", label: "24\" Bracket" },
];

// ── Geometry helpers ──────────────────────────────────────────────────────────
function isFiniteNumber(v: number) { return Number.isFinite(v); }
function isFinitePoint(p: PlanPoint) { return isFiniteNumber(p.x) && isFiniteNumber(p.y); }
function signedArea(pts: PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
  return a / 2;
}
function pointInPolygon(pt: PlanPoint, poly: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/**
 * Which way the scaffold leans off a wall segment.
 *
 * Exterior work stands the legs outside the traced line; interior work stands
 * them inside it. Same trace, same maths, opposite sign - so every leg, tick,
 * label and corner offset follows from this one function rather than each
 * caller deciding for itself.
 */
function computeOutwardNormal(
  a: PlanPoint,
  b: PlanPoint,
  poly: PlanPoint[],
  placement: "exterior" | "interior" = "exterior",
): PlanPoint {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { x: 0, y: -1 };
  const n1 = { x: dy / len, y: -dx / len }, n2 = { x: -dy / len, y: dx / len };
  const area = signedArea(poly);
  const candidate = area > 0 ? n2 : n1, opp = area > 0 ? n1 : n2;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, td = Math.max(len * 0.05, 2);
  const outward = pointInPolygon({ x: mx + candidate.x * td, y: my + candidate.y * td }, poly)
    ? opp
    : candidate;
  if (placement === "exterior") return outward;
  return { x: -outward.x, y: -outward.y };
}
function getPrimaryGeometryPoints(elev: ProjectElevation | null): PlanPoint[] {
  const g = elev?.overlayGeometry; if (!g) return [];
  if (g.tracedPerimeter?.length >= 3) return g.tracedPerimeter;
  if ((g as any).overlayPoints?.length >= 3) return (g as any).overlayPoints;
  const kf = g.fullOverlayRows?.find((r: any) => r.isKeyFloor && r.points?.length >= 3);
  if (kf) return kf.points;
  const ff = g.fullOverlayRows?.find((r: any) => r.points?.length >= 3);
  if (ff) return ff.points;
  return [];
}

const FALLBACK: PlanPoint[] = [
  { x: 160, y: 120 }, { x: 880, y: 120 }, { x: 880, y: 300 }, { x: 700, y: 300 },
  { x: 700, y: 480 }, { x: 880, y: 480 }, { x: 880, y: 600 }, { x: 160, y: 600 },
];

function parseFt(v: string): number {
  // Handle "3'-6\"" → 3.5, "3'" → 3, "10'" → 10
  const feetInches = v.match(/(\d+)['′]\s*-?\s*(\d+)/);
  if (feetInches) return parseInt(feetInches[1]) + parseInt(feetInches[2]) / 12;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

// ── Plank count per bay based on width ───────────────────────────────────────
// Delegates to the shared rule in projectStore so plank counts can't
// drift between here and the quantity engine — this helper previously
// returned 6 for 5' width while the engine assumed something different.
function planksPerBay(width: ScaffoldWidth): number {
  return planksPerBayForWidth(parseFt(width));
}

// ── Leg computation ──────────────────────────────────────────────────────────
//
// Built to KORBAN-Scaffold-Geometry-Rules. In short:
//
//   A tick always points square at the wall in front of it - never a bisector.
//   Every corner carries an invisible stop at frameWidth + 1' along each wall,
//   and no leg lands past it. Runs resolve in order, each starting at its free
//   corner and marching toward the junction, so the remainder lands where it
//   can be judged rather than in the middle of a wall.
//
//   A run marches at bay length until 10' or less remains, then finishes:
//   exactly 10' takes a leg on the boundary; between 8' and 10' takes the
//   largest standard brace that fits; 8' or under is planked across to the
//   perpendicular leg, which Cal-OSHA allows unbraced.
//
//   Anything that is not a standard brace length is a bastard bay and takes
//   guardrail instead of a fixed brace. That is a different part, not just a
//   different spacing.

/** A jog shallower than this is absorbed - the run carries straight past. */
const JOG_TOLERANCE_FT = 8 / 12;

/**
 * How a span is closed. Three different things, and they buy different material.
 *
 *   braced  - a standard bay. Leg at each end, fixed cross braces.
 *   bastard - a real bay at a length no brace is made for. Leg at each end,
 *             guardrail instead of braces.
 *   rail    - not a bay at all. No far leg. Plank and rail stretched to the
 *             perpendicular leg that starts the next run.
 *
 * The last one is the point. A leg is a full stack of frames from grade to
 * working height, so railing across a six-foot gap on a sixty-foot building
 * saves ten frames and everything that goes with them. It is what a crew
 * would do, and it is preferred rather than tolerated.
 */
export type BayKind = "braced" | "bastard" | "rail";

export type BaySpan = { segIndex: number; lengthFt: number; kind: BayKind };

/**
 * Legs for one wall, and the wall itself.
 *
 * The endpoints travel with the result on purpose. The renderer used to look
 * the wall back up by index against the raw outline, but the legs are computed
 * against the simplified one - so the moment a jog was absorbed the indices
 * stopped lining up and legs were drawn against the wrong wall, with that
 * wall's normal. That is what put ticks at odd angles and legs inside the
 * building. Carrying the geometry removes the possibility.
 */
export type SegmentLegs = {
  segIndex: number;
  legs: LegResult[];
  bays: BaySpan[];
  /** The wall these legs belong to, as used. */
  a: PlanPoint;
  b: PlanPoint;
  /** Square to that wall. The renderer must not recompute it. */
  normal: PlanPoint;
};

/**
 * Collapses jogs the scaffold would not follow.
 *
 * A traced perimeter carries every bump in the building. Real scaffold runs
 * straight past anything under eight inches - it is inside the standoff
 * anyway. At eight inches the run breaks and picks up the new wall line.
 */
function simplifyOutline(outline: PlanPoint[], puf: number): PlanPoint[] {
  if (outline.length < 3 || puf <= 0) return outline;
  const tolerance = JOG_TOLERANCE_FT * puf;
  const kept: PlanPoint[] = [];

  for (let i = 0; i < outline.length; i++) {
    const prev = kept.length ? kept[kept.length - 1] : outline[(i - 1 + outline.length) % outline.length];
    const vertex = outline[i];
    const next = outline[(i + 1) % outline.length];

    // Perpendicular distance from this vertex to the line prev->next. If the
    // building only steps out by a few inches, the scaffold does not notice.
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { kept.push(vertex); continue; }
    const deviation = Math.abs((vertex.x - prev.x) * dy - (vertex.y - prev.y) * dx) / len;

    if (deviation >= tolerance) kept.push(vertex);
  }

  return kept.length >= 3 ? kept : outline;
}

/**
 * A stretch of wall that steps in and comes back out.
 *
 * Buildings are full of these - a doorway set back, a light well, a row of
 * bays between piers. Scaffold does not follow every one of them, and which
 * ones it does follow is a judgement an estimator makes in a second and a
 * machine has to be told.
 */
export type Recess = {
  /** Index of the vertex the recess leaves the main line at. */
  from: number;
  /** Index it rejoins at. */
  to: number;
  depthFt: number;
  /** Distance across the opening. */
  mouthFt: number;
  strategy: "bracket" | "straddle" | "double";
  /** The wall inside the recess, for a double run to stand against. */
  innerPoints: PlanPoint[];
};

/**
 * Finds recesses and decides what to do with each.
 *
 * Specification section 9. Depth decides:
 *
 *   under 8"          absorbed already, before this runs
 *   8" to 3'          brackets reach in from a run on the main line
 *   3' or more, and the mouth can be spanned      straddle it
 *   3' or more, too wide to span                  a second run inside
 *
 * Bracket against straddle is a question of span, not depth: if the piers
 * either side are close enough to bridge under normal bay rules, the deck
 * carries across and nothing reaches in.
 */
function findRecesses(outline: PlanPoint[], puf: number, bayFt: number): Recess[] {
  const n = outline.length;
  if (n < 5 || puf <= 0) return [];

  const DEEP_FT = 3;
  const found: Recess[] = [];
  let i = 0;

  while (i < n) {
    const a = outline[i];
    // The line this stretch of wall is running along.
    const prev = outline[(i - 1 + n) % n];
    const dir = { x: a.x - prev.x, y: a.y - prev.y };
    const dirLen = Math.hypot(dir.x, dir.y);
    if (dirLen < 1e-6) { i++; continue; }
    const u = { x: dir.x / dirLen, y: dir.y / dirLen };

    // Look ahead for the vertex that picks the same line back up.
    let matched = -1;
    for (let span = 2; span <= 8 && i + span < n + 1; span++) {
      const b = outline[(i + span) % n];
      const back = { x: b.x - a.x, y: b.y - a.y };
      const backLen = Math.hypot(back.x, back.y);
      if (backLen < puf) continue;
      const along = (back.x * u.x + back.y * u.y) / backLen;
      // Within a few degrees of the original line, and moving forward along it.
      if (along <= 0.985) continue;
      /*
       * And the wall has to carry on along that line afterwards. Without this
       * the search matches across a corner and calls the building's own shape
       * a recess - a step-back is not a recess, because the wall never comes
       * back to where it was.
       */
      const after = outline[(i + span + 1) % n];
      const nx = after.x - b.x, ny = after.y - b.y;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-6) continue;
      if ((nx * u.x + ny * u.y) / nl <= 0.985) continue;
      matched = i + span;
      break;
    }
    if (matched < 0) { i++; continue; }

    // How far the wall steps away from the chord between the two.
    const b = outline[matched % n];
    const chord = { x: b.x - a.x, y: b.y - a.y };
    const chordLen = Math.hypot(chord.x, chord.y);
    let depth = 0;
    const innerPoints: PlanPoint[] = [];
    const sides = new Set<boolean>();
    for (let k = i + 1; k < matched; k++) {
      const v = outline[k % n];
      innerPoints.push(v);
      const cross = (v.x - a.x) * chord.y - (v.y - a.y) * chord.x;
      sides.add(cross > 0);
      depth = Math.max(depth, Math.abs(cross) / chordLen);
    }
    // A genuine recess stays on one side of its own opening. Anything that
    // crosses back and forth is the building, not a pocket in it.
    if (sides.size > 1) { i++; continue; }

    const depthFt = depth / puf;
    const mouthFt = chordLen / puf;
    if (depthFt >= JOG_TOLERANCE_FT) {
      const spannable = mouthFt <= bayFt + 0.1;
      const strategy: Recess["strategy"] =
        depthFt < DEEP_FT ? "bracket" : spannable ? "straddle" : "double";
      found.push({ from: i, to: matched % n, depthFt, mouthFt, strategy, innerPoints });
      i = matched;
      continue;
    }
    i++;
  }

  return found;
}

/**
 * The line the main run actually follows.
 *
 * Bracketed and straddled recesses are stepped over - the scaffold runs
 * straight past and reaches in, or decks across. A recess deep enough for its
 * own run is left in the outline, because the run goes in there.
 */
function runLineFor(outline: PlanPoint[], recesses: Recess[]): PlanPoint[] {
  const skip = new Set<number>();
  recesses.forEach(r => {
    if (r.strategy === "double") return;
    for (let k = r.from + 1; k < r.to; k++) skip.add(k % outline.length);
  });
  if (skip.size === 0) return outline;
  const kept = outline.filter((_, i) => !skip.has(i));
  return kept.length >= 3 ? kept : outline;
}

function computeLegs(
  outline: PlanPoint[], widthFt: number, bayFt: number, puf: number,
  placement: "exterior" | "interior" = "exterior",
): SegmentLegs[] {
  const raw = outline;
  /*
   * Two passes before a leg is placed.
   *
   * First the jogs the scaffold would not follow are absorbed. Then the
   * recesses are found and each one decided: stepped over and bracketed,
   * stepped over and decked across, or left in for a run of its own. What
   * comes out is the line the scaffold actually stands on, which is rarely
   * the line the building was traced along.
   */
  const simplified = simplifyOutline(outline, puf);
  const recesses = findRecesses(simplified, puf, bayFt);
  const shape = runLineFor(simplified, recesses);
  const n = shape.length;
  if (n < 2 || puf <= 0 || bayFt <= 0) {
    return raw.map((_, i) => ({
      segIndex: i, legs: [], bays: [],
      a: raw[i], b: raw[(i + 1) % raw.length],
      normal: { x: 0, y: -1 },
    }));
  }

  const wallGap = 1 * puf;
  const tickLen = widthFt * puf;
  const labelOff = wallGap + tickLen + puf * 1.4;
  const bayPx = bayFt * puf;
  // How far past its starting corner a wall puts its first leg.
  const floatPx = (widthFt + 1) * puf;

  const results: SegmentLegs[] = [];

  for (let i = 0; i < n; i++) {
    const start = shape[i];
    const end = shape[(i + 1) % n];
    const dx = end.x - start.x, dy = end.y - start.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen <= 0) {
      results.push({ segIndex: i, legs: [], bays: [], a: start, b: end, normal: { x: 0, y: -1 } });
      continue;
    }

    const along = { x: dx / segLen, y: dy / segLen };
    // Square at the wall in front of it - every leg on this wall, including
    // the float, which keeps the direction of the wall it belongs to.
    const normal = computeOutwardNormal(start, end, shape, placement);

    function legAt(dist: number, isStart = false, isEnd = false): LegResult {
      const base = { x: start.x + along.x * dist, y: start.y + along.y * dist };
      return {
        wallPoint: { x: base.x + normal.x * wallGap, y: base.y + normal.y * wallGap },
        tickTip: { x: base.x + normal.x * (wallGap + tickLen), y: base.y + normal.y * (wallGap + tickLen) },
        labelPoint: { x: base.x + normal.x * labelOff, y: base.y + normal.y * labelOff },
        isTurnaroundMirror: false,
        isStartLeg: isStart,
        isEndLeg: isEnd,
      };
    }

    /*
     * Four steps, and every wall follows them without needing to know what any
     * other wall did - which is what makes the corners resolve.
     *
     *   1. A leg frameWidth + 1' PAST the corner this wall starts from. It
     *      floats, with no wall in front of it.
     *   2. March at bay length along the wall.
     *   3. Stop when the next bay would run off the end.
     *   4. Leave whatever is left. It rails across to the next wall's float.
     *
     * The float belongs to the wall that is starting, not to the one that is
     * ending. The earlier version had this inverted - it began each run four
     * feet INSIDE its corner, which left every corner of the building bare.
     */
    const positions: number[] = [-floatPx];
    let cursor = -floatPx;
    let guard = 0;
    while (cursor + bayPx <= segLen + 0.01 && guard++ < 500) {
      cursor += bayPx;
      positions.push(cursor);
    }

    /*
     * The span to the next wall's float is what is left of this wall plus the
     * one foot of standoff in front of that leg. Cal-OSHA allows eight, so
     * seven feet of wall is the most that can be left unbraced. More than that
     * earns one more leg, at the largest brace length that fits.
     */
    const leftoverFt = (segLen - cursor) / puf;
    if (leftoverFt > 7 + 0.05) {
      const closing = largestBayWithin(leftoverFt);
      if (closing !== null) {
        cursor += closing * puf;
        positions.push(cursor);
      }
    }

    const legs: LegResult[] = positions.map((d, index) =>
      legAt(d, index === 0, index === positions.length - 1)
    );

    /*
     * Bays. The first spans from the float to the first leg on the wall, so it
     * hangs past the corner. The last is what is left over - a rail bay, which
     * buys no leg at all.
     */
    const bays: BaySpan[] = [];
    for (let b = 1; b < positions.length; b++) {
      const lengthFt = (positions[b] - positions[b - 1]) / puf;
      bays.push({ segIndex: i, lengthFt, kind: isStandardBay(lengthFt) ? "braced" : "bastard" });
    }
    const remainderFt = (segLen - positions[positions.length - 1]) / puf;
    if (remainderFt > 0.05) {
      bays.push({ segIndex: i, lengthFt: remainderFt, kind: "rail" });
    }

    results.push({
      segIndex: i,
      legs: legs.filter(l => isFinitePoint(l.tickTip)),
      bays, a: start, b: end, normal,
    });
  }

  /*
   * Returned against the simplified shape, not padded back onto the raw one.
   * Every caller reads the wall off the result rather than looking it up by
   * index, so there is nothing for the two to disagree about.
   */
  return results;
}

// ── Three.js 3D model — full building perimeter ───────────────────────────────
function ScaffoldModel3D({
  outline, puf, bayFt, widthFt, frameTall, scaffoldWidthFt, placement = "exterior"
}: {
  outline: PlanPoint[]; puf: number; bayFt: number; widthFt: number;
  frameTall: number; scaffoldWidthFt: number;
  placement?: "exterior" | "interior";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const [rotating, setRotating] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const W = mountRef.current.clientWidth, H = mountRef.current.clientHeight;
    // If the container has no size yet (can happen right as a tab/panel
    // becomes visible, before layout settles), clamp to a safe minimum
    // instead of building a scene with a NaN/zero camera aspect ratio —
    // that produces a canvas that looks frozen/static even though the
    // render loop is technically still running. The resize observer
    // below corrects the real size as soon as layout settles.
    const initialW = W || 400, initialH = H || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080604);
    scene.fog = new THREE.FogExp2(0x080604, 0.018);

    const camera = new THREE.PerspectiveCamera(50, initialW / initialH, 0.1, 500);

    // WebGLRenderer creation throws if the browser can't get a GPU
    // context. Separately, this machine has a CONFIRMED compositing
    // failure: a live, correctly-sized canvas with a healthy render loop
    // still displays blank white (verified via Inspect — canvas exists,
    // three.js initialized, loop runs, no context-lost event). So this
    // uses the most conservative rendering path available: no antialias
    // (heaviest compositing feature, common trigger on flaky drivers),
    // no shadow maps, pixel ratio capped at 1, low-power GPU preference
    // (avoids discrete-GPU driver bugs on Windows laptops/desktops), and
    // Default swap behaviour. preserveDrawingBuffer used to be set here so
    // frames could be read back out with toDataURL - that readback was what
    // froze the browser, so both are gone.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "low-power",
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      console.error("[3D model] Failed to create WebGL renderer — likely out of GPU contexts. Try fully restarting the browser.", err);
      setRenderError("3D view unavailable right now (couldn't get a GPU context). Try fully closing and reopening the browser, then reload this page.");
      return;
    }
    renderer.setSize(initialW, initialH);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    /*
     * Fill the mount, whatever size it turns out to be.
     *
     * Three.js sizes the canvas in attributes, which is the size it renders at
     * - not the size it occupies. Mounted before layout settles, those numbers
     * are the 400x300 fallback and the canvas sits at that size in a corner of
     * a panel several times larger, which reads as nothing being there at all.
     */
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // And keep it right as the panel changes size.
    const mountEl = mountRef.current;
    const observer = new ResizeObserver(() => {
      const w = mountEl.clientWidth, h = mountEl.clientHeight;
      if (w > 0 && h > 0) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    observer.observe(mountEl);

    // TEMPORARY DIAGNOSTIC — the render loop was proven to be running
    // correctly (angle/frame count incrementing on schedule) while the
    // view stayed visually frozen. That specific pattern is the known
    // signature of a lost/exhausted WebGL context — render() keeps
    // getting called and doesn't throw, but the browser silently stops
    // compositing it. These listeners confirm it directly. Safe to
    // remove once confirmed either way.
    const canvas = renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.error("[3D model] WEBGL CONTEXT LOST", e);
    };
    const onContextRestored = () => {
      console.warn("[3D model] WebGL context restored");
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);

    // Keep the renderer/camera matched to the container if it resizes
    // later (e.g. switching tabs, resizing the window) — a stale size
    // here is the other common cause of a 3D view that looks frozen.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width, h = entry.contentRect.height;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mountRef.current);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(20, 30, 15); sun.castShadow = true; scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8080ff, 0.3);
    fill.position.set(-10, 5, -5); scene.add(fill);
    const orange = new THREE.PointLight(0xf97316, 0.5, 60);
    orange.position.set(0, 10, 10); scene.add(orange);

    // Materials
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xbababa, metalness: 0.85, roughness: 0.25 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x7c5c1a, roughness: 0.9 });
    const braceMat = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.7, roughness: 0.4 });
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
    const groundMat= new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1.0 });

    const BAY_H = 6.333 * 0.3; // frame height in scene units
    const SCAF_D = scaffoldWidthFt * 0.3; // scaffold depth
    const jumps = Math.min(frameTall, 20);

    // Auto-scale: normalize outline to reasonable scene size regardless of SVG coordinate range
    const allX = outline.map(p => p.x), allZ = outline.map(p => p.y);
    const bldgW = Math.max(...allX) - Math.min(...allX);
    const bldgH = Math.max(...allZ) - Math.min(...allZ);
    const maxDim = Math.max(bldgW, bldgH, 1);
    const targetSize = 28; // scene units
    const sceneScale = targetSize / maxDim;

    // Convert outline to scene coords centered on centroid
    const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length;
    const pts3d = outline.map(p => ({ x: (p.x - cx) * sceneScale, z: (p.y - cy) * sceneScale }));

    // Ground
    const gSize = 120;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // Build wall and scaffold around perimeter
    const group = new THREE.Group();

    for (let si = 0; si < pts3d.length; si++) {
      const p1 = pts3d[si], p2 = pts3d[(si + 1) % pts3d.length];
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (segLen < 0.1) continue;
      const ax = dx / segLen, az = dz / segLen;
      // Outward normal computed on the ORIGINAL (unscaled) outline, using
      // the same winding-aware test the Floor Plan panel uses — a naive
      // 90° rotation here doesn't know which side is actually outside the
      // building, and was putting scaffold on the interior whenever a
      // trace happened to wind the "wrong" way.
      const rawA = outline[si], rawB = outline[(si + 1) % outline.length];
      const outwardNormal = computeOutwardNormal(rawA, rawB, outline, placement);
      const nx = outwardNormal.x, nz = outwardNormal.y;

      // Wall panel
      const wallH = jumps * BAY_H;
      const wallGeo = new THREE.BoxGeometry(segLen, wallH, 0.08);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set((p1.x + p2.x) / 2, wallH / 2, (p1.z + p2.z) / 2);
      wall.rotation.y = -Math.atan2(dz, dx);
      group.add(wall);

      // Scaffold along this segment
      const bayPx = bayFt * puf;
      const segPx = segLen / sceneScale;
      const numBays = Math.max(1, Math.round(segPx / bayPx));
      const actualBayLen = segLen / numBays;
      const wallOff = 1 * puf * sceneScale;

      for (let b = 0; b <= numBays; b++) {
        const t = b / numBays;
        const lx = p1.x + dx * t + nx * wallOff;
        const lz = p1.z + dz * t + nz * wallOff;
        const ox = lx + nx * SCAF_D;
        const oz = lz + nz * SCAF_D;

        for (let j = 0; j < jumps; j++) {
          const y = j * BAY_H;
          // Inner leg (wall side)
          const legGeo = new THREE.CylinderGeometry(0.025, 0.025, BAY_H, 6);
          const leg1 = new THREE.Mesh(legGeo, frameMat); leg1.position.set(lx, y + BAY_H / 2, lz); leg1.castShadow = true; group.add(leg1);
          // Outer leg
          const leg2 = new THREE.Mesh(legGeo, frameMat); leg2.position.set(ox, y + BAY_H / 2, oz); leg2.castShadow = true; group.add(leg2);
          // Frame crossbar
          const cbGeo = new THREE.CylinderGeometry(0.018, 0.018, SCAF_D, 5);
          const cb = new THREE.Mesh(cbGeo, frameMat);
          cb.rotation.x = Math.PI / 2;
          cb.position.set((lx + ox) / 2, y + BAY_H * 0.65, (lz + oz) / 2); group.add(cb);
          // Screw jacks
          if (j === 0) {
            const jkGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.2, 5);
            const jk1 = new THREE.Mesh(jkGeo, frameMat); jk1.position.set(lx, 0.1, lz); group.add(jk1);
            const jk2 = new THREE.Mesh(jkGeo, frameMat); jk2.position.set(ox, 0.1, oz); group.add(jk2);
          }
        }

        // Cross braces and planks between bays
        if (b < numBays) {
          const nx2 = p1.x + dx * ((b + 1) / numBays) + nx * wallOff;
          const nz2 = p1.z + dz * ((b + 1) / numBays) + nz * wallOff;
          const ox2 = nx2 + nx * SCAF_D;
          const oz2 = nz2 + nz * SCAF_D;

          for (let j = 0; j < jumps; j++) {
            const y = j * BAY_H;
            // X brace front
            const bl = Math.sqrt(actualBayLen ** 2 + BAY_H ** 2);
            const brGeo = new THREE.CylinderGeometry(0.015, 0.015, bl, 4);
            const ang = Math.atan2(BAY_H, actualBayLen);
            const brMid = new THREE.Vector3((lx + nx2) / 2, y + BAY_H / 2, (lz + nz2) / 2);
            const br = new THREE.Mesh(brGeo, braceMat);
            br.position.copy(brMid);
            br.rotation.z = ang;
            br.rotation.y = -Math.atan2(dz, dx);
            group.add(br);

            // Planks
            const ppb = planksPerBay(scaffoldWidthFt >= 5 ? "5'" : scaffoldWidthFt >= 3.5 ? "3'-6\"" : "3'");
            const plankW = actualBayLen * 0.95;
            for (let p = 0; p < Math.min(ppb, 4); p++) {
              const pt = (p + 0.5) / ppb;
              const px = lx + ax * actualBayLen * 0.5 + nx * (wallOff + SCAF_D * pt);
              const pz = lz + az * actualBayLen * 0.5 + nz * (wallOff + SCAF_D * pt);
              const plGeo = new THREE.BoxGeometry(plankW, 0.04, SCAF_D / ppb * 0.85);
              const pl = new THREE.Mesh(plGeo, plankMat);
              pl.position.set(px, y + BAY_H + 0.02, pz);
              pl.rotation.y = -Math.atan2(dz, dx);
              pl.castShadow = true; pl.receiveShadow = true; group.add(pl);
            }

            // Guardrail
            const grGeo = new THREE.CylinderGeometry(0.012, 0.012, actualBayLen, 4);
            const gr = new THREE.Mesh(grGeo, frameMat);
            gr.position.set((ox + ox2) / 2, j * BAY_H + BAY_H + 0.8, (oz + oz2) / 2);
            gr.rotation.z = Math.PI / 2; gr.rotation.y = -Math.atan2(dz, dx); group.add(gr);
          }
        }
      }
    }

    scene.add(group);
    scene.add(new THREE.GridHelper(gSize, 40, 0x111111, 0x111111));

    // Camera orbit
    const bbox = new THREE.Box3().setFromObject(group);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const camSize = Math.max(size.x, size.z);
    const camDist = camSize * 1.5 + 5;
    camera.position.set(center.x + camDist, camDist * 0.6, center.z + camDist);
    camera.lookAt(center.x, center.y * 0.5, center.z);

    let angle = Math.atan2(camDist, camDist);
    let isRotating = true;
    let zoomFactor = 1;
    (mountRef.current as any).__setRotating = (v: boolean) => { isRotating = v; };
    (mountRef.current as any).__setZoomFactor = (z: number) => { zoomFactor = z; };
    (mountRef.current as any).__snapshot = () => renderer.domElement.toDataURL("image/png");

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      // TEMPORARY DIAGNOSTIC — logs once every ~2 seconds so we can see in
      // the browser console whether this loop is actually running and
      // what isRotating/angle actually are, instead of guessing again.
      // Safe to remove once rotation is confirmed working.
      if (isRotating) {
        angle += 0.004;
        camera.position.set(
          center.x + Math.sin(angle) * camDist * zoomFactor,
          camDist * 0.55 * zoomFactor,
          center.z + Math.cos(angle) * camDist * zoomFactor
        );
        camera.lookAt(center.x, center.y * 0.4, center.z);
      } else {
        // Still respond to zoom changes while paused, using the last angle.
        camera.position.set(
          center.x + Math.sin(angle) * camDist * zoomFactor,
          camDist * 0.55 * zoomFactor,
          center.z + Math.cos(angle) * camDist * zoomFactor
        );
        camera.lookAt(center.x, center.y * 0.4, center.z);
      }
      renderer.render(scene, camera);
      // IMAGE-MIRROR WORKAROUND — this machine's browser compositing of
      // live WebGL canvases is broken (confirmed: the Capture PNG shows a
      // perfect scene while the on-screen canvas displays blank white; the
      // GPU draws fine, only the final canvas→screen step fails). Ordinary
    }
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      renderer.dispose();
      // forceContextLoss() depends on the WEBGL_lose_context extension,
      // which isn't guaranteed to exist on every browser/GPU — an
      // unguarded call here was throwing and taking down the whole
      // render tree on systems without it. dispose() above already does
      // the important cleanup; this is a best-effort extra that must
      // never be allowed to crash anything.
      try { renderer.forceContextLoss(); } catch { /* not supported here — safe to ignore */ }
      try { observer.disconnect(); } catch { /* already gone */ }
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [outline, bayFt, widthFt, frameTall, scaffoldWidthFt, puf, placement]);

  useEffect(() => {
    if (mountRef.current) (mountRef.current as any).__setRotating?.(rotating);
  }, [rotating]);

  useEffect(() => {
    if (mountRef.current) (mountRef.current as any).__setZoomFactor?.(zoom);
  }, [zoom]);

  function handleCapture() {
    const dataUrl = (mountRef.current as any)?.__snapshot?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `scaffold-3d-view-${Date.now()}.png`;
    a.click();
  }

  if (renderError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center max-w-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">⚠ 3D View Unavailable</p>
          <p className="mt-2 text-xs text-zinc-400">{renderError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative overflow-hidden rounded-t-lg bg-[#080604]" style={{ minHeight: 0 }}>
        {/*
          * The canvas, shown directly.
          *
          * This used to be hidden behind an <img> that received a JPEG of
          * every fifth frame, as a workaround for one machine's compositing.
          * toDataURL forces a full GPU readback and a JPEG encode on the main
          * thread - twelve times a second, on a scene with hundreds of meshes.
          * That is what was freezing the browser and warping the model, and no
          * compositing bug is worth paying that.
          */}
        <div ref={mountRef} className="absolute inset-0" />
        {renderError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <p className="max-w-xs text-[11px] leading-[1.6] text-zinc-500">{renderError}</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0b0b0b] border-t border-zinc-900 flex-shrink-0">
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold flex-shrink-0">−</button>
        <span className="text-[9px] font-mono text-zinc-600 w-9 text-center flex-shrink-0">{Math.round((1 / zoom) * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold flex-shrink-0">+</button>
        <button onClick={() => setRotating(r => !r)}
          className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-bold transition ${rotating ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}>
          {rotating ? "⏸ Pause" : "▶ Resume"}
        </button>
        <button onClick={handleCapture}
          className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[9px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300 transition">
          📷 Capture
        </button>
      </div>
    </div>
  );
}

// ── Section View SVG ──────────────────────────────────────────────────────────
// Renders: the traced wall profile (steps, setbacks, decks — from
// sectionView.wallOutline, converted image px → feet via
// scale.pageUnitsPerFoot), the scaffold stacked on the chosen side at
// the wall offset, level labels, frame height labels, cross braces, and
// a drag-and-drop tray of frame/bracket pieces the estimator can drop
// onto the drawing where Korban may have missed. Dropped pieces feed
// straight back into material counts via onDropPiece.
function SectionViewPanel({
  wallOutline, wallOffset, frameTall, scaffoldWidthFt, scaffoldSide,
  draftingAdditions, onDropPiece, onRemovePiece, onToggleSide, sectionType,
  isExpanded, onToggleExpand,
}: {
  wallOutline: PlanPoint[]; wallOffset: number; frameTall: number;
  scaffoldWidthFt: number; scaffoldSide: "left" | "right";
  draftingAdditions: SectionDraftingItem[];
  onDropPiece: (kind: "frame" | "bracket", variant: string, level: number) => void;
  onRemovePiece: (id: string) => void;
  onToggleSide: (side: "left" | "right") => void;
  sectionType: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragKind, setDragKind] = useState<{ kind: "frame" | "bracket"; variant: string } | null>(null);

  const FRAME_H_FT = 6.333;
  const pxPerFt = 14;
  const frameHPx = FRAME_H_FT * pxPerFt;
  const totalH = Math.max(1, frameTall) * frameHPx;
  const widthPx = Math.max(scaffoldWidthFt, 0.1) * pxPerFt;
  const wallOffPx = Math.max(wallOffset, 0.5) * pxPerFt;

  const hasWallTrace = wallOutline.length >= 2;

  // Takeoff Workspace's Section View "Store" step converts the traced
  // wall outline to feet-space once, using whichever scale was active
  // at trace time — x = linear footage along the wall, y = height in
  // feet from the lowest traced point. No further scale conversion is
  // needed here, so this just reads the points as given.
  const wallPts = useMemo(() => (hasWallTrace ? wallOutline : ([] as PlanPoint[])), [wallOutline, hasWallTrace]);

  const wallSpanFt = wallPts.length ? Math.max(1, Math.max(...wallPts.map(p => p.x))) : 14;
  const wallDrawX0 = 24;
  const wallPolyPx = wallPts.map(p => `${wallDrawX0 + p.x * pxPerFt},${totalH - p.y * pxPerFt}`).join(" ");

  // Both sides measure the same wallOffPx distance from the SAME wall
  // reference point (its start edge). This is a one-bay cross-section —
  // the scaffold sits right next to the wall face, not pushed out by
  // the wall's entire traced linear footage (that was the bug: "Scaffold
  // Right" previously added the wall's full span as if it were the
  // standoff distance, so the more wall you traced, the further away
  // the scaffold drifted, and each side used a different reference
  // point entirely).
  const scaffX = scaffoldSide === "left"
    ? wallDrawX0 - wallOffPx - widthPx
    : wallDrawX0 + wallOffPx;

  const rightExtent = Math.max(scaffX + widthPx, wallDrawX0 + wallSpanFt * pxPerFt);
  const svgOriginX = Math.min(0, scaffX - 14, wallDrawX0 - 14);
  const svgW = rightExtent + 60 - svgOriginX;
  const [sectionZoom, setSectionZoom] = useState(1);
  const [sectionPan, setSectionPan] = useState({ dx: 0, dy: 0 });
  const [isPanningSection, setIsPanningSection] = useState(false);
  const svgCenterX = svgOriginX + svgW / 2;
  const svgCenterY = -22 + (totalH + 62) / 2;
  const zoomedW = svgW / sectionZoom;
  const zoomedH = (totalH + 62) / sectionZoom;
  const zoomedX = svgCenterX - zoomedW / 2 + sectionPan.dx;
  const zoomedY = svgCenterY - zoomedH / 2 + sectionPan.dy;

  function handleDrop(e: any) {
    e.preventDefault();
    if (!dragKind || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vb = svgRef.current.viewBox.baseVal;
    const relY = (e.clientY - rect.top) / rect.height;
    const yInVb = vb.y + relY * vb.height;
    const level = Math.max(0, Math.min(frameTall - 1, Math.floor(yInVb / frameHPx)));
    onDropPiece(dragKind.kind, dragKind.variant, level);
    setDragKind(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Wall side toggle + zoom */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-900 bg-[#0a0a0a] flex-shrink-0 gap-2">
        <span className="text-[8px] uppercase tracking-wider text-zinc-600">Scaffold Side</span>
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          <button onClick={() => onToggleSide("left")}
            className={`px-2.5 py-0.5 text-[8px] font-bold transition ${scaffoldSide === "left" ? "bg-orange-500 text-black" : "text-zinc-500 hover:text-zinc-300"}`}>
            Scaffold Left
          </button>
          <button onClick={() => onToggleSide("right")}
            className={`px-2.5 py-0.5 text-[8px] font-bold transition ${scaffoldSide === "right" ? "bg-orange-500 text-black" : "text-zinc-500 hover:text-zinc-300"}`}>
            Scaffold Right
          </button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setSectionZoom(z => Math.max(0.3, z - 0.15))} className="rounded border border-zinc-800 w-5 h-5 text-zinc-400 hover:text-white text-[10px] font-bold">−</button>
          <span className="text-[8px] font-mono text-zinc-600 w-8 text-center">{Math.round(sectionZoom * 100)}%</span>
          <button onClick={() => setSectionZoom(z => Math.min(4, z + 0.15))} className="rounded border border-zinc-800 w-5 h-5 text-zinc-400 hover:text-white text-[10px] font-bold">+</button>
          <button onClick={() => { setSectionZoom(1); setSectionPan({ dx: 0, dy: 0 }); }} className="rounded border border-zinc-800 px-1.5 h-5 text-[8px] text-zinc-500 hover:text-white">Fit</button>
          <button onClick={onToggleExpand} title={isExpanded ? "Collapse" : "Expand"}
            className="rounded border border-zinc-800 px-1.5 h-5 text-[9px] text-zinc-400 hover:text-white hover:border-orange-500/40">
            {isExpanded ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      {/* SVG drawing */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-2 overflow-hidden relative">
        {!hasWallTrace && (
          <p className="absolute inset-x-3 top-2 text-[8.5px] text-zinc-600 text-center leading-relaxed z-10">
            No wall outline traced yet — trace the wall in Takeoff&apos;s Section View tab to render the real profile here. Showing scaffold only.
          </p>
        )}
        <svg
          ref={svgRef}
          viewBox={`${zoomedX} ${zoomedY} ${zoomedW} ${zoomedH}`}
          className="w-full h-full"
          style={{ maxHeight: "100%", maxWidth: "100%", cursor: isPanningSection ? "grabbing" : "grab" }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onMouseDown={() => setIsPanningSection(true)}
          onMouseMove={e => {
            if (!isPanningSection || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect(), vb = svgRef.current.viewBox.baseVal;
            const sx = vb.width / rect.width, sy = vb.height / rect.height;
            setSectionPan(p => ({ dx: p.dx - e.movementX * sx, dy: p.dy - e.movementY * sy }));
          }}
          onMouseUp={() => setIsPanningSection(false)}
          onMouseLeave={() => setIsPanningSection(false)}>

          {/* Wall profile — actual traced outline */}
          {hasWallTrace && (
            <>
              <polyline points={wallPolyPx} fill="none" stroke="#ef4444" strokeWidth="1.2" />
              <text x={wallDrawX0} y={-8} fontSize="4" fill="#ef4444" fontFamily="monospace">WALL OUTLINE (TRACED)</text>
            </>
          )}

          {/* Scaffold frames per level, bottom to top */}
          {Array.from({ length: frameTall }).map((_, jFromBottom) => {
            const level = frameTall - 1 - jFromBottom; // level index (0 = ground)
            const y = jFromBottom * frameHPx;
            const levelLabel = level === frameTall - 1 ? "Roof" : `Lvl ${level + 1}`;
            const plankN = scaffoldWidthFt >= 5 ? 4 : 3;
            const plW = (widthPx - 2) / plankN;

            return (
              <g key={level}>
                <rect x={scaffX} y={y} width={widthPx} height={frameHPx} fill="none" stroke="#9ca3af" strokeWidth="0.6" />
                {/* cross brace X */}
                <line x1={scaffX} y1={y} x2={scaffX + widthPx} y2={y + frameHPx} stroke="#6b7280" strokeWidth="0.5" opacity="0.5" />
                <line x1={scaffX + widthPx} y1={y} x2={scaffX} y2={y + frameHPx} stroke="#6b7280" strokeWidth="0.5" opacity="0.5" />
                {/* planks on top of this level */}
                {Array.from({ length: plankN }).map((_, p) => (
                  <rect key={p} x={scaffX + 1 + p * plW} y={y - 2.2} width={plW - 0.5} height="2.2"
                    fill="#92400e" stroke="#78350f" strokeWidth="0.2" />
                ))}
                {/* level label — left */}
                <text x={scaffX - 4} y={y + frameHPx / 2} textAnchor="end" dominantBaseline="middle"
                  fontSize="3.6" fill="#a1a1aa" fontFamily="monospace">{levelLabel}</text>
                {/* frame height dimension — right */}
                <text x={scaffX + widthPx + 4} y={y + frameHPx / 2} dominantBaseline="middle"
                  fontSize="3.4" fill="#71717a" fontFamily="monospace">{FRAME_H_FT.toFixed(2)}&apos;</text>
              </g>
            );
          })}

          {/* Hand-placed additions */}
          {draftingAdditions.map(item => {
            const y = (frameTall - 1 - item.level) * frameHPx;
            if (item.kind === "frame") {
              return (
                <g key={item.id} style={{ cursor: "pointer" }} onClick={() => onRemovePiece(item.id)}>
                  <rect x={scaffX + 2} y={y + 2} width={widthPx - 4} height={frameHPx - 4}
                    fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="0.8" strokeDasharray="2,1" />
                  <text x={scaffX + widthPx / 2} y={y + frameHPx / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize="3" fill="#f97316" fontFamily="monospace">{item.variant}</text>
                </g>
              );
            }
            return (
              <g key={item.id} style={{ cursor: "pointer" }} onClick={() => onRemovePiece(item.id)}>
                <polygon points={`${scaffX + widthPx},${y + frameHPx} ${scaffX + widthPx + 10},${y + frameHPx} ${scaffX + widthPx},${y + frameHPx - 10}`}
                  fill="rgba(249,115,22,0.3)" stroke="#f97316" strokeWidth="0.6" />
              </g>
            );
          })}

          {/* Section cut label */}
          <text x={scaffX} y={totalH + 32} fontSize="5" fill="#f97316" fontFamily="monospace" fontWeight="bold">{sectionType}</text>
          <text x={scaffX + widthPx / 2} y={totalH + 42} textAnchor="middle" fontSize="4" fill="#2563eb" fontFamily="monospace">{scaffoldWidthFt}&apos; wide</text>

          {/* Wall offset dimension */}
          {hasWallTrace && (
            <>
              <line
                x1={scaffoldSide === "left" ? scaffX + widthPx : wallDrawX0}
                y1={totalH + 10}
                x2={scaffoldSide === "left" ? wallDrawX0 : scaffX}
                y2={totalH + 10}
                stroke="#f97316" strokeWidth="0.5" />
              <text
                x={((scaffoldSide === "left" ? scaffX + widthPx : wallDrawX0) +
                    (scaffoldSide === "left" ? wallDrawX0 : scaffX)) / 2}
                y={totalH + 18} textAnchor="middle" fontSize="3.6" fill="#f97316" fontFamily="monospace">{wallOffset}&apos; offset</text>
            </>
          )}
        </svg>
      </div>

      {/* Drafting pieces tray */}
      <div className="border-t border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0 space-y-1.5">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-zinc-600 mb-1">Frames — drag onto drawing</p>
          <div className="flex gap-1.5 flex-wrap">
            {FRAME_TYPES.map(f => (
              <div key={f.id} draggable
                onDragStart={() => setDragKind({ kind: "frame", variant: f.label })}
                className="cursor-grab select-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[8px] text-zinc-300 hover:border-orange-500/50">
                {f.label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider text-zinc-600 mb-1">Brackets — drag onto drawing</p>
          <div className="flex gap-1.5 flex-wrap">
            {BRACKET_TYPES.map(b => (
              <div key={b.id} draggable
                onDragStart={() => setDragKind({ kind: "bracket", variant: b.label })}
                className="cursor-grab select-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[8px] text-zinc-300 hover:border-orange-500/50">
                {b.label}
              </div>
            ))}
          </div>
        </div>
        {draftingAdditions.length > 0 && (
          <p className="text-[7.5px] text-zinc-700 italic">Click a placed piece on the drawing to remove it.</p>
        )}
      </div>
    </div>
  );
}

// ── Frame Config Options ──────────────────────────────────────────────────────
// Shows up to 3 real, buildable frame combinations (6'-4"/5'/3' + screw
// jack) that reach the same effective height — never an invented frame
// size. If a wall is short enough that only one sensible combination
// exists, the remaining slot(s) show a plain note instead of padding
// with duplicates.
function FrameConfigOptions({
  effectiveHeightFt, screwJackMaxExtensionIn, scaffoldWidthFt,
}: { effectiveHeightFt: number; screwJackMaxExtensionIn: number; scaffoldWidthFt: number }) {
  const options = useMemo(
    () => findFrameMakeupOptions(effectiveHeightFt, screwJackMaxExtensionIn, 3),
    [effectiveHeightFt, screwJackMaxExtensionIn],
  );
  const labels = ["Optimal", "Alternate B", "Alternate C"];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Frame Configuration Options</p>
      </div>
      <div className="px-3 pt-2 pb-3 space-y-2">
        {labels.map((label, i) => {
          const opt = options[i];
          if (!opt) {
            return (
              <div key={label} className="rounded-xl border border-zinc-800 bg-black p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-zinc-600">{label}</p>
                <p className="text-[8px] text-zinc-600 italic">No further recommendations beyond optimal approach</p>
              </div>
            );
          }
          return (
            <div key={label} className={`rounded-xl border p-2.5 ${i === 0 ? "border-orange-500/40 bg-orange-500/5" : "border-zinc-800 bg-black"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${i === 0 ? "text-orange-300" : "text-zinc-400"}`}>{label}</p>
              <div className="space-y-1">
                {opt.pieces.map((p) => (
                  <div key={p.label} className="flex justify-between text-[9px]">
                    <span className="text-zinc-600">{p.label} Frame</span>
                    <span className="font-mono text-zinc-300">× {p.qty}</span>
                  </div>
                ))}
                {opt.screwJackExtensionIn > 0.05 && (
                  <div className="flex justify-between text-[9px]">
                    <span className="text-zinc-600">Screw Jack</span>
                    <span className="font-mono text-zinc-300">{opt.screwJackExtensionIn.toFixed(1)}&quot;</span>
                  </div>
                )}
                <div className="flex justify-between text-[9px]">
                  <span className="text-zinc-600">Total Frames</span>
                  <span className="font-mono text-zinc-300">{opt.frameTall}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-zinc-600">Width</span>
                  <span className="font-mono text-zinc-300">{scaffoldWidthFt}&apos;</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SetScaffoldV2Inner() {
  const [scaffoldWidth,  setScaffoldWidth]  = useState<ScaffoldWidth>("3'");
  const [bayLength,      setBayLength]      = useState("10'");
  const [showOverlay,    setShowOverlay]    = useState(true);
  const [showScaffold,   setShowScaffold]   = useState(true);
  const [editMode,       setEditMode]       = useState(false);
  /** Point-to-point measuring on the plan. A read, never an edit. */
  /** Which cut is on screen. Each carries its own profile, scale and drawing. */
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  /**
   * Which elevation the store handed back, and why.
   *
   * "blank - not saved" means the lookup found nothing and produced an empty
   * one, which is how a page comes to show no takeoff on a job that has one.
   */
  const [elevationSource, setElevationSource] = useState<string>("matched");
  /** Whether the project on screen is the one that was active, or a stand-in. */
  const [projectSource, setProjectSource] = useState<string>("matched");
  /** Anything that went wrong loading, said out loud rather than swallowed. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [measureMode,    setMeasureMode]    = useState(false);
  const [measureFrom,    setMeasureFrom]    = useState<PlanPoint|null>(null);
  const [measureTo,      setMeasureTo]      = useState<PlanPoint|null>(null);
  const [measurements,   setMeasurements]   = useState<{ a: PlanPoint; b: PlanPoint; ft: number }[]>([]);
  /**
   * Runs drawn by hand. Anywhere the traced outline does not describe - a
   * courtyard face, a canopy line, a return the plan does not show - gets
   * drawn here and counts exactly like a wall does.
   */
  const [addRunMode,     setAddRunMode]     = useState(false);
  const [runStart,       setRunStart]       = useState<PlanPoint|null>(null);
  const [runEnd,         setRunEnd]         = useState<PlanPoint|null>(null);
  const [pendingRun,     setPendingRun]     = useState<{ a: PlanPoint; b: PlanPoint }|null>(null);
  const [pendingHeight,  setPendingHeight]  = useState("");
  const [drawnRuns,      setDrawnRuns]      = useState<{ id: string; a: PlanPoint; b: PlanPoint; heightFt: number; flipped: boolean }[]>([]);
  /** Off, a run goes exactly where it is drawn. On, it lines up. */
  const [snapAngle,      setSnapAngle]      = useState(true);
  const [activeMainTab,  setActiveMainTab]  = useState<"overlay" | "section">("overlay");
  const [sectionExpanded, setSectionExpanded] = useState(false);
  // Estimate depth gates which views are available here. Quick Bid shows
  // counts and frame config only — no layout, no 3D, no sections.
  const [estimateDepth, setEstimateDepthState] = useState<EstimateDepth>("korban-bid");
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const [deletedLegKeys, setDeletedLegKeys] = useState<Set<string>>(new Set());
  const [overriddenFC,   setOverriddenFC]   = useState<Record<string, number>>({});
  const [legOffsets,     setLegOffsets]     = useState<Record<string, { dx: number; dy: number }>>({});
  const [draggedLegKey,  setDraggedLegKey]  = useState<string | null>(null);
  const [viewerZoom,     setViewerZoom]     = useState(1);
  const [viewerPan,      setViewerPan]      = useState({ dx: 0, dy: 0 });
  const [isPanning,      setIsPanning]      = useState(false);
  const [elevation,      setElevation]      = useState<ProjectElevation | null>(null);
  const [projectName,    setProjectName]    = useState("");
  /** Everything the title block prints. Read from the project, not typed in. */
  const [sheetInfo,      setSheetInfo]      = useState({
    jobNumber: "", address: "", customer: "", estimator: "", company: "",
  });
  const [mounted,        setMounted]        = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const frameHeight       = 6.333;
  const workerReachHeight = getBackendSettings()?.scaffold?.workerReachHeight ?? 6;
  const screwJackMaxExtensionIn = getBackendSettings()?.scaffold?.screwJackMaxExtension ?? 12;
  // Material rules come from backend settings so each company can encode
  // its own standard; the defaults are standard practice.
  const MATERIAL_RULES = useMemo(() => {
    const sc = (getBackendSettings()?.scaffold ?? {}) as Record<string, number | undefined>;
    return {
      crossBracesPerBayPerLift: sc.crossBracesPerBayPerLift ?? MATERIAL_RULE_DEFAULTS.crossBracesPerBayPerLift,
      guardrailTopPerBay: sc.guardrailTopPerBay ?? MATERIAL_RULE_DEFAULTS.guardrailTopPerBay,
      guardrailIntermediatePerBay: sc.guardrailIntermediatePerBay ?? MATERIAL_RULE_DEFAULTS.guardrailIntermediatePerBay,
      couplingPinsPerFrame: sc.couplingPinsPerFrame ?? MATERIAL_RULE_DEFAULTS.couplingPinsPerFrame,
    };
  }, []);
  const frameTall         = elevation?.quantityEngine?.frameTall ?? 7;
  const effectiveStackHeightFt = Math.max(0, (elevation?.wallHeight ?? 0) - workerReachHeight);
  const scaffoldWidthFt   = parseFt(scaffoldWidth);
  const bayLengthFt       = parseFt(bayLength) || 10;
  const ppb               = planksPerBay(scaffoldWidth);
  const isAerial = elevation?.overlayGeometry?.fullOverlayRows?.some((r: any) => r.overlayType === "Aerial") ?? false;
  const puf      = elevation?.scale?.pageUnitsPerFoot ?? (isAerial ? 4 : null);
  const scaleOk  = (puf != null && puf > 0) || isAerial;
  const effPuf   = puf ?? 4;

  const rawPoints = useMemo(() => getPrimaryGeometryPoints(elevation), [elevation]);
  const outline   = rawPoints.length >= 3 ? rawPoints : FALLBACK;

  /**
   * Every level that was traced, with the key one first.
   *
   * A building is not one outline. The key level sets the line most of the
   * scaffold follows, and any level whose wall moves away from it needs its
   * own run - which is the thing that previously had to be drawn by hand.
   */
  const levelOutlines = useMemo(() => {
    const rows = elevation?.overlayGeometry?.fullOverlayRows ?? [];
    return rows
      .filter(r => (r.points?.length ?? 0) >= 3)
      .map(r => ({
        id: String(r.id),
        name: r.level || "Level",
        isKey: Boolean(r.isKeyFloor),
        color: r.color || "#f97316",
        points: r.points as PlanPoint[],
      }))
      .sort((a, b) => Number(b.isKey) - Number(a.isKey));
  }, [elevation]);

  /**
   * Walls that only exist on a level other than the key one.
   *
   * Each non-key level is measured against the key outline. A wall that sits
   * within three feet of the key line is already covered - the same run carries
   * up past it, and anything it needs is reached with a bracket. A wall further
   * out than that, or turned away from it, is on its own line and gets its own
   * run.
   *
   * Specification section 3b.
   */
  /**
   * Recesses in the traced plan, and what Korban decided to do with each.
   *
   * Computed here as well as inside the leg engine so the material and the
   * guidance can talk about them. Cheap - it is a walk of the outline.
   */
  const recesses = useMemo(() => {
    if (!scaleOk || effPuf <= 0 || outline.length < 5) return [];
    return findRecesses(simplifyOutline(outline, effPuf), effPuf, bayLengthFt);
  }, [outline, scaleOk, effPuf, bayLengthFt]);

  const deviatingWalls = useMemo(() => {
    if (levelOutlines.length < 2 || effPuf <= 0) return [];
    const key = levelOutlines.find(l => l.isKey) ?? levelOutlines[0];
    const DEVIATION_FT = 3;
    const threshold = DEVIATION_FT * effPuf;

    /** How far a point sits from the nearest wall of the key outline, and how square to it. */
    function measureAgainstKey(a: PlanPoint, b: PlanPoint) {
      let nearest = Infinity;
      let parallel = false;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = { x: dx / len, y: dy / len };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      for (let i = 0; i < key.points.length; i++) {
        const p = key.points[i], q = key.points[(i + 1) % key.points.length];
        const kdx = q.x - p.x, kdy = q.y - p.y;
        const klen = Math.hypot(kdx, kdy);
        if (klen < 1e-6) continue;
        const kdir = { x: kdx / klen, y: kdy / klen };

        // Distance from this wall's midpoint to that key wall.
        const t = Math.max(0, Math.min(1, ((mid.x - p.x) * kdx + (mid.y - p.y) * kdy) / (klen * klen)));
        const foot = { x: p.x + kdx * t, y: p.y + kdy * t };
        const dist = Math.hypot(mid.x - foot.x, mid.y - foot.y);

        if (dist < nearest) {
          nearest = dist;
          // Square within about ten degrees counts as running the same way.
          parallel = Math.abs(dir.x * kdir.x + dir.y * kdir.y) > 0.985;
        }
      }
      return { nearest, parallel };
    }

    const out: { levelId: string; levelName: string; color: string; a: PlanPoint; b: PlanPoint; reason: string; levelPoints: PlanPoint[] }[] = [];
    levelOutlines.filter(l => !l.isKey).forEach(level => {
      for (let i = 0; i < level.points.length; i++) {
        const a = level.points[i], b = level.points[(i + 1) % level.points.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < effPuf) continue;
        const { nearest, parallel } = measureAgainstKey(a, b);
        // A wall that turns away from the key line is always its own run,
        // however close it sits. A parallel one has to move three feet.
        if (!parallel) {
          out.push({ levelId: level.id, levelName: level.name, color: level.color, a, b, levelPoints: level.points, reason: "turns off the key line" });
        } else if (nearest >= threshold) {
          out.push({ levelId: level.id, levelName: level.name, color: level.color, a, b, levelPoints: level.points, reason: `${(nearest / effPuf).toFixed(1)}' off key line` });
        }
      }
    });
    return out;
  }, [levelOutlines, effPuf]);

  // SVG viewbox
  const svgViewBox = useMemo(() => {
    const pts = outline.filter(isFinitePoint);
    if (pts.length < 2) return { x: 0, y: 0, w: 1200, h: 720 };
    const minX = pts.reduce((m, p) => p.x < m ? p.x : m, Infinity);
    const maxX = pts.reduce((m, p) => p.x > m ? p.x : m, -Infinity);
    const minY = pts.reduce((m, p) => p.y < m ? p.y : m, Infinity);
    const maxY = pts.reduce((m, p) => p.y > m ? p.y : m, -Infinity);
    const pad = effPuf * 10;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [outline, effPuf]);

  /**
   * Which side of the traced line the scaffold stands on. Exterior pushes the
   * legs outward, interior pulls them in - a tank shell, an atrium or a lift
   * shaft is the same trace read the other way round.
   */
  const placement: "exterior" | "interior" =
    ((elevation?.sectionView as unknown as Record<string, string>)?.placement === "interior")
      ? "interior"
      : "exterior";

  // Segment legs with no-orphan rule
  const allSegmentLegs = useMemo(() => {
    if (!scaleOk || !outline.length || effPuf <= 0 || bayLengthFt <= 0) return [];
    return computeLegs(outline, scaffoldWidthFt, bayLengthFt, effPuf, placement);
  }, [outline, scaffoldWidthFt, bayLengthFt, scaleOk, effPuf, placement]);

  // Per-leg frame tall — single source of truth is `frameTall`, the same
  // value driving the 3D model and Frame Config Options (derived from
  // elevation.wallHeight via the real frame-makeup calculation). This
  // used to run its own separate, older calculation from raw elevation
  // height strings, which could drift out of sync with the rest of the
  // app — that's the disconnect that was showing "1" here while the 3D
  // model correctly showed "7". A manual per-leg override (set via the
  // Edit Bay popup) still takes priority when present.
  const getFrameTallForLeg = (segIndex: number, legIndex: number): number => {
    const legKey = `${segIndex}-${legIndex}`;
    if (overriddenFC[legKey]) return overriddenFC[legKey];
    return frameTall;
  };

  // A leg counts as "broken free" from the parallel track once its stored
  // offset has a perpendicular (off-wall) component beyond the same
  // breakout distance used while dragging. Used to hide the cross-brace
  // connecting it to its neighbours — a strut drawn to a leg that's no
  // longer in line with the run wouldn't make physical sense.
  function isLegBrokenFree(segIndex: number, legIndex: number): boolean {
    const off = legOffsets[`${segIndex}-${legIndex}`];
    if (!off) return false;
    // From the engine's own geometry, for the same reason the renderer does.
    const seg = allSegmentLegs.find(s => s.segIndex === segIndex);
    const a = seg?.a, b = seg?.b;
    if (!a || !b) return false;
    const sdx = b.x - a.x, sdy = b.y - a.y;
    const len = Math.sqrt(sdx * sdx + sdy * sdy);
    if (!len) return false;
    const nx = -sdy / len, ny = sdx / len;
    const perp = off.dx * nx + off.dy * ny;
    return Math.abs(perp) > effPuf * 0.75;
  }

  // Section view — wall outline, scaffold side, hand-placed additions
  const sectionWallOutline = useMemo(() => {
    const outline2 = elevation?.sectionView?.wallOutline;
    return outline2 && outline2.length >= 2 ? (outline2 as PlanPoint[]) : ([] as PlanPoint[]);
  }, [elevation]);
  const scaffoldSide = elevation?.sectionView?.scaffoldSide ?? "left";
  const draftingAdditions = elevation?.sectionView?.draftingAdditions ?? [];
  const manualFrameCount = useMemo(() => draftingAdditions.filter(d => d.kind === "frame").length, [draftingAdditions]);
  const manualBracketCount = useMemo(() => draftingAdditions.filter(d => d.kind === "bracket").length, [draftingAdditions]);

  // Totals — correct plank formula, plus hand-placed additions from Section View
  // Courtyard quantities — stored separately from the building's own
  // elevations, and rolled into totals only when the include toggle is on.
  const courtyardTotals = useMemo(() => computeCourtyardTotals(elevation), [elevation]);

  // Quick Bid derives everything from gripped elevation areas — no plan
  // geometry exists at that depth, so the tick/perimeter path can't run.
  const isQuickBid = !depthAtLeast(estimateDepth, "full-bid");
  const quickTotals = useMemo(
    () => computeElevationOnlyTotals(elevation, {
      bayLengthFt: bayLengthFt,
      workerReachHeight,
      plankCountPerBay: ppb,
      screwJackMaxExtensionIn,
    }),
    [elevation, bayLengthFt, workerReachHeight, ppb, screwJackMaxExtensionIn],
  );
  const phaseReport = useMemo(
    () => buildPhaseReport(elevation, estimateDepth, quickTotals),
    [elevation, estimateDepth, quickTotals],
  );
  const includeCourtyards = elevation?.includeCourtyards ?? true;
  const courtyardContribution = useMemo(() => {
    if (!includeCourtyards || courtyardTotals.legs <= 0) {
      return { legs: 0, bays: 0, frames: 0, planks: 0, braces: 0, guardrails: 0, couplingPins: 0 };
    }
    const cyBays = Math.max(0, courtyardTotals.legs - courtyardTotals.faceCount);
    const cyFrameTall = courtyardTotals.frameTall || frameTall;
    return {
      legs: courtyardTotals.legs,
      bays: cyBays,
      frames: courtyardTotals.legs * cyFrameTall,
      planks: cyBays * ppb * cyFrameTall,
      // These repeat per lift just as they do on the building — they were
      // previously omitted entirely, so courtyards contributed no bracing
      // or railing to project totals.
      braces: cyBays * cyFrameTall * MATERIAL_RULES.crossBracesPerBayPerLift,
      guardrails: cyBays * (MATERIAL_RULES.guardrailTopPerBay + Math.max(0, cyFrameTall - 1) * MATERIAL_RULES.guardrailIntermediatePerBay),
      couplingPins: courtyardTotals.legs * Math.max(0, cyFrameTall - 1) * MATERIAL_RULES.couplingPinsPerFrame,
    };
  }, [includeCourtyards, courtyardTotals, frameTall, ppb, MATERIAL_RULES]);

  const totals = useMemo(() => {
    // Quick Bid has no traced perimeter, so quantities come from gripped
    // elevation areas instead of ticks. Courtyards are already folded in
    // by computeElevationOnlyTotals, so no separate contribution here.
    if (isQuickBid) {
      return {
        legs: quickTotals.legCount,
        bays: quickTotals.bayCount,
        frames: quickTotals.frameCount + manualFrameCount,
        brackets: manualBracketCount,
        planks: quickTotals.plankCount,
        braces: quickTotals.crossBraceCount,
        guardrails: quickTotals.guardrailCount,
        couplingPins: quickTotals.couplingPinCount,
        buildingLegs: quickTotals.legCount,
        buildingFrames: quickTotals.frameCount + manualFrameCount,
      };
    }
    // Per-bay accumulation from the real per-leg lift counts. Braces,
    // planks, guardrails and pins all repeat at every lift — counting
    // them once at ground level understated each by roughly the lift
    // count. A bay is governed by its SHORTER leg: nothing can attach to
    // a frame that isn't there.
    let legs = 0, bays = 0, totalFrames = 0;
    let braceCount = 0, plankCount = 0, railCount = 0, pinCount = 0;
    for (const seg of allSegmentLegs) {
      const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
      const active = sl
        .map((_, i) => i)
        .filter(i => !deletedLegKeys.has(`${seg.segIndex}-${i}`));
      const lifts = active.map(i => overriddenFC[`${seg.segIndex}-${i}`] ?? getFrameTallForLeg(seg.segIndex, i));
      legs += lifts.length;
      if (lifts.length > 1) bays += lifts.length - 1;
      for (const n of lifts) {
        totalFrames += n;
        pinCount += Math.max(0, n - 1) * MATERIAL_RULES.couplingPinsPerFrame;
      }
      for (let i = 0; i < lifts.length - 1; i++) {
        const bayLifts = Math.min(lifts[i], lifts[i + 1]);
        braceCount += bayLifts * MATERIAL_RULES.crossBracesPerBayPerLift;
        plankCount += bayLifts * ppb;
        railCount += MATERIAL_RULES.guardrailTopPerBay + Math.max(0, bayLifts - 1) * MATERIAL_RULES.guardrailIntermediatePerBay;
      }
    }
    return {
      legs: legs + courtyardContribution.legs,
      bays: bays + courtyardContribution.bays,
      frames: totalFrames + manualFrameCount + courtyardContribution.frames,
      brackets: manualBracketCount,
      planks: plankCount + courtyardContribution.planks,
      braces: braceCount + courtyardContribution.braces,
      guardrails: railCount + courtyardContribution.guardrails,
      couplingPins: pinCount + courtyardContribution.couplingPins,
      // Building-only figures, kept so the UI can show what a courtyard adds
      buildingLegs: legs,
      buildingFrames: totalFrames + manualFrameCount,
    };
  }, [isQuickBid, quickTotals, allSegmentLegs, frameTall, ppb, deletedLegKeys, overriddenFC, elevation, manualFrameCount, manualBracketCount, courtyardContribution, MATERIAL_RULES]);

  function handleToggleCourtyards(next: boolean) {
    setIncludeCourtyards(next);
    setElevation(cur => cur ? { ...cur, includeCourtyards: next } : cur);
  }

  // Live frame height for the 3D model — average frames-per-leg from the
  // current totals (which include per-tick overrides and deletions), so
  // edit-mode changes visibly change the 3D model, not just the numbers.
  /**
   * Frames in one leg, from the wall height.
   *
   * This used to divide total frames by total legs, which sounds reasonable and
   * is not: the frames come from the quantity engine and the legs are drawn by
   * computeLegs, so the two counts describe different layouts. On a 21' wall it
   * reported two frames per leg - the answer you get when the division lands on
   * the minimum rather than when anything is actually two frames tall.
   *
   * Wall height is the only thing that decides how many frames stack in a leg,
   * so it is what this reads.
   */
  const liveFrameTall = useMemo(() => {
    const wall = elevation?.wallHeight ?? 0;
    if (wall > 0) {
      const reach = getBackendSettings().scaffold.workerReachHeight ?? 6;
      const jack = elevation?.scaffoldInput?.screwJackMaxExtension ?? 18;
      const makeup = computeFrameMakeup(Math.max(0, wall - reach), jack);
      if (makeup.frameTall > 0) return makeup.frameTall;
    }
    return frameTall;
  }, [elevation, frameTall]);

  // Overlay rows
  const rawOverlayRows = useMemo(() => {
    const g = elevation?.overlayGeometry; if (!g) return [];
    return (g.fullOverlayRows || []).filter((r: any) => r.points?.length >= 2).map((r: any, i: number) => ({
      id: r.id ?? i, level: r.level, isKeyFloor: Boolean(r.isKeyFloor),
      closed: Boolean(r.closed), color: r.color || (i === 0 ? "#2563eb" : "#22c55e"),
      points: r.points.filter(isFinitePoint),
    })).filter((r: any) => r.points.length >= 2);
  }, [elevation]);

  useEffect(() => {
    function load() {
      try {
        const raw = getActiveElevation(), p = getActiveProject();

        /*
         * The page gets its project and elevation FIRST.
         *
         * This used to rebuild the quantity engine and the part ledger before
         * handing the page anything - and wrapped the lot in an empty catch.
         * So if the rebuild threw, the page never received the job, sat on its
         * blank defaults showing "no project", and nothing anywhere said why.
         * Takeoff and the store were both fine; this page simply never got told.
         */
        setElevation(raw);
        setProjectName(p.projectName || "");
        setElevationSource(getActiveElevationSource());
        setProjectSource(getActiveProjectSource());
        try {
          const bs = getBackendSettings();
          setSheetInfo({
            jobNumber: p.proposalNumber || p.projectId || "",
            address: p.projectAddress || "",
            customer: p.customer || "",
            estimator: bs.estimator?.estimatorName || p.estimator || "",
            company: bs.company?.companyName || "",
          });
          setEstimateDepthState(getEstimateDepth());
          setScaffoldWidth(raw.scaffoldInput.scaffoldWidth >= 5 ? "5'" : raw.scaffoldInput.scaffoldWidth >= 3.5 ? "3'-6\"" : "3'");
          setBayLength(`${raw.scaffoldInput.standardBayLength}'`);
        } catch (err) {
          setLoadError(`Settings: ${err instanceof Error ? err.message : String(err)}`);
        }

        /*
         * Then the rebuild, on its own. A failure here costs the fresh ledger,
         * not the whole page - and it is reported, not swallowed.
         */
        try {
          const freshEngine = calculateQuantityEngine({
            linearFeet: raw.linearFeet,
            wallHeight: raw.wallHeight,
            ...raw.scaffoldInput,
            workerReachHeight,
          });
          const e = writeScaffoldLedger({ ...raw, quantityEngine: freshEngine });
          const engineChanged = JSON.stringify(freshEngine) !== JSON.stringify(raw.quantityEngine);
          const ledgerChanged = (e.partLedger ?? []).length !== (raw.partLedger ?? []).length;
          if (engineChanged || ledgerChanged) saveActiveElevation(e);
          setElevation(e);
          setLoadError(null);
        } catch (err) {
          setLoadError(`Ledger rebuild: ${err instanceof Error ? err.message : String(err)}`);
        }
      } catch (err) {
        setLoadError(`Load: ${err instanceof Error ? err.message : String(err)}`);
      }
      setMounted(true);
    }
    load();
    window.addEventListener("focus", load); window.addEventListener("pageshow", load);
    return () => { window.removeEventListener("focus", load); window.removeEventListener("pageshow", load); };
  }, []);

  // Load Didact Gothic for the tick-number labels — closest available
  // web font to AutoCAD's RomanS drafting style (thin, monoline, no
  // serifs). This is a self-contained injection since this component
  // doesn't have access to the app's central font setup (layout.tsx) —
  // if that setup is ever touched directly, this can be replaced with a
  // proper next/font/google import there instead.
  useEffect(() => {
    if (document.getElementById("didact-gothic-font")) return;
    const link = document.createElement("link");
    link.id = "didact-gothic-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Didact+Gothic&display=swap";
    document.head.appendChild(link);
  }, []);

  // ── Native pointer events on the Overlay SVG ───────────────────────────
  // React's synthetic events provably never fire on this SVG in the user's
  // environment (verified with on-screen counters: HTML buttons work, but
  // clicks anywhere on the SVG — background or ticks — register zero).
  // So these listeners attach directly to the DOM node and do their own
  // hit-testing.
  //
  // CRITICAL: every value the handlers need is read through a ref, and the
  // dependency array is kept minimal. Previously `legOffsets` (which
  // changes on every single mouse-move) was a dependency — so each move
  // tore down and re-attached the listeners, wiping the local
  // `draggingKey` variable and killing the drag after one tiny nudge.
  // That was the "moves in small increments/notches" bug: not slowness,
  // but the drag being destroyed and restarted constantly.
  const dragStateRef = useRef<{
    draggingKey: string | null;
    panning: boolean;
    lastPos: { x: number; y: number } | null;
  }>({ draggingKey: null, panning: false, lastPos: null });
  /**
   * Pulls a drawn endpoint onto the existing layout.
   *
   * A run drawn to roughly the end of a wall should meet it exactly, because
   * that junction is where the corner rules apply. Snapping to legs and to
   * other drawn ends is what lets two drawn runs turn a corner properly
   * instead of nearly touching.
   */
  /**
   * Straightens a drawn run.
   *
   * A run drawn by hand lands a few pixels off square and reads as a mistake.
   * This lines it up with the nearest wall if there is one close by, and with
   * horizontal or vertical otherwise - whichever the drawn direction is nearer
   * to. Turned off, the run goes exactly where it was drawn, which is what an
   * angled return needs.
   */
  function snapAngleTo(from: PlanPoint, to: PlanPoint): PlanPoint {
    if (!snapAngle) return to;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return to;

    const candidates: PlanPoint[] = [
      { x: 1, y: 0 }, { x: 0, y: 1 },
    ];
    // Walls the building already has, so a run beside one lines up with it
    // rather than with the page.
    allSegmentLegs.forEach(seg => {
      const wdx = seg.b.x - seg.a.x, wdy = seg.b.y - seg.a.y;
      const wlen = Math.hypot(wdx, wdy);
      if (wlen > 1e-6) candidates.push({ x: wdx / wlen, y: wdy / wlen });
    });

    let best = { x: dx / len, y: dy / len };
    let bestDot = 0;
    candidates.forEach(c => {
      const dot = Math.abs((dx / len) * c.x + (dy / len) * c.y);
      if (dot > bestDot) { bestDot = dot; best = c; }
    });
    // Keep the direction the run was drawn in, not the candidate's.
    const sign = (dx / len) * best.x + (dy / len) * best.y < 0 ? -1 : 1;
    return { x: from.x + best.x * len * sign, y: from.y + best.y * len * sign };
  }

  function snapToLayout(pt: PlanPoint): PlanPoint {
    const radius = Math.max(effPuf * 3, 6);
    let best: { pt: PlanPoint; dist: number } | null = null;
    const consider = (c: PlanPoint) => {
      const dist = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (dist <= radius && (!best || dist < best.dist)) best = { pt: c, dist };
    };
    allSegmentLegs.forEach(seg => seg.legs.forEach(l => consider(l.wallPoint)));
    drawnRuns.forEach(r => { consider(r.a); consider(r.b); });
    outline.forEach(consider);
    return best ? best.pt : pt;
  }

  /**
   * Legs along a drawn run.
   *
   * Same rules as a wall - first leg on the invisible stop, march at bay
   * length, rail across anything eight feet or under. The difference is that
   * a drawn run has no building to take its side from, so the side comes from
   * the direction it was drawn and can be flipped.
   */
  const drawnRunLegs = useMemo(() => {
    if (!scaleOk || effPuf <= 0 || bayLengthFt <= 0) return [];
    const wallGap = 1 * effPuf;
    const tickLen = scaffoldWidthFt * effPuf;
    const stopPx = (scaffoldWidthFt + 1) * effPuf;
    const bayPx = bayLengthFt * effPuf;

    return drawnRuns.map(run => {
      const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y;
      const len = Math.hypot(dx, dy);
      if (len <= 0) return { id: run.id, legs: [] as LegResult[], lengthFt: 0 };
      const along = { x: dx / len, y: dy / len };
      // Right of travel, unless flipped. No building to ask, so the draw
      // direction decides and the estimator corrects it if it is wrong.
      const side = run.flipped ? -1 : 1;
      const normal = { x: -along.y * side, y: along.x * side };

      const positions: number[] = [];
      let cursor = stopPx;
      const last = len - stopPx;
      let guard = 0;
      while (cursor <= last + 0.01 && guard++ < 400) {
        positions.push(cursor);
        const remainingFt = (last - cursor) / effPuf;
        if (remainingFt <= 8 + 0.05) break;
        const bay = largestBayWithin(Math.min(remainingFt, bayLengthFt));
        cursor += (bay ?? bayLengthFt) * effPuf;
      }
      if (positions.length === 0) positions.push(len / 2);

      const legs: LegResult[] = positions.map((d, idx) => {
        const base = { x: run.a.x + along.x * d, y: run.a.y + along.y * d };
        return {
          wallPoint: { x: base.x + normal.x * wallGap, y: base.y + normal.y * wallGap },
          tickTip: { x: base.x + normal.x * (wallGap + tickLen), y: base.y + normal.y * (wallGap + tickLen) },
          labelPoint: { x: base.x + normal.x * (wallGap + tickLen + effPuf), y: base.y + normal.y * (wallGap + tickLen + effPuf) },
          isTurnaroundMirror: false,
          isStartLeg: idx === 0,
          isEndLeg: idx === positions.length - 1,
        };
      });
      return { id: run.id, legs, lengthFt: len / effPuf };
    });
  }, [drawnRuns, scaleOk, effPuf, bayLengthFt, scaffoldWidthFt]);

  /**
   * Legs on the walls that only exist above or below the key level.
   *
   * Laid out by exactly the rules a key-level wall gets - a leg past the corner
   * it starts from, marching at bay length, railing across whatever is left.
   * The only difference is which line they sit on.
   */
  const levelRunLegs = useMemo(() => {
    if (!scaleOk || effPuf <= 0 || deviatingWalls.length === 0) return [];
    const wallGap = 1 * effPuf;
    const tickLen = scaffoldWidthFt * effPuf;
    const floatPx = (scaffoldWidthFt + 1) * effPuf;
    const bayPx = bayLengthFt * effPuf;

    return deviatingWalls.map((wall, index) => {
      const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
      const len = Math.hypot(dx, dy);
      const along = { x: dx / len, y: dy / len };
      /*
       * Outward from this level's own shape, not the key one.
       *
       * An upper floor that overhangs sits outside the key line; a lower one
       * sits inside it. Asking the key outline which way is out therefore gets
       * the answer backwards on one of them, and the ticks point into the
       * building instead of away from the wall they serve.
       */
      const normal = computeOutwardNormal(wall.a, wall.b, wall.levelPoints, placement);

      const positions: number[] = [-floatPx];
      let cursor = -floatPx;
      let guard = 0;
      while (cursor + bayPx <= len + 0.01 && guard++ < 400) {
        cursor += bayPx;
        positions.push(cursor);
      }
      const leftoverFt = (len - cursor) / effPuf;
      if (leftoverFt > 7 + 0.05) {
        const closing = largestBayWithin(leftoverFt);
        if (closing !== null) { cursor += closing * effPuf; positions.push(cursor); }
      }

      const legs: LegResult[] = positions.map((d, i) => {
        const base = { x: wall.a.x + along.x * d, y: wall.a.y + along.y * d };
        return {
          wallPoint: { x: base.x + normal.x * wallGap, y: base.y + normal.y * wallGap },
          tickTip: { x: base.x + normal.x * (wallGap + tickLen), y: base.y + normal.y * (wallGap + tickLen) },
          labelPoint: { x: base.x + normal.x * (wallGap + tickLen + effPuf), y: base.y + normal.y * (wallGap + tickLen + effPuf) },
          isTurnaroundMirror: false,
          isStartLeg: i === 0,
          isEndLeg: i === positions.length - 1,
        };
      });

      return { key: `lvl-${wall.levelId}-${index}`, wall, legs, lengthFt: len / effPuf };
    });
  }, [deviatingWalls, scaleOk, effPuf, scaffoldWidthFt, bayLengthFt, outline, placement]);

  /*
   * The ledger has to follow the level runs, not just the configuration.
   * Changing a width rewrites it already; tracing another floor has to as well,
   * or the load list quietly describes a building with one fewer run on it.
   */
  const ledgerSignature = [
    levelRunLegs.map(r => `${r.key}:${r.legs.length}`).join("|"),
    allSegmentLegs.reduce((sum, seg) => sum + seg.legs.length, 0),
    scaffoldWidthFt, bayLengthFt, elevation?.wallHeight ?? 0, placement,
  ].join("~");

  useEffect(() => {
    if (!mounted || !elevation) return;
    const next = writeScaffoldLedger(elevation);
    /*
     * Compared by content, not by how many lines came out.
     *
     * The earlier version only rewrote when the number of lines changed, which
     * is almost never - a stale ledger has the same shape as a fresh one, just
     * with the wrong parts in it. That is how a load list came to show FO6L and
     * WP8 while the configuration read a three-foot frame on ten-foot bays: the
     * parts were correct for a setting nobody had used in days.
     */
    const before = JSON.stringify((elevation.partLedger ?? []).map(r => [r.partNo, r.qty, r.source]).sort());
    const after = JSON.stringify((next.partLedger ?? []).map(r => [r.partNo, r.qty, r.source]).sort());
    if (before !== after) { setElevation(next); saveActiveElevation(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerSignature, mounted]);

  /**
   * Keeps a section drawing after it has been corrected.
   *
   * Only the estimator's pieces are stored. Korban's are laid out again from
   * the profile every time, so a change to the configuration is reflected
   * rather than frozen into a drawing made under the old one.
   */
  function handleSaveSection(sectionId: string, drawn: SectionDraftingItem[]) {
    if (!elevation) return;
    const mine = drawn.filter(i => i.source === "user");
    const next = {
      ...elevation,
      sectionViews: (elevation.sectionViews ?? []).map(sv =>
        sv.id === sectionId ? { ...sv, draftingAdditions: mine } : sv,
      ),
    };
    setElevation(next);
    saveActiveElevation(next);
  }

  const liveRef = useRef({ editMode, allSegmentLegs, deletedLegKeys, legOffsets, effPuf, scaffoldWidthFt, outline,
                           measureMode, measureFrom, addRunMode, runStart });
  liveRef.current = { editMode, allSegmentLegs, deletedLegKeys, legOffsets, effPuf, scaffoldWidthFt, outline,
                      measureMode, measureFrom, addRunMode, runStart };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || activeMainTab !== "overlay") return;

    function toViewBox(e: PointerEvent) {
      const r = svg!.getBoundingClientRect();
      const vb = svg!.viewBox.baseVal;
      const scale = Math.min(r.width / vb.width, r.height / vb.height);
      const offX = (r.width - vb.width * scale) / 2;
      const offY = (r.height - vb.height * scale) / 2;
      return {
        x: vb.x + (e.clientX - r.left - offX) / scale,
        y: vb.y + (e.clientY - r.top - offY) / scale,
      };
    }

    function findNearestLeg(pt: { x: number; y: number }): string | null {
      const { allSegmentLegs: segs, deletedLegKeys: dels, legOffsets: offs, effPuf: puf, scaffoldWidthFt: wft } = liveRef.current;
      const hitRadius = Math.max(wft * puf * 0.9, puf * 2);
      let best: string | null = null;
      let bestDist = hitRadius;
      for (const seg of segs) {
        const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
        sl.forEach((leg, i) => {
          const k = `${seg.segIndex}-${i}`;
          if (dels.has(k)) return;
          const off = offs[k] ?? { dx: 0, dy: 0 };
          const mx = (leg.wallPoint.x + leg.tickTip.x) / 2 + off.dx;
          const my = (leg.wallPoint.y + leg.tickTip.y) / 2 + off.dy;
          const d = Math.sqrt((pt.x - mx) ** 2 + (pt.y - my) ** 2);
          if (d < bestDist) { bestDist = d; best = k; }
        });
      }
      return best;
    }

    function onPointerDown(e: PointerEvent) {
      const pt = toViewBox(e);
      dragStateRef.current.lastPos = { x: pt.x, y: pt.y };

      // Measuring and drawing take the click before anything that pans or
      // moves a leg, so neither can be triggered by accident mid-task.
      if (liveRef.current.measureMode) {
        const from = liveRef.current.measureFrom;
        if (!from) { setMeasureFrom({ x: pt.x, y: pt.y }); setMeasureTo(null); return; }
        const puf = liveRef.current.effPuf;
        const ft = puf > 0 ? Math.hypot(pt.x - from.x, pt.y - from.y) / puf : 0;
        setMeasurements(prev => [...prev, { a: from, b: { x: pt.x, y: pt.y }, ft: parseFloat(ft.toFixed(2)) }]);
        setMeasureFrom(null); setMeasureTo(null);
        return;
      }

      if (liveRef.current.addRunMode) {
        const start = liveRef.current.runStart;
        if (!start) { setRunStart(snapToLayout({ x: pt.x, y: pt.y })); setRunEnd(null); return; }
        // Line it up first, then let it grab anything it lands near.
        const snapped = snapToLayout(snapAngleTo(start, { x: pt.x, y: pt.y }));
        // Two clicks in the same place is a misclick, not a run. Anything
        // under a bay cannot carry a leg either, so it is not one.
        const lengthFt = Math.hypot(snapped.x - start.x, snapped.y - start.y) / Math.max(liveRef.current.effPuf, 0.0001);
        if (lengthFt < 4) { setRunStart(null); setRunEnd(null); return; }
        setPendingRun({ a: start, b: snapped });
        setRunStart(null); setRunEnd(null);
        return;
      }

      if (liveRef.current.editMode) {
        const hit = findNearestLeg(pt);
        if (hit) {
          setSelectedLegKey(hit);
          dragStateRef.current.draggingKey = hit;
          setDraggedLegKey(hit);
          e.preventDefault();
          // Capture the pointer so the drag keeps tracking even if the
          // cursor briefly leaves the SVG bounds mid-drag.
          try { svg!.setPointerCapture(e.pointerId); } catch {}
        } else {
          setSelectedLegKey(null);
        }
      } else {
        dragStateRef.current.panning = true;
        setIsPanning(true);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const st = dragStateRef.current;

      /*
       * A line you cannot see while you draw it is a line you draw twice.
       * This handler used to return here unless a leg was being dragged or the
       * plan was being panned, so a half-drawn run and a half-made measurement
       * both stayed invisible until the second click landed.
       */
      if (liveRef.current.addRunMode && liveRef.current.runStart) {
        const pt = toViewBox(e);
        setRunEnd(snapAngleTo(liveRef.current.runStart, { x: pt.x, y: pt.y }));
        return;
      }
      if (liveRef.current.measureMode && liveRef.current.measureFrom) {
        const pt = toViewBox(e);
        setMeasureTo({ x: pt.x, y: pt.y });
        return;
      }

      if (!st.draggingKey && !st.panning) return;
      // Track absolute position in viewBox space (continuous, full
      // precision) rather than the browser's movementX/movementY, which
      // report in whole rounded screen pixels and quantize badly at zoom.
      const pt = toViewBox(e);
      if (!st.lastPos) { st.lastPos = { x: pt.x, y: pt.y }; return; }
      const deltaX = pt.x - st.lastPos.x;
      const deltaY = pt.y - st.lastPos.y;
      st.lastPos = { x: pt.x, y: pt.y };
      if (st.draggingKey) {
        const k = st.draggingKey;
        setLegOffsets(p => {
          const rawDx = (p[k]?.dx ?? 0) + deltaX;
          const rawDy = (p[k]?.dy ?? 0) + deltaY;
          // Parallel lock: decompose the offset into "along the wall run"
          // and "perpendicular to it". Movement along the wall stays fully
          // free; the perpendicular component is held at zero (keeping the
          // tick in line with its neighbours) until the user deliberately
          // pulls beyond the breakout distance, at which point it moves
          // freely in any direction.
          const { outline: ol, effPuf: puf } = liveRef.current;
          const si = Number(k.split("-")[0]);
          const a = ol[si], b = ol[(si + 1) % ol.length];
          if (!a || !b) return { ...p, [k]: { dx: rawDx, dy: rawDy } };
          const sdx = b.x - a.x, sdy = b.y - a.y;
          const len = Math.sqrt(sdx * sdx + sdy * sdy);
          if (!len) return { ...p, [k]: { dx: rawDx, dy: rawDy } };
          const ax = sdx / len, ay = sdy / len;   // along the wall
          const nx = -ay, ny = ax;                 // perpendicular to it
          const along = rawDx * ax + rawDy * ay;
          const perp = rawDx * nx + rawDy * ny;
          const breakout = puf * 0.75;              // ~9" before it frees — quicker release
          const usedPerp = Math.abs(perp) > breakout ? perp : 0;
          return { ...p, [k]: { dx: ax * along + nx * usedPerp, dy: ay * along + ny * usedPerp } };
        });
      } else if (st.panning) {
        setViewerPan(p => ({ dx: p.dx - deltaX, dy: p.dy - deltaY }));
      }
    }

    function onPointerUp(e: PointerEvent) {
      const st = dragStateRef.current;
      if (st.draggingKey) { try { svg!.releasePointerCapture(e.pointerId); } catch {} }
      st.draggingKey = null;
      st.panning = false;
      st.lastPos = null;
      setDraggedLegKey(null);
      setIsPanning(false);
    }

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeMainTab, mounted]);

  // Live dimension readout while dragging a tick — measures from the
  // dragged leg to its immediate neighbours in the same wall run, in feet,
  // updating in real time as it moves.
  const dragDimensions = useMemo(() => {
    if (!draggedLegKey || effPuf <= 0) return null;
    const [si, li] = draggedLegKey.split("-").map(Number);
    const seg = allSegmentLegs.find(s => s.segIndex === si);
    if (!seg) return null;
    const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
    const posOf = (idx: number) => {
      const leg = sl[idx];
      if (!leg) return null;
      const k = `${si}-${idx}`;
      if (deletedLegKeys.has(k)) return null;
      const off = legOffsets[k] ?? { dx: 0, dy: 0 };
      return { x: (leg.wallPoint.x + leg.tickTip.x) / 2 + off.dx, y: (leg.wallPoint.y + leg.tickTip.y) / 2 + off.dy };
    };
    const self = posOf(li);
    if (!self) return null;
    const out: { a: PlanPoint; b: PlanPoint; feet: number }[] = [];
    for (const nIdx of [li - 1, li + 1]) {
      const nb = posOf(nIdx);
      if (!nb) continue;
      const dist = Math.sqrt((nb.x - self.x) ** 2 + (nb.y - self.y) ** 2) / effPuf;
      out.push({ a: self, b: nb, feet: dist });
    }
    return out.length ? out : null;
  }, [draggedLegKey, allSegmentLegs, legOffsets, deletedLegKeys, effPuf]);

  function saveConfig(updates: Partial<ScaffoldInput>) {
    const cur = elevation ?? getActiveElevation();
    const si = { ...cur.scaffoldInput, ...updates };
    const qe = calculateQuantityEngine({ linearFeet: cur.linearFeet, wallHeight: cur.wallHeight, ...si, workerReachHeight });
    const withEngine = { ...cur, scaffoldInput: si, quantityEngine: qe };
    // Set Scaffold is where width, bay length and frame configuration are
    // decided, so it is the only page that can say which parts those are.
    // Writing them here is what stops the load list guessing downstream.
    const next = writeScaffoldLedger(withEngine);
    setElevation(next); saveActiveElevation(next);
  }

  /**
   * Turns this elevation's configuration into part numbers.
   *
   * The quantity engine counts categories. A yard pulls parts. Only this page
   * knows the run is 3' wide on 10' bays, which makes the frames FO6L3, the
   * braces B102 and the planks WP10 - so only this page can write it down.
   *
   * Frame configuration is honoured piece by piece: a leg made of one 6'-4"
   * and one 5' frame writes both part numbers, not two of the tall one.
   */
  function writeScaffoldLedger(el: ProjectElevation): ProjectElevation {
    const si = el.scaffoldInput;
    const qe = el.quantityEngine;
    if (!qe || qe.legCount <= 0) return writeLedgerEntries(el, "scaffold", []);

    /*
     * One bay length, read once, used everywhere below.
     *
     * A load list came back with B82 - an eight-foot bay on a three-foot frame -
     * while the panel read ten-foot bays and 3'-6" frames. Both numbers wrong at
     * once, which a single stale value cannot explain. Reading it once here, and
     * recording what was used on every line, means the next load list says which
     * number it was built from rather than leaving it to be guessed at.
     */
    const bayLengthUsed = si.standardBayLength > 0 ? si.standardBayLength : 10;
    const widthUsed = si.scaffoldWidth > 0 ? si.scaffoldWidth : 3;
    const configNote = `${bayLengthUsed}' bay, ${widthUsed}' wide`;
    const parts = partsForConfiguration(widthUsed, bayLengthUsed);
    /*
     * Legs as drawn, not as the quantity engine estimated them.
     *
     * The engine works from linear feet and a bay length; the plan works from
     * the actual walls, corners and levels. They do not agree, and the plan is
     * the one that is right - which is why the panel read 46 legs while the
     * load list read 34, missing every leg on the deviating level.
     */
    const drawnLegCount = allSegmentLegs.reduce((sum, seg) => sum + seg.legs.length, 0);
    const legs = drawnLegCount > 0 ? drawnLegCount : qe.legCount;
    const entries: { partNo: string; qty: number; note?: string }[] = [];

    // Frames, by the actual makeup of a leg rather than one tall stack.
    const makeup = qe.frameMakeup ?? [];
    if (makeup.length > 0) {
      makeup.forEach((piece) => {
        const partNo = piece.label.startsWith("6")
          ? parts.frame
          : piece.label.startsWith("5")
          ? parts.frame5
          : parts.frame3;
        entries.push({
          partNo,
          qty: piece.qty * legs,
          note: `${piece.qty} per leg x ${legs} legs`,
        });
      });
    } else {
      entries.push({ partNo: parts.frame, qty: qe.frameCount });
    }

    entries.push({
      partNo: parts.plank,
      qty: bayCount > 0 ? bayCount * planksPerBayForWidth(widthUsed) * Math.max(1, qe.frameTall ?? 1) : qe.plankCount,
      note: configNote,
    });

    /*
     * Braces, jump by jump. A brace part carries both the bay length and the
     * frame it braces - B104 is a ten-foot bay on a 6'-4" frame, B102 the same
     * bay on a 3'. A leg of one tall frame and one short one needs both, so
     * counting one part times the total put the wrong brace on every job with
     * a mixed makeup.
     */
    const bracesPerBayPerJump =
      (getBackendSettings()?.scaffold as Record<string, number | undefined> | undefined)
        ?.crossBracesPerBayPerLift ?? MATERIAL_RULE_DEFAULTS.crossBracesPerBayPerLift;
    const bayCount = drawnLegCount > 0
      ? allSegmentLegs.reduce((sum, seg) => sum + Math.max(0, seg.legs.length - 1), 0)
      : (qe.bayCount ?? 0);
    if (makeup.length > 0 && bayCount > 0) {
      makeup.forEach((piece) => {
        const heightFt = piece.label.startsWith("6") ? 6.333 : piece.label.startsWith("5") ? 5 : 3;
        entries.push({
          partNo: braceForBay(bayLengthUsed, heightFt),
          qty: bayCount * piece.qty * bracesPerBayPerJump,
          note: `${piece.label} jumps - ${configNote}`,
        });
      });
    } else {
      entries.push({ partNo: parts.brace, qty: qe.crossBraceCount, note: configNote });
    }
    entries.push({ partNo: parts.guardrail, qty: qe.guardrailCount, note: configNote });
    entries.push({ partNo: "BP1", qty: qe.basePlateCount });
    entries.push({ partNo: "AL1S", qty: qe.screwJackCount });
    entries.push({ partNo: "CPS", qty: qe.couplingPinCount ?? 0 });

    /*
     * Drawn runs are runs. Their legs, frames and decks count exactly as a
     * traced wall's do - they are written under their own source so they can
     * be recomputed without disturbing anything else, but they land in the
     * same totals and on the same load list.
     */
    const drawnLegs = drawnRunLegs.reduce((sum, r) => sum + r.legs.length, 0);
    if (drawnLegs > 0) {
      const drawnJumps = drawnRuns.reduce((sum, run) => {
        const reach = getBackendSettings().scaffold.workerReachHeight ?? 6;
        const mk = computeFrameMakeup(Math.max(0, run.heightFt - reach), si.screwJackMaxExtension ?? 18);
        return sum + Math.max(1, mk.frameTall);
      }, 0) / Math.max(1, drawnRuns.length);
      const jumps = Math.max(1, Math.round(drawnJumps));
      const drawnBays = Math.max(0, drawnLegs - drawnRuns.length);
      entries.push({ partNo: parts.frame, qty: drawnLegs * jumps, note: "drawn runs" });
      entries.push({ partNo: "BP1", qty: drawnLegs, note: "drawn runs" });
      entries.push({ partNo: "AL1S", qty: drawnLegs, note: "drawn runs" });
      if (drawnBays > 0) {
        entries.push({ partNo: parts.plank, qty: drawnBays * planksPerBayForWidth(si.scaffoldWidth) * jumps, note: "drawn runs" });
        entries.push({ partNo: braceForBay(bayLengthUsed, 6.333), qty: drawnBays * jumps * bracesPerBayPerJump, note: `drawn runs - ${configNote}` });
      }
    }

    /*
     * Runs on levels that leave the key line. Their legs are legs, their frames
     * are frames - the only thing that makes them different is which line they
     * stand on, and the material does not care about that.
     */
    const levelLegs = levelRunLegs.reduce((sum, r) => sum + r.legs.length, 0);
    if (levelLegs > 0) {
      const jumps = Math.max(1, makeup.reduce((sum, piece) => sum + piece.qty, 0));
      const levelBays = Math.max(0, levelLegs - levelRunLegs.length);
      entries.push({ partNo: parts.frame, qty: levelLegs * jumps, note: "level runs" });
      entries.push({ partNo: "BP1", qty: levelLegs, note: "level runs" });
      entries.push({ partNo: "AL1S", qty: levelLegs, note: "level runs" });
      if (levelBays > 0) {
        entries.push({ partNo: parts.plank, qty: levelBays * planksPerBayForWidth(widthUsed) * jumps, note: "level runs" });
        entries.push({ partNo: braceForBay(bayLengthUsed, 6.333), qty: levelBays * jumps * bracesPerBayPerJump, note: `level runs - ${configNote}` });
        entries.push({ partNo: parts.guardrail, qty: levelBays * 4, note: "level runs" });
      }
    }

    /*
     * Brackets for recesses the run steps past.
     *
     * One per leg along the opening, sized to reach the recessed wall while
     * keeping the standoff off its face. A pocket two feet deep needs a deck
     * two feet wider, and that deck has to be carried by something.
     */
    const bracketed = recesses.filter(r => r.strategy === "bracket");
    if (bracketed.length > 0 && drawnLegCount > 0) {
      const perBracketLegs = Math.max(1, Math.round(legs / Math.max(1, allSegmentLegs.length)));
      bracketed.forEach(r => {
        const partNo = r.depthFt <= 1.05 ? "BR12S" : r.depthFt <= 1.7 ? "BR20S" : "BR30S";
        const spanLegs = Math.max(2, Math.ceil(r.mouthFt / bayLengthUsed) + 1);
        entries.push({
          partNo,
          qty: spanLegs * Math.max(1, qe.frameTall ?? 1),
          note: `${r.depthFt.toFixed(1)}' recess, ${r.mouthFt.toFixed(0)}' wide`,
        });
        void perBracketLegs;
      });
    }

    // Anything dropped onto the section drawing is real material too.
    const drafted = el.sectionView?.draftingAdditions ?? [];
    const bracketCounts = new Map<string, number>();
    drafted.forEach((item) => {
      if (item.kind !== "bracket") return;
      bracketCounts.set(item.variant, (bracketCounts.get(item.variant) ?? 0) + 1);
    });
    bracketCounts.forEach((qty, variant) => {
      entries.push({ partNo: variant, qty, note: "placed in section view" });
    });

    // Merge duplicates - two makeup rows can land on the same part number.
    const merged = new Map<string, { partNo: string; qty: number; note?: string }>();
    entries.forEach((entry) => {
      if (!entry.partNo || entry.qty <= 0) return;
      const existing = merged.get(entry.partNo);
      if (existing) existing.qty += entry.qty;
      else merged.set(entry.partNo, { ...entry });
    });

    return writeLedgerEntries(el, "scaffold", [...merged.values()]);
  }

  function handleTogglePlacement(next: "exterior" | "interior") {
    saveSectionView({ placement: next } as never);
    setElevation(cur =>
      cur ? { ...cur, sectionView: { ...cur.sectionView, placement: next } as never } : cur
    );
  }

  function handleToggleScaffoldSide(side: "left" | "right") {
    saveSectionView({ scaffoldSide: side });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, scaffoldSide: side } } : cur);
  }

  function handleDropDraftingPiece(kind: "frame" | "bracket", variant: string, level: number) {
    const item: SectionDraftingItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, variant, level };
    const next = [...draftingAdditions, item];
    saveSectionView({ draftingAdditions: next });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, draftingAdditions: next } } : cur);
  }

  function handleRemoveDraftingPiece(id: string) {
    const next = draftingAdditions.filter(d => d.id !== id);
    saveSectionView({ draftingAdditions: next });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, draftingAdditions: next } } : cur);
  }

  const sectionType = elevation?.sectionView?.sectionType ?? "A-A";
  const wallOffset = elevation?.sectionView?.wallOffset ?? 1;

  return (
    <main className="h-screen flex flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Set Scaffold"
        subtitle="Overlay · 3D Model · Section View"
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={projectName} />
            <KorbanHeaderMeta label="Job No." value={sheetInfo.jobNumber || "-"} />
            <KorbanButton as="a" href="/takeoff-workspace-advanced" variant="ghost">← Takeoff</KorbanButton>
            <KorbanButton as="a" href="/project-plan-desk" variant="ghost">Project Plan Desk</KorbanButton>
            <KorbanButton as="a" href="/korban-review" variant="primary">Korban Review →</KorbanButton>
          </>
        }
      />

      <style>{`
        /*
         * Printing a takeoff.
         *
         * Everything that is for working - panels, buttons, guidance - comes
         * off, and what is left is the drawing on white with a title block in
         * the corner. The plan is already vector, so it prints at the printer's
         * resolution rather than as a screenshot of a screen.
         *
         * A takeoff that leaves the office is a drawing. A screenshot looks like
         * a guess; the same layout in a title block looks like a set of plans.
         */
        @media print {
          @page { size: letter landscape; margin: 0.35in; }
          body { background: #fff !important; }
          body * { visibility: hidden !important; }

          .korban-sheet, .korban-sheet * { visibility: visible !important; }
          .korban-sheet {
            display: block !important;
            position: absolute; left: 0; top: 0;
            width: 100%; height: 100%;
            background: #fff; color: #111;
          }

          .korban-plan-print, .korban-plan-print * { visibility: visible !important; }
          .korban-plan-print {
            position: absolute !important;
            left: 0.2in; top: 0.2in;
            width: calc(100% - 0.4in); height: calc(100% - 2.1in);
            background: #fff !important;
            overflow: visible !important;
          }
          .korban-plan-print svg { width: 100% !important; height: 100% !important; }
          /* Ink on paper, not glow on black. */
          .korban-plan-print line[stroke="#f8fafc"] { stroke: #111 !important; }
          .korban-plan-print text { fill: #111 !important; }
          .korban-no-print { display: none !important; }

          .korban-titleblock {
            position: absolute; right: 0.2in; bottom: 0.2in;
            width: 4.4in; border: 1.5px solid #111;
            font-family: ui-monospace, monospace; font-size: 7.5pt; line-height: 1.35;
          }
          .korban-tb-mark {
            display: flex; align-items: center; gap: 6px;
            border-bottom: 1px solid #111; padding: 4px 6px;
            font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          }
          .korban-titleblock dl {
            display: grid; grid-template-columns: 4.4em 1fr;
            margin: 0; padding: 5px 6px; gap: 1px 8px;
          }
          .korban-titleblock dt { color: #555; text-transform: uppercase; font-size: 6.5pt; }
          .korban-titleblock dd { margin: 0; font-weight: 600; }
          .korban-tb-sheet {
            display: flex; align-items: center; justify-content: space-between;
            border-top: 1px solid #111; padding: 4px 6px;
            text-transform: uppercase; letter-spacing: 0.1em;
          }
          .korban-tb-sheet strong { font-size: 13pt; }
        }
      `}</style>

      {/*
        * The printed sheet.
        *
        * A takeoff that leaves the office is a drawing, and a drawing carries a
        * title block - who drew it, for whom, at what scale, on what date. An
        * estimator handing a GC a screenshot looks like an estimator guessing;
        * the same layout in a title block looks like a set of plans.
        *
        * Hidden on screen, laid out on paper by the print rules below.
        */}
      <div className="korban-sheet hidden">
        <div className="korban-sheet-body" />
        <div className="korban-titleblock">
          <div className="korban-tb-mark">
            <svg width="22" height="22" viewBox="0 0 44 44" aria-hidden>
              <path d="M22 4 L40 38 L4 38 Z" fill="#111" />
              <path d="M22 4 L40 38 L22 38 Z" fill="#555" />
            </svg>
            <span>{sheetInfo.company || "KORBAN"}</span>
          </div>
          <dl>
            <dt>Project</dt><dd>{projectName || "-"}</dd>
            <dt>Address</dt><dd>{sheetInfo.address || "-"}</dd>
            <dt>Customer</dt><dd>{sheetInfo.customer || "-"}</dd>
            <dt>Job no.</dt><dd>{sheetInfo.jobNumber || "-"}</dd>
            <dt>Drawn by</dt><dd>{sheetInfo.estimator || "-"}</dd>
            <dt>Date</dt><dd>{new Date().toLocaleDateString()}</dd>
            <dt>Scale</dt><dd>{scaleOk ? "As noted" : "Not to scale"}</dd>
            <dt>Frame</dt><dd>{scaffoldWidthFt === 3.5 ? `3'-6"` : `${scaffoldWidthFt}'`} wide, {bayLengthFt}&apos; bays</dd>
          </dl>
          <div className="korban-tb-sheet">
            <span>Scaffold Layout</span>
            <strong>S-1</strong>
          </div>
        </div>
      </div>

      {/* Where the scaffold stands relative to the trace, and what Korban
          makes of the job as it is. Both sit above the workspace because both
          change how everything below them should be read. */}
      {!isQuickBid && (
        <div className="flex flex-wrap items-start gap-3 border-b border-zinc-900 bg-[#0b0b0b] px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
              Scaffold sits
            </span>
            {(["exterior", "interior"] as const).map((side) => (
              <button
                key={side}
                onClick={() => handleTogglePlacement(side)}
                className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium capitalize transition ${
                  placement === side
                    ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                    : "border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {side}
              </button>
            ))}
            <span className="font-mono text-[9px] text-zinc-700">
              {placement === "interior" ? "legs inside the wall line" : "legs outside the wall line"}
            </span>
          </div>

          {(() => {
            const flags: KorbanGuidanceFlag[] = [];
            if (!scaleOk) {
              flags.push({ tone: "warn", text: "No scale set. Nothing here is a real dimension yet." });
            }
            if (outline.length < 3) {
              flags.push({ tone: "warn", text: "No traced plan. This shape is a placeholder - do not price it." });
            }
            // Two runs turning into the same notch need room for both.
            const minNotch = (scaffoldWidthFt + 1) * 2;
            /*
             * Measured on the walls the scaffold actually sees, not on the raw
             * trace. Testing the trace counted every small jog as a short wall
             * and warned on buildings whose walls are all long - the jogs are
             * absorbed before a leg is ever placed.
             */
            const shortWalls = allSegmentLegs.filter(seg => {
              const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) / Math.max(effPuf, 0.0001);
              return len > 0 && len < minNotch;
            });
            const tightNotch = shortWalls.length > 0;
            if (tightNotch) {
              flags.push({ tone: "warn", text: `${shortWalls.length} wall${shortWalls.length === 1 ? "" : "s"} under ${minNotch}'. Two runs will not turn in that - may need tube and clamp.` });
            }
            if ((elevation?.wallHeight ?? 0) <= 0) {
              flags.push({ tone: "warn", text: "No wall height, so every leg is at minimum. Grip an elevation in Takeoff." });
            }
            if (recesses.length > 0) {
              const by = (k: string) => recesses.filter(r => r.strategy === k).length;
              const parts: string[] = [];
              if (by("bracket")) parts.push(`${by("bracket")} bracketed`);
              if (by("straddle")) parts.push(`${by("straddle")} decked across`);
              if (by("double")) parts.push(`${by("double")} with its own run`);
              flags.push({ tone: "note", text: `${recesses.length} recess${recesses.length === 1 ? "" : "es"} in this plan - ${parts.join(", ")}. Under 8" I run straight past.` });
            }
            if (levelRunLegs.length > 0) {
              const legs = levelRunLegs.reduce((sum, r) => sum + r.legs.length, 0);
              const names = [...new Set(levelRunLegs.map(r => r.wall.levelName))].join(", ");
              flags.push({ tone: "note", text: `${levelRunLegs.length} wall${levelRunLegs.length === 1 ? "" : "s"} off the key line on ${names} - own run, ${legs} legs, shown in that level's colour.` });
            } else if (levelOutlines.length > 1) {
              flags.push({ tone: "note", text: `${levelOutlines.length} levels, all within 3' of the key line. One run covers it, brackets pick up the rest.` });
            }
            if (placement === "interior") {
              flags.push({ tone: "note", text: "Legs set inside the wall line. Check your inside corners for clearance." });
            }
            if (scaleOk && outline.length >= 3 && (elevation?.wallHeight ?? 0) <= 0) {
              flags.push({ tone: "warn", text: "No wall height. Stack falls back to one jump - grip an elevation in Takeoff." });
            }
            if (flags.length === 0) return null;
            return <KorbanGuidance flags={flags} title="Korban reads it" className="max-w-xl" />;
          })()}
        </div>
      )}

      {/* Quick Bid — no plan geometry exists at this depth, so there's no
          layout, 3D, or section to show. Counts, frame options, material
          list, and an honest account of what the number does and doesn't
          cover. That's the whole job at this tier. */}
      {isQuickBid ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Quick Bid</p>
                <p className="mt-1 text-[13px] text-zinc-400">Budgetary pricing from elevation coverage.</p>
              </div>
              <a href="/estimate-depth" className="text-[10px] text-zinc-600 hover:text-orange-300">change depth ›</a>
            </div>

            {/* Headline counts */}
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Frames", totals.frames], ["Planks", totals.planks], ["Bays", totals.bays], ["Legs", totals.legs]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 py-3">
                  <p className="text-[9px] uppercase tracking-wider text-orange-700">{l}</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-orange-300">{Number(v).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-zinc-500">
              <span>{quickTotals.linearFeet.toLocaleString()} LF gripped</span>
              <span>·</span>
              <span>{quickTotals.areaCount} coverage area{quickTotals.areaCount === 1 ? "" : "s"}</span>
              <span>·</span>
              <span>avg {quickTotals.avgHeightFt}&apos; tall</span>
              {courtyardTotals.courtyardCount > 0 && (<><span>·</span><span>{courtyardTotals.courtyardCount} courtyard{courtyardTotals.courtyardCount === 1 ? "" : "s"}</span></>)}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Frame configuration — needs only a height, so it works here */}
              <div className="rounded-xl border border-zinc-900 bg-[#0b0b0b] overflow-hidden">
                <FrameConfigOptions effectiveHeightFt={effectiveStackHeightFt} screwJackMaxExtensionIn={screwJackMaxExtensionIn} scaffoldWidthFt={scaffoldWidthFt} />
              </div>

              {/* Material list */}
              <div className="rounded-xl border border-zinc-900 bg-[#0b0b0b]">
                <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Material List</p>
                  <a href="/inventory/load-list" className="text-[9px] text-orange-400 hover:text-orange-300">Full Load List →</a>
                </div>
                <div className="p-3 space-y-1">
                  {[
                    /*
                     * Read from the ledger, which is where the part numbers
                     * actually live. These used to be typed in here - FO6L3,
                     * WP10, B82, GR8 - so the panel showed an eight-foot brace
                     * on a ten-foot bay and a three-foot frame whatever the
                     * width was set to. It happened to look right on a three
                     * foot job at ten foot bays, and was wrong on every other.
                     */
                    ...readLedger(elevation).map(row => ({
                      partNo: row.partNo,
                      description: getStockItem(row.partNo)?.description ?? row.partNo,
                      qty: row.qty,
                    })),
                  ].map(item => (
                    <div key={item.partNo} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${item.qty > 0 ? "border-orange-500/25 bg-orange-500/5" : "border-zinc-900 bg-black"}`}>
                      <span className="w-12 flex-shrink-0 font-mono text-[9px] text-orange-400">{item.partNo}</span>
                      <span className="flex-1 truncate text-[10px] text-zinc-500">{item.description}</span>
                      <span className={`font-mono text-[11px] font-bold ${item.qty > 0 ? "text-orange-300" : "text-zinc-700"}`}>
                        {item.qty > 0 ? item.qty.toLocaleString() : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Phase report — what this covers, and what it doesn't */}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-[#0b0b0b] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Where this stands</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-300">{phaseReport.covered}</p>
              {phaseReport.gaps.length > 0 && (
                <>
                  <p className="mt-4 text-[12px] text-zinc-400">What I don&apos;t know yet:</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {phaseReport.gaps.map((g, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-zinc-400">
                        <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-yellow-500/70" />
                        {g}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {phaseReport.nextStep && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3.5">
                  <p className="flex-1 text-[12.5px] leading-relaxed text-zinc-400">{phaseReport.nextStep}</p>
                  <a href="/estimate-depth" className="rounded-xl bg-orange-500 px-4 py-2 text-[11px] font-bold text-black transition hover:bg-orange-400">
                    Move to Full Bid
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden border-r border-zinc-900">
          <div className="flex items-end gap-1 border-b border-zinc-900 bg-[#0b0b0b] px-6 pt-2 flex-shrink-0">
            {([
              { id: "overlay", label: "Overlay / Takeoff", icon: "⊞" },
              { id: "section", label: "Section View", icon: "✂" },
            ] as { id: typeof activeMainTab; label: string; icon: string }[])
              .filter(tab => tab.id !== "section" || depthAtLeast(estimateDepth, "korban-bid"))
              .map(tab => {
              const active = activeMainTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveMainTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-t-lg border border-b-0 px-6 pt-2.5 pb-3 text-[11px] font-bold uppercase tracking-[0.15em] transition ${active ? "text-white border-zinc-700" : "text-zinc-600 hover:text-zinc-400 border-zinc-800"}`}
                  style={{ background: active ? "#1a1a1a" : "#0b0b0b" }}>
                  <span>{tab.icon}</span>{tab.label}
                  {active && (
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-full bg-white/80 shadow-[0_0_4px_1px_rgba(255,255,255,0.35)]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 overflow-hidden">

        {/* ── Tab: Overlay / Takeoff ──────────────────────────────────── */}
        {activeMainTab === "overlay" && (
        <section className="flex w-full overflow-hidden">
          {/* Main drawing area */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Floor Plan · Scaffold Layout</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowOverlay(c => !c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showOverlay ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-zinc-800 text-zinc-600"}`}>Overlay</button>
                <button onClick={() => setShowScaffold(c => !c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showScaffold ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-600"}`}>Scaffold</button>
                <button onClick={() => { setEditMode(m => !m); setMeasureMode(false); setAddRunMode(false); }} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${editMode ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>{editMode ? "\u2713 Editing" : "Edit Bay"}</button>
                <button onClick={() => { setAddRunMode(m => !m); setEditMode(false); setMeasureMode(false); setRunStart(null); setRunEnd(null); }}
                  title="Draw a run anywhere on the plan"
                  className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${addRunMode ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>
                  {addRunMode ? "Drawing..." : "+ Add Run"}
                </button>
                {addRunMode && (
                  <button onClick={() => setSnapAngle(v => !v)}
                    title="Line runs up with the nearest wall, or with horizontal and vertical. Off for an angled run."
                    className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${snapAngle ? "border-orange-500/50 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
                    {snapAngle ? "Snap on" : "Snap off"}
                  </button>
                )}
                <button onClick={() => window.print()}
                  title="Print the layout as a drawing sheet with a title block"
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300">
                  Print
                </button>
                <button onClick={() => { setMeasureMode(m => !m); setEditMode(false); setAddRunMode(false); setMeasureFrom(null); setMeasureTo(null); }}
                  disabled={!scaleOk}
                  title={scaleOk ? "Measure between two points" : "No scale on this elevation"}
                  className={`rounded-lg border px-2 py-1 text-[9px] font-bold disabled:opacity-30 ${measureMode ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300" : "border-zinc-700 text-zinc-400 hover:border-cyan-400/40"}`}>
                  Measure
                </button>
                {measurements.length > 0 && (
                  <button onClick={() => setMeasurements([])} className="rounded-lg border border-zinc-800 px-2 py-1 text-[9px] text-zinc-500 hover:text-white">
                    Clear {measurements.length}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewerZoom(z => Math.max(0.2, z - 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">−</button>
                  <span className="text-[9px] font-mono text-zinc-600 w-9 text-center">{Math.round(viewerZoom * 100)}%</span>
                  <button onClick={() => setViewerZoom(z => Math.min(4, z + 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
                  <button onClick={() => { setViewerZoom(1); setViewerPan({ dx: 0, dy: 0 }); }} className="rounded border border-zinc-800 px-2 h-6 text-[9px] text-zinc-500 hover:text-white">Fit</button>
                </div>
              </div>
            </div>

            {/* SVG canvas */}
            <div className="flex-1 relative overflow-hidden bg-black">
              {mounted && !scaleOk && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">⚠ Scale Not Set</p>
                  <p className="mt-2 text-xs text-zinc-500 max-w-xs">Set scale in Takeoff Workspace first.</p>
                  <a href="/takeoff-workspace-advanced" className="mt-4 inline-block rounded-xl bg-yellow-400 px-5 py-2 text-xs font-bold text-black">Go to Takeoff →</a>
                </div>
              </div>
            )}
            {/* A drawn run is not a run until it has a height - that is what
                decides how many frames go in each leg. */}
            {pendingRun && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="w-72 rounded-xl border border-orange-500/40 bg-korban-raised p-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">
                    New run
                  </p>
                  <p className="mt-1 text-[11px] leading-[1.5] text-zinc-500">
                    {Math.round(Math.hypot(pendingRun.b.x - pendingRun.a.x, pendingRun.b.y - pendingRun.a.y) / Math.max(effPuf, 0.0001))}
                    &apos; long. How tall does it stand?
                  </p>
                  <input
                    autoFocus
                    value={pendingHeight}
                    onChange={e => setPendingHeight(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder={`Height, e.g. 21'-2"`}
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-[13px] font-bold text-orange-300 outline-none placeholder:text-zinc-700 focus:border-orange-500/50"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => { setPendingRun(null); setPendingHeight(""); }}
                      className="flex-1 rounded-lg border border-zinc-800 py-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => {
                        const h = parseFeetInches(pendingHeight);
                        if (h <= 0) return;
                        setDrawnRuns(prev => [...prev, {
                          id: `run-${Date.now().toString(36)}`,
                          a: pendingRun.a, b: pendingRun.b, heightFt: h, flipped: false,
                        }]);
                        setPendingRun(null); setPendingHeight("");
                      }}
                      className="flex-1 rounded-lg bg-orange-500 py-1.5 font-mono text-[10px] font-bold text-black hover:bg-orange-400"
                    >
                      Add run
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Drawn runs, listed so they can be flipped or removed. */}
            {drawnRuns.length > 0 && (
              <div className="absolute bottom-2 left-2 z-40 max-w-[220px] rounded-lg border border-zinc-800 bg-black/90 p-2">
                <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
                  Drawn runs
                </p>
                {drawnRuns.map(run => (
                  <div key={run.id} className="flex items-center gap-2 border-t border-zinc-900 py-1 first:border-0">
                    <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-zinc-400">
                      {Math.round(drawnRunLegs.find(r => r.id === run.id)?.lengthFt ?? 0)}&apos; x {run.heightFt}&apos;
                    </span>
                    <button
                      onClick={() => setDrawnRuns(prev => prev.map(r => r.id === run.id ? { ...r, flipped: !r.flipped } : r))}
                      title="Put the legs on the other side"
                      className="font-mono text-[9px] text-zinc-600 hover:text-orange-300"
                    >
                      flip
                    </button>
                    <button
                      onClick={() => setDrawnRuns(prev => prev.filter(r => r.id !== run.id))}
                      className="font-mono text-[10px] text-zinc-700 hover:text-red-400"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Decorative grid — MUST be pointer-events-none: it's absolutely
                positioned, which paints it ABOVE the static-flow svg per CSS
                stacking rules. Without this, it invisibly covers the whole
                canvas and swallows every click before the svg can see it —
                which is exactly the "zero clicks register anywhere" bug. */}
            <div className="korban-no-print pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />
            {/* korban-plan-print is what the print rules lift onto the sheet. */}
            <svg ref={svgRef} className="korban-plan-print relative z-10 h-full w-full"
              viewBox={`${svgViewBox.x + (svgViewBox.w * (1 - 1 / viewerZoom)) / 2 + viewerPan.dx} ${svgViewBox.y + (svgViewBox.h * (1 - 1 / viewerZoom)) / 2 + viewerPan.dy} ${svgViewBox.w / viewerZoom} ${svgViewBox.h / viewerZoom}`}
              style={{
                cursor: isPanning
                  ? "grabbing"
                  : editMode
                    // Orange crosshair — signals the mouse is a design tool
                    // right now, not a plain pointer.
                    ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg stroke='%23f97316' stroke-width='2'%3E%3Cline x1='12' y1='1' x2='12' y2='9'/%3E%3Cline x1='12' y1='15' x2='12' y2='23'/%3E%3Cline x1='1' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='23' y2='12'/%3E%3C/g%3E%3Ccircle cx='12' cy='12' r='1.5' fill='%23f97316'/%3E%3C/svg%3E") 12 12, crosshair`
                    : "grab",
              }}>

              {/* Overlay */}
              {showOverlay && (rawOverlayRows.length > 0 ? (
                <g>
                  {rawOverlayRows.map((r: any, i: number) => (
                    <path key={i}
                      d={`M${r.points[0]?.x} ${r.points[0]?.y} ${r.points.slice(1).map((p: any) => `L${p.x} ${p.y}`).join(" ")}${r.closed ? " Z" : ""}`}
                      fill="transparent" stroke={r.isKeyFloor ? "#2563eb" : r.color} strokeWidth={r.isKeyFloor ? "1" : "0.7"} />
                  ))}
                </g>
              ) : (
                <g>
                  <path d="M160 120 L880 120 L880 300 L700 300 L700 480 L880 480 L880 600 L160 600 Z"
                    fill="rgba(37,99,235,0.06)" stroke="#2563eb" strokeWidth="1.2" />
                  <path d="M172 132 L868 132 L868 312 L712 312 L712 468 L868 468 L868 588 L172 588 Z"
                    fill="transparent" stroke="#22c55e" strokeWidth="0.8" opacity="0.8" />
                </g>
              ))}

              {/* Scaffold ticks */}
              {/* Runs on levels that deviate from the key line. Drawn in the
                  level's own colour so it is clear at a glance that they are a
                  second run and not part of the main one. */}
              {levelRunLegs.map(run => (
                <g key={run.key}>
                  <line x1={run.wall.a.x} y1={run.wall.a.y} x2={run.wall.b.x} y2={run.wall.b.y}
                    stroke={run.wall.color} strokeWidth={0.8} opacity="0.45" strokeDasharray="5,3" />
                  {run.legs.map((leg, i) => (
                    <g key={i}>
                      <line x1={leg.wallPoint.x} y1={leg.wallPoint.y} x2={leg.tickTip.x} y2={leg.tickTip.y}
                        stroke={run.wall.color} strokeWidth={1.8} strokeLinecap="square" />
                      {/* Frames per leg, same as any other run. A leg without a
                          count is a leg nobody can build from. */}
                      <text x={leg.labelPoint.x} y={leg.labelPoint.y}
                        textAnchor="middle" dominantBaseline="middle" opacity="0.9"
                        fill={run.wall.color}
                        style={{
                          fontSize: Math.max(scaffoldWidthFt * effPuf * 0.5, 6.25),
                          fontFamily: "'Didact Gothic', var(--font-fira-code), ui-monospace, sans-serif",
                        }}>{liveFrameTall}</text>
                    </g>
                  ))}
                </g>
              ))}

              {/* Drawn runs, their legs, and the two tools. */}
              {drawnRuns.map(run => {
                const computed = drawnRunLegs.find(r => r.id === run.id);
                return (
                  <g key={run.id}>
                    <line x1={run.a.x} y1={run.a.y} x2={run.b.x} y2={run.b.y}
                      stroke="#f97316" strokeWidth={1.2} strokeDasharray="4,3" opacity="0.55" />
                    {computed?.legs.map((leg, i) => {
                      // A drawn run carries its own height, so its frame count
                      // is its own - not the elevation's.
                      const reach = getBackendSettings().scaffold.workerReachHeight ?? 6;
                      const jack = elevation?.scaffoldInput?.screwJackMaxExtension ?? 18;
                      const tall = Math.max(1, computeFrameMakeup(Math.max(0, run.heightFt - reach), jack).frameTall);
                      return (
                        <g key={i}>
                          <line x1={leg.wallPoint.x} y1={leg.wallPoint.y} x2={leg.tickTip.x} y2={leg.tickTip.y}
                            stroke="#f97316" strokeWidth={2} strokeLinecap="round" />
                          <text x={leg.labelPoint.x} y={leg.labelPoint.y}
                            textAnchor="middle" dominantBaseline="middle" opacity="0.9"
                            fill="#f97316"
                            style={{
                              fontSize: Math.max(scaffoldWidthFt * effPuf * 0.5, 6.25),
                              fontFamily: "'Didact Gothic', var(--font-fira-code), ui-monospace, sans-serif",
                            }}>{tall}</text>
                        </g>
                      );
                    })}
                    <text x={(run.a.x+run.b.x)/2} y={(run.a.y+run.b.y)/2-4} textAnchor="middle"
                      fontSize="4.5" fill="#f97316" fontFamily="monospace"
                      stroke="#000" strokeWidth="1.4" paintOrder="stroke">
                      {Math.round(computed?.lengthFt ?? 0)}&apos; x {run.heightFt}&apos;
                    </text>
                  </g>
                );
              })}

              {runStart && runEnd && (
                <g>
                  <line x1={runStart.x} y1={runStart.y} x2={runEnd.x} y2={runEnd.y}
                    stroke="#f97316" strokeWidth={1.4} strokeDasharray="3,2" />
                  {/* Crosshair on both ends. A line you are drawing should say
                      exactly where it will land, not roughly. */}
                  {[runStart, runEnd].map((p, i) => (
                    <g key={i}>
                      <line x1={p.x - 4} y1={p.y} x2={p.x + 4} y2={p.y} stroke="#f97316" strokeWidth={0.8} />
                      <line x1={p.x} y1={p.y - 4} x2={p.x} y2={p.y + 4} stroke="#f97316" strokeWidth={0.8} />
                      <circle cx={p.x} cy={p.y} r={1.6} fill="none" stroke="#f97316" strokeWidth={0.6} />
                    </g>
                  ))}
                  <text x={(runStart.x + runEnd.x) / 2} y={(runStart.y + runEnd.y) / 2 - 4}
                    textAnchor="middle" fontSize="4.5" fill="#f97316" fontFamily="monospace"
                    stroke="#000" strokeWidth="1.4" paintOrder="stroke">
                    {(Math.hypot(runEnd.x - runStart.x, runEnd.y - runStart.y) / Math.max(effPuf, 0.0001)).toFixed(1)}&apos;
                  </text>
                </g>
              )}

              {measurements.map((m, i) => (
                <g key={`meas${i}`}>
                  <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke="#22d3ee" strokeWidth={1.2} />
                  <circle cx={m.a.x} cy={m.a.y} r={1.6} fill="#22d3ee" />
                  <circle cx={m.b.x} cy={m.b.y} r={1.6} fill="#22d3ee" />
                  <text x={(m.a.x+m.b.x)/2} y={(m.a.y+m.b.y)/2-3} textAnchor="middle"
                    fontSize="4.5" fill="#22d3ee" fontFamily="monospace" fontWeight="bold"
                    stroke="#000" strokeWidth="1.4" paintOrder="stroke">{m.ft}&apos;</text>
                </g>
              ))}

              {measureFrom && measureTo && (
                <line x1={measureFrom.x} y1={measureFrom.y} x2={measureTo.x} y2={measureTo.y}
                  stroke="#22d3ee" strokeWidth={1.2} strokeDasharray="3,2" />
              )}

              {/*
                * The wall comes from the engine, not from a second lookup.
                * Re-deriving it here by index was how legs ended up drawn
                * against the wrong wall whenever a jog had been absorbed.
                */}
              {showScaffold && scaleOk && allSegmentLegs.map(({ segIndex, legs, a: segStart, b: segEnd, normal }) => {
                if (!segStart || !segEnd) return null;
                const dx = segEnd.x - segStart.x, dy = segEnd.y - segStart.y, len = Math.sqrt(dx * dx + dy * dy);
                const wg = 1 * effPuf, tl = scaffoldWidthFt * effPuf;
                const sl = legs.filter(l => !l.isTurnaroundMirror);

                return (
                  <g key={`seg-${segIndex}`} fill="#f8fafc" stroke="#f8fafc" strokeLinecap="square" opacity="0.9">
                    {/* Cross braces — skipped if either connected leg has
                        broken free from the parallel track (see
                        isLegBrokenFree above) */}
                    {sl.slice(0, -1).map((leg, i) => {
                      const next = sl[i + 1]; if (!next) return null;
                      if (isLegBrokenFree(segIndex, i) || isLegBrokenFree(segIndex, i + 1)) return null;
                      const o1 = legOffsets[`${segIndex}-${i}`] ?? { dx: 0, dy: 0 };
                      const o2 = legOffsets[`${segIndex}-${i + 1}`] ?? { dx: 0, dy: 0 };
                      const cx = (leg.wallPoint.x + o1.dx + next.wallPoint.x + o2.dx) / 2;
                      const cy = (leg.wallPoint.y + o1.dy + next.wallPoint.y + o2.dy) / 2;
                      const bp = Math.sqrt((next.wallPoint.x - leg.wallPoint.x) ** 2 + (next.wallPoint.y - leg.wallPoint.y) ** 2);
                      const hb = bp * 0.3, al = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
                      return (
                        <line key={`brace-${i}`}
                          x1={cx - al.x * hb + normal.x * wg * 0.5} y1={cy - al.y * hb + normal.y * wg * 0.5}
                          x2={cx + al.x * hb + normal.x * (wg + tl) * 0.9} y2={cy + al.y * hb + normal.y * (wg + tl) * 0.9}
                          strokeWidth="0.7" opacity="0.5" />
                      );
                    })}
                    {/* Tick lines — legs are already filtered by computeLegs (with the corner exemption above); no need to re-filter here */}
                    {sl.map((leg, i) => {
                      const k = `${segIndex}-${i}`;
                      if (deletedLegKeys.has(k)) return null;
                      if (!isFiniteNumber(leg.wallPoint.x)) return null;
                      const sel = selectedLegKey === k;
                      const ft = overriddenFC[k] ?? getFrameTallForLeg(segIndex, i);
                      const off = legOffsets[k] ?? { dx: 0, dy: 0 };
                      const wp = { x: leg.wallPoint.x + off.dx, y: leg.wallPoint.y + off.dy };
                      const tp = { x: leg.tickTip.x + off.dx, y: leg.tickTip.y + off.dy };
                      const lp = { x: leg.labelPoint.x + off.dx, y: leg.labelPoint.y + off.dy };
                      return (
                        <g key={k}>
                          {editMode && <circle cx={(wp.x + tp.x) / 2} cy={(wp.y + tp.y) / 2} r={tl * 0.55}
                            fill={sel ? "rgba(249,115,22,0.18)" : "rgba(249,115,22,0.04)"}
                            stroke={sel ? "#f97316" : "rgba(249,115,22,0.25)"}
                            strokeWidth={sel ? "1.5" : "0.7"} strokeDasharray={sel ? "none" : "3,2"} />}
                          <line x1={wp.x} y1={wp.y} x2={tp.x} y2={tp.y}
                            strokeWidth={sel ? "2.5" : "1.8"} stroke={sel ? "#f97316" : "#f8fafc"} />
                          <text x={lp.x} y={lp.y}
                            opacity="0.9" textAnchor="middle" dominantBaseline="middle"
                            fill={sel ? "#f97316" : "#f8fafc"}
                            style={{
                              cursor: editMode ? "pointer" : "default",
                              fontSize: Math.max(tl * 0.5, 6.25),
                              fontFamily: "'Didact Gothic', var(--font-fira-code), ui-monospace, sans-serif",
                              fontWeight: 400,
                            }}>{ft}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Live dimension guides while dragging a tick — dashed lines
                  to each adjacent leg for visual reference. The actual
                  measurements render in the HTML popup below at a fixed,
                  always-readable size (in-SVG text scaled with the drawing
                  and became unreadable when zoomed out). */}
              {dragDimensions?.map((d, i) => (
                <g key={`dim-${i}`} pointerEvents="none">
                  <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y}
                    stroke="#f97316" strokeWidth={effPuf * 0.09} strokeDasharray={`${effPuf * 0.4},${effPuf * 0.25}`} opacity="0.95" />
                  <circle cx={d.b.x} cy={d.b.y} r={effPuf * 0.18} fill="#f97316" opacity="0.9" />
                </g>
              ))}

              {/* Edit popup */}
            </svg>

            {/* Edit popup — HTML overlay with real HTML buttons. The old
                version drew this inside the SVG with SVG onClick handlers,
                which provably never fire in this environment (HTML buttons
                do). Positioned by
                converting the selected tick's viewBox coords to container
                pixels with the same letterbox-aware transform the native
                hit-testing uses. */}
            {editMode && selectedLegKey && (() => {
              const [si, li] = selectedLegKey.split("-").map(Number);
              const seg = allSegmentLegs.find(s => s.segIndex === si);
              const legs = seg?.legs.filter(l => !l.isTurnaroundMirror) ?? [];
              const leg = legs[li]; if (!leg) return null;
              const svg = svgRef.current; if (!svg) return null;
              const off = legOffsets[selectedLegKey] ?? { dx: 0, dy: 0 };
              const vb = svg.viewBox.baseVal;
              const r = svg.getBoundingClientRect();
              const host = svg.parentElement?.getBoundingClientRect() ?? r;
              const scale = Math.min(r.width / vb.width, r.height / vb.height);
              const offX = (r.width - vb.width * scale) / 2 + (r.left - host.left);
              const offY = (r.height - vb.height * scale) / 2 + (r.top - host.top);
              const px = (leg.tickTip.x + off.dx - vb.x) * scale + offX;
              const py = (leg.tickTip.y + off.dy - vb.y) * scale + offY;
              const fc = overriddenFC[selectedLegKey] ?? frameTall;
              return (
                <div className="absolute z-40 flex flex-col items-center gap-0.5"
                  style={{ left: Math.max(4, Math.min(px - 40, (host.width || 300) - 84)), top: py + 30 }}>
                  {/* Slim pill — neutral outline, bright orange only on the remove icon */}
                  <div className="flex items-center justify-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 min-w-[76px]">
                    <button onClick={() => setOverriddenFC(p => ({ ...p, [selectedLegKey]: Math.max(1, (p[selectedLegKey] ?? frameTall) - 1) }))}
                      className="flex items-center justify-center text-zinc-400 hover:text-white">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="text-[11px] font-mono font-bold text-zinc-100 min-w-[14px] text-center">{fc}</span>
                    <button onClick={() => setOverriddenFC(p => ({ ...p, [selectedLegKey]: (p[selectedLegKey] ?? frameTall) + 1 }))}
                      className="flex items-center justify-center text-zinc-400 hover:text-white">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                    <span className="w-px h-3 bg-zinc-700 mx-0.5" />
                    <button onClick={() => { setDeletedLegKeys(p => { const n = new Set(p); n.add(selectedLegKey); return n; }); setSelectedLegKey(null); }}
                      className="flex items-center justify-center text-orange-500 hover:text-orange-400">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {/* Live spacing readout while dragging — plain floating
                      text, no background/border, matches pill width */}
                  {dragDimensions && dragDimensions.length > 0 && (
                    <div className="flex items-center justify-center gap-1 min-w-[76px]">
                      {dragDimensions.map((d, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="w-px h-2 bg-zinc-700" />}
                          <span className="text-[7px] font-mono font-bold text-orange-300 whitespace-nowrap">
                            {Math.floor(d.feet)}&apos;-{Math.round((d.feet % 1) * 12)}&quot;
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          </div>

          {/* Right sidebar — configuration + stats, out of the way of the drawing */}
          <div className="flex flex-col border-l border-zinc-900 bg-[#0a0a0a] flex-shrink-0 overflow-y-auto" style={{ width: "220px" }}>
            <div className="border-b border-zinc-900 px-3 py-2 flex-shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Configuration</p>
            </div>
            <div className="px-3 py-3 space-y-3 border-b border-zinc-900">
              <div>
                <label className="text-[9px] text-zinc-600 block mb-1">Width</label>
                <select value={scaffoldWidth} onChange={e => { setScaffoldWidth(e.target.value as ScaffoldWidth); saveConfig({ scaffoldWidth: parseFt(e.target.value) }); }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none">
                  <option>3&apos;</option><option>3&apos;-6&quot;</option><option>5&apos;</option>
                </select>
              </div>
              <div>
                {/*
                  * What the layout is built from.
                  *
                  * Everything below depends on these numbers and none of them
                  * were visible - so a wall height of zero looked exactly like
                  * a wall height of twenty-one, and the only symptom was frames
                  * per leg quietly reading two.
                  */}
                <div className="mb-3 rounded-lg border border-zinc-800 bg-black p-2">
                  <p className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-zinc-600">
                    Built from
                  </p>
                  {([
                    ...(loadError ? [["Error", loadError] as [string, string]] : []),
                    ["Job", projectSource === "substituted"
                      ? "recovered - was missing"
                      : projectName || "no project"],
                    ["Elevation", elevationSource === "fallback"
                      ? "blank - not saved"
                      : elevation?.elevationName || "unnamed"],
                    ["Sections", String(elevation?.sectionViews?.length ?? 0)],
                    ["Wall height", (elevation?.wallHeight ?? 0) > 0 ? `${(elevation?.wallHeight ?? 0).toFixed(1)}'` : "not set"],
                    ["Coverage", (elevation?.linearFeet ?? 0) > 0 ? `${Math.round(elevation?.linearFeet ?? 0).toLocaleString()} LF` : "not set"],
                    ["Levels traced", String(levelOutlines.length || 0)],
                    ["Scale", scaleOk ? "set" : "not set"],
                    ["Frames per leg", liveFrameTall > 0 ? String(liveFrameTall) : "-"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2 border-b border-zinc-900 py-0.5 last:border-0">
                      <span className="text-[9.5px] text-zinc-500">{label}</span>
                      <span className={`font-mono text-[10px] font-bold ${
                        (["not set", "no project", "blank - not saved", "recovered - was missing"].includes(value) || label === "Error")
                          ? "text-red-400" : "text-zinc-300"
                      }`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <label className="text-[9px] text-zinc-600 block mb-1">Bay Length</label>
                <input value={bayLength} onChange={e => { setBayLength(e.target.value); saveConfig({ standardBayLength: parseFt(e.target.value) || 10 }); }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none" />
              </div>
              <div className="text-[9px] text-zinc-600 pt-1">
                {scaleOk ? <span className="text-emerald-400">⊠ Scale set</span> : <span className="text-yellow-600">⚠ No scale</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="border-b border-zinc-900 px-3 py-2 flex-shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Project Data</p>
            </div>
            <div className="px-3 py-3 space-y-2">
              {[["Frames", totals.frames], ["Planks", totals.planks], ["Bays", totals.bays], ["Legs", totals.legs]].map(([l, v]) => (
                <div key={l as string} className="flex items-center justify-between rounded-lg border border-orange-500/25 bg-orange-500/5 px-2.5 py-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-orange-700">{l}</span>
                  <span className="font-mono text-sm font-bold text-orange-300">{Number(v).toLocaleString()}</span>
                </div>
              ))}

              {/* Courtyards — only surfaced when some exist. Toggling
                  recalculates every figure above in place. */}
              {courtyardTotals.courtyardCount > 0 && (
                <div className={`rounded-lg border px-2.5 py-2 transition ${includeCourtyards ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-black"}`}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={includeCourtyards}
                      onChange={e => handleToggleCourtyards(e.target.checked)}
                      className="h-3 w-3 accent-emerald-500" />
                    <span className={`text-[9px] font-bold ${includeCourtyards ? "text-emerald-300" : "text-zinc-500"}`}>
                      Include courtyards
                    </span>
                  </label>
                  <p className="mt-1 text-[8px] leading-relaxed text-zinc-500">
                    {courtyardTotals.courtyardCount} courtyard{courtyardTotals.courtyardCount > 1 ? "s" : ""} · {courtyardTotals.faceCount} face{courtyardTotals.faceCount > 1 ? "s" : ""} · {courtyardTotals.linearFeet.toLocaleString()} LF
                  </p>
                  {includeCourtyards && courtyardContribution.legs > 0 && (
                    <p className="mt-0.5 text-[8px] text-emerald-500/80">
                      Adding {courtyardContribution.legs} legs · {courtyardContribution.frames.toLocaleString()} frames
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* ── Tab: Section View & Frame Configuration ──────────────────── */}
        {activeMainTab === "section" && (
        <section className="flex w-full overflow-hidden">
          <div className="flex flex-col overflow-hidden border-r border-zinc-900" style={{ width: sectionExpanded ? "75%" : "33.33%", transition: "width 0.2s ease" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Section View</p>
            </div>
            {/*
              * Every cut the estimator traced. A job can have several and they
              * share nothing - not the profile, not the scale, not the drawing.
              */}
            {(elevation?.sectionViews?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-zinc-900 bg-black px-3 py-2">
                {(elevation?.sectionViews ?? []).map(sv => (
                  <button key={sv.id} onClick={() => setActiveSectionId(sv.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold transition ${
                      (activeSectionId ?? elevation?.sectionViews?.[0]?.id) === sv.id
                        ? "border-emerald-500 bg-emerald-500 text-black"
                        : "border-zinc-800 text-zinc-400 hover:border-emerald-500/40"
                    }`}>
                    {sv.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {(elevation?.sectionViews?.length ?? 0) > 0 ? (
                <SectionDrawing
                  section={(elevation?.sectionViews ?? []).find(
                    sv => sv.id === (activeSectionId ?? elevation?.sectionViews?.[0]?.id),
                  ) ?? null}
                  frameTall={liveFrameTall}
                  scaffoldWidthFt={scaffoldWidthFt}
                  planksPerDeck={planksPerBayForWidth(scaffoldWidthFt)}
                  onSave={handleSaveSection}
                />
              ) : (
              <SectionViewPanel
                wallOutline={sectionWallOutline}
                wallOffset={wallOffset}
                frameTall={frameTall}
                scaffoldWidthFt={scaffoldWidthFt}
                scaffoldSide={scaffoldSide}
                draftingAdditions={draftingAdditions}
                onDropPiece={handleDropDraftingPiece}
                onRemovePiece={handleRemoveDraftingPiece}
                onToggleSide={handleToggleScaffoldSide}
                sectionType={sectionType}
                isExpanded={sectionExpanded}
                onToggleExpand={() => setSectionExpanded(v => !v)}
              />
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-y-auto border-r border-zinc-900" style={{ width: sectionExpanded ? "12.5%" : "33.33%", transition: "width 0.2s ease" }}>
            <FrameConfigOptions effectiveHeightFt={effectiveStackHeightFt} screwJackMaxExtensionIn={screwJackMaxExtensionIn} scaffoldWidthFt={scaffoldWidthFt} />
          </div>

          {/* Materials used at this section only — not the full project count.
              For the whole project's material list, use the button below. */}
          <div className="flex flex-col overflow-y-auto" style={{ width: sectionExpanded ? "12.5%" : "33.33%", transition: "width 0.2s ease" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Materials at This Section</p>
            </div>
            <div className="px-3 pt-2 pb-3 space-y-1.5">
              {(elevation?.quantityEngine?.frameMakeup ?? []).map(p => {
                const partNo = p.label === "6'-4\"" ? "FO6L3" : p.label === "5'-0\"" ? "FO5L3" : "FM33";
                return (
                  <div key={p.label} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
                    <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">{partNo}</span>
                    <span className="text-[9px] text-zinc-500 flex-1 truncate">{p.label} Scaffold Frame</span>
                    <span className="font-mono text-[10px] font-bold text-orange-300">× {p.qty}</span>
                  </div>
                );
              })}
              {manualFrameCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/25 bg-orange-500/5 px-2 py-1.5">
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">FRM-A</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">Added Frames (manual)</span>
                  <span className="font-mono text-[10px] font-bold text-orange-300">× {manualFrameCount}</span>
                </div>
              )}
              {manualBracketCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/25 bg-orange-500/5 px-2 py-1.5">
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">BRKT</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">Wall Bracket (Added)</span>
                  <span className="font-mono text-[10px] font-bold text-orange-300">× {manualBracketCount}</span>
                </div>
              )}
            </div>
            <div className="px-3 pb-3 mt-auto">
              <a href="/inventory/load-list" className="block w-full text-center rounded-xl border border-zinc-800 py-2 text-[10px] font-bold text-orange-400 hover:border-orange-500/40 hover:text-orange-300 transition">
                Full Project Load List →
              </a>
            </div>
          </div>
        </section>
        )}
          </div>
        </div>

        {/* ── Persistent right column — 3D model, always mounted & rotating,
              with the Total Project Material List beneath it ─────────── */}
        <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{ width: "30%" }}>
          {depthAtLeast(estimateDepth, "korban-bid") && (
          <div className="flex flex-col flex-shrink-0" style={{ height: "55%" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">3D Scaffold Model</p>
            </div>
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {mounted && (
                <ScaffoldModel3D
                  outline={outline}
                  puf={effPuf}
                  bayFt={bayLengthFt}
                  widthFt={scaffoldWidthFt}
                  frameTall={liveFrameTall}
                  scaffoldWidthFt={scaffoldWidthFt}
                  placement={placement}
                />
              )}
            </div>
          </div>
          )}

          {/* Clear separation between the 3D view and the material list */}
          <div className="border-t-4 border-zinc-900 flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Total Project Material List</p>
              <a href="/inventory/load-list" className="text-[9px] text-orange-400 hover:text-orange-300">Full Load List →</a>
            </div>
            <div className="px-4 pb-4 space-y-1">
              {[
                // Same source as everywhere else. See the note on the other
                // material panel for why these were not typed in here.
                ...readLedger(elevation).map(row => ({
                  partNo: row.partNo,
                  description: getStockItem(row.partNo)?.description ?? row.partNo,
                  qty: row.qty,
                })),
              // A part nobody is buying does not belong on a material list.
              // The bracket line printed on every job, blank, whether or not
              // a single bracket had been placed.
              ].filter(item => (item.qty ?? 0) > 0).map(item => (
                <div key={item.partNo} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${item.qty > 0 ? "border-orange-500/25 bg-orange-500/5" : "border-zinc-900 bg-black"}`}>
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">{item.partNo}</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">{item.description}</span>
                  <span className={`font-mono text-[10px] font-bold ${item.qty > 0 ? "text-orange-300" : "text-zinc-700"}`}>
                    {item.qty > 0 ? item.qty.toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </main>
  );
}
