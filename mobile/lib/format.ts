// Small formatting helpers shared across screens (mirrors web/lib/utils.ts
// formatDate/scoreColor, minus the date-fns dependency).

export function formatDate(iso?: string, opts?: { withTime?: boolean }): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (opts?.withTime === false) return datePart;
  const timePart = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return iso;
  const diffMs = Date.now() - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, { withTime: false });
}

// Derives a 3-state pill status ("pass" | "review" | "fail") from a Scan the
// same way the web's ComplianceBadge does, so mobile and web never disagree
// on how a scan is labeled.
export function scanStatus(scan: {
  is_compliant?: boolean;
  compliance_score?: number;
  pipeline_status?: string;
  compliance_headline?: string;
}): "pass" | "review" | "fail" | "pending" {
  if (scan.pipeline_status === "pending" || scan.pipeline_status === "processing") return "pending";
  if (scan.compliance_headline === "NeedsManualReview" || scan.pipeline_status === "review_needed") return "review";
  if (scan.compliance_headline === "HasFailures") return "fail";
  if (scan.compliance_headline === "AllPass") return "pass";
  if (scan.is_compliant === false) return "fail";
  if (scan.is_compliant === true && scan.compliance_score != null && scan.compliance_score < 80) return "fail";
  if (scan.is_compliant === true) return "pass";
  return "review";
}

export function statusLabel(status: "pass" | "review" | "fail" | "pending"): string {
  switch (status) {
    case "pass": return "Compliant";
    case "fail": return "Non-Compliant";
    case "review": return "Needs Review";
    case "pending": return "Processing";
  }
}
