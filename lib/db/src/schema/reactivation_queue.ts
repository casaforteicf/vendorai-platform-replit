import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dealsTable } from "./deals";

export const reactivationQueueTable = pgTable("reactivation_queue", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: text("status").default("pending"),
  lossReason: text("loss_reason"),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReactivationQueueSchema = createInsertSchema(reactivationQueueTable, {
  scheduledFor: z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type ReactivationQueue = typeof reactivationQueueTable.$inferSelect;
export type InsertReactivationQueue = z.infer<typeof insertReactivationQueueSchema>;
