import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const intelligenceAnalysisLogTable = pgTable("intelligence_analysis_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  tokensUsed: integer("tokens_used").notNull().default(0),
  churnRisk: integer("churn_risk"),
  triggeredBy: text("triggered_by").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectIntelligenceAnalysisLogSchema = createSelectSchema(
  intelligenceAnalysisLogTable,
  {
    createdAt: z.coerce.date(),
  }
);

export type IntelligenceAnalysisLog =
  typeof intelligenceAnalysisLogTable.$inferSelect;
