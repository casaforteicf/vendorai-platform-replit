import { pgTable, text, timestamp, numeric, boolean, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const farmaciaCategoriaProdutoEnum = pgEnum("farmacia_categoria_produto", [
  "medicamento_generico", "medicamento_referencia", "medicamento_similar",
  "perfumaria", "higiene_pessoal", "dermocosmeticos", "infantil",
  "ortopedicos", "suplementos", "outros",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export interface FarmaciaPosologia {
  concentracao?: string;
  formaFarmaceutica?: string;
  viaAdministracao?: string;
  faixaEtaria?: string;
  pesoMinimoKg?: number;
  pesoMaximoKg?: number;
  dosePorAdministracao?: string;
  intervaloMinimo?: string;
  duracaoMaxima?: string;
  doseMaximaDiaria?: string;
  modoDeUsar?: string;
  contraindicacoes?: string;
  interacoes?: string;
  alertas?: string;
}

export const farmaciaProdutoTable = pgTable("farmacia_produtos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  erpId: text("erp_id"),
  nome: text("nome").notNull(),
  // Ingrediente ativo — usado pra sugerir substituto genérico quando o
  // produto pedido está em falta (diferencial real de farmácia).
  principioAtivo: text("principio_ativo"),
  descricao: text("descricao"),
  categoria: farmaciaCategoriaProdutoEnum("categoria"),
  // Diferencial-chave do setor: alguns produtos exigem foto da receita
  // anexada no pedido antes de poder ser confirmado (retenção/controle
  // especial). Validado no momento da criação do pedido.
  exigeReceita: boolean("exige_receita").notNull().default(false),
  posologia: jsonb("posologia").$type<FarmaciaPosologia>(),
  posologiaFonteUrl: text("posologia_fonte_url"),
  posologiaRevisadaPor: text("posologia_revisada_por"),
  posologiaRevisadaEm: timestamp("posologia_revisada_em"),
  posologiaAprovada: boolean("posologia_aprovada").notNull().default(false),
  unidade: text("unidade").notNull().default("un"),
  precoVenda: numeric("preco_venda", { precision: 12, scale: 2 }).notNull(),
  precoPromocional: numeric("preco_promocional", { precision: 12, scale: 2 }),
  estoque: integer("estoque").notNull().default(0),
  imagemUrl: text("imagem_url"),
  ativo: boolean("ativo").notNull().default(true),
  destaqueWhatsapp: boolean("destaque_whatsapp").notNull().default(false),
  // Vínculo com o catálogo genérico — preenchido pela sincronização.
  produtoCatalogoId: text("produto_catalogo_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFarmaciaProdutoSchema = createInsertSchema(farmaciaProdutoTable, {
  precoVenda: decimalField,
  precoPromocional: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, produtoCatalogoId: true });

export const updateFarmaciaProdutoSchema = createSelectSchema(farmaciaProdutoTable, {
  precoVenda: decimalField.optional(),
  precoPromocional: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type FarmaciaProduto = typeof farmaciaProdutoTable.$inferSelect;
export type InsertFarmaciaProduto = z.infer<typeof insertFarmaciaProdutoSchema>;
