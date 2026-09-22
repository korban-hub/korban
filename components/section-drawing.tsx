"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeFrameMakeup, layoutSection,
  type FrameMakeupPiece, type SectionDraftingItem, type SectionViewRecord,
} from "@/lib/projectStore";

/** What this section needs, reported up so the page can show and compare it. */
export type SectionSummary = {
  sectionId: string;
  label: string;
  /** Wall height at this cut, from the traced profile - grade to top. */
  heightFt: number;
  frameTall: number;
  pieces: FrameMakeupPiece[];
  materials: { partNo: string; kind: string; qty: number }[];
};

/**
 * A section through the scaffold and the wall.
 *
 * This is a drawing, not a calculator. The material was decided by the floor
 * plan, the level rules and the recess strategies; a section shows a project
 * manager what that looks like standing against the wall - where the frames
 * sit, where a bracket reaches in, how the deck holds its foot of access from
 * grade to the top.
 *
 * It is also local. A section is one slice, wherever the architect cut through
 * the building, and may describe an awkward corner rather than the whole job.
 *
 * Korban lays it out; the estimator corrects it. Every piece is an object that
 * can be moved, added to or deleted, because a drawing nobody can correct is a
 * drawing nobody trusts.
 */

type Point = { x: number; y: number };

/*
 * The material bank.
 *
 * Grouped, because "Frame 3'" could mean three feet tall or three feet wide,
 * and a job can mix widths. The buttons stay as short as they were; the detail
 * is one click in.
 */
const BANK: {
  group: string;
  options: { kind: SectionDraftingItem["kind"]; variant: string; label: string }[];
}[] = [
  { group: "Frame", options: [
      { kind: "frame", variant: "FO6L3",  label: `6'-4" tall x 3' wide` },
      { kind: "frame", variant: "FO6L42", label: `6'-4" tall x 3'-6" wide` },
      { kind: "frame", variant: "FO6L",   label: `6'-4" tall x 5' wide` },
      { kind: "frame", variant: "FO5L3",  label: `5'-0" tall x 3' wide` },
      { kind: "frame", variant: "FO5L42", label: `5'-0" tall x 3'-6" wide` },
      { kind: "frame", variant: "FM5",    label: `5'-0" tall x 5' wide` },
      { kind: "frame", variant: "FM33",   label: `3'-0" tall x 3' wide` },
      { kind: "frame", variant: "FM342",  label: `3'-0" tall x 3'-6" wide` },
      { kind: "frame", variant: "FM3",    label: `3'-0" tall x 5' wide` },
  ] },
  { group: "Bracket", options: [
      { kind: "bracket", variant: "BR12S", label: `12" side - 1 plank` },
      { kind: "bracket", variant: "BR20S", label: `20" side - 2 planks` },
      { kind: "bracket", variant: "BR30S", label: `30" side - 3 planks` },
      { kind: "bracket", variant: "BR20E", label: `20" end - 2 planks` },
      { kind: "bracket", variant: "BR30E", label: `30" end - 3 planks` },
  ] },
  { group: "Plank", options: [
      { kind: "plank", variant: "WP10", label: `10' wood plank` },
      { kind: "plank", variant: "WP8",  label: `8' wood plank` },
      { kind: "plank", variant: "WP7",  label: `7' wood plank` },
  ] },
  { group: "Guardrail", options: [
      { kind: "guardrail", variant: "GR10", label: `10' guardrail` },
      { kind: "guardrail", variant: "GR8",  label: `8' guardrail` },
      { kind: "guardrail", variant: "GR7",  label: `7' guardrail` },
  ] },
  { group: "Tube", options: [
      { kind: "tube", variant: "ST4SG",  label: `4' tube` },
      { kind: "tube", variant: "ST6SG",  label: `6' tube` },
      { kind: "tube", variant: "ST8SG",  label: `8' tube` },
      { kind: "tube", variant: "ST10SG", label: `10' tube` },
      { kind: "tube", variant: "ST13SG", label: `13' tube` },
  ] },
  { group: "Base", options: [
      { kind: "jack", variant: "AL1S", label: `Screw jack w/ base` },
      { kind: "jack", variant: "AL1",  label: `Screw jack, no base` },
      { kind: "jack", variant: "BP1",  label: `Fixed base plate` },
  ] },
];

/** How a dimension line is constrained while it is being drawn. */
type SnapMode = "ortho" | "vertical" | "horizontal" | "free";

export default function SectionDrawing({
  section,
  scaffoldWidthFt,
  planksPerDeck,
  workerReachFt = 6,
  screwJackMaxIn = 18,
  onSave,
  onSideChange,
  onSummary,
}: {
  section: SectionViewRecord | null;
  scaffoldWidthFt: number;
  planksPerDeck: number;
  workerReachFt?: number;
  screwJackMaxIn?: number;
  onSave: (sectionId: string, items: SectionDraftingItem[]) => void;
  /** Which side of the wall the scaffold stands on, for this section. */
  onSideChange?: (sectionId: string, side: "left" | "right") => void;
  /** Called whenever what this section needs changes. */
  onSummary?: (summary: SectionSummary | null) => void;
}) {
  /** 1 fits the wall to the view. Above 1 is closer. */
  const [zoom, setZoom] = useState(1);
  /** How far the view has been dragged, in drawing units. */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** Drag always pans while on, whatever is under the cursor. */
  const [panMode, setPanMode] = useState(false);
  /**
   * Seen from the other side. A mirror of the whole drawing - same wall, same
   * brackets, same runs - not a reinterpretation of which side the building
   * is on, which is what turned recesses into projections.
   */
  const [mirror, setMirror] = useState(false);
  const groupRef = useRef<SVGGElement>(null);
  const panRef = useRef<{ cx: number; cy: number; start: { x: number; y: number }; scale: number } | null>(null);
  /** Read by the keyboard handler, so it never holds a stale selection. */
  const selectedRef = useRef<string | null>(null);
  const removeSelectedRef = useRef<() => void>(() => {});
  const svgRef = useRef<SVGSVGElement>(null);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<SectionDraftingItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: SectionDraftingItem["kind"]; variant: string } | null>(null);
  /** Which material group is open in the bank. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [dimMode, setDimMode] = useState(false);
  const [snap, setSnap] = useState<SnapMode>("ortho");
  const [dimFrom, setDimFrom] = useState<Point | null>(null);
  const [dimTo, setDimTo] = useState<Point | null>(null);
  const [dirty, setDirty] = useState(false);
  /** What is being dragged: a whole piece, or one end of a dimension. */
  const dragRef = useRef<{ id: string; mode: "move" | "a" | "b"; grab: Point; orig: SectionDraftingItem } | null>(null);

  const puf = section?.pageUnitsPerFoot ?? 0;
  const profile = section?.wallOutline ?? [];
  const ready = profile.length >= 2 && puf > 0;
  /** -1 = scaffold on the left, building to the right. */
  const sideDir = (section?.scaffoldSide ?? "left") === "left" ? -1 : 1;

  /*
   * This section's own leg, from its own profile.
   *
   * The architect cut the section at a particular spot, and the profile traced
   * from it IS the wall height there - top of profile down to grade, at this
   * sheet's scale. Borrowing the height from an elevation grip instead meant a
   * section through a three-storey part of the building drew one frame because
   * a different face measured ten feet.
   */
  const heightFt = ready
    ? (Math.max(...profile.map(p => p.y)) - Math.min(...profile.map(p => p.y))) / puf
    : 0;
  const makeup = useMemo(
    () => computeFrameMakeup(Math.max(0, heightFt - workerReachFt), screwJackMaxIn),
    [heightFt, workerReachFt, screwJackMaxIn],
  );
  // Bottom first: the tallest frames stand on the jack, the short ones finish it.
  const jumpHeightsFt = useMemo(() => {
    const out: number[] = [];
    [...makeup.pieces].sort((a, b) => b.size - a.size)
      .forEach(piece => { for (let i = 0; i < piece.qty; i++) out.push(piece.size); });
    return out;
  }, [makeup]);
  const frameTall = jumpHeightsFt.length;

  /*
   * Piece geometry, in one place.
   *
   * The drawing, the grips you can snap to and the area you can grab a piece
   * by all come from these - so what you can take hold of is exactly what you
   * can see. Nothing here depends on zoom.
   */
  const deckW = scaffoldWidthFt * puf;
  const frameFtOf = (i: SectionDraftingItem) => parseFloat(i.label ?? "") || 6.333;
  /*
   * How wide a piece is.
   *
   * A frame's part number says its width, which matters once a section carries
   * a 3' run on a ledge beside a 5' main run - drawing everything at the main
   * width put the second run's legs in the wrong place.
   */
  const FRAME_WIDTHS: Record<string, number> = {
    FO6L: 5, FM5: 5, FM3: 5,
    FO6L42: 3.5, FO5L42: 3.5, FM342: 3.5,
    FO6L3: 3, FO5L3: 3, FM33: 3,
  };
  const widthFtOf = (i: SectionDraftingItem) => {
    if (i.kind === "frame") return FRAME_WIDTHS[i.variant] ?? scaffoldWidthFt;
    if (i.kind === "guardrail" || i.kind === "jack") return parseFloat(i.label ?? "") || scaffoldWidthFt;
    return scaffoldWidthFt;
  };
  /** The piece's span, from whichever side the scaffold stands on. */
  const spanOf = (i: SectionDraftingItem) => {
    const w = widthFtOf(i) * puf;
    const x0 = sideDir === -1 ? (i.x ?? 0) - w : (i.x ?? 0);
    return { x0, x1: x0 + w };
  };
  const bracketFtOf = (variant: string) =>
    variant === "BR12S" ? 1 : variant === "BR20S" ? 20 / 12 : 2.5;
  function boardRect(i: SectionDraftingItem) {
    const widthFt = parseFloat(i.label ?? "") || scaffoldWidthFt / Math.max(1, planksPerDeck);
    const bw = widthFt * puf, gap = puf * 0.05, t = puf * 0.22;
    const lo = sideDir === -1 ? (i.x ?? 0) - bw : (i.x ?? 0);
    // Sits ON the head or the bracket: its underside is the deck line.
    return { x: lo + gap / 2, y: (i.y ?? 0) - t, w: Math.max(bw - gap, puf * 0.05), h: t };
  }
  /** Every endpoint a piece has - what snapping and grabbing use. */
  function pieceGrips(i: SectionDraftingItem): Point[] {
    if (i.x === undefined || i.y === undefined || i.label === "removed") return [];
    const x = i.x, y = i.y;
    switch (i.kind) {
      case "frame": {
        const { x0, x1 } = spanOf(i), h = frameFtOf(i) * puf;
        return [{ x: x0, y }, { x: x1, y }, { x: x0, y: y + h }, { x: x1, y: y + h }];
      }
      case "plank": {
        const b = boardRect(i);
        return [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }];
      }
      case "bracket": {
        const tip = x - sideDir * bracketFtOf(i.variant) * puf;
        return [{ x, y }, { x: tip, y }, { x, y: y + puf * 1.1 }];
      }
      case "guardrail": {
        const { x0, x1 } = spanOf(i);
        return [{ x: x0, y }, { x: x1, y }, { x: x0, y: y - puf * 3.5 }, { x: x1, y: y - puf * 3.5 },
                { x: x0, y: y - puf * 1.8 }, { x: x1, y: y - puf * 1.8 }];
      }
      case "jack": {
        const { x0, x1 } = spanOf(i);
        return [{ x: x0, y }, { x: x1, y }, { x: x0, y: y - puf * 1.1 }, { x: x1, y: y - puf * 1.1 }];
      }
      case "dimension":
        return i.x2 !== undefined && i.y2 !== undefined
          ? [{ x, y }, { x: i.x2, y: i.y2 }, { x: (x + i.x2) / 2, y: (y + i.y2) / 2 }]
          : [{ x, y }];
      case "note":
        return [];
      case "tube": {
        const len = (parseFloat(i.label ?? "") || scaffoldWidthFt) * puf;
        return [{ x, y }, { x: x + sideDir * len, y }];
      }
      default: {
        const { x0, x1 } = spanOf(i);
        return [{ x: x0, y }, { x: x1, y }];
      }
    }
  }
  /** The area a piece can be taken hold of by. */
  function pieceBox(i: SectionDraftingItem) {
    const g = pieceGrips(i);
    if (g.length === 0) return null;
    const pad = puf * 0.35;
    const xs = g.map(p => p.x), ys = g.map(p => p.y);
    return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
  }

  /**
   * Korban's own pieces, laid out from the traced profile.
   *
   * Recomputed whenever the profile or the configuration changes, and merged
   * with anything hand-placed - which is why every item records who put it
   * there. A re-layout replaces Korban's and never touches the estimator's.
   */
  const korbanItems = useMemo(() => {
    if (!ready) return [];
    return layoutSection({
      profile: profile.map(p => ({ x: p.x, y: p.y })),
      pageUnitsPerFoot: puf,
      frameTall,
      scaffoldWidthFt,
      planksPerDeck,
      side: section?.scaffoldSide ?? "left",
      jumpHeightsFt,
    });
  }, [ready, profile, puf, frameTall, jumpHeightsFt, scaffoldWidthFt, planksPerDeck, section?.scaffoldSide]);

  useEffect(() => {
    /*
     * What was saved wins over what Korban would lay out fresh.
     *
     * A Korban piece that was moved is saved under its own id, so Korban's
     * original is dropped rather than drawn alongside it. One that was deleted
     * leaves a marker saying so, or it would simply come back next time.
     */
    const stored = (section?.draftingAdditions ?? []).filter(i => i.source === "user");
    const storedIds = new Set(stored.map(i => i.id));
    const removed = new Set(stored.filter(i => i.label === "removed").map(i => i.variant));
    const korban = korbanItems.filter(k => !storedIds.has(k.id) && !removed.has(k.id));
    setItems([...korban, ...stored]);
    setDirty(false);
    setSelected(null);
  }, [korbanItems, section?.id]);

  /*
   * The view is worked out from the wall, never from the pieces on it.
   *
   * It used to include every piece's position, so dragging a piece moved the
   * edge of the view with it - the drawing re-framed itself around the piece
   * and it looked as though nothing had moved. The wall does not move, so the
   * view it defines stays put while things are dragged about inside it.
   */
  const baseBounds = useMemo(() => {
    if (profile.length === 0) return { minX: 0, minY: 0, w: 100, h: 100 };
    const xs = profile.map(p => p.x), ys = profile.map(p => p.y);
    /*
     * Room on the scaffold side for the scaffold, then the dimension string,
     * then the callouts - all in the dark space, where they can be read. The
     * building side only needs a little hatch showing.
     */
    const open = (scaffoldWidthFt + 22) * puf;
    const shut = 6 * puf;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const minX = sideDir === -1 ? lo - open : lo - shut;
    const maxX = sideDir === -1 ? hi + shut : hi + open;
    const minY = Math.min(...ys) - puf * 8;
    const maxY = Math.max(...ys) + puf * 3;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [profile, puf, sideDir, scaffoldWidthFt]);

  // Zoom closes in on the middle of the wall rather than its corner.
  const bounds = useMemo(() => {
    const z = Math.max(0.25, zoom);
    const cx = baseBounds.minX + baseBounds.w / 2 + pan.x;
    const cy = baseBounds.minY + baseBounds.h / 2 + pan.y;
    const w = baseBounds.w / z, h = baseBounds.h / z;
    return { minX: cx - w / 2, minY: cy - h / 2, w, h };
  }, [baseBounds, zoom, pan]);
  /** The line the drawing mirrors about - the middle of the wall's view. */
  const mirrorAxis = baseBounds.minX + baseBounds.w / 2;

  /*
   * The keyboard. Delete removes what is selected, Escape backs out of
   * whatever tool is armed - both what anyone would try first.
   */
  useEffect(() => {
    if (!editing) return;
    function onKey(ev: KeyboardEvent) {
      const el = ev.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (!selectedRef.current) return;
        ev.preventDefault();
        removeSelectedRef.current();
      } else if (ev.key === "Escape") {
        setPending(null); setDimMode(false); setDimFrom(null); setDimTo(null); setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  // The wheel zooms. Registered natively, not through React, so it can stop
  // the page scrolling underneath the drawing at the same time.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setZoom(z => Math.min(6, Math.max(0.25, +(z * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)).toFixed(3))));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ready, section?.id]);

  /*
   * Report what this section needs - its height, its leg, and the pieces on
   * the drawing - so the page can list it and compare it against the
   * configuration Takeoff produced.
   */
  useEffect(() => {
    if (!onSummary) return;
    if (!section || !ready) { onSummary(null); return; }
    const tally = new Map<string, { partNo: string; kind: string; qty: number }>();
    items.forEach(item => {
      if (item.kind === "dimension" || item.kind === "note") return;
      const key = `${item.kind}:${item.variant}`;
      const row = tally.get(key) ?? { partNo: item.variant, kind: item.kind, qty: 0 };
      // A plank item is a whole deck; the boards in it are what gets bought.
      // One piece, one part. A plank piece used to count as a whole deck,
      // which tripled the boards on this list.
      row.qty += 1;
      tally.set(key, row);
    });
    // A tube is always two clamps.
    const tubes = [...tally.values()].filter(r => r.kind === "tube").reduce((n, r) => n + r.qty, 0);
    if (tubes > 0) tally.set("clamp:CRA19", { partNo: "CRA19", kind: "clamp", qty: tubes * 2 });

    onSummary({
      sectionId: section.id,
      label: section.label,
      heightFt,
      frameTall,
      pieces: makeup.pieces,
      materials: [...tally.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, heightFt, frameTall, makeup, section?.id, ready, planksPerDeck]);

  /*
   * Screen to drawing, through the browser's own transform.
   *
   * This used to scale width and height separately, but the drawing keeps its
   * proportions and letterboxes when the panel is a different shape - so every
   * click landed a little off where it was made. The group's screen transform
   * accounts for the letterboxing, the zoom, the pan and the mirror at once,
   * and hands back the point in the drawing's own terms.
   */
  function toDrawing(e: { clientX: number; clientY: number }): Point | null {
    const g = groupRef.current, svg = svgRef.current;
    if (!g || !svg) return null;
    const m = g.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const out = pt.matrixTransform(m.inverse());
    return { x: out.x, y: out.y };
  }
  /** Drawing units per screen pixel, for anything that should feel the same at any zoom. */
  function unitsPerPixel(): number {
    const m = groupRef.current?.getScreenCTM();
    return m ? 1 / Math.max(Math.abs(m.a), 1e-6) : 1;
  }

  /** Where the cursor would snap, so the target shows before the click. */
  const [snapHint, setSnapHint] = useState<Point | null>(null);

  /** A piece deleted from Korban's layout - kept only so it stays deleted. */
  const isTombstone = (i: SectionDraftingItem) => i.label === "removed";

  /*
   * Points worth landing on: the wall's corners, every piece's anchor, a
   * frame's four corners, and both ends of every dimension. The same idea as
   * reference points in Takeoff - hitting an exact corner by hand is slow and
   * rarely exact, so the cursor is pulled onto one when it comes close.
   */
  function snapCandidates(excludeId?: string): Point[] {
    const out: Point[] = profile.map(p => ({ x: p.x, y: p.y }));
    items.forEach(i => { if (i.id !== excludeId) out.push(...pieceGrips(i)); });
    return out;
  }

  /** Ten pixels on screen, at any zoom. */
  const snapRadius = () => 10 * unitsPerPixel();

  /** Pulls a point onto the nearest endpoint within reach. */
  function snapTo(pt: Point, excludeId?: string): { pt: Point; hit: boolean } {
    const radius = snapRadius();
    let best: Point | null = null, bestDist = radius;
    for (const c of snapCandidates(excludeId)) {
      const d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best ? { pt: best, hit: true } : { pt, hit: false };
  }

  /*
   * Snaps a piece being dragged by whichever of ITS endpoints is nearest an
   * endpoint of something else - so a frame's foot lands on a head, or a
   * board's end on a bracket tip, whichever part of it was grabbed.
   */
  function snapPiece(moved: SectionDraftingItem): { dx: number; dy: number; at: Point | null } {
    const radius = snapRadius();
    const targets = snapCandidates(moved.id);
    let best: { dx: number; dy: number; at: Point } | null = null, bestDist = radius;
    for (const g of pieceGrips(moved)) {
      for (const c of targets) {
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d < bestDist) { bestDist = d; best = { dx: c.x - g.x, dy: c.y - g.y, at: c }; }
      }
    }
    return best ?? { dx: 0, dy: 0, at: null };
  }

  /** Straightens a dimension unless the estimator asked for it not to be. */
  function applySnap(from: Point, to: Point): Point {
    if (snap === "free") return to;
    const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
    if (snap === "vertical") return { x: from.x, y: to.y };
    if (snap === "horizontal") return { x: to.x, y: from.y };
    return dx > dy ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  }

  function change(next: SectionDraftingItem[]) {
    setItems(next);
    setDirty(true);
  }

  /** Feet and inches for a dimension, never 5'-12". */
  function ftIn(ft: number) {
    let whole = Math.floor(ft), inches = Math.round((ft - whole) * 12);
    if (inches === 12) { whole += 1; inches = 0; }
    return `${whole}'-${inches}"`;
  }
  const shiftPiece = (i: SectionDraftingItem, dx: number, dy: number): SectionDraftingItem => ({
    ...i,
    x: (i.x ?? 0) + dx, y: (i.y ?? 0) + dy,
    ...(i.x2 !== undefined ? { x2: i.x2 + dx } : {}),
    ...(i.y2 !== undefined ? { y2: i.y2 + dy } : {}),
  });
  function distToSegment(p: Point, a: Point, b: Point) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function startPan(e: React.PointerEvent) {
    const m = svgRef.current?.getScreenCTM();
    panRef.current = { cx: e.clientX, cy: e.clientY, start: { ...pan }, scale: m ? Math.abs(m.a) : 1 };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Pan: when the pan tool is on, with the middle button, or whenever the
    // drawing is just being looked at.
    if (panMode || e.button === 1 || !editing) { startPan(e); return; }
    const raw = toDrawing(e);
    if (!raw) return;

    if (dimMode) {
      const start = snapTo(raw);
      if (!dimFrom) { setDimFrom(start.pt); setDimTo(null); return; }
      // A snapped end lands exactly where it snapped; otherwise straighten it.
      const end = start.hit ? start.pt : applySnap(dimFrom, raw);
      const ft = Math.hypot(end.x - dimFrom.x, end.y - dimFrom.y) / Math.max(puf, 0.0001);
      change([...items, {
        id: `d-${Date.now().toString(36)}`,
        kind: "dimension", variant: snap, level: 0,
        x: dimFrom.x, y: dimFrom.y, x2: end.x, y2: end.y,
        label: ftIn(ft), source: "user",
      }]);
      setDimFrom(null); setDimTo(null);
      return;
    }

    if (pending) {
      const at = snapTo(raw).pt;
      change([...items, {
        id: `u-${Date.now().toString(36)}`,
        kind: pending.kind, variant: pending.variant, level: 0,
        x: at.x, y: at.y, source: "user",
      }]);
      setPending(null);
      return;
    }

    /*
     * Take hold of whatever is under the cursor. A dimension by either end or
     * anywhere along it; anything else by its body. Where several overlap, the
     * smallest wins - so a board on a deck is picked over the frame behind it.
     */
    const r = snapRadius();
    type Hit = { id: string; mode: "move" | "a" | "b"; area: number };
    const hits: Hit[] = [];
    for (const i of items) {
      if (isTombstone(i) || i.x === undefined || i.y === undefined) continue;
      if (i.kind === "dimension" && i.x2 !== undefined && i.y2 !== undefined) {
        if (Math.hypot(raw.x - i.x, raw.y - i.y) < r) hits.push({ id: i.id, mode: "a", area: 0 });
        else if (Math.hypot(raw.x - i.x2, raw.y - i.y2) < r) hits.push({ id: i.id, mode: "b", area: 0 });
        else if (distToSegment(raw, { x: i.x, y: i.y }, { x: i.x2, y: i.y2 }) < r) hits.push({ id: i.id, mode: "move", area: 0 });
        continue;
      }
      const box = pieceBox(i);
      if (box && raw.x >= box.minX && raw.x <= box.maxX && raw.y >= box.minY && raw.y <= box.maxY) {
        hits.push({ id: i.id, mode: "move", area: (box.maxX - box.minX) * (box.maxY - box.minY) });
      }
    }
    hits.sort((m, n) => m.area - n.area);
    const hit = hits[0];
    if (!hit) { setSelected(null); startPan(e); return; } // empty space pans
    setSelected(hit.id);
    const orig = items.find(i => i.id === hit.id)!;
    dragRef.current = { id: hit.id, mode: hit.mode, grab: raw, orig: { ...orig } };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = panRef.current;
    if (p) {
      setPan({ x: p.start.x - (e.clientX - p.cx) / p.scale, y: p.start.y - (e.clientY - p.cy) / p.scale });
      return;
    }
    if (!editing) return;
    const raw = toDrawing(e);
    if (!raw) return;
    const drag = dragRef.current;

    if (dimMode && dimFrom) {
      const hit = snapTo(raw);
      setSnapHint(hit.hit ? hit.pt : null);
      setDimTo(hit.hit ? hit.pt : applySnap(dimFrom, raw));
      return;
    }

    if (drag) {
      if (drag.mode === "move") {
        const tentative = shiftPiece(drag.orig, raw.x - drag.grab.x, raw.y - drag.grab.y);
        const snapped = snapPiece(tentative);
        const placed = shiftPiece(tentative, snapped.dx, snapped.dy);
        setSnapHint(snapped.at);
        change(items.map(i => i.id === drag.id ? { ...placed, source: "user" as const } : i));
      } else {
        // One end of a dimension, snapped on its own; the reading follows it.
        const hit = snapTo(raw, drag.id);
        setSnapHint(hit.hit ? hit.pt : null);
        change(items.map(i => {
          if (i.id !== drag.id) return i;
          const next = drag.mode === "a" ? { ...i, x: hit.pt.x, y: hit.pt.y } : { ...i, x2: hit.pt.x, y2: hit.pt.y };
          const ft = Math.hypot((next.x2 ?? 0) - (next.x ?? 0), (next.y2 ?? 0) - (next.y ?? 0)) / Math.max(puf, 1e-4);
          return { ...next, label: ftIn(ft), source: "user" as const };
        }));
      }
      return;
    }

    // Just hovering: show what a click would snap to.
    const hover = snapTo(raw);
    setSnapHint(hover.hit && (pending || dimMode) ? hover.pt : null);
  }

  function onPointerUp() { dragRef.current = null; panRef.current = null; setSnapHint(null); }

  selectedRef.current = selected;
  function removeSelected() {
    if (!selected) return;
    const target = items.find(i => i.id === selected);
    const rest = items.filter(i => i.id !== selected);
    // Korban would lay its own piece out again next time; the marker stops it.
    if (target?.source === "korban") {
      rest.push({ id: `rm-${target.id}`, kind: "note", variant: target.id, level: 0, label: "removed", source: "user" });
    }
    change(rest);
    setSelected(null);
  }
  removeSelectedRef.current = removeSelected;

  function save() {
    if (!section) return;
    onSave(section.id, items);
    setDirty(false);
  }

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-xs text-[11px] leading-[1.6] text-zinc-600">
          No section selected. Trace one in Takeoff&apos;s Section View tab and it will be drawn here.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-xs text-[11px] leading-[1.6] text-zinc-600">
          {profile.length < 2
            ? `${section.label} has no traced profile yet. Trace the outer wall in Takeoff's Section View tab.`
            : `${section.label} has no scale. Sections are drawn larger than the plan they were cut from, so this sheet needs its own.`}
        </p>
      </div>
    );
  }

  const stroke = Math.max(bounds.w / 400, 0.6);
  const text = Math.max(bounds.w / 60, 4);

  /*
   * The same three numbers the layout engine works from, so the drawing and
   * the pieces on it agree about which way is out and where the ground is.
   */
  const dir = sideDir;
  const faces = profile.map(p => p.x);
  // Nearest the scaffold - the smallest x when it stands on the left. This
  // was inverted, the same as the layout engine, and drew the leg off the back
  // of the wall.
  const outerFace = dir === -1 ? Math.min(...faces) : Math.max(...faces);
  /*
   * The wall hatch and the grade run far past anything on screen, so they
   * never show an edge however the drawing is zoomed, panned or mirrored.
   */
  const reach = puf * 400;
  const farLeft = Math.min(...faces) - reach;
  const farRight = Math.max(...faces) + reach;
  const buildingFar = dir === -1 ? farRight : farLeft;
  /** Which way the scaffold faces on screen, after any mirror. */
  const screenDir = mirror ? -dir : dir;
  /** Turns a piece of text back the right way round inside the mirror. */
  const unflip = (x: number) => (mirror ? `matrix(-1 0 0 1 ${2 * x} 0)` : "");
  /** Where the scaffold's far edge is, away from the wall. */
  const scafEdge = outerFace + dir * puf + dir * scaffoldWidthFt * puf;
  const legFace = outerFace + dir * puf;
  const grade = Math.max(...profile.map(p => p.y));

  return (
    <div className="flex h-full">
      {/*
        * Tools in a slim column beside the drawing rather than bars across the
        * top of it, so the drawing keeps its full height. Editing opens the
        * rest of the column; otherwise it stays out of the way.
        */}
      <div className="flex w-[148px] flex-shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-zinc-900 bg-[#0b0b0b] p-2">
        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
          {section.label} &middot; {items.length} pieces
        </p>
        <button onClick={() => { setEditing(v => !v); setPending(null); setDimMode(false); setSelected(null); }}
          className={`w-full rounded-lg border px-2 py-1.5 text-left text-[9.5px] font-bold transition ${editing ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-700 text-zinc-300 hover:border-orange-500/40"}`}>
          {editing ? "\u2713 Editing" : "Edit drawing"}
        </button>

        {editing && (
          <>
            <button onClick={() => { setDimMode(v => !v); setPending(null); setDimFrom(null); }}
              className={`w-full rounded-lg border px-2 py-1.5 text-left text-[9.5px] font-bold transition ${dimMode ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300" : "border-zinc-700 text-zinc-400 hover:border-cyan-400/40"}`}>
              Dimension
            </button>
            {dimMode && (
              <div className="grid grid-cols-2 gap-1">
                {(["ortho", "vertical", "horizontal", "free"] as SnapMode[]).map(m => (
                  <button key={m} onClick={() => setSnap(m)}
                    title={m === "ortho" ? "Square, whichever way is nearer" : m === "free" ? "No locking" : `Locked ${m}`}
                    className={`rounded border px-1 py-1 text-[8.5px] ${snap === m ? "border-cyan-400/60 text-cyan-300" : "border-zinc-800 text-zinc-600 hover:text-zinc-400"}`}>
                    {m === "ortho" ? "90\u00b0/0\u00b0" : m === "vertical" ? "\u2195 vert" : m === "horizontal" ? "\u2194 horiz" : "free"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1">
              <button onClick={removeSelected} disabled={!selected}
                className="rounded-lg border border-zinc-700 px-1 py-1.5 text-[9px] font-bold text-zinc-400 transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-30">
                Delete
              </button>
              <button onClick={save} disabled={!dirty}
                className={`rounded-lg px-1 py-1.5 text-[9px] font-bold transition ${dirty ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border border-zinc-800 text-zinc-600"}`}>
                {dirty ? "Save" : "Saved"}
              </button>
            </div>

            {/*
              * Which side the scaffold appears on. A mirror of the drawing -
              * same wall, same brackets - not a change to which side the
              * building is on, which is what used to turn recesses inside out.
              */}
            <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">View from</p>
            <div className="grid grid-cols-2 gap-1">
              {(["left", "right"] as const).map(side => {
                const physical = section?.scaffoldSide ?? "left";
                const onScreen = mirror ? (physical === "left" ? "right" : "left") : physical;
                return (
                <button key={side}
                  onClick={() => setMirror(side !== physical)}
                  className={`rounded-lg border px-1 py-1.5 text-[9px] font-bold capitalize transition ${
                    onScreen === side
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 text-zinc-500 hover:border-orange-500/40"
                  }`}>
                  {side}
                </button>
                );
              })}
            </div>

            <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">Material</p>
            {BANK.map(group => {
              const isOpen = openGroup === group.group;
              const chosen = group.options.find(o => o.variant === pending?.variant);
              return (
                <div key={group.group}>
                  <button
                    onClick={() => { setOpenGroup(isOpen ? null : group.group); setDimMode(false); }}
                    className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-[9px] transition ${
                      chosen ? "border-orange-500 bg-orange-500/15 text-orange-300"
                             : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    }`}>
                    <span>{chosen ? chosen.label.split(" - ")[0] : group.group}</span>
                    <span className="text-zinc-600">{isOpen ? "\u2013" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-1 space-y-0.5 rounded border border-zinc-800 bg-black p-1">
                      {group.options.map(o => (
                        <button key={o.variant}
                          onClick={() => {
                            setPending(pending?.variant === o.variant ? null : { kind: o.kind, variant: o.variant });
                            setOpenGroup(null);
                          }}
                          className={`block w-full rounded px-1.5 py-1 text-left text-[9px] transition ${
                            pending?.variant === o.variant ? "bg-orange-500/20 text-orange-300" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                          }`}>
                          <span className="font-mono text-[8px] text-zinc-600">{o.variant}</span>{" "}{o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {pending && (
              <p className="font-mono text-[8.5px] leading-snug text-orange-400">Click the drawing to place it.</p>
            )}
            {!pending && !dimMode && (
              <p className="font-mono text-[8.5px] leading-snug text-zinc-600">Grab any piece to move it. It snaps to corners - watch for the ring.</p>
            )}
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* View controls, same as the plan: out, percentage, in, fit. */}
        <div className="flex items-center gap-1 border-b border-zinc-900 bg-[#0b0b0b] px-3 py-1.5">
          <span className="font-mono text-[9px] text-zinc-600">
            {heightFt > 0 ? `${Math.floor(heightFt)}'-${Math.round((heightFt % 1) * 12)}" wall \u00b7 ${frameTall} frames per leg` : ""}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}
              className="h-6 w-6 rounded border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white">&minus;</button>
            <span className="w-11 text-center font-mono text-[9.5px] text-zinc-400">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)))}
              className="h-6 w-6 rounded border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white">+</button>
            <button onClick={() => setPanMode(v => !v)}
              title="Drag to move around the drawing. Empty space always pans too."
              className={`h-6 rounded border px-1.5 text-[9px] transition ${panMode ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-800 text-zinc-500 hover:text-white"}`}>
              Pan
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="h-6 rounded border border-zinc-800 px-1.5 text-[9px] text-zinc-500 hover:text-white">Fit</button>
          </div>
        </div>
      <div className="relative flex-1 overflow-hidden bg-[#080604]" style={{ minHeight: 0 }}>
        <svg ref={svgRef}
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
          className="korban-section-print h-full w-full"
          style={{ cursor: panMode || !editing ? "grab" : pending || dimMode ? "crosshair" : "default", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/*
            * Drawn the way a scaffold section is drawn.
            *
            * Double-line tube profiles rather than single strokes; hockeys
            * running down from each frame head, stopping 4'-6" short, which is
            * why a brace crosses where it does; planking as separate boards
            * with visible edges; the wall hatched as cut material with a face
            * line; dimensions with extension lines and arrow terminators;
            * callouts on angled leaders.
            *
            * An estimator who has spent twenty years reading shop drawings
            * should recognise this without being told what it is.
            */}
          <defs>
            <marker id="ksArrow" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
              <path d="M5.5,0.7 L0,2.5 L5.5,4.3 Z" fill="#71717a" />
            </marker>
            <marker id="ksDot" markerWidth="4" markerHeight="4" refX="2" refY="2">
              <circle cx="2" cy="2" r="1.1" fill="#52525b" />
            </marker>
            <pattern id="ksConcrete" width={puf * 0.5} height={puf * 0.5} patternUnits="userSpaceOnUse">
              <path d={`M0,${puf * 0.5} L${puf * 0.5},0`} stroke="#3f3f46" strokeWidth={stroke * 0.7} />
            </pattern>
            <pattern id="ksGround" width={puf * 0.6} height={puf * 0.6} patternUnits="userSpaceOnUse">
              <path d={`M0,${puf * 0.6} L${puf * 0.6},0`} stroke="#3f3f46" strokeWidth={stroke * 0.8} />
            </pattern>
          </defs>

          {/*
            * Everything drawn sits in one group, so seeing it from the other
            * side is a single mirror of the whole thing. Text inside is turned
            * back the right way round so it still reads.
            */}
          <g ref={groupRef} transform={mirror ? `matrix(-1 0 0 1 ${2 * mirrorAxis} 0)` : undefined}>

          {/* Cut material behind the traced face. */}
          <polygon
            points={[
              ...profile.map(p => `${p.x},${p.y}`),
              `${buildingFar},${profile[profile.length - 1].y}`,
              `${buildingFar},${grade}`,
            ].join(" ")}
            fill="url(#ksConcrete)" opacity="0.85"
          />
          <polyline
            points={profile.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="#a1a1aa" strokeWidth={stroke * 1.8}
          />

          {/* Grade. */}
          <line x1={farLeft} y1={grade} x2={farRight} y2={grade}
            stroke="#71717a" strokeWidth={stroke * 1.4} />
          <rect x={farLeft} y={grade} width={farRight - farLeft} height={puf * 1.2}
            fill="url(#ksGround)" opacity="0.7" />

          {/*
            * Overall height, down the open side, with extension lines and
            * arrows - and the typical jump called out against it.
            */}
          {(() => {
            /*
             * Tied to the scaffold, not to the edge of the view. Anchoring it
             * to the view is why it slid about whenever the zoom changed.
             */
            const dimX = scafEdge + dir * puf * 3;
            // Top of the scaffold, from the real jump heights - not a count
            // multiplied by 6'-4", which overshoots any leg with a short frame.
            const topY = grade - jumpHeightsFt.reduce((sum, h) => sum + h, 0) * puf;
            const totalFt = (grade - topY) / puf;
            return (
              <g opacity="0.85">
                <line x1={dimX} y1={topY} x2={dimX} y2={grade}
                  stroke="#71717a" strokeWidth={stroke}
                  markerStart="url(#ksArrow)" markerEnd="url(#ksArrow)" />
                <line x1={dimX} y1={topY} x2={scafEdge} y2={topY}
                  stroke="#3f3f46" strokeWidth={stroke * 0.7} />
                <line x1={dimX} y1={grade} x2={scafEdge} y2={grade}
                  stroke="#3f3f46" strokeWidth={stroke * 0.7} />
                <text x={dimX + dir * text * 0.6} y={(topY + grade) / 2}
                  textAnchor="middle" fontSize={text * 0.95} fill="#a1a1aa"
                  fontFamily="ui-monospace, monospace"
                  transform={`${unflip(dimX + dir * text * 0.6)} rotate(-90 ${dimX + dir * text * 0.6} ${(topY + grade) / 2})`}>
                  {ftIn(totalFt)} OVERALL
                </text>
                <text x={dimX + dir * -text * 1.4} y={grade - (jumpHeightsFt[0] ?? 6.333) * puf * 0.5}
                  textAnchor="middle" fontSize={text * 0.8} fill="#71717a"
                  fontFamily="ui-monospace, monospace"
                  transform={unflip(dimX + dir * -text * 1.4) || undefined}>
                  {ftIn(jumpHeightsFt[0] ?? 6.333)} TYP
                </text>
              </g>
            );
          })()}

          {items.map(item => {
            if (isTombstone(item) || item.x === undefined || item.y === undefined) return null;
            const on = selected === item.id;
            const mine = item.source === "user";
            const accent = on ? "#ffffff" : mine ? "#22d3ee" : "#d4d4d8";

            if (item.kind === "dimension" && item.x2 !== undefined && item.y2 !== undefined) {
              return (
                <g key={item.id} opacity={on ? 1 : 0.9}>
                  <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2}
                    stroke={on ? "#fff" : "#22d3ee"} strokeWidth={stroke}
                    markerStart="url(#ksArrow)" markerEnd="url(#ksArrow)" />
                  <text x={(item.x + item.x2) / 2} y={(item.y + item.y2) / 2 - text * 0.45}
                    textAnchor="middle" fontSize={text} fill="#22d3ee"
                    fontFamily="ui-monospace, monospace" fontWeight="bold"
                    stroke="#000" strokeWidth={stroke * 2.4} paintOrder="stroke"
                    transform={unflip((item.x + item.x2) / 2) || undefined}>
                    {item.label}
                  </text>
                </g>
              );
            }

            // Its own width, so a 3' run on a ledge is drawn 3' wide beside a
            // 5' main run rather than borrowing the main run's outline.
            const deckW = widthFtOf(item) * puf;
            // Each frame carries its own height, so a 3' finishing frame is
            // drawn 3' tall rather than borrowing a 6'-4" outline.
            const frameFt = item.kind === "frame" ? frameFtOf(item) : 6.333;
            const jumpH = frameFt * puf;
            const legW = Math.max(puf * 0.28, stroke * 2);
            // Everything is drawn from the leg line outward, whichever side
            // the scaffold stands on.
            const x0 = dir === -1 ? item.x - deckW : item.x;

            if (item.kind === "frame") {
              // Hockeys stop 4'-6" down a 6'-4" frame; scale for shorter ones.
              const hockeyH = Math.min(4.5, frameFt * 0.71) * puf;
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  {/* Legs as tube - two lines each, not one. */}
                  <rect x={x0} y={item.y} width={legW} height={jumpH}
                    fill="none" stroke={accent} strokeWidth={stroke * 0.9} />
                  <rect x={x0 + deckW - legW} y={item.y} width={legW} height={jumpH}
                    fill="none" stroke={accent} strokeWidth={stroke * 0.9} />
                  {/* Head. */}
                  <line x1={x0} y1={item.y} x2={x0 + deckW} y2={item.y}
                    stroke={accent} strokeWidth={stroke} />
                  {/* Hockeys - the lugs a cross brace pins to, stopping short
                      of the bottom, which is why a brace crosses where it does. */}
                  <rect x={x0 + legW} y={item.y} width={legW * 0.9} height={hockeyH}
                    fill="none" stroke={accent} strokeWidth={stroke * 0.65} opacity="0.8" />
                  <rect x={x0 + deckW - legW * 1.9} y={item.y} width={legW * 0.9} height={hockeyH}
                    fill="none" stroke={accent} strokeWidth={stroke * 0.65} opacity="0.8" />
                  {on && <circle cx={item.x} cy={item.y} r={puf * 0.45} fill="none" stroke="#fff" strokeWidth={stroke} />}
                </g>
              );
            }

            if (item.kind === "plank") {
              /*
               * One board per piece, sitting on the frame head or the bracket.
               *
               * Each plank piece used to draw a whole deck of boards starting
               * from its own position - three overlapping decks, shifted, with
               * boards spilling past the frame into the air. That was the
               * floating look.
               */
              const b = boardRect(item);
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h}
                    fill="#3f3f46" stroke={on ? "#fff" : accent} strokeWidth={stroke * 0.6} />
                </g>
              );
            }

            if (item.kind === "bracket") {
              const reach = item.variant === "BR12S" ? 1 : item.variant === "BR20S" ? 20 / 12 : 2.5;
              const bw = reach * puf;
              /*
               * Off the wall side of the frame, reaching in toward the wall -
               * the triangle's upright against the frame, its point at the
               * recessed face. It was drawn off the outside, pointing away.
               */
              const frameSide = item.x;
              const tip = item.x - dir * bw;
              const beyond = (item.label ?? "").startsWith("beyond");
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  <path
                    d={`M${frameSide},${item.y} L${tip},${item.y} L${frameSide},${item.y + puf * 1.1} Z`}
                    fill="none" stroke={beyond ? "#f87171" : accent} strokeWidth={stroke * 0.9}
                  />
                  <line x1={frameSide} y1={item.y} x2={tip} y2={item.y}
                    stroke={beyond ? "#f87171" : accent} strokeWidth={stroke * 1.4} />
                  {on && <circle cx={item.x} cy={item.y} r={puf * 0.45} fill="none" stroke="#fff" strokeWidth={stroke} />}
                </g>
              );
            }

            if (item.kind === "guardrail") {
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  <line x1={x0} y1={item.y - puf * 3.5} x2={x0 + deckW} y2={item.y - puf * 3.5}
                    stroke={accent} strokeWidth={stroke * 0.9} />
                  <line x1={x0} y1={item.y - puf * 1.8} x2={x0 + deckW} y2={item.y - puf * 1.8}
                    stroke={accent} strokeWidth={stroke * 0.7} />
                  {/* A post at each end - rails have to land on something. */}
                  {[x0, x0 + deckW].map((px, k) => (
                    <line key={k} x1={px} y1={item.y} x2={px} y2={item.y - puf * 3.5}
                      stroke={accent} strokeWidth={stroke * 0.9} />
                  ))}
                </g>
              );
            }

            if (item.kind === "jack") {
              /*
               * Screw jack, base plate and mudsill.
               *
               * At grade they bed into the ground, so they sit below the line.
               * On a ledge there is nothing to bed into - the plate sits on the
               * slab and everything is built up from it. They used to hang
               * below the ledge either way, through the floor of the setback.
               */
              const onLedge = (item.label ?? "").includes("ledge");
              const plateY = onLedge ? item.y - puf * 0.16 : item.y;
              const sillY = onLedge ? item.y - puf * 0.46 : item.y + puf * 0.18;
              const jackTop = onLedge ? plateY - puf * 1.1 : item.y - puf * 1.1;
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  {[x0, x0 + deckW - legW].map((lx, i) => (
                    <g key={i}>
                      <rect x={lx} y={jackTop} width={legW} height={puf * 1.1}
                        fill="none" stroke={accent} strokeWidth={stroke * 0.8} />
                      {Array.from({ length: 4 }, (_, t) => (
                        <line key={t} x1={lx} y1={jackTop + puf * 0.15 + t * puf * 0.25}
                          x2={lx + legW} y2={jackTop + puf * 0.15 + t * puf * 0.25}
                          stroke={accent} strokeWidth={stroke * 0.5} opacity="0.7" />
                      ))}
                      <rect x={lx - legW * 0.8} y={plateY} width={legW * 2.6} height={puf * 0.16}
                        fill="none" stroke={accent} strokeWidth={stroke * 0.8} />
                      <rect x={lx - legW * 1.6} y={sillY} width={legW * 4.2} height={puf * 0.28}
                        fill="#3f3f46" stroke={accent} strokeWidth={stroke * 0.6} />
                    </g>
                  ))}
                </g>
              );
            }

            if (item.kind === "tube") {
              /*
               * A tie from a floating leg back to the main run. Drawn its real
               * length with a clamp at each end - it is what stops the leg on
               * a narrow ledge standing on nothing.
               */
              const len = (parseFloat(item.label ?? "") || scaffoldWidthFt) * puf;
              const end = item.x + dir * len;
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  <line x1={item.x} y1={item.y} x2={end} y2={item.y}
                    stroke={accent} strokeWidth={stroke * 1.2} />
                  {[item.x, end].map((cx, k) => (
                    <circle key={k} cx={cx} cy={item.y} r={puf * 0.18}
                      fill="none" stroke={accent} strokeWidth={stroke} />
                  ))}
                </g>
              );
            }

            // Anything else, as a plain member.
            return (
              <g key={item.id} opacity={on ? 1 : 0.95}>
                <rect x={x0} y={item.y - puf * 0.1} width={deckW} height={puf * 0.2}
                  fill="none" stroke={accent} strokeWidth={stroke * 0.9} />
                {on && <circle cx={item.x} cy={item.y} r={puf * 0.45} fill="none" stroke="#fff" strokeWidth={stroke} />}
              </g>
            );
          })}

          {/*
            * Callouts, on angled leaders with dot terminators - the way a
            * drawing labels what it shows.
            */}
          {!editing && (() => {
            // Out past the dimension string, in the open - never over the
            // hatched building, where they could not be read.
            const calloutX = scafEdge + dir * puf * 8;
            const anchor = screenDir === -1 ? "end" : "start";
            const notes: { y: number; text: string }[] = [];
            const firstFrame = items.find(i => i.kind === "frame");
            const firstBracket = items.find(i => i.kind === "bracket");
            const firstPlank = items.find(i => i.kind === "plank");
            const jack = items.find(i => i.kind === "jack");
            if (firstFrame?.y !== undefined) {
              notes.push({ y: firstFrame.y + (parseFloat(firstFrame.label ?? "") || 6.333) * puf * 0.5,
                text: `${scaffoldWidthFt === 3.5 ? `3'-6"` : `${scaffoldWidthFt}'`}-WIDE SCAFFOLD FRAME (TYP)` });
            }
            if (firstPlank?.y !== undefined) notes.push({ y: firstPlank.y, text: "PLANKING (TYP)" });
            if (firstBracket?.y !== undefined) notes.push({ y: firstBracket.y, text: `SIDE BRACKET ${firstBracket.variant}` });
            if (jack?.y !== undefined) notes.push({ y: jack.y - puf * 0.6, text: "SCREW JACK, BASE PLATE, MUDSILL" });
            return notes.map((note, i) => (
              <g key={i} opacity="0.75">
                <path
                  d={`M${legFace + dir * scaffoldWidthFt * puf * 0.5},${note.y} L${calloutX - dir * puf * 1.2},${note.y - puf * 0.8} L${calloutX},${note.y - puf * 0.8}`}
                  fill="none" stroke="#52525b" strokeWidth={stroke * 0.6}
                  markerStart="url(#ksDot)"
                />
                <text x={calloutX} y={note.y - puf * 1.05} textAnchor={anchor}
                  fontSize={text * 0.78} fill="#71717a" fontFamily="ui-monospace, monospace"
                  transform={unflip(calloutX) || undefined}>
                  {note.text}
                </text>
              </g>
            ));
          })()}

          {snapHint && (
            <g pointerEvents="none">
              <circle cx={snapHint.x} cy={snapHint.y} r={stroke * 5}
                fill="none" stroke="#fbbf24" strokeWidth={stroke * 1.3} />
              <circle cx={snapHint.x} cy={snapHint.y} r={stroke * 1.4} fill="#fbbf24" />
            </g>
          )}

          {dimMode && dimFrom && dimTo && (
            <line x1={dimFrom.x} y1={dimFrom.y} x2={dimTo.x} y2={dimTo.y}
              stroke="#22d3ee" strokeWidth={stroke} strokeDasharray={`${stroke * 4},${stroke * 3}`} />
          )}
          </g>
        </svg>

        {!editing && (
          <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[9px] text-zinc-700">
            Korban drew this from the traced wall. Edit to move, add or dimension.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
