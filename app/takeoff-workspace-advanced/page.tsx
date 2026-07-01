"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";

// ── Types ─────────────────────────────────────────────────────────────────────

type PageTag = "Floor Plan" | "Elevation View" | "Section View" | "Untagged";
type ActiveTool = "none" | "setScale" | "traceWall" | "setHeight" | "drawSection";

type ExtractedPage = {
  id: string;
  pageNumber: number;
  tag: PageTag;
  thumbnail: string;   // base64 data URL from canvas render
  scaleSet: boolean;
  scaleLabel: string;
};

const TAG_COLORS: Record<PageTag, string> = {
  "Floor Plan":     "border-blue-500/40 bg-blue-500/10 text-blue-300",
  "Elevation View": "border-orange-500/40 bg-orange-500/10 text-orange-300",
  "Section View":   "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "Untagged":       "border-zinc-700 bg-zinc-900 text-zinc-400",
};

const menuLinks: KorbanMenuLink[] = [
  { href: "/takeoff-workspace",  label: "Standard Takeoff" },
  { href: "/set-scaffold",       label: "Set Scaffold" },
  { href: "/project-plan-desk",  label: "Plan Desk" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TakeoffWorkspaceAdvancedPage() {
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [activePage, setActivePage] = useState<ExtractedPage | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("none");
  const [showTagMenu, setShowTagMenu] = useState<string | null>(null);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleInput, setScaleInput] = useState("");
  const [uploadDragging, setUploadDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [fullPageUrl, setFullPageUrl] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load PDF.js worker — v5 uses legacy build path
  useEffect(() => {
    async function initPdfJs() {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    }
    initPdfJs().catch(console.error);
  }, []);

  // Render a single page to a canvas and return data URL
  async function renderPageToDataUrl(pdf: any, pageNum: number, scale: number): Promise<string> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") return;
    setLoading(true);
    setLoadingProgress(0);
    setPages([]);
    setActivePage(null);

    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);

      const totalPages = pdf.numPages;
      const extracted: ExtractedPage[] = [];

      for (let i = 1; i <= totalPages; i++) {
        // Thumbnail at low scale
        const thumb = await renderPageToDataUrl(pdf, i, 0.3);
        extracted.push({
          id: `page-${i}`,
          pageNumber: i,
          tag: "Untagged",
          thumbnail: thumb,
          scaleSet: false,
          scaleLabel: "—",
        });
        setLoadingProgress(Math.round((i / totalPages) * 100));
        // Yield to UI between pages
        await new Promise(r => setTimeout(r, 0));
      }

      setPages(extracted);
      setActivePage(extracted[0]);
      // Load full res first page
      const full = await renderPageToDataUrl(pdf, 1, 1.5);
      setFullPageUrl(full);
    } catch (e) {
      console.error("PDF load failed:", e);
    } finally {
      setLoading(false);
      setLoadingProgress(0);
    }
  }, []);

  async function loadFullPage(page: ExtractedPage) {
    setActivePage(page);
    if (!pdfDoc) return;
    const url = await renderPageToDataUrl(pdfDoc, page.pageNumber, 1.5);
    setFullPageUrl(url);
  }

  function setPageTag(id: string, tag: PageTag) {
    setPages(p => p.map(pg => pg.id === id ? { ...pg, tag } : pg));
    if (activePage?.id === id) setActivePage(pg => pg ? { ...pg, tag } : pg);
    setShowTagMenu(null);
  }

  function removePageFromLibrary(id: string) {
    setPages(p => p.filter(pg => pg.id !== id));
    if (activePage?.id === id) {
      const remaining = pages.filter(pg => pg.id !== id);
      setActivePage(remaining[0] ?? null);
    }
    setShowTagMenu(null);
  }

  function saveScale() {
    if (!scaleInput.trim() || !activePage) return;
    const updated = { ...activePage, scaleSet: true, scaleLabel: scaleInput };
    setPages(p => p.map(pg => pg.id === activePage.id ? updated : pg));
    setActivePage(updated);
    setScaleInput("");
    setScaleModalOpen(false);
    setActiveTool("none");
  }

  const toolButtons: { tool: ActiveTool; label: string; icon: string; forTag: PageTag[] }[] = [
    { tool: "setScale",    label: "Set Scale",       icon: "⟷", forTag: ["Floor Plan", "Elevation View", "Section View", "Untagged"] },
    { tool: "traceWall",   label: "Trace Perimeter", icon: "✏",  forTag: ["Floor Plan"] },
    { tool: "setHeight",   label: "Set Heights",     icon: "↕",  forTag: ["Elevation View"] },
    { tool: "drawSection", label: "Draw Section",    icon: "⊘",  forTag: ["Section View"] },
  ];

  const relevantTools = activePage
    ? toolButtons.filter(t => t.forTag.includes(activePage.tag))
    : [];

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Takeoff Workspace"
        subtitle="Advanced · Upload drawings, extract pages, set scales, trace all views"
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <a href="/takeoff-workspace"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:border-orange-500/30">
              Standard Mode
            </a>
            <a href="/set-scaffold"
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-orange-400">
              Set Scaffold →
            </a>
          </>
        }
      />

      {/* Phase strip */}
      <div className="flex items-center border-b border-zinc-900 bg-[#0b0b0b] px-6">
        {["1 · Upload & Extract", "2 · Tag & Scale", "3 · Trace & Annotate"].map((phase, i) => (
          <div key={phase} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] border-b-2 transition ${
            i === (pages.length === 0 ? 0 : activeTool !== "none" ? 2 : 1)
              ? "border-orange-500 text-orange-300"
              : "border-transparent text-zinc-600"}`}>
            {phase}
          </div>
        ))}
        <div className="h-4 w-px bg-zinc-800 mx-3" />
        <a href="/takeoff-workspace-aerial"
          className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600 hover:text-orange-300 border-b-2 border-transparent hover:border-orange-500/40 transition flex items-center gap-1.5">
          <span className="text-[11px]">🛰</span> Aerial Mode
        </a>
        {pages.length > 0 && (
          <div className="ml-auto text-[10px] text-zinc-600 font-mono">
            {pages.length} page{pages.length !== 1 ? "s" : ""} · {pages.filter(p => p.scaleSet).length} scaled
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel — Page Library ───────────────────────────────────── */}
        <aside className="flex w-[200px] flex-shrink-0 flex-col border-r border-zinc-900 bg-[#080604]">
          <div className="flex items-center justify-between border-b border-zinc-900 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Pages</p>
            <button onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[9px] font-bold text-orange-300 hover:bg-orange-500/20">
              + PDF
            </button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>

          {/* Drop zone — shows when no pages */}
          {pages.length === 0 && !loading && (
            <div
              onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
              onDragLeave={() => setUploadDragging(false)}
              onDrop={e => { e.preventDefault(); setUploadDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`mx-3 mt-4 flex-1 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-4 text-center transition cursor-pointer ${
                uploadDragging ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 hover:border-zinc-600"}`}>
              <div className="h-10 w-10 rounded-xl border border-zinc-700 flex items-center justify-center text-xl">📄</div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">Drop PDF here or click to browse</p>
              <p className="text-[9px] text-zinc-700">All pages will be extracted</p>
            </div>
          )}

          {/* Loading progress */}
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
              <div className="w-full rounded-full bg-zinc-900 h-1.5 overflow-hidden">
                <div className="h-full bg-orange-500 transition-all duration-200 rounded-full"
                  style={{ width: `${loadingProgress}%` }} />
              </div>
              <p className="text-[10px] text-zinc-500">Rendering pages… {loadingProgress}%</p>
            </div>
          )}

          {/* Thumbnails */}
          {!loading && pages.length > 0 && (
            <div className="flex-1 overflow-y-auto py-2 space-y-2 px-2">
              {pages.map(pg => (
                <div key={pg.id} className="relative">
                  <div
                    onClick={() => loadFullPage(pg)}
                    className={`w-full rounded-xl border p-1.5 text-left transition cursor-pointer ${
                      activePage?.id === pg.id
                        ? "border-orange-500/60 bg-orange-500/10"
                        : "border-zinc-800 bg-black hover:border-zinc-700"}`}>

                    {/* Real thumbnail */}
                    <div className="relative mb-1.5 overflow-hidden rounded-lg bg-zinc-900"
                      style={{ aspectRatio: "8.5/11" }}>
                      {pg.thumbnail ? (
                        <img src={pg.thumbnail} alt={`Page ${pg.pageNumber}`}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">?</div>
                      )}
                      {pg.scaleSet && (
                        <div className="absolute bottom-1 left-1 right-1 rounded bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.5 text-[7px] font-bold text-emerald-300 text-center truncate">
                          ✓ {pg.scaleLabel}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 mt-1">
                      <p className="text-[9px] font-mono text-zinc-500">Pg {pg.pageNumber}</p>
                    </div>
                    {/* Tag button — full width, obvious */}
                    <button
                      onClick={e => { e.stopPropagation(); setShowTagMenu(showTagMenu === pg.id ? null : pg.id); }}
                      className={`mt-1.5 w-full rounded-lg px-2 py-1.5 text-[9px] font-bold border transition ${TAG_COLORS[pg.tag]} ${
                        pg.tag === "Untagged" ? "animate-pulse" : ""}`}>
                      {pg.tag === "Untagged" ? "▾ Tag this page" : `✓ ${pg.tag}`}
                    </button>
                  </div>

                  {/* Tag dropdown */}
                  {showTagMenu === pg.id && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden">
                      {(["Floor Plan", "Elevation View", "Section View", "Untagged"] as PageTag[]).map(tag => (
                        <button key={tag} onClick={() => setPageTag(pg.id, tag)}
                          className={`w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-zinc-800 border-b border-zinc-900 last:border-0 ${
                            TAG_COLORS[tag].split(" ").find(c => c.startsWith("text-")) ?? "text-zinc-400"}`}>
                          {tag}
                        </button>
                      ))}
                      <div className="border-t border-zinc-800">
                        <button onClick={() => removePageFromLibrary(pg.id)}
                          className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-400 hover:bg-red-500/10">
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Center — Canvas ─────────────────────────────────────────────── */}
        <section className="flex flex-1 flex-col overflow-hidden">

          {/* Tool bar */}
          {activePage && (
            <div className="flex items-center gap-2 border-b border-zinc-900 bg-[#0b0b0b] px-4 py-2 flex-wrap">
              <div className={`rounded-lg border px-2.5 py-1 text-[9px] font-bold ${TAG_COLORS[activePage.tag]}`}>
                {activePage.tag} · Pg {activePage.pageNumber}
              </div>
              <div className="h-4 w-px bg-zinc-800" />
              {relevantTools.map(t => (
                <button key={t.tool}
                  onClick={() => {
                    setActiveTool(a => a === t.tool ? "none" : t.tool);
                    if (t.tool === "setScale") setScaleModalOpen(true);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold transition ${
                    activeTool === t.tool
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-orange-500/40 hover:text-orange-300"}`}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-3">
                {activePage.scaleSet && (
                  <span className="text-[10px] font-mono text-emerald-400">✓ {activePage.scaleLabel}</span>
                )}
                <button onClick={() => setScaleModalOpen(true)}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-[10px] font-bold text-zinc-500 hover:border-orange-500/30 hover:text-orange-300">
                  {activePage.scaleSet ? "Edit Scale" : "Set Scale"}
                </button>
              </div>
            </div>
          )}

          {/* Page canvas */}
          <div className="relative flex-1 overflow-auto bg-zinc-950 flex items-start justify-center p-4"
            onClick={() => setShowTagMenu(null)}>
            {!activePage && !loading && (
              <div className="flex h-full w-full items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="text-4xl opacity-20">📐</div>
                  <p className="text-xs text-zinc-600">Upload a PDF to begin</p>
                </div>
              </div>
            )}

            {activePage && fullPageUrl && (
              <div className="relative">
                <img src={fullPageUrl} alt={`Page ${activePage.pageNumber}`}
                  className="max-w-full rounded-lg shadow-2xl border border-zinc-800"
                  style={{ maxHeight: "calc(100vh - 200px)" }} />

                {/* Tool overlays */}
                {activeTool === "traceWall" && (
                  <div className="absolute inset-0 border-2 border-dashed border-orange-500/60 rounded-lg pointer-events-none">
                    <div className="absolute top-2 left-2 rounded bg-orange-500/20 border border-orange-500/40 px-2 py-1 text-[9px] font-bold text-orange-300">
                      ✏ Trace Mode — click to place points · double-click to close
                    </div>
                  </div>
                )}
                {activeTool === "setHeight" && (
                  <div className="absolute inset-0 border-2 border-dashed border-blue-500/60 rounded-lg pointer-events-none">
                    <div className="absolute top-2 left-2 rounded bg-blue-500/20 border border-blue-500/40 px-2 py-1 text-[9px] font-bold text-blue-300">
                      ↕ Height Mode — click on elevation line to annotate
                    </div>
                  </div>
                )}
                {activeTool === "drawSection" && (
                  <div className="absolute inset-0 border-2 border-dashed border-emerald-500/60 rounded-lg pointer-events-none">
                    <div className="absolute top-2 left-2 rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-[9px] font-bold text-emerald-300">
                      ⊘ Section Mode — click to draw section cut line
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <aside className="flex w-[180px] flex-shrink-0 flex-col gap-4 border-l border-zinc-900 bg-[#080604] p-4">
          {activePage && (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">Active Page</p>
                <div className="space-y-2">
                  <InfoRow label="Page"   value={`${activePage.pageNumber}`} />
                  <InfoRow label="Type"   value={activePage.tag} />
                  <InfoRow label="Scale"  value={activePage.scaleLabel} highlight={activePage.scaleSet} />
                </div>
              </div>
              <div className="h-px bg-zinc-900" />
            </>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">Library</p>
            <div className="space-y-1.5">
              {(["Floor Plan", "Elevation View", "Section View"] as PageTag[]).map(tag => {
                const count = pages.filter(p => p.tag === tag).length;
                const ready = pages.filter(p => p.tag === tag && p.scaleSet).length;
                return (
                  <div key={tag} className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-600 truncate">{tag.split(" ")[0]}</span>
                    <span className={`font-mono font-bold ${count > 0 ? (ready === count ? "text-emerald-300" : "text-orange-300") : "text-zinc-700"}`}>
                      {ready}/{count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-zinc-900" />

          <div className="space-y-2 mt-auto">
            <a href="/set-scaffold"
              className="block rounded-xl bg-orange-500 px-3 py-2.5 text-center text-xs font-bold text-black hover:bg-orange-400">
              Set Scaffold →
            </a>
            <a href="/takeoff-workspace"
              className="block rounded-xl border border-zinc-800 px-3 py-2.5 text-center text-xs font-bold text-zinc-400 hover:border-orange-500/30 hover:text-orange-300">
              Standard Takeoff
            </a>
          </div>
        </aside>
      </div>

      {/* Scale modal */}
      {scaleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setScaleModalOpen(false)}>
          <div className="w-[360px] rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400 mb-1">Set Scale</p>
            {activePage && (
              <p className="text-[11px] text-zinc-500 mb-4">{activePage.tag} · Page {activePage.pageNumber}</p>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {[`1/8" = 1'`, `1/4" = 1'`, `3/8" = 1'`, `1/2" = 1'`, `3/4" = 1'`, `1" = 1'`].map(s => (
                <button key={s} onClick={() => setScaleInput(s)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                    scaleInput === s
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-orange-500/40"}`}>
                  {s}
                </button>
              ))}
            </div>
            <input type="text" placeholder="Custom scale" value={scaleInput}
              onChange={e => setScaleInput(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-mono text-orange-300 outline-none focus:border-orange-500 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setScaleModalOpen(false)}
                className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-400 hover:border-zinc-600">
                Cancel
              </button>
              <button onClick={saveScale}
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-xs font-bold text-black hover:bg-orange-400">
                Save Scale
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function InfoRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-zinc-600">{label}</span>
      <span className={`font-mono font-bold truncate ml-2 ${highlight ? "text-emerald-300" : "text-zinc-400"}`}>{value}</span>
    </div>
  );
}
