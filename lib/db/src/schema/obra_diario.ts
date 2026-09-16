import { pgTable, text, timestamp, integer, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable } from "./obras";
import { usersTable } from "./users";

type DiarioMedia = { url: string; caption?: string; uploadedAt: string; mimeType?: string; name?: string };
type DiarioServico = { nome: string; quantidade?: number; unidade?: string; etapaId?: string; observacao?: string };
type DiarioMaterial = { nome: string; quantidade?: number; unidade?: string; fornecedor?: string; conferido?: boolean; observacao?: string };
type DiarioOcorrencia = { tipo: string; descricao: string; gravidade?: "baixa" | "media" | "alta" | "critica"; resolvida?: boolean; responsavel?: string };
type DiarioEquipe = { equipe?: string; funcao?: string; quantidade: number; horas?: number; responsavel?: string };
type DiarioEquipamento = { nome: string; quantidade?: number; horasUso?: number; status?: "operando" | "parado" | "manutencao"; observacao?: string };

export const obraDiarioTable = pgTable("obra_diario", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id")
    .notNull()
    .references(() => obrasTable.id, { onDelete: "cascade" }),
  data: date("data", { mode: "string" }).notNull(),
  conteudo: text("conteudo").notNull(),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  responsavelNome: text("responsavel_nome"),
  status: text("status").notNull().default("rascunho"),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  climaTempo: text("clima_tempo"),
  maoDeObra: integer("mao_de_obra"),
  observacoes: text("observacoes"),
  condicaoCanteiro: text("condicao_canteiro"),
  servicosExecutados: jsonb("servicos_executados").$type<DiarioServico[]>().notNull().default([]),
  materiaisRecebidos: jsonb("materiais_recebidos").$type<DiarioMaterial[]>().notNull().default([]),
  ocorrencias: jsonb("ocorrencias").$type<DiarioOcorrencia[]>().notNull().default([]),
  equipeDetalhes: jsonb("equipe_detalhes").$type<DiarioEquipe[]>().notNull().default([]),
  equipamentos: jsonb("equipamentos").$type<DiarioEquipamento[]>().notNull().default([]),
  fotos: jsonb("fotos").$type<DiarioMedia[]>(),
  videos: jsonb("videos").$type<DiarioMedia[]>().notNull().default([]),
  anexos: jsonb("anexos").$type<DiarioMedia[]>().notNull().default([]),
  resumoIA: text("resumo_ia"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraDiarioSchema = createInsertSchema(obraDiarioTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateObraDiarioSchema = createSelectSchema(obraDiarioTable)
  .omit({ id: true, obraId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObraDiario = z.infer<typeof insertObraDiarioSchema>;
export type UpdateObraDiario = z.infer<typeof updateObraDiarioSchema>;
export type ObraDiario = typeof obraDiarioTable.$inferSelect;
