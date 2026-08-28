interface Props {
  isCompliant?: boolean;
  score?: number;
  showScore?: boolean;
  headline?: "AllPass" | "HasFailures" | "NeedsManualReview";
}

export default function ComplianceBadge({ isCompliant, score, showScore = false, headline }: Props) {
  const status = headline ?? (isCompliant === true ? "AllPass" : isCompliant === false ? "HasFailures" : undefined);

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
