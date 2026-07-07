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
};

export type ProjectLevel = {
  levelId: string;
  levelName: string;
  elevations: ProjectElevation[];
};

export type ProjectRecord = {
  projectId: string;
  projectName: string;
  projectAddress: string;
  customer: string;
  estimator: string;
  updatedAt: string;
  schemaVersion: number;
  takeoff: {
    levels: ProjectLevel[];
  };
};

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
  plankCountPerBay: 2,
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
  return {
    id: asNumber(value.id, Date.now()),
    isKeyFloor: Boolean(value.isKeyFloor),
    overlayType: asString(value.overlayType, "Level"),
    level: asString(value.level, "Main Level"),
    points: normalizePoints(value.points),
    closed: Boolean(value.closed),
    linealFeet: asNumber(value.linealFeet, 0),
    color: asString(value.color, "#2563eb"),
    pageNumber: asNumber(value.pageNumber, 1),
  };
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
  const maxFive = Math.ceil(target / FIVE) + 1;
  const maxThree = Math.ceil(target / THREE) + 1;

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

export function calculateQuantityEngine(input: QuantityEngineInput): QuantityEngineOutput {
  const linearFeet = Math.max(0, asNumber(input.linearFeet, 0));
  const wallHeight = Math.max(0, asNumber(input.wallHeight, 0));
  const standardBayLength = Math.max(1, asNumber(input.standardBayLength, defaultScaffoldInput.standardBayLength));
  const frameHeight = Math.max(1, asNumber(input.frameHeight, defaultScaffoldInput.frameHeight));
  const plankCountPerBay = Math.max(0, Math.ceil(asNumber(input.plankCountPerBay, defaultScaffoldInput.plankCountPerBay)));
  const workerReachHeight = Math.max(0, asNumber(input.workerReachHeight, 6));
  const screwJackMaxExtensionIn = Math.max(0, asNumber(input.screwJackMaxExtensionIn, 18));

  const bayCount = Math.ceil(linearFeet / standardBayLength);
  const legCount = bayCount > 0 ? bayCount + 1 : 0;
  // The top scaffold deck doesn't need to reach the full wall height —
  // a worker standing on it can reach roughly workerReachHeight above
  // where they stand. The remaining height is stacked using the actual
  // realistic frame combination (6'-4"/5'/3' + screw jack), not just a
  // rounded-up count of same-size frames.
  const effectiveStackHeight = Math.max(0, wallHeight - workerReachHeight);
  const makeup = computeFrameMakeup(effectiveStackHeight, screwJackMaxExtensionIn);
  const frameTall = Math.max(1, makeup.frameTall);
  const jumps = frameTall;
  const frameCount = legCount * frameTall;
  const plankCount = bayCount * plankCountPerBay;
  const crossBraceCount = input.bracePattern === "Every Bay" ? bayCount : 0;
  const guardrailCount = bayCount;
  const basePlateCount = legCount;
  const screwJackCount = legCount;

  return {
    bayCount,
    legCount,
    jumps,
    frameTall,
    frameCount,
    plankCount,
    crossBraceCount,
    guardrailCount,
    basePlateCount,
    screwJackCount,
    frameMakeup: makeup.pieces,
    screwJackExtensionIn: makeup.screwJackExtensionIn,
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
  };
}

function createDemoProject(): ProjectRecord {
  return {
    projectId: DEMO_PROJECT_ID,
    projectName: "Mare Island Apartments",
    projectAddress: "Mare Island, Vallejo, CA",
    customer: "Turner Construction",
    estimator: "H. Pierre",
    updatedAt: nowIso(),
    schemaVersion: 1,
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
  };
}

function normalizeProject(value: unknown, fallbackProjectId = DEMO_PROJECT_ID): ProjectRecord {
  const fallback = createDemoProject();
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
        elevations: elevations.length ? elevations : [createDemoElevation()],
      };
    })
    .filter((level): level is ProjectLevel => Boolean(level));

  return {
    projectId: asString(record.projectId, fallbackProjectId),
    projectName: asString(record.projectName, fallback.projectName),
    projectAddress: asString(record.projectAddress, fallback.projectAddress),
    customer: asString(record.customer, fallback.customer),
    estimator: asString(record.estimator, fallback.estimator),
    updatedAt: asString(record.updatedAt, nowIso()),
    schemaVersion: asNumber(record.schemaVersion, 1),
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

  if (!normalized[DEMO_PROJECT_ID]) {
    normalized[DEMO_PROJECT_ID] = createDemoProject();
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
