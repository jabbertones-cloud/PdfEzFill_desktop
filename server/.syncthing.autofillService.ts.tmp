import type { FormField, Profile } from "@shared/schema";

// Mapping rules for common form field labels to profile fields
// Based on 2025 best practices for smart autofill

interface FieldMapping {
  profileField: keyof Profile | "customFields";
  customFieldKey?: string;
  patterns: RegExp[];
  priority: number; // Higher = more specific match
}

const FIELD_MAPPINGS: FieldMapping[] = [
  // Full name
  {
    profileField: "fullName",
    patterns: [
      /^full\s*name$/i,
      /^name$/i,
      /^your\s*name$/i,
      /^applicant\s*name$/i,
      /^printed\s*name$/i,
      /^legal\s*name$/i,
    ],
    priority: 10,
  },
  // First name
  {
    profileField: "customFields",
    customFieldKey: "firstName",
    patterns: [
      /^first\s*name$/i,
      /^given\s*name$/i,
      /^forename$/i,
    ],
    priority: 20,
  },
  // Last name
  {
    profileField: "customFields",
    customFieldKey: "lastName",
    patterns: [
      /^last\s*name$/i,
      /^surname$/i,
      /^family\s*name$/i,
    ],
    priority: 20,
  },
  // Email
  {
    profileField: "email",
    patterns: [
      /email/i,
      /e-mail/i,
      /electronic\s*mail/i,
    ],
    priority: 15,
  },
  // Phone
  {
    profileField: "phone",
    patterns: [
      /phone/i,
      /telephone/i,
      /mobile/i,
      /cell/i,
      /contact\s*number/i,
      /tel\.?$/i,
    ],
    priority: 15,
  },
  // Date of birth
  {
    profileField: "dateOfBirth",
    patterns: [
      /date\s*of\s*birth/i,
      /dob$/i,
      /birth\s*date/i,
      /birthday/i,
      /born/i,
    ],
    priority: 15,
  },
  // Address
  {
    profileField: "address",
    patterns: [
      /^address$/i,
      /street\s*address/i,
      /mailing\s*address/i,
      /home\s*address/i,
      /residential\s*address/i,
      /^address\s*line\s*1$/i,
    ],
    priority: 10,
  },
  // City
  {
    profileField: "city",
    patterns: [
      /^city$/i,
      /^town$/i,
      /city\s*\/\s*town/i,
    ],
    priority: 20,
  },
  // State
  {
    profileField: "state",
    patterns: [
      /^state$/i,
      /^province$/i,
      /state\s*\/\s*province/i,
      /^st$/i,
    ],
    priority: 20,
  },
  // Zip Code
  {
    profileField: "zipCode",
    patterns: [
      /zip/i,
      /postal\s*code/i,
      /postcode/i,
    ],
    priority: 20,
  },
  // Country
  {
    profileField: "country",
    patterns: [
      /^country$/i,
      /^nation$/i,
    ],
    priority: 15,
  },
  // Employer
  {
    profileField: "employer",
    patterns: [
      /employer/i,
      /company/i,
      /organization/i,
      /business\s*name/i,
      /workplace/i,
    ],
    priority: 15,
  },
  // Job Title
  {
    profileField: "jobTitle",
    patterns: [
      /job\s*title/i,
      /position/i,
      /occupation/i,
      /title$/i,
      /role$/i,
    ],
    priority: 15,
  },
  // SSN (sensitive - only last 4)
  {
    profileField: "ssn",
    patterns: [
      /ssn/i,
      /social\s*security/i,
      /ss\s*#/i,
      /social\s*#/i,
    ],
    priority: 25,
  },
  // Driver's License
  {
    profileField: "driversLicense",
    patterns: [
      /driver/i,
      /license\s*number/i,
      /dl\s*#/i,
      /license\s*#/i,
    ],
    priority: 25,
  },
];

// Additional patterns for first/last name extraction from full name
function extractNameParts(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

// Find best match for a field label
function findBestMapping(label: string): FieldMapping | null {
  const normalizedLabel = label.toLowerCase().trim();
  
  let bestMatch: FieldMapping | null = null;
  let bestPriority = -1;
  
  for (const mapping of FIELD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(normalizedLabel) && mapping.priority > bestPriority) {
        bestMatch = mapping;
        bestPriority = mapping.priority;
      }
    }
  }
  
  return bestMatch;
}

// Get value from profile based on mapping
function getProfileValue(profile: Profile, mapping: FieldMapping): string | null {
  if (mapping.profileField === "customFields") {
    const customFields = profile.customFields || {};
    const key = mapping.customFieldKey || "";
    
    // First check if explicit customFields entry exists
    if (customFields[key]) {
      return customFields[key];
    }
    
    // Handle first/last name extraction from fullName as fallback
    if (key === "firstName" || key === "lastName") {
      const { firstName, lastName } = extractNameParts(profile.fullName);
      const value = key === "firstName" ? firstName : lastName;
      return value || null;
    }
    
    return null;
  }
  
  const value = profile[mapping.profileField];
  if (value === null || value === undefined) return null;
  return String(value);
}

export interface AutofillResult {
  fieldId: string;
  value: string;
  matchedProfileField: string;
  confidence: "exact" | "partial" | "suggested";
}

// Generate autofill suggestions for form fields
export function generateAutofillSuggestions(
  fields: FormField[],
  profile: Profile
): AutofillResult[] {
  const results: AutofillResult[] = [];
  
  for (const field of fields) {
    // Skip non-text fields and already filled fields
    if (field.type === "checkbox" || field.type === "radio" || field.type === "signature") {
      continue;
    }
    
    const mapping = findBestMapping(field.label);
    if (!mapping) continue;
    
    const value = getProfileValue(profile, mapping);
    if (!value) continue;
    
    results.push({
      fieldId: field.id,
      value,
      matchedProfileField: mapping.profileField === "customFields" 
        ? mapping.customFieldKey || "custom"
        : mapping.profileField,
      confidence: mapping.priority >= 20 ? "exact" : mapping.priority >= 15 ? "partial" : "suggested",
    });
  }
  
  return results;
}

// Apply autofill values to answers
export function applyAutofill(
  currentAnswers: Record<string, string>,
  suggestions: AutofillResult[],
  overwriteExisting = false
): Record<string, string> {
  const newAnswers = { ...currentAnswers };
  
  for (const suggestion of suggestions) {
    if (overwriteExisting || !newAnswers[suggestion.fieldId]) {
      newAnswers[suggestion.fieldId] = suggestion.value;
    }
  }
  
  return newAnswers;
}

// Get autofill coverage statistics
export function getAutofillCoverage(
  fields: FormField[],
  suggestions: AutofillResult[]
): {
  totalFields: number;
  autofilledFields: number;
  coveragePercent: number;
  exactMatches: number;
  partialMatches: number;
} {
  const fillableFields = fields.filter(
    f => f.type !== "checkbox" && f.type !== "radio" && f.type !== "signature"
  );
  
  const exactMatches = suggestions.filter(s => s.confidence === "exact").length;
  const partialMatches = suggestions.filter(s => s.confidence === "partial").length;
  
  return {
    totalFields: fillableFields.length,
    autofilledFields: suggestions.length,
    coveragePercent: fillableFields.length > 0 
      ? Math.round((suggestions.length / fillableFields.length) * 100)
      : 0,
    exactMatches,
    partialMatches,
  };
}
