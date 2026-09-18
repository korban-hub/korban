/**
 * planStore.ts
 *
 * Keeps the plan set a takeoff was measured from.
 *
 * Everything else about a takeoff - traces, reference points, grips, scales -
 * fits in localStorage. The sheet does not: a plan set is megabytes, and
 * localStorage tops out around five. So it lives in IndexedDB, which is built
 * for exactly this and has no practical size limit.
 *
 * This matters more than it sounds. Without it, reopening Takeoff left an
 * estimator looking at an empty viewer with a perfectly good takeoff sitting
 * unreadable behind it - and the only way forward was to do the whole job
 * again. An overlay without its sheet is not a state the app should ever be
 * in; either the plans are loaded or they are not.
 */

const DB_NAME = "korban-plans";
const STORE = "sheets";
const VERSION = 1;

export type StoredPlan = {
  /** The file exactly as it was uploaded. */
  data: ArrayBuffer;
  fileName: string;
  /** image/png and friends render directly; application/pdf goes through pdf.js. */
  mimeType: string;
  /** Which page was open, so it reopens where it was left. */
  pageNumber: number;
  savedAt: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Keyed by project, so two bids never show each other's drawings. */
function key(projectId: string) {
  return `plan:${projectId}`;
}

export async function savePlanSheet(projectId: string, plan: StoredPlan): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(plan, key(projectId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    // A browser with IndexedDB disabled still works, it just forgets the sheet.
    return false;
  }
}

export async function loadPlanSheet(projectId: string): Promise<StoredPlan | null> {
  try {
    const db = await open();
    const plan = await new Promise<StoredPlan | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key(projectId));
      request.onsuccess = () => resolve((request.result as StoredPlan) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return plan;
  } catch {
    return null;
  }
}

/** Remembers the page without rewriting the file, which would be wasteful. */
export async function savePlanPage(projectId: string, pageNumber: number): Promise<void> {
  try {
    const existing = await loadPlanSheet(projectId);
    if (!existing) return;
    await savePlanSheet(projectId, { ...existing, pageNumber });
  } catch {
    // Not worth an error - it only costs the page number.
  }
}

export async function clearPlanSheet(projectId: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key(projectId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Nothing to clear, or nowhere to clear it from.
  }
}
