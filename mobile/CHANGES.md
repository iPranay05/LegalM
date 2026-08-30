# LegalM Mobile — Updated to match the new web UI/UX

This is the **existing** Expo Router mobile app, restyled and reconnected to
match the current LegalM web app. Same backend, same APIs, same OCR/ML/
compliance pipeline, same database — only the mobile UI layer and its
connection to the (unchanged) working system were touched.

## What changed

**Design system** (`lib/theme.ts`)
Colors, radii, spacing and type scale ported 1:1 from the web app's
`legalm_design_system/DESIGN.md` and `globals.css` — deep navy primary,
government-blue secondary, semantic pass/review/fail colors.

**Navigation** — bottom tabs now mirror the web sidebar: **Dashboard, Scan,
History, Products, Profile**. Scan gets a raised, high-contrast center button
since it's the primary field action. Reports isn't a standalone tab — same as
the current web app — report generation lives inside the Compliance Result
screen instead.

**New Dashboard tab** (`app/(tabs)/dashboard.tsx`) — stat cards, recent scans,
top manual violations, all pulled from `/dashboard/stats` and
`/dashboard/top-violations`, same as the web dashboard.

**New Products tab + product detail** (`app/(tabs)/products.tsx`,
`app/product/[productId].tsx`) — didn't exist on mobile before; now mirrors
the web Products page, backed by `/products/`.

**Scan / New Inspection** (`app/(tabs)/scan.tsx`) — restyled camera-first flow
(unchanged capture logic), plus **one real bug fix**: the old screen expected
`/scan/upload` to return a finished result synchronously. The backend
pipeline is actually async (`pipeline_status: pending → processing →
complete/review_needed`). The screen now hands off to the result screen
immediately after upload, which polls `/scan/{id}/status` — the same pattern
the web app already uses.

**Compliance Result** (`app/result.tsx`) — completely rebuilt:
- Polls pipeline status and shows a processing screen with only the stages
  the backend actually reports (no fake progress percentages)
- Once complete, shows the same headline data as web: score ring, status
  badge, product/brand/net-qty/MRP, symbols detected, barcode data
- Tabs matching the web's four-tab breakdown: All Rules / Violations / N-A
  &Relaxed / Manual Findings, sourced from `/scan/{id}/result-tabs`
- Expandable violation cards with "View Evidence" → full-screen pinch-zoom
  image viewer
- Add manual finding (`POST /scan/{id}/findings`)
- Generate + download PDF/DOCX report (`/reports/generate`,
  `/reports/download`), shared via the OS share sheet

**History** (`app/(tabs)/history.tsx`) — desktop table → mobile cards, with a
real filter bottom-sheet (category, compliance status) against `/scan/`'s
actual query params, infinite scroll instead of one giant list.

**Profile** (`app/(tabs)/profile.tsx`) — account details, logout, and a
lightweight admin summary (rule/user counts from `/admin/rules`,
`/admin/users`) for Controller/Analyst roles — full rule/relaxation/user
*management* is left on the web console since it's a genuinely
desktop-shaped, data-heavy workflow; mobile just confirms it's reachable via
the same account.

**Top bar** — dropped the web's notification bell (no notifications backend
exists) and settings gear (redundant with the Profile tab) to avoid dead
buttons. Search is real — it filters History/Products by scan ID, product or
manufacturer against live backend data.

## What didn't change
- No new backend routes, no mock data anywhere, no separate auth system.
- `lib/api.ts` / `lib/auth.ts` still talk to the exact same `/auth`, `/scan`,
  `/dashboard`, `/products`, `/reports`, `/admin` endpoints as the web app.
- Camera/gallery capture, barcode scanning, and multi-image upload logic are
  unchanged from the working original.

## Before running it
Set your machine's LAN IP (not `localhost`) in `lib/api.ts` →
`API_BASE_URL`, matching how you'd point any Expo app at a local backend.
Then `npm install` and `npx expo install expo-sharing` (added for report
sharing — pin the version Expo resolves for your SDK) before `npx expo start`.
