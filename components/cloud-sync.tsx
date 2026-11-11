"use client";

/**
 * The sync pill.
 *
 * Small, bottom right, on every page: who is signed in, whether the jobs are
 * on the account, and a way out. It is the only thing on screen that says the
 * work has left this machine, so it says it plainly - "Saved to your account"
 * rather than a cloud icon the estimator has to interpret.
 *
 * Signed out it is not drawn at all: Korban asks for a sign-in before any
 * working page opens, so there is nothing for it to report.
 */

import { useEffect, useState } from "react";
import { getSyncState, onSyncState, signOutOfKorban, startCloudSync, syncNow, type SyncState } from "@/lib/cloudSync";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function CloudSync() {
  const [state, setState] = useState<SyncState>(getSyncState());
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState("");

  useEffect(() => {
    const stop = startCloudSync();
    const unsubscribe = onSyncState(setState);
    return () => { unsubscribe(); stop(); };
  }, []);

  const tone =
    state.status === "synced" ? "border-emerald-500/30 text-emerald-300/90"
    : state.status === "working" ? "border-orange-500/40 text-orange-300"
    : state.status === "offline" ? "border-amber-500/40 text-amber-300"
    : state.status === "error" ? "border-red-500/40 text-red-300"
    : "border-zinc-800 text-zinc-500";


  const label =
    state.status === "synced" ? "Saved to your account"
    : state.status === "working" ? state.note
    : state.status === "offline" ? "Offline"
    : state.status === "error" ? "Sync trouble"
    : "";

  // Nobody signed in: the sign-in page is all there is, and it needs no pill.
  if (state.status === "off") return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[60] flex flex-col items-end gap-1.5 print:hidden">
      {open && (
        <div className="pointer-events-auto w-[260px] rounded-lg border border-zinc-800 bg-korban-raised/95 p-3 shadow-xl backdrop-blur">
          <>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-zinc-600">Signed in</p>
              <p className="truncate text-[11.5px] text-zinc-200">
                {state.status === "synced" ? state.email : "…"}
              </p>
              <p className="mt-1.5 text-[10.5px] leading-[1.6] text-zinc-500">
                {state.status === "synced" ? `Everything is on your account. Last checked ${timeOf(state.at)}.`
                  : state.status === "working" ? `${state.note}…`
                  : state.status === "offline" ? "Can't reach the server. Your work is safe on this machine and will go up when you're back."
                  : state.note}
              </p>
              <div className="mt-2.5 flex gap-1.5">
                <button
                  onClick={() => { void syncNow(); }}
                  className="flex-1 rounded border border-zinc-800 px-2 py-1.5 font-mono text-[10px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                >
                  Check now
                </button>
                <button
                  onClick={() => {
                    setRefusal("");
                    void signOutOfKorban().then((result) => {
                      if (result.ok) window.location.href = "/login";
                      else setRefusal(result.reason);
                    });
                  }}
                  className="rounded border border-zinc-800 px-2 py-1.5 font-mono text-[10px] text-zinc-500 transition hover:border-red-500/40 hover:text-red-300"
                >
                  Sign out
                </button>
              </div>
            {refusal && <p className="mt-2 text-[10.5px] leading-[1.6] text-amber-300">{refusal}</p>}
          </>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`pointer-events-auto flex items-center gap-1.5 rounded-full border bg-korban-raised/90 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] shadow-lg backdrop-blur transition hover:brightness-125 ${tone}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${
          state.status === "synced" ? "bg-emerald-400"
          : state.status === "working" ? "animate-pulse bg-orange-400"
          : state.status === "offline" ? "bg-amber-400"
          : state.status === "error" ? "bg-red-400"
          : "bg-zinc-600"}`} />
        {label}
      </button>
    </div>
  );
}
