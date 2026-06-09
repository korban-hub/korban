"use client";

import { useMemo, useState } from "react";

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

const optionalMaterialChoices = [
  "Cross Braces",
  "Guardrails",
  "Base Plates",
  "Screw Jacks",
  "Toe Boards",
  "Debris Netting",
  "Canopy Material",
  "Stair Tower Material",
  "Custom",
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
    title: "Balanced",
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
  const [rentalDuration, setRentalDuration] = useState<RentalDuration>("30 Days");
  const [customRentalDays, setCustomRentalDays] = useState("45");
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>("Draft");
  const [bidRoundPhase, setBidRoundPhase] = useState<BidRoundPhase>("Final Round");

  const [frameRate, setFrameRate] = useState(14.5);
  const [plankRate, setPlankRate] = useState(6.75);
  const [extraMaterialItems, setExtraMaterialItems] = useState<ExtraMaterialItem[]>([]);
  const [newMaterialChoice, setNewMaterialChoice] = useState("Cross Braces");
  const [customMaterialName, setCustomMaterialName] = useState("");

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
  const [approvedAlternates, setApprovedAlternates] = useState<number[]>([]);
  const [proposalNotes, setProposalNotes] = useState(
    "Proposal includes furnishing, erecting, maintaining, and dismantling frame scaffold based on provided bid documents and current KORBAN takeoff assumptions."
  );

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
    const frameMaterialCost = baseEstimate.frames * frameRate;
    const plankMaterialCost = baseEstimate.planks * plankRate;
    const standardMaterialCost = frameMaterialCost + plankMaterialCost;

    const extraMaterialCost = extraMaterialItems.reduce(
      (sum, item) => sum + item.quantity * item.unitRate,
      0
    );

    const materialCost = standardMaterialCost + extraMaterialCost;

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
  ]);

  function toggleAlternate(id: number) {
    setApprovedAlternates((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function addMaterialItem() {
    const itemName = newMaterialChoice === "Custom" ? customMaterialName.trim() : newMaterialChoice;
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

    setCustomMaterialName("");
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

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <section className="border-b border-orange-500/20 bg-black px-8 py-5">
        <div className="flex items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.5em] text-orange-500">KORBAN</p>
            <h1 className="mt-2 text-3xl font-bold">Estimate Review</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Finalize estimate numbers, approve proposal content, and submit price to client.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={proposalStatus} />

            <button
              onClick={approveProposal}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20"
            >
              Approve Proposal
            </button>

            <button
              onClick={submitPrice}
              className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400"
            >
              Submit Price
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className="space-y-5">
          <ProposalSheet>
            <div className="flex items-start justify-between gap-6 border-b border-zinc-800 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-orange-500">
                  Estimate Proposal Review
                </p>
                <h2 className="mt-3 text-3xl font-bold text-white">{baseEstimate.projectName}</h2>
                <p className="mt-1 text-sm text-zinc-500">{baseEstimate.projectAddress}</p>
              </div>

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-right">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Proposal No.</p>
                <p className="mt-1 font-mono text-sm font-bold text-orange-400">
                  {baseEstimate.proposalNumber}
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Bid Date</p>
                <p className="mt-1 font-mono text-sm text-zinc-300">{baseEstimate.bidDate}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <ReviewBlock title="Project Information">
                <InfoRow label="Project Type" value={baseEstimate.projectType} />
                <InfoRow label="Estimator" value={baseEstimate.estimator} />
                <InfoRow label="Union Status" value={baseEstimate.unionStatus} />
                <InfoRow label="Bid Round Phase" value={bidRoundPhase} />
              </ReviewBlock>

              <ReviewBlock title="Customer Information">
                <InfoRow label="Customer" value={baseEstimate.customer} />
                <InfoRow label="Contact" value={baseEstimate.contactName} />
                <InfoRow label="Email" value={baseEstimate.contactEmail} />
                <InfoRow label="Phone" value={baseEstimate.contactPhone} />
              </ReviewBlock>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <SummaryTile label="Total Linear Feet" value={formatNumber(baseEstimate.totalLinearFeet)} suffix="LF" />
              <SummaryTile label="Frame Count" value={formatNumber(baseEstimate.frames)} />
              <SummaryTile label="Plank Count" value={formatNumber(baseEstimate.planks)} />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <ReviewBlock title="Scaffold Quantity Summary">
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                  <QuantityRow label="Legs" value={baseEstimate.legs} />
                </div>

                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                  <QuantityRow label="Jumps" value={baseEstimate.jumps} />
                </div>

                <div className="h-px bg-orange-500/25" />

                <QuantityRow label="Frames" value={baseEstimate.frames} />
                <QuantityRow label="Planks" value={baseEstimate.planks} />
                <QuantityRow label="Cross Braces" value={baseEstimate.crossBraces} />
                <QuantityRow label="Guardrails" value={baseEstimate.guardrails} />
                <QuantityRow label="Base Plates" value={baseEstimate.basePlates} />
                <QuantityRow label="Screw Jacks" value={baseEstimate.screwJacks} />
              </ReviewBlock>

              <ReviewBlock title="Labor / Operations Summary">
                <QuantityRow label="Install Days" value={allowedInstallDays} />
                <QuantityRow label="Dismantle Days" value={dismantleDays} />
                <QuantityRow label="Install Laborer-Days" value={totals.installLaborerDays} />
                <QuantityRow label="Dismantle Laborer-Days" value={totals.dismantleLaborerDays} />
                <QuantityRow label="Truck Loads" value={baseEstimate.truckLoads} />
                <QuantityRow label="Delivery Trips" value={baseEstimate.deliveryTrips} />
                <QuantityRow label="Pickup Trips" value={baseEstimate.pickupTrips} />
              </ReviewBlock>
            </div>

            <RevisionHistory
              activeRevision={activeRevision}
              bidRoundPhase={bidRoundPhase}
              setBidRoundPhase={setBidRoundPhase}
            />

            <RentalDurationSection
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

            <CostInputsSection
              frameRate={frameRate}
              setFrameRate={setFrameRate}
              plankRate={plankRate}
              setPlankRate={setPlankRate}
              standardMaterialCost={totals.standardMaterialCost}
              extraMaterialItems={extraMaterialItems}
              newMaterialChoice={newMaterialChoice}
              setNewMaterialChoice={setNewMaterialChoice}
              customMaterialName={customMaterialName}
              setCustomMaterialName={setCustomMaterialName}
              addMaterialItem={addMaterialItem}
              updateExtraMaterial={updateExtraMaterial}
              removeExtraMaterial={removeExtraMaterial}
              extraMaterialCost={totals.extraMaterialCost}
              productionType={productionType}
              updateProductionType={updateProductionType}
              allowedInstallDays={allowedInstallDays}
              installMix={installMix}
              addInstallMix={addInstallMix}
              updateInstallMix={updateInstallMix}
              removeInstallMix={removeInstallMix}
              dismantleDays={dismantleDays}
              dismantleBackendPercent={dismantleBackendPercent}
              appRate={appRate}
              setAppRate={setAppRate}
              journeyRate={journeyRate}
              setJourneyRate={setJourneyRate}
              foremanRate={foremanRate}
              setForemanRate={setForemanRate}
              blendedLaborRate={totals.blendedLaborRate}
              laborCost={totals.laborCost}
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
          </ProposalSheet>
        </section>

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
        </aside>
      </section>
    </main>
  );
}

function ProposalSheet({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-6 shadow-2xl">
      <div className="mx-auto max-w-[980px] rounded-[1.5rem] border border-zinc-800 bg-[#090909] p-6">
        {children}
      </div>
    </section>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-black p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">{title}</h3>
      <div className="mt-4 space-y-2">{children}</div>
    </div>
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
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
            Revision History
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Tracks pricing movement by bid round. Active round feeds project snapshots and proposal review.
          </p>
        </div>

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Active Round</p>
          <p className="mt-1 font-mono text-sm font-bold text-orange-400">{activeRevision.phase}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {revisionHistory.map((revision) => {
          const active = revision.phase === bidRoundPhase;

          return (
            <button
              key={revision.phase}
              onClick={() => setBidRoundPhase(revision.phase)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-orange-500/50 bg-orange-500/10"
                  : "border-zinc-800 bg-zinc-950 hover:border-orange-500/30"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-zinc-200">{revision.phase}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">{revision.date}</p>
                </div>

                <p className="font-mono text-sm font-bold text-orange-400">
                  {formatMoney(revision.amount)}
                </p>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-zinc-500">{revision.note}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RentalDurationSection({
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
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
            Rental Duration
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Base rental is monthly. 90 days applies three months of rental revenue into the bid amount.
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-orange-400">{rentalDays} Days</p>
          <p className="mt-1 text-xs text-zinc-500">{rentalMonths} billing month(s)</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {rentalDurationOptions.map((option) => (
          <button
            key={option}
            onClick={() => setRentalDuration(option)}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
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
            className="w-28 rounded-xl border border-orange-500/30 bg-black px-3 py-2 text-xs font-bold text-orange-300 outline-none"
            placeholder="Days"
          />
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <NumberInput
          label="Monthly Rental Revenue"
          value={baseMonthlyRentalRevenue}
          onChange={setBaseMonthlyRentalRevenue}
        />

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Applied Rental Revenue</p>
          <p className="mt-2 font-mono text-lg font-bold text-orange-400">{formatMoney(rentalRevenue)}</p>
        </div>
      </div>
    </div>
  );
}

function CostInputsSection({
  frameRate,
  setFrameRate,
  plankRate,
  setPlankRate,
  standardMaterialCost,
  extraMaterialItems,
  newMaterialChoice,
  setNewMaterialChoice,
  customMaterialName,
  setCustomMaterialName,
  addMaterialItem,
  updateExtraMaterial,
  removeExtraMaterial,
  extraMaterialCost,
  productionType,
  updateProductionType,
  allowedInstallDays,
  installMix,
  addInstallMix,
  updateInstallMix,
  removeInstallMix,
  dismantleDays,
  dismantleBackendPercent,
  appRate,
  setAppRate,
  journeyRate,
  setJourneyRate,
  foremanRate,
  setForemanRate,
  blendedLaborRate,
  laborCost,
}: {
  frameRate: number;
  setFrameRate: (value: number) => void;
  plankRate: number;
  setPlankRate: (value: number) => void;
  standardMaterialCost: number;
  extraMaterialItems: ExtraMaterialItem[];
  newMaterialChoice: string;
  setNewMaterialChoice: (value: string) => void;
  customMaterialName: string;
  setCustomMaterialName: (value: string) => void;
  addMaterialItem: () => void;
  updateExtraMaterial: (id: number, field: "quantity" | "unitRate", value: number) => void;
  removeExtraMaterial: (id: number) => void;
  extraMaterialCost: number;
  productionType: ProductionType;
  updateProductionType: (type: ProductionType) => void;
  allowedInstallDays: number;
  installMix: InstallMixItem[];
  addInstallMix: () => void;
  updateInstallMix: (id: number, field: "days" | "laborers", value: number) => void;
  removeInstallMix: (id: number) => void;
  dismantleDays: number;
  dismantleBackendPercent: number;
  appRate: number;
  setAppRate: (value: number) => void;
  journeyRate: number;
  setJourneyRate: (value: number) => void;
  foremanRate: number;
  setForemanRate: (value: number) => void;
  blendedLaborRate: number;
  laborCost: number;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Cost Inputs
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        Rates and assumptions pulled from Backend defaults. Standard rental material is frames and planks only.
      </p>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <InputGroup title="Standard Material Inputs" source="Backend > Material Pricing">
          <RateInputRow
            label="Frames"
            quantity={baseEstimate.frames}
            rate={frameRate}
            onChange={setFrameRate}
            total={baseEstimate.frames * frameRate}
          />

          <RateInputRow
            label="Planks"
            quantity={baseEstimate.planks}
            rate={plankRate}
            onChange={setPlankRate}
            total={baseEstimate.planks * plankRate}
          />

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Standard Material Total</p>
            <p className="mt-2 font-mono text-lg font-bold text-orange-400">{formatMoney(standardMaterialCost)}</p>
          </div>
        </InputGroup>

        <InputGroup title="Misc. Material (Optional)" source="Backend > Misc. Material Options">
          <div className="grid gap-2">
            <select
              value={newMaterialChoice}
              onChange={(event) => setNewMaterialChoice(event.target.value)}
              className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs font-bold text-zinc-300 outline-none"
            >
              {optionalMaterialChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>

            {newMaterialChoice === "Custom" && (
              <input
                value={customMaterialName}
                onChange={(event) => setCustomMaterialName(event.target.value)}
                className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300 outline-none"
                placeholder="Custom material name"
              />
            )}

            <button
              onClick={addMaterialItem}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
            >
              + Add Misc. Material
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {extraMaterialItems.length === 0 && (
              <p className="rounded-2xl border border-zinc-800 bg-black p-3 text-[11px] text-zinc-600">
                No misc. material included.
              </p>
            )}

            {extraMaterialItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-zinc-800 bg-black p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-zinc-300">{item.item}</p>
                  <button
                    onClick={() => removeExtraMaterial(item.id)}
                    className="text-[10px] font-bold text-zinc-600 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniNumberInput
                    label="Qty"
                    value={item.quantity}
                    onChange={(value) => updateExtraMaterial(item.id, "quantity", value)}
                  />
                  <MiniNumberInput
                    label="Rate"
                    value={item.unitRate}
                    onChange={(value) => updateExtraMaterial(item.id, "unitRate", value)}
                  />
                </div>

                <p className="mt-2 text-right font-mono text-xs font-bold text-orange-400">
                  {formatMoney(item.quantity * item.unitRate)}
                </p>
              </div>
            ))}

            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Misc. Material Total</p>
              <p className="mt-2 font-mono text-lg font-bold text-orange-400">{formatMoney(extraMaterialCost)}</p>
            </div>
          </div>
        </InputGroup>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <InputGroup title="Crew Mix By Days" source="Backend > Labor Planning">
          <ProductionSelector productionType={productionType} updateProductionType={updateProductionType} />

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Allowed Install Output</p>
            <p className="mt-2 font-mono text-lg font-bold text-orange-400">{allowedInstallDays} Days</p>
            <p className="mt-1 text-[10px] text-zinc-600">
              Install breakdown days can only total the selected production output.
            </p>
          </div>

          <div className="space-y-2">
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
            className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
          >
            + Add Install Breakdown
          </button>

          <div className="h-px bg-orange-500/20" />

          <div className="rounded-2xl border border-zinc-800 bg-black p-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-bold text-zinc-300">Dismantle</p>
              <p className="font-mono text-xs font-bold text-orange-400">
                {dismantleBackendPercent}% down · {dismantleDays} days
              </p>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Dismantle duration is calculated from backend setting based on selected install production.
            </p>
          </div>
        </InputGroup>

        <InputGroup title="Labor Rate Inputs" source="Backend > Labor Rates">
          <RateOnlyInput label="Apprentice" value={appRate} onChange={setAppRate} />
          <RateOnlyInput label="Journeyman" value={journeyRate} onChange={setJourneyRate} />
          <RateOnlyInput label="Foreman" value={foremanRate} onChange={setForemanRate} />

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Blended Average Labor Rate</p>
            <p className="mt-2 font-mono text-lg font-bold text-orange-400">
              {formatMoney(blendedLaborRate)} / hr
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">
              Seasoned estimator working rate used for final labor review.
            </p>
          </div>

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Calculated Labor Cost</p>
            <p className="mt-2 font-mono text-lg font-bold text-orange-400">{formatMoney(laborCost)}</p>
          </div>
        </InputGroup>
      </div>
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
}) {
  return (
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
        Cost Summary
      </h3>

      <div className="mt-4 space-y-2">
        <StaticMoneyRow label="Material Cost" value={materialCost} />
        <StaticMoneyRow label="Labor Cost" value={laborCost} />
        <ProposalCostRow label="Misc. Cost" value={miscCost} onChange={setMiscCost} />

        <div className="my-3 h-px bg-zinc-800" />

        <StaticMoneyRow label="Subtotal" value={costSubtotal} />
        <PercentRow label="Markup" value={markupPercent} onChange={setMarkupPercent} />
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
    <div className="mt-5 rounded-3xl border border-zinc-800 bg-black p-5">
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-black p-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          className="w-24 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-right font-mono text-[11px] font-bold text-orange-300 outline-none"
        />
        <span className="text-[10px] text-zinc-600">/ hr</span>
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

function QuantityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-2 last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-xs font-bold text-zinc-300">{formatNumber(value)}</span>
    </div>
  );
}

function SummaryTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-3xl border border-orange-500/20 bg-black p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-3 font-mono text-3xl font-bold text-orange-500">
        {value}
        {suffix && <span className="ml-2 text-sm text-zinc-500">{suffix}</span>}
      </p>
    </div>
  );
}

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
      <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-orange-300">
        Revenue / Profit Panel
      </h2>
      <p className="mt-1 text-xs text-orange-200/60">
        Rental revenue is shown by month, while projected profit focuses on labor.
      </p>

      <div className="mt-5 space-y-3">
        <RevenueStatic label={`Rental Revenue (${rentalMonths} month(s))`} value={rentalRevenue} />
        <RevenueStatic label="Monthly Rental Base" value={baseMonthlyRentalRevenue} muted />
        <RevenueInput label="Labor Revenue" value={laborRevenue} onChange={setLaborRevenue} />
        <RevenueInput label="Misc. Revenue" value={miscRevenue} onChange={setMiscRevenue} />
        <RevenueStatic label="Alternate Revenue" value={alternateRevenue} />

        <div className="my-4 h-px bg-orange-500/30" />

        <RevenueStatic label="Material Cost" value={materialCost} muted />
        <RevenueStatic label="Labor Cost" value={laborCost} muted />
        <RevenueStatic label="Misc. Cost" value={miscCost} muted />

        <div className="my-4 h-px bg-orange-500/30" />

        <div className="rounded-3xl border border-orange-500/40 bg-black p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-orange-300/70">
            Projected Labor Profit
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-orange-400">
            {formatMoney(projectedLaborProfit)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-orange-500/25 bg-black p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">
              Labor Margin
            </p>
            <p className="mt-2 font-mono text-xl font-bold text-orange-400">
              {projectedLaborMargin.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-orange-500/25 bg-black p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300/70">
              Final Bid
            </p>
            <p className="mt-2 font-mono text-xl font-bold text-orange-400">
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
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        type="number"
        className="mt-2 w-full rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-right font-mono text-sm font-bold text-orange-300 outline-none focus:border-orange-500/50"
      />
    </div>
  );
}

function RevenueStatic({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-orange-500/20 bg-black p-3">
      <span className={`text-xs ${muted ? "text-orange-200/45" : "text-orange-300/70"}`}>{label}</span>
      <span className="font-mono text-sm font-bold text-orange-400">{formatMoney(value)}</span>
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

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
