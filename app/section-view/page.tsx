"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getActiveElevation,
  getActiveProject,
  getActiveProjectId,
  hasTakeoffOverlayGeometry,
  type ProjectElevation,
} from "@/lib/projectStore";

type ToolName = "Notes" | "Callouts" | "Leaders" | "Highlight" | "Draw" | "Dimension" | "Erase" | "Select";

const frameConfig = [
  ["Frame Width", "3'-0\""],
  ["Frame Heights / Frame Makeup", "5 x 6'-4\" + 1 x 5'-0\" + 1 x 3'-0\""],
  ["Frames Tall", "7"],
  ["Jumps", "7"],
  ["Plank Count", "2 / Bay"],
  ["Brace Pattern", "Cross Brace Every Bay"],
  ["Wall Offset", "1'-0\""],
];

const primaryParts = [
  "6'-4\" Frame",
  "5'-0\" Frame",
  "3'-0\" Frame",
  "Cross Brace",
  "Plank / Deck",
  "Base Plate",
  "Screw Jack",
  "Wall Tie",
  "Ladder",
];

const tools: ToolName[] = ["Notes", "Callouts", "Leaders", "Highlight", "Draw", "Dimension", "Erase", "Select"];

export default function SectionViewPage() {
  const [activePart, setActivePart] = useState("6'-4\" Frame");
  const [activeTool, setActiveTool] = useState<ToolName>("Select");
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("Mare Island Apartments");

  useEffect(() => {
    function loadActiveElevation() {
      const elevation = getActiveElevation();
      console.log("SECTION VIEW LOADED LF:", elevation.linearFeet);
      setActiveElevationData(elevation);
      setActiveProjectName(getActiveProject().projectName || "Mare Island Apartments");
    }

    loadActiveElevation();
    window.addEventListener("focus", loadActiveElevation);
    window.addEventListener("pageshow", loadActiveElevation);

    return () => {
      window.removeEventListener("focus", loadActiveElevation);
      window.removeEventListener("pageshow", loadActiveElevation);
    };
  }, []);

  const sharedFrameConfig = useMemo(() => {
    if (!activeElevationData) return frameConfig;

    return [
      ["Frame Width", `${activeElevationData.scaffoldInput.scaffoldWidth}'-0"`],
      ["Total Linear Ft", `${activeElevationData.linearFeet.toLocaleString()} LF`],
      ["Frame Heights / Frame Makeup", activeElevationData.sectionView.frameMakeup],
      ["Frames Tall", String(activeElevationData.quantityEngine.frameTall)],
      ["Jumps", String(activeElevationData.quantityEngine.jumps)],
      ["Plank Count", `${activeElevationData.scaffoldInput.plankCountPerBay} / Bay`],
      ["Brace Pattern", activeElevationData.scaffoldInput.bracePattern],
      ["Wall Offset", `${activeElevationData.scaffoldInput.wallOffset}'-0"`],
    ];
  }, [activeElevationData]);

  const activeQuantity = activeElevationData?.quantityEngine;

  return (
    <main className="h-screen overflow-hidden bg-[#030303] text-zinc-100">
      <header className="flex h-[76px] items-center justify-between border-b border-orange-500/25 bg-[#050403] px-5 shadow-[0_8px_26px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.48em] text-orange-500">KORBAN</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Section View Design</h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
              <span className="text-zinc-500">Generated From:</span>
              <span>Level: <span className="text-zinc-400">{activeElevationData?.levelName ?? "Main Level"}</span></span>
              <span>Elevation: <span className="text-zinc-400">{activeElevationData?.elevationName ?? "North"}</span></span>
              <span>Frame Width: <span className="text-zinc-400">{activeElevationData ? `${activeElevationData.scaffoldInput.scaffoldWidth}'-0"` : "3'-0\""}</span></span>
              <span>Frames Tall: <span className="text-zinc-400">{activeQuantity?.frameTall ?? 7}</span></span>
              <span>Bay Count: <span className="text-zinc-400">{activeQuantity?.bayCount ?? 54}</span></span>
              <span>Leg Count: <span className="text-zinc-400">{activeQuantity?.legCount ?? 54}</span></span>
            </div>
          </div>
          <div className="hidden h-8 border-l border-zinc-700/70 lg:block" />
          <p className="hidden max-w-xl text-[11px] uppercase tracking-[0.24em] text-zinc-600 xl:block">
            {activeProjectName} / CAD section assembly workspace
          </p>
        </div>

        <nav className="hidden items-center gap-2 xl:flex">
          <TopAction href="/set-scaffold" label="Back to Set Scaffold" />
          <TopAction href="/project-plan-desk" label="Project Plan Desk" />
          <TopAction href="#" label="Save Section View" />
          <TopAction href="#" label="Export Section PDF" />
          <TopAction href="/estimate-review" label="Continue to Estimate Review" primary />
        </nav>
      </header>

      <ProjectDebugStrip projectName={activeProjectName} elevation={activeElevationData} />

      <section className="grid h-[calc(100vh-104px)] grid-rows-[128px_minmax(0,1fr)_172px] overflow-hidden bg-[#030303]">
        <section className="relative border-b border-orange-500/35 bg-[#0b0805] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-2px_0_rgba(249,115,22,0.16),0_10px_28px_rgba(0,0,0,0.45)]">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-orange-400">
                Frame Configuration Summary
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                Active section build from set scaffold output
              </p>
            </div>
            <span className="border border-orange-500/35 bg-[#120904] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-orange-300 shadow-[inset_0_0_12px_rgba(249,115,22,0.08)]">
              {activeElevationData?.sectionView.selectedRun ?? "North Run N-01"} / {activeElevationData?.sectionView.sectionType ?? "A-A"}
            </span>
          </div>

          <div className="grid grid-cols-[0.9fr_0.9fr_2.15fr_0.72fr_0.62fr_0.82fr_1.15fr_0.8fr] gap-px border border-zinc-800/80 bg-zinc-800/80">
            {sharedFrameConfig.map(([label, value]) => (
              <ConfigCard key={label} label={label} value={value} />
            ))}
          </div>
        </section>

        <section className="grid min-h-0 grid-cols-[30fr_45fr_25fr] border-b border-t border-zinc-700/70 bg-[#050607] shadow-[inset_0_10px_20px_rgba(0,0,0,0.4)]">
          <ViewerPanel title="PDF / Plan Viewer" subtitle="Sheet A2.11 / selected section line">
            <PdfViewer elevation={activeElevationData} />
          </ViewerPanel>

          <ViewerPanel title="Elevation View" subtitle="Primary scaffold drafting elevation">
            <ElevationView elevation={activeElevationData} />
          </ViewerPanel>

          <ViewerPanel title="Section Viewer" subtitle="Wall edge and scaffold section assembly">
            <SectionViewer elevation={activeElevationData} />
          </ViewerPanel>
        </section>

        <section className="grid min-h-0 grid-cols-[70fr_30fr] border-t border-orange-500/20 bg-[#090806] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <LibraryPanel activePart={activePart} setActivePart={setActivePart} />
          <DrawingTools activeTool={activeTool} setActiveTool={setActiveTool} />
        </section>
      </section>
    </main>
  );
}

type ViewerPoint = { x: number; y: number };

function isFinitePoint(point: ViewerPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getPrimaryGeometryPoints(elevation: ProjectElevation | null) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry) return [];

  const keyFullOverlay = geometry.fullOverlayRows.find((row) => row.isKeyFloor && row.points.length >= 3);
  const firstFullOverlay = geometry.fullOverlayRows.find((row) => row.points.length >= 3);
  const firstWallSegment = geometry.wallSegments.find((segment) => segment.length >= 3);

  if (geometry.tracedPerimeter.length >= 3) return geometry.tracedPerimeter;
  if (geometry.overlayPoints.length >= 3) return geometry.overlayPoints;
  if (keyFullOverlay) return keyFullOverlay.points;
  if (firstFullOverlay) return firstFullOverlay.points;
  if (geometry.elevationPoints.length >= 3) return geometry.elevationPoints;
  if (firstWallSegment) return firstWallSegment;
  return [];
}

function mapGeometryPoints(points: ViewerPoint[], width: number, height: number, padding: number) {
  const validPoints = points.filter(isFinitePoint);
  if (validPoints.length < 2) return [];

  const minX = Math.min(...validPoints.map((point) => point.x));
  const maxX = Math.max(...validPoints.map((point) => point.x));
  const minY = Math.min(...validPoints.map((point) => point.y));
  const maxY = Math.max(...validPoints.map((point) => point.y));
  const geometryWidth = Math.max(1, maxX - minX);
  const geometryHeight = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / geometryWidth, (height - padding * 2) / geometryHeight);
  const drawnWidth = geometryWidth * scale;
  const drawnHeight = geometryHeight * scale;
  const offsetX = padding + (width - padding * 2 - drawnWidth) / 2;
  const offsetY = padding + (height - padding * 2 - drawnHeight) / 2;

  return validPoints.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  }));
}

function pointsToSvgPath(points: ViewerPoint[], closed: boolean) {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return `M${first.x} ${first.y} ${rest.map((point) => `L${point.x} ${point.y}`).join(" ")}${closed && points.length >= 3 ? " Z" : ""}`;
}

function getScaledOverlayRows(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  const basePoints = getPrimaryGeometryPoints(elevation);
  if (!geometry || basePoints.length < 2) return [];

  const fullRows = geometry.fullOverlayRows.filter((row) => row.points.length >= 2);
  const rows = fullRows.length
    ? fullRows
    : [
        {
          id: 0,
          isKeyFloor: true,
          level: geometry.levelName,
          points: basePoints,
          closed: basePoints.length >= 3,
          color: "#2563eb",
        },
      ];
  const allPoints = rows.flatMap((row) => row.points);

  return rows.map((row, index) => ({
    id: row.id ?? index,
    level: row.level,
    isKeyFloor: Boolean(row.isKeyFloor),
    closed: Boolean(row.closed),
    color: row.color || (index === 0 ? "#2563eb" : "#22c55e"),
    points: mapGeometryPoints(row.points.length >= 2 ? row.points : allPoints, width, height, padding),
  })).filter((row) => row.points.length >= 2);
}

function getScaledReferencePoints(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry || geometry.referencePoints.length < 1) return [];

  const basePoints = getPrimaryGeometryPoints(elevation);
  const allPoints = [...basePoints, ...geometry.referencePoints];
  const mappedAllPoints = mapGeometryPoints(allPoints, width, height, padding);
  return mappedAllPoints.slice(basePoints.length);
}

function PdfViewer({ elevation }: { elevation: ProjectElevation | null }) {
  const storedRows = getScaledOverlayRows(elevation, 620, 470, 78);
  const referencePoints = getScaledReferencePoints(elevation, 620, 470, 78);
  const primaryRow = storedRows.find((row) => row.isKeyFloor) ?? storedRows[0];
  const cutStart = primaryRow?.points[0];
  const cutEnd = primaryRow?.points[Math.max(1, Math.floor(primaryRow.points.length / 2))];

  return (
    <div className="relative h-full overflow-hidden border border-zinc-700/80 bg-[#050505] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_14px_28px_rgba(0,0,0,0.5)]">
      <Grid size={28} opacity="0.09" />
      <div className="absolute inset-x-0 top-0 z-20 flex h-9 items-center justify-between border-b border-zinc-700/80 bg-[#080808]/95 px-2 shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1">
          {["Change PDF", "100%", "Pan", "Fit", "Rotate"].map((label) => (
            <button key={label} className="border border-zinc-700/70 bg-[#050505] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              {label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-zinc-600">A2.11 / Level 02</span>
      </div>

      <svg viewBox="0 0 620 470" className="relative z-10 h-full w-full pt-9">
        <rect x="58" y="64" width="500" height="350" fill="#090909" stroke="#27272a" strokeWidth="1" />
        {storedRows.length ? (
          <>
            {storedRows.map((row, index) => (
              <path
                key={`${row.id}-${index}`}
                d={pointsToSvgPath(row.points, row.closed)}
                fill="transparent"
                stroke={row.isKeyFloor ? "#2563eb" : row.color}
                strokeWidth={row.isKeyFloor ? "1" : "0.8"}
                opacity={row.isKeyFloor ? 1 : 0.9}
              />
            ))}
            {referencePoints.map((point, index) => (
              <g key={`section-reference-${index}`}>
                <line x1={point.x - 5} y1={point.y} x2={point.x + 5} y2={point.y} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
                <line x1={point.x} y1={point.y - 5} x2={point.x} y2={point.y + 5} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
              </g>
            ))}
            {cutStart && cutEnd && (
              <>
                <line x1={cutStart.x} y1={cutStart.y - 18} x2={cutEnd.x} y2={cutEnd.y - 18} stroke="#f8fafc" strokeWidth="0.8" opacity="0.65" />
                <text x={cutStart.x + 8} y={cutStart.y - 29} fill="#f97316" fontSize="10" fontFamily="monospace" fontWeight="700">A-A</text>
                <line x1={cutStart.x + 8} y1={cutStart.y - 30} x2={cutStart.x + 8} y2={cutStart.y} stroke="#f97316" strokeWidth="0.8" />
                <line x1={cutEnd.x} y1={cutEnd.y - 30} x2={cutEnd.x} y2={cutEnd.y} stroke="#f97316" strokeWidth="0.8" />
                <path d={`M${(cutStart.x + cutEnd.x) / 2} ${(cutStart.y + cutEnd.y) / 2 - 18} L${(cutStart.x + cutEnd.x) / 2} 62 L${Math.min(568, (cutStart.x + cutEnd.x) / 2 + 68)} 62`} stroke="#f97316" strokeWidth="0.8" fill="none" />
                <text x={Math.min(576, (cutStart.x + cutEnd.x) / 2 + 76)} y="66" fill="#fb923c" fontSize="10" fontFamily="monospace">Selected section line A-A</text>
              </>
            )}
          </>
        ) : (
          <>
            <path
              d="M130 116 L456 116 L456 184 L502 184 L502 322 L414 322 L414 374 L176 374 L176 278 L110 278 L110 196 L130 196 Z"
              fill="transparent"
              stroke="#2563eb"
              strokeWidth="1"
            />
            <path
              d="M154 144 L426 144 L426 206 L470 206 L470 298 L390 298 L390 344 L204 344 L204 254 L142 254 L142 214 L154 214 Z"
              fill="transparent"
              stroke="#22c55e"
              strokeWidth="0.8"
              opacity="0.9"
            />
            <line x1="142" y1="104" x2="468" y2="104" stroke="#f8fafc" strokeWidth="0.8" opacity="0.65" />
            <text x="150" y="93" fill="#f97316" fontSize="10" fontFamily="monospace" fontWeight="700">A-A</text>
            <line x1="150" y1="92" x2="150" y2="116" stroke="#f97316" strokeWidth="0.8" />
            <line x1="468" y1="92" x2="468" y2="116" stroke="#f97316" strokeWidth="0.8" />
            <path d="M300 104 L300 62 L368 62" stroke="#f97316" strokeWidth="0.8" fill="none" />
            <text x="376" y="66" fill="#fb923c" fontSize="10" fontFamily="monospace">Selected section line A-A</text>
          </>
        )}
      </svg>

      <div className="absolute bottom-3 right-3 z-20 h-24 w-36 border border-zinc-700 bg-black/90 p-1 shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
        <svg viewBox="0 0 140 90" className="h-full w-full">
          {storedRows.length ? (
            storedRows.map((row, index) => (
              <path key={`mini-${row.id}-${index}`} d={pointsToSvgPath(mapGeometryPoints(row.points, 140, 90, 12), row.closed)} fill="none" stroke={row.isKeyFloor ? "#2563eb" : row.color} strokeWidth="0.8" />
            ))
          ) : (
            <path d="M28 20 L105 20 L105 38 L120 38 L120 68 L90 68 L90 78 L35 78 L35 58 L20 58 L20 38 L28 38 Z" fill="none" stroke="#2563eb" strokeWidth="0.8" />
          )}
          <rect x="44" y="14" width="56" height="18" fill="none" stroke="#f97316" strokeWidth="0.8" />
        </svg>
      </div>
    </div>
  );
}

function ElevationView({ elevation }: { elevation: ProjectElevation | null }) {
  const bays = [102, 222, 342, 462, 582];
  const levels = [396, 332, 268, 204, 140, 76];

  return (
    <div className="relative h-full overflow-hidden border border-zinc-700/80 bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_14px_32px_rgba(0,0,0,0.55),0_0_28px_rgba(249,115,22,0.04)]">
      <Grid size={26} opacity="0.08" />
      <svg viewBox="0 24 740 430" className="relative z-10 h-full w-full">
        <text x="28" y="28" fill="#f97316" fontSize="11" fontFamily="monospace" fontWeight="700" letterSpacing="2">
          ELEVATION VIEW - {elevation?.elevationName.toUpperCase() ?? "NORTH"} RUN
        </text>
        <line x1="58" y1="410" x2="704" y2="410" stroke="#71717a" strokeWidth="1" />
        <text x="60" y="430" fill="#71717a" fontSize="10" fontFamily="monospace">FINISH GRADE</text>

        {levels.map((y, index) => (
          <g key={y}>
            <line x1="88" y1={y} x2="690" y2={y} stroke="#27272a" strokeWidth="0.8" />
            <text x="32" y={y + 3} fill="#52525b" fontSize="9" fontFamily="monospace">{index * 6}'-4"</text>
          </g>
        ))}

        {bays.map((x) => (
          <g key={x}>
            <line x1={x} y1="76" x2={x} y2="410" stroke="#e5e7eb" strokeWidth="1.15" />
            <line x1={x + 72} y1="76" x2={x + 72} y2="410" stroke="#e5e7eb" strokeWidth="1.15" />
            <line x1={x} y1="102" x2={x + 72} y2="166" stroke="#a1a1aa" strokeWidth="0.82" />
            <line x1={x + 72} y1="180" x2={x} y2="244" stroke="#a1a1aa" strokeWidth="0.82" />
            <line x1={x} y1="258" x2={x + 72} y2="322" stroke="#a1a1aa" strokeWidth="0.82" />
            <line x1={x + 72} y1="336" x2={x} y2="400" stroke="#a1a1aa" strokeWidth="0.82" />
            <text x={x + 36} y="450" fill="#71717a" fontSize="9" textAnchor="middle" fontFamily="monospace">
              {elevation?.scaffoldInput.standardBayLength ?? 10}'-0"
            </text>
          </g>
        ))}

        {[132, 204, 268, 332].map((y, index) => (
          <g key={y}>
            <line x1="92" y1={y} x2="704" y2={y} stroke={index === 1 ? "#f97316" : "#f8fafc"} strokeWidth={index === 1 ? "2" : "1.3"} opacity={index === 1 ? "0.92" : "0.7"} />
            <text x="706" y={y + 4} fill={index === 1 ? "#fb923c" : "#a1a1aa"} fontSize="9" fontFamily="monospace">
              {index === 1 ? "WORKING DECK" : "PLANK DECK"}
            </text>
          </g>
        ))}

        <Dimension x1={94} y1={76} x2={94} y2={410} label={`44'-4"`} />
        <CalloutLine x1={208} y1={410} x2={86} y2={386} label="Base plate / screw jack" />
        <CalloutLine x1={610} y1={204} x2={704} y2={168} label="Cross brace typ." />
        <CalloutLine x1={524} y1={132} x2={642} y2={92} label="Top rail / guardrail" />
      </svg>
    </div>
  );
}

function SectionViewer({ elevation }: { elevation: ProjectElevation | null }) {
  const wallOffset = elevation?.sectionView.wallOffset ?? elevation?.scaffoldInput.wallOffset ?? 1;
  const selectedRun = elevation?.sectionView.selectedRun ?? "Run N-01";

  return (
    <div className="relative h-full overflow-hidden border border-zinc-700/80 bg-[#050505] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_14px_28px_rgba(0,0,0,0.5)]">
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {["Upload PDF", "Find Section View", "Outline Wall Edge", "Auto Populate Scaffold"].map((label, index) => (
          <button
            key={label}
            className={`border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
              index === 3 ? "border-orange-500/45 bg-[#120904] text-orange-300" : "border-zinc-700/70 bg-[#080808] text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative h-[calc(100%-56px)] overflow-hidden border border-zinc-700/80 bg-black shadow-[inset_0_0_18px_rgba(255,255,255,0.018)]">
        <Grid size={24} opacity="0.08" />
        <svg viewBox="18 14 332 420" className="relative z-10 h-full w-full">
          <line x1="82" y1="34" x2="82" y2="410" stroke="#2563eb" strokeWidth="1" />
          <text x="40" y="28" fill="#60a5fa" fontSize="9" fontFamily="monospace">WALL EDGE</text>
          <line x1="118" y1="34" x2="118" y2="410" stroke="#f97316" strokeWidth="0.8" strokeDasharray="5 4" />
          <text x="128" y="48" fill="#fb923c" fontSize="9" fontFamily="monospace">{wallOffset}'-0" OFFSET</text>

          <line x1="154" y1="62" x2="154" y2="410" stroke="#f8fafc" strokeWidth="1.2" />
          <line x1="242" y1="62" x2="242" y2="410" stroke="#f8fafc" strokeWidth="1.2" />
          <line x1="154" y1="92" x2="242" y2="150" stroke="#a1a1aa" strokeWidth="0.8" />
          <line x1="242" y1="170" x2="154" y2="228" stroke="#a1a1aa" strokeWidth="0.8" />
          <line x1="154" y1="248" x2="242" y2="306" stroke="#a1a1aa" strokeWidth="0.8" />
          <line x1="242" y1="326" x2="154" y2="384" stroke="#a1a1aa" strokeWidth="0.8" />

          {[128, 232, 336].map((y) => (
            <line key={y} x1="136" y1={y} x2="260" y2={y} stroke="#f8fafc" strokeWidth="2" opacity="0.85" />
          ))}

          <line x1="132" y1="410" x2="264" y2="410" stroke="#71717a" strokeWidth="1" />
          <rect x="142" y="410" width="24" height="6" fill="#e5e7eb" />
          <rect x="230" y="410" width="24" height="6" fill="#e5e7eb" />
          <text x="140" y="28" fill="#a1a1aa" fontSize="9" fontFamily="monospace">{selectedRun}</text>
          <CalloutLine x1={260} y1={128} x2={334} y2={102} label="Work deck" />
          <CalloutLine x1={154} y1={410} x2={48} y2={372} label="Base / jack" />
          <CalloutLine x1={242} y1={170} x2={334} y2={188} label="Brace bay" />
        </svg>
      </div>
    </div>
  );
}

function LibraryPanel({
  activePart,
  setActivePart,
}: {
  activePart: string;
  setActivePart: (part: string) => void;
}) {
  return (
    <section className="min-h-0 border-r border-zinc-700/80 bg-[#080806] p-3 shadow-[inset_-1px_0_0_rgba(255,255,255,0.025)]">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-orange-400">Drafting Parts Library</h2>
      <div className="grid h-[calc(100%-28px)] grid-cols-9 gap-2">
        {primaryParts.map((item) => (
          <button
            key={item}
            onClick={() => setActivePart(item)}
            className={`border p-2 text-left transition ${
              activePart === item
                ? "border-orange-500/40 bg-[#100804]"
                : "border-zinc-800 bg-[#090909] hover:border-zinc-600"
            }`}
          >
            <p className="mb-1.5 truncate font-mono text-[10px] uppercase tracking-[0.04em] text-zinc-500">{item}</p>
            <PartSymbol name={item} />
          </button>
        ))}
      </div>
    </section>
  );
}

function DrawingTools({
  activeTool,
  setActiveTool,
}: {
  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;
}) {
  return (
    <section className="min-h-0 bg-[#070707] p-3 shadow-[inset_1px_0_0_rgba(255,255,255,0.025)]">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-orange-400">Drawing Tools</h2>
      <div className="grid grid-cols-4 gap-2">
        {tools.map((tool) => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            className={`flex h-[56px] flex-col items-center justify-center gap-1 border text-center text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
              activeTool === tool
                ? "border-orange-500/45 bg-[#120904] text-orange-300"
                : "border-zinc-800 bg-[#050505] text-zinc-500 hover:border-zinc-600"
            }`}
          >
            <ToolIcon name={tool} />
            <span>{tool}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectDebugStrip({ projectName, elevation }: { projectName: string; elevation: ProjectElevation | null }) {
  const quantity = elevation?.quantityEngine;
  const overlayExists = hasTakeoffOverlayGeometry(elevation);

  return (
    <div className="border-b border-orange-500/20 bg-black px-5 py-2 font-mono text-[11px] text-zinc-400">
      Project ID: <span className="text-orange-300">{getActiveProjectId()}</span> | Active Project:{" "}
      <span className="text-orange-300">{projectName}</span> | Level:{" "}
      <span className="text-orange-300">{elevation?.levelName ?? "Main Level"}</span> | Elevation:{" "}
      <span className="text-orange-300">{elevation?.elevationName ?? "None"}</span> | LF:{" "}
      <span className="text-orange-300">{elevation?.linearFeet ?? "--"}</span> | Height:{" "}
      <span className="text-orange-300">{elevation?.wallHeight ?? "--"}</span> | Bays:{" "}
      <span className="text-orange-300">{quantity?.bayCount ?? "--"}</span> | Legs:{" "}
      <span className="text-orange-300">{quantity?.legCount ?? "--"}</span> | Frames:{" "}
      <span className="text-orange-300">{quantity?.frameCount ?? "--"}</span> | overlayGeometry exists ={" "}
      <span className="text-orange-300">{String(overlayExists)}</span>
    </div>
  );
}

function ConfigCard({ label, value }: { label: string; value: string }) {
  const isDominant = label === "Frame Heights / Frame Makeup";

  return (
    <div className="bg-[#0a0a0a] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <p className={`mt-1 truncate font-mono font-semibold ${isDominant ? "text-sm text-orange-200" : "text-xs text-zinc-200"}`}>
        {value}
      </p>
    </div>
  );
}

function ViewerPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="min-h-0 border-r border-zinc-700/80 bg-[#060707] p-3 last:border-r-0">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{subtitle}</p>
        </div>
        <span className="h-1.5 w-1.5 bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
      </div>
      <div className="h-[calc(100%-38px)] min-h-0 border border-zinc-900/80 bg-[#030303] p-1 shadow-[inset_0_0_18px_rgba(0,0,0,0.45)]">{children}</div>
    </section>
  );
}

function Grid({ size = 32, opacity = "0.08" }: { size?: number; opacity?: string }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        opacity,
        backgroundImage:
          "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

function Dimension({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#71717a" strokeWidth="0.8" />
      <line x1={x1 - 5} y1={y1} x2={x1 + 5} y2={y1} stroke="#71717a" strokeWidth="0.8" />
      <line x1={x2 - 5} y1={y2} x2={x2 + 5} y2={y2} stroke="#71717a" strokeWidth="0.8" />
      <text x={x1 - 38} y={(y1 + y2) / 2} fill="#a1a1aa" fontSize="9" fontFamily="monospace" transform={`rotate(-90 ${x1 - 38} ${(y1 + y2) / 2})`}>
        {label}
      </text>
    </g>
  );
}

function CalloutLine({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label: string }) {
  return (
    <g>
      <circle cx={x1} cy={y1} r="2.5" fill="#f97316" />
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#f97316" strokeWidth="0.8" fill="none" />
      <rect x={x2 - 3} y={y2 - 12} width={label.length * 6 + 10} height="18" fill="#050505" stroke="#f97316" strokeWidth="0.7" />
      <text x={x2 + 3} y={y2} fill="#fed7aa" fontSize="9" fontFamily="monospace">{label}</text>
    </g>
  );
}

function PartSymbol({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 92 42" className="h-12 w-full border border-zinc-800 bg-black">
      {(name.includes("Frame")) && (
        <g stroke="#e5e7eb" strokeWidth="1" fill="none">
          <rect x="25" y="7" width="42" height="28" />
          <line x1="25" y1="20" x2="67" y2="20" />
        </g>
      )}
      {name === "Cross Brace" && <path d="M24 9 L68 33 M68 9 L24 33" stroke="#e5e7eb" strokeWidth="1" />}
      {name === "Horizontal Brace" && <line x1="20" y1="21" x2="72" y2="21" stroke="#e5e7eb" strokeWidth="1.2" />}
      {name === "Ledger" && <path d="M18 16 L74 16 M18 26 L74 26" stroke="#e5e7eb" strokeWidth="1" />}
      {name === "Plank / Deck" && <rect x="18" y="16" width="56" height="10" fill="#e5e7eb" opacity="0.8" />}
      {name === "Base Plate" && <rect x="30" y="26" width="32" height="6" fill="#e5e7eb" opacity="0.85" />}
      {name === "Screw Jack" && <path d="M46 8 L46 32 M36 16 L56 16 M34 32 L58 32" stroke="#e5e7eb" strokeWidth="1" />}
      {name === "Wall Tie" && <path d="M18 21 L48 21 L66 12 M48 21 L66 30" stroke="#e5e7eb" strokeWidth="1" fill="none" />}
      {name === "Ladder" && (
        <g stroke="#e5e7eb" strokeWidth="1" fill="none">
          <line x1="36" y1="8" x2="36" y2="34" />
          <line x1="56" y1="8" x2="56" y2="34" />
          {[13, 18, 23, 28].map((y) => <line key={y} x1="36" y1={y} x2="56" y2={y} />)}
        </g>
      )}
    </svg>
  );
}

function ToolIcon({ name }: { name: ToolName }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      {name === "Notes" && (
        <text x="12" y="16" fill="currentColor" stroke="none" textAnchor="middle" fontSize="14" fontFamily="monospace" fontWeight="700">
          A
        </text>
      )}
      {name === "Callouts" && <path d="M5 7 H19 V15 H11 L7 19 V15 H5 Z" />}
      {name === "Leaders" && <path d="M5 18 L18 6 M14 6 H18 V10" />}
      {name === "Highlight" && <path d="M6 17 L14 5 L18 8 L10 20 H6 Z M10 20 H19" />}
      {name === "Draw" && <path d="M5 18 L6 14 L15 5 L19 9 L10 18 Z M14 6 L18 10" />}
      {name === "Dimension" && <path d="M5 12 H19 M7 9 L5 12 L7 15 M17 9 L19 12 L17 15 M5 7 V17 M19 7 V17" />}
      {name === "Erase" && <path d="M6 16 L14 8 L19 13 L13 19 H8 Z M10 12 L15 17" />}
      {name === "Select" && <path d="M6 4 L17 14 L12 15 L10 20 Z" />}
    </svg>
  );
}

function TopAction({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition ${
        primary
          ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_18px_rgba(249,115,22,0.18)] hover:bg-orange-400"
          : "border-zinc-700/80 bg-[#080808] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-orange-500/40 hover:text-orange-300"
      }`}
    >
      {label}
    </a>
  );
}
