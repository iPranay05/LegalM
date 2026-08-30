"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Manufacturer, CATEGORIES } from "@/lib/types";

export default function NewProductPage() {
  const router = useRouter();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [form, setForm] = useState({
    name: "", brand_name: "", category: "general", sku: "", barcode: "",
    description: "", manufacturer_id: "", registered_by_manufacturer: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    api.get<Manufacturer[]>("/products/manufacturers").then((r) => setManufacturers(r.data));
  }, [router]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        ...form,
        manufacturer_id: form.manufacturer_id ? Number(form.manufacturer_id) : null,
      };
      await api.post("/products/", payload);
      router.push("/products");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create product");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/products" className="hover:text-gov-navy">Products</Link>
        <span>/</span>
        <span className="text-gray-800 font-semibold">Register New Product</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-xl font-extrabold text-gray-900 mb-5">Register Product</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Product Name *</label>
              <input required value={form.name} onChange={(e) => set("name", e.target.value)} className="form-input" placeholder="e.g. Tata Salt" />
            </div>
            <div>
              <label className="form-label">Brand Name</label>
              <input value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} className="form-input" placeholder="e.g. Tata" />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className="form-input">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">SKU</label>
              <input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="form-input" placeholder="Stock Keeping Unit" />
            </div>
            <div>
              <label className="form-label">Barcode</label>
              <input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} className="form-input" placeholder="EAN-13 / UPC" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Manufacturer</label>
              <select value={form.manufacturer_id} onChange={(e) => set("manufacturer_id", e.target.value)} className="form-input">
                <option value="">— Select Manufacturer —</option>
                {manufacturers.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">Description</label>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="form-input" rows={3} placeholder="Optional product description" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="self_check" checked={form.registered_by_manufacturer}
                onChange={(e) => set("registered_by_manufacturer", e.target.checked)}
                className="w-4 h-4 rounded accent-gov-navy"
              />
              <label htmlFor="self_check" className="text-sm text-gray-700">
                Self-check registration (product registered by the manufacturer themselves — restricted to viewing own products only)
              </label>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="gov-btn disabled:opacity-50">
              {loading ? "Saving…" : "Register Product"}
            </button>
            <Link href="/products" className="text-sm text-gray-500 hover:text-gray-800 py-2">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
