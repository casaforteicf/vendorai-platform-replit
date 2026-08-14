import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const veiculosCombustivelEnum = pgEnum("veiculos_combustivel", [
  "flex", "gasolina", "diesel", "eletrico", "hibrido", "gnv",
]);

export const veiculosCambioEnum = pgEnum("veiculos_cambio", ["manual", "automatico", "cvt"]);

export const veiculosStatusEnum = pgEnum("veiculos_status", [
  "disponivel", "reservado", "vendido", "inativo",
]);

export interface VeiculoFotoDetalhe {
  url: string;
  legenda?: string; // ex: "Motor", "Interior", "Painel", "Roda dianteira esquerda"
}

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const veiculosEstoqueTable = pgTable("veiculos_estoque", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  placa: text("placa"),
  marca: text("marca").notNull(),
  modelo: text("modelo").notNull(),
  anoFabricacao: integer("ano_fabricacao"),
  anoModelo: integer("ano_modelo"),
  cor: text("cor"),
  km: integer("km"),
  combustivel: veiculosCombustivelEnum("combustivel"),
  cambio: veiculosCambioEnum("cambio"),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  valorPromocional: numeric("valor_promocional", { precision: 12, scale: 2 }),
  descricao: text("descricao"),
  fotos: jsonb("fotos").$type<string[]>(),
  // Fotos de detalhe (motor, interior, painel, avarias etc — separado da
  // galeria geral), cada uma com legenda opcional dizendo o que é.
  fotosDetalhes: jsonb("fotos_detalhes").$type<VeiculoFotoDetalhe[]>(),
  // Vídeos do veículo (walkaround, motor ligado etc) — mesmo padrão de
  // produtos_catalogo.videoUrl, mas aqui aceita mais de um.
  videos: jsonb("videos").$type<string[]>(),
  status: veiculosStatusEnum("status").notNull().default("inativo"),
  // Mitigação de risco de procedência (decidido anteriormente): anúncio só
  // pode ficar 'disponivel' depois de vistoria realizada — enforçado na
  // rota, não só documentado aqui.
  vistoriaRealizada: boolean("vistoria_realizada").notNull().default(false),
  vistoriaLaudoUrl: text("vistoria_laudo_url"),
  destaque: boolean("destaque").notNull().default(false),
  vendeNoPracaAi: boolean("vende_no_praca_ai").notNull().default(false),
  vendedorResponsavelId: text("vendedor_responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Vínculo com o catálogo genérico (Praça.ai) — preenchido/mantido
  // automaticamente pela sincronização, não editado à mão.
  produtoCatalogoId: text("produto_catalogo_id"),
  // Identificação do veículo — hoje preenchidos manualmente; ficam prontos
  // pra um provedor de busca por placa/chassi/RENAVAM auto-preencher no
  // futuro (decisão de negócio pendente, ver migration 084).
  chassi: text("chassi"),
  renavam: text("renavam"),
  versao: text("versao"),
  // Cache do valor FIPE — atualizado via BrasilAPI (gratuita) buscando por
  // marca+modelo+ano já cadastrados. fipeCodigo é o código de 6-7 dígitos
  // da tabela FIPE, único por modelo (não muda entre atualizações mensais).
  fipeCodigo: text("fipe_codigo"),
  fipeValor: numeric("fipe_valor", { precision: 12, scale: 2 }),
  fipeMesReferencia: text("fipe_mes_referencia"),
  fipeAtualizadoEm: timestamp("fipe_atualizado_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVeiculosEstoqueSchema = createInsertSchema(veiculosEstoqueTable, {
  valor: decimalField,
  valorPromocional: decimalField.optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true, produtoCatalogoId: true });

export const updateVeiculosEstoqueSchema = createSelectSchema(veiculosEstoqueTable, {
  valor: decimalField.optional(),
  valorPromocional: decimalField.optional().nullable(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true, produtoCatalogoId: true }).partial();

export type VeiculosEstoque = typeof veiculosEstoqueTable.$inferSelect;
export type InsertVeiculosEstoque = z.infer<typeof insertVeiculosEstoqueSchema>;
