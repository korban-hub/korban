/**
 * presentationLink.ts
 *
 * Turns a bid presentation into a link and back again.
 *
 * There is no server yet, so the bid has to travel inside the URL. It rides
 * in the hash, which browsers never send anywhere - the deck is assembled
 * entirely in the recipient's browser and nothing about the job touches a
 * third party on the way.
 *
 * Keys are shortened and the traced outline is thinned before encoding,
 * because a link that wraps across four lines of an email does not get
 * clicked. A typical Korban Bid lands around 1.2kB encoded; the practical
 * ceiling in every current browser is far higher.
 */

import type { BidPresentationData } from "@/components/bid-presentation";

/** Long field name to short key. Order is irrelevant; the map is the contract. */
const KEYS: Record<keyof BidPresentationData, string> = {
  projectName: "a",
  projectAddress: "b",
  customer: "c",
  estimator: "d",
  proposalNumber: "e",
  bidDate: "f",
  depth: "g",
  company: "h",
  companyPhone: "i",
  companyEmail: "j",
  trade: "k",
  elevationsCovered: "l",
  linearFeet: "m",
  wallHeight: "n",
  frames: "o",
  planks: "p",
  crossBraces: "q",
  guardrails: "r",
  basePlates: "s",
  screwJacks: "t",
  couplingPins: "u",
  bays: "v",
  legs: "w",
  framesPerLeg: "x",
  jumps: "y",
  scaffoldWidth: "z",
  bayLength: "A",
  planksPerDeck: "B",
  erectDays: "C",
  dismantleDays: "D",
  crewSize: "E",
  erectHours: "F",
  dismantleHours: "G",
  rentalRevenue: "H",
  laborRevenue: "I",
  rentalDays: "J",
  finalBid: "K",
  buildingLevels: "L",
  outline: "M",
  elevations: "N",
};

const REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(KEYS).map(([long, short]) => [short, long])
);

/**
 * Drops points that barely bend the line. A traced perimeter often carries
 * far more points than the shape needs, and every one of them is characters
 * in somebody's address bar.
 */
function thinOutline(points: { x: number; y: number }[], limit = 56) {
  // Fifty-odd points draws the same building at deck size and keeps the link
  // short enough to survive an email client.
  if (points.length <= limit) {
    return points.map((point) => [Math.round(point.x), Math.round(point.y)]);
  }
  const step = points.length / limit;
  const kept: number[][] = [];
  for (let index = 0; index < limit; index++) {
    const point = points[Math.floor(index * step)];
    kept.push([Math.round(point.x), Math.round(point.y)]);
  }
  return kept;
}

function toBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encodes a presentation. Returns the hash payload, not a whole URL. */
export function encodePresentation(data: BidPresentationData): string {
  const compact: Record<string, unknown> = {};

  (Object.keys(KEYS) as (keyof BidPresentationData)[]).forEach((field) => {
    const value = data[field];
    if (value === undefined || value === null) return;
    if (typeof value === "number" && value === 0) return; // zero is the default
    if (typeof value === "string" && value === "") return;
    if (Array.isArray(value) && value.length === 0) return;

    if (field === "outline") {
      compact[KEYS[field]] = thinOutline(value as { x: number; y: number }[]);
    } else if (field === "elevations") {
      compact[KEYS[field]] = (value as { elevation: string; linearFeet: number }[]).map((row) => [
        row.elevation,
        Math.round(row.linearFeet),
      ]);
    } else if (typeof value === "number") {
      compact[KEYS[field]] = Math.round(value * 100) / 100;
    } else {
      compact[KEYS[field]] = value;
    }
  });

  return toBase64Url(JSON.stringify(compact));
}

/** Rebuilds a presentation from a hash payload. Null if it can't be read. */
export function decodePresentation(payload: string): BidPresentationData | null {
  try {
    const compact = JSON.parse(fromBase64Url(payload)) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    Object.entries(compact).forEach(([short, value]) => {
      const field = REVERSE[short];
      if (!field) return;
      if (field === "outline") {
        data.outline = (value as number[][]).map(([x, y]) => ({ x, y }));
      } else if (field === "elevations") {
        data.elevations = (value as [string, number][]).map(([elevation, linearFeet]) => ({
          elevation,
          linearFeet,
        }));
      } else {
        data[field] = value;
      }
    });

    // Anything the encoder dropped as a default comes back as one.
    return {
      projectName: "",
      projectAddress: "",
      customer: "",
      estimator: "",
      proposalNumber: "",
      bidDate: "",
      depth: "quick-bid",
      company: "",
      companyPhone: "",
      companyEmail: "",
      trade: "scaffold",
      elevationsCovered: [],
      linearFeet: 0,
      wallHeight: 0,
      frames: 0,
      planks: 0,
      crossBraces: 0,
      guardrails: 0,
      basePlates: 0,
      screwJacks: 0,
      couplingPins: 0,
      bays: 0,
      legs: 0,
      framesPerLeg: 0,
      jumps: 0,
      scaffoldWidth: 3,
      bayLength: 10,
      planksPerDeck: 3,
      erectDays: 0,
      dismantleDays: 0,
      crewSize: 0,
      erectHours: 0,
      dismantleHours: 0,
      rentalRevenue: 0,
      laborRevenue: 0,
      rentalDays: 30,
      finalBid: 0,
      buildingLevels: 1,
      outline: [],
      elevations: [],
      ...(data as Partial<BidPresentationData>),
    } as BidPresentationData;
  } catch {
    return null;
  }
}

/** The full link, ready to paste into an email. */
export function buildPresentationUrl(data: BidPresentationData): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/present#${encodePresentation(data)}`;
}
