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

// Lista de referência (não é validada como enum -- o campo real na tabela
// é texto livre, ver insertServicosPrestadorSchema). Serve pra sugestão de
// UI e documentação. Ampliada (17/09, Bloco 3 da proposta de buckets) pros
// nichos que passaram a usar o módulo Serviços: jardinagem, dedetização,
// limpeza, manutenção predial, segurança eletrônica, chaveiro, serralheria,
// assistência técnica, funilaria/pintura, lavajato.
export const SERVICOS_ESPECIALIDADES = [
  "pedreiro",
  "eletricista",
  "encanador",
  "jardineiro",
  "dedetizador",
  "diarista",
  "predial",
  "seguranca_eletronica",
  "chaveiro",
  "serralheiro",
  "tecnico_eletronicos",
  "funileiro",
  "lavador",
  "geral",
] as const;

export const servicosPrestadoresTable = pgTable("servicos_prestadores", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome:                varchar("nome",      { length: 255 }).notNull(),
  email:               varchar("email",     { length: 255 }),
  telefone:            varchar("telefone",  { length: 20  }),
  especialidade:       varchar("especialidade", { length: 80 }).notNull().default("geral"),
  raioAtendimentoKm:   integer("raio_atendimento_km").default(15),
  comissaoBase:        numeric("comissao_base", { precision: 5, scale: 2 }).default("60"),
  ativo:               boolean("ativo").default(true),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
});

export const insertServicosPrestadorSchema = createInsertSchema(servicosPrestadoresTable, {
  comissaoBase: z.coerce.number().nonnegative().optional(),
  raioAtendimentoKm: z.coerce.number().int().positive().optional(),
  especialidade: z.string().min(1).max(80).optional(),
}).omit({ id: true, createdAt: true });

export const updateServicosPrestadorSchema = createSelectSchema(servicosPrestadoresTable, {
  comissaoBase: z.coerce.number().nonnegative().optional(),
  raioAtendimentoKm: z.coerce.number().int().positive().optional(),
  especialidade: z.string().min(1).max(80).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertServicosPrestador = z.infer<typeof insertServicosPrestadorSchema>;
export type UpdateServicosPrestador = z.infer<typeof updateServicosPrestadorSchema>;
export type ServicosPrestador       = typeof servicosPrestadoresTable.$inferSelect;
