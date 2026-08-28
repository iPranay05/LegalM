export interface ComplianceResult {
  scan_id: string;
  is_compliant: boolean;
  compliance_score: number;
  field_results: Record<string, boolean>;
  missing_fields: string[];
  extracted_fields: Record<string, string>;
  compliance_checks?: ComplianceCheck[];
  compliance_summary?: ComplianceSummary;
  remarks: string;
  total_fields_checked: number;
  mandatory_fields_present: number;
  total_mandatory_fields: number;
  ocr_confidence: number;
  raw_ocr_text: string;
  // Extended pipeline fields
  pipeline_status?: string;
  bounding_boxes?: BoundingBox[];
  symbols_detected?: SymbolResult;
  calibration_method?: string;
  // Barcode + Groq
  groq_used?: boolean;
  barcode_data?: BarcodeData;
}

export interface BarcodeData {
  barcodes: { type: string; data: string }[];
  primary_barcode?: string;
  product_info?: Record<string, string>;
  decoded: boolean;
}

export interface BoundingBox {
  field: string;
  text?: string;
  confidence: number;
  confirmed: boolean;
  bbox?: number[] | null;
}

export interface SymbolResult {
  veg_dot: boolean;
  non_veg_dot: boolean;
  gm_mark: boolean;
  veg_confidence?: number;
  non_veg_confidence?: number;
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
}

export interface Scan {
  id: number;
  scan_id: string;
  product_name?: string;
  category?: string;
  shop_name?: string;
  location?: string;
  state?: string;
  district?: string;
  is_compliant?: boolean;
  compliance_score?: number;
  missing_fields?: string[];
  extracted_fields?: Record<string, string>;
  compliance_checks?: ComplianceCheck[];
  compliance_summary?: ComplianceSummary;
  remarks?: string;
  pipeline_status?: string;
  review_status?: string;
  created_at: string;
}

export type ComplianceCheckResultValue =
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

export const PRODUCT_CATEGORIES = [
  { label: "General", value: "general" },
  { label: "Food & Beverage", value: "food" },
  { label: "Cosmetics", value: "cosmetic" },
  { label: "Textile", value: "textile" },
  { label: "Pharmaceutical", value: "pharma" },
  { label: "Electronics", value: "electronics" },
];

export const FIELD_LABELS: Record<string, string> = {
  manufacturer_info: "Manufacturer Info",
  product_name: "Product Name",
  net_quantity: "Net Quantity",
  mfg_date: "Mfg. Date",
  expiry_date: "Best Before / Expiry",
  mrp: "MRP",
  consumer_care: "Consumer Care",
  country_of_origin: "Country of Origin",
  fssai_number: "FSSAI Number",
  food_type_marking: "Food Type Marking",
  gm_declaration: "GM Declaration",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#c0392b",
  high: "#e67e22",
  medium: "#f39c12",
  low: "#27ae60",
};
