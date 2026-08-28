import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Share, Alert, ActivityIndicator, TextInput, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../components/Colors";
import ComplianceBadge from "../components/ComplianceBadge";
import FieldRow from "../components/FieldRow";
import api from "../lib/api";
import {
  ComplianceResult, ScanResultTabs, ManualFinding,
  FIELD_LABELS, SEVERITY_COLORS,
} from "../lib/types";

type Tab = "all" | "violations" | "relaxed" | "findings";

const REQUIRED_FIELDS = new Set([
  "manufacturer_info", "product_name", "net_quantity", "mfg_date", "mrp", "consumer_care",
]);

export default function ResultScreen() {
  const router = useRouter();
  const { data, scan_id: paramScanId } = useLocalSearchParams<{ data?: string; scan_id?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [showOcr, setShowOcr] = useState(false);
  const [tabs, setTabs] = useState<ScanResultTabs | null>(null);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [submittingFinding, setSubmittingFinding] = useState(false);
  const [findingForm, setFindingForm] = useState({
    rule_code: "",
    finding_type: "violation" as "violation" | "observation" | "compliant",
    description: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
  });

  const parsedInitial = data ? (() => { try { return JSON.parse(data); } catch { return null; } })() : null;
  const [result, setResult] = useState<ComplianceResult | null>(parsedInitial);
  const effectiveScanId = paramScanId || parsedInitial?.scan_id;
  const [pipelineStatus, setPipelineStatus] = useState<string>(parsedInitial?.pipeline_status || "pending");

  useEffect(() => {
    if (!effectiveScanId) return;

    let intervalId: NodeJS.Timeout | null = null;

    async function checkStatusAndFetch() {
      try {
        const statusRes = await api.get<{ scan_id: string; pipeline_status: string; review_status: string }>(`/scan/${effectiveScanId}/status`);
        const status = statusRes.data.pipeline_status;
        setPipelineStatus(status);

        if (status === "pending" || status === "processing") {
          intervalId = setInterval(async () => {
            try {
              const polled = await api.get<{ scan_id: string; pipeline_status: string; review_status: string }>(`/scan/${effectiveScanId}/status`);
              setPipelineStatus(polled.data.pipeline_status);
              if (polled.data.pipeline_status !== "pending" && polled.data.pipeline_status !== "processing") {
                if (intervalId) clearInterval(intervalId);
                await loadFullResult();
              }
            } catch (err) {
              // keep polling
            }
          }, 3000);
        } else {
          await loadFullResult();
        }
      } catch (err) {
        await loadFullResult();
      }
    }

    async function loadFullResult() {
      setLoadingTabs(true);
      try {
        const [scanRes, tabRes] = await Promise.all([
          api.get<ComplianceResult>(`/scan/${effectiveScanId}`),
          api.get<ScanResultTabs>(`/scan/${effectiveScanId}/result-tabs`).catch(() => ({ data: null })),
        ]);
        setResult(scanRes.data);
        setPipelineStatus(scanRes.data.pipeline_status || "complete");
        if (tabRes.data) setTabs(tabRes.data);
      } catch (e) {
        // graceful
      } finally {
        setLoadingTabs(false);
      }
    }

    checkStatusAndFetch();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [effectiveScanId]);

  async function shareResult() {
    if (!result) return;
    const status = result.is_compliant ? "COMPLIANT ✓" : "NON-COMPLIANT ✗";
    await Share.share({
      message:
        `Legal Metrology Compliance Check\n` +
        `Scan ID: ${result.scan_id}\nStatus: ${status}\n` +
        `Score: ${result.compliance_score?.toFixed(1) ?? 0}%\n\n` +
        `Missing: ${result.missing_fields?.length ? result.missing_fields.join(", ") : "None"}\n\n` +
        `Remarks: ${result.remarks || "—"}`,
    });
  }

  async function submitFinding() {
    if (!result || !findingForm.description.trim()) {
      Alert.alert("Required", "Please enter a description for the finding.");
      return;
    }
    setSubmittingFinding(true);
    try {
      await api.post(`/scan/${result.scan_id}/findings`, {
        rule_code: findingForm.rule_code || null,
        finding_type: findingForm.finding_type,
        description: findingForm.description,
        severity: findingForm.severity,
      });
      setShowFindingForm(false);
      setFindingForm({ rule_code: "", finding_type: "violation", description: "", severity: "medium" });
      const r = await api.get<ScanResultTabs>(`/scan/${result.scan_id}/result-tabs`);
      setTabs(r.data);
      Alert.alert("Saved", "Manual finding recorded.");
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.detail || "Failed to save finding.");
    } finally {
      setSubmittingFinding(false);
    }
  }

  async function deleteFinding(findingId: number) {
    if (!result) return;
    Alert.alert("Delete Finding", "Remove this finding?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/scan/${result.scan_id}/findings/${findingId}`);
            const r = await api.get<ScanResultTabs>(`/scan/${result.scan_id}/result-tabs`);
            setTabs(r.data);
          } catch {}
        },
      },
    ]);
  }

  if (pipelineStatus === "pending" || pipelineStatus === "processing") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.topTitle, { marginTop: 16 }]}>Processing Perception Pipeline</Text>
          <Text style={{ color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 32, fontSize: 13, marginTop: 6 }}>
            Extracting text declarations, calibrating font size, and evaluating Legal Metrology rules in the background…
          </Text>
          <View style={[styles.symbolPill, styles.symbolPillOrange, { marginTop: 16 }]}>
            <Text style={styles.symbolText}>Status: {pipelineStatus.toUpperCase()}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No result data found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.primary, fontWeight: "600" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const allRules = tabs?.all_rules || Object.entries(result.field_results || {}).map(([key, present]) => ({
    key, label: FIELD_LABELS[key] || key, required: REQUIRED_FIELDS.has(key),
    weight: 10, present, extracted_value: result.extracted_fields?.[key],
  }));
  const violations = tabs?.violations || allRules.filter(r => !r.present && r.required);
  const relaxed = tabs?.not_applicable_relaxed || allRules.filter(r => !r.present && !r.required);
  const findings = tabs?.manual_findings || [];

  const tabConfig: { id: Tab; label: string; badge: number }[] = [
    { id: "all", label: "All Rules", badge: allRules.length },
    { id: "violations", label: "Violations", badge: violations.length },
    { id: "relaxed", label: "N/A", badge: relaxed.length },
    { id: "findings", label: "Findings", badge: findings.length },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Compliance Report</Text>
        <TouchableOpacity onPress={shareResult} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Status card */}
        <View style={[styles.statusCard, result.is_compliant ? styles.statusCardPass : styles.statusCardFail]}>
          <ComplianceBadge isCompliant={result.is_compliant} headline={result.compliance_summary?.headline} score={result.compliance_score} size="lg" />
          <View style={styles.scoreBarWrap}>
            <View style={styles.scoreBarBg}>
              <View style={[
                styles.scoreBarFill,
                { width: `${Math.min(result.compliance_score || 0, 100)}%` as any },
                result.is_compliant ? styles.scoreBarPass : styles.scoreBarFail,
              ]} />
            </View>
            <Text style={styles.scoreBarLabel}>
              {result.mandatory_fields_present || 0}/{result.total_mandatory_fields || 0} mandatory fields · {(result.compliance_score || 0).toFixed(1)}%
            </Text>
          </View>

          {/* Symbol detection pills */}
          {result.symbols_detected && (
            <View style={styles.symbolRow}>
              <View style={[styles.symbolPill, result.symbols_detected.veg_dot ? styles.symbolPillGreen : styles.symbolPillGray]}>
                <Text style={styles.symbolText}>🟢 Veg: {result.symbols_detected.veg_dot ? "✓" : "—"}</Text>
              </View>
              <View style={[styles.symbolPill, result.symbols_detected.non_veg_dot ? styles.symbolPillRed : styles.symbolPillGray]}>
                <Text style={styles.symbolText}>🔴 Non-Veg: {result.symbols_detected.non_veg_dot ? "✓" : "—"}</Text>
              </View>
              <View style={[styles.symbolPill, result.symbols_detected.gm_mark ? styles.symbolPillOrange : styles.symbolPillGray]}>
                <Text style={styles.symbolText}>⚗️ GM: {result.symbols_detected.gm_mark ? "✓" : "—"}</Text>
              </View>
            </View>
          )}

          {/* Pipeline status badge */}
          {result.pipeline_status === "review_needed" && (
            <View style={styles.reviewBadge}>
              <Text style={styles.reviewBadgeText}>⚠ Officer Review Required</Text>
            </View>
          )}
        </View>

        {/* Remarks */}
        <View style={styles.remarksCard}>
          <Text style={styles.sectionLabel}>Inspector Remarks</Text>
          <Text style={styles.remarksText}>{result.remarks || "No remarks"}</Text>
        </View>

        {/* Meta */}
        <View style={styles.metaCard}>
          {[
            { k: "Scan ID", v: result.scan_id.substring(0, 20) + "…" },
            { k: "OCR Confidence", v: `${(result.ocr_confidence || 0).toFixed(1)}%` },
            { k: "Fields Checked", v: String(result.total_fields_checked || 0) },
            ...(result.calibration_method ? [{ k: "Calibration", v: result.calibration_method }] : []),
          ].map(({ k, v }) => (
            <View key={k} style={styles.metaRow}>
              <Text style={styles.metaKey}>{k}</Text>
              <Text style={styles.metaVal}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Pipeline Intelligence: Barcode + Groq */}
        {(result.groq_used || result.barcode_data?.decoded) && (
          <View style={styles.intelligenceCard}>
            <Text style={styles.sectionLabel}>Pipeline Intelligence</Text>

            {/* Groq status */}
            <View style={styles.intelRow}>
              <Text style={styles.intelIcon}>🤖</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.intelTitle}>Groq LLM Extraction</Text>
                <Text style={styles.intelSub}>Structured field parsing from OCR text</Text>
              </View>
              <View style={[styles.intelBadge, result.groq_used ? styles.intelBadgeOn : styles.intelBadgeOff]}>
                <Text style={[styles.intelBadgeText, result.groq_used ? styles.intelBadgeTextOn : styles.intelBadgeTextOff]}>
                  {result.groq_used ? "✓ Used" : "Off"}
                </Text>
              </View>
            </View>

            {/* Barcode status */}
            <View style={[styles.intelRow, { marginTop: 10 }]}>
              <Text style={styles.intelIcon}>📊</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.intelTitle}>Barcode Detection</Text>
                <Text style={styles.intelSub}>
                  {result.barcode_data?.decoded
                    ? `${result.barcode_data.barcodes?.length ?? 0} barcode(s) detected`
                    : "No barcodes found"}
                </Text>
              </View>
              <View style={[styles.intelBadge, result.barcode_data?.decoded ? styles.intelBadgeOn : styles.intelBadgeOff]}>
                <Text style={[styles.intelBadgeText, result.barcode_data?.decoded ? styles.intelBadgeTextOn : styles.intelBadgeTextOff]}>
                  {result.barcode_data?.decoded ? "✓ Found" : "None"}
                </Text>
              </View>
            </View>

            {/* Barcode values */}
            {result.barcode_data?.decoded && result.barcode_data.barcodes?.length > 0 && (
              <View style={styles.barcodeList}>
                {result.barcode_data.barcodes.map((bc, i) => (
                  <View key={i} style={styles.barcodeRow}>
                    <View style={styles.barcodeTypeBadge}>
                      <Text style={styles.barcodeTypeText}>{bc.type}</Text>
                    </View>
                    <Text style={styles.barcodeValue} numberOfLines={1}>{bc.data}</Text>
                    {bc.data === result.barcode_data?.primary_barcode && (
                      <Text style={styles.barcodePrimary}>Primary</Text>
                    )}
                  </View>
                ))}

                {/* Open Food Facts product info */}
                {result.barcode_data.product_info && Object.keys(result.barcode_data.product_info).length > 1 && (
                  <View style={styles.offCard}>
                    <Text style={styles.offTitle}>🌐 Open Food Facts</Text>
                    {([
                      ["Product", result.barcode_data.product_info.product_name],
                      ["Brand", result.barcode_data.product_info.brand_name],
                      ["Quantity", result.barcode_data.product_info.net_quantity],
                      ["FSSAI", result.barcode_data.product_info.fssai_number],
                      ["Country", result.barcode_data.product_info.country_of_origin],
                    ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                      <View key={label} style={styles.offRow}>
                        <Text style={styles.offKey}>{label}</Text>
                        <Text style={styles.offVal}>{value}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Declaration Evidence & Localization */}
        {result.bounding_boxes && result.bounding_boxes.length > 0 && (
          <View style={styles.evidenceCard}>
            <Text style={styles.sectionLabel}>Declaration Evidence & Localization</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {result.bounding_boxes.map((b) => {
                const conf = b.confidence != null ? (b.confidence > 1 ? b.confidence / 100 : b.confidence) : 0;
                const isVision = b.bbox_source === "vision_estimate" || (b.bbox && typeof b.bbox === "object" && (b.bbox as any).bbox_source === "vision_estimate");
                const color = conf >= 0.7 ? Colors.success : (conf >= 0.4 ? Colors.warning : Colors.danger);
                const sourceBadge = isVision ? "Vision Estimate" : "OCR Word Match";

                return (
                  <View key={b.field} style={[styles.evidenceRow, { borderLeftColor: color, borderLeftWidth: 4 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.evidenceField}>{b.field.replace(/_/g, " ").toUpperCase()}</Text>
                      {b.text ? <Text style={styles.evidenceText} numberOfLines={2}>"{b.text}"</Text> : null}
                      <Text style={styles.evidenceMeta}>
                        {sourceBadge} · Confidence: {Math.round(conf * 100)}%
                      </Text>
                    </View>
                    <View style={[styles.confPill, { backgroundColor: color + "20" }]}>
                      <Text style={[styles.confPillText, { color }]}>{Math.round(conf * 100)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Four-tab section */}
        <View style={styles.tabSection}>
          {/* Tab bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
            {tabConfig.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, activeTab === t.id && styles.tabBtnTextActive]}>
                  {t.label}
                </Text>
                {t.badge > 0 && (
                  <View style={[styles.tabBadge, activeTab === t.id && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === t.id && styles.tabBadgeTextActive]}>
                      {t.badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Loading indicator for tabs */}
          {loadingTabs && (
            <View style={styles.tabLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.tabLoadingText}>Loading detailed results…</Text>
            </View>
          )}

          {/* Tab: All Rules */}
          {activeTab === "all" && !loadingTabs && (
            <View>
              {allRules.map((row) => (
                <FieldRow
                  key={row.key}
                  label={row.label}
                  present={row.present}
                  extractedValue={row.extracted_value}
                  required={row.required}
                />
              ))}
            </View>
          )}

          {/* Tab: Violations */}
          {activeTab === "violations" && !loadingTabs && (
            violations.length === 0 ? (
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabIcon}>✅</Text>
                <Text style={styles.emptyTabText}>No violations — all mandatory declarations present</Text>
              </View>
            ) : (
              <View>
                <View style={styles.violationHeader}>
                  <Text style={styles.violationHeaderText}>
                    ⚠ {violations.length} Missing Mandatory Declaration{violations.length > 1 ? "s" : ""}
                  </Text>
                  <Text style={styles.violationHeaderSub}>Offence under the Legal Metrology Act, 2009</Text>
                </View>
                {violations.map((row) => (
                  <View key={row.key} style={styles.violationRow}>
                    <View style={styles.violationDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.violationLabel}>{row.label}</Text>
                      {row.legal_reference && <Text style={styles.violationRef}>{row.legal_reference}</Text>}
                    </View>
                    <Text style={styles.violationWeight}>–{row.weight}pts</Text>
                  </View>
                ))}
              </View>
            )
          )}

          {/* Tab: N/A or Relaxed */}
          {activeTab === "relaxed" && !loadingTabs && (
            relaxed.length === 0 ? (
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabText}>No optional fields absent.</Text>
              </View>
            ) : (
              <View>
                {relaxed.map((row) => (
                  <View key={row.key} style={styles.relaxedRow}>
                    <Text style={styles.relaxedLabel}>{row.label}</Text>
                    <Text style={styles.relaxedNote}>Not present · Optional</Text>
                  </View>
                ))}
              </View>
            )
          )}

          {/* Tab: Manual Findings */}
          {activeTab === "findings" && !loadingTabs && (
            <View>
              <TouchableOpacity
                style={styles.addFindingBtn}
                onPress={() => setShowFindingForm(true)}
              >
                <Text style={styles.addFindingBtnText}>+ Add Manual Finding</Text>
              </TouchableOpacity>

              {findings.length === 0 ? (
                <View style={styles.emptyTab}>
                  <Text style={styles.emptyTabText}>No manual findings recorded.</Text>
                </View>
              ) : (
                findings.map((f) => (
                  <View key={f.id} style={styles.findingCard}>
                    <View style={styles.findingHeaderRow}>
                      <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS[f.severity] + "22", borderColor: SEVERITY_COLORS[f.severity] + "66" }]}>
                        <Text style={[styles.severityText, { color: SEVERITY_COLORS[f.severity] }]}>{f.severity.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.findingType}>{f.finding_type.toUpperCase()}</Text>
                      {f.rule_code && <Text style={styles.findingRuleCode}>{f.rule_code}</Text>}
                      <TouchableOpacity onPress={() => deleteFinding(f.id)} style={styles.deleteBtn}>
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.findingDesc}>{f.description}</Text>
                    {f.evidence_note && <Text style={styles.findingEvidence}>{f.evidence_note}</Text>}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Raw OCR */}
        <TouchableOpacity style={styles.ocrToggle} onPress={() => setShowOcr(v => !v)}>
          <Text style={styles.ocrToggleText}>{showOcr ? "▲ Hide" : "▼ Show"} Raw OCR Text</Text>
        </TouchableOpacity>
        {showOcr && (
          <View style={styles.ocrBox}>
            <Text style={styles.ocrText}>{result.raw_ocr_text || "No text extracted."}</Text>
          </View>
        )}

        {/* New scan button */}
        <TouchableOpacity style={styles.newScanBtn} onPress={() => router.replace("/(tabs)/scan")}>
          <Text style={styles.newScanBtnText}>📷  Scan Another Product</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add finding modal */}
      <Modal visible={showFindingForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Manual Finding</Text>

            <Text style={styles.fieldLabel}>Rule Code (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={findingForm.rule_code}
              onChangeText={(t) => setFindingForm(f => ({ ...f, rule_code: t }))}
              placeholder="e.g. LM-PC-R6-01"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Finding Type</Text>
            <View style={styles.segmentRow}>
              {(["violation", "observation", "compliant"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setFindingForm(f => ({ ...f, finding_type: type }))}
                  style={[styles.segmentBtn, findingForm.finding_type === type && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentBtnText, findingForm.finding_type === type && styles.segmentBtnTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Severity</Text>
            <View style={styles.segmentRow}>
              {(["low", "medium", "high", "critical"] as const).map((sev) => (
                <TouchableOpacity
                  key={sev}
                  onPress={() => setFindingForm(f => ({ ...f, severity: sev }))}
                  style={[styles.segmentBtn, findingForm.severity === sev && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentBtnText, findingForm.severity === sev && styles.segmentBtnTextActive]}>
                    {sev}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description *</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              value={findingForm.description}
              onChangeText={(t) => setFindingForm(f => ({ ...f, description: t }))}
              placeholder="Describe the finding in detail…"
              placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowFindingForm(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitFinding} disabled={submittingFinding} style={styles.modalSaveBtn}>
                {submittingFinding
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.modalSaveText}>Save Finding</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { color: Colors.danger, fontWeight: "600" },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 4, minWidth: 40 },
  closeBtnText: { fontSize: 16, color: Colors.textSecondary, fontWeight: "700" },
  topTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  shareBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  shareBtnText: { color: Colors.white, fontSize: 13, fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 40 },

  // Status card
  statusCard: { borderRadius: 16, padding: 20, marginBottom: 12, gap: 12 },
  statusCardPass: { backgroundColor: Colors.successLight },
  statusCardFail: { backgroundColor: Colors.dangerLight },
  scoreBarWrap: { gap: 5 },
  scoreBarBg: { height: 8, backgroundColor: "rgba(0,0,0,0.1)", borderRadius: 4, overflow: "hidden" },
  scoreBarFill: { height: "100%", borderRadius: 4 },
  scoreBarPass: { backgroundColor: Colors.success },
  scoreBarFail: { backgroundColor: Colors.danger },
  scoreBarLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: "500" },
  symbolRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  symbolPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  symbolPillGreen: { backgroundColor: "#e8f5e9", borderColor: "#81c784" },
  symbolPillRed: { backgroundColor: "#fdecea", borderColor: "#ef9a9a" },
  symbolPillOrange: { backgroundColor: "#fff3e0", borderColor: "#ffcc80" },
  symbolPillGray: { backgroundColor: "#f5f5f5", borderColor: "#e0e0e0" },
  symbolText: { fontSize: 11, fontWeight: "600", color: Colors.text },
  reviewBadge: { backgroundColor: "#fff8e1", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#ffe082" },
  reviewBadgeText: { fontSize: 12, fontWeight: "700", color: "#f57f17", textAlign: "center" },

  // Remarks
  remarksCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  remarksText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  // Meta
  metaCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaKey: { fontSize: 12, color: Colors.textSecondary },
  metaVal: { fontSize: 12, color: Colors.text, fontWeight: "600" },

  // Intelligence card
  intelligenceCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12,
  },
  intelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  intelIcon: { fontSize: 20 },
  intelTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  intelSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  intelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  intelBadgeOn: { backgroundColor: "#e8f5e9" },
  intelBadgeOff: { backgroundColor: "#f5f5f5" },
  intelBadgeText: { fontSize: 11, fontWeight: "700" },
  intelBadgeTextOn: { color: "#2e7d32" },
  intelBadgeTextOff: { color: "#9e9e9e" },
  barcodeList: { marginTop: 10, gap: 6 },
  barcodeRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.offWhite, padding: 8, borderRadius: 6 },
  barcodeTypeBadge: { backgroundColor: Colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  barcodeTypeText: { fontSize: 10, fontWeight: "700", color: Colors.primary },
  barcodeValue: { flex: 1, fontSize: 12, fontFamily: "monospace", color: Colors.text },
  barcodePrimary: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  offCard: { backgroundColor: "#e3f2fd", padding: 10, borderRadius: 6, marginTop: 6, gap: 4 },
  offTitle: { fontSize: 11, fontWeight: "700", color: "#1565c0", marginBottom: 2 },
  offRow: { flexDirection: "row", gap: 8 },
  offKey: { fontSize: 10, color: "#1976d2", fontWeight: "600", width: 60 },
  offVal: { flex: 1, fontSize: 11, color: Colors.text },

  // Four-tab section
  tabSection: { backgroundColor: Colors.white, borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  tabBar: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { flexDirection: "row", paddingHorizontal: 4 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  tabBtnTextActive: { color: Colors.primary },
  tabBadge: { backgroundColor: Colors.offWhite, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: Colors.primary },
  tabBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary },
  tabBadgeTextActive: { color: Colors.white },
  tabLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 20 },
  tabLoadingText: { fontSize: 12, color: Colors.textMuted },

  // Empty state
  emptyTab: { padding: 32, alignItems: "center", gap: 8 },
  emptyTabIcon: { fontSize: 36 },
  emptyTabText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  // Violations tab
  violationHeader: { backgroundColor: "#fdecea", padding: 14, borderBottomWidth: 1, borderBottomColor: "#f5c6cb" },
  violationHeaderText: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  violationHeaderSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  violationRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  violationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger, marginTop: 4 },
  violationLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },
  violationRef: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  violationWeight: { fontSize: 11, fontWeight: "700", color: Colors.danger },

  // Relaxed tab
  relaxedRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  relaxedLabel: { fontSize: 13, color: Colors.text, fontWeight: "500" },
  relaxedNote: { fontSize: 11, color: Colors.textMuted },

  // Findings tab
  addFindingBtn: {
    margin: 14, backgroundColor: Colors.primary,
    paddingVertical: 10, borderRadius: 8, alignItems: "center",
  },
  addFindingBtnText: { color: Colors.white, fontWeight: "700", fontSize: 14 },
  findingCard: {
    marginHorizontal: 14, marginBottom: 10,
    backgroundColor: Colors.offWhite, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  findingHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  severityText: { fontSize: 9, fontWeight: "700" },
  findingType: { fontSize: 9, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase" },
  findingRuleCode: { fontSize: 9, fontWeight: "700", color: Colors.primary, fontFamily: "monospace" },
  deleteBtn: { marginLeft: "auto" as any, padding: 4 },
  deleteBtnText: { fontSize: 14, color: Colors.textMuted },
  findingDesc: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  findingEvidence: { fontSize: 11, color: Colors.textMuted, marginTop: 4, fontStyle: "italic" },

  // OCR
  ocrToggle: {
    backgroundColor: Colors.white, padding: 12, borderRadius: 8,
    alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  ocrToggleText: { fontSize: 13, color: Colors.primary, fontWeight: "600" },
  ocrBox: { backgroundColor: "#1e1e2e", borderRadius: 8, padding: 14, marginBottom: 16 },
  ocrText: { fontSize: 11, color: "#a8d8a8", fontFamily: "monospace", lineHeight: 18 },

  // New scan
  newScanBtn: {
    backgroundColor: Colors.primary, paddingVertical: 16,
    borderRadius: 12, alignItems: "center", elevation: 2,
  },
  newScanBtnText: { color: Colors.white, fontSize: 15, fontWeight: "700" },

  // Evidence
  evidenceCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  evidenceRow: {
    backgroundColor: Colors.offWhite, borderRadius: 8, padding: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: Colors.border,
  },
  evidenceField: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5 },
  evidenceText: { fontSize: 13, fontWeight: "600", color: Colors.text, marginTop: 2 },
  evidenceMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 3, fontStyle: "italic" },
  confPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  confPillText: { fontSize: 12, fontWeight: "800" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "85%",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Colors.text, marginBottom: 16, textAlign: "center" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  modalInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.text, backgroundColor: Colors.offWhite,
  },
  modalTextarea: { height: 80, textAlignVertical: "top" },
  segmentRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  segmentBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  segmentBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segmentBtnText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary, textTransform: "capitalize" },
  segmentBtnTextActive: { color: Colors.white },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  modalSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: Colors.primary, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontWeight: "700", color: Colors.white },
});
