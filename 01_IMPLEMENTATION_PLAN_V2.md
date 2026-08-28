# Implementation Plan v2 — Gap Remediation for the Existing LegalM Repository

**Audience:** a coding agent (Claude Code or similar) working directly inside the `iPranay05/LegalM` repository. This document supersedes `01_IMPLEMENTATION_PLAN.md` for that repository. It does not describe a from-scratch build — it describes the concrete changes needed to take the *existing* FastAPI/Next.js/Expo codebase from what it is today to a system that actually satisfies the non-negotiable requirements of the source specification (SIH 26034).

**How this document was produced:** by reading the full existing repository (`backend/`, `web/`, `mobile/`) end to end — every model, every service, every router, both frontends' type definitions and key components — and comparing it line by line against the original specification and the v1 implementation plan. Every gap named below was confirmed by reading the actual code, not inferred from file names or documentation claims.

**Companion document:** `02_PHASE_WISE_REMEDIATION_PROMPTS.md` — the same content as this plan, sequenced into copy-paste-ready agent prompts.

---

## 0. Decision: Keep the Existing Architecture, Fix the Logic

The repository has already committed to FastAPI + SQLAlchemy + Next.js + Expo, with SQLite for the prototype. This plan does **not** propose migrating to Flask/Jinja2 (the v1 plan's stack) — that would be a wasted rewrite of already-working, reasonable code (auth, dashboard role-scoping, e-commerce checker, report immutability, calibration service, symbol detection are all either fully correct or salvageable with targeted fixes). Instead, this plan works **within** the existing architecture and fixes what's actually broken relative to the non-negotiable design principles.

Two infrastructure decisions from the original stack **are** being reinstated because the source specification treats them as non-negotiable, not aspirational:

1. **PostgreSQL replaces SQLite** before this system could be called production-credible — SQLite's lack of genuine concurrent-write support and weaker constraint enforcement make it unsuitable for a system whose core value proposition is evidentiary reliability. Keep SQLite only for fast local dev/tests behind the same SQLAlchemy interface; target Postgres for anything resembling a real deployment or demo.
2. **The async pipeline (Celery + Redis) becomes mandatory, not optional.** The existing "falls back to synchronous" code path is exactly the "most common architectural mistake for this kind of system" the source Architecture document warns about by name. This plan removes the fallback rather than keeping it as a safety net — a request that blocks on OCR/vision-LLM latency is not acceptable, even as a documented fallback.

Everything else — FastAPI, SQLAlchemy, Next.js, Expo, Tesseract-with-Groq-vision-primary, Alembic (finally used for real), WeasyPrint/python-docx — stays.

---

## 1. What Already Works — Do Not Rebuild These

Confirmed correct by direct code reading. Phases below reference and extend these rather than replacing them:

| Component | File(s) | Verdict |
|---|---|---|
| Password hashing, JWT issuing/verification | `auth_service.py` | Correct, bcrypt + JWT, keep as-is |
| Report immutability chain | `report_service.py`, `reports.py`, `Report` model | `superseded_by_report_id` linking, SHA-256 hashing, never-overwrite — matches the spec's evidentiary requirement closely. Extend, don't replace. |
| Scale calibration | `calibration_service.py` | Genuine three-state logic (A4-reference marker detection via OpenCV, inspector-entered dimensions, honest "unverified" fallback that never fabricates a measurement). Fully aligned with FR-6's calibration requirement. **Currently unused by anything** — the gap is integration, not the service itself. |
| Symbol detection | `symbol_service.py` | Genuine OpenCV HSV+contour veg/non-veg dot detector, correctly independent of OCR. GM-mark detection is text-regex-based rather than visual (a reasonable, documentable simplification). Keep. |
| E-commerce listing checker (FR-18) | `ecommerce.py` router, `EcommerceCheck` model | Implemented almost exactly per spec: manual officer judgment, optional evidence screenshot, structurally separate from the scan pipeline. No changes needed beyond an RBAC pass (§4). |
| Dashboard role-scoping | `dashboard.py`, `_base_scan_query` | Inspector-sees-own-scans / Controller-sees-all correctly implemented — one of the few places RBAC is done right today. Extend to cover the remaining grouping dimensions. |
| Rule/RelaxationOrder admin CRUD (write side) | `admin.py` | Soft-retire (never delete), warns about affected relaxation orders before retiring, correct `require_admin` guard on writes. The gap is that nothing downstream *consumes* this data (§3) — the CRUD itself is fine. |
| Vision-LLM OCR path (Groq) | `groq_service.py`, `ocr_service.py` | A genuine asset not in the original plan — real accuracy gains over Tesseract alone on real-world labels. Keep as the primary extraction path; the gap is that its output isn't threaded into a genuine confidence-gated pipeline (§2). |
| Barcode/QR + Open Food Facts enrichment | `barcode_service.py` | Reasonable, working scope addition. Keep; just make its role explicit (authoritative field source, never silently overriding an officer's manual correction — see §6). |

---

## 2. Non-Negotiable Gap #1 — The Compliance Model Is Binary, Must Become Five-Outcome

### 2.1 The problem, precisely

`compliance_engine.py` computes:
```python
compliance_score = round((present_mandatory_weight / TOTAL_MANDATORY_WEIGHT) * 100, 1)
is_compliant = compliance_score >= 80.0
```

Every declaration is `True`/`False` (regex matched or didn't), rolled into a single percentage, thresholded at 80%. This directly violates the specification's core design commitment: *the system must never present an automated inference with more certainty than the underlying evidence supports.* An 80%-scored product with a missing MRP declaration is reported as flatly "Compliant" — a specific, named violation is arithmetically absorbed into a passing score. There is no route to "we couldn't tell" anywhere in this model; every field is forced into present/absent, and the aggregate is forced into compliant/non-compliant.

This is not a cosmetic issue — it is the single biggest reason this system, as it stands, could not be trusted as a decision-support tool for actual enforcement action, and it is the first thing to fix.

### 2.2 What replaces it

Introduce a genuine per-declaration, per-rule result model with these outcomes, mirroring the source spec's `ComplianceCheck.result` enum exactly: `Pass`, `Fail`, `NotApplicable`, `Relaxed`, `ManualReviewRequired`. No weighted score, no single threshold, no blended verdict. Concretely:

1. **New table: `compliance_checks`** (SQLAlchemy model in `backend/app/models/rules.py`, alongside `Rule`/`RelaxationOrder`):
   - `id`, `scan_id` (FK → `scans.scan_id`), `rule_id` (FK → `rules.id`, nullable — see §3.3 on why nullable), `field_key` (string, matches `COMPLIANCE_FIELDS` key for label-content checks), `result` (Enum: `Pass`, `Fail`, `NotApplicable`, `Relaxed`, `ManualReviewRequired`), `confidence` (float, nullable), `extracted_value` (string, nullable), `relaxation_order_id` (FK → `relaxation_orders.id`, nullable, set only when `result = Relaxed`), `notes` (text, nullable), `evaluated_at` (datetime).
   - One row per rule evaluated per scan. Write-once — never update an existing row; a re-evaluation inserts new rows.

2. **Rewrite `compliance_engine.py`'s core function** from `check_compliance(text, category) -> flat dict` to `evaluate_declarations(scan_context) -> List[ComplianceCheckResult]`, where `scan_context` bundles the OCR/vision-LLM extraction output *with its per-field confidence*, the calibration result, the symbol-detection result, and the product's category/package-type metadata. For each declaration field:
   - If the extraction confidence for that field is at or above a configured threshold (`FIELD_CONFIDENCE_THRESHOLD`, e.g. 0.6) and the field is present → `Pass`.
   - If the field is confidently absent (i.e., the extractor actively looked and found nothing, with high overall confidence in the extraction as a whole) → `Fail`.
   - If confidence is below threshold, or the extractor's overall run was flagged low-confidence → **`ManualReviewRequired`**, never a guessed `Pass` or `Fail`. This is the single most important behavioral change in this plan.
   - If the field does not apply to this product's category/package type (see §3) → `NotApplicable`.
   - If a `Fail` result has a matching active `RelaxationOrder` → overwrite to `Relaxed`, linking the order (see §3.4).

3. **Remove `is_compliant`/`compliance_score` as the primary reported outcome.** They may still exist as a *derived, clearly-labeled summary statistic* ("7 of 9 checks passed, 1 requires manual review, 1 relaxed") for dashboard/list-view convenience, but the scan detail page, the report, and any endpoint returning a single verdict must show the full breakdown by result type, never collapse it into one boolean. If a single "headline" status is needed for a badge, it must be `AllPass` / `HasFailures` / `NeedsManualReview` — three states, and `NeedsManualReview` takes priority over `HasFailures` in display prominence exactly as the source spec's status-color philosophy requires (a scan is never shown as a confident failure if part of it is still unresolved).

4. **Extraction confidence must be real, not hardcoded.** Currently `ocr_service.py` returns a flat `confidence: 95.0` whenever Groq vision succeeds — this is a fabricated certainty, the exact failure mode the spec warns against. Change the Groq extraction prompt (in `groq_service.py`) to return a per-field confidence alongside each extracted value (the model can self-report low confidence for blurry/ambiguous fields — prompt it explicitly to do so and to return `null` rather than guess when it cannot read a field). Where a genuine per-field confidence isn't obtainable from the model, fall back to a documented heuristic (e.g. Tesseract's own per-word confidence when Tesseract is the fallback path) rather than a single constant.

### 2.3 Test to prove this gap is closed

`tests/unit/test_compliance_engine.py::test_low_confidence_never_becomes_pass_or_fail` — construct a scan context where a required field's extraction confidence is deliberately below threshold, assert the resulting `ComplianceCheckResult.result == 'ManualReviewRequired'`, and assert this holds even when the field's extracted text, if taken at face value, would otherwise look valid. This is the test that operationalizes the spec's core design commitment — write it first, before the rewrite, so it fails against the current code and passes once the rewrite is done.

---

## 3. Non-Negotiable Gap #2 — No Category-Aware, Versioned Rule Engine

### 3.1 The problem, precisely

`Rule` has `is_active`/`retired_at` but no `effective_from`/`effective_to` date range, no `rule_family` for tracking a rule area's history across amendments, and — critically — **`compliance_engine.py` never queries the `Rule` table at all.** `COMPLIANCE_FIELDS` is a static Python list, hardcoded, identical for every product regardless of category. There is no `CommodityCategory` table, so nothing distinguishes a medical device (which should skip font/placement rules per Medical Devices Rules 2017) from a snack (which shouldn't), and nothing implements the edible-oil standard-size rule's date-and-category-scoped history that the source spec treats as the canonical proof that the versioned-rule design works.

The admin panel's `Rule`/`RelaxationOrder` CRUD is well-built but currently governs nothing — it's a management UI for a table the scoring logic ignores.

### 3.2 What replaces it

1. **New table: `commodity_categories`** (`backend/app/models/product.py` or a new `commodity_category.py`):
   - `id`, `name` (unique string: "General", "Food", "Edible Oil", "Medical Device" — the same four in-scope categories as the v1 plan, for the same stress-testing reasons: baseline path, FSSAI branch, standard-size versioning, category-exclusion logic), `is_food` (bool), `is_medical_device` (bool), `requires_standard_size` (bool), `font_rule_exempted` (bool).
   - Migrate `Product.category` and `Scan.category` from free-form strings to a FK (`commodity_category_id`) referencing this table. Keep the old string column temporarily during migration (see Phase sequencing) but stop writing to it once the FK is live, and remove it once nothing reads it.

2. **Extend `Rule`** with the columns the source spec's `RuleDefinition` requires and this repo's `Rule` currently lacks:
   - `rule_family` (string, not null) — a stable slug grouping all historical versions of "the same" rule area (e.g. `standard_size_edible_oil`), independent of the human-readable `title`/`legal_reference`, which may change wording across amendments. This is what makes effective-date resolution across amendments actually queryable.
   - `effective_from` (date, not null)
   - `effective_to` (date, nullable — null means currently in force)
   - `has_transitional_clause` (bool, default false)
   - `commodity_category_id` (FK → `commodity_categories.id`, nullable — null means universal)
   - `check_type` (Enum: `Presence`, `Format`, `Placement`, `FontSize`, `Symbol`, `StandardSize`, `Exemption` — matches the source spec's dispatch taxonomy)
   - Keep `is_conduct_bucket` (already present, already correctly separates conduct rules from automated ones) and `is_active`/`retired_at` (retirement remains a soft `effective_to`-setting operation as it already correctly is — this plan is *adding* `effective_from`/`effective_to` as the actual date-scoping mechanism, and `retired_at` becomes the audit timestamp for *when* an admin set `effective_to`, not a separate active/inactive flag doing the same job twice).

3. **Rewrite `RelaxationOrder`'s scope model.** Today it's `applies_to_categories`/`applies_to_states` (JSON lists) with no manufacturer or product linkage — meaning a relaxation order cannot actually excuse *a specific manufacturer's specific product* from *a specific rule*, which is what Rule 33 relaxation orders are in reality. Add `manufacturer_id` (FK, not null) and `product_id` (FK, nullable — null means it covers all of that manufacturer's products), keeping `rule_id`, `valid_from`, `valid_until` (rename to match the "always bounded, both required" semantics — `valid_until` should become genuinely required, not nullable, since an open-ended relaxation is not what Rule 33 actually grants).

4. **Build the actual rule-selection query** the compliance engine calls before evaluating anything (this is the piece that currently doesn't exist at all): given a scan's category and evaluation date, query `Rule` rows where `commodity_category_id` matches or is null, `effective_from <= evaluation_date`, and (`effective_to` is null or `effective_to >= evaluation_date`). This becomes the actual source of "which fields/checks apply to this product," replacing the static `COMPLIANCE_FIELDS` list as the sole source of truth. `COMPLIANCE_FIELDS`'s regex patterns become the **extraction/detection logic** each `Presence`/`Format` rule dispatches to — not the rule list itself.

5. **Seed the standard-size worked example exactly as the source spec's canonical proof case**, because it is the single test that demonstrates the versioned design actually works:

   | rule_family | commodity_category | effective_from | effective_to |
   |---|---|---|---|
   | `standard_size_general` | universal (null) | 2011-04-01 | 2022-09-30 |
   | `standard_size_edible_oil` | Edible Oil | 2026-06-01 | null |

   Write the four-scenario test from the v1 plan's §4.3 against this repo's actual query function: a milk-powder-category scan in 2015 gets the general rule; the same category in 2023 gets `NotApplicable` (not `Pass`); an edible-oil scan in 2023 also gets `NotApplicable` (the rule hasn't started yet even for its eventual category); an edible-oil scan in 2026-07 gets the Fourth Schedule rule. This test is non-negotiable — it is the concrete proof that "rule content is data, not code" actually holds in this codebase, not just in the schema design.

6. **Wire relaxation orders into evaluation.** After a `Fail` result is produced for a given `rule_id` + scan's manufacturer/product, query `RelaxationOrder` for a matching, currently-valid order; if found, overwrite the result to `Relaxed` and set `relaxation_order_id`. This is the concrete fix that finally connects the admin panel's existing, well-built CRUD to something that uses it.

### 3.3 Why `compliance_checks.rule_id` is nullable (§2.2)

Not every declaration check in the seed data needs to originate from a full `RuleDefinition`-style row on day one of this remediation — some of the existing `COMPLIANCE_FIELDS` presence/format checks can be migrated into proper `Rule` rows incrementally (Phase 3 does the core universal set; category-specific rules follow in Phase 4). Keep `rule_id` nullable during the transition so `ComplianceCheck` rows can exist against a `field_key` alone before every field has a corresponding `Rule` row, but treat this as a temporary bridging state — the exit criterion for this gap being closed is that every check has a real `rule_id`.

### 3.4 FontSize — the check that's currently completely missing

The calibration service (§1, already correct) is unused. Add the actual `FontSize` check_type dispatch: given a calibration result and an OCR/vision-extracted bounding box for a declaration's text, compute the physical height in mm (`bbox_height_px * mm_per_px_y`) and compare against the Rule 7 table. If `calibration.method == "unverified"`, the result is **always `ManualReviewRequired`**, never a guessed `Pass`/`Fail` — this is explicitly the behavior the calibration service was already built to support; it just needs a caller. For medical-device-category products, skip this check_type entirely (via the category-exclusion logic in §3.2 point 4) and materialize the row as `NotApplicable` with `notes = "Excluded — governed by Medical Devices Rules, 2017"` rather than silently omitting it.

---

## 4. Non-Negotiable Gap #3 — RBAC Holes

### 4.1 Confirmed holes, each verified by reading the route code directly

| Route | File:line (approx) | Problem |
|---|---|---|
| `POST /scan/upload`, `POST /scan/upload-multi` | `scan.py` | `current_user: Optional[User] = Depends(get_current_user_optional)` — **scan submission requires no authentication at all** |
| `GET /scan/`, `GET /scan/{scan_id}` | `scan.py` | No `current_user` dependency whatsoever — fully public read access to every scan in the system, no role scoping |
| `POST /products/`, `PUT /products/{id}` | `products.py` | No role check — any authenticated user, any role, can create or edit any product |
| `POST /auth/register` | `auth.py` | Open registration with **no role restriction on the `role` field** — a caller can self-register as `role: "admin"` |
| Role string inconsistency | `User` model comment says `inspector \| admin`; `admin.py`'s `valid_roles` tuple includes `controller, supervisor, manufacturer`; `products.py` checks for `role == "manufacturer"` | Undefined roles referenced in authorization checks will silently never match unless a role is set to a string the `User` model's own documentation doesn't acknowledge exists |

### 4.2 What replaces it

1. **Fix `/auth/register` first, before anything else in this phase** — it is the most severe hole (privilege escalation via self-registration). Either (a) remove public registration entirely and require an existing admin/controller to create accounts via `/admin/users` (the more defensible choice for a government enforcement tool, and consistent with the source spec's role model where roles are institutionally assigned, not self-selected), or (b) keep public registration but hardcode `role="inspector"` server-side regardless of what the request body sends, ignoring any `role` field from an unauthenticated caller. Prefer (a).

2. **Formalize the role enum.** Update `User.role` to a genuine SQLAlchemy `Enum` with exactly the four roles the source spec defines: `Inspector`, `Controller`, `Analyst`, `ManufacturerSelfCheck` (rename `admin`→`Controller` and `manufacturer`→`ManufacturerSelfCheck` in a migration, updating every string comparison across `admin.py`, `products.py`, `dashboard.py`, `ecommerce.py`, `reports.py` accordingly). Remove the undefined `controller`/`supervisor`/`manufacturer` lowercase-string references that don't match the model's own stated values — either they map onto the four real roles or they get deleted.

3. **Build a `require_role(*roles)` FastAPI dependency** in `app/routers/deps.py`, alongside the existing `get_current_user`, and use it — not ad hoc `if current_user.role not in (...)` checks scattered per-route — everywhere a role restriction is needed. Centralizing this is what the source spec's Auth & RBAC Service principle (single source of truth for role-scoping, every other component defers to it) actually requires; the current per-route inline checks are exactly the anti-pattern that principle warns against, because each one can drift independently.

4. **Require authentication on scan submission and scan read routes.** `POST /scan/upload*` becomes `current_user: User = Depends(get_current_user)` (mandatory), scoped to `Inspector` and `ManufacturerSelfCheck` roles. `GET /scan/` and `GET /scan/{scan_id}` require authentication and apply the same role-scoping pattern already correctly implemented in `dashboard.py`'s `_base_scan_query` (Inspector sees own scans; Controller/Analyst see all; ManufacturerSelfCheck sees only scans tied to their own manufacturer's products, mirroring the correct pattern already present in `products.py`'s manufacturer self-check filter).

5. **Add role checks to `create_product`/`update_product`** (`Inspector`, `Controller`, `ManufacturerSelfCheck` for create; `Inspector`/`Controller` for edit — a self-check user should not be able to edit a product record after creation to prevent quietly rewriting their own compliance history).

### 4.3 Test to prove this gap is closed

`tests/integration/test_rbac.py` — a genuine route × role matrix (this repo currently has **zero tests of any kind**, so this file is new, not an extension). At minimum: assert unauthenticated `POST /scan/upload` is rejected (401), assert an `Inspector` cannot hit any `/admin/*` write route (403), assert a `ManufacturerSelfCheck` user cannot list or view another manufacturer's products or scans, assert `/auth/register` cannot set `role` to anything but the safe default (or is removed and returns 404/405 if option (a) above is taken).

---

## 5. Non-Negotiable Gap #4 — The Async Pipeline Isn't Actually Async

### 5.1 The problem, precisely

`pipeline_service.py` checks whether Celery is importable and configured; if not (and the README/setup instructions never tell anyone to run Redis or a Celery worker, so in the default setup this is always the path taken), it runs the entire OCR → calibration → symbol detection → classification chain **synchronously inside the FastAPI request handler**. `scan.py`'s `upload_and_scan` route `await`s this directly. A request that includes a Groq vision-LLM call plus OpenCV processing on a multi-megapixel image is not a sub-second operation — this is precisely the blocking-request-cycle anti-pattern the source Architecture document calls out as "the most common architectural mistake for this kind of system," and it will produce real timeouts or a visibly frozen mobile app under any real usage, not just at scale.

### 5.2 What replaces it

1. **Make Celery + Redis mandatory infrastructure**, not an optional enhancement. Add `docker-compose.yml` at the repo root (currently absent entirely) with `postgres`, `redis`, `backend` (uvicorn), `worker` (celery worker process) services, so local development has one command to bring up the full stack rather than a silent fallback to inline execution.
2. **Remove the `CELERY_AVAILABLE` fallback branch from `pipeline_service.py` entirely.** There is no synchronous code path left. If Celery/Redis are unreachable, scan submission should fail loudly with a clear `503`-style error ("perception pipeline unavailable") rather than silently degrading to a blocking request — a loud, honest failure is strictly better than a silent architectural violation.
3. **Change `scan.py`'s upload routes** to: validate and save the uploaded image(s) synchronously (this part is legitimately fast and fine to keep in the request), create the `Scan` row with a `pipeline_status = "pending"`, enqueue the existing `run_pipeline_task` Celery task, and return immediately with the scan's ID and pending status. The client (web and mobile both) then polls a lightweight status endpoint — `GET /scan/{scan_id}/status` (new, minimal — returns just `pipeline_status` and, once available, a redirect-worthy summary) — rather than `GET /scan/{scan_id}` doing a full-record fetch every poll.
4. **Update both frontends** (`web/app/scans/[scanId]/page.tsx` and `mobile/app/result.tsx`) to poll the new lightweight status endpoint on an interval (5 seconds, matching the source spec's UI convention) rather than assuming the upload response already contains the final result — today both frontends appear to expect the synchronous response to already be the final `ScanOut`, which is precisely the assumption this remediation breaks and must be updated everywhere it's made.
5. **State transitions to implement explicitly** (mirroring the source spec's state machine, adapted to this repo's existing `pipeline_status`/`review_status` fields rather than introducing a parallel one): `pending → processing → review_needed | complete`, then (once the rule-engine rewrite from §2/§3 is live) `review_needed → complete` once an officer confirms all flagged declarations, and a separate `Scan.report_generated` boolean or the existing `Report` table's presence as the final "done" signal.

### 5.3 Test to prove this gap is closed

`tests/integration/test_pipeline_async.py::test_upload_returns_before_pipeline_completes` — submit a scan with the Celery task's execution mocked/delayed, assert the HTTP response returns with `pipeline_status="pending"` well before the mocked task would complete, proving the request path never blocks on perception work.

---

## 6. Non-Negotiable Gap #5 — Evidence & Traceability Chain Is Broken

### 6.1 The problem, precisely

The source spec's core value proposition is a traceable chain: *Product → Image → Detected Declaration → Validation → Rule Reference → Evidence → Officer Verification → Report.* Reading the actual code, this chain breaks at two points:

1. **Bounding boxes are synthetic placeholders.** `pipeline_service.py::_build_bounding_boxes` builds `{"bbox": None, ...}` entries whenever real Tesseract word-level coordinates aren't available — which, given Groq vision is the primary path and returns text fields with no coordinates at all, is the common case, not the exception. A finding with no bounding box cannot be visually verified against the source image, which defeats the entire "officer can verify, not just trust" principle (source §1.10.1).
2. **Generated reports contain no image evidence at all.** `report_service.py::_build_report_html`/`_build_report_docx` render a text/table summary of `field_results`/`extracted_fields` — no cropped image regions, no embedded photos, nothing tying a specific finding back to a specific pixel region of the actual uploaded package photo. A report that says "MRP: missing" with no visual is not the self-contained evidentiary artifact the source spec requires.

### 6.2 What replaces it

1. **When using the Groq vision path, request bounding boxes from the model explicitly.** Modify the vision prompt in `groq_service.py::extract_from_image` to ask for an approximate bounding box (as a fraction of image width/height, e.g. `[x_min, y_min, x_max, y_max]` normalized 0–1) alongside each extracted field's value and confidence. Vision-capable LLMs can produce reasonable approximate localization when explicitly asked; this will not be pixel-perfect, but an approximate, honestly-labeled region is a large improvement over `None`, and should be labeled in the UI as "approximate location" rather than implying pixel-exact precision.
2. **When Tesseract is the fallback path, use its real per-word coordinates** (`pytesseract.image_to_data`, which the code already calls for confidence scoring but currently discards the positional data) — match extracted field values back to their source words' actual bounding boxes rather than discarding this information. This is a smaller fix than the Groq-side one and should be done first since the data is already being fetched.
3. **Store bounding boxes against the new `compliance_checks` table** (§2.2), not just the loose `Scan.bounding_boxes` JSON blob — add an `image_index` (which of the scan's possibly-several images) and `bounding_box` (JSON: `{x_min, y_min, x_max, y_max}` normalized) to `ComplianceCheck`, so each check result can point at its specific evidence directly, matching the source schema's `ExtractedDeclaration.bounding_box` design intent.
4. **Embed actual image crops in generated reports.** Extend `report_service.py` to, for each `ComplianceCheck` row that has a bounding box, crop the corresponding region from the source image (Pillow — already a dependency), and embed the resulting crop directly in the PDF (as a base64-encoded `<img>` in the WeasyPrint HTML template) and in the DOCX (via `python-docx`'s `add_picture` from an in-memory buffer). A report with no evidence crops for a finding that does have a bounding box available is a defect against this requirement — audit every `ComplianceCheck` row with a non-null bounding box and confirm its crop appears in both the PDF and DOCX output.
5. **Update the review UI** (`web/app/scans/[scanId]/page.tsx`, `mobile/app/result.tsx`) to render the actual bounding-box overlays on the displayed image — confidence-colored (green/amber/red) as the source spec's `declaration-review.js` behavior describes — rather than only showing the extracted text values in a list with no spatial context.

### 6.3 Test to prove this gap is closed

`tests/integration/test_report_evidence.py::test_report_contains_image_crops_for_flagged_checks` — generate a report against a scan with at least one `ComplianceCheck` row carrying a bounding box, parse the generated PDF/DOCX, and assert image data is actually embedded (not just referenced by a path) corresponding to that check.

---

## 7. Non-Negotiable Gap #6 — No Tests Exist At All

This repository has zero test files of any kind. Given four of the six gaps above are directly about correctness of legally-consequential logic (compliance scoring, rule versioning, RBAC, evidence integrity), shipping fixes to any of them without a test suite is not an acceptable way to close these gaps — a fix that isn't pinned down by a test is a fix that can silently regress on the next change. Phase sequencing below treats test-writing as inline with each gap's remediation, not a separate cleanup pass at the end.

Minimum required test files by the end of this remediation:
- `tests/unit/test_compliance_engine.py` — the rewritten five-outcome evaluator (§2.3)
- `tests/unit/test_rule_resolution.py` — the standard-size worked example and effective-date querying (§3.2 point 6)
- `tests/integration/test_rbac.py` — the route × role matrix (§4.3)
- `tests/integration/test_pipeline_async.py` — non-blocking submission (§5.3)
- `tests/integration/test_report_evidence.py` — embedded crops (§6.3)
- `tests/integration/test_report_immutability.py` — this one can mostly be written *now*, unchanged from the v1 plan's version, since `report_service.py`'s immutability logic is already correct; it's a gap in test coverage, not in the underlying code

---

## 8. Infrastructure & Housekeeping Gaps (lower severity, still required)

These don't violate a core design principle on their own, but they block reliable operation and should be fixed alongside the phases above rather than deferred indefinitely:

1. **PostgreSQL migration.** Replace `sqlite:///./compliance.db` default with a `DATABASE_URL` pointing at Postgres in any non-local-dev config; keep SQLite as a same-code-path option for fast local iteration only, gated by an explicit environment variable, never the silent default for anything beyond a laptop demo.
2. **Real Alembic migrations.** `alembic` is already a listed dependency but unused — `migrate.py`'s hand-rolled ALTER-TABLE script is not a substitute. Initialize Alembic properly (`alembic init`), generate a baseline migration capturing the current schema, and require every schema change from this point forward (including every table/column addition in §2 and §3) to go through a real, versioned migration. Delete `migrate.py` once the baseline migration supersedes it.
3. **Secrets.** `SECRET_KEY` in `config.py` has a hardcoded, checked-in default (`"sih2026-legal-metrology-secret-key-change-in-prod"`). Require it to be set via environment variable with no usable default in any non-development config — fail startup loudly if unset outside development, rather than silently running with a publicly-known secret.
4. **`DEBUG` defaults to `True`.** Flip the default to `False`, matching the source spec's explicit requirement; make `True` an opt-in for local development only.
5. **CORS is wide open** (`allow_origins=["*"]`) with `allow_credentials=True` — this combination is a real security anti-pattern (credentialed requests from any origin). Restrict to the known web/mobile origins via environment-configured allowlist before anything resembling a real deployment.
6. **Seed data.** `seed.py` only creates one admin user. Extend it (or add a new `seed_full.py`) to seed: the four commodity categories (§3.2), the universal rule set migrated from `COMPLIANCE_FIELDS` into real `Rule` rows with `effective_from`/`rule_family` (§3.2), the standard-size worked-example rows, and one demo user per role — so a fresh clone can actually demonstrate the full system rather than starting from an empty rule table the way it does today.

---

## 9. Explicit Non-Goals for This Remediation

Stated plainly so scope doesn't silently creep during implementation:

- **Not migrating FastAPI → Flask, or Next.js/Expo → server-rendered Jinja2.** The existing stack choice stands; this plan fixes logic and infrastructure within it.
- **Not replacing Groq vision or Tesseract with PaddleOCR.** The existing OCR/vision-LLM approach is a legitimate, arguably stronger choice than the v1 plan's PaddleOCR-only design; keep it, just fix its confidence reporting (§2.2 point 4) and bounding-box output (§6.2 point 1).
- **Not removing barcode/Open Food Facts enrichment.** Keep it; just make explicit in code and docs that it's a convenience data source, never silently overriding an officer's own manual correction to a field once one has been recorded.
- **Not expanding commodity-category coverage beyond the same four categories the v1 plan scoped** (General, Food, Edible Oil, Medical Device) — same reasoning as before: these four exercise every major branch of the rule-routing logic without spreading effort thin across categories that would all resolve the same way.
- **Not building the mobile app's offline queueing, geographic analytics, or government-DB integration** — all explicitly future-scope in the original source document and untouched by this remediation.

---

## 10. Updated Non-Negotiable Principles Checklist

Re-stating the v1 plan's seven principles, now scored against this repository's *current* state and what closes each gap:

| # | Principle | Current state | Closed by |
|---|---|---|---|
| 1 | Three/five-outcome, never binary | **Verified closed** — engine outcomes and manual-review precedence are directly asserted in [`test_compliance_engine.py`](backend/tests/unit/test_compliance_engine.py) and [`test_rule_resolution.py`](backend/tests/unit/test_rule_resolution.py). | Verified by tests |
| 2 | Regulatory content is data, not code | **Verified closed** — category-aware/versioned `Rule` rows and category flags are exercised in [`test_rule_resolution.py`](backend/tests/unit/test_rule_resolution.py). | Verified by tests |
| 3 | Compliance results are frozen facts | **Verified closed** — persisted `ComplianceCheck` records and report evidence are covered by [`test_report_evidence.py`](backend/tests/integration/test_report_evidence.py). | Verified by tests |
| 4 | Scans are append-only | **Verified closed** — each rescan creates a distinct row and leaves the original pending/result state untouched in [`test_scan_append_only.py`](backend/tests/integration/test_scan_append_only.py). | Verified by test |
| 5 | Reports are immutable | **Verified closed** — regeneration creates a new report and links the prior report through `superseded_by_report_id` in [`test_report_immutability.py`](backend/tests/integration/test_report_immutability.py). | Verified by test |
| 6 | RBAC enforced server-side, everywhere | **Verified closed** — authentication, role restrictions, scoped scans, status, report, admin-user, and review routes are covered by [`test_rbac.py`](backend/tests/integration/test_rbac.py). | Verified by tests |
| 7 | Never fabricate certainty | **Verified closed** — no hardcoded confidence; absent localization/calibration or unparsable standard size yields `ManualReviewRequired`; evidence rendering skips unknown boxes. Covered by [`test_rule_resolution.py`](backend/tests/unit/test_rule_resolution.py), [`test_report_evidence.py`](backend/tests/integration/test_report_evidence.py), and [`test_infrastructure.py`](backend/tests/unit/test_infrastructure.py). | Verified by code audit and tests |

Two out of seven non-negotiable principles already hold in the current code (append-only scans, report immutability) — these are real, verified strengths to build on. The other five are the actual remediation scope.

---

*(End of Implementation Plan v2. Pair with `02_PHASE_WISE_REMEDIATION_PROMPTS.md` for the sequenced build prompts.)*
