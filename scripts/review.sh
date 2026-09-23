#!/usr/bin/env bash
#
# Pre-merge review gate for PdfEzFill Desktop.
#
#   bash scripts/review.sh [BASE] [HEAD]
#
# Defaults: BASE=main, HEAD=current branch. Wraps Alibaba OpenCodeReview
# (`ocr`, /usr/bin/ocr, v1.12.9) in *delegate mode* — no LLM key required:
# it emits the review spec (which files, which rules per language) and the
# calling agent/human applies those rules to the diff by hand.
#
# Steps:
#   1. npm test — deterministic gates must be green before any review.
#   2. ocr delegate preview --from BASE --to HEAD — list the reviewable
#      changed files and how each will be reviewed.
#   3. ocr delegate rule <files> — print the resolved rule set for those
#      files (security/quality patterns the reviewer must check against).
#   4. Prompt with the checklist: the reviewer (agent or human) applies the
#      rules to the diff and fixes blockers/majors before merging.
#
# If the ECC v2.2.1 harness is installed, run `npm run review:ecc` as well
# (it adds the secret-pattern scan + the Claude Code /code-review step);
# if `claude` is not present that half is manual — see docs/CODE_REVIEW.md.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-main}"
HEAD="${2:-$(git rev-parse --abbrev-ref HEAD)}"

echo "==> [1/4] npm test (deterministic gates)"
npm test --silent

echo
echo "==> [2/4] ocr delegate preview --from $BASE --to $HEAD"
ocr delegate preview --from "$BASE" --to "$HEAD"

echo
echo "==> [3/4] ocr delegate rule (resolved review rules for changed files)"
COMMITTED="$(git diff --name-only "$BASE...$HEAD" 2>/dev/null || true)"
UNCOMMITTED="$(git status --short | awk '{print $2}' || true)"
CHANGED="$(printf '%s\n%s\n' "$COMMITTED" "$UNCOMMITTED" | sed '/^$/d' | sort -u | tr '\n' ' ')"
if [ -z "$CHANGED" ]; then
  echo "No changed files between $BASE and $HEAD (committed or uncommitted)."
else
  echo "Reviewing committed + uncommitted changes:"
  echo "  $CHANGED"
  # Word-splitting here is intentional; paths with spaces are out of scope.
  # shellcheck disable=SC2086
  ocr delegate rule $CHANGED
fi

echo
echo "==> [4/4] pre-merge checklist"
cat <<EOF
Review the $BASE...$HEAD diff against the rules above, then fix all
BLOCKERS/MAJORS before merging:
  - git diff $BASE...$HEAD            # full diff under review
  - npm test                         # must stay green after fixes
EOF

if command -v claude >/dev/null 2>&1; then
  echo "  - npm run review:ecc               # ECC v2.2.1 pre-push review (claude CLI found)"
else
  echo "  - ECC: 'claude' CLI not installed — /code-review step is manual on the dev Mac"
fi
echo "Only merge to main when the checklist is clear (see CONTRIBUTING.md)."
