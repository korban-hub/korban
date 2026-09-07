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

/** Company standards. Destined for Backend > Material Pricing. */
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
} as const;

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
const STAIR_TOWER_CREW_BANDS: { throughFt: number; men: number }[] = [
  { throughFt: 25, men: 3 },
  { throughFt: 30, men: 4 },
  { throughFt: 35, men: 4 },
  { throughFt: 40, men: 5 },
  { throughFt: 45, men: 5 },
  { throughFt: 50, men: 6 },
  { throughFt: 55, men: 6 },
];

function stairTowerCrew(buildingHeightFt: number): number {
  const band = STAIR_TOWER_CREW_BANDS.find((row) => buildingHeightFt <= row.throughFt);
  return band ? band.men : STAIR_TOWER_CREW_BANDS[STAIR_TOWER_CREW_BANDS.length - 1].men;
}

// -----------------------------------------------------------------------------
// Per-alternate settings
// -----------------------------------------------------------------------------

export type ShrinkWrapMode = "full" | "cap";
export type ToeBoardSide = "outside" | "inside" | "both";

export type AlternateSettings = {
  shrinkWrapMode: ShrinkWrapMode;
  hoistLandingQuantity: number;
  toeBoardSide: ToeBoardSide;
};

export const DEFAULT_ALTERNATE_SETTINGS: AlternateSettings = {
  shrinkWrapMode: "full",
  hoistLandingQuantity: 1,
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
  const rate = ALTERNATE_RATES.shrinkWrapPerSqFt;
  const full = settings.shrinkWrapMode === "full";
  const height = full
    ? inputs.wallHeight + ALTERNATE_RATES.shrinkWrapFullAddedHeightFt
    : ALTERNATE_RATES.shrinkWrapCapHeightFt;
  const area = inputs.linearFeet * height;
  const value = area * rate;

  return {
    id: "shrink-wrap",
    title: "Shrink wrap",
    basis: `${round(area).toLocaleString()} sf at $${rate.toFixed(2)}`,
    lines: [
      {
        label: full ? "Full coverage" : "Cap only",
        detail: full
          ? `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} (scaffold height + ${ALTERNATE_RATES.shrinkWrapFullAddedHeightFt}')`
          : `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} band`,
        amount: value,
      },
    ],
    value: round(value),
  };
}

/** Debris netting. Full exterior only — no cap option. Height plus 3'. */
function priceNetting(inputs: AlternateInputs): AlternateResult {
  const rate = ALTERNATE_RATES.nettingPerSqFt;
  const height = inputs.wallHeight + ALTERNATE_RATES.nettingAddedHeightFt;
  const area = inputs.linearFeet * height;
  const value = area * rate;

  return {
    id: "netting",
    title: "Debris netting",
    basis: `${round(area).toLocaleString()} sf at $${rate.toFixed(2)}`,
    lines: [
      {
        label: "Full exterior",
        detail: `${formatFeet(inputs.linearFeet)} x ${formatFeet(height)} (scaffold height + ${ALTERNATE_RATES.nettingAddedHeightFt}')`,
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
  const perUnit = ALTERNATE_RATES.canopyLinearFeetPerUnit;
  const units = inputs.linearFeet / perUnit;

  const installHours = units * ALTERNATE_RATES.canopyInstallHoursPerUnit;
  const dismantleHours = units * ALTERNATE_RATES.canopyDismantleHoursPerUnit;
  const travelHours = units * ALTERNATE_RATES.canopyTravelHoursPerUnit;
  const material = units * ALTERNATE_RATES.canopyMaterialPerUnit;

  const installCost = installHours * inputs.erectRate;
  const dismantleCost = dismantleHours * inputs.erectRate;
  const travelCost = travelHours * inputs.travelRate;
  const value = installCost + dismantleCost + travelCost + material;

  return {
    id: "canopy",
    title: "Pedestrian canopy",
    basis: `${units.toFixed(2)} units of ${perUnit} LF`,
    lines: [
      { label: "Install", detail: `${round(installHours)} hrs x $${inputs.erectRate}`, amount: installCost },
      { label: "Dismantle", detail: `${round(dismantleHours)} hrs x $${inputs.erectRate}`, amount: dismantleCost },
      { label: "Travel", detail: `${round(travelHours)} hrs x $${inputs.travelRate}`, amount: travelCost },
      { label: "Material", detail: `$${ALTERNATE_RATES.canopyMaterialPerUnit} per ${perUnit} LF`, amount: material },
    ],
    value: round(value),
  };
}

/** Hoist landing. Fixed 10' x 10' x 4' tall. Quantity is the only variable. */
function priceHoistLanding(
  inputs: AlternateInputs,
  settings: AlternateSettings
): AlternateResult {
  const quantity = Math.max(1, Math.round(settings.hoistLandingQuantity));
  const installHours = ALTERNATE_RATES.hoistInstallHours * quantity;
  const dismantleHours = ALTERNATE_RATES.hoistDismantleHours * quantity;
  const installCost = installHours * inputs.erectRate;
  const dismantleCost = dismantleHours * inputs.erectRate;
  const rental = ALTERNATE_RATES.hoistRentalEach * quantity;
  const value = installCost + dismantleCost + rental;

  return {
    id: "hoist-landing",
    title: "Hoist landing",
    basis: `${quantity} landing${quantity === 1 ? "" : "s"} at 10' x 10' x 4' tall`,
    lines: [
      { label: "Install", detail: `${installHours} hrs x $${inputs.erectRate}`, amount: installCost },
      { label: "Dismantle", detail: `${dismantleHours} hrs x $${inputs.erectRate}`, amount: dismantleCost },
      { label: "Rental", detail: `$${ALTERNATE_RATES.hoistRentalEach} each`, amount: rental },
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
  _settings: AlternateSettings
): AlternateResult {
  const buildingHeight = inputs.wallHeight;
  const tall = buildingHeight > ALTERNATE_RATES.stairTowerTallThresholdFt;

  // Rental rides on the scaffold alongside the tower, so jumps still apply here.
  const jumps = Math.max(1, inputs.jumps);
  const rental = jumps * ALTERNATE_RATES.stairTowerRentPerJump;

  let installHours: number;
  let installDetail: string;
  let mobilizations = 1;

  if (tall) {
    // A crew-day per two building levels, prorated rather than rounded up,
    // so a 9-level building isn't billed as 10.
    const levels = Math.max(1, inputs.buildingLevels);
    const perMob = ALTERNATE_RATES.stairTowerHoursPerMobilization;
    const levelsPerMob = ALTERNATE_RATES.stairTowerLevelsPerMobilization;

    installHours = (levels / levelsPerMob) * perMob;
    mobilizations = Math.ceil(levels / levelsPerMob);
    installDetail = `${levels} levels - ${perMob} hrs per ${levelsPerMob} levels`;
  } else {
    const men = stairTowerCrew(buildingHeight);
    installHours = men * HOURS_PER_DAY;
    installDetail = `${men} men x ${HOURS_PER_DAY} hrs (${formatFeet(buildingHeight)} building)`;
  }

  const dismantleHours = installHours * (ALTERNATE_RATES.stairTowerDismantlePercent / 100);
  const installCost = installHours * inputs.erectRate;
  const dismantleCost = dismantleHours * inputs.erectRate;
  const value = installCost + dismantleCost + rental;

  return {
    id: "stair-tower",
    title: "Stair tower",
    basis: tall
      ? `${formatFeet(buildingHeight)} building - ${inputs.buildingLevels} levels`
      : `${formatFeet(buildingHeight)} building`,
    lines: [
      { label: "Install", detail: installDetail, amount: installCost },
      {
        label: "Dismantle",
        detail: `${round(dismantleHours)} hrs - ${ALTERNATE_RATES.stairTowerDismantlePercent}% of install`,
        amount: dismantleCost,
      },
      {
        label: "Rental",
        detail: `${jumps} jumps x $${ALTERNATE_RATES.stairTowerRentPerJump}`,
        amount: rental,
      },
    ],
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
  const rate = ALTERNATE_RATES.toeBoardPerLinearFootPerJump;
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

export const ALTERNATE_DESCRIPTIONS: Record<AlternateId, string> = {
  "shrink-wrap": "Shrink wrap enclosure applied to the scaffold perimeter.",
  netting: "Debris netting at scaffold exterior elevations.",
  canopy: "Pedestrian canopy protection at designated access zones.",
  "toe-boards": "Toe boards at working deck elevations where required.",
  "stair-tower": "Scaffold stair tower access at field-determined location.",
  "hoist-landing": "Hoist landing platform and required scaffold adjustments.",
};

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
