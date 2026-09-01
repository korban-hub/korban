"use client";

import { useRouter } from "next/navigation";

type Trade = {
  id: string;
  name: string;
  detail: string;
  href: string | null;
  live: boolean;
};

/**
 * Ordered the way a building actually gets built — outermost work first,
 * moving inward. That sequence is the organising idea of this screen, so
 * the layout expresses it as a vertical progression rather than a grid,
 * where order would be invisible.
 */
const TRADES: Trade[] = [
  { id: "concrete",  name: "Concrete & Pavement", detail: "Foundations, flatwork, site paving", href: null, live: false },
  { id: "scaffold",  name: "Scaffold",            detail: "Access, shoring towers, load lists",  href: "/dashboard", live: true },
  { id: "roofing",   name: "Roofing",             detail: "Membrane, edge metal, penetrations",  href: null, live: false },
  { id: "exterior",  name: "Exterior Finishes",   detail: "Plaster, paint, siding",              href: null, live: false },
  { id: "masonry",   name: "Masonry",             detail: "Block, brick, stone veneer",          href: null, live: false },
  { id: "framing",   name: "Framing",             detail: "Wood and light-gauge steel",          href: null, live: false },
  { id: "electrical",name: "Electrical",          detail: "Rough-in, devices, gear",             href: null, live: false },
  { id: "plumbing",  name: "Plumbing",            detail: "Supply, waste, fixtures",             href: null, live: false },
  { id: "drywall",   name: "Drywall",             detail: "Hang, finish, texture",               href: null, live: false },
];

export default function TradesPanelPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070604] text-white">
      {/* Atmosphere — matches the sign-in screen so this reads as the same product */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F97316]/15 blur-[160px]" />
        <div className="absolute -right-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[#F97316]/12 blur-[170px]" />
        <div className="absolute bottom-[-220px] left-1/4 h-[560px] w-[560px] rounded-full bg-[#F97316]/14 blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[760px] flex-col px-6 py-14">
        {/* Header */}
        <header className="flex items-end justify-between">
          <div className="flex items-center gap-3">
            <svg width="30" height="30" viewBox="0 0 44 44" className="shrink-0">
              <defs>
                <linearGradient id="korbanMarkPanel" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FDBA74" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
              </defs>
              <path d="M22 4 L40 38 L4 38 Z" fill="url(#korbanMarkPanel)" />
              <path d="M22 4 L40 38 L22 38 Z" fill="#000000" opacity="0.18" />
            </svg>
            <span className="uppercase text-[#F97316]"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "34px", fontWeight: 700, letterSpacing: ".14em", lineHeight: 1 }}>
              Korban
            </span>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="text-[11px] text-zinc-600 transition hover:text-zinc-400"
            style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".05em" }}>
            sign out
          </button>
        </header>

        <p className="mt-10 text-zinc-400" style={{ fontFamily: "Geist, sans-serif", fontSize: "15px" }}>
          Choose what you&rsquo;re estimating.
        </p>

        {/* GC entry — the whole project at once, so it sits above the sequence */}
        <button
          onClick={() => router.push("/dashboard")}
          className="group mt-5 w-full rounded-2xl border border-[#F97316]/45 bg-[#F97316]/[0.07] px-6 py-5 text-left transition hover:border-[#F97316]/80 hover:bg-[#F97316]/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[#F97316]" style={{ fontFamily: "Geist, sans-serif", fontSize: "19px", fontWeight: 600 }}>
                All Trades
              </div>
              <div className="mt-1 text-zinc-400" style={{ fontFamily: "Geist, sans-serif", fontSize: "13px" }}>
                Full project estimate across every scope
              </div>
            </div>
            <span className="shrink-0 text-[#F97316] opacity-60 transition group-hover:opacity-100"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "18px" }}>›</span>
          </div>
        </button>

        {/* The sequence — outermost work at the top, moving inward */}
        <div className="relative mt-9 pb-10">
          <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-[#F97316]/45 via-white/10 to-transparent" />

          <ul className="flex flex-col gap-1.5">
            {TRADES.map((trade) => {
              const Row = trade.live ? "button" : "div";
              return (
                <li key={trade.id} className="relative pl-9">
                  <span aria-hidden
                    className={`absolute left-0 top-[19px] h-[15px] w-[15px] rounded-full border-2 ${
                      trade.live
                        ? "border-[#F97316] bg-[#F97316] shadow-[0_0_12px_2px_rgba(249,115,22,0.45)]"
                        : "border-white/20 bg-[#070604]"
                    }`} />
                  <Row
                    {...(trade.live
                      ? {
                          onClick: () => trade.href && router.push(trade.href),
                          type: "button" as const,
                        }
                      : { "aria-disabled": true })}
                    className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition ${
                      trade.live
                        ? "border border-white/15 bg-white/[0.04] hover:border-[#F97316]/60 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/70"
                        : "border border-transparent"
                    }`}>
                    <div className="min-w-0">
                      <div className={trade.live ? "text-white" : "text-zinc-600"}
                        style={{ fontFamily: "Geist, sans-serif", fontSize: "16px", fontWeight: trade.live ? 600 : 500 }}>
                        {trade.name}
                      </div>
                      <div className={trade.live ? "mt-0.5 text-zinc-400" : "mt-0.5 text-zinc-700"}
                        style={{ fontFamily: "Geist, sans-serif", fontSize: "12.5px" }}>
                        {trade.detail}
                      </div>
                    </div>
                    {trade.live ? (
                      <span className="shrink-0 rounded-full bg-[#F97316] px-3 py-1 text-black"
                        style={{ fontFamily: "Geist, sans-serif", fontSize: "11px", fontWeight: 600 }}>
                        Open
                      </span>
                    ) : (
                      <span className="shrink-0 text-zinc-700"
                        style={{ fontFamily: "ui-monospace, monospace", fontSize: "10px", letterSpacing: ".08em" }}>
                        in development
                      </span>
                    )}
                  </Row>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-auto text-zinc-700" style={{ fontFamily: "ui-monospace, monospace", fontSize: "10.5px", letterSpacing: ".06em" }}>
          Trades follow the build sequence, outside in.
        </p>
      </div>
    </main>
  );
}
