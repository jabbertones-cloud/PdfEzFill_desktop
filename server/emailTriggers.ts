import { db } from "./db";
import { 
  forms, 
  users, 
  payments,
  type Form,
  type User,
  type EmailTriggerType
} from "@shared/schema";
import { eq, and, lt, lte, gte, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { triggerEmailByEvent, sendEmailDirect, getDefaultVariables } from "./emailAutomation";

const APP_URL = process.env.APP_URL 
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

export async function checkFormAbandonment(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check registered user forms
  const abandonedFormsWithUsers = await db.select({
    form: forms,
    user: users,
  })
  .from(forms)
  .innerJoin(users, eq(forms.userId, users.id))
  .where(and(
    eq(forms.status, "uploaded"),
    lt(forms.createdAt, oneHourAgo),
    gte(forms.createdAt, twentyFourHoursAgo),
    isNull(forms.abandonmentEmailSent),
    isNotNull(users.email)
  ))
  .limit(50);

  // Check guest forms (forms with guestEmail but no userId)
  const abandonedGuestForms = await db.select()
    .from(forms)
    .where(and(
      eq(forms.status, "uploaded"),
      lt(forms.createdAt, oneHourAgo),
      gte(forms.createdAt, twentyFourHoursAgo),
      isNull(forms.abandonmentEmailSent),
      isNull(forms.userId),
      isNotNull(forms.guestEmail)
    ))
    .limit(50);

  console.log(`[email-triggers] Checking form abandonment: ${abandonedFormsWithUsers.length} user forms, ${abandonedGuestForms.length} guest forms found`);

  // Process registered user forms
  for (const { form, user } of abandonedFormsWithUsers) {
    if (!user.email) continue;

    await triggerEmailByEvent("form_abandoned", user.email, {
      form_name: form.originalFileName || form.fileName || "Your form",
      form_id: form.id,
      resume_url: `${APP_URL}/fill/${form.id}`,
      user_name: user.firstName || user.lastName || "there",
    });

    await db.update(forms)
      .set({ abandonmentEmailSent: new Date() })
      .where(eq(forms.id, form.id));

    console.log(`[email-triggers] Sent abandonment email for form ${form.id} to ${user.email}`);
  }

  // Process guest forms
  for (const form of abandonedGuestForms) {
    if (!form.guestEmail) continue;

    await triggerEmailByEvent("form_abandoned", form.guestEmail, {
      form_name: form.originalFileName || form.fileName || "Your form",
      form_id: form.id,
      resume_url: `${APP_URL}/fill/${form.id}`,
      user_name: "there",
    });

    await db.update(forms)
      .set({ abandonmentEmailSent: new Date() })
      .where(eq(forms.id, form.id));

    console.log(`[email-triggers] Sent abandonment email for guest form ${form.id} to ${form.guestEmail}`);
  }
}

export async function checkFormExpiryReminders(): Promise<void> {
  const oneHundredFiftyDaysAgo = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);
  const oneHundredEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const expiringFormsWithUsers = await db.select({
    form: forms,
    user: users,
  })
  .from(forms)
  .innerJoin(users, eq(forms.userId, users.id))
  .where(and(
    eq(forms.status, "completed"),
    gte(forms.completedAt, oneHundredEightyDaysAgo),
    lte(forms.completedAt, oneHundredFiftyDaysAgo),
    isNull(forms.expiryReminderSent),
    isNotNull(users.email)
  ))
  .limit(50);

  console.log(`[email-triggers] Checking expiry reminders: ${expiringFormsWithUsers.length} forms nearing expiry found`);

  for (const { form, user } of expiringFormsWithUsers) {
    if (!user.email) continue;

    const expiryDate = form.completedAt ? new Date(form.completedAt) : new Date();
    expiryDate.setDate(expiryDate.getDate() + 180);
    const daysUntilExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    await triggerEmailByEvent("expiry_reminder", user.email, {
      form_name: form.originalFileName || form.fileName || "Your form",
      form_id: form.id,
      days_until_expiry: daysUntilExpiry.toString(),
      download_url: `${APP_URL}/download/${form.id}`,
      user_name: user.firstName || user.lastName || "there",
    });

    await db.update(forms)
      .set({ expiryReminderSent: new Date() })
      .where(eq(forms.id, form.id));

    console.log(`[email-triggers] Sent expiry reminder for form ${form.id} to ${user.email}`);
  }
}

export async function checkInactiveUsers(): Promise<void> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const inactiveUsersList = await db.select()
    .from(users)
    .where(and(
      gte(users.updatedAt, thirtyDaysAgo),
      lt(users.updatedAt, fourteenDaysAgo),
      isNull(users.inactivityEmailSent),
      isNotNull(users.email),
      sql`NOT EXISTS (
        SELECT 1 FROM ${forms}
        WHERE ${forms.userId} = ${users.id}
        AND ${forms.createdAt} >= ${fourteenDaysAgo}
      )`
    ))
    .limit(50);

  console.log(`[email-triggers] Checking inactive users: ${inactiveUsersList.length} inactive users found`);

  for (const user of inactiveUsersList) {
    if (!user.email) continue;

    await triggerEmailByEvent("inactivity", user.email, {
      user_name: user.firstName || user.lastName || "there",
      days_inactive: "14",
    });

    await db.update(users)
      .set({ inactivityEmailSent: new Date() })
      .where(eq(users.id, user.id));

    console.log(`[email-triggers] Sent inactivity email to ${user.email}`);
  }
}

export async function triggerMilestoneEmails(userId: string, milestone: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.email) return;

  const formsCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM forms WHERE user_id = ${userId} AND status = 'completed'
  `);
  const totalForms = parseInt((formsCount.rows[0] as any).count) || 0;

  const milestones: Record<number, string> = {
    1: "first_form",
    5: "five_forms",
    10: "ten_forms",
    25: "twenty_five_forms",
    50: "fifty_forms",
    100: "hundred_forms",
  };

  if (milestones[totalForms]) {
    await triggerEmailByEvent("milestone", user.email, {
      user_name: user.firstName || user.lastName || "there",
      milestone_type: milestones[totalForms],
      total_forms: totalForms.toString(),
    });

    console.log(`[email-triggers] Sent milestone email (${milestones[totalForms]}) to ${user.email}`);
  }
}

export async function sendWelcomeSequence(userId: string, email: string): Promise<void> {
  await triggerEmailByEvent("user_signup", email, {
    user_id: userId,
  });
}

export async function sendFormCompletedEmails(formId: string): Promise<void> {
  const form = await db.query.forms.findFirst({
    where: eq(forms.id, formId),
  });

  if (!form) return;

  // Check for registered user first
  if (form.userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, form.userId),
    });

    if (user?.email) {
      await triggerEmailByEvent("form_completed", user.email, {
        form_name: form.originalFileName || form.fileName || "Your form",
        form_id: form.id,
        download_url: `${APP_URL}/download/${form.id}`,
        user_name: user.firstName || user.lastName || "there",
      });

      await triggerMilestoneEmails(user.id, "form_completed");
      return;
    }
  }

  // Fall back to guest email if no user
  if (form.guestEmail) {
    await triggerEmailByEvent("form_completed", form.guestEmail, {
      form_name: form.originalFileName || form.fileName || "Your form",
      form_id: form.id,
      download_url: `${APP_URL}/download/${form.id}`,
      user_name: "there",
    });
  }
}

export async function sendPaymentEmails(
  userId: string, 
  paymentType: "subscription_start" | "subscription_cancel" | "payment_success",
  metadata?: Record<string, any>
): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.email) return;

  await triggerEmailByEvent(paymentType, user.email, {
    user_name: user.firstName || user.lastName || "there",
    ...metadata,
  });
}

let triggerCheckInterval: ReturnType<typeof setInterval> | null = null;

export function startBehaviorTriggerChecks(intervalMs: number = 300000): void {
  if (triggerCheckInterval) {
    console.log("[email-triggers] Trigger checks already running");
    return;
  }

  console.log(`[email-triggers] Starting behavior trigger checks (interval: ${intervalMs}ms)`);
  
  triggerCheckInterval = setInterval(async () => {
    try {
      console.log(`[email-triggers] Running scheduled behavior checks at ${new Date().toISOString()}`);
      await checkFormAbandonment();
      await checkFormExpiryReminders();
      await checkInactiveUsers();
      console.log(`[email-triggers] Completed behavior checks at ${new Date().toISOString()}`);
    } catch (error) {
      console.error("[email-triggers] Error in trigger checks:", error);
    }
  }, intervalMs);

  setTimeout(async () => {
    try {
      await checkFormAbandonment();
      await checkFormExpiryReminders();
      await checkInactiveUsers();
    } catch (error) {
      console.error("[email-triggers] Error in initial trigger checks:", error);
    }
  }, 10000);
}

export function stopBehaviorTriggerChecks(): void {
  if (triggerCheckInterval) {
    clearInterval(triggerCheckInterval);
    triggerCheckInterval = null;
    console.log("[email-triggers] Trigger checks stopped");
  }
}

export async function seedDefaultEmailTemplates(): Promise<void> {
  const { createTemplate, getTemplates } = await import("./emailAutomation");
  
  const existingTemplates = await getTemplates();
  if (existingTemplates.length > 0) {
    console.log("[email-triggers] Templates already exist, skipping seed");
    return;
  }

  const defaultTemplates = [
    {
      name: "Welcome Email",
      subject: "Welcome to AutoFillPDF!",
      type: "onboarding" as const,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to AutoFillPDF!</h1>
          <p>Hi {{user_name}},</p>
          <p>Thank you for joining AutoFillPDF! We're excited to help you simplify your PDF form filling experience.</p>
          <p>Here's what you can do:</p>
          <ul style="line-height: 1.8;">
            <li>Upload any PDF form (even scanned ones!)</li>
            <li>Fill it out with our easy web interface</li>
            <li>Add your signature digitally</li>
            <li>Download the completed form instantly</li>
          </ul>
          <p style="margin: 24px 0;">
            <a href="{{app_url}}/upload?utm_source=email&utm_medium=automation&utm_campaign=welcome&utm_content=cta_button" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Upload Your First Form
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">
            Thank you for using AutoFillPDF!
          </p>
        </div>
      `,
      textContent: "Welcome to AutoFillPDF! Upload your first form at {{app_url}}/upload?utm_source=email&utm_medium=automation&utm_campaign=welcome&utm_content=cta_button",
      variables: ["user_name", "app_url"] as any,
    },
    {
      name: "Form Abandoned Reminder",
      subject: "Don't forget your form!",
      type: "notification" as const,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">You left a form incomplete</h1>
          <p>Hi {{user_name}},</p>
          <p>We noticed you started filling out <strong>{{form_name}}</strong> but didn't finish.</p>
          <p>Your progress has been saved! Click below to pick up where you left off.</p>
          <p style="margin: 24px 0;">
            <a href="{{resume_url}}?utm_source=email&utm_medium=automation&utm_campaign=form_abandoned&utm_content=cta_button" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Continue Filling Form
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">
            Thank you for using AutoFillPDF!
          </p>
        </div>
      `,
      textContent: "You left a form incomplete. Continue at: {{resume_url}}?utm_source=email&utm_medium=automation&utm_campaign=form_abandoned&utm_content=cta_button",
      variables: ["user_name", "form_name", "resume_url"] as any,
    },
    {
      name: "Form Completed",
      subject: "Your form is ready to download!",
      type: "transactional" as const,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #22c55e;">Your Form is Ready!</h1>
          <p>Hi {{user_name}},</p>
          <p>Great news! Your completed form <strong>{{form_name}}</strong> is ready for download.</p>
          <p style="margin: 24px 0;">
            <a href="{{download_url}}?utm_source=email&utm_medium=automation&utm_campaign=form_completed&utm_content=cta_button" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Download Your Form
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will be available for 180 days.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">
            Thank you for using AutoFillPDF!
          </p>
        </div>
      `,
      textContent: "Your form is ready! Download at: {{download_url}}?utm_source=email&utm_medium=automation&utm_campaign=form_completed&utm_content=cta_button",
      variables: ["user_name", "form_name", "download_url"] as any,
    },
    {
      name: "Subscription Welcome",
      subject: "Welcome to AutoFillPDF {{plan_name}}!",
      type: "transactional" as const,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to {{plan_name}}!</h1>
          <p>Hi {{user_name}},</p>
          <p>Thank you for subscribing to AutoFillPDF {{plan_name}}. Your subscription is now active!</p>
          <p>You now have access to:</p>
          <ul style="line-height: 1.8;">
            <li>Autofill profiles</li>
            <li>Saved signatures</li>
            <li>Form history</li>
            <li>Priority processing</li>
          </ul>
          <p style="margin: 24px 0;">
            <a href="{{app_url}}/dashboard?utm_source=email&utm_medium=automation&utm_campaign=subscription_welcome&utm_content=cta_button" 
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
      textContent: "Welcome to AutoFillPDF {{plan_name}}! Visit your dashboard at {{app_url}}/dashboard?utm_source=email&utm_medium=automation&utm_campaign=subscription_welcome&utm_content=cta_button",
      variables: ["user_name", "plan_name", "app_url"] as any,
    },
    {
      name: "Expiry Reminder",
      subject: "Your form expires in {{days_until_expiry}} days",
      type: "notification" as const,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Form Expiring Soon</h1>
          <p>Hi {{user_name}},</p>
          <p>Your completed form <strong>{{form_name}}</strong> will expire in <strong>{{days_until_expiry}} days</strong>.</p>
          <p>After expiration, you'll need to regenerate it for $2 to download again.</p>
          <p style="margin: 24px 0;">
            <a href="{{download_url}}?utm_source=email&utm_medium=automation&utm_campaign=expiry_reminder&utm_content=cta_button" 
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
      textContent: "Your form expires in {{days_until_expiry}} days. Download at: {{download_url}}?utm_source=email&utm_medium=automation&utm_campaign=expiry_reminder&utm_content=cta_button",
      variables: ["user_name", "form_name", "days_until_expiry", "download_url"] as any,
    },
  ];

  for (const template of defaultTemplates) {
    try {
      await createTemplate(template);
      console.log(`[email-triggers] Created template: ${template.name}`);
    } catch (error) {
      console.error(`[email-triggers] Failed to create template ${template.name}:`, error);
    }
  }

  console.log("[email-triggers] Default templates seeded successfully");
}
