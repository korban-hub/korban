"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryRow = {
  partNo: string;
  category?: string;
  description: string;
  qty?: number;
};

type LoadListData = {
  projectName?: string;
  projectAddress?: string;
  companyName?: string;
  scaffoldWidth?: string;
  linealFeet?: number;
  bayCount?: number;
  legCount?: number;
  framesPerLeg?: number;
  generatedAt?: string;
  rows?: InventoryRow[];
};

const catalogGroups: InventoryRow[][] = [
  [
    { partNo: "FO7CP", description: "7' Pedestrian Canopy" },
    { partNo: "FO6L3", description: "6' 4\" H - 3' W Frame" },
    { partNo: "FO5L3", description: "5' H - 3' W Frame" },
    { partNo: "FM33", description: "3' H - 3' W Frame" },
    { partNo: "FO6L42", description: "6' 4\" H - 42\" W Frame" },
    { partNo: "FO5L42", description: "5' H - 42\" W Frame" },
    { partNo: "FM342", description: "3' H - 42\" W Frame" },
    { partNo: "FO6L", description: "6' 4\" H - 5' W Frame" },
    { partNo: "FM5", description: "5' Mason Frame" },
    { partNo: "FM3", description: "3' Mason Frame" },
    { partNo: "FO6L2", description: "6' 4\" H X 2' W Frame" },
    { partNo: "FO5L2", description: "5' H X 2' W Frame" },
    { partNo: "FM32", description: "3' H X 2' W Frame" },
    { partNo: "AL1", description: "Screw Jack W/No Base" },
    { partNo: "AL1S", description: "Screw Jack W/Base Plate" },
    { partNo: "BP1", description: "Fixed Base Plate" },
    { partNo: "BP2", description: "Swivel Base Plate" },
    { partNo: "BP3", description: "Curved Base Plate" },
    { partNo: "SJS", description: "Swivel Jacks" },
    { partNo: "P12", description: "12' Putlogs" },
    { partNo: "P16", description: "16' Putlogs" },
    { partNo: "P22", description: "22' Putlogs" },
    { partNo: "PH2", description: "Putlogs Hangers" },
    { partNo: "SP3", description: "3' Spreader Bar" },
    { partNo: "SP42", description: "42\" Spreader Bar" },
    { partNo: "SP5", description: "5' Spreader Bar" },
  ],
  [
    { partNo: "B42", description: "4X2 Cross Brace" },
    { partNo: "B52", description: "5X2 Cross Brace" },
    { partNo: "B62", description: "6X2 Cross Brace" },
    { partNo: "B72", description: "7X2 Cross Brace" },
    { partNo: "B82", description: "8X2 Cross Brace" },
    { partNo: "B102", description: "10X2 Cross Brace" },
    { partNo: "B44", description: "4X4 Cross Brace" },
    { partNo: "B54", description: "5X4 Cross Brace" },
    { partNo: "B64", description: "6X4 Cross Brace" },
    { partNo: "B74", description: "7X4 Cross Brace" },
    { partNo: "B84", description: "8X4 Cross Brace" },
    { partNo: "B104", description: "10X4 Cross Brace" },
    { partNo: "GR42", description: "42\" Guard Rail" },
    { partNo: "GR3", description: "3' Guard Rail" },
    { partNo: "GR4", description: "4' Guard Rail" },
    { partNo: "GR5", description: "5' Guard Rail" },
    { partNo: "GR6", description: "6' Guard Rail" },
    { partNo: "GR7", description: "7' Guard Rail" },
    { partNo: "GR8", description: "8' Guard Rail" },
    { partNo: "GR10", description: "10' Guard Rail" },
    { partNo: "GHB3", description: "3' Gooser Brace" },
    { partNo: "GHB5", description: "5' Gooser Brace" },
    { partNo: "GHB7", description: "7' Gooser Brace" },
    { partNo: "GHB10", description: "10' Gooser Brace" },
    { partNo: "BR12L", description: "12\" Side Bracket" },
    { partNo: "BR20L", description: "20\" Side Bracket" },
    { partNo: "BR24L", description: "24\" Side Bracket" },
    { partNo: "BR30S", description: "30\" Side Bracket" },
    { partNo: "BR20E", description: "20\" End Bracket" },
    { partNo: "BR30E", description: "30\" End Bracket" },
  ],
  [
    { partNo: "CGRP", description: "Male Corner Guard" },
    { partNo: "ST4SG", description: "4' Tube" },
    { partNo: "ST6SG", description: "6' Tube" },
    { partNo: "ST8SG", description: "8' Tube" },
    { partNo: "ST10SG", description: "10' Tube" },
    { partNo: "ST13SG", description: "13' Tube" },
    { partNo: "CRA19", description: "Right Angle Clamp" },
    { partNo: "CSA19", description: "Swivel Clamp" },
    { partNo: "SAU3", description: "3' Steel Ladder" },
    { partNo: "SAU6", description: "6' Steel Ladder" },
    { partNo: "SAUB", description: "Ladder Bracket" },
    { partNo: "K18", description: "18\" Kickers" },
    { partNo: "K12", description: "12\" Kickers" },
    { partNo: "CPS", description: "Coupling Pin" },
    { partNo: "PTP", description: "Pig Tail Pin" },
    { partNo: "SU6", description: "6' 4\" Stair Unit" },
    { partNo: "SU6OR", description: "Outside Rail" },
    { partNo: "SU6IR", description: "Inner Rail" },
    { partNo: "SU6IER", description: "Inner End Rail" },
    { partNo: "WP5", description: "5' Wood Plank" },
    { partNo: "WP6", description: "6' Wood Plank" },
    { partNo: "WP7", description: "7' Wood Plank" },
    { partNo: "WP8", description: "8' Wood Plank" },
    { partNo: "WP9", description: "9' Wood Plank" },
    { partNo: "WP10", description: "10' Wood Plank" },
    { partNo: "WP12", description: "12' Wood Plank" },
    { partNo: "SB7", description: "7' Hatch Board" },
    { partNo: "SB10", description: "10' Hatch Board" },
    { partNo: "FP10", description: "10' Filler Plank" },
    { partNo: "AT12", description: "1/2\" All Thread" },
    { partNo: "N12", description: "1/2\" Nuts" },
    { partNo: "RH12", description: "1/2\" Redheads" },
  ],
];

function normalizePart(partNo: string) {
  return partNo.trim().toUpperCase();
}

function getPlankQty(rows: InventoryRow[] | undefined) {
  return (rows || []).reduce((sum, row) => {
    const text = `${row.partNo} ${row.description}`.toLowerCase();
    const isPlank = text.includes("plank") || row.partNo.toUpperCase().startsWith("WP");
    return isPlank ? sum + (row.qty || 0) : sum;
  }, 0);
}

export default function InventoryLoadListPage() {
  const [loadList, setLoadList] = useState<LoadListData>({});

  useEffect(() => {
    const stored = window.localStorage.getItem("korbanInventoryLoadList");
    if (!stored) return;

    try {
      setLoadList(JSON.parse(stored));
    } catch {
      setLoadList({});
    }
  }, []);

  const qtyMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of loadList.rows || []) {
      map.set(normalizePart(row.partNo), row.qty || 0);
    }

    return map;
  }, [loadList.rows]);

  const totalQtyRequired = useMemo(() => {
    return Array.from(qtyMap.values()).reduce((sum, qty) => sum + qty, 0);
  }, [qtyMap]);

  const totalPlankCount = useMemo(() => getPlankQty(loadList.rows), [loadList.rows]);

  const truckLoads = useMemo(() => {
    if (!totalPlankCount) return 0;
    return Math.ceil(totalPlankCount / 150);
  }, [totalPlankCount]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-orange-500/20 bg-black px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">KORBAN</h1>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-zinc-500">
              Material List / Inventory Load List
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="rounded-full border border-zinc-800 px-4 py-2 text-xs text-zinc-300 transition hover:border-orange-500/40 hover:bg-orange-500/10"
            >
              Back to Estimate
            </a>
            <button className="rounded-full bg-orange-500 px-5 py-2 text-xs font-semibold text-black transition hover:bg-orange-400">
              Export Load List
            </button>
          </div>
        </div>
      </header>

      <section className="px-6 py-5">
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-[1.25fr_1.25fr_.55fr_.55fr_.55fr_.8fr_.9fr]">
          <SummaryCard label="Project" value={loadList.projectName || "Not entered"} />
          <SummaryCard label="Project Address" value={loadList.projectAddress || "Not entered"} />
          <SummaryCard label="Width" value={loadList.scaffoldWidth || "Not set"} compact />
          <SummaryCard label="LF" value={(loadList.linealFeet || 0).toFixed(1)} compact />
          <SummaryCard label="Bay" value={String(loadList.bayCount || 0)} compact />
          <SummaryCard label="Truck Loads" value={String(truckLoads)} highlight />
          <SummaryCard label="Qty Required" value={String(totalQtyRequired)} highlight />
        </div>

        <div className="rounded-[28px] border border-orange-500/20 bg-black p-4 shadow-[0_0_45px_rgba(249,115,22,0.08)]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-900 pb-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-400">
                Load List / Inventory Tracking
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Part numbers and descriptions follow the scaffold yard inventory format. Cost columns are intentionally removed.
              </p>
            </div>
            <p className="font-mono text-xs text-zinc-600">
              Source: current KORBAN estimate
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {catalogGroups.map((group, index) => (
              <InventoryColumn key={index} rows={group} qtyMap={qtyMap} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
  compact = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${compact ? "p-3" : "p-4"} ${
        highlight ? "border-orange-500/30 bg-orange-500/10" : "border-zinc-800 bg-black"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p
        className={`mt-2 truncate font-mono ${compact ? "text-xs" : "text-sm"} font-semibold ${
          highlight ? "text-orange-400" : "text-zinc-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InventoryColumn({ rows, qtyMap }: { rows: InventoryRow[]; qtyMap: Map<string, number> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-zinc-950 text-zinc-500">
          <tr>
            <th className="w-[76px] border-b border-zinc-800 px-2 py-2 font-semibold">Part No.</th>
            <th className="border-b border-zinc-800 px-2 py-2 font-semibold">Description</th>
            <th className="w-[64px] border-b border-zinc-800 px-2 py-2 text-right font-semibold text-orange-300">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const qty = qtyMap.get(normalizePart(row.partNo)) || 0;
            const active = qty > 0;

            return (
              <tr
                key={`${row.partNo}-${row.description}`}
                className={active ? "bg-orange-500/10 text-orange-100" : "text-zinc-400"}
              >
                <td className="border-b border-zinc-900 px-2 py-2 font-mono text-[10px] text-orange-400">
                  {row.partNo}
                </td>
                <td className="border-b border-zinc-900 px-2 py-2 uppercase tracking-[0.02em]">
                  {row.description}
                </td>
                <td
                  className={`border-b border-zinc-900 px-2 py-2 text-right font-mono ${
                    active ? "font-bold text-orange-300" : "text-zinc-700"
                  }`}
                >
                  {qty}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
