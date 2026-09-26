"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KorbanGuidance, KorbanHeader, type KorbanGuidanceFlag, type KorbanGuidanceStep, type KorbanMenuLink } from "@/components/korban";
import {
  switchElevationTier,
  calculateQuantityEngine,
  type StoredHighlight,
  courtyardQuantities,
  createProject,
  updateActiveProject,
  parseFeetInches, alignOverlayRows, computeFrameMakeup, DEPTH_ORDER, getActiveElevation, getActiveProject, getEstimateDepth, planksPerBayForWidth, saveActiveElevation, setEstimateDepth, type EstimateDepth } from "@/lib/projectStore";
import { clearPlanSheet, loadPlanSheet, savePlanPage, savePlanSheet } from "@/lib/planStore";
import { getBackendSettings } from "@/lib/backendStore";
import QuickBidForm from "@/components/quick-bid-form";

// -- Types --------------------------------------------------------------------
type PageTag        = "Floor Plan" | "Elevation View" | "Section View";
type ActiveTab      = "floor" | "elevation" | "section";
/** Top-level tabs are now bid depths; tools live as panels inside each. */
type DepthTab       = "quick-bid" | "full-bid" | "korban-bid";
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
   * Per-level anchor point - a fixed feature (column, corner, grid
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
   * corresponds to - the missing link that lets Korban derive a run's
   * base elevation (e.g. a podium wall tagged From: Level 4 starts at
   * whatever height the Level 1-4 grip measured). Null = untagged,
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
  /**
   * topOfWallDistance is the WALL'S OWN HEIGHT in feet. The top working deck
   * lands a worker's reach below it, which the frame engine subtracts. It is
   * not a clearance measurement - naming it "distance" is a holdover.
   */
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

/**
 * Level colours.
 *
 * The old set put orange next to amber, which on a dark plan at low zoom is
 * the same colour twice. These are spaced around the wheel so two traces are
 * never mistaken for each other, and any of them can be changed per level.
 */
const LEVEL_COLORS = ["#f97316","#22d3ee","#a855f7","#84cc16","#fb7185","#fbbf24"];

/** What a level can be changed to. Fixed, so the drawing stays coherent. */
const LEVEL_PALETTE = [
  "#f97316","#fb923c","#fbbf24","#84cc16","#22c55e","#14b8a6",
  "#22d3ee","#60a5fa","#a855f7","#e879f9","#fb7185","#f4f4f5",
];

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
    { partNo:"B82",        description:"8x2 Cross Brace",         qty:0 },
    { partNo:"GR8",        description:"8' Guard Rail",           qty:0 },
    { partNo:"CPS",        description:"Coupling Pin",            qty:0 },
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

/**
 * A courtyard reuses the exact same shape as building elevations, so all
 * the existing grip/tag logic works on it unchanged - it's just stored
 * and totalled separately. Faces default to N/E/S/W but the estimator
 * decides which are actually used; three walls and an open side is
 * common, so unused faces simply never get gripped.
 */
type Courtyard = { id: string; name: string; faces: ElevationData[] };

function makeCourtyard(index: number): Courtyard {
  const id = `courtyard-${index}-${Date.now()}`;
  return {
    id,
    name: `Courtyard ${index}`,
    faces: ELEVATION_DIRS.map(d => ({ direction: d, areas: [1,2,3].map(i => newElevArea(i, `${id}-${d}`)) })),
  };
}

const TAB_TAGS: Record<ActiveTab,PageTag> = { floor:"Floor Plan", elevation:"Elevation View", section:"Section View" };

const menuLinks: KorbanMenuLink[] = [
  { href:"/takeoff-workspace",        label:"Standard Takeoff"  },
  { href:"/takeoff-workspace-aerial", label:"Aerial Takeoff"    },
  { href:"/set-scaffold-v2",          label:"Set Scaffold"      },
];

/** Turns a width label into feet. "3'-6"" is 3.5, "5'" is 5. */
function parseFt(v: string): number {
  const feetInches = v.match(/(\d+)['\u2032]\s*-?\s*(\d+)/);
  if (feetInches) return parseInt(feetInches[1]) + parseInt(feetInches[2]) / 12;
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

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

// -- Tooltip component --------------------------------------------------------
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

// -- Main Page ----------------------------------------------------------------
export default function TakeoffWorkspaceAdvancedPage() {
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("elevation");
  // Which bid depth is open. Higher depths build on lower ones - work
  // carries forward, never backward.
  const [depthTab,       setDepthTab]       = useState<DepthTab>("quick-bid");
  const [guideHidden,    setGuideHidden]    = useState(false);
  const [pdfDoc,         setPdfDoc]         = useState<any>(null);
  const [pdfLib,         setPdfLib]         = useState<any>(null);
  /** The original upload, kept so an image can be re-rotated from source. */
  const [imageSource,    setImageSource]    = useState<string>("");
  const [pdfLoading,     setPdfLoading]     = useState(false);
  const [currentPageNo,  setCurrentPageNo]  = useState(1);
  const [pageNoInput,    setPageNoInput]    = useState("1");
  const [totalPages,     setTotalPages]     = useState(0);
  const [viewerUrl,      setViewerUrl]      = useState("");
  const [renderingPage,  setRenderingPage]  = useState(false);
  const [viewerZoom,     setViewerZoom]     = useState(0.65);
  /**
   * Sheet rotation, in degrees. Applied when the page is rendered rather than
   * by spinning the image in CSS - a CSS rotation would leave every traced
   * point and scale line pointing at the old orientation.
   */
  const [rotation,       setRotation]       = useState(0);
  /** The sheet's own pixel size. Everything on the page is measured in these. */
  const [naturalSize,    setNaturalSize]    = useState({ w: 0, h: 0 });
  /** When this takeoff was last written down. Null means not yet, this session. */
  const [lastSaved,      setLastSaved]      = useState<Date | null>(null);
  /** What the cursor would snap to right now, so the user sees it before clicking. */
  const [snapPreview,    setSnapPreview]    = useState<{ pt: Pt; kind: "ref" | "corner" } | null>(null);
  /** Which level's colour swatch is open. */
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  /** Point-to-point measuring. Independent of everything else on the sheet. */
  const [measureMode,    setMeasureMode]    = useState(false);
  /** True whenever a tool is waiting for a click on the sheet. */
  const [measureFrom,    setMeasureFrom]    = useState<Pt|null>(null);
  const [measureTo,      setMeasureTo]      = useState<Pt|null>(null);
  const [measurements,   setMeasurements]   = useState<{ a: Pt; b: Pt; ft: number }[]>([]);
  /** Advice you cannot close is nagging. Both panels dismiss independently. */
  const [walkthroughHidden, setWalkthroughHidden] = useState(false);
  const [readsItHidden,     setReadsItHidden]     = useState(false);
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
  /*
   * The highlighter.
   *
   * Full Bid's way onto a floor plan: press at one end of a face, drag to the
   * other, release. The stroke owns everything inside its length - setbacks,
   * pop-outs, every in and out - the way a project manager's marker does when
   * he shows a crew where they are working.
   */
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights,    setHighlights]    = useState<StoredHighlight[]>([]);
  /** One elevation tile per stroke, kept in step with them. */
  const [highlightElev, setHighlightElev] = useState<ElevationData[]>([]);
  /** The tile a swipe will fill. Tiles come first; the stroke measures one. */
  const [activeHighlight, setActiveHighlight] = useState<string|null>(null);
  const [strokeFrom,    setStrokeFrom]    = useState<{x:number;y:number}|null>(null);
  const [strokeTo,      setStrokeTo]      = useState<{x:number;y:number}|null>(null);
  const [gripStart,     setGripStart]     = useState<Pt|null>(null);
  const [gripCurrent,   setGripCurrent]   = useState<Pt|null>(null);
  const [elevStored,    setElevStored]    = useState(false);
  const [dupSouth,      setDupSouth]      = useState(false);
  const [dupWest,       setDupWest]       = useState(false);
  // Courtyards - interior voids gripped like elevations but stored and
  // totalled separately. activeZone is "building" (shown as
  // "Exterior" in the UI) or a courtyard id.
  const [courtyards,    setCourtyards]    = useState<Courtyard[]>([]);
  const [activeZone,    setActiveZone]    = useState<string>("building");
  const [includeCourtyards, setIncludeCourtyards] = useState(true);

  // Section
  const [sections,        setSections]        = useState<SectionView[]>([]);
  const [activeSection,   setActiveSection]   = useState("aa");
  const [wallOutlineMode, setWallOutlineMode] = useState(false);
  const [sectionStored,   setSectionStored]   = useState(false);

  const [projectName, setProjectName]   = useState("");
  const [backendSettings, setBackendSettings] = useState<any>(null);
  // Estimate depth gates which tabs are available. Quick Bid is
  // elevations-only; floor plans and sections unlock further up.
  const [estimateDepth, setEstimateDepthState] = useState<EstimateDepth>("korban-bid");
  const fileRef  = useRef<HTMLInputElement>(null);
  const imgRef   = useRef<HTMLImageElement>(null);
  const viewerRef= useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setProjectName(getActiveProject().projectName||"");
      const depth = getEstimateDepth();
      setEstimateDepthState(depth);
      setDepthTab(depth as DepthTab);
      try{ setGuideHidden(localStorage.getItem("korbanGuideHidden")==="1"); }catch{}
      setActiveTab(depth === "quick-bid" ? "elevation" : "floor");
      const bs = getBackendSettings();
      setBackendSettings(bs);
      const wallOff = bs?.scaffold?.wallOffset ?? 1;
      // Top of Wall is the wall's own height. The top working deck lands a
      // worker's reach below it, which the frame engine subtracts - seeding
      // this with the reach height made every section one frame tall.
      const topOfWall = getActiveElevation()?.wallHeight ?? 0;
      const fw: ScaffoldWidth = "3'";
      setSections([{ id:"aa", label:"A-A", wallOffset:wallOff, topOfWallDistance:topOfWall, frameWidth:fw, wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts(fw), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    } catch {
      setSections([{ id:"aa", label:"A-A", wallOffset:1, topOfWallDistance:0, frameWidth:"3'", wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts("3'"), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    }
  }, []);

  /**
   * Brings the plan set back first.
   *
   * The overlay only draws over a sheet - there is no such thing as a trace
   * floating on nothing - so the sheet has to arrive before anything else is
   * worth restoring. It comes from IndexedDB, at the page it was left on.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projectId = getActiveProject()?.projectId;
        if (!projectId) return;
        const plan = await loadPlanSheet(projectId);
        if (!plan || cancelled) return;
        await openPlan(plan.data, plan.mimeType, plan.fileName, plan.pageNumber ?? 1, false);
      } catch {
        // No stored sheet is the normal case on a new bid.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Puts the takeoff back when the page reopens.
   *
   * Everything here was already being written to the project store - which is
   * why Set Scaffold still showed the layout after leaving this page - but
   * nothing ever read it back. Every trace, reference point and grip lived in
   * React state and died the moment the component unmounted, so returning to
   * Takeoff meant starting the whole job again.
   *
   * What comes back: traced outlines, their reference points, colours, level
   * names and lineal feet; the locked scales; and the gripped figures per
   * elevation.
   *
   * What cannot: the plan sheet itself, which is far too large to keep in
   * browser storage, and the drawn grip rectangles, which are not stored -
   * only the numbers they produced. So the sheet needs re-uploading, but
   * nothing needs re-tracing or re-measuring.
   */
  useEffect(() => {
    try {
      const elev = getActiveElevation();
      const geo = elev?.overlayGeometry;
      if (!geo) return;

      const rows = geo.fullOverlayRows ?? [];
      if (rows.length > 0) {
        setFloorLevels(rows.map((row, i) => ({
          id: `lvl-${row.id ?? i}`,
          levelName: row.level || `Level ${i + 1}`,
          isKeyFloor: Boolean(row.isKeyFloor),
          linealFeet: row.linealFeet ?? 0,
          color: row.color || LEVEL_COLORS[i % LEVEL_COLORS.length],
          tracePoints: (row.points ?? []) as Pt[],
          traceClosed: Boolean(row.closed),
          traceMode: false,
          stored: true,
          refPoint: ((row as unknown as { refPoint?: Pt | null }).refPoint ?? null),
        })));
        setOverlayStored(true);
        setLastSaved(new Date());
      }

      // A locked scale is the thing most expensive to redo, and the easiest
      // to get subtly wrong the second time.
      const puf = (geo.scale as { pageUnitsPerFoot?: number } | null)?.pageUnitsPerFoot
        ?? (elev.scale as { pageUnitsPerFoot?: number } | null)?.pageUnitsPerFoot;
      if (puf && puf > 0) {
        setTabScales(prev => ({
          ...prev,
          floor:     { ...prev.floor,     locked: true, pageUnitsPerFoot: puf, label: "" },
          elevation: { ...prev.elevation, locked: true, pageUnitsPerFoot: puf, label: "" },
        }));
      }

      /*
       * Every section takes the gripped wall height. One height per job, from
       * the one place it was measured.
       */
      const grippedHeight = elev.wallHeight ?? 0;
      // Highlighter strokes come back with everything else.
      if ((elev.highlights ?? []).length > 0) setHighlights(elev.highlights);

      // Traced sections come back the same as everything else does.
      const storedSections = elev.sectionViews ?? [];
      if (storedSections.length > 0) {
        setSections(storedSections.map(row => ({
          id: row.id,
          label: row.label,
          wallOffset: row.wallOffset,
          topOfWallDistance: grippedHeight > 0 ? grippedHeight : row.topOfWallDistance,
          frameWidth: (row.frameWidth as ScaffoldWidth) || "3'",
          wallOutline: row.wallOutline.map(p => ({ x: p.x, y: p.y })),
          wallComplete: row.wallOutline.length >= 2,
          scaffoldSide: row.scaffoldSide,
          frameMakeup: getFrameParts((row.frameWidth as ScaffoldWidth) || "3'"),
          totalLF: 0, totalLegs: 0, totalFrames: 0, totalPlanks: 0,
        })));
        setActiveSection(storedSections[0].id);
        const withScale = storedSections.find(row => (row.pageUnitsPerFoot ?? 0) > 0);
        if (withScale?.pageUnitsPerFoot) {
          setTabScales(prev => ({
            ...prev,
            section: {
              ...prev.section, locked: true,
              pageUnitsPerFoot: withScale.pageUnitsPerFoot,
              label: withScale.scaleLabel || "",
            },
          }));
        }
        setSectionStored(true);
      }

      const heights = geo.elevationHeights ?? [];
      if (heights.length > 0) {
        setElevData(prev => prev.map(ed => {
          const stored = heights.find(h => h.elevation === ed.direction);
          if (!stored?.areas?.length) return ed;
          return {
            ...ed,
            areas: stored.areas.map((a, i) => ({
              id: `${ed.direction}-restored-${i}`,
              areaIndex: a.areaIndex ?? i + 1,
              // The box itself was never stored, only what it measured.
              rect: null,
              lf: a.lf ?? 0,
              heightFt: a.heightFt ?? 0,
              frameTall: a.frameTall ?? 0,
              legs: a.legs ?? 0,
              bayCount: a.bayCount ?? 0,
              stored: true,
              fromLevelId: a.fromLevelId ?? null,
              toLevelId: a.toLevelId ?? null,
            })),
          };
        }));
        setElevStored(true);
      }
    } catch {
      // A project with nothing stored yet is the normal case on a new bid.
    }
  }, []);

  async function getPdfLib() {
    if (pdfLib) return pdfLib;
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs",import.meta.url).toString();
    setPdfLib(lib); return lib;
  }

  async function renderPage(pdf:any, n:number, sc:number, rot:number = rotation): Promise<string> {
    const page=await pdf.getPage(n);
    const vp=page.getViewport({ scale:sc, rotation:rot });
    const canvas=document.createElement("canvas");
    canvas.width=vp.width; canvas.height=vp.height;
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle="#18181b"; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({ canvasContext:ctx, viewport:vp }).promise;
    return canvas.toDataURL("image/jpeg",0.82);
  }

  // Real fit - calculates zoom from image natural size vs container
  function fitToViewer() {
    if (!imgRef.current || !viewerRef.current) return;
    const containerRect = viewerRef.current.getBoundingClientRect();
    const vw = containerRect.width - 64, vh = containerRect.height - 64;
    const iw = imgRef.current.naturalWidth, ih = imgRef.current.naturalHeight;
    if (!iw || !ih || vw <= 0 || vh <= 0) { setViewerZoom(0.65); return; }
    // A hair under a true fit so the sheet does not touch the panel edges.
    const fit = Math.min(vw / iw, vh / ih) * 0.98;
    setViewerZoom(fit > 0 && isFinite(fit) ? fit : 0.65);
  }

  /**
   * Records the sheet's own pixel size, which everything else is measured in.
   *
   * onLoad alone is not enough: a cached image is already decoded by the time
   * React attaches the handler, so the event never fires and the size stays at
   * zero - which made the zoom silently do nothing on any page viewed twice.
   * The effect below covers that case.
   */
  function handleImgLoad() {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  useEffect(() => {
    if (!viewerUrl) { setNaturalSize({ w: 0, h: 0 }); return; }
    let cancelled = false;
    // Decoded already? Take it now. Otherwise measure it off-document, which
    // works whether the browser serves it from cache or the network.
    const current = imgRef.current;
    if (current?.complete && current.naturalWidth) {
      setNaturalSize({ w: current.naturalWidth, h: current.naturalHeight });
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setNaturalSize({ w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.src = viewerUrl;
    return () => { cancelled = true; };
  }, [viewerUrl]);

  /**
   * Opens a plan set, and keeps it.
   *
   * The sheet is written to IndexedDB against this project so reopening the
   * page finds it again. Without that, an estimator came back to an empty
   * viewer with a perfectly good takeoff sitting unreadable behind it, and the
   * only way forward was to do the job over.
   */
  const openPlan = useCallback(async (
    buf: ArrayBuffer, mimeType: string, fileName: string, page = 1, persist = true,
  ) => {
    const isImg = mimeType.startsWith("image/");
    setPdfLoading(true); setViewerUrl(""); setPdfDoc(null);
    setExtractedPages([]); setActiveExtracted(null);
    setCurrentPageNo(page); setPageNoInput(String(page));
    try {
      if (isImg) {
        const url = URL.createObjectURL(new Blob([buf], { type: mimeType }));
        setImageSource(url);
        setViewerUrl(url); setTotalPages(1);
      } else {
        const lib = await getPdfLib();
        // pdf.js takes ownership of the buffer it is given, so it gets a copy
        // and the original stays intact for storing.
        const pdf = await lib.getDocument({ data: buf.slice(0) }).promise;
        setPdfDoc(pdf); setTotalPages(pdf.numPages);
        const wanted = Math.min(Math.max(1, page), pdf.numPages);
        setCurrentPageNo(wanted); setPageNoInput(String(wanted));
        setViewerUrl(await renderPage(pdf, wanted, 1.2));
      }
      if (persist) {
        const projectId = getActiveProject()?.projectId;
        if (projectId) {
          void savePlanSheet(projectId, {
            data: buf, fileName, mimeType, pageNumber: page, savedAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) { console.error(e); } finally { setPdfLoading(false); }
  }, [pdfLib]);

  const handleFile = useCallback(async (file:File) => {
    if (!file) return;
    const isImg=file.type.startsWith("image/"), isPdf=file.type==="application/pdf";
    if (!isImg&&!isPdf) return;
    const buf = await file.arrayBuffer();
    await openPlan(buf, file.type, file.name, 1, true);
  },[openPlan]);

  /** Turns the sheet a quarter at a time and re-renders at the new angle. */
  async function rotateSheet() {
    const next = (rotation + 90) % 360;
    setRotation(next);
    if (pdfDoc) {
      setRenderingPage(true);
      try { setViewerUrl(await renderPage(pdfDoc, currentPageNo, 1.2, next)); }
      catch {} finally { setRenderingPage(false); }
      return;
    }
    if (!imageSource) return;
    // An uploaded image has no viewport of its own, so it goes through a
    // canvas - the pixels themselves turn, and the coordinates follow.
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const swap = next === 90 || next === 270;
      canvas.width  = swap ? img.height : img.width;
      canvas.height = swap ? img.width  : img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((next * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      setViewerUrl(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = imageSource;
  }

  async function goToPage(n:number) {
    // Cheap, and it saves hunting for the elevation sheet every time.
    try {
      const projectId = getActiveProject()?.projectId;
      if (projectId) void savePlanPage(projectId, n);
    } catch { /* the page number is not worth an error */ }
    if (!pdfDoc||renderingPage) return;
    const p=Math.max(1,Math.min(n,totalPages));
    setCurrentPageNo(p); setPageNoInput(String(p)); setRenderingPage(true);
    try { setViewerUrl(await renderPage(pdfDoc,p,1.2)); }
    catch {} finally { setRenderingPage(false); }
  }

  // Arrow-key page navigation - left / right step through plan pages, same as
  // the toolbar's chevron buttons. Ignored while typing in an input/textarea
  // so it doesn't hijack normal text editing (e.g. the measurement input,
  // level name fields).
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
      // the scale you'd just locked - the "scale doesn't persist" bug.
      setTabScales(prev=>{
        const current = prev[activeTab];
        if (current?.locked) return prev;
        if (!pg.scale?.locked) return prev;
        return { ...prev, [activeTab]: pg.scale };
      });
    } catch {} finally { setRenderingPage(false); }
  }

  // -- Scale ------------------------------------------------------------------
  const scale=tabScales[activeTab];
  function setScale(u:Partial<ScaleState>) { setTabScales(p=>({...p,[activeTab]:{...p[activeTab],...u}})); }

  /**
   * Screen position to page position.
   *
   * Measured against the sheet's actual rendered size rather than against a
   * zoom number, so it stays correct however the panel is sized and whatever
   * else changes on screen. A scale locked at one zoom holds at every other.
   */
  /**
   * Pulls a picked point onto something already on the drawing.
   *
   * Hitting the exact centre of a reference point set two levels ago is
   * neither pleasant nor necessary - a column is a column. Two kinds of
   * target, drawn differently so it is always clear which one caught:
   * a reference point on another level, or a corner of a trace.
   */
  function snapPoint(pt: Pt, excludeLevelId?: string): { pt: Pt; kind: "ref" | "corner" | null } {
    const radius = 12 / Math.max(viewerZoom, 0.05); // constant on screen
    let best: { pt: Pt; kind: "ref" | "corner"; dist: number } | null = null;

    const consider = (candidate: Pt, kind: "ref" | "corner") => {
      const dist = Math.hypot(candidate.x - pt.x, candidate.y - pt.y);
      if (dist > radius) return;
      // A reference point wins a tie - it is the thing being lined up.
      if (!best || dist < best.dist || (dist === best.dist && kind === "ref")) {
        best = { pt: candidate, kind, dist };
      }
    };

    floorLevels.forEach((lvl) => {
      if (lvl.id === excludeLevelId) return;
      if (lvl.refPoint) consider(lvl.refPoint, "ref");
    });
    floorLevels.forEach((lvl) => lvl.tracePoints.forEach((p) => consider(p, "corner")));

    return best ? { pt: best.pt, kind: best.kind } : { pt, kind: null };
  }

  function getImgPt(e:React.MouseEvent): Pt|null {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const natW = img.naturalWidth || r.width;
    const natH = img.naturalHeight || r.height;
    return {
      x: (e.clientX - r.left) * (natW / r.width),
      y: (e.clientY - r.top) * (natH / r.height),
    };
  }

  function lockScale() {
    if (!scale.point1||!scale.point2||!scale.measurementInput) return;
    const dx=scale.point2.x-scale.point1.x, dy=scale.point2.y-scale.point1.y;
    const px=Math.sqrt(dx*dx+dy*dy);
    const ft=parseFeetInches(scale.measurementInput);
    if (!ft||ft<=0) return;
    setScale({ locked:true, pageUnitsPerFoot:px/ft, label:scale.measurementInput, pickingPoint:null, point1:null, point2:null });
  }

  // -- Elevation grip helpers -------------------------------------------------
  /**
   * Derives how high off the ground a run tagged "From: <level>" starts,
   * by summing the measured heights of grips that cover the levels below
   * it. This is the whole point of the From/To tagging: the grips already
   * measure heights, the tags say which floors those measurements cover,
   * so a podium wall tagged From: Level 4 learns it starts 32' up from
   * the Level 1-4 grip's own measurement - no height typed anywhere.
   *
   * Returns 0 for untagged grips or anything starting at the lowest
   * level, which preserves today's behaviour (ground to top of grip).
   * Returns null when a level below is referenced but never gripped -
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
      if (!covering) return null; // no grip covering that level - can't know
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
    const reach=backendSettings?.scaffold?.workerReachHeight??6;
    const jackMax=backendSettings?.scaffold?.screwJackMaxExtension??18;
    const bayLen=backendSettings?.scaffold?.defaultBayLength??10;
    // Same frame engine the rest of the app uses, so a grip can't disagree
    // with Set Scaffold about how many frames a leg takes.
    const makeup=computeFrameMakeup(Math.max(0, heightFt-reach), jackMax);
    const frameTall=Math.max(1, makeup.frameTall);
    const bayCount=Math.ceil(lf/bayLen);
    const legs=bayCount+1;
    return { lf, heightFt, frameTall, legs, bayCount };
  }

  /**
   * Copies a traced outline onto another level.
   *
   * Floors repeat far more often than they differ, and re-tracing a shape you
   * have already drawn is both slow and a chance to draw it slightly wrong.
   * The copy is taken once and is editable afterwards - a live link would mean
   * changing one floor silently changed another.
   */
  function duplicateOutline(fromId: string, toId: string) {
    const src = floorLevels.find(l => l.id === fromId);
    if (!src || src.tracePoints.length < 3) return;
    setFloorLevels(prev => prev.map(l => l.id === toId ? {
      ...l,
      tracePoints: src.tracePoints.map(p => ({ ...p })),
      traceClosed: src.traceClosed,
      traceMode: false,
      refPoint: src.refPoint ? { ...src.refPoint } : l.refPoint,
      linealFeet: src.linealFeet,
      stored: false,
    } : l));
  }

  function duplicateElevation(from:string, to:string) {
    const src=elevData.find(e=>e.direction===from);
    if (!src) return;
    // A duplicate is a copy of something already gripped, so it arrives
    // stored. Making the estimator click Store on work they did not redo was
    // busywork.
    const next=elevData.map(ed=>ed.direction===to?{ ...ed, areas:src.areas.map(a=>({...a,id:`${to}-${a.areaIndex}-${Date.now()}`,stored:true})) }:ed);
    setElevData(next);
    // Persist immediately with the fresh array - duplicating and then
    // needing a separate Store click afterward (which could read stale
    // state) was the "have to click Store twice" bug.
    storeElevations(next);
  }

  // -- Section auto-populate inventory ----------------------------------------
  /**
   * Quantities for one section, counted the way the material audit
   * established: braces, planks, guardrails and coupling pins all repeat at
   * every jump. Counting them once at ground level - which is what this did
   * before - understated each by roughly the jump count.
   *
   * Jumps come from the same frame-makeup engine Set Scaffold and Estimate
   * Review use, so a section can never disagree with them about how tall the
   * run is. Rules come from Backend so each company can set its own standard.
   */
  function autoPopulateSectionInventory(secId:string, wallPts:Pt[], puf:number|null) {
    if (!puf||wallPts.length<2) return;
    let totalLF=0;
    for (let i=0;i<wallPts.length-1;i++) {
      totalLF+=Math.sqrt((wallPts[i+1].x-wallPts[i].x)**2+(wallPts[i+1].y-wallPts[i].y)**2)/puf;
    }
    const sec=sections.find(s=>s.id===secId); if(!sec) return;

    const bayLen=backendSettings?.scaffold?.defaultBayLength??10;
    const reach=backendSettings?.scaffold?.workerReachHeight??6;
    const jackMax=backendSettings?.scaffold?.screwJackMaxExtension??18;

    const rules=backendSettings?.material?.rules;
    const bracesPerBayPerJump=rules?.crossBracesPerBayPerJump??2;
    const railTop=rules?.guardrailTopPerBay??4;
    const railMid=rules?.guardrailIntermediatePerBay??2;
    const pinsPerFrame=rules?.couplingPinsPerFrame??2;

    const bayCount=Math.max(1,Math.ceil(totalLF/bayLen));
    const legs=bayCount+1;

    // Planks per deck follow scaffold width, not a hardcoded 3.
    const plankPB=planksPerBayForWidth(parseFt(sec.frameWidth));

    // Top of Wall is the wall height; the top deck sits a worker's reach below.
    const wallHeight=sec.topOfWallDistance||0;
    const makeup=computeFrameMakeup(Math.max(0, wallHeight-reach), jackMax);
    const frameTall=Math.max(1, makeup.frameTall);

    const totalFrames=legs*frameTall;
    const totalPlanks=bayCount*plankPB*frameTall;
    const totalBraces=bayCount*frameTall*bracesPerBayPerJump;
    // Top jump gets the full set; every jump below gets the intermediate rail.
    const totalRails=bayCount*(railTop+Math.max(0,frameTall-1)*railMid);
    // Every frame joint takes pins except the topmost - guardrail posts
    // occupy those sockets instead.
    const totalPins=legs*Math.max(0,frameTall-1)*pinsPerFrame;

    setSections(prev=>prev.map(s=>s.id===secId?{
      ...s,
      totalLF:parseFloat(totalLF.toFixed(1)),
      totalLegs:legs, totalFrames, totalPlanks,
      frameMakeup:s.frameMakeup.map((f,i)=>{
        if(i===0) return {...f,qty:totalFrames};
        if(f.partNo==="AL1S") return {...f,qty:legs};
        if(f.partNo==="BP1")  return {...f,qty:legs};
        if(f.partNo==="B82")  return {...f,qty:totalBraces};
        if(f.partNo==="GR8")  return {...f,qty:totalRails};
        if(f.partNo==="CPS")  return {...f,qty:totalPins};
        if(f.partNo==="WP10") return {...f,qty:totalPlanks};
        return f;
      }),
    }:s));
  }

  // -- Viewer mouse handlers --------------------------------------------------
  function handleViewerMouseDown(e:React.MouseEvent<HTMLDivElement>) {
    const pt=getImgPt(e); if(!pt) return;

    // Measuring is a read, not an edit, so it takes the click before any
    // mode that would change the drawing.
    if (measureMode) {
      const snapped = snapPoint(pt).pt;
      if (!measureFrom) { setMeasureFrom(snapped); setMeasureTo(null); return; }
      const puf = scale.pageUnitsPerFoot;
      const ft = puf > 0 ? Math.hypot(snapped.x-measureFrom.x, snapped.y-measureFrom.y)/puf : 0;
      setMeasurements(prev => [...prev, { a: measureFrom, b: snapped, ft: parseFloat(ft.toFixed(2)) }]);
      setMeasureFrom(null); setMeasureTo(null);
      return;
    }

    if (highlightMode) {
      if (!scale.locked) return;   // nothing measured without a scale
      setStrokeFrom(pt); setStrokeTo(pt);
      return;
    }

    // Reference-point pick takes priority over every other mode - one
    // click sets the anchor for that level and exits pick mode.
    if (refPickLevelId) {
      const snapped = snapPoint(pt, refPickLevelId ?? undefined);
      setFloorLevels(prev=>prev.map(l=>l.id===refPickLevelId?{...l,refPoint:snapped.pt,stored:false}:l));
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
    if (refPickLevelId || measureMode) {
      const raw = getImgPt(e);
      if (raw) {
        const snapped = snapPoint(raw, refPickLevelId ?? undefined);
        setSnapPreview(snapped.kind ? { pt: snapped.pt, kind: snapped.kind } : null);
        if (measureMode && measureFrom) setMeasureTo(snapped.pt);
      }
    } else if (snapPreview) {
      setSnapPreview(null);
    }
    if (!gripMode||!gripStart) return;
    const pt=getImgPt(e); if(pt) setGripCurrent(pt);
  }

  function handleHighlightMove(e:React.MouseEvent<HTMLDivElement>) {
    if (!highlightMode || !strokeFrom) return;
    const pt = getImgPt(e); if (pt) setStrokeTo(pt);
  }

  function handleHighlightUp() {
    if (!highlightMode || !strokeFrom || !strokeTo) return;
    const puf = tabScales.floor.pageUnitsPerFoot;
    const lf = puf > 0 ? Math.hypot(strokeTo.x-strokeFrom.x, strokeTo.y-strokeFrom.y)/puf : 0;
    // A stroke is a run, not a scribble - straight from press to release, so a
    // shaky hand cannot add lineal feet.
    if (lf >= 1) {
      // Fills the tile that is selected, rather than making a new one - the
      // tiles are the faces of the job and the stroke is how one is measured.
      const target = activeHighlight ?? highlights[0]?.id;
      setHighlights(prev => prev.map(h => h.id === target ? {
        ...h,
        a: { x: strokeFrom.x, y: strokeFrom.y },
        b: { x: strokeTo.x, y: strokeTo.y },
        lf: parseFloat(lf.toFixed(1)),
      } : h));
      setHighlightMode(false);
    }
    setStrokeFrom(null); setStrokeTo(null);
  }

  function handleViewerMouseUp(e:React.MouseEvent<HTMLDivElement>) {
    if (!gripMode||!gripStart||!gripCurrent) return;
    const puf=tabScales.elevation.pageUnitsPerFoot;
    if (!puf||puf<=0) { setGripStart(null); setGripCurrent(null); return; }
    const x=Math.min(gripStart.x,gripCurrent.x), y=Math.min(gripStart.y,gripCurrent.y);
    const w=Math.abs(gripCurrent.x-gripStart.x), h=Math.abs(gripCurrent.y-gripStart.y);
    if(w<5||h<5) { setGripStart(null); setGripCurrent(null); return; }
    /*
     * On a highlight, the grip is for height only. The stroke already claimed
     * the footage on the plan, and a grip box drawn on an elevation photo has
     * no business overruling it.
     */
    const stroke = usingHighlights ? highlights.find(row=>row.label===selectedElev) : undefined;
    const calc=calcGripArea(stroke ? stroke.lf*puf : w, h, puf);
    updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{
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

  // -- Store ------------------------------------------------------------------
  /**
   * Makes sure there is a project to store into.
   *
   * This used to replace the entire project store with one hardcoded record
   * whenever the storage key was missing - destroying every other bid, and
   * leaving the active project id pointing at something that no longer
   * existed. A page would then show the name it had loaded earlier while the
   * store handed everyone else a blank project.
   *
   * It now only creates a project when there genuinely is not one, and never
   * touches any that already exist.
   */
  function ensureBase() {
    try {
      const existing = getActiveProject();
      if (existing?.projectId) return;
    } catch { /* nothing readable yet, fall through and make one */ }
    createProject(projectName || "New Project");
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
      // anchor level's - this is what makes floors traced on different
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
      // Build elevation heights from grips - each area contributes
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
      // Courtyards - same per-face summary as building elevations, but
      // stored under their own key so totals can include or exclude them.
      const storedCourtyards = courtyards.map(cy=>({
        id: cy.id,
        name: cy.name,
        faces: cy.faces.map(face=>{
          const filled=face.areas.filter(a=>a.rect&&a.heightFt>0);
          return {
            face: face.direction,
            totalLF: parseFloat(filled.reduce((s,a)=>s+a.lf,0).toFixed(1)),
            totalLegs: filled.reduce((s,a)=>s+a.legs,0),
            avgFrameTall: filled.length?Math.round(filled.reduce((s,a)=>s+a.frameTall,0)/filled.length):0,
            areas: filled.map(a=>({ areaIndex:a.areaIndex, lf:a.lf, heightFt:a.heightFt, frameTall:a.frameTall, legs:a.legs, bayCount:a.bayCount, fromLevelId:a.fromLevelId, toLevelId:a.toLevelId })),
          };
        }).filter(f=>f.totalLF>0),
      })).filter(cy=>cy.faces.length>0);

      // The strokes, with whatever height each was given.
      // The tier actually worked in, committed on every store - not only when
      // the handoff button happens to be the way out of the page.
      try{ setEstimateDepth(depthTab as EstimateDepth); setEstimateDepthState(depthTab as EstimateDepth); }catch{}

      const storedHighlights = highlights.map(h => ({
        ...h,
        heightFt: highlightElev.find(row => row.direction === h.label)?.areas[0]?.heightFt ?? h.heightFt,
      }));

      /*
       * What the strokes come to.
       *
       * Each one is a run of known length at its own gripped height, so it goes
       * through the same engine as any other face - Full Bid gets real counts
       * off a few swipes, not a division sum.
       */
      const highlightTotals = storedHighlights.reduce((acc, h) => {
        if (h.lf <= 0 || h.heightFt <= 0) return acc;
        const engine = calculateQuantityEngine({
          linearFeet: h.lf,
          wallHeight: h.heightFt,
          standardBayLength: elev.scaffoldInput.standardBayLength,
          scaffoldWidth: elev.scaffoldInput.scaffoldWidth,
          frameHeight: elev.scaffoldInput.frameHeight,
          plankCountPerBay: elev.scaffoldInput.plankCountPerBay,
          bracePattern: elev.scaffoldInput.bracePattern,
          wallOffset: elev.scaffoldInput.wallOffset,
        });
        acc.lf += h.lf;
        acc.bayCount += engine.bayCount;
        acc.legCount += engine.legCount;
        acc.frameCount += engine.frameCount;
        acc.plankCount += engine.plankCount;
        acc.crossBraceCount += engine.crossBraceCount;
        acc.guardrailCount += engine.guardrailCount;
        acc.basePlateCount += engine.basePlateCount;
        acc.screwJackCount += engine.screwJackCount;
        acc.couplingPinCount += engine.couplingPinCount ?? 0;
        acc.frameTall = Math.max(acc.frameTall, engine.frameTall);
        acc.heightSum += h.heightFt * h.lf;
        return acc;
      }, { lf:0, bayCount:0, legCount:0, frameCount:0, plankCount:0, crossBraceCount:0,
           guardrailCount:0, basePlateCount:0, screwJackCount:0, couplingPinCount:0,
           frameTall:0, heightSum:0 });
      const hasHighlights = highlightTotals.lf > 0;

      const courtyardQty = courtyardQuantities({
        ...elev, courtyards: storedCourtyards, includeCourtyards,
      } as typeof elev);

      saveActiveElevation({
        ...elev,
        highlights: storedHighlights,
        // Coverage and height from the strokes when there are any - the
        // highlighter is the takeoff in Full Bid.
        ...(hasHighlights ? { linearFeet: parseFloat(highlightTotals.lf.toFixed(1)) } : {}),
        // Weighted by length, so a long face counts for more than a short one.
        wallHeight:hasHighlights
          ? parseFloat((highlightTotals.heightSum / highlightTotals.lf).toFixed(1))
          : src.find(e=>e.direction==="North")?.areas.filter(a=>a.heightFt>0).reduce((s,a,_,arr)=>s+a.heightFt/arr.length,0)||elev.wallHeight,
        overlayGeometry:{ ...existing, elevationHeights, scale:puf?{ pageUnitsPerFoot:puf }:existing.scale },
        /*
         * Courtyards counted in with the rest. They are gripped like any other
         * face, and leaving them out priced a building with a light well short
         * by the whole of it. Set Scaffold recomputes this from the real layout
         * later and counts them the same way, so they are never counted twice.
         */
        quantityEngine: hasHighlights ? {
          ...elev.quantityEngine,
          bayCount: highlightTotals.bayCount + courtyardQty.bayCount,
          legCount: highlightTotals.legCount + courtyardQty.legCount,
          frameTall: Math.max(highlightTotals.frameTall, courtyardQty.frameTall),
          frameCount: highlightTotals.frameCount + courtyardQty.frameCount,
          plankCount: highlightTotals.plankCount + courtyardQty.plankCount,
          crossBraceCount: highlightTotals.crossBraceCount + courtyardQty.crossBraceCount,
          guardrailCount: highlightTotals.guardrailCount + courtyardQty.guardrailCount,
          basePlateCount: highlightTotals.basePlateCount + courtyardQty.basePlateCount,
          screwJackCount: highlightTotals.screwJackCount + courtyardQty.screwJackCount,
          couplingPinCount: highlightTotals.couplingPinCount + courtyardQty.couplingPinCount,
        } : {
          ...elev.quantityEngine,
          bayCount: totalBays + courtyardQty.bayCount,
          legCount: totalLegs + courtyardQty.legCount,
          frameTall: Math.max(maxFrameTall, courtyardQty.frameTall),
          frameCount: totalLegs * maxFrameTall + courtyardQty.frameCount,
          plankCount: (elev.quantityEngine.plankCount ?? 0) + courtyardQty.plankCount,
        },
        courtyards: storedCourtyards,
        includeCourtyards,
      });
      setElevStored(true); setTimeout(()=>setElevStored(false),3000);
    } catch(e) { console.error(e); }
  }

  // Converts a traced wall outline from raw page/image pixels into
  // feet-space points - x = linear footage along the wall, y = height in
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
      const makeupStr=sec.frameMakeup.filter(f=>f.qty>0).map(f=>`${f.qty} x ${f.description}`).join("\n");

      // Use whichever scale was actually used to trace this section's
      // wall outline - the Section tab's own scale if set, otherwise
      // fall back to the Floor Plan scale (matches autoPopulateSectionInventory).
      /*
       * The section sheet's own scale, or none.
       *
       * It used to borrow the floor plan's scale when the section had not been
       * locked - silently, so a profile traced on a sheet drawn at a different
       * scale measured a building several times the real size and nothing said
       * why. A section without its own scale is not measured at all.
       */
      const tracePuf = tabScales.section.locked ? tabScales.section.pageUnitsPerFoot : null;
      const wallOutlineFt = (sec.wallOutline.length >= 2 && tracePuf && tracePuf > 0)
        ? wallOutlineToFeet(sec.wallOutline, tracePuf)
        : elev.sectionView.wallOutline;

      /*
       * Every section, each with its own everything.
       *
       * A job can carry several cuts and they share nothing - not the profile,
       * not the scale, not the drawing. Saving only the active one meant
       * switching tabs quietly discarded the others.
       *
       * Profiles are kept in the sheet's own page units rather than converted
       * to feet here. Set Scaffold lays the drawing out against the section's
       * own scale, and converting twice is how a wall ends up the wrong size.
       */
      const sectionPuf = tabScales.section.locked ? tabScales.section.pageUnitsPerFoot : null;
      const existing = elev.sectionViews ?? [];
      const sectionViews = sections
        .filter(row => row.wallOutline.length >= 2)
        .map(row => {
          const prior = existing.find(e => e.id === row.id);
          return {
            id: row.id,
            label: row.label,
            wallOutline: row.wallOutline.map(p => ({ x: p.x, y: p.y })),
            // The scale that was locked when this one was traced, kept.
            pageUnitsPerFoot: row.id === activeSection
              ? sectionPuf
              : prior?.pageUnitsPerFoot ?? sectionPuf,
            scaleLabel: row.id === activeSection
              ? tabScales.section.label
              : prior?.scaleLabel ?? "",
            scaffoldSide: row.scaffoldSide,
            wallOffset: row.wallOffset,
            // The gripped height, saved with every section - one height per job.
            topOfWallDistance: (elev.wallHeight ?? 0) > 0 ? elev.wallHeight : row.topOfWallDistance,
            frameWidth: row.frameWidth,
            // Korban redraws its own pieces; anything hand-placed survives.
            draftingAdditions: prior?.draftingAdditions ?? [],
          };
        });

      saveActiveElevation({
        ...elev,
        sectionViews,
        sectionView: {
          ...elev.sectionView,
          frameMakeup: makeupStr,
          selectedRun: "Run N-01",
          wallOffset: sec.wallOffset,
          sectionType: sec.label,
          wallOutline: wallOutlineFt,
          scaffoldSide: sec.scaffoldSide,
          pageUnitsPerFoot: sectionPuf,
          scaleLabel: tabScales.section.label,
        },
      });
      setSectionStored(true); setTimeout(()=>setSectionStored(false),3000);
    } catch(e) { console.error(e); }
  }

  function storeAll() { storeOverlay(); storeElevations(); storeSection(); }

  /**
   * Saves whatever has been done so far.
   *
   * Store All is the end of a stage; this is for the middle of one. A takeoff
   * abandoned halfway through a phone call should still be there afterwards,
   * and waiting until a stage is complete to write anything down is how an
   * afternoon gets lost.
   *
   * Same write as Store All - there is no second kind of save, and a partial
   * one that behaved differently would be a trap.
   */
  /**
   * Throws this project's takeoff away and starts it again.
   *
   * A takeoff belongs to its project and is always continued - which is right,
   * until the thing being continued is wrong. A trace taken before the scale
   * was locked, or levels added by mistake, then follows the job forever with
   * no way to be rid of it short of starting a new bid.
   *
   * Clears the geometry, the grips, the stored sheet and the part ledger.
   * Leaves the project, its name and everything priced on it alone.
   */
  function clearTakeoff() {
    const sure = window.confirm(
      "Clear this takeoff?\n\nEvery traced level, reference point, grip and the plan sheet go with it. The project itself stays.",
    );
    if (!sure) return;
    try {
      const project = getActiveProject();
      const elev = getActiveElevation();
      saveActiveElevation({
        ...elev,
        linearFeet: 0,
        wallHeight: 0,
        overlayGeometry: null,
        elevationBreakdown: [],
        partLedger: [],
        courtyards: [],
      });
      if (project?.projectId) void clearPlanSheet(project.projectId);
    } catch { /* nothing stored to clear */ }

    setFloorLevels([{
      id: "lvl-1", levelName: "Level 1", isKeyFloor: true, linealFeet: 0,
      color: LEVEL_COLORS[0], tracePoints: [], traceClosed: false,
      traceMode: false, stored: false, refPoint: null,
    }]);
    setElevData(makeElevData(ELEVATION_DIRS));
    setHighlights([]); setHighlightElev([]); setHighlightMode(false);
    setTabScales({ floor: DEFAULT_SCALE, elevation: DEFAULT_SCALE, section: DEFAULT_SCALE });
    setViewerUrl(""); setPdfDoc(null); setImageSource(null);
    setExtractedPages([]); setActiveExtracted(null);
    setOverlayStored(false); setElevStored(false); setLastSaved(null);
  }

  function saveWork() {
    storeAll();
    setLastSaved(new Date());
    /*
     * Touch the project so everything downstream knows the job moved.
     *
     * Plan Desk, the Bid Room and the Bid/Job Log all sort and report on when
     * a project was last worked. A takeoff that saves without updating that is
     * a job that looks abandoned while someone is sitting in it.
     */
    try { updateActiveProject({}); } catch { /* nothing to touch yet */ }
  }

  function addSection() {
    if(sections.length>=4) return;
    const label=SECTION_LABELS[sections.length];
    const id=label.replace("-","").toLowerCase();
    const wallOff=backendSettings?.scaffold?.wallOffset??1;
    // Wall height, not worker reach - see the note on SectionView.
    const topOfWall=getActiveElevation()?.wallHeight??0;
    const fw:ScaffoldWidth="3'";
    setSections(prev=>[...prev,{ id, label, wallOffset:wallOff, topOfWallDistance:topOfWall, frameWidth:fw, wallOutline:[], wallComplete:false, scaffoldSide:"left", frameMakeup:getFrameParts(fw), totalLF:0, totalLegs:0, totalFrames:0, totalPlanks:0 }]);
    setActiveSection(id);
  }

  /**
   * Which control the walkthrough is currently talking about. The step text
   * says what to do; this makes the thing itself glow, so an estimator does
   * not have to hunt the screen for the button being described.
   */
  const currentGuide = (() => {
    if (depthTab === "quick-bid" || guideHidden || walkthroughHidden) return null;
    if (!viewerUrl) return "upload";
    if (!scale.locked) return "scale";
    if (!floorLevels.some(l=>l.tracePoints.length>=3)) return "trace";
    if (!floorLevels.every(l=>l.refPoint)) return "reference-point";
    if (!elevData.some(ed=>ed.areas.some(a=>a.rect&&a.lf>0))) return "grip";
    if (!overlayStored && !elevStored) return "store";
    if (depthTab === "korban-bid" && !sections.some(sec => sec.wallComplete)) return "section";
    return null;
  })();

  /**
   * What Korban has noticed, as opposed to what it is telling you to do next.
   * Built here rather than inline so the walkthrough row can sit it alongside
   * - two voices, side by side, in different colours so an observation never
   * reads as an instruction.
   */
  const drawingArmed =
    highlightMode ||
    measureMode ||
    gripMode ||
    refPickLevelId !== null ||
    Boolean(scale.pickingPoint) ||
    floorLevels.some(level => level.traceMode) ||
    wallOutlineMode;

  const korbanReadsIt = (() => {
    if (depthTab !== "korban-bid" || readsItHidden) return null;
    const flags: KorbanGuidanceFlag[] = [];
        const traced = floorLevels.filter(l=>l.tracePoints.length>=3);
        const grippedFaces = elevData.filter(ed=>ed.areas.some(a=>a.rect&&a.lf>0));
        const sectioned = sections.filter(s=>s.wallComplete);

        if (!scale.locked && viewerUrl) {
          flags.push({ tone:"warn", text:"Scale not locked. Nothing measured counts yet." });
        }
        if (activeTab === "section" && !tabScales.section.locked && (sections.find(row => row.id === activeSection)?.wallOutline.length ?? 0) > 0) {
          // Sections are drawn larger than the plan they were cut from. Borrowing
          // the plan's scale measured a building several times the real size.
          flags.push({ tone:"warn", text:"This section sheet has no scale of its own. Lock one here - it is not the floor plan's." });
        }
        if (traced.length>0 && traced.some(l=>!l.refPoint)) {
          const missing = traced.filter(l=>!l.refPoint).length;
          flags.push({ tone:"warn", text:`${missing} traced level${missing===1?"":"s"} without a reference point. I cannot stack them accurately, so a real step-back and a shaky trace look identical to me.` });
        }
        if (grippedFaces.length>0 && sectioned.length===0) {
          flags.push({ tone:"note", text:"Gripped, no section drawn. A section pins the frame to the real wall." });
        }
        if (traced.length>1 && grippedFaces.length===0) {
          flags.push({ tone:"note", text:"Floors traced, nothing gripped. Plan gives shape, grips give height." });
        }
        if (sectioned.length>0 && sectioned.some(s=>s.topOfWallDistance<=0)) {
          flags.push({ tone:"warn", text:"No wall height yet - one frame per leg. Grip an elevation and it carries through." });
        }
        if (courtyards.length>0 && !includeCourtyards) {
          flags.push({ tone:"note", text:`${courtyards.length} courtyard${courtyards.length===1?"":"s"} traced but excluded from totals. That is a choice, not an oversight - just make sure it is yours.` });
        }
        if (flags.length===0 && grippedFaces.length>0) {
          flags.push({ tone:"note", text:"Everything lines up. Tight as it gets before the crew shows up." });
        }
        // An empty job still deserves an answer. Silence reads as broken.
        if (flags.length===0) {
          flags.push({ tone:"note", text: viewerUrl
            ? "Plans open, nothing measured. Scale, trace, grip - I'll flag anything off."
            : "No plans yet. Upload the set and I'll follow along." });
        }

    return (
      <KorbanGuidance
        flags={flags}
        title="Korban thinks..."
        requireAck
        accent="amber"
        className="w-full sm:w-[300px]"
        onDismiss={() => setReadsItHidden(true)}
      />
    );
  })();

  const tabPages=extractedPages.filter(p=>p.tag===TAB_TAGS[activeTab]);
  const activeSec=sections.find(s=>s.id===activeSection)??sections[0];
  // Zone-aware face list: either the building's elevations or the active
  // courtyard's faces. Everything downstream (grips, tagging, rendering)
  // works off this, so courtyards reuse the identical UI and logic.
  /*
   * Full Bid always has a tile waiting.
   *
   * A highlight is a face of the job, not a by-product of a gesture - so the
   * first one is there before anything is drawn, and the swipe fills it in.
   */
  useEffect(() => {
    if (depthTab !== "full-bid") return;
    setHighlights(prev => prev.length > 0 ? prev
      : [{ id:`hl-${Date.now().toString(36)}`, label:"Highlight 1", a:{x:0,y:0}, b:{x:0,y:0}, lf:0, heightFt:0, note:"" }]);
  }, [depthTab]);

  useEffect(() => {
    if (!activeHighlight && highlights.length > 0) setActiveHighlight(highlights[0].id);
  }, [highlights, activeHighlight]);

  /*
   * In Full Bid the selected face is a highlight, not a compass point. Left on
   * "North" the tiles read "North Elevation" over a highlight's numbers.
   */
  useEffect(() => {
    if (depthTab !== "full-bid" || activeZone !== "building" || highlights.length === 0) return;
    if (!highlights.some(h => h.label === selectedElev)) setSelectedElev(highlights[0].label);
  }, [depthTab, activeZone, highlights, selectedElev]);

  useEffect(() => {
    setHighlightElev(prev => highlights.map(h =>
      prev.find(row => row.direction === h.label)
      ?? { direction: h.label, areas: [newElevArea(1, h.label)] },
    ));
  }, [highlights]);

  const activeCourtyard = courtyards.find(c=>c.id===activeZone) ?? null;
  /*
   * In Full Bid the elevation tiles are the highlighter strokes, not the four
   * compass faces - one tile per swipe, carrying the footage it claimed, with
   * its height typed or gripped underneath.
   */
  // Full Bid is highlights, always - there is a tile before anything is drawn.
  const usingHighlights = depthTab === "full-bid";
  const activeFaces: ElevationData[] = activeCourtyard
    ? activeCourtyard.faces
    : usingHighlights ? highlightElev : elevData;

  /** Routes a face-list update to the building or the active courtyard. */
  function updateActiveFaces(updater:(faces:ElevationData[])=>ElevationData[]) {
    if (activeCourtyard) {
      setCourtyards(prev=>prev.map(c=>c.id===activeCourtyard.id?{...c,faces:updater(c.faces)}:c));
    } else if (usingHighlights) {
      setHighlightElev(prev=>updater(prev));
    } else {
      setElevData(prev=>updater(prev));
    }
  }

  const currentElevData=activeFaces.find(e=>e.direction===selectedElev)??activeFaces[0];
  const liveGrip=gripStart&&gripCurrent?{ x:Math.min(gripStart.x,gripCurrent.x), y:Math.min(gripStart.y,gripCurrent.y), w:Math.abs(gripCurrent.x-gripStart.x), h:Math.abs(gripCurrent.y-gripStart.y) }:null;
  const allLevelPoints=floorLevels.filter(l=>l.tracePoints.length>=2);
  const activeLvl=floorLevels.find(l=>l.id===activeLevel);

  // Cursor logic
  const isCapturing=scale.pickingPoint||gripMode||activeLvl?.traceMode||wallOutlineMode||Boolean(refPickLevelId);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <style>{`
        /* A slow breath on whatever the guide is pointing at. Fast enough to
           find, slow enough not to nag. */
        @keyframes korbanGuideGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); border-color: rgba(249,115,22,0.45); }
          50% { box-shadow: 0 0 0 4px rgba(249,115,22,0.18); border-color: rgba(249,115,22,0.95); }
        }
        .korban-guide-glow {
          animation: korbanGuideGlow 2.6s ease-in-out infinite;
          position: relative;
        }
        @media (prefers-reduced-motion: reduce) {
          .korban-guide-glow { animation: none; border-color: rgba(249,115,22,0.8); }
        }
      `}</style>
      <KorbanHeader
        title="Takeoff Workspace"
        subtitle={projectName||"Advanced Takeoff"}
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            {/* Where the takeoff stands, so restored work is not mistaken for
                a fresh start - and unsaved work is not mistaken for saved. */}
            <span className="hidden items-center gap-1.5 pr-1 font-mono text-[10px] text-zinc-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${lastSaved ? "bg-emerald-400" : "bg-zinc-600"}`} />
              {lastSaved
                ? `Saved ${lastSaved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Not saved"}
            </span>
            {/*
              * Save Work only. Store All did the same write from the same
              * corner, which made two buttons for one action - and the stage
              * buttons at the bottom of each panel already handle finishing.
              * This one is for stopping mid-job.
              */}
            <button onClick={saveWork} className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20">+ Save Work</button>
            <button
              onClick={()=>{ try{ setEstimateDepth(depthTab as EstimateDepth); }catch{} window.location.href="/set-scaffold-v2"; }}
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-orange-400">Scaffold Layout &rarr;</button>
          </>
        }
      />

      {/* Depth tabs - the bid type you're working at. All three are always
          visible; a depth you haven't worked yet simply opens with its
          inputs blank. Work carries forward to deeper tiers, never back. */}
      <div className="flex items-end gap-1 border-b border-zinc-900 bg-[#0b0b0b] px-6 pt-2">
        {([
          {id:"quick-bid",  label:"Quick Bid",  tools:["elevation"] as ActiveTab[]},
          {id:"full-bid",   label:"Full Bid",   tools:["floor","elevation"] as ActiveTab[]},
          {id:"korban-bid", label:"Korban Bid", tools:["floor","elevation","section"] as ActiveTab[]},
        ] as {id:DepthTab;label:string;tools:ActiveTab[]}[]).map(d=>{
          const active = depthTab===d.id;
          return (
          <button key={d.id} onClick={()=>{
              /*
               * Changing tier puts this tier's work away and brings out the
               * other's.
               *
               * The three tiers measure the same building three ways and they
               * do not mix - a traced outline underneath a set of highlighter
               * strokes drew a second scaffold and counted it. Nothing is
               * destroyed, so a job can be tried three ways and compared.
               */
              try{
                const current = getActiveElevation();
                const moved = switchElevationTier(current, d.id as EstimateDepth);
                saveActiveElevation(moved);
                setEstimateDepth(d.id as EstimateDepth);
                setEstimateDepthState(d.id as EstimateDepth);
              }catch{}
              setDepthTab(d.id);
              if(!d.tools.includes(activeTab)) setActiveTab(d.tools[0]);
              // Everything measured belongs to the tier that measured it, so
              // the page starts from the incoming tier's work.
              setTimeout(()=>window.location.reload(), 0);
            }}
            className={`relative flex items-center gap-2 rounded-t-lg border border-b-0 px-6 pt-2.5 pb-3 text-[11px] font-bold uppercase tracking-[0.15em] transition ${active?"text-white border-zinc-700":"text-zinc-600 hover:text-zinc-400 border-zinc-800"}`}
            style={{ background: active ? "#1a1a1a" : "#0b0b0b" }}>
            {d.label}
            {active && (
              <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-full bg-white/80 shadow-[0_0_4px_1px_rgba(255,255,255,0.35)]" />
            )}
          </button>
          );
        })}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {/*
            * What the scale resolved to, not just what was typed. A storey is
            * a few hundred page units on a normal sheet - if this reads a
            * couple of units per foot, the two points picked were nowhere near
            * the distance entered, and everything measured after will be wrong
            * by exactly that ratio.
            */}
          {scale.locked&&(
            <span className="font-mono text-orange-400 opacity-70">
              [lock]{scale.label ? ` ${scale.label}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Tools available at this depth - Quick Bid is a form, so it has none.
          Sub-tabs carry a light grey tint to sit below the depth tabs
          without competing with the orange accent. */}
      {depthTab!=="quick-bid" && (
      <div className="flex items-center gap-1.5 border-b border-zinc-900 bg-[#0f0f0f] px-6 py-1.5">
        {([{id:"floor",label:"Floor Plan",icon:"\u229e"},{id:"elevation",label:"Elevations",icon:"\u2195"},{id:"section",label:"Section View",icon:"\u2702"}] as {id:ActiveTab;label:string;icon:string}[])
          .filter(tool=>{
            if(depthTab==="full-bid")   return tool.id!=="section";
            return true;
          })
          .map(tool=>{
          const active = activeTab===tool.id;
          const count = extractedPages.filter(p=>p.tag===TAB_TAGS[tool.id]).length;
          return (
          <button key={tool.id} onClick={()=>setActiveTab(tool.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[10px] font-bold transition ${active?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-orange-500/40"}`}>
            <span>{tool.icon}</span>{tool.label}
            {count>0&&(
              <span className={`rounded-full px-1.5 text-[8px] font-bold ${active?"bg-black/20":"bg-white/15"}`}>{count}</span>
            )}
          </button>
          );
        })}
        <span className="ml-auto text-[9.5px] text-zinc-600">
          {depthTab==="full-bid"   && "Guided capture - Korban traces, you confirm."}
          {depthTab==="korban-bid" && "Full manual control, plus section views."}
        </span>
      </div>
      )}

      {depthTab!=="quick-bid" && (() => {
        const anyTraced = floorLevels.some(l=>l.tracePoints.length>=3);
        const allRefs   = floorLevels.length>0 && floorLevels.every(l=>l.refPoint);
        const anyGrip   = elevData.some(ed=>ed.areas.some(a=>a.rect&&a.lf>0));
        const steps: KorbanGuidanceStep[] = [
          { id:"upload", title:"Load the plans",
            body:"Upload the PDF set for this job. You'll pull the floor plan and elevation sheets out of it as you go.",
            // Restored work counts as done even before the sheet finishes
            // loading, or the walkthrough tells a full takeoff to start over.
            done: Boolean(viewerUrl) || floorLevels.some(l => l.stored && l.tracePoints.length >= 3) },
          { id:"scale", title:"Set the scale",
            body:"Click Scale, pick two points a known distance apart on the drawing, then type that distance.",
            why:"Nothing measures until Korban knows how big a foot is.",
            done: scale.locked || (scale.pageUnitsPerFoot ?? 0) > 0 },
          ...(depthTab === "full-bid" ? [
            { id:"highlight", title:"Highlight the coverage",
              body:"Press Highlight, then swipe along a face - press at one end, drag to the other, release. Add Highlight for the next one.",
              why:"A stroke owns everything inside its length: setbacks, pop-outs, every in and out. Same as running a marker down a set of plans.",
              done: highlights.some(h => h.lf > 0) },
            { id:"grip", title:"Give each highlight a height",
              body:"Switch to Elevations. Each highlight is a tile there - set the scale, then grip top to bottom, or type the height.",
              why:"The swipe gave the length. The grip gives the height. Together they are the takeoff.",
              done: anyGrip },
          ] : [
            { id:"trace", title:"Trace the floor outline",
              body:"Click around the outside of the building, corner to corner, then Close. Undo Point backs up if you misclick.",
              done: anyTraced },
            { id:"ref", title:"Set reference points",
              body:"Pick the same fixed feature on each level - a column or grid intersection that appears on every sheet.",
              why:"This stacks the floors. Without it a real step-back looks like a shaky trace.",
              done: allRefs },
            { id:"grip", title:"Grip the elevations",
              body:"Switch to Elevations, set the scale there too, then drag a box over each wall face that needs coverage.",
              why:"The grip gives height. Height sets frames per leg.",
              done: anyGrip },
          ]),
          { id:"store", title:"Store the work",
            body: depthTab === "full-bid"
              ? "Store Elevations once every highlight has a height."
              : "Store Overlay on the floor plan, Store Elevations on the elevations.",
            done: overlayStored || elevStored },
        ];

        /*
         * Korban Bid does everything Full Bid does and then draws sections
         * against the wall. Same walkthrough, one step longer - withholding
         * the pointer from someone who chose the deeper tier made no sense.
         */
        if (depthTab === "korban-bid") {
          steps.push({
            id: "section",
            title: "Draw the sections",
            body: "Start Section View and trace the wall profile on each face that needs one.",
            why: "Sections pin the frame to the real wall. Difference between 8% and 3%.",
            done: sections.some(sec => sec.wallComplete),
          });
        }
        if (guideHidden || walkthroughHidden) return null;
        return (
          <div className="flex flex-wrap items-start gap-3 px-6 pt-3">
            <KorbanGuidance
              steps={steps}
              title={depthTab === "korban-bid" ? "Korban Bid walkthrough" : "Full Bid walkthrough"}
              className="w-full sm:w-[340px]"
              onDismiss={() => setWalkthroughHidden(true)}
            />
            {korbanReadsIt}
          </div>
        );
      })()}

      {/*
        * Korban Bid earns the most from advice and had none. What it flags is
        * different from Full Bid's checklist: not "do this next" but "what you
        * have does not agree with itself yet".
        */}

      {depthTab==="quick-bid" ? <QuickBidForm /> : (
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
                      {pg.scale.locked&&<span className="text-[7px] text-orange-400">[lock]</span>}
                    </div>
                  </div>
                  <button onClick={()=>setExtractedPages(prev=>prev.filter(p=>p.id!==pg.id))} className="absolute top-1 right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[8px] text-zinc-500 hover:text-red-400">&times;</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center viewer */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2 flex-wrap">
            <button data-guide="upload" onClick={()=>fileRef.current?.click()} className={`rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-white/30 hover:text-white ${currentGuide==="upload"?"korban-guide-glow":""}`}>{pdfLoading?"Loading...":"Upload Plans"}</button>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value="";}}/>

            {totalPages>1&&(
              <div className="flex items-center gap-1">
                <button onClick={()=>goToPage(currentPageNo-1)} disabled={currentPageNo<=1||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">&lsaquo;</button>
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
                <button onClick={()=>goToPage(currentPageNo+1)} disabled={currentPageNo>=totalPages||renderingPage} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs">&rsaquo;</button>
              </div>
            )}

            <div className="flex items-center gap-1">
              <button onClick={()=>setViewerZoom(z=>Math.max(0.1,z-0.1))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">&minus;</button>
              <span className="text-[9px] font-mono text-zinc-600 w-8 text-center">{Math.round(viewerZoom*100)}%</span>
              <button onClick={()=>setViewerZoom(z=>Math.min(4,z+0.1))} className="rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white text-xs font-bold">+</button>
              <button onClick={fitToViewer} className="rounded border border-zinc-800 px-1.5 h-6 text-[9px] text-zinc-500 hover:text-white">Fit</button>
              {viewerUrl && (
                <button
                  onClick={rotateSheet}
                  title="Rotate the page a quarter turn. Clears any points already picked on it."
                  className="flex h-6 items-center gap-1 rounded border border-zinc-800 px-1.5 text-[9px] text-zinc-500 hover:border-zinc-600 hover:text-white"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M9.5 4.5A4 4 0 1 0 10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M9.8 1.6v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {rotation ? `${rotation}\u00b0` : "Rotate"}
                </button>
              )}
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
                <button
                  onClick={()=>{ setMeasureMode(m=>!m); setMeasureFrom(null); setMeasureTo(null); }}
                  disabled={!scale.locked}
                  title={scale.locked?"Measure between two points":"Set a scale first"}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition disabled:opacity-30 ${measureMode?"border-cyan-400/60 bg-cyan-400/15 text-cyan-300":"border-zinc-700 text-zinc-400 hover:border-cyan-400/40"}`}
                >
                  Measure
                </button>
                {measurements.length>0&&(
                  <button onClick={()=>setMeasurements([])}
                    className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">
                    Clear {measurements.length}
                  </button>
                )}
                <button data-guide="scale" onClick={()=>setScale({pickingPoint:scale.pickingPoint?null:1,point1:null,point2:null})}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${scale.pickingPoint?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"} ${currentGuide==="scale"&&!scale.pickingPoint?"korban-guide-glow":""}`}>
                  &#10231; Scale {scale.pickingPoint?`- pt ${scale.pickingPoint}`:""}
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
                  <span className="text-[10px] text-orange-500">[lock]</span>
                  <span className="text-[10px] font-mono text-orange-300 font-bold">{scale.label}</span>
                </div>
                <button onClick={()=>setScale({locked:false,point1:null,point2:null,pickingPoint:null})} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">Unlock</button>
              </div>
            )}

            {/*
              * The highlighter, on the floor plan in Full Bid. Korban Bid
              * traces instead - that is the difference between the two.
              *
              * It sits outside the scale block on purpose: it used to live in
              * the branch that only renders while the scale is UNLOCKED, so
              * locking the scale made the button disappear and leaving it
              * unlocked left it unable to measure. It had no working state.
              */}
            {depthTab==="full-bid"&&activeTab==="floor"&&viewerUrl&&(
              <button onClick={()=>{setHighlightMode(v=>!v);setStrokeFrom(null);setStrokeTo(null);}}
                title={scale.locked?"Swipe along a face to claim it":"Set the scale on this sheet first"}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${highlightMode?"border-yellow-400 bg-yellow-400/20 text-yellow-300":"border-zinc-700 text-zinc-400 hover:border-yellow-400/40"}`}>
                {highlightMode?"Highlighting...":"Highlight"}
              </button>
            )}

            {/* Elevation grip tools */}
            {activeTab==="elevation"&&viewerUrl&&scale.locked&&(
              <>
                <div className="h-4 w-px bg-zinc-800"/>
                <button onClick={()=>setGripMode(m=>!m)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${gripMode?"border-orange-500 bg-orange-500/20 text-orange-300":"border-zinc-700 text-zinc-400 hover:border-orange-500/40"} ${currentGuide==="grip"&&!gripMode?"korban-guide-glow":""}`}>
                  {gripMode
                    ? (usingHighlights ? `Drag top to bottom for ${selectedElev}` : `Drag Area ${selectedArea} on ${selectedElev}`)
                    : usingHighlights ? "Grip height" : "Add Grip"}
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
                  {wallOutlineMode?"Wall Outline":"Start Wall Outline"}
                </button>
                {activeSec?.wallOutline?.length>0&&!activeSec.wallComplete&&(
                  <button onClick={()=>{setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallComplete:true}:s));setWallOutlineMode(false);autoPopulateSectionInventory(activeSection,activeSec.wallOutline,tabScales.section.locked?tabScales.section.pageUnitsPerFoot:null);}}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20">
                    Complete
                  </button>
                )}
              </>
            )}
          </div>

          {/*
            * Scale warning. It used to float over the drawing, bright enough
            * to compete with the thing it was warning about. It sits in the
            * dark above the sheet now - still first thing you see, no longer
            * covering the plan.
            */}
          {viewerUrl && !scale.locked && (
            <div className="flex items-center gap-3 border-b border-yellow-500/20 bg-yellow-500/[0.06] px-3 py-2">
              <span className="text-[13px] leading-none text-yellow-500/80">&#9888;</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-yellow-300/90">
                  Set scale before measuring
                </p>
                <p className="text-[10px] text-yellow-600/80">
                  Click Scale, pick two points a known distance apart, then enter that distance.
                </p>
              </div>
              <button
                onClick={()=>setScale({pickingPoint:1,point1:null,point2:null})}
                className={`shrink-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[10px] font-bold text-yellow-300 transition hover:bg-yellow-500/20 ${
                  currentGuide === "scale" ? "korban-guide-glow" : ""
                }`}
              >
                Set Scale
              </button>
            </div>
          )}

          {/*
            * The highlighter, armed. A tool that is on and says nothing is a
            * tool that looks broken - and one that cannot measure yet should
            * say why rather than sit there disabled.
            */}
          {highlightMode&&activeTab==="floor"&&(
            <div className={`flex items-center gap-2 border-b px-4 py-2 ${scale.locked?"border-yellow-500/30 bg-yellow-500/[0.07]":"border-red-500/30 bg-red-500/[0.07]"}`}>
              <span className={`h-2 w-2 rounded-full ${scale.locked?"bg-yellow-400":"bg-red-400"}`} />
              <p className={`text-[11px] ${scale.locked?"text-yellow-200":"text-red-300"}`}>
                {scale.locked
                  ? <>Swipe along a face for <span className="font-bold">{highlights.find(h=>h.id===(activeHighlight??highlights[0]?.id))?.label ?? "Highlight 1"}</span> &mdash; press at one end, drag, release.</>
                  : <>This sheet has no scale yet. Set the scale on the floor plan and the highlighter can measure.</>}
              </p>
              <button onClick={()=>{setHighlightMode(false);setStrokeFrom(null);setStrokeTo(null);}}
                className="ml-auto text-[10px] text-zinc-500 hover:text-white">cancel</button>
            </div>
          )}

          {/* PDF Canvas */}
          <div ref={viewerRef}
            className="relative flex-1 overflow-auto bg-zinc-950 p-6"
            /*
             * Crosshairs whenever Korban is waiting for a mark.
             *
             * Swipe, trace, grip, reference point, measure, scale pick - they
             * all want a click on the drawing, and only the highlighter said
             * so. There has to be a difference between "draw here" and "you
             * are just moving the mouse".
             */
            style={drawingArmed ? { cursor: "crosshair", userSelect: "none" } : undefined}
            onDragStart={(e)=>{ if (highlightMode) e.preventDefault(); }}
            onMouseDown={handleViewerMouseDown}
            onMouseMove={(e)=>{handleHighlightMove(e);handleViewerMouseMove(e);}}
            onMouseUp={(e)=>{handleHighlightUp();handleViewerMouseUp(e);}}
            onMouseLeave={handleHighlightUp}
            onDoubleClick={handleViewerDblClick}
            style={{cursor:isCapturing?"crosshair":"default"}}>

            {!viewerUrl&&!pdfLoading&&(
              <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
                className="flex h-full w-full flex-col items-center justify-center gap-3 cursor-pointer">
                <span className="text-5xl opacity-15">&#128208;</span>
                <p className="text-sm font-bold text-zinc-500">Upload Plans to begin</p>
                <p className="text-xs text-zinc-700">PDF, JPG or PNG &middot; Click or drag</p>
              </div>
            )}
            {pdfLoading&&<div className="flex h-full items-center justify-center"><p className="text-xs text-zinc-600">Opening...</p></div>}

            {viewerUrl&&(
              /*
               * One number drives the whole sheet.
               *
               * The wrapper is given a width; the image fills it and the
               * overlay matches it. Nothing here waits on the image reporting
               * its own size, because a cached image never fires onLoad and
               * the zoom then had nothing to act on - which is exactly how it
               * came to do nothing at all.
               *
               * The fallback width keeps zoom working from the first frame,
               * before any measurement has arrived.
               */
              <div
                className="relative mx-auto"
                style={{
                  userSelect: "none",
                  width: (naturalSize.w || 1700) * viewerZoom,
                }}
              >
                <img ref={imgRef} src={viewerUrl} alt="" draggable={false} onLoad={handleImgLoad}
                  className="block w-full rounded-lg shadow-2xl border border-zinc-800 select-none"
                  style={{ height: "auto", opacity: renderingPage ? 0.5 : 1, transition: "opacity 0.15s" }}/>

                {/*
                  * Overlay draws in page units; the viewBox does the scaling.
                  *
                  * Pinned top-left rather than inset-0. Pinning all four edges
                  * and then giving it a width makes the browser stretch it to
                  * the parent instead, which skews the viewBox and puts every
                  * click a long way from where it was made.
                  */}
                <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible"
                  viewBox={naturalSize.w ? `0 0 ${naturalSize.w} ${naturalSize.h}` : undefined}>

                  {/* Floor traces */}
                  {/*
                    * Highlighter strokes. They stay lit, labelled with what
                    * they cover, so the plan reads like a marked-up set.
                    */}
                  {activeTab==="floor"&&highlights.filter(h=>h.lf>0).map((h,i)=>(
                    <g key={h.id}>
                      <line x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y}
                        stroke="#fbbf24" strokeWidth={14/viewerZoom} strokeLinecap="round" opacity="0.32" />
                      <line x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y}
                        stroke="#fbbf24" strokeWidth={2/viewerZoom} strokeLinecap="round" opacity="0.9" />
                      {(() => {
                        // Along its own line, off to one side, in the same
                        // drawing type the layout uses.
                        const mx=(h.a.x+h.b.x)/2, my=(h.a.y+h.b.y)/2;
                        const dx=h.b.x-h.a.x, dy=h.b.y-h.a.y;
                        const len=Math.hypot(dx,dy)||1;
                        const off=14/viewerZoom;
                        const at={ x: mx + (-dy/len)*off, y: my + (dx/len)*off };
                        let ang=Math.atan2(dy,dx)*180/Math.PI;
                        if (ang>90||ang<-90) ang+=180;
                        // Orange, no outline, lighter weight - it sits on a
                        // white sheet and does not need shouting.
                        return (
                          <text x={at.x} y={at.y}
                            textAnchor="middle" fontSize={12/viewerZoom} fill="#f97316"
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            fontWeight="500" letterSpacing={0.6/viewerZoom}
                            transform={`rotate(${ang} ${at.x} ${at.y})`}>
                            {h.label.toUpperCase()} &middot; {h.lf}&apos;
                            {h.note ? ` \u00b7 ${h.note.toUpperCase()}` : ""}
                          </text>
                        );
                      })()}
                    </g>
                  ))}
                  {activeTab==="floor"&&strokeFrom&&strokeTo&&(
                    <line x1={strokeFrom.x} y1={strokeFrom.y} x2={strokeTo.x} y2={strokeTo.y}
                      stroke="#fbbf24" strokeWidth={14/viewerZoom} strokeLinecap="round" opacity="0.45" />
                  )}
                  {activeTab==="floor"&&floorLevels.map(lvl=>{
                    if(lvl.tracePoints.length<1) return null;
                    const pts=[...lvl.tracePoints,...(lvl.traceClosed?[lvl.tracePoints[0]]:[])];
                    const mk=1/viewerZoom; // markers are in page units, so counter-scale to stay a constant on-screen size
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

                  {/* Per-level reference points - the anchors that make
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
                      <text x={scale.point1.x+12*mk} y={scale.point1.y-10*mk} fontSize={9*mk} fill="#f97316" fontFamily="monospace" fontWeight="bold">1</text>
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
                      <text x={scale.point2.x+12*mk} y={scale.point2.y-10*mk} fontSize={9*mk} fill="#f97316" fontFamily="monospace" fontWeight="bold">2</text>
                    </g>
                    );
                  })()}
                  {/* Snap target. A reference point reads as a ring, a trace
                      corner as a square, so it is never ambiguous which one
                      caught the cursor. */}
                  {snapPreview&&(refPickLevelId||measureMode)&&(()=>{ const mk=1/viewerZoom; const {x,y}=snapPreview.pt; return snapPreview.kind==="ref"?(
                    <g key="snap">
                      <circle cx={x} cy={y} r={7*mk} fill="none" stroke="#fbbf24" strokeWidth={1.6*mk}/>
                      <circle cx={x} cy={y} r={2*mk} fill="#fbbf24"/>
                    </g>
                  ):(
                    <g key="snap">
                      <rect x={x-5*mk} y={y-5*mk} width={10*mk} height={10*mk} fill="none" stroke="#22d3ee" strokeWidth={1.6*mk}/>
                      <rect x={x-1.2*mk} y={y-1.2*mk} width={2.4*mk} height={2.4*mk} fill="#22d3ee"/>
                    </g>
                  );})()}

                  {/* Measurements. Read-only, and they stay put while you work. */}
                  {measurements.map((m,i)=>{ const mk=1/viewerZoom; return (
                    <g key={`m${i}`}>
                      <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke="#22d3ee" strokeWidth={1.4*mk}/>
                      <circle cx={m.a.x} cy={m.a.y} r={2.5*mk} fill="#22d3ee"/>
                      <circle cx={m.b.x} cy={m.b.y} r={2.5*mk} fill="#22d3ee"/>
                      <text x={(m.a.x+m.b.x)/2} y={(m.a.y+m.b.y)/2-6*mk} textAnchor="middle"
                        fontSize={11*mk} fill="#22d3ee" fontFamily="monospace" fontWeight="bold"
                        stroke="#000" strokeWidth={3*mk} paintOrder="stroke">{m.ft}&apos;</text>
                    </g>
                  );})}

                  {measureMode&&measureFrom&&measureTo&&(()=>{ const mk=1/viewerZoom;
                    const ft=scale.pageUnitsPerFoot>0?Math.hypot(measureTo.x-measureFrom.x,measureTo.y-measureFrom.y)/scale.pageUnitsPerFoot:0;
                    return (
                      <g key="mlive">
                        <line x1={measureFrom.x} y1={measureFrom.y} x2={measureTo.x} y2={measureTo.y}
                          stroke="#22d3ee" strokeWidth={1.4*mk} strokeDasharray={`${4*mk},${3*mk}`}/>
                        <text x={(measureFrom.x+measureTo.x)/2} y={(measureFrom.y+measureTo.y)/2-6*mk} textAnchor="middle"
                          fontSize={11*mk} fill="#22d3ee" fontFamily="monospace" fontWeight="bold"
                          stroke="#000" strokeWidth={3*mk} paintOrder="stroke">{ft.toFixed(2)}&apos;</text>
                      </g>
                    );})()}

                  {scale.point1&&scale.point2&&<line x1={scale.point1.x} y1={scale.point1.y} x2={scale.point2.x} y2={scale.point2.y} stroke="#f97316" strokeWidth={1/viewerZoom} strokeDasharray={`${4/viewerZoom},${3/viewerZoom}`} opacity="0.5"/>}

                  {/* Elevation grips */}
                  {activeTab==="elevation"&&elevData.map(ed=>ed.areas.map(a=>{
                    if(!a.rect) return null;
                    const isActiveElev=ed.direction===selectedElev;
                    return (
                      <g key={a.id}>
                        <rect x={a.rect.x} y={a.rect.y} width={a.rect.w} height={a.rect.h} fill="rgba(249,115,22,0.10)" stroke={isActiveElev?"#f97316":"#71717a"} strokeWidth={isActiveElev?"1.5":"1"}/>
                        <text x={a.rect.x+4} y={a.rect.y+13} fontSize="8.5" fill="#f97316" fontFamily="monospace" fontWeight="bold">{ed.direction} A{a.areaIndex}: {a.lf}LF x {a.heightFt}&apos;</text>
                        <text x={a.rect.x+4} y={a.rect.y+24} fontSize="7.5" fill="#fb923c" fontFamily="monospace">{a.legs} legs &middot; {a.frameTall} frames per leg</text>
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
                        return <text x={liveGrip.x+4} y={liveGrip.y+14} fontSize="9" fill="#f97316" fontFamily="monospace" fontWeight="bold">{lf}LF x {ht}&apos;</text>;
                      })()}
                    </g>
                  )}
                </svg>
                {renderingPage&&<div className="absolute inset-0 flex items-center justify-center"><p className="text-xs text-zinc-500 bg-black/60 px-3 py-1.5 rounded-lg">Loading...</p></div>}
              </div>
            )}
          </div>
        </section>

        {/* Right panel */}
        <aside className="flex w-[250px] flex-shrink-0 flex-col border-l border-zinc-900 bg-[#080604] overflow-y-auto">

          {/* -- FLOOR PLAN -- */}
          {/*
            * What the highlighter has claimed so far. Full Bid's whole
            * takeoff on the plan side: a few strokes and their footage.
            */}
          {depthTab==="full-bid"&&activeTab==="floor"&&(
            <div className="border-b border-zinc-900 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-300">Highlights</p>
                <span className="font-mono text-[10px] text-zinc-400">
                  {highlights.reduce((sum,h)=>sum+h.lf,0).toFixed(1)} LF
                </span>
              </div>
              <div className="space-y-1">
                {highlights.map(h=>{
                  const selected = (activeHighlight ?? highlights[0]?.id) === h.id;
                  return (
                  <div key={h.id}
                    onClick={()=>setActiveHighlight(h.id)}
                    className={`cursor-pointer rounded-lg border px-2 py-1.5 transition ${selected?"border-yellow-500/60 bg-yellow-500/5":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${h.lf>0?"bg-yellow-400":"border border-zinc-700"}`} />
                      <span className="flex-1 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-300">{h.label}</span>
                      <span className={`font-mono text-[10px] ${h.lf>0?"text-yellow-300":"text-zinc-600"}`}>
                        {h.lf>0?`${h.lf}'`:"\u2014"}
                      </span>
                      {highlights.length>1&&(
                        <button onClick={(e)=>{e.stopPropagation();setHighlights(prev=>prev.filter(row=>row.id!==h.id));}}
                          title="Remove this highlight"
                          className="text-[10px] text-zinc-600 hover:text-red-400">&times;</button>
                      )}
                    </div>
                    {/*
                      * Arm the highlighter from the tile itself. A tool button
                      * buried in the sheet toolbar is a tool nobody finds -
                      * this is where the work is being done.
                      */}
                    <button
                      onClick={(e)=>{e.stopPropagation();setActiveHighlight(h.id);setHighlightMode(true);setStrokeFrom(null);setStrokeTo(null);}}
                      className={`mt-1 w-full rounded border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.08em] transition ${
                        highlightMode&&selected
                          ? "border-yellow-400 bg-yellow-400/20 text-yellow-300"
                          : "border-zinc-800 text-zinc-500 hover:border-yellow-400/40 hover:text-yellow-300"
                      }`}>
                      {highlightMode&&selected ? "SWIPING \u2014 PRESS AND DRAG" : h.lf>0 ? "RE-SWIPE" : "SWIPE TO MEASURE"}
                    </button>
                    {/* Somewhere to say which face this is, in the estimator's
                        own words - "back alley", "over the canopy". */}
                    <input value={h.note} placeholder="NOTE"
                      onChange={e=>setHighlights(prev=>prev.map(row=>row.id===h.id?{...row,note:e.target.value}:row))}
                      onClick={(e)=>e.stopPropagation()}
                      className="mt-1 w-full rounded border border-zinc-900 bg-zinc-950 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-zinc-400 outline-none placeholder:text-zinc-700 focus:border-yellow-500/40"/>
                  </div>
                  );
                })}
                <button
                  onClick={()=>{
                    const id=`hl-${Date.now().toString(36)}`;
                    setHighlights(prev=>[...prev,{ id, label:`Highlight ${prev.length+1}`, a:{x:0,y:0}, b:{x:0,y:0}, lf:0, heightFt:0, note:"" }]);
                    setActiveHighlight(id);
                  }}
                  className="w-full rounded-lg border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 transition hover:border-yellow-500/40 hover:text-yellow-300">
                  + Add Highlight
                </button>
              </div>
            </div>
          )}

          {activeTab==="floor"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                {/* Reference point - its own step. It's an anchor shared
                    across levels, not a property of any one outline, so it
                    sits above the level list rather than inside a tile. */}
                {/*
                  * A reference point anchors traced levels to each other. Full
                  * Bid traces nothing and stacks nothing, so it has no use for
                  * one - and no floor levels or key floor either.
                  */}
                {depthTab!=="full-bid"&&(
                <div data-guide="reference-point" className={`rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 ${currentGuide==="reference-point"?"korban-guide-glow":""}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Reference Point</p>
                    <span className="text-[9px] text-zinc-600">
                      {floorLevels.filter(l=>l.refPoint).length}/{floorLevels.length} set
                    </span>
                  </div>
                  <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
                    Pick the same fixed feature on every level - a column, a grid intersection, a corner.
                    It&apos;s what lines the floors up with each other.
                  </p>
                  <div className="space-y-1">
                    {floorLevels.map(level=>(
                      <div key={level.id} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{background:level.color}} />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">{level.levelName}</span>
                        <span className={`text-[8px] font-mono ${level.refPoint?"text-yellow-400":"text-zinc-700"}`}>
                          {level.refPoint?"set":"-"}
                        </span>
                        <button onClick={()=>{setActiveLevel(level.id);setRefPickLevelId(refPickLevelId===level.id?null:level.id);}}
                          className={`rounded-lg border px-2 py-0.5 text-[9px] font-bold transition ${refPickLevelId===level.id?"animate-pulse border-yellow-400/60 bg-yellow-400/10 text-yellow-300":"border-zinc-700 text-zinc-500 hover:border-yellow-400/40 hover:text-yellow-300"}`}>
                          {refPickLevelId===level.id?"Click plan...":level.refPoint?"Redo":"Pick"}
                        </button>
                        {level.refPoint&&(
                          <button onClick={()=>setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,refPoint:null}:l))}
                            className="text-[9px] text-zinc-700 hover:text-red-400">&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                )}

                {depthTab!=="full-bid"&&(
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Floor Levels</p>
                )}
                {depthTab!=="full-bid"&&floorLevels.map((level,i)=>{
                  const isActive=level.id===activeLevel;
                  const isWorking=isActive&&(level.traceMode||level.tracePoints.length>0)&&!level.stored;
                  return (
                    <div key={level.id} onClick={()=>setActiveLevel(level.id)}
                      className={`rounded-xl border p-3 space-y-2.5 cursor-pointer transition ${level.stored?"border-emerald-500/30 bg-emerald-500/5":isWorking?"border-orange-500/60 bg-orange-500/5 shadow-[0_0_14px_rgba(249,115,22,0.18)]":isActive?"border-orange-500/40 bg-orange-500/5":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                      <div className="relative flex items-center gap-2">
                        {/* The dot is the control. Click it to recolour this level. */}
                        <button
                          onClick={e=>{e.stopPropagation();setColorPickerFor(c=>c===level.id?null:level.id);}}
                          title="Change this level's colour"
                          className="h-3 w-3 flex-shrink-0 rounded-full ring-1 ring-white/20 transition hover:ring-white/60"
                          style={{background:level.color}}
                        />
                        {colorPickerFor===level.id&&(
                          <div onClick={e=>e.stopPropagation()}
                            className="absolute left-0 top-5 z-50 grid grid-cols-6 gap-1 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-2xl">
                            {LEVEL_PALETTE.map(c=>(
                              <button key={c}
                                onClick={()=>{setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,color:c}:l));setColorPickerFor(null);}}
                                className={`h-4 w-4 rounded-full transition hover:scale-110 ${level.color===c?"ring-2 ring-white":"ring-1 ring-white/20"}`}
                                style={{background:c}}
                              />
                            ))}
                          </div>
                        )}
                        <input value={level.levelName} onClick={e=>e.stopPropagation()}
                          onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,levelName:e.target.value}:l))}
                          className="flex-1 min-w-0 bg-transparent text-[10px] font-bold text-zinc-200 outline-none border-b border-zinc-700 pb-0.5"/>
                        {!level.isKeyFloor&&<button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.filter((_,j)=>j!==i));}} className="text-[9px] text-zinc-700 hover:text-red-400">&times;</button>}
                      </div>

                      {/* Floors repeat far more often than they differ. */}
                      {(() => {
                        const sources = floorLevels.filter(l => l.id !== level.id && l.tracePoints.length >= 3);
                        if (sources.length === 0) return null;
                        const hasOwn = level.tracePoints.length >= 3;
                        return (
                          <div onClick={e=>e.stopPropagation()} className="flex items-center gap-2">
                            <label className="flex-shrink-0 text-[9px] text-zinc-600">
                              {hasOwn ? "Replace with" : "Same as"}
                            </label>
                            <select
                              defaultValue=""
                              onChange={e=>{
                                if (!e.target.value) return;
                                if (hasOwn && !window.confirm(`Replace ${level.levelName}'s outline with ${floorLevels.find(l=>l.id===e.target.value)?.levelName}'s?`)) { e.target.value=""; return; }
                                duplicateOutline(e.target.value, level.id);
                                e.target.value="";
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-orange-500/50"
                            >
                              <option value="">Copy an outline...</option>
                              {sources.map(src => (
                                <option key={src.id} value={src.id}>{src.levelName}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}

                      {/* LF - auto-calculated, condensed to one inline row */}
                      <div onClick={e=>e.stopPropagation()} className="flex items-center gap-2">
                        <label className="text-[9px] text-zinc-600 flex-shrink-0">Lineal Feet</label>
                        {level.traceClosed&&level.linealFeet>0
                          ? <span className="text-[8px] text-emerald-400 flex-shrink-0">Auto</span>
                          : <span className="text-[8px] text-zinc-700 flex-shrink-0 whitespace-nowrap">Trace to calc</span>}
                        <input value={level.linealFeet||""} placeholder="--"
                          readOnly={level.traceClosed&&level.linealFeet>0}
                          onChange={e=>setFloorLevels(prev=>prev.map((l,j)=>j===i?{...l,linealFeet:parseFloat(e.target.value)||0}:l))}
                          className={`flex-1 min-w-0 rounded-lg border px-2 py-1 text-right text-[10px] font-mono outline-none ${level.traceClosed&&level.linealFeet>0?"border-emerald-500/30 bg-emerald-500/5 text-emerald-300":"border-zinc-800 bg-zinc-900 text-orange-300 focus:border-orange-500/50"}`}/>
                      </div>

                      {/* Key floor - an explicit choice on every level, rather
                          than implied by one being named "Main". This is the
                          floor whose outline drives linear feet/quantities. */}
                      <button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.map(l=>({...l,isKeyFloor:l.id===level.id})));}}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${level.isKeyFloor?"border-orange-500/40 bg-orange-500/5":"border-zinc-800 hover:border-zinc-700"}`}>
                        <span className={`flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border ${level.isKeyFloor?"border-orange-500":"border-zinc-600"}`}>
                          {level.isKeyFloor&&<span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                        </span>
                        <span className={`text-[9px] ${level.isKeyFloor?"text-orange-300":"text-zinc-500"}`}>
                          {level.isKeyFloor?"Key floor - drives quantities":"Use as key floor"}
                        </span>
                      </button>

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
                          {level.traceClosed?"Done":"Close"}
                        </button>
                        <button onClick={()=>setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,stored:true,traceMode:false}:l))}
                          disabled={!level.traceClosed&&level.tracePoints.length===0}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition ${level.stored?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300"} disabled:opacity-30`}>
                          {level.stored?"Stored":"Store"}
                        </button>
                      </div>

                      {/* Undo Point - only while actively tracing this level */}
                      {level.traceMode&&!level.traceClosed&&level.tracePoints.length>0&&(
                        <button onClick={e=>{e.stopPropagation();setFloorLevels(prev=>prev.map(l=>l.id===level.id?{...l,tracePoints:l.tracePoints.slice(0,-1)}:l));}}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[9px] font-bold text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300">
                          Undo Point ({level.tracePoints.length} placed)
                        </button>
                      )}
                    </div>
                  );
                })}

                {depthTab!=="full-bid"&&(
                <button onClick={()=>setFloorLevels(prev=>[...prev,{id:`lvl-${Date.now()}`,levelName:`Level ${prev.length+1}`,isKeyFloor:false,linealFeet:0,color:LEVEL_COLORS[prev.length%LEVEL_COLORS.length],tracePoints:[],traceClosed:false,traceMode:false,stored:false,refPoint:null}])}
                  className="w-full rounded-xl border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition">
                  + Add Level
                </button>
                )}

                {/* Destructive, so it sits away from anything routine and says
                    plainly what goes. */}
                {(floorLevels.some(l => l.tracePoints.length > 0) || viewerUrl) && (
                  <button onClick={clearTakeoff}
                    className="w-full py-1.5 text-[9.5px] text-zinc-700 transition hover:text-red-400">
                    Clear this takeoff and start over
                  </button>
                )}

                {/* Overlay preview */}
                {allLevelPoints.length>0&&(() => {
                  // Preview the ACTUAL aligned stacking, not raw traces -
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
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider px-3 pt-3 pb-1.5">Overlay Preview &middot; Aligned Stack</p>
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
                          {missingRef.length} level{missingRef.length>1?"s":""} missing a reference point - {missingRef.length>1?"they":"it"} can&apos;t be stacked accurately until one is picked.
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
                <button data-guide="store" onClick={storeOverlay} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${overlayStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"} ${currentGuide==="store"&&!overlayStored?"korban-guide-glow":""}`}>{overlayStored?"Overlay Stored":"Store Overlay"}</button>

                {/* The plan is done; the heights are not. Say where to go. */}
                <button
                  onClick={()=>{ if(!overlayStored) storeOverlay(); setActiveTab("elevation"); }}
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[11px] font-bold text-zinc-300 transition hover:border-orange-500/50 hover:text-orange-300"
                >
                  Complete Overlay &rarr; Elevations
                </button>
              </div>
            </div>
          )}

          {/* -- ELEVATIONS -- */}
          {activeTab==="elevation"&&(
            <div className="flex flex-col h-full">
              <div className="p-4 flex-1 space-y-3 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  {activeCourtyard ? `${activeCourtyard.name} Heights` : "Elevation Heights"}
                </p>

                {/* Zone - the building itself, or a courtyard. Courtyards are
                    gripped exactly like elevations but stored separately so
                    their quantities can be toggled in or out of totals. */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-2 space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={()=>{setActiveZone("building");setSelectedElev(depthTab==="full-bid"&&highlights[0]?highlights[0].label:"North");setSelectedArea(1);setGripMode(false);}}
                      className={`rounded-lg px-2.5 py-1 text-[9px] font-bold border transition ${activeZone==="building"?"border-orange-500 bg-orange-500 text-black":"border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-orange-500/40"}`}>
                      Exterior
                    </button>
                    {courtyards.map(cy=>(
                      <button key={cy.id} onClick={()=>{setActiveZone(cy.id);setSelectedElev("North");setSelectedArea(1);setGripMode(false);}}
                        className={`rounded-lg px-2.5 py-1 text-[9px] font-bold border transition ${activeZone===cy.id?"border-emerald-500 bg-emerald-500 text-black":"border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-emerald-500/40"}`}>
                        {cy.name}
                      </button>
                    ))}
                    <button onClick={()=>{const c=makeCourtyard(courtyards.length+1);setCourtyards(prev=>[...prev,c]);setActiveZone(c.id);setSelectedElev("North");setSelectedArea(1);setGripMode(false);}}
                      className="rounded-lg border border-dashed border-zinc-700 px-2 py-1 text-[9px] text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-300">
                      + Courtyard
                    </button>
                  </div>
                  {activeCourtyard&&(
                    <div className="flex items-center gap-1.5">
                      <input value={activeCourtyard.name}
                        onChange={e=>setCourtyards(prev=>prev.map(c=>c.id===activeCourtyard.id?{...c,name:e.target.value}:c))}
                        className="flex-1 min-w-0 rounded border border-zinc-800 bg-black px-2 py-1 text-[9px] text-emerald-300 outline-none focus:border-emerald-500/50"/>
                      <button onClick={()=>{setCourtyards(prev=>prev.filter(c=>c.id!==activeCourtyard.id));setActiveZone("building");}}
                        className="rounded border border-zinc-800 px-2 py-1 text-[9px] text-zinc-600 hover:border-red-500/40 hover:text-red-400">
                        Remove
                      </button>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={includeCourtyards}
                      onChange={e=>setIncludeCourtyards(e.target.checked)}
                      className="h-3 w-3 accent-emerald-500"/>
                    <span className="text-[9px] text-zinc-500">Include courtyards in project totals</span>
                  </label>
                </div>

                <div className={usingHighlights&&activeZone==="building" ? "space-y-0.5 rounded-lg border border-zinc-900 bg-black p-1" : "flex gap-1 flex-wrap"}>
                  {/*
                    * The tiles are the strokes in Full Bid, the compass faces
                    * otherwise - each stroke carries the footage it claimed.
                    */}
                  {(usingHighlights&&activeZone==="building"
                      ? highlights.map(h=>h.label)
                      : ELEVATION_DIRS).map(dir=>{
                    // A face counts as "in use" once something's gripped on
                    // it - courtyards often have an open side that never is.
                    const face=activeFaces.find(f=>f.direction===dir);
                    const used=face?.areas.some(a=>a.rect&&a.lf>0);
                    const stroke=highlights.find(h=>h.label===dir);
                    return (
                    <button key={dir} onClick={()=>{setSelectedElev(dir);setSelectedArea(1);setGripMode(false);}}
                      className={stroke
                        ? `flex w-full items-center justify-between rounded px-2 py-1 text-left text-[10px] transition ${selectedElev===dir?"bg-zinc-900 text-zinc-200":"text-zinc-500 hover:text-zinc-300"}`
                        : `rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${selectedElev===dir?"border-orange-500 bg-orange-500 text-black":used?"border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-orange-500/40":"border-zinc-800 bg-zinc-900 text-zinc-600 hover:border-orange-500/40"}`}>
                      {stroke
                        ? <><span className="font-mono uppercase tracking-[0.08em]">{dir}</span><span className={`font-mono ${stroke.lf>0?"text-yellow-300":"text-zinc-600"}`}>{stroke.lf>0?`${stroke.lf}'`:"\u2014"}</span></>
                        : <>{dir}{used&&selectedElev!==dir?" \u00b7":""}</>}
                    </button>
                    );
                  })}
                </div>

                {/* Duplicate toggles - North to South, East to West */}
                {activeZone==="building"&&!usingHighlights&&selectedElev==="North"&&(
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{duplicateElevation("North","South");setDupSouth(true);}}
                      className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold transition ${dupSouth?"border-orange-500/40 bg-orange-500/10 text-orange-300":"border-zinc-800 text-zinc-600 hover:border-zinc-600"}`}>
                      {dupSouth?"Copied to South - click to re-copy":"Duplicate to South"}
                    </button>
                  </div>
                )}
                {activeZone==="building"&&selectedElev==="East"&&(
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{duplicateElevation("East","West");setDupWest(true);}}
                      className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold transition ${dupWest?"border-orange-500/40 bg-orange-500/10 text-orange-300":"border-zinc-800 text-zinc-600 hover:border-zinc-600"}`}>
                      {dupWest?"Copied to West - click to re-copy":"Duplicate to West"}
                    </button>
                  </div>
                )}

                <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{selectedElev}{depthTab==="korban-bid" ? " - Coverage Areas" : usingHighlights ? " - height only" : " Elevation"}</p>

                {(depthTab==="full-bid" ? currentElevData.areas.slice(0,1) : currentElevData.areas).map((area,aIdx)=>{
                  const hasData=area.rect&&area.lf>0;
                  const isSelected=selectedArea===area.areaIndex;
                  return (
                    <div key={area.id} onClick={()=>setSelectedArea(area.areaIndex)}
                      className={`rounded-xl border p-3 cursor-pointer transition ${hasData?"border-orange-500/40 bg-orange-500/5":isSelected?"border-zinc-600 bg-zinc-900":"border-zinc-800 bg-black hover:border-zinc-700"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold ${isSelected?"text-orange-300":"text-zinc-400"}`}>
                          {depthTab==="korban-bid" ? `Area ${area.areaIndex}` : usingHighlights ? selectedElev : `${selectedElev} Elevation`}
                          {usingHighlights&&(()=>{
                            const stroke=highlights.find(h=>h.label===selectedElev);
                            return stroke ? <span className="ml-2 font-mono text-[10px] font-normal text-yellow-300">{stroke.lf}&apos; lineal</span> : null;
                          })()}
                        </span>
                        {hasData&&<button onClick={e=>{e.stopPropagation();updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,rect:null,lf:0,heightFt:0,frameTall:0,legs:0,bayCount:0}:a)}:ed));}} className="text-[9px] text-zinc-600 hover:text-red-400">Clear</button>}
                      </div>

                      {hasData?(
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">LF</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.lf}</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">Height</p>
                            <p className="font-mono text-[11px] text-orange-300 font-bold">{area.heightFt}&apos;</p>
                          </div>
                          <div className="text-center rounded-lg border border-zinc-800 bg-black p-1.5">
                            <p className="text-[7px] text-zinc-600 uppercase">Frames/leg</p>
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

                      {/* Level range - optional, and only where levels exist.
                          Full Bid traces none, so a highlight has none. */}
                      {!usingHighlights&&(
                      <div onClick={e=>e.stopPropagation()} className="mb-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                        <label className="text-[8px] uppercase tracking-wider text-zinc-600 block mb-1">Level Range (optional)</label>
                        <div className="flex items-center gap-1">
                          <select value={area.fromLevelId ?? ""}
                            onChange={e=>{const v=e.target.value||null;updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,fromLevelId:v}:a)}:ed));}}
                            className="flex-1 min-w-0 rounded border border-zinc-800 bg-black px-1 py-1 text-[8px] font-mono text-orange-300 outline-none focus:border-orange-500/50">
                            <option value="">From...</option>
                            {floorLevels.map(l=><option key={l.id} value={l.id}>{l.levelName}</option>)}
                          </select>
                          <span className="text-[8px] text-zinc-600">&rarr;</span>
                          <select value={area.toLevelId ?? ""}
                            onChange={e=>{const v=e.target.value||null;updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,toLevelId:v}:a)}:ed));}}
                            className="flex-1 min-w-0 rounded border border-zinc-800 bg-black px-1 py-1 text-[8px] font-mono text-orange-300 outline-none focus:border-orange-500/50">
                            <option value="">To...</option>
                            {floorLevels.map(l=><option key={l.id} value={l.id}>{l.levelName}</option>)}
                          </select>
                        </div>
                        {(() => {
                          if (!area.fromLevelId) return null;
                          const base = deriveRunBaseFt(area, currentElevData.areas);
                          if (base === null) return (
                            <p className="mt-1 text-[8px] leading-tight text-yellow-500">A level below this isn&apos;t gripped - base height unknown.</p>
                          );
                          return (
                            <p className="mt-1 text-[8px] font-mono text-emerald-400">
                              Starts at {Math.floor(base)}&apos;-{Math.round((base % 1) * 12)}&quot; {base === 0 ? "(grade)" : "above grade"}
                            </p>
                          );
                        })()}
                      </div>
                      )}

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
                        <button onClick={()=>updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{...ed,areas:ed.areas.map(a=>a.areaIndex===area.areaIndex?{...a,stored:true}:a)}:ed))}
                          disabled={!hasData}
                          className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[8px] font-bold transition ${area.stored?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40"} disabled:opacity-30`}>
                          {area.stored?"Stored":"Store"}
                        </button>
                      </div>

                      {/* The estimator's own words, at the foot of the tile. */}
                      {usingHighlights&&(()=>{
                        const stroke=highlights.find(h=>h.label===selectedElev);
                        if(!stroke) return null;
                        return (
                          <input value={stroke.note} placeholder="NOTE"
                            onClick={e=>e.stopPropagation()}
                            onChange={e=>setHighlights(prev=>prev.map(row=>row.id===stroke.id?{...row,note:e.target.value}:row))}
                            className="mt-2 w-full rounded border border-zinc-800 bg-black px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-zinc-400 outline-none placeholder:text-zinc-700 focus:border-yellow-500/40"/>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Multiple areas per elevation are a Korban Bid capability.
                    Full Bid keeps it to one grip per elevation. */}
                {depthTab==="korban-bid" ? (
                <button onClick={()=>updateActiveFaces(prev=>prev.map(ed=>ed.direction===selectedElev?{
                  ...ed,
                  areas:[...ed.areas,newElevArea(ed.areas.length+1,selectedElev)],
                }:ed))}
                  className="w-full rounded-xl border border-dashed border-zinc-800 py-2 text-[10px] text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition">
                  + Add Area
                </button>
                ) : (
                <p className="rounded-xl border border-dashed border-zinc-900 py-2 text-center text-[9.5px] text-zinc-700">
                  One grip per elevation at this depth. Korban Bid adds multiple areas.
                </p>
                )}

                {/* Summary */}
                <div className="rounded-xl border border-zinc-800 bg-black p-3">
                  {/*
                    * The summary mirrors the tiles: highlights in Full Bid,
                    * compass faces otherwise. Listing North, East, South and
                    * West under a set of highlights described a building the
                    * estimator never measured.
                    */}
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">
                    {usingHighlights ? "All Highlights to Set Scaffold" : "All Elevations to Set Scaffold"}
                  </p>
                  {(usingHighlights ? highlights.map(h=>h.label) : ELEVATION_DIRS).map(dir=>{
                    const ed=activeFaces.find(e=>e.direction===dir);
                    const stroke=highlights.find(h=>h.label===dir);
                    const filled=ed?.areas.filter(a=>a.rect&&a.lf>0)??[];
                    const totalLF=stroke ? stroke.lf : filled.reduce((s,a)=>s+a.lf,0);
                    const totalLegs=filled.reduce((s,a)=>s+a.legs,0);
                    const avgFT=filled.length?Math.round(filled.reduce((s,a)=>s+a.frameTall,0)/filled.length):0;
                    return (
                      <div key={dir} className={`py-1 border-b border-zinc-900 last:border-0 ${filled.length||(stroke?.lf??0)>0?"":"opacity-40"}`}>
                        <div className="flex justify-between text-[9px]">
                          <span className="text-zinc-500 font-bold">{dir}</span>
                          <span className={`font-mono ${totalLF>0?"text-orange-300":"text-zinc-700"}`}>{totalLF>0?`${totalLF.toFixed(0)}LF`:"-"}</span>
                        </div>
                        {filled.length>0&&<p className="text-[8px] text-zinc-600">{totalLegs} legs &middot; {avgFT} frames per leg</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button data-guide="store" onClick={()=>storeElevations()} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${elevStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"} ${currentGuide==="store"&&!elevStored?"korban-guide-glow":""}`}>{elevStored?"Stored":"Store Elevations"}</button>

                {/*
                  * Where the takeoff ends depends on the tier. Korban Bid can
                  * draw a section against the wall, which is what buys its
                  * accuracy - offered, not required, and said plainly either
                  * way so nobody wonders whether they skipped something.
                  */}
                {depthTab === "korban-bid" && (
                  <div className="mt-2">
                    <button
                      onClick={()=>{ if(!elevStored) storeElevations(); window.location.href="/set-scaffold-v2#section"; }}
                      className={`w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-[11px] font-semibold text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300 ${currentGuide==="section"?"korban-guide-glow":""}`}
                    >
                      Start Section View
                    </button>
                    <p className="mt-1 text-center text-[9.5px] uppercase tracking-[0.14em] text-zinc-700">
                      optional
                    </p>
                  </div>
                )}

                <button
                  onClick={()=>{
                    if(!elevStored) storeElevations();
                    /*
                     * Hand over at the tier actually worked in.
                     *
                     * Opening a deeper tab promotes the job, but dropping back
                     * to a shallower one never demoted it - so a job once taken
                     * to Korban Bid still arrived at Set Scaffold asking for
                     * sections, showing an old one from a different takeoff.
                     */
                    try{ setEstimateDepth(depthTab as EstimateDepth); }catch{}
                    window.location.href="/set-scaffold-v2";
                  }}
                  className="mt-2 w-full rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black transition hover:bg-orange-400"
                >
                  Complete Takeoff &rarr;
                </button>
              </div>
            </div>
          )}

          {/* -- SECTION VIEW -- */}
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

                    {/* Wall offset + top of wall height */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-1">Wall Offset</label>
                        <input value={activeSec.wallOffset} type="number" step="0.5" min="0"
                          onChange={e=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOffset:parseFloat(e.target.value)||1}:s))}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-orange-300 outline-none focus:border-orange-500/50"/>
                      </div>
                      {/*
                        * Shown, not typed.
                        *
                        * The grip measured this wall already, and worker reach
                        * comes from Backend. A second field invited a number
                        * that disagreed with the grip, on the same job.
                        */}
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-1">Top of Wall Ht.</label>
                        <div className="w-full rounded-xl border border-zinc-800 bg-black px-2 py-1.5 text-xs font-mono text-zinc-300">
                          {activeSec.topOfWallDistance > 0
                            ? `${activeSec.topOfWallDistance.toFixed(1)}'`
                            : "from grip"}
                        </div>
                      </div>
                    </div>
                    <p className="text-[8px] leading-relaxed text-zinc-600">
                      Wall height comes from the elevation grip. The top working deck lands a
                      worker&apos;s reach below it &mdash; {backendSettings?.scaffold?.workerReachHeight ?? 6}&apos;,
                      set in Backend &gt; Scaffold Defaults, and used everywhere working height is figured.
                    </p>

                    {/* Wall outline status */}
                    {activeSec.wallOutline.length>0&&(
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 flex items-center justify-between">
                        <span className="text-[9px] text-blue-300">{activeSec.wallComplete?"Wall complete":"Wall outline in progress..."}</span>
                        <button onClick={()=>setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallOutline:[],wallComplete:false,totalLF:0,totalLegs:0,totalFrames:0,totalPlanks:0}:s))}
                          className="text-[9px] text-zinc-600 hover:text-red-400">Clear</button>
                      </div>
                    )}

                    {/* Scaffold side toggle - appears once wall outline is complete */}
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

                    {/* Quantities this section produced. Shown here so the
                        per-jump counts are visible without leaving the tab. */}
                    {activeSec.wallComplete&&activeSec.totalLF>0&&(
                      <div className="rounded-xl border border-zinc-800 bg-black p-2.5">
                        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1.5">Section Quantities</p>
                        {activeSec.frameMakeup.filter(f=>f.qty>0).map(f=>(
                          <div key={f.partNo} className="flex items-center gap-2 py-0.5">
                            <span className="w-11 shrink-0 font-mono text-[8px] text-orange-400">{f.partNo}</span>
                            <span className="flex-1 truncate text-[9px] text-zinc-500">{f.description}</span>
                            <span className="font-mono text-[10px] font-bold text-orange-300">{f.qty.toLocaleString()}</span>
                          </div>
                        ))}
                        <p className="mt-1.5 border-t border-zinc-900 pt-1.5 font-mono text-[8px] text-zinc-600">
                          {activeSec.totalLF} LF &middot; {activeSec.totalLegs} legs &middot; {activeSec.totalLegs>0?Math.round(activeSec.totalFrames/activeSec.totalLegs):0} frames per leg
                        </p>
                      </div>
                    )}

                    {/* Start / Complete / Store */}
                    <div className="flex gap-1.5">
                      <button onClick={()=>setWallOutlineMode(true)}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${wallOutlineMode?"border-blue-500 bg-blue-500/15 text-blue-300":"border-zinc-700 text-zinc-500 hover:border-blue-500/40"}`}>
                        Start
                      </button>
                      <button onClick={()=>{setSections(prev=>prev.map(s=>s.id===activeSection?{...s,wallComplete:true}:s));setWallOutlineMode(false);autoPopulateSectionInventory(activeSection,activeSec.wallOutline,tabScales.section.locked?tabScales.section.pageUnitsPerFoot:null);}}
                        disabled={!activeSec.wallOutline||activeSec.wallOutline.length<2||activeSec.wallComplete}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${activeSec.wallComplete?"border-emerald-500/40 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-emerald-500/40"} disabled:opacity-30`}>
                        {activeSec.wallComplete?"Done":"Complete"}
                      </button>
                      <button onClick={storeSection}
                        className={`flex-1 rounded-lg border px-2 py-2 text-[9px] font-bold transition ${sectionStored?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-zinc-700 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300"}`}>
                        {sectionStored?"Stored":"Store"}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="p-4 border-t border-zinc-900">
                <button onClick={storeSection} className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${sectionStored?"bg-emerald-500 text-black":"bg-orange-500 text-black hover:bg-orange-400"}`}>{sectionStored?"Stored":"Store Section"}</button>
              </div>
            </div>
          )}
        </aside>
      </div>
      )}
    </main>
  );
}
