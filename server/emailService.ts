export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  queued?: boolean;
}

const EMAIL_ENABLED = !!(process.env.MAILERSEND_API_KEY || process.env.RESEND_API_KEY || process.env.MAILEROO_API_KEY || process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@autofilllpdf.com";
const FROM_NAME = process.env.FROM_NAME || "AutoFillPDF";

// EMAIL_PROVIDER routing:
//   "resend"    — Resend (requires RESEND_API_KEY + RESEND_WEBHOOK_SECRET)
//   "maileroo"  — Maileroo smtp API (requires MAILEROO_API_KEY)
//   "brevo"     — Brevo smtp/email API (requires BREVO_API_KEY or SENDINBLUE_API_KEY)
//   anything else / unset — falls through to MailerSend (requires MAILERSEND_API_KEY)
// See docs/EMAIL_RESEND_MIGRATION.md for per-site setup checklist.
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "mailersend";

function getAppUrl(): string {
  return process.env.APP_URL 
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || "https://autofilllpdf.com";
}

const emailQueue: EmailPayload[] = [];

async function sendViaResend(payload: EmailPayload): Promise<EmailResult> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: payload.toName ? `${payload.toName} <${payload.to}>` : payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, messageId: data?.id };
}

async function sendViaMaileroo(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.MAILEROO_API_KEY;
  if (!apiKey) throw new Error("MAILEROO_API_KEY not set");
  const res = await fetch("https://smtp.maileroo.com/v1/send", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: payload.toName ? `${payload.toName} <${payload.to}>` : payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[email] Maileroo error:", errText);
    return { success: false, error: errText };
  }
  const data = await res.json() as any;
  return { success: true, messageId: data?.message_id };
}

async function sendViaBrevo(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY not set");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: payload.to, name: payload.toName }],
      subject: payload.subject,
      htmlContent: payload.html,
      textContent: payload.text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[email] Brevo error:", errText);
    return { success: false, error: errText };
  }
  const data = await res.json() as any;
  return { success: true, messageId: data?.messageId?.toString() };
}

async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!EMAIL_ENABLED) {
    console.log(`[email] Email service not configured. Would send to ${payload.to}:`);
    console.log(`[email]   Subject: ${payload.subject}`);
    emailQueue.push(payload);
    return { success: true, queued: true };
  }

  if (EMAIL_PROVIDER === "resend") {
    return sendViaResend(payload);
  }

  if (EMAIL_PROVIDER === "maileroo") {
    return sendViaMaileroo(payload);
  }

  if (EMAIL_PROVIDER === "brevo") {
    return sendViaBrevo(payload);
  }

  try {
    const response = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MAILERSEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: payload.to, name: payload.toName }],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("[email] MailerSend error:", error);
      return { success: false, error };
    }
    
    const messageId = response.headers.get("X-Message-Id") || undefined;
    console.log(`[email] Sent email to ${payload.to}, messageId: ${messageId}`);
    
    return { success: true, messageId };
  } catch (error) {
    console.error("[email] Send error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Email send failed" 
    };
  }
}

export async function sendFormReadyEmail(
  email: string,
  userName: string,
  formId: string,
  fileName: string
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  
  const downloadUrl = `${appUrl}/download/${formId}`;
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: "Your completed form is ready for download",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Your Form is Ready!</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Great news! Your completed form <strong>${fileName}</strong> is ready for download.</p>
        <p style="margin: 24px 0;">
          <a href="${downloadUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download Your Form
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link will be available for 180 days. After that, you can regenerate the form for $2.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Your form "${fileName}" is ready for download. Visit: ${downloadUrl}`,
  });
}

export async function sendPaymentReceiptEmail(
  email: string,
  userName: string,
  amount: number,
  productName: string,
  receiptUrl?: string
): Promise<EmailResult> {
  const amountStr = `$${(amount / 100).toFixed(2)}`;
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Payment Receipt - ${productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Payment Confirmed</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Thank you for your payment of <strong>${amountStr}</strong> for <strong>${productName}</strong>.</p>
        ${receiptUrl ? `
        <p style="margin: 24px 0;">
          <a href="${receiptUrl}" 
             style="color: #2563eb; text-decoration: underline;">
            View Receipt
          </a>
        </p>
        ` : ""}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Payment confirmed: ${amountStr} for ${productName}`,
  });
}

export async function sendSubscriptionWelcomeEmail(
  email: string,
  userName: string,
  planName: string
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Welcome to AutoFillPDF ${planName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Welcome to ${planName}!</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Thank you for subscribing to AutoFillPDF ${planName}. Here's what's included:</p>
        <ul style="line-height: 1.8;">
          <li>Autofill profiles to speed up form completion</li>
          <li>Saved signatures</li>
          <li>Form history and re-downloads</li>
          <li>Priority processing</li>
        </ul>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/dashboard" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Go to Dashboard
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Welcome to AutoFillPDF ${planName}! Visit your dashboard: ${appUrl}/dashboard`,
  });
}

export async function sendRegenerationReminderEmail(
  email: string,
  userName: string,
  formId: string,
  fileName: string,
  daysUntilExpiry: number
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Your form "${fileName}" expires in ${daysUntilExpiry} days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Form Expiring Soon</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Your completed form <strong>${fileName}</strong> will expire in <strong>${daysUntilExpiry} days</strong>.</p>
        <p>After expiration, you'll need to regenerate it for $2 to download again.</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/download/${formId}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download Now
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Your form "${fileName}" expires in ${daysUntilExpiry} days. Download: ${appUrl}/download/${formId}`,
  });
}

export async function sendFormProcessingFailedEmail(
  email: string,
  userName: string,
  fileName: string,
  errorMessage?: string
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Issue processing your form "${fileName}"`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ef4444;">Processing Issue</h1>
        <p>Hi ${userName || "there"},</p>
        <p>We encountered an issue while processing your form <strong>${fileName}</strong>.</p>
        ${errorMessage ? `<p style="color: #666; background: #f5f5f5; padding: 12px; border-radius: 4px;">${errorMessage}</p>` : ""}
        <p>Please try uploading the form again. If the issue persists, contact our support team.</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/upload" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Try Again
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Issue processing "${fileName}". Please try uploading again: ${appUrl}/upload`,
  });
}

export async function sendPaymentFailedEmail(
  email: string,
  userName: string,
  planName: string,
  amount: number,
  nextRetryDate?: Date
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  const retryInfo = nextRetryDate 
    ? `We'll automatically try again on ${nextRetryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : 'Please update your payment method to continue your subscription.';
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Payment failed for your AutoFillPDF ${planName} subscription`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ef4444;">Payment Failed</h1>
        <p>Hi ${userName || "there"},</p>
        <p>We weren't able to process your payment of <strong>${formattedAmount}</strong> for your AutoFillPDF ${planName} subscription.</p>
        <p>${retryInfo}</p>
        <p>To avoid any interruption to your service, please update your payment information:</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/dashboard?tab=billing" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          If you believe this is an error, please check with your bank or card issuer.
          Common reasons for payment failures include:
        </p>
        <ul style="color: #666; font-size: 14px; line-height: 1.8;">
          <li>Insufficient funds</li>
          <li>Expired card</li>
          <li>Card declined by issuer</li>
          <li>Incorrect billing information</li>
        </ul>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Questions? Contact us at admin@autofilllpdf.com
        </p>
      </div>
    `,
    text: `Payment of ${formattedAmount} failed for AutoFillPDF ${planName}. Update your payment method: ${appUrl}/dashboard?tab=billing`,
  });
}

export async function sendSubscriptionPastDueEmail(
  email: string,
  userName: string,
  planName: string,
  daysPastDue: number
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  const urgencyLevel = daysPastDue > 7 ? 'high' : 'normal';
  const urgencyColor = urgencyLevel === 'high' ? '#ef4444' : '#f59e0b';
  const urgencyMessage = daysPastDue > 7 
    ? 'Your subscription will be cancelled soon if payment is not received.'
    : 'Please update your payment method to keep your subscription active.';
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Action required: Your AutoFillPDF subscription is past due`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: ${urgencyColor};">Subscription Past Due</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Your AutoFillPDF ${planName} subscription is <strong>${daysPastDue} days past due</strong>.</p>
        <p style="color: ${urgencyColor}; font-weight: bold;">${urgencyMessage}</p>
        <p>Update your payment information now to continue enjoying:</p>
        <ul style="line-height: 1.8;">
          <li>Autofill profiles</li>
          <li>Saved signatures</li>
          <li>Form history</li>
          <li>Priority processing</li>
        </ul>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/dashboard?tab=billing" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Need help? Contact us at admin@autofilllpdf.com
        </p>
      </div>
    `,
    text: `Your AutoFillPDF ${planName} subscription is ${daysPastDue} days past due. Update your payment: ${appUrl}/dashboard?tab=billing`,
  });
}

export async function sendPaymentMethodExpiringEmail(
  email: string,
  userName: string,
  cardLast4: string,
  expiryMonth: number,
  expiryYear: number
): Promise<EmailResult> {
  const appUrl = getAppUrl();
  const expiryDate = new Date(expiryYear, expiryMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  return sendEmail({
    to: email,
    toName: userName,
    subject: `Your payment method is expiring soon`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Payment Method Expiring</h1>
        <p>Hi ${userName || "there"},</p>
        <p>Your card ending in <strong>****${cardLast4}</strong> expires in <strong>${expiryDate}</strong>.</p>
        <p>To avoid any interruption to your AutoFillPDF subscription, please update your payment method before it expires.</p>
        <p style="margin: 24px 0;">
          <a href="${appUrl}/dashboard?tab=billing" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          Thank you for using AutoFillPDF!
        </p>
      </div>
    `,
    text: `Your card ending in ${cardLast4} expires ${expiryDate}. Update your payment method: ${appUrl}/dashboard?tab=billing`,
  });
}

export function getQueuedEmails(): EmailPayload[] {
  return [...emailQueue];
}

export function clearEmailQueue(): void {
  emailQueue.length = 0;
}

export function isEmailConfigured(): boolean {
  return EMAIL_ENABLED;
}
