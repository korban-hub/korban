"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanHeaderMeta,
  type KorbanMenuLink,
} from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
  saveActiveElevation,
  type ProjectElevation,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

// ── Frame catalog ─────────────────────────────────────────────────────────────
// Grouped by scaffold width family. Frame Configuration only uses frames
// matching the scaffold width selected in Set Scaffold.

type FrameWidth = "3'" | "3'-6\"" | "5'";

type FrameSize = {
  code: string;
  heightFt: number;   // decimal feet
  widthLabel: string;
  family: FrameWidth;
  isTall: boolean;    // standard tall frame (6'-4")
  isMason: boolean;   // mason frame
};

const FRAME_CATALOG: FrameSize[] = [
  // 3' wide family
  { code: "FO6L3",  heightFt: 6 + 4/12, widthLabel: "3'",   family: "3'",     isTall: true,  isMason: false },
  { code: "FO5L3",  heightFt: 5,         widthLabel: "3'",   family: "3'",     isTall: false, isMason: false },
  { code: "FM33",   heightFt: 3,         widthLabel: "3'",   family: "3'",     isTall: false, isMason: false },
  // 42" wide family
  { code: "FO6L42", heightFt: 6 + 4/12, widthLabel: "42\"", family: "3'-6\"", isTall: true,  isMason: false },
  { code: "FO5L42", heightFt: 5,         widthLabel: "42\"", family: "3'-6\"", isTall: false, isMason: false },
  { code: "FM342",  heightFt: 3,         widthLabel: "42\"", family: "3'-6\"", isTall: false, isMason: false },
  // 5' wide family
  { code: "FO6L",   heightFt: 6 + 4/12, widthLabel: "5'",   family: "5'",     isTall: true,  isMason: false },
  { code: "FM5",    heightFt: 5,         widthLabel: "5'",   family: "5'",     isTall: false, isMason: true  },
  { code: "FM3",    heightFt: 3,         widthLabel: "5'",   family: "5'",     isTall: false, isMason: true  },
  // 2' wide family
  { code: "FO6L2",  heightFt: 6 + 4/12, widthLabel: "2'",   family: "3'",     isTall: true,  isMason: false },
  { code: "FO5L2",  heightFt: 5,         widthLabel: "2'",   family: "3'",     isTall: false, isMason: false },
  { code: "FM32",   heightFt: 3,         widthLabel: "2'",   family: "3'",     isTall: false, isMason: false },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type FrameLevel = {
  frameCode: string;
  heightFt: number;
  position: number; // distance from grade in feet
  isTall: boolean;
};

type FrameConfiguration = {
  option: "A" | "B" | "C";
  label: string;
  recommended: boolean;
  levels: FrameLevel[];      // bottom to top
  screwJackExtensionIn: number; // inches
  totalHeightFt: number;
  targetHeightFt: number;
  gapFt: number;             // totalHeight - targetHeight (positive = above wall)
  tallCount: number;
  fiveCount: number;
  threeCount: number;
  frameSummary: string;
};

type BracketCondition = {
  levelIndex: number;   // which frame level (0 = bottom)
  deviationIn: number;  // wall deviation in inches at this level
  bracketSizeIn: 10 | 20 | 30;
  direction: "in" | "out"; // bracket extends toward or away from wall
};

const frameConfigMenuLinks: KorbanMenuLink[] = [
  { href: "/set-scaffold", label: "Set Scaffold" },
  { href: "/section-view", label: "Section View" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFt(decimalFeet: number) {
  const safe = Math.max(0, decimalFeet);
  let feet = Math.floor(safe);
  let inches = Math.round((safe - feet) * 12);
  if (inches === 12) { feet += 1; inches = 0; }
  return `${feet}'-${inches}"`;
}

function formatScaffoldWidth(value: number): FrameWidth {
  if (value >= 5) return "5'";
  if (value >= 3.5) return "3'-6\"";
  return "3'";
}

function parseFeetInches(input: string): number | null {
  const value = input.trim();
  if (!value || value === "--" || value === "0'") return null;
  const normalized = value.toLowerCase().replace(/feet|foot|ft/g, "'").replace(/inches|inch|in/g, '"').replace(/\s+/g, "").replace(/[–—]/g, "-");
  const m = normalized.match(/^(-?\d+(?:\.\d+)?)'(?:-?(\d+(?:\.\d+)?))?(?:")?$/);
  if (m) {
    const feet = Number(m[1]); const inches = Number(m[2] || 0);
    if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
    return feet + inches / 12;
  }
  const plain = Number(normalized.replace(/"/g, ""));
  return Number.isNaN(plain) || plain === 0 ? null : plain;
}

/**
 * Core stack algorithm — Rule Set v3.0
 *
 * Stacking order: shortest at bottom, tallest at top
 *   GRADE → screw jack → [3' frame?] → [5' frame?] → [6'-4" frames × N] → top
 *
 * Algorithm:
 *   1. Calculate target = wallHeight - workerReachHeight
 *   2. Maximize 6'-4" frames
 *   3. Try base combinations: none / 3' / 5' / 3'+5'
 *   4. Cover remainder with screw jack (≤ screwJackMaxIn / 12)
 *   5. If no solution, adjust tall count ±1 and retry
 */
function calculateStack(
  targetFt: number,
  tallFrameHeightFt: number,
  screwJackMaxIn: number,
  offsetVariant: number = 0, // -1, 0, +1 for options B/A/C
): { levels: FrameLevel[]; screwJackIn: number; totalFt: number } | null {
  const screwJackMaxFt = screwJackMaxIn / 12;
  const baseCombos: Array<{ threeH: boolean; fiveH: boolean }> = [
    { threeH: false, fiveH: false },
    { threeH: true,  fiveH: false },
    { threeH: false, fiveH: true  },
    { threeH: true,  fiveH: true  },
  ];

  for (const combo of baseCombos) {
    const baseHeight = (combo.threeH ? 3 : 0) + (combo.fiveH ? 5 : 0);
    const remainingAfterBase = targetFt - baseHeight;
    if (remainingAfterBase < 0) continue;

    let tallCount = Math.floor(remainingAfterBase / tallFrameHeightFt) + offsetVariant;
    if (tallCount < 0) continue;

    const stackedHeight = tallCount * tallFrameHeightFt + baseHeight;
    const remainder = targetFt - stackedHeight;

    if (remainder >= 0 && remainder <= screwJackMaxFt) {
      // Valid solution found
      const levels: FrameLevel[] = [];
      let pos = 0;

      // Bottom up: 3' first, then 5', then tall frames
      if (combo.threeH) {
        levels.push({ frameCode: "FM", heightFt: 3, position: pos, isTall: false });
        pos += 3;
      }
      if (combo.fiveH) {
        levels.push({ frameCode: "FO5", heightFt: 5, position: pos, isTall: false });
        pos += 5;
      }
      for (let i = 0; i < tallCount; i++) {
        levels.push({ frameCode: "FO6", heightFt: tallFrameHeightFt, position: pos, isTall: true });
        pos += tallFrameHeightFt;
      }

      return {
        levels,
        screwJackIn: Math.round(remainder * 12),
        totalFt: stackedHeight + remainder,
      };
    }
  }
  return null;
}

function buildFrameSummary(levels: FrameLevel[], tallFrameHeightFt: number, screwJackIn: number): string {
  const tallCount = levels.filter(l => l.isTall).length;
  const fiveCount = levels.filter(l => !l.isTall && l.heightFt === 5).length;
  const threeCount = levels.filter(l => !l.isTall && l.heightFt === 3).length;
  const parts: string[] = [];
  if (tallCount > 0) parts.push(`${tallCount} × ${formatFt(tallFrameHeightFt)}`);
  if (fiveCount > 0) parts.push(`${fiveCount} × 5'-0"`);
  if (threeCount > 0) parts.push(`${threeCount} × 3'-0"`);
  parts.push(`+ ${screwJackIn}" jack`);
  return parts.join(" + ");
}

function generateThreeOptions(
  wallHeightFt: number,
  workerReachFt: number,
  tallFrameFt: number,
  screwJackMaxIn: number,
): FrameConfiguration[] {
  const targetFt = Math.max(0, wallHeightFt - workerReachFt);
  const configs: FrameConfiguration[] = [];

  const variants: Array<{ variant: number; option: "A" | "B" | "C"; label: string; relaxed: boolean }> = [
    { variant: 0,  option: "A", label: "Optimal",      relaxed: false },
    { variant: -1, option: "B", label: "Conservative", relaxed: true  },
    { variant: 1,  option: "C", label: "Extended",     relaxed: true  },
  ];

  for (const { variant, option, label, relaxed } of variants) {
    // For B and C use a relaxed screw jack max (up to 18") so they always generate
    const jackMax = relaxed ? 18 : screwJackMaxIn;
    const result = calculateStack(targetFt, tallFrameFt, jackMax, variant);
    if (!result) continue;

    const gapFt = result.totalFt - targetFt;
    const tallCount = result.levels.filter(l => l.isTall).length;
    const fiveCount = result.levels.filter(l => !l.isTall && l.heightFt === 5).length;
    const threeCount = result.levels.filter(l => !l.isTall && l.heightFt === 3).length;

    configs.push({
      option,
      label,
      recommended: option === "A",
      levels: result.levels,
      screwJackExtensionIn: result.screwJackIn,
      totalHeightFt: result.totalFt,
      targetHeightFt: targetFt,
      gapFt,
      tallCount,
      fiveCount,
      threeCount,
      frameSummary: buildFrameSummary(result.levels, tallFrameFt, result.screwJackIn),
    });
  }

  // Only deduplicate truly identical option+summary combos
  const seen = new Set<string>();
  return configs.filter(c => {
    const key = `${c.option}-${c.frameSummary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FrameConfigurationPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeElevationData, setActiveElevationData] = useState<ProjectElevation | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("Frame Configuration");
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C">("A");
  const [distanceFromTopInput, setDistanceFromTopInput] = useState("");
  const [useCustomTopDistance, setUseCustomTopDistance] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const backend = getBackendSettings();
  const tallFrameFt = backend.scaffold.frameHeight ?? (6 + 4 / 12);
  const workerReachFt = backend.scaffold.workerReachHeight ?? 6;
  const screwJackMaxIn = backend.scaffold.screwJackMaxExtension ?? 12;

  useEffect(() => {
    const elevation = getActiveElevation();
    const project = getActiveProject();
    setActiveElevationData(elevation);
    setActiveProjectName(project.projectName || "Frame Configuration");
    window.addEventListener("focus", () => {
      setActiveElevationData(getActiveElevation());
    });
  }, []);

  const wallHeightFt = useMemo(() => {
    return activeElevationData?.wallHeight ?? 42;
  }, [activeElevationData]);

  const scaffoldWidthFt = useMemo(() => {
    return activeElevationData?.scaffoldInput?.scaffoldWidth ?? 3;
  }, [activeElevationData]);

  const scaffoldWidthLabel = formatScaffoldWidth(scaffoldWidthFt);

  // If custom top distance is set, recalculate wall height target
  const effectiveWallHeightFt = useMemo(() => {
    if (!useCustomTopDistance) return wallHeightFt;
    const customDist = parseFeetInches(distanceFromTopInput);
    if (customDist === null) return wallHeightFt;
    // User wants top deck at (wallHeight - customDist) from grade
    // so effectiveTarget = wallHeight - customDist + workerReach (to back-calc wall height equiv)
    return wallHeightFt - customDist + workerReachFt;
  }, [wallHeightFt, distanceFromTopInput, useCustomTopDistance, workerReachFt]);

  const configurations = useMemo(() => {
    return generateThreeOptions(effectiveWallHeightFt, workerReachFt, tallFrameFt, screwJackMaxIn);
  }, [effectiveWallHeightFt, workerReachFt, tallFrameFt, screwJackMaxIn]);

  const activeConfig = useMemo(() => {
    return configurations.find(c => c.option === selectedOption) ?? configurations[0];
  }, [configurations, selectedOption]);

  // Frame family for this scaffold width
  const frameFamily = FRAME_CATALOG.filter(f => f.family === scaffoldWidthLabel);

  function saveConfiguration() {
    if (!activeConfig || !activeElevationData) return;
    const updated = {
      ...activeElevationData,
      quantityEngine: {
        ...activeElevationData.quantityEngine,
        frameTall: activeConfig.levels.length,
        frameCount: activeConfig.levels.length * (activeElevationData.quantityEngine.legCount ?? 0),
      },
    };
    saveActiveElevation(updated);
    setActiveElevationData(updated);
    window.location.href = "/section-view";
  }

  const allOptions: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  const optionLabels: Record<string, string> = { A: "Optimal", B: "Conservative", C: "Extended" };
  const totalFrameCount = activeConfig
    ? activeConfig.levels.length * (activeElevationData?.quantityEngine.legCount ?? 0)
    : 0;

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanHeader
        title="Frame Configuration"
        subtitle="Frame makeup and jump count per leg — quantity engine for section view"
        menuLinks={frameConfigMenuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(c => !c)}
        actionsClassName="gap-4"
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={activeProjectName} />
            <KorbanHeaderMeta label="Wall Height" value={formatFt(wallHeightFt)} />
            <KorbanHeaderMeta label="Width" value={scaffoldWidthLabel} />
            {savedFlash && (
              <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
                ✓ Saved
              </span>
            )}
            <KorbanButton as="a" href="/set-scaffold" variant="ghost">Set Scaffold</KorbanButton>
            <KorbanButton variant="primary" onClick={saveConfiguration}>Save & Continue</KorbanButton>
          </>
        }
      />

      <div className="overflow-y-auto h-[calc(100vh-125px)] bg-[#080604] p-6">
        <div className="mx-auto max-w-4xl space-y-5">

          {/* Top row — key numbers */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 shadow-[0_0_20px_rgba(249,115,22,0.07)]">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Total Jumps</p>
              <p className="font-mono text-3xl font-bold text-orange-300">{activeConfig?.levels.length ?? 0}</p>
              <p className="text-[10px] text-zinc-600 mt-1">per leg</p>
            </div>
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 shadow-[0_0_20px_rgba(249,115,22,0.07)]">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Total Frames</p>
              <p className="font-mono text-3xl font-bold text-orange-300">{totalFrameCount.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-600 mt-1">jumps × legs</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black p-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Wall Height</p>
              <p className="font-mono text-2xl font-bold text-zinc-200">{formatFt(wallHeightFt)}</p>
              <p className="text-[10px] text-zinc-600 mt-1">from grade</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black p-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Frame Height</p>
              <p className="font-mono text-2xl font-bold text-zinc-200">{formatFt(activeConfig?.totalHeightFt ?? 0)}</p>
              <p className="text-[10px] text-zinc-600 mt-1">scaffold reach</p>
            </div>
          </div>

          <div className="space-y-5">

            {/* Frame options — full width, stacked below metrics */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">Frame Configuration</h2>
                  <p className="mt-1 text-xs text-zinc-600">Select the frame makeup that fits your site</p>
                </div>
                <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
              </div>

              {configurations.length === 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
                  ⚠ No valid configuration found. Check wall height and screw jack settings in Backend.
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {allOptions.map(option => {
                  const config = configurations.find(c => c.option === option);
                  const isSelected = selectedOption === option;
                  return (
                    <button
                      key={option}
                      onClick={() => config && setSelectedOption(option)}
                      disabled={!config}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        !config
                          ? "border-zinc-800 bg-zinc-950/40 cursor-not-allowed opacity-50"
                          : isSelected
                          ? "border-orange-500/50 bg-orange-500/5 shadow-[0_0_20px_rgba(249,115,22,0.10)]"
                          : "border-zinc-800 bg-black hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md ${
                            isSelected && config ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-400"
                          }`}>{option}</span>
                          <span className="text-xs font-bold text-zinc-200">{optionLabels[option]}</span>
                          {config?.recommended && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5">
                              Recommended
                            </span>
                          )}
                        </div>
                        {config && <span className="font-mono text-sm font-bold text-orange-300">{config.levels.length} jumps</span>}
                      </div>
                      {config ? (
                        <>
                          <p className="font-mono text-[11px] text-zinc-400 mb-3">{config.frameSummary}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <MiniStat label="Reach" value={formatFt(config.totalHeightFt)} />
                            <MiniStat label="Screw Jack" value={`${config.screwJackExtensionIn}"`} accent={config.screwJackExtensionIn > screwJackMaxIn} />
                            <MiniStat label={"6'-4\" Frames"} value={String(config.tallCount)} />
                            <MiniStat label="Short Frames" value={String(config.fiveCount + config.threeCount)} muted={config.fiveCount + config.threeCount === 0} />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-start gap-1 mt-2">
                          <p className="text-[10px] text-zinc-600 font-mono">Not Available</p>
                          <p className="text-[9px] text-zinc-700 leading-4">No valid configuration for this wall height</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Configuration Adjustments + Level Detail + Inventory — 3 columns */}
            <div className="grid grid-cols-3 gap-5">

              {/* Configuration Adjustments */}
              <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">Configuration Adjustments</h2>
                    <p className="mt-1 text-xs text-zinc-600">Override avg. laborer reach to set exact top distance</p>
                  </div>
                  <button
                    onClick={() => setUseCustomTopDistance(c => !c)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      useCustomTopDistance
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                        : "border-zinc-800 bg-black text-zinc-500"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${useCustomTopDistance ? "bg-orange-400" : "bg-zinc-600"}`} />
                    {useCustomTopDistance ? "Custom ON" : "Default"}
                  </button>
                </div>
                {useCustomTopDistance ? (
                  <div>
                    <input
                      value={distanceFromTopInput}
                      onChange={e => setDistanceFromTopInput(e.target.value)}
                      placeholder={`e.g. 2'-6" (default: ${formatFt(workerReachFt)})`}
                      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
                    />
                    <p className="mt-1 text-[10px] text-zinc-600">Frame configuration recalculates automatically.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <InfoChip label="Wall Height" value={formatFt(wallHeightFt)} />
                    <InfoChip label="Avg. Laborer Reach" value={formatFt(workerReachFt)} />
                    <InfoChip label="Avg. Frame Height" value={formatFt(Math.max(0, effectiveWallHeightFt - workerReachFt))} />
                  </div>
                )}
              </div>

              {/* Level Detail */}
              {activeConfig && (
                <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-4">
                  <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400 mb-3">Level Detail</h2>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-yellow-300">Screw Jack</span>
                      <span className="ml-auto font-mono text-[10px] text-yellow-400">{activeConfig.screwJackExtensionIn}"</span>
                    </div>
                    {activeConfig.levels.map((level, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${level.isTall ? "border-orange-500/15 bg-orange-500/5" : "border-zinc-800 bg-zinc-950/70"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${level.isTall ? "bg-orange-400" : "bg-zinc-500"}`} />
                        <span className={`text-[10px] font-bold ${level.isTall ? "text-orange-300" : "text-zinc-400"}`}>{formatFt(level.heightFt)} Frame</span>
                        <span className="ml-auto text-[9px] text-zinc-600">L{i + 1}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-700/30 bg-zinc-900/30 px-3 py-2 border-dashed">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 flex-shrink-0" />
                      <span className="text-[10px] text-zinc-500">Avg. Laborer Reach +{formatFt(workerReachFt)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1.5">
                    <QuantRow label={"6'-4\" Frames"} value={String(activeConfig.tallCount)} />
                    <QuantRow label={"5'-0\" Frames"} value={String(activeConfig.fiveCount)} />
                    <QuantRow label={"3'-0\" Frames"} value={String(activeConfig.threeCount)} />
                    <QuantRow label="Screw Jack" value={`${activeConfig.screwJackExtensionIn}"`} />
                  </div>
                </div>
              )}

              {/* Inventory View — highlight frames in use */}
              <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-4">
                <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400 mb-3">Inventory View</h2>
                <p className="text-[10px] text-zinc-600 mb-3">{scaffoldWidthLabel} width family</p>
                <div className="space-y-1.5">
                  {frameFamily.map(frame => {
                    // Highlight frames actually used in the active config
                    const usedInConfig = activeConfig?.levels.some(l =>
                      Math.abs(l.heightFt - frame.heightFt) < 0.1
                    ) ?? false;
                    return (
                      <div key={frame.code} className={`flex items-center justify-between rounded-lg border px-3 py-2 transition ${
                        usedInConfig
                          ? "border-orange-500/40 bg-orange-500/8 shadow-[0_0_8px_rgba(249,115,22,0.08)]"
                          : "border-zinc-800 bg-black"
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[10px] font-bold ${usedInConfig ? "text-orange-300" : "text-zinc-500"}`}>{frame.code}</span>
                          {usedInConfig && <span className="text-[8px] font-bold text-orange-400 border border-orange-500/30 rounded px-1">IN USE</span>}
                          {frame.isTall && !usedInConfig && <span className="text-[8px] font-bold text-orange-400 border border-orange-500/20 rounded px-1">TALL</span>}
                          {frame.isMason && <span className="text-[8px] font-bold text-zinc-500 border border-zinc-700 rounded px-1">MASON</span>}
                        </div>
                        <span className={`text-[9px] ${usedInConfig ? "text-orange-300" : "text-zinc-500"}`}>{formatFt(frame.heightFt)} × {frame.widthLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-3">
            <a href="/set-scaffold" className="block rounded-xl border border-zinc-800 bg-black px-4 py-3 text-center text-xs font-bold text-zinc-400 hover:border-orange-500/30 hover:text-orange-300">
              ← Back to Set Scaffold
            </a>
            <button onClick={saveConfiguration} className="rounded-xl bg-orange-500 px-4 py-3 text-center text-xs font-bold text-black hover:bg-orange-400">
              Save & Continue to Section View →
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
function ConfigPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.6rem] border border-zinc-800 bg-korban-raised p-4 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
        </div>
        <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
      </div>
      {children}
    </section>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black px-2.5 py-2">
      <p className="text-[8px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
      <p className="font-mono text-xs font-bold text-orange-300">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, accent = false, muted = false }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
      <p className="text-[8px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
      <p className={`font-mono text-xs font-bold ${accent ? "text-red-400" : muted ? "text-zinc-500" : "text-orange-300"}`}>{value}</p>
    </div>
  );
}

function QuantRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 last:border-b-0 last:pb-0">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="font-mono text-[10px] font-bold text-zinc-200">{value}</span>
    </div>
  );
}
