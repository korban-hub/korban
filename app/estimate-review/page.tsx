"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanManagementShell,
  type KorbanMenuLink,
} from "@/components/korban";
import { getActiveElevation, getActiveProject } from "@/lib/projectStore";
import { computeTravel, getBackendSettings, getPieceRate, type BackendSettings } from "@/lib/backendStore";
import BidPresentation, { type BidPresentationData } from "@/components/bid-presentation";
import { buildPresentationUrl } from "@/lib/presentationLink";
import {
  ALTERNATE_ORDER,
  DEFAULT_ALTERNATE_SETTINGS,
  priceAllAlternates,
  type AlternateId,
  type AlternateResult,
  type AlternateSettings,
  type ShrinkWrapMode,
  type ToeBoardSide,
} from "@/lib/alternates";
import {
  BID_LEVELS,
  DEFAULT_ESTIMATE_STATE,
  PRODUCTION_TYPES,
  loadEstimateState,
  saveEstimateState,
  type BidLevel,
  type ConsumableLine,
  type ProductionKey,
  type ProductionPhase,
} from "@/lib/estimateState";

// ----------------------------------------------------------------------
// Types and reference data
// ----------------------------------------------------------------------

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

/**
 * Bid rounds are recorded, not invented. This list used to hold six fabricated
 * rounds with dollar amounts and dates, presented as this project's history -
 * the most misleading thing on the page. Nothing writes revisions yet, so it
 * starts empty and the panel says so.
 */
type BidRevision = { phase: BidRoundPhase; date: string; amount: number; note: string };
const revisionHistory: BidRevision[] = [];

const bidRoundPhases: BidRoundPhase[] = [
  "Budget / ROM", "50% CD", "75% CD", "100% CD", "GMP", "Final Round", "Awarded",
];

/**
 * The empty shape of an estimate. Every field is blank or zero on purpose.
 *
 * This used to hold a full demo job - Turner Construction, Marcus Lee, 1,240
 * LF, 496 frames - and every field fell back to it individually. A project
 * with no takeoff silently showed someone else's numbers, and there was no way
 * to tell a real figure from a leftover. Blank is the honest answer, and the
 * UI says so rather than filling the gap.
 */
const EMPTY_ESTIMATE = {
  projectName: "",
  projectAddress: "",
  customer: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  estimator: "",
  bidDate: "",
  proposalNumber: "",
  projectType: "",
  unionStatus: "",
  totalLinearFeet: 0,
  bays: 0,
  legs: 0,
  jumps: 0,
  frames: 0,
  planks: 0,
  crossBraces: 0,
  guardrails: 0,
  basePlates: 0,
  screwJacks: 0,
  couplingPins: 0,
};

type EstimateData = typeof EMPTY_ESTIMATE;

const estimateMenuLinks: KorbanMenuLink[] = [
  { href: "/", label: "Bid Room" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/set-scaffold-v2", label: "Set Scaffold" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

const HOURS_PER_DAY = 8;

/**
 * What the scaffold is actually for. Drives the proposal description, since
 * "scaffold for exterior plaster" reads to a client and "1,240 LF" doesn't.
 * Mirrors the finish list in the Quick Bid form.
 */
const FINISHES = [
  "Plaster / stucco",
  "Paint",
  "Siding",
  "Masonry",
  "Roofing",
  "Waterproofing",
  "Inspection / access",
] as const;

// ----------------------------------------------------------------------
// Motion helpers
//
// The chrome moves; the numbers you typed never do. Derived totals roll to
// their new value and their frame flares once, so a recalculation is visible
// rather than silent. Entered values change instantly, as they should.
// ----------------------------------------------------------------------

function useRollingNumber(value: number, durationMs = 260) {
  const [display, setDisplay] = useState(value);
  const settled = useRef(value);

  useEffect(() => {
    const from = settled.current;
    const to = value;
    if (from === to) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        settled.current = to;
        setDisplay(to);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return display;
}

function usePulse(value: number, durationMs = 450) {
  const [hot, setHot] = useState(false);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setHot(true);
    const timer = window.setTimeout(() => setHot(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [value, durationMs]);

  return hot;
}

/**
 * Kept for reference: an earlier version flashed shortly after the user
 * stopped typing. That fired constantly while working, so the flash now
 * marks a deliberate commit only — Enter, or leaving a field you changed.
 */
function useCommitFlash() {
  const [flashKey, setFlashKey] = useState(0);
  return { flashKey, flash: () => setFlashKey((key) => key + 1) };
}

/** Keyframes the workspace needs. Injected once, no Tailwind config change. */
function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      @keyframes korban-sweep {
        0% { opacity: 1; transform: translateX(-80px); }
        100% { opacity: 0; transform: translateX(760px); }
      }
      @keyframes korban-flash {
        0% { opacity: 0.9; transform: translateX(-100%); }
        100% { opacity: 0; transform: translateX(220%); }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      .korban-sweep { animation: korban-sweep 0.75s ease-out; }
      .korban-flash { animation: korban-flash 0.5s ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan, .korban-sweep, .korban-flash { animation: none; opacity: 0; }
      }

      /*
       * Printing.
       *
       * Everything except the sheet is chrome for working, not for sending, so
       * it comes off. The sheet itself is already paper stock - it just has to
       * keep its ink, which browsers strip by default to save toner. Each page
       * breaks where the document says it does rather than wherever the paper
       * happens to run out.
       */
      @media print {
        @page { size: letter portrait; margin: 0.4in; }

        body { background: #fff !important; }

        /* Hide the app, then walk the sheet back into view. */
        body * { visibility: hidden !important; }
        #korban-proposal, #korban-proposal * { visibility: visible !important; }

        #korban-proposal {
          position: absolute !important;
          left: 0; top: 0;
          width: 100% !important;
          max-height: none !important;
          overflow: visible !important;
          border: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }

        /* Dark bands are part of the document, not decoration. */
        .korban-sheet-page {
          break-after: page;
          page-break-after: always;
          box-shadow: none !important;
          border-radius: 0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .korban-sheet-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        /* Live-field rules are an editing aid. They mean nothing on paper. */
        .korban-live-rule { border-color: transparent !important; background: transparent !important; box-shadow: none !important; }
        .korban-no-print { display: none !important; }
      }
    `}</style>
  );
}

// ----------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------

export default function EstimateReviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("breakdown");
  const [isHydrated, setIsHydrated] = useState(false);

  const [storedEstimate, setStoredEstimate] = useState<EstimateData | null>(null);
  const [elevationBreakdownRows, setElevationBreakdownRows] = useState<
    { elevation: string; approxLinearFeet: number }[]
  >([]);
  /** Every face the takeoff knows about, covered or not. Drives the phase plan. */
  const [allElevationRows, setAllElevationRows] = useState<
    { elevation: string; approxLinearFeet: number }[]
  >([]);
  const [partialExteriorMarkupPercent, setPartialExteriorMarkupPercent] = useState(6);
  /** Traced plan outline, used by the bid presentation. Empty at Quick Bid. */
  const [planOutline, setPlanOutline] = useState<{ x: number; y: number }[]>([]);
  /** Scaffold geometry the presentation calls out. Read from the elevation. */
  const [scaffoldWidth, setScaffoldWidth] = useState(3);
  const [bayLength, setBayLength] = useState(10);
  const [planksPerDeck, setPlanksPerDeck] = useState(3);
  const [wallHeight, setWallHeight] = useState(0);
  /** The bidding company, from Backend > Company. Shown on the closing slide. */
  const [company, setCompany] = useState({ name: "", phone: "", email: "" });
  /** Company, estimator and proposal language, straight from Backend. */
  const [backend, setBackend] = useState<BackendSettings | null>(null);
  /**
   * Floors in the building. Traced levels are the real answer; below Full Bid
   * none exist, so height is divided by a typical floor-to-floor of 12'.
   */
  const [buildingLevels, setBuildingLevels] = useState(1);

  const [bidLevel, setBidLevel] = useState<BidLevel>(DEFAULT_ESTIMATE_STATE.bidLevel);
  const [rentalDays, setRentalDays] = useState(DEFAULT_ESTIMATE_STATE.rentalDays);
  const [frameRate, setFrameRate] = useState(DEFAULT_ESTIMATE_STATE.frameRate);
  const [plankRate, setPlankRate] = useState(DEFAULT_ESTIMATE_STATE.plankRate);
  const [consumables, setConsumables] = useState<ConsumableLine[]>(DEFAULT_ESTIMATE_STATE.consumables);

  const [erectRate, setErectRate] = useState(DEFAULT_ESTIMATE_STATE.erectRate);
  const [travelRate, setTravelRate] = useState(DEFAULT_ESTIMATE_STATE.travelRate);
  /**
   * One-way miles to site. The only travel figure an estimator enters - loads,
   * trips, hours and cost all derive from it. Replaced by a maps lookup once
   * the integration lands; nothing downstream changes when it does.
   */
  const [siteMiles, setSiteMiles] = useState(0);
  const [dismantlePercent, setDismantlePercent] = useState(DEFAULT_ESTIMATE_STATE.dismantlePercentOfErect);

  const [productionKey, setProductionKey] = useState<ProductionKey>(DEFAULT_ESTIMATE_STATE.productionKey);
  const [crewSize, setCrewSize] = useState(DEFAULT_ESTIMATE_STATE.crewSize);
  const [phaseModeOn, setPhaseModeOn] = useState(DEFAULT_ESTIMATE_STATE.phaseModeOn);
  const [phases, setPhases] = useState<ProductionPhase[]>(DEFAULT_ESTIMATE_STATE.phases);

  const [laborMarkupPercent, setLaborMarkupPercent] = useState(DEFAULT_ESTIMATE_STATE.laborMarkupPercent);
  const [miscRevenue, setMiscRevenue] = useState(DEFAULT_ESTIMATE_STATE.miscRevenue);

  const [finish, setFinish] = useState<string>("Plaster / stucco");
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>("Draft");
  const [bidRoundPhase, setBidRoundPhase] = useState<BidRoundPhase>("Final Round");
  const [approvedAlternates, setApprovedAlternates] = useState<AlternateId[]>([]);
  const [alternateSettings, setAlternateSettings] =
    useState<AlternateSettings>(DEFAULT_ALTERNATE_SETTINGS);
  const [proposalNotes, setProposalNotes] = useState(
    "Proposal includes furnishing, erecting, maintaining and dismantling frame scaffold based on the provided bid documents and current KORBAN takeoff assumptions."
  );

  // -- Hydration --------------------------------------------------------------
  useEffect(() => {
    function loadStoredEstimate() {
      const project = getActiveProject();
      const elevation = getActiveElevation();
      const quantityEngine = elevation.quantityEngine;
      const backendSettings = getBackendSettings();
      setStoredEstimate({
        ...EMPTY_ESTIMATE,
        projectName: project.projectName ?? "",
        projectAddress: project.projectAddress ?? "",
        customer: project.customer ?? "",
        contactName: project.contactName,
        contactEmail: project.contactEmail,
        contactPhone: project.contactPhone,
        estimator: project.estimator ?? "",
        bidDate: project.bidDueDate,
        proposalNumber: project.proposalNumber,
        projectType: backendSettings.scaffold.scaffoldType ?? "",
        unionStatus: project.unionStatus || backendSettings.company.unionDefault,
        totalLinearFeet: elevation.linearFeet ?? 0,
        bays: quantityEngine.bayCount ?? 0,
        legs: quantityEngine.legCount ?? 0,
        jumps: quantityEngine.jumps ?? 0,
        frames: quantityEngine.frameCount ?? 0,
        planks: quantityEngine.plankCount ?? 0,
        crossBraces: quantityEngine.crossBraceCount ?? 0,
        guardrails: quantityEngine.guardrailCount ?? 0,
        basePlates: quantityEngine.basePlateCount ?? 0,
        screwJacks: quantityEngine.screwJackCount ?? 0,
        couplingPins: quantityEngine.couplingPinCount ?? 0,
      });

      const coveredRows = (elevation.elevationBreakdown || []).filter(
        (row) => row.approxLinearFeet > 0
      );
      setElevationBreakdownRows(coveredRows);
      setAllElevationRows(elevation.elevationBreakdown || []);

      const width = elevation.scaffoldInput?.scaffoldWidth ?? 3;
      setScaffoldWidth(width);
      setBayLength(elevation.scaffoldInput?.standardBayLength ?? 10);
      setPlanksPerDeck(width >= 5 ? 5 : width >= 3.5 ? 4 : 3);
      setWallHeight(elevation.wallHeight ?? 0);

      const tracedLevels = (elevation.overlayGeometry?.fullOverlayRows ?? []).filter(
        (row) => row.points.length >= 3
      ).length;
      setBuildingLevels(
        tracedLevels > 0 ? tracedLevels : Math.max(1, Math.round((elevation.wallHeight ?? 0) / 12))
      );

      const geometry = elevation.overlayGeometry;
      const keyFloor = geometry?.fullOverlayRows?.find(
        (row) => row.isKeyFloor && row.alignedPoints.length >= 3
      );
      const anyFloor = geometry?.fullOverlayRows?.find((row) => row.alignedPoints.length >= 3);
      setPlanOutline(
        (geometry?.tracedPerimeter?.length ?? 0) >= 3
          ? geometry!.tracedPerimeter
          : keyFloor?.alignedPoints ?? anyFloor?.alignedPoints ?? []
      );

      const saved = loadEstimateState();
      setBackend(backendSettings);

      setPartialExteriorMarkupPercent(backendSettings.pricing.partialExteriorMarkupPercent);
      setCompany({
        name: backendSettings.company.companyName,
        phone: backendSettings.company.companyPhone,
        email: backendSettings.company.companyEmail,
      });

      // Piece rates have one home now: Backend > Material & Rental Rates.
      setFrameRate(getPieceRate("Frames", backendSettings) || saved.frameRate);
      setPlankRate(getPieceRate("Planks", backendSettings) || saved.plankRate);

      setErectRate(backendSettings.labor.erectHourlyRate);
      setTravelRate(backendSettings.labor.travelHourlyRate);
      setDismantlePercent(backendSettings.labor.dismantlePercentOfErect);
      setLaborMarkupPercent(backendSettings.pricing.laborMarkupPercent);

      setBidLevel(saved.bidLevel);
      setRentalDays(saved.rentalDays);
      setConsumables(saved.consumables);
      setSiteMiles(saved.siteMiles);
      setProductionKey(saved.productionKey);
      setCrewSize(saved.crewSize);
      setPhaseModeOn(saved.phaseModeOn);
      setPhases(saved.phases);
      setMiscRevenue(saved.miscRevenue);

      setApprovedAlternates(saved.approvedAlternates);
      setAlternateSettings(saved.alternateSettings);

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

  const estimate = storedEstimate ?? EMPTY_ESTIMATE;

  /**
   * Every alternate is priced from the takeoff, selected or not, so the tiles
   * can show a real figure before anyone commits to one.
   */
  const alternatePricing = useMemo(
    () =>
      priceAllAlternates(
        {
          linearFeet: estimate.totalLinearFeet,
          wallHeight: wallHeight || estimate.jumps * 6.333 + 6,
          buildingLevels,
          jumps: estimate.jumps,
          erectRate,
          travelRate,
        },
        alternateSettings
      ),
    [
      estimate.totalLinearFeet, estimate.jumps, wallHeight, buildingLevels,
      erectRate, travelRate, alternateSettings,
    ]
  );

  const selectedProduction =
    PRODUCTION_TYPES.find((type) => type.key === productionKey) ?? PRODUCTION_TYPES[1];
  const selectedLevel = BID_LEVELS.find((depth) => depth.key === bidLevel) ?? BID_LEVELS[2];

  // -- Math -------------------------------------------------------------------
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
    // Travel follows the loads this job actually ships.
    const travel = computeTravel(estimate.planks, siteMiles);
    const travelCost = travel.cost;
    const laborCost = erectCost + dismantleCost + travelCost;

    const laborRevenue = Math.round(laborCost * (1 + laborMarkupPercent / 100));
    const alternateRevenue = approvedAlternates.reduce(
      (sum, id) => sum + (alternatePricing[id]?.value ?? 0),
      0
    );

    const finalBid = Math.round(rentalsRevenue + laborRevenue + miscRevenue + alternateRevenue);

    const totalPieces =
      estimate.frames + estimate.planks + estimate.crossBraces + estimate.guardrails +
      estimate.basePlates + estimate.screwJacks + estimate.couplingPins;

    return {
      rentalMonths, frameRental, plankRental, consumablesRevenue, rentalsRevenue,
      productionDays, phaseDays, erectHours, dismantleHours,
      erectCost, dismantleCost, travelCost, laborCost, travel,
      laborRevenue, alternateRevenue, finalBid, totalPieces,
    };
  }, [
    alternatePricing, approvedAlternates, consumables, crewSize, dismantlePercent, erectRate, estimate,
    frameRate, laborMarkupPercent, miscRevenue, phaseModeOn, phases, plankRate,
    rentalDays, selectedProduction.days, siteMiles, travelRate,
  ]);

  // -- Persist ----------------------------------------------------------------
  useEffect(() => {
    if (!isHydrated) return;
    saveEstimateState({
      bidLevel, rentalDays, frameRate, plankRate, consumables,
      erectRate, travelRate, siteMiles,
      dismantlePercentOfErect: dismantlePercent,
      productionKey, crewSize, phaseModeOn, phases,
      approvedAlternates,
      alternateSettings,
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
        travelHours: totals.travel.hours,
        erectCost: totals.erectCost,
        dismantleCost: totals.dismantleCost,
        travelCost: totals.travelCost,
        laborCost: totals.laborCost,
        productionDays: totals.productionDays,
        savedAt: Date.now(),
      },
    });
  }, [
    alternateSettings, approvedAlternates, bidLevel, consumables, crewSize, dismantlePercent,
    erectRate, estimate, frameRate, isHydrated, phaseModeOn, phases, plankRate, productionKey,
    rentalDays, totals, siteMiles, travelRate,
  ]);

  /**
   * The phase plan follows the takeoff. Every face is listed so the plan reads
   * as a complete picture, but only faces with recorded coverage carry days -
   * the rest stay at zero and say so. Days split by linear-foot share, so a
   * face carrying twice the run gets twice the time.
   */
  useEffect(() => {
    if (!isHydrated) return;
    const covered = allElevationRows.filter((row) => row.approxLinearFeet > 0);
    if (covered.length === 0) return;

    const totalLf = covered.reduce((sum, row) => sum + row.approxLinearFeet, 0);
    const budget = selectedProduction.days;

    setPhases((current) => {
      // Only rebuild when the plan doesn't already match the faces on record,
      // so an estimator's hand edits survive a re-render.
      const sameShape =
        current.length === allElevationRows.length &&
        current.every((row, index) => row.phase === allElevationRows[index]?.elevation);
      if (sameShape && current.some((row) => row.days > 0)) return current;

      return allElevationRows.map((row, index) => {
        const share = totalLf > 0 ? row.approxLinearFeet / totalLf : 0;
        return {
          id: index + 1,
          phase: row.elevation,
          days: row.approxLinearFeet > 0 ? Math.max(1, Math.round(budget * share)) : 0,
          crews: 1,
          menPerCrew: crewSize,
        };
      });
    });
  }, [isHydrated, allElevationRows, selectedProduction.days, crewSize]);

  const activeRevision =
    revisionHistory.find((revision) => revision.phase === bidRoundPhase) ?? null;

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

  // -- Handlers ---------------------------------------------------------------
  function updateConsumable(id: string, field: "quantity" | "unitRate", value: number) {
    setConsumables((current) =>
      current.map((line) => (line.id === id ? { ...line, [field]: Math.max(0, value) } : line))
    );
  }

  function addConsumable(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setConsumables((current) => [
      ...current,
      { id: `custom-${Date.now()}`, label: trimmed, quantity: 0, unitRate: 0 },
    ]);
  }

  function removeConsumable(id: string) {
    setConsumables((current) => current.filter((line) => line.id !== id));
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

  function toggleAlternate(id: AlternateId) {
    setApprovedAlternates((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function updateAlternateSettings(patch: Partial<AlternateSettings>) {
    setAlternateSettings((current) => ({ ...current, ...patch }));
  }

  if (!isHydrated) {
    return <main className="min-h-screen bg-korban-base text-white" />;
  }

  return (
    <KorbanManagementShell
      header={
        <KorbanHeader
          title="Estimate"
          subtitle={
            [estimate.projectName, estimate.proposalNumber].filter(Boolean).join(" \u00b7 ") ||
            "No project loaded"
          }
          menuLinks={estimateMenuLinks}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((current) => !current)}
          actionsClassName="gap-2.5"
          actions={
            <>
              <HeaderBid value={totals.finalBid} />
              <a
                href="/margin-review"
                className="rounded-lg border border-zinc-700 bg-zinc-400/[0.06] px-3.5 py-2 font-mono text-[11px] font-bold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-400/[0.1]"
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
      bodyClassName="p-3"
    >
      <KorbanMotionStyles />
      <TabStrip activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "breakdown" ? (
        <Workspace>
          <LevelSelector bidLevel={bidLevel} setBidLevel={setBidLevel} selectedLevel={selectedLevel} />

          <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
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
              addConsumable={addConsumable}
              removeConsumable={removeConsumable}
              consumablesRevenue={totals.consumablesRevenue}
              rentalsRevenue={totals.rentalsRevenue}
            />

            <div className="grid items-start gap-3">
              <LaborPanel
                erectHours={totals.erectHours}
                dismantleHours={totals.dismantleHours}
                travel={totals.travel}
                siteMiles={siteMiles}
                setSiteMiles={setSiteMiles}
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
                selectedProductionDays={selectedProduction.days}
                coverageByFace={Object.fromEntries(
                  allElevationRows.map((row) => [row.elevation, row.approxLinearFeet])
                )}
                hasCoverage={allElevationRows.some((row) => row.approxLinearFeet > 0)}
                phaseDays={totals.phaseDays}
                erectHours={totals.erectHours}
                dismantleHours={totals.dismantleHours}
                dismantlePercent={dismantlePercent}
              />
            </div>
          </div>

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
        </Workspace>
      ) : (
        <ProposalTab
          estimate={estimate}
          bidLevel={bidLevel}
          erectDays={totals.productionDays}
          dismantleDays={Math.max(1, Math.ceil(totals.productionDays * (dismantlePercent / 100)))}
          crewSize={crewSize}
          erectHours={totals.erectHours}
          dismantleHours={totals.dismantleHours}
          elevationBreakdownRows={elevationBreakdownRows}
          planOutline={planOutline}
          scaffoldWidth={scaffoldWidth}
          bayLength={bayLength}
          planksPerDeck={planksPerDeck}
          wallHeight={wallHeight}
          company={company}
          backend={backend}
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
          alternatePricing={alternatePricing}
          alternateSettings={alternateSettings}
          updateAlternateSettings={updateAlternateSettings}
          proposalNotes={proposalNotes}
          setProposalNotes={setProposalNotes}
          finish={finish}
          setFinish={setFinish}
          proposalStatus={proposalStatus}
          setProposalStatus={setProposalStatus}
          bidRoundPhase={bidRoundPhase}
          setBidRoundPhase={setBidRoundPhase}
        />
      )}
    </KorbanManagementShell>
  );
}

// ----------------------------------------------------------------------
// Chrome
// ----------------------------------------------------------------------

/** Panel body with the faint graph-paper ground behind it. */
function Workspace({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-b-xl rounded-tr-xl border border-t-0 border-zinc-800 bg-korban-raised p-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-b-xl rounded-tr-xl opacity-[0.022]"
        style={{
          backgroundImage:
            "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function HeaderBid({ value }: { value: number }) {
  const rolled = useRollingNumber(value);
  const [sweepKey, setSweepKey] = useState(0);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setSweepKey((key) => key + 1);
  }, [value]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-orange-500/30 bg-orange-500/[0.08] px-3.5 py-1.5 text-right">
      {sweepKey > 0 && (
        <span
          key={sweepKey}
          aria-hidden
          className="korban-sweep pointer-events-none absolute inset-y-0 left-0 w-20"
          style={{
            background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.22),transparent)",
          }}
        />
      )}
      <p className="relative font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">Final bid</p>
      <p className="relative font-mono text-base font-bold leading-tight text-orange-400">
        {formatMoney(rolled)}
      </p>
    </div>
  );
}

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
            className={`relative rounded-t-lg border border-b-0 px-6 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition ${
              active
                ? "border-zinc-800 bg-korban-raised text-white"
                : "border-transparent bg-transparent text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-0.5 left-1/2 h-px w-6 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Bordered viewport with corner ticks and a slow scan along the top edge. */
function Panel({
  title,
  right,
  scan = true,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  scan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      {scan && (
        <span
          aria-hidden
          className="korban-scan pointer-events-none absolute -top-px left-0 h-px w-[36%] opacity-50"
          style={{ background: "linear-gradient(90deg,transparent,#F97316,transparent)" }}
        />
      )}
      <div className="flex items-center justify-between gap-3 pb-2">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </h3>
        {right}
      </div>
      <div className="rounded border border-zinc-900 bg-black p-2.5">{children}</div>
    </section>
  );
}

/** Derived total: rolls to its new value, frame flares once. */
function TotalBox({ label, value }: { label: string; value: number }) {
  const rolled = useRollingNumber(value);
  const hot = usePulse(value);

  return (
    <div
      className={`mt-2 flex items-center justify-between gap-4 rounded border bg-orange-500/[0.08] px-3 py-1.5 transition-[box-shadow,border-color] duration-300 ${
        hot
          ? "border-orange-500/90 shadow-[0_0_14px_rgba(249,115,22,0.28)]"
          : "border-orange-500/30 shadow-none"
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-orange-300/70">{label}</span>
      <span
        className="text-[24px] font-semibold leading-none text-orange-400"
        style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
      >
        {formatMoney(rolled)}
      </span>
    </div>
  );
}

function MiniInput({
  value, onChange, prefix, width = "w-14", onFocusField,
}: {
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  width?: string;
  onFocusField?: (active: boolean) => void;
}) {
  const { flashKey, flash } = useCommitFlash();
  const entryValue = useRef(value);

  return (
    <div
      className={`relative flex items-center gap-0.5 overflow-hidden rounded border border-zinc-800 bg-korban-raised px-1.5 ${width}`}
    >
      {flashKey > 0 && (
        <span
          key={flashKey}
          aria-hidden
          className="korban-flash pointer-events-none absolute inset-y-0 left-0 w-full"
          style={{
            background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.35),transparent)",
          }}
        />
      )}
      {prefix && <span className="relative font-mono text-[9px] text-zinc-600">{prefix}</span>}
      <input
        // Never hand React undefined - a saved record written before a field
        // existed would flip the input from uncontrolled to controlled.
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        onFocus={() => {
          entryValue.current = value;
          onFocusField?.(true);
        }}
        onBlur={() => {
          if (entryValue.current !== value) flash();
          onFocusField?.(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        type="number"
        className="relative w-full min-w-0 bg-transparent py-0.5 text-right font-mono text-[11px] font-bold text-orange-300 outline-none"
      />
    </div>
  );
}

/** Text field with the same commit flash — phase names, custom item names. */
function TextField({
  value, onChange, onSubmit, placeholder, className = "", onFocusField,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  onFocusField?: (active: boolean) => void;
}) {
  const { flashKey, flash } = useCommitFlash();
  const entryValue = useRef(value);

  return (
    <span className="relative flex min-w-0 flex-1 overflow-hidden rounded">
      {flashKey > 0 && (
        <span
          key={flashKey}
          aria-hidden
          className="korban-flash pointer-events-none absolute inset-y-0 left-0 w-full"
          style={{
            background: "linear-gradient(90deg,transparent,rgba(249,115,22,0.28),transparent)",
          }}
        />
      )}
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          entryValue.current = value;
          onFocusField?.(true);
        }}
        onBlur={() => {
          if (entryValue.current !== value) flash();
          onFocusField?.(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            flash();
            onSubmit?.();
            event.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        className={`relative w-full min-w-0 bg-transparent outline-none ${className}`}
      />
    </span>
  );
}

// ----------------------------------------------------------------------
// Depth selector
// ----------------------------------------------------------------------

function LevelSelector({
  bidLevel, setBidLevel, selectedLevel,
}: {
  bidLevel: BidLevel;
  setBidLevel: (depth: BidLevel) => void;
  selectedLevel: (typeof BID_LEVELS)[number];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-800 bg-korban-raised px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="mr-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          Bid level
        </span>
        {BID_LEVELS.map((depth) => {
          const active = depth.key === bidLevel;
          return (
            <button
              key={depth.key}
              onClick={() => setBidLevel(depth.key)}
              className={`rounded border px-3 py-1 font-mono text-[10px] font-medium transition ${
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
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-bold text-zinc-200">{selectedLevel.accuracy}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          expected accuracy
        </span>
        <span className="text-zinc-800">·</span>
        <span className="text-[10px] text-zinc-600">{selectedLevel.feeds}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Rental
// ----------------------------------------------------------------------

function RentalPanel({
  frames, planks, frameRate, plankRate, rentalDays, setRentalDays, rentalMonths,
  frameRental, plankRental, consumables, updateConsumable, addConsumable,
  removeConsumable, consumablesRevenue, rentalsRevenue,
}: {
  frames: number; planks: number; frameRate: number; plankRate: number;
  rentalDays: number; setRentalDays: (days: number) => void; rentalMonths: number;
  frameRental: number; plankRental: number;
  consumables: ConsumableLine[];
  updateConsumable: (id: string, field: "quantity" | "unitRate", value: number) => void;
  addConsumable: (label: string) => void;
  removeConsumable: (id: string) => void;
  consumablesRevenue: number; rentalsRevenue: number;
}) {
  const durationOptions = [30, 60, 90, 120];
  const [consumablesOpen, setConsumablesOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const filledCount = consumables.filter((line) => line.quantity > 0 && line.unitRate > 0).length;

  function submitNew() {
    addConsumable(newLabel);
    setNewLabel("");
  }

  return (
    <Panel
      title="Rental"
      right={
        <div className="flex items-center gap-1">
          {durationOptions.map((days) => (
            <button
              key={days}
              onClick={() => setRentalDays(days)}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium transition ${
                rentalDays === days
                  ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
                  : "border-zinc-800 bg-korban-raised text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {days}d
            </button>
          ))}
          <MiniInput value={rentalDays} onChange={(v) => setRentalDays(Math.max(1, v))} width="w-14" />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <BigQuantity label="Frames" quantity={frames} rate={frameRate} extended={frameRental} />
        <BigQuantity label="Planks" quantity={planks} rate={plankRate} extended={plankRental} />
      </div>
      <p className="mt-1.5 font-mono text-[9px] text-zinc-600">
        {rentalMonths} billing month{rentalMonths === 1 ? "" : "s"} applied
      </p>

      {/* Consumables — collapsed until needed. Most jobs don't carry any. */}
      <div className="mt-2.5 border-t border-zinc-900 pt-2">
        <button
          onClick={() => setConsumablesOpen(!consumablesOpen)}
          className="flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 text-left transition hover:bg-zinc-400/[0.04]"
        >
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-600">{consumablesOpen ? "−" : "+"}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
              Consumables
            </span>
            {filledCount > 0 && (
              <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 font-mono text-[9px] text-orange-300">
                {filledCount}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px] font-bold text-zinc-400">
            {formatMoney(consumablesRevenue)}
          </span>
        </button>

        {consumablesOpen && (
          <div className="mt-1.5">
            <div className="grid grid-cols-[1fr_52px_60px_66px_20px] gap-2 px-1 pb-1">
              <span />
              <span className="text-right font-mono text-[9px] text-zinc-700">Qty</span>
              <span className="text-right font-mono text-[9px] text-zinc-700">Rate</span>
              <span className="text-right font-mono text-[9px] text-zinc-700">Ext.</span>
              <span />
            </div>

            {consumables.map((line) => {
              const custom = line.id.startsWith("custom-");
              return (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_52px_60px_66px_20px] items-center gap-2 border-t border-zinc-900/70 px-1 py-1"
                >
                  <span className="truncate text-[11px] text-zinc-400">{line.label}</span>
                  <MiniInput
                    value={line.quantity}
                    onChange={(v) => updateConsumable(line.id, "quantity", v)}
                    width="w-full"
                  />
                  <MiniInput
                    value={line.unitRate}
                    onChange={(v) => updateConsumable(line.id, "unitRate", v)}
                    prefix="$"
                    width="w-full"
                  />
                  <span className="text-right font-mono text-[11px] text-zinc-400">
                    {formatMoney(line.quantity * line.unitRate)}
                  </span>
                  {custom ? (
                    <button
                      onClick={() => removeConsumable(line.id)}
                      className="text-center font-mono text-[10px] text-zinc-700 hover:text-red-400"
                      aria-label={`Remove ${line.label}`}
                    >
                      ✕
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}

            <div className="mt-1.5 flex items-center gap-1.5 border-t border-zinc-800 pt-1.5">
              <span className="flex min-w-0 flex-1 rounded border border-zinc-800 bg-korban-raised px-2 py-1 focus-within:border-orange-500/40">
                <TextField
                  value={newLabel}
                  onChange={setNewLabel}
                  onSubmit={submitNew}
                  placeholder="Name a special item"
                  className="text-[11px] text-zinc-300 placeholder:text-zinc-700"
                />
              </span>
              <button
                onClick={submitNew}
                className="rounded border border-zinc-700 bg-zinc-400/[0.06] px-3 py-1 font-mono text-[10px] font-medium text-zinc-300 transition hover:border-orange-500/40 hover:text-orange-300"
              >
                Add item
              </button>
            </div>
          </div>
        )}
      </div>

      <TotalBox label={`Rental revenue · ${rentalDays} days`} value={rentalsRevenue} />
    </Panel>
  );
}

function BigQuantity({
  label, quantity, rate, extended,
}: {
  label: string; quantity: number; rate: number; extended: number;
}) {
  const rolled = useRollingNumber(quantity);
  return (
    <div className="rounded border border-zinc-900 bg-korban-raised px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">{label}</span>
        <span className="font-mono text-[11px] font-bold text-zinc-400">{formatMoney(extended)}</span>
      </div>
      <p className="mt-0.5 font-mono text-[28px] font-bold leading-none text-orange-400">
        {Math.round(rolled).toLocaleString()}
      </p>
      <p className="mt-0.5 font-mono text-[9px] text-zinc-600">${rate.toFixed(2)}/ea · mo</p>
    </div>
  );
}

// ----------------------------------------------------------------------
// Labor
// ----------------------------------------------------------------------

function LaborPanel({
  erectHours, dismantleHours, travel, siteMiles, setSiteMiles,
  erectRate, setErectRate, travelRate, setTravelRate,
  erectCost, dismantleCost, travelCost, laborCost, dismantlePercent,
}: {
  erectHours: number; dismantleHours: number;
  travel: { loads: number; legs: number; legHours: number; hours: number; cost: number };
  siteMiles: number;
  setSiteMiles: (miles: number) => void;
  erectRate: number; setErectRate: (rate: number) => void;
  travelRate: number; setTravelRate: (rate: number) => void;
  erectCost: number; dismantleCost: number; travelCost: number; laborCost: number;
  dismantlePercent: number;
}) {
  return (
    <Panel
      title="Labor"
      right={
        <div className="flex items-center gap-1.5">
          <MiniInput value={erectRate} onChange={setErectRate} prefix="$" width="w-16" />
          <span className="font-mono text-[9px] text-zinc-600">/hr</span>
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_auto_88px] items-center gap-3 px-1 py-1 opacity-45">
        <span className="text-[11px] text-zinc-500">Stock in</span>
        <span className="font-mono text-[9px] text-zinc-700">set by Korban Review</span>
        <span className="text-right font-mono text-[11px] text-zinc-700">—</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_88px] items-center gap-3 px-1 py-1 opacity-45">
        <span className="text-[11px] text-zinc-500">Stock out</span>
        <span className="font-mono text-[9px] text-zinc-700">set by Korban Review</span>
        <span className="text-right font-mono text-[11px] text-zinc-700">—</span>
      </div>

      <div className="my-1.5 h-px bg-zinc-800" />

      <div className="grid grid-cols-[1fr_auto_88px] items-center gap-3 px-1 py-1">
        <span className="text-[11px] text-zinc-300">Erect</span>
        <span className="font-mono text-[9px] text-zinc-600">
          {erectHours.toLocaleString()} hrs × ${erectRate}
        </span>
        <span className="text-right font-mono text-[12px] font-bold text-zinc-200">
          {formatMoney(erectCost)}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_88px] items-center gap-3 px-1 py-1">
        <div>
          <span className="text-[11px] text-zinc-500">Dismantle</span>
          <p className="font-mono text-[9px] text-zinc-700">
            {dismantlePercent}% of erect · from backend settings
          </p>
        </div>
        <span className="font-mono text-[9px] text-zinc-600">
          {dismantleHours.toLocaleString()} hrs × ${erectRate}
        </span>
        <span className="text-right font-mono text-[12px] font-bold text-zinc-500">
          {formatMoney(dismantleCost)}
        </span>
      </div>

      <div className="my-1.5 h-px bg-zinc-800" />

      <div className="grid grid-cols-[1fr_auto_88px] items-center gap-3 px-1 py-1">
        <div>
          <span className="text-[11px] text-zinc-300">Travel</span>
          <p className="font-mono text-[9px] text-zinc-700">
            {siteMiles > 0
              ? `${travel.loads} load${travel.loads === 1 ? "" : "s"} \u00b7 ${travel.legs} legs \u00b7 ${travel.hours} hrs`
              : "Enter miles to site"}
          </p>
        </div>
        <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
          <MiniInput value={siteMiles} onChange={setSiteMiles} width="w-14" />
          mi to site
        </span>
        <span className="text-right font-mono text-[12px] font-bold text-zinc-200">
          {formatMoney(travelCost)}
        </span>
      </div>

      <TotalBox label="Labor cost" value={laborCost} />
    </Panel>
  );
}

// ----------------------------------------------------------------------
// Production
// ----------------------------------------------------------------------

function ProductionPanel({
  productionKey, setProductionKey, crewSize, setCrewSize, phaseModeOn, setPhaseModeOn,
  phases, updatePhase, renamePhase, addPhase, removePhase,
  selectedProductionDays, coverageByFace, hasCoverage,
  phaseDays, erectHours, dismantleHours, dismantlePercent,
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
  coverageByFace: Record<string, number>;
  hasCoverage: boolean;
  phaseDays: number;
  erectHours: number;
  dismantleHours: number;
  dismantlePercent: number;
}) {
  const overBudget = phaseDays > selectedProductionDays;

  return (
    <Panel
      title="Production"
      right={
        <button
          onClick={() => setPhaseModeOn(!phaseModeOn)}
          className={`flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition ${
            phaseModeOn
              ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
              : "border-zinc-800 bg-korban-raised text-zinc-600 hover:text-zinc-400"
          }`}
        >
          <span
            className={`h-3 w-5 rounded-full border transition ${
              phaseModeOn ? "border-zinc-400 bg-zinc-300" : "border-zinc-700 bg-zinc-800"
            }`}
          >
            <span
              className={`block h-2 w-2 translate-y-[1px] rounded-full bg-black transition ${
                phaseModeOn ? "translate-x-[10px]" : "translate-x-[2px]"
              }`}
            />
          </span>
          Phase production
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        {PRODUCTION_TYPES.map((type) => {
          const active = type.key === productionKey;
          return (
            <button
              key={type.key}
              onClick={() => setProductionKey(type.key)}
              title={type.note}
              className={`rounded border px-3 py-1 font-mono text-[10px] font-medium transition ${
                active
                  ? "border-white/30 bg-white/[0.06] text-white shadow-[0_0_12px_rgba(255,255,255,0.1)]"
                  : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {type.title}
              <span className="ml-1.5 font-normal text-zinc-500">{type.days}d</span>
            </button>
          );
        })}
      </div>

      {!phaseModeOn ? (
        <div className="flex flex-wrap items-baseline gap-4 border-t border-zinc-900 pt-2">
          <p
            className="text-[22px] font-semibold leading-none text-zinc-200"
            style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
          >
            {selectedProductionDays} days
          </p>
          <span className="flex items-baseline gap-1.5">
            <MiniInput value={crewSize} onChange={(v) => setCrewSize(Math.max(1, v))} width="w-12" />
            <span className="text-[11px] text-zinc-500">laborers</span>
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-500">
            {erectHours.toLocaleString()} erect hrs
            <span className="mx-1.5 text-zinc-800">·</span>
            <span className="text-zinc-600">
              {dismantleHours.toLocaleString()} dismantle at {dismantlePercent}%
            </span>
          </span>
        </div>
      ) : (
        <div className="border-t border-zinc-900 pt-1.5">
          <div className="grid grid-cols-[1fr_52px_52px_72px_76px_24px] gap-2 px-1 pb-1">
            {["Phase", "Days", "Crews", "Men per crew", "Man-hours", ""].map((heading) => (
              <span key={heading} className="font-mono text-[9px] tracking-[0.1em] text-zinc-600">
                {heading}
              </span>
            ))}
          </div>

          {!hasCoverage && (
            <p className="border-t border-zinc-900 px-1 py-2 font-mono text-[10px] leading-[1.6] text-zinc-600">
              No elevation coverage recorded yet. Grip the faces that need
              scaffold in Takeoff Workspace and the phase plan fills in from
              what you actually measured.
            </p>
          )}

          {phases.map((row) => {
            const manHours = row.days * row.crews * row.menPerCrew * HOURS_PER_DAY;
            const faceLf = coverageByFace[row.phase] ?? 0;
            // A face nobody gripped isn't a zero-day phase - it's not in scope.
            // Saying so is more useful than showing an editable row of zeros.
            const inScope = faceLf > 0;
            return (
              <div
                key={row.id}
                className={`grid grid-cols-[1fr_52px_52px_72px_76px_24px] items-center gap-2 border-t border-zinc-900/70 px-1 py-1 ${
                  inScope ? "" : "opacity-40"
                }`}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[11px] text-zinc-300">{row.phase}</span>
                  {inScope ? (
                    <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                      {Math.round(faceLf).toLocaleString()} LF
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-[9px] text-zinc-700">not in scope</span>
                  )}
                </span>
                {inScope ? (
                  <>
                    <MiniInput value={row.days} onChange={(v) => updatePhase(row.id, "days", v)} width="w-full" />
                    <MiniInput value={row.crews} onChange={(v) => updatePhase(row.id, "crews", v)} width="w-full" />
                    <MiniInput value={row.menPerCrew} onChange={(v) => updatePhase(row.id, "menPerCrew", v)} width="w-full" />
                    <span className="text-right font-mono text-[11px] font-bold text-zinc-300">
                      {manHours.toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-right font-mono text-[11px] text-zinc-700">&mdash;</span>
                    <span className="text-right font-mono text-[11px] text-zinc-700">&mdash;</span>
                    <span className="text-right font-mono text-[11px] text-zinc-700">&mdash;</span>
                    <span className="text-right font-mono text-[11px] text-zinc-700">&mdash;</span>
                  </>
                )}
                <button
                  onClick={() => removePhase(row.id)}
                  className="text-center font-mono text-[10px] text-zinc-700 hover:text-red-400"
                  aria-label={`Remove ${row.phase}`}
                >
                  &times;
                </button>
              </div>
            );
          })}

          {/* Total across every face in scope. */}
          {hasCoverage && (
            <div className="grid grid-cols-[1fr_52px_52px_72px_76px_24px] items-center gap-2 border-t border-zinc-800 px-1 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {phases.filter((row) => (coverageByFace[row.phase] ?? 0) > 0).length === phases.length
                  ? "Full exterior"
                  : "Faces in scope"}
              </span>
              <span className="text-right font-mono text-[11px] font-bold text-orange-300">
                {phaseDays}
              </span>
              <span />
              <span />
              <span className="text-right font-mono text-[11px] font-bold text-orange-300">
                {erectHours.toLocaleString()}
              </span>
              <span />
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-zinc-800 px-1 pt-1.5">
            <button
              onClick={addPhase}
              className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              Add phase
            </button>
            <span className="font-mono text-[10px] text-zinc-500">
              <span className={overBudget ? "font-bold text-red-400" : "font-bold text-zinc-300"}>
                {phaseDays} of {selectedProductionDays} days
              </span>
              <span className="mx-1.5 text-zinc-800">·</span>
              {erectHours.toLocaleString()} erect hrs
              <span className="mx-1.5 text-zinc-800">·</span>
              <span className="text-zinc-600">dismantle derives at {dismantlePercent}%</span>
            </span>
          </div>

          {overBudget && (
            <p className="mt-1 px-1 font-mono text-[9px] text-red-400">
              Phases exceed the day budget for this production type.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------
// Revision history
// ----------------------------------------------------------------------

function RevisionHistory({
  bidRoundPhase, setBidRoundPhase, activeRevision,
}: {
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
  activeRevision: BidRevision | null;
}) {
  return (
    <section className="relative mt-3 rounded-lg border border-zinc-800 bg-korban-base px-3 py-2">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          Bid round
        </h3>
        {bidRoundPhases.map((phase) => {
          const active = phase === bidRoundPhase;
          const recorded = revisionHistory.find((revision) => revision.phase === phase);
          return (
            <button
              key={phase}
              onClick={() => setBidRoundPhase(phase)}
              title={recorded?.note}
              className={`rounded border px-2.5 py-1 font-mono text-[10px] transition ${
                active
                  ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                  : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              <span className="font-medium">{phase}</span>
              {recorded && <span className="ml-1.5">{formatMoney(recorded.amount)}</span>}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          {activeRevision
            ? `${activeRevision.date} - ${activeRevision.note}`
            : "No rounds submitted yet - history builds as prices go out"}
        </span>
      </div>
    </section>
  );
}


// ----------------------------------------------------------------------
// Partial exterior
// ----------------------------------------------------------------------

function PartialExteriorAccordion({
  completeExteriorCost, elevationPricing, partialExteriorMarkupPercent,
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
    <section className="mt-3 rounded-lg border border-zinc-800 bg-korban-base">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600">{open ? "−" : "+"}</span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Complete vs partial exterior
          </span>
        </span>
        <span className="font-mono text-[9px] text-zinc-600">
          +{partialExteriorMarkupPercent}% partial markup
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-900 p-3">
          <p className="text-[10px] leading-4 text-zinc-500">
            Partial pricing reflects the added cost of mobilizing elevation by elevation instead of
            as one complete exterior job.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded border border-zinc-900 bg-korban-raised px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                Complete exterior
              </p>
              <p className="mt-0.5 font-mono text-base font-bold text-zinc-200">
                {formatMoney(completeExteriorCost)}
              </p>
            </div>
            <div className="rounded border border-zinc-900 bg-korban-raised px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                Partial exterior
              </p>
              <p className="mt-0.5 font-mono text-base font-bold text-zinc-200">
                {elevationPricing.hasData ? formatMoney(elevationPricing.totalPartialCost) : "—"}
              </p>
              {!elevationPricing.hasData && (
                <p className="mt-0.5 text-[9px] text-zinc-600">
                  Enter approximate LF per elevation in Takeoff Workspace to see this.
                </p>
              )}
            </div>
          </div>

          {elevationPricing.hasData && (
            <div className="mt-2">
              {elevationPricing.rows.map((row) => (
                <div
                  key={row.elevation}
                  className="grid grid-cols-[70px_1fr_90px_100px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1 font-mono text-[10px]"
                >
                  <span className="font-bold text-zinc-300">{row.elevation}</span>
                  <span className="text-zinc-600">
                    {row.approxLinearFeet.toLocaleString()} LF · {row.sharePercent.toFixed(0)}%
                  </span>
                  <span className="text-right text-zinc-600">{formatMoney(row.baseShare)}</span>
                  <span className="text-right font-bold text-zinc-300">
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

// ----------------------------------------------------------------------
// Proposal tab
// ----------------------------------------------------------------------

function ProposalTab({
  estimate, bidLevel, erectDays, dismantleDays, crewSize, erectHours, dismantleHours,
  elevationBreakdownRows, planOutline, scaffoldWidth, bayLength, planksPerDeck, wallHeight,
  company, backend, rentalDays, rentalMonths, rentalsRevenue, laborRevenue,
  miscRevenue, setMiscRevenue, alternateRevenue, finalBid,
  approvedAlternates, toggleAlternate, alternatePricing, alternateSettings,
  updateAlternateSettings, proposalNotes, setProposalNotes, finish, setFinish, proposalStatus, setProposalStatus, bidRoundPhase, setBidRoundPhase,
}: {
  estimate: EstimateData;
  bidLevel: BidLevel;
  erectDays: number;
  dismantleDays: number;
  crewSize: number;
  erectHours: number;
  dismantleHours: number;
  elevationBreakdownRows: { elevation: string; approxLinearFeet: number }[];
  planOutline: { x: number; y: number }[];
  scaffoldWidth: number;
  bayLength: number;
  planksPerDeck: number;
  wallHeight: number;
  company: { name: string; phone: string; email: string };
  backend: BackendSettings | null;
  rentalDays: number;
  rentalMonths: number;
  rentalsRevenue: number;
  laborRevenue: number;
  miscRevenue: number;
  setMiscRevenue: (value: number) => void;
  alternateRevenue: number;
  finalBid: number;
  approvedAlternates: AlternateId[];
  toggleAlternate: (id: AlternateId) => void;
  alternatePricing: Record<AlternateId, AlternateResult>;
  alternateSettings: AlternateSettings;
  updateAlternateSettings: (patch: Partial<AlternateSettings>) => void;
  proposalNotes: string;
  setProposalNotes: (notes: string) => void;
  finish: string;
  setFinish: (finish: string) => void;
  proposalStatus: ProposalStatus;
  setProposalStatus: (status: ProposalStatus) => void;
  bidRoundPhase: BidRoundPhase;
  setBidRoundPhase: (phase: BidRoundPhase) => void;
}) {
  // Which field on the left is being edited right now. The matching block in
  // the printed sheet lights up, so you can see what you're changing before
  // it goes to the client.
  const [activeField, setActiveField] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  /** Shows for a moment after the link is copied, then goes away. */
  const [linkCopied, setLinkCopied] = useState(false);
  /** Set once the bid has been printed, saved or shared. */
  const [sentPrompt, setSentPrompt] = useState<string | null>(null);
  const focusHandler = (field: string) => (active: boolean) =>
    setActiveField((current) => (active ? field : current === field ? null : current));

  // The deck reads straight from the estimate — nothing here is authored
  // separately, so a presentation can never drift from the bid it came from.
  const presentationData: BidPresentationData = {
    projectName: estimate.projectName,
    projectAddress: estimate.projectAddress,
    customer: estimate.customer,
    estimator: backend?.estimator.estimatorName || estimate.estimator,
    proposalNumber: estimate.proposalNumber,
    bidDate: estimate.bidDate,
    depth: bidLevel,
    company: company.name,
    companyPhone: backend?.estimator.estimatorPhone || company.phone,
    companyEmail: backend?.estimator.estimatorEmail || company.email,
    // Trade word for the cost slide. Swaps when KORBAN adds trades beyond scaffold.
    trade: "scaffold",
    // Only faces with recorded coverage. An empty list is honest - a deck
    // that claims full perimeter on a job nobody gripped is not.
    elevationsCovered: elevationBreakdownRows.map((row) => row.elevation),
    linearFeet: estimate.totalLinearFeet,
    wallHeight: wallHeight || estimate.jumps * 6.333 + 6,
    frames: estimate.frames,
    planks: estimate.planks,
    crossBraces: estimate.crossBraces,
    guardrails: estimate.guardrails,
    basePlates: estimate.basePlates,
    screwJacks: estimate.screwJacks,
    couplingPins: estimate.couplingPins,
    bays: estimate.bays,
    legs: estimate.legs,
    framesPerLeg: estimate.jumps,
    jumps: estimate.jumps,
    scaffoldWidth,
    bayLength,
    planksPerDeck,
    erectDays,
    dismantleDays,
    crewSize,
    erectHours,
    dismantleHours,
    rentalRevenue: rentalsRevenue,
    laborRevenue,
    rentalDays,
    finalBid,
    outline: planOutline,
    elevations: elevationBreakdownRows.map((row) => ({
      elevation: row.elevation,
      linearFeet: row.approxLinearFeet,
    })),
  };

  return (
    <Workspace>
      {presenting && (
        <BidPresentation data={presentationData} onClose={() => setPresenting(false)} />
      )}
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.95fr)]">
        {/* -- Entry side ----------------------------------------------- */}
        <div className="grid items-start gap-3">
          <Panel title="Project and customer" scan={false}>
            <div className="grid gap-x-6 md:grid-cols-2">
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
          </Panel>

          <Panel title="Price to client" scan={false}>
            <FigureRow label="Rental" value={rentalsRevenue} />
            <FigureRow label="Labor" value={laborRevenue} />
            <div className="grid grid-cols-[1fr_96px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1">
              <span className="text-[11px] text-zinc-500">Misc</span>
              <MiniInput
                value={miscRevenue}
                onChange={setMiscRevenue}
                prefix="$"
                width="w-full"
                onFocusField={focusHandler("misc")}
              />
            </div>
            <FigureRow label="Alternates" value={alternateRevenue} />
            <TotalBox label="Proposal total" value={finalBid} />
          </Panel>

          <AlternatesPanel
            count={approvedAlternates.length}
            total={alternateRevenue}
          >
            <div className="grid items-start gap-1.5 md:grid-cols-2">
              {ALTERNATE_ORDER.map((id) => (
                <AlternateTile
                  key={id}
                  id={id}
                  result={alternatePricing[id]}
                  included={approvedAlternates.includes(id)}
                  onToggle={() => toggleAlternate(id)}
                  settings={alternateSettings}
                  updateSettings={updateAlternateSettings}
                  onHover={(active) =>
                    setActiveField((current) =>
                      active ? `alt-${id}` : current === `alt-${id}` ? null : current
                    )
                  }
                />
              ))}
            </div>
          </AlternatesPanel>

          <Panel title="Work being performed" scan={false}>
            <p className="mb-2 text-[10px] leading-4 text-zinc-500">
              What the scaffold is for. This drives the proposal description.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FINISHES.map((option) => {
                const active = finish === option;
                return (
                  <button
                    key={option}
                    onClick={() => {
                      setFinish(option);
                      setActiveField("finish");
                    }}
                    onMouseEnter={() => setActiveField("finish")}
                    onMouseLeave={() =>
                      setActiveField((current) => (current === "finish" ? null : current))
                    }
                    className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition ${
                      active
                        ? "border-orange-400/45 bg-orange-400/[0.06] text-orange-200"
                        : "border-zinc-900 bg-korban-raised text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Additional proposal notes" scan={false}>
            <textarea
              value={proposalNotes}
              onChange={(event) => setProposalNotes(event.target.value)}
              onFocus={() => setActiveField("notes")}
              onBlur={() => setActiveField((c) => (c === "notes" ? null : c))}
              className="min-h-24 w-full resize-none rounded border border-zinc-900 bg-korban-raised p-2.5 text-[11px] leading-5 text-zinc-300 outline-none focus:border-orange-500/40"
            />
          </Panel>

          <Panel title="Status" scan={false}>
            <div className="grid gap-1 md:grid-cols-2">
              {(["Draft", "Internal Review", "Ready To Send", "Submitted"] as ProposalStatus[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setProposalStatus(status)}
                    className={`rounded border px-2.5 py-1.5 text-left font-mono text-[11px] font-medium transition ${
                      proposalStatus === status
                        ? "border-orange-400/45 bg-orange-400/[0.06] text-orange-200"
                        : "border-zinc-900 bg-korban-raised text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {status}
                  </button>
                )
              )}
            </div>

            <div className="my-2 h-px bg-zinc-800" />

            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
              Bid round
            </p>
            <div className="flex flex-wrap gap-1">
              {bidRoundPhases.map((phase) => (
                <button
                  key={phase}
                  onClick={() => setBidRoundPhase(phase)}
                  className={`rounded border px-2 py-1 font-mono text-[10px] font-medium transition ${
                    bidRoundPhase === phase
                      ? "border-zinc-500 bg-zinc-400/10 text-zinc-200"
                      : "border-zinc-900 bg-korban-raised text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {phase}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* -- Live sheet ----------------------------------------------- */}
        <div className="xl:sticky xl:top-3">
          <div className="korban-no-print mb-1.5 flex items-center justify-between px-1">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              Live proposal
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-zinc-600">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500 align-middle" />
                live fields
              </span>
              <button
                onClick={() => {
                  window.print();
                  setSentPrompt("");
                }}
                title="Pick Save as PDF in the print dialog to send it as a file"
                className="rounded border border-zinc-800 bg-korban-raised px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              >
                Print / PDF
              </button>
              <button
                onClick={() => setPresenting(true)}
                className="rounded border border-orange-500/50 bg-orange-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-orange-300 transition hover:border-orange-500 hover:bg-orange-500/20"
              >
                + Bid presentation
              </button>
              <button
                onClick={async () => {
                  // The whole bid rides in the link, so there is nothing to
                  // upload and nothing for the client to log into.
                  const url = buildPresentationUrl(presentationData);
                  try {
                    await navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    setSentPrompt(url);
                    window.setTimeout(() => setLinkCopied(false), 2400);
                  } catch {
                    window.prompt("Copy this link", url);
                  }
                }}
                title="Copies a link that plays the presentation in any browser"
                className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition ${
                  linkCopied
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-800 bg-korban-raised text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
                }`}
              >
                {linkCopied ? "Link copied" : "Share link"}
              </button>
              <button
                onClick={() => {
                  setProposalStatus("Ready To Send");
                  setSentPrompt("");
                }}
                className="rounded bg-orange-500 px-2.5 py-1 font-mono text-[10px] font-bold text-black hover:bg-orange-400"
              >
                Send
              </button>
            </span>
          </div>
          {/* A bid that has been saved or shared is a bid that wants sending.
              Saying so here beats the estimator remembering to. */}
          {sentPrompt !== null && (
            <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-orange-500/40 bg-orange-500/[0.07] px-3 py-2">
              <span className="min-w-0 flex-1 text-[11.5px] text-orange-100">
                Ready to go out. Want me to draft the message?
              </span>
              <button
                onClick={() => {
                  window.location.href = sentPrompt
                    ? `/compose-message?link=${encodeURIComponent(sentPrompt)}`
                    : "/compose-message";
                }}
                className="rounded bg-orange-500 px-3 py-1 font-mono text-[10px] font-bold text-black transition hover:bg-orange-400"
              >
                Compose
              </button>
              <button
                onClick={() => setSentPrompt(null)}
                className="font-mono text-[10px] text-zinc-500 transition hover:text-zinc-300"
              >
                not now
              </button>
            </div>
          )}

          <ProposalSheet
            estimate={estimate}
            rentalDays={rentalDays}
            rentalMonths={rentalMonths}
            rentalsRevenue={rentalsRevenue}
            laborRevenue={laborRevenue}
            miscRevenue={miscRevenue}
            alternateRevenue={alternateRevenue}
            finalBid={finalBid}
            approvedAlternates={approvedAlternates}
            alternatePricing={alternatePricing}
            backend={backend}
            proposalNotes={proposalNotes}
            finish={finish}
            proposalStatus={proposalStatus}
            activeField={activeField}
          />
        </div>
      </div>
    </Workspace>
  );
}

/**
 * Alternates are excluded until asked for, so the panel is closed until asked
 * for too. Opening it expanded with six priced options invited an estimator to
 * treat them as part of the base bid.
 */
function AlternatesPanel({
  count, total, children,
}: {
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 pb-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600">{open ? "\u2212" : "+"}</span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Add alternates
          </span>
          {count > 0 && (
            <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 font-mono text-[9px] text-orange-300">
              {count}
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] font-bold text-zinc-400">
          {count > 0 ? formatMoney(total) : <span className="text-zinc-700">none selected</span>}
        </span>
      </button>
      {open && <div className="rounded border border-zinc-900 bg-black p-2.5">{children}</div>}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Alternate tile
//
// Reads as a card: title, what it is, and what it costs. Selecting one opens
// its controls in place - no second click to reach them, and nothing hidden
// behind a menu. The controls only appear once an alternate is in the bid,
// because adjusting something you haven't taken is noise.
// -----------------------------------------------------------------------------

function AlternateTile({
  id, result, included, onToggle, settings, updateSettings, onHover,
}: {
  id: AlternateId;
  result: AlternateResult;
  included: boolean;
  onToggle: () => void;
  settings: AlternateSettings;
  updateSettings: (patch: Partial<AlternateSettings>) => void;
  onHover: (active: boolean) => void;
}) {
  const hasControls =
    id === "shrink-wrap" || id === "toe-boards" || id === "hoist-landing" || id === "stair-tower";

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`rounded border transition ${
        included
          ? "border-orange-400/45 bg-orange-400/[0.06]"
          : "border-zinc-900 bg-korban-raised hover:border-zinc-700"
      }`}
    >
      <button onClick={onToggle} className="w-full px-2.5 py-2 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[11px] font-bold ${included ? "text-orange-200" : "text-zinc-200"}`}>
              {result.title}
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
              {result.description}
            </p>
            <p className="mt-1 font-mono text-[9px] text-zinc-600">{result.basis}</p>
          </div>
          <span
            className={`shrink-0 font-mono text-[12px] font-bold ${
              included ? "text-orange-300" : "text-zinc-400"
            }`}
          >
            {formatMoney(result.value)}
          </span>
        </div>
      </button>

      {included && (
        <div className="border-t border-orange-400/25 px-2.5 py-2">
          {hasControls && (
            <div className="mb-2">
              {id === "shrink-wrap" && (
                <Choice
                  label="Coverage"
                  options={[
                    { value: "full", label: "Full" },
                    { value: "cap", label: "Cap only" },
                  ]}
                  value={settings.shrinkWrapMode}
                  onChange={(value) => updateSettings({ shrinkWrapMode: value as ShrinkWrapMode })}
                />
              )}

              {id === "toe-boards" && (
                <Choice
                  label="Side"
                  options={[
                    { value: "outside", label: "Outside" },
                    { value: "inside", label: "Inside" },
                    { value: "both", label: "Both" },
                  ]}
                  value={settings.toeBoardSide}
                  onChange={(value) => updateSettings({ toeBoardSide: value as ToeBoardSide })}
                />
              )}

              {id === "stair-tower" && (
                <div className="grid gap-2">
                  <button
                    onClick={() =>
                      updateSettings({ stairTowerParapet: !settings.stairTowerParapet })
                    }
                    className="flex items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition ${
                        settings.stairTowerParapet
                          ? "border-orange-400 bg-orange-500 text-black"
                          : "border-orange-400/40 bg-black"
                      }`}
                    >
                      {settings.stairTowerParapet && (
                        <span className="font-mono text-[9px] font-bold leading-none">&#10003;</span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-orange-200/80">
                      Up and over parapet
                    </span>
                    <span className="font-mono text-[9px] text-zinc-600">2&ndash;4&apos; parapet</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-orange-300/70">
                      Walkoffs
                    </span>
                    <MiniInput
                      value={settings.stairTowerWalkoffs}
                      onChange={(value) => updateSettings({ stairTowerWalkoffs: Math.max(0, value) })}
                      width="w-14"
                    />
                    <span className="font-mono text-[9px] text-zinc-600">
                      decks accessing floor levels
                    </span>
                  </div>
                </div>
              )}

              {id === "hoist-landing" && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-orange-300/70">
                    Quantity
                  </span>
                  <MiniInput
                    value={settings.hoistLandingQuantity}
                    onChange={(value) => updateSettings({ hoistLandingQuantity: Math.max(1, value) })}
                    width="w-14"
                  />
                  <span className="font-mono text-[9px] text-zinc-600">
                    10&apos; x 10&apos; x 4&apos; tall, fixed
                  </span>
                </div>
              )}
            </div>
          )}

          <div className={hasControls ? "border-t border-orange-400/15 pt-1.5" : ""}>
            {result.lines.map((line) => (
              <div
                key={line.label}
                className="grid grid-cols-[1fr_auto_78px] items-center gap-3 py-0.5"
              >
                <span className="text-[10px] text-zinc-400">{line.label}</span>
                <span className="font-mono text-[9px] text-zinc-600">{line.detail}</span>
                <span className="text-right font-mono text-[10px] text-zinc-300">
                  {formatMoney(line.amount)}
                </span>
              </div>
            ))}
          </div>

          {result.proposalNote && (
            <p className="mt-1.5 border-l-2 border-orange-400/50 bg-orange-400/[0.05] py-1 pl-2 text-[9px] leading-[1.5] text-zinc-400">
              Prints on the proposal: {result.proposalNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-orange-300/70">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded border px-2.5 py-0.5 font-mono text-[10px] font-medium transition ${
              value === option.value
                ? "border-orange-400 bg-orange-500 text-black"
                : "border-orange-400/30 bg-transparent text-orange-200/70 hover:border-orange-400/60 hover:text-orange-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}



// ----------------------------------------------------------------------
// Live proposal sheet
//
// A KORBAN document, not a Word file. Paper stock and black type because it
// has to print and be read across a table — but the furniture is ours: dark
// masthead, orange section rules, Barlow Condensed headings, Fira Code for
// every figure. Blocks bound to live data carry a faint orange rule; the one
// you're editing lights up.
//
// All boilerplate below is DEFAULT TEXT ONLY. Backend → Proposal already has
// introLanguage, scopeLanguage, exclusionsLanguage, termsLanguage and
// signatureBlock waiting for it, so each company can carry its own language.
// ----------------------------------------------------------------------

const SHEET_NOTES = [
  { text: "Gabled ends will not qualify for roof fall protection.", flag: true },
  { text: "Netting life expectancy is approx. 6 months. Any fixes to be done on T&M basis after 6 months.", flag: false },
  { text: "Scaffold tie-backs figured to wall framing of building. Patching of ties to be done by others.", flag: false },
  { text: "Must have truck access to all elevations of each building for install and dismantle of scaffold.", flag: false },
  { text: "Price based on normal work week and hours. Monday – Friday 7am–3:30pm", flag: false },
];

const SHEET_EXCLUSIONS = [
  "Overhead protection", "CCIP / OCIP", "Parking costs",
  "License, permits and fees", "Toe boards", "Material hoisting",
  "Plywood / fire treated plywood", "Shoring", "Ramps / bridges",
  "Roof and deck damage", "Bonds", "Drug testing",
  "Roof fall protection", "Netting", "Engineering",
  "Inside fall protection", "Patching holes", "100% tie off",
  "Waiver of subrogation", "Containment", "Liquidated damages",
];

const SHEET_QUALIFICATIONS = [
  "We reserve the right to negotiate mutual and agreeable contract terms and conditions prior to commencement of work.",
  "Scaffold shall be installed to comply with all Cal-OSHA regulations.",
  "Truck access is required to the work area for installation and removal. The contractor is responsible for providing parking permits if required.",
  "No scaffold figured for walls and soffits 13ft and below at grade level, or 9ft and below at roof areas.",
  "Pre-construction meeting required for design layout and project schedule.",
  "Any debris, material or machinery that may interfere with installation shall be removed by the contractor before we commence.",
  "Grade and soil compaction to be adequate for scaffold installation and loads.",
  "It is the responsibility of the contractor to maintain grade conditions to prevent erosion, undermining and instability for the installed scaffolding.",
  "A 14 day notification for installation is required prior to job start.",
  "A signed proposal, sub-contract or purchase order is required prior to commencement of work.",
  "Working scaffold platforms are not to be used as building access and egress.",
  "Tie-ins to building are based on one time only.",
  "We are not responsible for any roof or deck damage.",
  "Quotation is valid for 30 days.",
];

/**
 * Qualification language that only prints when its alternate is selected.
 * Shrink wrap is transcribed from the real document. The other alternates
 * carry no clause block today — add them here as they're written.
 */
const ALTERNATE_QUALIFICATIONS: Partial<
  Record<AlternateId, { heading: string; items: { term: string; body: string }[] }>
> = {
  "shrink-wrap": {
    heading: "Shrink-wrap qualifications",
    items: [
      { term: "Ties to concrete structure", body: "All elevations where shrink-wrap is applied will have scaffold ties attached at every frame leg horizontally and every plank level vertically at all floor levels. Ties will be attached back to structure at all floors and column lines with a push-pull drop-in anchor and ½\" all-thread and nut system. We are responsible for the scaffold only; shrink-wrap must be kept up and maintained by others. Shrink-wrap not held at a secure, tight attachment to scaffold can result in failure." },
      { term: "Ties to wood structure", body: "As above, attached back to structure at all floors and column lines with a push-pull drilled ½\" anchor wood lag screw system." },
      { term: "Ties to steel structure", body: "As above, attached back to structure with a push-pull female coupler system and ½\" all-thread and nuts. Couplers must be welded by others to support wind load integrity." },
      { term: "Alterations", body: "At no time shall scaffold be modified or altered under any circumstances while shrink-wrap is in place. We are not responsible for failure or damages caused by this action. Any repairs needed to shrink-wrap once installed are on a time and material basis." },
      { term: "Poly sheeting", body: "Poly sheeting is durable but will not withstand extreme conditions and can be punctured or torn. UV exposure deteriorates the product over time. No duration is warranted. All repairs are on a time and material reimbursement basis. Shrink-wrap containment is not waterproof or water resistant — condensation can form on the poly surface and travel into adjoining spaces. Plastic can fail where repeated positive and negative pressures are introduced." },
      { term: "Alteration requests", body: "Contact a company representative for any alterations needed to the structure." },
      { term: "Weather", body: "Scaffold failure caused by severe weather, strikes or accidents beyond our control shall not be our responsibility." },
      { term: "Daily inspections", body: "A daily inspection is required for the safe upkeep and awareness of shrink-wrap integrity. This maintains the life expectancy it is designed for." },
    ],
  },
};

const SHEET_TERMS: { title: string; body: string }[] = [
  { title: "Billing terms", body: "Customer agrees to pay all invoices within 30 days of invoice date. 70% of the quoted price is billed upon installation, the remaining 30% billed at dismantle. Retention does not apply. Rental begins upon customer access and is based per calendar day. In the event payment is not made we reserve the right to suspend or terminate this agreement. A 1.5% monthly interest rate applies to invoices over 60 days. Credit approval is required prior to execution. Customer is responsible for all costs and attorney's fees incurred to recover unpaid sums due under this agreement." },
  { title: "Extra work", body: "No extra work or modification outside this proposal will be performed unless requested in writing by change order or written approval to increase the proposed amount. Additions are billed at $150.00 straight time, $200.00 overtime and $250.00 double time per hour. Additional rental, trucking, material, tools and equipment are charged at cost plus 15%. Pricing assumes continuous straight time, Monday through Friday, eight hours per day, excluding holidays. Overtime incurred to meet schedule is at the customer's expense." },
  { title: "Damaged, lost or stolen equipment", body: "Customer is responsible for all scaffold on this jobsite and agrees to reimburse for any lost, stolen or damaged equipment." },
  { title: "Containment", body: "No form of containment material shall be attached to the scaffold system without prior written authorization. Where this provision is violated we are held harmless for any claim arising from that infringement — netting, tarps, wraps and the like." },
  { title: "Indemnification", body: "The customer agrees to fully indemnify and hold harmless from all actions, claims, costs, damages, liabilities and expense, including reasonable attorney's fees, arising out of or by reason of the use or misuse of equipment rented hereunder, excepting only such claims resulting from our sole negligence. The intent is that the customer shall indemnify to the maximum extent allowed by law." },
  { title: "Customer accountability", body: "Only qualified personnel may access or work from the scaffold on this site. Customer shall ensure all access complies with Cal-OSHA, which requires scaffold and components to be inspected for visible defects by a competent person before each work shift and after any occurrence affecting structural integrity. The scaffold may not be altered, added to, or removed in part by the customer or any non-company personnel.\n\nCustomer shall immediately notify us of any incident directly or indirectly related to the services provided.\n\nCustomer is responsible for removal of debris, dirt, sand and concrete prior to dismantle. Costs incurred to remove accumulated debris are passed to the customer per the extra work clause. Repairs and patching of holes are the sole responsibility of the customer." },
];

const PAPER = "#f6f4f0";
const INK = "#141312";

/** Splits a Backend text block into lines, dropping blanks. */
function lines(text: string, fallback: string[]): string[] {
  const rows = (text ?? "")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
  return rows.length ? rows : fallback;
}

function LiveBlock({
  field, activeField, children, className = "",
}: {
  field: string;
  activeField: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const active = activeField === field;
  return (
    <div
      className={`korban-live-rule rounded-[2px] border-l-2 pl-2.5 transition-all duration-200 ${
        active
          ? "border-orange-500 bg-orange-500/[0.11] shadow-[0_0_0_3px_rgba(249,115,22,0.13)]"
          : "border-orange-500/25 bg-transparent"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function SheetPage({
  number, total, proposalNumber, showCorner = true, children,
}: {
  number: number;
  total: number;
  proposalNumber: string;
  showCorner?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="korban-sheet-page relative overflow-hidden rounded-[3px]" style={{ background: PAPER }}>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-3.5 w-3.5 border-l border-t border-orange-500/60" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-3.5 w-3.5 border-b border-r border-orange-500/60" />
      {/* Page one carries the number in the masthead; the rest carry it here. */}
      {showCorner && (
        <span className="absolute right-9 top-5 font-mono text-[8px] font-bold tracking-[0.14em] text-orange-600">
          {proposalNumber}
        </span>
      )}
      <div className="px-9 py-7" style={{ color: INK }}>
        {children}
        <div className="mt-7 flex items-center justify-between border-t pt-2" style={{ borderColor: "#d8d4cb" }}>
          <span className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-[#a5a099]">
            Generated by Korban
          </span>
          <span className="font-mono text-[7.5px] tracking-[0.14em] text-[#a5a099]">
            {number} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Orange tick, tracked condensed heading, hairline running to the margin. */
function SheetHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="h-3 w-[3px] shrink-0 bg-orange-500" />
      <span
        className="text-[13px] font-semibold uppercase leading-none tracking-[0.16em]"
        style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
      >
        {children}
      </span>
      <span className="h-px flex-1" style={{ background: "#d8d4cb" }} />
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[9px] leading-[1.5]">
      <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-orange-500" />
      <span>{children}</span>
    </li>
  );
}

function ProposalSheet({
  estimate, rentalDays, rentalMonths, rentalsRevenue, laborRevenue, miscRevenue,
  alternateRevenue, finalBid, approvedAlternates, alternatePricing, backend,
  proposalNotes, finish, proposalStatus,
  activeField,
}: {
  estimate: EstimateData;
  rentalDays: number;
  rentalMonths: number;
  rentalsRevenue: number;
  laborRevenue: number;
  miscRevenue: number;
  alternateRevenue: number;
  finalBid: number;
  approvedAlternates: AlternateId[];
  alternatePricing: Record<AlternateId, AlternateResult>;
  backend: BackendSettings | null;
  proposalNotes: string;
  finish: string;
  proposalStatus: ProposalStatus;
  activeField: string | null;
}) {
  // Every word below comes from Backend > Proposal Language, with the
  // constants at the top of this file as the fallback for a fresh install.
  const proposalConfig = backend?.proposal;
  const companyConfig = backend?.company;
  const estimatorConfig = backend?.estimator;

  const sheetNotes = lines(
    proposalConfig?.notesLanguage ?? "",
    SHEET_NOTES.map((note) => note.text)
  );
  const sheetInclusions = lines(proposalConfig?.inclusionsLanguage ?? "", [
    "Scaffold erected and dismantled per Cal-OSHA guidelines",
    "All labor, materials, tools and equipment",
    "Delivery, install and removal",
  ]);
  const sheetExclusions = lines(proposalConfig?.exclusionsLanguage ?? "", SHEET_EXCLUSIONS);
  const sheetQualifications = lines(
    proposalConfig?.qualificationsLanguage ?? "",
    SHEET_QUALIFICATIONS
  );
  const companyName = companyConfig?.companyName || "Set company name in Backend";
  const estimatorName = estimatorConfig?.estimatorName || estimate.estimator;

  const included = approvedAlternates
    .map((id) => alternatePricing[id])
    .filter(Boolean);
  const alternateQualifications = approvedAlternates
    .map((id) => ALTERNATE_QUALIFICATIONS[id])
    .filter(Boolean);
  const baseBid = finalBid - alternateRevenue;
  const thereafter = rentalsRevenue / Math.max(1, rentalMonths);
  const totalPages = 2 + (alternateQualifications.length > 0 ? 1 : 0);

  return (
    <div
      id="korban-proposal"
      className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"
    >
      <div className="grid gap-2.5">
        {/* -- Page 1 --------------------------------------------------- */}
        <SheetPage number={1} total={totalPages} proposalNumber={estimate.proposalNumber} showCorner={false}>
          {/* Masthead — the one inverted band on the page */}
          <div
            className="-mx-9 -mt-7 mb-6 flex items-end justify-between px-9 py-4"
            style={{ background: "#0e0d0b" }}
          >
            <div className="flex items-end gap-2">
              <span
                className="text-[26px] font-semibold uppercase leading-none tracking-[0.16em] text-white"
                style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
              >
                {companyName}
              </span>
              <span className="mb-[3px] h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span className="mb-[2px] font-mono text-[8px] uppercase tracking-[0.24em] text-zinc-500">
                Scaffold proposal
              </span>
            </div>
            <div className="text-right">
              <p className="font-mono text-[12px] font-bold text-orange-400">
              {estimate.proposalNumber || "\u2014"}
            </p>
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-500">
                {estimate.bidDate || "\u2014"}
              </p>
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-[1fr_1fr] gap-7">
            <LiveBlock field="project" activeField={activeField}>
              <p className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-[#8a857d]">Project</p>
              <p
                className="mt-1 text-[19px] font-semibold uppercase leading-none tracking-[0.03em]"
                style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
              >
                {estimate.projectName}
              </p>
              <p className="mt-1 text-[9.5px] text-[#4a4741]">{estimate.projectAddress}</p>
              <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#8a857d]">
                Scaffold scope
              </p>
            </LiveBlock>

            <LiveBlock field="customer" activeField={activeField}>
              <p className="font-mono text-[7.5px] uppercase tracking-[0.2em] text-[#8a857d]">Prepared for</p>
              <p className="mt-1 text-[12px] font-semibold">
                {estimate.customer || <span className="text-[#a5a099]">Customer not set</span>}
              </p>
              <p className="text-[9.5px] text-[#4a4741]">{estimate.contactName}</p>
              <p className="font-mono text-[8.5px] text-[#8a857d]">{estimate.contactPhone}</p>
              <p className="font-mono text-[8.5px] text-[#8a857d]">{estimate.contactEmail}</p>
            </LiveBlock>
          </div>

          <p className="mt-5 text-[9.5px] leading-[1.6] text-[#3a3833]">
            {proposalConfig?.introLanguage ||
              "We propose to furnish on rent, install and remove exterior scaffolding as defined by the scope and qualifications below."}
          </p>

          {/* Scope and pricing */}
          <SheetHeading className="mt-6">Scope of work &amp; pricing</SheetHeading>
          <LiveBlock
            field="pricing"
            activeField={activeField === "finish" ? "pricing" : activeField}
            className="mt-2.5 !border-l-0 !pl-0"
          >
            <div
              className="grid grid-cols-[20px_minmax(0,1.9fr)_96px_78px_92px] gap-4 border-b-2 pb-1.5"
              style={{ borderColor: INK }}
            >
              <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[#8a857d]">
                #
              </span>
              <span className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-[#8a857d]">
                Description
              </span>
              <span className="text-right font-mono text-[7.5px] uppercase tracking-[0.18em] text-[#8a857d]">
                Amount
              </span>
              <span className="text-right font-mono text-[7.5px] uppercase tracking-[0.18em] text-[#8a857d]">
                Duration
              </span>
              <span className="text-right font-mono text-[7.5px] uppercase leading-tight tracking-[0.14em] text-[#8a857d]">
                Per {rentalDays}d thereafter
              </span>
            </div>

            <div
              className="grid grid-cols-[20px_minmax(0,1.9fr)_96px_78px_92px] items-start gap-4 border-b py-3"
              style={{ borderColor: "#d8d4cb" }}
            >
              <span className="font-mono text-[10px] font-bold text-orange-600">01</span>
              <div>
                <p className="text-[11px] font-semibold leading-[1.45]">
                  Furnish, install and remove exterior scaffold for{" "}
                  <span
                    className={`rounded-[2px] px-1 transition-all duration-200 ${
                      activeField === "finish"
                        ? "bg-orange-500/30 text-[#1a1a1a] shadow-[0_0_0_2px_rgba(249,115,22,0.3)]"
                        : "text-orange-600"
                    }`}
                  >
                    {finish.toLowerCase()}
                  </span>{" "}
                  &mdash;{" "}
                  <span className="font-mono text-orange-600">
                    {estimate.totalLinearFeet.toLocaleString()} LF
                  </span>
                </p>
                <p className="mt-1.5 text-[9px] leading-[1.7] text-[#5a564f]">{proposalNotes}</p>
              </div>
              <span className="text-right font-mono text-[13px] font-bold">{formatMoney(baseBid)}</span>
              <span className="text-right font-mono text-[9px] text-[#5a564f]">
                First {rentalDays} days
              </span>
              <span className="text-right font-mono text-[10px]">{formatMoney(thereafter)}</span>
            </div>

            {included.map((alternate, alternateIndex) => (
              <div
                key={alternate.id}
                className={`grid grid-cols-[20px_minmax(0,1.9fr)_96px_78px_92px] items-start gap-4 border-b py-2.5 transition-colors duration-200 ${
                  activeField === `alt-${alternate.id}` ? "bg-orange-500/[0.13]" : ""
                }`}
                style={{ borderColor: "#d8d4cb" }}
              >
                <span className="font-mono text-[10px] font-bold text-orange-600">
                  {String(alternateIndex + 2).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[10.5px] font-semibold leading-[1.4]">
                    <span className="mr-1.5 font-mono text-[7.5px] uppercase tracking-[0.16em] text-orange-600">
                      Alt
                    </span>
                    {alternate.title}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-[1.6] text-[#5a564f]">
                    {alternate.description}
                  </p>
                  <p className="mt-0.5 font-mono text-[8px] text-[#8a857d]">{alternate.basis}</p>
                  {alternate.proposalNote && (
                    <p className="mt-1 border-l-2 border-orange-500/50 pl-2 text-[8.5px] leading-[1.5] text-[#5a564f]">
                      {alternate.proposalNote}
                    </p>
                  )}
                </div>
                <span className="text-right font-mono text-[13px] font-bold">
                  {formatMoney(alternate.value)}
                </span>
                <span className="text-right font-mono text-[9px] text-[#8a857d]">&mdash;</span>
                <span className="text-right font-mono text-[9px] text-[#8a857d]">&mdash;</span>
              </div>
            ))}
          </LiveBlock>

          {/* Total — the second inverted band, and the last */}
          <LiveBlock field="total" activeField={activeField} className="mt-3 !border-l-0 !pl-0">
            <div
              className="flex items-center justify-between border-t-2 px-4 py-3"
              style={{ background: "#e4e1da", borderColor: "#F97316" }}
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#6b665e]">
                Total proposal amount
              </span>
              <span
                className="text-[24px] font-semibold leading-none text-orange-600"
                style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
              >
                {formatMoney(finalBid)}
              </span>
            </div>
          </LiveBlock>

          {/* Notes */}
          <div className="mt-6 flex items-center gap-2.5">
            <span className="h-3 w-[3px] shrink-0 bg-orange-500" />
            <span
              className="bg-orange-500/25 px-1.5 text-[13px] font-semibold uppercase leading-none tracking-[0.16em]"
              style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
            >
              Notes
            </span>
            <span className="h-px flex-1" style={{ background: "#d8d4cb" }} />
          </div>
          <ul className="mt-2 grid gap-1">
            {sheetNotes.map((note) => (
              <Bullet key={note}>{note}</Bullet>
            ))}
          </ul>

          {/* Inclusions and exclusions, side by side */}
          <div className="mt-6 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-7">
            <div>
              <SheetHeading>Included</SheetHeading>
              <ul className="mt-2 grid gap-1">
                {sheetInclusions.map((item) => (
                  <Bullet key={item}>{item}</Bullet>
                ))}
              </ul>
            </div>
            <div>
              <SheetHeading>Excluded — unless noted above</SheetHeading>
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-[3px]">
                {sheetExclusions.map((item) => (
                  <span key={item} className="font-mono text-[8px] leading-[1.5] text-[#5a564f]">
                    <span className="mr-1 text-orange-500">·</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <SheetHeading className="mt-6">Qualifications</SheetHeading>
          <ul className="mt-2 grid grid-cols-2 gap-x-7 gap-y-1">
            {sheetQualifications.map((item) => (
              <Bullet key={item}>{item}</Bullet>
            ))}
          </ul>
        </SheetPage>

        {/* -- Alternate qualifications, only when selected -------------- */}
        {alternateQualifications.length > 0 && (
          <SheetPage number={2} total={totalPages} proposalNumber={estimate.proposalNumber}>
            {alternateQualifications.map((block) => (
              <div key={block.heading}>
                <SheetHeading>{block.heading}</SheetHeading>
                <div className="mt-3 grid gap-2.5">
                  {block.items.map((item) => (
                    <div key={item.term} className="grid grid-cols-[142px_1fr] gap-4">
                      <span className="font-mono text-[8.5px] font-semibold uppercase leading-[1.5] tracking-[0.08em] text-orange-600">
                        {item.term}
                      </span>
                      <span className="text-[9px] leading-[1.55] text-[#3a3833]">{item.body}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </SheetPage>
        )}

        {/* -- Terms and signatures ------------------------------------- */}
        <SheetPage number={totalPages} total={totalPages} proposalNumber={estimate.proposalNumber}>
          <SheetHeading>Terms &amp; conditions</SheetHeading>
          <div className="mt-3 grid gap-3">
            {SHEET_TERMS.map((term, index) => (
              <div key={term.title} className="grid grid-cols-[18px_1fr] gap-3">
                <span
                  className="mt-[1px] text-[11px] font-semibold leading-none text-orange-500/70"
                  style={{ fontFamily: "var(--font-title), ui-sans-serif, system-ui" }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em]">
                    {term.title}
                  </p>
                  {term.body.split("\n\n").map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 24)}
                      className="mt-1 text-[8.5px] leading-[1.5] text-[#3a3833]"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[9px] leading-[1.55] text-[#3a3833]">
            {proposalConfig?.closingLanguage}
          </p>

          <div className="mt-4 grid gap-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#5a564f]">
            {companyConfig?.unionAffiliation && <span>{companyConfig.unionAffiliation}</span>}
            {companyConfig?.licenseBoardLine && <span>{companyConfig.licenseBoardLine}</span>}
            {companyConfig?.licenseNumber && <span>License {companyConfig.licenseNumber}</span>}
          </div>

          <p className="mt-4 text-[9px] italic text-[#5a564f]">
            If this quotation is accepted with all terms and conditions agreed, please sign and
            return.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-10">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-orange-600">
                Contractor
              </p>
              <div className="mt-5 grid gap-3">
                {["Signature", "Title", "Date"].map((label) => (
                  <div key={label} className="grid grid-cols-[52px_1fr] items-end gap-2">
                    <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8a857d]">
                      {label}
                    </span>
                    <span className="h-px" style={{ background: INK }} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-orange-600">
                For the contractor of record
              </p>
              <p className="mt-1.5 text-[13px] font-semibold">{estimatorName}</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8a857d]">
                {estimatorConfig?.estimatorTitle || "Estimator"}
              </p>
              <div className="mt-3 grid gap-3">
                {["Signature", "Date"].map((label) => (
                  <div key={label} className="grid grid-cols-[52px_1fr] items-end gap-2">
                    <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8a857d]">
                      {label}
                    </span>
                    <span className="h-px" style={{ background: INK }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-6 font-mono text-[7.5px] uppercase tracking-[0.2em] text-[#a5a099]">
            {proposalStatus} · quotation valid 30 days · misc {formatMoney(miscRevenue)} · labor{" "}
            {formatMoney(laborRevenue)}
          </p>
        </SheetPage>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Small pieces
// ----------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-900/70 py-1">
      <span className="text-[10px] text-zinc-600">{label}</span>
      <span className="truncate text-right text-[11px] font-semibold text-zinc-300">
        {orBlank(value)}
      </span>
    </div>
  );
}

function FigureRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_96px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1 first:border-t-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-right font-mono text-[11px] font-bold text-zinc-300">
        {formatMoney(value)}
      </span>
    </div>
  );
}

/**
 * Renders a value, or a faint marker when there isn't one. Used anywhere a
 * blank is a real answer - an unnamed customer, an untraced elevation - so
 * the gap reads as a gap instead of as data.
 */
function orBlank(value: string | number | undefined | null, placeholder = "Not set") {
  if (value === null || value === undefined) return <span className="text-zinc-700">{placeholder}</span>;
  if (typeof value === "string" && value.trim() === "")
    return <span className="text-zinc-700">{placeholder}</span>;
  if (typeof value === "number" && value === 0)
    return <span className="text-zinc-700">{placeholder}</span>;
  return <>{value}</>;
}

function formatMoney(value: number) {
  return Math.round(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
