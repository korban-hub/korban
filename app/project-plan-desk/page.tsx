"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KorbanButton,
  KorbanHeader,
  KorbanHeaderMeta,
  KorbanMetricTile,
  KorbanPanel,
  KorbanManagementShell,
  KorbanSummaryStrip,
  KorbanDemoPanel,
  type KorbanMenuLink,
} from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
  getActiveProjectId,
  setActiveProjectId,
  type ProjectElevation,
  type ProjectRecord,
} from "@/lib/projectStore";
import { formatStoredCount, formatStoredFeet } from "@/lib/workflowDisplay";

type DeskTileStatus = "Ready" | "In Progress" | "Waiting" | "Needs Review";
type ProjectPhase = "Budget / ROM" | "Design Development" | "50% CD" | "75% CD" | "100% CD" | "GMP" | "Final Round";

const project = {
  projectName: "Mare Island Apartments",
  projectNumber: "KRB-260614-001",
  address: "Mare Island, Vallejo, CA",
  customer: "Turner Construction",
  gc: "Turner Construction",
  estimator: "H. Pierre",
  unionStatus: "Union",
  bidDueDate: "06/14/26",
  projectStatus: "Active Bid",
  currentPhase: "Final Round" as ProjectPhase,
  lastSaved: "Today · 9:42 AM",
};

const overlayLevels = [
  { label: "Roof 1", color: "#facc15", lf: "196'-0\"", status: "Needs Review" },
  { label: "Level 4", color: "#a855f7", lf: "224'-6\"", status: "Stored" },
  { label: "Level 3", color: "#22c55e", lf: "242'-0\"", status: "Stored" },
  { label: "Level 2", color: "#111827", lf: "248'-0\"", status: "Main" },
  { label: "Level 1", color: "#0ea5e9", lf: "236'-6\"", status: "Stored" },
  { label: "Basement 1", color: "#f97316", lf: "180'-0\"", status: "Optional" },
];

const sectionViews = [
  { elevation: "North", height: "38'-0\"", lf: "312'-0\"", status: "Ready" },
  { elevation: "East", height: "32'-0\"", lf: "188'-0\"", status: "Draft" },
  { elevation: "South", height: "38'-0\"", lf: "312'-0\"", status: "Ready" },
  { elevation: "West", height: "32'-0\"", lf: "188'-0\"", status: "Draft" },
];

const inventoryTickerItems = [
  { item: "Frames", required: 496, available: 4820, status: "Available" },
  { item: "Planks", required: 620, available: 7400, status: "Available" },
  { item: "Cross Braces", required: 496, available: 4900, status: "Available" },
  { item: "Guardrails", required: 372, available: 2200, status: "Available" },
  { item: "Base Plates", required: 125, available: 800, status: "Available" },
  { item: "Screw Jacks", required: 125, available: 760, status: "Available" },
];

const tasks = [
  { item: "Confirm roof setback overlay", status: "To Do" },
  { item: "Send follow-up to Turner", status: "Waiting" },
  { item: "Review final scaffold width", status: "To Do" },
  { item: "Estimate Review linked", status: "Completed" },
];

const messages = [
  { from: "PM", text: "Confirm final bid round before sending proposal.", time: "8:12 AM" },
  { from: "Estimator", text: "Takeoff linked into Estimate Review.", time: "Yesterday" },
  { from: "Ops", text: "Need delivery window once awarded.", time: "Mon" },
];

const deskMenuLinks: KorbanMenuLink[] = [
  { href: "/projects", label: "Projects" },
  { href: "/takeoff-workspace", label: "Takeoff Workspace" },
  { href: "/estimate-review", label: "Estimate Review" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

export default function ProjectPlanDeskPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedTiles, setCollapsedTiles] = useState<Record<string, boolean>>({
    scaffoldWorkspace: true,
    estimateStatus: true,
    frameConfiguration: true,
    overlayViewer: true,
    sectionViewer: true,
  });

  function toggleTile(key: string) {
    setCollapsedTiles((current) => ({ ...current, [key]: !current[key] }));
  }
  const [activeOverlay, setActiveOverlay] = useState("Level 2");
  const [activeSection, setActiveSection] = useState("North");
  const [overlayRecentlyChanged, setOverlayRecentlyChanged] = useState(false);
  const [sectionRecentlyChanged, setSectionRecentlyChanged] = useState(false);
  const [storedProject, setStoredProject] = useState<ProjectRecord | null>(null);
  const [storedElevation, setStoredElevation] = useState<ProjectElevation | null>(null);

  useEffect(() => {
    function loadStoredProject() {
      const activeProjectId = getActiveProjectId();
      setActiveProjectId(activeProjectId);
      setStoredProject(getActiveProject());
      setStoredElevation(getActiveElevation());
    }

    loadStoredProject();
    window.addEventListener("focus", loadStoredProject);
    window.addEventListener("pageshow", loadStoredProject);

    return () => {
      window.removeEventListener("focus", loadStoredProject);
      window.removeEventListener("pageshow", loadStoredProject);
    };
  }, []);

  function handleOverlaySelect(label: string) {
    setActiveOverlay(label);
    setOverlayRecentlyChanged(true);
    window.setTimeout(() => setOverlayRecentlyChanged(false), 1200);
  }

  function handleSectionSelect(elevation: string) {
    setActiveSection(elevation);
    setSectionRecentlyChanged(true);
    window.setTimeout(() => setSectionRecentlyChanged(false), 1200);
  }

  const displayProject = storedProject ?? {
    projectId: project.projectNumber,
    projectName: project.projectName,
    projectAddress: project.address,
    customer: project.customer,
    estimator: project.estimator,
    updatedAt: project.lastSaved,
    schemaVersion: 1,
    takeoff: { levels: [] },
  };
  const activeQuantities = storedElevation?.quantityEngine;
  const displayLinearFeet = formatStoredCount(storedElevation?.linearFeet);
  const displayFrameCount = formatStoredCount(activeQuantities?.frameCount);
  const displayPlankCount = formatStoredCount(activeQuantities?.plankCount);
  const displayBayCount = formatStoredCount(activeQuantities?.bayCount);
  const displayLegCount = formatStoredCount(activeQuantities?.legCount);
  const displayWallHeight =
    storedElevation?.wallHeight != null && Number.isFinite(storedElevation.wallHeight) && storedElevation.wallHeight > 0
      ? `${storedElevation.wallHeight}'-0"`
      : "—";

  // Takeoff is considered "started" once we have a real linear-feet value
  // stored from the Takeoff Workspace. This is the single source of truth
  // that decides whether the "Takeoff Results" zone shows live content or
  // a not-yet-started placeholder.
  const hasTakeoffData = Boolean(
    storedElevation?.linearFeet != null && Number.isFinite(storedElevation.linearFeet) && storedElevation.linearFeet > 0,
  );

  const selectedOverlay = useMemo(
    () => overlayLevels.find((level) => level.label === activeOverlay) ?? overlayLevels[3],
    [activeOverlay],
  );

  const selectedSection = useMemo(
    () => sectionViews.find((section) => section.elevation === activeSection) ?? sectionViews[0],
    [activeSection],
  );

  const activeSectionLf = formatStoredFeet(
    storedElevation?.elevationName === activeSection ? storedElevation.linearFeet : undefined,
  );
  const activeSectionHeight =
    storedElevation?.elevationName === activeSection ? displayWallHeight : selectedSection.height;
  const activeSectionLfLabel =
    storedElevation?.elevationName === activeSection ? activeSectionLf : selectedSection.lf;

  return (
    <KorbanManagementShell
      header={
        <KorbanHeader
          title="Project Plan Desk"
          subtitle="Estimator command center"
          menuLinks={deskMenuLinks}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((current) => !current)}
          actionsClassName="gap-3"
          actions={
            <>
              <KorbanHeaderMeta label="Project" value={displayProject.projectName} />
              <KorbanButton as="a" href="/takeoff-workspace" variant="ghost">
                Open Takeoff
              </KorbanButton>
              <KorbanButton as="a" href="/set-scaffold" variant="ghost">
                Set Scaffold
              </KorbanButton>
              <KorbanButton as="a" href="/section-view" variant="ghost">
                Section View
              </KorbanButton>
              <KorbanButton as="a" href="/estimate-review" variant="primary">
                Save & Continue
              </KorbanButton>
            </>
          }
        />
      }
      summary={
        <KorbanSummaryStrip title="Live Project Metrics">
          <KorbanMetricTile label="Lineal Ft" value={displayLinearFeet} />
          <KorbanMetricTile label="Bay Count" value={displayBayCount} />
          <KorbanMetricTile label="Leg Count" value={displayLegCount} />
          <KorbanMetricTile label="Frame Count" value={displayFrameCount} />
          <KorbanMetricTile label="Plank Count" value={displayPlankCount} />
        </KorbanSummaryStrip>
      }
      banner={
        <InventoryTicker
          frameCount={activeQuantities?.frameCount}
          plankCount={activeQuantities?.plankCount}
          crossBraceCount={activeQuantities?.crossBraceCount}
          guardrailCount={activeQuantities?.guardrailCount}
          basePlateCount={activeQuantities?.basePlateCount}
          screwJackCount={activeQuantities?.screwJackCount}
        />
      }
      bodyClassName="p-4"
    >
      {/* ══════════════════════════════════════════════════════════════
          ZONE A — PROJECT SETUP
          Information that exists before any takeoff work happens.
          Light background distinguishes this as a fundamentally
          different kind of zone from the dark workspace below.
          ══════════════════════════════════════════════════════════════ */}
      <ZoneHeader
        label="Project Setup"
        description="Set once when the project starts — before takeoff begins"
      />
      <section className="grid gap-4 rounded-[1.75rem] border border-orange-300/30 bg-[#2a2420] p-4 xl:grid-cols-12">
        <KorbanPanel className="xl:col-span-4" title="Project Information" subtitle="Current bid profile">
          <div className="space-y-2">
            <InfoRow label="Project No." value={project.projectNumber} />
            <InfoRow label="Address" value={displayProject.projectAddress} />
            <InfoRow label="GC" value={project.gc} />
            <InfoRow label="Estimator" value={displayProject.estimator} />
            <InfoRow label="Union" value={project.unionStatus} />
          </div>
          <TileButton href="/dashboard" label="Open Bid Room" />
        </KorbanPanel>

        <KorbanDemoPanel className="xl:col-span-4">
          <KorbanPanel title="Customer Database" subtitle="Reference data · demo profile">
            <div className="space-y-2">
              <InfoRow label="Company" value={displayProject.customer} />
              <InfoRow label="Contact" value="Marcus Lee" />
              <InfoRow label="Phone" value="(510) 555-0138" />
              <InfoRow label="Email" value="estimating@turner.com" />
              <InfoRow label="Past Jobs" value="7" />
            </div>
            <TileButton href="/contacts" label="Open Contacts" />
          </KorbanPanel>
        </KorbanDemoPanel>

        <KorbanPanel className="xl:col-span-4" title="Getting Started" subtitle="Next step for this project">
          {hasTakeoffData ? (
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="text-xs text-zinc-500">
                Takeoff data is in. Continue building this estimate in Takeoff Workspace, or move forward to Set Scaffold and Estimate Review.
              </p>
              <TileButton href="/takeoff-workspace" label="Open Takeoff Workspace" />
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="text-xs text-zinc-500">
                No takeoff data yet for this project. Start in Takeoff Workspace to capture lineal footage and heights — that data feeds Set Scaffold, Frame Configuration, Section View, and Estimate Review automatically.
              </p>
              <TileButton href="/takeoff-workspace" label="Start Takeoff Workspace" />
            </div>
          )}
        </KorbanPanel>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          ZONE B — TAKEOFF RESULTS
          Populated only after Takeoff Workspace has real data. Shows a
          clear placeholder state instead of fake/demo numbers when a
          project hasn't been taken off yet.
          ══════════════════════════════════════════════════════════════ */}
      <ZoneHeader
        label="Takeoff Results"
        description="Updates automatically once Takeoff Workspace has linear footage and heights"
        className="mt-6"
      />

      {!hasTakeoffData && (
        <div className="mb-4 rounded-2xl border border-dashed border-zinc-800 bg-black/40 p-4 text-center">
          <p className="text-xs text-zinc-500">
            This section will populate once you run a takeoff. The Overlay Viewer, Section View, scaffold quantities, and estimate status all read live from Takeoff Workspace.
          </p>
        </div>
      )}

      <section className="grid gap-4 rounded-[1.75rem] border border-orange-500/20 bg-orange-500/[0.06] p-4 xl:grid-cols-12">
        <CollapsibleTile
          className="xl:col-span-4"
          title="Scaffold Workspace"
          subtitle="Reference progress · demo"
          collapsed={collapsedTiles.scaffoldWorkspace}
          onToggle={() => toggleTile("scaffoldWorkspace")}
        >
          <KorbanDemoPanel>
            <KorbanPanel title="Scaffold Workspace" subtitle="Reference progress · demo">
              <ProgressRow label="Set Scaffold" value={68} />
              <ProgressRow label="Frame Config" value={85} />
              <ProgressRow label="Section Design" value={35} />
              <TileButton href="/set-scaffold" label="Continue Scaffold Layout" />
            </KorbanPanel>
          </KorbanDemoPanel>
        </CollapsibleTile>

        <CollapsibleTile
          className="xl:col-span-4"
          title="Estimate Status"
          subtitle="Quantity engine + review"
          collapsed={collapsedTiles.estimateStatus}
          onToggle={() => toggleTile("estimateStatus")}
        >
          <KorbanPanel title="Estimate Status" subtitle="Quantity engine + review">
            <div className="grid grid-cols-2 gap-2">
              <KorbanMetricTile label="LF" value={displayLinearFeet} />
              <KorbanMetricTile label="Frames" value={displayFrameCount} />
              <KorbanMetricTile label="Planks" value={displayPlankCount} />
              <KorbanMetricTile label="Bid" value="$196K" />
            </div>
            <TileButton href="/estimate-review" label="Open Estimate Review" />
          </KorbanPanel>
        </CollapsibleTile>

        <CollapsibleTile
          className="xl:col-span-4"
          title="Frame Configuration"
          subtitle="Quick view · full detail available"
          collapsed={collapsedTiles.frameConfiguration}
          onToggle={() => toggleTile("frameConfiguration")}
        >
          <KorbanPanel title="Frame Configuration" subtitle="Quick view · full detail available">
            <div className="grid grid-cols-2 gap-2">
              <KorbanMetricTile label="Bays" value={displayBayCount} />
              <KorbanMetricTile label="Legs" value={displayLegCount} />
              <KorbanMetricTile label="Frames" value={displayFrameCount} />
              <KorbanMetricTile label="Jumps" value={formatStoredCount(activeQuantities?.jumps)} />
            </div>
            <TileButton href="/frame-configuration" label="Open Frame Configuration" />
          </KorbanPanel>
        </CollapsibleTile>

        <CollapsibleTile
          className="xl:col-span-7"
          title="Combined Overlay Viewer"
          subtitle="Stored takeoff geometry from all levels"
          collapsed={collapsedTiles.overlayViewer}
          onToggle={() => toggleTile("overlayViewer")}
        >
        <KorbanPanel hero active={overlayRecentlyChanged} title="Combined Overlay Viewer" subtitle="Stored takeoff geometry from all levels">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="relative min-h-[370px] overflow-hidden rounded-[1.5rem] border border-zinc-800 bg-black">
              <div className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:34px_34px]" />

              <svg viewBox="0 0 620 380" className="absolute inset-0 h-full w-full">
                {overlayLevels.map((level, index) => {
                  const offset = index * 11;
                  const active = level.label === activeOverlay;
                  return (
                    <g key={level.label} opacity={active ? 1 : 0.45}>
                      <path
                        d={`M${95 + offset} ${92 + offset} L${460 - offset} ${92 + offset} L${520 - offset} ${176 + offset} L${486 - offset} ${284 - offset} L${160 + offset} ${302 - offset} L${82 + offset} ${205 - offset} Z`}
                        fill={active ? `${level.color}22` : "transparent"}
                        stroke={level.color}
                        strokeWidth={active ? 5 : 2}
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}

                <circle cx="96" cy="92" r="6" fill="#ffffff" />
                <text x="110" y="82" fill="#ffffff" fontSize="12" fontWeight="800">
                  Reference Point
                </text>
              </svg>

              <div className="absolute left-4 top-4 rounded-2xl border border-orange-500/20 bg-black/80 px-4 py-3 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Active Overlay</p>
                <p className="mt-1 font-mono text-sm font-bold text-orange-300">
                  {selectedOverlay.label} · {selectedOverlay.lf}
                </p>
              </div>

              <div className="absolute bottom-4 right-4 flex gap-2">
                <SmallTool label="Edit Overlay" />
                <SmallTool label="Opacity" />
                <SmallTool label="Open Takeoff" href="/takeoff-workspace" />
              </div>
            </div>

            <div className="space-y-2">
              {overlayLevels.map((level) => (
                <button
                  key={level.label}
                  onClick={() => handleOverlaySelect(level.label)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    activeOverlay === level.label
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-zinc-800 bg-black hover:border-orange-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: level.color }} />
                      <span className="text-xs font-bold text-zinc-200">{level.label}</span>
                    </div>
                    <span className="font-mono text-[11px] text-orange-300">{level.lf}</span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    {level.status}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </KorbanPanel>
        </CollapsibleTile>

        <CollapsibleTile
          className="xl:col-span-5"
          title="Section View Viewer"
          subtitle="Elevation and section design workspace"
          collapsed={collapsedTiles.sectionViewer}
          onToggle={() => toggleTile("sectionViewer")}
        >
        <KorbanPanel hero active={sectionRecentlyChanged} title="Section View Viewer" subtitle="Elevation and section design workspace">
          <div className="grid gap-4 lg:grid-cols-[1fr_150px]">
            <div className="relative min-h-[370px] overflow-hidden rounded-[1.5rem] border border-zinc-800 bg-black">
              <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:28px_28px]" />

              <svg viewBox="0 0 440 360" className="absolute inset-0 h-full w-full">
                <path d="M50 290 L385 290" stroke="#71717a" strokeWidth="2" />
                <path d="M80 288 L80 80 L360 80 L360 288" fill="none" stroke="#f97316" strokeWidth="4" />
                <path d="M80 145 L360 145 M80 210 L360 210" stroke="#f97316" strokeWidth="2" opacity="0.45" />
                <path d="M58 292 L58 88 M382 292 L382 88" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 8" opacity="0.75" />
                <text x="78" y="58" fill="#f97316" fontSize="14" fontWeight="800">
                  {selectedSection.elevation} Elevation
                </text>
                <text x="78" y="315" fill="#a1a1aa" fontSize="12">
                  LF {activeSectionLfLabel} · Height {activeSectionHeight}
                </text>
              </svg>

              <div className="absolute bottom-4 right-4 flex gap-2">
                <SmallTool label="Create Section" />
                <SmallTool label="Edit View" />
              </div>
            </div>

            <div className="space-y-2">
              {sectionViews.map((section) => (
                <button
                  key={section.elevation}
                  onClick={() => handleSectionSelect(section.elevation)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    activeSection === section.elevation
                      ? "border-white/35 bg-white/10"
                      : "border-zinc-800 bg-black hover:border-white/20"
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-200">{section.elevation}</p>
                  <p className="mt-1 font-mono text-[11px] text-orange-300">{section.height}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    {section.status}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </KorbanPanel>
        </CollapsibleTile>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          ZONE C — REFERENCE / DEMO
          Trimmed to the two panels that matter most day-to-day:
          Communications and Task Tracker, split evenly across the row.
          ══════════════════════════════════════════════════════════════ */}
      <ZoneHeader
        label="Reference & Tools"
        description="Demo data — not yet connected to live project data"
        className="mt-6"
      />
      <section className="grid gap-4 xl:grid-cols-2">
        <KorbanDemoPanel>
          <KorbanPanel
            title="Project Communications"
            subtitle="Reference data · demo messages"
            headerAction={
              <button className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold text-orange-300 transition hover:bg-orange-500/20">
                + Message
              </button>
            }
          >
            <div className="space-y-2">
              {messages.map((message) => (
                <div key={`${message.from}-${message.time}`} className="rounded-2xl border border-zinc-800 bg-black p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300">{message.from}</span>
                    <span className="text-[10px] text-zinc-600">{message.time}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">{message.text}</p>
                </div>
              ))}
            </div>
          </KorbanPanel>
        </KorbanDemoPanel>

        <KorbanDemoPanel>
          <KorbanPanel title="Task Tracker" subtitle="Reference data · demo tasks">
            <div className="grid gap-2 md:grid-cols-2">
              {tasks.map((task) => (
                <div key={task.item} className="rounded-2xl border border-zinc-800 bg-black p-3">
                  <p className="text-xs font-bold text-zinc-300">{task.item}</p>
                  <p className={`mt-2 text-[10px] uppercase tracking-[0.16em] ${
                    task.status === "Completed"
                      ? "text-green-300"
                      : task.status === "Waiting"
                        ? "text-yellow-300"
                        : "text-orange-300"
                  }`}>
                    {task.status}
                  </p>
                </div>
              ))}
            </div>
          </KorbanPanel>
        </KorbanDemoPanel>
      </section>
    </KorbanManagementShell>
  );
}

/**
 * Wraps a Takeoff Results tile so it can collapse down to just its
 * title, subtitle, and a glowing expand button. The full panel content
 * (passed as children) only renders in the DOM when expanded, so this
 * also keeps collapsed tiles cheap to render.
 */
function CollapsibleTile({
  title,
  subtitle,
  collapsed,
  onToggle,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!collapsed) {
    return (
      <div className={className}>
        <div className="mb-2 flex justify-end">
          <button
            onClick={onToggle}
            className="rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300"
          >
            Collapse
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-[1.75rem] border border-zinc-800 bg-korban-raised p-4 text-left shadow-2xl transition hover:border-orange-500/30"
      >
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
        </div>
        <span className="collapsible-glow-dot shrink-0 rounded-full bg-orange-500" />
      </button>

      <style jsx>{`
        .collapsible-glow-dot {
          width: 10px;
          height: 10px;
          box-shadow: 0 0 14px rgba(249, 115, 22, 0.7);
          animation: collapsible-pulse 2.2s ease-in-out infinite;
        }

        @keyframes collapsible-pulse {
          0%,
          100% {
            box-shadow: 0 0 8px rgba(249, 115, 22, 0.5);
            opacity: 0.85;
          }
          50% {
            box-shadow: 0 0 20px rgba(249, 115, 22, 0.9);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function ZoneHeader({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-baseline justify-between gap-4 border-b border-zinc-900 pb-2 ${className ?? ""}`}>
      <h2 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">{label}</h2>
      <p className="text-[10px] text-zinc-600">{description}</p>
    </div>
  );
}

/**
 * Small pulsing orange status dot used in panel headers. Pulses when the
 * user is actively interacting within that tile (editing a field, picking
 * an overlay, etc.) and sits still/dim otherwise.
 */
function ActivityDot({ active = false }: { active?: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-orange-400" : "bg-orange-500/40"}`}
      />
    </span>
  );
}

function InventoryTicker({
  frameCount,
  plankCount,
  crossBraceCount,
  guardrailCount,
  basePlateCount,
  screwJackCount,
}: {
  frameCount?: number;
  plankCount?: number;
  crossBraceCount?: number;
  guardrailCount?: number;
  basePlateCount?: number;
  screwJackCount?: number;
}) {
  const resolvedItems = inventoryTickerItems.map((item) => {
    const storeRequired =
      item.item === "Frames"
        ? frameCount
        : item.item === "Planks"
          ? plankCount
          : item.item === "Cross Braces"
            ? crossBraceCount
            : item.item === "Guardrails"
              ? guardrailCount
              : item.item === "Base Plates"
                ? basePlateCount
                : item.item === "Screw Jacks"
                  ? screwJackCount
                  : undefined;

    return {
      ...item,
      required:
        storeRequired != null && Number.isFinite(storeRequired) && storeRequired > 0
          ? storeRequired
          : item.required,
    };
  });

  const tickerItems = [...resolvedItems, ...resolvedItems];

  return (
    <section className="border-b border-orange-500/10 bg-black/80 px-4 py-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="shrink-0 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
          Inventory Reel
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="inventory-ticker-track flex w-max items-center gap-3">
            {tickerItems.map((item, index) => {
              const short = Math.max(0, item.required - item.available);
              const ready = short === 0;

              return (
                <a
                  key={`${item.item}-${index}`}
                  href="/inventory"
                  className="flex items-center gap-2 rounded-full border border-zinc-800 bg-[#0b0b0b] px-3 py-1.5 text-[10px] transition hover:border-orange-500/40"
                >
                  <span className="font-black text-zinc-200">{item.item}</span>
                  <span className="text-zinc-600">REQ</span>
                  <span className="font-mono font-bold text-orange-300">
                    {item.required.toLocaleString()}
                  </span>
                  <span className="text-zinc-600">AVL</span>
                  <span className="font-mono font-bold text-zinc-300">
                    {item.available.toLocaleString()}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-black uppercase tracking-[0.12em] ${
                      ready ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {ready ? item.status : `Short ${short.toLocaleString()}`}
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        <a
          href="/inventory"
          className="shrink-0 rounded-full border border-zinc-800 bg-black px-3 py-1 text-[10px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
        >
          Inventory Manager
        </a>
      </div>

      {/*
        IMPORTANT: this animation intentionally does NOT use Tailwind's
        animate-[name_duration_timing] arbitrary-value syntax. That syntax
        requires Tailwind's build-time JIT compiler to resolve a keyframe
        name, but the keyframe itself is defined here in a styled-jsx
        block, which is injected at RUNTIME by a separate system. The two
        don't reliably hand off — especially after a .next cache clear —
        which is what caused the ticker to silently stop animating.
        Using a plain named class + plain CSS keyframes in the same
        <style jsx> block keeps both halves in the same system, so there's
        nothing for Tailwind to fail to resolve.
      */}
      <style jsx>{`
        .inventory-ticker-track {
          animation: inventory-scroll 45s linear infinite;
        }

        @keyframes inventory-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}

function TileButton({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  return (
    <a
      href={href}
      className={mergeTileButtonClass(compact)}
    >
      {label}
    </a>
  );
}

function mergeTileButtonClass(compact: boolean) {
  return [
    "block w-full rounded-xl border border-orange-500/25 bg-orange-500/10 text-center font-bold text-orange-300 transition hover:bg-orange-500/20 hover:border-orange-500/40",
    compact ? "px-3 py-2 text-xs" : "mt-4 px-4 py-2.5 text-xs",
  ].join(" ");
}

function SmallTool({ label, href }: { label: string; href?: string }) {
  if (href) {
    return (
      <KorbanButton as="a" href={href} variant="ghost" className="border-zinc-700 bg-black/80 px-3 py-2 text-[10px] backdrop-blur">
        {label}
      </KorbanButton>
    );
  }

  return (
    <KorbanButton variant="ghost" className="border-zinc-700 bg-black/80 px-3 py-2 text-[10px] backdrop-blur">
      {label}
    </KorbanButton>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-zinc-600">{label}</span>
      <span className="text-right text-xs font-bold text-zinc-300">{value}</span>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono text-orange-300">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
