// lib/scaffoldSetOut.ts
//
// The set-out engine. Built to KORBAN-Scaffold-Geometry-Rules.md, sections 1-5
// and 9, as agreed over four days of marked-up drawings in late October 2026.
// Where this file and that document disagree, the document is right.
//
// Nothing in here knows about React, the ledger or the drawing. It takes a
// traced outline in pixels and hands back runs of legs, bays and leftovers.
// That is deliberate: the component used to decide geometry inline, and every
// rule that lived there was a guess that happened to work on rectangles.

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanPoint = { x: number; y: number };

export type LegResult = {
  wallPoint: PlanPoint; tickTip: PlanPoint; labelPoint: PlanPoint;
  /** A turnaround frame: the mirror of a corner leg, one frame width into the run. A real frame, counted. */
  isTurnaroundMirror: boolean;
  isStartLeg: boolean; isEndLeg: boolean;
};

/**
 * How a span is closed. Three different things, and they buy different material.
 *
 *   braced  - a standard bay. Leg at each end, fixed cross braces.
 *   bastard - a real bay at a length no brace is made for. Leg at each end,
 *             guardrail instead of braces. Drawn dashed, back point to back
 *             point, so the foreman knows before he gets there.
 *   rail    - not a bay at all. No far leg. Plank and rail straight on from the
 *             last frame to the next run's corner frame.
 */
export type BayKind = "braced" | "bastard" | "rail";
export type BaySpan = { segIndex: number; lengthFt: number; kind: BayKind };

/** Where a run sits. The outer run follows the face; the others are features on it. */
export type RunKind = "outer" | "inner" | "spur" | "curve";

export type SegmentLegs = {
  segIndex: number;
  legs: LegResult[];
  /** Leg to leg, in order: bays[i] sits between legs[i] and legs[i + 1]. */
  bays: BaySpan[];
  /**
   * A bay into this run's first leg from a corner leg the arriving run landed
   * on. That leg is listed on the arriving run; the bay is this run's.
   */
  lead?: BaySpan;
  /** The wall these legs belong to, as used. */
  a: PlanPoint;
  b: PlanPoint;
  /** Square to that wall. The renderer must not recompute it. */
  normal: PlanPoint;
  kind: RunKind;
  /** Nothing is set against this wall; the runs either side pass it. */
  skipped?: boolean;
  /** Brackets assessed on this run's legs, one per leg, hooked into a followed inset. */
  brackets?: number;
  /**
   * How the run ends, when it does not end on its last leg: the last frame
   * (a0 wall side, a1 back point) and where the deck goes to (b0, b1). Straight
   * on for a planked gap; a bay into the next run's first frame through a
   * followed inset (isBay); beside when the next run's deck lies alongside this
   * one (then a0-b0 and a1-b1 are the two ends of the strip between the decks).
   * The renderer draws exactly this and nothing diagonal.
   */
  tail?: { a0: PlanPoint; a1: PlanPoint; b0: PlanPoint; b1: PlanPoint; isBay: boolean; beside: boolean; lengthFt: number; kind: BayKind };
  /** On a followed inset's legs: how far the bracket reaches in from the leg, ft - to a foot off the inset wall. */
  bracketReachFt?: number;
  /** On a curve run: what the curve is and how it was built - for the page to say so and offer the bay size. */
  curve?: { radiusFt: number; sweepDeg: number; side: CurveSide; bayFt: number; closed: boolean; wedges: number; leftoverFt: number };
  /** Why the engine did what it did here, in the estimator's words. */
  note?: string;
};

export type SetOutOptions = {
  /** Pixels per foot. */
  puf: number;
  frameWidthFt: number;
  bayFt: number;
  /** How far every leg stands off the wall it faces. Default 1'. */
  standoffFt?: number;
  /** Walls where the scaffold sits inside the traced line. */
  interiorWalls?: number[];
  /** Brace lengths the yard carries. Anything else is a bastard bay. */
  standardBays?: number[];
  /** Frame widths the job can draw on, for sizing a set to a narrow pocket. */
  frameWidthsFt?: number[];
  /** The widest span a plank bridges between two frames. Default 8'. */
  maxSpanFt?: number;
  /** Below this depth an inset is followed; at it and above, scaffold is set into it. Default 3'. */
  deepInsetFt?: number;
  /** A jog shallower than this is absorbed. Default 8". */
  jogToleranceFt?: number;
  /**
   * Turnaround bays, job wide. Every corner leg - a float, a leg a foot off a
   * return, the corner leg of an inside corner - gets a mirror one frame width
   * into its run, so the deck turns the corner on a square braced bay. Nothing
   * else moves. Default off.
   */
  turnaround?: boolean;
  /**
   * The outline is an open chain of walls, not a closed building - strokes
   * round part of a building, or a hand-drawn L. The two ends are free: a leg
   * stands at each end of the chain and nothing wraps or planks across the gap
   * between them. Default false.
   */
  open?: boolean;
  /**
   * Bays on a curve: square bays, each with its own two frames, the wedge
   * between them planked. 5' whatever the radius unless the estimator says
   * otherwise. Default 5.
   */
  curveBayFt?: number;
  /** The least gap between neighbouring frames on a curve, at their nearest point. Default 1'. */
  curveClearanceFt?: number;
  /**
   * A tank - an outline that is one closed curve - can be scaffolded outside,
   * inside or both. Default outside. Ignored for a building with a curved wall,
   * where the scaffold side is the outline's.
   */
  curveSides?: CurveSide | "both";
};

// ── Small geometry ────────────────────────────────────────────────────────────

function signedArea(pts: PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

function pointInPolygon(pt: PlanPoint, poly: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Square to the wall, facing the way the scaffold sits. */
export function outwardNormal(a: PlanPoint, b: PlanPoint, poly: PlanPoint[], sits: "exterior" | "interior" = "exterior"): PlanPoint {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (!len) return { x: 0, y: -1 };
  const n1 = { x: dy / len, y: -dx / len }, n2 = { x: -dy / len, y: dx / len };
  const area = signedArea(poly);
  const candidate = area > 0 ? n2 : n1, opp = area > 0 ? n1 : n2;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, td = Math.max(len * 0.05, 2);
  const outward = pointInPolygon({ x: mx + candidate.x * td, y: my + candidate.y * td }, poly) ? opp : candidate;
  return sits === "exterior" ? outward : { x: -outward.x, y: -outward.y };
}

/**
 * The clear span between two frames, measured the way it is stepped out:
 * nearest edge to nearest edge. On one corner of a real job the three readings
 * were 8'-2" along the wall, 9'-2" edge to edge and 10'-6" centre to centre.
 * Only the middle one is the span a plank has to carry.
 */
export function frameGap(a1: PlanPoint, a2: PlanPoint, b1: PlanPoint, b2: PlanPoint): number {
  return closest(a1, a2, b1, b2).dist;
}

/** The closest pair of points between two segments, and how far apart they are. */
function closest(a1: PlanPoint, a2: PlanPoint, b1: PlanPoint, b2: PlanPoint): { dist: number; p: PlanPoint; q: PlanPoint } {
  const toSeg = (p: PlanPoint, s: PlanPoint, e: PlanPoint) => {
    const vx = e.x - s.x, vy = e.y - s.y, len2 = vx * vx + vy * vy;
    const t = len2 <= 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * vx + (p.y - s.y) * vy) / len2));
    const q = { x: s.x + vx * t, y: s.y + vy * t };
    return { dist: Math.hypot(p.x - q.x, p.y - q.y), q };
  };
  const c1 = toSeg(a1, b1, b2), c2 = toSeg(a2, b1, b2), c3 = toSeg(b1, a1, a2), c4 = toSeg(b2, a1, a2);
  let best = { dist: c1.dist, p: a1, q: c1.q };
  if (c2.dist < best.dist) best = { dist: c2.dist, p: a2, q: c2.q };
  if (c3.dist < best.dist) best = { dist: c3.dist, p: c3.q, q: b1 };
  if (c4.dist < best.dist) best = { dist: c4.dist, p: c4.q, q: b2 };
  return best;
}

// ── The outline, read ─────────────────────────────────────────────────────────

/** Collapses jogs the scaffold would not follow. Under eight inches it is inside the standoff anyway. */
function simplifyOutline(outline: PlanPoint[], tolerance: number, open = false, keep?: Set<string>): PlanPoint[] {
  if (outline.length < 3) return outline;
  const kept: PlanPoint[] = [];
  for (let i = 0; i < outline.length; i++) {
    if (open && (i === 0 || i === outline.length - 1)) { kept.push(outline[i]); continue; }
    if (keep?.has(`${outline[i].x},${outline[i].y}`)) { kept.push(outline[i]); continue; }
    const prev = kept.length ? kept[kept.length - 1] : outline[(i - 1 + outline.length) % outline.length];
    const v = outline[i], next = outline[(i + 1) % outline.length];
    const dx = next.x - prev.x, dy = next.y - prev.y, len = Math.hypot(dx, dy);
    if (len < 1e-6) { kept.push(v); continue; }
    const dev = Math.abs((v.x - prev.x) * dy - (v.y - prev.y) * dx) / len;
    if (dev >= tolerance) kept.push(v);
  }
  return kept.length >= 3 ? kept : outline;
}

/** Drops vertices that sit on the straight line between their neighbours. */
function dropCollinear(pts: PlanPoint[], open = false, keep?: Set<string>): PlanPoint[] {
  if (pts.length < 4) return pts;
  const out: PlanPoint[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    if (open && (i === 0 || i === n - 1)) { out.push(pts[i]); continue; }
    if (keep?.has(`${pts[i].x},${pts[i].y}`)) { out.push(pts[i]); continue; }
    const p = pts[(i - 1 + n) % n], v = pts[i], q = pts[(i + 1) % n];
    const ux = v.x - p.x, uy = v.y - p.y, vx = q.x - v.x, vy = q.y - v.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    if (cos > 0.9999) continue;
    out.push(v);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * A stretch of wall that steps off the face line and comes back to it.
 *
 * That is the test - not depth. A wall that steps and does not come back is a
 * step or a notch, and the outline is followed round it like anywhere else.
 */
export type Inset = {
  from: number;          // vertex the inset leaves the face line at
  to: number;            // vertex it rejoins at
  inner: number[];       // the vertices in between
  depthFt: number;
  mouthFt: number;
  /**
   *   follow  - shallow: the legs step in and out with the wall
   *   double  - deep and wide: outer run straight across, a second run on the back
   *   turnin  - deep and narrow: a set sized to the pocket, frames across the opening
   *   outline - deep and wide with side walls long enough to stand against: not
   *             treated as an inset at all, the runs follow the outline like a notch
   */
  treatment: "ignore" | "follow" | "double" | "turnin" | "outline";
};

function findInsets(pts: PlanPoint[], puf: number, jogFt: number, deepFt: number, standLenFt: number): Inset[] {
  const n = pts.length, found: Inset[] = [];
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 2) {
    const a = pts[i % n], b0 = pts[(i + 1) % n];
    const ux = b0.x - a.x, uy = b0.y - a.y, ul = Math.hypot(ux, uy);
    if (ul < 1e-6) { i++; continue; }
    const u = { x: ux / ul, y: uy / ul };
    let matched = -1;
    for (let span = 2; span <= 8 && i + span < n + 1; span++) {
      const b = pts[(i + span) % n];
      const back = { x: b.x - a.x, y: b.y - a.y }, backLen = Math.hypot(back.x, back.y);
      if (backLen < puf) continue;
      // The rejoin point has to sit ON the face line, not merely ahead of it.
      // A 2' rise over 40' is within ten degrees of straight and is not an inset.
      if (Math.abs(back.x * u.y - back.y * u.x) > jogFt * puf) continue;
      if ((back.x * u.x + back.y * u.y) / backLen <= 0.985) continue;
      const after = pts[(i + span + 1) % n];
      const nx = after.x - b.x, ny = after.y - b.y, nl = Math.hypot(nx, ny);
      if (nl < 1e-6) continue;
      if ((nx * u.x + ny * u.y) / nl <= 0.985) continue;
      matched = i + span;
      break;
    }
    if (matched < 0) { i++; continue; }
    const b = pts[matched % n];
    const chord = { x: b.x - a.x, y: b.y - a.y }, chordLen = Math.hypot(chord.x, chord.y);
    let depth = 0;
    const inner: number[] = [];
    const sides = new Set<boolean>();
    for (let k = i + 1; k < matched; k++) {
      const v = pts[k % n];
      inner.push(k % n);
      const cross = (v.x - a.x) * chord.y - (v.y - a.y) * chord.x;
      // vertices sitting on the line are the straight either side, not the inset
      if (Math.abs(cross) / chordLen >= jogFt * puf) sides.add(cross > 0);
      depth = Math.max(depth, Math.abs(cross) / chordLen);
    }
    if (sides.size > 1) { i++; continue; }
    if (depth / puf < jogFt) { i++; continue; }
    // The scan may have started well before the inset, on the straight. Only
    // the vertices off the line are the inset; the ones either side of them
    // are where it leaves and rejoins.
    const off = inner.filter(k => {
      const v = pts[k];
      return Math.abs((v.x - a.x) * chord.y - (v.y - a.y) * chord.x) / chordLen >= jogFt * puf;
    });
    if (off.length === 0) { i++; continue; }
    const from = (off[0] - 1 + n) % n, to = (off[off.length - 1] + 1) % n;
    const mouthFt = Math.hypot(pts[to].x - pts[from].x, pts[to].y - pts[from].y) / puf;
    const depthFt = depth / puf;
    const treatment: Inset["treatment"] =
      depthFt < deepFt ? "follow"
      : mouthFt < standLenFt ? "turnin"
      : depthFt >= standLenFt ? "outline"
      : "double";
    found.push({ from, to, inner: off, depthFt, mouthFt, treatment });
    i = matched;
  }
  return found;
}

// ── The walls of a run line ───────────────────────────────────────────────────

type Junction =
  | "curve"        // into or out of a curved wall: the straight run just meets it, a foot clear

  | "wrap"        // the next run starts at an outside corner and wraps it with its float
  | "inside"      // an inside corner: the next run owns the corner leg
  | "continuous"  // through a followed inset: one run, the legs step in and out
  | "carry";      // nothing is set against the next wall: this run carries past

type Wall = {
  idx: number;
  a: PlanPoint; b: PlanPoint;
  len: number;
  along: PlanPoint; normal: PlanPoint;
  startOutside: boolean; endOutside: boolean;
  skipped: boolean;
  role: "main" | "followSide" | "followBack" | "innerBack" | "innerSide" | "curve";
  /** A curved wall: its arc and the bays laid round it. */
  curve?: { arc: CurveArc; side: CurveSide; layout?: CurveLayout };
  /** Filled in once the walls are read as a loop. */
  toNext?: Junction;
  fromPrev?: Junction;
  nextLegged?: number;
  prevLegged?: number;
  /** How far off its own line this wall's legs stand, px. The standoff, plus the inset depth in front of a followed inset. */
  off: number;
  /** Inset depth in front of this wall, ft - set on a followed inset's back wall. */
  inset: number;
  /** The free ends of an open chain: a leg stands at the end of the stroke, nothing wraps. */
  freeStart?: boolean;
  freeEnd?: boolean;
  positions: number[];
  /** Positions that are turnaround mirrors, when those are on. */
  mirrors: Set<number>;
  /** Legs that must not be trimmed: floats, fixed first/last legs. */
  pinned: Set<number>;
  fixedFirst?: number;
  fixedLast?: number;
  marchLimit: number;
  continueFrom?: PlanPoint;
  cornerLegFromPrev?: PlanPoint;
  brackets?: number;
  note?: string;
};

function makeWall(idx: number, a: PlanPoint, b: PlanPoint, poly: PlanPoint[], sits: "exterior" | "interior"): Wall {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const along = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  return {
    idx, a, b, len, along, normal: outwardNormal(a, b, poly, sits),
    startOutside: false, endOutside: false, skipped: false, role: "main",
    off: 0, inset: 0, positions: [], mirrors: new Set(), pinned: new Set(), marchLimit: len,
  };
}

/** Which way the corner turns, read against the scaffold side so it holds for interior work. */
function cornerIsOutside(prev: Wall, next: Wall, poly: PlanPoint[]): boolean {
  const cross = prev.along.x * next.along.y - prev.along.y * next.along.x;
  const ccw = signedArea(poly) > 0;
  // For exterior scaffold on a CCW outline a left turn is convex: an outside corner.
  const convex = (cross > 0) === ccw;
  // Interior work flips the sense: the scaffold is on the other side of the line.
  const prevSide = prev.normal, outward = outwardNormal(prev.a, prev.b, poly, "exterior");
  const interior = prevSide.x * outward.x + prevSide.y * outward.y < 0;
  return interior ? !convex : convex;
}

// ── Filling bays between fixed points ─────────────────────────────────────────

function isStandard(len: number, bays: number[]): boolean {
  return bays.some(b => Math.abs(b - len) <= 0.1);
}

/**
 * Two standard bays that add to a span, if any pair does.
 *
 * On a face too short for a 10', a leftover under the shortest standard bay
 * cannot sit at the end, so the last two bays are re-cut as a standard pair.
 * The longer bay goes first and the short one at the end of the run - unless
 * preferAt is given, when the pair whose middle leg lands nearest it wins:
 * filling from a float, that is a foot past the corner line, which is how a
 * 13' face comes out 7' and 6' with the middle leg a foot off the face.
 */
function standardPair(span: number, bays: number[], preferAt: number | undefined, startAt: number): [number, number] | null {
  let best: [number, number] | null = null, bestScore = Infinity;
  for (const a of bays) for (const b of bays) {
    if (Math.abs(a + b - span) > 0.1) continue;
    const score = preferAt === undefined ? -a : Math.abs(startAt + a - preferAt);
    if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) < 1e-9 && a > (best?.[0] ?? -1))) {
      best = [a, b]; bestScore = score;
    }
  }
  return best;
}

/**
 * Lays bays from a fixed start to a fixed end.
 *
 * Full bays first. A leftover at least a standard bay long sits at the end -
 * a short bay never sits between two full ones. A leftover shorter than that
 * takes one full bay with it and the pair is re-cut as two standard lengths.
 */
function fillFixed(startAt: number, endAt: number, bayFt: number, bays: number[], preferAt?: number): number[] {
  const out: number[] = [];
  const span = endAt - startAt;
  if (span <= 0.05) return out;
  const minStd = Math.min(...bays);
  if (span <= bayFt + 0.05) { out.push(endAt); return out; }
  let n = Math.floor((span + 1e-9) / bayFt);
  let r = span - n * bayFt;
  if (r < 0.05) { for (let k = 1; k <= n; k++) out.push(startAt + k * bayFt); return out; }
  if (r >= minStd - 0.05) {
    for (let k = 1; k <= n; k++) out.push(startAt + k * bayFt);
    out.push(endAt);
    return out;
  }
  n -= 1;
  for (let k = 1; k <= n; k++) out.push(startAt + k * bayFt);
  const base = startAt + n * bayFt;
  const pair = standardPair(bayFt + r, bays, preferAt, base);
  if (pair) { out.push(base + pair[0]); out.push(endAt); }
  else { out.push(base + bayFt); out.push(endAt); }
  return out;
}

// ── The engine ────────────────────────────────────────────────────────────────

/**
 * The insets in a traced plan and what the engine will do with each - the
 * same read setOut makes, for the guidance and the ledger to talk about.
 */
export function readInsets(outlineIn: PlanPoint[], opts: SetOutOptions): Inset[] {
  const puf = opts.puf, W = opts.frameWidthFt, G = opts.standoffFt ?? 1;
  if (outlineIn.length < 3 || puf <= 0 || W <= 0) return [];
  const ordered = outlineIn.slice();
  if (signedArea(ordered) > 0) ordered.reverse();
  const JOG = opts.jogToleranceFt ?? 8 / 12;
  const base = dropCollinear(simplifyOutline(ordered, JOG * puf));
  return findInsets(base, puf, JOG, opts.deepInsetFt ?? 3, W + 2 * G).filter(i => i.treatment !== "ignore");
}

export function setOut(outlineIn: PlanPoint[], opts: SetOutOptions): SegmentLegs[] {
  const puf = opts.puf;
  const W = opts.frameWidthFt, BAY = opts.bayFt;
  const G = opts.standoffFt ?? 1;
  const BAYS = opts.standardBays ?? [4, 5, 6, 7, 8, 10];
  const WIDTHS = opts.frameWidthsFt ?? [3, 3.5, 5];
  const MAXSPAN = opts.maxSpanFt ?? 8;
  const DEEP = opts.deepInsetFt ?? 3;
  const JOG = opts.jogToleranceFt ?? 8 / 12;
  const STAND = W + 2 * G;          // a wall shorter than this has nowhere to stand a frame
  const FLOAT = W + G;              // how far past a corner the wrapping run's float sits
  const LAND_TOL = 0.1;             // an arriving leg this close to the crossing has landed on the corner

  if (outlineIn.length < 3 || puf <= 0 || BAY <= 0 || W <= 0) return [];

  // 1. Read the outline. Walked clockwise - that is the way a crew sets out,
  //    and it decides which run starts at each corner and so which run wraps
  //    it. Jogs absorbed, then every inset found and classified.
  const OPEN = !!opts.open;
  let ordered = outlineIn.slice();
  // Interior walls are matched by where they sit, because the outline is
  // reversed and simplified before the walls are built and an index would
  // point at the wrong one afterwards.
  const interiorSegs = (opts.interiorWalls ?? [])
    .map(i => [outlineIn[i % outlineIn.length], outlineIn[(i + 1) % outlineIn.length]] as [PlanPoint, PlanPoint])
    .filter(([a, b]) => a && b);
  const sitsInterior = (a: PlanPoint, b: PlanPoint) => {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return interiorSegs.some(([s, e]) => frameGap(m, m, s, e) <= JOG * puf + 1e-6);
  };
  if (signedArea(ordered) > 0) ordered.reverse();
  ordered = ordered.filter((p, i) => i === 0 || Math.hypot(p.x - ordered[i - 1].x, p.y - ordered[i - 1].y) > 1e-6);
  if (!OPEN && ordered.length > 1 && Math.hypot(ordered[0].x - ordered[ordered.length - 1].x, ordered[0].y - ordered[ordered.length - 1].y) <= 1e-6) ordered.pop();

  // Curves, read off the raw outline before any jog is absorbed - a traced
  // curve is nothing but small jogs. Each curved stretch becomes one wall,
  // start to end, that lays its own square bays.
  const CURVE_BAY = opts.curveBayFt ?? 5, CLEAR = opts.curveClearanceFt ?? 1;
  const curves = detectCurves(ordered, { open: OPEN });
  const keyOf = (p: PlanPoint) => `${p.x},${p.y}`;
  const curveByStart = new Map<string, DetectedCurve>();
  if (curves.length === 1 && curves[0].arc.closed) {
    // A tank: one closed curve and nothing else. Outside, inside or both.
    const sides: CurveSide[] = opts.curveSides === "both" ? ["outside", "inside"] : [opts.curveSides ?? "outside"];
    return sides.map((side, k) => curveRun(k, curves[0], side, { puf, bayFt: CURVE_BAY, frameWidthFt: W, standoffFt: G, clearanceFt: CLEAR, standardBays: BAYS, maxSpanFt: MAXSPAN }, BAYS));
  }
  if (curves.length > 0) {
    const drop = new Set<number>();
    for (const c of curves) {
      curveByStart.set(keyOf(c.start), c);
      let k = c.from;
      while (k !== c.to) { k = (k + 1) % ordered.length; if (k !== c.to) drop.add(k); }
    }
    ordered = ordered.filter((_, i) => !drop.has(i));
  }
  const protectedKeys = new Set<string>();
  for (const c of curves) { protectedKeys.add(keyOf(c.start)); protectedKeys.add(keyOf(c.end)); }
  const base = dropCollinear(simplifyOutline(ordered, JOG * puf, OPEN, protectedKeys), OPEN, protectedKeys);
  const insets = OPEN ? [] : findInsets(base, puf, JOG, DEEP, STAND);

  // 2. The run line. Deep insets come out of it - the outer run carries straight
  //    across their mouths - and are kept aside as inner runs or turn-in spurs.
  //    Followed insets stay in; their walls are marked so the run steps in and out.
  const removed = new Set<number>();
  const followSides = new Set<number>();   // indices (in base) of a followed inset's side walls
  const followBacks = new Set<number>();
  const backDepth = new Map<number, number>();   // base index of a followed back wall -> inset depth, ft
  for (const ins of insets) {
    if (ins.treatment === "double" || ins.treatment === "turnin") ins.inner.forEach(k => removed.add(k));
    if (ins.treatment === "follow") {
      // walls are indexed by their start vertex: from -> inner[0] is side 1,
      // inner[k] -> inner[k+1] is the back, inner[last] -> to is side 2.
      followSides.add(ins.from);
      followSides.add(ins.inner[ins.inner.length - 1]);
      for (let k = 0; k + 1 < ins.inner.length; k++) { followBacks.add(ins.inner[k]); backDepth.set(ins.inner[k], ins.depthFt); }
    }
  }
  const keep: number[] = [];
  for (let k = 0; k < base.length; k++) if (!removed.has(k)) keep.push(k);
  const line = dropCollinear(keep.map(k => base[k]), OPEN);
  const n = line.length;
  if (n < 3) return [];
  const key = (p: PlanPoint) => `${p.x},${p.y}`;
  const sideStarts = new Set([...followSides].map(k => key(base[k])));
  const backStarts = new Set([...followBacks].map(k => key(base[k])));
  const depthAt = new Map([...backDepth].map(([k, d]) => [key(base[k]), d]));
  const G_px = G * puf, BAY_px = BAY * puf, FLOAT_px = FLOAT * puf;

  // 3. The walls, with what they are.
  const walls: Wall[] = [];
  const wallCount = OPEN ? n - 1 : n;           // an open chain has no wall back from its last point
  for (let i = 0; i < wallCount; i++) {
    const k0 = key(line[i]);
    const w = makeWall(i, line[i], line[(i + 1) % n], line, sitsInterior(line[i], line[(i + 1) % n]) ? "interior" : "exterior");
    w.off = G_px;
    const curveHere = curveByStart.get(k0);
    if (curveHere) {
      // which side of its chord the centre sits on says which way the wall bows
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      const toCentre = (curveHere.arc.cx - mid.x) * w.normal.x + (curveHere.arc.cy - mid.y) * w.normal.y;
      w.role = "curve";
      w.curve = { arc: curveHere.arc, side: toCentre < 0 ? "outside" : "inside" };
    } else if (sideStarts.has(k0)) w.role = "followSide";
    else if (backStarts.has(k0)) {
      // the legs in front of a followed inset stay on the main line - their
      // back points in line with every other frame - and brackets reach in
      w.role = "followBack";
      w.inset = depthAt.get(k0) ?? 0;
      w.off = G_px + w.inset * puf;
    }
    w.skipped = w.role === "curve" ? false : (w.len < STAND * puf - 1e-6 || w.role === "followSide");
    if (w.skipped && w.role === "main") w.note = "nothing set against it - too short to stand a frame";
    walls.push(w);
  }
  for (let i = 0; i < wallCount; i++) {
    const prev = walls[(i - 1 + wallCount) % wallCount], w = walls[i];
    const outside = cornerIsOutside(prev, w, line);
    w.startOutside = outside;
    prev.endOutside = outside;
  }
  if (OPEN) { walls[0].freeStart = true; walls[wallCount - 1].freeEnd = true; }
  const legged = walls.filter(w => !w.skipped);
  if (legged.length === 0) return walls.map(w => emptyResult(w));

  // 4. How each legged wall meets the next legged wall. On an open chain the
  //    last one meets nothing: it is its own neighbour, which is how a lone
  //    wall already reads.
  for (let k = 0; k < legged.length; k++) {
    const w = legged[k], nx = legged[(k + 1) % legged.length];
    if (OPEN && k === legged.length - 1) { w.nextLegged = w.idx; if (legged.length === 1) w.prevLegged = w.idx; continue; }
    w.nextLegged = nx.idx; nx.prevLegged = w.idx;
    if (w.role === "curve" || nx.role === "curve") { w.toNext = "curve"; nx.fromPrev = "curve"; continue; }
    // what sits between them
    let between: Wall[] = [];
    for (let j = (w.idx + 1) % n; j !== nx.idx; j = (j + 1) % n) between.push(walls[j]);
    const throughFollow = between.some(b => b.role === "followSide") || w.role === "followBack" || nx.role === "followBack";
    let junction: Junction;
    if (throughFollow) junction = "continuous";
    else if (between.length > 0) junction = "carry";
    else if (nx.startOutside) junction = "wrap";
    else junction = "inside";
    w.toNext = junction; nx.fromPrev = junction;
  }

  /** The frame a leg at d on this wall would stand: wall side point and back point. */
  const frameOf = (w: Wall, d: number) => {
    const b = { x: w.a.x + w.along.x * d, y: w.a.y + w.along.y * d };
    return [
      { x: b.x + w.normal.x * w.off, y: b.y + w.normal.y * w.off },
      { x: b.x + w.normal.x * (w.off + W * puf), y: b.y + w.normal.y * (w.off + W * puf) },
    ] as [PlanPoint, PlanPoint];
  };

  // 5. Anchors and the march, wall by wall, in order round the loop.
  const BAYS_px = BAYS.map(b => b * puf);
  const W_px = W * puf;
  const TA = !!opts.turnaround;

  // Twice round, because the first wall's start may depend on the last wall's
  // end, and that is not known until the loop has been round once.
  for (let sweep = 0; sweep < 2; sweep++)
  for (let pass = 0; pass < legged.length; pass++) {
    const w = legged[pass];
    w.positions = []; w.pinned = new Set(); w.mirrors = new Set();
    w.fixedFirst = undefined; w.fixedLast = undefined;

    // -- where it begins. With turnaround on, the corner leg's mirror one frame
    //    width in is the anchor the run marches from; nothing else is fixed by it.
    let startAt: number;
    let mirrorFirst: number | undefined;
    if (w.role === "curve" && w.curve) {
      // square bays round the arc, each with its own two frames; the straight
      // walls either side meet it a foot clear
      w.curve.layout = layoutCurve(w.curve.arc, w.curve.side, { puf, bayFt: CURVE_BAY, frameWidthFt: W, standoffFt: G, clearanceFt: CLEAR, standardBays: BAYS, maxSpanFt: MAXSPAN });
      w.positions = w.curve.layout.bays.flatMap(b => b.frames.map(f => (f.wallPoint.x - w.a.x) * w.along.x + (f.wallPoint.y - w.a.y) * w.along.y));
      const nxc = walls[w.nextLegged!];
      if (nxc !== w) { nxc.continueFrom = undefined; nxc.cornerLegFromPrev = undefined; }
      continue;
    }
    if (w.freeStart) {
      startAt = 0; w.fixedFirst = 0;                               // the end of the stroke: a leg, no float
    } else if (w.fromPrev === "curve") {
      // out of a curve: a leg a foot past its end, pushed on until it clears
      // the curve's last frame by a foot at the nearest point
      const pv = walls[w.prevLegged!];
      const lastFrame = pv.curve?.layout?.bays.length ? pv.curve.layout.bays[pv.curve.layout.bays.length - 1].frames[1] : undefined;
      let d = G_px;
      if (lastFrame) {
        let guard = 0;
        while (guard++ < 40) {
          const [f1, f2] = frameOf(w, d);
          if (frameGap(f1, f2, lastFrame.wallPoint, lastFrame.tickTip) >= CLEAR * puf - 1e-6) break;
          d += puf * 0.25;
        }
      }
      startAt = d; w.fixedFirst = d;
    } else if (w.role === "followBack") {
      startAt = G_px; w.fixedFirst = G_px;                       // a foot off the side wall
    } else if (w.fromPrev === "continuous" && w.continueFrom) {
      // carry the rhythm across the inset: project the last leg of the previous wall
      const d = (w.continueFrom.x - w.a.x) * w.along.x + (w.continueFrom.y - w.a.y) * w.along.y;
      startAt = d + BAY_px;
    } else if (w.fromPrev === "inside" && w.cornerLegFromPrev) {
      // the arriving run landed on the corner: that leg is the corner leg, march on from it
      const d = (w.cornerLegFromPrev.x - w.a.x) * w.along.x + (w.cornerLegFromPrev.y - w.a.y) * w.along.y;
      startAt = TA ? d + W_px : d + BAY_px;
      if (TA) mirrorFirst = startAt;
    } else if (w.startOutside) {
      if (w.fromPrev === "carry") {
        // past a short return: a leg a foot off the return, the float before it.
        // With turnaround on, the float comes in so that leg is its mirror -
        // the carry-past is a limit, not a target.
        w.fixedFirst = G_px;
        startAt = TA ? G_px - W_px : -FLOAT_px;
        if (TA) mirrorFirst = G_px;
      } else {
        startAt = -FLOAT_px;                                       // this run wraps the corner
        if (TA) mirrorFirst = startAt + W_px;
      }
    } else {
      startAt = G_px; w.fixedFirst = G_px;                         // inside corner: a foot off each wall
      if (TA) mirrorFirst = G_px + W_px;
    }

    // -- where it is allowed to reach
    const crossing = w.len - G_px;                                  // the perpendicular run's leg line
    let endAnchor: number | undefined;                              // a leg of the next wall this one fills to
    if (w.freeEnd) { w.fixedLast = w.len; w.marchLimit = w.len; }   // the end of the stroke: a leg of its own
    else if (w.role === "followBack") { w.fixedLast = crossing; w.marchLimit = crossing; }
    else if (w.toNext === "continuous") {
      w.marchLimit = w.len;
      const nx = walls[w.nextLegged!];
      if (nx.role === "followBack") {
        // into a followed inset: its first leg, a foot off the side wall, is fixed - fill to it
        const p = { x: nx.a.x + nx.along.x * G_px, y: nx.a.y + nx.along.y * G_px };
        endAnchor = (p.x - w.a.x) * w.along.x + (p.y - w.a.y) * w.along.y;
      }
    }
    else if (w.toNext === "carry") {
      if (w.endOutside) w.marchLimit = w.len + FLOAT_px;            // carries past, like a wrap
      else { w.fixedLast = crossing; w.marchLimit = crossing; }     // ends a foot off the return
    }
    else if (w.toNext === "wrap") w.marchLimit = w.len;             // a full bay may land in the last foot
    else if (w.toNext === "curve") w.marchLimit = w.len;            // into a curve: the gap to its first frame is planked
    else w.marchLimit = crossing;                                   // inside: stop at the crossing
    const mirrorLast = TA && w.fixedLast !== undefined && w.role !== "followBack" && !w.freeEnd ? w.fixedLast - W_px : undefined;

    // -- the legs
    const pos: number[] = [startAt];
    w.pinned.add(0);
    const pin = (d: number, mirror = false) => {
      if (pos.some(p => Math.abs(p - d) < 1e-6)) { if (mirror) w.mirrors.add(d); return; }
      pos.push(d); w.pinned.add(pos.length - 1); if (mirror) w.mirrors.add(d);
    };
    if (mirrorFirst !== undefined && mirrorFirst > startAt + 1e-6) pin(mirrorFirst, true);
    if (w.fixedFirst !== undefined && w.fixedFirst > pos[pos.length - 1] + 1e-6) pin(w.fixedFirst);
    if (mirrorFirst !== undefined && w.fixedFirst !== undefined && Math.abs(mirrorFirst - w.fixedFirst) < 1e-6) w.mirrors.add(mirrorFirst);
    if (w.fixedLast !== undefined) {
      const from = pos[pos.length - 1];
      const to = mirrorLast !== undefined && mirrorLast > from + 1e-6 ? mirrorLast : w.fixedLast;
      // from the float itself, the pair that lands a leg a foot past the corner line wins
      const fromFloat = from === startAt && startAt < -1e-6;
      fillFixed(from, to, BAY_px, BAYS_px, fromFloat ? G_px : undefined).forEach(p => pos.push(p));
      if (to !== w.fixedLast) { w.mirrors.add(to); w.pinned.add(pos.length - 1); pos.push(w.fixedLast); }
      w.pinned.add(pos.length - 1);
    } else if (endAnchor !== undefined) {
      // fill to the next wall's fixed leg, which is not ours to list
      const from = pos[pos.length - 1];
      const fromFloat = from === startAt && startAt < -1e-6;
      const filled = fillFixed(from, endAnchor, BAY_px, BAYS_px, fromFloat ? G_px : undefined);
      filled.slice(0, -1).forEach(p => pos.push(p));
    } else {
      let cursor = pos[pos.length - 1], guard = 0;
      while (cursor + BAY_px <= w.marchLimit + 0.01 && guard++ < 1000) { cursor += BAY_px; pos.push(cursor); }
      if (w.toNext === "inside") {
        const gap = (crossing - cursor) / puf;
        if (gap > MAXSPAN + 1e-6) {
          // more than a plank's reach left: the last bay runs to the crossing
          // and that leg becomes the corner leg - a bastard bay before two short ones
          pos.push(crossing); w.pinned.add(pos.length - 1);
        } else if (gap > LAND_TOL && gap < W - 1e-6 && pos.length >= 2 && !w.pinned.has(pos.length - 1)) {
          // the corner frame lies along this run's leg line for a frame width
          // back from the crossing. A leg inside that would stand in it, so the
          // last bay is cut shorter - longest standard first - to clear it
          const prev = pos[pos.length - 2], lastBay = (cursor - prev) / puf;
          const ladder = [...BAYS].sort((a, b) => b - a);
          const b = ladder.find(b => b < lastBay - 1e-6 && gap + lastBay - b >= W - 1e-6 && gap + lastBay - b <= MAXSPAN + 1e-6);
          pos[pos.length - 1] = b !== undefined ? prev + b * puf : crossing - W * puf;
          w.pinned.add(pos.length - 1);
        }
      }
    }
    w.positions = pos;

    // -- hand the corner on
    const nx = walls[w.nextLegged!];
    const last = pos[pos.length - 1];
    if (nx === w) continue;
    nx.continueFrom = undefined; nx.cornerLegFromPrev = undefined;
    if (w.toNext === "continuous") nx.continueFrom = legPoint(w, last, w.off);
    if (w.toNext === "inside") {
      const gap = (crossing - last) / puf;
      if (Math.abs(gap) <= LAND_TOL) {
        nx.cornerLegFromPrev = legPoint(w, last, w.off);
        w.note = "last leg landed on the corner - it is the corner leg for both runs";
      }
    }
  }

  // 6. The corner pass: measured frame to frame, trimmed to the span, a leg added
  //    only where the plank genuinely cannot reach.
  const spanFt = (w: Wall, d: number, nx: Wall): number => {
    if (w.toNext === "inside") {
      // the deck runs along the wall into the corner leg: leg to leg
      return ((w.len - G_px) - d) / puf;
    }
    if (w.toNext === "continuous") {
      // through a followed inset the next leg carries the rhythm: measured along the line
      const p = legPoint(nx, nx.positions[0], nx.off);
      return (((p.x - w.a.x) * w.along.x + (p.y - w.a.y) * w.along.y) - d) / puf;
    }
    return deckGap(w, d, nx).dist / puf;
  };
  /** Round a corner: this frame to the nearest deck of the next run, and where that is. */
  const deckGap = (w: Wall, d: number, nx: Wall) => {
    const [a1, a2] = frameOf(w, d);
    let best: { dist: number; p: PlanPoint; q: PlanPoint } = { dist: Infinity, p: a1, q: a1 };
    if (nx.role === "curve") {
      const f = nx.curve?.layout?.bays[0]?.frames[0];
      if (!f) return best;
      return closest(a1, a2, f.wallPoint, f.tickTip);
    }
    if (nx.positions.length < 2) {
      const [b1, b2] = frameOf(nx, nx.positions[0]);
      best = closest(a1, a2, b1, b2);
    } else {
      for (let k = 1; k < nx.positions.length; k++) {
        const [p1, p2] = frameOf(nx, nx.positions[k - 1]), [q1, q2] = frameOf(nx, nx.positions[k]);
        const edges: [PlanPoint, PlanPoint][] = [[p1, p2], [p2, q2], [q2, q1], [q1, p1]];
        for (const [e1, e2] of edges) { const c = closest(a1, a2, e1, e2); if (c.dist < best.dist) best = c; }
      }
    }
    return best;
  };
  for (const w of legged) {
    const nx = walls[w.nextLegged!];
    if (nx === w || w.role === "curve") continue;
    // trim: drop any trailing leg we can lose and still plank back. Through a
    // followed inset the span is a bay with a jog in it, not a gap, so the
    // limit there is the bay rather than the plank.
    const limit = w.toNext === "continuous" ? BAY : MAXSPAN;
    while (w.positions.length > 1 && !w.pinned.has(w.positions.length - 1)) {
      const before = w.positions[w.positions.length - 2];
      if (spanFt(w, before, nx) <= limit + 1e-6) w.positions.pop(); else break;
    }
    // add: only where the plank cannot reach. The longest standard bay that
    // fits goes in first; a bastard bay to the limit only if none does.
    if (w.fixedLast === undefined && w.toNext !== "inside") {
      const reach = w.marchLimit;
      const ladder = [...BAYS_px].sort((a, b) => b - a);
      let guard = 0;
      while (spanFt(w, w.positions[w.positions.length - 1], nx) > limit + 1e-6 && guard++ < 50) {
        const last = w.positions[w.positions.length - 1];
        const bay = ladder.find(b => last + b <= reach + 0.01);
        const next = bay !== undefined ? last + bay : reach;
        if (next <= last + 1e-6) break;
        w.positions.push(next);
      }
    }
  }

  // 7. Results for the run line.
  const results: SegmentLegs[] = [];
  for (const w of walls) {
    if (w.skipped) { results.push(emptyResult(w)); continue; }
    const nx = walls[w.nextLegged!];
    if (w.role === "curve" && w.curve?.layout) {
      const run = curveRunFromLayout(w.idx, w.curve.arc, w.curve.layout, puf, W, BAYS, CURVE_BAY, w.a, w.b, w.normal);
      // the gap from the curve's last frame to the next wall's first leg is planked
      if (nx !== w && nx.positions.length && run.legs.length) {
        const lastLeg = run.legs[run.legs.length - 1];
        const nf = leg(nx, nx.positions[0], nx.off, W * puf, true, false);
        const gap = frameGap(lastLeg.wallPoint, lastLeg.tickTip, nf.wallPoint, nf.tickTip) / puf;
        if (gap > G + 0.05) {
          run.tail = { a0: lastLeg.wallPoint, a1: lastLeg.tickTip, b0: nf.wallPoint, b1: nf.tickTip, isBay: false, beside: false, lengthFt: gap, kind: gap <= MAXSPAN + 1e-6 ? "rail" : "bastard" };
        }
      }
      results.push(run);
      continue;
    }
    const real = w.positions.filter(p => !w.mirrors.has(p));
    const legs = w.positions.map(d => {
      const l = leg(w, d, w.off, W * puf, d === real[0], d === real[real.length - 1]);
      if (w.mirrors.has(d)) l.isTurnaroundMirror = true;
      return l;
    });
    const bays: BaySpan[] = [];
    const asBay = (lengthFt: number): BaySpan =>
      ({ segIndex: w.idx, lengthFt, kind: isStandard(lengthFt, BAYS) ? "braced" : "bastard" });
    // the arriving run landed its last leg on the corner: that leg is this
    // run's corner leg too, and the bay out of it is this run's first bay
    let lead: BaySpan | undefined;
    if (w.fromPrev === "inside" && w.cornerLegFromPrev) {
      const d0 = (w.cornerLegFromPrev.x - w.a.x) * w.along.x + (w.cornerLegFromPrev.y - w.a.y) * w.along.y;
      if (w.positions[0] - d0 > 0.05 * puf) lead = asBay((w.positions[0] - d0) / puf);
    }
    for (let k = 1; k < w.positions.length; k++) bays.push(asBay((w.positions[k] - w.positions[k - 1]) / puf));
    const last = w.positions[w.positions.length - 1];
    const leftover = nx === w ? 0 : spanFt(w, last, nx);
    // a gap no wider than the standoff is just the two decks meeting - the
    // plank overhang covers it and nothing is counted
    let tail: SegmentLegs["tail"];
    if (leftover > G + 0.05) {
      // through a followed inset the span is a bay into the inset's first leg;
      // round a corner, or into the corner leg, it is plank and rail with no far frame
      const isBay = w.toNext === "continuous";
      const kind: BayKind = isBay ? asBay(leftover).kind
        : leftover <= MAXSPAN + 1e-6 ? "rail" : "bastard";
      const a0 = legPoint(w, last, w.off), a1 = legPoint(w, last, w.off + W * puf);
      if (isBay) {
        const far = nx.positions[0];
        tail = { a0, a1, b0: legPoint(nx, far, nx.off), b1: legPoint(nx, far, nx.off + W * puf), isBay: true, beside: false, lengthFt: leftover, kind };
      } else if (w.toNext === "inside") {
        const b0 = { x: a0.x + w.along.x * leftover * puf, y: a0.y + w.along.y * leftover * puf };
        const b1 = { x: a1.x + w.along.x * leftover * puf, y: a1.y + w.along.y * leftover * puf };
        tail = { a0, a1, b0, b1, isBay, beside: false, lengthFt: leftover, kind };
      } else {
        // which way is the next deck from here: ahead along the run, or beside it
        const c = deckGap(w, last, nx);
        const gx = c.q.x - c.p.x, gy = c.q.y - c.p.y;
        const ahead = Math.abs(gx * w.along.x + gy * w.along.y) >= Math.abs(gx * w.normal.x + gy * w.normal.y);
        if (ahead) {
          const b0 = { x: a0.x + w.along.x * leftover * puf, y: a0.y + w.along.y * leftover * puf };
          const b1 = { x: a1.x + w.along.x * leftover * puf, y: a1.y + w.along.y * leftover * puf };
          tail = { a0, a1, b0, b1, isBay, beside: false, lengthFt: leftover, kind };
        } else {
          // the next run's deck lies alongside this one, a strip between them from
          // this last frame to that run's first frame, planked across
          const s = Math.sign(gx * w.normal.x + gy * w.normal.y) || 1;
          const edge = a1;                                                   // this deck's outer edge at the last frame
          const across = { x: w.normal.x * s * leftover * puf, y: w.normal.y * s * leftover * puf };
          const farLeg = legPoint(nx, nx.positions[0], nx.off);
          const alongTo = (farLeg.x - edge.x) * w.along.x + (farLeg.y - edge.y) * w.along.y;
          const farEdge = { x: edge.x + w.along.x * alongTo, y: edge.y + w.along.y * alongTo };
          tail = { a0: edge, b0: { x: edge.x + across.x, y: edge.y + across.y },
                   a1: farEdge, b1: { x: farEdge.x + across.x, y: farEdge.y + across.y },
                   isBay, beside: true, lengthFt: leftover, kind };
        }
      }
    }
    if (w.role === "followBack") { w.brackets = w.positions.length; w.note = `followed inset - legs on the main line, brackets reach ${fmt(w.inset)} in`; }
    results.push({ segIndex: w.idx, legs, bays, lead, a: w.a, b: w.b, normal: w.normal, kind: "outer",
      brackets: w.brackets, bracketReachFt: w.role === "followBack" ? w.inset : undefined, note: w.note, tail });
  }

  // 8. Deep insets: inner runs and turn-in spurs, as runs of their own.
  let extraIdx = n;
  for (const ins of insets) {
    if (ins.treatment === "double") {
      // the back wall(s): every inner wall long enough to stand against
      for (let k = 0; k + 1 < ins.inner.length; k++) {
        const a = base[ins.inner[k]], b = base[ins.inner[k + 1]];
        const w = makeWall(extraIdx++, a, b, base, "exterior");
        if (w.len < STAND * puf) { results.push({ ...emptyResult(w), kind: "inner", note: "inset side - too short to stand against" }); continue; }
        // a leg a foot off both side walls; a short bay is allowed, the inset bounds it
        const pos = [G_px, ...fillFixed(G_px, w.len - G_px, BAY_px, BAYS_px)];
        const legs = pos.map((d, i) => leg(w, d, G_px, W * puf, i === 0, i === pos.length - 1));
        const bays: BaySpan[] = [];
        for (let j = 1; j < pos.length; j++) {
          const lengthFt = (pos[j] - pos[j - 1]) / puf;
          bays.push({ segIndex: w.idx, lengthFt, kind: isStandard(lengthFt, BAYS) ? "braced" : "bastard" });
        }
        results.push({ segIndex: w.idx, legs, bays, a, b, normal: w.normal, kind: "inner",
          note: `double run - inner run on the back face, ${fmt(ins.depthFt)} deep` });
      }
    }
    if (ins.treatment === "turnin") {
      // frames span the opening; the set is sized to the hole
      const mouthClear = ins.mouthFt - 2 * G;
      const width = Math.max(...WIDTHS.filter(f => f <= mouthClear + 1e-6), 0);
      const A = base[ins.from], B = base[ins.to];
      const inward = (() => {
        const cx = B.x - A.x, cy = B.y - A.y, l = Math.hypot(cx, cy) || 1;
        let px = -cy / l, py = cx / l;
        const back = base[ins.inner[0]];
        if ((back.x - A.x) * px + (back.y - A.y) * py < 0) { px = -px; py = -py; }
        return { x: px, y: py };
      })();
      const across = { x: (B.x - A.x) / (ins.mouthFt * puf), y: (B.y - A.y) / (ins.mouthFt * puf) };
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      const depthPx = ins.depthFt * puf;
      // a foot in from the mouth, a foot off the back, 10s between, short bay at the back
      const stations = width > 0 ? [G_px, ...fillFixed(G_px, depthPx - G_px, BAY_px, BAYS_px)] : [];
      const half = (width * puf) / 2;
      const legs: LegResult[] = stations.map((d, i) => {
        const c = { x: mid.x + inward.x * d, y: mid.y + inward.y * d };
        const p1 = { x: c.x - across.x * half, y: c.y - across.y * half };
        const p2 = { x: c.x + across.x * half, y: c.y + across.y * half };
        return { wallPoint: p1, tickTip: p2, labelPoint: { x: c.x + inward.x * puf, y: c.y + inward.y * puf },
          isTurnaroundMirror: false, isStartLeg: i === 0, isEndLeg: i === stations.length - 1 };
      });
      const bays: BaySpan[] = [];
      for (let j = 1; j < stations.length; j++) {
        const lengthFt = (stations[j] - stations[j - 1]) / puf;
        bays.push({ segIndex: extraIdx, lengthFt, kind: isStandard(lengthFt, BAYS) ? "braced" : "bastard" });
      }
      results.push({ segIndex: extraIdx++, legs, bays, a: mid, b: { x: mid.x + inward.x * depthPx, y: mid.y + inward.y * depthPx },
        normal: across, kind: "spur",
        note: width > 0 ? `turn in - ${fmt(width)} frames across a ${fmt(ins.mouthFt)} opening` : `pocket too narrow for any frame the job carries` });
    }
  }
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Curves and tanks ──────────────────────────────────────────────────────────
//
// Frames are straight, so a curved wall is built as square bays - each with
// its own two frames, set square to its own chord - and the wedge between one
// bay and the next is planked across. Neighbouring frames are never closer
// than a foot at their nearest point: on the outside of a curve that is the
// wall side and the wedge opens outward; on the inside it is the far end and
// the wedge opens at the wall. Bays on a curve are 5' unless the estimator
// says otherwise, whatever the radius. A tank is the same rule round a
// circle, outside, inside or both.

export type CurveSide = "outside" | "inside";

export type CurveArc = {
  /** Centre and radius of the wall itself, px. */
  cx: number; cy: number; r: number;
  /** Start angle and signed sweep, radians. A full circle sweeps 2 pi. */
  a0: number; sweep: number;
  closed: boolean;
};

export type CurveFrame = { wallPoint: PlanPoint; tickTip: PlanPoint };
export type CurveBay = { frames: [CurveFrame, CurveFrame]; chordFt: number };
export type CurveWedge = { nearFt: number; farFt: number };

export type CurveLayout = {
  side: CurveSide;
  bays: CurveBay[];
  /** wedges[i] sits between bays[i] and bays[i + 1]; on a closed curve the last one closes the ring and takes the leftover. */
  wedges: CurveWedge[];
  /** On an open curve: what is left between the last bay and the end of the arc, measured along the leg line, ft. */
  leftoverFt: number;
  legLineRadiusFt: number;
};

/**
 * Square bays round an arc.
 *
 * The bay is a chord of the leg line. The step from one bay to the next is
 * solved so the nearest ends of neighbouring frames are exactly the clearance
 * apart - at the wall outside a curve, at the far end inside one.
 */
export function layoutCurve(arc: CurveArc, side: CurveSide, opts: {
  puf: number; bayFt: number; frameWidthFt: number; standoffFt?: number; clearanceFt?: number;
  /** Shorter standard bays the end of the curve may use, and the widest gap a plank may bridge. */
  standardBays?: number[]; maxSpanFt?: number;
}): CurveLayout {
  const { puf } = opts;
  const G = (opts.standoffFt ?? 1) * puf, W = opts.frameWidthFt * puf;
  const BAY = opts.bayFt * puf, CLEAR = (opts.clearanceFt ?? 1) * puf;
  const MAXSPAN = (opts.maxSpanFt ?? 8) * puf;
  const LADDER = (opts.standardBays ?? [4, 5, 6, 7, 8, 10]).map(b => b * puf).filter(b => b < BAY - 1e-6).sort((a, b) => b - a);
  const outside = side === "outside";
  const Rl = outside ? arc.r + G : arc.r - G;              // the leg line
  const empty: CurveLayout = { side, bays: [], wedges: [], leftoverFt: 0, legLineRadiusFt: Math.max(0, Rl) / puf };
  if (Rl <= BAY / 2 + 1e-6 || arc.r <= 0) return empty;    // too tight to stand a bay in
  const dir = Math.sign(arc.sweep) || 1;
  const thetaOf = (chord: number) => 2 * Math.asin(Math.min(1, chord / (2 * Rl)));
  const thetaBay = thetaOf(BAY);
  const bayAt = (a: number, chord = BAY): CurveBay => {
    const a1 = a + dir * thetaOf(chord);
    const p0 = { x: arc.cx + Rl * Math.cos(a), y: arc.cy + Rl * Math.sin(a) };
    const p1 = { x: arc.cx + Rl * Math.cos(a1), y: arc.cy + Rl * Math.sin(a1) };
    const mx = (p0.x + p1.x) / 2 - arc.cx, my = (p0.y + p1.y) / 2 - arc.cy, l = Math.hypot(mx, my) || 1;
    const n = outside ? { x: mx / l, y: my / l } : { x: -mx / l, y: -my / l };
    const q0 = { x: p0.x + n.x * W, y: p0.y + n.y * W }, q1 = { x: p1.x + n.x * W, y: p1.y + n.y * W };
    return { frames: [{ wallPoint: p0, tickTip: q0 }, { wallPoint: p1, tickTip: q1 }], chordFt: chord / puf };
  };
  const d = (p: PlanPoint, q: PlanPoint) => Math.hypot(p.x - q.x, p.y - q.y);
  const gaps = (b0: CurveBay, b1: CurveBay) => ({
    wall: d(b0.frames[1].wallPoint, b1.frames[0].wallPoint),
    far: d(b0.frames[1].tickTip, b1.frames[0].tickTip),
  });
  // the step from a bay to the next one that puts exactly CLEAR between their frames at the nearest point
  const stepTo = (fromChord: number, toChord: number) => {
    let lo = thetaOf(fromChord), hi = thetaOf(fromChord) + Math.PI / 2;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const g = gaps(bayAt(0, fromChord), bayAt(dir * mid, toChord));
      if (Math.min(g.wall, g.far) < CLEAR) lo = mid; else hi = mid;
    }
    return hi;
  };
  const step = stepTo(BAY, BAY);
  const sweep = Math.abs(arc.sweep);
  let n: number;
  if (arc.closed) n = Math.floor(2 * Math.PI / step);
  else n = sweep + 1e-9 >= thetaBay ? Math.floor((sweep - thetaBay) / step) + 1 : 0;
  if (n <= 0) return empty;
  const bays: CurveBay[] = [];
  for (let k = 0; k < n; k++) bays.push(bayAt(arc.a0 + dir * k * step));
  // What is left at the end must still be plankable. If the closing gap would
  // be wider than a plank can bridge, a shorter standard bay goes in first -
  // longest that fits - the way a leftover on a straight run gets a leg.
  const lastStart = () => arc.a0 + dir * (n - 1) * step;
  const closingWidth = (last: CurveBay) => {
    if (arc.closed) { const g = gaps(last, bays[0]); return Math.max(g.wall, g.far); }
    const used = Math.abs((Math.atan2(last.frames[1].wallPoint.y - arc.cy, last.frames[1].wallPoint.x - arc.cx) - arc.a0));
    const usedAngle = ((used % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return (sweep - usedAngle) * Rl + CLEAR;
  };
  if (closingWidth(bays[bays.length - 1]) > MAXSPAN + 1e-6) {
    for (const b of LADDER) {
      const at = lastStart() + dir * stepTo(BAY, b);
      const endAngle = at + dir * thetaOf(b);
      const fits = arc.closed
        ? gaps(bayAt(at, b), bays[0]).wall >= CLEAR - 1e-6 && gaps(bayAt(at, b), bays[0]).far >= CLEAR - 1e-6 && Math.abs(endAngle - arc.a0) <= 2 * Math.PI
        : Math.abs(endAngle - arc.a0) <= sweep + 1e-9;
      if (!fits) continue;
      const extra = bayAt(at, b);
      if (closingWidth(extra) <= MAXSPAN + 1e-6) { bays.push(extra); break; }
    }
  }
  const wedges: CurveWedge[] = [];
  for (let k = 0; k + 1 < bays.length; k++) {
    const g = gaps(bays[k], bays[k + 1]);
    wedges.push({ nearFt: Math.min(g.wall, g.far) / puf, farFt: Math.max(g.wall, g.far) / puf });
  }
  let leftoverFt = 0;
  if (arc.closed) {
    const g = gaps(bays[bays.length - 1], bays[0]);
    wedges.push({ nearFt: Math.min(g.wall, g.far) / puf, farFt: Math.max(g.wall, g.far) / puf });
  } else {
    const lastEnd = bays[bays.length - 1].frames[1].wallPoint;
    let used = Math.abs(Math.atan2(lastEnd.y - arc.cy, lastEnd.x - arc.cx) - arc.a0);
    used = ((used % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    leftoverFt = Math.max(0, (sweep - used) * Rl) / puf;
  }
  return { side, bays, wedges, leftoverFt, legLineRadiusFt: Rl / puf };
}

/** A curve layout as a run: two legs a bay, bays and wedges alternating, the closing wedge as the tail on a ring. */
function curveRunFromLayout(
  segIndex: number, arc: CurveArc, layout: CurveLayout, puf: number, W: number, BAYS: number[], bayFt: number,
  a: PlanPoint, b: PlanPoint, normal: PlanPoint,
): SegmentLegs {
  const legs: LegResult[] = [];
  const bays: BaySpan[] = [];
  const asLeg = (f: CurveFrame, start: boolean, end: boolean): LegResult => {
    const dx = f.tickTip.x - f.wallPoint.x, dy = f.tickTip.y - f.wallPoint.y, l = Math.hypot(dx, dy) || 1;
    return {
      wallPoint: f.wallPoint, tickTip: f.tickTip,
      labelPoint: { x: f.tickTip.x + (dx / l) * puf, y: f.tickTip.y + (dy / l) * puf },
      isTurnaroundMirror: false, isStartLeg: start, isEndLeg: end,
    };
  };
  layout.bays.forEach((bay, k) => {
    legs.push(asLeg(bay.frames[0], k === 0, false));
    legs.push(asLeg(bay.frames[1], false, k === layout.bays.length - 1 && !arc.closed));
    bays.push({ segIndex, lengthFt: bay.chordFt, kind: isStandard(bay.chordFt, BAYS) ? "braced" : "bastard" });
    if (k + 1 < layout.bays.length) {
      const wedge = layout.wedges[k];
      bays.push({ segIndex, lengthFt: wedge.farFt, kind: "rail" });
    }
  });
  const run: SegmentLegs = {
    segIndex, legs, bays, a, b, normal, kind: "curve",
    curve: {
      radiusFt: arc.r / puf, sweepDeg: Math.abs(arc.sweep) * 180 / Math.PI, side: layout.side, bayFt,
      closed: arc.closed, wedges: layout.wedges.length, leftoverFt: layout.leftoverFt,
    },
    note: `${arc.closed ? "tank" : "curve"}, ${fmt(arc.r / puf)} radius - ${layout.bays.length} square ${fmt(bayFt)} bays, ${layout.side}, wedges planked`,
  };
  if (arc.closed && layout.bays.length > 1) {
    // the ring closes on itself: the last wedge, leftover and all, is the tail
    const last = legs[legs.length - 1], first = legs[0];
    const wedge = layout.wedges[layout.wedges.length - 1];
    run.tail = { a0: last.wallPoint, a1: last.tickTip, b0: first.wallPoint, b1: first.tickTip, isBay: false, beside: false, lengthFt: wedge.farFt, kind: wedge.farFt <= 8 + 1e-6 ? "rail" : "bastard" };
  }
  void W;
  return run;
}

/** A tank side: the whole ring, laid and returned as one run. */
function curveRun(
  segIndex: number, c: DetectedCurve, side: CurveSide,
  opts: { puf: number; bayFt: number; frameWidthFt: number; standoffFt: number; clearanceFt: number; standardBays: number[]; maxSpanFt: number }, BAYS: number[],
): SegmentLegs {
  const layout = layoutCurve(c.arc, side, opts);
  const normal = { x: side === "outside" ? 1 : -1, y: 0 };
  return curveRunFromLayout(segIndex, c.arc, layout, opts.puf, opts.frameWidthFt, BAYS, opts.bayFt, c.start, c.end, normal);
}

/** Least-squares circle through a run of points (Kasa fit). */
function fitCircle(pts: PlanPoint[]): { cx: number; cy: number; r: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  const mx = sx / n, my = sy / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.y - my;
    suu += u * u; suv += u * v; svv += v * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det, vc = (b2 * suu - b1 * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { cx: mx + uc, cy: my + vc, r };
}

export type DetectedCurve = {
  /** Indices into the outline it was read from: the stretch runs from `from` to `to` inclusive, wrapping. */
  from: number; to: number;
  arc: CurveArc;
  /** The chord, start to end, for a closed curve the same point. */
  start: PlanPoint; end: PlanPoint;
};

/**
 * Finds the curved stretches of an outline: three or more vertices in a row
 * that each turn gently the same way. A traced curve is a string of short
 * clicks; a highlighter stroke round a bend is the same thing; a tank is a
 * ring of them. A chamfer or a single angled wall is not a curve.
 */
export function detectCurves(pts: PlanPoint[], opts?: { maxTurnDeg?: number; minTurnDeg?: number; minBends?: number; open?: boolean }): DetectedCurve[] {
  const n = pts.length;
  if (n < 4) return [];
  const open = !!opts?.open;
  const MAX = ((opts?.maxTurnDeg ?? 35) * Math.PI) / 180, MIN = ((opts?.minTurnDeg ?? 1) * Math.PI) / 180;
  const MIN_BENDS = opts?.minBends ?? 3;
  const turn = (i: number) => {
    const p = pts[(i - 1 + n) % n], v = pts[i], q = pts[(i + 1) % n];
    const ax = v.x - p.x, ay = v.y - p.y, bx = q.x - v.x, by = q.y - v.y;
    return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  };
  const turns = pts.map((_, i) => (open && (i === 0 || i === n - 1) ? 0 : turn(i)));
  const bend = turns.map(t => Math.abs(t) >= MIN && Math.abs(t) <= MAX ? Math.sign(t) : 0);
  if (bend.every(b => b !== 0 && b === bend[0])) {
    const fit = fitCircle(pts);
    if (!fit) return [];
    const a0 = Math.atan2(pts[0].y - fit.cy, pts[0].x - fit.cx);
    return [{ from: 0, to: n - 1, arc: { ...fit, a0, sweep: bend[0] * 2 * Math.PI, closed: true }, start: pts[0], end: pts[0] }];
  }
  // start scanning at a vertex that is not a bend, so no stretch is split by the wrap
  let s0 = bend.findIndex(b => b === 0);
  if (s0 < 0) s0 = 0;
  const out: DetectedCurve[] = [];
  let i = 0;
  while (i < n) {
    const idx = (s0 + i) % n;
    if (bend[idx] === 0) { i++; continue; }
    const sign = bend[idx];
    let j = i;
    while (j + 1 < n && bend[(s0 + j + 1) % n] === sign) j++;
    const count = j - i + 1;
    if (count >= MIN_BENDS) {
      const run: number[] = [];
      for (let k = i; k <= j; k++) run.push((s0 + k) % n);
      const fit = fitCircle(run.map(k => pts[k]));
      if (fit && fit.r > 0) {
        const start = pts[run[0]], end = pts[run[run.length - 1]];
        const a0 = Math.atan2(start.y - fit.cy, start.x - fit.cx);
        let sweep = 0;
        for (const k of run) sweep += turns[k];
        // the stretch's turning is the arc's sweep less the half bends at its ends, near enough; take it from the chord instead
        const a1 = Math.atan2(end.y - fit.cy, end.x - fit.cx);
        let delta = a1 - a0;
        while (delta * sign < 0) delta += sign * 2 * Math.PI;
        while (Math.abs(delta) > 2 * Math.PI) delta -= sign * 2 * Math.PI;
        sweep = delta;
        out.push({ from: run[0], to: run[run.length - 1], arc: { ...fit, a0, sweep, closed: false }, start, end });
      }
    }
    i = j + 1;
  }
  return out;
}

// ── Strokes and drawn runs ────────────────────────────────────────────────────
//
// Highlighter strokes and hand-drawn runs are lines of building with no
// outline behind them. Where their ends meet they are one scaffold turning a
// corner, and that scaffold is set out by the same engine as a traced plan:
// strokes that close on themselves are a building; strokes that meet but do
// not close are an open chain with a leg at each free end. A stroke that meets
// nothing is left to the caller.

export type RunStroke = { id: string; a: PlanPoint; b: PlanPoint; sitsInterior?: boolean };

export type RunChain = {
  /** The corners, in stroke order. On an open chain the first and last are the free ends. */
  points: PlanPoint[];
  open: boolean;
  /** The stroke each wall came from, by wall index in `points`. */
  runIds: string[];
  interiorWalls: number[];
};

/** Where two strokes meet: where their lines cross, or between their ends if they run the same way. */
function cornerOf(r1: RunStroke, r2: RunStroke, end1: PlanPoint, start2: PlanPoint): PlanPoint {
  const d1 = { x: r1.b.x - r1.a.x, y: r1.b.y - r1.a.y }, d2 = { x: r2.b.x - r2.a.x, y: r2.b.y - r2.a.y };
  const cross = d1.x * d2.y - d1.y * d2.x;
  const l1 = Math.hypot(d1.x, d1.y), l2 = Math.hypot(d2.x, d2.y);
  if (l1 < 1e-6 || l2 < 1e-6 || Math.abs(cross) / (l1 * l2) < 0.1) {
    return { x: (end1.x + start2.x) / 2, y: (end1.y + start2.y) / 2 };
  }
  const t = ((r2.a.x - r1.a.x) * d2.y - (r2.a.y - r1.a.y) * d2.x) / cross;
  return { x: r1.a.x + d1.x * t, y: r1.a.y + d1.y * t };
}

/**
 * Chains strokes whose ends meet. Two ends within joinPx of each other are the
 * same corner - the strokes were drawn by hand and stop short or overshoot.
 */
export function chainRuns(runs: RunStroke[], joinPx: number): { chains: RunChain[]; singles: RunStroke[] } {
  type End = { run: number; end: "a" | "b"; p: PlanPoint };
  const ends: End[] = runs.flatMap((r, i) => [{ run: i, end: "a" as const, p: r.a }, { run: i, end: "b" as const, p: r.b }]);
  // each end links to the nearest other stroke's end inside the join distance
  const link = new Map<string, End>();
  const keyOf = (e: End) => `${e.run}${e.end}`;
  for (const e of ends) {
    let best: End | undefined, bestD = joinPx;
    for (const o of ends) {
      if (o.run === e.run) continue;
      const d = Math.hypot(o.p.x - e.p.x, o.p.y - e.p.y);
      if (d <= bestD) { best = o; bestD = d; }
    }
    if (best) link.set(keyOf(e), best);
  }
  const used = new Array<boolean>(runs.length).fill(false);
  const chains: RunChain[] = [];
  const singles: RunStroke[] = [];

  for (let start = 0; start < runs.length; start++) {
    if (used[start]) continue;
    // walk forward from this stroke's b, then backward from its a
    const walk = (from: number, fromEnd: "a" | "b"): { run: number; flipped: boolean }[] => {
      const out: { run: number; flipped: boolean }[] = [];
      let cur = from, curEnd = fromEnd, guard = 0;
      while (guard++ < runs.length + 1) {
        const nxt = link.get(`${cur}${curEnd}`);
        if (!nxt || nxt.run === start || used[nxt.run]) break;
        used[nxt.run] = true;
        // arriving at nxt.end: the stroke runs on from its other end
        const flipped = nxt.end === "b";
        out.push({ run: nxt.run, flipped });
        cur = nxt.run; curEnd = flipped ? "a" : "b";
      }
      return out;
    };
    used[start] = true;
    const forward = walk(start, "b");
    const lastEnd = forward.length ? (forward[forward.length - 1].flipped ? "a" : "b") : "b";
    const lastRun = forward.length ? forward[forward.length - 1].run : start;
    const closes = link.get(`${lastRun}${lastEnd}`)?.run === start && link.get(`${start}a`)?.run === lastRun;
    const backward = closes ? [] : walk(start, "a");
    const order: { run: number; flipped: boolean }[] = [
      ...backward.reverse().map(s => ({ run: s.run, flipped: !s.flipped })),
      { run: start, flipped: false },
      ...forward,
    ];
    if (order.length < 2) { used[start] = true; singles.push(runs[start]); continue; }
    const oriented: RunStroke[] = order.map(s => {
      const r = runs[s.run];
      return s.flipped ? { ...r, a: r.b, b: r.a } : r;
    });
    const points: PlanPoint[] = [];
    if (!closes) points.push(oriented[0].a);
    for (let i = 0; i + 1 < oriented.length; i++) points.push(cornerOf(oriented[i], oriented[i + 1], oriented[i].b, oriented[i + 1].a));
    if (closes) {
      const last = oriented[oriented.length - 1], first = oriented[0];
      points.unshift(cornerOf(last, first, last.b, first.a));
    } else {
      points.push(oriented[oriented.length - 1].b);
    }
    chains.push({
      points,
      open: !closes,
      runIds: oriented.map(r => r.id),
      interiorWalls: oriented.map((r, i) => (r.sitsInterior ? i : -1)).filter(i => i >= 0),
    });
  }
  return { chains, singles };
}

/** A run of legs on a drawn stroke, and which stroke it belongs to. */
export type RunSegmentLegs = SegmentLegs & { runId?: string };

/**
 * Sets out drawn strokes with the engine: every chain of strokes that meet is
 * one building (closed) or one open chain, laid out by the same rules as a
 * traced plan. Walls are numbered from 1000 so they never collide with the
 * traced outline's, and each carries the id of the stroke it came from.
 * Strokes that meet nothing come back in `singles` for the caller.
 */
export function setOutRuns(runs: RunStroke[], opts: SetOutOptions, joinPx: number): { segments: RunSegmentLegs[]; singles: RunStroke[] } {
  const { chains, singles } = chainRuns(runs, joinPx);
  const segments: RunSegmentLegs[] = [];
  chains.forEach((chain, ci) => {
    const laid = setOut(chain.points, { ...opts, open: chain.open, interiorWalls: chain.interiorWalls });
    const strokes = runs.filter(r => chain.runIds.includes(r.id));
    for (const seg of laid) {
      // the engine may have reversed or merged walls: find the stroke this one lies on
      const m = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
      let best: RunStroke | undefined, bestD = Infinity;
      for (const r of strokes) { const d = frameGap(m, m, r.a, r.b); if (d < bestD) { best = r; bestD = d; } }
      segments.push({ ...seg, segIndex: 1000 + ci * 100 + seg.segIndex, runId: best?.id });
    }
  });
  return { segments, singles };
}

function legPoint(w: Wall, d: number, gPx: number): PlanPoint {
  return { x: w.a.x + w.along.x * d + w.normal.x * gPx, y: w.a.y + w.along.y * d + w.normal.y * gPx };
}

function leg(w: Wall, d: number, gPx: number, wPx: number, isStart: boolean, isEnd: boolean): LegResult {
  const b = { x: w.a.x + w.along.x * d, y: w.a.y + w.along.y * d };
  return {
    wallPoint: { x: b.x + w.normal.x * gPx, y: b.y + w.normal.y * gPx },
    tickTip: { x: b.x + w.normal.x * (gPx + wPx), y: b.y + w.normal.y * (gPx + wPx) },
    labelPoint: { x: b.x + w.normal.x * (gPx + wPx + gPx * 1.4), y: b.y + w.normal.y * (gPx + wPx + gPx * 1.4) },
    isTurnaroundMirror: false, isStartLeg: isStart, isEndLeg: isEnd,
  };
}

function emptyResult(w: Wall): SegmentLegs {
  return { segIndex: w.idx, legs: [], bays: [], a: w.a, b: w.b, normal: w.normal, kind: "outer", skipped: true, note: w.note };
}

function fmt(ft: number): string {
  const f = Math.floor(ft + 1e-9), i = Math.round((ft - f) * 12);
  return i === 0 ? `${f}'` : i === 12 ? `${f + 1}'` : `${f}'-${i}"`;
}
