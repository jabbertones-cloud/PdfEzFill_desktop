#!/usr/bin/env node
/**
 * Local stub of the license validation endpoint for test-mode development.
 *
 * Implements the contract documented in docs/LICENSING.md:
 *   POST /v1/license/validate  { licenseKey, email }
 *     → { valid, plan?, expiresAt?, message? }
 *
 * Behavior:
 *   - well-formed PDFEZ-… key  → { valid: true, plan: "lifetime" }
 *   - PDFEZ-FFFF-FFFF-FFFF-FFFF → { valid: false, message: "expired fixture" }
 *     plus an expired-license fixture at PDFEZ-EEEE-EEEE-EEEE-EEEE
 *   - anything else             → { valid: false }
 *
 * Binds to 127.0.0.1 only. No dependencies.
 *
 * Usage:
 *   node scripts/license-stub.mjs
 *   LICENSE_VALIDATION_URL=http://127.0.0.1:8787/v1/license/validate <app>
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.LICENSE_STUB_PORT || 8787);
const KEY_RE = /^PDFEZ-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/license/validate') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: false, message: 'not found (stub)' }));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let key = '';
    try { key = String(JSON.parse(body || '{}').licenseKey || '').trim().toUpperCase(); }
    catch { /* fall through to invalid */ }

    let out;
    if (key === 'PDFEZ-FFFF-FFFF-FFFF-FFFF') {
      out = { valid: false, message: 'License key not found or already used on another machine.' };
    } else if (key === 'PDFEZ-EEEE-EEEE-EEEE-EEEE') {
      out = { valid: true, plan: 'pro', expiresAt: new Date(Date.now() - 86400000).toISOString() };
    } else if (KEY_RE.test(key)) {
      out = { valid: true, plan: 'lifetime', expiresAt: null };
    } else {
      out = { valid: false, message: 'Invalid license key format. Keys look like: PDFEZ-XXXX-XXXX-XXXX-XXXX' };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[license-stub] listening on http://127.0.0.1:${PORT}/v1/license/validate`);
});
