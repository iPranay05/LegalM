/**
 * OfflineBanner
 *
 * Shows a persistent amber banner when there are scans waiting in the
 * offline queue. Tapping "Sync now" triggers an immediate upload attempt.
 * Disappears automatically once the queue is empty.
 *
 * Mount this near the top of any screen that benefits from the indicator
 * (currently: scan.tsx, history.tsx). It subscribes to queue changes so
 * it updates without any prop-drilling.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { pendingCount, pruneOrphanedEntries } from "../lib/offlineQueue";
import { onQueueChange, triggerSync } from "../lib/syncService";
import { Colors, Radius } from "../lib/theme";

interface Props {
  /** Extra top margin — pass safeArea.top when rendering below a TopBar */
  marginTop?: number;
}

export default function OfflineBanner({ marginTop = 0 }: Props) {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    // Prune ghost entries first so count reflects reality
    try { await pruneOrphanedEntries(); } catch { /* non-fatal */ }
    const n = await pendingCount();
    setCount(n);
  }

  useEffect(() => {
    refresh();
    const unsub = onQueueChange(refresh);
    return unsub;
  }, []);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await triggerSync();
    } catch {
      // swallow — sync errors are recorded per-entry in the queue
    } finally {
      // Always re-enable the button and refresh count, even if sync threw
      await refresh();
      setSyncing(false);
    }
  }

  if (count === 0) return null;

  return (
    <View style={[styles.banner, { marginTop }]}>
      <View style={styles.left}>
        <Text style={styles.icon}>📶</Text>
        <View>
          <Text style={styles.title}>
            {count} scan{count > 1 ? "s" : ""} queued offline
          </Text>
          <Text style={styles.sub}>Will upload automatically when connected</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.syncBtn}
        onPress={handleSync}
        disabled={syncing}
        activeOpacity={0.75}
      >
        {syncing ? (
          <ActivityIndicator size="small" color={Colors.onPrimary} />
        ) : (
          <Text style={styles.syncBtnText}>Sync now</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#92400e",       // deep amber — clearly actionable
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: { fontSize: 18 },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 17,
  },
  sub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 15,
    marginTop: 1,
  },
  syncBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: Radius.DEFAULT,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    minWidth: 74,
    alignItems: "center",
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
});
