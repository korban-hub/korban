"use client";

/**
 * Company inventory - what the yard owns, and what is already spoken for.
 *
 * Owned counts, costs and weights live in Backend under Stock Catalog. This
 * page reads them and shows what open projects have committed against them,
 * so an estimator can see whether the next bid is coverable before promising
 * a schedule.
 *
 * Nothing here is estimated. A part with no owned count says so; a project
 * with no takeoff commits nothing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getFirstElevation, listProjects, readLedger, type ProjectRecord } from "@/lib/projectStore";
import { getBackendSettings, type StockItem } from "@/lib/backendStore";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/inventory-load-list", label: "Project Load List" },
  { href: "/projects", label: "Bid Log" },
  { href: "/backend", label: "Backend" },
];

const CATEGORY_ORDER = [
  "Frames",
  "Planks",
  "Cross Braces",
  "Guardrails",
  "Base Plates",
  "Screw Jacks",
  "",
];

export default function InventoryPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [openCategory, setOpenCategory] = useState<string | null>("Frames");

  const load = useCallback(() => {
    try {
      setStock(getBackendSettings().material.stock);
      setProjects(listProjects().filter((project) => project.projectName.trim() !== ""));
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

  /**
   * What each part is committed to, project by project - read from each
   * project's ledger rather than inferred from its width.
   */
  const allocations = useMemo(() => {
    const map = new Map<string, { projectName: string; qty: number }[]>();
    projects.forEach((project) => {
      readLedger(getFirstElevation(project)).forEach((row) => {
        const list = map.get(row.partNo) ?? [];
        list.push({ projectName: project.projectName, qty: row.qty });
        map.set(row.partNo, list);
      });
    });
    return map;
  }, [projects]);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const items = stock
        .filter((item) => item.category === category)
        .map((item) => {
          const committedList = allocations.get(item.partNo) ?? [];
          const committed = committedList.reduce((sum, row) => sum + row.qty, 0);
          return { item, committed, committedList, available: item.owned - committed };
        });
      const owned = items.reduce((sum, row) => sum + row.item.owned, 0);
      const committed = items.reduce((sum, row) => sum + row.committed, 0);
      return {
        category: category || "Other",
        key: category,
        items,
        owned,
        committed,
        pressure: owned > 0 ? committed / owned : 0,
      };
    }).filter((group) => group.items.length > 0);
  }, [stock, allocations]);

  const totalOwned = grouped.reduce((sum, group) => sum + group.owned, 0);
  const totalValue = stock.reduce((sum, item) => sum + item.owned * item.purchaseCost, 0);
  const entered = stock.filter((item) => item.owned > 0).length;

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening inventory...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Company Inventory"
        subtitle="What the yard owns, and what open bids have already spoken for."
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <div className="rounded-lg border border-zinc-800 bg-korban-raised px-3.5 py-1.5 text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Pieces owned</p>
              <p className="font-mono text-[14px] font-bold leading-tight text-zinc-200">
                {totalOwned.toLocaleString()}
              </p>
            </div>
            <KorbanButton variant="ghost" onClick={() => router.push("/backend")}>
              Edit stock
            </KorbanButton>
            <KorbanButton variant="primary" onClick={() => router.push("/dashboard")}>
              Bid Room
            </KorbanButton>
          </>
        }
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        {entered === 0 && (
          <div className="relative mb-3 rounded-lg border border-orange-500/30 bg-orange-500/[0.06] px-4 py-3">
            <p className="text-[12px] font-semibold text-orange-200">
              The yard is empty because nobody has told KORBAN what is in it.
            </p>
            <p className="mt-1 max-w-2xl text-[11px] leading-[1.6] text-zinc-400">
              Enter owned counts, purchase costs and weights under Backend, Stock Catalog.
              Once they are in, this page shows what every open bid commits and flags a
              category before it runs short.
            </p>
            <button
              onClick={() => router.push("/backend")}
              className="mt-2 rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-bold text-black transition hover:bg-orange-400"
            >
              Set up the yard
            </button>
          </div>
        )}

        <div className="relative grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Panel
            title="Stock by category"
            right={
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                {grouped.length} categories
              </span>
            }
          >
            <div className="grid gap-1">
              {grouped.map((group) => {
                const open = openCategory === group.key;
                return (
                  <div key={group.category} className="border-b border-zinc-900/70 last:border-0">
                    <button
                      onClick={() => setOpenCategory(open ? null : group.key)}
                      className="w-full py-1.5 text-left"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-zinc-600">
                            {open ? "\u2212" : "+"}
                          </span>
                          <span className="text-[11.5px] font-semibold text-zinc-200">
                            {group.category}
                          </span>
                          <span className="font-mono text-[9px] text-zinc-700">
                            {group.items.length} parts
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          <span className="font-bold text-zinc-200">
                            {group.owned.toLocaleString()}
                          </span>
                          <span className="mx-1 text-zinc-700">owned</span>
                          <span
                            className={group.committed > 0 ? "text-orange-300" : "text-zinc-700"}
                          >
                            {group.committed.toLocaleString()}
                          </span>
                          <span className="ml-1 text-zinc-700">out</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-900">
                        <div
                          className={`h-full transition-[width] duration-500 ${
                            group.pressure > 0.85
                              ? "bg-red-500"
                              : group.pressure > 0.6
                              ? "bg-amber-500"
                              : "bg-orange-500"
                          }`}
                          style={{ width: `${Math.min(100, group.pressure * 100)}%` }}
                        />
                      </div>
                    </button>

                    {open && (
                      <div className="mb-1.5 rounded border border-zinc-900 bg-black p-2">
                        <div className="grid grid-cols-[68px_1fr_64px_64px_64px] gap-2 px-1 pb-1">
                          {["Part", "Description", "Owned", "Out", "Free"].map((heading) => (
                            <span
                              key={heading}
                              className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600"
                            >
                              {heading}
                            </span>
                          ))}
                        </div>
                        {group.items.map(({ item, committed, committedList, available }) => (
                          <div key={item.id}>
                            <div
                              className={`grid grid-cols-[68px_1fr_64px_64px_64px] items-center gap-2 border-t border-zinc-900/70 px-1 py-1 ${
                                item.owned > 0 ? "" : "opacity-40"
                              }`}
                            >
                              <span className="font-mono text-[10px] font-bold text-orange-400">
                                {item.partNo || "-"}
                              </span>
                              <span className="truncate text-[10.5px] text-zinc-400">
                                {item.description}
                              </span>
                              <span className="text-right font-mono text-[11px] font-bold text-zinc-200">
                                {item.owned > 0 ? (
                                  item.owned.toLocaleString()
                                ) : (
                                  <span className="text-zinc-700">-</span>
                                )}
                              </span>
                              <span className="text-right font-mono text-[11px] text-orange-300">
                                {committed > 0 ? (
                                  committed.toLocaleString()
                                ) : (
                                  <span className="text-zinc-700">-</span>
                                )}
                              </span>
                              <span
                                className={`text-right font-mono text-[11px] font-bold ${
                                  available < 0 ? "text-red-400" : "text-zinc-300"
                                }`}
                              >
                                {item.owned > 0 ? (
                                  available.toLocaleString()
                                ) : (
                                  <span className="text-zinc-700">-</span>
                                )}
                              </span>
                            </div>
                            {committedList.length > 0 && (
                              <div className="px-1 pb-1 pl-[76px]">
                                {committedList.map((row) => (
                                  <span
                                    key={row.projectName}
                                    className="mr-3 font-mono text-[9px] text-zinc-600"
                                  >
                                    {row.projectName}
                                    <span className="ml-1 text-orange-400/60">
                                      {row.qty.toLocaleString()}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="grid items-start gap-3">
            <Panel title="Yard summary" scan={false}>
              <Figure label="Pieces owned" value={totalOwned.toLocaleString()} />
              <Figure
                label="Replacement value"
                value={
                  totalValue > 0
                    ? totalValue.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })
                    : "-"
                }
              />
              <Figure label="Parts entered" value={`${entered} of ${stock.length}`} />
              <Figure label="Projects committing" value={String(projects.length)} />
            </Panel>

            <Panel title="Committed by project" scan={false}>
              {projects.length === 0 ? (
                <p className="text-[10.5px] leading-[1.6] text-zinc-600">
                  No projects yet. Once a bid has a takeoff, its material shows here
                  against the yard.
                </p>
              ) : (
                <div className="grid gap-1">
                  {projects.map((project) => {
                    const pieces = readLedger(getFirstElevation(project)).reduce(
                      (sum, row) => sum + row.qty,
                      0
                    );
                    return (
                      <div
                        key={project.projectId}
                        className="flex items-baseline justify-between gap-3 border-b border-zinc-900/70 py-1 last:border-0"
                      >
                        <span className="min-w-0 truncate text-[10.5px] text-zinc-400">
                          {project.projectName}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] font-bold text-zinc-300">
                          {pieces > 0 ? (
                            pieces.toLocaleString()
                          ) : (
                            <span className="text-zinc-700">no parts yet</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan { animation: none; opacity: 0; }
      }
    `}</style>
  );
}

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-900/70 py-1.5 last:border-0">
      <span className="text-[10.5px] text-zinc-500">{label}</span>
      <span className="font-mono text-[13px] font-bold text-orange-300">{value}</span>
    </div>
  );
}
