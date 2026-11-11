/**
 * cloudSync.ts
 *
 * The jobs, on the server.
 *
 * Korban has always kept its work in the browser: fast, private, and stuck on
 * one machine. This puts a copy on the company's account so the Mac at home
 * and the machine at the office are looking at the same book of jobs.
 *
 * The browser stays the working copy. Every page reads and writes localStorage
 * exactly as before - nothing in the app had to be rewritten - and this file
 * carries those writes up a moment later and brings down anything another
 * machine did. That matters: a sync that has to be waited on is a sync that
 * stops the estimator mid-takeoff when the wifi drops.
 *
 * Three decisions worth knowing, because they are what keeps this working as
 * the book of jobs grows:
 *
 *   The list comes down before the jobs. Signing in reads a line per job -
 *   name, number, when it was touched - and only fetches the jobs this
 *   machine is actually behind on. A company with three hundred jobs pulls
 *   three hundred short lines, not three hundred megabytes of geometry.
 *
 *   Jobs belong to the company, not the login. Working alone, that company
 *   has one member; the day a second estimator is added it is one row, not a
 *   migration against live work.
 *
 *   Nothing is ever hard deleted. A deleted job is stamped and kept, so the
 *   other machine learns to drop it instead of uploading it again, and a job
 *   deleted in error can be brought back.
 *
 * When two machines touched the same job, the newer one wins, by the record's
 * own updatedAt. One estimator on two machines is what this is for; two
 * people in one job at the same moment will want more than a timestamp.
 */

import { supabase } from "@/lib/supabase";
import {
  getBackendSettings,
  onBackendSettingsChanged,
  writeBackendSettingsFromCloud,
  BACKEND_SETTINGS_KEY,
  type BackendSettings,
} from "@/lib/backendStore";
import {
  getProjectData,
  onProjectDataChanged,
  writeProjectDataFromCloud,
  DEMO_PROJECT_ID,
  type ProjectData,
  type ProjectRecord,
} from "@/lib/projectStore";

/*
 * The Mare Island sample stays on whatever machine it was seeded on. It is
 * there to show what a finished job looks like, and an estimator signing in
 * on a new machine should not find a sample bid in their book - nor should
 * deleting it on one machine delete it on the other.
 */
const localOnly = (id: string) => id === DEMO_PROJECT_ID;

/**
 * A job that is nothing yet: no name, no customer, no number, no footage, no
 * plan, no scrub. Korban makes one whenever a fresh project is opened, and
 * most are never touched again. They stay on the machine until they become
 * something - the account is a book of jobs, not of blank pages.
 */
export function isBlankProject(project: ProjectRecord | undefined | null): boolean {
  if (!project) return true;
  if (project.projectName?.trim() || project.customer?.trim() || project.projectAddress?.trim()) return false;
  if (project.proposalNumber?.trim() || project.generalContractor?.trim()) return false;
  if (project.contactName?.trim() || project.bidDueDate?.trim()) return false;
  if ((project.scopeScrubs?.length ?? 0) > 0 || (project.bidRoundHistory?.length ?? 0) > 0 || project.currentFigures) return false;
  for (const level of project.takeoff?.levels ?? []) {
    for (const elevation of level.elevations ?? []) {
      if ((elevation.linearFeet ?? 0) > 0) return false;
      if (elevation.quickBid) return false;
      if ((elevation.overlayGeometry?.tracedPerimeter?.length ?? 0) > 0) return false;
      if ((elevation.overlayGeometry?.fullOverlayRows?.length ?? 0) > 0) return false;
    }
  }
  return true;
}

export type SyncState =
  | { status: "off" }                                  // nobody signed in
  | { status: "working"; note: string }                // pulling or pushing
  | { status: "synced"; at: string; email: string }    // everything is up
  | { status: "offline"; note: string }                // tried, could not reach
  | { status: "error"; note: string };

type Listener = (state: SyncState) => void;

let state: SyncState = { status: "off" };
const listeners = new Set<Listener>();

function setState(next: SyncState) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function getSyncState(): SyncState {
  return state;
}

export function onSyncState(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** The line per job that the list query returns. No geometry, no strokes. */
type ProjectLine = {
  id: string; updated_at: string; deleted_at: string | null;
  name: string; customer: string; proposal_number: string;
};
type ProjectRow = ProjectLine & { data: ProjectRecord };
type SettingsRow = { data: BackendSettings; updated_at: string };

/** When a record was last touched, as a number. Unknown counts as the beginning of time. */
function stamp(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The columns the Bid Room reads, lifted out of the record so a list of jobs
 * can be drawn without opening one. They are a copy, not the truth - the
 * record inside `data` is - and they are rewritten on every push.
 */
function summaryOf(project: ProjectRecord) {
  return {
    name: project.projectName ?? "",
    customer: project.customer ?? "",
    proposal_number: project.proposalNumber ?? "",
    bid_status: project.bidStatus ?? "",
    bid_round: project.bidRound ?? "",
    final_bid: Math.round(project.currentFigures?.finalBid ?? 0),
    bid_due_date: project.bidDueDate ?? "",
  };
}

/* What has already gone up, so a save that changed nothing does not write. */
const pushed = new Map<string, string>();

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

let orgId = "";
let ownerId = "";
let ownerEmail = "";
let started = false;
let pushTimer: number | null = null;
const dirtyProjects = new Set<string>();
let dirtySettings = false;
/** Rows this machine has just written, so its own echo is not re-applied. */
let applyingFromCloud = false;
/** Jobs deleted here, waiting to be stamped on the server. */
const pendingDeletes = new Set<string>();

/**
 * The company this login belongs to.
 *
 * Every account is given one the moment it is created (a trigger on the
 * database side), so this only reads - if it finds nothing, something is
 * wrong with the account rather than with this machine, and saying so is
 * more use than quietly making a second company.
 */
async function findOrg(): Promise<string> {
  const { data, error } = await supabase
    .from("members")
    .select("org_id")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as { org_id: string } | null;
  if (!row?.org_id) throw new Error("This login isn't attached to a company yet. Run the Korban database setup, or ask for a seat.");
  return row.org_id;
}

/**
 * Brings the server's copy down and merges it into the browser's.
 *
 * The list first: a line per job. Only the jobs this machine is behind on
 * are fetched in full, and only the jobs the server has never seen go up.
 */
async function pullEverything() {
  setState({ status: "working", note: "Checking your jobs" });

  const { data: lines, error } = await supabase
    .from("projects")
    .select("id, updated_at, deleted_at, name, customer, proposal_number")
    .eq("org_id", orgId);
  if (error) throw error;

  const local = getProjectData();
  const merged: ProjectData = { ...local };
  const fetchIds: string[] = [];
  const toPush: string[] = [];
  const toStamp: string[] = [];
  const seen = new Set<string>();

  for (const line of (lines ?? []) as ProjectLine[]) {
    seen.add(line.id);
    const mine = local[line.id];

    /*
     * Deleted elsewhere. A real job here goes too - unless it was worked on
     * after the delete, in which case the work wins and the job comes back.
     * A blank page here is this machine's own and is left alone: taking it
     * away could pull the project out from under an estimator who has just
     * opened it.
     */
    if (line.deleted_at) {
      pushed.delete(line.id);
      if (!mine || isBlankProject(mine)) continue;
      if (stamp(mine.updatedAt) > stamp(line.deleted_at)) toPush.push(line.id);
      else delete merged[line.id];
      continue;
    }

    // A blank page that got onto the account before blanks were kept off it.
    const lineBlank = !line.name && !line.customer && !line.proposal_number;
    if (lineBlank && mine && isBlankProject(mine)) { toStamp.push(line.id); continue; }

    if (!mine) { fetchIds.push(line.id); continue; }
    const serverAt = stamp(line.updated_at);
    const mineAt = stamp(mine.updatedAt);
    if (serverAt > mineAt) fetchIds.push(line.id);
    else if (mineAt > serverAt) toPush.push(line.id);
    else pushed.set(line.id, mine.updatedAt);
  }

  // Anything here the server has never seen: this browser's existing book of jobs.
  for (const id of Object.keys(local)) {
    if (!seen.has(id) && !localOnly(id) && !pendingDeletes.has(id) && !isBlankProject(local[id])) toPush.push(id);
  }

  // The jobs this machine is behind on, fetched in one go.
  if (fetchIds.length > 0) {
    setState({ status: "working", note: `Fetching ${fetchIds.length} job${fetchIds.length === 1 ? "" : "s"}` });
    const { data: rows, error: rowError } = await supabase
      .from("projects")
      .select("id, data, updated_at, deleted_at")
      .eq("org_id", orgId)
      .in("id", fetchIds);
    if (rowError) throw rowError;
    for (const row of (rows ?? []) as unknown as ProjectRow[]) {
      if (row.deleted_at || !row.data) continue;
      // Blank on the account and nothing here: not worth bringing down, and not worth keeping up.
      if (isBlankProject(row.data)) { toStamp.push(row.id); continue; }
      merged[row.id] = row.data;
      pushed.set(row.id, row.data.updatedAt ?? "");
    }
  }

  applyingFromCloud = true;
  try { writeProjectDataFromCloud(merged); } finally { applyingFromCloud = false; }

  // Settings: one row, same rule.
  const { data: settingsRow, error: settingsError } = await supabase
    .from("settings")
    .select("data, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (settingsError) throw settingsError;

  const row = settingsRow as SettingsRow | null;
  if (row && stamp(row.updated_at) > stamp(localSettingsStamp())) {
    applyingFromCloud = true;
    try { writeBackendSettingsFromCloud(row.data); } finally { applyingFromCloud = false; }
    touchLocalSettings(row.updated_at);
  } else {
    await pushSettings(getBackendSettings());
  }

  if (toPush.length > 0) {
    setState({ status: "working", note: `Uploading ${toPush.length} job${toPush.length === 1 ? "" : "s"}` });
    const now = getProjectData();
    for (const id of toPush) if (now[id]) await pushProject(now[id]);
  }

  // Blank pages come off the account. Stamped, like any delete.
  for (const id of toStamp) await markDeleted(id);

  done();
}

/**
 * When the settings were last written here.
 *
 * Backend settings carry no timestamp of their own, so the browser keeps one
 * beside them; a machine that has never saved settings reads as the beginning
 * of time and takes the company's.
 */
const SETTINGS_STAMP_KEY = `${BACKEND_SETTINGS_KEY}_touchedAt`;

function localSettingsStamp(): string {
  try { return window.localStorage.getItem(SETTINGS_STAMP_KEY) ?? ""; } catch { return ""; }
}

function touchLocalSettings(at: string) {
  try { window.localStorage.setItem(SETTINGS_STAMP_KEY, at); } catch { /* storage unavailable */ }
}

async function pushProject(project: ProjectRecord) {
  const { error } = await supabase.from("projects").upsert({
    org_id: orgId,
    id: project.projectId,
    owner: ownerId,
    ...summaryOf(project),
    data: project,
    updated_at: project.updatedAt || new Date().toISOString(),
    deleted_at: null,
  });
  if (error) throw error;
  pushed.set(project.projectId, project.updatedAt);
}

async function pushSettings(settings: BackendSettings) {
  const at = new Date().toISOString();
  const { error } = await supabase.from("settings").upsert({ org_id: orgId, data: settings, updated_at: at });
  if (error) throw error;
  touchLocalSettings(at);
}

/** Stamped, not removed: the other machines need to hear about it. */
async function markDeleted(id: string) {
  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  pushed.delete(id);
  pendingDeletes.delete(id);
}

function done() {
  setState({ status: "synced", at: new Date().toISOString(), email: ownerEmail });
}

/** A failed call is reported as offline, not as a lost job - the browser still has it. */
function stumbled(e: unknown) {
  const note = e instanceof Error ? e.message : "Could not reach the server";
  setState(/fetch|network|Failed to fetch|NetworkError/i.test(note)
    ? { status: "offline", note: "Working offline - your jobs are safe on this machine" }
    : { status: "error", note });
}

/*
 * Writes are gathered for a couple of seconds before going up. An estimator
 * dragging a leg across the plan saves on every frame; the server only needs
 * where the leg stopped.
 */
const PUSH_DELAY_MS = 2000;

function schedulePush() {
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { void flush(); }, PUSH_DELAY_MS);
}

async function flush() {
  pushTimer = null;
  if (!orgId) return;
  const ids = [...dirtyProjects].filter((id) => !localOnly(id));
  dirtyProjects.clear();
  const settingsWanted = dirtySettings;
  dirtySettings = false;
  if (ids.length === 0 && !settingsWanted) return;

  setState({ status: "working", note: "Saving to your account" });
  try {
    const data = getProjectData();
    for (const id of ids) {
      const project = data[id];
      if (!project) { await markDeleted(id); continue; }
      if (isBlankProject(project)) continue; // goes up when it becomes a job
      if (pushed.get(id) === project.updatedAt) continue;
      await pushProject(project);
    }
    if (settingsWanted) await pushSettings(getBackendSettings());
    done();
  } catch (e) {
    // Put them back: a job that failed to go up is still dirty.
    ids.forEach((id) => dirtyProjects.add(id));
    if (settingsWanted) dirtySettings = true;
    stumbled(e);
  }
}

/**
 * Starts syncing for whoever is signed in, and keeps running until they sign
 * out. Safe to call more than once; only the first call does anything.
 */
export function startCloudSync(): () => void {
  if (started || typeof window === "undefined") return () => { /* already running */ };
  started = true;

  const stopProjects = onProjectDataChanged((ids) => {
    if (applyingFromCloud || !orgId) return;
    const data = getProjectData();
    ids.forEach((id) => {
      if (localOnly(id)) return;
      if (!data[id]) pendingDeletes.add(id);
      dirtyProjects.add(id);
    });
    schedulePush();
  });
  const stopSettings = onBackendSettingsChanged(() => {
    if (applyingFromCloud || !orgId) return;
    touchLocalSettings(new Date().toISOString());
    dirtySettings = true;
    schedulePush();
  });

  async function signedIn(userId: string, email: string) {
    ownerId = userId;
    ownerEmail = email;
    pushed.clear();
    /*
     * Whose work is in this browser. If the last estimator signed in here
     * was someone else, their jobs must not be uploaded into this account,
     * so the machine is cleared first. A browser nobody has signed in on
     * keeps what it has - that is the book of jobs being brought aboard.
     */
    try {
      const last = window.localStorage.getItem(MACHINE_OWNER_KEY);
      if (last && last !== userId) clearThisMachine();
      window.localStorage.setItem(MACHINE_OWNER_KEY, userId);
    } catch { /* storage unavailable */ }
    try {
      orgId = await findOrg();
      await pullEverything();
    } catch (e) { stumbled(e); }
  }

  function signedOut() {
    ownerId = "";
    ownerEmail = "";
    orgId = "";
    pushed.clear();
    dirtyProjects.clear();
    pendingDeletes.clear();
    setState({ status: "off" });
  }

  void supabase.auth.getSession().then(({ data }) => {
    const user = data.session?.user;
    if (user) void signedIn(user.id, user.email ?? "");
    else setState({ status: "off" });
  }).catch(stumbled);

  const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (event === "SIGNED_OUT" || !user) { signedOut(); return; }
    if (user.id !== ownerId) void signedIn(user.id, user.email ?? "");
  });

  // Coming back to the tab: see what the other machine did while away.
  const onFocus = () => { if (orgId) void pullEverything().catch(stumbled); };
  window.addEventListener("focus", onFocus);

  // Leaving with work still queued: send it now rather than lose the last change.
  const onHide = () => {
    if (document.visibilityState === "hidden" && (dirtyProjects.size > 0 || dirtySettings)) void flush();
  };
  document.addEventListener("visibilitychange", onHide);

  return () => {
    stopProjects();
    stopSettings();
    authSub.subscription.unsubscribe();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onHide);
    started = false;
  };
}

/** Pull now, for the "check again" on the sync pill. */
export async function syncNow() {
  if (!orgId) return;
  await flush();
  try { await pullEverything(); } catch (e) { stumbled(e); }
}

const MACHINE_OWNER_KEY = "korbanMachineOwner";

/**
 * Takes Korban's work off this machine: jobs, settings, the open estimate.
 * Everything Korban keeps in the browser is under a "korban" key; the
 * sign-in session is Supabase's own and is not touched here.
 */
function clearThisMachine() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.toLowerCase().startsWith("korban")) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}

/**
 * Sign out, and leave nothing behind.
 *
 * The jobs come off this machine - a borrowed or shared computer should not
 * keep an estimator's bids - and come back from the account at the next
 * sign-in. That makes the order matter: anything not yet on the account is
 * sent first, and if it cannot be sent the sign-out is refused, because
 * clearing the machine then would be deleting the only copy.
 */
export async function signOutOfKorban(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const refused = { ok: false as const, reason: "Some work hasn't reached your account yet. Get back online and try again - signing out now would remove the only copy." };
  if (ownerId) {
    if (pushTimer !== null) { window.clearTimeout(pushTimer); pushTimer = null; }
    try {
      if (!orgId) orgId = await findOrg();
      // One last full check: anything this machine has that the account lacks goes up.
      await pullEverything();
      await flush();
    } catch { return refused; }
    if (dirtyProjects.size > 0 || dirtySettings || state.status === "offline" || state.status === "error") return refused;
  }
  await supabase.auth.signOut();
  clearThisMachine();
  return { ok: true };
}
