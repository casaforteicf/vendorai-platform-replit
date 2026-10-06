import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { servicosPrestadoresTable } from "./servicos_prestadores";
import { servicosTiposTable } from "./servicos_tipos";

export type ServicoChecklistEvidenceMode =
  | "confirmation"
  | "text"
  | "photo"
  | "text_or_photo"
  | "text_and_photo";

export type ServicoChecklistVisibility = "interno" | "cliente" | "cliente_parceiro";

export type ServicoChecklistItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  obrigatorio: boolean;
  evidencia: ServicoChecklistEvidenceMode;
  visibilidade: ServicoChecklistVisibility;
  concluido: boolean;
  observacao?: string | null;
  fotos?: string[];
  concluidoPorId?: string | null;
  concluidoPorNome?: string | null;
  concluidoEm?: string | null;
};

export type ServicoHistoricoItem = {
  id: string;
  tipo: "criacao" | "checklist" | "status" | "edicao" | "ocorrencia";
  mensagem: string;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  criadoEm: string;
  dados?: Record<string, unknown>;
};

export type ServicoCampoPersonalizado = {
  id: string;
  nome: string;
  tipo: "text" | "textarea" | "number" | "date" | "checkbox";
  valor: string | number | boolean | null;
  obrigatorio?: boolean;
};

// A OS é o documento e também a unidade executável da pipeline.
// Cada passo do checklist guarda evidência, executor e horário; a conclusão
// dos passos obrigatórios pode avançar automaticamente a ordem.
export const servicosOrdensTable = pgTable("servicos_ordens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  negocioId: text("negocio_id")
    .references(() => dealsTable.id, { onDelete: "set null" }),
  prestadorId: text("prestador_id")
    .references(() => servicosPrestadoresTable.id, { onDelete: "set null" }),
  tipoServicoId: text("tipo_servico_id")
    .notNull()
    .references(() => servicosTiposTable.id, { onDelete: "restrict" }),
  modeloExecucao: varchar("modelo_execucao", { length: 40 }).notNull().default("geral"),
  enderecoAtendimento: text("endereco_atendimento").notNull(),
  status:              varchar("status", { length: 30 }).default("orcamento_pendente"),
  dataHoraVisita:      timestamp("data_hora_visita"),
  valorOrcado:         numeric("valor_orcado", { precision: 10, scale: 2 }),
  valorFinal:          numeric("valor_final",  { precision: 10, scale: 2 }),
  fotosAntes:          jsonb("fotos_antes").$type<string[]>(),
  fotosDepois:         jsonb("fotos_depois").$type<string[]>(),
  checklistExecucao:   jsonb("checklist_execucao").$type<ServicoChecklistItem[]>().notNull().default([]),
  historicoExecucao:   jsonb("historico_execucao").$type<ServicoHistoricoItem[]>().notNull().default([]),
  camposPersonalizados: jsonb("campos_personalizados").$type<ServicoCampoPersonalizado[]>().notNull().default([]),
  clienteAcompanha:    boolean("cliente_acompanha").notNull().default(true),
  compartilharStatusCliente: boolean("compartilhar_status_cliente").notNull().default(true),
  portalToken:          text("portal_token"),
  observacoes:         text("observacoes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

const STATUS_VALUES = [
  "orcamento_pendente",
  "orcamento_enviado",
  "aprovado",
  "agendado",
  "em_andamento",
  "aguardando_validacao",
  "concluido",
  "cancelado",
] as const;

const MODELO_VALUES = [
  "geral",
  "producao",
  "expedicao",
  "entrega",
  "instalacao",
  "assistencia",
  "suporte",
  "vistoria",
  "manutencao",
] as const;

export const insertServicosOrdemSchema = createInsertSchema(servicosOrdensTable, {
  valorOrcado: z.coerce.number().nonnegative().optional().nullable(),
  valorFinal: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  modeloExecucao: z.enum(MODELO_VALUES).optional(),
  fotosAntes: z.array(z.string()).optional(),
  fotosDepois: z.array(z.string()).optional(),
  checklistExecucao: z.array(z.any()).optional(),
  historicoExecucao: z.array(z.any()).optional(),
  camposPersonalizados: z.array(z.any()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateServicosOrdemSchema = createSelectSchema(servicosOrdensTable, {
  valorOrcado: z.coerce.number().nonnegative().optional().nullable(),
  valorFinal: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  modeloExecucao: z.enum(MODELO_VALUES).optional(),
  fotosAntes: z.array(z.string()).optional(),
  fotosDepois: z.array(z.string()).optional(),
  checklistExecucao: z.array(z.any()).optional(),
  historicoExecucao: z.array(z.any()).optional(),
  camposPersonalizados: z.array(z.any()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertServicosOrdem = z.infer<typeof insertServicosOrdemSchema>;
export type UpdateServicosOrdem = z.infer<typeof updateServicosOrdemSchema>;
export type ServicosOrdem       = typeof servicosOrdensTable.$inferSelect;
