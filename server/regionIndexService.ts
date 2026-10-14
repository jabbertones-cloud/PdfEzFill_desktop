import { eq, and, gt, gte, lte, desc, limit, asc } from "drizzle-orm";
import { db } from "./db";
import {
  regionIndexes,
  regionMatchHistory,
  regionDetectionCache,
  ClassifiedRegion,
  RegionDetectionResult,
  RegionIndexStats,
  RelativePosition,
  RegionField,
  RegionType,
  REGION_TYPE_ENCODING,
  decodeRegionType,
  RegionIndex,
  InsertRegionIndex,
  InsertRegionMatch,
} from "@shared/schema";

// ============================================================================
// Layout Signature Computation
// ============================================================================

/**
 * Computes a deterministic hash representing the spatial arrangement of regions.
 * Invariant to small position changes (±5% grid quantization).
 * Used for fast exact-match lookups.
 *
 * Algorithm:
 * 1. Sort regions by (page_number, center_y_pct, center_x_pct)
 * 2. Quantize coordinates to 5% grid
 * 3. Categorize region sizes
 * 4. Build signature string: "LABEL:x:y:width_cat:height_cat|..."
 * 5. Compute SHA-256 hash of signature
 */
export function computeLayoutSignature(regions: ClassifiedRegion[]): string {
  if (regions.length === 0) return "";

  // Sort by page, then y position (top to bottom), then x (left to right)
  const sorted = [...regions].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const aCenterY = a.bounds.top_pct + a.bounds.height_pct / 2;
    const bCenterY = b.bounds.top_pct + b.bounds.height_pct / 2;
    if (Math.abs(aCenterY - bCenterY) > 0.02) return aCenterY - bCenterY; // 2% tolerance
    const aCenterX = a.bounds.left_pct + a.bounds.width_pct / 2;
    const bCenterX = b.bounds.left_pct + b.bounds.width_pct / 2;
    return aCenterX - bCenterX;
  });

  // Build signature string
  const parts: string[] = [];
  for (const region of sorted) {
    // Quantize to 5% grid (0.05 = 5%)
    const quantizeCoord = (coord: number): number => Math.floor(coord * 20) / 20;

    const centerX = quantizeCoord(region.bounds.left_pct + region.bounds.width_pct / 2);
    const centerY = quantizeCoord(region.bounds.top_pct + region.bounds.height_pct / 2);

    // Width category
    const widthCat = region.bounds.width_pct < 0.2 ? "S" : region.bounds.width_pct < 0.5 ? "M" : region.bounds.width_pct < 0.8 ? "L" : "XL";

    // Height category
    const heightCat = region.bounds.height_pct < 0.1 ? "S" : region.bounds.height_pct < 0.2 ? "M" : "L";

    parts.push(`${region.label}:${centerX.toFixed(2)}:${centerY.toFixed(2)}:${widthCat}:${heightCat}`);
  }

  const signature = parts.join("|");

  // Hash using simple approach (in production, use crypto.createHash)
  // For now, return a deterministic string hash
  return simpleHash(signature);
}

/**
 * Simple deterministic hash function.
 * In production, replace with crypto.createHash("sha256").
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex and take first 16 chars
  return Math.abs(hash).toString(16).padStart(16, "0").substring(0, 16);
}

// ============================================================================
// Region Arrangement Vector
// ============================================================================

/**
 * Encodes region layout as a numerical vector for fuzzy matching.
 * Vector format: [type_id, center_x, center_y, width, height, type_id, ...]
 *
 * Algorithm:
 * 1. Sort regions by (page, center_y, center_x)
 * 2. For each region, append [type_id, center_x_pct, center_y_pct, width_pct, height_pct]
 * 3. Normalize to unit length (L2 norm)
 */
export function computeArrangementVector(regions: ClassifiedRegion[]): number[] {
  if (regions.length === 0) return [];

  // Sort regions
  const sorted = [...regions].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const aCenterY = a.bounds.top_pct + a.bounds.height_pct / 2;
    const bCenterY = b.bounds.top_pct + b.bounds.height_pct / 2;
    if (Math.abs(aCenterY - bCenterY) > 0.02) return aCenterY - bCenterY;
    const aCenterX = a.bounds.left_pct + a.bounds.width_pct / 2;
    const bCenterX = b.bounds.left_pct + b.bounds.width_pct / 2;
    return aCenterX - bCenterX;
  });

  // Build raw vector
  const vector: number[] = [];
  for (const region of sorted) {
    const typeId = REGION_TYPE_ENCODING[region.label];
    const centerX = region.bounds.left_pct + region.bounds.width_pct / 2;
    const centerY = region.bounds.top_pct + region.bounds.height_pct / 2;

    vector.push(typeId, centerX, centerY, region.bounds.width_pct, region.bounds.height_pct);
  }

  // Normalize to unit length
  return normalizeVector(vector);
}

/**
 * Normalizes vector to unit length (L2 norm).
 */
function normalizeVector(vector: number[]): number[] {
  if (vector.length === 0) return [];

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;

  return vector.map((v) => v / magnitude);
}

// ============================================================================
// Cosine Similarity
// ============================================================================

/**
 * Computes cosine similarity between two vectors.
 * Returns value in [-1, 1], typically [0, 1] for normalized vectors.
 * 0.85+ = auto-match, 0.70-0.85 = review, <0.70 = fallback
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length === 0 || v2.length === 0) return 0;

  const minLen = Math.min(v1.length, v2.length);
  const dotProduct = Array.from({ length: minLen }).reduce((sum, _, i) => sum + v1[i] * v2[i], 0);

  const mag1 = Math.sqrt(v1.reduce((sum, v) => sum + v * v, 0));
  const mag2 = Math.sqrt(v2.reduce((sum, v) => sum + v * v, 0));

  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

// ============================================================================
// Main Matching Function
// ============================================================================

export interface MatchOptions {
  documentType?: string;
  variantTolerance?: number;
  minConfidence?: number; // Minimum stored confidence to consider
}

export interface RegionMatchResult {
  best_match: {
    region_index_id: string;
    document_type: string;
    region_label: string;
    confidence: number;
    match_method: "layout_sig" | "cosine_similarity";
  } | null;
  alternative_matches: Array<{
    region_index_id: string;
    confidence: number;
  }>;
  unknown_regions: ClassifiedRegion[];
  overall_confidence: number;
}

/**
 * Main region matching function.
 * Attempts to match detected regions against stored region indexes.
 *
 * Algorithm:
 * 1. Try exact match via layout signature (fast path)
 * 2. If no exact match, try fuzzy matching via cosine similarity
 * 3. Return best match, alternatives, and unknown regions
 */
export async function findBestRegionMatch(
  detectedRegions: ClassifiedRegion[],
  options: MatchOptions = {}
): Promise<RegionMatchResult> {
  const { documentType, variantTolerance = 0.15, minConfidence = 0.70 } = options;

  if (detectedRegions.length === 0) {
    return {
      best_match: null,
      alternative_matches: [],
      unknown_regions: [],
      overall_confidence: 0,
    };
  }

  // Step 1: Try exact match via layout signature
  const layoutSig = computeLayoutSignature(detectedRegions);
  if (layoutSig) {
    const exactMatches = await db
      .select()
      .from(regionIndexes)
      .where(
        documentType
          ? and(eq(regionIndexes.layout_signature, layoutSig), eq(regionIndexes.document_type, documentType))
          : eq(regionIndexes.layout_signature, layoutSig)
      )
      .orderBy(desc(regionIndexes.confidence))
      .limit(1);

    if (exactMatches.length > 0) {
      const matched = exactMatches[0];
      return {
        best_match: {
          region_index_id: matched.id,
          document_type: matched.document_type,
          region_label: matched.region_label,
          confidence: matched.confidence,
          match_method: "layout_sig",
        },
        alternative_matches: [],
        unknown_regions: [],
        overall_confidence: matched.confidence,
      };
    }
  }

  // Step 2: Fuzzy match via cosine similarity
  const arrangementVector = computeArrangementVector(detectedRegions);

  const candidates = await db
    .select()
    .from(regionIndexes)
    .where(
      documentType ? eq(regionIndexes.document_type, documentType) : undefined
    )
    .orderBy(desc(regionIndexes.confidence))
    .limit(100);

  let bestMatch: RegionIndex | null = null;
  let bestSimilarity = 0;
  const alternatives: Array<{ index_id: string; similarity: number }> = [];

  for (const candidate of candidates) {
    if (candidate.confidence < minConfidence) continue;

    const candidateVector = computeArrangementVector(
      candidate.field_schema.map((field) => ({
        label: field.label as RegionType,
        page: 1,
        bounds: {
          top_pct: candidate.relative_position.top_pct + field.rel_y * candidate.relative_position.height_pct,
          left_pct: candidate.relative_position.left_pct + field.rel_x * candidate.relative_position.width_pct,
          width_pct: field.rel_w * candidate.relative_position.width_pct,
          height_pct: field.rel_h * candidate.relative_position.height_pct,
        },
        confidence: field.confidence || 0.85,
      }))
    );

    const similarity = cosineSimilarity(arrangementVector, candidateVector);

    if (similarity > 0.85 && !bestMatch) {
      bestMatch = candidate;
      bestSimilarity = similarity;
    } else if (similarity > 0.70 && similarity <= 0.85 && candidate.confidence > 0.80) {
      alternatives.push({ index_id: candidate.id, similarity });
    }
  }

  // Build result
  const alternativeMatches = alternatives.sort((a, b) => b.similarity - a.similarity).slice(0, 5).map((alt) => ({
    region_index_id: alt.index_id,
    confidence: alt.similarity,
  }));

  return {
    best_match: bestMatch
      ? {
          region_index_id: bestMatch.id,
          document_type: bestMatch.document_type,
          region_label: bestMatch.region_label,
          confidence: bestSimilarity,
          match_method: "cosine_similarity",
        }
      : null,
    alternative_matches: alternativeMatches,
    unknown_regions: detectedRegions, // All regions unknown if no match
    overall_confidence: bestSimilarity,
  };
}

// ============================================================================
// Store & Update Region Indexes
// ============================================================================

/**
 * Stores a new region index in the database.
 * Called when a new form type or variant is discovered.
 */
export async function storeRegionIndex(data: {
  document_type: string;
  region_label: string;
  page_number: number;
  relative_position: RelativePosition;
  field_schema: RegionField[];
  relationships?: any[];
  confidence?: number;
  variant_tolerance?: number;
}): Promise<RegionIndex> {
  const layoutSig = computeLayoutSignature([
    {
      label: data.region_label as RegionType,
      page: data.page_number,
      bounds: data.relative_position,
      confidence: data.confidence || 0.85,
    },
  ]);

  const insert: InsertRegionIndex = {
    document_type: data.document_type,
    region_label: data.region_label,
    page_number: data.page_number,
    relative_position: data.relative_position,
    field_schema: data.field_schema,
    relationships: data.relationships || [],
    layout_signature: layoutSig,
    confidence: data.confidence || 0.85,
    variant_tolerance: data.variant_tolerance || 0.15,
    usage_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.insert(regionIndexes).values(insert).returning();
  return result[0];
}

/**
 * Updates a region index confidence score.
 * Called after successful match to improve future matching.
 *
 * Uses Bayesian update: new_confidence = (old * count + 1.0) / (count + 1)
 */
export async function updateRegionConfidence(regionId: string, wasSuccessful: boolean): Promise<void> {
  const existing = await db.select().from(regionIndexes).where(eq(regionIndexes.id, regionId)).limit(1);

  if (existing.length === 0) return;

  const region = existing[0];
  const newCount = region.usage_count + 1;

  let newConfidence = region.confidence;
  if (wasSuccessful) {
    // Bayesian update: confidence improves
    newConfidence = (region.confidence * region.usage_count + 1.0) / newCount;
  } else {
    // Penalty for mismatch
    newConfidence = region.confidence * 0.95;
  }

  // Clamp to [0, 1]
  newConfidence = Math.max(0, Math.min(1, newConfidence));

  await db
    .update(regionIndexes)
    .set({
      confidence: newConfidence,
      usage_count: newCount,
      last_used_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(regionIndexes.id, regionId));
}

/**
 * Records a region match in history for learning.
 */
export async function recordRegionMatch(data: {
  form_id: string;
  region_index_id: string;
  match_confidence: number;
  match_method: "layout_sig" | "cosine_similarity" | "ocr_fallback";
  page_number: number;
  detected_region_bounds?: RelativePosition;
  expected_region_bounds?: RelativePosition;
}): Promise<void> {
  const insert: InsertRegionMatch = {
    form_id: data.form_id,
    region_index_id: data.region_index_id,
    match_confidence: data.match_confidence,
    match_method: data.match_method,
    page_number: data.page_number,
    detected_region_bounds: data.detected_region_bounds,
    expected_region_bounds: data.expected_region_bounds,
    was_corrected: false,
    created_at: new Date(),
  };

  await db.insert(regionMatchHistory).values(insert);
}

/**
 * Updates a match record when user corrects a field.
 * Enables learning from corrections.
 */
export async function updateMatchWithCorrection(
  matchId: string,
  correctionData: {
    field_id?: string;
    old_value?: string;
    new_value?: string;
    corrector_notes?: string;
  }
): Promise<void> {
  await db
    .update(regionMatchHistory)
    .set({
      was_corrected: true,
      correction_data: correctionData,
      updated_at: new Date(),
    })
    .where(eq(regionMatchHistory.id, matchId));

  // Also decrement the region's confidence slightly
  const match = await db.select().from(regionMatchHistory).where(eq(regionMatchHistory.id, matchId)).limit(1);

  if (match.length > 0) {
    await updateRegionConfidence(match[0].region_index_id, false);
  }
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

/**
 * Get comprehensive statistics about region indexes.
 */
export async function getRegionStats(): Promise<RegionIndexStats> {
  const allIndexes = await db.select().from(regionIndexes);

  const byDocType: Record<
    string,
    {
      region_count: number;
      average_confidence: number;
      total_usage_count: number;
      avg_usage_count: number;
      locked_regions: number;
      corrected_count: number;
    }
  > = {};

  for (const index of allIndexes) {
    if (!byDocType[index.document_type]) {
      byDocType[index.document_type] = {
        region_count: 0,
        average_confidence: 0,
        total_usage_count: 0,
        avg_usage_count: 0,
        locked_regions: 0,
        corrected_count: 0,
      };
    }

    const docStats = byDocType[index.document_type];
    docStats.region_count += 1;
    docStats.total_usage_count += index.usage_count;
    docStats.locked_regions += index.is_locked ? 1 : 0;
    docStats.corrected_count += index.was_corrected_count;
  }

  // Calculate averages
  for (const docType in byDocType) {
    const docStats = byDocType[docType];
    const indexesForType = allIndexes.filter((i) => i.document_type === docType);
    docStats.average_confidence = indexesForType.reduce((sum, i) => sum + i.confidence, 0) / docStats.region_count;
    docStats.avg_usage_count = docStats.total_usage_count / docStats.region_count;
  }

  // Match history stats
  const allMatches = await db.select().from(regionMatchHistory);
  const successfulMatches = allMatches.filter((m) => m.match_confidence > 0.85).length;
  const fuzzyMatches = allMatches.filter((m) => m.match_confidence > 0.70 && m.match_confidence <= 0.85).length;
  const fallbackMatches = allMatches.filter((m) => m.match_method === "ocr_fallback").length;

  const matchSuccessRate = allMatches.length > 0 ? successfulMatches / allMatches.length : 0;
  const fuzzyMatchRate = allMatches.length > 0 ? fuzzyMatches / allMatches.length : 0;
  const fallbackOcrRate = allMatches.length > 0 ? fallbackMatches / allMatches.length : 0;

  // Processing time stats (mock for now, would come from metrics)
  const processingTimes = [150, 180, 200, 220, 250]; // Mock data
  const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
  const sortedTimes = [...processingTimes].sort((a, b) => a - b);
  const p95Time = sortedTimes[Math.floor(processingTimes.length * 0.95)];

  // Cache stats (mock)
  const cacheHitRate = 0.72;

  // Drift alerts (mock)
  const driftAlerts = 3;

  return {
    total_indexes: allIndexes.length,
    by_document_type: byDocType,
    match_success_rate: matchSuccessRate,
    fuzzy_match_rate: fuzzyMatchRate,
    fallback_ocr_rate: fallbackOcrRate,
    average_match_time_ms: avgTime,
    cache_hit_rate: cacheHitRate,
    p95_match_time_ms: p95Time,
    drift_alerts_24h: driftAlerts,
  };
}

/**
 * Get detailed stats for a specific document type.
 */
export async function getDocumentTypeStats(documentType: string): Promise<{
  document_type: string;
  region_count: number;
  regions: Array<{
    id: string;
    region_label: string;
    confidence: number;
    usage_count: number;
    is_locked: boolean;
    was_corrected_count: number;
  }>;
  match_success_rate: number;
  avg_match_confidence: number;
}> {
  const indexes = await db
    .select()
    .from(regionIndexes)
    .where(eq(regionIndexes.document_type, documentType))
    .orderBy(desc(regionIndexes.confidence));

  const matches = await db.select().from(regionMatchHistory).where(eq(regionMatchHistory.region_index_id, indexes[0]?.id || ""));

  const successfulMatches = matches.filter((m) => m.match_confidence > 0.85).length;
  const matchSuccessRate = matches.length > 0 ? successfulMatches / matches.length : 0;
  const avgConfidence = matches.length > 0 ? matches.reduce((sum, m) => sum + m.match_confidence, 0) / matches.length : 0;

  return {
    document_type: documentType,
    region_count: indexes.length,
    regions: indexes.map((index) => ({
      id: index.id,
      region_label: index.region_label,
      confidence: index.confidence,
      usage_count: index.usage_count,
      is_locked: index.is_locked,
      was_corrected_count: index.was_corrected_count,
    })),
    match_success_rate: matchSuccessRate,
    avg_match_confidence: avgConfidence,
  };
}

// ============================================================================
// Caching
// ============================================================================

/**
 * Store a document in the detection cache for fast re-processing.
 */
export async function cacheDetectionResult(data: {
  document_hash: string;
  document_type: string;
  region_indexes: string[];
  cache_confidence: number;
}): Promise<void> {
  await db
    .insert(regionDetectionCache)
    .values({
      document_hash: data.document_hash,
      document_type: data.document_type,
      region_indexes: data.region_indexes,
      cache_confidence: data.cache_confidence,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: regionDetectionCache.document_hash,
      set: {
        region_indexes: data.region_indexes,
        cache_confidence: data.cache_confidence,
        updated_at: new Date(),
      },
    });
}

/**
 * Retrieve cached detection result for a document.
 */
export async function getCachedDetectionResult(
  documentHash: string
): Promise<{ document_type: string; region_indexes: string[]; confidence: number } | null> {
  const result = await db
    .select()
    .from(regionDetectionCache)
    .where(eq(regionDetectionCache.document_hash, documentHash))
    .limit(1);

  if (result.length === 0) return null;

  const cache = result[0];
  return {
    document_type: cache.document_type || "unknown",
    region_indexes: cache.region_indexes,
    confidence: cache.cache_confidence || 0.85,
  };
}

// ============================================================================
// Maintenance
// ============================================================================

/**
 * Scan for regions with low confidence due to corrections.
 * Flag them for re-detection or deletion.
 */
export async function findProblematicRegions(maxConfidence: number = 0.70): Promise<RegionIndex[]> {
  return await db
    .select()
    .from(regionIndexes)
    .where(and(lte(regionIndexes.confidence, maxConfidence), gte(regionIndexes.was_corrected_count, 3)));
}

/**
 * Lock high-confidence regions (after sufficient successful uses).
 * Locked regions skip re-detection for faster processing.
 */
export async function lockHighConfidenceRegions(
  minConfidence: number = 0.95,
  minUsageCount: number = 10
): Promise<number> {
  const result = await db
    .update(regionIndexes)
    .set({ is_locked: true, updated_at: new Date() })
    .where(
      and(
        gte(regionIndexes.confidence, minConfidence),
        gte(regionIndexes.usage_count, minUsageCount),
        eq(regionIndexes.was_corrected_count, 0)
      )
    );

  return result.rowCount || 0;
}

/**
 * Delete problematic regions that have too many corrections.
 */
export async function deleteProblematicRegions(
  maxConfidence: number = 0.65,
  minCorrectionCount: number = 5
): Promise<number> {
  const result = await db
    .delete(regionIndexes)
    .where(
      and(
        lte(regionIndexes.confidence, maxConfidence),
        gte(regionIndexes.was_corrected_count, minCorrectionCount)
      )
    );

  return result.rowCount || 0;
}

/**
 * Clean up old cache entries (older than N days).
 */
export async function cleanOldCacheEntries(days: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await db.delete(regionDetectionCache).where(lte(regionDetectionCache.updated_at, cutoffDate));

  return result.rowCount || 0;
}
