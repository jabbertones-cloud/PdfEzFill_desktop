/**
 * Desktop database layer — SQLite via Drizzle (replaces NeonDB/Postgres)
 *
 * Drop-in replacement for server/db.ts.
 * All existing storage.ts code works unchanged; just import from this file.
 *
 * Database location: $SQLITE_DB_PATH env var (set by Electron main)
 *   - Dev fallback: ./pdfezfill-dev.db
 *   - Production: ~/Library/Application Support/PdfEzFill/pdfezfill.db
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../shared/schema-sqlite.js';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.SQLITE_DB_PATH
  || path.join(process.cwd(), 'pdfezfill-dev.db');

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open SQLite database with WAL mode for better concurrent read performance
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

export const db = drizzle(sqlite, { schema });

// Run migrations on startup
export async function runDesktopMigrations(): Promise<void> {
  const migrationsFolder = path.join(
    process.env.APP_ROOT || process.cwd(),
    'server', 'migrations-sqlite'
  );

  if (fs.existsSync(migrationsFolder)) {
    try {
      migrate(db, { migrationsFolder });
      console.log('[db] SQLite migrations applied');
    } catch (err) {
      console.error('[db] Migration error:', err);
      // Fall through — schema may already exist
    }
  } else {
    // No migrations folder — run inline schema creation
    runInlineSchema();
  }
}

function runInlineSchema(): void {
  sqlite.exec(`
    -- ── Users ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      profile_image_url TEXT,
      plan_type TEXT NOT NULL DEFAULT 'none',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      subscription_status TEXT,
      subscription_start_date INTEGER,
      current_period_end INTEGER,
      forms_included_per_month INTEGER DEFAULT 0,
      default_profile_id TEXT,
      is_admin INTEGER DEFAULT 0,
      inactivity_email_sent INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Profiles ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      label TEXT DEFAULT 'Default',
      is_default INTEGER DEFAULT 0,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      date_of_birth TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      employer TEXT,
      job_title TEXT,
      ssn TEXT,
      drivers_license TEXT,
      signature_data TEXT,
      custom_fields TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Forms ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      guest_email TEXT,
      profile_id TEXT REFERENCES profiles(id),
      original_pdf_path TEXT NOT NULL,
      generated_pdf_path TEXT,
      file_name TEXT NOT NULL,
      original_file_name TEXT,
      page_count INTEGER DEFAULT 1,
      field_schema TEXT,
      field_overrides TEXT,
      answers TEXT,
      signature_data TEXT,
      status TEXT NOT NULL DEFAULT 'uploaded',
      ocr_confidence REAL,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      is_paid INTEGER DEFAULT 0,
      payment_type TEXT,
      payment_amount INTEGER,
      stripe_payment_id TEXT,
      stripe_session_id TEXT,
      parent_form_id TEXT,
      is_regeneration INTEGER DEFAULT 0,
      expires_at INTEGER,
      abandonment_email_sent INTEGER,
      expiry_reminder_sent INTEGER,
      matched_template_id TEXT,
      template_match_confidence REAL,
      created_at INTEGER DEFAULT (unixepoch()),
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS IDX_forms_user_id ON forms(user_id);
    CREATE INDEX IF NOT EXISTS IDX_forms_status ON forms(status, created_at);

    -- ── Usage tracking ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      forms_used INTEGER DEFAULT 0,
      forms_included INTEGER DEFAULT 2,
      overage_forms_purchased INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Payments ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      form_id TEXT REFERENCES forms(id),
      stripe_payment_intent_id TEXT,
      stripe_session_id TEXT,
      stripe_price_id TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'usd',
      type TEXT NOT NULL DEFAULT 'desktop_license',
      status TEXT DEFAULT 'completed',
      refunded_at INTEGER,
      refund_reason TEXT,
      refunded_by TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Admin logs ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Detected fields ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS detected_fields (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      field_type TEXT NOT NULL,
      bbox_x REAL NOT NULL,
      bbox_y REAL NOT NULL,
      bbox_width REAL NOT NULL,
      bbox_height REAL NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.0,
      state TEXT,
      label TEXT,
      subtype TEXT,
      page INTEGER NOT NULL DEFAULT 0,
      detection_method TEXT NOT NULL DEFAULT 'opencv',
      user_verified INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS IDX_detected_fields_form ON detected_fields(form_id);

    -- ── Email (stubs — no-ops in desktop) ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      html_content TEXT,
      type TEXT DEFAULT 'transactional',
      trigger_event TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS email_sequences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_event TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS email_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      to_email TEXT NOT NULL,
      subject TEXT,
      html_content TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_at INTEGER,
      sent_at INTEGER,
      error_message TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS email_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT NOT NULL,
      transactional_enabled INTEGER DEFAULT 1,
      marketing_enabled INTEGER DEFAULT 1,
      onboarding_enabled INTEGER DEFAULT 1,
      notifications_enabled INTEGER DEFAULT 1,
      unsubscribe_token TEXT,
      unsubscribed_at INTEGER,
      unsubscribe_reason TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Region indexes (template learning) ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS region_indexes (
      id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL,
      region_label TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      relative_position TEXT,
      confidence REAL NOT NULL DEFAULT 0.85,
      variant_tolerance REAL NOT NULL DEFAULT 0.15,
      field_schema TEXT NOT NULL DEFAULT '[]',
      relationships TEXT NOT NULL DEFAULT '[]',
      layout_signature TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      was_corrected_count INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_region_layout_sig ON region_indexes(layout_signature);

    CREATE TABLE IF NOT EXISTS region_match_history (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      region_index_id TEXT NOT NULL REFERENCES region_indexes(id) ON DELETE CASCADE,
      match_confidence REAL NOT NULL,
      match_method TEXT,
      was_corrected INTEGER DEFAULT 0,
      correction_data TEXT,
      page_number INTEGER,
      detected_region_bounds TEXT,
      expected_region_bounds TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS region_detection_cache (
      id TEXT PRIMARY KEY,
      document_hash TEXT NOT NULL UNIQUE,
      document_type TEXT,
      region_indexes TEXT NOT NULL DEFAULT '[]',
      cache_confidence REAL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Batch fill jobs ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS batch_fill_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'processing',
      data_row_count INTEGER NOT NULL DEFAULT 0,
      columns_mapped TEXT NOT NULL DEFAULT '{}',
      completed_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      output_zip_url TEXT,
      error_message TEXT,
      progress_percent INTEGER DEFAULT 0,
      estimated_seconds_remaining INTEGER,
      started_at INTEGER DEFAULT (unixepoch()),
      completed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ── Form templates ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS form_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      layout_hash TEXT NOT NULL UNIQUE,
      field_count INTEGER NOT NULL DEFAULT 0,
      field_schema TEXT NOT NULL DEFAULT '[]',
      example_form_id TEXT REFERENCES forms(id) ON DELETE SET NULL,
      usage_count INTEGER DEFAULT 0,
      last_used_at INTEGER,
      match_success_count INTEGER DEFAULT 0,
      match_failure_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_form_templates_layout ON form_templates(layout_hash);

    -- ── E-sign audit ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS esign_audit_logs (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id),
      user_id TEXT REFERENCES users(id),
      guest_email TEXT,
      signer_name TEXT,
      signer_ip TEXT NOT NULL,
      user_agent TEXT,
      original_document_hash TEXT NOT NULL,
      signed_document_hash TEXT,
      signed_at TEXT NOT NULL,
      signature_method TEXT NOT NULL DEFAULT 'draw',
      consent_statement TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- ── License ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY DEFAULT 1,
      license_key TEXT,
      activated_at INTEGER,
      activated_email TEXT,
      expires_at INTEGER,
      plan TEXT DEFAULT 'lifetime',
      validation_status TEXT DEFAULT 'unactivated',
      last_validated_at INTEGER
    );

    -- ── Seed default local user ─────────────────────────────────────────────
    INSERT OR IGNORE INTO users (id, email, first_name, last_name, plan_type, is_admin, created_at, updated_at)
    VALUES ('local-user', 'local@pdfezfill.app', 'Local', 'User', 'pro', 1, unixepoch(), unixepoch());
  `);
  console.log('[db] Inline SQLite schema created');
}

export { sqlite };
