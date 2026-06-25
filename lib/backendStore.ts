/**
 * backendStore.ts
 *
 * KORBAN's single source of truth for estimator-configurable defaults.
 * This is the "Backend" — the control center an estimator sets up once,
 * which then quietly feeds Takeoff Workspace, Set Scaffold, Frame
 * Configuration, Section View, Estimate Review, and the Proposal output.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

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
   * Maximum screw jack extension in inches. Range 1"–18". Default 12" (1 foot).
   * Used by Frame Configuration to calculate the base frame stack — the
   * remaining height after stacking frames is covered by the screw jack
   * up to this maximum. Keeping the default at 12" (not the full 18")
   * ensures a safe working margin below the physical limit.
   */
  screwJackMaxExtension: number;
  jumpLogic: string;
};

export type MaterialItem = {
  id: string;
  name: string;
  isCore: boolean;
  unitRate: number;
};

export type MaterialDefaults = {
  items: MaterialItem[];
};

export type LaborDefaults = {
  installCrewSize: number;
  dismantleCrewSize: number;
  installProductionRate: number;
  dismantleProductionRate: number;
  apprenticeRate: number;
  journeymanRate: number;
  foremanRate: number;
  travelTimeHours: number;
  truckDeliveryRate: number;
  mobilizationCost: number;
  dismantleCost: number;
};

export type PricingDefaults = {
  rentalDurationDays: number;
  rentalPeriodType: "30 Days" | "60 Days" | "90 Days" | "120 Days" | "Custom";
  frameMonthlyRate: number;
  plankMonthlyRate: number;
  braceMonthlyRate: number;
  guardrailMonthlyRate: number;
  basePlateMonthlyRate: number;
  screwJackMonthlyRate: number;
  miscCost: number;
  markupPercent: number;
  marginPercent: number;
  taxPercent: number;
  partialExteriorMarkupPercent: number;
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
  addAlternateDefaults: AddAlternateDefault[];
};

export type BackendSettings = {
  company: CompanySettings;
  scaffold: ScaffoldDefaults;
  material: MaterialDefaults;
  labor: LaborDefaults;
  pricing: PricingDefaults;
  proposal: ProposalDefaults;
  schemaVersion: number;
};

// ─── Defaults ───────────────────────────────────────────────────────────────

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

  const core = CORE_MATERIAL_NAMES.map((name) => ({
    id: slugify(name),
    name,
    isCore: true,
    unitRate: coreRates[name] ?? 0,
  }));

  const specialty = SPECIALTY_MATERIAL_NAMES.map((name) => ({
    id: slugify(name),
    name,
    isCore: false,
    unitRate: 0,
  }));

  return [...core, ...specialty];
}

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
    // Default 12" (1 foot) — safe working margin below the 18" physical max
    screwJackMaxExtension: 12,
    jumpLogic: "Standard",
  },
  material: {
    items: buildDefaultMaterialItems(),
  },
  labor: {
    installCrewSize: 4,
    dismantleCrewSize: 4,
    installProductionRate: 25,
    dismantleProductionRate: 35,
    apprenticeRate: 48,
    journeymanRate: 72,
    foremanRate: 85,
    travelTimeHours: 1,
    truckDeliveryRate: 425,
    mobilizationCost: 1200,
    dismantleCost: 0,
  },
  pricing: {
    rentalDurationDays: 30,
    rentalPeriodType: "30 Days",
    frameMonthlyRate: 4,
    plankMonthlyRate: 2,
    braceMonthlyRate: 3.25,
    guardrailMonthlyRate: 4.1,
    basePlateMonthlyRate: 1.85,
    screwJackMonthlyRate: 2.4,
    miscCost: 0,
    markupPercent: 15,
    marginPercent: 0,
    taxPercent: 0,
    partialExteriorMarkupPercent: 6,
  },
  proposal: {
    clientLogoUrl: "",
    proposalNumberFormat: "KRB-{YYMMDD}-{seq}",
    introLanguage:
      "Proposal includes furnishing, erecting, maintaining, and dismantling frame scaffold based on provided bid documents and current KORBAN takeoff assumptions.",
    scopeLanguage: "",
    exclusionsLanguage: "",
    termsLanguage: "",
    rentalDurationLanguage: "Base rental is monthly. Duration applies billing months to the bid amount.",
    signatureBlock: "",
    addAlternateDefaults: [
      { id: "netting", title: "Debris Netting", description: "Provide debris netting at scaffold exterior elevations.", defaultValue: 9800 },
      { id: "toe-boards", title: "Toe Boards", description: "Provide toe boards at working deck elevations where required.", defaultValue: 6200 },
      { id: "canopy", title: "Pedestrian Canopy", description: "Provide pedestrian canopy protection at designated access zones.", defaultValue: 22500 },
      { id: "stair-tower", title: "Stair Tower", description: "Provide scaffold stair tower access at field-determined location.", defaultValue: 14500 },
    ],
  },
  schemaVersion: 1,
};

// ─── Storage plumbing ───────────────────────────────────────────────────────

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
    // Clamp to valid range 1–18 inches
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
  };
}

function normalizeMaterial(value: unknown): MaterialDefaults {
  const r = isRecord(value) ? value : {};
  const defaults = buildDefaultMaterialItems();

  if (!Array.isArray(r.items) || r.items.length === 0) {
    return { items: defaults };
  }

  const storedById = new Map<string, unknown>();
  r.items.forEach((item) => {
    if (isRecord(item) && typeof item.id === "string") {
      storedById.set(item.id, item);
    }
  });

  const merged = defaults.map((fallback) =>
    storedById.has(fallback.id) ? normalizeMaterialItem(storedById.get(fallback.id), fallback) : fallback,
  );

  const defaultIds = new Set(defaults.map((item) => item.id));
  const customItems = r.items
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "string" && !defaultIds.has(item.id as string))
    .map((item) => normalizeMaterialItem(item, { id: String(item.id), name: "Custom Item", isCore: false, unitRate: 0 }));

  return { items: [...merged, ...customItems] };
}

function normalizeLabor(value: unknown): LaborDefaults {
  const r = isRecord(value) ? value : {};
  const d = DEFAULT_BACKEND_SETTINGS.labor;
  return {
    installCrewSize: asNumber(r.installCrewSize, d.installCrewSize),
    dismantleCrewSize: asNumber(r.dismantleCrewSize, d.dismantleCrewSize),
    installProductionRate: asNumber(r.installProductionRate, d.installProductionRate),
    dismantleProductionRate: asNumber(r.dismantleProductionRate, d.dismantleProductionRate),
    apprenticeRate: asNumber(r.apprenticeRate, d.apprenticeRate),
    journeymanRate: asNumber(r.journeymanRate, d.journeymanRate),
    foremanRate: asNumber(r.foremanRate, d.foremanRate),
    travelTimeHours: asNumber(r.travelTimeHours, d.travelTimeHours),
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
    frameMonthlyRate: asNumber(r.frameMonthlyRate, d.frameMonthlyRate),
    plankMonthlyRate: asNumber(r.plankMonthlyRate, d.plankMonthlyRate),
    braceMonthlyRate: asNumber(r.braceMonthlyRate, d.braceMonthlyRate),
    guardrailMonthlyRate: asNumber(r.guardrailMonthlyRate, d.guardrailMonthlyRate),
    basePlateMonthlyRate: asNumber(r.basePlateMonthlyRate, d.basePlateMonthlyRate),
    screwJackMonthlyRate: asNumber(r.screwJackMonthlyRate, d.screwJackMonthlyRate),
    miscCost: asNumber(r.miscCost, d.miscCost),
    markupPercent: asNumber(r.markupPercent, d.markupPercent),
    marginPercent: asNumber(r.marginPercent, d.marginPercent),
    taxPercent: asNumber(r.taxPercent, d.taxPercent),
    partialExteriorMarkupPercent: asNumber(r.partialExteriorMarkupPercent, d.partialExteriorMarkupPercent),
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
    exclusionsLanguage: asString(r.exclusionsLanguage, d.exclusionsLanguage),
    termsLanguage: asString(r.termsLanguage, d.termsLanguage),
    rentalDurationLanguage: asString(r.rentalDurationLanguage, d.rentalDurationLanguage),
    signatureBlock: asString(r.signatureBlock, d.signatureBlock),
    addAlternateDefaults: alternates,
  };
}

function normalizeBackendSettings(value: unknown): BackendSettings {
  const r = isRecord(value) ? value : {};
  return {
    company: normalizeCompany(r.company),
    scaffold: normalizeScaffold(r.scaffold),
    material: normalizeMaterial(r.material),
    labor: normalizeLabor(r.labor),
    pricing: normalizePricing(r.pricing),
    proposal: normalizeProposal(r.proposal),
    schemaVersion: asNumber(r.schemaVersion, 1),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

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

// ─── Backwards-compatible exports (formerly ratesStore.ts) ────────────────

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
  dismantlePercent: 60,
};

export function getRates(): KorbanRates {
  const settings = getBackendSettings();
  return {
    frameMonthlyRate: settings.pricing.frameMonthlyRate,
    plankMonthlyRate: settings.pricing.plankMonthlyRate,
    apprenticeRate: settings.labor.apprenticeRate,
    journeymanRate: settings.labor.journeymanRate,
    foremanRate: settings.labor.foremanRate,
    planksPerTruckLoad: 150,
    tripsPerTruckLoad: 2,
    defaultProductionType: "Balanced",
    ...PRODUCTION_DAY_DEFAULTS,
    defaultMarkupPercent: settings.pricing.markupPercent,
    defaultMiscCostBuffer: settings.pricing.miscCost,
    defaultMiscRevenueBuffer: 0,
    schemaVersion: 1,
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
