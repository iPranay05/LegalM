# Integration Notes — LegalM (final-integrated UI + deepansh backend)

This build merges the two submitted projects:

- **`LegalM-final-integrated`** → source of the **web app** and **mobile app**
  (new dashboard, products, redesigned scan/result flows, design system,
  bottom-nav mobile UI). Its own `mobile/CHANGES.md` is preserved at
  `mobile/CHANGES.md`.
- **`LegalM-deepansh`** → source of the **backend** (`backend/`), which is a
  strict superset of the other copy's backend: it adds barcode/OCR
  robustness (multi-tile decoding, OCR fallback for damaged barcodes),
  camera-photo tolerant symbol detection, package tamper detection
  (`app/services/tamper_service.py`), an e-commerce listing crawler
  (`app/services/ecommerce_crawler.py` + `POST /ecommerce/crawl`), a
  `POST /scan/{scan_id}/reprocess` endpoint, and corrected FSSAI /
  "NotApplicable" scoring logic in the compliance engine.

## What was changed to make the two fit together

1. **Backend fully replaced** with the deepansh version (`backend/`) — DB
   models were already identical between the two projects, so no migration
   changes were needed.
2. **`web/lib/types.ts`** and **`mobile/lib/types.ts`** — added the
   `tamper_detection` and `skip_reason` fields to `SymbolResult` so the UI
   types match what the deepansh backend now returns in
   `symbols_detected`. (Not yet surfaced in the UI — the data is available
   on `scan.symbols_detected.tamper_detection` if you want to add a badge
   for it later.)
3. **`mobile/lib/api.ts`** — restored a 401-response interceptor that clears
   the stored auth token/user on an invalid or expired JWT, so a stale
   token doesn't get retried forever and instead sends the user back to
   login on next launch.
4. **Bug fix — `mobile/app/result.tsx`**: the report-download code imported
   `expo-file-system`, whose `cacheDirectory` / `downloadAsync` were
   removed in SDK 54 (only kept as deprecated legacy exports). This would
   have thrown a runtime `TypeError` the first time someone tapped
   "PDF Report" / "DOCX Report" on the phone. Fixed by importing from
   `expo-file-system/legacy`, which keeps the same function-based API this
   screen and the report-sharing flow depend on.

## Verification performed

- All 56 backend `.py` files parse (`ast.parse`), and the FastAPI app
  imports cleanly with all **40 routes** present, including the ones the
  new UI calls: `/scan/upload-multi`, `/scan/{id}/status`,
  `/scan/{id}/result-tabs`, `/scan/{id}/reprocess`, `/ecommerce/crawl`,
  `/products/{id}`, etc.
- `npx tsc --noEmit` passes with **zero errors** on both `web/` and
  `mobile/`.
- `npx next build` succeeds, producing all 17 web routes.

## Update — FSSAI / veg-non-veg detection improvements

A scan of "Saffola Oats" showed the FSSAI licence number and veg/non-veg mark
both coming back not-found. Investigation (with the unit test suite as a
guide — `test_confidently_absent_field_becomes_fail` confirms the engine
*correctly* reports "Missing" whenever the extractor is confident a field
isn't there) pointed to two separate, real gaps rather than an engine bug:

1. **The photographed side of the pack matters.** The screenshot showed the
   *back* panel (nutrition table, ingredients) — the veg/non-veg mark and
   the FSSAI licence number are almost always printed on the **front**, near
   the product name/net quantity. If only the back is captured, there is
   nothing for the pipeline to have detected. Multi-image scans already
   OR-merge symbol detections across every uploaded photo
   (`_merge_pipeline_results`), so **scanning front + back together** (the
   "New Inspection" multi-photo flow, `POST /scan/upload-multi`) is the most
   reliable fix on the capture side.
2. **Detection itself was too brittle for real phone photos**, independent
   of which side was shown:
   - `symbol_service.py`'s veg/non-veg detection was pure OpenCV
     color/shape heuristics (green or brown dot inside a matching square).
     This is easily defeated by blur, JPEG compression, or glare on a phone
     photo even when the mark is genuinely in frame.
   - `groq_service.py`'s FSSAI prompt asked for "exactly 14 digits" — if the
     model could only read some of the digits, the rule told it to return
     null rather than a partial, lower-confidence reading, and the
     keyword-anchored regex fallback in `compliance_engine.py` also missed
     a licence number if OCR garbled the word "FSSAI"/"Lic. No." right
     before it.

**Fixes applied:**
- `groq_service.py` now also asks the vision model directly whether it can
  see the veg mark / non-veg mark (`veg_mark` / `non_veg_mark`, tri-state:
  `true` / `false` / `null` for "this side of the pack isn't shown"). The
  FSSAI instruction now accepts a partial digit reading at lower confidence
  instead of forcing a null.
- `pipeline_service.py`'s `run_symbol_stage` now OR-combines the OpenCV
  result with this vision signal — either method finding the mark is
  enough — and records `method: "opencv+vision"` when vision was the one
  that found it.
- `compliance_engine.py`'s `_extract_value` now also accepts a bare,
  unlabelled 14-digit run as a valid FSSAI number (a 14-digit run is
  distinctive enough on its own — nothing else on a commodity label is
  normally exactly that length), instead of requiring the literal keyword
  "FSSAI"/"Lic. No." immediately before it.
- Added the resulting `tamper_detection`/`skip_reason`/`method` fields to
  both frontend `types.ts` files (done in the prior integration pass).

All 30 backend unit tests still pass unchanged after these edits, including
the confidence-gating tests referenced above.

## Before running it

- Backend: copy `.env.example` → `.env`, set `DATABASE_URL`, `SECRET_KEY`,
  `GROQ_API_KEY` (for vision OCR) as needed, then
  `pip install -r backend/requirements.txt --break-system-packages` and
  run via `uvicorn main:app --reload` from `backend/` (or `docker compose up`).
- Web: `cd web && npm install && npm run dev` (reads `NEXT_PUBLIC_API_URL`,
  defaults to `http://localhost:8000`).
- Mobile: `cd mobile && npm install --legacy-peer-deps`, set your machine's
  LAN IP in `mobile/lib/api.ts` → `API_BASE_URL`, then `npx expo start`.
  (`--legacy-peer-deps` is needed because of a React 19.1 vs 19.2 peer
  range mismatch between `expo` and `react-dom` in this SDK/version combo —
  it's a peer-dependency warning only, not a runtime issue.)
