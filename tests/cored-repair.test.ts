/**
 * CORE-D repair tests (defects 1, 2, 3, 5, 6, 14, 15).
 *
 * These import the REAL server modules — no mocks of the thing being
 * verified. The renderer test builds a real AcroForm PDF with pdf-lib,
 * renders answers through renderCompletedPdf, and reads the values back
 * out of the produced bytes with pdf-lib's form API.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PDFDocument } from "pdf-lib";

let renderCompletedPdf: any;
let findFieldForAcroName: any;
let computeGenerateHash: any;
let OCRLogger: any;
let generateAutofillSuggestions: any;
let isPdftoppmMissingError: any;
let POPPLER_MISSING_MESSAGE: any;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cored-test-"));

afterAll(() => {
  fs.rmSync(path.resolve(process.cwd(), "test-storage", "cored-repair"), { recursive: true, force: true });
  fs.rmSync(path.resolve(process.cwd(), "test-storage", "forms", "test-form"), { recursive: true, force: true });
});

beforeAll(async () => {
  process.env.LOCAL_STORAGE_PATH = tmpDir;
  ({ renderCompletedPdf, findFieldForAcroName } = await import("../server/pdfRenderer"));
  ({ computeGenerateHash } = await import("../server/generateCache"));
  ({ OCRLogger } = await import("../server/ocrService"));
  ({ generateAutofillSuggestions } = await import("../server/autofillService"));
  ({ isPdftoppmMissingError, POPPLER_MISSING_MESSAGE } = await import("../server/systemDeps"));
}, 60000);

// The desktop storage driver resolves originals under <repo>/test-storage
// by relative key, so the source fixture lives there during the test.
const storageRoot = path.resolve(process.cwd(), "test-storage", "cored-repair");

async function buildSourcePdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const name = form.createTextField("topmostSubform[0].Page1[0].f1_01[0]");
  name.addToPage(page, { x: 50, y: 700, width: 300, height: 20 });
  const city = form.createTextField("City");
  city.addToPage(page, { x: 50, y: 660, width: 200, height: 20 });
  const agree = form.createCheckBox("Agree");
  agree.addToPage(page, { x: 50, y: 620, width: 15, height: 15 });
  const untouched = form.createTextField("Untouched");
  untouched.addToPage(page, { x: 50, y: 580, width: 200, height: 20 });
  fs.mkdirSync(storageRoot, { recursive: true });
  // The desktop storage driver keeps files as base64 text and decodes on
  // download — store the fixture the way the upload path would.
  fs.writeFileSync(
    path.join(storageRoot, "source.pdf"),
    Buffer.from(await doc.save()).toString("base64")
  );
  return "cored-repair/source.pdf";
}

const FIELDS = [
  { id: "field_native_0", label: "topmostSubform[0].Page1[0].f1_01[0]", acroName: "topmostSubform[0].Page1[0].f1_01[0]", type: "text", page: 1, required: false, x: 8, y: 10, width: 49, height: 3 },
  { id: "f_city", label: "City", acroName: "City", type: "text", page: 1, required: false, x: 8, y: 15, width: 33, height: 3 },
  { id: "f_agree", label: "Agree", acroName: "Agree", type: "checkbox", page: 1, required: false, x: 8, y: 20, width: 3, height: 2 },
  { id: "f_untouched", label: "Untouched", acroName: "Untouched", type: "text", page: 1, required: false, x: 8, y: 25, width: 33, height: 3 },
];

describe("defect 1+2: renderer writes real AcroForm values, Unicode exact", () => {
  it("stores /V byte-exact (accents, em-dash, CJK, emoji), checkbox set, fields not flattened", async () => {
    const source = await buildSourcePdf();
    const unicodeValue = "José Müller — 北京 🎉";
    const result = await renderCompletedPdf({
      answers: { field_native_0: unicodeValue, f_city: "Scottsdale", f_agree: "true" },
      fields: FIELDS,
      fieldOverrides: [],
      originalPdfPath: source,
      formId: "test-form",
      fileName: "source.pdf",
    });
    expect(result.success).toBe(true);
    expect(result.pdfBuffer).toBeTruthy();

    const out = await PDFDocument.load(result.pdfBuffer);
    const form = out.getForm();
    // Not flattened: all four fields still exist as form fields.
    expect(form.getFields().length).toBe(4);
    expect(form.getTextField("topmostSubform[0].Page1[0].f1_01[0]").getText()).toBe(unicodeValue);
    expect(form.getTextField("City").getText()).toBe("Scottsdale");
    expect(form.getCheckBox("Agree").isChecked()).toBe(true);
    const untouched = form.getTextField("Untouched").getText();
    expect(untouched === undefined || untouched === "").toBe(true);
  }, 60000);

  it("matches AcroForm names via acroName first, then normalized label/id", () => {
    const byAcro = findFieldForAcroName(FIELDS, "topmostSubform[0].Page1[0].f1_01[0]");
    expect(byAcro?.id).toBe("field_native_0");
    const legacy = [{ id: "x1", label: "topmostSubform[0].Page1[0].f1_01[0]", type: "text", page: 1 }];
    expect(findFieldForAcroName(legacy, "topmostSubform[0].Page1[0].f1_01[0]")?.id).toBe("x1");
    expect(findFieldForAcroName(FIELDS, "NoSuchField")).toBeUndefined();
  });
});

describe("defect 14: generate cache hash keys on all output inputs", () => {
  const base = {
    answers: { a: "1" },
    signatureData: null as string | null,
    fields: [{ id: "a" }],
    fieldOverrides: [] as unknown[],
  };
  it("same inputs → same hash; changed answer/signature/fields → different hash", () => {
    const h1 = computeGenerateHash(base);
    expect(computeGenerateHash({ ...base })).toBe(h1);
    expect(computeGenerateHash({ ...base, answers: { a: "2" } })).not.toBe(h1);
    expect(computeGenerateHash({ ...base, signatureData: "data:image/png;base64,x" })).not.toBe(h1);
    expect(computeGenerateHash({ ...base, fields: [{ id: "b" }] })).not.toBe(h1);
    expect(computeGenerateHash({ ...base, fieldOverrides: [{ fieldId: "a" }] })).not.toBe(h1);
  });
  it("answer key order does not change the hash", () => {
    const h1 = computeGenerateHash({ ...base, answers: { a: "1", b: "2" } });
    const h2 = computeGenerateHash({ ...base, answers: { b: "2", a: "1" } });
    expect(h1).toBe(h2);
  });
});

describe("defect 3: OCRLogger honours the full logger contract", () => {
  it("exposes log/warn/error and warn() does not throw", () => {
    const logger = new OCRLogger("test");
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(() => logger.warn("stage-5 style warning")).not.toThrow();
  });
});

describe("defect 5: autofill matcher — coverage with precision guards", () => {
  const profile: any = {
    label: "Personal",
    fullName: "Jane Q Public",
    email: "jane.public@example.com",
    phone: "(602) 555-0148",
    address: "4210 N Scottsdale Rd",
    city: "Scottsdale",
    state: "AZ",
    zipCode: "85251",
    country: "United States",
    dateOfBirth: "1985-04-12",
    ssn: "078-05-1120",
    employer: "Desert Unified School District",
    jobTitle: "Teacher",
    driversLicense: "D12345678",
    customFields: {},
  };
  const mk = (id: string, label: string, type = "text") =>
    ({ id, label, type, page: 1, required: false, x: 0, y: 0, width: 10, height: 3 } as any);

  it("matches human labels and AcroForm parent-segment semantics", () => {
    const fields = [
      mk("a", "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_20[0]"),
      mk("b", "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_21[0]"),
      mk("c", "topmostSubform[0].Page2[0].SSN_ReadOrder[0].f2_22[0]"),
      mk("d", "Email Address", "email"),
      mk("e", "Date of Birth", "date"),
      mk("f", "ZIP Code"),
    ];
    const out = generateAutofillSuggestions(fields, profile);
    const byId = new Map(out.map((s: any) => [s.fieldId, s]));
    // Address group: exactly ONE street-address suggestion (first box).
    expect(byId.get("a")?.value).toBe("4210 N Scottsdale Rd");
    expect(byId.has("b")).toBe(false);
    expect(byId.get("c")?.value).toBe("078-05-1120");
    expect(byId.get("d")?.value).toBe("jane.public@example.com");
    expect(byId.get("e")?.value).toBe("1985-04-12");
    expect(byId.get("f")?.value).toBe("85251");
  });

  it("never suggests the owner's values for other people / wrong boxes", () => {
    const fields = [
      mk("s1", "Spouse Full Name"),
      mk("s2", "Spouse Social Security Number"),
      mk("s3", "Emergency Contact Phone", "phone"),
      mk("s4", "Bank Routing Number"),
      mk("s5", "Bank Account Number"),
      mk("s6", "Today's Date", "date"),
      mk("s7", "Foreign Address"),
    ];
    const out = generateAutofillSuggestions(fields, profile);
    expect(out).toEqual([]);
  });

  it("SSN last-4 boxes get only the last four digits", () => {
    const out = generateAutofillSuggestions([mk("l4", "SSN Last 4")], profile);
    expect(out.length).toBe(1);
    expect(out[0].value).toBe("1120");
  });

  it("derives last name without the middle initial", () => {
    const out = generateAutofillSuggestions([mk("ln", "Last Name")], profile);
    expect(out[0]?.value).toBe("Public");
  });
});

describe("defect 15: poppler-missing detection is specific", () => {
  it("recognizes spawn ENOENT and shell 'command not found' for pdftoppm only", () => {
    expect(isPdftoppmMissingError(Object.assign(new Error("spawn pdftoppm ENOENT"), { code: "ENOENT" }))).toBe(true);
    expect(isPdftoppmMissingError(new Error("/bin/sh: pdftoppm: command not found"))).toBe(true);
    expect(isPdftoppmMissingError(new Error("spawn python3 ENOENT"))).toBe(false);
    expect(isPdftoppmMissingError(new Error("some other failure"))).toBe(false);
    expect(POPPLER_MISSING_MESSAGE).toContain("Poppler");
    expect(POPPLER_MISSING_MESSAGE).toContain("pdftoppm");
  });
});
