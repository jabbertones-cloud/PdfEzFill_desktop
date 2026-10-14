import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import {
  betterAuthUsers as user,
  betterAuthSessions as session,
  betterAuthAccounts as account,
  betterAuthVerifications as verification,
} from "@shared/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "pdfezfill-dev-secret-change-in-prod",
  baseURL: process.env.APP_URL || "https://autofilllpdf.com",
  trustedOrigins: [
    process.env.APP_URL || "https://autofilllpdf.com",
    "http://localhost:5000",
    "http://localhost:3000",
  ],
});

export type Auth = typeof auth;
