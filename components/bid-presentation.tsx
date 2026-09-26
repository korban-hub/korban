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
 * TRADE LANGUAGE: this is a scaffold document. Vertical repetition is a
 * JUMP, never a "lift". A leg's frame arrangement is FRAMES PER LEG or
 * FRAME CONFIGURATION, never a "stack".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
function RotatingScaffold({ data, spin }: { data: BidPresentationData; spin: number }) {
  /*
   * Drawn rather than modelled.
   *
   * A real 3D canvas composites blank white on some machines - the reason the
   * model in Set Scaffold needs an image behind it - and a proposal is the last
   * place to risk that. An isometric drawing spun about its centre reads as a
   * building, prints, and cannot fail.
   */
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

function OnePage({ data }: { data: BidPresentationData }) {
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    let raf = 0;
    const turn = () => { setSpin(s => (s + 0.25) % 360); raf = requestAnimationFrame(turn); };
    raf = requestAnimationFrame(turn);
    return () => cancelAnimationFrame(raf);
  }, []);

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

  return (
    <div className="flex h-full w-full flex-col gap-3 p-8">
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
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Scope</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Figure label="Coverage" value={`${Math.round(data.linearFeet).toLocaleString()} LF`} />
              <Figure label="Wall height" value={`${data.wallHeight.toFixed(1)}'`} />
              <Figure label="Frames per leg" value={String(data.framesPerLeg)} />
            </div>
            {data.elevationsCovered.length > 0 && (
              <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-zinc-500">
                {data.elevationsCovered.join(" \u00b7 ")}
              </p>
            )}
          </div>

          <div className={`rounded-xl border border-zinc-800 bg-black/40 p-4 ${block(2)}`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Built from</p>
            <div className="mt-2 grid grid-cols-4 gap-y-2.5 gap-x-3">
              <Figure label="Frames" value={data.frames.toLocaleString()} small />
              <Figure label="Planks" value={data.planks.toLocaleString()} small />
              <Figure label="Braces" value={data.crossBraces.toLocaleString()} small />
              <Figure label="Guardrail" value={data.guardrails.toLocaleString()} small />
              <Figure label="Legs" value={data.legs.toLocaleString()} small />
              <Figure label="Bays" value={data.bays.toLocaleString()} small />
              <Figure label="Base plates" value={data.basePlates.toLocaleString()} small />
              <Figure label="Screw jacks" value={data.screwJacks.toLocaleString()} small />
            </div>
            <p className="mt-3 font-mono text-[10px] text-zinc-600">
              {data.scaffoldWidth}&apos; wide &middot; {data.bayLength}&apos; bays &middot; {data.planksPerDeck} planks per deck
            </p>
          </div>

          <div className={`rounded-xl border border-zinc-800 bg-black/40 p-4 ${block(3)}`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Schedule</p>
            <div className="mt-2 grid grid-cols-4 gap-3">
              <Figure label="Erect" value={`${data.erectDays}d`} small />
              <Figure label="Dismantle" value={`${data.dismantleDays}d`} small />
              <Figure label="Crew" value={String(data.crewSize)} small />
              <Figure label="On rent" value={`${data.rentalDays}d`} small />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className={`flex-1 rounded-xl border border-zinc-800 bg-black/40 p-2 ${block(1)}`}>
            <RotatingScaffold data={data} spin={spin} />
          </div>

          <div className={`rounded-xl border border-orange-500/40 bg-orange-500/[0.07] p-4 ${block(4)}`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
              Investment
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-white">{money(data.finalBid)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Figure label={`${data.trade} rental`} value={money(data.rentalRevenue)} small />
              <Figure label="Labor" value={money(data.laborRevenue)} small />
            </div>
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

function Figure({ label, value, small }: { label: string; value: string; small?: boolean }) {
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
