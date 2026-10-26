// Shared estimate record.
//
// Estimate Review owns the inputs that produce quantities, labor and production.
// Margin Review owns the margin assumptions (markup, direct-cost basis, misc).
// Both pages read the whole record and merge-write only their own fields, so
// neither page can clobber the other's work.
//
// This is deliberately separate from projectStore/backendStore: it holds
// estimate-session state, not project data and not company settings.

import { DEFAULT_ALTERNATE_SETTINGS, type AlternateId, type AlternateSettings } from "@/lib/alternates";

export type BidLevel = "quick-bid" | "full-bid" | "korban-bid";
export type ProductionKey = "conservative" | "conventional" | "competitive";

export type ConsumableLine = {
  id: string;
  label: string;
  quantity: number;
  unitRate: number;
};

export type ProductionPhase = {
  id: number;
  phase: string;
  days: number;
  crews: number;
  menPerCrew: number;
};

/** Written by Estimate Review, read by Margin Review. Never edited by hand. */
export type EstimateDerived = {
  frames: number;
  planks: number;
  crossBraces: number;
  guardrails: number;
  basePlates: number;
  screwJacks: number;
  totalPieces: number;
  linearFeet: number;

  rentalsRevenue: number;
  consumablesRevenue: number;

  erectHours: number;
  dismantleHours: number;
  travelHours: number;
  erectCost: number;
  dismantleCost: number;
  travelCost: number;
  laborCost: number;

  productionDays: number;
  savedAt: number;
};

export type EstimateState = {
  bidLevel: BidLevel;

  // Rental
  rentalDays: number;
  frameRate: number;
  plankRate: number;
  consumables: ConsumableLine[];

  // Labor
  erectRate: number;
  travelRate: number;
  /** One-way miles to site. Loads, trips, hours and cost all derive from it. */
  siteMiles: number;
  dismantlePercentOfErect: number;

  // Production
  productionKey: ProductionKey;
  crewSize: number;
  phaseModeOn: boolean;
  phases: ProductionPhase[];

  /**
   * Whether the obstruction contingency rides in the base bid.
   *
   * On by default, because the obstructions are real and the bid should cover
   * them. Unticked, the contingency is still worked out and still shown - it
   * simply stops reaching the price, which is the estimator saying he backs
   * the PM to find a way around the trees.
   */
  contingencyIncluded: boolean;

  // Add alternates
  approvedAlternates: AlternateId[];
  alternateSettings: AlternateSettings;

  // Margin assumptions (owned by /margin-review)
  laborMarkupPercent: number;
  rentalsDirectCostPercent: number;
  miscRevenue: number;
  miscCost: number;

  derived: EstimateDerived | null;
};

export const DEFAULT_CONSUMABLES: ConsumableLine[] = [
  { id: "beams", label: "Beams", quantity: 0, unitRate: 0 },
  { id: "joists", label: "Joists", quantity: 0, unitRate: 0 },
  { id: "plywood", label: "Plywood", quantity: 0, unitRate: 0 },
  { id: "two-by-four", label: "2x4", quantity: 0, unitRate: 0 },
  { id: "misc", label: "Misc", quantity: 0, unitRate: 0 },
];

export const DEFAULT_ESTIMATE_STATE: EstimateState = {
  /*
   * A bid opens at the shallowest round.
   *
   * This defaulted to korban-bid, the deepest - so the Estimate opened on the
   * one round most jobs have never been bid at, showing nothing, on a page
   * whose job is to show a price. A bid starts shallow and goes deeper as the
   * information improves, and the page should open where the work starts.
   */
  bidLevel: "quick-bid",

  rentalDays: 30,
  frameRate: 2.0,
  plankRate: 1.5,
  consumables: DEFAULT_CONSUMABLES,

  erectRate: 68,
  travelRate: 70,
  // Miles to site. Everything about travel derives from this one number.
  siteMiles: 0,
  dismantlePercentOfErect: 70,

  productionKey: "conventional",
  crewSize: 4,
  phaseModeOn: false,
  // The four faces are placeholders, not data. Days stay at zero until the
  // takeoff says a face is actually covered - a phase plan invented before
  // anyone gripped an elevation is worse than an empty one.
  phases: [
    { id: 1, phase: "North", days: 0, crews: 1, menPerCrew: 4 },
    { id: 2, phase: "East", days: 0, crews: 1, menPerCrew: 4 },
    { id: 3, phase: "South", days: 0, crews: 1, menPerCrew: 4 },
    { id: 4, phase: "West", days: 0, crews: 1, menPerCrew: 4 },
  ],

  contingencyIncluded: true,

  approvedAlternates: [],
  alternateSettings: DEFAULT_ALTERNATE_SETTINGS,

  laborMarkupPercent: 35,
  rentalsDirectCostPercent: 40,
  // Misc is whatever this job needs that nothing else covers. Invented
  // defaults landed in the bid without anyone choosing them.
  miscRevenue: 0,
  miscCost: 0,

  derived: null,
};

const STORAGE_KEY = "korban.estimate.v1";

export function loadEstimateState(): EstimateState {
  if (typeof window === "undefined") return DEFAULT_ESTIMATE_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ESTIMATE_STATE;
    const parsed = JSON.parse(raw) as Partial<EstimateState>;
    return {
      ...DEFAULT_ESTIMATE_STATE,
      ...parsed,
      consumables: parsed.consumables?.length ? parsed.consumables : DEFAULT_CONSUMABLES,
      phases: parsed.phases?.length ? parsed.phases : DEFAULT_ESTIMATE_STATE.phases,
      approvedAlternates: Array.isArray(parsed.approvedAlternates) ? parsed.approvedAlternates : [],
      contingencyIncluded:
        typeof parsed.contingencyIncluded === "boolean" ? parsed.contingencyIncluded : true,
      alternateSettings: { ...DEFAULT_ALTERNATE_SETTINGS, ...(parsed.alternateSettings ?? {}) },
    };
  } catch {
    return DEFAULT_ESTIMATE_STATE;
  }
}

/** Merge-write. Only the keys passed in are changed. */
/**
 * Forgets the priced figures for a job.
 *
 * The estimate lives apart from the takeoff, which is right - it survives
 * moving between tiers. But clearing a job's takeoff and leaving its price
 * behind left Plan Desk showing revenue and hours for work that no longer
 * existed, with "Priced" still ticked.
 */
export function clearEstimateState() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
}

export function saveEstimateState(patch: Partial<EstimateState>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadEstimateState(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable - the page still works, it just won't persist.
  }
}

/**
 * How fast a crew sets frames, not how long a job takes.
 *
 * These were flat day counts - six, five and four - so a job took however
 * many days the level said, whatever its size. A 280 foot job and a ten
 * thousand foot job both came out at five days, and the frame count, the one
 * number that decides how long erecting takes, was never consulted.
 *
 * A production level is a rate. Two things bend it, and both are facts about
 * the scaffold rather than judgements about the job:
 *
 *   a two man crew is slower       Below four jumps there are only two men,
 *                                  and two men setting and feeding do not
 *                                  move at the pace of three.
 *
 *   height is slower               Material goes up by hand. Past ten jumps
 *                                  it has further to travel, and past twenty
 *                                  further again.
 *
 * Both are defaults. Every company builds at its own speed, so these belong
 * in backend settings and are read from there once a company has set them.
 */
export const PRODUCTION_TYPES: {
  key: ProductionKey;
  title: string;
  /** Frames a crew of three or more sets in a day, up to ten jumps. */
  framesPerCrewPerDay: number;
  /** What two men manage, below four jumps. */
  twoManFramesPerDay: number;
  note: string;
}[] = [
  { key: "conservative", title: "Conservative", framesPerCrewPerDay: 50, twoManFramesPerDay: 35, note: "Difficult access, unclear plans, higher field risk." },
  { key: "conventional", title: "Conventional", framesPerCrewPerDay: 55, twoManFramesPerDay: 40, note: "Standard production for typical frame scaffold." },
  { key: "competitive", title: "Competitive", framesPerCrewPerDay: 60, twoManFramesPerDay: 45, note: "Schedule, access and repetition support a tighter number." },
];

/**
 * How many men a run of this height needs.
 *
 * Material goes up by hand, so a man stands every other jump to pass it on.
 * One on the ground, skip a jump, one at the second, skip, one at the fourth,
 * and so on to the top. Two men minimum: below three jumps there is still
 * someone setting and someone feeding.
 *
 * Crew size is a consequence of the scaffold, not a preference. A thirteen
 * jump run needs seven men whatever anybody would prefer to pay for.
 */
export function crewForJumps(jumps: number): number {
  return Math.max(2, 1 + Math.floor(Math.max(0, jumps) / 2));
}

/**
 * Where the rate steps down, measured in jumps.
 *
 * The thresholds are Korban's - ten and twenty jumps is where material
 * handling changes, and that is a fact about ladders and arms rather than
 * about any one company. What it costs them is theirs, and comes from
 * backend settings.
 */
const HEIGHT_THRESHOLDS = [10, 20] as const;

export type ProductionBand = {
  /** Jumps in this band - 1 to 10, 11 to 20, 21 up. */
  fromJump: number;
  toJump: number;
  frames: number;
  framesPerDay: number;
  crewDays: number;
};

/**
 * What erecting this scaffold takes.
 *
 * The height penalty applies only to the frames ABOVE each threshold, not to
 * the whole job. A twenty five jump run sets its first ten jumps at the full
 * rate, the next ten slower, and the last five slower again - because the
 * bottom of a tall scaffold is no harder to build than the bottom of a short
 * one. Applying the penalty to every frame would price the easy part of a
 * tall job as though it were the hard part.
 *
 * Frames are spread evenly up the run - total frames divided by jumps gives
 * what one jump costs - rather than assuming legs times jumps, which stops
 * being true the moment a leg mixes a 6'-4" frame with a 3'.
 *
 * Crew days stay fractional. Rounding each band to whole days first would
 * lose the difference between the three levels on most jobs, which is the
 * one thing the levels exist to show. Hours are hours.
 */
export function productionPlan(
  frames: number,
  jumps: number,
  key: ProductionKey,
  rates?: {
    levels: { key: ProductionKey; perDay: number; twoManPerDay: number }[];
    aboveTenJumpsPenalty: number;
    aboveTwentyJumpsPenalty: number;
  },
): { crew: number; crewDays: number; days: number; erectHours: number; bands: ProductionBand[] } {
  const empty = { crew: 0, crewDays: 0, days: 0, erectHours: 0, bands: [] as ProductionBand[] };
  if (frames <= 0 || jumps <= 0) return empty;

  /* The company's numbers when it has set them, Korban's otherwise. */
  const fallback = PRODUCTION_TYPES.find((row) => row.key === key) ?? PRODUCTION_TYPES[1];
  const level = rates?.levels.find((row) => row.key === key);
  const perDay = level?.perDay ?? fallback.framesPerCrewPerDay;
  const twoManPerDay = level?.twoManPerDay ?? fallback.twoManFramesPerDay;
  const penalties = [
    0,
    rates?.aboveTenJumpsPenalty ?? 10,
    rates?.aboveTwentyJumpsPenalty ?? 15,
  ];

  const crew = crewForJumps(jumps);
  // Two men work to their own rate; three or more to the standard one.
  const base = crew <= 2 ? twoManPerDay : perDay;
  const framesPerJump = frames / jumps;

  const bands: ProductionBand[] = [];
  let fromJump = 1;
  const edges = [...HEIGHT_THRESHOLDS, Infinity];
  for (let i = 0; i < edges.length; i++) {
    if (fromJump > jumps) break;
    const band = { upTo: edges[i], penalty: penalties[i] ?? 0 };
    const toJump = Math.min(jumps, band.upTo);
    const jumpsHere = toJump - fromJump + 1;
    if (jumpsHere > 0) {
      // Never below five a day, however tall - a crew that slow is a crew
      // that has stopped, and a divide by zero is not an estimate.
      const framesPerDay = Math.max(5, base - band.penalty);
      const bandFrames = framesPerJump * jumpsHere;
      bands.push({
        fromJump,
        toJump,
        frames: bandFrames,
        framesPerDay,
        crewDays: bandFrames / framesPerDay,
      });
    }
    fromJump = toJump + 1;
  }

  const crewDays = bands.reduce((sum, band) => sum + band.crewDays, 0);
  return {
    crew,
    crewDays,
    days: Math.max(1, Math.ceil(crewDays)),
    erectHours: Math.round(crewDays * crew * 8),
    bands,
  };
}

/*
 * What each tier is for, and what it is built on.
 *
 * The accuracy bands went because they read like a promise nobody made - an
 * estimator knows what a budget number is worth without being given a range
 * for it, and a customer reading one over a shoulder is given a figure the
 * company never offered.
 *
 * The "feeds" line for Full Bid also described tracing a perimeter, which is a
 * Korban Bid. Full Bid measures with the highlighter.
 */
export const BID_LEVELS: {
  key: BidLevel;
  title: string;
  /** What this tier is for, in two words. */
  serves: string;
  /** How closely it looks. */
  detail: string;
  feeds: string;
}[] = [
  { key: "quick-bid",  title: "Quick Bid",  serves: "Budget Number", detail: "Low Detail",         feeds: "Elevation lengths entered by hand." },
  { key: "full-bid",   title: "Full Bid",   serves: "Most Bids",     detail: "Good Coverage",      feeds: "Highlighted runs, each gripped for height." },
  { key: "korban-bid", title: "Korban Bid", serves: "Hard Bids",     detail: "Detailed & Precise", feeds: "Traced perimeter, multiple areas, section views." },
];
