import { db } from "./db";
import { forms, payments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { renderCompletedPdf, RenderOptions, RenderResult } from "./pdfRenderer";
import { stripeService } from "./stripeService";
import { sendEmailDirect } from "./emailAutomation";

const APP_URL = process.env.APP_URL 
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

interface RetryResult {
  success: boolean;
  result?: RenderResult;
  attempts: number;
  refunded?: boolean;
  error?: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function renderPdfWithRetry(
  options: RenderOptions,
  formId: string
): Promise<RetryResult> {
  let lastError: string | undefined;
  let attempts = 0;

  for (let i = 0; i < MAX_RETRY_ATTEMPTS; i++) {
    attempts++;
    
    try {
      console.log(`[pdf-retry] Attempt ${attempts}/${MAX_RETRY_ATTEMPTS} for form ${formId}`);
      
      const result = await renderCompletedPdf(options);
      
      if (result.success) {
        console.log(`[pdf-retry] Success on attempt ${attempts} for form ${formId}`);
        return {
          success: true,
          result,
          attempts,
        };
      }
      
      lastError = result.error || "Unknown rendering error";
      console.log(`[pdf-retry] Attempt ${attempts} failed: ${lastError}`);
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unexpected error";
      console.error(`[pdf-retry] Attempt ${attempts} threw error:`, error);
    }
    
    if (i < MAX_RETRY_ATTEMPTS - 1) {
      await delay(RETRY_DELAY_MS * (i + 1));
    }
  }

  console.log(`[pdf-retry] All ${MAX_RETRY_ATTEMPTS} attempts failed for form ${formId}`);
  
  const refunded = await handlePdfFailure(formId, lastError || "Unknown error");
  
  return {
    success: false,
    attempts,
    refunded,
    error: lastError,
  };
}

async function handlePdfFailure(formId: string, error: string): Promise<boolean> {
  let refunded = false;
  
  try {
    const [form] = await db.select().from(forms).where(eq(forms.id, formId));
    if (!form) {
      console.error(`[pdf-retry] Form ${formId} not found`);
      return false;
    }

    await db.update(forms)
      .set({
        status: "error",
        errorMessage: `PDF generation failed after ${MAX_RETRY_ATTEMPTS} attempts: ${error}`,
      })
      .where(eq(forms.id, formId));

    const REFUNDABLE_PAYMENT_TYPES = ["guest", "extra_form", "regeneration"];
    
    const payment = await db.select()
      .from(payments)
      .where(and(
        eq(payments.formId, formId),
        eq(payments.status, "completed")
      ))
      .limit(1);

    if (payment.length > 0 && payment[0].stripePaymentIntentId) {
      const paymentType = payment[0].type;
      
      if (REFUNDABLE_PAYMENT_TYPES.includes(paymentType)) {
        try {
          console.log(`[pdf-retry] Initiating auto-refund for form ${formId} (type: ${paymentType})`);
          await stripeService.createRefund(
            payment[0].stripePaymentIntentId,
            `PDF generation failed after ${MAX_RETRY_ATTEMPTS} attempts`
          );
          
          await db.update(payments)
            .set({ status: "refunded" })
            .where(eq(payments.id, payment[0].id));
          
          refunded = true;
          console.log(`[pdf-retry] Refund successful for form ${formId}`);
        } catch (refundError) {
          console.error(`[pdf-retry] Refund failed:`, refundError);
        }
      } else {
        console.log(`[pdf-retry] Skipping refund for non-refundable payment type: ${paymentType}`);
      }
    }

    await sendFailureNotification(form, error, refunded);
    
  } catch (err) {
    console.error(`[pdf-retry] Error handling PDF failure:`, err);
  }
  
  return refunded;
}

async function sendFailureNotification(
  form: any,
  error: string,
  refunded: boolean
): Promise<void> {
  let email: string | null = null;
  let userName = "there";
  
  if (form.userId) {
    const users = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, form.userId),
    });
    if (users?.email) {
      email = users.email;
      userName = users.firstName || "there";
    }
  } else if (form.guestEmail) {
    email = form.guestEmail;
  }
  
  if (!email) {
    console.log(`[pdf-retry] No email found for form ${form.id}, skipping notification`);
    return;
  }
  
  const refundMessage = refunded 
    ? `<p style="color: #059669; font-weight: 500;">Your payment has been automatically refunded.</p>`
    : `<p>If you paid for this form, please contact support for a refund.</p>`;
  
  await sendEmailDirect({
    to: email,
    toName: userName,
    subject: `PDF Generation Failed - ${form.fileName || form.originalFileName || "Your Form"}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1e1e1e;">PDF Generation Failed</h1>
        <p>Hi ${userName},</p>
        <p>We're sorry, but we were unable to generate your completed PDF after multiple attempts.</p>
        <p><strong>Form:</strong> ${form.fileName || form.originalFileName || "Your form"}</p>
        ${refundMessage}
        <p><strong>What you can do:</strong></p>
        <ul>
          <li>Try uploading the form again - we'll regenerate it for just $2</li>
          <li>Contact support if you continue to experience issues</li>
        </ul>
        <p style="margin: 24px 0;">
          <a href="${APP_URL}/upload" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Try Again
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #666; font-size: 12px;">
          Technical details: ${error}
        </p>
        <p style="color: #999; font-size: 12px;">
          AutoFillPDF - Making paperwork painless
        </p>
      </div>
    `,
    text: `PDF generation failed for your form. ${refunded ? 'Your payment has been automatically refunded.' : ''} Please try again or contact support.`,
    userId: form.userId,
  });
  
  console.log(`[pdf-retry] Failure notification queued for ${email}`);
}

export async function retryFailedForm(formId: string): Promise<RetryResult> {
  const [form] = await db.select().from(forms).where(eq(forms.id, formId));
  
  if (!form) {
    return {
      success: false,
      attempts: 0,
      error: "Form not found",
    };
  }
  
  if (!form.originalPdfPath || !form.fieldSchema) {
    return {
      success: false,
      attempts: 0,
      error: "Form data incomplete - cannot retry",
    };
  }
  
  await db.update(forms)
    .set({
      status: "processing",
      errorMessage: null,
    })
    .where(eq(forms.id, formId));
  
  const options: RenderOptions = {
    answers: form.answers || {},
    signatureData: form.signatureData,
    fields: form.fieldSchema as any,
    fieldOverrides: form.fieldOverrides as any,
    originalPdfPath: form.originalPdfPath,
    formId: String(formId),
    fileName: form.fileName || form.originalFileName || `form-${formId}`,
  };
  
  return await renderPdfWithRetry(options, formId);
}

export async function getFailedForms(userId?: string): Promise<any[]> {
  const query = userId
    ? db.select().from(forms).where(and(
        eq(forms.userId, userId),
        eq(forms.status, "error")
      ))
    : db.select().from(forms).where(eq(forms.status, "error"));
  
  return await query;
}
