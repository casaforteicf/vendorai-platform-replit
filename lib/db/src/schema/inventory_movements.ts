import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { inventoryItemsTable } from "./inventory_items";
import { usersTable } from "./users";

export const movimentacaoTipoEnum = pgEnum("movimentacao_tipo", [
  "entrada",
  "saida",
  "ajuste",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal value"));

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  inventoryItemId: text("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  tipo: movimentacaoTipoEnum("tipo").notNull(),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
  motivo: text("motivo").notNull(),
  referenciaId: text("referencia_id"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInventoryMovementSchema = createInsertSchema(
  inventoryMovementsTable,
  {
    quantidade: decimalField,
    tipo: z.enum(["entrada", "saida", "ajuste"]),
  }
).omit({ id: true, createdAt: true });

export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
