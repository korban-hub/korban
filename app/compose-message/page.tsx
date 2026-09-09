"use client";

/**
 * Compose - the message that carries the bid out the door.
 *
 * A price is only half of it. How it is sent decides whether it gets read,
 * and an estimator who has spent an afternoon on a takeoff should not then
 * spend twenty minutes deciding how familiar to sound.
 *
 * Three tones, because that is genuinely the range: someone you have never
 * met, someone you are trying to win over, and someone whose kids you know.
 * Each is a real draft with the bid details already in it, and every word of
 * it is editable - the tone picks a starting point, not a final answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KorbanButton, KorbanHeader, type KorbanMenuLink } from "@/components/korban";
import { getActiveProject } from "@/lib/projectStore";
import { getBackendSettings } from "@/lib/backendStore";
import { loadEstimateState } from "@/lib/estimateState";

const menuLinks: KorbanMenuLink[] = [
  { href: "/dashboard", label: "Bid Room" },
  { href: "/estimate-review", label: "Estimate" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Bid/Job Log" },
];

type Tone = "direct" | "hopeful" | "familiar";

const TONES: { key: Tone; label: string; when: string }[] = [
  { key: "direct", label: "Direct", when: "First time, or all business" },
  { key: "hopeful", label: "Hopeful", when: "You want this one" },
  { key: "familiar", label: "Familiar", when: "You know each other" },
];

type Draft = { subject: string; body: string };

function buildDraft(
  tone: Tone,
  bid: {
    projectName: string;
    contactFirst: string;
    customer: string;
    proposalNumber: string;
    total: string;
    estimator: string;
    company: string;
    phone: string;
    linkIncluded: boolean;
  }
): Draft {
  const project = bid.projectName || "the project";
  const greeting = bid.contactFirst ? `Hi ${bid.contactFirst},` : "Hello,";
  const link = bid.linkIncluded
    ? "\n\nThere's a short walkthrough linked below - it covers the scope, the schedule and where the number comes from. Two minutes, no login."
    : "";
  const sign = [bid.estimator, bid.company, bid.phone].filter(Boolean).join("\n");

  if (tone === "direct") {
    return {
      subject: `${project} - scaffold proposal ${bid.proposalNumber}`.trim(),
      body: `${greeting}

Our proposal for ${project} is attached. The total is ${bid.total}, covering furnish, install and removal per the scope and qualifications in the document.

Pricing holds for 30 days. If anything in the scope needs adjusting, tell me what changes and I'll turn it around same day.${link}

${sign}`,
    };
  }

  if (tone === "hopeful") {
    return {
      subject: `${project} - our number, and why`.trim(),
      body: `${greeting}

Thanks for the opportunity on ${project}. Our proposal is attached at ${bid.total}.

We took the time to work this one properly rather than throw a square-foot rate at it - the quantities come off your drawings, so what's in the number is what's going on the job. If we're off on scope somewhere, I'd rather hear it than lose on a misunderstanding.${link}

Happy to walk through any of it. I'm reachable on the number below.

${sign}`,
    };
  }

  return {
    subject: `${project} - here's the scaffold number`.trim(),
    body: `${greeting}

Got ${project} priced out - ${bid.total}, proposal attached.

Nothing unusual in it. Same scope we've talked about, pricing held where I could. Give me a shout if the schedule shifts or you want to look at alternates.${link}

${sign}`,
  };
}

export default function ComposeMessagePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tone, setTone] = useState<Tone>("direct");
  const [draft, setDraft] = useState<Draft>({ subject: "", body: "" });
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState("");
  const [shareLink, setShareLink] = useState("");

  const [bid, setBid] = useState({
    projectName: "",
    contactFirst: "",
    contactEmail: "",
    customer: "",
    proposalNumber: "",
    total: "",
    estimator: "",
    company: "",
    phone: "",
    linkIncluded: false,
  });

  const load = useCallback(() => {
    try {
      const project = getActiveProject();
      const backend = getBackendSettings();
      const state = loadEstimateState();
      const derived = state.derived;
      const total = derived
        ? Math.round(derived.rentalsRevenue + derived.laborCost).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })
        : "the attached amount";

      const link = params.get("link") ?? "";
      setShareLink(link);
      setTo(project.contactEmail || "");
      setBid({
        projectName: project.projectName,
        contactFirst: (project.contactName || "").split(" ")[0] ?? "",
        contactEmail: project.contactEmail,
        customer: project.customer,
        proposalNumber: project.proposalNumber,
        total,
        estimator: backend.estimator.estimatorName || project.estimator,
        company: backend.company.companyName,
        phone: backend.estimator.estimatorPhone || backend.company.companyPhone,
        linkIncluded: Boolean(link),
      });
    } catch {
      // Storage unavailable - the page still composes, just with blanks.
    }
    setMounted(true);
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  // Switching tone rewrites the draft, unless the estimator has started
  // editing - nobody wants a click to eat what they just typed.
  useEffect(() => {
    if (!mounted || edited) return;
    setDraft(buildDraft(tone, bid));
  }, [tone, bid, mounted, edited]);

  const fullBody = useMemo(
    () => (shareLink ? `${draft.body}\n\n${shareLink}` : draft.body),
    [draft.body, shareLink]
  );

  const mailto = useMemo(() => {
    const query = new URLSearchParams({ subject: draft.subject, body: fullBody });
    return `mailto:${to}?${query.toString()}`;
  }, [to, draft.subject, fullBody]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${fullBody}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy the message", `${draft.subject}\n\n${fullBody}`);
    }
  }

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-korban-base">
        <p className="font-mono text-[11px] text-zinc-600">Opening compose...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-korban-base text-white">
      <KorbanHeader
        title="Compose"
        subtitle={bid.projectName ? `Sending ${bid.projectName}` : "No project loaded"}
        menuLinks={menuLinks}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((open) => !open)}
        actionsAlwaysVisible
        actionsClassName="gap-2.5"
        actions={
          <>
            <KorbanButton variant="ghost" onClick={copyAll}>
              {copied ? "Copied" : "Copy"}
            </KorbanButton>
            <KorbanButton as="a" href={mailto} variant="primary">
              Open in email
            </KorbanButton>
          </>
        }
      />

      <div className="relative mx-auto w-full max-w-[1100px] px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />

        <div className="relative grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
            <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-orange-500" />
            <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-orange-500" />

            <div className="flex items-center justify-between gap-3 pb-2">
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Message
              </h2>
              {edited && (
                <button
                  onClick={() => {
                    setEdited(false);
                    setDraft(buildDraft(tone, bid));
                  }}
                  className="font-mono text-[9px] text-zinc-600 transition hover:text-orange-300"
                >
                  start over
                </button>
              )}
            </div>

            <div className="rounded border border-zinc-900 bg-black p-2.5">
              <div className="grid grid-cols-[52px_1fr] items-center gap-3 border-b border-zinc-900 py-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">To</span>
                <input
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-transparent text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-700"
                />
              </div>

              <div className="grid grid-cols-[52px_1fr] items-center gap-3 border-b border-zinc-900 py-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">Subject</span>
                <input
                  value={draft.subject}
                  onChange={(event) => {
                    setEdited(true);
                    setDraft({ ...draft, subject: event.target.value });
                  }}
                  className="w-full bg-transparent text-[11.5px] text-zinc-200 outline-none"
                />
              </div>

              <textarea
                value={draft.body}
                onChange={(event) => {
                  setEdited(true);
                  setDraft({ ...draft, body: event.target.value });
                }}
                className="mt-2 min-h-[340px] w-full resize-none bg-transparent text-[12px] leading-[1.7] text-zinc-300 outline-none"
              />

              {shareLink && (
                <div className="mt-2 border-t border-zinc-900 pt-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                    Presentation link, appended on send
                  </p>
                  <p className="mt-1 break-all font-mono text-[9.5px] text-orange-400/70">
                    {shareLink}
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="grid items-start gap-3">
            <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
              <h2 className="pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Tone
              </h2>
              <div className="grid gap-1.5">
                {TONES.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => {
                      setTone(option.key);
                      setEdited(false);
                    }}
                    className={`rounded border px-2.5 py-2 text-left transition ${
                      tone === option.key
                        ? "border-orange-400/50 bg-orange-400/[0.07]"
                        : "border-zinc-900 bg-korban-raised hover:border-zinc-700"
                    }`}
                  >
                    <span
                      className={`block text-[11.5px] font-semibold ${
                        tone === option.key ? "text-orange-200" : "text-zinc-300"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-zinc-600">
                      {option.when}
                    </span>
                  </button>
                ))}
              </div>
              {edited && (
                <p className="mt-2 border-l-2 border-orange-500/40 bg-orange-500/[0.05] py-1.5 pl-2.5 text-[10px] leading-[1.5] text-zinc-400">
                  You have edited this draft. Picking a tone will rewrite it.
                </p>
              )}
            </section>

            <section className="relative rounded-lg border border-zinc-800 bg-korban-base p-3">
              <h2 className="pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                Going out
              </h2>
              <div className="rounded border border-zinc-900 bg-black p-2.5">
                {[
                  ["Project", bid.projectName],
                  ["Customer", bid.customer],
                  ["Proposal", bid.proposalNumber],
                  ["Total", bid.total],
                  ["From", bid.estimator],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-3 border-b border-zinc-900/70 py-1 last:border-0"
                  >
                    <span className="text-[10.5px] text-zinc-500">{label}</span>
                    <span className="truncate text-right font-mono text-[10.5px] text-zinc-300">
                      {value || <span className="text-zinc-700">Not set</span>}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push("/estimate-review")}
                className="mt-2 w-full rounded border border-zinc-800 bg-korban-raised py-1.5 font-mono text-[10px] font-medium text-zinc-400 transition hover:border-orange-500/40 hover:text-orange-300"
              >
                Back to the estimate
              </button>
            </section>

            <p className="px-1 font-mono text-[9px] leading-[1.6] text-zinc-700">
              Open in email hands this to your mail app with the message already
              written. Sending from inside KORBAN arrives once the message centre
              is connected.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
