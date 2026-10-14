import type { FormField, Profile } from "@shared/schema";

// ── Autofill matching engine (defect 5) ────────────────────────────────
// The previous matcher ran anchored regular expressions against the raw
// label string. That fails on the labels real PDFs actually carry:
// hierarchical AcroForm names ("topmostSubform[0].Page1[0].Address_Read
// Order[0].f1_04[0]") where the semantics live in a PARENT segment while
// the leaf is an opaque code, and on ordinary variants ("E-mail", "DOB",
// "Applicant's full legal name").
//
// This engine tokenizes labels (splitting path segments, camelCase,
// underscores, digits), then matches a defensible table of form CONCEPTS
// (token phrases) with two evidence strengths:
//   - leaf evidence   — the field's own name segment mentions the concept
//   - parent evidence — only a containing group names the concept
//     (weaker; reported as "suggested", and for street address only the
//     first field of the group is suggested, so one value is not stamped
//     into every box of an address block).
// Precision guards: fields naming ANOTHER person (spouse, dependent,
// child, emergency contact, beneficiary, witness, guarantor, reference)
// never receive the profile owner's values; "foreign" address fields
// never receive the domestic address; bank routing/account numbers have
// no profile concept and are never guessed.

interface ConceptDef {
  concept: string;
  profileField: keyof Profile | "customFields";
  customFieldKey?: string;
  priority: number; // Higher = more specific match
  phrases: string[][];
}

const tok = (phrase: string): string[] => phrase.split(" ");

const CONCEPTS: ConceptDef[] = [
  { concept: "fullName", profileField: "fullName", priority: 10, phrases: [
    "full name", "your name", "applicant name", "applicant full name",
    "printed name", "legal name", "full legal name", "employee name",
    "customer name", "client name", "taxpayer name", "primary name", "name",
  ].map(tok) },
  { concept: "firstName", profileField: "customFields", customFieldKey: "firstName", priority: 20, phrases: [
    "first name", "given name", "forename", "first",
  ].map(tok) },
  { concept: "lastName", profileField: "customFields", customFieldKey: "lastName", priority: 20, phrases: [
    "last name", "surname", "family name", "last",
  ].map(tok) },
  { concept: "email", profileField: "email", priority: 15, phrases: [
    "email", "e mail", "electronic mail",
  ].map(tok) },
  { concept: "phone", profileField: "phone", priority: 15, phrases: [
    "phone number", "contact number", "daytime phone", "home phone",
    "work phone", "mobile number", "cell number", "telephone number",
    "phone", "telephone", "mobile", "cell", "tel",
  ].map(tok) },
  { concept: "dateOfBirth", profileField: "dateOfBirth", priority: 15, phrases: [
    "date of birth", "birth date", "birthday", "dob", "d o b",
  ].map(tok) },
  { concept: "address", profileField: "address", priority: 10, phrases: [
    "street address", "mailing address", "home address",
    "residential address", "current address", "permanent address",
    "address line", "address", "street",
  ].map(tok) },
  { concept: "city", profileField: "city", priority: 20, phrases: [
    "city town", "city", "town",
  ].map(tok) },
  { concept: "state", profileField: "state", priority: 20, phrases: [
    "state province", "state", "province", "st",
  ].map(tok) },
  { concept: "zipCode", profileField: "zipCode", priority: 20, phrases: [
    "zip code", "postal code", "zip", "postal", "postcode",
  ].map(tok) },
  { concept: "country", profileField: "country", priority: 15, phrases: [
    "united states", "country", "nation",
  ].map(tok) },
  { concept: "employer", profileField: "employer", priority: 15, phrases: [
    "employer name", "company name", "employer", "company",
    "organization", "organisation", "business name", "workplace",
  ].map(tok) },
  { concept: "jobTitle", profileField: "jobTitle", priority: 15, phrases: [
    "job title", "job occupation", "position", "occupation", "title",
    "role", "job", "profession",
  ].map(tok) },
  { concept: "ssn", profileField: "ssn", priority: 25, phrases: [
    "social security number", "social security", "ssn", "ss",
  ].map(tok) },
  { concept: "driversLicense", profileField: "driversLicense", priority: 25, phrases: [
    "drivers license", "driver license", "drivers licence",
    "license number", "driver", "dl",
  ].map(tok) },
];

const OTHER_PERSON_TOKENS = new Set([
  "spouse", "dependent", "dependant", "dependents", "child", "children",
  "beneficiary", "emergency", "witness", "guarantor", "reference",
  "references", "joint",
]);

const FOREIGN_BLOCKED = new Set(["address", "city", "state", "zipCode", "country"]);

/** Split one name segment into lowercase tokens: camelCase, snake_case,
 * letter/digit boundaries and punctuation all separate tokens. */
export function tokenizeSegment(segment: string): string[] {
  return segment
    .replace(/\[\d+\]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Split a (possibly hierarchical) field name into tokenized segments. */
export function labelSegments(name: string): string[][] {
  return String(name || "")
    .split(/[./\\]/)
    .map(tokenizeSegment)
    .filter((tokens) => tokens.length > 0);
}

function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

export interface ConceptMatch {
  concept: ConceptDef;
  strength: "leaf" | "parent";
  phraseLength: number;
}

/** Match a field (label + recorded AcroForm name) to at most one concept. */
export function matchFieldConcept(field: FormField): ConceptMatch | null {
  const names = [field.label, (field as any).acroName]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const segmentSets = names.map(labelSegments);
  const allTokens = new Set(segmentSets.flat(2));

  // Other-person guard: a field about a spouse / dependent / emergency
  // contact / etc. must not receive the profile owner's values.
  const otherPerson = Array.from(allTokens).some((t) => OTHER_PERSON_TOKENS.has(t));
  if (otherPerson) return null;

  const foreign = allTokens.has("foreign");

  let best: ConceptMatch | null = null;
  for (const segments of segmentSets) {
    if (segments.length === 0) continue;
    const leaf = segments[segments.length - 1];
    const parents = segments.slice(0, -1);
    for (const concept of CONCEPTS) {
      if (foreign && FOREIGN_BLOCKED.has(concept.concept)) continue;
      for (const phrase of concept.phrases) {
        const inLeaf = containsPhrase(leaf, phrase);
        const inParent = !inLeaf && parents.some((seg) => containsPhrase(seg, phrase));
        if (!inLeaf && !inParent) continue;
        const candidate: ConceptMatch = {
          concept,
          strength: inLeaf ? "leaf" : "parent",
          phraseLength: phrase.length,
        };
        if (
          !best ||
          (candidate.strength === "leaf" && best.strength === "parent") ||
          (candidate.strength === best.strength &&
            (candidate.phraseLength > best.phraseLength ||
              (candidate.phraseLength === best.phraseLength &&
                candidate.concept.priority > best.concept.priority)))
        ) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

/** True when the field asks for only the last 4 digits of the SSN. */
export function isSsnLast4Field(field: FormField): boolean {
  const names = [field.label, (field as any).acroName]
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  for (const segments of names.map(labelSegments)) {
    const leaf = segments[segments.length - 1] || [];
    const hasSsn = CONCEPTS.find((c) => c.concept === "ssn")!.phrases.some(
      (p) => containsPhrase(leaf, p)
    );
    if (hasSsn && leaf.includes("last") && (leaf.includes("4") || leaf.includes("four"))) {
      return true;
    }
  }
  return false;
}

// Additional patterns for first/last name extraction from full name
function extractNameParts(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  // "Jane Q Public": a single-letter middle initial is not part of the
  // family name.
  if (parts.length >= 3 && parts[1].replace(".", "").length === 1) {
    return { firstName: parts[0], lastName: parts.slice(2).join(" ") };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

// Get value from profile based on the matched concept
function getProfileValue(profile: Profile, concept: ConceptDef): string | null {
  if (concept.profileField === "customFields") {
    const customFields = profile.customFields || {};
    const key = concept.customFieldKey || "";

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

  const value = (profile as any)[concept.profileField];
  if (value !== null && value !== undefined && String(value) !== "") {
    return String(value);
  }
  // Fallbacks from custom fields (e.g. occupation recorded as a custom
  // field rather than the jobTitle column).
  const customFields = profile.customFields || {};
  if (concept.concept === "jobTitle" && customFields.occupation) {
    return customFields.occupation;
  }
  if (concept.concept === "employer" && customFields.employer) {
    return customFields.employer;
  }
  return null;
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
  // Parent-evidence street-address suggestions: one per containing group,
  // so a whole address block of boxes doesn't all get the street line.
  const addressGroupsUsed = new Set<string>();

  for (const field of fields) {
    // Skip non-text fields and already filled fields
    if (field.type === "checkbox" || field.type === "radio" || field.type === "signature") {
      continue;
    }

    // "SSN last 4" boxes get the last four digits, never the full SSN.
    if (isSsnLast4Field(field)) {
      const digits = String(profile.ssn || "").replace(/\D/g, "");
      if (digits.length >= 4) {
        results.push({
          fieldId: field.id,
          value: digits.slice(-4),
          matchedProfileField: "ssnLast4",
          confidence: "exact",
        });
      }
      continue;
    }

    const match = matchFieldConcept(field);
    if (!match) continue;

    if (match.concept.concept === "address" && match.strength === "parent") {
      const segments = labelSegments(field.label || "");
      const groupKey = segments.slice(0, -1).map((t) => t.join(" ")).join("/");
      if (addressGroupsUsed.has(groupKey)) continue;
      addressGroupsUsed.add(groupKey);
    }

    const value = getProfileValue(profile, match.concept);
    if (!value) continue;

    results.push({
      fieldId: field.id,
      value,
      matchedProfileField: match.concept.profileField === "customFields"
        ? match.concept.customFieldKey || "custom"
        : match.concept.profileField,
      confidence:
        match.strength === "parent"
          ? "suggested"
          : match.concept.priority >= 20
            ? "exact"
            : match.concept.priority >= 15
              ? "partial"
              : "suggested",
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
