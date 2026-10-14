import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "./db";
import { systemMetrics, type SystemMetric, type InsertSystemMetric } from "@shared/schema";
import { getQualityLevel, type OCRQualityLevel } from "./ocrService";

export interface MetricsSummary {
  totalForms: number;
  successRate: number;
  averageOcrConfidence: number;
  ocrQualityDistribution: { high: number; medium: number; low: number; unusable: number };
  averageProcessingTime: number;
}

export interface DailyMetric {
  date: string;
  totalForms: number;
  successCount: number;
  failureCount: number;
  averageConfidence: number;
  averageProcessingTime: number;
  qualityDistribution: { high: number; medium: number; low: number; unusable: number };
}

interface FormProcessingMetadata {
  totalConfidence: number;
  formCount: number;
  totalProcessingTime: number;
  timeCount: number;
  lastFormId?: string;
}

interface OcrQualityMetadata {
  qualityDistribution: { high: number; medium: number; low: number; unusable: number };
  totalConfidence: number;
  confidenceCount: number;
  lastFormId?: string;
}

function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function getOrCreateDailyMetric(
  date: Date,
  metricType: string
): Promise<SystemMetric | null> {
  const startOfDay = getStartOfDay(date);
  
  const [existing] = await db
    .select()
    .from(systemMetrics)
    .where(
      and(
        eq(systemMetrics.metricType, metricType),
        gte(systemMetrics.date, startOfDay),
        lte(systemMetrics.date, new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000))
      )
    );

  if (existing) {
    return existing;
  }

  const initialMetadata = metricType === "form_processing" 
    ? { totalConfidence: 0, formCount: 0, totalProcessingTime: 0, timeCount: 0 }
    : { qualityDistribution: { high: 0, medium: 0, low: 0, unusable: 0 }, totalConfidence: 0, confidenceCount: 0 };

  const [newMetric] = await db
    .insert(systemMetrics)
    .values({
      date: startOfDay,
      metricType,
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      avgValue: 0,
      minValue: null,
      maxValue: null,
      metadata: initialMetadata,
    })
    .returning();

  return newMetric;
}

export async function trackFormProcessing(
  formId: string,
  ocrConfidence: number | null,
  processingTimeMs: number,
  status: "success" | "failed"
): Promise<void> {
  try {
    const now = new Date();
    const metric = await getOrCreateDailyMetric(now, "form_processing");
    if (!metric) return;

    const isSuccess = status === "success";
    const currentMetadata = (metric.metadata as FormProcessingMetadata) || {
      totalConfidence: 0,
      formCount: 0,
      totalProcessingTime: 0,
      timeCount: 0,
    };
    
    const newTotalConfidence = ocrConfidence !== null 
      ? currentMetadata.totalConfidence + ocrConfidence
      : currentMetadata.totalConfidence;
    const newFormCount = ocrConfidence !== null 
      ? currentMetadata.formCount + 1
      : currentMetadata.formCount;
    const newTotalProcessingTime = currentMetadata.totalProcessingTime + processingTimeMs;
    const newTimeCount = currentMetadata.timeCount + 1;

    const avgConfidence = newFormCount > 0 ? newTotalConfidence / newFormCount : null;

    await db
      .update(systemMetrics)
      .set({
        totalCount: sql`${systemMetrics.totalCount} + 1`,
        successCount: isSuccess 
          ? sql`${systemMetrics.successCount} + 1` 
          : systemMetrics.successCount,
        failureCount: !isSuccess 
          ? sql`${systemMetrics.failureCount} + 1` 
          : systemMetrics.failureCount,
        avgValue: avgConfidence,
        minValue: ocrConfidence !== null && (metric.minValue === null || ocrConfidence < metric.minValue)
          ? ocrConfidence
          : metric.minValue,
        maxValue: ocrConfidence !== null && (metric.maxValue === null || ocrConfidence > metric.maxValue)
          ? ocrConfidence
          : metric.maxValue,
        metadata: {
          totalConfidence: newTotalConfidence,
          formCount: newFormCount,
          totalProcessingTime: newTotalProcessingTime,
          timeCount: newTimeCount,
          lastFormId: formId,
        },
        updatedAt: now,
      })
      .where(eq(systemMetrics.id, metric.id));

    console.log(`[metrics] Tracked form processing: ${formId}, status: ${status}, confidence: ${ocrConfidence}, time: ${processingTimeMs}ms`);
  } catch (error) {
    console.error("[metrics] Error tracking form processing:", error);
  }
}

export async function trackOcrQuality(
  formId: string,
  qualityLevel: OCRQualityLevel,
  confidence: number
): Promise<void> {
  try {
    const now = new Date();
    const metric = await getOrCreateDailyMetric(now, "ocr_quality");
    if (!metric) return;

    const currentMetadata = (metric.metadata as OcrQualityMetadata) || {
      qualityDistribution: { high: 0, medium: 0, low: 0, unusable: 0 },
      totalConfidence: 0,
      confidenceCount: 0,
    };

    const qualityDistribution = currentMetadata.qualityDistribution || {
      high: 0,
      medium: 0,
      low: 0,
      unusable: 0,
    };

    qualityDistribution[qualityLevel] = (qualityDistribution[qualityLevel] || 0) + 1;

    const newTotalConfidence = currentMetadata.totalConfidence + confidence;
    const newConfidenceCount = currentMetadata.confidenceCount + 1;
    const avgConfidence = newTotalConfidence / newConfidenceCount;

    await db
      .update(systemMetrics)
      .set({
        totalCount: sql`${systemMetrics.totalCount} + 1`,
        avgValue: avgConfidence,
        minValue: metric.minValue === null || confidence < metric.minValue
          ? confidence
          : metric.minValue,
        maxValue: metric.maxValue === null || confidence > metric.maxValue
          ? confidence
          : metric.maxValue,
        metadata: {
          qualityDistribution: qualityDistribution,
          totalConfidence: newTotalConfidence,
          confidenceCount: newConfidenceCount,
          lastFormId: formId,
        },
        updatedAt: now,
      })
      .where(eq(systemMetrics.id, metric.id));

    console.log(`[metrics] Tracked OCR quality: ${formId}, level: ${qualityLevel}, confidence: ${confidence}`);
  } catch (error) {
    console.error("[metrics] Error tracking OCR quality:", error);
  }
}

export async function getMetricsSummary(
  startDate: Date,
  endDate: Date
): Promise<MetricsSummary> {
  try {
    const processingMetrics = await db
      .select()
      .from(systemMetrics)
      .where(
        and(
          eq(systemMetrics.metricType, "form_processing"),
          gte(systemMetrics.date, startDate),
          lte(systemMetrics.date, endDate)
        )
      );

    const qualityMetrics = await db
      .select()
      .from(systemMetrics)
      .where(
        and(
          eq(systemMetrics.metricType, "ocr_quality"),
          gte(systemMetrics.date, startDate),
          lte(systemMetrics.date, endDate)
        )
      );

    let totalForms = 0;
    let totalSuccess = 0;
    let totalFailure = 0;
    let totalConfidenceSum = 0;
    let totalFormCount = 0;
    let totalProcessingTimeSum = 0;
    let totalTimeCount = 0;

    for (const metric of processingMetrics) {
      totalForms += metric.totalCount || 0;
      totalSuccess += metric.successCount || 0;
      totalFailure += metric.failureCount || 0;
      
      const metadata = metric.metadata as FormProcessingMetadata;
      if (metadata) {
        totalConfidenceSum += metadata.totalConfidence || 0;
        totalFormCount += metadata.formCount || 0;
        totalProcessingTimeSum += metadata.totalProcessingTime || 0;
        totalTimeCount += metadata.timeCount || 0;
      }
    }

    const qualityDistribution = { high: 0, medium: 0, low: 0, unusable: 0 };
    for (const metric of qualityMetrics) {
      const metadata = metric.metadata as OcrQualityMetadata;
      const dist = metadata?.qualityDistribution || {};
      qualityDistribution.high += dist.high || 0;
      qualityDistribution.medium += dist.medium || 0;
      qualityDistribution.low += dist.low || 0;
      qualityDistribution.unusable += dist.unusable || 0;
    }

    return {
      totalForms,
      successRate: totalForms > 0 ? (totalSuccess / totalForms) * 100 : 0,
      averageOcrConfidence: totalFormCount > 0 ? totalConfidenceSum / totalFormCount : 0,
      ocrQualityDistribution: qualityDistribution,
      averageProcessingTime: totalTimeCount > 0 ? totalProcessingTimeSum / totalTimeCount : 0,
    };
  } catch (error) {
    console.error("[metrics] Error getting metrics summary:", error);
    return {
      totalForms: 0,
      successRate: 0,
      averageOcrConfidence: 0,
      ocrQualityDistribution: { high: 0, medium: 0, low: 0, unusable: 0 },
      averageProcessingTime: 0,
    };
  }
}

export async function getDailyMetrics(days: number): Promise<DailyMetric[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const processingMetrics = await db
      .select()
      .from(systemMetrics)
      .where(
        and(
          eq(systemMetrics.metricType, "form_processing"),
          gte(systemMetrics.date, startDate),
          lte(systemMetrics.date, endDate)
        )
      )
      .orderBy(desc(systemMetrics.date));

    const qualityMetrics = await db
      .select()
      .from(systemMetrics)
      .where(
        and(
          eq(systemMetrics.metricType, "ocr_quality"),
          gte(systemMetrics.date, startDate),
          lte(systemMetrics.date, endDate)
        )
      )
      .orderBy(desc(systemMetrics.date));

    const qualityByDate = new Map<string, { high: number; medium: number; low: number; unusable: number }>();
    for (const metric of qualityMetrics) {
      const dateKey = metric.date.toISOString().split("T")[0];
      const metadata = metric.metadata as OcrQualityMetadata;
      const dist = metadata?.qualityDistribution || {};
      qualityByDate.set(dateKey, {
        high: dist.high || 0,
        medium: dist.medium || 0,
        low: dist.low || 0,
        unusable: dist.unusable || 0,
      });
    }

    const dailyMetrics: DailyMetric[] = processingMetrics.map((metric) => {
      const dateKey = metric.date.toISOString().split("T")[0];
      const metadata = metric.metadata as FormProcessingMetadata;
      const avgProcessingTime = metadata && metadata.timeCount > 0
        ? metadata.totalProcessingTime / metadata.timeCount
        : 0;

      return {
        date: dateKey,
        totalForms: metric.totalCount || 0,
        successCount: metric.successCount || 0,
        failureCount: metric.failureCount || 0,
        averageConfidence: metric.avgValue || 0,
        averageProcessingTime: avgProcessingTime,
        qualityDistribution: qualityByDate.get(dateKey) || { high: 0, medium: 0, low: 0, unusable: 0 },
      };
    });

    const existingDates = new Set(dailyMetrics.map((m) => m.date));
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      if (!existingDates.has(dateKey)) {
        dailyMetrics.push({
          date: dateKey,
          totalForms: 0,
          successCount: 0,
          failureCount: 0,
          averageConfidence: 0,
          averageProcessingTime: 0,
          qualityDistribution: qualityByDate.get(dateKey) || { high: 0, medium: 0, low: 0, unusable: 0 },
        });
      }
    }

    return dailyMetrics.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("[metrics] Error getting daily metrics:", error);
    return [];
  }
}
