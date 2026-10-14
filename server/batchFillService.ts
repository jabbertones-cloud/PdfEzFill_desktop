import { PDFDocument, PDFPage } from "pdf-lib";
import { Readable } from "stream";
import * as archiver from "archiver";
import { Papa } from "papaparse";
import { type FormField } from "@shared/schema";

// ============================================================================
// CSV/JSON Data Source Parsing
// ============================================================================

/**
 * Parses a data source (CSV or JSON) into an array of row objects.
 *
 * CSV format:
 * name,email,phone
 * John Doe,john@example.com,555-1234
 * Jane Smith,jane@example.com,555-5678
 *
 * JSON format:
 * [
 *   { "name": "John Doe", "email": "john@example.com", "phone": "555-1234" },
 *   { "name": "Jane Smith", "email": "jane@example.com", "phone": "555-5678" }
 * ]
 */
export function parseDataSource(
  data: string | Buffer,
  format: "csv" | "json"
): Record<string, string>[] {
  const str = typeof data === "string" ? data : data.toString("utf8");

  if (format === "json") {
    try {
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON data must be an array of objects");
      }
      // Ensure all values are strings
      return parsed.map((row: any) => {
        const stringified: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          stringified[key] = String(value || "");
        }
        return stringified;
      });
    } catch (error) {
      throw new Error(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (format === "csv") {
    return new Promise<Record<string, string>[]>((resolve, reject) => {
      Papa.parse(str, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          if (results.errors.length > 0) {
            reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
          } else {
            resolve(
              (results.data || []).map((row: any) => {
                const stringified: Record<string, string> = {};
                for (const [key, value] of Object.entries(row)) {
                  stringified[key] = String(value || "");
                }
                return stringified;
              })
            );
          }
        },
        error: (error: any) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        },
      });
    });
  }

  throw new Error(`Unsupported format: ${format}`);
}

// ============================================================================
// Column Mapping
// ============================================================================

export interface ColumnMapping {
  sourceColumn: string;
  fieldLabel: string;
  confidence: number; // 0-1, 1.0 = perfect match
}

/**
 * Auto-suggests column mappings by matching column names to field labels.
 * Uses simple string similarity matching and fuzzy matching.
 */
export function autoMapColumns(
  columns: string[],
  fieldLabels: string[]
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedFields = new Set<string>();

  for (const column of columns) {
    // First, try exact match (case-insensitive)
    const exactMatch = fieldLabels.find(
      (label) => label.toLowerCase() === column.toLowerCase()
    );
    if (exactMatch && !usedFields.has(exactMatch)) {
      mappings.push({
        sourceColumn: column,
        fieldLabel: exactMatch,
        confidence: 1.0,
      });
      usedFields.add(exactMatch);
      continue;
    }

    // Try fuzzy match using simple substring matching
    const fuzzyMatches = fieldLabels
      .filter(
        (label) =>
          !usedFields.has(label) &&
          (label.toLowerCase().includes(column.toLowerCase()) ||
            column.toLowerCase().includes(label.toLowerCase()))
      )
      .map((label) => {
        const similarity = stringSimilarity(column, label);
        return { label, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity);

    if (fuzzyMatches.length > 0) {
      const bestMatch = fuzzyMatches[0];
      if (bestMatch.similarity > 0.6) {
        mappings.push({
          sourceColumn: column,
          fieldLabel: bestMatch.label,
          confidence: bestMatch.similarity,
        });
        usedFields.add(bestMatch.label);
        continue;
      }
    }

    // No match found
    mappings.push({
      sourceColumn: column,
      fieldLabel: "", // Empty = not mapped
      confidence: 0,
    });
  }

  return mappings;
}

/**
 * Simple string similarity metric (0-1).
 * Uses Levenshtein distance.
 */
function stringSimilarity(a: string, b: string): number {
  const alen = a.length;
  const blen = b.length;
  const shorter = Math.min(alen, blen);

  if (shorter === 0) return 0;

  const leven = levenshteinDistance(a, b);
  const maxLen = Math.max(alen, blen);

  return 1 - leven / maxLen;
}

/**
 * Computes Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const alen = a.length;
  const blen = b.length;

  if (alen === 0) return blen;
  if (blen === 0) return alen;

  const matrix: number[][] = [];

  for (let i = 0; i <= blen; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= alen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= blen; i++) {
    for (let j = 1; j <= alen; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[blen][alen];
}

// ============================================================================
// Single PDF Fill
// ============================================================================

/**
 * Generates a single filled PDF from a template buffer and field values.
 * Uses pdf-lib to fill form fields.
 */
export async function fillSinglePdf(
  templateBuffer: Buffer,
  fields: FormField[],
  values: Record<string, string>
): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(templateBuffer);

    // Get the first page to access form fields
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error("PDF has no pages");
    }

    // Fill form fields by matching field labels to values
    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    for (const field of formFields) {
      const fieldName = field.getName();
      if (!fieldName) continue;

      // Try to find a matching value
      let value: string | undefined;

      // First, try exact match on field name
      if (values[fieldName]) {
        value = values[fieldName];
      } else {
        // Try to match by label from FormField schema
        const matchingField = fields.find(
          (f) =>
            f.label.toLowerCase() === fieldName.toLowerCase() ||
            f.label.toLowerCase().includes(fieldName.toLowerCase()) ||
            fieldName.toLowerCase().includes(f.label.toLowerCase())
        );
        if (matchingField && values[matchingField.label]) {
          value = values[matchingField.label];
        }
      }

      // Fill the field if we found a value
      if (value !== undefined && value !== "") {
        try {
          field.setValue(value);
        } catch (e) {
          // Field type might not support text (e.g., checkbox, radio)
          // Try to set as checkbox/radio if applicable
          if (field.constructor.name.includes("CheckBox")) {
            if (value.toLowerCase() === "true" || value.toLowerCase() === "yes" || value === "1") {
              field.setValue(true);
            }
          }
        }
      }
    }

    // Flatten the form (make fields non-editable)
    form.flatten();

    // Save and return the filled PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    throw new Error(
      `Failed to fill PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Batch Fill with ZIP Output
// ============================================================================

/**
 * Generates N filled PDFs from a template and data rows.
 * Returns a ZIP buffer containing all filled PDFs.
 *
 * Progress callback is invoked with (completed, total) after each PDF is filled.
 */
export async function batchFill(
  templateBuffer: Buffer,
  fields: FormField[],
  dataRows: Record<string, string>[],
  onProgress?: (completed: number, total: number) => void
): Promise<Buffer> {
  const total = dataRows.length;
  const filledPdfs: Array<{ name: string; buffer: Buffer }> = [];

  // Fill each row
  for (let i = 0; i < total; i++) {
    const row = dataRows[i];

    try {
      const filledBuffer = await fillSinglePdf(templateBuffer, fields, row);

      // Generate filename from row data (use first unique value or index)
      const rowIdentifier = row[Object.keys(row)[0]] || `form_${i + 1}`;
      const filename = `${rowIdentifier.replace(/[^a-zA-Z0-9_-]/g, "_")}_${i + 1}.pdf`;

      filledPdfs.push({
        name: filename,
        buffer: filledBuffer,
      });

      // Report progress
      if (onProgress) {
        onProgress(i + 1, total);
      }
    } catch (error) {
      console.error(`Failed to fill PDF for row ${i + 1}:`, error);
      // Continue with next row on error
    }
  }

  // Create ZIP archive
  return createZipArchive(filledPdfs);
}

/**
 * Creates a ZIP archive from an array of file buffers.
 * Returns the ZIP buffer.
 */
async function createZipArchive(
  files: Array<{ name: string; buffer: Buffer }>
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    const archive = archiver.create("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.on("error", (error: Error) => {
      reject(error);
    });

    // Add all files to archive
    for (const file of files) {
      archive.append(file.buffer, { name: file.name });
    }

    archive.finalize();
  });
}

// ============================================================================
// Progress Tracking for Async Operations
// ============================================================================

export interface BatchFillProgress {
  jobId: string;
  status: "processing" | "completed" | "failed";
  completed: number;
  total: number;
  percent: number;
  errorMessage?: string;
  outputZipUrl?: string;
  estimatedSecondsRemaining?: number;
}

/**
 * Simulates progress tracking (in production, use a job queue like BullMQ).
 */
export function createProgressTracker(
  jobId: string,
  total: number
): {
  update: (completed: number) => BatchFillProgress;
  complete: (outputZipUrl?: string) => BatchFillProgress;
  fail: (error: string) => BatchFillProgress;
} {
  const startTime = Date.now();
  let lastTime = startTime;
  let lastCompleted = 0;

  return {
    update: (completed: number): BatchFillProgress => {
      const now = Date.now();
      const elapsedSec = (now - startTime) / 1000;
      const recentRate = (completed - lastCompleted) / ((now - lastTime) / 1000 || 1);
      const remaining = total - completed;
      const estimatedSecondsRemaining =
        recentRate > 0 ? Math.ceil(remaining / recentRate) : 0;

      lastTime = now;
      lastCompleted = completed;

      return {
        jobId,
        status: "processing",
        completed,
        total,
        percent: Math.round((completed / total) * 100),
        estimatedSecondsRemaining,
      };
    },

    complete: (outputZipUrl?: string): BatchFillProgress => {
      return {
        jobId,
        status: "completed",
        completed: total,
        total,
        percent: 100,
        outputZipUrl,
      };
    },

    fail: (error: string): BatchFillProgress => {
      return {
        jobId,
        status: "failed",
        completed: 0,
        total,
        percent: 0,
        errorMessage: error,
      };
    },
  };
}
