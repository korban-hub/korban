"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutSection, type SectionDraftingItem, type SectionViewRecord } from "@/lib/projectStore";

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

/** What the material bank offers, and how each is drawn. */
const BANK: { kind: SectionDraftingItem["kind"]; variant: string; label: string }[] = [
  { kind: "frame",     variant: "FO6L3", label: "Frame 3'" },
  { kind: "frame",     variant: "FO6L42", label: "Frame 42\"" },
  { kind: "frame",     variant: "FO6L",  label: "Frame 5'" },
  { kind: "bracket",   variant: "BR12S", label: "Bracket 12\"" },
  { kind: "bracket",   variant: "BR20S", label: "Bracket 20\"" },
  { kind: "bracket",   variant: "BR30S", label: "Bracket 30\"" },
  { kind: "plank",     variant: "WP10",  label: "Plank" },
  { kind: "guardrail", variant: "GR10",  label: "Guardrail" },
  { kind: "tube",      variant: "ST10SG", label: "Tube" },
  { kind: "jack",      variant: "AL1S",  label: "Screw jack" },
];

/** How a dimension line is constrained while it is being drawn. */
type SnapMode = "ortho" | "vertical" | "horizontal" | "free";

export default function SectionDrawing({
  section,
  frameTall,
  scaffoldWidthFt,
  planksPerDeck,
  onSave,
}: {
  section: SectionViewRecord | null;
  frameTall: number;
  scaffoldWidthFt: number;
  planksPerDeck: number;
  onSave: (sectionId: string, items: SectionDraftingItem[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<SectionDraftingItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: SectionDraftingItem["kind"]; variant: string } | null>(null);
  const [dimMode, setDimMode] = useState(false);
  const [snap, setSnap] = useState<SnapMode>("ortho");
  const [dimFrom, setDimFrom] = useState<Point | null>(null);
  const [dimTo, setDimTo] = useState<Point | null>(null);
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const puf = section?.pageUnitsPerFoot ?? 0;
  const profile = section?.wallOutline ?? [];
  const ready = profile.length >= 2 && puf > 0;

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
    });
  }, [ready, profile, puf, frameTall, scaffoldWidthFt, planksPerDeck, section?.scaffoldSide]);

  useEffect(() => {
    const mine = (section?.draftingAdditions ?? []).filter(i => i.source === "user");
    setItems([...korbanItems, ...mine]);
    setDirty(false);
    setSelected(null);
  }, [korbanItems, section?.id]);

  // The drawing is measured in the sheet's own units, so the view has to be
  // worked out from the traced profile rather than assumed.
  const bounds = useMemo(() => {
    const pts: Point[] = [...profile.map(p => ({ x: p.x, y: p.y }))];
    items.forEach(i => {
      if (i.x !== undefined && i.y !== undefined) pts.push({ x: i.x, y: i.y });
      if (i.x2 !== undefined && i.y2 !== undefined) pts.push({ x: i.x2, y: i.y2 });
    });
    if (pts.length === 0) return { minX: 0, minY: 0, w: 100, h: 100 };
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const pad = Math.max(puf * 6, 40);
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    return { minX, minY, w: Math.max(...xs) - minX + pad, h: Math.max(...ys) - minY + pad };
  }, [profile, items, puf]);

  function toDrawing(e: React.MouseEvent | React.PointerEvent): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: bounds.minX + ((e.clientX - r.left) / r.width) * bounds.w,
      y: bounds.minY + ((e.clientY - r.top) / r.height) * bounds.h,
    };
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

  function onPointerDown(e: React.PointerEvent) {
    if (!editing) return;
    const pt = toDrawing(e);
    if (!pt) return;

    if (dimMode) {
      if (!dimFrom) { setDimFrom(pt); setDimTo(null); return; }
      const end = applySnap(dimFrom, pt);
      const ft = Math.hypot(end.x - dimFrom.x, end.y - dimFrom.y) / Math.max(puf, 0.0001);
      change([...items, {
        id: `d-${Date.now().toString(36)}`,
        kind: "dimension", variant: snap, level: 0,
        x: dimFrom.x, y: dimFrom.y, x2: end.x, y2: end.y,
        label: `${Math.floor(ft)}'-${Math.round((ft % 1) * 12)}"`,
        source: "user",
      }]);
      setDimFrom(null); setDimTo(null);
      return;
    }

    if (pending) {
      change([...items, {
        id: `u-${Date.now().toString(36)}`,
        kind: pending.kind, variant: pending.variant, level: 0,
        x: pt.x, y: pt.y, source: "user",
      }]);
      setPending(null);
      return;
    }

    // Grab the nearest piece, so a click does not have to be exact.
    let best: string | null = null, bestDist = Math.max(puf * 2, 20);
    items.forEach(i => {
      if (i.x === undefined || i.y === undefined) return;
      const d = Math.hypot(i.x - pt.x, i.y - pt.y);
      if (d < bestDist) { bestDist = d; best = i.id; }
    });
    setSelected(best);
    if (best) {
      const item = items.find(i => i.id === best)!;
      dragRef.current = { id: best, dx: pt.x - (item.x ?? 0), dy: pt.y - (item.y ?? 0) };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!editing) return;
    const pt = toDrawing(e);
    if (!pt) return;
    if (dimMode && dimFrom) { setDimTo(applySnap(dimFrom, pt)); return; }
    const drag = dragRef.current;
    if (!drag) return;
    change(items.map(i => i.id === drag.id
      ? { ...i, x: pt.x - drag.dx, y: pt.y - drag.dy, source: "user" as const }
      : i));
  }

  function onPointerUp() { dragRef.current = null; }

  function removeSelected() {
    if (!selected) return;
    change(items.filter(i => i.id !== selected));
    setSelected(null);
  }

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
  const dir = (section.scaffoldSide ?? "left") === "left" ? -1 : 1;
  const faces = profile.map(p => p.x);
  const outerFace = dir === -1 ? Math.max(...faces) : Math.min(...faces);
  const legFace = outerFace + dir * puf;
  const grade = Math.max(...profile.map(p => p.y));

  return (
    <div className="flex h-full flex-col">
      {/* Tools. Hidden until editing, so the drawing reads as a drawing. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2">
        <button onClick={() => { setEditing(v => !v); setPending(null); setDimMode(false); setSelected(null); }}
          className={`rounded-lg border px-2 py-1 text-[9px] font-bold transition ${editing ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>
          {editing ? "\u2713 Editing" : "Edit"}
        </button>

        {editing && (
          <>
            <button onClick={() => { setDimMode(v => !v); setPending(null); setDimFrom(null); }}
              className={`rounded-lg border px-2 py-1 text-[9px] font-bold transition ${dimMode ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300" : "border-zinc-700 text-zinc-400 hover:border-cyan-400/40"}`}>
              Dimension
            </button>
            {dimMode && (
              <div className="flex items-center gap-0.5">
                {(["ortho", "vertical", "horizontal", "free"] as SnapMode[]).map(m => (
                  <button key={m} onClick={() => setSnap(m)}
                    title={m === "ortho" ? "Square, whichever way is nearer" : m === "free" ? "No locking" : `Locked ${m}`}
                    className={`rounded border px-1.5 py-1 text-[8.5px] ${snap === m ? "border-cyan-400/60 text-cyan-300" : "border-zinc-800 text-zinc-600 hover:text-zinc-400"}`}>
                    {m === "ortho" ? "90\u00b0/0\u00b0" : m === "vertical" ? "\u2195" : m === "horizontal" ? "\u2194" : "free"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={removeSelected} disabled={!selected}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-[9px] font-bold text-zinc-400 transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-30">
              Delete
            </button>
            <button onClick={save} disabled={!dirty}
              className={`rounded-lg px-2.5 py-1 text-[9px] font-bold transition ${dirty ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border border-zinc-800 text-zinc-600"}`}>
              {dirty ? "Save" : "Saved"}
            </button>
          </>
        )}

        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          {section.label} &middot; {items.length} pieces
        </span>
      </div>

      {editing && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-900 bg-black px-3 py-2">
          <span className="mr-1 self-center font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">
            Material
          </span>
          {BANK.map(b => (
            <button key={b.variant + b.kind}
              onClick={() => { setPending(pending?.variant === b.variant ? null : b); setDimMode(false); }}
              className={`rounded border px-1.5 py-1 text-[8.5px] transition ${pending?.variant === b.variant ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"}`}>
              {b.label}
            </button>
          ))}
          {pending && (
            <span className="self-center pl-1 font-mono text-[8.5px] text-orange-400">
              click to place
            </span>
          )}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-[#080604]" style={{ minHeight: 0 }}>
        <svg ref={svgRef}
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
          className="korban-section-print h-full w-full"
          style={{ cursor: editing ? (pending || dimMode ? "crosshair" : "default") : "default" }}
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

          {/* Cut material behind the traced face. */}
          <polygon
            points={[
              ...profile.map(p => `${p.x},${p.y}`),
              `${dir === -1 ? bounds.minX + bounds.w : bounds.minX},${profile[profile.length - 1].y}`,
              `${dir === -1 ? bounds.minX + bounds.w : bounds.minX},${grade}`,
            ].join(" ")}
            fill="url(#ksConcrete)" opacity="0.85"
          />
          <polyline
            points={profile.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="#a1a1aa" strokeWidth={stroke * 1.8}
          />

          {/* Grade. */}
          <line x1={bounds.minX} y1={grade} x2={bounds.minX + bounds.w} y2={grade}
            stroke="#71717a" strokeWidth={stroke * 1.4} />
          <rect x={bounds.minX} y={grade} width={bounds.w} height={puf * 1.2}
            fill="url(#ksGround)" opacity="0.7" />

          {/*
            * Overall height, down the open side, with extension lines and
            * arrows - and the typical jump called out against it.
            */}
          {(() => {
            const dimX = dir === -1 ? bounds.minX + puf * 2.5 : bounds.minX + bounds.w - puf * 2.5;
            const topY = grade - frameTall * 6.333 * puf;
            const totalFt = (grade - topY) / puf;
            return (
              <g opacity="0.85">
                <line x1={dimX} y1={topY} x2={dimX} y2={grade}
                  stroke="#71717a" strokeWidth={stroke}
                  markerStart="url(#ksArrow)" markerEnd="url(#ksArrow)" />
                <line x1={dimX} y1={topY} x2={legFace} y2={topY}
                  stroke="#3f3f46" strokeWidth={stroke * 0.7} />
                <line x1={dimX} y1={grade} x2={legFace} y2={grade}
                  stroke="#3f3f46" strokeWidth={stroke * 0.7} />
                <text x={dimX - text * 0.4} y={(topY + grade) / 2}
                  textAnchor="middle" fontSize={text * 0.95} fill="#a1a1aa"
                  fontFamily="ui-monospace, monospace"
                  transform={`rotate(-90 ${dimX - text * 0.4} ${(topY + grade) / 2})`}>
                  {Math.floor(totalFt)}&apos;-{Math.round((totalFt % 1) * 12)}&quot; OVERALL
                </text>
                <text x={dimX + dir * -text * 1.4} y={grade - 3.2 * 6.333 * puf}
                  textAnchor="middle" fontSize={text * 0.8} fill="#71717a"
                  fontFamily="ui-monospace, monospace">
                  6&apos;-4&quot; TYP
                </text>
              </g>
            );
          })()}

          {items.map(item => {
            if (item.x === undefined || item.y === undefined) return null;
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
                    stroke="#000" strokeWidth={stroke * 2.4} paintOrder="stroke">
                    {item.label}
                  </text>
                </g>
              );
            }

            const deckW = scaffoldWidthFt * puf;
            const jumpH = 6.333 * puf;
            const legW = Math.max(puf * 0.28, stroke * 2);
            // Everything is drawn from the leg line outward, whichever side
            // the scaffold stands on.
            const x0 = dir === -1 ? item.x - deckW : item.x;

            if (item.kind === "frame") {
              const hockeyH = (4.5 / 6.333) * jumpH;
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
              const boards = Math.max(1, planksPerDeck);
              const gap = puf * 0.06;
              const inner = deckW - legW * 2;
              const w = (inner - gap * (boards - 1)) / boards;
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  {Array.from({ length: boards }, (_, b) => (
                    <rect key={b}
                      x={x0 + legW + b * (w + gap)} y={item.y - puf * 0.22}
                      width={w} height={puf * 0.22}
                      fill="#3f3f46" stroke={accent} strokeWidth={stroke * 0.6} />
                  ))}
                </g>
              );
            }

            if (item.kind === "bracket") {
              const reach = item.variant === "BR12S" ? 1 : item.variant === "BR20S" ? 20 / 12 : 2.5;
              const bw = reach * puf;
              const bx = dir === -1 ? x0 - bw : x0 + deckW;
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  {/* Bracket as a triangle under a deck, the way it carries. */}
                  <path
                    d={`M${dir === -1 ? bx + bw : bx},${item.y} L${dir === -1 ? bx : bx + bw},${item.y} L${dir === -1 ? bx + bw : bx},${item.y + puf * 1.1} Z`}
                    fill="none" stroke={accent} strokeWidth={stroke * 0.9}
                  />
                  <line x1={bx} y1={item.y} x2={bx + bw} y2={item.y}
                    stroke={accent} strokeWidth={stroke * 1.4} />
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
                  <line x1={x0} y1={item.y} x2={x0} y2={item.y - puf * 3.5}
                    stroke={accent} strokeWidth={stroke * 0.9} />
                </g>
              );
            }

            if (item.kind === "jack") {
              // Screw jack, base plate and mudsill, as three separate pieces.
              return (
                <g key={item.id} opacity={on ? 1 : 0.95}>
                  {[x0, x0 + deckW - legW].map((lx, i) => (
                    <g key={i}>
                      <rect x={lx} y={item.y - puf * 1.1} width={legW} height={puf * 1.1}
                        fill="none" stroke={accent} strokeWidth={stroke * 0.8} />
                      {Array.from({ length: 4 }, (_, t) => (
                        <line key={t} x1={lx} y1={item.y - puf * 0.95 + t * puf * 0.25}
                          x2={lx + legW} y2={item.y - puf * 0.95 + t * puf * 0.25}
                          stroke={accent} strokeWidth={stroke * 0.5} opacity="0.7" />
                      ))}
                      <rect x={lx - legW * 0.8} y={item.y} width={legW * 2.6} height={puf * 0.16}
                        fill="none" stroke={accent} strokeWidth={stroke * 0.8} />
                      <rect x={lx - legW * 1.6} y={item.y + puf * 0.18} width={legW * 4.2} height={puf * 0.28}
                        fill="#3f3f46" stroke={accent} strokeWidth={stroke * 0.6} />
                    </g>
                  ))}
                </g>
              );
            }

            // Tube, and anything else, as a plain member.
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
            const calloutX = dir === -1 ? bounds.minX + bounds.w - puf * 1.5 : bounds.minX + puf * 1.5;
            const anchor = dir === -1 ? "end" : "start";
            const notes: { y: number; text: string }[] = [];
            const firstFrame = items.find(i => i.kind === "frame");
            const firstBracket = items.find(i => i.kind === "bracket");
            const firstPlank = items.find(i => i.kind === "plank");
            const jack = items.find(i => i.kind === "jack");
            if (firstFrame?.y !== undefined) {
              notes.push({ y: firstFrame.y + 6.333 * puf * 0.5,
                text: `${scaffoldWidthFt === 3.5 ? `3'-6"` : `${scaffoldWidthFt}'`}-WIDE SCAFFOLD FRAME (TYP)` });
            }
            if (firstPlank?.y !== undefined) notes.push({ y: firstPlank.y, text: "PLANKING (TYP)" });
            if (firstBracket?.y !== undefined) notes.push({ y: firstBracket.y, text: `SIDE BRACKET ${firstBracket.variant}` });
            if (jack?.y !== undefined) notes.push({ y: jack.y - puf * 0.6, text: "SCREW JACK, BASE PLATE, MUDSILL" });
            return notes.map((note, i) => (
              <g key={i} opacity="0.75">
                <path
                  d={`M${legFace + dir * -puf * 0.5},${note.y} L${calloutX + (dir === -1 ? -puf * 1.5 : puf * 1.5)},${note.y - puf * 0.8} L${calloutX},${note.y - puf * 0.8}`}
                  fill="none" stroke="#52525b" strokeWidth={stroke * 0.6}
                  markerStart="url(#ksDot)"
                />
                <text x={calloutX} y={note.y - puf * 1.05} textAnchor={anchor}
                  fontSize={text * 0.78} fill="#71717a" fontFamily="ui-monospace, monospace">
                  {note.text}
                </text>
              </g>
            ));
          })()}

          {dimMode && dimFrom && dimTo && (
            <line x1={dimFrom.x} y1={dimFrom.y} x2={dimTo.x} y2={dimTo.y}
              stroke="#22d3ee" strokeWidth={stroke} strokeDasharray={`${stroke * 4},${stroke * 3}`} />
          )}
        </svg>

        {!editing && (
          <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[9px] text-zinc-700">
            Korban drew this from the traced wall. Edit to move, add or dimension.
          </p>
        )}
      </div>
    </div>
  );
}
