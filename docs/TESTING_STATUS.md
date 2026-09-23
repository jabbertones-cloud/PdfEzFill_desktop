# Testing status — PdfEzFill Desktop

_Last updated: 2026-09-23, branch `feature/testing-harness` (merged to `main`)._

## How to run the tests

```bash
npm test                    # full suite — Node ≥ 20, zero npm dependencies
```

There is no `npm install` step: the suite runs on Node's built-in
`node:test` + `node:assert/strict` only. CI (`.github/workflows/ci.yml`)
runs the same command on ubuntu-latest + macos-latest × Node 20/22, plus
the license-stub contract smoke test.

## What the tests cover (78 tests, all green)

| File | Tests | What it pins |
|---|---|---|
| `tests/smoke.test.mjs` | 24 | License-key format contract (PDFEZ-XXXX…), `.env.example` hygiene (no live secrets), repo scaffold completeness |
| `tests/license-gating.test.mjs` | 21 | **Monetization core:** trial gating (3 free PDFs → paywall), licensed/exempt access, expiry semantics, activation happy path, malformed-key rejection, fail-closed offline activation, HTTPS validation-endpoint contract |
| `tests/autofill.test.mjs` | 19 | **Core value prop:** field-label → profile mapping for 18 canonical labels (name/email/phone/address/city/state/zip), label normalization, no autofill of unrecognized fields (no data in wrong fields), name-mapping precedence, coverage accounting (checkbox/radio/signature excluded) |
| `tests/pdf-formfill.test.mjs` | 14 | **Core value prop:** verification happy path (page-count preserved, sane bboxes, answer coverage excl. signatures, score 100) and failure modes the verifier must catch (page-count change = error, out-of-bounds/degenerate bboxes, nonexistent page, blank answers, score floor 0, success needs ≥ 60) |

All external dependencies are mocked by construction: remote license
validation, SQLite, and trial counters are pure function parameters, so the
suite is deterministic and hermetic (no network, no filesystem writes, no
randomness — the key-generation format test is the only random consumer and
asserts format/entropy properties only).

**Honest scope:** these are *contract* tests. They mirror the documented
behavior reconstructed from the Syncthing temp artifacts (the real
`sources` are not in the repo — see `docs/INVENTORY.md`). When the real
`server/` and `client/` sources are restored from Scott's Mac, the mirrors
must be replaced with imports of the real modules; any divergence will
surface as a test failure, which is the point.

## Code review integration

- `bash scripts/review.sh [BASE] [HEAD]` (also `npm run review:ocr`) —
  **required pre-merge step**, documented in `CONTRIBUTING.md` and
  `docs/CODE_REVIEW.md`. Runs `npm test`, then `ocr delegate preview` /
  `ocr delegate rule` (Alibaba OpenCodeReview v1.12.9, delegation mode —
  no LLM key needed), and the reviewer applies the emitted rule set to the
  branch diff, fixing every blocker/major before merging.
- `npm run review:ecc` (`scripts/ecc-review.sh`) — ECC v2.2.1 pre-push
  gate (deterministic: `npm test` + secret-pattern scan; review itself in
  Claude Code via `/code-review`).
- `.github/workflows/code-review.yml` — OpenCodeReview PR review in CI,
  pinned v1.12.9; gated on `OCR_LLM_*` secrets, which are **not yet set**
  (job exits 0 with a notice until Scott adds them).
- **ECC binary/config: none exists in this environment.** `which ecc` is
  empty; `~/.ecc` and `~/.ocr` do not exist. The repo pins ECC via
  `.ecc-version` (2.2.1, `ecc-universal` npm package) for the dev Mac, but
  nothing ECC was executed during this harness work — the ECC half was not
  run and must not be claimed to have run. `ocr` (v1.12.9, /usr/bin/ocr)
  **did** run in delegation mode.

## Top 3 gaps before monetization

1. **No real application sources.** The entire tree exists only as
   `.syncthing.*.tmp` artifacts; nothing builds, packages, or runs. Restore
   the source tree from the Mac (`docs/INVENTORY.md` § "Requires a Mac")
   and point these contract tests at the real modules before any pricing
   decision matters.
2. **No license backend.** Activation calls
   `https://api.pdfezfill.com/v1/license/validate`, which does not exist;
   neither do the Stripe products/prices, the webhook that generates keys,
   or the email delivery. Without these, keys cannot be sold or validated.
3. **No desktop shell or distribution pipeline.** No Electron/Tauri/native
   app, no signing/notarization, no DMG, no auto-update, no EULA/LICENSE
   file, no Apple Developer Program membership. The trial/paywall UX in the
   tests exists only as a contract, not as shipped software.
