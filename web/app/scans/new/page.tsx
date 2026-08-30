"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { CATEGORIES } from "@/lib/types";

const MAX_IMAGES = 6;

interface StagedImage {
  file: File;
  previewUrl: string;
}

// This page starts a real inspection: it uploads the photo(s) to the existing
// LegalM `/scan/upload-multi` API (same endpoint the mobile app uses) and lets
// the existing Celery pipeline / OCR / compliance engine do the actual work.
// No scan logic, OCR, or compliance rules are implemented here — this is purely
// the missing upload UI for the "New Inspection" action.
export default function NewInspectionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<StagedImage[]>([]);
  const [category, setCategory] = useState("general");
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("auth_token")) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    // Revoke object URLs on unmount to avoid leaking memory.
    return () => images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) {
      setError("Please select an image file (JPEG, PNG or WebP).");
      return;
    }
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      const next = incoming.slice(0, Math.max(room, 0)).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...next].slice(0, MAX_IMAGES);
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function startScan() {
    if (images.length === 0) {
      setError("Add at least one product photo before starting the scan.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      images.forEach((img) => form.append("files", img.file, img.file.name));
      form.append("category", category);
      if (shopName) form.append("shop_name", shopName);
      if (location) form.append("location", location);
      if (state) form.append("state", state);
      if (district) form.append("district", district);

      // Real upload to the existing LegalM scan API — this enqueues the actual
      // OCR / calibration / compliance pipeline via Celery on the backend.
      const res = await api.post("/scan/upload-multi", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const scanId = res.data?.scan_id;
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      if (scanId) {
        router.push(`/scans/${scanId}`);
      } else {
        router.push("/scans");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to start scan. Please try again.");
      setUploading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-gutter">
      <div className="flex items-center gap-2 font-body-md text-body-md text-on-surface-variant">
        <Link href="/dashboard" className="hover:text-secondary">Dashboard</Link>
        <span>/</span>
        <span className="text-on-surface font-semibold">New Inspection</span>
      </div>

      <div className="lm-card p-6 space-y-6">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">New Inspection</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Capture or upload the product label. The existing LegalM OCR and compliance pipeline will
            extract declarations and evaluate Legal Metrology (Packaged Commodities) Rules automatically.
          </p>
        </div>

        {/* Photo capture / upload */}
        <div>
          <label className="lm-label mb-2 block">Product Photo{images.length > 1 ? "s" : ""}</label>

          {images.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="border-2 border-dashed border-outline-variant rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-secondary text-[40px]">add_a_photo</span>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Drag &amp; drop a label photo here, or choose an option below
              </p>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="lm-btn-primary">
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                  Take Photo
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="lm-btn-secondary">
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  Upload Photo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <div key={img.previewUrl} className="relative aspect-square rounded-lg overflow-hidden border border-outline-variant bg-surface-container-low group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={`Label ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-status-fail transition-colors"
                      title="Remove"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1.5 left-1.5 bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Primary</span>
                    )}
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-1 text-on-surface-variant hover:border-secondary hover:text-secondary transition-colors"
                  >
                    <span className="material-symbols-outlined">add</span>
                    <span className="font-label-caps text-label-caps">Add</span>
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="lm-btn-secondary flex-1">
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                  Take Another
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="lm-btn-secondary flex-1">
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  Upload More
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
          <p className="text-xs text-on-surface-variant mt-2">
            Up to {MAX_IMAGES} images (front, back, side panels). JPEG, PNG or WebP, max 10MB each.
          </p>
        </div>

        {/* Scan context */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Shop / Establishment Name</label>
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="form-input" placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="form-input" placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">State</label>
            <input value={state} onChange={(e) => setState(e.target.value)} className="form-input" placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">District</label>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} className="form-input" placeholder="Optional" />
          </div>
        </div>

        {error && <div className="bg-error-container text-on-error-container text-sm rounded-lg px-4 py-2.5">{error}</div>}

        <div className="flex gap-3 pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={startScan}
            disabled={uploading || images.length === 0}
            className="lm-btn-primary disabled:opacity-50"
          >
            {uploading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Starting Scan…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                Confirm &amp; Start Scan
              </>
            )}
          </button>
          <Link href="/dashboard" className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface py-2.5 px-2">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
