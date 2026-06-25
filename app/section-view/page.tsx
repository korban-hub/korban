"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanHeaderMeta,
  type KorbanMenuLink,
} from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
  type ProjectElevation,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };

type WallProfilePoint = {
  x: number;       // PDF page units
  y: number;       // PDF page units
  heightFt: number; // real-world height from grade (calculated from scale)
};

type BracketCondition = {
  levelIndex: number;
  heightFt: number;
  deviationIn: number;
  bracketSizeIn: 10 | 20 | 30;
  direction: "in" | "out";
  wallXAtLevel: number; // PDF x-position of wall at this height
};

type FrameLevel = {
  heightFt: number;    // height from grade
  frameSizeFt: number; // frame height
  isTall: boolean;
};

const sectionMenuLinks: KorbanMenuLink[] = [
  { href: "/frame-configuration", label: "Frame Configuration" },
  { href: "/set-scaffold", label: "Set Scaffold" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
];

// ── Constants ────────────────────────────────────────────────────────────────

// Clearance window: 1'0" min, 1'6" max from wall face to scaffold deck
const CLEARANCE_MIN_FT = 1.0;
const CLEARANCE_MAX_FT = 1.5;

// Bracket sizes in inches
const BRACKET_SIZES = [10, 20, 30] as const;

// Guard rail dimensions
const GUARDRAIL_POST_HEIGHT_FT = 3.5;
const GUARDRAIL_TOP_RAIL_FT    = 3.0;
const GUARDRAIL_MID_RAIL_FT    = 2.0;

// Elevation view guard rail
const ELEVATION_POST_HT_FT = 3.5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFt(decimalFeet: number) {
  const safe = Math.max(0, decimalFeet);
  let feet = Math.floor(safe);
  let inches = Math.round((safe - feet) * 12);
  if (inches === 12) { feet += 1; inches = 0; }
  return `${feet}'-${inches}"`;
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

/**
 * Given a wall deviation in inches, determine the correct bracket size.
 * Always rounds UP to maintain minimum 1' clearance.
 * Returns null if deviation > 30" (requires additional scaffold run).
 */
function selectBracketSize(deviationIn: number): 10 | 20 | 30 | null {
  if (deviationIn <= 0) return null;
  if (deviationIn <= 10) return 10;
  if (deviationIn <= 20) return 20;
  if (deviationIn <= 30) return 30;
  return null; // >30" — flag warning
}

/**
 * Build frame level stack from stored Frame Configuration data.
 * Falls back to calculating from backend defaults if no stored config.
 */
function buildFrameLevels(
  elevation: ProjectElevation | null,
  tallFrameFt: number,
  workerReachFt: number,
  screwJackMaxIn: number,
): FrameLevel[] {
  const wallHeight = elevation?.wallHeight ?? 42;
  const targetFt = Math.max(0, wallHeight - workerReachFt);
  const screwJackMaxFt = screwJackMaxIn / 12;

  // Try stored frameTall if available
  const storedFrameTall = elevation?.quantityEngine?.frameTall;

  // Build a simple stack: find how many tall frames + base combo
  const baseCombos = [
    { threeH: false, fiveH: false },
    { threeH: true,  fiveH: false },
    { threeH: false, fiveH: true  },
    { threeH: true,  fiveH: true  },
  ];

  for (const combo of baseCombos) {
    const baseHeight = (combo.threeH ? 3 : 0) + (combo.fiveH ? 5 : 0);
    const remaining = targetFt - baseHeight;
    if (remaining < 0) continue;
    const tallCount = Math.floor(remaining / tallFrameFt);
    const stacked = tallCount * tallFrameFt + baseHeight;
    const remainder = targetFt - stacked;
    if (remainder >= 0 && remainder <= screwJackMaxFt) {
      const levels: FrameLevel[] = [];
      let pos = remainder; // screw jack lifts everything up

      if (combo.threeH) {
        levels.push({ heightFt: pos, frameSizeFt: 3, isTall: false });
        pos += 3;
      }
      if (combo.fiveH) {
        levels.push({ heightFt: pos, frameSizeFt: 5, isTall: false });
        pos += 5;
      }
      for (let i = 0; i < tallCount; i++) {
        levels.push({ heightFt: pos, frameSizeFt: tallFrameFt, isTall: true });
        pos += tallFrameFt;
      }
      return levels;
    }
  }

  // Fallback: just use frameTall × tallFrameFt
  const fallbackCount = storedFrameTall ?? Math.ceil(targetFt / tallFrameFt);
  return Array.from({ length: fallbackCount }, (_, i) => ({
    heightFt: i * tallFrameFt,
    frameSizeFt: tallFrameFt,
    isTall: true,
  }));
}

/**
 * Detect bracket conditions by comparing wall x-position at each frame level
 * to the primary wall x-position (first wall trace point).
 * Gap = distance in real-world feet between scaffold deck face and wall face.
 * If gap < 1' → wall popped out → bracket extends away from wall
 * If gap > 1.5' → wall set back → bracket extends toward wall
 */
function detectBrackets(
  wallProfilePoints: WallProfilePoint[],
  frameLevels: FrameLevel[],
  pageUnitsPerFoot: number,
  scaffoldXPdf: number,  // x position of scaffold run in PDF units
  wallOffsetFt: number,  // target 1' gap
): BracketCondition[] {
  if (wallProfilePoints.length < 2 || !pageUnitsPerFoot) return [];

  const brackets: BracketCondition[] = [];
  const primaryWallX = wallProfilePoints[0].x;
  const targetGapPx = wallOffsetFt * pageUnitsPerFoot;

  frameLevels.forEach((level, i) => {
    // Find wall x at this frame level's top height
    const levelTopFt = level.heightFt + level.frameSizeFt;

    // Interpolate wall x at this height
    let wallXAtLevel = primaryWallX;
    for (let j = 0; j < wallProfilePoints.length - 1; j++) {
      const p1 = wallProfilePoints[j];
      const p2 = wallProfilePoints[j + 1];
      if (levelTopFt >= p1.heightFt && levelTopFt <= p2.heightFt) {
        const t = (levelTopFt - p1.heightFt) / Math.max(0.01, p2.heightFt - p1.heightFt);
        wallXAtLevel = p1.x + t * (p2.x - p1.x);
        break;
      }
    }

    // Current gap in PDF units
    const currentGapPx = Math.abs(scaffoldXPdf - wallXAtLevel);
    const currentGapFt = currentGapPx / pageUnitsPerFoot;

    if (currentGapFt >= CLEARANCE_MIN_FT && currentGapFt <= CLEARANCE_MAX_FT) return; // OK

    const deviationFt = currentGapFt < CLEARANCE_MIN_FT
      ? CLEARANCE_MIN_FT - currentGapFt  // wall popped out
      : currentGapFt - CLEARANCE_MAX_FT; // wall set back

    const deviationIn = Math.round(deviationFt * 12);
    const bracketSize = selectBracketSize(deviationIn);
    if (!bracketSize) {
      // >30" — flagged as warning, no bracket placed
      return;
    }

    brackets.push({
      levelIndex: i,
      heightFt: levelTopFt,
      deviationIn,
      bracketSizeIn: bracketSize,
      direction: currentGapFt < CLEARANCE_MIN_FT ? "out" : "in",
      wallXAtLevel,
    });
  });

  return brackets;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SectionViewPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("Section View");

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [zoom, setZoom] = useState(0.5);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Trace state
  const [gradePoint, setGradePoint] = useState<Point | null>(null);
  const [wallProfilePdf, setWallProfilePdf] = useState<Point[]>([]);
  const [pickMode, setPickMode] = useState<"grade" | "wall" | "scale1" | "scale2" | null>(null);
  const [pageUnitsPerFoot, setPageUnitsPerFoot] = useState<number | null>(null);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [knownScaleFeet, setKnownScaleFeet] = useState("");

  // Warnings
  const [overThirtyWarnings, setOverThirtyWarnings] = useState<number[]>([]);

  const backend = getBackendSettings();
  const tallFrameFt   = backend.scaffold.frameHeight ?? (6 + 4 / 12);
  const workerReachFt = backend.scaffold.workerReachHeight ?? 6;
  const screwJackMaxIn = backend.scaffold.screwJackMaxExtension ?? 12;
  const wallOffsetFt  = backend.scaffold.wallOffset ?? 1;
  const scaffoldWidthFt = activeElevationData?.scaffoldInput?.scaffoldWidth ?? 3;

  useEffect(() => {
    const elevation = getActiveElevation();
    const project = getActiveProject();
    setActiveElevationData(elevation);
    setActiveProjectName(project.projectName || "Section View");
    // Inherit scale from takeoff workspace if available
    if (elevation.scale?.pageUnitsPerFoot) {
      setPageUnitsPerFoot(elevation.scale.pageUnitsPerFoot);
    }
  }, []);

  // Render PDF page
  useEffect(() => {
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error(e);
      } finally {
        renderTaskRef.current = null;
      }
    }
    renderPage();
  }, [pdfDoc, pageNumber, zoom]);

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;
    setPdfLoading(true);
    setPdfError("");
    setPdfFileName(file.name);
    setPageNumber(1); setPageJump("1");
    setGradePoint(null);
    setWallProfilePdf([]);
    setPickMode(null);
    try {
      if (typeof Promise.withResolvers === "undefined") {
        (Promise as any).withResolvers = function () {
          let resolve: any, reject: any;
          const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
          return { promise, resolve: resolve!, reject: reject! };
        };
      }
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.min.mjs";
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
    } catch (err: any) {
      setPdfError(`Could not load PDF: ${err?.message ?? String(err)}`);
      setPdfDoc(null);
    } finally {
      setPdfLoading(false);
    }
  }

  function getClickPoint(e: React.MouseEvent<HTMLDivElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return { x: x / zoom, y: y / zoom };
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pickMode) return;
    const pt = getClickPoint(e);
    if (!pt) return;

    if (pickMode === "grade") {
      setGradePoint(pt);
      setPickMode(null);
    } else if (pickMode === "wall") {
      setWallProfilePdf(current => [...current, pt]);
    } else if (pickMode === "scale1") {
      setScalePoints([pt]);
      setPickMode("scale2");
    } else if (pickMode === "scale2") {
      const pts = [...scalePoints, pt];
      setScalePoints(pts);
      setPickMode(null);
      // Auto-calculate if knownScaleFeet is already entered
      if (knownScaleFeet) {
        const feet = parseFloat(knownScaleFeet.replace(/[^0-9.]/g, ""));
        if (feet > 0 && pts.length === 2) {
          const dx = pts[1].x - pts[0].x;
          const dy = pts[1].y - pts[0].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          setPageUnitsPerFoot(dist / feet);
          setScalePoints([]);
        }
      }
    }
  }

  function calibrateScale() {
    if (scalePoints.length < 2) { alert("Click two points on the section sheet first."); return; }
    const feet = parseFloat(knownScaleFeet.replace(/[^0-9.]/g, ""));
    if (!feet || feet <= 0) { alert("Enter the known distance in feet."); return; }
    const dx = scalePoints[1].x - scalePoints[0].x;
    const dy = scalePoints[1].y - scalePoints[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    setPageUnitsPerFoot(dist / feet);
    setScalePoints([]);
    setKnownScaleFeet("");
  }

  // Convert wall profile PDF points to real-world heights using grade anchor
  const wallProfilePoints: WallProfilePoint[] = useMemo(() => {
    if (!gradePoint || !pageUnitsPerFoot || wallProfilePdf.length === 0) return [];
    return wallProfilePdf.map(pt => {
      // In PDF coords, y increases downward. Height from grade = (gradePoint.y - pt.y) / pageUnitsPerFoot
      const heightFt = (gradePoint.y - pt.y) / pageUnitsPerFoot;
      return { x: pt.x, y: pt.y, heightFt: Math.max(0, heightFt) };
    }).sort((a, b) => a.heightFt - b.heightFt);
  }, [wallProfilePdf, gradePoint, pageUnitsPerFoot]);

  // Build frame levels from stored frame configuration
  const frameLevels = useMemo(() => {
    return buildFrameLevels(activeElevationData, tallFrameFt, workerReachFt, screwJackMaxIn);
  }, [activeElevationData, tallFrameFt, workerReachFt, screwJackMaxIn]);

  // Determine scaffold x position from grade point + wall offset
  const scaffoldXPdf = useMemo(() => {
    if (!gradePoint || !pageUnitsPerFoot || wallProfilePoints.length === 0) return null;
    // Place scaffold at wall x - (wallOffset in PDF units) — to the left of wall
    const primaryWallX = wallProfilePoints[0].x;
    return primaryWallX - wallOffsetFt * pageUnitsPerFoot;
  }, [gradePoint, pageUnitsPerFoot, wallProfilePoints, wallOffsetFt]);

  // Detect bracket conditions
  const brackets = useMemo(() => {
    if (!scaffoldXPdf || !pageUnitsPerFoot) return [];
    const result = detectBrackets(wallProfilePoints, frameLevels, pageUnitsPerFoot, scaffoldXPdf, wallOffsetFt);
    // Flag >30" warnings
    const warnings: number[] = [];
    frameLevels.forEach((level, i) => {
      const levelTopFt = level.heightFt + level.frameSizeFt;
      if (wallProfilePoints.length >= 2) {
        const primaryWallX = wallProfilePoints[0].x;
        let wallXAtLevel = primaryWallX;
        for (let j = 0; j < wallProfilePoints.length - 1; j++) {
          const p1 = wallProfilePoints[j];
          const p2 = wallProfilePoints[j + 1];
          if (levelTopFt >= p1.heightFt && levelTopFt <= p2.heightFt) {
            const t = (levelTopFt - p1.heightFt) / Math.max(0.01, p2.heightFt - p1.heightFt);
            wallXAtLevel = p1.x + t * (p2.x - p1.x);
            break;
          }
        }
        const gapFt = Math.abs(scaffoldXPdf - wallXAtLevel) / pageUnitsPerFoot;
        const devFt = gapFt < CLEARANCE_MIN_FT ? CLEARANCE_MIN_FT - gapFt : gapFt > CLEARANCE_MAX_FT ? gapFt - CLEARANCE_MAX_FT : 0;
        const devIn = Math.round(devFt * 12);
        if (devIn > 30) warnings.push(i);
      }
    });
    setOverThirtyWarnings(warnings);
    return result;
  }, [wallProfilePoints, frameLevels, scaffoldXPdf, pageUnitsPerFoot, wallOffsetFt]);

  // Bracket schedule for sidebar
  const bracketSchedule = useMemo(() => {
    const counts = { 10: 0, 20: 0, 30: 0 };
    brackets.forEach(b => { counts[b.bracketSizeIn]++; });
    return counts;
  }, [brackets]);

  function goToPage() {
    const t = Number(pageJump);
    if (t >= 1 && t <= numPages) setPageNumber(t);
  }

  const canGenerateSection = gradePoint !== null && wallProfilePoints.length >= 1 && pageUnitsPerFoot !== null;

  // Offset calculation for canvas markers
  function markerStyle(pt: Point): { left: number; top: number } {
    const ox = canvasRef.current?.offsetLeft ?? 32;
    const oy = canvasRef.current?.offsetTop ?? 32;
    return { left: pt.x * zoom + ox, top: pt.y * zoom + oy };
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanHeader
        title="Section View"
        subtitle="Auto-generated scaffold section drawing — orange overlay on building section sheet"
        menuLinks={sectionMenuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(c => !c)}
        actionsClassName="gap-4"
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={activeProjectName} />
            <KorbanHeaderMeta label="Wall Height" value={formatFt(activeElevationData?.wallHeight ?? 0)} />
            <KorbanHeaderMeta label="Jumps" value={String(frameLevels.length)} />
            <KorbanButton as="a" href="/frame-configuration" variant="ghost">Frame Config</KorbanButton>
            <KorbanButton as="a" href="/estimate-review" variant="primary">Save & Continue</KorbanButton>
          </>
        }
      />

      <section className="grid h-[calc(100vh-125px)] grid-cols-[minmax(0,1fr)_400px]">

        {/* ── Canvas ── */}
        <section className="relative overflow-hidden border-r border-orange-500/20 bg-black">

          {/* Top HUD */}
          <div className="absolute left-6 top-5 z-20 flex flex-wrap items-center gap-3">
            {/* Upload button */}
            <label className={`cursor-pointer rounded-2xl border px-4 py-2 text-xs font-bold transition ${pdfDoc ? "border-zinc-800 bg-black/80 text-zinc-400" : "border-orange-500/40 bg-orange-500/10 text-orange-300"}`}>
              {pdfDoc ? pdfFileName.slice(0, 20) + (pdfFileName.length > 20 ? "…" : "") : "Upload Section PDF"}
              <input ref={uploadRef} type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
            </label>

            {/* Pick grade */}
            {pdfDoc && (
              <button
                onClick={() => setPickMode(pickMode === "grade" ? null : "grade")}
                className={`rounded-2xl border px-4 py-2 text-xs font-bold transition ${
                  pickMode === "grade"
                    ? "animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                    : gradePoint
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-orange-500/30 bg-orange-500/10 text-orange-300"
                }`}
              >
                {pickMode === "grade" ? "Click Grade Line…" : gradePoint ? "✓ Grade Set" : "1. Set Grade"}
              </button>
            )}

            {/* Pick wall profile */}
            {pdfDoc && gradePoint && (
              <button
                onClick={() => setPickMode(pickMode === "wall" ? null : "wall")}
                className={`rounded-2xl border px-4 py-2 text-xs font-bold transition ${
                  pickMode === "wall"
                    ? "animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                    : wallProfilePdf.length > 0
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-orange-500/30 bg-orange-500/10 text-orange-300"
                }`}
              >
                {pickMode === "wall"
                  ? `Tracing… (${wallProfilePdf.length} pts — click Done when finished)`
                  : wallProfilePdf.length > 0
                  ? `✓ Wall Profile (${wallProfilePdf.length} pts)`
                  : "2. Trace Wall Profile"}
              </button>
            )}

            {/* Done tracing */}
            {pickMode === "wall" && wallProfilePdf.length >= 1 && (
              <button
                onClick={() => setPickMode(null)}
                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300"
              >
                Done Tracing
              </button>
            )}

            {/* Clear wall */}
            {wallProfilePdf.length > 0 && (
              <button
                onClick={() => { setWallProfilePdf([]); setPickMode(null); }}
                className="rounded-2xl border border-zinc-800 bg-black/80 px-3 py-2 text-xs text-zinc-500 hover:text-red-400 hover:border-red-500/30"
              >
                Clear Wall
              </button>
            )}

            {/* Set Scale — calibrate directly on section sheet */}
            {pdfDoc && (
              <>
                <button
                  onClick={() => setPickMode(pickMode === "scale1" || pickMode === "scale2" ? null : "scale1")}
                  className={`rounded-2xl border px-4 py-2 text-xs font-bold transition ${
                    pickMode === "scale1" || pickMode === "scale2"
                      ? "animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                      : pageUnitsPerFoot
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700 bg-black/80 text-zinc-400"
                  }`}
                >
                  {pickMode === "scale1" ? "Click Point 1…" : pickMode === "scale2" ? "Click Point 2…" : pageUnitsPerFoot ? "✓ Scale Set" : "Set Scale"}
                </button>

                {/* Known distance input + confirm — only shown while calibrating */}
                {(pickMode === "scale1" || pickMode === "scale2" || scalePoints.length === 2) && (
                  <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-black/90 px-3 py-1.5 backdrop-blur">
                    <span className="text-[10px] text-zinc-500">Known distance</span>
                    <input
                      value={knownScaleFeet}
                      onChange={e => setKnownScaleFeet(e.target.value)}
                      placeholder="e.g. 10'"
                      className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] font-mono text-orange-300 outline-none"
                    />
                    {scalePoints.length === 2 && knownScaleFeet && (
                      <button
                        onClick={calibrateScale}
                        className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-[10px] font-bold text-emerald-300"
                      >
                        Set
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Warnings */}
            {overThirtyWarnings.length > 0 && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-300">
                ⚠ {overThirtyWarnings.length} level{overThirtyWarnings.length > 1 ? "s" : ""} need additional scaffold run (&gt;30")
              </div>
            )}
          </div>

          {/* PDF controls — bottom center */}
          {pdfDoc && (
            <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1.5 rounded-2xl border border-orange-500/20 bg-black/80 px-3 py-1.5 backdrop-blur" style={{ flexWrap: "nowrap" }}>
              <span className="w-28 shrink-0 truncate rounded-full border border-orange-500/20 bg-black px-2 py-1 text-[9px] text-zinc-400">{pdfFileName || "No PDF"}</span>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 disabled:opacity-30 hover:text-zinc-200" disabled={pageNumber <= 1} onClick={() => { const p = Math.max(1, pageNumber - 1); setPageNumber(p); setPageJump(String(p)); }}>‹</button>
              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px]">
                <input value={pageJump} onChange={e => setPageJump(e.target.value)} onKeyDown={e => { if (e.key === "Enter") goToPage(); }} className="w-8 rounded bg-zinc-950 px-1 py-0.5 text-center text-zinc-200 outline-none" />
                <span className="text-zinc-500">/{numPages}</span>
                <button onClick={goToPage} className="rounded bg-zinc-900 px-1 py-0.5 text-zinc-300">Go</button>
              </div>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 disabled:opacity-30 hover:text-zinc-200" disabled={pageNumber >= numPages} onClick={() => { const p = Math.min(numPages, pageNumber + 1); setPageNumber(p); setPageJump(String(p)); }}>›</button>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={() => setZoom(c => Math.max(0.1, c - 0.1))}>−</button>
              <span className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] font-bold text-orange-300">{Math.round(zoom * 100)}%</span>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={() => setZoom(c => Math.min(3, c + 0.1))}>+</button>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={() => setZoom(0.25)}>Fit</button>
              <button className="shrink-0 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={() => setZoom(0.5)}>Width</button>
            </div>
          )}

          {/* Background grid */}
          <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:36px_36px]" />

          {/* Main scroll area */}
          <div className="absolute inset-0 overflow-auto pb-20 pt-16">
            {pdfLoading && (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading PDF...</div>
            )}
            {pdfError && (
              <div className="flex h-full items-center justify-center text-sm text-red-400">{pdfError}</div>
            )}

            {!pdfDoc && !pdfLoading && !pdfError && (
              <button onClick={() => uploadRef.current?.click()} className="flex h-full w-full cursor-pointer items-center justify-center">
                <div className="rounded-[2rem] border border-zinc-800 bg-[#050505] p-12 text-center shadow-2xl">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-4xl text-orange-500">+</div>
                  <h2 className="text-lg font-semibold">Upload Section Sheet PDF</h2>
                  <p className="mt-3 max-w-sm text-xs leading-5 text-zinc-500">
                    Upload the building section/elevation sheet from your plan set. KORBAN will overlay the orange scaffold section drawing automatically once the grade anchor and wall profile are traced.
                  </p>
                </div>
              </button>
            )}

            {pdfDoc && (
              <div className="relative z-10 flex min-h-full min-w-max justify-center p-10">
                <div
                  ref={canvasContainerRef}
                  onClick={handleCanvasClick}
                  className={`relative h-fit rounded-[2rem] border border-zinc-800 bg-[#050505] p-4 shadow-2xl ${pickMode ? "cursor-crosshair" : ""}`}
                >
                  <div className="overflow-hidden rounded-[1.25rem] bg-white p-4 shadow-inner">
                    <canvas ref={canvasRef} />
                  </div>

                  {/* Grade point marker */}
                  {gradePoint && (() => {
                    const s = markerStyle(gradePoint);
                    return (
                      <div className="absolute z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: s.left, top: s.top }}>
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-yellow-400 bg-yellow-400/20 text-[8px] font-bold text-yellow-300">G</div>
                      </div>
                    );
                  })()}

                  {/* Wall profile markers */}
                  {wallProfilePdf.map((pt, i) => {
                    const s = markerStyle(pt);
                    return (
                      <div key={`wall-${i}`} className="absolute z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: s.left, top: s.top }}>
                        <div className="flex h-4 w-4 items-center justify-center rounded-full border border-orange-400/60 bg-orange-500/20 text-[7px] font-bold text-orange-300">{i + 1}</div>
                      </div>
                    );
                  })}

                  {/* Wall profile polyline */}
                  {wallProfilePdf.length >= 2 && (() => {
                    const ox = canvasRef.current?.offsetLeft ?? 32;
                    const oy = canvasRef.current?.offsetTop ?? 32;
                    return (
                      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                        {wallProfilePdf.slice(1).map((pt, i) => {
                          const prev = wallProfilePdf[i];
                          return (
                            <line
                              key={`wall-line-${i}`}
                              x1={prev.x * zoom + ox} y1={prev.y * zoom + oy}
                              x2={pt.x * zoom + ox}  y2={pt.y * zoom + oy}
                              stroke="#f97316" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7"
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}

                  {/* ── Orange scaffold section overlay ── */}
                  {canGenerateSection && scaffoldXPdf !== null && (() => {
                    const ox = canvasRef.current?.offsetLeft ?? 32;
                    const oy = canvasRef.current?.offsetTop ?? 32;
                    const puf = pageUnitsPerFoot!;
                    const gradeY = gradePoint!.y;
                    const frameWidthPx = scaffoldWidthFt * puf;
                    const screwJackFt = (screwJackMaxIn / 2) / 12; // use half max as display
                    const screwJackPx = screwJackFt * puf;

                    const scaffoldLeft  = scaffoldXPdf;
                    const scaffoldRight = scaffoldXPdf + frameWidthPx;

                    function toSvgX(pdfX: number) { return pdfX * zoom + ox; }
                    function toSvgY(pdfY: number) { return pdfY * zoom + oy; }
                    function heightToY(ft: number) { return gradeY - ft * puf; }

                    const totalStackFt = frameLevels.length > 0
                      ? frameLevels[frameLevels.length - 1].heightFt + frameLevels[frameLevels.length - 1].frameSizeFt
                      : 0;

                    return (
                      <svg className="pointer-events-none absolute inset-0 z-25 h-full w-full">
                        {/* Screw jack */}
                        <rect
                          x={toSvgX(scaffoldLeft + frameWidthPx * 0.3)}
                          y={toSvgY(heightToY(screwJackFt))}
                          width={(frameWidthPx * 0.4) * zoom}
                          height={screwJackPx * zoom}
                          fill="rgba(249,115,22,0.2)"
                          stroke="#f97316"
                          strokeWidth="0.8"
                          opacity="0.8"
                        />

                        {/* Frame levels */}
                        {frameLevels.map((level, i) => {
                          const bottomY = heightToY(level.heightFt);
                          const topY    = heightToY(level.heightFt + level.frameSizeFt);
                          const frameColor = level.isTall ? "#f97316" : "rgba(249,115,22,0.65)";
                          const sw = level.isTall ? 1.2 : 0.9;

                          // Check for bracket at this level
                          const bracket = brackets.find(b => b.levelIndex === i);
                          const bracketLengthPx = bracket ? (bracket.bracketSizeIn / 12) * puf * zoom : 0;

                          return (
                            <g key={`frame-${i}`}>
                              {/* Left leg */}
                              <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(bottomY)} x2={toSvgX(scaffoldLeft)} y2={toSvgY(topY)} stroke={frameColor} strokeWidth={sw} />
                              {/* Right leg */}
                              <line x1={toSvgX(scaffoldRight)} y1={toSvgY(bottomY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(topY)} stroke={frameColor} strokeWidth={sw} />
                              {/* Top cross member */}
                              <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(topY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(topY)} stroke={frameColor} strokeWidth={sw} />
                              {/* Bottom cross (bottom frame only) */}
                              {i === 0 && <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(bottomY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(bottomY)} stroke={frameColor} strokeWidth={sw} />}
                              {/* Diagonal brace */}
                              <line
                                x1={toSvgX(scaffoldLeft)}
                                y1={toSvgY(topY + (bottomY - topY) * 0.15)}
                                x2={toSvgX(scaffoldRight)}
                                y2={toSvgY(topY + (bottomY - topY) * 0.85)}
                                stroke={frameColor}
                                strokeWidth={0.5}
                                opacity={0.45}
                              />
                              {/* Plank */}
                              <rect
                                x={toSvgX(scaffoldLeft - 3)}
                                y={toSvgY(topY) - 1.5}
                                width={(frameWidthPx + 6) * zoom}
                                height={2.5}
                                fill="#f97316"
                                opacity={0.75}
                              />

                              {/* Bracket if needed */}
                              {bracket && (
                                <g>
                                  {bracket.direction === "in" ? (
                                    // Extend toward wall (setback condition)
                                    <line
                                      x1={toSvgX(scaffoldRight)}
                                      y1={toSvgY(topY)}
                                      x2={toSvgX(scaffoldRight) + bracketLengthPx}
                                      y2={toSvgY(topY)}
                                      stroke="#f97316"
                                      strokeWidth={1.5}
                                      opacity={0.9}
                                    />
                                  ) : (
                                    // Extend away from wall (popout condition)
                                    <line
                                      x1={toSvgX(scaffoldLeft)}
                                      y1={toSvgY(topY)}
                                      x2={toSvgX(scaffoldLeft) - bracketLengthPx}
                                      y2={toSvgY(topY)}
                                      stroke="#f97316"
                                      strokeWidth={1.5}
                                      opacity={0.9}
                                    />
                                  )}
                                  {/* Bracket label */}
                                  <text
                                    x={bracket.direction === "in"
                                      ? toSvgX(scaffoldRight) + bracketLengthPx / 2
                                      : toSvgX(scaffoldLeft) - bracketLengthPx / 2}
                                    y={toSvgY(topY) - 4}
                                    fill="#f97316"
                                    fontSize="7"
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                    opacity="0.9"
                                  >
                                    {bracket.bracketSizeIn}"
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}

                        {/* Guard rail */}
                        {(() => {
                          const topDeckY = heightToY(totalStackFt);
                          const postTopY = heightToY(totalStackFt + GUARDRAIL_POST_HEIGHT_FT);
                          const topRailY = heightToY(totalStackFt + GUARDRAIL_TOP_RAIL_FT);
                          const midRailY = heightToY(totalStackFt + GUARDRAIL_MID_RAIL_FT);
                          return (
                            <g opacity="0.85">
                              {/* Posts */}
                              <line x1={toSvgX(scaffoldLeft)}  y1={toSvgY(topDeckY)} x2={toSvgX(scaffoldLeft)}  y2={toSvgY(postTopY)} stroke="#f97316" strokeWidth="1" />
                              <line x1={toSvgX(scaffoldRight)} y1={toSvgY(topDeckY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(postTopY)} stroke="#f97316" strokeWidth="1" />
                              {/* Top rail */}
                              <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(topRailY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(topRailY)} stroke="#f97316" strokeWidth="1" />
                              {/* Mid rail */}
                              <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(midRailY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(midRailY)} stroke="#f97316" strokeWidth="0.7" opacity="0.6" />
                            </g>
                          );
                        })()}

                        {/* Total height dimension */}
                        {(() => {
                          const dimX = scaffoldLeft - 18 / zoom;
                          const gradeYpdf = gradePoint!.y;
                          const topYpdf = heightToY(totalStackFt);
                          return (
                            <g>
                              <line x1={toSvgX(dimX)} y1={toSvgY(gradeYpdf)} x2={toSvgX(dimX)} y2={toSvgY(topYpdf)} stroke="#f97316" strokeWidth="0.7" opacity="0.7" />
                              <line x1={toSvgX(dimX - 5/zoom)} y1={toSvgY(gradeYpdf)} x2={toSvgX(dimX + 5/zoom)} y2={toSvgY(gradeYpdf)} stroke="#f97316" strokeWidth="0.7" opacity="0.7" />
                              <line x1={toSvgX(dimX - 5/zoom)} y1={toSvgY(topYpdf)} x2={toSvgX(dimX + 5/zoom)} y2={toSvgY(topYpdf)} stroke="#f97316" strokeWidth="0.7" opacity="0.7" />
                              <text
                                x={toSvgX(dimX - 8/zoom)}
                                y={(toSvgY(gradeYpdf) + toSvgY(topYpdf)) / 2}
                                fill="#f97316"
                                fontSize="8"
                                fontFamily="monospace"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                transform={`rotate(-90, ${toSvgX(dimX - 8/zoom)}, ${(toSvgY(gradeYpdf) + toSvgY(topYpdf)) / 2})`}
                                opacity="0.9"
                              >
                                {formatFt(totalStackFt)}
                              </text>
                            </g>
                          );
                        })()}

                        {/* Scaffold width dimension */}
                        {(() => {
                          const dimY = heightToY(-1.5);
                          return (
                            <g>
                              <line x1={toSvgX(scaffoldLeft)} y1={toSvgY(dimY)} x2={toSvgX(scaffoldRight)} y2={toSvgY(dimY)} stroke="#f97316" strokeWidth="0.7" opacity="0.7" />
                              <text x={(toSvgX(scaffoldLeft) + toSvgX(scaffoldRight)) / 2} y={toSvgY(dimY) + 10} fill="#f97316" fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.8">
                                {formatFt(scaffoldWidthFt)} W
                              </text>
                            </g>
                          );
                        })()}

                        {/* Grade line */}
                        <line
                          x1={toSvgX(scaffoldLeft - 20)}
                          y1={toSvgY(gradePoint!.y)}
                          x2={toSvgX(scaffoldRight + 20)}
                          y2={toSvgY(gradePoint!.y)}
                          stroke="#f97316"
                          strokeWidth="1"
                          opacity="0.5"
                          strokeDasharray="4 4"
                        />
                        <text x={toSvgX(scaffoldRight + 22)} y={toSvgY(gradePoint!.y) + 3} fill="#f97316" fontSize="7" fontFamily="monospace" opacity="0.6">GRADE</text>

                      </svg>
                    );
                  })()}

                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Sidebar ── */}
        <aside className="overflow-y-auto bg-[#080604] p-4 space-y-4">

          {/* Getting Started — shown until section is ready */}
          {!canGenerateSection && (
            <SidePanel title="Getting Started" subtitle="Steps to generate the section drawing">
              <div className="space-y-3">
                <Step num={1} title="Upload Section Sheet" desc="Upload the section/elevation sheet from your plan set PDF." done={!!pdfDoc} />
                <Step num={2} title="Set Scale" desc="Use 'Set Scale' in the toolbar — click two known points, enter the real-world distance." done={!!pageUnitsPerFoot} />
                <Step num={3} title="Set Grade" desc="Click 'Set Grade' then click once on the grade line. This anchors the scaffold base." done={!!gradePoint} />
                <Step num={4} title="Trace Wall Profile" desc="Click at each point where the wall face changes position. Click Done when finished." done={wallProfilePdf.length > 0} />
              </div>
            </SidePanel>
          )}

          {/* Frame Configuration — real data from Frame Configuration page */}
          <SidePanel title="Frame Configuration" subtitle="From Frame Configuration — drives section drawing">
            {frameLevels.length === 0 ? (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-300">
                No frame configuration found. Complete Frame Configuration first.
              </div>
            ) : (
              <div className="space-y-1.5">
                <QuantRow label="Total Jumps" value={String(frameLevels.length)} />
                <QuantRow label={"Tall Frames (6'-4\")"} value={String(frameLevels.filter(l => l.isTall).length)} />
                <QuantRow label="Short Frames" value={String(frameLevels.filter(l => !l.isTall).length)} />
                <QuantRow label="Scaffold Width" value={formatFt(scaffoldWidthFt)} />
                <QuantRow label="Wall Height" value={formatFt(activeElevationData?.wallHeight ?? 0)} />
                <QuantRow label="Worker Reach" value={formatFt(workerReachFt)} />
              </div>
            )}
            <a href="/frame-configuration" className="mt-3 block rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-center text-[10px] font-bold text-orange-300 hover:bg-orange-500/20">
              Adjust Frame Configuration →
            </a>
          </SidePanel>

          {/* Wall conditions — shown after tracing */}
          {wallProfilePoints.length > 0 && (
            <SidePanel title="Wall Conditions" subtitle="Detected from wall profile trace">
              {brackets.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No brackets required — wall stays within 1'–1'6" clearance at all levels.
                </p>
              ) : (
                <div className="space-y-2">
                  {BRACKET_SIZES.map(size =>
                    bracketSchedule[size] > 0 ? (
                      <div key={size} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
                        <div>
                          <p className="text-xs font-bold text-zinc-200">{size}" Bracket</p>
                          <p className="text-[10px] text-zinc-600">
                            {size === 10 ? "Minor wall deviation" : size === 20 ? "Moderate wall deviation" : "Significant wall deviation"}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-orange-300">{bracketSchedule[size]}</span>
                      </div>
                    ) : null
                  )}
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2">
                    <span className="text-[10px] text-zinc-500">Total Brackets</span>
                    <span className="font-mono text-xs font-bold text-orange-300">{brackets.length}</span>
                  </div>
                </div>
              )}

              {overThirtyWarnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-[10px] font-bold text-red-400 mb-1">⚠ Additional Scaffold Run Required</p>
                  <p className="text-[10px] text-zinc-500">
                    {overThirtyWarnings.length} level{overThirtyWarnings.length > 1 ? "s" : ""} exceed 30" deviation. Requires separate scaffold run with steel beam cantilever (4'–12'). Flag for field review.
                  </p>
                </div>
              )}
            </SidePanel>
          )}

          {/* Next step */}
          <SidePanel title="Next Step" subtitle="Proceed to Estimate Review">
            <div className="grid gap-2">
              <a href="/frame-configuration" className="block rounded-xl border border-zinc-800 bg-black px-4 py-3 text-center text-xs font-bold text-zinc-400 hover:border-orange-500/30 hover:text-orange-300">
                ← Frame Configuration
              </a>
              <a href="/estimate-review" className="block rounded-xl bg-orange-500 px-4 py-3 text-center text-xs font-bold text-black hover:bg-orange-400">
                Save & Continue to Estimate →
              </a>
            </div>
          </SidePanel>

        </aside>
      </section>
    </main>
  );
}

function SidePanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.6rem] border border-zinc-800 bg-korban-raised p-4 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
        </div>
        <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
      </div>
      {children}
    </section>
  );
}

function QuantRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="font-mono text-[10px] font-bold text-zinc-200">{value}</span>
    </div>
  );
}

function Step({ num, title, desc, done }: { num: number; title: string; desc: string; done: boolean }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-3 ${done ? "border-emerald-500/20 bg-emerald-500/5" : "border-zinc-800 bg-black"}`}>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>
        {done ? "✓" : num}
      </div>
      <div>
        <p className={`text-xs font-bold ${done ? "text-emerald-300" : "text-zinc-300"}`}>{title}</p>
        <p className="mt-0.5 text-[10px] text-zinc-600">{desc}</p>
      </div>
    </div>
  );
}
