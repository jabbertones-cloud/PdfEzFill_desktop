import type { Express, Request, Response } from "express";
import type { Server } from "http";
import multer from "multer";
// Desktop mode: use local auth bypass when DESKTOP_MODE=true
import { generateApiToken } from "./desktopAuth.js";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, optionalAuth } from "./desktopAuth.js";
import { stripeService } from "./stripeService";
import { getStripePublishableKey } from "./stripeClient";
import { formFieldSchema, fieldOverrideSchema, type FormField, type FieldOverride, planConfigs, type PlanType } from "@shared/schema";
import { z } from "zod";
import { extractFieldsFromPdf, getQualityLevel } from "./ocrService";
import { trackFormProcessing, trackOcrQuality, getMetricsSummary, getDailyMetrics } from "./metricsService";
import { renderCompletedPdf, getPdfPageCount } from "./pdfRenderer";
import { recordSigningEvent, getAuditTrail, buildEvidenceSummary } from "./esignService";
import { uploadPdf, downloadPdf, downloadPageImage } from "./objectStorageService.js";
import { BLOG_POSTS } from "./blogService";
import { downloadBlogImages } from "./imageManager";
// Desktop mode: use no-op email stubs (no email infrastructure in desktop app)
import {
  handleWebhookEvent,
  triggerEmailByEvent,
  sendEmailDirect,
  getEmailStats,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createSequence,
  addSequenceStep,
  getSequenceWithSteps,
  enrollUserInSequence,
  processEmailQueue,
  isEmailAutomationEnabled,
  startQueueProcessor,
} from "./emailAutomation-desktop.js";

// Unified APP_URL for email links
const APP_URL = process.env.APP_URL 
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Helper to get user ID from request
function getUserId(req: Request): string | null {
  const user = req.user as any;
  return user?.claims?.sub || null;
}

// Helper to get quality metadata from OCR confidence
async function getQualityMetadata(ocrConfidence: number | null | undefined, fieldCount: number): Promise<{
  qualityLevel: string | null;
  qualityMessage: string | null;
}> {
  if (ocrConfidence === null || ocrConfidence === undefined) {
    return { qualityLevel: null, qualityMessage: null };
  }
  const { getQualityLevel, getQualityMessage } = await import("./ocrService");
  const qualityLevel = getQualityLevel(ocrConfidence);
  const qualityMessage = getQualityMessage(qualityLevel, fieldCount);
  return { qualityLevel, qualityMessage };
}

// Helper to build enriched form response with quality metadata
async function buildFormResponse(form: any): Promise<any> {
  const { qualityLevel, qualityMessage } = await getQualityMetadata(
    form.ocrConfidence,
    form.fieldSchema?.length || 0
  );
  return {
    ...form,
    qualityLevel,
    qualityMessage,
  };
}

// Check if user is admin
async function isAdmin(req: Request): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) return false;
  const user = await storage.getUser(userId);
  return user?.isAdmin === true;
}

// Admin middleware
async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!(await isAdmin(req))) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Generate form fields from OCR is now handled by ocrService.ts

// Merge field overrides with original schema
function mergeFieldOverrides(originalFields: FormField[], overrides: FieldOverride[]): FormField[] {
  const fieldMap = new Map(originalFields.map((f) => [f.id, f]));

  for (const override of overrides) {
    if (override.action === "delete") {
      fieldMap.delete(override.fieldId);
    } else if (override.action === "add" && override.modifiedField) {
      fieldMap.set(override.modifiedField.id, override.modifiedField);
    } else if (override.action === "edit" && override.modifiedField) {
      fieldMap.set(override.fieldId, override.modifiedField);
    }
  }

  return Array.from(fieldMap.values()).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ============ AUTHROUTES ============

  // JWT bridge: POST /api/auth/login → issues a short-lived JWT for API clients.
  // Delegates credential verification to BetterAuth and wraps the result with a JWT.
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
      }
      const internalUrl = `${process.env.APP_URL || "http://localhost:5000"}/api/auth/sign-in/email`;
      const response = await fetch(internalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const data = await response.json() as any;
      const userId = data?.user?.id || data?.session?.userId || email;
      const token = await generateApiToken(userId, email);
      res.json({ token, expiresIn: "24h", user: data?.user });
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ============ STRIPE CONFIG ============
  app.get("/api/stripe/config", async (req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Error fetching Stripe config:", error);
      res.status(500).json({ message: "Failed to fetch Stripe config" });
    }
  });

  // ============ CONTACT FORM ============
  app.post("/api/contact", async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message } = req.body;

      if (!email || !message) {
        return res.status(400).json({ message: "Email and message are required" });
      }

      // Send notification email to admin
      if (isEmailAutomationEnabled()) {
        await sendEmailDirect({
          to: "admin@autofilllpdf.com",
          subject: `[Contact Form] ${subject || 'New message'} from ${name || email}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>From:</strong> ${name || 'Not provided'} (${email})</p>
            <p><strong>Subject:</strong> ${subject || 'Not provided'}</p>
            <hr>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr>
            <p style="font-size: 12px; color: #666;">
              Sent from AutoFillPDF contact form at ${new Date().toISOString()}
            </p>
          `,
        });
      } else {
        console.log(`[contact] Email disabled - would send to admin:`, { name, email, subject, message });
      }

      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      console.error("Error processing contact form:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ============ PROFILE ROUTES (Multi-profile support) ============
  app.get("/api/profiles", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const profiles = await storage.getProfilesByUserId(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      res.status(500).json({ message: "Failed to fetch profiles" });
    }
  });

  app.get("/api/profiles/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const profile = await storage.getProfile(req.params.id);
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/profiles", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);

      // Check profile limits based on plan
      const existingProfiles = await storage.getProfilesByUserId(userId);
      const maxProfiles = user?.planType === "pro_plus" || user?.planType === "team" ? 5 : 1;

      if (existingProfiles.length >= maxProfiles) {
        return res.status(400).json({ 
          message: `Your plan allows up to ${maxProfiles} profile(s). Upgrade to add more.` 
        });
      }

      const profile = await storage.createProfile({
        userId,
        ...req.body,
      });
      res.json(profile);
    } catch (error) {
      console.error("Error creating profile:", error);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.put("/api/profiles/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const existing = await storage.getProfile(req.params.id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const profile = await storage.updateProfile(req.params.id, req.body);
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.delete("/api/profiles/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const existing = await storage.getProfile(req.params.id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Don't allow deleting the only profile
      const profiles = await storage.getProfilesByUserId(userId);
      if (profiles.length <= 1) {
        return res.status(400).json({ message: "Cannot delete your only profile" });
      }

      await storage.deleteProfile(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting profile:", error);
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  app.post("/api/profiles/:id/default", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const existing = await storage.getProfile(req.params.id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Profile not found" });
      }

      await storage.setDefaultProfile(userId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default profile:", error);
      res.status(500).json({ message: "Failed to set default profile" });
    }
  });

  // ============ AUTOFILL ROUTES (2025 Smart Mapping) ============
  app.post("/api/autofill/suggestions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { formId, profileId } = req.body;

      if (!formId) {
        return res.status(400).json({ message: "Form ID is required" });
      }

      // Get form
      const form = await storage.getForm(formId);
      if (!form || (form.userId && form.userId !== userId)) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Get profile (use provided or default)
      let profile;
      if (profileId) {
        profile = await storage.getProfile(profileId);
        if (!profile || profile.userId !== userId) {
          return res.status(404).json({ message: "Profile not found" });
        }
      } else {
        const profiles = await storage.getProfilesByUserId(userId);
        profile = profiles.find(p => p.isDefault) || profiles[0];
      }

      if (!profile) {
        return res.status(400).json({ message: "No profile available for autofill" });
      }

      // Generate autofill suggestions using effective fields (merged with overrides)
      const { generateAutofillSuggestions, getAutofillCoverage } = await import("./autofillService");
      const baseFields = form.fieldSchema || [];
      const effectiveFields = form.fieldOverrides && form.fieldOverrides.length > 0
        ? mergeFieldOverrides(baseFields, form.fieldOverrides)
        : baseFields;
      const suggestions = generateAutofillSuggestions(effectiveFields, profile);
      const coverage = getAutofillCoverage(effectiveFields, suggestions);

      res.json({
        suggestions,
        coverage,
        profileId: profile.id,
        profileLabel: profile.label,
      });
    } catch (error) {
      console.error("Error generating autofill suggestions:", error);
      res.status(500).json({ message: "Failed to generate autofill suggestions" });
    }
  });

  app.post("/api/autofill/apply", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { formId, profileId, overwriteExisting = false } = req.body;

      if (!formId) {
        return res.status(400).json({ message: "Form ID is required" });
      }

      // Get form
      const form = await storage.getForm(formId);
      if (!form || (form.userId && form.userId !== userId)) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Get profile
      let profile;
      if (profileId) {
        profile = await storage.getProfile(profileId);
        if (!profile || profile.userId !== userId) {
          return res.status(404).json({ message: "Profile not found" });
        }
      } else {
        const profiles = await storage.getProfilesByUserId(userId);
        profile = profiles.find(p => p.isDefault) || profiles[0];
      }

      if (!profile) {
        return res.status(400).json({ message: "No profile available for autofill" });
      }

      // Generate and apply autofill using effective fields (merged with overrides)
      const { generateAutofillSuggestions, applyAutofill, getAutofillCoverage } = await import("./autofillService");
      const baseFields = form.fieldSchema || [];
      const effectiveFields = form.fieldOverrides && form.fieldOverrides.length > 0
        ? mergeFieldOverrides(baseFields, form.fieldOverrides)
        : baseFields;
      const suggestions = generateAutofillSuggestions(effectiveFields, profile);
      const currentAnswers = form.answers || {};
      const newAnswers = applyAutofill(currentAnswers, suggestions, overwriteExisting);
      const coverage = getAutofillCoverage(effectiveFields, suggestions);

      // Update form with autofilled answers
      await storage.updateForm(formId, {
        answers: newAnswers,
        profileId: profile.id,
      });

      res.json({
        success: true,
        filledFields: suggestions.length,
        coverage,
        answers: newAnswers,
      });
    } catch (error) {
      console.error("Error applying autofill:", error);
      res.status(500).json({ message: "Failed to apply autofill" });
    }
  });

  // ============ FORM ROUTES ============
  app.post("/api/forms/upload", optionalAuth, upload.single("pdf"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        console.log(`[upload] No file in request`);
        return res.status(400).json({ message: "No PDF file uploaded" });
      }

      const userId = getUserId(req);
      const user = userId ? await storage.getUser(userId) : null;
      const formId = randomUUID();
      
      console.log(`[upload] === Starting upload for ${req.file.originalname} ===`);
      console.log(`[upload] FormId: ${formId}, User: ${userId || 'guest'}, FileSize: ${req.file.size} bytes`);

      // Calculate expiration based on user type
      const now = new Date();
      const expiresAt = new Date(now);
      if (user?.planType && user.planType !== "none") {
        expiresAt.setDate(expiresAt.getDate() + 180); // 180 days for Pro
      } else {
        expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours for guests
      }

      // Upload PDF to object storage FIRST
      console.log(`[upload] Step 1: Uploading PDF to object storage...`);
      const uploadResult = await uploadPdf(
        req.file.buffer,
        req.file.originalname,
        formId,
        "original"
      );

      if (!uploadResult.success) {
        console.error(`[upload] FAILED to upload PDF to storage:`, uploadResult.error);
        return res.status(500).json({ message: "Failed to store PDF" });
      }
      console.log(`[upload] Step 1 COMPLETE: PDF saved to ${uploadResult.path}`);

      // Get page count from PDF
      console.log(`[upload] Step 2: Getting page count...`);
      const pageCount = await getPdfPageCount(req.file.buffer);
      console.log(`[upload] Step 2 COMPLETE: ${pageCount} pages detected`);

      // Create form record with processing status
      console.log(`[upload] Step 3: Creating form record in database...`);
      const form = await storage.createForm({
        userId: userId || undefined,
        originalPdfPath: uploadResult.path!,
        fileName: req.file.originalname,
        pageCount,
        fieldSchema: [],
        status: "processing",
        ocrConfidence: 0,
        expiresAt,
        // Desktop mode: mark as paid immediately — no per-form payment flow
        ...(process.env.DESKTOP_MODE === 'true' ? { isPaid: true, paymentType: 'desktop_license' } : {}),
      });

      // Update with the specific formId we generated (so storage paths match)
      await storage.updateForm(form.id, { id: formId } as any);
      console.log(`[upload] Step 3 COMPLETE: Form record created with ID ${formId}`);

      // Send immediate response while OCR processes
      console.log(`[upload] Step 4: Sending response to client, starting OCR in background...`);
      res.json({
        formId: formId,
        status: "processing",
        pageCount,
        message: "PDF uploaded. Processing with OCR...",
      });

      // Process OCR in background
      (async () => {
        const ocrStartTime = Date.now();
        try {
          console.log(`[upload] Starting OCR processing for form ${formId}`);
          const ocrResult = await extractFieldsFromPdf(req.file!.buffer, formId);
          const processingTimeMs = Date.now() - ocrStartTime;

          if (ocrResult.success) {
            await storage.updateForm(formId, {
              fieldSchema: ocrResult.fields,
              ocrConfidence: ocrResult.averageConfidence,
              status: "ready",
            });
            console.log(`[upload] OCR complete for form ${formId}: ${ocrResult.fields.length} fields`);

            // Track metrics for successful OCR
            const qualityLevel = getQualityLevel(ocrResult.averageConfidence);
            await trackFormProcessing(formId, ocrResult.averageConfidence, processingTimeMs, "success");
            await trackOcrQuality(formId, qualityLevel, ocrResult.averageConfidence);
          } else {
            await storage.updateForm(formId, {
              status: "error",
              ocrConfidence: 0,
            });
            console.error(`[upload] OCR failed for form ${formId}:`, ocrResult.error);

            // Track metrics for failed OCR
            await trackFormProcessing(formId, null, processingTimeMs, "failed");

            // Send error notification if user has email (using sendEmailDirect as there's no trigger type for processing failures)
            if (user?.email) {
              const errorMessage = ocrResult.error || "Unknown error occurred during processing";
              const uploadUrl = `${APP_URL}/upload`;
              await sendEmailDirect({
                to: user.email,
                toName: user.firstName || "User",
                subject: `Issue processing your form "${req.file!.originalname}"`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #ef4444;">Processing Issue</h1>
                    <p>Hi ${user.firstName || "there"},</p>
                    <p>We encountered an issue while processing your form <strong>${req.file!.originalname}</strong>.</p>
                    <p style="color: #666; background: #f5f5f5; padding: 12px; border-radius: 4px;">${errorMessage}</p>
                    <p>Please try uploading the form again. If the issue persists, contact our support team.</p>
                    <p style="margin: 24px 0;">
                      <a href="${uploadUrl}" 
                         style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        Try Again
                      </a>
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                    <p style="color: #999; font-size: 12px;">Thank you for using AutoFillPDF!</p>
                  </div>
                `,
                text: `Issue processing "${req.file!.originalname}". Please try uploading again: ${uploadUrl}`,
                userId: user.id,
              });
            }
          }
        } catch (error) {
          console.error(`[upload] Background OCR error for form ${formId}:`, error);
          await storage.updateForm(formId, { status: "error" });
        }
      })();

    } catch (error) {
      console.error("Error uploading PDF:", error);
      res.status(500).json({ message: "Failed to upload PDF" });
    }
  });

  app.get("/api/forms", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const forms = await storage.getFormsByUserId(userId);
      const enrichedForms = await Promise.all(forms.map(buildFormResponse));
      res.json(enrichedForms);
    } catch (error) {
      console.error("Error fetching forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.get("/api/forms/:formId", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const form = await storage.getForm(formId);

      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      const userId = getUserId(req);
      if (form.userId && form.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Merge field overrides if any
      let effectiveFields = form.fieldSchema || [];
      if (form.fieldOverrides && form.fieldOverrides.length > 0) {
        effectiveFields = mergeFieldOverrides(form.fieldSchema || [], form.fieldOverrides);
      }

      // Include quality level for UI feedback (only when OCR has completed)
      const { qualityLevel, qualityMessage } = await getQualityMetadata(
        form.ocrConfidence,
        form.fieldSchema?.length || 0
      );

      res.json({
        ...form,
        effectiveFields,
        qualityLevel,
        qualityMessage,
      });
    } catch (error) {
      console.error("Error fetching form:", error);
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  // Get PDF page image for visual field editor
  app.get("/api/forms/:formId/page/:pageNum", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId, pageNum } = req.params;
      const pageNumber = parseInt(pageNum, 10);

      if (isNaN(pageNumber) || pageNumber < 1) {
        return res.status(400).json({ message: "Invalid page number" });
      }

      const form = await storage.getForm(formId);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      const userId = getUserId(req);
      if (form.userId && form.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (pageNumber > (form.pageCount || 1)) {
        return res.status(404).json({ message: "Page not found" });
      }

      // Page images are stored at forms/{formId}/page_{pageNum}.png.b64 (base64 encoded)
      const imagePath = `forms/${formId}/page_${pageNumber}.png.b64`;
      const imageBuffer = await downloadPageImage(imagePath);

      if (!imageBuffer) {
        return res.status(404).json({ message: "Page image not found" });
      }

      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error fetching page image:", error);
      res.status(500).json({ message: "Failed to fetch page image" });
    }
  });

  // Poll form status (for OCR processing)
  app.get("/api/forms/:formId/status", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const form = await storage.getForm(formId);

      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Include quality level for UI feedback (only when OCR has completed)
      const { qualityLevel, qualityMessage } = await getQualityMetadata(
        form.ocrConfidence,
        form.fieldSchema?.length || 0
      );

      res.json({
        status: form.status,
        fieldCount: form.fieldSchema?.length || 0,
        ocrConfidence: form.ocrConfidence,
        pageCount: form.pageCount,
        qualityLevel,
        qualityMessage,
      });
    } catch (error) {
      console.error("Error fetching form status:", error);
      res.status(500).json({ message: "Failed to fetch form status" });
    }
  });

  // Generate PDF after payment success
  app.post("/api/forms/:formId/generate", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const form = await storage.getForm(formId);

      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Desktop mode: skip payment gate — license is validated at the auth layer
      const isDesktopMode = process.env.DESKTOP_MODE === 'true';
      if (!isDesktopMode && !form.isPaid) {
        return res.status(403).json({ message: "Payment required" });
      }

      if (form.status === "completed" && form.generatedPdfPath) {
        return res.json({ success: true, status: "completed" });
      }

      // Generate the PDF
      const renderResult = await renderCompletedPdf({
        answers: form.answers || {},
        signatureData: form.signatureData,
        fields: form.fieldSchema || [],
        fieldOverrides: form.fieldOverrides || [],
        originalPdfPath: form.originalPdfPath!,
        formId,
        fileName: form.fileName,
      });

      if (!renderResult.success) {
        await storage.updateForm(formId, { status: "error" });
        return res.status(500).json({ message: renderResult.error || "Failed to generate PDF" });
      }

      await storage.updateForm(formId, {
        status: "completed",
        completedAt: new Date(),
        generatedPdfPath: renderResult.generatedPath,
      });

      // Send email notification via unified email automation system
      const userId = getUserId(req);
      let recipientEmail: string | null = null;
      let recipientName = "User";

      if (userId) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          recipientEmail = user.email;
          recipientName = user.firstName || "User";
        }
      } else if (form.guestEmail) {
        // For guest forms, use the guestEmail
        recipientEmail = form.guestEmail;
        recipientName = "there";
      }

      if (recipientEmail) {
        await triggerEmailByEvent("form_completed", recipientEmail, {
          user_name: recipientName,
          form_name: form.fileName || form.originalFileName || "Your form",
          form_id: formId,
          download_url: `${APP_URL}/download/${formId}`,
        });
      }

      res.json({ success: true, status: "completed" });
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Manual field editing
  app.put("/api/forms/:formId/fields", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const { override } = req.body;

      const form = await storage.getForm(formId);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      const userId = getUserId(req);
      if (form.userId && form.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Add the new override
      const currentOverrides = form.fieldOverrides || [];
      const newOverride: FieldOverride = {
        ...override,
        timestamp: new Date().toISOString(),
      };

      const updatedForm = await storage.updateForm(formId, {
        fieldOverrides: [...currentOverrides, newOverride],
      });

      const response = await buildFormResponse(updatedForm);
      res.json(response);
    } catch (error) {
      console.error("Error updating form fields:", error);
      res.status(500).json({ message: "Failed to update form fields" });
    }
  });

  app.put("/api/forms/:formId/answers", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const { answers, signatureData, profileId, fieldOverrides } = req.body;

      const form = await storage.getForm(formId);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      const userId = getUserId(req);
      if (form.userId && form.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateData: Partial<typeof form> = {
        answers,
        signatureData,
      };

      if (profileId !== undefined) {
        updateData.profileId = profileId;
      }

      if (fieldOverrides !== undefined) {
        // Validate fieldOverrides using Zod schema
        const fieldOverridesSchema = z.array(fieldOverrideSchema);
        const parseResult = fieldOverridesSchema.safeParse(fieldOverrides);

        if (!parseResult.success) {
          console.error("Invalid fieldOverrides format:", parseResult.error);
          return res.status(400).json({ 
            message: "Invalid field overrides format",
            errors: parseResult.error.issues 
          });
        }

        updateData.fieldOverrides = parseResult.data;
      }

      const updatedForm = await storage.updateForm(formId, updateData);
      const response = await buildFormResponse(updatedForm);

      res.json(response);
    } catch (error) {
      console.error("Error updating form answers:", error);
      res.status(500).json({ message: "Failed to update form answers" });
    }
  });

  // ============ PAYMENT ROUTES ============
  app.post("/api/payments/checkout", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId, type, email, tier } = req.body;
      const userId = getUserId(req);
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const form = await storage.getForm(formId);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // ADMIN BYPASS: Admin users get unlimited free access for testing
      if (userId) {
        const adminUser = await storage.getUser(userId);
        if (adminUser?.isAdmin) {
          console.log(`[Admin Bypass] Processing form ${formId} for admin user ${userId}`);

          // Generate PDF directly without payment
          const renderResult = await renderCompletedPdf({
            answers: form.answers || {},
            signatureData: form.signatureData,
            fields: form.fieldSchema || [],
            fieldOverrides: form.fieldOverrides || [],
            originalPdfPath: form.originalPdfPath!,
            formId,
            fileName: form.fileName,
          });

          if (renderResult.success) {
            await storage.updateForm(formId, {
              status: "completed",
              isPaid: true,
              paymentType: "admin_bypass",
              completedAt: new Date(),
              generatedPdfPath: renderResult.generatedPath,
            });

            console.log(`[Admin Bypass] Form ${formId} completed successfully`);
            return res.json({ success: true, formId, adminBypass: true });
          } else {
            await storage.updateForm(formId, { status: "error" });
            return res.status(500).json({ 
              success: false, 
              error: renderResult.error || "PDF generation failed" 
            });
          }
        }
      }

      // For Pro users with credits, process immediately
      if (userId && type !== "subscription") {
        const user = await storage.getUser(userId);
        if (user?.planType && user.planType !== "none") {
          const usage = await storage.getUsageSummary(userId);
          if (usage && usage.formsRemaining > 0) {
            // Use a credit ONLY after successful generation (not before)
            // Generate the actual PDF first
            const renderResult = await renderCompletedPdf({
              answers: form.answers || {},
              signatureData: form.signatureData,
              fields: form.fieldSchema || [],
              fieldOverrides: form.fieldOverrides || [],
              originalPdfPath: form.originalPdfPath!,
              formId,
              fileName: form.fileName,
            });

            if (renderResult.success) {
              // Only consume credit on successful generation
              await storage.incrementFormsUsed(userId);

              await storage.updateForm(formId, {
                status: "completed",
                isPaid: true,
                paymentType: "subscription",
                completedAt: new Date(),
                generatedPdfPath: renderResult.generatedPath,
              });

              // Send success email notification
              if (user.email) {
                await triggerEmailByEvent("form_completed", user.email, {
                  user_name: user.firstName || "User",
                  form_name: form.fileName || form.originalFileName || "Your form",
                  form_id: formId,
                  download_url: `${APP_URL}/download/${formId}`,
                });
              }

              return res.json({ success: true, formId });
            } else {
              // Generation failed - DO NOT consume credit, mark as error, notify user
              await storage.updateForm(formId, {
                status: "error",
                // Keep isPaid: false so they can retry
              });

              // Send error notification
              if (user.email) {
                await sendEmailDirect({
                  to: user.email,
                  toName: user.firstName || "User",
                  subject: `Issue generating your form "${form.fileName || form.originalFileName || "Your form"}"`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h1 style="color: #ef4444;">Generation Issue</h1>
                      <p>Hi ${user.firstName || "there"},</p>
                      <p>We encountered an issue generating your completed PDF.</p>
                      <p style="color: #666; background: #f5f5f5; padding: 12px; border-radius: 4px;">${renderResult.error || "Unknown error"}</p>
                      <p><strong>Don't worry - your credit has NOT been used.</strong> Please try again or contact us for assistance.</p>
                      <p style="margin: 24px 0;">
                        <a href="${APP_URL}/fill/${formId}" 
                           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                          Try Again
                        </a>
                      </p>
                      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                      <p style="color: #999; font-size: 12px;">Contact us at admin@autofilllpdf.com for assistance.</p>
                    </div>
                  `,
                  text: `Issue generating your form. Your credit was NOT used. Please try again or contact admin@autofilllpdf.com`,
                  userId: user.id,
                });
              }

              return res.json({ success: false, formId, error: renderResult.error });
            }
          }
        }
      }

      // Create Stripe checkout session
      let session;
      const successUrl = `${baseUrl}/download/${formId}?success=true`;
      const cancelUrl = `${baseUrl}/fill/${formId}?canceled=true`;

      if (type === "subscription") {
        // Create subscription checkout
        let customerId = null;
        if (userId) {
          const user = await storage.getUser(userId);
          customerId = user?.stripeCustomerId;
          if (!customerId) {
            const customer = await stripeService.createCustomer(user?.email || email, userId);
            await storage.updateUser(userId, { stripeCustomerId: customer.id });
            customerId = customer.id;
          }
        }

        // Default to 'pro' tier if not specified
        const subscriptionTier = tier || 'pro';
        session = await stripeService.createSubscriptionCheckoutSession(
          customerId!,
          subscriptionTier,
          successUrl,
          cancelUrl
        );
      } else if (type === "overage" || type === "regeneration") {
        // Extra form or regeneration ($2)
        const user = userId ? await storage.getUser(userId) : null;
        if (!user?.stripeCustomerId) {
          return res.status(400).json({ message: "No payment method on file. Please contact support." });
        }
        session = await stripeService.createExtraFormCheckoutSession(
          user.stripeCustomerId,
          formId,
          successUrl,
          cancelUrl
        );
      } else if (type === "trial") {
        // Trial form ($1)
        session = await stripeService.createTrialCheckoutSession(
          email,
          formId,
          successUrl,
          cancelUrl
        );
      } else {
        // Guest one-time ($5)
        session = await stripeService.createOneTimeCheckoutSession(
          email,
          formId,
          successUrl,
          cancelUrl
        );
      }

      // Calculate payment amount based on type and tier
      let paymentAmount = 500; // Default guest
      if (type === "subscription") {
        if (tier === "starter") paymentAmount = 700;
        else if (tier === "enterprise") paymentAmount = 4900;
        else paymentAmount = 1500; // pro
      } else if (type === "overage" || type === "regeneration") {
        paymentAmount = 200;
      } else if (type === "trial") {
        paymentAmount = 100;
      }

      // Record pending payment
      await storage.createPayment({
        userId: userId || undefined,
        formId,
        stripeSessionId: session.id,
        amount: paymentAmount,
        type: type || "guest",
        status: "pending",
      });

      // Save guest email immediately when checkout is initiated (not just on webhook completion)
      // This ensures we have the email even if webhook processing fails
      const formUpdate: Record<string, any> = {
        stripeSessionId: session.id,
      };
      if (email && !userId) {
        formUpdate.guestEmail = email;
      }
      await storage.updateForm(formId, formUpdate);

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout:", error);
      res.status(500).json({ message: "Failed to create checkout" });
    }
  });

  // Billing portal for subscription management
  app.post("/api/payments/portal", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const returnUrl = `${req.protocol}://${req.get("host")}/dashboard`;
      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        returnUrl
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // ============ DOWNLOAD ROUTES ============
  app.get("/api/forms/:formId/download", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const form = await storage.getForm(formId);

      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Desktop mode: skip payment gate — license validated at auth layer
      const isDesktopDl = process.env.DESKTOP_MODE === 'true';
      if (!isDesktopDl && (!form.isPaid || form.status !== "completed")) {
        return res.status(403).json({ message: "Form not paid or not ready" });
      }
      // In desktop mode, still require completed status (PDF must be generated first)
      if (isDesktopDl && form.status !== "completed") {
        return res.status(403).json({ message: "Form not ready — generate the PDF first" });
      }

      const userId = getUserId(req);
      if (form.userId && form.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if generated PDF exists and download it
      if (form.generatedPdfPath) {
        const pdfBuffer = await downloadPdf(form.generatedPdfPath);
        if (pdfBuffer) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="completed_${form.fileName}"`);
          return res.send(pdfBuffer);
        }
      }

      // If no generated PDF, generate it now
      if (!form.originalPdfPath) {
        return res.status(500).json({ message: "Original PDF not found" });
      }

      const renderResult = await renderCompletedPdf({
        answers: form.answers || {},
        signatureData: form.signatureData,
        fields: form.fieldSchema || [],
        fieldOverrides: form.fieldOverrides || [],
        originalPdfPath: form.originalPdfPath,
        formId: form.id,
        fileName: form.fileName,
      });

      if (!renderResult.success || !renderResult.pdfBuffer) {
        return res.status(500).json({ message: renderResult.error || "Failed to generate PDF" });
      }

      // Record e-signature audit event if signature data is present
      if (form.signatureData) {
        try {
          const originalBytes = await (async () => {
            const { downloadPdf } = await import("./objectStorageService");
            const buf = await downloadPdf(form.originalPdfPath!);
            return buf ? Buffer.from(buf) : Buffer.alloc(0);
          })();
          const userId = getUserId(req);
          const user = userId ? await storage.getUser(userId) : null;
          await recordSigningEvent({
            formId: form.id,
            userId: userId ?? null,
            guestEmail: user?.email ?? null,
            signerName: user?.firstName ?? null,
            signerIp: req.ip ?? req.socket.remoteAddress ?? "unknown",
            userAgent: req.headers["user-agent"] ?? "",
            signatureMethod: "draw",
            originalPdfBytes: originalBytes,
            signedPdfBytes: renderResult.pdfBuffer,
          });
        } catch (auditErr) {
          // Audit failure must NOT block PDF download
          console.error("[esign] Failed to record audit log:", auditErr);
        }
      }

      // Update form with generated path
      if (renderResult.generatedPath) {
        await storage.updateForm(formId, {
          generatedPdfPath: renderResult.generatedPath,
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="completed_${form.fileName}"`);
      res.send(renderResult.pdfBuffer);
    } catch (error) {
      console.error("Error downloading form:", error);
      res.status(500).json({ message: "Failed to download form" });
    }
  });

  // ============ E-SIGNATURE AUDIT ROUTES ============
  app.get("/api/forms/:formId/audit-trail", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const logs = await getAuditTrail(formId);
      res.json({ auditLogs: logs });
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  app.get("/api/forms/:formId/audit-trail/summary", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { formId } = req.params;
      const logs = await getAuditTrail(formId);
      const summaries = logs.map((l) => buildEvidenceSummary(l));
      res.setHeader("Content-Type", "text/plain");
      res.send(summaries.join("\n\n"));
    } catch (error) {
      console.error("Error fetching audit summary:", error);
      res.status(500).json({ message: "Failed to fetch audit summary" });
    }
  });

  // ============ USAGE ROUTES ============
  app.get("/api/usage", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);

      if (!user || user.planType === "none") {
        return res.json(null);
      }

      let usage = await storage.getUsageSummary(userId);

      if (!usage) {
        // Create initial usage tracking for new Pro users
        const planConfig = planConfigs[user.planType as PlanType] || planConfigs.pro;
        await storage.createOrResetUsagePeriod(userId, planConfig.formsIncluded);
        usage = await storage.getUsageSummary(userId);
      }

      res.json(usage);
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // ============ REGENERATION ROUTES ============
  app.get("/api/forms/regenerable", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const forms = await storage.getRegenerableForms(userId);
      const enrichedForms = await Promise.all(forms.map(buildFormResponse));
      res.json(enrichedForms);
    } catch (error) {
      console.error("Error fetching regenerable forms:", error);
      res.status(500).json({ message: "Failed to fetch regenerable forms" });
    }
  });

  app.post("/api/forms/:formId/regenerate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { formId } = req.params;

      const originalForm = await storage.getForm(formId);
      if (!originalForm || originalForm.userId !== userId) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (originalForm.status !== "expired") {
        return res.status(400).json({ message: "Form is not expired" });
      }

      // Create regeneration form
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 180);

      const newForm = await storage.createForm({
        userId,
        originalPdfPath: originalForm.originalPdfPath,
        fileName: originalForm.fileName,
        pageCount: originalForm.pageCount,
        fieldSchema: originalForm.fieldSchema,
        fieldOverrides: originalForm.fieldOverrides,
        answers: originalForm.answers,
        signatureData: originalForm.signatureData,
        status: "ready",
        ocrConfidence: originalForm.ocrConfidence,
        parentFormId: formId,
        isRegeneration: true,
        expiresAt,
      });

      res.json({
        formId: newForm.id,
        message: "Form prepared for regeneration. Payment required.",
        requiresPayment: true,
        paymentType: "regeneration",
        amount: 200, // $2
      });
    } catch (error) {
      console.error("Error regenerating form:", error);
      res.status(500).json({ message: "Failed to regenerate form" });
    }
  });

  // ============ BLOG ROUTES ============
  app.get("/api/blog/posts", async (_req: Request, res: Response) => {
    try {
      const posts = BLOG_POSTS.filter(post => post.isPublished).map(post => ({
        ...post,
        id: post.slug,
        publishedAt: new Date(),
        updatedAt: new Date()
      }));
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.get("/api/blog/posts/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const post = BLOG_POSTS.find(p => p.slug === slug && p.isPublished);

      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }

      res.json({
        ...post,
        id: post.slug,
        publishedAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  // ============ IMAGE SERVING ============
  app.get("/api/images/:path(*)", async (req: Request, res: Response) => {
    try {
      const imagePath = req.params.path;
      const imageBuffer = await downloadPageImage(imagePath);

      if (!imageBuffer) {
        return res.status(404).json({ message: "Image not found" });
      }

      // Set appropriate headers for image serving
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving image:", error);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  // ============ ADMIN ROUTES ============
  app.post("/api/admin/login", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      const userId = getUserId(req);
      const clientIp = req.ip || req.connection.remoteAddress || "unknown";
      const timestamp = new Date().toISOString();

      if (!userId) {
        console.log(`[Admin Audit] ${timestamp} - Failed login attempt: No user ID | IP: ${clientIp}`);
        return res.status(401).json({ message: "Must be logged in" });
      }

      const user = await storage.getUser(userId);
      const userEmail = user?.email || "unknown";

      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        console.log(`[Admin Audit] ${timestamp} - System error: ADMIN_PASSWORD not configured | User: ${userEmail} | IP: ${clientIp}`);
        return res.status(500).json({ message: "Admin password not configured" });
      }

      if (password !== adminPassword) {
        console.log(`[Admin Audit] ${timestamp} - FAILED admin login attempt | User: ${userEmail} (${userId}) | IP: ${clientIp}`);
        return res.status(403).json({ message: "Invalid admin password" });
      }

      // Grant admin access with audit trail
      await storage.updateUser(userId, { isAdmin: true });
      console.log(`[Admin Audit] ${timestamp} - SUCCESS: Admin access granted | User: ${userEmail} (${userId}) | IP: ${clientIp}`);

      res.json({ 
        success: true, 
        message: "Admin access granted. You now have unlimited free access to all features." 
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ message: "Admin login failed" });
    }
  });

  // Check if current user is admin
  app.get("/api/admin/status", isAuthenticated, async (req: Request, res: Response) => {
    const isAdminUser = await isAdmin(req);
    res.json({ isAdmin: isAdminUser });
  });

  app.get("/api/admin/users", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/forms", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const forms = await storage.getAllForms();
      const enrichedForms = await Promise.all(forms.map(buildFormResponse));
      res.json(enrichedForms);
    } catch (error) {
      console.error("Error fetching forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.get("/api/admin/payments", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const payments = await storage.getAllPayments();
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/admin/refund/:paymentId", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const adminId = getUserId(req)!;
      const { paymentId } = req.params;
      const { reason } = req.body;

      const payment = await storage.getPaymentByStripeId(paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      // Process refund via Stripe
      if (payment.stripePaymentIntentId) {
        await stripeService.createRefund(payment.stripePaymentIntentId, reason);
      }

      // Update payment record
      await storage.updatePayment(payment.id, {
        status: "refunded",
        refundedAt: new Date(),
        refundReason: reason,
        refundedBy: adminId,
      });

      // Log admin action
      await storage.createAdminLog({
        adminId,
        action: "refund",
        targetType: "payment",
        targetId: payment.id,
        details: { reason: reason as string, amount: payment.amount } as Record<string, any>,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Get date ranges for weekly metrics
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        comprehensiveFormStats,
        revenueStats,
        userCountsByPlan,
        ocrQualityStats,
        weeklyMetrics,
        dailyMetricsData,
      ] = await Promise.all([
        storage.getComprehensiveFormStats(),
        storage.getRevenueStats(),
        storage.getUserCountsByPlan(),
        storage.getOcrQualityStats(),
        getMetricsSummary(sevenDaysAgo, now),
        getDailyMetrics(7),
      ]);

      // Calculate total users
      const totalUsers = userCountsByPlan.free + userCountsByPlan.starter + 
                         userCountsByPlan.pro + userCountsByPlan.pro_plus + 
                         userCountsByPlan.enterprise + userCountsByPlan.team;

      // Calculate daily and weekly processing volumes from metrics
      const dailyProcessingVolume = dailyMetricsData.length > 0 ? dailyMetricsData[0].totalForms : 0;
      const weeklyProcessingVolume = dailyMetricsData.reduce((sum, day) => sum + day.totalForms, 0);

      res.json({
        users: {
          total: totalUsers,
          byPlan: {
            free: userCountsByPlan.free,
            starter: userCountsByPlan.starter,
            pro: userCountsByPlan.pro,
            pro_plus: userCountsByPlan.pro_plus,
            enterprise: userCountsByPlan.enterprise,
            team: userCountsByPlan.team,
          },
        },
        forms: {
          total: comprehensiveFormStats.total,
          byStatus: {
            completed: comprehensiveFormStats.completed,
            failed: comprehensiveFormStats.failed,
            processing: comprehensiveFormStats.processing,
            expired: comprehensiveFormStats.expired,
            uploaded: comprehensiveFormStats.uploaded,
            ready: comprehensiveFormStats.ready,
          },
        },
        revenue: {
          total: revenueStats.total,
          subscriptions: revenueStats.subscriptions,
          oneTime: revenueStats.oneTime,
        },
        ocrQuality: {
          averageConfidence: Math.round(ocrQualityStats.avgConfidence * 100) / 100,
          totalProcessed: ocrQualityStats.totalProcessed,
          qualityDistribution: ocrQualityStats.qualityDistribution,
        },
        processingVolume: {
          daily: dailyProcessingVolume,
          weekly: weeklyProcessingVolume,
          successRate: weeklyMetrics.successRate,
          averageProcessingTime: Math.round(weeklyMetrics.averageProcessingTime),
        },
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/metrics", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [metricsSummary, dailyMetricsData, ocrQualityStats] = await Promise.all([
        getMetricsSummary(thirtyDaysAgo, now),
        getDailyMetrics(30),
        storage.getOcrQualityStats(),
      ]);

      res.json({
        summary: {
          processingSuccessRate: Math.round(metricsSummary.successRate * 100) / 100,
          averageOcrConfidence: Math.round(ocrQualityStats.avgConfidence * 100) / 100,
          averageProcessingTime: Math.round(metricsSummary.averageProcessingTime),
          totalFormsProcessed: metricsSummary.totalForms,
          ocrQualityDistribution: metricsSummary.ocrQualityDistribution,
        },
        dailyBreakdown: dailyMetricsData.map((day) => ({
          date: day.date,
          totalForms: day.totalForms,
          successCount: day.successCount,
          failureCount: day.failureCount,
          successRate: day.totalForms > 0 
            ? Math.round((day.successCount / day.totalForms) * 10000) / 100 
            : 0,
          averageConfidence: Math.round(day.averageConfidence * 100) / 100,
          averageProcessingTime: Math.round(day.averageProcessingTime),
          qualityDistribution: day.qualityDistribution,
        })),
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  app.get("/api/admin/logs", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const logs = await storage.getAdminLogs(100);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });

  app.post("/api/admin/download-blog-images", isAdmin, async (_req: Request, res: Response) => {
    try {
      console.log('[admin] Starting blog image download...');
      await downloadBlogImages();
      res.json({ message: "Blog images downloaded successfully" });
    } catch (error) {
      console.error("Error downloading blog images:", error);
      res.status(500).json({ message: "Failed to download blog images" });
    }
  });

  // ============ PROMO CODE MANAGEMENT ============
  
  // Create a coupon and multiple promo codes in one request
  app.post("/api/admin/promo-codes", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { codes, couponName, maxRedemptionsPerCode } = req.body;

      if (!codes || !Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ 
          message: "Please provide an array of promo codes to create" 
        });
      }

      // Create the 100% off coupon first
      const coupon = await stripeService.createFreeCoupon(
        couponName || 'Free PDF Conversion - Tester'
      );
      console.log(`[admin] Created coupon: ${coupon.id}`);

      // Create promotion codes
      const createdCodes = await stripeService.createPromotionCodes(
        coupon.id,
        codes,
        maxRedemptionsPerCode || 1
      );

      console.log(`[admin] Created ${createdCodes.length} promo codes`);

      res.json({
        success: true,
        couponId: coupon.id,
        couponName: coupon.name,
        promoCodes: createdCodes,
      });
    } catch (error: any) {
      console.error("Error creating promo codes:", error);
      res.status(500).json({ 
        message: "Failed to create promo codes",
        error: error.message 
      });
    }
  });

  // List active promo codes
  app.get("/api/admin/promo-codes", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const promoCodes = await stripeService.listPromotionCodes();
      res.json(promoCodes);
    } catch (error: any) {
      console.error("Error listing promo codes:", error);
      res.status(500).json({ 
        message: "Failed to list promo codes",
        error: error.message 
      });
    }
  });

  // Deactivate a promo code
  app.delete("/api/admin/promo-codes/:promoCodeId", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { promoCodeId } = req.params;
      await stripeService.deactivatePromotionCode(promoCodeId);
      res.json({ success: true, message: "Promo code deactivated" });
    } catch (error: any) {
      console.error("Error deactivating promo code:", error);
      res.status(500).json({ 
        message: "Failed to deactivate promo code",
        error: error.message 
      });
    }
  });

  // ============ PLAN INFO ============
  app.get("/api/plans", async (req: Request, res: Response) => {
    res.json(planConfigs);
  });

  // ============ EMAIL AUTOMATION ROUTES ============

  // MailerSend webhook endpoint for tracking email events
  app.post("/api/webhooks/mailersend", async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-mailersend-signature'];
      const webhookSecret = process.env.MAILERSEND_WEBHOOK_SECRET;

      // Verify webhook signature if secret is configured
      if (webhookSecret && signature) {
        const crypto = await import('crypto');
        const expectedSignature = crypto.createHmac('sha256', webhookSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (signature !== expectedSignature) {
          console.log("[webhook] Invalid MailerSend signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      const payload = req.body;
      console.log(`[webhook] Received MailerSend event: ${payload.type}`);

      await handleWebhookEvent(payload);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[webhook] MailerSend webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // Email unsubscribe endpoint (public)
  app.get("/api/email/unsubscribe/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      // Find preferences by unsubscribe token
      const prefs = await storage.getEmailPreferencesByToken(token);
      if (!prefs) {
        return res.status(404).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Invalid Link</h1>
              <p>This unsubscribe link is invalid or has expired.</p>
            </body>
          </html>
        `);
      }

      // Update preferences
      await storage.updateEmailPreferences(prefs.id, {
        marketingEnabled: false,
        onboardingEnabled: false,
        unsubscribedAt: new Date(),
      });

      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Unsubscribed Successfully</h1>
            <p>You have been unsubscribed from our email list.</p>
            <p>You will still receive transactional emails (receipts, confirmations).</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error processing unsubscribe:", error);
      res.status(500).send("Failed to process unsubscribe request");
    }
  });

  // Email preferences management (authenticated)
  app.get("/api/email/preferences", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user?.email) {
        return res.status(400).json({ message: "No email associated with account" });
      }

      let prefs = await storage.getEmailPreferencesByEmail(user.email);
      if (!prefs) {
        // Create default preferences
        prefs = await storage.createEmailPreferences({
          userId,
          email: user.email,
          transactionalEnabled: true,
          marketingEnabled: true,
          onboardingEnabled: true,
          notificationsEnabled: true,
        });
      }

      res.json(prefs);
    } catch (error) {
      console.error("Error fetching email preferences:", error);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/email/preferences", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user?.email) {
        return res.status(400).json({ message: "No email associated with account" });
      }

      const { marketingEnabled, onboardingEnabled, notificationsEnabled } = req.body;

      let prefs = await storage.getEmailPreferencesByEmail(user.email);
      if (!prefs) {
        prefs = await storage.createEmailPreferences({
          userId,
          email: user.email,
          transactionalEnabled: true,
          marketingEnabled: marketingEnabled ?? true,
          onboardingEnabled: onboardingEnabled ?? true,
          notificationsEnabled: notificationsEnabled ?? true,
        });
      } else {
        prefs = await storage.updateEmailPreferences(prefs.id, {
          marketingEnabled,
          onboardingEnabled,
          notificationsEnabled,
        });
      }

      res.json(prefs);
    } catch (error) {
      console.error("Error updating email preferences:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Admin email automation routes
  app.get("/api/admin/email/status", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const enabled = isEmailAutomationEnabled();
      const stats = await getEmailStats();

      res.json({
        enabled,
        stats,
        hasApiKey: !!process.env.MAILERSEND_API_KEY,
        fromEmail: process.env.FROM_EMAIL || "noreply@autofilllpdf.com",
      });
    } catch (error) {
      console.error("Error fetching email status:", error);
      res.status(500).json({ message: "Failed to fetch email status" });
    }
  });

  app.get("/api/admin/email/templates", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const templates = await getTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.post("/api/admin/email/templates", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { name, subject, htmlContent, textContent, type, variables } = req.body;

      if (!name || !subject || !htmlContent) {
        return res.status(400).json({ message: "Name, subject, and HTML content are required" });
      }

      const template = await createTemplate({
        name,
        subject,
        htmlContent,
        textContent,
        type: type || "transactional",
        variables,
        isActive: true,
      });

      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.patch("/api/admin/email/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      const updates = req.body;

      const template = await updateTemplate(id, updates);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.delete("/api/admin/email/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      await deleteTemplate(id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  app.get("/api/admin/email/sequences", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const sequences = await storage.getAllEmailSequences();
      res.json(sequences);
    } catch (error) {
      console.error("Error fetching sequences:", error);
      res.status(500).json({ message: "Failed to fetch sequences" });
    }
  });

  app.post("/api/admin/email/sequences", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { name, description, triggerType, triggerConditions } = req.body;

      if (!name || !triggerType) {
        return res.status(400).json({ message: "Name and trigger type are required" });
      }

      const sequence = await createSequence({
        name,
        description,
        triggerType,
        triggerConditions,
        isActive: true,
      });

      res.json(sequence);
    } catch (error) {
      console.error("Error creating sequence:", error);
      res.status(500).json({ message: "Failed to create sequence" });
    }
  });

  app.post("/api/admin/email/sequences/:id/steps", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id: sequenceId } = req.params;
      const { templateId, stepOrder, delayMinutes, delayDays, conditions } = req.body;

      if (!templateId || !stepOrder) {
        return res.status(400).json({ message: "Template ID and step order are required" });
      }

      const step = await addSequenceStep({
        sequenceId,
        templateId,
        stepOrder,
        delayMinutes: delayMinutes || 0,
        delayDays: delayDays || 0,
        conditions,
        isActive: true,
      });

      res.json(step);
    } catch (error) {
      console.error("Error creating sequence step:", error);
      res.status(500).json({ message: "Failed to create sequence step" });
    }
  });

  app.get("/api/admin/email/sequences/:id", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { id } = req.params;
      const sequenceData = await getSequenceWithSteps(id);

      if (!sequenceData) {
        return res.status(404).json({ message: "Sequence not found" });
      }

      res.json(sequenceData);
    } catch (error) {
      console.error("Error fetching sequence:", error);
      res.status(500).json({ message: "Failed to fetch sequence" });
    }
  });

  app.post("/api/admin/email/process-queue", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const result = await processEmailQueue();
      res.json(result);
    } catch (error) {
      console.error("Error processing queue:", error);
      res.status(500).json({ message: "Failed to process queue" });
    }
  });

  app.get("/api/admin/email/stats", isAuthenticated, async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const stats = await getEmailStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Start email queue processor (runs every minute)
  startQueueProcessor(60000);

  // ============================================================================
  // Template & Region Index API Routes
  // ============================================================================

  // Template Endpoints
  app.post("/api/templates/match", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { fields, document_type } = req.body;
      const userId = getUserId(req);

      if (!fields || !Array.isArray(fields)) {
        return res.status(400).json({ message: "Invalid fields array" });
      }

      const { findMatchingTemplate } = await import("./templateLearningService");
      const match = await findMatchingTemplate(fields, userId, document_type);

      res.json({
        matched: !!match,
        template: match?.template || null,
        confidence: match?.confidence || 0,
        method: match?.method || null,
      });
    } catch (error) {
      console.error("Error matching template:", error);
      res.status(500).json({ message: "Failed to match template" });
    }
  });

  app.get("/api/templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { getUserTemplates } = await import("./templateLearningService");
      const templates = await getUserTemplates(userId);

      res.json({ templates, count: templates.length });
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/stats", async (req: Request, res: Response) => {
    try {
      const { getTemplateStats } = await import("./templateLearningService");
      const stats = await getTemplateStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching template stats:", error);
      res.status(500).json({ message: "Failed to fetch template stats" });
    }
  });

  // Batch Fill Endpoints
  app.post("/api/batch/upload-data", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { data, format } = req.body;
      const userId = getUserId(req);

      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (!data || !format) return res.status(400).json({ message: "Missing data or format" });

      const { parseDataSource } = await import("./batchFillService");
      const rows = await parseDataSource(data, format === "csv" ? "csv" : "json");

      // Get column names
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      res.json({
        rowCount: rows.length,
        columns,
        preview: rows.slice(0, 3),
      });
    } catch (error) {
      console.error("Error parsing data:", error);
      res.status(500).json({
        message: `Failed to parse data: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  });

  app.post("/api/batch/map-columns", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { columns, fieldLabels } = req.body;
      const userId = getUserId(req);

      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (!columns || !fieldLabels) {
        return res.status(400).json({ message: "Missing columns or fieldLabels" });
      }

      const { autoMapColumns } = await import("./batchFillService");
      const mappings = autoMapColumns(columns, fieldLabels);

      res.json({
        mappings,
        unmappedCount: mappings.filter((m) => !m.fieldLabel).length,
      });
    } catch (error) {
      console.error("Error mapping columns:", error);
      res.status(500).json({ message: "Failed to map columns" });
    }
  });

  app.post("/api/batch/generate", isAuthenticated, upload.single("template"), async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { data, format, mappings } = req.body;
      const templateBuffer = req.file?.buffer;

      if (!templateBuffer) return res.status(400).json({ message: "Template PDF required" });
      if (!data || !format) return res.status(400).json({ message: "Missing data or format" });

      const { parseDataSource, batchFill } = await import("./batchFillService");
      const rows = await parseDataSource(data, format === "csv" ? "csv" : "json");

      // Map columns to field values
      const parsedMappings = JSON.parse(mappings || "{}");
      const mappedRows = rows.map((row) => {
        const mapped: Record<string, string> = {};
        for (const [source, target] of Object.entries(parsedMappings)) {
          if (target && row[source]) {
            mapped[target as string] = row[source];
          }
        }
        return mapped;
      });

      // Extract fields from template using OCR service
      const ocrResult = await extractFieldsFromPdf(templateBuffer, `batch_${Date.now()}`);
      const fields: FormField[] = ocrResult.fields || [];

      if (fields.length === 0) {
        return res.status(400).json({
          message: "No form fields found in template PDF. Please ensure the template contains fillable form fields."
        });
      }

      // Generate batch ZIP
      const zipBuffer = await batchFill(templateBuffer, fields, mappedRows);

      // Return ZIP file
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="filled_forms_${Date.now()}.zip"`);
      res.send(zipBuffer);
    } catch (error) {
      console.error("Error generating batch PDFs:", error);
      res.status(500).json({
        message: `Failed to generate batch: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  });

  app.get("/api/batch/progress/:jobId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // In production, fetch from job queue (BullMQ, etc.)
      // For now, return placeholder response
      res.json({
        jobId,
        status: "processing",
        completed: 5,
        total: 10,
        percent: 50,
        estimatedSecondsRemaining: 30,
      });
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ message: "Failed to fetch progress" });
    }
  });

  // Region Index Endpoints
  app.get("/api/regions/:documentType", async (req: Request, res: Response) => {
    try {
      const { documentType } = req.params;

      const { getTemplatesByDocumentType } = await import("./templateLearningService");
      const regions = await getTemplatesByDocumentType(documentType);

      res.json({
        documentType,
        regionCount: regions.length,
        regions: regions.map((r) => ({
          id: r.id,
          field_count: r.field_count,
          usage_count: r.usage_count,
          match_success_rate: r.match_success_count / (r.match_success_count + r.match_failure_count || 1),
        })),
      });
    } catch (error) {
      console.error("Error fetching regions:", error);
      res.status(500).json({ message: "Failed to fetch regions" });
    }
  });

  app.get("/api/regions/stats", async (req: Request, res: Response) => {
    try {
      const { getTemplateStats } = await import("./templateLearningService");
      const stats = await getTemplateStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching region stats:", error);
      res.status(500).json({ message: "Failed to fetch region stats" });
    }
  });

  // ============ FORM FIELD AUTO-DETECTION ROUTES ============

  /**
   * POST /api/detect/fields
   * Full form field auto-detection (checkboxes, signatures, text inputs)
   * Request: multipart/form-data with 'file' (PDF)
   * Optional query params: method, confidenceThreshold, includeLabels, extractInitials
   */
  app.post("/api/detect/fields", isAuthenticated, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file provided" });
      }

      const { detectFormFields, DetectionOptions } = await import("./fieldDetectorService");

      // Build detection options from query params
      const options = {
        method: req.query.method as "commonforms" | "opencv" | "hybrid" | "auto" | undefined,
        confidenceThreshold: req.query.confidenceThreshold ? parseFloat(req.query.confidenceThreshold as string) : undefined,
        includeLabels: req.query.includeLabels === "true",
        extractInitials: req.query.extractInitials === "true",
      };

      const result = await detectFormFields(req.file.buffer, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error detecting form fields:", error);
      res.status(500).json({
        success: false,
        message: "Failed to detect form fields",
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/detect/checkboxes
   * Fast-path detection for checkboxes only
   * Request: multipart/form-data with 'file' (PDF)
   */
  app.post("/api/detect/checkboxes", isAuthenticated, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file provided" });
      }

      const { detectCheckboxes } = await import("./fieldDetectorService");
      const fields = await detectCheckboxes(req.file.buffer);

      res.json({
        success: true,
        data: {
          fields,
          fieldCount: fields.length,
        },
      });
    } catch (error) {
      console.error("Error detecting checkboxes:", error);
      res.status(500).json({
        success: false,
        message: "Failed to detect checkboxes",
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/detect/signatures
   * Detect signature zones in form
   * Request: multipart/form-data with 'file' (PDF)
   */
  app.post("/api/detect/signatures", isAuthenticated, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file provided" });
      }

      const { detectSignatureZones } = await import("./fieldDetectorService");
      const fields = await detectSignatureZones(req.file.buffer);

      res.json({
        success: true,
        data: {
          fields,
          fieldCount: fields.length,
        },
      });
    } catch (error) {
      console.error("Error detecting signatures:", error);
      res.status(500).json({
        success: false,
        message: "Failed to detect signature zones",
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/detect/capabilities
   * Get available detection models and capabilities
   */
  app.get("/api/detect/capabilities", async (req: Request, res: Response) => {
    try {
      const { getDetectionCapabilities, getDetectorEngineStatus } = await import("./fieldDetectorService");

      const [capabilities, status] = await Promise.all([getDetectionCapabilities(), getDetectorEngineStatus()]);

      res.json({
        success: true,
        data: {
          capabilities,
          serviceStatus: status,
        },
      });
    } catch (error) {
      console.error("Error fetching detection capabilities:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch detection capabilities",
        error: (error as Error).message,
      });
    }
  });

  /**
   * POST /api/detect/merge
   * Merge auto-detected fields with OCR fields for a form
   * Body: { formId: string, ocrFields: FormField[] }
   */
  app.post("/api/detect/merge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { formId, ocrFields } = req.body;

      if (!formId || !ocrFields || !Array.isArray(ocrFields)) {
        return res.status(400).json({ message: "formId and ocrFields array are required" });
      }

      // Verify form ownership
      const form = await storage.getForm(formId);
      if (!form || form.userId !== userId) {
        return res.status(403).json({ message: "Form not found or access denied" });
      }

      // Get stored detected fields
      const detectedRecords = await storage.getDetectedFields(formId);

      // Convert database records to DetectedField format
      const detected = detectedRecords.map((r) => ({
        fieldType: r.fieldType as "checkbox" | "radio" | "text_input" | "signature" | "date" | "initial",
        bbox: [r.bboxX, r.bboxY, r.bboxWidth, r.bboxHeight] as [number, number, number, number],
        confidence: r.confidence,
        state: r.state as "checked" | "unchecked" | null | undefined,
        label: r.label || undefined,
        subtype: r.subtype || undefined,
        page: r.page,
      }));

      // Merge detected with OCR fields
      const { mergeDetectedWithOCR } = await import("./fieldDetectorService");
      const merged = mergeDetectedWithOCR(detected, ocrFields);

      res.json({
        success: true,
        data: {
          mergedFields: merged,
          detectedCount: detected.length,
          ocrCount: ocrFields.length,
          mergedCount: merged.length,
        },
      });
    } catch (error) {
      console.error("Error merging fields:", error);
      res.status(500).json({
        success: false,
        message: "Failed to merge fields",
        error: (error as Error).message,
      });
    }
  });

  /**
   * GET /api/forms/:formId/detected-fields
   * Get detected fields for a form
   * Optional query: page=N (filter by page number)
   */
  app.get("/api/forms/:formId/detected-fields", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { formId } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;

      // Verify form ownership
      const form = await storage.getForm(formId);
      if (!form || form.userId !== userId) {
        return res.status(403).json({ message: "Form not found or access denied" });
      }

      const detectedFields = await storage.getDetectedFields(formId, page);

      res.json({
        success: true,
        data: {
          fields: detectedFields,
          count: detectedFields.length,
        },
      });
    } catch (error) {
      console.error("Error fetching detected fields:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch detected fields",
      });
    }
  });

  /**
   * PATCH /api/forms/:formId/detected-fields/:fieldId/verify
   * Mark a detected field as verified by user
   * Body: { verified: boolean }
   */
  app.patch("/api/forms/:formId/detected-fields/:fieldId/verify", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { formId, fieldId } = req.params;
      const { verified } = req.body;

      if (typeof verified !== "boolean") {
        return res.status(400).json({ message: "verified must be a boolean" });
      }

      // Verify form ownership
      const form = await storage.getForm(formId);
      if (!form || form.userId !== userId) {
        return res.status(403).json({ message: "Form not found or access denied" });
      }

      const updated = await storage.verifyDetectedField(fieldId, verified);

      if (!updated) {
        return res.status(404).json({ message: "Detected field not found" });
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      console.error("Error verifying detected field:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify detected field",
      });
    }
  });

  /**
   * GET /api/detect/stats
   * Get detection statistics (admin only)
   */
  app.get("/api/detect/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!(await isAdmin(req))) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const stats = await storage.getDetectionStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error fetching detection stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch detection stats",
      });
    }
  });

  return httpServer;
}