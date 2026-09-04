"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanManagementShell,
  type KorbanMenuLink,
} from "@/components/korban";
import { getActiveElevation, getActiveProject } from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";
import {
  BID_DEPTHS,
  DEFAULT_ESTIMATE_STATE,
  PRODUCTION_TYPES,
  loadEstimateState,
  saveEstimateState,
  type BidDepth,
  type ConsumableLine,
  type ProductionKey,
  type ProductionPhase,
} from "@/lib/estimateState";

// ─────────────────────────────────────────────────────────────────────────────
// Types and reference data
// ─────────────────────────────────────────────────────────────────────────────

type ProposalStatus = "Draft" | "Internal Review" | "Ready To Send" | "Submitted";

type BidRoundPhase =
  | "Budget / ROM"
  | "50% CD"
  | "75% CD"
  | "100% CD"
  | "GMP"
  | "Final Round"
  | "Awarded";

type TabKey = "breakdown" | "proposal";

const revisionHistory: { phase: BidRoundPhase; date: string; amount: number; note: string }[] = [
  { phase: "Budget / ROM", date: "05/02/26", amount: 171500, note: "Early budget number based on conceptual scaffold LF." },
  { phase: "50% CD", date: "05/13/26", amount: 184250, note: "Updated for expanded elevations and access conditions." },
  { phase: "75% CD", date: "05/24/26", amount: 192600, note: "Added revised plank counts and labor assumptions." },
  { phase: "100% CD", date: "06/02/26", amount: 201300, note: "Adjusted for final drawing set and rental duration." },
  { phase: "GMP", date: "06/08/26", amount: 198900, note: "Value engineering review reduced misc. scope exposure." },
  { phase: "Final Round", date: "06/14/26", amount: 196750, note: "Final internal review before submission." },
];

const bidRoundPhases: BidRoundPhase[] = [
  "Budget / ROM",
  "50% CD",
  "75% CD",
  "100% CD",
  "GMP",
  "Final Round",
  "Awarded",
];

const baseEstimate = {
  projectName: "Mare Island Apartments",
  projectAddress: "Mare Island, Vallejo, CA",
  customer: "Turner Construction",
  contactName: "Marcus Lee",
  contactEmail: "estimating@turner.com",
  contactPhone: "(510) 555-0138",
  estimator: "H. Pierre",
  bidDate: "06/14/26",
  proposalNumber: "KRB-260614-001",
  projectType: "Frame Scaffold",
  unionStatus: "Union",
  totalLinearFeet: 1240,
  bays: 124,
  legs: 125,
  jumps: 4,
  frames: 496,
  planks: 620,
  crossBraces: 496,
  guardrails: 372,
  basePlates: 125,
  screwJacks: 125,
  couplingPins: 750,
  truckLoads: 3,
  deliveryTrips: 2,
  pickupTrips: 2,
};

type EstimateData = typeof baseEstimate;

const addAlternates = [
  { id: 1, title: "Shrink wrap", description: "Shrink wrap enclosure at scaffold perimeter as directed.", value: 18400 },
  { id: 2, title: "Toe boards", description: "Toe boards at working deck elevations where required.", value: 6200 },
  { id: 3, title: "Debris netting", description: "Debris netting at scaffold exterior elevations.", value: 9800 },
  { id: 4, title: "Stair tower", description: "Scaffold stair tower access at field-determined location.", value: 14500 },
  { id: 5, title: "Pedestrian canopy", description: "Pedestrian canopy protection at designated access zones.", value: 22500 },
  { id: 6, title: "Hoist landing", description: "Hoist landing platform and required scaffold adjustments.", value: 12800 },
];

const estimateMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/takeoff-workspace", label: "Takeoff Workspace" },
  { href: "/projects", label: "Projects" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

const HOURS_PER_DAY = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EstimateReviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("breakdown");
  const [isHydrated, setIsHydrated] = useState(false);

  const [storedEstimate, setStoredEstimate] = useState<EstimateData | null>(null);
  const [elevationBreakdownRows, setElevationBreakdownRows] = useState<
    { elevation: string; approxLinearFeet: number }[]
  >([]);
  const [partialExteriorMarkupPercent, setPartialExteriorMarkupPercent] = useState(6);

  // Estimate state (shared with /margin-review)
  const [bidDepth, setBidDepth] = useState<BidDepth>(DEFAULT_ESTIMATE_STATE.bidDepth);
  const [rentalDays, setRentalDays] = useState(DEFAULT_ESTIMATE_STATE.rentalDays);
  const [frameRate, setFrameRate] = useState(DEFAULT_ESTIMATE_STATE.frameRate);
  const [plankRate, setPlankRate] = useState(DEFAULT_ESTIMATE_STATE.plankRate);
  const [consumables, setConsumables] = useState<ConsumableLine[]>(DEFAULT_ESTIMATE_STATE.consumables);

  const [erectRate, setErectRate] = useState(DEFAULT_ESTIMATE_STATE.erectRate);
  const [travelRate, setTravelRate] = useState(DEFAULT_ESTIMATE_STATE.travelRate);
  const [travelHours, setTravelHours] = useState(DEFAULT_ESTIMATE_STATE.travelHours);
  const [dismantlePercent, setDismantlePercent] = useState(DEFAULT_ESTIMATE_STATE.dismantlePercentOfErect);

  const [productionKey, setProductionKey] = useState<ProductionKey>(DEFAULT_ESTIMATE_STATE.productionKey);
  const [crewSize, setCrewSize] = useState(DEFAULT_ESTIMATE_STATE.crewSize);
  const [phaseModeOn, setPhaseModeOn] = useState(DEFAULT_ESTIMATE_STATE.phaseModeOn);
  const [phases, setPhases] = useState<ProductionPhase[]>(DEFAULT_ESTIMATE_STATE.phases);

  const [laborMarkupPercent, setLaborMarkupPercent] = useState(DEFAULT_ESTIMATE_STATE.laborMarkupPercent);
  const [miscRevenue, setMiscRevenue] = useState(DEFAULT_ESTIMATE_STATE.miscRevenue);

  // Proposal-tab state
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>("Draft");
  const [bidRoundPhase, setBidRoundPhase] = useState<BidRoundPhase>("Final Round");
  const [approvedAlternates, setApprovedAlternates] = useState<number[]>([]);
  const [proposalNotes, setProposalNotes] = useState(
    "Proposal includes furnishing, erecting, maintaining and dismantling frame scaffold based on the provided bid documents and current KORBAN takeoff assumptions."
  );

  // ── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function loadStoredEstimate() {
      const project = getActiveProject();
      const elevation = getActiveElevation();
      const quantityEngine = elevation.quantityEngine;

      setStoredEstimate({
        ...baseEstimate,
        projectName: project.projectName || baseEstimate.projectName,
        projectAddress: project.projectAddress || baseEstimate.projectAddress,
        customer: project.customer || baseEstimate.customer,
        estimator: project.estimator || baseEstimate.estimator,
        totalLinearFeet: elevation.linearFeet ?? baseEstimate.totalLinearFeet,
        bays: quantityEngine.bayCount ?? baseEstimate.bays,
        legs: quantityEngine.legCount ?? baseEstimate.legs,
        jumps: quantityEngine.jumps ?? baseEstimate.jumps,
        frames: quantityEngine.frameCount ?? baseEstimate.frames,
        planks: quantityEngine.plankCount ?? baseEstimate.planks,
        crossBraces: quantityEngine.crossBraceCount ?? baseEstimate.crossBraces,
        guardrails: quantityEngine.guardrailCount ?? baseEstimate.guardrails,
        basePlates: quantityEngine.basePlateCount ?? baseEstimate.basePlates,
        screwJacks: quantityEngine.screwJackCount ?? baseEstimate.screwJacks,
        couplingPins: quantityEngine.couplingPinCount ?? baseEstimate.couplingPins,
      });

      setElevationBreakdownRows(
        (elevation.elevationBreakdown || []).filter((row) => row.approxLinearFeet > 0)
      );

      const backendSettings = getBackendSettings();
      const pricing = backendSettings.pricing as unknown as Record<string, number | undefined>;
      const labor = backendSettings.labor as unknown as Record<string, number | undefined>;
      const saved = loadEstimateState();

      setPartialExteriorMarkupPercent(pricing.partialExteriorMarkupPercent ?? 6);

      // Rental rates: monthly per-piece rates. Backend wins, then saved, then default.
      // Guard against stale values — a frame does not rent for more than $10/mo.
      const backendFrameRate = pricing.frameMonthlyRate;
      const backendPlankRate = pricing.plankMonthlyRate;
      setFrameRate(
        backendFrameRate != null && backendFrameRate > 0 && backendFrameRate <= 10
          ? backendFrameRate
          : saved.frameRate
      );
      setPlankRate(
        backendPlankRate != null && backendPlankRate > 0 && backendPlankRate <= 10
          ? backendPlankRate
          : saved.plankRate
      );

      setErectRate(labor.erectHourlyRate ?? labor.journeymanRate ?? saved.erectRate);
      setTravelRate(labor.travelHourlyRate ?? saved.travelRate);
      setDismantlePercent(labor.dismantlePercentOfErect ?? saved.dismantlePercentOfErect);

      setBidDepth(saved.bidDepth);
      setRentalDays(saved.rentalDays);
      setConsumables(saved.consumables);
      setTravelHours(saved.travelHours);
      setProductionKey(saved.productionKey);
      setCrewSize(saved.crewSize);
      setPhaseModeOn(saved.phaseModeOn);
      setPhases(saved.phases);
      setLaborMarkupPercent(saved.laborMarkupPercent);
      setMiscRevenue(saved.miscRevenue);

      setIsHydrated(true);
    }

    const delay = window.setTimeout(loadStoredEstimate, 250);
    window.addEventListener("focus", loadStoredEstimate);
    window.addEventListener("pageshow", loadStoredEstimate);

    return () => {
      window.clearTimeout(delay);
      window.removeEventListener("focus", loadStoredEstimate);
      window.removeEventListener("pageshow", loadStoredEstimate);
    };
  }, []);

  const estimate = storedEstimate ?? baseEstimate;
  const selectedProduction =
    PRODUCTION_TYPES.find((type) => type.key === productionKey) ?? PRODUCTION_TYPES[1];
  const selectedDepth = BID_DEPTHS.find((depth) => depth.key === bidDepth) ?? BID_DEPTHS[2];

  // ── Math ───────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const rentalMonths = Math.max(1, Math.ceil(rentalDays / 30));

    const frameRental = estimate.frames * frameRate * rentalMonths;
    const plankRental = estimate.planks * plankRate * rentalMonths;
    const consumablesRevenue = consumables.reduce(
      (sum, line) => sum + line.quantity * line.unitRate,
      0
    );
    const rentalsRevenue = frameRental + plankRental + consumablesRevenue;

    const phaseManHours = phases.reduce(
      (sum, row) => sum + row.days * row.crews * row.menPerCrew * HOURS_PER_DAY,
      0
    );
    const phaseDays = phases.reduce((sum, row) => sum + row.days, 0);

    const productionDays = phaseModeOn ? phaseDays : selectedProduction.days;
    const erectHours = phaseModeOn ? phaseManHours : selectedProduction.days * crewSize * HOURS_PER_DAY;
    const dismantleHours = Math.round(erectHours * (dismantlePercent / 100));

    const erectCost = erectHours * erectRate;
    const dismantleCost = dismantleHours * erectRate;
    const travelCost = travelHours * travelRate;
    const laborCost = erectCost + dismantleCost + travelCost;

    const laborRevenue = Math.round(laborCost * (1 + laborMarkupPercent / 100));
    const alternateRevenue = addAlternates
      .filter((alternate) => approvedAlternates.includes(alternate.id))
      .reduce((sum, alternate) => sum + alternate.value, 0);

    const finalBid = Math.round(rentalsRevenue + laborRevenue + miscRevenue + alternateRevenue);

    const totalPieces =
      estimate.frames +
      estimate.planks +
      estimate.crossBraces +
      estimate.guardrails +
      estimate.basePlates +
      estimate.screwJacks +
      estimate.couplingPins;

    return {
      rentalMonths,
      frameRental,
      plankRental,
      consumablesRevenue,
      rentalsRevenue,
      productionDays,
      phaseDays,
      erectHours,
      dismantleHours,
      erectCost,
      dismantleCost,
      travelCost,
      laborCost,
      laborRevenue,
      alternateRevenue,
      finalBid,
      totalPieces,
    };
  }, [
    approvedAlternates,
    consumables,
    crewSize,
    dismantlePercent,
    erectRate,
    estimate,
    frameRate,
    laborMarkupPercent,
    miscRevenue,
    phaseModeOn,
    phases,
    plankRate,
    rentalDays,
    selectedProduction.days,
    travelHours,
    travelRate,
  ]);

  // ── Persist ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return;
    saveEstimateState({
      bidDepth,
      rentalDays,
      frameRate,
      plankRate,
      consumables,
      erectRate,
      travelRate,
      travelHours,
      dismantlePercentOfErect: dismantlePercent,
      productionKey,
      crewSize,
      phaseModeOn,
      phases,
      derived: {
        frames: estimate.frames,
        planks: estimate.planks,
        crossBraces: estimate.crossBraces,
        guardrails: estimate.guardrails,
        basePlates: estimate.basePlates,
        screwJacks: estimate.screwJacks,
        totalPieces: totals.totalPieces,
        linearFeet: estimate.totalLinearFeet,
        rentalsRevenue: totals.rentalsRevenue,
        consumablesRevenue: totals.consumablesRevenue,
        erectHours: totals.erectHours,
        dismantleHours: totals.dismantleHours,
        travelHours,
        erectCost: totals.erectCost,
        dismantleCost: totals.dismantleCost,
        travelCost: totals.travelCost,
        laborCost: totals.laborCost,
        productionDays: totals.productionDays,
        savedAt: Date.now(),
      },
    });
  }, [
    bidDepth,
    consumables,
    crewSize,
    dismantlePercent,
    erectRate,
    estimate,
    frameRate,
    isHydrated,
    phaseModeOn,
    phases,
    plankRate,
    productionKey,
    rentalDays,
    totals,
    travelHours,
    travelRate,
  ]);

  const activeRevision =
    revisionHistory.find((revision) => revision.phase === bidRoundPhase) ??
    revisionHistory[revisionHistory.length - 1];

  const elevationPricing = useMemo(() => {
    const totalEnteredLf = elevationBreakdownRows.reduce((sum, row) => sum + row.approxLinearFeet, 0);
    if (totalEnteredLf <= 0) return { rows: [], totalPartialCost: 0, hasData: false };
    const rows = elevationBreakdownRows.map((row) => {
      const share = row.approxLinearFeet / totalEnteredLf;
      const baseShare = share * totals.finalBid;
      return {
        elevation: row.elevation,
        approxLinearFeet: row.approxLinearFeet,
        sharePercent: share * 100,
        baseShare,
        partialPrice: baseShare * (1 + partialExteriorMarkupPercent / 100),
      };
    });
    return {
      rows,
      totalPartialCost: rows.reduce((sum, row) => sum + row.partialPrice, 0),
      hasData: true,
    };
  }, [elevationBreakdownRows, partialExteriorMarkupPercent, totals.finalBid]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function updateConsumable(id: string, field: "quantity" | "unitRate", value: number) {
    setConsumables((current) =>
      current.map((line) => (line.id === id ? { ...line, [field]: Math.max(0, value) } : line))
    );
  }

  function updatePhase(id: number, field: "days" | "crews" | "menPerCrew", value: number) {
    setPhases((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: Math.max(0, value) } : row))
    );
  }

  function renamePhase(id: number, name: string) {
    setPhases((current) => current.map((row) => (row.id === id ? { ...row, phase: name } : row)));
  }

  function addPhase() {
    setPhases((current) => [
      ...current,
      { id: Date.now(), phase: `Phase ${current.length + 1}`, days: 1, crews: 1, menPerCrew: crewSize },
    ]);
  }

  function removePhase(id: number) {
    setPhases((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  }

  function toggleAlternate(id: number) {
    setApprovedAlternates((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  if (!isHydrated) {
    return <main className="min-h-screen bg-korban-base text-white" />;
  }

  return (
    <KorbanManagementShell
      header={
        <KorbanHeader
          title="Estimate Review"
          subtitle={`${estimate.projectName} · ${estimate.proposalNumber}`}
          menuLinks={estimateMenuLinks}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((current) => !current)}
          actionsClassName="gap-3"
          actions={
            <>
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.07] px-4 py-2 text-right">
                <p className="text-[10px] tracking-[0.16em] text-zinc-500">Final bid</p>
                <p className="font-mono text-lg font-bold leading-tight text-orange-400">
                  {formatMoney(totals.finalBid)}
                </p>
              </div>
              <a
                href="/margin-review"
                className="rounded-xl border border-zinc-700 bg-zinc-400/[0.06] px-4 py-2.5 text-xs font-bold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-400/[0.1]"
              >
                Review margins ↗
              </a>
              <KorbanButton variant="primary" onClick={() => setProposalStatus("Submitted")}>
                Submit price
              </KorbanButton>
            </>
          }
        />
      }
      bodyClassName="p-4"
    >
      <TabStrip activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "breakdown" ? (
        <BreakdownTab
          estimate={estimate}
          bidDepth={bidDepth}
          setBidDepth={setBidDepth}
          selectedDepth={selectedDepth}
          rentalDays={rentalDays}
          setRentalDays={setRentalDays}
          frameRate={frameRate}
          plankRate={plankRate}
          consumables={consumables}
          updateConsumable={updateConsumable}
          totals={totals}
          erectRate={erectRate}
          setErectRate={setErectRate}
          travelRate={travelRate}
          setTravelRate={setTravelRate}
          travelHours={travelHours}
          setTravelHours={setTravelHours}
          dismantlePercent={dismantlePercent}
          productionKey={productionKey}
          setProductionKey={setProductionKey}
          crewSize={crewSize}
          setCrewSize={setCrewSize}
          phaseModeOn={phaseModeOn}
          setPhaseModeOn={setPhaseModeOn}
          phases={phases}
          updatePhase={updatePhase}
          renamePhase={renamePhase}
          addPhase={addPhase}
          removePhase={removePhase}
          selectedProductionDays={selectedProduction.days}
          bidRoundPhase={bidRoundPhase}
          setBidRoundPhase={setBidRoundPhase}
          activeRevision={activeRevision}
          elevationPricing={elevationPricing}
          partialExteriorMarkupPercent={partialExteriorMarkupPercent}
        />
      ) : (
        <ProposalTab
          estimate={estimate}
          rentalDays={rentalDays}
          rentalMonths={totals.rentalMonths}
          rentalsRevenue={totals.rentalsRevenue}
          laborRevenue={totals.laborRevenue}
          miscRevenue={miscRevenue}
          setMiscRevenue={setMiscRevenue}
          alternateRevenue={totals.alternateRevenue}
          finalBid={totals.finalBid}
          approvedAlternates={approvedAlternates}
          toggleAlternate={toggleAlternate}
          proposalNotes={proposalNotes}
          setProposalNotes={setProposalNotes}
          proposalStatus={proposalStatus}
          setProposalStatus={setProposalStatus}
          bidRoundPhase={bidRoundPhase}
          setBidRoundPhase={setBidRoundPhase}
        />
      )}
    </KorbanManagementShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function TabStrip({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "breakdown", label: "Breakdown" },
    { key: "proposal", label: "Proposal" },
  ];

  return (
    <div className="flex items-end gap-1 border-b border-zinc-800 px-1">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative rounded-t-lg border border-b-0 px-6 py-2.5 text-xs font-bold transition ${
              active
                ? "border-zinc-800 bg-[#0b0b0b] text-white"
                : "border-transparent bg-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-1 left-1/2 h-px w-6 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown tab
// ─────────────────────────────────────────────────────────────────────────────

type TotalsShape = {
  rentalMonths: number;
  frameRental: number;
  plankRental: number;
  consumablesRevenue: number;
  rentalsRevenue: number;
  productionDays: number;
  phaseDays: number;
  erectHours: number;
  dismantleHours: number;
  erectCost: number;
  dismantleCost: number;
  travelCost: number;
  laborCost: number;
  laborRevenue: number;
  alternateRevenue: number;
  finalBid: number;
  totalPieces: number;
};

function BreakdownTab(props: {
  estimate: EstimateData;
  bidDepth: BidDepth;
  setBidDepth: (depth: BidDepth) => void;
  selectedDepth: (typeof BID_DEPTHS)[number];
  rentalDays: number;
  setRentalDays: (days: number) => void;
  frameRate: number;
  plankRate: number;
  consumables: ConsumableLine[];
  updateConsumable: (id: string, field: "quantity" | "unitRate", value: number) => void;
  totals: TotalsShape;
  erectRate: number;
  setErectRate: (rate: number) => void;
  travelRate: number;
  setTravelRate: (rate: number) => void;
  travelHours: number;
  setTravelHours: (hours: number) => void;
  dismantlePercent: number;
  productionKey: ProductionKey;
  setProductionKey: (key: ProductionKey) => void;
  crewSize: number;
  setCrewSize: (size: number) => void;
  phaseModeOn: boolean;
  setPhaseModeOn: (on: boolean) => void;
  phases: ProductionPhase[];
  updatePhase: (id: number, field: "days" | "crews" | "menPerCrew", value: number) => void;
  renamePhase: (id: number, name: string) => void;
  addPhase: () => void;
  removePhase: (id: number) => void;
  selectedProductionDays: number;
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
  activeRevision: { phase: BidRoundPhase; date: string; amount: number; note: string };
  elevationPricing: {
    rows: { elevation: string; approxLinearFeet: number; sharePercent: number; baseShare: number; partialPrice: number }[];
    totalPartialCost: number;
    hasData: boolean;
  };
  partialExteriorMarkupPercent: number;
}) {
  const {
    estimate, bidDepth, setBidDepth, selectedDepth, rentalDays, setRentalDays,
    frameRate, plankRate, consumables, updateConsumable, totals,
    erectRate, setErectRate, travelRate, setTravelRate, travelHours, setTravelHours,
    dismantlePercent, productionKey, setProductionKey, crewSize, setCrewSize,
    phaseModeOn, setPhaseModeOn, phases, updatePhase, renamePhase, addPhase, removePhase,
    selectedProductionDays, bidRoundPhase, setBidRoundPhase, activeRevision,
    elevationPricing, partialExteriorMarkupPercent,
  } = props;

  return (
    <div className="rounded-b-[1.25rem] rounded-tr-[1.25rem] border border-t-0 border-zinc-800 bg-[#0b0b0b] p-4">
      <DepthSelector bidDepth={bidDepth} setBidDepth={setBidDepth} selectedDepth={selectedDepth} />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RentalPanel
          frames={estimate.frames}
          planks={estimate.planks}
          frameRate={frameRate}
          plankRate={plankRate}
          rentalDays={rentalDays}
          setRentalDays={setRentalDays}
          rentalMonths={totals.rentalMonths}
          frameRental={totals.frameRental}
          plankRental={totals.plankRental}
          consumables={consumables}
          updateConsumable={updateConsumable}
          consumablesRevenue={totals.consumablesRevenue}
          rentalsRevenue={totals.rentalsRevenue}
        />

        <LaborPanel
          erectHours={totals.erectHours}
          dismantleHours={totals.dismantleHours}
          travelHours={travelHours}
          setTravelHours={setTravelHours}
          erectRate={erectRate}
          setErectRate={setErectRate}
          travelRate={travelRate}
          setTravelRate={setTravelRate}
          erectCost={totals.erectCost}
          dismantleCost={totals.dismantleCost}
          travelCost={totals.travelCost}
          laborCost={totals.laborCost}
          dismantlePercent={dismantlePercent}
        />
      </div>

      <ProductionPanel
        productionKey={productionKey}
        setProductionKey={setProductionKey}
        crewSize={crewSize}
        setCrewSize={setCrewSize}
        phaseModeOn={phaseModeOn}
        setPhaseModeOn={setPhaseModeOn}
        phases={phases}
        updatePhase={updatePhase}
        renamePhase={renamePhase}
        addPhase={addPhase}
        removePhase={removePhase}
        selectedProductionDays={selectedProductionDays}
        phaseDays={totals.phaseDays}
        erectHours={totals.erectHours}
        dismantleHours={totals.dismantleHours}
        dismantlePercent={dismantlePercent}
      />

      <RevisionHistory
        bidRoundPhase={bidRoundPhase}
        setBidRoundPhase={setBidRoundPhase}
        activeRevision={activeRevision}
      />

      <PartialExteriorAccordion
        completeExteriorCost={totals.finalBid}
        elevationPricing={elevationPricing}
        partialExteriorMarkupPercent={partialExteriorMarkupPercent}
      />
    </div>
  );
}

function DepthSelector({
  bidDepth,
  setBidDepth,
  selectedDepth,
}: {
  bidDepth: BidDepth;
  setBidDepth: (depth: BidDepth) => void;
  selectedDepth: (typeof BID_DEPTHS)[number];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-[#0f0f0f] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="mr-2 text-[11px] text-zinc-500">Quantities from</span>
        {BID_DEPTHS.map((depth) => {
          const active = depth.key === bidDepth;
          return (
            <button
              key={depth.key}
              onClick={() => setBidDepth(depth.key)}
              className={`rounded-lg border px-3.5 py-1.5 text-[11px] font-bold transition ${
                active
                  ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 bg-black text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {depth.title}
            </button>
          );
        })}
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-bold text-zinc-300">
          {selectedDepth.accuracy}
          <span className="ml-2 text-[10px] font-normal text-zinc-600">expected accuracy</span>
        </p>
        <p className="mt-0.5 text-[10px] text-zinc-600">{selectedDepth.feeds}</p>
      </div>
    </div>
  );
}

// ── Rental panel ─────────────────────────────────────────────────────────────

function RentalPanel({
  frames, planks, frameRate, plankRate, rentalDays, setRentalDays, rentalMonths,
  frameRental, plankRental, consumables, updateConsumable, consumablesRevenue, rentalsRevenue,
}: {
  frames: number; planks: number; frameRate: number; plankRate: number;
  rentalDays: number; setRentalDays: (days: number) => void; rentalMonths: number;
  frameRental: number; plankRental: number;
  consumables: ConsumableLine[];
  updateConsumable: (id: string, field: "quantity" | "unitRate", value: number) => void;
  consumablesRevenue: number; rentalsRevenue: number;
}) {
  const durationOptions = [30, 60, 90, 120];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Rental</h3>
        <div className="flex items-center gap-1">
          {durationOptions.map((days) => (
            <button
              key={days}
              onClick={() => setRentalDays(days)}
              className={`rounded-md border px-2.5 py-1 text-[10px] font-bold transition ${
                rentalDays === days
                  ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
                  : "border-zinc-800 bg-[#0f0f0f] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {days}d
            </button>
          ))}
          <input
            value={rentalDays}
            onChange={(event) => setRentalDays(Math.max(1, Number(event.target.value || 0)))}
            type="number"
            className="ml-1 w-16 rounded-md border border-zinc-800 bg-[#0f0f0f] px-2 py-1 text-right font-mono text-[10px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <BigQuantity
          label="Frames"
          quantity={frames}
          rateLine={`$${frameRate.toFixed(2)}/ea · mo`}
          extended={frameRental}
        />
        <BigQuantity
          label="Planks"
          quantity={planks}
          rateLine={`$${plankRate.toFixed(2)}/ea · mo`}
          extended={plankRental}
        />
      </div>

      <p className="mt-3 font-mono text-[10px] text-zinc-600">
        {rentalMonths} billing month{rentalMonths === 1 ? "" : "s"} applied
      </p>

      <div className="my-4 h-px bg-zinc-800" />

      <p className="text-[11px] font-bold text-zinc-400">Consumables</p>
      <div className="mt-2 space-y-1.5">
        {consumables.map((line) => (
          <div
            key={line.id}
            className="grid grid-cols-[1fr_72px_84px_96px] items-center gap-2 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2"
          >
            <span className="text-[11px] text-zinc-400">{line.label}</span>
            <input
              value={line.quantity}
              onChange={(event) => updateConsumable(line.id, "quantity", Number(event.target.value || 0))}
              type="number"
              className="rounded-md border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
            />
            <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-black px-2 py-1">
              <span className="font-mono text-[10px] text-zinc-600">$</span>
              <input
                value={line.unitRate}
                onChange={(event) => updateConsumable(line.id, "unitRate", Number(event.target.value || 0))}
                type="number"
                step="0.01"
                className="w-full min-w-0 bg-transparent text-right font-mono text-[11px] font-bold text-zinc-300 outline-none"
              />
            </div>
            <span className="text-right font-mono text-[11px] font-bold text-zinc-300">
              {formatMoney(line.quantity * line.unitRate)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between px-3">
        <span className="text-[10px] text-zinc-600">Consumables subtotal</span>
        <span className="font-mono text-[11px] font-bold text-zinc-400">
          {formatMoney(consumablesRevenue)}
        </span>
      </div>

      <div className="my-4 h-px bg-zinc-800" />

      <PanelTotal label={`Rental revenue · ${rentalDays} days`} value={rentalsRevenue} />
    </section>
  );
}

function BigQuantity({
  label,
  quantity,
  rateLine,
  extended,
}: {
  label: string;
  quantity: number;
  rateLine: string;
  extended: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="font-mono text-[11px] font-bold text-zinc-400">{formatMoney(extended)}</span>
      </div>
      <p className="mt-1.5 font-mono text-[28px] font-black leading-none text-orange-400">
        {quantity.toLocaleString()}
      </p>
      <p className="mt-1.5 font-mono text-[10px] text-zinc-600">{rateLine}</p>
    </div>
  );
}

// ── Labor panel ──────────────────────────────────────────────────────────────

function LaborPanel({
  erectHours, dismantleHours, travelHours, setTravelHours,
  erectRate, setErectRate, travelRate, setTravelRate,
  erectCost, dismantleCost, travelCost, laborCost, dismantlePercent,
}: {
  erectHours: number; dismantleHours: number; travelHours: number;
  setTravelHours: (hours: number) => void;
  erectRate: number; setErectRate: (rate: number) => void;
  travelRate: number; setTravelRate: (rate: number) => void;
  erectCost: number; dismantleCost: number; travelCost: number; laborCost: number;
  dismantlePercent: number;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-black p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Labor</h3>
        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-[#0f0f0f] px-2 py-1">
          <span className="font-mono text-[10px] text-zinc-600">$</span>
          <input
            value={erectRate}
            onChange={(event) => setErectRate(Math.max(0, Number(event.target.value || 0)))}
            type="number"
            className="w-14 bg-transparent text-right font-mono text-[11px] font-bold text-zinc-300 outline-none"
          />
          <span className="text-[10px] text-zinc-600">/hr</span>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <LaborLine label="Stock in" deferred note="Set by Korban Review" />
        <LaborLine label="Stock out" deferred note="Set by Korban Review" />
      </div>

      <div className="my-3 h-px bg-zinc-800" />

      <div className="space-y-1.5">
        <LaborLine label="Erect" hours={erectHours} rate={erectRate} cost={erectCost} />
        <LaborLine
          label="Dismantle"
          hours={dismantleHours}
          rate={erectRate}
          cost={dismantleCost}
          readOnly
          note={`${dismantlePercent}% of erect · from backend settings`}
        />
      </div>

      <div className="my-3 h-px bg-zinc-800" />

      <div className="space-y-1.5">
        <LaborLine
          label="Travel"
          hours={travelHours}
          rate={travelRate}
          cost={travelCost}
          onHoursChange={setTravelHours}
          onRateChange={setTravelRate}
        />
      </div>

      <div className="my-4 h-px bg-zinc-800" />

      <PanelTotal label="Labor cost" value={laborCost} />
    </section>
  );
}

function LaborLine({
  label, hours, rate, cost, onHoursChange, onRateChange, readOnly, deferred, note,
}: {
  label: string;
  hours?: number;
  rate?: number;
  cost?: number;
  onHoursChange?: (hours: number) => void;
  onRateChange?: (rate: number) => void;
  readOnly?: boolean;
  deferred?: boolean;
  note?: string;
}) {
  if (deferred) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-[#0d0d0d] px-3 py-2.5">
        <span className="text-[11px] text-zinc-600">{label}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-700">{note}</span>
          <span className="font-mono text-[11px] text-zinc-700">—</span>
        </div>
      </div>
    );
  }

  const dim = readOnly ? "text-zinc-500" : "text-zinc-300";

  return (
    <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[11px] ${readOnly ? "text-zinc-500" : "text-zinc-300"}`}>{label}</span>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">
            {onHoursChange ? (
              <input
                value={hours ?? 0}
                onChange={(event) => onHoursChange(Math.max(0, Number(event.target.value || 0)))}
                type="number"
                className="w-14 rounded-md border border-zinc-800 bg-black px-1.5 py-0.5 text-right font-mono text-[10px] text-zinc-400 outline-none focus:border-orange-500/40"
              />
            ) : (
              (hours ?? 0).toLocaleString()
            )}
            <span className="mx-1">hrs ×</span>
            {onRateChange ? (
              <input
                value={rate ?? 0}
                onChange={(event) => onRateChange(Math.max(0, Number(event.target.value || 0)))}
                type="number"
                className="w-12 rounded-md border border-zinc-800 bg-black px-1.5 py-0.5 text-right font-mono text-[10px] text-zinc-400 outline-none focus:border-orange-500/40"
              />
            ) : (
              `$${rate ?? 0}`
            )}
          </span>
          <span className={`w-24 text-right font-mono text-[12px] font-bold ${dim}`}>
            {formatMoney(cost ?? 0)}
          </span>
        </div>
      </div>
      {note && <p className="mt-1 font-mono text-[10px] text-zinc-600">{note}</p>}
    </div>
  );
}

// ── Production panel ─────────────────────────────────────────────────────────

function ProductionPanel({
  productionKey, setProductionKey, crewSize, setCrewSize, phaseModeOn, setPhaseModeOn,
  phases, updatePhase, renamePhase, addPhase, removePhase,
  selectedProductionDays, phaseDays, erectHours, dismantleHours, dismantlePercent,
}: {
  productionKey: ProductionKey;
  setProductionKey: (key: ProductionKey) => void;
  crewSize: number;
  setCrewSize: (size: number) => void;
  phaseModeOn: boolean;
  setPhaseModeOn: (on: boolean) => void;
  phases: ProductionPhase[];
  updatePhase: (id: number, field: "days" | "crews" | "menPerCrew", value: number) => void;
  renamePhase: (id: number, name: string) => void;
  addPhase: () => void;
  removePhase: (id: number) => void;
  selectedProductionDays: number;
  phaseDays: number;
  erectHours: number;
  dismantleHours: number;
  dismantlePercent: number;
}) {
  const overBudget = phaseDays > selectedProductionDays;

  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-black p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-xs font-bold tracking-[0.18em] text-zinc-300">Production</h3>
          {PRODUCTION_TYPES.map((type) => {
            const active = type.key === productionKey;
            return (
              <button
                key={type.key}
                onClick={() => setProductionKey(type.key)}
                title={type.note}
                className={`rounded-lg border px-3.5 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "border-white/30 bg-white/[0.06] text-white shadow-[0_0_16px_rgba(255,255,255,0.12)]"
                    : "border-zinc-800 bg-[#0f0f0f] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {type.title}
                <span className="ml-2 font-mono font-normal text-zinc-500">{type.days}d</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setPhaseModeOn(!phaseModeOn)}
          className={`flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
            phaseModeOn
              ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
              : "border-zinc-800 bg-[#0f0f0f] text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <span
            className={`h-3.5 w-6 rounded-full border transition ${
              phaseModeOn ? "border-zinc-400 bg-zinc-300" : "border-zinc-700 bg-zinc-800"
            }`}
          >
            <span
              className={`block h-2.5 w-2.5 translate-y-[1px] rounded-full bg-black transition ${
                phaseModeOn ? "translate-x-[11px]" : "translate-x-[2px]"
              }`}
            />
          </span>
          Phase production
        </button>
      </div>

      {!phaseModeOn ? (
        <div className="mt-4 flex flex-wrap items-end gap-6 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-4 py-4">
          <p className="font-mono text-[22px] font-bold leading-none text-zinc-200">
            {selectedProductionDays} days
            <span className="mx-2 text-zinc-700">·</span>
            <span className="inline-flex items-baseline gap-1.5">
              <input
                value={crewSize}
                onChange={(event) => setCrewSize(Math.max(1, Number(event.target.value || 1)))}
                type="number"
                className="w-14 rounded-md border border-zinc-800 bg-black px-2 py-0.5 text-right font-mono text-[20px] font-bold text-zinc-200 outline-none focus:border-orange-500/40"
              />
              <span className="text-[13px] font-normal text-zinc-500">laborers</span>
            </span>
          </p>
          <div className="ml-auto text-right">
            <p className="font-mono text-[11px] text-zinc-500">
              {erectHours.toLocaleString()} erect hrs
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
              + {dismantleHours.toLocaleString()} dismantle hrs at {dismantlePercent}%
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-[1fr_72px_72px_96px_110px_40px] gap-2 px-3 pb-1.5">
            {["Phase", "Days", "Crews", "Men per crew", "Man-hours", ""].map((heading) => (
              <span key={heading} className="text-[10px] tracking-[0.1em] text-zinc-600">
                {heading}
              </span>
            ))}
          </div>

          <div className="space-y-1.5">
            {phases.map((row) => {
              const manHours = row.days * row.crews * row.menPerCrew * HOURS_PER_DAY;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_72px_72px_96px_110px_40px] items-center gap-2 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2"
                >
                  <input
                    value={row.phase}
                    onChange={(event) => renamePhase(row.id, event.target.value)}
                    className="rounded-md border border-transparent bg-transparent px-1 py-1 text-[11px] text-zinc-300 outline-none focus:border-zinc-800 focus:bg-black"
                  />
                  <PhaseNumber value={row.days} onChange={(value) => updatePhase(row.id, "days", value)} />
                  <PhaseNumber value={row.crews} onChange={(value) => updatePhase(row.id, "crews", value)} />
                  <PhaseNumber value={row.menPerCrew} onChange={(value) => updatePhase(row.id, "menPerCrew", value)} />
                  <span className="text-right font-mono text-[11px] font-bold text-zinc-300">
                    {manHours.toLocaleString()}
                  </span>
                  <button
                    onClick={() => removePhase(row.id)}
                    className="text-center text-[10px] font-bold text-zinc-700 hover:text-red-400"
                    aria-label={`Remove ${row.phase}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-4 px-3">
            <button
              onClick={addPhase}
              className="rounded-lg border border-zinc-800 bg-[#0f0f0f] px-3 py-1.5 text-[11px] font-bold text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Add phase
            </button>
            <div className="text-right">
              <p className={`font-mono text-[12px] font-bold ${overBudget ? "text-red-400" : "text-zinc-300"}`}>
                {phaseDays} of {selectedProductionDays} days
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                {erectHours.toLocaleString()} erect hrs · dismantle derives at {dismantlePercent}%
              </p>
            </div>
          </div>

          {overBudget && (
            <p className="mt-2 px-3 font-mono text-[10px] text-red-400">
              Phases exceed the day budget for this production type.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PhaseNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(Number(event.target.value || 0))}
      type="number"
      className="rounded-md border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
    />
  );
}

// ── Revision history ─────────────────────────────────────────────────────────

function RevisionHistory({
  bidRoundPhase,
  setBidRoundPhase,
  activeRevision,
}: {
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
  activeRevision: { phase: BidRoundPhase; date: string; amount: number; note: string };
}) {
  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-black p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Revision history</h3>
        <span className="font-mono text-[10px] text-zinc-600">
          {activeRevision.date} · {activeRevision.note}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {revisionHistory.map((revision) => {
          const active = revision.phase === bidRoundPhase;
          return (
            <button
              key={revision.phase}
              onClick={() => setBidRoundPhase(revision.phase)}
              title={revision.note}
              className={`rounded-lg border px-3 py-1.5 text-[10px] transition ${
                active
                  ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 bg-[#0f0f0f] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              <span className="font-bold">{revision.phase}</span>
              <span className="ml-2 font-mono">{formatMoney(revision.amount)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Partial exterior (kept, collapsed) ───────────────────────────────────────

function PartialExteriorAccordion({
  completeExteriorCost,
  elevationPricing,
  partialExteriorMarkupPercent,
}: {
  completeExteriorCost: number;
  elevationPricing: {
    rows: { elevation: string; approxLinearFeet: number; sharePercent: number; baseShare: number; partialPrice: number }[];
    totalPartialCost: number;
    hasData: boolean;
  };
  partialExteriorMarkupPercent: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 rounded-2xl border border-zinc-800 bg-black">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <span className="text-xs font-bold tracking-[0.18em] text-zinc-400">
          Complete vs partial exterior
        </span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">+{partialExteriorMarkupPercent}% partial markup</span>
          <span className="text-[11px] text-zinc-600">{open ? "−" : "+"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-900 p-4">
          <p className="text-[11px] leading-5 text-zinc-500">
            Partial pricing reflects the added cost of mobilizing elevation by elevation instead of
            as one complete exterior job.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3">
              <p className="text-[10px] text-zinc-600">Complete exterior</p>
              <p className="mt-1 font-mono text-lg font-bold text-zinc-200">
                {formatMoney(completeExteriorCost)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3">
              <p className="text-[10px] text-zinc-600">Partial exterior</p>
              <p className="mt-1 font-mono text-lg font-bold text-zinc-200">
                {elevationPricing.hasData ? formatMoney(elevationPricing.totalPartialCost) : "—"}
              </p>
              {!elevationPricing.hasData && (
                <p className="mt-1 text-[10px] text-zinc-600">
                  Enter approximate LF per elevation in Takeoff Workspace to see this.
                </p>
              )}
            </div>
          </div>

          {elevationPricing.hasData && (
            <div className="mt-3 space-y-1.5">
              {elevationPricing.rows.map((row) => (
                <div
                  key={row.elevation}
                  className="grid grid-cols-[80px_1fr_100px_110px] items-center gap-3 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2 text-[11px]"
                >
                  <span className="font-bold text-zinc-300">{row.elevation}</span>
                  <span className="font-mono text-zinc-600">
                    {row.approxLinearFeet.toLocaleString()} LF · {row.sharePercent.toFixed(0)}%
                  </span>
                  <span className="text-right font-mono text-zinc-600">{formatMoney(row.baseShare)}</span>
                  <span className="text-right font-mono font-bold text-zinc-300">
                    {formatMoney(row.partialPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal tab — carried over from the old page, to be completed in Phase 4
// ─────────────────────────────────────────────────────────────────────────────

function ProposalTab({
  estimate, rentalDays, rentalMonths, rentalsRevenue, laborRevenue,
  miscRevenue, setMiscRevenue, alternateRevenue, finalBid,
  approvedAlternates, toggleAlternate, proposalNotes, setProposalNotes,
  proposalStatus, setProposalStatus, bidRoundPhase, setBidRoundPhase,
}: {
  estimate: EstimateData;
  rentalDays: number;
  rentalMonths: number;
  rentalsRevenue: number;
  laborRevenue: number;
  miscRevenue: number;
  setMiscRevenue: (value: number) => void;
  alternateRevenue: number;
  finalBid: number;
  approvedAlternates: number[];
  toggleAlternate: (id: number) => void;
  proposalNotes: string;
  setProposalNotes: (notes: string) => void;
  proposalStatus: ProposalStatus;
  setProposalStatus: (status: ProposalStatus) => void;
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
}) {
  return (
    <div className="rounded-b-[1.25rem] rounded-tr-[1.25rem] border border-t-0 border-zinc-800 bg-[#0b0b0b] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-800 bg-black p-5">
            <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Project and customer</h3>
            <div className="mt-4 grid gap-x-8 gap-y-2 md:grid-cols-2">
              <InfoRow label="Project" value={estimate.projectName} />
              <InfoRow label="Customer" value={estimate.customer} />
              <InfoRow label="Address" value={estimate.projectAddress} />
              <InfoRow label="Contact" value={estimate.contactName} />
              <InfoRow label="Scaffold type" value={estimate.projectType} />
              <InfoRow label="Email" value={estimate.contactEmail} />
              <InfoRow label="Estimator" value={estimate.estimator} />
              <InfoRow label="Phone" value={estimate.contactPhone} />
              <InfoRow label="Union status" value={estimate.unionStatus} />
              <InfoRow label="Bid date" value={estimate.bidDate} />
              <InfoRow label="Coverage" value={`${estimate.totalLinearFeet.toLocaleString()} LF`} />
              <InfoRow label="Rental" value={`${rentalDays} days · ${rentalMonths} mo.`} />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-black p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Add alternates</h3>
              <p className="text-[10px] text-zinc-600">Excluded unless selected. Priced separately.</p>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {addAlternates.map((alternate) => {
                const included = approvedAlternates.includes(alternate.id);
                return (
                  <button
                    key={alternate.id}
                    onClick={() => toggleAlternate(alternate.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      included
                        ? "border-orange-500/50 bg-orange-500/[0.07]"
                        : "border-zinc-900 bg-[#0f0f0f] hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold text-zinc-200">{alternate.title}</p>
                        <p className="mt-1 text-[10px] leading-4 text-zinc-500">{alternate.description}</p>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-zinc-300">
                        {formatMoney(alternate.value)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-black p-5">
            <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Proposal notes</h3>
            <textarea
              value={proposalNotes}
              onChange={(event) => setProposalNotes(event.target.value)}
              className="mt-3 min-h-28 w-full resize-none rounded-xl border border-zinc-900 bg-[#0f0f0f] p-3 text-[12px] leading-6 text-zinc-300 outline-none focus:border-orange-500/40"
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-800 bg-black p-5">
            <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Price to client</h3>
            <div className="mt-4 space-y-2">
              <FigureRow label="Rental" value={rentalsRevenue} />
              <FigureRow label="Labor" value={laborRevenue} />
              <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2">
                <span className="text-[11px] text-zinc-500">Misc</span>
                <input
                  value={miscRevenue}
                  onChange={(event) => setMiscRevenue(Number(event.target.value || 0))}
                  type="number"
                  className="w-28 rounded-md border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-zinc-300 outline-none focus:border-orange-500/40"
                />
              </div>
              <FigureRow label="Alternates" value={alternateRevenue} />
            </div>
            <div className="my-4 h-px bg-zinc-800" />
            <PanelTotal label="Proposal total" value={finalBid} />
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-black p-5">
            <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Status</h3>
            <div className="mt-3 grid gap-1.5">
              {(["Draft", "Internal Review", "Ready To Send", "Submitted"] as ProposalStatus[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setProposalStatus(status)}
                    className={`rounded-lg border px-3 py-2 text-left text-[11px] font-bold transition ${
                      proposalStatus === status
                        ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                        : "border-zinc-900 bg-[#0f0f0f] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {status}
                  </button>
                )
              )}
            </div>

            <div className="my-4 h-px bg-zinc-800" />

            <h3 className="text-xs font-bold tracking-[0.18em] text-zinc-300">Bid round</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bidRoundPhases.map((phase) => (
                <button
                  key={phase}
                  onClick={() => setBidRoundPhase(phase)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                    bidRoundPhase === phase
                      ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
                      : "border-zinc-900 bg-[#0f0f0f] text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {phase}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-2">
              <button className="rounded-lg border border-zinc-800 bg-[#0f0f0f] px-4 py-2.5 text-[12px] font-bold text-zinc-400 hover:border-zinc-600 hover:text-zinc-200">
                Export PDF
              </button>
              <button
                onClick={() => setProposalStatus("Ready To Send")}
                className="rounded-lg bg-orange-500 px-4 py-2.5 text-[12px] font-bold text-black hover:bg-orange-400"
              >
                Send proposal
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

function PanelTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span
        className="text-[24px] font-bold leading-none text-orange-400"
        style={{ fontFamily: "'Barlow Condensed', ui-sans-serif, system-ui" }}
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-1.5">
      <span className="text-[11px] text-zinc-600">{label}</span>
      <span className="text-right text-[11px] font-semibold text-zinc-300">{value}</span>
    </div>
  );
}

function FigureRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-900 bg-[#0f0f0f] px-3 py-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="font-mono text-[11px] font-bold text-zinc-300">{formatMoney(value)}</span>
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
