import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dealsTable } from "./deals";

export const paymentCompositionFormaEnum = pgEnum("payment_composition_forma", [
  "pix",
  "cartao_credito",
  "cartao_debito",
  "dinheiro",
  "boleto",
  "transferencia",
  "outro",
]);

export const paymentCompositionsTable = pgTable("payment_compositions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => dealsTable.id, { onDelete: "cascade" }),
  forma: paymentCompositionFormaEnum("forma").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  comprovanteUrl: text("comprovante_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const valorField = z
  .union([z.number(), z.string()])
  .transform((v) => String(v));

export const insertPaymentCompositionSchema = createInsertSchema(
  paymentCompositionsTable,
  { valor: valorField }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updatePaymentCompositionSchema = createSelectSchema(
  paymentCompositionsTable,
  { valor: valorField }
)
  .omit({ id: true, dealId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertPaymentComposition = z.infer<typeof insertPaymentCompositionSchema>;
export type UpdatePaymentComposition = z.infer<typeof updatePaymentCompositionSchema>;
export type PaymentComposition = typeof paymentCompositionsTable.$inferSelect;
