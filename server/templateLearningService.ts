import { createHash } from "crypto";
import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "./db";
import {
  type FormField,
  formTemplates,
  type FormTemplate,
  type InsertFormTemplate,
} from "@shared/schema";
import {
  computeLayoutSignature,
  cosineSimilarity,
  computeArrangementVector,
  type ClassifiedRegion,
} from "./regionIndexService";

// ============================================================================
// Constants
// ============================================================================

// Quantization grid: 5% increments (0-20)
const QUANTIZATION_STEPS = 20;
const SIMILARITY_THRESHOLD = 0.85; // High confidence match threshold
const FUZZY_MATCH_THRESHOLD = 0.70; // Fuzzy match threshold

// ============================================================================
// Template Hash Computation
// ============================================================================

/**
 * Computes a deterministic hash for a set of fields quantized to a 5% grid.
 * This is used to quickly match templates without OCR.
 *
 * Algorithm:
 * 1. Quantize each field's position to 5% grid
 * 2. Sort by (page, quantized_y, quantized_x)
 * 3. Build signature string: "label:type:qx:qy|..."
 * 4. Return SHA-256 hash
 */
export function computeTemplateHash(fields: FormField[]): string {
  if (fields.length === 0) return "";

  // Normalize positions to percentage-based coordinates
  const normalized = normalizeFieldPositions(fields);

  // Sort by page, then y, then x
  const sorted = [...normalized].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (a.quantized_y !== b.quantized_y) return a.quantized_y - b.quantized_y;
    return a.quantized_x - b.quantized_x;
  });

  // Build signature string
  const parts = sorted.map(
    (f) => `${f.label}:${f.type}:${f.quantized_x}:${f.quantized_y}`
  );
  const signature = parts.join("|");

  // Return SHA-256 hash
  return createHash("sha256").update(signature).digest("hex");
}

// ============================================================================
// Field Position Normalization
// ============================================================================

export interface NormalizedField {
  label: string;
  type: string;
  page: number;
  absolute_x: number; // 0-1 (percentage)
  absolute_y: number;
  width: number;
  height: number;
  quantized_x: number; // 0-20 (5% grid)
  quantized_y: number;
  confidence?: number;
}

/**
 * Normalizes field positions to percentage-based coordinates and quantizes to 5% grid.
 */
export function normalizeFieldPositions(
  fields: FormField[],
  pageWidth: number = 612, // Standard 8.5" at 72 DPI
  pageHeight: number = 792  // Standard 11" at 72 DPI
): NormalizedField[] {
  return fields.map((field) => {
    const [x, y, w, h] = field.bbox || [0, 0, 0, 0];

    // Convert to percentages (0-1)
    const abs_x = x / pageWidth;
    const abs_y = y / pageHeight;
    const width_pct = w / pageWidth;
    const height_pct = h / pageHeight;

    // Clamp to [0, 1]
    const clamped_x = Math.max(0, Math.min(1, abs_x));
    const clamped_y = Math.max(0, Math.min(1, abs_y));

    // Quantize to 5% grid (0-20)
    const quantized_x = Math.round(clamped_x * QUANTIZATION_STEPS);
    const quantized_y = Math.round(clamped_y * QUANTIZATION_STEPS);

    return {
      label: field.label,
      type: field.type,
      page: field.page || 1,
      absolute_x: clamped_x,
      absolute_y: clamped_y,
      width: width_pct,
      height: height_pct,
      quantized_x,
      quantized_y,
      confidence: field.confidence,
    };
  });
}

// ============================================================================
// Template Matching
// ============================================================================

export interface TemplateMatch {
  template: FormTemplate;
  confidence: number;
  method: "exact_hash" | "cosine_similarity";
}

/**
 * Finds a matching template for a set of fields.
 * First tries exact hash match (fast), then fuzzy matching via cosine similarity.
 */
export async function findMatchingTemplate(
  fields: FormField[],
  userId?: string,
  documentType?: string
): Promise<TemplateMatch | null> {
  if (fields.length === 0) return null;

  const templateHash = computeTemplateHash(fields);
  if (!templateHash) return null;

  // Step 1: Try exact hash match (fastest)
  const exactMatches = await db
    .select()
    .from(formTemplates)
    .where(
      documentType
        ? and(
            eq(formTemplates.layout_hash, templateHash),
            eq(formTemplates.document_type, documentType)
          )
        : eq(formTemplates.layout_hash, templateHash)
    )
    .limit(1);

  if (exactMatches.length > 0) {
    return {
      template: exactMatches[0],
      confidence: 1.0,
      method: "exact_hash",
    };
  }

  // Step 2: Fuzzy match via cosine similarity
  const normalized = normalizeFieldPositions(fields);
  const fieldVector = normalized.map((f) => [
    f.quantized_x / QUANTIZATION_STEPS,
    f.quantized_y / QUANTIZATION_STEPS,
  ]).flat();

  // Fetch candidate templates
  const candidates = await db
    .select()
    .from(formTemplates)
    .where(
      documentType
        ? and(
            eq(formTemplates.document_type, documentType),
            gte(formTemplates.match_success_count, 1) // At least 1 successful match
          )
        : undefined
    )
    .orderBy(desc(formTemplates.usage_count))
    .limit(50);

  let bestMatch: FormTemplate | null = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    // Extract field vector from template
    const templateFieldSchema = candidate.field_schema as unknown as NormalizedField[];
    const candidateVector = templateFieldSchema
      .map((f) => [
        f.quantized_x / QUANTIZATION_STEPS,
        f.quantized_y / QUANTIZATION_STEPS,
      ])
      .flat();

    const similarity = cosineSimilarity(fieldVector, candidateVector);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      if (similarity > FUZZY_MATCH_THRESHOLD) {
        bestMatch = candidate;
      }
    }
  }

  if (bestMatch && bestSimilarity >= FUZZY_MATCH_THRESHOLD) {
    return {
      template: bestMatch,
      confidence: bestSimilarity,
      method: "cosine_similarity",
    };
  }

  return null;
}

// ============================================================================
// Template Learning
// ============================================================================

/**
 * Stores a new template after first-time form processing.
 * Called when a new form layout is detected and successfully processed.
 */
export async function learnTemplate(
  formId: string,
  fields: FormField[],
  documentType: string,
  userId?: string
): Promise<string> {
  const templateHash = computeTemplateHash(fields);
  if (!templateHash) throw new Error("Failed to compute template hash");

  const normalized = normalizeFieldPositions(fields);

  // Build simplified field schema for template
  const fieldSchema = normalized.map((f) => ({
    label: f.label,
    type: f.type,
    quantized_x: f.quantized_x,
    quantized_y: f.quantized_y,
  }));

  // Check if template already exists
  const existing = await db
    .select()
    .from(formTemplates)
    .where(eq(formTemplates.layout_hash, templateHash))
    .limit(1);

  if (existing.length > 0) {
    // Update existing template
    const template = existing[0];
    await db
      .update(formTemplates)
      .set({
        usage_count: template.usage_count + 1,
        last_used_at: new Date(),
        match_success_count: template.match_success_count + 1,
        updated_at: new Date(),
      })
      .where(eq(formTemplates.id, template.id));

    return template.id;
  }

  // Create new template
  const [newTemplate] = await db
    .insert(formTemplates)
    .values({
      user_id: userId,
      document_type: documentType,
      layout_hash: templateHash,
      field_count: fields.length,
      field_schema: fieldSchema,
      example_form_id: formId,
      usage_count: 1,
      match_success_count: 1,
      last_used_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  return newTemplate.id;
}

/**
 * Records a successful template match.
 * Updates confidence and usage metrics.
 */
export async function recordTemplateMatch(
  templateId: string,
  success: boolean,
  _confidence?: number
): Promise<void> {
  const existing = await db
    .select()
    .from(formTemplates)
    .where(eq(formTemplates.id, templateId))
    .limit(1);

  if (existing.length === 0) return;

  const template = existing[0];
  const updates = {
    usage_count: (template.usage_count ?? 0) + 1,
    last_used_at: new Date(),
    match_success_count: success ? (template.match_success_count ?? 0) + 1 : (template.match_success_count ?? 0),
    match_failure_count: !success ? (template.match_failure_count ?? 0) + 1 : (template.match_failure_count ?? 0),
    updated_at: new Date(),
  };

  await db
    .update(formTemplates)
    .set(updates)
    .where(eq(formTemplates.id, templateId));
}

// ============================================================================
// Template Statistics
// ============================================================================

export interface TemplateStats {
  total_templates: number;
  total_usage_count: number;
  avg_usage_per_template: number;
  by_document_type: Record<
    string,
    {
      count: number;
      total_usage: number;
      avg_success_rate: number;
    }
  >;
  most_used_templates: Array<{
    id: string;
    document_type: string;
    field_count: number;
    usage_count: number;
    match_success_rate: number;
  }>;
}

export async function getTemplateStats(): Promise<TemplateStats> {
  const allTemplates = await db.select().from(formTemplates);

  if (allTemplates.length === 0) {
    return {
      total_templates: 0,
      total_usage_count: 0,
      avg_usage_per_template: 0,
      by_document_type: {},
      most_used_templates: [],
    };
  }

  // Aggregate by document type
  const byDocType: Record<
    string,
    {
      count: number;
      total_usage: number;
      avg_success_rate: number;
    }
  > = {};

  for (const t of allTemplates) {
    if (!byDocType[t.document_type]) {
      byDocType[t.document_type] = {
        count: 0,
        total_usage: 0,
        avg_success_rate: 0,
      };
    }

    const stats = byDocType[t.document_type];
    stats.count += 1;
    stats.total_usage += t.usage_count;

    const totalMatches = t.match_success_count + t.match_failure_count;
    if (totalMatches > 0) {
      const successRate = t.match_success_count / totalMatches;
      stats.avg_success_rate =
        (stats.avg_success_rate * (stats.count - 1) + successRate) / stats.count;
    }
  }

  // Most used templates
  const mostUsed = [...allTemplates]
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 10)
    .map((t) => {
      const totalMatches = t.match_success_count + t.match_failure_count;
      const successRate = totalMatches > 0 ? t.match_success_count / totalMatches : 1.0;
      return {
        id: t.id,
        document_type: t.document_type,
        field_count: t.field_count,
        usage_count: t.usage_count,
        match_success_rate: successRate,
      };
    });

  const totalUsage = allTemplates.reduce((sum, t) => sum + t.usage_count, 0);

  return {
    total_templates: allTemplates.length,
    total_usage_count: totalUsage,
    avg_usage_per_template: allTemplates.length > 0 ? totalUsage / allTemplates.length : 0,
    by_document_type: byDocType,
    most_used_templates: mostUsed,
  };
}

/**
 * Get templates for a specific user.
 */
export async function getUserTemplates(userId: string): Promise<FormTemplate[]> {
  return db
    .select()
    .from(formTemplates)
    .where(eq(formTemplates.user_id, userId))
    .orderBy(desc(formTemplates.usage_count));
}

/**
 * Get templates for a specific document type.
 */
export async function getTemplatesByDocumentType(
  documentType: string
): Promise<FormTemplate[]> {
  return db
    .select()
    .from(formTemplates)
    .where(eq(formTemplates.document_type, documentType))
    .orderBy(desc(formTemplates.usage_count))
    .limit(100);
}
