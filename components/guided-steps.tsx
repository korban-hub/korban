"use client";

import { Fragment, useEffect, useRef, useState } from "react";

/**
 * Guided walkthrough for Full Bid.
 *
 * Written for someone who has never done a takeoff. A persistent step
 * panel says what to do next and why it matters; a spotlight ring draws
 * the eye to the exact control being described. Steps complete
 * automatically from real state rather than by clicking "next", so the
 * guide can never claim you've done something you haven't.
 *
 * Anchors are matched by `data-guide` attributes on the controls, which
 * keeps the guide decoupled from layout — moving a button doesn't break
 * the coaching.
 */

export type GuideStep = {
  id: string;
  title: string;
  /** Plain-language instruction — no jargon, no assumed knowledge. */
  body: string;
  /** Why this step exists. Skipped steps cause silent errors later. */
  why?: string;
  /** data-guide value of the control to spotlight. */
  anchor?: string;
  /** Completion is derived from real state, never self-reported. */
  done: boolean;
};

export function GuidedSteps({
  steps, hidden, onToggleHidden,
}: {
  steps: GuideStep[];
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
}) {
  const activeIndex = Math.max(0, steps.findIndex(s => !s.done));
  const allDone = steps.every(s => s.done);
  const active = steps[activeIndex];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  // Track the spotlit control's position. Polling on animation frames
  // rather than a ResizeObserver because the target can move for reasons
  // the observer wouldn't catch — scrolling, tab switches, panel resizes.
  useEffect(() => {
    if (hidden || allDone || !active?.anchor) { setRect(null); return; }
    function track() {
      const el = document.querySelector<HTMLElement>(`[data-guide="${active.anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
      rafRef.current = requestAnimationFrame(track);
    }
    track();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active?.anchor, hidden, allDone]);

  if (hidden) {
    return (
      <button onClick={() => onToggleHidden(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[#F97316]/40 bg-[#0b0b0b] px-3.5 py-2 text-[11px] font-semibold text-[#F97316] shadow-lg transition hover:border-[#F97316]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" />
        Show guide
        {!allDone && <span className="text-zinc-500">· {steps.filter(s => s.done).length}/{steps.length}</span>}
      </button>
    );
  }

  return (
    <Fragment>
      {/* Spotlight — a ring around the live control, not a dimming overlay,
          so nothing is ever blocked from being clicked. */}
      {rect && (
        <div aria-hidden className="pointer-events-none fixed z-40"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}>
          <span className="absolute inset-0 animate-ping rounded-xl border-2 border-[#F97316]/60" style={{ animationDuration: "1.8s" }} />
          <span className="absolute inset-0 rounded-xl border-2 border-[#F97316] shadow-[0_0_18px_2px_rgba(249,115,22,0.35)]" />
        </div>
      )}

      <aside className="fixed bottom-4 right-4 z-40 w-[320px] overflow-hidden rounded-xl border border-white/12 bg-[#0b0b0b]/97 shadow-2xl backdrop-blur">
        <header className="flex items-center gap-2 border-b border-white/8 px-3.5 py-2.5">
          <span className="flex h-1.5 w-1.5 rounded-full bg-[#F97316]" />
          <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300">
            {allDone ? "All set" : "Getting this bid built"}
          </h2>
          <button onClick={() => onToggleHidden(true)}
            className="text-[10px] text-zinc-600 transition hover:text-zinc-300">hide</button>
        </header>

        {/* Progress — one tick per step, filled as real work completes */}
        <div className="flex gap-1 px-3.5 pt-3">
          {steps.map((s, i) => (
            <span key={s.id}
              className={`h-[3px] flex-1 rounded-full transition ${
                s.done ? "bg-[#F97316]" : i === activeIndex ? "bg-[#F97316]/40" : "bg-white/10"
              }`} />
          ))}
        </div>

        {allDone ? (
          <div className="px-3.5 py-3.5">
            <p className="text-[13px] leading-relaxed text-zinc-300">
              That&apos;s everything a full bid needs. Take a look at the layout, then head to
              Review Estimate when you&apos;re ready.
            </p>
          </div>
        ) : (
          <div className="px-3.5 py-3.5">
            <p className="text-[10px] text-zinc-600" style={{ fontFamily: "ui-monospace, monospace" }}>
              Step {activeIndex + 1} of {steps.length}
            </p>
            <h3 className="mt-1 text-[14px] font-semibold text-white">{active.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">{active.body}</p>
            {active.why && (
              <p className="mt-2 border-l-2 border-[#F97316]/40 pl-2.5 text-[11.5px] leading-relaxed text-zinc-500">
                {active.why}
              </p>
            )}
          </div>
        )}

        {/* Remaining steps, so the whole path is visible from the start */}
        {!allDone && (
          <ul className="border-t border-white/8 px-3.5 py-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 py-0.5">
                <span className={`flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border text-[7px] ${
                  s.done ? "border-[#F97316] bg-[#F97316] text-black" : i === activeIndex ? "border-[#F97316] text-[#F97316]" : "border-white/15 text-transparent"
                }`}>✓</span>
                <span className={`text-[11px] ${s.done ? "text-zinc-600 line-through" : i === activeIndex ? "text-zinc-200" : "text-zinc-600"}`}>
                  {s.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </Fragment>
  );
}
