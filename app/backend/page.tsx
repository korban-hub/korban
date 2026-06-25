"use client";
import { KorbanHeader } from "@/components/korban";
import { useEffect, useState } from "react";
import {
  getBackendSettings,
  saveBackendSection,
  resetBackendSettings,
  type CompanySettings,
  type ScaffoldDefaults,
  type MaterialDefaults,
  type MaterialItem,
  type LaborDefaults,
  type PricingDefaults,
  type ProposalDefaults,
  type AddAlternateDefault,
} from "@/lib/backendStore";

export default function BackendPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldDefaults | null>(null);
  const [material, setMaterial] = useState<MaterialDefaults | null>(null);
  const [labor, setLabor] = useState<LaborDefaults | null>(null);
  const [pricing, setPricing] = useState<PricingDefaults | null>(null);
  const [proposal, setProposal] = useState<ProposalDefaults | null>(null);

  useEffect(() => {
    const settings = getBackendSettings();
    setCompany(settings.company);
    setScaffold(settings.scaffold);
    setMaterial(settings.material);
    setLabor(settings.labor);
    setPricing(settings.pricing);
    setProposal(settings.proposal);
    setIsHydrated(true);
  }, []);

  function flashSaved(label: string) {
    setSavedFlash(label);
    window.setTimeout(() => setSavedFlash(null), 1800);
  }

  function handleSaveCompany() { if (!company) return; saveBackendSection("company", company); flashSaved("Company Setup"); }
  function handleSaveScaffold() { if (!scaffold) return; saveBackendSection("scaffold", scaffold); flashSaved("Scaffold Defaults"); }
  function handleSaveMaterial() { if (!material) return; saveBackendSection("material", material); flashSaved("Frame / Material Defaults"); }
  function handleSaveLabor() { if (!labor) return; saveBackendSection("labor", labor); flashSaved("Labor Defaults"); }
  function handleSavePricing() { if (!pricing) return; saveBackendSection("pricing", pricing); flashSaved("Pricing / Rental Defaults"); }
  function handleSaveProposal() { if (!proposal) return; saveBackendSection("proposal", proposal); flashSaved("Proposal Defaults"); }

  function handleResetAll() {
    const confirmed = window.confirm("Reset ALL backend settings to KORBAN defaults? This cannot be undone.");
    if (!confirmed) return;
    resetBackendSettings();
    const settings = getBackendSettings();
    setCompany(settings.company);
    setScaffold(settings.scaffold);
    setMaterial(settings.material);
    setLabor(settings.labor);
    setPricing(settings.pricing);
    setProposal(settings.proposal);
    flashSaved("All Settings Reset");
  }

  if (!isHydrated || !company || !scaffold || !material || !labor || !pricing || !proposal) {
    return (
      <main className="min-h-screen bg-[#080604] text-white flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading backend settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <div className="sticky top-0 z-20">
        <KorbanHeader
          title="Backend"
          subtitle="Estimator control center — company, scaffold, material, labor, pricing, and proposal defaults."
          actionsAlwaysVisible
          actions={
            <>
              {savedFlash && (
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
                  ✓ {savedFlash} saved
                </span>
              )}
              <button onClick={handleResetAll} className="rounded-xl border border-zinc-700 bg-black px-5 py-3 text-sm font-bold text-zinc-400 hover:border-red-500/40 hover:text-red-300">
                Reset All
              </button>
              <a href="/dashboard" className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400">
                Done
              </a>
            </>
          }
        />
        <div className="border-b border-zinc-900 bg-[#0b0b0b] px-6 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
            These defaults feed{" "}
            <span className="text-orange-400 font-bold normal-case tracking-normal">Takeoff Workspace</span>,{" "}
            <span className="text-orange-400 font-bold normal-case tracking-normal">Set Scaffold</span>,{" "}
            <span className="text-orange-400 font-bold normal-case tracking-normal">Frame Configuration</span>,{" "}
            <span className="text-orange-400 font-bold normal-case tracking-normal">Estimate Review</span>, and{" "}
            <span className="text-orange-400 font-bold normal-case tracking-normal">Proposal</span> automatically.
          </p>
        </div>
      </div>

      <section className="columns-1 gap-5 p-6 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">

        {/* 1. Company Setup */}
        <BackendTile title="Company Setup" subtitle="Feeds proposal header, travel, and contact info" onSave={handleSaveCompany}>
          <FieldRow label="Company Name">
            <TextInput value={company.companyName} onChange={(v) => setCompany({ ...company, companyName: v })} placeholder="KORBAN Scaffold & Supply" />
          </FieldRow>
          <FieldRow label="Company Address">
            <TextInput value={company.companyAddress} onChange={(v) => setCompany({ ...company, companyAddress: v })} placeholder="123 Industrial Way, Vallejo, CA" />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Phone">
              <TextInput value={company.companyPhone} onChange={(v) => setCompany({ ...company, companyPhone: v })} placeholder="(510) 555-0100" />
            </FieldRow>
            <FieldRow label="Email">
              <TextInput value={company.companyEmail} onChange={(v) => setCompany({ ...company, companyEmail: v })} placeholder="estimating@korban.com" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="License / Contractor No.">
              <TextInput value={company.licenseNumber} onChange={(v) => setCompany({ ...company, licenseNumber: v })} placeholder="CSLB #000000" />
            </FieldRow>
            <FieldRow label="Union / Non-Union Default">
              <SegmentedControl value={company.unionDefault} options={["Union", "Non-Union"]} onChange={(v) => setCompany({ ...company, unionDefault: v as "Union" | "Non-Union" })} />
            </FieldRow>
          </div>
          <FieldRow label="Main Office Location">
            <TextInput value={company.mainOfficeLocation} onChange={(v) => setCompany({ ...company, mainOfficeLocation: v })} placeholder="Vallejo, CA" />
          </FieldRow>
          <FieldRow label="Travel Start Address" hint="Used for travel time / mobilization calculations">
            <TextInput value={company.travelStartAddress} onChange={(v) => setCompany({ ...company, travelStartAddress: v })} placeholder="Same as main office, or yard address" />
          </FieldRow>
        </BackendTile>

        {/* 2. Scaffold Defaults */}
        <BackendTile title="Scaffold Defaults" subtitle="Feeds Set Scaffold, Frame Configuration, and the quantity engine" onSave={handleSaveScaffold}>
          <FieldRow label="Scaffold Type">
            <TextInput value={scaffold.scaffoldType} onChange={(v) => setScaffold({ ...scaffold, scaffoldType: v })} placeholder="Frame Scaffold" />
          </FieldRow>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Default Width">
              <FeetInput value={scaffold.defaultScaffoldWidth} onChange={(v) => setScaffold({ ...scaffold, defaultScaffoldWidth: v })} />
            </FieldRow>
            <FieldRow label="Bay Length">
              <FeetInput value={scaffold.defaultBayLength} onChange={(v) => setScaffold({ ...scaffold, defaultBayLength: v })} />
            </FieldRow>
            <FieldRow label="Wall Offset">
              <FeetInput value={scaffold.wallOffset} onChange={(v) => setScaffold({ ...scaffold, wallOffset: v })} />
            </FieldRow>
          </div>
          <FieldRow label="Frame Height" hint={`Standard tall frame height, e.g. 6'-4"`}>
            <FeetInchesInput value={scaffold.frameHeight} onChange={(v) => setScaffold({ ...scaffold, frameHeight: v })} />
          </FieldRow>
          <FieldRow
            label="Worker Reach Height"
            hint="Top deck doesn't need to reach full wall height — a worker on top can reach roughly this far above. Adjust for crew height (some companies use 5')."
          >
            <FeetInput value={scaffold.workerReachHeight} onChange={(v) => setScaffold({ ...scaffold, workerReachHeight: v })} />
          </FieldRow>
          <FieldRow
            label="Screw Jack Max Extension"
            hint="Maximum screw jack travel. Range 1″–18″. Default 12″ (1 foot) — safe working margin below the 18″ physical limit. Frame Configuration uses this to calculate base stack height."
          >
            <InchesInput
              value={scaffold.screwJackMaxExtension}
              onChange={(v) => setScaffold({ ...scaffold, screwJackMaxExtension: Math.min(18, Math.max(1, v)) })}
              min={1}
              max={18}
            />
          </FieldRow>
          <FieldRow label="Brace Pattern">
            <SegmentedControl value={scaffold.bracePattern} options={["Every Bay", "Every Other Bay", "Custom"]} onChange={(v) => setScaffold({ ...scaffold, bracePattern: v as ScaffoldDefaults["bracePattern"] })} />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Inside Corner Logic">
              <TextInput value={scaffold.insideCornerLogic} onChange={(v) => setScaffold({ ...scaffold, insideCornerLogic: v })} />
            </FieldRow>
            <FieldRow label="Outside Corner Logic">
              <TextInput value={scaffold.outsideCornerLogic} onChange={(v) => setScaffold({ ...scaffold, outsideCornerLogic: v })} />
            </FieldRow>
          </div>
          <FieldRow label="Turnaround Bays">
            <ToggleRow checked={scaffold.turnaroundBaysEnabled} onChange={(v) => setScaffold({ ...scaffold, turnaroundBaysEnabled: v })} label={scaffold.turnaroundBaysEnabled ? "Enabled" : "Disabled"} />
          </FieldRow>
          <FieldRow label="Jump Logic" hint={`Frame Configuration naming — never "Lifts" or "Stack"`}>
            <TextInput value={scaffold.jumpLogic} onChange={(v) => setScaffold({ ...scaffold, jumpLogic: v })} />
          </FieldRow>
        </BackendTile>

        {/* 3. Frame / Material Defaults */}
        <BackendTile title="Frame / Material Defaults" subtitle="Core inventory + specialty items, feeds quantity engine and inventory tracker" onSave={handleSaveMaterial}>
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Core Inventory</p>
          <div className="space-y-2 mb-4">
            {material.items.filter((item) => item.isCore).map((item) => (
              <MaterialRow key={item.id} item={item} onChange={(updated) => setMaterial({ items: material.items.map((m) => (m.id === item.id ? updated : m)) })} />
            ))}
          </div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Specialty / Optional</p>
          <div className="space-y-2">
            {material.items.filter((item) => !item.isCore).map((item) => (
              <MaterialRow key={item.id} item={item} onChange={(updated) => setMaterial({ items: material.items.map((m) => (m.id === item.id ? updated : m)) })} />
            ))}
          </div>
        </BackendTile>

        {/* 4. Labor Defaults */}
        <BackendTile title="Labor Defaults" subtitle="Feeds Estimate Review labor cost and projected profit" onSave={handleSaveLabor}>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Install Crew Size"><NumberInput value={labor.installCrewSize} onChange={(v) => setLabor({ ...labor, installCrewSize: v })} suffix="laborers" /></FieldRow>
            <FieldRow label="Dismantle Crew Size"><NumberInput value={labor.dismantleCrewSize} onChange={(v) => setLabor({ ...labor, dismantleCrewSize: v })} suffix="laborers" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Install Production Rate"><NumberInput value={labor.installProductionRate} onChange={(v) => setLabor({ ...labor, installProductionRate: v })} suffix="bays/day" /></FieldRow>
            <FieldRow label="Dismantle Production Rate"><NumberInput value={labor.dismantleProductionRate} onChange={(v) => setLabor({ ...labor, dismantleProductionRate: v })} suffix="bays/day" /></FieldRow>
          </div>
          <p className="mt-1 mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Labor Rates</p>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Apprentice"><MoneyInput value={labor.apprenticeRate} onChange={(v) => setLabor({ ...labor, apprenticeRate: v })} suffix="/hr" /></FieldRow>
            <FieldRow label="Journeyman"><MoneyInput value={labor.journeymanRate} onChange={(v) => setLabor({ ...labor, journeymanRate: v })} suffix="/hr" /></FieldRow>
            <FieldRow label="Foreman"><MoneyInput value={labor.foremanRate} onChange={(v) => setLabor({ ...labor, foremanRate: v })} suffix="/hr" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Travel Time"><NumberInput value={labor.travelTimeHours} onChange={(v) => setLabor({ ...labor, travelTimeHours: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Truck / Delivery Rate"><MoneyInput value={labor.truckDeliveryRate} onChange={(v) => setLabor({ ...labor, truckDeliveryRate: v })} suffix="/trip" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Mobilization Cost"><MoneyInput value={labor.mobilizationCost} onChange={(v) => setLabor({ ...labor, mobilizationCost: v })} /></FieldRow>
            <FieldRow label="Dismantle Cost" hint="Leave 0 to auto-calculate from crew + rate"><MoneyInput value={labor.dismantleCost} onChange={(v) => setLabor({ ...labor, dismantleCost: v })} /></FieldRow>
          </div>
        </BackendTile>

        {/* 5. Pricing / Rental Defaults */}
        <BackendTile title="Pricing / Rental Defaults" subtitle="Feeds Estimate Review revenue and final bid calculation" onSave={handleSavePricing}>
          <FieldRow label="Rental Period Type">
            <SegmentedControl value={pricing.rentalPeriodType} options={["30 Days", "60 Days", "90 Days", "120 Days", "Custom"]} onChange={(v) => setPricing({ ...pricing, rentalPeriodType: v as PricingDefaults["rentalPeriodType"] })} />
          </FieldRow>
          <p className="mt-1 mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Monthly Rental Rates</p>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Frame"><MoneyInput value={pricing.frameMonthlyRate} onChange={(v) => setPricing({ ...pricing, frameMonthlyRate: v })} /></FieldRow>
            <FieldRow label="Plank"><MoneyInput value={pricing.plankMonthlyRate} onChange={(v) => setPricing({ ...pricing, plankMonthlyRate: v })} /></FieldRow>
            <FieldRow label="Brace"><MoneyInput value={pricing.braceMonthlyRate} onChange={(v) => setPricing({ ...pricing, braceMonthlyRate: v })} /></FieldRow>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Guardrail"><MoneyInput value={pricing.guardrailMonthlyRate} onChange={(v) => setPricing({ ...pricing, guardrailMonthlyRate: v })} /></FieldRow>
            <FieldRow label="Base Plate"><MoneyInput value={pricing.basePlateMonthlyRate} onChange={(v) => setPricing({ ...pricing, basePlateMonthlyRate: v })} /></FieldRow>
            <FieldRow label="Screw Jack"><MoneyInput value={pricing.screwJackMonthlyRate} onChange={(v) => setPricing({ ...pricing, screwJackMonthlyRate: v })} /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Misc Cost"><MoneyInput value={pricing.miscCost} onChange={(v) => setPricing({ ...pricing, miscCost: v })} /></FieldRow>
            <FieldRow label="Markup"><PercentInput value={pricing.markupPercent} onChange={(v) => setPricing({ ...pricing, markupPercent: v })} /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Margin"><PercentInput value={pricing.marginPercent} onChange={(v) => setPricing({ ...pricing, marginPercent: v })} /></FieldRow>
            <FieldRow label="Tax"><PercentInput value={pricing.taxPercent} onChange={(v) => setPricing({ ...pricing, taxPercent: v })} /></FieldRow>
          </div>
          <FieldRow label="Partial Exterior Markup" hint="Extra markup for elevation-by-elevation pricing — reflects added truck trips and mobilization cost per separate visit">
            <PercentInput value={pricing.partialExteriorMarkupPercent} onChange={(v) => setPricing({ ...pricing, partialExteriorMarkupPercent: v })} />
          </FieldRow>
        </BackendTile>

        {/* 6. Proposal Defaults */}
        <BackendTile title="Proposal Defaults" subtitle="Feeds the client-facing proposal output" onSave={handleSaveProposal}>
          <div className="space-y-3">
            <FieldRow label="Proposal Number Format">
              <TextInput value={proposal.proposalNumberFormat} onChange={(v) => setProposal({ ...proposal, proposalNumberFormat: v })} placeholder="KRB-{YYMMDD}-{seq}" />
            </FieldRow>
            <FieldRow label="Intro Language">
              <TextArea value={proposal.introLanguage} onChange={(v) => setProposal({ ...proposal, introLanguage: v })} rows={3} />
            </FieldRow>
            <FieldRow label="Scope Language">
              <TextArea value={proposal.scopeLanguage} onChange={(v) => setProposal({ ...proposal, scopeLanguage: v })} rows={2} placeholder="Standard scope language for proposals..." />
            </FieldRow>
            <FieldRow label="Exclusions">
              <TextArea value={proposal.exclusionsLanguage} onChange={(v) => setProposal({ ...proposal, exclusionsLanguage: v })} rows={2} placeholder="Standard exclusions language..." />
            </FieldRow>
            <FieldRow label="Rental Duration Language">
              <TextArea value={proposal.rentalDurationLanguage} onChange={(v) => setProposal({ ...proposal, rentalDurationLanguage: v })} rows={2} />
            </FieldRow>
            <FieldRow label="Terms">
              <TextArea value={proposal.termsLanguage} onChange={(v) => setProposal({ ...proposal, termsLanguage: v })} rows={2} placeholder="Standard terms language..." />
            </FieldRow>
            <FieldRow label="Signature Block">
              <TextArea value={proposal.signatureBlock} onChange={(v) => setProposal({ ...proposal, signatureBlock: v })} rows={2} placeholder="Authorized signature, title, date..." />
            </FieldRow>
            <p className="mt-1 mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Default Add Alternates <span className="text-zinc-700">(excluded by default)</span>
            </p>
            <div className="space-y-2">
              {proposal.addAlternateDefaults.map((alt, index) => (
                <AddAlternateRow key={alt.id} alternate={alt} index={index} onChange={(updated) => setProposal({ ...proposal, addAlternateDefaults: proposal.addAlternateDefaults.map((a) => (a.id === alt.id ? updated : a)) })} />
              ))}
            </div>
          </div>
        </BackendTile>

      </section>
    </main>
  );
}

// ── Tile shell ────────────────────────────────────────────────────────────────

function BackendTile({ title, subtitle, children, onSave, className }: {
  title: string; subtitle: string; children: React.ReactNode; onSave: () => void; className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">{title}</h2>
          <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
        </div>
        <button onClick={onSave} className="shrink-0 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-orange-300 hover:bg-orange-500/20">
          Save
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// ── Field primitives ──────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/40 placeholder:text-zinc-700" />;
}

function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full resize-none rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-xs leading-5 text-zinc-300 outline-none focus:border-orange-500/40 placeholder:text-zinc-700" />;
}

function NumberInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      {suffix && <span className="shrink-0 text-[10px] text-zinc-600">{suffix}</span>}
    </div>
  );
}

function MoneyInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <span className="font-mono text-sm font-bold text-zinc-600">$</span>
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" step="0.01" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      {suffix && <span className="shrink-0 text-[10px] text-zinc-600">{suffix}</span>}
    </div>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      <span className="font-mono text-sm font-bold text-zinc-600">%</span>
    </div>
  );
}

function FeetInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      <span className="font-mono text-sm font-bold text-zinc-600">ft</span>
    </div>
  );
}

/**
 * Inches input — for screw jack max extension.
 * Displays whole inches with a range indicator showing 1"–18" constraint.
 */
function InchesInput({ value, onChange, min = 1, max = 18 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  // Show the value as a fraction of max for the visual range bar
  const pct = Math.round(((value - min) / (max - min)) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
        <input
          value={value}
          onChange={(e) => {
            const v = Math.min(max, Math.max(min, Number(e.target.value || min)));
            onChange(v);
          }}
          type="number"
          min={min}
          max={max}
          className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none"
        />
        <span className="font-mono text-sm font-bold text-zinc-600">&quot;</span>
      </div>
      {/* Range slider for intuitive 1"–18" adjustment */}
      <div className="space-y-1">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-[9px] font-mono text-zinc-600">
          <span>1&quot; min</span>
          <span className="text-orange-400 font-bold">{value}&quot; selected</span>
          <span>18&quot; max</span>
        </div>
      </div>
    </div>
  );
}

function FeetInchesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(formatFeetInches(value));

  useEffect(() => { setText(formatFeetInches(value)); }, [value]);

  function commit() {
    const parsed = parseFeetInches(text);
    if (parsed !== null) { onChange(parsed); setText(formatFeetInches(parsed)); }
    else { setText(formatFeetInches(value)); }
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      placeholder={`ex: 6'-4"`}
      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
    />
  );
}

function formatFeetInches(decimalFeet: number) {
  const safe = Math.max(0, decimalFeet);
  let feet = Math.floor(safe);
  let inches = Math.round((safe - feet) * 12);
  if (inches === 12) { feet += 1; inches = 0; }
  return `${feet}'-${inches}"`;
}

function parseFeetInches(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)'?-?(\d+(?:\.\d+)?)?"?$/);
  if (!match) {
    const plain = Number(normalized.replace(/['"]/g, ""));
    return Number.isNaN(plain) ? null : plain;
  }
  const feet = Number(match[1]);
  const inches = Number(match[2] || 0);
  if (Number.isNaN(feet) || Number.isNaN(inches)) return null;
  return feet + inches / 12;
}

function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: readonly T[] | T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={option} onClick={() => onChange(option)} className={`rounded-lg border px-3 py-2 text-[11px] font-bold transition ${value === option ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-800 bg-black text-zinc-500 hover:border-orange-500/40"}`}>
          {option}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${checked ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-black text-zinc-500"}`}>
      <span className="text-xs font-bold">{label}</span>
      <span className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition ${checked ? "border-orange-500 bg-orange-500/30 justify-end" : "border-zinc-700 bg-zinc-900 justify-start"}`}>
        <span className={`h-3.5 w-3.5 rounded-full ${checked ? "bg-orange-400" : "bg-zinc-600"}`} />
      </span>
    </button>
  );
}

function MaterialRow({ item, onChange }: { item: MaterialItem; onChange: (item: MaterialItem) => void }) {
  return (
    <div className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl border border-zinc-800 bg-black p-2.5">
      <p className="text-xs font-semibold text-zinc-300">{item.name}</p>
      <MoneyInput value={item.unitRate} onChange={(v) => onChange({ ...item, unitRate: v })} suffix="/mo" />
    </div>
  );
}

function AddAlternateRow({ alternate, index, onChange }: { alternate: AddAlternateDefault; index: number; onChange: (alt: AddAlternateDefault) => void }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-bold text-zinc-300">AA #{index + 1} — {alternate.title}</p>
        <MoneyInput value={alternate.defaultValue} onChange={(v) => onChange({ ...alternate, defaultValue: v })} />
      </div>
      <p className="text-[10px] text-zinc-600">{alternate.description}</p>
    </div>
  );
}
