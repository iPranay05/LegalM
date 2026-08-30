/**
 * Offline Scan Queue
 *
 * Persists pending scans to AsyncStorage so they survive app restarts.
 * Each entry stores the image URIs, form fields, GPS data, and retry
 * metadata. The sync service drains this queue when connectivity returns.
 *
 * Storage key: OFFLINE_QUEUE_KEY → JSON array of QueuedScan
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_QUEUE_KEY = "legalm_offline_scan_queue";

export type QueuedScanStatus = "pending" | "uploading" | "failed";

export interface QueuedScan {
  /** Locally generated UUID — used as the list key before a real scan_id exists */
  localId: string;
  /** ISO timestamp of when the inspector submitted the scan */
  createdAt: string;
  /** Image file URIs (file:// paths on-device) */
  imageUris: string[];
  /** Form fields */
  category: string;
  shopName: string;
  location: string;
  /** GPS-derived fields — populated when location permission was granted */
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsState?: string;
  gpsDistrict?: string;
  gpsCity?: string;
  /** Upload state */
  status: QueuedScanStatus;
  /** Number of upload attempts made so far */
  retryCount: number;
  /** ISO timestamp of last failed attempt */
  lastAttemptAt?: string;
  /** Error message from last failed attempt */
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _readAll(): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

async function _writeAll(items: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Add a new scan to the offline queue. Returns the new entry. */
export async function enqueueOfflineScan(
  params: Omit<QueuedScan, "localId" | "createdAt" | "status" | "retryCount">
): Promise<QueuedScan> {
  const entry: QueuedScan = {
    ...params,
    localId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
  };
  const queue = await _readAll();
  await _writeAll([...queue, entry]);
  return entry;
}

/** Return all queued scans, newest first. */
export async function listQueuedScans(): Promise<QueuedScan[]> {
  const queue = await _readAll();
  return queue.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Return count of items that are pending or failed (not yet successfully uploaded). */
export async function pendingCount(): Promise<number> {
  const queue = await _readAll();
  return queue.filter((s) => s.status === "pending" || s.status === "failed").length;
}

/**
 * Remove entries whose source images no longer exist on the device.
 * This cleans up ghost entries left by old buggy sync sessions or
 * entries where the app cache was cleared.
 * Returns the number of entries pruned.
 */
export async function pruneOrphanedEntries(): Promise<number> {
  const queue = await _readAll();
  if (queue.length === 0) return 0;

  // expo-file-system legacy exports getInfoAsync as a named export directly
  let getInfoAsync: ((uri: string) => Promise<{ exists: boolean }>) | null = null;
  try {
    const fsModule = await import("expo-file-system/legacy");
    getInfoAsync = (fsModule as any).getInfoAsync ?? null;
  } catch {
    return 0;
  }
  if (!getInfoAsync) return 0;

  const survivors: QueuedScan[] = [];
  let pruned = 0;

  for (const entry of queue) {
    let hasFiles = false;
    for (const uri of entry.imageUris) {
      try {
        const info = await getInfoAsync(uri);
        if (info.exists) { hasFiles = true; break; }
      } catch { /* treat as missing */ }
    }
    if (hasFiles) {
      survivors.push(entry);
    } else {
      pruned++;
    }
  }

  if (pruned > 0) {
    await _writeAll(survivors);
  }
  return pruned;
}

/** Mark a scan as uploading (prevents duplicate concurrent uploads). */
export async function markUploading(localId: string): Promise<void> {
  const queue = await _readAll();
  await _writeAll(
    queue.map((s) =>
      s.localId === localId ? { ...s, status: "uploading" as QueuedScanStatus } : s
    )
  );
}

/** Remove a scan from the queue after successful upload. */
export async function removeFromQueue(localId: string): Promise<void> {
  const queue = await _readAll();
  await _writeAll(queue.filter((s) => s.localId !== localId));
}

/** Record a failed upload attempt, incrementing retryCount. */
export async function recordFailure(localId: string, error: string): Promise<void> {
  const queue = await _readAll();
  await _writeAll(
    queue.map((s) =>
      s.localId === localId
        ? {
            ...s,
            status: "failed" as QueuedScanStatus,
            retryCount: s.retryCount + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: error,
          }
        : s
    )
  );
}

/** Reset a failed scan back to pending so the sync service will retry it. */
export async function resetToPending(localId: string): Promise<void> {
  const queue = await _readAll();
  await _writeAll(
    queue.map((s) =>
      s.localId === localId ? { ...s, status: "pending" as QueuedScanStatus } : s
    )
  );
}

/** Reset all "uploading" entries back to "pending" — call on app launch to
 *  recover from entries stuck mid-upload if the app was killed. */
export async function recoverStuckUploads(): Promise<void> {
  const queue = await _readAll();
  const recovered = queue.map((s) =>
    s.status === "uploading" ? { ...s, status: "pending" as QueuedScanStatus } : s
  );
  await _writeAll(recovered);
}

/** Clear the entire queue. Use only for debug / factory-reset. */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}
