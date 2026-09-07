"use client";
import { KorbanHeader } from "@/components/korban";
import { useEffect, useState } from "react";
import {
  getBackendSettings,
  saveBackendSection,
  resetBackendSettings,
  type CompanySettings,
  type EstimatorSettings,
  type ScaffoldDefaults,
  type MaterialDefaults,
  type MaterialItem,
  type LaborDefaults,
  type PricingDefaults,
  type ProposalDefaults,
  type AlternateRateDefaults,
  type AddAlternateDefault,
} from "@/lib/backendStore";

export default function BackendPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [estimator, setEstimator] = useState<EstimatorSettings | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldDefaults | null>(null);
  const [material, setMaterial] = useState<MaterialDefaults | null>(null);
  const [labor, setLabor] = useState<LaborDefaults | null>(null);
  const [pricing, setPricing] = useState<PricingDefaults | null>(null);
  const [alternates, setAlternates] = useState<AlternateRateDefaults | null>(null);
  const [proposal, setProposal] = useState<ProposalDefaults | null>(null);

  function loadAll() {
    const settings = getBackendSettings();
    setCompany(settings.company);
    setEstimator(settings.estimator);
    setScaffold(settings.scaffold);
    setMaterial(settings.material);
    setLabor(settings.labor);
    setPricing(settings.pricing);
    setAlternates(settings.alternates);
    setProposal(settings.proposal);
  }

  useEffect(() => {
    loadAll();
    setIsHydrated(true);
  }, []);

  function flashSaved(label: string) {
    setSavedFlash(label);
    window.setTimeout(() => setSavedFlash(null), 1800);
  }

  function handleResetAll() {
    const confirmed = window.confirm("Reset ALL backend settings to KORBAN defaults? This cannot be undone.");
    if (!confirmed) return;
    resetBackendSettings();
    loadAll();
    flashSaved("All Settings Reset");
  }

  if (!isHydrated || !company || !estimator || !scaffold || !material || !labor || !pricing || !alternates || !proposal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080604] text-white">
        <p className="text-sm text-zinc-500">Loading backend settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <div className="sticky top-0 z-20">
        <KorbanHeader
          title="Backend"
          subtitle="Estimator control center - company, scaffold, material, labor, pricing, alternates and proposal defaults."
          actionsAlwaysVisible
          actions={
            <>
              {savedFlash && (
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-xs font-bold text-emerald-300">
                  {savedFlash} saved
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
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
            These defaults feed{" "}
            <span className="font-bold normal-case tracking-normal text-orange-400">Takeoff Workspace</span>,{" "}
            <span className="font-bold normal-case tracking-normal text-orange-400">Set Scaffold</span>,{" "}
            <span className="font-bold normal-case tracking-normal text-orange-400">Frame Configuration</span>,{" "}
            <span className="font-bold normal-case tracking-normal text-orange-400">Estimate Review</span>, and the{" "}
            <span className="font-bold normal-case tracking-normal text-orange-400">Proposal</span> automatically.
          </p>
        </div>
      </div>

      <section className="columns-1 gap-5 p-6 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">

        {/* 1. Company */}
        <BackendTile title="Company Setup" subtitle="Prints on the proposal masthead and signature block" onSave={() => { saveBackendSection("company", company); flashSaved("Company Setup"); }}>
          <FieldRow label="Company Name" hint="Printed in the proposal masthead">
            <TextInput value={company.companyName} onChange={(v) => setCompany({ ...company, companyName: v })} placeholder="Scaffold Solutions Inc." />
          </FieldRow>
          <FieldRow label="Company Address">
            <TextInput value={company.companyAddress} onChange={(v) => setCompany({ ...company, companyAddress: v })} placeholder="123 Industrial Way, Vallejo, CA" />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Phone">
              <TextInput value={company.companyPhone} onChange={(v) => setCompany({ ...company, companyPhone: v })} placeholder="(707) 561-7712" />
            </FieldRow>
            <FieldRow label="Email">
              <TextInput value={company.companyEmail} onChange={(v) => setCompany({ ...company, companyEmail: v })} placeholder="estimating@company.com" />
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
          <FieldRow label="Union Affiliation" hint="Printed above the signature blocks. Leave blank to omit.">
            <TextInput value={company.unionAffiliation} onChange={(v) => setCompany({ ...company, unionAffiliation: v })} placeholder="Signatory to the United Brotherhood of Carpenters and Joiners of America" />
          </FieldRow>
          <FieldRow label="License Board Line" hint="Printed under the union line">
            <TextInput value={company.licenseBoardLine} onChange={(v) => setCompany({ ...company, licenseBoardLine: v })} />
          </FieldRow>
          <FieldRow label="Main Office Location">
            <TextInput value={company.mainOfficeLocation} onChange={(v) => setCompany({ ...company, mainOfficeLocation: v })} placeholder="Vallejo, CA" />
          </FieldRow>
          <FieldRow label="Travel Start Address" hint="Used for travel time and mobilization calculations">
            <TextInput value={company.travelStartAddress} onChange={(v) => setCompany({ ...company, travelStartAddress: v })} placeholder="Same as main office, or yard address" />
          </FieldRow>
        </BackendTile>

        {/* 2. Estimator */}
        <BackendTile title="Estimator" subtitle="The name and numbers that print on every proposal" onSave={() => { saveBackendSection("estimator", estimator); flashSaved("Estimator"); }}>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Name" hint="Shown as first name, last initial on the bid deck">
              <TextInput value={estimator.estimatorName} onChange={(v) => setEstimator({ ...estimator, estimatorName: v })} placeholder="Harold Pierre" />
            </FieldRow>
            <FieldRow label="Title">
              <TextInput value={estimator.estimatorTitle} onChange={(v) => setEstimator({ ...estimator, estimatorTitle: v })} placeholder="Estimator" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Cell">
              <TextInput value={estimator.estimatorCell} onChange={(v) => setEstimator({ ...estimator, estimatorCell: v })} placeholder="(707) 980-9503" />
            </FieldRow>
            <FieldRow label="Direct Phone">
              <TextInput value={estimator.estimatorPhone} onChange={(v) => setEstimator({ ...estimator, estimatorPhone: v })} placeholder="(707) 561-7712" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Fax">
              <TextInput value={estimator.estimatorFax} onChange={(v) => setEstimator({ ...estimator, estimatorFax: v })} placeholder="(707) 561-7716" />
            </FieldRow>
            <FieldRow label="Email">
              <TextInput value={estimator.estimatorEmail} onChange={(v) => setEstimator({ ...estimator, estimatorEmail: v })} placeholder="name@company.com" />
            </FieldRow>
          </div>
        </BackendTile>

        {/* 3. Scaffold */}
        <BackendTile title="Scaffold Defaults" subtitle="Feeds Set Scaffold, Frame Configuration and the quantity engine" onSave={() => { saveBackendSection("scaffold", scaffold); flashSaved("Scaffold Defaults"); }}>
          <FieldRow label="Scaffold Type">
            <TextInput value={scaffold.scaffoldType} onChange={(v) => setScaffold({ ...scaffold, scaffoldType: v })} placeholder="Frame Scaffold" />
          </FieldRow>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Default Width"><FeetInput value={scaffold.defaultScaffoldWidth} onChange={(v) => setScaffold({ ...scaffold, defaultScaffoldWidth: v })} /></FieldRow>
            <FieldRow label="Bay Length"><FeetInput value={scaffold.defaultBayLength} onChange={(v) => setScaffold({ ...scaffold, defaultBayLength: v })} /></FieldRow>
            <FieldRow label="Wall Offset"><FeetInput value={scaffold.wallOffset} onChange={(v) => setScaffold({ ...scaffold, wallOffset: v })} /></FieldRow>
          </div>
          <FieldRow label="Frame Height" hint={`Standard tall frame height, e.g. 6'-4"`}>
            <FeetInchesInput value={scaffold.frameHeight} onChange={(v) => setScaffold({ ...scaffold, frameHeight: v })} />
          </FieldRow>
          <FieldRow label="Worker Reach Height" hint="The top deck doesn't need to reach full wall height. Adjust for crew height - some companies use 5'.">
            <FeetInput value={scaffold.workerReachHeight} onChange={(v) => setScaffold({ ...scaffold, workerReachHeight: v })} />
          </FieldRow>
          <FieldRow label="Screw Jack Max Extension" hint={`Range 1"-18". Default 12" keeps a safe margin below the physical limit.`}>
            <InchesInput value={scaffold.screwJackMaxExtension} onChange={(v) => setScaffold({ ...scaffold, screwJackMaxExtension: Math.min(18, Math.max(1, v)) })} min={1} max={18} />
          </FieldRow>
          <FieldRow label="Brace Pattern">
            <SegmentedControl value={scaffold.bracePattern} options={["Every Bay", "Every Other Bay", "Custom"]} onChange={(v) => setScaffold({ ...scaffold, bracePattern: v as ScaffoldDefaults["bracePattern"] })} />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Inside Corner Logic"><TextInput value={scaffold.insideCornerLogic} onChange={(v) => setScaffold({ ...scaffold, insideCornerLogic: v })} /></FieldRow>
            <FieldRow label="Outside Corner Logic"><TextInput value={scaffold.outsideCornerLogic} onChange={(v) => setScaffold({ ...scaffold, outsideCornerLogic: v })} /></FieldRow>
          </div>
          <FieldRow label="Turnaround Bays">
            <ToggleRow checked={scaffold.turnaroundBaysEnabled} onChange={(v) => setScaffold({ ...scaffold, turnaroundBaysEnabled: v })} label={scaffold.turnaroundBaysEnabled ? "Enabled" : "Disabled"} />
          </FieldRow>
          <FieldRow label="Jump Logic" hint="Vertical repetitions are jumps. Frame arrangement per leg is Frame Configuration.">
            <TextInput value={scaffold.jumpLogic} onChange={(v) => setScaffold({ ...scaffold, jumpLogic: v })} />
          </FieldRow>
        </BackendTile>

        {/* 4. Material */}
        <BackendTile title="Material & Rental Rates" subtitle="The only home for piece rates - nothing duplicates these" onSave={() => { saveBackendSection("material", material); flashSaved("Material"); }}>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Core Inventory</p>
          <p className="mb-2 text-[10px] leading-4 text-zinc-600">
            Rate is monthly, per piece. The toggle decides whether that piece bills as rental
            revenue on the estimate - frames and planks do by default.
          </p>
          <div className="mb-4 space-y-2">
            {material.items.filter((item) => item.isCore).map((item) => (
              <MaterialRow key={item.id} item={item} onChange={(updated) => setMaterial({ ...material, items: material.items.map((m) => (m.id === item.id ? updated : m)) })} />
            ))}
          </div>

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Specialty / Optional</p>
          <div className="mb-4 space-y-2">
            {material.items.filter((item) => !item.isCore).map((item) => (
              <MaterialRow key={item.id} item={item} onChange={(updated) => setMaterial({ ...material, items: material.items.map((m) => (m.id === item.id ? updated : m)) })} />
            ))}
          </div>

          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Material Rules</p>
          <p className="mb-2 text-[10px] leading-4 text-zinc-600">
            How much of each piece a bay takes. Braces, planks, guardrails and pins all repeat per
            jump - counting them once at ground level is what the material audit corrected.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Cross Braces" hint="per bay, per jump">
              <NumberInput value={material.rules.crossBracesPerBayPerJump} onChange={(v) => setMaterial({ ...material, rules: { ...material.rules, crossBracesPerBayPerJump: v } })} />
            </FieldRow>
            <FieldRow label="Coupling Pins" hint="per frame joint">
              <NumberInput value={material.rules.couplingPinsPerFrame} onChange={(v) => setMaterial({ ...material, rules: { ...material.rules, couplingPinsPerFrame: v } })} />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Guardrails - Top" hint="per bay at the top jump">
              <NumberInput value={material.rules.guardrailTopPerBay} onChange={(v) => setMaterial({ ...material, rules: { ...material.rules, guardrailTopPerBay: v } })} />
            </FieldRow>
            <FieldRow label="Guardrails - Intermediate" hint="per bay at each jump below">
              <NumberInput value={material.rules.guardrailIntermediatePerBay} onChange={(v) => setMaterial({ ...material, rules: { ...material.rules, guardrailIntermediatePerBay: v } })} />
            </FieldRow>
          </div>
        </BackendTile>

        {/* 5. Labor */}
        <BackendTile title="Labor Defaults" subtitle="Feeds Estimate Review labor cost and the schedule" onSave={() => { saveBackendSection("labor", labor); flashSaved("Labor Defaults"); }}>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Estimate Rates</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Erect / Dismantle" hint="Applied to erect and dismantle hours">
              <MoneyInput value={labor.erectHourlyRate} onChange={(v) => setLabor({ ...labor, erectHourlyRate: v })} suffix="/hr" />
            </FieldRow>
            <FieldRow label="Travel" hint="Travel carries its own rate">
              <MoneyInput value={labor.travelHourlyRate} onChange={(v) => setLabor({ ...labor, travelHourlyRate: v })} suffix="/hr" />
            </FieldRow>
          </div>
          <FieldRow label="Dismantle as % of Erect" hint="Confirmed at 70% by the material audit. Dismantle is never entered by hand.">
            <PercentInput value={labor.dismantlePercentOfErect} onChange={(v) => setLabor({ ...labor, dismantlePercentOfErect: v })} />
          </FieldRow>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Trade Rates</p>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Apprentice"><MoneyInput value={labor.apprenticeRate} onChange={(v) => setLabor({ ...labor, apprenticeRate: v })} suffix="/hr" /></FieldRow>
            <FieldRow label="Journeyman"><MoneyInput value={labor.journeymanRate} onChange={(v) => setLabor({ ...labor, journeymanRate: v })} suffix="/hr" /></FieldRow>
            <FieldRow label="Foreman"><MoneyInput value={labor.foremanRate} onChange={(v) => setLabor({ ...labor, foremanRate: v })} suffix="/hr" /></FieldRow>
          </div>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Crew & Production</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Install Crew Size"><NumberInput value={labor.installCrewSize} onChange={(v) => setLabor({ ...labor, installCrewSize: v })} suffix="laborers" /></FieldRow>
            <FieldRow label="Dismantle Crew Size"><NumberInput value={labor.dismantleCrewSize} onChange={(v) => setLabor({ ...labor, dismantleCrewSize: v })} suffix="laborers" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Install Production"><NumberInput value={labor.installProductionRate} onChange={(v) => setLabor({ ...labor, installProductionRate: v })} suffix="bays/day" /></FieldRow>
            <FieldRow label="Dismantle Production"><NumberInput value={labor.dismantleProductionRate} onChange={(v) => setLabor({ ...labor, dismantleProductionRate: v })} suffix="bays/day" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Travel Time"><NumberInput value={labor.travelTimeHours} onChange={(v) => setLabor({ ...labor, travelTimeHours: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Truck / Delivery"><MoneyInput value={labor.truckDeliveryRate} onChange={(v) => setLabor({ ...labor, truckDeliveryRate: v })} suffix="/trip" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Mobilization Cost"><MoneyInput value={labor.mobilizationCost} onChange={(v) => setLabor({ ...labor, mobilizationCost: v })} /></FieldRow>
            <FieldRow label="Dismantle Cost" hint="Leave 0 to derive from crew and rate"><MoneyInput value={labor.dismantleCost} onChange={(v) => setLabor({ ...labor, dismantleCost: v })} /></FieldRow>
          </div>
        </BackendTile>

        {/* 6. Pricing */}
        <BackendTile title="Pricing & Margin" subtitle="Feeds the final bid and Margin Review" onSave={() => { saveBackendSection("pricing", pricing); flashSaved("Pricing"); }}>
          <FieldRow label="Rental Period Type">
            <SegmentedControl value={pricing.rentalPeriodType} options={["30 Days", "60 Days", "90 Days", "120 Days", "Custom"]} onChange={(v) => setPricing({ ...pricing, rentalPeriodType: v as PricingDefaults["rentalPeriodType"] })} />
          </FieldRow>
          <FieldRow label="Rental Duration" hint="Billing period the estimate opens with">
            <NumberInput value={pricing.rentalDurationDays} onChange={(v) => setPricing({ ...pricing, rentalDurationDays: v })} suffix="days" />
          </FieldRow>
          <p className="mt-1 text-[10px] leading-4 text-zinc-600">
            Piece rental rates live in Material &amp; Rental Rates. They used to be duplicated here,
            which let the two copies drift apart.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Labor Markup" hint="Labor cost to labor revenue">
              <PercentInput value={pricing.laborMarkupPercent} onChange={(v) => setPricing({ ...pricing, laborMarkupPercent: v })} />
            </FieldRow>
            <FieldRow label="Markup"><PercentInput value={pricing.markupPercent} onChange={(v) => setPricing({ ...pricing, markupPercent: v })} /></FieldRow>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Margin"><PercentInput value={pricing.marginPercent} onChange={(v) => setPricing({ ...pricing, marginPercent: v })} /></FieldRow>
            <FieldRow label="Tax"><PercentInput value={pricing.taxPercent} onChange={(v) => setPricing({ ...pricing, taxPercent: v })} /></FieldRow>
            <FieldRow label="Misc Cost"><MoneyInput value={pricing.miscCost} onChange={(v) => setPricing({ ...pricing, miscCost: v })} /></FieldRow>
          </div>
          <FieldRow label="Partial Exterior Markup" hint="Extra markup for elevation-by-elevation pricing - covers added truck trips and mobilization per visit">
            <PercentInput value={pricing.partialExteriorMarkupPercent} onChange={(v) => setPricing({ ...pricing, partialExteriorMarkupPercent: v })} />
          </FieldRow>
        </BackendTile>

        {/* 7. Alternate pricing */}
        <BackendTile title="Alternate Pricing" subtitle="Every rate the add-alternate engine uses" onSave={() => { saveBackendSection("alternates", alternates); flashSaved("Alternate Pricing"); }}>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Shrink Wrap</p>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Rate"><MoneyInput value={alternates.shrinkWrapPerSqFt} onChange={(v) => setAlternates({ ...alternates, shrinkWrapPerSqFt: v })} suffix="/sf" /></FieldRow>
            <FieldRow label="Full - added ht"><FeetInput value={alternates.shrinkWrapFullAddedHeightFt} onChange={(v) => setAlternates({ ...alternates, shrinkWrapFullAddedHeightFt: v })} /></FieldRow>
            <FieldRow label="Cap height"><FeetInput value={alternates.shrinkWrapCapHeightFt} onChange={(v) => setAlternates({ ...alternates, shrinkWrapCapHeightFt: v })} /></FieldRow>
          </div>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Netting</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Rate"><MoneyInput value={alternates.nettingPerSqFt} onChange={(v) => setAlternates({ ...alternates, nettingPerSqFt: v })} suffix="/sf" /></FieldRow>
            <FieldRow label="Added height"><FeetInput value={alternates.nettingAddedHeightFt} onChange={(v) => setAlternates({ ...alternates, nettingAddedHeightFt: v })} /></FieldRow>
          </div>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Pedestrian Canopy</p>
          <FieldRow label="Priced per" hint="Remaining footage is prorated, not rounded up">
            <NumberInput value={alternates.canopyLinearFeetPerUnit} onChange={(v) => setAlternates({ ...alternates, canopyLinearFeetPerUnit: v })} suffix="LF" />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Install"><NumberInput value={alternates.canopyInstallHoursPerUnit} onChange={(v) => setAlternates({ ...alternates, canopyInstallHoursPerUnit: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Dismantle"><NumberInput value={alternates.canopyDismantleHoursPerUnit} onChange={(v) => setAlternates({ ...alternates, canopyDismantleHoursPerUnit: v })} suffix="hrs" /></FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Travel"><NumberInput value={alternates.canopyTravelHoursPerUnit} onChange={(v) => setAlternates({ ...alternates, canopyTravelHoursPerUnit: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Material"><MoneyInput value={alternates.canopyMaterialPerUnit} onChange={(v) => setAlternates({ ...alternates, canopyMaterialPerUnit: v })} /></FieldRow>
          </div>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Toe Boards</p>
          <FieldRow label="Rate" hint="Per linear foot, per jump, one side. Both sides doubles it.">
            <MoneyInput value={alternates.toeBoardPerLinearFootPerJump} onChange={(v) => setAlternates({ ...alternates, toeBoardPerLinearFootPerJump: v })} suffix="/LF/jump" />
          </FieldRow>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Hoist Landing</p>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Install"><NumberInput value={alternates.hoistInstallHours} onChange={(v) => setAlternates({ ...alternates, hoistInstallHours: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Dismantle"><NumberInput value={alternates.hoistDismantleHours} onChange={(v) => setAlternates({ ...alternates, hoistDismantleHours: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Rental ea."><MoneyInput value={alternates.hoistRentalEach} onChange={(v) => setAlternates({ ...alternates, hoistRentalEach: v })} /></FieldRow>
          </div>

          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">Stair Tower</p>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Rent per jump"><MoneyInput value={alternates.stairTowerRentPerJump} onChange={(v) => setAlternates({ ...alternates, stairTowerRentPerJump: v })} /></FieldRow>
            <FieldRow label="Tall threshold" hint="Above this the crew rule gives way to mobilizations">
              <FeetInput value={alternates.stairTowerTallThresholdFt} onChange={(v) => setAlternates({ ...alternates, stairTowerTallThresholdFt: v })} />
            </FieldRow>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FieldRow label="Levels per mob"><NumberInput value={alternates.stairTowerLevelsPerMobilization} onChange={(v) => setAlternates({ ...alternates, stairTowerLevelsPerMobilization: v })} /></FieldRow>
            <FieldRow label="Hours per mob"><NumberInput value={alternates.stairTowerHoursPerMobilization} onChange={(v) => setAlternates({ ...alternates, stairTowerHoursPerMobilization: v })} suffix="hrs" /></FieldRow>
            <FieldRow label="Dismantle"><PercentInput value={alternates.stairTowerDismantlePercent} onChange={(v) => setAlternates({ ...alternates, stairTowerDismantlePercent: v })} /></FieldRow>
          </div>
          <FieldRow label="Crew by Building Height" hint="Applies below the tall threshold. Add or edit rows to match how your crews actually scale.">
            <div className="space-y-1.5">
              {alternates.stairTowerCrewBands.map((band, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
                    <span className="font-mono text-[10px] text-zinc-600">to</span>
                    <input
                      value={band.throughFt}
                      type="number"
                      onChange={(e) => {
                        const next = [...alternates.stairTowerCrewBands];
                        next[index] = { ...band, throughFt: Number(e.target.value || 0) };
                        setAlternates({ ...alternates, stairTowerCrewBands: next });
                      }}
                      className="w-full bg-transparent text-right font-mono text-xs font-bold text-orange-300 outline-none"
                    />
                    <span className="font-mono text-[10px] text-zinc-600">ft</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
                    <input
                      value={band.men}
                      type="number"
                      onChange={(e) => {
                        const next = [...alternates.stairTowerCrewBands];
                        next[index] = { ...band, men: Number(e.target.value || 0) };
                        setAlternates({ ...alternates, stairTowerCrewBands: next });
                      }}
                      className="w-full bg-transparent text-right font-mono text-xs font-bold text-orange-300 outline-none"
                    />
                    <span className="font-mono text-[10px] text-zinc-600">men</span>
                  </div>
                  <button
                    onClick={() => setAlternates({ ...alternates, stairTowerCrewBands: alternates.stairTowerCrewBands.filter((_, i) => i !== index) })}
                    className="text-center font-mono text-[11px] text-zinc-700 hover:text-red-400"
                    aria-label="Remove band"
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const last = alternates.stairTowerCrewBands[alternates.stairTowerCrewBands.length - 1];
                  setAlternates({
                    ...alternates,
                    stairTowerCrewBands: [
                      ...alternates.stairTowerCrewBands,
                      { throughFt: (last?.throughFt ?? 20) + 5, men: (last?.men ?? 3) + 1 },
                    ],
                  });
                }}
                className="w-full rounded-lg border border-dashed border-zinc-800 py-1.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400"
              >
                Add band
              </button>
            </div>
          </FieldRow>
        </BackendTile>

        {/* 8. Proposal */}
        <BackendTile title="Proposal Language" subtitle="Everything printed on the client-facing document" onSave={() => { saveBackendSection("proposal", proposal); flashSaved("Proposal Language"); }}>
          <FieldRow label="Proposal Number Format">
            <TextInput value={proposal.proposalNumberFormat} onChange={(v) => setProposal({ ...proposal, proposalNumberFormat: v })} placeholder="KRB-{YYMMDD}-{seq}" />
          </FieldRow>
          <FieldRow label="Intro Paragraph" hint="Opens the proposal, above the pricing table">
            <TextArea value={proposal.introLanguage} onChange={(v) => setProposal({ ...proposal, introLanguage: v })} rows={4} />
          </FieldRow>
          <FieldRow label="Notes" hint="One per line. Printed under the pricing table.">
            <TextArea value={proposal.notesLanguage} onChange={(v) => setProposal({ ...proposal, notesLanguage: v })} rows={5} />
          </FieldRow>
          <FieldRow label="Inclusions" hint="One per line">
            <TextArea value={proposal.inclusionsLanguage} onChange={(v) => setProposal({ ...proposal, inclusionsLanguage: v })} rows={3} />
          </FieldRow>
          <FieldRow label="Exclusions" hint="One per line. Printed in three columns.">
            <TextArea value={proposal.exclusionsLanguage} onChange={(v) => setProposal({ ...proposal, exclusionsLanguage: v })} rows={7} />
          </FieldRow>
          <FieldRow label="Qualifications" hint="One per line">
            <TextArea value={proposal.qualificationsLanguage} onChange={(v) => setProposal({ ...proposal, qualificationsLanguage: v })} rows={7} />
          </FieldRow>
          <FieldRow label="Closing Paragraph" hint="Above the signature blocks">
            <TextArea value={proposal.closingLanguage} onChange={(v) => setProposal({ ...proposal, closingLanguage: v })} rows={4} />
          </FieldRow>
          <FieldRow label="Rental Duration Language">
            <TextArea value={proposal.rentalDurationLanguage} onChange={(v) => setProposal({ ...proposal, rentalDurationLanguage: v })} rows={2} />
          </FieldRow>
          <FieldRow label="Scope Language" hint="Optional. Leave blank to omit.">
            <TextArea value={proposal.scopeLanguage} onChange={(v) => setProposal({ ...proposal, scopeLanguage: v })} rows={2} />
          </FieldRow>
          <FieldRow label="Signature Block" hint="Optional. Leave blank to omit.">
            <TextArea value={proposal.signatureBlock} onChange={(v) => setProposal({ ...proposal, signatureBlock: v })} rows={2} />
          </FieldRow>
          <p className="mt-1 mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            Legacy Add Alternate Values <span className="text-zinc-700">(superseded)</span>
          </p>
          <p className="mb-2 text-[10px] leading-4 text-zinc-600">
            Alternates are priced from the takeoff now. These flat figures are kept only so older
            saved bids still open, and are not used on new estimates.
          </p>
          <div className="space-y-2 opacity-50">
            {proposal.addAlternateDefaults.map((alt, index) => (
              <AddAlternateRow key={alt.id} alternate={alt} index={index} onChange={(updated) => setProposal({ ...proposal, addAlternateDefaults: proposal.addAlternateDefaults.map((a) => (a.id === alt.id ? updated : a)) })} />
            ))}
          </div>
        </BackendTile>

      </section>
    </main>
  );
}

// --- Tile shell -------------------------------------------------------------

function BackendTile({ title, subtitle, children, onSave, className }: {
  title: string; subtitle: string; children: React.ReactNode; onSave: () => void; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-orange-400">{title}</h2>
          <p className="mt-1 text-[11px] text-zinc-600">{subtitle}</p>
        </div>
        <button onClick={onSave} className="shrink-0 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300 hover:bg-orange-500/20">
          Save
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// --- Field primitives -------------------------------------------------------

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-4 text-zinc-600">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40" />;
}

function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full resize-none rounded-lg border border-zinc-800 bg-black px-3 py-2.5 text-xs leading-5 text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-orange-500/40" />;
}

function NumberInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      {suffix && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{suffix}</span>}
    </div>
  );
}

function MoneyInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-3 py-2.5">
      <span className="font-mono text-sm font-bold text-zinc-600">$</span>
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" step="0.01" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      {suffix && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{suffix}</span>}
    </div>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      <span className="font-mono text-sm font-bold text-zinc-600">%</span>
    </div>
  );
}

function FeetInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-black px-3 py-2.5">
      <input value={value} onChange={(e) => onChange(Number(e.target.value || 0))} type="number" className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none" />
      <span className="font-mono text-sm font-bold text-zinc-600">ft</span>
    </div>
  );
}

function InchesInput({ value, onChange, min = 1, max = 18 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-2.5">
        <input
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value || min))))}
          type="number" min={min} max={max}
          className="w-full bg-transparent font-mono text-sm font-bold text-orange-300 outline-none"
        />
        <span className="font-mono text-sm font-bold text-zinc-600">&quot;</span>
      </div>
      <div className="space-y-1">
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-orange-500" />
        <div className="flex justify-between font-mono text-[9px] text-zinc-600">
          <span>1&quot; min</span>
          <span className="font-bold text-orange-400">{value}&quot; selected</span>
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
      className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2.5 font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
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
  const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/[\u2013\u2014]/g, "-");
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
        <button key={option} onClick={() => onChange(option)} className={`rounded-lg border px-3 py-2 font-mono text-[11px] font-bold transition ${value === option ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-800 bg-black text-zinc-500 hover:border-orange-500/40"}`}>
          {option}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!checked)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${checked ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 bg-black text-zinc-500"}`}>
      <span className="font-mono text-xs font-bold">{label}</span>
      <span className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition ${checked ? "justify-end border-orange-500 bg-orange-500/30" : "justify-start border-zinc-700 bg-zinc-900"}`}>
        <span className={`h-3.5 w-3.5 rounded-full ${checked ? "bg-orange-400" : "bg-zinc-600"}`} />
      </span>
    </button>
  );
}

/** Rate plus a switch for whether the piece bills as rental revenue. */
function MaterialRow({ item, onChange }: { item: MaterialItem; onChange: (item: MaterialItem) => void }) {
  return (
    <div className="grid grid-cols-[1fr_112px_58px] items-center gap-2 rounded-lg border border-zinc-800 bg-black p-2.5">
      <p className="text-xs font-semibold text-zinc-300">{item.name}</p>
      <MoneyInput value={item.unitRate} onChange={(v) => onChange({ ...item, unitRate: v })} suffix="/mo" />
      <button
        onClick={() => onChange({ ...item, billsAsRental: !item.billsAsRental })}
        title={item.billsAsRental ? "Bills as rental revenue" : "Not billed as rental"}
        className={`rounded border px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] transition ${
          item.billsAsRental
            ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
            : "border-zinc-800 bg-black text-zinc-700 hover:text-zinc-500"
        }`}
      >
        {item.billsAsRental ? "bills" : "off"}
      </button>
    </div>
  );
}

function AddAlternateRow({ alternate, index, onChange }: { alternate: AddAlternateDefault; index: number; onChange: (alt: AddAlternateDefault) => void }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-zinc-300">AA #{index + 1} - {alternate.title}</p>
        <MoneyInput value={alternate.defaultValue} onChange={(v) => onChange({ ...alternate, defaultValue: v })} />
      </div>
      <p className="text-[10px] text-zinc-600">{alternate.description}</p>
    </div>
  );
}
