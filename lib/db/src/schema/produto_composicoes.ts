// Composição de N itens pra cálculo de orçamento por área/m² — generaliza
// o antigo modelo de "produto principal + 1 acessório de perímetro por
// Coleção+Cor" (auto-match implícito) pra qualquer número de itens
// explicitamente configurados, cada um calculado por área ou por
// perímetro do ambiente. Ex: teto vinílico = manta (área) + perfil F de
// acabamento (perímetro); pode crescer com fita/cola/rodapé etc sem
// precisar de coluna ou schema novo — só mais uma linha aqui.
//
// O antigo mecanismo de auto-match por Coleção+Cor (ver
// calculoOrcamentoM2Resolver.ts) continua funcionando como fallback
// pros produtos já configurados assim antes dessa tabela existir — essa
// tabela é o caminho explícito e recomendado pra composições novas.
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

export const BASE_CALCULO_COMPOSICAO = ["area", "perimetro"] as const;
export type BaseCalculoComposicao = typeof BASE_CALCULO_COMPOSICAO[number];

export const produtoComposicoesTable = pgTable("produto_composicoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  produtoPrincipalId: text("produto_principal_id").notNull().references(() => produtosCatalogoTable.id, { onDelete: "cascade" }),
  itemProdutoId: text("item_produto_id").notNull().references(() => produtosCatalogoTable.id, { onDelete: "restrict" }),
  baseCalculo: text("base_calculo").notNull().default("area"),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProdutoComposicaoSchema = createInsertSchema(produtoComposicoesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectProdutoComposicaoSchema = createSelectSchema(produtoComposicoesTable);

export type ProdutoComposicao = typeof produtoComposicoesTable.$inferSelect;
export type NewProdutoComposicao = typeof produtoComposicoesTable.$inferInsert;
