"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  RadialBarChart, RadialBar,
} from "recharts";
import StatCard from "@/components/StatCard";
import api from "@/lib/api";
import { DashboardStats } from "@/lib/types";

const CATEGORY_COLORS = [
  "#003580", "#FF6B00", "#1a7a3c", "#c0392b", "#8e44ad", "#2980b9",
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [byCategory, setByCategory] = useState<{ category: string; total: number }[]>([]);
  const [byState, setByState] = useState<
    { state: string; total: number; compliant: number; non_compliant: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/dashboard/scans-by-category"),
      api.get("/dashboard/scans-by-state"),
    ])
      .then(([s, c, st]) => {
        setStats(s.data);
        setByCategory(c.data);
        setByState(st.data);
      })
      .catch((e) => { if (e?.response?.status === 401) router.push("/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-3">
        <svg className="animate-spin h-6 w-6 text-gov-navy" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading analytics…
      </div>
    );

  if (!stats) return null;

  const complianceGauge = [
    { name: "Compliance Rate", value: stats.compliance_rate, fill: "#1a7a3c" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Aggregate compliance data across all inspectors and regions
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Scans" value={stats.total_scans} icon="🔍" accent="blue" />
        <StatCard title="Compliant" value={stats.compliant_count} icon="✅" accent="green" sub={`${stats.compliance_rate}% pass rate`} />
        <StatCard title="Non-Compliant" value={stats.non_compliant_count} icon="❌" accent="red" />
        <StatCard title="Avg Score" value={`${stats.avg_compliance_score}%`} icon="📊" accent="orange" />
      </div>

      {/* Gauge + category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Compliance rate gauge */}
        <div className="stat-card flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Overall Compliance Rate
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            % of scanned products meeting LM (PC) Rules 2011 requirements
          </p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                startAngle={180}
                endAngle={0}
                data={complianceGauge}
              >
                <RadialBar dataKey="value" background cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div>
              <p className="text-5xl font-extrabold text-gray-900">
                {stats.compliance_rate}
                <span className="text-2xl text-gray-400">%</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">Compliance rate</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats.compliant_count} of {stats.total_scans} scans passed
              </p>
            </div>
          </div>
        </div>

        {/* By category */}
        <div className="stat-card flex flex-col">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
            Scans by Product Category
          </h2>
          {byCategory.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top missing fields */}
      <div className="stat-card">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
          Most Frequently Missing Declarations
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Fields most often absent on scanned product labels — indicates systemic non-compliance areas
        </p>
        {stats.top_missing_fields.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={stats.top_missing_fields}
              layout="vertical"
              margin={{ left: 8, right: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="field"
                width={180}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => (v.length > 25 ? v.substring(0, 25) + "…" : v)}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#c0392b" radius={[0, 6, 6, 0]} name="Occurrences" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By state */}
      {byState.length > 0 && (
        <div className="stat-card">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
            Compliance by State
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["State", "Total Scans", "Compliant", "Non-Compliant", "Pass Rate"].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byState.map((row) => {
                  const rate = row.total > 0
                    ? ((row.compliant / row.total) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <tr key={row.state} className="hover:bg-gray-50">
                      <td className="table-td font-semibold">{row.state}</td>
                      <td className="table-td">{row.total}</td>
                      <td className="table-td text-green-700 font-semibold">{row.compliant}</td>
                      <td className="table-td text-red-600 font-semibold">{row.non_compliant}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                Number(rate) >= 80 ? "bg-green-500" :
                                Number(rate) >= 50 ? "bg-yellow-400" : "bg-red-500"
                              }`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-700">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
