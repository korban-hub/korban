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
  setActiveProjectId,
  type ProjectElevation,
} from "@/lib/projectStore";

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
  pageNumber: number;
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
  heightInput: string;
  coveragePercent: number;
};

type ElevationHeight = {
  elevation: ElevationName;
  overallHeightInput: string;
  belowGradeEnabled: boolean;
  belowGradeInput: string;
  multipleHeights: boolean;
  areas: HeightArea[];
};

const elevationOptions: ElevationName[] = ["North", "East", "South", "West"];
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
    belowGradeEnabled: false,
    belowGradeInput: "0'",
    multipleHeights: false,
    areas: buildDefaultHeightAreas(),
  }),
);

const levelSuggestions = ["Basement", "Ground", "Level", "Roof", "Penthouse"];

const takeoffMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/projects", label: "Projects" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

function buildDefaultHeightAreas(): HeightArea[] {
  return [
    {
      id: "left",
      label: "Left",
      heightInput: "0'",
      coveragePercent: 33,
    },
    {
      id: "center",
      label: "Center",
      heightInput: "0'",
      coveragePercent: 34,
    },
    {
      id: "right",
      label: "Right",
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
    .map((item) => {
      if (item.multipleHeights) {
        const weighted = item.areas.reduce((sum, area) => {
          const height = parseFeetInches(area.heightInput) ?? 0;
          return sum + height * (area.coveragePercent / 100);
        }, 0);
        const below = item.belowGradeEnabled ? parseFeetInches(item.belowGradeInput) ?? 0 : 0;
        return weighted + below;
      }
      return getHeightWithBelowGrade(item);
    })
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
  const [elevationRefs, setElevationRefs] =
    useState<ElevationReference[]>(initialElevationRefs);
  const [elevationHeights, setElevationHeights] = useState<ElevationHeight[]>(
    initialElevationHeights,
  );
  const [activeElevation, setActiveElevation] =
    useState<ElevationName>("North");
  const [activeProjectName, setActiveProjectName] = useState("Takeoff Workspace Draft");
  const [duplicateElevationRefs, setDuplicateElevationRefs] = useState<Record<"North" | "East", boolean>>({
    North: false,
    East: false,
  });
  const [duplicateElevationHeights, setDuplicateElevationHeights] = useState<Record<"North" | "East", boolean>>({
    North: false,
    East: false,
  });
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

  useEffect(() => {
    setActiveProjectId(getActiveProjectId());
    setActiveProjectName(getActiveProject().projectName || "Takeoff Workspace Draft");
  }, []);

  function buildWorkspaceElevation(
    elevation: ElevationName,
    refs: ElevationReference[] = elevationRefs,
    heights: ElevationHeight[] = elevationHeights,
    overlayRows: FullOverlayRow[] = fullOverlayRows,
  ): ProjectElevation {
    const ref = refs.find((item) => item.elevation === elevation) ?? refs[0];
    const height = heights.find((item) => item.elevation === elevation) ?? heights[0];
    const levelRow = overlayRows.find((row) => row.isKeyFloor) ?? overlayRows[0];
    const currentKeyFloorLf = levelRow?.linealFeet ?? 0;
    const currentTotalElevationLf = refs.reduce((sum, item) => sum + item.linealFeet, 0);
    const manualLinearFeet = ref ? parseFeetInches(ref.manualLinealFeetInput) : null;
    const enteredWallHeight = height ? getHeightWithBelowGrade(height) : 0;
    const linearFeetSource =
      manualLinearFeet && manualLinearFeet > 0
        ? manualLinearFeet
        : ref?.linealFeet || currentKeyFloorLf || currentTotalElevationLf || 0;
    const linearFeet = Math.round(linearFeetSource);
    const wallHeight = enteredWallHeight || getAverageExteriorHeight(heights);
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
    });
    const scale = {
      keyFloorLf: currentKeyFloorLf,
      source: ref?.source ?? "Not Set",
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
      wallSegments: refs.filter((item) => item.points.length >= 2).map((item) => item.points),
      referencePoints: scalePoints,
      elevationPoints: ref?.points ?? [],
      fullOverlayRows: overlayRows,
      elevationRefs: refs,
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
    refs: ElevationReference[] = elevationRefs,
    heights: ElevationHeight[] = elevationHeights,
    overlayRows: FullOverlayRow[] = fullOverlayRows,
  ) {
    const project = getActiveProject();
    const nextElevation = buildWorkspaceElevation(elevation, refs, heights, overlayRows);
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
      saveWorkspaceElevation(activeElevation, elevationRefs, elevationHeights, nextFullOverlayRows);
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

      const duplicatedElevation = getOppositeElevation(pickTarget.elevation);
const duplicatedElevationRefs =
        canDuplicateOpposite(pickTarget.elevation) &&
        duplicateElevationRefs[pickTarget.elevation] &&
        duplicatedElevation
          ? nextElevationRefs.map((item) =>
              item.elevation === duplicatedElevation
                ? {
                    ...item,
                    points: [],
                    closed: false,
                    linealFeet: tracedLinealFeet,
                    manualLinealFeetInput: formatFeetInches(tracedLinealFeet),
source: "Manual" as const,
                  }
                : item,
            )
          : nextElevationRefs;

      const typedDuplicatedElevationRefs = duplicatedElevationRefs as ElevationReference[];
      const nextTotal = typedDuplicatedElevationRefs.reduce(
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
          "Per backend settings, your overlay variance exceeds the allowed tolerance of error. Would you like to redo?",
        );

        if (redo) {
          return;
        }
      }

      setElevationRefs(typedDuplicatedElevationRefs);
      saveWorkspaceElevation(pickTarget.elevation, typedDuplicatedElevationRefs, elevationHeights);
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

    const duplicatedElevation = getOppositeElevation(elevation);
    const duplicatedElevationRefs =
      canDuplicateOpposite(elevation) && duplicateElevationRefs[elevation] && duplicatedElevation
        ? nextElevationRefs.map((item) =>
            item.elevation === duplicatedElevation
              ? {
                  ...item,
                  points: [],
                  closed: false,
                  linealFeet: parsed,
                  manualLinealFeetInput: formatFeetInches(parsed),
                  source: "Manual",
                }
              : item,
          )
        : nextElevationRefs;

    const typedDuplicatedElevationRefs = duplicatedElevationRefs as ElevationReference[];
    const nextTotal = typedDuplicatedElevationRefs.reduce(
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
        "Per backend settings, your overlay variance exceeds the allowed tolerance of error. Would you like to redo?",
      );

      if (redo) return;
    }

    setElevationRefs(typedDuplicatedElevationRefs);
    saveWorkspaceElevation(elevation, typedDuplicatedElevationRefs, elevationHeights);
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

  function duplicateHeightToOpposite(elevation: ElevationName, source: ElevationHeight) {
    const opposite = getOppositeElevation(elevation);
    if (!opposite || !canDuplicateOpposite(elevation) || !duplicateElevationHeights[elevation]) return;

    updateElevationHeight(opposite, {
      overallHeightInput: source.overallHeightInput,
      belowGradeEnabled: source.belowGradeEnabled,
      belowGradeInput: source.belowGradeInput,
      multipleHeights: source.multipleHeights,
      areas: source.areas.map((area) => ({ ...area })),
    });
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

    updateElevationHeight(elevation, {
      overallHeightInput: nextItem.overallHeightInput,
    });
    duplicateHeightToOpposite(elevation, nextItem);
    saveWorkspaceElevation(
      elevation,
      elevationRefs,
      elevationHeights.map((item) => (item.elevation === elevation ? nextItem : item)),
    );
  }

  function storeManualAreaHeight(elevation: ElevationName, areaId: string) {
    const currentElevation = elevationHeights.find((item) => item.elevation === elevation);
    const currentArea = currentElevation?.areas.find((area) => area.id === areaId);

    if (!currentElevation || !currentArea) return;

    const parsed = parseFeetInches(currentArea.heightInput);

    if (parsed === null || parsed < 0) {
      alert(`Enter ${elevation} area height as feet and inches, like 28'-0" or 28'.`);
      return;
    }

    const nextAreas = currentElevation.areas.map((area) =>
      area.id === areaId ? { ...area, heightInput: formatFeetInches(parsed) } : area,
    );
    const nextItem = { ...currentElevation, areas: nextAreas };

    updateHeightArea(elevation, areaId, {
      heightInput: formatFeetInches(parsed),
    });
    duplicateHeightToOpposite(elevation, nextItem);
    saveWorkspaceElevation(
      elevation,
      elevationRefs,
      elevationHeights.map((item) => (item.elevation === elevation ? nextItem : item)),
    );
  }

  function saveToEstimateReview() {
    const payload = {
      keyFloorLf,
      elevationRefs,
      elevationHeights,
    };
    const activeProjectId = getActiveProjectId();
    const sharedElevation = buildWorkspaceElevation(activeElevation);
    const totalLinearFeet = sharedElevation.linearFeet;
    const averageExteriorHeight = getAverageExteriorHeight(elevationHeights);
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
      takeoff: {
        ...payload,
        fullOverlayRows,
      },
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
      JSON.stringify({
        ...storedProjectEstimates,
        [activeProjectId]: estimateDraft,
      }),
    );
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
            <KorbanButton variant="primary" onClick={saveToEstimateReview}>
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

              {[
                "Scale",
                "Overlay",
                "Frame Configuration",
                "Set Scaffold",
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
                    pickTarget.type === "heightOverall" || pickTarget.type === "heightArea"
                      ? `${pickTarget.elevation} Height`
                      : pickTarget.type === "full"
                        ? "Full Overlay"
                        : `${pickTarget.elevation} Elevation`
                  }
                  active
                />
              )}
            </KorbanWorkspaceHud>

            <KorbanWorkspaceHud position="bottom-right" className="max-w-none rounded-2xl border border-orange-500/20 bg-black/80 px-3 py-2 backdrop-blur">
              <span className="max-w-[180px] truncate rounded-full border border-orange-500/20 bg-black px-3 py-1.5 text-[10px] text-zinc-400">
                {pdfFileName || "No PDF Loaded"}
              </span>

              <KorbanButton
                variant="ghost"
                className="px-2 py-1.5 text-[10px]"
                disabled={!pdfDoc || pageNumber <= 1}
                onClick={() => {
                  const nextPage = Math.max(1, pageNumber - 1);
                  setPageNumber(nextPage);
                  setPageJump(String(nextPage));
                }}
              >
                Prev
              </KorbanButton>

              <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-[10px]">
                <input
                  value={pageJump}
                  onChange={(event) => setPageJump(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") goToPage();
                  }}
                  className="w-10 rounded bg-zinc-950 px-1 py-0.5 text-center text-zinc-200 outline-none"
                />
                <span className="text-zinc-500">/ {numPages || 0}</span>
                <button
                  disabled={!pdfDoc}
                  onClick={goToPage}
                  className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-300 disabled:opacity-40"
                >
                  Go
                </button>
              </div>

              <KorbanButton
                variant="ghost"
                className="px-2 py-1.5 text-[10px]"
                disabled={!pdfDoc || pageNumber >= numPages}
                onClick={() => {
                  const nextPage = Math.min(numPages, pageNumber + 1);
                  setPageNumber(nextPage);
                  setPageJump(String(nextPage));
                }}
              >
                Next
              </KorbanButton>

              <KorbanButton
                variant="ghost"
                className="px-2 py-1.5 text-[10px]"
                disabled={!pdfDoc}
                onClick={() => setZoom((current) => Math.max(0.1, current - 0.1))}
              >
                -
              </KorbanButton>
              <KorbanStatusPill label="Zoom" value={`${Math.round(zoom * 100)}%`} />
              <KorbanButton
                variant="ghost"
                className="px-2 py-1.5 text-[10px]"
                disabled={!pdfDoc}
                onClick={() => setZoom((current) => Math.min(3, current + 0.1))}
              >
                +
              </KorbanButton>
              <KorbanButton variant="ghost" className="px-2 py-1.5 text-[10px]" disabled={!pdfDoc} onClick={() => setZoom(0.25)}>
                Fit Page
              </KorbanButton>
              <KorbanButton variant="ghost" className="px-2 py-1.5 text-[10px]" disabled={!pdfDoc} onClick={() => setZoom(0.5)}>
                Fit Width
              </KorbanButton>
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
                    <h2 className="text-2xl font-semibold">Upload Plan PDF</h2>
                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                      Full-screen takeoff workspace for scale, overlays, elevations, and height references.
                    </p>
                  </div>
                </button>
              )}

              {pdfDoc && (
                <div className="relative z-10 flex min-h-full min-w-max justify-center p-10">
                  <div
                    onClick={handleWorkspaceClick}
                    className={`relative h-fit rounded-[2rem] border border-zinc-800 bg-[#050505] p-4 shadow-2xl ${scaleMode || overlayMode ? "cursor-crosshair" : ""}`}
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
                      />
                    ))}

                    {!pageUnitsPerFoot && scalePoints.length === 2 && (
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
              elevationRefs={elevationRefs}
              updateElevationReference={updateElevationReference}
              storeManualElevationReference={storeManualElevationReference}
              activeElevation={activeElevation}
              setActiveElevation={setActiveElevation}
              duplicateElevationRefs={duplicateElevationRefs}
              setDuplicateElevationRefs={setDuplicateElevationRefs}
              elevationHeights={elevationHeights}
              duplicateElevationHeights={duplicateElevationHeights}
              setDuplicateElevationHeights={setDuplicateElevationHeights}
              updateElevationHeight={updateElevationHeight}
              updateHeightArea={updateHeightArea}
              storeManualOverallHeight={storeManualOverallHeight}
              storeManualAreaHeight={storeManualAreaHeight}
              keyFloorLf={keyFloorLf}
              totalElevationLf={totalElevationLf}
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
  elevationRefs,
  updateElevationReference,
  storeManualElevationReference,
  activeElevation,
  setActiveElevation,
  duplicateElevationRefs,
  setDuplicateElevationRefs,
  elevationHeights,
  duplicateElevationHeights,
  setDuplicateElevationHeights,
  updateElevationHeight,
  updateHeightArea,
  storeManualOverallHeight,
  storeManualAreaHeight,
  keyFloorLf,
  totalElevationLf,
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
  duplicateElevationRefs: Record<"North" | "East", boolean>;
  setDuplicateElevationRefs: React.Dispatch<React.SetStateAction<Record<"North" | "East", boolean>>>;
  elevationHeights: ElevationHeight[];
  duplicateElevationHeights: Record<"North" | "East", boolean>;
  setDuplicateElevationHeights: React.Dispatch<React.SetStateAction<Record<"North" | "East", boolean>>>;
  updateElevationHeight: (
    elevation: ElevationName,
    updates: Partial<ElevationHeight>,
  ) => void;
  updateHeightArea: (
    elevation: ElevationName,
    areaId: string,
    updates: Partial<HeightArea>,
  ) => void;
  storeManualOverallHeight: (elevation: ElevationName) => void;
  storeManualAreaHeight: (elevation: ElevationName, areaId: string) => void;
  keyFloorLf: number;
  totalElevationLf: number;
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
}) {
  const difference = Math.abs(totalElevationLf - keyFloorLf);
  const toleranceLf = keyFloorLf * tolerancePercent;

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
        <KorbanPanel title="Full Overlay" compact>
          <div className="space-y-2">
            {fullOverlayRows.map((row) => {
              const isActiveFullPick = pickTarget?.type === "full" && pickTarget.id === row.id;
              const hasPendingFullMeasure = isActiveFullPick && tracePoints.length >= 2 && (traceClosed || overlayLockedOpen);
              const displayLf = hasPendingFullMeasure ? tracedLinealFeet : row.linealFeet;
              const isStored = row.linealFeet > 0 && !hasPendingFullMeasure;

              return (
                <div
                  key={row.id}
                  className={`rounded-xl border bg-zinc-950/80 p-3 ${hasPendingFullMeasure ? "border-yellow-300/40 shadow-[0_0_18px_rgba(234,179,8,0.20)]" : "border-zinc-800"}`}
                >
                  <div className="grid grid-cols-[auto_12px_minmax(0,1fr)_104px] items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 text-zinc-500">
                      <input
                        type="checkbox"
                        checked={row.isKeyFloor}
                        disabled={row.overlayType !== "Level"}
                        onChange={() =>
                          updateFullOverlayRow(row.id, { isKeyFloor: true })
                        }
                        className="accent-orange-500 disabled:opacity-30"
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
                    <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-right font-mono ${hasPendingFullMeasure ? "bg-yellow-300/10 text-yellow-300 shadow-[0_0_14px_rgba(234,179,8,0.22)]" : "text-orange-400"}`}>
                      {displayLf > 0 ? formatFeetInches(displayLf) : "--"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    <button
                      onClick={() => startPick({ type: "full", id: row.id })}
                      className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${isActiveFullPick && !hasPendingFullMeasure ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
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
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${isStored ? "border border-white/25 bg-white/5 text-white" : "bg-orange-500 text-black hover:bg-orange-400"}`}
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
              );
            })}
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
        </KorbanPanel>

        <KorbanPanel title="Elevation Reference" compact>
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
                <div className="mt-2 grid grid-cols-1 gap-1.5">
                  <input
                    value={item.manualLinealFeetInput}
                    onChange={(event) =>
                      updateElevationReference(item.elevation, {
                        manualLinealFeetInput: event.target.value,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") storeManualElevationReference(item.elevation);
                    }}
                    placeholder="Manual LF"
                    className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500"
                  />
                </div>
                {canDuplicateOpposite(item.elevation) && (
                  <label className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={duplicateElevationRefs[item.elevation]}
                      onChange={(event) =>
                        setDuplicateElevationRefs((current) => ({
                          ...current,
                          [item.elevation]: event.target.checked,
                        }))
                      }
                      className="accent-orange-500"
                    />
                    Duplicate {getOppositeElevation(item.elevation)}
                  </label>
                )}
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
        </KorbanPanel>

        <KorbanPanel title="Elevation Heights" compact>
          <div className="space-y-3">
            {elevationHeights.map((item) => (
              <ElevationHeightTile
                key={item.elevation}
                item={item}
                active={activeElevation === item.elevation}
                duplicateElevationHeights={duplicateElevationHeights}
                setDuplicateElevationHeights={setDuplicateElevationHeights}
                setActiveElevation={setActiveElevation}
                updateElevationHeight={updateElevationHeight}
                updateHeightArea={updateHeightArea}
                storeManualOverallHeight={storeManualOverallHeight}
                storeManualAreaHeight={storeManualAreaHeight}
                startPick={startPick}
                closePick={closePick}
                storePick={storePick}
                pickTarget={pickTarget}
                tracePoints={tracePoints}
                tracedLinealFeet={tracedLinealFeet}
                traceClosed={traceClosed}
                overlayLockedOpen={overlayLockedOpen}
              />
            ))}
          </div>
        </KorbanPanel>

        <KorbanPanel title="Takeoff Viewer" compact>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <TakeoffViewer
              fullOverlayRows={fullOverlayRows}
              elevationRefs={elevationRefs}
              elevationHeights={elevationHeights}
            />
            <div className="mt-3 space-y-1 text-xs">
              <MetaRow label="Key Floor LF" value={formatFeetInches(keyFloorLf)} />
              <MetaRow label="Combined Elevation LF" value={formatFeetInches(totalElevationLf)} />
              <MetaRow label="Avg. Exterior Height" value={formatFeetInches(getAverageExteriorHeight(elevationHeights))} />
              {elevationOptions.map((elevation) => {
                const height = elevationHeights.find((item) => item.elevation === elevation);
                if (!height) return null;
                const overall = height.multipleHeights ? "Multiple" : formatFeetInches(getHeightWithBelowGrade(height));
                return (
                  <div key={elevation} className="border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
                    <MetaRow label={`${elevation} Height`} value={overall} />
                    {height.multipleHeights && (
                      <div className="mt-1 space-y-1 pl-3">
                        {height.areas.map((area) => (
                          <MetaRow
                            key={area.id}
                            label={`${area.label}`}
                            value={`${area.heightInput} · ${area.coveragePercent}%`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <KorbanButton variant="primary" block className="mt-3" onClick={saveToEstimateReview}>
            Save & Continue
          </KorbanButton>
        </KorbanPanel>
      </div>
      </KorbanPanel>
    </div>
  );
}

function ElevationHeightTile({
  item,
  active,
  duplicateElevationHeights,
  setDuplicateElevationHeights,
  setActiveElevation,
  updateElevationHeight,
  updateHeightArea,
  storeManualOverallHeight,
  storeManualAreaHeight,
  startPick,
  closePick,
  storePick,
  pickTarget,
  tracePoints,
  tracedLinealFeet,
  traceClosed,
  overlayLockedOpen,
}: {
  item: ElevationHeight;
  active: boolean;
  duplicateElevationHeights: Record<"North" | "East", boolean>;
  setDuplicateElevationHeights: React.Dispatch<React.SetStateAction<Record<"North" | "East", boolean>>>;
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
  storeManualOverallHeight: (elevation: ElevationName) => void;
  storeManualAreaHeight: (elevation: ElevationName, areaId: string) => void;
  startPick: (target: PickTarget) => void;
  closePick: () => void;
  storePick: () => void;
  pickTarget: PickTarget;
  tracePoints: Point[];
  tracedLinealFeet: number;
  traceClosed: boolean;
  overlayLockedOpen: boolean;
}) {
  const [coverageAdjusting, setCoverageAdjusting] = useState(false);
  const isOverallPickActive = pickTarget?.type === "heightOverall" && pickTarget.elevation === item.elevation;
  const hasPendingOverall = isOverallPickActive && tracePoints.length >= 2 && (traceClosed || overlayLockedOpen);
  const overallDisplay = hasPendingOverall ? formatFeetInches(tracedLinealFeet) : item.overallHeightInput;
  const left = item.areas[0]?.coveragePercent ?? 33;
  const center = item.areas[1]?.coveragePercent ?? 34;
  const leftTick = left;
  const rightTick = Math.min(99, left + center);

  function updateCoverageTicks(nextLeft: number, nextRight: number) {
    const safeLeft = Math.max(1, Math.min(nextLeft, nextRight - 1));
    const safeRight = Math.max(safeLeft + 1, Math.min(nextRight, 99));
    updateHeightArea(item.elevation, "left", { coveragePercent: safeLeft });
    updateHeightArea(item.elevation, "center", { coveragePercent: safeRight - safeLeft });
    updateHeightArea(item.elevation, "right", { coveragePercent: 100 - safeRight });
  }

  return (
    <div
      className={`rounded-xl border p-3 ${active ? "border-white/30 bg-white/5 shadow-[0_0_18px_rgba(255,255,255,0.12)]" : "border-zinc-800 bg-zinc-950/70"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setActiveElevation(item.elevation)}
          className="text-xs font-semibold text-zinc-200"
        >
          {item.elevation}
        </button>
        {canDuplicateOpposite(item.elevation) && (
          <label className="flex items-center gap-2 text-[10px] text-zinc-400">
            <input
              type="checkbox"
              checked={duplicateElevationHeights[item.elevation]}
              onChange={(event) =>
                setDuplicateElevationHeights((current) => ({
                  ...current,
                  [item.elevation]: event.target.checked,
                }))
              }
              className="accent-orange-500"
            />
            Duplicate {getOppositeElevation(item.elevation)}
          </label>
        )}
      </div>

      {!item.multipleHeights && (
        <>
          <div className={`mt-2 grid grid-cols-[1fr_110px_54px] items-center gap-2 ${hasPendingOverall ? "rounded-lg bg-yellow-300/5 p-1 shadow-[0_0_14px_rgba(234,179,8,0.18)]" : ""}`}>
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Main Overall Height
            </span>
            <input
              value={overallDisplay}
              onChange={(event) =>
                updateElevationHeight(item.elevation, {
                  overallHeightInput: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") storeManualOverallHeight(item.elevation);
              }}
              className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-xs text-orange-300 outline-none focus:border-orange-500"
              placeholder="0' or --"
            />
            <button
              onClick={() => storeManualOverallHeight(item.elevation)}
              className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
            >
              Store
            </button>
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr_84px] items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] text-zinc-500">
              <input
                type="checkbox"
                checked={item.belowGradeEnabled}
                onChange={(event) =>
                  updateElevationHeight(item.elevation, {
                    belowGradeEnabled: event.target.checked,
                  })
                }
                className="accent-orange-500"
              />
              Below Grade
            </label>
            <input
              value={item.belowGradeInput}
              onChange={(event) =>
                updateElevationHeight(item.elevation, {
                  belowGradeInput: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") storeManualOverallHeight(item.elevation);
              }}
              disabled={!item.belowGradeEnabled}
              className="rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500 disabled:opacity-35"
              placeholder="0'"
            />
            <button
              onClick={() => storeManualOverallHeight(item.elevation)}
              className="rounded-lg border border-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50"
            >
              Store
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              onClick={() =>
                startPick({ type: "heightOverall", elevation: item.elevation })
              }
              className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${isOverallPickActive && !hasPendingOverall ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
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
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${hasPendingOverall ? "bg-orange-500 text-black hover:bg-orange-400" : "border border-white/20 bg-white/5 text-white"}`}
            >
              Store
            </button>
          </div>
        </>
      )}

      <button
        onClick={() =>
          updateElevationHeight(item.elevation, {
            multipleHeights: !item.multipleHeights,
          })
        }
        className="mt-2 w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
      >
        {item.multipleHeights ? "Use Overall Height" : "+ Multiple Heights"}
      </button>

      {item.multipleHeights && (
        <div className="mt-3 space-y-2">
          {item.areas.map((area) => {
            const isAreaPickActive = pickTarget?.type === "heightArea" && pickTarget.elevation === item.elevation && pickTarget.areaId === area.id;
            const hasPendingArea = isAreaPickActive && tracePoints.length >= 2 && (traceClosed || overlayLockedOpen);
            return (
              <div
                key={area.id}
                className={`rounded-lg border bg-black p-2 ${hasPendingArea ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.18)]" : "border-zinc-800"}`}
              >
                <div className="grid grid-cols-[56px_1fr_54px_54px] items-center gap-2">
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {area.label}
                  </span>
                  <input
                    value={hasPendingArea ? formatFeetInches(tracedLinealFeet) : area.heightInput}
                    onChange={(event) =>
                      updateHeightArea(item.elevation, area.id, {
                        heightInput: event.target.value,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") storeManualAreaHeight(item.elevation, area.id);
                    }}
                    placeholder="Height"
                    className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right text-[10px] text-orange-300 outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={() => storeManualAreaHeight(item.elevation, area.id)}
                    className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300 hover:bg-orange-500/20"
                  >
                    Store
                  </button>
                  <span className="text-right font-mono text-[10px] text-zinc-400">
                    {area.coveragePercent}%
                  </span>
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
                    className={`rounded-lg border px-2 py-1 text-[10px] text-zinc-300 hover:border-orange-500/50 ${isAreaPickActive && !hasPendingArea ? "border-yellow-300/40 shadow-[0_0_16px_rgba(234,179,8,0.25)] animate-pulse" : "border-zinc-800"}`}
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
                    className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${hasPendingArea ? "bg-orange-500 text-black hover:bg-orange-400" : "border border-white/20 bg-white/5 text-white"}`}
                  >
                    Store
                  </button>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
            Elevation Coverage
          </p>
          <div className="relative h-5 rounded-full bg-zinc-900">
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-orange-500"
              style={{ width: `${left}%` }}
            />
            <div
              className="absolute inset-y-0 bg-orange-400"
              style={{ left: `${left}%`, width: `${center}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-full bg-amber-500"
              style={{ width: `${100 - rightTick}%` }}
            />
            <span className="absolute top-[-4px] h-7 w-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.4)]" style={{ left: `${leftTick}%` }} />
            <span className="absolute top-[-4px] h-7 w-1 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.4)]" style={{ left: `${rightTick}%` }} />
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
              <div className="relative h-8">
                <input
                  type="range"
                  min={1}
                  max={98}
                  value={leftTick}
                  onChange={(event) => updateCoverageTicks(Number(event.target.value), rightTick)}
                  className="absolute top-2 w-full accent-orange-500"
                />
                <input
                  type="range"
                  min={2}
                  max={99}
                  value={rightTick}
                  onChange={(event) => updateCoverageTicks(leftTick, Number(event.target.value))}
                  className="absolute top-2 w-full accent-orange-300"
                />
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-zinc-400">
                <span>Left {item.areas[0]?.coveragePercent ?? 0}%</span>
                <span>Center {item.areas[1]?.coveragePercent ?? 0}%</span>
                <span>Right {item.areas[2]?.coveragePercent ?? 0}%</span>
              </div>
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
  elevationHeights,
}: {
  fullOverlayRows: FullOverlayRow[];
  elevationRefs: ElevationReference[];
  elevationHeights: ElevationHeight[];
}) {
  const drawableFullRows = fullOverlayRows.filter((row) => row.points.length >= 2);
  const drawableElevationRows = elevationRefs.filter((row) => row.linealFeet > 0);

  if (drawableFullRows.length === 0 && drawableElevationRows.length === 0) {
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
      <svg
        viewBox="0 0 280 160"
        className="h-40 w-full rounded border border-zinc-800 bg-black/70"
      >
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
                      x1={lastMapped.x}
                      y1={lastMapped.y}
                      x2={firstMapped.x}
                      y2={firstMapped.y}
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
          const maxLf = Math.max(...drawableElevationRows.map((item) => item.linealFeet), 1);
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
