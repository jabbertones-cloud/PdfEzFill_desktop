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
  const normalized = licenseKey.trim().toUpperCase();

  if (!normalized.match(/^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/)) {
    return { success: false, message: 'Invalid license key format. Keys look like: PDFEZ-XXXX-XXXX-XXXX-XXXX' };
  }

  // Try remote validation (with 5s timeout)
  let validationResult: { valid: boolean; plan?: string; expiresAt?: string; message?: string } | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: normalized, email }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      validationResult = await response.json();
    }
  } catch (err) {
    // Network unavailable — allow offline activation for lifetime licenses
    console.warn('[license] Remote validation unavailable, allowing offline activation');
    validationResult = { valid: true, plan: 'lifetime', message: 'Offline activation' };
  }

  if (!validationResult?.valid) {
    return {
      success: false,
      message: validationResult?.message || 'License key not found or already used on another machine.',
    };
  }

  const expiresAt = validationResult.expiresAt
    ? Math.floor(new Date(validationResult.expiresAt).getTime() / 1000)
    : null;

  // Store in SQLite
  sqlite.exec(`
    INSERT OR REPLACE INTO license (id, license_key, activated_at, activated_email, expires_at, plan, validation_status, last_validated_at)
    VALUES (1, '${normalized}', ${Math.floor(Date.now()/1000)}, '${email}', ${expiresAt ?? 'NULL'}, '${validationResult.plan || 'lifetime'}', 'active', ${Math.floor(Date.now()/1000)})
  `);

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
  try {
    const row = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM forms WHERE user_id = 'local-user'"
    ).get() as any;
    return row?.cnt ?? 0;
  } catch { return 0; }
}

export const TRIAL_LIMIT = 3;

export function isWithinTrial(): boolean {
  return getTrialUsageCount() < TRIAL_LIMIT;
}
