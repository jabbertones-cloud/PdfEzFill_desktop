# Contributing — PdfEzFill Desktop

Test environment: Node ≥ 20, zero npm dependencies.

```bash
npm test                    # full suite (node --test, no install needed)
bash scripts/review.sh      # pre-merge review: tests + OpenCodeReview delegate spec
```

## The pre-merge review step (required)

**No feature branch merges to `main` without a code review of its diff.**
The review uses Alibaba OpenCodeReview in delegation mode — no LLM key is
needed because it emits the review spec and *you* (agent or human) apply
the rules:

```bash
bash scripts/review.sh main feature/<your-branch>
# 1. runs npm test — must be green before reviewing
# 2. `ocr delegate preview --from main --to feature/<your-branch>` —
#    lists which files get reviewed and how
# 3. `ocr delegate rule <changed-files>` — prints the resolved rule set
#    (security/quality patterns per language) you must check the diff against
# 4. review the diff against those rules, fix every BLOCKER/MAJOR,
#    re-run npm test
```

For the direct commands (skipping the wrapper):

```bash
ocr delegate preview --from main --to feature/my-branch
ocr delegate rule <files>          # resolved rules for those files
git diff main...feature/my-branch  # the diff under review
```

Only merge when the checklist is clear: tests green, all blockers/majors
addressed. Merge with a merge commit (`git merge --no-ff`), push `main`,
then delete the branch locally and remotely.

If the ECC v2.2.1 harness is installed on your machine, also run
`npm run review:ecc` before merging (secret-pattern scan + the Claude Code
`/code-review` step). It is a local pre-push convention, not CI — see
`docs/CODE_REVIEW.md` for the two tools' split of duties.
