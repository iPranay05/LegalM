"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, Area, AreaChart,
} from "recharts";
import StatCard from "@/components/StatCard";
import ComplianceBadge from "@/components/ComplianceBadge";
import ScoreBar from "@/components/ScoreBar";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";

const PIE_COLORS = ["#1a7a3c", "#c0392b"];

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
    <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
      <svg className="animate-spin h-6 w-6 text-gov-navy" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading dashboard…
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">{error}</div>
  );

  if (!stats) return null;

  const pieData = [
    { name: "Compliant", value: stats.compliant_count },
    { name: "Non-Compliant", value: stats.non_compliant_count },
  ];

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Compliance Overview"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Legal Metrology (Packaged Commodities) Rules, 2011
            {user?.role && <span className="ml-2 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded capitalize">{user.role}</span>}
          </p>
        </div>
        <span className="text-xs text-gray-400">Last updated: {new Date().toLocaleTimeString("en-IN")}</span>
      </div>

      {/* Stat cards — 5 including pending reviews */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Scans" value={stats.total_scans} icon="🔍" accent="blue" sub="All time" />
        <StatCard title="Compliance Rate" value={`${stats.compliance_rate}%`} icon="✅" accent="green" sub="Pass rate" />
        <StatCard title="Scans Today" value={stats.scans_today} icon="📅" accent="orange" sub={`${stats.scans_this_week} this week`} />
        <StatCard title="Avg Score" value={`${stats.avg_compliance_score}%`} icon="📊" accent="blue" sub="Compliance score" />
        <StatCard
          title="Pending Reviews"
          value={stats.pending_reviews}
          icon="⚠️"
          accent={stats.pending_reviews > 0 ? "red" : "green"}
          sub="Need officer action"
        />
      </div>

      {/* Charts row 1: pie + trend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pie */}
        <div className="stat-card flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Compliant vs Non-Compliant</h2>
          {stats.total_scans === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No scans yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} scans`]} />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 7-day trend */}
        <div className="stat-card md:col-span-2 flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">7-Day Scan Trend</h2>
          {stats.trend.every(t => t.total === 0) ? (
            <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.trend} margin={{ left: 0, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#003580" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#003580" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="compliantGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1a7a3c" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1a7a3c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke="#003580" fill="url(#totalGrad)" strokeWidth={2} name="Total Scans" />
                <Area type="monotone" dataKey="compliant" stroke="#1a7a3c" fill="url(#compliantGrad)" strokeWidth={2} name="Compliant" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2: missing fields + top violations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top missing declarations */}
        <div className="stat-card flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Most Common Missing Declarations</h2>
          {stats.top_missing_fields.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.top_missing_fields} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="field" width={160} tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.length > 22 ? v.substring(0, 22) + "…" : v} />
                <Tooltip />
                <Bar dataKey="count" fill="#003580" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top violations from manual findings */}
        <div className="stat-card flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Top Manual Violation Rules</h2>
          {violations.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No manual findings yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={violations} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="rule_code" width={120} tick={{ fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip />
                <Bar dataKey="count" fill="#c0392b" radius={[0, 4, 4, 0]} name="Occurrences" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent scans */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Recent Scans</h2>
          <Link href="/scans" className="text-xs text-gov-navy font-semibold hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>{["Product", "Category", "Shop / Location", "Score", "Status", "Pipeline", "Date"].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {stats.recent_scans.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No scans yet.</td></tr>
              ) : stats.recent_scans.map((scan: any) => (
                <tr key={scan.scan_id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td font-semibold text-gray-800">
                    <Link href={`/scans/${scan.scan_id}`} className="hover:text-gov-navy hover:underline">
                      {scan.product_name || "Unknown"}
                    </Link>
                  </td>
                  <td className="table-td">
                    <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded capitalize">
                      {scan.category || "General"}
                    </span>
                  </td>
                  <td className="table-td text-gray-500">
                    {[scan.shop_name, scan.location].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="table-td w-36"><ScoreBar score={scan.compliance_score ?? 0} /></td>
                  <td className="table-td"><ComplianceBadge isCompliant={scan.is_compliant} /></td>
                  <td className="table-td">
                    {scan.pipeline_status === "review_needed" ? (
                      <span className="text-xs font-bold text-amber-600">⚠ Review</span>
                    ) : scan.pipeline_status === "complete" ? (
                      <span className="text-xs text-green-600 font-semibold">✓ Done</span>
                    ) : (
                      <span className="text-xs text-gray-400">{scan.pipeline_status || "—"}</span>
                    )}
                  </td>
                  <td className="table-td text-gray-400 whitespace-nowrap text-xs">
                    {formatDate(scan.created_at, "dd MMM, hh:mm a")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
