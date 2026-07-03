"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  KorbanButton,
  KorbanHeader,
  KorbanHeaderMeta,
  type KorbanMenuLink,
} from "@/components/korban";
import {
  calculateQuantityEngine,
  getActiveElevation,
  getActiveProject,
  saveActiveElevation,
  type ProjectElevation,
  type ScaffoldInput,
} from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type PlanPoint = { x: number; y: number };
type ScaffoldWidth = "3'" | "3'-6\"" | "5'";
type PlankType = "Wood" | "Aluminum" | "Steel";
type LegResult = {
  wallPoint: PlanPoint; tickTip: PlanPoint; labelPoint: PlanPoint;
  isTurnaroundMirror: boolean; isStartLeg: boolean; isEndLeg: boolean;
};

const projectInfo = { projectName: "Mare Island Apartments", jobNumber: "KRB-260614-001", reference: "Main Level Reference Point A-1" };

const scaffoldMenuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk",          label: "Project Plan Desk" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/frame-configuration",        label: "Frame Config" },
  { href: "/estimate-review",            label: "Estimate Review" },
];

// ── Utility ───────────────────────────────────────────────────────────────────
function parseFeetValue(v: string): number { const n = parseFloat(v.replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
function isFiniteNumber(v: number) { return Number.isFinite(v); }
function isFinitePoint(p: PlanPoint) { return isFiniteNumber(p.x) && isFiniteNumber(p.y); }
function signedArea(pts: PlanPoint[]): number { let a = 0; for (let i=0;i<pts.length;i++){const j=(i+1)%pts.length;a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;} return a/2; }
function pointInPolygon(pt: PlanPoint, poly: PlanPoint[]): boolean { let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;if(((yi>pt.y)!==(yj>pt.y))&&(pt.x<(xj-xi)*(pt.y-yi)/(yj-yi)+xi))inside=!inside;} return inside; }
function computeOutwardNormal(a: PlanPoint, b: PlanPoint, poly: PlanPoint[]): PlanPoint {
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy); if(!len) return {x:0,y:-1};
  const n1={x:dy/len,y:-dx/len},n2={x:-dy/len,y:dx/len};
  const area=signedArea(poly); const candidate=area>0?n2:n1,opp=area>0?n1:n2;
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,td=Math.max(len*0.05,2);
  return pointInPolygon({x:mx+candidate.x*td,y:my+candidate.y*td},poly)?opp:candidate;
}
function getPrimaryGeometryPoints(elev: ProjectElevation|null): PlanPoint[] {
  const g=elev?.overlayGeometry; if(!g) return [];
  if(g.tracedPerimeter.length>=3) return g.tracedPerimeter;
  if(g.overlayPoints.length>=3) return g.overlayPoints;
  const kf=g.fullOverlayRows.find(r=>r.isKeyFloor&&r.points.length>=3);
  if(kf) return kf.points;
  const ff=g.fullOverlayRows.find(r=>r.points.length>=3);
  if(ff) return ff.points;
  return [];
}

const FALLBACK_OUTLINE: PlanPoint[] = [
  {x:160,y:120},{x:880,y:120},{x:880,y:300},{x:700,y:300},
  {x:700,y:480},{x:880,y:480},{x:880,y:600},{x:160,y:600},
];

function computeLegs(outline: PlanPoint[], widthFt: number, bayFt: number, puf: number): {segIndex:number;legs:LegResult[]}[] {
  const results: {segIndex:number;legs:LegResult[]}[] = [];
  for (let i=0;i<outline.length;i++) {
    const start=outline[i], end=outline[(i+1)%outline.length];
    const dx=end.x-start.x, dy=end.y-start.y;
    const segLen=Math.sqrt(dx*dx+dy*dy); if(segLen<=0||puf<=0||bayFt<=0) {results.push({segIndex:i,legs:[]});continue;}
    const along={x:dx/segLen,y:dy/segLen};
    const normal=computeOutwardNormal(start,end,outline);
    const bayPx=bayFt*puf, wallGap=1*puf, tickLen=widthFt*puf, labelOff=wallGap+tickLen+puf*0.6;
    const cornerOff=(widthFt+1)*puf;
    const legs:LegResult[]=[]; let cursor=-cornerOff, limit=0;
    legs.push(makeLeg(start,along,normal,cursor,wallGap,tickLen,labelOff,false,true,false));
    cursor+=bayPx;
    while(cursor<segLen-puf*0.1&&limit<500){if(cursor>=0)legs.push(makeLeg(start,along,normal,cursor,wallGap,tickLen,labelOff,false,false,false));cursor+=bayPx;limit++;}
    results.push({segIndex:i,legs:legs.filter(l=>isFinitePoint(l.tickTip)&&!pointInPolygon(l.tickTip,outline))});
  }
  return results;
}
function makeLeg(start:PlanPoint,along:PlanPoint,normal:PlanPoint,dist:number,wg:number,tl:number,lo:number,mirror:boolean,isStart:boolean,isEnd:boolean):LegResult {
  const wp={x:start.x+along.x*dist+normal.x*wg,y:start.y+along.y*dist+normal.y*wg};
  const tp={x:start.x+along.x*dist+normal.x*(wg+tl),y:start.y+along.y*dist+normal.y*(wg+tl)};
  const lp={x:start.x+along.x*dist+normal.x*lo,y:start.y+along.y*dist+normal.y*lo};
  return {wallPoint:wp,tickTip:tp,labelPoint:lp,isTurnaroundMirror:mirror,isStartLeg:isStart,isEndLeg:isEnd};
}

// ── Three.js Scaffold Model ───────────────────────────────────────────────────
function ScaffoldModel3D({ bayCount, legCount, frameTall, scaffoldWidthFt }: { bayCount:number;legCount:number;frameTall:number;scaffoldWidthFt:number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer|null>(null);
  const frameRef = useRef<number>(0);
  const [rotating, setRotating] = useState(true);
  const [snapshot, setSnapshot] = useState<string|null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const W = mountRef.current.clientWidth, H = mountRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080604);
    scene.fog = new THREE.Fog(0x080604, 30, 80);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 200);
    camera.position.set(20, 12, 20);
    camera.lookAt(0, 4, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8080ff, 0.3);
    fill.position.set(-10, 5, -5);
    scene.add(fill);
    const orange = new THREE.PointLight(0xf97316, 0.6, 40);
    orange.position.set(0, 8, 8);
    scene.add(orange);

    // Materials
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.3 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.9, metalness: 0.0 });
    const braceMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.7, roughness: 0.4 });
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1.0 });

    // Dimensions
    const BAY_W   = 2.0;   // bay width in scene units
    const BAY_H   = 1.9;   // frame height
    const SCAF_W  = scaffoldWidthFt * 0.5; // scaffold depth
    const bays = Math.min(bayCount, 12);   // cap for performance
    const jumps = Math.min(frameTall, 8);
    const totalW = bays * BAY_W;

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(totalW+10, 20), groundMat);
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build scaffold
    const group = new THREE.Group();

    for (let j=0; j<=bays; j++) {
      const x = j * BAY_W - totalW/2;
      for (let k=0; k<jumps; k++) {
        const y = k * BAY_H;
        // Frame legs — two vertical tubes
        const legGeo = new THREE.CylinderGeometry(0.04, 0.04, BAY_H, 6);
        const leg1 = new THREE.Mesh(legGeo, frameMat); leg1.position.set(x, y+BAY_H/2, 0); leg1.castShadow=true; group.add(leg1);
        const leg2 = new THREE.Mesh(legGeo, frameMat); leg2.position.set(x, y+BAY_H/2, SCAF_W); leg2.castShadow=true; group.add(leg2);
        // Frame horizontal crossbar
        const crossGeo = new THREE.CylinderGeometry(0.03, 0.03, SCAF_W, 6);
        const cross = new THREE.Mesh(crossGeo, frameMat);
        cross.rotation.x = Math.PI/2;
        cross.position.set(x, y+BAY_H*0.65, SCAF_W/2);
        cross.castShadow=true; group.add(cross);
        // Screw jack at base
        if (k===0) {
          const jackGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6);
          const jack1 = new THREE.Mesh(jackGeo, frameMat); jack1.position.set(x, 0.15, 0); group.add(jack1);
          const jack2 = new THREE.Mesh(jackGeo, frameMat); jack2.position.set(x, 0.15, SCAF_W); group.add(jack2);
        }
      }
      // Cross braces between bays
      if (j < bays) {
        const x2 = (j+1) * BAY_W - totalW/2;
        for (let k=0; k<jumps; k++) {
          const y = k * BAY_H;
          const braceLen = Math.sqrt(BAY_W**2 + BAY_H**2);
          const braceGeo = new THREE.CylinderGeometry(0.025, 0.025, braceLen, 5);
          const angle = Math.atan2(BAY_H, BAY_W);
          // Front brace
          const fb = new THREE.Mesh(braceGeo, braceMat);
          fb.rotation.z = angle; fb.position.set((x+x2)/2, y+BAY_H/2, 0); group.add(fb);
          // Back brace (reverse diagonal)
          const bb = new THREE.Mesh(braceGeo, braceMat);
          bb.rotation.z = -angle; bb.position.set((x+x2)/2, y+BAY_H/2, SCAF_W); group.add(bb);
        }
        // Planks on each level
        for (let k=0; k<jumps; k++) {
          const y = k * BAY_H;
          const plankW = BAY_W - 0.1;
          const plankGeo = new THREE.BoxGeometry(plankW, 0.04, SCAF_W * 0.9);
          for (let p=0; p<3; p++) {
            const plank = new THREE.Mesh(plankGeo, plankMat);
            plank.position.set((x+x2)/2, y+BAY_H+0.02, SCAF_W*0.1 + p*(SCAF_W*0.8/2));
            plank.castShadow=true; plank.receiveShadow=true; group.add(plank);
          }
          // Guardrail post
          const grPostGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5);
          const grPost = new THREE.Mesh(grPostGeo, frameMat);
          grPost.position.set((x+x2)/2, y+BAY_H+0.5, SCAF_W+0.05); group.add(grPost);
          // Guardrail tube
          const grGeo = new THREE.CylinderGeometry(0.02, 0.02, BAY_W, 5);
          const gr = new THREE.Mesh(grGeo, frameMat);
          gr.rotation.z = Math.PI/2; gr.position.set((x+x2)/2, y+BAY_H+0.9, SCAF_W+0.05); group.add(gr);
        }
        // Stair tower at start
        if (j===0) {
          const stairGeo = new THREE.BoxGeometry(0.8, jumps*BAY_H, 0.8);
          const stairMat = new THREE.MeshStandardMaterial({ color:0x888888, metalness:0.6, roughness:0.4, transparent:true, opacity:0.7 });
          const stair = new THREE.Mesh(stairGeo, stairMat);
          stair.position.set(x-0.6, jumps*BAY_H/2, SCAF_W/2); group.add(stair);
        }
      }
    }

    scene.add(group);

    // Grid helper
    const grid = new THREE.GridHelper(40, 20, 0x1a1a1a, 0x1a1a1a);
    grid.position.y = 0.01; scene.add(grid);

    // Animate
    let angle = 0;
    let isRotating = rotating;
    const radius = Math.max(totalW * 0.8, 18);

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      if (isRotating) {
        angle += 0.005;
        camera.position.set(Math.sin(angle)*radius, radius*0.5, Math.cos(angle)*radius);
        camera.lookAt(0, jumps*BAY_H*0.4, 0);
      }
      renderer.render(scene, camera);
    }
    animate();

    // Expose rotation toggle
    (mountRef.current as any).__setRotating = (v: boolean) => { isRotating = v; };
    (mountRef.current as any).__snapshot = () => renderer.domElement.toDataURL("image/png");

    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [bayCount, frameTall, scaffoldWidthFt]);

  useEffect(() => {
    if (mountRef.current) (mountRef.current as any).__setRotating?.(rotating);
  }, [rotating]);

  function takeSnapshot() {
    const url = (mountRef.current as any).__snapshot?.();
    if (url) setSnapshot(url);
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={mountRef} className="flex-1 relative overflow-hidden rounded-lg" />
      <div className="flex items-center gap-2 px-2 py-2 bg-[#0b0b0b] border-t border-zinc-900">
        <button onClick={() => setRotating(r => !r)}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${rotating ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}>
          {rotating ? "⏸ Pause" : "▶ Rotate"}
        </button>
        <button onClick={takeSnapshot}
          className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] font-bold text-zinc-400 hover:border-orange-500/30 hover:text-orange-300">
          📷 Snap
        </button>
        {snapshot && (
          <a href={snapshot} download="scaffold-view.png"
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[9px] font-bold text-emerald-300">
            ⬇ Save
          </a>
        )}
      </div>
      {/* Stats below 3D */}
      <div className="grid grid-cols-2 gap-1 p-2 bg-[#0b0b0b]">
        <StatCell label="Bays" value={bayCount} />
        <StatCell label="Jumps" value={frameTall} />
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-black p-2 text-center">
      <p className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="font-mono text-sm font-bold text-orange-300">{value}</p>
    </div>
  );
}

// ── Section View mini viewer ──────────────────────────────────────────────────
function SectionViewPanel({ frameMakeup, sectionType, wallOffset, frameCount, frameTall, scaffoldWidthFt, editMode }: {
  frameMakeup:string; sectionType:string; wallOffset:number;
  frameCount:number; frameTall:number; scaffoldWidthFt:number; editMode:boolean;
}) {
  const FRAME_H = 6.333, frameHPx = 18, widthPx = 30, totalH = frameTall * frameHPx;
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center bg-zinc-950 p-3">
        <svg width="100%" viewBox={`-20 -10 120 ${totalH + 60}`} className="max-h-full">
          {/* Wall */}
          <rect x="-15" y="-5" width="8" height={totalH + 10} fill="#27272a" stroke="#3f3f46" strokeWidth="0.5" />
          <text x="-11" y={totalH/2} textAnchor="middle" fontSize="4" fill="#71717a" fontFamily="monospace" dominantBaseline="middle" transform={`rotate(-90,-11,${totalH/2})`}>WALL</text>
          {/* Wall offset dimension */}
          <line x1="-7" y1={totalH} x2={wallOffset*8} y2={totalH} stroke="#f97316" strokeWidth="0.5" strokeDasharray="2,2" />
          <text x={(wallOffset*8-7)/2} y={totalH+7} textAnchor="middle" fontSize="3.5" fill="#f97316" fontFamily="monospace">{wallOffset}'</text>
          {/* Scaffold frames per jump */}
          {Array.from({length: frameTall}).map((_,i) => (
            <g key={i}>
              {/* Left leg */}
              <rect x={wallOffset*8} y={i*frameHPx} width="2" height={frameHPx} fill="#9ca3af" stroke="#6b7280" strokeWidth="0.3" />
              {/* Right leg */}
              <rect x={wallOffset*8+widthPx-2} y={i*frameHPx} width="2" height={frameHPx} fill="#9ca3af" stroke="#6b7280" strokeWidth="0.3" />
              {/* Crossbar */}
              <rect x={wallOffset*8} y={i*frameHPx + frameHPx*0.6} width={widthPx} height="1.5" fill="#d1d5db" stroke="#6b7280" strokeWidth="0.2" />
              {/* Planks on top of each jump */}
              {[0,1,2].map(p => (
                <rect key={p} x={wallOffset*8 + p*(widthPx/3.2)} y={i*frameHPx + frameHPx - 1.5}
                  width={widthPx/3.5} height="1.5" fill="#92400e" stroke="#78350f" strokeWidth="0.2" />
              ))}
              {/* Jump height label */}
              <text x={wallOffset*8+widthPx+3} y={i*frameHPx + frameHPx/2} fontSize="3" fill="#71717a" fontFamily="monospace" dominantBaseline="middle">
                {FRAME_H.toFixed(2)}'
              </text>
            </g>
          ))}
          {/* Guardrail */}
          <rect x={wallOffset*8+widthPx-1} y={-8} width="1.5" height="8" fill="#9ca3af" />
          <rect x={wallOffset*8} y={-7} width={widthPx} height="1" fill="#9ca3af" />
          {/* Base plates */}
          <rect x={wallOffset*8-1} y={totalH} width="4" height="2" fill="#4b5563" />
          <rect x={wallOffset*8+widthPx-3} y={totalH} width="4" height="2" fill="#4b5563" />
          {/* Ground line */}
          <line x1="-20" y1={totalH+2} x2="110" y2={totalH+2} stroke="#374151" strokeWidth="0.8" />
          {/* Section cut line */}
          <line x1="90" y1="-10" x2="90" y2={totalH+20} stroke="#f97316" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.6" />
          <text x="92" y="-5" fontSize="4" fill="#f97316" fontFamily="monospace" fontWeight="bold">{sectionType}</text>
          {/* Width dimension */}
          <line x1={wallOffset*8} y1={totalH+12} x2={wallOffset*8+widthPx} y2={totalH+12} stroke="#2563eb" strokeWidth="0.5" />
          <text x={wallOffset*8+widthPx/2} y={totalH+18} textAnchor="middle" fontSize="3.5" fill="#2563eb" fontFamily="monospace">{scaffoldWidthFt}'</text>
        </svg>
      </div>
      {/* Frame makeup */}
      {frameMakeup && (
        <div className="px-3 py-2 bg-[#0b0b0b] border-t border-zinc-900">
          <p className="text-[8px] uppercase tracking-wider text-zinc-600 mb-1">Frame Makeup</p>
          <p className="text-[9px] font-mono text-orange-300 leading-relaxed">{frameMakeup}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SetScaffoldV2Page() {
  const [scaffoldWidth,   setScaffoldWidth]   = useState<ScaffoldWidth>("3'");
  const [plankType,       setPlankType]       = useState<PlankType>("Wood");
  const [standardBayLen,  setStandardBayLen]  = useState("10'");
  const [showOverlay,     setShowOverlay]     = useState(true);
  const [showScaffold,    setShowScaffold]    = useState(true);
  const [editMode,        setEditMode]        = useState(false);
  const [selectedLegKey,  setSelectedLegKey]  = useState<string|null>(null);
  const [deletedLegKeys,  setDeletedLegKeys]  = useState<Set<string>>(new Set());
  const [overriddenFC,    setOverriddenFC]    = useState<Record<string,number>>({});
  const [draggedLegKey,   setDraggedLegKey]   = useState<string|null>(null);
  const [legOffsets,      setLegOffsets]      = useState<Record<string,{dx:number;dy:number}>>({});
  const [viewerZoom,      setViewerZoom]      = useState(1);
  const [elevation,       setElevation]       = useState<ProjectElevation|null>(null);
  const [projectName,     setProjectName]     = useState(projectInfo.projectName);
  const [mounted,         setMounted]         = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const frameHeight      = 6 + 4/12;
  const workerReachHeight = getBackendSettings().scaffold.workerReachHeight ?? 6;
  const frameTall        = elevation?.quantityEngine.frameTall ?? 7;
  const scaffoldWidthFt  = parseFeetValue(scaffoldWidth);
  const bayLengthFt      = parseFeetValue(standardBayLen) || 10;
  const plankCountPerBay = scaffoldWidth==="5'"?6:scaffoldWidth==="3'-6\""?4:3;

  const isAerial = elevation?.overlayGeometry?.fullOverlayRows?.some(r=>(r as any).overlayType==="Aerial")??false;
  const puf      = elevation?.scale?.pageUnitsPerFoot ?? (isAerial ? 4 : null);
  const scaleOk  = (puf != null && puf > 0) || isAerial;
  const effPuf   = puf ?? 4;

  const rawPoints = useMemo(() => getPrimaryGeometryPoints(elevation), [elevation]);
  const outline   = rawPoints.length >= 3 ? rawPoints : FALLBACK_OUTLINE;
  const isFallback = rawPoints.length < 3;

  const rawOverlayRows = useMemo(() => {
    const g = elevation?.overlayGeometry; if (!g) return [];
    return g.fullOverlayRows.filter(r=>r.points.length>=2).map((r,i)=>({
      id:r.id??i, level:r.level, isKeyFloor:Boolean(r.isKeyFloor), closed:Boolean(r.closed),
      color:r.color||(i===0?"#2563eb":"#22c55e"), points:r.points.filter(isFinitePoint),
    })).filter(r=>r.points.length>=2);
  }, [elevation]);

  const rawRefPts = useMemo(()=>elevation?.overlayGeometry?.referencePoints?.filter(isFinitePoint)??[],[elevation]);

  const svgViewBox = useMemo(()=>{
    const pts=outline.filter(isFinitePoint); if(pts.length<2) return {x:0,y:0,w:1200,h:720};
    const minX=pts.reduce((m,p)=>p.x<m?p.x:m,Infinity), maxX=pts.reduce((m,p)=>p.x>m?p.x:m,-Infinity);
    const minY=pts.reduce((m,p)=>p.y<m?p.y:m,Infinity), maxY=pts.reduce((m,p)=>p.y>m?p.y:m,-Infinity);
    const pad=effPuf*8; return {x:minX-pad,y:minY-pad,w:(maxX-minX)+pad*2,h:(maxY-minY)+pad*2};
  },[outline,effPuf]);

  const allSegmentLegs = useMemo(()=>{
    if(!scaleOk||!outline.length||effPuf<=0||bayLengthFt<=0) return [];
    return computeLegs(outline,scaffoldWidthFt,bayLengthFt,effPuf);
  },[outline,scaffoldWidthFt,bayLengthFt,scaleOk,effPuf]);

  const totals = useMemo(()=>{
    let legs=0,bays=0,frames=0;
    for(const seg of allSegmentLegs){
      const sl=seg.legs.filter(l=>!l.isTurnaroundMirror);
      const active=sl.filter((_,i)=>!deletedLegKeys.has(`${seg.segIndex}-${i}`));
      legs+=active.length; if(active.length>1) bays+=active.length-1;
      active.forEach((_,i)=>{const k=`${seg.segIndex}-${i}`;frames+=overriddenFC[k]??frameTall;});
    }
    return {legs,bays,frames,planks:bays*plankCountPerBay,braces:Math.max(0,bays-outline.length)};
  },[allSegmentLegs,frameTall,plankCountPerBay,outline.length,deletedLegKeys,overriddenFC]);

  useEffect(()=>{
    function load(){
      try{
        const e=getActiveElevation(),p=getActiveProject();
        setElevation(e); setProjectName(p.projectName||projectInfo.projectName);
        setScaffoldWidth(e.scaffoldInput.scaffoldWidth>=5?"5'":e.scaffoldInput.scaffoldWidth>=3.5?"3'-6\"":"3'");
        setStandardBayLen(`${e.scaffoldInput.standardBayLength}'`);
      }catch{}
      setMounted(true);
    }
    load();
    window.addEventListener("focus",load); window.addEventListener("pageshow",load);
    return()=>{window.removeEventListener("focus",load);window.removeEventListener("pageshow",load);};
  },[]);

  function saveInput(updates:Partial<ScaffoldInput>){
    const cur=elevation??getActiveElevation();
    const si={...cur.scaffoldInput,...updates};
    const qe=calculateQuantityEngine({linearFeet:cur.linearFeet,wallHeight:cur.wallHeight,...si,workerReachHeight});
    const next={...cur,scaffoldInput:si,quantityEngine:qe,sectionView:{...cur.sectionView,wallOffset:si.wallOffset}};
    setElevation(next); saveActiveElevation(next);
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Set Scaffold"
        subtitle="Overlay · 3D Model · Section View"
        menuLinks={scaffoldMenuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <KorbanHeaderMeta label="Project" value={projectName} />
            <KorbanHeaderMeta label="Job No." value={projectInfo.jobNumber} />
            <KorbanButton as="a" href="/takeoff-workspace-advanced" variant="ghost">← Takeoff</KorbanButton>
            <KorbanButton as="a" href="/frame-configuration" variant="primary">Frame Config →</KorbanButton>
          </>
        }
      />

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden gap-0">

        {/* ── Panel 1 — 75% — Floor Plan Overlay ──────────────────────── */}
        <section className="flex flex-col border-r border-zinc-900" style={{width:"55%"}}>
          <div className="flex items-center justify-between border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Floor Plan · Scaffold Layout</p>
            <div className="flex items-center gap-1.5">
              <button onClick={()=>setShowOverlay(c=>!c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showOverlay?"border-blue-500/40 bg-blue-500/10 text-blue-300":"border-zinc-800 text-zinc-600"}`}>Overlay</button>
              <button onClick={()=>setShowScaffold(c=>!c)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${showScaffold?"border-orange-500/40 bg-orange-500/10 text-orange-300":"border-zinc-800 text-zinc-600"}`}>Scaffold</button>
              <button onClick={()=>setEditMode(m=>!m)} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${editMode?"border-orange-500 bg-orange-500 text-black":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>{editMode?"✓ Edit":"Edit Bay"}</button>
              <button onClick={()=>setViewerZoom(z=>Math.min(3,z+0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
              <button onClick={()=>setViewerZoom(z=>Math.max(0.3,z-0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">−</button>
            </div>
          </div>

          {/* SVG canvas */}
          <div className="flex-1 relative overflow-hidden bg-black">
            {mounted && !scaleOk && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-8 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-300">⚠ Scale Not Set</p>
                  <p className="mt-2 text-xs text-zinc-500 max-w-xs">Set scale in Takeoff Workspace before generating scaffold layout.</p>
                  <a href="/takeoff-workspace-advanced" className="mt-4 inline-block rounded-xl bg-yellow-400 px-5 py-2 text-xs font-bold text-black">Go to Takeoff Workspace →</a>
                </div>
              </div>
            )}
            <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px]" />
            <svg ref={svgRef} className="h-full w-full"
              viewBox={`${svgViewBox.x+(svgViewBox.w*(1-1/viewerZoom))/2} ${svgViewBox.y+(svgViewBox.h*(1-1/viewerZoom))/2} ${svgViewBox.w/viewerZoom} ${svgViewBox.h/viewerZoom}`}
              onMouseMove={e=>{
                if(!draggedLegKey||!svgRef.current) return;
                const rect=svgRef.current.getBoundingClientRect(), vb=svgRef.current.viewBox.baseVal;
                const sx=vb.width/rect.width, sy=vb.height/rect.height;
                setLegOffsets(p=>({...p,[draggedLegKey]:{dx:(p[draggedLegKey]?.dx??0)+e.movementX*sx,dy:(p[draggedLegKey]?.dy??0)+e.movementY*sy}}));
              }}
              onMouseUp={()=>setDraggedLegKey(null)} onMouseLeave={()=>setDraggedLegKey(null)}>

              {/* Overlay */}
              {showOverlay && (rawOverlayRows.length ? (
                <g>
                  {rawOverlayRows.map((r,i)=>(
                    <g key={i}>
                      <path d={`M${r.points[0]?.x} ${r.points[0]?.y} ${r.points.slice(1).map(p=>`L${p.x} ${p.y}`).join(" ")}${r.closed?" Z":""}`}
                        fill="transparent" stroke={r.isKeyFloor?"#2563eb":r.color} strokeWidth={r.isKeyFloor?"0.9":"0.6"} />
                    </g>
                  ))}
                  {rawRefPts.map((p,i)=>(
                    <g key={i}>
                      <line x1={p.x-5} y1={p.y} x2={p.x+5} y2={p.y} stroke="#f97316" strokeWidth="0.7" />
                      <line x1={p.x} y1={p.y-5} x2={p.x} y2={p.y+5} stroke="#f97316" strokeWidth="0.7" />
                    </g>
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
              {showScaffold && scaleOk && (
                <g fill="#f8fafc" stroke="#f8fafc" strokeLinecap="square" opacity="0.9">
                  {allSegmentLegs.map(({segIndex,legs})=>{
                    const segStart=outline[segIndex], segEnd=outline[(segIndex+1)%outline.length];
                    if(!segStart||!segEnd) return null;
                    const normal=computeOutwardNormal(segStart,segEnd,outline);
                    const dx=segEnd.x-segStart.x, dy=segEnd.y-segStart.y, len=Math.sqrt(dx*dx+dy*dy);
                    const wg=1*effPuf, tl=scaffoldWidthFt*effPuf;
                    const sl=legs.filter(l=>!l.isTurnaroundMirror);
                    return (
                      <g key={`seg-${segIndex}`}>
                        {sl.filter(l=>!l.isStartLeg).slice(0,-1).map((leg,i)=>{
                          const next=sl.filter(l=>!l.isStartLeg)[i+1]; if(!next) return null;
                          const o1=legOffsets[`${segIndex}-${i}`]??{dx:0,dy:0};
                          const o2=legOffsets[`${segIndex}-${i+1}`]??{dx:0,dy:0};
                          const cx=(leg.wallPoint.x+o1.dx+next.wallPoint.x+o2.dx)/2;
                          const cy=(leg.wallPoint.y+o1.dy+next.wallPoint.y+o2.dy)/2;
                          const bp=Math.sqrt((next.wallPoint.x-leg.wallPoint.x)**2+(next.wallPoint.y-leg.wallPoint.y)**2);
                          const hb=bp*0.3, al=len>0?{x:dx/len,y:dy/len}:{x:1,y:0};
                          return <line key={i} x1={cx-al.x*hb+normal.x*wg*0.5} y1={cy-al.y*hb+normal.y*wg*0.5} x2={cx+al.x*hb+normal.x*(wg+tl)*0.9} y2={cy+al.y*hb+normal.y*(wg+tl)*0.9} strokeWidth="0.7" opacity="0.55" />;
                        })}
                        {sl.filter(l=>!pointInPolygon(l.tickTip,outline)).map((leg,i)=>{
                          const k=`${segIndex}-${i}`; if(deletedLegKeys.has(k)) return null;
                          if(!isFiniteNumber(leg.wallPoint.x)) return null;
                          const sel=selectedLegKey===k, fc=overriddenFC[k]??frameTall;
                          const off=legOffsets[k]??{dx:0,dy:0};
                          const wp={x:leg.wallPoint.x+off.dx,y:leg.wallPoint.y+off.dy};
                          const tp={x:leg.tickTip.x+off.dx,y:leg.tickTip.y+off.dy};
                          const lp={x:leg.labelPoint.x+off.dx,y:leg.labelPoint.y+off.dy};
                          return (
                            <g key={k} style={{cursor:editMode?(sel?"grab":"pointer"):"default"}}
                              onClick={()=>{if(editMode)setSelectedLegKey(p=>p===k?null:k);}}
                              onMouseDown={e=>{if(editMode){e.preventDefault();setDraggedLegKey(k);setSelectedLegKey(k);}}}>
                              {editMode&&<circle cx={(wp.x+tp.x)/2} cy={(wp.y+tp.y)/2} r={tl*0.55} fill={sel?"rgba(249,115,22,0.18)":"rgba(249,115,22,0.04)"} stroke={sel?"#f97316":"rgba(249,115,22,0.25)"} strokeWidth={sel?"1.5":"0.7"} strokeDasharray={sel?"none":"3,2"} />}
                              <line x1={wp.x} y1={wp.y} x2={tp.x} y2={tp.y} strokeWidth={sel?"2.5":"1.8"} stroke={sel?"#f97316":"#f8fafc"} />
                              <text x={lp.x} y={lp.y} fontSize={effPuf*0.5} fontFamily="monospace" fontWeight="600" opacity="0.85" textAnchor="middle" dominantBaseline="middle" fill={sel?"#f97316":"#f8fafc"}>{fc}</text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Edit popup */}
              {editMode&&selectedLegKey&&(()=>{
                const [si,li]=selectedLegKey.split("-").map(Number);
                const seg=allSegmentLegs.find(s=>s.segIndex===si);
                const legs=seg?.legs.filter(l=>!l.isTurnaroundMirror)??[];
                const leg=legs[li]; if(!leg) return null;
                const off=legOffsets[selectedLegKey]??{dx:0,dy:0};
                const cx=leg.tickTip.x+off.dx, cy=leg.tickTip.y+off.dy-18;
                const fc=overriddenFC[selectedLegKey]??frameTall;
                return (
                  <g>
                    <rect x={cx-54} y={cy-14} width={108} height={28} rx={6} fill="#18181b" stroke="#f97316" strokeWidth="1" opacity="0.97"/>
                    <text x={cx-48} y={cy+5} fontSize="8" fill="#f97316" fontFamily="monospace" fontWeight="bold">Frames: {fc}</text>
                    <rect x={cx+14} y={cy-10} width={16} height={16} rx={3} fill="#f97316" style={{cursor:"pointer"}} onClick={()=>setOverriddenFC(p=>({...p,[selectedLegKey]:Math.max(1,(p[selectedLegKey]??frameTall)-1)}))}/>
                    <text x={cx+22} y={cy+4} fontSize="10" fill="black" textAnchor="middle" fontWeight="bold" style={{pointerEvents:"none"}}>−</text>
                    <rect x={cx+32} y={cy-10} width={16} height={16} rx={3} fill="#f97316" style={{cursor:"pointer"}} onClick={()=>setOverriddenFC(p=>({...p,[selectedLegKey]:(p[selectedLegKey]??frameTall)+1}))}/>
                    <text x={cx+40} y={cy+4} fontSize="10" fill="black" textAnchor="middle" fontWeight="bold" style={{pointerEvents:"none"}}>+</text>
                    <rect x={cx-54} y={cy+16} width={108} height={16} rx={4} fill="#ef4444" opacity="0.85" style={{cursor:"pointer"}}
                      onClick={()=>{setDeletedLegKeys(p=>{const n=new Set(p);n.add(selectedLegKey);return n;});setSelectedLegKey(null);}}/>
                    <text x={cx} y={cy+28} fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold" style={{pointerEvents:"none"}}>DELETE TICK</text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Quantities below panel 1 */}
          <div className="border-t border-zinc-900 bg-[#0b0b0b] px-4 py-3 grid grid-cols-5 gap-3">
            {[["Frames",totals.frames],["Planks",totals.planks],["Bays",totals.bays],["Legs",totals.legs],["Braces",totals.braces]].map(([l,v])=>(
              <div key={l} className="text-center">
                <p className="text-[9px] uppercase tracking-wider text-zinc-600">{l}</p>
                <p className="font-mono text-sm font-bold text-orange-300">{Number(v).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Panel 2 — 20% — 3D Model ───────────────────────────────── */}
        <section className="flex flex-col border-r border-zinc-900" style={{width:"25%"}}>
          <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">3D Scaffold Model</p>
          </div>
          <div className="flex-1 overflow-hidden">
            {mounted && (
              <ScaffoldModel3D
                bayCount={totals.bays||63}
                legCount={totals.legs||64}
                frameTall={frameTall}
                scaffoldWidthFt={scaffoldWidthFt}
              />
            )}
          </div>
        </section>

        {/* ── Panel 3 — Section View + right sidebar ──────────────────── */}
        <section className="flex flex-col" style={{width:"20%"}}>
          <div className="border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Section View</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <SectionViewPanel
              frameMakeup={elevation?.sectionView?.frameMakeup??""}
              sectionType={elevation?.sectionView?.sectionType??"A-A"}
              wallOffset={elevation?.sectionView?.wallOffset??1}
              frameCount={totals.frames}
              frameTall={frameTall}
              scaffoldWidthFt={scaffoldWidthFt}
              editMode={editMode}
            />
          </div>
          {/* Frame config quick inputs */}
          <div className="border-t border-zinc-900 bg-[#0b0b0b] p-3 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500">Scaffold Config</p>
            <label className="block">
              <span className="text-[9px] text-zinc-600">Width</span>
              <select value={scaffoldWidth} onChange={e=>{setScaffoldWidth(e.target.value as ScaffoldWidth);saveInput({scaffoldWidth:parseFeetValue(e.target.value)});}}
                className="w-full mt-0.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none">
                <option>3'</option><option>3'-6"</option><option>5'</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] text-zinc-600">Bay Length</span>
              <input value={standardBayLen} onChange={e=>{setStandardBayLen(e.target.value);saveInput({standardBayLength:parseFeetValue(e.target.value)||10});}}
                className="w-full mt-0.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none" />
            </label>
            <a href="/frame-configuration"
              className="block w-full rounded-xl bg-orange-500 px-3 py-2 text-center text-xs font-bold text-black hover:bg-orange-400 mt-2">
              Frame Config →
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
