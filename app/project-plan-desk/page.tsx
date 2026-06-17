"use client";

import { useMemo, useState } from "react";

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

const calendarItems = [
  { date: "Jun 14", title: "Bid Due", type: "Deadline" },
  { date: "Jun 18", title: "Client Follow-Up", type: "Follow-Up" },
  { date: "Jul 01", title: "Possible Award", type: "Award" },
  { date: "Jul 08", title: "Projected Mobilization", type: "Mobilization" },
];

const newsItems = [
  "California commercial construction starts rise in Q2",
  "Material pricing stabilizes across access equipment rentals",
  "Bay Area mixed-use projects remain active despite financing pressure",
];

export default function ProjectPlanDeskPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState("Level 2");
  const [activeSection, setActiveSection] = useState("North");

  const selectedOverlay = useMemo(
    () => overlayLevels.find((level) => level.label === activeOverlay) ?? overlayLevels[3],
    [activeOverlay],
  );

  const selectedSection = useMemo(
    () => sectionViews.find((section) => section.elevation === activeSection) ?? sectionViews[0],
    [activeSection],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#070604] text-white">
      <header className="border-b border-orange-500/20 bg-black px-6 py-4">
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
              >
                ▾
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-12 z-[999] w-60 rounded-2xl border border-orange-500/20 bg-black p-2 shadow-2xl">
                  <MenuLink href="/projects" label="Projects" />
                  <MenuLink href="/takeoff-workspace" label="Takeoff Workspace" />
                  <MenuLink href="/estimate-review" label="Estimate Review" />
                  <MenuLink href="/backend" label="Backend" />
                  <MenuLink href="/settings" label="Settings" />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.5em] text-orange-500">KORBAN</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Project Plan Desk</h1>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-600">
                Estimator command center
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            <DeskAction href="/takeoff-workspace" label="Open Takeoff" />
            <DeskAction href="/takeoff-workspace" label="Set Scaffold" />
            <DeskAction href="/takeoff-workspace" label="Section View" />
            <DeskAction href="/estimate-review" label="Estimate Review" primary />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <TopStat label="Project" value={project.projectName} wide />
          <TopStat label="Client" value={project.customer} />
          <TopStat label="Phase" value={project.currentPhase} />
          <TopStat label="Status" value={project.projectStatus} />
          <TopStat label="Bid Due" value={project.bidDueDate} />
          <TopStat label="Last Saved" value={project.lastSaved} />
        </div>
      </header>

      <InventoryTicker />

      <section className="grid gap-4 p-4 xl:grid-cols-12">
        <Tile className="xl:col-span-3" title="Project Information" subtitle="Current bid profile">
          <div className="space-y-2">
            <InfoRow label="Project No." value={project.projectNumber} />
            <InfoRow label="Address" value={project.address} />
            <InfoRow label="GC" value={project.gc} />
            <InfoRow label="Estimator" value={project.estimator} />
            <InfoRow label="Union" value={project.unionStatus} />
          </div>
          <TileButton href="/projects" label="Open Project Record" />
        </Tile>

        <Tile className="xl:col-span-3" title="Customer Database" subtitle="Client profile + history">
          <div className="space-y-2">
            <InfoRow label="Company" value={project.customer} />
            <InfoRow label="Contact" value="Marcus Lee" />
            <InfoRow label="Phone" value="(510) 555-0138" />
            <InfoRow label="Email" value="estimating@turner.com" />
            <InfoRow label="Past Jobs" value="7" />
          </div>
          <TileButton href="/projects" label="Open Customer" />
        </Tile>

        <Tile className="xl:col-span-3" title="Scaffold Workspace" subtitle="Layout + scaffold design">
          <ProgressRow label="Set Scaffold" value={68} />
          <ProgressRow label="Frame Config" value={85} />
          <ProgressRow label="Section Design" value={35} />
          <TileButton href="/takeoff-workspace" label="Continue Scaffold Setup" />
        </Tile>

        <Tile className="xl:col-span-3" title="Estimate Status" subtitle="Quantity engine + review">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="LF" value="1,240" />
            <MiniMetric label="Frames" value="496" />
            <MiniMetric label="Planks" value="620" />
            <MiniMetric label="Bid" value="$196K" />
          </div>
          <TileButton href="/estimate-review" label="Open Estimate Review" />
        </Tile>

        <HeroTile className="xl:col-span-7" title="Combined Overlay Viewer" subtitle="Stored takeoff geometry from all levels">
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
                  onClick={() => setActiveOverlay(level.label)}
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
        </HeroTile>

        <HeroTile className="xl:col-span-5" title="Section View Viewer" subtitle="Elevation and section design workspace">
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
                  LF {selectedSection.lf} · Height {selectedSection.height}
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
                  onClick={() => setActiveSection(section.elevation)}
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
        </HeroTile>

        <Tile className="xl:col-span-4" title="Project Communications" subtitle="Internal notes and messages">
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
        </Tile>

        <Tile className="xl:col-span-3" title="Project Calendar" subtitle="Bid, award, and mobilization dates">
          <div className="space-y-2">
            {calendarItems.map((item) => (
              <div key={`${item.date}-${item.title}`} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-black p-3">
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-center">
                  <p className="font-mono text-xs font-bold text-orange-300">{item.date}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-300">{item.title}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{item.type}</p>
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="xl:col-span-2" title="Market Watch" subtitle="Construction trend">
          <div className="rounded-3xl border border-green-500/20 bg-green-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-green-300/70">Industry Index</p>
            <p className="mt-2 font-mono text-3xl font-black text-green-300">+1.8%</p>
            <p className="mt-2 text-xs text-green-200/50">Commercial starts trending up.</p>
          </div>
        </Tile>

        <Tile className="xl:col-span-3" title="Construction News" subtitle="US + international">
          <div className="space-y-2">
            {newsItems.map((item) => (
              <button key={item} className="w-full rounded-2xl border border-zinc-800 bg-black p-3 text-left text-xs leading-5 text-zinc-400 hover:border-orange-500/30 hover:text-orange-200">
                {item}
              </button>
            ))}
          </div>
        </Tile>

        <Tile className="xl:col-span-4" title="Task Tracker" subtitle="Project action list">
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
        </Tile>

        <Tile className="xl:col-span-4" title="Project Edit Tools" subtitle="Future overlay corrections">
          <div className="grid grid-cols-2 gap-2">
            <MiniTool label="Auto Straighten" />
            <MiniTool label="Break Linework" />
            <MiniTool label="Reconnect Lines" />
            <MiniTool label="Shift Overlay" />
            <MiniTool label="Change Colors" />
            <MiniTool label="Reference Point" />
          </div>
        </Tile>

        <Tile className="xl:col-span-4" title="Drafting / Imports / Exports" subtitle="Files, reports, and integrations">
          <div className="grid grid-cols-2 gap-2">
            <TileButton href="/takeoff-workspace" label="Upload PDF" compact />
            <TileButton href="/estimate-review" label="Send Report" compact />
            <TileButton href="/backend" label="Backend" compact />
            <TileButton href="/settings" label="Settings" compact />
          </div>
        </Tile>
      </section>
    </main>
  );
}

function InventoryTicker() {
  const tickerItems = [...inventoryTickerItems, ...inventoryTickerItems];

  return (
    <section className="border-b border-orange-500/10 bg-black/80 px-4 py-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="shrink-0 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
          Inventory Reel
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="flex w-max animate-[inventory-scroll_45s_linear_infinite] items-center gap-3">
            {tickerItems.map((item, index) => {
              const short = Math.max(0, item.required - item.available);
              const ready = short === 0;

              return (
                <div
                  key={`${item.item}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-zinc-800 bg-[#0b0b0b] px-3 py-1.5 text-[10px]"
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
                </div>
              );
            })}
          </div>
        </div>

        <a
          href="/backend"
          className="shrink-0 rounded-full border border-zinc-800 bg-black px-3 py-1 text-[10px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"
        >
          Inventory Manager
        </a>
      </div>

      <style jsx>{`
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

function Tile({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.75rem] border border-zinc-800 bg-[#0b0b0b] p-4 shadow-2xl ${className}`}>
      <TileHeader title={title} subtitle={subtitle} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HeroTile({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[2rem] border border-orange-500/20 bg-[#0b0b0b] p-4 shadow-2xl ${className}`}>
      <TileHeader title={title} subtitle={subtitle} hero />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TileHeader({ title, subtitle, hero = false }: { title: string; subtitle?: string; hero?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className={`${hero ? "text-sm" : "text-xs"} font-black uppercase tracking-[0.24em] text-orange-400`}>
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
      </div>
      <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.55)]" />
    </div>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block rounded-xl px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-orange-500/10 hover:text-orange-300">
      {label}
    </a>
  );
}

function DeskAction({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
        primary
          ? "bg-orange-500 text-black hover:bg-orange-400"
          : "border border-zinc-800 bg-black text-zinc-300 hover:border-orange-500/40 hover:text-orange-300"
      }`}
    >
      {label}
    </a>
  );
}

function TileButton({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  return (
    <a
      href={href}
      className={`mt-4 block rounded-xl border border-orange-500/30 bg-orange-500/10 text-center font-bold text-orange-300 hover:bg-orange-500/20 ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      {label}
    </a>
  );
}

function SmallTool({ label, href }: { label: string; href?: string }) {
  const className = "rounded-xl border border-zinc-700 bg-black/80 px-3 py-2 text-[10px] font-bold text-zinc-300 backdrop-blur hover:border-orange-500/40 hover:text-orange-300";
  if (href) return <a href={href} className={className}>{label}</a>;
  return <button className={className}>{label}</button>;
}

function MiniTool({ label }: { label: string }) {
  return (
    <button className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300">
      {label}
    </button>
  );
}

function TopStat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-[#0b0b0b] px-4 py-3 ${wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-zinc-200">{value}</p>
    </div>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-lg font-black text-orange-300">{value}</p>
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
