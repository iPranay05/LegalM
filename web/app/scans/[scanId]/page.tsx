"use client";
import React, { useEffect, useState, useRef, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ComplianceBadge from "@/components/ComplianceBadge";
import ScoreBar from "@/components/ScoreBar";
import api, { API_BASE_URL } from "@/lib/api";
import {
  Scan, ScanResultTabs, ManualFinding, Report,
  FIELD_LABELS, REQUIRED_FIELDS, SEVERITY_COLORS,
} from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";

type Tab = "all" | "violations" | "relaxed" | "findings";

export default function ScanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scanId = params.scanId as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [tabs, setTabs] = useState<ScanResultTabs | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineStatus, setPipelineStatus] = useState<string>("pending");
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [showOcr, setShowOcr] = useState(false);
  const [generatingReport, setGeneratingReport] = useState<"pdf" | "docx" | null>(null);
  const [reportError, setReportError] = useState("");
  const [findingForm, setFindingForm] = useState({
    show: false,
    rule_code: "",
    finding_type: "violation" as "violation" | "observation" | "compliant",
    description: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
    evidence_note: "",
  });
  const [submittingFinding, setSubmittingFinding] = useState(false);
  const [confirmingBbox, setConfirmingBbox] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function checkStatusAndLoad() {
      try {
        const statusRes = await api.get<{ scan_id: string; pipeline_status: string; review_status: string }>(`/scan/${scanId}/status`);
        const status = statusRes.data.pipeline_status;
        setPipelineStatus(status);

        if (status === "pending" || status === "processing") {
          if (!intervalId) {
            intervalId = setInterval(async () => {
              try {
                const polled = await api.get<{ scan_id: string; pipeline_status: string; review_status: string }>(`/scan/${scanId}/status`);
                setPipelineStatus(polled.data.pipeline_status);
                if (polled.data.pipeline_status !== "pending" && polled.data.pipeline_status !== "processing") {
                  if (intervalId) clearInterval(intervalId);
                  await loadAll();
                }
              } catch (err) {
                // Keep polling or handle error
              }
            }, 5000);
          }
        } else {
          await loadAll();
        }
      } catch (e: any) {
        if (e?.response?.status === 401) {
          router.push("/login");
          return;
        }
        await loadAll();
      }
    }

    checkStatusAndLoad();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [scanId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [tabRes, rptRes] = await Promise.all([
        api.get<ScanResultTabs>(`/scan/${scanId}/result-tabs`),
        api.get<Report[]>(`/reports/scan/${scanId}`).catch(() => ({ data: [] })),
      ]);
      setTabs(tabRes.data);
      setScan(tabRes.data.scan);
      setPipelineStatus(tabRes.data.scan.pipeline_status || "complete");
      setReports(rptRes.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  const manualReviewChecks = (scan?.compliance_checks || []).filter(
    (check) => check.result === "ManualReviewRequired"
  );

  // Draw bounding-box overlays on canvas once image loads
  function drawBboxOverlays() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const boxes = (scan?.bounding_boxes || []).filter((box) => (box.image_index ?? 0) === imageIndex);
    boxes.forEach((box) => {
      let x = 0, y = 0, w = 0, h = 0;
      // Backend accepts both legacy arrays and normalized object boxes.
      const rawBox: any = box.bbox;
      if (!rawBox) return;

      if (typeof rawBox === "object" && !Array.isArray(rawBox)) {
        const xMin = Number(rawBox.x_min ?? 0);
        const yMin = Number(rawBox.y_min ?? 0);
        const xMax = Number(rawBox.x_max ?? 0);
        const yMax = Number(rawBox.y_max ?? 0);
        x = xMin <= 1.0 ? xMin * canvas.width : xMin;
        y = yMin <= 1.0 ? yMin * canvas.height : yMin;
        const r = xMax <= 1.0 ? xMax * canvas.width : xMax;
        const b = yMax <= 1.0 ? yMax * canvas.height : yMax;
        w = r - x;
        h = b - y;
      } else if (Array.isArray(rawBox) && rawBox.length === 4) {
        if (rawBox[0] <= 1.0 && rawBox[2] <= 1.0) {
          x = rawBox[0] * canvas.width;
          y = rawBox[1] * canvas.height;
          w = (rawBox[2] - rawBox[0]) * canvas.width;
          h = (rawBox[3] - rawBox[1]) * canvas.height;
        } else {
          [x, y, w, h] = rawBox;
        }
      }

      if (w <= 0 || h <= 0) return;

      const conf = box.confidence != null ? (box.confidence > 1 ? box.confidence / 100 : box.confidence) : 0;
      const isVision = (box as any).bbox_source === "vision_estimate" || (typeof rawBox === "object" && rawBox.bbox_source === "vision_estimate");

      // Confidence-color: Green >= 70%, Amber 40-70%, Red < 40%
      let strokeColor = "#1a7a3c";
      let bgColor = "rgba(26,122,60,0.85)";
      if (conf < 0.4) {
        strokeColor = "#c0392b";
        bgColor = "rgba(192,57,43,0.85)";
      } else if (conf < 0.7) {
        strokeColor = "#e67e22";
        bgColor = "rgba(230,126,34,0.85)";
      }

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      if (isVision) {
        ctx.setLineDash([6, 4]); // Dashed outline indicates approximate vision estimate
      } else {
        ctx.setLineDash([]);
      }
      ctx.strokeRect(x, y, w, h);
      ctx.restore();

      // Label background & text
      const srcText = isVision ? " [Approx]" : " [OCR]";
      const label = (FIELD_LABELS[box.field] || box.field) + srcText + ` · ${Math.round(conf * 100)}%`;
      ctx.font = "bold 12px Arial";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = bgColor;
      ctx.fillRect(x, Math.max(0, y - 20), tw + 8, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 4, Math.max(14, y - 5));
    });
  }

  async function generateReport(fmt: "pdf" | "docx") {
    setGeneratingReport(fmt);
    setReportError("");
    try {
      const res = await api.post<Report>(`/reports/generate/${scanId}?fmt=${fmt}`);
      setReports(prev => [res.data, ...prev]);
    } catch (err: any) {
      setReportError(err?.response?.data?.detail || `Failed to generate ${fmt.toUpperCase()}`);
    } finally {
      setGeneratingReport(null);
    }
  }

  async function confirmBbox(field: string, correctedValue?: string) {
    setConfirmingBbox(field);
    try {
      const params: Record<string, string> = { field };
      if (correctedValue) params.corrected_value = correctedValue;
      await api.patch(`/scan/${scanId}/confirm-bbox`, null, { params });
      await loadAll();
    } finally {
      setConfirmingBbox(null);
    }
  }

  async function submitFinding(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingFinding(true);
    try {
      await api.post(`/scan/${scanId}/findings`, {
        rule_code: findingForm.rule_code || null,
        finding_type: findingForm.finding_type,
        description: findingForm.description,
        severity: findingForm.severity,
        evidence_note: findingForm.evidence_note || null,
      });
      setFindingForm(f => ({ ...f, show: false, description: "", rule_code: "", evidence_note: "" }));
      loadAll();
    } finally {
      setSubmittingFinding(false);
    }
  }

  async function deleteFinding(findingId: number) {
    if (!confirm("Delete this finding?")) return;
    await api.delete(`/scan/${scanId}/findings/${findingId}`);
    loadAll();
  }

  async function markReviewComplete(decision: boolean) {
    try {
      await api.patch(`/scan/${scanId}/review-complete`, undefined, { params: { decision } });
      loadAll();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Cannot complete review yet.");
    }
  }

  async function downloadReport(reportId: string, fmt: string) {
    try {
      const res = await api.get(`/reports/download/${reportId}`, { responseType: "blob" });
      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        html: "text/html",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      const blob = new Blob([res.data], { type: mimeTypes[fmt] || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_report_${scanId}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed. Please try again.");
    }
  }

  if (pipelineStatus === "pending" || pipelineStatus === "processing") {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm space-y-4">
        <div className="inline-flex p-3 rounded-full bg-blue-50 text-blue-600 animate-pulse">
          <svg className="animate-spin h-8 w-8 text-gov-navy" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Processing Perception Pipeline</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          Extracting text, calibrating physical font measurements, and evaluating Legal Metrology declaration rules in the background…
        </p>
        <div className="inline-block px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold uppercase tracking-wider">
          Status: {pipelineStatus}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <svg className="animate-spin h-5 w-5 text-gov-navy" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading scan…
      </div>
    );
  }

  if (!scan || !tabs) {
    return (
      <div className="text-center py-12 text-gray-400">
        Scan not found. <Link href="/scans" className="text-gov-navy underline">Back to scans</Link>
      </div>
    );
  }

  const imageUrl = scan.image_path
    ? `${API_BASE_URL}/uploads/${(scan.image_paths?.[imageIndex] || scan.image_path).split(/[\\/]/).pop()}`
    : null;
  const imageCount = scan.image_paths?.length || 1;
  const showPreviousImage = () => setImageIndex((i) => (i - 1 + imageCount) % imageCount);
  const showNextImage = () => setImageIndex((i) => (i + 1) % imageCount);

  const unconfirmedBoxes = (scan.bounding_boxes || []).filter(b => !b.confirmed);
  const needsReview = scan.pipeline_status === "review_needed" && scan.review_status !== "reviewed";

  const tabConfig: { id: Tab; label: string; count: number; color: string }[] = [
    { id: "all", label: "All Rules", count: tabs.all_rules.length, color: "text-gray-600" },
    { id: "violations", label: "Violations", count: tabs.violations.length, color: "text-red-600" },
    { id: "relaxed", label: "N/A or Relaxed", count: tabs.not_applicable_relaxed.length, color: "text-yellow-600" },
    { id: "findings", label: "Manual Findings", count: tabs.manual_findings.length, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gov-navy">Dashboard</Link>
        <span>/</span>
        <Link href="/scans" className="hover:text-gov-navy">Scans</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium truncate max-w-xs">{scanId}</span>
      </div>

      {/* Review alert */}
      {needsReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-amber-800">Manual Review Required</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {unconfirmedBoxes.length > 0
                ? `${unconfirmedBoxes.length} bounding box annotation(s) need officer confirmation before this scan can be finalised.`
                : "All items confirmed. You can mark this review as complete."}
            </p>
          </div>
          {unconfirmedBoxes.length === 0 && <div className="flex gap-2">
            <button onClick={() => markReviewComplete(true)} className="gov-btn text-xs px-3 py-1.5 whitespace-nowrap">Compliant</button>
            <button onClick={() => markReviewComplete(false)} className="text-xs px-3 py-1.5 whitespace-nowrap rounded-lg border border-red-300 text-red-700 hover:bg-red-50">Non-Compliant</button>
          </div>}
        </div>
      )}

      {/* Top card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">{scan.product_name || "Unknown Product"}</h1>
            <p className="text-sm text-gray-400 mt-0.5 font-mono">{scan.scan_id}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {scan.pipeline_status && (
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide",
                  scan.pipeline_status === "complete" ? "bg-green-50 text-green-700 border-green-200" :
                  scan.pipeline_status === "review_needed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-gray-100 text-gray-500 border-gray-200"
                )}>
                  {scan.pipeline_status.replace("_", " ")}
                </span>
              )}
              {scan.review_status === "reviewed" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 uppercase">Officer Reviewed</span>
              )}
              {scan.calibration_method && (
                <span className="text-[10px] text-gray-400 font-semibold">
                  Calibration: {scan.calibration_method}
                  {scan.calibration_method === "barcode_reference" && " (barcode reference estimate)"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <ComplianceBadge isCompliant={scan.is_compliant} headline={scan.compliance_summary?.headline} showScore score={scan.compliance_score} />
            <div className="w-48"><ScoreBar score={scan.compliance_score ?? 0} height="h-3" /></div>
            <p className="text-xs text-gray-400">Scanned {formatDate(scan.created_at)}</p>
          </div>
        </div>
      </div>

      {manualReviewChecks.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Manual review required</p>
          <p className="mt-1">The following check{manualReviewChecks.length > 1 ? "s" : ""} could not be verified automatically:</p>
          <ul className="mt-1 list-disc pl-5">
            {manualReviewChecks.map((check) => (
              <li key={`${check.field_key}-${check.rule_id || "manual"}`}>
                {FIELD_LABELS[check.field_key] || check.field_key}: {check.notes || "Additional evidence is required."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Four-tab results */}
        <div className="lg:col-span-2 space-y-5">

          {/* Scan metadata */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Scan Details</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
              {[
                { label: "Category", value: scan.category || "—" },
                { label: "Shop Name", value: scan.shop_name || "—" },
                { label: "Location", value: scan.location || "—" },
                { label: "State", value: scan.state || "—" },
                { label: "District", value: scan.district || "—" },
                { label: "OCR Confidence", value: scan.ocr_confidence != null ? `${scan.ocr_confidence.toFixed(1)}%` : "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400 font-semibold uppercase">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Symbol detection */}
            {scan.symbols_detected && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Symbol Detection</p>
                <div className="flex gap-3 flex-wrap">
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border",
                    scan.symbols_detected.veg_dot ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200")}>
                    🟢 Veg Dot: {scan.symbols_detected.veg_dot ? "Detected" : "Not Found"}
                  </span>
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border",
                    scan.symbols_detected.non_veg_dot ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-400 border-gray-200")}>
                    🔴 Non-Veg Dot: {scan.symbols_detected.non_veg_dot ? "Detected" : "Not Found"}
                  </span>
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border",
                    scan.symbols_detected.gm_mark ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-gray-50 text-gray-400 border-gray-200")}>
                    ⚗️ GM Mark: {scan.symbols_detected.gm_mark ? "Detected" : "Not Found"}
                  </span>
                </div>
                {scan.symbols_detected.tamper_detection && (
                  <p className="mt-2 text-xs text-amber-700">
                    Tamper/sticker signal: {scan.symbols_detected.tamper_detection.status === "suspected"
                      ? "possible MRP sticker inconsistency; manual verification required"
                      : scan.symbols_detected.tamper_detection.status === "unavailable"
                        ? "unavailable for this image"
                        : "no suspected MRP sticker signal"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Four-tab results */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {tabConfig.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn("tab-btn", activeTab === t.id ? "tab-btn-active" : "tab-btn-inactive")}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span className={cn("ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      activeTab === t.id ? "bg-gov-navy text-white" : "bg-gray-100 text-gray-500"
                    )}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab: All Rules */}
            {activeTab === "all" && (
              <table className="w-full">
                <thead><tr>
                  <th className="table-th">Declaration</th>
                  <th className="table-th">Required</th>
                  <th className="table-th">Extracted Value</th>
                  <th className="table-th">Status</th>
                </tr></thead>
                <tbody>
                  {tabs.all_rules.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50">
                      <td className="table-td">
                        <p className="font-medium text-sm">{row.label}</p>
                        {row.legal_reference && <p className="text-xs text-gray-400 mt-0.5">{row.legal_reference}</p>}
                      </td>
                      <td className="table-td">
                        {row.required
                          ? <span className="text-xs font-bold text-red-600">Mandatory</span>
                          : <span className="text-xs text-gray-400">Optional</span>}
                      </td>
                      <td className="table-td text-xs font-mono text-gray-500">{row.extracted_value || "—"}</td>
                      <td className="table-td">
                        {row.result === "ManualReviewRequired"
                          ? <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">⚠ Manual Review</span>
                          : row.result === "NotApplicable"
                          ? <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">— Not Applicable</span>
                          : row.present
                          ? <span className="badge-pass text-[10px]">✓ Found</span>
                          : <span className="badge-fail text-[10px]">✗ Missing</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Tab: Violations */}
            {activeTab === "violations" && (
              tabs.violations.length === 0 ? (
                <div className="text-center py-12 text-green-600 font-semibold text-sm">
                  ✓ No violations detected — all mandatory declarations present
                </div>
              ) : (
                <div>
                  <div className="bg-red-50 border-b border-red-100 px-5 py-3">
                    <p className="text-sm font-bold text-red-700">
                      ⚠ {tabs.violations.length} Mandatory Declaration{tabs.violations.length > 1 ? "s" : ""} Missing
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">Absence is an offence under the Legal Metrology Act, 2009</p>
                  </div>
                  <table className="w-full">
                    <thead><tr>
                      <th className="table-th">Missing Declaration</th>
                      <th className="table-th">Weight</th>
                      <th className="table-th">Legal Reference</th>
                    </tr></thead>
                    <tbody>
                      {tabs.violations.map((row) => (
                        <tr key={row.key} className="hover:bg-red-50/40">
                          <td className="table-td font-semibold text-red-800">{row.label}</td>
                          <td className="table-td text-center font-bold text-red-600">{row.weight}</td>
                          <td className="table-td text-xs text-gray-500">{row.legal_reference || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Tab: N/A or Relaxed */}
            {activeTab === "relaxed" && (
              tabs.not_applicable_relaxed.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No optional fields absent.</div>
              ) : (
                <table className="w-full">
                  <thead><tr>
                    <th className="table-th">Field</th>
                    <th className="table-th">Note</th>
                    <th className="table-th">Legal Reference</th>
                  </tr></thead>
                  <tbody>
                    {tabs.not_applicable_relaxed.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-50">
                        <td className="table-td font-medium">{row.label}</td>
                        <td className="table-td text-xs text-yellow-600 font-semibold">Not present (optional)</td>
                        <td className="table-td text-xs text-gray-500">{row.legal_reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* Tab: Manual Findings */}
            {activeTab === "findings" && (
              <div>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">
                    {tabs.manual_findings.length} Officer Finding{tabs.manual_findings.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    onClick={() => setFindingForm(f => ({ ...f, show: !f.show }))}
                    className="gov-btn text-xs px-3 py-1.5"
                  >
                    {findingForm.show ? "Cancel" : "+ Add Finding"}
                  </button>
                </div>

                {/* Add finding form */}
                {findingForm.show && (
                  <form onSubmit={submitFinding} className="px-5 py-4 bg-gray-50 border-b border-gray-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Rule Code</label>
                        <input value={findingForm.rule_code}
                          onChange={(e) => setFindingForm(f => ({ ...f, rule_code: e.target.value }))}
                          className="form-input" placeholder="e.g. LM-PC-R6-01" />
                      </div>
                      <div>
                        <label className="form-label">Finding Type</label>
                        <select value={findingForm.finding_type}
                          onChange={(e) => setFindingForm(f => ({ ...f, finding_type: e.target.value as any }))}
                          className="form-input">
                          <option value="violation">Violation</option>
                          <option value="observation">Observation</option>
                          <option value="compliant">Compliant</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Description *</label>
                      <textarea value={findingForm.description}
                        onChange={(e) => setFindingForm(f => ({ ...f, description: e.target.value }))}
                        rows={2} required className="form-input" placeholder="Describe the finding…" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Severity</label>
                        <select value={findingForm.severity}
                          onChange={(e) => setFindingForm(f => ({ ...f, severity: e.target.value as any }))}
                          className="form-input">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Evidence Note</label>
                        <input value={findingForm.evidence_note}
                          onChange={(e) => setFindingForm(f => ({ ...f, evidence_note: e.target.value }))}
                          className="form-input" placeholder="Photo reference, physical notes…" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setFindingForm(f => ({ ...f, show: false }))} className="gov-btn-secondary text-xs px-3 py-1.5">Cancel</button>
                      <button type="submit" disabled={submittingFinding} className="gov-btn text-xs px-4 py-1.5">
                        {submittingFinding ? "Saving…" : "Save Finding"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Findings list */}
                {tabs.manual_findings.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    No manual findings recorded. Click "+ Add Finding" to record field inspection observations.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {tabs.manual_findings.map((f) => (
                      <div key={f.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase",
                              SEVERITY_COLORS[f.severity] || "bg-gray-100 text-gray-600 border-gray-200")}>
                              {f.severity}
                            </span>
                            <span className="text-xs font-bold text-gray-700 uppercase">{f.finding_type}</span>
                            {f.rule_code && <span className="text-xs font-mono text-gray-400">{f.rule_code}</span>}
                          </div>
                          <p className="text-sm text-gray-800">{f.description}</p>
                          {f.evidence_note && <p className="text-xs text-gray-400 italic">{f.evidence_note}</p>}
                        </div>
                        <button onClick={() => deleteFinding(f.id)} className="text-gray-300 hover:text-red-600 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OCR text drawer */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <button
              onClick={() => setShowOcr(s => !s)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Raw OCR Text</span>
                <p className="text-xs text-gray-400 mt-0.5">Extracted using Tesseract OCR + Groq Vision</p>
              </div>
              <span className="text-xs text-gov-navy font-semibold">{showOcr ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {showOcr && (
              <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-xs font-mono text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto border border-gray-200">
                {scan.raw_ocr_text || "No text extracted."}
              </pre>
            )}
          </div>
        </div>

        {/* Right: Label image + Bounding boxes + Actions */}
        <div className="space-y-5">

          {/* Label photo with bounding boxes */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Product Label Photo</h2>
            {imageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {imageCount > 1 && (
                  <>
                    <button aria-label="Previous label photo" onClick={showPreviousImage} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white">‹</button>
                    <button aria-label="Next label photo" onClick={showNextImage} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white">›</button>
                  </>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt={scan.product_name || "Label"}
                  className="w-full object-contain max-h-72"
                  onLoad={drawBboxOverlays}
                  onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
                  onTouchEnd={(event) => {
                    if (touchStartX.current == null) return;
                    const delta = event.changedTouches[0]?.clientX - touchStartX.current;
                    if (Math.abs(delta) > 40) delta < 0 ? showNextImage() : showPreviousImage();
                    touchStartX.current = null;
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>
            ) : (
              <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center text-gray-300 text-sm">
                No image available
              </div>
            )}
            {imageCount > 1 && <p className="mt-2 text-center text-xs text-gray-500">Photo {imageIndex + 1} of {imageCount} · swipe or use arrows</p>}

            {/* Bounding box review list */}
            {scan.bounding_boxes && scan.bounding_boxes.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase">Detection Bounding Boxes</p>
                {scan.bounding_boxes.map((b) => (
                  <div
                    key={b.field}
                    className={cn(
                      "flex items-center justify-between rounded-lg p-2.5 text-xs border",
                      b.confirmed ? "bg-green-50/50 border-green-200" : "bg-amber-50/50 border-amber-200"
                    )}
                  >
                    <div>
                      <span className="font-bold text-gray-700">{FIELD_LABELS[b.field] || b.field}</span>
                      {b.text && <p className="text-gray-500 font-mono text-[11px] mt-0.5">{b.text}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                        b.confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {b.confirmed ? "✓ Confirmed" : "Review"}
                      </span>
                      {!b.confirmed && (
                        <button
                          disabled={confirmingBbox === b.field}
                          onClick={() => confirmBbox(b.field)}
                          className="text-[11px] bg-gov-navy text-white px-2 py-0.5 rounded hover:bg-gov-navy-light disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Barcode details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Barcode & External Registry</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{scan.barcode_data?.decoded ? "📦" : "🔍"}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Barcode Detection</p>
                  <p className="text-xs text-gray-400">
                    {scan.barcode_data?.decoded
                      ? `${scan.barcode_data.barcodes?.length ?? 0} barcode(s) found`
                      : "No barcodes detected"}
                  </p>
                </div>
              </div>

              {scan.barcode_data?.decoded && scan.barcode_data.barcodes?.length > 0 && (
                <div className="space-y-2">
                  {/* Barcode list */}
                  {scan.barcode_data.barcodes.map((bc, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <div>
                        <span className="text-[10px] font-bold text-gov-navy bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded mr-2">{bc.type}</span>
                        <span className="text-xs font-mono text-gray-700">{bc.data}</span>
                      </div>
                      {bc.data === scan.barcode_data?.primary_barcode && (
                        <span className="text-[10px] text-gray-400 font-semibold">Primary</span>
                      )}
                    </div>
                  ))}

                  {/* Open Food Facts product info */}
                  {scan.barcode_data.product_info && Object.keys(scan.barcode_data.product_info).length > 0 && (
                    <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
                        🌐 Open Food Facts Data
                      </p>
                      {[
                        ["Product", scan.barcode_data.product_info.product_name],
                        ["Brand", scan.barcode_data.product_info.brand_name],
                        ["Quantity", scan.barcode_data.product_info.net_quantity],
                        ["Manufacturer", scan.barcode_data.product_info.manufacturer_name],
                        ["FSSAI No.", scan.barcode_data.product_info.fssai_number],
                        ["Country", scan.barcode_data.product_info.country_of_origin],
                      ].filter(([, v]) => v).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <span className="text-[10px] text-blue-500 font-semibold w-20 shrink-0">{label}</span>
                          <span className="text-xs text-gray-700">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Score summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Compliance Score</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Overall Score</span>
                  <span className="font-bold text-gray-800">{scan.compliance_score?.toFixed(1) ?? 0}%</span>
                </div>
                <ScoreBar score={scan.compliance_score ?? 0} showLabel={false} height="h-3" />
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total rules</span>
                  <span className="font-semibold">{tabs.all_rules.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Present</span>
                  <span className="font-semibold text-green-700">{tabs.all_rules.filter(r => r.present).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Violations</span>
                  <span className="font-semibold text-red-600">{tabs.violations.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Manual findings</span>
                  <span className="font-semibold text-purple-700">{tabs.manual_findings.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Report generation */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Generate Report</h2>
            <div className="flex gap-2">
              <button
                onClick={() => generateReport("pdf")}
                disabled={generatingReport !== null}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
              >
                {generatingReport === "pdf" ? "Generating…" : "📄 PDF"}
              </button>
              <button
                onClick={() => generateReport("docx")}
                disabled={generatingReport !== null}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition disabled:opacity-50"
              >
                {generatingReport === "docx" ? "Generating…" : "📝 DOCX"}
              </button>
            </div>
            {reportError && <p className="text-xs text-red-600 mt-2">{reportError}</p>}

            {/* Reports list */}
            {reports.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase">Generated Reports</p>
                {reports.map((r) => (
                  <div key={r.report_id} className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-xs border",
                    r.superseded_by_report_id ? "opacity-50 bg-gray-50 border-gray-100" : "bg-white border-gray-200"
                  )}>
                    <div>
                      <span className="font-bold uppercase text-gray-700 mr-2">{r.format}</span>
                      <span className="text-gray-400">{formatDate(r.generated_at, "dd MMM, hh:mm a")}</span>
                      {r.superseded_by_report_id && <span className="ml-2 text-gray-400 italic">(superseded)</span>}
                    </div>
                    <button
                      onClick={() => downloadReport(r.report_id, r.format)}
                      className="text-gov-navy font-semibold hover:underline text-xs"
                    >
                      Download ↓
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 break-all">
                  SHA-256: {reports[0]?.file_hash_sha256?.substring(0, 32)}…
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
