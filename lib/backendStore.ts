/**
 * backendStore.ts
 *
 * KORBAN's single source of truth for estimator-configurable defaults.
 * This is the "Backend" - the control center an estimator sets up once,
 * which then quietly feeds Takeoff Workspace, Set Scaffold, Frame
 * Configuration, Section View, Estimate Review, and the Proposal output.
 *
 * ONE HOME PER NUMBER. Piece rental rates live in material.items and nowhere
 * else; the duplicate copies that used to sit in pricing have been removed so
 * the two can't drift apart.
 */

// --- Types ------------------------------------------------------------------

export type CompanySettings = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogoUrl: string;
  licenseNumber: string;
  unionDefault: "Union" | "Non-Union";
  mainOfficeLocation: string;
  travelStartAddress: string;
  /** Printed under the signature block when the company is a signatory. */
  unionAffiliation: string;
  /** Licensing board line printed on the proposal. */
  licenseBoardLine: string;
  /**
   * Region the Bid Room pulls local construction news for. A contractor in
   * Vallejo cares about Bay Area starts, not national averages.
   */
  newsRegion: string;
};

/** The person whose name and numbers go on the proposal. */
export type EstimatorSettings = {
  estimatorName: string;
  estimatorTitle: string;
  estimatorCell: string;
  estimatorPhone: string;
  estimatorFax: string;
  estimatorEmail: string;
};

export type ScaffoldDefaults = {
  scaffoldType: string;
  defaultScaffoldWidth: number;
  defaultBayLength: number;
  wallOffset: number;
  turnaroundBaysEnabled: boolean;
  insideCornerLogic: string;
  outsideCornerLogic: string;
  bracePattern: "Every Bay" | "Every Other Bay" | "Custom";
  frameHeight: number;
  workerReachHeight: number;
  /**
   * Maximum screw jack extension in inches. Range 1"-18". Default 12" (1 foot).
   * Frame Configuration uses this to calculate the base frame arrangement -
   * the remaining height after frames is covered by the screw jack up to this
   * maximum. 12" keeps a safe margin below the 18" physical limit.
   */
  screwJackMaxExtension: number;
  jumpLogic: string;
};

/**
 * How much of each piece a bay takes. Confirmed by the material audit: braces,
 * planks, guardrails and pins all repeat per jump, which is what the original
 * engine got wrong. Each company can encode its own standard.
 */
export type MaterialRules = {
  crossBracesPerBayPerJump: number;
  guardrailTopPerBay: number;
  guardrailIntermediatePerBay: number;
  couplingPinsPerFrame: number;
};

export type MaterialItem = {
  id: string;
  name: string;
  isCore: boolean;
  /** Monthly rental rate per piece. */
  unitRate: number;
  /** Whether this piece bills as rental on the estimate. */
  billsAsRental: boolean;
};

/**
 * A real piece of stock, by part number.
 *
 * The categories above describe how a bay is built; this describes what is
 * actually on the yard. A frame is never just a frame - it is a 6'-4" by 3',
 * and it has its own cost, rate and weight. Load lists, the inventory page
 * and truck counts all read from here.
 */
export type StockItem = {
  /**
   * Stable key. Several real parts carry no part number - wood pads, sleeves,
   * stud clamps, sammy's - so the number can't be the identity.
   */
  id: string;
  partNo: string;
  description: string;
  /** Which of the six core categories this belongs to. Blank for specialty. */
  category: string;
  /** Which column this prints in on the paper load list. 1, 2 or 3. */
  column: number;
  /** What it cost to buy. Drives replacement value and loss recovery. */
  purchaseCost: number;
  /** Monthly rental rate for this specific part. */
  rentalRate: number;
  /** Pounds each. Drives load counts and truck planning. */
  weightLbs: number;
  /** How many the company owns. Zero until entered. */
  owned: number;
  /**
   * Planks this piece carries, for brackets. 12" takes 1, 20" takes 2, 30"
   * takes 3. Zero for everything that isn't a bracket.
   */
  plankCapacity?: number;
};

/**
 * What a finish demands of the scaffold.
 *
 * A plasterer works off a narrow deck; a mason needs room for block, mortar
 * and a wheelbarrow. The trade being performed decides the frame width and
 * how many planks go down, so the estimator picks the work and the scaffold
 * follows. Masonry additionally hangs a bracket to widen the deck further.
 *
 * An estimator who changes frame width by hand overrides all of this - the
 * rule is a sensible default, not a cage.
 */
export type FinishRule = {
  finish: string;
  scaffoldWidth: number;
  planksPerJump: number;
  /** Bracket hung at every jump to widen the deck. Blank for none. */
  bracketPartNo: string;
};

export type ObstructionRules = {
  /** Percentage added on top of normal output. */
  moderateLaborPercent: number;
  moderateMaterialPercent: number;
  heavyLaborPercent: number;
  heavyMaterialPercent: number;
};

export type MaterialDefaults = {
  items: MaterialItem[];
  rules: MaterialRules;
  /** The full parts catalog with cost, rate, weight and owned counts. */
  stock: StockItem[];
  /** Which frame and deck each finish calls for. */
  finishRules: FinishRule[];
  /** What obstructions cost in labor and material. */
  obstructions: ObstructionRules;
};

/**
 * One set of hourly rates. Kept as a block so union and non-union can be
 * entered side by side and compared - a GC asking "what would this cost
 * non-union" shouldn't require re-typing every rate.
 */
export type LaborRateSet = {
  apprenticeRate: number;
  journeymanRate: number;
  foremanRate: number;
  /** Applied to erect and dismantle hours on the estimate. */
  erectHourlyRate: number;
  /** Travel labor. Separate from the truck rate, which is in logistics. */
  travelHourlyRate: number;
};

export type LaborDefaults = {
  installCrewSize: number;
  dismantleCrewSize: number;
  installProductionRate: number;
  dismantleProductionRate: number;
  /** Which set the estimate uses by default. Per-bid override lives on the estimate. */
  activeRateSet: "union" | "nonUnion";
  union: LaborRateSet;
  nonUnion: LaborRateSet;
  /** Kept so older records keep working; mirrors the active set. */
  apprenticeRate: number;
  journeymanRate: number;
  foremanRate: number;
  erectHourlyRate: number;
  travelHourlyRate: number;
  /** Dismantle hours as a share of erect hours. Confirmed at 70%. */
  dismantlePercentOfErect: number;
  travelTimeHours: number;
  /** Planks per truck load. Loads drive every travel figure. */
  planksPerLoad: number;
  /**
   * One-way legs a load travels. Four covers the whole job: loaded out to
   * site, empty back to yard, empty out again at dismantle, loaded home.
   */
  legsPerLoad: number;
  /** Highway speed used to turn miles into hours. Trucks, not cars. */
  travelSpeedMph: number;
  /** Hourly cost of a truck on the road. */
  truckHourlyRate: number;
  truckDeliveryRate: number;
  mobilizationCost: number;
  dismantleCost: number;
};

export type PricingDefaults = {
  rentalDurationDays: number;
  rentalPeriodType: "30 Days" | "60 Days" | "90 Days" | "120 Days" | "Custom";
  miscCost: number;
  markupPercent: number;
  marginPercent: number;
  taxPercent: number;
  partialExteriorMarkupPercent: number;
  /** Markup applied to labor cost to reach labor revenue. */
  laborMarkupPercent: number;
};

/**
 * Add-alternate pricing. Every rate the alternate engine uses, in one place.
 * Changing any of these moves the alternate on every open bid.
 */
export type AlternateRateDefaults = {
  shrinkWrapPerSqFt: number;
  shrinkWrapFullAddedHeightFt: number;
  shrinkWrapCapHeightFt: number;

  nettingPerSqFt: number;
  nettingAddedHeightFt: number;

  canopyLinearFeetPerUnit: number;
  canopyInstallHoursPerUnit: number;
  canopyDismantleHoursPerUnit: number;
  canopyTravelHoursPerUnit: number;
  canopyMaterialPerUnit: number;

  hoistInstallHours: number;
  hoistDismantleHours: number;
  hoistRentalEach: number;

  stairTowerRentPerJump: number;
  stairTowerTallThresholdFt: number;
  stairTowerLevelsPerMobilization: number;
  stairTowerHoursPerMobilization: number;
  /** Only applies above the tall threshold; below it dismantle is explicit. */
  stairTowerDismantlePercent: number;
  /** Travel hours per stair tower, at any height. */
  stairTowerTravelHours: number;
  /** Up-and-over a parapet, typically 2-4' tall. Added when selected. */
  stairTowerParapetInstallHours: number;
  stairTowerParapetDismantleHours: number;
  /** Walkoffs - decks that access a floor level. Per walkoff. */
  stairTowerWalkoffInstallHours: number;
  stairTowerWalkoffDismantleHours: number;
  stairTowerWalkoffTravelHours: number;
  /**
   * Install and dismantle hours by building height, up to the tall threshold.
   * Bands are explicit rather than derived, because crew scaling on a stair
   * tower isn't linear - it steps.
   */
  stairTowerHourBands: { throughFt: number; installHours: number; dismantleHours: number }[];

  toeBoardPerLinearFootPerJump: number;
};

export type AddAlternateDefault = {
  id: string;
  title: string;
  description: string;
  defaultValue: number;
};

export type ProposalDefaults = {
  clientLogoUrl: string;
  proposalNumberFormat: string;
  introLanguage: string;
  scopeLanguage: string;
  exclusionsLanguage: string;
  termsLanguage: string;
  rentalDurationLanguage: string;
  signatureBlock: string;
  /** Notes printed under the pricing table. One per line. */
  notesLanguage: string;
  /** Qualifications list. One per line. */
  qualificationsLanguage: string;
  /** Inclusions list. One per line. */
  inclusionsLanguage: string;
  /** Closing paragraph above the signature blocks. */
  closingLanguage: string;
  addAlternateDefaults: AddAlternateDefault[];
};

export type BackendSettings = {
  company: CompanySettings;
  estimator: EstimatorSettings;
  scaffold: ScaffoldDefaults;
  material: MaterialDefaults;
  labor: LaborDefaults;
  pricing: PricingDefaults;
  alternates: AlternateRateDefaults;
  proposal: ProposalDefaults;
  schemaVersion: number;
};

// --- Defaults ---------------------------------------------------------------

export const CORE_MATERIAL_NAMES = [
  "Frames",
  "Planks",
  "Cross Braces",
  "Guardrails",
  "Base Plates",
  "Screw Jacks",
];

export const SPECIALTY_MATERIAL_NAMES = [
  "Toe Boards",
  "Wall Ties",
  "Ladders",
  "Stair Towers",
  "Pedestrian Canopy",
  "Netting",
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildDefaultMaterialItems(): MaterialItem[] {
  const coreRates: Record<string, number> = {
    Frames: 4,
    Planks: 2,
    "Cross Braces": 3.25,
    Guardrails: 4.1,
    "Base Plates": 1.85,
    "Screw Jacks": 2.4,
  };

  // Frames and planks bill as rental today. The rest carry a rate so a company
  // can switch them on without re-entering numbers.
  const billed = new Set(["Frames", "Planks"]);

  const core = CORE_MATERIAL_NAMES.map((name) => ({
    id: slugify(name),
    name,
    isCore: true,
    unitRate: coreRates[name] ?? 0,
    billsAsRental: billed.has(name),
  }));

  const specialty = SPECIALTY_MATERIAL_NAMES.map((name) => ({
    id: slugify(name),
    name,
    isCore: false,
    unitRate: 0,
    billsAsRental: false,
  }));

  return [...core, ...specialty];
}

/**
 * The parts catalog. Descriptions and part numbers are the trade's, not ours -
 * they match what shows on a load list and what the yard calls things. Costs,
 * rates, weights and owned counts start at zero: those are the company's
 * numbers and inventing them would put fiction into a bid.
 */
function buildDefaultStock(): StockItem[] {
  // partNo, description, category, column (1-3 as they print on the form)
  const rows: [string, string, string, number][] = [
    // -- Column one: frames, jacks, bases, putlogs, spreaders --------------
    ["FO7CP", "7' Pedestrian Canopy", "", 1],
    ["FO6L3", "6'-4\" H - 3' W Frame", "Frames", 1],
    ["FO5L3", "5' H - 3' W Frame", "Frames", 1],
    ["FM33", "3' H - 3' W Frame", "Frames", 1],
    ["FO6L42", "6'-4\" H - 42\" W Frame", "Frames", 1],
    ["FO5L42", "5' H - 42\" W Frame", "Frames", 1],
    ["FM342", "3' H - 42\" W Frame", "Frames", 1],
    ["FO6L", "6'-4\" H - 5' W Frame", "Frames", 1],
    ["FM5", "5' Mason Frame", "Frames", 1],
    ["FM3", "3' Mason Frame", "Frames", 1],
    ["FO6L2", "6'-4\" H x 2' W Frame", "Frames", 1],
    ["FO5L2", "5' H x 2' W Frame", "Frames", 1],
    ["FM32", "3' H x 2' W Frame", "Frames", 1],
    ["", "Wood Pad 12\" x 12\"", "", 1],
    ["AL1", "Screw Jack w/ No Base", "Screw Jacks", 1],
    ["AL1S", "Screw Jack w/ Base Plate", "Screw Jacks", 1],
    ["BP1", "Fixed Base Plate", "Base Plates", 1],
    ["BP2", "Swivel Base Plate", "Base Plates", 1],
    ["BP3", "Curved Base Plate", "Base Plates", 1],
    ["SJS", "Swivel Jacks", "Screw Jacks", 1],
    ["", "12\" Sleeves", "", 1],
    ["", "Stud Clamps", "", 1],
    ["P12", "12' Putlogs", "", 1],
    ["P16", "16' Putlogs", "", 1],
    ["P22", "22' Putlogs", "", 1],
    ["PH2", "Putlog Hangers", "", 1],
    ["SP3", "3' Spreader Bar", "", 1],
    ["SP42", "42\" Spreader Bar", "", 1],
    ["SP5", "5' Spreader Bar", "", 1],

    // -- Column two: braces, guardrails, brackets, hardware ----------------
    ["B42", "4x2 Cross Brace", "Cross Braces", 2],
    ["B52", "5x2 Cross Brace", "Cross Braces", 2],
    ["B72", "7x2 Cross Brace", "Cross Braces", 2],
    ["B82", "8x2 Cross Brace", "Cross Braces", 2],
    ["B102", "10x2 Cross Brace", "Cross Braces", 2],
    ["B44", "4x4 Cross Brace", "Cross Braces", 2],
    ["B54", "5x4 Cross Brace", "Cross Braces", 2],
    ["B74", "7x4 Cross Brace", "Cross Braces", 2],
    ["B84", "8x4 Cross Brace", "Cross Braces", 2],
    ["B104", "10x4 Cross Brace", "Cross Braces", 2],
    ["GR2", "2' Guard Rail", "Guardrails", 2],
    ["GR3", "3' Guard Rail", "Guardrails", 2],
    ["GR42", "42\" Guard Rail", "Guardrails", 2],
    ["GR4", "4' Guard Rail", "Guardrails", 2],
    ["GR5", "5' Guard Rail", "Guardrails", 2],
    ["GR7", "7' Guard Rail", "Guardrails", 2],
    ["GR8", "8' Guard Rail", "Guardrails", 2],
    ["GR10", "10' Guard Rail", "Guardrails", 2],
    ["GHB3", "3' Gooser Brace", "", 2],
    ["GHB5", "5' Gooser Brace", "", 2],
    ["GHB7", "7' Gooser Brace", "", 2],
    ["GHB10", "10' Gooser Brace", "", 2],
    ["BR12S", "12\" Side Bracket", "Brackets", 2],
    ["BR20S", "20\" Side Bracket", "Brackets", 2],
    ["BR30S", "30\" Side Bracket", "Brackets", 2],
    ["BR20E", "20\" End Bracket", "Brackets", 2],
    ["BR30E", "30\" End Bracket", "Brackets", 2],
    ["", "1/2\" All Thread", "", 2],
    ["", "1/2\" Nuts", "", 2],
    ["", "1/2\" Redheads", "", 2],
    ["", "1/2\" Steel Sammy's", "", 2],
    ["", "1/2\" Wood Sammy's", "", 2],

    // -- Column three: tube and clamp, ladders, stairs, planks -------------
    ["CGRP", "Male Corner Guard", "", 3],
    ["ST4SG", "4' Tube", "", 3],
    ["ST6SG", "6' Tube", "", 3],
    ["ST8SG", "8' Tube", "", 3],
    ["ST10SG", "10' Tube", "", 3],
    ["ST13SG", "13' Tube", "", 3],
    ["CRA19", "Right Angle Clamp", "", 3],
    ["CSA19", "Swivel Clamp", "", 3],
    ["", "12\" Kickers", "", 3],
    ["", "18\" Kickers", "", 3],
    ["CPS", "Coupling Pin", "", 3],
    ["PTP", "Pig Tail Pin", "", 3],
    ["", "Swivel Clamp Beam Clamp", "", 3],
    ["", "Right Angle Beam Clamp", "", 3],
    ["SAU3", "3' Steel Ladder", "", 3],
    ["SAU6", "6' Steel Ladder", "", 3],
    ["SAUB", "Ladder Bracket", "", 3],
    ["SU6", "6'-4\" Stair Unit", "", 3],
    ["SU6OR", "Outside Rail", "", 3],
    ["SU6IR", "Inner Rail", "", 3],
    ["WP5", "5' Wood Plank", "Planks", 3],
    ["WP7", "7' Wood Plank", "Planks", 3],
    ["WP9", "9' Wood Plank", "Planks", 3],
    ["WP10", "10' Wood Plank", "Planks", 3],
    ["WP12", "12' Wood Plank", "Planks", 3],
    ["SB7", "7' Hatch Board", "", 3],
    ["SB8", "8' Hatch Board", "", 3],
    ["SB10", "10' Hatch Board", "", 3],
    ["", "Sheetrock Cart", "", 3],
    ["", "Netting", "", 3],
    ["", "Wire & Nails", "", 3],
  ];

  // Bracket capacity is a property of the piece, not a rule somewhere else.
  const capacity: Record<string, number> = {
    BR12S: 1, BR20S: 2, BR30S: 3, BR20E: 2, BR30E: 3,
  };

  return rows.map(([partNo, description, category, column]) => ({
    id: partNo || description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    partNo,
    description,
    category,
    column,
    purchaseCost: 0,
    rentalRate: 0,
    weightLbs: 0,
    owned: 0,
    plankCapacity: capacity[partNo] ?? 0,
  }));
}

export const DEFAULT_FINISH_RULES: FinishRule[] = [
  { finish: "Plaster / Stucco", scaffoldWidth: 3, planksPerJump: 3, bracketPartNo: "" },
  { finish: "Paint", scaffoldWidth: 3, planksPerJump: 3, bracketPartNo: "" },
  { finish: "Siding", scaffoldWidth: 3, planksPerJump: 3, bracketPartNo: "" },
  { finish: "Metal Panel", scaffoldWidth: 3.5, planksPerJump: 4, bracketPartNo: "" },
  { finish: "Roofing", scaffoldWidth: 3.5, planksPerJump: 4, bracketPartNo: "" },
  { finish: "Inspection / Access", scaffoldWidth: 3.5, planksPerJump: 4, bracketPartNo: "" },
  // Six on the frame plus two on a 20" bracket makes an eight-plank deck.
  { finish: "Masonry", scaffoldWidth: 5, planksPerJump: 6, bracketPartNo: "BR20S" },
];

export const DEFAULT_OBSTRUCTION_RULES: ObstructionRules = {
  moderateLaborPercent: 15,
  moderateMaterialPercent: 10,
  heavyLaborPercent: 28,
  heavyMaterialPercent: 15,
};

export const DEFAULT_MATERIAL_RULES: MaterialRules = {
  crossBracesPerBayPerJump: 2,
  guardrailTopPerBay: 4,
  guardrailIntermediatePerBay: 2,
  couplingPinsPerFrame: 2,
};

export const DEFAULT_ALTERNATE_RATES: AlternateRateDefaults = {
  shrinkWrapPerSqFt: 2.5,
  shrinkWrapFullAddedHeightFt: 14,
  shrinkWrapCapHeightFt: 16,

  nettingPerSqFt: 0.8,
  nettingAddedHeightFt: 3,

  canopyLinearFeetPerUnit: 90,
  canopyInstallHoursPerUnit: 24,
  canopyDismantleHoursPerUnit: 16,
  canopyTravelHoursPerUnit: 6,
  canopyMaterialPerUnit: 275,

  hoistInstallHours: 20,
  hoistDismantleHours: 16,
  hoistRentalEach: 400,

  stairTowerRentPerJump: 110,
  stairTowerTallThresholdFt: 55,
  stairTowerLevelsPerMobilization: 2,
  stairTowerHoursPerMobilization: 24,
  stairTowerDismantlePercent: 75,
  stairTowerTravelHours: 6,
  stairTowerParapetInstallHours: 16,
  stairTowerParapetDismantleHours: 8,
  stairTowerWalkoffInstallHours: 8,
  stairTowerWalkoffDismantleHours: 8,
  stairTowerWalkoffTravelHours: 2,
  stairTowerHourBands: [
    { throughFt: 19, installHours: 16, dismantleHours: 12 },
    { throughFt: 29, installHours: 24, dismantleHours: 16 },
    { throughFt: 39, installHours: 40, dismantleHours: 32 },
    { throughFt: 55, installHours: 48, dismantleHours: 40 },
  ],

  toeBoardPerLinearFootPerJump: 2.85,
};

const DEFAULT_NOTES = [
  "Gabled ends will not qualify for roof fall protection.",
  "Netting life expectancy is approx. 6 months. Any fixes to be done on T&M basis after 6 months.",
  "Scaffold tie-backs figured to wall framing of building. Patching of ties to be done by others.",
  "Must have truck access to all elevations of each building for install and dismantle of scaffold.",
  "Price based on normal work week and hours. Monday - Friday 7am-3:30pm",
].join("\n");

const DEFAULT_INCLUSIONS = [
  "Scaffold erected and dismantled per Cal-OSHA guidelines",
  "All labor, materials, tools and equipment",
  "Delivery, install and removal",
].join("\n");

const DEFAULT_EXCLUSIONS = [
  "Overhead protection", "CCIP / OCIP", "Parking costs",
  "License, permits and fees", "Toe boards", "Material hoisting",
  "Plywood / fire treated plywood", "Shoring", "Ramps / bridges",
  "Roof and deck damage", "Bonds", "Drug testing",
  "Roof fall protection", "Netting", "Engineering",
  "Inside fall protection", "Patching holes", "100% tie off",
  "Waiver of subrogation", "Containment", "Liquidated damages",
].join("\n");

const DEFAULT_QUALIFICATIONS = [
  "We reserve the right to negotiate mutual and agreeable contract terms and conditions prior to commencement of work.",
  "Scaffold shall be installed to comply with all Cal-OSHA regulations.",
  "Truck access is required to the work area for installation and removal. The contractor is responsible for providing parking permits if required.",
  "No scaffold figured for walls and soffits 13ft and below at grade level, or 9ft and below at roof areas.",
  "Pre-construction meeting required for design layout and project schedule.",
  "Any debris, material or machinery that may interfere with installation shall be removed by the contractor before we commence.",
  "Grade and soil compaction to be adequate for scaffold installation and loads.",
  "It is the responsibility of the contractor to maintain grade conditions to prevent erosion, undermining and instability for the installed scaffolding.",
  "A 14 day notification for installation is required prior to job start.",
  "A signed proposal, sub-contract or purchase order is required prior to commencement of work.",
  "Working scaffold platforms are not to be used as building access and egress.",
  "Tie-ins to building are based on one time only.",
  "We are not responsible for any roof or deck damage.",
  "Quotation is valid for 30 days.",
].join("\n");

export const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
  company: {
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    companyLogoUrl: "",
    licenseNumber: "",
    unionDefault: "Union",
    mainOfficeLocation: "",
    travelStartAddress: "",
    unionAffiliation: "",
    licenseBoardLine: "Contractors State License Board - P.O. Box 26000, Sacramento, CA 95826",
    newsRegion: "",
  },
  estimator: {
    estimatorName: "",
    estimatorTitle: "Estimator",
    estimatorCell: "",
    estimatorPhone: "",
    estimatorFax: "",
    estimatorEmail: "",
  },
  scaffold: {
    scaffoldType: "Frame Scaffold",
    defaultScaffoldWidth: 3,
    defaultBayLength: 10,
    wallOffset: 1,
    turnaroundBaysEnabled: true,
    insideCornerLogic: "Double Leg",
    outsideCornerLogic: "Double Leg",
    bracePattern: "Every Bay",
    frameHeight: 6 + 4 / 12,
    workerReachHeight: 6,
    screwJackMaxExtension: 12,
    jumpLogic: "Standard",
  },
  material: {
    items: buildDefaultMaterialItems(),
    rules: DEFAULT_MATERIAL_RULES,
    stock: buildDefaultStock(),
    finishRules: DEFAULT_FINISH_RULES,
    obstructions: DEFAULT_OBSTRUCTION_RULES,
  },
  labor: {
    installCrewSize: 4,
    dismantleCrewSize: 4,
    installProductionRate: 25,
    dismantleProductionRate: 35,
    activeRateSet: "union",
    union: {
      apprenticeRate: 48,
      journeymanRate: 72,
      foremanRate: 85,
      erectHourlyRate: 68,
      travelHourlyRate: 70,
    },
    nonUnion: {
      apprenticeRate: 32,
      journeymanRate: 48,
      foremanRate: 60,
      erectHourlyRate: 45,
      travelHourlyRate: 47,
    },
    apprenticeRate: 48,
    journeymanRate: 72,
    foremanRate: 85,
    erectHourlyRate: 68,
    travelHourlyRate: 70,
    dismantlePercentOfErect: 70,
    travelTimeHours: 1,
    planksPerLoad: 150,
    legsPerLoad: 4,
    travelSpeedMph: 45,
    truckHourlyRate: 75,
    truckDeliveryRate: 425,
    mobilizationCost: 1200,
    dismantleCost: 0,
  },
  pricing: {
    rentalDurationDays: 30,
    rentalPeriodType: "30 Days",
    miscCost: 0,
    markupPercent: 15,
    marginPercent: 0,
    taxPercent: 0,
    partialExteriorMarkupPercent: 6,
    laborMarkupPercent: 35,
  },
  alternates: DEFAULT_ALTERNATE_RATES,
  proposal: {
    clientLogoUrl: "",
    proposalNumberFormat: "KRB-{YYMMDD}-{seq}",
    introLanguage:
      "We propose to furnish on rent, install and remove exterior scaffolding as defined by the scope and qualifications below. Pricing includes all labor, materials, tools and equipment in accordance with our terms and conditions for the completion of this project.",
    scopeLanguage: "",
    exclusionsLanguage: DEFAULT_EXCLUSIONS,
    termsLanguage: "",
    rentalDurationLanguage:
      "Base rental is monthly. Duration applies billing months to the bid amount.",
    signatureBlock: "",
    notesLanguage: DEFAULT_NOTES,
    qualificationsLanguage: DEFAULT_QUALIFICATIONS,
    inclusionsLanguage: DEFAULT_INCLUSIONS,
    closingLanguage:
      "We are honored to have the opportunity to provide this quotation and confident you will give us your utmost consideration in the award of it. We look forward to working with your company and are sure we can provide a safe and functional product in a timely and professional manner that meets every requirement of the project. Should you have questions or need more detailed clarification, please don't hesitate to call.",
    addAlternateDefaults: [
      { id: "netting", title: "Debris Netting", description: "Provide debris netting at scaffold exterior elevations.", defaultValue: 9800 },
      { id: "toe-boards", title: "Toe Boards", description: "Provide toe boards at working deck elevations where required.", defaultValue: 6200 },
      { id: "canopy", title: "Pedestrian Canopy", description: "Provide pedestrian canopy protection at designated access zones.", defaultValue: 22500 },
      { id: "stair-tower", title: "Stair Tower", description: "Provide scaffold stair tower access at field-determined location.", defaultValue: 14500 },
    ],
  },
  schemaVersion: 2,
};

// --- Storage plumbing -------------------------------------------------------

const BACKEND_SETTINGS_KEY = "korbanBackendSettings_v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asEnum<T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function normalizeCompany(value: unknown): CompanySettings {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.company;
  return {
    companyName: asString(r.companyName, d.companyName),
    companyAddress: asString(r.companyAddress, d.companyAddress),
    companyPhone: asString(r.companyPhone, d.companyPhone),
    companyEmail: asString(r.companyEmail, d.companyEmail),
    companyLogoUrl: asString(r.companyLogoUrl, d.companyLogoUrl),
    licenseNumber: asString(r.licenseNumber, d.licenseNumber),
    unionDefault: asEnum(r.unionDefault, d.unionDefault, ["Union", "Non-Union"] as const),
    mainOfficeLocation: asString(r.mainOfficeLocation, d.mainOfficeLocation),
    travelStartAddress: asString(r.travelStartAddress, d.travelStartAddress),
    unionAffiliation: asString(r.unionAffiliation, d.unionAffiliation),
    licenseBoardLine: asString(r.licenseBoardLine, d.licenseBoardLine),
    newsRegion: asString(r.newsRegion, d.newsRegion),
  };
}

function normalizeEstimator(value: unknown): EstimatorSettings {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.estimator;
  return {
    estimatorName: asString(r.estimatorName, d.estimatorName),
    estimatorTitle: asString(r.estimatorTitle, d.estimatorTitle),
    estimatorCell: asString(r.estimatorCell, d.estimatorCell),
    estimatorPhone: asString(r.estimatorPhone, d.estimatorPhone),
    estimatorFax: asString(r.estimatorFax, d.estimatorFax),
    estimatorEmail: asString(r.estimatorEmail, d.estimatorEmail),
  };
}

function normalizeScaffold(value: unknown): ScaffoldDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.scaffold;
  return {
    scaffoldType: asString(r.scaffoldType, d.scaffoldType),
    defaultScaffoldWidth: asNumber(r.defaultScaffoldWidth, d.defaultScaffoldWidth),
    defaultBayLength: asNumber(r.defaultBayLength, d.defaultBayLength),
    wallOffset: asNumber(r.wallOffset, d.wallOffset),
    turnaroundBaysEnabled: asBoolean(r.turnaroundBaysEnabled, d.turnaroundBaysEnabled),
    insideCornerLogic: asString(r.insideCornerLogic, d.insideCornerLogic),
    outsideCornerLogic: asString(r.outsideCornerLogic, d.outsideCornerLogic),
    bracePattern: asEnum(r.bracePattern, d.bracePattern, ["Every Bay", "Every Other Bay", "Custom"] as const),
    frameHeight: asNumber(r.frameHeight, d.frameHeight),
    workerReachHeight: asNumber(r.workerReachHeight, d.workerReachHeight),
    screwJackMaxExtension: Math.min(18, Math.max(1, asNumber(r.screwJackMaxExtension, d.screwJackMaxExtension))),
    jumpLogic: asString(r.jumpLogic, d.jumpLogic),
  };
}

function normalizeMaterialItem(value: unknown, fallback: MaterialItem): MaterialItem {
  const r = isRecord(value) ? value : {};
  return {
    id: asString(r.id, fallback.id),
    name: asString(r.name, fallback.name),
    isCore: asBoolean(r.isCore, fallback.isCore),
    unitRate: asNumber(r.unitRate, fallback.unitRate),
    billsAsRental: asBoolean(r.billsAsRental, fallback.billsAsRental),
  };
}

function normalizeMaterialRules(value: unknown): MaterialRules {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_MATERIAL_RULES;
  return {
    crossBracesPerBayPerJump: asNumber(r.crossBracesPerBayPerJump, d.crossBracesPerBayPerJump),
    guardrailTopPerBay: asNumber(r.guardrailTopPerBay, d.guardrailTopPerBay),
    guardrailIntermediatePerBay: asNumber(r.guardrailIntermediatePerBay, d.guardrailIntermediatePerBay),
    couplingPinsPerFrame: asNumber(r.couplingPinsPerFrame, d.couplingPinsPerFrame),
  };
}

function normalizeStock(value: unknown): StockItem[] {
  const defaults = buildDefaultStock();
  if (!Array.isArray(value) || value.length === 0) return defaults;

  const stored = new Map<string, Record<string, unknown>>();
  value.forEach((row) => {
    if (!isRecord(row)) return;
    const key = typeof row.id === "string" ? row.id : typeof row.partNo === "string" ? row.partNo : "";
    if (key) stored.set(key, row);
  });

  const merged = defaults.map((fallback) => {
    const row = stored.get(fallback.id) ?? stored.get(fallback.partNo);
    if (!row) return fallback;
    return {
      ...fallback,
      purchaseCost: asNumber(row.purchaseCost, fallback.purchaseCost),
      rentalRate: asNumber(row.rentalRate, fallback.rentalRate),
      weightLbs: asNumber(row.weightLbs, fallback.weightLbs),
      owned: asNumber(row.owned, fallback.owned),
      plankCapacity: asNumber(row.plankCapacity, fallback.plankCapacity ?? 0),
    };
  });

  // Parts a company added themselves survive alongside the standard catalog.
  const known = new Set(defaults.flatMap((row) => [row.id, row.partNo]).filter(Boolean));
  const custom = value
    .filter((row): row is Record<string, unknown> => {
      if (!isRecord(row)) return false;
      const key = typeof row.id === "string" ? row.id : String(row.partNo ?? "");
      return Boolean(key) && !known.has(key);
    })
    .map((row) => ({
      id: String(row.id ?? row.partNo ?? ""),
      partNo: asString(row.partNo, ""),
      description: asString(row.description, "Custom part"),
      category: asString(row.category, ""),
      column: asNumber(row.column, 3),
      purchaseCost: asNumber(row.purchaseCost, 0),
      rentalRate: asNumber(row.rentalRate, 0),
      weightLbs: asNumber(row.weightLbs, 0),
      owned: asNumber(row.owned, 0),
    }));

  return [...merged, ...custom];
}

function normalizeFinishRules(value: unknown): FinishRule[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_FINISH_RULES;
  const rows = value
    .filter(isRecord)
    .map((row) => ({
      finish: asString(row.finish, ""),
      scaffoldWidth: asNumber(row.scaffoldWidth, 3),
      planksPerJump: asNumber(row.planksPerJump, 3),
      bracketPartNo: asString(row.bracketPartNo, ""),
    }))
    .filter((row) => row.finish !== "");
  return rows.length ? rows : DEFAULT_FINISH_RULES;
}

function normalizeObstructions(value: unknown): ObstructionRules {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_OBSTRUCTION_RULES;
  return {
    moderateLaborPercent: asNumber(r.moderateLaborPercent, d.moderateLaborPercent),
    moderateMaterialPercent: asNumber(r.moderateMaterialPercent, d.moderateMaterialPercent),
    heavyLaborPercent: asNumber(r.heavyLaborPercent, d.heavyLaborPercent),
    heavyMaterialPercent: asNumber(r.heavyMaterialPercent, d.heavyMaterialPercent),
  };
}

function normalizeMaterial(value: unknown): MaterialDefaults {
  const r = isRecord(value) ? value : {};
  const defaults = buildDefaultMaterialItems();
  const rules = normalizeMaterialRules(r.rules);
  const stock = normalizeStock(r.stock);
  const finishRules = normalizeFinishRules(r.finishRules);
  const obstructions = normalizeObstructions(r.obstructions);

  if (!Array.isArray(r.items) || r.items.length === 0) {
    return { items: defaults, rules, stock, finishRules, obstructions };
  }

  const storedById = new Map<string, unknown>();
  r.items.forEach((item) => {
    if (isRecord(item) && typeof item.id === "string") storedById.set(item.id, item);
  });

  const merged = defaults.map((fallback) =>
    storedById.has(fallback.id) ? normalizeMaterialItem(storedById.get(fallback.id), fallback) : fallback,
  );

  const defaultIds = new Set(defaults.map((item) => item.id));
  const customItems = r.items
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "string" && !defaultIds.has(item.id as string))
    .map((item) => normalizeMaterialItem(item, {
      id: String(item.id), name: "Custom Item", isCore: false, unitRate: 0, billsAsRental: false,
    }));

  return { items: [...merged, ...customItems], rules, stock, finishRules, obstructions };
}

function normalizeRateSet(value: unknown, d: LaborRateSet): LaborRateSet {
  const r = isRecord(value) ? value : {};
  return {
    apprenticeRate: asNumber(r.apprenticeRate, d.apprenticeRate),
    journeymanRate: asNumber(r.journeymanRate, d.journeymanRate),
    foremanRate: asNumber(r.foremanRate, d.foremanRate),
    erectHourlyRate: asNumber(r.erectHourlyRate, d.erectHourlyRate),
    travelHourlyRate: asNumber(r.travelHourlyRate, d.travelHourlyRate),
  };
}

function normalizeLabor(value: unknown): LaborDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.labor;
  const activeRateSet = asEnum(r.activeRateSet, d.activeRateSet, ["union", "nonUnion"] as const);
  // A record written before the split carried flat rates. Seed union from
  // those rather than dropping what the estimator entered.
  const union = normalizeRateSet(r.union ?? r, d.union);
  const nonUnion = normalizeRateSet(r.nonUnion, d.nonUnion);
  const active = activeRateSet === "union" ? union : nonUnion;
  return {
    activeRateSet,
    union,
    nonUnion,
    apprenticeRate: active.apprenticeRate,
    journeymanRate: active.journeymanRate,
    foremanRate: active.foremanRate,
    erectHourlyRate: active.erectHourlyRate,
    travelHourlyRate: active.travelHourlyRate,
    installCrewSize: asNumber(r.installCrewSize, d.installCrewSize),
    dismantleCrewSize: asNumber(r.dismantleCrewSize, d.dismantleCrewSize),
    installProductionRate: asNumber(r.installProductionRate, d.installProductionRate),
    dismantleProductionRate: asNumber(r.dismantleProductionRate, d.dismantleProductionRate),
    dismantlePercentOfErect: asNumber(r.dismantlePercentOfErect, d.dismantlePercentOfErect),
    travelTimeHours: asNumber(r.travelTimeHours, d.travelTimeHours),
    planksPerLoad: asNumber(r.planksPerLoad, d.planksPerLoad),
    legsPerLoad: asNumber(r.legsPerLoad, d.legsPerLoad),
    travelSpeedMph: asNumber(r.travelSpeedMph, d.travelSpeedMph),
    truckHourlyRate: asNumber(r.truckHourlyRate, d.truckHourlyRate),
    truckDeliveryRate: asNumber(r.truckDeliveryRate, d.truckDeliveryRate),
    mobilizationCost: asNumber(r.mobilizationCost, d.mobilizationCost),
    dismantleCost: asNumber(r.dismantleCost, d.dismantleCost),
  };
}

function normalizePricing(value: unknown): PricingDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.pricing;
  return {
    rentalDurationDays: asNumber(r.rentalDurationDays, d.rentalDurationDays),
    rentalPeriodType: asEnum(r.rentalPeriodType, d.rentalPeriodType, ["30 Days", "60 Days", "90 Days", "120 Days", "Custom"] as const),
    miscCost: asNumber(r.miscCost, d.miscCost),
    markupPercent: asNumber(r.markupPercent, d.markupPercent),
    marginPercent: asNumber(r.marginPercent, d.marginPercent),
    taxPercent: asNumber(r.taxPercent, d.taxPercent),
    partialExteriorMarkupPercent: asNumber(r.partialExteriorMarkupPercent, d.partialExteriorMarkupPercent),
    laborMarkupPercent: asNumber(r.laborMarkupPercent, d.laborMarkupPercent),
  };
}

function normalizeAlternates(value: unknown): AlternateRateDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_ALTERNATE_RATES;
  const bands = Array.isArray(r.stairTowerHourBands) && r.stairTowerHourBands.length
    ? (r.stairTowerHourBands as unknown[])
        .filter(isRecord)
        .map((row) => ({
          throughFt: asNumber(row.throughFt, 0),
          installHours: asNumber(row.installHours, 0),
          dismantleHours: asNumber(row.dismantleHours, 0),
        }))
        .filter((row) => row.throughFt > 0)
        .sort((a, b) => a.throughFt - b.throughFt)
    : d.stairTowerHourBands;

  return {
    shrinkWrapPerSqFt: asNumber(r.shrinkWrapPerSqFt, d.shrinkWrapPerSqFt),
    shrinkWrapFullAddedHeightFt: asNumber(r.shrinkWrapFullAddedHeightFt, d.shrinkWrapFullAddedHeightFt),
    shrinkWrapCapHeightFt: asNumber(r.shrinkWrapCapHeightFt, d.shrinkWrapCapHeightFt),
    nettingPerSqFt: asNumber(r.nettingPerSqFt, d.nettingPerSqFt),
    nettingAddedHeightFt: asNumber(r.nettingAddedHeightFt, d.nettingAddedHeightFt),
    canopyLinearFeetPerUnit: asNumber(r.canopyLinearFeetPerUnit, d.canopyLinearFeetPerUnit),
    canopyInstallHoursPerUnit: asNumber(r.canopyInstallHoursPerUnit, d.canopyInstallHoursPerUnit),
    canopyDismantleHoursPerUnit: asNumber(r.canopyDismantleHoursPerUnit, d.canopyDismantleHoursPerUnit),
    canopyTravelHoursPerUnit: asNumber(r.canopyTravelHoursPerUnit, d.canopyTravelHoursPerUnit),
    canopyMaterialPerUnit: asNumber(r.canopyMaterialPerUnit, d.canopyMaterialPerUnit),
    hoistInstallHours: asNumber(r.hoistInstallHours, d.hoistInstallHours),
    hoistDismantleHours: asNumber(r.hoistDismantleHours, d.hoistDismantleHours),
    hoistRentalEach: asNumber(r.hoistRentalEach, d.hoistRentalEach),
    stairTowerRentPerJump: asNumber(r.stairTowerRentPerJump, d.stairTowerRentPerJump),
    stairTowerTallThresholdFt: asNumber(r.stairTowerTallThresholdFt, d.stairTowerTallThresholdFt),
    stairTowerLevelsPerMobilization: asNumber(r.stairTowerLevelsPerMobilization, d.stairTowerLevelsPerMobilization),
    stairTowerHoursPerMobilization: asNumber(r.stairTowerHoursPerMobilization, d.stairTowerHoursPerMobilization),
    stairTowerDismantlePercent: asNumber(r.stairTowerDismantlePercent, d.stairTowerDismantlePercent),
    stairTowerTravelHours: asNumber(r.stairTowerTravelHours, d.stairTowerTravelHours),
    stairTowerParapetInstallHours: asNumber(r.stairTowerParapetInstallHours, d.stairTowerParapetInstallHours),
    stairTowerParapetDismantleHours: asNumber(r.stairTowerParapetDismantleHours, d.stairTowerParapetDismantleHours),
    stairTowerWalkoffInstallHours: asNumber(r.stairTowerWalkoffInstallHours, d.stairTowerWalkoffInstallHours),
    stairTowerWalkoffDismantleHours: asNumber(r.stairTowerWalkoffDismantleHours, d.stairTowerWalkoffDismantleHours),
    stairTowerWalkoffTravelHours: asNumber(r.stairTowerWalkoffTravelHours, d.stairTowerWalkoffTravelHours),
    stairTowerHourBands: bands,
    toeBoardPerLinearFootPerJump: asNumber(r.toeBoardPerLinearFootPerJump, d.toeBoardPerLinearFootPerJump),
  };
}

function normalizeAddAlternate(value: unknown, fallback: AddAlternateDefault): AddAlternateDefault {
  const r = isRecord(value) ? value : {};
  return {
    id: asString(r.id, fallback.id),
    title: asString(r.title, fallback.title),
    description: asString(r.description, fallback.description),
    defaultValue: asNumber(r.defaultValue, fallback.defaultValue),
  };
}

function normalizeProposal(value: unknown): ProposalDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.proposal;

  const alternates =
    Array.isArray(r.addAlternateDefaults) && r.addAlternateDefaults.length > 0
      ? d.addAlternateDefaults.map((fallback, index) =>
          normalizeAddAlternate((r.addAlternateDefaults as unknown[])[index], fallback),
        )
      : d.addAlternateDefaults;

  return {
    clientLogoUrl: asString(r.clientLogoUrl, d.clientLogoUrl),
    proposalNumberFormat: asString(r.proposalNumberFormat, d.proposalNumberFormat),
    introLanguage: asString(r.introLanguage, d.introLanguage),
    scopeLanguage: asString(r.scopeLanguage, d.scopeLanguage),
    exclusionsLanguage: asString(r.exclusionsLanguage, d.exclusionsLanguage) || d.exclusionsLanguage,
    termsLanguage: asString(r.termsLanguage, d.termsLanguage),
    rentalDurationLanguage: asString(r.rentalDurationLanguage, d.rentalDurationLanguage),
    signatureBlock: asString(r.signatureBlock, d.signatureBlock),
    notesLanguage: asString(r.notesLanguage, d.notesLanguage) || d.notesLanguage,
    qualificationsLanguage: asString(r.qualificationsLanguage, d.qualificationsLanguage) || d.qualificationsLanguage,
    inclusionsLanguage: asString(r.inclusionsLanguage, d.inclusionsLanguage) || d.inclusionsLanguage,
    closingLanguage: asString(r.closingLanguage, d.closingLanguage) || d.closingLanguage,
    addAlternateDefaults: alternates,
  };
}

function normalizeBackendSettings(value: unknown): BackendSettings {
  const r = isRecord(value) ? value : {};
  return {
    company: normalizeCompany(r.company),
    estimator: normalizeEstimator(r.estimator),
    scaffold: normalizeScaffold(r.scaffold),
    material: normalizeMaterial(r.material),
    labor: normalizeLabor(r.labor),
    pricing: normalizePricing(r.pricing),
    alternates: normalizeAlternates(r.alternates),
    proposal: normalizeProposal(r.proposal),
    schemaVersion: asNumber(r.schemaVersion, 2),
  };
}

// --- Public API -------------------------------------------------------------

export function getBackendSettings(): BackendSettings {
  if (!canUseStorage()) return DEFAULT_BACKEND_SETTINGS;
  try {
    const raw = window.localStorage.getItem(BACKEND_SETTINGS_KEY);
    if (!raw) return DEFAULT_BACKEND_SETTINGS;
    return normalizeBackendSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_BACKEND_SETTINGS;
  }
}

export function saveBackendSettings(settings: Partial<BackendSettings>): void {
  if (!canUseStorage()) return;
  const current = getBackendSettings();
  const next = normalizeBackendSettings({ ...current, ...settings });
  window.localStorage.setItem(BACKEND_SETTINGS_KEY, JSON.stringify(next));
}

export function saveBackendSection<K extends keyof Omit<BackendSettings, "schemaVersion">>(
  section: K,
  value: BackendSettings[K],
): void {
  const current = getBackendSettings();
  saveBackendSettings({ ...current, [section]: value });
}

export function resetBackendSettings(): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(BACKEND_SETTINGS_KEY, JSON.stringify(DEFAULT_BACKEND_SETTINGS));
}

/**
 * Travel, derived from what the job actually ships.
 *
 * Loads come from the plank count - planks are the bulk item, so they set how
 * many truck runs a job takes. Each load goes out and comes back, and the
 * round trip is priced at truck speed rather than car speed.
 *
 * Miles are entered by the estimator today. When the maps integration lands,
 * only this input changes - everything downstream stays as it is.
 */
export function computeTravel(
  plankCount: number,
  oneWayMiles: number,
  settings: BackendSettings = getBackendSettings(),
): { loads: number; legs: number; legHours: number; hours: number; cost: number } {
  const { planksPerLoad, legsPerLoad, travelSpeedMph, truckHourlyRate } = settings.labor;
  const loads = plankCount > 0 ? Math.ceil(plankCount / Math.max(1, planksPerLoad)) : 0;
  const legHours = travelSpeedMph > 0 ? oneWayMiles / travelSpeedMph : 0;
  const legs = loads * legsPerLoad;
  const hours = legs * legHours;
  return {
    loads,
    legs,
    legHours: Math.round(legHours * 100) / 100,
    hours: Math.round(hours * 10) / 10,
    cost: Math.round(hours * truckHourlyRate),
  };
}

/** Monthly rental rate for a core piece, by name. One lookup, one home. */
export function getPieceRate(name: string, settings: BackendSettings = getBackendSettings()): number {
  const item = settings.material.items.find((row) => row.name.toLowerCase() === name.toLowerCase());
  return item?.unitRate ?? 0;
}

/** The scaffold a finish calls for. Undefined when the finish isn't known. */
export function getFinishRule(
  finish: string,
  settings: BackendSettings = getBackendSettings(),
): FinishRule | undefined {
  return settings.material.finishRules.find(
    (rule) => rule.finish.toLowerCase() === finish.toLowerCase()
  );
}

/** Labor and material uplift for a level of obstruction, as multipliers. */
export function getObstructionFactor(
  level: "none" | "moderate" | "heavy",
  settings: BackendSettings = getBackendSettings(),
): { labor: number; material: number } {
  const rules = settings.material.obstructions;
  if (level === "moderate") {
    return {
      labor: 1 + rules.moderateLaborPercent / 100,
      material: 1 + rules.moderateMaterialPercent / 100,
    };
  }
  if (level === "heavy") {
    return {
      labor: 1 + rules.heavyLaborPercent / 100,
      material: 1 + rules.heavyMaterialPercent / 100,
    };
  }
  return { labor: 1, material: 1 };
}

/** One stock row by part number. */
export function getStockItem(
  key: string,
  settings: BackendSettings = getBackendSettings(),
): StockItem | undefined {
  return settings.material.stock.find((row) => row.id === key || row.partNo === key);
}

/** Everything the company owns at least one of. */
export function getOwnedStock(settings: BackendSettings = getBackendSettings()): StockItem[] {
  return settings.material.stock.filter((row) => row.owned > 0);
}

/** Core pieces flagged to bill as rental on the estimate. */
export function getBilledPieces(settings: BackendSettings = getBackendSettings()): MaterialItem[] {
  return settings.material.items.filter((item) => item.billsAsRental);
}

// --- Backwards-compatible exports (formerly ratesStore.ts) ------------------

export type KorbanRates = {
  frameMonthlyRate: number;
  plankMonthlyRate: number;
  apprenticeRate: number;
  journeymanRate: number;
  foremanRate: number;
  planksPerTruckLoad: number;
  tripsPerTruckLoad: number;
  defaultProductionType: "Conservative" | "Balanced" | "Competitive";
  conservativeInstallDays: number;
  balancedInstallDays: number;
  competitiveInstallDays: number;
  dismantlePercent: number;
  defaultMarkupPercent: number;
  defaultMiscCostBuffer: number;
  defaultMiscRevenueBuffer: number;
  schemaVersion: number;
};

const PRODUCTION_DAY_DEFAULTS = {
  conservativeInstallDays: 6,
  balancedInstallDays: 5,
  competitiveInstallDays: 4,
};

export function getRates(): KorbanRates {
  const settings = getBackendSettings();
  return {
    frameMonthlyRate: getPieceRate("Frames", settings),
    plankMonthlyRate: getPieceRate("Planks", settings),
    apprenticeRate: settings.labor.apprenticeRate,
    journeymanRate: settings.labor.journeymanRate,
    foremanRate: settings.labor.foremanRate,
    planksPerTruckLoad: 150,
    tripsPerTruckLoad: 2,
    defaultProductionType: "Balanced",
    ...PRODUCTION_DAY_DEFAULTS,
    dismantlePercent: settings.labor.dismantlePercentOfErect,
    defaultMarkupPercent: settings.pricing.markupPercent,
    defaultMiscCostBuffer: settings.pricing.miscCost,
    defaultMiscRevenueBuffer: 0,
    schemaVersion: 2,
  };
}

export function getInstallDays(
  productionType: "Conservative" | "Balanced" | "Competitive",
  rates: KorbanRates = getRates(),
): number {
  if (productionType === "Conservative") return rates.conservativeInstallDays;
  if (productionType === "Competitive") return rates.competitiveInstallDays;
  return rates.balancedInstallDays;
}

export function getDismantleDays(installDays: number, rates: KorbanRates = getRates()): number {
  return Math.max(1, Math.ceil(installDays * (rates.dismantlePercent / 100)));
}

export function getBlendedLaborRate(rates: KorbanRates = getRates()): number {
  return (rates.apprenticeRate + rates.journeymanRate + rates.foremanRate) / 3;
}

export function getLogistics(
  plankCount: number,
  rates: KorbanRates = getRates(),
): { truckLoads: number; deliveryTrips: number; pickupTrips: number } {
  const truckLoads = plankCount > 0 ? Math.ceil(plankCount / rates.planksPerTruckLoad) : 0;
  const trips = truckLoads > 0 ? Math.max(1, Math.ceil(truckLoads / rates.tripsPerTruckLoad)) : 0;
  return { truckLoads, deliveryTrips: trips, pickupTrips: trips };
}

export function getMonthlyRentalRevenue(
  frameCount: number,
  plankCount: number,
  rates: KorbanRates = getRates(),
): number {
  return Math.round(frameCount * rates.frameMonthlyRate + plankCount * rates.plankMonthlyRate);
}
