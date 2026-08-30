import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  Modal, Dimensions, Alert, FlatList, TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
// expo-file-system v19 (SDK 54) deprecated cacheDirectory/downloadAsync in
// favor of the new File/Directory API. The legacy import keeps the same
// function-based API this screen (and downloadReport below) relies on.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import ScoreRing from "../components/ScoreRing";
import EmptyState from "../components/EmptyState";
import api, { API_BASE_URL } from "../lib/api";
import { Colors, Type, Radius, statusColor } from "../lib/theme";
import { ScanResultTabs, FieldTabEntry, ManualFinding, Report } from "../lib/types";
import { formatDate, scanStatus, statusLabel } from "../lib/format";

const SCREEN_W = Dimensions.get("window").width;
const POLL_INTERVAL_MS = 3000;
const PROCESSING_STATUSES = ["pending", "processing"];

type TabKey = "all" | "violations" | "relaxed" | "manual";

function imgUrl(path?: string) {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${clean}`;
}

export default function ResultScreen() {
  const { scan_id } = useLocalSearchParams<{ scan_id: string }>();
  const router = useRouter();

  const [pipelineStatus, setPipelineStatus] = useState<string>("pending");
  const [data, setData] = useState<ScanResultTabs | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [imageIndex, setImageIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerField, setViewerField] = useState<FieldTabEntry | null>(null);
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [findingModal, setFindingModal] = useState(false);
  const [findingText, setFindingText] = useState("");
  const [findingBusy, setFindingBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!scan_id) return;
    try {
      const res = await api.get(`/scan/${scan_id}/status`);
      setPipelineStatus(res.data.pipeline_status);
      return res.data.pipeline_status as string;
    } catch (e: any) {
      if (e?.response?.status === 404) setError("Scan not found.");
      return "failed";
    }
  }, [scan_id]);

  const fetchResult = useCallback(async () => {
    if (!scan_id) return;
    try {
      const [resultRes, reportsRes] = await Promise.all([
        api.get<ScanResultTabs>(`/scan/${scan_id}/result-tabs`),
        api.get<Report[]>(`/reports/scan/${scan_id}`).catch(() => ({ data: [] as Report[] })),
      ]);
      setData(resultRes.data);
      setReports(reportsRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load compliance result.");
    }
  }, [scan_id]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const status = await fetchStatus();
      if (cancelled) return;
      if (status && !PROCESSING_STATUSES.includes(status)) {
        await fetchResult();
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }

    tick();
    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus, fetchResult]);

  const isProcessing = PROCESSING_STATUSES.includes(pipelineStatus) && !data;

  async function generateReport(fmt: "pdf" | "docx") {
    if (!scan_id) return;
    setReportBusy(fmt);
    try {
      const res = await api.post(`/reports/generate/${scan_id}`, null, { params: { fmt } });
      setReports((prev) => [res.data, ...prev]);
      await downloadReport(res.data, fmt);
    } catch (e: any) {
      Alert.alert("Report Failed", e?.response?.data?.detail || "Could not generate report.");
    } finally {
      setReportBusy(null);
    }
  }

  async function downloadReport(report: Report, fmt: string) {
    try {
      const dest = `${FileSystem.cacheDirectory}${report.report_id}.${fmt}`;
      // The axios instance attaches the bearer token via a request
      // interceptor (not api.defaults.headers), so for this raw
      // FileSystem download we read the same SecureStore token directly —
      // same auth scheme as every other authenticated call.
      const token = await SecureStore.getItemAsync("auth_token");
      const downloadRes = await FileSystem.downloadAsync(
        `${API_BASE_URL}/reports/download/${report.report_id}`,
        dest,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      try {
        const Sharing = await import("expo-sharing");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadRes.uri);
          return;
        }
      } catch { /* expo-sharing not installed — fall through */ }
      Alert.alert("Report Saved", `Saved to app cache:\n${downloadRes.uri}`);
    } catch (e: any) {
      Alert.alert("Download Failed", "Could not download the report file.");
    }
  }

  async function submitFinding() {
    if (!scan_id || !findingText.trim()) return;
    setFindingBusy(true);
    try {
      const res = await api.post(`/scan/${scan_id}/findings`, {
        description: findingText.trim(),
        finding_type: "manual_note",
        severity: "medium",
      });
      setData((prev) => prev ? { ...prev, manual_findings: [res.data, ...prev.manual_findings] } : prev);
      setFindingText("");
      setFindingModal(false);
    } catch (e: any) {
      Alert.alert("Failed", e?.response?.data?.detail || "Could not add finding.");
    } finally {
      setFindingBusy(false);
    }
  }

  if (error && !data) {
    return (
      <View style={styles.container}>
        <TopBarSimple title="Scan Result" onBack={() => router.back()} />
        <EmptyState icon="⚠️" title="Something went wrong" subtitle={error} />
      </View>
    );
  }

  if (isProcessing) {
    return <ProcessingView scanId={String(scan_id)} status={pipelineStatus} onCancel={() => router.back()} />;
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <TopBarSimple title="Scan Result" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      </View>
    );
  }

  const { scan, all_rules, violations, not_applicable_relaxed, manual_findings } = data;
  const status = scanStatus(scan);
  const images = scan.image_paths?.length ? scan.image_paths : (scan.image_path ? [scan.image_path] : []);

  const tabData: Record<TabKey, { label: string; count: number }> = {
    all: { label: "All Rules", count: all_rules.length },
    violations: { label: "Violations", count: violations.length },
    relaxed: { label: "N/A / Relaxed", count: not_applicable_relaxed.length },
    manual: { label: "Manual", count: manual_findings.length },
  };

  const activeEntries: FieldTabEntry[] = tab === "all" ? all_rules : tab === "violations" ? violations : tab === "relaxed" ? not_applicable_relaxed : [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TopBarSimple title={scan.product_name || "Scan Result"} subtitle={scan.scan_id} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {images.length > 0 && (
          <View>
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, i) => `${uri}-${i}`}
              onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.9} onPress={() => { setViewerField(null); setViewerOpen(true); }}>
                  <Image source={{ uri: imgUrl(item) }} style={styles.heroImage} resizeMode="cover" />
                </TouchableOpacity>
              )}
            />
            {images.length > 1 && (
              <View style={styles.dotsRow}>
                {images.map((_, i) => <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />)}
              </View>
            )}
            <View style={styles.zoomHint}><Text style={styles.zoomHintText}>🔍 Tap to zoom</Text></View>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.statusRow}>
            <StatusBadge status={status} />
            <Text style={styles.dateText}>{formatDate(scan.created_at)}</Text>
          </View>

          <Text style={styles.productName}>{scan.product_name || "Unidentified Product"}</Text>
          {scan.brand_name ? <Text style={styles.brandName}>{scan.brand_name}</Text> : null}

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryScore}>
                <ScoreRing score={scan.compliance_score ?? 0} size={84} strokeWidth={8} />
                <Text style={styles.summaryScoreLabel}>Compliance Score</Text>
              </View>
              <View style={styles.summaryFields}>
                <SummaryField label="Scan ID" value={scan.scan_id} mono />
                <SummaryField label="Category" value={scan.category || "—"} />
                <SummaryField label="Net Quantity" value={scan.extracted_fields?.net_quantity || "—"} />
                <SummaryField label="MRP" value={scan.extracted_fields?.mrp || "—"} />
                {scan.shop_name ? <SummaryField label="Shop" value={scan.shop_name} /> : null}
              </View>
            </View>
            {scan.compliance_summary && (
              <View style={styles.summaryFooter}>
                <Text style={styles.summaryFooterText}>
                  {scan.compliance_summary.counts?.Pass ?? 0}/{scan.compliance_summary.total} rules passed
                  {violations.length > 0 ? ` · ${violations.length} violation${violations.length > 1 ? "s" : ""}` : ""}
                </Text>
              </View>
            )}
          </Card>

          {scan.symbols_detected && (
            <View style={styles.symbolsRow}>
              <SymbolPill label="Veg Mark" ok={scan.symbols_detected.veg_dot} />
              <SymbolPill label="Non-Veg Mark" ok={scan.symbols_detected.non_veg_dot} />
              <SymbolPill label="GM Declaration" ok={scan.symbols_detected.gm_mark} />
            </View>
          )}

          {scan.barcode_data?.decoded && scan.barcode_data.primary_barcode && (
            <Card style={{ marginBottom: 16 }}>
              <Text style={styles.cardHeading}>Barcode Data</Text>
              <Text style={styles.mono}>{scan.barcode_data.primary_barcode}</Text>
              {scan.barcode_data.product_info && Object.entries(scan.barcode_data.product_info).slice(0, 4).map(([k, v]) => (
                <Text key={k} style={styles.barcodeInfoLine}>{k}: {String(v)}</Text>
              ))}
            </Card>
          )}

          <View style={styles.tabBar}>
            {(Object.keys(tabData) as TabKey[]).map((key) => (
              <TouchableOpacity key={key} style={[styles.tabBtn, tab === key && styles.tabBtnActive]} onPress={() => setTab(key)}>
                <Text style={[styles.tabBtnText, tab === key && styles.tabBtnTextActive]}>
                  {tabData[key].label} {tabData[key].count > 0 ? `(${tabData[key].count})` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "manual" ? (
            <View>
              <TouchableOpacity style={styles.addFindingBtn} onPress={() => setFindingModal(true)}>
                <Text style={styles.addFindingBtnText}>＋ Add Manual Finding</Text>
              </TouchableOpacity>
              {manual_findings.length === 0 ? (
                <EmptyState icon="📝" title="No manual findings" subtitle="Findings recorded by inspectors during physical checks appear here." />
              ) : manual_findings.map((f) => <ManualFindingCard key={f.id} finding={f} />)}
            </View>
          ) : activeEntries.length === 0 ? (
            <EmptyState
              icon={tab === "violations" ? "🎉" : "📄"}
              title={tab === "violations" ? "No violations found" : "Nothing in this tab"}
              subtitle={tab === "violations" ? "This scan passed every applicable rule." : undefined}
            />
          ) : (
            activeEntries.map((entry) => (
              <FieldEntryCard
                key={entry.key}
                entry={entry}
                onViewEvidence={images.length > 0 ? () => { setViewerField(entry); setViewerOpen(true); } : undefined}
              />
            ))
          )}

          <View style={styles.actionsSection}>
            <Text style={styles.cardHeading}>Report</Text>
            <View style={styles.reportRow}>
              <TouchableOpacity style={styles.reportBtn} onPress={() => generateReport("pdf")} disabled={!!reportBusy}>
                {reportBusy === "pdf" ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={styles.reportBtnText}>📄 PDF Report</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportBtn} onPress={() => generateReport("docx")} disabled={!!reportBusy}>
                {reportBusy === "docx" ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={styles.reportBtnText}>📝 DOCX Report</Text>}
              </TouchableOpacity>
            </View>
            {reports.length > 0 && (
              <Text style={styles.reportHistoryNote}>
                {reports.length} report{reports.length > 1 ? "s" : ""} previously generated for this scan.
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.scanAnotherBtn} onPress={() => router.replace("/(tabs)/scan")}>
            <Text style={styles.scanAnotherText}>🔍  Scan Another Product</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <EvidenceViewer
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
        imageUrl={imgUrl(images[imageIndex])}
        field={viewerField}
      />

      <Modal visible={findingModal} transparent animationType="fade" onRequestClose={() => setFindingModal(false)}>
        <View style={styles.findingOverlay}>
          <View style={styles.findingCard}>
            <Text style={styles.findingTitle}>Add Manual Finding</Text>
            <TextInput
              style={styles.findingInput}
              value={findingText}
              onChangeText={setFindingText}
              placeholder="Describe what you observed during the physical check…"
              placeholderTextColor={Colors.onSurfaceMuted}
              multiline
              numberOfLines={4}
            />
            <View style={styles.findingActions}>
              <TouchableOpacity style={styles.findingCancel} onPress={() => setFindingModal(false)}>
                <Text style={styles.findingCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.findingSubmit} onPress={submitFinding} disabled={findingBusy || !findingText.trim()}>
                {findingBusy ? <ActivityIndicator color={Colors.onPrimary} size="small" /> : <Text style={styles.findingSubmitText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function TopBarSimple({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={styles.topBarSafe}>
      <View style={styles.topBarRow}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={{ marginRight: 10 }}>
          <Text style={styles.topBarBack}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.topBarSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function SummaryField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.summaryFieldRow}>
      <Text style={styles.summaryFieldLabel}>{label}</Text>
      <Text style={[styles.summaryFieldValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SymbolPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[styles.symbolPill, { borderColor: ok ? Colors.statusPass : Colors.outlineVariant, backgroundColor: ok ? "rgba(16,185,129,0.08)" : Colors.surfaceContainerLow }]}>
      <Text style={{ fontSize: 12 }}>{ok ? "✅" : "—"}</Text>
      <Text style={[styles.symbolPillText, { color: ok ? Colors.statusPass : Colors.onSurfaceMuted }]}>{label}</Text>
    </View>
  );
}

function resultColor(result?: string) {
  if (result === "Pass") return Colors.statusPass;
  if (result === "Fail") return Colors.statusFail;
  if (result === "ManualReviewRequired") return Colors.statusReview;
  return Colors.onSurfaceMuted;
}
function resultIcon(result?: string) {
  if (result === "Pass") return "✓";
  if (result === "Fail") return "✕";
  if (result === "ManualReviewRequired") return "⚠";
  return "–";
}

function FieldEntryCard({ entry, onViewEvidence }: { entry: FieldTabEntry; onViewEvidence?: () => void }) {
  const [expanded, setExpanded] = useState(entry.result === "Fail");
  const color = resultColor(entry.result);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => setExpanded((v) => !v)}>
      <Card style={[styles.fieldCard, { borderLeftWidth: 3, borderLeftColor: color }]}>
        <View style={styles.fieldCardHeader}>
          <View style={[styles.fieldIconWrap, { backgroundColor: color + "22" }]}>
            <Text style={{ color, fontWeight: "800", fontSize: 13 }}>{resultIcon(entry.result)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{entry.label}</Text>
            {entry.legal_reference ? <Text style={styles.fieldRef}>{entry.legal_reference}</Text> : null}
          </View>
        </View>
        {expanded && (
          <View style={styles.fieldBody}>
            <View style={styles.fieldValueRow}>
              <Text style={styles.fieldValueLabel}>Detected</Text>
              <Text style={styles.fieldValueText} numberOfLines={2}>{entry.extracted_value || "Not found"}</Text>
            </View>
            {entry.notes ? <Text style={styles.fieldNotes}>{entry.notes}</Text> : null}
            {onViewEvidence && (
              <TouchableOpacity style={styles.evidenceBtn} onPress={onViewEvidence}>
                <Text style={styles.evidenceBtnText}>🖼  View Evidence</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

function ManualFindingCard({ finding }: { finding: ManualFinding }) {
  return (
    <Card style={styles.fieldCard}>
      <View style={styles.fieldCardHeader}>
        <View style={[styles.fieldIconWrap, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
          <Text style={{ fontSize: 13 }}>📝</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{finding.rule_code || finding.finding_type}</Text>
          <Text style={styles.fieldRef}>{formatDate(finding.recorded_at)} · {finding.severity}</Text>
        </View>
      </View>
      <Text style={styles.fieldNotes}>{finding.description}</Text>
    </Card>
  );
}

function ProcessingView({ scanId, status, onCancel }: { scanId: string; status: string; onCancel: () => void }) {
  const steps = [
    { key: "upload", label: "Image Uploaded", done: true },
    { key: "extract", label: "Extracting Label & Compliance", done: status !== "pending" && status !== "processing", active: status === "pending" || status === "processing" },
    { key: "result", label: "Preparing Result", done: false, active: false },
  ];
  return (
    <View style={styles.processingContainer}>
      <SafeAreaView edges={["top"]} style={{ width: "100%" }}>
        <View style={styles.processingTopBar}>
          <Text style={styles.processingBrand}>LegalM</Text>
          <TouchableOpacity onPress={onCancel}><Text style={styles.processingCancel}>✕ Cancel</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.processingHero}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
      <Text style={styles.processingTitle}>Analyzing Product…</Text>
      <Text style={styles.processingScanId}>Scan ID: {scanId?.slice(0, 12)}</Text>

      <View style={styles.processingSteps}>
        {steps.map((s, i) => (
          <View key={s.key} style={styles.processingStepRow}>
            <View style={[
              styles.processingDot,
              s.done && { backgroundColor: Colors.statusPass },
              s.active && { backgroundColor: Colors.secondary },
            ]}>
              <Text style={styles.processingDotText}>{s.done ? "✓" : s.active ? "⟳" : ""}</Text>
            </View>
            {i < steps.length - 1 && <View style={[styles.processingLine, s.done && { backgroundColor: Colors.statusPass }]} />}
            <Text style={[styles.processingStepLabel, (s.done || s.active) && { color: Colors.onSurface, fontWeight: "700" }]}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.processingFooter}>🔒 Sent to the existing LegalM OCR & compliance pipeline. This usually takes 5–20 seconds.</Text>
    </View>
  );
}

function EvidenceViewer({ visible, onClose, imageUrl, field }: {
  visible: boolean; onClose: () => void; imageUrl?: string; field: FieldTabEntry | null;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!imageUrl || !visible) return;
    setImgSize(null);
    Image.getSize(imageUrl, (w, h) => setImgSize({ w, h }), () => setImgSize({ w: 1, h: 1 }));
  }, [imageUrl, visible]);

  if (!imageUrl) return null;

  const displayW = SCREEN_W;
  const displayH = imgSize ? (imgSize.h / imgSize.w) * displayW : displayW;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerOverlay}>
        <SafeAreaView style={{ flex: 1 }}>
          <TouchableOpacity style={styles.viewerClose} onPress={onClose} hitSlop={12}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ minHeight: displayH }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: displayW, height: displayH }}>
              <Image source={{ uri: imageUrl }} style={{ width: displayW, height: displayH }} resizeMode="contain" />
            </View>
          </ScrollView>
          {field?.label && (
            <View style={styles.viewerCaption}>
              <Text style={styles.viewerCaptionTitle}>{field.label}</Text>
              {field.extracted_value ? <Text style={styles.viewerCaptionValue}>{field.extracted_value}</Text> : null}
              <Text style={styles.viewerCaptionHint}>Pinch to zoom · No bounding-box evidence stored for this field — showing the source image.</Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBarSafe: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  topBarRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  topBarBack: { fontSize: 20, color: Colors.onSurface },
  topBarTitle: { ...Type.headlineSm, color: Colors.onSurface },
  topBarSubtitle: { fontSize: 11, fontFamily: "monospace", color: Colors.onSurfaceVariant, marginTop: 1 },
  heroImage: { width: SCREEN_W, height: 260, backgroundColor: "#000" },
  dotsRow: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: Colors.white, width: 16 },
  zoomHint: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  zoomHintText: { color: Colors.white, fontSize: 11, fontWeight: "600" },
  body: { padding: 16 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dateText: { fontSize: 12, color: Colors.onSurfaceVariant },
  productName: { ...Type.headlineLg, color: Colors.onSurface },
  brandName: { ...Type.bodyLg, color: Colors.onSurfaceVariant, marginTop: 2, marginBottom: 12 },
  summaryCard: { marginTop: 14, marginBottom: 14 },
  summaryRow: { flexDirection: "row", gap: 16 },
  summaryScore: { alignItems: "center", gap: 6 },
  summaryScoreLabel: { fontSize: 10, fontWeight: "700", color: Colors.onSurfaceVariant, textAlign: "center", width: 84 },
  summaryFields: { flex: 1, gap: 8, justifyContent: "center" },
  summaryFieldRow: {},
  summaryFieldLabel: { fontSize: 10, fontWeight: "700", color: Colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  summaryFieldValue: { fontSize: 13, color: Colors.onSurface, fontWeight: "600", marginTop: 1 },
  mono: { fontFamily: "monospace" },
  summaryFooter: { borderTopWidth: 1, borderTopColor: Colors.borderSubtle, marginTop: 14, paddingTop: 10 },
  summaryFooterText: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: "600" },
  symbolsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  symbolPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  symbolPillText: { fontSize: 11, fontWeight: "700" },
  cardHeading: { ...Type.labelCaps, fontSize: 11, color: Colors.onSurface, marginBottom: 8 },
  barcodeInfoLine: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 },
  tabBar: { flexDirection: "row", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.borderSubtle },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: { fontSize: 11.5, fontWeight: "700", color: Colors.onSurfaceVariant },
  tabBtnTextActive: { color: Colors.onPrimary },
  fieldCard: { marginBottom: 10 },
  fieldCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  fieldIconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 13.5, fontWeight: "700", color: Colors.onSurface },
  fieldRef: { fontSize: 10.5, color: Colors.onSurfaceMuted, marginTop: 2 },
  fieldBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  fieldValueRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  fieldValueLabel: { fontSize: 11, color: Colors.onSurfaceMuted, fontWeight: "700" },
  fieldValueText: { fontSize: 12.5, color: Colors.onSurface, flex: 1, textAlign: "right" },
  fieldNotes: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 8, lineHeight: 17 },
  evidenceBtn: { marginTop: 10, alignSelf: "flex-start", borderWidth: 1.5, borderColor: Colors.secondary, borderRadius: Radius.DEFAULT, paddingHorizontal: 12, paddingVertical: 7 },
  evidenceBtnText: { fontSize: 12, fontWeight: "700", color: Colors.secondary },
  addFindingBtn: { borderWidth: 1.5, borderColor: Colors.primary, borderStyle: "dashed", borderRadius: Radius.DEFAULT, paddingVertical: 12, alignItems: "center", marginBottom: 12 },
  addFindingBtnText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  actionsSection: { marginTop: 10, marginBottom: 16 },
  reportRow: { flexDirection: "row", gap: 10 },
  reportBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT, paddingVertical: 12, alignItems: "center", backgroundColor: Colors.white },
  reportBtnText: { fontSize: 13, fontWeight: "700", color: Colors.onSurface },
  reportHistoryNote: { fontSize: 11, color: Colors.onSurfaceMuted, marginTop: 8 },
  scanAnotherBtn: { backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: Radius.md, alignItems: "center", marginTop: 6 },
  scanAnotherText: { color: Colors.onPrimary, fontSize: 15, fontWeight: "700" },

  processingContainer: { flex: 1, backgroundColor: Colors.background, alignItems: "center", paddingTop: 0 },
  processingTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, width: "100%" },
  processingBrand: { fontSize: 16, fontWeight: "800", color: Colors.onSurface },
  processingCancel: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: "600" },
  processingHero: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center", marginTop: 40, marginBottom: 20 },
  processingTitle: { ...Type.headlineMd, color: Colors.onSurface },
  processingScanId: { fontSize: 11, fontFamily: "monospace", color: Colors.secondary, marginTop: 4, marginBottom: 28 },
  processingSteps: { width: "100%", paddingHorizontal: 32 },
  processingStepRow: { flexDirection: "row", alignItems: "center", position: "relative", paddingBottom: 28 },
  processingDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceContainerHigh, alignItems: "center", justifyContent: "center", marginRight: 14, zIndex: 2 },
  processingDotText: { color: Colors.white, fontSize: 12, fontWeight: "800" },
  processingLine: { position: "absolute", left: 13, top: 28, width: 2, height: 28, backgroundColor: Colors.outlineVariant },
  processingStepLabel: { fontSize: 13.5, color: Colors.onSurfaceMuted, fontWeight: "600" },
  processingFooter: { position: "absolute", bottom: 32, left: 32, right: 32, textAlign: "center", fontSize: 11, color: Colors.onSurfaceMuted, lineHeight: 16 },

  viewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  viewerClose: { alignSelf: "flex-end", padding: 16, zIndex: 5 },
  viewerCloseText: { color: Colors.white, fontSize: 22 },
  viewerCaption: { padding: 16, backgroundColor: "rgba(0,0,0,0.6)" },
  viewerCaptionTitle: { color: Colors.white, fontSize: 14, fontWeight: "700" },
  viewerCaptionValue: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 3 },
  viewerCaptionHint: { color: "rgba(255,255,255,0.5)", fontSize: 10.5, marginTop: 6 },

  findingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  findingCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20, width: "100%" },
  findingTitle: { ...Type.headlineSm, color: Colors.onSurface, marginBottom: 12 },
  findingInput: { borderWidth: 1.5, borderColor: Colors.borderSubtle, borderRadius: Radius.DEFAULT, padding: 12, fontSize: 13, color: Colors.onSurface, minHeight: 90, textAlignVertical: "top", marginBottom: 16 },
  findingActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  findingCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  findingCancelText: { color: Colors.onSurfaceVariant, fontWeight: "600" },
  findingSubmit: { backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.DEFAULT, minWidth: 72, alignItems: "center" },
  findingSubmitText: { color: Colors.onPrimary, fontWeight: "700" },
});
