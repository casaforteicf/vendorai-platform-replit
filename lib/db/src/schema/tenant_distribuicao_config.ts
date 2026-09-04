import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

/**
 * Ordem de prioridade dos critérios de distribuição automática de lead pra
 * vendedor (pickNextVendedor, artifacts/api-server/src/lib/round-robin.ts).
 *
 * Hoje só existem dois critérios: "segmento" (linha de produto,
 * leads.mercadoSegmento x users.leadAssignmentSegments) e "territorio"
 * (cidade → região → raio → geral, já cascateados internamente). Sem linha
 * configurada pro tenant, o motor usa a ordem padrão ["segmento",
 * "territorio"] — segmento restringe primeiro, território desempata dentro
 * do grupo (é o caso "loja de peças: vendedor de óleo vs vendedor de peça,
 * dentro da mesma linha ainda separa por região").
 *
 * Array pensado pra crescer sem migration nova: um terceiro critério (ex:
 * "carteira") só precisa de um novo case no motor, não de coluna nova aqui.
 */
export const tenantDistribuicaoConfigTable = pgTable("tenant_distribuicao_config", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  criterios: jsonb("criterios").$type<string[]>().notNull().default(["segmento", "territorio"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantDistribuicaoConfigSchema = createInsertSchema(tenantDistribuicaoConfigTable, {
  criterios: z.array(z.enum(["segmento", "territorio"])),
}).omit({
  createdAt: true,
  updatedAt: true,
});

export const updateTenantDistribuicaoConfigSchema = createSelectSchema(tenantDistribuicaoConfigTable, {
  criterios: z.array(z.enum(["segmento", "territorio"])),
})
  .omit({ tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertTenantDistribuicaoConfig = z.infer<typeof insertTenantDistribuicaoConfigSchema>;
export type UpdateTenantDistribuicaoConfig = z.infer<typeof updateTenantDistribuicaoConfigSchema>;
export type TenantDistribuicaoConfig = typeof tenantDistribuicaoConfigTable.$inferSelect;
