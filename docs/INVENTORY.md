# Repository inventory — PdfEzFill Desktop

_Captured 2026-09-23 on branch `feature/monetization-sprint` (base: `bcb3fdc`,
"push all code", 2026-03-16, `main`). Public repo
`jabbertones-cloud/PdfEzFill_desktop`._

## What kind of project is this?

**Intended:** a desktop Mac app for the PdfEzFill product line, architected as
a local Node.js/TypeScript server (SQLite-backed) + React/TypeScript client —
i.e. the classic shape of an **Electron-style** app (local server + web UI),
but **no desktop shell exists in the repo at all**: no Electron, no Tauri, no
Swift/SwiftUI, no React-Native-macOS config, no `package.json`, no lockfile,
no bundler config.

## File inventory (everything in the repo)

| Path | What it is |
|---|---|
| `client/public/.syncthing.llms-full.txt.tmp` | Product docs for the *web* product (AutoFillPDF pricing: Guest $5, Starter $7/mo, Pro+ $15/mo, Enterprise $49/mo — founding rates thru Jan 2026) |
| `client/src/components/*.tmp`, `client/src/components/ui/*.tmp` | React UI components (CookieConsent, FlowProgress, HelpTip, TemplateStats, badge/button/slider/tabs/toggle) |
| `client/src/hooks/.syncthing.useLicense.ts.tmp` | `useLicense` React hook: polls `/api/license/status`, derives trial/paywall state |
| `client/src/pages/.syncthing.FormFill.tsx.tmp` | Main form-fill page (~42 KB) |
| `server/.syncthing.licenseService.ts.tmp` | License key generation/activation/trial logic (the monetization core — see `docs/LICENSING.md`) |
| `server/.syncthing.autofillService.ts.tmp` | Field→profile autofill mapping rules |
| `server/.syncthing.pdfVerification.ts.tmp` | PDF verification helpers |
| `server/.syncthing.templateLearningService.ts.tmp` | Template learning service |
| `server/.syncthing.capabilitySignals.ts.tmp` | Misc capability/webhook/observability baselines (better-auth, Telnyx, bullmq, winston, helmet) |
| `qa/reports/super-qa-report-*.json` | QA harness output, 2026-03-14: **overall FAIL** — unit layer exit 1 (0 tests), static/property/e2e skipped, observability warns on 6 missing files |

Every source file exists **only** as a `.syncthing.*.tmp` artifact — these are
Syncthing partial-sync temp files, not the real sources. The real tree they
were synced from was `/Users/tatsheen/claw-architect/pdfezfill_desktop`
(a Mac), per the QA report's `appRoot`.

## Build instructions

None exist. No `package.json`, no `Makefile`, no Xcode project, no
`electron-builder`/`tauri.conf.json`. **Cannot build on any platform.**

## Test suite

- On `main`: none runnable. The QA report references `npm test`-style unit
  runs and a `qa/semgrep/run-semgrep.sh` that doesn't exist; all layers
  skipped or failed.
- On this branch: `npm test` (Node built-in runner, zero deps) runs
  contract/smoke tests in `tests/`. See "Testing/QA environment" below.

## CI workflows

- On `main`: none.
- On this branch: `.github/workflows/ci.yml` (test matrix
  `ubuntu-latest`/`macos-latest` × Node 20/22) and
  `.github/workflows/code-review.yml` (OpenCodeReview on PRs, pinned
  `v1.12.9`, gated on secrets).

## Release / distribution setup

None. No notarization, no DMG/PKG config, no auto-update
(`electron-updater`/Sparkle), no Mac App Store vs direct-distribution
decision recorded, no signing identity, no `Info.plist`, no bundle ID.

## Licensing model (desktop)

Designed but not implemented (sources missing):

- **Key format:** `PDFEZ-XXXX-XXXX-XXXX-XXXX` (16 hex chars, 64 bits entropy;
  the design doc calls it "base32" but the generator uses hex)
- **Purchase:** Stripe Checkout on the web backend → webhook generates key →
  key emailed to buyer (Resend/Brevo, on the web server)
- **Activation:** user enters key + email in app → one-time `POST`
  `https://api.pdfezfill.com/v1/license/validate` → stored in local SQLite;
  subsequent launches work offline
- **Trial:** 3 free PDFs (`TRIAL_LIMIT = 3`), then paywall gate
- **Pricing for desktop:** not decided. The only pricing on record is the
  *web* product's (see `llms-full.txt.tmp`): Guest $5 one-time, Starter
  $7/mo, Pro+ $15/mo, Enterprise $49/mo.

Security findings in the design (see `docs/LICENSING.md`): SQL string
interpolation of the email/key into the SQLite `INSERT`; offline-validation
fallback that **grants lifetime activation when the network is unavailable**;
unvalidated `expiresAt` parsing.

## README / LICENSE / changelog

- `README.md`: added on this branch (did not exist).
- `LICENSE`: **missing** — no license file, no declared license. The repo is
  public on GitHub, so the code is currently all-rights-reserved by default.
  Pick one before distributing (proprietary EULA is the norm for paid
  desktop apps).
- Version/changelog: none. No tags, no releases.

## Shippable vs missing

| Shippable today | Missing (blocks any release) |
|---|---|
| Nothing — no buildable artifact | Real source tree (only `.tmp` artifacts committed) |
| | `package.json` + dependency manifests |
| | Desktop shell decision + implementation (Electron/Tauri/native) |
| | Build/packaging config (DMG, signing, notarization) |
| | License backend endpoint (`api.pdfezfill.com/v1/license/validate`) |
| | Stripe products/prices + webhook key-delivery (web side) |
| | `LICENSE` file / EULA, pricing, trial copy |
| | Apple Developer Program membership + certificates |
| | Update mechanism (auto-update) |
| | Support channel/docs |

## Requires a Mac or Apple credentials (out of scope on Linux)

1. Restoring/verifying the real source tree (lives on Scott's Mac).
2. Any Electron/Tauri/Swift build, DMG packaging, code signing, notarization.
3. Manual QA per `docs/DESKTOP_QA.md`.
4. Apple Developer Program enrollment ($99/yr), Developer ID Application
   certificate, notarization credentials.
5. Mac App Store submission (if that channel is chosen).
