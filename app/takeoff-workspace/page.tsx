"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

type SavedOverlayLevel = {
  id: number;
  name: string;
  color: string;
  colorLabel: string;
  dashed: boolean;
  points: Point[];
  closed: boolean;
  lockedOpen: boolean;
  linealFeet: number;
  bayCount: number;
  legCount: number;
};

const levelSuggestions = ["Basement", "Ground", "Level", "Roof", "Penthouse"];

const levelColors = [
  { color: "#f97316", label: "Orange" },
  { color: "#22c55e", label: "Green" },
  { color: "#a855f7", label: "Purple" },
  { color: "#06b6d4", label: "Cyan" },
  { color: "#facc15", label: "Gold" },
  { color: "#ef4444", label: "Red" },
  { color: "#f472b6", label: "Pink" },
  { color: "#38bdf8", label: "Blue" },
];

function isRoofLevel(name: string) {
  return name.trim().toLowerCase().startsWith("roof");
}

function getLevelVisual(name: string, savedCount: number) {
  if (isRoofLevel(name)) {
    return {
      color: "#3f3f46",
      label: "Roof",
      dashed: true,
    };
  }

  const colorInfo = levelColors[savedCount % levelColors.length];

  return {
    color: colorInfo.color,
    label: colorInfo.label,
    dashed: false,
  };
}

function distanceBetween(a: Point, b: Point) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function polylineLength(points: Point[], closed: boolean) {
  if (points.length < 2) return 0;

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetween(points[index - 1], points[index]);
  }

  if (closed && points.length > 2) {
    total += distanceBetween(points[points.length - 1], points[0]);
  }

  return total;
}

function parseFeetInches(input: string): number | null {
  const value = input.trim();
  if (!value) return null;

  const cleaned = value
    .replace(/feet/gi, "")
    .replace(/foot/gi, "")
    .replace(/ft/gi, "")
    .replace(/inches/gi, "")
    .replace(/inch/gi, "")
    .replace(/in/gi, "")
    .replace(/"/g, "")
    .trim();

  if (cleaned.includes("-")) {
    const [feetRaw, inchesRaw] = cleaned.split("-");
    const feet = Number(feetRaw.trim());
    const inches = Number((inchesRaw || "0").trim());
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  if (cleaned.includes("'")) {
    const [feetRaw, inchesRaw] = cleaned.split("'");
    const feet = Number(feetRaw.trim());
    const inches = Number((inchesRaw || "0").trim());
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  const feet = Number(cleaned);
  return Number.isNaN(feet) ? null : feet;
}

function formatFeetInches(decimalFeet: number) {
  const safeFeet = Math.max(0, decimalFeet);
  let feet = Math.floor(safeFeet);
  let inches = Math.round((safeFeet - feet) * 12);

  if (inches === 12) {
    feet += 1;
    inches = 0;
  }

  return `${feet}'-${inches}"`;
}

function buildLevelName(type: string, levels: SavedOverlayLevel[]) {
  const existingCount = levels.filter((level) => level.name.toLowerCase().startsWith(type.toLowerCase())).length;
  return `${type} ${existingCount + 1}`;
}

export default function TakeoffWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTool, setActiveTool] = useState("Upload PDF");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [zoom, setZoom] = useState(0.5);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const [scaleMode, setScaleMode] = useState(false);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [knownScaleFeet, setKnownScaleFeet] = useState("");
  const [pageUnitsPerFoot, setPageUnitsPerFoot] = useState<number | null>(null);

  const [overlayMode, setOverlayMode] = useState(false);
  const [tracePoints, setTracePoints] = useState<Point[]>([]);
  const [traceClosed, setTraceClosed] = useState(false);
  const [overlayLockedOpen, setOverlayLockedOpen] = useState(false);

  const [levelName, setLevelName] = useState("Ground Level");
  const [savedLevels, setSavedLevels] = useState<SavedOverlayLevel[]>([]);
  const [showCombinedOverlay, setShowCombinedOverlay] = useState(false);

  const scalePageDistance = useMemo(() => {
    if (scalePoints.length < 2) return 0;
    return distanceBetween(scalePoints[0], scalePoints[1]);
  }, [scalePoints]);

  const tracePageLength = useMemo(() => polylineLength(tracePoints, traceClosed), [tracePoints, traceClosed]);

  const tracedLinealFeet = useMemo(() => {
    if (!pageUnitsPerFoot || pageUnitsPerFoot <= 0) return 0;
    return tracePageLength / pageUnitsPerFoot;
  }, [tracePageLength, pageUnitsPerFoot]);

  const bayCountEstimate = useMemo(() => {
    if (tracedLinealFeet <= 0) return 0;
    return Math.ceil(tracedLinealFeet / 10);
  }, [tracedLinealFeet]);

  const legCountEstimate = useMemo(() => {
    if (tracedLinealFeet <= 0) return 0;
    return bayCountEstimate + 1;
  }, [tracedLinealFeet, bayCountEstimate]);

  const overlayStatus = useMemo(() => {
    if (traceClosed) return "Closed";
    if (overlayLockedOpen) return "Open";
    if (tracePoints.length > 0) return "In Progress";
    return "Not Started";
  }, [traceClosed, overlayLockedOpen, tracePoints.length]);

  async function handlePdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    setPdfLoading(true);
    setPdfError("");
    setPdfFileName(file.name);
    setPageNumber(1);
    setPageJump("1");
    setScalePoints([]);
    setPageUnitsPerFoot(null);
    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
    setSavedLevels([]);
    setShowCombinedOverlay(false);
    setLevelName("Ground Level");

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setActiveTool("Scale");
      setScaleMode(true);
      setOverlayMode(false);
    } catch {
      setPdfError("Could not load PDF. Try another plan sheet.");
      setPdfDoc(null);
    } finally {
      setPdfLoading(false);
    }
  }

  useEffect(() => {
    async function renderPdfPage() {
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

    renderPdfPage();
  }, [pdfDoc, pageNumber, zoom]);

  function activateTool(tool: string) {
    setActiveTool(tool);
    setScaleMode(tool === "Scale");
    setOverlayMode(tool === "Overlay");
  }

  function getPagePointFromClick(event: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const renderedX = event.clientX - rect.left;
    const renderedY = event.clientY - rect.top;

    if (renderedX < 0 || renderedY < 0 || renderedX > rect.width || renderedY > rect.height) return null;

    return { x: renderedX / zoom, y: renderedY / zoom };
  }

  function handleWorkspaceClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!scaleMode && !overlayMode) return;

    const point = getPagePointFromClick(event);
    if (!point) return;

    if (scaleMode) {
      setScalePoints((current) => (current.length >= 2 ? [point] : [...current, point]));
    }

    if (overlayMode && !traceClosed && !overlayLockedOpen) {
      setTracePoints((current) => [...current, point]);
    }
  }

  function calibrateScale() {
    const feet = parseFeetInches(knownScaleFeet);

    if (scalePoints.length < 2) {
      alert("Click two points on the plan first.");
      return;
    }

    if (!feet || feet <= 0) {
      alert(`Enter the known length in feet and inches, like 20'-6" or 20-6.`);
      return;
    }

    setPageUnitsPerFoot(scalePageDistance / feet);
    setScaleMode(false);
    setActiveTool("Overlay");
    setOverlayMode(true);
  }

  function goToPage() {
    const target = Number(pageJump);

    if (!target || target < 1 || target > numPages) {
      alert(`Enter a page number between 1 and ${numPages}.`);
      return;
    }

    setPageNumber(target);
  }

  function keepOpenOverlay() {
    if (tracePoints.length < 2) {
      alert("Select at least 2 points to keep an overlay open.");
      return;
    }

    setOverlayLockedOpen(true);
    setTraceClosed(false);
    setOverlayMode(false);
    setActiveTool("Overlay");
  }

  function closeOverlay() {
    if (tracePoints.length < 3) {
      alert("Select at least 3 points before closing overlay.");
      return;
    }

    setTraceClosed(true);
    setOverlayLockedOpen(false);
    setOverlayMode(false);
    setActiveTool("Overlay");
  }

  function undoTracePoint() {
    setTracePoints((current) => current.slice(0, -1));
    setTraceClosed(false);
    setOverlayLockedOpen(false);
  }

  function clearOverlay() {
    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
  }

  function clearScale() {
    setScalePoints([]);
    setKnownScaleFeet("");
    setPageUnitsPerFoot(null);
  }

  function saveCurrentLevel() {
    if (tracePoints.length < 2) {
      alert("Trace an overlay before saving a level.");
      return;
    }

    if (!traceClosed && !overlayLockedOpen) {
      alert("Choose Keep Open or Close Overlay before saving this level.");
      return;
    }

    const trimmedName = levelName.trim();

    if (!trimmedName) {
      alert("Enter a level name.");
      return;
    }

    const visualInfo = getLevelVisual(trimmedName, savedLevels.length);

    const savedLevel: SavedOverlayLevel = {
      id: Date.now(),
      name: trimmedName,
      color: visualInfo.color,
      colorLabel: visualInfo.label,
      dashed: visualInfo.dashed,
      points: [...tracePoints],
      closed: traceClosed,
      lockedOpen: overlayLockedOpen,
      linealFeet: tracedLinealFeet,
      bayCount: bayCountEstimate,
      legCount: legCountEstimate,
    };

    setSavedLevels((current) => [...current, savedLevel]);
    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
    setActiveTool("Overlay");
    setOverlayMode(true);
    setLevelName(buildLevelName("Level", [...savedLevels, savedLevel]));
  }

  function removeSavedLevel(id: number) {
    setSavedLevels((current) => current.filter((level) => level.id !== id));
  }

  function drawOverlayPolyline(points: Point[], closed: boolean, color: string, keyPrefix: string, dashed = false) {
    if (points.length < 2) return null;

    return (
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
        {points.map((point, index) => {
          if (index === 0) return null;

          const previous = points[index - 1];

          return (
            <line
              key={`${keyPrefix}-line-${index}`}
              x1={previous.x * zoom + 16}
              y1={previous.y * zoom + 16}
              x2={point.x * zoom + 16}
              y2={point.y * zoom + 16}
              stroke={color}
              strokeWidth="3"
              strokeDasharray={dashed ? "10 8" : undefined}
            />
          );
        })}

        {closed && points.length > 2 && (
          <line
            x1={points[points.length - 1].x * zoom + 16}
            y1={points[points.length - 1].y * zoom + 16}
            x2={points[0].x * zoom + 16}
            y2={points[0].y * zoom + 16}
            stroke={color}
            strokeWidth="3"
            strokeDasharray={dashed ? "10 8" : undefined}
          />
        )}
      </svg>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-white">
      <header className="flex h-16 items-center justify-between border-b border-orange-500/20 bg-black px-6">
        <div>
          <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">KORBAN</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Takeoff Workspace</p>
        </div>

        <div className="flex items-center gap-3">
          <a href="/" className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">
            Back to Estimate
          </a>

          <button className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400">
            Save Takeoff
          </button>
        </div>
      </header>

      <section className="flex h-[calc(100vh-64px)] flex-col bg-[#070707]">
        <div className="border-b border-orange-500/20 bg-black/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <label className={`cursor-pointer rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${activeTool === "Upload PDF" ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]" : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"}`}>
                Upload PDF
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>

              {["Scale", "Overlay", "Set Scaffold", "Draft"].map((tool) => (
                <button
                  key={tool}
                  onClick={() => activateTool(tool)}
                  className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${activeTool === tool ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]" : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"}`}
                >
                  {tool}
                </button>
              ))}
            </div>

            <div className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">Active: {activeTool}</div>
          </div>
        </div>

        <div className="sticky top-0 z-50 border-b border-zinc-800 bg-[#050505]/95 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 text-xs">
            <span className="max-w-[320px] truncate rounded-full border border-orange-500/20 bg-black px-3 py-1.5 text-zinc-400">
              {pdfFileName || "No PDF Loaded"}
            </span>

            <button disabled={!pdfDoc || pageNumber <= 1} onClick={() => { const nextPage = Math.max(1, pageNumber - 1); setPageNumber(nextPage); setPageJump(String(nextPage)); }} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Prev</button>

            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-2 py-1">
              <span className="text-zinc-500">Page</span>
              <input value={pageJump} onChange={(event) => setPageJump(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }} className="w-16 rounded bg-zinc-950 px-2 py-1 text-center text-zinc-200 outline-none focus:ring-1 focus:ring-orange-500" />
              <span className="text-zinc-500">/ {numPages || 0}</span>
              <button disabled={!pdfDoc} onClick={goToPage} className="rounded bg-zinc-900 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">Go</button>
            </div>

            <button disabled={!pdfDoc || pageNumber >= numPages} onClick={() => { const nextPage = Math.min(numPages, pageNumber + 1); setPageNumber(nextPage); setPageJump(String(nextPage)); }} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Next</button>

            <button disabled={!pdfDoc} onClick={() => setZoom((current) => Math.max(0.1, current - 0.1))} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">-</button>
            <span className="w-14 text-center font-mono text-orange-400">{Math.round(zoom * 100)}%</span>
            <button disabled={!pdfDoc} onClick={() => setZoom((current) => Math.min(3, current + 0.1))} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">+</button>

            <button disabled={!pdfDoc} onClick={() => setZoom(0.25)} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Fit Page</button>
            <button disabled={!pdfDoc} onClick={() => setZoom(0.5)} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40">Fit Width</button>

            {scaleMode && <span className="rounded-full bg-orange-500/10 px-3 py-1.5 text-orange-300">Scale: click 2 points</span>}
            {overlayMode && <span className="rounded-full bg-orange-500/10 px-3 py-1.5 text-orange-300">Overlay: click coverage line</span>}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative overflow-auto bg-black">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:38px_38px]" />

            {pdfLoading && <div className="relative z-10 flex h-full items-center justify-center text-sm text-zinc-500">Loading PDF...</div>}
            {pdfError && <div className="relative z-10 flex h-full items-center justify-center text-sm text-red-400">{pdfError}</div>}

            {!pdfDoc && !pdfLoading && !pdfError && (
              <label className="relative z-10 flex h-full cursor-pointer items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-5xl text-orange-500">+</div>
                  <h2 className="text-2xl font-semibold">Upload Plan PDF</h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">Full-screen takeoff workspace for scale, overlay, tracing, set scaffold, and drafting.</p>
                </div>
                <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="hidden" />
              </label>
            )}

            {pdfDoc && (
              <div className="relative z-10 flex min-h-full justify-center p-10">
                <div onClick={handleWorkspaceClick} className={`relative h-fit rounded-2xl bg-white p-4 shadow-[0_0_60px_rgba(0,0,0,0.65)] ${scaleMode || overlayMode ? "cursor-crosshair" : ""}`}>
                  <canvas ref={canvasRef} />

                  {showCombinedOverlay &&
                    [...savedLevels]
                      .sort((a, b) => Number(a.dashed) - Number(b.dashed))
                      .map((level) => (
                        <div key={level.id}>
                          {drawOverlayPolyline(level.points, level.closed, level.color, `saved-${level.id}`, level.dashed)}
                        </div>
                      ))}

                  {!showCombinedOverlay && scalePoints.map((point, index) => (
                    <Marker key={`scale-${index}`} point={point} label={`S${index + 1}`} zoom={zoom} />
                  ))}

                  {!showCombinedOverlay && scalePoints.length === 2 && (
                    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                      <line x1={scalePoints[0].x * zoom + 16} y1={scalePoints[0].y * zoom + 16} x2={scalePoints[1].x * zoom + 16} y2={scalePoints[1].y * zoom + 16} stroke="#f97316" strokeWidth="3" strokeDasharray="8 8" />
                    </svg>
                  )}

                  {!showCombinedOverlay && tracePoints.map((point, index) => (
                    <Marker key={`trace-${index}`} point={point} label={String(index + 1)} zoom={zoom} />
                  ))}

                  {!showCombinedOverlay && drawOverlayPolyline(tracePoints, traceClosed, "#f97316", "current")}
                </div>
              </div>
            )}
          </div>

          <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#090909] p-4">
<section className="mt-4 rounded-2xl border border-zinc-800 bg-black p-4">
              <h2 className="text-xs uppercase tracking-[0.25em] text-zinc-500">Scale</h2>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <input value={knownScaleFeet} onChange={(event) => setKnownScaleFeet(event.target.value)} placeholder={`Known length, ex: 20'-6"`} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500" />
                <button onClick={calibrateScale} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black hover:bg-orange-400">Set</button>
              </div>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                <p>Scale Points: {scalePoints.length}/2</p>
                <p>Known Length: {knownScaleFeet || "Not Set"}</p>
                <p>{pageUnitsPerFoot ? "Scale Locked" : "Scale not set"}</p>
              </div>
              <button onClick={clearScale} className="mt-3 w-full rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-orange-500/50">Clear Scale</button>
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-800 bg-black p-4">
              <h2 className="text-xs uppercase tracking-[0.25em] text-zinc-500">Overlay Data</h2>
              <div className="mt-4 space-y-3 text-xs">
                <MetaRow label="Status" value={overlayStatus} />
                <MetaRow label="Points" value={String(tracePoints.length)} />
                <MetaRow label="Lineal Feet" value={formatFeetInches(tracedLinealFeet)} />
                <MetaRow label="Bay Est." value={String(bayCountEstimate)} />
                <MetaRow label="Leg Est." value={String(legCountEstimate)} />
              </div>

              <div className="mt-4 border-t border-zinc-900 pt-4">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-orange-400">Overlay Controls</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={undoTracePoint} className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-orange-500/50">Undo Point</button>
                  <button onClick={keepOpenOverlay} className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20">Keep Open</button>
                  <button onClick={closeOverlay} className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black hover:bg-orange-400">Close Overlay</button>
                  <button onClick={clearOverlay} className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-orange-500/50">Clear</button>
                </div>
              </div>

              <div className="mt-4 border-t border-zinc-900 pt-4">
                <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Level Name</label>
                <input value={levelName} onChange={(event) => setLevelName(event.target.value)} placeholder="Enter level name" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500" />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {levelSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setLevelName(buildLevelName(suggestion, savedLevels))}
                      className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300"
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>

                <button onClick={saveCurrentLevel} className="mt-3 w-full rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black hover:bg-orange-400">Save Level Overlay</button>
              </div>

              <div className="mt-4 border-t border-zinc-900 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Saved Levels</h3>
                  <button onClick={() => setShowCombinedOverlay((current) => !current)} className="rounded-full border border-orange-500/30 px-3 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/10">
                    {showCombinedOverlay ? "Hide Combined" : "View Combined"}
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {savedLevels.length === 0 && <p className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs text-zinc-600">No saved levels yet.</p>}

                  {savedLevels.map((level) => (
                    <div key={level.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-2.5 py-2 text-xs transition hover:border-orange-500/30">
                      <div className="flex min-w-0 items-center gap-2">
                        {level.dashed ? (
                          <span
                            className="h-0 w-5 shrink-0 border-t border-dashed"
                            style={{ borderColor: level.color }}
                          />
                        ) : (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: level.color }} />
                        )}
                        <span className="truncate font-semibold text-zinc-200">{level.name}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-orange-400">{formatFeetInches(level.linealFeet)}</span>
                        <button onClick={() => removeSavedLevel(level.id)} className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-orange-500/50 hover:text-orange-300">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
              <h2 className="text-xs uppercase tracking-[0.25em] text-orange-300">Workspace Notes</h2>
              <p className="mt-3 text-xs leading-5 text-zinc-400">Save each floor overlay as a level. Combined overlay shows all saved levels together with color distinction.</p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Marker({ point, label, zoom }: { point: Point; label: string; zoom: number }) {
  return (
    <div className="absolute z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-[10px] font-bold text-black" style={{ left: point.x * zoom + 16, top: point.y * zoom + 16 }}>
      {label}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
      <span className="text-zinc-600">{label}</span>
      <span className="font-mono text-orange-400">{value}</span>
    </div>
  );
}
