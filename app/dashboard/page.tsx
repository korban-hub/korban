"use client";

/**
 * Bid Room - the hub.
 *
 * An estimator opens this before anything else, so the top of the page is
 * awareness: what the industry is doing and where the market sits. Below that
 * is the work - live bids, what's due, what the yard can cover.
 *
 * Two kinds of data live here and they are marked differently on purpose.
 * Bids and inventory come from KORBAN's own records and are real. News and
 * market figures come from outside feeds that aren't connected yet; those
 * carry a SAMPLE marker until they are, because a stock price that looks live
 * and isn't is worse than no stock price at all.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import {
  createProject,
  listProjects,
  setActiveProjectId,
  seedDemoProject,
  type ProjectRecord,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

const menuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/set-scaffold-v2", label: "Set Scaffold" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/margin-review", label: "Margin Review" },
  { href: "/projects", label: "Projects" },
  { href: "/backend", label: "Backend" },
];

// -----------------------------------------------------------------------------
// Outside feeds - structured for live data, sample until connected
// -----------------------------------------------------------------------------

type NewsItem = { outlet: string; icon: string; summary: string; sourceUrl: string };

const US_NEWS: NewsItem[] = [
  {
    outlet: "ENR",
    icon: "ENR",
    summary: "Infrastructure and public works bidding remain important signals for scaffold demand.",
    sourceUrl: "https://www.enr.com",
  },
  {
    outlet: "Construction Dive",
    icon: "CD",
    summary: "Healthcare, industrial and public sector projects continue to drive selective opportunities.",
    sourceUrl: "https://www.constructiondive.com",
  },
];

const WORLD_NEWS: NewsItem[] = [
  {
    outlet: "Global Construction Review",
    icon: "GCR",
    summary: "Global infrastructure, transportation and energy projects remain active across major regions.",
    sourceUrl: "https://www.globalconstructionreview.com",
  },
  {
    outlet: "World Construction Network",
    icon: "WCN",
    summary: "Material pricing, labor availability and project finance continue affecting delivery.",
    sourceUrl: "https://www.worldconstructionnetwork.com",
  },
];

type Ticker = {
  ticker: string; name: string; move: string; price: string;
  volume: string; dayRange: string; sector: string; note: string;
};

const MARKET: Ticker[] = [
  { ticker: "URI", name: "United Rentals", move: "+1.8%", price: "$681.42", volume: "812K", dayRange: "$667.20 - $684.91", sector: "Rental Equipment", note: "Equipment rental demand signal" },
  { ticker: "CAT", name: "Caterpillar", move: "-0.6%", price: "$327.18", volume: "1.9M", dayRange: "$324.75 - $331.40", sector: "Heavy Equipment", note: "Heavy machinery demand" },
  { ticker: "VMC", name: "Vulcan Materials", move: "+0.9%", price: "$251.80", volume: "704K", dayRange: "$247.92 - $252.66", sector: "Construction Materials", note: "Aggregate and infrastructure signal" },
  { ticker: "MLM", name: "Martin Marietta", move: "+0.4%", price: "$566.20", volume: "418K", dayRange: "$559.30 - $568.10", sector: "Materials", note: "Public works material demand" },
];

/**
 * Yard stock. Company-wide inventory tracking isn't built yet, so these are
 * illustrative counts against the real piece names from Backend.
 */
const YARD_STOCK: Record<string, number> = {
  Frames: 1240,
  Planks: 3120,
  "Cross Braces": 1480,
  Guardrails: 820,
  "Base Plates": 960,
  "Screw Jacks": 710,
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// -----------------------------------------------------------------------------
// Motion
// -----------------------------------------------------------------------------

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      @keyframes korban-ticker {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      .korban-ticker { animation: korban-ticker 38s linear infinite; }
      .korban-ticker:hover { animation-play-state: paused; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan { animation: none; opacity: 0; }
        .korban-ticker { animation: none; }
      }
    `}</style>
  );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [pieceNames, setPieceNames] = useState<string[]>([]);

  const load = useCallback(() => {
    try {
      setProjects(listProjects());
      setPieceNames(
        getBackendSettings().material.items.filter((item) => item.isCore).map((item) => item.name)
      );
    } catch {
      // Storage unavailable - the page renders with nothing rather than failing.
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  /** A project only counts as started once it has a name. */
  const named = useMemo(
    () => projects.filter((project) => project.projectName.trim() !== ""),
    [projects]
  );

  const week = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(today);
      day.setDate(today.getDate() + offset);
      return {
        label: WEEKDAYS[(day.getDay() + 6) % 7],
        date: `${day.getMonth() + 1}/${day.getDate()}`,
        key: day.toLocaleDateString("en-US"),
        isToday: offset === 0,
      };
    });
  }, []);

  function startProject() {
    createProject();
    router.push("/project-plan-desk");
  }

  function openProject(projectId: string) {
    setActiveProjectId(projectId);
    router.push("/project-plan-desk");
  }

  function loadDemo() {
    seedDemoProject();
    router.push("/project-plan-desk");
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening bid room...</p>
      </main>
    );
  }

  const marketDirection = getMarketDirection();

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Bid Room"
        subtitle="What the market is doing, what's due, and what the yard can cover."
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <KorbanButton variant="ghost" onClick={() => router.push("/projects")}>
              Bid log
            </KorbanButton>
            <KorbanButton variant="primary" onClick={startProject}>
              + New project
            </KorbanButton>
          </>
        }
      />

      {/* ---- Market ticker. First thing an estimator sees. ---------------- */}
      <div className="relative overflow-hidden border-b border-zinc-900 bg-black">
        <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-gradient-to-r from-black via-black to-transparent pr-8 pl-4">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Market
          </span>
          <span className="rounded border border-zinc-800 px-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-700">
            sample
          </span>
        </div>
        <div className="korban-ticker flex w-max gap-8 py-2 pl-40">
          {[...MARKET, ...MARKET].map((row, index) => {
            const up = row.move.startsWith("+");
            return (
              <span key={`${row.ticker}-${index}`} className="flex shrink-0 items-baseline gap-2">
                <span className="font-mono text-[11px] font-bold text-zinc-200">{row.ticker}</span>
                <span className="font-mono text-[11px] text-zinc-500">{row.price}</span>
                <span className={`font-mono text-[11px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
                  {row.move}
                </span>
                <span className="font-mono text-[9px] text-zinc-700">{row.sector}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[1600px] px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative space-y-3">
          {/* ---- Awareness row --------------------------------------------- */}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel
              title="Construction news"
              right={<SampleTag />}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <NewsColumn heading="United States" items={US_NEWS} />
                <NewsColumn heading="International" items={WORLD_NEWS} />
              </div>
            </Panel>

            <Panel
              title="Market watch"
              right={
                <span className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[10px] font-bold ${
                      marketDirection.up ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {marketDirection.label}
                  </span>
                  <SampleTag />
                </span>
              }
              scan={false}
            >
              <div className="grid gap-1.5">
                {MARKET.map((row) => {
                  const up = row.move.startsWith("+");
                  return (
                    <div
                      key={row.ticker}
                      className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-zinc-900/70 py-1.5 last:border-0"
                    >
                      <span className="font-mono text-[13px] font-bold text-orange-400">
                        {row.ticker}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] text-zinc-300">{row.name}</span>
                        <span className="block truncate font-mono text-[9px] text-zinc-600">
                          {row.sector}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[12px] font-bold text-zinc-200">
                          {row.price}
                        </span>
                        <span
                          className={`block font-mono text-[10px] font-bold ${
                            up ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {row.move}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* ---- The work -------------------------------------------------- */}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid items-start gap-3">
              <Panel
                title="Bids in progress"
                right={
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                    {named.length} {named.length === 1 ? "project" : "projects"}
                  </span>
                }
              >
                {named.length === 0 ? (
                  <div className="px-1 py-5 text-center">
                    <p className="text-[12px] text-zinc-400">No bids yet.</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-[1.6] text-zinc-600">
                      Start a project and you land on the Plan Desk to fill in the
                      details. Everything after that builds from what you enter there.
                    </p>
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        onClick={startProject}
                        className="rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-bold text-black hover:bg-orange-400"
                      >
                        + New project
                      </button>
                      <button
                        onClick={loadDemo}
                        className="rounded border border-zinc-800 bg-korban-raised px-4 py-1.5 font-mono text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      >
                        Load demo job
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-1">
                    <div className="grid grid-cols-[1fr_150px_110px_84px] gap-3 px-1 pb-1">
                      {["Project", "Customer", "Bid due", "Depth"].map((heading) => (
                        <span
                          key={heading}
                          className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600"
                        >
                          {heading}
                        </span>
                      ))}
                    </div>
                    {named.map((project) => (
                      <button
                        key={project.projectId}
                        onClick={() => openProject(project.projectId)}
                        className="grid grid-cols-[1fr_150px_110px_84px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1.5 text-left transition hover:bg-orange-500/[0.04]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11.5px] font-semibold text-zinc-200">
                            {project.projectName}
                          </span>
                          <span className="block truncate font-mono text-[9px] text-zinc-600">
                            {project.projectAddress || "No address"}
                          </span>
                        </span>
                        <span className="truncate text-[11px] text-zinc-400">
                          {project.customer || <span className="text-zinc-700">Not set</span>}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {project.bidDueDate || <span className="text-zinc-700">-</span>}
                        </span>
                        <span className="font-mono text-[10px] text-orange-300/80">
                          {project.estimateDepth === "quick-bid"
                            ? "Quick"
                            : project.estimateDepth === "full-bid"
                            ? "Full"
                            : "Korban"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="This week" scan={false}>
                <div className="grid grid-cols-7 gap-1.5">
                  {week.map((day) => {
                    const due = named.filter((project) => project.bidDueDate === day.date);
                    return (
                      <div
                        key={day.key}
                        className={`rounded border px-1.5 py-2 text-center ${
                          day.isToday
                            ? "border-orange-500/40 bg-orange-500/[0.06]"
                            : "border-zinc-900 bg-korban-raised"
                        }`}
                      >
                        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                          {day.label}
                        </p>
                        <p
                          className={`font-mono text-[13px] font-bold ${
                            day.isToday ? "text-orange-300" : "text-zinc-400"
                          }`}
                        >
                          {day.date}
                        </p>
                        <p className="mt-0.5 font-mono text-[9px] text-zinc-700">
                          {due.length > 0 ? `${due.length} due` : "-"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            {/* ---- Yard ---------------------------------------------------- */}
            <Panel
              title="Inventory track"
              right={
                <span className="flex items-center gap-2">
                  <a
                    href="/inventory"
                    className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600 hover:text-orange-300"
                  >
                    full yard
                  </a>
                  <SampleTag />
                </span>
              }
              scan={false}
            >
              <p className="mb-2 px-1 text-[10px] leading-[1.5] text-zinc-600">
                Stock against what open bids would commit. Company-wide tracking
                connects here once it exists.
              </p>
              <div className="grid gap-1">
                {(pieceNames.length ? pieceNames : Object.keys(YARD_STOCK)).map((name) => {
                  const available = YARD_STOCK[name] ?? 0;
                  // Nothing is committed until real bids carry material, so
                  // pressure reads at zero rather than at an invented number.
                  const committed = 0;
                  const pressure = available > 0 ? committed / available : 0;
                  return (
                    <div key={name} className="border-b border-zinc-900/70 py-1.5 last:border-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[11px] text-zinc-300">{name}</span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          <span className="font-bold text-zinc-200">
                            {available.toLocaleString()}
                          </span>
                          <span className="mx-1 text-zinc-700">/</span>
                          <span className={committed > 0 ? "text-orange-300" : "text-zinc-700"}>
                            {committed > 0 ? committed.toLocaleString() : "0"}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-900">
                        <div
                          className={`h-full transition-[width] duration-500 ${
                            pressure > 0.85
                              ? "bg-red-500"
                              : pressure > 0.6
                              ? "bg-amber-500"
                              : "bg-orange-500"
                          }`}
                          style={{ width: `${Math.min(100, pressure * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

function Panel({
  title, right, scan = true, children,
}: {
  title: string;
  right?: React.ReactNode;
  scan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      {scan && (
        <span
          aria-hidden
          className="korban-scan pointer-events-none absolute -top-px left-0 h-px w-[36%]"
          style={{ background: "linear-gradient(90deg,transparent,#F97316,transparent)" }}
        />
      )}
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </h2>
        {right}
      </div>
      <div className="rounded border border-zinc-900 bg-black p-2.5">{children}</div>
    </section>
  );
}

/** Marks anything coming from a feed that isn't connected yet. */
function SampleTag() {
  return (
    <span
      title="Placeholder until a live feed is connected"
      className="rounded border border-zinc-800 px-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-700"
    >
      sample
    </span>
  );
}

function NewsColumn({ heading, items }: { heading: string; items: NewsItem[] }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
        {heading}
      </p>
      <div className="grid gap-1.5">
        {items.map((item) => (
          <a
            key={item.outlet}
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="group grid grid-cols-[36px_1fr] gap-2.5 rounded border border-zinc-900 bg-korban-raised p-2 transition hover:border-zinc-700"
          >
            <span className="flex h-7 w-9 items-center justify-center rounded border border-zinc-800 bg-black font-mono text-[9px] font-bold text-orange-400">
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[10.5px] font-semibold text-zinc-300 group-hover:text-orange-300">
                {item.outlet}
              </span>
              <span className="block text-[10px] leading-[1.5] text-zinc-600">{item.summary}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function getMarketDirection() {
  const total = MARKET.reduce((sum, row) => sum + Number(row.move.replace("%", "")), 0);
  const up = total >= 0;
  return { up, label: `${up ? "+" : ""}${total.toFixed(1)}% net` };
}
