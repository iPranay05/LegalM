// Mirrors web/lib/types.ts — same LegalM backend, same shapes. Kept in sync by
// hand since the mobile app and web app call the exact same REST API.

export interface User {
  id: number;
  name: string;
  email: string;
  role: "Inspector" | "Controller" | "Analyst" | "ManufacturerSelfCheck" | string;
  district?: string;
  state?: string;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export interface DashboardStats {
  total_scans: number;
  compliant_count: number;
  non_compliant_count: number;
  compliance_rate: number;
  avg_compliance_score: number;
  scans_today: number;
  scans_this_week: number;
  pending_reviews: number;
  top_missing_fields: { field: string; count: number }[];
  trend: { date: string; total: number; compliant: number }[];
  recent_scans: Scan[];
}

export interface TopViolation {
  rule_code: string;
  count: number;
}

// ── Scan ───────────────────────────────────────────────────────────────────
export interface Scan {
  id: number;
  scan_id: string;
  product_name?: string;
  brand_name?: string;
  category?: string;
  commodity_category_id?: number;
  shop_name?: string;
  location?: string;
  state?: string;
  district?: string;
  raw_ocr_text?: string;
  ocr_confidence?: number;
  image_path?: string;
  image_paths?: string[];
  bounding_boxes?: BoundingBox[];
  pipeline_status?: "pending" | "processing" | "complete" | "review_needed" | "failed" | string;
  review_status?: string;
  calibration_method?: string;
  symbols_detected?: SymbolResult;
  is_compliant?: boolean;
  compliance_headline?: ComplianceHeadline;
  compliance_score?: number;
  field_results?: Record<string, boolean>;
  missing_fields?: string[];
  extracted_fields?: Record<string, string>;
  compliance_checks?: ComplianceCheck[];
  compliance_summary?: ComplianceSummary;
  remarks?: string;
  created_at: string;
  inspector_id?: number;
  product_id?: number;
  barcode_data?: BarcodeData;
  groq_used?: boolean;
}

export interface BarcodeData {
  barcodes: { type: string; data: string }[];
  primary_barcode?: string;
  product_info?: Record<string, string>;
  decoded: boolean;
}

export type ComplianceCheckResultValue =
  | "Pass" | "Fail" | "NotApplicable" | "Relaxed" | "ManualReviewRequired";

export type ComplianceHeadline = "AllPass" | "HasFailures" | "NeedsManualReview";

export interface ComplianceCheck {
  id?: number;
  scan_id?: string;
  rule_id?: number;
  field_key: string;
  result: ComplianceCheckResultValue;
  confidence?: number;
  extracted_value?: string;
  relaxation_order_id?: number;
  notes?: string;
  evaluated_at?: string;
}

export interface ComplianceSummary {
  headline: ComplianceHeadline;
  counts: Record<ComplianceCheckResultValue, number>;
  total: number;
}

export interface BoundingBox {
  field: string;
  image_index?: number;
  text?: string;
  confidence: number;
  confirmed: boolean;
  bbox?: number[] | { x_min: number; y_min: number; x_max: number; y_max: number } | null;
  bbox_source?: string;
}

export interface SymbolResult {
  veg_dot: boolean;
  non_veg_dot: boolean;
  gm_mark: boolean;
  veg_confidence?: number;
  non_veg_confidence?: number;
  method?: string;
  skip_reason?: string;
  tamper_detection?: { status: string; signals?: string[]; confidence?: number };
}

export interface ManualFinding {
  id: number;
  scan_id: string;
  rule_id?: number;
  rule_code?: string;
  finding_type: string;
  description: string;
  severity: string;
  evidence_note?: string;
  recorded_at: string;
}

export interface ScanResultTabs {
  scan: Scan;
  all_rules: FieldTabEntry[];
  violations: FieldTabEntry[];
  not_applicable_relaxed: FieldTabEntry[];
  manual_findings: ManualFinding[];
}

export interface FieldTabEntry {
  key: string;
  label: string;
  required: boolean;
  weight: number;
  present: boolean;
  extracted_value?: string;
  legal_reference?: string;
  result?: ComplianceCheckResultValue;
  notes?: string;
}

export interface ScanStatus {
  scan_id: string;
  pipeline_status: string;
  review_status: string;
}

// ── Products & Manufacturers ─────────────────────────────────────────────
export interface Manufacturer {
  id: number;
  name: string;
  registration_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_email?: string;
  contact_phone?: string;
  is_importer: boolean;
  country_of_origin?: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  brand_name?: string;
  category?: string;
  commodity_category_id?: number;
  sku?: string;
  barcode?: string;
  description?: string;
  manufacturer_id?: number;
  manufacturer?: Manufacturer;
  is_compliant?: boolean;
  last_compliance_score?: number;
  last_scan_id?: string;
  registered_by_manufacturer: boolean;
  is_active: boolean;
  created_at: string;
}

// ── Reports ────────────────────────────────────────────────────────────────
export interface Report {
  id: number;
  report_id: string;
  scan_id: string;
  format: string;
  file_hash_sha256: string;
  generated_at: string;
  superseded_by_report_id?: string;
}

// ── Shared constants ─────────────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  { label: "General", value: "general" },
  { label: "Food & Beverage", value: "food" },
  { label: "Cosmetics", value: "cosmetic" },
  { label: "Textile", value: "textile" },
  { label: "Pharmaceutical", value: "pharma" },
  { label: "Electronics", value: "electronics" },
];

export const FIELD_LABELS: Record<string, string> = {
  manufacturer_info: "Manufacturer / Packer Info",
  product_name: "Product Name",
  net_quantity: "Net Quantity",
  mfg_date: "Mfg. / Packing Date",
  expiry_date: "Best Before / Expiry",
  mrp: "MRP",
  consumer_care: "Consumer Care Contact",
  country_of_origin: "Country of Origin",
  fssai_number: "FSSAI Licence No.",
  food_type_marking: "Food Type Marking (Veg/Non-Veg)",
  gm_declaration: "GM Declaration",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ba1a1a",
  high: "#e67e22",
  medium: "#f59e0b",
  low: "#10b981",
};
