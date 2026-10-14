/**
 * Desktop auth bypass — replaces all auth middleware
 *
 * In the Mac app there is one user: 'local-user'.
 * No login, no sessions, no JWT.
 *
 * Usage in routes.ts: replace ALL auth imports with this file.
 *
 *   // BEFORE (SaaS):
 *   import { setupAuth, isAuthenticated, optionalAuth } from './betterAuthMiddleware';
 *   import { generateApiToken } from './jwtAuth';
 *
 *   // AFTER (Desktop):
 *   import { setupAuth, isAuthenticated, optionalAuth, generateApiToken } from './desktopAuth';
 */

import type { Request, Response, NextFunction, Express } from 'express';
import { getLicenseInfo, isWithinTrial } from './licenseService.js';

const LOCAL_USER = {
  id: 'local-user',
  email: 'local@pdfezfill.app',
  firstName: 'Local',
  lastName: 'User',
  planType: 'pro' as const,
  isAdmin: true,
  claims: { sub: 'local-user' },
};

// Attach local user to every request
function attachLocalUser(req: Request, _res: Response, next: NextFunction): void {
  (req as any).user = LOCAL_USER;
  next();
}

// Replaces betterAuthMiddleware.setupAuth
export function setupAuth(app: Express): void {
  app.use(attachLocalUser);
}

// Replaces isAuthenticated — always passes, but checks license gate
export function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  (req as any).user = LOCAL_USER;

  // License gate: allow if licensed OR within trial
  const license = getLicenseInfo();
  if (license.status !== 'active' && !isWithinTrial()) {
    // Trial expired — still let them through to /api/license routes
    if (req.path.startsWith('/api/license') || req.path.startsWith('/api/stripe')) {
      return next();
    }
    res.status(402).json({
      message: 'Trial limit reached',
      requiresLicense: true,
      trialExpired: true,
    });
    return;
  }

  next();
}

// Replaces optionalAuth — always attaches local user
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  (req as any).user = LOCAL_USER;
  next();
}

// Replaces generateApiToken — returns a static local token (unused in desktop mode)
export function generateApiToken(_userId: string): string {
  return 'desktop-local-token';
}

// Replaces requireAdmin — local user is always admin
export function requireAdmin(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
