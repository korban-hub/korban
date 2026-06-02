"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

type LevelOverlay = {
  id: number;
  name: string;
  scaffoldWidth: "3' Wide" | "3'6\" Wide" | "5' Wide";
  buildingHeight: string;
  jumpCount: string;
  productionPace:
    | "Fast — 60 frames/day"
    | "Regular — 50 frames/day"
    | "Slow — 40 frames/day";
  laborRate: string;
  scalePoints: Point[];
  knownDistanceText: string;
  knownDistanceFeet: number | null;
  pixelsPerFoot: number | null;
  overlayPoints: Point[];
  overlayClosed: boolean;
  mobilizationName: string;
};

const starterLevel: LevelOverlay = {
  id: 1,
  name: "Level 1 Overlay",
  scaffoldWidth: "3' Wide",
  buildingHeight: "",
  jumpCount: "",
  productionPace: "Regular — 50 frames/day",
  laborRate: "$150 / hr",
  scalePoints: [],
  knownDistanceText: "",
  knownDistanceFeet: null,
  pixelsPerFoot: null,
  overlayPoints: [],
  overlayClosed: false,
  mobilizationName: "",
};

function parseFeetInches(input: string): number | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const inchesOnlyMatch = value.match(/^(\d+(?:\.\d+)?)\s*(in|inch|inches|")$/);
  if (inchesOnlyMatch) return Number(inchesOnlyMatch[1]) / 12;

  const feetInchesMatch = value.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:-| )?\s*(\d+(?:\.\d+)?)?\s*(?:"|in|inch|inches)?$/
  );
  if (!feetInchesMatch) return null;

  const feet = Number(feetInchesMatch[1]);
  const inches = feetInchesMatch[2] ? Number(feetInchesMatch[2]) : 0;
  if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
  return feet + inches / 12;
}

function formatFeetInches(decimalFeet: number | null): string {
  if (decimalFeet === null) return "Not Set";
  const feet = Math.floor(decimalFeet);
  const inches = Math.round((decimalFeet - feet) * 12);
  if (inches === 0) return `${feet}'`;
  return `${feet}'-${inches}"`;
}

function getDistance(a: Point, b: Point) {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

function calculateOpenOverlayPixels(points: Point[]) {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 0; index < points.length - 1; index++) {
    total += getDistance(points[index], points[index + 1]);
  }
  return total;
}

function calculateClosedOverlayPixels(points: Point[]) {
  if (points.length < 2) return 0;
  let total = calculateOpenOverlayPixels(points);
  if (points.length > 2) total += getDistance(points[points.length - 1], points[0]);
  return total;
}

export default function TakeoffPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(0.7);

  const [levels, setLevels] = useState<LevelOverlay[]>([starterLevel]);
  const [activeLevelId, setActiveLevelId] = useState(1);
  const [scaleMode, setScaleMode] = useState(false);
  const [overlayMode, setOverlayMode] = useState(false);

  const activeLevel = levels.find((level) => level.id === activeLevelId) ?? levels[0];

  async function handlePdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    setPdfFileName(file.name);
    setPageNumber(1);

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setPdfDoc(loadedPdf);
    setNumPages(loadedPdf.numPages);
  }

  useEffect(() => {
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
    }
    renderPage();
  }, [pdfDoc, pageNumber, zoom]);

  function updateActiveLevel(updates: Partial<LevelOverlay>) {
    setLevels((current) =>
      current.map((level) => (level.id === activeLevelId ? { ...level, ...updates } : level))
    );
  }

  function addLevel() {
    const nextId = levels.length > 0 ? Math.max(...levels.map((level) => level.id)) + 1 : 1;
    const nextLevel: LevelOverlay = {
      ...starterLevel,
      id: nextId,
      name: `Level ${nextId} Overlay`,
      scalePoints: [],
      knownDistanceText: "",
      knownDistanceFeet: null,
      pixelsPerFoot: null,
      overlayPoints: [],
      overlayClosed: false,
    };
    setLevels((current) => [...current, nextLevel]);
    setActiveLevelId(nextId);
    setScaleMode(false);
    setOverlayMode(false);
  }

  function getCanvasPoint(event: React.MouseEvent<HTMLDivElement>) {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height) return null;
    return point;
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    const point = getCanvasPoint(event);
    if (!point) return;

    if (scaleMode) {
      const currentPoints = activeLevel.scalePoints;
      const nextPoints = currentPoints.length >= 2 ? [point] : [...currentPoints, point];
      updateActiveLevel({ scalePoints: nextPoints, pixelsPerFoot: null, knownDistanceFeet: null });
      return;
    }

    if (overlayMode) {
      if (!activeLevel.pixelsPerFoot) {
        alert("Set scale before starting an overlay.");
        setOverlayMode(false);
        return;
      }
      const nextOverlayPoints = activeLevel.overlayClosed ? [point] : [...activeLevel.overlayPoints, point];
      updateActiveLevel({ overlayPoints: nextOverlayPoints, overlayClosed: false });
    }
  }

  const scalePixelDistance = useMemo(() => {
    if (!activeLevel || activeLevel.scalePoints.length < 2) return 0;
    const [a, b] = activeLevel.scalePoints;
    return getDistance(a, b);
  }, [activeLevel]);

  const overlayPixelDistance = useMemo(() => {
    if (!activeLevel) return 0;
    return activeLevel.overlayClosed
      ? calculateClosedOverlayPixels(activeLevel.overlayPoints)
      : calculateOpenOverlayPixels(activeLevel.overlayPoints);
  }, [activeLevel]);

  const overlayLinearFeet = useMemo(() => {
    if (!activeLevel?.pixelsPerFoot) return 0;
    return overlayPixelDistance / activeLevel.pixelsPerFoot;
  }, [overlayPixelDistance, activeLevel]);

  const estimatedBays = overlayLinearFeet > 0 ? Math.ceil(overlayLinearFeet / 10) : 0;

  function calibrateScale() {
    const knownFeet = parseFeetInches(activeLevel.knownDistanceText);
    if (activeLevel.scalePoints.length < 2) {
      alert("Click two points on the plan first.");
      return;
    }
    if (!knownFeet || knownFeet <= 0) {
      alert("Enter a valid known distance. Example: 20'-6\"");
      return;
    }
    updateActiveLevel({ knownDistanceFeet: knownFeet, pixelsPerFoot: scalePixelDistance / knownFeet });
    setScaleMode(false);
  }

  function clearActiveScale() {
    updateActiveLevel({
      scalePoints: [],
      knownDistanceText: "",
      knownDistanceFeet: null,
      pixelsPerFoot: null,
      overlayPoints: [],
      overlayClosed: false,
    });
    setScaleMode(false);
    setOverlayMode(false);
  }

  function startOverlay() {
    if (!activeLevel.pixelsPerFoot) {
      alert("Set scale before starting an overlay.");
      return;
    }
    setScaleMode(false);
    setOverlayMode(true);
    if (activeLevel.overlayClosed) updateActiveLevel({ overlayPoints: [], overlayClosed: false });
  }

  function closeOverlay() {
    if (activeLevel.overlayPoints.length < 3) {
      alert("Select at least 3 points before closing overlay.");
      return;
    }
    updateActiveLevel({ overlayClosed: true });
    setOverlayMode(false);
  }

  function clearOverlay() {
    updateActiveLevel({ overlayPoints: [], overlayClosed: false });
    setOverlayMode(false);
  }

  const scaleStatusText = activeLevel.pixelsPerFoot
    ? `Calibrated to ${formatFeetInches(activeLevel.knownDistanceFeet)}`
    : "Scale Not Set";

  return (
    <main className="h-screen overflow-hidden bg-[#050505] text-white">
      <header className="flex h-16 items-center justify-between border-b border-orange-500/20 bg-black px-6">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">KORBAN</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">Scaffold Intelligence Platform</p>
          </div>
          <div className="hidden h-8 w-px bg-neutral-800 lg:block" />
          <div className="hidden items-center gap-3 lg:flex">
            <div className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-300">Workspace Active</div>
            <div className="rounded-full border border-neutral-800 bg-black px-3 py-1 text-xs text-neutral-400">{pdfDoc ? "PDF Loaded" : "No PDF Loaded"}</div>
            <div className="rounded-full border border-neutral-800 bg-black px-3 py-1 text-xs text-neutral-400">{scaleStatusText}</div>
            <div className="rounded-full border border-neutral-800 bg-black px-3 py-1 text-xs text-neutral-400">
              {overlayMode ? "Overlay Active" : activeLevel.overlayClosed ? "Overlay Closed" : "Overlay Not Started"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">Save</button>
          <button className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-black shadow-[0_0_25px_rgba(249,115,22,0.25)] transition hover:bg-orange-400">Generate Estimate</button>
        </div>
      </header>

      <div className="grid h-[calc(100vh-64px)] grid-cols-[310px_minmax(0,1fr)_350px]">
        <aside className="min-w-0 overflow-y-auto border-r border-orange-500/20 bg-[#0a0a0a]">
          <div className="border-b border-neutral-900 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.35em] text-orange-400">Levels</h2>
            <p className="mt-2 text-xs text-neutral-500">Create overlays per floor, roof, or plan level.</p>
            <button onClick={addLevel} className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-orange-400">+ Add Level</button>
          </div>

          <div className="space-y-3 px-5 py-5">
            {levels.map((level) => (
              <button
                key={level.id}
                onClick={() => {
                  setActiveLevelId(level.id);
                  setScaleMode(false);
                  setOverlayMode(false);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  level.id === activeLevelId
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-neutral-900 bg-black hover:border-orange-500/20"
                }`}
              >
                <p className="text-sm font-semibold text-neutral-100">{level.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{level.buildingHeight || "Height not set"} • {level.scaffoldWidth}</p>
                <p className="mt-2 text-xs text-orange-400">
                  {level.id === activeLevelId && overlayLinearFeet > 0
                    ? `${overlayLinearFeet.toFixed(1)} LF overlay`
                    : level.pixelsPerFoot
                    ? "Ready for overlay"
                    : "Scale pending"}
                </p>
              </button>
            ))}
          </div>

          <div className="mx-5 mb-6 rounded-3xl border border-neutral-900 bg-black p-5">
            <h3 className="text-xs uppercase tracking-[0.25em] text-neutral-500">Active Level</h3>
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-neutral-500">Name</label>
                <input value={activeLevel?.name ?? ""} onChange={(e) => updateActiveLevel({ name: e.target.value })} className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Scaffold Frame Width</label>
                <select value={activeLevel?.scaffoldWidth ?? "3' Wide"} onChange={(e) => updateActiveLevel({ scaffoldWidth: e.target.value as LevelOverlay["scaffoldWidth"] })} className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500">
                  <option>3&apos; Wide</option>
                  <option>3&apos;6&quot; Wide</option>
                  <option>5&apos; Wide</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500">Building Height</label>
                <input value={activeLevel?.buildingHeight ?? ""} onChange={(e) => updateActiveLevel({ buildingHeight: e.target.value })} placeholder="Example: 72 ft" className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Jumps</label>
                <input value={activeLevel?.jumpCount ?? ""} onChange={(e) => updateActiveLevel({ jumpCount: e.target.value })} placeholder="Example: 5" className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Production Pace</label>
                <select value={activeLevel?.productionPace ?? "Regular — 50 frames/day"} onChange={(e) => updateActiveLevel({ productionPace: e.target.value as LevelOverlay["productionPace"] })} className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500">
                  <option>Fast — 60 frames/day</option>
                  <option>Regular — 50 frames/day</option>
                  <option>Slow — 40 frames/day</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500">Optional Mobilization</label>
                <input value={activeLevel?.mobilizationName ?? ""} onChange={(e) => updateActiveLevel({ mobilizationName: e.target.value })} placeholder="Example: Mobilization 01" className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Labor Rate</label>
                <input value={activeLevel?.laborRate ?? ""} onChange={(e) => updateActiveLevel({ laborRate: e.target.value })} className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
              </div>
            </div>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-col bg-[#080808]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-900 bg-black/70 px-5">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black">
                Upload PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>
              <button onClick={() => { setOverlayMode(false); setScaleMode(true); }} className={`rounded-xl border px-4 py-2 text-sm transition ${scaleMode ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-neutral-800 text-neutral-300 hover:border-orange-500/40 hover:bg-orange-500/10"}`}>Scale</button>
              <button onClick={startOverlay} className={`rounded-xl border px-4 py-2 text-sm transition ${overlayMode ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-neutral-800 text-neutral-300 hover:border-orange-500/40 hover:bg-orange-500/10"}`}>Overlay</button>
              <button className="rounded-xl border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:border-orange-500/40 hover:bg-orange-500/10">Set Scaffold</button>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="rounded-lg border border-neutral-800 px-3 py-2">-</button>
              <span className="min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} className="rounded-lg border border-neutral-800 px-3 py-2">+</button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden p-5">
            <div className="relative h-full min-w-0 overflow-auto rounded-[32px] border border-neutral-800 bg-[#0d0d0d] shadow-[inset_0_0_80px_rgba(249,115,22,0.04)]">
              <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:38px_38px]" />
              <div className="absolute left-5 top-5 z-30 max-w-[420px] truncate rounded-full border border-orange-500/20 bg-black/70 px-4 py-2 text-xs text-neutral-400">{pdfFileName || "No PDF loaded"}</div>

              {activeLevel.overlayPoints.length > 0 && (
                <div className="absolute right-5 top-5 z-40 rounded-2xl border border-orange-500/25 bg-black/85 p-3 shadow-[0_0_30px_rgba(249,115,22,0.12)]">
                  <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-orange-400">Overlay Controls</p>
                  <div className="flex gap-2">
                    <button onClick={closeOverlay} disabled={activeLevel.overlayPoints.length < 3} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40">Close Overlay</button>
                    <button onClick={clearOverlay} className="rounded-xl border border-neutral-800 px-3 py-2 text-xs text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">Clear</button>
                  </div>
                </div>
              )}

              {!pdfDoc ? (
                <div className="relative z-10 flex h-full min-h-[650px] items-center justify-center text-center">
                  <div>
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] border border-orange-500/20 bg-orange-500/10 text-4xl text-orange-500 shadow-[0_0_45px_rgba(249,115,22,0.15)]">+</div>
                    <h2 className="mt-7 text-3xl font-semibold">Digital Takeoff Workspace</h2>
                    <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-neutral-500">Upload a dimensioned floor plan PDF to begin scale calibration, level overlays, scaffold offsets, and live estimating.</p>
                    <label className="mt-8 inline-block cursor-pointer rounded-full bg-orange-500 px-7 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 hover:shadow-[0_0_35px_rgba(249,115,22,0.35)]">
                      Select PDF Plan
                      <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex min-h-full flex-col items-center p-10">
                  <div className="sticky top-4 z-40 mb-5 flex items-center gap-4 rounded-full border border-neutral-800 bg-black/80 px-4 py-2 text-sm text-neutral-400">
                    <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => Math.max(1, p - 1))} className="rounded-lg border border-neutral-800 px-3 py-1 disabled:opacity-40">Previous</button>
                    <span>Page {pageNumber} of {numPages}</span>
                    <button disabled={pageNumber >= numPages} onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))} className="rounded-lg border border-neutral-800 px-3 py-1 disabled:opacity-40">Next</button>
                  </div>

                  <div onClick={handleCanvasClick} className={`relative rounded-2xl bg-white p-4 shadow-[0_0_60px_rgba(0,0,0,0.65)] ${scaleMode || overlayMode ? "cursor-crosshair" : ""}`}>
                    <canvas ref={canvasRef} />

                    {activeLevel.scalePoints.map((point, index) => (
                      <div key={`scale-${point.x}-${point.y}`} className="absolute z-40 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-xs font-bold text-black" style={{ left: point.x + 16, top: point.y + 16 }}>S{index + 1}</div>
                    ))}

                    {activeLevel.scalePoints.length === 2 && (
                      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                        <line x1={activeLevel.scalePoints[0].x + 16} y1={activeLevel.scalePoints[0].y + 16} x2={activeLevel.scalePoints[1].x + 16} y2={activeLevel.scalePoints[1].y + 16} stroke="#f97316" strokeWidth="3" strokeDasharray="8 8" />
                        <text x={(activeLevel.scalePoints[0].x + activeLevel.scalePoints[1].x) / 2 + 16} y={(activeLevel.scalePoints[0].y + activeLevel.scalePoints[1].y) / 2 + 6} fill="#f97316" fontSize="14" fontWeight="700">scale line</text>
                      </svg>
                    )}

                    {activeLevel.overlayPoints.map((point, index) => (
                      <div key={`overlay-${point.x}-${point.y}`} className="absolute z-50 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black bg-orange-400 text-xs font-bold text-black shadow-[0_0_14px_rgba(249,115,22,0.9)]" style={{ left: point.x + 16, top: point.y + 16 }}>{index + 1}</div>
                    ))}

                    {activeLevel.overlayPoints.length >= 2 && (
                      <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full">
                        {activeLevel.overlayPoints.map((point, index) => {
                          const nextPoint = activeLevel.overlayPoints[index + 1];
                          if (!nextPoint) return null;
                          return <line key={`segment-${index}`} x1={point.x + 16} y1={point.y + 16} x2={nextPoint.x + 16} y2={nextPoint.y + 16} stroke="#f97316" strokeWidth="4" strokeLinecap="round" />;
                        })}
                        {activeLevel.overlayClosed && activeLevel.overlayPoints.length >= 3 && (
                          <line x1={activeLevel.overlayPoints[activeLevel.overlayPoints.length - 1].x + 16} y1={activeLevel.overlayPoints[activeLevel.overlayPoints.length - 1].y + 16} x2={activeLevel.overlayPoints[0].x + 16} y2={activeLevel.overlayPoints[0].y + 16} stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
                        )}
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="min-w-0 overflow-y-auto border-l border-orange-500/20 bg-[#0a0a0a]">
          <div className="border-b border-neutral-900 px-5 py-5">
            <h2 className="text-sm uppercase tracking-[0.35em] text-orange-400">Live Estimate</h2>
            <p className="mt-2 text-xs text-neutral-500">Real-time level overlay calculations.</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Active Level</p>
              <h3 className="mt-4 text-xl font-bold text-orange-500">{activeLevel.name}</h3>
              <p className="mt-2 text-xs text-neutral-500">{activeLevel.scaffoldWidth} • {activeLevel.productionPace}</p>
            </div>

            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Scale Calibration</p>
              <h3 className="mt-4 font-mono text-2xl font-bold text-orange-500">{activeLevel.pixelsPerFoot ? `Calibrated: ${formatFeetInches(activeLevel.knownDistanceFeet)}` : "Not Set"}</h3>
              <div className="mt-4 space-y-3">
                <input value={activeLevel.knownDistanceText} onChange={(e) => updateActiveLevel({ knownDistanceText: e.target.value, knownDistanceFeet: null, pixelsPerFoot: null })} placeholder={`Known distance, ex: 20'-6"`} className="w-full rounded-xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500" />
                <button onClick={calibrateScale} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black hover:bg-orange-400">Calibrate Scale</button>
                <button onClick={clearActiveScale} className="w-full rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-300 hover:border-orange-500/40 hover:bg-orange-500/10">Clear Scale</button>
                <p className="text-xs text-neutral-500">Points selected: {activeLevel.scalePoints.length}/2</p>
                {activeLevel.knownDistanceFeet && <p className="text-xs text-neutral-500">Known distance: {formatFeetInches(activeLevel.knownDistanceFeet)}</p>}
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">Overlay Status</p>
              <h3 className="mt-4 font-mono text-3xl font-bold text-orange-500">{activeLevel.overlayClosed ? "Closed" : overlayMode ? "Active" : "Open"}</h3>
              <div className="mt-4 space-y-2 text-xs text-neutral-500">
                <p>Overlay points: {activeLevel.overlayPoints.length}</p>
                <p>Linear feet: <span className="text-orange-400">{overlayLinearFeet.toFixed(1)} LF</span></p>
              </div>
            </div>

            {[
              ["Linear Feet", `${overlayLinearFeet.toFixed(1)} LF`],
              ["Estimated Bays", `${estimatedBays}`],
              ["Frame Count", "0"],
              ["Plank Count", "0"],
              ["Install Hours", "0"],
              ["Dismantle Hours", "0"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-neutral-900 bg-black p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">{label}</p>
                <h3 className="mt-4 font-mono text-4xl font-bold text-orange-500">{value}</h3>
              </div>
            ))}

            <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-300">Estimated Total</p>
              <h3 className="mt-4 font-mono text-5xl font-bold text-orange-500">$0</h3>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
