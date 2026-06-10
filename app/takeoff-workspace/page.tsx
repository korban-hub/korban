"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type PickTarget =
  | { type: "full"; id: number }
  | { type: "elevation"; elevation: ElevationName }
  | { type: "heightOverall"; elevation: ElevationName }
  | { type: "heightArea"; elevation: ElevationName; areaId: string }
  | null;
type ElevationName = "North" | "South" | "East" | "West";

type FullOverlayType = "Level" | "Roof" | "Penthouse" | "Basement";

type FullOverlayRow = {
  id: number;
  isKeyFloor: boolean;
  overlayType: FullOverlayType;
  level: string;
  points: Point[];
  closed: boolean;
  linealFeet: number;
  color: string;
};

type ElevationReference = {
  elevation: ElevationName;
  points: Point[];
  closed: boolean;
  linealFeet: number;
  manualLinealFeetInput: string;
  source: "Pick Points" | "Manual" | "Not Set";
};

type HeightArea = {
  id: string;
  label: "Left" | "Center" | "Right";
  gridline: string;
  heightInput: string;
  coveragePercent: number;
};

type ElevationHeight = {
  elevation: ElevationName;
  overallHeightInput: string;
  multipleHeights: boolean;
  areas: HeightArea[];
};

const elevationOptions: ElevationName[] = ["North", "South", "East", "West"];
const overlayColors = [
  "#0ea5e9",
  "#22c55e",
  "#e879f9",
  "#facc15",
  "#ef4444",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
];
const tolerancePercent = 0.08;

const initialElevationRefs: ElevationReference[] = elevationOptions.map(
  (elevation) => ({
    elevation,
    points: [],
    closed: false,
    linealFeet: 0,
    manualLinealFeetInput: "--",
    source: "Not Set",
  }),
);

const initialElevationHeights: ElevationHeight[] = elevationOptions.map(
  (elevation) => ({
    elevation,
    overallHeightInput: "0'",
    multipleHeights: false,
    areas: buildDefaultHeightAreas(),
  }),
);

const levelSuggestions = ["Basement", "Ground", "Level", "Roof", "Penthouse"];

function buildDefaultHeightAreas(): HeightArea[] {
  return [
    {
      id: "left",
      label: "Left",
      gridline: "",
      heightInput: "0'",
      coveragePercent: 33,
    },
    {
      id: "center",
      label: "Center",
      gridline: "",
      heightInput: "0'",
      coveragePercent: 34,
    },
    {
      id: "right",
      label: "Right",
      gridline: "",
      heightInput: "0'",
      coveragePercent: 33,
    },
  ];
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
  if (!value || value === "--") return null;

  const normalized = value
    .toLowerCase()
    .replace(/feet|foot|ft/g, "'")
    .replace(/inches|inch|in/g, '"')
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");

  const footMarkMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?))?(?:")?$/,
  );
  if (footMarkMatch) {
    const feet = Number(footMarkMatch[1]);
    const inches = Number(footMarkMatch[2] || 0);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  const dashMatch = normalized.match(/^(-?\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)"?$/);
  if (dashMatch) {
    const feet = Number(dashMatch[1]);
    const inches = Number(dashMatch[2]);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  const plain = Number(normalized.replace(/"/g, ""));
  return Number.isNaN(plain) ? null : plain;
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

function buildLevelName(type: FullOverlayType, rows: FullOverlayRow[]) {
  const matchingNumbers = rows
    .filter(
      (row) =>
        row.overlayType === type ||
        row.level.toLowerCase().startsWith(type.toLowerCase()),
    )
    .map((row) => Number(row.level.replace(/[^0-9]/g, "")))
    .filter((value) => !Number.isNaN(value) && value > 0);

  const nextNumber = matchingNumbers.length
    ? Math.max(...matchingNumbers) + 1
    : 1;
  return `${type} ${nextNumber}`;
}

function overlayColorFor(row: FullOverlayRow) {
  if (row.isKeyFloor) return "#111827";
  if (row.overlayType === "Level") return row.color || "#0ea5e9";
  if (row.overlayType === "Roof") return row.color || "#22c55e";
  if (row.overlayType === "Penthouse") return row.color || "#e879f9";
  return row.color || "#facc15";
}

export default function TakeoffWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);

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
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);

  const [fullOverlayRows, setFullOverlayRows] = useState<FullOverlayRow[]>([
    {
      id: Date.now(),
      isKeyFloor: true,
      overlayType: "Level",
      level: "Level 2",
      points: [],
      closed: false,
      linealFeet: 0,
      color: overlayColors[0],
    },
  ]);
  const [elevationRefs, setElevationRefs] =
    useState<ElevationReference[]>(initialElevationRefs);
  const [elevationHeights, setElevationHeights] = useState<ElevationHeight[]>(
    initialElevationHeights,
  );
  const [activeElevation, setActiveElevation] =
    useState<ElevationName>("North");
  const [showCombinedOverlay, setShowCombinedOverlay] = useState(true);

  const scalePageDistance = useMemo(() => {
    if (scalePoints.length < 2) return 0;
    return distanceBetween(scalePoints[0], scalePoints[1]);
  }, [scalePoints]);

  const tracePageLength = useMemo(
    () => polylineLength(tracePoints, traceClosed || overlayLockedOpen),
    [tracePoints, traceClosed, overlayLockedOpen],
  );

  const tracedLinealFeet = useMemo(() => {
    if (!pageUnitsPerFoot || pageUnitsPerFoot <= 0) return 0;
    return tracePageLength / pageUnitsPerFoot;
  }, [tracePageLength, pageUnitsPerFoot]);

  const keyFloor = useMemo(
    () => fullOverlayRows.find((row) => row.isKeyFloor) ?? fullOverlayRows[0],
    [fullOverlayRows],
  );
  const keyFloorLf = keyFloor?.linealFeet ?? 0;

  const totalElevationLf = useMemo(
    () => elevationRefs.reduce((sum, item) => sum + item.linealFeet, 0),
    [elevationRefs],
  );

  const activeElevationRef = useMemo(
    () =>
      elevationRefs.find((item) => item.elevation === activeElevation) ??
      elevationRefs[0],
    [activeElevation, elevationRefs],
  );

  const activeElevationHeight = useMemo(
    () =>
      elevationHeights.find((item) => item.elevation === activeElevation) ??
      elevationHeights[0],
    [activeElevation, elevationHeights],
  );

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
    setShowCombinedOverlay(true);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer })
        .promise;

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
    setOverlayMode(tool === "Overlay" && Boolean(pickTarget));
  }

  function getPagePointFromClick(event: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const renderedX = event.clientX - rect.left;
    const renderedY = event.clientY - rect.top;

    if (
      renderedX < 0 ||
      renderedY < 0 ||
      renderedX > rect.width ||
      renderedY > rect.height
    )
      return null;

    return { x: renderedX / zoom, y: renderedY / zoom };
  }

  function handleWorkspaceClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!scaleMode && !overlayMode) return;

    const point = getPagePointFromClick(event);
    if (!point) return;

    if (scaleMode) {
      setScalePoints((current) =>
        current.length >= 2 ? [point] : [...current, point],
      );
    }

    if (overlayMode && !traceClosed && !overlayLockedOpen && pickTarget) {
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
    setOverlayMode(false);
  }

  function goToPage() {
    const target = Number(pageJump);

    if (!target || target < 1 || target > numPages) {
      alert(`Enter a page number between 1 and ${numPages}.`);
      return;
    }

    setPageNumber(target);
  }

  function startPick(target: PickTarget) {
    if (!pdfDoc) {
      alert("Upload a PDF first.");
      return;
    }

    if (!pageUnitsPerFoot) {
      alert("Set scale before picking points.");
      return;
    }

    setPickTarget(target);
    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
    setOverlayMode(true);
    setScaleMode(false);
    setActiveTool("Overlay");
  }

  function closePick() {
    if (!pickTarget) return;

    if (pickTarget.type === "full") {
      if (tracePoints.length < 3) {
        alert("Select at least 3 points before closing a full overlay.");
        return;
      }
      setTraceClosed(true);
      setOverlayLockedOpen(false);
    }

    if (
      pickTarget.type === "elevation" ||
      pickTarget.type === "heightOverall" ||
      pickTarget.type === "heightArea"
    ) {
      if (tracePoints.length < 2) {
        alert("Select start and close points first.");
        return;
      }
      setOverlayLockedOpen(true);
      setTraceClosed(false);
    }

    setOverlayMode(false);
    setActiveTool("Overlay");
  }

  function clearPick() {
    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
    setOverlayMode(false);
    setPickTarget(null);
  }

  function storePick() {
    if (!pickTarget) {
      alert("Select a dedicated start button first.");
      return;
    }

    if (tracePoints.length < 2) {
      alert("Pick start and close points before storing.");
      return;
    }

    if (pickTarget.type === "full") {
      setFullOverlayRows((current) =>
        current.map((row) =>
          row.id === pickTarget.id
            ? {
                ...row,
                points: [...tracePoints],
                closed: traceClosed,
                linealFeet: tracedLinealFeet,
              }
            : row,
        ),
      );
    }

    if (pickTarget.type === "elevation") {
      const nextElevationRefs = elevationRefs.map((item) =>
        item.elevation === pickTarget.elevation
          ? {
              ...item,
              points: [...tracePoints],
              closed: traceClosed,
              linealFeet: tracedLinealFeet,
              manualLinealFeetInput: formatFeetInches(tracedLinealFeet),
              source: "Pick Points",
            }
          : item,
      );

      const nextTotal = nextElevationRefs.reduce(
        (sum, item) => sum + item.linealFeet,
        0,
      );
      const allElevationsCaptured = nextElevationRefs.every(
        (item) => item.linealFeet > 0,
      );
      const toleranceLf = keyFloorLf * tolerancePercent;

      if (
        allElevationsCaptured &&
        keyFloorLf > 0 &&
        Math.abs(nextTotal - keyFloorLf) > toleranceLf
      ) {
        const redo = window.confirm(
          "Per backend settings, your total LF per elevations exceeds the allowed tolerance of error. Would you like to redo?",
        );

        if (redo) {
          return;
        }
      }

      setElevationRefs(nextElevationRefs);
    }

    if (pickTarget.type === "heightOverall") {
      const heightInput = formatFeetInches(tracedLinealFeet);
      updateElevationHeight(pickTarget.elevation, {
        overallHeightInput: heightInput,
      });
    }

    if (pickTarget.type === "heightArea") {
      const heightInput = formatFeetInches(tracedLinealFeet);
      updateHeightArea(pickTarget.elevation, pickTarget.areaId, {
        heightInput,
      });
    }

    setTracePoints([]);
    setTraceClosed(false);
    setOverlayLockedOpen(false);
    setOverlayMode(false);
    setPickTarget(null);
  }

  function clearScale() {
    setScalePoints([]);
    setKnownScaleFeet("");
    setPageUnitsPerFoot(null);
  }

  function addFullOverlayRow(type: FullOverlayType = "Level") {
    setFullOverlayRows((current) => [
      ...current,
      {
        id: Date.now(),
        isKeyFloor: false,
        overlayType: type,
        level: buildLevelName(type, current),
        points: [],
        closed: false,
        linealFeet: 0,
        color: overlayColors[current.length % overlayColors.length],
      },
    ]);
  }

  function updateFullOverlayRow(id: number, updates: Partial<FullOverlayRow>) {
    setFullOverlayRows((current) =>
      current.map((row) => {
        if (row.id !== id)
          return updates.isKeyFloor ? { ...row, isKeyFloor: false } : row;
        const nextRow = { ...row, ...updates };
        return updates.isKeyFloor ? { ...nextRow, color: "#111827" } : nextRow;
      }),
    );
  }

  function removeFullOverlayRow(id: number) {
    setFullOverlayRows((current) => {
      if (current.length <= 1) return current;
      const filtered = current.filter((row) => row.id !== id);
      if (!filtered.some((row) => row.isKeyFloor)) {
        return filtered.map((row, index) =>
          index === 0 ? { ...row, isKeyFloor: true } : row,
        );
      }
      return filtered;
    });
  }

  function updateElevationReference(
    elevation: ElevationName,
    updates: Partial<ElevationReference>,
  ) {
    setElevationRefs((current) =>
      current.map((item) =>
        item.elevation === elevation ? { ...item, ...updates } : item,
      ),
    );
  }

  function storeManualElevationReference(elevation: ElevationName) {
    const current = elevationRefs.find((item) => item.elevation === elevation);
    if (!current) return;

    const parsed = parseFeetInches(current.manualLinealFeetInput);
    if (parsed === null || parsed < 0) {
      alert(
        `Enter ${elevation} LF as feet and inches, like 120'-6" or 120'6".`,
      );
      return;
    }

    const nextElevationRefs = elevationRefs.map((item) =>
      item.elevation === elevation
        ? {
            ...item,
            points: [],
            closed: false,
            linealFeet: parsed,
            manualLinealFeetInput: formatFeetInches(parsed),
            source: "Manual" as const,
          }
        : item,
    );

    const nextTotal = nextElevationRefs.reduce(
      (sum, item) => sum + item.linealFeet,
      0,
    );
    const allElevationsCaptured = nextElevationRefs.every(
      (item) => item.linealFeet > 0,
    );
    const toleranceLf = keyFloorLf * tolerancePercent;

    if (
      allElevationsCaptured &&
      keyFloorLf > 0 &&
      Math.abs(nextTotal - keyFloorLf) > toleranceLf
    ) {
      const redo = window.confirm(
        "Per backend settings, your total LF per elevations exceeds the allowed tolerance of error. Would you like to redo?",
      );

      if (redo) return;
    }

    setElevationRefs(nextElevationRefs);
  }

  function updateElevationHeight(
    elevation: ElevationName,
    updates: Partial<ElevationHeight>,
  ) {
    setElevationHeights((current) =>
      current.map((item) =>
        item.elevation === elevation ? { ...item, ...updates } : item,
      ),
    );
  }

  function updateHeightArea(
    elevation: ElevationName,
    areaId: string,
    updates: Partial<HeightArea>,
  ) {
    setElevationHeights((current) =>
      current.map((item) =>
        item.elevation === elevation
          ? {
              ...item,
              areas: item.areas.map((area) =>
                area.id === areaId ? { ...area, ...updates } : area,
              ),
            }
          : item,
      ),
    );
  }

  function getActivePickColor() {
    if (pickTarget?.type === "full") {
      const row = fullOverlayRows.find((item) => item.id === pickTarget.id);
      return row ? overlayColorFor(row) : "#f97316";
    }

    if (pickTarget?.type === "elevation") return "#ffffff";
    if (
      pickTarget?.type === "heightOverall" ||
      pickTarget?.type === "heightArea"
    )
      return "#facc15";

    return "#f97316";
  }

  function saveToEstimateReview() {
    const payload = {
      keyFloorLf,
      elevationRefs,
      elevationHeights,
    };

    localStorage.setItem("korbanTakeoffHub", JSON.stringify(payload));
    window.location.href = "/estimate-review";
  }

  function drawOverlayPolyline(
    points: Point[],
    closed: boolean,
    color: string,
    keyPrefix: string,
    dashed = false,
  ) {
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
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen((current) => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
            >
              ▾
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-11 z-[999] w-56 rounded-2xl border border-orange-500/20 bg-black p-2 shadow-2xl">
                <a
                  href="/"
                  className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Bid Room
                </a>
                <a
                  href="/projects"
                  className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Projects
                </a>
                <a
                  href="/estimate-review"
                  className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Estimate Review
                </a>
                <a
                  href="/backend"
                  className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Backend
                </a>
                <a
                  href="/settings"
                  className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Settings
                </a>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">
              KORBAN
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              Takeoff Workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-orange-500/40 hover:bg-orange-500/10"
          >
            Bid Room
          </a>

          <button
            onClick={saveToEstimateReview}
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400"
          >
            Estimate Review
          </button>
        </div>
      </header>

      <section className="flex h-[calc(100vh-64px)] flex-col bg-[#070707]">
        <div className="border-b border-orange-500/20 bg-black/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`cursor-pointer rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${activeTool === "Upload PDF" ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]" : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"}`}
              >
                Upload PDF
                <input
                  ref={uploadRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                />
              </label>

              {[
                "Scale",
                "Overlay",
                "Frame Configuration",
                "Set Scaffold",
                "Create Section View",
                "Edit Takeoff",
              ].map((tool) => (
                <button
                  key={tool}
                  onClick={() => activateTool(tool)}
                  className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${activeTool === tool ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]" : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"}`}
                >
                  {tool}
                </button>
              ))}

              <ActiveElevationMini
                activeElevation={activeElevation}
                setActiveElevation={setActiveElevation}
              />
            </div>

            <div className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">
              Active: {activeTool}
            </div>
          </div>

          {scaleMode && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs">
              <span className="font-semibold text-orange-300">Scale</span>
              <span className="text-zinc-500">
                Click 2 points, enter known length:
              </span>
              <input
                value={knownScaleFeet}
                onChange={(event) => setKnownScaleFeet(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") calibrateScale();
                }}
                placeholder={`ex: 20'-6"`}
                className="w-32 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-zinc-200 outline-none focus:border-orange-500"
              />
              <button
                onClick={calibrateScale}
                className="rounded-lg bg-orange-500 px-3 py-1 font-semibold text-black hover:bg-orange-400"
              >
                Set
              </button>
              <button
                onClick={clearScale}
                className="rounded-lg border border-zinc-800 px-3 py-1 text-zinc-300 hover:border-orange-500/50"
              >
                Clear
              </button>
              <span className="ml-auto text-zinc-500">
                Points: {scalePoints.length}/2 ·{" "}
                {pageUnitsPerFoot ? "Scale Locked" : "Not Set"}
              </span>
            </div>
          )}
        </div>

        <div className="sticky top-0 z-50 border-b border-zinc-800 bg-[#050505]/95 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 text-xs">
            <span className="max-w-[320px] truncate rounded-full border border-orange-500/20 bg-black px-3 py-1.5 text-zinc-400">
              {pdfFileName || "No PDF Loaded"}
            </span>

            <button
              disabled={!pdfDoc || pageNumber <= 1}
              onClick={() => {
                const nextPage = Math.max(1, pageNumber - 1);
                setPageNumber(nextPage);
                setPageJump(String(nextPage));
              }}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              Prev
            </button>

            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-2 py-1">
              <span className="text-zinc-500">Page</span>
              <input
                value={pageJump}
                onChange={(event) => setPageJump(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") goToPage();
                }}
                className="w-16 rounded bg-zinc-950 px-2 py-1 text-center text-zinc-200 outline-none focus:ring-1 focus:ring-orange-500"
              />
              <span className="text-zinc-500">/ {numPages || 0}</span>
              <button
                disabled={!pdfDoc}
                onClick={goToPage}
                className="rounded bg-zinc-900 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Go
              </button>
            </div>

            <button
              disabled={!pdfDoc || pageNumber >= numPages}
              onClick={() => {
                const nextPage = Math.min(numPages, pageNumber + 1);
                setPageNumber(nextPage);
                setPageJump(String(nextPage));
              }}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              Next
            </button>

            <button
              disabled={!pdfDoc}
              onClick={() => setZoom((current) => Math.max(0.1, current - 0.1))}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              -
            </button>
            <span className="w-14 text-center font-mono text-orange-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              disabled={!pdfDoc}
              onClick={() => setZoom((current) => Math.min(3, current + 0.1))}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              +
            </button>

            <button
              disabled={!pdfDoc}
              onClick={() => setZoom(0.25)}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              Fit Page
            </button>
            <button
              disabled={!pdfDoc}
              onClick={() => setZoom(0.5)}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
            >
              Fit Width
            </button>

            {overlayMode && pickTarget && (
              <span className="rounded-full bg-orange-500/10 px-3 py-1.5 text-orange-300">
                {pickTarget.type === "heightOverall" ||
                pickTarget.type === "heightArea"
                  ? `Setting: ${pickTarget.elevation} Height`
                  : pickTarget.type === "full"
                    ? "Setting: Full Overlay"
                    : `Setting: ${pickTarget.elevation} Elevation`}
              </span>
            )}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px]">
          <div className="relative overflow-auto bg-black">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:38px_38px]" />

            {pdfLoading && (
              <div className="relative z-10 flex h-full items-center justify-center text-sm text-zinc-500">
                Loading PDF...
              </div>
            )}
            {pdfError && (
              <div className="relative z-10 flex h-full items-center justify-center text-sm text-red-400">
                {pdfError}
              </div>
            )}

            {!pdfDoc && !pdfLoading && !pdfError && (
              <button
                onClick={() => uploadRef.current?.click()}
                className="relative z-10 flex h-full w-full cursor-pointer items-center justify-center"
              >
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-5xl text-orange-500">
                    +
                  </div>
                  <h2 className="text-2xl font-semibold">Upload Plan PDF</h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                    Full-screen takeoff workspace for scale, overlays,
                    elevations, and height references.
                  </p>
                </div>
              </button>
            )}

            {pdfDoc && (
              <div className="relative z-10 flex min-h-full justify-center p-10">
                <div
                  onClick={handleWorkspaceClick}
                  className={`relative h-fit rounded-2xl bg-white p-4 shadow-[0_0_60px_rgba(0,0,0,0.65)] ${scaleMode || overlayMode ? "cursor-crosshair" : ""}`}
                >
                  <canvas ref={canvasRef} />

                  {/* Stored takeoff geometry is intentionally not drawn back on the PDF.
                      The PDF Viewer is only the temporary measuring surface.
                      Stored geometry lives in the Takeoff Viewer below. */}

                  {scalePoints.map((point, index) => (
                    <Marker
                      key={`scale-${index}`}
                      point={point}
                      label={`S${index + 1}`}
                      zoom={zoom}
                    />
                  ))}

                  {scalePoints.length === 2 && (
                    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                      <line
                        x1={scalePoints[0].x * zoom + 16}
                        y1={scalePoints[0].y * zoom + 16}
                        x2={scalePoints[1].x * zoom + 16}
                        y2={scalePoints[1].y * zoom + 16}
                        stroke="#f97316"
                        strokeWidth="3"
                        strokeDasharray="8 8"
                      />
                    </svg>
                  )}

                  {tracePoints.map((point, index) => (
                    <Marker
                      key={`trace-${index}`}
                      point={point}
                      label={String(index + 1)}
                      zoom={zoom}
                    />
                  ))}

                  {drawOverlayPolyline(
                    tracePoints,
                    traceClosed || overlayLockedOpen,
                    getActivePickColor(),
                    "current",
                    pickTarget?.type !== "full",
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#090909] p-4">
            <TakeoffHub
              fullOverlayRows={fullOverlayRows}
              updateFullOverlayRow={updateFullOverlayRow}
              addFullOverlayRow={addFullOverlayRow}
              removeFullOverlayRow={removeFullOverlayRow}
              startPick={startPick}
              closePick={closePick}
              storePick={storePick}
              clearPick={clearPick}
              elevationRefs={elevationRefs}
              updateElevationReference={updateElevationReference}
              storeManualElevationReference={storeManualElevationReference}
              activeElevation={activeElevation}
              setActiveElevation={setActiveElevation}
              elevationHeights={elevationHeights}
              updateElevationHeight={updateElevationHeight}
              updateHeightArea={updateHeightArea}
              keyFloorLf={keyFloorLf}
              totalElevationLf={totalElevationLf}
              tolerancePercent={tolerancePercent}
              pickTarget={pickTarget}
              scaleReady={Boolean(pageUnitsPerFoot)}
              setShowCombinedOverlay={setShowCombinedOverlay}
              showCombinedOverlay={showCombinedOverlay}
              saveToEstimateReview={saveToEstimateReview}
            />
          </aside>
        </div>
      </section>
    </main>
  );
}

function TakeoffHub({
  fullOverlayRows,
  updateFullOverlayRow,
  addFullOverlayRow,
  removeFullOverlayRow,
  startPick,
  closePick,
  storePick,
  clearPick,
  elevationRefs,
  updateElevationReference,
  storeManualElevationReference,
  activeElevation,
  setActiveElevation,
  elevationHeights,
  updateElevationHeight,
  updateHeightArea,
  keyFloorLf,
  totalElevationLf,
  tolerancePercent,
  pickTarget,
  scaleReady,
  setShowCombinedOverlay,
  showCombinedOverlay,
  saveToEstimateReview,
}: {
  fullOverlayRows: FullOverlayRow[];
  updateFullOverlayRow: (id: number, updates: Partial<FullOverlayRow>) => void;
  addFullOverlayRow: (type?: FullOverlayType) => void;
  removeFullOverlayRow: (id: number) => void;
  startPick: (target: PickTarget) => void;
  closePick: () => void;
  storePick: () => void;
  clearPick: () => void;
  elevationRefs: ElevationReference[];
  updateElevationReference: (
    elevation: ElevationName,
    updates: Partial<ElevationReference>,
  ) => void;
  storeManualElevationReference: (elevation: ElevationName) => void;
  activeElevation: ElevationName;
  setActiveElevation: (elevation: ElevationName) => void;
  elevationHeights: ElevationHeight[];
  updateElevationHeight: (
    elevation: ElevationName,
    updates: Partial<ElevationHeight>,
  ) => void;
  updateHeightArea: (
    elevation: ElevationName,
    areaId: string,
    updates: Partial<HeightArea>,
  ) => void;
  keyFloorLf: number;
  totalElevationLf: number;
  tolerancePercent: number;
  pickTarget: PickTarget;
  scaleReady: boolean;
  setShowCombinedOverlay: (value: boolean) => void;
  showCombinedOverlay: boolean;
  saveToEstimateReview: () => void;
}) {
  const difference = Math.abs(totalElevationLf - keyFloorLf);
  const toleranceLf = keyFloorLf * tolerancePercent;

  return (
    <section className="rounded-2xl border border-orange-500/20 bg-black p-4 transition">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.25em] text-orange-300">
          Take Off Hub
        </h2>
        <button
          onClick={() => setShowCombinedOverlay(!showCombinedOverlay)}
          className="rounded-full border border-orange-500/30 px-3 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/10"
        >
          {showCombinedOverlay ? "Hide Preview" : "Show Preview"}
        </button>
      </div>

      <div
        className={`transition ${scaleReady ? "opacity-100" : "pointer-events-none opacity-35"}`}
        title={scaleReady ? "" : "Set scale to unlock Take Off Hub"}
      >
        <SubCard title="Full Overlay">
          <div className="space-y-2">
            {fullOverlayRows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3"
              >
                <div className="grid grid-cols-[auto_12px_minmax(0,1fr)_90px] items-center gap-2 text-xs">
                  <label className="flex items-center gap-1 text-zinc-500">
                    <input
                      type="checkbox"
                      checked={row.isKeyFloor}
                      onChange={() =>
                        updateFullOverlayRow(row.id, { isKeyFloor: true })
                      }
                      className="accent-orange-500"
                    />
                    Main
                  </label>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: overlayColorFor(row) }}
                  />
                  <input
                    value={row.level}
                    onChange={(event) =>
                      updateFullOverlayRow(row.id, {
                        level: event.target.value,
                      })
                    }
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-zinc-200 outline-none focus:border-orange-500"
                    placeholder="Level"
                  />
                  <span className="whitespace-nowrap text-right font-mono text-orange-400">
                    {Math.round(row.linealFeet).toLocaleString()} LF
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => startPick({ type: "full", id: row.id })}
                    className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${pickTarget?.type === "full" && pickTarget.id === row.id ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
                  >
                    Start
                  </button>
                  <button
                    onClick={closePick}
                    className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
                  >
                    Close
                  </button>
                  <button
                    onClick={storePick}
                    className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-orange-400"
                  >
                    Store
                  </button>
                  <button
                    onClick={() => removeFullOverlayRow(row.id)}
                    className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:border-red-500/40 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => addFullOverlayRow("Level")}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20"
            >
              + Level
            </button>
            <button
              onClick={() => addFullOverlayRow("Roof")}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
            >
              + Roof
            </button>
            <button
              onClick={() => addFullOverlayRow("Penthouse")}
              className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20"
            >
              + Penthouse
            </button>
            <button
              onClick={() => addFullOverlayRow("Basement")}
              className="rounded-xl border border-orange-300/30 bg-orange-300/10 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-300/20"
            >
              + Basement
            </button>
          </div>
        </SubCard>

        <SubCard title="Elevation Reference">
          <div className="space-y-2">
            {elevationRefs.map((item) => (
              <div
                key={item.elevation}
                className={`rounded-xl border p-3 ${activeElevation === item.elevation ? "border-white/30 bg-white/5 shadow-[0_0_18px_rgba(255,255,255,0.12)]" : "border-zinc-800 bg-zinc-950/70"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setActiveElevation(item.elevation)}
                    className="text-xs font-semibold text-zinc-200"
                  >
                    {item.elevation}
                  </button>
                  <span className="font-mono text-xs text-orange-400">
                    {formatFeetInches(item.linealFeet)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_72px] gap-1.5">
                  <input
                    value={item.manualLinealFeetInput}
                    onChange={(event) =>
                      updateElevationReference(item.elevation, {
                        manualLinealFeetInput: event.target.value,
                      })
                    }
                    placeholder="Manual LF"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={() =>
                      storeManualElevationReference(item.elevation)
                    }
                    className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
                  >
                    Store
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => {
                      setActiveElevation(item.elevation);
                      startPick({
                        type: "elevation",
                        elevation: item.elevation,
                      });
                    }}
                    className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${pickTarget?.type === "elevation" && pickTarget.elevation === item.elevation ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
                  >
                    Start
                  </button>
                  <button
                    onClick={closePick}
                    className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
                  >
                    Close
                  </button>
                  <button
                    onClick={storePick}
                    className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-orange-400"
                  >
                    Store
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Elevation Total</span>
              <span className="font-mono text-orange-400">
                {formatFeetInches(totalElevationLf)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className="text-zinc-600">Key Floor</span>
              <span
                className={
                  difference > toleranceLf && keyFloorLf > 0
                    ? "text-yellow-300"
                    : "text-zinc-500"
                }
              >
                Δ {Math.round(difference).toLocaleString()} LF / Tol.{" "}
                {Math.round(toleranceLf).toLocaleString()} LF
              </span>
            </div>
          </div>
        </SubCard>

        <SubCard title="Elevation Heights">
          <div className="space-y-3">
            {elevationHeights.map((item) => (
              <ElevationHeightTile
                key={item.elevation}
                item={item}
                active={activeElevation === item.elevation}
                setActiveElevation={setActiveElevation}
                updateElevationHeight={updateElevationHeight}
                updateHeightArea={updateHeightArea}
                startPick={startPick}
                closePick={closePick}
                storePick={storePick}
                pickTarget={pickTarget}
              />
            ))}
          </div>
        </SubCard>

        <SubCard title="Takeoff Viewer">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <TakeoffViewer
              fullOverlayRows={fullOverlayRows}
              elevationRefs={elevationRefs}
            />
            <div className="mt-3 space-y-1 text-xs">
              <MetaRow
                label="Key Floor LF"
                value={formatFeetInches(keyFloorLf)}
              />
              <MetaRow
                label="Elevation LF"
                value={`${formatFeetInches(totalElevationLf)}`}
              />
              <MetaRow
                label="Elevation Height Summary"
                value="Overall / area-based"
              />
            </div>
          </div>
          <button
            onClick={saveToEstimateReview}
            className="mt-3 w-full rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black hover:bg-orange-400"
          >
            Estimate Review
          </button>
        </SubCard>
      </div>
    </section>
  );
}

function ElevationHeightTile({
  item,
  active,
  setActiveElevation,
  updateElevationHeight,
  updateHeightArea,
  startPick,
  closePick,
  storePick,
  pickTarget,
}: {
  item: ElevationHeight;
  active: boolean;
  setActiveElevation: (elevation: ElevationName) => void;
  updateElevationHeight: (
    elevation: ElevationName,
    updates: Partial<ElevationHeight>,
  ) => void;
  updateHeightArea: (
    elevation: ElevationName,
    areaId: string,
    updates: Partial<HeightArea>,
  ) => void;
  startPick: (target: PickTarget) => void;
  closePick: () => void;
  storePick: () => void;
  pickTarget: PickTarget;
}) {
  const [coverageAdjusting, setCoverageAdjusting] = useState(false);

  return (
    <div
      className={`rounded-xl border p-3 ${active ? "border-white/30 bg-white/5 shadow-[0_0_18px_rgba(255,255,255,0.12)]" : "border-zinc-800 bg-zinc-950/70"}`}
    >
      <button
        onClick={() => setActiveElevation(item.elevation)}
        className="text-xs font-semibold text-zinc-200"
      >
        {item.elevation}
      </button>
      <div className="mt-2 grid grid-cols-[1fr_110px] items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          Main Overall Height
        </span>
        <input
          value={item.overallHeightInput}
          onChange={(event) =>
            updateElevationHeight(item.elevation, {
              overallHeightInput: event.target.value,
            })
          }
          className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-xs text-orange-300 outline-none focus:border-orange-500"
          placeholder="0' or --"
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button
          onClick={() =>
            startPick({ type: "heightOverall", elevation: item.elevation })
          }
          className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${pickTarget?.type === "heightOverall" && pickTarget.elevation === item.elevation ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
        >
          Start
        </button>
        <button
          onClick={closePick}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
        >
          Close
        </button>
        <button
          onClick={storePick}
          className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-orange-400"
        >
          Store
        </button>
      </div>
      <button
        onClick={() =>
          updateElevationHeight(item.elevation, {
            multipleHeights: !item.multipleHeights,
          })
        }
        className="mt-2 w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
      >
        + Multiple Heights
      </button>
      {item.multipleHeights && (
        <div className="mt-3 space-y-2">
          {item.areas.map((area) => (
            <div
              key={area.id}
              className="rounded-lg border border-zinc-800 bg-black p-2"
            >
              <div className="grid grid-cols-[54px_1fr_76px_62px] items-center gap-2">
                <span className="text-[10px] font-semibold text-zinc-300">
                  {area.label}
                </span>
                <input
                  value={area.gridline}
                  onChange={(event) =>
                    updateHeightArea(item.elevation, area.id, {
                      gridline: event.target.value,
                    })
                  }
                  placeholder="Gridline note"
                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-orange-500"
                />
                <input
                  value={area.heightInput}
                  onChange={(event) =>
                    updateHeightArea(item.elevation, area.id, {
                      heightInput: event.target.value,
                    })
                  }
                  placeholder="Height"
                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500"
                />
                <input
                  value={area.coveragePercent}
                  disabled={area.id === item.areas[item.areas.length - 1].id}
                  onChange={(event) => {
                    const next = Number(event.target.value || 0);
                    const otherEditable = item.areas
                      .filter(
                        (current) =>
                          current.id !== area.id &&
                          current.id !== item.areas[item.areas.length - 1].id,
                      )
                      .reduce(
                        (sum, current) => sum + current.coveragePercent,
                        0,
                      );
                    const safeNext = Math.max(1, Math.min(98, next));
                    const rightPercent = Math.max(
                      1,
                      100 - safeNext - otherEditable,
                    );
                    updateHeightArea(item.elevation, area.id, {
                      coveragePercent: safeNext,
                    });
                    updateHeightArea(
                      item.elevation,
                      item.areas[item.areas.length - 1].id,
                      { coveragePercent: rightPercent },
                    );
                  }}
                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right text-[10px] text-zinc-300 outline-none focus:border-orange-500 disabled:opacity-45"
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button
                  onClick={() =>
                    startPick({
                      type: "heightArea",
                      elevation: item.elevation,
                      areaId: area.id,
                    })
                  }
                  className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${pickTarget?.type === "heightArea" && pickTarget.elevation === item.elevation && pickTarget.areaId === area.id ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
                >
                  Start
                </button>
                <button
                  onClick={closePick}
                  className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
                >
                  Close
                </button>
                <button
                  onClick={storePick}
                  className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-orange-400"
                >
                  Store
                </button>
              </div>
            </div>
          ))}
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
            Elevation Coverage
          </p>
          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-900">
            {item.areas.map((area, index) => (
              <div
                key={area.id}
                className="border-r border-black last:border-r-0"
                style={{
                  width: `${area.coveragePercent}%`,
                  background:
                    index === 0
                      ? "#f97316"
                      : index === 1
                        ? "#fb923c"
                        : "#f59e0b",
                }}
              />
            ))}
          </div>
          {!coverageAdjusting && (
            <button
              onClick={() => setCoverageAdjusting(true)}
              className="w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
            >
              Adjust Elevation Coverage
            </button>
          )}

          {coverageAdjusting && (
            <div className="space-y-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-2">
              {item.areas.map((area, index) => (
                <div
                  key={`${area.id}-range`}
                  className="grid grid-cols-[54px_1fr_38px] items-center gap-2 text-[10px]"
                >
                  <span className="text-zinc-500">{area.label}</span>
                  <input
                    type="range"
                    min={1}
                    max={98}
                    value={area.coveragePercent}
                    disabled={index === item.areas.length - 1}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      const otherEditable = item.areas
                        .filter(
                          (_, i) => i !== index && i !== item.areas.length - 1,
                        )
                        .reduce(
                          (sum, current) => sum + current.coveragePercent,
                          0,
                        );
                      const rightPercent = Math.max(
                        1,
                        100 - next - otherEditable,
                      );
                      updateHeightArea(item.elevation, area.id, {
                        coveragePercent: next,
                      });
                      updateHeightArea(
                        item.elevation,
                        item.areas[item.areas.length - 1].id,
                        { coveragePercent: rightPercent },
                      );
                    }}
                    className="accent-orange-500 disabled:opacity-40"
                  />
                  <span className="text-right font-mono text-orange-400">
                    {area.coveragePercent}%
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCoverageAdjusting(false)}
                  className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setCoverageAdjusting(false)}
                  className="rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-semibold text-black hover:bg-orange-400"
                >
                  Store
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TakeoffViewer({
  fullOverlayRows,
  elevationRefs,
}: {
  fullOverlayRows: FullOverlayRow[];
  elevationRefs: ElevationReference[];
}) {
  const drawableFullRows = fullOverlayRows.filter(
    (row) => row.points.length >= 2 || row.linealFeet > 0,
  );
  const drawableElevationRows = elevationRefs.filter(
    (row) => row.linealFeet > 0,
  );

  if (drawableFullRows.length === 0 && drawableElevationRows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] text-zinc-600">
        Stored takeoff will appear here.
      </div>
    );
  }

  function mapRowPoint(row: FullOverlayRow, point: Point) {
    const points = row.points;
    if (points.length < 2) return "140,70";

    const minX = Math.min(...points.map((item) => item.x));
    const maxX = Math.max(...points.map((item) => item.x));
    const minY = Math.min(...points.map((item) => item.y));
    const maxY = Math.max(...points.map((item) => item.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const availableWidth = 224;
    const availableHeight = 96;
    const scale = Math.min(availableWidth / width, availableHeight / height);
    const drawnWidth = width * scale;
    const drawnHeight = height * scale;
    const offsetX = 28 + (availableWidth - drawnWidth) / 2;
    const offsetY = 22 + (availableHeight - drawnHeight) / 2;
    const x = offsetX + (point.x - minX) * scale;
    const y = offsetY + (point.y - minY) * scale;

    return `${x},${y}`;
  }

  return (
    <div className="rounded-lg border border-orange-500/10 bg-[linear-gradient(to_right,rgba(249,115,22,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(249,115,22,0.14)_1px,transparent_1px)] bg-[size:20px_20px] p-2">
      <svg
        viewBox="0 0 280 160"
        className="h-40 w-full rounded border border-zinc-800 bg-black/70"
      >
        {drawableFullRows.map((row, index) => {
          const hasGeometry = row.points.length >= 2;

          return (
            <g key={row.id} opacity={row.isKeyFloor ? 1 : 0.86}>
              {hasGeometry && (
                <>
                  <polyline
                    points={row.points
                      .map((point) => mapRowPoint(row, point))
                      .join(" ")}
                    fill="none"
                    stroke={overlayColorFor(row)}
                    strokeWidth={row.isKeyFloor ? 4 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {row.closed && row.points.length > 2 && (
                    <line
                      x1={Number(
                        mapRowPoint(
                          row,
                          row.points[row.points.length - 1],
                        ).split(",")[0],
                      )}
                      y1={Number(
                        mapRowPoint(
                          row,
                          row.points[row.points.length - 1],
                        ).split(",")[1],
                      )}
                      x2={Number(mapRowPoint(row, row.points[0]).split(",")[0])}
                      y2={Number(mapRowPoint(row, row.points[0]).split(",")[1])}
                      stroke={overlayColorFor(row)}
                      strokeWidth={row.isKeyFloor ? 4 : 3}
                      strokeLinecap="round"
                    />
                  )}
                </>
              )}
              <text
                x="12"
                y={14 + index * 11}
                fill={overlayColorFor(row)}
                fontSize="8"
                fontWeight="700"
              >
                {row.isKeyFloor ? "MAIN · " : ""}
                {row.level} · {formatFeetInches(row.linealFeet)}
              </text>
            </g>
          );
        })}

        {drawableElevationRows.map((row, index) => {
          const y = 120 + index * 8;
          const maxLf = Math.max(
            ...drawableElevationRows.map((item) => item.linealFeet),
            1,
          );
          const barWidth = Math.max(8, (row.linealFeet / maxLf) * 88);

          return (
            <g key={row.elevation}>
              <text
                x="168"
                y={y + 4}
                fill="#ffffff"
                fontSize="7"
                fontWeight="700"
              >
                {row.elevation}
              </text>
              <rect
                x="210"
                y={y - 3}
                width={barWidth}
                height="5"
                rx="2.5"
                fill="#ffffff"
                opacity="0.75"
              />
              <text x="210" y={y + 10} fill="#a1a1aa" fontSize="6">
                {formatFeetInches(row.linealFeet)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ActiveElevationMini({
  activeElevation,
  setActiveElevation,
}: {
  activeElevation: ElevationName;
  setActiveElevation: (elevation: ElevationName) => void;
}) {
  return (
    <div className="ml-1 flex items-center gap-1 rounded-xl border border-zinc-800 bg-black px-2 py-1.5">
      <span className="px-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
        Elevation
      </span>
      {elevationOptions.map((elevation) => (
        <button
          key={elevation}
          onClick={() => setActiveElevation(elevation)}
          className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${activeElevation === elevation ? "bg-white/10 text-white shadow-[0_0_14px_rgba(255,255,255,0.16)]" : "text-zinc-600 hover:text-zinc-300"}`}
        >
          {elevation[0]}
        </button>
      ))}
    </div>
  );
}

function SubCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-black/80 p-4 first:mt-3">
      <h3 className="text-[10px] uppercase tracking-[0.22em] text-orange-400">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Marker({
  point,
  label,
  zoom,
}: {
  point: Point;
  label: string;
  zoom: number;
}) {
  return (
    <div
      className="absolute z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-[10px] font-bold text-black"
      style={{ left: point.x * zoom + 16, top: point.y * zoom + 16 }}
    >
      {label}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
      <span className="text-zinc-600">{label}</span>
      <span className="font-mono text-orange-400">{value}</span>
    </div>
  );
}
