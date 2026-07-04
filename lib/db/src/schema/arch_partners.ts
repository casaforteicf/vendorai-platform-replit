import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ─── Partner Directory ────────────────────────────────────────────────────────
// Diretório de parceiros do escritório: fornecedores, fabricantes, representantes, lojas.
export const archPartnersTable = pgTable("arch_partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:          text("nome").notNull(),
  tipo:          text("tipo").notNull().default("fornecedor"), // fornecedor|fabricante|representante|loja
  contato:       text("contato"),   // nome do contato principal
  email:         text("email"),
  telefone:      text("telefone"),
  website:       text("website"),
  cidade:        text("cidade"),
  estado:        text("estado"),
  prazoDias:     integer("prazo_dias"),          // prazo de entrega em dias
  prazoDescricao:text("prazo_descricao"),         // "15 dias úteis"
  especialidades:jsonb("especialidades").$type<string[]>(), // categorias de material
  observacoes:   text("observacoes"),
  ativo:         boolean("ativo").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

// ─── Requests (Solicitações) ──────────────────────────────────────────────────
// Log de solicitações enviadas a parceiros: orçamento, amostra, visita, compartilhar.
export const archSolicitacoesTable = pgTable("arch_solicitacoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:       text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  tipo:           text("tipo").notNull(), // orcamento|amostra|visita|compartilhar
  status:         text("status").notNull().default("pendente"), // pendente|enviado|respondido|concluido
  partnerId:      text("partner_id").references(() => archPartnersTable.id, { onDelete: "set null" }),
  parceiroNome:   text("parceiro_nome"),  // denormalizado para histórico
  projetoId:      text("projeto_id"),
  projetoTitulo:  text("projeto_titulo"), // denormalizado
  catalogoItemId: text("catalogo_item_id"),
  itemNome:       text("item_nome"),      // denormalizado
  mensagem:       text("mensagem"),
  canalEnvio:     text("canal_envio"),    // email|whatsapp|manual
  enviadoEm:      timestamp("enviado_em"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

// ─── Schemas ──────────────────────────────────────────────────────────────────
export const insertArchPartnerSchema = createInsertSchema(archPartnersTable, {
  especialidades: z.array(z.string()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateArchPartnerSchema = createSelectSchema(archPartnersTable, {
  especialidades: z.array(z.string()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export const insertArchSolicitacaoSchema = createInsertSchema(archSolicitacoesTable).omit({
  id: true, createdAt: true,
});

export type InsertArchPartner    = z.infer<typeof insertArchPartnerSchema>;
export type UpdateArchPartner    = z.infer<typeof updateArchPartnerSchema>;
export type ArchPartner          = typeof archPartnersTable.$inferSelect;
export type InsertArchSolicitacao = z.infer<typeof insertArchSolicitacaoSchema>;
export type ArchSolicitacao      = typeof archSolicitacoesTable.$inferSelect;
