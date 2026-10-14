import { eq, and, gte, lte, desc, isNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { encrypt, decrypt } from "./crypto";
import {
  users,
  profiles,
  forms,
  usageTracking,
  payments,
  adminLogs,
  emailPreferences,
  emailSequences,
  detectedFields,
  regionIndexes,
  regionMatchHistory,
  regionDetectionCache,
  batchFillJobs,
  formTemplates,
  type User,
  type UpsertUser,
  type Profile,
  type InsertProfile,
  type Form,
  type InsertForm,
  type UsageTracking,
  type InsertUsageTracking,
  type Payment,
  type InsertPayment,
  type AdminLog,
  type InsertAdminLog,
  type UsageSummary,
  type FormField,
  type EmailPreference,
  type InsertEmailPreference,
  type EmailSequence,
  type DetectedFieldRecord,
  type InsertDetectedField,
  type RegionIndex,
  type InsertRegionIndex,
  type RegionMatch,
  type InsertRegionMatch,
  type RegionDetectionCache,
  type InsertRegionDetectionCache,
  type BatchFillJob,
  type InsertBatchFillJob,
  type FormTemplate,
  type InsertFormTemplate,
  planConfigs,
  type PlanType,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersByPlan(planType: string): Promise<User[]>;

  // Profiles (multi-profile support)
  getProfile(id: string): Promise<Profile | undefined>;
  getProfilesByUserId(userId: string): Promise<Profile[]>;
  getDefaultProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | undefined>;
  deleteProfile(id: string): Promise<void>;
  setDefaultProfile(userId: string, profileId: string): Promise<void>;

  // Forms
  getForm(id: string): Promise<Form | undefined>;
  getFormsByUserId(userId: string): Promise<Form[]>;
  getAllForms(): Promise<Form[]>;
  createForm(form: InsertForm): Promise<Form>;
  updateForm(id: string, updates: Partial<Form>): Promise<Form | undefined>;
  deleteForm(id: string): Promise<void>;
  getExpiredForms(): Promise<Form[]>;
  getRegenerableForms(userId: string): Promise<Form[]>;

  // Usage Tracking
  getCurrentUsage(userId: string): Promise<UsageTracking | undefined>;
  createUsageTracking(tracking: InsertUsageTracking): Promise<UsageTracking>;
  incrementFormsUsed(userId: string): Promise<UsageTracking | undefined>;
  getUsageSummary(userId: string): Promise<UsageSummary | null>;
  createOrResetUsagePeriod(userId: string, formsIncluded: number): Promise<UsageTracking>;

  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;
  getPaymentByStripeId(stripePaymentId: string): Promise<Payment | undefined>;
  getPaymentBySessionId(sessionId: string): Promise<Payment | undefined>;
  getPaymentsByUserId(userId: string): Promise<Payment[]>;
  getPaymentsByFormId(formId: string): Promise<Payment[]>;
  getAllPayments(): Promise<Payment[]>;

  // Admin
  createAdminLog(log: InsertAdminLog): Promise<AdminLog>;
  getAdminLogs(limit?: number): Promise<AdminLog[]>;

  // Stripe helpers
  getProduct(productId: string): Promise<any>;
  getProductByMetadata(type: string): Promise<any>;
  getPricesForProduct(productType: string): Promise<any[]>;
  getSubscription(subscriptionId: string): Promise<any>;

  // Analytics
  getFormStats(): Promise<{ total: number; completed: number; failed: number }>;
  getComprehensiveFormStats(): Promise<{ 
    total: number; 
    completed: number; 
    failed: number; 
    processing: number; 
    expired: number;
    uploaded: number;
    ready: number;
  }>;
  getRevenueStats(): Promise<{ total: number; subscriptions: number; oneTime: number }>;
  getUserCountsByPlan(): Promise<{ free: number; starter: number; pro: number; pro_plus: number; enterprise: number; team: number }>;
  getOcrQualityStats(): Promise<{ avgConfidence: number; totalProcessed: number; qualityDistribution: { high: number; medium: number; low: number; unusable: number } }>;

  // Email Preferences
  getEmailPreferencesByToken(token: string): Promise<EmailPreference | undefined>;
  getEmailPreferencesByEmail(email: string): Promise<EmailPreference | undefined>;
  createEmailPreferences(prefs: InsertEmailPreference): Promise<EmailPreference>;
  updateEmailPreferences(id: string, updates: Partial<EmailPreference>): Promise<EmailPreference | undefined>;

  // Email Sequences
  getAllEmailSequences(): Promise<EmailSequence[]>;

  // Region Indexes & Templates
  createFormTemplate(data: {
    user_id?: string;
    document_type: string;
    layout_hash: string;
    field_count: number;
    field_schema: any[];
    example_form_id?: string;
  }): Promise<FormTemplate>;

  findTemplateByHash(layoutHash: string): Promise<FormTemplate | undefined>;

  findTemplatesByUserId(userId: string): Promise<FormTemplate[]>;

  findTemplatesByDocumentType(documentType: string): Promise<FormTemplate[]>;

  recordTemplateMatch(templateId: string, success: boolean): Promise<void>;

  updateFormWithTemplate(formId: string, templateId: string, confidence: number): Promise<void>;

  getTemplateStats(): Promise<{
    total: number;
    byDocumentType: Record<string, { count: number; avgUsageCount: number; avgSuccessRate: number }>;
    totalUsageCount: number;
    avgSuccessRate: number;
  }>;

  // Region Indexes
  createRegionIndex(data: InsertRegionIndex): Promise<RegionIndex>;

  getRegionIndexesByDocumentType(documentType: string): Promise<RegionIndex[]>;

  getRegionIndexById(id: string): Promise<RegionIndex | undefined>;

  updateRegionIndex(id: string, updates: Partial<RegionIndex>): Promise<RegionIndex | undefined>;

  deleteRegionIndex(id: string): Promise<void>;

  getRegionIndexByLayoutSignature(signature: string): Promise<RegionIndex | undefined>;

  // Region Match History
  createRegionMatch(data: InsertRegionMatch): Promise<RegionMatch>;

  getRegionMatchesByFormId(formId: string): Promise<RegionMatch[]>;

  getRegionMatchesByRegionIndexId(regionIndexId: string): Promise<RegionMatch[]>;

  // Region Detection Cache
  getDetectionCacheByHash(hash: string): Promise<RegionDetectionCache | undefined>;

  createDetectionCache(data: InsertRegionDetectionCache): Promise<RegionDetectionCache>;

  updateDetectionCache(id: string, updates: Partial<RegionDetectionCache>): Promise<RegionDetectionCache | undefined>;

  // Batch Fill Jobs
  createBatchFillJob(data: InsertBatchFillJob): Promise<BatchFillJob>;

  getBatchFillJob(id: string): Promise<BatchFillJob | undefined>;

  getBatchFillJobsByUserId(userId: string): Promise<BatchFillJob[]>;

  updateBatchFillJob(id: string, updates: Partial<BatchFillJob>): Promise<BatchFillJob | undefined>;

  updateBatchFillJobProgress(id: string, completedCount: number, failedCount: number, progressPercent: number): Promise<void>;

  // Detected Fields (Form Auto-Detection)
  storeDetectedFields(formId: string, fields: InsertDetectedField[]): Promise<DetectedFieldRecord[]>;
  getDetectedFields(formId: string, page?: number): Promise<DetectedFieldRecord[]>;
  updateDetectedField(fieldId: string, updates: Partial<DetectedFieldRecord>): Promise<DetectedFieldRecord | undefined>;
  verifyDetectedField(fieldId: string, verified: boolean): Promise<DetectedFieldRecord | undefined>;
  deleteDetectedFields(formId: string): Promise<void>;
  getDetectionStats(): Promise<{ total: number; verified: number; byType: Record<string, number>; byMethod: Record<string, number> }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user already exists
    const userId = userData.id;
    if (!userId) throw new Error("User ID is required for upsert");
    const existingUser = await this.getUser(userId);
    const isNewUser = !existingUser;

    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Auto-create email preferences for new users with email
    if (isNewUser && userData.email) {
      try {
        const existingPrefs = await this.getEmailPreferencesByEmail(userData.email);
        if (!existingPrefs) {
          const crypto = await import('crypto');
          await this.createEmailPreferences({
            userId: userId,
            email: userData.email,
            transactionalEnabled: true,
            marketingEnabled: true,
            onboardingEnabled: true,
            notificationsEnabled: true,
            unsubscribeToken: crypto.randomBytes(32).toString('hex'),
          });
          console.log(`[email] Created email preferences for new user: ${userData.email}`);
        }
      } catch (error) {
        console.error(`[email] Failed to create email preferences:`, error);
      }
    }

    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUsersByPlan(planType: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.planType, planType));
  }

  // Profiles (multi-profile support)
  async getProfile(id: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.isDeleted, false)));
    if (profile?.ssn) profile.ssn = decrypt(profile.ssn) ?? profile.ssn;
    return profile;
  }

  async getProfilesByUserId(userId: string): Promise<Profile[]> {
    const rows = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.userId, userId), eq(profiles.isDeleted, false)))
      .orderBy(desc(profiles.isDefault), profiles.label);
    for (const p of rows) if (p.ssn) p.ssn = decrypt(p.ssn) ?? p.ssn;
    return rows;
  }

  async getDefaultProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(
        and(
          eq(profiles.userId, userId),
          eq(profiles.isDefault, true),
          eq(profiles.isDeleted, false)
        )
      );
    if (profile?.ssn) profile.ssn = decrypt(profile.ssn) ?? profile.ssn;
    return profile;
  }

  async createProfile(profileData: InsertProfile): Promise<Profile> {
    // If this is the first profile, make it default
    const existingProfiles = await this.getProfilesByUserId(profileData.userId);
    if (existingProfiles.length === 0) {
      profileData.isDefault = true;
    }
    if (profileData.ssn) profileData.ssn = encrypt(profileData.ssn) ?? profileData.ssn;
    const [profile] = await db.insert(profiles).values(profileData).returning();
    if (profile.ssn) profile.ssn = decrypt(profile.ssn) ?? profile.ssn;
    return profile;
  }

  async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile | undefined> {
    if (updates.ssn) updates.ssn = encrypt(updates.ssn) ?? updates.ssn;
    const [profile] = await db
      .update(profiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    if (profile?.ssn) profile.ssn = decrypt(profile.ssn) ?? profile.ssn;
    return profile;
  }

  async deleteProfile(id: string): Promise<void> {
    // Soft delete
    await db.update(profiles).set({ isDeleted: true }).where(eq(profiles.id, id));
  }

  async setDefaultProfile(userId: string, profileId: string): Promise<void> {
    // Remove default from all profiles
    await db
      .update(profiles)
      .set({ isDefault: false })
      .where(eq(profiles.userId, userId));
    // Set new default
    await db.update(profiles).set({ isDefault: true }).where(eq(profiles.id, profileId));
    // Update user's default profile reference
    await db.update(users).set({ defaultProfileId: profileId }).where(eq(users.id, userId));
  }

  // Forms
  async getForm(id: string): Promise<Form | undefined> {
    const [form] = await db.select().from(forms).where(eq(forms.id, id));
    return form;
  }

  async getFormsByUserId(userId: string): Promise<Form[]> {
    return db
      .select()
      .from(forms)
      .where(eq(forms.userId, userId))
      .orderBy(desc(forms.createdAt));
  }

  async getAllForms(): Promise<Form[]> {
    return db.select().from(forms).orderBy(desc(forms.createdAt));
  }

  async createForm(data: InsertForm): Promise<Form> {
    try {
      const [form] = await db.insert(forms).values(data as any).returning();
      return form;
    } catch (error) {
      console.error('[storage] Failed to create form:', error);
      throw new Error(`Database error creating form: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateForm(id: string, updates: Partial<Form>): Promise<Form | undefined> {
    const [form] = await db
      .update(forms)
      .set(updates)
      .where(eq(forms.id, id))
      .returning();
    return form;
  }

  async deleteForm(id: string): Promise<void> {
    await db.delete(forms).where(eq(forms.id, id));
  }

  async getExpiredForms(): Promise<Form[]> {
    return db
      .select()
      .from(forms)
      .where(lte(forms.expiresAt, new Date()));
  }

  async getRegenerableForms(userId: string): Promise<Form[]> {
    // Forms that are expired but still have metadata for regeneration
    return db
      .select()
      .from(forms)
      .where(
        and(
          eq(forms.userId, userId),
          eq(forms.status, "expired"),
          eq(forms.isRegeneration, false)
        )
      )
      .orderBy(desc(forms.createdAt));
  }

  // Usage Tracking
  async getCurrentUsage(userId: string): Promise<UsageTracking | undefined> {
    const now = new Date();
    const [usage] = await db
      .select()
      .from(usageTracking)
      .where(
        and(
          eq(usageTracking.userId, userId),
          lte(usageTracking.periodStart, now),
          gte(usageTracking.periodEnd, now)
        )
      );
    return usage;
  }

  async createUsageTracking(tracking: InsertUsageTracking): Promise<UsageTracking> {
    const [usage] = await db.insert(usageTracking).values(tracking).returning();
    return usage;
  }

  async incrementFormsUsed(userId: string): Promise<UsageTracking | undefined> {
    const current = await this.getCurrentUsage(userId);
    if (!current) return undefined;

    const [usage] = await db
      .update(usageTracking)
      .set({ formsUsed: (current.formsUsed ?? 0) + 1 })
      .where(eq(usageTracking.id, current.id))
      .returning();
    return usage;
  }

  async createOrResetUsagePeriod(userId: string, formsIncluded: number): Promise<UsageTracking> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    return this.createUsageTracking({
      userId,
      periodStart: now,
      periodEnd,
      formsUsed: 0,
      formsIncluded,
    });
  }

  async getUsageSummary(userId: string): Promise<UsageSummary | null> {
    const user = await this.getUser(userId);
    if (!user || user.planType === "none") return null;

    const usage = await this.getCurrentUsage(userId);
    if (!usage) return null;

    const planConfig = planConfigs[user.planType as PlanType] || planConfigs.pro;
    const now = new Date();
    const daysRemaining = Math.ceil(
      (new Date(usage.periodEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const formsUsed = usage.formsUsed ?? 0;
    const formsIncluded = usage.formsIncluded ?? 0;

    return {
      formsUsed,
      formsIncluded,
      formsRemaining: Math.max(0, formsIncluded - formsUsed),
      periodStart: new Date(usage.periodStart),
      periodEnd: new Date(usage.periodEnd),
      daysRemaining: Math.max(0, daysRemaining),
      overagePrice: planConfig.overagePrice,
    };
  }

  // Payments
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [pay] = await db.insert(payments).values(payment).returning();
    return pay;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [pay] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return pay;
  }

  async getPaymentByStripeId(stripePaymentId: string): Promise<Payment | undefined> {
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, stripePaymentId));
    return pay;
  }

  async getPaymentBySessionId(sessionId: string): Promise<Payment | undefined> {
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeSessionId, sessionId));
    return pay;
  }

  async getPaymentsByUserId(userId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async getPaymentsByFormId(formId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.formId, formId))
      .orderBy(desc(payments.createdAt));
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  // Admin
  async createAdminLog(log: InsertAdminLog): Promise<AdminLog> {
    const [entry] = await db.insert(adminLogs).values(log).returning();
    return entry;
  }

  async getAdminLogs(limit: number = 100): Promise<AdminLog[]> {
    return db.select().from(adminLogs).orderBy(desc(adminLogs.createdAt)).limit(limit);
  }

  // Stripe helpers - query from stripe schema
  async getProduct(productId: string): Promise<any> {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async getProductByMetadata(type: string): Promise<any> {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE metadata->>'type' = ${type} AND active = true LIMIT 1`
    );
    return result.rows[0] || null;
  }

  async getPricesForProduct(productType: string): Promise<any[]> {
    const result = await db.execute(
      sql`
        SELECT pr.* 
        FROM stripe.prices pr
        JOIN stripe.products p ON pr.product = p.id
        WHERE p.metadata->>'type' = ${productType} 
        AND pr.active = true
        AND p.active = true
      `
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  // Analytics
  async getFormStats(): Promise<{ total: number; completed: number; failed: number }> {
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'error') as failed
      FROM forms
    `);
    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      completed: parseInt(row.completed) || 0,
      failed: parseInt(row.failed) || 0,
    };
  }

  async getRevenueStats(): Promise<{ total: number; subscriptions: number; oneTime: number }> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(amount) FILTER (WHERE type = 'subscription'), 0) as subscriptions,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('guest', 'overage', 'regeneration')), 0) as one_time
      FROM payments
      WHERE status = 'completed'
    `);
    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      subscriptions: parseInt(row.subscriptions) || 0,
      oneTime: parseInt(row.one_time) || 0,
    };
  }

  async getComprehensiveFormStats(): Promise<{ 
    total: number; 
    completed: number; 
    failed: number; 
    processing: number; 
    expired: number;
    uploaded: number;
    ready: number;
  }> {
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'error') as failed,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded,
        COUNT(*) FILTER (WHERE status = 'ready') as ready
      FROM forms
    `);
    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      completed: parseInt(row.completed) || 0,
      failed: parseInt(row.failed) || 0,
      processing: parseInt(row.processing) || 0,
      expired: parseInt(row.expired) || 0,
      uploaded: parseInt(row.uploaded) || 0,
      ready: parseInt(row.ready) || 0,
    };
  }

  async getUserCountsByPlan(): Promise<{ free: number; starter: number; pro: number; pro_plus: number; enterprise: number; team: number }> {
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE plan_type = 'none' OR plan_type IS NULL) as free,
        COUNT(*) FILTER (WHERE plan_type = 'starter') as starter,
        COUNT(*) FILTER (WHERE plan_type = 'pro') as pro,
        COUNT(*) FILTER (WHERE plan_type = 'pro_plus') as pro_plus,
        COUNT(*) FILTER (WHERE plan_type = 'enterprise') as enterprise,
        COUNT(*) FILTER (WHERE plan_type = 'team') as team
      FROM users
    `);
    const row = result.rows[0] as any;
    return {
      free: parseInt(row.free) || 0,
      starter: parseInt(row.starter) || 0,
      pro: parseInt(row.pro) || 0,
      pro_plus: parseInt(row.pro_plus) || 0,
      enterprise: parseInt(row.enterprise) || 0,
      team: parseInt(row.team) || 0,
    };
  }

  async getOcrQualityStats(): Promise<{ avgConfidence: number; totalProcessed: number; qualityDistribution: { high: number; medium: number; low: number; unusable: number } }> {
    const result = await db.execute(sql`
      SELECT 
        COALESCE(AVG(ocr_confidence), 0) as avg_confidence,
        COUNT(*) FILTER (WHERE ocr_confidence IS NOT NULL) as total_processed,
        COUNT(*) FILTER (WHERE ocr_confidence >= 80) as high,
        COUNT(*) FILTER (WHERE ocr_confidence >= 50 AND ocr_confidence < 80) as medium,
        COUNT(*) FILTER (WHERE ocr_confidence >= 30 AND ocr_confidence < 50) as low,
        COUNT(*) FILTER (WHERE ocr_confidence < 30) as unusable
      FROM forms
      WHERE ocr_confidence IS NOT NULL
    `);
    const row = result.rows[0] as any;
    return {
      avgConfidence: parseFloat(row.avg_confidence) || 0,
      totalProcessed: parseInt(row.total_processed) || 0,
      qualityDistribution: {
        high: parseInt(row.high) || 0,
        medium: parseInt(row.medium) || 0,
        low: parseInt(row.low) || 0,
        unusable: parseInt(row.unusable) || 0,
      },
    };
  }

  // Email Preferences
  async getEmailPreferencesByToken(token: string): Promise<EmailPreference | undefined> {
    const [prefs] = await db.select().from(emailPreferences).where(eq(emailPreferences.unsubscribeToken, token));
    return prefs;
  }

  async getEmailPreferencesByEmail(email: string): Promise<EmailPreference | undefined> {
    const [prefs] = await db.select().from(emailPreferences).where(eq(emailPreferences.email, email));
    return prefs;
  }

  async createEmailPreferences(prefs: InsertEmailPreference): Promise<EmailPreference> {
    const [created] = await db.insert(emailPreferences).values(prefs).returning();
    return created;
  }

  async updateEmailPreferences(id: string, updates: Partial<EmailPreference>): Promise<EmailPreference | undefined> {
    const [updated] = await db
      .update(emailPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailPreferences.id, id))
      .returning();
    return updated;
  }

  // Email Sequences
  async getAllEmailSequences(): Promise<EmailSequence[]> {
    return db.select().from(emailSequences).orderBy(desc(emailSequences.createdAt));
  }

  // Region Indexes & Templates
  async createFormTemplate(data: {
    user_id?: string;
    document_type: string;
    layout_hash: string;
    field_count: number;
    field_schema: any[];
    example_form_id?: string;
  }): Promise<any> {
    // Import formTemplates from templateLearningService
    const { formTemplates } = await import("./templateLearningService");
    const [template] = await db
      .insert(formTemplates)
      .values({
        user_id: data.user_id,
        document_type: data.document_type,
        layout_hash: data.layout_hash,
        field_count: data.field_count,
        field_schema: data.field_schema,
        example_form_id: data.example_form_id,
        usage_count: 1,
        match_success_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();
    return template;
  }

  async findTemplateByHash(layoutHash: string): Promise<any | undefined> {
    const { formTemplates } = await import("./templateLearningService");
    const [template] = await db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.layout_hash, layoutHash));
    return template;
  }

  async findTemplatesByUserId(userId: string): Promise<any[]> {
    const { formTemplates } = await import("./templateLearningService");
    return db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.user_id, userId))
      .orderBy(desc(formTemplates.usage_count));
  }

  async recordTemplateMatch(templateId: string, success: boolean): Promise<void> {
    const { formTemplates } = await import("./templateLearningService");
    const [existing] = await db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.id, templateId));

    if (!existing) return;

    const matchSuccessCount = existing.match_success_count ?? 0;
    const matchFailureCount = existing.match_failure_count ?? 0;

    await db
      .update(formTemplates)
      .set({
        usage_count: (existing.usage_count ?? 0) + 1,
        last_used_at: new Date(),
        match_success_count: success ? matchSuccessCount + 1 : matchSuccessCount,
        match_failure_count: !success ? matchFailureCount + 1 : matchFailureCount,
        updated_at: new Date(),
      })
      .where(eq(formTemplates.id, templateId));
  }

  async updateFormWithTemplate(
    formId: string,
    templateId: string,
    confidence: number
  ): Promise<void> {
    await db
      .update(forms)
      .set({
        matched_template_id: templateId,
        template_match_confidence: confidence,
      })
      .where(eq(forms.id, formId));
  }

  // Detected Fields (Form Auto-Detection)

  async storeDetectedFields(formId: string, fields: InsertDetectedField[]): Promise<DetectedFieldRecord[]> {
    if (fields.length === 0) {
      return [];
    }

    // First, delete any existing detected fields for this form
    await db.delete(detectedFields).where(eq(detectedFields.formId, formId));

    // Insert new detected fields
    const insertData = fields.map((field) => ({
      ...field,
      formId,
    }));

    return db.insert(detectedFields).values(insertData).returning();
  }

  async getDetectedFields(formId: string, page?: number): Promise<DetectedFieldRecord[]> {
    const conditions = [eq(detectedFields.formId, formId)];

    if (page !== undefined) {
      conditions.push(eq(detectedFields.page, page));
    }

    return db
      .select()
      .from(detectedFields)
      .where(and(...conditions))
      .orderBy(detectedFields.page, detectedFields.bboxY, detectedFields.bboxX);
  }

  async updateDetectedField(
    fieldId: string,
    updates: Partial<DetectedFieldRecord>
  ): Promise<DetectedFieldRecord | undefined> {
    const [field] = await db
      .update(detectedFields)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(detectedFields.id, fieldId))
      .returning();

    return field;
  }

  async verifyDetectedField(fieldId: string, verified: boolean): Promise<DetectedFieldRecord | undefined> {
    const [field] = await db
      .update(detectedFields)
      .set({
        userVerified: verified,
        updatedAt: new Date(),
      })
      .where(eq(detectedFields.id, fieldId))
      .returning();

    return field;
  }

  async deleteDetectedFields(formId: string): Promise<void> {
    await db.delete(detectedFields).where(eq(detectedFields.formId, formId));
  }

  async getDetectionStats(): Promise<{
    total: number;
    verified: number;
    byType: Record<string, number>;
    byMethod: Record<string, number>;
  }> {
    const allFields = await db.select().from(detectedFields);

    const stats = {
      total: allFields.length,
      verified: allFields.filter((f) => f.userVerified).length,
      byType: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
    };

    // Count by field type
    for (const field of allFields) {
      stats.byType[field.fieldType] = (stats.byType[field.fieldType] || 0) + 1;
      stats.byMethod[field.detectionMethod] = (stats.byMethod[field.detectionMethod] || 0) + 1;
    }

    return stats;
  }

  // Region Index Methods
  async createRegionIndex(data: InsertRegionIndex): Promise<RegionIndex> {
    const [record] = await db.insert(regionIndexes).values(data).returning();
    return record;
  }

  async getRegionIndexesByDocumentType(documentType: string): Promise<RegionIndex[]> {
    return db
      .select()
      .from(regionIndexes)
      .where(eq(regionIndexes.document_type, documentType))
      .orderBy(desc(regionIndexes.usage_count));
  }

  async getRegionIndexById(id: string): Promise<RegionIndex | undefined> {
    const [record] = await db.select().from(regionIndexes).where(eq(regionIndexes.id, id));
    return record;
  }

  async updateRegionIndex(id: string, updates: Partial<RegionIndex>): Promise<RegionIndex | undefined> {
    const [record] = await db
      .update(regionIndexes)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(regionIndexes.id, id))
      .returning();
    return record;
  }

  async deleteRegionIndex(id: string): Promise<void> {
    await db.delete(regionIndexes).where(eq(regionIndexes.id, id));
  }

  async getRegionIndexByLayoutSignature(signature: string): Promise<RegionIndex | undefined> {
    const [record] = await db
      .select()
      .from(regionIndexes)
      .where(eq(regionIndexes.layout_signature, signature));
    return record;
  }

  // Region Match History Methods
  async createRegionMatch(data: InsertRegionMatch): Promise<RegionMatch> {
    const [record] = await db.insert(regionMatchHistory).values(data).returning();
    return record;
  }

  async getRegionMatchesByFormId(formId: string): Promise<RegionMatch[]> {
    return db
      .select()
      .from(regionMatchHistory)
      .where(eq(regionMatchHistory.form_id, formId))
      .orderBy(desc(regionMatchHistory.created_at));
  }

  async getRegionMatchesByRegionIndexId(regionIndexId: string): Promise<RegionMatch[]> {
    return db
      .select()
      .from(regionMatchHistory)
      .where(eq(regionMatchHistory.region_index_id, regionIndexId))
      .orderBy(desc(regionMatchHistory.created_at));
  }

  // Region Detection Cache Methods
  async getDetectionCacheByHash(hash: string): Promise<RegionDetectionCache | undefined> {
    const [record] = await db
      .select()
      .from(regionDetectionCache)
      .where(eq(regionDetectionCache.document_hash, hash));
    return record;
  }

  async createDetectionCache(data: InsertRegionDetectionCache): Promise<RegionDetectionCache> {
    const [record] = await db.insert(regionDetectionCache).values(data).returning();
    return record;
  }

  async updateDetectionCache(id: string, updates: Partial<RegionDetectionCache>): Promise<RegionDetectionCache | undefined> {
    const [record] = await db
      .update(regionDetectionCache)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(regionDetectionCache.id, id))
      .returning();
    return record;
  }

  // Batch Fill Job Methods
  async createBatchFillJob(data: InsertBatchFillJob): Promise<BatchFillJob> {
    const [record] = await db.insert(batchFillJobs).values(data).returning();
    return record;
  }

  async getBatchFillJob(id: string): Promise<BatchFillJob | undefined> {
    const [record] = await db.select().from(batchFillJobs).where(eq(batchFillJobs.id, id));
    return record;
  }

  async getBatchFillJobsByUserId(userId: string): Promise<BatchFillJob[]> {
    return db
      .select()
      .from(batchFillJobs)
      .where(eq(batchFillJobs.user_id, userId))
      .orderBy(desc(batchFillJobs.created_at));
  }

  async updateBatchFillJob(id: string, updates: Partial<BatchFillJob>): Promise<BatchFillJob | undefined> {
    const [record] = await db
      .update(batchFillJobs)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(batchFillJobs.id, id))
      .returning();
    return record;
  }

  async updateBatchFillJobProgress(
    id: string,
    completedCount: number,
    failedCount: number,
    progressPercent: number
  ): Promise<void> {
    const job = await this.getBatchFillJob(id);
    if (!job) return;

    const estimatedTotal = job.data_row_count || 1;
    const processingRate = (completedCount + failedCount) / Math.max(1, estimatedTotal);
    const estimatedSecondsRemaining = processingRate > 0 ? Math.ceil((1 - progressPercent / 100) * 30 / processingRate) : 30;

    await db
      .update(batchFillJobs)
      .set({
        completed_count: completedCount,
        failed_count: failedCount,
        progress_percent: progressPercent,
        estimated_seconds_remaining: estimatedSecondsRemaining,
        updated_at: new Date(),
      })
      .where(eq(batchFillJobs.id, id));
  }

  // Template Learning Methods (updated to use new formTemplates table)
  async findTemplatesByDocumentType(documentType: string): Promise<FormTemplate[]> {
    return db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.document_type, documentType))
      .orderBy(desc(formTemplates.usage_count));
  }

  async getTemplateStats(): Promise<{
    total: number;
    byDocumentType: Record<string, { count: number; avgUsageCount: number; avgSuccessRate: number }>;
    totalUsageCount: number;
    avgSuccessRate: number;
  }> {
    const allTemplates = await db.select().from(formTemplates);

    const stats: Record<string, { count: number; totalUsageCount: number; totalSuccess: number; totalFailure: number }> = {};

    for (const template of allTemplates) {
      if (!stats[template.document_type]) {
        stats[template.document_type] = {
          count: 0,
          totalUsageCount: 0,
          totalSuccess: 0,
          totalFailure: 0,
        };
      }
      stats[template.document_type].count++;
      stats[template.document_type].totalUsageCount += template.usage_count || 0;
      stats[template.document_type].totalSuccess += template.match_success_count || 0;
      stats[template.document_type].totalFailure += template.match_failure_count || 0;
    }

    const byDocumentType: Record<string, { count: number; avgUsageCount: number; avgSuccessRate: number }> = {};
    let totalUsageCount = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;

    for (const [docType, data] of Object.entries(stats)) {
      byDocumentType[docType] = {
        count: data.count,
        avgUsageCount: data.count > 0 ? data.totalUsageCount / data.count : 0,
        avgSuccessRate: (data.totalSuccess + data.totalFailure) > 0 ? data.totalSuccess / (data.totalSuccess + data.totalFailure) : 0,
      };
      totalUsageCount += data.totalUsageCount;
      totalSuccesses += data.totalSuccess;
      totalFailures += data.totalFailure;
    }

    const avgSuccessRate = (totalSuccesses + totalFailures) > 0 ? totalSuccesses / (totalSuccesses + totalFailures) : 0;

    return {
      total: allTemplates.length,
      byDocumentType,
      totalUsageCount,
      avgSuccessRate,
    };
  }
}

export const storage = new DatabaseStorage();
