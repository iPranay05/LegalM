"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ComplianceBadge from "@/components/ComplianceBadge";
import ScoreBar from "@/components/ScoreBar";
import api from "@/lib/api";
import { Product, Scan } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) { router.push("/login"); return; }
    Promise.all([
      api.get<Product>(`/products/${params.productId}`),
      api.get<Scan[]>("/scan/", { params: { limit: 200, product_id: params.productId } }),
    ])
      .then(([pRes, sRes]) => {
        setProduct(pRes.data);
        setScans(sRes.data);
      })
      .catch((e) => { if (e?.response?.status === 401) router.push("/login"); })
      .finally(() => setLoading(false));
  }, [params.productId, router]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  if (!product) return <div className="text-center py-12 text-gray-400">Product not found. <Link href="/products" className="text-gov-navy underline">Back</Link></div>;

  const passCount = scans.filter(s => s.is_compliant === true).length;
  const failCount = scans.filter(s => s.is_compliant === false).length;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/products" className="hover:text-gov-navy">Products</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{product.name}</span>
      </div>

      {/* Top card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-gray-900">{product.name}</h1>
              {product.registered_by_manufacturer && (
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-bold">Self-check</span>
              )}
            </div>
            {product.brand_name && <p className="text-sm text-gray-500 mt-0.5">Brand: {product.brand_name}</p>}
            <p className="text-xs text-gray-400 mt-2">First seen {formatDate(product.created_at)}</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <ComplianceBadge isCompliant={product.is_compliant} showScore score={product.last_compliance_score} />
            {product.last_compliance_score != null && (
              <div className="w-48"><ScoreBar score={product.last_compliance_score} /></div>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card text-center py-4">
          <p className="text-3xl font-extrabold text-gray-900">{scans.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Scans</p>
        </div>
        <div className="stat-card text-center py-4">
          <p className="text-3xl font-extrabold text-green-700">{passCount}</p>
          <p className="text-xs text-gray-500 mt-1">Compliant</p>
        </div>
        <div className="stat-card text-center py-4">
          <p className="text-3xl font-extrabold text-red-600">{failCount}</p>
          <p className="text-xs text-gray-500 mt-1">Non-Compliant</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Product details */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Product Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { label: "Category", value: product.category || "—" },
              { label: "SKU", value: product.sku || "—" },
              { label: "Barcode", value: product.barcode || "—" },
              { label: "Status", value: product.is_active ? "Active" : "Inactive" },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-gray-400 font-semibold uppercase">{label}</dt>
                <dd className="text-sm text-gray-800 font-medium mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
          {product.description && (
            <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">{product.description}</p>
          )}
        </div>

        {/* Manufacturer */}
        {product.manufacturer ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Manufacturer</h2>
            <dl className="space-y-3">
              {[
                { label: "Name", value: product.manufacturer.name },
                { label: "Registration No.", value: product.manufacturer.registration_number || "—" },
                { label: "Address", value: [product.manufacturer.address, product.manufacturer.city, product.manufacturer.state, product.manufacturer.pincode].filter(Boolean).join(", ") || "—" },
                { label: "Contact", value: product.manufacturer.contact_email || product.manufacturer.contact_phone || "—" },
                { label: "Type", value: product.manufacturer.is_importer ? `Importer (${product.manufacturer.country_of_origin || "??"})` : "Domestic Manufacturer" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-gray-400 font-semibold uppercase">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 flex items-center justify-center text-sm text-gray-400">
            No manufacturer linked
          </div>
        )}
      </div>

      {/* Scan history */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            Scan History
            <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
              {scans.length} scan{scans.length !== 1 ? "s" : ""}
            </span>
          </h2>
        </div>
        {scans.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No scans yet. Scans of this product will appear here automatically.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>{["Date", "Shop / Location", "Inspector", "Score", "Status", "Pipeline", ""].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.scan_id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(s.created_at, "dd MMM yyyy, hh:mm a")}
                  </td>
                  <td className="table-td text-sm text-gray-600">
                    {[s.shop_name, s.location].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="table-td text-xs text-gray-400">
                    {s.inspector_id ? `Officer #${s.inspector_id}` : "—"}
                  </td>
                  <td className="table-td w-36">
                    <ScoreBar score={s.compliance_score ?? 0} />
                  </td>
                  <td className="table-td">
                    <ComplianceBadge isCompliant={s.is_compliant} />
                  </td>
                  <td className="table-td">
                    {s.pipeline_status === "review_needed"
                      ? <span className="text-xs font-bold text-amber-600">⚠ Review</span>
                      : <span className="text-xs text-green-600 font-semibold">✓ Done</span>}
                  </td>
                  <td className="table-td">
                    <Link href={`/scans/${s.scan_id}`} className="text-xs text-gov-navy font-semibold hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
