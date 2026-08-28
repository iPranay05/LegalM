import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import GovHeader from "../../components/GovHeader";
import { Colors } from "../../components/Colors";
import api from "../../lib/api";
import { Scan } from "../../lib/types";

export default function HistoryScreen() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchScans() {
    try {
      const res = await api.get("/scan/?limit=50");
      setScans(res.data);
    } catch (e) {
      // silently fail — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchScans();
    }, [])
  );

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function renderScan({ item }: { item: Scan }) {
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8}>
        <View style={styles.cardTop}>
          <View style={styles.cardMeta}>
            <Text style={styles.productName}>
              {item.product_name || "Unknown Product"}
            </Text>
            <Text style={styles.scanDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={[styles.badge,
            item.is_compliant === true ? styles.badgePass :
            item.is_compliant === false ? styles.badgeFail : styles.badgePending
          ]}>
            <Text style={[styles.badgeText,
              item.is_compliant === true ? styles.badgePassText :
              item.is_compliant === false ? styles.badgeFailText : styles.badgePendingText
            ]}>
              {item.is_compliant === true ? "PASS" :
               item.is_compliant === false ? "FAIL" : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Score</Text>
            <View style={styles.scoreBg}>
              <View
                style={[
                  styles.scoreFill,
                  { width: `${item.compliance_score || 0}%` },
                  item.is_compliant ? styles.scoreFillPass : styles.scoreFillFail,
                ]}
              />
            </View>
            <Text style={styles.scoreText}>
              {item.compliance_score?.toFixed(0) || 0}%
            </Text>
          </View>
          {item.shop_name ? (
            <Text style={styles.shopName}>📍 {item.shop_name}{item.location ? ` · ${item.location}` : ""}</Text>
          ) : null}
          {item.missing_fields && item.missing_fields.length > 0 && (
            <Text style={styles.missingInfo}>
              ⚠ {item.missing_fields.length} missing field{item.missing_fields.length > 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <GovHeader title="Scan History" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading scans…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GovHeader title="Scan History" subtitle={`${scans.length} total scans`} />
      <FlatList
        data={scans}
        keyExtractor={(item) => item.scan_id}
        renderItem={renderScan}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchScans(); }}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Scans Yet</Text>
            <Text style={styles.emptySub}>
              Scan a product label to see results here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardMeta: { flex: 1, marginRight: 10 },
  productName: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 2 },
  scanDate: { fontSize: 11, color: Colors.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgePass: { backgroundColor: Colors.successLight },
  badgeFail: { backgroundColor: Colors.dangerLight },
  badgePending: { backgroundColor: Colors.border },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  badgePassText: { color: Colors.success },
  badgeFailText: { color: Colors.danger },
  badgePendingText: { color: Colors.textMuted },
  cardBottom: { gap: 5 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scoreLabel: { fontSize: 11, color: Colors.textSecondary, width: 36 },
  scoreBg: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  scoreFill: { height: "100%", borderRadius: 3 },
  scoreFillPass: { backgroundColor: Colors.success },
  scoreFillFail: { backgroundColor: Colors.danger },
  scoreText: { fontSize: 11, fontWeight: "700", color: Colors.text, width: 32 },
  shopName: { fontSize: 11, color: Colors.textSecondary },
  missingInfo: { fontSize: 11, color: Colors.warning, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, color: Colors.textSecondary },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
});
