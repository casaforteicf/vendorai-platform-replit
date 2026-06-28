import { pgTable, text, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { tenantsTable } from "./tenants";

export const partnerCommissionsTable = pgTable(
  "partner_commissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo"),
    valorBase: numeric("valor_base", { precision: 10, scale: 2 }),
    percentual: numeric("percentual", { precision: 5, scale: 2 }),
    valor: numeric("valor", { precision: 10, scale: 2 }),
    dataReferencia: date("data_referencia"),
    status: text("status").notNull().default("pendente"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("partner_commissions_partner_idx").on(table.partnerId),
    index("partner_commissions_tenant_idx").on(table.tenantId),
  ]
);

export const insertPartnerCommissionSchema = createInsertSchema(
  partnerCommissionsTable
).omit({ id: true, createdAt: true });

export const updatePartnerCommissionSchema = createSelectSchema(
  partnerCommissionsTable
)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertPartnerCommission = z.infer<typeof insertPartnerCommissionSchema>;
export type PartnerCommission = typeof partnerCommissionsTable.$inferSelect;
