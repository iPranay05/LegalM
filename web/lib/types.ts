// ── Auth ──────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  district?: string;
  state?: string;
  is_active: boolean;
  created_at: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

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

// ── Scan ──────────────────────────────────────────────────────────────────────

export interface Scan {
  id: number;
  scan_id: string;
  product_name?: string;
  brand_name?: string;
  category?: string;
  commodity_category_id?: number;
  commodity_category?: CommodityCategory;
  shop_name?: string;
  location?: string;
  state?: string;
  district?: string;
  raw_ocr_text?: string;
  ocr_confidence?: number;
  image_path?: string;
  image_paths?: string[];
  bounding_boxes?: BoundingBox[];
  pipeline_status?: string;
  calibration_method?: string;
  symbols_detected?: SymbolResult;
  is_compliant?: boolean;
  compliance_headline?: "AllPass" | "HasFailures" | "NeedsManualReview";
  compliance_score?: number;
  field_results?: Record<string, boolean>;
  missing_fields?: string[];
  extracted_fields?: Record<string, string>;
  compliance_checks?: ComplianceCheck[];
  compliance_summary?: ComplianceSummary;
  remarks?: string;
  review_status?: string;
  created_at: string;
  inspector_id?: number;
  product_id?: number;
  barcode_data?: {
    barcodes: { type: string; data: string }[];
    primary_barcode?: string;
    product_info?: Record<string, string>;
    decoded: boolean;
  };
  groq_used?: boolean;
}

export type ComplianceCheckResult =
  | "Pass"
  | "Fail"
  | "NotApplicable"
  | "Relaxed"
  | "ManualReviewRequired";

export type ComplianceHeadline =
  | "AllPass"
  | "HasFailures"
  | "NeedsManualReview";

export interface ComplianceCheck {
  id?: number;
  scan_id?: string;
  rule_id?: number;
  field_key: string;
  result: ComplianceCheckResult;
  confidence?: number;
  extracted_value?: string;
  relaxation_order_id?: number;
  notes?: string;
  evaluated_at?: string;
}

export interface ComplianceSummary {
  headline: ComplianceHeadline;
  counts: Record<ComplianceCheckResult, number>;
  total: number;
}

export interface BoundingBox {
  field: string;
  image_index?: number;
  text?: string;
  confidence: number;
  confirmed: boolean;
  bbox?: [number, number, number, number] | null;
}

export interface SymbolResult {
  veg_dot: boolean;
  non_veg_dot: boolean;
  gm_mark: boolean;
  veg_confidence?: number;
  non_veg_confidence?: number;
  method?: string;
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
  result?: ComplianceCheckResult;
  notes?: string;
}

// ── Products & Manufacturers ──────────────────────────────────────────────────

export interface CommodityCategory {
  id: number;
  name: string;
  is_food: boolean;
  is_medical_device: boolean;
  requires_standard_size: boolean;
  font_rule_exempted: boolean;
  created_at?: string;
}

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
  commodity_category?: CommodityCategory;
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

// ── Rules & Relaxations ───────────────────────────────────────────────────────

export type RuleCheckType =
  | "Presence"
  | "Format"
  | "Placement"
  | "FontSize"
  | "Symbol"
  | "StandardSize"
  | "Exemption";

export interface Rule {
  id: number;
  rule_family: string;
  code: string;
  title: string;
  description?: string;
  legal_reference?: string;
  effective_from: string;
  effective_to?: string;
  has_transitional_clause?: boolean;
  commodity_category_id?: number;
  check_type: RuleCheckType;
  category_scope?: string[];
  is_mandatory: boolean;
  is_conduct_bucket: boolean;
  weight: number;
  is_active: boolean;
  retired_at?: string;
  created_at: string;
  relaxation_count?: number;
}

export interface RelaxationOrder {
  id: number;
  order_number: string;
  rule_id: number;
  manufacturer_id: number;
  product_id?: number;
  title: string;
  description?: string;
  gazette_reference?: string;
  applies_to_categories?: string[];
  applies_to_states?: string[];
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface Report {
  id: number;
  report_id: string;
  scan_id: string;
  format: string;
  file_hash_sha256: string;
  generated_at: string;
  superseded_by_report_id?: string;
}

// ── E-Commerce ────────────────────────────────────────────────────────────────

export interface EcommerceCheck {
  id: number;
  check_id: string;
  platform_name?: string;
  url: string;
  has_country_of_origin_filter?: boolean;
  officer_notes?: string;
  evidence_image_path?: string;
  is_compliant?: boolean;
  checked_at: string;
}

// ── Shared field labels ───────────────────────────────────────────────────────

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

export const REQUIRED_FIELDS = new Set([
  "manufacturer_info",
  "product_name",
  "net_quantity",
  "mfg_date",
  "mrp",
  "consumer_care",
]);

export const CATEGORIES = [
  "general", "food", "cosmetic", "textile", "pharma", "electronics",
];

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-green-100 text-green-800 border-green-300",
};
