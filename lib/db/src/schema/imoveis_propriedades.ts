import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const imoveisTipoEnum = pgEnum("imoveis_tipo", [
  "casa", "apartamento", "terreno", "comercial", "rural", "sala_comercial",
]);

export const imoveisFinalidadeEnum = pgEnum("imoveis_finalidade", ["venda", "aluguel"]);

export const imoveisStatusEnum = pgEnum("imoveis_status", [
  "disponivel", "reservado", "vendido", "alugado", "inativo",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const imoveisPropriedadesTable = pgTable("imoveis_propriedades", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  tipo: imoveisTipoEnum("tipo").notNull(),
  finalidade: imoveisFinalidadeEnum("finalidade").notNull(),
  endereco: text("endereco"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  cep: text("cep"),
  areaM2: numeric("area_m2", { precision: 10, scale: 2 }),
  quartos: integer("quartos"),
  banheiros: integer("banheiros"),
  vagas: integer("vagas"),
  valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
  valorCondominio: numeric("valor_condominio", { precision: 10, scale: 2 }),
  valorIptu: numeric("valor_iptu", { precision: 10, scale: 2 }),
  fotos: jsonb("fotos").$type<string[]>(),
  status: imoveisStatusEnum("status").notNull().default("disponivel"),
  destaque: boolean("destaque").notNull().default(false),
  corretorResponsavelId: text("corretor_responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertImoveisPropriedadeSchema = createInsertSchema(imoveisPropriedadesTable, {
  valor: decimalField,
  valorCondominio: decimalField.optional(),
  valorIptu: decimalField.optional(),
  areaM2: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateImoveisPropriedadeSchema = createSelectSchema(imoveisPropriedadesTable, {
  valor: decimalField.optional(),
  valorCondominio: decimalField.optional(),
  valorIptu: decimalField.optional(),
  areaM2: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type ImoveisPropriedade = typeof imoveisPropriedadesTable.$inferSelect;
export type InsertImoveisPropriedade = z.infer<typeof insertImoveisPropriedadeSchema>;
