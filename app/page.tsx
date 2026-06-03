"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const projectConditions = [
  "Bad Access Areas",
  "Adjacent Properties",
  "Grade Changes",
  "Gabled Walls",
  "Setbacks / Pop-Outs",
  "Free-Stand",
];

const finishOptions = ["Plaster", "EIFS", "CMU", "Metal Panel", "Siding", "Special", "Thin Brick", "Shotcrete", "Paint"];
const scaffoldWidths = ["3'", "3'6\"", "5'"];
const draftSteps = ["Draft", "Select Section", "Draft Section"];
const productionOptions = ["Competitive", "Average", "Conservative"];

const backendDefaults = [
  { label: "Frame Height", value: "6'4\"" },
  { label: "Bay Length", value: "10'" },
  { label: "Plank Type", value: "Wood" },
  { label: "Deck Levels", value: "Every Jump" },
  { label: "Coverage", value: "Above 12' Tall" },
];

type Point = {
  x: number;
  y: number;
};

type FrameResult = {
  wallHeightFeet: number;
  deckOffsetFeet: number;
  requiredScaffoldHeightFeet: number;
  frames64: number;
  frames5: number;
  frames3: number;
  jackExtensionInches: number;
  totalFrameStackHeightFeet: number;
  scaffoldWidth: string;
  production: string;
};

function parseFeetInches(input: string): number | null {
  if (!input.trim()) return null;

  const cleaned = input.trim().replace(/"/g, "").replace(/ft/gi, "");

  if (cleaned.includes("-")) {
    const [feetRaw, inchesRaw] = cleaned.split("-");
    const feet = Number(feetRaw);
    const inches = Number(inchesRaw || 0);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }

  if (cleaned.includes("'")) {
    const [feetRaw, inchesRaw] = cleaned.split("'");
    const feet = Number(feetRaw);
    const inches = Number(inchesRaw || 0);
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

function calculateFrameStack(
  wallHeightInput: string,
  deckOffsetInput: string,
  scaffoldWidth: string,
  production: string
): FrameResult | null {
  const wallHeightFeet = parseFeetInches(wallHeightInput);
  const deckOffsetFeet = parseFeetInches(deckOffsetInput);

  if (wallHeightFeet === null || deckOffsetFeet === null) return null;

  const requiredScaffoldHeightFeet = Math.max(0, wallHeightFeet - deckOffsetFeet);

  const frame64Height = 6 + 4 / 12;
  const frame5Height = 5;
  const frame3Height = 3;
  const maxJackExtensionFeet = 16 / 12;

  let bestStack: FrameResult | null = null;

  for (let frames64 = 0; frames64 <= 20; frames64 += 1) {
    for (let frames5 = 0; frames5 <= 4; frames5 += 1) {
      for (let frames3 = 0; frames3 <= 4; frames3 += 1) {
        const frameHeight =
          frames64 * frame64Height + frames5 * frame5Height + frames3 * frame3Height;

        const jackExtensionFeet = requiredScaffoldHeightFeet - frameHeight;

        if (jackExtensionFeet < -0.01 || jackExtensionFeet > maxJackExtensionFeet) {
          continue;
        }

        const totalFrames = frames64 + frames5 + frames3;
        const jackExtensionInches = Math.max(0, jackExtensionFeet * 12);

        const candidate: FrameResult = {
          wallHeightFeet,
          deckOffsetFeet,
          requiredScaffoldHeightFeet,
          frames64,
          frames5,
          frames3,
          jackExtensionInches,
          totalFrameStackHeightFeet: frameHeight + jackExtensionFeet,
          scaffoldWidth,
          production,
        };

        if (!bestStack) {
          bestStack = candidate;
          continue;
        }

        const bestTotalFrames = bestStack.frames64 + bestStack.frames5 + bestStack.frames3;
        const bestSpecialFrames = bestStack.frames5 + bestStack.frames3;
        const candidateSpecialFrames = frames5 + frames3;

        if (
          totalFrames < bestTotalFrames ||
          (totalFrames === bestTotalFrames &&
            candidateSpecialFrames < bestSpecialFrames) ||
          (totalFrames === bestTotalFrames &&
            candidateSpecialFrames === bestSpecialFrames &&
            jackExtensionInches < bestStack.jackExtensionInches)
        ) {
          bestStack = candidate;
        }
      }
    }
  }

  if (bestStack) return bestStack;

  const frames64 = Math.ceil(requiredScaffoldHeightFeet / frame64Height);

  return {
    wallHeightFeet,
    deckOffsetFeet,
    requiredScaffoldHeightFeet,
    frames64,
    frames5: 0,
    frames3: 0,
    jackExtensionInches: 0,
    totalFrameStackHeightFeet: frames64 * frame64Height,
    scaffoldWidth,
    production,
  };
}

function distanceBetween(a: Point, b: Point) {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>(["Plaster"]);
  const [activeStep, setActiveStep] = useState("Upload PDF");
  const [scaffoldWidth, setScaffoldWidth] = useState("3'");
  const [production, setProduction] = useState("Average");
  const [showFrameConfiguration, setShowFrameConfiguration] = useState(false);
  const [topWallHeight, setTopWallHeight] = useState("28-7");
  const [topDeckOffset, setTopDeckOffset] = useState("6");

  const [companyName, setCompanyName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [estimatorName, setEstimatorName] = useState("");

  const [frameRent, setFrameRent] = useState("4.00");
  const [plankRent, setPlankRent] = useState("2.00");
  const [miscRent, setMiscRent] = useState("1.00");
  const [durationType, setDurationType] = useState("Monthly");
  const [durationQuantity, setDurationQuantity] = useState("1");

  const additionalItemsCost = 0;
  const breakoutAreasCost = 0;

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(0.85);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const [scaleMode, setScaleMode] = useState(false);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [knownScaleFeet, setKnownScaleFeet] = useState("");
  const [pixelsPerFoot, setPixelsPerFoot] = useState<number | null>(null);

  const [overlayMode, setOverlayMode] = useState(false);
  const [tracePoints, setTracePoints] = useState<Point[]>([]);
  const [traceClosed, setTraceClosed] = useState(false);

  const draftMode = draftSteps.includes(activeStep);

  const dateTimeStamp = useMemo(() => {
    return new Date().toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const frameResult = useMemo(() => {
    return calculateFrameStack(topWallHeight, topDeckOffset, scaffoldWidth, production);
  }, [topWallHeight, topDeckOffset, scaffoldWidth, production]);

  const scalePixelDistance = useMemo(() => {
    if (scalePoints.length < 2) return 0;
    return distanceBetween(scalePoints[0], scalePoints[1]);
  }, [scalePoints]);

  const tracePixelLength = useMemo(() => {
    return polylineLength(tracePoints, traceClosed);
  }, [tracePoints, traceClosed]);

  const tracedLinearFeet = useMemo(() => {
    if (!pixelsPerFoot || pixelsPerFoot <= 0) return 0;
    return tracePixelLength / pixelsPerFoot;
  }, [tracePixelLength, pixelsPerFoot]);

  const bayCount = useMemo(() => {
    if (tracedLinearFeet <= 0) return 0;
    return Math.ceil(tracedLinearFeet / 10);
  }, [tracedLinearFeet]);

  const legCount = useMemo(() => {
    if (tracedLinearFeet <= 0) return 0;
    if (tracedLinearFeet <= 10) return 2;
    return bayCount + 1;
  }, [tracedLinearFeet, bayCount]);

  const framesPerLeg = useMemo(() => {
    if (!frameResult) return 0;
    return frameResult.frames64 + frameResult.frames5 + frameResult.frames3;
  }, [frameResult]);

  const totalFrameCount = useMemo(() => {
    return framesPerLeg * legCount;
  }, [framesPerLeg, legCount]);

  const planksPerBay = useMemo(() => {
    if (scaffoldWidth === "3'6\"") return 4;
    if (scaffoldWidth === "5'") return 6;
    return 3;
  }, [scaffoldWidth]);

  const totalPlankCount = useMemo(() => {
    if (!bayCount || !framesPerLeg) return 0;
    return bayCount * planksPerBay * framesPerLeg;
  }, [bayCount, planksPerBay, framesPerLeg]);

  const totalMiscCount = useMemo(() => {
    if (!legCount && !bayCount) return 0;
    return legCount * 2 + bayCount * 2;
  }, [legCount, bayCount]);

  const materialOptions = useMemo(() => {
    return [
      { label: "Brackets", active: selectedConditions.includes("Setbacks / Pop-Outs") },
      { label: "Beams", active: selectedConditions.includes("Free-Stand") },
      { label: "Joists", active: selectedConditions.includes("Free-Stand") },
      { label: "Shore Posts", active: selectedConditions.includes("Bad Access Areas") },
    ];
  }, [selectedConditions]);

  const productionRate = useMemo(() => {
    if (production === "Competitive") return 60;
    if (production === "Conservative") return 40;
    return 50;
  }, [production]);

  const stockHours = useMemo(() => {
    if (!totalFrameCount) return 0;
    return totalFrameCount / 80;
  }, [totalFrameCount]);

  const installHours = useMemo(() => {
    if (!totalFrameCount) return 0;
    return totalFrameCount / productionRate;
  }, [totalFrameCount, productionRate]);

  const dismantleHours = useMemo(() => {
    if (!installHours) return 0;
    if (production === "Competitive") return installHours * 0.6;
    if (production === "Conservative") return installHours * 0.7;
    return installHours * 0.65;
  }, [installHours, production]);

  const travelHours = 0;

  const materialRentalTotal = useMemo(() => {
    const durationMultiplier = Number(durationQuantity) || 0;
    const frameRate = Number(frameRent) || 0;
    const plankRate = Number(plankRent) || 0;
    const miscRate = Number(miscRent) || 0;

    return (
      totalFrameCount * frameRate +
      totalPlankCount * plankRate +
      totalMiscCount * miscRate
    ) * durationMultiplier;
  }, [durationQuantity, frameRent, plankRent, miscRent, totalFrameCount, totalPlankCount, totalMiscCount]);

  const currentTotalCost = useMemo(() => {
    return materialRentalTotal + additionalItemsCost + breakoutAreasCost;
  }, [materialRentalTotal, additionalItemsCost, breakoutAreasCost]);

  const crewSize = useMemo(() => {
    if (!framesPerLeg) return 0;
    return Math.max(1, Math.ceil(framesPerLeg / 2));
  }, [framesPerLeg]);

  const totalInstallDays = useMemo(() => {
    if (!installHours || !crewSize) return 0;
    return Math.max(1, Math.ceil(installHours / (crewSize * 8)));
  }, [installHours, crewSize]);

  const crewPlan = useMemo(() => {
    if (!totalInstallDays || !crewSize) return [];
    return Array.from({ length: totalInstallDays }, (_, index) => ({
      day: index + 1,
      crew: crewSize,
    }));
  }, [totalInstallDays, crewSize]);


  const framePartNumbers = useMemo(() => {
    if (scaffoldWidth === "3'6\"") {
      return { frame64: "FO6L42", frame5: "FO5L42", frame3: "FM342" };
    }

    if (scaffoldWidth === "5'") {
      return { frame64: "FO6L", frame5: "FM5", frame3: "FM3" };
    }

    return { frame64: "FO6L3", frame5: "FO5L3", frame3: "FM33" };
  }, [scaffoldWidth]);

  const guardRailCount = useMemo(() => {
    if (!bayCount || !framesPerLeg) return 0;
    const topDeckRails = bayCount * 4;
    const lowerDeckRails = Math.max(0, framesPerLeg - 1) * bayCount * 2;
    return topDeckRails + lowerDeckRails;
  }, [bayCount, framesPerLeg]);

  const materialLoadList = useMemo(() => {
    const rows = [
      {
        partNo: framePartNumbers.frame64,
        category: "Frames",
        description: `6' 4\" H - ${scaffoldWidth} W Frame`,
        qty: frameResult ? frameResult.frames64 * legCount : 0,
      },
      {
        partNo: framePartNumbers.frame5,
        category: "Frames",
        description: `5' H - ${scaffoldWidth} W Frame`,
        qty: frameResult ? frameResult.frames5 * legCount : 0,
      },
      {
        partNo: framePartNumbers.frame3,
        category: "Frames",
        description: `3' H - ${scaffoldWidth} W Frame`,
        qty: frameResult ? frameResult.frames3 * legCount : 0,
      },
      {
        partNo: "B104",
        category: "Bracing",
        description: "10X4 Cross Brace",
        qty: bayCount * 2,
      },
      {
        partNo: "GR10",
        category: "Safety",
        description: "10' Guard Rail",
        qty: guardRailCount,
      },
      {
        partNo: "WP10",
        category: "Decking",
        description: "10' Wood Plank",
        qty: totalPlankCount,
      },
      {
        partNo: "AL1S",
        category: "Base",
        description: "Screw Jack W/Base Plate",
        qty: legCount * 2,
      },
      {
        partNo: "BP1",
        category: "Base",
        description: "Fixed Base Plate",
        qty: legCount * 2,
      },
    ];

    return rows.filter((row) => row.qty > 0);
  }, [bayCount, framePartNumbers, frameResult, guardRailCount, legCount, scaffoldWidth, totalPlankCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      "korbanInventoryLoadList",
      JSON.stringify({
        projectName,
        projectAddress,
        companyName,
        scaffoldWidth,
        linealFeet: tracedLinearFeet,
        bayCount,
        legCount,
        framesPerLeg,
        generatedAt: new Date().toISOString(),
        rows: materialLoadList,
      })
    );
  }, [bayCount, companyName, framesPerLeg, legCount, materialLoadList, projectAddress, projectName, scaffoldWidth, tracedLinearFeet]);

  function toggleCondition(condition: string) {
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  }

  function toggleFinish(finish: string) {
    setSelectedFinishes((current) =>
      current.includes(finish)
        ? current.filter((item) => item !== finish)
        : [...current, finish]
    );
  }

  function activateStep(step: string) {
    setActiveStep(step);

    if (step === "Scale") {
      setScaleMode(true);
      setOverlayMode(false);
      setTraceClosed(false);
    }

    if (step === "Overlay") {
      setOverlayMode(true);
      setScaleMode(false);
      setTraceClosed(false);
    }
  }

  function toggleFrameConfiguration() {
    setActiveStep("Frame Configuration");
    setShowFrameConfiguration((current) => !current);
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
    setScalePoints([]);
    setPixelsPerFoot(null);
    setTracePoints([]);
    setTraceClosed(false);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setActiveStep("Scale");
      setScaleMode(true);
      setOverlayMode(false);
    } catch (error) {
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

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    }

    renderPdfPage();
  }, [pdfDoc, pageNumber, zoom]);

  function handleCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;

    if (!canvas || (!scaleMode && !overlayMode)) return;

    const rect = canvas.getBoundingClientRect();

    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height) {
      return;
    }

    if (scaleMode) {
      setScalePoints((current) => {
        if (current.length >= 2) return [point];
        return [...current, point];
      });
    }

    if (overlayMode && !traceClosed) {
      setTracePoints((current) => [...current, point]);
    }
  }

  function calibrateScale() {
    const feet = Number(knownScaleFeet);

    if (scalePoints.length < 2) {
      alert("Click two points on the plan first.");
      return;
    }

    if (!feet || feet <= 0) {
      alert("Enter the known distance in feet.");
      return;
    }

    setPixelsPerFoot(scalePixelDistance / feet);
    setScaleMode(false);
    setActiveStep("Overlay");
    setOverlayMode(true);
  }

  function undoTracePoint() {
    setTracePoints((current) => current.slice(0, -1));
    setTraceClosed(false);
  }

  function clearTrace() {
    setTracePoints([]);
    setTraceClosed(false);
  }

  function closeTrace() {
    if (tracePoints.length < 3) {
      alert("Select at least 3 points before closing overlay.");
      return;
    }

    setTraceClosed(true);
    setOverlayMode(false);
  }

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-white">
      <header className="flex h-16 items-center justify-between border-b border-orange-500/20 bg-black px-6">
        <div>
          <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">
            KORBAN
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
            Scaffold Intelligence Platform
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-5 py-2 shadow-[0_0_30px_rgba(249,115,22,0.12)]">
            <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Current Total Cost</p>
            <p className="font-mono text-lg font-bold text-orange-500">${currentTotalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-zinc-500">including all add scopes</p>
          </div>

          <button className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:border-orange-500/40 hover:bg-orange-500/10">
            Save Draft
          </button>
          <button className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400">
            Generate Estimate
          </button>
        </div>
      </header>

      <div
        className={`grid h-[calc(100vh-64px)] ${
          draftMode
            ? "grid-cols-[300px_minmax(0,1fr)_220px_360px_220px]"
            : "grid-cols-[300px_minmax(0,1fr)_360px_220px]"
        }`}
      >
        <aside className="overflow-y-auto border-r border-orange-500/20 bg-[#090909] p-4">
          <section className="mb-4 rounded-2xl border border-orange-500/20 bg-black p-4">
            <h2 className="text-xs uppercase tracking-[0.25em] text-orange-400">
              Project Information
            </h2>

            <div className="mt-4 space-y-3">
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Company"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Project Name"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
              <input
                value={projectAddress}
                onChange={(event) => setProjectAddress(event.target.value)}
                placeholder="Address / Location"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
              <input
                value={estimatorName}
                onChange={(event) => setEstimatorName(event.target.value)}
                placeholder="Estimator"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Standards
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Scaffold Width</label>
                <select
                  value={scaffoldWidth}
                  onChange={(event) => setScaffoldWidth(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                >
                  {scaffoldWidths.map((width) => (
                    <option key={width}>{width}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Production Mode</label>
                <select
                  value={production}
                  onChange={(event) => setProduction(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                >
                  {productionOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-900 bg-zinc-950/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-700">
                Backend Defaults
              </p>

              <div className="mt-3 space-y-2">
                {backendDefaults.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-zinc-700">{item.label}</span>
                    <span className="font-mono text-zinc-500">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Exterior Finish
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {finishOptions.map((finish) => {
                const selected = selectedFinishes.includes(finish);

                return (
                  <button
                    key={finish}
                    onClick={() => toggleFinish(finish)}
                    className={`rounded-lg border px-2 py-1.5 text-[10px] leading-tight transition ${
                      selected
                        ? "border-orange-500 bg-orange-500 text-black"
                        : "border-zinc-700 text-zinc-400 hover:border-orange-500/50"
                    }`}
                  >
                    {finish}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-900 bg-black/60 p-3">
            {['Backend Input', 'Options', 'Help / Support'].map((item) => (
              <button
                key={item}
                className="mb-2 w-full rounded-xl border border-zinc-900 bg-zinc-950/60 px-3 py-2.5 text-left text-xs text-zinc-500 transition hover:border-orange-500/30 hover:text-zinc-300 last:mb-0"
              >
                {item}
              </button>
            ))}
          </section>
        </aside>

        <section className="overflow-y-auto bg-[#070707] p-5">
          <div className="mb-4 rounded-2xl border border-orange-500/20 bg-black/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-orange-400">
                  Takeoff Workflow
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Upload plans, scale, overlay, configure frames, set scaffold, and draft sections.
                </p>
              </div>

              <div className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">
                Active: {activeStep}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-xl border border-orange-500 bg-orange-500 px-4 py-2.5 text-xs font-semibold text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]">
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => activateStep("Scale")}
                className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  scaleMode
                    ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                    : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"
                }`}
              >
                Scale
              </button>

              <button
                onClick={() => activateStep("Overlay")}
                className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  overlayMode
                    ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                    : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"
                }`}
              >
                Overlay
              </button>

              <button
                onClick={toggleFrameConfiguration}
                className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  showFrameConfiguration
                    ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                    : "border-orange-500/70 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                }`}
              >
                Frame Configuration
              </button>

              <button
                onClick={() => activateStep("Set Scaffold")}
                className="rounded-xl border border-orange-500/30 bg-black px-4 py-2.5 text-xs font-semibold text-orange-300 hover:border-orange-500"
              >
                Set Scaffold
              </button>

              {draftSteps.map((step) => (
                <button
                  key={step}
                  onClick={() => activateStep(step)}
                  className={`rounded-xl border px-3.5 py-2.5 text-xs transition ${
                    activeStep === step
                      ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                      : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"
                  }`}
                >
                  {step}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex h-[calc(100vh-365px)] min-h-[500px] items-center justify-center overflow-auto rounded-[28px] border border-zinc-800 bg-black shadow-[inset_0_0_80px_rgba(249,115,22,0.04)]">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:38px_38px]" />

            <div className="absolute left-4 top-4 z-30 max-w-[420px] truncate rounded-full border border-orange-500/20 bg-black/80 px-3 py-1.5 text-xs text-zinc-400">
              {pdfFileName || "No PDF Loaded"}
            </div>

            {pdfLoading && <p className="relative z-10 text-sm text-zinc-500">Loading PDF...</p>}
            {pdfError && <p className="relative z-10 text-sm text-red-400">{pdfError}</p>}

            {!pdfDoc && !pdfLoading && !pdfError && (
              <div className="relative z-10 text-center">
                <label className="mx-auto mb-5 flex h-20 w-20 cursor-pointer items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-3xl text-orange-500 transition hover:border-orange-500/60 hover:bg-orange-500/15">
                  +
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                  />
                </label>
                <h2 className="text-2xl font-semibold">Design Workspace</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                  Upload plans, set scale, create overlays, establish elevations,
                  identify scaffold conditions, and prepare draft sections.
                </p>
              </div>
            )}

            {pdfDoc && (
              <div className="relative z-10 flex min-h-full flex-col items-center p-10">
                <div className="sticky top-4 z-40 mb-5 flex flex-wrap items-center gap-3 rounded-full border border-zinc-800 bg-black/85 px-4 py-2 text-xs text-zinc-400">
                  <button
                    disabled={pageNumber <= 1}
                    onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
                    className="rounded-lg border border-zinc-800 px-3 py-1 disabled:opacity-40"
                  >
                    Prev
                  </button>

                  <span>
                    Page {pageNumber} of {numPages}
                  </span>

                  <button
                    disabled={pageNumber >= numPages}
                    onClick={() => setPageNumber((page) => Math.min(numPages, page + 1))}
                    className="rounded-lg border border-zinc-800 px-3 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>

                  <button
                    onClick={() => setZoom((current) => Math.max(0.35, current - 0.1))}
                    className="rounded-lg border border-zinc-800 px-3 py-1"
                  >
                    -
                  </button>

                  <span>{Math.round(zoom * 100)}%</span>

                  <button
                    onClick={() => setZoom((current) => Math.min(2.5, current + 0.1))}
                    className="rounded-lg border border-zinc-800 px-3 py-1"
                  >
                    +
                  </button>

                  {scaleMode && <span className="text-orange-400">Scale: click 2 points</span>}
                  {overlayMode && <span className="text-orange-400">Overlay: click perimeter points</span>}
                </div>

                <div
                  onClick={handleCanvasClick}
                  className={`relative rounded-2xl bg-white p-4 shadow-[0_0_60px_rgba(0,0,0,0.65)] ${
                    scaleMode || overlayMode ? "cursor-crosshair" : ""
                  }`}
                >
                  <canvas ref={canvasRef} />

                  {scalePoints.map((point, index) => (
                    <Marker key={`scale-${index}`} point={point} label={`S${index + 1}`} />
                  ))}

                  {scalePoints.length === 2 && (
                    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
                      <line
                        x1={scalePoints[0].x + 16}
                        y1={scalePoints[0].y + 16}
                        x2={scalePoints[1].x + 16}
                        y2={scalePoints[1].y + 16}
                        stroke="#f97316"
                        strokeWidth="3"
                        strokeDasharray="8 8"
                      />
                    </svg>
                  )}

                  {tracePoints.map((point, index) => (
                    <Marker key={`trace-${index}`} point={point} label={String(index + 1)} />
                  ))}

                  {tracePoints.length >= 2 && (
                    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
                      {tracePoints.map((point, index) => {
                        if (index === 0) return null;

                        const previous = tracePoints[index - 1];

                        return (
                          <line
                            key={`trace-line-${index}`}
                            x1={previous.x + 16}
                            y1={previous.y + 16}
                            x2={point.x + 16}
                            y2={point.y + 16}
                            stroke="#f97316"
                            strokeWidth="3"
                          />
                        );
                      })}

                      {traceClosed && tracePoints.length > 2 && (
                        <line
                          x1={tracePoints[tracePoints.length - 1].x + 16}
                          y1={tracePoints[tracePoints.length - 1].y + 16}
                          x2={tracePoints[0].x + 16}
                          y2={tracePoints[0].y + 16}
                          stroke="#f97316"
                          strokeWidth="3"
                        />
                      )}
                    </svg>
                  )}
                </div>
              </div>
            )}
          </div>

          {pdfDoc && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                <h3 className="text-xs uppercase tracking-[0.2em] text-orange-400">
                  Scale Calibration
                </h3>

                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={knownScaleFeet}
                    onChange={(event) => setKnownScaleFeet(event.target.value)}
                    placeholder="Known distance in feet"
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                  />

                  <button
                    onClick={calibrateScale}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-black hover:bg-orange-400"
                  >
                    Calibrate
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>Points: {scalePoints.length}/2</span>
                  <span>Pixel Dist: {scalePixelDistance.toFixed(1)}</span>
                  <span>{pixelsPerFoot ? `${pixelsPerFoot.toFixed(2)} px/ft` : "Scale not set"}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                <h3 className="text-xs uppercase tracking-[0.2em] text-orange-400">
                  Overlay Trace
                </h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={undoTracePoint}
                    className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-orange-500/50"
                  >
                    Undo Point
                  </button>

                  <button
                    onClick={closeTrace}
                    className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black hover:bg-orange-400"
                  >
                    Close Overlay
                  </button>

                  <button
                    onClick={clearTrace}
                    className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:border-orange-500/50"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>Trace Points: {tracePoints.length}</span>
                  <span>Pixel LF: {tracePixelLength.toFixed(1)}</span>
                  <span>LF: {tracedLinearFeet.toFixed(1)}</span>
                  <span>Bays: {bayCount}</span>
                  <span>Legs: {legCount}</span>
                </div>
              </div>
            </div>
          )}

          {!showFrameConfiguration && (
            <div className="mt-5 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
              <h2 className="mb-1 text-xs uppercase tracking-[0.25em] text-orange-400">
                Project Coordination
              </h2>
              <p className="mb-4 text-xs text-zinc-500">Select all that apply.</p>

              <div className="flex flex-wrap gap-2">
                {projectConditions.map((condition) => {
                  const selected = selectedConditions.includes(condition);

                  return (
                    <button
                      key={condition}
                      onClick={() => toggleCondition(condition)}
                      className={`rounded-full border px-4 py-2 text-xs transition ${
                        selected
                          ? "border-orange-500 bg-orange-500 text-black"
                          : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/50"
                      }`}
                    >
                      {condition}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showFrameConfiguration && (
            <div className="mt-4 rounded-2xl border border-orange-500/25 bg-black p-4 shadow-[0_0_30px_rgba(249,115,22,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-400">
                    Frame Configuration
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Quick scaffold leg breakdown with inventory parts used for later material and labor calculations.
                  </p>
                </div>

                <button
                  onClick={() => setShowFrameConfiguration(false)}
                  className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
                >
                  Collapse
                </button>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Inputs
                  </h3>

                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-zinc-500">Top of Wall Height</label>
                      <input
                        value={topWallHeight}
                        onChange={(event) => setTopWallHeight(event.target.value)}
                        placeholder={`28-7 or 28'7"`}
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-500">Deck Below Top of Wall</label>
                      <input
                        value={topDeckOffset}
                        onChange={(event) => setTopDeckOffset(event.target.value)}
                        placeholder="6"
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <div className="rounded-xl border border-zinc-900 bg-black/60 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Scaffold Leg Breakdown
                    </h3>
                  </div>

                  {frameResult ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <CompactMetric
                        label="Required Height"
                        value={formatFeetInches(frameResult.requiredScaffoldHeightFeet)}
                      />
                      <CompactMetric label={`6'4" Frames`} value={String(frameResult.frames64)} />
                      <CompactMetric label={`5' / 3' Frames`} value={`${frameResult.frames5} / ${frameResult.frames3}`} />
                      <CompactMetric label="Jack" value={`${frameResult.jackExtensionInches.toFixed(1)}"`} />
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-black p-4 text-xs text-zinc-500">
                      Enter valid wall height and deck offset to calculate frame configuration.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 xl:col-span-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Inventory Parts Used
                  </h3>

                  <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Part No.</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="px-3 py-2 text-right font-medium">Qty / Leg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 bg-zinc-950/70">
                        <MaterialRowSmall code="F64" description={`6'4" Frame`} qty={frameResult ? frameResult.frames64 : 0} />
                        <MaterialRowSmall code="F05" description="5' Frame" qty={frameResult ? frameResult.frames5 : 0} />
                        <MaterialRowSmall code="F03" description="3' Frame" qty={frameResult ? frameResult.frames3 : 0} />
                        <MaterialRowSmall code="SJ16" description={frameResult ? `Screw Jack (${frameResult.jackExtensionInches.toFixed(1)}" extension)` : "Screw Jack"} qty={frameResult ? 1 : 0} />
                        <MaterialRowSmall code="BP" description="Base Plate" qty={frameResult ? 1 : 0} />
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {draftMode && (
          <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#070707] p-3">
            <h2 className="mb-4 text-xs uppercase tracking-[0.22em] text-orange-400">
              Drafting
            </h2>

            {["Scaffold Parts", "Cloud Callouts", "Add Notes"].map((item) => (
              <button
                key={item}
                className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left text-xs text-zinc-300 hover:border-orange-500/40"
              >
                {item}
              </button>
            ))}
          </aside>
        )}

        <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#090909] p-4">
          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4 min-h-[30%]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Estimate & Proposal</h2>
              </div>
              <p className="text-right text-[10px] leading-4 text-zinc-600">
                {dateTimeStamp}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <OutputRow label="Company" value={companyName || "Not entered"} />
              <OutputRow label="Project" value={projectName || "Not entered"} />
              <OutputRow label="Address" value={projectAddress || "Not entered"} />
              <OutputRow
                label="Exterior Finish"
                value={selectedFinishes.length > 0 ? selectedFinishes.join(", ") : "Not selected"}
              />
              <OutputRow label="Elevations Covered" value="Pending" />
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-900 bg-zinc-950/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-700">
                Proposal Description
              </p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Provide installation and dismantle of scaffold for{" "}
                <span className="rounded-md border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 font-mono text-orange-300">
                  {selectedFinishes.length > 0 ? selectedFinishes.join(", ") : "selected"}
                </span>{" "}
                finishes per project plans/site visit. Figured{" "}
                <span className="rounded-md border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 font-mono text-orange-300">
                  {scaffoldWidth}
                </span>{" "}
                wide scaffold, with{" "}
                <span className="rounded-md border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 font-mono text-orange-300">
                  10&apos;
                </span>{" "}
                long bays to access walls{" "}
                <span className="rounded-md border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 font-mono text-orange-300">
                  above 12&apos; tall
                </span>.
              </p>
              <button className="mt-3 rounded-lg border border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300">
                Edit / Add
              </button>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4 min-h-[50%]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs uppercase tracking-[0.22em] text-orange-400">
                Scaffold Breakdown
              </h3>
            </div>

            <div className="mt-4 border-b border-zinc-900 pb-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Material
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <RentInput label="Frame" value={frameRent} onChange={setFrameRent} />
                  <RentInput label="Plank" value={plankRent} onChange={setPlankRent} />
                  <RentInput label="Misc" value={miscRent} onChange={setMiscRent} />
                </div>
              </div>

              <div className="space-y-2">
                <OutputRow label="Total Frames" value={String(totalFrameCount)} />
                <OutputRow label="Total Planks" value={String(totalPlankCount)} />
                <OutputRow label="Total Misc." value={String(totalMiscCount)} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {materialOptions.map((item) => (
                  <MaterialOption key={item.label} label={item.label} active={item.active} />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-[1fr_90px] gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    Duration
                  </label>
                  <select
                    value={durationType}
                    onChange={(event) => setDurationType(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                  >
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    Qty
                  </label>
                  <input
                    value={durationQuantity}
                    onChange={(event) => setDurationQuantity(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 border-b border-zinc-900 pb-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Alternate Scopes
              </p>
              <div className="space-y-2">
                <OutputRow label="Add Items" value={`$${additionalItemsCost.toLocaleString()}`} />
                <OutputRow label="Breakout-Areas" value={`$${breakoutAreasCost.toLocaleString()}`} />
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Labor
              </p>

              <div className="space-y-2">
                <OutputRow label="Total Stock Hours" value={stockHours.toFixed(1)} />
                <OutputRow label="Total Install Hours" value={installHours.toFixed(1)} />
                <OutputRow label="Total Dismantle Hours" value={dismantleHours.toFixed(1)} />
                <OutputRow label="Total Travel Hours" value={travelHours.toFixed(1)} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-black p-4 min-h-[20%]">
            <h3 className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-400">
              Project Management
            </h3>

            <div className="space-y-2">
              <OutputRow label="Bay Count" value={String(bayCount)} />
              <OutputRow label="Frame Leg Count" value={String(legCount)} />
              <OutputRow label="Lineal Footage" value={`${tracedLinearFeet.toFixed(1)} LF`} />
              <OutputRow label="Frames Per Elevation" value={String(totalFrameCount)} />
              <OutputRow label="Frames Per Leg" value={String(framesPerLeg)} />
              <a
                href="/inventory-load-list"
                className="block w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-center text-[11px] font-semibold text-orange-300 transition hover:border-orange-500 hover:bg-orange-500/20"
              >
                View Material List
              </a>
            </div>

            <div className="mt-4 border-t border-zinc-900 pt-4">
              <OutputRow label="Total Days" value={String(totalInstallDays)} />
              <div className="mt-3 space-y-1.5">
                {crewPlan.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">Crew plan pending install hours.</p>
                ) : (
                  crewPlan.map((item) => (
                    <OutputRow
                      key={item.day}
                      label={`Day ${item.day}`}
                      value={`${item.crew} person crew`}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        </aside>
        <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#120b05] p-3">
          <section className="rounded-2xl border border-orange-500/20 bg-black/70 p-3">
            <h2 className="text-xs uppercase tracking-[0.22em] text-orange-300">
              Recommendations
            </h2>

            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              Concerns will appear as scale, overlay, height, access, and special conditions are reviewed.
            </p>
          </section>

          <section className="mt-3 rounded-2xl border border-orange-500/20 bg-black/70 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
              Concerns / Alerts
            </h3>

            <div className="mt-3 space-y-2">
              {!pdfDoc && <AlertItem status="waiting" text="No PDF plan uploaded." />}
              {pdfDoc && !pixelsPerFoot && <AlertItem status="warning" text="Scale not calibrated." />}
              {pixelsPerFoot && tracedLinearFeet === 0 && <AlertItem status="waiting" text="Overlay not traced." />}
              {tracedLinearFeet > 0 && !traceClosed && <AlertItem status="warning" text="Overlay not closed." />}
              {traceClosed && <AlertItem status="good" text="Overlay closed." />}
              {bayCount > 0 && <AlertItem status="good" text={`Bays: ${bayCount}`} />}
              {legCount > 0 && <AlertItem status="good" text={`Legs: ${legCount}`} />}
              {selectedConditions.includes("Setbacks / Pop-Outs") && (
                <AlertItem status="warning" text="Setback / pop-out review needed." />
              )}
              {selectedConditions.includes("Bad Access Areas") && (
                <AlertItem status="warning" text="Access may affect production." />
              )}
              {frameResult && frameResult.jackExtensionInches > 14 && (
                <AlertItem status="warning" text="High jack extension." />
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Marker({ point, label }: { point: Point; label: string }) {
  return (
    <div
      className="absolute z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-[10px] font-bold text-black"
      style={{
        left: point.x + 16,
        top: point.y + 16,
      }}
    >
      {label}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-black p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">{label}</p>
      <h3 className="mt-3 font-mono text-3xl font-bold text-orange-500">{value}</h3>
    </div>
  );
}

function BayMetricCard({ bayCount, legCount }: { bayCount: number; legCount: number }) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-black p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Bay Count</p>
      <h3 className="mt-3 font-mono text-3xl font-bold text-orange-500">{bayCount}</h3>
      <p className="mt-2 border-t border-zinc-900 pt-2 text-xs text-zinc-500">
        Frame Leg Count: <span className="font-mono text-orange-400">{legCount}</span>
      </p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <h3 className="mt-2 font-mono text-lg font-bold text-orange-500">{value}</h3>
    </div>
  );
}

function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px] leading-5">
      <span className="text-zinc-600">{label}</span>
      <span className="text-right font-mono text-zinc-400">{value}</span>
    </div>
  );
}

function RentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-[0.14em] text-zinc-700">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-orange-500">
        <span className="pl-2 font-mono text-[11px] text-zinc-600">$</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg bg-transparent px-1.5 py-1.5 text-[11px] font-mono text-zinc-400 outline-none"
        />
      </div>
    </label>
  );
}

function MaterialOption({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] transition ${
        active
          ? "border-orange-500/50 bg-orange-500/10 font-mono text-orange-300"
          : "border-zinc-900 bg-zinc-950/60 font-mono text-zinc-700"
      }`}
    >
      {label}
    </div>
  );
}

function MaterialRowSmall({
  code,
  description,
  qty,
}: {
  code: string;
  description: string;
  qty: number;
}) {
  return (
    <tr className="text-zinc-300">
      <td className="px-3 py-2 font-mono text-orange-400">{code}</td>
      <td className="px-3 py-2">{description}</td>
      <td className="px-3 py-2 text-right font-mono">{qty}</td>
    </tr>
  );
}

function AlertItem({ status, text }: { status: "good" | "warning" | "waiting"; text: string }) {
  const styles = {
    good: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    warning: "border-orange-500/45 bg-orange-500/10 text-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.08)]",
    waiting: "border-zinc-800 bg-zinc-950/80 text-zinc-500",
  };

  const dotStyles = {
    good: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
    warning: "bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.9)]",
    waiting: "bg-zinc-600",
  };

  return (
    <div className={`flex items-start gap-2 rounded-xl border p-2.5 text-[11px] leading-5 ${styles[status]}`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotStyles[status]}`} />
      <span>{text}</span>
    </div>
  );
}
