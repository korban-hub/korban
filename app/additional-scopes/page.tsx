"use client";

import { useMemo, useState } from "react";

const addAlternateItems = [
  "Netting",
  "Toe Boards",
  "Pedestrian Canopy",
  "Stair Towers",
];

const breakOutAreas = [
  "Soffit Coverage",
  "Roof Fall Protection",
  "Balcony Decks",
  "Cantilever Adjacent",
  "Dance Floor Deck",
  "Courtyard Stocking",
  "Add Plywood at Canopy Top",
  "Roof Access Platform",
  "Loading Platform",
];

type EntryData = {
  quantity: string;
  laborAllowance: string;
  costAllowance: string;
  notes: string;
};

export default function AdditionalAlternateScopesPage() {
  const [selectedAddItems, setSelectedAddItems] = useState<string[]>([]);
  const [selectedBreakOutAreas, setSelectedBreakOutAreas] = useState<string[]>(
    []
  );

  const [entryData, setEntryData] = useState<Record<string, EntryData>>({});

  function toggleItem(
    item: string,
    selectedList: string[],
    setSelectedList: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setSelectedList((current) =>
      current.includes(item)
        ? current.filter((selected) => selected !== item)
        : [...current, item]
    );
  }

  function updateEntry(item: string, field: keyof EntryData, value: string) {
    setEntryData((current) => ({
      ...current,
      [item]: {
        quantity: current[item]?.quantity || "",
        laborAllowance: current[item]?.laborAllowance || "",
        costAllowance: current[item]?.costAllowance || "",
        notes: current[item]?.notes || "",
        [field]: value,
      },
    }));
  }

  const selectedItems = [...selectedAddItems, ...selectedBreakOutAreas];

  const totalCostAllowance = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      return sum + Number(entryData[item]?.costAllowance || 0);
    }, 0);
  }, [selectedItems, entryData]);

  const totalLaborAllowance = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      return sum + Number(entryData[item]?.laborAllowance || 0);
    }, 0);
  }, [selectedItems, entryData]);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <header className="flex h-16 items-center justify-between border-b border-orange-500/20 bg-black px-6">
        <div>
          <h1 className="text-xl font-bold tracking-[0.35em] text-orange-500">
            KORBAN
          </h1>

          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">
            Additional / Alternate Scopes
          </p>
        </div>

        <button className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-orange-400">
          Save Scopes
        </button>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-[340px_minmax(0,1fr)_340px]">
        <aside className="overflow-y-auto border-r border-orange-500/20 bg-[#0a0a0a] p-5">
          <div className="rounded-3xl border border-orange-500/20 bg-black p-5">
            <h2 className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Scope Categories
            </h2>

            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Toggle only the added items or break-out areas needed outside the
              primary exterior scaffold takeoff.
            </p>
          </div>

          <section className="mt-6">
            <h3 className="text-xs uppercase tracking-[0.25em] text-neutral-500">
              1. Add / Alternate Items
            </h3>

            <div className="mt-4 space-y-3">
              {addAlternateItems.map((item) => {
                const active = selectedAddItems.includes(item);

                return (
                  <button
                    key={item}
                    onClick={() =>
                      toggleItem(item, selectedAddItems, setSelectedAddItems)
                    }
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                        : "border-neutral-900 bg-black text-neutral-400 hover:border-orange-500/20"
                    }`}
                  >
                    <p className="text-sm font-semibold">{item}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {active ? "Included in estimate" : "Not included"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-xs uppercase tracking-[0.25em] text-neutral-500">
              2. Break-Out Areas
            </h3>

            <div className="mt-4 space-y-3">
              {breakOutAreas.map((area) => {
                const active = selectedBreakOutAreas.includes(area);

                return (
                  <button
                    key={area}
                    onClick={() =>
                      toggleItem(
                        area,
                        selectedBreakOutAreas,
                        setSelectedBreakOutAreas
                      )
                    }
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                        : "border-neutral-900 bg-black text-neutral-400 hover:border-orange-500/20"
                    }`}
                  >
                    <p className="text-sm font-semibold">{area}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {active ? "Break-out included" : "Separate scope area"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="overflow-y-auto p-8">
          <div className="rounded-[32px] border border-neutral-800 bg-[#0d0d0d] p-8 shadow-[inset_0_0_80px_rgba(249,115,22,0.04)]">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold">
                  Additional / Alternate Scopes
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Add accessory items, alternates, and break-out scaffold areas
                  that sit outside the primary exterior takeoff. These items can
                  support bid alternates, scope clarification, and project
                  manager handoff if the job is awarded.
                </p>
              </div>

              <div className="min-w-[260px] rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-300">
                  Current Base Bid Estimate
                </p>

                <h3 className="mt-3 font-mono text-4xl font-bold text-orange-500">
                  $0
                </h3>

                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  Current project estimate before additional / alternate scopes.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-8">
              <ScopeEditorSection
                title="1. Add / Alternate Items"
                subtitle="Simple adders or alternate items that may be included, excluded, or priced separately."
                selectedItems={selectedAddItems}
                entryData={entryData}
                updateEntry={updateEntry}
              />

              <ScopeEditorSection
                title="2. Break-Out Areas"
                subtitle="Separate scaffold work areas that may require their own material, labor, notes, or mobilization planning."
                selectedItems={selectedBreakOutAreas}
                entryData={entryData}
                updateEntry={updateEntry}
              />
            </div>
          </div>
        </section>

        <aside className="overflow-y-auto border-l border-orange-500/20 bg-[#0a0a0a] p-5">
          <h2 className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Scope Summary
          </h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                Add / Alternate Items
              </p>

              <h3 className="mt-4 font-mono text-5xl font-bold text-orange-500">
                {selectedAddItems.length}
              </h3>
            </div>

            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                Break-Out Areas
              </p>

              <h3 className="mt-4 font-mono text-5xl font-bold text-orange-500">
                {selectedBreakOutAreas.length}
              </h3>
            </div>

            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                Labor Allowance
              </p>

              <h3 className="mt-4 font-mono text-4xl font-bold text-orange-500">
                {totalLaborAllowance.toLocaleString()} hrs
              </h3>
            </div>

            <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-orange-300">
                Additional / Alternate Total
              </p>

              <h3 className="mt-4 font-mono text-5xl font-bold text-orange-500">
                ${totalCostAllowance.toLocaleString()}
              </h3>
            </div>

            <div className="rounded-3xl border border-neutral-900 bg-black p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                PM Handoff Note
              </p>

              <p className="mt-4 text-sm leading-6 text-neutral-500">
                Selected adders and break-out areas should be stored with the
                project and tied back to mobilizations if the job is awarded.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ScopeEditorSection({
  title,
  subtitle,
  selectedItems,
  entryData,
  updateEntry,
}: {
  title: string;
  subtitle: string;
  selectedItems: string[];
  entryData: Record<string, EntryData>;
  updateEntry: (item: string, field: keyof EntryData, value: string) => void;
}) {
  return (
    <section>
      <div className="border-b border-neutral-900 pb-4">
        <h3 className="text-lg font-semibold text-orange-400">{title}</h3>

        <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
      </div>

      <div className="mt-5 space-y-4">
        {selectedItems.length === 0 ? (
          <div className="rounded-3xl border border-neutral-900 bg-black p-8 text-center">
            <p className="text-sm text-neutral-500">
              No selections made in this section.
            </p>
          </div>
        ) : (
          selectedItems.map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-neutral-900 bg-black p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-orange-400">
                    {item}
                  </h4>

                  <p className="mt-1 text-xs text-neutral-600">
                    Add allowance, labor, quantity, and notes.
                  </p>
                </div>

                <div className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
                  Included
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                    Quantity
                  </label>

                  <input
                    value={entryData[item]?.quantity || ""}
                    onChange={(event) =>
                      updateEntry(item, "quantity", event.target.value)
                    }
                    placeholder="Qty"
                    className="mt-2 w-full rounded-2xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                    Labor Hrs
                  </label>

                  <input
                    value={entryData[item]?.laborAllowance || ""}
                    onChange={(event) =>
                      updateEntry(item, "laborAllowance", event.target.value)
                    }
                    placeholder="0"
                    className="mt-2 w-full rounded-2xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-neutral-600">
                    Cost Allowance
                  </label>

                  <input
                    value={entryData[item]?.costAllowance || ""}
                    onChange={(event) =>
                      updateEntry(item, "costAllowance", event.target.value)
                    }
                    placeholder="$0"
                    className="mt-2 w-full rounded-2xl border border-neutral-800 bg-[#050505] px-4 py-3 text-sm outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <textarea
                value={entryData[item]?.notes || ""}
                onChange={(event) =>
                  updateEntry(item, "notes", event.target.value)
                }
                placeholder="Notes, exclusions, assumptions, bid alternate language..."
                className="mt-4 h-24 w-full resize-none rounded-2xl border border-neutral-800 bg-[#050505] p-4 text-sm outline-none focus:border-orange-500"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}