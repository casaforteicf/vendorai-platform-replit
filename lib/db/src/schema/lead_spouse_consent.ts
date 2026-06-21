import { pgTable, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const leadSpouseConsentTable = pgTable(
  "lead_spouse_consent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    consentGiven: boolean("consent_given").notNull().default(false),
    consentGivenAt: timestamp("consent_given_at"),
    spouseLeadId: text("spouse_lead_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("lead_spouse_consent_lead_id_unique").on(t.leadId)]
);

export const insertLeadSpouseConsentSchema = createInsertSchema(
  leadSpouseConsentTable,
  {
    consentGivenAt: z.coerce.date().optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateLeadSpouseConsentSchema = createSelectSchema(
  leadSpouseConsentTable,
  {
    consentGivenAt: z.coerce.date().optional(),
  }
)
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertLeadSpouseConsent = z.infer<typeof insertLeadSpouseConsentSchema>;
export type UpdateLeadSpouseConsent = z.infer<typeof updateLeadSpouseConsentSchema>;
export type LeadSpouseConsent = typeof leadSpouseConsentTable.$inferSelect;
