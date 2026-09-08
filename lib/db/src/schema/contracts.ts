import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";

export interface ContractObligation {
  id?: string;
  title: string;
  dueAt?: string | null;
  owner?: string | null;
  status?: "pending" | "completed" | "waived" | string;
  notes?: string | null;
}

export interface ContractRiskClause {
  id?: string;
  title: string;
  summary?: string | null;
  severity?: "low" | "medium" | "high" | "critical" | string;
  sourceReference?: string | null;
}

export const contractsTable = pgTable("contracts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  contractType: text("contract_type"),
  status: text("status").notNull().default("pending_signature"),
  zapsignDocId: text("zapsign_doc_id"),
  zapsignSignUrl: text("zapsign_sign_url"),
  pdfUrl: text("pdf_url"),
  sentAt: timestamp("sent_at"),
  signedAt: timestamp("signed_at"),

  // Ciclo de vida contratual. Todos os campos são opcionais para manter
  // compatibilidade com contratos históricos que só registravam assinatura/PDF.
  effectiveAt: timestamp("effective_at"),
  expiresAt: timestamp("expires_at"),
  renewalType: text("renewal_type"), // none | manual | automatic
  renewalNoticeDays: integer("renewal_notice_days"),
  nextAdjustmentAt: timestamp("next_adjustment_at"),
  adjustmentIndex: text("adjustment_index"),
  obligations: jsonb("obligations").$type<ContractObligation[]>(),
  riskClauses: jsonb("risk_clauses").$type<ContractRiskClause[]>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contractsTable, {
  sentAt: z.coerce.date().optional(),
  signedAt: z.coerce.date().optional(),
  effectiveAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  nextAdjustmentAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateContractSchema = createSelectSchema(contractsTable, {
  sentAt: z.coerce.date().optional(),
  signedAt: z.coerce.date().optional(),
  effectiveAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  nextAdjustmentAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertContract = z.infer<typeof insertContractSchema>;
export type UpdateContract = z.infer<typeof updateContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
