"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getActiveElevation, getActiveProject, saveActiveElevation } from "@/lib/projectStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type PageTag   = "Floor Plan" | "Elevation View" | "Section View";
type ActiveTab = "floor" | "elevation" | "section";
type Pt        = { x: number; y: number };

type ScaleState = {
  locked: boolean; label: string; pageUnitsPerFoot: number | null;
  point1: Pt|null; point2: Pt|null; pickingPoint: 1|2|null; measurementInput: string;
};

type ExtractedPage = { id: string; pageNumber: number; tag: PageTag; thumbnail: string; scale: ScaleState; };
type FloorLevel    = { id: string; levelName: string; isKeyFloor: boolean; linealFeet: string; color: string; };

type ElevGrip = {
  id: string; elevation: string;
  x: number; y: number; w: number; h: number; // in image pixels
  lf: number; heightFt: number; legs: number;
};

type SectionView = { id: string; label: string; wallOffset: string; frameMakeup: FrameItem[]; };
type FrameItem   = { partNo: string; description: string; qty: number; };

type DraftPiece  = { id: string; type: "frame"|"bracket10"|"bracket20"|"bracket30"|"plank"; x: number; y: number; };

const DEFAULT_SCALE: ScaleState = { locked:false, label:"", pageUnitsPerFoot:null, point1:null, point2:null, pickingPoint:null, measurementInput:"" };
const SECTION_LABELS = ["A-A","B-B","C-C","D-D"];
const ELEVATION_DIRS = ["North","South","East","West"];
const LEVEL_COLORS   = ["#f97316","#22c55e","#f59e0b","#a855f7","#ec4899"];
const FRAME_PARTS: FrameItem[] = [
  { partNo:"FO6L3",  description:"6'-4\" H Frame",  qty:0 },
  { partNo:"FO5L3",  description:"5' H Frame",      qty:0 },
  { partNo:"FM33",   description:"3' H Frame",       qty:0 },
  { partNo:"AL1S",   description:"Screw Jack",      qty:0 },
  { partNo:"BP1",    description:"Base Plate",      qty:0 },
  { partNo:"BR10",   description:"10\" Bracket",    qty:0 },
  { partNo:"BR20",   description:"20\" Bracket",    qty:0 },
  { partNo:"BR30",   description:"30\" Bracket",    qty:0 },
  { partNo:"WP10",   description:"10' Wood Plank",  qty:0 },
];
const TAB_TAGS: Record<ActiveTab,PageTag> = { floor:"Floor Plan", elevation:"Elevation View", section:"Section View" };
const menuLinks: KorbanMenuLink[] = [
  { href:"/takeoff-workspace", label:"Standard Takeoff" },
  { href:"/takeoff-workspace-aerial", label:"Aerial Takeoff" },
  { href:"/set-scaffold-v2", label:"Set Scaffold" },
];

// ── Piece shapes for section drafting ─────────────────────────────────────────
function PieceShape({ type, size=40 }: { type: DraftPiece["type"]; size?: number }) {
  if (type === "frame") return (
    <svg width={size*0.6} height={size} viewBox="0 0 24 40">
      <rect x="0" y="0" width="4" height="40" fill="#9ca3af"/>
      <rect x="20" y="0" width="4" height="40" fill="#9ca3af"/>
      <rect x="0" y="15" width="24" height="3" fill="#d1d5db"/>
      <rect x="1" y="0" width="4" height="6" fill="#6b7280"/>
      <rect x="19" y="0" width="4" height="6" fill="#6b7280"/>
    </svg>
  );
  if (type === "bracket10") return (
    <svg width={size*0.4} height={size*0.25} viewBox="0 0 16 10">
      <rect x="0" y="3" width="16" height="4" fill="#f97316" rx="1"/>
      <rect x="0" y="0" width="3" height="10" fill="#f97316"/>
    </svg>
  );
  if (type === "bracket20") return (
    <svg width={size*0.6} height={size*0.25} viewBox="0 0 24 10">
      <rect x="0" y="3" width="24" height="4" fill="#f97316" rx="1"/>
      <rect x="0" y="0" width="3" height="10" fill="#f97316"/>
    </svg>
  );
  if (type === "bracket30") return (
    <svg width={size*0.8} height={size*0.25} viewBox="0 0 32 10">
      <rect x="0" y="3" width="32" height="4" fill="#f97316" rx="1"/>
      <rect x="0" y="0" width="3" height="10" fill="#f97316"/>
    </svg>
  );
  // plank
  return (
    <svg width={size} height={size*0.25} viewBox="0 0 40 10">
      <rect x="0" y="0" width="40" height="10" fill="#92400e" stroke="#78350f" strokeWidth="0.5" rx="1"/>
      <line x1="8" y1="0" x2="8" y2="10" stroke="#78350f" strokeWidth="0.3"/>
      <line x1="20" y1="0" x2="20" y2="10" stroke="#78350f" strokeWidth="0.3"/>
      <line x1="32" y1="0" x2="32" y2="10" stroke="#78350f" strokeWidth="0.3"/>
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TakeoffWorkspaceAdvancedPage() {
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("floor");
  const [pdfDoc,         setPdfDoc]         = useState<any>(null);
  const [pdfLib,         setPdfLib]         = useState<any>(null);
  const [pdfLoading,     setPdfLoading]     = useState(false);
  const [currentPageNo,  setCurrentPageNo]  = useState(1);
  const [totalPages,     setTotalPages]     = useState(0);
  const [viewerUrl,      setViewerUrl]      = useState("");
  const [renderingPage,  setRenderingPage]  = useState(false);
  const [viewerZoom,     setViewerZoom]     = useState(1);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [activeExtracted,setActiveExtracted]= useState<ExtractedPage|null>(null);

  // Tab scales
  const [tabScales, setTabScales] = useState<Record<ActiveTab,ScaleState>>({
    floor:{ ...DEFAULT_SCALE }, elevation:{ ...DEFAULT_SCALE }, section:{ ...DEFAULT_SCALE },
  });

  // ── Floor state ───────────────────────────────────────────────────────────
  const [floorLevels,   setFloorLevels]   = useState<FloorLevel[]>([
    { id:"key", levelName:"Key Floor", isKeyFloor:true, linealFeet:"", color:"#f97316" },
  ]);
  const [tracePoints,   setTracePoints]   = useState<Pt[]>([]);
  const [traceClosed,   setTraceClosed]   = useState(false);
  const [traceMode,     setTraceMode]     = useState(false);
  const [floorStarted,  setFloorStarted]  = useState(false);
  const [floorStored,   setFloorStored]   = useState(false);

  // ── Elevation state ───────────────────────────────────────────────────────
  const [selectedElev,  setSelectedElev]  = useState("North");
  const [elevGrips,     setElevGrips]     = useState<ElevGrip[]>([]);
  const [gripMode,      setGripMode]      = useState(false);
  const [gripStart,     setGripStart]     = useState<Pt|null>(null);
  const [gripCurrent,   setGripCurrent]   = useState<Pt|null>(null);
  const [elevStarted,   setElevStarted]   = useState(false);
  const [elevStored,    setElevStored]    = useState(false);

  // ── Section state ─────────────────────────────────────────────────────────
  const [sections,      setSections]      = useState<SectionView[]>([
    { id:"aa", label:"A-A", wallOffset:"1'", frameMakeup:FRAME_PARTS.map(p=>({...p})) },
  ]);
  const [activeSection, setActiveSection] = useState("aa");
  const [draftPieces,   setDraftPieces]   = useState<DraftPiece[]>([]);
  const [draggingPiece, setDraggingPiece] = useState<string|null>(null);
  const [sectionStarted,setSectionStarted]= useState(false);
  const [sectionStored, setSectionStored] = useState(false);

  const [projectName,   setProjectName]   = useState("");
  const fileRef   = useRef<HTMLInputElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const draftRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setProjectName(getActiveProject().projectName||""); } catch {}
  }, []);

  async function getPdfLib() {
    if (pdfLib) return pdfLib;
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs",import.meta.url).toString();
    setPdfLib(lib); return lib;
  }

  async function renderPage(pdf:any, n:number, scale:number): Promise<string> {
    const page = await pdf.getPage(n);
    const vp   = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width=vp.width; canvas.height=vp.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle="#18181b"; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({ canvasContext:ctx, viewport:vp }).promise;
    return canvas.toDataURL("image/jpeg",0.82);
  }

  const handleFile = useCallback(async (file:File) => {
    if (!file||file.type!=="application/pdf") return;
    setPdfLoading(true); setViewerUrl(""); setPdfDoc(null);
    setExtractedPages([]); setActiveExtracted(null); setCurrentPageNo(1);
    setTracePoints([]); setTraceClosed(false); setElevGrips([]);
    try {
      const lib = await getPdfLib();
      const buf = await file.arrayBuffer();
      const pdf = await lib.getDocument({ data:buf }).promise;
      setPdfDoc(pdf); setTotalPages(pdf.numPages);
      setViewerUrl(await renderPage(pdf,1,1.2));
    } catch(e) { console.error(e); } finally { setPdfLoading(false); }
  },[pdfLib]);

  async function goToPage(n:number) {
    if (!pdfDoc||renderingPage) return;
    const p=Math.max(1,Math.min(n,totalPages));
    setCurrentPageNo(p); setRenderingPage(true);
    setTracePoints([]); setTraceClosed(false); setElevGrips([]);
    try { setViewerUrl(await renderPage(pdfDoc,p,1.2)); }
    catch {} finally { setRenderingPage(false); }
  }

  async function extractCurrentPage() {
    if (!pdfDoc||!viewerUrl) return;
    const tag=TAB_TAGS[activeTab];
    if (extractedPages.find(p=>p.pageNumber===currentPageNo&&p.tag===tag)) return;
    const thumb = await renderPage(pdfDoc,currentPageNo,0.18);
    const pg:ExtractedPage = { id:`${activeTab}-${currentPageNo}`, pageNumber:currentPageNo, tag, thumbnail:thumb, scale:{...tabScales[activeTab]} };
    setExtractedPages(prev=>[...prev,pg]);
    setActiveExtracted(pg);
  }

  async function loadExtracted(pg:ExtractedPage) {
    setActiveExtracted(pg);
    if (!pdfDoc) return;
    setCurrentPageNo(pg.pageNumber); setRenderingPage(true);
    setTracePoints([]); setTraceClosed(false); setElevGrips([]);
    try {
      setViewerUrl(await renderPage(pdfDoc,pg.pageNumber,1.2));
      setTabScales(prev=>({...prev,[activeTab]:pg.scale}));
    } catch {} finally { setRenderingPage(false); }
  }

  // ── Scale ─────────────────────────────────────────────────────────────────
  const scale = tabScales[activeTab];
  function setScale(u:Partial<ScaleState>) { setTabScales(p=>({...p,[activeTab]:{...p[activeTab],...u}})); }

  function getImgPt(e:React.MouseEvent): Pt|null {
    if (!imgRef.current) return null;
    const r=imgRef.current.getBoundingClientRect();
    return { x:e.clientX-r.left, y:e.clientY-r.top };
  }

  function lockScale() {
    if (!scale.point1||!scale.point2||!scale.measurementInput) return;
    const dx=scale.point2.x-scale.point1.x, dy=scale.point2.y-scale.point1.y;
    const px=Math.sqrt(dx*dx+dy*dy);
    const ft=parseFloat(scale.measurementInput.replace(/[^0-9.]/g,""));
    if (!ft||ft<=0) return;
    setScale({ locked:true, pageUnitsPerFoot:px/ft, label:scale.measurementInput, pickingPoint:null });
  }

  // ── Viewer interaction ────────────────────────────────────────────────────
  function handleViewerMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    const pt=getImgPt(e); if (!pt) return;
    // Scale picking
    if (scale.pickingPoint&&!scale.locked) {
      if (scale.pickingPoint===1) setScale({ point1:pt, pickingPoint:2 });
      else setScale({ point2:pt, pickingPoint:null });
      return;
    }
    // Trace (floor)
    if (traceMode&&!traceClosed) { setTracePoints(prev=>[...prev,pt]); return; }
    // Grip (elevation)
    if (gripMode) { setGripStart(pt); setGripCurrent(pt); return; }
  }

  function handleViewerMouseMove(e:React.MouseEvent<HTMLDivElement>) {
    if (!gripMode||!gripStart) return;
    const pt=getImgPt(e); if (pt) setGripCurrent(pt);
  }

  function handleViewerMouseUp(e:React.MouseEvent<HTMLDivElement>) {
    if (!gripMode||!gripStart||!gripCurrent) return;
    const puf=tabScales.elevation.pageUnitsPerFoot;
    if (!puf||puf<=0) { setGripStart(null); setGripCurrent(null); return; }
    const x=Math.min(gripStart.x,gripCurrent.x);
    const y=Math.min(gripStart.y,gripCurrent.y);
    const w=Math.abs(gripCurrent.x-gripStart.x);
    const h=Math.abs(gripCurrent.y-gripStart.y);
    if (w<5||h<5) { setGripStart(null); setGripCurrent(null); return; }
    const lf=parseFloat((w/puf).toFixed(1));
    const heightFt=parseFloat((h/puf).toFixed(1));
    const bayLength=10, legs=Math.ceil(lf/bayLength)+1;
    const grip:ElevGrip = { id:`grip-${Date.now()}`, elevation:selectedElev, x,y,w,h, lf, heightFt, legs };
    setElevGrips(prev=>[...prev,grip]);
    setGripStart(null); setGripCurrent(null);
  }

  function handleViewerDblClick(e:React.MouseEvent) {
    if (traceMode&&tracePoints.length>=3) { e.preventDefault(); setTraceClosed(true); setTraceMode(false); }
  }

  // ── Store functions ───────────────────────────────────────────────────────
  function ensureBase() {
    if (!localStorage.getItem("korbanProjectData_v1")) {
      const base = { projectId:"KRB-260614-001", projectName:projectName||"New Project", projectAddress:"", customer:"", estimator:"", updatedAt:new Date().toISOString(), schemaVersion:1, takeoff:{ levels:[{ levelId:"main-level", levelName:"Main Level", elevations:[{ elevationId:"north-elevation", elevationName:"North", levelName:"Main Level", linearFeet:0, wallHeight:45, phase:"Main", mobilization:"Base Bid", overlayGeometry:null, scale:null, scaffoldInput:{ scaffoldWidth:3, standardBayLength:10, frameHeight:6.333, plankCountPerBay:3, bracePattern:"Every Bay", wallOffset:1 }, quantityEngine:{ bayCount:0,legCount:0,jumps:0,frameTall:7,frameCount:0,plankCount:0,crossBraceCount:0,guardrailCount:0,basePlateCount:0,screwJackCount:0 }, sectionView:{ frameMakeup:"",selectedRun:"",wallOffset:1,sectionType:"A-A" }, elevationBreakdown:[] }] }] } };
      localStorage.setItem("korbanProjectData_v1",JSON.stringify({"KRB-260614-001":base}));
      localStorage.setItem("korbanActiveProjectId","KRB-260614-001");
      localStorage.setItem("korbanActiveElevationId","north-elevation");
    }
  }

  function storeFloor() {
    try {
      ensureBase();
      const elev=getActiveElevation();
      const key=floorLevels.find(l=>l.isKeyFloor);
      const lf=parseFloat(key?.linealFeet||"0")||elev.linearFeet;
      const rows=floorLevels.map((level,i)=>({ id:i+1, isKeyFloor:level.isKeyFloor, overlayType:"Level", level:level.levelName, points:level.isKeyFloor?tracePoints:[], closed:traceClosed&&level.isKeyFloor, linealFeet:parseFloat(level.linealFeet)||0, color:level.color, pageNumber:currentPageNo }));
      saveActiveElevation({ ...elev, linearFeet:lf,
        scale:scale.locked?{ pageUnitsPerFoot:scale.pageUnitsPerFoot }:elev.scale,
        overlayGeometry:{ ...(elev.overlayGeometry??{ elevationName:elev.elevationName, levelName:"Main Level", tracedPerimeter:[], overlayPoints:[], wallSegments:[], referencePoints:[], elevationPoints:[], elevationRefs:[], elevationHeights:[], scale:null }), fullOverlayRows:rows, tracedPerimeter:tracePoints },
      });
      setFloorStored(true); setTimeout(()=>setFloorStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeElevations() {
    try {
      ensureBase();
      const elev=getActiveElevation();
      const puf=tabScales.elevation.pageUnitsPerFoot??1;
      // Build elevationHeights from grips
      const heightsByElev: Record<string,{total:number;count:number}> = {};
      elevGrips.forEach(g => {
        if (!heightsByElev[g.elevation]) heightsByElev[g.elevation]={ total:0, count:0 };
        heightsByElev[g.elevation].total += g.heightFt;
        heightsByElev[g.elevation].count += 1;
      });
      const elevationHeights = ELEVATION_DIRS.map(dir => ({
        elevation:dir,
        overallHeightInput: heightsByElev[dir] ? `${(heightsByElev[dir].total/heightsByElev[dir].count).toFixed(1)}'` : "",
        belowGradeEnabled:false, belowGradeInput:"", multipleHeights:false, areas:[],
      }));
      const existing=elev.overlayGeometry??{ elevationName:elev.elevationName, levelName:"Main Level", tracedPerimeter:[], overlayPoints:[], wallSegments:[], referencePoints:[], elevationPoints:[], fullOverlayRows:[], elevationRefs:[], scale:null };
      saveActiveElevation({ ...elev, overlayGeometry:{ ...existing, elevationHeights } });
      setElevStored(true); setTimeout(()=>setElevStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeSection() {
    try {
      ensureBase();
      const elev=getActiveElevation();
      const sec=sections.find(s=>s.id===activeSection)??sections[0];
      const makeupStr=sec.frameMakeup.filter(f=>f.qty>0).map(f=>`${f.qty} × ${f.description}`).join("\n");
      saveActiveElevation({ ...elev, sectionView:{ frameMakeup:makeupStr, selectedRun:"Run N-01", wallOffset:parseFloat(sec.wallOffset)||1, sectionType:sec.label } });
      setSectionStored(true); setTimeout(()=>setSectionStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeAll() { storeFloor(); storeElevations(); storeSection(); }

  function addSection() {
    if (sections.length>=4) return;
    const label=SECTION_LABELS[sections.length];
    const id=label.replace("-","").toLowerCase();
    setSections(prev=>[...prev,{ id, label, wallOffset:"1'", frameMakeup:FRAME_PARTS.map(p=>({...p})) }]);
    setActiveSection(id);
  }

  const tabPages=extractedPages.filter(p=>p.tag===TAB_TAGS[activeTab]);
  const activeSec=sections.find(s=>s.id===activeSection)??sections[0];
  const elevGripsForElev=elevGrips.filter(g=>g.elevation===selectedElev);

  // Live grip rectangle while dragging
  const liveGrip = gripStart&&gripCurrent ? {
    x:Math.min(gripStart.x,gripCurrent.x),
    y:Math.min(gripStart.y,gripCurrent.y),
    w:Math.abs(gripCurrent.x-gripStart.x),
    h:Math.abs(gripCurrent.y-gripStart.y),
  } : null;

  const PIECE_TYPES: { type:DraftPiece["type"]; label:string }[] = [
    { type:"frame",     label:"Frame"      },
    { type:"bracket10", label:"10\" Brkt"  },
    { type:"bracket20", label:"20\" Brkt"  },
    { type:"bracket30", label:"30\" Brkt"  },
    { type:"plank",     label:"Plank"      },
  ];

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
      <div className="flex items-center border-b border-zinc-900 bg-[#0b0b0b] px-6">
        {([{id:"floor",label:"Floor Plan",icon:"⊞"},{id:"elevation",label:"Elevations",icon:"↕"},{id:"section",label:"Section View",icon:"⊘"}] as {id:ActiveTab;label:string;icon:string}[]).map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.15em] border-b-2 transition ${activeTab===tab.id?"border-white text-white":"border-transparent text-zinc-600 hover:text-zinc-400"}`}>
            <span>{tab.icon}</span>{tab.label}
            {extractedPages.filter(p=>p.tag===TAB_TAGS[tab.id]).length>0&&(
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-bold">{extractedPages.filter(p=>p.tag===TAB_TAGS[tab.id]).length}</span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {scale.locked&&<span className="font-mono text-orange-400 opacity-60">⊠ {scale.label}</span>}
          {totalPages>0&&<span className="text-zinc-700">{totalPages} pages</span>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <aside className="flex w-[140px] flex-shrink-0 flex-col border-r border-zinc-900 bg-[#080604]">
          <div className="border-b border-zinc-900 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">{TAB_TAGS[activeTab]}</p>
          </div>
          {tabPages.length===0 ? (
            <div className="flex-1 flex items-center justify-center p-3">
              <p className="text-[8px] text-zinc-700 text-center leading-relaxed">Extract pages<br/>using toolbar</p>
            </div>
          ) : (
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
            <button onClick={()=>fileRef.current?.click()} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-white/30 hover:text-white">{pdfLoading?"Loading…":"Open PDF"}</button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value="";}}/>
            {totalPages>0&&(
              <div className="flex items-center gap-1">
                <button onClick={()=>goToPage(currentPageNo-1)} disabled={currentPageNo<=1||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">‹</button>
                <span className="text-[10px] font-mono text-zinc-500 px-1">{currentPageNo}/{totalPages}</span>
                <button onClick={()=>goToPage(currentPageNo+1)} disabled={currentPageNo>=totalPages||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">›</button>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button onClick={()=>setViewerZoom(z=>Math.max(0.3,z-0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">−</button>
              <span className="text-[9px] font-mono text-zinc-600 w-8 text-center">{Math.round(viewerZoom*100)}%</span>
              <button onClick={()=>setViewerZoom(z=>Math.min(4,z+0.15))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
              <button onClick={()=>setViewerZoom(1)} className="rounded border border-zinc-800 px-1.5 h-6 text-[9px] text-zinc-600 hover:text-white">Fit</button>
            </div>
            {totalPages>0&&<div className="h-4 w-px bg-zinc-800"/>}
            {totalPages>0&&(
              <button onClick={extractCurrentPage} className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-white/10">
                + Extract as {TAB_TAGS[activeTab]}
              </button>
            )}
            {totalPages>0&&<div className="h-4 w-px bg-zinc-800"/>}
            {/* Scale */}
            {!scale.locked?(
              <>
                <button onClick={()=>setScale({pickingPoint:scale.pickingPoint?null:1,point1:null,point2:null})}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${scale.pickingPoint?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>
                  ⟷ Scale {scale.pickingPoint?`pt${scale.pickingPoint}`:""}
                </button>
                {scale.point1&&scale.point2&&(
                  <div className="flex items-center gap-1">
                    <input value={scale.measurementInput} onChange={e=>setScale({measurementInput:e.target.value})} onKeyDown={e=>e.key==="Enter"&&lockScale()}
                      placeholder="e.g. 20'" className="w-16 rounded-lg border border-orange-500/50 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none focus:border-orange-500"/>
                    <button onClick={lockScale} className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-[10px] font-bold text-black hover:bg-orange-400">Lock</button>
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
            {/* Floor trace tools */}
            {activeTab==="floor"&&totalPages>0&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                <button onClick={()=>{setTraceMode(true);setFloorStarted(true);setTracePoints([]);setTraceClosed(false);}} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${traceMode?"border-blue-500 bg-blue-500/15 text-blue-300":"border-zinc-700 text-zinc-400 hover:border-blue-500/40"}`}>Start</button>
                <button onClick={()=>{if(tracePoints.length>=3){setTraceClosed(true);setTraceMode(false);}}} disabled={tracePoints.length<3||traceClosed} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${traceClosed?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500"} disabled:opacity-30`}>{traceClosed?"✓ Closed":"Close"}</button>
                {tracePoints.length>0&&<button onClick={()=>setTracePoints(p=>p.slice(0,-1))} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-zinc-300">Undo</button>}
                {tracePoints.length>0&&<button onClick={()=>{setTracePoints([]);setTraceClosed(false);setTraceMode(false);setFloorStarted(false);}} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-red-400">Clear</button>}
                {traceClosed&&<button onClick={storeFloor} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${floorStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{floorStored?"✓ Stored":"Store"}</button>}
              </>
            )}
            {/* Elevation grip tools */}
            {activeTab==="elevation"&&totalPages>0&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                {!scale.locked&&<span className="text-[9px] text-yellow-600">Set scale first</span>}
                {scale.locked&&<>
                  <button onClick={()=>{setGripMode(true);setElevStarted(true);}} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${gripMode?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}>{gripMode?"● Grip Active":"Add Grip"}</button>
                  {gripMode&&<button onClick={()=>setGripMode(false)} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">Done</button>}
                  {elevGrips.length>0&&<button onClick={()=>setElevGrips(prev=>prev.filter(g=>g.elevation!==selectedElev))} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-red-400">Clear {selectedElev}</button>}
                  {elevGrips.length>0&&<button onClick={storeElevations} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${elevStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{elevStored?"✓ Stored":"Store"}</button>}
                </>}
              </>
            )}
            {/* Section tools */}
            {activeTab==="section"&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                <button onClick={()=>setSectionStarted(true)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${sectionStarted?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-zinc-700 text-zinc-400 hover:border-emerald-500/40"}`}>{sectionStarted?"● Active":"Start"}</button>
                {sectionStarted&&<button onClick={()=>{setSectionStarted(false);}} className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white">Close</button>}
                {sectionStarted&&<button onClick={storeSection} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${sectionStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{sectionStored?"✓ Stored":"Store"}</button>}
              </>
            )}
          </div>

          {/* Canvas */}
          <div className="relative flex-1 overflow-auto bg-zinc-950 flex items-start justify-center p-6"
            onMouseDown={handleViewerMouseDown}
            onMouseMove={handleViewerMouseMove}
            onMouseUp={handleViewerMouseUp}
            onDoubleClick={handleViewerDblClick}
            style={{cursor:scale.pickingPoint?"crosshair":traceMode?"crosshair":gripMode?"crosshair":"default"}}>

            {!viewerUrl&&!pdfLoading&&(
              <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
                className="flex h-full w-full flex-col items-center justify-center gap-3 cursor-pointer">
                <span className="text-5xl opacity-15">📐</span>
                <p className="text-sm font-bold text-zinc-500">Open a PDF to begin</p>
                <p className="text-xs text-zinc-700">Click here or drag and drop</p>
              </div>
            )}
            {pdfLoading&&<div className="flex h-full items-center justify-center"><p className="text-xs text-zinc-600">Opening PDF…</p></div>}

            {viewerUrl&&(
              <div className="relative" style={{transform:`scale(${viewerZoom})`,transformOrigin:"top center",userSelect:"none"}}>
                <img ref={imgRef} src={viewerUrl} alt="" draggable={false}
                  className="block rounded-lg shadow-2xl border border-zinc-800 select-none"
                  style={{maxWidth:"100%",opacity:renderingPage?0.5:1,transition:"opacity 0.15s"}}/>

                <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{width:"100%",height:"100%"}}>
                  {/* Floor trace */}
                  {tracePoints.length>=2&&<polyline points={[...tracePoints,...(traceClosed?[tracePoints[0]]:[])].map(p=>`${p.x},${p.y}`).join(" ")} fill={traceClosed?"rgba(249,115,22,0.08)":"none"} stroke="#f97316" strokeWidth="1.5" strokeDasharray={traceClosed?"none":"4,3"}/>}
                  {tracePoints.map((pt,i)=>(
                    <g key={i}>
                      <circle cx={pt.x} cy={pt.y} r="5" fill="#f97316" opacity="0.9"/>
                      <text x={pt.x+8} y={pt.y-6} fontSize="8" fill="#f97316" fontFamily="monospace" fontWeight="bold">{i+1}</text>
                    </g>
                  ))}
                  {/* Scale pts */}
                  {scale.point1&&(
                    <g>
                      <line x1={scale.point1.x-12} y1={scale.point1.y} x2={scale.point1.x+12} y2={scale.point1.y} stroke="#f97316" strokeWidth="1.5"/>
                      <line x1={scale.point1.x} y1={scale.point1.y-12} x2={scale.point1.x} y2={scale.point1.y+12} stroke="#f97316" strokeWidth="1.5"/>
                      <circle cx={scale.point1.x} cy={scale.point1.y} r="4" fill="#f97316" opacity="0.9"/>
                      <circle cx={scale.point1.x} cy={scale.point1.y} r="9" fill="none" stroke="#f97316" strokeWidth="0.8" opacity="0.4"/>
                      <text x={scale.point1.x+12} y={scale.point1.y-10} fontSize="9" fill="#f97316" fontFamily="monospace" fontWeight="bold">①</text>
                    </g>
                  )}
                  {scale.point2&&(
                    <g>
                      <line x1={scale.point2.x-12} y1={scale.point2.y} x2={scale.point2.x+12} y2={scale.point2.y} stroke="#f97316" strokeWidth="1.5"/>
                      <line x1={scale.point2.x} y1={scale.point2.y-12} x2={scale.point2.x} y2={scale.point2.y+12} stroke="#f97316" strokeWidth="1.5"/>
                      <circle cx={scale.point2.x} cy={scale.point2.y} r="4" fill="#f97316" opacity="0.9"/>
                      <circle cx={scale.point2.x} cy={scale.point2.y} r="9" fill="none" stroke="#f97316" strokeWidth="0.8" opacity="0.4"/>
                      <text x={scale.point2.x+12} y={scale.point2.y-10} fontSize="9" fill="#f97316" fontFamily="monospace" fontWeight="bold">②</text>
                    </g>
                  )}
                  {scale.point1&&scale.point2&&<line x1={scale.point1.x} y1={scale.point1.y} x2={scale.point2.x} y2={scale.point2.y} stroke="#f97316" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"/>}
                  {/* Elevation grips */}
                  {elevGrips.map(g=>(
                    <g key={g.id}>
                      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="1.5" strokeDasharray="none"/>
                      <text x={g.x+4} y={g.y+14} fontSize="9" fill="#f97316" fontFamily="monospace" fontWeight="bold">{g.lf}LF × {g.heightFt}'</text>
                      <text x={g.x+4} y={g.y+25} fontSize="8" fill="#f97316" fontFamily="monospace" opacity="0.7">{g.legs} legs · {g.elevation}</text>
                      {/* close btn */}
                      <rect x={g.x+g.w-14} y={g.y+2} width={12} height={12} rx="3" fill="#ef4444" opacity="0.8" style={{cursor:"pointer"}} onClick={()=>setElevGrips(prev=>prev.filter(x=>x.id!==g.id))}/>
                      <text x={g.x+g.w-8} y={g.y+11} fontSize="8" fill="white" textAnchor="middle" fontWeight="bold" style={{pointerEvents:"none"}}>✕</text>
                    </g>
                  ))}
                  {/* Live grip rect */}
                  {liveGrip&&liveGrip.w>0&&liveGrip.h>0&&(
                    <rect x={liveGrip.x} y={liveGrip.y} width={liveGrip.w} height={liveGrip.h} fill="rgba(249,115,22,0.08)" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5,3"/>
                  )}
                </svg>
                {renderingPage&&<div className="absolute inset-0 flex items-center justify-center"><p className="text-xs text-zinc-500 bg-black/60 px-3 py-1.5 rounded-lg">Loading…</p></div>}
              </div>
            )}
          </div>
        </section>

        {/* Right panel */}
        <aside className="flex w-[240px] flex-shrink-0 flex-col border-l border-zinc-900 bg-[#080604] overflow-y-auto">

          {/* ── FLOOR PLAN ── */}
          {activeTab==="floor"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Floor Levels</p>
                {floorLevels.map((level,i)=>(
                  <div key={level.id} className={`rounded-xl border p-3 space-y-2 ${level.isKeyFloor?"border-orange-500/40 bg-orange-500/5":"border-zinc-800 bg-black"}`}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{background:level.color}}/>
                      <input value={level.levelName} onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,levelName:e.target.value}:l))} className="flex-1 min-w-0 bg-transparent text-[10px] font-bold text-zinc-200 outline-none border-b border-zinc-700 pb-0.5"/>
                      {!level.isKeyFloor&&<button onClick={()=>setFloorLevels(prev=>prev.filter((_,j)=>j!==i))} className="text-[9px] text-zinc-700 hover:text-red-400">✕</button>}
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-600">Lineal Feet</label>
                      <input value={level.linealFeet} placeholder="e.g. 625" onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,linealFeet:e.target.value}:l))} className="w-full mt-0.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[10px] font-mono text-orange-300 outline-none focus:border-orange-500/50"/>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-zinc-600 uppercase tracking-wider">{level.isKeyFloor?"★ Main Floor":"Level"}</span>
                      {!level.isKeyFloor&&<button onClick={()=>setFloorLevels(prev=>prev.map(l=>({...l,isKeyFloor:l.id===level.id})))} className="text-[8px] border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300">Set as Main</button>}
                    </div>
                  </div>
                ))}
                <button onClick={()=>setFloorLevels(prev=>[...prev,{id:`lvl-${Date.now()}`,levelName:`Level ${prev.length}`,isKeyFloor:false,linealFeet:"",color:LEVEL_COLORS[prev.length%LEVEL_COLORS.length]}])} className="w-full rounded-xl border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition">+ Add Level</button>
                {tracePoints.length>0&&(
                  <div className="rounded-xl border border-zinc-800 bg-black p-3 space-y-1">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Trace</p>
                    <div className="flex justify-between text-[9px]"><span className="text-zinc-600">Points</span><span className="font-mono text-zinc-300">{tracePoints.length}</span></div>
                    <div className="flex justify-between text-[9px]"><span className="text-zinc-600">Closed</span><span className={`font-mono font-bold ${traceClosed?"text-emerald-300":"text-zinc-600"}`}>{traceClosed?"Yes":"No"}</span></div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-zinc-900 flex gap-2">
                <button onClick={storeFloor} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition ${floorStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{floorStored?"✓ Stored":"Store Floor Plan"}</button>
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
                    <button key={dir} onClick={()=>setSelectedElev(dir)} className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${selectedElev===dir?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-orange-500/40"}`}>{dir}</button>
                  ))}
                </div>
                {/* Grip coverage areas */}
                {elevGripsForElev.length>0&&(
                  <div className="space-y-2">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{selectedElev} Coverage Areas</p>
                    {elevGripsForElev.map((g,i)=>(
                      <div key={g.id} className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-orange-300">Area {i+1}</span>
                          <button onClick={()=>setElevGrips(prev=>prev.filter(x=>x.id!==g.id))} className="text-[9px] text-zinc-600 hover:text-red-400">✕</button>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mt-1.5">
                          <div className="text-center"><p className="text-[8px] text-zinc-600">LF</p><p className="font-mono text-[10px] text-orange-300 font-bold">{g.lf}</p></div>
                          <div className="text-center"><p className="text-[8px] text-zinc-600">Height</p><p className="font-mono text-[10px] text-orange-300 font-bold">{g.heightFt}'</p></div>
                          <div className="text-center"><p className="text-[8px] text-zinc-600">Legs</p><p className="font-mono text-[10px] text-orange-300 font-bold">{g.legs}</p></div>
                        </div>
                      </div>
                    ))}
                    {/* Summary */}
                    <div className="rounded-xl border border-zinc-800 bg-black p-2.5">
                      <p className="text-[9px] text-zinc-500 mb-1">{selectedElev} Total</p>
                      <div className="flex justify-between text-[9px]"><span className="text-zinc-600">Total LF</span><span className="font-mono text-orange-300">{elevGripsForElev.reduce((s,g)=>s+g.lf,0).toFixed(1)}</span></div>
                      <div className="flex justify-between text-[9px]"><span className="text-zinc-600">Avg Height</span><span className="font-mono text-orange-300">{elevGripsForElev.length?(elevGripsForElev.reduce((s,g)=>s+g.heightFt,0)/elevGripsForElev.length).toFixed(1)+"'":"—"}</span></div>
                      <div className="flex justify-between text-[9px]"><span className="text-zinc-600">Total Legs</span><span className="font-mono text-orange-300">{elevGripsForElev.reduce((s,g)=>s+g.legs,0)}</span></div>
                    </div>
                  </div>
                )}
                {elevGripsForElev.length===0&&(
                  <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
                    <p className="text-[9px] text-zinc-600 leading-relaxed">Set scale, then drag grip rectangles over elevation areas on the drawing</p>
                  </div>
                )}
                {/* All elevations summary */}
                <div className="rounded-xl border border-zinc-800 bg-black p-3">
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">All Elevations</p>
                  {ELEVATION_DIRS.map(dir=>{
                    const grips=elevGrips.filter(g=>g.elevation===dir);
                    return (
                      <div key={dir} className="flex justify-between text-[9px] py-0.5">
                        <span className="text-zinc-600">{dir}</span>
                        <span className={`font-mono font-bold ${grips.length?"text-orange-300":"text-zinc-700"}`}>
                          {grips.length?`${grips.reduce((s,g)=>s+g.lf,0).toFixed(0)}LF · ${(grips.reduce((s,g)=>s+g.heightFt,0)/grips.length).toFixed(0)}'`:"—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button onClick={storeElevations} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${elevStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{elevStored?"✓ Stored":"Store Elevations"}</button>
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
                    <button key={sec.id} onClick={()=>setActiveSection(sec.id)} className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${activeSection===sec.id?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}>{sec.label}</button>
                  ))}
                  {sections.length<4&&<button onClick={addSection} className="rounded-lg border border-dashed border-zinc-700 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-400">+ Add</button>}
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 block mb-1">Wall Offset</label>
                  <input value={activeSec.wallOffset} placeholder="1'" onChange={e=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOffset:e.target.value}:s))} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-orange-300 outline-none focus:border-orange-500/50"/>
                </div>
                {/* Frame makeup inventory */}
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">Frame Makeup</p>
                  <div className="space-y-1">
                    {activeSec.frameMakeup.map((item,i)=>(
                      <div key={item.partNo} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-black px-2 py-1.5">
                        <span className="text-[8px] font-mono text-orange-400 w-12 flex-shrink-0">{item.partNo}</span>
                        <span className="text-[9px] text-zinc-500 flex-1 truncate">{item.description}</span>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,frameMakeup:s.frameMakeup.map((f,j)=>j===i?{...f,qty:Math.max(0,f.qty-1)}:f)}:s))} className="w-5 h-5 rounded border border-zinc-700 text-zinc-500 hover:text-white text-[10px] font-bold flex items-center justify-center">−</button>
                          <span className="font-mono text-[10px] text-orange-300 w-5 text-center">{item.qty}</span>
                          <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,frameMakeup:s.frameMakeup.map((f,j)=>j===i?{...f,qty:f.qty+1}:f)}:s))} className="w-5 h-5 rounded border border-zinc-700 text-zinc-500 hover:text-white text-[10px] font-bold flex items-center justify-center">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Drafting tools */}
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">Drafting Tools</p>
                  <p className="text-[8px] text-zinc-700 mb-2">Drag pieces onto section canvas below</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PIECE_TYPES.map(pt=>(
                      <div key={pt.type}
                        draggable
                        onDragStart={e=>{e.dataTransfer.setData("pieceType",pt.type);}}
                        className="flex flex-col items-center gap-1 rounded-xl border border-zinc-800 bg-black p-2 cursor-grab hover:border-orange-500/40 transition active:cursor-grabbing">
                        <PieceShape type={pt.type} size={36}/>
                        <span className="text-[8px] text-zinc-500">{pt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section draft canvas */}
                {sectionStarted&&(
                  <div>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Section Draft — {activeSec.label}</p>
                    <div ref={draftRef}
                      className="relative rounded-xl border border-zinc-700 bg-zinc-950 overflow-hidden"
                      style={{height:180}}
                      onDragOver={e=>e.preventDefault()}
                      onDrop={e=>{
                        e.preventDefault();
                        const type=e.dataTransfer.getData("pieceType") as DraftPiece["type"];
                        if (!type) return;
                        const rect=draftRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        setDraftPieces(prev=>[...prev,{id:`piece-${Date.now()}`,type,x:e.clientX-rect.left-20,y:e.clientY-rect.top-20}]);
                      }}>
                      {/* Ground line */}
                      <div className="absolute bottom-6 left-0 right-0 border-t border-zinc-700"/>
                      {/* Wall */}
                      <div className="absolute left-4 top-0 bottom-6 w-2 bg-zinc-700 rounded-sm"/>
                      {draftPieces.map(piece=>(
                        <div key={piece.id}
                          className="absolute cursor-move select-none"
                          style={{left:piece.x,top:piece.y}}
                          onMouseDown={e=>{
                            e.preventDefault();
                            const startX=e.clientX-piece.x, startY=e.clientY-piece.y;
                            const onMove=(ev:MouseEvent)=>setDraftPieces(prev=>prev.map(p=>p.id===piece.id?{...p,x:ev.clientX-startX,y:ev.clientY-startY}:p));
                            const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
                            document.addEventListener("mousemove",onMove);
                            document.addEventListener("mouseup",onUp);
                          }}
                          onDoubleClick={()=>setDraftPieces(prev=>prev.filter(p=>p.id!==piece.id))}>
                          <PieceShape type={piece.type} size={32}/>
                        </div>
                      ))}
                      {draftPieces.length===0&&<p className="absolute inset-0 flex items-center justify-center text-[8px] text-zinc-700">Drag pieces here</p>}
                    </div>
                    <p className="text-[8px] text-zinc-700 mt-1">Double-click piece to remove</p>
                  </div>
                )}

                {/* Preview */}
                {activeSec.frameMakeup.some(f=>f.qty>0)&&(
                  <div className="rounded-xl border border-zinc-800 bg-black p-3">
                    <p className="text-[9px] text-zinc-500 mb-1.5">Section {activeSec.label}</p>
                    {activeSec.frameMakeup.filter(f=>f.qty>0).map(f=>(
                      <div key={f.partNo} className="flex gap-2 text-[9px] py-0.5">
                        <span className="font-mono text-orange-400 w-12">{f.partNo}</span>
                        <span className="text-zinc-400 flex-1">{f.description}</span>
                        <span className="font-mono text-zinc-300">{f.qty}</span>
                      </div>
                    ))}
                  </div>
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
