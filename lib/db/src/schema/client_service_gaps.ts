import {
  pgTable,
  varchar,
  text,
  timestamp,
  date,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const clientServiceGapsTable = pgTable("client_service_gaps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  servicoOuProduto:        varchar("servico_ou_produto",         { length: 255 }),
  ultimaCompra:            date("ultima_compra"),
  proximaRecompraEstimada: date("proxima_recompra_estimada"),
  diasAtraso:              integer("dias_atraso").default(0),
  valorEstimado:           numeric("valor_estimado",             { precision: 10, scale: 2 }),
  updatedAt:               timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientServiceGapSchema = createInsertSchema(clientServiceGapsTable, {
  valorEstimado: z.coerce.number().nonnegative().optional(),
  diasAtraso:    z.coerce.number().int().optional(),
}).omit({ id: true, updatedAt: true });

export const updateClientServiceGapSchema = createSelectSchema(clientServiceGapsTable, {
  valorEstimado: z.coerce.number().nonnegative().optional(),
  diasAtraso:    z.coerce.number().int().optional(),
})
  .omit({ id: true, tenantId: true, updatedAt: true })
  .partial();

export type InsertClientServiceGap = z.infer<typeof insertClientServiceGapSchema>;
export type UpdateClientServiceGap = z.infer<typeof updateClientServiceGapSchema>;
export type ClientServiceGap       = typeof clientServiceGapsTable.$inferSelect;
