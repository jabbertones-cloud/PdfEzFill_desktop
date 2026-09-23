/**
 * Form-fill verification contract tests for PdfEzFill Desktop.
 *
 * Filling a PDF locally is the product's core value prop; verification is
 * the deterministic (non-AI) quality gate that says "this filled PDF is
 * correct" before the user prints or emails it. These tests pin the
 * check semantics from server/.syncthing.pdfVerification.ts.tmp:
 *
 *   - page count preserved
 *   - every field has sane coordinates (0–100% bbox, valid page index)
 *   - answer coverage counts non-empty answers (signatures handled separately)
 *   - overall score = round(passed/total*100) − 20×errorChecks, floored at 0
 *   - success requires zero errors and score ≥ 60
 *
 * Hermetic: the check functions below are pure mirrors of the design —
 * no pdf-lib, no filesystem, no network.
 *
 * Run:  npm test        (node --test, zero dependencies)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirrors of the verification logic ────────────────────────────────────

function pageCountCheck(originalPages, generatedPages) {
  const passed = originalPages === generatedPages;
  return {
    name: 'Page Count',
    passed,
    severity: passed ? 'info' : 'error',
    error: passed ? null : 'Page count changed during PDF generation',
  };
}

// Mirror of the bbox sanity loop: [x, y, w, h] in 0–100% coordinates.
function bboxIssues(field, pageCount) {
  const issues = [];
  const [x, y, w, h] = field.bbox;
  if (x < 0 || x > 100) issues.push(`${field.label}: x=${x} out of bounds`);
  if (y < 0 || y > 100) issues.push(`${field.label}: y=${y} out of bounds`);
  if (w <= 0 || w > 100) issues.push(`${field.label}: width=${w} invalid`);
  if (h <= 0 || h > 50) issues.push(`${field.label}: height=${h} suspicious`);
  if (x + w > 105) issues.push(`${field.label}: extends past right edge`);
  if (y + h > 105) issues.push(`${field.label}: extends past bottom edge`);
  if (field.page < 1 || field.page > pageCount) {
    issues.push(`${field.label}: page ${field.page} doesn't exist`);
  }
  return issues;
}

// Mirror of the answer-coverage check (signatures handled separately).
function answerCoverageCheck(answers, fields) {
  const answered = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  const answerable = fields.filter((f) => f.type !== 'signature').length;
  const passed = answered > 0;
  return {
    name: 'Answer Coverage',
    passed,
    severity: passed ? 'info' : 'warning',
    answered,
    answerable,
  };
}

// Mirror of the final score / success rule.
function scoreResult(checks) {
  const passed = checks.filter((c) => c.passed).length;
  const errorChecks = checks.filter((c) => c.severity === 'error' && !c.passed).length;
  const score = Math.max(0, Math.round((passed / checks.length) * 100) - errorChecks * 20);
  const errors = checks.filter((c) => c.error).map((c) => c.error);
  return { score, errors, success: errors.length === 0 && score >= 60 };
}

const field = (label, bbox, page = 1, type = 'text') => ({ id: label, label, bbox, page, type });

// ─── Happy path: a clean two-page fill ────────────────────────────────────

describe('form fill: happy path verification', () => {
  const fields = [
    field('Full Name', [10, 20, 40, 6]),
    field('Email', [10, 30, 40, 6]),
    field('Signature', [10, 40, 40, 8], 1, 'signature'),
    field('Date', [10, 15, 25, 6], 2),
  ];
  const answers = { 'Full Name': 'Jordan Reyes', Email: 'jordan@example.com', Date: '2026-09-23' };

  it('page count preserved → info check, no error', () => {
    const c = pageCountCheck(2, 2);
    assert.equal(c.passed, true);
    assert.equal(c.error, null);
  });

  it('all sane bounding boxes produce zero issues', () => {
    for (const f of fields) {
      assert.deepEqual(bboxIssues(f, 2), [], f.label);
    }
  });

  it('answer coverage counts filled answers, excludes signature fields', () => {
    const c = answerCoverageCheck(answers, fields);
    assert.equal(c.passed, true);
    assert.equal(c.answered, 3);
    assert.equal(c.answerable, 3); // signature excluded
  });

  it('a perfect check set scores 100 and succeeds', () => {
    const checks = [
      { name: 'A', passed: true, severity: 'info' },
      { name: 'B', passed: true, severity: 'info' },
      { name: 'C', passed: true, severity: 'warning' },
    ];
    const r = scoreResult(checks);
    assert.equal(r.score, 100);
    assert.equal(r.success, true);
    assert.deepEqual(r.errors, []);
  });
});

// ─── Failure modes the verifier must catch ───────────────────────────────

describe('form fill: verification catches bad output', () => {
  it('page count change is an error (never an acceptable outcome)', () => {
    const c = pageCountCheck(2, 3);
    assert.equal(c.passed, false);
    assert.equal(c.severity, 'error');
    assert.match(c.error, /Page count changed/);
  });

  it('out-of-bounds coordinates are flagged', () => {
    assert.ok(bboxIssues(field('X', [-5, 20, 40, 6]), 2).length > 0);
    assert.ok(bboxIssues(field('Y', [10, 20, 200, 6]), 2).length > 0);
  });

  it('field bleeding past the right edge is flagged', () => {
    const issues = bboxIssues(field('Wide', [80, 20, 30, 6]), 2); // 80+30 > 105
    assert.ok(issues.some((i) => i.includes('extends past right edge')));
  });

  it('field on a nonexistent page is flagged', () => {
    const issues = bboxIssues(field('P3', [10, 20, 40, 6], 3), 2);
    assert.ok(issues.some((i) => i.includes("doesn't exist")));
  });

  it('degenerate width/height are flagged', () => {
    assert.ok(bboxIssues(field('W0', [10, 20, 0, 6]), 2).length > 0);
    assert.ok(bboxIssues(field('Tall', [10, 20, 40, 60]), 2).length > 0);
  });

  it('zero/blank answers fail coverage (whitespace is not an answer)', () => {
    const fields = [field('Full Name', [10, 20, 40, 6])];
    const c = answerCoverageCheck({ 'Full Name': '   ' }, fields);
    assert.equal(c.passed, false);
    assert.equal(c.answered, 0);
  });

  it('any error plus a low score fails overall verification', () => {
    const checks = [
      pageCountCheck(2, 3), // error, fails
      { name: 'Answer Coverage', passed: false, severity: 'warning' },
      { name: 'Bounding Box Validity', passed: true, severity: 'info' },
    ];
    const r = scoreResult(checks);
    // 1/3 passed → 33 − 20 = 13, and there is an error
    assert.equal(r.score, 13);
    assert.equal(r.success, false);
    assert.equal(r.errors.length, 1);
  });

  it('score never goes below zero', () => {
    const checks = Array.from({ length: 4 }, (_, i) => ({
      name: `C${i}`,
      passed: false,
      severity: 'error',
      error: `e${i}`,
    }));
    const r = scoreResult(checks);
    // 0/4 passed → 0 − 80 → floored at 0
    assert.equal(r.score, 0);
    assert.equal(r.success, false);
  });

  it('many errors fail even when some checks pass (success needs ≥60)', () => {
    const checks = [
      { name: 'Page Count', passed: false, severity: 'error', error: 'boom' },
      { name: 'A', passed: true, severity: 'info' },
    ];
    const r = scoreResult(checks);
    // 1/2 passed → 50 − 20 = 30 < 60
    assert.equal(r.score, 30);
    assert.equal(r.success, false);
  });
});
