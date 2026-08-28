"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api, { API_BASE_URL } from "@/lib/api";
import { EcommerceCheck } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import ComplianceBadge from "@/components/ComplianceBadge";

export default function EcommercePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checks, setChecks] = useState<EcommerceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterCompliant, setFilterCompliant] = useState("");
  const [selectedCheck, setSelectedCheck] = useState<EcommerceCheck | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    url: "",
    platform_name: "",
    has_country_of_origin_filter: "" as "" | "true" | "false",
    officer_notes: "",
  });

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    fetchChecks();
  }, []);

  async function fetchChecks() {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (filterCompliant !== "") params.is_compliant = filterCompliant;
      const res = await api.get<EcommerceCheck[]>("/ecommerce/checks", { params });
      setChecks(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("url", form.url);
      if (form.platform_name) fd.append("platform_name", form.platform_name);
      if (form.has_country_of_origin_filter !== "")
        fd.append("has_country_of_origin_filter", form.has_country_of_origin_filter);
      if (form.officer_notes) fd.append("officer_notes", form.officer_notes);
      if (fileRef.current?.files?.[0])
        fd.append("evidence_screenshot", fileRef.current.files[0]);

      await api.post("/ecommerce/check", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShowForm(false);
      setForm({ url: "", platform_name: "", has_country_of_origin_filter: "", officer_notes: "" });
      if (fileRef.current) fileRef.current.value = "";
      fetchChecks();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const stats = {
    total: checks.length,
    compliant: checks.filter(c => c.is_compliant === true).length,
    nonCompliant: checks.filter(c => c.is_compliant === false).length,
    pending: checks.filter(c => c.is_compliant == null).length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">E-Commerce Listing Checker</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            FR-18 · Officer-submitted URL checks for country-of-origin filter compliance
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="gov-btn">
          {showForm ? "Cancel" : "+ Submit URL Check"}
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Checks", value: stats.total, color: "text-gray-900" },
          { label: "Compliant", value: stats.compliant, color: "text-green-700" },
          { label: "Non-Compliant", value: stats.nonCompliant, color: "text-red-600" },
          { label: "Pending Judgment", value: stats.pending, color: "text-yellow-600" },
        ].map(s => (
          <div key={s.label} className="stat-card text-center py-3">
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-4">Submit E-Commerce URL Check</h2>
          <p className="text-xs text-gray-500 mb-4 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <strong>FR-18:</strong> E-commerce entities must display country-of-origin filter on their platforms.
            Submit the URL and your manual judgment about whether the filter is present.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Platform URL *</label>
                <input
                  required type="url" value={form.url}
                  onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                  className="form-input" placeholder="https://www.amazon.in/s?k=..."
                />
              </div>
              <div>
                <label className="form-label">Platform Name</label>
                <input
                  value={form.platform_name}
                  onChange={(e) => setForm(f => ({ ...f, platform_name: e.target.value }))}
                  className="form-input" placeholder="e.g. Amazon, Flipkart, Meesho"
                />
              </div>
              <div>
                <label className="form-label">Country-of-Origin Filter Present?</label>
                <select
                  value={form.has_country_of_origin_filter}
                  onChange={(e) => setForm(f => ({ ...f, has_country_of_origin_filter: e.target.value as any }))}
                  className="form-input"
                >
                  <option value="">— Not yet assessed —</option>
                  <option value="true">✓ Yes — Filter is present</option>
                  <option value="false">✗ No — Filter is absent (non-compliant)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="form-label">Officer Notes</label>
                <textarea
                  value={form.officer_notes}
                  onChange={(e) => setForm(f => ({ ...f, officer_notes: e.target.value }))}
                  className="form-input" rows={3}
                  placeholder="Describe what you observed on the platform listing page…"
                />
              </div>
              <div className="col-span-2">
                <label className="form-label">Evidence Screenshot (optional)</label>
                <input
                  ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gov-navy file:text-white hover:file:bg-gov-dark"
                />
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}
            <button type="submit" disabled={submitting} className="gov-btn disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit Check"}
            </button>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex gap-3 items-center flex-wrap">
        <select
          value={filterCompliant}
          onChange={(e) => { setFilterCompliant(e.target.value); setTimeout(fetchChecks, 0); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Checks</option>
          <option value="true">Compliant Only</option>
          <option value="false">Non-Compliant Only</option>
        </select>
        <button onClick={fetchChecks} className="text-xs text-gray-500 hover:text-gray-800 underline">Refresh</button>
      </div>

      {/* Table + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>{["Platform", "URL", "Filter Present?", "Status", "Checked On", ""].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : checks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No checks submitted yet.</td></tr>
              ) : checks.map((c) => (
                <tr
                  key={c.check_id}
                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedCheck?.check_id === c.check_id ? "bg-blue-50" : ""}`}
                  onClick={() => setSelectedCheck(c)}
                >
                  <td className="table-td font-semibold">{c.platform_name || "—"}</td>
                  <td className="table-td max-w-[200px]">
                    <a
                      href={c.url} target="_blank" rel="noopener noreferrer"
                      className="text-gov-navy text-xs hover:underline truncate block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.url.replace(/^https?:\/\//, "").substring(0, 40)}{c.url.length > 50 ? "…" : ""}
                    </a>
                  </td>
                  <td className="table-td">
                    {c.has_country_of_origin_filter === true && <span className="badge-pass text-[10px]">✓ Present</span>}
                    {c.has_country_of_origin_filter === false && <span className="badge-fail text-[10px]">✗ Absent</span>}
                    {c.has_country_of_origin_filter == null && <span className="badge-neutral text-[10px]">Pending</span>}
                  </td>
                  <td className="table-td"><ComplianceBadge isCompliant={c.is_compliant ?? undefined} /></td>
                  <td className="table-td text-xs text-gray-400 whitespace-nowrap">{formatDate(c.checked_at, "dd MMM, hh:mm a")}</td>
                  <td className="table-td">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedCheck(c); }} className="text-xs text-gov-navy font-semibold hover:underline">Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedCheck ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="font-bold text-gray-800">Check Details</h2>
              <button onClick={() => setSelectedCheck(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Platform</p>
              <p className="font-semibold">{selectedCheck.platform_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">URL</p>
              <a href={selectedCheck.url} target="_blank" rel="noopener noreferrer"
                className="text-gov-navy text-xs break-all hover:underline">{selectedCheck.url}</a>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Compliance Status</p>
              <ComplianceBadge isCompliant={selectedCheck.is_compliant ?? undefined} />
            </div>
            {selectedCheck.officer_notes && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Officer Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selectedCheck.officer_notes}</p>
              </div>
            )}
            {selectedCheck.evidence_image_path && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Evidence Screenshot</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE_URL}/uploads/ecommerce/${selectedCheck.evidence_image_path.split(/[\\/]/).pop()}`}
                  alt="Evidence screenshot"
                  className="w-full rounded-lg border border-gray-200 object-contain max-h-64"
                />
              </div>
            )}
            <p className="text-xs text-gray-400">Checked {formatDate(selectedCheck.checked_at)}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-5 flex items-center justify-center text-gray-400 text-sm">
            Select a check to view details
          </div>
        )}
      </div>
    </div>
  );
}
