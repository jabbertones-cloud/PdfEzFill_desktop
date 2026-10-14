/**
 * License key service for PdfEzFill Desktop
 *
 * Flow:
 *   1. User buys on pdfezfill.com → Stripe Checkout
 *   2. Stripe webhook POST /api/license/deliver → generate + store key in DB
 *   3. License key emailed to user (external, via Resend/Brevo on the web server)
 *   4. User enters key in desktop app → POST /api/license/activate
 *   5. App validates against remote endpoint (one-time) → stores locally
 *   6. Subsequent launches: read from local SQLite (no network needed)
 *
 * License key format:  PDFEZ-XXXX-XXXX-XXXX-XXXX  (base32 encoded, 20 chars of entropy)
 * Validation endpoint: https://api.pdfezfill.com/v1/license/validate
 *   (Vercel edge function — zero server cost when not validating)
 */

import { db, sqlite } from './db-desktop.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import path from 'path';

const LICENSE_DB_PATH = process.env.LICENSE_KEY_PATH
  || path.join(process.cwd(), 'license.json');

const VALIDATION_ENDPOINT = process.env.LICENSE_VALIDATION_URL
  || 'https://api.pdfezfill.com/v1/license/validate';

export interface LicenseInfo {
  status: 'unactivated' | 'active' | 'expired' | 'invalid';
  licenseKey?: string;
  email?: string;
  plan?: string;
  expiresAt?: Date | null;
  activatedAt?: Date | null;
  daysUntilExpiry?: number | null;
}

// ─── Generate a license key (called by webhook handler on successful payment) ──
export function generateLicenseKey(): string {
  const bytes = crypto.randomBytes(10);
  const base32 = bytes.toString('hex').toUpperCase();
  // Format: PDFEZ-XXXX-XXXX-XXXX-XXXX
  return `PDFEZ-${base32.slice(0,4)}-${base32.slice(4,8)}-${base32.slice(8,12)}-${base32.slice(12,16)}`;
}

// ─── Activate a license key in the desktop app ────────────────────────────
export async function activateLicense(licenseKey: string, email: string): Promise<{
  success: boolean;
  message: string;
  info?: LicenseInfo;
}> {
  // Fail closed (defect 12): a NEW activation succeeds only when the remote
  // validation service positively validates the key with a well-formed,
  // unexpired response AND the result is stored locally. Every failure --
  // unreachable endpoint, non-200, unparseable/malformed body, expired key,
  // bad key format, storage error -- returns success:false and writes
  // nothing. A license stored by an earlier successful online validation is
  // unaffected and keeps working offline via getLicenseInfo().
  if (typeof licenseKey !== 'string' || typeof email !== 'string' || !email.trim()) {
    return { success: false, message: 'A license key and an email address are required.' };
  }

  const normalized = licenseKey.trim().toUpperCase();

  if (!normalized.match(/^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/)) {
    return { success: false, message: 'Invalid license key format. Keys look like: PDFEZ-XXXX-XXXX-XXXX-XXXX' };
  }

  // Remote validation (with 5s timeout). Network errors fail closed.
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    response = await fetch(VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: normalized, email }),
      signal: controller.signal,
    });
  } catch (err) {
    console.warn('[license] Remote validation unreachable:', err instanceof Error ? err.message : err);
    return {
      success: false,
      message: 'Could not reach the license validation service, so this key could not be validated. No license was activated. (A license already activated on this machine keeps working offline.)',
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return {
      success: false,
      message: `The license validation service returned an error (HTTP ${response.status}), so this key could not be validated. No license was activated.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      success: false,
      message: 'The license validation service returned a response that could not be understood. No license was activated.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || typeof (parsed as any).valid !== 'boolean') {
    return {
      success: false,
      message: 'The license validation service returned a malformed response. No license was activated.',
    };
  }

  const validationResult = parsed as { valid: boolean; plan?: unknown; expiresAt?: unknown; message?: unknown };

  if (!validationResult.valid) {
    return {
      success: false,
      message: typeof validationResult.message === 'string' && validationResult.message
        ? validationResult.message
        : 'License key not found or already used on another machine.',
    };
  }

  if (validationResult.plan !== undefined && validationResult.plan !== null
      && (typeof validationResult.plan !== 'string' || !validationResult.plan)) {
    return {
      success: false,
      message: 'The license validation service returned a malformed response. No license was activated.',
    };
  }

  // Expiry: a present expiresAt must parse to a real date, and a key that is
  // already expired is refused -- never stored.
  let expiresAt: number | null = null;
  if (validationResult.expiresAt !== undefined && validationResult.expiresAt !== null) {
    if (typeof validationResult.expiresAt !== 'string' && typeof validationResult.expiresAt !== 'number') {
      return {
        success: false,
        message: 'The license validation service returned a malformed expiry date. No license was activated.',
      };
    }
    const ms = new Date(validationResult.expiresAt as any).getTime();
    if (!Number.isFinite(ms)) {
      return {
        success: false,
        message: 'The license validation service returned a malformed expiry date. No license was activated.',
      };
    }
    expiresAt = Math.floor(ms / 1000);
    if (expiresAt <= Math.floor(Date.now() / 1000)) {
      return { success: false, message: 'This license key has expired. No license was activated.' };
    }
  }

  // Store in SQLite with bound parameters only (defect 13): user-controlled
  // values (key, email, plan) are never interpolated into SQL, and a storage
  // error is returned as a typed failure instead of crashing the process.
  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    sqlite.prepare(`
      INSERT OR REPLACE INTO license (id, license_key, activated_at, activated_email, expires_at, plan, validation_status, last_validated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, normalized, nowSeconds, email, expiresAt, (validationResult.plan as string) || 'lifetime', 'active', nowSeconds);
  } catch (err) {
    console.error('[license] Failed to store validated license:', err);
    return {
      success: false,
      message: 'The license was validated but could not be stored on this machine. No license was activated.',
    };
  }

  const info = getLicenseInfo();
  return { success: true, message: 'License activated successfully!', info };
}

// ─── Read current license state from local SQLite ────────────────────────
export function getLicenseInfo(): LicenseInfo {
  try {
    const row = sqlite.prepare('SELECT * FROM license WHERE id = 1').get() as any;

    if (!row || row.validation_status === 'unactivated' || !row.license_key) {
      return { status: 'unactivated' };
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = row.expires_at && row.expires_at < now;

    if (isExpired) {
      return {
        status: 'expired',
        licenseKey: row.license_key,
        email: row.activated_email,
        plan: row.plan,
        expiresAt: new Date(row.expires_at * 1000),
        activatedAt: new Date(row.activated_at * 1000),
        daysUntilExpiry: 0,
      };
    }

    return {
      status: 'active',
      licenseKey: row.license_key,
      email: row.activated_email,
      plan: row.plan,
      expiresAt: row.expires_at ? new Date(row.expires_at * 1000) : null,
      activatedAt: new Date(row.activated_at * 1000),
      daysUntilExpiry: row.expires_at
        ? Math.ceil((row.expires_at - now) / 86400)
        : null,
    };
  } catch {
    return { status: 'unactivated' };
  }
}

// ─── Check if app is licensed (used as middleware gate) ───────────────────
export function isLicensed(): boolean {
  const info = getLicenseInfo();
  return info.status === 'active';
}

// ─── Grace period: allow 3 trial PDFs without license ────────────────────
export function getTrialUsageCount(): number {
  // Defect 10: trial is consumed only when a form's processing completes
  // successfully. In this codebase that is status 'ready' (OCR finished);
  // 'completed' forms passed through 'ready' before generation, so they
  // still count. Upload attempts, in-flight 'processing' forms, and failed
  // ('error') forms never consume trial.
  try {
    const row = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM forms WHERE user_id = ? AND status IN ('ready', 'completed')"
    ).get('local-user') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
}

// Forms whose processing has started but not yet resolved. Used only by the
// fill-entitlement gate so parallel in-flight fills cannot oversubscribe the
// trial; they do NOT count as trial usage (see getTrialUsageCount).
export function getPendingFormCount(): number {
  try {
    const row = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM forms WHERE user_id = ? AND status IN ('processing', 'uploaded')"
    ).get('local-user') as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
}

// Defect 11 helper: is this existing form inside the trial allowance?
// A form that has not successfully processed yet consumes nothing, so it is
// allowed (its generate/download cannot produce value before 'ready', and
// once it is 'ready' this same check applies). A 'ready'/'completed' form
// is allowed iff it is among the first TRIAL_LIMIT successfully processed
// forms (by insertion order). Unknown form ids are allowed through so the
// route handler can answer 404. Fails closed on a storage error.
export function isFormWithinTrial(formId: string): boolean {
  try {
    const self = sqlite.prepare(
      'SELECT rowid AS rid, status FROM forms WHERE id = ?'
    ).get(formId) as any;
    if (!self) return true;
    if (self.status !== 'ready' && self.status !== 'completed') return true;
    const prior = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM forms WHERE user_id = ? AND status IN ('ready', 'completed') AND rowid < ?"
    ).get('local-user', self.rid) as any;
    return (prior?.cnt ?? 0) < TRIAL_LIMIT;
  } catch {
    return false;
  }
}

export const TRIAL_LIMIT = 3;

export function isWithinTrial(): boolean {
  return getTrialUsageCount() < TRIAL_LIMIT;
}
