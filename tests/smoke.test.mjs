/**
 * Contract + smoke tests for the PdfEzFill Desktop scaffold.
 *
 * These tests pin the *documented contracts* reconstructed from the repo's
 * design artifacts (server/.syncthing.licenseService.ts.tmp,
 * docs/LICENSING.md) — not a live implementation, which is not in the repo
 * yet. When the real sources land, point these at the real modules.
 *
 * Run:  npm test        (node --test, zero dependencies)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── License key contract (from licenseService design) ────────────────────
const LICENSE_KEY_RE = /^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

// Mirror of generateLicenseKey() in the design doc (hex-based, 64-bit entropy)
function generateLicenseKey() {
  const base32 = randomBytes(10).toString('hex').toUpperCase();
  return `PDFEZ-${base32.slice(0, 4)}-${base32.slice(4, 8)}-${base32.slice(8, 12)}-${base32.slice(12, 16)}`;
}

const TRIAL_LIMIT = 3; // contract value from the design doc

describe('license key contract', () => {
  it('generated keys match the PDFEZ-XXXX-XXXX-XXXX-XXXX format', () => {
    for (let i = 0; i < 200; i++) {
      assert.match(generateLicenseKey(), LICENSE_KEY_RE);
    }
  });

  it('generated keys are unique (64-bit entropy)', () => {
    const keys = new Set(Array.from({ length: 1000 }, generateLicenseKey));
    assert.equal(keys.size, 1000);
  });

  it('rejects malformed keys', () => {
    const bad = [
      'PDFEZ-XXXX-XXXX-XXXX-XXX',      // too short
      'PDFEZ-XXXX-XXXX-XXXX-XXXXX',    // too long
      'pdfez-ABCD-ABCD-ABCD-ABCD',     // lowercase
      'PDFEZ-abcd-abcd-abcd-abcd',     // lowercase hex
      'PDFEZ-ABCD-ABCD-ABCD-ABCD ',    // trailing space (must trim first)
      ' PDFEZ-ABCD-ABCD-ABCD-ABCD',    // leading space (must trim first)
      'PDFEZ-GHIJ-KLMN-OPQR-STUV',     // non-hex chars
      'OTHER-ABCD-ABCD-ABCD-ABCD',     // wrong prefix
      '',                             // empty
    ];
    for (const k of bad) assert.doesNotMatch(k, LICENSE_KEY_RE, k || '(empty)');
  });

  it('accepts keys after trim().toUpperCase() normalization', () => {
    assert.match('  pdfez-abcd-abcd-abcd-abcd\n'.trim().toUpperCase(), LICENSE_KEY_RE);
  });

  it('trial limit is 3 free PDFs', () => {
    assert.equal(TRIAL_LIMIT, 3);
  });
});

// ─── .env.example hygiene: placeholders only, no real secrets ──────────────
describe('.env.example hygiene', () => {
  const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');

  it('exists', () => {
    assert.ok(existsSync(join(ROOT, '.env.example')));
  });

  it('documents the license validation endpoint variable', () => {
    assert.match(envExample, /LICENSE_VALIDATION_URL=/);
  });

  it('contains no live secret material', () => {
    const livePatterns = [
      /sk_live_[A-Za-z0-9]+/,          // Stripe live secret key
      /rk_live_[A-Za-z0-9]+/,          // Stripe live restricted key
      /whsec_[A-Za-z0-9+/=]{16,}/,     // real webhook secret (not placeholder)
      /AKIA[0-9A-Z]{16}/,              // AWS access key
      /xox[bap]-[A-Za-z0-9-]+/,        // Slack tokens
      /ghp_[A-Za-z0-9]{20,}/,          // GitHub PAT
    ];
    for (const re of livePatterns) {
      assert.doesNotMatch(envExample, re, `live secret pattern ${re}`);
    }
    // every secret-bearing key must have a placeholder value; plain config
    // (paths, ports, provider names, documented URLs) may be literal
    const SECRET_KEY_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/;
    for (const line of envExample.split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue;
      const m = line.match(/^([A-Z_]+)=(\S*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (!v || !SECRET_KEY_RE.test(k)) continue;
      const placeholderish =
        /YOUR_|CHANGEME|EXAMPLE|placeholder/i.test(v) ||
        k === 'LICENSE_KEY_PATH'; // local path, not a secret
      assert.ok(placeholderish, `non-placeholder secret value in .env.example: ${line}`);
    }
  });

  it('.env itself is gitignored', () => {
    const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    assert.match(gi, /^\.env$/m);
  });
});

// ─── Repo scaffold completeness ────────────────────────────────────────────
describe('repo scaffold', () => {
  const required = [
    'README.md',
    'package.json',
    '.gitignore',
    '.env.example',
    '.ecc-version',
    'docs/INVENTORY.md',
    'docs/DESKTOP_QA.md',
    'docs/CODE_REVIEW.md',
    'docs/LICENSING.md',
    'scripts/ecc-review.sh',
    'scripts/license-stub.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/code-review.yml',
  ];

  for (const f of required) {
    it(`has ${f}`, () => {
      assert.ok(existsSync(join(ROOT, f)), `missing: ${f}`);
    });
  }

  it('ECC pin is v2.2.1', () => {
    assert.equal(readFileSync(join(ROOT, '.ecc-version'), 'utf8').trim(), '2.2.1');
  });

  it('code-review workflow pins OpenCodeReview v1.12.9', () => {
    const wf = readFileSync(join(ROOT, '.github/workflows/code-review.yml'), 'utf8');
    assert.match(wf, /alibaba\/open-code-review@v1\.12\.9/);
  });
});
