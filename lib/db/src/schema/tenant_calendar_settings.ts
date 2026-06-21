import { pgTable, text, timestamp, integer, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export type CommercialDate = {
  name: string;
  active: boolean;
  daysBeforeToSend: number;
  targetGender?: string;
  movableDate?: boolean;
  month?: number;
  day?: number;
};

export const tenantCalendarSettingsTable = pgTable(
  "tenant_calendar_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    commercialDates: jsonb("commercial_dates")
      .$type<CommercialDate[]>()
      .notNull()
      .default([]),
    enableSpouseGiftFlow: boolean("enable_spouse_gift_flow").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("tenant_calendar_settings_tenant_id_unique").on(t.tenantId)]
);

export const insertTenantCalendarSettingsSchema = createInsertSchema(
  tenantCalendarSettingsTable,
  {
    commercialDates: z.array(
      z.object({
        name: z.string(),
        active: z.boolean(),
        daysBeforeToSend: z.number().int().min(0).max(30),
        targetGender: z.string().optional(),
        movableDate: z.boolean().optional(),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
      })
    ).optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateTenantCalendarSettingsSchema = createSelectSchema(
  tenantCalendarSettingsTable,
  {
    commercialDates: z.array(
      z.object({
        name: z.string(),
        active: z.boolean(),
        daysBeforeToSend: z.number().int().min(0).max(30),
        targetGender: z.string().optional(),
        movableDate: z.boolean().optional(),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
      })
    ).optional(),
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertTenantCalendarSettings = z.infer<typeof insertTenantCalendarSettingsSchema>;
export type UpdateTenantCalendarSettings = z.infer<typeof updateTenantCalendarSettingsSchema>;
export type TenantCalendarSettings = typeof tenantCalendarSettingsTable.$inferSelect;
