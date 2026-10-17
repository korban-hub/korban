"use client";

/**
 * Quick Bid - no drawing, but still a real layout.
 *
 * The estimator answers a short set of questions and quantities build up live
 * on the right. Scope, then size, then site, then method, because each answer
 * narrows the next.
 *
 * The important change from the first version: length and height are entered
 * per elevation, never as one perimeter total. Six hundred feet of perimeter
 * describes an unbounded number of buildings, and Korban cannot draw any of
 * them. Four sides with their own lengths describes one, which is why even a
 * Quick Bid produces a layout you can carry into Set Scaffold.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateQuantityEngine, getActiveElevation, partsForConfiguration,
  planksPerBayForWidth, saveActiveElevation,
} from "@/lib/projectStore";
import { getBackendSettings, getFinishRule, getObstructionFactor } from "@/lib/backendStore";
import { KorbanGuidance } from "@/components/korban";

type Structure = "building" | "tank";
type FaceKey = "north" | "east" | "south" | "west";
type ElevKey = FaceKey | "special";

const FACES: FaceKey[] = ["north", "east", "south", "west"];

type TunnelCoverage = "lineal" | "elevation" | "full";

type Form = {
  placement: "exterior" | "interior";
  coverage: "full" | "partial";
  faces: Record<FaceKey, boolean>;
  /** Lineal feet per face. Entered side by side so a plan can be drawn. */
  lf: Record<ElevKey, string>;
  /** Height per face. A stepped building is the normal case, not the exception. */
  ht: Record<ElevKey, string>;
  /**
   * Every trade that will work off this scaffold.
   *
   * More than one is the normal case, not the exception - a mason goes up
   * first and a painter follows, off the same steel. It was a single string,
   * so picking the painter forgot the mason and the deck came back three
   * boards wide for a trade that needs six.
   */
  finishes: string[];

  // Tank
  measureBy: "radius" | "circumference";
  tankLengthFt: string;
  tankHeightFt: string;
  tankInnerFt: string;
  floor: "flat" | "sloped";
  access: "manhole" | "door";

  // Site
  obstructions: "none" | "moderate" | "heavy";

  // Pedestrian tunnel
  pedestrian: boolean;
  sidewalkFt: string;
  tunnelCoverage: TunnelCoverage;
  tunnelLf: string;
  tunnelFaces: Record<FaceKey, boolean>;

  // Method
  erection: "tied" | "freestanding";
  widthFt: number;
  bayFt: number;
  /** True once the estimator sets width by hand, which stops the finish rule. */
  widthOverridden: boolean;
  /**
   * Most buildings are symmetrical. Ticking these says south matches north
   * and west matches east, which is two numbers instead of four.
   */
  mirrorNorthSouth: boolean;
  mirrorEastWest: boolean;
};

const BLANK: Form = {
  placement: "exterior",
  coverage: "full",
  faces: { north: true, east: true, south: true, west: true },
  lf: { north: "", east: "", south: "", west: "", special: "" },
  ht: { north: "", east: "", south: "", west: "", special: "" },
  finishes: [],
  measureBy: "circumference",
  tankLengthFt: "",
  tankHeightFt: "",
  tankInnerFt: "",
  floor: "flat",
  access: "manhole",
  obstructions: "none",
  pedestrian: false,
  sidewalkFt: "",
  tunnelCoverage: "lineal",
  tunnelLf: "",
  tunnelFaces: { north: false, east: false, south: false, west: false },
  erection: "tied",
  widthFt: 3,
  bayFt: 10,
  widthOverridden: false,
  mirrorNorthSouth: false,
  mirrorEastWest: false,
};

/**
 * What a scaffold several trades share has to be built to.
 *
 * The scaffold is one structure. If a mason and a painter both work off it, it
 * gets built for the mason - five foot frames and a six board deck - because
 * the painter can work off that and the mason cannot work off the painter's.
 * So the governing rule is the most demanding of those selected, taken field
 * by field: the widest frame, the deepest deck, and the bracket that carries
 * the most boards among any that call for one.
 *
 * `finish` on the returned rule names whichever selection set the width, so
 * the screen can say which trade is driving it rather than leaving an
 * estimator to guess why a 3' job came back at 5'.
 *
 * Lives here because the Quick Bid is its only caller. It belongs in
 * backendStore beside getFinishRule the moment a second tier needs it.
 */
function governingFinishRule(finishes: string[], settings: ReturnType<typeof getBackendSettings>) {
  const rules = finishes
    .map((finish) => getFinishRule(finish, settings))
    .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
  if (!rules.length) return undefined;

  const widest = rules.reduce((best, rule) => (rule.scaffoldWidth > best.scaffoldWidth ? rule : best));
  const planksPerJump = Math.max(...rules.map((rule) => rule.planksPerJump));

  // The bracket that carries the most boards, among those that want one.
  const bracketed = rules.filter((rule) => rule.bracketPartNo);
  const capacity = (partNo: string) =>
    settings.material.stock.find((row) => row.partNo === partNo)?.plankCapacity ?? 0;
  const bracketPartNo = bracketed.length
    ? bracketed.reduce((best, rule) =>
        capacity(rule.bracketPartNo) > capacity(best.bracketPartNo) ? rule : best
      ).bracketPartNo
    : "";

  return {
    finish: widest.finish,
    scaffoldWidth: widest.scaffoldWidth,
    planksPerJump,
    bracketPartNo,
  };
}

// -- Small building blocks ----------------------------------------------------

function Group({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-orange-500">{step}</span>
        <h2 className="text-[14px] font-semibold text-white">{title}</h2>
        <span className="h-px flex-1 bg-white/8" />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[152px_1fr] items-start gap-4">
      <div className="pt-1">
        <p className="text-[11.5px] text-zinc-300">{label}</p>
        {hint && <p className="mt-0.5 text-[10px] leading-4 text-zinc-600">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, dim }: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
  dim?: boolean;
}) {
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-white/12 transition ${dim ? "opacity-40" : ""}`}>
      {options.map((o, i) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3.5 py-1.5 text-[11.5px] font-medium transition ${i > 0 ? "border-l border-white/12" : ""} ${
            value === o.v
              ? "bg-orange-500/15 text-orange-300"
              : "bg-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumField({ value, onChange, unit, placeholder, dim, width = "w-24" }: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
  dim?: boolean;
  width?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border border-white/12 bg-black px-2.5 py-1.5 transition ${width} ${dim ? "opacity-40" : ""}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        inputMode="decimal"
        className="w-full min-w-0 bg-transparent text-right font-mono text-[12px] font-bold text-orange-300 outline-none placeholder:text-zinc-700"
      />
      {unit && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{unit}</span>}
    </span>
  );
}

/**
 * A freestanding run has nothing to tie to, so it has to hold itself up.
 *
 * The rule: the base must be a third of the run's height, measured from the
 * front face of the front run to the back face of the rear one, and the rear
 * run stands a third of the height as a buttress.
 *
 * Up to ten feet of base you simply add runs alongside. Past that the two
 * runs stand apart and tubes tie them together every other deck - which is
 * why a tall freestanding tower costs so much more than its face suggests.
 *
 * The rear runs carry no planks. Nobody works off them; they exist to stop
 * the front run falling over.
 */
const FRAME_WIDTHS = [5, 3.5, 3];
const TUBE_SIZES: { ft: number; partNo: string }[] = [
  { ft: 4, partNo: "ST4SG" },
  { ft: 6, partNo: "ST6SG" },
  { ft: 8, partNo: "ST8SG" },
  { ft: 10, partNo: "ST10SG" },
  { ft: 13, partNo: "ST13SG" },
];

/** A tube has to reach past what it spans to be clamped. Two feet of it. */
const TUBE_CONNECTION_ALLOWANCE = 2;

function usableSpan(tubeFt: number) {
  return Math.max(0, tubeFt - TUBE_CONNECTION_ALLOWANCE);
}

function planFreestanding(
  heightFt: number,
  mainWidthFt: number,
  bayFt: number,
  linearFt: number,
  ownedTubes: Set<string>,
) {
  if (heightFt <= 0 || linearFt <= 0) return null;

  const requiredBase = heightFt / 3;
  const rearHeight = heightFt / 3;
  const rearJumps = Math.max(1, Math.ceil(rearHeight / 6.333));
  const bays = Math.max(1, Math.ceil(linearFt / bayFt));
  const legs = bays + 1;

  const empty = {
    requiredBase, rearHeight, rearJumps,
    mode: "none" as const,
    runs: 1, rearWidth: 0, gapFt: 0,
    tube: null as { ft: number; partNo: string } | null,
    tubes: 0, clamps: 0, rearLegs: 0, rearFrames: 0, rearBraces: 0,
  };

  if (mainWidthFt >= requiredBase) return empty;

  // Shoulder to shoulder while the base is narrow enough to be worth it.
  if (requiredBase <= 10) {
    const added: number[] = [];
    let width = mainWidthFt;
    while (width < requiredBase && added.length < 4) {
      const remaining = requiredBase - width;
      const pick = FRAME_WIDTHS.find((w) => w <= remaining) ?? FRAME_WIDTHS[FRAME_WIDTHS.length - 1];
      added.push(pick);
      width += pick;
    }
    const rearLegs = legs * added.length;
    return {
      ...empty,
      mode: "adjacent" as const,
      runs: 1 + added.length,
      rearWidth: added[0] ?? 0,
      addedWidths: added,
      rearLegs,
      rearFrames: rearLegs * rearJumps,
      rearBraces: bays * added.length * rearJumps * 2,
    };
  }

  /*
   * Past ten feet the runs stand apart. How many runs, and how wide, is a
   * real decision: wider frames close the base faster and need fewer ties,
   * but a company can only build with what is on the yard. So Korban tries
   * the widest frame first, adds runs until every gap is inside what a tube
   * can actually reach, and prefers tube sizes already owned.
   */
  const owned = TUBE_SIZES.filter((size) => ownedTubes.has(size.partNo));
  const catalog = owned.length ? owned : TUBE_SIZES;
  const maxSpan = usableSpan(catalog[catalog.length - 1].ft);

  let best: {
    runs: number; rearWidth: number; gapFt: number; tube: { ft: number; partNo: string };
  } | null = null;

  for (const rearWidth of FRAME_WIDTHS) {
    // Fewest runs whose gaps a tube can bridge: N*W + (N-1)*maxSpan >= base.
    for (let runs = 2; runs <= 5; runs++) {
      const frameWidth = mainWidthFt + (runs - 1) * rearWidth;
      if (frameWidth >= requiredBase) {
        // Frames alone close it - no gap, no tubes.
        best = { runs, rearWidth, gapFt: 0, tube: catalog[0] };
        break;
      }
      const gapFt = (requiredBase - frameWidth) / (runs - 1);
      if (gapFt > maxSpan) continue;
      const tube = catalog.find((size) => usableSpan(size.ft) >= gapFt);
      if (!tube) continue;
      best = { runs, rearWidth, gapFt, tube };
      break;
    }
    if (best) break;
  }

  if (!best) {
    // Nothing on the yard reaches. Say so rather than inventing a tube.
    return { ...empty, mode: "unreachable" as const, runs: 0 };
  }

  const rearRuns = best.runs - 1;
  const gaps = best.gapFt > 0 ? best.runs - 1 : 0;
  const tubeLevels = Math.max(1, Math.ceil(rearJumps / 2));
  const tubes = legs * gaps * tubeLevels;
  const rearLegs = legs * rearRuns;

  return {
    requiredBase,
    rearHeight,
    rearJumps,
    mode: "spaced" as const,
    runs: best.runs,
    rearWidth: best.rearWidth,
    gapFt: best.gapFt,
    tube: best.tube,
    tubes,
    // A tube is clamped at both ends. Always two.
    clamps: tubes * 2,
    rearLegs,
    rearFrames: rearLegs * rearJumps,
    rearBraces: bays * rearRuns * rearJumps * 2,
  };
}

// -- Page ---------------------------------------------------------------------

export default function QuickBidForm() {
  const router = useRouter();
  const [structure, setStructure] = useState<Structure>("building");
  const [form, setForm] = useState<Form>(BLANK);
  const [thinking, setThinking] = useState(false);
  const firstRun = useRef(true);

  function set<K extends keyof Form>(key: K, v: Form[K]) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setThinking(true);
    const timer = setTimeout(() => setThinking(false), 480);
    return () => clearTimeout(timer);
  }, [form, structure]);

  /**
   * Picking the work sets the scaffold, unless the estimator has already
   * overruled it. Masonry needs a five-foot frame and eight planks; a painter
   * does not, and neither should be typed in twice.
   */
  /*
   * Adds or removes a trade, then rebuilds the width from whoever is left.
   *
   * Taking the mason off a job that still has a painter on it has to drop the
   * scaffold back to what the painter needs - recomputing from the whole
   * selection rather than from the trade just clicked is what makes that work
   * in both directions.
   */
  function chooseFinish(finish: string) {
    setForm((f) => {
      const finishes = f.finishes.includes(finish)
        ? f.finishes.filter((name) => name !== finish)
        : [...f.finishes, finish];
      const rule = governingFinishRule(finishes, getBackendSettings());
      return {
        ...f,
        finishes,
        widthFt: rule && !f.widthOverridden ? rule.scaffoldWidth : f.widthFt,
      };
    });
  }

  function setWidth(widthFt: number) {
    // Touching width by hand takes the finish rule out of the loop, and says so.
    setForm((f) => ({ ...f, widthFt, widthOverridden: true }));
  }

  /** North drives south, east drives west, while the box is ticked. */
  function mirroredValue(face: FaceKey, field: "lf" | "ht") {
    if (face === "south" && form.mirrorNorthSouth) return form[field].north;
    if (face === "west" && form.mirrorEastWest) return form[field].east;
    return form[field][face];
  }

  function isMirrored(face: FaceKey) {
    return (face === "south" && form.mirrorNorthSouth) || (face === "west" && form.mirrorEastWest);
  }

  const derived = useMemo(() => {
    const backend = getBackendSettings();
    const rule = governingFinishRule(form.finishes, backend);

    // Planks follow the finish unless width was set by hand, in which case
    // the width rule takes over - that is what an override means.
    const planksPerJump =
      rule && !form.widthOverridden ? rule.planksPerJump : planksPerBayForWidth(form.widthFt);
    const bracketPartNo = rule && !form.widthOverridden ? rule.bracketPartNo : "";
    const bracketPlanks = bracketPartNo
      ? backend.material.stock.find((row) => row.partNo === bracketPartNo)?.plankCapacity ?? 0
      : 0;

    let lf = 0;
    let height = 0;
    const perFace: { face: string; lf: number; ht: number }[] = [];

    if (structure === "tank") {
      lf = parseFloat(form.tankLengthFt) || 0;
      if (form.measureBy === "radius") lf = 2 * Math.PI * lf;
      if (form.placement === "interior") {
        const inner = parseFloat(form.tankInnerFt) || 0;
        if (inner > 0) lf = form.measureBy === "radius" ? 2 * Math.PI * inner : inner;
      }
      height = parseFloat(form.tankHeightFt) || 0;
    } else {
      FACES.forEach((face) => {
        if (form.coverage === "partial" && !form.faces[face]) return;
        const mirror = (field: "lf" | "ht") => {
          if (face === "south" && form.mirrorNorthSouth) return form[field].north;
          if (face === "west" && form.mirrorEastWest) return form[field].east;
          return form[field][face];
        };
        const faceLf = parseFloat(mirror("lf")) || 0;
        const faceHt = parseFloat(mirror("ht")) || 0;
        if (faceLf <= 0) return;
        perFace.push({ face, lf: faceLf, ht: faceHt });
        lf += faceLf;
        height = Math.max(height, faceHt);
      });
      const specialLf = parseFloat(form.lf.special) || 0;
      if (specialLf > 0) {
        const specialHt = parseFloat(form.ht.special) || 0;
        perFace.push({ face: "special", lf: specialLf, ht: specialHt });
        lf += specialLf;
        height = Math.max(height, specialHt);
      }
    }

    // Each face is counted at its own height, then summed - a stepped
    // building priced at its tallest wall is a building priced wrong.
    const engines = perFace.length
      ? perFace.map((row) =>
          calculateQuantityEngine({
            linearFeet: row.lf,
            wallHeight: row.ht || height,
            standardBayLength: form.bayFt,
            scaffoldWidth: form.widthFt,
            frameHeight: 6.333,
            plankCountPerBay: planksPerJump,
            bracePattern: "Every Bay",
            wallOffset: 1,
            workerReachHeight: 6,
          })
        )
      : [
          calculateQuantityEngine({
            linearFeet: lf,
            wallHeight: height,
            standardBayLength: form.bayFt,
            scaffoldWidth: form.widthFt,
            frameHeight: 6.333,
            plankCountPerBay: planksPerJump,
            bracePattern: "Every Bay",
            wallOffset: 1,
            workerReachHeight: 6,
          }),
        ];

    /*
     * Each face beside the engine that counted it.
     *
     * engines[i] has always belonged to perFace[i] - the pairing was just
     * never kept, so the per-face legs, bays and jumps were summed away and
     * could not be written down. A gripped face carries its own, and a typed
     * one has to arrive the same way or it is a lesser kind of run.
     */
    const faceRuns = perFace.map((row, index) => ({ ...row, engine: engines[index] }));

    /*
     * The building, as a shape.
     *
     * Four sides with lengths is a rectangle - that is the whole reason this
     * form asks side by side rather than for a perimeter total. North and
     * south run across, east and west run down, so the two pairs are the two
     * extents, and the outline is the four corners between them.
     *
     * Four lengths only close into a rectangle when the opposite sides match.
     * When they do not, the numbers describe no single shape - an L, a
     * trapezoid and a dog-leg all fit them - so the longer of each pair is
     * drawn and the estimator is told what was assumed. A slightly generous
     * rectangle that says so beats a blank screen.
     *
     * A tank gets none of this. A shell is not four sides, and drawing it as
     * a box would be a lie about the building rather than an approximation of
     * one.
     */
    const sideFt = (face: FaceKey) => {
      if (face === "south" && form.mirrorNorthSouth) return parseFloat(form.lf.north) || 0;
      if (face === "west" && form.mirrorEastWest) return parseFloat(form.lf.east) || 0;
      return parseFloat(form.lf[face]) || 0;
    };
    const northFt = sideFt("north"), southFt = sideFt("south");
    const eastFt = sideFt("east"), westFt = sideFt("west");
    const planWidthFt = Math.max(northFt, southFt);
    const planDepthFt = Math.max(eastFt, westFt);
    const plan =
      structure === "building" && planWidthFt > 0 && planDepthFt > 0
        ? {
            widthFt: planWidthFt,
            depthFt: planDepthFt,
            perimeterFt: 2 * (planWidthFt + planDepthFt),
            /** Opposite sides disagree, so the rectangle is an assumption. */
            assumed:
              (northFt > 0 && southFt > 0 && northFt !== southFt) ||
              (eastFt > 0 && westFt > 0 && eastFt !== westFt),
          }
        : null;

    const sum = (pick: (e: (typeof engines)[number]) => number) =>
      engines.reduce((total, engine) => total + (pick(engine) || 0), 0);

    const material = getObstructionFactor(form.obstructions, backend).material;

    const q = {
      frameCount: Math.round(sum((e) => e.frameCount) * material),
      plankCount: Math.round(sum((e) => e.plankCount) * material),
      crossBraceCount: Math.round(sum((e) => e.crossBraceCount) * material),
      guardrailCount: Math.round(sum((e) => e.guardrailCount) * material),
      basePlateCount: Math.round(sum((e) => e.basePlateCount) * material),
      screwJackCount: Math.round(sum((e) => e.screwJackCount) * material),
      couplingPinCount: Math.round(sum((e) => e.couplingPinCount) * material),
      bayCount: sum((e) => e.bayCount),
      legCount: sum((e) => e.legCount),
      frameTall: Math.max(...engines.map((e) => e.frameTall || 0), 0),
      frameMakeup: engines[0]?.frameMakeup ?? [],
      screwJackExtensionIn: engines[0]?.screwJackExtensionIn ?? 0,
    };

    // Brackets: one per leg per jump, and the planks they carry.
    const brackets = bracketPartNo ? q.legCount * q.frameTall : 0;
    const bracketPlankCount = brackets * bracketPlanks;

    const labor = getObstructionFactor(form.obstructions, backend).labor;

    // Freestanding is not a checkbox - it is a second structure.
    const ownedTubes = new Set(
      backend.material.stock.filter((row) => row.owned > 0).map((row) => row.partNo)
    );
    const free =
      form.erection === "freestanding"
        ? planFreestanding(height, form.widthFt, form.bayFt, lf, ownedTubes)
        : null;

    const flags: { tone: "warn" | "note"; text: string }[] = [];
    if (free && free.mode !== "none") {
      const base = `${Math.floor(free.requiredBase)}'-${Math.round((free.requiredBase % 1) * 12)}"`;
      const widthLabel = (w: number) => (w === 3.5 ? `3'-6"` : `${w}'`);

      if (free.mode === "unreachable") {
        flags.push({
          tone: "warn",
          text: `Freestanding needs a ${base} base and nothing on the yard bridges the gaps that leaves. Either widen the frames, add a run, or this one gets tied to the structure.`,
        });
      } else if (free.mode === "adjacent") {
        flags.push({
          tone: "note",
          text: `Freestanding needs a ${base} base at this height. Running ${free.runs} lines shoulder to shoulder gets there, standing ${Math.round(free.rearHeight)}' as a buttress.`,
        });
      } else {
        flags.push({
          tone: "warn",
          text: `Freestanding needs a ${base} base. Korban has laid ${free.runs} runs - the face plus ${free.runs - 1} at ${widthLabel(free.rearWidth)} - standing ${Math.round(free.rearHeight)}' behind, with ${Math.round(free.gapFt * 12) / 12}' between each${free.tubes > 0 ? ` tied by ${free.tubes.toLocaleString()} ${free.tube?.partNo} and ${free.clamps.toLocaleString()} clamps` : " and no gap to tie"}.`,
        });
        flags.push({
          tone: "note",
          text: `Above ${Math.round(free.rearHeight)}' the face run carries on unbraced. That is the buttress doing its job, but a job this tall is worth an engineer's eye.`,
        });
      }
    }

    if (plan?.assumed) {
      flags.push({
        tone: "note",
        text: `Opposite sides do not match, so these lengths do not close into one shape. The plan is drawn ${plan.widthFt}' x ${plan.depthFt}' off the longer of each pair - the counts still use every side at its own length.`,
      });
    }
    if (structure === "building" && plan === null && perFace.length > 0) {
      flags.push({
        tone: "note",
        text: "A length is needed across and down - two opposite sides alone give no depth - before the layout can be drawn. The counts work without it.",
      });
    }
    if (structure === "building" && perFace.length > 0 && perFace.length < 4 && form.coverage === "full") {
      flags.push({
        tone: "warn",
        text: `Full exterior selected but only ${perFace.length} of 4 sides have a length. The layout will be wrong until the rest are in.`,
      });
    }
    const heights = perFace.filter((row) => row.ht > 0).map((row) => row.ht);
    if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 6) {
      flags.push({
        tone: "note",
        text: "Sides differ by more than a jump in height. Each is counted at its own height, so the total reflects the step.",
      });
    }
    if (form.pedestrian) {
      flags.push({
        tone: "note",
        text: "Pedestrian tunnel is priced as an add alternate, not in these counts.",
      });
    }
    if (form.obstructions !== "none") {
      const pct = form.obstructions === "heavy"
        ? backend.material.obstructions.heavyMaterialPercent
        : backend.material.obstructions.moderateMaterialPercent;
      const laborPct = form.obstructions === "heavy"
        ? backend.material.obstructions.heavyLaborPercent
        : backend.material.obstructions.moderateLaborPercent;
      flags.push({
        tone: "note",
        text: `${form.obstructions === "heavy" ? "Heavy" : "Moderate"} obstructions: material up ${pct}%, labor up ${laborPct}%. Already in these counts.`,
      });
    }
    const sidewalk = parseFloat(form.sidewalkFt) || 0;
    if (sidewalk > 0 && sidewalk < form.widthFt + 1) {
      flags.push({
        tone: "warn",
        text: `${sidewalk}' sidewalk will not take a ${form.widthFt}' tower plus offset. Expect a permit or a narrower frame.`,
      });
    }
    if (structure === "tank" && form.floor === "sloped") {
      flags.push({
        tone: "note",
        text: "Sloped floor means screw jack range varies leg to leg. Base heights need field adjustment.",
      });
    }
    if (lf > 0 && height > 0 && !form.finishes.length) {
      flags.push({
        tone: "note",
        text: "No work selected, so frame width and deck are on defaults rather than the trade.",
      });
    }

    return {
      free,
      lf: Math.round(lf * 10) / 10,
      height,
      perFace,
      faceRuns,
      plan,
      q,
      flags,
      planksPerJump,
      bracketPartNo,
      brackets,
      bracketPlankCount,
      labor,
      material,
      ruleApplies: Boolean(rule) && !form.widthOverridden,
      /** Which trade set the width, for the hint beside the control. */
      governingFinish: rule?.finish ?? "",
    };
  }, [form, structure]);

  const ready = derived.lf > 0 && derived.height > 0;

  /*
   * A Quick Bid is a bid, so it is written down.
   *
   * This form worked everything out and kept none of it - no store field, no
   * save of any kind - so the moment the page was left the coverage, the
   * heights and the configuration were gone, and nothing downstream ever saw
   * them. The Estimate priced Quick Bid jobs off an empty elevation.
   *
   * It writes to the same elevation record the other tiers use, so the Estimate
   * prices it identically. Held back a moment so a job is not saved on every
   * keystroke.
   */
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        const elevation = getActiveElevation();

        /*
         * The sides, written where the rest of Korban reads them.
         *
         * Everything downstream counts a Quick Bid through
         * computeElevationOnlyTotals, and that looks in exactly one place:
         * overlayGeometry.elevationHeights[].areas[]. This effect was writing
         * the totals and the engine but never the sides, so Set Scaffold, the
         * ledger and Plan Desk all recomputed from an empty set and reported
         * nothing gripped - four sides typed in, priced on this screen, and
         * gone by the next one.
         *
         * Written in the same shape the grip tool writes a gripped face, so
         * nothing downstream has to know which tier produced it. That is the
         * point: a Quick Bid is a measured job, just measured by typing.
         */
        const runs = derived.faceRuns.length
          ? derived.faceRuns.map((row) => ({
              face: row.face,
              lf: row.lf,
              ht: row.ht || derived.height,
              frameTall: row.engine.frameTall || 0,
              legs: row.engine.legCount || 0,
              bays: row.engine.bayCount || 0,
            }))
          /*
           * A tank has a shell, not four sides. It still has to arrive as a
           * run or it cannot be laid out, so the whole circumference goes in
           * as one.
           */
          : [{
              face: "north",
              lf: derived.lf,
              ht: derived.height,
              frameTall: derived.q.frameTall,
              legs: derived.q.legCount,
              bays: derived.q.bayCount,
            }];

        const elevationHeights = runs.map((run) => ({
          elevation: run.face.charAt(0).toUpperCase() + run.face.slice(1),
          overallHeightInput: run.ht ? `${run.ht}'` : "",
          belowGradeEnabled: false,
          belowGradeInput: "",
          multipleHeights: false,
          totalLF: run.lf,
          totalLegs: run.legs,
          avgFrameTall: run.frameTall,
          areas: [{
            areaIndex: 1,
            lf: run.lf,
            heightFt: run.ht,
            frameTall: run.frameTall,
            legs: run.legs,
            bayCount: run.bays,
            fromLevelId: null,
            toLevelId: null,
            baseElevationFt: null,
          }],
        }));

        /*
         * The outline, at whatever scale is in force.
         *
         * Set Scaffold reads the plan in page units and turns them into feet
         * through scale.pageUnitsPerFoot, so the rectangle has to be drawn in
         * the same units as anything already traced. If a plan sheet has been
         * scaled, that scale governs and the corners are multiplied into it.
         * If there is no sheet - the ordinary Quick Bid - there is nothing to
         * measure against, so the drawing is made one unit to the foot and
         * that scale is written alongside it.
         *
         * An existing scale is never overwritten. It belongs to the plan
         * sheet, is shared by all three tiers, and typing four lengths is no
         * reason to throw away a scale somebody locked against a real drawing.
         */
        const storedPuf = (elevation.scale as { pageUnitsPerFoot?: number } | null)
          ?.pageUnitsPerFoot;
        const hasRealScale = typeof storedPuf === "number" && storedPuf > 0;
        const puf = hasRealScale ? storedPuf : 1;

        const planRow = derived.plan
          ? [{
              id: 1,
              isKeyFloor: true,
              overlayType: "Level",
              level: "Main Level",
              points: [
                { x: 0, y: 0 },
                { x: derived.plan.widthFt * puf, y: 0 },
                { x: derived.plan.widthFt * puf, y: derived.plan.depthFt * puf },
                { x: 0, y: derived.plan.depthFt * puf },
              ],
              closed: true,
              linealFeet: derived.plan.perimeterFt,
              color: "#f97316",
              pageNumber: 1,
              refPoint: null,
              alignedPoints: [],
            }]
          : [];

        /*
         * Everything else in overlayGeometry is left exactly as it was - the
         * locked scale above all, which belongs to the plan sheet rather than
         * to any one tier and must survive a Quick Bid being typed over it.
         */
        const geometry = elevation.overlayGeometry ?? {
          elevationName: elevation.elevationName,
          levelName: "Main Level",
          tracedPerimeter: [],
          overlayPoints: [],
          wallSegments: [],
          referencePoints: [],
          elevationPoints: [],
          fullOverlayRows: [],
          elevationRefs: [],
          scale: null,
        };

        saveActiveElevation({
          ...elevation,
          linearFeet: derived.lf,
          wallHeight: derived.height,
          scaffoldInput: {
            ...elevation.scaffoldInput,
            scaffoldWidth: form.widthFt,
            standardBayLength: form.bayFt,
            plankCountPerBay: derived.planksPerJump,
          },
          quantityEngine: { ...elevation.quantityEngine, ...derived.q },
          /*
           * What the scaffold is for. Never stored before, so the proposal and
           * the load list could not say which trades the steel was built to
           * carry - and on a reopened job nobody could tell why the deck was
           * six boards wide.
           */
          finishes: form.finishes,
          /*
           * One unit to the foot, only when nothing better exists. Written on
           * the elevation because that is where Set Scaffold reads it from.
           */
          scale: hasRealScale
            ? elevation.scale
            : { pageUnitsPerFoot: 1, scaleLabel: "Typed dimensions" },
          overlayGeometry: {
            ...geometry,
            elevationHeights,
            /* Only replace the outline when there is one to put there, so a
               tank or a half-described building keeps whatever was traced. */
            fullOverlayRows: planRow.length ? planRow : geometry.fullOverlayRows,
          },
        });
      } catch { /* nothing to save into yet */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [ready, derived, form.widthFt, form.bayFt]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* -- Form ------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto" style={{ flexBasis: "68%" }}>
        <div className="max-w-[760px] px-6 py-5">
          <div className="mb-5 inline-flex overflow-hidden rounded-lg border border-white/12">
            {([
              { v: "building", label: "Building" },
              { v: "tank", label: "Tank" },
            ] as { v: Structure; label: string }[]).map((o, i) => (
              <button
                key={o.v}
                onClick={() => setStructure(o.v)}
                className={`px-5 py-2 text-[12px] font-semibold transition ${i > 0 ? "border-l border-white/12" : ""} ${
                  structure === o.v
                    ? "bg-white/[0.10] text-white"
                    : "bg-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <Group step="01" title="Scope">
              <Row label="Scaffold placement">
                <Segmented
                  value={form.placement}
                  onChange={(v) => set("placement", v)}
                  options={[{ v: "exterior", label: "Exterior" }, { v: "interior", label: "Interior" }]}
                />
              </Row>
              <Row label="Coverage" hint={structure === "tank" ? "Whole shell or a section" : "Whole building or selected sides"}>
                <div className="space-y-2">
                  <Segmented
                    value={form.coverage}
                    onChange={(v) => set("coverage", v)}
                    options={[
                      { v: "full", label: structure === "tank" ? "Full shell" : "Full exterior" },
                      { v: "partial", label: "Partial area" },
                    ]}
                  />
                  {structure === "building" && form.coverage === "partial" && (
                    <div className="flex flex-wrap gap-1.5">
                      {FACES.map((face) => (
                        <button
                          key={face}
                          onClick={() => set("faces", { ...form.faces, [face]: !form.faces[face] })}
                          className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition ${
                            form.faces[face]
                              ? "border-orange-500 bg-orange-500/15 text-orange-300"
                              : "border-white/10 text-zinc-600 hover:border-white/25 hover:text-zinc-400"
                          }`}
                        >
                          {face}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Row>
              <Row
                label="Work being done"
                hint="Pick every trade that will work off it. The most demanding one sets frame width and deck, unless you override below."
              >
                <div className="flex flex-wrap gap-1.5">
                  {getBackendSettings().material.finishRules.map((rule) => {
                    const picked = form.finishes.includes(rule.finish);
                    return (
                      <button
                        key={rule.finish}
                        onClick={() => chooseFinish(rule.finish)}
                        aria-pressed={picked}
                        title={`${rule.scaffoldWidth === 3.5 ? "3'-6\"" : `${rule.scaffoldWidth}'`} frame, ${rule.planksPerJump} planks per jump${rule.bracketPartNo ? ` plus ${rule.bracketPartNo}` : ""}`}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                          picked
                            ? "border-orange-500 bg-orange-500/15 text-orange-300"
                            : "border-white/10 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
                        }`}
                      >
                        {rule.finish}
                      </button>
                    );
                  })}
                </div>
                {/* Which trade is driving the steel, when more than one is on it. */}
                {form.finishes.length > 1 && derived.governingFinish && (
                  <p className="mt-1.5 text-[10px] leading-4 text-zinc-600">
                    {form.finishes.length} trades selected &mdash; built to{" "}
                    <span className="text-amber-200/80">{derived.governingFinish}</span>, the most
                    demanding of them.
                  </p>
                )}
              </Row>
            </Group>

            <Group step="02" title="Dimensions">
              {structure === "tank" ? (
                <>
                  <Row label="Measured by">
                    <Segmented
                      value={form.measureBy}
                      onChange={(v) => set("measureBy", v)}
                      options={[
                        { v: "circumference", label: "Circumference" },
                        { v: "radius", label: "Radius" },
                      ]}
                    />
                  </Row>
                  <Row label={form.measureBy === "radius" ? "Outside radius" : "Outside circumference"}>
                    <NumField value={form.tankLengthFt} onChange={(v) => set("tankLengthFt", v)} unit="ft" placeholder="0" />
                  </Row>
                  {form.placement === "interior" && (
                    <Row label={form.measureBy === "radius" ? "Inside radius" : "Inside circumference"}>
                      <NumField value={form.tankInnerFt} onChange={(v) => set("tankInnerFt", v)} unit="ft" placeholder="0" />
                    </Row>
                  )}
                  <Row label="Shell height">
                    <NumField value={form.tankHeightFt} onChange={(v) => set("tankHeightFt", v)} unit="ft" placeholder="0" />
                  </Row>
                  <Row label="Interior floor">
                    <Segmented
                      value={form.floor}
                      onChange={(v) => set("floor", v)}
                      options={[{ v: "flat", label: "Flat" }, { v: "sloped", label: "Sloped" }]}
                    />
                  </Row>
                </>
              ) : (
                <Row
                  label="Each side"
                  hint="Length and height per elevation. A perimeter total can't be drawn - four sides can."
                >
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[62px_96px_96px] gap-2 pl-0.5">
                      {["", "Length", "Height"].map((heading, index) => (
                        <span key={index} className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                          {heading}
                        </span>
                      ))}
                    </div>
                    {FACES.filter((face) => form.coverage === "full" || form.faces[face]).map((face) => {
                      const mirrored = isMirrored(face);
                      const mirrorable = face === "north" || face === "east";
                      const partner = face === "north" ? "South" : "West";
                      const key = face === "north" ? "mirrorNorthSouth" : "mirrorEastWest";
                      const on = face === "north" ? form.mirrorNorthSouth : form.mirrorEastWest;

                      return (
                        <div key={face}>
                          <div className="grid grid-cols-[62px_96px_96px] items-center gap-2">
                            <span className={`text-[11.5px] capitalize ${mirrored ? "text-zinc-600" : "text-zinc-400"}`}>
                              {face}
                            </span>
                            <NumField
                              value={mirroredValue(face, "lf")}
                              onChange={(v) => !mirrored && set("lf", { ...form.lf, [face]: v })}
                              unit="ft"
                              placeholder="0"
                              width="w-full"
                              dim={mirrored}
                            />
                            <NumField
                              value={mirroredValue(face, "ht")}
                              onChange={(v) => !mirrored && set("ht", { ...form.ht, [face]: v })}
                              unit="ft"
                              placeholder="0"
                              width="w-full"
                              dim={mirrored}
                            />
                          </div>

                          {mirrorable && (
                            <button
                              onClick={() => set(key as "mirrorNorthSouth" | "mirrorEastWest", !on)}
                              className="mt-0.5 flex items-center gap-1.5 pl-[70px] text-[10px] text-white transition hover:text-orange-300"
                            >
                              <span
                                className={`flex h-2.5 w-2.5 items-center justify-center rounded-[2px] border transition ${
                                  on ? "border-orange-400 bg-orange-500" : "border-zinc-600 bg-transparent"
                                }`}
                              >
                                {on && (
                                  <span className="font-mono text-[7px] font-bold leading-none text-black">
                                    &#10003;
                                  </span>
                                )}
                              </span>
                              same as {partner}
                            </button>
                          )}
                        </div>
                      );
                    })}

                  </div>
                </Row>
              )}
            </Group>

            <Group step="03" title="Site conditions">
              {structure === "tank" && (
                <Row label="Access" hint="How material gets in">
                  <Segmented
                    value={form.access}
                    onChange={(v) => set("access", v)}
                    options={[{ v: "manhole", label: "Manhole" }, { v: "door", label: "Door" }]}
                  />
                </Row>
              )}
              <Row label="Obstructions" hint="Trees, canopies, utilities, anything the crew works around">
                <Segmented
                  value={form.obstructions}
                  onChange={(v) => set("obstructions", v)}
                  options={[
                    { v: "none", label: "Clear" },
                    { v: "moderate", label: "Moderate" },
                    { v: "heavy", label: "Heavy" },
                  ]}
                />
              </Row>
            </Group>

            {structure === "building" && (
              <Group step="04" title="Pedestrian tunnel">
                <Row label="Foot traffic below" hint="People passing under the scaffold while it stands">
                  <Segmented
                    value={form.pedestrian ? "yes" : "no"}
                    onChange={(v) => set("pedestrian", v === "yes")}
                    options={[{ v: "no", label: "No" }, { v: "yes", label: "Yes" }]}
                  />
                </Row>

                {form.pedestrian && (
                  <Row label="Sidewalk width" hint="How much walkway has to stay open">
                    <NumField
                      value={form.sidewalkFt}
                      onChange={(v) => set("sidewalkFt", v)}
                      unit="ft"
                      placeholder="0"
                    />
                  </Row>
                )}

                {form.pedestrian && (
                  <Row label="Tunnel coverage" hint="Where the tunnel runs">
                    <div className="space-y-2">
                      <Segmented
                        value={form.tunnelCoverage}
                        onChange={(v) => set("tunnelCoverage", v)}
                        options={[
                          { v: "lineal", label: "Lineal feet" },
                          { v: "elevation", label: "By elevation" },
                          { v: "full", label: "Full exterior" },
                        ]}
                      />
                      {form.tunnelCoverage === "lineal" && (
                        <NumField value={form.tunnelLf} onChange={(v) => set("tunnelLf", v)} unit="ft" placeholder="0" />
                      )}
                      {form.tunnelCoverage === "elevation" && (
                        <div className="flex flex-wrap gap-1.5">
                          {FACES.map((face) => (
                            <button
                              key={face}
                              onClick={() => set("tunnelFaces", { ...form.tunnelFaces, [face]: !form.tunnelFaces[face] })}
                              className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition ${
                                form.tunnelFaces[face]
                                  ? "border-orange-500 bg-orange-500/15 text-orange-300"
                                  : "border-white/10 text-zinc-600 hover:border-white/25 hover:text-zinc-400"
                              }`}
                            >
                              {face}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] leading-4 text-zinc-600">
                        Any sidewalk width above zero adds the pedestrian tunnel to the proposal
                        as an alternate.
                      </p>
                    </div>
                  </Row>
                )}
              </Group>
            )}

            <Group step="05" title="Erection">
              <Row label="Attachment" hint="Tied to the structure or standing on its own">
                <Segmented
                  value={form.erection}
                  onChange={(v) => set("erection", v)}
                  options={[{ v: "tied", label: "Tie-in" }, { v: "freestanding", label: "Freestanding" }]}
                />
              </Row>
              <Row
                label="Frame width"
                hint={
                  derived.ruleApplies
                    ? `Set by ${derived.governingFinish}. Changing it here takes over.`
                    : form.widthOverridden
                    ? "Set by hand. The work selection no longer drives this."
                    : undefined
                }
              >
                <div className="space-y-1.5">
                  <Segmented
                    value={String(form.widthFt)}
                    onChange={(v) => setWidth(parseFloat(v))}
                    options={[
                      { v: "3", label: "3'" },
                      { v: "3.5", label: "3'-6\"" },
                      { v: "5", label: "5'" },
                    ]}
                  />
                  {form.widthOverridden && form.finishes.length > 0 && (
                    <button
                      onClick={() => {
                        const rule = governingFinishRule(form.finishes, getBackendSettings());
                        setForm((f) => ({
                          ...f,
                          widthOverridden: false,
                          widthFt: rule ? rule.scaffoldWidth : f.widthFt,
                        }));
                      }}
                      className="rounded border border-white/12 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300"
                    >
                      Back to what {derived.governingFinish || "the work"} calls for
                    </button>
                  )}
                </div>
              </Row>
              <Row label="Bay length">
                <Segmented
                  value={String(form.bayFt)}
                  onChange={(v) => set("bayFt", parseFloat(v))}
                  options={[{ v: "7", label: "7'" }, { v: "10", label: "10'" }]}
                />
              </Row>
            </Group>
          </div>
        </div>
      </div>

      {/* -- Output ----------------------------------------------------- */}
      <div className="relative flex flex-col border-l border-white/10 bg-black/30" style={{ flexBasis: "32%", minWidth: 320 }}>
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-orange-500 to-transparent transition-opacity duration-300 ${
            thinking ? "opacity-100" : "opacity-0"
          }`}
        />

        <header className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <h2 className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Project Details
          </h2>
          {thinking && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-orange-500">
              <span className="h-1 w-1 animate-pulse rounded-full bg-orange-500" />
              working
            </span>
          )}
        </header>

        <div className={`flex-1 overflow-y-auto transition-opacity duration-200 ${thinking ? "opacity-50" : "opacity-100"}`}>
          {!ready ? (
            <p className="px-4 py-4 text-[12px] leading-relaxed text-zinc-600">
              Give me a length and a height on at least one side and I&apos;ll start filling
              this in.
            </p>
          ) : (
            <>
              <div className="relative border-b border-orange-500/25 bg-orange-500/[0.06] px-4 py-4">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-orange-500 shadow-[0_0_12px_2px_rgba(249,115,22,0.55)]"
                />
                <div className="flex items-baseline gap-5">
                  <div>
                    <p className="font-mono text-[28px] font-bold leading-none text-orange-300">
                      {derived.q.frameCount.toLocaleString()}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-orange-500/80">
                      Frames
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[28px] font-bold leading-none text-orange-300">
                      {(derived.q.plankCount + derived.bracketPlankCount).toLocaleString()}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-orange-500/80">
                      Planks
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <p className="text-[11.5px] leading-[1.6] text-zinc-500">
                  {derived.lf.toLocaleString()} LF at up to {derived.height}&apos; ·{" "}
                  {derived.q.frameTall} jumps · {derived.q.bayCount} bays ·{" "}
                  {derived.planksPerJump + (derived.bracketPartNo ? derived.bracketPlankCount / Math.max(1, derived.brackets) : 0)} planks per jump
                </p>

                {/* Sides, so the estimator can see the shape they described. */}
                {derived.perFace.length > 0 && (
                  <div className="mt-3 rounded-lg border border-white/8 bg-black/40 p-2.5">
                    <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                      Sides
                    </p>
                    {derived.perFace.map((row) => (
                      <div key={row.face} className="flex items-baseline justify-between border-b border-white/5 py-0.5 last:border-0">
                        <span className="text-[11px] capitalize text-zinc-400">{row.face}</span>
                        <span className="font-mono text-[11px] text-zinc-300">
                          {row.lf.toLocaleString()}&apos;
                          <span className="mx-1 text-zinc-700">x</span>
                          {row.ht > 0 ? `${row.ht}'` : <span className="text-zinc-700">no height</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-1">
                  {[
                    ["Scaffold frame", derived.q.frameCount],
                    ["Wood plank", derived.q.plankCount + derived.bracketPlankCount],
                    ["Cross brace", derived.q.crossBraceCount],
                    ["Guard rail", derived.q.guardrailCount],
                    ["Coupling pin", derived.q.couplingPinCount],
                    ["Base plate", derived.q.basePlateCount],
                    ["Screw jack", derived.q.screwJackCount],
                    ...(derived.brackets > 0
                      ? ([[`Side bracket ${derived.bracketPartNo}`, derived.brackets]] as [string, number][])
                      : []),
                    ...(derived.free && derived.free.mode !== "none"
                      ? ([
                          [
                            `Freestanding frame ${derived.free.rearWidth === 3.5 ? `3'-6"` : `${derived.free.rearWidth}'`}`,
                            derived.free.rearFrames,
                          ],
                          ["Freestanding brace", derived.free.rearBraces],
                          ["Freestanding base plate", derived.free.rearLegs],
                          ["Freestanding screw jack", derived.free.rearLegs],
                          ...(derived.free.tubes > 0
                            ? ([
                                [`Tube ${derived.free.tube?.partNo}`, derived.free.tubes],
                                ["Right angle clamp CRA19", derived.free.clamps],
                              ] as [string, number][])
                            : []),
                        ] as [string, number][])
                      : []),
                  ].map(([label, qty]) => (
                    <div key={label as string} className="flex items-center justify-between border-b border-white/5 py-1">
                      <span className="text-[11.5px] text-zinc-400">{label}</span>
                      <span className="font-mono text-[12.5px] font-semibold text-zinc-100">
                        {Number(qty).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {derived.q.frameMakeup.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold text-white">Frame Configuration</p>
                    <p className="font-mono text-[10px] text-zinc-600">frames per leg</p>
                    {/* Part number beside every frame - a yard pulls FO6L3,
                        not "a six-four by three". */}
                    <div className="mt-1.5 space-y-0.5">
                      <div className="grid grid-cols-[58px_1fr_34px] gap-2 pb-0.5">
                        {["Part", "Frame", "Qty"].map((heading) => (
                          <span key={heading} className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                            {heading}
                          </span>
                        ))}
                      </div>
                      {derived.q.frameMakeup.map((piece) => {
                        const parts = partsForConfiguration(form.widthFt, form.bayFt);
                        const partNo = piece.label.startsWith("6")
                          ? parts.frame
                          : piece.label.startsWith("5")
                          ? parts.frame5
                          : parts.frame3;
                        return (
                          <div key={piece.label} className="grid grid-cols-[58px_1fr_34px] items-baseline gap-2">
                            <span className="font-mono text-[10px] font-bold text-orange-400">{partNo}</span>
                            <span className="truncate text-[11.5px] text-zinc-300">
                              {frameName(piece.label, form.widthFt)}
                            </span>
                            <span className="text-right font-mono text-[12px] font-bold text-orange-300">
                              {piece.qty}
                            </span>
                          </div>
                        );
                      })}
                      {(() => {
                        const parts = partsForConfiguration(form.widthFt, form.bayFt);
                        const perLeg: [string, string, number][] = [
                          ["AL1S", "Screw jack w/ base plate", 1],
                          ["BP1", "Fixed base plate", 1],
                          [
                            "CPS",
                            "Coupling pin",
                            Math.max(0, (derived.q.frameTall || 1) - 1) * 2,
                          ],
                        ];
                        return (
                          <div className="mt-1.5 border-t border-white/8 pt-1 space-y-0.5">
                            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                              Also per leg
                            </p>
                            {perLeg.filter(([, , qty]) => qty > 0).map(([partNo, label, qty]) => (
                              <div key={partNo} className="grid grid-cols-[58px_1fr_34px] items-baseline gap-2">
                                <span className="font-mono text-[10px] font-bold text-orange-400/70">{partNo}</span>
                                <span className="truncate text-[11.5px] text-zinc-500">{label}</span>
                                <span className="text-right font-mono text-[12px] text-zinc-400">{qty}</span>
                              </div>
                            ))}
                            {derived.bracketPartNo && (
                              <div className="grid grid-cols-[58px_1fr_34px] items-baseline gap-2">
                                <span className="font-mono text-[10px] font-bold text-orange-400/70">
                                  {derived.bracketPartNo}
                                </span>
                                <span className="truncate text-[11.5px] text-zinc-500">Side bracket</span>
                                <span className="text-right font-mono text-[12px] text-zinc-400">
                                  {derived.q.frameTall}
                                </span>
                              </div>
                            )}
                            <div className="grid grid-cols-[58px_1fr_34px] items-baseline gap-2">
                              <span className="font-mono text-[10px] font-bold text-orange-400/70">
                                {parts.brace}
                              </span>
                              <span className="truncate text-[11.5px] text-zinc-500">Cross brace, per bay</span>
                              <span className="text-right font-mono text-[12px] text-zinc-400">
                                {(derived.q.frameTall || 1) * 2}
                              </span>
                            </div>
                            {derived.q.screwJackExtensionIn > 0.05 && (
                              <div className="mt-1 flex items-baseline justify-between border-t border-white/8 pt-1">
                                <span className="text-[11.5px] text-zinc-500">Screw jack extension</span>
                                <span className="font-mono text-[12px] text-zinc-400">
                                  {derived.q.screwJackExtensionIn.toFixed(1)}&quot;
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <SectionDiagram
                      frameTall={derived.q.frameTall}
                      planksPerJump={derived.planksPerJump}
                      widthFt={form.widthFt}
                      bracket={derived.bracketPartNo}
                      bracketPlanks={derived.brackets > 0 ? derived.bracketPlankCount / derived.brackets : 0}
                      heightFt={derived.height}
                    />
                  </div>
                )}

                <button
                  onClick={() => router.push("/set-scaffold-v2")}
                  className="mt-4 w-full rounded-lg bg-orange-500 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-orange-400"
                >
                  Scaffold layout
                </button>
              </div>

              {derived.flags.length > 0 && (
                <KorbanGuidance flags={derived.flags} className="mx-4 mb-4" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Pieces -------------------------------------------------------------------

/** Turns a frame height label into the name the yard uses. */
function frameName(label: string, widthFt: number) {
  const width = widthFt === 3.5 ? '42"' : `${widthFt}'`;
  return `${label} x ${width} scaffold frame`;
}

/**
 * The section, drawn the way a scaffold engineer draws one.
 *
 * The earlier version was a diagram. This is a drawing: frames read as double
 * line tube profiles rather than single strokes, the building face is hatched,
 * dimensions carry extension lines and arrow terminators, and callouts hang
 * off angled leaders. An estimator who has spent twenty years reading shop
 * drawings should recognise it without being told what it is.
 *
 * It scales to the real jump count - an 85' run draws every one of its
 * thirteen jumps, compressed but present, because a drawing that disagrees
 * with the number printed above it is worse than no drawing.
 */
function SectionDiagram({
  frameTall, planksPerJump, widthFt, bracket, bracketPlanks, heightFt,
}: {
  frameTall: number;
  planksPerJump: number;
  widthFt: number;
  bracket: string;
  bracketPlanks: number;
  heightFt: number;
}) {
  const jumps = Math.max(1, frameTall);
  const jumpH = jumps > 16 ? 22 : jumps > 11 ? 28 : jumps > 7 ? 36 : 46;

  /*
   * Width is drawn off the same scale as height. A 6'-4" frame at 3' wide is
   * roughly two to one, and it has to look it - the earlier version sized
   * width independently and every frame came out square, which reads wrong
   * to anyone who has stood next to one.
   */
  const FRAME_FT = 6.333;
  const pxPerFt = jumpH / FRAME_FT;

  // Scaffold sits left of the wall, dimensions left of that, callouts right.
  const dimX = 30;
  const legX = 74;
  // No floor worth speaking of - a floor would break the ratio, and the
  // ratio is the whole point. A tall run simply draws smaller.
  const deckW = Math.max(9, Math.round(widthFt * pxPerFt));
  const legW = 3.4;                 // frame leg drawn as a tube, not a line
  const wallX = legX + deckW + 6;
  const wallW = 13;
  // A bracket carries its boards, so its reach follows the same scale.
  const bracketW = bracket ? Math.max(8, Math.round(bracketPlanks * 0.9 * pxPerFt)) : 0;

  const topY = 34;
  const baseY = topY + jumps * jumpH;
  const width = wallX + wallW + 128;
  const height = baseY + 60;

  const label = (y: number, text: string, sub?: string) => (
    <>
      <text x={wallX + wallW + 34} y={y} fontSize="6.4" fill="#a1a1aa" fontFamily="ui-monospace, monospace">
        {text}
      </text>
      {sub && (
        <text x={wallX + wallW + 34} y={y + 7.5} fontSize="6.4" fill="#71717a" fontFamily="ui-monospace, monospace">
          {sub}
        </text>
      )}
    </>
  );

  const leader = (fromX: number, fromY: number, toY: number) => (
    <path
      d={`M ${fromX} ${fromY} L ${wallX + wallW + 18} ${toY} L ${wallX + wallW + 30} ${toY}`}
      fill="none"
      stroke="#52525b"
      strokeWidth="0.5"
      markerStart="url(#qbDot)"
    />
  );

  const midJump = Math.floor(jumps / 2);
  const midY = baseY - midJump * jumpH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full">
      <defs>
        <marker id="qbArrow" markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto">
          <path d="M0,0.6 L4.6,2.5 L0,4.4 Z" fill="#71717a" />
        </marker>
        <marker id="qbArrowStart" markerWidth="5" markerHeight="5" refX="0.6" refY="2.5" orient="auto">
          <path d="M4.6,0.6 L0,2.5 L4.6,4.4 Z" fill="#71717a" />
        </marker>
        <marker id="qbDot" markerWidth="4" markerHeight="4" refX="2" refY="2">
          <circle cx="2" cy="2" r="1.1" fill="#52525b" />
        </marker>
        <pattern id="qbConcrete" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0,5 L5,0" stroke="#3f3f46" strokeWidth="0.45" />
        </pattern>
        <pattern id="qbGround" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,6 L6,0 M-1,1 L1,-1 M5,7 L7,5" stroke="#3f3f46" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* Face of existing structure */}
      <rect x={wallX} y={topY - 16} width={wallW} height={baseY - topY + 16} fill="url(#qbConcrete)" />
      <line x1={wallX} y1={topY - 16} x2={wallX} y2={baseY} stroke="#a1a1aa" strokeWidth="0.7" />
      <line x1={wallX + wallW} y1={topY - 16} x2={wallX + wallW} y2={baseY} stroke="#71717a" strokeWidth="0.5" />

      {/* Frames, jump by jump */}
      {Array.from({ length: jumps }, (_, index) => {
        const y = baseY - index * jumpH;
        const deckY = y - jumpH;
        const top = index === jumps - 1;

        return (
          <g key={index}>
            {/* Legs drawn as tube, two lines each */}
            <rect x={legX} y={deckY} width={legW} height={jumpH} fill="none" stroke="#d4d4d8" strokeWidth="0.6" />
            <rect x={legX + deckW - legW} y={deckY} width={legW} height={jumpH} fill="none" stroke="#d4d4d8" strokeWidth="0.6" />
            {/* Frame head */}
            <line x1={legX} y1={deckY} x2={legX + deckW} y2={deckY} stroke="#d4d4d8" strokeWidth="0.7" />

            {/*
             * Hockeys - the lugs a cross brace pins to. They run down from
             * the head and stop about 4'-6" short of the bottom of the frame,
             * which is why a brace crosses where it does.
             */}
            {(() => {
              const hockeyH = (4.5 / FRAME_FT) * jumpH;
              return (
                <>
                  <rect
                    x={legX + legW} y={deckY}
                    width={legW * 0.9} height={hockeyH}
                    fill="none" stroke="#a1a1aa" strokeWidth="0.45"
                  />
                  <rect
                    x={legX + deckW - legW * 1.9} y={deckY}
                    width={legW * 0.9} height={hockeyH}
                    fill="none" stroke="#a1a1aa" strokeWidth="0.45"
                  />
                </>
              );
            })()}

            {/* Planking */}
            {Array.from({ length: planksPerJump }, (_, plank) => {
              const gap = 0.8;
              const inner = deckW - legW * 2;
              const w = (inner - gap * (planksPerJump - 1)) / planksPerJump;
              return (
                <rect
                  key={plank}
                  x={legX + legW + plank * (w + gap)}
                  y={deckY - 3}
                  width={w}
                  height="3"
                  fill="#3f3f46"
                  stroke="#a1a1aa"
                  strokeWidth="0.4"
                />
              );
            })}

            {/* Side bracket - gusset with its own planking */}
            {bracket && (
              <>
                <path
                  d={`M ${legX + deckW} ${deckY} L ${legX + deckW + bracketW} ${deckY} L ${legX + deckW} ${deckY + (4.5 / FRAME_FT) * jumpH} Z`}
                  fill="none"
                  stroke="#F97316"
                  strokeWidth="0.6"
                />
                {Array.from({ length: Math.max(1, bracketPlanks) }, (_, plank) => {
                  const count = Math.max(1, bracketPlanks);
                  const gap = 0.8;
                  const w = (bracketW - gap * (count - 1)) / count;
                  return (
                    <rect
                      key={plank}
                      x={legX + deckW + plank * (w + gap)}
                      y={deckY - 3}
                      width={w}
                      height="3"
                      fill="#3f3f46"
                      stroke="#F97316"
                      strokeWidth="0.4"
                    />
                  );
                })}
              </>
            )}

            {/* Guardrail at the working deck */}
            {top && (
              <>
                <line x1={legX} y1={deckY - 18} x2={legX + deckW + bracketW} y2={deckY - 18} stroke="#fbbf24" strokeWidth="0.7" />
                <line x1={legX} y1={deckY - 10} x2={legX + deckW + bracketW} y2={deckY - 10} stroke="#fbbf24" strokeWidth="0.55" />
                <line x1={legX + legW / 2} y1={deckY - 3} x2={legX + legW / 2} y2={deckY - 18} stroke="#fbbf24" strokeWidth="0.7" />
                <line x1={legX + deckW + bracketW} y1={deckY - 3} x2={legX + deckW + bracketW} y2={deckY - 18} stroke="#fbbf24" strokeWidth="0.7" />
              </>
            )}
          </g>
        );
      })}

      {/*
       * Three separate pieces, drawn separately: the jack threads out of the
       * leg, the plate sits under it, the mudsill under that. Drawn as one
       * block they read as a slab, which is not what a crew sets.
       */}
      {[legX + legW / 2, legX + deckW - legW / 2].map((x) => (
        <g key={x}>
          {/* Screw jack thread */}
          <line x1={x} y1={baseY} x2={x} y2={baseY + 6} stroke="#d4d4d8" strokeWidth="1.1" />
          {[1.5, 3, 4.5].map((offset) => (
            <line
              key={offset}
              x1={x - 1.4} y1={baseY + offset} x2={x + 1.4} y2={baseY + offset}
              stroke="#71717a" strokeWidth="0.35"
            />
          ))}
          {/* Base plate */}
          <rect x={x - 4.5} y={baseY + 6} width="9" height="1.8" fill="none" stroke="#d4d4d8" strokeWidth="0.55" />
        </g>
      ))}

      {/* Timber mudsill, clear of the plates above it */}
      <rect
        x={legX - 7} y={baseY + 10}
        width={deckW + 14} height="3.2"
        fill="none" stroke="#d4d4d8" strokeWidth="0.55"
      />
      <line x1={legX - 7} y1={baseY + 11.6} x2={legX + deckW + 7} y2={baseY + 11.6} stroke="#52525b" strokeWidth="0.35" strokeDasharray="1.5,1.5" />

      {/* Grade, below everything */}
      <line x1={legX - 20} y1={baseY + 15} x2={wallX + wallW + 6} y2={baseY + 15} stroke="#a1a1aa" strokeWidth="0.8" />
      <rect x={legX - 20} y={baseY + 15} width={deckW + wallW + 32} height="6" fill="url(#qbGround)" />

      {/* Overall height, with extension lines and arrows */}
      <line x1={dimX - 5} y1={topY} x2={legX - 6} y2={topY} stroke="#3f3f46" strokeWidth="0.4" />
      <line x1={dimX - 5} y1={baseY} x2={legX - 6} y2={baseY} stroke="#3f3f46" strokeWidth="0.4" />
      <line
        x1={dimX} y1={topY} x2={dimX} y2={baseY}
        stroke="#71717a" strokeWidth="0.5"
        markerStart="url(#qbArrowStart)" markerEnd="url(#qbArrow)"
      />
      <text
        x={dimX - 5} y={(topY + baseY) / 2}
        textAnchor="middle" fontSize="6.6" fill="#e4e4e7" fontFamily="ui-monospace, monospace"
        transform={`rotate(-90 ${dimX - 5} ${(topY + baseY) / 2})`}
      >
        {heightFt > 0 ? `${Math.floor(heightFt)}'-${Math.round((heightFt % 1) * 12)}" MAX` : `${jumps} JUMPS`}
      </text>

      {/* Typical jump */}
      <line x1={legX - 22} y1={midY} x2={legX - 2} y2={midY} stroke="#3f3f46" strokeWidth="0.4" />
      <line x1={legX - 22} y1={midY - jumpH} x2={legX - 2} y2={midY - jumpH} stroke="#3f3f46" strokeWidth="0.4" />
      <line
        x1={legX - 17} y1={midY} x2={legX - 17} y2={midY - jumpH}
        stroke="#71717a" strokeWidth="0.5"
        markerStart="url(#qbArrowStart)" markerEnd="url(#qbArrow)"
      />
      <text
        x={legX - 22} y={midY - jumpH / 2}
        textAnchor="middle" fontSize="6" fill="#a1a1aa" fontFamily="ui-monospace, monospace"
        transform={`rotate(-90 ${legX - 22} ${midY - jumpH / 2})`}
      >
        6&apos;-4&quot; TYP
      </text>

      {/* Scaffold width */}
      <line x1={legX} y1={baseY + 27} x2={legX + deckW + bracketW} y2={baseY + 27} stroke="#71717a" strokeWidth="0.5" markerStart="url(#qbArrowStart)" markerEnd="url(#qbArrow)" />
      <line x1={legX} y1={baseY + 23} x2={legX} y2={baseY + 31} stroke="#3f3f46" strokeWidth="0.4" />
      <line x1={legX + deckW + bracketW} y1={baseY + 23} x2={legX + deckW + bracketW} y2={baseY + 31} stroke="#3f3f46" strokeWidth="0.4" />
      <text x={legX + (deckW + bracketW) / 2} y={baseY + 38} textAnchor="middle" fontSize="6.2" fill="#a1a1aa" fontFamily="ui-monospace, monospace">
        {widthFt === 3.5 ? `42" WIDE` : `${widthFt}'-0" WIDE`}
      </text>

      {/* Callouts */}
      {leader(wallX + wallW * 0.5, topY - 8, topY - 10)}
      {label(topY - 12, "FACE OF (E) BUILDING", "STRUCTURE (TYP)")}

      {leader(legX + deckW * 0.5, baseY - (jumps - 1) * jumpH - 3, topY + 30)}
      {label(
        topY + 28,
        `${widthFt === 3.5 ? '42"' : `${widthFt}'-0"`} WIDE x 6'-4" TALL`,
        "SCAFFOLD FRAME (TYP)"
      )}

      {leader(legX + deckW * 0.4, midY - 3, midY - 6)}
      {label(midY - 8, `${planksPerJump}-BOARD PLANKING`, "EVERY JUMP (TYP)")}

      {bracket && (() => {
        const y = baseY - Math.max(1, midJump - 2) * jumpH;
        return (
          <>
            {leader(legX + deckW + bracketW * 0.6, y - jumpH + 4, y - jumpH + 2)}
            {label(y - jumpH, `${bracketPlanks}-BOARD SCAFFOLD`, `SIDE BRACKET ${bracket} (TYP)`)}
          </>
        );
      })()}

      {leader(legX + deckW * 0.5, baseY + 11.6, baseY + 6)}
      {label(baseY + 4, "SCREW JACK, BASE PLATE,", "AND TIMBER MUDSILL (TYP)")}
    </svg>
  );
}
