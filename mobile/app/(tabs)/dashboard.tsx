import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import api from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import { Colors, Type, Radius } from "../../lib/theme";
import { DashboardStats, TopViolation, User } from "../../lib/types";
import { scanStatus, timeAgo } from "../../lib/format";

// Pulls from the existing LegalM /dashboard/stats and /dashboard/top-violations
// APIs — the same endpoints the web dashboard uses. No mock numbers.
export default function DashboardScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [violations, setViolations] = useState<TopViolation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [statsRes, violRes, storedUser] = await Promise.all([
        api.get<DashboardStats>("/dashboard/stats"),
        api.get<TopViolation[]>("/dashboard/top-violations"),
        getStoredUser(),
      ]);
      setStats(statsRes.data);
      setViolations(violRes.data);
      setUser(storedUser);
    } catch (e: any) {
      if (e?.response?.status === 401) router.replace("/(auth)/login");
      else setError("Failed to load dashboard. Is the backend reachable?");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cards = stats ? [
    { label: "Total Scans", value: stats.total_scans, sub: `${stats.scans_today} today`, icon: "📊", accent: Colors.secondary },
    { label: "Compliant", value: stats.compliant_count, sub: `${stats.compliance_rate}% rate`, icon: "✅", accent: Colors.statusPass },
    { label: "Violations", value: stats.non_compliant_count, sub: `Avg score ${stats.avg_compliance_score}%`, icon: "⚠️", accent: Colors.statusFail },
    { label: "Manual Review", value: stats.pending_reviews, sub: "Flagged for officer action", icon: "🔎", accent: Colors.statusReview },
  ] : [];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Inspector Overview"}
            </Text>
            <Text style={styles.headerSub}>Legal Metrology (PC) Rules, 2011</Text>
          </View>
          {user?.role && (
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{user.role}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
      >
        <TouchableOpacity style={styles.newScanBtn} onPress={() => router.push("/(tabs)/scan")} activeOpacity={0.85}>
          <Text style={styles.newScanIcon}>＋</Text>
          <Text style={styles.newScanText}>New Inspection</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={Colors.primary} />
        ) : error ? (
          <Card style={{ marginTop: 12 }}><Text style={styles.errorText}>{error}</Text></Card>
        ) : stats ? (
          <>
            <View style={styles.statGrid}>
              {cards.map((c) => (
                <Card key={c.label} style={styles.statCard}>
                  <View style={styles.statTopRow}>
                    <Text style={styles.statLabel}>{c.label}</Text>
                    <Text style={{ fontSize: 16 }}>{c.icon}</Text>
                  </View>
                  <Text style={[styles.statValue, { color: c.accent }]}>{c.value}</Text>
                  <Text style={styles.statSub}>{c.sub}</Text>
                </Card>
              ))}
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Scans</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/history")}>
                <Text style={styles.viewAll}>View All →</Text>
              </TouchableOpacity>
            </View>

            {stats.recent_scans.length === 0 ? (
              <Card><EmptyState icon="📷" title="No scans yet" subtitle="Start your first field inspection from the Scan tab." /></Card>
            ) : (
              <Card padded={false} style={{ overflow: "hidden" }}>
                {stats.recent_scans.slice(0, 5).map((scan, i) => (
                  <TouchableOpacity
                    key={scan.scan_id}
                    style={[styles.scanRow, i > 0 && styles.scanRowBorder]}
                    onPress={() => router.push({ pathname: "/result", params: { scan_id: scan.scan_id } })}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scanProduct} numberOfLines={1}>{scan.product_name || "Unknown Product"}</Text>
                      <Text style={styles.scanMeta}>
                        {scan.scan_id.slice(0, 8)} · {[scan.shop_name, scan.location].filter(Boolean).join(", ") || (scan.category || "General")} · {timeAgo(scan.created_at)}
                      </Text>
                    </View>
                    <StatusBadge status={scanStatus(scan)} size="sm" />
                  </TouchableOpacity>
                ))}
              </Card>
            )}

            {violations.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Top Manual Violations</Text>
                <Card>
                  {violations.slice(0, 5).map((v, i) => (
                    <View key={v.rule_code} style={[styles.violationRow, i > 0 && styles.scanRowBorder]}>
                      <Text style={styles.violationCode}>{v.rule_code}</Text>
                      <Text style={styles.violationCount}>{v.count} occurrences</Text>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerSafe: { backgroundColor: Colors.background },
  headerRow: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  greeting: { ...Type.headlineLg, color: Colors.onSurface },
  headerSub: { ...Type.bodyMd, color: Colors.onSurfaceVariant, marginTop: 2 },
  roleBadge: { backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2 },
  roleBadgeText: { ...Type.labelCaps, fontSize: 10, color: Colors.onSurface },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  newScanBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 15, marginBottom: 18,
  },
  newScanIcon: { color: Colors.onPrimary, fontSize: 18, fontWeight: "800" },
  newScanText: { color: Colors.onPrimary, fontSize: 15, fontWeight: "700" },
  errorText: { color: Colors.statusFail, fontSize: 13 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  statCard: { width: "47.5%", padding: 14, gap: 6 },
  statTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { ...Type.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant },
  statValue: { ...Type.headlineLg, fontSize: 26 },
  statSub: { ...Type.bodyMd, fontSize: 11, color: Colors.onSurfaceVariant },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { ...Type.headlineSm, color: Colors.onSurface },
  viewAll: { ...Type.bodyMd, color: Colors.secondary, fontWeight: "700" },
  scanRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  scanRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  scanProduct: { ...Type.bodyLg, fontWeight: "700", color: Colors.onSurface },
  scanMeta: { ...Type.bodyMd, fontSize: 11.5, color: Colors.onSurfaceVariant, marginTop: 2 },
  violationRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  violationCode: { ...Type.dataMono, color: Colors.statusFail, fontWeight: "700" },
  violationCount: { ...Type.bodyMd, color: Colors.onSurfaceVariant },
});
