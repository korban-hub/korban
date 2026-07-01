"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type DeskTileStatus = "Ready" | "In Progress" | "Waiting" | "Needs Review";
type ProjectPhase = "Budget / ROM" | "Design Development" | "50% CD" | "75% CD" | "100% CD" | "GMP" | "Final Round";

// ── Static data ───────────────────────────────────────────────────────────────

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

// ── 3D Scaffold Viewport — pure canvas isometric, no dependencies ─────────────

function ScaffoldModel3D({ elevation }: { elevation: ProjectElevation }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIdRef = useRef<number>(0);
  const rotYRef = useRef(0.5);
  const rotXRef = useRef(0.35);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const autoRotateRef = useRef(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRef = useRef(1.0);
  const [zoomDisplay, setZoomDisplay] = useState(100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Build geometry from elevation data ──────────────────────────────────
    const rawPoints = elevation?.overlayGeometry?.fullOverlayRows?.[0]?.points ?? [];
    const scale = elevation?.scale?.pageUnitsPerFoot ?? 18;
    const wallH = elevation?.wallHeight ?? 38;
    const scaffoldW = elevation?.scaffoldInput?.scaffoldWidth ?? 3;
    const frameTall = elevation?.quantityEngine?.frameTall ?? 6;

    let pts2D: { x: number; z: number }[] = [];
    if (rawPoints.length >= 3) {
      const xs = rawPoints.map((p: any) => p.x / scale);
      const zs = rawPoints.map((p: any) => p.y / scale);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      pts2D = rawPoints.map((p: any) => ({ x: p.x / scale - cx, z: p.y / scale - cz }));
    } else {
      pts2D = [
        { x: -50, z: -30 }, { x: 20, z: -30 }, { x: 20, z: -5 },
        { x: 50, z: -5 },   { x: 50, z: 30 },  { x: -50, z: 30 },
      ];
    }

    // ── 3D projection ────────────────────────────────────────────────────────
    function project(x: number, y: number, z: number, rotY: number, rotX: number) {
      // Rotate around Y axis
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const rx = x * cosY + z * sinY;
      const rz = -x * sinY + z * cosY;
      // Rotate around X axis
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const ry = y * cosX - rz * sinX;
      const rz2 = y * sinX + rz * cosX;
      // Perspective projection
      const fov = 320 * zoomRef.current;
      const dist = 180 + rz2;
      const screenX = (rx * fov) / dist;
      const screenY = (ry * fov) / dist;
      return { sx: screenX, sy: screenY, depth: rz2 };
    }

    function draw() {
      const W = canvas!.width;
      const H = canvas!.height;
      const cx = W / 2;
      const cy = H / 2 + 20;
      const rotY = rotYRef.current;
      const rotX = rotXRef.current;

      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = "#050505";
      ctx!.fillRect(0, 0, W, H);

      // ── Collect faces for painter's algorithm ────────────────────────────
      type Face = { pts: { sx: number; sy: number }[]; depth: number; fill: string; stroke: string; alpha: number };
      const faces: Face[] = [];

      const n = pts2D.length;
      const scaffoldOff = scaffoldW + 1;

      // For each wall segment — building face + scaffold
      for (let i = 0; i < n; i++) {
        const a = pts2D[i];
        const b = pts2D[(i + 1) % n];
        const dx = b.x - a.x, dz = b.z - a.z;
        const segLen = Math.sqrt(dx * dx + dz * dz);
        if (segLen < 4) continue;

        // Outward normal
        const nx = dz / segLen, nz = -dx / segLen;
        const ox = nx * scaffoldOff, oz = nz * scaffoldOff;

        // Building wall face
        const bfPts = [
          project(a.x, 0,     a.z, rotY, rotX),
          project(b.x, 0,     b.z, rotY, rotX),
          project(b.x, wallH, b.z, rotY, rotX),
          project(a.x, wallH, a.z, rotY, rotX),
        ];
        const avgDepth = bfPts.reduce((s, p) => s + p.depth, 0) / 4;
        // Back-face culling: only draw if facing camera
        const v1x = bfPts[1].sx - bfPts[0].sx, v1y = bfPts[1].sy - bfPts[0].sy;
        const v2x = bfPts[3].sx - bfPts[0].sx, v2y = bfPts[3].sy - bfPts[0].sy;
        const cross = v1x * v2y - v1y * v2x;
        if (cross < 0) {
          faces.push({
            pts: bfPts.map(p => ({ sx: cx + p.sx, sy: cy - p.sy })),
            depth: avgDepth,
            fill: "#1e1e2e",
            stroke: "#3a3a5a",
            alpha: 0.9,
          });
        }

        // Scaffold plank faces (one per level)
        for (let lv = 1; lv <= frameTall; lv++) {
          const lvY = (lv / frameTall) * wallH;
          const plankD = scaffoldW * 0.8;
          const sfPts = [
            project(a.x + ox - nx * plankD / 2, lvY - 0.4, a.z + oz - nz * plankD / 2, rotY, rotX),
            project(b.x + ox - nx * plankD / 2, lvY - 0.4, b.z + oz - nz * plankD / 2, rotY, rotX),
            project(b.x + ox + nx * plankD / 2, lvY - 0.4, b.z + oz + nz * plankD / 2, rotY, rotX),
            project(a.x + ox + nx * plankD / 2, lvY - 0.4, a.z + oz + nz * plankD / 2, rotY, rotX),
          ];
          faces.push({
            pts: sfPts.map(p => ({ sx: cx + p.sx, sy: cy - p.sy })),
            depth: sfPts.reduce((s, p) => s + p.depth, 0) / 4 - 1,
            fill: "#f9731640",
            stroke: "#f97316",
            alpha: 0.7,
          });
        }

        // Scaffold vertical legs
        const baySpacing = 10;
        let d = scaffoldW + 1;
        while (d < segLen - scaffoldW - 1) {
          const lx = a.x + (dx / segLen) * d + ox;
          const lz = a.z + (dz / segLen) * d + oz;
          const top = project(lx, wallH + 3.5, lz, rotY, rotX);
          const bot = project(lx, 0, lz, rotY, rotX);
          if (cross < 0) {
            faces.push({
              pts: [
                { sx: cx + bot.sx - 1, sy: cy - bot.sy },
                { sx: cx + bot.sx + 1, sy: cy - bot.sy },
                { sx: cx + top.sx + 1, sy: cy - top.sy },
                { sx: cx + top.sx - 1, sy: cy - top.sy },
              ],
              depth: (top.depth + bot.depth) / 2 - 0.5,
              fill: "#f97316",
              stroke: "#f97316",
              alpha: 0.9,
            });
          }
          d += baySpacing;
        }

        // Guardrail
        if (cross < 0) {
          const ra = project(a.x + ox, wallH + 3.5, a.z + oz, rotY, rotX);
          const rb = project(b.x + ox, wallH + 3.5, b.z + oz, rotY, rotX);
          ctx!.save();
          ctx!.strokeStyle = "#f97316";
          ctx!.lineWidth = 1.5;
          ctx!.globalAlpha = 0.8;
          ctx!.beginPath();
          ctx!.moveTo(cx + ra.sx, cy - ra.sy);
          ctx!.lineTo(cx + rb.sx, cy - rb.sy);
          ctx!.stroke();
          ctx!.restore();
        }
      }

      // Roof face (top of building)
      const roofPts = pts2D.map(p => project(p.x, wallH, p.z, rotY, rotX));
      const roofDepth = roofPts.reduce((s, p) => s + p.depth, 0) / roofPts.length;
      faces.push({
        pts: roofPts.map(p => ({ sx: cx + p.sx, sy: cy - p.sy })),
        depth: roofDepth + 10,
        fill: "#16162a",
        stroke: "#2a2a4a",
        alpha: 0.95,
      });

      // Sort back-to-front
      faces.sort((a, b) => a.depth - b.depth);

      // Draw faces
      for (const face of faces) {
        if (face.pts.length < 2) continue;
        ctx!.save();
        ctx!.globalAlpha = face.alpha;
        ctx!.beginPath();
        ctx!.moveTo(face.pts[0].sx, face.pts[0].sy);
        for (let k = 1; k < face.pts.length; k++) ctx!.lineTo(face.pts[k].sx, face.pts[k].sy);
        ctx!.closePath();
        ctx!.fillStyle = face.fill;
        ctx!.fill();
        ctx!.strokeStyle = face.stroke;
        ctx!.lineWidth = face.stroke === "#f97316" ? 1.5 : 0.7;
        ctx!.stroke();
        ctx!.restore();
      }

      // Ground shadow / glow
      const groundPts = pts2D.map(p => project(p.x, -1, p.z, rotY, rotX));
      ctx!.save();
      ctx!.globalAlpha = 0.18;
      ctx!.shadowColor = "#f97316";
      ctx!.shadowBlur = 20;
      ctx!.fillStyle = "#f97316";
      ctx!.beginPath();
      ctx!.moveTo(cx + groundPts[0].sx, cy - groundPts[0].sy);
      for (let k = 1; k < groundPts.length; k++) ctx!.lineTo(cx + groundPts[k].sx, cy - groundPts[k].sy);
      ctx!.closePath();
      ctx!.fill();
      ctx!.restore();

      // Label
      ctx!.save();
      ctx!.font = "bold 11px monospace";
      ctx!.fillStyle = "#f9731688";
      ctx!.fillText(`${elevation?.quantityEngine?.bayCount ?? "—"} BAYS  ·  ${Math.round(wallH)}FT`, 12, H - 12);
      ctx!.restore();
    }

    // ── Animation loop ──────────────────────────────────────────────────────
    function animate() {
      frameIdRef.current = requestAnimationFrame(animate);
      if (autoRotateRef.current) rotYRef.current += 0.005;
      draw();
    }
    frameIdRef.current = requestAnimationFrame(animate);

    // ── Resize handler ──────────────────────────────────────────────────────
    function onResize() {
      if (!canvas) return;
      canvas.width  = canvas.parentElement?.clientWidth  ?? 400;
      canvas.height = canvas.parentElement?.clientHeight ?? 260;
    }
    onResize();
    window.addEventListener("resize", onResize);

    // ── Mouse / touch interaction ───────────────────────────────────────────
    function onMouseDown(e: MouseEvent) {
      isDraggingRef.current = true;
      autoRotateRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      rotYRef.current += dx * 0.008;
      rotXRef.current  = Math.max(-0.1, Math.min(0.9, rotXRef.current + dy * 0.005));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
    function onMouseUp() {
      isDraggingRef.current = false;
      resumeTimerRef.current = setTimeout(() => { autoRotateRef.current = true; }, 2000);
    }

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
    };
  }, [elevation]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-orange-500/20 bg-black/75 px-3 py-2 backdrop-blur">
        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-orange-400">3D Scaffold Model</p>
        <p className="mt-0.5 text-[8px] text-zinc-500">Drag to rotate · auto-resumes</p>
      </div>
      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        <button
          onClick={() => { zoomRef.current = Math.min(3, zoomRef.current + 0.2); setZoomDisplay(Math.round(zoomRef.current * 100)); }}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-black/80 text-zinc-400 hover:text-orange-300 text-sm font-bold"
        >+</button>
        <span className="rounded-lg border border-zinc-800 bg-black/80 px-2 py-1 font-mono text-[9px] text-zinc-500">{zoomDisplay}%</span>
        <button
          onClick={() => { zoomRef.current = Math.max(0.3, zoomRef.current - 0.2); setZoomDisplay(Math.round(zoomRef.current * 100)); }}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-black/80 text-zinc-400 hover:text-orange-300 text-sm font-bold"
        >−</button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-xl border border-zinc-800 bg-black/75 px-3 py-1.5 backdrop-blur">
        <p className="font-mono text-[9px] text-zinc-500">
          {elevation?.quantityEngine?.bayCount ?? "—"} bays · {elevation?.quantityEngine?.legCount ?? "—"} legs · {elevation?.wallHeight ?? "—"}ft
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Main page ─────────────────────────────────────────────────────────────────

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

  const hasTakeoffData = Boolean(
    storedElevation?.linearFeet != null &&
    Number.isFinite(storedElevation.linearFeet) &&
    storedElevation.linearFeet > 0,
  );

  // 3D model shows only after Set Scaffold has been saved (bayCount stored)
  const hasScaffoldData = Boolean(
    storedElevation?.scaffoldInput?.bayCount != null &&
    storedElevation.scaffoldInput.bayCount > 0,
  );
  const show3DModel = hasTakeoffData && hasScaffoldData;

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
              <KorbanButton as="a" href="/takeoff-workspace" variant="ghost">Open Takeoff</KorbanButton>
              <KorbanButton as="a" href="/set-scaffold" variant="ghost">Set Scaffold</KorbanButton>
              <KorbanButton as="a" href="/section-view" variant="ghost">Section View</KorbanButton>
              <KorbanButton as="a" href="/estimate-review" variant="primary">Save & Continue</KorbanButton>
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
      {/* ── ZONE A — PROJECT SETUP ── */}
      <ZoneHeader label="Project Setup" description="Set once when the project starts — before takeoff begins" />
      <section className="grid gap-4 xl:grid-cols-12">

        {/* Grey background wraps only the two info tiles */}
        <div className="xl:col-span-8">
          <div className="grid gap-4 rounded-[1.75rem] border border-orange-300/30 bg-[#2a2420] p-4 xl:grid-cols-2 h-full">
            <KorbanPanel title="Project Information" subtitle="Current bid profile">
              <div className="space-y-2">
                <InfoRow label="Project No." value={project.projectNumber} />
                <InfoRow label="Address" value={displayProject.projectAddress} />
                <InfoRow label="GC" value={project.gc} />
                <InfoRow label="Estimator" value={displayProject.estimator} />
                <InfoRow label="Union" value={project.unionStatus} />
              </div>
              <TileButton href="/dashboard" label="Open Bid Room" />
            </KorbanPanel>

            <KorbanDemoPanel>
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
          </div>
        </div>

        {/* 3D Model tile — always present, no grey background */}
        <div className="xl:col-span-4">
          <div className="h-full overflow-hidden rounded-[1.5rem] border border-orange-500/20 bg-black" style={{ minHeight: 260 }}>
            {show3DModel ? (
              <ScaffoldModel3D elevation={storedElevation!} />
            ) : (
              <div className="flex h-full flex-col p-5" style={{ minHeight: 260 }}>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-400">3D Scaffold Model</p>
                <p className="mt-1 text-[10px] text-zinc-600">Appears after Set Scaffold is saved</p>
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-4xl opacity-10">⬡</span>
                </div>
                <TileButton href="/set-scaffold" label="Open Set Scaffold" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── ZONE B — TAKEOFF RESULTS ── */}
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
                  <text x="110" y="82" fill="#ffffff" fontSize="12" fontWeight="800">Reference Point</text>
                </svg>
                <div className="absolute left-4 top-4 rounded-2xl border border-orange-500/20 bg-black/80 px-4 py-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Active Overlay</p>
                  <p className="mt-1 font-mono text-sm font-bold text-orange-300">{selectedOverlay.label} · {selectedOverlay.lf}</p>
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
                    className={`w-full rounded-2xl border p-3 text-left transition ${activeOverlay === level.label ? "border-orange-500/50 bg-orange-500/10" : "border-zinc-800 bg-black hover:border-orange-500/30"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: level.color }} />
                        <span className="text-xs font-bold text-zinc-200">{level.label}</span>
                      </div>
                      <span className="font-mono text-[11px] text-orange-300">{level.lf}</span>
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{level.status}</p>
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
                  <text x="78" y="58" fill="#f97316" fontSize="14" fontWeight="800">{selectedSection.elevation} Elevation</text>
                  <text x="78" y="315" fill="#a1a1aa" fontSize="12">LF {activeSectionLfLabel} · Height {activeSectionHeight}</text>
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
                    className={`w-full rounded-2xl border p-3 text-left transition ${activeSection === section.elevation ? "border-white/35 bg-white/10" : "border-zinc-800 bg-black hover:border-white/20"}`}
                  >
                    <p className="text-xs font-bold text-zinc-200">{section.elevation}</p>
                    <p className="mt-1 font-mono text-[11px] text-orange-300">{section.height}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{section.status}</p>
                  </button>
                ))}
              </div>
            </div>
          </KorbanPanel>
        </CollapsibleTile>
      </section>

      {/* ── ZONE C — REFERENCE / DEMO ── */}
      <ZoneHeader label="Reference & Tools" description="Demo data — not yet connected to live project data" className="mt-6" />
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
                  <p className={`mt-2 text-[10px] uppercase tracking-[0.16em] ${task.status === "Completed" ? "text-green-300" : task.status === "Waiting" ? "text-yellow-300" : "text-orange-300"}`}>
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

// ── Sub-components (unchanged from original) ──────────────────────────────────

function CollapsibleTile({ title, subtitle, collapsed, onToggle, className, children }: {
  title: string; subtitle: string; collapsed: boolean; onToggle: () => void; className?: string; children: React.ReactNode;
}) {
  if (!collapsed) {
    return (
      <div className={className}>
        <div className="mb-2 flex justify-end">
          <button onClick={onToggle} className="rounded-lg border border-zinc-800 bg-black px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300">
            Collapse
          </button>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className={className}>
      <button onClick={onToggle} className="flex w-full items-center justify-between rounded-[1.75rem] border border-zinc-800 bg-korban-raised p-4 text-left shadow-2xl transition hover:border-orange-500/30">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">{title}</h2>
          <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
        </div>
        <span className="collapsible-glow-dot shrink-0 rounded-full bg-orange-500" />
      </button>
      <style jsx>{`
        .collapsible-glow-dot { width:10px;height:10px;box-shadow:0 0 14px rgba(249,115,22,0.7);animation:collapsible-pulse 2.2s ease-in-out infinite; }
        @keyframes collapsible-pulse { 0%,100%{box-shadow:0 0 8px rgba(249,115,22,0.5);opacity:0.85;}50%{box-shadow:0 0 20px rgba(249,115,22,0.9);opacity:1;} }
      `}</style>
    </div>
  );
}

function ZoneHeader({ label, description, className }: { label: string; description: string; className?: string }) {
  return (
    <div className={`mb-3 flex items-baseline justify-between gap-4 border-b border-zinc-900 pb-2 ${className ?? ""}`}>
      <h2 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">{label}</h2>
      <p className="text-[10px] text-zinc-600">{description}</p>
    </div>
  );
}

function InventoryTicker({ frameCount, plankCount, crossBraceCount, guardrailCount, basePlateCount, screwJackCount }: {
  frameCount?: number; plankCount?: number; crossBraceCount?: number; guardrailCount?: number; basePlateCount?: number; screwJackCount?: number;
}) {
  const resolvedItems = inventoryTickerItems.map((item) => {
    const storeRequired = item.item === "Frames" ? frameCount : item.item === "Planks" ? plankCount : item.item === "Cross Braces" ? crossBraceCount : item.item === "Guardrails" ? guardrailCount : item.item === "Base Plates" ? basePlateCount : item.item === "Screw Jacks" ? screwJackCount : undefined;
    return { ...item, required: storeRequired != null && Number.isFinite(storeRequired) && storeRequired > 0 ? storeRequired : item.required };
  });
  const tickerItems = [...resolvedItems, ...resolvedItems];
  return (
    <section className="border-b border-orange-500/10 bg-black/80 px-4 py-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="shrink-0 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">Inventory Reel</div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="inventory-ticker-track flex w-max items-center gap-3">
            {tickerItems.map((item, index) => {
              const short = Math.max(0, item.required - item.available);
              const ready = short === 0;
              return (
                <a key={`${item.item}-${index}`} href="/inventory" className="flex items-center gap-2 rounded-full border border-zinc-800 bg-[#0b0b0b] px-3 py-1.5 text-[10px] transition hover:border-orange-500/40">
                  <span className="font-black text-zinc-200">{item.item}</span>
                  <span className="text-zinc-600">REQ</span>
                  <span className="font-mono font-bold text-orange-300">{item.required.toLocaleString()}</span>
                  <span className="text-zinc-600">AVL</span>
                  <span className="font-mono font-bold text-zinc-300">{item.available.toLocaleString()}</span>
                  <span className={`rounded-full px-2 py-0.5 font-black uppercase tracking-[0.12em] ${ready ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`}>
                    {ready ? item.status : `Short ${short.toLocaleString()}`}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
        <a href="/inventory/load-list" className="shrink-0 rounded-full border border-zinc-800 bg-black px-3 py-1 text-[10px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300">Load List</a>
      </div>
      <style jsx>{`
        .inventory-ticker-track { animation: inventory-scroll 45s linear infinite; }
        @keyframes inventory-scroll { from{transform:translateX(0);}to{transform:translateX(-50%);} }
      `}</style>
    </section>
  );
}

function TileButton({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  return <a href={href} className={`block w-full rounded-xl border border-orange-500/25 bg-orange-500/10 text-center font-bold text-orange-300 transition hover:bg-orange-500/20 hover:border-orange-500/40 ${compact ? "px-3 py-2 text-xs" : "mt-4 px-4 py-2.5 text-xs"}`}>{label}</a>;
}

function SmallTool({ label, href }: { label: string; href?: string }) {
  if (href) return <KorbanButton as="a" href={href} variant="ghost" className="border-zinc-700 bg-black/80 px-3 py-2 text-[10px] backdrop-blur">{label}</KorbanButton>;
  return <KorbanButton variant="ghost" className="border-zinc-700 bg-black/80 px-3 py-2 text-[10px] backdrop-blur">{label}</KorbanButton>;
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
