// ── KORBAN Demo Seed ──────────────────────────────────────────────────────────
// Run this once to pre-load complete Mare Island project data into localStorage.
// Access via /demo route which calls seedDemo() then redirects to /project-plan-desk

export function seedDemo() {
  const PROJECT_ID = "KRB-260614-001";

  // ── Building geometry — Mare Island L-shaped footprint ────────────────────
  // Approximate polygon in PDF coordinate space (scale: 1" = 1', puf ~12)
  const footprintPoints = [
    { x: 120, y: 80  },
    { x: 870, y: 80  },
    { x: 870, y: 240 },
    { x: 620, y: 240 },
    { x: 620, y: 420 },
    { x: 870, y: 420 },
    { x: 870, y: 830 },
    { x: 120, y: 830 },
  ];

  const pageUnitsPerFoot = 12; // 1" = 1' at 72dpi
  const linearFeet = 625;

  // ── Elevation heights ──────────────────────────────────────────────────────
  const elevationHeights = [
    { elevation: "North", overallHeightInput: "45'", belowGradeEnabled: false, belowGradeInput: "" },
    { elevation: "South", overallHeightInput: "45'", belowGradeEnabled: false, belowGradeInput: "" },
    { elevation: "East",  overallHeightInput: "32'", belowGradeEnabled: false, belowGradeInput: "" },
    { elevation: "West",  overallHeightInput: "56'", belowGradeEnabled: false, belowGradeInput: "" },
  ];

  // ── Scaffold input ─────────────────────────────────────────────────────────
  const scaffoldInput = {
    scaffoldWidth: 3,
    bayLength: 10,
    bayCount: 63,
    legCount: 64,
    turnaroundBays: false,
  };

  // ── Frame configuration — Option A Optimal ────────────────────────────────
  // Wall 45', laborer reach 6', target = 39'
  // Stack: 1×3' + 1×5' + 4×6'-4" + 4" jack = 38'-4" + 1'-8" reach
  const frameLevels = [
    { heightFt: 0.33, frameSizeFt: 3,    isTall: false, frameCode: "FM33"  },
    { heightFt: 3.33, frameSizeFt: 5,    isTall: false, frameCode: "FO5L3" },
    { heightFt: 8.33, frameSizeFt: 6.33, isTall: true,  frameCode: "FO6L3" },
    { heightFt: 14.67, frameSizeFt: 6.33, isTall: true, frameCode: "FO6L3" },
    { heightFt: 21,   frameSizeFt: 6.33, isTall: true,  frameCode: "FO6L3" },
    { heightFt: 27.33, frameSizeFt: 6.33, isTall: true, frameCode: "FO6L3" },
    { heightFt: 33.67, frameSizeFt: 6.33, isTall: true, frameCode: "FO6L3" },
  ];

  // ── Quantity engine ────────────────────────────────────────────────────────
  const quantityEngine = {
    bayCount: 63,
    legCount: 64,
    frameCount: 448,   // 64 legs × 7 jumps
    plankCount: 630,   // ~10 planks per bay × 63 bays
    crossBraceCount: 441, // 63 bays × 7 levels
    guardrailCount: 189,  // 63 bays × 3 rails
    basePlateCount: 64,
    screwJackCount: 64,
    jumps: 7,
    frameTall: 7,
    linearFeet: 625,
  };

  // ── Overlay geometry ───────────────────────────────────────────────────────
  const overlayGeometry = {
    levelName: "Level 2 / Key Floor",
    referencePoints: [{ x: 120, y: 80 }],
    elevationHeights,
    fullOverlayRows: [
      {
        id: 0, level: "Key Floor", isKeyFloor: true, closed: true,
        color: "#2563eb",
        points: footprintPoints,
      },
      {
        id: 1, level: "Level Below", isKeyFloor: false, closed: true,
        color: "#22c55e",
        points: footprintPoints.map(p => ({ x: p.x + 8, y: p.y + 8 })),
      },
    ],
  };

  // ── Section view data ──────────────────────────────────────────────────────
  const sectionData = {
    gradePoint: { x: 200, y: 680 },
    wallProfilePdf: [
      { x: 320, y: 680 },
      { x: 320, y: 140 },
    ],
    pageUnitsPerFoot: 12,
    scaffoldWidthFt: 3,
    wallOffsetFt: 1,
    frameLevels,
  };

  // ── Estimate line items ────────────────────────────────────────────────────
  const estimateLineItems = [
    { category: "Labor",    description: "Erect & Dismantle Scaffold",    qty: 625,  unit: "LF",  rate: 85,   amount: 53125 },
    { category: "Labor",    description: "Scaffold Supervision",           qty: 120,  unit: "HR",  rate: 95,   amount: 11400 },
    { category: "Material", description: "Frame Rental (7 jumps)",         qty: 448,  unit: "EA",  rate: 12,   amount: 5376  },
    { category: "Material", description: "Plank Rental",                   qty: 630,  unit: "EA",  rate: 8,    amount: 5040  },
    { category: "Material", description: "Cross Brace Rental",             qty: 441,  unit: "EA",  rate: 6,    amount: 2646  },
    { category: "Material", description: "Guard Rail System",              qty: 189,  unit: "EA",  rate: 14,   amount: 2646  },
    { category: "Material", description: "Base Plates & Screw Jacks",      qty: 128,  unit: "EA",  rate: 4,    amount: 512   },
    { category: "Equipment","description": "Delivery & Pickup",            qty: 2,    unit: "EA",  rate: 1800, amount: 3600  },
    { category: "Other",    description: "Insurance & Overhead (12%)",     qty: 1,    unit: "LS",  rate: 10,179, amount: 10179},
    { category: "Other",    description: "Profit (15%)",                   qty: 1,    unit: "LS",  rate: 14,138, amount: 14138},
  ];
  // Total ≈ $108,662 + markup ≈ $125,000

  // ── Build the full project elevation object ────────────────────────────────
  const activeElevation = {
    projectId: PROJECT_ID,
    elevationName: "North",
    wallHeight: 45,
    linearFeet,
    scale: { pageUnitsPerFoot },
    overlayGeometry,
    scaffoldInput,
    quantityEngine,
    sectionData,
    frameLevels,
    estimateLineItems,
    totalBid: 125000,
    updatedAt: new Date().toISOString(),
  };

  // ── Project record ─────────────────────────────────────────────────────────
  const projectRecord = {
    projectId: PROJECT_ID,
    projectName: "Mare Island Apartments",
    projectAddress: "Mare Island, Vallejo, CA",
    customer: "Turner Construction",
    estimator: "H. Pierre",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    takeoff: {
      levels: [
        { levelName: "Level 2", linearFeet: 625, wallHeight: 45, isKeyFloor: true },
      ],
    },
  };

  // ── Write to localStorage ──────────────────────────────────────────────────
  try {
    // Active project pointer
    localStorage.setItem("korbanActiveProjectId", PROJECT_ID);

    // Project record
    const projects: Record<string, unknown> = JSON.parse(
      localStorage.getItem("korbanProjects") ?? "{}"
    );
    projects[PROJECT_ID] = projectRecord;
    localStorage.setItem("korbanProjects", JSON.stringify(projects));

    // Active elevation
    localStorage.setItem("korbanActiveElevation", JSON.stringify(activeElevation));

    // Elevation by project
    const elevations: Record<string, unknown> = JSON.parse(
      localStorage.getItem("korbanElevations") ?? "{}"
    );
    elevations[PROJECT_ID] = activeElevation;
    localStorage.setItem("korbanElevations", JSON.stringify(elevations));

    // Backend defaults
    localStorage.setItem("korbanBackendDefaults", JSON.stringify({
      frameHeight: 6.33,
      workerReachHeight: 6,
      scaffoldWidth: 3,
      bayLength: 10,
      screwJackMaxExtension: 12,
    }));

    console.log("✅ KORBAN demo seed complete — Mare Island Apartments loaded");
    return true;
  } catch (e) {
    console.error("❌ Demo seed failed:", e);
    return false;
  }
}
