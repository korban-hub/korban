"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { alignOverlayRows, getActiveElevation, getActiveProject, saveActiveElevation } from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type PageTag        = "Floor Plan" | "Elevation View" | "Section View";
type ActiveTab      = "floor" | "elevation" | "section";
type Pt             = { x: number; y: number };
type ScaffoldWidth  = "3'" | "3'-6\"" | "5'";

type ScaleState = {
  locked: boolean; label: string; pageUnitsPerFoot: number | null;
  point1: Pt|null; point2: Pt|null; pickingPoint: 1|2|null; measurementInput: string;
};

type ExtractedPage = { id: string; pageNumber: number; tag: PageTag; thumbnail: string; scale: ScaleState; };

type FloorLevel = {
  id: string; levelName: string; isKeyFloor: boolean;
  linealFeet: number; color: string;
  tracePoints: Pt[]; traceClosed: boolean; traceMode: boolean; stored: boolean;
  /**
   * Per-level anchor point — a fixed feature (column, corner, grid
   * intersection) that appears on every level's sheet. All levels get
   * shifted so their reference points coincide, which is what makes
   * floors traced from different pages stack correctly.
   */
  refPoint: Pt | null;
};

type ElevGripArea = {
  id: string; areaIndex: number;
  rect: { x:number; y:number; w:number; h:number }|null;
  lf: number; heightFt: number; frameTall: number; legs: number; bayCount: number;
  stored: boolean;
  /**
   * Which floors this gripped region actually spans. The grip already
   * measures the height; these say which levels that measurement
   * corresponds to — the missing link that lets Korban derive a run's
   * base elevation (e.g. a podium wall tagged From: Level 4 starts at
   * whatever height the Level 1→4 grip measured). Null = untagged,
   * which behaves exactly as before: ground to top of grip.
   */
  fromLevelId: string | null;
  toLevelId: string | null;
};

type ElevationData = {
  direction: string;
  areas: ElevGripArea[];
};

type FrameItem = { partNo: string; description: string; qty: number; };

type SectionView = {
  id: string; label: string;
  wallOffset: number; topOfWallDistance: number;
  frameWidth: ScaffoldWidth;
  wallOutline: Pt[]; wallComplete: boolean;
  /** Which side of the traced wall the scaffold sits on. Toggle appears once the wall outline is complete. */
  scaffoldSide: "left" | "right";
  frameMakeup: FrameItem[];
  totalLF: number; totalLegs: number; totalFrames: number; totalPlanks: number;
};

type DraftPiece = { id: string; type: string; x: number; y: number; };

const DEFAULT_SCALE: ScaleState = { locked:false, label:"", pageUnitsPerFoot:null, point1:null, point2:null, pickingPoint:null, measurementInput:"" };
const SECTION_LABELS = ["A-A","B-B","C-C","D-D"];
// Clockwise order
const ELEVATION_DIRS = ["North","East","South","West"];
const LEVEL_COLORS   = ["#f97316","#22c55e","#f59e0b","#a855f7"];

function getFrameParts(width: ScaffoldWidth): FrameItem[] {
  const framePartNo = width==="5'"?"FO6L":width==="3'-6\""?"FO6L42":"FO6L3";
  const frame5PartNo = width==="5'"?"FM5":width==="3'-6\""?"FO5L42":"FO5L3";
  const frame3PartNo = width==="5'"?"FM5":width==="3'-6\""?"FM342":"FM33";
  return [
    { partNo:framePartNo,  description:`6'-4" H Frame ${width}`,  qty:0 },
    { partNo:frame5PartNo, description:`5' H Frame ${width}`,     qty:0 },
    { partNo:frame3PartNo, description:`3' H Frame ${width}`,     qty:0 },
    { partNo:"AL1S",       description:"Screw Jack w/ Base",      qty:0 },
    { partNo:"BP1",        description:"Fixed Base Plate",        qty:0 },
    { partNo:"B82",        description:"8×2 Cross Brace",         qty:0 },
    { partNo:"GR8",        description:"8' Guard Rail",           qty:0 },
    { partNo:"BR12L",      description:"12\" Side Bracket",       qty:0 },
    { partNo:"BR20L",      description:"20\" Side Bracket",       qty:0 },
    { partNo:"BR30S",      description:"30\" Side Bracket",       qty:0 },
    { partNo:"WP10",       description:"10' Wood Plank",          qty:0 },
  ];
}

function newElevArea(areaIndex: number, direction: string): ElevGripArea {
  return { id:`${direction}-${areaIndex}-${Date.now()}`, areaIndex, rect:null, lf:0, heightFt:0, frameTall:0, legs:0, bayCount:0, stored:false, fromLevelId:null, toLevelId:null };
}

function makeElevData(dirs: string[]): ElevationData[] {
  return dirs.map(d => ({ direction:d, areas:[1,2,3].map(i=>newElevArea(i,d)) }));
}

const TAB_TAGS: Record<ActiveTab,PageTag> = { floor:"Floor Plan", elevation:"Elevation View", section:"Section View" };

const menuLinks: KorbanMenuLink[] = [
  { href:"/takeoff-workspace",        label:"Standard Takeoff"  },
  { href:"/takeoff-workspace-aerial", label:"Aerial Takeoff"    },
  { href:"/set-scaffold-v2",          label:"Set Scaffold"      },
];

// Haversine-style pixel perimeter calculation
function calcPerimeterFt(pts: Pt[], puf: number): number {
  if (pts.length < 2 || puf <= 0) return 0;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1)%pts.length];
    total += Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2);
  }
  return parseFloat((total / puf).toFixed(1));
}

// ── Tooltip component ─────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  return (
    <div className="relative flex-1 min-w-0"
      onMouseEnter={()=>{ timer.current=setTimeout(()=>setShow(true),900); }}
      onMouseLeave={()=>{ if(timer.current)clearTimeout(timer.current); setShow(false); }}>
      {children}
      {show&&(
        <div className="absolute left-0 bottom-full mb-1 z-50 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[9px] text-zinc-300 shadow-xl whitespace-nowrap pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TakeoffWorkspaceAdvancedPage() {
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("floor");
  const [pdfDoc,         setPdfDoc]         = useState<any>(null);
  const [pdfLib,         setPdfLib]         = useState<any>(null);
  const [pdfLoading,     setPdfLoading]     = useState(false);
  const [currentPageNo,  setCurrentPageNo]  = useState(1);
  const [pageNoInput,    setPageNoInput]    = useState("1");
  const [totalPages,     setTotalPages]     = useState(0);
  const [viewerUrl,      setViewerUrl]      = useState("");
  const [renderingPage,  setRenderingPage]  = useState(false);
  const [viewerZoom,     setViewerZoom]     = useState(0.65);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [activeExtracted,setActiveExtracted]= useState<ExtractedPage|null>(null);

  const [tabScales, setTabScales] = useState<Record<ActiveTab,ScaleState>>({
    floor:{ ...DEFAULT_SCALE }, elevation:{ ...DEFAULT_SCALE }, section:{ ...DEFAULT_SCALE },
  });

  // Floor
  const [floorLevels,  setFloorLevels]  = useState<FloorLevel[]>([
    { id:"main", levelName:"Level 1", isKeyFloor:true, linealFeet:0, color:"#f97316", tracePoints:[], traceClosed:false, traceMode:false, stored:false, refPoint:null },
  ]);
  const [activeLevel,  setActiveLevel]  = useState("main");
  const [refPickLevelId, setRefPickLevelId] = useState<string|null>(null);
  const [overlayStored,setOverlayStored]= useState(false);

  // Elevation
  const [elevData,      setElevData]      = useState<ElevationData[]>(makeElevData(ELEVATION_DIRS));
  const [selectedElev,  setSelectedElev]  = useState("North");
  const [selectedArea,  setSelectedArea]  = useState(1);
  const [gripMode,      setGripMode]      = useState(false);
  const [gripStart,     setGripStart]     = useState<Pt|null>(null);
  const [gripCurrent,   setGripCurrent]   = useState<Pt|null>(null);
  const [elevStored,    setElevStored]    = useState(false);
  const [dupSouth,      setDupSouth]      = useState(false);
  const [dupWest,       setDupWest]       = useState(false);

  // Section
  const [sections,        setSections]        = useState<SectionView[]>([]);
  const [activeSection,   setActiveSection]   = useState("aa");
  const [wallOutlineMode, setWallOutlineMode] = useState(false);
  const [sectionStored,   setSectionStored]   = useState(false);

  const [projectName, setProjectName]   = useState("");
  const [backendSettings, setBackendSettings] = useState<any>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const imgRef   = useRef<HTMLImageElement>(null);
  const viewerRef= useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setProjectName(getActiveProject().projectName||"");
      const bs = getBackendSettings();
      setBackendSettings(bs);
      const wallOff = bs?.scaffold?.wallOffset ?? 1;
      const topOfWall = bs?.scaffold?.workerReachHeight ?? 6;
      const fw: ScaffoldWidth = "3'";
      setSections([{ id:"aa", label:"A-A", wallOffset:wallOff, topOfWallDistance:topOfWall, frameWidth:fw, wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts(fw), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    } catch {
      setSections([{ id:"aa", label:"A-A", wallOffset:1, topOfWallDistance:6, frameWidth:"3'", wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts("3'"), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    }
  }, []);

  async function getPdfLib() {
    if (pdfLib) return pdfLib;
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs",import.meta.url).toString();
    setPdfLib(lib); return lib;
  }

  async function renderPage(pdf:any, n:number, sc:number): Promise<string> {
    const page=await pdf.getPage(n);
    const vp=page.getViewport({ scale:sc });
    const canvas=document.createElement("canvas");
    canvas.width=vp.width; canvas.height=vp.height;
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle="#18181b"; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({ canvasContext:ctx, viewport:vp }).promise;
    return canvas.toDataURL("image/jpeg",0.82);
  }

  // Real fit — calculates zoom from image natural size vs container
  function fitToViewer() {
    if (!imgRef.current || !viewerRef.current) return;
    const containerRect = viewerRef.current.getBoundingClientRect();
    const vw = containerRect.width - 64, vh = containerRect.height - 64;
    const iw = imgRef.current.naturalWidth, ih = imgRef.current.naturalHeight;
    if (!iw || !ih || vw <= 0 || vh <= 0) { setViewerZoom(0.65); return; }
    const fit = Math.min(vw / iw, vh / ih);
    setViewerZoom(fit > 0 && isFinite(fit) ? fit : 0.65);
  }

  // Pages open at the 65% default; use the "Fit" button to fit manually.
  function handleImgLoad() {}

  const handleFile = useCallback(async (file:File) => {
    if (!file) return;
    const isImg=file.type.startsWith("image/"), isPdf=file.type==="application/pdf";
    if (!isImg&&!isPdf) return;
    setPdfLoading(true); setViewerUrl(""); setPdfDoc(null);
    setExtractedPages([]); setActiveExtracted(null); setCurrentPageNo(1); setPageNoInput("1");
    try {
      if (isImg) {
        const url=URL.createObjectURL(file);
        setViewerUrl(url); setTotalPages(1);
      } else {
        const lib=await getPdfLib();
        const buf=await file.arrayBuffer();
        const pdf=await lib.getDocument({ data:buf }).promise;
        setPdfDoc(pdf); setTotalPages(pdf.numPages);
        setViewerUrl(await renderPage(pdf,1,1.2));
      }
    } catch(e) { console.error(e); } finally { setPdfLoading(false); }
  },[pdfLib]);

  async function goToPage(n:number) {
    if (!pdfDoc||renderingPage) return;
    const p=Math.max(1,Math.min(n,totalPages));
    setCurrentPageNo(p); setPageNoInput(String(p)); setRenderingPage(true);
    try { setViewerUrl(await renderPage(pdfDoc,p,1.2)); }
    catch {} finally { setRenderingPage(false); }
  }

  // Arrow-key page navigation — ← / → step through plan pages, same as the
  // toolbar's ‹ › buttons. Ignored while typing in an input/textarea so it
  // doesn't hijack normal text editing (e.g. the measurement input, level
  // name fields).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!pdfDoc || totalPages <= 1) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goToPage(currentPageNo + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goToPage(currentPageNo - 1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pdfDoc, totalPages, currentPageNo, renderingPage]);

  async function extractCurrentPage() {
    if (!viewerUrl) return;
    const tag=TAB_TAGS[activeTab];
    if (extractedPages.find(p=>p.pageNumber===currentPageNo&&p.tag===tag)) return;
    let thumb=viewerUrl;
    if (pdfDoc) thumb=await renderPage(pdfDoc,currentPageNo,0.18);
    const pg:ExtractedPage = { id:`${activeTab}-${currentPageNo}`, pageNumber:currentPageNo, tag, thumbnail:thumb, scale:{...tabScales[activeTab]} };
    setExtractedPages(prev=>[...prev,pg]);
    setActiveExtracted(pg);
  }

  async function loadExtracted(pg:ExtractedPage) {
    setActiveExtracted(pg);
    if (!pdfDoc) return;
    setCurrentPageNo(pg.pageNumber); setPageNoInput(String(pg.pageNumber)); setRenderingPage(true);
    try {
      setViewerUrl(await renderPage(pdfDoc,pg.pageNumber,1.2));
      // Only restore this page's saved scale if it was actually locked when
      // extracted, and only when the tab doesn't already have a scale set.
      // Previously this overwrote unconditionally, so clicking a thumbnail
      // that had been extracted before scale was set would silently wipe
      // the scale you'd just locked — the "scale doesn't persist" bug.
      setTabScales(prev=>{
        const current = prev[activeTab];
        if (current?.locked) return prev;
        if (!pg.scale?.locked) return prev;
        return { ...prev, [activeTab]: pg.scale };
      });
    } catch {} finally { setRenderingPage(false); }
  }

  // ── Scale ─────────────────────────────────────────────────────────────────
  const scale=tabScales[activeTab];
  function setScale(u:Partial<ScaleState>) { setTabScales(p=>({...p,[activeTab]:{...p[activeTab],...u}})); }

  function getImgPt(e:React.MouseEvent): Pt|null {
    if (!imgRef.current) return null;
    const r=imgRef.current.getBoundingClientRect();
    return { x:(e.clientX-r.left)/viewerZoom, y:(e.clientY-r.top)/viewerZoom };
  }

  function lockScale() {
    if (!scale.point1||!scale.point2||!scale.measurementInput) return;
    const dx=scale.point2.x-scale.point1.x, dy=scale.point2.y-scale.point1.y;
    const px=Math.sqrt(dx*dx+dy*dy);
    const ft=parseFloat(scale.measurementInput.replace(/[^0-9.]/g,""));
    if (!ft||ft<=0) return;
    setScale({ locked:true, pageUnitsPerFoot:px/ft, label:scale.measurementInput, pickingPoint:null, point1:null, point2:null });
  }

  // ── Elevation grip helpers ────────────────────────────────────────────────
  /**
   * Derives how high off the ground a run tagged "From: <level>" starts,
   * by summing the measured heights of grips that cover the levels below
   * it. This is the whole point of the From/To tagging: the grips already
   * measure heights, the tags say which floors those measurements cover,
   * so a podium wall tagged From: Level 4 learns it starts 32' up from
   * the Level 1→4 grip's own measurement — no height typed anywhere.
   *
   * Returns 0 for untagged grips or anything starting at the lowest
   * level, which preserves today's behaviour (ground to top of grip).
   * Returns null when a level below is referenced but never gripped —
   * per the "no grip, no coverage" rule, that's surfaced to the user
   * rather than guessed at.
   */
  function deriveRunBaseFt(area: ElevGripArea, areas: ElevGripArea[]): number | null {
    if (!area.fromLevelId) return 0;
    const startIdx = floorLevels.findIndex(l => l.id === area.fromLevelId);
    if (startIdx <= 0) return 0; // lowest level (or unknown) starts at grade
    const levelsBelow = floorLevels.slice(0, startIdx).map(l => l.id);
    let base = 0;
    for (const levelId of levelsBelow) {
      // Find a gripped area whose tagged range covers this level.
      const covering = areas.find(a => {
        if (!a.fromLevelId || !a.toLevelId || !a.rect) return false;
        const f = floorLevels.findIndex(l => l.id === a.fromLevelId);
        const t = floorLevels.findIndex(l => l.id === a.toLevelId);
        const i = floorLevels.findIndex(l => l.id === levelId);
        return f >= 0 && t >= 0 && i >= f && i < t;
      });
      if (!covering) return null; // no grip covering that level — can't know
      const span = Math.max(1,
        floorLevels.findIndex(l => l.id === covering.toLevelId) -
        floorLevels.findIndex(l => l.id === covering.fromLevelId));
      base += covering.heightFt / span; // even split across the levels it spans
    }
    return parseFloat(base.toFixed(2));
  }

  function calcGripArea(w:number, h:number, puf:number): Partial<ElevGripArea> {
    const lf=parseFloat((w/puf).toFixed(1));
    const heightFt=parseFloat((h/puf).toFixed(1));
    const fh=backendSettings?.scaffold?.frameHeight??6.333;
    const reach=backendSettings?.scaffold?.workerReachHeight??6;
    const bayLen=backendSettings?.scaffold?.defaultBayLength??10;
    const frameTall=Math.max(1,Math.ceil((heightFt-reach)/fh));
    const bayCount=Math.ceil(lf/bayLen);
    const legs=bayCount+1;
    return { lf, heightFt, frameTall, legs, bayCount };
  }

  function duplicateElevation(from:string, to:string) {
    const src=elevData.find(e=>e.direction===from);
    if (!src) return;
    const next=elevData.map(ed=>ed.direction===to?{ ...ed, areas:src.areas.map(a=>({...a,id:`${to}-${a.areaIndex}-${Date.now()}`,stored:false})) }:ed);
    setElevData(next);
    // Persist immediately with the fresh array — duplicating and then
    // needing a separate Store click afterward (which could read stale
    // state) was the "have to click Store twice" bug.
    storeElevations(next);
  }

  // ── Section auto-populate inventory ──────────────────────────────────────
  function autoPopulateSectionInventory(secId:string, wallPts:Pt[], puf:number|null) {
    if (!puf||wallPts.length<2) return;
    let totalLF=0;
    for (let i=0;i<wallPts.length-1;i++) {
      totalLF+=Math.sqrt((wallPts[i+1].x-wallPts[i].x)**2+(wallPts[i+1].y-wallPts[i].y)**2)/puf;
    }
    const bayLen=backendSettings?.scaffold?.defaultBayLength??10;
    const fh=backendSettings?.scaffold?.frameHeight??6.333;
    const reach=backendSettings?.scaffold?.workerReachHeight??6;
    const plankPB=3;
    const bayCount=Math.ceil(totalLF/bayLen);
    const legs=bayCount+1;
    const sec=sections.find(s=>s.id===secId); if(!sec) return;
    const topOfWall=sec.topOfWallDistance??6;
    const frameTall=Math.max(1,Math.ceil((topOfWall-reach)/fh))||7;
    const totalFrames=legs*frameTall;
    const totalPlanks=bayCount*plankPB;
    setSections(prev=>prev.map(s=>s.id===secId?{
      ...s,
      totalLF:parseFloat(totalLF.toFixed(1)),
      totalLegs:legs, totalFrames, totalPlanks,
      frameMakeup:s.frameMakeup.map((f,i)=>{
        if(i===0) return {...f,qty:totalFrames};
        if(f.partNo==="AL1S") return {...f,qty:legs};
        if(f.partNo==="BP1")  return {...f,qty:legs};
        if(f.partNo==="B82")  return {...f,qty:bayCount};
        if(f.partNo==="GR8")  return {...f,qty:bayCount};
        if(f.partNo==="WP10") return {...f,qty:totalPlanks};
        return f;
      }),
    }:s));
  }

  // ── Viewer mouse handlers ─────────────────────────────────────────────────
  function handleViewerMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    const pt=getImgPt(e); if(!pt) return;
    // Reference-point pick takes priority over every other mode — one
    // click sets the anchor for that level and exits pick mode.
    if (refPickLevelId) {
      setFloorLevels(prev=>prev.map(l=>l.id===refPickLevelId?{...l,refPoint:pt,stored:false}:l));
      setRefPickLevelId(null);
      return;
    }
    if (scale.pickingPoint&&!scale.locked) {
      if(scale.pickingPoint===1) setScale({point1:pt,pickingPoint:2});
      else setScale({point2:pt,pickingPoint:null});
      return;
    }
    const lvl=floorLevels.find(l=>l.id===activeLevel);
    if (lvl?.traceMode&&!lvl.traceClosed) {
      setFloorLevels(prev=>prev.map(l=>l.id===activeLevel?{...l,tracePoints:[...l.tracePoints,pt]}:l));
      return;
    }
    if (gripMode) { setGripStart(pt); setGripCurrent(pt); return; }
    const sec=sections.find(s=>s.id===activeSection);
    if (wallOutlineMode&&sec&&!sec.wallComplete) {
      setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOutline:[...s.wallOutline,pt]}:s));
    }
  }

  function handleViewerMouseMove(e:React.MouseEvent<HTMLDivElement>) {
    if (!gripMode||!gripStart) return;
    const pt=getImgPt(e); if(pt) setGripCurrent(pt);
  }

  function handleViewerMouseUp(e:React.MouseEvent<HTMLDivElement>) {
    if (!gripMode||!gripStart||!gripCurrent) return;
    const puf=tabScales.elevation.pageUnitsPerFoot;
    if (!puf||puf<=0) { setGripStart(null); setGripCurrent(null); return; }
    const x=Math.min(gripStart.x,gripCurrent.x), y=Math.min(gripStart.y,gripCurrent.y);
    const w=Math.abs(gripCurrent.x-gripStart.x), h=Math.abs(gripCurrent.y-gripStart.y);
    if(w<5||h<5) { setGripStart(null); setGripCurrent(null); return; }
    const calc=calcGripArea(w,h,puf);
    setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{
      ...ed,
      areas:ed.areas.map(a=>a.areaIndex===selectedArea?{ ...a, rect:{x,y,w,h}, ...calc }:a),
    }:ed));
    setGripStart(null); setGripCurrent(null); setGripMode(false);
  }

  function handleViewerDblClick(e:React.MouseEvent) {
    const lvl=floorLevels.find(l=>l.id===activeLevel);
    if(lvl?.traceMode&&lvl.tracePoints.length>=3) {
      e.preventDefault();
      const puf=tabScales.floor.pageUnitsPerFoot;
      const lf=puf?calcPerimeterFt(lvl.tracePoints,puf):0;
      setFloorLevels(prev=>prev.map(l=>l.id===activeLevel?{...l,traceClosed:true,traceMode:false,linealFeet:lf}:l));
    }
  }

  // ── Store ─────────────────────────────────────────────────────────────────
  function ensureBase() {
    if (!localStorage.getItem("korbanProjectData_v1")) {
      const base = { projectId:"KRB-260614-001", projectName:projectName||"New Project", projectAddress:"", customer:"", estimator:"", updatedAt:new Date().toISOString(), schemaVersion:1, takeoff:{ levels:[{ levelId:"main-level", levelName:"Main Level", elevations:[{ elevationId:"north-elevation", elevationName:"North", levelName:"Main Level", linearFeet:0, wallHeight:45, phase:"Main", mobilization:"Base Bid", overlayGeometry:null, scale:null, scaffoldInput:{ scaffoldWidth:3, standardBayLength:10, frameHeight:6.333, plankCountPerBay:3, bracePattern:"Every Bay", wallOffset:1 }, quantityEngine:{ bayCount:0,legCount:0,jumps:0,frameTall:7,frameCount:0,plankCount:0,crossBraceCount:0,guardrailCount:0,basePlateCount:0,screwJackCount:0 }, sectionView:{ frameMakeup:"",selectedRun:"",wallOffset:1,sectionType:"A-A",wallOutline:[],scaffoldSide:"left",draftingAdditions:[] }, elevationBreakdown:[] }] }] } };
      localStorage.setItem("korbanProjectData_v1",JSON.stringify({"KRB-260614-001":base}));
      localStorage.setItem("korbanActiveProjectId","KRB-260614-001");
      localStorage.setItem("korbanActiveElevationId","north-elevation");
    }
  }

  function storeOverlay() {
    try {
      ensureBase();
      const elev=getActiveElevation();
      const key=floorLevels.find(l=>l.isKeyFloor);
      const lf=key?.linealFeet||0;
      const rawRows=floorLevels.map((level,i)=>({
        id: i+1,
        isKeyFloor: level.isKeyFloor,
        overlayType: "Level",
        level: level.levelName,
        points: level.tracePoints,
        closed: level.traceClosed,
        linealFeet: level.linealFeet,
        color: level.color,
        pageNumber: currentPageNo,
        refPoint: level.refPoint,
        alignedPoints: level.tracePoints,
      }));
      // Shift every level so its reference point coincides with the
      // anchor level's — this is what makes floors traced on different
      // pages stack into one correct building.
      const rows = alignOverlayRows(rawRows);
      const keyRow = rows.find(r=>r.isKeyFloor) ?? rows[0];
      const keyPts = keyRow?.alignedPoints ?? [];
      const puf=tabScales.floor.pageUnitsPerFoot;
      saveActiveElevation({ ...elev, linearFeet:lf,
        scale:puf?{ pageUnitsPerFoot:puf }:elev.scale,
        overlayGeometry:{ ...(elev.overlayGeometry??{ elevationName:elev.elevationName, levelName:"Main Level", tracedPerimeter:[], overlayPoints:[], wallSegments:[], referencePoints:[], elevationPoints:[], elevationRefs:[], elevationHeights:[], scale:null }), fullOverlayRows:rows, tracedPerimeter:keyPts, overlayPoints:keyPts, scale:puf?{ pageUnitsPerFoot:puf }:null },
      });
      setOverlayStored(true);
      setFloorLevels(prev=>prev.map(l=>({...l,stored:true})));
      setTimeout(()=>setOverlayStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeElevations(sourceElevData?: typeof elevData) {
    // Guard: this is sometimes wired straight to onClick, which would
    // pass React's click event in as the first argument. Only accept a
    // real array; anything else falls back to current state.
    const src = Array.isArray(sourceElevData) ? sourceElevData : elevData;
    try {
      ensureBase();
      const elev=getActiveElevation();
      // Build elevation heights from grips — each area contributes
      const elevationHeights=src.map(ed=>{
        const filled=ed.areas.filter(a=>a.rect&&a.heightFt>0);
        const avgH=filled.length?filled.reduce((s,a)=>s+a.heightFt,0)/filled.length:0;
        const totalLF=filled.reduce((s,a)=>s+a.lf,0);
        const totalLegs=filled.reduce((s,a)=>s+a.legs,0);
        const avgFrameTall=filled.length?Math.round(filled.reduce((s,a)=>s+a.frameTall,0)/filled.length):7;
        return {
          elevation:ed.direction,
          overallHeightInput:avgH?`${avgH.toFixed(1)}'`:"",
          belowGradeEnabled:false, belowGradeInput:"",
          multipleHeights:filled.length>1,
          totalLF, totalLegs, avgFrameTall,
          areas:filled.map(a=>({ areaIndex:a.areaIndex, lf:a.lf, heightFt:a.heightFt, frameTall:a.frameTall, legs:a.legs, bayCount:a.bayCount, fromLevelId:a.fromLevelId, toLevelId:a.toLevelId, baseElevationFt:deriveRunBaseFt(a, ed.areas) })),
        };
      });
      // Also update quantityEngine from elevation data
      const northData=src.find(e=>e.direction==="North");
      const totalBays=northData?.areas.reduce((s,a)=>s+(a.bayCount||0),0)||elev.quantityEngine.bayCount;
      const totalLegs=(totalBays||0)+1;
      const maxFrameTall=Math.max(...src.flatMap(e=>e.areas.map(a=>a.frameTall||7)),7);
      const puf=tabScales.elevation.pageUnitsPerFoot;
      const existing=elev.overlayGeometry??{ elevationName:elev.elevationName, levelName:"Main Level", tracedPerimeter:[], overlayPoints:[], wallSegments:[], referencePoints:[], elevationPoints:[], fullOverlayRows:[], elevationRefs:[], scale:null };
      saveActiveElevation({
        ...elev,
        wallHeight:src.find(e=>e.direction==="North")?.areas.filter(a=>a.heightFt>0).reduce((s,a,_,arr)=>s+a.heightFt/arr.length,0)||elev.wallHeight,
        overlayGeometry:{ ...existing, elevationHeights, scale:puf?{ pageUnitsPerFoot:puf }:existing.scale },
        quantityEngine:{ ...elev.quantityEngine, bayCount:totalBays, legCount:totalLegs, frameTall:maxFrameTall, frameCount:totalLegs*maxFrameTall },
      });
      setElevStored(true); setTimeout(()=>setElevStored(false),3000);
    } catch(e) { console.error(e); }
  }

  // Converts a traced wall outline from raw page/image pixels into
  // feet-space points — x = linear footage along the wall, y = height in
  // feet, both relative to the outline's own lowest-left point. Doing the
  // conversion once here (using whichever scale was actually active when
  // the trace was made) means Set Scaffold V2 never has to guess which
  // scale applies to a given section's wall trace.
  function wallOutlineToFeet(pts: Pt[], puf: number): Pt[] {
    const baselineY = Math.max(...pts.map(p => p.y));
    const minX = Math.min(...pts.map(p => p.x));
    return pts.map(p => ({ x: (p.x - minX) / puf, y: (baselineY - p.y) / puf }));
  }

  function storeSection() {
    try {
      ensureBase();
      const elev=getActiveElevation();
      const sec=sections.find(s=>s.id===activeSection)??sections[0];
      if(!sec) return;
      const makeupStr=sec.frameMakeup.filter(f=>f.qty>0).map(f=>`${f.qty} × ${f.description}`).join("\n");

      // Use whichever scale was actually used to trace this section's
      // wall outline — the Section tab's own scale if set, otherwise
      // fall back to the Floor Plan scale (matches autoPopulateSectionInventory).
      const tracePuf = tabScales.section.pageUnitsPerFoot ?? tabScales.floor.pageUnitsPerFoot ?? null;
      const wallOutlineFt = (sec.wallOutline.length >= 2 && tracePuf && tracePuf > 0)
        ? wallOutlineToFeet(sec.wallOutline, tracePuf)
        : elev.sectionView.wallOutline;

      saveActiveElevation({
        ...elev,
        sectionView: {
          ...elev.sectionView,
          frameMakeup: makeupStr,
          selectedRun: "Run N-01",
          wallOffset: sec.wallOffset,
          sectionType: sec.label,
          wallOutline: wallOutlineFt,
          scaffoldSide: sec.scaffoldSide,
        },
      });
      setSectionStored(true); setTimeout(()=>setSectionStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeAll() { storeOverlay(); storeElevations(); storeSection(); }

  function addSection() {
    if(sections.length>=4) return;
    const label=SECTION_LABELS[sections.length];
    const id=label.replace("-","").toLowerCase();
    const wallOff=backendSettings?.scaffold?.wallOffset??1;
    const topOfWall=backendSettings?.scaffold?.workerReachHeight??6;
    const fw:ScaffoldWidth="3'";
    setSections(prev=>[...prev,{ id, label, wallOffset:wallOff, topOfWallDistance:topOfWall, frameWidth:fw, wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts(fw), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    setActiveSection(id);
  }

  const tabPages=extractedPages.filter(p=>p.tag===TAB_TAGS[activeTab]);
  const activeSec=sections.find(s=>s.id===activeSection)??sections[0];
  const currentElevData=elevData.find(e=>e.direction===selectedElev)??elevData[0];
  const liveGrip=gripStart&&gripCurrent?{ x:Math.min(gripStart.x,gripCurrent.x), y:Math.min(gripStart.y,gripCurrent.y), w:Math.abs(gripCurrent.x-gripStart.x), h:Math.abs(gripCurrent.y-gripStart.y) }:null;
  const allLevelPoints=floorLevels.filter(l=>l.tracePoints.length>=2);
  const activeLvl=floorLevels.find(l=>l.id===activeLevel);

  // Cursor logic
  const isCapturing=scale.pickingPoint||gripMode||activeLvl?.traceMode||wallOutlineMode||Boolean(refPickLevelId);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Takeoff Workspace"
        subtitle={projectName||"Advanced Takeoff"}
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <button onClick={storeAll} className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/10">Store All</button>
            <a href="/set-scaffold-v2" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-orange-400">Set Scaffold →</a>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex items-end gap-1 border-b border-zinc-900 bg-[#0b0b0b] px-6 pt-2">
        {([{id:"floor",label:"Floor Plan",icon:"⊞"},{id:"elevation",label:"Elevations",icon:"↕"},{id:"section",label:"Section View",icon:"✂"}] as {id:ActiveTab;label:string;icon:string}[]).map(tab=>{
          const active = activeTab===tab.id;
          return (
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 rounded-t-lg border border-b-0 px-5 pt-2.5 pb-3 text-[11px] font-bold uppercase tracking-[0.15em] transition ${active?"text-white border-zinc-700":"text-zinc-600 hover:text-zinc-400 border-zinc-800"}`}
            style={{ background: active ? "#1a1a1a" : "#0b0b0b" }}>
            <span>{tab.icon}</span>{tab.label}
            {extractedPages.filter(p=>p.tag===TAB_TAGS[tab.id]).length>0&&(
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-bold">{extractedPages.filter(p=>p.tag===TAB_TAGS[tab.id]).length}</span>
            )}
            {active && (
              <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-full bg-white/80 shadow-[0_0_4px_1px_rgba(255,255,255,0.35)]" />
            )}
          </button>
          );
        })}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {scale.locked&&<span className="font-mono text-orange-400 opacity-70">⊠ {scale.label}</span>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <aside className="flex w-[140px] flex-shrink-0 flex-col border-r border-zinc-900 bg-[#080604]">
          <div className="border-b border-zinc-900 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">{TAB_TAGS[activeTab]}</p>
          </div>
          {tabPages.length===0?(
            <div className="flex-1 flex items-center justify-center p-3">
              <p className="text-[8px] text-zinc-700 text-center leading-relaxed">Extract pages<br/>using toolbar</p>
            </div>
          ):(
            <div className="flex-1 overflow-y-auto py-2 space-y-1.5 px-2">
              {tabPages.map(pg=>(
                <div key={pg.id} className="relative group">
                  <div onClick={()=>loadExtracted(pg)} className={`w-full rounded-xl border p-1 cursor-pointer transition ${activeExtracted?.id===pg.id?"border-orange-500/60 bg-orange-500/5":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                    <div className="overflow-hidden rounded-lg bg-zinc-900" style={{aspectRatio:"8.5/11"}}>
                      {pg.thumbnail&&<img src={pg.thumbnail} alt="" className="w-full h-full object-cover"/>}
                    </div>
                    <div className="flex items-center justify-between mt-1 px-0.5">
                      <p className="text-[8px] font-mono text-zinc-600">Pg {pg.pageNumber}</p>
                      {pg.scale.locked&&<span className="text-[7px] text-orange-400">⊠</span>}
                    </div>
                  </div>
                  <button onClick={()=>setExtractedPages(prev=>prev.filter(p=>p.id!==pg.id))} className="absolute top-1 right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[8px] text-zinc-500 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center viewer */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-wrap">
            <button onClick={()=>fileRef.current?.click()} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-white/30 hover:text-white">{pdfLoading?"Loading…":"Upload Plans"}</button>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value="";}}/>

            {totalPages>1&&(
              <div className="flex items-center gap-1">
                <button onClick={()=>goToPage(currentPageNo-1)} disabled={currentPageNo<=1||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">‹</button>
                <input
                  type="text" inputMode="numeric"
                  value={pageNoInput}
                  onChange={e=>{
                    const v=e.target.value.replace(/[^0-9]/g,"");
                    setPageNoInput(v);
                    if (v) { const n=parseInt(v); if(n>=1&&n<=totalPages) goToPage(n); }
                  }}
                  onBlur={()=>{ if(!pageNoInput) setPageNoInput(String(currentPageNo)); }}
                  onKeyDown={e=>{ if(e.key==="Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-10 rounded border border-zinc-800 bg-zinc-900 text-center text-[10px] font-mono text-zinc-300 outline-none focus:border-orange-500/50 py-0.5"
                />
                <span className="text-[10px] font-mono text-zinc-600">/ {totalPages}</span>
                <button onClick={()=>goToPage(currentPageNo+1)} disabled={currentPageNo>=totalPages||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">›</button>
              </div>
            )}

            <div className="flex items-center gap-1">
              <button onClick={()=>setViewerZoom(z=>Math.max(0.1,z-0.1))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">−</button>
              <span className="text-[9px] font-mono text-zinc-600 w-8 text-center">{Math.round(viewerZoom*100)}%</span>
              <button onClick={()=>setViewerZoom(z=>Math.min(4,z+0.1))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
              <button onClick={fitToViewer} className="rounded border border-zinc-800 px-1.5 h-6 text-[9px] text-zinc-500 hover:text-white">Fit</button>
            </div>

            {viewerUrl&&<div className="h-4 w-px bg-zinc-800"/>}
            {viewerUrl&&(
              <button onClick={extractCurrentPage} className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-white/10">
                + Extract as {TAB_TAGS[activeTab]}
              </button>
            )}

            {viewerUrl&&<div className="h-4 w-px bg-zinc-800"/>}

            {/* Scale */}
            {!scale.locked?(
              <>
                <button onClick={()=>setScale({pickingPoint:scale.pickingPoint?null:1,point1:null,point2:null})}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${scale.pickingPoint?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>
                  ⟷ Scale {scale.pickingPoint?`— pt ${scale.pickingPoint}`:""}
                </button>
                {scale.point1&&scale.point2&&(
                  <div className="flex items-center gap-1">
                    <input value={scale.measurementInput} onChange={e=>setScale({measurementInput:e.target.value})} onKeyDown={e=>e.key==="Enter"&&lockScale()}
                      placeholder="e.g. 20'" className="w-16 rounded-lg border border-orange-500/50 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none focus:border-orange-500"/>
                    <button onClick={lockScale} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-zinc-800">Lock</button>
                  </div>
                )}
              </>
            ):(
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/5 px-2.5 py-1.5" style={{boxShadow:"0 0 10px rgba(249,115,22,0.2)"}}>
                  <span className="text-[10px] text-orange-500">⊠</span>
                  <span className="text-[10px] font-mono text-orange-300 font-bold">{scale.label}</span>
                </div>
                <button onClick={()=>setScale({locked:false,point1:null,point2:null,pickingPoint:null})} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">Unlock</button>
              </div>
            )}

            {/* Elevation grip tools */}
            {activeTab==="elevation"&&viewerUrl&&scale.locked&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                <button onClick={()=>setGripMode(m=>!m)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${gripMode?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>
                  {gripMode?`● Drag Area ${selectedArea} on ${selectedElev}`:"Add Grip"}
                </button>
              </>
            )}
            {activeTab==="elevation"&&viewerUrl&&!scale.locked&&(
              <span className="text-[9px] text-yellow-600">Set scale first to capture areas</span>
            )}

            {/* Section wall outline */}
            {activeTab==="section"&&viewerUrl&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                <button onClick={()=>setWallOutlineMode(m=>!m)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${wallOutlineMode?"border-blue-500 bg-blue-500/15 text-blue-300":"border-zinc-700 text-zinc-400 hover:border-blue-500/40"}`}>
                  {wallOutlineMode?"● Wall Outline":"Start Wall Outline"}
                </button>
                {activeSec?.wallOutline?.length>0&&!activeSec.wallComplete&&(
                  <button onClick={()=>{setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallComplete:true}:s));setWallOutlineMode(false);autoPopulateSectionInventory(activeSection,activeSec.wallOutline,scale.pageUnitsPerFoot??tabScales.floor.pageUnitsPerFoot);}}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20">
                    Complete
                  </button>
                )}
              </>
            )}
          </div>

          {/* PDF Canvas */}
          <div ref={viewerRef}
            className="relative flex-1 overflow-auto bg-zinc-950 flex items-start justify-center p-6"
            onMouseDown={handleViewerMouseDown}
            onMouseMove={handleViewerMouseMove}
            onMouseUp={handleViewerMouseUp}
            onDoubleClick={handleViewerDblClick}
            style={{cursor:isCapturing?"crosshair":"default"}}>

            {/* Scale required — pinned, unmissable. Nothing measured on this
                tab means anything until scale is locked, so this stays until
                it is. */}
            {viewerUrl&&!scale.locked&&(
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-6 pt-3">
                <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-2.5 shadow-lg backdrop-blur-sm">
                  <span className="text-base leading-none">⚠</span>
                  <div>
                    <p className="text-[11px] font-bold text-yellow-300">Set scale before measuring</p>
                    <p className="text-[10px] text-yellow-500/80">Click <span className="font-bold">⟷ Scale</span>, pick two points a known distance apart, then enter that distance.</p>
                  </div>
                  <button onClick={()=>setScale({pickingPoint:1,point1:null,point2:null})}
                    className="ml-1 rounded-lg bg-yellow-400 px-3 py-1.5 text-[10px] font-bold text-black transition hover:bg-yellow-300">
                    Set Scale
                  </button>
                </div>
              </div>
            )}

            {!viewerUrl&&!pdfLoading&&(
              <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
                className="flex h-full w-full flex-col items-center justify-center gap-3 cursor-pointer">
                <span className="text-5xl opacity-15">📐</span>
                <p className="text-sm font-bold text-zinc-500">Upload Plans to begin</p>
                <p className="text-xs text-zinc-700">PDF, JPG or PNG · Click or drag</p>
              </div>
            )}
            {pdfLoading&&<div className="flex h-full items-center justify-center"><p className="text-xs text-zinc-600">Opening…</p></div>}

            {viewerUrl&&(
              <div className="relative" style={{transform:`scale(${viewerZoom})`,transformOrigin:"top center",userSelect:"none"}}>
                <img ref={imgRef} src={viewerUrl} alt="" draggable={false} onLoad={handleImgLoad}
                  className="block rounded-lg shadow-2xl border border-zinc-800 select-none"
                  style={{maxWidth:"100%",opacity:renderingPage?0.5:1,transition:"opacity 0.15s"}}/>

                <svg className="absolute inset-0 pointer-events-none overflow-visible"
                  style={{width:imgRef.current?.clientWidth||"100%",height:imgRef.current?.clientHeight||"100%"}}>

                  {/* Floor traces */}
                  {activeTab==="floor"&&floorLevels.map(lvl=>{
                    if(lvl.tracePoints.length<1) return null;
                    const pts=[...lvl.tracePoints,...(lvl.traceClosed?[lvl.tracePoints[0]]:[])];
                    const mk=1/viewerZoom; // counter-scale so markers stay a constant on-screen size at any zoom
                    return (
                      <g key={lvl.id}>
                        {lvl.tracePoints.length>=2&&(
                          <polyline points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill={lvl.traceClosed?"rgba(249,115,22,0.08)":"none"} stroke={lvl.color} strokeWidth={1.5*mk} strokeDasharray={lvl.traceClosed?"none":`${4*mk},${3*mk}`}/>
                        )}
                        {lvl.id===activeLevel&&lvl.tracePoints.map((pt,i)=>(
                          <g key={i}>
                            <circle cx={pt.x} cy={pt.y} r={2.5*mk} fill={lvl.color} opacity="0.9"/>
                            <text x={pt.x+6*mk} y={pt.y-5*mk} fontSize={8*mk} fill={lvl.color} fontFamily="monospace" fontWeight="bold">{i+1}</text>
                          </g>
                        ))}
                      </g>
                    );
                  })}

                  {/* Per-level reference points — the anchors that make
                      levels stack correctly. Drawn as a distinct yellow
                      crosshair so they're never confused with trace points. */}
                  {activeTab==="floor"&&floorLevels.map(lvl=>{
                    if(!lvl.refPoint) return null;
                    const mk=1/viewerZoom;
                    const {x,y}=lvl.refPoint;
                    const isActive=lvl.id===activeLevel;
                    return (
                      <g key={`ref-${lvl.id}`} opacity={isActive?1:0.5}>
                        <line x1={x-9*mk} y1={y} x2={x+9*mk} y2={y} stroke="#facc15" strokeWidth={1.4*mk}/>
                        <line x1={x} y1={y-9*mk} x2={x} y2={y+9*mk} stroke="#facc15" strokeWidth={1.4*mk}/>
                        <circle cx={x} cy={y} r={3.5*mk} fill="none" stroke="#facc15" strokeWidth={1.2*mk}/>
                        <text x={x+11*mk} y={y-6*mk} fontSize={7*mk} fill="#facc15" fontFamily="monospace" fontWeight="bold">REF</text>
                      </g>
                    );
                  })}

                  {/* Section wall + scaffold dots */}
                  {activeTab==="section"&&activeSec&&activeSec.wallOutline.length>=1&&(() => {
                    const mk=1/viewerZoom;
                    return (
                    <g>
                      {activeSec.wallOutline.length>=2&&(
                        <polyline points={activeSec.wallOutline.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth={2*mk} strokeDasharray={activeSec.wallComplete?"none":`${4*mk},${3*mk}`}/>
                      )}
                      {activeSec.wallOutline.map((pt,i)=>(
                        <circle key={`pt-${i}`} cx={pt.x} cy={pt.y} r={2.5*mk} fill="#2563eb" opacity="0.9"/>
                      ))}
                      {activeSec.wallComplete&&scale.pageUnitsPerFoot&&activeSec.wallOutline.map((pt,i,arr)=>{
                        if(i>=arr.length-1) return null;
                        const next=arr[i+1];
                        const dx=next.x-pt.x,dy=next.y-pt.y,len=Math.sqrt(dx*dx+dy*dy);
                        const nx=-dy/len,ny=dx/len;
                        const off=1*scale.pageUnitsPerFoot!;
                        const mid={x:(pt.x+next.x)/2+nx*off,y:(pt.y+next.y)/2+ny*off};
                        return <circle key={i} cx={mid.x} cy={mid.y} r={2.5*mk} fill="#f97316" opacity="0.8"/>;
                      })}
                    </g>
                    );
                  })()}

                  {/* Scale crosshairs */}
                  {scale.point1&&(() => {
                    const mk=1/viewerZoom;
                    return (
                    <g>
                      <line x1={scale.point1.x-12*mk} y1={scale.point1.y} x2={scale.point1.x+12*mk} y2={scale.point1.y} stroke="#f97316" strokeWidth={1.5*mk}/>
                      <line x1={scale.point1.x} y1={scale.point1.y-12*mk} x2={scale.point1.x} y2={scale.point1.y+12*mk} stroke="#f97316" strokeWidth={1.5*mk}/>
                      <circle cx={scale.point1.x} cy={scale.point1.y} r={4*mk} fill="#f97316"/>
                      <circle cx={scale.point1.x} cy={scale.point1.y} r={9*mk} fill="none" stroke="#f97316" strokeWidth={0.8*mk} opacity="0.4"/>
                      <text x={scale.point1.x+12*mk} y={scale.point1.y-10*mk} fontSize={9*mk} fill="#f97316" fontFamily="monospace" fontWeight="bold">①</text>
                    </g>
                    );
                  })()}
                  {scale.point2&&(() => {
                    const mk=1/viewerZoom;
                    return (
                    <g>
                      <line x1={scale.point2.x-12*mk} y1={scale.point2.y} x2={scale.point2.x+12*mk} y2={scale.point2.y} stroke="#f97316" strokeWidth={1.5*mk}/>
                      <line x1={scale.point2.x} y1={scale.point2.y-12*mk} x2={scale.point2.x} y2={scale.point2.y+12*mk} stroke="#f97316" strokeWidth={1.5*mk}/>
                      <circle cx={scale.point2.x} cy={scale.point2.y} r={4*mk} fill="#f97316"/>
                      <circle cx={scale.point2.x} cy={scale.point2.y} r={9*mk} fill="none" stroke="#f97316" strokeWidth={0.8*mk} opacity="0.4"/>
                      <text x={scale.point2.x+12*mk} y={scale.point2.y-10*mk} fontSize={9*mk} fill="#f97316" fontFamily="monospace" fontWeight="bold">②</text>
                    </g>
                    );
                  })()}
                  {scale.point1&&scale.point2&&<line x1={scale.point1.x} y1={scale.point1.y} x2={scale.point2.x} y2={scale.point2.y} stroke="#f97316" strokeWidth={1/viewerZoom} strokeDasharray={`${4/viewerZoom},${3/viewerZoom}`} opacity="0.5"/>}

                  {/* Elevation grips */}
                  {activeTab==="elevation"&&elevData.map(ed=>ed.areas.map(a=>{
                    if(!a.rect) return null;
                    const isActiveElev=ed.direction===selectedElev;
                    return (
                      <g key={a.id}>
                        <rect x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} fill="rgba(249,115,22,0.10)" stroke={isActiveElev?"#f97316":"#71717a"} strokeWidth={isActiveElev?"1.5":"1"}/>
                        <text x={a.rect.x+4} y={a.rect.y+13} fontSize="8.5" fill="#f97316" fontFamily="monospace" fontWeight="bold">{ed.direction} A{a.areaIndex}: {a.lf}LF × {a.heightFt}'</text>
                        <text x={a.rect.x+4} y={a.rect.y+24} fontSize="7.5" fill="#fb923c" fontFamily="monospace">{a.legs} legs · {a.frameTall} frames tall</text>
                      </g>
                    );
                  }))}
                  {/* Live grip */}
                  {liveGrip&&liveGrip.w>3&&liveGrip.h>3&&(
                    <g>
                      <rect x={liveGrip.x} y={liveGrip.y} width={liveGrip.w} height={liveGrip.h} fill="rgba(249,115,22,0.08)" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5,3"/>
                      {scale.locked&&tabScales.elevation.pageUnitsPerFoot&&(()=>{
                        const puf=tabScales.elevation.pageUnitsPerFoot!;
                        const lf=(liveGrip.w/puf).toFixed(1), ht=(liveGrip.h/puf).toFixed(1);
                        return <text x={liveGrip.x+4} y={liveGrip.y+14} fontSize="9" fill="#f97316" fontFamily="monospace" fontWeight="bold">{lf}LF × {ht}'</text>;
                      })()}
                    </g>
                  )}
                </svg>
                {renderingPage&&<div className="absolute inset-0 flex items-center justify-center"><p className="text-xs text-zinc-500 bg-black/60 px-3 py-1.5 rounded-lg">Loading…</p></div>}
              </div>
            )}
          </div>
        </section>

        {/* Right panel */}
        <aside className="flex w-[250px] flex-shrink-0 flex-col border-l border-zinc-900 bg-[#080604] overflow-y-auto">

          {/* ── FLOOR PLAN ── */}
          {activeTab==="floor"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Floor Levels</p>
                {floorLevels.map((level,i)=>{
                  const isActive=level.id===activeLevel;
                  const isWorking=isActive&&(level.traceMode||level.tracePoints.length>0)&&!level.stored;
                  return (
                    <div key={level.id} onClick={()=>setActiveLevel(level.id)}
                      className={`rounded-xl border p-3 space-y-2.5 cursor-pointer transition ${level.stored?"border-emerald-500/30 bg-emerald-500/5":isWorking?"border-orange-500/60 bg-orange-500/5 shadow-[0_0_14px_rgba(249,115,22,0.18)]":isActive?"border-orange-500/40 bg-orange-500/5":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{background:level.color}}/>
                        <input value={level.levelName} onClick={e=>e.stopPropagation()}
                          onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,levelName:e.target.value}:l))}
                          className="flex-1 min-w-0 bg-transparent text-[10px] font-bold text-zinc-200 outline-none border-b border-zinc-700 pb-0.5"/>
                        {!level.isKeyFloor&&<button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.filter((_,j)=>j!==i));}} className="text-[9px] text-zinc-700 hover:text-red-400">✕</button>}
                      </div>

                      {/* LF — auto-calculated, condensed to one inline row */}
                      <div onClick={e=>e.stopPropagation()} className="flex items-center gap-2">
                        <label className="text-[9px] text-zinc-600 flex-shrink-0">Lineal Feet</label>
                        {level.traceClosed&&level.linealFeet>0
                          ? <span className="text-[8px] text-emerald-400 flex-shrink-0">✓ Auto</span>
                          : <span className="text-[8px] text-zinc-700 flex-shrink-0 whitespace-nowrap">Trace to calc</span>}
                        <input value={level.linealFeet||""} placeholder="--"
                          readOnly={level.traceClosed&&level.linealFeet>0}
                          onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,linealFeet:parseFloat(e.target.value)||0}:l))}
                          className={`flex-1 min-w-0 rounded-lg border px-2 py-1 text-right text-[10px] font-mono outline-none ${level.traceClosed&&level.linealFeet>0?"border-emerald-500/30 bg-emerald-500/5 text-emerald-300":"border-zinc-800 bg-zinc-900 text-orange-300 focus:border-orange-500/50"}`}/>
                      </div>

                      {/* Key floor — an explicit choice on every level, rather
                          than implied by one being named "Main". This is the
                          floor whose outline drives linear feet/quantities. */}
                      <button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.map(l=>({...l,isKeyFloor:l.id===level.id})));}}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${level.isKeyFloor?"border-orange-500/40 bg-orange-500/5":"border-zinc-800 hover:border-zinc-700"}`}>
                        <span className={`flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border ${level.isKeyFloor?"border-orange-500":"border-zinc-600"}`}>
                          {level.isKeyFloor&&<span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                        </span>
                        <span className={`text-[9px] ${level.isKeyFloor?"text-orange-300":"text-zinc-500"}`}>
                          {level.isKeyFloor?"Key floor — drives quantities":"Use as key floor"}
                        </span>
                      </button>

                      {/* Reference point — the anchor that lets this level
                          stack correctly against the others */}
                      <div onClick={e=>e.stopPropagation()} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[9px] text-zinc-600">Reference Pt</label>
                          <span className={`text-[8px] font-mono ${level.refPoint?"text-yellow-400":"text-zinc-700"}`}>
                            {level.refPoint?`${Math.round(level.refPoint.x)}, ${Math.round(level.refPoint.y)}`:"Not set"}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={()=>{setActiveLevel(level.id);setRefPickLevelId(refPickLevelId===level.id?null:level.id);}}
                            className={`flex-1 rounded-lg border px-2 py-1 text-[9px] font-bold transition ${refPickLevelId===level.id?"animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300":"border-zinc-700 text-zinc-500 hover:border-yellow-400/40 hover:text-yellow-300"}`}>
                            {refPickLevelId===level.id?"Click on plan…":"Pick"}
                          </button>
                          <button onClick={()=>setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,refPoint:null}:l))}
                            disabled={!level.refPoint}
                            className="rounded-lg border border-zinc-800 px-2 py-1 text-[9px] text-zinc-600 hover:border-red-500/30 hover:text-red-400 disabled:opacity-30">
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Start / Close / Store per level */}
                      <div className="flex gap-1.5" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{setActiveLevel(level.id);setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,traceMode:true,tracePoints:[],traceClosed:false,stored:false,linealFeet:0}:l));}}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${level.traceMode&&!level.traceClosed?"border-blue-500 bg-blue-500/15 text-blue-300":"border-zinc-700 text-zinc-500 hover:border-blue-500/40 hover:text-blue-300"}`}>
                          Start
                        </button>
                        <button onClick={()=>{
                          if(level.tracePoints.length>=3){
                            const puf=tabScales.floor.pageUnitsPerFoot;
                            const lf=puf?calcPerimeterFt(level.tracePoints,puf):0;
                            setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,traceClosed:true,traceMode:false,linealFeet:lf}:l));
                          }
                        }}
                          disabled={level.tracePoints.length<3||level.traceClosed}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${level.traceClosed?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-zinc-500"} disabled:opacity-30`}>
                          {level.traceClosed?"✓":"Close"}
                        </button>
                        <button onClick={()=>setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,stored:true,traceMode:false}:l))}
                          disabled={!level.traceClosed&&level.tracePoints.length===0}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${level.stored?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300"} disabled:opacity-30`}>
                          {level.stored?"✓":"Store"}
                        </button>
                      </div>

                      {/* Undo Point — only while actively tracing this level */}
                      {level.traceMode&&!level.traceClosed&&level.tracePoints.length>0&&(
                        <button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,tracePoints:l.tracePoints.slice(0,-1)}:l));}}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[9px] font-bold text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300">
                          ↩ Undo Point ({level.tracePoints.length} placed)
                        </button>
                      )}
                    </div>
                  );
                })}

                <button onClick={()=>setFloorLevels(prev=>[...prev,{id:`lvl-${Date.now()}`,levelName:`Level ${prev.length+1}`,isKeyFloor:false,linealFeet:0,color:LEVEL_COLORS[prev.length%LEVEL_COLORS.length],tracePoints:[],traceClosed:false,traceMode:false,stored:false,refPoint:null}])}
                  className="w-full rounded-xl border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition">
                  + Add Level
                </button>

                {/* Overlay preview */}
                {allLevelPoints.length>0&&(() => {
                  // Preview the ACTUAL aligned stacking, not raw traces —
                  // this is the visual confirmation that reference points
                  // are lining the floors up correctly.
                  const previewRows = alignOverlayRows(floorLevels.map((l,i)=>({
                    id:i+1, isKeyFloor:l.isKeyFloor, overlayType:"Level", level:l.levelName,
                    points:l.tracePoints, closed:l.traceClosed, linealFeet:l.linealFeet,
                    color:l.color, pageNumber:currentPageNo, refPoint:l.refPoint, alignedPoints:l.tracePoints,
                  }))).filter(r=>r.alignedPoints.length>=2);
                  if(!previewRows.length) return null;
                  const all = previewRows.flatMap(r=>r.alignedPoints);
                  const minX=Math.min(...all.map(p=>p.x)), maxX=Math.max(...all.map(p=>p.x));
                  const minY=Math.min(...all.map(p=>p.y)), maxY=Math.max(...all.map(p=>p.y));
                  const gw=Math.max(1,maxX-minX), gh=Math.max(1,maxY-minY);
                  const s=Math.min(180/gw,130/gh);
                  const ox=10+(180-gw*s)/2, oy=10+(130-gh*s)/2;
                  const missingRef = floorLevels.filter(l=>l.tracePoints.length>=2&&!l.refPoint);
                  return (
                  <div className="rounded-xl border border-zinc-800 bg-black overflow-hidden">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider px-3 pt-3 pb-1.5">Overlay Preview · Aligned Stack</p>
                    <div className="px-3 pb-3">
                      <svg viewBox="0 0 200 150" className="w-full rounded-lg bg-zinc-950">
                        {previewRows.map(r=>{
                          const pts=[...r.alignedPoints,...(r.closed?[r.alignedPoints[0]]:[])]
                            .map(p=>`${ox+(p.x-minX)*s},${oy+(p.y-minY)*s}`).join(" ");
                          return <polyline key={r.id} points={pts} fill={r.closed?"rgba(249,115,22,0.06)":"none"} stroke={r.color} strokeWidth="1.4"/>;
                        })}
                      </svg>
                      {missingRef.length>0&&(
                        <p className="mt-2 rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-2 py-1.5 text-[8px] leading-relaxed text-yellow-400">
                          ⚠ {missingRef.length} level{missingRef.length>1?"s":""} missing a reference point — {missingRef.length>1?"they":"it"} can&apos;t be stacked accurately until one is picked.
                        </p>
                      )}
                      {floorLevels.filter(l=>l.linealFeet>0).map(l=>(
                        <div key={l.id} className="flex justify-between text-[9px] mt-1">
                          <span style={{color:l.color}}>{l.levelName}</span>
                          <span className="font-mono text-zinc-400">{l.linealFeet} LF</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button onClick={storeOverlay} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${overlayStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{overlayStored?"✓ Overlay Stored":"Store Overlay"}</button>
              </div>
            </div>
          )}

          {/* ── ELEVATIONS ── */}
          {activeTab==="elevation"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Elevation Heights</p>

                <div className="flex gap-1 flex-wrap">
                  {ELEVATION_DIRS.map(dir=>(
                    <button key={dir} onClick={()=>{setSelectedElev(dir);setSelectedArea(1);setGripMode(false);}}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${selectedElev===dir?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-orange-500/40"}`}>
                      {dir}
                    </button>
                  ))}
                </div>

                {/* Duplicate toggles — North→South, East→West */}
                {selectedElev==="North"&&(
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{duplicateElevation("North","South");setDupSouth(true);}}
                      className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold transition ${dupSouth?"border-orange-500/40 bg-orange-500/10 text-orange-300":"border-zinc-800 text-zinc-600 hover:border-zinc-600"}`}>
                      {dupSouth?"✓ Copied to South — click to re-copy":"Duplicate → South"}
                    </button>
                  </div>
                )}
                {selectedElev==="East"&&(
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{duplicateElevation("East","West");setDupWest(true);}}
                      className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold transition ${dupWest?"border-orange-500/40 bg-orange-500/10 text-orange-300":"border-zinc-800 text-zinc-600 hover:border-zinc-600"}`}>
                      {dupWest?"✓ Copied to West — click to re-copy":"Duplicate → West"}
                    </button>
                  </div>
                )}

                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{selectedElev} — Coverage Areas</p>

                {currentElevData.areas.map((area,aIdx)=>{
                  const hasData=area.rect&&area.lf>0;
                  const isSelected=selectedArea===area.areaIndex;
                  return (
                    <div key={area.id} onClick={()=>setSelectedArea(area.areaIndex)}
                      className={`rounded-xl border p-3 cursor-pointer transition ${hasData?"border-orange-500/40 bg-orange-500/5":isSelected?"border-zinc-600 bg-zinc-900":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold ${isSelected?"text-orange-300":"text-zinc-400"}`}>Area {area.areaIndex}</span>
                        {hasData&&<button onClick={e=>{e.stopPropagation();setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,rect:null,lf:0,heightFt:0,frameTall:0,legs:0,bayCount:0}:a)}:ed));}} className="text-[9px] text-zinc-600 hover:text-red-400">✕ Clear</button>}
                      </div>

                      {hasData?(
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">LF</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.lf}</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">Height</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.heightFt}'</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">Frames↑</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.frameTall}</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">Bays</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.bayCount}</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5 col-span-2">
                            <p className="text-[7px] text-zinc-600 uppercase">Legs</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.legs}</p>
                          </div>
                        </div>
                      ):(
                        <p className="text-[9px] text-zinc-600 mb-2">{isSelected?"Select Start then drag on drawing":"Click to select area"}</p>
                      )}

                      {/* Level range — optional. Says which floors this
                          gripped region spans, so Korban can derive where
                          the run actually starts vertically. */}
                      <div onClick={e=>e.stopPropagation()} className="mb-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                        <label className="text-[8px] uppercase tracking-wider text-zinc-600 block mb-1">Level Range (optional)</label>
                        <div className="flex items-center gap-1">
                          <select value={area.fromLevelId ?? ""}
                            onChange={e=>{const v=e.target.value||null;setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,fromLevelId:v}:a)}:ed));}}
                            className="flex-1 min-w-0 rounded border border-zinc-800 bg-black px-1 py-1 text-[8px] font-mono text-orange-300 outline-none focus:border-orange-500/50">
                            <option value="">From…</option>
                            {floorLevels.map(l=><option key={l.id} value={l.id}>{l.levelName}</option>)}
                          </select>
                          <span className="text-[8px] text-zinc-600">→</span>
                          <select value={area.toLevelId ?? ""}
                            onChange={e=>{const v=e.target.value||null;setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,toLevelId:v}:a)}:ed));}}
                            className="flex-1 min-w-0 rounded border border-zinc-800 bg-black px-1 py-1 text-[8px] font-mono text-orange-300 outline-none focus:border-orange-500/50">
                            <option value="">To…</option>
                            {floorLevels.map(l=><option key={l.id} value={l.id}>{l.levelName}</option>)}
                          </select>
                        </div>
                        {(() => {
                          if (!area.fromLevelId) return null;
                          const base = deriveRunBaseFt(area, currentElevData.areas);
                          if (base === null) return (
                            <p className="mt-1 text-[8px] leading-tight text-yellow-500">⚠ A level below this isn&apos;t gripped — base height unknown.</p>
                          );
                          return (
                            <p className="mt-1 text-[8px] font-mono text-emerald-400">
                              Starts at {Math.floor(base)}&apos;-{Math.round((base % 1) * 12)}&quot; {base === 0 ? "(grade)" : "above grade"}
                            </p>
                          );
                        })()}
                      </div>

                      {/* Start / Close / Store per area */}
                      <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{setSelectedArea(area.areaIndex);setGripMode(true);}}
                          className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[8px] font-bold transition ${isSelected&&gripMode?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40"}`}>
                          Start
                        </button>
                        <button onClick={()=>setGripMode(false)} disabled={!gripMode||!isSelected}
                          className="flex-1 rounded-lg border border-zinc-700 px-1.5 py-1.5 text-[8px] font-bold text-zinc-500 hover:border-zinc-500 disabled:opacity-30">
                          Close
                        </button>
                        <button onClick={()=>setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,stored:true}:a)}:ed))}
                          disabled={!hasData}
                          className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[8px] font-bold transition ${area.stored?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40"} disabled:opacity-30`}>
                          {area.stored?"✓":"Store"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add Area button after last area */}
                <button onClick={()=>setElevData(prev=>prev.map(ed=>ed.direction===selectedElev?{
                  ...ed,
                  areas:[...ed.areas,newElevArea(ed.areas.length+1,selectedElev)],
                }:ed))}
                  className="w-full rounded-xl border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition">
                  + Add Area
                </button>

                {/* Summary */}
                <div className="rounded-xl border border-zinc-800 bg-black p-3">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">All Elevations → Set Scaffold</p>
                  {ELEVATION_DIRS.map(dir=>{
                    const ed=elevData.find(e=>e.direction===dir);
                    const filled=ed?.areas.filter(a=>a.rect&&a.lf>0)??[];
                    const totalLF=filled.reduce((s,a)=>s+a.lf,0);
                    const totalLegs=filled.reduce((s,a)=>s+a.legs,0);
                    const avgFT=filled.length?Math.round(filled.reduce((s,a)=>s+a.frameTall,0)/filled.length):0;
                    return (
                      <div key={dir} className={`py-1 border-b border-zinc-900 last:border-0 ${filled.length?"":"opacity-40"}`}>
                        <div className="flex justify-between text-[9px]">
                          <span className="text-zinc-500 font-bold">{dir}</span>
                          <span className={`font-mono ${filled.length?"text-orange-300":"text-zinc-700"}`}>{filled.length?`${totalLF.toFixed(0)}LF`:"—"}</span>
                        </div>
                        {filled.length>0&&<p className="text-[8px] text-zinc-600">{totalLegs} legs · {avgFT} frames tall</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button onClick={()=>storeElevations()} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${elevStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{elevStored?"✓ Stored":"Store Elevations"}</button>
              </div>
            </div>
          )}

          {/* ── SECTION VIEW ── */}
          {activeTab==="section"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Section Views</p>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {sections.map(sec=>(
                    <button key={sec.id} onClick={()=>setActiveSection(sec.id)}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${activeSection===sec.id?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}>
                      {sec.label}
                    </button>
                  ))}
                  {sections.length<4&&<button onClick={addSection} className="rounded-lg border border-dashed border-zinc-700 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-500">+ Add</button>}
                </div>

                {activeSec&&(
                  <>
                    {/* Frame width */}
                    <div>
                      <label className="text-[9px] text-zinc-500 block mb-1.5">Frame Width</label>
                      <div className="flex gap-1">
                        {(["3'","3'-6\"","5'"] as ScaffoldWidth[]).map(w=>(
                          <button key={w} onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,frameWidth:w,frameMakeup:getFrameParts(w).map((f,i)=>({...f,qty:s.frameMakeup[i]?.qty??0}))}:s))}
                            className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[9px] font-bold transition ${activeSec.frameWidth===w?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}>
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Wall offset + top of wall */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-1">Wall Offset</label>
                        <input value={activeSec.wallOffset} type="number" step="0.5" min="0"
                          onChange={e=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOffset:parseFloat(e.target.value)||1}:s))}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-orange-300 outline-none focus:border-orange-500/50"/>
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-1">Top of Wall</label>
                        <input value={activeSec.topOfWallDistance} type="number" step="0.5" min="0"
                          onChange={e=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,topOfWallDistance:parseFloat(e.target.value)||6}:s))}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-orange-300 outline-none focus:border-orange-500/50"/>
                      </div>
                    </div>

                    {/* Wall outline status */}
                    {activeSec.wallOutline.length>0&&(
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 flex items-center justify-between">
                        <span className="text-[9px] text-blue-300">{activeSec.wallComplete?"✓ Wall complete":"Wall outline in progress…"}</span>
                        <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOutline:[],wallComplete:false,totalLF:0,totalLegs:0,totalFrames:0,totalPlanks:0}:s))}
                          className="text-[9px] text-zinc-600 hover:text-red-400">Clear</button>
                      </div>
                    )}

                    {/* Scaffold side toggle — appears once wall outline is complete */}
                    {activeSec.wallComplete&&(
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-1.5">Scaffold Side (relative to wall)</label>
                        <div className="flex gap-1">
                          <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,scaffoldSide:"left"}:s))}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${activeSec.scaffoldSide==="left"?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}>
                            Scaffold Left
                          </button>
                          <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,scaffoldSide:"right"}:s))}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${activeSec.scaffoldSide==="right"?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}>
                            Scaffold Right
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Start / Complete / Store */}
                    <div className="flex gap-1.5">
                      <button onClick={()=>setWallOutlineMode(true)}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${wallOutlineMode?"border-blue-500 bg-blue-500/15 text-blue-300":"border-zinc-700 text-zinc-500 hover:border-blue-500/40"}`}>
                        Start
                      </button>
                      <button onClick={()=>{setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallComplete:true}:s));setWallOutlineMode(false);autoPopulateSectionInventory(activeSection,activeSec.wallOutline,scale.pageUnitsPerFoot??tabScales.floor.pageUnitsPerFoot);}}
                        disabled={!activeSec.wallOutline||activeSec.wallOutline.length<2||activeSec.wallComplete}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${activeSec.wallComplete?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-emerald-500/40"} disabled:opacity-30`}>
                        {activeSec.wallComplete?"✓ Done":"Complete"}
                      </button>
                      <button onClick={storeSection}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${sectionStored?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300"}`}>
                        {sectionStored?"✓":"Store"}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button onClick={storeSection} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${sectionStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{sectionStored?"✓ Stored":"Store Section"}</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
