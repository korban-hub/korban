// components/aerial-map-inner.tsx
// NOT a page — imported dynamically with ssr:false from the aerial page
"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import {
  getActiveElevation,
  getActiveProject,
  saveActiveElevation,
} from "@/lib/projectStore";

type TracePoint = { lat: number; lng: number };
type SearchResult = { short: string; full: string; lat: number; lng: number };

const menuLinks: KorbanMenuLink[] = [
  { href: "/takeoff-workspace-advanced", label: "Document Mode" },
  { href: "/takeoff-workspace",          label: "Standard Takeoff" },
  { href: "/set-scaffold",               label: "Set Scaffold" },
];

export default function AerialMapInner() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<any>(null);
  const traceLayerRef = useRef<any>(null);
  const markersRef    = useRef<any[]>([]);

  const [mapReady,      setMapReady]      = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [results,       setResults]       = useState<SearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [searched,      setSearched]      = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [traceMode,     setTraceMode]     = useState(false);
  const [tracePoints,   setTracePoints]   = useState<TracePoint[]>([]);
  const [traceClosed,   setTraceClosed]   = useState(false);
  const [perimeterFt,   setPerimeterFt]   = useState(0);
  const [stored,        setStored]        = useState(false);
  const [zoom,          setZoom]          = useState(18);
  const [projectName,   setProjectName]   = useState("");

  // Load project name on mount
  useEffect(() => {
    try { setProjectName(getActiveProject().projectName || ""); } catch {}
  }, []);

  // ── Init Leaflet ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = require("leaflet");

    // Fix bundler icon paths
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current, {
      center: [38.1041, -122.2566],
      zoom: 18,
      zoomControl: false,
    });

    // Satellite imagery — Esri World Imagery (free, no API key)
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri · Maxar", maxZoom: 21 }
    ).addTo(map);

    // Street names + labels on top
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri", maxZoom: 21 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.on("zoomend", () => setZoom(map.getZoom()));
    mapRef.current = map;
    setMapReady(true);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Click / dblclick handlers ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function onClick(e: any) {
      if (!traceMode || traceClosed) return;
      setTracePoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    }
    function onDblClick(e: any) {
      if (!traceMode) return;
      e.originalEvent?.preventDefault();
      setTracePoints(prev => {
        if (prev.length >= 3) { setTraceClosed(true); }
        return prev;
      });
    }

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    return () => { map.off("click", onClick); map.off("dblclick", onDblClick); };
  }, [traceMode, traceClosed]);

  // ── Redraw trace ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const L = require("leaflet");

    if (traceLayerRef.current) { map.removeLayer(traceLayerRef.current); traceLayerRef.current = null; }
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (tracePoints.length === 0) return;

    const lls = tracePoints.map(p => [p.lat, p.lng] as [number, number]);
    const layer = traceClosed
      ? L.polygon(lls,  { color: "#f97316", weight: 2.5, fillColor: "#f97316", fillOpacity: 0.14 })
      : L.polyline(lls, { color: "#f97316", weight: 2.5, dashArray: "5,5" });
    layer.addTo(map);
    traceLayerRef.current = layer;

    tracePoints.forEach((p, i) => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: i === 0 ? 7 : 4,
        color: "#f97316", fillColor: i === 0 ? "#fb923c" : "#f97316",
        fillOpacity: 1, weight: 1.5,
      }).addTo(map);
      markersRef.current.push(m);
    });

    if (tracePoints.length >= 2) {
      const pts = traceClosed ? [...tracePoints, tracePoints[0]] : tracePoints;
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++)
        total += haversineFeet(pts[i].lat, pts[i].lng, pts[i+1].lat, pts[i+1].lng);
      setPerimeterFt(Math.round(total));
    }
  }, [tracePoints, traceClosed]);

  // ── Address search ──────────────────────────────────────────────────────────
  async function search() {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearched(false); setResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(searchQuery)}&limit=6`,
        { headers: { "Accept-Language": "en", "User-Agent": "KorbanApp/1.0" } }
      );
      const data = await res.json();
      setResults((Array.isArray(data) ? data : []).map((d: any) => ({
        short: [d.address?.house_number, d.address?.road, d.address?.city ?? d.address?.town ?? d.address?.village].filter(Boolean).join(" ") || d.display_name.split(",")[0],
        full:  d.display_name.split(",").slice(0, 3).join(","),
        lat:   parseFloat(d.lat),
        lng:   parseFloat(d.lon),
      })));
    } catch (e) { console.error(e); }
    finally { setSearching(false); setSearched(true); }
  }

  function flyTo(r: SearchResult) {
    mapRef.current?.setView([r.lat, r.lng], 19);
    setLocationLabel(r.short);
    setResults([]); setSearched(false);
    setSearchQuery(r.short);
  }

  // ── Trace controls ──────────────────────────────────────────────────────────
  function startTrace() { setTraceMode(true); setStored(false); }

  function closeTrace() {
    if (tracePoints.length >= 3) setTraceClosed(true);
  }

  function clearTrace() {
    setTracePoints([]); setTraceClosed(false);
    setPerimeterFt(0); setTraceMode(false); setStored(false);
  }

  function undoLast() {
    if (traceClosed) { setTraceClosed(false); return; }
    setTracePoints(p => p.slice(0, -1));
  }

  // ── Store — save to projectStore then navigate to Set Scaffold ──────────────
  function storeTrace() {
    if (!traceClosed || tracePoints.length < 3) return;
    try {
      // If no project data exists yet, seed a base project first
      if (!localStorage.getItem('korbanProjectData_v1')) {
        const baseProject = {
          projectId: "KRB-260614-001",
          projectName: "Mare Island Apartments",
          projectAddress: "Mare Island, Vallejo, CA",
          customer: "Turner Construction",
          estimator: "H. Pierre",
          updatedAt: new Date().toISOString(),
          schemaVersion: 1,
          takeoff: {
            levels: [{
              levelId: "mare-island-main",
              levelName: "Main Level",
              elevations: [{
                elevationId: "north-elevation",
                elevationName: "North",
                levelName: "Main Level",
                linearFeet: 0,
                wallHeight: 45,
                phase: "Main",
                mobilization: "Base Bid",
                overlayGeometry: null,
                scale: null,
                scaffoldInput: { scaffoldWidth: 3, standardBayLength: 10, frameHeight: 6.333, plankCountPerBay: 3, bracePattern: "Every Bay", wallOffset: 1 },
                quantityEngine: { bayCount: 0, legCount: 0, jumps: 0, frameTall: 7, frameCount: 0, plankCount: 0, crossBraceCount: 0, guardrailCount: 0, basePlateCount: 0, screwJackCount: 0 },
                sectionView: { frameMakeup: "", selectedRun: "", wallOffset: 1, sectionType: "A-A" },
                elevationBreakdown: [],
              }]
            }]
          }
        };
        localStorage.setItem('korbanProjectData_v1', JSON.stringify({ "KRB-260614-001": baseProject }));
        localStorage.setItem('korbanActiveProjectId', "KRB-260614-001");
        localStorage.setItem('korbanActiveElevationId', "north-elevation");
      }
      const elevation = getActiveElevation();
      const svgScale  = 4; // 4 SVG units per foot

      // Convert lat/lng to SVG coordinates centered on bounding box
      const lats = tracePoints.map(p => p.lat);
      const lngs = tracePoints.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const cLat = (minLat + maxLat) / 2;
      const cLng = (minLng + maxLng) / 2;

      const svgPoints = tracePoints.map(p => ({
        x: Math.round(520 + haversineFeet(cLat, cLng, cLat, p.lng) * svgScale * (p.lng >= cLng ? 1 : -1)),
        y: Math.round(360 - haversineFeet(cLat, p.lat, cLat, cLng) * svgScale * (p.lat >= cLat ? 1 : -1)),
      }));

      const overlayGeometry = {
        elevationName:   elevation.elevationName,
        levelName:       elevation.levelName ?? "Main Level",
        tracedPerimeter: svgPoints,
        overlayPoints:   svgPoints,
        wallSegments:    [],
        referencePoints: [svgPoints[0]],
        elevationPoints: svgPoints,
        fullOverlayRows: [{
          id:          Date.now(),
          isKeyFloor:  true,
          overlayType: "Aerial",
          level:       "Key Floor",
          points:      svgPoints,
          closed:      true,
          linealFeet:  perimeterFt,
          color:       "#f97316",
          pageNumber:  1,
        }],
        elevationRefs:   elevation.overlayGeometry?.elevationRefs   ?? [],
        elevationHeights:elevation.overlayGeometry?.elevationHeights ?? [],
        scale:           { pageUnitsPerFoot: svgScale },
      };

      saveActiveElevation({
        ...elevation,
        linearFeet:      perimeterFt,
        overlayGeometry,
        scale:           { pageUnitsPerFoot: svgScale },
      });

      setStored(true);
      setTimeout(() => { window.location.href = "/set-scaffold"; }, 700);
    } catch (e) {
      console.error("Store failed:", e);
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Aerial Takeoff"
        subtitle={projectName ? `${projectName} · Satellite trace` : "Satellite trace · send to Set Scaffold"}
        menuLinks={menuLinks}
        actionsAlwaysVisible
        actions={
          <>
            <a href="/takeoff-workspace-advanced"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:border-orange-500/30">
              ← Takeoff Workspace
            </a>
            <a href="/set-scaffold"
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-orange-400">
              Set Scaffold →
            </a>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ──────────────────────────────────────────────────── */}
        <aside className="flex w-[260px] flex-shrink-0 flex-col border-r border-zinc-900 bg-[#080604] overflow-y-auto">

          {/* Search */}
          <div className="p-4 border-b border-zinc-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2.5">Search Address</p>
            <div className="flex gap-1.5">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="123 Main St, Vallejo CA"
                className="flex-1 min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-orange-500 placeholder:text-zinc-600"
              />
              <button onClick={search} disabled={searching}
                className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black hover:bg-orange-400 disabled:opacity-40">
                {searching ? "…" : "Go"}
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-2 rounded-xl border border-zinc-800 bg-black overflow-hidden">
                {results.map((r, i) => (
                  <button key={i} onClick={() => flyTo(r)}
                    className="w-full px-3 py-2.5 text-left border-b border-zinc-900 last:border-0 hover:bg-orange-500/8 transition">
                    <p className="text-[11px] font-semibold text-zinc-200 truncate">{r.short}</p>
                    <p className="text-[9px] text-zinc-600 truncate mt-0.5">{r.full}</p>
                  </button>
                ))}
              </div>
            )}
            {searched && results.length === 0 && (
              <p className="mt-2 text-[10px] text-zinc-600">No results — try adding city and state.</p>
            )}
          </div>

          {/* Location */}
          {locationLabel && (
            <div className="px-4 py-3 border-b border-zinc-900">
              <p className="text-[9px] uppercase tracking-[0.15em] text-zinc-600">Viewing</p>
              <p className="text-xs font-semibold text-orange-300 mt-1">{locationLabel}</p>
            </div>
          )}

          {/* Trace status */}
          {tracePoints.length > 0 && (
            <div className="px-4 py-3 border-b border-zinc-900 space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Points</span>
                <span className="font-mono font-bold text-zinc-300">{tracePoints.length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Closed</span>
                <span className={`font-mono font-bold ${traceClosed ? "text-emerald-300" : "text-zinc-600"}`}>
                  {traceClosed ? "Yes" : "No"}
                </span>
              </div>
              {perimeterFt > 0 && (
                <div className="flex justify-between text-[10px] pt-1.5 border-t border-zinc-900">
                  <span className="text-zinc-500">Perimeter</span>
                  <span className="font-mono font-bold text-orange-300">{perimeterFt.toLocaleString()} LF</span>
                </div>
              )}
            </div>
          )}

          {/* Map info */}
          <div className="px-4 py-3 border-b border-zinc-900">
            <p className="text-[9px] text-zinc-700">
              Zoom <span className="font-mono text-zinc-500">{zoom}</span>
              <span className="mx-1.5 text-zinc-800">·</span>
              Scroll to zoom · drag to pan
            </p>
          </div>

          {/* ── Trace action buttons — Start / Close / Store ─────────────── */}
          <div className="p-4 space-y-2 mt-auto">
            {/* Start */}
            <button
              onClick={startTrace}
              disabled={traceMode}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold border transition ${
                traceMode
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-300 cursor-default"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-orange-500/40 hover:text-white"}`}>
              {traceMode ? "● Tracing…" : "Start Trace"}
            </button>

            {/* Undo */}
            {traceMode && !traceClosed && tracePoints.length > 0 && (
              <button onClick={undoLast}
                className="w-full rounded-xl px-4 py-2 text-xs font-bold border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition">
                Undo Last Point
              </button>
            )}

            {/* Close */}
            <button
              onClick={closeTrace}
              disabled={!traceMode || tracePoints.length < 3 || traceClosed}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold border transition ${
                traceClosed
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 cursor-default"
                  : traceMode && tracePoints.length >= 3
                    ? "border-zinc-600 bg-zinc-900 text-zinc-200 hover:border-orange-500/40"
                    : "border-zinc-800 text-zinc-700 cursor-not-allowed"}`}>
              {traceClosed ? "✓ Shape Closed" : "Close Shape"}
            </button>

            {/* Store */}
            <button
              onClick={storeTrace}
              disabled={!traceClosed || stored}
              className={`w-full rounded-xl px-4 py-3 text-xs font-bold transition ${
                stored
                  ? "bg-emerald-500 text-black"
                  : traceClosed
                    ? "bg-orange-500 text-black hover:bg-orange-400"
                    : "border border-zinc-800 bg-zinc-900/40 text-zinc-600 cursor-not-allowed"}`}>
              {stored ? "✓ Stored — going to Set Scaffold…" : "Store & Go to Set Scaffold →"}
            </button>

            {/* Clear */}
            {tracePoints.length > 0 && (
              <button onClick={clearTrace}
                className="w-full rounded-xl px-4 py-2 text-xs font-bold border border-zinc-800 text-zinc-600 hover:border-red-500/30 hover:text-red-400 transition">
                Clear Trace
              </button>
            )}
          </div>
        </aside>

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <section className="relative flex-1">
          <div ref={containerRef} className="absolute inset-0" />

          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <p className="text-xs text-zinc-600">Loading satellite imagery…</p>
            </div>
          )}

          {/* HUD */}
          {traceMode && mapReady && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] rounded-full border border-orange-500/30 bg-[#080604]/90 backdrop-blur-sm px-5 py-2 text-[10px] font-semibold text-orange-300 pointer-events-none">
              {traceClosed
                ? `✓ ${tracePoints.length} points · ${perimeterFt.toLocaleString()} LF · click Store to save`
                : tracePoints.length === 0
                  ? "Click the rooftop edge to begin tracing"
                  : `${tracePoints.length} point${tracePoints.length !== 1 ? "s" : ""} placed · double-click or press Close to finish`}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ── Haversine distance in feet ─────────────────────────────────────────────────
function haversineFeet(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 20902231;
  const r = (d: number) => d * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
