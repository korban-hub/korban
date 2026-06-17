"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateQuantityEngine,
  getActiveElevation,
  getActiveProject,
  getActiveProjectId,
  hasTakeoffOverlayGeometry,
  saveActiveElevation,
  type ProjectElevation,
  type ScaffoldInput,
} from "@/lib/projectStore";

type ScaffoldWidth = "3'" | "3'-6\"" | "5'";
type PlankType = "Wood" | "Aluminum" | "Steel";
type PieceType =
  | "Straight Bay"
  | "Short Bay"
  | "Turnaround Bay"
  | "Inside Corner"
  | "Outside Corner"
  | "End Bay";

const projectInfo = {
  projectName: "Mare Island Apartments",
  jobNumber: "KRB-260614-001",
  reference: "Main Level Reference Point A-1",
};

type PlanPoint = { x: number; y: number };

const currentLevelOutline: PlanPoint[] = [
  { x: 250, y: 150 },
  { x: 835, y: 150 },
  { x: 835, y: 230 },
  { x: 770, y: 230 },
  { x: 770, y: 300 },
  { x: 910, y: 300 },
  { x: 910, y: 505 },
  { x: 805, y: 505 },
  { x: 805, y: 575 },
  { x: 350, y: 575 },
  { x: 350, y: 520 },
  { x: 215, y: 520 },
  { x: 215, y: 345 },
  { x: 165, y: 345 },
  { x: 165, y: 230 },
  { x: 250, y: 230 },
];

const scaffoldPieces: { type: PieceType; description: string; count: number }[] = [
  { type: "Straight Bay", description: "Standard bay with brace centered between legs.", count: 42 },
  { type: "Short Bay", description: "Under 8' connection shown with dots only.", count: 3 },
  { type: "Turnaround Bay", description: "Squared return bay with no diagonal brace.", count: 2 },
  { type: "Inside Corner", description: "Square inside corner with double-leg condition.", count: 2 },
  { type: "Outside Corner", description: "Square outside corner with double-leg condition.", count: 6 },
  { type: "End Bay", description: "Open end / termination bay.", count: 0 },
];

const runSummary = [
  { label: "North Run", lf: "180'-0\"", bays: 18, legs: 19 },
  { label: "East Return", lf: "68'-0\"", bays: 7, legs: 8 },
  { label: "South Run", lf: "162'-0\"", bays: 17, legs: 18 },
  { label: "West Run", lf: "72'-0\"", bays: 8, legs: 9 },
];

function parseFeetValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScaffoldWidth(value: number): ScaffoldWidth {
  if (value >= 5) return "5'";
  if (value >= 3.5) return "3'-6\"";
  return "3'";
}

export default function SetScaffoldPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scaffoldWidth, setScaffoldWidth] = useState<ScaffoldWidth>("3'");
  const [plankType, setPlankType] = useState<PlankType>("Wood");
  const [standardBayLength, setStandardBayLength] = useState("10'");
  const [turnaroundBays, setTurnaroundBays] = useState(true);
  const [activePiece, setActivePiece] = useState<PieceType>("Straight Bay");
  const [showOverlay, setShowOverlay] = useState(true);
  const [showScaffold, setShowScaffold] = useState(true);
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState(projectInfo.projectName);

  const frameHeightCount = activeElevationData?.quantityEngine.frameTall ?? 7;
  const scaffoldOffset = 12;
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

  useEffect(() => {
    function loadActiveElevation() {
      const elevation = getActiveElevation();
      const project = getActiveProject();
      console.log("SET SCAFFOLD LOADED LF:", elevation.linearFeet);
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

  const plankCountPerBay = useMemo(() => {
    if (scaffoldWidth === "5'") return 3;
    return 2;
  }, [scaffoldWidth]);

  const totals = useMemo(() => {
    if (activeElevationData) {
      return {
        bays: activeElevationData.quantityEngine.bayCount,
        legs: activeElevationData.quantityEngine.legCount,
        frames: activeElevationData.quantityEngine.frameCount,
        planks: activeElevationData.quantityEngine.plankCount,
        braces: activeElevationData.quantityEngine.crossBraceCount,
      };
    }

    const bays = runSummary.reduce((sum, item) => sum + item.bays, 0);
    const legs = runSummary.reduce((sum, item) => sum + item.legs, 0);
    const frames = legs * frameHeightCount;
    const planks = bays * plankCountPerBay * frameHeightCount;
    const braces = bays - 5;

    return { bays, legs, frames, planks, braces };
  }, [activeElevationData, frameHeightCount, plankCountPerBay]);

  function saveScaffoldInput(updates: Partial<ScaffoldInput>) {
    const current = activeElevationData ?? getActiveElevation();
    const scaffoldInput = {
      ...current.scaffoldInput,
      ...updates,
    };
    const quantityEngine = calculateQuantityEngine({
      linearFeet: current.linearFeet,
      wallHeight: current.wallHeight,
      ...scaffoldInput,
    });
    const nextElevation = {
      ...current,
      scaffoldInput,
      quantityEngine,
      sectionView: {
        ...current.sectionView,
        wallOffset: scaffoldInput.wallOffset,
      },
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
    <main className="min-h-screen bg-[#070604] text-white">
      <header className="border-b border-orange-500/20 bg-black px-6 py-4">
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
              >
                ▾
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-12 z-[999] w-60 rounded-2xl border border-orange-500/20 bg-black p-2 shadow-2xl">
                  <MenuLink href="/project-plan-desk" label="Project Plan Desk" />
                  <MenuLink href="/takeoff-workspace" label="Takeoff Workspace" />
                  <MenuLink href="/estimate-review" label="Estimate Review" />
                  <MenuLink href="/backend" label="Backend" />
                  <MenuLink href="/settings" label="Settings" />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.5em] text-orange-500">KORBAN</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Set Scaffold</h1>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-600">
                Combined overlay to scaffold bay layout
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-4 xl:flex">
            <HeaderMeta label="Project" value={activeProjectName} />
            <HeaderMeta label="Job No." value={projectInfo.jobNumber} />
            <HeaderMeta label="Reference" value={projectInfo.reference} />
            <TopAction href="/project-plan-desk" label="Project Plan Desk" />
            <TopAction href="/estimate-review" label="Save & Continue" primary />
          </div>
        </div>
      </header>

      <ProjectDebugStrip projectName={activeProjectName} elevation={activeElevationData} />

      <section className="grid h-[calc(100vh-125px)] grid-cols-[minmax(0,1fr)_400px]">
        <section className="relative overflow-hidden border-r border-orange-500/20 bg-black">
          <div className="absolute left-6 top-5 z-20 flex items-center gap-3">
            <StatusPill label="Overlay" active={showOverlay} onClick={() => setShowOverlay((current) => !current)} />
            <StatusPill label="Scaffold" active={showScaffold} onClick={() => setShowScaffold((current) => !current)} />
            <StatusPill label="Grid" value="5' increments" />
            <StatusPill label="Frame Tall" value={String(frameHeightCount)} />
          </div>

          <div className="absolute right-6 top-5 z-20 rounded-2xl border border-orange-500/20 bg-black/80 px-4 py-3 backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Active Piece</p>
            <p className="mt-1 font-mono text-sm font-bold text-orange-300">{activePiece}</p>
          </div>

          <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:36px_36px]" />

          <div className="absolute inset-0 flex items-center justify-center p-10">
            <div className="relative h-full w-full max-w-[1220px] rounded-[2rem] border border-zinc-800 bg-[#050505] shadow-2xl">
              <svg viewBox="0 0 1200 720" className="h-full w-full">
                <GridAxisLabels />

                <g>
                  <text x="72" y="98" fill="#a1a1aa" fontSize="11" fontWeight="700">
                    PROJECT OVERLAY
                  </text>
                  <line x1="72" y1="120" x2="112" y2="120" stroke="#2563eb" strokeWidth="2" />
                  <text x="124" y="124" fill="#a1a1aa" fontSize="10">CURRENT LEVEL</text>
                  <line x1="72" y1="142" x2="112" y2="142" stroke="#22c55e" strokeWidth="2" />
                  <text x="124" y="146" fill="#a1a1aa" fontSize="10">LEVEL BELOW</text>
                </g>

                {showOverlay && (
                  storedOverlayRows.length ? (
                    <StoredTakeoffOverlay rows={storedOverlayRows} referencePoints={storedReferencePoints} />
                  ) : (
                    <g>
                      <path
                        d="M250 150 L835 150 L835 230 L770 230 L770 300 L910 300 L910 505 L805 505 L805 575 L350 575 L350 520 L215 520 L215 345 L165 345 L165 230 L250 230 Z"
                        fill="transparent"
                        stroke="#2563eb"
                        strokeWidth="0.7"
                        strokeLinejoin="miter"
                      />

                      <path
                        d="M280 180 L790 180 L790 250 L735 250 L735 322 L872 322 L872 475 L775 475 L775 540 L385 540 L385 490 L250 490 L250 318 L198 318 L198 258 L280 258 Z"
                        fill="transparent"
                        stroke="#22c55e"
                        strokeWidth="0.6"
                        strokeLinejoin="miter"
                        opacity="0.9"
                      />
                    </g>
                  )
                )}

                {showScaffold && (
                  <g className="scaffold-plan">
                    <OffsetScaffoldTicks points={scaffoldOutline} offset={scaffoldOffset} frameTall={frameHeightCount} />
                  </g>
                )}
              </svg>

              <div className="absolute left-5 top-5 rounded-2xl border border-zinc-800 bg-black/85 px-4 py-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Project</p>
                <p className="mt-1 text-sm font-bold text-zinc-200">{projectInfo.projectName}</p>
                <p className="mt-1 font-mono text-[11px] text-orange-300">
                  {projectInfo.jobNumber} · {projectInfo.reference}
                </p>
              </div>

              <div className="absolute bottom-5 left-5 rounded-2xl border border-zinc-800 bg-black/80 p-4 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Generated Scaffold Layout</p>
                <p className="mt-1 font-mono text-lg font-black text-orange-300">
                  {totals.bays} Bays · {totals.legs} Legs
                </p>
              </div>

              <div className="absolute bottom-5 right-5 flex gap-2">
                <ViewerTool label="Regenerate" />
                <ViewerTool label="Edit Bay" />
                <ViewerTool label="Save Layout" primary />
              </div>
            </div>
          </div>
        </section>

        <aside className="overflow-y-auto bg-[#080604] p-4">
          <Panel title="Backend Takeoff Info" subtitle="Current scaffold defaults">
            <ControlLabel label="Frame Width">
              <select value={scaffoldWidth} onChange={(event) => updateScaffoldWidth(event.target.value as ScaffoldWidth)} className="control-input">
                <option>3'</option>
                <option>3'-6"</option>
                <option>5'</option>
              </select>
            </ControlLabel>

            <ControlLabel label="Plank Count / Width">
              <input className="control-input" readOnly value={plankCountPerBay} />
            </ControlLabel>

            <ControlLabel label="Plank Type">
              <select value={plankType} onChange={(event) => setPlankType(event.target.value as PlankType)} className="control-input">
                <option>Wood</option>
                <option>Aluminum</option>
                <option>Steel</option>
              </select>
            </ControlLabel>

            <ControlLabel label="Standard Bay Length">
              <input value={standardBayLength} onChange={(event) => updateStandardBayLength(event.target.value)} className="control-input" />
            </ControlLabel>

            <button
              onClick={() => setTurnaroundBays((current) => !current)}
              className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                turnaroundBays ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-black text-zinc-500"
              }`}
            >
              <span className="text-xs font-bold">Turnaround Bays</span>
              <span className="font-mono text-xs font-bold">{turnaroundBays ? "ON" : "OFF"}</span>
            </button>

            <ControlLabel label="Frame Height Count">
              <input className="control-input" readOnly value={frameHeightCount} />
            </ControlLabel>
          </Panel>

          <Panel title="Pre-Drawn Scaffold Pieces" subtitle="CAD-style scaffold symbols">
            <div className="grid grid-cols-2 gap-2">
              {scaffoldPieces.map((piece) => (
                <button
                  key={piece.type}
                  onClick={() => setActivePiece(piece.type)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    activePiece === piece.type ? "border-orange-500/50 bg-orange-500/10" : "border-zinc-800 bg-black hover:border-orange-500/30"
                  }`}
                >
                  <p className="text-[11px] font-bold text-zinc-200">{piece.type}</p>
                  <div className="mt-2 flex h-14 items-center justify-center rounded-xl border border-zinc-900 bg-zinc-950">
                    <PieceIcon type={piece.type} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-orange-300">{piece.count} used</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Scaffold Quantities" subtitle="Generated from scaffold layout">
            <div className="space-y-2">
              <QuantityRow label="Total Linear Ft" value={`${(activeElevationData?.linearFeet ?? 482).toLocaleString()} LF`} />
              <QuantityRow label="Standard Bays" value={totals.bays.toLocaleString()} />
              <QuantityRow label="Total Legs" value={totals.legs.toLocaleString()} />
              <QuantityRow label="Frames Tall" value={String(frameHeightCount)} />
              <QuantityRow label="Total Frames" value={totals.frames.toLocaleString()} />
              <QuantityRow label="Cross Braces" value={totals.braces.toLocaleString()} />
              <QuantityRow label="Plank Type" value={plankType} />
              <QuantityRow label="Total Planks" value={totals.planks.toLocaleString()} />
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
                runSummary.map((run) => (
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
              <a href="/estimate-review" className="next-link-primary">Save & Continue</a>
            </div>
          </Panel>
        </aside>
      </section>

      <style jsx global>{`
        .control-input {
          width: 100%;
          border-radius: 0.9rem;
          border: 1px solid rgb(39 39 42);
          background: #000;
          padding: 0.75rem 0.9rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.8rem;
          font-weight: 800;
          color: rgb(253 186 116);
          outline: none;
        }

        .control-input:focus {
          border-color: rgba(249, 115, 22, 0.55);
        }

        .next-link,
        .next-link-primary {
          display: block;
          border-radius: 0.9rem;
          padding: 0.9rem 1rem;
          text-align: center;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .next-link {
          border: 1px solid rgb(39 39 42);
          background: #000;
          color: rgb(212 212 216);
        }

        .next-link-primary {
          background: rgb(249 115 22);
          color: #000;
        }
      `}</style>
    </main>
  );
}

type RunOrientation = "horizontal" | "vertical";
type RunNormal = "up" | "down" | "left" | "right";

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function isFinitePoint(point: PlanPoint) {
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
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

function mapGeometryPoints(points: PlanPoint[], width: number, height: number, padding: number) {
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

function getScaledPrimaryOutline(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const points = getPrimaryGeometryPoints(elevation);
  const mapped = mapGeometryPoints(points, width, height, padding);
  return mapped.length >= 3 ? mapped : null;
}

function getScaledOverlayRows(elevation: ProjectElevation | null, width: number, height: number, padding: number) {
  const geometry = elevation?.overlayGeometry;
  const basePoints = getPrimaryGeometryPoints(elevation);
  if (!geometry || basePoints.length < 2) return [];

  const allRows = geometry.fullOverlayRows.filter((row) => row.points.length >= 2);
  const fallbackRows = allRows.length
    ? allRows
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

  const allPoints = fallbackRows.flatMap((row) => row.points);
  return fallbackRows.map((row, index) => ({
    id: row.id ?? index,
    level: row.level,
    isKeyFloor: Boolean(row.isKeyFloor),
    closed: Boolean(row.closed),
    color: row.color || (index === 0 ? "#2563eb" : "#22c55e"),
    points: mapGeometryPoints(allPoints.length >= 2 ? row.points : basePoints, width, height, padding),
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

function pointsToSvgPath(points: PlanPoint[], closed: boolean) {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return `M${first.x} ${first.y} ${rest.map((point) => `L${point.x} ${point.y}`).join(" ")}${closed && points.length >= 3 ? " Z" : ""}`;
}

function StoredTakeoffOverlay({
  rows,
  referencePoints,
}: {
  rows: Array<{ id: number; level: string; isKeyFloor: boolean; closed: boolean; color: string; points: PlanPoint[] }>;
  referencePoints: PlanPoint[];
}) {
  return (
    <g>
      {rows.map((row, index) => (
        <g key={`${row.id}-${index}`}>
          <path
            d={pointsToSvgPath(row.points, row.closed)}
            fill="transparent"
            stroke={row.isKeyFloor ? "#2563eb" : row.color}
            strokeWidth={row.isKeyFloor ? "0.9" : "0.6"}
            strokeLinejoin="miter"
            opacity={row.isKeyFloor ? 1 : 0.9}
          />
          {row.points.map((point, pointIndex) => (
            <circle key={`${row.id}-point-${pointIndex}`} cx={point.x} cy={point.y} r="2" fill={row.isKeyFloor ? "#60a5fa" : "#22c55e"} opacity="0.75" />
          ))}
        </g>
      ))}
      {referencePoints.map((point, index) => (
        <g key={`reference-point-${index}`}>
          <line x1={point.x - 5} y1={point.y} x2={point.x + 5} y2={point.y} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
          <line x1={point.x} y1={point.y - 5} x2={point.x} y2={point.y + 5} stroke="#f97316" strokeWidth="0.7" opacity="0.8" />
        </g>
      ))}
    </g>
  );
}

function OffsetScaffoldTicks({
  points,
  offset,
  frameTall,
}: {
  points: PlanPoint[];
  offset: number;
  frameTall: number;
}) {
  const tickLength = 10;
  const labelOffset = 21;
  const targetSpacing = 46;
  const duplicateCornerTolerance = 2;

  const validPoints = points.filter(isFinitePoint);

  if (validPoints.length < 2 || !isFiniteNumber(offset) || !isFiniteNumber(frameTall)) return null;

  const closedSegments = validPoints.map((point, index) => ({
    start: point,
    end: validPoints[(index + 1) % validPoints.length],
  }));

  function renderScaffoldTick({
    key,
    tickCenter,
    labelPoint,
    outward,
  }: {
    key: string;
    tickCenter: PlanPoint;
    labelPoint: PlanPoint;
    outward: PlanPoint;
  }) {
    if (!isFinitePoint(tickCenter) || !isFinitePoint(labelPoint) || !isFinitePoint(outward)) return null;

    const tick = {
      x1: tickCenter.x - outward.x * (tickLength / 2),
      y1: tickCenter.y - outward.y * (tickLength / 2),
      x2: tickCenter.x + outward.x * (tickLength / 2),
      y2: tickCenter.y + outward.y * (tickLength / 2),
    };

    if (
      !isFiniteNumber(tick.x1) ||
      !isFiniteNumber(tick.y1) ||
      !isFiniteNumber(tick.x2) ||
      !isFiniteNumber(tick.y2)
    ) {
      return null;
    }

    return (
      <g key={key}>
        <line
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          strokeWidth="1"
        />
        <text
          x={labelPoint.x}
          y={labelPoint.y}
          fontSize="5"
          fontFamily="monospace"
          fontWeight="300"
          opacity="0.62"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {frameTall}
        </text>
      </g>
    );
  }

  return (
    <g fill="#f8fafc" stroke="#f8fafc" strokeLinecap="square" opacity="0.9">
      {closedSegments.map(({ start, end }, segmentIndex) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (!isFiniteNumber(length) || length <= 0) return null;

        const outward = { x: dy / length, y: -dx / length };
        if (!isFinitePoint(outward)) return null;

        const interiorTickCount = Math.max(0, Math.floor(length / targetSpacing) - 1);
        const distances = Array.from(
          { length: interiorTickCount },
          (_, tickIndex) => ((tickIndex + 1) * length) / (interiorTickCount + 1),
        );
        const tickData = [
          0,
          ...distances,
          length,
        ].map((distance) => {
          const t = distance / length;
          const facePoint = {
            x: start.x + dx * t,
            y: start.y + dy * t,
          };
          const tickCenter = {
            x: facePoint.x + outward.x * offset,
            y: facePoint.y + outward.y * offset,
          };
          const labelPoint = {
            x: facePoint.x + outward.x * labelOffset,
            y: facePoint.y + outward.y * labelOffset,
          };

          return {
            distance,
            tickCenter,
            labelPoint,
            segmentIndex,
          };
        }).filter(({ distance, tickCenter, labelPoint, segmentIndex }) =>
          isFiniteNumber(distance) &&
          isFinitePoint(tickCenter) &&
          isFinitePoint(labelPoint) &&
          Number.isInteger(segmentIndex),
        );
        if (!tickData.length) return null;

        return (
          <g key={`scaffold-segment-${segmentIndex}`}>
            {tickData.map(({ distance, tickCenter, labelPoint }, tickIndex) => {
              const isDuplicateRegularEndpointTick =
                distance <= duplicateCornerTolerance ||
                length - distance <= duplicateCornerTolerance;

              if (isDuplicateRegularEndpointTick) return null;

              return renderScaffoldTick({
                key: `scaffold-tick-${segmentIndex}-${tickIndex}`,
                tickCenter,
                labelPoint,
                outward,
              });
            })}

            {tickData.slice(0, -1).map((current, tickIndex) => {
                const next = tickData[tickIndex + 1];
                if (
                  current.segmentIndex !== next.segmentIndex
                ) {
                  return null;
                }

                const center = {
                  x: (current.tickCenter.x + next.tickCenter.x) / 2,
                  y: (current.tickCenter.y + next.tickCenter.y) / 2,
                };
                const along = { x: dx / length, y: dy / length };
                const braceLength = Math.min(14, Math.max(6, (next.distance - current.distance) * 0.34));
                const braceDepth = 3;
                const brace = {
                  x1: center.x - along.x * (braceLength / 2) - outward.x * braceDepth,
                  y1: center.y - along.y * (braceLength / 2) - outward.y * braceDepth,
                  x2: center.x + along.x * (braceLength / 2) + outward.x * braceDepth,
                  y2: center.y + along.y * (braceLength / 2) + outward.y * braceDepth,
                };

                if (
                  !isFinitePoint(center) ||
                  !isFinitePoint(along) ||
                  !isFiniteNumber(braceLength) ||
                  !isFiniteNumber(brace.x1) ||
                  !isFiniteNumber(brace.y1) ||
                  !isFiniteNumber(brace.x2) ||
                  !isFiniteNumber(brace.y2)
                ) {
                  return null;
                }

                return (
                  <line
                    key={`brace-${segmentIndex}-${tickIndex}`}
                    x1={brace.x1}
                    y1={brace.y1}
                    x2={brace.x2}
                    y2={brace.y2}
                    strokeWidth="0.4"
                    opacity="0.34"
                  />
                );
              })}
          </g>
        );
      })}

      {validPoints.map((cornerPoint, cornerIndex) => {
        const previousPoint = validPoints[(cornerIndex - 1 + validPoints.length) % validPoints.length];
        const nextPoint = validPoints[(cornerIndex + 1) % validPoints.length];
        const incoming = {
          dx: cornerPoint.x - previousPoint.x,
          dy: cornerPoint.y - previousPoint.y,
        };
        const outgoing = {
          dx: nextPoint.x - cornerPoint.x,
          dy: nextPoint.y - cornerPoint.y,
        };
        const incomingLength = Math.sqrt(incoming.dx * incoming.dx + incoming.dy * incoming.dy);
        const outgoingLength = Math.sqrt(outgoing.dx * outgoing.dx + outgoing.dy * outgoing.dy);

        if (
          !isFiniteNumber(incomingLength) ||
          !isFiniteNumber(outgoingLength) ||
          incomingLength <= 0 ||
          outgoingLength <= 0
        ) {
          return null;
        }

        const incomingOutward = {
          x: incoming.dy / incomingLength,
          y: -incoming.dx / incomingLength,
        };
        const outgoingOutward = {
          x: outgoing.dy / outgoingLength,
          y: -outgoing.dx / outgoingLength,
        };

        if (!isFinitePoint(incomingOutward) || !isFinitePoint(outgoingOutward)) return null;

        const boxedCornerTick = {
          x: cornerPoint.x + incomingOutward.x * offset + outgoingOutward.x * offset,
          y: cornerPoint.y + incomingOutward.y * offset + outgoingOutward.y * offset,
        };
        const boxedCornerLabel = {
          x: cornerPoint.x + incomingOutward.x * labelOffset + outgoingOutward.x * offset,
          y: cornerPoint.y + incomingOutward.y * labelOffset + outgoingOutward.y * offset,
        };

        return (
          <g key={`corner-scaffold-ticks-${cornerIndex}`}>
            {renderScaffoldTick({
              key: `corner-incoming-${cornerIndex}`,
              tickCenter: {
                x: cornerPoint.x + incomingOutward.x * offset,
                y: cornerPoint.y + incomingOutward.y * offset,
              },
              labelPoint: {
                x: cornerPoint.x + incomingOutward.x * labelOffset,
                y: cornerPoint.y + incomingOutward.y * labelOffset,
              },
              outward: incomingOutward,
            })}
            {renderScaffoldTick({
              key: `corner-outgoing-${cornerIndex}`,
              tickCenter: {
                x: cornerPoint.x + outgoingOutward.x * offset,
                y: cornerPoint.y + outgoingOutward.y * offset,
              },
              labelPoint: {
                x: cornerPoint.x + outgoingOutward.x * labelOffset,
                y: cornerPoint.y + outgoingOutward.y * labelOffset,
              },
              outward: outgoingOutward,
            })}
            {isFinitePoint(boxedCornerTick) &&
              isFinitePoint(boxedCornerLabel) &&
              renderScaffoldTick({
                key: `corner-boxed-leg-${cornerIndex}`,
                tickCenter: boxedCornerTick,
                labelPoint: boxedCornerLabel,
                outward: incomingOutward,
              })}
          </g>
        );
      })}

    </g>
  );
}

function StraightRun({
  x1,
  y1,
  x2,
  y2,
  bays,
  orientation,
  normal,
  frameTall,
  gap,
  short = false,
  omitStart = false,
  omitEnd = false,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bays: number;
  orientation: RunOrientation;
  normal: RunNormal;
  frameTall: number;
  gap: number;
  short?: boolean;
  omitStart?: boolean;
  omitEnd?: boolean;
}) {
  const outwardOffset =
    normal === "up"
      ? { x: 0, y: -gap }
      : normal === "down"
        ? { x: 0, y: gap }
        : normal === "left"
          ? { x: -gap, y: 0 }
          : { x: gap, y: 0 };
  const points = Array.from({ length: bays + 1 }, (_, index) => {
    const t = index / bays;
    return {
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t,
    };
  });

  const tick = 9;
  const labelPoint = points[Math.floor(points.length / 2)];

  function tickLine(point: { x: number; y: number }) {
    const scaffoldPoint = { x: point.x + outwardOffset.x, y: point.y + outwardOffset.y };

    if (orientation === "horizontal") {
      return { x1: scaffoldPoint.x, y1: scaffoldPoint.y - tick / 2, x2: scaffoldPoint.x, y2: scaffoldPoint.y + tick / 2 };
    }

    return { x1: scaffoldPoint.x - tick / 2, y1: scaffoldPoint.y, x2: scaffoldPoint.x + tick / 2, y2: scaffoldPoint.y };
  }

  return (
    <g stroke="#f8fafc" fill="none" strokeLinecap="square" strokeLinejoin="miter">
      {points.map((point, index) => {
        if ((index === 0 && omitStart) || (index === points.length - 1 && omitEnd)) return null;

        const legLine = tickLine(point);

        return (
          <g key={`leg-${x1}-${y1}-${index}`}>
            <line {...legLine} strokeWidth="1.1" opacity="0.82" />
          </g>
        );
      })}

      {!short && (
        <FrameHeightLabel
          x={labelPoint.x + outwardOffset.x}
          y={labelPoint.y + outwardOffset.y}
          normal={normal}
          value={frameTall}
        />
      )}

      {!short && points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        const inset = 12;
        const start = { x: point.x + outwardOffset.x, y: point.y + outwardOffset.y };
        const end = { x: next.x + outwardOffset.x, y: next.y + outwardOffset.y };

        if (orientation === "horizontal") {
          return (
            <line
              key={`brace-${x1}-${y1}-${index}`}
              x1={Math.min(start.x, end.x) + inset}
              y1={start.y - 5}
              x2={Math.max(start.x, end.x) - inset}
              y2={start.y + 5}
              strokeWidth="0.8"
              opacity="0.62"
            />
          );
        }

        return (
          <line
            key={`brace-${x1}-${y1}-${index}`}
            x1={start.x - 5}
            y1={Math.min(start.y, end.y) + inset}
            x2={start.x + 5}
            y2={Math.max(start.y, end.y) - inset}
            strokeWidth="0.8"
            opacity="0.62"
          />
        );
      })}
    </g>
  );
}

function TurnaroundBay({
  x,
  y,
  width,
  height,
  direction,
  frameTall,
  gap,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: "up" | "down";
  frameTall: number;
  gap: number;
}) {
  const y2 = direction === "down" ? y + height : y - height;
  const offsetY = direction === "down" ? gap : -gap;
  const tickY = y + offsetY;
  const tickY2 = y2 + (direction === "down" ? -gap : gap);

  return (
    <g stroke="#f8fafc" fill="none" strokeLinecap="square" strokeLinejoin="miter">
      <CornerDoubleLeg x={x} y={tickY} type="outside" />
      <CornerDoubleLeg x={x + width} y={tickY} type="outside" />
      <line x1={x + width / 2 - 5} y1={tickY2} x2={x + width / 2 + 5} y2={tickY2} strokeWidth="1.1" opacity="0.82" />

      <FrameHeightLabel x={x + width / 2} y={tickY} normal={direction === "down" ? "down" : "up"} value={frameTall} />
    </g>
  );
}

function CornerDoubleLeg({
  x,
  y,
  type,
  normal,
  gap = 0,
}: {
  x: number;
  y: number;
  type: "inside" | "outside";
  normal?: RunNormal;
  gap?: number;
}) {
  const height = type === "inside" ? 16 : 18;
  const legGap = type === "inside" ? 4 : 5;
  const outwardOffset =
    normal === "up"
      ? { x: 0, y: -gap }
      : normal === "down"
        ? { x: 0, y: gap }
        : normal === "left"
          ? { x: -gap, y: 0 }
          : normal === "right"
            ? { x: gap, y: 0 }
            : { x: 0, y: 0 };
  const legX = x + outwardOffset.x;
  const legY = y + outwardOffset.y;

  return (
    <g stroke="#f8fafc" fill="none" strokeLinecap="square">
      <line x1={legX - legGap} y1={legY - height / 2} x2={legX - legGap} y2={legY + height / 2} strokeWidth="1.15" />
      <line x1={legX + legGap} y1={legY - height / 2} x2={legX + legGap} y2={legY + height / 2} strokeWidth="1.15" />
    </g>
  );
}

function ShortConnection({
  x1,
  y1,
  x2,
  y2,
  normal,
  gap,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  normal: RunNormal;
  gap: number;
}) {
  const outwardOffset =
    normal === "up"
      ? { x: 0, y: -gap }
      : normal === "down"
        ? { x: 0, y: gap }
        : normal === "left"
          ? { x: -gap, y: 0 }
          : { x: gap, y: 0 };
  const dots = Array.from({ length: 3 }, (_, index) => {
    const t = (index + 1) / 4;
    return {
      x: x1 + (x2 - x1) * t + outwardOffset.x,
      y: y1 + (y2 - y1) * t + outwardOffset.y,
    };
  });

  return (
    <g fill="#f8fafc">
      {dots.map((dot, index) => (
        <circle key={`dot-${index}`} cx={dot.x} cy={dot.y} r="2.4" />
      ))}
    </g>
  );
}

function FrameHeightLabel({ x, y, normal, value }: { x: number; y: number; normal: RunNormal; value: number }) {
  const offset = 22;
  const label =
    normal === "up"
      ? { x: x + 5, y: y - offset }
      : normal === "down"
        ? { x: x + 5, y: y + offset + 4 }
        : normal === "left"
          ? { x: x - offset, y: y + 4 }
          : { x: x + offset - 3, y: y + 4 };

  return (
    <text x={label.x} y={label.y} fill="#f8fafc" fontSize="10" fontFamily="monospace" fontWeight="700">
      {value}
    </text>
  );
}

function PieceIcon({ type }: { type: PieceType }) {
  return (
    <svg viewBox="0 0 80 54" className="h-14 w-full">
      {type === "Straight Bay" && (
        <>
          <line x1="18" y1="12" x2="18" y2="44" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="62" y1="12" x2="62" y2="44" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="18" y1="30" x2="62" y2="30" stroke="#f8fafc" strokeWidth="1.25" />
          <line x1="25" y1="36" x2="55" y2="24" stroke="#f8fafc" strokeWidth="1.25" />
        </>
      )}

      {type === "Short Bay" && (
        <>
          <line x1="18" y1="30" x2="62" y2="30" stroke="#f8fafc" strokeWidth="1" opacity="0.55" />
          <circle cx="30" cy="30" r="2.5" fill="#f8fafc" />
          <circle cx="40" cy="30" r="2.5" fill="#f8fafc" />
          <circle cx="50" cy="30" r="2.5" fill="#f8fafc" />
        </>
      )}

      {type === "Turnaround Bay" && (
        <>
          <line x1="20" y1="12" x2="20" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="20" y1="42" x2="60" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="60" y1="42" x2="60" y2="12" stroke="#f8fafc" strokeWidth="1.5" />
        </>
      )}

      {type === "Inside Corner" && (
        <>
          <line x1="18" y1="14" x2="58" y2="14" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="18" y1="14" x2="18" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="18" y1="42" x2="58" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="16" y1="14" x2="16" y2="42" stroke="#f8fafc" strokeWidth="1" />
        </>
      )}

      {type === "Outside Corner" && (
        <>
          <line x1="20" y1="14" x2="58" y2="14" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="20" y1="14" x2="20" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="20" y1="42" x2="40" y2="42" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="23" y1="14" x2="23" y2="42" stroke="#f8fafc" strokeWidth="1" />
        </>
      )}

      {type === "End Bay" && (
        <>
          <line x1="40" y1="12" x2="40" y2="44" stroke="#f8fafc" strokeWidth="1.5" />
          <line x1="28" y1="18" x2="52" y2="18" stroke="#f8fafc" strokeWidth="1.25" />
          <line x1="28" y1="38" x2="52" y2="38" stroke="#f8fafc" strokeWidth="1.25" />
        </>
      )}
    </svg>
  );
}

function GridAxisLabels() {
  const xLabels = Array.from({ length: 21 }, (_, index) => index * 5);
  const yLabels = Array.from({ length: 15 }, (_, index) => index * 5);

  return (
    <g opacity="0.45">
      {xLabels.map((value, index) => (
        <g key={`x-${value}`}>
          <text x={54 + index * 50} y="42" fill="#a1a1aa" fontSize="10" fontFamily="monospace">
            {value}'
          </text>
          <line x1={58 + index * 50} y1="49" x2={58 + index * 50} y2="62" stroke="#a1a1aa" strokeWidth="0.7" />
        </g>
      ))}

      {yLabels.map((value, index) => (
        <g key={`y-${value}`}>
          <text x="18" y={76 + index * 38} fill="#a1a1aa" fontSize="10" fontFamily="monospace">
            {value}'
          </text>
          <line x1="46" y1={72 + index * 38} x2="60" y2={72 + index * 38} stroke="#a1a1aa" strokeWidth="0.7" />
        </g>
      ))}
    </g>
  );
}

function HeaderMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-36">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-zinc-200">{value}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[1.6rem] border border-zinc-800 bg-[#0b0b0b] p-4 shadow-2xl last:mb-0">
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
    <button
      onClick={onClick}
      className={`rounded-2xl border px-4 py-2 text-xs font-bold ${
        active === undefined
          ? "border-zinc-800 bg-black/80 text-zinc-300"
          : active
            ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
            : "border-zinc-800 bg-black/80 text-zinc-500"
      }`}
    >
      {label}
      {value && <span className="ml-2 font-mono text-orange-300">{value}</span>}
    </button>
  );
}

function ViewerTool({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <button className={`rounded-xl px-3 py-2 text-[10px] font-bold ${
      primary
        ? "bg-orange-500 text-black hover:bg-orange-400"
        : "border border-zinc-700 bg-black/80 text-zinc-300 hover:border-orange-500/40 hover:text-orange-300"
    }`}>
      {label}
    </button>
  );
}

function ProjectDebugStrip({ projectName, elevation }: { projectName: string; elevation: ProjectElevation | null }) {
  const quantity = elevation?.quantityEngine;
  const overlayExists = hasTakeoffOverlayGeometry(elevation);

  return (
    <div className="border-b border-orange-500/20 bg-black px-6 py-2 font-mono text-[11px] text-zinc-400">
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

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300">
      {label}
    </a>
  );
}

function TopAction({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
        primary
          ? "bg-orange-500 text-black hover:bg-orange-400"
          : "border border-zinc-800 bg-black text-zinc-300 hover:border-orange-500/40 hover:text-orange-300"
      }`}
    >
      {label}
    </a>
  );
}
