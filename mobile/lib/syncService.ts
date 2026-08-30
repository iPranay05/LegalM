/**
 * Sync Service
 *
 * Drains the offline scan queue whenever connectivity is available.
 * Call startSyncService() once on app launch from _layout.tsx.
 */
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  listQueuedScans,
  markUploading,
  removeFromQueue,
  recordFailure,
  recoverStuckUploads,
  pruneOrphanedEntries,
  QueuedScan,
} from "./offlineQueue";
import api from "./api";

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

type SyncCallback = (localId: string, scanId: string) => void;
type QueueChangeCallback = () => void;

const successListeners = new Set<SyncCallback>();
const changeListeners  = new Set<QueueChangeCallback>();

export function onSyncSuccess(cb: SyncCallback): () => void {
  successListeners.add(cb);
  return () => successListeners.delete(cb);
}

export function onQueueChange(cb: QueueChangeCallback): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function notifyChange() {
  changeListeners.forEach((cb) => { try { cb(); } catch {} });
}

// ---------------------------------------------------------------------------
// Deduplication guard
//
// _syncLocked is set synchronously to true before the first await in
// triggerSync. Because JS is single-threaded, any concurrent call that
// arrives before the first await (i.e. in the same microtask tick) will
// see _syncLocked === true and bail out immediately.  This is the only
// reliable way to prevent duplicate uploads — a Promise reference check
// still has a one-tick window where two callers both see null.
// ---------------------------------------------------------------------------

let _syncLocked = false;

export async function triggerSync(): Promise<void> {
  if (_syncLocked) {
    console.log("[Sync] Skipped — already in progress");
    return;
  }
  // Set synchronously BEFORE any await so no concurrent call can slip through
  _syncLocked = true;
  try {
    await _doSync();
  } finally {
    _syncLocked = false;
  }
}

// ---------------------------------------------------------------------------
// Core sync loop
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

async function _doSync(): Promise<void> {
  console.log("[Sync] Starting…");

  // 1. Prune entries whose source images are gone from device cache
  try {
    const pruned = await pruneOrphanedEntries();
    if (pruned > 0) { console.log(`[Sync] Pruned ${pruned} orphaned entries`); notifyChange(); }
  } catch (e) { console.warn("[Sync] prune failed:", e); }

  // 2. Recover stuck "uploading" entries ONLY on app startup, not mid-sync.
  //    Calling recoverStuckUploads() here would reset any entry that was
  //    legitimately set to "uploading" 2 lines above by a concurrent call,
  //    causing it to be uploaded twice. We therefore do NOT call it here.
  //    It is called once at service start (before any upload begins).

  // 3. Read queue — skip anything already uploading (another session owns it)
  let queue: QueuedScan[];
  try {
    queue = await listQueuedScans();
  } catch (e) {
    console.warn("[Sync] Could not read queue:", e);
    return;
  }

  const pending = queue.filter(
    (s) =>
      s.status === "pending" ||
      (s.status === "failed" && s.retryCount < MAX_RETRIES)
    // Deliberately exclude "uploading" — those are owned by a concurrent session
  );

  console.log(`[Sync] ${pending.length} item(s) to upload`);
  for (const entry of pending) {
    await _uploadEntry(entry);
  }
  console.log("[Sync] Done");
}

async function _uploadEntry(entry: QueuedScan): Promise<void> {
  await markUploading(entry.localId);
  notifyChange();

  try {
    const isMulti  = entry.imageUris.length > 1;
    const endpoint = isMulti ? "/scan/upload-multi" : "/scan/upload";
    const fieldName = isMulti ? "files" : "file";
    const formData  = new FormData();

    entry.imageUris.forEach((uri, i) => {
      const filename = uri.split("/").pop() || `label_${i}.jpg`;
      const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
      formData.append(fieldName, {
        uri,
        name: filename,
        type: ext === "png" ? "image/png" : "image/jpeg",
      } as any);
    });

    formData.append("category", entry.category);
    if (entry.shopName) formData.append("shop_name", entry.shopName);

    const locationText = entry.gpsCity && entry.gpsDistrict
      ? `${entry.gpsCity}, ${entry.gpsDistrict}`
      : entry.location;
    if (locationText)    formData.append("location", locationText);
    if (entry.gpsState)    formData.append("state",    entry.gpsState);
    if (entry.gpsDistrict) formData.append("district", entry.gpsDistrict);

    console.log("[Sync] Uploading", entry.localId, "→", endpoint);
    const res = await api.post(endpoint, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });

    console.log("[Sync] ✓ Uploaded", entry.localId, "→ scan_id:", res.data.scan_id);
    await removeFromQueue(entry.localId);
    notifyChange();
    successListeners.forEach((cb) => cb(entry.localId, res.data.scan_id));

  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.message || "Upload failed";
    console.warn("[Sync] ✗ Failed", entry.localId, "—", msg);
    await recordFailure(entry.localId, msg);
    notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Service bootstrap — call once on app launch
// ---------------------------------------------------------------------------

let _serviceStarted = false;

export function startSyncService(): void {
  if (_serviceStarted) return;
  _serviceStarted = true;

  // Recover any entries that were "uploading" when the app was last killed.
  // This is the ONLY place recoverStuckUploads() is called — before any
  // upload attempt, so there is no risk of resetting a live in-flight entry.
  recoverStuckUploads().catch(() => {}).then(() => {
    // First sync after recovery
    triggerSync().catch(() => {});
  });

  // Re-sync on reconnect — debounced by _syncLocked so rapid reconnect
  // events (which NetInfo fires multiple times) can't stack up
  NetInfo.addEventListener((state: NetInfoState) => {
    if (state.isConnected !== false) {
      triggerSync().catch(() => {});
    }
  });

  // Periodic fallback every 60 s
  setInterval(() => { triggerSync().catch(() => {}); }, 60_000);
}
