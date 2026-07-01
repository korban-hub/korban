"use client";

import { useEffect, useState } from "react";

// ── Constants matching projectStore.ts exactly ────────────────────────────────
const ACTIVE_PROJECT_KEY   = "korbanActiveProjectId";
const ACTIVE_ELEVATION_KEY = "korbanActiveElevationId";
const PROJECT_DATA_KEY     = "korbanProjectData_v1";
const PROJECT_ID           = "KRB-260614-001";
const LEVEL_ID             = "mare-island-main";
const ELEVATION_ID         = "north-elevation";

// ── Seed function ─────────────────────────────────────────────────────────────
function seedDemo(): boolean {
  try {
    // Building footprint points (matching the clean SVG demo shape)
    const footprintPoints = [
      { x: 160, y: 120 }, { x: 880, y: 120 },
      { x: 880, y: 300 }, { x: 700, y: 300 },
      { x: 700, y: 480 }, { x: 880, y: 480 },
      { x: 880, y: 600 }, { x: 160, y: 600 },
    ];

    // Scale: SVG units per foot. Building is 180' wide × 90' tall in SVG = 720px × 480px
    // pageUnitsPerFoot = 720/180 = 4 (≈ 1/4"=1' at 72dpi)
    const pageUnitsPerFoot = 4;

    // Scaffold input — 3' wide, 10' bays
    const scaffoldInput = {
      scaffoldWidth: 3,
      standardBayLength: 10,
      frameHeight: 6 + 4 / 12,
      plankCountPerBay: 3,   // 3 planks for 3' wide scaffold
      bracePattern: "Every Bay",
      wallOffset: 1,
    };

    // Quantity engine — calculated matching projectStore.calculateQuantityEngine
    // linearFeet: 625, wallHeight: 45, workerReachHeight: 6
    // bayCount = ceil(625/10) = 63
    // legCount = 63 + 1 = 64
    // effectiveStackHeight = 45 - 6 = 39
    // frameTall = ceil(39 / 6.333) = ceil(6.16) = 7
    // frameCount = 64 * 7 = 448
    // plankCount = 63 * 3 = 189  (per bay per level — planks per level, not total)
    // crossBraceCount = 63
    // guardrailCount = 63
    const quantityEngine = {
      bayCount: 63,
      legCount: 64,
      jumps: 7,
      frameTall: 7,
      frameCount: 448,
      plankCount: 189,
      crossBraceCount: 63,
      guardrailCount: 63,
      basePlateCount: 64,
      screwJackCount: 64,
    };

    // Overlay geometry — structured exactly as TakeoffOverlayGeometry
    const overlayGeometry = {
      elevationName: "North",
      levelName: "Main Level",
      tracedPerimeter: footprintPoints,
      overlayPoints: footprintPoints,
      wallSegments: [],
      referencePoints: [{ x: 160, y: 120 }],
      elevationPoints: footprintPoints,
      fullOverlayRows: [
        {
          id: 1,
          isKeyFloor: true,
          overlayType: "Level",
          level: "Key Floor",
          points: footprintPoints,
          closed: true,
          linealFeet: 625,
          color: "#2563eb",
          pageNumber: 1,
        },
        {
          id: 2,
          isKeyFloor: false,
          overlayType: "Level",
          level: "Level Below",
          points: footprintPoints.map(p => ({ x: p.x + 12, y: p.y + 12 })),
          closed: true,
          linealFeet: 610,
          color: "#22c55e",
          pageNumber: 1,
        },
      ],
      elevationRefs: [
        { elevation: "North", points: [{ x: 160, y: 120 }, { x: 880, y: 120 }], closed: false, linealFeet: 180, manualLinealFeetInput: "180'", source: "Overlay" },
        { elevation: "South", points: [{ x: 160, y: 600 }, { x: 880, y: 600 }], closed: false, linealFeet: 180, manualLinealFeetInput: "180'", source: "Overlay" },
        { elevation: "East",  points: [{ x: 880, y: 120 }, { x: 880, y: 600 }], closed: false, linealFeet: 135, manualLinealFeetInput: "135'", source: "Overlay" },
        { elevation: "West",  points: [{ x: 160, y: 120 }, { x: 160, y: 600 }], closed: false, linealFeet: 90,  manualLinealFeetInput: "90'",  source: "Overlay" },
      ],
      elevationHeights: [
        { elevation: "North", overallHeightInput: "45'", belowGradeEnabled: false, belowGradeInput: "0'", multipleHeights: false, areas: [] },
        { elevation: "South", overallHeightInput: "45'", belowGradeEnabled: false, belowGradeInput: "0'", multipleHeights: false, areas: [] },
        { elevation: "East",  overallHeightInput: "32'", belowGradeEnabled: false, belowGradeInput: "0'", multipleHeights: false, areas: [] },
        { elevation: "West",  overallHeightInput: "56'", belowGradeEnabled: false, belowGradeInput: "0'", multipleHeights: false, areas: [] },
      ],
      scale: { pageUnitsPerFoot },
    };

    // Active elevation
    const elevation = {
      elevationId: ELEVATION_ID,
      elevationName: "North",
      levelName: "Main Level",
      linearFeet: 625,
      wallHeight: 45,
      phase: "Main",
      mobilization: "Base Bid",
      overlayGeometry,
      scale: { pageUnitsPerFoot },
      scaffoldInput,
      quantityEngine,
      sectionView: {
        frameMakeup: "5 × 6'-4\" + 1 × 5'-0\" + 1 × 3'-0\"",
        selectedRun: "Run N-01",
        wallOffset: 1,
        sectionType: "A-A",
      },
      elevationBreakdown: [
        { elevation: "North", approxLinearFeet: 180 },
        { elevation: "South", approxLinearFeet: 180 },
        { elevation: "East",  approxLinearFeet: 135 },
        { elevation: "West",  approxLinearFeet: 90  },
        { elevation: "Courtyard", approxLinearFeet: 40 },
      ],
    };

    // Project record — nested structure matching ProjectRecord
    const projectRecord = {
      projectId: PROJECT_ID,
      projectName: "Mare Island Apartments",
      projectAddress: "Mare Island, Vallejo, CA",
      customer: "Turner Construction",
      estimator: "H. Pierre",
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
      takeoff: {
        levels: [
          {
            levelId: LEVEL_ID,
            levelName: "Main Level",
            elevations: [elevation],
          },
        ],
      },
    };

    // Write to localStorage using EXACT keys from projectStore.ts
    localStorage.setItem(ACTIVE_PROJECT_KEY, PROJECT_ID);
    localStorage.setItem(ACTIVE_ELEVATION_KEY, ELEVATION_ID);

    const projectData: Record<string, unknown> = JSON.parse(
      localStorage.getItem(PROJECT_DATA_KEY) ?? "{}"
    );
    projectData[PROJECT_ID] = projectRecord;
    localStorage.setItem(PROJECT_DATA_KEY, JSON.stringify(projectData));

    // Also write backend defaults
    localStorage.setItem("korbanBackendSettings_v1", JSON.stringify({
      company: { companyName: "Sudoxe Studios Scaffold", companyAddress: "Vallejo, CA", companyPhone: "(707) 555-0100", companyEmail: "estimating@sudoxe.com", companyLogoUrl: "", licenseNumber: "CA-SC-004412", unionDefault: "Union", mainOfficeLocation: "Vallejo, CA", travelStartAddress: "Vallejo, CA" },
      scaffold: { scaffoldType: "Frame", defaultScaffoldWidth: 3, defaultBayLength: 10, wallOffset: 1, turnaroundBaysEnabled: false, insideCornerLogic: "Reset", outsideCornerLogic: "Standard", bracePattern: "Every Bay", frameHeight: 6.333, workerReachHeight: 6, screwJackMaxExtension: 12, jumpLogic: "Auto" },
      materials: [],
      pricing: { laborRate: 85, markupPercent: 15, overheadPercent: 12, bondPercent: 1.5, taxPercent: 0, defaultContractType: "Lump Sum" },
    }));

    console.log("✅ KORBAN demo seed complete — Mare Island Apartments");
    return true;
  } catch (e) {
    console.error("❌ Demo seed failed:", e);
    return false;
  }
}

// ── Demo page ─────────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [status, setStatus] = useState<"seeding" | "done" | "error">("seeding");

  useEffect(() => {
    const success = seedDemo();
    setStatus(success ? "done" : "error");
    if (success) {
      // Redirect to landing/login page to start full demo flow
      setTimeout(() => { window.location.href = "/"; }, 1200);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl border border-orange-500/30 bg-orange-500/10 flex items-center justify-center">
          <span className="text-2xl font-black text-orange-400">K</span>
        </div>
        {status === "seeding" && (
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">Preparing Demo…</p>
        )}
        {status === "done" && (
          <>
            <p className="text-sm font-bold text-orange-300">Mare Island Apartments</p>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">625 LF · 45' Wall · $125K Bid</p>
            <p className="text-xs text-zinc-600">Launching demo…</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-sm font-bold text-red-400">Seed failed</p>
            <a href="/" className="text-xs text-zinc-500 underline">Continue anyway →</a>
          </>
        )}
      </div>
    </main>
  );
}
