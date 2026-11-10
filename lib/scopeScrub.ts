/**
 * scopeScrub.ts
 *
 * Scope Scrub: the highlighter.
 *
 * An estimator drops a Scope of Work or a Subcontract, and Korban finds every
 * sentence that carries a word from the keyword library, grouped under the
 * library's categories. It does not read; it highlights. The library is the
 * estimator's - seeded here, edited in Backend - and the two documents run
 * different categories in a different order with different marks, because a
 * scope exhibit and a subcontract speak different languages.
 *
 * Everything here is pure. Reading the PDF is the page's job (pdf.js in the
 * browser); this file takes page text and gives back results, and it holds
 * the shape of a saved scrub on the project.
 */

// ----------------------------------------------------------------------
// The library
// ----------------------------------------------------------------------

/** What is being scrubbed. Decides categories, order and marks. */
export type ScopeDocType = "scope" | "subcontract";

export const SCOPE_DOC_TYPES: { id: ScopeDocType; label: string; when: string }[] = [
  { id: "scope", label: "Scope of Work", when: "Before you price: what is being asked, and whose it is." },
  { id: "subcontract", label: "Subcontract", when: "After you've bid: does the paper match the number." },
];

export type ScopeTerm = {
  id: string;
  /** The word or phrase, as the estimator wrote it. */
  term: string;
  /** Why it matters. Shown beside the term. Optional. */
  note: string;
  /** One of the search-first terms: shown lit on the results page. */
  lit: boolean;
};

export type ScopeCategory = {
  id: string;
  name: string;
  /** One line under the name. */
  blurb: string;
  terms: ScopeTerm[];
  /** Order when scrubbing a Scope of Work; null = this category sits out. */
  scopeOrder: number | null;
  /** Order when scrubbing a Subcontract; null = sits out. */
  subcontractOrder: number | null;
};

export type ScopeMarkTone = "red" | "orange" | "amber" | "green";

export type ScopeMark = {
  id: string;
  label: string;
  /** What the mark means, on hover and in Backend. */
  meaning: string;
  tone: ScopeMarkTone;
};

export type ScopeLibrary = {
  categories: ScopeCategory[];
  /** The four marks, per document type. Same tones, different words. */
  marks: Record<ScopeDocType, ScopeMark[]>;
  /** The review questions answered on every scrub. */
  questions: string[];
};

/** Terms typed as "Term | note", one per line, into a category. */
function terms(categoryId: string, lines: string, lit: string[] = []): ScopeTerm[] {
  const litSet = new Set(lit.map((s) => s.toLowerCase()));
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [term, note = ""] = line.split("|").map((s) => s.trim());
      return { id: `${categoryId}-${i + 1}`, term, note, lit: litSet.has(term.toLowerCase()) };
    });
}

/*
 * The seed library: the estimator's own list, in his categories and his
 * order, with his notes. Edited in Backend from here on; this is only what
 * a fresh install starts with.
 */
export const DEFAULT_SCOPE_LIBRARY: ScopeLibrary = {
  categories: [
    {
      id: "scaffold",
      name: "Scaffold terms",
      blurb: "Direct scaffold language.",
      scopeOrder: 1,
      subcontractOrder: 6,
      terms: terms("scaffold", `
        Scaffold | Direct scaffold requirements
        Access platforms | Platforms may be your responsibility
        Working platforms | Installation and maintenance obligations
        Elevated work platforms | Could include scaffold or other access equipment
        Temporary structures | May include scaffold engineering and installation
        Suspended scaffold | Specialized equipment and safety requirements
        Hanging scaffold | Additional engineering and rigging
        Supported scaffold | Standard scaffold systems
        Cantilever scaffold | Specialized structural requirements
        Rolling scaffold | Mobile scaffold requirements
        System scaffold | Specific scaffold systems
        Tube and clamp | Material and labor implications
        Frame scaffold | Conventional scaffold requirements
        Stair towers | Additional access equipment
        Scaffold stairs | Stair access and installation
        Ladders and access | May be included in your scope
        Scaffold bridges | Additional structural requirements
        Loading platforms | May require engineered platforms
        Debris netting | Additional material and installation
        Weather protection | Could require enclosure or containment
      `, ["Scaffold", "Access platforms", "Working platforms"]),
    },
    {
      id: "hidden",
      name: "Hidden obligations",
      blurb: "Words that can make scaffold yours without ever saying “scaffold”.",
      scopeOrder: 2,
      subcontractOrder: 2,
      terms: terms("hidden", `
        Means and methods
        Temporary access
        Contractor-furnished access
        Provide access
        Access provisions
        Access equipment
        Safe access
        Work access
        Temporary work platforms
        Construction access
        Trade access
        Common access
        Shared access
        Site logistics
        Temporary facilities
        Equipment and materials
        All necessary equipment
        Complete installation
        Turnkey installation
        Incidental work | May capture unspecified scaffold work
        Ancillary work
      `, ["Means and methods", "Temporary access", "Shared access", "All necessary equipment"]),
    },
    {
      id: "install",
      name: "Install, maintain, remove",
      blurb: "How much work you are actually agreeing to.",
      scopeOrder: 3,
      subcontractOrder: 5,
      terms: terms("install", `
        Erection
        Installation
        Dismantling
        Disassembly
        Removal
        Relocation
        Modification
        Alterations
        Reconfiguration
        Extensions
        Height adjustments
        Scaffold tagging
        Inspections
        Maintenance
        Maintain
        Repairs
        Scaffold availability
        Scaffold access
        Daily inspection
        Weekly inspection
        Engineering drawings
        Structural calculations
        Load calculations
      `, ["Erection", "Dismantling", "Relocation", "Modification", "Maintain"]),
    },
    {
      id: "safety",
      name: "Safety & regulatory",
      blurb: "Liability exposure. California jobs: Cal/OSHA Title 8.",
      scopeOrder: 6,
      subcontractOrder: 7,
      terms: terms("safety", `
        OSHA
        Cal/OSHA
        Fall protection
        Guardrails
        Guard rails
        Midrails
        Mid rails
        Toe boards
        Personal fall arrest
        PFAS
        Tie-offs
        Anchor points
        Harnesses
        Safety nets
        Access ladders
        Stair access
        Competent person
        Qualified person
        Scaffold inspections
        Load capacity
        Maximum allowable load
        Live loads
        Dead loads
        Wind loads
        Seismic loads
        Overhead protection
        Falling object protection
        Public protection
        Exclusion zones
      `, ["Fall protection", "Load capacity"]),
    },
    {
      id: "engineering",
      name: "Engineering & specialty",
      blurb: "More than standard frame scaffold. Shoring and falsework are not scaffold, but they are scope.",
      scopeOrder: 7,
      subcontractOrder: 8,
      terms: terms("engineering", `
        Engineering
        Engineered scaffold
        PE-stamped drawings
        Stamped drawings
        Structural engineer
        Design calculations
        Specialty scaffold
        Swing stages
        Shoring
        Reshoring
        Falsework
        Temporary support
        Temporary bracing
        Structural support
        Outriggers
        Tie-ins
        Anchoring
        Seismic considerations
        Scaffold load ratings
        Hoisting and rigging
        Crane access
        Material hoists
      `, ["Engineering"]),
    },
    {
      id: "duration",
      name: "Duration & schedule",
      blurb: "Where scaffold contractors lose money.",
      scopeOrder: 5,
      subcontractOrder: 3,
      terms: terms("duration", `
        Project duration
        Construction schedule
        Critical path
        Milestones
        Phased construction
        Extended duration
        Standby
        On-call
        As-needed
        Continuous access
        Maintain throughout construction
        Remain in place
        Temporary installation
        Multiple mobilizations
        Demobilization
        Remobilization
        Schedule acceleration
        Overtime
        Shift work
        Weekend work
        24/7 availability
        Delays
        Suspension of work
      `),
    },
    {
      id: "shared",
      name: "Shared scaffold & other trades",
      blurb: "The usual scope dispute.",
      scopeOrder: 4,
      subcontractOrder: 4,
      terms: terms("shared", `
        Shared scaffold
        Common scaffold
        Multi-trade access
        Trade coordination
        Other subcontractors
        General contractor access
        Shared-use platforms
        Scaffold access by others
        Third-party use
        Access for all trades
        Exclusive use
        Scaffold handover
        Scaffold ownership
        Responsibility for damage
        Scaffold modifications by others
        Unauthorized alterations
      `),
    },
    {
      id: "commercial",
      name: "Commercial terms",
      blurb: "What costs you money in the subcontract.",
      scopeOrder: null,
      subcontractOrder: 1,
      terms: terms("commercial", `
        Lump sum | Unlimited-looking obligations inside a fixed price
        All-inclusive | Unpriced scaffold-related services
        No additional compensation | Restricts extra-work claims
        Change order | How additional scaffold work gets paid
        Time and materials | Rates and authorization requirements
        Unit pricing | Quantities and measurement rules
        Retainage | Delayed payment
        Back charges | Deductions for alleged failures
        Liquidated damages | Financial exposure for delays
        Indemnification | Liability allocation
        Additional insured | Insurance obligations
        Waiver of subrogation | Insurance risk allocation
        Warranty | Duration and extent of obligations
        Flow-down provisions | Requirements inherited from the prime contract
        Schedule of values | How scaffold work is paid
        Scope exclusions | Work specifically not included
        Allowances | Uncertain or estimated scope
      `),
    },
  ],
  marks: {
    scope: [
      { id: "price", label: "Price it", meaning: "It's ours; carry it in the number.", tone: "orange" },
      { id: "exclude", label: "Exclude it", meaning: "Not doing it; goes in the exclusions.", tone: "red" },
      { id: "assess", label: "Assess", meaning: "Can't tell yet; RFI before bid day.", tone: "amber" },
      { id: "others", label: "By others", meaning: "The document gives it to someone else; note it so it stays theirs.", tone: "green" },
    ],
    subcontract: [
      {
        id: "red", label: "Red flag", tone: "red",
        meaning: "Cost or liability exposure - including terms that make us pay for things outside our control or for other people's mishaps: indemnification, back charges for other trades' damage, liquidated damages for delays that aren't ours, responsibility for damage however caused.",
      },
      { id: "notbid", label: "Not in our bid", meaning: "Work the document asks for that the number didn't carry.", tone: "orange" },
      { id: "assess", label: "Assess", meaning: "Ambiguous; raise before signing.", tone: "amber" },
      { id: "protects", label: "Protects us", meaning: "Language that holds our scope where we put it.", tone: "green" },
    ],
  },
  questions: [
    "Is scaffold explicitly included or excluded?",
    "Who provides scaffold materials and labor?",
    "Who is responsible for engineering and stamped drawings?",
    "Who pays for scaffold modifications and relocations?",
    "Who is responsible for inspections and tagging?",
    "Is scaffold shared with other contractors?",
    "Who pays for extended scaffold rental or standby time?",
    "Are multiple mobilizations included?",
    "Who is responsible for damage caused by other trades?",
    "Does the contract require scaffold beyond the original drawings or bid specifications?",
  ],
};

/** The categories that run for a document, in that document's order. */
export function categoriesFor(library: ScopeLibrary, docType: ScopeDocType): ScopeCategory[] {
  const key = docType === "scope" ? "scopeOrder" : "subcontractOrder";
  return library.categories
    .filter((c) => c[key] !== null && c.terms.length > 0)
    .sort((a, b) => (a[key] as number) - (b[key] as number));
}

export function marksFor(library: ScopeLibrary, docType: ScopeDocType): ScopeMark[] {
  return library.marks[docType] ?? DEFAULT_SCOPE_LIBRARY.marks[docType];
}

// --- Normalizing what Backend saved -----------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const orderOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v === null ? null : null);

export function normalizeScopeLibrary(value: unknown): ScopeLibrary {
  if (!isRecord(value)) return DEFAULT_SCOPE_LIBRARY;
  const d = DEFAULT_SCOPE_LIBRARY;
  const categories: ScopeCategory[] = Array.isArray(value.categories)
    ? value.categories.flatMap((c, ci): ScopeCategory[] => {
      if (!isRecord(c)) return [];
      const id = str(c.id) || `cat-${ci + 1}`;
      const list: ScopeTerm[] = Array.isArray(c.terms)
        ? c.terms.flatMap((t, ti): ScopeTerm[] => {
          if (!isRecord(t)) return [];
          const term = str(t.term).trim();
          if (!term) return [];
          return [{ id: str(t.id) || `${id}-${ti + 1}`, term, note: str(t.note), lit: t.lit === true }];
        })
        : [];
      return [{
        id,
        name: str(c.name, "Untitled"),
        blurb: str(c.blurb),
        terms: list,
        scopeOrder: "scopeOrder" in c ? orderOf(c.scopeOrder) : ci + 1,
        subcontractOrder: "subcontractOrder" in c ? orderOf(c.subcontractOrder) : ci + 1,
      }];
    })
    : d.categories;
  const marks = (docType: ScopeDocType): ScopeMark[] => {
    const raw = isRecord(value.marks) ? value.marks[docType] : null;
    const base = d.marks[docType];
    if (!Array.isArray(raw)) return base;
    // Four marks, always: labels and meanings are the estimator's, tones and ids stay.
    return base.map((m, i) => {
      const r = raw[i];
      return isRecord(r) ? { ...m, label: str(r.label, m.label) || m.label, meaning: str(r.meaning, m.meaning) } : m;
    });
  };
  return {
    categories: categories.length > 0 ? categories : d.categories,
    marks: { scope: marks("scope"), subcontract: marks("subcontract") },
    questions: Array.isArray(value.questions)
      ? value.questions.filter((q): q is string => typeof q === "string" && q.trim() !== "")
      : d.questions,
  };
}

// ----------------------------------------------------------------------
// Matching
// ----------------------------------------------------------------------

/**
 * A term matches as a phrase, any case, any form of its words: "Erection"
 * catches erect, erected, erecting; "Dismantling" catches dismantle. Each
 * word is cut back to its stem and allowed to run on. Short words (OSHA,
 * and, of) are matched whole, plural or not. The joins between words are
 * loose - a space, a hyphen, a slash or nothing - so Cal/OSHA catches
 * Cal-OSHA and CalOSHA, tie-offs catches tie offs, toe boards catches
 * toeboards.
 */
export function termPattern(term: string): RegExp {
  const words = term.trim().toLowerCase().split(/[\s\-\/]+/).map((w) => w.replace(/[^a-z0-9']/g, "")).filter(Boolean);
  if (words.length === 0) return /$^/g;
  const source = "\\b" + words.map((w, i) => stemSource(w, i === words.length - 1)).join("[\\s\\-\\/]*");
  return new RegExp(source, "gi");
}

function stemSource(word: string, last: boolean): string {
  if (word.length < 5 || /^\d+$/.test(word)) {
    // Whole word, plural allowed either way (offs / off, net / nets).
    const bare = word.length >= 4 && word.endsWith("s") && !/^\d+$/.test(word) ? word.slice(0, -1) : word;
    return escape(bare) + "(?:e?s)?" + (last ? "\\b" : "");
  }
  const suffixes = ["ations", "ation", "ions", "ion", "ings", "ing", "ies", "ied", "ness", "ment", "ally", "es", "ed", "ly", "s"];
  let stem = word;
  for (const s of suffixes) {
    if (word.endsWith(s) && word.length - s.length >= 4) { stem = word.slice(0, -s.length); break; }
  }
  // "ies" -> "i": let the y form through too (availabilities / availability).
  const tail = stem.endsWith("i") ? "(?:i|y)" : escape(stem.slice(-1));
  return escape(stem.slice(0, -1)) + tail + "[a-z]*";
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type PageText = { page: number; text: string };

export type ScopeHit = {
  termId: string;
  page: number;
  /** The sentence, or a window of it when the sentence runs long. */
  sentence: string;
  /** Where the match sits in `sentence`, for the highlight. */
  start: number;
  end: number;
};

export type TermResult = { term: ScopeTerm; hits: ScopeHit[] };

export type CategoryResult = {
  category: ScopeCategory;
  terms: TermResult[];
  hitCount: number;
  found: TermResult[];
  silent: ScopeTerm[];
};

/** Page text to sentences. A long run without punctuation is windowed later. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  return clean
    .split(/(?<=[.;:!?])\s+(?=[A-Z0-9("“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const WINDOW = 180;

/** One hit per sentence per term. */
export function scrubPages(pages: PageText[], categories: ScopeCategory[]): CategoryResult[] {
  const sentencesByPage = pages.map((p) => ({ page: p.page, sentences: splitSentences(p.text) }));
  return categories.map((category) => {
    const results: TermResult[] = category.terms.map((term) => {
      const pattern = termPattern(term.term);
      const hits: ScopeHit[] = [];
      for (const { page, sentences } of sentencesByPage) {
        for (const sentence of sentences) {
          pattern.lastIndex = 0;
          const m = pattern.exec(sentence);
          if (!m) continue;
          let text = sentence, start = m.index, end = m.index + m[0].length;
          if (sentence.length > WINDOW * 2 + 40) {
            const from = Math.max(0, start - WINDOW);
            const to = Math.min(sentence.length, end + WINDOW);
            text = (from > 0 ? "…" : "") + sentence.slice(from, to) + (to < sentence.length ? "…" : "");
            const shift = from > 0 ? from - 1 : 0;
            start -= shift; end -= shift;
          }
          hits.push({ termId: term.id, page, sentence: text, start, end });
        }
      }
      return { term, hits };
    });
    const found = results.filter((r) => r.hits.length > 0);
    return {
      category,
      terms: results,
      hitCount: results.reduce((n, r) => n + r.hits.length, 0),
      found,
      silent: results.filter((r) => r.hits.length === 0).map((r) => r.term),
    };
  });
}

// ----------------------------------------------------------------------
// The saved scrub
// ----------------------------------------------------------------------

export type ScopeAnswer = "yes" | "no" | "unclear" | "";

export type ScopeScrubRecord = {
  id: string;
  docType: ScopeDocType;
  fileName: string;
  pageCount: number;
  /** ISO time of the scrub. */
  scrubbedAt: string;
  /** Every hit, so the page opens again without the PDF. */
  hits: ScopeHit[];
  /** Mark, note and (for a Price it) whether it has been carried, per hit, keyed by hitKey(). */
  marks: Record<string, { mark: string; note: string; done?: boolean }>;
  /** Answer and note per question index. */
  answers: Record<string, { answer: ScopeAnswer; note: string }>;
  /** Pages that had no text, so the page can say so. */
  emptyPages: number;
};

export function hitKey(hit: ScopeHit): string {
  return `${hit.termId}:${hit.page}:${hit.start}:${hit.sentence.length}`;
}

export function newScrubId(): string {
  return `scrub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Counts for the Plan Desk tile and the page header. */
export function summarizeScrub(record: ScopeScrubRecord, library: ScopeLibrary) {
  const marks = marksFor(library, record.docType);
  const byMark: Record<string, number> = Object.fromEntries(marks.map((m) => [m.id, 0]));
  let marked = 0;
  for (const entry of Object.values(record.marks)) {
    if (entry.mark && entry.mark in byMark) { byMark[entry.mark] += 1; marked += 1; }
  }
  const answered = Object.values(record.answers).filter((a) => a.answer !== "").length;
  const termsFound = new Set(record.hits.map((h) => h.termId)).size;
  return { hits: record.hits.length, termsFound, marked, byMark, answered, questions: library.questions.length };
}

export function normalizeScrubRecord(value: unknown): ScopeScrubRecord | null {
  if (!isRecord(value)) return null;
  const docType: ScopeDocType = value.docType === "subcontract" ? "subcontract" : "scope";
  const hits: ScopeHit[] = Array.isArray(value.hits)
    ? value.hits.flatMap((h): ScopeHit[] => {
      if (!isRecord(h)) return [];
      const sentence = str(h.sentence);
      if (!sentence) return [];
      return [{
        termId: str(h.termId), page: typeof h.page === "number" ? h.page : 0, sentence,
        start: typeof h.start === "number" ? h.start : 0, end: typeof h.end === "number" ? h.end : 0,
      }];
    })
    : [];
  const marks: ScopeScrubRecord["marks"] = {};
  if (isRecord(value.marks)) {
    for (const [k, v] of Object.entries(value.marks)) {
      if (isRecord(v)) marks[k] = { mark: str(v.mark), note: str(v.note), ...(v.done === true ? { done: true } : {}) };
    }
  }
  const answers: ScopeScrubRecord["answers"] = {};
  if (isRecord(value.answers)) {
    for (const [k, v] of Object.entries(value.answers)) {
      if (!isRecord(v)) continue;
      const a = v.answer;
      answers[k] = { answer: a === "yes" || a === "no" || a === "unclear" ? a : "", note: str(v.note) };
    }
  }
  return {
    id: str(value.id) || newScrubId(),
    docType,
    fileName: str(value.fileName, "document.pdf"),
    pageCount: typeof value.pageCount === "number" ? value.pageCount : 0,
    scrubbedAt: str(value.scrubbedAt),
    hits, marks, answers,
    emptyPages: typeof value.emptyPages === "number" ? value.emptyPages : 0,
  };
}

/**
 * Hits back into categories for display, using the library as it is now.
 * A term deleted from the library since the scrub keeps its hits under
 * "No longer in the library" rather than losing them.
 */
export function regroupHits(record: ScopeScrubRecord, library: ScopeLibrary): CategoryResult[] {
  const categories = categoriesFor(library, record.docType);
  const byTerm = new Map<string, ScopeHit[]>();
  for (const hit of record.hits) {
    (byTerm.get(hit.termId) ?? byTerm.set(hit.termId, []).get(hit.termId)!).push(hit);
  }
  const seen = new Set<string>();
  const results: CategoryResult[] = categories.map((category) => {
    const terms: TermResult[] = category.terms.map((term) => {
      seen.add(term.id);
      return { term, hits: byTerm.get(term.id) ?? [] };
    });
    const found = terms.filter((r) => r.hits.length > 0);
    return {
      category, terms, found,
      hitCount: terms.reduce((n, r) => n + r.hits.length, 0),
      silent: terms.filter((r) => r.hits.length === 0).map((r) => r.term),
    };
  });
  const orphans: TermResult[] = [];
  byTerm.forEach((hits, termId) => {
    if (!seen.has(termId)) orphans.push({ term: { id: termId, term: termId.replace(/-\d+$/, ""), note: "", lit: false }, hits });
  });
  if (orphans.length > 0) {
    results.push({
      category: { id: "__orphans", name: "No longer in the library", blurb: "Terms removed from Backend since this scrub.", terms: orphans.map((o) => o.term), scopeOrder: 99, subcontractOrder: 99 },
      terms: orphans, found: orphans, hitCount: orphans.reduce((n, r) => n + r.hits.length, 0), silent: [],
    });
  }
  return results;
}

// ----------------------------------------------------------------------
// What the marks feed
// ----------------------------------------------------------------------

/** One marked hit, flattened for the pages that act on it. */
export type ScopeItem = {
  key: string;
  scrubId: string;
  fileName: string;
  docType: ScopeDocType;
  term: string;
  /** The estimator's note when there is one, else the sentence. */
  text: string;
  sentence: string;
  page: number;
  note: string;
  done: boolean;
};

function termNameFor(library: ScopeLibrary, termId: string): string {
  for (const c of library.categories) {
    const t = c.terms.find((x) => x.id === termId);
    if (t) return t.term;
  }
  return termId.replace(/-\w+$/, "");
}

/** Every hit carrying a given mark across a job's scrubs, newest scrub first. */
export function scopeItems(scrubs: ScopeScrubRecord[], library: ScopeLibrary, markId: string, docType?: ScopeDocType): ScopeItem[] {
  const items: ScopeItem[] = [];
  for (const scrub of scrubs) {
    if (docType && scrub.docType !== docType) continue;
    for (const hit of scrub.hits) {
      const key = hitKey(hit);
      const entry = scrub.marks[key];
      if (!entry || entry.mark !== markId) continue;
      const note = entry.note.trim();
      items.push({
        key, scrubId: scrub.id, fileName: scrub.fileName, docType: scrub.docType,
        term: termNameFor(library, hit.termId),
        text: note || hit.sentence.replace(/^\u2026|\u2026$/g, "").trim(),
        sentence: hit.sentence, page: hit.page, note, done: entry.done === true,
      });
    }
  }
  return items;
}

/**
 * Exclusions for the proposal, from the Scope of Work's "Exclude it" hits:
 * the note as written when there is one (that is the line the proposal
 * prints), else the sentence cut to a line.
 */
export function scopeExclusionLines(scrubs: ScopeScrubRecord[], library: ScopeLibrary): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of scopeItems(scrubs, library, "exclude", "scope")) {
    let line = item.note || item.sentence.replace(/^\u2026|\u2026$/g, "").trim();
    if (!item.note && line.length > 120) line = line.slice(0, 117).replace(/\s+\S*$/, "") + "\u2026";
    const k = line.toLowerCase();
    if (!line || seen.has(k)) continue;
    seen.add(k);
    lines.push(line);
  }
  return lines;
}

/** The same scrubs with one item's done flag set. */
export function withScopeItemDone(scrubs: ScopeScrubRecord[], scrubId: string, key: string, done: boolean): ScopeScrubRecord[] {
  return scrubs.map((s) => {
    if (s.id !== scrubId || !s.marks[key]) return s;
    return { ...s, marks: { ...s.marks, [key]: { ...s.marks[key], done } } };
  });
}

// ----------------------------------------------------------------------
// The PDF, for this session only
// ----------------------------------------------------------------------

/*
 * The PDF itself is never stored - it is the GC's document and it is big.
 * While the tab is open the file is kept here by scrub id, so "open page 14"
 * works; after a reload the page asks for the file again.
 */
const sessionFiles = new Map<string, File>();

export function keepScrubFile(id: string, file: File) { sessionFiles.set(id, file); }
export function scrubFile(id: string): File | undefined { return sessionFiles.get(id); }

/** A PDF dropped on the Plan Desk tile, carried to the scrub page. */
let pendingDrop: { file: File; docType: ScopeDocType | null } | null = null;
export function setPendingScopeDrop(file: File, docType: ScopeDocType | null) { pendingDrop = { file, docType }; }
export function takePendingScopeDrop() { const d = pendingDrop; pendingDrop = null; return d; }

/** Which saved scrub the Plan Desk tile asked to open. */
let pendingOpen: string | null = null;
export function setPendingScopeOpen(id: string) { pendingOpen = id; }
export function takePendingScopeOpen() { const id = pendingOpen; pendingOpen = null; return id; }
