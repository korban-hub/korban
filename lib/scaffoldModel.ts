/*
 * The scaffold in the air.
 *
 * The plan sets the legs and bays out (lib/scaffoldSetOut). This turns that
 * set-out into the pieces a foreman would see standing in front of the job:
 * every post, ledger, brace, plank, rail, jack, bracket, hatch board and
 * ladder, each one placed in feet, y up. The 3D view draws the list; nothing
 * in here knows about three.js, so the same list can be drawn anywhere and
 * checked by hand.
 *
 * What is drawn follows the estimator's rules, not the other way round:
 *
 *   - A leg is a stack of frames (6'-4"s at the bottom, the 5' or 3' on top),
 *     standing on a base plate and screw jack. Each frame is two posts, a top
 *     ledger and the mid bar the braces lock to.
 *   - A braced bay gets a cross brace on each face at every lift. A bastard
 *     bay gets a rail on each face instead. A planked gap (a wedge on a curve,
 *     a deck run straight on to the next corner) gets planks and rails only.
 *   - Every lift is planked: 3, 4 or 6 planks across by frame width, running
 *     along the bay.
 *   - The top lift carries a top rail and a mid rail on both faces - two
 *     outer, two inner - but only where there is nothing to walk onto beyond
 *     that edge. Where another deck adjoins (the corner deck the next run
 *     turns onto, two runs meeting at an inside corner, a bracket deck) that
 *     stretch of rail is left out. A frame where the deck carries on through
 *     gets nothing across it - people walk through; a frame where the deck
 *     stops and there is nothing beyond gets an end rail, top and mid.
 *   - Brackets on an inset wall hook off the wall-side post at every lift and
 *     reach in to a foot off the inset wall, decked.
 *   - A turnaround frame is a frame like any other.
 *   - Ladder hatch bays: one 10' bay per 100' of run (or one per elevation).
 *     At every lift one steel hatch deck covers the whole bay in place of the
 *     planks, with the opening in the middle; the ladder leans up from one end
 *     of the deck below to that opening, the foot alternating ends lift by
 *     lift so the climb zig-zags.
 */

import type { BaySpan, LegResult, PlanPoint, SegmentLegs } from "@/lib/scaffoldSetOut";

export type Vec3 = { x: number; y: number; z: number };

export type PartKind =
  | "post" | "ledger" | "brace" | "rail" | "plank" | "jack" | "plate"
  | "bracket" | "bracketPlank" | "hatchBoard" | "hatchDoor" | "ladder" | "guardPost" | "netting" | "canopy";

export type Piece =
  /** A round tube from a to b. */
  | { kind: "tube"; a: Vec3; b: Vec3; r: number; part: PartKind }
  /** A box: centre c, len along the yaw direction (radians about y), wid across, thick up. */
  | { kind: "box"; c: Vec3; len: number; wid: number; thick: number; yaw: number; part: PartKind }
  /** A flat deck of any shape, four corners in order, at one height. */
  | { kind: "quad"; p: [Vec3, Vec3, Vec3, Vec3]; part: PartKind };

export type WallPiece = { a: PlanPoint; b: PlanPoint; heightFt: number };

/** One leg's stack, bottom to top, in feet; the jack it stands on, in inches. */
export type LegStack = { frames: number[]; jackIn: number };

export type HatchBay = { segIndex: number; bayIndex: number };

export type ModelInput = {
  runs: SegmentLegs[];
  /** Plan pixels per foot. */
  puf: number;
  frameWidthFt: number;
  planksPerLift: number;
  stackFor: (segIndex: number, legIndex: number) => LegStack;
  hatchBays?: HatchBay[];
  /** The building: each wall at its own height. */
  walls?: WallPiece[];
  /** Plan origin to centre on, px. Defaults to the middle of the legs. */
  origin?: PlanPoint;
  /**
   * Debris netting on the outer face, from the ground to the top of the
   * scaffold plus this much. Left out when the job has no netting add.
   */
  netting?: { addedHeightFt: number } | null;
  /**
   * Bays a pedestrian tunnel runs under. Every leg those bays touch stands
   * on a canopy frame in place of its bottom frame: wider, to span the
   * walkway, and taller, to clear a person. The stack handed back by
   * stackFor for such a leg must already start with the canopy's height.
   */
  tunnelBays?: { segIndex: number; bayIndex: number }[];
  /**
   * The canopy frame, measured from the wall-side leg: 6' wide, so on a 3'
   * scaffold it hangs 3' past the outer leg toward the street, and 7'-6"
   * tall. The scaffold above sits on saddle pins on its top ledger.
   */
  canopy?: { widthFt: number; planksPerBay: number };
};

export type ScaffoldModel = {
  pieces: Piece[];
  walls: { a: { x: number; z: number }; b: { x: number; z: number }; heightFt: number }[];
  /** Feet; y up. */
  bounds: { min: Vec3; max: Vec3 };
  counts: { posts: number; braces: number; planks: number; rails: number; endRails: number; brackets: number; hatchBoards: number; ladders: number; canopyFrames: number; canopyBays: number };
};

const POST_R = 0.08;      // 1.9" tube
const LEDGER_R = 0.06;
const BRACE_R = 0.045;
const RAIL_R = 0.06;
const PLANK_T = 0.125;    // 1.5"
const PLANK_OVERHANG = 0.3; // a plank laps the ledger either end
const GUARD_H = 3.5;      // top rail 42" above the deck
const MID_H = 1.75;
const DECK_T = 0.15;      // a steel hatch deck
const HATCH_OPEN_L = 2.5; // the opening, along the bay
const HATCH_OPEN_W = 1.8; // and across it
const LADDER_W = 1.5;

/** Pick the one bay per stretch that takes the ladder hatch. */
export function pickHatchBays(
  runs: SegmentLegs[],
  opts: { mode: "per100" | "perElevation"; everyFt?: number; bayFt: number },
): HatchBay[] {
  const everyFt = opts.everyFt ?? 100;
  type Cand = { segIndex: number; bayIndex: number; lengthFt: number; at: number; mid: number };
  const cands: Cand[] = [];
  let at = 0;
  const runsInOrder = runs.filter(r => !r.skipped && r.legs.length > 0);
  const perRun: Cand[][] = [];
  for (const run of runsInOrder) {
    const mine: Cand[] = [];
    if (run.lead) at += run.lead.lengthFt;
    run.bays.forEach((bay, i) => {
      if (bay.kind === "braced" && i < run.legs.length - 1) {
        mine.push({ segIndex: run.segIndex, bayIndex: i, lengthFt: bay.lengthFt, at, mid: at + bay.lengthFt / 2 });
      }
      at += bay.lengthFt;
    });
    if (run.tail) at += run.tail.lengthFt;
    perRun.push(mine);
    cands.push(...mine);
  }
  const total = at;
  if (cands.length === 0) return [];
  // The standard bay first (a 10' on a 10' job); failing that the longest.
  const best = (list: Cand[], target: number) => {
    const std = list.filter(c => Math.abs(c.lengthFt - opts.bayFt) < 0.05);
    const pool = std.length ? std : list.filter(c => c.lengthFt >= Math.max(...list.map(x => x.lengthFt)) - 0.05);
    return pool.reduce((b, c) => (Math.abs(c.mid - target) < Math.abs(b.mid - target) ? c : b), pool[0]);
  };
  const out: HatchBay[] = [];
  if (opts.mode === "perElevation") {
    for (const list of perRun) {
      if (!list.length) continue;
      const lo = list[0].at, hi = list[list.length - 1].at + list[list.length - 1].lengthFt;
      const c = best(list, (lo + hi) / 2);
      out.push({ segIndex: c.segIndex, bayIndex: c.bayIndex });
    }
    return out;
  }
  // One per 100' of run, spread evenly: a 280' job gets three, a third of the way apart.
  const n = Math.max(1, Math.ceil(total / everyFt));
  const step = total / n;
  const taken = new Set<string>();
  for (let k = 0; k < n; k++) {
    const target = (k + 0.5) * step;
    const list = cands.filter(c => !taken.has(`${c.segIndex}-${c.bayIndex}`));
    if (!list.length) break;
    const c = best(list, target);
    taken.add(`${c.segIndex}-${c.bayIndex}`);
    out.push({ segIndex: c.segIndex, bayIndex: c.bayIndex });
  }
  return out;
}

/** Hatch board part by bay length - the catalog's SB7 / SB8 / SB10. */
export function hatchBoardPart(bayLengthFt: number): string {
  return bayLengthFt >= 10 ? "SB10" : bayLengthFt >= 8 ? "SB8" : "SB7";
}

export function buildScaffoldModel(input: ModelInput): ScaffoldModel {
  const { puf, frameWidthFt: W, planksPerLift: ppb } = input;
  const runs = input.runs.filter(r => !r.skipped && r.legs.length > 0);
  const pieces: Piece[] = [];
  const counts = { posts: 0, braces: 0, planks: 0, rails: 0, endRails: 0, brackets: 0, hatchBoards: 0, ladders: 0, canopyFrames: 0, canopyBays: 0 };

  // Plan px -> feet, centred.
  const legPts = runs.flatMap(r => r.legs.flatMap(l => [l.wallPoint, l.tickTip]));
  const wallPts = (input.walls ?? []).flatMap(w => [w.a, w.b]);
  const all = legPts.length ? legPts : wallPts;
  const origin = input.origin ?? (all.length
    ? { x: all.reduce((t, p) => t + p.x, 0) / all.length, y: all.reduce((t, p) => t + p.y, 0) / all.length }
    : { x: 0, y: 0 });
  const F = (p: PlanPoint, y: number): Vec3 => ({ x: (p.x - origin.x) / puf, y, z: (p.y - origin.y) / puf });
  const ftLen = (p: PlanPoint, q: PlanPoint) => Math.hypot(q.x - p.x, q.y - p.y) / puf;
  const hatchKey = new Set((input.hatchBays ?? []).map(h => `${h.segIndex}-${h.bayIndex}`));
  /*
   * The tunnel: the bays it runs under, and the legs those bays touch. A leg
   * is a tunnel leg if either bay beside it is under the tunnel - the canopy
   * frame carries the bay, so both its legs stand on one.
   */
  const tunnelKey = new Set((input.tunnelBays ?? []).map(t => `${t.segIndex}-${t.bayIndex}`));
  const tunnelLegKey = new Set<string>();
  for (const t of input.tunnelBays ?? []) {
    tunnelLegKey.add(`${t.segIndex}-${t.bayIndex}`);
    tunnelLegKey.add(`${t.segIndex}-${t.bayIndex + 1}`);
  }
  const CANOPY_W = input.canopy?.widthFt ?? 6;
  const CANOPY_PLANKS = input.canopy?.planksPerBay ?? 8;
  /** The canopy's outer post: a canopy width off the wall leg, past the scaffold's own. */
  const canopyOuter = (leg: LegResult): PlanPoint => ({
    x: leg.wallPoint.x + (leg.tickTip.x - leg.wallPoint.x) * (CANOPY_W / W),
    y: leg.wallPoint.y + (leg.tickTip.y - leg.wallPoint.y) * (CANOPY_W / W),
  });

  /** Every deck on a top lift, in plan px, with its height - what a rail must not fence off. */
  const topDecks: { poly: PlanPoint[]; y: number }[] = [];
  /** Top-lift rails, drawn last, once every deck is known. */
  const guardRails: { a: PlanPoint; b: PlanPoint; yA: number; yB: number; probe: PlanPoint; own: PlanPoint[] }[] = [];
  const inside = (pt: PlanPoint, poly: PlanPoint[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  const tube = (a: Vec3, b: Vec3, r: number, part: PartKind) => { pieces.push({ kind: "tube", a, b, r, part }); };
  const box = (c: Vec3, len: number, wid: number, thick: number, yaw: number, part: PartKind) => { pieces.push({ kind: "box", c, len, wid, thick, yaw, part }); };
  const quad = (p: [Vec3, Vec3, Vec3, Vec3], part: PartKind) => { pieces.push({ kind: "quad", p, part }); };

  /** Lift tops for a stack: y of each deck, bottom to top, and the ground the stack starts from. */
  const liftTops = (s: LegStack) => {
    const tops: number[] = [];
    let y = s.jackIn / 12;
    for (const h of s.frames) { y += h; tops.push(y); }
    return tops;
  };

  /**
   * A frame leg: plate, jack, posts, ledgers.
   *
   * On a tunnel leg the bottom frame is the canopy: its outer post stands a
   * canopy width off the wall leg - past the scaffold's own line, out toward
   * the street - and the scaffold above starts on its top ledger, on saddle
   * pins, so nothing but the canopy's two posts reaches the ground.
   */
  const drawLeg = (leg: LegResult, s: LegStack, canopy = false) => {
    const w0 = F(leg.wallPoint, 0), t0 = F(leg.tickTip, 0);
    const c0 = canopy ? F(canopyOuter(leg), 0) : t0;
    const yaw = Math.atan2(-(t0.z - w0.z), t0.x - w0.x);
    for (const p of [w0, c0]) {
      box({ x: p.x, y: 0.02, z: p.z }, 0.5, 0.5, 0.04, yaw, "plate");
      const j = s.jackIn / 12;
      if (j > 0.02) tube({ x: p.x, y: 0.04, z: p.z }, { x: p.x, y: j, z: p.z }, POST_R * 0.8, "jack");
    }
    let y = s.jackIn / 12;
    s.frames.forEach((h, fi) => {
      const isCanopy = canopy && fi === 0;
      const outer = isCanopy ? c0 : t0;
      const part: PartKind = isCanopy ? "canopy" : "post";
      tube({ x: w0.x, y, z: w0.z }, { x: w0.x, y: y + h, z: w0.z }, POST_R, part);
      tube({ x: outer.x, y, z: outer.z }, { x: outer.x, y: y + h, z: outer.z }, POST_R, part);
      counts.posts += 2;
      if (isCanopy) counts.canopyFrames += 1;
      tube({ x: w0.x, y: y + h, z: w0.z }, { x: outer.x, y: y + h, z: outer.z }, LEDGER_R, isCanopy ? "canopy" : "ledger");
      tube({ x: w0.x, y: y + h * 0.62, z: w0.z }, { x: outer.x, y: y + h * 0.62, z: outer.z }, LEDGER_R * 0.8, isCanopy ? "canopy" : "ledger");
      y += h;
    });
    // Guardrail posts in the top frame's sockets, both sides.
    if (s.frames.length) {
      tube({ x: t0.x, y, z: t0.z }, { x: t0.x, y: y + GUARD_H, z: t0.z }, POST_R * 0.85, "guardPost");
      tube({ x: w0.x, y, z: w0.z }, { x: w0.x, y: y + GUARD_H, z: w0.z }, POST_R * 0.85, "guardPost");
    }
  };

  /**
   * Everything between two frames, lift by lift: braces or rails on both
   * faces, the deck, and the top guardrail on both faces. The four plan
   * points are the near frame (w1 wall side, t1 back) and the far frame
   * (w2, t2); for a lead or tail the far frame is where the deck goes to.
   */
  const drawSpan = (
    w1: PlanPoint, t1: PlanPoint, w2: PlanPoint, t2: PlanPoint,
    kind: BaySpan["kind"], stackA: LegStack, stackB: LegStack,
    opts: { hatch?: boolean; planked?: boolean; guard?: boolean; tunnel?: boolean; legA?: LegResult; legB?: LegResult } = {},
  ) => {
    const topsA = liftTops(stackA), topsB = liftTops(stackB);
    const lifts = Math.min(topsA.length, topsB.length);
    if (lifts === 0) return;
    const baseA = stackA.jackIn / 12, baseB = stackB.jackIn / 12;
    const lenFt = ftLen(w1, w2);
    const ux = (w2.x - w1.x) / (lenFt * puf || 1), uy = (w2.y - w1.y) / (lenFt * puf || 1); // unit, plan px space
    const yaw = Math.atan2(-uy, ux);
    const planked = opts.planked ?? true;
    for (let k = 0; k < lifts; k++) {
      const yA0 = k === 0 ? baseA : topsA[k - 1], yA1 = topsA[k];
      const yB0 = k === 0 ? baseB : topsB[k - 1], yB1 = topsB[k];
      /*
       * The canopy lift of a tunnel bay. The outer face is the canopy's own
       * line, three feet past the scaffold's; it is braced there and planked
       * right across, because the deck over a walkway is what keeps what the
       * crew drops off the public.
       */
      if (opts.tunnel && k === 0 && opts.legA && opts.legB) {
        const c1 = canopyOuter(opts.legA), c2 = canopyOuter(opts.legB);
        /*
         * Double pins: two crosses a side, and a rail with them. The canopy
         * lift carries the public under it, so it is tied harder than a
         * working lift - and the outer face is the canopy's own line, three
         * feet past the scaffold's.
         */
        const faces: [PlanPoint, PlanPoint, PartKind][] = [[w1, w2, "brace"], [c1, c2, "canopy"]];
        for (const [p1, p2, part] of faces) {
          const mid = (yA0 + yA1) / 2, midB = (yB0 + yB1) / 2;
          // The lower cross, pin to pin, then the upper - the frame's two sets of pins.
          tube(F(p1, yA0), F(p2, midB), BRACE_R, part); tube(F(p1, mid), F(p2, yB0), BRACE_R, part);
          tube(F(p1, mid), F(p2, yB1), BRACE_R, part); tube(F(p1, yA1), F(p2, midB), BRACE_R, part);
          // And the rail across, at the head of the lift.
          tube(F(p1, yA1 - 0.25), F(p2, yB1 - 0.25), RAIL_R, part === "canopy" ? "canopy" : "rail");
        }
        counts.braces += 4;
        counts.rails += 2;
        counts.canopyBays += 1;
        const yD = (yA1 + yB1) / 2;
        const pw = (CANOPY_W - 0.15) / CANOPY_PLANKS;
        for (let i = 0; i < CANOPY_PLANKS; i++) {
          const across = (i + 0.5) / CANOPY_PLANKS;
          const mid = {
            x: (w1.x + w2.x) / 2 + (c1.x - w1.x) * across,
            y: (w1.y + w2.y) / 2 + (c1.y - w1.y) * across,
          };
          box(F(mid, yD + PLANK_T / 2), lenFt + PLANK_OVERHANG, pw * 0.92, PLANK_T, yaw, "plank");
          counts.planks += 1;
        }
        continue;
      }
      if (kind === "braced") {
        // One X on each face.
        tube(F(t1, yA0), F(t2, yB1), BRACE_R, "brace"); tube(F(t1, yA1), F(t2, yB0), BRACE_R, "brace");
        tube(F(w1, yA0), F(w2, yB1), BRACE_R, "brace"); tube(F(w1, yA1), F(w2, yB0), BRACE_R, "brace");
        counts.braces += 2;
      } else {
        // A rail on each face ties the frames where no brace fits.
        const ym = (yA0 + yA1) / 2, ymB = (yB0 + yB1) / 2;
        tube(F(t1, ym), F(t2, ymB), RAIL_R, "rail"); tube(F(w1, ym), F(w2, ymB), RAIL_R, "rail");
        counts.rails += 2;
      }
      // The deck.
      const yD = (yA1 + yB1) / 2;
      if (planked) {
        const square = kind !== "rail" && Math.abs(ftLen(w1, t1) - W) < 0.05 && Math.abs(ftLen(w2, t2) - W) < 0.05
          && Math.abs(ftLen(t1, t2) - lenFt) < 0.1;
        if (square && opts.hatch) {
          // One steel deck covers the bay in place of the planks; the ladder comes up through its middle.
          drawHatchDeck(w1, t1, ux, uy, yaw, lenFt, yD, k % 2 === 0 ? 0 : 1);
        } else if (square) {
          const pw = (W - 0.15) / ppb;
          for (let i = 0; i < ppb; i++) {
            const across = (i + 0.5) / ppb;
            const mid = {
              x: (w1.x + w2.x) / 2 + (t1.x - w1.x) * across,
              y: (w1.y + w2.y) / 2 + (t1.y - w1.y) * across,
            };
            box(F(mid, yD + PLANK_T / 2), lenFt + PLANK_OVERHANG, pw * 0.92, PLANK_T, yaw, "plank");
            counts.planks += 1;
          }
        } else {
          // A wedge or an odd shape: one deck, a hair under the planks it may run beneath.
          const yQ = yD + PLANK_T - 0.01;
          quad([F(w1, yQ), F(w2, yQ), F(t2, yQ), F(t1, yQ)], "plank");
          counts.planks += ppb;
        }
      }
      // The ladder: from one end of the deck below (or the ground) up to the opening in the middle of this deck.
      if (opts.hatch) {
        const yFoot = k === 0 ? 0 : (topsA[k - 1] + topsB[k - 1]) / 2;
        drawLadder(w1, t1, ux, uy, lenFt, yFoot, yD, k % 2 === 0 ? 0 : 1);
      }
      // The top lift: remember the deck, and queue its rails for both faces -
      // drawn last, once every deck is known, so none runs across a walkway.
      if (k === lifts - 1) {
        const poly = [w1, w2, t2, t1];
        if (planked) topDecks.push({ poly, y: yD });
        if (opts.guard ?? true) {
          const wFt = ftLen(w1, t1) || W;
          const n = { x: (t1.x - w1.x) / (wFt * puf), y: (t1.y - w1.y) / (wFt * puf) }; // unit, wall side -> back
          guardRails.push({ a: t1, b: t2, yA: yA1, yB: yB1, probe: n, own: poly });
          guardRails.push({ a: w1, b: w2, yA: yA1, yB: yB1, probe: { x: -n.x, y: -n.y }, own: poly });
        }
      }
    }
  };

  /**
   * The hatch deck: one steel deck the size of the bay, the opening in the
   * middle, the door standing open on the side away from the ladder.
   * footEnd says which end of the bay the ladder comes up from (0 near, 1 far).
   */
  const drawHatchDeck = (w1: PlanPoint, t1: PlanPoint, ux: number, uy: number, yaw: number, lenFt: number, yD: number, footEnd: number) => {
    const at = (along: number, across: number): PlanPoint => ({
      x: w1.x + ux * puf * along + (t1.x - w1.x) * across,
      y: w1.y + uy * puf * along + (t1.y - w1.y) * across,
    });
    const yC = yD + DECK_T / 2;
    const endLen = (lenFt - HATCH_OPEN_L) / 2;
    // The two ends, full width.
    box(F(at(endLen / 2, 0.5), yC), endLen + PLANK_OVERHANG, W, DECK_T, yaw, "hatchBoard");
    box(F(at(lenFt - endLen / 2, 0.5), yC), endLen + PLANK_OVERHANG, W, DECK_T, yaw, "hatchBoard");
    // The two strips either side of the opening.
    const sideW = (W - HATCH_OPEN_W) / 2;
    box(F(at(lenFt / 2, (sideW / 2) / W), yC), HATCH_OPEN_L, sideW, DECK_T, yaw, "hatchBoard");
    box(F(at(lenFt / 2, 1 - (sideW / 2) / W), yC), HATCH_OPEN_L, sideW, DECK_T, yaw, "hatchBoard");
    // The door, hinged on the far side of the opening from the ladder, standing open.
    const sgn = footEnd === 0 ? 1 : -1;
    const hingeAlong = lenFt / 2 + sgn * HATCH_OPEN_L / 2;
    const hA = F(at(hingeAlong, 0.5 - (HATCH_OPEN_W / 2) / W), yD + DECK_T);
    const hB = F(at(hingeAlong, 0.5 + (HATCH_OPEN_W / 2) / W), yD + DECK_T);
    const lean = 0.5; // the door rests a little past vertical
    const dA = F(at(hingeAlong + sgn * lean, 0.5 - (HATCH_OPEN_W / 2) / W), yD + DECK_T + HATCH_OPEN_L * 0.95);
    const dB = F(at(hingeAlong + sgn * lean, 0.5 + (HATCH_OPEN_W / 2) / W), yD + DECK_T + HATCH_OPEN_L * 0.95);
    quad([hA, hB, dB, dA], "hatchDoor");
    counts.hatchBoards += 1;
  };

  /** The ladder leans up the bay: foot at one end of the deck below, head through the opening in the middle of this deck. */
  const drawLadder = (
    w1: PlanPoint, t1: PlanPoint,
    ux: number, uy: number, lenFt: number, yFoot: number, yHead: number, footEnd: number,
  ) => {
    const at = (along: number, across: number): PlanPoint => ({
      x: w1.x + ux * puf * along + (t1.x - w1.x) * across,
      y: w1.y + uy * puf * along + (t1.y - w1.y) * across,
    });
    const footAlong = footEnd === 0 ? 1.0 : lenFt - 1.0;
    const headAlong = lenFt / 2;
    const dAcross = (LADDER_W / 2) / Math.max(W, 0.1);
    for (const sgn of [-1, 1]) {
      const a = F(at(footAlong, 0.5 + sgn * dAcross), yFoot + 0.05);
      const b = F(at(headAlong, 0.5 + sgn * dAcross), yHead + 1.0);
      tube(a, b, 0.05, "ladder");
    }
    const rise = yHead + 1.0 - yFoot, run = Math.abs(headAlong - footAlong);
    const rungs = Math.max(1, Math.floor(Math.hypot(rise, run) / 1.0));
    for (let i = 1; i <= rungs; i++) {
      const t = i / (rungs + 1);
      const along = footAlong + (headAlong - footAlong) * t, y = yFoot + 0.05 + rise * t;
      tube(F(at(along, 0.5 - dAcross), y), F(at(along, 0.5 + dAcross), y), 0.035, "ladder");
    }
    counts.ladders += 1;
  };

  /** Brackets off the wall-side post, reaching in toward the inset wall, decked between legs. */
  const drawBrackets = (run: SegmentLegs, reach: number) => {
    const n = run.normal;
    const inPt = (p: PlanPoint) => ({ x: p.x - n.x * reach * puf, y: p.y - n.y * reach * puf });
    run.legs.forEach((leg, i) => {
      const s = input.stackFor(run.segIndex, i);
      for (const y of liftTops(s)) {
        const a = F(leg.wallPoint, y), b = F(inPt(leg.wallPoint), y);
        tube(a, b, LEDGER_R, "bracket");
        tube({ x: a.x, y: y - 1.6, z: a.z }, b, BRACE_R, "bracket");
        counts.brackets += 1;
      }
      const next = run.legs[i + 1];
      if (!next) return;
      const sB = input.stackFor(run.segIndex, i + 1);
      const topsA = liftTops(s), topsB = liftTops(sB);
      const lifts = Math.min(topsA.length, topsB.length);
      const lenFt = ftLen(leg.wallPoint, next.wallPoint);
      const yaw = Math.atan2(-(next.wallPoint.y - leg.wallPoint.y), next.wallPoint.x - leg.wallPoint.x);
      const nPl = Math.max(1, Math.round(reach / 0.85));
      for (let k = 0; k < lifts; k++) {
        const yD = (topsA[k] + topsB[k]) / 2;
        if (k === lifts - 1) topDecks.push({ poly: [leg.wallPoint, next.wallPoint, inPt(next.wallPoint), inPt(leg.wallPoint)], y: yD });
        for (let j = 0; j < nPl; j++) {
          const across = (j + 0.5) / nPl;
          const mid = {
            x: (leg.wallPoint.x + next.wallPoint.x) / 2 - n.x * reach * puf * across,
            y: (leg.wallPoint.y + next.wallPoint.y) / 2 - n.y * reach * puf * across,
          };
          box(F(mid, yD + PLANK_T / 2), lenFt + PLANK_OVERHANG, (reach / nPl) * 0.9, PLANK_T, yaw, "bracketPlank");
        }
      }
    });
  };

  for (const run of runs) {
    const stacks = run.legs.map((_, i) => input.stackFor(run.segIndex, i));
    run.legs.forEach((leg, i) => drawLeg(leg, stacks[i], tunnelLegKey.has(`${run.segIndex}-${i}`)));
    for (let i = 0; i + 1 < run.legs.length; i++) {
      const bay = run.bays[i];
      if (!bay) continue;
      const a = run.legs[i], b = run.legs[i + 1];
      drawSpan(a.wallPoint, a.tickTip, b.wallPoint, b.tickTip, bay.kind, stacks[i], stacks[i + 1], {
        hatch: hatchKey.has(`${run.segIndex}-${i}`),
        tunnel: tunnelKey.has(`${run.segIndex}-${i}`), legA: a, legB: b,
      });
    }
    if (run.lead && run.legs.length) {
      const first = run.legs[0];
      const lenPx = run.lead.lengthFt * puf;
      const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y, L = Math.hypot(dx, dy) || 1;
      const u = { x: dx / L, y: dy / L };
      const c0 = { x: first.wallPoint.x - u.x * lenPx, y: first.wallPoint.y - u.y * lenPx };
      const c1 = { x: first.tickTip.x - u.x * lenPx, y: first.tickTip.y - u.y * lenPx };
      drawSpan(c0, c1, first.wallPoint, first.tickTip, run.lead.kind, stacks[0], stacks[0]);
    }
    if (run.tail && run.legs.length) {
      const t = run.tail;
      const s = stacks[stacks.length - 1];
      if (t.beside) {
        // A strip between two decks: a0-b0 and a1-b1 are its two ends.
        const tops = liftTops(s);
        tops.forEach((y, k) => {
          quad([F(t.a0, y + PLANK_T), F(t.b0, y + PLANK_T), F(t.b1, y + PLANK_T), F(t.a1, y + PLANK_T)], "plank");
          counts.planks += ppb;
          if (k === tops.length - 1) topDecks.push({ poly: [t.a0, t.b0, t.b1, t.a1], y });
        });
      } else {
        drawSpan(t.a0, t.a1, t.b0, t.b1, t.kind, s, s, { planked: true });
      }
    }
    if (run.brackets && run.bracketReachFt) drawBrackets(run, run.bracketReachFt);
  }

  /*
   * Debris netting: one sheet per bay down the outer face, ground to the top
   * of the run plus the added height, hung on the back posts. Lead and tail
   * decks get theirs too, so the net runs unbroken round a corner.
   */
  if (input.netting) {
    const extra = input.netting.addedHeightFt;
    const sheet = (a: PlanPoint, b: PlanPoint, top: number) => {
      quad([F(a, 0.3), F(b, 0.3), F(b, top + extra), F(a, top + extra)], "netting");
    };
    for (const run of runs) {
      const tops = run.legs.map((_, i) => { const t = liftTops(input.stackFor(run.segIndex, i)); return t.length ? t[t.length - 1] : 0; });
      for (let i = 0; i + 1 < run.legs.length; i++) {
        sheet(run.legs[i].tickTip, run.legs[i + 1].tickTip, Math.max(tops[i], tops[i + 1]));
      }
      if (run.lead && run.legs.length) {
        const first = run.legs[0];
        const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y, L = Math.hypot(dx, dy) || 1;
        const c1 = { x: first.tickTip.x - (dx / L) * run.lead.lengthFt * puf, y: first.tickTip.y - (dy / L) * run.lead.lengthFt * puf };
        sheet(c1, first.tickTip, tops[0]);
      }
      if (run.tail && run.legs.length && !run.tail.beside) sheet(run.tail.a1, run.tail.b1, tops[tops.length - 1]);
    }
  }

  /*
   * Top-lift rails, in pieces. A rail is kept only along the stretch where a
   * foot beyond that edge lands on nothing; where it lands on another deck at
   * the same height the two decks join and people walk through.
   */
  const STEP = 1.0; // ft
  for (const r of guardRails) {
    const lenFt = ftLen(r.a, r.b);
    if (lenFt < 0.2) continue;
    const n = Math.max(1, Math.ceil(lenFt / STEP));
    const at = (t: number): PlanPoint => ({ x: r.a.x + (r.b.x - r.a.x) * t, y: r.a.y + (r.b.y - r.a.y) * t });
    const yAt = (t: number) => r.yA + (r.yB - r.yA) * t;
    const open = (t: number) => {
      const p = at(t);
      // A foot beyond the edge lands on another deck: the decks join there.
      const beyond = { x: p.x + r.probe.x * puf * 1.0, y: p.y + r.probe.y * puf * 1.0 };
      // Or the edge itself lies across another deck: this deck and that one
      // overlap, as at a corner where one run's deck carries through under
      // the other's first bay, and a rail here would fence off its end.
      const within = { x: p.x - r.probe.x * puf * 1.0, y: p.y - r.probe.y * puf * 1.0 };
      return topDecks.some(d => d.poly !== r.own && Math.abs(d.y - yAt(t)) < 1.0 && (inside(beyond, d.poly) || inside(within, d.poly)));
    };
    let runStart: number | null = null;
    const flush = (t0: number, t1: number) => {
      if (t1 - t0 < 0.05 / lenFt) return;
      for (const h of [GUARD_H, MID_H]) tube(F(at(t0), yAt(t0) + h), F(at(t1), yAt(t1) + h), RAIL_R, "rail");
      counts.rails += 2;
    };
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      if (open((t0 + t1) / 2)) { if (runStart !== null) { flush(runStart, t0); runStart = null; } }
      else if (runStart === null) runStart = t0;
    }
    if (runStart !== null) flush(runStart, 1);
  }

  /*
   * End rails. Across a top-lift frame the deck runs through, nothing - that
   * is a walkway. Across a frame where the deck stops and a step beyond lands
   * on nothing, a top rail and a mid rail between the two posts: the end of a
   * run, the outer end of a corner turned on a turnaround frame.
   */
  for (const run of runs) {
    const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y, L = Math.hypot(dx, dy) || 1;
    const u = { x: dx / L, y: dy / L };
    run.legs.forEach((leg, i) => {
      const tops = liftTops(input.stackFor(run.segIndex, i));
      if (!tops.length) return;
      const yTop = tops[tops.length - 1];
      const mid = { x: (leg.wallPoint.x + leg.tickTip.x) / 2, y: (leg.wallPoint.y + leg.tickTip.y) / 2 };
      const deckAt = (sgn: number) => {
        const pt = { x: mid.x + u.x * sgn * puf * 1.0, y: mid.y + u.y * sgn * puf * 1.0 };
        return topDecks.some(d => Math.abs(d.y - yTop) < 1.0 && inside(pt, d.poly));
      };
      const ahead = deckAt(1), behind = deckAt(-1);
      if (ahead === behind) return; // deck both sides: walk through. Neither: nothing to guard.
      for (const h of [GUARD_H, MID_H]) tube(F(leg.wallPoint, yTop + h), F(leg.tickTip, yTop + h), RAIL_R, "rail");
      counts.endRails += 2;
    });
  }

  // The building.
  const walls = (input.walls ?? []).map(w => ({
    a: { x: (w.a.x - origin.x) / puf, z: (w.a.y - origin.y) / puf },
    b: { x: (w.b.x - origin.x) / puf, z: (w.b.y - origin.y) / puf },
    heightFt: w.heightFt,
  }));

  // Bounds.
  const min = { x: Infinity, y: 0, z: Infinity }, max = { x: -Infinity, y: 0, z: -Infinity };
  const take = (p: Vec3) => { min.x = Math.min(min.x, p.x); min.z = Math.min(min.z, p.z); max.x = Math.max(max.x, p.x); max.z = Math.max(max.z, p.z); max.y = Math.max(max.y, p.y); };
  for (const p of pieces) {
    if (p.kind === "tube") { take(p.a); take(p.b); }
    else if (p.kind === "box") take(p.c);
    else p.p.forEach(take);
  }
  for (const w of walls) { take({ x: w.a.x, y: w.heightFt, z: w.a.z }); take({ x: w.b.x, y: w.heightFt, z: w.b.z }); }
  if (!isFinite(min.x)) { min.x = min.z = -1; max.x = max.z = 1; max.y = 1; }

  return { pieces, walls, bounds: { min, max }, counts };
}
