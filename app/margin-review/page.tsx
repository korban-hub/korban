"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KorbanHeader,
  KorbanManagementShell,
  type KorbanMenuLink,
} from "@/components/korban";
import { getActiveProject } from "@/lib/projectStore";
import {
  PRODUCTION_TYPES,
  loadEstimateState,
  saveEstimateState,
  type EstimateDerived,
  type ProductionKey,
} from "@/lib/estimateState";

const marginMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/takeoff-workspace", label: "Takeoff Workspace" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

const HOURS_PER_DAY = 8;

export default function MarginReviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [derived, setDerived] = useState<EstimateDerived | null>(null);
  const [productionKey, setProductionKey] = useState<ProductionKey>("conventional");

  const [laborMarkupPercent, setLaborMarkupPercent] = useState(35);
  const [rentalsDirectCostPercent, setRentalsDirectCostPercent] = useState(40);
  const [miscRevenue, setMiscRevenue] = useState(0);
  const [miscCost, setMiscCost] = useState(0);

  useEffect(() => {
    function load() {
      const project = getActiveProject();
      const saved = loadEstimateState();

      setProjectName(project.projectName || "Untitled project");
      setDerived(saved.derived);
      setProductionKey(saved.productionKey);
      setLaborMarkupPercent(saved.laborMarkupPercent);
      setRentalsDirectCostPercent(saved.rentalsDirectCostPercent);
      setMiscRevenue(saved.miscRevenue);
      setMiscCost(saved.miscCost);
      setIsHydrated(true);
    }

    const delay = window.setTimeout(load, 200);
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);

    return () => {
      window.clearTimeout(delay);
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveEstimateState({
      laborMarkupPercent,
      rentalsDirectCostPercent,
      miscRevenue,
      miscCost,
    });
  }, [isHydrated, laborMarkupPercent, miscCost, miscRevenue, rentalsDirectCostPercent]);

  const production = PRODUCTION_TYPES.find((type) => type.key === productionKey) ?? PRODUCTION_TYPES[1];

  const model = useMemo(() => {
    const rentalsRevenue = derived?.rentalsRevenue ?? 0;
    const laborCost = derived?.laborCost ?? 0;
    const erectHours = derived?.erectHours ?? 0;
    const dismantleHours = derived?.dismantleHours ?? 0;
    const travelHours = derived?.travelHours ?? 0;
    const totalHours = erectHours + dismantleHours + travelHours;
    const pieces = derived?.totalPieces ?? 0;

    const rentalsDirectCost = rentalsRevenue * (rentalsDirectCostPercent / 100);
    const laborRevenue = laborCost * (1 + laborMarkupPercent / 100);

    const streams = [
      { key: "rentals", label: "Rentals", revenue: rentalsRevenue, cost: rentalsDirectCost },
      { key: "labor", label: "Labor", revenue: laborRevenue, cost: laborCost },
      { key: "misc", label: "Misc", revenue: miscRevenue, cost: miscCost },
    ].map((stream) => {
      const grossProfit = stream.revenue - stream.cost;
      return {
        ...stream,
        grossProfit,
        gpPercent: stream.revenue > 0 ? (grossProfit / stream.revenue) * 100 : 0,
      };
    });

    const totalRevenue = streams.reduce((sum, stream) => sum + stream.revenue, 0);
    const totalCost = streams.reduce((sum, stream) => sum + stream.cost, 0);
    const totalGrossProfit = totalRevenue - totalCost;

    return {
      streams,
      totalRevenue,
      totalCost,
      totalGrossProfit,
      totalGpPercent: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
      erectHours,
      dismantleHours,
      travelHours,
      totalHours,
      pieces,
      piecesPerHourUp: erectHours > 0 ? pieces / erectHours : 0,
      piecesPerHourDown: dismantleHours > 0 ? pieces / dismantleHours : 0,
      blendedLaborRate: totalHours > 0 ? laborCost / totalHours : 0,
      rentalShareOfLabor: laborCost > 0 ? (rentalsRevenue / laborCost) * 100 : 0,
      monthThereafter:
        derived && derived.rentalsRevenue > 0 && derived.consumablesRevenue >= 0
          ? derived.rentalsRevenue - derived.consumablesRevenue
          : 0,
      laborCost,
    };
  }, [derived, laborMarkupPercent, miscCost, miscRevenue, rentalsDirectCostPercent]);

  if (!isHydrated) {
    return <main className="min-h-screen bg-korban-base text-white" />;
  }

  return (
    <KorbanManagementShell
      header={
        <KorbanHeader
          title="Margin Review"
          subtitle={projectName}
          menuLinks={marginMenuLinks}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((current) => !current)}
          actionsClassName="gap-3"
          actions={
            <>
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.07] px-4 py-2 text-right">
                <p className="text-[10px] tracking-[0.16em] text-zinc-500">Gross profit</p>
                <p className="font-mono text-lg font-bold leading-tight text-orange-400">
                  {formatMoney(model.totalGrossProfit)}
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {model.totalGpPercent.toFixed(1)}%
                  </span>
                </p>
              </div>
              <a
                href="/estimate-review"
                className="rounded-xl border border-zinc-700 bg-zinc-400/[0.06] px-4 py-2.5 text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-400/[0.1]"
              >
                ↩ Estimate Review
              </a>
            </>
          }
        />
      }
      bodyClassName="p-4"
    >
      {!derived && <NoEstimateNotice />}

      <FinancialsGrid model={model} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,0.8fr)]">
        <Productivity model={model} productionTitle={production.title} />
        <Ratios model={model} />
        <Assumptions
          laborMarkupPercent={laborMarkupPercent}
          setLaborMarkupPercent={setLaborMarkupPercent}
          rentalsDirectCostPercent={rentalsDirectCostPercent}
          setRentalsDirectCostPercent={setRentalsDirectCostPercent}
          miscRevenue={miscRevenue}
          setMiscRevenue={setMiscRevenue}
          miscCost={miscCost}
          setMiscCost={setMiscCost}
        />
      </div>

      <ActualVsProjected />
    </KorbanManagementShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Model = {
  streams: { key: string; label: string; revenue: number; cost: number; grossProfit: number; gpPercent: number }[];
  totalRevenue: number;
  totalCost: number;
  totalGrossProfit: number;
  totalGpPercent: number;
  erectHours: number;
  dismantleHours: number;
  travelHours: number;
  totalHours: number;
  pieces: number;
  piecesPerHourUp: number;
  piecesPerHourDown: number;
  blendedLaborRate: number;
  rentalShareOfLabor: number;
  monthThereafter: number;
  laborCost: number;
};

function NoEstimateNotice() {
  return (
    <div className="mb-4 rounded-2xl border border-zinc-700 bg-zinc-400/[0.06] px-4 py-3">
      <p className="text-[12px] text-zinc-300">
        No estimate figures yet. Open Estimate Review and set the rental, labor and production
        numbers — this page reads from there.
      </p>
    </div>
  );
}

function FinancialsGrid({ model }: { model: Model }) {
  const columns = model.streams;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Financials</h2>
        <p className="text-[10px] text-zinc-600">Margin per revenue stream, not one blended number.</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="w-40 border-b border-zinc-800 pb-2 text-left text-[10px] font-normal tracking-[0.1em] text-zinc-600" />
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b border-zinc-800 pb-2 text-right text-[11px] font-bold text-zinc-400"
                >
                  {column.label}
                </th>
              ))}
              <th className="border-b border-zinc-800 pb-2 text-right text-[11px] font-bold text-zinc-200">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <GridRow
              label="Revenues"
              values={columns.map((column) => column.revenue)}
              total={model.totalRevenue}
            />
            <GridRow
              label="Direct costs"
              values={columns.map((column) => column.cost)}
              total={model.totalCost}
              muted
            />
            <GridRow
              label="Gross profit"
              values={columns.map((column) => column.grossProfit)}
              total={model.totalGrossProfit}
              emphasis
            />
            <tr>
              <td className="py-2.5 text-[11px] text-zinc-500">GP %</td>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-2.5 text-right font-mono text-[12px] font-bold ${percentTone(column.gpPercent)}`}
                >
                  {column.gpPercent.toFixed(1)}%
                </td>
              ))}
              <td className={`py-2.5 text-right font-mono text-[13px] font-bold ${percentTone(model.totalGpPercent)}`}>
                {model.totalGpPercent.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GridRow({
  label,
  values,
  total,
  muted,
  emphasis,
}: {
  label: string;
  values: number[];
  total: number;
  muted?: boolean;
  emphasis?: boolean;
}) {
  const cellTone = muted ? "text-zinc-600" : emphasis ? "text-zinc-100" : "text-zinc-300";
  return (
    <tr className={emphasis ? "border-t border-zinc-800" : ""}>
      <td className={`py-2.5 text-[11px] ${emphasis ? "font-bold text-zinc-200" : "text-zinc-500"}`}>
        {label}
      </td>
      {values.map((value, index) => (
        <td key={index} className={`py-2.5 text-right font-mono text-[12px] ${cellTone}`}>
          {formatMoney(value)}
        </td>
      ))}
      <td
        className={`py-2.5 text-right font-mono font-bold ${
          emphasis ? "text-[15px] text-orange-400" : `text-[12px] ${cellTone}`
        }`}
      >
        {formatMoney(total)}
      </td>
    </tr>
  );
}

function Productivity({ model, productionTitle }: { model: Model; productionTitle: string }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <h2 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Productivity</h2>
      <p className="mt-1 font-mono text-[10px] text-zinc-600">
        Implied by {productionTitle} · {model.pieces.toLocaleString()} pieces over{" "}
        {model.totalHours.toLocaleString()} hrs
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3">
          <p className="text-[10px] text-zinc-600">Up</p>
          <p className="mt-1 font-mono text-[22px] font-bold leading-none text-orange-400">
            {model.piecesPerHourUp.toFixed(1)}
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-zinc-600">
            pieces / man-hr · {model.erectHours.toLocaleString()} hrs
          </p>
        </div>
        <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3">
          <p className="text-[10px] text-zinc-600">Down</p>
          <p className="mt-1 font-mono text-[22px] font-bold leading-none text-orange-400">
            {model.piecesPerHourDown.toFixed(1)}
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-zinc-600">
            pieces / man-hr · {model.dismantleHours.toLocaleString()} hrs
          </p>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-zinc-600">
        The production type already carries its own target, so these figures are read as what the
        selected type implies rather than measured against a separate standard.
      </p>
    </section>
  );
}

function Ratios({ model }: { model: Model }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <h2 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Ratios</h2>
      <div className="mt-4 space-y-1.5">
        <RatioRow
          label="Rental as % of labor cost"
          value={`${model.rentalShareOfLabor.toFixed(0)}%`}
          detail={`${formatMoney(model.streams[0]?.revenue ?? 0)} rental · ${formatMoney(model.laborCost)} labor`}
        />
        <RatioRow
          label="Blended labor rate"
          value={`${formatMoney(model.blendedLaborRate)}/hr`}
          detail={`${model.totalHours.toLocaleString()} hrs total`}
        />
        <RatioRow
          label="Month thereafter"
          value={formatMoney(model.monthThereafter)}
          detail="Rental only, consumables excluded"
        />
        <RatioRow
          label="Travel share of hours"
          value={`${model.totalHours > 0 ? ((model.travelHours / model.totalHours) * 100).toFixed(1) : "0.0"}%`}
          detail={`${model.travelHours.toLocaleString()} of ${model.totalHours.toLocaleString()} hrs`}
        />
      </div>
    </section>
  );
}

function RatioRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="font-mono text-[13px] font-bold text-zinc-200">{value}</span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-zinc-600">{detail}</p>
    </div>
  );
}

function Assumptions({
  laborMarkupPercent, setLaborMarkupPercent,
  rentalsDirectCostPercent, setRentalsDirectCostPercent,
  miscRevenue, setMiscRevenue, miscCost, setMiscCost,
}: {
  laborMarkupPercent: number;
  setLaborMarkupPercent: (value: number) => void;
  rentalsDirectCostPercent: number;
  setRentalsDirectCostPercent: (value: number) => void;
  miscRevenue: number;
  setMiscRevenue: (value: number) => void;
  miscCost: number;
  setMiscCost: (value: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <h2 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Assumptions</h2>
      <p className="mt-1 text-[10px] text-zinc-600">These drive the grid above.</p>

      <div className="mt-4 space-y-1.5">
        <NumberField
          label="Labor markup"
          value={laborMarkupPercent}
          onChange={setLaborMarkupPercent}
          suffix="%"
        />
        <NumberField
          label="Rentals direct cost"
          value={rentalsDirectCostPercent}
          onChange={setRentalsDirectCostPercent}
          suffix="% of rental revenue"
        />
        <NumberField label="Misc revenue" value={miscRevenue} onChange={setMiscRevenue} prefix="$" />
        <NumberField label="Misc cost" value={miscCost} onChange={setMiscCost} prefix="$" />
      </div>

      <p className="mt-3 text-[10px] leading-4 text-zinc-600">
        Rentals direct cost is a placeholder basis until yard cost per piece is wired in from
        Backend.
      </p>
    </section>
  );
}

function NumberField({
  label, value, onChange, prefix, suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="font-mono text-[10px] text-zinc-600">{prefix}</span>}
        <input
          value={value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value || 0)))}
          type="number"
          className="w-24 rounded-md border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
        />
        {suffix && <span className="text-[10px] text-zinc-600">{suffix}</span>}
      </div>
    </div>
  );
}

function ActualVsProjected() {
  return (
    <section className="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-black px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xs font-bold tracking-[0.18em] text-zinc-500">Actual vs projected</h2>
        <p className="text-[10px] text-zinc-600">Not connected — fills in once jobs are live.</p>
      </div>
      <p className="mt-2 max-w-2xl text-[11px] leading-5 text-zinc-600">
        Once a job is running, actual hours and material returns land here beside the projection
        above, and this page becomes job-cost tracking rather than a bid check.
      </p>
    </section>
  );
}

function percentTone(percent: number) {
  if (percent >= 30) return "text-orange-400";
  if (percent >= 15) return "text-zinc-200";
  return "text-red-400";
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
