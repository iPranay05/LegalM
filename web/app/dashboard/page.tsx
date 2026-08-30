"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DashboardData {
  total_scans: number;
  compliant_count: number;
  non_compliant_count: number;
  compliance_rate: number;
  avg_compliance_score: number;
  scans_today: number;
  scans_this_week: number;
  pending_reviews: number;
  top_missing_fields: { field: string; count: number }[];
  trend: { date: string; total: number; compliant: number }[];
  recent_scans: any[];
}

// Data-fetching logic below is unchanged from the working LegalM app — it calls the
// existing /dashboard/stats and /dashboard/top-violations APIs. Only presentation
// (markup + styling) has been reskinned to match the Stitch "dashboard_legalm" design.
export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [violations, setViolations] = useState<{ rule_code: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    try {
      setUser(JSON.parse(localStorage.getItem("auth_user") || "{}"));
    } catch {}
    Promise.all([
      api.get<DashboardData>("/dashboard/stats"),
      api.get("/dashboard/top-violations"),
    ])
      .then(([s, v]) => {
        setStats(s.data);
        setViolations(v.data);
      })
      .catch((e) => {
        if (e?.response?.status === 401) router.push("/login");
        else setError("Failed to load dashboard data. Is the backend running?");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-on-surface-variant">
      <span className="material-symbols-outlined animate-spin">progress_activity</span>
      Loading dashboard…
    </div>
  );

  if (error) return (
    <div className="bg-error-container text-on-error-container rounded-xl p-6 text-sm">{error}</div>
  );

  if (!stats) return null;

  function statusBadge(scan: any) {
    if (scan.pipeline_status === "review_needed") return <span className="lm-badge-review">Review</span>;
    if (scan.is_compliant) return <span className="lm-badge-pass">Pass</span>;
    return <span className="lm-badge-fail">Fail</span>;
  }

  return (
    <div className="space-y-gutter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
            {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Inspector Overview"}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Legal Metrology (Packaged Commodities) Rules, 2011 — real-time compliance metrics.
            {user?.role && <span className="ml-2 lm-badge-neutral normal-case">{user.role}</span>}
          </p>
        </div>
        <Link
          href="/scans/new"
          className="bg-primary text-on-primary px-6 py-2 rounded-lg font-body-md text-body-md font-bold flex items-center gap-2 hover:bg-secondary transition-colors w-fit shadow-sm"
        >
          <span className="material-symbols-outlined">add</span>
          New Inspection
        </Link>
      </div>

      {/* Metrics bento grid — real backend data */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <div className="lm-card p-6 flex flex-col justify-between h-32 hover:border-secondary transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Total Scans</span>
            <span className="material-symbols-outlined text-secondary opacity-70">barcode_scanner</span>
          </div>
          <div className="flex items-baseline gap-2 mt-auto">
            <span className="font-headline-lg text-headline-lg text-on-surface">{stats.total_scans}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">{stats.scans_today} today</span>
          </div>
        </div>

        <div className="lm-card p-6 flex flex-col justify-between h-32 relative overflow-hidden hover:border-status-pass transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Compliant</span>
            <span className="material-symbols-outlined text-status-pass opacity-70">check_circle</span>
          </div>
          <div className="flex items-baseline gap-2 mt-auto">
            <span className="font-headline-lg text-headline-lg text-on-surface">{stats.compliant_count}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">{stats.compliance_rate}%</span>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-status-pass" style={{ width: `${stats.compliance_rate}%` }} />
        </div>

        <div className="lm-card p-6 flex flex-col justify-between h-32 hover:border-status-fail transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Violations</span>
            <span className="material-symbols-outlined text-status-fail opacity-70">warning</span>
          </div>
          <div className="flex items-baseline gap-2 mt-auto">
            <span className="font-headline-lg text-headline-lg text-on-surface">{stats.non_compliant_count}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">Avg score {stats.avg_compliance_score}%</span>
          </div>
        </div>

        <div className={cn(
          "lm-card p-6 flex flex-col justify-between h-32 transition-colors",
          stats.pending_reviews > 0 && "ring-1 ring-status-review/20 bg-status-review/5 border-status-review/40"
        )}>
          <div className="flex justify-between items-start">
            <span className="font-label-caps text-label-caps text-status-review font-bold">Manual Review Required</span>
            <span className="material-symbols-outlined text-status-review">gavel</span>
          </div>
          <div className="flex items-baseline gap-2 mt-auto">
            <span className="font-headline-lg text-headline-lg text-on-surface">{stats.pending_reviews}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">Flagged for officer action</span>
          </div>
        </div>
      </div>

      {/* Main content split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        {/* Recent scans table */}
        <div className="lg:col-span-2 lm-card overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-bright">
            <h3 className="font-headline-sm text-headline-sm text-on-surface m-0">Recent Scans</h3>
            <Link href="/scans" className="font-body-md text-body-md text-secondary hover:underline flex items-center gap-1">
              View All <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant">
                <tr>
                  <th className="px-6 py-3 border-b border-border-subtle font-normal">Scan ID</th>
                  <th className="px-6 py-3 border-b border-border-subtle font-normal">Product</th>
                  <th className="px-6 py-3 border-b border-border-subtle font-normal">Shop / Location</th>
                  <th className="px-6 py-3 border-b border-border-subtle font-normal">Status</th>
                  <th className="px-6 py-3 border-b border-border-subtle font-normal text-right">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface divide-y divide-border-subtle">
                {stats.recent_scans.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-on-surface-variant text-sm">No scans yet.</td></tr>
                ) : stats.recent_scans.map((scan: any) => (
                  <tr key={scan.scan_id} className={cn("hover:bg-bg-offset transition-colors", scan.pipeline_status === "review_needed" && "bg-status-review/5")}>
                    <td className="px-6 py-4 font-data-mono text-data-mono text-on-surface-variant">#{scan.scan_id}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold">{scan.product_name || "Unknown"}</div>
                      <div className="text-xs text-on-surface-variant mt-1 capitalize">{scan.category || "General"}</div>
                    </td>
                    <td className="px-6 py-4 text-on-surface-variant">
                      {[scan.shop_name, scan.location].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-6 py-4">{statusBadge(scan)}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/scans/${scan.scan_id}`} className="text-secondary hover:text-primary transition-colors p-1 inline-flex">
                        <span className="material-symbols-outlined">visibility</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-gutter">
          <div className="lm-card p-6">
            <h3 className="font-headline-sm text-headline-sm text-on-surface m-0 mb-4">7-Day Compliance Trend</h3>
            {stats.trend.every((t) => t.total === 0) ? (
              <p className="text-on-surface-variant text-sm text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={stats.trend} margin={{ left: 0, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#115cb9" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#115cb9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="compliantGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" stroke="#115cb9" fill="url(#totalGrad)" strokeWidth={2} name="Total Scans" />
                  <Area type="monotone" dataKey="compliant" stroke="#10b981" fill="url(#compliantGrad)" strokeWidth={2} name="Compliant" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="lm-card p-6">
            <h3 className="font-headline-sm text-headline-sm text-on-surface m-0 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-status-review">warning</span> Top Manual Violations
            </h3>
            {violations.length === 0 ? (
              <p className="text-on-surface-variant text-sm text-center py-4">No manual findings yet.</p>
            ) : (
              <ul className="space-y-3">
                {violations.slice(0, 5).map((v) => (
                  <li key={v.rule_code} className="flex gap-3 text-sm border-l-2 border-status-fail pl-3 py-1 bg-status-fail/5">
                    <span className="font-bold text-status-fail shrink-0 font-data-mono text-data-mono">{v.rule_code}</span>
                    <span className="text-on-surface-variant ml-auto">{v.count} occurrences</span>
                  </li>
                ))}
              </ul>
            )}
            {stats.top_missing_fields.length > 0 && (
              <>
                <h4 className="font-label-caps text-label-caps text-on-surface-variant mt-5 mb-2 uppercase">
                  Most Common Missing Declarations
                </h4>
                <ul className="space-y-2">
                  {stats.top_missing_fields.slice(0, 5).map((f) => (
                    <li key={f.field} className="flex justify-between text-sm border-l-2 border-secondary pl-3 py-1">
                      <span className="text-on-surface truncate">{f.field}</span>
                      <span className="text-on-surface-variant font-data-mono text-data-mono">{f.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
