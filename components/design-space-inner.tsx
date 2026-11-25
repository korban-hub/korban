"use client";

/**
 * Design Space.
 *
 * A drafting table with no job behind it: open a plan set, lock the scale,
 * and sketch scaffold on it. A run is swiped along a wall or clicked corner
 * to corner; type its height and Korban stands the legs, braces the bays and
 * counts the frames and planks - by the same engine and the same frame rules
 * Set Scaffold uses.
 *
 * Nothing here belongs to a job. Drafts are kept on their own, and the page
 * carries no link into the bid flow.
 *
 * Beside the runs there are the company's own drafting blocks to stamp on
 * the sheet, and the marks a drafter reaches for: line, box, cloud, note and
 * dimension. Print puts what was drawn - and only that - on a Korban sheet,
 * black on white, in the title block.
 *
 * Still to come: drafts on the account, and "Make this a job".
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getBackendSettings } from "@/lib/backendStore";
import { loadPlanSheet, savePlanPage, savePlanSheet, clearPlanSheet } from "@/lib/planStore";
import { parseFeetInches } from "@/lib/projectStore";
import type { PlanPoint } from "@/lib/scaffoldSetOut";
import { BLOCK_GROUPS, BLOCK_UNITS_PER_FOOT, DESIGN_BLOCKS, blockById, type DesignBlock } from "@/lib/designBlocks";
import {
  BAY_LENGTHS,
  FRAME_WIDTHS,
  cloudPath,
  countSheet,
  deleteDraft,
  distanceToMark,
  distanceToRun,
  draftSummary,
  emptySheet,
  feetInches,
  lastDraftId,
  laySheet,
  legKey,
  listDrafts,
  newDraft,
  nextRunLabel,
  orthoSnap,
  planKey,
  pointInBlock,
  saveDraft,
  snapToRuns,
  type DesignDraft,
  type DesignMark,
  type DesignRun,
  type DesignSheet,
  type LaidRun,
  type LaidWall,
  type LegEdit,
  type MarkKind,
  type PlacedBlock,
} from "@/lib/designSpace";

type Tool = "select" | "run" | "points" | "edit" | "measure" | "scale" | "block" | MarkKind;
const MARK_KINDS: MarkKind[] = ["line", "box", "cloud", "dim", "text"];
const isMarkTool = (tool: Tool): tool is MarkKind => (MARK_KINDS as string[]).includes(tool);

/** Paper the sheet prints on, and the width of the title block column on each. Set Scaffold's sizes. */
const SHEET_SIZES = {
  "letter": { label: "8\u00bd \u00d7 11", css: "letter landscape", colIn: 2.1 },
  "tabloid": { label: "11 \u00d7 17", css: "tabloid landscape", colIn: 2.4 },
  "arch-d": { label: "36 \u00d7 24", css: "36in 24in", colIn: 3.4 },
  "arch-e": { label: "42 \u00d7 30", css: "42in 30in", colIn: 3.8 },
} as const;
type SheetSize = keyof typeof SHEET_SIZES;

const INK = "#f97316";
/** Every page is drawn at this scale, so a point picked today lands in the same place tomorrow. */
const RENDER_SCALE = 1.5;
const PX_PER_PAPER_INCH = 72 * RENDER_SCALE;

/** Scales a set is drawn to, as paper inches per foot. */
const PRESET_SCALES: { label: string; inPerFt: number }[] = [
  { label: "1/16\" = 1'-0\"", inPerFt: 1 / 16 },
  { label: "3/32\" = 1'-0\"", inPerFt: 3 / 32 },
  { label: "1/8\" = 1'-0\"", inPerFt: 1 / 8 },
  { label: "3/16\" = 1'-0\"", inPerFt: 3 / 16 },
  { label: "1/4\" = 1'-0\"", inPerFt: 1 / 4 },
  { label: "3/8\" = 1'-0\"", inPerFt: 3 / 8 },
  { label: "1/2\" = 1'-0\"", inPerFt: 1 / 2 },
  { label: "1\" = 10'", inPerFt: 1 / 10 },
  { label: "1\" = 20'", inPerFt: 1 / 20 },
  { label: "1\" = 30'", inPerFt: 1 / 30 },
  { label: "1\" = 40'", inPerFt: 1 / 40 },
];

/** What a measured scale comes to on paper, when it is one a set would be drawn at. */
function scaleName(puf: number, isPdf: boolean, typed: string): string {
  if (isPdf) {
    const inPerFt = puf / PX_PER_PAPER_INCH;
    const match = PRESET_SCALES.find((s) => Math.abs(s.inPerFt - inPerFt) / s.inPerFt < 0.02);
    if (match) return match.label;
  }
  return typed ? `${typed} measured` : "Scale set";
}

const TOOLS: { id: Tool; name: string; tip: string; icon: React.ReactNode }[] = [
  { id: "select", name: "Select", tip: "Pick a run", icon: <path d="M5 3l10 7-4.5 1 2.5 5-2 1-2.5-5L5 15z" /> },
  { id: "run", name: "Run", tip: "Drag along a wall", icon: <path d="M3 14L17 6" strokeWidth="3" strokeLinecap="round" /> },
  { id: "points", name: "Points", tip: "Click corner to corner", icon: <><path d="M3 15L8 6l5 6 4-8" /><circle cx="3" cy="15" r="1.4" fill="currentColor" /><circle cx="8" cy="6" r="1.4" fill="currentColor" /><circle cx="13" cy="12" r="1.4" fill="currentColor" /><circle cx="17" cy="4" r="1.4" fill="currentColor" /></> },
  { id: "edit", name: "Edit Bay", tip: "Move, remove or re-count a leg", icon: <path d="M3 6v8M10 6v8M17 6v8M3 10h14" /> },
  { id: "measure", name: "Measure", tip: "Distance between two points", icon: <path d="M3 14l11-11 3 3L6 17z M7 10l1.5 1.5M10 7l1.5 1.5" /> },
];

const MARK_TOOLS: { id: MarkKind; name: string; tip: string; icon: React.ReactNode }[] = [
  { id: "line", name: "Line", tip: "Straight line", icon: <path d="M3 16L17 4" /> },
  { id: "box", name: "Box", tip: "Rectangle", icon: <rect x="3" y="5" width="14" height="10" /> },
  { id: "cloud", name: "Cloud", tip: "Revision cloud", icon: <path d="M6 13a3 3 0 010-6 3.5 3.5 0 016.5-1A3 3 0 0115 13z" /> },
  { id: "text", name: "Note", tip: "Text note", icon: <path d="M4 5h12M10 5v11" /> },
  { id: "dim", name: "Dimension", tip: "Dimension line", icon: <path d="M3 10h14M3 6v8M17 6v8" /> },
];

/** The menu a drafting page carries: the places you come from, none of the job's own steps. */
const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/projects", label: "Projects" },
  { href: "/backend", label: "Backend" },
];

/** The drawing cursor Takeoff and Set Scaffold use, so an armed tool looks the same everywhere. */
const KORBAN_CROSSHAIR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg stroke='%23f97316' stroke-width='2'%3E%3Cline x1='12' y1='1' x2='12' y2='9'/%3E%3Cline x1='12' y1='15' x2='12' y2='23'/%3E%3Cline x1='1' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='23' y2='12'/%3E%3C/g%3E%3Ccircle cx='12' cy='12' r='1.5' fill='%23f97316'/%3E%3C/svg%3E") 12 12, crosshair`;

export default function DesignSpaceInner() {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<DesignDraft | null>(null);
  const [drafts, setDrafts] = useState<DesignDraft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // The sheet on screen.
  const [pdfDoc, setPdfDoc] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const pdfLib = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isPdf, setIsPdf] = useState(true);
  const [totalPages, setTotalPages] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [viewerUrl, setViewerUrl] = useState("");
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0.6);
  const [busy, setBusy] = useState("");
  const [needPlan, setNeedPlan] = useState(false);

  // Tools.
  const [tool, setTool] = useState<Tool>("select");
  const [scalePts, setScalePts] = useState<PlanPoint[]>([]);
  const [scaleInput, setScaleInput] = useState("");
  const [dragFrom, setDragFrom] = useState<PlanPoint | null>(null);
  const [dragTo, setDragTo] = useState<PlanPoint | null>(null);
  const [chain, setChain] = useState<PlanPoint[]>([]);
  const [hover, setHover] = useState<PlanPoint | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedLeg, setSelectedLeg] = useState<{ wall: string; index: number } | null>(null);
  const legDrag = useRef<{ key: string; start: PlanPoint; base: { dx: number; dy: number }; along: PlanPoint } | null>(null);
  const [measureFrom, setMeasureFrom] = useState<PlanPoint | null>(null);
  const [measures, setMeasures] = useState<{ a: PlanPoint; b: PlanPoint; ft: number }[]>([]);
  const [heightDrafts, setHeightDrafts] = useState<Record<string, string>>({});
  // Blocks and marks.
  const [armedBlock, setArmedBlock] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ kind: "block" | "mark"; id: string } | null>(null);
  const itemDrag = useRef<{ kind: "block" | "mark"; id: string; start: PlanPoint; block?: PlacedBlock; mark?: DesignMark } | null>(null);
  const [noteAt, setNoteAt] = useState<{ pt: PlanPoint; text: string } | null>(null);
  const notePending = useRef<PlanPoint | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set([BLOCK_GROUPS[0]]));
  const [sheetSize, setSheetSize] = useState<SheetSize>("letter");
  const [company, setCompany] = useState("");
  // A label the way a drafting program gives one: small, plain, beside the thing. One of them,
  // floated over the page, so a panel that scrolls cannot cut it off.
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tipFor = (text: string) => ({
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text, x: r.right + 6, y: r.top + r.height / 2 }); },
    onMouseLeave: () => setTip(null),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const rules = useMemo(() => {
    const scaffold = (ready ? getBackendSettings()?.scaffold : null) as { workerReachHeight?: number; screwJackMaxExtension?: number; wallOffset?: number } | null;
    return { reachFt: scaffold?.workerReachHeight ?? 6, jackMaxIn: scaffold?.screwJackMaxExtension ?? 12, standoffFt: scaffold?.wallOffset ?? 1 };
  }, [ready]);

  useEffect(() => {
    if (ready) setCompany(getBackendSettings()?.company?.companyName ?? "");
  }, [ready]);

  const sheet: DesignSheet = useMemo(() => draft?.sheets[String(pageNo)] ?? emptySheet(), [draft, pageNo]);
  const puf = sheet.puf ?? 0;
  const laid: LaidRun[] = useMemo(() => laySheet(sheet, rules), [sheet, rules]);
  const count = useMemo(() => countSheet(laid), [laid]);

  // ---- Drafts ----------------------------------------------------------
  const saveTimer = useRef<number | null>(null);
  const commit = useCallback((next: DesignDraft) => {
    setDraft(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const ok = saveDraft(next);
      setSaveFailed(!ok);
      if (ok) { setSavedAt(new Date()); setDrafts(listDrafts()); }
    }, 400);
  }, []);

  const updateSheet = useCallback((change: (s: DesignSheet) => DesignSheet) => {
    setDraft((current) => {
      if (!current) return current;
      const key = String(pageNo);
      const next = { ...current, sheets: { ...current.sheets, [key]: change(current.sheets[key] ?? emptySheet()) } };
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        const ok = saveDraft(next);
        setSaveFailed(!ok);
        if (ok) { setSavedAt(new Date()); setDrafts(listDrafts()); }
      }, 400);
      return next;
    });
  }, [pageNo]);

  // Leaving the page writes what is on it. The save above waits a moment for
  // typing to settle, and a tab closed inside that moment would lose the last touch.
  const latest = useRef<DesignDraft | null>(null);
  latest.current = draft;
  useEffect(() => {
    const flush = () => { if (latest.current && saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; saveDraft(latest.current); } };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);

  const updateRun = (id: string, patch: Partial<DesignRun>) =>
    updateSheet((s) => ({ ...s, runs: s.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const updateLeg = (key: string, patch: LegEdit | null) =>
    updateSheet((s) => {
      const legEdits = { ...s.legEdits };
      if (patch === null) delete legEdits[key]; else legEdits[key] = { ...legEdits[key], ...patch };
      return { ...s, legEdits };
    });
  function removeRun(id: string) {
    updateSheet((s) => ({
      ...s,
      runs: s.runs.filter((r) => r.id !== id),
      legEdits: Object.fromEntries(Object.entries(s.legEdits).filter(([k]) => !k.startsWith(`${id}~`))),
    }));
    setSelectedRun(null); setSelectedLeg(null);
  }

  // ---- Blocks and marks -------------------------------------------------
  /** A block's size on this sheet: its drawing is in points, eighteen to the foot. */
  const blockSize = (block: DesignBlock) => ({ w: (block.w / BLOCK_UNITS_PER_FOOT) * puf, h: (block.h / BLOCK_UNITS_PER_FOOT) * puf });
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function placeBlock(blockId: string, pt: PlanPoint) {
    if (!(puf > 0) || !blockById(blockId)) return;
    const placed: PlacedBlock = { id: newId("blk"), blockId, x: pt.x, y: pt.y, rot: 0 };
    updateSheet((s) => ({ ...s, blocks: [...s.blocks, placed] }));
    setPicked({ kind: "block", id: placed.id }); setSelectedRun(null);
  }
  const updateBlock = (id: string, patch: Partial<PlacedBlock>) =>
    updateSheet((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const updateMark = (id: string, patch: Partial<DesignMark>) =>
    updateSheet((s) => ({ ...s, marks: s.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  function addMark(kind: MarkKind, a: PlanPoint, b: PlanPoint, text = "") {
    const mark: DesignMark = { id: newId("mark"), kind, a, b, text };
    updateSheet((s) => ({ ...s, marks: [...s.marks, mark] }));
    setPicked({ kind: "mark", id: mark.id }); setSelectedRun(null);
  }
  function removePicked() {
    if (!picked) return;
    updateSheet((s) => picked.kind === "block"
      ? { ...s, blocks: s.blocks.filter((b) => b.id !== picked.id) }
      : { ...s, marks: s.marks.filter((m) => m.id !== picked.id) });
    setPicked(null);
  }
  function commitNote() {
    if (noteAt && noteAt.text.trim()) addMark("text", noteAt.pt, noteAt.pt, noteAt.text.trim());
    setNoteAt(null);
  }

  // ---- The plan set ----------------------------------------------------
  async function lib() {
    if (pdfLib.current) return pdfLib.current;
    const loaded = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    loaded.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
    pdfLib.current = loaded;
    return loaded;
  }

  async function renderPage(pdf: any, n: number, extraTurn: number): Promise<string> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const page = await pdf.getPage(n);
    // The sheet's own rotation first, ours added to it - getViewport replaces rather than adds.
    const viewport = page.getViewport({ scale: RENDER_SCALE, rotation: ((page.rotate ?? 0) + extraTurn) % 360 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  const openPlan = useCallback(async (into: DesignDraft, buf: ArrayBuffer, mimeType: string, page: number) => {
    setBusy("Opening…"); setViewerUrl(""); setPdfDoc(null); setNeedPlan(false);
    try {
      if (mimeType.startsWith("image/")) {
        setIsPdf(false); setTotalPages(1); setPageNo(1);
        setViewerUrl(URL.createObjectURL(new Blob([buf], { type: mimeType })));
      } else {
        const pdfjs = await lib();
        const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        const wanted = Math.min(Math.max(1, page), pdf.numPages);
        setIsPdf(true); setPdfDoc(pdf); setTotalPages(pdf.numPages); setPageNo(wanted);
        setViewerUrl(await renderPage(pdf, wanted, into.sheets[String(wanted)]?.rotation ?? 0));
      }
    } catch {
      setNeedPlan(true);
    } finally {
      setBusy("");
    }
  }, []);

  const openDraft = useCallback(async (next: DesignDraft) => {
    setDraft(next); setDraftsOpen(false);
    setSelectedRun(null); setSelectedLeg(null); setChain([]); setMeasures([]); setScalePts([]); setTool("select");
    setViewerUrl(""); setPdfDoc(null); setTotalPages(0); setPageNo(next.pageNumber || 1); setNeedPlan(false);
    try { window.localStorage.setItem("designSpaceActiveDraft", next.id); } catch { /* storage unavailable */ }
    const plan = await loadPlanSheet(planKey(next.id)).catch(() => null);
    if (plan) await openPlan(next, plan.data, plan.mimeType, plan.pageNumber ?? next.pageNumber ?? 1);
    else if (next.fileName) setNeedPlan(true);
  }, [openPlan]);

  useEffect(() => {
    const all = listDrafts();
    setDrafts(all);
    const wanted = all.find((d) => d.id === lastDraftId()) ?? all[0];
    setReady(true);
    if (wanted) void openDraft(wanted);
    else { const fresh = newDraft(); saveDraft(fresh); setDrafts(listDrafts()); void openDraft(fresh); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File | null) {
    if (!file || !draft) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") return;
    const drawn = Object.values(draft.sheets).some((s) => s.runs.length > 0);
    if (drawn && draft.fileName && draft.fileName !== file.name &&
      !window.confirm(`This draft was drawn on ${draft.fileName}. Open ${file.name} under it instead? What is drawn stays where it is on each page.`)) return;
    const buf = await file.arrayBuffer();
    const next = { ...draft, fileName: file.name };
    commit(next);
    void savePlanSheet(planKey(draft.id), { data: buf, fileName: file.name, mimeType: file.type, pageNumber: pageNo, savedAt: new Date().toISOString() });
    await openPlan(next, buf, file.type, drawn ? pageNo : 1);
  }

  async function goToPage(n: number) {
    if (!pdfDoc || busy || !draft) return;
    const p = Math.max(1, Math.min(n, totalPages));
    if (p === pageNo) return;
    setBusy("Loading…"); setSelectedRun(null); setSelectedLeg(null); setChain([]); setMeasures([]); setScalePts([]);
    try {
      setViewerUrl(await renderPage(pdfDoc, p, draft.sheets[String(p)]?.rotation ?? 0));
      setPageNo(p);
      commit({ ...draft, pageNumber: p });
      void savePlanPage(planKey(draft.id), p);
    } finally { setBusy(""); }
  }

  async function rotate() {
    if (!pdfDoc || !draft) return;
    if (sheet.runs.length > 0 && !window.confirm("Turning the page clears what is drawn on it and its scale. Turn it?")) return;
    const turn = (sheet.rotation + 90) % 360;
    updateSheet(() => ({ ...emptySheet(), rotation: turn }));
    setBusy("Turning…");
    try { setViewerUrl(await renderPage(pdfDoc, pageNo, turn)); } finally { setBusy(""); }
  }

  function fit() {
    const box = viewerRef.current?.getBoundingClientRect();
    if (!box || !natural.w) return;
    const z = Math.min((box.width - 48) / natural.w, (box.height - 48) / natural.h);
    if (z > 0 && Number.isFinite(z)) setZoom(z);
  }
  useEffect(() => { if (natural.w) fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [natural.w, natural.h]);

  // ---- Scale -----------------------------------------------------------
  function lockScale() {
    const ft = parseFeetInches(scaleInput);
    if (scalePts.length < 2 || !(ft > 0)) return;
    const px = Math.hypot(scalePts[1].x - scalePts[0].x, scalePts[1].y - scalePts[0].y);
    if (!(px > 0)) return;
    const next = px / ft;
    updateSheet((s) => ({ ...s, puf: next, scaleLabel: scaleName(next, isPdf, scaleInput.trim()) }));
    setScalePts([]); setScaleInput(""); setTool("run");
  }
  function presetScale(inPerFt: number, label: string) {
    updateSheet((s) => ({ ...s, puf: inPerFt * PX_PER_PAPER_INCH, scaleLabel: label }));
    setScalePts([]); setTool("run");
  }
  function unlockScale() {
    if (sheet.runs.length > 0 && !window.confirm("Changing the scale re-measures every run on this sheet. Change it?")) return;
    updateSheet((s) => ({ ...s, puf: null, scaleLabel: "" }));
    setTool("scale");
  }

  // ---- Drawing ---------------------------------------------------------
  function sheetPoint(e: ReactMouseEvent | MouseEvent): PlanPoint | null {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (e.clientX - r.left) * ((img.naturalWidth || r.width) / r.width), y: (e.clientY - r.top) * ((img.naturalHeight || r.height) / r.height) };
  }
  const reach = 10 / Math.max(zoom, 0.05); // a constant on screen

  /** A point for a run: onto an end already drawn if one is near, otherwise square to the point before it. */
  function runPoint(raw: PlanPoint, from: PlanPoint | null): PlanPoint {
    const caught = snapToRuns(raw, sheet.runs, reach);
    if (caught) return caught;
    return from ? orthoSnap(from, raw).pt : raw;
  }

  function addRun(points: PlanPoint[]) {
    const last = sheet.runs[sheet.runs.length - 1];
    const run: DesignRun = {
      id: `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      label: nextRunLabel(sheet.runs),
      points,
      heightFt: 0,
      // The next wall is usually built like the last one.
      bayFt: last?.bayFt ?? 10,
      widthFt: last?.widthFt ?? 3,
      flipped: false,
    };
    updateSheet((s) => ({ ...s, runs: [...s.runs, run] }));
    setSelectedRun(run.id);
  }
  function finishChain() {
    if (chain.length >= 2) addRun(chain);
    setChain([]); setHover(null);
  }

  function nearestLeg(pt: PlanPoint): { wall: LaidWall; index: number } | null {
    let best: { wall: LaidWall; index: number } | null = null, bestD = reach * 1.6;
    for (const r of laid) for (const wall of r.walls) wall.legs.forEach((leg, index) => {
      const edit = sheet.legEdits[legKey(wall.key, index)];
      if (edit?.removed) return;
      const mx = (leg.wallPoint.x + leg.tickTip.x) / 2 + (edit?.dx ?? 0), my = (leg.wallPoint.y + leg.tickTip.y) / 2 + (edit?.dy ?? 0);
      const d = Math.hypot(mx - pt.x, my - pt.y);
      if (d < bestD) { best = { wall, index }; bestD = d; }
    });
    return best;
  }

  function onDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const pt = sheetPoint(e);
    if (!pt) return;

    if (tool === "scale") {
      setScalePts((prev) => (prev.length >= 2 ? [pt] : [...prev, prev.length === 1 ? orthoSnap(prev[0], pt).pt : pt]));
      return;
    }
    if (tool === "measure") {
      if (!(puf > 0)) return;
      if (!measureFrom) { setMeasureFrom(pt); return; }
      const b = orthoSnap(measureFrom, pt).pt;
      setMeasures((prev) => [...prev, { a: measureFrom, b, ft: Math.hypot(b.x - measureFrom.x, b.y - measureFrom.y) / puf }]);
      setMeasureFrom(null);
      return;
    }
    if (tool === "run") {
      if (!(puf > 0)) return;
      const start = runPoint(pt, null);
      setDragFrom(start); setDragTo(start);
      return;
    }
    if (tool === "points") {
      if (!(puf > 0)) return;
      // Back onto the first point closes the loop.
      if (chain.length >= 3 && Math.hypot(chain[0].x - pt.x, chain[0].y - pt.y) <= reach) {
        addRun([...chain, chain[0]]); setChain([]); setHover(null);
        return;
      }
      setChain((prev) => [...prev, runPoint(pt, prev[prev.length - 1] ?? null)]);
      return;
    }
    if (tool === "block") {
      if (armedBlock) placeBlock(armedBlock, pt);
      return;
    }
    if (tool === "text") {
      // Opened on release, not on press: the press itself would take the focus straight back off the box.
      if (noteAt) commitNote();
      notePending.current = pt;
      return;
    }
    if (isMarkTool(tool)) {
      setDragFrom(pt); setDragTo(pt);
      return;
    }
    if (tool === "edit") {
      const hit = nearestLeg(pt);
      if (!hit) { setSelectedLeg(null); return; }
      const key = legKey(hit.wall.key, hit.index);
      setSelectedLeg({ wall: hit.wall.key, index: hit.index });
      setSelectedRun(hit.wall.runId);
      const edit = sheet.legEdits[key];
      legDrag.current = { key, start: pt, base: { dx: edit?.dx ?? 0, dy: edit?.dy ?? 0 }, along: hit.wall.along };
      return;
    }
    // Select: what was placed last is on top, so it is tried first - blocks, then marks, then runs.
    setSelectedLeg(null);
    for (let i = sheet.blocks.length - 1; i >= 0; i--) {
      const placed = sheet.blocks[i], block = blockById(placed.blockId);
      if (!block) continue;
      const size = blockSize(block);
      if (pointInBlock(pt, placed, size.w, size.h, reach * 0.5)) {
        setPicked({ kind: "block", id: placed.id }); setSelectedRun(null);
        itemDrag.current = { kind: "block", id: placed.id, start: pt, block: placed };
        return;
      }
    }
    for (let i = sheet.marks.length - 1; i >= 0; i--) {
      const mark = sheet.marks[i];
      if (distanceToMark(pt, mark) <= (mark.kind === "text" ? reach * 2.5 : reach)) {
        setPicked({ kind: "mark", id: mark.id }); setSelectedRun(null);
        itemDrag.current = { kind: "mark", id: mark.id, start: pt, mark };
        return;
      }
    }
    let best: string | null = null, bestD = reach;
    for (const run of sheet.runs) { const d = distanceToRun(pt, run); if (d < bestD) { best = run.id; bestD = d; } }
    setSelectedRun(best); setPicked(null);
  }

  function onMove(e: ReactMouseEvent<HTMLDivElement>) {
    const pt = sheetPoint(e);
    if (!pt) return;
    if (tool === "run" && dragFrom) { setDragTo(runPoint(pt, dragFrom)); return; }
    if (isMarkTool(tool) && dragFrom) {
      // A line and a dimension hold square, like everything else drawn by hand. A box takes the corner as given.
      setDragTo(tool === "line" || tool === "dim" ? orthoSnap(dragFrom, pt).pt : pt);
      return;
    }
    if (tool === "block") { setHover(pt); return; }
    if (tool === "select" && itemDrag.current && e.buttons === 1) {
      const d = itemDrag.current, dx = pt.x - d.start.x, dy = pt.y - d.start.y;
      if (Math.hypot(dx, dy) < 2 / zoom) return;
      if (d.kind === "block" && d.block) updateBlock(d.id, { x: d.block.x + dx, y: d.block.y + dy });
      else if (d.mark) updateMark(d.id, { a: { x: d.mark.a.x + dx, y: d.mark.a.y + dy }, b: { x: d.mark.b.x + dx, y: d.mark.b.y + dy } });
      return;
    }
    if (tool === "points") { setHover(runPoint(pt, chain[chain.length - 1] ?? null)); return; }
    if (tool === "measure" && measureFrom) { setHover(orthoSnap(measureFrom, pt).pt); return; }
    if (tool === "scale" && scalePts.length === 1) { setHover(orthoSnap(scalePts[0], pt).pt); return; }
    if (tool === "edit" && legDrag.current && e.buttons === 1) {
      const d = legDrag.current;
      // A leg slides along its run and nowhere else.
      const along = (pt.x - d.start.x) * d.along.x + (pt.y - d.start.y) * d.along.y;
      if (Math.abs(along) < 3 / zoom && !sheet.legEdits[d.key]?.dx) return;
      updateLeg(d.key, { dx: d.base.dx + d.along.x * along, dy: d.base.dy + d.along.y * along });
    }
  }

  function onUp() {
    legDrag.current = null;
    itemDrag.current = null;
    if (notePending.current) { setNoteAt({ pt: notePending.current, text: "" }); notePending.current = null; return; }
    if (isMarkTool(tool) && tool !== "text" && dragFrom && dragTo) {
      if (Math.hypot(dragTo.x - dragFrom.x, dragTo.y - dragFrom.y) >= 6 / zoom) addMark(tool, dragFrom, dragTo);
      setDragFrom(null); setDragTo(null);
      return;
    }
    if (tool === "run" && dragFrom && dragTo) {
      if (Math.hypot(dragTo.x - dragFrom.x, dragTo.y - dragFrom.y) / puf >= 1) addRun([dragFrom, dragTo]);
      setDragFrom(null); setDragTo(null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        if (chain.length || dragFrom || measureFrom || scalePts.length) { setChain([]); setDragFrom(null); setDragTo(null); setMeasureFrom(null); setScalePts([]); setHover(null); }
        else { setTool("select"); setSelectedLeg(null); setArmedBlock(null); setPicked(null); }
      } else if (e.key === "Enter" && tool === "points") finishChain();
      else if ((e.key === "Delete" || e.key === "Backspace") && picked && tool === "select") { e.preventDefault(); removePicked(); }
      else if ((e.key === "r" || e.key === "R") && picked?.kind === "block") {
        const placed = sheet.blocks.find((b) => b.id === picked.id);
        if (placed) updateBlock(placed.id, { rot: (placed.rot + 90) % 360 });
      }
      else if ((e.key === "Delete" || e.key === "Backspace") && selectedRun && tool === "select") { e.preventDefault(); removeRun(selectedRun); }
      else if (e.key === "ArrowRight" && totalPages > 1) void goToPage(pageNo + 1);
      else if (e.key === "ArrowLeft" && totalPages > 1) void goToPage(pageNo - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pickTool(next: Tool) {
    setTool(next); setChain([]); setDragFrom(null); setDragTo(null); setMeasureFrom(null); setHover(null);
    if (next !== "scale") setScalePts([]);
    if (next !== "edit") setSelectedLeg(null);
    if (next !== "block") setArmedBlock(null);
    if (next !== "select") setPicked(null);
    if (noteAt) commitNote();
  }
  function armBlock(blockId: string) {
    pickTool("block"); setArmedBlock(blockId);
  }

  /**
   * Printing takes what is on the sheet as it stands: only what was drawn,
   * laid on a Korban sheet with the title block. The browser's own dialog
   * prints it, or saves it as a PDF - the two buttons open the same dialog.
   */
  function printSheet() {
    if (noteAt) commitNote();
    window.setTimeout(() => window.print(), 50);
  }

  // ---- What the status line says ---------------------------------------
  const status = !viewerUrl || !(puf > 0) && tool !== "scale" ? ""
    : tool === "scale" ? (scalePts.length < 2 ? `Scale \u2014 pick point ${scalePts.length + 1} of a distance you know.` : "Scale \u2014 type the distance, then Lock.")
    : tool === "run" ? "Run \u2014 press at one end of a wall, drag, release."
    : tool === "points" ? (chain.length === 0 ? "Points \u2014 click the first corner." : "Points \u2014 click each corner. Enter or double-click to finish.")
    : tool === "edit" ? "Edit Bay \u2014 pick a leg. Drag to slide it along its run."
    : tool === "measure" ? (measureFrom ? "Measure \u2014 second point." : "Measure \u2014 first point.")
    : tool === "block" ? `${blockById(armedBlock ?? "")?.name ?? "Block"} \u2014 click the sheet to place it. Esc when done.`
    : tool === "text" ? "Note \u2014 click where it goes, type, Enter."
    : tool === "line" ? "Line \u2014 press, drag, release."
    : tool === "box" ? "Box \u2014 drag corner to corner."
    : tool === "cloud" ? "Cloud \u2014 drag corner to corner."
    : tool === "dim" ? "Dimension \u2014 press at one end, drag to the other."
    : "";
  const armed = tool !== "select";

  if (!ready || !draft) {
    return <main className="flex h-screen items-center justify-center bg-[#080604]"><p className="text-xs text-zinc-600">Loading Design Space&hellip;</p></main>;
  }

  const k = 1 / Math.max(zoom, 0.05); // sheet pixels per screen pixel: keeps ink a constant weight on screen

  // What prints: the box round everything drawn on this sheet, with room for the counts and labels.
  const printBox = (() => {
    const xs: number[] = [], ys: number[] = [];
    const take = (p: PlanPoint, pad = 0) => { xs.push(p.x - pad, p.x + pad); ys.push(p.y - pad, p.y + pad); };
    for (const run of sheet.runs) run.points.forEach((pt) => take(pt, (run.widthFt + 8) * puf));
    for (const placed of sheet.blocks) {
      const block = blockById(placed.blockId);
      if (block) { const size = blockSize(block); take({ x: placed.x, y: placed.y }, Math.hypot(size.w, size.h) / 2); }
    }
    for (const mark of sheet.marks) { take(mark.a, puf * 2); take(mark.b, mark.kind === "text" ? puf * (2 + mark.text.length) : puf * 2); }
    if (xs.length === 0) return null;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04 + 10;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  })();
  // The toolbar and panel styles the Takeoff Workspace uses, so the two pages read as one program.
  const barButton = "rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 transition hover:border-white/30 hover:text-white";
  const stepButton = "rounded border border-zinc-800 w-6 h-6 text-zinc-400 hover:text-white disabled:opacity-30 text-xs";
  const smallButton = "rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] font-bold text-zinc-500 transition hover:border-orange-500/40 hover:text-orange-300";
  const fieldClass = "rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-orange-300 outline-none focus:border-orange-500/50";

  return (
    <main className="korban-root flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Design Space"
        subtitle={draft.name || "Untitled draft"}
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        actionsAlwaysVisible
        actions={
          <>
            {/* Where the draft stands, the way the takeoff says where a job stands. */}
            <span className="hidden items-center gap-1.5 pr-1 font-mono text-[10px] text-zinc-500 sm:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${saveFailed ? "bg-red-400" : savedAt ? "bg-emerald-400" : "bg-zinc-600"}`} />
              {saveFailed ? "Could not save" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved on this machine"}
            </span>
            <input
              value={draft.name}
              onChange={(e) => commit({ ...draft, name: e.target.value })}
              placeholder="Name this draft"
              aria-label="Draft name"
              className="w-[190px] rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-orange-500/50"
            />
            <select
              value={sheetSize} onChange={(e) => setSheetSize(e.target.value as SheetSize)} aria-label="Sheet size"
              title="The paper the sheet prints on"
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-2.5 text-xs text-zinc-300 outline-none focus:border-orange-500/50"
            >
              {(Object.keys(SHEET_SIZES) as SheetSize[]).map((key) => <option key={key} value={key}>{SHEET_SIZES[key].label}</option>)}
            </select>
            <KorbanButton variant="ghost" onClick={printSheet} title="Print what is drawn on this sheet, in the Korban title block">Print</KorbanButton>
            <KorbanButton variant="ghost" onClick={printSheet} title="Opens the same dialog - choose Save as PDF as the printer">PDF</KorbanButton>
            <div className="relative">
              <KorbanButton variant="ghost" onClick={() => setDraftsOpen((o) => !o)}>Drafts ({drafts.length})</KorbanButton>
              {draftsOpen && (
                <div className="absolute right-0 top-full z-[999] mt-2 w-[300px] rounded-2xl border border-orange-500/20 bg-korban-header p-2 shadow-2xl">
                  <button
                    onClick={() => { const fresh = newDraft(); saveDraft(fresh); setDrafts(listDrafts()); void openDraft(fresh); }}
                    className="mb-1 w-full rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
                  >
                    + New draft
                  </button>
                  <div className="max-h-[320px] overflow-y-auto">
                    {drafts.map((d) => (
                      <div key={d.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${d.id === draft.id ? "bg-orange-500/10" : "hover:bg-orange-500/10"}`}>
                        <button onClick={() => { if (d.id !== draft.id) void openDraft(d); else setDraftsOpen(false); }} className="min-w-0 flex-1 text-left">
                          <p className={`truncate text-xs font-semibold ${d.id === draft.id ? "text-orange-300" : "text-zinc-300"}`}>{d.name || "Untitled draft"}</p>
                          <p className="truncate font-mono text-[9px] text-zinc-600">{draftSummary(d)}{d.fileName ? ` · ${d.fileName}` : ""}</p>
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete ${d.name || "this draft"}? Its drawing and its plan set go with it.`)) return;
                            deleteDraft(d.id); void clearPlanSheet(planKey(d.id));
                            const rest = listDrafts(); setDrafts(rest);
                            if (d.id === draft.id) { const next = rest[0] ?? newDraft(); if (!rest[0]) { saveDraft(next); setDrafts(listDrafts()); } void openDraft(next); }
                          }}
                          className="text-xs text-zinc-600 hover:text-red-400" aria-label={`Delete ${d.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ---- Left panel: the drafting tools --------------------------- */}
        <aside className="flex w-[140px] flex-shrink-0 flex-col border-r border-zinc-900 bg-[#080604]">
          <div className="border-b border-zinc-900 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Tools</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-1.5 px-2 py-2">
              {[...TOOLS, ...MARK_TOOLS].map((t, i) => (
                <div key={t.id}>
                  {i === TOOLS.length && <p className="px-1 pb-1.5 pt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Markup</p>}
                  <button
                    onClick={() => pickTool(t.id)} aria-label={t.name} {...tipFor(t.tip)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[10px] font-bold transition ${
                      tool === t.id ? "border-orange-500 bg-orange-500/20 text-orange-300" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}
                  >
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">{t.icon}</svg>
                    {t.name}
                  </button>
                </div>
              ))}
            </div>

            {/* The company's own drafting blocks. Click one and click the sheet, or drag it on. */}
            <div className="border-t border-zinc-900 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Blocks</p>
            </div>
            <div className="space-y-1 px-2 pb-3">
              {BLOCK_GROUPS.map((group) => {
                const blocks = DESIGN_BLOCKS.filter((block) => block.group === group);
                const open = openGroups.has(group);
                return (
                  <div key={group} className="rounded-lg border border-zinc-800 bg-black">
                    <button
                      onClick={() => setOpenGroups((prev) => { const next = new Set(prev); if (next.has(group)) next.delete(group); else next.add(group); return next; })}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[9px] font-bold text-zinc-300 hover:text-white"
                    >
                      <span>{group}</span>
                      <span className="font-mono text-[8px] text-zinc-600">{blocks.length} {open ? "\u2212" : "+"}</span>
                    </button>
                    {open && (
                      <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
                        {blocks.map((block) => (
                          <button
                            key={block.id} aria-label={block.name} {...tipFor(block.name)}
                            onClick={() => (armedBlock === block.id ? pickTool("select") : armBlock(block.id))}
                            draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-korban-block", block.id); e.dataTransfer.effectAllowed = "copy"; setTip(null); }}
                            className={`flex h-9 items-center justify-center rounded border text-orange-400 transition ${
                              armedBlock === block.id ? "border-orange-500 bg-orange-500/20" : "border-zinc-800 bg-zinc-950 hover:border-orange-500/40"}`}
                          >
                            <svg viewBox={`0 0 ${block.w} ${block.h}`} className="h-6 w-6" style={{ overflow: "visible" }}>
                              <g fill="none" stroke="currentColor" strokeWidth={Math.max(block.sw, Math.max(block.w, block.h) / 26)} strokeLinecap="round" strokeLinejoin="round"
                                dangerouslySetInnerHTML={{ __html: block.svg }} />
                            </svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ---- Center: the sheet ---------------------------------------- */}
        <section className="relative flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-900 bg-[#0b0b0b] px-3 py-2">
            <button onClick={() => fileRef.current?.click()} className={barButton}>{busy === "Opening…" ? "Loading..." : "Upload Plans"}</button>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => void goToPage(pageNo - 1)} disabled={pageNo <= 1 || Boolean(busy)} className={stepButton}>&lsaquo;</button>
                <span className="w-10 rounded border border-zinc-800 bg-zinc-900 py-0.5 text-center font-mono text-[10px] text-zinc-300">{pageNo}</span>
                <span className="font-mono text-[10px] text-zinc-600">/ {totalPages}</span>
                <button onClick={() => void goToPage(pageNo + 1)} disabled={pageNo >= totalPages || Boolean(busy)} className={stepButton}>&rsaquo;</button>
              </div>
            )}

            {viewerUrl && (
              <>
                <div className="flex items-center gap-1">
                  <button onClick={() => setZoom((z) => Math.max(0.08, z / 1.2))} className={`${stepButton} font-bold`}>&minus;</button>
                  <span className="w-8 text-center font-mono text-[9px] text-zinc-600">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(6, z * 1.2))} className={`${stepButton} font-bold`}>+</button>
                  <button onClick={fit} className="h-6 rounded border border-zinc-800 px-1.5 text-[9px] text-zinc-500 hover:text-white">Fit</button>
                  {isPdf && (
                    <button onClick={() => void rotate()} title="Rotate the page a quarter turn. Clears what is drawn on it."
                      className="flex h-6 items-center gap-1 rounded border border-zinc-800 px-1.5 text-[9px] text-zinc-500 hover:border-zinc-600 hover:text-white">
                      {sheet.rotation ? `${sheet.rotation}°` : "Rotate"}
                    </button>
                  )}
                </div>
                <div className="h-4 w-px bg-zinc-800" />

                {puf > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/5 px-2.5 py-1.5" style={{ boxShadow: "0 0 10px rgba(249,115,22,0.2)" }}>
                      <span className="text-[10px] text-orange-500">[lock]</span>
                      <span className="font-mono text-[10px] font-bold text-orange-300">{sheet.scaleLabel || "Scale set"}</span>
                    </div>
                    <button onClick={unlockScale} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">Unlock</button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => pickTool(tool === "scale" ? "select" : "scale")}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${tool === "scale" ? "border-orange-500 bg-orange-500/20 text-orange-300" : "border-zinc-700 text-zinc-400 hover:border-orange-500/40"}`}
                    >
                      &#10231; Scale {tool === "scale" && scalePts.length < 2 ? `- pt ${scalePts.length + 1}` : ""}
                    </button>
                    {isPdf && (
                      <select
                        value="" onChange={(e) => { const preset = PRESET_SCALES.find((item) => item.label === e.target.value); if (preset) presetScale(preset.inPerFt, preset.label); }}
                        title="Use the scale printed on the sheet. Only right if the PDF is full size."
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[10px] font-bold text-zinc-400 outline-none hover:border-orange-500/40"
                      >
                        <option value="">Printed scale...</option>
                        {PRESET_SCALES.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
                      </select>
                    )}
                    {tool === "scale" && scalePts.length === 2 && (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus value={scaleInput} onChange={(e) => setScaleInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") lockScale(); }}
                          placeholder="e.g. 20'" className="w-16 rounded-lg border border-orange-500/50 bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-orange-300 outline-none focus:border-orange-500"
                        />
                        <button onClick={lockScale} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-zinc-800">Lock</button>
                      </div>
                    )}
                  </>
                )}
                {measures.length > 0 && (
                  <button onClick={() => setMeasures([])} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-500 hover:text-white">Clear {measures.length}</button>
                )}
              </>
            )}
          </div>

          {/* The scale warning, in the dark above the sheet - the takeoff's own. */}
          {viewerUrl && !(puf > 0) && tool !== "scale" && (
            <div className="flex items-center gap-3 border-b border-yellow-500/20 bg-yellow-500/[0.06] px-3 py-2">
              <span className="text-[13px] leading-none text-yellow-500/80">&#9888;</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-yellow-300/90">Set scale before drawing</p>
                <p className="text-[10px] text-yellow-600/80">Click Scale, pick two points a known distance apart, then enter that distance. Or choose the printed scale.</p>
              </div>
              <button onClick={() => pickTool("scale")} className="shrink-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[10px] font-bold text-yellow-300 transition hover:bg-yellow-500/20">Set Scale</button>
            </div>
          )}
          {/* An armed tool says what it is waiting for. */}
          {status && (
            <div className="flex items-center gap-2 border-b border-orange-500/30 bg-orange-500/[0.07] px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              <p className="text-[11px] text-orange-200">{status}</p>
              <button onClick={() => pickTool("select")} className="ml-auto text-[10px] text-zinc-500 hover:text-white">cancel</button>
            </div>
          )}

          <div
            ref={viewerRef}
            className="relative flex-1 overflow-auto bg-zinc-950 p-6"
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onDoubleClick={() => { if (tool === "points") { setChain((points) => points.slice(0, -1)); window.setTimeout(finishChain, 0); } }}
            onDragStart={(e) => e.preventDefault()}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-korban-block")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
            onDrop={(e) => {
              const blockId = e.dataTransfer.getData("application/x-korban-block");
              if (!blockId) return;
              e.preventDefault();
              const pt = sheetPoint(e);
              if (pt) { placeBlock(blockId, pt); pickTool("select"); setPicked(null); }
            }}
            style={{ cursor: armed && viewerUrl ? KORBAN_CROSSHAIR : "default", userSelect: "none" }}
          >
            {!viewerUrl && !busy && (
              <div
                onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files[0] ?? null); }}
                className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3"
              >
                <span className="text-5xl opacity-15">&#128208;</span>
                <p className="text-sm font-bold text-zinc-500">{needPlan ? `Re-attach ${draft.fileName}` : "Upload Plans to begin"}</p>
                <p className="max-w-[380px] text-center text-xs leading-relaxed text-zinc-700">
                  {needPlan
                    ? "The drawing is saved with this draft; the plan set behind it stays on the machine it was opened on. Drop the same file and everything lines up."
                    : <>PDF, JPG or PNG &middot; Click or drag</>}
                </p>
              </div>
            )}
            {busy && !viewerUrl && <div className="flex h-full items-center justify-center"><p className="text-xs text-zinc-600">Opening...</p></div>}

            {viewerUrl && (
              <div className="relative mx-auto" style={{ width: (natural.w || 1700) * zoom }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef} src={viewerUrl} alt="" draggable={false}
                  onLoad={() => { const img = imgRef.current; if (img?.naturalWidth) setNatural({ w: img.naturalWidth, h: img.naturalHeight }); }}
                  className="block w-full select-none rounded-lg border border-zinc-800 shadow-2xl" style={{ height: "auto", opacity: busy ? 0.5 : 1, transition: "opacity 0.15s" }}
                />
                <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible" viewBox={natural.w ? `0 0 ${natural.w} ${natural.h}` : undefined}>
                  {/* Everything Korban draws is orange on screen; the same drawing prints black. */}
                  <g color={INK}>
                    <SheetInk laid={laid} sheet={sheet} puf={puf} k={k} selectedRun={selectedRun} editing={tool === "edit"} selectedLeg={selectedLeg} picked={picked} />

                    {/* A mark being drawn. */}
                    {isMarkTool(tool) && dragFrom && dragTo && (
                      <MarkInk mark={{ id: "live", kind: tool, a: dragFrom, b: dragTo, text: "" }} puf={puf} k={k} />
                    )}
                    {/* The block in hand, under the cursor. */}
                    {tool === "block" && armedBlock && hover && puf > 0 && (
                      <g opacity="0.55"><BlockInk placed={{ id: "live", blockId: armedBlock, x: hover.x, y: hover.y, rot: 0 }} puf={puf} k={k} /></g>
                    )}
                  </g>

                  {/* A run being drawn. */}
                  {tool === "run" && dragFrom && dragTo && (
                    <line x1={dragFrom.x} y1={dragFrom.y} x2={dragTo.x} y2={dragTo.y} stroke={INK} strokeWidth={10 * k} strokeLinecap="round" opacity="0.35" />
                  )}
                  {chain.length > 0 && (
                    <g stroke={INK} fill="none">
                      <polyline points={[...chain, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")} strokeWidth={1.6 * k} strokeDasharray={`${5 * k},${4 * k}`} />
                      {chain.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3 * k} fill={INK} stroke="none" />)}
                    </g>
                  )}

                  {/* Scale pick: the takeoff's crosshairs. */}
                  {scalePts.map((p, i) => (
                    <g key={i}>
                      <line x1={p.x - 12 * k} y1={p.y} x2={p.x + 12 * k} y2={p.y} stroke={INK} strokeWidth={1.5 * k} />
                      <line x1={p.x} y1={p.y - 12 * k} x2={p.x} y2={p.y + 12 * k} stroke={INK} strokeWidth={1.5 * k} />
                      <circle cx={p.x} cy={p.y} r={4 * k} fill={INK} />
                      <text x={p.x + 12 * k} y={p.y - 10 * k} fontSize={9 * k} fill={INK} fontFamily="monospace" fontWeight="bold">{i + 1}</text>
                    </g>
                  ))}
                  {scalePts.length >= 1 && (scalePts[1] ?? hover) && (
                    <line x1={scalePts[0].x} y1={scalePts[0].y} x2={(scalePts[1] ?? hover)!.x} y2={(scalePts[1] ?? hover)!.y} stroke={INK} strokeWidth={1 * k} strokeDasharray={`${4 * k},${3 * k}`} opacity="0.5" />
                  )}

                  {/* Measurements: read off the sheet, never part of the drawing. */}
                  {[...measures, ...(measureFrom && hover && puf > 0 ? [{ a: measureFrom, b: hover, ft: Math.hypot(hover.x - measureFrom.x, hover.y - measureFrom.y) / puf }] : [])].map((m, i) => (
                    <g key={`m${i}`}>
                      <line x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke="#22d3ee" strokeWidth={1.4 * k} />
                      <circle cx={m.a.x} cy={m.a.y} r={2.5 * k} fill="#22d3ee" />
                      <circle cx={m.b.x} cy={m.b.y} r={2.5 * k} fill="#22d3ee" />
                      <text x={(m.a.x + m.b.x) / 2} y={(m.a.y + m.b.y) / 2 - 6 * k} textAnchor="middle" fontSize={11 * k} fill="#22d3ee" fontFamily="monospace" fontWeight="bold" stroke="#000" strokeWidth={3 * k} paintOrder="stroke">
                        {feetInches(m.ft) || "0'"}
                      </text>
                    </g>
                  ))}
                </svg>
                {busy && <div className="absolute inset-0 flex items-center justify-center"><p className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-zinc-500">Loading...</p></div>}

                {/* A picked block or mark: turn it, or take it off. Same pill as Edit Bay. */}
                {tool === "select" && picked && (() => {
                  const placed = picked.kind === "block" ? sheet.blocks.find((b) => b.id === picked.id) : undefined;
                  const mark = picked.kind === "mark" ? sheet.marks.find((m) => m.id === picked.id) : undefined;
                  const block = placed ? blockById(placed.blockId) : undefined;
                  if (!placed && !mark) return null;
                  const size = block ? blockSize(block) : { w: 0, h: 0 };
                  const at = placed
                    ? { x: placed.x * zoom, y: (placed.y + Math.max(size.w, size.h) / 2) * zoom }
                    : { x: ((mark!.a.x + mark!.b.x) / 2) * zoom, y: Math.max(mark!.a.y, mark!.b.y) * zoom };
                  return (
                    <div
                      className="absolute z-40 flex items-center justify-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1"
                      style={{ left: at.x - 34, top: at.y + 12 }} onMouseDown={(e) => e.stopPropagation()}
                    >
                      {placed && (
                        <>
                          <button onClick={() => updateBlock(placed.id, { rot: (placed.rot + 90) % 360 })} className="flex items-center justify-center text-zinc-400 hover:text-white" aria-label="Rotate a quarter turn" {...tipFor("Rotate (R)")}>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 4.5A4 4 0 1 0 10 7" /><path d="M9.8 1.6v3h-3" /></svg>
                          </button>
                          <span className="h-3 w-px bg-zinc-700" />
                        </>
                      )}
                      <button onClick={() => { removePicked(); setTip(null); }} className="flex items-center justify-center text-orange-500 hover:text-orange-400" aria-label="Remove" {...tipFor("Remove (Del)")}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })()}

                {/* A note being typed, where it will sit. */}
                {noteAt && (
                  <input
                    autoFocus value={noteAt.text} onChange={(e) => setNoteAt({ ...noteAt, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") commitNote(); if (e.key === "Escape") setNoteAt(null); }}
                    onBlur={commitNote} onMouseDown={(e) => e.stopPropagation()} placeholder="Note"
                    className="absolute z-40 w-[220px] rounded-lg border border-orange-500/50 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-orange-300 outline-none"
                    style={{ left: noteAt.pt.x * zoom, top: noteAt.pt.y * zoom - 14 }}
                  />
                )}

                {/* Edit Bay: Set Scaffold's pill, under the picked leg. */}
                {tool === "edit" && selectedLeg && (() => {
                  const owner = laid.find((r) => r.walls.some((w) => w.key === selectedLeg.wall));
                  const wall = owner?.walls.find((w) => w.key === selectedLeg.wall);
                  const leg = wall?.legs[selectedLeg.index];
                  if (!owner || !wall || !leg) return null;
                  const key = legKey(wall.key, selectedLeg.index);
                  const edit = sheet.legEdits[key];
                  const frames = edit?.frames ?? owner.framesPerLeg;
                  const at = { x: (leg.tickTip.x + (edit?.dx ?? 0)) * zoom, y: (leg.tickTip.y + (edit?.dy ?? 0)) * zoom };
                  return (
                    <div
                      className="absolute z-40 flex min-w-[76px] items-center justify-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1"
                      style={{ left: at.x - 40, top: at.y + 30 }} onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => updateLeg(key, { frames: Math.max(1, frames - 1) })} className="flex items-center justify-center text-zinc-400 hover:text-white" aria-label="One frame fewer">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <span className="min-w-[14px] text-center font-mono text-[11px] font-bold text-zinc-100">{frames || "–"}</span>
                      <button onClick={() => updateLeg(key, { frames: Math.max(1, frames + 1) })} className="flex items-center justify-center text-zinc-400 hover:text-white" aria-label="One frame more">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                      <span className="mx-0.5 h-3 w-px bg-zinc-700" />
                      <button onClick={() => { updateLeg(key, { removed: true }); setSelectedLeg(null); }} className="flex items-center justify-center text-orange-500 hover:text-orange-400" aria-label="Remove this leg">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </section>

        {/* ---- Right panel: the count, then the runs ---------------------- */}
        <aside className="flex w-[250px] flex-shrink-0 flex-col overflow-y-auto border-l border-zinc-900 bg-[#080604]">
          <div className="border-b border-zinc-900 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Count</p>
            {/* Frames and planks are what a run buys, so they are the two lit. */}
            <div className="mb-1 grid grid-cols-2 gap-1">
              {[["Frames", count.frames], ["Planks", count.planks]].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-orange-500/60 bg-orange-500/10 p-2 text-center" style={{ boxShadow: "0 0 10px rgba(249,115,22,0.2)" }}>
                  <p className="text-[7px] uppercase text-orange-300/80">{label}</p>
                  <p className="font-mono text-[18px] font-bold leading-tight text-orange-400">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[["LF", Math.round(count.linealFeet)], ["Bays", count.bays], ["Legs", count.legs]].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-zinc-800 bg-black p-1.5 text-center">
                  <p className="text-[7px] uppercase text-zinc-600">{label}</p>
                  <p className="font-mono text-[11px] font-bold text-zinc-200">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-700">This sheet</p>

            {/* Every block placed, counted by what it is. */}
            {sheet.blocks.length > 0 && (
              <div className="mt-2 rounded-lg border border-zinc-800 bg-black p-2">
                <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-500">Blocks placed</p>
                {DESIGN_BLOCKS.filter((block) => sheet.blocks.some((b) => b.blockId === block.id)).map((block) => (
                  <div key={block.id} className="flex justify-between border-b border-zinc-900 py-1 text-[9px] last:border-0">
                    <span className="min-w-0 truncate pr-2 text-zinc-400">{block.name}</span>
                    <span className="font-mono font-bold text-orange-300">{sheet.blocks.filter((b) => b.blockId === block.id).length}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Runs</p>
            {laid.length === 0 && (
              <p className="text-[10px] leading-relaxed text-zinc-500">
                {!viewerUrl ? "Upload plans, then set the scale." : puf > 0 ? "Nothing drawn on this sheet. Pick Run and drag along a wall." : "Set the scale, then draw."}
              </p>
            )}
            {laid.map((r) => {
              const run = r.run, open = selectedRun === run.id;
              const edited = Object.keys(sheet.legEdits).some((key) => key.startsWith(`${run.id}~`));
              return (
                <div
                  key={run.id} onClick={() => setSelectedRun(run.id)}
                  className={`cursor-pointer space-y-2 rounded-xl border p-3 transition ${open ? "border-orange-500/40 bg-orange-500/5" : "border-zinc-800 bg-black hover:border-zinc-700"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${open ? "text-orange-300" : "text-zinc-200"}`}>Run {run.label}</span>
                    <span className="font-mono text-[10px] text-zinc-400">{r.lengthFt.toFixed(1)} LF</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <label className="flex-shrink-0 text-[9px] text-zinc-600">Wall Height</label>
                    <input
                      value={heightDrafts[run.id] ?? feetInches(run.heightFt)}
                      onChange={(e) => {
                        const typed = e.target.value;
                        setHeightDrafts((prev) => ({ ...prev, [run.id]: typed }));
                        const ft = parseFeetInches(typed);
                        updateRun(run.id, { heightFt: Number.isFinite(ft) && ft > 0 ? ft : 0 });
                      }}
                      onBlur={() => setHeightDrafts((prev) => { const next = { ...prev }; delete next[run.id]; return next; })}
                      placeholder="47'-6&quot;"
                      className={`min-w-0 flex-1 rounded-lg border px-2 py-1 text-right font-mono text-[10px] outline-none placeholder:text-zinc-700 ${
                        run.heightFt > 0 ? "border-zinc-800 bg-zinc-900 text-orange-300 focus:border-orange-500/50" : "border-amber-500/40 bg-zinc-950 text-amber-200 focus:border-amber-400"}`}
                    />
                  </div>
                  {/* Which side of the line the scaffold stands on. */}
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <label className="flex-shrink-0 text-[9px] text-zinc-600">Side</label>
                    <div className="flex flex-1 gap-1">
                      {([["Outer", false], ["Inner", true]] as const).map(([label, value]) => (
                        <button
                          key={label} onClick={() => updateRun(run.id, { flipped: value })}
                          className={`flex-1 rounded-lg border px-2 py-1 text-[9px] font-bold transition ${
                            run.flipped === value ? "border-orange-500 bg-orange-500 text-black" : "border-zinc-800 text-zinc-400 hover:border-orange-500/40"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {open && (
                    <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <label className="mb-1 block text-[9px] text-zinc-600">Bay Length</label>
                        <select value={run.bayFt} onChange={(e) => updateRun(run.id, { bayFt: Number(e.target.value) })} className={`w-full ${fieldClass}`}>
                          {BAY_LENGTHS.map((ft) => <option key={ft} value={ft}>{ft}&apos;</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[9px] text-zinc-600">Frame Width</label>
                        <select value={run.widthFt} onChange={(e) => updateRun(run.id, { widthFt: Number(e.target.value) })} className={`w-full ${fieldClass}`}>
                          {FRAME_WIDTHS.map((w) => <option key={w.ft} value={w.ft}>{w.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    {(open
                      ? [["Bays", r.bays], ["Legs", r.legs], ["Frames/leg", r.framesPerLeg || "–"]]
                      : []
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-zinc-800 bg-black p-1.5 text-center">
                        <p className="text-[7px] uppercase text-zinc-600">{label}</p>
                        <p className="font-mono text-[11px] font-bold text-zinc-200">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[["Frames", r.frames], ["Planks", r.planks]].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-1.5 text-center">
                        <p className="text-[7px] uppercase text-orange-300/70">{label}</p>
                        <p className="font-mono text-[11px] font-bold text-orange-300">{Number(value).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  {run.heightFt <= 0 && <p className="text-[9px] leading-relaxed text-amber-300/80">No height yet, so no frames.</p>}
                  {open && (
                    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => pickTool("edit")} className={smallButton}>Edit Bay</button>
                      {edited && (
                        <button
                          onClick={() => updateSheet((s) => ({ ...s, legEdits: Object.fromEntries(Object.entries(s.legEdits).filter(([key]) => !key.startsWith(`${run.id}~`))) }))}
                          className={smallButton} title="Put every leg on this run back as Korban set it"
                        >
                          Reset Legs
                        </button>
                      )}
                      <button onClick={() => removeRun(run.id)} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-600 transition hover:border-red-500/40 hover:text-red-400">Remove</button>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-[9px] leading-relaxed text-zinc-700">
              A draft is not a job. Nothing drawn here reaches the Bid Room.
            </p>
          </div>
        </aside>
      </div>

      {tip && (
        <span className="pointer-events-none fixed z-[1000] -translate-y-1/2 whitespace-nowrap bg-zinc-800 px-1.5 py-[2px] text-[9px] leading-none text-zinc-300" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </span>
      )}

      {/*
        * The printed sheet. Hidden on screen; on paper it is the only thing
        * there is. It carries what was drawn and nothing under it - no plan,
        * no count - in black, beside the Korban title block. The styles are
        * Set Scaffold's sheet styles, so the two print as one set.
        */}
      <style>{`
        @media print {
          @page { size: ${SHEET_SIZES[sheetSize].css}; margin: 0.3in; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          .korban-root { position: static !important; display: block !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
          .korban-sheet, .korban-sheet * { visibility: visible !important; }
          .korban-sheet {
            display: grid !important;
            grid-template-columns: minmax(0,1fr) ${SHEET_SIZES[sheetSize].colIn}in;
            gap: 0.14in;
            position: absolute !important; left: 0; top: 0; width: 100%; height: 100vh;
            margin: 0; padding: 0.12in; background: #fff; color: #111;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }
          .korban-sheet::before, .korban-sheet::after { content: ""; position: absolute; width: 0.2in; height: 0.2in; }
          .korban-sheet::before { left: 0.04in; top: 0.04in; border-left: 1.6px solid #c2410c; border-top: 1.6px solid #c2410c; }
          .korban-sheet::after { right: 0.04in; bottom: 0.04in; border-right: 1.6px solid #c2410c; border-bottom: 1.6px solid #c2410c; }
          .korban-sheet-draw { border: 1px solid #111; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; min-height: 0; }
          .korban-sheet-draw svg { width: 100% !important; height: 100% !important; }
          .korban-tb { border: 1px solid #111; display: flex; flex-direction: column; gap: 0.11in; padding: 0.11in 0.09in 0.08in; min-height: 0; }
          .korban-tb-rule { border-top: 1px solid #111; }
          .korban-tb-mark { display: flex; align-items: center; justify-content: center; gap: 6px; background: #f2f2f2; border-bottom: 1px solid #111; margin: -0.11in -0.09in 0; padding: 5px 8px; }
          .korban-tb-mark svg { opacity: 0.55; }
          .korban-tb-mark span { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #c2410c; opacity: 0.75; }
          .korban-tb-company { text-align: center; }
          .korban-tb-who { margin: 0; font-size: 6pt; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; }
          .korban-tb-name { margin: 3px 0 0; font-size: 9.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
          .korban-tb-job { text-align: center; }
          .korban-tb-proj { margin: 0; font-family: var(--font-title), ui-sans-serif, system-ui; font-size: 15.5pt; font-weight: 700; line-height: 1.02; text-transform: uppercase; }
          .korban-tb-addr { margin: 3px 0 0; font-size: 7pt; color: #6b6b6b; line-height: 1.4; }
          .korban-tb-meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; margin: 0; font-size: 7pt; line-height: 1.4; }
          .korban-tb-meta dt { color: #6b6b6b; text-transform: uppercase; font-size: 6pt; align-self: center; }
          .korban-tb-meta dd { margin: 0; font-weight: 600; text-align: right; }
          .korban-tb-trade { margin-top: auto; border-top: 1px solid #111; padding-top: 7px; text-align: center; }
          .korban-tb-trade span { font-size: 7.5pt; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; }
          .korban-tb-accent { color: #c2410c; }
        }
      `}</style>
      <div className="korban-sheet hidden">
        <div className="korban-sheet-draw">
          {printBox && (
            <svg viewBox={`${printBox.x} ${printBox.y} ${printBox.w} ${printBox.h}`} preserveAspectRatio="xMidYMid meet">
              <g color="#111">
                <SheetInk laid={laid} sheet={sheet} puf={puf} k={Math.max(printBox.w, printBox.h) / 1100} selectedRun={null} editing={false} selectedLeg={null} picked={null} />
              </g>
            </svg>
          )}
        </div>
        <div className="korban-tb">
          <div className="korban-tb-mark">
            <svg width="18" height="18" viewBox="0 0 44 44" aria-hidden>
              <path d="M22 5 L40 38 L4 38 Z" fill="#111" opacity="0.55" />
              <path d="M22 5 L40 38 L22 38 Z" fill="#c2410c" />
            </svg>
            <span>Korban</span>
          </div>
          <div className="korban-tb-company">
            <p className="korban-tb-who">Company</p>
            <p className="korban-tb-name">{company || "\u2014"}</p>
          </div>
          <div className="korban-tb-rule" />
          <div className="korban-tb-job">
            <p className="korban-tb-proj">{draft.name || "Untitled draft"}</p>
            {draft.fileName && <p className="korban-tb-addr">{draft.fileName}{totalPages > 1 ? `, page ${pageNo}` : ""}</p>}
          </div>
          <div className="korban-tb-rule" />
          <dl className="korban-tb-meta">
            <dt>Job no.</dt><dd>{"\u2014"}</dd>
            <dt>Drawn</dt><dd>{"\u2014"}</dd>
            <dt>Date</dt><dd>{new Date().toLocaleDateString()}</dd>
            <dt>Scale</dt><dd>{puf > 0 ? "As noted" : "Not to scale"}</dd>
          </dl>
          <div className="korban-tb-trade">
            <span><span className="korban-tb-accent">Scaffold</span> Sketch</span>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Everything drawn on a sheet - runs, blocks, marks - in whatever colour it
 * is handed. The screen hands it orange; the printed sheet hands it black.
 * One drawing, so what prints is what was on screen.
 */
function SheetInk({
  laid, sheet, puf, k, selectedRun, editing, selectedLeg, picked,
}: {
  laid: LaidRun[];
  sheet: DesignSheet;
  puf: number;
  /** Sheet pixels to one unit of line weight: keeps ink a steady weight at any zoom or paper size. */
  k: number;
  selectedRun: string | null;
  editing: boolean;
  selectedLeg: { wall: string; index: number } | null;
  picked: { kind: "block" | "mark"; id: string } | null;
}) {
  return (
    <>
      {laid.map((r) => <RunInk key={r.run.id} laid={r} sheet={sheet} puf={puf} k={k} selected={selectedRun === r.run.id} editing={editing} selectedLeg={selectedLeg} />)}
      {sheet.marks.map((mark) => <MarkInk key={mark.id} mark={mark} puf={puf} k={k} picked={picked?.kind === "mark" && picked.id === mark.id} />)}
      {puf > 0 && sheet.blocks.map((placed) => <BlockInk key={placed.id} placed={placed} puf={puf} k={k} picked={picked?.kind === "block" && picked.id === placed.id} />)}
    </>
  );
}

/** A block, at the sheet's scale: its drawing is in points, eighteen to the foot. */
function BlockInk({ placed, puf, k, picked }: { placed: PlacedBlock; puf: number; k: number; picked?: boolean }) {
  const block = blockById(placed.blockId);
  if (!block) return null;
  const scale = puf / BLOCK_UNITS_PER_FOOT;
  const w = block.w * scale, h = block.h * scale;
  return (
    <g transform={`translate(${placed.x} ${placed.y}) rotate(${placed.rot})`}>
      <g
        transform={`scale(${scale}) translate(${-block.w / 2} ${-block.h / 2})`}
        fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
        // Never thinner than a hair on screen, however far out the sheet is zoomed.
        strokeWidth={Math.max(block.sw, (0.8 * k) / scale)}
        dangerouslySetInnerHTML={{ __html: block.svg }}
      />
      {picked && (
        <rect x={-w / 2 - 4 * k} y={-h / 2 - 4 * k} width={w + 8 * k} height={h + 8 * k} fill="none" stroke="#e4e4e7" strokeWidth={0.8 * k} strokeDasharray={`${3 * k},${3 * k}`} />
      )}
    </g>
  );
}

/** A drafting mark. Notes and dimension figures are sized to the sheet, so they print as drawn. */
function MarkInk({ mark, puf, k, picked }: { mark: DesignMark; puf: number; k: number; picked?: boolean }) {
  const { a, b } = mark;
  const weight = (picked ? 2.2 : 1.4) * k;
  const textSize = puf > 0 ? Math.max(puf * 1.5, 9 * k) : 12 * k;
  const font = "ui-monospace, SFMono-Regular, Menlo, monospace";
  if (mark.kind === "text") {
    return (
      <text x={a.x} y={a.y} fill="currentColor" stroke="none" fontSize={textSize} fontFamily={font} fontWeight={picked ? 700 : 400} dominantBaseline="middle">
        {mark.text.toUpperCase()}
      </text>
    );
  }
  if (mark.kind === "line") return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={weight} strokeLinecap="round" />;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  if (mark.kind === "box") return <rect x={x} y={y} width={w} height={h} fill="none" stroke="currentColor" strokeWidth={weight} />;
  if (mark.kind === "cloud") {
    const bump = Math.max(8 * k, Math.min(Math.min(w, h) / 2.5, puf > 0 ? puf * 2.5 : 30 * k));
    return <path d={cloudPath(a, b, bump)} fill="none" stroke="currentColor" strokeWidth={weight} strokeLinejoin="round" />;
  }
  // A dimension: the line, a tick square to it at each end, and the distance written along it.
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const tick = Math.max(textSize * 0.45, 5 * k);
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  // The figure sits on the upper side of the line, wherever the line runs.
  const up = n.y > 0 || (n.y === 0 && n.x > 0) ? { x: -n.x, y: -n.y } : n;
  const mid = { x: (a.x + b.x) / 2 + up.x * textSize * 0.8, y: (a.y + b.y) / 2 + up.y * textSize * 0.8 };
  return (
    <g stroke="currentColor" strokeWidth={weight}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {[a, b].map((p, i) => <line key={i} x1={p.x - n.x * tick} y1={p.y - n.y * tick} x2={p.x + n.x * tick} y2={p.y + n.y * tick} />)}
      <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none" fontSize={textSize} fontFamily={font} transform={`rotate(${angle} ${mid.x} ${mid.y})`}>
        {puf > 0 ? feetInches(len / puf) || "0'" : "set scale"}
      </text>
    </g>
  );
}

/**
 * One run, in ink, marked the way Set Scaffold marks a plan: a tick at every
 * leg with its frame count, and one slash across every braced bay. A bay no
 * brace is made for is dashed back point to back point; a planked gap is
 * shaded. Same marks, same proportions - a sketch here reads like a layout
 * there.
 */
function RunInk({
  laid, sheet, puf, k, selected, editing, selectedLeg,
}: {
  laid: LaidRun;
  sheet: DesignSheet;
  puf: number;
  k: number;
  selected: boolean;
  editing: boolean;
  selectedLeg: { wall: string; index: number } | null;
}) {
  const { run, walls } = laid;
  const line = run.points.map((p) => `${p.x},${p.y}`).join(" ");
  // The wall the label is written along: the run's first, whichever order the engine handed the walls back in.
  const first = walls.find((w) => w.key === `${run.id}~0`) ?? walls[0];
  const widthLabel = FRAME_WIDTHS.find((w) => w.ft === run.widthFt)?.label ?? `${run.widthFt}'`;
  // A foot off the wall to the leg, then the frame's width: the two lengths Set Scaffold draws a bay from.
  const gap = 1 * puf, tick = run.widthFt * puf;

  return (
    <g stroke="currentColor" fill="none" strokeLinecap="square">
      {selected && <polyline points={line} strokeWidth={14 * k} opacity="0.12" strokeLinecap="round" strokeLinejoin="round" />}
      <polyline points={line} strokeWidth={1 * k} opacity="0.55" strokeDasharray={`${6 * k},${4 * k}`} />

      {walls.map((wall) => {
        const edit = (i: number) => sheet.legEdits[legKey(wall.key, i)];
        const at = (i: number) => {
          const leg = wall.legs[i], e = edit(i), dx = e?.dx ?? 0, dy = e?.dy ?? 0;
          return {
            wall: { x: leg.wallPoint.x + dx, y: leg.wallPoint.y + dy },
            tip: { x: leg.tickTip.x + dx, y: leg.tickTip.y + dy },
            label: { x: leg.labelPoint.x + dx, y: leg.labelPoint.y + dy },
          };
        };
        const lead = wall.lead && !edit(0)?.removed && puf > 0 ? (() => {
          const f = at(0), d = wall.lead!.lengthFt * puf;
          return {
            kind: wall.lead!.kind,
            a0: { x: f.wall.x - wall.along.x * d, y: f.wall.y - wall.along.y * d },
            a1: { x: f.tip.x - wall.along.x * d, y: f.tip.y - wall.along.y * d },
            b0: f.wall, b1: f.tip,
          };
        })() : null;

        return (
          <g key={wall.key}>
            {lead && <Bay kind={lead.kind} a0={lead.a0} a1={lead.a1} b0={lead.b0} b1={lead.b1} k={k} along={wall.along} normal={wall.normal} gap={gap} tick={tick} />}
            {wall.bays.map((kind, i) => {
              if (edit(i)?.removed || edit(i + 1)?.removed) return null;
              const a = at(i), b = at(i + 1);
              return <Bay key={`bay-${i}`} kind={kind} a0={a.wall} a1={a.tip} b0={b.wall} b1={b.tip} k={k} along={wall.along} normal={wall.normal} gap={gap} tick={tick} />;
            })}
            {/* The tail of the wall, exactly as the engine hands it back and never diagonal across a gap. */}
            {wall.tail && [wall.tail.a0, wall.tail.a1, wall.tail.b0, wall.tail.b1].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && (() => {
              const { a0, a1, b0, b1 } = wall.tail;
              if (wall.tail.isBay) {
                if (wall.tail.kind === "bastard") {
                  return <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} strokeWidth={0.8 * k} strokeDasharray={`${4 * k},${3 * k}`} opacity="0.75" />;
                }
                return (
                  <g opacity="0.5">
                    <line x1={a0.x} y1={a0.y} x2={b1.x} y2={b1.y} strokeWidth={0.7 * k} />
                    <line x1={a1.x} y1={a1.y} x2={b0.x} y2={b0.y} strokeWidth={0.7 * k} />
                  </g>
                );
              }
              return (
                <g opacity="0.45">
                  <line x1={a0.x} y1={a0.y} x2={b0.x} y2={b0.y} strokeWidth={0.7 * k} />
                  <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} strokeWidth={0.7 * k} />
                </g>
              );
            })()}
            {wall.legs.map((_, i) => {
              const e = edit(i);
              if (e?.removed) return null;
              const p = at(i);
              const picked = selectedLeg?.wall === wall.key && selectedLeg.index === i;
              const frames = e?.frames ?? laid.framesPerLeg;
              return (
                <g key={`leg-${i}`}>
                  {editing && (
                    <circle
                      cx={(p.wall.x + p.tip.x) / 2} cy={(p.wall.y + p.tip.y) / 2} r={9 * k}
                      fill="currentColor" fillOpacity={picked ? 0.2 : 0.05} strokeWidth={(picked ? 1.5 : 0.7) * k}
                      strokeDasharray={picked ? undefined : `${3 * k},${2 * k}`}
                    />
                  )}
                  <line x1={p.wall.x} y1={p.wall.y} x2={p.tip.x} y2={p.tip.y} strokeWidth={(picked ? 2.5 : 1.8) * k} />
                  {frames > 0 && (
                    <text
                      x={p.label.x} y={p.label.y} textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none"
                      fontSize={Math.max(tick * 0.33, 9 * k)}
                      style={{ fontFamily: "'Didact Gothic', var(--font-fira-code), ui-monospace, sans-serif", fontWeight: 400 }}
                    >
                      {frames}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* What the run is, written along its first wall, clear of the counts. */}
      {first && puf > 0 && (() => {
        const a = run.points[0], b = run.points[1];
        // Past the frame counts, which sit a constant size on screen whatever the zoom.
        const off = Math.hypot(first.legs[0].labelPoint.x - a.x, first.legs[0].labelPoint.y - a.y) > 0
          ? (1 + run.widthFt + 1.4) * puf + 20 * k
          : (1 + run.widthFt + 4.2) * puf;
        const mid = { x: (a.x + b.x) / 2 + first.normal.x * off, y: (a.y + b.y) / 2 + first.normal.y * off };
        let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;
        return (
          <text
            x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none"
            fontSize={10 * k} letterSpacing={1.4 * k} transform={`rotate(${angle} ${mid.x} ${mid.y})`} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {`RUN ${run.label} · ${Math.round(laid.lengthFt)}' · ${run.heightFt > 0 ? `${feetInches(run.heightFt)} TALL` : "NO HEIGHT"} · ${widthLabel} WIDE`}
          </text>
        );
      })()}
    </g>
  );
}

/**
 * One bay between two frames: a0/a1 the wall side and back of one, b0/b1 of
 * the next. Drawn as Set Scaffold draws it.
 */
function Bay({
  kind, a0, a1, b0, b1, k, along, normal, gap, tick,
}: {
  kind: "braced" | "bastard" | "rail";
  a0: PlanPoint; a1: PlanPoint; b0: PlanPoint; b1: PlanPoint;
  k: number;
  along: PlanPoint;
  normal: PlanPoint;
  /** Wall to leg, and the frame's width, in sheet pixels. */
  gap: number;
  tick: number;
}) {
  if (kind === "rail") {
    // Planked across, no brace: drawn as the planked gap it is.
    return (
      <polygon
        points={`${a0.x},${a0.y} ${a1.x},${a1.y} ${b1.x},${b1.y} ${b0.x},${b0.y}`}
        fill="currentColor" fillOpacity="0.08" strokeWidth={0.5 * k} opacity="0.6"
      />
    );
  }
  if (kind === "bastard") {
    // No brace is made to fit an odd length: dashed, back point to back point, so it is seen before it is built.
    return <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} strokeWidth={0.8 * k} strokeDasharray={`${4 * k},${3 * k}`} opacity="0.75" />;
  }
  // The brace: one slash across the middle of the bay.
  const cx = (a0.x + b0.x) / 2, cy = (a0.y + b0.y) / 2;
  const half = Math.hypot(b0.x - a0.x, b0.y - a0.y) * 0.3;
  return (
    <line
      x1={cx - along.x * half + normal.x * gap * 0.5} y1={cy - along.y * half + normal.y * gap * 0.5}
      x2={cx + along.x * half + normal.x * (gap + tick) * 0.9} y2={cy + along.y * half + normal.y * (gap + tick) * 0.9}
      strokeWidth={0.7 * k} opacity="0.5"
    />
  );
}
