import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const consentsTable = pgTable("consents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  consentGivenAt: timestamp("consent_given_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConsentSchema = createInsertSchema(consentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertConsent = z.infer<typeof insertConsentSchema>;
export type Consent = typeof consentsTable.$inferSelect;
