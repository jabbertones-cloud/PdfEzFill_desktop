/**
 * E-Signature Service (ESIGN Act / UETA compliance)
 *
 * Provides an audit trail for electronic signatures on PDFs.
 * Each signing event captures:
 *   - Signer identity (user ID + email, or guest email)
 *   - IP address and User-Agent at signing time
 *   - SHA-256 hash of original and signed PDF documents
 *   - Timestamp (ISO 8601 UTC)
 *   - Explicit consent statement presented to signer
 *   - Signature method (drawn vs typed)
 *
 * This satisfies the minimum evidentiary requirements of the US ESIGN Act (2000)
 * and UETA (adopted by 47 states). NOT a replacement for DocuSign/HelloSign for
 * regulated industries (healthcare, finance, real estate) — disclose limitations.
 */

import { createHash } from "node:crypto";
import { db } from "./db";
import { esignAuditLogs, forms } from "@shared/schema";
import { eq } from "drizzle-orm";

const CONSENT_STATEMENT =
  "By clicking 'Sign Document', I agree that my electronic signature is legally binding and equivalent to my handwritten signature under the ESIGN Act and UETA.";

export interface SignDocumentOptions {
  formId: string;
  userId: string | null;
  guestEmail: string | null;
  signerName: string | null;
  signerIp: string;
  userAgent: string;
  signatureMethod: "draw" | "type";
  originalPdfBytes: Buffer;
  signedPdfBytes: Buffer;
}

export interface SignDocumentResult {
  auditId: string;
  signedAt: string;
  originalHash: string;
  signedHash: string;
  consentStatement: string;
}

/**
 * Record a signing event. Call this after a PDF has been rendered with the
 * user's signature embedded. Returns the audit log entry.
 */
export async function recordSigningEvent(
  opts: SignDocumentOptions
): Promise<SignDocumentResult> {
  const originalHash = sha256(opts.originalPdfBytes);
  const signedHash = sha256(opts.signedPdfBytes);
  const signedAt = new Date().toISOString();

  const [log] = await db
    .insert(esignAuditLogs)
    .values({
      formId: opts.formId,
      userId: opts.userId,
      guestEmail: opts.guestEmail,
      signerName: opts.signerName,
      signerIp: opts.signerIp,
      userAgent: opts.userAgent,
      originalDocumentHash: originalHash,
      signedDocumentHash: signedHash,
      signedAt,
      signatureMethod: opts.signatureMethod,
      consentStatement: CONSENT_STATEMENT,
    })
    .returning({ id: esignAuditLogs.id });

  return {
    auditId: log.id,
    signedAt,
    originalHash,
    signedHash,
    consentStatement: CONSENT_STATEMENT,
  };
}

/**
 * Retrieve the audit trail for a specific form.
 * Returns all signing events in chronological order.
 */
export async function getAuditTrail(formId: string): Promise<typeof esignAuditLogs.$inferSelect[]> {
  return db
    .select()
    .from(esignAuditLogs)
    .where(eq(esignAuditLogs.formId, formId))
    .orderBy(esignAuditLogs.createdAt);
}

/**
 * Verify a signed PDF's integrity against the audit log.
 * Returns true if the current bytes match the stored hash.
 */
export async function verifySignedIntegrity(
  auditId: string,
  currentPdfBytes: Buffer
): Promise<{ valid: boolean; reason?: string }> {
  const [log] = await db
    .select()
    .from(esignAuditLogs)
    .where(eq(esignAuditLogs.id, auditId))
    .limit(1);

  if (!log) return { valid: false, reason: "Audit log entry not found" };
  if (!log.signedDocumentHash) return { valid: false, reason: "No signed document hash recorded" };

  const currentHash = sha256(currentPdfBytes);
  if (currentHash !== log.signedDocumentHash) {
    return {
      valid: false,
      reason: `Document hash mismatch. Stored: ${log.signedDocumentHash}, Current: ${currentHash}`,
    };
  }
  return { valid: true };
}

/**
 * Generate a human-readable evidence summary for a signing event.
 * Suitable for display in admin panel or as an exhibit in legal proceedings.
 */
export function buildEvidenceSummary(log: typeof esignAuditLogs.$inferSelect): string {
  return [
    "=== ELECTRONIC SIGNATURE EVIDENCE SUMMARY ===",
    `Audit ID:          ${log.id}`,
    `Form ID:           ${log.formId}`,
    `Signer Name:       ${log.signerName ?? "(not provided)"}`,
    `Signer Email:      ${log.userId ? `User ID ${log.userId}` : (log.guestEmail ?? "(guest)")}`,
    `IP Address:        ${log.signerIp}`,
    `User Agent:        ${log.userAgent ?? "(not recorded)"}`,
    `Signed At (UTC):   ${log.signedAt}`,
    `Method:            ${log.signatureMethod}`,
    `Original Doc SHA:  ${log.originalDocumentHash}`,
    `Signed Doc SHA:    ${log.signedDocumentHash ?? "(not recorded)"}`,
    `Consent:           ${log.consentStatement}`,
    "==============================================",
  ].join("\n");
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
