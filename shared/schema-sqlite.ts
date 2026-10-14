/**
 * schema-sqlite.ts — SQLite schema for PdfEzFill Desktop
 *
 * Mirrors shared/schema.ts but uses drizzle-orm/sqlite-core instead of pg-core.
 * Only the tables the desktop app actually needs are included.
 * Email automation tables are omitted (all no-ops in desktop mode).
 */

import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Helper: UUID default ─────────────────────────────────────────────────────
// SQLite has no gen_random_uuid(); we use a JS default function
const uuidDefault = () => crypto.randomUUID();

// ─── Plan types ───────────────────────────────────────────────────────────────
export const planTypes = ["none", "pro", "pro_plus", "team"] as const;
export type PlanType = typeof planTypes[number];

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  planType: text("plan_type").default("none").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  subscriptionStatus: text("subscription_status"),
  subscriptionStartDate: integer("subscription_start_date", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  formsIncludedPerMonth: integer("forms_included_per_month").default(0),
  defaultProfileId: text("default_profile_id"),
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  inactivityEmailSent: integer("inactivity_email_sent", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").notNull().references(() => users.id),
  label: text("label").default("Default"),
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  employer: text("employer"),
  jobTitle: text("job_title"),
  ssn: text("ssn"),
  driversLicense: text("drivers_license"),
  signatureData: text("signature_data"),
  customFields: text("custom_fields", { mode: "json" }).$type<Record<string, string>>(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Form field schema types (shared with pg schema) ─────────────────────────
export const formFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "email", "phone", "checkbox", "radio", "textarea", "signature", "table"]),
  page: z.number(),
  bbox: z.array(z.number()),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  value: z.string().optional(),
  confidence: z.number().optional(),
  isManuallyAdded: z.boolean().optional(),
  isEdited: z.boolean().optional(),
  tableColumns: z.array(z.string()).optional(),
  tableRows: z.array(z.record(z.string())).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const fieldOverrideSchema = z.object({
  fieldId: z.string(),
  action: z.enum(["add", "edit", "delete"]),
  originalField: formFieldSchema.optional(),
  modifiedField: formFieldSchema.optional(),
  timestamp: z.string(),
});
export type FieldOverride = z.infer<typeof fieldOverrideSchema>;

// ─── Forms ────────────────────────────────────────────────────────────────────
export const forms = sqliteTable("forms", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").references(() => users.id),
  guestEmail: text("guest_email"),
  profileId: text("profile_id").references(() => profiles.id),
  originalPdfPath: text("original_pdf_path").notNull(),
  generatedPdfPath: text("generated_pdf_path"),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name"),
  pageCount: integer("page_count").default(1),
  fieldSchema: text("field_schema", { mode: "json" }).$type<FormField[]>(),
  fieldOverrides: text("field_overrides", { mode: "json" }).$type<FieldOverride[]>(),
  answers: text("answers", { mode: "json" }).$type<Record<string, string>>(),
  signatureData: text("signature_data"),
  status: text("status").default("uploaded").notNull(),
  ocrConfidence: real("ocr_confidence"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  isPaid: integer("is_paid", { mode: "boolean" }).default(false),
  paymentType: text("payment_type"),
  paymentAmount: integer("payment_amount"),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  parentFormId: text("parent_form_id"),
  isRegeneration: integer("is_regeneration", { mode: "boolean" }).default(false),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  abandonmentEmailSent: integer("abandonment_email_sent", { mode: "timestamp" }),
  expiryReminderSent: integer("expiry_reminder_sent", { mode: "timestamp" }),
  matched_template_id: text("matched_template_id"),
  template_match_confidence: real("template_match_confidence"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => [
  index("IDX_forms_user_id").on(table.userId),
  index("IDX_forms_status_created").on(table.status, table.createdAt),
]);

// ─── Usage tracking ───────────────────────────────────────────────────────────
export const usageTracking = sqliteTable("usage_tracking", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").notNull().references(() => users.id),
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  formsUsed: integer("forms_used").default(0),
  formsIncluded: integer("forms_included").default(2),
  overageFormsPurchased: integer("overage_forms_purchased").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").references(() => users.id),
  formId: text("form_id").references(() => forms.id),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  stripePriceId: text("stripe_price_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").default("usd"),
  type: text("type").notNull(),
  status: text("status").default("pending"),
  refundedAt: integer("refunded_at", { mode: "timestamp" }),
  refundReason: text("refund_reason"),
  refundedBy: text("refunded_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Admin logs ───────────────────────────────────────────────────────────────
export const adminLogs = sqliteTable("admin_logs", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  adminId: text("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: text("details", { mode: "json" }).$type<Record<string, any>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Detected fields ─────────────────────────────────────────────────────────
export const detectedFields = sqliteTable("detected_fields", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  fieldType: text("field_type").notNull(),
  bboxX: real("bbox_x").notNull(),
  bboxY: real("bbox_y").notNull(),
  bboxWidth: real("bbox_width").notNull(),
  bboxHeight: real("bbox_height").notNull(),
  confidence: real("confidence").notNull().default(0.0),
  state: text("state"),
  label: text("label"),
  subtype: text("subtype"),
  page: integer("page").notNull().default(0),
  detectionMethod: text("detection_method").notNull().default("opencv"),
  userVerified: integer("user_verified", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => [
  index("IDX_detected_fields_form").on(table.formId),
  index("IDX_detected_fields_type").on(table.fieldType),
]);

// ─── Relations ────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(profiles),
  forms: many(forms),
  payments: many(payments),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  user: one(users, { fields: [forms.userId], references: [users.id] }),
  profile: one(profiles, { fields: [forms.profileId], references: [profiles.id] }),
  detectedFields: many(detectedFields),
}));

export const detectedFieldsRelations = relations(detectedFields, ({ one }) => ({
  form: one(forms, { fields: [detectedFields.formId], references: [forms.id] }),
}));

// ─── Insert schemas (used by storage.ts) ─────────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFormSchema = createInsertSchema(forms).omit({ id: true, createdAt: true });
export const insertDetectedFieldSchema = createInsertSchema(detectedFields).omit({ id: true, createdAt: true, updatedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Form = typeof forms.$inferSelect;
export type InsertForm = z.infer<typeof insertFormSchema>;
export type DetectedFieldRecord = typeof detectedFields.$inferSelect;
export type InsertDetectedField = z.infer<typeof insertDetectedFieldSchema>;

// ─── Email automation stub types (no-ops in desktop mode) ────────────────────
// These are re-exported so any code that imports from schema still compiles
export const emailTemplateTypes = ["transactional", "marketing", "onboarding", "notification"] as const;
export type EmailTemplateType = typeof emailTemplateTypes[number];
export const emailTriggerTypes = ["signup", "form_upload", "form_completed", "payment_failed", "inactivity"] as const;
export type EmailTriggerType = typeof emailTriggerTypes[number];

// Stub tables for email (desktop mode skips these but storage.ts may reference them)
export const emailTemplates = sqliteTable("email_templates", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  type: text("type").default("transactional"),
  triggerEvent: text("trigger_event"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const emailQueue = sqliteTable("email_queue", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").references(() => users.id),
  toEmail: text("to_email").notNull(),
  subject: text("subject"),
  htmlContent: text("html_content"),
  status: text("status").default("pending"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Email sequences (stub tables — desktop mode no-ops) ─────────────────────
export const emailSequences = sqliteTable("email_sequences", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  name: text("name").notNull(),
  triggerEvent: text("trigger_event"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const emailPreferences = sqliteTable("email_preferences", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  transactionalEnabled: integer("transactional_enabled", { mode: "boolean" }).default(true),
  marketingEnabled: integer("marketing_enabled", { mode: "boolean" }).default(true),
  onboardingEnabled: integer("onboarding_enabled", { mode: "boolean" }).default(true),
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" }).default(true),
  unsubscribeToken: text("unsubscribe_token").$defaultFn(uuidDefault),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }),
  unsubscribeReason: text("unsubscribe_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Region indexes (template-matching engine) ────────────────────────────────
export const regionIndexes = sqliteTable("region_indexes", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  document_type: text("document_type").notNull(),
  region_label: text("region_label").notNull(),
  page_number: integer("page_number").notNull(),
  relative_position: text("relative_position", { mode: "json" }).$type<Record<string, number>>(),
  confidence: real("confidence").notNull().default(0.85),
  variant_tolerance: real("variant_tolerance").notNull().default(0.15),
  field_schema: text("field_schema", { mode: "json" }).$type<any[]>().notNull(),
  relationships: text("relationships", { mode: "json" }).$type<any[]>().notNull().$defaultFn(() => []),
  layout_signature: text("layout_signature").notNull(),
  usage_count: integer("usage_count").notNull().default(0),
  last_used_at: integer("last_used_at", { mode: "timestamp" }),
  was_corrected_count: integer("was_corrected_count").default(0),
  is_locked: integer("is_locked", { mode: "boolean" }).default(false),
  created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => [
  index("idx_region_layout_sig").on(table.layout_signature),
  index("idx_region_doc_type").on(table.document_type),
]);

export const regionMatchHistory = sqliteTable("region_match_history", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  form_id: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  region_index_id: text("region_index_id").notNull().references(() => regionIndexes.id, { onDelete: "cascade" }),
  match_confidence: real("match_confidence").notNull(),
  match_method: text("match_method"),
  was_corrected: integer("was_corrected", { mode: "boolean" }).default(false),
  correction_data: text("correction_data", { mode: "json" }).$type<Record<string, any>>(),
  page_number: integer("page_number"),
  detected_region_bounds: text("detected_region_bounds", { mode: "json" }).$type<Record<string, number>>(),
  expected_region_bounds: text("expected_region_bounds", { mode: "json" }).$type<Record<string, number>>(),
  created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const regionDetectionCache = sqliteTable("region_detection_cache", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  document_hash: text("document_hash").notNull().unique(),
  document_type: text("document_type"),
  region_indexes: text("region_indexes", { mode: "json" }).$type<string[]>().notNull(),
  cache_confidence: real("cache_confidence"),
  created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Batch fill jobs ──────────────────────────────────────────────────────────
export const batchFillJobs = sqliteTable("batch_fill_jobs", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  template_form_id: text("template_form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("processing"),
  data_row_count: integer("data_row_count").notNull(),
  columns_mapped: text("columns_mapped", { mode: "json" }).$type<Record<string, string>>().notNull(),
  completed_count: integer("completed_count").default(0),
  failed_count: integer("failed_count").default(0),
  output_zip_url: text("output_zip_url"),
  error_message: text("error_message"),
  progress_percent: integer("progress_percent").default(0),
  estimated_seconds_remaining: integer("estimated_seconds_remaining"),
  started_at: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completed_at: integer("completed_at", { mode: "timestamp" }),
  created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Form templates (template learning service) ───────────────────────────────
export const formTemplates = sqliteTable("form_templates", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  user_id: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  document_type: text("document_type").notNull(),
  layout_hash: text("layout_hash").notNull().unique(),
  field_count: integer("field_count").notNull(),
  field_schema: text("field_schema", { mode: "json" }).$type<any[]>().notNull(),
  example_form_id: text("example_form_id").references(() => forms.id, { onDelete: "set null" }),
  usage_count: integer("usage_count").default(0),
  last_used_at: integer("last_used_at", { mode: "timestamp" }),
  match_success_count: integer("match_success_count").default(0),
  match_failure_count: integer("match_failure_count").default(0),
  created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── E-sign audit logs ────────────────────────────────────────────────────────
export const esignAuditLogs = sqliteTable("esign_audit_logs", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  formId: text("form_id").notNull().references(() => forms.id),
  userId: text("user_id").references(() => users.id),
  guestEmail: text("guest_email"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip").notNull(),
  userAgent: text("user_agent"),
  originalDocumentHash: text("original_document_hash").notNull(),
  signedDocumentHash: text("signed_document_hash"),
  signedAt: text("signed_at").notNull(),
  signatureMethod: text("signature_method").notNull().default("draw"),
  consentStatement: text("consent_statement").notNull().default(
    "By signing, I agree that this electronic signature is the legal equivalent of my handwritten signature."
  ),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Additional insert schemas ────────────────────────────────────────────────
export const insertUsageTrackingSchema = createInsertSchema(usageTracking).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({ id: true, createdAt: true });
export const insertEmailPreferencesSchema = createInsertSchema(emailPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailSequenceSchema = createInsertSchema(emailSequences).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertUsageTracking = z.infer<typeof insertUsageTrackingSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;
export type InsertEmailPreference = z.infer<typeof insertEmailPreferencesSchema>;
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;

export type UsageTracking = typeof usageTracking.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AdminLog = typeof adminLogs.$inferSelect;
export type EmailPreference = typeof emailPreferences.$inferSelect;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type RegionIndex = typeof regionIndexes.$inferSelect;
export type InsertRegionIndex = typeof regionIndexes.$inferInsert;
export type RegionMatch = typeof regionMatchHistory.$inferSelect;
export type InsertRegionMatch = typeof regionMatchHistory.$inferInsert;
export type RegionDetectionCache = typeof regionDetectionCache.$inferSelect;
export type InsertRegionDetectionCache = typeof regionDetectionCache.$inferInsert;
export type BatchFillJob = typeof batchFillJobs.$inferSelect;
export type InsertBatchFillJob = typeof batchFillJobs.$inferInsert;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type InsertFormTemplate = typeof formTemplates.$inferInsert;
export type EsignAuditLog = typeof esignAuditLogs.$inferSelect;

// ─── API response types ───────────────────────────────────────────────────────
export type FormWithStatus = Form & {
  canDownload: boolean;
  remainingRetries: number;
  canRegenerate: boolean;
};

export type UsageSummary = {
  formsUsed: number;
  formsIncluded: number;
  formsRemaining: number;
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
  overagePrice: number;
};

// ─── Upsert user type ─────────────────────────────────────────────────────────
export type UpsertUser = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
};

// ─── Plan configs (desktop = unlimited, lifetime license) ────────────────────
export type PlanInfo = {
  planType: PlanType;
  formsIncluded: number;
  overagePrice: number;
  features: string[];
};

export const planConfigs: Record<PlanType, PlanInfo> = {
  none: {
    planType: "none",
    formsIncluded: 0,
    overagePrice: 0,
    features: ["Fill any PDF form", "Digital signature", "Instant download"],
  },
  pro: {
    planType: "pro",
    formsIncluded: 999999,
    overagePrice: 0,
    features: ["Unlimited forms", "Autofill from profile", "Saved signature", "Full history"],
  },
  pro_plus: {
    planType: "pro_plus",
    formsIncluded: 999999,
    overagePrice: 0,
    features: ["Unlimited forms", "Multiple profiles", "All Pro features"],
  },
  team: {
    planType: "team",
    formsIncluded: 999999,
    overagePrice: 0,
    features: ["Unlimited forms", "All features"],
  },
};

// ─── Region type encoding (re-exported for compatibility) ─────────────────────
export type RegionType = 
  | "personal_information" | "contact_information" | "address_block"
  | "employment_information" | "financial_information" | "payment_table"
  | "signature_area" | "checkbox_group" | "radio_group" | "text_block"
  | "header_block" | "barcode_area" | "table" | "section_divider";

export const REGION_TYPE_ENCODING: Record<RegionType, number> = {
  personal_information: 0, contact_information: 1, address_block: 2,
  employment_information: 3, financial_information: 4, payment_table: 5,
  signature_area: 6, checkbox_group: 7, radio_group: 8, text_block: 9,
  header_block: 10, barcode_area: 11, table: 12, section_divider: 13,
};

export function decodeRegionType(id: number): RegionType {
  const entries = Object.entries(REGION_TYPE_ENCODING);
  const found = entries.find(([, value]) => value === id);
  if (!found) throw new Error(`Unknown region type ID: ${id}`);
  return found[0] as RegionType;
}

// ─── System metrics (added 2026-10-14, defect 8a) ─────────────────────────────
// server/metricsService.ts imports systemMetrics from @shared/schema, which
// re-exports this file; the table was missing here, so every metrics import
// resolved to undefined. SQLite port of the web (pg) system_metrics table.
export const systemMetrics = sqliteTable("system_metrics", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  date: integer("date", { mode: "timestamp" }).notNull(),
  metricType: text("metric_type").notNull(),
  totalCount: integer("total_count").default(0),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  avgValue: real("avg_value"),
  minValue: real("min_value"),
  maxValue: real("max_value"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => [index("IDX_system_metrics_date_type").on(table.date, table.metricType)]);
export const insertSystemMetricsSchema = createInsertSchema(systemMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = z.infer<typeof insertSystemMetricsSchema>;

// ─── Email sequence steps / events / enrollments (added 2026-10-14, defect 8a) ──
// server/emailAutomation.ts imports these tables and types from
// @shared/schema; they were missing from this SQLite schema, so the module
// could not typecheck and db.query.* had no such relations. SQLite ports of
// the web (pg) tables, plus the enrollment progress columns the desktop
// consumer actually writes (enrolledAt, currentStepOrder, nextStepAt,
// emailsSent, lastProcessedAt). The pre-existing email tables in this file
// are slim desktop stubs, so these are metadata for import resolution; the
// desktop routes use emailAutomation-desktop.ts no-op stubs at runtime.
export const emailSequenceSteps = sqliteTable("email_sequence_steps", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  sequenceId: text("sequence_id").notNull().references(() => emailSequences.id),
  templateId: text("template_id").notNull().references(() => emailTemplates.id),
  stepOrder: integer("step_order").notNull(),
  delayMinutes: integer("delay_minutes").default(0),
  delayDays: integer("delay_days").default(0),
  conditions: text("conditions", { mode: "json" }).$type<Record<string, any>>(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
export const insertEmailSequenceStepSchema = createInsertSchema(emailSequenceSteps).omit({ id: true, createdAt: true });
export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type InsertEmailSequenceStep = z.infer<typeof insertEmailSequenceStepSchema>;

export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  queueId: text("queue_id").references(() => emailQueue.id),
  userId: text("user_id").references(() => users.id),
  email: text("email").notNull(),
  mailerSendMessageId: text("mailersend_message_id"),
  eventType: text("event_type").notNull(),
  eventData: text("event_data", { mode: "json" }).$type<Record<string, any>>(),
  clickedUrl: text("clicked_url"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => [
  index("IDX_email_events_user").on(table.userId),
  index("IDX_email_events_message").on(table.mailerSendMessageId),
]);
export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({ id: true, createdAt: true });
export type EmailEvent = typeof emailEvents.$inferSelect;
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;

export const sequenceEnrollments = sqliteTable("sequence_enrollments", {
  id: text("id").primaryKey().$defaultFn(uuidDefault),
  userId: text("user_id").references(() => users.id),
  email: text("email").notNull(),
  sequenceId: text("sequence_id").notNull().references(() => emailSequences.id),
  currentStepId: text("current_step_id").references(() => emailSequenceSteps.id),
  currentStepOrder: integer("current_step_order").default(0),
  status: text("status").default("active").notNull(),
  enrolledAt: integer("enrolled_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  nextStepAt: integer("next_step_at", { mode: "timestamp" }),
  emailsSent: integer("emails_sent").default(0),
  startedAt: integer("started_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  lastEmailSentAt: integer("last_email_sent_at", { mode: "timestamp" }),
  lastProcessedAt: integer("last_processed_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => [
  index("IDX_sequence_enrollments_user").on(table.userId),
  index("IDX_sequence_enrollments_sequence").on(table.sequenceId),
  index("IDX_sequence_enrollments_status").on(table.status),
]);
export const insertSequenceEnrollmentSchema = createInsertSchema(sequenceEnrollments).omit({ id: true, createdAt: true });
export type SequenceEnrollment = typeof sequenceEnrollments.$inferSelect;
export type InsertSequenceEnrollment = z.infer<typeof insertSequenceEnrollmentSchema>;

// Derived types for the pre-existing email tables (also missing, defect 8a):
// emailAutomation.ts imports EmailTemplate / InsertEmailTemplate and
// EmailQueueItem / InsertEmailQueueItem from @shared/schema.
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({ id: true, createdAt: true });
export type EmailQueueItem = typeof emailQueue.$inferSelect;
export type InsertEmailQueueItem = z.infer<typeof insertEmailQueueSchema>;
