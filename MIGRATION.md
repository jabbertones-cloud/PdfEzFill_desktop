# PdfEzFill Desktop Migration Guide

This guide covers the conversion from the web-based PdfEzFill application to a desktop application using Electron and SQLite, with integrated licensing and local file storage.

## Overview

The desktop version consolidates the PdfEzFill application into a single binary with the following changes:

- **Database**: Neon PostgreSQL → SQLite3 (local, bundled with app)
- **Authentication**: better-auth with OAuth/email login → Lightweight desktop auth with license keys
- **Storage**: Replit Object Storage → Local filesystem storage
- **Backend**: Express server running on localhost (hidden from user)
- **Revenue Model**: Stripe one-time purchase → License key activation
- **UI**: React SPA (no changes needed to client code)

## Removed Dependencies

The following dependencies are removed in the desktop version because they are no longer needed:

| Package | Reason |
|---------|--------|
| `@replit/object-storage` | Desktop uses local filesystem storage via `objectStorageService-local.ts` |
| `stripe-replit-sync` | Not needed; Stripe integration is simplified to one-time purchase + email delivery |
| `@replit/vite-plugin-cartographer` | Replit-specific plugin for the web IDE |
| `@replit/vite-plugin-dev-banner` | Replit-specific plugin for dev notifications |
| `@replit/vite-plugin-runtime-error-modal` | Replit-specific plugin for error overlay |
| `@better-auth/drizzle-adapter` | Authentication model changed; see `server/desktopAuth.ts` |
| `better-auth` | Replaced with lightweight `desktopAuth.ts` using JWT + license keys |
| `@neondatabase/serverless` | SQLite is bundled; no external database needed |
| `ws` | WebSocket server not needed for local Electron app |
| `connect-pg-simple` | Session storage for Postgres; SQLite uses in-memory sessions |
| `passport` | Simplified auth model; no OAuth or multi-strategy login |
| `passport-local` | Auth handled by license key + optional email verification |
| `express-session` | Sessions managed by Electron's IPC, not Express |
| `express-rate-limit` | Not needed in local-only context |
| `memorystore` | Using SQLite instead |
| `mailersend` | Not used; Stripe sends the license email |
| `resend` | Not used; Stripe/email integration removed from desktop app |
| `react-ga4` | No analytics in desktop version |

**Important**: These removals are clean. The desktop app does not require any of these packages, and they are never imported.

## Required File Changes in PdfEzFill Repo

If you are converting the existing PdfEzFill repository to work with the desktop build, these three files must be replaced/created:

### 1. `server/db-desktop.ts` (replaces `server/db.ts`)

Create a new file `server/db-desktop.ts`:

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';

const dbPath = path.join(process.env.DATA_DIR || './data', 'pdfezfill.db');
const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
```

Also update `server/db.ts` to conditionally export based on environment:

```typescript
// At the top of server/db.ts
if (process.env.DESKTOP_MODE === 'true') {
  export { db } from './db-desktop';
} else {
  // Original Neon export
  export const db = getOriginalDb();
}
```

### 2. `server/index-desktop.ts` (replaces `server/index.ts` for desktop mode)

A slimmed-down version of the Express server is already created in `/pdfezfill_desktop/server/index-desktop.ts`. This version:

- Runs on localhost:3000 (controlled by Electron)
- Does NOT serve static files (Electron renderer handles this)
- Does NOT require session management or OAuth
- Does require license key validation middleware
- Routes: `/api/pdf/*`, `/api/auth/activate`, `/api/stripe/webhook` (if needed)

The desktop app will:
1. Start the server before loading the UI
2. Make IPC calls to the server (not HTTP)
3. Check for license key in local storage

### 3. `server/objectStorageService-local.ts` (replaces `server/objectStorageService.ts`)

Already created. Handles file uploads/downloads to `~/.pdfezfill-data/uploads/`.

## Import Changes in `server/routes.ts`

Update the import statements in `server/routes.ts` to point to the desktop-specific implementations:

### Change 1: Authentication imports

**Before:**
```typescript
import { setupAuth, isAuthenticated, optionalAuth } from './betterAuthMiddleware';
import { generateApiToken } from './jwtAuth';
```

**After:**
```typescript
import { setupAuth, isAuthenticated, optionalAuth } from './desktopAuth';
import { generateApiToken } from './desktopAuth';
```

### Change 2: Object storage imports

**Before:**
```typescript
import { uploadPdf, downloadPdf, downloadPageImage } from './objectStorageService';
```

**After:**
```typescript
import { uploadPdf, downloadPdf, downloadPageImage } from './objectStorageService-local';
```

### Change 3: Optional - Environment check

At the top of `server/index.ts`, add a mode check:

```typescript
if (!process.env.DESKTOP_MODE && process.env.NODE_ENV === 'production') {
  console.error('DESKTOP_MODE not set. Use index-desktop.ts for desktop builds.');
  process.exit(1);
}
```

## Build & Development Workflow

### Development Mode

Run both the main process and renderer in parallel:

```bash
npm run dev
```

This runs:
- `npm run dev:main` — TypeScript watcher for Electron main process
- `npm run dev:renderer` — Vite dev server for React UI (http://localhost:5173)

The Electron main process loads `file:///path/to/dist/renderer/index.html` in production and `http://localhost:5173` in development.

### Development Server Only

If you want to develop the server separately (for testing routes):

```bash
npm run dev:server
```

This starts the Express backend on `http://localhost:3000` (or `process.env.PORT`).

### Production Build

Build all components:

```bash
npm run build
```

This produces:
- `dist/electron/main/main.js` — Compiled Electron main process
- `dist/renderer/` — Compiled React UI (standalone HTML/CSS/JS)
- `dist/server/` — Compiled backend (if build.ts is configured)

### Package for macOS

Create a DMG installer:

```bash
npm run dmg:local
```

Output: `release/PdfEzFill-1.0.0-arm64.dmg` (or x64)

To publish to GitHub releases (requires `GITHUB_TOKEN`):

```bash
npm run dmg
```

## License Key Flow

The desktop app uses a Stripe → License Key → Local Activation model:

### Customer Flow

1. **Customer visits website** (e.g., pdfezfill.com/desktop)
2. **Clicks "Buy Desktop"** — Stripe checkout for $29.99 one-time
3. **Stripe processes payment** — Creates charge, sends email with:
   - License key (e.g., `EZFILL-XXXX-XXXX-XXXX`)
   - Download link to `release/PdfEzFill-1.0.0-arm64.dmg`
   - Activation instructions
4. **Customer downloads & installs** the DMG
5. **Launches PdfEzFill desktop**
6. **Pastes license key** into the activation screen
7. **App validates key** against Stripe API (or local signature)
8. **App unlocks** — can now use full feature set

### Backend Implementation

**License Activation Endpoint** (`server/licenseRoutes.ts`):

```typescript
POST /api/auth/activate
{
  "licenseKey": "EZFILL-XXXX-XXXX-XXXX",
  "email": "user@example.com"
}

Response:
{
  "success": true,
  "licenseKey": "EZFILL-XXXX-XXXX-XXXX",
  "expiresAt": "2027-03-12T00:00:00Z",
  "features": ["pdf-fill", "field-detection", "batch-processing"]
}
```

**License Validation Middleware** (`server/desktopAuth.ts`):

```typescript
export function isLicensed(req, res, next) {
  const licenseKey = req.headers['x-license-key'];
  if (!licenseKey || !validateLicense(licenseKey)) {
    return res.status(401).json({ error: 'Invalid license' });
  }
  next();
}
```

**UI Implementation** (`client/src/pages/Activate.tsx`):

1. Check if license key exists in localStorage
2. If not, show activation screen
3. User enters license key
4. POST to `/api/auth/activate`
5. Store response in localStorage
6. Reload app
7. Main UI shows, with license info in settings

### License Validation Options

**Option A: Stripe API lookup** (recommended for flexibility)
- Every launch, validate against Stripe
- Requires internet connection
- Can revoke licenses remotely
- Implementation: See `server/licenseService.ts`

**Option B: JWT signature** (recommended for offline)
- License key is a JWT signed by server
- Verify signature locally (no internet needed)
- Cannot revoke (only if you include expiry date)
- Implementation: Use `jsonwebtoken` to verify

**Option C: Hybrid** (recommended)
- Use JWT signature for local validation (works offline)
- Ping Stripe on startup if online (detects revocation)
- Graceful fallback if Stripe unreachable

Current implementation in `server/licenseService.ts` uses **Stripe + JWT hybrid**.

## Environment Variables

Set these in `.env` for desktop builds:

```bash
# Desktop mode flag
DESKTOP_MODE=true

# Local data directory (default: ~/.pdfezfill-data)
DATA_DIR=/Users/you/.pdfezfill-data

# Backend port (default: 3000)
PORT=3000

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OAuth (optional, for online account linking)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Apple notarization (for macOS signing)
APPLE_ID=your-apple-id@example.com
APPLE_ID_PASSWORD=app-specific-password
APPLE_TEAM_ID=XXXXXXXXXX

# Sentry (optional, for crash reporting)
SENTRY_DSN=https://...
```

## File Structure

```
pdfezfill_desktop/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Preload script for IPC
│   └── types.ts             # Type definitions
├── server/
│   ├── index-desktop.ts     # Express backend (desktop mode)
│   ├── db-desktop.ts        # SQLite database setup
│   ├── desktopAuth.ts       # License key auth
│   ├── licenseService.ts    # License validation (Stripe + JWT)
│   ├── licenseRoutes.ts     # /api/auth/activate endpoint
│   ├── objectStorageService-local.ts  # Local file storage
│   └── routes.ts            # All API routes (shared with web)
├── client/                  # React app (from PdfEzFill)
│   └── src/
│       ├── pages/
│       │   └── Activate.tsx # License activation page
│       └── ...
├── dist/                    # Build output
│   ├── electron/main/       # Compiled main process
│   └── renderer/            # Compiled React UI
├── scripts/
│   └── notarize.js          # macOS notarization (post-build)
├── assets/                  # App icon, etc.
├── package.json             # Desktop-specific deps
├── tsconfig.main.json       # Electron main TS config
├── vite.renderer.config.ts  # Vite config for UI
├── electron-builder.yml     # DMG/installer config
├── entitlements.mac.plist   # macOS security entitlements
├── MIGRATION.md             # This file
└── README.md                # Getting started
```

## Testing the Build

### 1. Test in development

```bash
npm run dev
# Opens Electron window with hot-reload
```

### 2. Test the production build locally

```bash
npm run build
npm start
# Loads from dist/ (not localhost:5173)
```

### 3. Test the DMG installer

```bash
npm run dmg:local
# Creates release/PdfEzFill-1.0.0-arm64.dmg
# Manually test: drag to Applications, launch, activate license
```

## Troubleshooting

### "Port 3000 already in use"
- Change `PORT` in `.env` or kill the existing process
- The main process will automatically start the backend on the new port

### "SQLite database locked"
- Only one instance of the app can run at a time
- On desktop, this is enforced by Electron's single-instance lock

### "License key not recognized"
- Check that `STRIPE_SECRET_KEY` is set correctly
- Verify the license key format matches what Stripe generated
- Check `server/licenseService.ts` for validation logic

### "DMG won't sign on Apple Silicon"
- Ensure `@electron/rebuild` runs: `npm run build:main` compiles native modules
- If `better-sqlite3` fails: `npm install --build-from-source`

### "Activation screen appears on every launch"
- License key not persisting in localStorage
- Check browser DevTools → Application → Local Storage
- Verify `desktopAuth.ts` is calling `localStorage.setItem('licenseKey', ...)`

## Next Steps

1. **Run the development build**: `npm run dev`
2. **Test license activation** with a test Stripe key
3. **Customize the activation UI** in `client/src/pages/Activate.tsx`
4. **Add crash reporting** (optional): Integrate Sentry or similar
5. **Set up CI/CD** for automated DMG builds and GitHub releases
6. **Test offline mode** to ensure license validation works without internet

## Support

For issues with the conversion:
- Check existing files in `pdfezfill_desktop/server/` (already implemented)
- Review Electron docs: https://www.electronjs.org/docs
- Review electron-builder: https://www.electron.build/

For Stripe integration questions:
- See `server/licenseService.ts` for current implementation
- Stripe webhook route is at `/api/stripe/webhook`
