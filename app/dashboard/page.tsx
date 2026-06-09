"use client";

import { useMemo, useState } from "react";

type BidStatus = "Won" | "Lost" | "Still Chasing" | "No Response" | "Not Sent";
type Timeframe = "This Day" | "This Week" | "This Month" | "This Year";
type BidStage =
  | "Budget / ROM"
  | "Design Development"
  | "50% CD"
  | "75% CD"
  | "100% CD"
  | "GMP"
  | "Final Round"
  | "Awarded";

type BidRound = {
  label: string;
  date: string;
  value: number | null;
};

const timeframeOptions: Timeframe[] = ["This Day", "This Week", "This Month", "This Year"];

const bidStages: BidStage[] = [
  "Budget / ROM",
  "Design Development",
  "50% CD",
  "75% CD",
  "100% CD",
  "GMP",
  "Final Round",
  "Awarded",
];

const roundLabels = ["ROM", "50%", "75%", "100%", "GMP", "Final"];

function makeRounds(
  baseValue: number,
  startMonth: string,
  dayStart: number,
  startIndex = 0,
  emptyAll = false
): BidRound[] {
  const multipliers = [1, 1.035, 1.018, 1.056, 1.032, 1.071, 1.046];

  return roundLabels.map((label, index) => ({
    label,
    date: `${startMonth}/${String(dayStart + index * 3).padStart(2, "0")}/26`,
    value: emptyAll || index < startIndex ? null : Math.round(baseValue * multipliers[index]),
  }));
}

const bidPipeline: {
  project: string;
  gc: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  bidDate: string;
  sentDate: string;
  status: BidStatus;
  union: "Union" | "Non-Union";
  value: number | null;
  stage: BidStage;
  timeframe: Timeframe[];
  rounds: BidRound[];
}[] = [
  {
    project: "Mare Island Apartments",
    gc: "Turner Construction",
    contactEmail: "estimating@turner.com",
    contactName: "Marcus Lee",
    contactPhone: "(510) 555-0138",
    bidDate: "06/14/26",
    sentDate: "06/12/26",
    status: "Still Chasing",
    union: "Union",
    value: 184000,
    stage: "Final Round",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(171000, "05", 13, 1),
  },
  {
    project: "Napa Retail Shell",
    gc: "Swinerton",
    contactEmail: "biddesk@swinerton.com",
    contactName: "Sarah Grant",
    contactPhone: "(707) 555-0184",
    bidDate: "06/18/26",
    sentDate: "Pending",
    status: "Not Sent",
    union: "Non-Union",
    value: null,
    stage: "75% CD",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(88500, "05", 18, 0, true),
  },
  {
    project: "Oakland Mixed Use",
    gc: "Webcor",
    contactEmail: "precon@webcor.com",
    contactName: "Daniel Carter",
    contactPhone: "(415) 555-0199",
    bidDate: "06/08/26",
    sentDate: "06/06/26",
    status: "No Response",
    union: "Union",
    value: 241800,
    stage: "GMP",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(224000, "05", 8, 0),
  },
  {
    project: "Vacaville Senior Living",
    gc: "Devcon",
    contactEmail: "estimating@devcon.com",
    contactName: "Rachel Stone",
    contactPhone: "(925) 555-0127",
    bidDate: "05/30/26",
    sentDate: "05/28/26",
    status: "Won",
    union: "Non-Union",
    value: 136200,
    stage: "Awarded",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(126000, "04", 21, 2),
  },
  {
    project: "Sacramento Medical TI",
    gc: "DPR",
    contactEmail: "precon@dpr.com",
    contactName: "Anthony Ruiz",
    contactPhone: "(916) 555-0144",
    bidDate: "05/22/26",
    sentDate: "05/20/26",
    status: "Lost",
    union: "Union",
    value: 78900,
    stage: "100% CD",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(76000, "04", 18, 3),
  },
  {
    project: "Berkeley Housing Phase II",
    gc: "XL Construction",
    contactEmail: "bids@xlconstruction.com",
    contactName: "Tina Wallace",
    contactPhone: "(408) 555-0166",
    bidDate: "06/07/26",
    sentDate: "06/07/26",
    status: "Won",
    union: "Non-Union",
    value: 168400,
    stage: "Awarded",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(156000, "05", 7, 1),
  },
  {
    project: "San Jose Civic Renovation",
    gc: "McCarthy",
    contactEmail: "precon@mccarthy.com",
    contactName: "Eric Jensen",
    contactPhone: "(408) 555-0192",
    bidDate: "06/20/26",
    sentDate: "06/17/26",
    status: "Still Chasing",
    union: "Union",
    value: 312600,
    stage: "GMP",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(292000, "05", 16, 0),
  },
  {
    project: "Fairfield Hotel Exterior",
    gc: "Balfour Beatty",
    contactEmail: "estimating@balfourbeatty.com",
    contactName: "Monica Hayes",
    contactPhone: "(707) 555-0165",
    bidDate: "06/21/26",
    sentDate: "Pending",
    status: "Not Sent",
    union: "Non-Union",
    value: null,
    stage: "50% CD",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(113000, "05", 20, 0, true),
  },
  {
    project: "Walnut Creek Medical Office",
    gc: "Level 10",
    contactEmail: "precon@level10gc.com",
    contactName: "James Porter",
    contactPhone: "(925) 555-0172",
    bidDate: "06/03/26",
    sentDate: "06/01/26",
    status: "No Response",
    union: "Non-Union",
    value: 154900,
    stage: "100% CD",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(147000, "05", 2, 3),
  },
  {
    project: "Fremont Tech Campus",
    gc: "Clark Construction",
    contactEmail: "bids@clarkconstruction.com",
    contactName: "Lauren Kim",
    contactPhone: "(510) 555-0188",
    bidDate: "05/18/26",
    sentDate: "05/16/26",
    status: "Lost",
    union: "Union",
    value: 402500,
    stage: "Final Round",
    timeframe: ["This Month", "This Year"],
    rounds: makeRounds(375000, "04", 11, 0),
  },
  {
    project: "Richmond School Modernization",
    gc: "Flint Builders",
    contactEmail: "estimating@flintbuilders.com",
    contactName: "David Nguyen",
    contactPhone: "(510) 555-0114",
    bidDate: "06/10/26",
    sentDate: "06/09/26",
    status: "Won",
    union: "Union",
    value: 219700,
    stage: "Awarded",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(203000, "05", 10, 2),
  },
  {
    project: "Petaluma Mixed Use",
    gc: "Nibbi Brothers",
    contactEmail: "precon@nibbi.com",
    contactName: "Carla Ramos",
    contactPhone: "(415) 555-0122",
    bidDate: "06/11/26",
    sentDate: "06/10/26",
    status: "Still Chasing",
    union: "Non-Union",
    value: 176800,
    stage: "Final Round",
    timeframe: ["This Week", "This Month", "This Year"],
    rounds: makeRounds(164000, "05", 11, 2),
  },
];

const inventory = [
  { item: "Frames", available: 1240, committed: 680, status: "Healthy" },
  { item: "Planks", available: 3120, committed: 1900, status: "Healthy" },
  { item: "Cross Braces", available: 1480, committed: 1100, status: "Watch" },
  { item: "Guardrails", available: 820, committed: 760, status: "Tight" },
  { item: "Base Plates", available: 960, committed: 540, status: "Healthy" },
  { item: "Screw Jacks", available: 710, committed: 690, status: "Tight" },
];

const marketWatch = [
  {
    ticker: "URI",
    name: "United Rentals",
    move: "+1.8%",
    price: "$681.42",
    volume: "812K",
    dayRange: "$667.20 - $684.91",
    sector: "Rental Equipment",
    note: "Equipment rental demand signal",
  },
  {
    ticker: "CAT",
    name: "Caterpillar",
    move: "-0.6%",
    price: "$327.18",
    volume: "1.9M",
    dayRange: "$324.75 - $331.40",
    sector: "Heavy Equipment",
    note: "Heavy machinery demand",
  },
  {
    ticker: "VMC",
    name: "Vulcan Materials",
    move: "+0.9%",
    price: "$251.80",
    volume: "704K",
    dayRange: "$247.92 - $252.66",
    sector: "Construction Materials",
    note: "Aggregate / infrastructure signal",
  },
  {
    ticker: "MLM",
    name: "Martin Marietta",
    move: "+0.4%",
    price: "$566.20",
    volume: "418K",
    dayRange: "$559.30 - $568.10",
    sector: "Materials",
    note: "Public works material demand",
  },
];

const constructionIndustryTrend = [
  { label: "Open", value: 68 },
  { label: "10a", value: 74 },
  { label: "12p", value: 71 },
  { label: "2p", value: 79 },
  { label: "Now", value: 76 },
];

const usConstructionNews = [
  {
    outlet: "ENR",
    icon: "ENR",
    summary: "Infrastructure and public works bidding remain important signals for scaffold demand.",
    sourceUrl: "https://www.enr.com",
  },
  {
    outlet: "Construction Dive",
    icon: "CD",
    summary: "Healthcare, industrial, and public sector projects continue to drive selective opportunities.",
    sourceUrl: "https://www.constructiondive.com",
  },
];

const internationalConstructionNews = [
  {
    outlet: "Global Construction Review",
    icon: "GCR",
    summary: "Global infrastructure, transportation, and energy projects remain active across major regions.",
    sourceUrl: "https://www.globalconstructionreview.com",
  },
  {
    outlet: "World Construction Network",
    icon: "WCN",
    summary: "Material pricing, labor availability, and project finance continue affecting construction delivery.",
    sourceUrl: "https://www.worldconstructionnetwork.com",
  },
];

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("This Month");
  const [topCompanyTimeframe, setTopCompanyTimeframe] = useState<Timeframe>("This Month");
  const [graphFilter, setGraphFilter] = useState<BidStatus | "All">("All");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const filteredBids = useMemo(() => {
    return bidPipeline.filter((bid) => bid.timeframe.includes(timeframe));
  }, [timeframe]);

  const filteredGraphBids = useMemo(() => {
    if (selectedProject) {
      return filteredBids.filter((bid) => bid.project === selectedProject);
    }

    if (graphFilter === "All") return filteredBids;
    return filteredBids.filter((bid) => bid.status === graphFilter);
  }, [filteredBids, graphFilter, selectedProject]);

  const topCompanyBids = useMemo(() => {
    return bidPipeline.filter((bid) => bid.timeframe.includes(topCompanyTimeframe));
  }, [topCompanyTimeframe]);

  const activeBids = filteredBids.filter(
    (bid) =>
      bid.status === "Still Chasing" ||
      bid.status === "No Response" ||
      bid.status === "Not Sent"
  ).length;

  const bidsSent = filteredBids.filter((bid) => bid.sentDate !== "Pending").length;
  const noResponse = filteredBids.filter((bid) => bid.status === "No Response").length;
  const won = filteredBids.filter((bid) => bid.status === "Won").length;
  const lost = filteredBids.filter((bid) => bid.status === "Lost").length;

  const topCompanies = getTopWonCompanies(topCompanyBids);
  const marketDirection = getMarketDirection();

  function sendReport() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <section className="border-b border-orange-500/20 bg-black px-8 py-5">
        <div className="flex items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.5em] text-orange-500">
              KORBAN
            </p>
            <h1 className="mt-2 text-3xl font-bold">Project Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Bid tracking, follow-ups, inventory pressure, and market awareness.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={sendReport}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
            >
              Send Report
            </button>

            <a
              href="/"
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400"
            >
              Open Main Shell
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-5 bg-[#080604] p-6 xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="space-y-5">
          <DashboardCard
            title={
              <>
                Dashboard Timeframe
                <span className="ml-4 text-[11px] normal-case tracking-normal text-zinc-500">
                  Dashboard results are currently filtered by:{" "}
                  <span className="font-mono text-orange-400">{timeframe}</span>
                </span>
              </>
            }
            rightSlot={<TimeframeSelector value={timeframe} onChange={setTimeframe} />}
          >
            <div />
          </DashboardCard>

          <div className="grid gap-4 md:grid-cols-5">
            <MetricCard label="Active Bids" value={String(activeBids)} />
            <MetricCard label="Bid Sent" value={String(bidsSent)} />
            <MetricCard label="No Response" value={String(noResponse)} />
            <MetricCard label="Won Jobs" value={String(won)} />
            <MetricCard label="Lost Jobs" value={String(lost)} />
          </div>

          <DashboardCard title="Bid Track">
            <BidResultsChart
              bids={filteredGraphBids}
              selectedStatus={graphFilter}
              selectedProject={selectedProject}
              onStatusChange={(status) => {
                setSelectedProject(null);
                setGraphFilter(status);
              }}
              onClearSelectedProject={() => setSelectedProject(null)}
            />
          </DashboardCard>
        </div>

        <div className="space-y-5">
          <DashboardCard title="Inventory Track">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {inventory.map((row) => {
                const percent = Math.min(100, Math.round((row.committed / row.available) * 100));

                return (
                  <div key={row.item} className="rounded-2xl border border-zinc-800 bg-black p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">{row.item}</p>
                      <InventoryStatus status={row.status} />
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
                      <span>{row.committed}</span>
                      <span>{row.available}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard
            title={
              <div>
                <span>Top 5 GCs</span>
                <p className="mt-1 text-[10px] normal-case tracking-normal text-zinc-500">
                  based on current most won jobs
                </p>
              </div>
            }
            rightSlot={
              <TimeframeSelector
                value={topCompanyTimeframe}
                onChange={setTopCompanyTimeframe}
                compact
              />
            }
          >
            <div className="space-y-3">
              {topCompanies.map((company, index) => (
                <div
                  key={`${company.name}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">
                      {index + 1}. {company.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">Won jobs: {company.wonJobs}</p>
                  </div>
                  <p className="font-mono text-sm font-bold text-orange-400">
                    {formatMoney(company.value)}
                  </p>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="xl:col-span-2">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
            <DashboardCard title="Bid Follow-Up Tracker">
              <div className="rounded-2xl border border-zinc-800">
                <table className="w-full table-fixed text-left text-[10px]">
                  <thead className="bg-zinc-950 text-zinc-500">
                    <tr>
                      <th className="w-[12%] px-2 py-3">Project</th>
                      <th className="w-[13%] px-2 py-3">GC / Contact</th>
                      <th className="w-[7%] px-2 py-3">Bid Date</th>
                      {roundLabels.map((label) => (
                        <th key={label} className="w-[7%] px-1 py-3 text-center">
                          {label}
                        </th>
                      ))}
                      <th className="w-[7%] px-2 py-3">Sent</th>
                      <th className="w-[8%] px-2 py-3">Result</th>
                      <th className="w-[7%] px-2 py-3 text-right">Current</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 bg-black/60">
                    {filteredBids.map((bid) => (
                      <tr
                        key={bid.project}
                        onClick={() => setSelectedProject(bid.project)}
                        className={`cursor-pointer transition hover:bg-orange-500/5 ${
                          selectedProject === bid.project ? "bg-orange-500/10" : ""
                        }`}
                      >
                        <td className="px-2 py-3 font-semibold text-zinc-200">{bid.project}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-zinc-300">{bid.gc}</p>
                            <UnionBadge type={bid.union} />
                          </div>
                          <p className="truncate text-[9px] text-zinc-600">{bid.contactEmail}</p>
                          <p className="truncate text-[9px] text-zinc-600">{bid.contactName} · {bid.contactPhone}</p>
                        </td>
                        <td className="px-2 py-3 font-mono text-zinc-400">{bid.bidDate}</td>
                        {bid.rounds.map((round) => (
                          <td key={`${bid.project}-${round.label}`} className="px-1 py-3 text-center">
                            <p className="font-mono text-[9px] text-zinc-500">{round.date}</p>
                            <p className="font-mono text-[9px] text-orange-400">
                              {round.value === null ? "—" : formatCompactMoney(round.value)}
                            </p>
                          </td>
                        ))}
                        <td className="px-2 py-3 font-mono text-zinc-400">{bid.sentDate}</td>
                        <td className="px-2 py-3">
                          <StatusPill status={bid.status} />
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-orange-400">
                          {bid.value === null ? "—" : formatMoney(bid.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardCard>

            <DashboardCard title="Construction Market Watch">
              <div className="mb-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Construction Industry Overall
                </p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <p
                      className={`font-mono text-3xl font-bold ${
                        marketDirection.isUp ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {marketDirection.averageMove}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Overall day direction:{" "}
                      <span className={marketDirection.isUp ? "text-emerald-400" : "text-red-400"}>
                        {marketDirection.isUp ? "Up" : "Down"}
                      </span>
                    </p>
                  </div>

                  <MiniMarketChart points={constructionIndustryTrend} />
                </div>
              </div>

              <div className="mb-4 h-px bg-orange-500/20" />

              <div className="grid gap-3">
                {marketWatch.map((stock) => (
                  <div key={stock.ticker} className="rounded-2xl border border-zinc-800 bg-black p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-lg font-bold text-orange-400">{stock.ticker}</p>
                        <p className="text-[11px] text-zinc-500">{stock.name}</p>
                      </div>

                      <p
                        className={`font-mono text-sm font-bold ${
                          stock.move.startsWith("+") ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {stock.move}
                      </p>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                      <p>Price: <span className="font-mono text-zinc-300">{stock.price}</span></p>
                      <p>Vol: <span className="font-mono text-zinc-300">{stock.volume}</span></p>
                      <p>Range: <span className="font-mono text-zinc-300">{stock.dayRange}</span></p>
                      <p>Sector: <span className="font-mono text-zinc-300">{stock.sector}</span></p>
                    </div>

                    <p className="mt-2 text-[11px] text-zinc-500">{stock.note}</p>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        </div>

        <div className="xl:col-span-2">
          <DashboardCard title="Construction News Feed">
            <div className="grid gap-5 xl:grid-cols-2">
              <NewsBlock title="United States Construction News" items={usConstructionNews} />
              <NewsBlock title="International Construction News" items={internationalConstructionNews} />
            </div>
          </DashboardCard>
        </div>
      </section>
    </main>
  );
}

function getTopWonCompanies(bids: typeof bidPipeline) {
  const wonBids = bids.filter((bid) => bid.status === "Won");

  const grouped = wonBids.reduce<Record<string, { name: string; wonJobs: number; value: number }>>(
    (acc, bid) => {
      if (!acc[bid.gc]) {
        acc[bid.gc] = { name: bid.gc, wonJobs: 0, value: 0 };
      }

      acc[bid.gc].wonJobs += 1;
      acc[bid.gc].value += bid.value ?? 0;

      return acc;
    },
    {}
  );

  const results = Object.values(grouped)
    .sort((a, b) => b.wonJobs - a.wonJobs || b.value - a.value)
    .slice(0, 5);

  while (results.length < 5) {
    results.push({
      name: "Pending More Won Bid Data",
      wonJobs: 0,
      value: 0,
    });
  }

  return results;
}

function getMarketDirection() {
  const total = marketWatch.reduce((sum, stock) => sum + Number(stock.move.replace("%", "")), 0);
  const average = total / marketWatch.length;
  const sign = average >= 0 ? "+" : "";

  return {
    averageMove: `${sign}${average.toFixed(2)}%`,
    isUp: average >= 0,
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatCompactMoney(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  return `$${Math.round(value / 1000)}K`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-orange-500/20 bg-black p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <h2 className="mt-3 font-mono text-4xl font-bold text-orange-500">{value}</h2>
    </div>
  );
}

function DashboardCard({
  title,
  children,
  rightSlot,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">{title}</h2>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function TimeframeSelector({
  value,
  onChange,
  compact = false,
}: {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {timeframeOptions.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-lg border ${
            compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
          } font-bold transition ${
            value === option
              ? "border-orange-500 bg-orange-500 text-black"
              : "border-zinc-800 bg-black text-zinc-500 hover:border-orange-500/50"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function UnionBadge({ type }: { type: "Union" | "Non-Union" }) {
  if (type === "Union") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-[9px] font-bold text-orange-300">
        U
      </span>
    );
  }

  return (
    <span className="flex h-5 min-w-7 shrink-0 items-center justify-center rounded-md border border-zinc-500/40 bg-zinc-500/10 px-1 text-[9px] font-bold text-zinc-300">
      NU
    </span>
  );
}

function StatusPill({ status }: { status: BidStatus }) {
  const styles: Record<BidStatus, string> = {
    Won: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    Lost: "border-red-500/30 bg-red-500/10 text-red-300",
    "Still Chasing": "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
    "No Response": "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    "Not Sent": "border-zinc-700 bg-zinc-900 text-zinc-400",
  };

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function InventoryStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Healthy: "text-emerald-300",
    Watch: "text-yellow-300",
    Tight: "text-red-300",
  };

  return <span className={`text-[10px] font-bold ${styles[status]}`}>{status}</span>;
}

function BidResultsChart({
  bids,
  selectedStatus,
  selectedProject,
  onStatusChange,
  onClearSelectedProject,
}: {
  bids: typeof bidPipeline;
  selectedStatus: BidStatus | "All";
  selectedProject: string | null;
  onStatusChange: (status: BidStatus | "All") => void;
  onClearSelectedProject: () => void;
}) {
  const allRoundValues = bids.flatMap((bid) =>
    bid.rounds.map((round) => round.value).filter((value): value is number => value !== null)
  );
  const maxValue = Math.max(...allRoundValues, 450000);
  const yTicks = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];
  const groupedLines = groupRoundLinesByBid(bids, maxValue);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_170px]">
      <div className="relative h-[560px] rounded-2xl border border-zinc-800 bg-black p-5">
        <div className="absolute bottom-20 left-16 right-6 top-6 border-l border-b border-zinc-700">
          <div className="absolute inset-0">
            {yTicks.map((tick, index) => (
              <div
                key={tick}
                className="absolute left-0 right-0 border-t border-zinc-900"
                style={{ top: `${index * 25}%` }}
              >
                <span className="absolute -left-14 -top-2 font-mono text-[10px] text-zinc-600">
                  {formatShortMoney(tick)}
                </span>
              </div>
            ))}
          </div>

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            {groupedLines.map((line) => {
              if (line.points.length < 2) return null;

              return (
                <polyline
                  key={line.key}
                  points={line.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={line.stroke}
                  strokeWidth="0.28"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
              );
            })}
          </svg>

          {roundLabels.map((label, index) => (
            <div
              key={label}
              className="absolute bottom-[-46px] w-16 -translate-x-1/2 text-center text-[9px] leading-3 text-zinc-600"
              style={{ left: `${(index / (roundLabels.length - 1)) * 100}%` }}
            >
              {label}
            </div>
          ))}

          {groupedLines.flatMap((line) =>
            line.points.map((point) => (
              <div
                key={`${line.key}-${point.x}-${point.y}`}
                className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black ${line.dot}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                title={point.title}
              />
            ))
          )}
        </div>

        <div className="absolute bottom-5 left-16 right-6 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          Bid Round / Award Progression
        </div>

        <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          Bid Amount
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-black p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
          Isolate Results
        </p>

        {selectedProject && (
          <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-orange-300">
              Project selected
            </p>
            <p className="mt-1 text-xs font-bold text-zinc-200">{selectedProject}</p>
            <button
              onClick={onClearSelectedProject}
              className="mt-2 text-[10px] font-bold text-zinc-500 hover:text-orange-300"
            >
              Clear selection
            </button>
          </div>
        )}

        {(["All", "No Response", "Won", "Lost", "Still Chasing"] as (BidStatus | "All")[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => onStatusChange(status)}
              className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition last:mb-0 ${
                selectedStatus === status
                  ? "border-orange-500 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-orange-500/40"
              }`}
            >
              <span>{status}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  status === "All" ? "bg-orange-500" : getStatusDotColor(status)
                }`}
              />
            </button>
          )
        )}
      </div>
    </div>
  );
}

function groupRoundLinesByBid(bids: typeof bidPipeline, maxValue: number) {
  return bids
    .filter((bid) => bid.status !== "Not Sent")
    .map((bid) => {
      const points = bid.rounds
        .map((round, index) => {
          if (round.value === null) return null;

          return {
            x: (index / (roundLabels.length - 1)) * 100,
            y: 100 - (round.value / maxValue) * 100,
            title: `${bid.project} • ${round.label} • ${round.date} • ${formatMoney(round.value)}`,
          };
        })
        .filter((point): point is { x: number; y: number; title: string } => point !== null);

      return {
        key: bid.project,
        points,
        stroke: getStatusStroke(bid.status),
        dot: getStatusDotColor(bid.status),
      };
    });
}

function getStatusStroke(status: BidStatus) {
  if (status === "Won") return "#10b981";
  if (status === "Lost") return "#ef4444";
  if (status === "Still Chasing") return "#d4d4d8";
  if (status === "No Response") return "#facc15";
  return "#3f3f46";
}

function getStatusDotColor(status: BidStatus) {
  if (status === "Won") return "bg-emerald-500";
  if (status === "Lost") return "bg-red-500";
  if (status === "Still Chasing") return "bg-zinc-300";
  if (status === "No Response") return "bg-yellow-400";
  return "bg-zinc-700";
}

function formatShortMoney(value: number) {
  if (value >= 1000000) return `$${Math.round(value / 1000000)}M`;
  return `$${Math.round(value / 1000)}K`;
}

function MiniMarketChart({
  points,
}: {
  points: { label: string; value: number }[];
}) {
  const max = Math.max(...points.map((point) => point.value));
  const min = Math.min(...points.map((point) => point.value));
  const spread = Math.max(1, max - min);

  const svgPoints = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - ((point.value - min) / spread) * 75 - 10;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="w-36">
      <svg viewBox="0 0 100 100" className="h-20 w-full overflow-visible">
        <polyline
          points={svgPoints}
          fill="none"
          stroke="#f97316"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
        {points.map((point, index) => {
          const x = (index / (points.length - 1)) * 100;
          const y = 100 - ((point.value - min) / spread) * 75 - 10;

          return <circle key={point.label} cx={x} cy={y} r="2.2" fill="#fb923c" />;
        })}
      </svg>

      <div className="flex justify-between text-[9px] text-zinc-600">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

function NewsBlock({
  title,
  items,
}: {
  title: string;
  items: {
    outlet: string;
    icon: string;
    summary: string;
    sourceUrl: string;
  }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </h3>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={`${item.outlet}-${item.summary}`}
            className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-black font-mono text-[10px] font-bold text-orange-400">
                {item.icon}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-300">{item.outlet}</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  {item.summary}
                </p>
              </div>

              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] font-bold text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                Source
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
