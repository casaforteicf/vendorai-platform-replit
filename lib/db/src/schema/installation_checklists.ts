import { pgTable, text, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const installationChecklistTemplatesTable = pgTable("installation_checklist_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  segmentKey: text("segment_key"),
  nicheKey: text("niche_key"),
  categoryKey: text("category_key"),
  productId: text("product_id"),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
  checks: jsonb("checks").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ix_installation_template_scope").on(t.tenantId, t.productId, t.categoryKey, t.active),
]);

export const installationVisitsTable = pgTable("installation_visits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  workCardId: text("work_card_id").notNull(),
  visitNumber: integer("visit_number").notNull().default(1),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  teamUserIds: jsonb("team_user_ids").$type<string[]>().notNull().default([]),
  responsibleId: text("responsible_id").references(() => usersTable.id, { onDelete: "set null" }),
  receiverName: text("receiver_name"),
  receiverDocument: text("receiver_document"),
  receiverRelationship: text("receiver_relationship"),
  customerAcceptanceStatus: text("customer_acceptance_status").notNull().default("pending"),
  customerSignatureUrl: text("customer_signature_url"),
  companySignatureUrl: text("company_signature_url"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ix_installation_visits_card").on(t.tenantId, t.workCardId, t.visitNumber),
]);

export const installationChecklistItemsTable = pgTable("installation_checklist_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  visitId: text("visit_id").notNull(),
  workCardId: text("work_card_id").notNull(),
  sourceItemKey: text("source_item_key").notNull(),
  sourceItemIndex: integer("source_item_index").notNull(),
  unitIndex: integer("unit_index"),
  productId: text("product_id"),
  sku: text("sku"),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  location: text("location"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
  checks: jsonb("checks").$type<Array<Record<string, unknown>>>().notNull().default([]),
  status: text("status").notNull().default("pending"),
  observation: text("observation"),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  required: boolean("required").notNull().default(true),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ix_installation_items_visit").on(t.tenantId, t.visitId, t.status),
  index("ix_installation_items_card").on(t.tenantId, t.workCardId, t.sourceItemIndex),
]);

export const installationOccurrencesTable = pgTable("installation_occurrences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  workCardId: text("work_card_id").notNull(),
  visitId: text("visit_id").notNull(),
  checklistItemId: text("checklist_item_id"),
  type: text("type").notNull(),
  status: text("status").notNull().default("open"),
  description: text("description"),
  responsibleId: text("responsible_id").references(() => usersTable.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at"),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ix_installation_occurrences_card").on(t.tenantId, t.workCardId, t.status),
  index("ix_installation_occurrences_item").on(t.tenantId, t.checklistItemId, t.status),
]);

export const insertInstallationTemplateSchema = createInsertSchema(installationChecklistTemplatesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const updateInstallationTemplateSchema = createSelectSchema(installationChecklistTemplatesTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertInstallationVisitSchema = createInsertSchema(installationVisitsTable, {
  scheduledAt: z.coerce.date().optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const updateInstallationVisitSchema = createSelectSchema(installationVisitsTable, {
  scheduledAt: z.coerce.date().optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
}).omit({ id: true, tenantId: true, workCardId: true, visitNumber: true, createdAt: true, updatedAt: true }).partial();

export const updateInstallationChecklistItemSchema = createSelectSchema(installationChecklistItemsTable, {
  completedAt: z.coerce.date().optional(),
}).pick({
  status: true, observation: true, location: true, attributes: true, checks: true,
  evidenceRequired: true, required: true, completedAt: true, completedBy: true,
}).partial();

export const insertInstallationOccurrenceSchema = createInsertSchema(installationOccurrencesTable, {
  dueAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });