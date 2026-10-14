import { db } from "./db";
import { forms, users } from "@shared/schema";
import { eq, and, lt, lte, isNull, isNotNull, or, sql } from "drizzle-orm";
import { deleteFormFiles } from "./objectStorageService";
import { sendEmailDirect } from "./emailAutomation";

const APP_URL = process.env.APP_URL 
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

interface CleanupResult {
  guestFormsDeleted: number;
  proFormsDeleted: number;
  filesDeleted: number;
  errors: string[];
}

export async function runRetentionCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    guestFormsDeleted: 0,
    proFormsDeleted: 0,
    filesDeleted: 0,
    errors: [],
  };

  try {
    await cleanupGuestForms(result);
    await cleanupProForms(result);
    
    console.log(`[retention] Cleanup complete: ${result.guestFormsDeleted} guest forms, ${result.proFormsDeleted} pro forms deleted`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown cleanup error";
    result.errors.push(errorMsg);
    console.error("[retention] Cleanup failed:", error);
  }

  return result;
}

async function cleanupGuestForms(result: CleanupResult): Promise<void> {
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const expiredGuestForms = await db.select()
    .from(forms)
    .where(and(
      isNull(forms.userId),
      lt(forms.createdAt, seventyTwoHoursAgo),
      or(
        eq(forms.status, "completed"),
        eq(forms.status, "uploaded"),
        eq(forms.status, "ready"),
        eq(forms.status, "processing"),
        eq(forms.status, "error")
      )
    ))
    .limit(100);

  console.log(`[retention] Found ${expiredGuestForms.length} expired guest forms (>72h old)`);

  for (const form of expiredGuestForms) {
    try {
      if (form.originalPdfPath || form.generatedPdfPath) {
        const deleted = await deleteFormFiles(form.id);
        if (deleted) {
          result.filesDeleted++;
        }
      }

      await db.update(forms)
        .set({
          status: "expired",
          originalPdfPath: sql`null`,
          generatedPdfPath: sql`null`,
          expiresAt: new Date(),
        })
        .where(eq(forms.id, form.id));

      result.guestFormsDeleted++;
      console.log(`[retention] Deleted guest form ${form.id}`);
    } catch (error) {
      const errorMsg = `Failed to delete guest form ${form.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
      result.errors.push(errorMsg);
      console.error(`[retention] ${errorMsg}`);
    }
  }
}

async function cleanupProForms(result: CleanupResult): Promise<void> {
  const oneHundredEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const expiredProForms = await db.select({
    form: forms,
    user: users,
  })
  .from(forms)
  .innerJoin(users, eq(forms.userId, users.id))
  .where(and(
    isNotNull(forms.userId),
    or(
      eq(forms.status, "completed"),
      eq(forms.status, "ready"),
      eq(forms.status, "processing"),
      eq(forms.status, "error")
    ),
    lt(forms.createdAt, oneHundredEightyDaysAgo)
  ))
  .limit(100);

  console.log(`[retention] Found ${expiredProForms.length} expired pro forms (>180 days old)`);

  for (const { form, user } of expiredProForms) {
    try {
      if (form.originalPdfPath || form.generatedPdfPath) {
        const deleted = await deleteFormFiles(form.id);
        if (deleted) {
          result.filesDeleted++;
        }
      }

      await db.update(forms)
        .set({
          status: "expired",
          originalPdfPath: sql`null`,
          generatedPdfPath: sql`null`,
          expiresAt: new Date(),
        })
        .where(eq(forms.id, form.id));

      result.proFormsDeleted++;
      console.log(`[retention] Deleted pro form ${form.id}`);

      if (user.email) {
        await sendEmailDirect({
          to: user.email,
          toName: user.firstName || "User",
          subject: `Your form has expired - ${form.fileName || form.originalFileName || "Form"}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #1e1e1e;">Form Expired</h1>
              <p>Hi ${user.firstName || "there"},</p>
              <p>Your form "<strong>${form.fileName || form.originalFileName || "Form"}</strong>" has expired after 180 days and the files have been automatically deleted.</p>
              <p><strong>Good news:</strong> We've kept your form's metadata, so you can regenerate it for just $2 if you need it again.</p>
              <p style="margin: 24px 0;">
                <a href="${APP_URL}/dashboard" 
                   style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Dashboard
                </a>
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">
                AutoFillPDF - Making paperwork painless
              </p>
            </div>
          `,
          text: `Your form "${form.fileName || form.originalFileName || "Form"}" has expired. You can regenerate it for $2 from your dashboard.`,
          userId: user.id,
        });
      }
    } catch (error) {
      const errorMsg = `Failed to delete pro form ${form.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
      result.errors.push(errorMsg);
      console.error(`[retention] ${errorMsg}`);
    }
  }
}

export function startRetentionCleanupSchedule(): void {
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
  
  console.log("[retention] Starting retention cleanup scheduler (6-hour interval)");
  
  runRetentionCleanup().catch(err => console.error("[retention] Initial cleanup failed:", err));
  
  setInterval(() => {
    runRetentionCleanup().catch(err => console.error("[retention] Scheduled cleanup failed:", err));
  }, CLEANUP_INTERVAL);
}

export async function getRetentionStats(): Promise<{
  guestFormsExpiringSoon: number;
  proFormsExpiringSoon: number;
  totalExpiredForms: number;
}> {
  const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const oneHundredFiftyDaysAgo = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);

  const guestExpiringSoon = await db.select()
    .from(forms)
    .where(and(
      isNull(forms.userId),
      lt(forms.createdAt, seventyTwoHoursAgo)
    ));

  const proExpiringSoon = await db.select()
    .from(forms)
    .where(and(
      isNotNull(forms.userId),
      eq(forms.status, "completed"),
      lt(forms.completedAt, oneHundredFiftyDaysAgo)
    ));

  const expiredForms = await db.select()
    .from(forms)
    .where(eq(forms.status, "expired"));

  return {
    guestFormsExpiringSoon: guestExpiringSoon.length,
    proFormsExpiringSoon: proExpiringSoon.length,
    totalExpiredForms: expiredForms.length,
  };
}
