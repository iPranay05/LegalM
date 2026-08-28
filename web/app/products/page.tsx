"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ComplianceBadge from "@/components/ComplianceBadge";
import ScoreBar from "@/components/ScoreBar";
import api from "@/lib/api";
import { Product, Manufacturer, CATEGORIES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMfr, setFilterMfr] = useState("");
  const [filterCompliant, setFilterCompliant] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (filterCategory) params.category = filterCategory;
      if (filterMfr) params.manufacturer_id = filterMfr;
      if (filterCompliant !== "") params.is_compliant = filterCompliant;
      const [prodRes, mfrRes] = await Promise.all([
        api.get<Product[]>("/products/", { params }),
        api.get<Manufacturer[]>("/products/manufacturers"),
      ]);
      setProducts(prodRes.data);
      setManufacturers(mfrRes.data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterMfr, filterCompliant, router]);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    fetchData();
  }, [fetchData]);

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.brand_name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">{filtered.length} products · <Link href="/products/manufacturers" className="text-gov-navy hover:underline">Manage Manufacturers →</Link></p>
        </div>
        <Link href="/products/new" className="gov-btn">+ Register Product</Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center shadow-sm">
        <input
          type="text"
          placeholder="Search name, brand, SKU, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-gov-navy/20"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select
          value={filterMfr}
          onChange={(e) => setFilterMfr(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Manufacturers</option>
          {manufacturers.map((m) => (
            <option key={m.id} value={String(m.id)}>{m.name}</option>
          ))}
        </select>
        <select
          value={filterCompliant}
          onChange={(e) => setFilterCompliant(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Compliance</option>
          <option value="true">Compliant Only</option>
          <option value="false">Non-Compliant Only</option>
        </select>
        <button onClick={() => { setFilterCategory(""); setFilterMfr(""); setFilterCompliant(""); setSearch(""); }} className="text-xs text-gray-500 hover:text-gray-800 underline">Clear</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Product Name", "Brand", "Category", "Manufacturer", "SKU / Barcode", "Compliance", "Score", "Last Scan", ""].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No products found.</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td font-semibold text-gray-800">
                    <Link href={`/products/${p.id}`} className="hover:text-gov-navy hover:underline">{p.name}</Link>
                    {p.registered_by_manufacturer && (
                      <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-bold">Self-check</span>
                    )}
                  </td>
                  <td className="table-td text-gray-500">{p.brand_name || "—"}</td>
                  <td className="table-td">
                    <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded capitalize">{p.category || "general"}</span>
                  </td>
                  <td className="table-td text-gray-600">{p.manufacturer?.name || "—"}</td>
                  <td className="table-td text-xs text-gray-500 font-mono">
                    {p.sku ? <span>SKU: {p.sku}</span> : null}
                    {p.barcode ? <span className="block">Bar: {p.barcode}</span> : null}
                    {!p.sku && !p.barcode ? "—" : null}
                  </td>
                  <td className="table-td"><ComplianceBadge isCompliant={p.is_compliant} /></td>
                  <td className="table-td w-32">
                    {p.last_compliance_score != null
                      ? <ScoreBar score={p.last_compliance_score} />
                      : <span className="text-gray-400 text-xs">No scan</span>}
                  </td>
                  <td className="table-td text-xs text-gray-400">
                    {p.last_scan_id
                      ? <Link href={`/scans/${p.last_scan_id}`} className="text-gov-navy hover:underline">View scan →</Link>
                      : "—"}
                  </td>
                  <td className="table-td">
                    <Link href={`/products/${p.id}`} className="text-xs text-gov-navy font-semibold hover:underline">Details →</Link>
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
