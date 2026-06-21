import { pgTable, text, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const leadsTable = pgTable("leads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  empresa: text("empresa"),
  documento: text("documento"),
  tamanhoEquipe: text("tamanho_equipe"),
  objetivo: text("objetivo"),
  urgencia: text("urgencia"),
  orcamento: text("orcamento"),
  planoRecomendado: text("plano_recomendado"),
  dorPrincipal: text("dor_principal"),
  proximaAcao: text("proxima_acao"),
  status: text("status").notNull().default("novo"),
  activeAgentLock: text("active_agent_lock"),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  instagramScopedId: text("instagram_scoped_id"),
  instagramHandle: text("instagram_handle"),
  endereco: text("endereco"),
  dataNascimento: text("data_nascimento"),
  estadoCivil: text("estado_civil"),
  conjugeNome: text("conjuge_nome"),
  conjugeTelefone: text("conjuge_telefone"),
  conjugeEmail: text("conjuge_email"),
  conjugeDataNascimento: text("conjuge_data_nascimento"),
  filhos: jsonb("filhos").$type<Array<{ nome: string; dataNascimento: string; genero?: string; birthMonth?: number; birthDay?: number; source?: string; lastCampaignSentYear?: number }>>(),
  discoveryData: jsonb("discovery_data").$type<Record<string, unknown>>(),
  tipo: text("tipo").notNull().default("cliente"),
  indicadoPor: text("indicado_por"),
  notasNutricao: text("notas_nutricao"),
  source: text("source").notNull().default("manual"),
  possivelDuplicata: boolean("possivel_duplicata").notNull().default(false),
  leadSimilarId: text("lead_similar_id"),

  // Proposta fields
  mercadoSegmento: text("mercado_segmento"),
  logoUrl: text("logo_url"),
  corDestaque: text("cor_destaque"),
  corSecundaria: text("cor_secundaria"),

  // Family / relationship agent fields
  genero: text("genero"),
  birthMonth: integer("birth_month"),
  birthDay: integer("birth_day"),
  lastCampaignSentYear: integer("last_campaign_sent_year"),
  specialDateMessagesOptOut: boolean("special_date_messages_opt_out").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantPhoneIdx: index("leads_tenant_phone_idx").on(table.tenantId, table.telefone),
  tenantDocIdx: index("leads_tenant_doc_idx").on(table.tenantId, table.documento),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadSchema = createSelectSchema(leadsTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
    leadSimilarId: true,
    possivelDuplicata: true,
  })
  .partial();

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type UpdateLead = z.infer<typeof updateLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
