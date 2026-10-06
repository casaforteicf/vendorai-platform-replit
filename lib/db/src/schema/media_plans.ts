import { pgTable, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export interface MediaPlanCanal {
  canal: string; // ex: "Instagram", "Google Ads", "Meta Ads", "SEO orgânico"
  prioridade: "alta" | "media" | "baixa";
  motivo: string;
  tiposCampanhaSugeridos: string[];
  percentualOrcamento: number; // 0-100, soma dos canais ~100
}

export interface MediaPlanCampaignChannel {
  canal: string;
  funcao: string;
  etapaFunil: string;
  formatos: string[];
  frequencia: string;
  quantidadeMateriais: number;
  kpiPrincipal: string;
  percentualOrcamento?: number;
}

export interface MediaPlanCampaign {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  fase: string;
  inicioOffsetDias: number;
  duracaoDias: number;
  intensidadeGeografica: "baixa" | "media" | "alta";
  regraComunicacaoGeografica: string;
  canais: MediaPlanCampaignChannel[];
  kpiPrincipal: string;
  metaPrincipal: string;
  materiaisPlanejados: number;
  coverUrl?: string;
  status: "planejada" | "em_revisao" | "aprovada" | "em_producao" | "ativa" | "encerrada";
}

// Limite financeiro definido pelo humano. Este contrato orienta planejamento e
// otimização; autorização de publicação/ativação continua em sua camada própria.
export interface MediaPlanBudget {
  valor: number;
  tipo: "total" | "diario" | "semanal" | "mensal";
  moeda: "BRL";
  gestao: "ia_autonoma";
  limiteRigido: true;
}

export interface MediaPlanPeriod {
  inicioEm?: string;
  fimEm?: string | null;
  aberto?: boolean;
  duracaoValor?: number;
  duracaoUnidade?: "horas" | "dias";
}

// A aprovação estratégica do plano não implica autorização para publicar.
// Manual é o comportamento seguro/padrão; automático é opt-in explícito do usuário.
export interface MediaPlanOrganicPublicationSettings {
  modo: "manual" | "automatico";
  horario: string; // HH:mm no fuso configurado
  timezone: string; // IANA, ex.: America/Sao_Paulo
}

export interface MediaPlanConteudo {
  diagnostico: string;
  pontosFortesAtuais: string[];
  oportunidades: string[];
  canais: MediaPlanCanal[];
  pilaresConteudo: string[];
  acoesImediatas: string[];
  concorrentesEncontrados?: Array<{ dominio: string; titulo: string; url: string }>;
  keywordsRelevantes?: Array<{ termo: string; volumeBusca: number | null }>;
  // Mantido por compatibilidade com planos existentes e calendários baseados em dias.
  periodoDias?: number;
  periodo?: MediaPlanPeriod;
  nomeCampanha?: string;
  ofertaCampanha?: string;
  orcamento?: MediaPlanBudget;
  campanhas?: MediaPlanCampaign[];
  totalAcoesPlanejadas?: number;
  statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
  aprovadoEm?: string | null;
  versaoPlanejamento?: number;
  publicacaoOrganica?: MediaPlanOrganicPublicationSettings;
  // Versão do catálogo que define a função oficial de cada canal/mídia.
  // Fica dentro do JSON para permitir adequar planos antigos sem migration.
  versaoFuncoesMidia?: number;
}

export const mediaPlansTable = pgTable("media_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  conteudo: jsonb("conteudo").$type<MediaPlanConteudo>().notNull(),
  contextoUsado: jsonb("contexto_usado").$type<Record<string, unknown>>(),
  custoUsd: numeric("custo_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  geradoPor: text("gerado_por").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const selectMediaPlanSchema = createSelectSchema(mediaPlansTable);
export type MediaPlan = typeof mediaPlansTable.$inferSelect;