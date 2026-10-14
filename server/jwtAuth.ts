/**
 * JWT API token authentication using jose (already a better-auth dependency).
 * Complements BetterAuth session-based auth with stateless API token support.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Request, Response, NextFunction } from "express";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "change-in-production"
);
const ALG = "HS256";
const EXPIRY = "24h";

export interface ApiTokenPayload extends JWTPayload {
  email?: string;
  role?: string;
}

export async function generateApiToken(sub: string, email?: string, role = "user"): Promise<string> {
  return new SignJWT({ email, role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifyApiToken(token: string): Promise<ApiTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as ApiTokenPayload;
  } catch {
    return null;
  }
}

/** Middleware: require valid JWT Bearer token */
export async function requireJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  const payload = await verifyApiToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).jwtPayload = payload;
  next();
}
