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
  bidLevel: "korban-bid",

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
      alternateSettings: { ...DEFAULT_ALTERNATE_SETTINGS, ...(parsed.alternateSettings ?? {}) },
    };
  } catch {
    return DEFAULT_ESTIMATE_STATE;
  }
}

/** Merge-write. Only the keys passed in are changed. */
export function saveEstimateState(patch: Partial<EstimateState>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadEstimateState(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable - the page still works, it just won't persist.
  }
}

export const PRODUCTION_TYPES: {
  key: ProductionKey;
  title: string;
  days: number;
  note: string;
}[] = [
  { key: "conservative", title: "Conservative", days: 6, note: "Difficult access, unclear plans, higher field risk." },
  { key: "conventional", title: "Conventional", days: 5, note: "Standard production for typical frame scaffold." },
  { key: "competitive", title: "Competitive", days: 4, note: "Schedule, access and repetition support a tighter number." },
];

export const BID_LEVELS: {
  key: BidLevel;
  title: string;
  accuracy: string;
  feeds: string;
}[] = [
  { key: "quick-bid", title: "Quick Bid", accuracy: "+/-15-25%", feeds: "Elevation lengths entered by hand." },
  { key: "full-bid", title: "Full Bid", accuracy: "+/-8-12%", feeds: "Traced perimeter, one grip per elevation." },
  { key: "korban-bid", title: "Korban Bid", accuracy: "+/-3-6%", feeds: "Traced perimeter, multiple areas, section views." },
];
