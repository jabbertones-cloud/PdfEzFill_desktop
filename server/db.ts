/**
 * Desktop db.ts — re-exports the SQLite database as a drop-in for the Postgres db.ts
 *
 * storage.ts imports `db` from "./db" — in the desktop app that's THIS file,
 * which provides the SQLite-backed Drizzle instance from db-desktop.ts.
 *
 * Added to DESKTOP_OVERRIDES in sync-from-source.js so it's never overwritten.
 */

export { db, sqlite, runDesktopMigrations } from './db-desktop.js';

// Stub pool for any code that tries to import pool
export const pool = {
  query: async () => ({ rows: [] }),
  end: async () => {},
};
