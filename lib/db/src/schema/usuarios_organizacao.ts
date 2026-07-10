import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizacoesTable } from "./organizacoes";

export const NIVEL_ORGANIZACAO = ["admin_organizacao"] as const;
export type NivelOrganizacao = (typeof NIVEL_ORGANIZACAO)[number];

export const usuariosOrganizacaoTable = pgTable("usuarios_organizacao", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // FK para users.id — sem .references() para evitar import circular
  userId: text("user_id").notNull(),
  organizacaoId: text("organizacao_id")
    .notNull()
    .references(() => organizacoesTable.id, { onDelete: "cascade" }),
  nivel: text("nivel").$type<NivelOrganizacao>().notNull().default("admin_organizacao"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUsuarioOrganizacaoSchema = createInsertSchema(usuariosOrganizacaoTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUsuarioOrganizacao = z.infer<typeof insertUsuarioOrganizacaoSchema>;
export type UsuarioOrganizacao = typeof usuariosOrganizacaoTable.$inferSelect;
