import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: "up" | "down" | "neutral";
  accent?: "blue" | "green" | "red" | "orange";
}

const accentBorder: Record<string, string> = {
  blue:   "border-l-4 border-l-gov-navy",
  green:  "border-l-4 border-l-green-600",
  red:    "border-l-4 border-l-red-500",
  orange: "border-l-4 border-l-gov-saffron",
};

export default function StatCard({ title, value, sub, icon, accent = "blue" }: Props) {
  return (
    <div className={cn("stat-card", accentBorder[accent])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-3xl opacity-80">{icon}</span>
      </div>
    </div>
  );
}
