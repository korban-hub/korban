"use client";

import { useEffect, useMemo, useState } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";

// ── Types ─────────────────────────────────────────────────────────────────────

type InventoryRow = { partNo: string; description: string; };

type ProjectAllocation = {
  projectId: string;
  projectName: string;
  qty: number;
};

type MasterItem = {
  partNo: string;
  description: string;
  owned: number;                      // set in Backend on account setup
  allocations: ProjectAllocation[];   // one per active project
};

// ── Full catalog (same as load list) ─────────────────────────────────────────

const ALL_ROWS: InventoryRow[] = [
  { partNo: "FO7CP",   description: "7' Pedestrian Canopy" },
  { partNo: "FO6L3",   description: "6' 4\" H - 3' W Frame" },
  { partNo: "FO5L3",   description: "5' H - 3' W Frame" },
  { partNo: "FM33",    description: "3' H - 3' W Frame" },
  { partNo: "FO6L42",  description: "6' 4\" H - 42\" W Frame" },
  { partNo: "FO5L42",  description: "5' H - 42\" W Frame" },
  { partNo: "FM342",   description: "3' H - 42\" W Frame" },
  { partNo: "FO6L",    description: "6' 4\" H - 5' W Frame" },
  { partNo: "FM5",     description: "5' Mason Frame" },
  { partNo: "FM3",     description: "3' Mason Frame" },
  { partNo: "FO6L2",   description: "6' 4\" H X 2' W Frame" },
  { partNo: "FO5L2",   description: "5' H X 2' W Frame" },
  { partNo: "FM32",    description: "3' H X 2' W Frame" },
  { partNo: "AL1",     description: "Screw Jack W/No Base" },
  { partNo: "AL1S",    description: "Screw Jack W/Base Plate" },
  { partNo: "BP1",     description: "Fixed Base Plate" },
  { partNo: "BP2",     description: "Swivel Base Plate" },
  { partNo: "BP3",     description: "Curved Base Plate" },
  { partNo: "SJS",     description: "Swivel Jacks" },
  { partNo: "P12",     description: "12' Putlogs" },
  { partNo: "P16",     description: "16' Putlogs" },
  { partNo: "P22",     description: "22' Putlogs" },
  { partNo: "PH2",     description: "Putlogs Hangers" },
  { partNo: "SP3",     description: "3' Spreader Bar" },
  { partNo: "SP42",    description: "42\" Spreader Bar" },
  { partNo: "SP5",     description: "5' Spreader Bar" },
  { partNo: "B42",     description: "4X2 Cross Brace" },
  { partNo: "B52",     description: "5X2 Cross Brace" },
  { partNo: "B62",     description: "6X2 Cross Brace" },
  { partNo: "B72",     description: "7X2 Cross Brace" },
  { partNo: "B82",     description: "8X2 Cross Brace" },
  { partNo: "B102",    description: "10X2 Cross Brace" },
  { partNo: "B44",     description: "4X4 Cross Brace" },
  { partNo: "B54",     description: "5X4 Cross Brace" },
  { partNo: "B64",     description: "6X4 Cross Brace" },
  { partNo: "B74",     description: "7X4 Cross Brace" },
  { partNo: "B84",     description: "8X4 Cross Brace" },
  { partNo: "B104",    description: "10X4 Cross Brace" },
  { partNo: "GR42",    description: "42\" Guard Rail" },
  { partNo: "GR3",     description: "3' Guard Rail" },
  { partNo: "GR4",     description: "4' Guard Rail" },
  { partNo: "GR5",     description: "5' Guard Rail" },
  { partNo: "GR6",     description: "6' Guard Rail" },
  { partNo: "GR7",     description: "7' Guard Rail" },
  { partNo: "GR8",     description: "8' Guard Rail" },
  { partNo: "GR10",    description: "10' Guard Rail" },
  { partNo: "GHB3",    description: "3' Gooser Brace" },
  { partNo: "GHB5",    description: "5' Gooser Brace" },
  { partNo: "GHB7",    description: "7' Gooser Brace" },
  { partNo: "GHB10",   description: "10' Gooser Brace" },
  { partNo: "BR12L",   description: "12\" Side Bracket" },
  { partNo: "BR20L",   description: "20\" Side Bracket" },
  { partNo: "BR24L",   description: "24\" Side Bracket" },
  { partNo: "BR30S",   description: "30\" Side Bracket" },
  { partNo: "BR20E",   description: "20\" End Bracket" },
  { partNo: "BR30E",   description: "30\" End Bracket" },
  { partNo: "CGRP",    description: "Male Corner Guard" },
  { partNo: "ST4SG",   description: "4' Tube" },
  { partNo: "ST6SG",   description: "6' Tube" },
  { partNo: "ST8SG",   description: "8' Tube" },
  { partNo: "ST10SG",  description: "10' Tube" },
  { partNo: "ST13SG",  description: "13' Tube" },
  { partNo: "CRA19",   description: "Right Angle Clamp" },
  { partNo: "CSA19",   description: "Swivel Clamp" },
  { partNo: "SAU3",    description: "3' Steel Ladder" },
  { partNo: "SAU6",    description: "6' Steel Ladder" },
  { partNo: "SAUB",    description: "Ladder Bracket" },
  { partNo: "K18",     description: "18\" Kickers" },
  { partNo: "K12",     description: "12\" Kickers" },
  { partNo: "CPS",     description: "Coupling Pin" },
  { partNo: "PTP",     description: "Pig Tail Pin" },
  { partNo: "SU6",     description: "6' 4\" Stair Unit" },
  { partNo: "SU6OR",   description: "Outside Rail" },
  { partNo: "SU6IR",   description: "Inner Rail" },
  { partNo: "SU6IER",  description: "Inner End Rail" },
  { partNo: "WP5",     description: "5' Wood Plank" },
  { partNo: "WP6",     description: "6' Wood Plank" },
  { partNo: "WP7",     description: "7' Wood Plank" },
  { partNo: "WP8",     description: "8' Wood Plank" },
  { partNo: "WP9",     description: "9' Wood Plank" },
  { partNo: "WP10",    description: "10' Wood Plank" },
  { partNo: "WP12",    description: "12' Wood Plank" },
  { partNo: "SB7",     description: "7' Hatch Board" },
  { partNo: "SB10",    description: "10' Hatch Board" },
  { partNo: "FP10",    description: "10' Filler Plank" },
  { partNo: "AT12",    description: "1/2\" All Thread" },
  { partNo: "N12",     description: "1/2\" Nuts" },
  { partNo: "RH12",    description: "1/2\" Redheads" },
];

// ── Demo seed data ────────────────────────────────────────────────────────────
// Backend-configured owned quantities (hundreds/thousands, realistic for a
// mid-size scaffold contractor). Percentages of a base fleet.

const OWNED_QUANTITIES: Record<string, number> = {
  FO6L3: 2400, FO5L3: 800,  FM33: 400,
  FO6L42: 600, FO5L42: 200, FM342: 120,
  FO6L:  1800, FM5: 300,    FM3: 200,
  FO6L2:  400, FO5L2: 120,  FM32: 80,
  AL1:   1200, AL1S: 600,   BP1: 1200,
  BP2:    300, BP3: 80,     SJS: 400,
  P12:    500, P16: 300,    P22: 150,
  PH2:    800, SP3: 400,    SP42: 200, SP5: 180,
  B82:   2000, B62: 800,    B102: 400,
  B84:    600, B64: 300,
  GR8:   1500, GR10: 600,   GR6: 400, GR5: 200,
  GHB5:   300, GHB7: 200,   GHB10: 100,
  BR12L:  400, BR20L: 300,  BR24L: 200, BR30S: 150,
  WP8:   3000, WP10: 1200,  WP12: 600,
  WP6:    400, WP5: 200,
  CPS:   5000, PTP: 3000,
  SAU6:   200, SAU3: 120,   SAUB: 300,
  ST8SG:  400, ST10SG: 300, ST6SG: 200, ST13SG: 100,
  CRA19: 1000, CSA19: 600,
};

// Demo projects with allocations
const DEMO_PROJECTS = [
  { projectId: "KRB-260614-001", projectName: "Mare Island Apts" },
  { projectId: "KRB-260522-002", projectName: "Oakland Federal Bldg" },
  { projectId: "KRB-260411-003", projectName: "SF Civic Center" },
];

// Per-project allocations as % of owned (realistic demo spread)
const PROJECT_ALLOCATION_PCT: Record<string, Record<string, number>> = {
  "KRB-260614-001": { FO6L3: 0.19, FO6L: 0.25, WP8: 0.06, BP1: 0.05, AL1: 0.05, B82: 0.03, GR8: 0.04 },
  "KRB-260522-002": { FO6L3: 0.22, FO6L: 0.18, WP8: 0.08, BP1: 0.07, AL1: 0.07, B82: 0.04, GR8: 0.05, FO6L2: 0.15 },
  "KRB-260411-003": { FO6L3: 0.15, FO6L: 0.12, WP8: 0.05, BP1: 0.04, AL1: 0.04, B82: 0.02, GR8: 0.03 },
};

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard",           label: "Bid Room" },
  { href: "/inventory/load-list", label: "Load List" },
  { href: "/backend",             label: "Backend" },
];

// ── Availability status ───────────────────────────────────────────────────────

type AvailStatus = "healthy" | "low" | "critical" | "over";

function getStatus(available: number, owned: number): AvailStatus {
  if (owned === 0) return "healthy";
  if (available < 0) return "over";
  const pct = available / owned;
  if (pct <= 0.10) return "critical";
  if (pct <= 0.25) return "low";
  return "healthy";
}

const STATUS_STYLES: Record<AvailStatus, { cell: string; text: string; glow: string; label: string }> = {
  healthy:  { cell: "bg-emerald-500/8",  text: "text-emerald-300", glow: "shadow-[0_0_12px_rgba(52,211,153,0.25)]",  label: "OK" },
  low:      { cell: "bg-yellow-500/10",  text: "text-yellow-300",  glow: "shadow-[0_0_12px_rgba(234,179,8,0.3)]",    label: "LOW" },
  critical: { cell: "bg-red-500/12",     text: "text-red-400",     glow: "shadow-[0_0_14px_rgba(239,68,68,0.35)]",   label: "SHORT" },
  over:     { cell: "bg-orange-500/12",  text: "text-orange-400",  glow: "shadow-[0_0_14px_rgba(249,115,22,0.35)]",  label: "OVER" },
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MasterInventoryPage() {
  const [items, setItems] = useState<MasterItem[]>([]);

  useEffect(() => {
    // Build master items from catalog + owned quantities + project allocations
    const built: MasterItem[] = ALL_ROWS.map((row) => {
      const owned = OWNED_QUANTITIES[row.partNo] ?? 0;
      const allocations: ProjectAllocation[] = DEMO_PROJECTS.map((proj) => {
        const pct = PROJECT_ALLOCATION_PCT[proj.projectId]?.[row.partNo] ?? 0;
        return {
          projectId: proj.projectId,
          projectName: proj.projectName,
          qty: Math.round(owned * pct),
        };
      });
      return { partNo: row.partNo, description: row.description, owned, allocations };
    });
    setItems(built);
  }, []);

  const projects = DEMO_PROJECTS;

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <KorbanHeader
        title="Master Inventory"
        subtitle="Company-wide equipment — allocations across all active projects"
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <a href="/inventory/load-list"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-bold text-zinc-300 hover:border-orange-500/30 hover:text-orange-300">
              Load List
            </a>
            <a href="/dashboard"
              className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20">
              Bid Room
            </a>
          </>
        }
      />

      <section className="p-6">

        {/* Legend */}
        <div className="mb-5 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Available Stock:</span>
          {(Object.entries(STATUS_STYLES) as [AvailStatus, typeof STATUS_STYLES[AvailStatus]][]).map(([key, s]) => (
            <div key={key} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold ${s.cell} ${s.text} border-current/20`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.text.replace("text-", "bg-")}`} />
              {s.label}
            </div>
          ))}
          <span className="ml-auto text-[10px] text-zinc-600">{items.filter(i => i.owned > 0).length} tracked items · {projects.length} active projects</span>
        </div>

        {/* Horizontally scrollable table */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-black">
          <table className="w-full text-left text-[11px] min-w-[900px]">
            <thead>
              <tr className="bg-zinc-950">
                {/* Fixed left columns */}
                <th className="sticky left-0 z-10 bg-zinc-950 border-b border-r border-zinc-800 px-3 py-3 font-semibold text-zinc-500 w-[84px]">Part No.</th>
                <th className="sticky left-[84px] z-10 bg-zinc-950 border-b border-r border-zinc-800 px-3 py-3 font-semibold text-zinc-500 min-w-[200px]">Description</th>
                <th className="border-b border-r border-zinc-800 px-3 py-3 font-semibold text-zinc-400 text-right w-[80px]">Owned</th>
                {/* One column per project */}
                {projects.map((p) => (
                  <th key={p.projectId} className="border-b border-r border-zinc-800 px-3 py-3 font-semibold text-zinc-500 text-right w-[120px] whitespace-nowrap">
                    <div className="text-[9px] text-zinc-600 font-mono">{p.projectId}</div>
                    <div className="text-zinc-400 truncate max-w-[110px]">{p.projectName}</div>
                  </th>
                ))}
                {/* Available column */}
                <th className="border-b border-zinc-800 px-3 py-3 font-semibold text-right w-[90px] text-zinc-300">Available</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const totalAllocated = item.allocations.reduce((s, a) => s + a.qty, 0);
                const available = item.owned - totalAllocated;
                const status = getStatus(available, item.owned);
                const s = STATUS_STYLES[status];
                const hasOwned = item.owned > 0;

                return (
                  <tr key={item.partNo}
                    className={`border-b border-zinc-900 transition-colors hover:bg-zinc-900/40 ${!hasOwned ? "opacity-40" : ""}`}>
                    {/* Part No — sticky */}
                    <td className="sticky left-0 z-10 bg-[#080604] border-r border-zinc-900 px-3 py-2 font-mono text-[10px] text-orange-400">
                      {item.partNo}
                    </td>
                    {/* Description — sticky */}
                    <td className="sticky left-[84px] z-10 bg-[#080604] border-r border-zinc-900 px-3 py-2 uppercase tracking-[0.02em] text-zinc-400">
                      {item.description}
                    </td>
                    {/* Owned */}
                    <td className="border-r border-zinc-900 px-3 py-2 text-right font-mono text-zinc-300">
                      {hasOwned ? item.owned.toLocaleString() : "—"}
                    </td>
                    {/* Per-project allocations */}
                    {item.allocations.map((alloc) => (
                      <td key={alloc.projectId} className="border-r border-zinc-900 px-3 py-2 text-right font-mono text-zinc-500">
                        {alloc.qty > 0 ? (
                          <span className="text-orange-300/80">{alloc.qty.toLocaleString()}</span>
                        ) : "—"}
                      </td>
                    ))}
                    {/* Available — color glow */}
                    <td className={`px-3 py-2 text-right font-mono font-bold rounded-r-sm ${hasOwned ? `${s.cell} ${s.text} ${s.glow}` : "text-zinc-700"}`}>
                      {hasOwned ? (
                        <span className="flex items-center justify-end gap-1.5">
                          {available < 0 ? available.toLocaleString() : available.toLocaleString()}
                          <span className="text-[8px] font-bold opacity-70">{s.label}</span>
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals footer */}
            <tfoot>
              <tr className="bg-zinc-950 border-t border-zinc-700">
                <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500" colSpan={2}>
                  Totals
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-zinc-300 border-r border-zinc-800">
                  {items.reduce((s, i) => s + i.owned, 0).toLocaleString()}
                </td>
                {projects.map((p) => (
                  <td key={p.projectId} className="px-3 py-3 text-right font-mono font-bold text-orange-300/70 border-r border-zinc-800">
                    {items.reduce((s, i) => s + (i.allocations.find(a => a.projectId === p.projectId)?.qty ?? 0), 0).toLocaleString()}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-mono font-bold text-emerald-300">
                  {items.reduce((s, i) => {
                    const alloc = i.allocations.reduce((a, b) => a + b.qty, 0);
                    return s + (i.owned - alloc);
                  }, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </section>
    </main>
  );
}
