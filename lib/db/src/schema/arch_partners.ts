import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

// ─── Partner Directory ────────────────────────────────────────────────────────
// Diretório de parceiros do escritório: fornecedores, fabricantes, representantes, lojas.
// O parceiro pode ser um tenant VendorAI conectado ou uma empresa externa convidada.
export const archPartnersTable = pgTable("arch_partners", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  connectedTenantId: text("connected_tenant_id")
    .references(() => tenantsTable.id, { onDelete: "set null" }),
  partnerSource: text("partner_source").notNull().default("external"), // tenant|external
  nome:          text("nome").notNull(),
  tipo:          text("tipo").notNull().default("fornecedor"), // fornecedor|fabricante|representante|loja|construtora|arquiteto
  contato:       text("contato"),
  email:         text("email"),
  telefone:      text("telefone"),
  website:       text("website"),
  cidade:        text("cidade"),
  estado:        text("estado"),
  prazoDias:     integer("prazo_dias"),
  prazoDescricao:text("prazo_descricao"),
  especialidades:jsonb("especialidades").$type<string[]>(),
  observacoes:   text("observacoes"),
  ativo:         boolean("ativo").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

// ─── Requests (Solicitações) ──────────────────────────────────────────────────
// Log de solicitações enviadas a parceiros: orçamento, amostra, visita, compartilhar.
// A participação nasce na solicitação; só é liberada financeiramente após venda/pagamento.
export const archSolicitacoesTable = pgTable("arch_solicitacoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId:       text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  recipientTenantId: text("recipient_tenant_id")
    .references(() => tenantsTable.id, { onDelete: "set null" }),
  tipo:           text("tipo").notNull(), // orcamento|amostra|visita|compartilhar
  status:         text("status").notNull().default("pendente"), // pendente|enviado|visualizado|respondido|concluido
  partnerId:      text("partner_id").references(() => archPartnersTable.id, { onDelete: "set null" }),
  parceiroNome:   text("parceiro_nome"),
  projetoId:      text("projeto_id"),
  projetoTitulo:  text("projeto_titulo"),
  catalogoItemId: text("catalogo_item_id"),
  itemNome:       text("item_nome"),
  mensagem:       text("mensagem"),
  canalEnvio:     text("canal_envio"), // app|email|whatsapp|manual
  participationEnabled: boolean("participation_enabled").notNull().default(false),
  participationPercent: numeric("participation_percent", { precision: 7, scale: 4 }),
  platformFeePercent: numeric("platform_fee_percent", { precision: 7, scale: 4 }),
  agreementStatus: text("agreement_status").notNull().default("not_applicable"), // not_applicable|pending|accepted|rejected
  attributionWindowDays: integer("attribution_window_days").notNull().default(90),
  attributionSource: text("attribution_source").notNull().default("architect_project"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  quoteScope: text("quote_scope"),
  quoteAmountCents: integer("quote_amount_cents"),
  quoteDeliveryDays: integer("quote_delivery_days"),
  quoteValidUntil: timestamp("quote_valid_until", { withTimezone: true }),
  quoteResponseMessage: text("quote_response_message"),
  quoteProposalUrl: text("quote_proposal_url"),
  selected: boolean("selected").notNull().default(false),
  selectedAt: timestamp("selected_at", { withTimezone: true }),
  selectedByTenantId: text("selected_by_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  saleConfirmedAt: timestamp("sale_confirmed_at", { withTimezone: true }),
  saleAmountCents: integer("sale_amount_cents"),
  participationEventId: text("participation_event_id"),
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
