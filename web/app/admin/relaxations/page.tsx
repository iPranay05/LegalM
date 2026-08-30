"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { RelaxationOrder, Rule, CATEGORIES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function RelaxationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<RelaxationOrder[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    order_number: "", rule_id: "", title: "", description: "", gazette_reference: "",
    applies_to_categories: [] as string[], applies_to_states: "",
    valid_from: new Date().toISOString().split("T")[0], valid_until: "",
  });

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    const ruleFilter = searchParams.get("rule_id");
    fetchData(ruleFilter ? Number(ruleFilter) : undefined);
  }, []);

  async function fetchData(ruleId?: number) {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (ruleId) params.rule_id = String(ruleId);
      const [ordRes, ruleRes] = await Promise.all([
        api.get<RelaxationOrder[]>("/admin/relaxations", { params: { active_only: false } }),
        api.get<Rule[]>("/admin/rules"),
      ]);
      setOrders(ordRes.data);
      setRules(ruleRes.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
      if (e?.response?.status === 403) setError("Admin access required.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        rule_id: Number(form.rule_id),
        applies_to_states: form.applies_to_states ? form.applies_to_states.split(",").map(s => s.trim()) : null,
        applies_to_categories: form.applies_to_categories.length ? form.applies_to_categories : null,
        valid_from: new Date(form.valid_from).toISOString(),
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      };
      await api.post("/admin/relaxations", payload);
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create");
    }
  }

  async function handleDeactivate(id: number) {
    if (!confirm("Deactivate this relaxation order?")) return;
    try {
      await api.patch(`/admin/relaxations/${id}/deactivate`);
      fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed");
    }
  }

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      applies_to_categories: f.applies_to_categories.includes(cat)
        ? f.applies_to_categories.filter(c => c !== cat)
        : [...f.applies_to_categories, cat],
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin" className="hover:text-gov-navy">Admin</Link><span>/</span>
            <span className="text-gray-800">Relaxation Orders</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Relaxation Orders</h1>
          <p className="text-sm text-gray-500">{orders.length} orders</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="gov-btn">{showForm ? "Cancel" : "+ New Order"}</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-4">Create Relaxation Order</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Order Number *</label>
              <input required value={form.order_number} onChange={(e) => setForm(f => ({ ...f, order_number: e.target.value }))} className="form-input" placeholder="e.g. SO-2024-001" />
            </div>
            <div>
              <label className="form-label">Gazette Reference</label>
              <input value={form.gazette_reference} onChange={(e) => setForm(f => ({ ...f, gazette_reference: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Rule *</label>
              <select required value={form.rule_id} onChange={(e) => setForm(f => ({ ...f, rule_id: e.target.value }))} className="form-input">
                <option value="">— Select Rule —</option>
                {rules.map((r) => <option key={r.id} value={String(r.id)}>{r.code} — {r.title}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">Title *</label>
              <input required value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Description</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="form-input" rows={2} />
            </div>
            <div>
              <label className="form-label">Valid From *</label>
              <input type="date" required value={form.valid_from} onChange={(e) => setForm(f => ({ ...f, valid_from: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Valid Until <span className="text-gray-400 font-normal">(leave empty = indefinite)</span></label>
              <input type="date" value={form.valid_until} onChange={(e) => setForm(f => ({ ...f, valid_until: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Applies to Categories <span className="text-gray-400 font-normal">(empty = all)</span></label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CATEGORIES.map(c => (
                  <button type="button" key={c} onClick={() => toggleCategory(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${form.applies_to_categories.includes(c) ? "bg-gov-navy text-white border-gov-navy" : "bg-white text-gray-600 border-gray-300"}`}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="form-label">Applies to States <span className="text-gray-400 font-normal">(comma-separated; empty = all India)</span></label>
              <input value={form.applies_to_states} onChange={(e) => setForm(f => ({ ...f, applies_to_states: e.target.value }))} className="form-input" placeholder="e.g. Maharashtra, Gujarat" />
            </div>
            {error && <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{error}</div>}
            <div className="col-span-2"><button type="submit" className="gov-btn">Create Order</button></div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>{["Order No.", "Rule", "Title", "Scope", "Valid Period", "Status", ""].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No relaxation orders.</td></tr>
            ) : orders.map((o) => {
              const rule = rules.find(r => r.id === o.rule_id);
              return (
                <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_active ? "opacity-50" : ""}`}>
                  <td className="table-td font-mono text-xs font-bold">{o.order_number}</td>
                  <td className="table-td text-xs text-gov-navy font-semibold">{rule?.code || `#${o.rule_id}`}</td>
                  <td className="table-td font-semibold text-sm">{o.title}</td>
                  <td className="table-td text-xs text-gray-500">
                    <div>{o.applies_to_categories?.join(", ") || "All categories"}</div>
                    <div>{o.applies_to_states?.join(", ") || "All India"}</div>
                  </td>
                  <td className="table-td text-xs text-gray-500">
                    <div>From: {formatDate(o.valid_from, "dd MMM yyyy")}</div>
                    <div>{o.valid_until ? `Until: ${formatDate(o.valid_until, "dd MMM yyyy")}` : "Indefinite"}</div>
                  </td>
                  <td className="table-td">
                    {o.is_active ? <span className="badge-pass text-[10px]">Active</span> : <span className="badge-neutral text-[10px]">Inactive</span>}
                  </td>
                  <td className="table-td">
                    {o.is_active && (
                      <button onClick={() => handleDeactivate(o.id)} className="text-xs text-red-600 hover:underline font-semibold">Deactivate</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RelaxationsPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading relaxation orders…</div>}><RelaxationsContent /></Suspense>;
}
