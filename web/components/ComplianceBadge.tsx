interface Props {
  isCompliant?: boolean;
  score?: number;
  showScore?: boolean;
  headline?: "AllPass" | "HasFailures" | "NeedsManualReview";
  pipelineStatus?: string;
}

export default function ComplianceBadge({ isCompliant, score, showScore = false, headline, pipelineStatus }: Props) {
  // Do not display a contradictory green badge for stale/partial scan payloads.
  const status = headline
    ?? (pipelineStatus === "review_needed" ? "NeedsManualReview"
      : isCompliant === false || (isCompliant === true && score != null && score < 80) ? "HasFailures"
      : isCompliant === true ? "AllPass" : undefined);

  if (status === "AllPass") {
    return (
      <span className="badge-pass">
        <span>✓</span>
        <span>Compliant{showScore && score !== undefined ? ` · ${score.toFixed(0)}%` : ""}</span>
      </span>
    );
  }
  if (status === "NeedsManualReview") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">
        <span>!</span>
        <span>Needs Review{showScore && score !== undefined ? ` · ${score.toFixed(0)}%` : ""}</span>
      </span>
    );
  }
  if (status === "HasFailures") {
    return (
      <span className="badge-fail">
        <span>✗</span>
        <span>Non-Compliant{showScore && score !== undefined ? ` · ${score.toFixed(0)}%` : ""}</span>
      </span>
    );
  }
  return <span className="badge-neutral">—</span>;
}
