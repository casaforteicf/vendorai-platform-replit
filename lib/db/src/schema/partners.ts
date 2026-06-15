import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnersTable = pgTable("partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  cnpj: text("cnpj").notNull().unique(),
  phone: text("phone").notNull(),
  userId: text("user_id").notNull(),
  asaasAccountId: text("asaas_account_id"),
  asaasWalletId: text("asaas_wallet_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({
  id: true,
  createdAt: true,
  asaasAccountId: true,
  asaasWalletId: true,
});

export const updatePartnerSchema = createSelectSchema(partnersTable)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partnersTable.$inferSelect;
