"use client";

import { useMemo, useState } from "react";

const projectConditions = [
  "Bad Access Areas",
  "Adjacent Properties",
  "Grade Changes",
  "Gabled Walls",
  "Setbacks / Pop-Outs",
  "Free-Stand",
];

const finishOptions = ["Stucco", "EIFS", "Brick", "Siding", "CMU", "Concrete", "Other"];
const mainSteps = ["Upload PDF", "Scale", "Overlay"];
const draftSteps = ["Draft", "Select Section", "Draft Section"];
const productionOptions = ["Competitive", "Average", "Conservative"];

export default function Home() {
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>(["Stucco"]);
  const [activeStep, setActiveStep] = useState("Upload PDF");
  const [scaffoldWidth, setScaffoldWidth] = useState("3'");
  const [production, setProduction] = useState("Average");
  const [showFrameConfiguration, setShowFrameConfiguration] = useState(false);

  const draftMode = draftSteps.includes(activeStep);

  const dateTimeStamp = useMemo(() => {
    return new Date().toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  function toggleCondition(condition: string) {
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  }

  function toggleFinish(finish: string) {
    setSelectedFinishes((current) =>
      current.includes(finish)
        ? current.filter((item) => item !== finish)
        : [...current, finish]
    );
  }

  function activateStep(step: string) {
    setActiveStep(step);
  }

  function toggleFrameConfiguration() {
    setActiveStep("Frame Configuration");
    setShowFrameConfiguration((current) => !current);
  }

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-white">
      <header className="flex h-16 items-center justify-between border-b border-orange-500/20 bg-black px-6">
        <div>
          <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">
            KORBAN
          </h1>
          <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
            Scaffold Intelligence & Project Recommendations
          </p>
        </div>

        <div className="flex gap-2 text-xs">
          <button title="Save" className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300">💾</button>
          <button title="Print" className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300">🖨</button>
          <button title="Share" className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300">📤</button>
        </div>
      </header>

      <div
        className={`grid h-[calc(100vh-64px)] ${
          draftMode
            ? "grid-cols-[15%_48%_10%_17%_10%]"
            : "grid-cols-[15%_58%_17%_10%]"
        }`}
      >
        <aside className="overflow-y-auto border-r border-orange-500/20 bg-[#090909] p-4">
          <section className="mb-6 rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-orange-400">
              Project
            </h2>

            {["Project Name", "Location", "Estimate #", "Customer", "Estimator"].map(
              (label) => (
                <div key={label} className="mb-3">
                  <label className="mb-1 block text-[11px] text-zinc-500">
                    {label}
                  </label>
                  <input className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500" />
                </div>
              )
            )}
          </section>

          <section className="mb-6 rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-orange-400">
              Standards
            </h2>

            <div className="space-y-4 text-xs text-zinc-400">
              <div>
                <label className="mb-2 block text-[11px] text-zinc-500">
                  Exterior Finish
                </label>
                <div className="flex flex-wrap gap-2">
                  {finishOptions.map((finish) => {
                    const selected = selectedFinishes.includes(finish);
                    return (
                      <button
                        key={finish}
                        onClick={() => toggleFinish(finish)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                          selected
                            ? "border-orange-500 bg-orange-500 text-black"
                            : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-orange-500/50"
                        }`}
                      >
                        {finish}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-zinc-500">
                  Scaffold Width
                </label>
                <select
                  value={scaffoldWidth}
                  onChange={(e) => setScaffoldWidth(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs outline-none focus:border-orange-500"
                >
                  <option>3&apos;</option>
                  <option>3&apos;6&quot;</option>
                  <option>5&apos;</option>
                </select>
              </div>

              <div className="border-t border-zinc-800 pt-3 text-zinc-600">
                <p>Scaffold Height</p>
                <p>Bay Length: 10&apos;</p>
                <p>Top Deck Offset: 6&apos;</p>
                <p>Plank Type: Wood</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em]">
                  Backend Defaults
                </p>
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-orange-400">
              Production
            </h2>

            <div className="grid gap-2">
              {productionOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setProduction(item)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    production === item
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-orange-500/40"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-black p-4">
            <h2 className="mb-4 text-xs uppercase tracking-[0.25em] text-orange-400">
              System
            </h2>

            {["Settings", "Help", "Backend Options"].map((item) => (
              <button
                key={item}
                className="mb-2 w-full rounded-lg border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-300 hover:border-orange-500/40"
              >
                {item}
              </button>
            ))}
          </section>
        </aside>

        <section className="overflow-y-auto bg-[#0c0c0c] p-5">
          <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 shadow-[0_0_35px_rgba(249,115,22,0.1)]">
            <p className="mb-3 text-left text-xs uppercase tracking-[0.28em] text-orange-400">
              Korban Flow
            </p>

            <div className="flex flex-nowrap items-center justify-start gap-1.5">
              {mainSteps.map((step) => (
                <button
                  key={step}
                  onClick={() => activateStep(step)}
                  className={`whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                    activeStep === step
                      ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                      : "border-orange-500/30 bg-black text-orange-300 hover:border-orange-500"
                  }`}
                >
                  {step}
                </button>
              ))}

              <div className="mx-1 h-8 w-px shrink-0 bg-orange-500/40" />

              <button
                onClick={toggleFrameConfiguration}
                className={`whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  showFrameConfiguration
                    ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                    : "border-orange-500/70 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                }`}
              >
                Frame Configuration
              </button>

              <div className="mx-1 h-8 w-px shrink-0 bg-orange-500/40" />

              <button
                onClick={() => activateStep("Set Scaffold")}
                className={`whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  activeStep === "Set Scaffold"
                    ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                    : "border-orange-500/30 bg-black text-orange-300 hover:border-orange-500"
                }`}
              >
                Set Scaffold
              </button>

              <div className="mx-1 h-8 w-px shrink-0 bg-orange-500/30" />

              {draftSteps.map((step) => (
                <button
                  key={step}
                  onClick={() => activateStep(step)}
                  className={`whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-xs transition ${
                    activeStep === step
                      ? "border-orange-500 bg-orange-500 text-black shadow-[0_0_20px_rgba(249,115,22,0.35)]"
                      : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/60"
                  }`}
                >
                  {step}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex h-[calc(100vh-365px)] min-h-[500px] items-center justify-center overflow-hidden rounded-[28px] border border-zinc-800 bg-black shadow-[inset_0_0_80px_rgba(249,115,22,0.04)]">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#f97316_1px,transparent_1px),linear-gradient(to_bottom,#f97316_1px,transparent_1px)] bg-[size:38px_38px]" />

            <div className="relative z-10 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-orange-500/30 bg-orange-500/10 text-3xl text-orange-500">
                +
              </div>
              <h2 className="text-2xl font-semibold">Design Workspace</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                Upload plans, set scale, create overlays, establish elevations,
                identify scaffold conditions, and prepare draft sections.
              </p>
            </div>
          </div>

          {!showFrameConfiguration && (
            <div className="mt-5 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4">
              <h2 className="mb-1 text-xs uppercase tracking-[0.25em] text-orange-400">
                Project Coordination
              </h2>
              <p className="mb-4 text-xs text-zinc-500">Select all that apply.</p>

              <div className="flex flex-wrap gap-2">
                {projectConditions.map((condition) => {
                  const selected = selectedConditions.includes(condition);
                  return (
                    <button
                      key={condition}
                      onClick={() => toggleCondition(condition)}
                      className={`rounded-full border px-4 py-2 text-xs transition ${
                        selected
                          ? "border-orange-500 bg-orange-500 text-black"
                          : "border-zinc-700 bg-black text-zinc-300 hover:border-orange-500/50"
                      }`}
                    >
                      {condition}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showFrameConfiguration && (
            <div className="mt-5 rounded-2xl border border-orange-500/25 bg-black p-5 shadow-[0_0_35px_rgba(249,115,22,0.08)]">
              <h2 className="text-xl font-semibold text-orange-400">
                Frame Configuration
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Per scaffold leg configuration opens here after height and scaffold set are established.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-500">6&apos;4&quot; Frames</p>
                  <p className="mt-2 text-2xl font-bold text-orange-500">0</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-500">3&apos; / 5&apos; Frames</p>
                  <p className="mt-2 text-2xl font-bold text-orange-500">0</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-500">Jack Extension</p>
                  <p className="mt-2 text-2xl font-bold text-orange-500">0&quot;</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {draftMode && (
          <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#070707] p-3">
            <h2 className="mb-4 text-xs uppercase tracking-[0.22em] text-orange-400">
              Drafting
            </h2>

            {["Scaffold Parts", "Cloud Callouts", "Add Notes"].map((item) => (
              <button
                key={item}
                className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left text-xs text-zinc-300 hover:border-orange-500/40"
              >
                {item}
              </button>
            ))}
          </aside>
        )}

        <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#090909] p-4">
          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Estimate & Proposal</h2>
                <p className="mt-1 text-xs text-zinc-500">Live estimate builder</p>
              </div>
              <p className="text-right text-[10px] leading-4 text-zinc-600">
                {dateTimeStamp}
              </p>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <h3 className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-400">
              Project Scope
            </h3>
            <div className="space-y-2 text-xs text-zinc-400">
              <p>Lineal Footage: 0 LF</p>
              <p>Average Wall Height: 0&apos;</p>
              <p>Scaffold Width: {scaffoldWidth}</p>
              <p>
                Exterior Finish:{" "}
                {selectedFinishes.length > 0 ? selectedFinishes.join(", ") : "Not Selected"}
              </p>
              <p>Elevations Included: Pending</p>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <h3 className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-400">
              Materials
            </h3>
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex justify-between gap-3 border-b border-zinc-800 pb-1">
                <span>Frames: $0</span>
                <span className="text-zinc-600">0 qty</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-zinc-800 pb-1">
                <span>Planks: $0</span>
                <span className="text-zinc-600">0 qty</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Misc: $0</span>
                <span className="text-zinc-600">0 qty</span>
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-2xl border border-zinc-800 bg-black p-4">
            <h3 className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-400">
              Labor
            </h3>
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex justify-between gap-3 border-b border-zinc-800 pb-1">
                <span>Install: $0</span>
                <span className="text-zinc-600">0 hrs</span>
              </div>
              <div className="flex justify-between gap-3 border-b border-zinc-800 pb-1">
                <span>Dismantle: $0</span>
                <span className="text-zinc-600">0 hrs</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Travel: $0</span>
                <span className="text-zinc-600">0 trips</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-orange-300">
              Proposal Total
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Install & Dismantle Scaffold
            </p>
            <h2 className="mt-3 text-4xl font-bold text-orange-500">$0</h2>

            <p className="mt-5 text-xs uppercase tracking-[0.22em] text-orange-300">
              Monthly Rental
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-orange-500">
              $0 / month
            </h3>
          </section>
        </aside>

        <aside className="overflow-y-auto border-l border-orange-500/20 bg-gradient-to-b from-orange-500/15 via-black to-black p-3 shadow-[inset_0_0_45px_rgba(249,115,22,0.12)]">
          <h2 className="mb-4 text-xs uppercase tracking-[0.22em] text-orange-300">
            Intelligence
          </h2>

          <section className="mb-4 rounded-xl border border-orange-500/20 bg-black/70 p-3 shadow-[0_0_25px_rgba(249,115,22,0.08)]">
            <h3 className="mb-2 text-xs font-semibold text-zinc-300">
              Recommendations
            </h3>
            <p className="text-xs text-zinc-500">No active recommendations.</p>
          </section>

          <section className="mb-4 rounded-xl border border-orange-500/20 bg-black/70 p-3 shadow-[0_0_25px_rgba(249,115,22,0.08)]">
            <h3 className="mb-2 text-xs font-semibold text-zinc-300">
              Concerns
            </h3>

            {selectedConditions.length === 0 ? (
              <p className="text-xs text-zinc-500">No active concerns.</p>
            ) : (
              <div className="space-y-2">
                {selectedConditions.map((condition) => (
                  <div
                    key={condition}
                    className="rounded-lg border border-orange-500/25 bg-orange-500/10 p-2 text-xs text-orange-300"
                  >
                    {condition}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-orange-500/20 bg-black/70 p-3 shadow-[0_0_25px_rgba(249,115,22,0.08)]">
            <h3 className="mb-2 text-xs font-semibold text-zinc-300">Alerts</h3>
            <p className="text-xs text-zinc-500">No alerts detected.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}