/**
 * settingsStore.ts
 *
 * KORBAN's personal preferences layer — how THIS user likes their tools
 * to behave. This is intentionally separate from backendStore.ts, which
 * holds company/business defaults (rates, scaffold standards, proposal
 * language). The distinction:
 *
 *   backendStore.ts -> "How does the business run?"      (Estimator Control Center)
 *   settingsStore.ts -> "How do I like my tools to behave?" (AutoCAD Options / Bluebeam Preferences)
 *
 * Nothing in here should ever hold pricing, rates, or scaffold defaults —
 * that belongs in Backend. Settings only ever holds display/UX toggles.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type LandingPage =
  | "Project Dashboard"
  | "Takeoff Workspace"
  | "Set Scaffold"
  | "Section View"
  | "Estimate Review";

export type UserPreferences = {
  displayName: string;
  email: string;
  role: string;
  defaultLandingPage: LandingPage;
};

export type DisplayFormat = "Feet/Inches" | "Decimal Feet" | "Metric";
export type DimensionPrecision = `1"` | `1/2"` | `1/4"`;

export type MeasurementPreferences = {
  displayFormat: DisplayFormat;
  dimensionPrecision: DimensionPrecision;
  showFractions: boolean;
};

export type GridSize = "1'" | "5'" | "10'";

export type ViewerPreferences = {
  showGrid: boolean;
  gridSize: GridSize;
  showWallOffset: boolean;
  showLevelLabels: boolean;
  showElevationLabels: boolean;
  showMeasurementLabels: boolean;
};

export type TakeoffPreferences = {
  autoSaveOverlay: boolean;
  confirmBeforeClear: boolean;
  showOverlayLabels: boolean;
  showPreviousLevels: boolean;
  autoStoreElevation: boolean;
};

export type DefaultZoom = "100%" | "125%" | "150%";

export type SetScaffoldPreferences = {
  showBayMarkers: boolean;
  showLegMarkers: boolean;
  showCornerLegs: boolean;
  showDiagonalBraces: boolean;
  showFrameCounts: boolean;
  defaultZoom: DefaultZoom;
};

export type SectionViewPreferences = {
  showSectionLabels: boolean;
  showFrameMakeup: boolean;
  showPartQuantities: boolean;
  showDraftingLibrary: boolean;
  showDrawingTools: boolean;
  autoPopulateSection: boolean;
};

export type EstimateReviewPreferences = {
  showRevenuePanel: boolean;
  showLaborPanel: boolean;
  showInternalReview: boolean;
  showAlternates: boolean;
  showBreakoutAreas: boolean;
};

/**
 * Appearance is intentionally locked/read-only for MVP — no theme
 * switching. This type exists so the Appearance tile has something to
 * display, but the UI never lets these values change.
 */
export type AppearanceSettings = {
  theme: "KORBAN Dark";
  accentColor: "#F97316";
  typography: {
    titles: "Barlow Condensed";
    app: "Geist";
    engineering: "Fira Code";
  };
};

export type SettingsData = {
  user: UserPreferences;
  measurement: MeasurementPreferences;
  viewer: ViewerPreferences;
  takeoff: TakeoffPreferences;
  setScaffold: SetScaffoldPreferences;
  sectionView: SectionViewPreferences;
  estimateReview: EstimateReviewPreferences;
  appearance: AppearanceSettings;
  schemaVersion: number;
};

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: SettingsData = {
  user: {
    displayName: "",
    email: "",
    role: "Estimator",
    defaultLandingPage: "Project Dashboard",
  },
  measurement: {
    displayFormat: "Feet/Inches",
    dimensionPrecision: `1/4"`,
    showFractions: true,
  },
  viewer: {
    showGrid: true,
    gridSize: "5'",
    showWallOffset: true,
    showLevelLabels: true,
    showElevationLabels: true,
    showMeasurementLabels: true,
  },
  takeoff: {
    autoSaveOverlay: true,
    confirmBeforeClear: true,
    showOverlayLabels: true,
    showPreviousLevels: true,
    autoStoreElevation: true,
  },
  setScaffold: {
    showBayMarkers: true,
    showLegMarkers: true,
    showCornerLegs: true,
    showDiagonalBraces: true,
    showFrameCounts: true,
    defaultZoom: "100%",
  },
  sectionView: {
    showSectionLabels: true,
    showFrameMakeup: true,
    showPartQuantities: true,
    showDraftingLibrary: true,
    showDrawingTools: true,
    autoPopulateSection: true,
  },
  estimateReview: {
    showRevenuePanel: true,
    showLaborPanel: true,
    showInternalReview: true,
    showAlternates: true,
    showBreakoutAreas: true,
  },
  appearance: {
    theme: "KORBAN Dark",
    accentColor: "#F97316",
    typography: {
      titles: "Barlow Condensed",
      app: "Geist",
      engineering: "Fira Code",
    },
  },
  schemaVersion: 1,
};

// ─── Storage plumbing ───────────────────────────────────────────────────────

const SETTINGS_KEY = "korbanSettings_v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asEnum<T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function normalizeUser(value: unknown): UserPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.user;
  return {
    displayName: asString(r.displayName, d.displayName),
    email: asString(r.email, d.email),
    role: asString(r.role, d.role),
    defaultLandingPage: asEnum(r.defaultLandingPage, d.defaultLandingPage, [
      "Project Dashboard",
      "Takeoff Workspace",
      "Set Scaffold",
      "Section View",
      "Estimate Review",
    ] as const),
  };
}

function normalizeMeasurement(value: unknown): MeasurementPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.measurement;
  return {
    displayFormat: asEnum(r.displayFormat, d.displayFormat, ["Feet/Inches", "Decimal Feet", "Metric"] as const),
    dimensionPrecision: asEnum(r.dimensionPrecision, d.dimensionPrecision, [`1"`, `1/2"`, `1/4"`] as const),
    showFractions: asBoolean(r.showFractions, d.showFractions),
  };
}

function normalizeViewer(value: unknown): ViewerPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.viewer;
  return {
    showGrid: asBoolean(r.showGrid, d.showGrid),
    gridSize: asEnum(r.gridSize, d.gridSize, ["1'", "5'", "10'"] as const),
    showWallOffset: asBoolean(r.showWallOffset, d.showWallOffset),
    showLevelLabels: asBoolean(r.showLevelLabels, d.showLevelLabels),
    showElevationLabels: asBoolean(r.showElevationLabels, d.showElevationLabels),
    showMeasurementLabels: asBoolean(r.showMeasurementLabels, d.showMeasurementLabels),
  };
}

function normalizeTakeoff(value: unknown): TakeoffPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.takeoff;
  return {
    autoSaveOverlay: asBoolean(r.autoSaveOverlay, d.autoSaveOverlay),
    confirmBeforeClear: asBoolean(r.confirmBeforeClear, d.confirmBeforeClear),
    showOverlayLabels: asBoolean(r.showOverlayLabels, d.showOverlayLabels),
    showPreviousLevels: asBoolean(r.showPreviousLevels, d.showPreviousLevels),
    autoStoreElevation: asBoolean(r.autoStoreElevation, d.autoStoreElevation),
  };
}

function normalizeSetScaffold(value: unknown): SetScaffoldPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.setScaffold;
  return {
    showBayMarkers: asBoolean(r.showBayMarkers, d.showBayMarkers),
    showLegMarkers: asBoolean(r.showLegMarkers, d.showLegMarkers),
    showCornerLegs: asBoolean(r.showCornerLegs, d.showCornerLegs),
    showDiagonalBraces: asBoolean(r.showDiagonalBraces, d.showDiagonalBraces),
    showFrameCounts: asBoolean(r.showFrameCounts, d.showFrameCounts),
    defaultZoom: asEnum(r.defaultZoom, d.defaultZoom, ["100%", "125%", "150%"] as const),
  };
}

function normalizeSectionView(value: unknown): SectionViewPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.sectionView;
  return {
    showSectionLabels: asBoolean(r.showSectionLabels, d.showSectionLabels),
    showFrameMakeup: asBoolean(r.showFrameMakeup, d.showFrameMakeup),
    showPartQuantities: asBoolean(r.showPartQuantities, d.showPartQuantities),
    showDraftingLibrary: asBoolean(r.showDraftingLibrary, d.showDraftingLibrary),
    showDrawingTools: asBoolean(r.showDrawingTools, d.showDrawingTools),
    autoPopulateSection: asBoolean(r.autoPopulateSection, d.autoPopulateSection),
  };
}

function normalizeEstimateReview(value: unknown): EstimateReviewPreferences {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_SETTINGS.estimateReview;
  return {
    showRevenuePanel: asBoolean(r.showRevenuePanel, d.showRevenuePanel),
    showLaborPanel: asBoolean(r.showLaborPanel, d.showLaborPanel),
    showInternalReview: asBoolean(r.showInternalReview, d.showInternalReview),
    showAlternates: asBoolean(r.showAlternates, d.showAlternates),
    showBreakoutAreas: asBoolean(r.showBreakoutAreas, d.showBreakoutAreas),
  };
}

function normalizeSettings(value: unknown): SettingsData {
  const r = isRecord(value) ? value : {};
  return {
    user: normalizeUser(r.user),
    measurement: normalizeMeasurement(r.measurement),
    viewer: normalizeViewer(r.viewer),
    takeoff: normalizeTakeoff(r.takeoff),
    setScaffold: normalizeSetScaffold(r.setScaffold),
    sectionView: normalizeSectionView(r.sectionView),
    estimateReview: normalizeEstimateReview(r.estimateReview),
    appearance: DEFAULT_SETTINGS.appearance, // locked — always the default, never read from storage
    schemaVersion: 1,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getSettings(): SettingsData {
  if (!canUseStorage()) return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<SettingsData>): void {
  if (!canUseStorage()) return;
  const current = getSettings();
  const next = normalizeSettings({ ...current, ...settings });
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export function saveSettingsSection<K extends keyof Omit<SettingsData, "schemaVersion" | "appearance">>(
  section: K,
  value: SettingsData[K],
): void {
  const current = getSettings();
  saveSettings({ ...current, [section]: value });
}

export function resetSettings(): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
}

/**
 * Returns settings as a formatted JSON string for export/download.
 */
export function exportSettingsAsJson(): string {
  return JSON.stringify(getSettings(), null, 2);
}

/**
 * Parses and saves a previously-exported settings JSON string.
 * Returns true on success, false if the input couldn't be parsed.
 */
export function importSettingsFromJson(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    saveSettings(parsed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears KORBAN's demo/seed data (the Mare Island Apartments demo project
 * and any other seeded localStorage entries) without touching real user
 * settings or backend configuration.
 */
export function clearDemoData(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem("korbanProjectData_v1");
  window.localStorage.removeItem("korbanActiveProjectId");
  window.localStorage.removeItem("korbanActiveElevationId");
  window.localStorage.removeItem("korbanTakeoffHub");
  window.localStorage.removeItem("korbanProjectEstimates_v1");
}

/**
 * Clears all KORBAN local storage data, including settings, backend
 * config, and project data. This is a hard reset of everything stored
 * locally — use with caution.
 */
export function clearLocalCache(): void {
  if (!canUseStorage()) return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("korban")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}
