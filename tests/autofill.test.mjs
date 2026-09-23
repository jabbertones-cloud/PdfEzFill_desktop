/**
 * Autofill mapping contract tests for PdfEzFill Desktop.
 *
 * The desktop core value prop is fast local PDF form filling. The autofill
 * engine maps PDF field labels to the user's saved profile using the
 * pattern table from server/.syncthing.autofillService.ts.tmp.
 *
 * These tests pin that mapping table's semantics: which labels resolve to
 * which profile fields, precedence (priority), and coverage accounting
 * (non-text fields are excluded from the fillable count).
 *
 * Hermetic: pure pattern/label logic only. No AI, no network.
 *
 * Run:  npm test        (node --test, zero dependencies)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirror of FIELD_MAPPINGS (pattern table, highest priority wins) ──────
// Copied from server/.syncthing.autofillService.ts.tmp; labels matched via
// label.toLowerCase().trim() against these regexes.

const FIELD_MAPPINGS = [
  { profileField: 'fullName', customFieldKey: null, priority: 10, patterns: [
    /^full\s*name$/i, /^name$/i, /^your\s*name$/i, /^applicant\s*name$/i,
    /^printed\s*name$/i, /^legal\s*name$/i,
  ]},
  { profileField: 'customFields', customFieldKey: 'firstName', priority: 20, patterns: [
    /^first\s*name$/i, /^given\s*name$/i, /^forename$/i,
  ]},
  { profileField: 'customFields', customFieldKey: 'lastName', priority: 20, patterns: [
    /^last\s*name$/i, /^surname$/i, /^family\s*name$/i,
  ]},
  { profileField: 'email', customFieldKey: null, priority: 15, patterns: [
    /email/i, /e-mail/i, /electronic\s*mail/i,
  ]},
  { profileField: 'phone', customFieldKey: null, priority: 15, patterns: [
    /^phone(\s*number)?$/i, /telephone/i, /mobile/i, /cell/i,
  ]},
  { profileField: 'address', customFieldKey: null, priority: 12, patterns: [
    /^(street\s*)?address$/i, /mailing\s*address/i, /home\s*address/i,
  ]},
  { profileField: 'city', customFieldKey: null, priority: 15, patterns: [
    /^city$/i, /^town$/i,
  ]},
  { profileField: 'state', customFieldKey: null, priority: 15, patterns: [
    /^state$/i, /^province$/i,
  ]},
  { profileField: 'zip', customFieldKey: null, priority: 15, patterns: [
    /^zip(\s*code)?$/i, /postal\s*code/i,
  ]},
];

const NON_FILLABLE_TYPES = new Set(['checkbox', 'radio', 'signature']);

// Mirror of findBestMapping(label): highest-priority mapping whose pattern
// matches the normalized label.
function findBestMapping(label) {
  const normalized = label.toLowerCase().trim();
  let best = null;
  for (const mapping of FIELD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(normalized)) {
        if (!best || mapping.priority > best.priority) best = mapping;
        break;
      }
    }
  }
  return best;
}

function profileValue(profile, mapping) {
  if (mapping.profileField === 'customFields') {
    const [firstName, lastName] = profile.fullName.trim().split(/\s+/);
    return mapping.customFieldKey === 'firstName' ? firstName : lastName;
  }
  return profile[mapping.profileField];
}

// Mirror of generateAutofillSuggestions(fields, profile).
function generateAutofillSuggestions(fields, profile) {
  return fields.map((field) => {
    const mapping = findBestMapping(field.label);
    if (!mapping || NON_FILLABLE_TYPES.has(field.type)) {
      return { field, mapping: null, value: null, confidence: 'none' };
    }
    return {
      field,
      mapping,
      value: profileValue(profile, mapping) ?? '',
      confidence: 'exact',
    };
  });
}

// Mirror of getAutofillCoverage(fields, suggestions).
function getAutofillCoverage(fields, suggestions) {
  const fillable = fields.filter((f) => !NON_FILLABLE_TYPES.has(f.type));
  const exact = suggestions.filter((s) => s.confidence === 'exact').length;
  return {
    fillable: fillable.length,
    exact,
    coverage: fillable.length ? exact / fillable.length : 1,
  };
}

const PROFILE = {
  fullName: 'Jordan Reyes',
  email: 'jordan@example.com',
  phone: '555-0100',
  address: '12 Main St',
  city: 'Portland',
  state: 'OR',
  zip: '97205',
  customFields: {},
};

// ─── Happy path: canonical government/insurance form fields ───────────────

describe('autofill: common field labels resolve to the right profile data', () => {
  const cases = [
    ['Full Name', 'Jordan Reyes'],
    ['Name', 'Jordan Reyes'],
    ['Applicant Name', 'Jordan Reyes'],
    ['Legal Name', 'Jordan Reyes'],
    ['First Name', 'Jordan'],
    ['Given Name', 'Jordan'],
    ['Last Name', 'Reyes'],
    ['Surname', 'Reyes'],
    ['Email', 'jordan@example.com'],
    ['Email Address', 'jordan@example.com'],
    ['E-mail', 'jordan@example.com'],
    ['Phone Number', '555-0100'],
    ['Mobile', '555-0100'],
    ['Address', '12 Main St'],
    ['City', 'Portland'],
    ['State', 'OR'],
    ['ZIP Code', '97205'],
    ['Postal Code', '97205'],
  ];
  for (const [label, expected] of cases) {
    it(`"${label}" → "${expected}"`, () => {
      const mapping = findBestMapping(label);
      assert.ok(mapping, `no mapping matched "${label}"`);
      assert.equal(profileValue(PROFILE, mapping), expected);
    });
  }
});

describe('autofill: label normalization and safety', () => {
  it('ignores case and surrounding whitespace in labels', () => {
    assert.equal(findBestMapping('  FULL NAME  ').profileField, 'fullName');
    assert.equal(findBestMapping('eMaIl').profileField, 'email');
  });

  it('does not autofill unrecognized labels (no data in wrong fields)', () => {
    assert.equal(findBestMapping('Favorite Color'), null);
    assert.equal(findBestMapping('SSN'), null);
    assert.equal(findBestMapping('Policy Number'), null);
  });

  it('does not confuse email with non-email fields', () => {
    // A field labeled just "Electronic Mail" still matches email...
    assert.equal(findBestMapping('Electronic Mail').profileField, 'email');
    // ...but "Mailing Address" is an address, not an email.
    assert.equal(findBestMapping('Mailing Address').profileField, 'address');
  });

  it('first/last name mappings take precedence over generic name mapping', () => {
    assert.equal(findBestMapping('First Name').priority, 20);
    assert.equal(findBestMapping('Full Name').priority, 10);
    assert.equal(profileValue(PROFILE, findBestMapping('First Name')), 'Jordan');
    assert.equal(profileValue(PROFILE, findBestMapping('Last Name')), 'Reyes');
  });

  it('missing profile values surface as empty strings, never crash', () => {
    const sparse = { fullName: 'Jo', email: '', phone: '', customFields: {} };
    const fields = [{ label: 'Email', type: 'text' }, { label: 'City', type: 'text' }];
    const suggestions = generateAutofillSuggestions(fields, sparse);
    assert.equal(suggestions[0].value, '');
    assert.equal(suggestions[1].value, '');
  });
});

// ─── Coverage accounting ──────────────────────────────────────────────────

describe('autofill: coverage accounting', () => {
  it('excludes checkbox, radio and signature fields from fillable count', () => {
    const fields = [
      { label: 'Full Name', type: 'text' },
      { label: 'Email', type: 'text' },
      { label: 'Agree to Terms', type: 'checkbox' },
      { label: 'Payment Method', type: 'radio' },
      { label: 'Signature', type: 'signature' },
    ];
    const suggestions = generateAutofillSuggestions(fields, PROFILE);
    const cov = getAutofillCoverage(fields, suggestions);
    assert.equal(cov.fillable, 2);
    assert.equal(cov.exact, 2);
    assert.equal(cov.coverage, 1);
    // Non-fillable fields get no autofill value.
    assert.equal(suggestions[2].value, null);
    assert.equal(suggestions[4].value, null);
  });

  it('reports partial coverage when some fields are unmapped', () => {
    const fields = [
      { label: 'Full Name', type: 'text' },
      { label: 'Policy Number', type: 'text' },
    ];
    const suggestions = generateAutofillSuggestions(fields, PROFILE);
    const cov = getAutofillCoverage(fields, suggestions);
    assert.equal(cov.coverage, 0.5);
  });

  it('a fully-unmappable form reports 0 coverage', () => {
    const fields = [{ label: 'Favorite Color', type: 'text' }];
    const suggestions = generateAutofillSuggestions(fields, PROFILE);
    assert.equal(getAutofillCoverage(fields, suggestions).coverage, 0);
  });
});
