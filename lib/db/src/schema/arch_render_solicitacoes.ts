import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { archCenasTable } from "./arch_cenas";
import { archRenderVersoesTable } from "./arch_render_versoes";

// ── Tipos dos itens de solicitação ──────────────────────────────────────────

export type ItemAdicionado = {
  tipo:    "sofa" | "mesa" | "cadeira" | "cama" | "armario" | "luminaria" | "janela" | "porta";
  cor:     string; // hex ex: '#4A3728'
  posicao: "esquerda" | "centro" | "direita";
};

export type TexturaAlterada = {
  superficie: "parede" | "piso" | "teto";
  material:   "madeira" | "marmore" | "cimento" | "tinta";
  cor:        string; // hex ex: '#FFFFFF'
};

// ── Tabela ──────────────────────────────────────────────────────────────────

export const archRenderSolicitacoesTable = pgTable("arch_render_solicitacoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cenaId: text("cena_id")
    .notNull()
    .references(() => archCenasTable.id, { onDelete: "cascade" }),
  clienteNome: varchar("cliente_nome", { length: 255 }),
  // pendente | processando | concluido | erro
  status: varchar("status", { length: 20 }).default("pendente"),
  itensAdicionados:  jsonb("itens_adicionados").$type<ItemAdicionado[]>(),
  texturasAlteradas: jsonb("texturas_alteradas").$type<TexturaAlterada[]>(),
  observacoes: text("observacoes"),
  // preenchido quando o render é gerado a partir desta solicitação
  versaoGeradaId: text("versao_gerada_id")
    .references(() => archRenderVersoesTable.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  processadoEm: timestamp("processado_em"),
});

// ── Zod schemas ─────────────────────────────────────────────────────────────

const itemAdicionadoSchema = z.object({
  tipo:    z.enum(["sofa", "mesa", "cadeira", "cama", "armario", "luminaria", "janela", "porta"]),
  cor:     z.string(),
  posicao: z.enum(["esquerda", "centro", "direita"]),
});

const texturaAlteradaSchema = z.object({
  superficie: z.enum(["parede", "piso", "teto"]),
  material:   z.enum(["madeira", "marmore", "cimento", "tinta"]),
  cor:        z.string(),
});

export const insertArchRenderSolicitacaoSchema = createInsertSchema(
  archRenderSolicitacoesTable,
  {
    itensAdicionados:  z.array(itemAdicionadoSchema).optional(),
    texturasAlteradas: z.array(texturaAlteradaSchema).optional(),
  },
).omit({ id: true, createdAt: true });

export const updateArchRenderSolicitacaoSchema = createSelectSchema(
  archRenderSolicitacoesTable,
  {
    itensAdicionados:  z.array(itemAdicionadoSchema).optional(),
    texturasAlteradas: z.array(texturaAlteradaSchema).optional(),
  },
)
  .omit({ id: true, cenaId: true, createdAt: true })
  .partial();

export type InsertArchRenderSolicitacao = z.infer<typeof insertArchRenderSolicitacaoSchema>;
export type UpdateArchRenderSolicitacao = z.infer<typeof updateArchRenderSolicitacaoSchema>;
export type ArchRenderSolicitacao       = typeof archRenderSolicitacoesTable.$inferSelect;
