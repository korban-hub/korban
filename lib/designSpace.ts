/**
 * designSpace.ts
 *
 * Design Space: a place to sketch scaffold on a sheet without a job behind it.
 *
 * A draft is not a job. It has no customer, no proposal number, no bid date;
 * it does not show in the Bid Room and nothing reads it but this page. It
 * holds what was drawn on each sheet of one plan set - the scale, the runs
 * and what was done to their legs - and that is all.
 *
 * The scaffold itself is set out by the same engine Set Scaffold uses
 * (scaffoldSetOut.ts), and counted by the same frame rules, so a sketch here
 * and a layout there cannot disagree about what a wall takes.
 */

import {
  setOutRuns,
  type BayKind,
  type LegResult,
  type PlanPoint,
  type RunStroke,
  type SegmentLegs,
} from "@/lib/scaffoldSetOut";
import {
  STANDARD_BAY_LENGTHS,
  computeFrameMakeup,
  largestBayWithin,
  planksPerBayForWidth,
} from "@/lib/projectStore";

// ----------------------------------------------------------------------
// What a draft holds
// ----------------------------------------------------------------------

/** A run: one wall swiped end to end, or a chain clicked corner to corner. */
export type DesignRun = {
  id: string;
  /** "A", "B", ... in the order drawn. */
  label: string;
  /** Two points for a swiped run; more for one clicked round corners. Sheet pixels. */
  points: PlanPoint[];
  /** The wall's height. The top deck lands a worker's reach below it. 0 until typed. */
  heightFt: number;
  /** Bay length the run is set out at. */
  bayFt: number;
  /** Frame width: 3, 3.5 or 5. */
  widthFt: number;
  /**
   * Scaffold on the other side of the line from where Korban put it: an
   * outer run made an inner one, or the reverse. Korban takes "outer" to be
   * away from the middle of what is drawn; this says it guessed wrong.
   */
  flipped: boolean;
};

/** What Edit bays did to one leg. */
export type LegEdit = {
  removed?: boolean;
  /** Frames on this leg, when it differs from the run's. */
  frames?: number;
  /** Moved along its run, in sheet pixels. */
  dx?: number;
  dy?: number;
};

/** A block stamped on the sheet. */
export type PlacedBlock = {
  id: string;
  /** Which drawing, from designBlocks.ts. */
  blockId: string;
  /** Its centre, in sheet pixels. */
  x: number;
  y: number;
  /** Turned this many degrees, clockwise. */
  rot: number;
};

export type MarkKind = "line" | "box" | "cloud" | "dim" | "text";

/** A drafting mark: a line, a box, a cloud, a dimension or a note. */
export type DesignMark = {
  id: string;
  kind: MarkKind;
  /** Two corners, or the two ends. A note sits at `a`. */
  a: PlanPoint;
  b: PlanPoint;
  /** A note's words. */
  text: string;
};

export type DesignSheet = {
  /** Sheet pixels per foot, once the scale is locked. */
  puf: number | null;
  /** What was typed to lock it - "20'" - for the chip. */
  scaleLabel: string;
  /** Quarter turns given to this page, in degrees. */
  rotation: number;
  runs: DesignRun[];
  /** Keyed by legKey(). */
  legEdits: Record<string, LegEdit>;
  blocks: PlacedBlock[];
  marks: DesignMark[];
};

export type DesignDraft = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The plan set's file name, so the page can ask for the right one back. */
  fileName: string;
  /** The page that was open. */
  pageNumber: number;
  /** One per page of the set that has been worked on, keyed by page number. */
  sheets: Record<string, DesignSheet>;
};

export const FRAME_WIDTHS: { ft: number; label: string }[] = [
  { ft: 3, label: "3'" },
  { ft: 3.5, label: "42\"" },
  { ft: 5, label: "5'" },
];
export const BAY_LENGTHS: number[] = [...STANDARD_BAY_LENGTHS].sort((a, b) => b - a);

export function emptySheet(): DesignSheet {
  return { puf: null, scaleLabel: "", rotation: 0, runs: [], legEdits: {}, blocks: [], marks: [] };
}

export function newDraft(name?: string): DesignDraft {
  const now = new Date();
  const stamp = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    id: `draft-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name ?? `Draft · ${stamp}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    fileName: "",
    pageNumber: 1,
    sheets: {},
  };
}

/** The next run letter on a sheet: A, B, ... Z, AA, AB. */
export function nextRunLabel(runs: DesignRun[]): string {
  const used = new Set(runs.map((r) => r.label));
  for (let n = 0; n < 702; n++) {
    const label = n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26));
    if (!used.has(label)) return label;
  }
  return String(runs.length + 1);
}

// ----------------------------------------------------------------------
// Setting a sheet out
// ----------------------------------------------------------------------

/** One stretch of scaffold along one wall of one run, ready to draw. */
export type LaidWall = {
  /** Stable across re-layouts as long as the run's points are. */
  key: string;
  runId: string;
  legs: LegResult[];
  /** bays[i] sits between legs[i] and legs[i + 1]. */
  bays: BayKind[];
  /** A bay into the first leg from the corner leg before it, and how long. */
  lead?: { kind: BayKind; lengthFt: number };
  /** How the wall ends when it does not end on its last leg. */
  tail?: SegmentLegs["tail"];
  /** Along the wall, and square to it on the scaffold side. Unit vectors. */
  along: PlanPoint;
  normal: PlanPoint;
};

export type LaidRun = {
  run: DesignRun;
  walls: LaidWall[];
  lengthFt: number;
  /** Frames on a leg at this run's height. 0 until a height is typed. */
  framesPerLeg: number;
  legs: number;
  bays: number;
  frames: number;
  planks: number;
};

export type SheetCount = { linealFeet: number; bays: number; legs: number; frames: number; planks: number };

export function legKey(wallKey: string, legIndex: number): string {
  return `${wallKey}#${legIndex}`;
}

function runLength(points: PlanPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return total;
}

/** Frames on a leg for a wall of this height: the top deck a worker's reach below the top. */
export function framesForHeight(heightFt: number, reachFt: number, jackMaxIn: number): number {
  if (!(heightFt > 0)) return 0;
  return Math.max(1, computeFrameMakeup(Math.max(0, heightFt - reachFt), jackMaxIn).frameTall);
}

/**
 * A stroke that meets no other: legs from one end to the other at the bay
 * length, the last bay whatever standard length fits what is left. The same
 * rule Set Scaffold applies to a run drawn on its own.
 */
function layAlone(stroke: RunStroke, all: RunStroke[], puf: number, bayFt: number, widthFt: number, standoffFt: number): LaidWall | null {
  const dx = stroke.b.x - stroke.a.x, dy = stroke.b.y - stroke.a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return null;
  const along = { x: dx / len, y: dy / len };
  const right = { x: -along.y, y: along.x };

  // Outside is away from the middle of everything drawn, when there is enough drawn to have a middle.
  const ends = all.flatMap((r) => [r.a, r.b]);
  const hub = ends.length >= 4
    ? { x: ends.reduce((t, p) => t + p.x, 0) / ends.length, y: ends.reduce((t, p) => t + p.y, 0) / ends.length }
    : null;
  const mid = { x: (stroke.a.x + stroke.b.x) / 2, y: (stroke.a.y + stroke.b.y) / 2 };
  const outward = hub ? ((mid.x - hub.x) * right.x + (mid.y - hub.y) * right.y >= 0 ? 1 : -1) : 1;
  const side = (stroke.sitsInterior ? -1 : 1) * outward;
  const normal = { x: right.x * side, y: right.y * side };

  const positions: number[] = [];
  let cursor = 0, guard = 0;
  while (cursor <= len + 0.01 && guard++ < 400) {
    positions.push(cursor);
    const remainingFt = (len - cursor) / puf;
    if (remainingFt <= 8 + 0.05) break;
    const bay = largestBayWithin(Math.min(remainingFt, bayFt));
    cursor += (bay ?? bayFt) * puf;
  }
  if (positions.length === 0 || len - positions[positions.length - 1] > 0.01) positions.push(len);

  const gap = standoffFt * puf, tick = widthFt * puf;
  const legs: LegResult[] = positions.map((d, i) => {
    const base = { x: stroke.a.x + along.x * d, y: stroke.a.y + along.y * d };
    return {
      wallPoint: { x: base.x + normal.x * gap, y: base.y + normal.y * gap },
      tickTip: { x: base.x + normal.x * (gap + tick), y: base.y + normal.y * (gap + tick) },
      labelPoint: { x: base.x + normal.x * (gap + tick + puf * 1.4), y: base.y + normal.y * (gap + tick + puf * 1.4) },
      isTurnaroundMirror: false,
      isStartLeg: i === 0,
      isEndLeg: i === positions.length - 1,
    };
  });
  const bays: BayKind[] = positions.slice(0, -1).map((d, i) => {
    const ft = (positions[i + 1] - d) / puf;
    return STANDARD_BAY_LENGTHS.some((s) => Math.abs(s - ft) < 0.1) ? "braced" : "bastard";
  });
  return { key: stroke.id, runId: stroke.id.split("~")[0], legs, bays, along, normal };
}

/**
 * Sets out every run on a sheet. Runs that share a bay length and a frame
 * width are handed to the engine together, so strokes that meet turn the
 * corner the way a traced building does; a run at its own settings stands on
 * its own.
 */
export function laySheet(sheet: DesignSheet, opts: { reachFt: number; jackMaxIn: number; standoffFt: number }): LaidRun[] {
  const puf = sheet.puf ?? 0;
  if (!(puf > 0)) return sheet.runs.map((run) => ({ run, walls: [], lengthFt: 0, framesPerLeg: 0, legs: 0, bays: 0, frames: 0, planks: 0 }));

  // Every wall of every run as a stroke the engine can chain: "runId~wallIndex".
  const strokesOf = (run: DesignRun): RunStroke[] =>
    run.points.slice(0, -1).map((a, i) => ({ id: `${run.id}~${i}`, a, b: run.points[i + 1], sitsInterior: run.flipped }));

  const groups = new Map<string, DesignRun[]>();
  for (const run of sheet.runs) {
    const k = `${run.bayFt}|${run.widthFt}`;
    groups.set(k, [...(groups.get(k) ?? []), run]);
  }

  const wallsByRun = new Map<string, LaidWall[]>();
  const push = (wall: LaidWall) => wallsByRun.set(wall.runId, [...(wallsByRun.get(wall.runId) ?? []), wall]);

  for (const runs of groups.values()) {
    const { bayFt, widthFt } = runs[0];
    const strokes = runs.flatMap(strokesOf).filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.5);
    if (strokes.length === 0) continue;
    let laid: ReturnType<typeof setOutRuns> = { segments: [], singles: strokes };
    try {
      laid = setOutRuns(strokes, {
        puf, frameWidthFt: widthFt, bayFt, standoffFt: opts.standoffFt, standardBays: [...STANDARD_BAY_LENGTHS],
      }, 8 * puf);
    } catch {
      // The engine could not make sense of the chain: every stroke stands alone rather than none being drawn.
    }
    const seen = new Map<string, number>();
    for (const seg of laid.segments) {
      if (seg.skipped || !seg.runId || seg.legs.length === 0) continue;
      const n = seen.get(seg.runId) ?? 0;
      seen.set(seg.runId, n + 1);
      const d = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
      const len = Math.hypot(d.x, d.y) || 1;
      push({
        key: n === 0 ? seg.runId : `${seg.runId}.${n}`,
        runId: seg.runId.split("~")[0],
        legs: seg.legs,
        bays: seg.bays.map((b) => b.kind),
        lead: seg.lead ? { kind: seg.lead.kind, lengthFt: seg.lead.lengthFt } : undefined,
        tail: seg.tail,
        along: { x: d.x / len, y: d.y / len },
        normal: seg.normal,
      });
    }
    for (const single of laid.singles) {
      const wall = layAlone(single, strokes, puf, bayFt, widthFt, opts.standoffFt);
      if (wall) push(wall);
    }
  }

  return sheet.runs.map((run) => {
    const walls = wallsByRun.get(run.id) ?? [];
    const framesPerLeg = framesForHeight(run.heightFt, opts.reachFt, opts.jackMaxIn);
    const ppb = planksPerBayForWidth(run.widthFt);
    let legs = 0, bays = 0, frames = 0;
    for (const wall of walls) {
      wall.legs.forEach((_, i) => {
        const edit = sheet.legEdits[legKey(wall.key, i)];
        if (edit?.removed) return;
        legs += 1;
        frames += edit?.frames ?? framesPerLeg;
      });
      // A bay needs both its legs. One removed takes the bay with it.
      wall.bays.forEach((kind, i) => {
        if (kind === "rail") return;
        if (sheet.legEdits[legKey(wall.key, i)]?.removed || sheet.legEdits[legKey(wall.key, i + 1)]?.removed) return;
        bays += 1;
      });
      if (wall.lead && !sheet.legEdits[legKey(wall.key, 0)]?.removed) bays += 1;
      if (wall.tail?.isBay) bays += 1;
    }
    return {
      run, walls,
      lengthFt: runLength(run.points) / puf,
      framesPerLeg, legs, bays, frames,
      planks: bays * framesPerLeg * ppb,
    };
  });
}

export function countSheet(laid: LaidRun[]): SheetCount {
  return laid.reduce<SheetCount>((t, r) => ({
    linealFeet: t.linealFeet + r.lengthFt,
    bays: t.bays + r.bays,
    legs: t.legs + r.legs,
    frames: t.frames + r.frames,
    planks: t.planks + r.planks,
  }), { linealFeet: 0, bays: 0, legs: 0, frames: 0, planks: 0 });
}

// ----------------------------------------------------------------------
// Drawing by hand
// ----------------------------------------------------------------------

/**
 * Ortho, as on the takeoff: within five degrees of square a line is taken as
 * square and dropped onto the axis; past that the estimator means the angle.
 */
export function orthoSnap(from: PlanPoint, to: PlanPoint, toleranceDeg = 5): { pt: PlanPoint; snapped: boolean } {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { pt: to, snapped: false };
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const square = Math.round(angle / 90) * 90;
  if (Math.abs(angle - square) > toleranceDeg) return { pt: to, snapped: false };
  const horizontal = square === 0 || Math.abs(square) === 180;
  return { pt: horizontal ? { ...to, y: from.y } : { ...to, x: from.x }, snapped: true };
}

/** The nearest end or corner of a run already drawn, within reach - so runs meet cleanly. */
export function snapToRuns(pt: PlanPoint, runs: DesignRun[], reachPx: number, skipRunId?: string): PlanPoint | null {
  let best: PlanPoint | null = null, bestD = reachPx;
  for (const run of runs) {
    if (run.id === skipRunId) continue;
    for (const p of run.points) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d <= bestD) { best = p; bestD = d; }
    }
  }
  return best;
}

/** How far a point is from a run's line, in sheet pixels. For picking a run by clicking it. */
export function distanceToRun(pt: PlanPoint, run: DesignRun): number {
  let best = Infinity;
  for (let i = 0; i < run.points.length - 1; i++) {
    const a = run.points[i], b = run.points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t)));
  }
  return best;
}

export function feetInches(ft: number): string {
  if (!(ft > 0)) return "";
  const whole = Math.floor(ft + 1e-6);
  const inches = Math.round((ft - whole) * 12);
  return inches === 12 ? `${whole + 1}'-0"` : `${whole}'-${inches}"`;
}

// ----------------------------------------------------------------------
// Keeping drafts
//
// On this machine for now, under a key of their own. Drafts go to the
// account with the next drops; until then they are deliberately left where
// signing out does not clear them, because there is no other copy.
// ----------------------------------------------------------------------

const DRAFTS_KEY = "designSpaceDrafts_v1";
const ACTIVE_KEY = "designSpaceActiveDraft";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const point = (v: unknown): PlanPoint | null => (isRecord(v) && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x as number, y: v.y as number } : null);

function normalizeSheet(value: unknown): DesignSheet {
  if (!isRecord(value)) return emptySheet();
  const runs: DesignRun[] = Array.isArray(value.runs)
    ? value.runs.flatMap((r, i): DesignRun[] => {
      if (!isRecord(r) || !Array.isArray(r.points)) return [];
      const points = r.points.map(point).filter((p): p is PlanPoint => p !== null);
      if (points.length < 2) return [];
      return [{
        id: str(r.id) || `run-${i}`,
        label: str(r.label) || String(i + 1),
        points,
        heightFt: Math.max(0, num(r.heightFt)),
        bayFt: num(r.bayFt, 10) || 10,
        widthFt: num(r.widthFt, 3) || 3,
        flipped: r.flipped === true,
      }];
    })
    : [];
  const legEdits: Record<string, LegEdit> = {};
  if (isRecord(value.legEdits)) {
    for (const [k, v] of Object.entries(value.legEdits)) {
      if (!isRecord(v)) continue;
      const edit: LegEdit = {};
      if (v.removed === true) edit.removed = true;
      if (typeof v.frames === "number" && v.frames >= 1) edit.frames = Math.round(v.frames);
      if (typeof v.dx === "number" && typeof v.dy === "number") { edit.dx = v.dx; edit.dy = v.dy; }
      if (Object.keys(edit).length > 0) legEdits[k] = edit;
    }
  }
  const blocks: PlacedBlock[] = Array.isArray(value.blocks)
    ? value.blocks.flatMap((b, i): PlacedBlock[] => {
      if (!isRecord(b) || !str(b.blockId) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return [];
      return [{ id: str(b.id) || `blk-${i}`, blockId: str(b.blockId), x: b.x as number, y: b.y as number, rot: num(b.rot) % 360 }];
    })
    : [];
  const kinds: MarkKind[] = ["line", "box", "cloud", "dim", "text"];
  const marks: DesignMark[] = Array.isArray(value.marks)
    ? value.marks.flatMap((m, i): DesignMark[] => {
      if (!isRecord(m)) return [];
      const a = point(m.a), b = point(m.b);
      const kind = kinds.find((k) => k === m.kind);
      if (!a || !b || !kind) return [];
      return [{ id: str(m.id) || `mark-${i}`, kind, a, b, text: str(m.text) }];
    })
    : [];
  const puf = num(value.puf);
  return { puf: puf > 0 ? puf : null, scaleLabel: str(value.scaleLabel), rotation: num(value.rotation) % 360, runs, legEdits, blocks, marks };
}

function normalizeDraft(value: unknown): DesignDraft | null {
  if (!isRecord(value) || !str(value.id)) return null;
  const sheets: Record<string, DesignSheet> = {};
  if (isRecord(value.sheets)) for (const [k, v] of Object.entries(value.sheets)) sheets[k] = normalizeSheet(v);
  return {
    id: str(value.id),
    name: str(value.name, "Draft"),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
    fileName: str(value.fileName),
    pageNumber: Math.max(1, Math.round(num(value.pageNumber, 1))),
    sheets,
  };
}

/** Every draft on this machine, newest first. */
export function listDrafts(): DesignDraft[] {
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeDraft).filter((d): d is DesignDraft => d !== null)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** Writes one draft, stamping it. Returns false if the browser would not take it. */
export function saveDraft(draft: DesignDraft): boolean {
  try {
    const stamped = { ...draft, updatedAt: new Date().toISOString() };
    const rest = listDrafts().filter((d) => d.id !== draft.id);
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify([stamped, ...rest]));
    window.localStorage.setItem(ACTIVE_KEY, draft.id);
    return true;
  } catch {
    return false;
  }
}

export function deleteDraft(id: string) {
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(listDrafts().filter((d) => d.id !== id)));
  } catch { /* storage unavailable */ }
}

/** The draft that was open last, if it is still there. */
export function lastDraftId(): string {
  try { return window.localStorage.getItem(ACTIVE_KEY) ?? ""; } catch { return ""; }
}

/** The plan set of a draft is kept by planStore under this id, apart from every job's. */
export function planKey(draftId: string): string {
  return `design-${draftId}`;
}

/** What a draft comes to, for the drafts list: sheets worked and runs drawn. */
export function draftSummary(draft: DesignDraft): string {
  const sheets = Object.values(draft.sheets).filter((s) => s.runs.length + s.blocks.length + s.marks.length > 0);
  const runs = sheets.reduce((n, s) => n + s.runs.length, 0);
  if (sheets.length === 0) return "Nothing drawn yet";
  if (runs === 0) return `Marked up on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`;
  return `${runs} run${runs === 1 ? "" : "s"} on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`;
}

// ----------------------------------------------------------------------
// Blocks and marks
// ----------------------------------------------------------------------

/** Whether a point lies on a placed block, given the block's size on this sheet. */
export function pointInBlock(pt: PlanPoint, block: PlacedBlock, wPx: number, hPx: number, slackPx = 0): boolean {
  const r = (-block.rot * Math.PI) / 180;
  const dx = pt.x - block.x, dy = pt.y - block.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= wPx / 2 + slackPx && Math.abs(ly) <= hPx / 2 + slackPx;
}

function distanceToSegment(pt: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t));
}

/** How far a point is from a mark: from its line, from its box's edge, or from a note's anchor. */
export function distanceToMark(pt: PlanPoint, mark: DesignMark): number {
  if (mark.kind === "line" || mark.kind === "dim") return distanceToSegment(pt, mark.a, mark.b);
  if (mark.kind === "text") return Math.hypot(pt.x - mark.a.x, pt.y - mark.a.y);
  const x0 = Math.min(mark.a.x, mark.b.x), x1 = Math.max(mark.a.x, mark.b.x);
  const y0 = Math.min(mark.a.y, mark.b.y), y1 = Math.max(mark.a.y, mark.b.y);
  const corners: PlanPoint[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return Math.min(...corners.map((c, i) => distanceToSegment(pt, c, corners[(i + 1) % 4])));
}

/** A revision cloud round a box: arcs bulging outward, about `bump` across. */
export function cloudPath(a: PlanPoint, b: PlanPoint, bump: number): string {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const corners: PlanPoint[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  let d = `M ${x0} ${y0}`;
  corners.forEach((from, i) => {
    const to = corners[(i + 1) % 4];
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(1, Math.round(len / Math.max(bump, 1)));
    for (let s = 1; s <= n; s++) {
      const x = from.x + ((to.x - from.x) * s) / n, y = from.y + ((to.y - from.y) * s) / n;
      const r = len / n / 2;
      d += ` A ${r} ${r} 0 0 1 ${x} ${y}`;
    }
  });
  return `${d} Z`;
}
