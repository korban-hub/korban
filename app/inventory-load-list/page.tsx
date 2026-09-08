"use client";

/**
 * Material Load List - the sheet that goes to the yard.
 *
 * Modelled on the paper form crews already use: job header across the top,
 * the full catalog in three columns, and Ordered / Shipped / Received against
 * every line. The takeoff fills Ordered; the yard fills the rest.
 *
 * Keeping the layout the crew recognises matters more than making it pretty.
 * A loader should be able to work from this screen, or a printout of it,
 * without learning anything new.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getActiveElevation, getActiveProject } from "@/lib/projectStore";
import { getBackendSettings, type StockItem } from "@/lib/backendStore";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/set-scaffold-v2", label: "Set Scaffold" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/inventory", label: "Company Inventory" },
];

/**
 * Which engine count fills which line. Frame and plank part numbers depend on
 * the scaffold width chosen in Set Scaffold, so those resolve at read time
 * rather than being fixed here.
 */
const FIXED_SOURCE: Record<string, string> = {
  B82: "crossBraceCount",
  GR8: "guardrailCount",
  BP1: "basePlateCount",
  AL1S: "screwJackCount",
  CPS: "couplingPinCount",
};

type LoadKind = "New Build" | "Add On" | "Return" | "Net Rental";
const LOAD_KINDS: LoadKind[] = ["New Build", "Add On", "Return", "Net Rental"];

const LOAD_KEY = "korban.loadlist.v1";

type LoadHeader = {
  truckNo: string;
  kind: LoadKind;
  dateOrdered: string;
  dateShipped: string;
  dateReturned: string;
  completedBy: string;
  loaders: string;
  notes: string;
};

const EMPTY_HEADER: LoadHeader = {
  truckNo: "",
  kind: "New Build",
  dateOrdered: "",
  dateShipped: "",
  dateReturned: "",
  completedBy: "",
  loaders: "",
  notes: "",
};

/** Yard-entered counts, keyed by stock id. Ordered comes from the takeoff. */
type Counts = Record<string, { ship?: number; recd?: number }>;

export default function LoadListPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [project, setProject] = useState({
    name: "", jobNo: "", address: "", customer: "", contact: "",
  });
  const [stock, setStock] = useState<StockItem[]>([]);
  const [engine, setEngine] = useState<Record<string, number>>({});
  const [scaffoldWidth, setScaffoldWidth] = useState(3);
  const [header, setHeader] = useState<LoadHeader>(EMPTY_HEADER);
  const [counts, setCounts] = useState<Counts>({});

  const load = useCallback(() => {
    try {
      const active = getActiveProject();
      const elevation = getActiveElevation();
      setProject({
        name: active.projectName,
        jobNo: active.proposalNumber || active.projectId,
        address: active.projectAddress,
        customer: active.customer,
        contact: active.contactName,
      });
      setEngine((elevation.quantityEngine ?? {}) as unknown as Record<string, number>);
      setScaffoldWidth(elevation.scaffoldInput?.scaffoldWidth ?? 3);
      setStock(getBackendSettings().material.stock);

      const raw = window.localStorage.getItem(`${LOAD_KEY}:${active.projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { header?: LoadHeader; counts?: Counts };
        setHeader({ ...EMPTY_HEADER, ...(parsed.header ?? {}) });
        setCounts(parsed.counts ?? {});
      } else {
        setHeader(EMPTY_HEADER);
        setCounts({});
      }
    } catch {
      // Storage unavailable - the sheet still renders, it just won't persist.
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  function persist(nextHeader: LoadHeader, nextCounts: Counts) {
    try {
      const id = getActiveProject().projectId;
      window.localStorage.setItem(
        `${LOAD_KEY}:${id}`,
        JSON.stringify({ header: nextHeader, counts: nextCounts })
      );
    } catch {
      // Not being able to persist a load sheet is not worth an error.
    }
  }

  function setField(patch: Partial<LoadHeader>) {
    const next = { ...header, ...patch };
    setHeader(next);
    persist(next, counts);
  }

  function setCount(id: string, field: "ship" | "recd", value: number) {
    const next = { ...counts, [id]: { ...counts[id], [field]: value } };
    setCounts(next);
    persist(header, next);
  }

  /** The frame part number this job actually uses, by scaffold width. */
  const dynamicSource = useMemo(() => {
    const framePart = scaffoldWidth >= 5 ? "FO6L" : scaffoldWidth >= 3.5 ? "FO6L42" : "FO6L3";
    return { [framePart]: "frameCount", WP10: "plankCount" } as Record<string, string>;
  }, [scaffoldWidth]);

  const ordered = useCallback(
    (item: StockItem) => {
      if (!item.partNo) return 0;
      const key = FIXED_SOURCE[item.partNo] ?? dynamicSource[item.partNo];
      return key ? engine[key] ?? 0 : 0;
    },
    [engine, dynamicSource]
  );

  const columns = useMemo(
    () => [1, 2, 3].map((column) => stock.filter((item) => item.column === column)),
    [stock]
  );

  const totals = useMemo(() => {
    const ord = stock.reduce((sum, item) => sum + ordered(item), 0);
    const ship = stock.reduce((sum, item) => sum + (counts[item.id]?.ship ?? 0), 0);
    const weight = stock.reduce((sum, item) => sum + ordered(item) * item.weightLbs, 0);
    return { ord, ship, weight };
  }, [stock, counts, ordered]);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening load list...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Material Load List"
        subtitle={project.name || "No project loaded"}
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <div className="flex gap-2">
              <Stat label="Ordered" value={totals.ord.toLocaleString()} accent />
              <Stat label="Shipped" value={totals.ship > 0 ? totals.ship.toLocaleString() : "-"} />
              <Stat
                label="Weight"
                value={totals.weight > 0 ? `${Math.round(totals.weight).toLocaleString()} lb` : "-"}
              />
            </div>
            <KorbanButton variant="ghost" onClick={() => window.print()}>
              Print / PDF
            </KorbanButton>
            <KorbanButton variant="primary" onClick={() => router.push("/project-plan-desk")}>
              Plan Desk
            </KorbanButton>
          </>
        }
      />

      <div id="korban-loadsheet" className="relative mx-auto w-full max-w-[1600px] px-4 py-4">
        <div
          aria-hidden
          className="korban-no-print pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative space-y-3">
          {/* ---- Job header, as it prints ------------------------------- */}
          <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
            <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
            <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="grid gap-0.5">
                <ReadRow label="Customer" value={project.customer} />
                <ReadRow label="Jobsite" value={project.address} />
                <div className="grid grid-cols-2 gap-3">
                  <ReadRow label="Job number" value={project.jobNo} mono />
                  <ReadRow label="Contact" value={project.contact} />
                </div>
                <EditRow
                  label="Truck no."
                  value={header.truckNo}
                  placeholder="Which truck"
                  onChange={(v) => setField({ truckNo: v })}
                />
              </div>

              <div className="grid gap-2">
                <div>
                  <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                    Load type
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {LOAD_KINDS.map((kind) => (
                      <button
                        key={kind}
                        onClick={() => setField({ kind })}
                        className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition ${
                          header.kind === kind
                            ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                            : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                        }`}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <DateRow
                    label="Ordered"
                    value={header.dateOrdered}
                    onChange={(v) => setField({ dateOrdered: v })}
                  />
                  <DateRow
                    label="Shipped"
                    value={header.dateShipped}
                    onChange={(v) => setField({ dateShipped: v })}
                  />
                  <DateRow
                    label="Returned"
                    value={header.dateReturned}
                    onChange={(v) => setField({ dateReturned: v })}
                  />
                </div>

                <EditRow
                  label="Completed by"
                  value={header.completedBy}
                  placeholder="Who signed it off"
                  onChange={(v) => setField({ completedBy: v })}
                />
              </div>
            </div>
          </section>

          {/* ---- The list, three columns as it prints ------------------- */}
          <div className="grid gap-3 xl:grid-cols-3">
            {columns.map((items, index) => (
              <section
                key={index}
                className="relative rounded-lg border border-zinc-800 bg-korban-base p-2.5"
              >
                <div className="grid grid-cols-[60px_1fr_36px_38px_38px] gap-1.5 px-1 pb-1.5">
                  {["Part", "Description", "Ord", "Ship", "Rec"].map((heading) => (
                    <span
                      key={heading}
                      className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-zinc-600"
                    >
                      {heading}
                    </span>
                  ))}
                </div>

                <div className="rounded border border-zinc-900 bg-black p-1.5">
                  {items.map((item) => {
                    const ord = ordered(item);
                    const active = ord > 0;
                    return (
                      <div
                        key={item.id}
                        className={`grid grid-cols-[60px_1fr_36px_38px_38px] items-center gap-1.5 border-b border-zinc-900/60 px-1 py-[3px] last:border-0 ${
                          active ? "bg-orange-500/[0.07]" : ""
                        }`}
                      >
                        <span
                          className={`font-mono text-[9.5px] font-bold ${
                            item.partNo ? "text-orange-400" : "text-zinc-800"
                          }`}
                        >
                          {item.partNo || "-"}
                        </span>
                        <span
                          className={`truncate text-[9.5px] uppercase ${
                            active ? "text-orange-100" : "text-zinc-500"
                          }`}
                          title={item.description}
                        >
                          {item.description}
                        </span>
                        <span
                          className={`korban-ordered text-right font-mono text-[10px] ${
                            active ? "font-bold text-orange-300" : "text-zinc-800"
                          }`}
                        >
                          {ord > 0 ? ord.toLocaleString() : ""}
                        </span>
                        <CountCell
                          value={counts[item.id]?.ship}
                          onChange={(v) => setCount(item.id, "ship", v)}
                        />
                        <CountCell
                          value={counts[item.id]?.recd}
                          onChange={(v) => setCount(item.id, "recd", v)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* ---- Notes and loaders, as it prints ------------------------ */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
              <h2 className="pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Notes
              </h2>
              <textarea
                value={header.notes}
                onChange={(event) => setField({ notes: event.target.value })}
                placeholder="Anything the yard needs to know about this load"
                className="min-h-20 w-full resize-none rounded border border-zinc-900 bg-black p-2.5 text-[11px] leading-[1.6] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
              />
            </section>

            <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
              <h2 className="pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Loaders
              </h2>
              <textarea
                value={header.loaders}
                onChange={(event) => setField({ loaders: event.target.value })}
                placeholder="Print names"
                className="min-h-20 w-full resize-none rounded border border-zinc-900 bg-black p-2.5 text-[11px] leading-[1.6] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
              />
            </section>
          </div>

          {totals.ord === 0 && (
            <p className="font-mono text-[10px] leading-[1.6] text-zinc-700">
              Nothing ordered yet. Quantities fill in from the takeoff - this sheet never
              estimates ahead of the measurement.
            </p>
          )}
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

      /*
       * Printing. This sheet exists to leave the building - a loader works
       * from it on a clipboard. Portrait, three columns across, white ground
       * and black type - the way the paper form always was. Ship and Rec boxes
       * come out empty so they can be filled in by hand.
       */
      @media print {
        @page { size: letter portrait; margin: 0.35in; }

        body { background: #fff !important; color: #000 !important; }
        .korban-no-print { display: none !important; }

        #korban-loadsheet, #korban-loadsheet * {
          background: transparent !important;
          color: #000 !important;
          border-color: #999 !important;
          box-shadow: none !important;
        }
        #korban-loadsheet {
          position: absolute !important;
          left: 0; top: 0;
          width: 100% !important;
          padding: 0 !important;
          font-size: 8px;
        }
        /* The three columns are the whole point of the form - keep them. */
        #korban-loadsheet .xl\\:grid-cols-3 {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 0.12in !important;
        }
        /* A quantity the takeoff produced still needs to stand out on paper. */
        .korban-ordered { font-weight: 700 !important; }
        /* Empty boxes for the yard to write in. */
        #korban-loadsheet input, #korban-loadsheet textarea {
          border: 1px solid #999 !important;
          min-height: 1.1em;
        }
      }
    `}</style>
  );
}

/** A quantity the yard fills in. Blank until someone counts it. */
function CountCell({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <input
      value={value ?? ""}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      type="number"
      className="w-full min-w-0 rounded border border-zinc-900 bg-korban-raised px-1 py-[1px] text-right font-mono text-[10px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
    />
  );
}

/**
 * Month, day and year as three boxes. A single field invites every format
 * under the sun; three boxes only accept one, and the sheet has to read the
 * same to whoever picks it up in the yard.
 */
function DateRow({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [month = "", day = "", year = ""] = (value || "").split("/");

  function set(part: "m" | "d" | "y", next: string) {
    const clean = next.replace(/[^0-9]/g, "");
    const parts = [month, day, year];
    parts[part === "m" ? 0 : part === "d" ? 1 : 2] = clean;
    // An entirely empty date stays empty rather than becoming "//".
    onChange(parts.every((entry) => entry === "") ? "" : parts.join("/"));
  }

  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <span className="flex items-center gap-1">
        <DateBox value={month} placeholder="MM" max={2} onChange={(v) => set("m", v)} />
        <span className="font-mono text-[11px] text-zinc-700">/</span>
        <DateBox value={day} placeholder="DD" max={2} onChange={(v) => set("d", v)} />
        <span className="font-mono text-[11px] text-zinc-700">/</span>
        <DateBox value={year} placeholder="YYYY" max={4} wide onChange={(v) => set("y", v)} />
      </span>
    </div>
  );
}

function DateBox({
  value, placeholder, max, wide, onChange,
}: {
  value: string;
  placeholder: string;
  max: number;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value.slice(0, max))}
      placeholder={placeholder}
      inputMode="numeric"
      className={`rounded border border-zinc-900 bg-korban-raised px-1.5 py-1 text-center font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40 ${
        wide ? "w-14" : "w-10"
      }`}
    />
  );
}

function ReadRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 border-b border-zinc-900/60 py-1 last:border-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <span className={`truncate text-[11.5px] ${mono ? "font-mono text-orange-300" : "text-zinc-300"}`}>
        {value || <span className="text-zinc-700">Not set</span>}
      </span>
    </div>
  );
}

function EditRow({
  label, value, placeholder, stacked, onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  stacked?: boolean;
  onChange: (value: string) => void;
}) {
  if (stacked) {
    return (
      <div>
        <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
          {label}
        </span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-zinc-900 bg-korban-raised px-2 py-1 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
        />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 border-b border-zinc-900/60 py-1 last:border-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-[11.5px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-orange-500/40 focus:bg-korban-raised"
      />
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
