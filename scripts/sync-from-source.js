#!/usr/bin/env node
/**
 * sync-from-source.js
 *
 * Copies all server/client/shared files from PdfEzFill/ into pdfezfill_desktop/
 * so the desktop app is self-contained.
 *
 * Desktop-specific files in pdfezfill_desktop/server/ are kept (they override
 * the source equivalents).
 *
 * Usage:
 *   node scripts/sync-from-source.js
 *   # or add to package.json: "sync": "node scripts/sync-from-source.js"
 */

import { cp, rm, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.join(__dirname, '..');
const SOURCE_ROOT = path.join(DESKTOP_ROOT, '..', 'PdfEzFill');

// Files in pdfezfill_desktop/server/ that override the source versions
// (Do NOT overwrite these with the source copies)
const DESKTOP_OVERRIDES = new Set([
  'db.ts',               // Re-exports SQLite db instead of Postgres
  'db-desktop.ts',
  'desktopAuth.ts',
  'emailAutomation-desktop.ts',
  'index-desktop.ts',
  'licenseRoutes.ts',
  'licenseService.ts',
  'objectStorageService-local.ts',
]);

async function sync() {
  console.log('=== PdfEzFill Desktop Source Sync ===');
  console.log(`Source: ${SOURCE_ROOT}`);
  console.log(`Destination: ${DESKTOP_ROOT}`);

  // ── Sync server/ ─────────────────────────────────────────────────────────
  const srcServer = path.join(SOURCE_ROOT, 'server');
  const dstServer = path.join(DESKTOP_ROOT, 'server');

  console.log('\n[server/] Syncing server files...');
  const serverFiles = await readdir(srcServer);

  let copied = 0, skipped = 0;
  for (const file of serverFiles) {
    if (DESKTOP_OVERRIDES.has(file)) {
      console.log(`  SKIP (desktop override): ${file}`);
      skipped++;
      continue;
    }
    // Skip index.ts (use index-desktop.ts instead)
    if (file === 'index.ts') {
      console.log(`  SKIP (replaced by index-desktop.ts): ${file}`);
      skipped++;
      continue;
    }
    // Skip Replit-specific files
    if (file === 'replitAuth.ts' || file === 'stripe-replit-sync.ts') {
      console.log(`  SKIP (Replit-specific): ${file}`);
      skipped++;
      continue;
    }

    const src = path.join(srcServer, file);
    const dst = path.join(dstServer, file);
    await cp(src, dst, { recursive: true });
    copied++;
  }
  console.log(`  Copied: ${copied}, Skipped: ${skipped}`);

  // ── Sync shared/ ─────────────────────────────────────────────────────────
  const srcShared = path.join(SOURCE_ROOT, 'shared');
  const dstShared = path.join(DESKTOP_ROOT, 'shared');
  const SHARED_OVERRIDES = new Set([
    'schema.ts',        // Desktop re-exports from schema-sqlite.ts (not Postgres)
    'schema-sqlite.ts', // SQLite-specific schema, desktop only
  ]);
  if (existsSync(srcShared)) {
    await mkdir(dstShared, { recursive: true });
    const sharedFiles = await (await import('fs/promises')).readdir(srcShared);
    let sharedCopied = 0, sharedSkipped = 0;
    for (const file of sharedFiles) {
      if (SHARED_OVERRIDES.has(file)) {
        console.log(`  SKIP (desktop override): shared/${file}`);
        sharedSkipped++;
        continue;
      }
      await cp(path.join(srcShared, file), path.join(dstShared, file), { recursive: true });
      sharedCopied++;
    }
    console.log(`\n[shared/] Synced: ${sharedCopied} copied, ${sharedSkipped} skipped`);
  }

  // ── Sync client/ (React frontend) ────────────────────────────────────────
  const srcClient = path.join(SOURCE_ROOT, 'client');
  const dstClient = path.join(DESKTOP_ROOT, 'client');
  if (existsSync(srcClient)) {
    await mkdir(dstClient, { recursive: true });
    await cp(srcClient, dstClient, { recursive: true, force: true });
    console.log('[client/] Synced React frontend');
  }

  // ── Sync assets/ ─────────────────────────────────────────────────────────
  const srcAssets = path.join(SOURCE_ROOT, 'assets');
  const dstAssets = path.join(DESKTOP_ROOT, 'assets');
  if (existsSync(srcAssets)) {
    await mkdir(dstAssets, { recursive: true });
    await cp(srcAssets, dstAssets, { recursive: true, force: true });
    console.log('[assets/] Synced assets');
  }

  // ── Sync tsconfig.json ───────────────────────────────────────────────────
  const srcTsc = path.join(SOURCE_ROOT, 'tsconfig.json');
  const dstTsc = path.join(DESKTOP_ROOT, 'tsconfig.json');
  if (existsSync(srcTsc) && !existsSync(dstTsc)) {
    await cp(srcTsc, dstTsc);
    console.log('[tsconfig.json] Copied (was missing)');
  }

  console.log('\n✓ Sync complete. Run "npm install" then "npm run dev" to start.');
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
