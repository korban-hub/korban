"use client";

/**
 * Bid presentation — the sales face of a KORBAN estimate.
 *
 * Landscape, standard template, two minutes hard ceiling. Slides carry two or
 * three sections each rather than one fact apiece, so the deck moves.
 *
 * Depth decides how much evidence there is to show. Quick Bid gets the
 * numbers and the price. Full Bid earns the plan layout. Korban Bid earns
 * the model and the annotated bay. Nothing is invented to fill a slide — if
 * the estimator never traced a plan, the plan section says so plainly rather
 * than showing a drawing of a building that isn't theirs.
 *
 * The one-page summary carries the job's real model: the engine sets the
 * scaffold out again from the outline in the link (see ProposalModel), so the
 * customer watches the scaffold they are buying turn under orange light.
 *
 * TRADE LANGUAGE: this is a scaffold document. Vertical repetition is a
 * JUMP, never a "lift". A leg's frame arrangement is FRAMES PER LEG or
 * FRAME CONFIGURATION, never a "stack".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { setOut, type PlanPoint, type SegmentLegs } from "@/lib/scaffoldSetOut";
import { buildScaffoldModel, pickHatchBays, type ScaffoldModel } from "@/lib/scaffoldModel";
import { buildScaffoldGroup, disposePalette, proposalPalette, FEET } from "@/lib/scaffoldScene";
import { computeFrameMakeup, DEFAULT_SCREW_JACK_MAX_IN, DEFAULT_WORKER_REACH_FT, STANDARD_BAY_LENGTHS } from "@/lib/projectStore";

export type BidLevel = "quick-bid" | "full-bid" | "korban-bid";

export type BidPresentationData = {
  projectName: string;
  projectAddress: string;
  customer: string;
  estimator: string;
  proposalNumber: string;
  bidDate: string;
  depth: BidLevel;

  linearFeet: number;
  wallHeight: number;
  frames: number;
  planks: number;
  crossBraces: number;
  guardrails: number;
  basePlates: number;
  screwJacks: number;
  couplingPins: number;
  bays: number;
  legs: number;
  /** Frames per leg — the frame configuration. Never "stack". */
  framesPerLeg: number;
  /** Vertical repetitions. Never "lifts". */
  jumps: number;
  scaffoldWidth: number;
  bayLength: number;
  planksPerDeck: number;

  erectDays: number;
  dismantleDays: number;
  crewSize: number;
  erectHours: number;
  dismantleHours: number;

  rentalRevenue: number;
  laborRevenue: number;
  rentalDays: number;
  finalBid: number;

  /** The company submitting the bid. From Backend > Company. */
  company: string;
  /** Bidder's own contact line, not the client's. */
  companyPhone: string;
  companyEmail: string;
  /** Trade word swapped into the cost slide. "scaffold" today. */
  trade: string;
  /** Which faces are in scope. Drives the coverage slide. */
  elevationsCovered: string[];
  /** Traced plan outline in page units. Empty until a plan is traced. */
  outline: { x: number; y: number }[];
  elevations: { elevation: string; linearFeet: number }[];

  /*
   * What the proposal's model needs to set the scaffold out again from the
   * outline, the same way Set Scaffold did: the plan's scale, and the job's
   * own choices. Zero scale means the link predates the model; it then sizes
   * the plan from the coverage.
   */
  /** Page units per foot of the outline. */
  unitsPerFoot: number;
  /** Turnaround bays on every corner. */
  turnaround: boolean;
  /** Ladder hatch bays: one per 100' of run, or one per elevation. */
  hatchMode: "per100" | "perElevation";
  /** Debris netting on the outer face - the Netting add was taken. */
  netting: boolean;

  /*
   * What the number buys, in the words the proposal sheet uses on its first
   * line item, so the deck and the paper say the same thing.
   */
  /** The finish trades the scaffold serves: "stucco and paint". */
  finish: string;
  /** The estimator's note under line item 01. */
  proposalNotes: string;
  /** Titles of the alternates taken into the price. */
  alternatesIncluded: string[];
  /** What those alternates add, so the base can be stated on its own. */
  alternateRevenue: number;
  /** Rent per month once the first rental period runs out. */
  rentalThereafter: number;
};

type Slide = {
  id: string;
  seconds: number;
  render: (data: BidPresentationData, phase: number) => React.ReactNode;
};

/**
 * Renders an estimator as "Harold P." Handles a stored name either way round,
 * since some records read "Harold Pierre" and older ones read "H. Pierre".
 */
function formatEstimator(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  // Already initial-first ("H. Pierre") - leave it alone rather than guess.
  if (first.replace(".", "").length <= 1) return name;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

const LEVEL_LABEL: Record<BidLevel, string> = {
  "quick-bid": "Quick Bid",
  "full-bid": "Full Bid",
  "korban-bid": "Korban Bid",
};

/** Stands in when no plan has been traced, so the slide still reads. */
const REFERENCE_OUTLINE = [
  { x: 0, y: 0 }, { x: 340, y: 0 }, { x: 340, y: 120 }, { x: 250, y: 120 },
  { x: 250, y: 230 }, { x: 340, y: 230 }, { x: 340, y: 330 }, { x: 0, y: 330 },
];

// ----------------------------------------------------------------------
// Motion
// ----------------------------------------------------------------------

function useCountUp(target: number, active: boolean, durationMs = 850) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, active, durationMs]);
  return value;
}

function useArmed(active: boolean, delay: number) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!active) {
      setArmed(false);
      return;
    }
    const timer = window.setTimeout(() => setArmed(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);
  return armed;
}

function Figure({
  value, label, unit, active, size = "md", delay = 0,
}: {
  value: number;
  label: string;
  unit?: string;
  active: boolean;
  size?: "sm" | "md" | "lg";
  delay?: number;
}) {
  const armed = useArmed(active, delay);
  const counted = useCountUp(value, armed);
  const scale = size === "lg" ? "text-[76px]" : size === "md" ? "text-[44px]" : "text-[28px]";

  return (
    <div
      className="transition-all duration-500"
      style={{ opacity: armed ? 1 : 0, transform: armed ? "translateY(0)" : "translateY(9px)" }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`font-mono font-bold leading-none text-orange-400 ${scale}`}>
        {Math.round(counted).toLocaleString()}
        {unit && <span className="ml-1.5 text-[0.34em] font-normal text-zinc-500">{unit}</span>}
      </p>
    </div>
  );
}

/** Types a line out character by character. Used on the opening title. */
function Typed({
  text, active, delay = 0, msPerChar = 42, className, style,
}: {
  text: string;
  active: boolean;
  delay?: number;
  msPerChar?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const armed = useArmed(active, delay);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!armed) {
      setCount(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const next = Math.min(text.length, Math.floor((now - start) / msPerChar));
      setCount(next);
      if (next < text.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [armed, text, msPerChar]);

  const done = count >= text.length;

  return (
    <span className={className} style={style}>
      {text.slice(0, count)}
      <span
        className="inline-block align-baseline bg-orange-500"
        style={{
          width: "0.06em",
          height: "0.82em",
          marginLeft: "0.04em",
          opacity: armed && !done ? 1 : 0,
          transition: "opacity 200ms",
        }}
      />
    </span>
  );
}

function Rise({
  children, active, delay = 0,
}: {
  children: React.ReactNode;
  active: boolean;
  delay?: number;
}) {
  const armed = useArmed(active, delay);
  return (
    <div
      className="transition-all duration-700"
      style={{ opacity: armed ? 1 : 0, transform: armed ? "translateY(0)" : "translateY(12px)" }}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------
// Drawings
// ----------------------------------------------------------------------

function usePlanGeometry(outline: { x: number; y: number }[], width: number, height: number) {
  return useMemo(() => {
    const points = outline.length >= 3 ? outline : REFERENCE_OUTLINE;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - 90) / spanX, (height - 90) / spanY);
    const offsetX = (width - spanX * scale) / 2 - minX * scale;
    const offsetY = (height - spanY * scale) / 2 - minY * scale;
    const projected = points.map((p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }));

    const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let index = 0; index < projected.length; index++) {
      const a = projected[index];
      const b = projected[(index + 1) % projected.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 12) continue;
      const nx = dy / length, ny = -dx / length;
      const count = Math.max(1, Math.round(length / 24));
      for (let step = 0; step <= count; step++) {
        const t = step / count;
        const px = a.x + dx * t, py = a.y + dy * t;
        ticks.push({ x1: px + nx * 4, y1: py + ny * 4, x2: px + nx * 14, y2: py + ny * 14 });
      }
    }
    return { projected, ticks, traced: outline.length >= 3 };
  }, [outline, width, height]);
}

/** Overhead plan with scaffold ticks stepping out around the perimeter. */
function PlanView({ outline, active }: { outline: { x: number; y: number }[]; active: boolean }) {
  const [drawn, setDrawn] = useState(0);
  const geometry = usePlanGeometry(outline, 560, 330);

  useEffect(() => {
    if (!active) {
      setDrawn(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 1300);
      setDrawn(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const path = geometry.projected.map((p) => `${p.x},${p.y}`).join(" ");
  const visible = Math.floor(geometry.ticks.length * drawn);

  return (
    <svg viewBox="0 0 560 330" className="h-full w-full">
      <polygon points={path} fill="rgba(249,115,22,0.05)" stroke="#3f3f46" strokeWidth="1.4" />
      <polygon
        points={path}
        fill="none"
        stroke="#F97316"
        strokeWidth="2"
        strokeDasharray="2400"
        strokeDashoffset={2400 - 2400 * drawn}
      />
      {geometry.ticks.slice(0, visible).map((tick, index) => (
        <line
          key={index}
          x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
          stroke="#f8fafc" strokeWidth="1.5" opacity="0.85"
        />
      ))}
    </svg>
  );
}

/** Turning isometric of the run, built from the same traced outline. */
function IsometricView({
  outline, framesPerLeg, active,
}: {
  outline: { x: number; y: number }[];
  framesPerLeg: number;
  active: boolean;
}) {
  const [angle, setAngle] = useState(0.4);
  const raf = useRef(0);

  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    const step = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setAngle((current) => current + delta * 0.26);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);

  const shape = useMemo(() => {
    const points = outline.length >= 3 ? outline : REFERENCE_OUTLINE;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const scale = 190 / span;
    return points.map((p) => ({ x: (p.x - cx) * scale, z: (p.y - cy) * scale }));
  }, [outline]);

  const levels = Math.max(1, Math.min(framesPerLeg, 12));
  const rise = 13;

  const project = (x: number, z: number, y: number) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: 260 + (x * cos - z * sin), y: 235 + (x * sin + z * cos) * 0.48 - y };
  };

  return (
    <svg viewBox="0 0 520 330" className="h-full w-full">
      {Array.from({ length: levels }, (_, level) => {
        const y = level * rise;
        const points = shape.map((p) => {
          const q = project(p.x, p.z, y);
          return `${q.x},${q.y}`;
        }).join(" ");
        const top = level === levels - 1;
        return (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke={top ? "#F97316" : "#71717a"}
            strokeWidth={top ? 1.8 : 0.85}
            opacity={top ? 0.95 : 0.24 + (level / levels) * 0.32}
          />
        );
      })}
      {shape.map((p, index) => {
        const base = project(p.x, p.z, 0);
        const apex = project(p.x, p.z, (levels - 1) * rise);
        return (
          <line
            key={index}
            x1={base.x} y1={base.y} x2={apex.x} y2={apex.y}
            stroke="#a1a1aa" strokeWidth="0.9" opacity="0.45"
          />
        );
      })}
    </svg>
  );
}

/**
 * One bay, drawn twice.
 *
 * ELEVATION (left) is the view along the wall: bay length wide, the deck
 * reads as one continuous board running lengthwise, cross braces X the bay,
 * and the guardrail sits at the top jump. Jump labels sit level with each
 * deck, because that is where a jump actually lands.
 *
 * SECTION (right) is the view through the run: scaffold width wide. This is
 * the only view where individual planks separate, so it is the only place
 * the plank count per deck can honestly be shown.
 */
function AnnotatedBay({
  jumps, planksPerDeck, scaffoldWidth, bayLength, active,
}: {
  jumps: number;
  planksPerDeck: number;
  scaffoldWidth: number;
  bayLength: number;
  active: boolean;
}) {
  const shown = Math.max(2, Math.min(jumps, 4));
  const jumpH = 62;
  const baseY = 302;

  const elevX = 92;
  const elevW = 176;

  const sectionX = 322;
  // Scaled off the real width so 5' visibly reads wider than 3'.
  const sectionW = Math.round(scaffoldWidth * 17);

  const widthLabel =
    scaffoldWidth >= 5 ? "5'-0\"" : scaffoldWidth >= 3.5 ? "3'-6\"" : "3'-0\"";

  return (
    <svg viewBox="0 0 640 340" className="h-full w-full">
      <defs>
        <marker id="kb-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#F97316" />
        </marker>
      </defs>

      <text x={elevX + elevW / 2} y="12" textAnchor="middle" fontSize="9" fill="#a1a1aa"
        fontFamily="ui-monospace, monospace" letterSpacing="1.6">ELEVATION</text>
      <text x={sectionX + sectionW / 2} y="12" textAnchor="middle" fontSize="9" fill="#a1a1aa"
        fontFamily="ui-monospace, monospace" letterSpacing="1.6">SECTION</text>

      {Array.from({ length: shown }, (_, index) => {
        const y = baseY - index * jumpH;
        const deckY = y - jumpH;
        const top = index === shown - 1;

        return (
          <g
            key={index}
            className="transition-opacity duration-500"
            style={{ opacity: active ? 1 : 0, transitionDelay: `${index * 170}ms` }}
          >
            {/* elevation */}
            <line x1={elevX} y1={y} x2={elevX} y2={deckY} stroke="#d4d4d8" strokeWidth="2.3" />
            <line x1={elevX + elevW} y1={y} x2={elevX + elevW} y2={deckY} stroke="#d4d4d8" strokeWidth="2.3" />
            <line x1={elevX} y1={deckY} x2={elevX + elevW} y2={deckY} stroke="#d4d4d8" strokeWidth="1.9" />
            <line x1={elevX} y1={y} x2={elevX + elevW} y2={deckY} stroke="#F97316" strokeWidth="1.4" opacity="0.85" />
            <line x1={elevX + elevW} y1={y} x2={elevX} y2={deckY} stroke="#F97316" strokeWidth="1.4" opacity="0.85" />
            <rect x={elevX + 2} y={deckY - 5} width={elevW - 4} height="5"
              fill="#a16207" stroke="#78350f" strokeWidth="0.4" />

            <line x1={elevX - 46} y1={deckY - 2} x2={elevX - 6} y2={deckY - 2}
              stroke="#3f3f46" strokeWidth="0.7" strokeDasharray="2,2" />
            <text x={elevX - 50} y={deckY + 1} textAnchor="end" fontSize="10" fill="#a1a1aa"
              fontFamily="ui-monospace, monospace">Jump {index + 1}</text>

            {/* section */}
            <line x1={sectionX} y1={y} x2={sectionX} y2={deckY} stroke="#d4d4d8" strokeWidth="2.3" />
            <line x1={sectionX + sectionW} y1={y} x2={sectionX + sectionW} y2={deckY} stroke="#d4d4d8" strokeWidth="2.3" />
            <line x1={sectionX} y1={deckY} x2={sectionX + sectionW} y2={deckY} stroke="#d4d4d8" strokeWidth="1.9" />
            {Array.from({ length: planksPerDeck }, (_, plank) => {
              const gap = 1.5;
              const w = (sectionW - 4 - gap * (planksPerDeck - 1)) / planksPerDeck;
              return (
                <rect
                  key={plank}
                  x={sectionX + 2 + plank * (w + gap)}
                  y={deckY - 5}
                  width={w}
                  height="5"
                  fill="#a16207"
                  stroke="#78350f"
                  strokeWidth="0.4"
                />
              );
            })}

            {top && (
              <>
                <line x1={elevX} y1={deckY - 32} x2={elevX + elevW} y2={deckY - 32} stroke="#fbbf24" strokeWidth="1.9" />
                <line x1={elevX} y1={deckY - 19} x2={elevX + elevW} y2={deckY - 19} stroke="#fbbf24" strokeWidth="1.3" />
                <line x1={elevX} y1={deckY} x2={elevX} y2={deckY - 32} stroke="#fbbf24" strokeWidth="1.9" />
                <line x1={elevX + elevW} y1={deckY} x2={elevX + elevW} y2={deckY - 32} stroke="#fbbf24" strokeWidth="1.9" />
                <line x1={sectionX} y1={deckY} x2={sectionX} y2={deckY - 32} stroke="#fbbf24" strokeWidth="1.9" />
                <line x1={sectionX + sectionW} y1={deckY} x2={sectionX + sectionW} y2={deckY - 32} stroke="#fbbf24" strokeWidth="1.9" />
              </>
            )}
          </g>
        );
      })}

      <line x1={elevX - 22} y1={baseY} x2={elevX + elevW + 20} y2={baseY} stroke="#52525b" strokeWidth="1.5" />
      <line x1={sectionX - 20} y1={baseY} x2={sectionX + sectionW + 20} y2={baseY} stroke="#52525b" strokeWidth="1.5" />

      <g className="transition-opacity duration-700" style={{ opacity: active ? 1 : 0, transitionDelay: "820ms" }}>
        <line x1={elevX} y1={baseY + 15} x2={elevX + elevW} y2={baseY + 15} stroke="#52525b" strokeWidth="0.8" />
        <text x={elevX + elevW / 2} y={baseY + 28} textAnchor="middle" fontSize="10" fill="#71717a"
          fontFamily="ui-monospace, monospace">{bayLength}&apos; bay</text>
        <line x1={sectionX} y1={baseY + 15} x2={sectionX + sectionW} y2={baseY + 15} stroke="#F97316" strokeWidth="0.9" />
        <text x={sectionX + sectionW / 2} y={baseY + 28} textAnchor="middle" fontSize="10" fill="#F97316"
          fontFamily="ui-monospace, monospace" fontWeight="bold">{widthLabel}</text>
      </g>

      <g className="transition-opacity duration-700" style={{ opacity: active ? 1 : 0, transitionDelay: "980ms" }}>
        <line x1={sectionX + sectionW + 8} y1={baseY - shown * jumpH - 26}
          x2={sectionX + sectionW + 52} y2={baseY - shown * jumpH - 44}
          stroke="#F97316" strokeWidth="1" markerStart="url(#kb-arrow)" />
        <text x={sectionX + sectionW + 58} y={baseY - shown * jumpH - 46} fontSize="11" fill="#fbbf24"
          fontFamily="ui-monospace, monospace" fontWeight="bold">Guardrail</text>
        <text x={sectionX + sectionW + 58} y={baseY - shown * jumpH - 34} fontSize="9" fill="#71717a"
          fontFamily="ui-monospace, monospace">top jump - 4 per bay</text>

        <line x1={sectionX + sectionW - 6} y1={baseY - jumpH - 6}
          x2={sectionX + sectionW + 52} y2={baseY - jumpH - 30}
          stroke="#F97316" strokeWidth="1" markerStart="url(#kb-arrow)" />
        <text x={sectionX + sectionW + 58} y={baseY - jumpH - 32} fontSize="11" fill="#F97316"
          fontFamily="ui-monospace, monospace" fontWeight="bold">{planksPerDeck} planks per deck</text>
        <text x={sectionX + sectionW + 58} y={baseY - jumpH - 20} fontSize="9" fill="#71717a"
          fontFamily="ui-monospace, monospace">{widthLabel} width - every jump decked</text>

        <line x1={elevX + elevW - 34} y1={baseY - 34}
          x2={sectionX + sectionW + 52} y2={baseY - 52}
          stroke="#F97316" strokeWidth="1" markerStart="url(#kb-arrow)" />
        <text x={sectionX + sectionW + 58} y={baseY - 54} fontSize="11" fill="#F97316"
          fontFamily="ui-monospace, monospace" fontWeight="bold">Cross bracing</text>
        <text x={sectionX + sectionW + 58} y={baseY - 42} fontSize="9" fill="#71717a"
          fontFamily="ui-monospace, monospace">2 per bay, every jump - Cal-OSHA</text>
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------
// Slide furniture
// ----------------------------------------------------------------------

function SlideFrame({
  eyebrow, title, children, footnote,
}: {
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col px-14 py-10">
      {(eyebrow || title) && (
        <div className="mb-6">
          {eyebrow && (
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-orange-500">{eyebrow}</p>
          )}
          {title && (
            <h2
              className="mt-1 text-[36px] font-semibold uppercase leading-none tracking-[0.05em] text-white"
              style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
            >
              {title}
            </h2>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
      {footnote && <div className="mt-4 shrink-0">{footnote}</div>}
    </div>
  );
}

function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-2 border-orange-500/50 bg-orange-500/[0.06] py-1.5 pl-3 font-mono text-[10px] leading-[1.5] text-zinc-400">
      {children}
    </p>
  );
}

// ----------------------------------------------------------------------
// Slides
// ----------------------------------------------------------------------

const coverSlide: Slide = {
  id: "cover",
  seconds: 7,
  render: (data, phase) => (
    <div className="flex h-full flex-col justify-center px-14">
      <Rise active={phase > 0}>
        <p
          className="text-[12px] font-semibold uppercase tracking-[0.42em] text-orange-500"
          style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
        >
          Korban
        </p>
      </Rise>
      <h1
        className="mt-3 min-h-[70px] text-[68px] font-semibold uppercase leading-[0.95] tracking-[0.02em] text-white"
        style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
      >
        <Typed text={data.projectName} active={phase > 0} delay={180} msPerChar={38} />
      </h1>
      <p className="mt-2 min-h-[22px] text-[15px] text-zinc-400">
        <Typed text={data.projectAddress} active={phase > 0} delay={900} msPerChar={16} />
      </p>
      <Rise active={phase > 0} delay={1500}>
        <div className="mt-8 flex gap-10 border-t border-zinc-800 pt-4 font-mono text-[11px]">
          {[
            ["Prepared for", data.customer],
            ["Estimator", data.estimator],
            ["Proposal", data.proposalNumber],
            ["Date", data.bidDate],
            ["Bid level", LEVEL_LABEL[data.depth]],
          ].map(([label, value]) => (
            <span key={label}>
              <span className="block text-[9px] uppercase tracking-[0.2em] text-zinc-600">{label}</span>
              <span className="text-zinc-200">{value}</span>
            </span>
          ))}
        </div>
      </Rise>
    </div>
  ),
};

/** Scope and material on one slide — coverage, then what goes on the job. */
const scopeSlide: Slide = {
  id: "scope",
  seconds: 13,
  render: (data, phase) => (
    <SlideFrame eyebrow="Scope &amp; material" title="What we're covering">
      <div className="grid h-full grid-rows-[auto_auto_1px_1fr] gap-5">
        <div className="flex items-end gap-14">
          <Figure value={data.linearFeet} label="Linear feet" active={phase > 0} size="lg" />
          <Figure value={Math.round(data.wallHeight)} label="Wall height" unit="ft" active={phase > 0} delay={200} />
          <Figure value={data.jumps} label="Jumps" active={phase > 0} delay={330} />
          <Figure value={data.framesPerLeg} label="Frames per leg" active={phase > 0} delay={450} />
        </div>

        {/* Which faces are in scope - all four, or only the ones selected. */}
        <Rise active={phase > 0} delay={600}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Elevations covered
            </span>
            <div className="flex gap-2">
              {["North", "East", "South", "West"].map((face) => {
                const covered = data.elevationsCovered.includes(face);
                return (
                  <span
                    key={face}
                    className={`rounded border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                      covered
                        ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                        : "border-zinc-800 bg-transparent text-zinc-700 line-through"
                    }`}
                  >
                    {face}
                  </span>
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-zinc-600">
              {data.elevationsCovered.length === 0
                ? "not yet recorded"
                : data.elevationsCovered.length >= 4
                ? "full perimeter"
                : `${data.elevationsCovered.length} of 4 faces`}
            </span>
          </div>
        </Rise>

        <div className="bg-zinc-800" />

        <div className="grid grid-cols-6 items-center gap-6">
          <Figure value={data.frames} label="Frames" active={phase > 0} delay={760} />
          <Figure value={data.planks} label="Planks" active={phase > 0} delay={850} />
          <Figure value={data.crossBraces} label="Cross braces" active={phase > 0} delay={940} />
          <Figure value={data.guardrails} label="Guardrails" active={phase > 0} delay={1030} />
          <Figure value={data.bays} label="Bays" active={phase > 0} delay={1120} />
          <Figure value={data.legs} label="Legs" active={phase > 0} delay={1210} />
        </div>
      </div>
    </SlideFrame>
  ),
};

/** Schedule. Install and dismantle lead; the projection note sits under them. */
const scheduleSlide: Slide = {
  id: "schedule",
  seconds: 10,
  render: (data, phase) => (
    <SlideFrame eyebrow="Schedule" title="How fast it goes up">
      <div className="flex h-full flex-col justify-center">
        <div className="flex items-end gap-16">
          <Figure value={data.erectDays} label="Days to install" active={phase > 0} size="lg" />
          <Figure value={data.dismantleDays} label="Days to dismantle" active={phase > 0} size="lg" delay={240} />
          <div className="pb-2">
            <Figure value={data.crewSize} label="Crew" active={phase > 0} delay={440} />
          </div>
        </div>
        <Rise active={phase > 0} delay={640}>
          <div className="mt-6 max-w-3xl">
            <Disclaimer>
              Projected only. Duration is an estimate based on planned crew size and production
              rate, and is subject to change upon commencement of work and actual site conditions.
            </Disclaimer>
          </div>
        </Rise>
      </div>
    </SlideFrame>
  ),
};

/** Plan layout — real when traced, clearly labelled reference when not. */
const layoutSlide: Slide = {
  id: "layout",
  seconds: 11,
  render: (data, phase) => {
    const traced = data.outline.length >= 3;
    return (
      <SlideFrame
        eyebrow="Layout"
        title="Where it lands"
        footnote={
          !traced ? (
            <Disclaimer>
              Reference layout shown. Trace a floor plan in Takeoff Workspace at Full Bid or above
              and this becomes your building.
            </Disclaimer>
          ) : undefined
        }
      >
        <div className="flex h-full items-center gap-10">
          <div className="h-full min-w-0 flex-1">
            <PlanView outline={data.outline} active={phase > 0} />
          </div>
          <div className="grid w-52 shrink-0 gap-6">
            <Figure value={data.legs} label="Leg positions" active={phase > 0} delay={800} />
            <Figure value={data.bays} label="Bays" active={phase > 0} delay={930} />
            <Figure value={data.bayLength} label="Bay length" unit="ft" active={phase > 0} delay={1060} />
          </div>
        </div>
      </SlideFrame>
    );
  },
};

/** Elevations — only when the estimator broke them out. */
const elevationSlide: Slide = {
  id: "elevations",
  seconds: 8,
  render: (data, phase) => {
    const max = Math.max(1, ...data.elevations.map((row) => row.linearFeet));
    return (
      <SlideFrame eyebrow="Coverage" title="Elevation by elevation">
        <div className="grid h-full content-center gap-4">
          {data.elevations.map((row, index) => (
            <div key={row.elevation} className="flex items-center gap-5">
              <span className="w-24 font-mono text-[14px] uppercase tracking-[0.14em] text-zinc-400">
                {row.elevation}
              </span>
              <div className="h-6 flex-1 overflow-hidden rounded-sm bg-zinc-900">
                <div
                  className="h-full bg-orange-500 transition-all duration-[900ms] ease-out"
                  style={{
                    width: phase > 0 ? `${(row.linearFeet / max) * 100}%` : "0%",
                    transitionDelay: `${index * 120}ms`,
                  }}
                />
              </div>
              <span className="w-24 text-right font-mono text-[15px] font-bold text-orange-400">
                {row.linearFeet.toLocaleString()} LF
              </span>
            </div>
          ))}
        </div>
      </SlideFrame>
    );
  },
};

/** Korban Bid showpiece — model, plan and the annotated bay together. */
const assemblySlide: Slide = {
  id: "assembly",
  seconds: 15,
  render: (data, phase) => {
    const traced = data.outline.length >= 3;
    return (
      <SlideFrame
        eyebrow="Assembly"
        title="Built before it's built"
        footnote={
          !traced ? (
            <Disclaimer>
              Reference geometry shown. Trace a plan and section at Korban Bid and this becomes your
              building, bay for bay.
            </Disclaimer>
          ) : undefined
        }
      >
        <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8">
          <div className="grid grid-rows-[1fr_auto] gap-2">
            <div className="min-h-0">
              <IsometricView outline={data.outline} framesPerLeg={data.framesPerLeg} active={phase > 0} />
            </div>
            <div className="flex gap-8 border-t border-zinc-800 pt-3">
              <Figure value={data.jumps} label="Jumps" active={phase > 0} size="sm" delay={600} />
              <Figure value={data.framesPerLeg} label="Frames per leg" active={phase > 0} size="sm" delay={720} />
              <Figure value={data.frames} label="Frames" active={phase > 0} size="sm" delay={840} />
            </div>
          </div>
          <div className="min-h-0">
            <AnnotatedBay
              jumps={data.jumps}
              planksPerDeck={data.planksPerDeck}
              scaffoldWidth={data.scaffoldWidth}
              bayLength={data.bayLength}
              active={phase > 0}
            />
          </div>
        </div>
      </SlideFrame>
    );
  },
};

/** Own component so its hooks live in a stable render, not inside a slide fn. */
function InvestmentPanel({ data, active }: { data: BidPresentationData; active: boolean }) {
  const armed = useArmed(active, 200);
  const counted = useCountUp(data.finalBid, armed, 1100);

  return (
    <div className="flex h-full flex-col justify-center">
      <p
        className="font-mono font-bold leading-none text-orange-400 transition-all duration-500"
        style={{
          fontSize: "94px",
          opacity: armed ? 1 : 0,
          transform: armed ? "scale(1)" : "scale(0.97)",
        }}
      >
        {Math.round(counted).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })}
      </p>
      <Rise active={active} delay={850}>
        <div className="mt-8 flex gap-14 border-t border-zinc-800 pt-5 font-mono">
          {[
            [`Rental - ${data.rentalDays} days`, data.rentalRevenue] as const,
            ["Erect, maintain, dismantle", data.laborRevenue] as const,
          ].map(([label, value]) => (
            <span key={label}>
              <span className="block text-[9px] uppercase tracking-[0.2em] text-zinc-600">{label}</span>
              <span className="text-[22px] font-bold text-zinc-200">
                {value.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })}
              </span>
            </span>
          ))}
        </div>
      </Rise>
    </div>
  );
}

const investmentSlide: Slide = {
  id: "investment",
  seconds: 10,
  render: (data, phase) => (
    <SlideFrame eyebrow="Cost" title={`Your ${data.trade} cost, all in`}>
      <InvestmentPanel data={data} active={phase > 0} />
    </SlideFrame>
  ),
};

const closingSlide: Slide = {
  id: "closing",
  seconds: 9,
  render: (data, phase) => (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2
        className="min-h-[58px] text-[56px] font-semibold uppercase leading-none tracking-[0.04em] text-white"
        style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
      >
        <Typed text="Ready when you are" active={phase > 0} delay={120} msPerChar={46} />
      </h2>

      <Rise active={phase > 0} delay={1050}>
        <div className="mt-6 grid gap-1.5 border-t border-zinc-800 pt-5 font-mono text-[12px]">
          {[
            ["Bid ref.", data.proposalNumber],
            ["Project", data.projectName],
            ["Company", data.company],
            ["Estimator", formatEstimator(data.estimator)],
            ["Contact", [data.companyPhone, data.companyEmail].filter(Boolean).join("  x  ")],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[104px_1fr] gap-5 text-left">
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</span>
              <span className="text-zinc-200">{value}</span>
            </div>
          ))}
        </div>
      </Rise>

      <Rise active={phase > 0} delay={1750}>
        <p
          className="mt-8 max-w-2xl text-[22px] font-semibold uppercase leading-[1.15] tracking-[0.04em] text-orange-400"
          style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
        >
          Everything you need is in this bid. Say the word and we&apos;re on site.
        </p>
      </Rise>

      <Rise active={phase > 0} delay={2100}>
        <p
          className="mt-7 text-[11px] font-semibold uppercase tracking-[0.42em] text-orange-500"
          style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
        >
          Korban
        </p>
      </Rise>
    </div>
  ),
};

/**
 * Deck composition by depth. Every tier gets the numbers and the price; the
 * deeper tiers earn the drawings, because only they produced the geometry.
 */
/**
 * The whole bid on one page.
 *
 * A deck made the customer wait for the number. Everything that mattered was
 * there, but broken across eight screens, so nobody could take the job in at a
 * glance or point at two figures at once. This is the same content arranged as
 * a single summary: the job, what it covers, how long it takes, what it is
 * built from, and what it costs - with the scaffold turning beside it.
 *
 * The parts arrive in order rather than all at once, so an estimator can talk
 * over it, but nothing ever leaves the screen.
 */
function RotatingScaffold({ data }: { data: BidPresentationData }) {
  /*
   * Drawn rather than modelled: the stand-in when the real model cannot show.
   *
   * The proposal's model (ProposalModel, below) is the engine's scaffold in
   * three.js. When a machine cannot give it a GPU context, or the page is the
   * printed copy before the live one has drawn a frame, this isometric
   * drawing spun about its centre reads as a building, prints, and cannot
   * fail.
   */
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    let raf = 0;
    const turn = () => { setSpin(s => (s + 0.25) % 360); raf = requestAnimationFrame(turn); };
    raf = requestAnimationFrame(turn);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shape = data.outline.length >= 3 ? data.outline : [
    { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 78 }, { x: 0, y: 78 },
  ];
  const xs = shape.map(p => p.x), ys = shape.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const scale = 78 / span;

  const rad = (spin * Math.PI) / 180;
  const jumps = Math.max(1, Math.min(data.framesPerLeg || 1, 14));
  const lift = 11;

  // Plan points turned about the centre, then laid over into isometric.
  const project = (p: { x: number; y: number }, height: number) => {
    const dx = (p.x - cx) * scale, dy = (p.y - cy) * scale;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: rx, y: ry * 0.42 - height };
  };

  const decks = Array.from({ length: jumps + 1 }, (_, i) => i * lift);

  return (
    <svg viewBox="-110 -150 220 230" className="h-full w-full">
      {decks.map((h, i) => (
        <polygon
          key={h}
          points={shape.map(p => { const q = project(p, h); return `${q.x},${q.y}`; }).join(" ")}
          fill="none"
          stroke={i === 0 ? "#52525b" : "#f97316"}
          strokeWidth={i === 0 ? 1.1 : 0.7}
          opacity={i === 0 ? 0.9 : 0.28 + (i / decks.length) * 0.5}
        />
      ))}
      {shape.map((p, i) => {
        const foot = project(p, 0);
        const head = project(p, jumps * lift);
        return (
          <line key={`leg-${i}`} x1={foot.x} y1={foot.y} x2={head.x} y2={head.y}
            stroke="#f97316" strokeWidth="0.9" opacity="0.65" />
        );
      })}
    </svg>
  );
}

// ----------------------------------------------------------------------
// The model on the proposal
// ----------------------------------------------------------------------

/**
 * The scaffold the customer is buying, set out again from the link.
 *
 * The same engine and the same model builder as Set Scaffold: the outline is
 * set out at the job's width and bay, every leg gets the frame make-up the
 * wall height calls for, hatch bays land by the job's rule, netting goes on
 * if the add was taken. Only what the link carries is used - nothing is read
 * from this browser, because the customer's browser has none of it.
 *
 * With no traced plan the model stands on a representative footprint whose
 * perimeter is the coverage, and says so.
 */
function proposalScaffold(data: BidPresentationData): { model: ScaffoldModel | null; representative: boolean } {
  const traced = data.outline.length >= 3;
  const outline: PlanPoint[] = traced ? data.outline : representativeOutline(data.linearFeet);
  const perimeter = outline.reduce((sum, p, i) => {
    const q = outline[(i + 1) % outline.length];
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  if (perimeter <= 0) return { model: null, representative: !traced };
  // A link made before the scale rode along: the perimeter is the footage.
  const puf = traced && data.unitsPerFoot > 0
    ? data.unitsPerFoot
    : perimeter / (data.linearFeet > 0 ? data.linearFeet : 200);
  const widthFt = data.scaffoldWidth > 0 ? data.scaffoldWidth : 3;
  const bayFt = data.bayLength > 0 ? data.bayLength : 10;
  const planksPerLift = data.planksPerDeck > 0 ? data.planksPerDeck : 3;
  let runs: SegmentLegs[];
  try {
    runs = setOut(outline, {
      puf, frameWidthFt: widthFt, bayFt, standoffFt: 1,
      standardBays: [...STANDARD_BAY_LENGTHS], turnaround: data.turnaround,
    });
  } catch {
    return { model: null, representative: !traced };
  }
  if (!runs.length) return { model: null, representative: !traced };

  // Every leg the same height: the wall's. Biggest frames at the bottom.
  const heightFt = data.wallHeight > 0 ? data.wallHeight : data.jumps * 6.333 + 6;
  const makeup = computeFrameMakeup(Math.max(0, heightFt - DEFAULT_WORKER_REACH_FT), DEFAULT_SCREW_JACK_MAX_IN);
  let frames = [...makeup.pieces].sort((m, n) => n.size - m.size).flatMap(piece => new Array<number>(piece.qty).fill(piece.size));
  if (!frames.length) frames = new Array<number>(Math.max(1, data.framesPerLeg || 1)).fill(6.333);
  const stack = { frames, jackIn: makeup.screwJackExtensionIn ?? 0 };

  const model = buildScaffoldModel({
    runs, puf, frameWidthFt: widthFt, planksPerLift,
    stackFor: () => stack,
    hatchBays: pickHatchBays(runs, { mode: data.hatchMode, bayFt }),
    walls: outline.map((p, i) => ({ a: p, b: outline[(i + 1) % outline.length], heightFt })),
    netting: data.netting ? { addedHeightFt: 3 } : null,
  });
  return { model, representative: !traced };
}

/** A plain building of the job's coverage, in feet, for a bid with no traced plan. */
function representativeOutline(linearFeet: number): PlanPoint[] {
  const perimeter = linearFeet > 0 ? linearFeet : 200;
  const long = (perimeter / 2) * (1.6 / 2.6), short = (perimeter / 2) * (1 / 2.6);
  return [{ x: 0, y: 0 }, { x: long, y: 0 }, { x: long, y: short }, { x: 0, y: short }];
}

/*
 * The last frame the live model drew, for the printed copy of the page. The
 * printer's copy of the page is laid out hidden and never gets a GPU
 * context; it prints this instead.
 */
let lastProposalFrame = "";

function ProposalModel({ data }: { data: BidPresentationData }) {
  /*
   * Rebuilt only when something the model is made of changes. The page
   * behind the deck re-renders as its numbers roll, and every re-render
   * hands down a fresh data object; tearing the GPU scene down for that
   * would restart the turn every few seconds.
   */
  const modelKey = JSON.stringify([
    data.outline, data.unitsPerFoot, data.scaffoldWidth, data.bayLength, data.planksPerDeck,
    data.wallHeight, data.jumps, data.framesPerLeg, data.turnaround, data.hatchMode, data.netting, data.linearFeet,
  ]);
  const built = useMemo(() => proposalScaffold(data), [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mountRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLImageElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  /*
   * live: the model turning. still: the printer's copy, showing the live
   * one's last frame. drawn: no model or no GPU - the isometric drawing.
   */
  const [mode, setMode] = useState<"live" | "still" | "drawn">("live");
  const [hasStill, setHasStill] = useState(Boolean(lastProposalFrame));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (!built.model || built.model.pieces.length === 0) { setMode("drawn"); return; }

    // Laid out hidden: this is the printer's copy. Show the live frame when asked to print.
    if (mount.clientWidth === 0 || mount.clientHeight === 0) {
      setMode("still");
      const show = () => {
        if (!lastProposalFrame) return;
        // Straight to the element as well as through state: the print snapshot may not wait for a render.
        if (stillRef.current) { stillRef.current.src = lastProposalFrame; stillRef.current.classList.remove("hidden"); }
        setHasStill(true);
      };
      show();
      window.addEventListener("beforeprint", show);
      const media = window.matchMedia("print");
      const onMedia = (e: MediaQueryListEvent) => { if (e.matches) show(); };
      media.addEventListener?.("change", onMedia);
      return () => {
        window.removeEventListener("beforeprint", show);
        media.removeEventListener?.("change", onMedia);
      };
    }

    const model = built.model;
    const W = mount.clientWidth, H = mount.clientHeight;
    const BG = 0x0a0a0b;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 2000);

    /*
     * The same conservative path as Set Scaffold: no antialias, no shadow
     * maps, pixel ratio 1, low-power, and the frame copied to an <img>,
     * because a WebGL canvas composites blank white on some machines while
     * drawing perfectly.
     */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: false, preserveDrawingBuffer: true });
    } catch {
      setMode("drawn");
      return;
    }
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    const onLost = (e: Event) => { e.preventDefault(); };
    canvas.addEventListener("webglcontextlost", onLost, false);

    const observer = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w > 0 && h > 0) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    });
    observer.observe(mount);

    // The job: the shared stamping, in the proposal's palette, on dark walls.
    const palette = proposalPalette();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.95 });
    const build = buildScaffoldGroup(model, palette, { wallMaterial: wallMat });
    scene.add(build.group);
    const { center, size, camDist } = build;
    scene.fog = new THREE.FogExp2(BG, 0.3 / camDist);

    /*
     * Orange treatment. A warm key light that sweeps round with the camera,
     * a cool rim from behind, a pool of orange light on the ground, a glow
     * behind the building and embers drifting up through the scaffold. The
     * rails are lit from the palette, so the top lift reads as a line of
     * light round the job.
     */
    scene.add(new THREE.AmbientLight(0xfff1e6, 0.42));
    const key = new THREE.DirectionalLight(0xffc08a, 2.0);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7f8cff, 0.6);
    rim.position.set(center.x - camDist, camDist * 0.8, center.z - camDist);
    scene.add(rim);
    const warmFill = new THREE.DirectionalLight(0xf97316, 0.45);
    warmFill.position.set(center.x, -camDist * 0.3, center.z); // up from the pool of light
    scene.add(warmFill);

    const radial = (inner: string, mid: string) => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      if (g) {
        const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, inner); grad.addColorStop(0.45, mid); grad.addColorStop(1, "rgba(249,115,22,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      }
      return new THREE.CanvasTexture(c);
    };
    const disposables: { dispose(): void }[] = [wallMat];

    /*
     * The camera stands back a fifth further than the working model, so the
     * job turns clear of the panel's edges; the glow is scaled up by the
     * same fifth, so the building gets smaller and the light does not.
     */
    const standBack = 1.18;
    const glow = standBack / 0.98;
    const footprint = Math.max(size.x, size.z);
    const poolTex = radial("rgba(249,115,22,0.55)", "rgba(249,115,22,0.16)");
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false });
    const poolGeo = new THREE.PlaneGeometry(footprint * 2.6 * glow, footprint * 2.6 * glow);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(center.x, -0.01, center.z);
    scene.add(pool);
    disposables.push(poolTex, poolMat, poolGeo);

    const gridSize = footprint * 3 + 20;
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.round(gridSize / (10 * FEET))), 0xf97316, 0xf97316);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true; gridMat.opacity = 0.11;
    grid.position.set(center.x, 0, center.z);
    scene.add(grid);
    disposables.push(grid.geometry, gridMat);

    // The glow sits behind the building from wherever the camera is, so the job is backlit as it turns.
    const haloTex = radial("rgba(251,146,60,0.5)", "rgba(249,115,22,0.12)");
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(camDist * 1.1 * glow, camDist * 0.75 * glow, 1);
    scene.add(halo);
    disposables.push(haloTex, haloMat);
    const haloBack = footprint * 0.75;

    // Embers: two drifts, small bright and larger soft, each wrapping back to the ground.
    const emberTex = radial("rgba(255,237,213,1)", "rgba(251,146,60,0.55)");
    const top = size.y / FEET; // feet
    const spawn = (count: number) => {
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = center.x + (Math.random() - 0.5) * size.x * 1.4;
        arr[i * 3 + 1] = Math.random() * (top * 1.5) * FEET;
        arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * size.z * 1.4;
      }
      return arr;
    };
    const drifts = [
      { n: 44, size: 0.08 * camDist / 10, speed: 0.28, color: 0xfdba74, opacity: 0.9 },
      { n: 22, size: 0.16 * camDist / 10, speed: 0.17, color: 0xf97316, opacity: 0.55 },
    ].map(d => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(spawn(d.n), 3));
      const mat = new THREE.PointsMaterial({ map: emberTex, color: d.color, size: d.size, transparent: true, opacity: d.opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      disposables.push(geo, mat);
      return { points, speed: d.speed, phase: Math.random() * 6 };
    });
    disposables.push(emberTex);

    let angle = Math.PI * 0.22;
    let last = performance.now();
    let lastMirror = 0, lastKeep = 0;
    let raf = 0;
    const ceiling = (top * 1.5) * FEET;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angle += dt * 0.21;
      camera.position.set(center.x + Math.sin(angle) * camDist * standBack, camDist * 0.48, center.z + Math.cos(angle) * camDist * standBack);
      camera.lookAt(center.x, center.y * 0.45, center.z);
      key.position.set(center.x + Math.sin(angle + 0.9) * camDist, camDist * 0.8, center.z + Math.cos(angle + 0.9) * camDist);
      halo.position.set(center.x - Math.sin(angle) * haloBack, center.y + size.y * 0.3, center.z - Math.cos(angle) * haloBack);
      for (const d of drifts) {
        const arr = d.points.geometry.getAttribute("position") as THREE.BufferAttribute;
        const t = now / 1000 + d.phase;
        for (let i = 0; i < arr.count; i++) {
          let y = arr.getY(i) + d.speed * dt * camDist * 0.05;
          if (y > ceiling) y = 0;
          arr.setY(i, y);
          arr.setX(i, arr.getX(i) + Math.sin(t + i) * dt * 0.02 * camDist * 0.05);
        }
        arr.needsUpdate = true;
      }
      renderer.render(scene, camera);

      // The frame goes to the image a dozen times a second; the printer keeps one every so often.
      if (now - lastMirror > 66 && document.visibilityState === "visible") {
        lastMirror = now;
        const img = mirrorRef.current;
        if (img) {
          try {
            const url = renderer.domElement.toDataURL("image/jpeg", 0.82);
            img.src = url;
            img.style.visibility = "visible";
            if (now - lastKeep > 400) { lastKeep = now; lastProposalFrame = url; }
          } catch { /* skip a frame */ }
        }
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      try { observer.disconnect(); } catch { /* already gone */ }
      build.dispose();
      disposePalette(palette);
      disposables.forEach(d => d.dispose());
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* not supported here */ }
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, [built]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0b]">
      {mode !== "drawn" && (
        <>
          {/* The canvas draws underneath; the image on top shows what it drew (see the render loop). */}
          <div ref={mountRef} className="absolute inset-0 opacity-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={mirrorRef} alt="" style={{ visibility: "hidden" }} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        </>
      )}
      {(mode === "drawn" || (mode === "still" && !hasStill)) && (
        <div className="absolute inset-0 p-3">
          <RotatingScaffold data={data} />
        </div>
      )}
      {mode === "still" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={stillRef} src={hasStill ? lastProposalFrame : undefined} alt="Scaffold model" className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${hasStill ? "" : "hidden"}`} />
      )}
      <p className="pointer-events-none absolute right-3 top-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-orange-400">
        {built.representative ? "Representative layout \u00b7 plan not traced" : "Built before it\u2019s built"}
      </p>
    </div>
  );
}

/**
 * A tile's heading on the summary: big, orange, and lit once as the tile
 * arrives - a band of light crosses the letters, then it settles.
 */
function TileTitle({ children, on }: { children: string; on: boolean }) {
  return (
    <div>
      <h2
        className="relative text-[26px] font-bold uppercase leading-none tracking-[0.04em] text-orange-400"
        style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui", textShadow: "0 0 22px rgba(249,115,22,0.35)" }}
      >
        {children}
        {on && <span aria-hidden className="korban-tile-flash absolute inset-0">{children}</span>}
      </h2>
      <span
        className="mt-1.5 block h-[3px] rounded-full bg-orange-500 transition-[width] duration-700 ease-out"
        style={{ width: on ? 40 : 0, transitionDelay: "300ms" }}
      />
    </div>
  );
}

/**
 * The confidentiality notice under the model.
 *
 * Formal on purpose: it is the one paragraph on the page written for the
 * recipient's lawyer rather than their estimator. The sender's name comes
 * from Backend > Company; the customer's from the job.
 */
function confidentiality(data: BidPresentationData): string {
  const sender = data.company || "the sender";
  const recipient = data.customer ? `for ${data.customer}` : "for its recipient";
  return `This proposal was prepared by ${sender} ${recipient} and composed in Korban. ` +
    `The scaffold design, the model, the quantities and the pricing it carries are the original work of ${sender}, ` +
    `furnished in confidence solely for the evaluation of this bid. They remain the property of ${sender} and may not be ` +
    `copied, forwarded, published or disclosed beyond the recipient\u2019s own bid team, nor used to inform, shape or solicit ` +
    `any other proposal. Acceptance of this presentation constitutes acceptance of these terms.`;
}

/**
 * What the cost includes, under the number. The same words as line item 01
 * on the proposal sheet - furnish, install and remove, the finish, the
 * footage, the estimator's note, the rental period - then the alternates
 * that were taken, so nobody reads the deck and the paper as two offers.
 */
function costDescription(data: BidPresentationData): string {
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const base = Math.max(0, data.finalBid - data.alternateRevenue);
  const parts: string[] = [];
  parts.push(
    `Furnish, install and remove exterior ${data.trade || "scaffold"} for ${data.finish || "general access"}` +
    ` \u2014 ${Math.round(data.linearFeet).toLocaleString()} LF` +
    (data.elevationsCovered.length > 0 ? ` across ${data.elevationsCovered.join(", ").replace(/, ([^,]*)$/, " and $1")}` : "") + ".",
  );
  if (data.proposalNotes.trim()) parts.push(data.proposalNotes.trim().replace(/[.\s]*$/, "") + ".");
  if (data.rentalDays > 0) {
    parts.push(
      `${data.alternatesIncluded.length > 0 ? money(base) + " covers" : "Covers"} the first ${data.rentalDays} days on rent` +
      (data.rentalThereafter > 0 ? `; ${money(data.rentalThereafter)} per month thereafter.` : "."),
    );
  }
  if (data.alternatesIncluded.length > 0) {
    parts.push(`Alternates included: ${data.alternatesIncluded.join(", ").toLowerCase()} (${money(data.alternateRevenue)}).`);
  }
  return parts.join(" ");
}

function OnePage({ data }: { data: BidPresentationData }) {
  /*
   * The page brings itself in.
   *
   * The player only ever moves a slide from its opening state to its settled
   * one, which is all a slide needed when there were eight of them. A summary
   * has to arrive in parts so it can be talked over, so it keeps its own time.
   */
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep(n => (n >= 5 ? n : n + 1)), 650);
    return () => window.clearInterval(timer);
  }, []);

  // Each block arrives in turn. Nothing leaves.
  const inAt = (n: number) => step >= n;
  const block = (n: number) =>
    `transition-all duration-700 ${inAt(n) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`;

  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  /* Time on site: up and down. Not the rental period, which runs between. */
  const erectAndDismantleDays = Math.max(0, Math.round(data.erectDays + data.dismantleDays));

  return (
    <div className="flex h-full w-full flex-col gap-3 p-8">
      <style>{`
        .korban-tile-flash {
          color: transparent;
          background: linear-gradient(100deg, transparent 38%, #fff7ed 50%, transparent 62%);
          background-size: 240% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          pointer-events: none;
          animation: korban-tile-flash 1.1s ease-out 0.35s 1 both;
        }
        @keyframes korban-tile-flash {
          from { background-position: 100% 0; }
          to { background-position: 0% 0; }
        }
        @media print { .korban-tile-flash { display: none; } }
      `}</style>
      <div className={`flex items-end justify-between border-b border-zinc-800 pb-3 ${block(0)}`}>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-orange-400">
            {data.company}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{data.projectName}</h1>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {data.projectAddress}{data.customer ? ` \u00b7 ${data.customer}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Proposal</p>
          <p className="font-mono text-[13px] text-zinc-300">{data.proposalNumber || "-"}</p>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">{data.bidDate}</p>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[1.15fr_1fr] gap-4">
        <div className="flex flex-col gap-3">
          <div className={`rounded-xl border border-zinc-800 bg-black/40 p-4 ${block(1)}`}>
            <TileTitle on={inAt(1)}>Scope</TileTitle>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <SummaryFigure label="Coverage" value={`${Math.round(data.linearFeet).toLocaleString()} LF`} />
              <SummaryFigure label="Wall height" value={`${data.wallHeight.toFixed(1)}'`} />
              <SummaryFigure label="Frames per leg" value={String(data.framesPerLeg)} />
            </div>
            {data.elevationsCovered.length > 0 && (
              <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-zinc-500">
                {data.elevationsCovered.join(" \u00b7 ")}
              </p>
            )}
          </div>

          <div className={`rounded-xl border border-zinc-800 bg-black/40 p-4 ${block(2)}`}>
            <TileTitle on={inAt(2)}>Schedule</TileTitle>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <SummaryFigure label="Erect" value={`${data.erectDays}d`} small />
              <SummaryFigure label="Dismantle" value={`${data.dismantleDays}d`} small />
              <SummaryFigure label="Crew" value={String(data.crewSize)} small />
              <SummaryFigure label="On rent" value={`${data.rentalDays}d`} small />
            </div>
          </div>

          {/*
            * What it costs, and how long we are on site. Last on the left, at
            * the foot of the column, so the page reads scope, schedule, number.
            *
            * "Investment" is what a brochure calls a price. This is a bid: the
            * customer is being told a number, and the plainer word is the one
            * the rest of the file already uses.
            *
            * Duration sits with the money because it is the other thing a
            * customer asks in the same breath - the schedule card breaks it
            * into erect and dismantle, this is the answer to "how long are you
            * on my site".
            */}
          <div className={`mt-auto flex min-h-0 flex-1 flex-col rounded-xl border border-orange-500/40 bg-orange-500/[0.07] p-4 ${block(3)}`}>
            <TileTitle on={inAt(3)}>Cost</TileTitle>
            {/* The number is the page's one big figure: it takes the room the column has and sits in the middle of it, with what it buys beneath. */}
            <div className="my-auto py-3">
              <p className="text-[58px] font-bold leading-none tracking-[-0.03em] text-white">{money(data.finalBid)}</p>
              <p className="mt-3 max-w-[60ch] text-[10px] leading-[1.6] text-zinc-400">{costDescription(data)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryFigure label={`${data.trade} rental`} value={money(data.rentalRevenue)} small />
              <SummaryFigure label="Labor" value={money(data.laborRevenue)} small />
            </div>
            <div className="mt-3 border-t border-orange-500/20 pt-2.5">
              <SummaryFigure
                label="Estimated duration"
                value={`${erectAndDismantleDays} day${erectAndDismantleDays === 1 ? "" : "s"}`}
                small
              />
            </div>
          </div>
        </div>

        <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#0a0a0b] ${block(1)}`}>
          {/* The scaffold itself, set out again from the link and turning. */}
          <div className="min-h-0 flex-1">
            <ProposalModel data={data} />
          </div>
          {/*
            * Whose work this is, and who it is for. The design and the number
            * are the sender's; the page says so where the customer is looking.
            */}
          <div className={`border-t border-zinc-800 bg-black/60 px-4 py-3 ${block(4)}`}>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-orange-400">Confidential</p>
            <p className="mt-1 text-[10px] leading-[1.6] text-zinc-500">
              {confidentiality(data)}
            </p>
          </div>
        </div>
      </div>

      <div className={`flex items-center justify-between border-t border-zinc-800 pt-2.5 ${block(5)}`}>
        <p className="font-mono text-[10px] text-zinc-600">
          {formatEstimator(data.estimator)}{data.companyPhone ? ` \u00b7 ${data.companyPhone}` : ""}
          {data.companyEmail ? ` \u00b7 ${data.companyEmail}` : ""}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-700">{data.company}</p>
      </div>
    </div>
  );
}

/** A labelled figure on the summary. The deck's own Figure counts numbers up;
 *  this one prints a value that is already formatted. */
function SummaryFigure({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={`mt-0.5 font-bold text-white ${small ? "text-[15px]" : "text-[22px]"}`}>{value}</p>
    </div>
  );
}

const onePageSlide: Slide = {
  id: "one-page",
  seconds: 26,
  render: (data) => <OnePage data={data} />,
};

function buildDeck(data: BidPresentationData): Slide[] {
  /*
   * One page, not eight.
   *
   * The deck made a customer sit through the job to reach the number. The same
   * content on a single summary can be read at a glance and pointed at, which
   * is what actually happens in a bid meeting.
   */
  void data;
  return [onePageSlide];
}

// ----------------------------------------------------------------------
// Player
// ----------------------------------------------------------------------

/**
 * Each slide mounts as its own component keyed by id, so a slide's internal
 * hooks unmount cleanly on advance rather than shifting the player's hook
 * order.
 */
function SlideStage({
  slide, data, phase,
}: {
  slide: Slide;
  data: BidPresentationData;
  phase: number;
}) {
  return <div className="relative h-full w-full">{slide.render(data, phase)}</div>;
}

export default function BidPresentation({
  data, onClose,
}: {
  data: BidPresentationData;
  onClose: () => void;
}) {
  const deck = useMemo(() => buildDeck(data), [data]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState(0);

  const slide = deck[index];
  const totalSeconds = deck.reduce((sum, item) => sum + item.seconds, 0);

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(deck.length - 1, next)));
      setElapsed(0);
      setPhase(0);
    },
    [deck.length]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase(1), 60);
    return () => window.clearTimeout(timer);
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setElapsed((current) => {
        const next = current + delta;
        if (next >= slide.seconds) {
          if (index < deck.length - 1) goTo(index + 1);
          else setPlaying(false);
          return 0;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, slide.seconds, index, deck.length, goTo]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") goTo(index + 1);
      else if (event.key === "ArrowLeft") goTo(index - 1);
      else if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, onClose]);

  return (
    <div id="korban-deck" className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
      {/*
       * Export. Each slide prints as one landscape page with its numbers and
       * drawings intact. The motion is what sells, so a PDF is the fallback
       * for whoever can't open a link - not the main event.
       */}
      <style>{`
        @media print {
          @page { size: letter landscape; margin: 0.3in; }
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #korban-deck, #korban-deck * { visibility: visible !important; }
          #korban-deck {
            position: absolute !important;
            left: 0; top: 0;
            width: 100% !important;
            height: auto !important;
            background: transparent !important;
            backdrop-filter: none !important;
          }
          .korban-live-stage, .korban-no-print { display: none !important; }
          .korban-print-deck { display: block !important; }
          .korban-print-slide {
            break-after: page;
            page-break-after: always;
            width: 100%;
            aspect-ratio: 16 / 9;
            border: 1px solid #333;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .korban-print-slide:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="korban-live-stage flex min-h-0 flex-1 items-center justify-center p-5">
        <div
          className="relative w-full overflow-hidden rounded-lg border border-zinc-800 bg-korban-base"
          style={{ aspectRatio: "16 / 9", maxHeight: "100%", maxWidth: "min(100%, 1600px)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.028]"
            style={{
              backgroundImage:
                "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
              backgroundSize: "34px 34px",
            }}
          />
          <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-4 w-4 border-l border-t border-orange-500" />
          <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b border-r border-orange-500" />

          <SlideStage key={slide.id} slide={slide} data={data} phase={phase} />

          <p className="absolute bottom-3.5 right-6 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-700">
            {LEVEL_LABEL[data.depth]} · {data.proposalNumber}
          </p>
        </div>
      </div>

      {/* Every slide, stacked, for the printer only. */}
      <div className="korban-print-deck hidden">
        {deck.map((item) => (
          <div
            key={`print-${item.id}`}
            className="korban-print-slide relative overflow-hidden bg-korban-base"
          >
            {item.render(data, 1)}
          </div>
        ))}
      </div>

      <div className="korban-no-print flex items-center gap-3 border-t border-zinc-900 bg-korban-raised px-6 py-2.5">
        <button
          onClick={onClose}
          className="rounded border border-zinc-800 bg-korban-raised px-3 py-1 font-mono text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        >
          Close
        </button>
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[10px] text-zinc-400 disabled:opacity-30"
        >
          ‹
        </button>
        <button
          onClick={() => setPlaying((current) => !current)}
          className="rounded border border-orange-500/40 bg-orange-500/10 px-3 py-1 font-mono text-[10px] font-medium text-orange-300"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => goTo(index + 1)}
          disabled={index === deck.length - 1}
          className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[10px] text-zinc-400 disabled:opacity-30"
        >
          ›
        </button>

        <div className="ml-2 flex flex-1 items-center gap-1">
          {deck.map((item, itemIndex) => (
            <button
              key={item.id}
              onClick={() => goTo(itemIndex)}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800"
              aria-label={`Slide ${itemIndex + 1}`}
            >
              <span
                className="block h-full bg-orange-500 transition-[width] duration-100"
                style={{
                  width:
                    itemIndex < index
                      ? "100%"
                      : itemIndex === index
                      ? `${(elapsed / slide.seconds) * 100}%`
                      : "0%",
                }}
              />
            </button>
          ))}
        </div>

        <button
          onClick={() => window.print()}
          title="Each slide prints as a page. Choose Save as PDF to send it as a file."
          className="rounded border border-zinc-800 bg-black px-3 py-1 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
        >
          Export
        </button>

        <span className="font-mono text-[10px] text-zinc-600">
          {index + 1} / {deck.length} · {Math.round(totalSeconds)}s
        </span>
      </div>
    </div>
  );
}
