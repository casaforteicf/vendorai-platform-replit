import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { propostasTable } from "./propostas";
import { obrasTable } from "./obras";

export const archProjetosTable = pgTable("arch_projetos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  // Vínculos com o núcleo Vendor.ai. São opcionais para preservar projetos
  // legados, mas quando preenchidos apontam para os registros canônicos do
  // CRM/comercial/obras em vez de criar cadastros paralelos no Arqdor.
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  propostaId: text("proposta_id").references(() => propostasTable.id, { onDelete: "set null" }),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  clienteNome:           varchar("cliente_nome",           { length: 255 }),
  clienteEmail:          varchar("cliente_email",          { length: 255 }),
  clienteTelefone:       varchar("cliente_telefone",       { length: 20  }),
  titulo:                varchar("titulo",                 { length: 255 }).notNull(),
  descricao:             text("descricao"),
  status:                varchar("status",                 { length: 30  }).default("briefing"),
  pipelineStage:         text("pipeline_stage").default("lead"),
  tipoObra:              varchar("tipo_obra",              { length: 50  }),
  areaM2:                numeric("area_m2",                { precision: 8,  scale: 2 }),
  orcamentoTotal:        numeric("orcamento_total",        { precision: 12, scale: 2 }),
  prazoEstimado:         integer("prazo_estimado"),
  arquitetoResponsavel:  varchar("arquiteto_responsavel",  { length: 255 }),
  portalToken:           varchar("portal_token",           { length: 64  }),
  portalAtivo:           boolean("portal_ativo").default(false),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
});

export const insertArchProjetoSchema = createInsertSchema(archProjetosTable, {
  areaM2:         z.coerce.number().nonnegative().optional(),
  orcamentoTotal: z.coerce.number().nonnegative().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchProjetoSchema = createSelectSchema(archProjetosTable, {
  areaM2:         z.coerce.number().nonnegative().optional(),
  orcamentoTotal: z.coerce.number().nonnegative().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertArchProjeto = z.infer<typeof insertArchProjetoSchema>;
export type UpdateArchProjeto = z.infer<typeof updateArchProjetoSchema>;
export type ArchProjeto = typeof archProjetosTable.$inferSelect;
