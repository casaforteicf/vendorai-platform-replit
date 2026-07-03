// ─── Project Opportunity Engine — Quotations ─────────────────────────────────
// Quotation requests and responses between architects and suppliers.

import { pgTable, text, boolean, timestamp, jsonb, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const POE_QUOTATION_STATUS = [
  "draft", "sent", "received", "comparing", "approved", "rejected", "expired",
] as const;

export const poeQuotationRequestsTable = pgTable("poe_quotation_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  tenantId:    text("tenant_id").notNull(),
  projectId:   text("project_id"),
  projectName: text("project_name"),

  // What is being quoted
  items: jsonb("items").$type<Array<{
    opportunityId: string;
    productId?: string;
    productName: string;
    quantity?: number;
    unit?: string;
    notes?: string;
  }>>().default([]),

  // Routing
  vcnCompanyId: text("vcn_company_id"),
  companyName:  text("company_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  region:       text("region"),

  // Request details
  deadline:     timestamp("deadline"),
  notes:        text("notes"),
  attachments:  jsonb("attachments").$type<string[]>().default([]),

  // Status
  status: text("status").notNull().default("draft"),

  // CRM integration
  leadId:        text("lead_id"),
  opportunityId: text("opportunity_id"),
  activityId:    text("activity_id"),

  sentAt:     timestamp("sent_at"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_poe_quot_req_tenant").on(t.tenantId),
  index("idx_poe_quot_req_status").on(t.status),
  index("idx_poe_quot_req_company").on(t.vcnCompanyId),
]);

export const poeQuotationResponsesTable = pgTable("poe_quotation_responses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  requestId: text("request_id")
    .notNull()
    .references(() => poeQuotationRequestsTable.id, { onDelete: "cascade" }),

  vcnCompanyId: text("vcn_company_id"),
  companyName:  text("company_name"),
  respondedBy:  text("responded_by"),

  // Response details
  items: jsonb("items").$type<Array<{
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    unit: string;
    leadTimeDays?: number;
    inStock: boolean;
    notes?: string;
  }>>().default([]),

  totalPrice:   numeric("total_price", { precision: 14, scale: 2 }),
  currency:     text("currency").default("BRL"),
  validUntil:   timestamp("valid_until"),
  leadTimeDays: integer("lead_time_days"),
  notes:        text("notes"),
  attachments:  jsonb("attachments").$type<string[]>().default([]),

  selected:  boolean("selected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_poe_quot_resp_request").on(t.requestId),
]);

export const insertPoeQuotationRequestSchema = createInsertSchema(poeQuotationRequestsTable, {
  tenantId:    z.string().min(1),
  items:       z.array(z.object({
    opportunityId: z.string(),
    productId:    z.string().optional(),
    productName:  z.string(),
    quantity:     z.number().positive().optional(),
    unit:         z.string().optional(),
    notes:        z.string().optional(),
  })).optional(),
  attachments: z.array(z.string()).optional(),
  status:      z.enum(POE_QUOTATION_STATUS).optional(),
});

export const insertPoeQuotationResponseSchema = createInsertSchema(poeQuotationResponsesTable, {
  requestId: z.string().min(1),
  items:     z.array(z.object({
    productId:   z.string().optional(),
    productName: z.string(),
    quantity:    z.number().positive(),
    unitPrice:   z.string(),
    totalPrice:  z.string(),
    unit:        z.string(),
    leadTimeDays:z.number().int().positive().optional(),
    inStock:     z.boolean(),
    notes:       z.string().optional(),
  })).optional(),
  attachments: z.array(z.string()).optional(),
  totalPrice:  z.string().optional(),
  leadTimeDays:z.number().int().positive().optional(),
});

export const selectPoeQuotationRequestSchema  = createSelectSchema(poeQuotationRequestsTable, {
  items:       z.array(z.object({ opportunityId: z.string(), productId: z.string().optional(), productName: z.string(), quantity: z.number().optional(), unit: z.string().optional(), notes: z.string().optional() })),
  attachments: z.array(z.string()),
});
export const selectPoeQuotationResponseSchema = createSelectSchema(poeQuotationResponsesTable, {
  items:       z.array(z.object({ productId: z.string().optional(), productName: z.string(), quantity: z.number(), unitPrice: z.string(), totalPrice: z.string(), unit: z.string(), leadTimeDays: z.number().optional(), inStock: z.boolean(), notes: z.string().optional() })),
  attachments: z.array(z.string()),
});

export type PoeQuotationRequest        = typeof poeQuotationRequestsTable.$inferSelect;
export type InsertPoeQuotationRequest  = typeof poeQuotationRequestsTable.$inferInsert;
export type PoeQuotationResponse       = typeof poeQuotationResponsesTable.$inferSelect;
export type InsertPoeQuotationResponse = typeof poeQuotationResponsesTable.$inferInsert;
