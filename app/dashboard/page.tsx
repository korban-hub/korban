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
  getFirstElevation,
  getProjectProgress,
  listProjects,
  setActiveProjectId,
  seedDemoProject,
  type ProjectProgress,
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

type NewsItem = {
  outlet: string;
  icon: string;
  summary: string;
  sourceUrl: string;
  /** Article image. Empty until a live feed supplies one. */
  image?: string;
  region?: string;
};

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

/**
 * Local starts and permits. Kept separate because a contractor in Vallejo
 * bids what is happening in the Bay Area, not what is happening nationally.
 */
const LOCAL_NEWS: NewsItem[] = [
  {
    outlet: "Local permits",
    icon: "PRM",
    summary: "New commercial permits filed in your region over the last week.",
    sourceUrl: "#",
  },
  {
    outlet: "Regional starts",
    icon: "STR",
    summary: "Projects breaking ground nearby - the ones worth a phone call.",
    sourceUrl: "#",
  },
  {
    outlet: "Local bid boards",
    icon: "BID",
    summary: "Public works and school district work out to bid in your area.",
    sourceUrl: "#",
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

/**
 * The three an estimator glances at before anything else - not for the job,
 * for their own 401k. Kept apart from the sector tickers because they answer
 * a different question.
 */
const INDICES = [
  { name: "S&P 500", value: "5,412.60", move: "+0.42%" },
  { name: "Nasdaq", value: "17,890.14", move: "+0.71%" },
  { name: "Dow", value: "39,204.85", move: "-0.11%" },
];

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
/**
 * Yard stock by category, broken down the way the inventory page does it -
 * a frame is never just a frame, it is a 6'-4" by 3' or a 5' mason. Counts
 * are illustrative until company-wide tracking is connected.
 */
const YARD_CATEGORIES: { category: string; items: { partNo: string; description: string; owned: number }[] }[] = [
  {
    category: "Frames",
    items: [
      { partNo: "FO6L3", description: "6'-4\" H - 3' W Frame", owned: 620 },
      { partNo: "FO5L3", description: "5' H - 3' W Frame", owned: 180 },
      { partNo: "FM33", description: "3' H - 3' W Frame", owned: 140 },
      { partNo: "FO6L42", description: "6'-4\" H - 42\" W Frame", owned: 210 },
      { partNo: "FO6L", description: "6'-4\" H - 5' W Frame", owned: 90 },
    ],
  },
  {
    category: "Planks",
    items: [
      { partNo: "WP10", description: "10' Wood Plank", owned: 1980 },
      { partNo: "WP8", description: "8' Wood Plank", owned: 740 },
      { partNo: "WP16", description: "16' Wood Plank", owned: 400 },
    ],
  },
  {
    category: "Cross Braces",
    items: [
      { partNo: "B82", description: "8x2 Cross Brace", owned: 860 },
      { partNo: "B72", description: "7x2 Cross Brace", owned: 340 },
      { partNo: "B52", description: "5x2 Cross Brace", owned: 280 },
    ],
  },
  {
    category: "Guardrails",
    items: [
      { partNo: "GR8", description: "8' Guard Rail", owned: 520 },
      { partNo: "GR7", description: "7' Guard Rail", owned: 300 },
    ],
  },
  {
    category: "Base Plates",
    items: [
      { partNo: "BP1", description: "Fixed Base Plate", owned: 640 },
      { partNo: "BP2", description: "Swivel Base Plate", owned: 320 },
    ],
  },
  {
    category: "Screw Jacks",
    items: [
      { partNo: "AL1S", description: "Screw Jack w/ Base Plate", owned: 460 },
      { partNo: "AL1", description: "Screw Jack, no base", owned: 250 },
    ],
  },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Extra tickers live in the browser until accounts exist. */
const WATCHLIST_KEY = "korban.watchlist.v1";

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
      @keyframes korban-pulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 0.9; }
      }
      .korban-pulse { animation: korban-pulse 3.2s ease-in-out infinite; }
      @keyframes korban-glow {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 0.75; }
      }
      .korban-glow { animation: korban-glow 4.5s ease-in-out infinite; }
      @keyframes korban-slide {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .korban-slide { animation: korban-slide 0.32s ease-out; }
      .korban-ticker:hover { animation-play-state: paused; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan { animation: none; opacity: 0; }
        .korban-ticker, .korban-pulse { animation: none; }
        .korban-glow, .korban-slide { animation: none; }
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
  const [newsRegion, setNewsRegion] = useState("");
  /** Headlines rotate so the panel stays alive without needing a whole page. */
  const [newsIndex, setNewsIndex] = useState(0);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  /** Tickers the estimator added on top of the defaults. */
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [tickerDraft, setTickerDraft] = useState("");
  const [messageTab, setMessageTab] = useState<"internal" | "external">("internal");
  /** Recommendations the estimator has waved off. Another takes its place. */
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(() => {
    try {
      setProjects(listProjects());
      const backend = getBackendSettings();
      setNewsRegion(backend.company.newsRegion);
      try {
        const stored = window.localStorage.getItem(WATCHLIST_KEY);
        if (stored) setWatchlist(JSON.parse(stored) as string[]);
      } catch {
        // A malformed watchlist shouldn't take the page down.
      }
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

  useEffect(() => {
    const timer = window.setInterval(() => setNewsIndex((index) => index + 1), 5000);
    return () => window.clearInterval(timer);
  }, []);

  /** A project only counts as started once it has a name. */
  const named = useMemo(
    () => projects.filter((project) => project.projectName.trim() !== ""),
    [projects]
  );

  const withProgress = useMemo(
    () =>
      named.map((project) => ({
        project,
        progress: getProjectProgress(project, getFirstElevation(project)),
      })),
    [named]
  );

  /**
   * What Korban wants the estimator to notice today. Everything here is a
   * fact about their own book, not a suggestion - which is why it earns the
   * top of the page and a pulse.
   */
  const alerts = useMemo(() => {
    const found: { tone: "urgent" | "watch"; title: string; detail: string }[] = [];
    const today = new Date();

    const byDate = new Map<string, string[]>();
    named.forEach((project) => {
      if (!project.bidDueDate) return;
      const list = byDate.get(project.bidDueDate) ?? [];
      list.push(project.projectName);
      byDate.set(project.bidDueDate, list);
    });

    byDate.forEach((names, date) => {
      const due = parseShortDate(date);
      if (!due) return;
      const daysOut = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      // Three or more in a day is a scheduling problem, and it needs warning
      // two days out - not on the morning it lands.
      if (names.length >= 3 && daysOut >= 0 && daysOut <= 2) {
        found.push({
          tone: daysOut === 0 ? "urgent" : "watch",
          title: `${names.length} bids due ${daysOut === 0 ? "today" : `in ${daysOut} day${daysOut === 1 ? "" : "s"}`}`,
          detail: names.join(", "),
        });
      }
      if (names.length < 3 && daysOut === 0) {
        found.push({ tone: "urgent", title: "Bid due today", detail: names.join(", ") });
      }
    });

    // Stock that open bids would eat into. Committed reads zero until bids
    // carry material, so this can't fire yet - the rule is here so it does
    // the moment inventory is connected, rather than being bolted on later.
    YARD_CATEGORIES.forEach((group) => {
      const owned = group.items.reduce((sum, item) => sum + item.owned, 0);
      const committed = 0;
      if (owned > 0 && committed / owned >= 0.85) {
        found.push({
          tone: "urgent",
          title: `${group.category} running low`,
          detail: `${(owned - committed).toLocaleString()} left after committed work`,
        });
      }
    });

    named
      .filter((project) => project.bidStatus === "Still Chasing" || project.bidStatus === "No Response")
      .forEach((project) => {
        found.push({
          tone: "watch",
          title: "Last chance to follow up",
          detail: `${project.projectName} - ${project.bidStatus.toLowerCase()}`,
        });
      });

    return found;
  }, [named]);

  /**
   * Who to chase. Final round and GMP are where a bid is won or lost on a
   * phone call, so those get named first - then anything that has gone quiet.
   */
  const followUps = useMemo(() => {
    const scored = named
      .map((project) => {
        const elevation = getFirstElevation(project);
        const submitted = ["Submitted", "Still Chasing", "No Response"].includes(project.bidStatus);
        const late = project.bidStatus === "Still Chasing" || project.bidStatus === "No Response";
        // A bid that went out and went quiet is the strongest call to make.
        const priority = late ? 3 : submitted ? 2 : project.bidStatus === "Ready To Send" ? 1 : 0;
        return {
          project,
          priority,
          reason: late
            ? "No word back since it went out"
            : submitted
            ? "Out for pricing - worth a check-in"
            : project.bidStatus === "Ready To Send"
            ? "Ready to send, still sitting here"
            : "",
          coverage: elevation?.linearFeet ?? 0,
        };
      })
      .filter((row) => row.priority > 0)
      .sort((a, b) => b.priority - a.priority || b.coverage - a.coverage);
    return scored.slice(0, 4);
  }, [named]);

  /**
   * Things worth noticing that aren't a task. Heavy bid days, rounds where
   * the number moved, jobs sitting at a stage they shouldn't be. This is
   * Korban reading the book rather than listing it.
   */
  const tracker = useMemo(() => {
    const notes: { kind: string; title: string; detail: string }[] = [];

    const byDate = new Map<string, string[]>();
    named.forEach((project) => {
      if (!project.bidDueDate) return;
      const list = byDate.get(project.bidDueDate) ?? [];
      list.push(project.projectName);
      byDate.set(project.bidDueDate, list);
    });
    byDate.forEach((names, date) => {
      if (names.length >= 3) {
        notes.push({
          kind: "Heavy day",
          title: `${names.length} bids on ${date}`,
          detail: "Consider moving one, or start it early.",
        });
      }
    });

    const finalRounds = named.filter(
      (project) => project.bidStatus === "Ready To Send" || project.bidStatus === "Submitted"
    );
    if (finalRounds.length > 0) {
      notes.push({
        kind: "Final rounds",
        title: `${finalRounds.length} at final or GMP stage`,
        detail: "Round-over-round pricing comparison lands here once bids carry revision history.",
      });
    }

    const unpriced = named.filter((project) => {
      const elevation = getFirstElevation(project);
      return (elevation?.linearFeet ?? 0) > 0 && project.bidStatus === "Draft";
    });
    if (unpriced.length > 0) {
      notes.push({
        kind: "Sitting",
        title: `${unpriced.length} measured but still draft`,
        detail: "Takeoff is done on these. They just need a price.",
      });
    }

    const noDate = named.filter((project) => !project.bidDueDate);
    if (noDate.length > 0) {
      notes.push({
        kind: "No date",
        title: `${noDate.length} without a bid date`,
        detail: "They won't show on the week or trigger a reminder.",
      });
    }

    return notes;
  }, [named]);

  /**
   * Three at a time. Waving one off lets the next take its place, so the tile
   * stays a short list of things worth a thought rather than a backlog.
   */
  const visibleTracker = useMemo(
    () => tracker.filter((note) => !dismissed.includes(note.title)).slice(0, 3),
    [tracker, dismissed]
  );
  const remainingTracker = useMemo(
    () => tracker.filter((note) => !dismissed.includes(note.title)).length,
    [tracker, dismissed]
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

  function addTicker() {
    const symbol = tickerDraft.trim().toUpperCase();
    if (!symbol || watchlist.includes(symbol)) return;
    const next = [...watchlist, symbol];
    setWatchlist(next);
    setTickerDraft("");
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    } catch {
      // Not being able to persist a watchlist is not worth an error.
    }
  }

  function removeTicker(symbol: string) {
    const next = watchlist.filter((row) => row !== symbol);
    setWatchlist(next);
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    } catch {
      // Same.
    }
  }

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
            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-korban-raised px-2 py-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                Messages
              </span>
              {(["internal", "external"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMessageTab(tab)}
                  className={`rounded border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] transition ${
                    messageTab === tab
                      ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
              <a
                href="/contacts"
                className="ml-1 rounded border border-zinc-800 bg-black px-2 py-0.5 font-mono text-[9px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
              >
                Contacts
              </a>
            </div>
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
          {/* ---- What needs attention today -------------------------------- */}
          {alerts.length > 0 && (
            <section className="relative overflow-hidden rounded-lg border border-orange-500/40 bg-orange-500/[0.07] p-3">
              <span
                aria-hidden
                className="korban-pulse pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(600px 60px at 10% 0%, rgba(249,115,22,0.16), transparent 70%)",
                }}
              />
              <div className="relative flex items-center gap-2 pb-2">
                <svg width="10" height="10" viewBox="0 0 44 44" aria-hidden>
                  <path d="M22 4 L40 38 L4 38 Z" fill="#F97316" />
                </svg>
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">
                  Korban flagged this
                </h2>
                <span className="font-mono text-[9px] text-orange-400/60">
                  {alerts.length} item{alerts.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="relative grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                {alerts.map((alert, index) => (
                  <div
                    key={`${alert.title}-${index}`}
                    className={`rounded border px-2.5 py-2 ${
                      alert.tone === "urgent"
                        ? "border-orange-500/50 bg-orange-500/[0.10]"
                        : "border-orange-500/20 bg-black/40"
                    }`}
                  >
                    <p className="text-[11.5px] font-semibold text-orange-100">{alert.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[9.5px] text-zinc-400">
                      {alert.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- The three an estimator checks for themselves --------------- */}
          <div className="grid grid-cols-3 gap-2">
            {INDICES.map((index) => {
              const up = index.move.startsWith("+");
              return (
                <div
                  key={index.name}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-zinc-800 bg-korban-base px-3 py-1.5"
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                    {index.name}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-[15px] font-bold leading-none text-zinc-100">
                      {index.value}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold ${
                        up ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {index.move}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* ---- Awareness row --------------------------------------------- */}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel
              title="Construction news"
              right={
                <span className="flex items-center gap-2">
                  {newsRegion && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-orange-400/70">
                      {newsRegion}
                    </span>
                  )}
                  <SampleTag />
                </span>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                <NewsColumn heading={newsRegion || "United States"} items={US_NEWS} rotation={newsIndex} />
                <NewsColumn heading="International" items={WORLD_NEWS} rotation={newsIndex + 1} />
              </div>
              {/* Local sits underneath and carries a faint orange ground, so
                  the eye finds it without it shouting over the wider news. */}
              <div className="mt-2.5 rounded border border-orange-500/20 bg-orange-500/[0.045] p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-orange-300/80">
                    {newsRegion ? `Local - ${newsRegion}` : "Local"}
                  </p>
                  {!newsRegion && (
                    <a
                      href="/backend"
                      className="font-mono text-[9px] text-zinc-600 hover:text-orange-300"
                    >
                      set your region
                    </a>
                  )}
                </div>
                <div className="grid gap-1 md:grid-cols-3">
                  {LOCAL_NEWS.map((item, index) => (
                    <a
                      key={item.outlet}
                      href={item.sourceUrl}
                      className={`group rounded border border-orange-500/15 bg-black/30 p-1.5 transition hover:border-orange-500/40 ${
                        index === newsIndex % LOCAL_NEWS.length ? "ring-1 ring-orange-500/25" : ""
                      }`}
                    >
                      <span className="block font-mono text-[9px] font-bold text-orange-400/80">
                        {item.icon}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-zinc-300 group-hover:text-orange-300">
                        {item.outlet}
                      </span>
                      <span className="mt-0.5 block text-[9.5px] leading-[1.45] text-zinc-600">
                        {item.summary}
                      </span>
                    </a>
                  ))}
                </div>
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

                {/* Whatever else the estimator wants an eye on. */}
                {watchlist.map((symbol) => (
                  <div
                    key={symbol}
                    className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-zinc-900/70 py-1.5 last:border-0"
                  >
                    <span className="font-mono text-[13px] font-bold text-orange-400">{symbol}</span>
                    <span className="font-mono text-[9px] text-zinc-700">
                      Added by you - live once a feed is connected
                    </span>
                    <button
                      onClick={() => removeTicker(symbol)}
                      className="font-mono text-[10px] text-zinc-700 hover:text-red-400"
                      aria-label={`Remove ${symbol}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-900 pt-2">
                <input
                  value={tickerDraft}
                  onChange={(event) => setTickerDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addTicker();
                  }}
                  placeholder="Add a ticker"
                  className="min-w-0 flex-1 rounded border border-zinc-800 bg-korban-raised px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 outline-none placeholder:text-zinc-700 placeholder:normal-case focus:border-orange-500/40"
                />
                <button
                  onClick={addTicker}
                  className="rounded border border-zinc-800 bg-korban-raised px-3 py-1 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
                >
                  Add
                </button>
              </div>
            </Panel>
          </div>

          {/* ---- The work -------------------------------------------------- */}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid items-start gap-3">
              <Panel
                title="Bids in progress"
                right={
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                      {named.length} {named.length === 1 ? "project" : "projects"}
                    </span>
                    <button
                      onClick={() => router.push("/projects")}
                      className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
                    >
                      Bid log
                    </button>
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
                    <div className="grid grid-cols-[1fr_140px_92px_74px_100px] gap-3 px-1 pb-1">
                      {["Project", "Customer", "Bid due", "Level", "Status"].map((heading) => (
                        <span
                          key={heading}
                          className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600"
                        >
                          {heading}
                        </span>
                      ))}
                    </div>
                    {withProgress.map(({ project, progress }) => (
                      <button
                        key={project.projectId}
                        onClick={() => openProject(project.projectId)}
                        className="grid grid-cols-[1fr_140px_92px_74px_100px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1.5 text-left transition hover:bg-orange-500/[0.04]"
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
                          {progress === "Not started" ? (
                            <span className="text-zinc-700">-</span>
                          ) : project.estimateDepth === "quick-bid" ? (
                            "Quick"
                          ) : project.estimateDepth === "full-bid" ? (
                            "Full"
                          ) : (
                            "Korban"
                          )}
                        </span>
                        <ProgressPill progress={progress} />
                      </button>
                    ))}
                  </div>
                )}
              </Panel>


              {/* ---- Two halves: who to call, and what to keep an eye on ---- */}
              <div className="grid items-start gap-3 md:grid-cols-2">
                <Panel
                  title="Follow up"
                  right={
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                      {followUps.length > 0 ? `${followUps.length} to chase` : "clear"}
                    </span>
                  }
                  scan={false}
                >
                  {followUps.length === 0 ? (
                    <p className="px-1 py-3 text-[11px] leading-[1.6] text-zinc-600">
                      Nothing to chase. Bids move here once they are ready to send or
                      have gone out - final round and GMP jobs first, because those are
                      won on a phone call.
                    </p>
                  ) : (
                    <div className="grid gap-1">
                      {followUps.map(({ project, reason, priority }) => (
                        <button
                          key={project.projectId}
                          onClick={() => openProject(project.projectId)}
                          className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded border px-2.5 py-2 text-left transition ${
                            priority >= 3
                              ? "border-orange-500/40 bg-orange-500/[0.07] hover:border-orange-500"
                              : "border-zinc-900 bg-korban-raised hover:border-zinc-700"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[11.5px] font-semibold text-zinc-200">
                              {project.projectName}
                            </span>
                            <span className="block truncate font-mono text-[9.5px] text-zinc-500">
                              {reason}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">
                            {project.bidStatus}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Korban's own read. Brighter edge and a slow glow, because
                    this is the tile that speaks rather than reports. */}
                <section className="relative overflow-hidden rounded-lg border-2 border-orange-500 bg-korban-base p-3">
                  <span
                    aria-hidden
                    className="korban-glow pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(420px 140px at 30% 0%, rgba(249,115,22,0.20), transparent 72%)",
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-3 pb-2">
                    <span className="flex items-center gap-2">
                      <svg width="10" height="10" viewBox="0 0 44 44" aria-hidden>
                        <path d="M22 4 L40 38 L4 38 Z" fill="#F97316" />
                      </svg>
                      <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">
                        Korban Tracker
                      </h2>
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-orange-400/60">
                      {visibleTracker.length > 0 ? `${remainingTracker} noted` : "all clear"}
                    </span>
                  </div>

                  <div className="relative rounded border border-orange-500/25 bg-black/50 p-2.5">
                    {visibleTracker.length === 0 ? (
                      <p className="px-1 py-3 text-[11px] leading-[1.6] text-zinc-500">
                        Nothing worth flagging right now. I watch for heavy bid days,
                        jobs measured but never priced, final and GMP rounds, and
                        anything sitting where it shouldn&apos;t.
                      </p>
                    ) : (
                      <div className="grid gap-1.5">
                        {visibleTracker.map((note) => (
                          <div
                            key={note.title}
                            className="korban-slide grid grid-cols-[1fr_18px] items-start gap-2 border-b border-orange-500/10 pb-1.5 last:border-0 last:pb-0"
                          >
                            <span className="min-w-0">
                              <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-orange-400/70">
                                {note.kind}
                              </span>
                              <span className="mt-0.5 block text-[11.5px] font-semibold text-zinc-100">
                                {note.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] leading-[1.5] text-zinc-500">
                                {note.detail}
                              </span>
                            </span>
                            <button
                              onClick={() => setDismissed((current) => [...current, note.title])}
                              className="mt-0.5 font-mono text-[11px] leading-none text-zinc-700 transition hover:text-orange-400"
                              aria-label={`Dismiss ${note.title}`}
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>


              <Panel title="This week" scan={false}>
                <div className="grid grid-cols-7 gap-1.5">
                  {week.map((day) => {
                    const due = named.filter((project) => project.bidDueDate === day.date);
                    const open = openDay === day.key;
                    return (
                      <button
                        key={day.key}
                        onClick={() => setOpenDay(open ? null : day.key)}
                        className={`rounded border px-1.5 py-2 text-center transition ${
                          open
                            ? "border-orange-500 bg-orange-500/[0.12]"
                            : day.isToday
                            ? "border-orange-500/40 bg-orange-500/[0.06]"
                            : "border-zinc-900 bg-korban-raised hover:border-zinc-700"
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
                        <p
                          className={`mt-0.5 font-mono text-[9px] ${
                            due.length > 0 ? "text-orange-300" : "text-zinc-700"
                          }`}
                        >
                          {due.length > 0 ? `${due.length} due` : "-"}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Clicking a day says which jobs, not just how many. */}
                {openDay && (() => {
                  const day = week.find((row) => row.key === openDay);
                  const due = named.filter((project) => project.bidDueDate === day?.date);
                  return (
                    <div className="mt-2 border-t border-zinc-900 pt-2">
                      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                        {day?.label} {day?.date}
                      </p>
                      {due.length === 0 ? (
                        <p className="font-mono text-[10px] text-zinc-700">Nothing due this day.</p>
                      ) : (
                        <div className="grid gap-1">
                          {due.map((project) => (
                            <button
                              key={project.projectId}
                              onClick={() => openProject(project.projectId)}
                              className="flex items-center justify-between gap-3 rounded border border-zinc-900 bg-korban-raised px-2 py-1.5 text-left transition hover:border-orange-500/40"
                            >
                              <span className="min-w-0 truncate text-[11px] text-zinc-300">
                                {project.projectName}
                              </span>
                              <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                                {project.customer || "No customer"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Panel>
            </div>

            {/* ---- Yard ---------------------------------------------------- */}
            <div className="grid items-start gap-3">
              <Panel
              title="Inventory track"
              right={
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => router.push("/inventory")}
                    className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
                  >
                    Full yard
                  </button>
                  <SampleTag />
                </span>
              }
              scan={false}
            >
              <p className="mb-2 px-1 text-[10px] leading-[1.5] text-zinc-600">
                Stock against what open bids would commit. Click a category to see
                what is actually in it. Korban flags a category at the top of this
                page once committed work passes 85% of what the yard owns.
              </p>
              <div className="grid gap-1">
                {YARD_CATEGORIES.map((group) => {
                  const owned = group.items.reduce((sum, item) => sum + item.owned, 0);
                  // Nothing is committed until real bids carry material.
                  const committed = 0;
                  const pressure = owned > 0 ? committed / owned : 0;
                  const open = openCategory === group.category;
                  return (
                    <div key={group.category} className="border-b border-zinc-900/70 last:border-0">
                      <button
                        onClick={() => setOpenCategory(open ? null : group.category)}
                        className="w-full py-1.5 text-left"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-zinc-600">
                              {open ? "\u2212" : "+"}
                            </span>
                            <span className="text-[11px] text-zinc-300">{group.category}</span>
                            <span className="font-mono text-[9px] text-zinc-700">
                              {group.items.length} types
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-zinc-400">
                            <span className="font-bold text-zinc-200">{owned.toLocaleString()}</span>
                            <span className="mx-1 text-zinc-700">/</span>
                            <span className={committed > 0 ? "text-orange-300" : "text-zinc-700"}>
                              {committed}
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
                      </button>

                      {open && (
                        <div className="mb-1.5 grid gap-0.5 rounded border border-zinc-900 bg-korban-raised p-2">
                          {group.items.map((item) => (
                            <div
                              key={item.partNo}
                              className="grid grid-cols-[52px_1fr_64px] items-center gap-2"
                            >
                              <span className="font-mono text-[9px] text-orange-400">
                                {item.partNo}
                              </span>
                              <span className="truncate text-[10px] text-zinc-500">
                                {item.description}
                              </span>
                              <span className="text-right font-mono text-[10px] font-bold text-zinc-300">
                                {item.owned.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </Panel>
            </div>
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

/** Where a bid has got to. Complete is green because it is the only one that is done. */
function ProgressPill({ progress }: { progress: ProjectProgress }) {
  const tone =
    progress === "Complete"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : progress === "In process"
      ? "border-orange-500/35 bg-orange-500/10 text-orange-300"
      : "border-zinc-800 bg-transparent text-zinc-600";
  return (
    <span
      className={`rounded border px-2 py-0.5 text-center font-mono text-[9px] font-medium uppercase tracking-[0.1em] ${tone}`}
    >
      {progress}
    </span>
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

/**
 * One headline at a time, swapped every five seconds. A feed that rotates
 * reads as live; a static list reads as decoration. The image bay is empty
 * until a real feed supplies one - it holds its space so the layout doesn't
 * jump when it does.
 */
function NewsColumn({
  heading, items, rotation,
}: {
  heading: string;
  items: NewsItem[];
  rotation: number;
}) {
  const item = items[rotation % items.length];
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{heading}</p>
        <span className="flex gap-1">
          {items.map((row, index) => (
            <span
              key={row.outlet}
              className={`h-1 w-1 rounded-full transition ${
                index === rotation % items.length ? "bg-orange-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </span>
      </div>
      <a
        key={item.outlet}
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="group grid grid-cols-[84px_1fr] gap-2.5 rounded border border-zinc-900 bg-korban-raised p-2 transition hover:border-zinc-700"
      >
        <span className="flex h-[62px] items-center justify-center overflow-hidden rounded border border-zinc-800 bg-black">
          {item.image ? (
            <img src={item.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-mono text-[10px] font-bold text-orange-400/70">{item.icon}</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[10.5px] font-semibold text-zinc-300 group-hover:text-orange-300">
            {item.outlet}
          </span>
          <span className="mt-0.5 block text-[10px] leading-[1.5] text-zinc-500">
            {item.summary}
          </span>
        </span>
      </a>
    </div>
  );
}

/** Parses "6/14" or "06/14/26" against the current year. */
function parseShortDate(value: string): Date | null {
  const parts = value.split("/").map((part) => Number(part));
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const now = new Date();
  const year = parts[2] !== undefined ? (parts[2] < 100 ? 2000 + parts[2] : parts[2]) : now.getFullYear();
  return new Date(year, parts[0] - 1, parts[1]);
}

function getMarketDirection() {
  const total = MARKET.reduce((sum, row) => sum + Number(row.move.replace("%", "")), 0);
  const up = total >= 0;
  return { up, label: `${up ? "+" : ""}${total.toFixed(1)}% net` };
}
