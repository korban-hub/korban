"use client";

/**
 * Scope Scrub.
 *
 * Drop a Scope of Work or a Subcontract. Korban reads the PDF's text in the
 * browser, finds every sentence that carries a term from the keyword library
 * (Backend > Scope keywords), and lays the hits out by category in the order
 * that document reads best in. The estimator marks each hit - what to do
 * about it - answers the ten questions, and it all saves to the job.
 *
 * A subcontract also gets a Contract Sheet - the office's review of the paper
 * beyond the scaffold scope (price, early pay, retention, insurance, warranty
 * and the rest), one row each, found or not mentioned.
 *
 * It is a highlighter, not a reader: a term that is not on the list is not
 * found, which is why every category ends with the terms the document was
 * silent on. The PDF itself is never stored; the hits are.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getBackendSettings } from "@/lib/backendStore";
import { getActiveProject, updateActiveProject, type ProjectRecord } from "@/lib/projectStore";
import {
  SCOPE_DOC_TYPES,
  buildContractSheet,
  categoriesFor,
  contractSheetText,
  hitKey,
  keepScrubFile,
  keepScrubPages,
  marksFor,
  pageList,
  newScrubId,
  regroupHits,
  scrubFile,
  scrubPageText,
  scrubPages,
  searchContractRow,
  scopeItems,
  summarizeScrub,
  takePendingScopeDrop,
  takePendingScopeOpen,
  textLooksUnreadable,
  type CategoryResult,
  type ContractSheetRow,
  type PageText,
  type ScopeAnswer,
  type ScopeDocType,
  type ScopeHit,
  type ScopeLibrary,
  type ScopeMark,
  type ScopeScrubRecord,
  type TermResult,
} from "@/lib/scopeScrub";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/project-plan-desk", label: "Plan Desk" },
  { href: "/takeoff-workspace-advanced", label: "Takeoff Workspace" },
  { href: "/set-scaffold-v2", label: "Set Scaffold" },
  { href: "/estimate-review", label: "Estimate" },
  { href: "/backend", label: "Backend" },
];

// ----------------------------------------------------------------------
// Reading the PDF
// ----------------------------------------------------------------------

/**
 * Page text out of the PDF, in the browser, with pdf.js - the same build the
 * takeoff uses to read plan sheets.
 *
 * Two kinds of page give no text to search: a scan, which has none, and a
 * page whose text layer does not map back to letters and comes out as
 * symbols. Both are read from the page image instead (readPageImages). If
 * that cannot run, the page is left empty and the scrub says so - a page of
 * symbols is never searched, because it would find nothing and look clean.
 */
async function readPdfPages(
  file: File,
  onProgress: (message: string) => void,
): Promise<{ pages: PageText[]; emptyPages: number; imagePages: number; imageError: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;
  lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const pages: PageText[] = [];
  const unread: number[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    try {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items ?? []) {
        if (typeof item?.str !== "string") continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      // Words broken at a line end: "instal-\nlation" back to one word.
      text = text.replace(/(\w)-\n(?=[a-z])/g, "$1").replace(/\s*\n\s*/g, " ");
      if (text.trim().length < 20 || textLooksUnreadable(text)) { unread.push(n); text = ""; }
      pages.push({ page: n, text });
    } catch {
      unread.push(n);
      pages.push({ page: n, text: "" });
    }
  }

  let imagePages = 0;
  let imageError = "";
  if (unread.length > 0) {
    try {
      const read = await readPageImages(pdf, unread, onProgress);
      for (const p of pages) {
        const text = read.get(p.page);
        if (text && text.trim().length >= 20) { p.text = text; imagePages += 1; }
      }
    } catch (e) {
      imageError = e instanceof Error && e.message ? e.message : "the page reader could not start";
    }
  }
  const emptyPages = pages.filter((p) => p.text.trim().length < 20).length;
  return { pages, emptyPages, imagePages, imageError };
}

/**
 * Reads pages from their image: each page is drawn to a canvas and handed to
 * tesseract.js, which runs in the browser. Slower than text - seconds a page -
 * so it only runs on pages that gave no text. The reader fetches its English
 * word data the first time it is used, so that first read needs a connection.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPageImages(pdf: any, numbers: number[], onProgress: (message: string) => void): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  onProgress("Starting the page reader\u2026");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tesseract = (await import("tesseract.js")) as any;
  const worker = await tesseract.createWorker("eng");
  try {
    for (let i = 0; i < numbers.length; i++) {
      onProgress(`Reading page images\u2026 ${i + 1} of ${numbers.length}`);
      try {
        const page = await pdf.getPage(numbers[i]);
        const base = page.getViewport({ scale: 1 });
        // About 1700px across a letter page: enough for 8pt contract type.
        const viewport = page.getViewport({ scale: Math.min(3, 1700 / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const result = await worker.recognize(canvas);
        const text = String(result?.data?.text ?? "").replace(/(\w)-\n(?=[a-z])/g, "$1").replace(/\s*\n\s*/g, " ");
        out.set(numbers[i], text);
      } catch { /* this page stays empty */ }
    }
  } finally {
    try { await worker.terminate(); } catch { /* already gone */ }
  }
  return out;
}

// ----------------------------------------------------------------------
// The page
// ----------------------------------------------------------------------

type Tone = ScopeMark["tone"];

const TONE = {
  red: { text: "text-red-400", border: "border-red-400/70", bg: "bg-red-400/10", rail: "border-l-red-400" },
  orange: { text: "text-orange-300", border: "border-orange-400/70", bg: "bg-orange-400/10", rail: "border-l-orange-400" },
  amber: { text: "text-amber-300", border: "border-amber-400/70", bg: "bg-amber-400/10", rail: "border-l-amber-400" },
  green: { text: "text-emerald-300", border: "border-emerald-400/70", bg: "bg-emerald-400/10", rail: "border-l-emerald-400" },
} satisfies Record<Tone, Record<string, string>>;

function formatWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The RFI sheet: every "Assess" hit as a numbered question to the GC, with
 * the page and the sentence it came from. Opens in its own window, prints
 * from there, or is copied as text for an email.
 */
function rfiText(record: ScopeScrubRecord, library: ScopeLibrary, projectName: string): { title: string; lines: string[] } {
  const items = scopeItems([record], library, "assess");
  const title = `RFI \u2014 ${projectName || "Project"} \u2014 ${record.fileName}`;
  const lines = items.map((item, i) =>
    `${i + 1}. ${item.note ? item.note : `Please clarify: ${item.term}.`}\n   Reference: p. ${item.page} \u2014 \u201c${item.sentence.replace(/^\u2026|\u2026$/g, "")}\u201d`,
  );
  return { title, lines };
}

function openRfiSheet(record: ScopeScrubRecord, library: ScopeLibrary, projectName: string, company: string) {
  const items = scopeItems([record], library, "assess");
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const rows = items.map((item) => `
    <li>
      <p class="q">${esc(item.note || `Please clarify: ${item.term}.`)}</p>
      <p class="ref">p. ${item.page} \u2014 \u201c${esc(item.sentence.replace(/^\u2026|\u2026$/g, ""))}\u201d</p>
    </li>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>RFI \u2014 ${esc(projectName)}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:48px;max-width:760px}
    h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin:0 0 24px}
    ol{padding-left:22px}li{margin:0 0 16px}.q{margin:0;font-size:13px;font-weight:600}.ref{margin:4px 0 0;font-size:11px;color:#555}
    .foot{margin-top:36px;border-top:1px solid #ddd;padding-top:10px;font-size:11px;color:#666}
    @media print{body{margin:24px}}
  </style></head><body>
  <h1>Request for Information \u2014 Scaffold scope</h1>
  <p class="sub">${esc(projectName || "Project")} \u00b7 ${esc(record.fileName)} \u00b7 ${date}${company ? ` \u00b7 ${esc(company)}` : ""}</p>
  <p style="font-size:12px;color:#333">The following items in the ${record.docType === "scope" ? "scope of work" : "subcontract"} need clarification before our scaffold ${record.docType === "scope" ? "bid can be finalized" : "subcontract can be executed"}:</p>
  <ol>${rows}</ol>
  <div class="foot">Prepared with Korban Scope Scrub. Page references are to ${esc(record.fileName)}.</div>
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print()},150)})</script>
  </body></html>`;
  const w = window.open("", "_blank", "noopener,width=900,height=1000");
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/** What the note is for, by mark - so the line reads right where it lands. */
function notePlaceholder(markId: string): string {
  switch (markId) {
    case "exclude": return "How it reads on the proposal\u2026";
    case "price": return "What to carry\u2026";
    case "assess": return "The question for the GC\u2026";
    case "others": return "Who carries it\u2026";
    case "red": return "Why, and what to strike\u2026";
    case "notbid": return "What the number didn't carry\u2026";
    default: return "Note\u2026";
  }
}

export default function ScopeScrubPage() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [library, setLibrary] = useState<ScopeLibrary | null>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [current, setCurrent] = useState<ScopeScrubRecord | null>(null);

  // Starting a new scrub.
  const [docType, setDocType] = useState<ScopeDocType>("scope");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reading the results.
  const [litOnly, setLitOnly] = useState(false);
  const [hideSilent, setHideSilent] = useState(false);
  const [markedOnly, setMarkedOnly] = useState(false);
  const [openTerms, setOpenTerms] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<string>("");
  const [needFile, setNeedFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const pdfUrl = useRef<{ id: string; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reattachInput = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Subcontracts have two readings of the same paper: the keyword hits and the contract sheet.
  const [view, setView] = useState<"keywords" | "sheet">("keywords");

  // ---- Scrub ----------------------------------------------------------
  const runScrub = useCallback(async (file: File, type: ScopeDocType, lib: ScopeLibrary, proj: ProjectRecord) => {
    setError(null);
    setBusy(`Reading ${file.name}…`);
    try {
      const { pages, emptyPages, imagePages, imageError } = await readPdfPages(file, setBusy);
      setBusy(`Scrubbing ${pages.length} pages…`);
      const results = scrubPages(pages, categoriesFor(lib, type));
      const hits: ScopeHit[] = results.flatMap((c) => c.terms.flatMap((t) => t.hits));
      const record: ScopeScrubRecord = {
        id: newScrubId(),
        docType: type,
        fileName: file.name,
        pageCount: pages.length,
        scrubbedAt: new Date().toISOString(),
        hits,
        marks: {},
        answers: {},
        emptyPages,
        imagePages,
        // The office's sheet: what the paper pays, holds back and asks for, beyond the scaffold scope.
        sheet: type === "subcontract" ? buildContractSheet(pages, lib.contractRows) : null,
      };
      keepScrubFile(record.id, file);
      keepScrubPages(record.id, pages);
      setView("keywords");
      const next = updateActiveProject({ scopeScrubs: [record, ...proj.scopeScrubs] });
      setProject(next);
      setCurrent(record);
      setStarting(false);
      setPendingFile(null);
      setOpenTerms(new Set());
      setSavedAt(new Date().toISOString());
      if (imageError) {
        setError(`${emptyPages} page${emptyPages === 1 ? "" : "s"} had no readable text, and the page reader could not run (${imageError}). Those pages were not searched. Check the connection and scrub again.`);
      } else if (pages.length === 0 || emptyPages === pages.length) {
        setError("Korban could not read any text in this PDF, from the file or from the page images.");
      }
    } catch (e) {
      setError(`Could not read that PDF${e instanceof Error && e.message ? `: ${e.message}` : "."}`);
    } finally {
      setBusy(null);
    }
  }, []);

  // ---- Load -----------------------------------------------------------
  useEffect(() => {
    const settings = getBackendSettings();
    const active = getActiveProject();
    setLibrary(settings.scope);
    setProject(active);
    const pending = takePendingScopeDrop();
    if (pending) {
      if (pending.docType) {
        setDocType(pending.docType);
        void runScrub(pending.file, pending.docType, settings.scope, active);
      } else {
        setPendingFile(pending.file);
        setStarting(true);
      }
    } else if (active.scopeScrubs.length > 0) {
      const wanted = takePendingScopeOpen();
      setCurrent(active.scopeScrubs.find((s) => s.id === wanted) ?? active.scopeScrubs[0]);
    } else {
      setStarting(true);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startWith(file: File | null) {
    if (!file || !library || !project) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError("Scope Scrub reads PDFs. Save the document as a PDF and drop it again.");
      return;
    }
    void runScrub(file, docType, library, project);
  }

  // ---- Save marks and answers -----------------------------------------
  const saveTimer = useRef<number | null>(null);
  const persist = useCallback((record: ScopeScrubRecord) => {
    setCurrent(record);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const active = getActiveProject();
      const scrubs = active.scopeScrubs.some((s) => s.id === record.id)
        ? active.scopeScrubs.map((s) => (s.id === record.id ? record : s))
        : [record, ...active.scopeScrubs];
      setProject(updateActiveProject({ scopeScrubs: scrubs }));
      setSavedAt(new Date().toISOString());
    }, 400);
  }, []);

  function setMark(hit: ScopeHit, markId: string) {
    if (!current) return;
    const key = hitKey(hit);
    const existing = current.marks[key] ?? { mark: "", note: "" };
    const next = { ...current.marks, [key]: { ...existing, mark: existing.mark === markId ? "" : markId } };
    persist({ ...current, marks: next });
  }
  function setNote(hit: ScopeHit, note: string) {
    if (!current) return;
    const key = hitKey(hit);
    const existing = current.marks[key] ?? { mark: "", note: "" };
    persist({ ...current, marks: { ...current.marks, [key]: { ...existing, note } } });
  }
  function setAnswer(index: number, answer: ScopeAnswer) {
    if (!current) return;
    const key = String(index);
    const existing = current.answers[key] ?? { answer: "", note: "" };
    persist({ ...current, answers: { ...current.answers, [key]: { ...existing, answer: existing.answer === answer ? "" : answer } } });
  }
  function setAnswerNote(index: number, note: string) {
    if (!current) return;
    const key = String(index);
    const existing = current.answers[key] ?? { answer: "", note: "" };
    persist({ ...current, answers: { ...current.answers, [key]: { ...existing, note } } });
  }

  // ---- Contract sheet -------------------------------------------------
  function setSheetNote(rowId: string, note: string) {
    if (!current?.sheet) return;
    persist({ ...current, sheet: { rows: current.sheet.rows.map((r) => (r.id === rowId ? { ...r, note } : r)) } });
  }
  /** A row for this one contract. Searched if the pages are still in the tab; a place for a note either way. */
  function addSheetRow(name: string, wordsText: string) {
    if (!current?.sheet || !name.trim()) return;
    const words = wordsText.split(",").map((w) => w.trim()).filter(Boolean);
    const base = { id: `custom-${Date.now().toString(36)}`, name: name.trim(), words, needsAmount: false };
    const pages = scrubPageText(current.id);
    const found = pages && words.length > 0 ? searchContractRow(base, pages) : { pages: [], count: 0, hits: [] };
    const row: ContractSheetRow = { ...base, custom: true, note: "", ...found, ...(pages ? {} : { words: [] }) };
    persist({ ...current, sheet: { rows: [...current.sheet.rows, row] } });
  }
  function removeSheetRow(rowId: string) {
    if (!current?.sheet) return;
    persist({ ...current, sheet: { rows: current.sheet.rows.filter((r) => r.id !== rowId) } });
  }

  function deleteCurrent() {
    if (!current || !project) return;
    if (!window.confirm(`Remove this scrub of ${current.fileName} from the job? The marks and answers go with it.`)) return;
    const scrubs = project.scopeScrubs.filter((s) => s.id !== current.id);
    const next = updateActiveProject({ scopeScrubs: scrubs });
    setProject(next);
    setCurrent(scrubs[0] ?? null);
    if (scrubs.length === 0) setStarting(true);
  }

  // ---- Open the PDF at a page -----------------------------------------
  function openPage(page: number) {
    if (!current) return;
    const file = scrubFile(current.id);
    if (!file) { setNeedFile(true); return; }
    if (!pdfUrl.current || pdfUrl.current.id !== current.id) {
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current.url);
      pdfUrl.current = { id: current.id, url: URL.createObjectURL(file) };
    }
    window.open(`${pdfUrl.current.url}#page=${page}`, "_blank", "noopener");
  }
  function reattach(file: File | null) {
    if (!file || !current) return;
    keepScrubFile(current.id, file);
    setNeedFile(false);
  }

  // ---- Results --------------------------------------------------------
  const results = useMemo<CategoryResult[]>(() => (current && library ? regroupHits(current, library) : []), [current, library]);
  const marks = useMemo(() => (current && library ? marksFor(library, current.docType) : []), [current, library]);
  const markById = useMemo(() => new Map(marks.map((m) => [m.id, m])), [marks]);
  const summary = useMemo(() => (current && library ? summarizeScrub(current, library) : null), [current, library]);

  const isMarked = (hit: ScopeHit) => Boolean(current?.marks[hitKey(hit)]?.mark);
  const visibleTerms = (c: CategoryResult): TermResult[] => c.found.filter((t) => {
    if (litOnly && !t.term.lit) return false;
    if (markedOnly && !t.hits.some(isMarked)) return false;
    return true;
  });

  function toggleTerm(id: string) {
    setOpenTerms((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const termOpen = (t: TermResult) => openTerms.has(t.term.id) || (t.hits.length <= 2 && !openTerms.has(`closed:${t.term.id}`));
  function toggleTermSmart(t: TermResult) {
    if (t.hits.length <= 2) {
      setOpenTerms((prev) => { const n = new Set(prev); const k = `closed:${t.term.id}`; if (n.has(k)) n.delete(k); else n.add(k); return n; });
    } else toggleTerm(t.term.id);
  }

  function jumpTo(categoryId: string) {
    document.getElementById(`scrub-cat-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Render ---------------------------------------------------------
  if (!hydrated || !library || !project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base text-white">
        <p className="text-sm text-zinc-500">Loading Scope Scrub…</p>
      </main>
    );
  }

  const docLabel = (t: ScopeDocType) => SCOPE_DOC_TYPES.find((d) => d.id === t)?.label ?? t;

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanHeader
        title="Scope Scrub"
        subtitle={project.projectName || "Untitled project"}
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            {savedAt && current && !starting && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                Saved to job {new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            {current && !starting && (
              <button
                onClick={() => { setStarting(true); setError(null); }}
                className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300 transition hover:bg-orange-500/20"
              >
                New scrub
              </button>
            )}
            <button
              onClick={() => router.push("/project-plan-desk")}
              className="rounded-lg border border-zinc-800 bg-korban-raised px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              Plan Desk
            </button>
          </>
        }
      />

      {starting || !current ? (
        <StartPanel
          docType={docType}
          setDocType={setDocType}
          busy={busy}
          error={error}
          pendingFile={pendingFile}
          onFile={startWith}
          onCancel={current ? () => { setStarting(false); setPendingFile(null); setError(null); } : null}
          previous={project.scopeScrubs}
          onOpen={(s) => { setCurrent(s); setStarting(false); setView("keywords"); }}
          library={library}
          fileInput={fileInput}
        />
      ) : (
        <div className="grid gap-3 p-4 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
          {/* ---- Title row -------------------------------------------- */}
          <div className="xl:col-span-3 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-bold tracking-tight text-white">{current.fileName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded border border-orange-500 bg-orange-500/10 px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-orange-200 shadow-[0_0_10px_rgba(249,115,22,0.25)]">
                  {docLabel(current.docType)}
                </span>
                <span className="font-mono text-[10px] text-zinc-600">
                  {current.pageCount} pages · scrubbed {formatWhen(current.scrubbedAt)} · {results.length} categories · {results.reduce((n, c) => n + c.terms.length, 0)} terms
                  {current.emptyPages > 0 ? ` · ${current.emptyPages} page${current.emptyPages === 1 ? "" : "s"} with no text` : ""}
                </span>
              </div>
            </div>
            {summary && (
              <div className="flex flex-wrap items-end gap-2">
                <Chip n={String(summary.hits)} label="hits" />
                <Chip n={`${summary.termsFound} / ${results.reduce((n, c) => n + c.silent.length, 0)}`} label="found / silent" />
                {marks.map((m) => (
                  <Chip key={m.id} n={String(summary.byMark[m.id] ?? 0)} label={m.label} tone={m.tone} />
                ))}
                {(summary.byMark.assess ?? 0) > 0 && (
                  <>
                    <button
                      onClick={() => openRfiSheet(current, library, project.projectName, getBackendSettings().company.companyName)}
                      title="Every Assess hit as a numbered question to the GC - prints from its own window"
                      className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 font-mono text-[10px] text-amber-200 transition hover:bg-amber-400/20"
                    >
                      RFI sheet
                    </button>
                    <button
                      onClick={() => {
                        const { title, lines } = rfiText(current, library, project.projectName);
                        void navigator.clipboard?.writeText([title, "", ...lines].join("\n")).then(() => setCopied(true));
                        window.setTimeout(() => setCopied(false), 1600);
                      }}
                      className="rounded-lg border border-zinc-800 bg-korban-raised px-3 py-2 font-mono text-[10px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                    >
                      {copied ? "Copied" : "Copy RFIs"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => openPage(1)}
                  className="rounded-lg border border-zinc-800 bg-korban-raised px-3 py-2 font-mono text-[10px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                >
                  Open PDF
                </button>
                <button
                  onClick={deleteCurrent}
                  className="rounded-lg border border-zinc-800 px-3 py-2 font-mono text-[10px] text-zinc-600 transition hover:border-red-500/40 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {error && (
            <p className="xl:col-span-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">{error}</p>
          )}
          {needFile && (
            <div className="xl:col-span-3 flex flex-wrap items-center gap-3 rounded border border-zinc-800 bg-black/40 px-3 py-2 text-[11px] text-zinc-400">
              The PDF isn&apos;t held after a reload - the hits are. Re-attach <span className="font-mono text-zinc-200">{current.fileName}</span> to open pages.
              <input ref={reattachInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => reattach(e.target.files?.[0] ?? null)} />
              <button onClick={() => reattachInput.current?.click()} className="rounded border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 font-mono text-[10px] text-orange-200">Choose PDF</button>
              <button onClick={() => setNeedFile(false)} className="font-mono text-[10px] text-zinc-600 hover:text-zinc-300">Not now</button>
            </div>
          )}

          {current.imagePages > 0 && (
            <p className="xl:col-span-3 rounded border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-[1.5] text-amber-200">
              {current.imagePages === current.pageCount ? "This PDF had no readable text" : `${current.imagePages} of ${current.pageCount} pages had no readable text`}, so Korban read the page images instead. Check a quote against the page before relying on it.
            </p>
          )}

          {current.docType === "subcontract" && (
            <div className="xl:col-span-3 flex flex-wrap items-center gap-1.5">
              {([["keywords", "Keywords"], ["sheet", "Contract sheet"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                    view === id ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
              {!current.sheet && view === "sheet" && (
                <span className="ml-2 text-[11px] text-zinc-500">This scrub was made before the contract sheet existed. Start a new scrub of the same PDF to get one.</span>
              )}
            </div>
          )}

          {view === "sheet" && current.docType === "subcontract" ? (
            current.sheet && (
              <ContractSheetPanel
                record={current}
                canSearch={Boolean(scrubPageText(current.id))}
                onNote={setSheetNote}
                onAdd={addSheetRow}
                onRemove={removeSheetRow}
                onPage={openPage}
                projectName={project.projectName}
              />
            )
          ) : (<>
          {/* ---- Rail ---------------------------------------------------- */}
          <aside className="flex flex-col gap-0.5 self-start rounded-xl border border-zinc-800 bg-black/40 p-2.5 xl:sticky xl:top-[72px]">
            <p className="px-2 pb-2 pt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-600">Categories</p>
            {results.map((c) => (
              <button
                key={c.category.id}
                onClick={() => jumpTo(c.category.id)}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11.5px] text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
              >
                <span className="truncate">{c.category.name}</span>
                <span className={`font-mono text-[10px] ${c.hitCount > 0 ? "text-orange-300" : "text-zinc-700"}`}>{c.hitCount}</span>
              </button>
            ))}
            <div className="mt-3 grid gap-2 border-t border-zinc-900 pt-3">
              <Switch on={litOnly} onChange={setLitOnly} label="Search-first terms only" />
              <Switch on={hideSilent} onChange={setHideSilent} label="Hide silent terms" />
              <Switch on={markedOnly} onChange={setMarkedOnly} label="Marked only" />
            </div>
            {project.scopeScrubs.length > 1 && (
              <div className="mt-3 border-t border-zinc-900 pt-3">
                <p className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-600">On this job</p>
                {project.scopeScrubs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setCurrent(s); setOpenTerms(new Set()); }}
                    className={`block w-full truncate rounded px-2 py-1 text-left text-[10.5px] transition ${s.id === current.id ? "bg-orange-500/10 text-orange-200" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"}`}
                    title={s.fileName}
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">{docLabel(s.docType)} · </span>{s.fileName}
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* ---- Sections ------------------------------------------------ */}
          <section className="flex min-w-0 flex-col gap-3">
            {results.map((c) => {
              const terms = visibleTerms(c);
              return (
                <div key={c.category.id} id={`scrub-cat-${c.category.id}`} className="scroll-mt-20 rounded-xl border border-zinc-800 bg-black/40">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-900 px-4 py-2.5">
                    <div>
                      <h2 className="text-[15px] font-bold uppercase tracking-[0.04em] text-orange-400">{c.category.name}</h2>
                      {c.category.blurb && <p className="text-[10px] text-zinc-600">{c.category.blurb}</p>}
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {c.hitCount} hit{c.hitCount === 1 ? "" : "s"} · {c.found.length} term{c.found.length === 1 ? "" : "s"} found · {c.silent.length} silent
                    </span>
                  </div>
                  {terms.length === 0 && (
                    <p className="px-4 py-3 text-[11px] text-zinc-600">
                      {c.found.length === 0 ? "Nothing in the document for this category." : "Nothing matches the filters."}
                    </p>
                  )}
                  {terms.map((t) => {
                    const open = termOpen(t);
                    return (
                      <div key={t.term.id} className="border-b border-zinc-900 last:border-b-0">
                        <button onClick={() => toggleTermSmart(t)} className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-4 py-2.5 text-left">
                          <span className="font-mono text-[10px] text-zinc-600">{open ? "▾" : "▸"}</span>
                          <span className="min-w-0">
                            <span className={`text-[12.5px] font-semibold text-white ${t.term.lit ? "rounded-md border border-orange-500/60 px-2 py-0.5 shadow-[0_0_10px_rgba(249,115,22,0.3)]" : ""}`}>
                              {t.term.term}
                            </span>
                            {t.term.note && <span className="ml-2 text-[10.5px] text-zinc-500">{t.term.note}</span>}
                          </span>
                          <span className="font-mono text-[10px] text-orange-300">{t.hits.length} hit{t.hits.length === 1 ? "" : "s"}</span>
                        </button>
                        {open && (
                          <HitList
                            term={t}
                            marks={marks}
                            markById={markById}
                            record={current}
                            markedOnly={markedOnly}
                            onMark={setMark}
                            onNote={setNote}
                            onPage={openPage}
                          />
                        )}
                      </div>
                    );
                  })}
                  {!hideSilent && c.silent.length > 0 && (
                    <p className="px-4 pb-3 pt-2 text-[10.5px] leading-[1.7] text-zinc-600">
                      <span className="text-zinc-500">Silent:</span>{" "}
                      {c.silent.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && " · "}
                          <span className={s.lit ? "rounded border border-orange-500/30 px-1" : ""}>{s.term}</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              );
            })}
            <p className="px-1 py-2 font-mono text-[10px] text-zinc-700">
              Matches are your keyword list only - Korban highlights, it does not read. Backend &rarr; Scope keywords to add terms.
              {current.docType === "scope"
                ? " Exclude it lines print in the proposal's exclusions; Price it lines are the checklist on Set Scaffold; Assess lines make the RFI sheet."
                : " Assess lines make the RFI sheet."}
            </p>
          </section>

          {/* ---- The questions ------------------------------------------- */}
          <aside className="self-start rounded-xl border border-zinc-800 bg-black/40 p-3 xl:sticky xl:top-[72px]">
            <h2 className="text-[15px] font-bold uppercase tracking-[0.04em] text-orange-400">The ten questions</h2>
            <p className="mb-2 text-[10px] text-zinc-600">Answer from the document. Unanswered counts as open.</p>
            {library.questions.map((q, i) => {
              const a = current.answers[String(i)] ?? { answer: "", note: "" };
              return (
                <div key={i} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 border-t border-zinc-900 py-2">
                  <span className="font-mono text-[10px] text-zinc-600">{i + 1}</span>
                  <div>
                    <p className="text-[11px] leading-[1.4] text-zinc-300">{q}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      {([["yes", "Yes", "green"], ["no", "No", "red"], ["unclear", "Unclear", "amber"]] as const).map(([val, label, tone]) => (
                        <button
                          key={val}
                          onClick={() => setAnswer(i, val)}
                          className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] transition ${
                            a.answer === val ? `${TONE[tone].border} ${TONE[tone].text} ${TONE[tone].bg}` : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={a.note}
                      onChange={(e) => setAnswerNote(i, e.target.value)}
                      placeholder="Note, page…"
                      className="mt-1.5 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] italic text-zinc-500 outline-none placeholder:text-zinc-800 focus:border-zinc-800 focus:text-zinc-300"
                    />
                  </div>
                </div>
              );
            })}
          </aside>
          </>)}
        </div>
      )}
    </main>
  );
}

// ----------------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------------

/**
 * The contract sheet: one row per thing the office checks on a subcontract.
 * Found or not, where, the sentence, and the office's note. Korban finds and
 * quotes; what to do about a row is written in the note by a person.
 */
function ContractSheetPanel({
  record, canSearch, onNote, onAdd, onRemove, onPage, projectName,
}: {
  record: ScopeScrubRecord;
  canSearch: boolean;
  onNote: (rowId: string, note: string) => void;
  onAdd: (name: string, words: string) => void;
  onRemove: (rowId: string) => void;
  onPage: (page: number) => void;
  projectName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = record.sheet?.rows ?? [];
  const title = `Contract sheet \u2014 ${projectName || "Project"} \u2014 ${record.fileName}`;

  function copy() {
    void navigator.clipboard?.writeText([title, "", ...contractSheetText(record)].join("\n")).then(() => setCopied(true));
    window.setTimeout(() => setCopied(false), 1600);
  }
  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = rows.map((r) => {
      const where = r.count > 0 ? pageList(r.pages) : r.words.length === 0 ? "" : "NOT mentioned";
      const quote = r.hits[0] ? `<div class="q">\u201c${esc(r.hits[0].sentence)}\u201d${r.count > 1 ? ` <i>+ ${r.count - 1} more</i>` : ""}</div>` : "";
      return `<tr><td class="n">${esc(r.name)}</td><td class="w">${esc(where)}</td><td>${quote}<div class="note">${esc(r.note)}</div></td></tr>`;
    }).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font:12px/1.5 Arial,sans-serif;color:#111;margin:32px}
      h1{font-size:16px;margin:0 0 4px} p{margin:0 0 16px;color:#555;font-size:11px}
      table{width:100%;border-collapse:collapse} td{border-top:1px solid #ccc;padding:8px 10px 8px 0;vertical-align:top}
      .n{font-weight:bold;width:170px} .w{width:120px;white-space:nowrap} .q{color:#444;font-size:11px} .note{margin-top:3px;font-weight:bold}
    </style></head><body><h1>${esc(title)}</h1><p>${record.pageCount} pages. Page numbers count from the first page of this file.</p><table>${body}</table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <section className="xl:col-span-3 rounded-xl border border-zinc-800 bg-black/40 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-[15px] font-bold uppercase tracking-[0.04em] text-orange-400">Contract sheet</h2>
          <p className="mt-0.5 text-[10.5px] leading-[1.5] text-zinc-500">
            What the paper says beyond the scaffold scope. Korban finds and quotes; &ldquo;Not mentioned&rdquo; means none of the row&apos;s words are in this file. Pages count from the first page of the file.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={print} className="rounded-lg border border-zinc-800 bg-korban-raised px-3 py-2 font-mono text-[10px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200">Print</button>
          <button onClick={copy} className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 font-mono text-[10px] text-orange-300 transition hover:bg-orange-500/20">{copied ? "Copied" : "Copy sheet"}</button>
        </div>
      </div>

      <div className="hidden grid-cols-[170px_130px_minmax(0,1fr)_300px] gap-4 border-b border-zinc-800 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600 lg:grid">
        <span>Item</span><span>Where</span><span>What the contract says</span><span>Your note</span>
      </div>

      {rows.map((row) => {
        const found = row.count > 0;
        const noteOnly = row.words.length === 0;
        const showAll = open.has(row.id);
        const shown = showAll ? row.hits : row.hits.slice(0, 1);
        return (
          <div key={row.id} className="grid gap-x-4 gap-y-2 border-b border-zinc-900 py-3 lg:grid-cols-[170px_130px_minmax(0,1fr)_300px]">
            <div>
              <p className="text-[13px] font-semibold text-zinc-100">{row.name}</p>
              {row.custom && (
                <button onClick={() => onRemove(row.id)} className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600 hover:text-red-300">Remove row</button>
              )}
            </div>
            <div>
              {noteOnly ? (
                <span className="inline-block rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">By hand</span>
              ) : found ? (
                <>
                  <span className="inline-block rounded border border-emerald-400/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-300">Found</span>
                  <p className="mt-1.5 font-mono text-[10.5px] text-orange-300">{pageList(row.pages)}</p>
                </>
              ) : (
                <span className="inline-block rounded border border-red-400/45 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-red-300">{row.needsAmount ? "Not found" : "Not mentioned"}</span>
              )}
            </div>
            <div className="min-w-0">
              {noteOnly ? (
                <p className="text-[11.5px] leading-[1.55] text-zinc-600">Added by hand - not searched.</p>
              ) : !found ? (
                <p className="text-[11.5px] leading-[1.55] text-zinc-600">
                  {row.needsAmount ? "No dollar figure beside these words in this file. If the first page is missing, the price may be on it." : "None of this row's words appear in this file."}
                  <span className="mt-0.5 block text-[10px] text-zinc-700">Looked for: {row.words.join(", ")}</span>
                </p>
              ) : (
                <>
                  {shown.map((hit, i) => (
                    <p key={i} className={`text-[11.5px] leading-[1.55] text-zinc-400 ${i > 0 ? "mt-2 border-t border-zinc-900 pt-2" : ""}`}>
                      <button onClick={() => onPage(hit.page)} className="mr-1.5 font-mono text-[10px] text-orange-300 hover:underline" title="Open the PDF at this page">p. {hit.page}</button>
                      {hit.sentence.slice(0, hit.start)}
                      <mark className="rounded-[2px] bg-orange-500/25 px-0.5 font-semibold text-white">{hit.sentence.slice(hit.start, hit.end)}</mark>
                      {hit.sentence.slice(hit.end)}
                    </p>
                  ))}
                  {row.count > 1 && (
                    <button
                      onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })}
                      className="mt-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-300"
                    >
                      {showAll
                        ? `Show less${row.count > row.hits.length ? ` (${row.count - row.hits.length} more not kept - see the pages)` : ""}`
                        : `+ ${row.count - 1} more`}
                    </button>
                  )}
                </>
              )}
            </div>
            <textarea
              value={row.note}
              onChange={(e) => onNote(row.id, e.target.value)}
              placeholder="Add a note\u2026"
              rows={2}
              className="w-full resize-y rounded border border-zinc-800 bg-black/60 px-2.5 py-2 text-[11.5px] leading-[1.5] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
            />
          </div>
        );
      })}

      <div className="mt-3 grid gap-2 rounded border border-dashed border-zinc-800 p-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a row for this contract\u2026"
          className="rounded border border-zinc-800 bg-black/60 px-2.5 py-1.5 text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-orange-500/40"
        />
        <input
          value={words}
          onChange={(e) => setWords(e.target.value)}
          disabled={!canSearch}
          placeholder={canSearch ? "Words to look for, separated by commas (optional)" : "Searching needs the PDF read again - this row will take a note only"}
          className="rounded border border-zinc-800 bg-black/60 px-2.5 py-1.5 text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-orange-500/40 disabled:opacity-60"
        />
        <button
          onClick={() => { onAdd(name, canSearch ? words : ""); setName(""); setWords(""); }}
          disabled={!name.trim()}
          className="rounded border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-40"
        >
          Add row
        </button>
      </div>
    </section>
  );
}

function Chip({ n, label, tone }: { n: string; label: string; tone?: Tone }) {
  return (
    <div className="min-w-[78px] rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-1.5">
      <p className={`text-[16px] font-bold leading-none ${tone ? TONE[tone].text : "text-white"}`}>{n}</p>
      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 px-2 text-left text-[11px] text-zinc-400 hover:text-zinc-200">
      <span className={`relative inline-block h-3.5 w-[26px] rounded-full transition ${on ? "bg-orange-500" : "bg-zinc-700"}`}>
        <span className={`absolute top-[2px] h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-[14px]" : "left-[2px]"}`} />
      </span>
      {label}
    </button>
  );
}

const PAGE_SIZE = 40;

function HitList({
  term, marks, markById, record, markedOnly, onMark, onNote, onPage,
}: {
  term: TermResult;
  marks: ScopeMark[];
  markById: Map<string, ScopeMark>;
  record: ScopeScrubRecord;
  markedOnly: boolean;
  onMark: (hit: ScopeHit, markId: string) => void;
  onNote: (hit: ScopeHit, note: string) => void;
  onPage: (page: number) => void;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const hits = term.hits.filter((h) => !markedOnly || Boolean(record.marks[hitKey(h)]?.mark));
  return (
    <div className="grid gap-1.5 px-4 pb-3 pl-[42px]">
      {hits.slice(0, shown).map((hit) => {
        const key = hitKey(hit);
        const entry = record.marks[key] ?? { mark: "", note: "" };
        const mark = entry.mark ? markById.get(entry.mark) : undefined;
        return (
          <div key={key} className={`rounded-r-md border-l-2 bg-white/[0.015] px-2.5 py-1.5 ${mark ? TONE[mark.tone].rail : "border-l-zinc-800"}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <p className="text-[11px] leading-[1.55] text-zinc-400">
                {hit.sentence.slice(0, hit.start)}
                <mark className="rounded-[2px] bg-orange-500/25 px-0.5 font-semibold text-white">{hit.sentence.slice(hit.start, hit.end)}</mark>
                {hit.sentence.slice(hit.end)}
              </p>
              <button onClick={() => onPage(hit.page)} className="whitespace-nowrap font-mono text-[10px] text-orange-300 hover:underline" title="Open the PDF at this page">
                p. {hit.page}
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {marks.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onMark(hit, m.id)}
                  title={m.meaning}
                  className={`rounded border px-1.5 py-[1px] font-mono text-[8.5px] uppercase tracking-[0.08em] transition ${
                    entry.mark === m.id ? `${TONE[m.tone].border} ${TONE[m.tone].text} ${TONE[m.tone].bg}` : "border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              {entry.done && <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-emerald-400">carried</span>}
              <input
                value={entry.note}
                onChange={(e) => onNote(hit, e.target.value)}
                placeholder={entry.mark ? notePlaceholder(entry.mark) : ""}
                className="min-w-[120px] flex-1 rounded border border-transparent bg-transparent px-1.5 py-[1px] text-[10px] italic text-zinc-500 outline-none placeholder:text-zinc-800 focus:border-zinc-800 focus:text-zinc-300"
              />
            </div>
          </div>
        );
      })}
      {hits.length > shown && (
        <button onClick={() => setShown(hits.length)} className="justify-self-start font-mono text-[10px] text-zinc-500 hover:text-orange-300">
          Show all {hits.length} ↓
        </button>
      )}
      {hits.length === 0 && <p className="text-[10.5px] text-zinc-600">No marked hits under this term.</p>}
    </div>
  );
}

/** Choose the document, drop the PDF. */
function StartPanel({
  docType, setDocType, busy, error, pendingFile, onFile, onCancel, previous, onOpen, library, fileInput,
}: {
  docType: ScopeDocType;
  setDocType: (t: ScopeDocType) => void;
  busy: string | null;
  error: string | null;
  pendingFile: File | null;
  onFile: (file: File | null) => void;
  onCancel: (() => void) | null;
  previous: ScopeScrubRecord[];
  onOpen: (s: ScopeScrubRecord) => void;
  library: ScopeLibrary;
  fileInput: React.RefObject<HTMLInputElement | null>;
}) {
  const [over, setOver] = useState(false);
  const cats = categoriesFor(library, docType);
  const termCount = cats.reduce((n, c) => n + c.terms.length, 0);
  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-6">
      <div className="rounded-xl border border-zinc-800 bg-black/40 p-5">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-orange-400">Tool</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-white">What is this document?</h1>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-zinc-500">
          The two speak different languages, so the choice decides which categories run, in what order, and what the marks are called.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SCOPE_DOC_TYPES.map((d) => {
            const on = d.id === docType;
            const dMarks = marksFor(library, d.id);
            return (
              <button
                key={d.id}
                onClick={() => setDocType(d.id)}
                className={`rounded-xl border p-4 text-left transition ${on ? "border-orange-500 bg-orange-500/10 shadow-[0_0_14px_rgba(249,115,22,0.25)]" : "border-zinc-800 bg-black/30 hover:border-zinc-600"}`}
              >
                <p className={`text-[15px] font-bold uppercase tracking-[0.04em] ${on ? "text-orange-300" : "text-zinc-300"}`}>{d.label}</p>
                <p className="mt-1 text-[11px] leading-[1.5] text-zinc-500">{d.when}</p>
                <p className="mt-2.5 flex flex-wrap gap-1">
                  {dMarks.map((m) => (
                    <span key={m.id} className={`rounded border px-1.5 py-[1px] font-mono text-[8.5px] uppercase tracking-[0.08em] ${TONE[m.tone].border} ${TONE[m.tone].text}`}>{m.label}</span>
                  ))}
                </p>
              </button>
            );
          })}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0] ?? null); }}
          onClick={() => !busy && fileInput.current?.click()}
          className={`mt-4 cursor-pointer rounded-xl border border-dashed p-8 text-center transition ${over ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
        >
          <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          {busy ? (
            <p className="font-mono text-[11px] text-orange-300">{busy}</p>
          ) : (
            <>
              <p className="text-[13px] text-zinc-300">
                <span className="font-semibold text-orange-300">Drop the PDF</span> or click to choose
                {pendingFile ? <> &mdash; <span className="font-mono text-zinc-200">{pendingFile.name}</span> is waiting</> : null}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-600">
                {cats.length} categories · {termCount} terms · text PDFs only - a scan has no words to search
              </p>
              {pendingFile && (
                <button
                  onClick={(e) => { e.stopPropagation(); onFile(pendingFile); }}
                  className="mt-3 rounded-lg border border-orange-500/50 bg-orange-500/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200 hover:bg-orange-500/20"
                >
                  Scrub {pendingFile.name} as {SCOPE_DOC_TYPES.find((d) => d.id === docType)?.label}
                </button>
              )}
            </>
          )}
        </div>
        {error && <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">{error}</p>}
        {onCancel && (
          <button onClick={onCancel} className="mt-3 font-mono text-[10px] text-zinc-600 hover:text-zinc-300">Back to the last scrub</button>
        )}
      </div>

      {previous.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-600">On this job</p>
          <div className="mt-2 grid gap-1.5">
            {previous.map((s) => {
              const sum = summarizeScrub(s, library);
              return (
                <button key={s.id} onClick={() => onOpen(s)} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-900 px-3 py-2 text-left transition hover:border-orange-500/40">
                  <span className="min-w-0 truncate text-[12px] text-zinc-200">
                    <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.1em] text-orange-400">{SCOPE_DOC_TYPES.find((d) => d.id === s.docType)?.label}</span>
                    {s.fileName}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">{formatWhen(s.scrubbedAt)} · {sum.hits} hits · {sum.marked} marked · {sum.answered}/{sum.questions} answered</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
