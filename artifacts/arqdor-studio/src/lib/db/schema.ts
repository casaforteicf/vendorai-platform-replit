/**
 * Persistência de projetos — schema Postgres (Drizzle).
 *
 * Decisão: o DOCUMENTO versionado (`DocumentoArqdor`, v2) é a unidade de persistência e vive
 * em `jsonb`. Elementos BIM, sólidos, camadas e MEP ficam dentro dele, porque a validação de
 * integridade (`validar`) já é do domínio e é atômica — quebrar em tabelas relacionais
 * criaria duas verdades e exigiria transação distribuída para um dado que é salvo junto.
 *
 * O contador monotônico (`proximoSolidoN`) e a ordem das camadas continuam dentro do JSON.
 */

import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { DocumentoArqdor } from '../../arqdor/editor/persistencia/documento';

export const projetos = pgTable('arqdor_projetos', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  /** Versão do documento (hoje 2). Migração acontece na leitura, não no banco. */
  versao: integer('versao').notNull(),
  documento: jsonb('documento').$type<DocumentoArqdor>().notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export type LinhaProjeto = typeof projetos.$inferSelect;
export type NovaProjeto = typeof projetos.$inferInsert;
