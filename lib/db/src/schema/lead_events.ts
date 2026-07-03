import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";

export const leadEventsTable = pgTable("lead_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  descricao: text("descricao").notNull(),
  scoreBoost: integer("score_boost").default(0),
  expiresAt: timestamp("expires_at"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadEvent = typeof leadEventsTable.$inferSelect;
