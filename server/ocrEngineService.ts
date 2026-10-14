/**
 * OCR Engine Service - Node.js Wrapper for the Python Tesseract OCR Microservice
 * Provides abstraction layer with automatic fallback and error handling
 */

import type { FormField } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import axios, { AxiosError } from "axios";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://localhost:5050";
// The OCR sidecar runs Tesseract — it is the only engine it has. (An
// earlier label named a different engine that was never actually run.)
const OCR_ENGINE = process.env.OCR_ENGINE || "tesseract";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const SERVICE_TIMEOUT_MS = 60000;

// ============================================================================
// Types
// ============================================================================

export interface OCRBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  page: number;
}

export interface OCRExtractedField {
  label: string;
  value: string;
  field_type: string;
  bbox: OCRBoundingBox;
  confidence: number;
  page: number;
}

export interface OCRServiceResponse {
  success: boolean;
  fields: OCRExtractedField[];
  layout?: {
    regions?: any[];
  };
  pages_processed: number;
  engine_used: string;
  processing_time_ms: number;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  ocr_engine?: string;
  tesseract_available: boolean;
  timestamp: string;
}

export interface OCRResult {
  fields: FormField[];
  regions: LayoutRegion[];
}

export interface LayoutRegion {
  type: string;
  bbox: OCRBoundingBox;
  confidence?: number;
}

// ============================================================================
// Service Health Tracking
// ============================================================================

interface ServiceStatus {
  available: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  isHealthy: boolean;
}

const serviceStatus: ServiceStatus = {
  available: false,
  lastCheck: new Date(0),
  consecutiveFailures: 0,
  isHealthy: false,
};

// ============================================================================
// Health Check and Service Discovery
// ============================================================================

export async function checkOCRServiceHealth(): Promise<boolean> {
  try {
    const response = await axios.get<HealthCheckResponse>(
      `${OCR_SERVICE_URL}/health`,
      {
        timeout: 5000,
      }
    );

    serviceStatus.available = response.status === 200 && response.data.status === "healthy";
    serviceStatus.lastCheck = new Date();

    if (serviceStatus.available) {
      serviceStatus.consecutiveFailures = 0;
      serviceStatus.isHealthy = true;
    } else {
      serviceStatus.consecutiveFailures++;
    }

    return serviceStatus.available;
  } catch (error) {
    serviceStatus.available = false;
    serviceStatus.consecutiveFailures++;
    serviceStatus.isHealthy = false;

    if (serviceStatus.consecutiveFailures <= 3) {
      console.warn(`OCR Service health check failed: ${(error as Error).message}`);
    }

    return false;
  }
}

export async function getOCREngineStatus(): Promise<{
  engine: string;
  available: boolean;
  healthy: boolean;
  lastCheck: string;
  consecutive_failures: number;
}> {
  const isHealthy = serviceStatus.isHealthy || (await checkOCRServiceHealth());

  return {
    engine: OCR_ENGINE,
    available: serviceStatus.available,
    healthy: isHealthy,
    lastCheck: serviceStatus.lastCheck.toISOString(),
    consecutive_failures: serviceStatus.consecutiveFailures,
  };
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `OCR attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
        );
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error("All retries failed");
}

// ============================================================================
// Tesseract OCR Extraction (via the Python sidecar)
// ============================================================================

export async function extractWithTesseract(
  imageBuffer: Buffer,
  pageNum: number = 1
): Promise<{
  fields: FormField[];
  regions: LayoutRegion[];
}> {
  // Check service health first
  const isHealthy = await checkOCRServiceHealth();

  if (!isHealthy) {
    throw new Error("OCR Service is not available");
  }

  // Create FormData for multipart upload
  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", imageBuffer, {
    filename: `page_${pageNum}.png`,
    contentType: "image/png",
  });

  return executeWithRetry(async () => {
    const response = await axios.post<OCRServiceResponse>(
      `${OCR_SERVICE_URL}/ocr/extract`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    if (!response.data.success) {
      throw new Error(`OCR extraction failed: ${response.data.error}`);
    }

    // Convert OCR response to FormField format
    const fields: FormField[] = response.data.fields.map((field, index) => ({
      id: `field_${pageNum}_${index}`,
      label: field.label,
      value: field.value || "",
      type: mapFieldType(field.field_type),
      page: field.page,
      bbox: [field.bbox.x0, field.bbox.y0, field.bbox.x1 - field.bbox.x0, field.bbox.y1 - field.bbox.y0],
      confidence: Math.round(field.confidence * 100),
    }));

    // Extract layout regions if available
    const regions: LayoutRegion[] = response.data.layout?.regions || [];

    return {
      fields,
      regions,
    };
  });
}

/**
 * Extract fields from a single image/page
 * Primary method for direct image OCR
 */
export async function extractFieldsFromImage(
  imageBuffer: Buffer,
  pageNum: number = 1
): Promise<FormField[]> {
  try {
    const result = await extractWithTesseract(imageBuffer, pageNum);
    return result.fields;
  } catch (error) {
    console.error(
      `Failed to extract fields from page ${pageNum}: ${(error as Error).message}`
    );
    throw error;
  }
}

/**
 * Extract layout information from image
 * Detects lines, checkboxes, table structures
 */
export async function extractLayoutFromImage(
  imageBuffer: Buffer,
  pageNum: number = 1
): Promise<any> {
  const isHealthy = await checkOCRServiceHealth();

  if (!isHealthy) {
    throw new Error("OCR Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", imageBuffer, {
    filename: `page_${pageNum}.png`,
    contentType: "image/png",
  });

  return executeWithRetry(async () => {
    const response = await axios.post(
      `${OCR_SERVICE_URL}/ocr/layout`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    if (!response.data.success) {
      throw new Error(`Layout detection failed: ${response.data.error}`);
    }

    return response.data.layout;
  });
}

/**
 * Extract fields using local Vision Language Model (VLM)
 * Calls Python VLM service for advanced field detection with LLM reasoning
 */
export async function extractWithLocalVLM(
  imageBuffer: Buffer,
  pageNum: number = 1,
  formType?: string
): Promise<{
  fields: FormField[];
  regions: LayoutRegion[];
}> {
  const isHealthy = await checkOCRServiceHealth();

  if (!isHealthy) {
    throw new Error("OCR Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", imageBuffer, {
    filename: `page_${pageNum}.png`,
    contentType: "image/png",
  });

  if (formType) {
    form.append("form_type", formType);
  }

  return executeWithRetry(async () => {
    const response = await axios.post<OCRServiceResponse>(
      `${OCR_SERVICE_URL}/ocr/vlm-extract`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    if (!response.data.success) {
      throw new Error(`VLM extraction failed: ${response.data.error}`);
    }

    // Convert OCR response to FormField format
    const fields: FormField[] = response.data.fields.map((field, index) => ({
      id: `vlm_${pageNum}_${index}`,
      label: field.label,
      value: field.value || "",
      type: mapFieldType(field.field_type),
      page: field.page,
      bbox: [field.bbox.x0, field.bbox.y0, field.bbox.x1 - field.bbox.x0, field.bbox.y1 - field.bbox.y0],
      confidence: Math.round(field.confidence * 100),
      required: field.label?.includes("*") || undefined,
    }));

    // Extract layout regions if available
    const regions: LayoutRegion[] = response.data.layout?.regions || [];

    return {
      fields,
      regions,
    };
  });
}

/**
 * Preprocess image for better OCR results
 * Returns preprocessing information (not the actual image)
 */
export async function preprocessImage(
  imageBuffer: Buffer,
  pageNum: number = 1
): Promise<any> {
  const isHealthy = await checkOCRServiceHealth();

  if (!isHealthy) {
    throw new Error("OCR Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", imageBuffer, {
    filename: `page_${pageNum}.png`,
    contentType: "image/png",
  });

  return executeWithRetry(async () => {
    const response = await axios.post(
      `${OCR_SERVICE_URL}/ocr/preprocess`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    if (!response.data.success) {
      throw new Error(`Preprocessing failed: ${response.data.error}`);
    }

    return response.data;
  });
}

// ============================================================================
// Field Type Mapping
// ============================================================================

function mapFieldType(
  ocrFieldType: string
): "text" | "checkbox" | "signature" | "date" | "number" {
  const typeMap: Record<string, "text" | "checkbox" | "signature" | "date" | "number"> = {
    text: "text",
    checkbox: "checkbox",
    checkmark: "checkbox",
    signature: "signature",
    date: "date",
    number: "number",
    numeric: "number",
  };

  return typeMap[ocrFieldType.toLowerCase()] || "text";
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Extract fields from multiple images in parallel
 * Respects rate limiting and service availability
 */
export async function extractFieldsFromImages(
  imageBuffers: Buffer[],
  startPage: number = 1,
  maxConcurrent: number = 3
): Promise<FormField[][]> {
  const results: FormField[][] = [];

  // Process in batches to avoid overwhelming the service
  for (let i = 0; i < imageBuffers.length; i += maxConcurrent) {
    const batch = imageBuffers.slice(i, i + maxConcurrent);
    const pageNumbers = batch.map((_, idx) => startPage + i + idx);

    const batchResults = await Promise.allSettled(
      batch.map((buffer, idx) => extractFieldsFromImage(buffer, pageNumbers[idx]))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push([]); // Empty array for failed pages
      }
    }
  }

  return results;
}

// ============================================================================
// Service Startup/Shutdown
// ============================================================================

/**
 * Start the OCR service (as background process or Docker container)
 */
export async function startOCRService(): Promise<boolean> {
  // Check if already running
  const isHealthy = await checkOCRServiceHealth();
  if (isHealthy) {
    console.log("OCR Service is already running");
    return true;
  }

  try {
    // Try to start via Docker if available
    const { stdout } = await execAsync(
      `docker ps | grep ocr-service || docker-compose -f docker-compose.ocr.yml up -d ocr-service 2>/dev/null`
    );

    console.log("Starting OCR Service...", stdout);

    // Wait for service to be ready (max 30 seconds)
    let attempts = 0;
    while (attempts < 30) {
      await delay(1000);
      const healthy = await checkOCRServiceHealth();
      if (healthy) {
        console.log("OCR Service started successfully");
        return true;
      }
      attempts++;
    }

    throw new Error("Service failed to start within timeout");
  } catch (error) {
    console.warn(
      `Failed to start OCR Service via Docker: ${(error as Error).message}`
    );
    console.log("Ensure docker-compose.ocr.yml is in the project root");
    return false;
  }
}

/**
 * Stop the OCR service
 */
export async function stopOCRService(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker-compose -f docker-compose.ocr.yml down 2>/dev/null`
    );

    console.log("Stopping OCR Service...", stdout);

    await delay(2000);

    const isHealthy = await checkOCRServiceHealth();
    return !isHealthy;
  } catch (error) {
    console.warn(`Failed to stop OCR Service: ${(error as Error).message}`);
    return false;
  }
}

// ============================================================================
// Status Export for Monitoring
// ============================================================================

export function getServiceStatus(): ServiceStatus {
  return { ...serviceStatus };
}

// ============================================================================
// Initialization - Check service on first import
// ============================================================================

// Perform initial health check asynchronously (don't block module load)
if (process.env.NODE_ENV !== "test") {
  (async () => {
    const timeout = setTimeout(() => {
      console.warn(
        "OCR Service health check timeout - service may not be available"
      );
    }, 5000);

    try {
      const isHealthy = await checkOCRServiceHealth();
      clearTimeout(timeout);

      if (isHealthy) {
        console.log(`OCR Engine initialized: ${OCR_ENGINE}`);
      } else {
        console.warn(`OCR Service unavailable at ${OCR_SERVICE_URL}`);
        console.log("Run: docker-compose -f docker-compose.ocr.yml up -d ocr-service");
      }
    } catch (error) {
      clearTimeout(timeout);
      console.warn(
        `OCR Service initialization failed: ${(error as Error).message}`
      );
    }
  })();
}
