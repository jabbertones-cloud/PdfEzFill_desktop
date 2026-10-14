import { pgTable, varchar, integer, float, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { forms } from "./schema";

// ============================================================================
// Zod Schemas for Type Safety
// ============================================================================

export const relativePositionSchema = z.object({
  top_pct: z.number().min(0).max(1),
  left_pct: z.number().min(0).max(1),
  width_pct: z.number().min(0).max(1),
  height_pct: z.number().min(0).max(1),
});

export type RelativePosition = z.infer<typeof relativePositionSchema>;

export const regionFieldSchema = z.object({
  label: z.string(),
  type: z.enum(["text", "number", "date", "email", "phone", "checkbox", "radio", "textarea", "signature", "table"]),
  rel_x: z.number().min(0).max(1), // Relative to region
  rel_y: z.number().min(0).max(1),
  rel_w: z.number().min(0).max(1),
  rel_h: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(), // For radio/checkbox
});

export type RegionField = z.infer<typeof regionFieldSchema>;

export const regionRelationshipSchema = z.object({
  target_region: z.string(), // region_label of target
  relationship_type: z.enum(["above", "below", "left_of", "right_of", "adjacent", "overlaps"]),
  spatial_hint: z.string().optional(), // e.g., "always 10% below", "immediately to the right"
  min_distance_pct: z.number().min(0).optional(), // Minimum pixel distance as % of page
  max_distance_pct: z.number().min(0).optional(),
});

export type RegionRelationship = z.infer<typeof regionRelationshipSchema>;

export const regionTypeSchema = z.enum([
  "personal_information",
  "contact_information",
  "address_block",
  "employment_information",
  "financial_information",
  "payment_table",
  "signature_area",
  "checkbox_group",
  "radio_group",
  "text_block",
  "header_block",
  "barcode_area",
  "table",
  "section_divider",
]);

export type RegionType = z.infer<typeof regionTypeSchema>;

// Numeric encoding for region types (used in arrangement vectors)
export const REGION_TYPE_ENCODING: Record<RegionType, number> = {
  personal_information: 0,
  contact_information: 1,
  address_block: 2,
  employment_information: 3,
  financial_information: 4,
  payment_table: 5,
  signature_area: 6,
  checkbox_group: 7,
  radio_group: 8,
  text_block: 9,
  header_block: 10,
  barcode_area: 11,
  table: 12,
  section_divider: 13,
};

export function decodeRegionType(id: number): RegionType {
  const entries = Object.entries(REGION_TYPE_ENCODING);
  const found = entries.find(([, value]) => value === id);
  if (!found) throw new Error(`Unknown region type ID: ${id}`);
  return found[0] as RegionType;
}

// ============================================================================
// Drizzle ORM Tables
// ============================================================================

/**
 * Stores indexed regions for each document type.
 * When a new form is processed, detected regions are matched against existing indexes.
 */
export const regionIndexes = pgTable(
  "region_indexes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    // Identification
    document_type: varchar("document_type", { length: 100 }).notNull(),
    region_label: varchar("region_label", { length: 200 }).notNull(),

    // Page context
    page_number: integer("page_number").notNull(),

    // Positioning (relative percentages, 0.0 - 1.0)
    relative_position: jsonb("relative_position").$type<RelativePosition>().notNull(),

    // Quality metrics
    confidence: float("confidence").notNull().default(0.85),
    variant_tolerance: float("variant_tolerance").notNull().default(0.15),

    // Field schema within this region
    // Array of { label, type, rel_x, rel_y, rel_w, rel_h, confidence?, required?, options? }
    field_schema: jsonb("field_schema").$type<RegionField[]>().notNull(),

    // Relationship to other regions
    // Array of { target_region, relationship_type, spatial_hint?, min_distance_pct?, max_distance_pct? }
    relationships: jsonb("relationships").$type<RegionRelationship[]>().notNull().default(sql`'[]'`),

    // Fast lookup: hash of region arrangement
    layout_signature: varchar("layout_signature", { length: 64 }).notNull(),

    // Learning metrics
    usage_count: integer("usage_count").notNull().default(0),
    last_used_at: timestamp("last_used_at"),
    was_corrected_count: integer("was_corrected_count").default(0),
    is_locked: boolean("is_locked").default(false), // High confidence = locked (skip re-detection)

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Indexes for fast lookups
    idxLayoutSig: index("idx_region_layout_sig").on(table.layout_signature),
    idxDocType: index("idx_region_doc_type").on(table.document_type),
    idxDocPage: index("idx_region_doc_page").on(table.document_type, table.page_number),
    idxConfidence: index("idx_region_confidence").on(table.document_type, table.confidence),
    idxLocked: index("idx_region_locked").on(table.is_locked),

    // Uniqueness constraint
    uqDocTypeRegionPage: uniqueIndex("uq_region_doc_type_label_page")
      .on(table.document_type, table.region_label, table.page_number)
      .where(sql`layout_signature IS NOT NULL`),
  })
);

export type RegionIndex = typeof regionIndexes.$inferSelect;
export type InsertRegionIndex = typeof regionIndexes.$inferInsert;

/**
 * Tracks which regions matched which documents.
 * Enables learning: when a user corrects a field, we update the matching region index.
 */
export const regionMatchHistory = pgTable(
  "region_match_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    form_id: varchar("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    region_index_id: varchar("region_index_id").notNull().references(() => regionIndexes.id, { onDelete: "cascade" }),

    // Match quality
    match_confidence: float("match_confidence").notNull(),
    match_method: varchar("match_method", { length: 50 }), // "layout_sig", "cosine_similarity", "ocr_fallback"

    // Learning signal
    was_corrected: boolean("was_corrected").default(false),
    correction_data: jsonb("correction_data").$type<{
      field_id?: string;
      old_value?: string;
      new_value?: string;
      timestamp?: string;
      corrector_notes?: string;
    }>(),

    // Region information
    page_number: integer("page_number"),
    detected_region_bounds: jsonb("detected_region_bounds").$type<RelativePosition>(),
    expected_region_bounds: jsonb("expected_region_bounds").$type<RelativePosition>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    idxForm: index("idx_match_history_form").on(table.form_id),
    idxRegion: index("idx_match_history_region").on(table.region_index_id),
    idxCorrected: index("idx_match_history_corrected").on(table.was_corrected),
    idxCreated: index("idx_match_history_created").on(table.created_at),
  })
);

export type RegionMatch = typeof regionMatchHistory.$inferSelect;
export type InsertRegionMatch = typeof regionMatchHistory.$inferInsert;

/**
 * Optional: Cache layout signatures for known documents.
 * Speeds up re-processing of identical or very similar PDFs.
 */
export const regionDetectionCache = pgTable(
  "region_detection_cache",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    // Document identifier
    document_hash: varchar("document_hash", { length: 64 }).notNull().unique(),

    // Detected properties
    document_type: varchar("document_type", { length: 100 }),
    region_indexes: jsonb("region_indexes").$type<string[]>().notNull(), // Array of matched region_index IDs

    // Cache quality
    cache_confidence: float("cache_confidence"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    idxHash: index("idx_cache_hash").on(table.document_hash),
    idxType: index("idx_cache_type").on(table.document_type),
    idxCreated: index("idx_cache_created").on(table.created_at),
  })
);

export type RegionDetectionCache = typeof regionDetectionCache.$inferSelect;
export type InsertRegionDetectionCache = typeof regionDetectionCache.$inferInsert;

/**
 * Batch fill jobs table - tracks async batch PDF fill operations
 * Allows users to upload CSV/Excel and automatically fill multiple PDFs from a template
 */
export const batchFillJobs = pgTable(
  "batch_fill_jobs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    // Request info
    user_id: varchar("user_id").notNull().references(() => forms.userId, { onDelete: "cascade" }),
    template_form_id: varchar("template_form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),

    // Job metadata
    status: varchar("status", { length: 50 }).notNull().default("processing"), // processing, completed, failed
    data_row_count: integer("data_row_count").notNull(),
    columns_mapped: jsonb("columns_mapped").$type<Record<string, string>>().notNull(), // {source_column: field_label}

    // Results
    completed_count: integer("completed_count").default(0),
    failed_count: integer("failed_count").default(0),
    output_zip_url: varchar("output_zip_url"), // S3/storage URL for generated ZIP
    error_message: text("error_message"),

    // Progress
    progress_percent: integer("progress_percent").default(0),
    estimated_seconds_remaining: integer("estimated_seconds_remaining"),

    // Timestamps
    started_at: timestamp("started_at").defaultNow(),
    completed_at: timestamp("completed_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    idxUser: index("idx_batch_fill_user").on(table.user_id),
    idxStatus: index("idx_batch_fill_status").on(table.status),
    idxCreated: index("idx_batch_fill_created").on(table.created_at),
  })
);

export type BatchFillJob = typeof batchFillJobs.$inferSelect;
export type InsertBatchFillJob = typeof batchFillJobs.$inferInsert;

// ============================================================================
// TypeScript Types for Detection & Matching
// ============================================================================

/**
 * Result of region detection phase (Stage 2 of pipeline).
 * Classified regions detected on a form before matching against indexes.
 */
export interface ClassifiedRegion {
  label: RegionType;
  page: number;
  bounds: RelativePosition; // Absolute position on page
  confidence: number; // Detection confidence
  raw_text?: string; // Raw text content of region
  detected_fields?: RegionField[]; // Fields detected in region (before matching)
}

/**
 * Result of region matching (Stage 3 of pipeline).
 * Which region index matched the detected region, and with what confidence.
 */
export interface RegionMatchResult {
  detected_region: ClassifiedRegion;
  matched_index: RegionIndex | null;
  match_confidence: number;
  match_method: "layout_sig" | "cosine_similarity" | "ocr_fallback";
  alternative_matches: Array<{
    index_id: string;
    confidence: number;
  }>;
}

/**
 * Overall result of region detection and matching for a form.
 */
export interface RegionDetectionResult {
  document_type: string | null;
  detected_regions: ClassifiedRegion[];
  matched_regions: RegionMatchResult[];
  unknown_regions: ClassifiedRegion[];
  overall_confidence: number;
  processing_time_ms: number;
  layout_signature: string | null;
  cache_hit: boolean;
}

// ============================================================================
// Statistics & Analytics Types
// ============================================================================

export interface RegionIndexStats {
  total_indexes: number;
  by_document_type: Record<
    string,
    {
      region_count: number;
      average_confidence: number;
      total_usage_count: number;
      avg_usage_count: number;
      locked_regions: number;
      corrected_count: number;
    }
  >;
  match_success_rate: number; // % of forms matched > 0.85
  fuzzy_match_rate: number; // % of matches 0.70-0.85
  fallback_ocr_rate: number; // % using OCR fallback
  average_match_time_ms: number;
  cache_hit_rate: number;
  p95_match_time_ms: number;
  drift_alerts_24h: number;
}

export interface RegionDriftAlert {
  region_index_id: string;
  document_type: string;
  region_label: string;
  drift_amount: number; // Actual drift / tolerance
  reason: string;
  suggested_action: string;
  created_at: Date;
}

// ============================================================================
// Export all types for external use
// ============================================================================

export type {
  RegionDetectionResult,
  RegionIndexStats,
  RegionDriftAlert,
  BatchFillJob,
  InsertBatchFillJob,
};
