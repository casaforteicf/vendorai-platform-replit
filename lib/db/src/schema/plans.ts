import { pgTable, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const plansTable = pgTable("plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  implantationPriceCents: integer("implantation_price_cents"),
  monthlyPriceCents: integer("monthly_price_cents"),
  monthlyPriceAnnualCents: integer("monthly_price_annual_cents"),
  aiQuotaUsd: numeric("ai_quota_usd", { precision: 12, scale: 6 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePlanSchema = createSelectSchema(plansTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type UpdatePlan = z.infer<typeof updatePlanSchema>;
export type Plan = typeof plansTable.$inferSelect;
