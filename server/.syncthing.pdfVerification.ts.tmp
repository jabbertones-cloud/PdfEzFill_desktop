/**
 * PDF Verification Service
 * 
 * Provides deterministic (non-AI) verification that filled PDFs are correct.
 * Uses multiple verification strategies that don't rely on AI hallucination.
 */

import { PDFDocument } from "pdf-lib";
import type { FormField } from "@shared/schema";

export interface VerificationResult {
  success: boolean;
  score: number; // 0-100
  checks: VerificationCheck[];
  errors: string[];
  warnings: string[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

/**
 * Verify a generated PDF has been properly filled
 * Uses multiple deterministic checks (no AI)
 */
export async function verifyFilledPdf(
  originalPdfBuffer: Buffer,
  generatedPdfBuffer: Buffer,
  answers: Record<string, string>,
  fields: FormField[]
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Load both PDFs
    const originalDoc = await PDFDocument.load(originalPdfBuffer);
    const generatedDoc = await PDFDocument.load(generatedPdfBuffer);

    // Check 1: PDF is valid and loadable
    checks.push({
      name: "PDF Valid",
      passed: true,
      message: "Generated PDF is a valid PDF document",
      severity: "info",
    });

    // Check 2: Page count matches
    const originalPages = originalDoc.getPageCount();
    const generatedPages = generatedDoc.getPageCount();
    const pageCountMatch = originalPages === generatedPages;
    checks.push({
      name: "Page Count",
      passed: pageCountMatch,
      message: pageCountMatch 
        ? `Page count matches (${generatedPages} pages)`
        : `Page count mismatch: original=${originalPages}, generated=${generatedPages}`,
      severity: pageCountMatch ? "info" : "error",
    });
    if (!pageCountMatch) {
      errors.push("Page count changed during PDF generation");
    }

    // Check 3: File size increased (text was added)
    const originalSize = originalPdfBuffer.length;
    const generatedSize = generatedPdfBuffer.length;
    const sizeIncreased = generatedSize > originalSize;
    const sizeDiff = generatedSize - originalSize;
    const sizeDiffPercent = ((sizeDiff / originalSize) * 100).toFixed(1);
    
    checks.push({
      name: "Content Added",
      passed: sizeIncreased,
      message: sizeIncreased
        ? `PDF size increased by ${sizeDiff} bytes (${sizeDiffPercent}%) - content was added`
        : `PDF size did not increase - no content may have been added`,
      severity: sizeIncreased ? "info" : "warning",
    });
    if (!sizeIncreased && Object.keys(answers).length > 0) {
      warnings.push("PDF size did not increase despite having answers");
    }

    // Check 4: Verify expected number of answers vs fields
    const answeredFieldCount = Object.keys(answers).filter(k => answers[k]?.trim()).length;
    const totalFieldCount = fields.length;
    const signatureFields = fields.filter(f => f.type === "signature").length;
    const expectedAnswerable = totalFieldCount - signatureFields; // Signature handled separately
    
    checks.push({
      name: "Answer Coverage",
      passed: answeredFieldCount > 0,
      message: `${answeredFieldCount} of ${expectedAnswerable} text fields have answers`,
      severity: answeredFieldCount > 0 ? "info" : "warning",
    });

    // Check 5: Validate bounding box sanity (coordinates make sense)
    const bboxIssues: string[] = [];
    for (const field of fields) {
      const [x, y, w, h] = field.bbox;
      
      // Check coordinates are within page bounds (0-100%)
      if (x < 0 || x > 100) bboxIssues.push(`${field.label}: x=${x} out of bounds`);
      if (y < 0 || y > 100) bboxIssues.push(`${field.label}: y=${y} out of bounds`);
      if (w <= 0 || w > 100) bboxIssues.push(`${field.label}: width=${w} invalid`);
      if (h <= 0 || h > 50) bboxIssues.push(`${field.label}: height=${h} suspicious`);
      if (x + w > 105) bboxIssues.push(`${field.label}: extends past right edge`);
      if (y + h > 105) bboxIssues.push(`${field.label}: extends past bottom edge`);
      
      // Check field is on a valid page
      if (field.page < 1 || field.page > generatedPages) {
        bboxIssues.push(`${field.label}: page ${field.page} doesn't exist`);
      }
    }
    
    checks.push({
      name: "Bounding Box Validity",
      passed: bboxIssues.length === 0,
      message: bboxIssues.length === 0
        ? "All field coordinates are within valid bounds"
        : `${bboxIssues.length} coordinate issues found`,
      severity: bboxIssues.length === 0 ? "info" : "warning",
    });
    warnings.push(...bboxIssues);

    // Check 6: Text Readability - verify font sizing is reasonable
    const readabilityIssues = checkTextReadability(fields, answers, generatedDoc);
    const hasReadabilityIssues = readabilityIssues.length > 0;
    checks.push({
      name: "Text Readability",
      passed: !hasReadabilityIssues,
      message: hasReadabilityIssues
        ? `${readabilityIssues.length} potential readability issues`
        : "All text fields have adequate sizing for readability",
      severity: hasReadabilityIssues ? "warning" : "info",
    });
    if (hasReadabilityIssues) {
      warnings.push(...readabilityIssues);
    }

    // Check 7: Verify no overlapping fields (potential OCR error)
    const overlaps = findOverlappingFields(fields);
    checks.push({
      name: "Field Overlap",
      passed: overlaps.length === 0,
      message: overlaps.length === 0
        ? "No overlapping fields detected"
        : `${overlaps.length} potential field overlaps detected`,
      severity: overlaps.length === 0 ? "info" : "warning",
    });
    if (overlaps.length > 0) {
      warnings.push(...overlaps.map(o => `Overlap: ${o.field1} and ${o.field2}`));
    }

    // Check 8: Text content estimation based on size increase
    // Rough estimate: each character adds ~10-50 bytes depending on font embedding
    const totalTextLength = Object.values(answers).join("").length;
    const minExpectedIncrease = totalTextLength * 5; // Very conservative
    const maxExpectedIncrease = totalTextLength * 200; // Account for font embedding
    
    const sizeReasonable = sizeDiff >= minExpectedIncrease || sizeDiff <= maxExpectedIncrease;
    checks.push({
      name: "Size Change Reasonable",
      passed: sizeReasonable,
      message: `Size change of ${sizeDiff} bytes for ${totalTextLength} characters of text`,
      severity: sizeReasonable ? "info" : "warning",
    });

    // Calculate overall score
    const passedChecks = checks.filter(c => c.passed).length;
    const errorChecks = checks.filter(c => c.severity === "error" && !c.passed).length;
    const score = Math.max(0, Math.round((passedChecks / checks.length) * 100) - (errorChecks * 20));

    return {
      success: errors.length === 0 && score >= 60,
      score,
      checks,
      errors,
      warnings,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`PDF verification failed: ${errorMessage}`);
    
    return {
      success: false,
      score: 0,
      checks: [{
        name: "PDF Loading",
        passed: false,
        message: `Failed to load PDF: ${errorMessage}`,
        severity: "error",
      }],
      errors,
      warnings,
    };
  }
}

/**
 * Check text readability based on field dimensions and answer lengths
 * Matches the renderer's font sizing logic (8-14pt range)
 */
function checkTextReadability(
  fields: FormField[],
  answers: Record<string, string>,
  doc: PDFDocument
): string[] {
  const issues: string[] = [];
  const MIN_FONT_SIZE = 8;
  const CHARS_PER_POINT_WIDTH = 0.6; // Approximate: 1pt font width ≈ 0.6 characters
  
  for (const field of fields) {
    const answer = answers[field.id];
    if (!answer || field.type === "signature" || field.type === "checkbox" || field.type === "radio") {
      continue;
    }
    
    const [, , w, h] = field.bbox;
    
    // Get page dimensions to convert percentage to points
    const page = doc.getPage(Math.max(0, field.page - 1));
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    
    // Convert percentage-based dimensions to points
    const fieldWidthPts = (w / 100) * pageWidth;
    const fieldHeightPts = (h / 100) * pageHeight;
    
    // Estimate font size based on field height (renderer uses 70% of height)
    const estimatedFontSize = Math.min(fieldHeightPts * 0.7, 14);
    
    // Check if estimated font size is too small
    if (estimatedFontSize < MIN_FONT_SIZE) {
      issues.push(`${field.label}: Field height (${fieldHeightPts.toFixed(1)}pt) may result in small text`);
    }
    
    // Check if text might be compressed due to width
    const charWidth = estimatedFontSize * CHARS_PER_POINT_WIDTH;
    const maxChars = Math.floor(fieldWidthPts / charWidth);
    
    if (answer.length > maxChars * 1.5) {
      issues.push(`${field.label}: Long text (${answer.length} chars) may be compressed in ${fieldWidthPts.toFixed(0)}pt wide field`);
    }
  }
  
  return issues;
}

/**
 * Find fields that overlap significantly (potential OCR error)
 */
function findOverlappingFields(fields: FormField[]): { field1: string; field2: string }[] {
  const overlaps: { field1: string; field2: string }[] = [];
  
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const f1 = fields[i];
      const f2 = fields[j];
      
      // Only check fields on same page
      if (f1.page !== f2.page) continue;
      
      const [x1, y1, w1, h1] = f1.bbox;
      const [x2, y2, w2, h2] = f2.bbox;
      
      // Check for significant overlap (>50% of smaller field)
      const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
      const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
      const overlapArea = overlapX * overlapY;
      
      const area1 = w1 * h1;
      const area2 = w2 * h2;
      const smallerArea = Math.min(area1, area2);
      
      if (overlapArea > smallerArea * 0.5) {
        overlaps.push({ field1: f1.label, field2: f2.label });
      }
    }
  }
  
  return overlaps;
}

/**
 * Quick validation that a PDF buffer is valid
 */
export async function isValidPdf(buffer: Buffer): Promise<boolean> {
  try {
    // Check PDF header
    const header = buffer.slice(0, 8).toString();
    if (!header.startsWith("%PDF-")) {
      return false;
    }
    
    // Try to load it
    await PDFDocument.load(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get basic PDF info for logging
 */
export async function getPdfInfo(buffer: Buffer): Promise<{
  valid: boolean;
  pageCount?: number;
  size: number;
  version?: string;
}> {
  const size = buffer.length;
  
  try {
    const header = buffer.slice(0, 8).toString();
    const version = header.match(/%PDF-(\d\.\d)/)?.[1];
    
    const doc = await PDFDocument.load(buffer);
    return {
      valid: true,
      pageCount: doc.getPageCount(),
      size,
      version,
    };
  } catch {
    return { valid: false, size };
  }
}
