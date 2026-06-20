"use client";

import { useState } from "react";
import { KorbanHeader, KorbanPanel, type KorbanMenuLink } from "@/components/korban";

type Contact = {
  id: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  pastJobs: number;
};

// Placeholder contact list — this will eventually read from a real
// contactsStore.ts the same way projects read from projectStore.ts.
const contacts: Contact[] = [
  {
    id: "marcus-lee",
    name: "Marcus Lee",
    company: "Turner Construction",
    role: "Estimating Lead",
    email: "estimating@turner.com",
    phone: "(510) 555-0138",
    pastJobs: 7,
  },
  {
    id: "sarah-grant",
    name: "Sarah Grant",
    company: "Swinerton",
    role: "Bid Desk",
    email: "biddesk@swinerton.com",
    phone: "(707) 555-0184",
    pastJobs: 3,
  },
  {
    id: "daniel-carter",
    name: "Daniel Carter",
    company: "Webcor",
    role: "Preconstruction",
    email: "precon@webcor.com",
    phone: "(415) 555-0199",
    pastJobs: 5,
  },
];

const contactsMenuLinks: KorbanMenuLink[] = [
  { href: "/project-plan-desk", label: "Project Plan Desk" },
  { href: "/projects", label: "Projects" },
  { href: "/backend", label: "Backend" },
  { href: "/settings", label: "Settings" },
];

export default function ContactsPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((contact) => {
    const term = search.toLowerCase();
    return (
      contact.name.toLowerCase().includes(term) ||
      contact.company.toLowerCase().includes(term) ||
      contact.role.toLowerCase().includes(term)
    );
  });

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <KorbanHeader
        title="Contacts"
        subtitle="Customer and GC contacts linked across projects."
        menuLinks={contactsMenuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((current) => !current)}
        actionsAlwaysVisible
        actions={
          <button className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20">
            + Contact
          </button>
        }
      />

      <section className="p-6">
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts by name, company, or role..."
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-black px-4 py-2.5 text-sm text-zinc-200 outline-none focus:border-orange-500/40 placeholder:text-zinc-700"
          />
        </div>

        <KorbanPanel title="All Contacts" subtitle={`${filtered.length} contact${filtered.length === 1 ? "" : "s"}`}>
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 bg-black/40 p-6 text-center text-xs text-zinc-500">
              No contacts match that search.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3 text-right">Past Jobs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 bg-black/60">
                  {filtered.map((contact) => (
                    <tr key={contact.id} className="transition hover:bg-orange-500/5">
                      <td className="px-4 py-3 font-semibold text-zinc-200">{contact.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{contact.company}</td>
                      <td className="px-4 py-3 text-zinc-500">{contact.role}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400">{contact.email}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400">{contact.phone}</td>
                      <td className="px-4 py-3 text-right font-mono text-orange-400">{contact.pastJobs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </KorbanPanel>
      </section>
    </main>
  );
}
