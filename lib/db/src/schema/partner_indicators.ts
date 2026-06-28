import { pgTable, text, numeric, date, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const partnerIndicatorsTable = pgTable(
  "partner_indicators",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partnersTable.id, { onDelete: "cascade" }),
    mesReferencia: date("mes_referencia").notNull(),
    totalClientesAtivos: integer("total_clientes_ativos").notNull().default(0),
    totalComissao: numeric("total_comissao", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => [
    index("partner_indicators_partner_mes_idx").on(
      table.partnerId,
      table.mesReferencia
    ),
  ]
);

export const insertPartnerIndicatorSchema = createInsertSchema(
  partnerIndicatorsTable
).omit({ id: true });

export const updatePartnerIndicatorSchema = createSelectSchema(
  partnerIndicatorsTable
)
  .omit({ id: true })
  .partial();

export type InsertPartnerIndicator = z.infer<typeof insertPartnerIndicatorSchema>;
export type PartnerIndicator = typeof partnerIndicatorsTable.$inferSelect;
