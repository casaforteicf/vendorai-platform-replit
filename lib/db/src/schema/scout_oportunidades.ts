import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { scoutRegrasTable } from "./scout_regras";

// status: pendente | enviado | respondeu | converteu | ignorado
export const scoutOportunidadesTable = pgTable("scout_oportunidades", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  regraId: text("regra_id")
    .notNull()
    .references(() => scoutRegrasTable.id, { onDelete: "restrict" }),
  tipo:            varchar("tipo",             { length: 50  }),
  descricao:       text("descricao"),
  valorEstimado:   numeric("valor_estimado",   { precision: 10, scale: 2 }),
  status:          varchar("status",           { length: 20  }).default("pendente"),
  canal:           varchar("canal",            { length: 20  }),
  mensagemEnviada: text("mensagem_enviada"),
  respondeu:       boolean("respondeu").default(false),
  converteu:       boolean("converteu").default(false),
  enviadoEm:       timestamp("enviado_em"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
});

export const insertScoutOportunidadeSchema = createInsertSchema(scoutOportunidadesTable, {
  valorEstimado: z.coerce.number().nonnegative().optional(),
  status:        z.enum(["pendente", "enviado", "respondeu", "converteu", "ignorado"]).optional(),
}).omit({ id: true, createdAt: true });

export const updateScoutOportunidadeSchema = createSelectSchema(scoutOportunidadesTable, {
  valorEstimado: z.coerce.number().nonnegative().optional(),
  status:        z.enum(["pendente", "enviado", "respondeu", "converteu", "ignorado"]).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertScoutOportunidade = z.infer<typeof insertScoutOportunidadeSchema>;
export type UpdateScoutOportunidade = z.infer<typeof updateScoutOportunidadeSchema>;
export type ScoutOportunidade       = typeof scoutOportunidadesTable.$inferSelect;
