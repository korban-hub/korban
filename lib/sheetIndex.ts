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
  /**
   * Degrees this sheet needs turning to read upright, from its own text.
   *
   * Sets mix orientations - a landscape plan bound with portrait details, or
   * pages inserted from somewhere else - and a sheet that renders sideways
   * has to be turned before anything can be traced on it. The text says which
   * way is up: title block text runs horizontally on a sheet the right way
   * round, so if most of a page's text runs vertically the page is turned.
   *
   * 0 when it already reads upright, or when there was too little text to
   * say. Applied per page, and the Rotate button remains the arbiter.
   */
  rotation: number;
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
 * Other trades' sheets.
 *
 * A full set is mostly not architectural. Plumbing, mechanical, electrical,
 * fire protection, structural and civil all draw plans of the same building,
 * all titled "PLAN", and none of them gives the perimeter a scaffold goes
 * round - a mechanical plan is ductwork over a floor nobody is scaffolding
 * from.
 *
 * Caught two ways, because either can be missing: the discipline letter on
 * the sheet number, and the words in the title. A sheet numbered P2.01 is
 * plumbing whatever it is called, and one titled "LEVEL 2 MECHANICAL PLAN"
 * is mechanical whatever it is numbered.
 */
const OTHER_TRADES = [
  "PLUMBING",
  "MECHANICAL",
  "ELECTRICAL",
  "HVAC",
  "FIRE PROTECTION",
  "SPRINKLER",
  "POWER PLAN",
  "LIGHTING",
  "STRUCTURAL",
  "FRAMING PLAN",
  "CIVIL",
  "UTILITY",
  "LANDSCAPE",
  "IRRIGATION",
  "LOW VOLTAGE",
  "SECURITY PLAN",
  "SIGNAGE",
];

/*
 * Discipline prefixes that are not architectural.
 *
 * The letters before the series digit. A, AD, AS and the like are the
 * architect's; everything here belongs to another consultant.
 */
const OTHER_DISCIPLINES = ["P", "M", "E", "S", "C", "FP", "FA", "T", "L", "Q", "I", "G", "ME", "EP"];

/*
 * Plans that are not the building's footprint.
 *
 * All of these are called a plan and none of them gives the perimeter a
 * scaffold goes round. A reflected ceiling plan is the ceiling, a site plan is
 * the lot, a foundation plan is below grade, and planting is the landscape
 * architect's.
 */
/*
 * A site plan is a judgement call, so it is offered rather than decided.
 *
 * For most trades it is not the footprint and not worth opening. For scaffold
 * it often is the sheet you want - it carries the building in its lot, the
 * sidewalk, and the overhead protection. Dropping it silently lost a sheet
 * titled "SITE PLAN" on an overhead-protection exhibit, which is about as
 * wrong as this can get. It comes through as a plan at low confidence, so it
 * waits in the panel instead of filing itself.
 */
const SOFT_PLANS = ["SITE PLAN"];

const NOT_FOOTPRINT = [
  "CEILING",
  "RCP",
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

/*
 * Elevations a scaffold contractor has no interest in.
 *
 * Scaffold goes on the outside. An interior elevation is a wall of a lobby, a
 * restroom or a run of casework, drawn at a large scale to show tile and trim,
 * and there are usually more of them in a set than there are of the building
 * itself - so left in, they swamp the index with sheets nobody will grip and
 * bury the four that matter.
 *
 * Checked against the whole title, so "ENLARGED INTERIOR ELEVATIONS" and
 * "LOBBY ELEVATIONS" both go, while "EXTERIOR ELEVATIONS" and "NORTH
 * ELEVATION" stay.
 */
const INTERIOR_ELEVATION = [
  "INTERIOR",
  "CASEWORK",
  "MILLWORK",
  "CABINET",
  "RESTROOM",
  "TOILET",
  "BATHROOM",
  "KITCHEN",
  "LOBBY",
  "CORRIDOR",
  "STAIR ELEVATION",
  "ELEVATOR",
  "FINISH ELEVATION",
  "PARTITION",
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
 * The sheet number, as a whole string and nothing less.
 *
 * This used to be matched anywhere in the page's text, which meant "TYPE A2"
 * and "DETAIL 3/A5" became sheet numbers and handed the discipline filter a
 * prefix off a door tag. It has to BE the text item, start to finish:
 * A2.04, A20.04A, A-201, AD1.01.
 */
const SHEET_NUMBER_EXACT = /^([A-Z]{1,3})[-.]?(\d{1,3})(?:[.-](\d{1,3}))?([A-Z])?$/;

/**
 * An imperial drawing scale out of a title block.
 */
const SCALE_FRACTION = /(\d{1,2})\s*\/\s*(\d{1,2})\s*["”]?\s*=\s*1\s*['’](?:\s*-\s*0\s*["”])?/;
const SCALE_WHOLE = /(\d{1,3})\s*["”]\s*=\s*(\d{1,3})\s*['’](?:\s*-\s*0\s*["”])?/;

/**
 * Whole words, singular or plural.
 *
 * Sheets are titled in the plural far more often than the singular - BUILDING
 * SECTIONS, EXTERIOR ELEVATIONS, WALL SECTION DETAILS - and a matcher that
 * only knew SECTION read none of them. It failed quietly too: the sheet just
 * came back unnamed, or matched on the wrong word in the same title.
 *
 * Still whole words. The trailing S is optional and still has to be followed
 * by a boundary, so PLAN and PLANS both match and PLANNET, PLANTER and
 * PLANNING do not.
 */
function saysWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^A-Z])${word}S?($|[^A-Z])`).test(text);
}

function hasAnyWord(text: string, words: string[]): string {
  for (const word of words) if (saysWord(text, word)) return word;
  return "";
}

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

/** What the sheet number alone suggests, by the usual A-series convention. */
function tagFromSeries(prefix: string, series: string): SheetTag {
  if (!prefix.startsWith("A")) return "Unknown";
  switch (series.charAt(0)) {
    case "1": return "Floor Plan";
    case "2": return "Elevation View";
    case "3": return "Section View";
    default:  return "Unknown";
  }
}

/**
 * What one label says this sheet is.
 *
 * Given ONE short label - a sheet title, a drawing title - never a whole
 * page. That distinction is the whole fix. Matching against everything on the
 * sheet meant a keynote reading "align with interior face of stud" rejected a
 * set of exterior elevations, and a callout reading "DETAIL 3/A5" threw away
 * a sheet of them. A note is not a title and now never gets a vote.
 */
function tagFromLabel(label: string): { tag: SheetTag; why: string } {
  const text = label.toUpperCase();

  const rejected = hasAnyWord(text, REJECT);
  if (rejected) return { tag: "Unknown", why: `${rejected.toLowerCase()} sheet` };

  const otherTrade = hasAnyWord(text, OTHER_TRADES);
  if (otherTrade) return { tag: "Unknown", why: `${otherTrade.toLowerCase()} sheet` };

  if (saysWord(text, "SECTION")) return { tag: "Section View", why: "titled section" };

  if (saysWord(text, "ELEVATION")) {
    const inside = hasAnyWord(text, INTERIOR_ELEVATION);
    if (inside) return { tag: "Unknown", why: `${inside.toLowerCase()} elevation` };
    return { tag: "Elevation View", why: "titled elevation" };
  }

  if (saysWord(text, "ROOF") && saysWord(text, "PLAN")) {
    return { tag: "Roof Plan", why: "titled roof plan" };
  }

  if (saysWord(text, "PLAN")) {
    const soft = hasAnyWord(text, SOFT_PLANS);
    if (soft) return { tag: "Floor Plan", why: `${soft.toLowerCase()} - check it is the footprint` };
    const wrong = hasAnyWord(text, NOT_FOOTPRINT);
    if (wrong) {
      const said = wrong.toLowerCase();
      return { tag: "Unknown", why: said.endsWith("plan") ? said : `${said} plan` };
    }
    return { tag: "Floor Plan", why: "titled plan" };
  }

  return { tag: "Unknown", why: "" };
}

/** One piece of text, where it sits and how big it is. */
export type SheetTextItem = {
  str: string;
  /** pdf.js text matrix. [0],[1] give the angle; [4],[5] the position. */
  transform?: number[];
  /** Rendered height, when pdf.js supplies it. */
  height?: number;
};

type Placed = { text: string; size: number; x: number; y: number };

/** Font size from the text matrix, falling back to the reported height. */
function sizeOf(item: SheetTextItem): number {
  const t = item.transform;
  if (t && t.length >= 4) {
    const h = Math.hypot(t[2], t[3]);
    if (h > 0) return h;
  }
  return item.height ?? 0;
}

function place(items: SheetTextItem[]): Placed[] {
  return items
    .map((item) => {
      const t = item.transform;
      return {
        text: (item.str ?? "").trim(),
        size: sizeOf(item),
        x: t && t.length >= 6 ? t[4] : 0,
        y: t && t.length >= 6 ? t[5] : 0,
      };
    })
    .filter((row) => row.text !== "");
}

/**
 * The sheet number, and therefore where the title block is.
 *
 * Measured across four sets from four different architects: on every one the
 * sheet number was the single largest piece of text on the page. That is not
 * a coincidence of template - it has to be legible on a folded set - so it is
 * the one thing worth anchoring to.
 *
 * Required to be large as well as well-formed, because a bare "B5" in a
 * drawing matches the pattern too and is not the sheet number.
 */
function findSheetNumber(rows: Placed[]): (Placed & { prefix: string; series: string }) | null {
  if (rows.length === 0) return null;
  const biggest = Math.max(...rows.map((r) => r.size));

  const candidates = rows
    .filter((r) => biggest <= 0 || r.size >= biggest * 0.55)
    .map((r) => ({ row: r, m: r.text.toUpperCase().match(SHEET_NUMBER_EXACT) }))
    .filter((c): c is { row: Placed; m: RegExpMatchArray } => Boolean(c.m));
  if (candidates.length === 0) return null;

  /* Biggest wins; between equals the longer string does, which picks the real
     sheet number "A20.04A" over a stray "B5" set in the same size. */
  candidates.sort(
    (a, b) => b.row.size - a.row.size || b.row.text.length - a.row.text.length,
  );
  const best = candidates[0];
  return {
    ...best.row,
    prefix: best.m[1].toUpperCase(),
    series: best.m[2],
  };
}

/**
 * The labels sitting with the sheet number.
 *
 * On those same four sets the sheet title sat in the same column as the
 * number and a short way above it - 41, 123 and 158 units on sheets 2160 to
 * 2592 tall. Three templates, one relationship. So the title block is found
 * by where the number is rather than by a corner of the page, and nothing
 * outside that neighbourhood is ever read.
 *
 * The band is generous vertically and tight horizontally, which is what keeps
 * a revision history or a drawing legend out of it.
 */
function labelsNearNumber(rows: Placed[], num: Placed, width: number, height: number): Placed[] {
  const vertical = (height || 2400) * 0.16;
  const horizontal = (width || 3000) * 0.22;
  return rows
    .filter(
      (r) =>
        r !== num &&
        Math.abs(r.x - num.x) <= horizontal &&
        r.y - num.y > -vertical * 0.3 &&
        r.y - num.y <= vertical,
    )
    .sort((a, b) => Math.abs(a.y - num.y) - Math.abs(b.y - num.y));
}

/**
 * One page's text, read as a sheet.
 *
 * Four layers, each catching what the one before it missed, and an honest
 * answer at the end when none of them can. Only the first earns a confident
 * tag; the rest are offered for a human to place, because the one outcome
 * worth avoiding is a sheet filed wrong in silence.
 */
export function classifySheet(
  pageNumber: number,
  items: (string | SheetTextItem)[],
  page?: { width?: number; height?: number; rotation?: number },
): SheetGuess {
  const asItems: SheetTextItem[] = items.map((item) =>
    typeof item === "string" ? { str: item } : item,
  );
  const rows = place(asItems);
  const width = page?.width ?? 0;
  const height = page?.height ?? 0;

  /*
   * A page that declares its own rotation is already handled by the renderer,
   * so reading the text angle on top of that would turn a sheet that was
   * right. Every set measured so far declares one.
   */
  const rotation = page?.rotation ? 0 : dominantTextRotation(asItems);

  const blank: SheetGuess = {
    pageNumber, tag: "Unknown", confidence: "low", sheetNumber: "", title: "",
    scaleLabel: "", pageUnitsPerFootHint: null, face: "", reason: "", rotation,
  };

  // Nothing to read at all - a scan, or an image-only sheet.
  if (rows.length === 0) {
    return { ...blank, reason: "no text on this sheet - scan or image" };
  }

  /*
   * Text that is there but does not decode.
   *
   * CAD exports often embed subset fonts with no character map, and what
   * comes back is glyph codes rather than letters. One of the four sets
   * measured was like this throughout. Nothing can be read off it, and
   * saying so is the honest answer - guessing from a page of question marks
   * is how a sheet gets filed wrong in silence.
   */
  const sample = rows.map((r) => r.text).join("").slice(0, 600);
  const legible = (sample.match(/[A-Za-z0-9.,'"&/()-]/g) ?? []).length;
  if (sample.length > 0 && legible / sample.length < 0.5) {
    return { ...blank, reason: "this sheet's text could not be decoded" };
  }

  const num = findSheetNumber(rows);
  const sheetNumber = num?.text ?? "";

  /* Another consultant's sheet, by a number we can trust because it was
     matched whole and found at title-block size. */
  if (num && !num.prefix.startsWith("A") && OTHER_DISCIPLINES.includes(num.prefix)) {
    return { ...blank, sheetNumber, reason: `${num.prefix} discipline, not architectural` };
  }

  /*
   * Without positions there is no title block to find.
   *
   * Grouping by position collapses a whole page into one line when every item
   * sits at the origin, and reading that line is reading the whole sheet -
   * which is the fault this rewrite exists to remove. So when the caller has
   * no geometry to give, layer one is skipped rather than faked, and the
   * labels vote instead.
   */
  const hasGeometry = rows.some((r) => r.x !== 0 || r.y !== 0);
  const near = num && hasGeometry ? labelsNearNumber(rows, num, width, height) : [];
  const fromSeries = num ? tagFromSeries(num.prefix, num.series) : "Unknown";

  // -- Layer one: the title block --------------------------------------
  /*
   * Read lines, not words.
   *
   * A sheet title arrives broken across text items - "FLOOR PLAN -" then
   * "LEVEL 4A", or "FLOOR PLAN -" then "ROOF -". Taken one item at a time the
   * sense is lost: that last one is a roof plan, and only the assembled line
   * says so. So the neighbourhood is grouped back into lines first and each
   * line is read whole.
   *
   * The biggest classifying line wins, which steps over the small captions
   * every title block carries - "Sheet Title", "Drawn By:", "Checked By:".
   */
  const lines = toLines(near, num?.y ?? 0).map((line) => ({ ...line, verdict: tagFromLabel(line.text) }));
  const named = lines.filter((line) => line.verdict.tag !== "Unknown");
  named.sort((a, b) => b.size - a.size || a.distance - b.distance);

  if (named.length > 0) {
    const line = named[0];
    /* Anything flagged as a judgement call waits for a human, however clear
       the rest of the sheet is. */
    const soft = line.verdict.why.includes("check it is");
    const scale = findScale(near.concat(rows.filter((r) => r.size < (num?.size ?? 0))));
    return {
      ...blank,
      tag: line.verdict.tag,
      confidence: soft ? "low" : "high",
      sheetNumber,
      title: tidyTitle(line.text),
      scaleLabel: scale.label,
      pageUnitsPerFootHint: scale.unitsPerFoot,
      face: faceIn(line.verdict.tag, line.text),
      reason:
        fromSeries === line.verdict.tag ||
        (fromSeries === "Floor Plan" && line.verdict.tag === "Roof Plan")
          ? `${line.verdict.why}, ${sheetNumber} agrees`
          : line.verdict.why,
    };
  }

  /* A title block line naming something deliberately excluded - interior
     elevations, another trade - settles the sheet on its own. */
  const excluded = lines.filter((line) => line.verdict.why);
  if (excluded.length > 0) {
    excluded.sort((a, b) => b.size - a.size);
    return {
      ...blank,
      sheetNumber,
      title: excluded[0].text.toUpperCase(),
      reason: excluded[0].verdict.why,
    };
  }

  // -- Layer two: the drawing titles vote ------------------------------
  /*
   * Without sizes there is no ranking to do, so every short line is treated
   * as a label and allowed to vote. That is the case when a caller hands over
   * plain strings, and it is better than refusing to read the sheet.
   */
  const biggest = Math.max(...rows.map((r) => r.size));
  const labels = rows.filter(
    (r) =>
      (biggest <= 0 || r.size >= biggest * 0.3) &&
      r.text.length <= 44 &&
      r.text.split(/\s+/).length <= 6,
  );
  const votes: Record<string, number> = {};
  let why = "";
  for (const row of labels) {
    const verdict = tagFromLabel(row.text);
    if (verdict.tag === "Unknown") continue;
    votes[verdict.tag] = (votes[verdict.tag] ?? 0) + 1;
    why = verdict.why;
  }
  const winner = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
  /* One vote is enough when there was no geometry to rank by; otherwise a
     label needs company before it speaks for the sheet. */
  if (winner && votes[winner] >= (biggest > 0 ? 2 : 1)) {
    const scale = findScale(rows);
    return {
      ...blank,
      tag: winner as SheetTag,
      confidence: "low",
      sheetNumber,
      title: labels.find((r) => tagFromLabel(r.text).tag === winner)?.text.toUpperCase() ?? "",
      scaleLabel: scale.label,
      pageUnitsPerFootHint: scale.unitsPerFoot,
      face: "",
      reason: `${why} on the drawings`,
    };
  }

  /*
   * There is no layer reading the sheet number's series on its own.
   *
   * A1 plans, A2 elevations, A3 sections is a convention, not a rule, and
   * plenty of offices do not follow it - put the plans in the A2 series, as
   * one of these sets does, and every plan whose title could not be read came
   * back offered as an elevation. A wrong answer delivered confidently is
   * worse than no answer, and the estimator has no way to tell which he just
   * got.
   *
   * So the series only ever corroborates a title that was actually read. With
   * no title, Korban says it could not read the sheet and leaves it alone.
   */

  // -- Layer four: say so ----------------------------------------------
  return {
    ...blank,
    sheetNumber,
    reason: sheetNumber ? "nothing names this sheet" : "no title block found",
  };
}

/**
 * Text items grouped back into the lines they were drawn as.
 *
 * pdf.js hands back fragments, and a sheet title is routinely two or three of
 * them. Items sharing a baseline - within a fraction of their own height -
 * belong to one line, ordered left to right.
 */
function toLines(rows: Placed[], fromY = 0): { text: string; size: number; distance: number }[] {
  const sorted = [...rows].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Placed[][] = [];
  for (const row of sorted) {
    const line = lines.find(
      (group) => Math.abs(group[0].y - row.y) <= Math.max(group[0].size, row.size) * 0.6,
    );
    if (line) line.push(row);
    else lines.push([row]);
  }
  return lines.map((group) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    return {
      text: ordered.map((r) => r.text).join(" ").replace(/\s+/g, " ").trim(),
      size: Math.max(...group.map((r) => r.size)),
      distance: Math.min(...group.map((r) => Math.abs(r.y - fromY))),
    };
  });
}

/** The printed scale, from the smallest sensible pool of text. */
function findScale(rows: Placed[]): { label: string; unitsPerFoot: number | null } {
  for (const row of rows) {
    const m = row.text.match(SCALE_FRACTION) ?? row.text.match(SCALE_WHOLE);
    if (m) {
      const label = m[0].replace(/\s+/g, " ").trim();
      return { label, unitsPerFoot: scaleToUnitsPerFoot(label) };
    }
  }
  return { label: "", unitsPerFoot: null };
}

/**
 * The title as it should read on one line of an index.
 *
 * A drawing title shares its line with the scale and the detail bubble it
 * belongs to, which is right on the sheet and noise in a list.
 */
function tidyTitle(text: string): string {
  let out = text.replace(SCALE_FRACTION, " ").replace(SCALE_WHOLE, " ");
  /* Drawing titles end with the bubble number and the sheet it sits on -
     "1  A20.04A". Useful on paper, noise in a list. */
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\s+(?:[A-Z]{1,3}[-.]?\d{1,3}(?:[.-]\d{1,3})?[A-Z]?|\d{1,2})\s*$/i, "");
  }
  return out.replace(/[\s\-]+$/, "").replace(/\s+/g, " ").trim().slice(0, 60).toUpperCase();
}

/** Which wall an elevation is of, so it can line up with the face. */
function faceIn(tag: SheetTag, title: string): string {
  if (tag !== "Elevation View") return "";
  const text = title.toUpperCase();
  return FACE_WORDS.find((f) => text.includes(f.word))?.face ?? "";
}

/**
 * Which way up a sheet is, from the way its own text runs.
 *
 * Every text item carries the matrix it was drawn with, and for ordinary
 * horizontal text that matrix has no rotation in it. Weighted by how much
 * text sits at each angle, so a single rotated label - a dimension string up
 * the side of a wall, a note turned to fit - cannot outvote a whole title
 * block.
 *
 * The correction is the opposite of the angle found: text drawn a quarter
 * turn anticlockwise needs the page turned a quarter clockwise to read. If a
 * sheet still lands wrong, the Rotate button fixes that page and the page
 * remembers it - this only has to be right often enough to save the clicks.
 */
export function dominantTextRotation(rows: SheetTextItem[]): number {
  const weight: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
  let total = 0;

  for (const row of rows) {
    const t = row.transform;
    const len = (row.str ?? "").trim().length;
    if (!t || t.length < 4 || len === 0) continue;
    const [a, b] = t;
    if (a === 0 && b === 0) continue;
    const angle = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    const quarter = (Math.round(angle / 90) * 90) % 360;
    // Only square turns. Text at a genuine slant is a note, not the sheet.
    if (Math.abs(angle - quarter) > 12 && Math.abs(angle - quarter) < 348) continue;
    weight[quarter] = (weight[quarter] ?? 0) + len;
    total += len;
  }

  /* Too little text to be sure of anything. A scanned sheet lands here, and
     saying nothing is the right answer - a guess would turn a page nobody
     asked to turn. */
  if (total < 40) return 0;

  const found = Number(
    Object.keys(weight).reduce((best, key) =>
      (weight[Number(key)] ?? 0) > (weight[Number(best)] ?? 0) ? key : best,
    ),
  );
  // A clear majority, or leave it alone.
  if ((weight[found] ?? 0) / total < 0.6) return 0;
  return (360 - found) % 360;
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
