import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import type { FarmaciaPosologia } from "./farmacia_produtos";

export const farmaciaBulasTable = pgTable("farmacia_bulas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  principioAtivo: text("principio_ativo").notNull(),
  sintomasReferencia: text("sintomas_referencia"),
  tratamentoInicial: text("tratamento_inicial"),
  criteriosEncaminhamento: text("criterios_encaminhamento"),
  posologia: jsonb("posologia").$type<FarmaciaPosologia>(),
  fonteUrl: text("fonte_url"),
  status: text("status").$type<"pendente" | "aprovada" | "rejeitada">().notNull().default("pendente"),
  responsavelNome: text("responsavel_nome"),
  responsavelRegistro: text("responsavel_registro"),
  revisadaEm: timestamp("revisada_em"),
  observacoesRevisao: text("observacoes_revisao"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("farmacia_bulas_tenant_principio_uidx").on(table.tenantId, table.principioAtivo),
]);

export type FarmaciaBula = typeof farmaciaBulasTable.$inferSelect;
