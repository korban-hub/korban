"use client";

/**
 * Bid rounds - the pieces Plan Desk and Estimate Review share.
 *
 * A job bids a round from the day it is set up (Budget, Bid Round 1, GMP, or
 * whatever the GC calls it). When a new round is released, the estimator
 * revises: the round that went out is frozen with its number and figures,
 * the number gets its next letter (2041 -> 2041A -> 2041B), and the job
 * carries on under the new round. The takeoff is never copied; this is the
 * record of what was bid, so rounds can be set beside each other.
 */

import { useEffect, useState } from "react";
import {
  BID_ROUND_OPTIONS,
  reviseBidRound,
  updateActiveProject,
  type BidRoundFigures,
  type ProjectRecord,
} from "@/lib/projectStore";

const OTHER = "__other__";

function isListed(title: string) {
  return (BID_ROUND_OPTIONS as readonly string[]).includes(title);
}

export function formatRoundDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Pick a round: the standard list, or Other with a title of the estimator's
 * own. Reads as one row in the job-details tile.
 */
export function BidRoundPicker({
  value, onChange, autoFocus = false,
}: {
  value: string;
  onChange: (title: string) => void;
  autoFocus?: boolean;
}) {
  const custom = value !== "" && !isListed(value);
  const [other, setOther] = useState(custom);
  const [draft, setDraft] = useState(custom ? value : "");

  useEffect(() => {
    const isCustom = value !== "" && !isListed(value);
    setOther(isCustom);
    if (isCustom) setDraft(value);
  }, [value]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <select
        autoFocus={autoFocus}
        value={other ? OTHER : value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER) { setOther(true); return; }
          setOther(false);
          onChange(next);
        }}
        className="min-w-[150px] rounded border border-zinc-800 bg-korban-raised px-2 py-1 font-mono text-[11px] text-zinc-200 outline-none focus:border-orange-500/40"
      >
        <option value="">Not set</option>
        {BID_ROUND_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {other && (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { if (draft.trim()) onChange(draft.trim()); }}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
          placeholder="What the GC calls this round"
          className="min-w-0 flex-1 rounded border border-zinc-800 bg-korban-raised px-2 py-1 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
        />
      )}
    </div>
  );
}

/**
 * The prompt an estimator meets coming back to a job that already went out:
 * a new round released? Revise picks the round, freezes the old one and
 * moves the number on a letter.
 */
export function BidRoundRevise({
  project, onRevised,
}: {
  project: ProjectRecord;
  onRevised: (next: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nextRound, setNextRound] = useState("");

  const wentOut = Boolean(project.proposalIssuedDate) ||
    ["Submitted", "Won", "Lost", "Still Chasing", "No Response"].includes(project.bidStatus);
  if (!wentOut) return null;

  const current = project.bidRound || "Original";
  const when = project.proposalIssuedDate ? ` on ${formatRoundDate(project.proposalIssuedDate)}` : "";

  function revise() {
    if (!nextRound.trim()) return;
    const revised = reviseBidRound(project, nextRound.trim());
    const saved = updateActiveProject(revised);
    setOpen(false);
    setNextRound("");
    onRevised(saved);
  }

  return (
    <div className="mb-2 rounded border border-orange-500/30 bg-orange-500/[0.06] px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] leading-[1.5] text-zinc-300">
          This bid went out as <span className="font-semibold text-orange-200">{current}</span>
          {project.proposalNumber ? <> under <span className="font-mono text-orange-200">{project.proposalNumber}</span></> : null}
          {when}. New round released?
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded border border-orange-400/50 bg-orange-400/10 px-3 py-1 font-mono text-[10px] font-medium text-orange-200 transition hover:bg-orange-400/20"
          >
            Revise
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 grid gap-2 border-t border-orange-500/20 pt-2">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-zinc-500">Which round is this revision for?</p>
          <BidRoundPicker value={nextRound} onChange={setNextRound} autoFocus />
          <p className="text-[10px] leading-[1.5] text-zinc-500">
            {current} is frozen with its number and figures. The job moves to {nextRound || "the new round"}
            {project.proposalNumber ? ` as ${project.proposalNumberBase || project.proposalNumber}${nextLetterFor(project)}` : ""}, a draft until it goes out. The takeoff stays as it is.
          </p>
          <div className="flex gap-2">
            <button
              onClick={revise}
              disabled={!nextRound.trim()}
              className="rounded border border-orange-400/50 bg-orange-400/10 px-3 py-1 font-mono text-[10px] font-medium text-orange-200 transition hover:bg-orange-400/20 disabled:cursor-default disabled:opacity-40"
            >
              Freeze {current} and revise
            </button>
            <button
              onClick={() => { setOpen(false); setNextRound(""); }}
              className="rounded border border-zinc-800 px-3 py-1 font-mono text-[10px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function nextLetterFor(project: ProjectRecord): string {
  const n = project.bidRoundHistory.length + 1;
  let s = "", k = n;
  while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
  return s;
}

/**
 * The rounds side by side: what each went out at, and how the next moved.
 * The current round reads from the live figures.
 */
export function BidRoundHistory({
  project, current,
}: {
  project: ProjectRecord;
  current?: BidRoundFigures | null;
}) {
  const rows = [
    ...project.bidRoundHistory.map((r) => ({
      title: r.title, number: r.proposalNumber, issued: r.issuedDate, figures: r.figures, live: false,
    })),
    {
      title: project.bidRound || "Current",
      number: project.proposalNumber,
      issued: project.proposalIssuedDate,
      figures: current ?? project.currentFigures,
      live: true,
    },
  ];
  if (project.bidRoundHistory.length === 0) return null;

  return (
    <div className="mt-2 border-t border-zinc-900/70 pt-2">
      <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-orange-400/80">
        Bid rounds
      </p>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.8fr)] gap-x-2 px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">
        <span>Round</span><span>Number</span><span className="text-right">Total</span><span className="text-right">$/LF</span><span className="text-right">Hours</span><span className="text-right">Change</span>
      </div>
      {rows.map((row, i) => {
        const prev = i > 0 ? rows[i - 1].figures : null;
        const f = row.figures;
        const delta = f && prev && prev.finalBid > 0 ? (f.finalBid - prev.finalBid) / prev.finalBid : null;
        return (
          <div
            key={`${row.title}-${i}`}
            className={`grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.8fr)] items-center gap-x-2 border-t border-zinc-900/60 px-1 py-1 text-[10.5px] ${row.live ? "text-zinc-200" : "text-zinc-400"}`}
          >
            <span className="truncate">
              {row.title}
              {row.issued ? <span className="ml-1 font-mono text-[9px] text-zinc-600">{formatRoundDate(row.issued)}</span>
                : row.live ? <span className="ml-1 font-mono text-[9px] text-zinc-600">draft</span> : null}
            </span>
            <span className="truncate font-mono">{row.number || "—"}</span>
            <span className="text-right font-mono">{f ? money(f.finalBid) : "—"}</span>
            <span className="text-right font-mono">{f && f.linearFeet > 0 ? money(f.pricePerLf) : "—"}</span>
            <span className="text-right font-mono">{f ? Math.round(f.laborHours).toLocaleString() : "—"}</span>
            <span className={`text-right font-mono ${delta == null ? "text-zinc-700" : delta < 0 ? "text-emerald-400" : delta > 0 ? "text-orange-300" : "text-zinc-500"}`}>
              {delta == null ? "—" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
