export type ScaffoldInput = {
  scaffoldWidth: number;
  standardBayLength: number;
  frameHeight: number;
  plankCountPerBay: number;
  bracePattern: string;
  wallOffset: number;
};

export type QuantityEngineInput = {
  linearFeet: number;
  wallHeight: number;
  standardBayLength: number;
  scaffoldWidth: number;
  frameHeight: number;
  plankCountPerBay: number;
  bracePattern: string;
  wallOffset: number;
  /**
   * Lift count per leg, in order along the run. When supplied, every
   * quantity is computed per bay from the real lift counts rather than
   * assuming a uniform run — which is what makes per-tick height edits
   * flow through to material counts. A bay spans two legs and is
   * governed by the SHORTER of them: you can't brace, deck, or rail to
   * a frame that isn't there.
   *
   * When omitted, the run is treated as uniform at the height derived
   * from wallHeight.
   */
  legLifts?: number[];
  /**
   * Material rules — normally supplied from backend settings so each
   * company can encode its own standard. Defaults match common practice
   * and are documented on MATERIAL_RULE_DEFAULTS below.
   */
  crossBracesPerBayPerLift?: number;
  guardrailTopPerBay?: number;
  guardrailIntermediatePerBay?: number;
  couplingPinsPerFrame?: number;
  /**
   * Standard worker reach height from the top deck (default 6'). The top
   * scaffold deck doesn't need to reach the full wall height — frame
   * stack height is calculated from (wallHeight - workerReachHeight).
   * Optional for backward compatibility with older saved data; defaults
   * to 6' when not provided.
   */
  workerReachHeight?: number;
  /**
   * Screw jack max travel in inches (physical range 0"-18"), used for
   * final fine adjustment when stacking frames. Optional for backward
   * compatibility; defaults to 18" (the full physical range) when not
   * provided — callers can pass the backend's more conservative default
   * (12") if they want a safety margin below the physical max.
   */
  screwJackMaxExtensionIn?: number;
};

export type QuantityEngineOutput = {
  bayCount: number;
  legCount: number;
  jumps: number;
  frameTall: number;
  frameCount: number;
  plankCount: number;
  crossBraceCount: number;
  guardrailCount: number;
  basePlateCount: number;
  screwJackCount: number;
  /** Frame-to-frame joints. Top frame carries none — guardrail posts take those sockets. */
  couplingPinCount: number;
  /** Realistic physical frame stack (6'-4"/5'/3' pieces) for the optimal option — see computeFrameMakeup. */
  frameMakeup: FrameMakeupPiece[];
  /** Screw jack extension used for final fine adjustment, in inches (0–18). */
  screwJackExtensionIn: number;
};

export type FrameMakeupPiece = { size: number; label: string; qty: number };

export type FrameMakeupResult = {
  pieces: FrameMakeupPiece[];
  /** Screw jack extension used for final fine adjustment, in inches (0–18). */
  screwJackExtensionIn: number;
  /** Total number of frame pieces stacked — this is what "frames tall" / level count means downstream. */
  frameTall: number;
};

export type StoredPoint = { x: number; y: number };

export type StoredFullOverlayRow = {
  id: number;
  isKeyFloor: boolean;
  overlayType: string;
  level: string;
  points: StoredPoint[];
  closed: boolean;
  linealFeet: number;
  color: string;
  pageNumber: number;
  /**
   * Per-level reference/anchor point picked on the plan — a fixed
   * feature (column, corner, grid intersection) that appears on every
   * level's sheet. All levels' outlines are shifted so their reference
   * points coincide, which is what allows floors traced from different
   * pages to stack correctly into one building. Null until picked.
   */
  refPoint: StoredPoint | null;
  /**
   * This level's outline after reference-point alignment — i.e. in the
   * shared building coordinate system rather than raw page pixels.
   * Downstream consumers (overlap detection, Set Scaffold, 3D) should
   * use these, not `points`, whenever comparing levels to each other.
   * Falls back to a copy of `points` when no reference point is set.
   */
  alignedPoints: StoredPoint[];
};

export type StoredElevationReference = {
  elevation: string;
  points: StoredPoint[];
  closed: boolean;
  linealFeet: number;
  manualLinealFeetInput: string;
  source: string;
};

export type StoredElevationHeight = {
  elevation: string;
  overallHeightInput: string;
  belowGradeEnabled: boolean;
  belowGradeInput: string;
  multipleHeights: boolean;
  areas: unknown[];
};

/**
 * A courtyard — an interior void with its own set of faces, gripped the
 * same way building elevations are but stored separately so its
 * quantities can be included in or excluded from project totals on
 * demand. Faces reuse the N/E/S/W naming, but a courtyard may only use
 * some of them (three walls and an open side is common), so which faces
 * exist is up to the estimator rather than fixed at four.
 */
export type StoredCourtyardFace = {
  face: string;
  totalLF: number;
  totalLegs: number;
  avgFrameTall: number;
  areas: unknown[];
};

export type StoredCourtyard = {
  id: string;
  name: string;
  faces: StoredCourtyardFace[];
};

/**
 * Elevation Breakdown — optional, manual, purely supplementary data.
 * Entered directly by the estimator in Takeoff Workspace's "Elevation
 * Breakdown (Optional)" section. This NEVER feeds linearFeet, ticks, or
 * the quantity engine — it exists only to support the "Complete Exterior
 * Cost" vs. "Partial Exterior Cost" breakdown shown in Estimate Review.
 * Deliberately isolated from the main takeoff machine.
 */
export type StoredElevationBreakdownRow = {
  elevation: string;
  approxLinearFeet: number;
};

/**
 * A single hand-placed frame or bracket added on top of the auto-drawn
 * Section View, for cases where Korban didn't (or couldn't) correctly
 * assess/apply scaffold against the traced wall outline. Adding one of
 * these updates the live material counts automatically.
 */
export type SectionDraftingItem = {
  id: string;
  kind: "frame" | "bracket";
  variant: string;
  /** 0-indexed level this piece sits at (0 = ground level). */
  level: number;
};

export type TakeoffOverlayGeometry = {
  elevationName: string;
  levelName: string;
  tracedPerimeter: StoredPoint[];
  overlayPoints: StoredPoint[];
  wallSegments: StoredPoint[][];
  referencePoints: StoredPoint[];
  elevationPoints: StoredPoint[];
  fullOverlayRows: StoredFullOverlayRow[];
  elevationRefs: StoredElevationReference[];
  elevationHeights: StoredElevationHeight[];
  scale: unknown;
};

export type ProjectElevation = {
  elevationId: string;
  elevationName: string;
  levelName?: string;
  linearFeet: number;
  wallHeight: number;
  phase: string;
  mobilization: string;
  overlayGeometry: TakeoffOverlayGeometry | null;
  scale: unknown;
  scaffoldInput: ScaffoldInput;
  quantityEngine: QuantityEngineOutput;
  sectionView: {
    frameMakeup: string;
    selectedRun: string;
    wallOffset: number;
    sectionType: string;
    /**
     * Traced wall outline points from the Takeoff Workspace's Section
     * View tab, in raw page/image coordinates (same space as
     * overlayGeometry points). Converted to feet at render time using
     * scale.pageUnitsPerFoot. Empty until the estimator traces a wall.
     */
    wallOutline: StoredPoint[];
    /**
     * Which side of the traced wall outline the scaffold sits on.
     * Chosen via the toggle that appears once a wall outline exists.
     */
    scaffoldSide: "left" | "right";
    /**
     * Hand-placed frames/brackets added on top of the auto-drawn
     * section (see SectionDraftingItem). Feeds material counts.
     */
    draftingAdditions: SectionDraftingItem[];
  };
  /**
   * Optional manual elevation breakdown (see StoredElevationBreakdownRow).
   * Defaults to an empty array — purely additive, never required.
   */
  elevationBreakdown: StoredElevationBreakdownRow[];
  /**
   * Courtyards captured for this elevation — see StoredCourtyard. Kept
   * separate from the building's own elevations so their quantities can
   * be toggled in or out of project totals.
   */
  courtyards: StoredCourtyard[];
  /** Whether courtyard quantities roll into project totals. */
  includeCourtyards: boolean;
};

export type ProjectLevel = {
  levelId: string;
  levelName: string;
  elevations: ProjectElevation[];
};

/**
 * How deep an estimate goes. These are stages of one process, not
 * separate modes — each builds on the one below, and moving up never
 * discards work already entered.
 *
 * - quick-bid:     elevations only. Budgetary/preliminary pricing.
 * - straight-cost: adds floor plans, so plan geometry and layout exist.
 * - complex:       everything — 3D, section views, recommendations.
 */
export type EstimateDepth = "quick-bid" | "full-bid" | "korban-bid";

export const DEPTH_ORDER: EstimateDepth[] = ["quick-bid", "full-bid", "korban-bid"];

/** True when the project's depth includes the required tier or higher. */
export function depthAtLeast(current: EstimateDepth, required: EstimateDepth): boolean {
  return DEPTH_ORDER.indexOf(current) >= DEPTH_ORDER.indexOf(required);
}

export type ProjectRecord = {
  projectId: string;
  projectName: string;
  projectAddress: string;
  customer: string;
  estimator: string;
  /**
   * The estimator's own bid number. Every company numbers bids differently,
   * so this is entered, never generated - KORBAN has no business deciding
   * what a contractor calls their own proposal.
   */
  proposalNumber: string;
  /** GC on the job. Often the same as customer, sometimes not. */
  generalContractor: string;
  /** Who the proposal is addressed to. Printed on page one. */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** When the bid is due. Printed as the proposal date. */
  bidDueDate: string;
  /** Union or non-union for this job. Defaults from Backend, overridable here. */
  unionStatus: string;
  /**
   * Where the bid stands with the customer. Set by the estimator - this is
   * outcome, not progress. Progress (has takeoff work happened) derives from
   * the elevation itself and is never stored, so it can't fall out of step.
   */
  bidStatus: BidStatus;
  updatedAt: string;
  schemaVersion: number;
  /** Estimate depth — see EstimateDepth. Defaults to korban-bid for
   *  projects created before depth tiers existed, so nothing that was
   *  already accessible becomes hidden on upgrade. */
  estimateDepth: EstimateDepth;
  takeoff: {
    levels: ProjectLevel[];
  };
};

export const BID_STATUSES = [
  "Draft",
  "Internal Review",
  "Ready To Send",
  "Submitted",
  "Won",
  "Lost",
  "Still Chasing",
  "No Response",
] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

/** Submitted or later means the bid has left the building. */
export const SUBMITTED_STATUSES: BidStatus[] = [
  "Submitted", "Won", "Lost", "Still Chasing", "No Response",
];

export type ProjectProgress = "Not started" | "In process" | "Complete";

/**
 * How far a bid has actually come. Derived, never stored - a project is in
 * process the moment real takeoff work exists, and complete once the bid has
 * been submitted. Nothing to keep in sync.
 */
export function getProjectProgress(
  project: ProjectRecord,
  elevation: ProjectElevation | null,
): ProjectProgress {
  if (SUBMITTED_STATUSES.includes(project.bidStatus)) return "Complete";
  const hasScale = Boolean(elevation?.scale);
  const hasGeometry = (elevation?.overlayGeometry?.fullOverlayRows ?? []).some(
    (row) => row.points.length >= 3
  );
  const hasCoverage = (elevation?.linearFeet ?? 0) > 0;
  return hasScale || hasGeometry || hasCoverage ? "In process" : "Not started";
}

export type ProjectData = Record<string, ProjectRecord>;

export const ACTIVE_PROJECT_KEY = "korbanActiveProjectId";
export const ACTIVE_ELEVATION_KEY = "korbanActiveElevationId";
export const PROJECT_DATA_KEY = "korbanProjectData_v1";
export const DEMO_PROJECT_ID = "demo-project";
export const DEMO_LEVEL_ID = "main-level";
export const DEMO_ELEVATION_ID = "north-elevation";

const defaultScaffoldInput: ScaffoldInput = {
  scaffoldWidth: 3,
  standardBayLength: 10,
  frameHeight: 6 + 4 / 12,
  plankCountPerBay: 0,
  bracePattern: "Every Bay",
  wallOffset: 1,
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstValidNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }

      const leadingNumber = Number.parseFloat(value);
      if (Number.isFinite(leadingNumber) && leadingNumber > 0) {
        return leadingNumber;
      }
    }
  }

  return null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizePoint(value: unknown): StoredPoint | null {
  if (!isRecord(value)) return null;
  const x = asNumber(value.x, Number.NaN);
  const y = asNumber(value.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizePoints(value: unknown): StoredPoint[] {
  return asArray<unknown>(value)
    .map(normalizePoint)
    .filter((point): point is StoredPoint => Boolean(point));
}

function normalizeFullOverlayRow(value: unknown): StoredFullOverlayRow | null {
  if (!isRecord(value)) return null;
  const points = normalizePoints(value.points);
  const alignedPoints = normalizePoints(value.alignedPoints);
  return {
    id: asNumber(value.id, Date.now()),
    isKeyFloor: Boolean(value.isKeyFloor),
    overlayType: asString(value.overlayType, "Level"),
    level: asString(value.level, "Main Level"),
    points,
    closed: Boolean(value.closed),
    linealFeet: asNumber(value.linealFeet, 0),
    color: asString(value.color, "#2563eb"),
    pageNumber: asNumber(value.pageNumber, 1),
    refPoint: normalizePoint(value.refPoint),
    // Older saved rows predate alignment — fall back to the raw outline
    // so nothing breaks; it just means that level isn't yet stackable.
    alignedPoints: alignedPoints.length ? alignedPoints : points,
  };
}

/**
 * Shifts every level's outline so all reference points coincide at a
 * common origin, producing one shared building coordinate system.
 *
 * The anchor is the first row that actually has a reference point — its
 * own coordinates are left untouched, and every other row is translated
 * by the difference between its reference point and the anchor's. Rows
 * without a reference point can't be aligned, so their outline passes
 * through unchanged (they simply won't stack correctly until one is
 * picked — the UI should surface that rather than silently guessing).
 *
 * Translation only, never rotation: levels are assumed to be traced at
 * the same orientation, which matches how plan sheets are drawn.
 */
export function alignOverlayRows(rows: StoredFullOverlayRow[]): StoredFullOverlayRow[] {
  const anchor = rows.find((r) => r.refPoint);
  if (!anchor?.refPoint) {
    return rows.map((r) => ({ ...r, alignedPoints: r.points }));
  }
  const ax = anchor.refPoint.x, ay = anchor.refPoint.y;
  return rows.map((row) => {
    if (!row.refPoint) return { ...row, alignedPoints: row.points };
    const dx = ax - row.refPoint.x, dy = ay - row.refPoint.y;
    return { ...row, alignedPoints: row.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  });
}

function normalizeElevationReference(value: unknown): StoredElevationReference | null {
  if (!isRecord(value)) return null;
  return {
    elevation: asString(value.elevation, "North"),
    points: normalizePoints(value.points),
    closed: Boolean(value.closed),
    linealFeet: asNumber(value.linealFeet, 0),
    manualLinealFeetInput: asString(value.manualLinealFeetInput, "--"),
    source: asString(value.source, "Not Set"),
  };
}

function normalizeElevationHeight(value: unknown): StoredElevationHeight | null {
  if (!isRecord(value)) return null;
  return {
    elevation: asString(value.elevation, "North"),
    overallHeightInput: asString(value.overallHeightInput, "0'"),
    belowGradeEnabled: Boolean(value.belowGradeEnabled),
    belowGradeInput: asString(value.belowGradeInput, "0'"),
    multipleHeights: Boolean(value.multipleHeights),
    areas: asArray<unknown>(value.areas),
  };
}

function normalizeElevationBreakdownRow(value: unknown): StoredElevationBreakdownRow | null {
  if (!isRecord(value)) return null;
  return {
    elevation: asString(value.elevation, "North"),
    approxLinearFeet: asNumber(value.approxLinearFeet, 0),
  };
}

function normalizeCourtyardFace(value: unknown): StoredCourtyardFace | null {
  if (!isRecord(value)) return null;
  return {
    face: asString(value.face, "North"),
    totalLF: asNumber(value.totalLF, 0),
    totalLegs: asNumber(value.totalLegs, 0),
    avgFrameTall: asNumber(value.avgFrameTall, 0),
    areas: asArray<unknown>(value.areas),
  };
}

function normalizeCourtyards(value: unknown): StoredCourtyard[] {
  return asArray<unknown>(value)
    .map((cy, i): StoredCourtyard | null => {
      if (!isRecord(cy)) return null;
      return {
        id: asString(cy.id, `courtyard-${i + 1}`),
        name: asString(cy.name, `Courtyard ${i + 1}`),
        faces: asArray<unknown>(cy.faces)
          .map(normalizeCourtyardFace)
          .filter((f): f is StoredCourtyardFace => Boolean(f)),
      };
    })
    .filter((cy): cy is StoredCourtyard => Boolean(cy));
}

function normalizeElevationBreakdown(value: unknown): StoredElevationBreakdownRow[] {
  return asArray<unknown>(value)
    .map(normalizeElevationBreakdownRow)
    .filter((row): row is StoredElevationBreakdownRow => Boolean(row));
}

function normalizeSectionDraftingItem(value: unknown): SectionDraftingItem | null {
  if (!isRecord(value)) return null;
  const kind: "frame" | "bracket" = value.kind === "bracket" ? "bracket" : "frame";
  return {
    id: asString(value.id, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    kind,
    variant: asString(value.variant, kind === "frame" ? "Standard" : "24\""),
    level: Math.max(0, Math.round(asNumber(value.level, 0))),
  };
}

function normalizeSectionDraftingItems(value: unknown): SectionDraftingItem[] {
  return asArray<unknown>(value)
    .map(normalizeSectionDraftingItem)
    .filter((row): row is SectionDraftingItem => Boolean(row));
}

function normalizeOverlayGeometry(
  value: unknown,
  fallbackElevationName: string,
  fallbackLevelName: string,
  fallbackScale: unknown,
): TakeoffOverlayGeometry | null {
  if (!isRecord(value)) return null;

  const fullOverlayRows = asArray<unknown>(value.fullOverlayRows)
    .map(normalizeFullOverlayRow)
    .filter((row): row is StoredFullOverlayRow => Boolean(row));
  const elevationRefs = asArray<unknown>(value.elevationRefs)
    .map(normalizeElevationReference)
    .filter((row): row is StoredElevationReference => Boolean(row));
  const elevationHeights = asArray<unknown>(value.elevationHeights)
    .map(normalizeElevationHeight)
    .filter((row): row is StoredElevationHeight => Boolean(row));
  const wallSegments = asArray<unknown>(value.wallSegments)
    .map(normalizePoints)
    .filter((segment) => segment.length >= 2);

  return {
    elevationName: asString(value.elevationName, fallbackElevationName),
    levelName: asString(value.levelName, fallbackLevelName),
    tracedPerimeter: normalizePoints(value.tracedPerimeter),
    overlayPoints: normalizePoints(value.overlayPoints),
    wallSegments,
    referencePoints: normalizePoints(value.referencePoints),
    elevationPoints: normalizePoints(value.elevationPoints),
    fullOverlayRows,
    elevationRefs,
    elevationHeights,
    scale: value.scale ?? fallbackScale,
  };
}

function nowIso() {
  return new Date().toISOString();
}

const FRAME_SIZES: { size: number; label: string }[] = [
  { size: 6 + 4 / 12, label: "6'-4\"" },
  { size: 5, label: "5'-0\"" },
  { size: 3, label: "3'-0\"" },
];

/**
 * Finds realistic physical frame stacks (combinations of 6'-4", 5', and
 * 3' frames, fine-tuned by a screw jack with 0"-18" travel) that reach a
 * given effective height. Returns up to `maxOptions` distinct valid
 * combinations, ranked by fewest total pieces first (most practical to
 * assemble), so callers can offer the optimal stack plus real
 * alternates — never an invented frame size that doesn't exist in
 * inventory. If a height is short enough that only one combination is
 * physically sensible, fewer than `maxOptions` results come back; the
 * caller should treat that as "no further recommendations" rather than
 * padding with duplicates.
 *
 * This is a first-pass estimator, not a substitute for an engineer's
 * judgment on unusual heights — it doesn't know site-specific assembly
 * constraints, only arithmetic.
 */
export function findFrameMakeupOptions(
  effectiveHeightFt: number,
  screwJackMaxExtensionIn = 18,
  maxOptions = 3,
): FrameMakeupResult[] {
  const jackMaxFt = Math.max(0, screwJackMaxExtensionIn) / 12;
  const target = Math.max(0, effectiveHeightFt);
  const [SIX, FIVE, THREE] = FRAME_SIZES.map((f) => f.size);

  const maxSix = Math.ceil(target / SIX) + 1;
  // Never more than one 5' and one 3' frame in a stack — if a combination
  // would need two of either, another 6'-4" frame should be used instead.
  // This maximizes use of the standard tall frame rather than stacking
  // multiple short pieces, which is how scaffold is actually assembled.
  const maxFive = 1;
  const maxThree = 1;

  type Candidate = { a: number; b: number; c: number; total: number; pieceCount: number; extra: number };
  const candidates: Candidate[] = [];

  for (let a = 0; a <= maxSix; a++) {
    const aHeight = a * SIX;
    if (aHeight > target + jackMaxFt) break;
    for (let b = 0; b <= maxFive; b++) {
      const baseHeight = aHeight + b * FIVE;
      if (baseHeight > target + jackMaxFt) break;
      for (let c = 0; c <= maxThree; c++) {
        const total = baseHeight + c * THREE;
        if (total > target + jackMaxFt) break;
        if (total < target - jackMaxFt) continue;
        const pieceCount = a + b + c;
        if (pieceCount === 0) continue;
        candidates.push({ a, b, c, total, pieceCount, extra: Math.abs(total - target) });
      }
    }
  }

  // Fewest pieces first (most practical to assemble); ties broken by
  // whichever combination lands closest to the actual target height.
  candidates.sort((x, y) => x.pieceCount - y.pieceCount || x.extra - y.extra);

  const seen = new Set<string>();
  const results: FrameMakeupResult[] = [];
  for (const cand of candidates) {
    const key = `${cand.a}-${cand.b}-${cand.c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pieces: FrameMakeupPiece[] = [];
    if (cand.a > 0) pieces.push({ ...FRAME_SIZES[0], qty: cand.a });
    if (cand.b > 0) pieces.push({ ...FRAME_SIZES[1], qty: cand.b });
    if (cand.c > 0) pieces.push({ ...FRAME_SIZES[2], qty: cand.c });
    const screwJackExtensionIn = Math.max(0, Math.min(jackMaxFt, target - cand.total)) * 12;
    results.push({ pieces, screwJackExtensionIn, frameTall: cand.pieceCount });
    if (results.length >= maxOptions) break;
  }

  if (results.length === 0) {
    // Degenerate case (e.g. target is 0) — fall back to a single tall
    // frame so callers always get at least one usable result.
    results.push({ pieces: [{ ...FRAME_SIZES[0], qty: 1 }], screwJackExtensionIn: 0, frameTall: 1 });
  }

  return results;
}

/** Convenience wrapper — just the single best (fewest-piece) frame makeup. */
export function computeFrameMakeup(effectiveHeightFt: number, screwJackMaxExtensionIn = 18): FrameMakeupResult {
  return findFrameMakeupOptions(effectiveHeightFt, screwJackMaxExtensionIn, 1)[0];
}

/**
 * Material rules, in one place. Backend settings override these per
 * company; the defaults encode standard practice:
 *
 * - Cross braces go in at every lift, both sides — 2 per bay per lift.
 * - Guardrails: the top lift gets 4 per bay (two front, two back). Every
 *   intermediate lift gets 2 (one mid front, one mid back).
 * - Coupling pins: 2 per frame joint. The top frame has none, because
 *   guardrail posts occupy those sockets — the same physical connection.
 * - Planks: every lift gets decked, counted by scaffold width.
 * - Base plates and screw jacks are ground-only: one per leg.
 */
export const MATERIAL_RULE_DEFAULTS = {
  crossBracesPerBayPerLift: 2,
  guardrailTopPerBay: 4,
  guardrailIntermediatePerBay: 2,
  couplingPinsPerFrame: 2,
} as const;

/**
 * Planks required to deck one bay, by scaffold width. Two different
 * wrong values for this previously existed in the codebase — a stored
 * default of 2, and a UI helper returning 3/4/6. Both are corrected here
 * to the single source of truth.
 */
export function planksPerBayForWidth(scaffoldWidthFt: number): number {
  if (scaffoldWidthFt >= 5) return 5;
  if (scaffoldWidthFt >= 3.5) return 4;
  return 3;
}

export function calculateQuantityEngine(input: QuantityEngineInput): QuantityEngineOutput {
  const linearFeet = Math.max(0, asNumber(input.linearFeet, 0));
  const wallHeight = Math.max(0, asNumber(input.wallHeight, 0));
  const standardBayLength = Math.max(1, asNumber(input.standardBayLength, defaultScaffoldInput.standardBayLength));
  const scaffoldWidth = Math.max(0, asNumber(input.scaffoldWidth, defaultScaffoldInput.scaffoldWidth));
  const workerReachHeight = Math.max(0, asNumber(input.workerReachHeight, 6));
  const screwJackMaxExtensionIn = Math.max(0, asNumber(input.screwJackMaxExtensionIn, 18));

  const bracesPerBayPerLift = Math.max(0, asNumber(input.crossBracesPerBayPerLift, MATERIAL_RULE_DEFAULTS.crossBracesPerBayPerLift));
  const railTop = Math.max(0, asNumber(input.guardrailTopPerBay, MATERIAL_RULE_DEFAULTS.guardrailTopPerBay));
  const railMid = Math.max(0, asNumber(input.guardrailIntermediatePerBay, MATERIAL_RULE_DEFAULTS.guardrailIntermediatePerBay));
  const pinsPerFrame = Math.max(0, asNumber(input.couplingPinsPerFrame, MATERIAL_RULE_DEFAULTS.couplingPinsPerFrame));

  // Planks are a function of width, not a stored scalar. An explicit
  // plankCountPerBay is still honoured when passed deliberately.
  const planksPerBay = input.plankCountPerBay > 0
    ? Math.ceil(asNumber(input.plankCountPerBay, 0))
    : planksPerBayForWidth(scaffoldWidth);

  // Height drives everything: building height → deck height → material.
  const effectiveStackHeight = Math.max(0, wallHeight - workerReachHeight);
  const makeup = computeFrameMakeup(effectiveStackHeight, screwJackMaxExtensionIn);
  const uniformLifts = Math.max(1, makeup.frameTall);

  const bayCount = Math.ceil(linearFeet / standardBayLength);
  const legCount = bayCount > 0 ? bayCount + 1 : 0;

  // Per-leg lift counts. Supplied by callers that know real per-tick
  // heights; otherwise the run is uniform.
  const legLifts = (input.legLifts && input.legLifts.length >= 2)
    ? input.legLifts.map(n => Math.max(1, Math.round(n)))
    : Array.from({ length: legCount }, () => uniformLifts);

  let frameCount = 0, couplingPinCount = 0;
  for (const lifts of legLifts) {
    frameCount += lifts;
    // Every frame joint takes pins except the topmost — guardrail posts
    // occupy those sockets instead.
    couplingPinCount += Math.max(0, lifts - 1) * pinsPerFrame;
  }

  // Bays span two legs and are governed by the shorter of them: you
  // can't brace, deck, or rail to a frame that isn't there.
  let crossBraceCount = 0, guardrailCount = 0, plankCount = 0;
  for (let i = 0; i < legLifts.length - 1; i++) {
    const bayLifts = Math.min(legLifts[i], legLifts[i + 1]);
    crossBraceCount += bayLifts * bracesPerBayPerLift;
    plankCount += bayLifts * planksPerBay;
    guardrailCount += railTop + Math.max(0, bayLifts - 1) * railMid;
  }

  const frameTall = Math.max(...legLifts, 1);

  return {
    bayCount,
    legCount,
    jumps: frameTall,
    frameTall,
    frameCount,
    plankCount,
    crossBraceCount,
    guardrailCount,
    // Ground-only: one each per leg.
    basePlateCount: legCount,
    screwJackCount: legCount,
    couplingPinCount,
    frameMakeup: makeup.pieces,
    screwJackExtensionIn: makeup.screwJackExtensionIn,
  };
}

/** A new elevation. No coverage, no height, no quantities until measured. */
function createEmptyElevation(): ProjectElevation {
  return {
    elevationId: DEMO_ELEVATION_ID,
    elevationName: "North",
    levelName: "Main Level",
    linearFeet: 0,
    wallHeight: 0,
    phase: "Main",
    mobilization: "Base Bid",
    overlayGeometry: null,
    scale: null,
    scaffoldInput: defaultScaffoldInput,
    quantityEngine: calculateQuantityEngine({
      linearFeet: 0,
      wallHeight: 0,
      ...defaultScaffoldInput,
    }),
    sectionView: {
      frameMakeup: "",
      selectedRun: "",
      wallOffset: defaultScaffoldInput.wallOffset,
      sectionType: "A-A",
      wallOutline: [],
      scaffoldSide: "left",
      draftingAdditions: [],
    },
    elevationBreakdown: [],
    courtyards: [],
    includeCourtyards: true,
  };
}

function createDemoElevation(): ProjectElevation {
  const linearFeet = 540;
  const wallHeight = 44 + 4 / 12;
  const quantityEngine = calculateQuantityEngine({
    linearFeet,
    wallHeight,
    ...defaultScaffoldInput,
  });

  return {
    elevationId: DEMO_ELEVATION_ID,
    elevationName: "North",
    levelName: "Main Level",
    linearFeet,
    wallHeight,
    phase: "Main",
    mobilization: "Base Bid",
    overlayGeometry: null,
    scale: null,
    scaffoldInput: defaultScaffoldInput,
    quantityEngine,
    sectionView: {
      frameMakeup: "5 x 6'-4\" + 1 x 5'-0\" + 1 x 3'-0\"",
      selectedRun: "Run N-01",
      wallOffset: defaultScaffoldInput.wallOffset,
      sectionType: "A-A",
      wallOutline: [],
      scaffoldSide: "left",
      draftingAdditions: [],
    },
    elevationBreakdown: [],
    courtyards: [],
    includeCourtyards: true,
  };
}

/**
 * A new project. Everything blank, because nothing has been entered yet.
 *
 * This used to be createDemoProject, and normalizeProject fell back to its
 * values field by field - so any project missing a name inherited "Mare
 * Island Apartments" and Turner Construction, and there was no way to tell a
 * real entry from a leftover. The demo still exists below, but it has to be
 * asked for by name now; it can no longer leak into a real bid.
 */
export function createEmptyProject(
  projectId: string,
  projectName = "",
): ProjectRecord {
  return {
    projectId,
    projectName,
    projectAddress: "",
    customer: "",
    estimator: "",
    proposalNumber: "",
    generalContractor: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    bidDueDate: "",
    unionStatus: "",
    bidStatus: "Draft",
    updatedAt: nowIso(),
    schemaVersion: 2,
    estimateDepth: "quick-bid",
    takeoff: {
      levels: [
        {
          levelId: DEMO_LEVEL_ID,
          levelName: "Main Level",
          elevations: [createEmptyElevation()],
        },
      ],
    },
  };
}

/**
 * The Mare Island job, kept for demos and screenshots. Nothing falls back to
 * it - it only exists when seedDemoProject() is called deliberately.
 */
function createDemoProject(): ProjectRecord {
  return {
    ...createEmptyProject(DEMO_PROJECT_ID, "Mare Island Apartments"),
    projectAddress: "Mare Island, Vallejo, CA",
    customer: "Turner Construction",
    generalContractor: "Turner Construction",
    estimator: "H. Pierre",
    proposalNumber: "KRB-260614-001",
    contactName: "Marcus Lee",
    contactEmail: "estimating@turner.com",
    contactPhone: "(510) 555-0138",
    bidDueDate: "06/14/26",
    unionStatus: "Union",
    bidStatus: "Ready To Send",
    estimateDepth: "korban-bid",
    takeoff: {
      levels: [
        {
          levelId: DEMO_LEVEL_ID,
          levelName: "Main Level",
          elevations: [createDemoElevation()],
        },
      ],
    },
  };
}

function normalizeScaffoldInput(value: unknown): ScaffoldInput {
  const record = isRecord(value) ? value : {};
  return {
    scaffoldWidth: asNumber(record.scaffoldWidth, defaultScaffoldInput.scaffoldWidth),
    standardBayLength: asNumber(record.standardBayLength, defaultScaffoldInput.standardBayLength),
    frameHeight: asNumber(record.frameHeight, defaultScaffoldInput.frameHeight),
    plankCountPerBay: asNumber(record.plankCountPerBay, defaultScaffoldInput.plankCountPerBay),
    bracePattern: asString(record.bracePattern, defaultScaffoldInput.bracePattern),
    wallOffset: asNumber(record.wallOffset, defaultScaffoldInput.wallOffset),
  };
}

function normalizeElevation(value: unknown): ProjectElevation {
  const fallback = createDemoElevation();
  const record = isRecord(value) ? value : {};
  const scaffoldInput = normalizeScaffoldInput(record.scaffoldInput);
  const normalizedLinearFeet = firstValidNumber(
    record.linearFeet,
    record.totalLinearFeet,
    record.linealFeet,
    record.linearFootage,
    record.totalLf,
    record.lf,
  );
  const linearFeet = normalizedLinearFeet ?? fallback.linearFeet;
  const wallHeight = asNumber(record.wallHeight, fallback.wallHeight);
  const elevationName = asString(record.elevationName, fallback.elevationName);
  const levelName = asString(record.levelName, fallback.levelName ?? "Main Level");
  const sectionRecord = isRecord(record.sectionView) ? record.sectionView : {};
  const calculatedQuantityEngine = calculateQuantityEngine({
    linearFeet,
    wallHeight,
    ...scaffoldInput,
  });

  return {
    elevationId: asString(record.elevationId, fallback.elevationId),
    elevationName,
    levelName,
    linearFeet,
    wallHeight,
    phase: asString(record.phase, fallback.phase),
    mobilization: asString(record.mobilization, fallback.mobilization),
    overlayGeometry: normalizeOverlayGeometry(record.overlayGeometry, elevationName, levelName, record.scale ?? fallback.scale),
    scale: record.scale ?? fallback.scale,
    scaffoldInput,
    quantityEngine: calculatedQuantityEngine,
    sectionView: {
      frameMakeup: asString(sectionRecord.frameMakeup, fallback.sectionView.frameMakeup),
      selectedRun: asString(sectionRecord.selectedRun, fallback.sectionView.selectedRun),
      wallOffset: asNumber(sectionRecord.wallOffset, scaffoldInput.wallOffset),
      sectionType: asString(sectionRecord.sectionType, fallback.sectionView.sectionType),
      wallOutline: normalizePoints(sectionRecord.wallOutline),
      scaffoldSide: sectionRecord.scaffoldSide === "right" ? "right" : "left",
      draftingAdditions: normalizeSectionDraftingItems(sectionRecord.draftingAdditions),
    },
    elevationBreakdown: normalizeElevationBreakdown(record.elevationBreakdown),
    courtyards: normalizeCourtyards(record.courtyards),
    // Default to including courtyards in totals — they're real scaffold
    // on the job; the toggle exists to break them out, not hide them.
    includeCourtyards: record.includeCourtyards === false ? false : true,
  };
}

function normalizeProject(value: unknown, fallbackProjectId = DEMO_PROJECT_ID): ProjectRecord {
  // Blank, not the demo. A missing field means nobody entered it, and saying
  // so is the whole point - inheriting another job's customer is not a default,
  // it's a lie the estimator can't see.
  const fallback = createEmptyProject(fallbackProjectId);
  const record = isRecord(value) ? value : {};
  const takeoffRecord = isRecord(record.takeoff) ? record.takeoff : {};
  const levels = asArray<unknown>(takeoffRecord.levels);
  const normalizedLevels = levels
    .map((level, levelIndex): ProjectLevel | null => {
      if (!isRecord(level)) return null;
      const elevations = asArray<unknown>(level.elevations).map(normalizeElevation);
      return {
        levelId: asString(level.levelId, levelIndex === 0 ? DEMO_LEVEL_ID : `level-${levelIndex + 1}`),
        levelName: asString(level.levelName, levelIndex === 0 ? "Main Level" : `Level ${levelIndex + 1}`),
        elevations: elevations.length ? elevations : [createEmptyElevation()],
      };
    })
    .filter((level): level is ProjectLevel => Boolean(level));

  return {
    projectId: asString(record.projectId, fallbackProjectId),
    projectName: asString(record.projectName, fallback.projectName),
    projectAddress: asString(record.projectAddress, fallback.projectAddress),
    customer: asString(record.customer, fallback.customer),
    estimator: asString(record.estimator, fallback.estimator),
    proposalNumber: asString(record.proposalNumber, fallback.proposalNumber),
    generalContractor: asString(record.generalContractor, fallback.generalContractor),
    contactName: asString(record.contactName, fallback.contactName),
    contactEmail: asString(record.contactEmail, fallback.contactEmail),
    contactPhone: asString(record.contactPhone, fallback.contactPhone),
    bidDueDate: asString(record.bidDueDate, fallback.bidDueDate),
    unionStatus: asString(record.unionStatus, fallback.unionStatus),
    bidStatus: (BID_STATUSES as readonly string[]).includes(record.bidStatus as string)
      ? (record.bidStatus as BidStatus)
      : fallback.bidStatus,
    updatedAt: asString(record.updatedAt, nowIso()),
    schemaVersion: asNumber(record.schemaVersion, 2),
    estimateDepth: DEPTH_ORDER.includes(record.estimateDepth as EstimateDepth)
      ? (record.estimateDepth as EstimateDepth)
      : "korban-bid",
    takeoff: {
      levels: normalizedLevels.length ? normalizedLevels : fallback.takeoff.levels,
    },
  };
}

function normalizeProjectData(value: unknown): ProjectData {
  const record = isRecord(value) ? value : {};
  const normalized: ProjectData = {};

  Object.entries(record).forEach(([projectId, project]) => {
    normalized[projectId] = normalizeProject(project, projectId);
  });

  // An empty install starts with one blank project, not the demo. Use
  // seedDemoProject() when a populated example is actually wanted.
  if (Object.keys(normalized).length === 0) {
    normalized[DEMO_PROJECT_ID] = createEmptyProject(DEMO_PROJECT_ID);
  }

  return normalized;
}

export function getActiveProjectId() {
  if (!canUseStorage()) return DEMO_PROJECT_ID;

  const storedId = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
  if (storedId) return storedId;

  window.localStorage.setItem(ACTIVE_PROJECT_KEY, DEMO_PROJECT_ID);
  return DEMO_PROJECT_ID;
}

export function setActiveProjectId(projectId: string) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId || DEMO_PROJECT_ID);
}

export function getActiveElevationId() {
  if (!canUseStorage()) return DEMO_ELEVATION_ID;
  return window.localStorage.getItem(ACTIVE_ELEVATION_KEY) || DEMO_ELEVATION_ID;
}

export function setActiveElevationId(elevationId: string) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(ACTIVE_ELEVATION_KEY, elevationId || DEMO_ELEVATION_ID);
}

export function getProjectData(): ProjectData {
  if (!canUseStorage()) return { [DEMO_PROJECT_ID]: createDemoProject() };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROJECT_DATA_KEY) || "{}");
    const data = normalizeProjectData(parsed);
    window.localStorage.setItem(PROJECT_DATA_KEY, JSON.stringify(data));
    return data;
  } catch {
    const data = { [DEMO_PROJECT_ID]: createDemoProject() };
    window.localStorage.setItem(PROJECT_DATA_KEY, JSON.stringify(data));
    return data;
  }
}

export function saveProjectData(data: ProjectData) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PROJECT_DATA_KEY, JSON.stringify(normalizeProjectData(data)));
}

export function getActiveProject(): ProjectRecord {
  const projectId = getActiveProjectId();
  const data = getProjectData();
  const project = data[projectId] ?? data[DEMO_PROJECT_ID] ?? createDemoProject();

  if (!data[project.projectId]) {
    data[project.projectId] = project;
    saveProjectData(data);
  }

  return project;
}

/**
 * Creates a project and makes it active. The only way a bid should begin -
 * everything downstream reads the record this writes.
 */
export function createProject(projectName = ""): ProjectRecord {
  const projectId = `prj-${Date.now().toString(36)}`;
  const project = createEmptyProject(projectId, projectName);
  const data = getProjectData();
  data[projectId] = project;
  saveProjectData(data);
  setActiveProjectId(projectId);
  return project;
}

/** Merge-writes fields onto the active project. Used by the project header. */
export function updateActiveProject(updates: Partial<ProjectRecord>): ProjectRecord {
  const current = getActiveProject();
  const next = { ...current, ...updates, updatedAt: nowIso() };
  saveActiveProject(next);
  return next;
}

export function deleteProject(projectId: string) {
  const data = getProjectData();
  delete data[projectId];
  saveProjectData(data);
  if (getActiveProjectId() === projectId) {
    const remaining = Object.keys(data)[0];
    if (remaining) setActiveProjectId(remaining);
    else createProject();
  }
}

/** Populates the Mare Island example. Only ever called deliberately. */
export function seedDemoProject(): ProjectRecord {
  const project = createDemoProject();
  const data = getProjectData();
  data[project.projectId] = project;
  saveProjectData(data);
  setActiveProjectId(project.projectId);
  return project;
}

export function listProjects(): ProjectRecord[] {
  return Object.values(getProjectData()).sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
  );
}

/** First elevation of any project. Used by lists that show many at once. */
export function getFirstElevation(project: ProjectRecord): ProjectElevation | null {
  return project.takeoff.levels[0]?.elevations[0] ?? null;
}

export function saveActiveProject(project: ProjectRecord) {
  const normalizedProject = normalizeProject(project, project.projectId);
  const data = getProjectData();
  const projectId = normalizedProject.projectId || getActiveProjectId();

  data[projectId] = {
    ...normalizedProject,
    projectId,
    updatedAt: nowIso(),
  };

  setActiveProjectId(projectId);
  saveProjectData(data);
}

export function getActiveElevation(): ProjectElevation {
  const project = getActiveProject();
  const activeElevationId = getActiveElevationId();
  const allElevations = project.takeoff.levels.flatMap((level) => level.elevations);
  const elevation =
    allElevations.find((item) => item.elevationId === activeElevationId) ??
    project.takeoff.levels[0]?.elevations[0] ??
    createDemoElevation();
  console.log("Loaded active elevation", elevation);
  return elevation;
}

export function saveActiveElevation(elevation: ProjectElevation) {
  console.log("Saved active elevation", elevation);
  const project = getActiveProject();
  const currentLevel = project.takeoff.levels[0] ?? {
    levelId: DEMO_LEVEL_ID,
    levelName: "Main Level",
    elevations: [],
  };
  const normalizedElevation = normalizeElevation(elevation);
  setActiveElevationId(normalizedElevation.elevationId);
  const elevationIndex = currentLevel.elevations.findIndex(
    (item) => item.elevationId === normalizedElevation.elevationId || item.elevationName === normalizedElevation.elevationName,
  );
  const nextElevations = [...currentLevel.elevations];

  if (elevationIndex >= 0) {
    nextElevations[elevationIndex] = normalizedElevation;
  } else {
    nextElevations.unshift(normalizedElevation);
  }

  const nextLevels = [...project.takeoff.levels];
  nextLevels[0] = {
    ...currentLevel,
    levelName: normalizedElevation.levelName ?? currentLevel.levelName,
    elevations: nextElevations,
  };

  saveActiveProject({
    ...project,
    takeoff: {
      levels: nextLevels,
    },
  });
}

/**
 * Saves just the optional Elevation Breakdown rows for the active
 * elevation, without touching linearFeet, quantityEngine, or any
 * overlay geometry. This is the dedicated save path for Takeoff
 * Workspace's "Elevation Breakdown (Optional)" section — deliberately
 * separate from saveActiveElevation's main takeoff flow.
 */
export function saveElevationBreakdown(rows: StoredElevationBreakdownRow[]) {
  const current = getActiveElevation();
  saveActiveElevation({
    ...current,
    elevationBreakdown: rows,
  });
}

/**
 * Saves a partial update to just the active elevation's sectionView
 * block (e.g. scaffoldSide toggle, draftingAdditions) without touching
 * linearFeet, quantityEngine, or overlay geometry.
 */
/**
 * Saves courtyards (and optionally the include-in-totals flag) for the
 * active elevation without touching linearFeet, quantityEngine, or any
 * overlay geometry — a dedicated path, same pattern as saveSectionView.
 */
export function saveCourtyards(courtyards: StoredCourtyard[], includeCourtyards?: boolean) {
  const current = getActiveElevation();
  saveActiveElevation({
    ...current,
    courtyards,
    includeCourtyards: includeCourtyards ?? current.includeCourtyards,
  });
}

/** Toggles whether courtyard quantities roll into project totals. */
export function setIncludeCourtyards(include: boolean) {
  const current = getActiveElevation();
  saveActiveElevation({ ...current, includeCourtyards: include });
}

/**
 * Sums scaffold quantities across every face of every courtyard on an
 * elevation. Returns zeros when there are no courtyards, so callers can
 * add this unconditionally and let the toggle decide whether to use it.
 */
/** Sets the estimate depth on the active project. */
export function setEstimateDepth(depth: EstimateDepth) {
  const project = getActiveProject();
  saveActiveProject({ ...project, estimateDepth: depth });
}

export function getEstimateDepth(): EstimateDepth {
  try {
    return getActiveProject().estimateDepth ?? "korban-bid";
  } catch {
    return "korban-bid";
  }
}

export type ElevationOnlyTotals = {
  linearFeet: number;
  bayCount: number;
  legCount: number;
  frameTall: number;
  frameCount: number;
  plankCount: number;
  crossBraceCount: number;
  guardrailCount: number;
  basePlateCount: number;
  screwJackCount: number;
  couplingPinCount: number;
  avgHeightFt: number;
  areaCount: number;
};

/**
 * Quantities derived from gripped elevation areas alone, with no plan
 * geometry — the calculation path behind Quick Bid.
 *
 * The math is the same as the plan-based path: bays from linear feet
 * divided by bay length, legs from bays, and frames per leg from
 * (height − worker reach) stacked in real frame sizes. The only
 * difference is where linear feet comes from — summed gripped areas
 * rather than a traced perimeter. Each gripped area is treated as its
 * own run, which is why bays and legs accumulate per area rather than
 * being computed from one total.
 */
export function computeElevationOnlyTotals(
  elevation: ProjectElevation | null,
  opts?: { bayLengthFt?: number; workerReachHeight?: number; plankCountPerBay?: number; screwJackMaxExtensionIn?: number; includeCourtyards?: boolean },
): ElevationOnlyTotals {
  const bayLen = Math.max(1, opts?.bayLengthFt ?? elevation?.scaffoldInput?.standardBayLength ?? 10);
  const reach = Math.max(0, opts?.workerReachHeight ?? 6);
  const ppb = Math.max(0, opts?.plankCountPerBay ?? planksPerBayForWidth(elevation?.scaffoldInput?.scaffoldWidth ?? 3));
  const jackMax = opts?.screwJackMaxExtensionIn ?? 18;

  type Run = { lf: number; heightFt: number };
  const runs: Run[] = [];

  for (const eh of (elevation?.overlayGeometry?.elevationHeights ?? []) as any[]) {
    for (const a of (eh?.areas ?? []) as any[]) {
      const lf = asNumber(a?.lf, 0), h = asNumber(a?.heightFt, 0);
      if (lf > 0 && h > 0) runs.push({ lf, heightFt: h });
    }
  }

  if (opts?.includeCourtyards ?? elevation?.includeCourtyards ?? true) {
    for (const cy of elevation?.courtyards ?? []) {
      for (const face of cy.faces) {
        for (const a of (face.areas ?? []) as any[]) {
          const lf = asNumber(a?.lf, 0), h = asNumber(a?.heightFt, 0);
          if (lf > 0 && h > 0) runs.push({ lf, heightFt: h });
        }
      }
    }
  }

  let linearFeet = 0, bayCount = 0, legCount = 0, frameCount = 0, plankCount = 0, heightSum = 0;
  let crossBraceCount = 0, guardrailCount = 0, couplingPinCount = 0;
  let maxFrameTall = 0;

  for (const run of runs) {
    const bays = Math.max(1, Math.ceil(run.lf / bayLen));
    const legs = bays + 1;
    const makeup = computeFrameMakeup(Math.max(0, run.heightFt - reach), jackMax);
    const tall = Math.max(1, makeup.frameTall);
    linearFeet += run.lf;
    bayCount += bays;
    legCount += legs;
    frameCount += legs * tall;
    plankCount += bays * ppb * tall;
    // These repeat at every lift, same as on the plan-geometry path.
    crossBraceCount += bays * tall * MATERIAL_RULE_DEFAULTS.crossBracesPerBayPerLift;
    guardrailCount += bays * (MATERIAL_RULE_DEFAULTS.guardrailTopPerBay + Math.max(0, tall - 1) * MATERIAL_RULE_DEFAULTS.guardrailIntermediatePerBay);
    couplingPinCount += legs * Math.max(0, tall - 1) * MATERIAL_RULE_DEFAULTS.couplingPinsPerFrame;
    heightSum += run.heightFt;
    if (tall > maxFrameTall) maxFrameTall = tall;
  }

  return {
    linearFeet: parseFloat(linearFeet.toFixed(1)),
    bayCount,
    legCount,
    frameTall: maxFrameTall,
    frameCount,
    plankCount,
    crossBraceCount,
    guardrailCount,
    couplingPinCount,
    basePlateCount: legCount,
    screwJackCount: legCount,
    avgHeightFt: runs.length ? parseFloat((heightSum / runs.length).toFixed(1)) : 0,
    areaCount: runs.length,
  };
}

/**
 * A plain-language account of what the current depth covers and what it
 * doesn't — written the way a competent estimator would report to a
 * manager: direct, specific, honest about uncertainty, and clear about
 * what the next stage would resolve.
 */
export function buildPhaseReport(elevation: ProjectElevation | null, depth: EstimateDepth, totals?: ElevationOnlyTotals) {
  const t = totals ?? computeElevationOnlyTotals(elevation);
  const levelCount = elevation?.overlayGeometry?.fullOverlayRows?.length ?? 0;
  const tracedLevels = (elevation?.overlayGeometry?.fullOverlayRows ?? []).filter(r => r.points.length >= 3).length;
  const courtyardCount = elevation?.courtyards?.length ?? 0;

  if (depth === "quick-bid") {
    const covered = t.areaCount > 0
      ? `${t.areaCount} area${t.areaCount === 1 ? "" : "s"} gripped, ${t.linearFeet.toLocaleString()} LF total, averaging ${t.avgHeightFt}' tall${courtyardCount ? `, including ${courtyardCount} courtyard${courtyardCount === 1 ? "" : "s"}` : ""}. That's enough for a budget number.`
      : `Nothing's gripped yet, so there's no number to give you. Grip the areas that need coverage on each elevation and this fills in.`;
    return {
      headline: "Quick Bid",
      covered,
      gaps: t.areaCount > 0 ? [
        "How these walls actually connect at the corners — inside and outside corners carry different material.",
        "Whether any walls step back at height, which would mean brackets or a second run.",
        "Where legs land in plan, so there's no layout drawing to hand a foreman.",
      ] : [],
      nextStep: t.areaCount > 0
        ? "Full Bid sorts that out. It needs a floor plan traced — the elevation work you've already done carries straight over."
        : "",
    };
  }

  if (depth === "full-bid") {
    return {
      headline: "Full Bid",
      covered: tracedLevels > 0
        ? `${tracedLevels} level${tracedLevels === 1 ? "" : "s"} traced against ${t.areaCount} gripped area${t.areaCount === 1 ? "" : "s"}, ${t.linearFeet.toLocaleString()} LF. Plan geometry is in, so corners and leg positions are real rather than assumed.`
        : `Elevations are gripped but no floor plan is traced yet, so this is still running on elevation data alone. Trace at least one level to get the plan geometry a full bid needs.`,
      gaps: [
        "Section conditions aren't drawn, so wall steps and setbacks aren't visually verified.",
        "No 3D check on the layout — worth having before a hard bid.",
        levelCount > 1 ? "Multi-level step-backs are detected from the outlines but not yet reviewed against sections." : "Only one level is traced, so nothing's known about how the building changes with height.",
      ],
      nextStep: "Korban Bid adds section views, the 3D model, and my own review of the trouble spots.",
    };
  }

  return {
    headline: "Korban Bid",
    covered: `${tracedLevels} level${tracedLevels === 1 ? "" : "s"} traced, ${t.areaCount} area${t.areaCount === 1 ? "" : "s"} gripped, ${t.linearFeet.toLocaleString()} LF. Full geometry, sections, and 3D are available.`,
    gaps: [],
    nextStep: "Everything I can assess is on the table. What's left is your judgment on the numbers.",
  };
}

export function computeCourtyardTotals(elevation: ProjectElevation | null) {
  const empty = { linearFeet: 0, legs: 0, frameTall: 0, faceCount: 0, courtyardCount: 0 };
  const courtyards = elevation?.courtyards ?? [];
  if (!courtyards.length) return empty;
  let linearFeet = 0, legs = 0, frameTallSum = 0, faceCount = 0;
  for (const cy of courtyards) {
    for (const face of cy.faces) {
      if (face.totalLF <= 0) continue;
      linearFeet += face.totalLF;
      legs += face.totalLegs;
      frameTallSum += face.avgFrameTall;
      faceCount++;
    }
  }
  return {
    linearFeet: parseFloat(linearFeet.toFixed(1)),
    legs,
    frameTall: faceCount ? Math.round(frameTallSum / faceCount) : 0,
    faceCount,
    courtyardCount: courtyards.length,
  };
}

export function saveSectionView(updates: Partial<ProjectElevation["sectionView"]>) {
  const current = getActiveElevation();
  saveActiveElevation({
    ...current,
    sectionView: { ...current.sectionView, ...updates },
  });
}

export function hasTakeoffOverlayGeometry(elevation: ProjectElevation | null) {
  const geometry = elevation?.overlayGeometry;
  if (!geometry) return false;

  return (
    geometry.tracedPerimeter.length >= 2 ||
    geometry.overlayPoints.length >= 2 ||
    geometry.elevationPoints.length >= 2 ||
    geometry.referencePoints.length >= 2 ||
    geometry.wallSegments.some((segment) => segment.length >= 2) ||
    geometry.fullOverlayRows.some((row) => row.points.length >= 2) ||
    geometry.elevationRefs.some((row) => row.points.length >= 2)
  );
}
