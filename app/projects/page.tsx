"use client";

/**
 * Bid/Job Log - the file cabinet.
 *
 * The Bid Room shows what is live. This shows everything: won, lost, chasing,
 * still in draft. An estimator comes here to find a job they bid two years
 * ago, or to see how a customer's work has actually gone.
 *
 * Tiles rather than rows on purpose. A wall of jobs with a coloured dot on
 * each is scannable at a glance - No Response glows yellow and pulses because
 * silence is the thing most worth noticing, and it is the easiest to forget.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import {
  BID_STATUSES,
  SUBMITTED_STATUSES,
  createProject,
  deleteProject,
  getFirstElevation,
  getProjectProgress,
  listProjects,
  setActiveProjectId,
  updateActiveProject,
  type BidStatus,
  type ProjectRecord,
} from "@/lib/projectStore";
import { loadEstimateState } from "@/lib/estimateState";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/inventory", label: "Company Inventory" },
  { href: "/contacts", label: "Contacts" },
  { href: "/backend", label: "Backend" },
];

/**
 * How each status reads at a glance. Ready To Send is white because it is
 * waiting on you; No Response is yellow and glowing because it is waiting on
 * them and nobody is watching it.
 */
const STATUS_DOT: Record<BidStatus, string> = {
  Draft: "bg-zinc-500",
  "Internal Review": "bg-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.6)]",
  "Ready To Send": "bg-white shadow-[0_0_12px_rgba(255,255,255,0.55)]",
  Submitted: "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]",
  Won: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]",
  Lost: "bg-red-400",
  "Still Chasing": "bg-zinc-300 shadow-[0_0_10px_rgba(228,228,231,0.4)]",
  "No Response": "bg-yellow-300 shadow-[0_0_14px_rgba(234,179,8,0.8)]",
};

function tileBorder(status: BidStatus) {
  if (status === "Won") return "border-emerald-500/50";
  if (status === "Lost") return "border-red-500/40";
  if (status === "No Response") return "border-yellow-500/45";
  if (status === "Ready To Send") return "border-white/25";
  return "border-zinc-800";
}

type SortKey = "recent" | "name" | "customer" | "due";

export default function BidJobLogPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BidStatus | "All">("All");
  const [sort, setSort] = useState<SortKey>("recent");

  const load = useCallback(() => {
    try {
      setProjects(listProjects());
    } catch {
      // Storage unavailable - the page renders empty rather than failing.
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const named = useMemo(
    () => projects.filter((project) => project.projectName.trim() !== ""),
    [projects]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = named.filter((project) => {
      if (statusFilter !== "All" && project.bidStatus !== statusFilter) return false;
      if (!term) return true;
      return [
        project.projectName,
        project.customer,
        project.generalContractor,
        project.projectAddress,
        project.proposalNumber,
        project.estimator,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.projectName.localeCompare(b.projectName);
      if (sort === "customer") return (a.customer || "").localeCompare(b.customer || "");
      if (sort === "due") return (a.bidDueDate || "\uffff").localeCompare(b.bidDueDate || "\uffff");
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }, [named, search, statusFilter, sort]);

  const submitted = named.filter((project) => SUBMITTED_STATUSES.includes(project.bidStatus));
  const won = named.filter((project) => project.bidStatus === "Won").length;
  const lost = named.filter((project) => project.bidStatus === "Lost").length;
  const decided = won + lost;
  const silent = named.filter((project) => project.bidStatus === "No Response").length;

  function open(projectId: string) {
    setActiveProjectId(projectId);
    router.push("/project-plan-desk");
  }

  function setStatus(projectId: string, status: BidStatus) {
    setActiveProjectId(projectId);
    updateActiveProject({ bidStatus: status });
    load();
  }

  function remove(project: ProjectRecord) {
    const sure = window.confirm(
      `Delete "${project.projectName}"? Its takeoff and estimate go with it.`
    );
    if (!sure) return;
    deleteProject(project.projectId);
    load();
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening bid log...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Bid/Job Log"
        subtitle="Every job you have bid. Won, lost, chasing, or still on the bench."
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <div className="flex gap-2">
              <Stat label="Bid" value={String(named.length)} />
              <Stat label="Submitted" value={String(submitted.length)} />
              <Stat
                label="Win rate"
                value={decided > 0 ? `${Math.round((won / decided) * 100)}%` : "-"}
                accent={decided > 0}
              />
            </div>
            <KorbanButton
              variant="primary"
              onClick={() => {
                createProject();
                router.push("/project-plan-desk");
              }}
            >
              + New project
            </KorbanButton>
          </>
        }
      />

      <div className="relative mx-auto w-full max-w-[1900px] px-4 py-4">
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
          {/* ---- Find it ------------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search project, customer, GC, address, proposal number"
              className="min-w-[260px] flex-1 rounded-lg border border-zinc-800 bg-korban-raised px-3 py-2 text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
            />
            <span className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                sort
              </span>
              {(
                [
                  { key: "recent", label: "Recent" },
                  { key: "name", label: "Name" },
                  { key: "customer", label: "Customer" },
                  { key: "due", label: "Due" },
                ] as { key: SortKey; label: string }[]
              ).map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSort(option.key)}
                  className={`font-mono text-[9.5px] uppercase tracking-[0.1em] transition ${
                    sort === option.key ? "text-orange-300" : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </span>
          </div>

          {/* ---- Legend doubles as the filter --------------------------- */}
          <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={() => setStatusFilter("All")}
                className={`flex items-center gap-2 font-mono text-[10px] transition ${
                  statusFilter === "All" ? "text-orange-300" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full border border-zinc-600" />
                All
                <span className="text-zinc-700">{named.length}</span>
              </button>
              {BID_STATUSES.map((status) => {
                const count = named.filter((project) => project.bidStatus === status).length;
                if (count === 0) return null;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(statusFilter === status ? "All" : status)}
                    className={`flex items-center gap-2 font-mono text-[10px] transition ${
                      statusFilter === status
                        ? "text-orange-300"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
                    {status}
                    <span className="text-zinc-700">{count}</span>
                  </button>
                );
              })}
              {silent > 0 && (
                <span className="ml-auto font-mono text-[9.5px] text-yellow-400/80">
                  {silent} waiting on a reply
                </span>
              )}
            </div>
          </section>

          {/* ---- The wall ------------------------------------------------ */}
          {rows.length === 0 ? (
            <section className="rounded-lg border border-zinc-800 bg-korban-base p-10 text-center">
              <p className="text-[13px] text-zinc-300">
                {named.length === 0 ? "The cabinet is empty." : "Nothing matches that."}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[11.5px] leading-[1.6] text-zinc-600">
                {named.length === 0
                  ? "Every bid you start lands here and stays, whether it is won, lost or never answered."
                  : "Try a different search, or clear the status filter."}
              </p>
              {named.length === 0 && (
                <button
                  onClick={() => {
                    createProject();
                    router.push("/project-plan-desk");
                  }}
                  className="mt-4 rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-bold text-black transition hover:bg-orange-400"
                >
                  + New project
                </button>
              )}
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {rows.map((project) => (
                <JobTile
                  key={project.projectId}
                  project={project}
                  onOpen={() => open(project.projectId)}
                  onStatus={(status) => setStatus(project.projectId, status)}
                  onRemove={() => remove(project)}
                />
              ))}
            </section>
          )}

          {decided === 0 && named.length > 0 && (
            <p className="font-mono text-[9.5px] leading-[1.6] text-zinc-700">
              Win rate stays blank until bids are marked Won or Lost. Set a status on any
              tile and the number fills in.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// One job
// -----------------------------------------------------------------------------

function JobTile({
  project, onOpen, onStatus, onRemove,
}: {
  project: ProjectRecord;
  onOpen: () => void;
  onStatus: (status: BidStatus) => void;
  onRemove: () => void;
}) {
  const elevation = getFirstElevation(project);
  const progress = getProjectProgress(project, elevation);
  const linearFeet = elevation?.linearFeet ?? 0;
  const frames = elevation?.quantityEngine?.frameCount ?? 0;

  // The bid total only exists for whichever project is active, so it shows
  // when it is real and stays blank rather than guessing at the rest.
  const bid = useMemo(() => {
    try {
      const state = loadEstimateState();
      const derived = state.derived;
      if (!derived) return 0;
      return Math.round(derived.rentalsRevenue + derived.laborCost);
    } catch {
      return 0;
    }
  }, []);

  const silent = project.bidStatus === "No Response";

  return (
    <div
      className={`group relative rounded-2xl border bg-korban-raised p-3 transition hover:bg-orange-500/[0.04] ${
        silent ? "korban-waiting" : ""
      } ${tileBorder(project.bidStatus)}`}
    >
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-white">{project.projectName}</p>
            <p className="mt-0.5 truncate text-[10.5px] text-zinc-500">
              {project.customer || "No customer"}
            </p>
          </div>
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[project.bidStatus]}`}
            title={project.bidStatus}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <MiniInfo label="Due" value={project.bidDueDate || "-"} />
          <MiniInfo label="Level" value={levelShort(project.estimateDepth)} />
          <MiniInfo label="LF" value={linearFeet > 0 ? linearFeet.toLocaleString() : "-"} />
          <MiniInfo label="FR" value={frames > 0 ? frames.toLocaleString() : "-"} />
        </div>

        <div className="mt-2.5 rounded-xl border border-orange-500/20 bg-orange-500/10 p-2">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-orange-300/70">
            Total
          </p>
          <p className="mt-0.5 truncate font-mono text-[17px] font-bold text-orange-400">
            {bid > 0 ? (
              bid.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })
            ) : (
              <span className="text-[13px] text-zinc-700">Not priced</span>
            )}
          </p>
        </div>
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-700">
          {project.unionStatus === "Non-Union" ? "NU" : project.unionStatus ? "U" : "-"}
          <span className="ml-1.5 text-zinc-800">|</span>
          <span className="ml-1.5">{progress}</span>
        </span>
        <select
          value={project.bidStatus}
          onChange={(event) => onStatus(event.target.value as BidStatus)}
          className="min-w-0 rounded border border-zinc-800 bg-black px-1 py-0.5 font-mono text-[9px] text-zinc-400 outline-none focus:border-orange-500/40"
        >
          {BID_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onRemove}
        className="absolute right-2 top-2 hidden font-mono text-[11px] text-zinc-700 transition hover:text-red-400 group-hover:block"
        aria-label={`Delete ${project.projectName}`}
      >
        &times;
      </button>
    </div>
  );
}

function levelShort(depth: string) {
  if (depth === "quick-bid") return "Quick";
  if (depth === "full-bid") return "Full";
  if (depth === "korban-bid") return "Korban";
  return "-";
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-waiting {
        0%, 100% { box-shadow: 0 0 0 rgba(234,179,8,0); }
        50% { box-shadow: 0 0 22px rgba(234,179,8,0.18); }
      }
      .korban-waiting { animation: korban-waiting 3.6s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .korban-waiting { animation: none; }
      }
    `}</style>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black p-1.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[10.5px] font-bold text-zinc-300">{value}</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-korban-raised px-3 py-1.5 text-right">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <p
        className={`font-mono text-[14px] font-bold leading-tight ${
          accent ? "text-orange-400" : "text-zinc-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
