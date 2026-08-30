import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import TopBar from "../../components/TopBar";
import OfflineBanner from "../../components/OfflineBanner";
import api from "../../lib/api";
import { Colors, Type, Radius } from "../../lib/theme";
import { Scan, PRODUCT_CATEGORIES } from "../../lib/types";
import { formatDate, scanStatus } from "../../lib/format";
import { listQueuedScans, QueuedScan, resetToPending } from "../../lib/offlineQueue";
import { onQueueChange, triggerSync } from "../../lib/syncService";

const PAGE_SIZE = 15;
const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Compliant", value: "pass" },
  { label: "Non-Compliant", value: "fail" },
  { label: "Needs Review", value: "review" },
];

export default function HistoryScreen() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Offline queue state
  const [queuedScans, setQueuedScans] = useState<QueuedScan[]>([]);

  async function refreshQueue() {
    const items = await listQueuedScans();
    setQueuedScans(items);
  }

  // Keep queue list in sync with any uploads happening in the background
  useEffect(() => {
    refreshQueue();
    const unsub = onQueueChange(refreshQueue);
    return unsub;
  }, []);

  const fetchPage = useCallback(async (page: number, isRefresh = false) => {
    try {
      // Same endpoint + query params as the web app's history page
      // (GET /scan/?category=&is_compliant=&pipeline_status=). The backend
      // has no free-text search param, so — like the web app does for its
      // "q" query — we filter by search client-side on the fetched page.
      const params: Record<string, any> = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (category) params.category = category;
      if (status === "pass") params.is_compliant = "true";
      if (status === "fail") params.is_compliant = "false";
      if (status === "review") params.pipeline_status = "review_needed";
      const res = await api.get<Scan[]>("/scan/", { params });
      let results = res.data;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        results = results.filter((s) =>
          s.scan_id.toLowerCase().includes(q) ||
          s.product_name?.toLowerCase().includes(q) ||
          s.brand_name?.toLowerCase().includes(q)
        );
      }
      setScans((prev) => (page === 0 ? results : [...prev, ...results]));
      setHasMore(res.data.length === PAGE_SIZE);
      setError("");
    } catch (e: any) {
      if (e?.response?.status === 401) router.replace("/(auth)/login");
      else setError("Failed to load scan history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [category, search, status, router]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchPage(0); refreshQueue(); }, [fetchPage]));

  function onRefresh() {
    setRefreshing(true);
    fetchPage(0, true);
    refreshQueue();
  }

  function onLoadMore() {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchPage(Math.floor(scans.length / PAGE_SIZE));
  }

  function applyFilters() {
    setFiltersOpen(false);
    setLoading(true);
    fetchPage(0);
  }

  function clearFilters() {
    setCategory("");
    setStatus("");
    setFiltersOpen(false);
    setLoading(true);
    fetchPage(0);
  }

  const activeFilterCount = (category ? 1 : 0) + (status ? 1 : 0);

  return (
    <View style={styles.container}>
      <TopBar title="Scan History" subtitle="Real records from the LegalM backend" onSearchPress={() => setSearchOpen((v) => !v)} />
      <OfflineBanner />

      {searchOpen && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Scan ID, product, manufacturer…"
            placeholderTextColor={Colors.onSurfaceMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => { setLoading(true); fetchPage(0); }}
            autoFocus
          />
          <TouchableOpacity onPress={() => { setLoading(true); fetchPage(0); }}>
            <Text style={styles.searchGo}>Go</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filterBar}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setFiltersOpen(true)}>
          <Text style={styles.filterBtnText}>☰ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</Text>
        </TouchableOpacity>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={clearFilters}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>
        )}
        <Text style={styles.countText}>{scans.length} shown</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : error ? (
        <EmptyState icon="⚠️" title="Couldn't load history" subtitle={error} />
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.scan_id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            queuedScans.length > 0 ? (
              <View style={styles.queueSection}>
                <Text style={styles.queueSectionTitle}>
                  ⏳ Pending Upload ({queuedScans.length})
                </Text>
                {queuedScans.map((item) => (
                  <QueuedScanCard
                    key={item.localId}
                    item={item}
                    onRetry={async () => {
                      await resetToPending(item.localId);
                      await triggerSync();
                    }}
                  />
                ))}
                <View style={styles.queueDivider} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            queuedScans.length === 0
              ? <EmptyState icon="📋" title="No scans found" subtitle="Try adjusting your filters, or start a new inspection." />
              : null
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} /> : null}
          renderItem={({ item }) => <ScanCard scan={item} onPress={() => router.push({ pathname: "/result", params: { scan_id: item.scan_id } })} />}
        />
      )}

      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Filter Scans</Text>

            <Text style={styles.filterLabel}>Category</Text>
            <View style={styles.chipRow}>
              <Chip label="All" active={!category} onPress={() => setCategory("")} />
              {PRODUCT_CATEGORIES.map((c) => (
                <Chip key={c.value} label={c.label} active={category === c.value} onPress={() => setCategory(c.value)} />
              ))}
            </View>

            <Text style={styles.filterLabel}>Compliance Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((s) => (
                <Chip key={s.value} label={s.label} active={status === s.value} onPress={() => setStatus(s.value)} />
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalClear} onPress={clearFilters}>
                <Text style={styles.modalClearText}>Clear Filters</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalApply} onPress={applyFilters}>
                <Text style={styles.modalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ScanCard({ scan, onPress }: { scan: Scan; onPress: () => void }) {
  const st = scanStatus(scan);
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <Card style={styles.scanCard}>
        <View style={styles.scanCardTop}>
          <Text style={styles.scanId}>{scan.scan_id}</Text>
          <StatusBadge status={st} size="sm" />
        </View>
        <Text style={styles.scanProduct} numberOfLines={1}>{scan.product_name || "Unidentified Product"}</Text>
        <Text style={styles.scanManufacturer} numberOfLines={1}>{scan.brand_name || "Manufacturer not extracted"}</Text>
        <View style={styles.scanCardFooter}>
          <Text style={styles.scanNetQty}>{scan.extracted_fields?.net_quantity || "Net Qty —"}</Text>
          <Text style={styles.scanDate}>{formatDate(scan.created_at, { withTime: false })}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function QueuedScanCard({ item, onRetry }: { item: QueuedScan; onRetry: () => void }) {
  const statusColors: Record<string, string> = {
    pending: "#92400e",
    uploading: Colors.secondary,
    failed: Colors.statusFail,
  };
  const statusLabels: Record<string, string> = {
    pending: "Pending",
    uploading: "Uploading…",
    failed: `Failed (attempt ${item.retryCount})`,
  };
  const borderColor = statusColors[item.status] ?? Colors.borderSubtle;

  return (
    <Card style={[styles.scanCard, styles.queuedCard, { borderLeftColor: borderColor }]}>
      <View style={styles.scanCardTop}>
        <View style={styles.queueBadge}>
          <Text style={styles.queueBadgeText}>
            {item.status === "uploading" ? "⏫" : item.status === "failed" ? "⚠️" : "⏳"}
            {"  "}{statusLabels[item.status]}
          </Text>
        </View>
        <Text style={styles.scanDate}>{formatDate(item.createdAt, { withTime: false })}</Text>
      </View>

      <Text style={styles.scanProduct} numberOfLines={1}>
        {item.imageUris.length} photo{item.imageUris.length > 1 ? "s" : ""} · {item.category}
      </Text>

      {(item.gpsCity || item.location) ? (
        <Text style={styles.queueLocation} numberOfLines={1}>
          📍 {item.gpsCity
            ? [item.gpsCity, item.gpsDistrict, item.gpsState].filter(Boolean).join(", ")
            : item.location}
        </Text>
      ) : null}

      {item.shopName ? (
        <Text style={styles.scanManufacturer} numberOfLines={1}>🏪 {item.shopName}</Text>
      ) : null}

      {item.status === "failed" && (
        <View style={styles.queueRetryRow}>
          <Text style={styles.queueError} numberOfLines={1}>{item.lastError}</Text>
          <TouchableOpacity style={styles.queueRetryBtn} onPress={onRetry}>
            <Text style={styles.queueRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  searchInput: { flex: 1, borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.onSurface, backgroundColor: Colors.surfaceContainerLow },
  searchGo: { color: Colors.secondary, fontWeight: "700", fontSize: 13 },
  filterBar: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.borderSubtle },
  filterBtnText: { fontSize: 12, fontWeight: "700", color: Colors.onSurface },
  clearText: { fontSize: 12, color: Colors.secondary, fontWeight: "700" },
  countText: { marginLeft: "auto", fontSize: 11, color: Colors.onSurfaceMuted },
  scanCard: { marginBottom: 12 },
  scanCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  scanId: { ...Type.dataMono, fontWeight: "700", color: Colors.secondary },
  scanProduct: { ...Type.bodyLg, fontWeight: "700", color: Colors.onSurface },
  scanManufacturer: { ...Type.bodyMd, color: Colors.onSurfaceVariant, marginTop: 2 },
  scanCardFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  scanNetQty: { fontSize: 12, color: Colors.onSurface, fontWeight: "600" },
  scanDate: { fontSize: 12, color: Colors.onSurfaceMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "75%" },
  modalTitle: { ...Type.headlineSm, color: Colors.onSurface, marginBottom: 16 },
  filterLabel: { ...Type.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant, marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.borderSubtle, backgroundColor: Colors.surfaceContainerLow },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: "600" },
  chipTextActive: { color: Colors.onPrimary },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  modalClear: { flex: 1, borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT, alignItems: "center", paddingVertical: 13 },
  modalClearText: { color: Colors.onSurfaceVariant, fontWeight: "700", fontSize: 13 },
  modalApply: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.DEFAULT, alignItems: "center", paddingVertical: 13 },
  modalApplyText: { color: Colors.onPrimary, fontWeight: "700", fontSize: 13 },
  // Offline queue styles
  queueSection: { marginBottom: 4 },
  queueSectionTitle: { fontSize: 12, fontWeight: "800", color: "#92400e", marginBottom: 10, letterSpacing: 0.3, textTransform: "uppercase" },
  queueDivider: { height: 1, backgroundColor: Colors.borderSubtle, marginBottom: 16, marginTop: 4 },
  queuedCard: { borderLeftWidth: 3, opacity: 0.95 },
  queueBadge: { flexDirection: "row", alignItems: "center" },
  queueBadgeText: { fontSize: 12, fontWeight: "700", color: Colors.onSurfaceVariant },
  queueLocation: { fontSize: 12, color: Colors.secondary, marginTop: 2 },
  queueRetryRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  queueError: { flex: 1, fontSize: 11, color: Colors.statusFail },
  queueRetryBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.statusFail, borderRadius: Radius.DEFAULT },
  queueRetryText: { fontSize: 11, fontWeight: "700", color: "#fff" },
});
