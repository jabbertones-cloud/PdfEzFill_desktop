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
import { getLicenseInfo, isWithinTrial, getTrialUsageCount, getPendingFormCount, isFormWithinTrial, TRIAL_LIMIT } from './licenseService.js';

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

// Fill-chain gate (defect 11): the entitlement decision that isAuthenticated
// applies to read routes also applies to the fill chain itself
// (upload/process/generate/download). A fill may proceed only if a valid
// license is active or trial usage remains. Blocked fills get the same
// 402 shape as the existing gated routes, before any work is done.
// - New fill (no formId): allowed while successful trial usage plus
//   in-flight forms stays below the limit, so parallel fills cannot
//   oversubscribe the trial.
// - Existing form: allowed while that form is itself within the trial
//   allowance (see isFormWithinTrial), so a trial user can finish fills
//   1-3 end to end even though the 3rd success exhausts the count.
export function requireFillEntitlement(req: Request, res: Response, next: NextFunction): void {
  (req as any).user = LOCAL_USER;

  const license = getLicenseInfo();
  if (license.status === 'active') {
    return next();
  }

  const formId = (req.params as any)?.formId as string | undefined;
  const allowed = formId
    ? isFormWithinTrial(formId)
    : getTrialUsageCount() + getPendingFormCount() < TRIAL_LIMIT;

  if (!allowed) {
    res.status(402).json({
      message: 'Trial limit reached',
      requiresLicense: true,
      trialExpired: true,
    });
    return;
  }

  next();
}
