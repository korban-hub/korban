// components/set-scaffold-v2-inner.tsx
// NO SSR — imported via dynamic() from app/set-scaffold-v2/page.tsx
"use client";

import "leaflet/dist/leaflet.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { KorbanButton, KorbanHeader, KorbanHeaderMeta, type KorbanMenuLink } from "@/components/korban";
import { calculateQuantityEngine, findFrameMakeupOptions, getActiveElevation, getActiveProject, saveActiveElevation, saveSectionView, type ProjectElevation, type ScaffoldInput, type SectionDraftingItem } from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type PlanPoint = { x: number; y: number };
type ScaffoldWidth = "3'" | "3'-6\"" | "5'";
type LegResult = {
  wallPoint: PlanPoint; tickTip: PlanPoint; labelPoint: PlanPoint;
  isTurnaroundMirror: boolean; isStartLeg: boolean; isEndLeg: boolean;
};

const projectInfo = { projectName: "Mare Island Apartments", jobNumber: "KRB-260614-001" };

const menuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/estimate-review", label: "Estimate Review" },
];

const FRAME_TYPES: { id: string; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "mason", label: "Mason" },
  { id: "walk-through", label: "Walk-Thru" },
  { id: "half", label: "Half Frame" },
];

const BRACKET_TYPES: { id: string; label: string }[] = [
  { id: "12", label: "12\" Bracket" },
  { id: "18", label: "18\" Bracket" },
  { id: "24", label: "24\" Bracket" },
];

// ── Geometry helpers ──────────────────────────────────────────────────────────
function isFiniteNumber(v: number) { return Number.isFinite(v); }
function isFinitePoint(p: PlanPoint) { return isFiniteNumber(p.x) && isFiniteNumber(p.y); }
function signedArea(pts: PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
  return a / 2;
}
function pointInPolygon(pt: PlanPoint, poly: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function computeOutwardNormal(a: PlanPoint, b: PlanPoint, poly: PlanPoint[]): PlanPoint {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
  if (!len) return { x: 0, y: -1 };
  const n1 = { x: dy / len, y: -dx / len }, n2 = { x: -dy / len, y: dx / len };
  const area = signedArea(poly);
  const candidate = area > 0 ? n2 : n1, opp = area > 0 ? n1 : n2;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, td = Math.max(len * 0.05, 2);
  return pointInPolygon({ x: mx + candidate.x * td, y: my + candidate.y * td }, poly) ? opp : candidate;
}
function getPrimaryGeometryPoints(elev: ProjectElevation | null): PlanPoint[] {
  const g = elev?.overlayGeometry; if (!g) return [];
  if (g.tracedPerimeter?.length >= 3) return g.tracedPerimeter;
  if ((g as any).overlayPoints?.length >= 3) return (g as any).overlayPoints;
  const kf = g.fullOverlayRows?.find((r: any) => r.isKeyFloor && r.points?.length >= 3);
  if (kf) return kf.points;
  const ff = g.fullOverlayRows?.find((r: any) => r.points?.length >= 3);
  if (ff) return ff.points;
  return [];
}

const FALLBACK: PlanPoint[] = [
  { x: 160, y: 120 }, { x: 880, y: 120 }, { x: 880, y: 300 }, { x: 700, y: 300 },
  { x: 700, y: 480 }, { x: 880, y: 480 }, { x: 880, y: 600 }, { x: 160, y: 600 },
];

function parseFt(v: string): number {
  // Handle "3'-6\"" → 3.5, "3'" → 3, "10'" → 10
  const feetInches = v.match(/(\d+)['′]\s*-?\s*(\d+)/);
  if (feetInches) return parseInt(feetInches[1]) + parseInt(feetInches[2]) / 12;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

// ── Plank count per bay based on width ───────────────────────────────────────
function planksPerBay(width: ScaffoldWidth): number {
  if (width === "5'") return 6;
  if (width === "3'-6\"") return 4;
  return 3; // 3'
}

// ── Leg computation — NO orphan legs ─────────────────────────────────────────
function computeLegs(
  outline: PlanPoint[], widthFt: number, bayFt: number, puf: number
): { segIndex: number; legs: LegResult[] }[] {
  const results: { segIndex: number; legs: LegResult[] }[] = [];
  for (let i = 0; i < outline.length; i++) {
    const start = outline[i], end = outline[(i + 1) % outline.length];
    const dx = end.x - start.x, dy = end.y - start.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen <= 0 || puf <= 0 || bayFt <= 0) { results.push({ segIndex: i, legs: [] }); continue; }
    const along = { x: dx / segLen, y: dy / segLen };
    const normal = computeOutwardNormal(start, end, outline);
    const bayPx = bayFt * puf;
    const wallGap = 1 * puf;
    const tickLen = widthFt * puf;
    const labelOff = wallGap + tickLen + puf * 1.4;

    function makeLeg(dist: number, isStart = false, isEnd = false): LegResult {
      const d = Math.max(0, Math.min(dist, segLen));
      const wp = { x: start.x + along.x * d + normal.x * wallGap, y: start.y + along.y * d + normal.y * wallGap };
      const tp = { x: start.x + along.x * d + normal.x * (wallGap + tickLen), y: start.y + along.y * d + normal.y * (wallGap + tickLen) };
      const lp = { x: start.x + along.x * d + normal.x * labelOff, y: start.y + along.y * d + normal.y * labelOff };
      return { wallPoint: wp, tickTip: tp, labelPoint: lp, isTurnaroundMirror: false, isStartLeg: isStart, isEndLeg: isEnd };
    }

    const legs: LegResult[] = [];
    // Corner offset = scaffoldWidth + wallOffset (1') past each corner
    const cornerOffPx = (widthFt + 1) * puf;

    // Start leg placed cornerOffPx past the start corner
    legs.push(makeLeg(cornerOffPx, true, false));

    // Bay legs from cornerOffPx + bayPx onward
    // End of segment is segLen - cornerOffPx (mirror of start)
    const runEnd = segLen - cornerOffPx;
    let cursor = cornerOffPx + bayPx;
    let safetyLimit = 0;
    while (cursor < runEnd - puf * 0.1 && safetyLimit < 500) {
      const remaining = runEnd - cursor;
      if (remaining > 0 && remaining < bayPx * 0.5) break;
      legs.push(makeLeg(cursor, false, false));
      cursor += bayPx;
      safetyLimit++;
    }

    // End leg at cornerOffPx from end corner — mirrors start. Only
    // skipped if the run is too short to place it at all without
    // overlapping the start leg (not "not comfortably longer" — that
    // was silently dropping legitimate corner ticks on shorter walls).
    if (runEnd > 0) {
      const lastLeg = legs[legs.length - 1];
      const lastPos = lastLeg ? Math.sqrt(
        (lastLeg.wallPoint.x - start.x - normal.x * wallGap) ** 2 +
        (lastLeg.wallPoint.y - start.y - normal.y * wallGap) ** 2
      ) : 0;
      if (Math.abs(lastPos - runEnd) > puf * 0.1) {
        legs.push(makeLeg(runEnd, false, true));
      }
    }

    // Filter legs inside polygon — but never filter out the mandatory
    // corner (start/end) ticks this way. That check is meant to hide
    // ordinary mid-run bay ticks that fall inside a notch elsewhere in
    // the building; at a concave corner, the same whole-polygon test
    // can wrongly flag a perfectly correct corner tick as "inside"
    // simply because it's testing against the far wing of the
    // building, not the local wall. Corner ticks are required by the
    // frame-width-plus-1' rule regardless of local concavity.
    const filtered = legs.filter(l => isFinitePoint(l.tickTip) && (l.isStartLeg || l.isEndLeg || !pointInPolygon(l.tickTip, outline)));
    results.push({ segIndex: i, legs: filtered });
  }
  return results;
}

// ── Three.js 3D model — full building perimeter ───────────────────────────────
function ScaffoldModel3D({
  outline, puf, bayFt, widthFt, frameTall, scaffoldWidthFt
}: {
  outline: PlanPoint[]; puf: number; bayFt: number; widthFt: number;
  frameTall: number; scaffoldWidthFt: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const [rotating, setRotating] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const W = mountRef.current.clientWidth, H = mountRef.current.clientHeight;
    // If the container has no size yet (can happen right as a tab/panel
    // becomes visible, before layout settles), clamp to a safe minimum
    // instead of building a scene with a NaN/zero camera aspect ratio —
    // that produces a canvas that looks frozen/static even though the
    // render loop is technically still running. The resize observer
    // below corrects the real size as soon as layout settles.
    const initialW = W || 400, initialH = H || 300;
    console.log("[3D model] mounting scene", { measuredW: W, measuredH: H, usingW: initialW, usingH: initialH });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080604);
    scene.fog = new THREE.FogExp2(0x080604, 0.018);

    const camera = new THREE.PerspectiveCamera(50, initialW / initialH, 0.1, 500);

    // WebGLRenderer creation throws if the browser can't get a GPU
    // context. Separately, this machine has a CONFIRMED compositing
    // failure: a live, correctly-sized canvas with a healthy render loop
    // still displays blank white (verified via Inspect — canvas exists,
    // three.js initialized, loop runs, no context-lost event). So this
    // uses the most conservative rendering path available: no antialias
    // (heaviest compositing feature, common trigger on flaky drivers),
    // no shadow maps, pixel ratio capped at 1, low-power GPU preference
    // (avoids discrete-GPU driver bugs on Windows laptops/desktops), and
    // preserveDrawingBuffer to force a stable backbuffer instead of the
    // fast-swap path some drivers white-out on.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      console.error("[3D model] Failed to create WebGL renderer — likely out of GPU contexts. Try fully restarting the browser.", err);
      setRenderError("3D view unavailable right now (couldn't get a GPU context). Try fully closing and reopening the browser, then reload this page.");
      return;
    }
    renderer.setSize(initialW, initialH);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // TEMPORARY DIAGNOSTIC — the render loop was proven to be running
    // correctly (angle/frame count incrementing on schedule) while the
    // view stayed visually frozen. That specific pattern is the known
    // signature of a lost/exhausted WebGL context — render() keeps
    // getting called and doesn't throw, but the browser silently stops
    // compositing it. These listeners confirm it directly. Safe to
    // remove once confirmed either way.
    const canvas = renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.error("[3D model] WEBGL CONTEXT LOST", e);
    };
    const onContextRestored = () => {
      console.warn("[3D model] WebGL context restored");
    };
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);

    // Keep the renderer/camera matched to the container if it resizes
    // later (e.g. switching tabs, resizing the window) — a stale size
    // here is the other common cause of a 3D view that looks frozen.
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width, h = entry.contentRect.height;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mountRef.current);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(20, 30, 15); sun.castShadow = true; scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8080ff, 0.3);
    fill.position.set(-10, 5, -5); scene.add(fill);
    const orange = new THREE.PointLight(0xf97316, 0.5, 60);
    orange.position.set(0, 10, 10); scene.add(orange);

    // Materials
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xbababa, metalness: 0.85, roughness: 0.25 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x7c5c1a, roughness: 0.9 });
    const braceMat = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.7, roughness: 0.4 });
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
    const groundMat= new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1.0 });

    const BAY_H = 6.333 * 0.3; // frame height in scene units
    const SCAF_D = scaffoldWidthFt * 0.3; // scaffold depth
    const jumps = Math.min(frameTall, 20);

    // Auto-scale: normalize outline to reasonable scene size regardless of SVG coordinate range
    const allX = outline.map(p => p.x), allZ = outline.map(p => p.y);
    const bldgW = Math.max(...allX) - Math.min(...allX);
    const bldgH = Math.max(...allZ) - Math.min(...allZ);
    const maxDim = Math.max(bldgW, bldgH, 1);
    const targetSize = 28; // scene units
    const sceneScale = targetSize / maxDim;

    // Convert outline to scene coords centered on centroid
    const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length;
    const pts3d = outline.map(p => ({ x: (p.x - cx) * sceneScale, z: (p.y - cy) * sceneScale }));

    // Ground
    const gSize = 120;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // Build wall and scaffold around perimeter
    const group = new THREE.Group();

    for (let si = 0; si < pts3d.length; si++) {
      const p1 = pts3d[si], p2 = pts3d[(si + 1) % pts3d.length];
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (segLen < 0.1) continue;
      const ax = dx / segLen, az = dz / segLen;
      // Outward normal computed on the ORIGINAL (unscaled) outline, using
      // the same winding-aware test the Floor Plan panel uses — a naive
      // 90° rotation here doesn't know which side is actually outside the
      // building, and was putting scaffold on the interior whenever a
      // trace happened to wind the "wrong" way.
      const rawA = outline[si], rawB = outline[(si + 1) % outline.length];
      const outwardNormal = computeOutwardNormal(rawA, rawB, outline);
      const nx = outwardNormal.x, nz = outwardNormal.y;

      // Wall panel
      const wallH = jumps * BAY_H;
      const wallGeo = new THREE.BoxGeometry(segLen, wallH, 0.08);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set((p1.x + p2.x) / 2, wallH / 2, (p1.z + p2.z) / 2);
      wall.rotation.y = -Math.atan2(dz, dx);
      group.add(wall);

      // Scaffold along this segment
      const bayPx = bayFt * puf;
      const segPx = segLen / sceneScale;
      const numBays = Math.max(1, Math.round(segPx / bayPx));
      const actualBayLen = segLen / numBays;
      const wallOff = 1 * puf * sceneScale;

      for (let b = 0; b <= numBays; b++) {
        const t = b / numBays;
        const lx = p1.x + dx * t + nx * wallOff;
        const lz = p1.z + dz * t + nz * wallOff;
        const ox = lx + nx * SCAF_D;
        const oz = lz + nz * SCAF_D;

        for (let j = 0; j < jumps; j++) {
          const y = j * BAY_H;
          // Inner leg (wall side)
          const legGeo = new THREE.CylinderGeometry(0.025, 0.025, BAY_H, 6);
          const leg1 = new THREE.Mesh(legGeo, frameMat); leg1.position.set(lx, y + BAY_H / 2, lz); leg1.castShadow = true; group.add(leg1);
          // Outer leg
          const leg2 = new THREE.Mesh(legGeo, frameMat); leg2.position.set(ox, y + BAY_H / 2, oz); leg2.castShadow = true; group.add(leg2);
          // Frame crossbar
          const cbGeo = new THREE.CylinderGeometry(0.018, 0.018, SCAF_D, 5);
          const cb = new THREE.Mesh(cbGeo, frameMat);
          cb.rotation.x = Math.PI / 2;
          cb.position.set((lx + ox) / 2, y + BAY_H * 0.65, (lz + oz) / 2); group.add(cb);
          // Screw jacks
          if (j === 0) {
            const jkGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.2, 5);
            const jk1 = new THREE.Mesh(jkGeo, frameMat); jk1.position.set(lx, 0.1, lz); group.add(jk1);
            const jk2 = new THREE.Mesh(jkGeo, frameMat); jk2.position.set(ox, 0.1, oz); group.add(jk2);
          }
        }

        // Cross braces and planks between bays
        if (b < numBays) {
          const nx2 = p1.x + dx * ((b + 1) / numBays) + nx * wallOff;
          const nz2 = p1.z + dz * ((b + 1) / numBays) + nz * wallOff;
          const ox2 = nx2 + nx * SCAF_D;
          const oz2 = nz2 + nz * SCAF_D;

          for (let j = 0; j < jumps; j++) {
            const y = j * BAY_H;
            // X brace front
            const bl = Math.sqrt(actualBayLen ** 2 + BAY_H ** 2);
            const brGeo = new THREE.CylinderGeometry(0.015, 0.015, bl, 4);
            const ang = Math.atan2(BAY_H, actualBayLen);
            const brMid = new THREE.Vector3((lx + nx2) / 2, y + BAY_H / 2, (lz + nz2) / 2);
            const br = new THREE.Mesh(brGeo, braceMat);
            br.position.copy(brMid);
            br.rotation.z = ang;
            br.rotation.y = -Math.atan2(dz, dx);
            group.add(br);

            // Planks
            const ppb = planksPerBay(scaffoldWidthFt >= 5 ? "5'" : scaffoldWidthFt >= 3.5 ? "3'-6\"" : "3'");
            const plankW = actualBayLen * 0.95;
            for (let p = 0; p < Math.min(ppb, 4); p++) {
              const pt = (p + 0.5) / ppb;
              const px = lx + ax * actualBayLen * 0.5 + nx * (wallOff + SCAF_D * pt);
              const pz = lz + az * actualBayLen * 0.5 + nz * (wallOff + SCAF_D * pt);
              const plGeo = new THREE.BoxGeometry(plankW, 0.04, SCAF_D / ppb * 0.85);
              const pl = new THREE.Mesh(plGeo, plankMat);
              pl.position.set(px, y + BAY_H + 0.02, pz);
              pl.rotation.y = -Math.atan2(dz, dx);
              pl.castShadow = true; pl.receiveShadow = true; group.add(pl);
            }

            // Guardrail
            const grGeo = new THREE.CylinderGeometry(0.012, 0.012, actualBayLen, 4);
            const gr = new THREE.Mesh(grGeo, frameMat);
            gr.position.set((ox + ox2) / 2, j * BAY_H + BAY_H + 0.8, (oz + oz2) / 2);
            gr.rotation.z = Math.PI / 2; gr.rotation.y = -Math.atan2(dz, dx); group.add(gr);
          }
        }
      }
    }

    scene.add(group);
    scene.add(new THREE.GridHelper(gSize, 40, 0x111111, 0x111111));

    // Camera orbit
    const bbox = new THREE.Box3().setFromObject(group);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const camSize = Math.max(size.x, size.z);
    const camDist = camSize * 1.5 + 5;
    camera.position.set(center.x + camDist, camDist * 0.6, center.z + camDist);
    camera.lookAt(center.x, center.y * 0.5, center.z);

    let angle = Math.atan2(camDist, camDist);
    let isRotating = true;
    let zoomFactor = 1;
    let debugFrameCount = 0;
    (mountRef.current as any).__setRotating = (v: boolean) => { isRotating = v; };
    (mountRef.current as any).__setZoomFactor = (z: number) => { zoomFactor = z; };
    (mountRef.current as any).__snapshot = () => renderer.domElement.toDataURL("image/png");

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      // TEMPORARY DIAGNOSTIC — logs once every ~2 seconds so we can see in
      // the browser console whether this loop is actually running and
      // what isRotating/angle actually are, instead of guessing again.
      // Safe to remove once rotation is confirmed working.
      debugFrameCount++;
      if (debugFrameCount % 120 === 0) {
        console.log("[3D model animate loop]", { isRotating, angle: angle.toFixed(3), zoomFactor, frame: debugFrameCount });
      }
      if (isRotating) {
        angle += 0.004;
        camera.position.set(
          center.x + Math.sin(angle) * camDist * zoomFactor,
          camDist * 0.55 * zoomFactor,
          center.z + Math.cos(angle) * camDist * zoomFactor
        );
        camera.lookAt(center.x, center.y * 0.4, center.z);
      } else {
        // Still respond to zoom changes while paused, using the last angle.
        camera.position.set(
          center.x + Math.sin(angle) * camDist * zoomFactor,
          camDist * 0.55 * zoomFactor,
          center.z + Math.cos(angle) * camDist * zoomFactor
        );
        camera.lookAt(center.x, center.y * 0.4, center.z);
      }
      renderer.render(scene, camera);
      // IMAGE-MIRROR WORKAROUND — this machine's browser compositing of
      // live WebGL canvases is broken (confirmed: the Capture PNG shows a
      // perfect scene while the on-screen canvas displays blank white; the
      // GPU draws fine, only the final canvas→screen step fails). Ordinary
      // <img> elements display flawlessly, so every 5th frame (~12fps) the
      // finished frame is copied into an <img> overlaying the canvas.
      // Rotation stays visibly smooth; requires preserveDrawingBuffer.
      if (debugFrameCount % 5 === 0) {
        const img = (mountRef.current as any)?.__mirrorImg as HTMLImageElement | undefined;
        if (img) img.src = renderer.domElement.toDataURL("image/jpeg", 0.85);
      }
    }
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      renderer.dispose();
      // forceContextLoss() depends on the WEBGL_lose_context extension,
      // which isn't guaranteed to exist on every browser/GPU — an
      // unguarded call here was throwing and taking down the whole
      // render tree on systems without it. dispose() above already does
      // the important cleanup; this is a best-effort extra that must
      // never be allowed to crash anything.
      try { renderer.forceContextLoss(); } catch { /* not supported here — safe to ignore */ }
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [outline, bayFt, widthFt, frameTall, scaffoldWidthFt, puf]);

  useEffect(() => {
    if (mountRef.current) (mountRef.current as any).__setRotating?.(rotating);
  }, [rotating]);

  useEffect(() => {
    if (mountRef.current) (mountRef.current as any).__setZoomFactor?.(zoom);
  }, [zoom]);

  function handleCapture() {
    const dataUrl = (mountRef.current as any)?.__snapshot?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `scaffold-3d-view-${Date.now()}.png`;
    a.click();
  }

  if (renderError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center max-w-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">⚠ 3D View Unavailable</p>
          <p className="mt-2 text-xs text-zinc-400">{renderError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative overflow-hidden rounded-t-lg bg-[#080604]" style={{ minHeight: 0 }}>
        {/* The live canvas mounts in here but is visually hidden — this
            machine's compositing shows it as blank white even though the
            GPU draws it perfectly (proven via Capture). */}
        <div ref={mountRef} className="absolute inset-0 opacity-0" />
        {/* Mirror image — receives the rendered frames (~12fps) and
            displays them the way this machine handles correctly. */}
        <img
          ref={el => { if (mountRef.current) (mountRef.current as any).__mirrorImg = el; }}
          alt="3D scaffold model"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0b0b0b] border-t border-zinc-900 flex-shrink-0">
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold flex-shrink-0">−</button>
        <span className="text-[9px] font-mono text-zinc-600 w-9 text-center flex-shrink-0">{Math.round((1 / zoom) * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold flex-shrink-0">+</button>
        <button onClick={() => setRotating(r => !r)}
          className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-bold transition ${rotating ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}>
          {rotating ? "⏸ Pause" : "▶ Resume"}
        </button>
        <button onClick={handleCapture}
          className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[9px] font-bold text-zinc-400 hover:border-orange-500/40 hover:text-orange-300 transition">
          📷 Capture
        </button>
      </div>
    </div>
  );
}

// ── Section View SVG ──────────────────────────────────────────────────────────
// Renders: the traced wall profile (steps, setbacks, decks — from
// sectionView.wallOutline, converted image px → feet via
// scale.pageUnitsPerFoot), the scaffold stacked on the chosen side at
// the wall offset, level labels, frame height labels, cross braces, and
// a drag-and-drop tray of frame/bracket pieces the estimator can drop
// onto the drawing where Korban may have missed. Dropped pieces feed
// straight back into material counts via onDropPiece.
function SectionViewPanel({
  wallOutline, wallOffset, frameTall, scaffoldWidthFt, scaffoldSide,
  draftingAdditions, onDropPiece, onRemovePiece, onToggleSide, sectionType,
  isExpanded, onToggleExpand,
}: {
  wallOutline: PlanPoint[]; wallOffset: number; frameTall: number;
  scaffoldWidthFt: number; scaffoldSide: "left" | "right";
  draftingAdditions: SectionDraftingItem[];
  onDropPiece: (kind: "frame" | "bracket", variant: string, level: number) => void;
  onRemovePiece: (id: string) => void;
  onToggleSide: (side: "left" | "right") => void;
  sectionType: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragKind, setDragKind] = useState<{ kind: "frame" | "bracket"; variant: string } | null>(null);

  const FRAME_H_FT = 6.333;
  const pxPerFt = 14;
  const frameHPx = FRAME_H_FT * pxPerFt;
  const totalH = Math.max(1, frameTall) * frameHPx;
  const widthPx = Math.max(scaffoldWidthFt, 0.1) * pxPerFt;
  const wallOffPx = Math.max(wallOffset, 0.5) * pxPerFt;

  const hasWallTrace = wallOutline.length >= 2;

  // Takeoff Workspace's Section View "Store" step converts the traced
  // wall outline to feet-space once, using whichever scale was active
  // at trace time — x = linear footage along the wall, y = height in
  // feet from the lowest traced point. No further scale conversion is
  // needed here, so this just reads the points as given.
  const wallPts = useMemo(() => (hasWallTrace ? wallOutline : ([] as PlanPoint[])), [wallOutline, hasWallTrace]);

  const wallSpanFt = wallPts.length ? Math.max(1, Math.max(...wallPts.map(p => p.x))) : 14;
  const wallDrawX0 = 24;
  const wallPolyPx = wallPts.map(p => `${wallDrawX0 + p.x * pxPerFt},${totalH - p.y * pxPerFt}`).join(" ");

  // Both sides measure the same wallOffPx distance from the SAME wall
  // reference point (its start edge). This is a one-bay cross-section —
  // the scaffold sits right next to the wall face, not pushed out by
  // the wall's entire traced linear footage (that was the bug: "Scaffold
  // Right" previously added the wall's full span as if it were the
  // standoff distance, so the more wall you traced, the further away
  // the scaffold drifted, and each side used a different reference
  // point entirely).
  const scaffX = scaffoldSide === "left"
    ? wallDrawX0 - wallOffPx - widthPx
    : wallDrawX0 + wallOffPx;

  const rightExtent = Math.max(scaffX + widthPx, wallDrawX0 + wallSpanFt * pxPerFt);
  const svgOriginX = Math.min(0, scaffX - 14, wallDrawX0 - 14);
  const svgW = rightExtent + 60 - svgOriginX;
  const [sectionZoom, setSectionZoom] = useState(1);
  const [sectionPan, setSectionPan] = useState({ dx: 0, dy: 0 });
  const [isPanningSection, setIsPanningSection] = useState(false);
  const svgCenterX = svgOriginX + svgW / 2;
  const svgCenterY = -22 + (totalH + 62) / 2;
  const zoomedW = svgW / sectionZoom;
  const zoomedH = (totalH + 62) / sectionZoom;
  const zoomedX = svgCenterX - zoomedW / 2 + sectionPan.dx;
  const zoomedY = svgCenterY - zoomedH / 2 + sectionPan.dy;

  function handleDrop(e: any) {
    e.preventDefault();
    if (!dragKind || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vb = svgRef.current.viewBox.baseVal;
    const relY = (e.clientY - rect.top) / rect.height;
    const yInVb = vb.y + relY * vb.height;
    const level = Math.max(0, Math.min(frameTall - 1, Math.floor(yInVb / frameHPx)));
    onDropPiece(dragKind.kind, dragKind.variant, level);
    setDragKind(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Wall side toggle + zoom */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-900 bg-[#0a0a0a] flex-shrink-0 gap-2">
        <span className="text-[8px] uppercase tracking-wider text-zinc-600">Scaffold Side</span>
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          <button onClick={() => onToggleSide("left")}
            className={`px-2.5 py-0.5 text-[8px] font-bold transition ${scaffoldSide === "left" ? "bg-orange-500 text-black" : "text-zinc-500 hover:text-zinc-300"}`}>
            Scaffold Left
          </button>
          <button onClick={() => onToggleSide("right")}
            className={`px-2.5 py-0.5 text-[8px] font-bold transition ${scaffoldSide === "right" ? "bg-orange-500 text-black" : "text-zinc-500 hover:text-zinc-300"}`}>
            Scaffold Right
          </button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setSectionZoom(z => Math.max(0.3, z - 0.15))} className="rounded border border-zinc-800 w-5 h-5 text-zinc-400 hover:text-white text-[10px] font-bold">−</button>
          <span className="text-[8px] font-mono text-zinc-600 w-8 text-center">{Math.round(sectionZoom * 100)}%</span>
          <button onClick={() => setSectionZoom(z => Math.min(4, z + 0.15))} className="rounded border border-zinc-800 w-5 h-5 text-zinc-400 hover:text-white text-[10px] font-bold">+</button>
          <button onClick={() => { setSectionZoom(1); setSectionPan({ dx: 0, dy: 0 }); }} className="rounded border border-zinc-800 px-1.5 h-5 text-[8px] text-zinc-500 hover:text-white">Fit</button>
          <button onClick={onToggleExpand} title={isExpanded ? "Collapse" : "Expand"}
            className="rounded border border-zinc-800 px-1.5 h-5 text-[9px] text-zinc-400 hover:text-white hover:border-orange-500/40">
            {isExpanded ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      {/* SVG drawing */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-2 overflow-hidden relative">
        {!hasWallTrace && (
          <p className="absolute inset-x-3 top-2 text-[8.5px] text-zinc-600 text-center leading-relaxed z-10">
            No wall outline traced yet — trace the wall in Takeoff's Section View tab to render the real profile here. Showing scaffold only.
          </p>
        )}
        <svg
          ref={svgRef}
          viewBox={`${zoomedX} ${zoomedY} ${zoomedW} ${zoomedH}`}
          className="w-full h-full"
          style={{ maxHeight: "100%", maxWidth: "100%", cursor: isPanningSection ? "grabbing" : "grab" }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onMouseDown={() => setIsPanningSection(true)}
          onMouseMove={e => {
            if (!isPanningSection || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect(), vb = svgRef.current.viewBox.baseVal;
            const sx = vb.width / rect.width, sy = vb.height / rect.height;
            setSectionPan(p => ({ dx: p.dx - e.movementX * sx, dy: p.dy - e.movementY * sy }));
          }}
          onMouseUp={() => setIsPanningSection(false)}
          onMouseLeave={() => setIsPanningSection(false)}>

          {/* Wall profile — actual traced outline */}
          {hasWallTrace && (
            <>
              <polyline points={wallPolyPx} fill="none" stroke="#ef4444" strokeWidth="1.2" />
              <text x={wallDrawX0} y={-8} fontSize="4" fill="#ef4444" fontFamily="monospace">WALL OUTLINE (TRACED)</text>
            </>
          )}

          {/* Scaffold frames per level, bottom to top */}
          {Array.from({ length: frameTall }).map((_, jFromBottom) => {
            const level = frameTall - 1 - jFromBottom; // level index (0 = ground)
            const y = jFromBottom * frameHPx;
            const levelLabel = level === frameTall - 1 ? "Roof" : `Lvl ${level + 1}`;
            const plankN = scaffoldWidthFt >= 5 ? 4 : 3;
            const plW = (widthPx - 2) / plankN;

            return (
              <g key={level}>
                <rect x={scaffX} y={y} width={widthPx} height={frameHPx} fill="none" stroke="#9ca3af" strokeWidth="0.6" />
                {/* cross brace X */}
                <line x1={scaffX} y1={y} x2={scaffX + widthPx} y2={y + frameHPx} stroke="#6b7280" strokeWidth="0.5" opacity="0.5" />
                <line x1={scaffX + widthPx} y1={y} x2={scaffX} y2={y + frameHPx} stroke="#6b7280" strokeWidth="0.5" opacity="0.5" />
                {/* planks on top of this level */}
                {Array.from({ length: plankN }).map((_, p) => (
                  <rect key={p} x={scaffX + 1 + p * plW} y={y - 2.2} width={plW - 0.5} height="2.2"
                    fill="#92400e" stroke="#78350f" strokeWidth="0.2" />
                ))}
                {/* level label — left */}
                <text x={scaffX - 4} y={y + frameHPx / 2} textAnchor="end" dominantBaseline="middle"
                  fontSize="3.6" fill="#a1a1aa" fontFamily="monospace">{levelLabel}</text>
                {/* frame height dimension — right */}
                <text x={scaffX + widthPx + 4} y={y + frameHPx / 2} dominantBaseline="middle"
                  fontSize="3.4" fill="#71717a" fontFamily="monospace">{FRAME_H_FT.toFixed(2)}'</text>
              </g>
            );
          })}

          {/* Hand-placed additions */}
          {draftingAdditions.map(item => {
            const y = (frameTall - 1 - item.level) * frameHPx;
            if (item.kind === "frame") {
              return (
                <g key={item.id} style={{ cursor: "pointer" }} onClick={() => onRemovePiece(item.id)}>
                  <rect x={scaffX + 2} y={y + 2} width={widthPx - 4} height={frameHPx - 4}
                    fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="0.8" strokeDasharray="2,1" />
                  <text x={scaffX + widthPx / 2} y={y + frameHPx / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize="3" fill="#f97316" fontFamily="monospace">{item.variant}</text>
                </g>
              );
            }
            return (
              <g key={item.id} style={{ cursor: "pointer" }} onClick={() => onRemovePiece(item.id)}>
                <polygon points={`${scaffX + widthPx},${y + frameHPx} ${scaffX + widthPx + 10},${y + frameHPx} ${scaffX + widthPx},${y + frameHPx - 10}`}
                  fill="rgba(249,115,22,0.3)" stroke="#f97316" strokeWidth="0.6" />
              </g>
            );
          })}

          {/* Section cut label */}
          <text x={scaffX} y={totalH + 32} fontSize="5" fill="#f97316" fontFamily="monospace" fontWeight="bold">{sectionType}</text>
          <text x={scaffX + widthPx / 2} y={totalH + 42} textAnchor="middle" fontSize="4" fill="#2563eb" fontFamily="monospace">{scaffoldWidthFt}' wide</text>

          {/* Wall offset dimension */}
          {hasWallTrace && (
            <>
              <line
                x1={scaffoldSide === "left" ? scaffX + widthPx : wallDrawX0}
                y1={totalH + 10}
                x2={scaffoldSide === "left" ? wallDrawX0 : scaffX}
                y2={totalH + 10}
                stroke="#f97316" strokeWidth="0.5" />
              <text
                x={((scaffoldSide === "left" ? scaffX + widthPx : wallDrawX0) +
                    (scaffoldSide === "left" ? wallDrawX0 : scaffX)) / 2}
                y={totalH + 18} textAnchor="middle" fontSize="3.6" fill="#f97316" fontFamily="monospace">{wallOffset}' offset</text>
            </>
          )}
        </svg>
      </div>

      {/* Drafting pieces tray */}
      <div className="border-t border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0 space-y-1.5">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-zinc-600 mb-1">Frames — drag onto drawing</p>
          <div className="flex gap-1.5 flex-wrap">
            {FRAME_TYPES.map(f => (
              <div key={f.id} draggable
                onDragStart={() => setDragKind({ kind: "frame", variant: f.label })}
                className="cursor-grab select-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[8px] text-zinc-300 hover:border-orange-500/50">
                {f.label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider text-zinc-600 mb-1">Brackets — drag onto drawing</p>
          <div className="flex gap-1.5 flex-wrap">
            {BRACKET_TYPES.map(b => (
              <div key={b.id} draggable
                onDragStart={() => setDragKind({ kind: "bracket", variant: b.label })}
                className="cursor-grab select-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[8px] text-zinc-300 hover:border-orange-500/50">
                {b.label}
              </div>
            ))}
          </div>
        </div>
        {draftingAdditions.length > 0 && (
          <p className="text-[7.5px] text-zinc-700 italic">Click a placed piece on the drawing to remove it.</p>
        )}
      </div>
    </div>
  );
}

// ── Frame Config Options ──────────────────────────────────────────────────────
// Shows up to 3 real, buildable frame combinations (6'-4"/5'/3' + screw
// jack) that reach the same effective height — never an invented frame
// size. If a wall is short enough that only one sensible combination
// exists, the remaining slot(s) show a plain note instead of padding
// with duplicates.
function FrameConfigOptions({
  effectiveHeightFt, screwJackMaxExtensionIn, scaffoldWidthFt,
}: { effectiveHeightFt: number; screwJackMaxExtensionIn: number; scaffoldWidthFt: number }) {
  const options = useMemo(
    () => findFrameMakeupOptions(effectiveHeightFt, screwJackMaxExtensionIn, 3),
    [effectiveHeightFt, screwJackMaxExtensionIn],
  );
  const labels = ["Optimal", "Alternate B", "Alternate C"];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Frame Configuration Options</p>
      </div>
      <div className="px-3 pt-2 pb-3 space-y-2">
        {labels.map((label, i) => {
          const opt = options[i];
          if (!opt) {
            return (
              <div key={label} className="rounded-xl border border-zinc-800 bg-black p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wider mb-1 text-zinc-600">{label}</p>
                <p className="text-[8px] text-zinc-600 italic">No further recommendations beyond optimal approach</p>
              </div>
            );
          }
          return (
            <div key={label} className={`rounded-xl border p-2.5 ${i === 0 ? "border-orange-500/40 bg-orange-500/5" : "border-zinc-800 bg-black"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${i === 0 ? "text-orange-300" : "text-zinc-400"}`}>{label}</p>
              <div className="space-y-1">
                {opt.pieces.map((p) => (
                  <div key={p.label} className="flex justify-between text-[9px]">
                    <span className="text-zinc-600">{p.label} Frame</span>
                    <span className="font-mono text-zinc-300">× {p.qty}</span>
                  </div>
                ))}
                {opt.screwJackExtensionIn > 0.05 && (
                  <div className="flex justify-between text-[9px]">
                    <span className="text-zinc-600">Screw Jack</span>
                    <span className="font-mono text-zinc-300">{opt.screwJackExtensionIn.toFixed(1)}"</span>
                  </div>
                )}
                <div className="flex justify-between text-[9px]">
                  <span className="text-zinc-600">Total Frames</span>
                  <span className="font-mono text-zinc-300">{opt.frameTall}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-zinc-600">Width</span>
                  <span className="font-mono text-zinc-300">{scaffoldWidthFt}'</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SetScaffoldV2Inner() {
  const [scaffoldWidth,  setScaffoldWidth]  = useState<ScaffoldWidth>("3'");
  const [bayLength,      setBayLength]      = useState("10'");
  const [showOverlay,    setShowOverlay]    = useState(true);
  const [showScaffold,   setShowScaffold]   = useState(true);
  const [editMode,       setEditMode]       = useState(false);
  const [activeMainTab,  setActiveMainTab]  = useState<"overlay" | "section">("overlay");
  const [sectionExpanded, setSectionExpanded] = useState(false);
  const [selectedLegKey, setSelectedLegKey] = useState<string | null>(null);
  const [deletedLegKeys, setDeletedLegKeys] = useState<Set<string>>(new Set());
  const [overriddenFC,   setOverriddenFC]   = useState<Record<string, number>>({});
  const [legOffsets,     setLegOffsets]     = useState<Record<string, { dx: number; dy: number }>>({});
  const [draggedLegKey,  setDraggedLegKey]  = useState<string | null>(null);
  const [viewerZoom,     setViewerZoom]     = useState(1);
  const [viewerPan,      setViewerPan]      = useState({ dx: 0, dy: 0 });
  const [isPanning,      setIsPanning]      = useState(false);
  const [debugSvgClicks, setDebugSvgClicks] = useState(0);
  const [debugTickClicks, setDebugTickClicks] = useState(0);
  const [elevation,      setElevation]      = useState<ProjectElevation | null>(null);
  const [projectName,    setProjectName]    = useState(projectInfo.projectName);
  const [mounted,        setMounted]        = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const frameHeight       = 6.333;
  const workerReachHeight = getBackendSettings()?.scaffold?.workerReachHeight ?? 6;
  const screwJackMaxExtensionIn = getBackendSettings()?.scaffold?.screwJackMaxExtension ?? 12;
  const frameTall         = elevation?.quantityEngine?.frameTall ?? 7;
  const effectiveStackHeightFt = Math.max(0, (elevation?.wallHeight ?? 0) - workerReachHeight);
  const scaffoldWidthFt   = parseFt(scaffoldWidth);
  const bayLengthFt       = parseFt(bayLength) || 10;
  const ppb               = planksPerBay(scaffoldWidth);
  const isAerial = elevation?.overlayGeometry?.fullOverlayRows?.some((r: any) => r.overlayType === "Aerial") ?? false;
  const puf      = elevation?.scale?.pageUnitsPerFoot ?? (isAerial ? 4 : null);
  const scaleOk  = (puf != null && puf > 0) || isAerial;
  const effPuf   = puf ?? 4;

  const rawPoints = useMemo(() => getPrimaryGeometryPoints(elevation), [elevation]);
  const outline   = rawPoints.length >= 3 ? rawPoints : FALLBACK;

  // SVG viewbox
  const svgViewBox = useMemo(() => {
    const pts = outline.filter(isFinitePoint);
    if (pts.length < 2) return { x: 0, y: 0, w: 1200, h: 720 };
    const minX = pts.reduce((m, p) => p.x < m ? p.x : m, Infinity);
    const maxX = pts.reduce((m, p) => p.x > m ? p.x : m, -Infinity);
    const minY = pts.reduce((m, p) => p.y < m ? p.y : m, Infinity);
    const maxY = pts.reduce((m, p) => p.y > m ? p.y : m, -Infinity);
    const pad = effPuf * 10;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [outline, effPuf]);

  // Segment legs with no-orphan rule
  const allSegmentLegs = useMemo(() => {
    if (!scaleOk || !outline.length || effPuf <= 0 || bayLengthFt <= 0) return [];
    return computeLegs(outline, scaffoldWidthFt, bayLengthFt, effPuf);
  }, [outline, scaffoldWidthFt, bayLengthFt, scaleOk, effPuf]);

  // Per-leg frame tall — single source of truth is `frameTall`, the same
  // value driving the 3D model and Frame Config Options (derived from
  // elevation.wallHeight via the real frame-makeup calculation). This
  // used to run its own separate, older calculation from raw elevation
  // height strings, which could drift out of sync with the rest of the
  // app — that's the disconnect that was showing "1" here while the 3D
  // model correctly showed "7". A manual per-leg override (set via the
  // Edit Bay popup) still takes priority when present.
  const getFrameTallForLeg = (segIndex: number, legIndex: number): number => {
    const legKey = `${segIndex}-${legIndex}`;
    if (overriddenFC[legKey]) return overriddenFC[legKey];
    return frameTall;
  };

  // A leg counts as "broken free" from the parallel track once its stored
  // offset has a perpendicular (off-wall) component beyond the same
  // breakout distance used while dragging. Used to hide the cross-brace
  // connecting it to its neighbours — a strut drawn to a leg that's no
  // longer in line with the run wouldn't make physical sense.
  function isLegBrokenFree(segIndex: number, legIndex: number): boolean {
    const off = legOffsets[`${segIndex}-${legIndex}`];
    if (!off) return false;
    const a = outline[segIndex], b = outline[(segIndex + 1) % outline.length];
    if (!a || !b) return false;
    const sdx = b.x - a.x, sdy = b.y - a.y;
    const len = Math.sqrt(sdx * sdx + sdy * sdy);
    if (!len) return false;
    const nx = -sdy / len, ny = sdx / len;
    const perp = off.dx * nx + off.dy * ny;
    return Math.abs(perp) > effPuf * 0.75;
  }

  // Section view — wall outline, scaffold side, hand-placed additions
  const sectionWallOutline = useMemo(() => {
    const outline2 = elevation?.sectionView?.wallOutline;
    return outline2 && outline2.length >= 2 ? (outline2 as PlanPoint[]) : ([] as PlanPoint[]);
  }, [elevation]);
  const scaffoldSide = elevation?.sectionView?.scaffoldSide ?? "left";
  const draftingAdditions = elevation?.sectionView?.draftingAdditions ?? [];
  const manualFrameCount = useMemo(() => draftingAdditions.filter(d => d.kind === "frame").length, [draftingAdditions]);
  const manualBracketCount = useMemo(() => draftingAdditions.filter(d => d.kind === "bracket").length, [draftingAdditions]);

  // Totals — correct plank formula, plus hand-placed additions from Section View
  const totals = useMemo(() => {
    let legs = 0, bays = 0, totalFrames = 0;
    for (const seg of allSegmentLegs) {
      const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
      const active = sl.filter((_, i) => !deletedLegKeys.has(`${seg.segIndex}-${i}`));
      legs += active.length;
      if (active.length > 1) bays += active.length - 1;
      active.forEach((_, i) => {
        const k = `${seg.segIndex}-${i}`;
        totalFrames += overriddenFC[k] ?? getFrameTallForLeg(seg.segIndex, i);
      });
    }
    // Planks = bays × planksPerBay × frameTall (levels)
    const planks = bays * ppb * frameTall;
    return {
      legs, bays,
      frames: totalFrames + manualFrameCount,
      brackets: manualBracketCount,
      planks,
    };
  }, [allSegmentLegs, frameTall, ppb, deletedLegKeys, overriddenFC, elevation, manualFrameCount, manualBracketCount]);

  // Live frame height for the 3D model — average frames-per-leg from the
  // current totals (which include per-tick overrides and deletions), so
  // edit-mode changes visibly change the 3D model, not just the numbers.
  const liveFrameTall = useMemo(() => {
    if (totals.legs <= 0) return frameTall;
    return Math.max(1, Math.round((totals.frames - manualFrameCount) / totals.legs));
  }, [totals, frameTall, manualFrameCount]);

  // Overlay rows
  const rawOverlayRows = useMemo(() => {
    const g = elevation?.overlayGeometry; if (!g) return [];
    return (g.fullOverlayRows || []).filter((r: any) => r.points?.length >= 2).map((r: any, i: number) => ({
      id: r.id ?? i, level: r.level, isKeyFloor: Boolean(r.isKeyFloor),
      closed: Boolean(r.closed), color: r.color || (i === 0 ? "#2563eb" : "#22c55e"),
      points: r.points.filter(isFinitePoint),
    })).filter((r: any) => r.points.length >= 2);
  }, [elevation]);

  useEffect(() => {
    function load() {
      try {
        const e = getActiveElevation(), p = getActiveProject();
        setElevation(e); setProjectName(p.projectName || projectInfo.projectName);
        setScaffoldWidth(e.scaffoldInput.scaffoldWidth >= 5 ? "5'" : e.scaffoldInput.scaffoldWidth >= 3.5 ? "3'-6\"" : "3'");
        setBayLength(`${e.scaffoldInput.standardBayLength}'`);
      } catch {}
      setMounted(true);
    }
    load();
    window.addEventListener("focus", load); window.addEventListener("pageshow", load);
    return () => { window.removeEventListener("focus", load); window.removeEventListener("pageshow", load); };
  }, []);

  // Load Didact Gothic for the tick-number labels — closest available
  // web font to AutoCAD's RomanS drafting style (thin, monoline, no
  // serifs). This is a self-contained injection since this component
  // doesn't have access to the app's central font setup (layout.tsx) —
  // if that setup is ever touched directly, this can be replaced with a
  // proper next/font/google import there instead.
  useEffect(() => {
    if (document.getElementById("didact-gothic-font")) return;
    const link = document.createElement("link");
    link.id = "didact-gothic-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Didact+Gothic&display=swap";
    document.head.appendChild(link);
  }, []);

  // ── Native pointer events on the Overlay SVG ───────────────────────────
  // React's synthetic events provably never fire on this SVG in the user's
  // environment (verified with on-screen counters: HTML buttons work, but
  // clicks anywhere on the SVG — background or ticks — register zero).
  // So these listeners attach directly to the DOM node and do their own
  // hit-testing.
  //
  // CRITICAL: every value the handlers need is read through a ref, and the
  // dependency array is kept minimal. Previously `legOffsets` (which
  // changes on every single mouse-move) was a dependency — so each move
  // tore down and re-attached the listeners, wiping the local
  // `draggingKey` variable and killing the drag after one tiny nudge.
  // That was the "moves in small increments/notches" bug: not slowness,
  // but the drag being destroyed and restarted constantly.
  const dragStateRef = useRef<{
    draggingKey: string | null;
    panning: boolean;
    lastPos: { x: number; y: number } | null;
  }>({ draggingKey: null, panning: false, lastPos: null });
  const liveRef = useRef({ editMode, allSegmentLegs, deletedLegKeys, legOffsets, effPuf, scaffoldWidthFt, outline });
  liveRef.current = { editMode, allSegmentLegs, deletedLegKeys, legOffsets, effPuf, scaffoldWidthFt, outline };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || activeMainTab !== "overlay") return;

    function toViewBox(e: PointerEvent) {
      const r = svg!.getBoundingClientRect();
      const vb = svg!.viewBox.baseVal;
      const scale = Math.min(r.width / vb.width, r.height / vb.height);
      const offX = (r.width - vb.width * scale) / 2;
      const offY = (r.height - vb.height * scale) / 2;
      return {
        x: vb.x + (e.clientX - r.left - offX) / scale,
        y: vb.y + (e.clientY - r.top - offY) / scale,
      };
    }

    function findNearestLeg(pt: { x: number; y: number }): string | null {
      const { allSegmentLegs: segs, deletedLegKeys: dels, legOffsets: offs, effPuf: puf, scaffoldWidthFt: wft } = liveRef.current;
      const hitRadius = Math.max(wft * puf * 0.9, puf * 2);
      let best: string | null = null;
      let bestDist = hitRadius;
      for (const seg of segs) {
        const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
        sl.forEach((leg, i) => {
          const k = `${seg.segIndex}-${i}`;
          if (dels.has(k)) return;
          const off = offs[k] ?? { dx: 0, dy: 0 };
          const mx = (leg.wallPoint.x + leg.tickTip.x) / 2 + off.dx;
          const my = (leg.wallPoint.y + leg.tickTip.y) / 2 + off.dy;
          const d = Math.sqrt((pt.x - mx) ** 2 + (pt.y - my) ** 2);
          if (d < bestDist) { bestDist = d; best = k; }
        });
      }
      return best;
    }

    function onPointerDown(e: PointerEvent) {
      setDebugSvgClicks(n => n + 1);
      const pt = toViewBox(e);
      dragStateRef.current.lastPos = { x: pt.x, y: pt.y };
      if (liveRef.current.editMode) {
        const hit = findNearestLeg(pt);
        if (hit) {
          setDebugTickClicks(n => n + 1);
          setSelectedLegKey(hit);
          dragStateRef.current.draggingKey = hit;
          setDraggedLegKey(hit);
          e.preventDefault();
          // Capture the pointer so the drag keeps tracking even if the
          // cursor briefly leaves the SVG bounds mid-drag.
          try { svg!.setPointerCapture(e.pointerId); } catch {}
        } else {
          setSelectedLegKey(null);
        }
      } else {
        dragStateRef.current.panning = true;
        setIsPanning(true);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st.draggingKey && !st.panning) return;
      // Track absolute position in viewBox space (continuous, full
      // precision) rather than the browser's movementX/movementY, which
      // report in whole rounded screen pixels and quantize badly at zoom.
      const pt = toViewBox(e);
      if (!st.lastPos) { st.lastPos = { x: pt.x, y: pt.y }; return; }
      const deltaX = pt.x - st.lastPos.x;
      const deltaY = pt.y - st.lastPos.y;
      st.lastPos = { x: pt.x, y: pt.y };
      if (st.draggingKey) {
        const k = st.draggingKey;
        setLegOffsets(p => {
          const rawDx = (p[k]?.dx ?? 0) + deltaX;
          const rawDy = (p[k]?.dy ?? 0) + deltaY;
          // Parallel lock: decompose the offset into "along the wall run"
          // and "perpendicular to it". Movement along the wall stays fully
          // free; the perpendicular component is held at zero (keeping the
          // tick in line with its neighbours) until the user deliberately
          // pulls beyond the breakout distance, at which point it moves
          // freely in any direction.
          const { outline: ol, effPuf: puf } = liveRef.current;
          const si = Number(k.split("-")[0]);
          const a = ol[si], b = ol[(si + 1) % ol.length];
          if (!a || !b) return { ...p, [k]: { dx: rawDx, dy: rawDy } };
          const sdx = b.x - a.x, sdy = b.y - a.y;
          const len = Math.sqrt(sdx * sdx + sdy * sdy);
          if (!len) return { ...p, [k]: { dx: rawDx, dy: rawDy } };
          const ax = sdx / len, ay = sdy / len;   // along the wall
          const nx = -ay, ny = ax;                 // perpendicular to it
          const along = rawDx * ax + rawDy * ay;
          const perp = rawDx * nx + rawDy * ny;
          const breakout = puf * 0.75;              // ~9" before it frees — quicker release
          const usedPerp = Math.abs(perp) > breakout ? perp : 0;
          return { ...p, [k]: { dx: ax * along + nx * usedPerp, dy: ay * along + ny * usedPerp } };
        });
      } else if (st.panning) {
        setViewerPan(p => ({ dx: p.dx - deltaX, dy: p.dy - deltaY }));
      }
    }

    function onPointerUp(e: PointerEvent) {
      const st = dragStateRef.current;
      if (st.draggingKey) { try { svg!.releasePointerCapture(e.pointerId); } catch {} }
      st.draggingKey = null;
      st.panning = false;
      st.lastPos = null;
      setDraggedLegKey(null);
      setIsPanning(false);
    }

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeMainTab, mounted]);

  // Live dimension readout while dragging a tick — measures from the
  // dragged leg to its immediate neighbours in the same wall run, in feet,
  // updating in real time as it moves.
  const dragDimensions = useMemo(() => {
    if (!draggedLegKey || effPuf <= 0) return null;
    const [si, li] = draggedLegKey.split("-").map(Number);
    const seg = allSegmentLegs.find(s => s.segIndex === si);
    if (!seg) return null;
    const sl = seg.legs.filter(l => !l.isTurnaroundMirror);
    const posOf = (idx: number) => {
      const leg = sl[idx];
      if (!leg) return null;
      const k = `${si}-${idx}`;
      if (deletedLegKeys.has(k)) return null;
      const off = legOffsets[k] ?? { dx: 0, dy: 0 };
      return { x: (leg.wallPoint.x + leg.tickTip.x) / 2 + off.dx, y: (leg.wallPoint.y + leg.tickTip.y) / 2 + off.dy };
    };
    const self = posOf(li);
    if (!self) return null;
    const out: { a: PlanPoint; b: PlanPoint; feet: number }[] = [];
    for (const nIdx of [li - 1, li + 1]) {
      const nb = posOf(nIdx);
      if (!nb) continue;
      const dist = Math.sqrt((nb.x - self.x) ** 2 + (nb.y - self.y) ** 2) / effPuf;
      out.push({ a: self, b: nb, feet: dist });
    }
    return out.length ? out : null;
  }, [draggedLegKey, allSegmentLegs, legOffsets, deletedLegKeys, effPuf]);

  function saveConfig(updates: Partial<ScaffoldInput>) {
    const cur = elevation ?? getActiveElevation();
    const si = { ...cur.scaffoldInput, ...updates };
    const qe = calculateQuantityEngine({ linearFeet: cur.linearFeet, wallHeight: cur.wallHeight, ...si, workerReachHeight });
    const next = { ...cur, scaffoldInput: si, quantityEngine: qe };
    setElevation(next); saveActiveElevation(next);
  }

  function handleToggleScaffoldSide(side: "left" | "right") {
    saveSectionView({ scaffoldSide: side });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, scaffoldSide: side } } : cur);
  }

  function handleDropDraftingPiece(kind: "frame" | "bracket", variant: string, level: number) {
    const item: SectionDraftingItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, variant, level };
    const next = [...draftingAdditions, item];
    saveSectionView({ draftingAdditions: next });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, draftingAdditions: next } } : cur);
  }

  function handleRemoveDraftingPiece(id: string) {
    const next = draftingAdditions.filter(d => d.id !== id);
    saveSectionView({ draftingAdditions: next });
    setElevation(cur => cur ? { ...cur, sectionView: { ...cur.sectionView, draftingAdditions: next } } : cur);
  }

  const sectionType = elevation?.sectionView?.sectionType ?? "A-A";
  const wallOffset = elevation?.sectionView?.wallOffset ?? 1;

  return (
    <main className="h-screen flex flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Set Scaffold"
        subtitle="Overlay · 3D Model · Section View"
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={projectName} />
            <KorbanHeaderMeta label="Job No." value={projectInfo.jobNumber} />
            <KorbanButton as="a" href="/takeoff-workspace-advanced" variant="ghost">← Takeoff</KorbanButton>
            <KorbanButton as="a" href="/project-plan-desk" variant="ghost">Project Plan Desk</KorbanButton>
            <KorbanButton as="a" href="/estimate-review" variant="primary">Estimate Review →</KorbanButton>
          </>
        }
      />

      {/* Layout: left main column holds the Overlay/Section tabs; right
          column holds the 3D model, mounted ONCE and never unmounted —
          it stays visible and rotating at all times. (Previously the 3D
          view was its own tab, which unmounted/remounted it on every
          tab switch — each remount creates a fresh WebGL context, and
          that churn matches the freeze pattern we kept hitting.) */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden border-r border-zinc-900">
          <div className="flex items-end gap-1 border-b border-zinc-900 bg-[#0b0b0b] px-6 pt-2 flex-shrink-0">
            {([
              { id: "overlay", label: "Overlay / Takeoff", icon: "⊞" },
              { id: "section", label: "Section View", icon: "✂" },
            ] as { id: typeof activeMainTab; label: string; icon: string }[]).map(tab => {
              const active = activeMainTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveMainTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-t-lg border border-b-0 px-6 pt-2.5 pb-3 text-[11px] font-bold uppercase tracking-[0.15em] transition ${active ? "text-white border-zinc-700" : "text-zinc-600 hover:text-zinc-400 border-zinc-800"}`}
                  style={{ background: active ? "#1a1a1a" : "#0b0b0b" }}>
                  <span>{tab.icon}</span>{tab.label}
                  {active && (
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-full bg-white/80 shadow-[0_0_4px_1px_rgba(255,255,255,0.35)]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 overflow-hidden">

        {/* ── Tab: Overlay / Takeoff ──────────────────────────────────── */}
        {activeMainTab === "overlay" && (
        <section className="flex w-full overflow-hidden">
          {/* Main drawing area */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Floor Plan · Scaffold Layout</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowOverlay(c => !c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showOverlay ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-zinc-800 text-zinc-600"}`}>Overlay</button>
                <button onClick={() => setShowScaffold(c => !c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showScaffold ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-600"}`}>Scaffold</button>
                <button onClick={() => setEditMode(m => !m)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${editMode ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>{editMode ? "✓ Editing" : "Edit Bay"}</button>
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewerZoom(z => Math.max(0.2, z - 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">−</button>
                  <span className="text-[9px] font-mono text-zinc-600 w-9 text-center">{Math.round(viewerZoom * 100)}%</span>
                  <button onClick={() => setViewerZoom(z => Math.min(4, z + 0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
                  <button onClick={() => { setViewerZoom(1); setViewerPan({ dx: 0, dy: 0 }); }} className="rounded border border-zinc-800 px-2 h-6 text-[9px] text-zinc-500 hover:text-white">Fit</button>
                </div>
              </div>
            </div>

            {/* SVG canvas */}
            <div className="flex-1 relative overflow-hidden bg-black">
              {mounted && !scaleOk && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">⚠ Scale Not Set</p>
                  <p className="mt-2 text-xs text-zinc-500 max-w-xs">Set scale in Takeoff Workspace first.</p>
                  <a href="/takeoff-workspace-advanced" className="mt-4 inline-block rounded-xl bg-yellow-400 px-5 py-2 text-xs font-bold text-black">Go to Takeoff →</a>
                </div>
              </div>
            )}
            {/* TEMPORARY DEBUG BADGE — shows click counts directly on screen, no console needed. Safe to remove once the click bug is resolved. */}
            <div className="absolute top-2 right-2 z-40 rounded-lg border border-yellow-500/50 bg-black/90 px-3 py-2 text-[10px] font-mono pointer-events-none">
              <p className="text-yellow-300 font-bold">DEBUG</p>
              <p className="text-zinc-300">SVG background clicks: <span className="text-white font-bold">{debugSvgClicks}</span></p>
              <p className="text-zinc-300">Tick clicks: <span className="text-white font-bold">{debugTickClicks}</span></p>
            </div>
            {/* Decorative grid — MUST be pointer-events-none: it's absolutely
                positioned, which paints it ABOVE the static-flow svg per CSS
                stacking rules. Without this, it invisibly covers the whole
                canvas and swallows every click before the svg can see it —
                which is exactly the "zero clicks register anywhere" bug. */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />
            <svg ref={svgRef} className="relative z-10 h-full w-full"
              viewBox={`${svgViewBox.x + (svgViewBox.w * (1 - 1 / viewerZoom)) / 2 + viewerPan.dx} ${svgViewBox.y + (svgViewBox.h * (1 - 1 / viewerZoom)) / 2 + viewerPan.dy} ${svgViewBox.w / viewerZoom} ${svgViewBox.h / viewerZoom}`}
              style={{
                cursor: isPanning
                  ? "grabbing"
                  : editMode
                    // Orange crosshair — signals the mouse is a design tool
                    // right now, not a plain pointer.
                    ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg stroke='%23f97316' stroke-width='2'%3E%3Cline x1='12' y1='1' x2='12' y2='9'/%3E%3Cline x1='12' y1='15' x2='12' y2='23'/%3E%3Cline x1='1' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='23' y2='12'/%3E%3C/g%3E%3Ccircle cx='12' cy='12' r='1.5' fill='%23f97316'/%3E%3C/svg%3E") 12 12, crosshair`
                    : "grab",
              }}>

              {/* Overlay */}
              {showOverlay && (rawOverlayRows.length > 0 ? (
                <g>
                  {rawOverlayRows.map((r: any, i: number) => (
                    <path key={i}
                      d={`M${r.points[0]?.x} ${r.points[0]?.y} ${r.points.slice(1).map((p: any) => `L${p.x} ${p.y}`).join(" ")}${r.closed ? " Z" : ""}`}
                      fill="transparent" stroke={r.isKeyFloor ? "#2563eb" : r.color} strokeWidth={r.isKeyFloor ? "1" : "0.7"} />
                  ))}
                </g>
              ) : (
                <g>
                  <path d="M160 120 L880 120 L880 300 L700 300 L700 480 L880 480 L880 600 L160 600 Z"
                    fill="rgba(37,99,235,0.06)" stroke="#2563eb" strokeWidth="1.2" />
                  <path d="M172 132 L868 132 L868 312 L712 312 L712 468 L868 468 L868 588 L172 588 Z"
                    fill="transparent" stroke="#22c55e" strokeWidth="0.8" opacity="0.8" />
                </g>
              ))}

              {/* Scaffold ticks */}
              {showScaffold && scaleOk && allSegmentLegs.map(({ segIndex, legs }) => {
                const segStart = outline[segIndex], segEnd = outline[(segIndex + 1) % outline.length];
                if (!segStart || !segEnd) return null;
                const normal = computeOutwardNormal(segStart, segEnd, outline);
                const dx = segEnd.x - segStart.x, dy = segEnd.y - segStart.y, len = Math.sqrt(dx * dx + dy * dy);
                const wg = 1 * effPuf, tl = scaffoldWidthFt * effPuf;
                const sl = legs.filter(l => !l.isTurnaroundMirror);

                return (
                  <g key={`seg-${segIndex}`} fill="#f8fafc" stroke="#f8fafc" strokeLinecap="square" opacity="0.9">
                    {/* Cross braces — skipped if either connected leg has
                        broken free from the parallel track (see
                        isLegBrokenFree above) */}
                    {sl.slice(0, -1).map((leg, i) => {
                      const next = sl[i + 1]; if (!next) return null;
                      if (isLegBrokenFree(segIndex, i) || isLegBrokenFree(segIndex, i + 1)) return null;
                      const o1 = legOffsets[`${segIndex}-${i}`] ?? { dx: 0, dy: 0 };
                      const o2 = legOffsets[`${segIndex}-${i + 1}`] ?? { dx: 0, dy: 0 };
                      const cx = (leg.wallPoint.x + o1.dx + next.wallPoint.x + o2.dx) / 2;
                      const cy = (leg.wallPoint.y + o1.dy + next.wallPoint.y + o2.dy) / 2;
                      const bp = Math.sqrt((next.wallPoint.x - leg.wallPoint.x) ** 2 + (next.wallPoint.y - leg.wallPoint.y) ** 2);
                      const hb = bp * 0.3, al = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
                      return (
                        <line key={`brace-${i}`}
                          x1={cx - al.x * hb + normal.x * wg * 0.5} y1={cy - al.y * hb + normal.y * wg * 0.5}
                          x2={cx + al.x * hb + normal.x * (wg + tl) * 0.9} y2={cy + al.y * hb + normal.y * (wg + tl) * 0.9}
                          strokeWidth="0.7" opacity="0.5" />
                      );
                    })}
                    {/* Tick lines — legs are already filtered by computeLegs (with the corner exemption above); no need to re-filter here */}
                    {sl.map((leg, i) => {
                      const k = `${segIndex}-${i}`;
                      if (deletedLegKeys.has(k)) return null;
                      if (!isFiniteNumber(leg.wallPoint.x)) return null;
                      const sel = selectedLegKey === k;
                      const ft = overriddenFC[k] ?? getFrameTallForLeg(segIndex, i);
                      const off = legOffsets[k] ?? { dx: 0, dy: 0 };
                      const wp = { x: leg.wallPoint.x + off.dx, y: leg.wallPoint.y + off.dy };
                      const tp = { x: leg.tickTip.x + off.dx, y: leg.tickTip.y + off.dy };
                      const lp = { x: leg.labelPoint.x + off.dx, y: leg.labelPoint.y + off.dy };
                      return (
                        <g key={k}>
                          {editMode && <circle cx={(wp.x + tp.x) / 2} cy={(wp.y + tp.y) / 2} r={tl * 0.55}
                            fill={sel ? "rgba(249,115,22,0.18)" : "rgba(249,115,22,0.04)"}
                            stroke={sel ? "#f97316" : "rgba(249,115,22,0.25)"}
                            strokeWidth={sel ? "1.5" : "0.7"} strokeDasharray={sel ? "none" : "3,2"} />}
                          <line x1={wp.x} y1={wp.y} x2={tp.x} y2={tp.y}
                            strokeWidth={sel ? "2.5" : "1.8"} stroke={sel ? "#f97316" : "#f8fafc"} />
                          <text x={lp.x} y={lp.y}
                            opacity="0.9" textAnchor="middle" dominantBaseline="middle"
                            fill={sel ? "#f97316" : "#f8fafc"}
                            style={{
                              cursor: editMode ? "pointer" : "default",
                              fontSize: Math.max(tl * 0.5, 6.25),
                              fontFamily: "'Didact Gothic', var(--font-fira-code), ui-monospace, sans-serif",
                              fontWeight: 400,
                            }}>{ft}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Live dimension guides while dragging a tick — dashed lines
                  to each adjacent leg for visual reference. The actual
                  measurements render in the HTML popup below at a fixed,
                  always-readable size (in-SVG text scaled with the drawing
                  and became unreadable when zoomed out). */}
              {dragDimensions?.map((d, i) => (
                <g key={`dim-${i}`} pointerEvents="none">
                  <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y}
                    stroke="#f97316" strokeWidth={effPuf * 0.09} strokeDasharray={`${effPuf * 0.4},${effPuf * 0.25}`} opacity="0.95" />
                  <circle cx={d.b.x} cy={d.b.y} r={effPuf * 0.18} fill="#f97316" opacity="0.9" />
                </g>
              ))}

              {/* Edit popup */}
            </svg>

            {/* Edit popup — HTML overlay with real HTML buttons. The old
                version drew this inside the SVG with SVG onClick handlers,
                which provably never fire in this environment (HTML buttons
                do — verified with the debug counters). Positioned by
                converting the selected tick's viewBox coords to container
                pixels with the same letterbox-aware transform the native
                hit-testing uses. */}
            {editMode && selectedLegKey && (() => {
              const [si, li] = selectedLegKey.split("-").map(Number);
              const seg = allSegmentLegs.find(s => s.segIndex === si);
              const legs = seg?.legs.filter(l => !l.isTurnaroundMirror) ?? [];
              const leg = legs[li]; if (!leg) return null;
              const svg = svgRef.current; if (!svg) return null;
              const off = legOffsets[selectedLegKey] ?? { dx: 0, dy: 0 };
              const vb = svg.viewBox.baseVal;
              const r = svg.getBoundingClientRect();
              const host = svg.parentElement?.getBoundingClientRect() ?? r;
              const scale = Math.min(r.width / vb.width, r.height / vb.height);
              const offX = (r.width - vb.width * scale) / 2 + (r.left - host.left);
              const offY = (r.height - vb.height * scale) / 2 + (r.top - host.top);
              const px = (leg.tickTip.x + off.dx - vb.x) * scale + offX;
              const py = (leg.tickTip.y + off.dy - vb.y) * scale + offY;
              const fc = overriddenFC[selectedLegKey] ?? frameTall;
              return (
                <div className="absolute z-40 flex flex-col items-center gap-0.5"
                  style={{ left: Math.max(4, Math.min(px - 40, (host.width || 300) - 84)), top: py + 30 }}>
                  {/* Slim pill — neutral outline, bright orange only on the remove icon */}
                  <div className="flex items-center justify-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 min-w-[76px]">
                    <button onClick={() => setOverriddenFC(p => ({ ...p, [selectedLegKey]: Math.max(1, (p[selectedLegKey] ?? frameTall) - 1) }))}
                      className="flex items-center justify-center text-zinc-400 hover:text-white">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="text-[11px] font-mono font-bold text-zinc-100 min-w-[14px] text-center">{fc}</span>
                    <button onClick={() => setOverriddenFC(p => ({ ...p, [selectedLegKey]: (p[selectedLegKey] ?? frameTall) + 1 }))}
                      className="flex items-center justify-center text-zinc-400 hover:text-white">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                    <span className="w-px h-3 bg-zinc-700 mx-0.5" />
                    <button onClick={() => { setDeletedLegKeys(p => { const n = new Set(p); n.add(selectedLegKey); return n; }); setSelectedLegKey(null); }}
                      className="flex items-center justify-center text-orange-500 hover:text-orange-400">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {/* Live spacing readout while dragging — matches the pill's
                      width exactly, soft/light orange text, small enough to
                      always fit within that width */}
                  {dragDimensions && dragDimensions.length > 0 && (
                    <div className="flex items-center justify-center gap-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 min-w-[76px]">
                      {dragDimensions.map((d, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="w-px h-2 bg-zinc-700" />}
                          <span className="text-[7px] font-mono font-bold text-orange-300 whitespace-nowrap">
                            {Math.floor(d.feet)}'-{Math.round((d.feet % 1) * 12)}"
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          </div>

          {/* Right sidebar — configuration + stats, out of the way of the drawing */}
          <div className="flex flex-col border-l border-zinc-900 bg-[#0a0a0a] flex-shrink-0 overflow-y-auto" style={{ width: "220px" }}>
            <div className="border-b border-zinc-900 px-3 py-2 flex-shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Configuration</p>
            </div>
            <div className="px-3 py-3 space-y-3 border-b border-zinc-900">
              <div>
                <label className="text-[9px] text-zinc-600 block mb-1">Width</label>
                <select value={scaffoldWidth} onChange={e => { setScaffoldWidth(e.target.value as ScaffoldWidth); saveConfig({ scaffoldWidth: parseFt(e.target.value) }); }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none">
                  <option>3'</option><option>3'-6"</option><option>5'</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-zinc-600 block mb-1">Bay Length</label>
                <input value={bayLength} onChange={e => { setBayLength(e.target.value); saveConfig({ standardBayLength: parseFt(e.target.value) || 10 }); }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none" />
              </div>
              <div className="text-[9px] text-zinc-600 pt-1">
                {scaleOk ? <span className="text-emerald-400">⊠ Scale set</span> : <span className="text-yellow-600">⚠ No scale</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="border-b border-zinc-900 px-3 py-2 flex-shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Project Data</p>
            </div>
            <div className="px-3 py-3 space-y-2">
              {[["Frames", totals.frames], ["Planks", totals.planks], ["Bays", totals.bays], ["Legs", totals.legs]].map(([l, v]) => (
                <div key={l as string} className="flex items-center justify-between rounded-lg border border-orange-500/25 bg-orange-500/5 px-2.5 py-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-orange-700">{l}</span>
                  <span className="font-mono text-sm font-bold text-orange-300">{Number(v).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ── Tab: Section View & Frame Configuration ──────────────────── */}
        {activeMainTab === "section" && (
        <section className="flex w-full overflow-hidden">
          <div className="flex flex-col overflow-hidden border-r border-zinc-900" style={{ width: sectionExpanded ? "75%" : "33.33%", transition: "width 0.2s ease" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Section View</p>
            </div>
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              <SectionViewPanel
                wallOutline={sectionWallOutline}
                wallOffset={wallOffset}
                frameTall={frameTall}
                scaffoldWidthFt={scaffoldWidthFt}
                scaffoldSide={scaffoldSide}
                draftingAdditions={draftingAdditions}
                onDropPiece={handleDropDraftingPiece}
                onRemovePiece={handleRemoveDraftingPiece}
                onToggleSide={handleToggleScaffoldSide}
                sectionType={sectionType}
                isExpanded={sectionExpanded}
                onToggleExpand={() => setSectionExpanded(v => !v)}
              />
            </div>
          </div>

          <div className="flex flex-col overflow-y-auto border-r border-zinc-900" style={{ width: sectionExpanded ? "12.5%" : "33.33%", transition: "width 0.2s ease" }}>
            <FrameConfigOptions effectiveHeightFt={effectiveStackHeightFt} screwJackMaxExtensionIn={screwJackMaxExtensionIn} scaffoldWidthFt={scaffoldWidthFt} />
          </div>

          {/* Materials used at this section only — not the full project count.
              For the whole project's material list, use the button below. */}
          <div className="flex flex-col overflow-y-auto" style={{ width: sectionExpanded ? "12.5%" : "33.33%", transition: "width 0.2s ease" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Materials at This Section</p>
            </div>
            <div className="px-3 pt-2 pb-3 space-y-1.5">
              {(elevation?.quantityEngine?.frameMakeup ?? []).map(p => {
                const partNo = p.label === "6'-4\"" ? "FO6L3" : p.label === "5'-0\"" ? "FO5L3" : "FM33";
                return (
                  <div key={p.label} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
                    <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">{partNo}</span>
                    <span className="text-[9px] text-zinc-500 flex-1 truncate">{p.label} H Frame</span>
                    <span className="font-mono text-[10px] font-bold text-orange-300">× {p.qty}</span>
                  </div>
                );
              })}
              {manualFrameCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/25 bg-orange-500/5 px-2 py-1.5">
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">FRM-A</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">Added Frames (manual)</span>
                  <span className="font-mono text-[10px] font-bold text-orange-300">× {manualFrameCount}</span>
                </div>
              )}
              {manualBracketCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/25 bg-orange-500/5 px-2 py-1.5">
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">BRKT</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">Wall Bracket (Added)</span>
                  <span className="font-mono text-[10px] font-bold text-orange-300">× {manualBracketCount}</span>
                </div>
              )}
            </div>
            <div className="px-3 pb-3 mt-auto">
              <a href="/inventory/load-list" className="block w-full text-center rounded-xl border border-zinc-800 py-2 text-[10px] font-bold text-orange-400 hover:border-orange-500/40 hover:text-orange-300 transition">
                Full Project Load List →
              </a>
            </div>
          </div>
        </section>
        )}
          </div>
        </div>

        {/* ── Persistent right column — 3D model, always mounted & rotating,
              with the Total Project Material List beneath it ─────────── */}
        <div className="flex flex-col flex-shrink-0 overflow-hidden" style={{ width: "30%" }}>
          <div className="flex flex-col flex-shrink-0" style={{ height: "55%" }}>
            <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">3D Scaffold Model</p>
            </div>
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {mounted && (
                <ScaffoldModel3D
                  outline={outline}
                  puf={effPuf}
                  bayFt={bayLengthFt}
                  widthFt={scaffoldWidthFt}
                  frameTall={liveFrameTall}
                  scaffoldWidthFt={scaffoldWidthFt}
                />
              )}
            </div>
          </div>

          {/* Clear separation between the 3D view and the material list */}
          <div className="border-t-4 border-zinc-900 flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Total Project Material List</p>
              <a href="/inventory/load-list" className="text-[9px] text-orange-400 hover:text-orange-300">Full Load List →</a>
            </div>
            <div className="px-4 pb-4 space-y-1">
              {[
                { partNo: "FO6L3",  description: "6'-4\" H Frame",    qty: totals.frames },
                { partNo: "WP10",   description: "10' Wood Plank",    qty: totals.planks },
                { partNo: "B82",    description: "8×2 Cross Brace",   qty: totals.bays   },
                { partNo: "GR8",    description: "8' Guard Rail",     qty: totals.bays   },
                { partNo: "BP1",    description: "Fixed Base Plate",  qty: totals.legs   },
                { partNo: "AL1S",   description: "Screw Jack w/Base", qty: totals.legs   },
                { partNo: "CPS",    description: "Coupling Pin",      qty: totals.legs * 2 },
                { partNo: "BRKT",   description: "Wall Bracket (Added)", qty: totals.brackets },
              ].map(item => (
                <div key={item.partNo} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition ${item.qty > 0 ? "border-orange-500/25 bg-orange-500/5" : "border-zinc-900 bg-black"}`}>
                  <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">{item.partNo}</span>
                  <span className="text-[9px] text-zinc-500 flex-1 truncate">{item.description}</span>
                  <span className={`font-mono text-[10px] font-bold ${item.qty > 0 ? "text-orange-300" : "text-zinc-700"}`}>
                    {item.qty > 0 ? item.qty.toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
