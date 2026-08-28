"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ComplianceBadge from "@/components/ComplianceBadge";
import ScoreBar from "@/components/ScoreBar";
import api from "@/lib/api";
import { Scan } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const CATEGORIES = ["", "general", "food", "cosmetic", "textile", "pharma", "electronics"];

export default function ScansPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ compliant?: boolean; category?: string }>({});
  const [search, setSearch] = useState("");

  const fetchScans = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (filter.compliant !== undefined) params.is_compliant = String(filter.compliant);
      if (filter.category) params.category = filter.category;
      const res = await api.get<Scan[]>("/scan/", { params });
      setScans(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [filter, router]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const filtered = scans.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.product_name?.toLowerCase().includes(q) ||
      s.shop_name?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      s.scan_id.includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">All Scans</h1>
          <p className="text-sm text-gray-500">{filtered.length} records</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center shadow-sm">
        <input
          type="text"
          placeholder="Search product, shop, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-gov-navy/20"
        />
        <select
          value={filter.compliant === undefined ? "" : String(filter.compliant)}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              compliant: e.target.value === "" ? undefined : e.target.value === "true",
            }))
          }
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gov-navy/20"
        >
          <option value="">All Statuses</option>
          <option value="true">Compliant Only</option>
          <option value="false">Non-Compliant Only</option>
        </select>
        <select
          value={filter.category || ""}
          onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value || undefined }))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gov-navy/20"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === "" ? "All Categories" : c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFilter({})}
          className="text-xs text-gray-500 hover:text-gray-800 underline"
        >
          Clear filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Product Name", "Category", "Shop", "Location",
                  "Score", "Status", "Missing Fields", "Scanned On", "",
                ].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                    No scans match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((scan) => (
                  <tr key={scan.scan_id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-semibold text-gray-800 max-w-[160px] truncate">
                      {scan.product_name || "Unknown"}
                    </td>
                    <td className="table-td">
                      <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded capitalize">
                        {scan.category || "general"}
                      </span>
                    </td>
                    <td className="table-td text-gray-500 max-w-[120px] truncate">
                      {scan.shop_name || "—"}
                    </td>
                    <td className="table-td text-gray-500 max-w-[120px] truncate">
                      {scan.location || "—"}
                    </td>
                    <td className="table-td w-32">
                      <ScoreBar score={scan.compliance_score ?? 0} />
                    </td>
                    <td className="table-td">
                      <ComplianceBadge isCompliant={scan.is_compliant} headline={scan.compliance_summary?.headline} />
                    </td>
                    <td className="table-td">
                      {scan.missing_fields && scan.missing_fields.length > 0 ? (
                        <span className="text-xs text-red-600 font-semibold">
                          ⚠ {scan.missing_fields.length} field{scan.missing_fields.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 font-semibold">✓ All present</span>
                      )}
                    </td>
                    <td className="table-td text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(scan.created_at, "dd MMM, hh:mm a")}
                    </td>
                    <td className="table-td">
                      <Link
                        href={`/scans/${scan.scan_id}`}
                        className="text-xs text-gov-navy font-semibold hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
