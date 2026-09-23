#!/usr/bin/env bash
#
# Pre-push review gate for PdfEzFill Desktop (GREENFIELD glue script —
# nothing suitable existed in Scott's repos or upstream to reuse).
#
#   npm run review:ecc
#
# Does three things, in order:
#   1. Deterministic gates: npm test + secret-pattern scan of staged changes.
#      Fails the push on any finding.
#   2. Verifies the pinned ECC release (see .ecc-version, currently 2.2.1)
#      resolves from npm — the review itself runs inside Claude Code.
#   3. If the `claude` CLI is present, offers to launch ECC's /code-review
#      non-interactively; otherwise prints the manual steps.
#
# The ECC half of code review is intentionally local (ECC is a Claude Code
# harness, not a CI tool). See docs/CODE_REVIEW.md.
set -euo pipefail
cd "$(dirname "$0")/.."

ECC_PIN="$(tr -d '[:space:]' < .ecc-version)"
STAGED="$(git diff --cached --name-only 2>/dev/null || true)"
TARGETS="$STAGED"
[ -z "$TARGETS" ] && TARGETS="$(git diff --name-only HEAD 2>/dev/null || true)"

echo "==> [1/3] npm test"
npm test --silent

echo "==> [2/3] secret scan on changed files"
# Patterns that must never appear in committed code (placeholders excepted).
SECRET_RES=(
  'sk_live_[A-Za-z0-9]+'
  'rk_live_[A-Za-z0-9]+'
  'AKIA[0-9A-Z]{16}'
  'ghp_[A-Za-z0-9]{20,}'
  'xox[bap]-[A-Za-z0-9-]+'
  '-----BEGIN (RSA )?PRIVATE KEY-----'
)
FOUND=0
for f in $TARGETS; do
  [ -f "$f" ] || continue
  case "$f" in
    *.env.example|docs/*|*.md) continue ;;  # placeholders live here by design
  esac
  for re in "${SECRET_RES[@]}"; do
    if grep -Eq "$re" "$f"; then
      echo "BLOCKED: secret-like pattern '$re' in $f"
      FOUND=1
    fi
  done
done
[ "$FOUND" -eq 0 ] || { echo "Remove secrets before pushing."; exit 1; }
echo "    no secret patterns found"

echo "==> [3/3] ECC v${ECC_PIN} review"
if ! npm view "ecc-universal@${ECC_PIN}" version >/dev/null 2>&1; then
  echo "WARNING: ecc-universal@${ECC_PIN} not resolvable from npm — check network/registry."
else
  echo "    ecc-universal@${ECC_PIN} resolves OK"
fi

if command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI detected. Launching ECC /code-review on your changes…"
  echo "(ECC plugin 'ecc@ecc' must be installed: npx ecc-universal@${ECC_PIN} setup)"
  exec claude "/code-review"
else
  cat <<EOF
No 'claude' CLI on PATH — run the ECC review manually:

  1. One-time setup:  npx ecc-universal@${ECC_PIN} setup
  2. Open this repo in a Claude Code session with the ecc@ecc plugin enabled
  3. Run:  /code-review
     (blank = review uncommitted changes; pass a PR number/URL for PR mode)

Deterministic gates passed. Push when the ECC review is clean.
EOF
fi
