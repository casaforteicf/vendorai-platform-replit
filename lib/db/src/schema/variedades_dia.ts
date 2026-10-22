import { pgTable, text, timestamp, boolean, numeric, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

// Categorias não são um enum travado de propósito — texto livre permite
// adicionar novas (ex: "moda", "pets") sem migration. As 3 iniciais usadas
// pelo Praça.ai: "viagens", "receitas", "variedades" (catch-all).
export const VARIEDADE_CATEGORIAS_PADRAO = ["viagens", "receitas", "variedades"] as const;

// Variedades do dia — conteúdo real de parceiro (texto e/ou vídeo) + uma
// promoção opcional junto. 1 vaga por categoria por dia (garantido por
// índice único parcial no banco, não só na aplicação — ver migration 057).
// Expira sozinho em 24h. Promoção é produtoId+desconto (real, do catálogo)
// OU texto livre, nunca os dois — mesma regra de negócio dos stories.
export const variedadesDiaTable = pgTable(
  "variedades_dia",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    categoria: text("categoria").notNull(),
    titulo: text("titulo").notNull(),
    conteudoTexto: text("conteudo_texto"),
    videoUrl: text("video_url"),
    imagemUrl: text("imagem_url"),
    promocaoTipo: text("promocao_tipo").$type<"produto" | "texto_livre">(),
    promocaoProdutoId: text("promocao_produto_id").references(() => produtosCatalogoTable.id, { onDelete: "set null" }),
    promocaoDescontoPercentual: numeric("promocao_desconto_percentual", { precision: 5, scale: 2 }),
    promocaoTexto: text("promocao_texto"),
    dataReferencia: date("data_referencia").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull().defaultNow(),
  },
  (table) => [
    index("variedades_dia_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

export const insertVariedadeDiaSchema = createInsertSchema(variedadesDiaTable, { promocaoTipo: () => z.enum(["produto", "texto_livre"]) })
  .omit({ id: true, ativo: true, createdAt: true, expiresAt: true, dataReferencia: true })
  .extend({
    categoria: z.string().min(1).max(40),
    titulo: z.string().min(1).max(120),
  })
  .refine((data) => !!data.conteudoTexto || !!data.videoUrl, {
    message: "Escreva o conteúdo ou envie um vídeo (pelo menos um dos dois).",
  })
  .refine((data) => !(data.promocaoTipo === "produto" && !data.promocaoProdutoId), {
    message: "Escolha um produto do catálogo pra promoção.",
  })
  .refine((data) => !(data.promocaoTipo === "texto_livre" && !data.promocaoTexto), {
    message: "Escreva o texto da promoção.",
  });

export type InsertVariedadeDia = z.infer<typeof insertVariedadeDiaSchema>;
export type VariedadeDia = typeof variedadesDiaTable.$inferSelect;
