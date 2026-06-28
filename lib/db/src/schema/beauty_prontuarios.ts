import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { beautyAgendamentosTable } from "./beauty_agendamentos";

export const beautyProntuariosTable = pgTable("beauty_prontuarios", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  agendamentoId: text("agendamento_id")
    .references(() => beautyAgendamentosTable.id, { onDelete: "set null" }),
  servico:        varchar("servico",    { length: 255 }),
  profissional:   varchar("profissional", { length: 255 }),
  observacoes:    text("observacoes"),
  fotosAntes:     jsonb("fotos_antes").$type<string[]>(),
  fotosDepois:    jsonb("fotos_depois").$type<string[]>(),
  produtosUsados: jsonb("produtos_usados").$type<string[]>(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const insertBeautyProntuarioSchema = createInsertSchema(beautyProntuariosTable)
  .omit({ id: true, createdAt: true });

export const updateBeautyProntuarioSchema = createSelectSchema(beautyProntuariosTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertBeautyProntuario = z.infer<typeof insertBeautyProntuarioSchema>;
export type UpdateBeautyProntuario = z.infer<typeof updateBeautyProntuarioSchema>;
export type BeautyProntuario       = typeof beautyProntuariosTable.$inferSelect;
