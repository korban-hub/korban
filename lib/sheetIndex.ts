/**
 * Reading a drawing set's own index out of the PDF.
 *
 * An estimator opening a sixty-page set should not have to page through it
 * looking for the floor plans. The set already says what every sheet is - in
 * the title block, in text, because architectural PDFs come out of Revit and
 * CAD as vector rather than as pictures. pdf.js is already loaded to render
 * the sheets; `getTextContent()` on the same page object hands back that text
 * for nothing.
 *
 * So this reads the title block, not the drawing. Nothing here looks at
 * geometry and nothing here guesses from the shapes on the page: an elevation
 * does have a strong ground line and a plan is a field of closed rooms, but
 * reasoning from that is real computer vision, it would be wrong often, and -
 * worse - it would be wrong confidently. Text is either there or it is not.
 *
 * Two signals, and they corroborate each other:
 *
 *   the sheet number    A1 plans, A2 elevations, A3 sections, give or take
 *                       the office. A convention, not a rule.
 *   the sheet title     "EXTERIOR ELEVATIONS", "LEVEL 2 FLOOR PLAN",
 *                       "BUILDING SECTIONS". What the architect called it.
 *
 * Where both point the same way, that is a confident tag. Where only one
 * does, it is a suggestion. Where neither does, it says Unknown rather than
 * inventing something - which is the whole discipline here. A sheet tagged
 * wrong silently is the same class of fault as a tier holding another tier's
 * outline: a confident answer with nothing on screen saying where it came
 * from. Everything this module produces is a proposal for a human to glance
 * at, and it carries its reason so the glance is quick.
 */

/** What a sheet is, as far as a scaffold takeoff cares. */
export type SheetTag =
  | "Floor Plan"
  | "Roof Plan"
  | "Elevation View"
  | "Section View"
  | "Unknown";

export type SheetGuess = {
  pageNumber: number;
  tag: SheetTag;
  /** High when the number series and the title agree. */
  confidence: "high" | "low";
  /** "A2.02", as printed. Blank when none was found. */
  sheetNumber: string;
  /** "EXTERIOR ELEVATIONS", as printed. */
  title: string;
  /** '1/8" = 1\'-0"' from the title block, blank when absent. */
  scaleLabel: string;
  /**
   * Page units per foot implied by the printed scale, at full sheet size.
   *
   * A hint only. It holds only if the PDF is at the size it was drawn to,
   * which is usual but not guaranteed, so Korban proposes it and still wants
   * it checked against a known dimension before anything is counted off it.
   */
  pageUnitsPerFootHint: number | null;
  /** "South" when the title names a face - lines an elevation up with its wall. */
  face: string;
  /** Why it landed where it did, in a few words, for the index list. */
  reason: string;
};

/*
 * Sheets that are not takeoff material.
 *
 * Checked before anything else, because a sheet called "WALL SECTION DETAILS"
 * carries the word SECTION and is still a page of details nobody traces. The
 * reject wins.
 */
const REJECT = [
  "DETAIL",
  "SCHEDULE",
  "NOTES",
  "SPECIFICATION",
  "TITLE SHEET",
  "COVER SHEET",
  "LEGEND",
  "ABBREVIATION",
  "DRAWING INDEX",
  "SHEET INDEX",
  "ASSEMBL",
  "ACCESSIBILITY",
  "LIFE SAFETY",
  "EGRESS",
];

/*
 * Plans that are not the building's footprint.
 *
 * All of these are called a plan and none of them gives the perimeter a
 * scaffold goes round. A reflected ceiling plan is the ceiling, a site plan is
 * the lot, a foundation plan is below grade, and planting is the landscape
 * architect's.
 */
const NOT_FOOTPRINT = [
  "CEILING",
  "RCP",
  "SITE PLAN",
  "FOUNDATION",
  "PLANTING",
  "GRADING",
  "DEMOLITION",
  "DEMO PLAN",
  "KEY PLAN",
  "PARTITION",
  "FURNITURE",
  "EQUIPMENT PLAN",
];

/** North, south, east and west as a drawing set spells them in a title. */
const FACE_WORDS: { word: string; face: string }[] = [
  { word: "NORTHEAST", face: "North" },
  { word: "NORTHWEST", face: "North" },
  { word: "SOUTHEAST", face: "South" },
  { word: "SOUTHWEST", face: "South" },
  { word: "NORTH", face: "North" },
  { word: "SOUTH", face: "South" },
  { word: "EAST", face: "East" },
  { word: "WEST", face: "West" },
];

/**
 * The sheet number, as architects write it.
 *
 * A2.02, A-202, A202, AD2.1 all mean the same thing in different offices, so
 * the discipline letters, the series digit and the rest are taken apart
 * rather than matched as one fixed shape.
 */
const SHEET_NUMBER = /\b([A-Z]{1,2})[-\s.]?(\d)[.\-]?(\d{1,2})?\b/;

/**
 * An imperial drawing scale out of a title block.
 *
 * Covers 1/8" = 1'-0", 1/4"=1'0", 3/32" = 1'-0" and the sloppier spacings
 * that come out of a text layer, plus a plain 1" = 20' on a site sheet.
 */
const SCALE_FRACTION = /(\d{1,2})\s*\/\s*(\d{1,2})\s*["”]?\s*=\s*1\s*['’]/;
const SCALE_WHOLE = /(\d{1,3})\s*["”]\s*=\s*(\d{1,3})\s*['’]/;

function hasAny(text: string, words: string[]): string {
  for (const word of words) if (text.includes(word)) return word;
  return "";
}

/**
 * The scale the title block printed, as page units per foot.
 *
 * A PDF page is 72 units to the inch. At 1/8" = 1'-0", one foot of building is
 * an eighth of an inch on the sheet, which is nine page units - so the figure
 * is (72 x numerator) / denominator.
 */
function scaleToUnitsPerFoot(label: string): number | null {
  const frac = label.match(SCALE_FRACTION);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (num > 0 && den > 0) return (72 * num) / den;
  }
  const whole = label.match(SCALE_WHOLE);
  if (whole) {
    const inches = parseInt(whole[1], 10);
    const feet = parseInt(whole[2], 10);
    if (inches > 0 && feet > 0) return (72 * inches) / feet;
  }
  return null;
}

/**
 * What the sheet number alone suggests, by the usual A-series convention.
 *
 * Soft, and deliberately so. Most architects follow it because the standards
 * say to, and some do not - so this only ever corroborates a title. It never
 * decides a tag on its own, because a confident wrong answer from a numbering
 * quirk is worse than an Unknown an estimator fixes in one click.
 */
function tagFromSeries(sheetNumber: string): SheetTag {
  const m = sheetNumber.match(SHEET_NUMBER);
  if (!m) return "Unknown";
  // Architectural only. A structural or civil sheet numbered S2 is not an
  // elevation just because the digit matches.
  if (!m[1].startsWith("A")) return "Unknown";
  switch (m[2]) {
    case "1":
      return "Floor Plan";
    case "2":
      return "Elevation View";
    case "3":
      return "Section View";
    default:
      return "Unknown";
  }
}

/** What the words say, which outranks the numbering every time. */
function tagFromTitle(text: string): { tag: SheetTag; why: string } {
  const rejected = hasAny(text, REJECT);
  if (rejected) return { tag: "Unknown", why: `${rejected.toLowerCase()} sheet` };

  /*
   * Section before elevation before plan.
   *
   * A sheet is often titled "BUILDING SECTIONS AND ELEVATIONS", and what it
   * mostly carries is the first word. Sections are also the smallest and most
   * specific group, so when two words appear the narrower one is the better
   * guess.
   */
  if (text.includes("SECTION")) return { tag: "Section View", why: "titled section" };
  /*
   * A datum is not a drawing.
   *
   * "FINISH FLOOR ELEVATION 112'-6"" sits in the corner of plenty of floor
   * plans, and the first version of this threw the whole sheet out for
   * carrying the word - so a plan with a level note on it became Unknown and
   * an estimator had to go and find it himself.
   *
   * The datum readings are struck from the text and what is left is read as
   * normal. Only when nothing is left does the word stop counting, which lets
   * the sheet fall through and be recognised as the plan it is.
   */
  const withoutDatums = text.replace(/ELEVATION\s*[:=]?\s*[+-]?\d+['’][^A-Z]*/g, " ");
  if (withoutDatums.includes("ELEVATION")) {
    return { tag: "Elevation View", why: "titled elevation" };
  }
  if (text.includes("ROOF PLAN")) return { tag: "Roof Plan", why: "titled roof plan" };
  if (text.includes("PLAN")) {
    const wrong = hasAny(text, NOT_FOOTPRINT);
    if (wrong) {
      const said = wrong.toLowerCase();
      return { tag: "Unknown", why: said.endsWith("plan") ? said : `${said} plan` };
    }
    return { tag: "Floor Plan", why: "titled plan" };
  }
  return { tag: "Unknown", why: "no title match" };
}

/**
 * One page's text, read as a sheet.
 *
 * Takes the strings pdf.js found anywhere on the page rather than a title
 * block region, because where the block sits varies by office - right edge,
 * bottom strip, bottom right - and a region guessed wrong reads nothing at
 * all. Scanning the lot costs nothing and the keywords are distinctive.
 */
export function classifySheet(pageNumber: number, items: string[]): SheetGuess {
  const lines = items.map((s) => s.trim()).filter(Boolean);
  const text = lines.join(" ").toUpperCase();

  const numberMatch = text.match(SHEET_NUMBER);
  const sheetNumber = numberMatch ? numberMatch[0].trim() : "";

  const fromTitle = tagFromTitle(text);
  const fromSeries = tagFromSeries(sheetNumber);

  /*
   * The title decides; the series only agrees or stays quiet.
   *
   * A sheet the words reject stays rejected whatever its number says - that
   * is how "A2.51 EXTERIOR DETAILS" avoids being filed as an elevation.
   */
  let tag = fromTitle.tag;
  let confidence: "high" | "low" = "low";
  let reason = fromTitle.why;

  if (tag !== "Unknown") {
    // A roof plan is a plan: the A1 series agreeing is still agreement.
    const seriesAgrees =
      fromSeries === tag || (fromSeries === "Floor Plan" && tag === "Roof Plan");
    if (seriesAgrees) {
      confidence = "high";
      reason = `${fromTitle.why}, ${sheetNumber} series agrees`;
    }
  } else if (fromTitle.why === "no title match" && fromSeries !== "Unknown") {
    /* Nothing readable in the words, but the number is in a known series.
       Offered, never assumed - it is the weaker of the two signals alone. */
    tag = fromSeries;
    reason = `${sheetNumber} series only`;
  }

  // The printed scale, if the block carried one.
  const scaleMatch = text.match(SCALE_FRACTION) ?? text.match(SCALE_WHOLE);
  const scaleLabel = scaleMatch ? scaleMatch[0].replace(/\s+/g, " ").trim() : "";

  /* Which wall an elevation is of, so it can line itself up with the face. */
  const faceHit = tag === "Elevation View" ? FACE_WORDS.find((f) => text.includes(f.word)) : undefined;

  /*
   * The title as printed.
   *
   * The line carrying the keyword, kept short - title blocks also hold the
   * project name, the address and the architect's own boilerplate, and none
   * of that belongs in a one-line index.
   */
  const keyword = ["SECTION", "ELEVATION", "ROOF PLAN", "PLAN"].find((k) => text.includes(k)) ?? "";
  const titleLine =
    lines.find((line) => keyword && line.toUpperCase().includes(keyword) && line.length <= 60) ?? "";

  return {
    pageNumber,
    tag,
    confidence,
    sheetNumber,
    title: titleLine.toUpperCase(),
    scaleLabel,
    pageUnitsPerFootHint: scaleLabel ? scaleToUnitsPerFoot(scaleLabel) : null,
    face: faceHit?.face ?? "",
    reason,
  };
}

/**
 * The pages worth offering, in the order an estimator wants them.
 *
 * Plans first because that is where a takeoff starts, then elevations because
 * that is where the heights come from, then sections. Unknowns are dropped
 * from the offer entirely - they are still in the PDF and still one page-turn
 * away, and a list padded with sixty detail sheets is a list nobody reads.
 */
export function usefulSheets(guesses: SheetGuess[]): SheetGuess[] {
  const order: SheetTag[] = ["Floor Plan", "Roof Plan", "Elevation View", "Section View"];
  return guesses
    .filter((g) => g.tag !== "Unknown")
    .sort(
      (a, b) =>
        order.indexOf(a.tag) - order.indexOf(b.tag) || a.pageNumber - b.pageNumber,
    );
}

/** A roof plan is a plan for the purpose of picking one to trace. */
export function isPlanTag(tag: SheetTag): boolean {
  return tag === "Floor Plan" || tag === "Roof Plan";
}
