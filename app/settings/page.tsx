"use client";

import { useEffect, useMemo, useState } from "react";

type FieldType = "select" | "toggle" | "readonly";

type SettingField = {
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
  fields: SettingField[];
};

const STORAGE_KEY = "korban_app_settings_v1";
const SAVED_AT_KEY = "korban_app_settings_saved_at_v1";

const tiles: SettingsTile[] = [
  {
    number: "01",
    title: "Measurement Display",
    description: "Controls how measurements appear throughout KORBAN.",
    fields: [
      {
        key: "measurementType",
        name: "Measurement Type",
        description: "Primary measurement system used in the app.",
        type: "select",
        options: ["Feet & Inches", "Decimal Feet", "Inches Only", "Metric"],
        defaultValue: "Feet & Inches",
      },
      {
        key: "fractionPrecision",
        name: "Fraction Precision",
        description: "Smallest displayed fraction for standard measurements.",
        type: "select",
        options: [`1"`, `1/2"`, `1/4"`, `1/8"`],
        defaultValue: `1/4"`,
      },
      {
        key: "showDecimalEquivalent",
        name: "Show Decimal Equivalent",
        description: "Display decimal feet next to standard measurements.",
        type: "toggle",
        defaultValue: false,
      },
    ],
  },
  {
    number: "02",
    title: "App Workflow",
    description: "Controls how users move through the estimating process.",
    fields: [
      {
        key: "defaultStartPage",
        name: "Default Start Page",
        description: "Page shown first after login.",
        type: "select",
        options: ["Dashboard", "Projects", "Upload PDF", "Settings"],
        defaultValue: "Dashboard",
      },
      {
        key: "guidedMode",
        name: "Guided Mode",
        description: "Walk users step-by-step through the estimate flow.",
        type: "toggle",
        defaultValue: true,
      },
      {
        key: "confirmBeforeReset",
        name: "Confirm Before Reset",
        description: "Ask before clearing project or overlay data.",
        type: "toggle",
        defaultValue: true,
      },
    ],
  },
  {
    number: "03",
    title: "PDF Viewer Options",
    description: "Controls how plan files display inside the workspace.",
    fields: [
      {
        key: "defaultZoom",
        name: "Default Zoom",
        description: "Initial plan zoom level when opening a project.",
        type: "select",
        options: ["Fit Width", "Fit Page", "100%", "Last Used"],
        defaultValue: "Fit Width",
      },
      {
        key: "rememberLastPage",
        name: "Remember Last Page",
        description: "Reopen PDFs on the last viewed page.",
        type: "toggle",
        defaultValue: true,
      },
      {
        key: "showPlanToolbar",
        name: "Show Plan Toolbar",
        description: "Display PDF controls inside the plan viewer.",
        type: "toggle",
        defaultValue: true,
      },
    ],
  },
  {
    number: "04",
    title: "Save Behavior",
    description: "Controls when KORBAN stores app progress.",
    fields: [
      {
        key: "manualSaveMode",
        name: "Manual Save Mode",
        description: "Require users to click save before storing settings.",
        type: "readonly",
        defaultValue: "On",
      },
      {
        key: "autosaveProjects",
        name: "Autosave Projects",
        description: "Automatically save project edits while working.",
        type: "toggle",
        defaultValue: false,
      },
      {
        key: "autosaveInterval",
        name: "Autosave Interval",
        description: "How often autosave runs when enabled.",
        type: "select",
        options: ["30 Seconds", "1 Minute", "5 Minutes"],
        defaultValue: "1 Minute",
      },
    ],
  },
  {
    number: "05",
    title: "Export Options",
    description: "Controls default output formats for estimates and proposals.",
    fields: [
      {
        key: "defaultExportFormat",
        name: "Default Export Format",
        description: "Preferred file type for proposal exports.",
        type: "select",
        options: ["PDF", "Excel", "CSV"],
        defaultValue: "PDF",
      },
      {
        key: "includeMaterialSummary",
        name: "Include Material Summary",
        description: "Add material counts to proposal exports.",
        type: "toggle",
        defaultValue: true,
      },
      {
        key: "includeEstimatorNotes",
        name: "Include Estimator Notes",
        description: "Add internal notes to exported estimate packages.",
        type: "toggle",
        defaultValue: false,
      },
    ],
  },
  {
    number: "06",
    title: "Interface Options",
    description: "Controls general display and interface preferences.",
    fields: [
      {
        key: "theme",
        name: "Theme",
        description: "App appearance preference.",
        type: "select",
        options: ["KORBAN Dark", "Light", "System"],
        defaultValue: "KORBAN Dark",
      },
      {
        key: "compactMode",
        name: "Compact Mode",
        description: "Reduce spacing for smaller screens.",
        type: "toggle",
        defaultValue: false,
      },
      {
        key: "showHelpfulTips",
        name: "Show Helpful Tips",
        description: "Display short guidance notes during workflows.",
        type: "toggle",
        defaultValue: true,
      },
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

export default function SettingsPage() {
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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(180,83,9,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(120,53,15,0.08),transparent_34%)]" />

      <div className="relative mx-auto max-w-[1500px]">
        <header className="sticky top-4 z-20 mb-8 rounded-3xl border border-[#7c4a1f]/50 bg-[#1b1712]/95 p-5 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold tracking-[0.55em] text-[#9a5a22]">
                KORBAN
              </p>
              <h1 className="mt-2 text-3xl font-bold text-neutral-100">
                Settings
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">
                App-level controls for measurement display, workflow behavior, PDF viewing, saving, exporting, and interface preferences.
              </p>
            </div>

            <div className="flex min-w-[280px] flex-col gap-3 rounded-2xl border border-[#30261c] bg-[#120f0b]/70 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#9a5a22]">
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
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#7c4a1f]/60 bg-[#120f0b] text-sm font-bold text-[#a1622a]">
          {tile.number}
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#b66a2c]">{tile.title}</h2>
          <div className="mt-2 h-px w-24 bg-[#8a541f]/40" />
          <p className="mt-3 text-sm leading-5 text-neutral-400">
            {tile.description}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#30261c]">
        <div className="grid grid-cols-[1fr_1.6fr_1fr] border-b border-[#30261c] bg-[#120f0b]/90 text-xs font-bold uppercase tracking-[0.2em] text-[#9a5a22]">
          <div className="p-3">Option</div>
          <div className="border-l border-[#30261c] p-3">Description</div>
          <div className="border-l border-[#30261c] p-3">Selection</div>
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
  field: SettingField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const baseClass =
    "w-full rounded-xl border border-[#3a2b1c] bg-[#18130f] px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-[#9a5a22]";

  if (field.type === "readonly") {
    return (
      <div className="rounded-xl border border-[#3a2b1c] bg-[#15110d] px-3 py-2 text-sm text-neutral-500">
        {String(value)}
      </div>
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
        className={`w-24 rounded-xl border px-3 py-2 text-sm font-bold transition ${
          value
            ? "border-[#ff8a1f] bg-[#ff8a1f] text-black shadow-[0_0_18px_rgba(255,138,31,0.45)]"
            : "border-[#3a2b1c] bg-[#18130f] text-neutral-500"
        }`}
      >
        {value ? "On" : "Off"}
      </button>
    );
  }

  return null;
}