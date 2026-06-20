"use client";

import { useEffect, useMemo, useState } from "react";
import { KorbanButton, KorbanHeader, KorbanHeaderMeta, KorbanManagementShell, type KorbanMenuLink } from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

type RentalDuration = "30 Days" | "60 Days" | "90 Days" | "120 Days" | "Custom";
type ProposalStatus = "Draft" | "Internal Review" | "Ready To Send" | "Submitted";
type BidRoundPhase =
  | "Budget / ROM"
  | "50% CD"
  | "75% CD"
  | "100% CD"
  | "GMP"
  | "Final Round"
  | "Awarded";

type ExtraMaterialItem = {
  id: number;
  item: string;
  quantity: number;
  unitRate: number;
};

type InstallMixItem = {
  id: number;
  phase: string;
  days: number;
  laborers: number;
  note: string;
};

const rentalDurationOptions: RentalDuration[] = ["30 Days", "60 Days", "90 Days", "120 Days", "Custom"];

const bidRoundPhases: BidRoundPhase[] = [
  "Budget / ROM",
  "50% CD",
  "75% CD",
  "100% CD",
  "GMP",
  "Final Round",
  "Awarded",
];

const revisionHistory: {
  phase: BidRoundPhase;
  date: string;
  amount: number;
  note: string;
}[] = [
  {
    phase: "Budget / ROM",
    date: "05/02/26",
    amount: 171500,
    note: "Early budget number based on conceptual scaffold LF.",
  },
  {
    phase: "50% CD",
    date: "05/13/26",
    amount: 184250,
    note: "Updated for expanded elevations and access conditions.",
  },
  {
    phase: "75% CD",
    date: "05/24/26",
    amount: 192600,
    note: "Added revised plank counts and labor assumptions.",
  },
  {
    phase: "100% CD",
    date: "06/02/26",
    amount: 201300,
    note: "Adjusted for final drawing set and rental duration.",
  },
  {
    phase: "GMP",
    date: "06/08/26",
    amount: 198900,
    note: "Value engineering review reduced misc. scope exposure.",
  },
  {
    phase: "Final Round",
    date: "06/14/26",
    amount: 196750,
    note: "Final internal review before submission.",
  },
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
  erectDays: 5,
  dismantleDays: 3,
  truckLoads: 3,
  deliveryTrips: 2,
  pickupTrips: 2,
};

type EstimateData = typeof baseEstimate;

const estimateMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/takeoff-workspace", label: "Takeoff Workspace" },
  { href: "/projects", label: "Projects" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

const standardMaterialInputs = [
  {
    item: "Frames",
    quantity: baseEstimate.frames,
    unitRate: 14.5,
    source: "Backend > Material Pricing",
  },
  {
    item: "Planks",
    quantity: baseEstimate.planks,
    unitRate: 6.75,
    source: "Backend > Material Pricing",
  },
];

const laborRates = [
  {
    type: "Apprentice",
    abbreviation: "APP",
    rate: 48,
  },
  {
    type: "Journeyman",
    abbreviation: "JOURN",
    rate: 72,
  },
  {
    type: "Foreman",
    abbreviation: "FORMAN",
    rate: 85,
  },
];

const productionTypes = [
  {
    key: "Conservative",
    title: "Conservative",
    installDays: 6,
    productionRate: "Slower / safer",
    note: "Used when access is difficult, plans are unclear, or field risk is higher.",
  },
  {
    key: "Balanced",
    title: "Conventional",
    installDays: 5,
    productionRate: "Standard",
    note: "Default estimator production assumption for typical frame scaffold work.",
  },
  {
    key: "Competitive",
    title: "Competitive",
    installDays: 4,
    productionRate: "Aggressive",
    note: "Used when schedule, access, and repetition support a tighter labor number.",
  },
] as const;

type ProductionType = (typeof productionTypes)[number]["key"];

const defaultInstallMix: InstallMixItem[] = [
  {
    id: 1,
    phase: "Install Breakdown",
    days: 5,
    laborers: 4,
    note: "Primary install crew mix used for selected production type.",
  },
];

const dismantleBackendPercent = 60;

const addAlternates = [
  {
    id: 1,
    title: "Shrink Wrap",
    description: "Provide shrink wrap enclosure at scaffold perimeter as directed by client.",
    value: 18400,
  },
  {
    id: 2,
    title: "Toe Boards",
    description: "Provide toe boards at working deck elevations where required.",
    value: 6200,
  },
  {
    id: 3,
    title: "Debris Netting",
    description: "Provide debris netting at scaffold exterior elevations.",
    value: 9800,
  },
  {
    id: 4,
    title: "Stair Tower",
    description: "Provide scaffold stair tower access at field-determined location.",
    value: 14500,
  },
  {
    id: 5,
    title: "Pedestrian Canopy",
    description: "Provide pedestrian canopy protection at designated access zones.",
    value: 22500,
  },
  {
    id: 6,
    title: "Hoist Landing",
    description: "Provide hoist landing platform and required scaffold adjustments.",
    value: 12800,
  },
];

export default function EstimateReviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rentalDuration, setRentalDuration] = useState<RentalDuration>("30 Days");
  const [customRentalDays, setCustomRentalDays] = useState("45");
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>("Draft");
  const [bidRoundPhase, setBidRoundPhase] = useState<BidRoundPhase>("Final Round");

  const [frameRate, setFrameRate] = useState(14.5);
  const [plankRate, setPlankRate] = useState(6.75);
  const [extraMaterialItems, setExtraMaterialItems] = useState<ExtraMaterialItem[]>([]);

  const [productionType, setProductionType] = useState<ProductionType>("Balanced");
  const [installMix, setInstallMix] = useState<InstallMixItem[]>(defaultInstallMix);
  const [appRate, setAppRate] = useState(48);
  const [journeyRate, setJourneyRate] = useState(72);
  const [foremanRate, setForemanRate] = useState(85);
  const [laborRevenue, setLaborRevenue] = useState(48750);

  const [baseMonthlyRentalRevenue, setBaseMonthlyRentalRevenue] = useState(52600);
  const [miscCost, setMiscCost] = useState(4200);
  const [miscRevenue, setMiscRevenue] = useState(6800);
  const [markupPercent, setMarkupPercent] = useState(15);
  const [materialDurationMonths, setMaterialDurationMonths] = useState(1);
  const [approvedAlternates, setApprovedAlternates] = useState<number[]>([]);
  const [proposalNotes, setProposalNotes] = useState(
    "Proposal includes furnishing, erecting, maintaining, and dismantling frame scaffold based on provided bid documents and current KORBAN takeoff assumptions."
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [storedEstimate, setStoredEstimate] = useState<EstimateData | null>(null);
  const [elevationBreakdownRows, setElevationBreakdownRows] = useState<
    { elevation: string; approxLinearFeet: number }[]
  >([]);
  const [partialExteriorMarkupPercent, setPartialExteriorMarkupPercent] = useState(6);

  useEffect(() => {
    function loadStoredEstimate() {
      const project = getActiveProject();
      const elevation = getActiveElevation();
      const quantityEngine = elevation.quantityEngine;
      console.log("ESTIMATE REVIEW LOADED LF:", elevation.linearFeet);

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
      });

      // Elevation Breakdown is optional, manual, supplementary data
      // entered in Takeoff Workspace. It never overrides linearFeet or
      // the quantity engine — it only feeds the Partial Exterior Cost
      // comparison below.
      const breakdownRows = (elevation.elevationBreakdown || []).filter(
        (row) => row.approxLinearFeet > 0,
      );
      setElevationBreakdownRows(breakdownRows);

      const backendSettings = getBackendSettings();
      setPartialExteriorMarkupPercent(backendSettings.pricing.partialExteriorMarkupPercent ?? 6);
      setFrameRate(backendSettings.pricing.frameMonthlyRate ?? 14.5);
      setPlankRate(backendSettings.pricing.plankMonthlyRate ?? 6.75);
      setAppRate(backendSettings.labor.apprenticeRate ?? 48);
      setJourneyRate(backendSettings.labor.journeymanRate ?? 72);
      setForemanRate(backendSettings.labor.foremanRate ?? 85);

      setIsHydrated(true);
    }

    const loadStoredEstimateDelay = window.setTimeout(loadStoredEstimate, 250);
    window.addEventListener("focus", loadStoredEstimate);
    window.addEventListener("pageshow", loadStoredEstimate);

    return () => {
      window.clearTimeout(loadStoredEstimateDelay);
      window.removeEventListener("focus", loadStoredEstimate);
      window.removeEventListener("pageshow", loadStoredEstimate);
    };
  }, []);

  const estimate = storedEstimate ?? baseEstimate;

  const rentalDays =
    rentalDuration === "Custom" ? Number(customRentalDays || 0) : Number(rentalDuration.split(" ")[0]);

  const rentalMonths = Math.max(1, Math.ceil(rentalDays / 30));

  const activeRevision =
    revisionHistory.find((revision) => revision.phase === bidRoundPhase) ??
    revisionHistory[revisionHistory.length - 1];

  const selectedProduction = productionTypes.find((item) => item.key === productionType) ?? productionTypes[1];
  const allowedInstallDays = selectedProduction.installDays;
  const dismantleDays = Math.max(1, Math.ceil(allowedInstallDays * (dismantleBackendPercent / 100)));

  const effectiveLaborRates = useMemo(
    () => [
      { type: "Apprentice", abbreviation: "APP", rate: appRate },
      { type: "Journeyman", abbreviation: "JOURN", rate: journeyRate },
      { type: "Foreman", abbreviation: "FORMAN", rate: foremanRate },
    ],
    [appRate, foremanRate, journeyRate]
  );

  const totals = useMemo(() => {
    const frameMaterialCost = estimate.frames * frameRate;
    const plankMaterialCost = estimate.planks * plankRate;
    const standardMaterialCost = frameMaterialCost + plankMaterialCost;

    const extraMaterialCost = extraMaterialItems.reduce(
      (sum, item) => sum + item.quantity * item.unitRate,
      0
    );

    const materialCost = (standardMaterialCost + extraMaterialCost) * materialDurationMonths;

    const installLaborerDays = installMix.reduce(
      (sum, row) => sum + row.days * row.laborers,
      0
    );

    const averageInstallCrew = Math.max(
      1,
      Math.round(installMix.reduce((sum, row) => sum + row.laborers, 0) / Math.max(1, installMix.length))
    );
    const dismantleLaborerDays = dismantleDays * averageInstallCrew;

    const totalLaborerDays = installLaborerDays + dismantleLaborerDays;
    const totalLaborHours = totalLaborerDays * 8;

    const blendedLaborRate =
      effectiveLaborRates.reduce((sum, item) => sum + item.rate, 0) / effectiveLaborRates.length;

    const laborCost = Math.round(totalLaborHours * blendedLaborRate);

    const rentalRevenue = baseMonthlyRentalRevenue * rentalMonths;

    const alternateRevenue = addAlternates
      .filter((alternate) => approvedAlternates.includes(alternate.id))
      .reduce((sum, alternate) => sum + alternate.value, 0);

    const costSubtotal = materialCost + laborCost + miscCost;
    const revenueSubtotal = rentalRevenue + laborRevenue + miscRevenue + alternateRevenue;
    const markupValue = Math.round(costSubtotal * (markupPercent / 100));
    const finalBid = revenueSubtotal + markupValue;

    const projectedLaborProfit = laborRevenue - laborCost;
    const projectedLaborMargin = laborRevenue > 0 ? (projectedLaborProfit / laborRevenue) * 100 : 0;

    return {
      frameMaterialCost,
      plankMaterialCost,
      standardMaterialCost,
      extraMaterialCost,
      materialCost,
      installLaborerDays,
      dismantleLaborerDays,
      totalLaborerDays,
      totalLaborHours,
      blendedLaborRate,
      laborCost,
      rentalRevenue,
      alternateRevenue,
      costSubtotal,
      revenueSubtotal,
      markupValue,
      finalBid,
      projectedLaborProfit,
      projectedLaborMargin,
    };
  }, [
    approvedAlternates,
    baseMonthlyRentalRevenue,
    effectiveLaborRates,
    estimate.frames,
    estimate.planks,
    extraMaterialItems,
    frameRate,
    installMix,
    dismantleDays,
    laborRevenue,
    miscCost,
    miscRevenue,
    plankRate,
    rentalMonths,
    markupPercent,
    materialDurationMonths,
  ]);

  // Complete Exterior Cost vs. Partial Exterior Cost.
  //
  // Complete Exterior Cost = totals.finalBid, unchanged — the cost of
  // doing the whole job as one job.
  //
  // Partial Exterior Cost = each elevation's proportional share of that
  // total cost (weighted by its manually-entered Approx LF from Takeoff
  // Workspace's Elevation Breakdown section), with an added markup that
  // reflects the real cost of mobilizing separately per elevation
  // (more truck trips, less efficient loading, more setup/teardown).
  const elevationPricing = useMemo(() => {
    const totalEnteredLf = elevationBreakdownRows.reduce(
      (sum, row) => sum + row.approxLinearFeet,
      0,
    );

    if (totalEnteredLf <= 0) {
      return { rows: [], totalPartialCost: 0, hasData: false };
    }

    const rows = elevationBreakdownRows.map((row) => {
      const share = row.approxLinearFeet / totalEnteredLf;
      const baseShare = share * totals.finalBid;
      const partialPrice = baseShare * (1 + partialExteriorMarkupPercent / 100);

      return {
        elevation: row.elevation,
        approxLinearFeet: row.approxLinearFeet,
        sharePercent: share * 100,
        baseShare,
        partialPrice,
      };
    });

    const totalPartialCost = rows.reduce((sum, row) => sum + row.partialPrice, 0);

    return { rows, totalPartialCost, hasData: true };
  }, [elevationBreakdownRows, totals.finalBid, partialExteriorMarkupPercent]);

  function toggleAlternate(id: number) {
    setApprovedAlternates((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function addMaterialItem(itemName: string) {
    if (!itemName) return;

    setExtraMaterialItems((current) => [
      ...current,
      {
        id: Date.now(),
        item: itemName,
        quantity: 1,
        unitRate: 0,
      },
    ]);
  }

  function updateExtraMaterial(id: number, field: "quantity" | "unitRate", value: number) {
    setExtraMaterialItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function removeExtraMaterial(id: number) {
    setExtraMaterialItems((current) => current.filter((item) => item.id !== id));
  }

  function updateProductionType(type: ProductionType) {
    const nextProduction = productionTypes.find((item) => item.key === type) ?? productionTypes[1];

    setProductionType(type);

    setInstallMix((current) => {
      const [first, ...rest] = current;
      const restDays = rest.reduce((sum, item) => sum + item.days, 0);
      const adjustedFirstDays = Math.max(1, nextProduction.installDays - restDays);

      return [
        {
          ...first,
          days: adjustedFirstDays,
        },
        ...rest.filter((item) => item.days > 0),
      ];
    });
  }

  function addInstallMix() {
    setInstallMix((current) => {
      const usedDays = current.reduce((sum, item) => sum + item.days, 0);
      const remainingDays = Math.max(0, allowedInstallDays - usedDays);

      if (remainingDays <= 0) return current;

      return [
        ...current,
        {
          id: Date.now(),
          phase: `Install Breakdown ${current.length + 1}`,
          days: remainingDays,
          laborers: 3,
          note: "Additional install crew mix within selected production output.",
        },
      ];
    });
  }

  function updateInstallMix(id: number, field: "days" | "laborers", value: number) {
    setInstallMix((current) => {
      const otherDays = current
        .filter((item) => item.id !== id)
        .reduce((sum, item) => sum + item.days, 0);

      return current.map((item) => {
        if (item.id !== id) return item;

        if (field === "days") {
          const maxAllowedForThisLine = Math.max(1, allowedInstallDays - otherDays);
          return {
            ...item,
            days: Math.max(1, Math.min(value, maxAllowedForThisLine)),
          };
        }

        return {
          ...item,
          laborers: Math.max(1, value),
        };
      });
    });
  }

  function removeInstallMix(id: number) {
    setInstallMix((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.id !== id);
    });
  }

  function submitPrice() {
    setProposalStatus("Submitted");
  }

  function approveProposal() {
    setProposalStatus("Ready To Send");
  }

  if (!isHydrated) {
    return <main className="min-h-screen bg-korban-base text-white" />;
  }

  return (
    <KorbanManagementShell
      header={
        <KorbanHeader
          title="Estimate Review"
          subtitle="Finalize estimate numbers, approve proposal content, and submit price to client"
          menuLinks={estimateMenuLinks}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((current) => !current)}
          actionsClassName="gap-3"
          actions={
            <>
              <KorbanHeaderMeta label="Project" value={estimate.projectName} />
              <StatusBadge status={proposalStatus} />
              <KorbanButton variant="ghost" onClick={approveProposal}>
                Approve Proposal
              </KorbanButton>
              <KorbanButton variant="primary" onClick={submitPrice}>
                Submit Price
              </KorbanButton>
            </>
          }
        />
      }
      bodyClassName="p-4"
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,6.5fr)_minmax(280px,2.5fr)_minmax(150px,1fr)]">
        <section className="space-y-5">
          <ProposalSheet>
            <div className="flex items-start justify-between gap-6 border-b border-zinc-800 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-orange-500">
                  Estimate Review
                </p>
                <h2 className="mt-3 text-3xl font-bold text-white">{estimate.projectName}</h2>
                <p className="mt-1 text-sm text-zinc-500">{estimate.projectAddress}</p>
              </div>

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-right">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Proposal No.</p>
                <p className="mt-1 font-mono text-sm font-bold text-orange-400">
                  {estimate.proposalNumber}
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Bid Date</p>
                <p className="mt-1 font-mono text-sm text-zinc-300">{estimate.bidDate}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <MaterialSummarySection
                frameQuantity={estimate.frames}
                frameRate={frameRate}
                setFrameRate={setFrameRate}
                plankQuantity={estimate.planks}
                plankRate={plankRate}
                setPlankRate={setPlankRate}
                standardMaterialCost={totals.standardMaterialCost}
                extraMaterialItems={extraMaterialItems}
                addMaterialItem={addMaterialItem}
                updateExtraMaterial={updateExtraMaterial}
                removeExtraMaterial={removeExtraMaterial}
                extraMaterialCost={totals.extraMaterialCost}
                rentalDays={rentalDays}
                rentalMonths={rentalMonths}
                rentalDuration={rentalDuration}
                setRentalDuration={setRentalDuration}
                customRentalDays={customRentalDays}
                setCustomRentalDays={setCustomRentalDays}
                baseMonthlyRentalRevenue={baseMonthlyRentalRevenue}
                setBaseMonthlyRentalRevenue={setBaseMonthlyRentalRevenue}
                rentalRevenue={totals.rentalRevenue}
              />

              <LaborSummarySection
                allowedInstallDays={allowedInstallDays}
                dismantleDays={dismantleDays}
                dismantleBackendPercent={dismantleBackendPercent}
                truckLoads={estimate.truckLoads}
                deliveryTrips={estimate.deliveryTrips}
                pickupTrips={estimate.pickupTrips}
                productionType={productionType}
                updateProductionType={updateProductionType}
                installMix={installMix}
                addInstallMix={addInstallMix}
                updateInstallMix={updateInstallMix}
                removeInstallMix={removeInstallMix}
                appRate={appRate}
                setAppRate={setAppRate}
                journeyRate={journeyRate}
                setJourneyRate={setJourneyRate}
                foremanRate={foremanRate}
                setForemanRate={setForemanRate}
                blendedLaborRate={totals.blendedLaborRate}
                laborCost={totals.laborCost}
                totalLaborHours={totals.totalLaborHours}
              />
            </div>

            <RevisionHistory
              activeRevision={activeRevision}
              bidRoundPhase={bidRoundPhase}
              setBidRoundPhase={setBidRoundPhase}
            />

            <CostSummary
              materialCost={totals.materialCost}
              laborCost={totals.laborCost}
              miscCost={miscCost}
              setMiscCost={setMiscCost}
              costSubtotal={totals.costSubtotal}
              markupPercent={markupPercent}
              setMarkupPercent={setMarkupPercent}
              markupValue={totals.markupValue}
              finalBid={totals.finalBid}
              materialDurationMonths={materialDurationMonths}
              setMaterialDurationMonths={setMaterialDurationMonths}
            />

            <ExteriorCostComparison
              completeExteriorCost={totals.finalBid}
              elevationPricing={elevationPricing}
              partialExteriorMarkupPercent={partialExteriorMarkupPercent}
            />

            <AddAlternatesSection
              approvedAlternates={approvedAlternates}
              toggleAlternate={toggleAlternate}
            />

            <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
                Proposal Notes
              </h3>

              <textarea
                value={proposalNotes}
                onChange={(event) => setProposalNotes(event.target.value)}
                className="mt-4 min-h-28 w-full resize-none rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300 outline-none focus:border-orange-500/40"
              />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <InternalReviewCard
                rentalDays={rentalDays}
                rentalMonths={rentalMonths}
                proposalStatus={proposalStatus}
                approvedAlternateCount={approvedAlternates.length}
                finalBid={totals.finalBid}
                activeRevision={activeRevision}
                bidRoundPhase={bidRoundPhase}
                setBidRoundPhase={setBidRoundPhase}
                blendedLaborRate={totals.blendedLaborRate}
                productionType={productionType}
              />

              <ProposalActionCard
                proposalStatus={proposalStatus}
                setProposalStatus={setProposalStatus}
                approveProposal={approveProposal}
                submitPrice={submitPrice}
              />
            </div>
          </ProposalSheet>
        </section>

        <aside className="space-y-5">
          <PreProposalPanel
            projectName={estimate.projectName}
            projectAddress={estimate.projectAddress}
            customer={estimate.customer}
            contactName={estimate.contactName}
            contactEmail={estimate.contactEmail}
            contactPhone={estimate.contactPhone}
            estimator={estimate.estimator}
            unionStatus={estimate.unionStatus}
            bidRoundPhase={bidRoundPhase}
            projectType={estimate.projectType}
            totalLinearFeet={estimate.totalLinearFeet}
            frames={estimate.frames}
            planks={estimate.planks}
            rentalDays={rentalDays}
            rentalMonths={rentalMonths}
            rentalRevenue={totals.rentalRevenue}
            laborRevenue={laborRevenue}
            miscRevenue={miscRevenue}
            alternateRevenue={totals.alternateRevenue}
            finalBid={totals.finalBid}
            approvedAlternates={approvedAlternates}
          />
        </aside>

        <aside className="space-y-5">
          <RevenuePanel
            rentalRevenue={totals.rentalRevenue}
            baseMonthlyRentalRevenue={baseMonthlyRentalRevenue}
            laborRevenue={laborRevenue}
            setLaborRevenue={setLaborRevenue}
            miscRevenue={miscRevenue}
            setMiscRevenue={setMiscRevenue}
            alternateRevenue={totals.alternateRevenue}
            materialCost={totals.materialCost}
            laborCost={totals.laborCost}
            miscCost={miscCost}
            projectedLaborProfit={totals.projectedLaborProfit}
            projectedLaborMargin={totals.projectedLaborMargin}
            finalBid={totals.finalBid}
            rentalMonths={rentalMonths}
          />
        </aside>
      </section>
    </KorbanManagementShell>
  );
}

function ExteriorCostComparison({
  completeExteriorCost,
  elevationPricing,
  partialExteriorMarkupPercent,
}: {
  completeExteriorCost: number;
  elevationPricing: {
    rows: {
      elevation: string;
      approxLinearFeet: number;
      sharePercent: number;
      baseShare: number;
      partialPrice: number;
    }[];
    totalPartialCost: number;
    hasData: boolean;
  };
  partialExteriorMarkupPercent: number;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
            Complete vs. Partial Exterior Cost
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Partial pricing reflects the added cost of mobilizing elevation-by-elevation instead of as one
            complete exterior job — more truck trips, less efficient loading, more setup/teardown per visit.
          </p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Markup</p>
          <p className="font-mono text-sm font-bold text-orange-300">+{partialExteriorMarkupPercent}%</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Complete Exterior Cost</p>
          <p className="mt-2 font-mono text-2xl font-bold text-orange-400">{formatMoney(completeExteriorCost)}</p>
          <p className="mt-1 text-[10px] text-zinc-600">Pricing the full building as one job.</p>
        </div>

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Partial Exterior Cost</p>
          <p className="mt-2 font-mono text-2xl font-bold text-orange-400">
            {elevationPricing.hasData ? formatMoney(elevationPricing.totalPartialCost) : "—"}
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            {elevationPricing.hasData
              ? "Sum of all elevations priced separately, with markup."
              : "Enter Approx LF per elevation in Takeoff Workspace > Elevation Breakdown to see this."}
          </p>
        </div>
      </div>

      {elevationPricing.hasData && (
        <div className="mt-4 space-y-2">
          {elevationPricing.rows.map((row) => (
            <div
              key={row.elevation}
              className="grid grid-cols-[80px_1fr_90px_120px] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs"
            >
              <span className="font-bold text-zinc-200">{row.elevation}</span>
              <span className="text-zinc-600">
                {row.approxLinearFeet.toLocaleString()} LF · {row.sharePercent.toFixed(0)}% of total
              </span>
              <span className="text-right font-mono text-zinc-500">{formatMoney(row.baseShare)}</span>
              <span className="text-right font-mono font-bold text-orange-400">{formatMoney(row.partialPrice)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreProposalPanel({
  projectName,
  projectAddress,
  customer,
  contactName,
  contactEmail,
  contactPhone,
  estimator,
  unionStatus,
  bidRoundPhase,
  projectType,
  totalLinearFeet,
  frames,
  planks,
  rentalDays,
  rentalMonths,
  rentalRevenue,
  laborRevenue,
  miscRevenue,
  alternateRevenue,
  finalBid,
  approvedAlternates,
}: {
  projectName: string;
  projectAddress: string;
  customer: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  estimator: string;
  unionStatus: string;
  bidRoundPhase: BidRoundPhase;
  projectType: string;
  totalLinearFeet: number;
  frames: number;
  planks: number;
  rentalDays: number;
  rentalMonths: number;
  rentalRevenue: number;
  laborRevenue: number;
  miscRevenue: number;
  alternateRevenue: number;
  finalBid: number;
  approvedAlternates: number[];
}) {
  return (
    <section className="rounded-[2rem] border border-zinc-700 bg-zinc-800/40 p-5 shadow-2xl">
      <div className="rounded-3xl border border-zinc-700 bg-zinc-900/90 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-400">
              Proposal Preview
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">{projectName}</h2>
            <p className="mt-1 text-xs text-zinc-500">{customer}</p>
          </div>

          <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Status</p>
            <p className="font-mono text-xs font-bold text-orange-300">Draft</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Project Information
            </h3>
            <div className="mt-3 space-y-2">
              <InfoRow label="Project" value={projectName} />
              <InfoRow label="Address" value={projectAddress} />
              <InfoRow label="Project Type" value={projectType} />
              <InfoRow label="Estimator" value={estimator} />
              <InfoRow label="Union Status" value={unionStatus} />
              <InfoRow label="Bid Round Phase" value={bidRoundPhase} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Customer Information
            </h3>
            <div className="mt-3 space-y-2">
              <InfoRow label="Customer" value={customer} />
              <InfoRow label="Contact" value={contactName} />
              <InfoRow label="Email" value={contactEmail} />
              <InfoRow label="Phone" value={contactPhone} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Customer Scope
            </h3>
            <div className="mt-3 space-y-2">
              <InfoRow label="Scaffold Type" value={projectType} />
              <InfoRow label="Total Coverage" value={`${formatNumber(totalLinearFeet)} LF`} />
              <InfoRow label="Rental Duration" value={`${rentalDays} Days / ${rentalMonths} Mo.`} />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Included In Proposal
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <ProposalMiniTile label="Frames" value={formatNumber(frames)} />
              <ProposalMiniTile label="Planks" value={formatNumber(planks)} />
              <ProposalMiniTile label="Install" value="Included" />
              <ProposalMiniTile label="Dismantle" value="Included" />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Add Alternates
            </h3>
            <div className="mt-3 space-y-2">
              {approvedAlternates.length ? (
                approvedAlternates.map((alternate, index) => (
                  <div key={alternate} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs">
                    <span className="text-zinc-400">Add Alternate #{index + 1}</span>
                    <span className="text-right font-bold text-zinc-200">{alternate}</span>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-zinc-600">
                  No add alternates selected.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
              Proposal Figures
            </h3>
            <div className="mt-3 space-y-2">
              <ProposalFigure label="Rental" value={rentalRevenue} />
              <ProposalFigure label="Labor" value={laborRevenue} />
              <ProposalFigure label="Misc" value={miscRevenue} />
              <ProposalFigure label="Alternates" value={alternateRevenue} />
            </div>
          </div>

          <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-5 text-center">
            <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/70">
              Proposal Total
            </p>
            <p className="mt-2 font-mono text-3xl font-black text-orange-300">
              {formatMoney(finalBid)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProposalMiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-xs font-bold text-zinc-200">{value}</p>
    </div>
  );
}

function ProposalFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-xs font-bold text-zinc-200">{formatMoney(value)}</span>
    </div>
  );
}


function ProposalSheet({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-4 shadow-2xl">
      <div className="rounded-[1.5rem] border border-zinc-800 bg-[#090909] p-4">
        {children}
      </div>
    </section>
  );
}

function RevisionHistory({
  activeRevision,
  bidRoundPhase,
  setBidRoundPhase,
}: {
  activeRevision: {
    phase: BidRoundPhase;
    date: string;
    amount: number;
    note: string;
  };
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-400">
          Revision History
        </h3>
        <span className="font-mono text-[10px] text-zinc-600">
          Active: {activeRevision.phase} · {formatMoney(activeRevision.amount)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {revisionHistory.map((revision) => {
          const active = revision.phase === bidRoundPhase;

          return (
            <button
              key={revision.phase}
              onClick={() => setBidRoundPhase(revision.phase)}
              title={revision.note}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-[10px] transition ${
                active
                  ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-orange-500/30"
              }`}
            >
              <span className="font-bold">{revision.phase}</span>
              <span className="ml-2 font-mono">{formatMoney(revision.amount)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MaterialSummarySection({
  frameQuantity,
  frameRate,
  setFrameRate,
  plankQuantity,
  plankRate,
  setPlankRate,
  standardMaterialCost,
  extraMaterialItems,
  addMaterialItem,
  updateExtraMaterial,
  removeExtraMaterial,
  extraMaterialCost,
  rentalDays,
  rentalMonths,
  rentalDuration,
  setRentalDuration,
  customRentalDays,
  setCustomRentalDays,
  baseMonthlyRentalRevenue,
  setBaseMonthlyRentalRevenue,
  rentalRevenue,
}: {
  frameQuantity: number;
  frameRate: number;
  setFrameRate: (value: number) => void;
  plankQuantity: number;
  plankRate: number;
  setPlankRate: (value: number) => void;
  standardMaterialCost: number;
  extraMaterialItems: ExtraMaterialItem[];
  addMaterialItem: (itemName: string) => void;
  updateExtraMaterial: (id: number, field: "quantity" | "unitRate", value: number) => void;
  removeExtraMaterial: (id: number) => void;
  extraMaterialCost: number;
  rentalDays: number;
  rentalMonths: number;
  rentalDuration: RentalDuration;
  setRentalDuration: (duration: RentalDuration) => void;
  customRentalDays: string;
  setCustomRentalDays: (days: string) => void;
  baseMonthlyRentalRevenue: number;
  setBaseMonthlyRentalRevenue: (value: number) => void;
  rentalRevenue: number;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-black p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Material Summary
      </h3>
      <p className="mt-1 text-xs text-zinc-500">Source: Backend &gt; Material Pricing</p>

      <div className="mt-4 space-y-2">
        <RateInputRow
          label="Frames"
          quantity={frameQuantity}
          rate={frameRate}
          onChange={setFrameRate}
          total={frameQuantity * frameRate}
        />
        <RateInputRow
          label="Planks"
          quantity={plankQuantity}
          rate={plankRate}
          onChange={setPlankRate}
          total={plankQuantity * plankRate}
        />
        <TotalBox label="Standard Material Total" value={formatMoney(standardMaterialCost)} />
      </div>

      <div className="my-4 h-px bg-zinc-800" />

      <MiscMaterialSummaryList
        extraMaterialItems={extraMaterialItems}
        addMaterialItem={addMaterialItem}
        updateExtraMaterial={updateExtraMaterial}
        removeExtraMaterial={removeExtraMaterial}
        extraMaterialCost={extraMaterialCost}
      />

      <div className="my-4 h-px bg-zinc-800" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-zinc-300">Rental Duration</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {rentalMonths} billing month(s) applied to rental revenue.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-orange-400">{rentalDays} Days</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {rentalDurationOptions.map((option) => (
          <button
            key={option}
            onClick={() => setRentalDuration(option)}
            className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold transition ${
              rentalDuration === option
                ? "border-orange-500 bg-orange-500 text-black"
                : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-orange-500/50"
            }`}
          >
            {option}
          </button>
        ))}
        {rentalDuration === "Custom" && (
          <input
            value={customRentalDays}
            onChange={(event) => setCustomRentalDays(event.target.value)}
            className="w-20 rounded-lg border border-orange-500/30 bg-black px-2 py-1.5 text-[10px] font-bold text-orange-300 outline-none"
            placeholder="Days"
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5">
          <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">Monthly Rate</p>
          <input
            value={baseMonthlyRentalRevenue}
            onChange={(event) => setBaseMonthlyRentalRevenue(Number(event.target.value || 0))}
            type="number"
            className="mt-1 w-full bg-transparent text-right font-mono text-xs font-bold text-orange-300 outline-none"
          />
        </div>
        <TotalBox label="Applied Rental Revenue" value={formatMoney(rentalRevenue)} />
      </div>

      <a
        href="/inventory"
        className="mt-4 block w-full rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-center text-xs font-bold text-orange-300 hover:bg-orange-500/20"
      >
        Load List
      </a>
    </div>
  );
}

/**
 * Misc. Material — the fixed special-item list, kept separate from the
 * editable extra material items in Cost Inputs. Order matters per spec:
 * Brackets, H.D. Wall Brackets, Post Shores, Beams, Joists.
 */
const MISC_MATERIAL_ITEMS = ["Brackets", "H.D. Wall Brackets", "Post Shores", "Beams", "Joists"];

function MiscMaterialSummaryList({
  extraMaterialItems,
  addMaterialItem,
  updateExtraMaterial,
  removeExtraMaterial,
  extraMaterialCost,
}: {
  extraMaterialItems: ExtraMaterialItem[];
  addMaterialItem: (itemName: string) => void;
  updateExtraMaterial: (id: number, field: "quantity" | "unitRate", value: number) => void;
  removeExtraMaterial: (id: number) => void;
  extraMaterialCost: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((current) => !current)}
        className="w-full rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-left text-xs font-bold text-orange-300 hover:bg-orange-500/20"
      >
        {expanded ? "− Misc. Material" : "+ Misc. Material"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {MISC_MATERIAL_ITEMS.map((itemName) => {
            const existing = extraMaterialItems.find((item) => item.item === itemName);

            if (!existing) {
              return (
                <button
                  key={itemName}
                  onClick={() => addMaterialItem(itemName)}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-left text-xs font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
                >
                  <span>{itemName}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em]">+ Add</span>
                </button>
              );
            }

            return (
              <div key={itemName} className="rounded-xl border border-zinc-800 bg-black p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-zinc-300">{itemName}</p>
                  <button
                    onClick={() => removeExtraMaterial(existing.id)}
                    className="text-[10px] font-bold text-zinc-600 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniNumberInput
                    label="Qty"
                    value={existing.quantity}
                    onChange={(value) => updateExtraMaterial(existing.id, "quantity", value)}
                  />
                  <MiniNumberInput
                    label="Rate"
                    value={existing.unitRate}
                    onChange={(value) => updateExtraMaterial(existing.id, "unitRate", value)}
                  />
                </div>
                <p className="mt-2 text-right font-mono text-xs font-bold text-orange-400">
                  {formatMoney(existing.quantity * existing.unitRate)}
                </p>
              </div>
            );
          })}
          <TotalBox label="Misc. Material Total" value={formatMoney(extraMaterialCost)} />
        </div>
      )}
    </div>
  );
}

function LaborSummarySection({
  allowedInstallDays,
  dismantleDays,
  dismantleBackendPercent,
  truckLoads,
  deliveryTrips,
  pickupTrips,
  productionType,
  updateProductionType,
  installMix,
  addInstallMix,
  updateInstallMix,
  removeInstallMix,
  appRate,
  setAppRate,
  journeyRate,
  setJourneyRate,
  foremanRate,
  setForemanRate,
  blendedLaborRate,
  laborCost,
  totalLaborHours,
}: {
  allowedInstallDays: number;
  dismantleDays: number;
  dismantleBackendPercent: number;
  truckLoads: number;
  deliveryTrips: number;
  pickupTrips: number;
  productionType: ProductionType;
  updateProductionType: (type: ProductionType) => void;
  installMix: InstallMixItem[];
  addInstallMix: () => void;
  updateInstallMix: (id: number, field: "days" | "laborers", value: number) => void;
  removeInstallMix: (id: number) => void;
  appRate: number;
  setAppRate: (value: number) => void;
  journeyRate: number;
  setJourneyRate: (value: number) => void;
  foremanRate: number;
  setForemanRate: (value: number) => void;
  blendedLaborRate: number;
  laborCost: number;
  totalLaborHours: number;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-black p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Labor Summary
      </h3>
      <p className="mt-1 text-xs text-zinc-500">Source: Backend &gt; Labor Planning &amp; Labor Rates</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <QuantityRow label="Install Days" value={allowedInstallDays} />
        <QuantityRow label="Dismantle Days" value={dismantleDays} />
        <QuantityRow label="Truck Loads" value={truckLoads} />
        <QuantityRow label="Delivery Trips" value={deliveryTrips} />
        <QuantityRow label="Pickup Trips" value={pickupTrips} />
      </div>

      <div className="my-4 h-px bg-zinc-800" />

      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Crew Mix</p>
      <ProductionSelector productionType={productionType} updateProductionType={updateProductionType} />

      <div className="mt-3 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Allowed Install Output</p>
        <p className="mt-2 font-mono text-lg font-bold text-orange-400">{allowedInstallDays} Days</p>
      </div>

      <div className="mt-3 space-y-2">
        {installMix.map((row) => (
          <InstallMixEditor
            key={row.id}
            row={row}
            canRemove={installMix.length > 1}
            updateInstallMix={updateInstallMix}
            removeInstallMix={removeInstallMix}
          />
        ))}
      </div>

      <button
        onClick={addInstallMix}
        className="mt-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
      >
        + Add Install Breakdown
      </button>

      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold text-zinc-300">Dismantle</p>
          <p className="font-mono text-xs font-bold text-orange-400">
            {dismantleBackendPercent}% down · {dismantleDays} days
          </p>
        </div>
      </div>

      <div className="mt-3">
        <TotalBox label="Total Hours" value={`${totalLaborHours.toLocaleString()} hrs`} hint="Days × Laborers × 8 hrs" />
      </div>

      <div className="my-4 h-px bg-zinc-800" />

      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Labor Rates</p>
      <div className="grid grid-cols-3 gap-2">
        <RateOnlyInput label="Apprentice" value={appRate} onChange={setAppRate} />
        <RateOnlyInput label="Journeyman" value={journeyRate} onChange={setJourneyRate} />
        <RateOnlyInput label="Foreman" value={foremanRate} onChange={setForemanRate} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <TotalBox label="Blended Avg. Rate" value={`${formatMoney(blendedLaborRate)} / hr`} />
        <TotalBox label="Total Labor Cost" value={formatMoney(laborCost)} />
      </div>
    </div>
  );
}

/**
 * Consistent "total" box used across summary sections — light orange
 * faint box, matching the orange title outline color.
 */
function TotalBox({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">{label}</p>
      <p className="mt-2 font-mono text-lg font-bold text-orange-400">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}


function CostSummary({
  materialCost,
  laborCost,
  miscCost,
  setMiscCost,
  costSubtotal,
  markupPercent,
  setMarkupPercent,
  markupValue,
  finalBid,
  materialDurationMonths,
  setMaterialDurationMonths,
}: {
  materialCost: number;
  laborCost: number;
  miscCost: number;
  setMiscCost: (value: number) => void;
  costSubtotal: number;
  markupPercent: number;
  setMarkupPercent: (value: number) => void;
  markupValue: number;
  finalBid: number;
  materialDurationMonths: number;
  setMaterialDurationMonths: (value: number) => void;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-400/30 bg-zinc-400/[0.08] p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Total Cost Summary
      </h3>

      <div className="mt-4 space-y-2">
        <StaticMoneyRow label="Material Cost" value={materialCost} />

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
          <div>
            <span className="text-xs text-zinc-500">Duration (months)</span>
            <p className="mt-0.5 text-[10px] text-zinc-600">Multiplies material cost — e.g. 2 months = 2× total.</p>
          </div>
          <input
            value={materialDurationMonths}
            onChange={(event) => setMaterialDurationMonths(Math.max(1, Number(event.target.value || 1)))}
            type="number"
            min={1}
            className="w-20 rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
          />
        </div>

        <StaticMoneyRow label="Labor Cost" value={laborCost} />
        <ProposalCostRow label="Misc. Cost" value={miscCost} onChange={setMiscCost} />

        <div className="my-3 h-px bg-zinc-800" />

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-300/20 bg-zinc-300/10 p-3">
          <span className="text-xs font-bold text-zinc-200">Subtotal</span>
          <span className="font-mono text-sm font-black text-orange-300">{formatMoney(costSubtotal)}</span>
        </div>
        <PercentRow label="Markup %" value={markupPercent} onChange={setMarkupPercent} />
        <StaticMoneyRow label="Markup Amount" value={markupValue} />

        <div className="my-3 h-px bg-orange-500/30" />

        <div className="flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-orange-300">
            Final Bid
          </span>
          <span className="font-mono text-3xl font-bold text-orange-400">
            {formatMoney(finalBid)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AddAlternatesSection({
  approvedAlternates,
  toggleAlternate,
}: {
  approvedAlternates: number[];
  toggleAlternate: (id: number) => void;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-700/40 bg-zinc-400/[0.06] p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Add Alternates
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Alternates are excluded by default and shown separately for proposal purposes.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {addAlternates.map((alternate) => {
          const included = approvedAlternates.includes(alternate.id);

          return (
            <button
              key={alternate.id}
              onClick={() => toggleAlternate(alternate.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                included
                  ? "border-orange-500/50 bg-orange-500/10"
                  : "border-zinc-800 bg-zinc-950 hover:border-orange-500/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-zinc-200">
                    Add Alternate #{alternate.id} — {alternate.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                    {alternate.description}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                    included
                      ? "border-orange-500/50 bg-orange-500 text-black"
                      : "border-zinc-700 bg-black text-zinc-500"
                  }`}
                >
                  {included ? "ADD" : "EXCLUDED"}
                </span>
              </div>
              <p className="mt-3 font-mono text-sm font-bold text-orange-400">
                {formatMoney(alternate.value)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InputGroup({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-orange-500/20 bg-orange-500/5 p-5">
      <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-orange-300">{title}</h4>
      <p className="mt-1 text-[10px] text-zinc-600">Source: {source}</p>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
  );
}

function RateInputRow({
  label,
  quantity,
  rate,
  onChange,
  total,
}: {
  label: string;
  quantity: number;
  rate: number;
  onChange: (value: number) => void;
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold text-zinc-300">{label}</span>
        <span className="font-mono text-xs font-bold text-orange-400">{formatMoney(total)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-zinc-600">Qty: {formatNumber(quantity)}</p>
        <input
          value={rate}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          className="w-24 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-orange-300 outline-none"
        />
      </div>
    </div>
  );
}

function RateOnlyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-3">
      <span className="block text-[10px] text-zinc-500">{label}</span>
      <div className="mt-2 flex items-center justify-between gap-2">
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          className="w-full min-w-0 rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-right font-mono text-[11px] font-bold text-orange-300 outline-none focus:border-orange-500/40"
        />
        <span className="shrink-0 text-[10px] text-zinc-600">/hr</span>
      </div>
    </div>
  );
}

function ProductionSelector({
  productionType,
  updateProductionType,
}: {
  productionType: ProductionType;
  updateProductionType: (type: ProductionType) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {productionTypes.map((type) => {
        const active = productionType === type.key;

        return (
          <button
            key={type.key}
            onClick={() => updateProductionType(type.key)}
            className={`rounded-2xl border p-3 text-left transition ${
              active
                ? "border-white/30 bg-white/5 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                : "border-zinc-800 bg-black hover:border-orange-500/30"
            }`}
          >
            <p className={active ? "text-xs font-bold text-white" : "text-xs font-bold text-zinc-300"}>
              {type.title}
            </p>
            <p className={active ? "mt-1 text-[10px] text-zinc-300" : "mt-1 text-[10px] text-zinc-600"}>
              {type.installDays} days · {type.productionRate}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function InstallMixEditor({
  row,
  canRemove,
  updateInstallMix,
  removeInstallMix,
}: {
  row: InstallMixItem;
  canRemove: boolean;
  updateInstallMix: (id: number, field: "days" | "laborers", value: number) => void;
  removeInstallMix: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold text-zinc-300">{row.phase}</p>
        {canRemove && (
          <button
            onClick={() => removeInstallMix(row.id)}
            className="text-[10px] font-bold text-zinc-600 hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniNumberInput
          label="Days"
          value={row.days}
          onChange={(value) => updateInstallMix(row.id, "days", value)}
        />
        <MiniNumberInput
          label="Laborers"
          value={row.laborers}
          onChange={(value) => updateInstallMix(row.id, "laborers", value)}
        />
      </div>

      <p className="mt-2 font-mono text-xs font-bold text-orange-400">
        {row.laborers} laborers × {row.days} days
      </p>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        type="number"
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
      />
    </div>
  );
}

function MiniNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        type="number"
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-right font-mono text-[11px] font-bold text-orange-300 outline-none"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-2 last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-right text-xs font-semibold text-zinc-300">{value}</span>
    </div>
  );
}

function QuantityRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-2 last:border-b-0">
      <span className={highlight ? "text-xs font-bold text-zinc-200" : "text-xs text-zinc-500"}>{label}</span>
      <span className={highlight ? "font-mono text-sm font-black text-orange-300" : "font-mono text-xs font-bold text-zinc-300"}>
        {formatNumber(value)}
      </span>
    </div>
  );
}

/**
 * Misc. Material constant moved into the new MaterialSummarySection
 * block above. (Old standalone MiscMaterialSummaryList removed —
 * superseded by the parameterized version used in Material Summary.)
 */

function ProposalCostRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        type="number"
        className="w-36 rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
      />
    </div>
  );
}

function PercentRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          className="w-24 rounded-xl border border-zinc-800 bg-black px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/40"
        />
        <span className="text-sm font-bold text-zinc-500">%</span>
      </div>
    </div>
  );
}

function StaticMoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-900 bg-black p-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-sm font-bold text-zinc-300">{formatMoney(value)}</span>
    </div>
  );
}

function RevenuePanel({
  rentalRevenue,
  baseMonthlyRentalRevenue,
  laborRevenue,
  setLaborRevenue,
  miscRevenue,
  setMiscRevenue,
  alternateRevenue,
  materialCost,
  laborCost,
  miscCost,
  projectedLaborProfit,
  projectedLaborMargin,
  finalBid,
  rentalMonths,
}: {
  rentalRevenue: number;
  baseMonthlyRentalRevenue: number;
  laborRevenue: number;
  setLaborRevenue: (value: number) => void;
  miscRevenue: number;
  setMiscRevenue: (value: number) => void;
  alternateRevenue: number;
  materialCost: number;
  laborCost: number;
  miscCost: number;
  projectedLaborProfit: number;
  projectedLaborMargin: number;
  finalBid: number;
  rentalMonths: number;
}) {
  return (
    <section className="rounded-[2rem] border border-orange-500/25 bg-orange-500/10 p-5 shadow-2xl">
      <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-300">
        Revenue Review
      </h2>

      <div className="mt-3 rounded-2xl border border-orange-500/25 bg-black p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">
          Output
        </p>
        <p className="mt-1 text-[10px] leading-4 text-orange-200/55">
          Internal revenue and profit snapshot.
        </p>
      </div>

      <div className="mt-3 space-y-2">
        <RevenueStatic label={`Rental (${rentalMonths} Mo.)`} value={rentalRevenue} />
        <RevenueStatic label="Monthly Base" value={baseMonthlyRentalRevenue} muted />
        <RevenueInput label="Labor Rev." value={laborRevenue} onChange={setLaborRevenue} />
        <RevenueInput label="Misc Rev." value={miscRevenue} onChange={setMiscRevenue} />
        <RevenueStatic label="Alt. Rev." value={alternateRevenue} />

        <div className="my-3 h-px bg-orange-500/30" />

        <RevenueStatic label="Material Cost" value={materialCost} muted />
        <RevenueStatic label="Labor Cost" value={laborCost} muted />
        <RevenueStatic label="Misc Cost" value={miscCost} muted />

        <div className="my-3 h-px bg-orange-500/30" />

        <div className="rounded-2xl border border-orange-500/35 bg-black p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-orange-300/70">
            Labor Profit
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-orange-400">
            {formatMoney(projectedLaborProfit)}
          </p>
        </div>

        <div className="grid gap-2">
          <div className="rounded-2xl border border-orange-500/25 bg-black p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-orange-300/70">
              Margin
            </p>
            <p className="mt-1 font-mono text-base font-bold text-orange-400">
              {projectedLaborMargin.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-orange-500/25 bg-black p-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-orange-300/70">
              Final Bid
            </p>
            <p className="mt-1 font-mono text-base font-bold text-orange-400">
              {formatMoney(finalBid)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RevenueInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-black p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">{label}</p>
      <div className="mt-2 flex items-center rounded-xl border border-orange-500/20 bg-orange-500/10 px-2">
        <span className="font-mono text-xs font-bold text-orange-300">$</span>
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          className="w-full bg-transparent px-2 py-2 text-right font-mono text-xs font-bold text-orange-300 outline-none"
        />
      </div>
    </div>
  );
}

function RevenueStatic({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-2xl border border-orange-500/20 bg-black p-3">
      <span className={`block text-[10px] leading-4 ${muted ? "text-orange-200/45" : "text-orange-300/70"}`}>{label}</span>
      <span className="mt-1 block font-mono text-xs font-bold text-orange-400">{formatMoney(value)}</span>
    </div>
  );
}

function InternalReviewCard({
  rentalDays,
  rentalMonths,
  proposalStatus,
  approvedAlternateCount,
  finalBid,
  activeRevision,
  bidRoundPhase,
  setBidRoundPhase,
  blendedLaborRate,
  productionType,
}: {
  rentalDays: number;
  rentalMonths: number;
  proposalStatus: ProposalStatus;
  approvedAlternateCount: number;
  finalBid: number;
  activeRevision: {
    phase: BidRoundPhase;
    date: string;
    amount: number;
    note: string;
  };
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
  blendedLaborRate: number;
  productionType: ProductionType;
}) {
  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
      <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Internal Review
      </h2>

      <div className="mt-4 space-y-3">
        <InternalReviewRow label="Rental Duration" value={`${rentalDays} Days`} />
        <InternalReviewRow label="Billing Months" value={String(rentalMonths)} />
        <InternalReviewRow label="Proposal Status" value={proposalStatus} />
        <InternalReviewRow label="Approved Alternates" value={String(approvedAlternateCount)} />
        <InternalReviewRow label="Production Type" value={productionType} />
        <InternalReviewRow label="Blended Labor Rate" value={`${formatMoney(blendedLaborRate)} / hr`} />
        <InternalReviewRow label="Final Bid" value={formatMoney(finalBid)} />
        <InternalReviewRow label="Current Round Amount" value={formatMoney(activeRevision.amount)} />

        <div className="rounded-2xl border border-zinc-800 bg-black p-3">
          <p className="text-xs text-zinc-500">Bid Round Phase</p>
          <div className="mt-3 grid gap-2">
            {bidRoundPhases.map((phase) => (
              <button
                key={phase}
                onClick={() => setBidRoundPhase(phase)}
                className={`rounded-xl border px-3 py-2 text-left text-[10px] font-bold transition ${
                  bidRoundPhase === phase
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-orange-500/40"
                }`}
              >
                {phase}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function InternalReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-right font-mono text-xs font-bold text-zinc-300">{value}</span>
    </div>
  );
}

function ProposalActionCard({
  proposalStatus,
  setProposalStatus,
  approveProposal,
  submitPrice,
}: {
  proposalStatus: ProposalStatus;
  setProposalStatus: (status: ProposalStatus) => void;
  approveProposal: () => void;
  submitPrice: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
      <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Proposal Output
      </h2>

      <div className="mt-4 grid gap-2">
        {(["Draft", "Internal Review", "Ready To Send", "Submitted"] as ProposalStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setProposalStatus(status)}
            className={`rounded-xl border px-4 py-3 text-left text-xs font-bold transition ${
              proposalStatus === status
                ? "border-orange-500 bg-orange-500 text-black"
                : "border-zinc-800 bg-black text-zinc-500 hover:border-orange-500/40"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3">
        <button
          onClick={approveProposal}
          className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
        >
          Generate Proposal Preview
        </button>

        <button className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300">
          Export PDF
        </button>

        <button
          onClick={submitPrice}
          className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400"
        >
          Send Proposal
        </button>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 shadow-[0_0_20px_rgba(255,255,255,0.15)]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Status</p>
      <p className="mt-1 text-xs font-bold text-white">{status}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
