"use client";

import { useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Mode = "idle" | "scale" | "overlay";
type BaseOverlay = "1st Floor" | "2nd Floor" | "3rd Floor" | "Other";
type ElevationName = "North" | "South" | "East" | "West";

type HeightArea = {
  id: number;
  heightFt: number;
  coveragePercent: number;
};

type SavedElevation = {
  id: number;
  baseOverlay: BaseOverlay;
  elevation: ElevationName;
  start: Point;
  end: Point;
  linealFeet: number;
  multipleHeights: boolean;
  areas: HeightArea[];
};

const baseOverlayOptions: BaseOverlay[] = ["1st Floor", "2nd Floor", "3rd Floor", "Other"];
const elevationOptions: ElevationName[] = ["North", "South", "East", "West"];

const elevationColors: Record<ElevationName, string> = {
  North: "#f97316",
  South: "#22c55e",
  East: "#38bdf8",
  West: "#a855f7",
};

export default function TakeoffWorkspacePage() {
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("No PDF uploaded");
  const [mode, setMode] = useState<Mode>("idle");

  const [baseOverlay, setBaseOverlay] = useState<BaseOverlay>("2nd Floor");
  const [activeElevation, setActiveElevation] = useState<ElevationName>("North");
  const [selectedElevation, setSelectedElevation] = useState<ElevationName>("North");

  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [knownDistanceFt, setKnownDistanceFt] = useState(100);

  const [overlayPoints, setOverlayPoints] = useState<Point[]>([]);
  const [savedElevations, setSavedElevations] = useState<SavedElevation[]>([]);

  const scalePixelDistance = useMemo(() => {
    if (scalePoints.length < 2) return 0;
    return distance(scalePoints[0], scalePoints[1]);
  }, [scalePoints]);

  const feetPerPixel = useMemo(() => {
    if (!scalePixelDistance || !knownDistanceFt) return 0;
    return knownDistanceFt / scalePixelDistance;
  }, [knownDistanceFt, scalePixelDistance]);

  const activeLinealFeet = useMemo(() => {
    if (!feetPerPixel || overlayPoints.length < 2) return 0;
    return distance(overlayPoints[0], overlayPoints[1]) * feetPerPixel;
  }, [feetPerPixel, overlayPoints]);

  const selectedSavedElevation = useMemo(() => {
    return savedElevations.find((item) => item.elevation === selectedElevation) ?? null;
  }, [savedElevations, selectedElevation]);

  const elevationTotals = useMemo(() => {
    return elevationOptions.map((elevation) => {
      const saved = savedElevations.find((item) => item.elevation === elevation);

      return {
        elevation,
        linealFeet: saved?.linealFeet ?? 0,
        saved: Boolean(saved),
      };
    });
  }, [savedElevations]);

  const completeExteriorLf = useMemo(() => {
    return savedElevations.reduce((sum, item) => sum + item.linealFeet, 0);
  }, [savedElevations]);

  function handlePdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPdfUrl(URL.createObjectURL(file));
    setPdfName(file.name);
    setMode("idle");
    setScalePoints([]);
    setOverlayPoints([]);
    setSavedElevations([]);
    setSelectedElevation("North");
    setActiveElevation("North");
  }

  function handleViewerClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!viewerRef.current || mode === "idle") return;

    const rect = viewerRef.current.getBoundingClientRect();

    const nextPoint: Point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (mode === "scale") {
      setScalePoints((current) => {
        if (current.length >= 2) return [nextPoint];
        return [...current, nextPoint];
      });

      return;
    }

    if (mode === "overlay") {
      setOverlayPoints((current) => {
        if (current.length >= 2) return [nextPoint];
        return [...current, nextPoint];
      });
    }
  }

  function clearScale() {
    setScalePoints([]);
  }

  function clearCurrentOverlay() {
    setOverlayPoints([]);
  }

  function saveElevation() {
    if (overlayPoints.length < 2 || !feetPerPixel || activeLinealFeet <= 0) return;

    const existing = savedElevations.find((item) => item.elevation === activeElevation);

    const nextElevation: SavedElevation = {
      id: existing?.id ?? Date.now(),
      baseOverlay,
      elevation: activeElevation,
      start: overlayPoints[0],
      end: overlayPoints[1],
      linealFeet: activeLinealFeet,
      multipleHeights: existing?.multipleHeights ?? false,
      areas:
        existing?.areas ??
        [
          {
            id: Date.now() + 1,
            heightFt: 32,
            coveragePercent: 100,
          },
        ],
    };

    setSavedElevations((current) => [
      ...current.filter((item) => item.elevation !== activeElevation),
      nextElevation,
    ]);

    setSelectedElevation(activeElevation);
    setOverlayPoints([]);
    setMode("idle");
  }

  function removeElevation(elevation: ElevationName) {
    setSavedElevations((current) => current.filter((item) => item.elevation !== elevation));
  }

  function updateElevation(elevationId: number, updater: (item: SavedElevation) => SavedElevation) {
    setSavedElevations((current) =>
      current.map((item) => (item.id === elevationId ? updater(item) : item))
    );
  }

  function updateSingleHeight(elevationId: number, heightFt: number) {
    updateElevation(elevationId, (item) => ({
      ...item,
      multipleHeights: false,
      areas: [
        {
          id: item.areas[0]?.id ?? Date.now(),
          heightFt: Math.max(0, heightFt),
          coveragePercent: 100,
        },
      ],
    }));
  }

  function enableMultipleHeights(elevationId: number) {
    updateElevation(elevationId, (item) => {
      const existingHeight = item.areas[0]?.heightFt ?? 32;

      return {
        ...item,
        multipleHeights: true,
        areas:
          item.areas.length > 1
            ? item.areas
            : [
                {
                  id: Date.now() + 1,
                  heightFt: existingHeight,
                  coveragePercent: 70,
                },
                {
                  id: Date.now() + 2,
                  heightFt: Math.max(0, existingHeight - 10),
                  coveragePercent: 30,
                },
              ],
      };
    });
  }

  function disableMultipleHeights(elevationId: number) {
    updateElevation(elevationId, (item) => ({
      ...item,
      multipleHeights: false,
      areas: [
        {
          id: item.areas[0]?.id ?? Date.now(),
          heightFt: item.areas[0]?.heightFt ?? 32,
          coveragePercent: 100,
        },
      ],
    }));
  }

  function addArea(elevationId: number) {
    updateElevation(elevationId, (item) => {
      const areas = item.areas;
      const lastArea = areas[areas.length - 1];

      if (!lastArea || lastArea.coveragePercent <= 5) return item;

      const newCoverage = Math.min(25, Math.max(5, Math.round(lastArea.coveragePercent / 2)));

      return {
        ...item,
        multipleHeights: true,
        areas: [
          ...areas.slice(0, -1),
          {
            ...lastArea,
            coveragePercent: lastArea.coveragePercent - newCoverage,
          },
          {
            id: Date.now(),
            heightFt: lastArea.heightFt,
            coveragePercent: newCoverage,
          },
        ],
      };
    });
  }

  function removeArea(elevationId: number, areaId: number) {
    updateElevation(elevationId, (item) => {
      if (item.areas.length <= 1) return item;

      const removed = item.areas.find((area) => area.id === areaId);
      if (!removed) return item;

      const remaining = item.areas.filter((area) => area.id !== areaId);

      return {
        ...item,
        multipleHeights: remaining.length > 1,
        areas: remaining.map((area, index) =>
          index === remaining.length - 1
            ? {
                ...area,
                coveragePercent: area.coveragePercent + removed.coveragePercent,
              }
            : area
        ),
      };
    });
  }

  function updateAreaHeight(elevationId: number, areaId: number, heightFt: number) {
    updateElevation(elevationId, (item) => ({
      ...item,
      areas: item.areas.map((area) =>
        area.id === areaId ? { ...area, heightFt: Math.max(0, heightFt) } : area
      ),
    }));
  }

  function updateAreaCoverage(elevationId: number, areaId: number, nextPercent: number) {
    updateElevation(elevationId, (item) => {
      const targetIndex = item.areas.findIndex((area) => area.id === areaId);
      if (targetIndex < 0 || targetIndex === item.areas.length - 1) return item;

      const lockedBefore = item.areas
        .slice(0, targetIndex)
        .reduce((sum, area) => sum + area.coveragePercent, 0);

      const middleAfter = item.areas
        .slice(targetIndex + 1, -1)
        .reduce((sum, area) => sum + area.coveragePercent, 0);

      const safePercent = Math.max(1, Math.min(nextPercent, 100 - lockedBefore - middleAfter - 1));
      const usedBeforeRight = lockedBefore + safePercent + middleAfter;

      return {
        ...item,
        areas: item.areas.map((area, index) => {
          if (index === targetIndex) {
            return {
              ...area,
              coveragePercent: safePercent,
            };
          }

          if (index === item.areas.length - 1) {
            return {
              ...area,
              coveragePercent: Math.max(1, 100 - usedBeforeRight),
            };
          }

          return area;
        }),
      };
    });
  }

  function saveTakeoffConfiguration() {
    const payload = {
      baseOverlay,
      completeExteriorLf: Math.round(completeExteriorLf),
      elevations: savedElevations.map((item) => ({
        elevation: item.elevation,
        linealFeet: Math.round(item.linealFeet),
        multipleHeights: item.multipleHeights,
        areas: item.areas.map((area, index) => ({
          label: getAreaLabel(index, item.areas.length),
          heightFt: area.heightFt,
          coveragePercent: area.coveragePercent,
          linealFeet: Math.round(item.linealFeet * (area.coveragePercent / 100)),
        })),
      })),
    };

    localStorage.setItem("korbanTakeoffElevationConfig", JSON.stringify(payload));
    alert("Takeoff configuration saved. Next step: quantity engine.");
  }

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <section className="border-b border-orange-500/20 bg-black px-8 py-5">
        <div className="flex items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.5em] text-orange-500">KORBAN</p>
            <h1 className="mt-2 text-3xl font-bold">Takeoff Workspace</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Expanded takeoff view for PDF scale, elevation overlays, and height configuration.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="rounded-xl border border-zinc-800 bg-black px-5 py-3 text-sm font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
            >
              Back To Shell
            </a>

            <button
              onClick={saveTakeoffConfiguration}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400"
            >
              Save Takeoff
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
                PDF / Overlay Viewer
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Select elevation, click start point, click end point, then save.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20">
                Upload PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>

              <button
                onClick={() => setMode("scale")}
                className={`rounded-xl border px-4 py-2 text-xs font-bold ${
                  mode === "scale"
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40"
                }`}
              >
                Set Scale
              </button>

              <button
                onClick={clearScale}
                className="rounded-xl border border-zinc-800 bg-black px-4 py-2 text-xs font-bold text-zinc-400 hover:border-orange-500/40"
              >
                Clear Scale
              </button>

              <button
                onClick={() => setMode("overlay")}
                disabled={!feetPerPixel}
                className={`rounded-xl border px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === "overlay"
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40"
                }`}
              >
                Start Overlay
              </button>

              <button
                onClick={saveElevation}
                disabled={overlayPoints.length < 2 || !feetPerPixel}
                className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save Elevation
              </button>

              <button
                onClick={clearCurrentOverlay}
                className="rounded-xl border border-zinc-800 bg-black px-4 py-2 text-xs font-bold text-zinc-400 hover:border-orange-500/40"
              >
                Clear Current
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_220px]">
            <div className="rounded-2xl border border-zinc-800 bg-black p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">PDF</p>
              <p className="mt-1 truncate text-xs font-bold text-zinc-300">{pdfName}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Mode</p>
              <p className="mt-1 text-xs font-bold text-orange-300">{mode}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Scale</p>
              <p className="mt-1 text-xs font-bold text-orange-300">
                {feetPerPixel ? `${feetPerPixel.toFixed(4)} FT / PX` : "Not calibrated"}
              </p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex flex-wrap gap-2">
              {elevationOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setActiveElevation(option);
                    setSelectedElevation(option);
                  }}
                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                    activeElevation === option
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={knownDistanceFt}
                onChange={(event) => setKnownDistanceFt(Number(event.target.value || 0))}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-xs font-bold text-orange-300 outline-none focus:border-orange-500/40"
              />
              <span className="text-xs font-bold text-zinc-500">FT</span>
            </div>
          </div>

          <div
            ref={viewerRef}
            onClick={handleViewerClick}
            className="relative h-[760px] overflow-hidden rounded-3xl border border-zinc-800 bg-black"
          >
            {pdfUrl ? (
              <iframe src={pdfUrl} className="absolute inset-0 h-full w-full bg-white" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(rgba(249,115,22,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.08)_1px,transparent_1px)] bg-[size:36px_36px]">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-4xl font-light text-orange-500">
                    +
                  </div>
                  <p className="text-2xl font-bold text-zinc-100">Takeoff Workspace</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Upload PDF, set scale, and draw elevation start/end overlays.
                  </p>
                </div>
              </div>
            )}

            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {scalePoints.length === 2 && (
                <line
                  x1={scalePoints[0].x}
                  y1={scalePoints[0].y}
                  x2={scalePoints[1].x}
                  y2={scalePoints[1].y}
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray="8 6"
                />
              )}

              {savedElevations.map((item) => (
                <g key={item.id}>
                  <line
                    x1={item.start.x}
                    y1={item.start.y}
                    x2={item.end.x}
                    y2={item.end.y}
                    stroke={elevationColors[item.elevation]}
                    strokeWidth="5"
                    strokeLinecap="round"
                  />

                  <circle cx={item.start.x} cy={item.start.y} r="6" fill={elevationColors[item.elevation]} />
                  <circle cx={item.end.x} cy={item.end.y} r="6" fill={elevationColors[item.elevation]} />

                  <text
                    x={(item.start.x + item.end.x) / 2}
                    y={(item.start.y + item.end.y) / 2 - 10}
                    fill={elevationColors[item.elevation]}
                    fontSize="13"
                    fontWeight="800"
                  >
                    {item.elevation} · {Math.round(item.linealFeet)} LF
                  </text>
                </g>
              ))}

              {overlayPoints.length === 2 && (
                <line
                  x1={overlayPoints[0].x}
                  y1={overlayPoints[0].y}
                  x2={overlayPoints[1].x}
                  y2={overlayPoints[1].y}
                  stroke={elevationColors[activeElevation]}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="10 8"
                />
              )}

              {overlayPoints.map((point, index) => (
                <g key={`active-${index}`}>
                  <circle cx={point.x} cy={point.y} r="7" fill={elevationColors[activeElevation]} />
                  <text
                    x={point.x + 10}
                    y={point.y - 10}
                    fill={elevationColors[activeElevation]}
                    fontSize="12"
                    fontWeight="800"
                  >
                    {index === 0 ? "Start" : "End"}
                  </text>
                </g>
              ))}

              {scalePoints.map((point, index) => (
                <g key={`scale-${index}`}>
                  <circle cx={point.x} cy={point.y} r="7" fill="#ffffff" />
                  <text x={point.x + 10} y={point.y - 10} fill="#ffffff" fontSize="12" fontWeight="800">
                    S{index + 1}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        <aside className="space-y-5">
          <PanelCard title="Base Overlay">
            <div className="grid grid-cols-2 gap-2">
              {baseOverlayOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setBaseOverlay(option)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    baseOverlay === option
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard title="Elevation Totals">
            <div className="space-y-2">
              {elevationTotals.map((item) => (
                <button
                  key={item.elevation}
                  onClick={() => {
                    setActiveElevation(item.elevation);
                    setSelectedElevation(item.elevation);
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedElevation === item.elevation
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-zinc-800 bg-black hover:border-orange-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: elevationColors[item.elevation] }}
                      />
                      <span className="text-xs font-bold text-zinc-300">{item.elevation}</span>
                    </div>

                    <span className="font-mono text-xs font-bold text-orange-400">
                      {item.saved ? `${Math.round(item.linealFeet).toLocaleString()} LF` : "—"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">
                Complete Exterior
              </p>
              <p className="mt-2 font-mono text-3xl font-bold text-orange-400">
                {Math.round(completeExteriorLf).toLocaleString()} LF
              </p>
            </div>
          </PanelCard>

          <PanelCard title="Elevation Configuration">
            <div className="mb-4 grid grid-cols-4 gap-2">
              {elevationOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setSelectedElevation(option);
                    setActiveElevation(option);
                  }}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                    selectedElevation === option
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40"
                  }`}
                >
                  {option[0]}
                </button>
              ))}
            </div>

            {selectedSavedElevation ? (
              <ElevationConfiguration
                elevation={selectedSavedElevation}
                updateSingleHeight={updateSingleHeight}
                enableMultipleHeights={enableMultipleHeights}
                disableMultipleHeights={disableMultipleHeights}
                addArea={addArea}
                removeArea={removeArea}
                updateAreaHeight={updateAreaHeight}
                updateAreaCoverage={updateAreaCoverage}
                removeElevation={removeElevation}
              />
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                <p className="text-xs leading-5 text-zinc-500">
                  No {selectedElevation} elevation saved yet. Select {selectedElevation}, click start/end points,
                  then save elevation.
                </p>
              </div>
            )}
          </PanelCard>

          <PanelCard title="Next Step">
            <button
              onClick={saveTakeoffConfiguration}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400"
            >
              Save For Quantity Engine
            </button>

            <p className="mt-3 text-xs leading-5 text-zinc-500">
              This saves LF by elevation and height areas. Frames, planks, legs, and jumps come next using Backend standards.
            </p>
          </PanelCard>
        </aside>
      </section>
    </main>
  );
}

function ElevationConfiguration({
  elevation,
  updateSingleHeight,
  enableMultipleHeights,
  disableMultipleHeights,
  addArea,
  removeArea,
  updateAreaHeight,
  updateAreaCoverage,
  removeElevation,
}: {
  elevation: SavedElevation;
  updateSingleHeight: (elevationId: number, heightFt: number) => void;
  enableMultipleHeights: (elevationId: number) => void;
  disableMultipleHeights: (elevationId: number) => void;
  addArea: (elevationId: number) => void;
  removeArea: (elevationId: number, areaId: number) => void;
  updateAreaHeight: (elevationId: number, areaId: number, heightFt: number) => void;
  updateAreaCoverage: (elevationId: number, areaId: number, nextPercent: number) => void;
  removeElevation: (elevation: ElevationName) => void;
}) {
  const singleArea = elevation.areas[0];
  const totalPercent = elevation.areas.reduce((sum, area) => sum + area.coveragePercent, 0);

  return (
    <div>
      <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="text-xs font-bold text-zinc-200">{elevation.elevation} Elevation</p>
        <p className="mt-1 font-mono text-3xl font-bold text-orange-400">
          {Math.round(elevation.linealFeet).toLocaleString()} LF
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">
          Areas read left to right as if standing in front of the elevation.
        </p>
      </div>

      {!elevation.multipleHeights && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Height / FT
            </label>

            <input
              type="number"
              value={singleArea?.heightFt ?? 0}
              onChange={(event) => updateSingleHeight(elevation.id, Number(event.target.value || 0))}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
            />
          </div>

          <button
            onClick={() => enableMultipleHeights(elevation.id)}
            className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] hover:bg-white/10"
          >
            + Multiple Heights
          </button>
        </div>
      )}

      {elevation.multipleHeights && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-black p-3">
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Coverage Meter
            </p>

            <div className="flex h-5 overflow-hidden rounded-full bg-zinc-900">
              {elevation.areas.map((area, index) => (
                <div
                  key={area.id}
                  className="h-full border-r border-black last:border-r-0"
                  style={{
                    width: `${area.coveragePercent}%`,
                    background: index % 2 === 0 ? "#f97316" : "#fb923c",
                  }}
                />
              ))}
            </div>

            <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
              <span>Left</span>
              <span>{totalPercent}% / 100%</span>
              <span>Right</span>
            </div>
          </div>

          {elevation.areas.map((area, index) => {
            const isLast = index === elevation.areas.length - 1;
            const label = getAreaLabel(index, elevation.areas.length);
            const areaLf = elevation.linealFeet * (area.coveragePercent / 100);

            return (
              <div key={area.id} className="rounded-2xl border border-zinc-800 bg-black p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-zinc-200">{label}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-orange-400">
                      {Math.round(areaLf)} LF · {area.coveragePercent}%
                    </p>
                  </div>

                  {elevation.areas.length > 1 && (
                    <button
                      onClick={() => removeArea(elevation.id, area.id)}
                      className="text-[10px] font-bold text-zinc-600 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mt-3">
                  <label className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Height / FT
                  </label>

                  <input
                    type="number"
                    value={area.heightFt}
                    onChange={(event) =>
                      updateAreaHeight(elevation.id, area.id, Number(event.target.value || 0))
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
                  />
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Coverage
                    </label>

                    <span className="font-mono text-xs font-bold text-zinc-300">
                      {area.coveragePercent}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={99}
                    value={area.coveragePercent}
                    disabled={isLast}
                    onChange={(event) =>
                      updateAreaCoverage(elevation.id, area.id, Number(event.target.value))
                    }
                    className="mt-2 w-full accent-orange-500 disabled:opacity-40"
                  />

                  {isLast && (
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Right-side area auto-balances remaining coverage.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <button
            onClick={() => addArea(elevation.id)}
            className="w-full rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
          >
            + Add Area
          </button>

          <button
            onClick={() => disableMultipleHeights(elevation.id)}
            className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-xs font-bold text-zinc-400 hover:border-orange-500/40"
          >
            Use Single Height
          </button>
        </div>
      )}

      <button
        onClick={() => removeElevation(elevation.elevation)}
        className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-bold text-red-300 hover:bg-red-500/10"
      >
        Remove Elevation
      </button>
    </div>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
      <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function getAreaLabel(index: number, total: number) {
  if (total === 1) return "Area 1";
  if (index === 0) return "Area 1 (Left)";
  if (index === total - 1) return `Area ${index + 1} (Right)`;
  return `Area ${index + 1}`;
}

function distance(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  return Math.sqrt(dx * dx + dy * dy);
}
