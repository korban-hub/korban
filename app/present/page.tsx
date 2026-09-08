"use client";

/**
 * /present - the deck, standing on its own.
 *
 * A client opens this from a link in an email. The whole bid rides in the
 * URL hash, so there is nothing to log in to and nothing to install - and
 * because a hash is never sent to a server, the job details never leave the
 * two browsers involved.
 *
 * This is deliberately not the estimating app. No menu, no navigation, no way
 * to wander into Backend. Just the deck and a way to replay it.
 */

import { useEffect, useState } from "react";
import BidPresentation, { type BidPresentationData } from "@/components/bid-presentation";
import { decodePresentation } from "@/lib/presentationLink";

export default function PresentPage() {
  const [data, setData] = useState<BidPresentationData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "broken">("loading");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const payload = window.location.hash.replace(/^#/, "");
    if (!payload) {
      setState("empty");
      return;
    }
    const decoded = decodePresentation(payload);
    if (!decoded) {
      setState("broken");
      return;
    }
    setData(decoded);
    setState("ready");
  }, []);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening presentation...</p>
      </main>
    );
  }

  if (state !== "ready" || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base px-6 text-center">
        <div>
          <svg width="28" height="28" viewBox="0 0 44 44" className="mx-auto" aria-hidden>
            <defs>
              <linearGradient id="kPresent" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FDBA74" />
                <stop offset="100%" stopColor="#F97316" />
              </linearGradient>
            </defs>
            <path d="M22 4 L40 38 L4 38 Z" fill="url(#kPresent)" />
            <path d="M22 4 L40 38 L22 38 Z" fill="#000" opacity="0.18" />
          </svg>
          <p
            className="mt-4 text-[22px] font-semibold uppercase tracking-[0.06em] text-white"
            style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
          >
            {state === "empty" ? "Nothing to show" : "This link is incomplete"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[12px] leading-[1.6] text-zinc-500">
            {state === "empty"
              ? "A presentation link carries the bid with it. Ask whoever sent this for the full link - the part after the # is the presentation."
              : "The link looks like it was cut short, which usually happens when an email client wraps it. Ask for it again as an attachment or a plain-text link."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      {playing ? (
        <BidPresentation data={data} onClose={() => setPlaying(false)} />
      ) : (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <svg width="30" height="30" viewBox="0 0 44 44" aria-hidden>
            <defs>
              <linearGradient id="kCover" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FDBA74" />
                <stop offset="100%" stopColor="#F97316" />
              </linearGradient>
            </defs>
            <path d="M22 4 L40 38 L4 38 Z" fill="url(#kCover)" />
            <path d="M22 4 L40 38 L22 38 Z" fill="#000" opacity="0.18" />
          </svg>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">
            {data.company || "Scaffold proposal"}
          </p>

          <h1
            className="mt-3 max-w-4xl text-[52px] font-semibold uppercase leading-[0.95] tracking-[0.02em] text-white"
            style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
          >
            {data.projectName || "Your project"}
          </h1>

          {data.projectAddress && (
            <p className="mt-2 text-[14px] text-zinc-400">{data.projectAddress}</p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 border-t border-zinc-800 pt-5 font-mono text-[11px]">
            {[
              ["Prepared for", data.customer],
              ["Estimator", data.estimator],
              ["Proposal", data.proposalNumber],
              ["Date", data.bidDate],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <span key={label}>
                  <span className="block text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                    {label}
                  </span>
                  <span className="text-zinc-200">{value}</span>
                </span>
              ))}
          </div>

          <button
            onClick={() => setPlaying(true)}
            className="mt-9 rounded-lg bg-orange-500 px-8 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-black transition hover:bg-orange-400"
          >
            Play presentation
          </button>

          <p className="mt-4 font-mono text-[10px] text-zinc-700">
            About {estimateRuntime(data)} seconds
          </p>

          {data.companyEmail && (
            <p className="mt-10 font-mono text-[10px] text-zinc-600">
              Questions? {data.companyPhone && <span>{data.companyPhone} - </span>}
              <a href={`mailto:${data.companyEmail}`} className="text-orange-400/80 hover:text-orange-300">
                {data.companyEmail}
              </a>
            </p>
          )}
        </div>
      )}
    </main>
  );
}

/** Roughly how long the deck runs, so nobody presses play blind. */
function estimateRuntime(data: BidPresentationData) {
  let seconds = 7 + 13 + 10 + 10 + 6; // cover, scope, schedule, cost, closing
  if (data.depth !== "quick-bid" ) seconds += 11; // layout
  if (data.elevations.length > 1) seconds += 8; // elevations
  if (data.depth === "korban-bid") seconds += 15; // assembly
  return seconds;
}
