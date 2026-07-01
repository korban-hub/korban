"use client";

import { useEffect, useRef, useState } from "react";
import { KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getActiveProject, saveActiveElevation, getActiveElevation } from "@/lib/projectStore";

type TracePoint = { lat: number; lng: number };
type SearchResult = { displayName: string; shortName: string; lat: number; lng: number; type: string };

const menuLinks: KorbanMenuLink[] = [
  { href: "/takeoff-workspace-advanced", label: "Document Mode" },
  { href: "/takeoff-workspace",          label: "Standard Takeoff" },
  { href: "/set-scaffold",               label: "Set Scaffold" },
];

export default function TakeoffWorkspaceAerialPage() {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapRef           = useRef<any>(null);
  const leafletRef       = useRef<any>(null);
  const traceLayerRef    = useRef<any>(null);
  const markersRef       = useRef<any[]>([]);

  const [mapReady,       setMapReady]       = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchResults,  setSearchResults]  = useState<SearchResult[]>([]);
  const [searching,      setSearching]      = useState(false);
  const [searched,       setSearched]       = useState(false);
  const [locationLabel,  setLocationLabel]  = useState("");
  const [traceMode,      setTraceMode]      = useState(false);
  const [tracePoints,    setTracePoints]    = useState<TracePoint[]>([]);
  const [traceClosed,    setTraceClosed]    = useState(false);
  const [perimeterFeet,  setPerimeterFeet]  = useState(0);
  const [saved,          setSaved]          = useState(false);
  const [zoom,           setZoom]           = useState(18);

  // ── Inject Leaflet CSS ──────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("leaflet-css")) return;
    const link = document.createElement("link");
    link.id = "leaflet-css"; link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }, []);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled) return;
      leafletRef.current = L;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current, {
        center: [38.1041, -122.2566],
        zoom: 18,
        zoomControl: false,
        // Enable map rotation via keyboard (shift+alt+drag built in to Leaflet.rotate if needed later)
      });

      // Satellite imagery — free, no API key
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri · Maxar", maxZoom: 21 }
      ).addTo(map);

      // Street names + labels on top
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri", maxZoom: 21, opacity: 1 }
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Rotate control — custom buttons
      const RotateControl = L.Control.extend({
        onAdd() {
          const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");
          div.style.cssText = "display:flex;flex-direction:column;gap:2px;";
          const btn = (label: string, title: string, fn: () => void) => {
            const b = L.DomUtil.create("a", "", div) as HTMLAnchorElement;
            b.innerHTML = label; b.title = title; b.href = "#";
            b.style.cssText = "display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:14px;background:#18181b;color:#f97316;border:1px solid #3f3f46;cursor:pointer;text-decoration:none;";
            L.DomEvent.on(b, "click", L.DomEvent.stop).on(b, "click", fn);
            return b;
          };
          btn("↺", "Rotate left 15°",  () => { const b = map.getBearing?.() ?? 0; map.setBearing?.(b - 15); });
          btn("↻", "Rotate right 15°", () => { const b = map.getBearing?.() ?? 0; map.setBearing?.(b + 15); });
          btn("⊕", "Reset rotation",   () => { map.setBearing?.(0); });
          return div;
        },
      });
      new RotateControl({ position: "bottomright" }).addTo(map);

      map.on("zoomend", () => setZoom(map.getZoom()));
      mapRef.current = map;
      setMapReady(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // ── Click/dblclick handlers for tracing ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    function onClick(e: any) {
      if (!traceMode || traceClosed) return;
      const { lat, lng } = e.latlng;
      setTracePoints(prev => [...prev, { lat, lng }]);
    }
    function onDblClick(e: any) {
      if (!traceMode || tracePoints.length < 3) return;
      L_stop(e);
      setTraceClosed(true);
    }
    function L_stop(e: any) { e.originalEvent?.preventDefault?.(); e.originalEvent?.stopPropagation?.(); }

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    return () => { map.off("click", onClick); map.off("dblclick", onDblClick); };
  }, [traceMode, traceClosed, tracePoints.length]);

  // ── Redraw trace overlay ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (traceLayerRef.current) { map.removeLayer(traceLayerRef.current); traceLayerRef.current = null; }
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (tracePoints.length === 0) return;

    const lls = tracePoints.map(p => [p.lat, p.lng] as [number, number]);
    const layer = traceClosed
      ? L.polygon(lls, { color: "#f97316", weight: 2.5, fillColor: "#f97316", fillOpacity: 0.14 })
      : L.polyline(lls, { color: "#f97316", weight: 2.5, dashArray: "5,5" });
    layer.addTo(map);
    traceLayerRef.current = layer;

    tracePoints.forEach((p, i) => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: i === 0 ? 6 : 4,
        color: i === 0 ? "#fb923c" : "#f97316",
        fillColor: i === 0 ? "#fb923c" : "#f97316",
        fillOpacity: 1, weight: 1.5,
      }).addTo(map);
      markersRef.current.push(m);
    });

    if (tracePoints.length >= 2) {
      const pts = traceClosed ? [...tracePoints, tracePoints[0]] : tracePoints;
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++)
        total += haversineFeet(pts[i].lat, pts[i].lng, pts[i+1].lat, pts[i+1].lng);
      setPerimeterFeet(Math.round(total));
    }
  }, [tracePoints, traceClosed]);

  // ── Address search — Nominatim returns full address details ────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearched(false); setSearchResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(searchQuery)}&limit=6`,
        { headers: { "Accept-Language": "en", "User-Agent": "KorbanApp/1.0" } }
      );
      const data = await res.json();
      setSearchResults(
        (Array.isArray(data) ? data : []).map((d: any) => ({
          displayName: d.display_name,
          shortName: [d.address?.house_number, d.address?.road, d.address?.city ?? d.address?.town ?? d.address?.village].filter(Boolean).join(" "),
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
          type: d.type ?? d.class ?? "",
        }))
      );
    } catch (e) { console.error(e); }
    finally { setSearching(false); setSearched(true); }
  }

  function flyToResult(r: SearchResult) {
    mapRef.current?.setView([r.lat, r.lng], 19);
    setLocationLabel(r.shortName || r.displayName.split(",").slice(0, 2).join(","));
    setSearchResults([]); setSearched(false);
    setSearchQuery(r.shortName || r.displayName.split(",")[0]);
  }

  function clearTrace() { setTracePoints([]); setTraceClosed(false); setPerimeterFeet(0); setSaved(false); }
  function undoLast() { if (traceClosed) { setTraceClosed(false); return; } setTracePoints(p => p.slice(0,-1)); }

  // ── Save to projectStore → navigate to Set Scaffold ────────────────────────
  function saveAndContinue() {
    if (!traceClosed || tracePoints.length < 3) return;
    try {
      const elevation = getActiveElevation();
      const svgScale = 4; // 4 SVG units per foot for set-scaffold canvas
      // Convert lat/lng trace to SVG coordinate space centered on the shape
      const lats = tracePoints.map(p => p.lat);
      const lngs = tracePoints.map(p => p.lng);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const svgPoints = tracePoints.map(p => ({
        x: Math.round(520 + haversineFeet(centerLat, centerLng, centerLat, p.lng) * svgScale * (p.lng > centerLng ? 1 : -1)),
        y: Math.round(360 - haversineFeet(centerLat, p.lat, centerLat, centerLng) * svgScale * (p.lat > centerLat ? 1 : -1)),
      }));

      const aerialOverlay = {
        elevationName: elevation.elevationName,
        levelName: elevation.levelName ?? "Main Level",
        tracedPerimeter: svgPoints,
        overlayPoints: svgPoints,
        wallSegments: [],
        referencePoints: [svgPoints[0]],
        elevationPoints: svgPoints,
        fullOverlayRows: [{
          id: Date.now(),
          isKeyFloor: true,
          overlayType: "Aerial",
          level: "Key Floor",
          points: svgPoints,
          closed: true,
          linealFeet: perimeterFeet,
          color: "#f97316",
          pageNumber: 1,
        }],
        elevationRefs: [],
        elevationHeights: elevation.overlayGeometry?.elevationHeights ?? [],
        scale: { pageUnitsPerFoot: svgScale },
      };

      saveActiveElevation({
        ...elevation,
        linearFeet: perimeterFeet,
        overlayGeometry: aerialOverlay,
        scale: { pageUnitsPerFoot: svgScale },
      });

      setSaved(true);
      setTimeout(() => { window.location.href = "/set-scaffold"; }, 600);
    } catch (e) {
      console.error("Save failed:", e);
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#080604] text-white">
      <KorbanHeader
        title="Aerial Takeoff"
        subtitle="Search any address · trace the building footprint · send to Set Scaffold"
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
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="123 Main St, Vallejo CA"
                className="flex-1 min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-orange-500 placeholder:text-zinc-600"
              />
              <button onClick={handleSearch} disabled={searching}
                className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black hover:bg-orange-400 disabled:opacity-40 shrink-0">
                {searching ? "…" : "Go"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 rounded-xl border border-zinc-800 bg-black overflow-hidden">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => flyToResult(r)}
                    className="w-full px-3 py-2.5 text-left border-b border-zinc-900 last:border-0 hover:bg-orange-500/8 transition">
                    <p className="text-[11px] font-semibold text-zinc-200 truncate">
                      {r.shortName || r.displayName.split(",")[0]}
                    </p>
                    <p className="text-[9px] text-zinc-600 truncate mt-0.5">
                      {r.displayName.split(",").slice(1, 3).join(",")}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {searched && searchResults.length === 0 && (
              <p className="mt-2 text-[10px] text-zinc-600">No results — try including city and state.</p>
            )}
          </div>

          {locationLabel && (
            <div className="px-4 py-3 border-b border-zinc-900">
              <p className="text-[9px] uppercase tracking-[0.15em] text-zinc-600">Viewing</p>
              <p className="text-xs font-semibold text-orange-300 mt-1">{locationLabel}</p>
            </div>
          )}

          {/* Trace */}
          <div className="p-4 border-b border-zinc-900">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2.5">Trace Building</p>

            <button
              onClick={() => { setTraceMode(m => !m); if (traceMode) clearTrace(); }}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                traceMode
                  ? "bg-orange-500 text-black"
                  : "border border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-orange-500/40 hover:text-white"}`}>
              {traceMode ? "✓ Tracing Active" : "Start Tracing"}
            </button>

            {traceMode && (
              <div className="mt-3 space-y-2">
                <p className="text-[9px] text-zinc-600 leading-relaxed">
                  Click to place points along the rooftop perimeter. Double-click to close.
                </p>
                <div className="flex gap-1.5">
                  <button onClick={undoLast}
                    className="flex-1 rounded-lg border border-zinc-800 py-1.5 text-[10px] font-bold text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition">
                    Undo
                  </button>
                  <button onClick={clearTrace}
                    className="flex-1 rounded-lg border border-zinc-800 py-1.5 text-[10px] font-bold text-zinc-500 hover:border-red-500/40 hover:text-red-400 transition">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Trace summary */}
          {tracePoints.length > 0 && (
            <div className="px-4 py-3 border-b border-zinc-900 space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Points placed</span>
                <span className="font-mono font-bold text-zinc-300">{tracePoints.length}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Shape closed</span>
                <span className={`font-mono font-bold ${traceClosed ? "text-emerald-300" : "text-zinc-600"}`}>
                  {traceClosed ? "Yes" : "No"}
                </span>
              </div>
              {perimeterFeet > 0 && (
                <div className="flex justify-between text-[10px] pt-1.5 border-t border-zinc-900">
                  <span className="text-zinc-500">Perimeter</span>
                  <span className="font-mono font-bold text-orange-300">{perimeterFeet.toLocaleString()} LF</span>
                </div>
              )}
            </div>
          )}

          {/* Map info */}
          <div className="px-4 py-3 border-b border-zinc-900">
            <p className="text-[9px] text-zinc-700">
              Zoom <span className="font-mono text-zinc-500">{zoom}</span>
              <span className="mx-1.5">·</span>
              Use <span className="text-zinc-500">Shift+drag</span> to rotate map
            </p>
          </div>

          {/* Save */}
          <div className="p-4 mt-auto">
            <button
              onClick={saveAndContinue}
              disabled={!traceClosed || saved}
              className={`w-full rounded-xl px-4 py-3 text-xs font-bold transition ${
                saved
                  ? "bg-emerald-500 text-black"
                  : traceClosed
                    ? "bg-orange-500 text-black hover:bg-orange-400"
                    : "border border-zinc-800 bg-zinc-900/40 text-zinc-600 cursor-not-allowed"}`}>
              {saved ? "✓ Saved — going to Set Scaffold…" : traceClosed ? "Save & Go to Set Scaffold →" : "Trace building to continue"}
            </button>
          </div>
        </aside>

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <section className="relative flex-1">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <p className="text-xs text-zinc-600">Loading satellite imagery…</p>
            </div>
          )}

          {traceMode && mapReady && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] rounded-full border border-orange-500/30 bg-[#080604]/90 backdrop-blur-sm px-4 py-1.5 text-[10px] font-semibold text-orange-300">
              {traceClosed ? "Shape closed · Save when ready" : tracePoints.length === 0 ? "Click the rooftop to begin" : `${tracePoints.length} point${tracePoints.length !== 1 ? "s" : ""} · double-click to close`}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function haversineFeet(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 20902231;
  const r = (d: number) => d * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
