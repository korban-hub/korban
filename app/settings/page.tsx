"use client";
import { KorbanHeader } from "@/components/korban";
import { useEffect, useRef, useState } from "react";
import {
  getSettings,
  saveSettings,
  resetSettings,
  exportSettingsAsJson,
  importSettingsFromJson,
  clearDemoData,
  clearLocalCache,
  type SettingsData,
  type LandingPage,
  type DisplayFormat,
  type DimensionPrecision,
  type GridSize,
  type DefaultZoom,
} from "@/lib/settingsStore";

export default function SettingsPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSettings(getSettings());
    setIsHydrated(true);
  }, []);

  function flashSaved() {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }

  function handleSaveAll() {
    if (!settings) return;
    saveSettings(settings);
    flashSaved();
  }

  function handleResetAll() {
    const confirmed = window.confirm("Reset all preferences to KORBAN defaults?");
    if (!confirmed) return;
    resetSettings();
    setSettings(getSettings());
    flashSaved();
  }

  function handleClearDemoData() {
    const confirmed = window.confirm(
      "Clear demo project data? Your real saved projects and settings are not affected.",
    );
    if (!confirmed) return;
    clearDemoData();
    flashSaved();
  }

  function handleClearLocalCache() {
    const confirmed = window.confirm(
      "Clear ALL local KORBAN data — settings, backend config, and project data? This cannot be undone.",
    );
    if (!confirmed) return;
    clearLocalCache();
    setSettings(getSettings());
    flashSaved();
  }

  function handleExport() {
    const json = exportSettingsAsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "korban-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const success = importSettingsFromJson(text);
      if (success) {
        setSettings(getSettings());
        flashSaved();
      } else {
        window.alert("Couldn't read that settings file. Make sure it's a valid KORBAN settings export.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  if (!isHydrated || !settings) {
    return (
      <main className="min-h-screen bg-[#080604] text-white flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <div className="sticky top-0 z-20">
        <KorbanHeader
          title="Settings"
          subtitle="Display, viewer, and workflow preferences for your KORBAN session."
          actionsAlwaysVisible
          actions={
            <>
              {savedFlash && (
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
                  ✓ Saved
                </span>
              )}
              <button
                onClick={handleResetAll}
                className="rounded-xl border border-zinc-700 bg-black px-5 py-3 text-sm font-bold text-zinc-400 hover:border-red-500/40 hover:text-red-300"
              >
                Reset All
              </button>
              <a
                href="/dashboard"
                className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
              >
                Cancel
              </a>
              <button
                onClick={handleSaveAll}
                className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400"
              >
                Save Settings
              </button>
            </>
          }
        />
      </div>

      <section className="columns-1 gap-5 p-6 lg:columns-2 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
        {/* 1. User Preferences */}
        <SettingsTile title="User Preferences">
          <FieldRow label="Display Name">
            <TextInput
              value={settings.user.displayName}
              onChange={(v) => setSettings({ ...settings, user: { ...settings.user, displayName: v } })}
              placeholder="H. Pierre"
            />
          </FieldRow>
          <FieldRow label="Email">
            <TextInput
              value={settings.user.email}
              onChange={(v) => setSettings({ ...settings, user: { ...settings.user, email: v } })}
              placeholder="estimator@korban.com"
            />
          </FieldRow>
          <FieldRow label="Role">
            <TextInput
              value={settings.user.role}
              onChange={(v) => setSettings({ ...settings, user: { ...settings.user, role: v } })}
              placeholder="Estimator"
            />
          </FieldRow>
          <FieldRow label="Default Landing Page">
            <SelectInput
              value={settings.user.defaultLandingPage}
              options={["Project Dashboard", "Takeoff Workspace", "Set Scaffold", "Section View", "Estimate Review"]}
              onChange={(v) => setSettings({ ...settings, user: { ...settings.user, defaultLandingPage: v as LandingPage } })}
            />
          </FieldRow>
        </SettingsTile>

        {/* 2. Measurement Preferences */}
        <SettingsTile title="Measurement Preferences">
          <FieldRow label="Display Format">
            <RadioGroup
              value={settings.measurement.displayFormat}
              options={["Feet/Inches", "Decimal Feet", "Metric"]}
              onChange={(v) =>
                setSettings({ ...settings, measurement: { ...settings.measurement, displayFormat: v as DisplayFormat } })
              }
            />
          </FieldRow>
          <FieldRow label="Dimension Precision">
            <RadioGroup
              value={settings.measurement.dimensionPrecision}
              options={[`1"`, `1/2"`, `1/4"`]}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  measurement: { ...settings.measurement, dimensionPrecision: v as DimensionPrecision },
                })
              }
            />
          </FieldRow>
          <ToggleField
            label="Show Fractions"
            checked={settings.measurement.showFractions}
            onChange={(v) => setSettings({ ...settings, measurement: { ...settings.measurement, showFractions: v } })}
          />
        </SettingsTile>

        {/* 3. Viewer Preferences */}
        <SettingsTile title="Viewer Preferences">
          <ToggleField
            label="Show Grid"
            checked={settings.viewer.showGrid}
            onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, showGrid: v } })}
          />
          <FieldRow label="Grid Size">
            <RadioGroup
              value={settings.viewer.gridSize}
              options={["1'", "5'", "10'"]}
              onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, gridSize: v as GridSize } })}
            />
          </FieldRow>
          <ToggleField
            label="Show Wall Offset"
            checked={settings.viewer.showWallOffset}
            onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, showWallOffset: v } })}
          />
          <ToggleField
            label="Show Level Labels"
            checked={settings.viewer.showLevelLabels}
            onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, showLevelLabels: v } })}
          />
          <ToggleField
            label="Show Elevation Labels"
            checked={settings.viewer.showElevationLabels}
            onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, showElevationLabels: v } })}
          />
          <ToggleField
            label="Show Measurement Labels"
            checked={settings.viewer.showMeasurementLabels}
            onChange={(v) => setSettings({ ...settings, viewer: { ...settings.viewer, showMeasurementLabels: v } })}
          />
        </SettingsTile>

        {/* 4. Takeoff Preferences */}
        <SettingsTile title="Takeoff Preferences">
          <ToggleField
            label="Auto Save Overlay"
            checked={settings.takeoff.autoSaveOverlay}
            onChange={(v) => setSettings({ ...settings, takeoff: { ...settings.takeoff, autoSaveOverlay: v } })}
          />
          <ToggleField
            label="Confirm Before Clear"
            checked={settings.takeoff.confirmBeforeClear}
            onChange={(v) => setSettings({ ...settings, takeoff: { ...settings.takeoff, confirmBeforeClear: v } })}
          />
          <ToggleField
            label="Show Overlay Labels"
            checked={settings.takeoff.showOverlayLabels}
            onChange={(v) => setSettings({ ...settings, takeoff: { ...settings.takeoff, showOverlayLabels: v } })}
          />
          <ToggleField
            label="Show Previous Levels"
            checked={settings.takeoff.showPreviousLevels}
            onChange={(v) => setSettings({ ...settings, takeoff: { ...settings.takeoff, showPreviousLevels: v } })}
          />
          <ToggleField
            label="Auto Store Elevation"
            checked={settings.takeoff.autoStoreElevation}
            onChange={(v) => setSettings({ ...settings, takeoff: { ...settings.takeoff, autoStoreElevation: v } })}
          />
        </SettingsTile>

        {/* 5. Set Scaffold Preferences */}
        <SettingsTile title="Set Scaffold Preferences">
          <ToggleField
            label="Show Bay Markers"
            checked={settings.setScaffold.showBayMarkers}
            onChange={(v) => setSettings({ ...settings, setScaffold: { ...settings.setScaffold, showBayMarkers: v } })}
          />
          <ToggleField
            label="Show Leg Markers"
            checked={settings.setScaffold.showLegMarkers}
            onChange={(v) => setSettings({ ...settings, setScaffold: { ...settings.setScaffold, showLegMarkers: v } })}
          />
          <ToggleField
            label="Show Corner Legs"
            checked={settings.setScaffold.showCornerLegs}
            onChange={(v) => setSettings({ ...settings, setScaffold: { ...settings.setScaffold, showCornerLegs: v } })}
          />
          <ToggleField
            label="Show Diagonal Braces"
            checked={settings.setScaffold.showDiagonalBraces}
            onChange={(v) =>
              setSettings({ ...settings, setScaffold: { ...settings.setScaffold, showDiagonalBraces: v } })
            }
          />
          <ToggleField
            label="Show Frame Counts"
            checked={settings.setScaffold.showFrameCounts}
            onChange={(v) => setSettings({ ...settings, setScaffold: { ...settings.setScaffold, showFrameCounts: v } })}
          />
          <FieldRow label="Default Zoom">
            <RadioGroup
              value={settings.setScaffold.defaultZoom}
              options={["100%", "125%", "150%"]}
              onChange={(v) =>
                setSettings({ ...settings, setScaffold: { ...settings.setScaffold, defaultZoom: v as DefaultZoom } })
              }
            />
          </FieldRow>
        </SettingsTile>

        {/* 6. Section View Preferences */}
        <SettingsTile title="Section View Preferences">
          <ToggleField
            label="Show Section Labels"
            checked={settings.sectionView.showSectionLabels}
            onChange={(v) =>
              setSettings({ ...settings, sectionView: { ...settings.sectionView, showSectionLabels: v } })
            }
          />
          <ToggleField
            label="Show Frame Makeup"
            checked={settings.sectionView.showFrameMakeup}
            onChange={(v) => setSettings({ ...settings, sectionView: { ...settings.sectionView, showFrameMakeup: v } })}
          />
          <ToggleField
            label="Show Part Quantities"
            checked={settings.sectionView.showPartQuantities}
            onChange={(v) =>
              setSettings({ ...settings, sectionView: { ...settings.sectionView, showPartQuantities: v } })
            }
          />
          <ToggleField
            label="Show Drafting Library"
            checked={settings.sectionView.showDraftingLibrary}
            onChange={(v) =>
              setSettings({ ...settings, sectionView: { ...settings.sectionView, showDraftingLibrary: v } })
            }
          />
          <ToggleField
            label="Show Drawing Tools"
            checked={settings.sectionView.showDrawingTools}
            onChange={(v) =>
              setSettings({ ...settings, sectionView: { ...settings.sectionView, showDrawingTools: v } })
            }
          />
          <ToggleField
            label="Auto Populate Section"
            checked={settings.sectionView.autoPopulateSection}
            onChange={(v) =>
              setSettings({ ...settings, sectionView: { ...settings.sectionView, autoPopulateSection: v } })
            }
          />
        </SettingsTile>

        {/* 7. Estimate Review Preferences */}
        <SettingsTile title="Estimate Review Preferences">
          <ToggleField
            label="Show Revenue Panel"
            checked={settings.estimateReview.showRevenuePanel}
            onChange={(v) =>
              setSettings({ ...settings, estimateReview: { ...settings.estimateReview, showRevenuePanel: v } })
            }
          />
          <ToggleField
            label="Show Labor Panel"
            checked={settings.estimateReview.showLaborPanel}
            onChange={(v) =>
              setSettings({ ...settings, estimateReview: { ...settings.estimateReview, showLaborPanel: v } })
            }
          />
          <ToggleField
            label="Show Internal Review"
            checked={settings.estimateReview.showInternalReview}
            onChange={(v) =>
              setSettings({ ...settings, estimateReview: { ...settings.estimateReview, showInternalReview: v } })
            }
          />
          <ToggleField
            label="Show Alternates"
            checked={settings.estimateReview.showAlternates}
            onChange={(v) =>
              setSettings({ ...settings, estimateReview: { ...settings.estimateReview, showAlternates: v } })
            }
          />
          <ToggleField
            label="Show Breakout Areas"
            checked={settings.estimateReview.showBreakoutAreas}
            onChange={(v) =>
              setSettings({ ...settings, estimateReview: { ...settings.estimateReview, showBreakoutAreas: v } })
            }
          />
        </SettingsTile>

        {/* 8. Appearance — locked, display only */}
        <SettingsTile title="Appearance" subtitle="Locked for MVP — no theme switching yet">
          <FieldRow label="Theme">
            <LockedPill label={settings.appearance.theme} />
          </FieldRow>
          <FieldRow label="Accent Color">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
              <span className="h-4 w-4 rounded-full" style={{ background: settings.appearance.accentColor }} />
              <span className="font-mono text-sm font-bold text-zinc-300">{settings.appearance.accentColor}</span>
              <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-600">Locked</span>
            </div>
          </FieldRow>
          <FieldRow label="Typography">
            <div className="space-y-2">
              <TypeRow label="Page Titles" value={settings.appearance.typography.titles} />
              <TypeRow label="App UI" value={settings.appearance.typography.app} />
              <TypeRow label="Engineering Data" value={settings.appearance.typography.engineering} />
            </div>
          </FieldRow>
        </SettingsTile>

        {/* 9. Data & Storage */}
        <SettingsTile title="Data & Storage" subtitle="Manage local app data">
          <ActionButton label="Export User Settings" onClick={handleExport} />
          <ActionButton label="Import User Settings" onClick={handleImportClick} />
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <ActionButton label="Clear Demo Data" onClick={handleClearDemoData} />
          <ActionButton label="Reset App Preferences" onClick={handleResetAll} />
          <ActionButton label="Clear Local Cache" onClick={handleClearLocalCache} danger />
        </SettingsTile>
      </section>
    </main>
  );
}

// Tile shell

function SettingsTile({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
      <div className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// Field primitives

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/40 placeholder:text-zinc-700"
    />
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/40"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function RadioGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-lg border px-3 py-2 text-[11px] font-bold transition ${
            value === option
              ? "border-orange-500 bg-orange-500 text-black"
              : "border-zinc-800 bg-black text-zinc-500 hover:border-orange-500/40"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * A simple labeled toggle row — this is the workhorse component for this
 * page, since most settings are just on/off switches per the spec.
 */
function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-left transition hover:border-zinc-700"
    >
      <span className="text-xs font-semibold text-zinc-300">{label}</span>
      <span
        className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition ${
          checked ? "border-orange-500 bg-orange-500/30 justify-end" : "border-zinc-700 bg-zinc-900 justify-start"
        }`}
      >
        <span className={`h-3.5 w-3.5 rounded-full ${checked ? "bg-orange-400" : "bg-zinc-600"}`} />
      </span>
    </button>
  );
}

function LockedPill({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-bold text-zinc-300">
        <span className="h-2 w-2 rounded-full bg-orange-500" />
        {label}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-zinc-600">Locked</span>
    </div>
  );
}

function TypeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-xs font-bold text-zinc-300">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-2.5 text-left text-xs font-bold transition ${
        danger
          ? "border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10"
          : "border-zinc-800 bg-black text-zinc-300 hover:border-orange-500/40 hover:text-orange-300"
      }`}
    >
      {label}
    </button>
  );
}
