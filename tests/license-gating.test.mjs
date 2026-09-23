/**
 * License gating / monetization-path contract tests for PdfEzFill Desktop.
 *
 * These pin the *intended* gating semantics derived from
 * server/.syncthing.licenseService.ts.tmp and docs/LICENSING.md — the flow
 * that will decide whether the product can charge:
 *
 *   1. buy on web (Stripe) → webhook generates key → emailed to buyer
 *   2. user enters key + email → one-time POST /v1/license/validate
 *   3. stored locally; subsequent launches work offline
 *   4. trial: 3 free PDFs, then paywall
 *
 * Hermetic: no network, no SQLite, no filesystem. Every external
 * dependency (remote validation endpoint, local license row, trial usage
 * counter) is a pure function parameter.
 *
 * Run:  npm test        (node --test, zero dependencies)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirrors of the design ────────────────────────────────────────────────

const LICENSE_KEY_RE = /^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;
const TRIAL_LIMIT = 3;
const VALIDATION_ENDPOINT = 'https://api.pdfezfill.com/v1/license/validate';

// Simulated local license state row (what SQLite would hold).
const newLicenseRow = () => ({
  status: 'unactivated', // 'unactivated' | 'active' | 'expired' | 'invalid'
  licenseKey: null,
  email: null,
  plan: null,
  expiresAt: null, // epoch seconds | null
  activatedAt: null,
});

// The gating decision the app must make before letting a PDF be filled.
// Mirrors isWithinTrial() + getLicenseInfo() + the paywall check in
// client/src/hooks/.syncthing.useLicense.ts.tmp.
function gateDecision(licenseRow, trialCount, now = Math.floor(Date.now() / 1000)) {
  if (licenseRow.status === 'active') {
    const expired = licenseRow.expiresAt != null && licenseRow.expiresAt < now;
    if (expired) return { allowed: false, reason: 'expired' };
    return { allowed: true, reason: 'licensed' };
  }
  if (trialCount < TRIAL_LIMIT) {
    return { allowed: true, reason: 'trial', remaining: TRIAL_LIMIT - trialCount };
  }
  return { allowed: false, reason: 'paywall' };
}

// Simulated activation: validates format, then consumes the injected
// remote-validation result. Offline = { offline: true }.
// The RECOMMENDED contract (see docs/LICENSING.md finding #2) is
// fail-closed: a network failure must NOT grant a lifetime plan.
function activateLicense(key, email, validationResult, now = Math.floor(Date.now() / 1000)) {
  const normalized = String(key).trim().toUpperCase();
  if (!LICENSE_KEY_RE.test(normalized)) {
    return { success: false, message: 'Invalid license key format. Keys look like: PDFEZ-XXXX-XXXX-XXXX-XXXX' };
  }
  if (!validationResult) {
    return { success: false, message: 'License validation unavailable. Connect to the internet to activate, then work offline.' };
  }
  if (!validationResult.valid) {
    return { success: false, message: validationResult.message || 'License key not found or already used on another machine.' };
  }
  const expiresAt = validationResult.expiresAt
    ? Math.floor(new Date(validationResult.expiresAt).getTime() / 1000)
    : null;
  return {
    success: true,
    message: 'License activated successfully!',
    row: {
      ...newLicenseRow(),
      status: 'active',
      licenseKey: normalized,
      email,
      plan: validationResult.plan || 'lifetime',
      expiresAt,
      activatedAt: now,
    },
  };
}

// ─── Trial gating (the monetization funnel) ──────────────────────────────

describe('trial gating: 3 free PDFs, then paywall', () => {
  it('allows the first 3 fills while unlicensed', () => {
    for (const count of [0, 1, 2]) {
      const d = gateDecision(newLicenseRow(), count);
      assert.equal(d.allowed, true);
      assert.equal(d.reason, 'trial');
      assert.equal(d.remaining, TRIAL_LIMIT - count);
    }
  });

  it('blocks the 4th fill while unlicensed and requires the paywall', () => {
    const d = gateDecision(newLicenseRow(), 3);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'paywall');
  });

  it('trial usage beyond the limit stays blocked (no rollover)', () => {
    for (const count of [4, 10, 1000]) {
      const d = gateDecision(newLicenseRow(), count);
      assert.equal(d.allowed, false);
      assert.equal(d.reason, 'paywall');
    }
  });

  it('end-to-end funnel: trial exhausted, then activation restores access', () => {
    // The monetization funnel: user burns 3 trial fills, buys, activates.
    const key = 'PDFEZ-AAAA-BBBB-CCCC-DDDD';
    assert.equal(gateDecision(newLicenseRow(), 3).reason, 'paywall');
    const r = activateLicense(key, 'buyer@example.com', { valid: true, plan: 'lifetime' });
    assert.equal(r.success, true);
    const d = gateDecision(r.row, 3);
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'licensed');
  });
});

// ─── License bypassing the paywall ───────────────────────────────────────

describe('licensed user bypasses the paywall', () => {
  it('active lifetime license always allowed, regardless of trial usage', () => {
    const row = { ...newLicenseRow(), status: 'active', licenseKey: 'PDFEZ-ABCD-ABCD-ABCD-ABCD', plan: 'lifetime' };
    for (const count of [0, 3, 100]) {
      const d = gateDecision(row, count);
      assert.equal(d.allowed, true);
      assert.equal(d.reason, 'licensed');
    }
  });

  it('expired subscription blocks access', () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      ...newLicenseRow(),
      status: 'active',
      licenseKey: 'PDFEZ-ABCD-ABCD-ABCD-ABCD',
      plan: 'pro+',
      expiresAt: now - 60, // expired a minute ago
    };
    const d = gateDecision(row, 0, now);
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'expired');
  });

  it('unexpired subscription allows access up to the expiry second', () => {
    const now = Math.floor(Date.now() / 1000);
    const row = {
      ...newLicenseRow(),
      status: 'active',
      licenseKey: 'PDFEZ-ABCD-ABCD-ABCD-ABCD',
      plan: 'pro+',
      expiresAt: now + 60, // expires in a minute
    };
    const d = gateDecision(row, 0, now);
    assert.equal(d.allowed, true);
    assert.equal(d.reason, 'licensed');
  });

  it('revoked/invalid license state falls back to trial or paywall', () => {
    const row = { ...newLicenseRow(), status: 'invalid' };
    assert.equal(gateDecision(row, 0).reason, 'trial');
    assert.equal(gateDecision(row, 3).reason, 'paywall');
  });
});

// ─── Activation happy path (Stripe → key → email → activate) ──────────────

describe('activation flow', () => {
  const GOOD_KEY = 'PDFEZ-ABCD-1234-EF56-7890';

  it('activates a valid key with a valid remote response', () => {
    const r = activateLicense(GOOD_KEY, 'buyer@example.com', {
      valid: true,
      plan: 'lifetime',
      expiresAt: null,
    });
    assert.equal(r.success, true);
    assert.equal(r.row.status, 'active');
    assert.equal(r.row.licenseKey, GOOD_KEY);
    assert.equal(r.row.email, 'buyer@example.com');
    assert.equal(r.row.plan, 'lifetime');
    assert.equal(r.row.expiresAt, null);
    assert.ok(r.row.activatedAt > 0);
  });

  it('normalizes key before format check (trim + uppercase)', () => {
    const r = activateLicense('  pdfez-abcd-1234-ef56-7890\n', 'buyer@example.com', { valid: true });
    assert.equal(r.success, true);
    assert.equal(r.row.licenseKey, GOOD_KEY);
  });

  it('rejects malformed keys before any network call', () => {
    const r = activateLicense('NOT-A-KEY', 'buyer@example.com', { valid: true });
    assert.equal(r.success, false);
    assert.match(r.message, /Invalid license key format/);
  });

  it('rejects when the remote says the key is invalid or used', () => {
    const r = activateLicense(GOOD_KEY, 'buyer@example.com', {
      valid: false,
      message: 'License key not found or already used on another machine.',
    });
    assert.equal(r.success, false);
    assert.match(r.message, /already used/);
  });

  it('stores expiresAt from the remote as epoch seconds', () => {
    const r = activateLicense(GOOD_KEY, 'buyer@example.com', {
      valid: true,
      plan: 'pro+',
      expiresAt: '2027-01-01T00:00:00Z',
    });
    assert.equal(r.success, true);
    assert.equal(r.row.expiresAt, Math.floor(Date.parse('2027-01-01T00:00:00Z') / 1000));
  });

  it('does NOT grant a lifetime plan when offline (fail closed)', () => {
    // docs/LICENSING.md finding #2: the design grants { valid: true,
    // plan: 'lifetime' } on network errors. The monetizable contract is
    // the opposite — activation requires one successful online validation.
    const r = activateLicense(GOOD_KEY, 'buyer@example.com', /* offline */ null);
    assert.equal(r.success, false);
    assert.match(r.message, /Connect to the internet/);
  });
});

// ─── Endpoint contract ────────────────────────────────────────────────────

describe('validation endpoint contract', () => {
  it('endpoint is the documented HTTPS URL', () => {
    assert.equal(VALIDATION_ENDPOINT, 'https://api.pdfezfill.com/v1/license/validate');
    assert.ok(VALIDATION_ENDPOINT.startsWith('https://'), 'must be HTTPS');
  });
});
