import { pgTable, text, timestamp, integer, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable } from "./obras";
import { usersTable } from "./users";

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
  fotos: jsonb("fotos").$type<Array<{ url: string; caption?: string; uploadedAt: string }>>(),
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
