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
  status: "planejada" | "em_revisao" | "aprovada" | "em_producao" | "ativa" | "encerrada";
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
  periodoDias?: 30 | 60 | 90;
  campanhas?: MediaPlanCampaign[];
  totalAcoesPlanejadas?: number;
  statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
  aprovadoEm?: string | null;
  versaoPlanejamento?: number;
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