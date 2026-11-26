import {
  pgTable,
  text,
  boolean,
  timestamp,
  time,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

/**
 * A&B (Alimentos & Bebidas) — Fase 1: base operacional.
 *
 * Escopo desta entrega: apenas estruturas de cadastro. Nada aqui movimenta
 * saldo, custo ou produção.
 *
 * Multi-tenant: TODA linha pertence a um tenant. `tenant_id` é obrigatório,
 * referencia tenants(id) com ON DELETE CASCADE e é a primeira coluna de todos
 * os índices — o isolamento por hotel é garantido na consulta e reforçado por
 * RLS na migration (mesmo padrão das tabelas hotel_*).
 *
 * Locais de estoque NÃO vivem aqui: por decisão de arquitetura, a fonte única
 * de verdade continua sendo `hotel_stock_locations` (HOTEL-01). Os tipos de
 * A&B (camara_fria, freezer, seco) foram acrescentados ao CHECK de `kind`
 * na migration ab_01, em vez de criar uma segunda tabela de locais.
 *
 * Convenções seguidas do repositório:
 *  - id text com default de aplicação (crypto.randomUUID())
 *  - created_at / updated_at com timezone
 *  - unicidade composta (tenant_id, nome) via uniqueIndex
 *  - nomes de tabela/coluna em snake_case; identificadores TS em camelCase
 */

/**
 * Cargos / funções operacionais do hotel.
 *
 * `setor` fica como texto livre nesta fase (ex.: "Cozinha", "Confeitaria",
 * "Restaurante", "Bar", "Estoque"). Se os setores precisarem ser fixos, dá para
 * promover a pgEnum em uma migration futura sem perder os dados atuais.
 */
export const abCargosTable = pgTable(
  "ab_cargos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    setor: text("setor").notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Dois cargos com o mesmo nome no mesmo hotel são quase sempre duplicidade.
    uniqueIndex("ab_cargos_tenant_nome_uidx").on(table.tenantId, table.nome),
    index("ab_cargos_tenant_setor_idx").on(table.tenantId, table.setor),
  ],
);

export const insertAbCargoSchema = createInsertSchema(abCargosTable, {
  nome: z.string().trim().min(1).max(120),
  setor: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(500).nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAbCargoSchema = createSelectSchema(abCargosTable);

export type AbCargo = typeof abCargosTable.$inferSelect;
export type InsertAbCargo = typeof abCargosTable.$inferInsert;

/**
 * Equipe operacional do A&B. Cada pessoa pertence a um cargo e tem jornada
 * semanal com dias de trabalho, intervalo e folgas.
 */
export const abEquipeTable = pgTable(
  "ab_equipe",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cargoId: text("cargo_id").references(() => abCargosTable.id, { onDelete: "set null" }),
    diasSemana: jsonb("dias_semana").$type<number[]>().notNull().default([]),
    horaInicio: time("hora_inicio").notNull(),
    intervaloInicio: time("intervalo_inicio"),
    intervaloFim: time("intervalo_fim"),
    horaFim: time("hora_fim").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ab_equipe_tenant_id_uq").on(table.tenantId, table.id),
    index("ab_equipe_tenant_cargo_idx").on(table.tenantId, table.cargoId, table.ativo),
  ],
);

export const insertAbEquipeSchema = createInsertSchema(abEquipeTable, {
  nome: z.string().trim().min(1).max(120),
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  horaFim: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  intervaloInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  intervaloFim: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export const selectAbEquipeSchema = createSelectSchema(abEquipeTable);
export type AbEquipe = typeof abEquipeTable.$inferSelect;
export type InsertAbEquipe = typeof abEquipeTable.$inferInsert;
