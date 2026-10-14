import type { FormField } from "@shared/schema";
import { uploadPageImage } from "./objectStorageService";
import { checkPdftoppm, isPdftoppmMissingError, POPPLER_MISSING_MESSAGE } from "./systemDeps";
import { PDFDocument } from "pdf-lib";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

// OCR Engine Service - Surya/MMOCR integration
import {
  extractFieldsFromImage,
  extractLayoutFromImage,
  checkOCRServiceHealth,
  getOCREngineStatus,
} from "./ocrEngineService";

const execAsync = promisify(exec);

// ============================================================================
// Document Hash Cache - Avoid re-processing identical PDFs
// ============================================================================
interface CachedResult {
  result: OCRResult;
  timestamp: number;
}

const documentCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 100; // Maximum cached documents

export function computeDocumentHash(pdfBuffer: Buffer): string {
  return crypto.createHash('sha256').update(pdfBuffer).digest('hex').slice(0, 16);
}

function getCachedResult(hash: string): OCRResult | null {
  const cached = documentCache.get(hash);
  if (!cached) return null;
  
  // Check if cache entry has expired
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    documentCache.delete(hash);
    return null;
  }
  
  return cached.result;
}

function setCachedResult(hash: string, result: OCRResult): void {
  // Evict oldest entries if cache is full
  if (documentCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = documentCache.keys().next().value;
    if (oldestKey) documentCache.delete(oldestKey);
  }
  
  // Store a copy of the result without mutating the method field
  documentCache.set(hash, {
    result: { ...result },
    timestamp: Date.now(),
  });
}

export function clearDocumentCache(): void {
  documentCache.clear();
}

// OCR Quality Thresholds
export const OCR_THRESHOLDS = {
  HIGH_QUALITY: 85,
  MEDIUM_QUALITY: 70,
  LOW_QUALITY: 50,
  UNUSABLE: 30,
};

export type OCRQualityLevel = "high" | "medium" | "low" | "unusable";

// Specific, honest processing-failure kinds (defect 4). "scan_quality" is
// used ONLY when OCR actually ran and measured a low confidence — never as
// a blanket message for unrelated failures. "detector_unavailable" and
// "dependency_missing" describe degraded operation, not a broken form.
export type ProcessingErrorKind =
  | "encrypted_pdf"
  | "corrupt_pdf"
  | "not_pdf"
  | "invalid_pdf"
  | "file_too_large"
  | "file_too_small"
  | "too_many_pages"
  | "dependency_missing"
  | "detector_unavailable"
  | "scan_quality"
  | "processing_failed";

export interface OCRResult {
  success: boolean;
  fields: FormField[];
  pageCount: number;
  averageConfidence: number;
  qualityLevel: OCRQualityLevel;
  qualityMessage: string;
  error?: string;
  errorKind?: ProcessingErrorKind;
  degradations?: string[];
  method?: string;
  requiresManualMode?: boolean;
  rawResponses?: any[];
  pageImagePaths?: string[];
}

// Circuit breaker state for Vision API
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  threshold: 3,
  resetTimeout: 60000, // 1 minute
};

// ============================================================================
// Form Type Detection - Identifies document category for specialized prompts
// ============================================================================

export type FormType = 
  | 'irs_w4'      // W-4 Employee's Withholding Certificate
  | 'irs_w2'      // W-2 Wage and Tax Statement
  | 'irs_w9'      // W-9 Request for Taxpayer ID
  | 'irs_1099'    // 1099 series forms
  | 'irs_other'   // Other IRS forms
  | 'passport'    // Passport applications (DS-11, DS-82)
  | 'dmv'         // DMV forms (registration, license)
  | 'hr_i9'       // I-9 Employment Eligibility
  | 'hr_other'    // Other HR forms
  | 'real_estate' // Lease, purchase agreement, rental application
  | 'medical'     // Medical/healthcare forms
  | 'legal'       // Legal documents, contracts
  | 'mortgage'    // Mortgage loan applications and disclosures
  | 'insurance'   // Insurance applications and claims
  | 'consent'     // Consent and authorization forms
  | 'generic';    // Unknown/general form

interface FormTypePattern {
  type: FormType;
  keywords: RegExp[];
  weight: number;
}

// Keyword patterns for form type detection
const FORM_TYPE_PATTERNS: FormTypePattern[] = [
  {
    type: 'irs_w4',
    keywords: [
      /form\s*w-?4/i,
      /employee['']?s?\s+withholding\s+certificate/i,
      /withholding\s+allowances/i,
      /claim\s+exemption\s+from\s+withholding/i,
    ],
    weight: 10,
  },
  {
    type: 'irs_w2',
    keywords: [
      /form\s*w-?2/i,
      /wage\s+and\s+tax\s+statement/i,
      /employer['']?s?\s+identification\s+number/i,
      /wages,?\s+tips,?\s+other\s+compensation/i,
    ],
    weight: 10,
  },
  {
    type: 'irs_w9',
    keywords: [
      /form\s*w-?9/i,
      /request\s+for\s+taxpayer/i,
      /taxpayer\s+identification\s+number/i,
      /certify\s+that\s+the\s+number/i,
    ],
    weight: 10,
  },
  {
    type: 'irs_1099',
    keywords: [
      /form\s*1099/i,
      /1099-?(misc|nec|int|div|k|b)/i,
      /nonemployee\s+compensation/i,
      /miscellaneous\s+income/i,
    ],
    weight: 10,
  },
  {
    type: 'irs_other',
    keywords: [
      /internal\s+revenue\s+service/i,
      /department\s+of\s+the\s+treasury/i,
      /irs\s+form/i,
      /form\s+\d{3,4}/i,
    ],
    weight: 5,
  },
  {
    type: 'passport',
    keywords: [
      /passport\s+application/i,
      /form\s*ds-?(11|82|64|5504)/i,
      /u\.?s\.?\s+department\s+of\s+state/i,
      /passport\s+services/i,
      /place\s+of\s+birth/i,
    ],
    weight: 10,
  },
  {
    type: 'dmv',
    keywords: [
      /department\s+of\s+motor\s+vehicles/i,
      /vehicle\s+(registration|title|transfer)/i,
      /driver['']?s?\s+license\s+(application|renewal|number)/i,
      /odometer\s+(reading|disclosure)/i,
      /vin\s*#?:?\s*[a-z0-9]{17}/i,
      /license\s+plate\s+(number|#)/i,
    ],
    weight: 8,
  },
  {
    type: 'hr_i9',
    keywords: [
      /form\s*i-?9/i,
      /employment\s+eligibility\s+verification/i,
      /uscis/i,
      /alien\s+(registration|number)/i,
      /lawful\s+permanent\s+resident/i,
    ],
    weight: 10,
  },
  {
    type: 'hr_other',
    keywords: [
      /employee\s+(information|application)/i,
      /emergency\s+contact/i,
      /direct\s+deposit/i,
      /benefits\s+enrollment/i,
      /new\s+hire/i,
    ],
    weight: 5,
  },
  {
    type: 'real_estate',
    keywords: [
      /lease\s+agreement/i,
      /rental\s+application/i,
      /purchase\s+agreement/i,
      /real\s+estate/i,
      /property\s+address/i,
      /landlord|tenant/i,
      /monthly\s+rent/i,
    ],
    weight: 8,
  },
  {
    type: 'medical',
    keywords: [
      /patient\s+(information|registration)/i,
      /medical\s+history/i,
      /hipaa/i,
      /health\s+insurance/i,
      /date\s+of\s+birth.*allergies/i,
      /physician|doctor|clinic/i,
    ],
    weight: 7,
  },
  {
    type: 'legal',
    keywords: [
      /contract|agreement/i,
      /party\s+of\s+the\s+(first|second)/i,
      /whereas|hereby|hereinafter/i,
      /notary\s+public/i,
      /witness\s+my\s+hand/i,
    ],
    weight: 5,
  },
  {
    type: 'mortgage' as FormType,
    keywords: [
      /mortgage\s+(application|loan|disclosure)/i,
      /loan\s+estimate/i,
      /closing\s+disclosure/i,
      /uniform\s+residential\s+loan\s+application/i,
      /truth\s+in\s+lending/i,
      /hmda/i,
      /annual\s+percentage\s+rate/i,
    ],
    weight: 9,
  },
  {
    type: 'insurance' as FormType,
    keywords: [
      /insurance\s+(application|claim|policy)/i,
      /health\s+insurance\s+portability/i,
      /coverage\s+(effective|termination)\s+date/i,
      /beneficiary\s+(name|designation)/i,
      /premium\s+amount/i,
      /policy\s+(number|holder)/i,
    ],
    weight: 8,
  },
  {
    type: 'consent' as FormType,
    keywords: [
      /informed\s+consent/i,
      /consent\s+(form|to\s+treat)/i,
      /authorization\s+to\s+(release|disclose)/i,
      /hipaa\s+(authorization|consent)/i,
      /acknowledge\s+(and\s+agree|receipt)/i,
      /release\s+of\s+(information|liability)/i,
    ],
    weight: 8,
  },
];

interface FormTypeResult {
  type: FormType;
  confidence: number;
  matchedPatterns: string[];
}

/**
 * Detect form type from extracted text using keyword patterns
 * Uses normalized scoring per pattern type for better differentiation
 */
export function detectFormType(text: string): FormTypeResult {
  const scores: Map<FormType, { score: number; matchRatio: number; patterns: string[] }> = new Map();
  
  for (const pattern of FORM_TYPE_PATTERNS) {
    let matchCount = 0;
    const matchedPatterns: string[] = [];
    
    for (const regex of pattern.keywords) {
      const match = text.match(regex);
      if (match) {
        matchCount++;
        matchedPatterns.push(match[0]);
      }
    }
    
    if (matchCount > 0) {
      // Normalize by keyword count to avoid low-weight broad categories winning
      const matchRatio = matchCount / pattern.keywords.length;
      const normalizedScore = matchCount * pattern.weight * matchRatio;
      
      const existing = scores.get(pattern.type) || { score: 0, matchRatio: 0, patterns: [] };
      existing.score += normalizedScore;
      existing.matchRatio = Math.max(existing.matchRatio, matchRatio);
      existing.patterns.push(...matchedPatterns);
      scores.set(pattern.type, existing);
    }
  }
  
  // Find the highest scoring type, using match ratio as tie-breaker
  let bestType: FormType = 'generic';
  let bestScore = 0;
  let bestMatchRatio = 0;
  let bestPatterns: string[] = [];
  
  scores.forEach(({ score, matchRatio, patterns }, type) => {
    // Prefer higher score, use match ratio as tie-breaker
    if (score > bestScore || (score === bestScore && matchRatio > bestMatchRatio)) {
      bestScore = score;
      bestMatchRatio = matchRatio;
      bestType = type;
      bestPatterns = patterns;
    }
  });
  
  // Calculate confidence (0-1) based on normalized score and match ratio
  // Higher match ratio = higher confidence
  const baseConfidence = Math.min(bestScore / 20, 1);
  const confidence = baseConfidence * (0.5 + bestMatchRatio * 0.5);
  
  return {
    type: bestType,
    confidence,
    matchedPatterns: bestPatterns,
  };
}

// ============================================================================
// Form-Type-Specific Prompt Templates
// ============================================================================

interface FormPromptHint {
  description: string;
  commonFields: string[];
  example?: string;
}

const FORM_TYPE_HINTS: Record<FormType, FormPromptHint> = {
  irs_w4: {
    description: 'This is an IRS Form W-4 (Employee\'s Withholding Certificate). It is used by employees to indicate their tax situation to their employer.',
    commonFields: [
      'First name, middle initial, last name',
      'Social Security Number (SSN)',
      'Address (street, city, state, ZIP)',
      'Filing status checkboxes (Single, Married filing jointly, Head of household)',
      'Multiple jobs checkbox',
      'Claim dependents amount',
      'Other income, deductions, extra withholding amounts',
      'Signature and date',
    ],
    example: `{"fields":[
  {"label":"First name and middle initial","type":"text","required":true,"bbox":{"x":0.05,"y":0.18,"width":0.30,"height":0.025},"confidence":0.95},
  {"label":"Last name","type":"text","required":true,"bbox":{"x":0.36,"y":0.18,"width":0.30,"height":0.025},"confidence":0.95},
  {"label":"Social security number","type":"text","required":true,"bbox":{"x":0.70,"y":0.18,"width":0.25,"height":0.025},"confidence":0.92},
  {"label":"Single or Married filing separately","type":"checkbox","required":false,"bbox":{"x":0.06,"y":0.28,"width":0.015,"height":0.015},"confidence":0.90}
]}`,
  },
  irs_w2: {
    description: 'This is an IRS Form W-2 (Wage and Tax Statement). It reports annual wages and taxes withheld.',
    commonFields: [
      'Employee SSN',
      'Employer EIN',
      'Employer name and address',
      'Employee name and address',
      'Wages, tips, other compensation (Box 1)',
      'Federal income tax withheld (Box 2)',
      'Social security wages and tax withheld (Boxes 3-4)',
      'Medicare wages and tax withheld (Boxes 5-6)',
      'State and local tax information',
    ],
    example: `{"fields":[
  {"label":"Employee's social security number","type":"text","required":true,"bbox":{"x":0.03,"y":0.12,"width":0.20,"height":0.03},"confidence":0.95},
  {"label":"Wages, tips, other compensation","type":"number","required":true,"bbox":{"x":0.52,"y":0.12,"width":0.15,"height":0.03},"confidence":0.92}
]}`,
  },
  irs_w9: {
    description: 'This is an IRS Form W-9 (Request for Taxpayer Identification Number and Certification).',
    commonFields: [
      'Name (as shown on your income tax return)',
      'Business name/disregarded entity name',
      'Federal tax classification checkboxes',
      'Exemptions (codes)',
      'Address (street, city, state, ZIP)',
      'Account numbers',
      'TIN (SSN or EIN)',
      'Signature and date',
    ],
  },
  irs_1099: {
    description: 'This is an IRS Form 1099 series form (various types for reporting non-wage income).',
    commonFields: [
      'Payer name, address, TIN',
      'Recipient name, address, TIN',
      'Various income amounts depending on form type',
      'Account number',
    ],
  },
  irs_other: {
    description: 'This appears to be an IRS tax form. Look for standard IRS form elements.',
    commonFields: [
      'Name fields',
      'Social Security or EIN numbers',
      'Address fields',
      'Dollar amount boxes',
      'Signature and date lines',
    ],
  },
  passport: {
    description: 'This is a U.S. passport application form (likely DS-11, DS-82, or DS-64).',
    commonFields: [
      'Full legal name (first, middle, last)',
      'Date of birth',
      'Place of birth (city, state, country)',
      'Social Security Number',
      'Gender',
      'Height, hair color, eye color',
      'Mailing address',
      'Phone number, email',
      'Emergency contact',
      'Parent/guardian information',
      'Signature',
    ],
    example: `{"fields":[
  {"label":"Last Name","type":"text","required":true,"bbox":{"x":0.08,"y":0.15,"width":0.40,"height":0.025},"confidence":0.95},
  {"label":"First Name","type":"text","required":true,"bbox":{"x":0.50,"y":0.15,"width":0.25,"height":0.025},"confidence":0.95},
  {"label":"Date of Birth","type":"date","required":true,"bbox":{"x":0.08,"y":0.22,"width":0.20,"height":0.025},"confidence":0.92}
]}`,
  },
  dmv: {
    description: 'This is a DMV (Department of Motor Vehicles) form for vehicle registration, title, or driver\'s license.',
    commonFields: [
      'Vehicle Identification Number (VIN)',
      'License plate number',
      'Make, model, year of vehicle',
      'Owner name and address',
      'Driver license number',
      'Date of birth',
      'Odometer reading',
      'Purchase price/sale amount',
      'Signature and date',
    ],
  },
  hr_i9: {
    description: 'This is USCIS Form I-9 (Employment Eligibility Verification). It has multiple sections for employee and employer.',
    commonFields: [
      'Section 1: Employee Information',
      'Last name, first name, middle initial',
      'Other last names used',
      'Address (street, city, state, ZIP)',
      'Date of birth',
      'Social Security Number',
      'Email, phone number',
      'Citizenship/immigration status checkboxes',
      'USCIS/Alien number, I-94 number, passport info',
      'Signature and date',
      'Section 2: Employer verification (document info)',
    ],
    example: `{"fields":[
  {"label":"Last Name","type":"text","required":true,"bbox":{"x":0.03,"y":0.22,"width":0.20,"height":0.025},"confidence":0.95},
  {"label":"A citizen of the United States","type":"checkbox","required":false,"bbox":{"x":0.03,"y":0.35,"width":0.015,"height":0.015},"confidence":0.90}
]}`,
  },
  hr_other: {
    description: 'This appears to be an HR/employment form (new hire paperwork, benefits, direct deposit, etc.).',
    commonFields: [
      'Employee name',
      'Date of birth',
      'Social Security Number',
      'Address',
      'Phone, email',
      'Emergency contact',
      'Bank account information (for direct deposit)',
      'Benefits selection checkboxes',
      'Signature and date',
    ],
  },
  real_estate: {
    description: 'This is a real estate form (lease agreement, rental application, or purchase agreement).',
    commonFields: [
      'Property address',
      'Tenant/buyer name',
      'Landlord/seller name',
      'Monthly rent/purchase price',
      'Lease term dates',
      'Security deposit amount',
      'Current address',
      'Employment information',
      'Income verification',
      'References',
      'Signature and date',
    ],
    example: `{"fields":[
  {"label":"Property Address","type":"text","required":true,"bbox":{"x":0.10,"y":0.12,"width":0.60,"height":0.03},"confidence":0.95},
  {"label":"Monthly Rent Amount","type":"number","required":true,"bbox":{"x":0.60,"y":0.25,"width":0.15,"height":0.025},"confidence":0.90}
]}`,
  },
  medical: {
    description: 'This is a medical/healthcare form (patient registration, medical history, consent).',
    commonFields: [
      'Patient name',
      'Date of birth',
      'Gender',
      'Address, phone, email',
      'Emergency contact',
      'Insurance information',
      'Primary care physician',
      'Medical history checkboxes',
      'Allergies',
      'Current medications',
      'Signature and date',
    ],
  },
  legal: {
    description: 'This is a legal document or contract.',
    commonFields: [
      'Party names',
      'Dates',
      'Amounts/terms',
      'Signature lines',
      'Witness signatures',
      'Notary section',
    ],
  },
  mortgage: {
    description: 'This is a mortgage loan application or disclosure document.',
    commonFields: [
      'Borrower name',
      'Property address',
      'Loan amount',
      'Interest rate',
      'Loan term',
      'Monthly payment',
      'Annual percentage rate (APR)',
      'Employment and income information',
      'Assets and liabilities',
      'Signature and date',
    ],
    example: `{"fields":[
  {"label":"Borrower Name","type":"text","required":true,"bbox":{"x":0.08,"y":0.15,"width":0.40,"height":0.025},"confidence":0.95},
  {"label":"Loan Amount","type":"number","required":true,"bbox":{"x":0.55,"y":0.15,"width":0.20,"height":0.025},"confidence":0.92}
]}`,
  },
  insurance: {
    description: 'This is an insurance application or claim form.',
    commonFields: [
      'Policyholder name',
      'Policy number',
      'Date of birth',
      'Address',
      'Beneficiary information',
      'Coverage type and amount',
      'Premium amount',
      'Effective date',
      'Claim details (for claims)',
      'Signature and date',
    ],
  },
  consent: {
    description: 'This is a consent, authorization, or acknowledgement form.',
    commonFields: [
      'Patient/Client name',
      'Date of birth',
      'Description of procedure/treatment',
      'Risks and benefits acknowledgement',
      'Authorization checkboxes',
      'Signature and date',
      'Witness signature',
    ],
  },
  generic: {
    description: 'This is a general form document.',
    commonFields: [
      'Name fields',
      'Date fields',
      'Address fields',
      'Checkboxes',
      'Signature lines',
    ],
  },
};

/**
 * Build a specialized Vision prompt based on detected form type
 */
function buildVisionPrompt(formType: FormType, logger: OCRLogger): string {
  const hint = FORM_TYPE_HINTS[formType];
  
  // Base prompt with JSON schema
  let prompt = `You are an expert form field detector. Analyze this form image and identify ALL fillable fields.

## DOCUMENT TYPE HINT:
${hint.description}

## COMMON FIELDS TO LOOK FOR:
${hint.commonFields.map(f => `- ${f}`).join('\n')}

## OUTPUT SCHEMA (strict JSON only):
{
  "fields": [
    {
      "label": "Field label text",
      "type": "text|checkbox|radio|signature|date|number|email|phone|textarea",
      "required": true,
      "bbox": {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0},
      "confidence": 0.95
    }
  ]
}

## COORDINATE RULES:
- All bbox values MUST be normalized between 0.0 and 1.0 (relative to image dimensions)
- x=0 is left edge, x=1 is right edge
- y=0 is top edge, y=1 is bottom edge
- bbox covers ONLY the fillable input area, NOT the label text
- Minimum field size: width >= 0.02, height >= 0.01

## FIELD TYPES:
- text: Single-line text input (names, addresses, IDs)
- textarea: Multi-line text area
- checkbox: Square checkbox (☐)
- radio: Radio button (○)
- signature: Signature line or box
- date: Date field (MM/DD/YYYY format)
- number: Numeric input (amounts, quantities)
- email: Email address field
- phone: Phone number field

## EXAMPLE FOR THIS FORM TYPE:`;

  // Add form-specific example if available
  if (hint.example) {
    prompt += `\n${hint.example}\n`;
  } else {
    // Default generic example
    prompt += `
{"fields":[
  {"label":"Full Name","type":"text","required":true,"bbox":{"x":0.10,"y":0.15,"width":0.40,"height":0.03},"confidence":0.92},
  {"label":"Date","type":"date","required":true,"bbox":{"x":0.55,"y":0.15,"width":0.15,"height":0.03},"confidence":0.90}
]}
`;
  }

  prompt += `
## INSTRUCTIONS:
1. Scan the entire form systematically from top to bottom
2. Identify every input field, checkbox, radio button, and signature line
3. Use the nearby label text as the field label
4. Estimate field boundaries precisely - include only the fillable area
5. Set confidence based on clarity (0.5-1.0)
6. Mark fields as required if they have * or "required" indicators

Respond with ONLY the JSON object. No explanation or markdown.`;

  logger.log(`Using ${formType} prompt template (${prompt.length} chars)`);
  return prompt;
}

export function getQualityLevel(confidence: number): OCRQualityLevel {
  if (confidence >= OCR_THRESHOLDS.HIGH_QUALITY) return "high";
  if (confidence >= OCR_THRESHOLDS.MEDIUM_QUALITY) return "medium";
  if (confidence >= OCR_THRESHOLDS.LOW_QUALITY) return "low";
  return "unusable";
}

export function getQualityMessage(level: OCRQualityLevel, fieldCount: number, requiresManual?: boolean): string {
  if (requiresManual) {
    return `Could not auto-detect fields. Please add fields manually using the editor.`;
  }
  switch (level) {
    case "high":
      return `Detected ${fieldCount} fields with high confidence. Ready to fill!`;
    case "medium":
      return `Detected ${fieldCount} fields. Some fields may need manual adjustment.`;
    case "low":
      return `Detected ${fieldCount} fields with low confidence. Please review all fields carefully.`;
    case "unusable":
      // Reached only when OCR actually ran and measured near-zero
      // confidence, or when nothing at all could be detected. State what
      // was measured; never blame "scan quality" for unrelated failures.
      return fieldCount === 0
        ? `No fields could be detected in this document. You can add fields manually using the editor.`
        : `Detected ${fieldCount} fields, but the measured OCR confidence is very low. Please review all fields carefully.`;
  }
}

// Diagnostic logger with timestamps.
// Contract: log / warn / error / getLogs. Call sites use all of these —
// every method named here MUST exist (a missing method once turned a
// non-critical stage-5 warning into a whole-pipeline failure).
export class OCRLogger {
  private formId: string;
  private startTime: number;
  private logs: string[] = [];

  constructor(formId: string) {
    this.formId = formId;
    this.startTime = Date.now();
  }

  log(message: string, data?: any) {
    const elapsed = Date.now() - this.startTime;
    const logLine = `[ocr:${this.formId}] +${elapsed}ms | ${message}`;
    this.logs.push(logLine);
    if (data) {
      console.log(logLine, data);
    } else {
      console.log(logLine);
    }
  }

  warn(message: string, data?: any) {
    const elapsed = Date.now() - this.startTime;
    const logLine = `[ocr:${this.formId}] +${elapsed}ms | WARN: ${message}`;
    this.logs.push(logLine);
    if (data) {
      console.warn(logLine, data);
    } else {
      console.warn(logLine);
    }
  }

  error(message: string, error?: any) {
    const elapsed = Date.now() - this.startTime;
    const logLine = `[ocr:${this.formId}] +${elapsed}ms | ERROR: ${message}`;
    this.logs.push(logLine);
    console.error(logLine, error || '');
  }

  getLogs(): string[] {
    return this.logs;
  }
}

// ============================================================================
// STAGE 0: Preflight Validation with User-Friendly Error Messages
// ============================================================================

// Configuration limits
const PDF_LIMITS = {
  MAX_FILE_SIZE_MB: 25,
  MAX_PAGES: 50,
  MIN_PAGE_SIZE_PT: 72,  // 1 inch minimum
  MAX_PAGE_SIZE_PT: 3600, // 50 inches maximum
};

// User-friendly error messages
const ERROR_MESSAGES = {
  FILE_TOO_SMALL: "This file appears to be corrupted or empty. Please try uploading a different PDF.",
  FILE_TOO_LARGE: `This PDF is too large (max ${PDF_LIMITS.MAX_FILE_SIZE_MB}MB). Try compressing it first or splitting into smaller files.`,
  INVALID_FORMAT: "This doesn't appear to be a valid PDF file. Please ensure you're uploading a .pdf document.",
  NO_PAGES: "This PDF has no pages. Please upload a PDF with content.",
  TOO_MANY_PAGES: `This PDF has too many pages (max ${PDF_LIMITS.MAX_PAGES}). You can still use Manual Mode for larger documents.`,
  PAGE_TOO_SMALL: "The page dimensions are too small to process. Please ensure the PDF was created correctly.",
  PARSE_FAILED: "Unable to read this PDF. The file appears to be corrupted or truncated. Try re-exporting it from the original source.",
  ENCRYPTED: "This PDF appears to be password-protected. Please unlock it before uploading.",
};

interface ValidationResult {
  valid: boolean;
  pageCount: number;
  error?: string;
  errorCode?: string;
  errorKind?: ProcessingErrorKind;
  pdfDoc?: any;
}

async function validatePdf(pdfBuffer: Buffer, logger: OCRLogger): Promise<ValidationResult> {
  logger.log("Stage 0: Preflight validation...");
  
  // Check file size limits
  const fileSizeMB = pdfBuffer.length / (1024 * 1024);
  logger.log(`File size: ${fileSizeMB.toFixed(2)}MB`);
  
  if (pdfBuffer.length < 100) {
    logger.error("PDF too small - likely corrupted");
    return { valid: false, pageCount: 0, error: ERROR_MESSAGES.FILE_TOO_SMALL, errorCode: "FILE_TOO_SMALL", errorKind: "corrupt_pdf" };
  }
  
  if (fileSizeMB > PDF_LIMITS.MAX_FILE_SIZE_MB) {
    logger.error(`PDF too large: ${fileSizeMB.toFixed(2)}MB > ${PDF_LIMITS.MAX_FILE_SIZE_MB}MB`);
    return { valid: false, pageCount: 0, error: ERROR_MESSAGES.FILE_TOO_LARGE, errorCode: "FILE_TOO_LARGE", errorKind: "file_too_large" };
  }
  
  // Check PDF magic bytes (more thorough than just header)
  const header = pdfBuffer.slice(0, 8).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    logger.error(`Invalid PDF header: ${header.slice(0, 20)}`);
    return { valid: false, pageCount: 0, error: ERROR_MESSAGES.INVALID_FORMAT, errorCode: "INVALID_FORMAT", errorKind: "not_pdf" };
  }
  
  try {
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer);
    } catch (loadError: any) {
      const msg = (loadError?.message || "").toLowerCase();
      if (msg.includes("encrypt") || msg.includes("password")) {
        logger.error("PDF is encrypted / password-protected");
        return { valid: false, pageCount: 0, error: ERROR_MESSAGES.ENCRYPTED, errorCode: "ENCRYPTED", errorKind: "encrypted_pdf" };
      }
      throw loadError;
    }
    const pageCount = pdfDoc.getPageCount();
    
    if (pageCount === 0) {
      logger.error("PDF has no pages");
      return { valid: false, pageCount: 0, error: ERROR_MESSAGES.NO_PAGES, errorCode: "NO_PAGES", errorKind: "corrupt_pdf" };
    }
    
    if (pageCount > PDF_LIMITS.MAX_PAGES) {
      logger.error(`PDF has too many pages: ${pageCount} > ${PDF_LIMITS.MAX_PAGES}`);
      return { 
        valid: false, 
        pageCount, 
        error: `This PDF has ${pageCount} pages (max ${PDF_LIMITS.MAX_PAGES}). You can still use Manual Mode for larger documents.`,
        errorCode: "TOO_MANY_PAGES",
        errorKind: "too_many_pages"
      };
    }
    
    // Check page dimensions
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();
    
    if (width < PDF_LIMITS.MIN_PAGE_SIZE_PT || height < PDF_LIMITS.MIN_PAGE_SIZE_PT) {
      logger.error(`Page dimensions too small: ${width}x${height}pt`);
      return { valid: false, pageCount, error: ERROR_MESSAGES.PAGE_TOO_SMALL, errorCode: "PAGE_TOO_SMALL", errorKind: "invalid_pdf" };
    }
    
    if (width > PDF_LIMITS.MAX_PAGE_SIZE_PT || height > PDF_LIMITS.MAX_PAGE_SIZE_PT) {
      logger.error(`Page dimensions too large: ${width}x${height}pt`);
      return { 
        valid: false, 
        pageCount, 
        error: "This PDF has unusually large page dimensions. Please try exporting at a standard size.",
        errorCode: "PAGE_TOO_LARGE",
        errorKind: "invalid_pdf"
      };
    }
    
    logger.log(`Validation passed: ${pageCount} pages, ${width.toFixed(0)}x${height.toFixed(0)}pt`);
    return { valid: true, pageCount, pdfDoc };
  } catch (error: any) {
    logger.error("Failed to parse PDF", error.message);
    
    // Encryption was already classified above; anything reaching here is a
    // genuinely unreadable / corrupt / truncated document.
    return { valid: false, pageCount: 0, error: ERROR_MESSAGES.PARSE_FAILED, errorCode: "PARSE_FAILED", errorKind: "corrupt_pdf" };
  }
}

// ============================================================================
// STAGE 1: Native Form Field Extraction (pdf-lib)
// ============================================================================
async function extractNativeFormFields(pdfBuffer: Buffer, pdfDoc: any, logger: OCRLogger): Promise<FormField[] | null> {
  try {
    logger.log("Stage 1: Native PDF form field extraction...");
    
    let form;
    try {
      form = pdfDoc.getForm();
    } catch (e) {
      logger.log("No form found in PDF - not a fillable PDF");
      return null;
    }

    const fields = form.getFields();
    
    if (fields.length === 0) {
      logger.log("PDF has form object but no fields");
      return null;
    }

    logger.log(`Found ${fields.length} native form fields`);
    
    const formFields: FormField[] = fields.map((field: any, index: number) => {
      const name = field.getName();
      const type = field.constructor.name;
      
      const typeName = type.toLowerCase();
      let fieldType: string = "text";
      if (typeName.includes("checkbox")) fieldType = "checkbox";
      else if (typeName.includes("radio")) fieldType = "radio";
      else if (typeName.includes("dropdown") || typeName.includes("optionlist")) fieldType = "select";
      else if (typeName.includes("signature")) fieldType = "signature";
      
      // Get widget annotations for position
      const widgets = field.acroField.getWidgets();
      let bbox: [number, number, number, number] = [10, 10 + index * 8, 40, 5];
      let page = 1;
      
      if (widgets.length > 0) {
        const widget = widgets[0];
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        
        if (pageRef) {
          const pages = pdfDoc.getPages();
          for (let i = 0; i < pages.length; i++) {
            if (pages[i].ref === pageRef) {
              page = i + 1;
              break;
            }
          }
        }
        
        if (rect) {
          const pageObj = pdfDoc.getPage(page - 1);
          const { width, height } = pageObj.getSize();
          
          bbox = [
            (rect.x / width) * 100,
            ((height - rect.y - rect.height) / height) * 100,
            (rect.width / width) * 100,
            (rect.height / height) * 100,
          ];
        }
      }
      
      return {
        id: `field_native_${index}`,
        label: name || `Field ${index + 1}`,
        acroName: name || undefined,
        type: fieldType,
        page,
        bbox,
        required: false,
        confidence: 95,
      };
    });

    logger.log(`Successfully extracted ${formFields.length} native fields`);
    return formFields;
  } catch (error) {
    logger.error("Native form extraction failed", error);
    return null;
  }
}

// ============================================================================
// STAGE 2: Surya OCR - Open-Source Alternative
// ============================================================================
// Uses Surya OCR microservice for text extraction with fallback to Tesseract

async function extractWithSurya(
  pdfBuffer: Buffer,
  pageCount: number,
  formId: string,
  logger: OCRLogger
): Promise<{
  fields: FormField[];
  pageImagePaths: string[];
  detectedFormType: FormType;
}> {
  const fields: FormField[] = [];
  const pageImagePaths: string[] = [];
  let detectedFormType: FormType = "generic";

  try {
    // Check if OCR service is available
    const isHealthy = await checkOCRServiceHealth();
    if (!isHealthy) {
      logger.error("Surya OCR service is not available");
      return { fields, pageImagePaths, detectedFormType };
    }

    logger.log("Extracting with Surya OCR...");

    // Process each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        // Render page to image
        const imageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum, logger);

        // Extract fields using Surya - already in correct FormField format
        const pageFields = await extractFieldsFromImage(imageBuffer, pageNum);

        // Add to results (already converted to correct FormField format in ocrEngineService)
        fields.push(...pageFields);

        logger.log(`Surya extracted ${pageFields.length} fields from page ${pageNum}`);

        // Upload page image for visual editor
        try {
          const uploadResult = await uploadPageImage(imageBuffer, formId, pageNum);
          if (uploadResult.success) {
            pageImagePaths.push(uploadResult.path || "");
          }
        } catch (uploadErr: any) {
          logger.warn(`Failed to upload page ${pageNum} image: ${uploadErr.message}`);
        }
      } catch (pageError: any) {
        logger.warn(`Surya extraction failed for page ${pageNum}: ${pageError.message}`);
        // Continue to next page
      }
    }

    if (fields.length > 0) {
      logger.log(`Surya OCR SUCCESS: extracted ${fields.length} fields from ${pageCount} pages`);
    }

    return {
      fields,
      pageImagePaths,
      detectedFormType,
    };
  } catch (error: any) {
    logger.error(`Surya OCR failed: ${error.message}`);
    return { fields: [], pageImagePaths, detectedFormType };
  }
}

// STAGE 3: GPT-4o Vision API with Retry & Circuit Breaker
// ============================================================================
// Uses form-type-specific prompts via buildVisionPrompt() for better accuracy
// Now demoted to secondary fallback after Surya

// Coordinate validation constants
const VALIDATION = {
  MIN_WIDTH: 0.015,      // Minimum 1.5% of page width
  MIN_HEIGHT: 0.008,     // Minimum 0.8% of page height
  MAX_OVERLAP_IOU: 0.85, // Maximum intersection over union for duplicate detection
  MIN_CONFIDENCE: 0.3,   // Minimum confidence to keep a field
};

// Calculate Intersection over Union for two bounding boxes
export function calculateIoU(
  bbox1: { x: number; y: number; width: number; height: number },
  bbox2: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(bbox1.x, bbox2.x);
  const y1 = Math.max(bbox1.y, bbox2.y);
  const x2 = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width);
  const y2 = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = bbox1.width * bbox1.height;
  const area2 = bbox2.width * bbox2.height;
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
}

// Validate and filter Vision API field results
function validateAndFilterFields(rawFields: any[], pageNum: number, logger: OCRLogger): FormField[] {
  const validFields: FormField[] = [];
  const seenLabels = new Set<string>();
  
  for (let idx = 0; idx < rawFields.length; idx++) {
    const f = rawFields[idx];
    
    // Parse bbox (handle both object and array formats)
    let bbox: { x: number; y: number; width: number; height: number };
    if (f.bbox && typeof f.bbox === 'object' && !Array.isArray(f.bbox)) {
      bbox = f.bbox;
    } else if (Array.isArray(f.bbox) && f.bbox.length >= 4) {
      // Convert array format [x, y, w, h] to object, handling 0-100 or 0-1 range
      const [x, y, w, h] = f.bbox;
      const scale = (x > 1 || y > 1 || w > 1 || h > 1) ? 100 : 1;
      bbox = { x: x / scale, y: y / scale, width: w / scale, height: h / scale };
    } else {
      logger.log(`Field ${idx} rejected: invalid bbox format`);
      continue;
    }
    
    // Validate coordinate ranges
    if (bbox.x < 0 || bbox.x > 1 || bbox.y < 0 || bbox.y > 1) {
      logger.log(`Field ${idx} rejected: bbox out of range (x=${bbox.x}, y=${bbox.y})`);
      continue;
    }
    
    if (bbox.width < VALIDATION.MIN_WIDTH || bbox.height < VALIDATION.MIN_HEIGHT) {
      logger.log(`Field ${idx} rejected: too small (${bbox.width}x${bbox.height})`);
      continue;
    }
    
    if (bbox.x + bbox.width > 1.05 || bbox.y + bbox.height > 1.05) {
      // Allow 5% overflow and clamp
      bbox.width = Math.min(bbox.width, 1 - bbox.x);
      bbox.height = Math.min(bbox.height, 1 - bbox.y);
    }
    
    // Validate confidence
    const confidence = typeof f.confidence === 'number' ? f.confidence : 0.8;
    if (confidence < VALIDATION.MIN_CONFIDENCE) {
      logger.log(`Field ${idx} rejected: low confidence (${confidence})`);
      continue;
    }
    
    // Check for duplicates (same label + high IoU)
    const label = f.label || `Field ${idx + 1}`;
    const labelKey = label.toLowerCase().replace(/\s+/g, '');
    
    let isDuplicate = false;
    for (const existing of validFields) {
      const existingBbox = {
        x: (existing.bbox[0] || 0) / 100,
        y: (existing.bbox[1] || 0) / 100,
        width: (existing.bbox[2] || 0) / 100,
        height: (existing.bbox[3] || 0) / 100,
      };
      
      const iou = calculateIoU(bbox, existingBbox);
      if (iou > VALIDATION.MAX_OVERLAP_IOU) {
        logger.log(`Field ${idx} rejected: overlaps with existing field (IoU=${iou.toFixed(2)})`);
        isDuplicate = true;
        break;
      }
    }
    
    if (isDuplicate) continue;
    
    // Convert normalized bbox to percentage format for storage
    const percentBbox: [number, number, number, number] = [
      bbox.x * 100,
      bbox.y * 100,
      bbox.width * 100,
      bbox.height * 100,
    ];
    
    // Validate field type
    const validTypes = ['text', 'textarea', 'date', 'number', 'email', 'phone', 'checkbox', 'radio', 'signature'];
    const fieldType = validTypes.includes(f.type) ? f.type : 'text';
    
    validFields.push({
      id: `field_p${pageNum}_${validFields.length}`,
      label,
      type: fieldType,
      page: pageNum,
      bbox: percentBbox,
      required: f.required === true,
      options: f.options,
      confidence: Math.round(confidence * 100),
    });
  }
  
  logger.log(`Validation: ${rawFields.length} raw → ${validFields.length} valid fields`);
  return validFields;
}

async function renderPdfPageToImage(pdfBuffer: Buffer, pageNum: number, logger: OCRLogger): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const pdfPath = path.join(tmpDir, `pdf_${uniqueId}.pdf`);
  const outputPrefix = path.join(tmpDir, `page_${uniqueId}`);
  const createdFiles: string[] = [];

  try {
    await fs.promises.writeFile(pdfPath, pdfBuffer);
    createdFiles.push(pdfPath);

    logger.log(`Rendering page ${pageNum} with pdftoppm...`);

    try {
      await execAsync(
        `pdftoppm -png -r 150 -f ${pageNum} -l ${pageNum} "${pdfPath}" "${outputPrefix}"`,
        { timeout: 30000 }
      );
    } catch (execError: any) {
      if (isPdftoppmMissingError(execError)) {
        // Dependency-missing is a named, actionable error kind — never a
        // raw "command not found" stack in the middle of the pipeline.
        throw new Error(POPPLER_MISSING_MESSAGE);
      }
      throw execError;
    }

    const files = await fs.promises.readdir(tmpDir);
    const pageFile = files.find(f => 
      f.startsWith(path.basename(outputPrefix)) && f.endsWith('.png')
    );

    if (!pageFile) {
      throw new Error(`pdftoppm did not create output file for page ${pageNum}`);
    }

    const imagePath = path.join(tmpDir, pageFile);
    createdFiles.push(imagePath);
    
    const imageBuffer = await fs.promises.readFile(imagePath);
    logger.log(`Page ${pageNum} rendered: ${(imageBuffer.length / 1024).toFixed(1)}KB`);
    
    return imageBuffer;
  } finally {
    for (const file of createdFiles) {
      await fs.promises.unlink(file).catch(() => {});
    }
  }
}

function checkCircuitBreaker(logger: OCRLogger): boolean {
  if (!circuitBreaker.isOpen) return false;
  
  const timeSinceFailure = Date.now() - circuitBreaker.lastFailure;
  if (timeSinceFailure > circuitBreaker.resetTimeout) {
    logger.log("Circuit breaker reset - attempting Vision API again");
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    return false;
  }
  
  logger.log(`Circuit breaker OPEN - skipping Vision API (${Math.round((circuitBreaker.resetTimeout - timeSinceFailure) / 1000)}s until reset)`);
  return true;
}

function recordCircuitBreakerFailure(logger: OCRLogger) {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true;
    logger.error(`Circuit breaker OPENED after ${circuitBreaker.failures} failures`);
  }
}

function recordCircuitBreakerSuccess() {
  circuitBreaker.failures = 0;
}

async function callVisionAPIWithRetry(imageBuffer: Buffer, pageNum: number, formType: FormType, logger: OCRLogger): Promise<FormField[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("AI API not configured");
  }
  
  if (checkCircuitBreaker(logger)) {
    throw new Error("Circuit breaker open - Vision API temporarily disabled");
  }

  const base64Image = imageBuffer.toString("base64");
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  // Build specialized prompt based on detected form type
  const prompt = buildVisionPrompt(formType, logger);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.log(`Vision API call for page ${pageNum} (attempt ${attempt}/${maxRetries}, type: ${formType})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}`, detail: "high" } },
            ],
          }],
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;
        
        // Record failure for circuit breaker on 5xx or 429
        if (statusCode >= 500 || statusCode === 429) {
          recordCircuitBreakerFailure(logger);
        }
        
        throw new Error(`Vision API error ${statusCode}: ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      
      // Parse JSON response - handle both {"fields": [...]} and [...] formats
      let rawFields: any[] = [];
      
      // Try to parse as object with fields property first
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          if (parsed.fields && Array.isArray(parsed.fields)) {
            rawFields = parsed.fields;
          } else if (Array.isArray(parsed)) {
            rawFields = parsed;
          }
        } catch {
          // Fall through to array parsing
        }
      }
      
      // Fallback: try to parse as direct array
      if (rawFields.length === 0) {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) {
              rawFields = parsed;
            }
          } catch {
            throw new Error("Failed to parse Vision API JSON response");
          }
        }
      }
      
      if (rawFields.length === 0) {
        logger.log("Vision API returned no fields for this page");
        recordCircuitBreakerSuccess();
        return [];
      }

      // Apply validation and filtering
      const validatedFields = validateAndFilterFields(rawFields, pageNum, logger);

      recordCircuitBreakerSuccess();
      logger.log(`Page ${pageNum}: Vision API detected ${validatedFields.length} valid fields`);
      return validatedFields;
      
    } catch (error: any) {
      lastError = error;
      logger.error(`Vision API attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        logger.log(`Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  recordCircuitBreakerFailure(logger);
  throw lastError || new Error("Vision API failed after all retries");
}

/**
 * Extract raw text from PDF for form type detection
 * Uses native field names first (efficient), only falls back to Vision API if needed
 */
async function extractTextForFormTypeDetection(pdfBuffer: Buffer, logger: OCRLogger): Promise<{ text: string; source: 'native' | 'vision' | 'none' }> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    
    // Try to get text from native form field names first (fast, no API call)
    let form;
    try {
      form = pdfDoc.getForm();
      const fields = form.getFields();
      if (fields.length > 0) {
        const fieldNames = fields.map((f: any) => f.getName()).join(' ');
        logger.log(`Extracted ${fields.length} field names for type detection (native)`);
        
        // If we have enough text from field names, use it
        if (fieldNames.length > 50) {
          return { text: fieldNames, source: 'native' };
        }
      }
    } catch {
      // No form fields, continue to Vision API fallback
    }
    
    // Only use Vision API if native extraction didn't yield enough text
    // This saves cost and latency for fillable PDFs
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    
    if (baseUrl && apiKey) {
      try {
        const imageBuffer = await renderPdfPageToImage(pdfBuffer, 1, logger);
        const base64Image = imageBuffer.toString("base64");
        
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "Extract and list all visible text from this form image. Include form title, field labels, and any identifying text. Response should be plain text only." },
                { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}`, detail: "low" } },
              ],
            }],
            max_tokens: 500,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const extractedText = data.choices?.[0]?.message?.content || "";
          logger.log(`Extracted ${extractedText.length} chars from first page for type detection (vision)`);
          return { text: extractedText, source: 'vision' };
        }
      } catch (error: any) {
        logger.log(`Text extraction for type detection failed: ${error.message}`);
      }
    }
    
    return { text: "", source: 'none' };
  } catch {
    return { text: "", source: 'none' };
  }
}

async function extractWithVisionAPI(pdfBuffer: Buffer, pageCount: number, formId: string, logger: OCRLogger): Promise<{ fields: FormField[], pageImagePaths: string[], detectedFormType: FormType }> {
  logger.log(`Stage 2: Vision API for ${pageCount} pages...`);
  
  // Detect form type first using text extraction
  logger.log("Detecting form type...");
  const extractionResult = await extractTextForFormTypeDetection(pdfBuffer, logger);
  const formTypeResult = detectFormType(extractionResult.text);
  const detectedFormType = formTypeResult.type;
  
  if (detectedFormType !== 'generic') {
    logger.log(`Detected form type: ${detectedFormType} (confidence: ${(formTypeResult.confidence * 100).toFixed(0)}%, patterns: ${formTypeResult.matchedPatterns.slice(0, 3).join(', ')})`);
  } else {
    logger.log("Using generic form detection");
  }
  
  const allFields: FormField[] = [];
  const pageImagePaths: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const imageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum, logger);
      
      // Upload page image to storage
      const uploadResult = await uploadPageImage(imageBuffer, formId, pageNum);
      if (uploadResult.success) {
        pageImagePaths.push(uploadResult.path || "");
      }

      const fields = await callVisionAPIWithRetry(imageBuffer, pageNum, detectedFormType, logger);
      allFields.push(...fields);
      
    } catch (error: any) {
      logger.error(`Failed to process page ${pageNum}: ${error.message}`);
    }
  }

  return { fields: allFields, pageImagePaths, detectedFormType };
}

// ============================================================================
// STAGE 3: Gutenye OCR Fallback (PaddleOCR via ONNX)
// ============================================================================
async function extractWithGutenye(pdfBuffer: Buffer, pageCount: number, formId: string, logger: OCRLogger): Promise<{ fields: FormField[], pageImagePaths: string[], requiresManualMode: boolean }> {
  logger.log(`Stage 3: Gutenye OCR fallback for ${pageCount} pages...`);
  
  const pageImagePaths: string[] = [];
  
  let Ocr: any;
  try {
    const ocrModule = await import("@gutenye/ocr-node");
    Ocr = ocrModule.default || ocrModule;
  } catch (error: any) {
    logger.error("Failed to load Gutenye OCR module", error.message);
    logger.log("Gutenye unavailable - triggering manual mode");
    return { fields: [], pageImagePaths, requiresManualMode: true };
  }

  let ocr: any;
  try {
    ocr = await Ocr.create();
    logger.log("Gutenye OCR initialized");
  } catch (error: any) {
    logger.error("Failed to initialize Gutenye OCR", error.message);
    return { fields: [], pageImagePaths, requiresManualMode: true };
  }

  // Store page images for manual mode even if OCR fails
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const imageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum, logger);
      
      const uploadResult = await uploadPageImage(imageBuffer, formId, pageNum);
      if (uploadResult.success) {
        pageImagePaths.push(uploadResult.path || "");
      }
      
    } catch (error: any) {
      logger.error(`Failed to render/upload page ${pageNum}: ${error.message}`);
    }
  }

  // Gutenye OCR cannot reliably determine field coordinates without 
  // additional layout analysis. Rather than returning inaccurate fields,
  // we trigger manual mode so users can add fields precisely.
  logger.log("Gutenye OCR: Text detection available but field geometry unreliable");
  logger.log("Triggering manual field mode for user to add fields");
  
  return { fields: [], pageImagePaths, requiresManualMode: true };
}

// Rule-based field detection from OCR text
function convertOcrToFields(ocrResult: any, pageNum: number, logger: OCRLogger): FormField[] {
  const fields: FormField[] = [];
  const texts = ocrResult.texts || [];
  const boxes = ocrResult.boxes || [];
  
  type FieldType = "text" | "email" | "phone" | "date" | "signature" | "checkbox" | "textarea" | "number" | "radio" | "table";
  
  const fieldPatterns: { regex: RegExp; type: FieldType; label: string }[] = [
    { regex: /name/i, type: "text", label: "Name" },
    { regex: /first\s*name/i, type: "text", label: "First Name" },
    { regex: /last\s*name/i, type: "text", label: "Last Name" },
    { regex: /email/i, type: "email", label: "Email" },
    { regex: /phone|tel/i, type: "phone", label: "Phone" },
    { regex: /address/i, type: "text", label: "Address" },
    { regex: /city/i, type: "text", label: "City" },
    { regex: /state/i, type: "text", label: "State" },
    { regex: /zip|postal/i, type: "text", label: "Zip Code" },
    { regex: /date|dob|birth/i, type: "date", label: "Date" },
    { regex: /ssn|social\s*security/i, type: "text", label: "SSN" },
    { regex: /signature/i, type: "signature", label: "Signature" },
    { regex: /\[\s*\]|\(\s*\)/i, type: "checkbox", label: "Checkbox" },
  ];
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const box = boxes[i];
    
    for (const pattern of fieldPatterns) {
      if (pattern.regex.test(text)) {
        // Estimate field position (to the right of or below the label)
        let bbox: [number, number, number, number] = [50, 10 + i * 5, 30, 3];
        
        if (box && box.length >= 4) {
          // Convert pixel coordinates to percentages (assuming 612x792 page)
          const pageWidth = 612;
          const pageHeight = 792;
          const x = (box[0] / pageWidth) * 100;
          const y = (box[1] / pageHeight) * 100;
          // Place field to the right of label
          bbox = [Math.min(x + 20, 70), y, 25, 3];
        }
        
        fields.push({
          id: `field_ocr_p${pageNum}_${fields.length}`,
          label: pattern.label,
          type: pattern.type,
          page: pageNum,
          bbox,
          required: false,
          confidence: 60, // Lower confidence for heuristic detection
        });
        break;
      }
    }
  }
  
  logger.log(`Page ${pageNum}: Heuristic detection found ${fields.length} likely fields`);
  return fields;
}

// ============================================================================
// Main Extraction Function - Hybrid Pipeline with Caching
// ============================================================================
export async function extractFieldsFromPdf(
  pdfBuffer: Buffer,
  formId: string,
  skipCache: boolean = false
): Promise<OCRResult> {
  const logger = new OCRLogger(formId);
  
  logger.log("=== HYBRID OCR PIPELINE STARTED ===");
  logger.log(`PDF size: ${(pdfBuffer.length / 1024).toFixed(1)}KB`);

  // Check cache first (unless explicitly skipped)
  const docHash = computeDocumentHash(pdfBuffer);
  
  if (!skipCache) {
    const cachedResult = getCachedResult(docHash);
    if (cachedResult) {
      logger.log(`Cache HIT for document hash ${docHash}`);
      return { ...cachedResult, pageImagePaths: cachedResult.pageImagePaths || [] };
    }
    logger.log(`Cache MISS for document hash ${docHash}`);
  }

  // Stage 0: Preflight validation
  const validation = await validatePdf(pdfBuffer, logger);
  if (!validation.valid) {
    return {
      success: false,
      fields: [],
      pageCount: 0,
      averageConfidence: 0,
      qualityLevel: "unusable",
      qualityMessage: validation.error || "Invalid PDF",
      error: validation.error,
      errorKind: validation.errorKind || "processing_failed",
      method: "validation_failed",
    };
  }

  const { pageCount, pdfDoc } = validation;
  let fields: FormField[] = [];
  let method = "none";
  let pageImagePaths: string[] = [];
  // Non-fatal problems encountered along the way. Surfaced on the result so
  // the form status can show them; they never discard good extraction work.
  const degradations: string[] = [];
  const noteDegradation = (msg: string) => {
    if (!degradations.includes(msg)) degradations.push(msg);
  };

  try {
    // Stage 1: Native form field extraction
    const nativeFields = await extractNativeFormFields(pdfBuffer, pdfDoc, logger);
    
    if (nativeFields && nativeFields.length > 0) {
      fields = nativeFields;
      method = "native";
      logger.log(`Stage 1 SUCCESS: ${fields.length} native fields`);
      
      // Generate page images for visual field editor (even with native fields)
      logger.log("Generating page images for visual editor...");
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        try {
          const imageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum, logger);
          const uploadResult = await uploadPageImage(imageBuffer, formId, pageNum);
          if (uploadResult.success) {
            pageImagePaths.push(uploadResult.path || "");
          }
        } catch (error: any) {
          if (isPdftoppmMissingError(error) || (error?.message || "").includes("pdftoppm")) {
            logger.warn(`Page image rendering unavailable: ${error.message}`);
            noteDegradation(POPPLER_MISSING_MESSAGE + " Page preview images are unavailable; form fields were still extracted.");
          } else {
            logger.error(`Failed to render page ${pageNum} image: ${error.message}`);
          }
        }
      }
      logger.log(`Generated ${pageImagePaths.length} page images`);
    } else {
      // Stage 2: Surya OCR - Open-source alternative (PRIMARY)
      logger.log("Stage 1 failed, trying Surya OCR...");
      const ocrEngine = process.env.OCR_ENGINE || "surya";

      if (ocrEngine === "surya") {
        try {
          const suryaResult = await extractWithSurya(pdfBuffer, pageCount, formId, logger);
          fields = suryaResult.fields;
          pageImagePaths = suryaResult.pageImagePaths;

          if (fields.length > 0) {
            method = "surya_ocr";
            logger.log(`Stage 2 SUCCESS: ${fields.length} Surya OCR fields`);
          }
        } catch (error: any) {
          logger.warn(`Surya OCR extraction failed: ${error.message}`);
        }
      }

      // Stage 3: Vision API (SECONDARY fallback)
      if (fields.length === 0) {
        logger.log("Stage 2 failed/skipped, trying Vision API as fallback...");
        const hasAPI = !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

        if (hasAPI && !checkCircuitBreaker(logger)) {
          const visionResult = await extractWithVisionAPI(pdfBuffer, pageCount, formId, logger);
          fields = visionResult.fields;
          pageImagePaths = visionResult.pageImagePaths;

          if (fields.length > 0) {
            // Include form type in method for tracking
            method = visionResult.detectedFormType !== 'generic'
              ? `vision_${visionResult.detectedFormType}`
              : "vision";
            logger.log(`Stage 3 SUCCESS: ${fields.length} vision fields (type: ${visionResult.detectedFormType})`);
          }
        }
      }

      // Stage 4: Gutenye OCR fallback - just captures page images for manual mode
      if (fields.length === 0) {
        logger.log("Stages 2-3 failed, preparing for manual mode...");
        const gutenyeResult = await extractWithGutenye(pdfBuffer, pageCount, formId, logger);
        if (gutenyeResult.pageImagePaths.length > 0) {
          pageImagePaths = gutenyeResult.pageImagePaths;
        }
        method = "manual";
        logger.log("Stage 4: Manual mode triggered - page images captured");
      }
    }

    // ========================================================================
    // Stage 5: Auto Field Detection (POST-PROCESSING)
    // ========================================================================
    // After OCR extraction, run field detection and merge results
    const AUTO_DETECT_ENABLED = process.env.AUTO_FIELD_DETECTION !== 'false';
    if (AUTO_DETECT_ENABLED && fields.length > 0) {
      try {
        const { detectFormFields, mergeDetectedWithOCR } = await import('./fieldDetectorService');

        logger.log("Stage 5: Auto field detection enabled, running detector...");

        const detected = await detectFormFields(pdfBuffer);

        if (detected.fields.length > 0) {
          const beforeMergeCount = fields.length;
          fields = mergeDetectedWithOCR(detected.fields, fields);
          const afterMergeCount = fields.length;

          logger.log(
            `Auto-detection complete: detected ${detected.fields.length} fields, ` +
            `merged to ${afterMergeCount} fields (was ${beforeMergeCount}). ` +
            `Method: ${detected.detectionMethod}, Processing: ${detected.processingTimeMs}ms`
          );

          // Update method to reflect auto-detection was applied
          if (!method.includes('detected')) {
            method = `${method}_with_autodetect`;
          }
        } else {
          logger.log("Auto field detection ran but found no additional fields");
        }
      } catch (err: any) {
        // NON-CRITICAL means non-critical: log the warning, record the
        // degradation for the form status, and CONTINUE with the fields
        // already extracted. (This catch once called a logger method that
        // did not exist, and the resulting TypeError discarded 199 good
        // native fields and failed the whole form.)
        logger.warn(
          `Auto field detection failed (non-critical), continuing with ${fields.length} extracted fields: ${err.message}`
        );
        noteDegradation(
          `Field auto-detection unavailable (${err.message}). Continuing with ${fields.length} fields from ${method} extraction.`
        );
      }
    } else if (AUTO_DETECT_ENABLED) {
      logger.log("Stage 5: Auto field detection skipped (no OCR fields yet)");
    } else {
      logger.log("Stage 5: Auto field detection disabled (AUTO_FIELD_DETECTION=false)");
    }

    // Calculate quality metrics
    const avgConfidence = fields.length > 0
      ? fields.reduce((sum, f) => sum + (f.confidence || 80), 0) / fields.length
      : 0;

    const qualityLevel = getQualityLevel(avgConfidence);
    const requiresManualMode = fields.length === 0;
    const qualityMessage = getQualityMessage(qualityLevel, fields.length, requiresManualMode);

    logger.log("=== HYBRID OCR PIPELINE COMPLETE ===");
    logger.log(`Method: ${method}, Fields: ${fields.length}, Confidence: ${avgConfidence.toFixed(1)}%`);

    const result: OCRResult = {
      success: fields.length > 0 || requiresManualMode,
      fields,
      pageCount,
      averageConfidence: avgConfidence,
      qualityLevel,
      qualityMessage,
      method,
      requiresManualMode,
      pageImagePaths,
      ...(degradations.length > 0 ? { degradations } : {}),
    };
    
    // Cache successful results (only if we got fields or can offer manual mode)
    if (result.success && !skipCache) {
      setCachedResult(docHash, result);
      logger.log(`Cached result for document hash ${docHash}`);
    }
    
    return result;
  } catch (error: any) {
    logger.error("=== HYBRID OCR PIPELINE FAILED ===", error);

    const dependencyMissing =
      isPdftoppmMissingError(error) || (error?.message || "").includes("pdftoppm");
    return {
      success: false,
      fields: [],
      pageCount,
      averageConfidence: 0,
      qualityLevel: "unusable",
      qualityMessage: dependencyMissing
        ? POPPLER_MISSING_MESSAGE
        : "Processing failed unexpectedly. Please try a different file or add fields manually.",
      error: error.message || "Unknown error",
      errorKind: dependencyMissing ? "dependency_missing" : "processing_failed",
      method: "error",
      requiresManualMode: true,
    };
  }
}

// Re-export for compatibility
export async function processFormWithOCR(pdfBuffer: Buffer, formId: string): Promise<OCRResult> {
  return extractFieldsFromPdf(pdfBuffer, formId);
}
