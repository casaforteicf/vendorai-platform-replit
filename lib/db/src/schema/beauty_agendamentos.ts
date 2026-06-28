import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { beautyProfissionaisTable } from "./beauty_profissionais";
import { beautyServicosTable } from "./beauty_servicos";

// status: agendado | confirmado | concluido | cancelado | faltou
export const beautyAgendamentosTable = pgTable("beauty_agendamentos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  profissionalId: text("profissional_id")
    .references(() => beautyProfissionaisTable.id, { onDelete: "set null" }),
  servicoId: text("servico_id")
    .notNull()
    .references(() => beautyServicosTable.id, { onDelete: "restrict" }),
  dataHora:           timestamp("data_hora").notNull(),
  duracaoMinutos:     integer("duracao_minutos"),
  status:             varchar("status",      { length: 20 }).default("agendado"),
  valor:              numeric("valor",       { precision: 10, scale: 2 }),
  observacoes:        text("observacoes"),
  lembrete1Enviado:   boolean("lembrete1_enviado").default(false),
  lembrete2Enviado:   boolean("lembrete2_enviado").default(false),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
});

export const insertBeautyAgendamentoSchema = createInsertSchema(beautyAgendamentosTable, {
  valor:          z.coerce.number().nonnegative().optional(),
  duracaoMinutos: z.coerce.number().int().positive().optional(),
  status:         z.enum(["agendado", "confirmado", "concluido", "cancelado", "faltou"]).optional(),
}).omit({ id: true, createdAt: true });

export const updateBeautyAgendamentoSchema = createSelectSchema(beautyAgendamentosTable, {
  valor:          z.coerce.number().nonnegative().optional(),
  duracaoMinutos: z.coerce.number().int().positive().optional(),
  status:         z.enum(["agendado", "confirmado", "concluido", "cancelado", "faltou"]).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertBeautyAgendamento = z.infer<typeof insertBeautyAgendamentoSchema>;
export type UpdateBeautyAgendamento = z.infer<typeof updateBeautyAgendamentoSchema>;
export type BeautyAgendamento       = typeof beautyAgendamentosTable.$inferSelect;
