"use client";

/**
 * Contacts - the people behind the bids.
 *
 * Customers, GCs, suppliers and crew. Adding a contact here means it can be
 * pulled onto a proposal instead of retyped, and past-job counts come from the
 * bid log rather than being kept by hand.
 *
 * Contacts live in their own localStorage record, the same way projects and
 * settings do, so nothing here depends on a page staying open.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { listProjects } from "@/lib/projectStore";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/projects", label: "Bid Log" },
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/backend", label: "Backend" },
];

const CONTACTS_KEY = "korban.contacts.v1";

type ContactKind = "Customer" | "General Contractor" | "Supplier" | "Crew" | "Other";

const KINDS: ContactKind[] = ["Customer", "General Contractor", "Supplier", "Crew", "Other"];

type Contact = {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  kind: ContactKind;
  notes: string;
};

function loadContacts(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    // Not being able to persist contacts is not worth an error.
  }
}

export default function ContactsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<ContactKind | "All">("All");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setContacts(loadContacts());
    try {
      // Company names on real bids. Used to count past jobs honestly.
      setCompanies(
        listProjects()
          .flatMap((project) => [project.customer, project.generalContractor])
          .filter(Boolean)
      );
    } catch {
      setCompanies([]);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  function commit(next: Contact[]) {
    setContacts(next);
    saveContacts(next);
  }

  function addContact() {
    const contact: Contact = {
      id: `c-${Date.now().toString(36)}`,
      name: "",
      company: "",
      role: "",
      email: "",
      phone: "",
      kind: "Customer",
      notes: "",
    };
    commit([contact, ...contacts]);
    setSelected(contact.id);
  }

  function update(id: string, patch: Partial<Contact>) {
    commit(contacts.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function remove(contact: Contact) {
    const sure = window.confirm(`Remove ${contact.name || "this contact"}?`);
    if (!sure) return;
    commit(contacts.filter((row) => row.id !== contact.id));
    if (selected === contact.id) setSelected(null);
  }

  /** How many bids carry this contact's company. Counted, not stored. */
  function pastJobs(company: string) {
    if (!company.trim()) return 0;
    return companies.filter((row) => row.toLowerCase() === company.toLowerCase()).length;
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (kindFilter !== "All" && contact.kind !== kindFilter) return false;
      if (!term) return true;
      return [contact.name, contact.company, contact.role, contact.email, contact.phone]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [contacts, search, kindFilter]);

  const active = contacts.find((contact) => contact.id === selected) ?? null;

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening contacts...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanMotionStyles />

      <KorbanHeader
        title="Contacts"
        subtitle="Customers, GCs, suppliers and crew - the people behind the bids."
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <div className="rounded-lg border border-zinc-800 bg-korban-raised px-3.5 py-1.5 text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">People</p>
              <p className="font-mono text-[14px] font-bold leading-tight text-zinc-200">
                {contacts.length}
              </p>
            </div>
            <KorbanButton variant="ghost" onClick={() => router.push("/dashboard")}>
              Bid Room
            </KorbanButton>
            <KorbanButton variant="primary" onClick={addContact}>
              + Add contact
            </KorbanButton>
          </>
        }
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, company, role, email"
                className="min-w-[220px] flex-1 rounded-lg border border-zinc-800 bg-korban-raised px-3 py-2 text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
              />
              <div className="flex flex-wrap gap-1">
                {(["All", ...KINDS] as (ContactKind | "All")[]).map((kind) => {
                  const count =
                    kind === "All"
                      ? contacts.length
                      : contacts.filter((contact) => contact.kind === kind).length;
                  if (kind !== "All" && count === 0) return null;
                  return (
                    <button
                      key={kind}
                      onClick={() => setKindFilter(kind)}
                      className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition ${
                        kindFilter === kind
                          ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                          : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      {kind}
                      <span className="ml-1.5 text-zinc-600">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Panel
              title="Address book"
              right={
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                  {rows.length} shown
                </span>
              }
            >
              {rows.length === 0 ? (
                <div className="px-1 py-6 text-center">
                  <p className="text-[12px] text-zinc-400">
                    {contacts.length === 0 ? "No contacts yet." : "Nothing matches that."}
                  </p>
                  <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-[1.6] text-zinc-600">
                    {contacts.length === 0
                      ? "Add the people you bid to. Once they are here, a proposal can pull their details instead of you retyping them."
                      : "Try a different search, or clear the filter."}
                  </p>
                  {contacts.length === 0 && (
                    <button
                      onClick={addContact}
                      className="mt-3 rounded bg-orange-500 px-4 py-1.5 font-mono text-[10px] font-bold text-black transition hover:bg-orange-400"
                    >
                      + Add contact
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_150px_128px_110px_54px_24px] gap-3 px-1 pb-1">
                    {["Name", "Company", "Email", "Phone", "Jobs", ""].map((heading) => (
                      <span
                        key={heading}
                        className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600"
                      >
                        {heading}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-0.5">
                    {rows.map((contact) => {
                      const jobs = pastJobs(contact.company);
                      return (
                        <div
                          key={contact.id}
                          className={`grid grid-cols-[1fr_150px_128px_110px_54px_24px] items-center gap-3 border-t border-zinc-900/70 px-1 py-1.5 transition ${
                            selected === contact.id
                              ? "bg-orange-500/[0.06]"
                              : "hover:bg-orange-500/[0.03]"
                          }`}
                        >
                          <button
                            onClick={() => setSelected(contact.id)}
                            className="min-w-0 text-left"
                          >
                            <span className="block truncate text-[11.5px] font-semibold text-zinc-200">
                              {contact.name || <span className="text-zinc-700">Unnamed</span>}
                            </span>
                            <span className="block truncate font-mono text-[9px] text-zinc-600">
                              {contact.role || contact.kind}
                            </span>
                          </button>
                          <span className="min-w-0 truncate text-[11px] text-zinc-400">
                            {contact.company || <span className="text-zinc-700">-</span>}
                          </span>
                          <a
                            href={contact.email ? `mailto:${contact.email}` : undefined}
                            className="min-w-0 truncate font-mono text-[10px] text-zinc-500 hover:text-orange-300"
                          >
                            {contact.email || <span className="text-zinc-700">-</span>}
                          </a>
                          <span className="truncate font-mono text-[10px] text-zinc-500">
                            {contact.phone || <span className="text-zinc-700">-</span>}
                          </span>
                          <span
                            className={`text-right font-mono text-[11px] font-bold ${
                              jobs > 0 ? "text-orange-300" : "text-zinc-700"
                            }`}
                            title="Bids in the log carrying this company"
                          >
                            {jobs > 0 ? jobs : "-"}
                          </span>
                          <button
                            onClick={() => remove(contact)}
                            className="text-center font-mono text-[11px] text-zinc-800 transition hover:text-red-400"
                            aria-label={`Remove ${contact.name}`}
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Panel>
          </div>

          {/* ---- Editing one person ------------------------------------- */}
          <Panel
            title={active ? "Edit contact" : "No contact selected"}
            scan={false}
            right={
              active && (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                  saves as you type
                </span>
              )
            }
          >
            {!active ? (
              <p className="px-1 py-4 text-[11px] leading-[1.6] text-zinc-600">
                Pick someone from the list to edit their details, or add a new contact.
              </p>
            ) : (
              <div className="grid gap-0.5">
                <Field label="Name" value={active.name} placeholder="Full name" onChange={(v) => update(active.id, { name: v })} />
                <Field label="Company" value={active.company} placeholder="Who they work for" onChange={(v) => update(active.id, { company: v })} />
                <Field label="Role" value={active.role} placeholder="Estimating lead, PM, yard" onChange={(v) => update(active.id, { role: v })} />
                <Field label="Email" value={active.email} placeholder="name@company.com" onChange={(v) => update(active.id, { email: v })} />
                <Field label="Phone" value={active.phone} placeholder="(000) 000-0000" onChange={(v) => update(active.id, { phone: v })} />

                <div className="grid grid-cols-[92px_1fr] items-center gap-3 border-t border-zinc-900/70 px-1 py-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                    Type
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {KINDS.map((kind) => (
                      <button
                        key={kind}
                        onClick={() => update(active.id, { kind })}
                        className={`rounded border px-2 py-0.5 font-mono text-[9px] font-medium transition ${
                          active.kind === kind
                            ? "border-orange-400/50 bg-orange-400/10 text-orange-200"
                            : "border-zinc-800 bg-korban-raised text-zinc-500 hover:border-zinc-600"
                        }`}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-900/70 px-1 py-1.5">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                    Notes
                  </span>
                  <textarea
                    value={active.notes}
                    onChange={(event) => update(active.id, { notes: event.target.value })}
                    placeholder="How they bid, what they care about, who else to talk to"
                    className="min-h-20 w-full resize-none rounded border border-zinc-900 bg-korban-raised p-2 text-[11px] leading-[1.5] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-orange-500/40"
                  />
                </div>

                {pastJobs(active.company) > 0 && (
                  <p className="mt-1 border-l-2 border-orange-500/40 bg-orange-500/[0.05] py-1.5 pl-2.5 text-[10px] leading-[1.5] text-zinc-400">
                    {pastJobs(active.company)} bid
                    {pastJobs(active.company) === 1 ? "" : "s"} in the log carry this company.
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Pieces
// -----------------------------------------------------------------------------

function KorbanMotionStyles() {
  return (
    <style>{`
      @keyframes korban-scan {
        0% { transform: translateX(-40%); opacity: 0.5; }
        85% { opacity: 0.5; }
        100% { transform: translateX(320%); opacity: 0; }
      }
      .korban-scan { animation: korban-scan 3.4s linear 2 forwards; }
      @media (prefers-reduced-motion: reduce) {
        .korban-scan { animation: none; opacity: 0; }
      }
    `}</style>
  );
}

function Panel({
  title, right, scan = true, children,
}: {
  title: string;
  right?: React.ReactNode;
  scan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />
      {scan && (
        <span
          aria-hidden
          className="korban-scan pointer-events-none absolute -top-px left-0 h-px w-[36%]"
          style={{ background: "linear-gradient(90deg,transparent,#F97316,transparent)" }}
        />
      )}
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {title}
        </h2>
        {right}
      </div>
      <div className="rounded border border-zinc-900 bg-black p-2.5">{children}</div>
    </section>
  );
}

function Field({
  label, value, placeholder, onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-3 border-t border-zinc-900/70 px-1 py-1 first:border-t-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </span>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-[11.5px] text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-orange-500/40 focus:bg-korban-raised"
      />
    </div>
  );
}
