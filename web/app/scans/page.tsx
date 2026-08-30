"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ComplianceBadge from "@/components/ComplianceBadge";
import api from "@/lib/api";
import { Scan, CATEGORIES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 10;

type StatusFilter = "" | "compliant" | "non_compliant" | "review_needed";

// All data on this page comes from the existing LegalM `/scan/` API (the same
// endpoint the dashboard and scan detail pages use) — there is no separate
// history store. Category and compliance-status filters are pushed down to the
// backend query; date range and free-text search are applied to the returned
// records on the client since the existing endpoint doesn't take a date range.
function ScanHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);

  // Draft filter state (edited via the form, applied on "Apply Filters")
  const [draftCategory, setDraftCategory] = useState("");
  const [draftStatus, setDraftStatus] = useState<StatusFilter>("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftSearch, setDraftSearch] = useState(searchParams.get("q") || "");

  // Applied filter state (what's actually used to query/filter)
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState(searchParams.get("q") || "");

  const fetchScans = useCallback(async (params: { category: string; status: StatusFilter }) => {
    setLoading(true);
    setLoadError("");
    try {
      const query: Record<string, string> = { limit: "500" };
      if (params.category) query.category = params.category;
      if (params.status === "compliant") query.is_compliant = "true";
      if (params.status === "non_compliant") query.is_compliant = "false";
      if (params.status === "review_needed") query.pipeline_status = "review_needed";
      const res = await api.get<Scan[]>("/scan/", { params: query });
      setScans(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
      else setLoadError("Failed to load scan history. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchScans({ category, status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, status]);

  function applyFilters() {
    setCategory(draftCategory);
    setStatus(draftStatus);
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setSearch(draftSearch);
    setPage(1);
  }

  function clearFilters() {
    setDraftCategory("");
    setDraftStatus("");
    setDraftFrom("");
    setDraftTo("");
    setDraftSearch("");
    setCategory("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }

  const filtered = scans.filter((s) => {
    if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.created_at) > to) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hit =
        s.scan_id.toLowerCase().includes(q) ||
        s.product_name?.toLowerCase().includes(q) ||
        s.brand_name?.toLowerCase().includes(q) ||
        s.shop_name?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function statusLabel(scan: Scan) {
    if (scan.pipeline_status === "review_needed") return <ComplianceBadge headline="NeedsManualReview" pipelineStatus={scan.pipeline_status} />;
    return <ComplianceBadge isCompliant={scan.is_compliant} score={scan.compliance_score} pipelineStatus={scan.pipeline_status} headline={scan.compliance_summary?.headline} />;
  }

  return (
    <div className="space-y-gutter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Scan History</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Review previous metrology compliance scans recorded by LegalM.
          </p>
        </div>
        <Link
          href="/scans/new"
          className="bg-primary text-on-primary px-5 py-2 rounded-lg font-body-md text-body-md font-bold flex items-center gap-2 hover:bg-secondary transition-colors w-fit shadow-sm"
        >
          <span className="material-symbols-outlined">add</span>
          New Inspection
        </Link>
      </div>

      {/* Advanced filters */}
      <div className="lm-card p-5 space-y-4">
        <h2 className="font-headline-sm text-headline-sm text-on-surface m-0 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">filter_alt</span>
          Advanced Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="lm-label mb-1.5 block">Search</label>
            <input
              type="text"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder="Scan ID, Product, Manufacturer…"
              className="lm-input"
            />
          </div>
          <div>
            <label className="lm-label mb-1.5 block">Date From</label>
            <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="lm-input" />
          </div>
          <div>
            <label className="lm-label mb-1.5 block">Date To</label>
            <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="lm-input" />
          </div>
          <div>
            <label className="lm-label mb-1.5 block">Category</label>
            <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} className="lm-input">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="lm-label mb-1.5 block">Compliance Status</label>
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as StatusFilter)} className="lm-input">
              <option value="">All Statuses</option>
              <option value="compliant">Compliant</option>
              <option value="non_compliant">Non-Compliant</option>
              <option value="review_needed">Manual Review</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={clearFilters} className="lm-btn-secondary">
            Clear Filters
          </button>
          <button onClick={applyFilters} className="lm-btn-primary">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Results table */}
      <div className="lm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low font-label-caps text-label-caps text-on-surface-variant">
              <tr>
                {["Scan ID", "Date & Time", "Product", "Manufacturer", "Net Quantity", "Compliance Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 border-b border-border-subtle font-normal whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface divide-y divide-border-subtle">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant">Loading…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={7} className="text-center py-12 text-status-fail text-sm">{loadError}</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant text-sm">No scans match your filters.</td></tr>
              ) : (
                pageItems.map((scan) => (
                  <tr key={scan.scan_id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3.5 font-data-mono text-data-mono text-secondary font-semibold">
                      <Link href={`/scans/${scan.scan_id}`} className="hover:underline">
                        {scan.scan_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-on-surface-variant whitespace-nowrap text-sm">
                      {formatDate(scan.created_at, "dd MMM yyyy, hh:mm a")}
                    </td>
                    <td className="px-5 py-3.5 font-semibold max-w-[180px] truncate">
                      {scan.product_name || "Unknown"}
                      <div className="text-xs text-on-surface-variant font-normal capitalize mt-0.5">{scan.category || "general"}</div>
                    </td>
                    <td className="px-5 py-3.5 text-on-surface-variant max-w-[160px] truncate">
                      {scan.brand_name || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-on-surface-variant">
                      {scan.extracted_fields?.net_quantity || "—"}
                    </td>
                    <td className="px-5 py-3.5">{statusLabel(scan)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/scans/${scan.scan_id}`} className="text-secondary font-semibold hover:underline text-sm whitespace-nowrap">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border-subtle text-sm text-on-surface-variant">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-outline-variant disabled:opacity-40 hover:bg-surface-container-high transition-colors"
              >
                Prev
              </button>
              <span className="px-2 font-semibold text-on-surface">{currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-outline-variant disabled:opacity-40 hover:bg-surface-container-high transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScansPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-on-surface-variant">Loading…</div>}>
      <ScanHistoryContent />
    </Suspense>
  );
}
