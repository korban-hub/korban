"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KorbanButton, KorbanHeader, KorbanHeaderMeta, KorbanPanel, KorbanEngineeringWorkspace, KorbanWorkspaceHud, KorbanWorkspaceGrid, KorbanStatusPill, type KorbanMenuLink } from "@/components/korban";
import {
  calculateQuantityEngine,
  getActiveElevation,
  getActiveProject,
  getActiveProjectId,
  saveActiveElevation,
  saveActiveProject,
  saveElevationBreakdown,
  setActiveProjectId,
  type ProjectElevation,
  type StoredElevationBreakdownRow,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

type Point = { x: number; y: number };
type PickTarget =
  | { type: "full"; id: number }
  | { type: "heightOverall"; elevation: ElevationName }
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
  pageNumber: number;
};

type ElevationHeight = {
  elevation: ElevationName;
  overallHeightInput: string;
  belowGradeEnabled: boolean;
  belowGradeInput: string;
};

const elevationOptions: ElevationName[] = ["North", "East", "South", "West"];
const overlayColors = [
  // Row 1 — original 8 defaults
  "#0ea5e9", "#22c55e", "#e879f9", "#facc15",
  "#ef4444", "#14b8a6", "#8b5cf6", "#f97316",
  // Row 2
  "#06b6d4", "#84cc16", "#f43f5e", "#fb923c",
  "#a3e635", "#34d399", "#818cf8", "#fbbf24",
  // Row 3
  "#38bdf8", "#4ade80", "#c084fc", "#fb7185",
  "#2dd4bf", "#fde047", "#60a5fa", "#f9a8d4",
  // Row 4
  "#ffffff", "#d4d4d4", "#a1a1aa", "#71717a",
  "#52525b", "#3f3f46", "#1e1e2e", "#f472b6",
];
const tolerancePercent = 0.08;

const initialElevationHeights: ElevationHeight[] = elevationOptions.map(
  (elevation) => ({
    elevation,
    overallHeightInput: "0'",
    belowGradeEnabled: false,
    belowGradeInput: "0'",
  }),
);

const takeoffMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/projects", label: "Projects" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

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

  // Handle fractional inches like 6-1/2" or 3-1/4" (no feet, just inches with fraction)
  // Pattern: digits-digits/digits"  e.g. 6-1/2" or 3-1/4"
  const inchFractionOnly = normalized.match(/^(\d+(?:\.\d+)?)-(\d+)\/(\d+)"?$/);
  if (inchFractionOnly) {
    const wholeIn = Number(inchFractionOnly[1]);
    const num = Number(inchFractionOnly[2]);
    const den = Number(inchFractionOnly[3]);
    if (!Number.isNaN(wholeIn) && !Number.isNaN(num) && den !== 0) {
      return (wholeIn + num / den) / 12;
    }
  }

  // Handle feet + fractional inches: e.g. 6'-1/2" or 10'-3-1/4"
  const feetWithFractionalInch = normalized.match(/^(-?\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?)-(\d+)\/(\d+))?(?:")?$/);
  if (feetWithFractionalInch) {
    const feet = Number(feetWithFractionalInch[1]);
    const wholeIn = Number(feetWithFractionalInch[2] || 0);
    const num = Number(feetWithFractionalInch[3] || 0);
    const den = Number(feetWithFractionalInch[4] || 1);
    if (!Number.isNaN(feet)) {
      return feet + (wholeIn + (den !== 0 ? num / den : 0)) / 12;
    }
  }

  // Standard: feet'inches" e.g. 10'-6" or 10'6"
  const footMarkMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?))?(?:")?$/,
  );
  if (footMarkMatch) {
    const feet = Number(footMarkMatch[1]);
    const inches = Number(footMarkMatch[2] || 0);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  // Dash format: 10-6" = 10ft 6in
  const dashMatch = normalized.match(/^(-?\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)"?$/);
  if (dashMatch) {
    const feet = Number(dashMatch[1]);
    const inches = Number(dashMatch[2]);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  // Plain number (feet decimal)
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

function getOppositeElevation(elevation: ElevationName): ElevationName | null {
  if (elevation === "North") return "South";
  if (elevation === "East") return "West";
  return null;
}

function canDuplicateOpposite(elevation: ElevationName): elevation is "North" | "East" {
  return elevation === "North" || elevation === "East";
}

function getHeightWithBelowGrade(item: ElevationHeight) {
  const base = parseFeetInches(item.overallHeightInput) ?? 0;
  const below = item.belowGradeEnabled ? parseFeetInches(item.belowGradeInput) ?? 0 : 0;
  return base + below;
}

function getAverageExteriorHeight(elevationHeights: ElevationHeight[]) {
  const values = elevationHeights
    .map((item) => getHeightWithBelowGrade(item))
    .filter((value) => value > 0);

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
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
      id: 1,
      isKeyFloor: true,
      overlayType: "Level",
      level: "Level 2",
      points: [],
      closed: false,
      linealFeet: 0,
      color: overlayColors[0],
      pageNumber: 1,
    },
  ]);

  const [elevationHeights, setElevationHeights] = useState<ElevationHeight[]>(
    initialElevationHeights,
  );
  const [activeElevation, setActiveElevation] = useState<ElevationName>("North");
  const [activeProjectName, setActiveProjectName] = useState("Takeoff Workspace Draft");
  const [duplicateElevationHeights, setDuplicateElevationHeights] = useState<Record<"North" | "East", boolean>>({
    North: false,
    East: false,
  });
  const [showCombinedOverlay, setShowCombinedOverlay] = useState(true);
  const [elevationBreakdownRows, setElevationBreakdownRows] = useState<StoredElevationBreakdownRow[]>(
    elevationOptions.map((elevation) => ({ elevation, approxLinearFeet: 0 })),
  );

  // Reference point — a single anchor point picked on the PDF that all overlays
  // align to, so traces from different pages or sessions stack correctly
  const [referencePoint, setReferencePoint] = useState<Point | null>(null);
  const [referencePickMode, setReferencePickMode] = useState(false);
  const [colorPickerOpenId, setColorPickerOpenId] = useState<number | null>(null);

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

  useEffect(() => {
    setActiveProjectId(getActiveProjectId());
    setActiveProjectName(getActiveProject().projectName || "Takeoff Workspace Draft");

    const storedElevation = getActiveElevation();
    if (storedElevation.elevationBreakdown && storedElevation.elevationBreakdown.length > 0) {
      setElevationBreakdownRows(storedElevation.elevationBreakdown);
    }
  }, []);

  function buildWorkspaceElevation(
    elevation: ElevationName,
    heights: ElevationHeight[] = elevationHeights,
    overlayRows: FullOverlayRow[] = fullOverlayRows,
  ): ProjectElevation {
    const height = heights.find((item) => item.elevation === elevation) ?? heights[0];
    const levelRow = overlayRows.find((row) => row.isKeyFloor) ?? overlayRows[0];
    const currentKeyFloorLf = levelRow?.linealFeet ?? 0;
    const enteredWallHeight = height ? getHeightWithBelowGrade(height) : 0;
    const linearFeet = Math.round(currentKeyFloorLf);
    const wallHeight = enteredWallHeight || getAverageExteriorHeight(heights);
    const backendScaffoldDefaults = getBackendSettings().scaffold;
    const scaffoldInput = {
      scaffoldWidth: 3,
      standardBayLength: 10,
      frameHeight: 6 + 4 / 12,
      plankCountPerBay: 2,
      bracePattern: "Every Bay",
      wallOffset: 1,
    };
    const quantityEngine = calculateQuantityEngine({
      linearFeet,
      wallHeight,
      ...scaffoldInput,
      workerReachHeight: backendScaffoldDefaults.workerReachHeight,
    });
    const scale = {
      keyFloorLf: currentKeyFloorLf,
      source: "Not Set",
      pageUnitsPerFoot,
      scalePoints,
      knownScaleFeet,
    };
    const activeFullOverlayPoints = levelRow?.points ?? [];
    const overlayGeometry = {
      elevationName: elevation,
      levelName: levelRow?.level || "Main Level",
      tracedPerimeter: activeFullOverlayPoints,
      overlayPoints: activeFullOverlayPoints,
      wallSegments: [],
      referencePoints: scalePoints,
      elevationPoints: [],
      fullOverlayRows: overlayRows,
      elevationRefs: [],
      elevationHeights: heights,
      scale,
    };

    return {
      elevationId: `${elevation.toLowerCase()}-elevation`,
      elevationName: elevation,
      levelName: overlayGeometry.levelName,
      linearFeet,
      wallHeight,
      phase: "Main",
      mobilization: "Base Bid",
      overlayGeometry,
      scale,
      scaffoldInput,
      quantityEngine,
      sectionView: {
        frameMakeup: "5 x 6'-4\" + 1 x 5'-0\" + 1 x 3'-0\"",
        selectedRun: `Run ${elevation.slice(0, 1)}-01`,
        wallOffset: scaffoldInput.wallOffset,
        sectionType: "A-A",
      },
    };
  }

  function saveWorkspaceElevation(
    elevation: ElevationName = activeElevation,
    heights: ElevationHeight[] = elevationHeights,
    overlayRows: FullOverlayRow[] = fullOverlayRows,
  ) {
    const project = getActiveProject();
    const nextElevation = buildWorkspaceElevation(elevation, heights, overlayRows);
    if (!nextElevation.linearFeet || nextElevation.linearFeet <= 0) {
      console.warn("TAKEOFF SAVING LF: skipped invalid LF", nextElevation.linearFeet);
      return;
    }
    console.log("TAKEOFF SAVING LF:", nextElevation.linearFeet);
    saveActiveProject({
      ...project,
      projectName: project.projectName || "Takeoff Workspace Draft",
      estimator: project.estimator || "H. Pierre",
    });
    saveActiveElevation(nextElevation);
    console.log("VERIFY AFTER USER SAVE", getActiveElevation());
  }

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
      // Polyfill Promise.withResolvers for pdfjs-dist v5 compatibility
      if (typeof Promise.withResolvers === "undefined") {
        (Promise as any).withResolvers = function () {
          let resolve: (value: any) => void;
          let reject: (reason?: any) => void;
          const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          });
          return { promise, resolve: resolve!, reject: reject! };
        };
      }

      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.min.mjs";

      const arrayBuffer = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setActiveTool("Scale");
      setScaleMode(true);
      setOverlayMode(false);
    } catch (error) {
      console.error("PDF load failed:", error);
      let message = "Unknown error";
      if (error instanceof Error) {
        message = `${error.name}: ${error.message}`;
      } else if (typeof error === "string") {
        message = error;
      } else {
        try { message = JSON.stringify(error); } catch { message = String(error); }
      }
      setPdfError(`Could not load PDF: ${message}`);
      setPdfDoc(null);
    } finally {
      setPdfLoading(false);
    }
  }

  const renderTaskRef = useRef<any>(null);
  const renderIdRef = useRef<number>(0);

  useEffect(() => {
    const renderId = ++renderIdRef.current;

    async function renderPdfPage() {
      if (!pdfDoc || !canvasRef.current) return;

      // Cancel any in-progress render before starting a new one
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }

      // Capture zoom/page at the time this render started
      const renderZoom = zoom;
      const renderPage = pageNumber;

      const page = await pdfDoc.getPage(renderPage);

      // Stale check — if a newer render started while we awaited getPage, abort
      if (renderId !== renderIdRef.current) return;

      const viewport = page.getViewport({ scale: renderZoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (error: any) {
        if (error?.name !== "RenderingCancelledException") {
          console.error("PDF render error:", error);
        }
      } finally {
        if (renderId === renderIdRef.current) {
          renderTaskRef.current = null;
        }
      }
    }

    renderPdfPage();
  }, [pdfDoc, pageNumber, zoom]);

  function activateTool(tool: string) {
    if (tool === "Set Scaffold") {
      saveWorkspaceElevation(activeElevation);
      window.location.href = "/set-scaffold";
      return;
    }

    if (tool === "Frame Configuration") {
      setActiveTool(tool);
      setScaleMode(false);
      setOverlayMode(false);
      return;
    }

    setActiveTool(tool);
    setScaleMode(tool === "Scale");
    setOverlayMode(tool === "Overlay" && Boolean(pickTarget));
  }

  // FIX: Correct click coordinate calculation accounting for canvas
  // container padding (p-4 = 16px) and scroll position
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

    // Divide by zoom to convert from screen pixels back to PDF page units
    return { x: renderedX / zoom, y: renderedY / zoom };
  }

  function handleWorkspaceClick(event: React.MouseEvent<HTMLDivElement>) {
    const point = getPagePointFromClick(event);
    if (!point) return;

    // Reference point pick mode — single click sets anchor
    if (referencePickMode) {
      setReferencePoint(point);
      setReferencePickMode(false);
      return;
    }

    if (!scaleMode && !overlayMode) return;

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
    setScalePoints([]);
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

    if (pickTarget.type === "heightOverall") {
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

  function undoLastPoint() {
    setTracePoints((current) => current.slice(0, -1));
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
      const nextFullOverlayRows = fullOverlayRows.map((row) =>
        row.id === pickTarget.id
          ? {
              ...row,
              points: [...tracePoints],
              closed: traceClosed,
              linealFeet: tracedLinealFeet,
              pageNumber,
            }
          : row,
      );
      setFullOverlayRows(nextFullOverlayRows);
      saveWorkspaceElevation(activeElevation, elevationHeights, nextFullOverlayRows);
    }

    if (pickTarget.type === "heightOverall") {
      const heightInput = formatFeetInches(tracedLinealFeet);
      updateElevationHeight(pickTarget.elevation, { overallHeightInput: heightInput });
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

  function updateElevationBreakdownRow(elevation: ElevationName, approxLinearFeet: number) {
    setElevationBreakdownRows((current) =>
      current.map((row) => (row.elevation === elevation ? { ...row, approxLinearFeet } : row)),
    );
  }

  function storeElevationBreakdownRow(elevation: ElevationName) {
    saveElevationBreakdown(elevationBreakdownRows);
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
        pageNumber,
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

  function storeManualOverallHeight(elevation: ElevationName) {
    const current = elevationHeights.find((item) => item.elevation === elevation);
    if (!current) return;

    const parsed = parseFeetInches(current.overallHeightInput);

    if (parsed === null || parsed < 0) {
      alert(`Enter ${elevation} height as feet and inches, like 42'-6" or 42'6".`);
      return;
    }

    const nextItem = { ...current, overallHeightInput: formatFeetInches(parsed) };
    updateElevationHeight(elevation, { overallHeightInput: nextItem.overallHeightInput });

    // Duplicate to opposite if checked
    const opposite = getOppositeElevation(elevation);
    if (
      canDuplicateOpposite(elevation) &&
      duplicateElevationHeights[elevation] &&
      opposite
    ) {
      updateElevationHeight(opposite, {
        overallHeightInput: nextItem.overallHeightInput,
        belowGradeEnabled: nextItem.belowGradeEnabled,
        belowGradeInput: nextItem.belowGradeInput,
      });
    }

    saveWorkspaceElevation(
      elevation,
      elevationHeights.map((item) => (item.elevation === elevation ? nextItem : item)),
    );
  }

  // Store All Heights — builds a complete updated heights array for all
  // four elevations at once and saves in a single call so nothing is lost
  function storeAllHeights() {
    const updatedHeights: typeof elevationHeights = elevationOptions.map((elev) => {
      const current = elevationHeights.find((item) => item.elevation === elev);
      if (!current) return elevationHeights.find((item) => item.elevation === elev)!;
      const parsed = parseFeetInches(current.overallHeightInput);
      if (parsed === null || parsed < 0) return current;
      return { ...current, overallHeightInput: formatFeetInches(parsed) };
    });

    // Apply duplicate logic
    (["North", "East"] as const).forEach((elev) => {
      if (duplicateElevationHeights[elev]) {
        const opposite = getOppositeElevation(elev);
        if (opposite) {
          const source = updatedHeights.find((h) => h.elevation === elev);
          if (source) {
            const idx = updatedHeights.findIndex((h) => h.elevation === opposite);
            if (idx >= 0) {
              updatedHeights[idx] = {
                ...updatedHeights[idx],
                overallHeightInput: source.overallHeightInput,
                belowGradeEnabled: source.belowGradeEnabled,
                belowGradeInput: source.belowGradeInput,
              };
            }
          }
        }
      }
    });

    setElevationHeights(updatedHeights);
    // Save using active elevation but pass ALL updated heights so all flow downstream
    saveWorkspaceElevation(activeElevation, updatedHeights, fullOverlayRows);
  }

  function getActivePickColor() {
    if (pickTarget?.type === "full") {
      const row = fullOverlayRows.find((item) => item.id === pickTarget.id);
      return row ? overlayColorFor(row) : "#f97316";
    }
    if (pickTarget?.type === "heightOverall") return "#facc15";
    return "#f97316";
  }

  function saveToEstimateReview() {
    const payload = { keyFloorLf, elevationHeights };
    const activeProjectId = getActiveProjectId();
    const sharedElevation = buildWorkspaceElevation(activeElevation);
    const totalLinearFeet = sharedElevation.linearFeet;
    const bays = sharedElevation.quantityEngine.bayCount;
    const legs = sharedElevation.quantityEngine.legCount;
    const jumps = sharedElevation.quantityEngine.jumps;
    const frames = sharedElevation.quantityEngine.frameCount;
    const planks = sharedElevation.quantityEngine.plankCount;
    const truckLoads = planks > 0 ? Math.ceil(planks / 150) : 0;
    const tripCount = truckLoads > 0 ? Math.max(1, Math.ceil(truckLoads / 2)) : 0;
    const estimateDraft = {
      projectId: activeProjectId,
      projectName: "Takeoff Workspace Draft",
      projectAddress: "",
      customer: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      estimator: "H. Pierre",
      bidDate: new Date().toLocaleDateString("en-US"),
      proposalNumber: `KRB-${Date.now()}`,
      projectType: "Frame Scaffold",
      unionStatus: "Union",
      totalLinearFeet,
      bays,
      legs,
      jumps,
      frames,
      planks,
      crossBraces: sharedElevation.quantityEngine.crossBraceCount,
      guardrails: sharedElevation.quantityEngine.guardrailCount,
      basePlates: sharedElevation.quantityEngine.basePlateCount,
      screwJacks: sharedElevation.quantityEngine.screwJackCount,
      erectDays: 0,
      dismantleDays: 0,
      truckLoads,
      deliveryTrips: tripCount,
      pickupTrips: tripCount,
      source: "takeoff-workspace",
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
      takeoff: { ...payload, fullOverlayRows },
    };

    let storedProjectEstimates: Record<string, typeof estimateDraft> = {};
    try {
      const existing = localStorage.getItem("korbanProjectEstimates_v1");
      const parsed = existing ? JSON.parse(existing) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        storedProjectEstimates = parsed;
      }
    } catch {
      storedProjectEstimates = {};
    }

    saveWorkspaceElevation(activeElevation);
    localStorage.setItem("korbanTakeoffHub", JSON.stringify(payload));
    localStorage.setItem(
      "korbanProjectEstimates_v1",
      JSON.stringify({ ...storedProjectEstimates, [activeProjectId]: estimateDraft }),
    );
    window.location.href = "/set-scaffold";
  }

  function drawOverlayPolyline(
    points: Point[],
    closed: boolean,
    color: string,
    keyPrefix: string,
    dashed = false,
  ) {
    if (points.length < 2) return null;
    const ox = canvasRef.current?.offsetLeft ?? 32;
    const oy = canvasRef.current?.offsetTop ?? 32;

    return (
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
        {points.map((point, index) => {
          if (index === 0) return null;
          const previous = points[index - 1];
          return (
            <line
              key={`${keyPrefix}-line-${index}`}
              x1={previous.x * zoom + ox}
              y1={previous.y * zoom + oy}
              x2={point.x * zoom + ox}
              y2={point.y * zoom + oy}
              stroke={color}
              strokeWidth="3"
              strokeDasharray={dashed ? "10 8" : undefined}
            />
          );
        })}
        {closed && points.length > 2 && (
          <line
            x1={points[points.length - 1].x * zoom + ox}
            y1={points[points.length - 1].y * zoom + oy}
            x2={points[0].x * zoom + ox}
            y2={points[0].y * zoom + oy}
            stroke={color}
            strokeWidth="3"
            strokeDasharray={dashed ? "10 8" : undefined}
          />
        )}
      </svg>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-korban-base text-white">
      <KorbanHeader
        title="Takeoff Workspace"
        subtitle="Scale, overlays, elevations, and height references"
        menuLinks={takeoffMenuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((current) => !current)}
        menuWidthClass="w-56"
        actionsClassName="gap-4"
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={activeProjectName} />
            <KorbanButton as="a" href="/project-plan-desk" variant="ghost">
              Project Plan Desk
            </KorbanButton>
            <KorbanButton variant="primary" onClick={() => { saveWorkspaceElevation(activeElevation); window.location.href = "/set-scaffold"; }}>
              Save & Continue
            </KorbanButton>
          </>
        }
      />

      <KorbanEngineeringWorkspace
        canvas={
          <>
            <KorbanWorkspaceGrid />

            <KorbanWorkspaceHud position="top-left">
              <KorbanButton
                as="label"
                variant={activeTool === "Upload PDF" ? "tool-active" : "tool-inactive"}
              >
                Upload PDF
                <input
                  ref={uploadRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                />
              </KorbanButton>

              {/* Set Scaffold is now BEFORE Frame Configuration */}
              {[
                "Scale",
                "Overlay",
                "Set Scaffold",
                "Frame Configuration",
                "Create Section View",
                "Edit Takeoff",
              ].map((tool) => (
                <KorbanButton
                  key={tool}
                  variant={activeTool === tool ? "tool-active" : "tool-inactive"}
                  onClick={() => activateTool(tool)}
                >
                  {tool}
                </KorbanButton>
              ))}

              <ActiveElevationMini
                activeElevation={activeElevation}
                setActiveElevation={setActiveElevation}
              />

              <KorbanStatusPill
                label="Scale"
                value={pageUnitsPerFoot ? "Locked" : "Not Set"}
                active={Boolean(pageUnitsPerFoot)}
              />

              {scaleMode && (
                <>
                  <input
                    value={knownScaleFeet}
                    onChange={(event) => setKnownScaleFeet(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") calibrateScale();
                    }}
                    placeholder={`ex: 20'-6"`}
                    className="w-32 rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-orange-500"
                  />
                  <KorbanButton variant="primary" className="px-3 py-1.5" onClick={calibrateScale}>
                    Set
                  </KorbanButton>
                  <KorbanButton variant="ghost" className="px-3 py-1.5" onClick={clearScale}>
                    Clear
                  </KorbanButton>
                  <KorbanStatusPill label="Points" value={`${scalePoints.length}/2`} />
                </>
              )}

              {overlayMode && pickTarget && (
                <KorbanStatusPill
                  label="Pick"
                  value={
                    pickTarget.type === "heightOverall"
                      ? `${pickTarget.elevation} Height`
                      : "Full Overlay"
                  }
                  active
                />
              )}
            </KorbanWorkspaceHud>

            {/* PDF controls - single row always, scrolls horizontally before wrapping */}
            <KorbanWorkspaceHud
              position="bottom-center"
              className="rounded-2xl border border-orange-500/20 bg-black/80 px-2 py-1.5 backdrop-blur"
              style={{ flexWrap: "nowrap", overflowX: "auto", maxWidth: "calc(100% - 2rem)", gap: "4px" }}
            >
              <span className="w-28 shrink-0 truncate rounded-full border border-orange-500/20 bg-black px-2 py-1 text-[9px] text-zinc-400">
                {pdfFileName || "No PDF"}
              </span>

              <KorbanButton
                variant="ghost"
                className="shrink-0 px-2 py-1 text-[9px]"
                disabled={!pdfDoc || pageNumber <= 1}
                onClick={() => { const p = Math.max(1, pageNumber - 1); setPageNumber(p); setPageJump(String(p)); }}
              >
                ‹
              </KorbanButton>

              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px]">
                <input
                  value={pageJump}
                  onChange={(e) => setPageJump(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") goToPage(); }}
                  className="w-8 rounded bg-zinc-950 px-1 py-0.5 text-center text-zinc-200 outline-none"
                />
                <span className="text-zinc-500">/{numPages || 0}</span>
                <button disabled={!pdfDoc} onClick={goToPage} className="rounded bg-zinc-900 px-1 py-0.5 text-zinc-300 disabled:opacity-40">Go</button>
              </div>

              <KorbanButton
                variant="ghost"
                className="shrink-0 px-2 py-1 text-[9px]"
                disabled={!pdfDoc || pageNumber >= numPages}
                onClick={() => { const p = Math.min(numPages, pageNumber + 1); setPageNumber(p); setPageJump(String(p)); }}
              >
                ›
              </KorbanButton>

              <KorbanButton variant="ghost" className="shrink-0 px-2 py-1 text-[9px]" disabled={!pdfDoc} onClick={() => setZoom((c) => Math.max(0.1, c - 0.1))}>−</KorbanButton>
              <span className="shrink-0 rounded-lg border border-zinc-800 bg-black/80 px-2 py-1 text-[9px] font-bold text-orange-300">{Math.round(zoom * 100)}%</span>
              <KorbanButton variant="ghost" className="shrink-0 px-2 py-1 text-[9px]" disabled={!pdfDoc} onClick={() => setZoom((c) => Math.min(3, c + 0.1))}>+</KorbanButton>
              <KorbanButton variant="ghost" className="shrink-0 px-2 py-1 text-[9px]" disabled={!pdfDoc} onClick={() => setZoom(0.25)}>Fit</KorbanButton>
              <KorbanButton variant="ghost" className="shrink-0 px-2 py-1 text-[9px]" disabled={!pdfDoc} onClick={() => setZoom(0.5)}>Width</KorbanButton>
            </KorbanWorkspaceHud>

            <div className="absolute inset-0 overflow-auto pb-24 pt-16">
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
                  <div className="rounded-[2rem] border border-zinc-800 bg-[#050505] p-12 text-center shadow-2xl">
                    <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-5xl text-orange-500">
                      +
                    </div>
                    <h2 className="text-lg font-semibold">Upload Plan PDF</h2>
                    <p className="mt-3 max-w-md text-xs leading-5 text-zinc-500">
                      Full-screen takeoff workspace for scale, overlays, elevations, and height references.
                    </p>
                  </div>
                </button>
              )}

              {pdfDoc && (
                <div className="relative z-10 flex min-h-full min-w-max justify-center p-10">
                  <div
                    ref={canvasContainerRef}
                    onClick={handleWorkspaceClick}
                    className={`relative h-fit rounded-[2rem] border border-zinc-800 bg-[#050505] p-4 shadow-2xl ${
                      referencePickMode ? "cursor-crosshair ring-2 ring-yellow-400/40" :
                      scaleMode || overlayMode ? "cursor-crosshair" : ""
                    }`}
                  >
                    <div className="overflow-hidden rounded-[1.25rem] bg-white p-4 shadow-inner">
                      <canvas ref={canvasRef} />
                    </div>

                    {!pageUnitsPerFoot && scalePoints.map((point, index) => (
                      <Marker
                        key={`scale-${index}`}
                        point={point}
                        label={`S${index + 1}`}
                        zoom={zoom}
                        canvasRef={canvasRef}
                      />
                    ))}

                    {!pageUnitsPerFoot && scalePoints.length === 2 && (
                      <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                        <line
                          x1={scalePoints[0].x * zoom + (canvasRef.current?.offsetLeft ?? 32)}
                          y1={scalePoints[0].y * zoom + (canvasRef.current?.offsetTop ?? 32)}
                          x2={scalePoints[1].x * zoom + (canvasRef.current?.offsetLeft ?? 32)}
                          y2={scalePoints[1].y * zoom + (canvasRef.current?.offsetTop ?? 32)}
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
                        canvasRef={canvasRef}
                      />
                    ))}

                    {drawOverlayPolyline(
                      tracePoints,
                      traceClosed || overlayLockedOpen,
                      getActivePickColor(),
                      "current",
                      pickTarget?.type !== "full",
                    )}

                    {/* Reference point marker — crosshair with yellow glow */}
                    {referencePoint && (() => {
                      const ox = canvasRef.current?.offsetLeft ?? 32;
                      const oy = canvasRef.current?.offsetTop ?? 32;
                      const rx = referencePoint.x * zoom + ox;
                      const ry = referencePoint.y * zoom + oy;
                      return (
                        <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full">
                          <line x1={rx - 12} y1={ry} x2={rx + 12} y2={ry} stroke="#facc15" strokeWidth="1.5" opacity="0.9" />
                          <line x1={rx} y1={ry - 12} x2={rx} y2={ry + 12} stroke="#facc15" strokeWidth="1.5" opacity="0.9" />
                          <circle cx={rx} cy={ry} r="4" fill="none" stroke="#facc15" strokeWidth="1.5" opacity="0.9" />
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </>
        }
        rail={
          <TakeoffHub
            fullOverlayRows={fullOverlayRows}
            updateFullOverlayRow={updateFullOverlayRow}
            addFullOverlayRow={addFullOverlayRow}
            removeFullOverlayRow={removeFullOverlayRow}
            startPick={startPick}
            closePick={closePick}
            storePick={storePick}
            clearPick={clearPick}
            activeElevation={activeElevation}
            setActiveElevation={setActiveElevation}
            elevationHeights={elevationHeights}
            duplicateElevationHeights={duplicateElevationHeights}
            setDuplicateElevationHeights={setDuplicateElevationHeights}
            updateElevationHeight={updateElevationHeight}
            storeManualOverallHeight={storeManualOverallHeight}
            storeAllHeights={storeAllHeights}
            keyFloorLf={keyFloorLf}
            tolerancePercent={tolerancePercent}
            pickTarget={pickTarget}
            tracePoints={tracePoints}
            tracedLinealFeet={tracedLinealFeet}
            traceClosed={traceClosed}
            overlayLockedOpen={overlayLockedOpen}
            scaleReady={Boolean(pageUnitsPerFoot)}
            setShowCombinedOverlay={setShowCombinedOverlay}
            showCombinedOverlay={showCombinedOverlay}
            saveToEstimateReview={saveToEstimateReview}
            elevationBreakdownRows={elevationBreakdownRows}
            updateElevationBreakdownRow={updateElevationBreakdownRow}
            storeElevationBreakdownRow={storeElevationBreakdownRow}
            referencePoint={referencePoint}
            setReferencePoint={setReferencePoint}
            referencePickMode={referencePickMode}
            setReferencePickMode={setReferencePickMode}
            undoLastPoint={undoLastPoint}
            colorPickerOpenId={colorPickerOpenId}
            setColorPickerOpenId={setColorPickerOpenId}
          />
        }
      />
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
  activeElevation,
  setActiveElevation,
  elevationHeights,
  duplicateElevationHeights,
  setDuplicateElevationHeights,
  updateElevationHeight,
  storeManualOverallHeight,
  storeAllHeights,
  keyFloorLf,
  tolerancePercent,
  pickTarget,
  tracePoints,
  tracedLinealFeet,
  traceClosed,
  overlayLockedOpen,
  scaleReady,
  setShowCombinedOverlay,
  showCombinedOverlay,
  saveToEstimateReview,
  elevationBreakdownRows,
  updateElevationBreakdownRow,
  storeElevationBreakdownRow,
  referencePoint,
  setReferencePoint,
  referencePickMode,
  setReferencePickMode,
  undoLastPoint,
  colorPickerOpenId,
  setColorPickerOpenId,
}: {
  fullOverlayRows: FullOverlayRow[];
  updateFullOverlayRow: (id: number, updates: Partial<FullOverlayRow>) => void;
  addFullOverlayRow: (type?: FullOverlayType) => void;
  removeFullOverlayRow: (id: number) => void;
  startPick: (target: PickTarget) => void;
  closePick: () => void;
  storePick: () => void;
  clearPick: () => void;
  activeElevation: ElevationName;
  setActiveElevation: (elevation: ElevationName) => void;
  elevationHeights: ElevationHeight[];
  duplicateElevationHeights: Record<"North" | "East", boolean>;
  setDuplicateElevationHeights: React.Dispatch<React.SetStateAction<Record<"North" | "East", boolean>>>;
  updateElevationHeight: (elevation: ElevationName, updates: Partial<ElevationHeight>) => void;
  storeManualOverallHeight: (elevation: ElevationName) => void;
  storeAllHeights: () => void;
  keyFloorLf: number;
  tolerancePercent: number;
  pickTarget: PickTarget;
  tracePoints: Point[];
  tracedLinealFeet: number;
  traceClosed: boolean;
  overlayLockedOpen: boolean;
  scaleReady: boolean;
  setShowCombinedOverlay: (value: boolean) => void;
  showCombinedOverlay: boolean;
  saveToEstimateReview: () => void;
  elevationBreakdownRows: StoredElevationBreakdownRow[];
  updateElevationBreakdownRow: (elevation: ElevationName, approxLinearFeet: number) => void;
  storeElevationBreakdownRow: (elevation: ElevationName) => void;
  referencePoint: Point | null;
  setReferencePoint: (point: Point | null) => void;
  referencePickMode: boolean;
  setReferencePickMode: (mode: boolean) => void;
  undoLastPoint: () => void;
  colorPickerOpenId: number | null;
  setColorPickerOpenId: (id: number | null) => void;
}) {
  return (
    <div className="space-y-4">
      <KorbanPanel title="Take Off Hub" compact className="border-orange-500/20">
        <div className="mb-3 flex justify-end">
          <KorbanButton variant="ghost" className="px-3 py-1 text-[10px]" onClick={() => setShowCombinedOverlay(!showCombinedOverlay)}>
            {showCombinedOverlay ? "Hide Preview" : "Show Preview"}
          </KorbanButton>
        </div>

        <div
          className={`transition ${scaleReady ? "opacity-100" : "pointer-events-none opacity-35"}`}
          title={scaleReady ? "" : "Set scale to unlock Take Off Hub"}
        >
          {/* Full Overlay */}
          <KorbanPanel title="Full Overlay" compact>
            {/* Clickable legend — click to bring layer to front visually */}
            <div className="mb-3 flex flex-wrap gap-2">
              {fullOverlayRows.filter(r => r.linealFeet > 0 || r.points.length > 0).map((row) => (
                <button
                  key={`legend-${row.id}`}
                  onClick={() => updateFullOverlayRow(row.id, { isKeyFloor: row.isKeyFloor })}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-black/60 px-2 py-1 text-[9px] text-zinc-400 hover:border-orange-500/30 hover:text-zinc-200"
                  title="Click to bring to front"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: overlayColorFor(row) }} />
                  {row.level}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {fullOverlayRows.map((row) => {
                const isActiveFullPick = pickTarget?.type === "full" && pickTarget.id === row.id;
                const hasPendingFullMeasure = isActiveFullPick && tracePoints.length >= 2 && (traceClosed || overlayLockedOpen);
                const displayLf = hasPendingFullMeasure ? tracedLinealFeet : row.linealFeet;
                const isStored = row.linealFeet > 0 && !hasPendingFullMeasure;
                const isColorOpen = colorPickerOpenId === row.id;

                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border bg-zinc-950/80 p-3 ${hasPendingFullMeasure ? "border-yellow-300/40 shadow-[0_0_18px_rgba(234,179,8,0.20)]" : "border-zinc-800"}`}
                  >
                    <div className="grid grid-cols-[auto_14px_minmax(0,1fr)_104px] items-center gap-2 text-xs">
                      <label className="flex items-center gap-1 text-zinc-500">
                        <input
                          type="checkbox"
                          checked={row.isKeyFloor}
                          disabled={row.overlayType !== "Level"}
                          onChange={() => updateFullOverlayRow(row.id, { isKeyFloor: true })}
                          className="accent-orange-500 disabled:opacity-30"
                        />
                        Main
                      </label>
                      {/* Color dot — click to open 32-color picker */}
                      <button
                        onClick={() => setColorPickerOpenId(isColorOpen ? null : row.id)}
                        className="h-3 w-3 rounded-full border border-zinc-700 hover:scale-125 transition-transform"
                        style={{ background: overlayColorFor(row) }}
                        title="Change color"
                      />
                      <input
                        value={row.level}
                        onChange={(event) => updateFullOverlayRow(row.id, { level: event.target.value })}
                        className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-zinc-200 outline-none focus:border-orange-500"
                        placeholder="Level"
                      />
                      <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-right font-mono ${hasPendingFullMeasure ? "bg-yellow-300/10 text-yellow-300 shadow-[0_0_14px_rgba(234,179,8,0.22)]" : "text-orange-400"}`}>
                        {displayLf > 0 ? formatFeetInches(displayLf) : "--"}
                      </span>
                    </div>

                    {/* 32-color grid picker */}
                    {isColorOpen && (
                      <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                        <div className="grid grid-cols-8 gap-1">
                          {overlayColors.map((color) => (
                            <button
                              key={color}
                              onClick={() => {
                                updateFullOverlayRow(row.id, { color });
                                setColorPickerOpenId(null);
                              }}
                              className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-125"
                              style={{
                                background: color,
                                borderColor: row.color === color ? "#f97316" : "transparent",
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => startPick({ type: "full", id: row.id })}
                        className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${isActiveFullPick && !hasPendingFullMeasure ? "animate-pulse border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)]" : "border-zinc-800"}`}
                      >
                        Start
                      </button>
                      <button onClick={closePick} className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50">
                        Close
                      </button>
                      <button
                        onClick={storePick}
                        className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${isStored ? "border border-white/25 bg-white/5 text-white" : "bg-orange-500 text-black hover:bg-orange-400"}`}
                      >
                        Store
                      </button>
                      <button onClick={() => removeFullOverlayRow(row.id)} className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:border-red-500/40 hover:text-red-300">
                        Remove
                      </button>
                    </div>

                    {/* Undo Point — only shown when this row is actively being traced */}
                    {isActiveFullPick && tracePoints.length > 0 && (
                      <button
                        onClick={undoLastPoint}
                        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
                      >
                        ↩ Undo Point ({tracePoints.length} placed)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => addFullOverlayRow("Level")} className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/20">+ Level</button>
              <button onClick={() => addFullOverlayRow("Roof")} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">+ Roof</button>
              <button onClick={() => addFullOverlayRow("Penthouse")} className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20">+ Penthouse</button>
              <button onClick={() => addFullOverlayRow("Basement")} className="rounded-xl border border-orange-300/30 bg-orange-300/10 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-300/20">+ Basement</button>
            </div>
          </KorbanPanel>

          {/* Reference Point — anchor that aligns all overlays from any page/session */}
          <KorbanPanel
            title="Reference Point"
            subtitle="Anchor point — aligns overlays from same or different pages"
            compact
          >
            <div className="space-y-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-600">Anchor</span>
                  <span className={`font-mono text-xs ${referencePoint ? "text-yellow-300" : "text-zinc-600"}`}>
                    {referencePoint
                      ? `X: ${Math.round(referencePoint.x)}  Y: ${Math.round(referencePoint.y)}`
                      : "Not Set"}
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-zinc-600">
                  Click "Pick" then click once on a known fixed point on the plan — a column, corner, or grid intersection. Every overlay will align to this point so traces from different pages stack correctly.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setReferencePickMode(true)}
                  className={`rounded-xl border px-3 py-2 text-[10px] font-semibold transition ${
                    referencePickMode
                      ? "animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                      : "border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                  }`}
                >
                  {referencePickMode ? "Click on Plan..." : "Pick Reference"}
                </button>
                <button
                  onClick={() => { setReferencePoint(null); setReferencePickMode(false); }}
                  disabled={!referencePoint}
                  className="rounded-xl border border-zinc-800 px-3 py-2 text-[10px] font-semibold text-zinc-400 hover:border-red-500/30 hover:text-red-400 disabled:opacity-30"
                >
                  Clear
                </button>
              </div>
              {referencePoint && (
                <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-3 py-2 text-[10px] text-yellow-300">
                  ✓ Reference locked — all overlays will align to this anchor
                </div>
              )}
            </div>
          </KorbanPanel>

          {/* Elevation Heights — store works with direct input OR pick points */}
          <KorbanPanel title="Elevation Heights" compact>
            <div className="space-y-2">
              {elevationHeights.map((item) => {
                const isActive = activeElevation === item.elevation;
                const isOverallPickActive = pickTarget?.type === "heightOverall" && pickTarget.elevation === item.elevation;
                const hasPendingOverall = isOverallPickActive && tracePoints.length >= 2 && (traceClosed || overlayLockedOpen);
                const overallDisplay = hasPendingOverall ? formatFeetInches(tracedLinealFeet) : item.overallHeightInput;

                return (
                  <div
                    key={item.elevation}
                    onClick={() => setActiveElevation(item.elevation)}
                    className={`cursor-pointer rounded-xl border p-3 transition-all ${
                      isActive
                        ? "border-orange-500/40 bg-orange-500/5 shadow-[0_0_18px_rgba(249,115,22,0.12)]"
                        : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isActive ? "text-orange-300" : "text-zinc-200"}`}>
                        {item.elevation}
                      </span>
                      {canDuplicateOpposite(item.elevation) && (
                        <label
                          className="flex items-center gap-1.5 text-[10px] text-zinc-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={duplicateElevationHeights[item.elevation]}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setDuplicateElevationHeights((current) => ({
                                ...current,
                                [item.elevation]: checked,
                              }));
                              // Immediately populate opposite elevation when checked
                              if (checked) {
                                const opposite = getOppositeElevation(item.elevation);
                                if (opposite) {
                                  updateElevationHeight(opposite, {
                                    overallHeightInput: item.overallHeightInput,
                                    belowGradeEnabled: item.belowGradeEnabled,
                                    belowGradeInput: item.belowGradeInput,
                                  });
                                }
                              }
                            }}
                            className="accent-orange-500"
                          />
                          Duplicate to {getOppositeElevation(item.elevation)}
                        </label>
                      )}
                    </div>

                    {/* Overall height — direct input works, Enter stores */}
                    <div className={`grid grid-cols-[1fr_96px] items-center gap-2 ${hasPendingOverall ? "rounded-lg bg-yellow-300/5 p-1" : ""}`}>
                      <span className="text-[10px] uppercase tracking-widest text-zinc-600">Height</span>
                      <input
                        value={overallDisplay}
                        onChange={(event) => {
                          setActiveElevation(item.elevation);
                          updateElevationHeight(item.elevation, { overallHeightInput: event.target.value });
                        }}
                        onFocus={() => setActiveElevation(item.elevation)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") storeManualOverallHeight(item.elevation);
                        }}
                        onClick={(e) => { e.stopPropagation(); setActiveElevation(item.elevation); }}
                        className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-xs text-orange-300 outline-none focus:border-orange-500"
                        placeholder="0'"
                      />
                    </div>

                    {/* Below grade */}
                    <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2">
                      <label
                        className="flex items-center gap-1.5 text-[10px] text-zinc-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={item.belowGradeEnabled}
                          onChange={(event) => updateElevationHeight(item.elevation, { belowGradeEnabled: event.target.checked })}
                          className="accent-orange-500"
                        />
                        Below Grade
                      </label>
                      <input
                        value={item.belowGradeInput}
                        onChange={(event) => updateElevationHeight(item.elevation, { belowGradeInput: event.target.value })}
                        onFocus={() => setActiveElevation(item.elevation)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") storeManualOverallHeight(item.elevation);
                        }}
                        onClick={(e) => { e.stopPropagation(); setActiveElevation(item.elevation); }}
                        disabled={!item.belowGradeEnabled}
                        className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500 disabled:opacity-35"
                        placeholder="0'"
                      />
                    </div>

                    {/* PDF pick buttons + Store — Start / Close / Store */}
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); startPick({ type: "heightOverall", elevation: item.elevation }); }}
                        className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${isOverallPickActive && !hasPendingOverall ? "animate-pulse border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)]" : "border-zinc-800"}`}
                      >
                        Start
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); closePick(); }}
                        className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
                      >
                        Close
                      </button>
                      {/* Store — works with direct input OR after PDF pick */}
                      {(() => {
                        const heightVal = parseFeetInches(item.overallHeightInput);
                        const isHeightStored = heightVal !== null && heightVal > 0 && !hasPendingOverall;
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); hasPendingOverall ? storePick() : storeManualOverallHeight(item.elevation); }}
                            className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                              hasPendingOverall
                                ? "bg-yellow-400 text-black hover:bg-yellow-300"
                                : isHeightStored
                                ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : "border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                            }`}
                          >
                            {isHeightStored ? "✓ Stored" : "Store"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Store All — saves all 4 elevations in one atomic write */}
            <button
              onClick={storeAllHeights}
              className="mt-3 w-full rounded-xl border border-orange-500/40 bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/25"
            >
              Store All Heights
            </button>
          </KorbanPanel>

          {/* Elevation Breakdown — tight layout so store button stays inside boundary */}
          <KorbanPanel
            title="Elevation Breakdown"
            subtitle="Optional — cross-check only, does not affect ticks or counts"
            compact
          >
            <div className="space-y-2">
              {elevationBreakdownRows.map((row) => (
                <div
                  key={row.elevation}
                  className="grid grid-cols-[44px_1fr_44px] items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-2"
                >
                  <span className="text-xs font-semibold text-zinc-300">{row.elevation}</span>
                  <input
                    value={row.approxLinearFeet || ""}
                    onChange={(event) =>
                      updateElevationBreakdownRow(
                        row.elevation as ElevationName,
                        Number(event.target.value.replace(/[^0-9.]/g, "") || 0),
                      )
                    }
                    inputMode="numeric"
                    placeholder="LF"
                    className="w-full rounded-lg border border-zinc-800 bg-black px-1.5 py-1 text-right text-xs text-orange-300 outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={() => storeElevationBreakdownRow(row.elevation as ElevationName)}
                    className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-1 py-1 text-[9px] font-semibold text-orange-300 hover:bg-orange-500/20"
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-zinc-600">
              Used in Estimate Review for Partial Exterior Cost comparison only.
            </p>
          </KorbanPanel>

          {/* Takeoff Viewer */}
          <KorbanPanel title="Takeoff Viewer" compact>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <TakeoffViewer
                fullOverlayRows={fullOverlayRows}
                elevationHeights={elevationHeights}
              />
              <div className="mt-3 space-y-1 text-xs">
                <MetaRow label="Key Floor LF" value={formatFeetInches(keyFloorLf)} />
                <MetaRow label="Avg. Exterior Height" value={formatFeetInches(getAverageExteriorHeight(elevationHeights))} />
                {elevationOptions.map((elevation) => {
                  const height = elevationHeights.find((item) => item.elevation === elevation);
                  if (!height) return null;
                  return (
                    <MetaRow
                      key={elevation}
                      label={`${elevation} Height`}
                      value={formatFeetInches(getHeightWithBelowGrade(height))}
                    />
                  );
                })}
              </div>
            </div>
            <KorbanButton variant="primary" block className="mt-3" onClick={() => { saveToEstimateReview(); window.location.href = "/set-scaffold"; }}>
              Save & Continue
            </KorbanButton>
          </KorbanPanel>
        </div>
      </KorbanPanel>
    </div>
  );
}

function TakeoffViewer({
  fullOverlayRows,
  elevationHeights,
}: {
  fullOverlayRows: FullOverlayRow[];
  elevationHeights: ElevationHeight[];
}) {
  const drawableFullRows = fullOverlayRows.filter((row) => row.points.length >= 2);

  if (drawableFullRows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-[10px] text-zinc-600">
        Stored takeoff will appear here.
      </div>
    );
  }

  const allPoints = drawableFullRows.flatMap((row) => row.points);
  const hasPointGeometry = allPoints.length >= 2;

  const minX = hasPointGeometry ? Math.min(...allPoints.map((point) => point.x)) : 0;
  const maxX = hasPointGeometry ? Math.max(...allPoints.map((point) => point.x)) : 1;
  const minY = hasPointGeometry ? Math.min(...allPoints.map((point) => point.y)) : 0;
  const maxY = hasPointGeometry ? Math.max(...allPoints.map((point) => point.y)) : 1;

  const geometryWidth = Math.max(1, maxX - minX);
  const geometryHeight = Math.max(1, maxY - minY);
  const availableWidth = 224;
  const availableHeight = 96;
  const scale = Math.min(availableWidth / geometryWidth, availableHeight / geometryHeight);
  const drawnWidth = geometryWidth * scale;
  const drawnHeight = geometryHeight * scale;
  const offsetX = 28 + (availableWidth - drawnWidth) / 2;
  const offsetY = 28 + (availableHeight - drawnHeight) / 2;

  function mapStoredPoint(point: Point) {
    const x = offsetX + (point.x - minX) * scale;
    const y = offsetY + (point.y - minY) * scale;
    return `${x},${y}`;
  }

  function mappedPointTuple(point: Point) {
    const [x, y] = mapStoredPoint(point).split(",").map(Number);
    return { x, y };
  }

  return (
    <div className="rounded-lg border border-orange-500/10 bg-[linear-gradient(to_right,rgba(249,115,22,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(249,115,22,0.14)_1px,transparent_1px)] bg-[size:20px_20px] p-2">
      <svg viewBox="0 0 280 160" className="h-40 w-full rounded border border-zinc-800 bg-black/70">
        {drawableFullRows.map((row, index) => {
          const hasGeometry = row.points.length >= 2;
          const lastPoint = row.points[row.points.length - 1];
          const firstPoint = row.points[0];
          const lastMapped = lastPoint ? mappedPointTuple(lastPoint) : null;
          const firstMapped = firstPoint ? mappedPointTuple(firstPoint) : null;

          return (
            <g key={row.id} opacity={row.isKeyFloor ? 1 : 0.86}>
              {hasGeometry && (
                <>
                  <polyline
                    points={row.points.map((point) => mapStoredPoint(point)).join(" ")}
                    fill="none"
                    stroke={overlayColorFor(row)}
                    strokeWidth={row.isKeyFloor ? 4 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {row.closed && row.points.length > 2 && lastMapped && firstMapped && (
                    <line
                      x1={lastMapped.x} y1={lastMapped.y}
                      x2={firstMapped.x} y2={firstMapped.y}
                      stroke={overlayColorFor(row)}
                      strokeWidth={row.isKeyFloor ? 4 : 3}
                      strokeLinecap="round"
                    />
                  )}
                </>
              )}
              <text x="12" y={14 + index * 11} fill={overlayColorFor(row)} fontSize="8" fontWeight="700">
                {row.isKeyFloor ? "MAIN · " : ""}{row.level} · {formatFeetInches(row.linealFeet)}
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
      <span className="px-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">Elevation</span>
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

function Marker({ point, label, zoom, canvasRef }: { point: Point; label: string; zoom: number; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  // Compute position relative to the click container (the outer rounded div)
  // by using the canvas element's offsetLeft/offsetTop within its parent chain
  const canvas = canvasRef.current;
  // The canvas sits inside: outer-div(p-4=16) > white-div(p-4=16) > canvas
  // So canvas is offset 32px from the outer click target's top-left
  const containerPadding = canvas ? (canvas.offsetLeft) : 32;
  const containerPaddingY = canvas ? (canvas.offsetTop) : 32;
  return (
    <div
      className="absolute z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-[10px] font-bold text-black"
      style={{ left: point.x * zoom + containerPadding, top: point.y * zoom + containerPaddingY }}
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
