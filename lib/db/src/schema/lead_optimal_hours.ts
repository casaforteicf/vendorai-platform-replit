import { pgTable, text, timestamp, integer, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";

export const leadOptimalHoursTable = pgTable(
  "lead_optimal_hours",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    optimalHour: integer("optimal_hour"),
    confidence: real("confidence").notNull().default(0.5),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("lead_optimal_hours_lead_unique").on(t.leadId)]
);

export const insertLeadOptimalHoursSchema = createInsertSchema(
  leadOptimalHoursTable
).omit({ id: true });

export const selectLeadOptimalHoursSchema = createSelectSchema(
  leadOptimalHoursTable
);

export type InsertLeadOptimalHours = z.infer<typeof insertLeadOptimalHoursSchema>;
export type LeadOptimalHours = typeof leadOptimalHoursTable.$inferSelect;
