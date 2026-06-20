"use client";

import { useEffect, useMemo, useState } from "react";
import { KorbanHeader, KorbanPanel, type KorbanMenuLink } from "@/components/korban";
import { getActiveElevation, getActiveProject, type ProjectElevation } from "@/lib/projectStore";

type InventoryRow = {
  partNo: string;
  description: string;
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

// Maps the quantity engine's calculated counts onto specific real catalog
// part numbers. This is the connection that closes the loop — instead of
// reading from an orphaned localStorage key nothing writes to, quantities
// come directly from the same live takeoff data Estimate Review uses.
//
// The mapping picks one representative part per category (the most common
// size/spec) since the quantity engine calculates totals, not size
// breakdowns. As Frame Configuration (Phase 2) comes online, this can
// become more granular.
const QUANTITY_ENGINE_PART_MAP: Record<string, keyof ProjectElevation["quantityEngine"]> = {
  FO6L: "frameCount",
  WP8: "plankCount",
  B82: "crossBraceCount",
  GR8: "guardrailCount",
  BP1: "basePlateCount",
  AL1: "screwJackCount",
};

const inventoryMenuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

function normalizePart(partNo: string) {
  return partNo.trim().toUpperCase();
}

export default function InventoryLoadListPage() {
  const [elevation, setElevation] = useState<ProjectElevation | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");

  useEffect(() => {
    function loadLiveData() {
      const project = getActiveProject();
      const activeElevation = getActiveElevation();
      setProjectName(project.projectName || "Untitled Project");
      setProjectAddress(project.projectAddress || "—");
      setElevation(activeElevation);
    }

    loadLiveData();
    window.addEventListener("focus", loadLiveData);
    window.addEventListener("pageshow", loadLiveData);
    return () => {
      window.removeEventListener("focus", loadLiveData);
      window.removeEventListener("pageshow", loadLiveData);
    };
  }, []);

  const quantityEngine = elevation?.quantityEngine;

  // Builds the qty map by reading directly from the live quantity engine,
  // via the part-number mapping above — this replaces the old
  // localStorage-based qtyMap entirely.
  const qtyMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!quantityEngine) return map;

    Object.entries(QUANTITY_ENGINE_PART_MAP).forEach(([partNo, field]) => {
      const value = quantityEngine[field];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        map.set(normalizePart(partNo), value);
      }
    });

    return map;
  }, [quantityEngine]);

  const totalQtyRequired = useMemo(() => {
    return Array.from(qtyMap.values()).reduce((sum, qty) => sum + qty, 0);
  }, [qtyMap]);

  const totalPlankCount = quantityEngine?.plankCount ?? 0;

  const truckLoads = useMemo(() => {
    if (!totalPlankCount) return 0;
    return Math.ceil(totalPlankCount / 150);
  }, [totalPlankCount]);

  const hasLiveData = Boolean(elevation?.linearFeet && elevation.linearFeet > 0);

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <KorbanHeader
        title="Inventory Load List"
        subtitle="Material list driven by live takeoff quantities"
        menuLinks={inventoryMenuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <a
              href="/project-plan-desk"
              className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
            >
              Back to Plan Desk
            </a>
            <button className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400">
              Export Load List
            </button>
          </>
        }
      />

      <section className="p-6">
        {!hasLiveData && (
          <div className="mb-5 rounded-2xl border border-dashed border-zinc-800 bg-black/40 p-4 text-center">
            <p className="text-xs text-zinc-500">
              No live takeoff data yet for this project. Run a takeoff in Takeoff Workspace to populate real quantities here.
            </p>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-[1.25fr_1.25fr_.55fr_.55fr_.55fr_.8fr_.9fr]">
          <SummaryCard label="Project" value={projectName || "Not entered"} />
          <SummaryCard label="Project Address" value={projectAddress || "Not entered"} />
          <SummaryCard label="Width" value={elevation?.scaffoldInput.scaffoldWidth ? `${elevation.scaffoldInput.scaffoldWidth}'` : "Not set"} compact />
          <SummaryCard label="LF" value={(elevation?.linearFeet || 0).toFixed(1)} compact />
          <SummaryCard label="Bay" value={String(quantityEngine?.bayCount || 0)} compact />
          <SummaryCard label="Truck Loads" value={String(truckLoads)} highlight />
          <SummaryCard label="Qty Required" value={String(totalQtyRequired)} highlight />
        </div>

        <KorbanPanel
          title="Load List / Inventory Tracking"
          subtitle="Part numbers and descriptions follow the scaffold yard inventory format. Quantities read live from Takeoff Workspace."
        >
          <div className="grid gap-4 xl:grid-cols-3">
            {catalogGroups.map((group, index) => (
              <InventoryColumn key={index} rows={group} qtyMap={qtyMap} />
            ))}
          </div>
        </KorbanPanel>
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
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
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
