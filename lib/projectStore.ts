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
  };
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

export function calculateQuantityEngine(input: QuantityEngineInput): QuantityEngineOutput {
  const linearFeet = Math.max(0, asNumber(input.linearFeet, 0));
  const wallHeight = Math.max(0, asNumber(input.wallHeight, 0));
  const standardBayLength = Math.max(1, asNumber(input.standardBayLength, defaultScaffoldInput.standardBayLength));
  const frameHeight = Math.max(1, asNumber(input.frameHeight, defaultScaffoldInput.frameHeight));
  const plankCountPerBay = Math.max(0, Math.ceil(asNumber(input.plankCountPerBay, defaultScaffoldInput.plankCountPerBay)));

  const bayCount = Math.ceil(linearFeet / standardBayLength);
  const legCount = bayCount > 0 ? bayCount + 1 : 0;
  const frameTall = Math.max(1, Math.ceil(wallHeight / frameHeight));
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
    },
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
    },
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
