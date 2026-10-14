import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { db } from "./db";
import {
  emailTemplates,
  emailSequences,
  emailSequenceSteps,
  emailQueue,
  emailEvents,
  emailPreferences,
  sequenceEnrollments,
  users,
  type EmailTemplate,
  type EmailSequence,
  type EmailSequenceStep,
  type EmailQueueItem,
  type EmailEvent,
  type EmailPreference,
  type SequenceEnrollment,
  type InsertEmailTemplate,
  type InsertEmailSequence,
  type InsertEmailSequenceStep,
  type InsertEmailQueueItem,
  type InsertEmailEvent,
  type InsertEmailPreference,
  type InsertSequenceEnrollment,
  type EmailTriggerType,
  type EmailTemplateType,
} from "@shared/schema";
import { eq, and, lt, lte, isNull, desc, asc, sql as drizzleSql } from "drizzle-orm";

const EMAIL_ENABLED = !!process.env.MAILERSEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@autofilllpdf.com";
const FROM_NAME = process.env.FROM_NAME || "AutoFillPDF";
const APP_URL = process.env.APP_URL
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

let mailerSend: MailerSend | null = null;

if (EMAIL_ENABLED && process.env.MAILERSEND_API_KEY) {
  try {
    mailerSend = new MailerSend({
      apiKey: process.env.MAILERSEND_API_KEY,
    });
  } catch (error) {
    console.error("[email] Failed to initialize MailerSend:", error);
    mailerSend = null;
  }
} else if (!process.env.MAILERSEND_API_KEY) {
  console.warn("[email] MAILERSEND_API_KEY not set - email service will not function");
}

export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  variables?: Record<string, string>;
  userId?: string;
  sequenceId?: string;
  stepId?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  queueId?: string;
  error?: string;
  queued?: boolean;
}

export function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    result = result.replace(regex, value || '');
  }
  return result;
}

export function getDefaultVariables(userData?: { name?: string; email?: string; firstName?: string }): Record<string, string> {
  return {
    app_name: "AutoFillPDF",
    app_url: APP_URL,
    current_year: new Date().getFullYear().toString(),
    support_email: FROM_EMAIL,
    user_name: userData?.name || userData?.firstName || "there",
    user_email: userData?.email || "",
    user_first_name: userData?.firstName || userData?.name?.split(' ')[0] || "",
  };
}

export async function sendEmailDirect(options: SendEmailOptions): Promise<EmailSendResult> {
  const {
    to,
    toName,
    subject,
    html,
    text,
    templateId,
    variables = {},
    userId,
    sequenceId,
    stepId,
  } = options;

  const personalizedSubject = replaceVariables(subject, variables);
  const personalizedHtml = replaceVariables(html, variables);
  const personalizedText = text ? replaceVariables(text, variables) : undefined;

  let queueId: string | undefined;
  try {
    const [queueItem] = await db.insert(emailQueue).values({
      userId,
      email: to,
      templateId,
      sequenceId,
      stepId,
      subject: personalizedSubject,
      htmlContent: personalizedHtml,
      textContent: personalizedText,
      personalization: variables,
      scheduledFor: new Date(),
      status: "pending",
    }).returning();
    queueId = queueItem.id;
  } catch (err) {
    console.error("[email] Failed to create queue item:", err);
  }

  if (!EMAIL_ENABLED || !mailerSend) {
    console.log(`[email] Email service not configured. Would send to ${to}:`);
    console.log(`[email]   Subject: ${personalizedSubject}`);

    if (queueId) {
      await db.update(emailQueue)
        .set({ status: "sent", sentAt: new Date(), mailerSendMessageId: "dev-mode-skipped" })
        .where(eq(emailQueue.id, queueId));
    }

    return { success: true, queued: true, queueId };
  }

  try {
    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(to, toName)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(personalizedSubject)
      .setHtml(personalizedHtml);

    if (personalizedText) {
      emailParams.setText(personalizedText);
    }

    const response = await mailerSend.email.send(emailParams);

    const messageId = response.headers?.['x-message-id'] || undefined;
    console.log(`[email] Sent email to ${to}, messageId: ${messageId}`);

    if (queueId) {
      await db.update(emailQueue)
        .set({
          status: "sent",
          sentAt: new Date(),
          mailerSendMessageId: messageId
        })
        .where(eq(emailQueue.id, queueId));

      await db.insert(emailEvents).values({
        queueId,
        userId,
        email: to,
        mailerSendMessageId: messageId,
        eventType: "sent",
        eventData: { provider: "mailersend" },
      });
    }

    return { success: true, messageId, queueId };
  } catch (error) {
    console.error("[email] Send error:", error);
    const errorMessage = error instanceof Error ? error.message : "Email send failed";

    if (queueId) {
      await db.update(emailQueue)
        .set({
          status: "failed",
          errorMessage,
          retryCount: drizzleSql`${emailQueue.retryCount} + 1`
        })
        .where(eq(emailQueue.id, queueId));
    }

    return { success: false, error: errorMessage, queueId };
  }
}

export async function sendFromTemplate(
  templateId: string,
  to: string,
  variables: Record<string, string>,
  options?: {
    toName?: string;
    userId?: string;
    sequenceId?: string;
    stepId?: string;
  }
): Promise<EmailSendResult> {
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.id, templateId),
  });

  if (!template || !template.isActive) {
    return { success: false, error: "Template not found or inactive" };
  }

  const defaultVars = getDefaultVariables({ email: to });
  const allVariables = { ...defaultVars, ...variables };

  return sendEmailDirect({
    to,
    toName: options?.toName,
    subject: template.subject,
    html: template.htmlContent,
    text: template.textContent || undefined,
    templateId: template.id,
    variables: allVariables,
    userId: options?.userId,
    sequenceId: options?.sequenceId,
    stepId: options?.stepId,
  });
}

export async function createTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
  const templateData = {
    ...template,
    variables: template.variables ? (template.variables as string[]) : null,
  };
  const [created] = await db.insert(emailTemplates).values(templateData).returning();
  return created;
}

export async function updateTemplate(id: string, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate | null> {
  const updateData: Record<string, any> = { ...updates, updatedAt: new Date() };
  if (updates.variables) {
    updateData.variables = updates.variables as string[];
  }
  const [updated] = await db.update(emailTemplates)
    .set(updateData)
    .where(eq(emailTemplates.id, id))
    .returning();
  return updated || null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  return true;
}

export async function getTemplates(type?: EmailTemplateType): Promise<EmailTemplate[]> {
  if (type) {
    return db.query.emailTemplates.findMany({
      where: eq(emailTemplates.type, type),
      orderBy: desc(emailTemplates.createdAt),
    });
  }
  return db.query.emailTemplates.findMany({
    orderBy: desc(emailTemplates.createdAt),
  });
}

export async function createSequence(sequence: InsertEmailSequence): Promise<EmailSequence> {
  const [created] = await db.insert(emailSequences).values(sequence).returning();
  return created;
}

export async function addSequenceStep(step: InsertEmailSequenceStep): Promise<EmailSequenceStep> {
  const [created] = await db.insert(emailSequenceSteps).values(step).returning();
  return created;
}

export async function getSequenceWithSteps(sequenceId: string): Promise<{
  sequence: EmailSequence;
  steps: EmailSequenceStep[];
} | null> {
  const sequence = await db.query.emailSequences.findFirst({
    where: eq(emailSequences.id, sequenceId),
  });

  if (!sequence) return null;

  const steps = await db.query.emailSequenceSteps.findMany({
    where: eq(emailSequenceSteps.sequenceId, sequenceId),
    orderBy: asc(emailSequenceSteps.stepOrder),
  });

  return { sequence, steps };
}

export async function enrollUserInSequence(
  email: string,
  sequenceId: string,
  options?: {
    userId?: string;
    metadata?: Record<string, any>;
  }
): Promise<SequenceEnrollment | null> {
  const existingEnrollment = await db.query.sequenceEnrollments.findFirst({
    where: and(
      eq(sequenceEnrollments.email, email),
      eq(sequenceEnrollments.sequenceId, sequenceId),
      eq(sequenceEnrollments.status, "active")
    ),
  });

  if (existingEnrollment) {
    console.log(`[email] User ${email} already enrolled in sequence ${sequenceId}`);
    return existingEnrollment;
  }

  const sequenceData = await getSequenceWithSteps(sequenceId);
  if (!sequenceData || !sequenceData.sequence.isActive) {
    console.log(`[email] Sequence ${sequenceId} not found or inactive`);
    return null;
  }

  const firstStep = sequenceData.steps.find(s => s.stepOrder === 1 && s.isActive);

  const [enrollment] = await db.insert(sequenceEnrollments).values({
    userId: options?.userId,
    email,
    sequenceId,
    currentStepId: firstStep?.id,
    status: "active",
    metadata: options?.metadata,
  }).returning();

  console.log(`[email] Enrolled ${email} in sequence ${sequenceId}`);

  if (firstStep && firstStep.delayMinutes === 0 && firstStep.delayDays === 0) {
    await scheduleSequenceEmail(enrollment, firstStep);
  }

  return enrollment;
}

export async function scheduleSequenceEmail(
  enrollment: SequenceEnrollment,
  step: EmailSequenceStep
): Promise<void> {
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.id, step.templateId),
  });

  if (!template || !template.isActive) {
    console.log(`[email] Template ${step.templateId} not found for step ${step.id}`);
    return;
  }

  const delayMs = ((step.delayMinutes || 0) * 60 * 1000) + ((step.delayDays || 0) * 24 * 60 * 60 * 1000);
  const scheduledFor = new Date(Date.now() + delayMs);

  const defaultVars = getDefaultVariables({ email: enrollment.email });
  const personalizedVars = {
    ...defaultVars,
    ...(enrollment.metadata as Record<string, string> || {}),
  };

  await db.insert(emailQueue).values({
    userId: enrollment.userId,
    email: enrollment.email,
    templateId: step.templateId,
    sequenceId: enrollment.sequenceId,
    stepId: step.id,
    subject: replaceVariables(template.subject, personalizedVars),
    htmlContent: replaceVariables(template.htmlContent, personalizedVars),
    textContent: template.textContent ? replaceVariables(template.textContent, personalizedVars) : undefined,
    personalization: personalizedVars,
    scheduledFor,
    status: "pending",
  });

  console.log(`[email] Scheduled email for ${enrollment.email} at ${scheduledFor.toISOString()}`);
}

function calculateBackoffDelay(retryCount: number): number {
  const backoffDelays = [
    1 * 60 * 1000,   // 1 minute
    5 * 60 * 1000,   // 5 minutes
    15 * 60 * 1000,  // 15 minutes
  ];
  return backoffDelays[Math.min(retryCount, backoffDelays.length - 1)] || backoffDelays[backoffDelays.length - 1];
}

async function resetStuckInProgressEmails(): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const stuckEmails = await db.query.emailQueue.findMany({
    where: and(
      eq(emailQueue.status, "in_progress"),
      lt(emailQueue.scheduledFor, tenMinutesAgo)
    ),
  });

  if (stuckEmails.length > 0) {
    console.log(`[email] Found ${stuckEmails.length} stuck in_progress emails older than 10 minutes, resetting to pending`);

    for (const email of stuckEmails) {
      await db.update(emailQueue)
        .set({
          status: "pending",
          errorMessage: `Reset from stuck in_progress state after 10 minutes`
        })
        .where(eq(emailQueue.id, email.id));

      console.log(`[email] Reset stuck email ${email.id} (to: ${email.email}) back to pending`);
    }
  }

  return stuckEmails.length;
}

export async function processEmailQueue(): Promise<{ sent: number; failed: number; deadLetter: number; resetStuck: number }> {
  const now = new Date();

  const resetStuck = await resetStuckInProgressEmails();

  const pendingEmails = await db.query.emailQueue.findMany({
    where: and(
      eq(emailQueue.status, "pending"),
      lte(emailQueue.scheduledFor, now)
    ),
    orderBy: asc(emailQueue.scheduledFor),
    limit: 50,
  });

  if (pendingEmails.length > 0) {
    console.log(`[email] Queue check: ${pendingEmails.length} pending emails found`);
  }

  let sent = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const queueItem of pendingEmails) {
    const maxRetries = queueItem.maxRetries ?? 3;

    if ((queueItem.retryCount ?? 0) >= maxRetries) {
      await db.update(emailQueue)
        .set({
          status: "dead_letter",
          errorMessage: `Max retries (${maxRetries}) exceeded. Last error: ${queueItem.errorMessage || 'Unknown'}`
        })
        .where(eq(emailQueue.id, queueItem.id));

      console.error(`[email] Email ${queueItem.id} moved to dead_letter after ${maxRetries} retries (to: ${queueItem.email}, subject: ${queueItem.subject})`);
      deadLetter++;
      continue;
    }

    await db.update(emailQueue)
      .set({ status: "in_progress" })
      .where(eq(emailQueue.id, queueItem.id));

    const prefs = await checkEmailPreferences(queueItem.email, queueItem.templateId);
    if (!prefs.allowed) {
      await db.update(emailQueue)
        .set({ status: "cancelled", errorMessage: `Unsubscribed: ${prefs.reason}` })
        .where(eq(emailQueue.id, queueItem.id));
      console.log(`[email] Email ${queueItem.id} cancelled - user unsubscribed (${prefs.reason})`);
      continue;
    }

    const result = await sendQueuedEmail(queueItem);
    if (result.success) {
      sent++;

      if (queueItem.stepId && queueItem.sequenceId) {
        await advanceSequence(queueItem.email, queueItem.sequenceId, queueItem.stepId);
      }
    } else {
      failed++;
    }
  }

  console.log(`[email] Queue processed: ${sent} sent, ${failed} failed, ${deadLetter} dead_letter, ${resetStuck} reset from stuck`);
  return { sent, failed, deadLetter, resetStuck };
}

async function sendQueuedEmail(queueItem: EmailQueueItem): Promise<EmailSendResult> {
  const maxRetries = queueItem.maxRetries ?? 3;
  const currentRetryCount = queueItem.retryCount ?? 0;
  const recipient = queueItem.email;

  if (!EMAIL_ENABLED || !mailerSend) {
    console.log(`[email] Dev mode - skipping actual send for email ${queueItem.id} to ${recipient}`);
    await db.update(emailQueue)
      .set({ status: "sent", sentAt: new Date(), mailerSendMessageId: "dev-mode-skipped" })
      .where(eq(emailQueue.id, queueItem.id));
    return { success: true, queueId: queueItem.id };
  }

  try {
    console.log(`[email] Attempting to send email ${queueItem.id} to ${recipient} (attempt ${currentRetryCount + 1}/${maxRetries + 1})`);

    const sentFrom = new Sender(FROM_EMAIL, FROM_NAME);
    const recipients = [new Recipient(recipient)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(queueItem.subject)
      .setHtml(queueItem.htmlContent);

    if (queueItem.textContent) {
      emailParams.setText(queueItem.textContent);
    }

    const response = await mailerSend.email.send(emailParams);
    const messageId = response.headers?.['x-message-id'] || undefined;

    await db.update(emailQueue)
      .set({
        status: "sent",
        sentAt: new Date(),
        mailerSendMessageId: messageId
      })
      .where(eq(emailQueue.id, queueItem.id));

    await db.insert(emailEvents).values({
      queueId: queueItem.id,
      userId: queueItem.userId,
      email: recipient,
      mailerSendMessageId: messageId,
      eventType: "sent",
    });

    console.log(`[email] Successfully sent email ${queueItem.id} to ${recipient}, messageId: ${messageId}`);
    return { success: true, messageId, queueId: queueItem.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[email] Failed to send email to ${recipient}:`, errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('[email] Stack trace:', error.stack);
    }
    await handleEmailError(queueItem.id, errorMessage);
    return { success: false, error: errorMessage };
  }
}

async function handleEmailError(queueId: string | undefined, errorMessage: string): Promise<void> {
  if (!queueId) return;

  const queueItem = await db.query.emailQueue.findFirst({ where: eq(emailQueue.id, queueId) });
  if (!queueItem) return;

  const maxRetries = queueItem.maxRetries ?? 3;
  const currentRetryCount = queueItem.retryCount ?? 0;
  const newRetryCount = currentRetryCount + 1;

  if (newRetryCount >= maxRetries) {
    console.error(`[email] Email ${queueId} has exhausted all ${maxRetries} retries, moving to dead_letter`);
    await db.update(emailQueue)
      .set({
        status: "dead_letter",
        errorMessage: `Max retries (${maxRetries}) exceeded. Last error: ${errorMessage}`,
        retryCount: newRetryCount,
      })
      .where(eq(emailQueue.id, queueId));
  } else {
    const backoffDelay = calculateBackoffDelay(newRetryCount);
    const nextRetryTime = new Date(Date.now() + backoffDelay);
    const backoffMinutes = Math.round(backoffDelay / 60000);

    console.log(`[email] Scheduling retry ${newRetryCount + 1}/${maxRetries + 1} for email ${queueId} in ${backoffMinutes} minute(s) at ${nextRetryTime.toISOString()}`);

    await db.update(emailQueue)
      .set({
        status: "pending",
        errorMessage,
        retryCount: newRetryCount,
        scheduledFor: nextRetryTime
      })
      .where(eq(emailQueue.id, queueId));
  }
}

async function advanceSequence(email: string, sequenceId: string, completedStepId: string): Promise<void> {
  const enrollment = await db.query.sequenceEnrollments.findFirst({
    where: and(
      eq(sequenceEnrollments.email, email),
      eq(sequenceEnrollments.sequenceId, sequenceId),
      eq(sequenceEnrollments.status, "active")
    ),
  });

  if (!enrollment) return;

  const sequenceData = await getSequenceWithSteps(sequenceId);
  if (!sequenceData) return;

  const completedStep = sequenceData.steps.find(s => s.id === completedStepId);
  if (!completedStep) return;

  const nextStep = sequenceData.steps.find(
    s => s.stepOrder === completedStep.stepOrder + 1 && s.isActive
  );

  if (nextStep) {
    await db.update(sequenceEnrollments)
      .set({
        currentStepId: nextStep.id,
        lastEmailSentAt: new Date()
      })
      .where(eq(sequenceEnrollments.id, enrollment.id));

    await scheduleSequenceEmail(enrollment, nextStep);
  } else {
    await db.update(sequenceEnrollments)
      .set({
        status: "completed",
        completedAt: new Date(),
        lastEmailSentAt: new Date()
      })
      .where(eq(sequenceEnrollments.id, enrollment.id));

    console.log(`[email] Sequence ${sequenceId} completed for ${email}`);
  }
}

async function checkEmailPreferences(
  email: string,
  templateId?: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const prefs = await db.query.emailPreferences.findFirst({
    where: eq(emailPreferences.email, email),
  });

  if (!prefs) {
    return { allowed: true };
  }

  if (prefs.unsubscribedAt) {
    return { allowed: false, reason: "globally_unsubscribed" };
  }

  if (templateId) {
    const template = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.id, templateId),
    });

    if (template) {
      switch (template.type) {
        case "marketing":
          if (!prefs.marketingEnabled) {
            return { allowed: false, reason: "marketing_disabled" };
          }
          break;
        case "onboarding":
          if (!prefs.onboardingEnabled) {
            return { allowed: false, reason: "onboarding_disabled" };
          }
          break;
        case "notification":
          if (!prefs.notificationsEnabled) {
            return { allowed: false, reason: "notifications_disabled" };
          }
          break;
      }
    }
  }

  return { allowed: true };
}

export async function recordEmailEvent(event: InsertEmailEvent): Promise<EmailEvent> {
  const [created] = await db.insert(emailEvents).values(event).returning();
  return created;
}

export async function handleWebhookEvent(payload: {
  type: string;
  email: {
    message: {
      id: string;
    };
    recipient: {
      email: string;
    };
  };
  url?: string;
  user_agent?: string;
  ip?: string;
  created_at: string;
}): Promise<void> {
  const messageId = payload.email?.message?.id;
  const recipientEmail = payload.email?.recipient?.email;

  if (!messageId || !recipientEmail) {
    console.log("[email] Invalid webhook payload - missing messageId or email");
    return;
  }

  const queueItem = await db.query.emailQueue.findFirst({
    where: eq(emailQueue.mailerSendMessageId, messageId),
  });

  let eventType: string;
  switch (payload.type) {
    case "activity.sent":
      eventType = "sent";
      break;
    case "activity.delivered":
      eventType = "delivered";
      break;
    case "activity.soft_bounced":
    case "activity.hard_bounced":
      eventType = "bounced";
      break;
    case "activity.opened":
      eventType = "opened";
      break;
    case "activity.clicked":
      eventType = "clicked";
      break;
    case "activity.spam_complaint":
      eventType = "spam_complaint";
      break;
    case "activity.unsubscribed":
      eventType = "unsubscribed";
      break;
    default:
      eventType = payload.type;
  }

  await recordEmailEvent({
    queueId: queueItem?.id,
    userId: queueItem?.userId,
    email: recipientEmail,
    mailerSendMessageId: messageId,
    eventType,
    eventData: payload as any,
    clickedUrl: payload.url,
    userAgent: payload.user_agent,
    ipAddress: payload.ip,
  });

  if (eventType === "unsubscribed") {
    await handleUnsubscribe(recipientEmail);
  }

  if (eventType === "bounced" || eventType === "spam_complaint") {
    await handleBounceOrComplaint(recipientEmail, eventType);
  }

  console.log(`[email] Recorded ${eventType} event for ${recipientEmail}`);
}

async function handleUnsubscribe(email: string): Promise<void> {
  const existing = await db.query.emailPreferences.findFirst({
    where: eq(emailPreferences.email, email),
  });

  if (existing) {
    await db.update(emailPreferences)
      .set({
        unsubscribedAt: new Date(),
        marketingEnabled: false,
        onboardingEnabled: false,
        updatedAt: new Date()
      })
      .where(eq(emailPreferences.id, existing.id));
  } else {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    await db.insert(emailPreferences).values({
      userId: user?.id || "",
      email,
      marketingEnabled: false,
      onboardingEnabled: false,
      unsubscribedAt: new Date(),
    });
  }

  await db.update(sequenceEnrollments)
    .set({ status: "cancelled" })
    .where(and(
      eq(sequenceEnrollments.email, email),
      eq(sequenceEnrollments.status, "active")
    ));

  await db.update(emailQueue)
    .set({ status: "cancelled", errorMessage: "User unsubscribed" })
    .where(and(
      eq(emailQueue.email, email),
      eq(emailQueue.status, "pending")
    ));
}

async function handleBounceOrComplaint(email: string, type: string): Promise<void> {
  console.log(`[email] Handling ${type} for ${email}`);

  await db.update(sequenceEnrollments)
    .set({ status: "paused" })
    .where(and(
      eq(sequenceEnrollments.email, email),
      eq(sequenceEnrollments.status, "active")
    ));
}

export async function triggerEmailByEvent(
  triggerType: EmailTriggerType,
  email: string,
  metadata?: Record<string, any>
): Promise<void> {
  const sequences = await db.query.emailSequences.findMany({
    where: and(
      eq(emailSequences.triggerType, triggerType),
      eq(emailSequences.isActive, true)
    ),
  });

  for (const sequence of sequences) {
    if (sequence.triggerConditions) {
      const conditions = sequence.triggerConditions as Record<string, any>;
      let conditionsMet = true;

      for (const [key, value] of Object.entries(conditions)) {
        if (metadata && metadata[key] !== value) {
          conditionsMet = false;
          break;
        }
      }

      if (!conditionsMet) continue;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    await enrollUserInSequence(email, sequence.id, {
      userId: user?.id,
      metadata,
    });
  }
}

export async function getEmailStats(options?: {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickRate: number;
}> {
  const conditions: any[] = [];

  if (options?.userId) {
    conditions.push(eq(emailEvents.userId, options.userId));
  }

  const allEvents = await db.query.emailEvents.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });

  const stats = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
  };

  for (const event of allEvents) {
    switch (event.eventType) {
      case "sent":
        stats.sent++;
        break;
      case "delivered":
        stats.delivered++;
        break;
      case "opened":
        stats.opened++;
        break;
      case "clicked":
        stats.clicked++;
        break;
      case "bounced":
        stats.bounced++;
        break;
    }
  }

  return {
    ...stats,
    openRate: stats.delivered > 0 ? (stats.opened / stats.delivered) * 100 : 0,
    clickRate: stats.opened > 0 ? (stats.clicked / stats.opened) * 100 : 0,
  };
}

export function isEmailAutomationEnabled(): boolean {
  return EMAIL_ENABLED;
}

let queueProcessorInterval: ReturnType<typeof setInterval> | null = null;

export function startQueueProcessor(intervalMs: number = 60000): void {
  if (queueProcessorInterval) {
    console.log("[email] Queue processor already running");
    return;
  }

  console.log(`[email] Starting queue processor (interval: ${intervalMs}ms)`);
  queueProcessorInterval = setInterval(async () => {
    try {
      await processEmailQueue();
    } catch (error) {
      console.error("[email] Queue processor error:", error);
    }
  }, intervalMs);

  processEmailQueue().catch(console.error);
}

export function stopQueueProcessor(): void {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
    console.log("[email] Queue processor stopped");
  }
}
