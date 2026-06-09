"use client";

import { useEffect, useMemo, useState } from "react";

type FieldType = "text" | "textarea" | "select" | "toggle" | "readonly" | "file";

type FieldRow = {
  key: string;
  name: string;
  description: string;
  type: FieldType;
  options?: string[];
  defaultValue: string | boolean;
};

type SettingsTile = {
  number: string;
  title: string;
  description: string;
  fields: FieldRow[];
};

const STORAGE_KEY = "korban_estimator_settings_v1";
const SAVED_AT_KEY = "korban_estimator_settings_saved_at_v1";

const tiles: SettingsTile[] = [
  {
    number: "01",
    title: "Project Defaults",
    description: "Default values applied when a new estimate project is created.",
    fields: [
      { key: "companyLogo", name: "Company Logo", description: "Estimator company logo used on proposals and reports.", type: "file", defaultValue: "" },
      { key: "companyName", name: "Company Name", description: "Default company for all projects.", type: "text", defaultValue: "" },
      { key: "companyAddress", name: "Company Address", description: "Used for travel calculations and mobilization planning.", type: "text", defaultValue: "" },
      { key: "estimatorName", name: "Estimator Name", description: "Default estimator assigned to projects.", type: "text", defaultValue: "" },
      { key: "proposalTemplate", name: "Proposal Template", description: "Standard proposal format.", type: "select", options: ["Standard", "Detailed", "Simple"], defaultValue: "Standard" },
      { key: "projectStatus", name: "Project Status", description: "Default project stage.", type: "select", options: ["Takeoff", "Estimate", "Complete"], defaultValue: "Takeoff" },
      { key: "defaultUnits", name: "Default Units", description: "Standard dimensional format.", type: "readonly", defaultValue: "Feet & Inches" },
    ],
  },
  {
    number: "02",
    title: "Level Setup",
    description: "Controls how building levels are created, labeled, and stacked.",
    fields: [
      { key: "levelTypes", name: "Level Types", description: "Available level classifications.", type: "readonly", defaultValue: "Basement / Ground / Level / Roof / Penthouse" },
      { key: "autoNumberLevels", name: "Auto Number Levels", description: "Ground → Level 2 → Level 3.", type: "toggle", defaultValue: true },
      { key: "roofDisplayStyle", name: "Roof Display Style", description: "Controls roof overlay appearance.", type: "select", options: ["Dashed Dark Gray", "Standard"], defaultValue: "Dashed Dark Gray" },
      { key: "elevationOrder", name: "Elevation Order", description: "Level stacking sequence.", type: "readonly", defaultValue: "Bottom to Top" },
    ],
  },
  {
    number: "03",
    title: "Overlay Rules",
    description: "Controls how overlays behave during tracing and perimeter creation.",
    fields: [
      { key: "snapSensitivity", name: "Snap Sensitivity", description: "How aggressively overlay points connect.", type: "select", options: ["Low", "Medium", "High"], defaultValue: "Medium" },
      { key: "autoCloseShape", name: "Auto Close Shape", description: "Connect final point to starting point.", type: "toggle", defaultValue: true },
      { key: "cornerDetection", name: "Corner Detection", description: "Automatically identify corners.", type: "toggle", defaultValue: true },
      { key: "complexSetDetection", name: "Complex Set Detection", description: "Detect setbacks, pop-outs, offsets, gables, and overhangs.", type: "toggle", defaultValue: true },
      { key: "overlayValidation", name: "Overlay Validation", description: "Warn user of open or incomplete overlays.", type: "toggle", defaultValue: true },
    ],
  },
  {
    number: "04",
    title: "Scale Calibration",
    description: "Controls how plan dimensions are converted into real-world measurements.",
    fields: [
      { key: "calibrationMethod", name: "Calibration Method", description: "Scale setup method.", type: "readonly", defaultValue: "Two Point" },
      { key: "minimumCalibrationLength", name: "Minimum Calibration Length", description: "Smallest acceptable scale reference.", type: "text", defaultValue: `10'-0"` },
      { key: "dimensionalFormat", name: "Dimensional Format", description: "Measurement format.", type: "readonly", defaultValue: "Feet & Inches" },
      { key: "precision", name: "Precision", description: "Display precision.", type: "select", options: [`1"`, `1/2"`, `1/4"`], defaultValue: `1"` },
    ],
  },
  {
    number: "05",
    title: "Scaffold System",
    description: "Defines the scaffold system used by the estimator.",
    fields: [
      { key: "bayLength", name: "Bay Length", description: "Standard bay spacing.", type: "text", defaultValue: `10'-0"` },
      { key: "frameHeight", name: "Frame Height", description: "Standard frame height.", type: "text", defaultValue: `6'-4"` },
      { key: "scaffoldWidth", name: "Scaffold Width", description: "Standard scaffold width.", type: "select", options: [`3'`, `3'-6"`, `5'`], defaultValue: `5'` },
      { key: "wallOffset", name: "Wall Offset", description: "Distance from structure.", type: "text", defaultValue: `5'-0"` },
      { key: "topOffset", name: "Top Offset", description: "Distance below top of structure.", type: "text", defaultValue: `5'-0"` },
    ],
  },
  {
    number: "06",
    title: "Bay Calculation Rules",
    description: "Controls how measured perimeter converts into scaffold bays.",
    fields: [
      { key: "bayFormula", name: "Bay Formula", description: "Perimeter ÷ Bay Length.", type: "readonly", defaultValue: "Perimeter ÷ Bay Length" },
      { key: "bayRoundRule", name: "Round Rule", description: "How partial bay lengths are handled.", type: "select", options: ["Round Up", "Round Down", "Nearest"], defaultValue: "Round Up" },
      { key: "minimumBay", name: "Minimum Bay", description: "Smallest allowable scaffold bay.", type: "text", defaultValue: `5'-0"` },
      { key: "partialBayRule", name: "Partial Bay Rule", description: "How leftover distance is reported.", type: "select", options: ["Extra Bay", "Filler", "Manual Review"], defaultValue: "Extra Bay" },
    ],
  },
  {
    number: "07",
    title: "Leg Calculation Rules",
    description: "Controls how scaffold legs are generated from bay counts.",
    fields: [
      { key: "legFormula", name: "Leg Formula", description: "Default relationship between bays and legs.", type: "readonly", defaultValue: "Bays = Legs" },
      { key: "extraLegRule", name: "Extra Leg Rule", description: "Add one leg only after the first full bay.", type: "toggle", defaultValue: true },
      { key: "cornerLegs", name: "Corner Legs", description: "Add support at corners and returns.", type: "toggle", defaultValue: true },
      { key: "endLegRule", name: "End Leg Rule", description: "Controls how scaffold runs terminate.", type: "select", options: ["Standard", "Custom"], defaultValue: "Standard" },
    ],
  },
  {
    number: "08",
    title: "Jump Calculation Rules",
    description: "Controls vertical scaffold calculations.",
    fields: [
      { key: "jumpFormula", name: "Jump Formula", description: "Working height ÷ Frame Height.", type: "readonly", defaultValue: "Working Height ÷ Frame Height" },
      { key: "roundUpThreshold", name: "Round Up Threshold", description: "Remaining height that triggers another jump.", type: "text", defaultValue: `6"` },
      { key: "autoAddTopJump", name: "Auto Add Top Jump", description: "Automatically add final working level.", type: "toggle", defaultValue: true },
      { key: "roofHandling", name: "Roof Handling", description: "Controls whether roof level affects jumps.", type: "select", options: ["Include", "Exclude", "Manual"], defaultValue: "Manual" },
    ],
  },
  {
    number: "09",
    title: "Material Rules",
    description: "Determines how quantities are generated from scaffold geometry.",
    fields: [
      { key: "framesFormula", name: "Frames Formula", description: "Legs × Jumps.", type: "readonly", defaultValue: "Legs × Jumps" },
      { key: "plankFormula", name: "Plank Formula", description: "Based on scaffold width, bays, and deck rules.", type: "readonly", defaultValue: "Width + Bays + Deck Rule" },
      { key: "guardrailFormula", name: "Guardrail Formula", description: "Generated by exposed scaffold levels.", type: "readonly", defaultValue: "Per Exposed Level" },
      { key: "toeBoardFormula", name: "Toe Board Formula", description: "Generated per deck where required.", type: "readonly", defaultValue: "Per Required Deck" },
      { key: "bracketFormula", name: "Bracket Formula", description: "Controls bracket counting.", type: "select", options: ["Manual", "Auto"], defaultValue: "Manual" },
    ],
  },
  {
    number: "10",
    title: "Add / Alternate Items",
    description: "Optional scope items available during estimate creation.",
    fields: [
      { key: "toeBoardsDefault", name: "Toe Boards", description: "Include as default alternate.", type: "toggle", defaultValue: false },
      { key: "nettingDefault", name: "Netting", description: "Include as default alternate.", type: "toggle", defaultValue: false },
      { key: "stairTowersDefault", name: "Stair Towers", description: "Include as default alternate.", type: "toggle", defaultValue: false },
      { key: "pedestrianCanopyDefault", name: "Pedestrian Canopy", description: "Include as default alternate.", type: "toggle", defaultValue: false },
      { key: "breakoutAreasDefault", name: "Breakout Areas", description: "Allow area-based scope breakouts.", type: "toggle", defaultValue: true },
    ],
  },
  {
    number: "11",
    title: "Inventory",
    description: "Tracks company-owned scaffold equipment and availability.",
    fields: [
      { key: "frameInventory", name: "Frame Inventory", description: "Total available frames.", type: "text", defaultValue: "" },
      { key: "plankInventory", name: "Plank Inventory", description: "Total available planks.", type: "text", defaultValue: "" },
      { key: "guardrailInventory", name: "Guardrails", description: "Total available guardrails.", type: "text", defaultValue: "" },
      { key: "bracketInventory", name: "Brackets", description: "Total available brackets.", type: "text", defaultValue: "" },
      { key: "specialtyItems", name: "Specialty Items", description: "User-defined inventory items.", type: "textarea", defaultValue: "" },
    ],
  },
  {
    number: "12",
    title: "Proposal Settings",
    description: "Controls how final estimate proposals are written.",
    fields: [
      { key: "clientLogo", name: "Bidding Company Logo", description: "Logo for the company or client the estimator is bidding to.", type: "file", defaultValue: "" },
      { key: "proposalIntro", name: "Proposal Intro", description: "Standard opening language.", type: "textarea", defaultValue: "" },
      { key: "scopeTemplate", name: "Scope Template", description: "Standard scaffold scope wording.", type: "textarea", defaultValue: "" },
      { key: "exclusions", name: "Exclusions", description: "Standard exclusions.", type: "textarea", defaultValue: "" },
      { key: "terms", name: "Terms & Conditions", description: "Standard terms.", type: "textarea", defaultValue: "" },
    ],
  },
];

const defaultSettings = tiles.reduce<Record<string, string | boolean>>((acc, tile) => {
  tile.fields.forEach((field) => {
    acc[field.key] = field.defaultValue;
  });
  return acc;
}, {});

function formatSavedAt(value: string | null) {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function BackendPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Unsaved changes are kept on this screen until you save.");

  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY);
    const savedTime = localStorage.getItem(SAVED_AT_KEY);

    if (savedSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
      } catch {
        setSettings(defaultSettings);
      }
    }

    if (savedTime) setSavedAt(savedTime);
  }, []);

  const savedAtLabel = useMemo(() => formatSavedAt(savedAt), [savedAt]);

  function updateSetting(key: string, value: string | boolean) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
    setStatusMessage("Unsaved changes");
  }

  function saveSettings() {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(SAVED_AT_KEY, now);
    setSavedAt(now);
    setStatusMessage("Settings saved");
  }

  function resetDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAVED_AT_KEY);
    setSettings(defaultSettings);
    setSavedAt(null);
    setStatusMessage("Defaults restored. Click Save Settings to keep them.");
  }

  return (
    <main className="min-h-screen bg-[#14110d] px-6 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,138,31,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(180,83,9,0.2),transparent_36%)]" />

      <div className="relative mx-auto max-w-[1600px]">
        <header className="sticky top-4 z-20 mb-8 rounded-3xl border border-[#7c4a1f]/50 bg-[#1b1712]/95 p-5 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold tracking-[0.55em] text-[#ff8a1f] drop-shadow-[0_0_10px_rgba(255,138,31,0.45)]">
                KORBAN
              </p>
              <h1 className="mt-2 text-3xl font-bold text-neutral-100">
                Backend
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">
                Estimator preferences, scaffold constants, calculation behavior, inventory defaults, and proposal logic.
              </p>
            </div>

            <div className="flex min-w-[280px] flex-col gap-3 rounded-2xl border border-[#30261c] bg-[#120f0b]/70 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#ff8a1f] drop-shadow-[0_0_8px_rgba(255,138,31,0.35)]">
                  Last Saved
                </p>
                <p className="mt-1 text-sm text-neutral-300">{savedAtLabel}</p>
                <p className="mt-1 text-xs text-neutral-500">{statusMessage}</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveSettings}
                  className="rounded-xl border border-[#ff8a1f] bg-[#ff8a1f] px-4 py-2 text-sm font-bold text-black shadow-[0_0_18px_rgba(255,138,31,0.35)] transition hover:shadow-[0_0_24px_rgba(255,138,31,0.55)]"
                >
                  Save Settings
                </button>

                <button
                  type="button"
                  onClick={resetDefaults}
                  className="rounded-xl border border-[#3a2b1c] bg-[#18130f] px-4 py-2 text-sm font-bold text-neutral-400 transition hover:border-[#7c4a1f] hover:text-neutral-200"
                >
                  Reset Defaults
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {tiles.map((tile) => (
            <SettingsTile
              key={tile.number}
              tile={tile}
              settings={settings}
              updateSetting={updateSetting}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function SettingsTile({
  tile,
  settings,
  updateSetting,
}: {
  tile: SettingsTile;
  settings: Record<string, string | boolean>;
  updateSetting: (key: string, value: string | boolean) => void;
}) {
  return (
    <section className="rounded-3xl border border-[#3a2b1c] bg-[#1a1611]/95 p-5 shadow-2xl">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ff8a1f]/80 bg-[#120f0b] text-sm font-bold text-[#ff8a1f] shadow-[0_0_18px_rgba(255,138,31,0.28)]">
          {tile.number}
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ff8a1f] drop-shadow-[0_0_10px_rgba(255,138,31,0.35)]">
            {tile.title}
          </h2>
          <div className="mt-2 h-px w-24 bg-[#ff8a1f]/50 shadow-[0_0_10px_rgba(255,138,31,0.35)]" />
          <p className="mt-3 text-sm leading-5 text-neutral-400">{tile.description}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#30261c]">
        <div className="grid grid-cols-[1fr_1.6fr_1fr] border-b border-[#30261c] bg-[#120f0b]/90 text-xs font-bold uppercase tracking-[0.2em] text-[#c8752f]">
          <div className="p-3">Field Name</div>
          <div className="border-l border-[#30261c] p-3">Description / Formula</div>
          <div className="border-l border-[#30261c] p-3">Input / Options</div>
        </div>

        {tile.fields.map((field) => (
          <div
            key={`${tile.number}-${field.key}`}
            className="grid grid-cols-[1fr_1.6fr_1fr] border-b border-[#2a2118] last:border-b-0"
          >
            <div className="bg-[#18130f] p-3 text-sm font-semibold text-neutral-100">
              {field.name}
            </div>

            <div className="border-l border-[#2a2118] bg-[#1a1611] p-3 text-sm leading-5 text-neutral-400">
              {field.description}
            </div>

            <div className="border-l border-[#2a2118] bg-[#18130f] p-3 text-sm text-neutral-300">
              <FieldInput
                field={field}
                value={settings[field.key]}
                onChange={(value) => updateSetting(field.key, value)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldRow;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const baseClass =
    "w-full rounded-xl border border-[#3a2b1c] bg-[#18130f] px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-[#ff8a1f]";

  if (field.type === "readonly") {
    return (
      <div className="rounded-xl border border-[#3a2b1c] bg-[#15110d] px-3 py-2 text-sm text-neutral-500">
        {String(value)}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <label className="block w-full cursor-pointer rounded-xl border border-dashed border-[#4a3724] bg-[#15110d] px-3 py-2 text-sm text-neutral-400 transition hover:border-[#ff8a1f]/70 hover:text-neutral-200">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            onChange(file ? file.name : "");
          }}
        />
        {value ? String(value) : "Upload Image"}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        className={`${baseClass} min-h-20 resize-y`}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className={baseClass}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {field.options?.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }

  if (field.type === "toggle") {
    return (
      <button
        type="button"
        onClick={() => onChange(!Boolean(value))}
        className={`w-full rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] transition ${
          value
            ? "border-[#ff8a1f] bg-[#ff8a1f] text-black shadow-[0_0_16px_rgba(255,138,31,0.42)]"
            : "border-[#3a2b1c] bg-[#18130f] text-neutral-500"
        }`}
      >
        {value ? "On" : "Off"}
      </button>
    );
  }

  return (
    <input
      className={baseClass}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}