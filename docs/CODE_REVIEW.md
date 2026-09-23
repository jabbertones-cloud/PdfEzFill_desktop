# Code review workflow

Two external tools, two different jobs. Both are wired in on this branch;
neither is faked — where a credential or a local install is required, it is
called out explicitly.

## 1. Alibaba OpenCodeReview (CI — reviews every PR)

**What it is:** AI code-review CLI (`ocr`) from Alibaba's internal review
assistant, open-sourced (Apache-2.0, ~40k stars). Hybrid deterministic
pipeline + LLM agent: reads the PR diff, bundles related files, applies a
built-in multi-language ruleset (NPE, thread-safety, XSS, SQL injection),
and posts precise line-level inline comments plus a sticky summary.
Benchmarked higher precision/F1 than general-purpose agents at ~1/9 the
tokens. Needs a configured LLM (OpenAI-compatible or Anthropic).

**CI integration:** `.github/workflows/code-review.yml`

- Trigger: `pull_request` (opened, synchronize, reopened)
- Action: `alibaba/open-code-review@v1.12.9`, CLI pinned via
  `ocr_version: '1.12.9'`
- Posts inline findings + sticky summary; `incremental: true` so repeat
  pushes only add non-overlapping comments; low-severity/style findings are
  routed to the summary (`route_severity_below: medium`,
  `route_categories: 'style,documentation'`)
- **Gating:** the job runs only when the LLM secrets/variables exist —
  `OCR_LLM_URL` and `OCR_LLM_AUTH_TOKEN` (secrets), `OCR_LLM_MODEL`
  (+ optional `OCR_LLM_USE_ANTHROPIC`) as variables. These names match the
  canonical upstream example. Until Scott adds them
  (repo Settings → Secrets and variables → Actions), the job logs a notice
  and exits 0. No secrets are committed; the workflow only *reads* them.

**Local usage** (optional, same engine developers run):

```bash
npm install -g @alibaba-group/open-code-review
ocr config provider        # pick provider, paste API key (local only)
ocr config model
ocr review --from main --to feature/monetization-sprint   # branch diff
ocr scan --path server     # full-file audit of a directory
```

Docs: https://github.com/alibaba/open-code-review and
https://open-codereview.ai/docs (CI/CD Integration page covers the
GitHub Action inputs used here).

## 2. ECC v2.2.1 (local pre-push review)

**What it is:** "Everything Claude Code" (MIT, affaan-m/ECC) — an agent
*harness* optimization system: skills, hooks, memory, and review agents for
Claude Code / Codex / Cursor / etc. It is **not** a standalone review CLI
and does not run in CI; its review power comes from its `/code-review`
slash command (security + quality review of uncommitted changes or a PR)
run inside a Claude Code session. Pinned to the **v2.2.1** release line.

**Integration in this repo:**

- `.ecc-version` — pin file containing `2.2.1`
- `scripts/ecc-review.sh` — pre-push script (`npm run review:ecc`):
  1. Runs the deterministic gates (`npm test`, secret-pattern scan —
     fails the push on `sk_live_`/`AKIA`/etc. in staged files)
  2. Verifies the pinned `ecc-universal@2.2.1` package resolves
  3. If `claude` CLI is available, hands off to ECC's `/code-review`;
     otherwise prints the manual invocation steps
- `docs/CODE_REVIEW.md` (this file) documents the flow

**Install (one time, on the dev Mac):**

```bash
npx ecc-universal@2.2.1 setup     # guided setup; installs the ecc@ecc plugin
```

**Use before every push:**

```bash
npm run review:ecc
# …then, in a Claude Code session with ECC enabled:  /code-review
```

**Limitation (by design):** ECC reviews happen in the developer's local
Claude Code session, not in GitHub Actions — there is nothing to install
as a workflow. The script above is the repo-side half; the human half is
running `/code-review` before pushing.

## Policy

| Gate | When | Enforced by |
|---|---|---|
| `npm test` green | every push | `ci.yml` (ubuntu + macos) |
| ECC pre-push review | every push | `scripts/ecc-review.sh` (local convention) |
| OpenCodeReview PR review | every PR | `code-review.yml` (once LLM secrets are set) |
| No secrets in diffs | every push | `ecc-review.sh` secret scan + review |

Until the application sources are restored (see `docs/INVENTORY.md`), both
tools review the scaffold/docs on this branch — the real value starts when
`server/` and `client/` sources land.

## Pre-merge step (delegation mode, no LLM key needed)

`scripts/review.sh` runs the required pre-merge review using `ocr delegate`
(open-code-review v1.12.9, delegation mode): it prints which files will be
reviewed (`ocr delegate preview --from main --to <branch>`) plus the resolved
rule set for the changed files (`ocr delegate rule <files>`), and the
reviewer applies those rules to the diff, fixing every blocker/major before
merging. Full workflow: `CONTRIBUTING.md`.
