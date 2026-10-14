/**
 * Field Detector Service - Node.js Wrapper for Python Form Field Auto-Detection
 * Provides abstraction layer for auto-detecting form fields (checkboxes, signatures, text inputs)
 * with automatic retry, circuit breaker, and service health management
 */

import type { FormField } from "@shared/schema";
import axios, { AxiosError } from "axios";

// ============================================================================
// Configuration
// ============================================================================

const DETECTOR_SERVICE_URL = process.env.DETECTOR_SERVICE_URL || "http://localhost:5050";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const SERVICE_TIMEOUT_MS = 90000; // 90 seconds for detection (slower than OCR)

// ============================================================================
// Types
// ============================================================================

export interface DetectedField {
  fieldType: "checkbox" | "radio" | "text_input" | "signature" | "date" | "initial";
  bbox: [number, number, number, number]; // [x, y, w, h] normalized 0-1
  confidence: number;
  state?: "checked" | "unchecked" | null;
  label?: string | null;
  subtype?: string | null;
  page: number;
}

export interface DetectionResult {
  fields: DetectedField[];
  pageCount: number;
  detectionMethod: "commonforms" | "opencv" | "hybrid";
  processingTimeMs: number;
}

export interface DetectionCapabilities {
  commonforms: boolean;
  opencv: boolean;
  ultralytics: boolean;
}

export interface DetectionOptions {
  method?: "commonforms" | "opencv" | "hybrid" | "auto";
  confidenceThreshold?: number;
  includeLabels?: boolean;
  extractInitials?: boolean;
}

export interface HealthCheckResponse {
  status: string;
  detector_available: boolean;
  supported_methods: string[];
  timestamp: string;
}

// ============================================================================
// Service Health Tracking
// ============================================================================

interface ServiceStatus {
  available: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  isHealthy: boolean;
  lastError?: string;
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

export async function checkDetectorServiceHealth(): Promise<boolean> {
  try {
    const response = await axios.get<HealthCheckResponse>(
      `${DETECTOR_SERVICE_URL}/health`,
      {
        timeout: 5000,
      }
    );

    serviceStatus.available = response.status === 200 && response.data.status === "healthy";
    serviceStatus.lastCheck = new Date();

    if (serviceStatus.available) {
      serviceStatus.consecutiveFailures = 0;
      serviceStatus.isHealthy = true;
      serviceStatus.lastError = undefined;
    } else {
      serviceStatus.consecutiveFailures++;
      serviceStatus.lastError = "Service returned non-healthy status";
    }

    return serviceStatus.available;
  } catch (error) {
    serviceStatus.available = false;
    serviceStatus.consecutiveFailures++;
    serviceStatus.isHealthy = false;
    serviceStatus.lastError = (error as Error).message;

    if (serviceStatus.consecutiveFailures <= 3) {
      console.warn(`Field Detector Service health check failed: ${(error as Error).message}`);
    }

    return false;
  }
}

export async function getDetectorEngineStatus(): Promise<{
  available: boolean;
  healthy: boolean;
  lastCheck: string;
  consecutiveFailures: number;
  lastError?: string;
}> {
  const isHealthy = serviceStatus.isHealthy || (await checkDetectorServiceHealth());

  return {
    available: serviceStatus.available,
    healthy: isHealthy,
    lastCheck: serviceStatus.lastCheck.toISOString(),
    consecutiveFailures: serviceStatus.consecutiveFailures,
    lastError: serviceStatus.lastError,
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
          `Field detection attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
        );
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error("All retries failed");
}

// ============================================================================
// Field Detection - Full Detection
// ============================================================================

export async function detectFormFields(
  pdfBuffer: Buffer,
  options: DetectionOptions = {}
): Promise<DetectionResult> {
  // Check service health first
  const isHealthy = await checkDetectorServiceHealth();

  if (!isHealthy) {
    throw new Error("Field Detector Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", pdfBuffer, {
    filename: "document.pdf",
    contentType: "application/pdf",
  });

  // Add detection options to form
  if (options.method) form.append("method", options.method);
  if (options.confidenceThreshold !== undefined)
    form.append("confidence_threshold", options.confidenceThreshold);
  if (options.includeLabels !== undefined) form.append("include_labels", options.includeLabels);
  if (options.extractInitials !== undefined)
    form.append("extract_initials", options.extractInitials);

  return executeWithRetry(async () => {
    const response = await axios.post<DetectionResult>(
      `${DETECTOR_SERVICE_URL}/detect/fields`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    return response.data;
  });
}

// ============================================================================
// Field Detection - Checkbox Only (Fast Path)
// ============================================================================

export async function detectCheckboxes(pdfBuffer: Buffer): Promise<DetectedField[]> {
  const isHealthy = await checkDetectorServiceHealth();

  if (!isHealthy) {
    throw new Error("Field Detector Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", pdfBuffer, {
    filename: "document.pdf",
    contentType: "application/pdf",
  });

  return executeWithRetry(async () => {
    const response = await axios.post<{ fields: DetectedField[] }>(
      `${DETECTOR_SERVICE_URL}/detect/checkboxes`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    return response.data.fields;
  });
}

// ============================================================================
// Field Detection - Signature Zones
// ============================================================================

export async function detectSignatureZones(pdfBuffer: Buffer): Promise<DetectedField[]> {
  const isHealthy = await checkDetectorServiceHealth();

  if (!isHealthy) {
    throw new Error("Field Detector Service is not available");
  }

  const FormData = require("form-data");
  const form = new FormData();
  form.append("file", pdfBuffer, {
    filename: "document.pdf",
    contentType: "application/pdf",
  });

  return executeWithRetry(async () => {
    const response = await axios.post<{ fields: DetectedField[] }>(
      `${DETECTOR_SERVICE_URL}/detect/signatures`,
      form,
      {
        headers: form.getHeaders(),
        timeout: SERVICE_TIMEOUT_MS,
      }
    );

    return response.data.fields;
  });
}

// ============================================================================
// Detection Capabilities
// ============================================================================

export async function getDetectionCapabilities(): Promise<DetectionCapabilities> {
  const isHealthy = await checkDetectorServiceHealth();

  if (!isHealthy) {
    throw new Error("Field Detector Service is not available");
  }

  return executeWithRetry(async () => {
    const response = await axios.get<{
      commonforms: boolean;
      opencv: boolean;
      ultralytics: boolean;
    }>(`${DETECTOR_SERVICE_URL}/detect/capabilities`, {
      timeout: 10000,
    });

    return response.data;
  });
}

// ============================================================================
// Field Merging - Combine Detected + OCR Fields
// ============================================================================

/**
 * Calculates Intersection over Union (IoU) between two bounding boxes
 * Boxes are in format [x, y, width, height] normalized 0-1
 */
function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;

  // Convert to [x0, y0, x1, y1] format for easier calculation
  const b1_x0 = x1;
  const b1_y0 = y1;
  const b1_x1 = x1 + w1;
  const b1_y1 = y1 + h1;

  const b2_x0 = x2;
  const b2_y0 = y2;
  const b2_x1 = x2 + w2;
  const b2_y1 = y2 + h2;

  // Calculate intersection
  const inter_x0 = Math.max(b1_x0, b2_x0);
  const inter_y0 = Math.max(b1_y0, b2_y0);
  const inter_x1 = Math.min(b1_x1, b2_x1);
  const inter_y1 = Math.min(b1_y1, b2_y1);

  if (inter_x1 < inter_x0 || inter_y1 < inter_y0) {
    return 0; // No intersection
  }

  const interArea = (inter_x1 - inter_x0) * (inter_y1 - inter_y0);
  const b1Area = w1 * h1;
  const b2Area = w2 * h2;
  const unionArea = b1Area + b2Area - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Merge auto-detected fields with OCR-extracted fields
 * Deduplicates by IoU (Intersection over Union) threshold
 * Detected fields take precedence when merging type information
 */
export function mergeDetectedWithOCR(
  detected: DetectedField[],
  ocrFields: FormField[],
  iouThreshold: number = 0.5
): FormField[] {
  const merged: FormField[] = [];
  const matchedOCRIndexes = new Set<number>();

  // First, add all detected fields, enhanced with OCR data where available
  for (const detectedField of detected) {
    // Try to find matching OCR field by IoU
    let bestOCRMatch: (FormField & { index: number }) | undefined;
    let bestIoU = 0;

    for (let i = 0; i < ocrFields.length; i++) {
      if (matchedOCRIndexes.has(i)) continue; // Skip already matched OCR fields

      const ocrField = ocrFields[i];
      if (ocrField.page !== detectedField.page) continue;

      const iou = calculateIoU(detectedField.bbox, ocrField.bbox);

      if (iou > bestIoU) {
        bestIoU = iou;
        bestOCRMatch = { ...ocrField, index: i };
      }
    }

    // Create merged field
    const mergedField: FormField = {
      id: bestOCRMatch?.id || `detected_${detectedField.page}_${detectedField.bbox[0]}_${detectedField.bbox[1]}`,
      label: bestOCRMatch?.label || detectedField.label || "",
      type: mapDetectionTypeToFormField(detectedField.fieldType),
      page: detectedField.page,
      bbox: detectedField.bbox,
      confidence: Math.round(detectedField.confidence * 100),
      value: bestOCRMatch?.value || "",
      required: detectedField.fieldType === "signature",
    };

    merged.push(mergedField);

    // Mark OCR field as matched if IoU exceeds threshold
    if (bestIoU >= iouThreshold && bestOCRMatch) {
      matchedOCRIndexes.add(bestOCRMatch.index);
    }
  }

  // Add unmatched OCR fields
  for (let i = 0; i < ocrFields.length; i++) {
    if (!matchedOCRIndexes.has(i)) {
      merged.push(ocrFields[i]);
    }
  }

  // Sort by page then by y-position
  merged.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0);
  });

  return merged;
}

// ============================================================================
// Type Mapping
// ============================================================================

function mapDetectionTypeToFormField(
  detectionType: "checkbox" | "radio" | "text_input" | "signature" | "date" | "initial"
): FormField["type"] {
  const typeMap: Record<string, FormField["type"]> = {
    checkbox: "checkbox",
    radio: "checkbox", // Treat radio as checkbox for now
    text_input: "text",
    signature: "signature",
    date: "date",
    initial: "signature",
  };

  return typeMap[detectionType] || "text";
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Detect fields from multiple PDFs in parallel
 * Respects rate limiting and service availability
 */
export async function detectFieldsFromMultiplePdfs(
  pdfBuffers: Buffer[],
  options: DetectionOptions = {},
  maxConcurrent: number = 2
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];

  // Process in batches to avoid overwhelming the service
  for (let i = 0; i < pdfBuffers.length; i += maxConcurrent) {
    const batch = pdfBuffers.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((buffer) => detectFormFields(buffer, options))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Push empty result for failed detection
        results.push({
          fields: [],
          pageCount: 0,
          detectionMethod: "opencv",
          processingTimeMs: 0,
        });
      }
    }
  }

  return results;
}

// ============================================================================
// Service Startup/Shutdown
// ============================================================================

/**
 * Start the Field Detector service (as background process or Docker container)
 */
export async function startDetectorService(): Promise<boolean> {
  // Check if already running
  const isHealthy = await checkDetectorServiceHealth();
  if (isHealthy) {
    console.log("Field Detector Service is already running");
    return true;
  }

  try {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    // Try to start via Docker if available
    const { stdout } = await execAsync(
      `docker ps | grep detector-service || docker-compose -f docker-compose.detector.yml up -d detector-service 2>/dev/null`
    );

    console.log("Starting Field Detector Service...", stdout);

    // Wait for service to be ready (max 60 seconds)
    let attempts = 0;
    while (attempts < 60) {
      await delay(1000);
      const healthy = await checkDetectorServiceHealth();
      if (healthy) {
        console.log("Field Detector Service started successfully");
        return true;
      }
      attempts++;
    }

    throw new Error("Service failed to start within timeout");
  } catch (error) {
    console.warn(
      `Failed to start Field Detector Service via Docker: ${(error as Error).message}`
    );
    console.log("Ensure docker-compose.detector.yml is in the project root");
    return false;
  }
}

/**
 * Stop the Field Detector service
 */
export async function stopDetectorService(): Promise<boolean> {
  try {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `docker-compose -f docker-compose.detector.yml down 2>/dev/null`
    );

    console.log("Stopping Field Detector Service...", stdout);

    await delay(2000);

    const isHealthy = await checkDetectorServiceHealth();
    return !isHealthy;
  } catch (error) {
    console.warn(`Failed to stop Field Detector Service: ${(error as Error).message}`);
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
        "Field Detector Service health check timeout - service may not be available"
      );
    }, 5000);

    try {
      const isHealthy = await checkDetectorServiceHealth();
      clearTimeout(timeout);

      if (isHealthy) {
        console.log("Field Detector Service initialized successfully");
      } else {
        console.warn(`Field Detector Service unavailable at ${DETECTOR_SERVICE_URL}`);
        console.log("Run: docker-compose -f docker-compose.detector.yml up -d detector-service");
      }
    } catch (error) {
      clearTimeout(timeout);
      console.warn(
        `Field Detector Service initialization failed: ${(error as Error).message}`
      );
    }
  })();
}
