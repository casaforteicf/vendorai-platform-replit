import {
  pgTable,
  text,
  boolean,
  timestamp,
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
