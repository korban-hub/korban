/**
 * Add-alternate pricing.
 *
 * Each alternate computes from the takeoff rather than carrying a flat
 * number, so changing coverage or height moves the alternate with it. Every
 * rate below is a company standard and belongs in Backend > Material Pricing
 * once that section grows a home for them — they are gathered here, named,
 * and used nowhere else so that move is a one-line change per rate.
 *
 * TRADE LANGUAGE: vertical repetitions are JUMPS. Never "lifts".
 */

export type AlternateId =
  | "shrink-wrap"
  | "netting"
  | "canopy"
  | "hoist-landing"
  | "stair-tower"
  | "toe-boards";

import { getBackendSettings, type AlternateRateDefaults } from "@/lib/backendStore";

/**
 * Fallback only. The live values come from Backend > Alternate Pricing via
 * getBackendSettings().alternates - these are what a brand new install starts
 * with, and what runs during server render before storage is readable.
 */
export const ALTERNATE_RATES = {
  /** Shrink wrap, per square foot of wrapped face. */
  shrinkWrapPerSqFt: 2.5,
  /** Full wrap runs the scaffold height plus this much extra. */
  shrinkWrapFullAddedHeightFt: 14,
  /** Cap wrap is a fixed band at the top, regardless of building height. */
  shrinkWrapCapHeightFt: 16,

  /** Debris netting, per square foot. */
  nettingPerSqFt: 0.8,
  /** Netting runs the scaffold height plus this much extra. */
  nettingAddedHeightFt: 3,

  /** Pedestrian canopy is priced in whole units of this many linear feet. */
  canopyLinearFeetPerUnit: 90,
  canopyInstallHoursPerUnit: 24,
  canopyDismantleHoursPerUnit: 16,
  canopyTravelHoursPerUnit: 6,
  canopyMaterialPerUnit: 275,

  /** Hoist landing: fixed 10' x 10' x 4' tall. Quantity is the only variable. */
  hoistInstallHours: 20,
  hoistDismantleHours: 16,
  hoistRentalEach: 400,

  /** Stair tower hours by building height, up to the tall threshold. */
  stairTowerHourBands: [
    { throughFt: 19, installHours: 16, dismantleHours: 12 },
    { throughFt: 29, installHours: 24, dismantleHours: 16 },
    { throughFt: 39, installHours: 40, dismantleHours: 32 },
    { throughFt: 55, installHours: 48, dismantleHours: 40 },
  ],
  /** Travel hours per stair tower, at any height. */
  stairTowerTravelHours: 6,
  /** Up-and-over a parapet, typically 2-4' tall. */
  stairTowerParapetInstallHours: 16,
  stairTowerParapetDismantleHours: 8,
  /** Walkoffs - decks that access a floor level. Per walkoff. */
  stairTowerWalkoffInstallHours: 8,
  stairTowerWalkoffDismantleHours: 8,
  stairTowerWalkoffTravelHours: 2,
  /** Stair tower rent, per jump of scaffold alongside it. */
  stairTowerRentPerJump: 110,
  /** Above this BUILDING height the crew rule gives way to mobilizations. */
  stairTowerTallThresholdFt: 55,
  /** Tall towers: one crew-day per this many building levels. */
  stairTowerLevelsPerMobilization: 2,
  stairTowerHoursPerMobilization: 24,
  /** Dismantle runs at this share of install under either rule. */
  stairTowerDismantlePercent: 75,

  /** Toe boards, per linear foot per jump, one side. */
  toeBoardPerLinearFootPerJump: 2.85,
};

/**
 * Live rates. Backend layered over the constants above, never replacing them
 * wholesale - a settings record written before a rate existed would otherwise
 * hand back undefined, and undefined in arithmetic turns the whole alternate
 * into NaN without saying so.
 */
function rates(): AlternateRateDefaults {
  const fallback = ALTERNATE_RATES as AlternateRateDefaults;
  try {
    const stored = getBackendSettings().alternates;
    const merged = { ...fallback } as Record<string, unknown>;
    Object.entries(stored as unknown as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "number" && !Number.isFinite(value)) return;
      if (Array.isArray(value) && value.length === 0) return;
      merged[key] = value;
    });
    return merged as unknown as AlternateRateDefaults;
  } catch {
    return fallback;
  }
}

const HOURS_PER_DAY = 8;

/**
 * Stair tower crew, by building height, up to the 55' threshold.
 *
 * A stair tower is cuplock or ringlock, not frame, so scaffold jumps don't
 * describe it — the crew scales with how tall the building is. Bands are 5'
 * so the table can be corrected row by row without touching the formula.
 *
 * NEEDS CONFIRMATION: derived from "40-45' is 5 men" and "6 men for 50-59'",
 * which puts a man on every 10' of building. The 5' rows in between are an
 * interpolation, not something that was stated.
 */
type StairTowerBand = { throughFt: number; installHours: number; dismantleHours: number };

/**
 * Hours for a stair tower below the tall threshold. Crew scaling on a tower
 * steps rather than climbing smoothly, so the bands are stated outright
 * instead of derived from a rate.
 */
function stairTowerBand(buildingHeightFt: number, bands: StairTowerBand[]): StairTowerBand {
  const table = bands.length ? bands : (ALTERNATE_RATES.stairTowerHourBands as StairTowerBand[]);
  return table.find((row) => buildingHeightFt <= row.throughFt) ?? table[table.length - 1];
}

// -----------------------------------------------------------------------------
// Per-alternate settings
// -----------------------------------------------------------------------------

export type ShrinkWrapMode = "full" | "cap";
export type ToeBoardSide = "outside" | "inside" | "both";

export type AlternateSettings = {
  shrinkWrapMode: ShrinkWrapMode;
  hoistLandingQuantity: number;
  /** Stair tower carries up-and-over access across a parapet. */
  stairTowerParapet: boolean;
  /** Walkoff decks off the stair tower, one per floor level served. */
  stairTowerWalkoffs: number;
  toeBoardSide: ToeBoardSide;
};

export const DEFAULT_ALTERNATE_SETTINGS: AlternateSettings = {
  shrinkWrapMode: "full",
  hoistLandingQuantity: 1,
  stairTowerParapet: false,
  stairTowerWalkoffs: 0,
  toeBoardSide: "outside",
};

/** What the takeoff supplies to the pricing rules. */
export type AlternateInputs = {
  linearFeet: number;
  /** Building height. Stair tower labor counts off this, never off jumps. */
  wallHeight: number;
  /**
   * Floors in the building. Traced levels when they exist, otherwise derived.
   * Drives the tall stair tower rule: one crew-day per two levels.
   */
  buildingLevels: number;
  jumps: number;
  erectRate: number;
  travelRate: number;
};

/** One line of shown arithmetic, so the estimator can audit the figure. */
export type AlternateLine = {
  label: string;
  detail: string;
  amount: number;
};

export type AlternateResult = {
  id: AlternateId;
  title: string;
  /**
   * What prints on the proposal. Usually the standard line, but alternates
   * with options say what was actually taken - a stair tower with walkoffs
   * and a parapet crossing is not the same scope as a bare one.
   */
  description: string;
  /** One-line summary of the basis, e.g. "18,600 sf at $2.50". */
  basis: string;
  lines: AlternateLine[];
  value: number;
  /** Language that must print on the proposal when this alternate is taken. */
  proposalNote?: string;
};

function round(value: number) {
  return Math.round(value);
}

function formatFeet(value: number) {
  return `${Math.round(value).toLocaleString()}'`;
}

export const ALTERNATE_DESCRIPTIONS: Record<AlternateId, string> = {
  "shrink-wrap": "Shrink wrap enclosure applied to the scaffold perimeter.",
  netting: "Debris netting at scaffold exterior elevations.",
  canopy: "Pedestrian canopy protection at designated access zones.",
  "toe-boards": "Toe boards at working deck elevations where required.",
  "stair-tower": "Scaffold stair tower access at field-determined location.",
  "hoist-landing": "Hoist landing platform and required scaffold adjustments.",
};

// -----------------------------------------------------------------------------
// Rules
// -----------------------------------------------------------------------------

/**
 * Shrink wrap. Full wraps the whole covered face plus 14' of extra height;
 * cap wraps a fixed 16' band across the same run.
 */
function priceShrinkWrap(
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  const R = rates();
  const rate = R.shrinkWrapPerSqFt;
  const full = settings.shrinkWrapMode === "full";
  const height = full
    ? inputs.wallHeight + R.shrinkWrapFullAddedHeightFt
    : R.shrinkWrapCapHeightFt;
  const area = inputs.linearFeet * height;
  const value = area * rate;

  return {
    id: "shrink-wrap",
    title: "Shrink wrap",
    description: ALTERNATE_DESCRIPTIONS["shrink-wrap"],
    basis: `${round(area).toLocaleString()} sf at $${rate.toFixed(2)}`,
    lines: [
      {
        label: full ? "Full coverage" : "Cap only",
        detail: full
          ? `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} (scaffold height + ${R.shrinkWrapFullAddedHeightFt}')`
          : `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} band`,
        amount: value,
      },
    ],
    value: round(value),
  };
}

/** Debris netting. Full exterior only — no cap option. Height plus 3'. */
function priceNetting(inputs: AlternateInputs): AlternateResult {
  const R = rates();
  const rate = R.nettingPerSqFt;
  const height = inputs.wallHeight + R.nettingAddedHeightFt;
  const area = inputs.linearFeet * height;
  const value = area * rate;

  return {
    id: "netting",
    title: "Debris netting",
    description: ALTERNATE_DESCRIPTIONS["netting"],
    basis: `${round(area).toLocaleString()} sf at $${rate.toFixed(2)}`,
    lines: [
      {
        label: "Full exterior",
        detail: `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} (scaffold height + ${R.nettingAddedHeightFt}')`,
        amount: value,
      },
    ],
    value: round(value),
  };
}

/**
 * Pedestrian canopy. Priced per 90 linear feet of coverage, with the
 * remainder prorated rather than rounded up to a whole unit.
 */
function priceCanopy(inputs: AlternateInputs): AlternateResult {
  const R = rates();
  const perUnit = R.canopyLinearFeetPerUnit;
  const units = inputs.linearFeet / perUnit;

  const installHours = units * R.canopyInstallHoursPerUnit;
  const dismantleHours = units * R.canopyDismantleHoursPerUnit;
  const travelHours = units * R.canopyTravelHoursPerUnit;
  const material = units * R.canopyMaterialPerUnit;

  const installCost = installHours * inputs.erectRate;
  const dismantleCost = dismantleHours * inputs.erectRate;
  const travelCost = travelHours * inputs.travelRate;
  const value = installCost + dismantleCost + travelCost + material;

  return {
    id: "canopy",
    title: "Pedestrian canopy",
    description: ALTERNATE_DESCRIPTIONS["canopy"],
    basis: `${units.toFixed(2)} units of ${perUnit} LF`,
    lines: [
      { label: "Install", detail: `${round(installHours)} hrs x $${inputs.erectRate}`, amount: installCost },
      { label: "Dismantle", detail: `${round(dismantleHours)} hrs x $${inputs.erectRate}`, amount: dismantleCost },
      { label: "Travel", detail: `${round(travelHours)} hrs x $${inputs.travelRate}`, amount: travelCost },
      { label: "Material", detail: `$${R.canopyMaterialPerUnit} per ${perUnit} LF`, amount: material },
    ],
    value: round(value),
  };
}

/** Hoist landing. Fixed 10' x 10' x 4' tall. Quantity is the only variable. */
function priceHoistLanding(
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  const R = rates();
  const quantity = Math.max(1, Math.round(settings.hoistLandingQuantity));
  const installHours = R.hoistInstallHours * quantity;
  const dismantleHours = R.hoistDismantleHours * quantity;
  const installCost = installHours * inputs.erectRate;
  const dismantleCost = dismantleHours * inputs.erectRate;
  const rental = R.hoistRentalEach * quantity;
  const value = installCost + dismantleCost + rental;

  return {
    id: "hoist-landing",
    title: "Hoist landing",
    description: ALTERNATE_DESCRIPTIONS["hoist-landing"],
    basis: `${quantity} landing${quantity === 1 ? "" : "s"} at 10' x 10' x 4' tall`,
    lines: [
      { label: "Install", detail: `${installHours} hrs x $${inputs.erectRate}`, amount: installCost },
      { label: "Dismantle", detail: `${dismantleHours} hrs x $${inputs.erectRate}`, amount: dismantleCost },
      { label: "Rental", detail: `$${R.hoistRentalEach} each`, amount: rental },
    ],
    value: round(value),
  };
}

/**
 * Stair tower. Two labor rules, decided by tower height.
 *
 * Up to 60': one man per jump plus one, for a day. A five-jump building takes
 * six men, seven jumps takes eight.
 *
 * Above 60': the job becomes a mobilisation exercise — three men for a day per
 * 25 vertical feet. A 100' tower is four mobilisations up and one coming down,
 * and that has to be said on the proposal because it changes the schedule.
 *
 * Dismantle runs at 75% of install under either rule.
 */
function priceStairTower(
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  const R = rates();
  const buildingHeight = inputs.wallHeight;
  const tall = buildingHeight > R.stairTowerTallThresholdFt;

  // Rental rides on the scaffold alongside the tower, so jumps apply here.
  const jumps = Math.max(1, inputs.jumps);
  const rental = jumps * R.stairTowerRentPerJump;

  let installHours: number;
  let dismantleHours: number;
  let installDetail: string;
  let dismantleDetail: string;
  let mobilizations = 1;

  if (tall) {
    // A crew-day per two building levels, prorated rather than rounded up,
    // so a 9-level building isn't billed as 10. Dismantle stays a share of
    // install up here, because the work scales with the same measure.
    const levels = Math.max(1, inputs.buildingLevels);
    const perMob = R.stairTowerHoursPerMobilization;
    const levelsPerMob = R.stairTowerLevelsPerMobilization;

    installHours = (levels / levelsPerMob) * perMob;
    dismantleHours = installHours * (R.stairTowerDismantlePercent / 100);
    mobilizations = Math.ceil(levels / levelsPerMob);
    installDetail = `${levels} levels - ${perMob} hrs per ${levelsPerMob} levels`;
    dismantleDetail = `${round(dismantleHours)} hrs - ${R.stairTowerDismantlePercent}% of install`;
  } else {
    const band = stairTowerBand(buildingHeight, R.stairTowerHourBands as StairTowerBand[]);
    installHours = band.installHours;
    dismantleHours = band.dismantleHours;
    installDetail = `${installHours} hrs - ${formatFeet(buildingHeight)} building`;
    dismantleDetail = `${dismantleHours} hrs`;
  }

  let travelHours = R.stairTowerTravelHours;

  const lines: AlternateLine[] = [
    { label: "Install", detail: installDetail, amount: installHours * inputs.erectRate },
    { label: "Dismantle", detail: dismantleDetail, amount: dismantleHours * inputs.erectRate },
  ];

  // Getting up and over a parapet is its own piece of work, not a taller
  // tower - the tower still lands at the same deck, it just has to cross.
  if (settings.stairTowerParapet) {
    const up = R.stairTowerParapetInstallHours;
    const down = R.stairTowerParapetDismantleHours;
    lines.push({
      label: "Up and over parapet",
      detail: `${up} hrs up, ${down} hrs down`,
      amount: (up + down) * inputs.erectRate,
    });
    installHours += up;
    dismantleHours += down;
  }

  // Walkoffs are decks off the tower that let crews reach a floor level.
  // Each carries its own trip, so travel accrues per walkoff.
  const walkoffs = Math.max(0, Math.round(settings.stairTowerWalkoffs));
  if (walkoffs > 0) {
    const up = R.stairTowerWalkoffInstallHours * walkoffs;
    const down = R.stairTowerWalkoffDismantleHours * walkoffs;
    lines.push({
      label: `Walkoff${walkoffs === 1 ? "" : "s"} x ${walkoffs}`,
      detail: `${R.stairTowerWalkoffInstallHours} up, ${R.stairTowerWalkoffDismantleHours} down each`,
      amount: (up + down) * inputs.erectRate,
    });
    installHours += up;
    dismantleHours += down;
    travelHours += R.stairTowerWalkoffTravelHours * walkoffs;
  }

  const travelCost = travelHours * inputs.travelRate;
  lines.push({ label: "Travel", detail: `${travelHours} hrs x $${inputs.travelRate}`, amount: travelCost });
  lines.push({
    label: "Rental",
    detail: `${jumps} jumps x $${R.stairTowerRentPerJump}`,
    amount: rental,
  });

  const value = lines.reduce((sum, line) => sum + line.amount, 0);

  const extras: string[] = [];
  if (settings.stairTowerParapet) extras.push("up and over parapet");
  if (walkoffs > 0) extras.push(`${walkoffs} walkoff${walkoffs === 1 ? "" : "s"}`);

  // The printed scope has to name the options, or a proposal with three
  // walkoffs reads identically to one with none.
  const scopeParts = ["Scaffold stair tower access at field-determined location"];
  if (walkoffs > 0) {
    scopeParts.push(`includes ${walkoffs} walkoff${walkoffs === 1 ? "" : "s"} for floor level access`);
  }
  if (settings.stairTowerParapet) {
    scopeParts.push("figured access up and over parapet up to 4' tall");
  }

  return {
    id: "stair-tower",
    title: "Stair tower",
    description: `${scopeParts.join(", ")}.`,
    basis: [
      `${formatFeet(buildingHeight)} building`,
      tall ? `${inputs.buildingLevels} levels` : null,
      extras.length ? extras.join(", ") : null,
    ].filter(Boolean).join(" - "),
    lines,
    value: round(value),
    proposalNote: `Stair tower is figured install in ${mobilizations} mobilization${
      mobilizations === 1 ? "" : "s"
    }, dismantle in 1 mobilization.`,
  };
}

/** Toe boards. Every jump that carries scaffold, one side or both. */
function priceToeBoards(
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  const R = rates();
  const rate = R.toeBoardPerLinearFootPerJump;
  const jumps = Math.max(1, inputs.jumps);
  const oneSide = inputs.linearFeet * jumps * rate;
  const both = settings.toeBoardSide === "both";
  const value = both ? oneSide * 2 : oneSide;

  const sideLabel =
    settings.toeBoardSide === "both"
      ? "Inside and outside"
      : settings.toeBoardSide === "inside"
      ? "Inside only"
      : "Outside only";

  return {
    id: "toe-boards",
    title: "Toe boards",
    description: ALTERNATE_DESCRIPTIONS["toe-boards"],
    basis: `${formatFeet(inputs.linearFeet)} x ${jumps} jumps at $${rate.toFixed(2)}`,
    lines: [
      { label: sideLabel, detail: `${formatFeet(inputs.linearFeet)} x ${jumps} jumps`, amount: oneSide },
      ...(both ? [{ label: "Second side", detail: "Both sides doubles the run", amount: oneSide }] : []),
    ],
    value: round(value),
  };
}

// -----------------------------------------------------------------------------
// Public
// -----------------------------------------------------------------------------

export const ALTERNATE_ORDER: AlternateId[] = [
  "shrink-wrap",
  "netting",
  "canopy",
  "toe-boards",
  "stair-tower",
  "hoist-landing",
];


export function priceAlternate(
  id: AlternateId,
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  switch (id) {
    case "shrink-wrap":
      return priceShrinkWrap(inputs, settings);
    case "netting":
      return priceNetting(inputs);
    case "canopy":
      return priceCanopy(inputs);
    case "hoist-landing":
      return priceHoistLanding(inputs, settings);
    case "stair-tower":
      return priceStairTower(inputs, settings);
    case "toe-boards":
      return priceToeBoards(inputs, settings);
  }
}

export function priceAllAlternates(
  inputs: AlternateInputs,
  settings: AlternateSettings
): Record<AlternateId, AlternateResult> {
  return ALTERNATE_ORDER.reduce((all, id) => {
    all[id] = priceAlternate(id, inputs, settings);
    return all;
  }, {} as Record<AlternateId, AlternateResult>);
}
