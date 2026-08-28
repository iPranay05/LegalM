import { cn } from "@/lib/utils";

interface Props {
  isCompliant?: boolean;
  score?: number;
  showScore?: boolean;
}

export default function ComplianceBadge({ isCompliant, score, showScore = false }: Props) {
  if (isCompliant === true) {
    return (
      <span className="badge-pass">
        <span>✓</span>
        <span>Compliant{showScore && score !== undefined ? ` · ${score.toFixed(0)}%` : ""}</span>
      </span>
    );
  }
  if (isCompliant === false) {
    return (
      <span className="badge-fail">
        <span>✗</span>
        <span>Non-Compliant{showScore && score !== undefined ? ` · ${score.toFixed(0)}%` : ""}</span>
      </span>
    );
  }
  return <span className="badge-neutral">—</span>;
}
