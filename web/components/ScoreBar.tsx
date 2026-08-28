import { cn, scoreBg } from "@/lib/utils";

interface Props {
  score: number;
  showLabel?: boolean;
  height?: string;
}

export default function ScoreBar({ score, showLabel = true, height = "h-2" }: Props) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className={cn("flex-1 bg-gray-200 rounded-full overflow-hidden", height)}>
        <div
          className={cn("h-full rounded-full transition-all", scoreBg(score))}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-bold text-gray-700 w-10 text-right">
          {score.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
