# PdfEzFill Desktop (Mac)

Desktop Mac companion app for **PdfEzFill** — the AI-assisted PDF autofill product.
Users fill PDFs offline in a native-feeling desktop shell; licensing and
entitlement are validated against the PdfEzFill web backend (Stripe).

> **Repository state (2026-10-14):** the application source tree has been
> **restored** from the claw-architect monorepo, commit `f823c0b3`
> (`pdfezfill_desktop`, 208 files, byte-exact). The scaffold snapshot that
> previously occupied this repo is preserved in git history (parent commit)
> and its non-colliding record files (`docs/`, `tests/`, `qa/`,
> `scripts/license-stub.mjs`) remain in the tree. See
> [`docs/INVENTORY.md`](docs/INVENTORY.md) for the pre-restore inventory.


## Intended architecture (reconstructed from the snapshot)

| Layer | Intended stack | Evidence in repo |
|---|---|---|
| Desktop server | Node.js + TypeScript (SQLite via `db-desktop.js`) | `server/.syncthing.*.ts.tmp` |
| Desktop client | React + TypeScript (`@tanstack/react-query`, shadcn-style `ui/` components) | `client/src/**.tmp` |
| License service | `PDFEZ-XXXX-XXXX-XXXX-XXXX` keys, Stripe webhook → emailed key → one-time remote validation → local SQLite | `server/.syncthing.licenseService.ts.tmp` |
| Trial | 3 free PDFs, then paywall | `licenseService.ts.tmp` (`TRIAL_LIMIT = 3`), `useLicense.ts.tmp` |
| QA harness | Multi-layer QA runner (static/unit/property/e2e/load/ai-explorer/observability) | `qa/reports/super-qa-report-latest.json` (last run: **FAIL**, 2026-03-14) |

## What this branch adds (monetization sprint)

This branch (`feature/monetization-sprint`) does **not** restore the missing
application source — that has to come from the original machine
(`/Users/tatsheen/claw-architect/pdfezfill_desktop` per the QA report). It adds
the testing, QA, review, and licensing scaffolding that was missing:

- `package.json` + `tests/` — runnable `npm test` suite (Node's built-in
  test runner, zero dependencies, runs on Linux and macOS)
- `.github/workflows/ci.yml` — CI matrix on `ubuntu-latest` **and**
  `macos-latest`
- `.github/workflows/code-review.yml` — Alibaba OpenCodeReview on PRs
  (pinned `v1.12.9`; no-ops until LLM secrets are configured)
- `scripts/ecc-review.sh` + `.ecc-version` — pre-push review flow pinned to
  ECC **v2.2.1** (`npm run review:ecc`)
- `scripts/license-stub.mjs` — local stub of the license validation endpoint
  for offline/test-mode development
- `docs/DESKTOP_QA.md` — manual Mac QA checklist
- `docs/CODE_REVIEW.md` — how the two review tools fit together
- `docs/LICENSING.md` — license/entitlement design, test mode, and security
  findings from the existing license-service design
- `docs/INVENTORY.md` — full current-state inventory, shippable-vs-missing
- `.env.example` — placeholders only, no secrets

## Quickstart (scaffold only)

```bash
npm test                 # run the contract/smoke suite (node --test, no deps)
npm run review:ecc       # pre-push review: tests + secret scan + ECC guidance

# License validation stub (test mode) — see docs/LICENSING.md
LICENSE_VALIDATION_URL=http://127.0.0.1:8787/v1/license/validate \
  node scripts/license-stub.mjs
```

Copy `.env.example` to `.env` and fill in values when the real backend exists.
Never commit `.env`.

## System dependencies

- **Poppler (`pdftoppm`)** — required by the processing pipeline to render
  PDF pages to images (page previews and field detection for scanned
  forms). It is a *system* dependency, not an npm/pip package:
  - macOS: `brew install poppler`
  - Debian/Ubuntu: `sudo apt-get install poppler-utils`
  - Windows: install Poppler and add its `bin` folder to `PATH`.
  The server checks for `pdftoppm` at startup and logs a clear,
  actionable message when it is missing; the affected processing paths
  report a named `dependency_missing` error instead of failing
  cryptically mid-pipeline. Native AcroForm field extraction does not
  need Poppler.
- **Unicode fill font** — `assets/fonts/NotoSansSC.ttf` (Noto Sans SC,
  SIL Open Font License 1.1, see `assets/fonts/OFL.txt`) is embedded by
  the PDF renderer so filled values with non-Latin text render correctly.

## Docs

- [`docs/INVENTORY.md`](docs/INVENTORY.md) — current state: stack, what's
  shippable, what's missing, blockers
- [`docs/DESKTOP_QA.md`](docs/DESKTOP_QA.md) — manual Mac testing checklist
- [`docs/CODE_REVIEW.md`](docs/CODE_REVIEW.md) — OpenCodeReview + ECC v2.2.1
  review workflow
- [`docs/LICENSING.md`](docs/LICENSING.md) — licensing/entitlement design and
  test mode

## License

No `LICENSE` file is present in this repo yet — **decide before distributing**.
See `docs/INVENTORY.md` ("Licensing model" section).
