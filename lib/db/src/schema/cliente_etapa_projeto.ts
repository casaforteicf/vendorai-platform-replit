import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

// Tabela genérica (não exclusiva do Obras Hub) para registrar em que "etapa" um
// cliente/lead está em relação a um projeto/jornada de compra. Preenchida pela IA
// (texto livre) a partir da conversa — ex: Revenue Scout "sequencia_produto" usa
// isso para saber quando reconsiderar uma oferta adiada.
export const clienteEtapaProjetoTable = pgTable(
  "cliente_etapa_projeto",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    etapaAtual: text("etapa_atual").notNull(),
    atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
  },
  (table) => ({
    tenantLeadIdx: uniqueIndex("cliente_etapa_projeto_tenant_lead_idx").on(
      table.tenantId,
      table.leadId,
    ),
  }),
);

export const insertClienteEtapaProjetoSchema = createInsertSchema(clienteEtapaProjetoTable).omit({
  id: true,
});

export const updateClienteEtapaProjetoSchema = createSelectSchema(clienteEtapaProjetoTable)
  .omit({ id: true, tenantId: true, leadId: true })
  .partial();

export type InsertClienteEtapaProjeto = z.infer<typeof insertClienteEtapaProjetoSchema>;
export type UpdateClienteEtapaProjeto = z.infer<typeof updateClienteEtapaProjetoSchema>;
export type ClienteEtapaProjeto = typeof clienteEtapaProjetoTable.$inferSelect;
