import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const scoutRegrasTable = pgTable("scout_regras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:          varchar("nome",  { length: 255 }).notNull(),
  tipo:          varchar("tipo",  { length: 50  }).notNull(),
  condicoes:     jsonb("condicoes").$type<Record<string, unknown>>().notNull(),
  acao:          jsonb("acao").$type<Record<string, unknown>>().notNull(),
  ativo:         boolean("ativo").default(true),
  totalDisparos: integer("total_disparos").default(0),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const SCOUT_REGRA_TIPOS = [
  "recompra",
  "cross_sell",
  "reativacao",
  "upgrade",
  "aniversario",
  "sequencia_produto",
  "follow_up",
  "renovacao",
  "manutencao",
  "renovacao_seguro",
  "risco_nao_renovacao",
  "whitespace_seguro",
  "reativacao_sazonal",
  "orcamento_parado",
  "grade_incompleta",
  "receita_vencendo",
  "produto_vencendo",
  "limite_credito_disponivel",
  "sinal_praca_ai",
  // Revenue Scout v2 — hipóteses geradas automaticamente pelo motor de carteira.
  "potencial_carteira",
  "sinal_expansao",
  "risco_competitivo",
  "indicacao",
] as const;

export const insertScoutRegraSchema = createInsertSchema(scoutRegrasTable, {
  tipo: z.enum(SCOUT_REGRA_TIPOS),
}).omit({ id: true, createdAt: true });

export const updateScoutRegraSchema = createSelectSchema(scoutRegrasTable, {
  tipo: z.enum(SCOUT_REGRA_TIPOS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertScoutRegra = z.infer<typeof insertScoutRegraSchema>;
export type UpdateScoutRegra = z.infer<typeof updateScoutRegraSchema>;
export type ScoutRegra       = typeof scoutRegrasTable.$inferSelect;
