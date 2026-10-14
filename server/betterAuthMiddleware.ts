/**
 * Portable BetterAuth middleware — drop-in replacement for replitAuth.ts.
 *
 * Provides:
 *   setupAuth(app)    — mounts BetterAuth handler at /api/auth/*
 *   isAuthenticated   — middleware that requires a valid session (401 on fail)
 *   optionalAuth      — middleware that attaches session if present, continues either way
 *
 * Compatibility shim: sets req.user = { claims: { sub: userId } } so existing
 * routes that call getUserId(req) continue to work unchanged.
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./betterAuthConfig";
import { storage } from "./storage";
import { triggerEmailByEvent } from "./emailAutomation";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      claims?: { sub?: string };
      betterAuthUserId?: string;
    }
  }
}

async function resolveLegacyUserId(baEmail: string, baUserId: string): Promise<string> {
  // Find or create the existing-users-table record keyed by email
  const existing = await storage.getUserByEmail(baEmail).catch(() => null);
  if (existing?.id) return existing.id;

  // First-time login via BetterAuth — seed a users-table record
  const newId = baUserId; // reuse the BetterAuth UUID as the users.id
  await storage.upsertUser({
    id: newId,
    email: baEmail,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
  });

  // Welcome email for new users
  const APP_URL = process.env.APP_URL || "https://autofilllpdf.com";
  try {
    await triggerEmailByEvent("user_signup", baEmail, {
      user_name: "there",
      user_id: newId,
      app_url: APP_URL,
    });
  } catch {
    // Non-fatal
  }

  return newId;
}

export async function setupAuth(app: Express): Promise<void> {
  app.all("/api/auth/*", toNodeHandler(auth));
}

export const isAuthenticated: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const headers = new Headers();
    if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
    if (req.headers.authorization) headers.set("authorization", req.headers.authorization);

    const sessionResult = await auth.api.getSession({ headers });
    if (!sessionResult?.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const legacyId = await resolveLegacyUserId(sessionResult.user.email, sessionResult.user.id);
    (req as any).user = { claims: { sub: legacyId }, betterAuthUserId: sessionResult.user.id };
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export const optionalAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const headers = new Headers();
    if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
    if (req.headers.authorization) headers.set("authorization", req.headers.authorization);

    const sessionResult = await auth.api.getSession({ headers });
    if (sessionResult?.user?.id) {
      const legacyId = await resolveLegacyUserId(sessionResult.user.email, sessionResult.user.id);
      (req as any).user = { claims: { sub: legacyId }, betterAuthUserId: sessionResult.user.id };
    }
  } catch {
    // Non-fatal for optional auth
  }
  return next();
};
