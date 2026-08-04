import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Programa de marca (white-label) — independente da vertical do tenant.
// Um tenant entra num programa (ex: "arqdor") tanto se ele É o negócio
// principal daquele programa (o escritório de arquitetura usando o fluxo
// completo — render, agentes, contratos, orçamento) quanto se ele é um
// FORNECEDOR/PARCEIRO vendendo pra esse público (pode ser de qualquer
// vertical própria — marcenaria, iluminação etc). Os dois grupos veem a
// marca do programa (logo/cor), não a marca padrão Vendor.ai.
export const brandProgramsTable = pgTable("brand_programs", {
  // slug curto, usado como valor de tenants.programa_marca — ex: "arqdor"
  id: text("id").primaryKey(),
  nomeExibicao: text("nome_exibicao").notNull(), // ex: "Arqdor.ai"
  logoUrl: text("logo_url"),
  corPrimaria: text("cor_primaria"),
  descricao: text("descricao"),
  // false (padrão) = co-branding, mostra "Vendor.ai × Logo do tenant".
  // true = marca branca completa, mostra só a marca do programa, nunca
  // "Vendor.ai" em lugar nenhum da experiência desse tenant.
  whiteLabelCompleto: boolean("white_label_completo").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandProgramSchema = createInsertSchema(brandProgramsTable)
  .omit({ createdAt: true, updatedAt: true });
export const updateBrandProgramSchema = createSelectSchema(brandProgramsTable)
  .omit({ id: true, createdAt: true, updatedAt: true }).partial();
export type BrandProgram = typeof brandProgramsTable.$inferSelect;
