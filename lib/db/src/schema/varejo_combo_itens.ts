import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { varejoComboTable } from "./varejo_combos";
import { varejoProdutoTable } from "./varejo_produtos";

export const varejoComboItemTable = pgTable("varejo_combo_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  comboId: text("combo_id").notNull().references(() => varejoComboTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id").references(() => varejoProdutoTable.id, { onDelete: "set null" }),
  tamanho: text("tamanho"),
  cor: text("cor"),
  quantidade: integer("quantidade").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVarejoComboItemSchema = createInsertSchema(varejoComboItemTable)
  .omit({ id: true, createdAt: true });

export type VarejoComboItem = typeof varejoComboItemTable.$inferSelect;
export type InsertVarejoComboItem = z.infer<typeof insertVarejoComboItemSchema>;
