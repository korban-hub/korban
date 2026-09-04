"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateQuantityEngine, planksPerBayForWidth } from "@/lib/projectStore";

/**
 * Quick Bid — no drawing. The estimator answers a short set of questions
 * and quantities build up live on the right. Ordered scope → size → site
 * → method, because each answer narrows the next.
 *
 * Deliberately not a stack of labelled boxes: choices are segmented
 * instrument-panel controls, numbers are mono with unit suffixes, and
 * groups are separated by hairlines rather than card chrome.
 */

type Structure = "building" | "tank";

type ElevKey = "north" | "south" | "east" | "west" | "special";

type Form = {
  placement: "exterior" | "interior";
  coverage: "full" | "partial";
  /** Which faces are in scope when coverage is partial. */
  faces: Record<Exclude<ElevKey,"special">, boolean>;
  /** Lineal footage entered per face. "special" covers a run that isn't a
   *  whole elevation — a single wall, a return, a section of one face. */
  lf: Record<ElevKey, string>;
  finish: string;
  lengthFt: string;
  heightFt: string;
  // Tank
  measureBy: "radius" | "circumference";
  tankInnerFt: string;
  floor: "flat" | "sloped";
  access: "manhole" | "door";
  // Site
  sidewalkFt: string;
  obstructions: "none" | "some" | "heavy";
  pedestrian: boolean;
  // Method
  erection: "tied" | "freestanding";
  widthFt: number;
  bayFt: number;
};

const BLANK: Form = {
  placement: "exterior", coverage: "full", finish: "",
  faces: { north: true, south: true, east: true, west: true },
  lf: { north: "", south: "", east: "", west: "", special: "" },
  lengthFt: "", heightFt: "",
  measureBy: "circumference", tankInnerFt: "", floor: "flat", access: "manhole",
  sidewalkFt: "", obstructions: "none", pedestrian: false,
  erection: "tied", widthFt: 3, bayFt: 10,
};

const FINISHES = ["Plaster / Stucco", "Paint", "Siding", "Metal Panel", "Masonry", "Roofing", "Inspection / Access"];

// ── Small building blocks ────────────────────────────────────────────────

function Group({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/8 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[#F97316]" style={{ fontFamily: "ui-monospace, monospace", fontSize: "10px" }}>{step}</span>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="min-w-[128px] flex-shrink-0">
        <p className="text-[12.5px] text-zinc-300">{label}</p>
        {hint && <p className="text-[10.5px] leading-tight text-zinc-600">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/12">
      {options.map((o, i) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-[11.5px] font-medium transition ${i > 0 ? "border-l border-white/12" : ""} ${
            value === o.v ? "bg-[#F97316] text-black" : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumField({ value, onChange, unit, placeholder }: {
  value: string; onChange: (v: string) => void; unit: string; placeholder?: string;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-white/12 bg-black/40 focus-within:border-[#F97316]/60">
      <input value={value} inputMode="decimal" placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="w-[92px] bg-transparent px-2.5 py-1.5 text-right text-[13px] text-orange-300 outline-none"
        style={{ fontFamily: "ui-monospace, monospace" }} />
      <span className="border-l border-white/10 px-2 py-1.5 text-[11px] text-zinc-500" style={{ fontFamily: "ui-monospace, monospace" }}>{unit}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function QuickBidForm() {
  const [structure, setStructure] = useState<Structure>("building");
  const [form, setForm] = useState<Form>(BLANK);
  const [thinking, setThinking] = useState(false);
  const firstRun = useRef(true);

  function set<K extends keyof Form>(key: K, v: Form[K]) {
    setForm(f => ({ ...f, [key]: v }));
  }

  // Korban "thinking" — a brief pulse that carries the change across to the
  // output side, so cause and effect are visible rather than instantaneous.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setThinking(true);
    const t = setTimeout(() => setThinking(false), 480);
    return () => clearTimeout(t);
  }, [form, structure]);

  const derived = useMemo(() => {
    const h = parseFloat(form.heightFt) || 0;
    let lf = 0;

    if (structure === "tank") {
      // A tank's run is its circumference. Radius is accepted because
      // that's often what's on the drawing.
      lf = parseFloat(form.lengthFt) || 0;
      if (form.measureBy === "radius") lf = 2 * Math.PI * lf;
      if (form.placement === "interior") {
        const inner = parseFloat(form.tankInnerFt) || 0;
        if (inner > 0) lf = form.measureBy === "radius" ? 2 * Math.PI * inner : inner;
      }
    } else if (form.coverage === "full") {
      lf = parseFloat(form.lengthFt) || 0;
    } else {
      // Partial: sum the faces actually in scope, plus any special run —
      // a wall that isn't a whole elevation.
      (["north","south","east","west"] as const).forEach(k => {
        if (form.faces[k]) lf += parseFloat(form.lf[k]) || 0;
      });
      lf += parseFloat(form.lf.special) || 0;
    }

    const q = calculateQuantityEngine({
      linearFeet: lf, wallHeight: h,
      standardBayLength: form.bayFt, scaffoldWidth: form.widthFt,
      frameHeight: 6.333, plankCountPerBay: 0, bracePattern: "Every Bay",
      wallOffset: 1, workerReachHeight: 6,
    });

    // Conditions worth flagging before anyone prices this.
    const flags: { tone: "warn" | "note"; text: string }[] = [];
    if (form.erection === "freestanding" && h > 0) {
      const ratio = h / Math.max(form.widthFt, 0.1);
      if (ratio > 4) flags.push({ tone: "warn", text: `Freestanding at ${ratio.toFixed(1)}:1 height-to-width — past the 4:1 rule. Needs outriggers or ballast.` });
    }
    if (form.pedestrian) flags.push({ tone: "note", text: "Pedestrian access below means a sidewalk shed — decking, netting, and lighting aren't in these counts yet." });
    if (form.obstructions === "heavy") flags.push({ tone: "note", text: "Heavy obstructions usually mean hand-cut bays and lost productivity. Worth a labor factor." });
    const sw = parseFloat(form.sidewalkFt) || 0;
    if (sw > 0 && sw < form.widthFt + 1) flags.push({ tone: "warn", text: `${sw}' sidewalk won't take a ${form.widthFt}' tower plus offset. Expect a permit or a narrower frame.` });
    if (structure === "tank" && form.floor === "sloped") flags.push({ tone: "note", text: "Sloped floor — screw jack range varies leg to leg. Base heights will need field adjustment." });
    if (h > 0 && lf > 0 && !form.finish) flags.push({ tone: "note", text: "No finish type set, so duration and deck count are unassumed." });

    return { lf: Math.round(lf * 10) / 10, h, q, flags, planks: planksPerBayForWidth(form.widthFt) };
  }, [form, structure]);

  const ready = derived.lf > 0 && derived.h > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Form ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ flexBasis: "70%" }}>
        <div className="max-w-[720px] px-6 py-5">
          {/* Structure sub-tabs */}
          <div className="mb-5 inline-flex overflow-hidden rounded-lg border border-white/12">
            {([{ v: "building", label: "Building" }, { v: "tank", label: "Tank" }] as { v: Structure; label: string }[]).map((o, i) => (
              <button key={o.v} onClick={() => setStructure(o.v)}
                className={`px-5 py-2 text-[12px] font-semibold transition ${i > 0 ? "border-l border-white/12" : ""} ${
                  structure === o.v ? "bg-white/[0.10] text-white" : "bg-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}>
                {o.label}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <Group step="01" title="Scope">
              <Row label="Scaffold placement">
                <Segmented value={form.placement} onChange={v => set("placement", v)}
                  options={[{ v: "exterior", label: "Exterior" }, { v: "interior", label: "Interior" }]} />
              </Row>
              <Row label="Coverage" hint={structure === "tank" ? "Whole shell or a section" : "Whole building or an area"}>
                <div className="space-y-2">
                  <Segmented value={form.coverage} onChange={v => set("coverage", v)}
                    options={[{ v: "full", label: structure === "tank" ? "Full shell" : "Full exterior" }, { v: "partial", label: "Partial area" }]} />
                  {structure === "building" && form.coverage === "partial" && (
                    <div className="flex flex-wrap gap-1.5">
                      {(["north","south","east","west"] as const).map(k => (
                        <button key={k} onClick={() => set("faces", { ...form.faces, [k]: !form.faces[k] })}
                          className={`rounded-lg border px-3 py-1 text-[11px] font-medium capitalize transition ${
                            form.faces[k] ? "border-[#F97316] bg-[#F97316]/15 text-orange-300" : "border-white/10 text-zinc-600 hover:border-white/25 hover:text-zinc-400"
                          }`}>
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Row>
              <Row label="Work being done" hint="Drives duration and deck requirements">
                <div className="flex flex-wrap gap-1.5">
                  {FINISHES.map(f => (
                    <button key={f} onClick={() => set("finish", form.finish === f ? "" : f)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                        form.finish === f ? "border-[#F97316] bg-[#F97316]/15 text-orange-300" : "border-white/10 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>
              </Row>
            </Group>

            <Group step="02" title="Dimensions">
              {structure === "tank" && (
                <Row label="Measured by">
                  <Segmented value={form.measureBy} onChange={v => set("measureBy", v)}
                    options={[{ v: "circumference", label: "Circumference" }, { v: "radius", label: "Radius" }]} />
                </Row>
              )}
              {(structure === "tank" || form.coverage === "full") ? (
                <Row label={structure === "tank"
                    ? (form.measureBy === "radius" ? "Outside radius" : "Outside circumference")
                    : "Building perimeter"}>
                  <NumField value={form.lengthFt} onChange={v => set("lengthFt", v)} unit="ft" placeholder="0" />
                </Row>
              ) : (
                <Row label="Lineal footage" hint="Per elevation in scope">
                  <div className="space-y-1.5">
                    {(["north","south","east","west"] as const).filter(k => form.faces[k]).map(k => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-12 text-[11.5px] capitalize text-zinc-400">{k}</span>
                        <NumField value={form.lf[k]} onChange={v => set("lf", { ...form.lf, [k]: v })} unit="ft" placeholder="0" />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 border-t border-white/8 pt-1.5">
                      <span className="w-12 text-[11.5px] text-zinc-400">Special</span>
                      <NumField value={form.lf.special} onChange={v => set("lf", { ...form.lf, special: v })} unit="ft" placeholder="0" />
                      <span className="text-[10.5px] text-zinc-600">a run that isn&apos;t a whole elevation</span>
                    </div>
                  </div>
                </Row>
              )}
              {structure === "tank" && form.placement === "interior" && (
                <Row label={form.measureBy === "radius" ? "Inside radius" : "Inside circumference"}>
                  <NumField value={form.tankInnerFt} onChange={v => set("tankInnerFt", v)} unit="ft" placeholder="0" />
                </Row>
              )}
              <Row label={structure === "tank" ? "Shell height" : (form.coverage === "full" ? "Building height" : "Wall / area height")}>
                <NumField value={form.heightFt} onChange={v => set("heightFt", v)} unit="ft" placeholder="0" />
              </Row>
              {structure === "tank" && (
                <Row label="Interior floor">
                  <Segmented value={form.floor} onChange={v => set("floor", v)}
                    options={[{ v: "flat", label: "Flat" }, { v: "sloped", label: "Sloped" }]} />
                </Row>
              )}
            </Group>

            <Group step="03" title="Site conditions">
              {structure === "tank" ? (
                <Row label="Access" hint="How material gets in">
                  <Segmented value={form.access} onChange={v => set("access", v)}
                    options={[{ v: "manhole", label: "Manhole" }, { v: "door", label: "Door" }]} />
                </Row>
              ) : (
                <Row label="Sidewalk width" hint="Leave blank if none">
                  <NumField value={form.sidewalkFt} onChange={v => set("sidewalkFt", v)} unit="ft" placeholder="0" />
                </Row>
              )}
              <Row label="Obstructions" hint="Trees, canopies, utilities">
                <Segmented value={form.obstructions} onChange={v => set("obstructions", v)}
                  options={[{ v: "none", label: "Clear" }, { v: "some", label: "Some" }, { v: "heavy", label: "Heavy" }]} />
              </Row>
              {structure === "building" && (
                <Row label="Pedestrian access" hint="Foot traffic passing beneath">
                  <Segmented value={form.pedestrian ? "yes" : "no"} onChange={v => set("pedestrian", v === "yes")}
                    options={[{ v: "no", label: "No" }, { v: "yes", label: "Yes" }]} />
                </Row>
              )}
            </Group>

            <Group step="04" title="Erection">
              <Row label="Attachment" hint="Tied to the structure or standing on its own">
                <Segmented value={form.erection} onChange={v => set("erection", v)}
                  options={[{ v: "tied", label: "Tie-in" }, { v: "freestanding", label: "Freestanding" }]} />
              </Row>
              <Row label="Frame width">
                <Segmented value={String(form.widthFt)} onChange={v => set("widthFt", parseFloat(v))}
                  options={[{ v: "3", label: "3'" }, { v: "3.5", label: `3'-6"` }, { v: "5", label: "5'" }]} />
              </Row>
              <Row label="Bay length">
                <Segmented value={String(form.bayFt)} onChange={v => set("bayFt", parseFloat(v))}
                  options={[{ v: "7", label: "7'" }, { v: "10", label: "10'" }]} />
              </Row>
            </Group>
          </div>
        </div>
      </div>

      {/* ── Output ───────────────────────────────────────────────────── */}
      <div className="relative flex flex-col border-l border-white/10 bg-black/30" style={{ flexBasis: "30%", minWidth: 300 }}>
        {/* Transmit pulse — carries the change across to this side */}
        <span aria-hidden
          className={`pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-[#F97316] to-transparent transition-opacity duration-300 ${thinking ? "opacity-100" : "opacity-0"}`} />

        <header className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <h2 className="flex-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Project Details</h2>
          {thinking && (
            <span className="flex items-center gap-1.5 text-[10px] text-[#F97316]">
              <span className="h-1 w-1 animate-pulse rounded-full bg-[#F97316]" />
              working
            </span>
          )}
        </header>

        <div className={`flex-1 overflow-y-auto transition-opacity duration-200 ${thinking ? "opacity-50" : "opacity-100"}`}>
          {!ready ? (
            <p className="px-4 py-4 text-[12px] leading-relaxed text-zinc-600">
              Give me a length and a height and I&apos;ll start filling this in.
            </p>
          ) : (
            <>
              {/* Frames and planks are what the estimate is built on, so they
                  lead. Everything else is supporting detail beneath. */}
              <div className="relative border-b border-[#F97316]/25 bg-[#F97316]/[0.06] px-4 py-4">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#F97316] shadow-[0_0_12px_2px_rgba(249,115,22,0.55)]" />
                <div className="flex items-baseline gap-5">
                  <div>
                    <p className="text-[28px] font-bold leading-none text-orange-300" style={{ fontFamily: "ui-monospace, monospace" }}>
                      {derived.q.frameCount.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-orange-500/80">Frames</p>
                  </div>
                  <div>
                    <p className="text-[28px] font-bold leading-none text-orange-300" style={{ fontFamily: "ui-monospace, monospace" }}>
                      {derived.q.plankCount.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-orange-500/80">Planks</p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <p className="text-[11.5px] text-zinc-500">
                  {derived.lf.toLocaleString()} LF at {derived.h}&apos; · {derived.q.frameTall} jumps · {derived.q.bayCount} bays · {derived.planks} planks per bay
                </p>

                <div className="mt-4 space-y-1">
                  {[
                    ["H Frame", derived.q.frameCount],
                    ["Wood Plank", derived.q.plankCount],
                    ["Cross Brace", derived.q.crossBraceCount],
                    ["Guard Rail", derived.q.guardrailCount],
                    ["Coupling Pin", derived.q.couplingPinCount],
                    ["Base Plate", derived.q.basePlateCount],
                    ["Screw Jack", derived.q.screwJackCount],
                  ].map(([label, qty]) => (
                    <div key={label as string} className="flex items-center justify-between border-b border-white/5 py-1">
                      <span className="text-[11.5px] text-zinc-400">{label}</span>
                      <span className="text-[12.5px] font-semibold text-zinc-100" style={{ fontFamily: "ui-monospace, monospace" }}>
                        {Number(qty).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {derived.q.frameMakeup.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold text-white">Frame Configuration</p>
                    <p className="text-[10px] text-zinc-600">frames per leg</p>
                    <p className="mt-1.5 text-[12.5px] text-zinc-300">
                      {derived.q.frameMakeup.map(p => `${p.qty} × ${p.label}`).join("  +  ")}
                      {derived.q.screwJackExtensionIn > 0.05 && `  +  ${derived.q.screwJackExtensionIn.toFixed(1)}" jack`}
                    </p>
                  </div>
                )}
              </div>

              {/* Korban's own read on the job — deliberately given more
                  presence than a footnote, because this is the part a
                  spreadsheet can't do. */}
              {derived.flags.length > 0 && (
                <div className="relative mx-4 mb-4 overflow-hidden rounded-xl border border-[#F97316]/35 bg-[#F97316]/[0.04] p-3.5">
                  <span aria-hidden
                    className="pointer-events-none absolute -left-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[#F97316]/20 blur-2xl"
                    style={{ animation: "korbanPulse 3.2s ease-in-out infinite" }} />
                  <div className="relative flex items-center gap-2">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F97316] opacity-70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F97316]" />
                    </span>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300">Be advised</p>
                  </div>
                  <div className="relative mt-2.5 space-y-2">
                    {derived.flags.map((f, i) => (
                      <p key={i} className={`text-[12px] leading-relaxed ${f.tone === "warn" ? "text-amber-200/90" : "text-zinc-300"}`}>
                        {f.text}
                      </p>
                    ))}
                  </div>
                  <style>{`@keyframes korbanPulse{0%,100%{opacity:.35;transform:translateY(-50%) scale(1)}50%{opacity:.7;transform:translateY(-50%) scale(1.25)}}`}</style>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
