/**
 * Desktop schema.ts — re-exports all types and tables from schema-sqlite.ts
 *
 * This file is protected from sync-from-source.js overwrite (shared/schema.ts is
 * in the shared DESKTOP_OVERRIDES list). The source PdfEzFill/shared/schema.ts
 * uses Postgres pgTable; this desktop version uses SQLite sqliteTable.
 *
 * storage.ts imports from "@shared/schema" → resolves here in pdfezfill_desktop.
 */

export * from './schema-sqlite.js';
