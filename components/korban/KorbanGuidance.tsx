"use client";

/**
 * KorbanGuidance
 *
 * What Korban has noticed about the job in front of you. It sits over the
 * work rather than beside it, because advice you have to go looking for is
 * advice nobody reads.
 *
 * Which means it will sometimes cover the thing you want to see - so it
 * moves. Drag it by the header and it goes where you put it, and stays there
 * until you reset it.
 *
 * Two things make the dragging actually work, both learned the hard way:
 * it switches to fixed positioning the moment it moves, so a scrolling
 * parent can't clip it; and it uses pointer capture, so a fast drag doesn't
 * lose the element out from under the cursor.
 */

import { useEffect, useRef, useState } from "react";

export type KorbanGuidanceFlag = {
  /** warn is something to act on. note is something to know. */
  tone: "warn" | "note";
  text: string;
};

/**
 * A step in a walkthrough. Full Bid guides rather than warns, but it is the
 * same panel doing the talking - so it moves the same way and reads the same
 * way, and an estimator learns one thing instead of two.
 */
export type KorbanGuidanceStep = {
  id: string;
  title: string;
  body: string;
  /** Why it matters. Shown only while the step is the current one. */
  why?: string;
  done: boolean;
};

/**
 * Two voices, two colours.
 *
 * Orange is Korban telling you what to do next. Amber is Korban telling you
 * what it has noticed. Side by side they need to be distinguishable at a
 * glance, or an estimator reads an observation as an instruction.
 */
const ACCENTS = {
  orange: {
    border: "border-orange-500/35",
    bg: "bg-orange-500/[0.05]",
    floatBg: "rgba(20,14,8,0.92)",
    glow: "bg-orange-500/20",
    dot: "bg-orange-500",
    title: "text-orange-300",
    rule: "border-orange-500/15",
    stepTitle: "text-orange-200",
    barDone: "bg-orange-500",
    barCurrent: "bg-orange-500/40",
    whyRule: "border-orange-500/40",
  },
  amber: {
    border: "border-amber-400/40",
    bg: "bg-amber-400/[0.06]",
    floatBg: "rgba(22,18,6,0.92)",
    glow: "bg-amber-400/20",
    dot: "bg-amber-400",
    title: "text-amber-200",
    rule: "border-amber-400/15",
    stepTitle: "text-amber-100",
    barDone: "bg-amber-400",
    barCurrent: "bg-amber-400/40",
    whyRule: "border-amber-400/40",
  },
} as const;

export type KorbanGuidanceAccent = keyof typeof ACCENTS;

export function KorbanGuidance({
  flags = [],
  steps = [],
  title = "Be advised",
  accent = "orange",
  className = "",
  onDismiss,
}: {
  flags?: KorbanGuidanceFlag[];
  steps?: KorbanGuidanceStep[];
  title?: string;
  accent?: KorbanGuidanceAccent;
  className?: string;
  /** Shown as a close control when supplied. Advice you cannot dismiss is nagging. */
  onDismiss?: () => void;
}) {
  const tone = ACCENTS[accent];
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const grab = useRef({ dx: 0, dy: 0 });

  // A panel dragged off-screen is a panel you have lost. If the window
  // shrinks under it, walk it back into view.
  useEffect(() => {
    if (!position) return;
    function clamp() {
      const box = panel.current?.getBoundingClientRect();
      if (!box) return;
      setPosition((current) =>
        current
          ? {
              x: Math.min(Math.max(8, current.x), window.innerWidth - box.width - 8),
              y: Math.min(Math.max(8, current.y), window.innerHeight - box.height - 8),
            }
          : current
      );
    }
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [position]);

  /*
   * Listeners go on the document rather than the handle. Pointer capture on
   * an element inside a re-rendering tree loses the pointer the moment React
   * swaps the node - which is exactly what happens here, because the panel
   * re-renders every time the numbers behind it change.
   */
  useEffect(() => {
    if (!dragging) return;

    function move(event: PointerEvent) {
      const box = panel.current?.getBoundingClientRect();
      const width = box?.width ?? 320;
      const height = box?.height ?? 140;
      setPosition({
        x: Math.min(Math.max(8, event.clientX - grab.current.dx), window.innerWidth - width - 8),
        y: Math.min(Math.max(8, event.clientY - grab.current.dy), window.innerHeight - height - 8),
      });
    }
    function up() {
      setDragging(false);
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    // A drag shouldn't select the text underneath it.
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    // Fixing the panel where it already sits means it doesn't jump on grab.
    grab.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    setPosition({ x: box.left, y: box.top });
    setDragging(true);
    event.preventDefault();
  }

  if (flags.length === 0 && steps.length === 0) return null;

  // The first thing not yet done is the thing to talk about.
  const current = steps.find((step) => !step.done);
  const completed = steps.filter((step) => step.done).length;

  const floating = position !== null;

  return (
    <div
      ref={panel}
      className={`overflow-hidden rounded-xl border ${tone.border} ${tone.bg} p-3.5 backdrop-blur-sm ${
        floating ? "shadow-2xl" : ""
      } ${className}`}
      style={
        floating
          ? {
              position: "fixed",
              left: position.x,
              top: position.y,
              width: 320,
              zIndex: 60,
              background: tone.floatBg,
            }
          : { position: "relative" }
      }
    >
      <span
        aria-hidden
        className={`korban-guidance-glow pointer-events-none absolute -left-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full ${tone.glow} blur-2xl`}
      />

      <div
        onPointerDown={startDrag}
        title="Drag me out of the way"
        className={`relative flex touch-none items-center gap-2 select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-70`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        </span>
        <p className={`flex-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${tone.title}`}>
          {title}
        </p>
        {floating ? (
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setPosition(null)}
            className="font-mono text-[9px] text-zinc-500 transition hover:text-zinc-300"
          >
            dock
          </button>
        ) : (
          <span className="font-mono text-[9px] text-zinc-700">drag</span>
        )}
        {onDismiss && (
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onDismiss}
            aria-label={`Dismiss ${title}`}
            className="ml-1 font-mono text-[12px] leading-none text-zinc-600 transition hover:text-zinc-200"
          >
            &times;
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <div className="relative mt-2.5">
          <div className="mb-2 flex items-center gap-1">
            {steps.map((step) => (
              <span
                key={step.id}
                title={step.title}
                className={`h-1 flex-1 rounded-full transition ${
                  step.done ? tone.barDone : step.id === current?.id ? tone.barCurrent : "bg-zinc-800"
                }`}
              />
            ))}
            <span className="ml-1.5 shrink-0 font-mono text-[9px] text-zinc-600">
              {completed}/{steps.length}
            </span>
          </div>

          {current ? (
            <>
              <p className={`text-[12px] font-semibold ${tone.stepTitle}`}>{current.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{current.body}</p>
              {current.why && (
                <p className={`mt-1.5 border-l-2 ${tone.whyRule} pl-2 text-[11px] leading-relaxed text-zinc-500`}>
                  {current.why}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-zinc-300">
              Every step is done. Nothing is stopping this going forward.
            </p>
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div className={`relative space-y-2 ${steps.length > 0 ? `mt-3 border-t ${tone.rule} pt-2.5` : "mt-2.5"}`}>
          {flags.map((flag, index) => (
            <p
              key={`${flag.text.slice(0, 24)}-${index}`}
              className={`text-[12px] leading-relaxed ${
                flag.tone === "warn" ? "text-amber-200/90" : "text-zinc-300"
              }`}
            >
              {flag.text}
            </p>
          ))}
        </div>
      )}

      <style>{`
        @keyframes korbanGuidanceGlow {
          0%, 100% { opacity: 0.35; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.7; transform: translateY(-50%) scale(1.25); }
        }
        .korban-guidance-glow { animation: korbanGuidanceGlow 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .korban-guidance-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}
