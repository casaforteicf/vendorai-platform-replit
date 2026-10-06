import { pgTable, text, varchar, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type ServicoOsModeloCampo = {
  id: string;
  label: string;
  tipo: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file";
  obrigatorio: boolean;
  placeholder?: string | null;
  opcoes?: string[];
  visibilidade: "interno" | "cliente" | "cliente_parceiro";
};

export type ServicoOsModeloChecklistItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  obrigatorio: boolean;
  evidencia: "confirmation" | "text" | "photo" | "text_or_photo" | "text_and_photo";
  visibilidade: "interno" | "cliente" | "cliente_parceiro";
};

export const servicosOsModelosTable = pgTable("servicos_os_modelos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 120 }).notNull(),
  descricao: text("descricao"),
  tipo: varchar("tipo", { length: 40 }).notNull().default("assistencia"),
  ativo: boolean("ativo").notNull().default(true),
  padrao: boolean("padrao").notNull().default(false),
  campos: jsonb("campos").$type<ServicoOsModeloCampo[]>().notNull().default([]),
  checklist: jsonb("checklist").$type<ServicoOsModeloChecklistItem[]>().notNull().default([]),
  clienteAcompanhaDefault: boolean("cliente_acompanha_default").notNull().default(true),
  compartilharStatusClienteDefault: boolean("compartilhar_status_cliente_default").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ServicosOsModelo = typeof servicosOsModelosTable.$inferSelect;
