"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Manufacturer } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ManufacturersPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", registration_number: "", address: "", city: "", state: "",
    pincode: "", contact_email: "", contact_phone: "",
    is_importer: false, country_of_origin: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    fetchManufacturers();
  }, []);

  async function fetchManufacturers() {
    setLoading(true);
    try {
      const res = await api.get<Manufacturer[]>("/products/manufacturers");
      setManufacturers(res.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/products/manufacturers", form);
      setShowForm(false);
      setForm({ name: "", registration_number: "", address: "", city: "", state: "", pincode: "", contact_email: "", contact_phone: "", is_importer: false, country_of_origin: "" });
      fetchManufacturers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const filtered = manufacturers.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Manufacturers</h1>
          <p className="text-sm text-gray-500">{filtered.length} registered · <Link href="/products" className="text-gov-navy hover:underline">← Back to Products</Link></p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="gov-btn">
          {showForm ? "Cancel" : "+ Register Manufacturer"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-bold text-gray-800 mb-4">Register New Manufacturer</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Name *</label>
              <input required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Registration Number</label>
              <input value={form.registration_number} onChange={(e) => setForm(f => ({ ...f, registration_number: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">State</label>
              <input value={form.state} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">City</label>
              <input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Pincode</label>
              <input value={form.pincode} onChange={(e) => setForm(f => ({ ...f, pincode: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Address</label>
              <input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Contact Phone</label>
              <input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} className="form-input" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="is_imp" checked={form.is_importer} onChange={(e) => setForm(f => ({ ...f, is_importer: e.target.checked }))} className="w-4 h-4 accent-gov-navy" />
              <label htmlFor="is_imp" className="text-sm text-gray-700">This is an importer</label>
            </div>
            {form.is_importer && (
              <div>
                <label className="form-label">Country of Origin</label>
                <input value={form.country_of_origin} onChange={(e) => setForm(f => ({ ...f, country_of_origin: e.target.value }))} className="form-input" placeholder="e.g. China, USA" />
              </div>
            )}
            {error && <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{error}</div>}
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="gov-btn disabled:opacity-50">{saving ? "Saving…" : "Register"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <input type="text" placeholder="Search manufacturers…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-gov-navy/20" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>{["Name", "Reg. No.", "State / City", "Contact", "Type", "Registered"].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No manufacturers found.</td></tr>
            ) : filtered.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="table-td font-semibold">{m.name}</td>
                <td className="table-td text-gray-500 font-mono text-xs">{m.registration_number || "—"}</td>
                <td className="table-td text-gray-500">{[m.city, m.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="table-td text-gray-500 text-xs">{m.contact_email || m.contact_phone || "—"}</td>
                <td className="table-td">
                  {m.is_importer
                    ? <span className="badge-fail text-[10px]">Importer · {m.country_of_origin || "??"}</span>
                    : <span className="badge-pass text-[10px]">Domestic</span>}
                </td>
                <td className="table-td text-gray-400 text-xs">{formatDate(m.created_at, "dd MMM yyyy")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
