"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Rule, CATEGORIES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function RulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [retiring, setRetiring] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    code: "", title: "", description: "", legal_reference: "",
    effective_from: new Date().toISOString().slice(0, 10),
    is_mandatory: true, is_conduct_bucket: false, weight: 10,
    category_scope: [] as string[],
  });

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    fetchRules();
  }, [includeRetired]);

  async function fetchRules() {
    setLoading(true);
    try {
      const res = await api.get<Rule[]>("/admin/rules", { params: { include_retired: includeRetired } });
      setRules(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
      if (e?.response?.status === 403) setError("Admin or Controller access required.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingRule) {
        await api.patch(`/admin/rules/${editingRule.id}`, {
          ...form,
          check_type: editingRule.check_type,
        });
      } else {
        await api.post("/admin/rules", form);
      }
      setShowForm(false);
      setEditingRule(null);
      fetchRules();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create rule");
    }
  }

  function beginEdit(rule: Rule) {
    setEditingRule(rule);
    setForm({ code: rule.code, title: rule.title, description: rule.description || "", legal_reference: rule.legal_reference || "", effective_from: rule.effective_from,
      is_mandatory: rule.is_mandatory, is_conduct_bucket: rule.is_conduct_bucket, weight: rule.weight, category_scope: rule.category_scope || [] });
    setShowForm(true);
  }

  async function handleRetire(ruleId: number) {
    if (!confirm("Retire this rule? It will be soft-deleted (never hard-deleted).")) return;
    setRetiring(ruleId);
    try {
      const res = await api.patch(`/admin/rules/${ruleId}/retire`);
      if (res.data.warning) alert("Warning: " + res.data.warning);
      fetchRules();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to retire");
    } finally {
      setRetiring(null);
    }
  }

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      category_scope: f.category_scope.includes(cat)
        ? f.category_scope.filter(c => c !== cat)
        : [...f.category_scope, cat],
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin" className="hover:text-gov-navy">Admin</Link><span>/</span>
            <span className="text-gray-800">Rules</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Compliance Rules</h1>
          <p className="text-sm text-gray-500">{rules.length} rules{includeRetired ? " (incl. retired)" : ""}</p>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} className="accent-gov-navy" />
            Show retired
          </label>
          <button onClick={() => { setEditingRule(null); setShowForm(!showForm); }} className="gov-btn">
            {showForm ? "Cancel" : "+ Create Rule"}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-4">{editingRule ? `Edit Rule (creates new version of ${editingRule.code})` : "Create New Rule"}</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Rule Code * <span className="text-gray-400 font-normal">(e.g. LM-PC-R6-01)</span></label>
              <input required value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} className="form-input font-mono" />
            </div>
            <div>
              <label className="form-label">Weight (1–100)</label>
              <input type="number" min={1} max={100} value={form.weight} onChange={(e) => setForm(f => ({ ...f, weight: Number(e.target.value) }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Title *</label>
              <input required value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Description</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="form-input" rows={2} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Legal Reference</label>
              <input value={form.legal_reference} onChange={(e) => setForm(f => ({ ...f, legal_reference: e.target.value }))} className="form-input" placeholder="e.g. Rule 6(1)(a), LM(PC) Rules 2011" />
            </div>
            <div>
              <label className="form-label">Effective From *</label>
              <input required type="date" value={form.effective_from} onChange={(e) => setForm(f => ({ ...f, effective_from: e.target.value }))} className="form-input" />
              {editingRule && <p className="text-xs text-gray-400 mt-1">The new version applies only on or after this date.</p>}
            </div>
            <div className="col-span-2">
              <label className="form-label">Category Scope <span className="text-gray-400 font-normal">(leave empty = applies to all)</span></label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CATEGORIES.map((c) => (
                  <button type="button" key={c} onClick={() => toggleCategory(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                      form.category_scope.includes(c)
                        ? "bg-gov-navy text-white border-gov-navy"
                        : "bg-white text-gray-600 border-gray-300 hover:border-gov-navy"
                    }`}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm(f => ({ ...f, is_mandatory: e.target.checked }))} className="accent-gov-navy" />
                Mandatory
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_conduct_bucket} onChange={(e) => setForm(f => ({ ...f, is_conduct_bucket: e.target.checked }))} className="accent-gov-navy" />
                Conduct bucket (officer-only)
              </label>
            </div>
            <div className="col-span-2">
              <button type="submit" className="gov-btn">{editingRule ? "Save New Version" : "Create Rule"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Rules table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>{["Code", "Title", "Scope", "Weight", "Flags", "Relaxations", "Status", ""].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No rules yet.</td></tr>
            ) : rules.map((r) => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.is_active ? "opacity-50" : ""}`}>
                <td className="table-td font-mono text-xs font-bold text-gov-navy">{r.code}</td>
                <td className="table-td">
                  <p className="font-semibold text-gray-800 text-sm">{r.title}</p>
                  {r.legal_reference && <p className="text-xs text-gray-400">{r.legal_reference}</p>}
                </td>
                <td className="table-td text-xs text-gray-500">
                  {r.category_scope?.length ? r.category_scope.join(", ") : "All"}
                </td>
                <td className="table-td text-center font-bold">{r.weight}</td>
                <td className="table-td">
                  <div className="flex flex-col gap-1">
                    {r.is_mandatory && <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5 font-bold w-fit">Mandatory</span>}
                    {r.is_conduct_bucket && <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 font-bold w-fit">Conduct</span>}
                  </div>
                </td>
                <td className="table-td text-center">
                  {(r.relaxation_count ?? 0) > 0
                    ? <Link href={`/admin/relaxations?rule_id=${r.id}`} className="text-xs text-gov-navy font-semibold hover:underline">{r.relaxation_count} order(s)</Link>
                    : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="table-td">
                  {r.is_active
                    ? <span className="badge-pass text-[10px]">Active</span>
                    : <span className="badge-neutral text-[10px]">Retired {r.retired_at ? formatDate(r.retired_at, "dd MMM yyyy") : ""}</span>}
                </td>
                <td className="table-td">
                  {r.is_active && (<>
                    <button onClick={() => beginEdit(r)} className="text-xs text-gov-navy hover:underline font-semibold mr-3">Edit</button>
                    <button onClick={() => handleRetire(r.id)} disabled={retiring === r.id}
                      className="text-xs text-red-600 hover:underline font-semibold disabled:opacity-50">
                      {retiring === r.id ? "Retiring…" : "Retire"}
                    </button>
                  </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
