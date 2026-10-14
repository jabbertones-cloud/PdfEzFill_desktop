import {
  PDFDocument, rgb, StandardFonts, PDFFont, PDFPage,
  PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList,
  PDFName, PDFBool,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";
import type { FormField, FieldOverride } from "@shared/schema";
import { downloadPdf, uploadPdf } from "./objectStorageService";
import { verifyFilledPdf, type VerificationResult } from "./pdfVerification";

export interface RenderOptions {
  answers: Record<string, string>;
  signatureData?: string | null;
  fields: FormField[];
  fieldOverrides?: FieldOverride[];
  originalPdfPath: string;
  formId: string;
  fileName: string;
}

export interface RenderResult {
  success: boolean;
  pdfBuffer?: Buffer;
  generatedPath?: string;
  error?: string;
  verification?: VerificationResult;
}

// Text rendering configuration (2025 best practices)
const TEXT_CONFIG = {
  minFontSize: 8,
  maxFontSize: 14,
  defaultFontSize: 10,
  lineHeight: 1.3,
  padding: 2,
  checkmarkSize: 12,
  radioFillSize: 8,
};

// ── Unicode font (defect 2) ─────────────────────────────────────────────
// Helvetica/WinAnsi cannot encode accents beyond Latin-1, CJK, or emoji:
// pdf-lib throws "WinAnsi cannot encode" and generation fails outright.
// We embed Noto Sans SC (Latin + CJK coverage, SIL OFL 1.1 — see
// assets/fonts/) and use it for AcroForm appearances and overlays.
let unicodeFontBytesCache: Buffer | null | undefined;

function loadUnicodeFontBytes(): Buffer | null {
  if (unicodeFontBytesCache !== undefined) return unicodeFontBytesCache;
  const candidates = [
    path.join(__dirname, "assets", "fonts", "NotoSansSC.ttf"),
    path.join(__dirname, "..", "assets", "fonts", "NotoSansSC.ttf"),
    path.join(__dirname, "..", "server", "assets", "fonts", "NotoSansSC.ttf"),
    path.join(process.cwd(), "assets", "fonts", "NotoSansSC.ttf"),
    path.join(process.cwd(), "server", "assets", "fonts", "NotoSansSC.ttf"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        unicodeFontBytesCache = fs.readFileSync(candidate);
        return unicodeFontBytesCache;
      }
    } catch {
      // try the next candidate
    }
  }
  console.warn("[pdf] Unicode font asset (assets/fonts/NotoSansSC.ttf) not found; falling back to Helvetica appearances + NeedAppearances for non-WinAnsi values");
  unicodeFontBytesCache = null;
  return null;
}

async function embedUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont | null> {
  try {
    const bytes = loadUnicodeFontBytes();
    if (!bytes) return null;
    pdfDoc.registerFontkit(fontkit as any);
    return await pdfDoc.embedFont(bytes, { subset: true });
  } catch (error) {
    console.warn("[pdf] Could not embed Unicode font; falling back:", error);
    return null;
  }
}

/** Normalize an AcroForm name / label / id for comparison: case- and
 * punctuation-insensitive, so "topmostSubform[0].Page1[0].f1_01[0]" and a
 * label derived from it compare equal. */
export function normalizeAcroKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Find the extracted field that corresponds to an AcroForm field name.
 * The recorded acroName is authoritative; id/label matching is a fallback
 * for field schemas produced before acroName was recorded. */
export function findFieldForAcroName(
  fields: FormField[],
  acroName: string
): FormField | undefined {
  const byAcroName = fields.find((f) => (f as any).acroName === acroName);
  if (byAcroName) return byAcroName;
  const key = normalizeAcroKey(acroName);
  if (!key) return undefined;
  return fields.find(
    (f) => normalizeAcroKey(f.id) === key || normalizeAcroKey(f.label || "") === key
  );
}

// Calculate optimal font size based on field dimensions and text length
function calculateOptimalFontSize(
  text: string,
  fieldWidth: number,
  fieldHeight: number,
  font: PDFFont
): number {
  const targetHeight = fieldHeight * 0.7;
  let fontSize = Math.min(targetHeight, TEXT_CONFIG.maxFontSize);
  fontSize = Math.max(fontSize, TEXT_CONFIG.minFontSize);
  
  // Reduce font size if text is too wide
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  if (textWidth > fieldWidth - TEXT_CONFIG.padding * 2) {
    const scaleFactor = (fieldWidth - TEXT_CONFIG.padding * 2) / textWidth;
    fontSize = Math.max(fontSize * scaleFactor, TEXT_CONFIG.minFontSize);
  }
  
  return fontSize;
}

// Format date values for display
function formatDateValue(value: string): string {
  if (!value) return value;
  
  // Try to parse as date and format consistently
  const dateFormats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
  ];
  
  for (const format of dateFormats) {
    if (format.test(value)) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
        }
      } catch {}
    }
  }
  
  return value;
}

// Draw checkbox with proper X or checkmark
function drawCheckbox(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  checked: boolean
) {
  if (checked) {
    // Draw X mark for checked checkbox (more universally visible)
    const markSize = Math.min(size * 0.8, TEXT_CONFIG.checkmarkSize);
    page.drawText("X", {
      x: x + (size - markSize) / 2,
      y: y + (size - markSize) / 2,
      size: markSize,
      font: font,
      color: rgb(0, 0, 0),
    });
  }
}

// Draw radio button fill
function drawRadioFill(
  page: PDFPage,
  x: number,
  y: number,
  size: number
) {
  // Draw filled circle for selected radio
  const fillSize = Math.min(size * 0.6, TEXT_CONFIG.radioFillSize);
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  
  page.drawCircle({
    x: centerX,
    y: centerY,
    size: fillSize / 2,
    color: rgb(0, 0, 0),
  });
}

function applyFieldOverrides(
  fields: FormField[],
  overrides: FieldOverride[] = []
): FormField[] {
  const result = [...fields];
  
  for (const override of overrides) {
    if (override.action === "delete") {
      const idx = result.findIndex(f => f.id === override.fieldId);
      if (idx !== -1) {
        result.splice(idx, 1);
      }
    } else if (override.action === "edit" && override.modifiedField) {
      const idx = result.findIndex(f => f.id === override.fieldId);
      if (idx !== -1) {
        result[idx] = { ...result[idx], ...override.modifiedField };
      }
    } else if (override.action === "add" && override.modifiedField) {
      result.push(override.modifiedField);
    }
  }
  
  return result;
}

export async function renderCompletedPdf(options: RenderOptions): Promise<RenderResult> {
  const { answers, signatureData, fields, fieldOverrides, originalPdfPath, formId, fileName } = options;
  
  try {
    console.log(`[pdf] Loading original PDF from ${originalPdfPath}`);
    const originalPdfBuffer = await downloadPdf(originalPdfPath);
    
    if (!originalPdfBuffer) {
      return {
        success: false,
        error: "Could not retrieve original PDF from storage",
      };
    }
    
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const finalFields = applyFieldOverrides(fields, fieldOverrides);

    // ── AcroForm native fill (fillable PDFs) ────────────────────────────
    // Set REAL AcroForm values (/V) via pdf-lib's form API so any reader
    // (pypdf, Acrobat, Preview) sees the filled values as form data.
    // The form is NEVER flattened afterwards: flattening destroys the
    // field values and leaves only a picture behind.
    const acroForm = pdfDoc.getForm();
    const nativelyFilled = new Set<string>();
    const unicodeFont = await embedUnicodeFont(pdfDoc);
    const appearanceFont = unicodeFont ?? font;
    try {
      const acroFields = acroForm.getFields();
      for (const acroField of acroFields) {
        const acroName = acroField.getName();
        const matchingField = findFieldForAcroName(finalFields, acroName);
        if (!matchingField) continue;
        const answer = answers[matchingField.id];
        if (answer === undefined || answer === null || answer === "") continue;
        try {
          if (acroField instanceof PDFTextField) {
            // The value is stored exactly as provided (dates etc. are NOT
            // reformatted here — /V must round-trip byte-exact).
            acroField.setText(String(answer));
            nativelyFilled.add(matchingField.id);
          } else if (acroField instanceof PDFCheckBox) {
            const checked =
              answer === "true" || answer === "yes" || answer === "1" ||
              String(answer).toLowerCase() === "on";
            if (checked) acroField.check();
            else acroField.uncheck();
            nativelyFilled.add(matchingField.id);
          } else if (acroField instanceof PDFRadioGroup) {
            acroField.select(String(answer));
            nativelyFilled.add(matchingField.id);
          } else if (acroField instanceof PDFDropdown) {
            acroField.select(String(answer));
            nativelyFilled.add(matchingField.id);
          } else if (acroField instanceof PDFOptionList) {
            acroField.select(String(answer));
            nativelyFilled.add(matchingField.id);
          }
        } catch {
          // e.g. the answer exceeds the field's maxLength, or a radio /
          // dropdown answer is not one of its options. The field is left
          // unfilled natively; text fields fall back to the visual overlay
          // below. The render as a whole must not fail over one field.
        }
      }
    } catch {
      // PDF has no AcroForm — visual overlay only
    }

    // Regenerate appearances with the Unicode font so values are VISIBLE.
    // If appearance generation cannot render some value (e.g. a glyph the
    // font does not have), the stored /V is still exact: set
    // NeedAppearances and let the viewer regenerate appearances instead.
    // Silently altering the string to fit the font is never an option.
    if (nativelyFilled.size > 0) {
      try {
        acroForm.updateFieldAppearances(appearanceFont);
      } catch (appearanceError) {
        console.warn(
          "[pdf] Appearance generation fell back to NeedAppearances:",
          appearanceError
        );
        try {
          const acroDict = pdfDoc.context.lookup(
            pdfDoc.catalog.get(PDFName.of("AcroForm"))
          ) as any;
          acroDict?.set(PDFName.of("NeedAppearances"), PDFBool.True);
        } catch {
          // Nothing more to do — values are stored regardless.
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    
    for (const field of finalFields) {
      const answer = answers[field.id];
      if (!answer) continue;
      // Skip visual overlay for fields already filled natively via AcroForm
      if (nativelyFilled.has(field.id)) continue;
      
      const pageIndex = field.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      
      const [xPct, yPct, widthPct, heightPct] = field.bbox || [10, 50, 30, 5];
      const x = (xPct / 100) * width;
      const y = height - ((yPct / 100) * height) - ((heightPct / 100) * height);
      const fieldWidth = (widthPct / 100) * width;
      const fieldHeight = (heightPct / 100) * height;
      
      if (field.type === "checkbox") {
        const isChecked = answer === "true" || answer === "yes" || answer === "1";
        drawCheckbox(page, x, y, fieldHeight, boldFont, isChecked);
      } else if (field.type === "radio") {
        const isSelected = answer === "true" || answer === "yes" || answer === "1" || answer === field.id;
        if (isSelected) {
          drawRadioFill(page, x, y, fieldHeight);
        }
      } else if (field.type === "signature") {
        // Signatures are handled separately below
      } else {
       try {
        // Format date values
        let text = String(answer);
        if (field.type === "date") {
          text = formatDateValue(text);
        }
        
        // Calculate optimal font size (measured with the Unicode font so
        // non-Latin answers are laid out — and encoded — correctly)
        const fontSize = calculateOptimalFontSize(text, fieldWidth, fieldHeight, appearanceFont);
        
        if (field.type === "textarea" || text.length > 50) {
          // Multi-line text rendering
          const words = text.split(" ");
          let lines: string[] = [];
          let currentLine = "";
          const maxWidth = fieldWidth - TEXT_CONFIG.padding * 2;
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = appearanceFont.widthOfTextAtSize(testLine, fontSize);
            
            if (testWidth <= maxWidth) {
              currentLine = testLine;
            } else {
              if (currentLine) lines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) lines.push(currentLine);
          
          // Calculate how many lines fit (minimum 1 line to always show some text)
          const lineSpacing = fontSize * TEXT_CONFIG.lineHeight;
          const maxLines = Math.max(1, Math.floor(fieldHeight / lineSpacing));
          
          let lineY = y + fieldHeight - fontSize - TEXT_CONFIG.padding;
          for (const line of lines.slice(0, maxLines)) {
            page.drawText(line, {
              x: x + TEXT_CONFIG.padding,
              y: lineY,
              size: fontSize,
              font: appearanceFont,
              color: rgb(0, 0, 0),
            });
            lineY -= lineSpacing;
          }
        } else {
          // Single-line text - vertically centered
          page.drawText(text, {
            x: x + TEXT_CONFIG.padding,
            y: y + (fieldHeight - fontSize) / 2,
            size: fontSize,
            font: appearanceFont,
            color: rgb(0, 0, 0),
          });
        }
       } catch (overlayError) {
          console.warn(`[pdf] Overlay skipped for field ${field.id}:`, overlayError);
       }
      }
    }
    
    if (signatureData) {
      const signatureFields = finalFields.filter(f => f.type === "signature");
      
      if (signatureFields.length > 0) {
        for (const sigField of signatureFields) {
          const pageIndex = sigField.page - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;
          
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          
          const [xPct, yPct, widthPct, heightPct] = sigField.bbox || [10, 85, 40, 10];
          const x = (xPct / 100) * width;
          const y = height - ((yPct / 100) * height) - ((heightPct / 100) * height);
          const sigWidth = (widthPct / 100) * width;
          const sigHeight = (heightPct / 100) * height;
          
          try {
            const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, "");
            const signatureBytes = Buffer.from(base64Data, "base64");
            
            const pngImage = await pdfDoc.embedPng(signatureBytes);
            
            const aspectRatio = pngImage.width / pngImage.height;
            let drawWidth = sigWidth;
            let drawHeight = sigWidth / aspectRatio;
            
            if (drawHeight > sigHeight) {
              drawHeight = sigHeight;
              drawWidth = sigHeight * aspectRatio;
            }
            
            page.drawImage(pngImage, {
              x: x,
              y: y,
              width: drawWidth,
              height: drawHeight,
            });
          } catch (sigError) {
            console.error("[pdf] Error embedding signature:", sigError);
          }
        }
      } else {
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
        
        try {
          const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, "");
          const signatureBytes = Buffer.from(base64Data, "base64");
          const pngImage = await pdfDoc.embedPng(signatureBytes);
          
          const sigWidth = width * 0.25;
          const sigHeight = sigWidth / (pngImage.width / pngImage.height);
          
          lastPage.drawImage(pngImage, {
            x: width * 0.1,
            y: height * 0.05,
            width: sigWidth,
            height: Math.min(sigHeight, height * 0.1),
          });
        } catch (sigError) {
          console.error("[pdf] Error embedding signature on last page:", sigError);
        }
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    
    // Run deterministic verification (no AI - uses PDF structure analysis)
    console.log(`[pdf] Running verification checks...`);
    const verification = await verifyFilledPdf(
      originalPdfBuffer,
      pdfBuffer,
      answers,
      finalFields
    );
    
    console.log(`[pdf] Verification: score=${verification.score}, success=${verification.success}`);
    if (verification.errors.length > 0) {
      console.warn(`[pdf] Verification errors:`, verification.errors);
    }
    if (verification.warnings.length > 0) {
      console.log(`[pdf] Verification warnings:`, verification.warnings);
    }
    
    // Log individual checks
    for (const check of verification.checks) {
      const icon = check.passed ? "✓" : "✗";
      console.log(`[pdf]   ${icon} ${check.name}: ${check.message}`);
    }
    
    const uploadResult = await uploadPdf(pdfBuffer, fileName, formId, "generated");
    
    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error || "Failed to save generated PDF",
        verification,
      };
    }
    
    console.log(`[pdf] Successfully rendered PDF with ${Object.keys(answers).length} answers`);
    
    return {
      success: true,
      pdfBuffer,
      generatedPath: uploadResult.path,
      verification,
    };
  } catch (error) {
    console.error("[pdf] Render error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "PDF rendering failed",
    };
  }
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch {
    return 1;
  }
}
