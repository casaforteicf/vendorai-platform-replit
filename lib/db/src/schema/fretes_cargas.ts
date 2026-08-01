import { pgTable, text, timestamp, numeric, pgEnum, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { usersTable } from "./users";
import { fretesVeiculosTable, fretesVeiculoTipoEnum } from "./fretes_veiculos";

// status: cotacao_pendente | cotado | aprovado | coletado | em_transito |
//         entregue | cancelado
export const fretesCargaStatusEnum = pgEnum("fretes_carga_status", [
  "cotacao_pendente", "cotado", "aprovado", "coletado", "em_transito",
  "entregue", "cancelado",
]);

// Quem originou o pedido de frete — permite o mesmo parceiro freteiro
// atender tanto pedido direto de lojista (B2B) quanto entrega de cliente
// final vindo do Praça.ai (marketplace).
export const fretesOrigemEnum = pgEnum("fretes_origem", [
  "direto", "lojista", "cliente_final",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const fretesCargasTable = pgTable("fretes_cargas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id").notNull().references(() => leadsTable.id, { onDelete: "restrict" }),
  // Veículo específico só é atribuído pelo freteiro depois — na solicitação,
  // o cliente/lojista escolhe só o TIPO de veículo que precisa.
  tipoVeiculoDesejado: fretesVeiculoTipoEnum("tipo_veiculo_desejado"),
  veiculoId: text("veiculo_id").references(() => fretesVeiculosTable.id, { onDelete: "set null" }),
  // Motorista que aceitou essa carga (estilo Uber — fica disponível pra
  // qualquer motorista do tenant aceitar depois que status = aprovado, até
  // alguém aceitar primeiro). Null = ninguém aceitou ainda.
  motoristaId: text("motorista_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Localização ao vivo — só o ponto mais recente (sem histórico completo,
  // suficiente pro mapa em tempo real). Atualizado pelo motorista enquanto
  // a carga está coletado/em_transito.
  localizacaoLat: doublePrecision("localizacao_lat"),
  localizacaoLng: doublePrecision("localizacao_lng"),
  localizacaoAtualizadaEm: timestamp("localizacao_atualizada_em"),
  origem: fretesOrigemEnum("origem").notNull().default("direto"),
  enderecoColeta: text("endereco_coleta").notNull(),
  enderecoEntrega: text("endereco_entrega").notNull(),
  // Contato no local — pode ser diferente de quem pediu o frete (ex: lojista
  // pede, mas quem recebe na obra é outra pessoa).
  contatoColetaNome: text("contato_coleta_nome"),
  contatoColetaTelefone: text("contato_coleta_telefone"),
  contatoEntregaNome: text("contato_entrega_nome"),
  contatoEntregaTelefone: text("contato_entrega_telefone"),
  tipoCarga: text("tipo_carga"),
  pesoKg: numeric("peso_kg", { precision: 10, scale: 2 }),
  volumeM3: numeric("volume_m3", { precision: 10, scale: 2 }),
  valorDeclarado: numeric("valor_declarado", { precision: 12, scale: 2 }),
  instrucoesEspeciais: text("instrucoes_especiais"),
  valorCotado: numeric("valor_cotado", { precision: 12, scale: 2 }),
  status: fretesCargaStatusEnum("status").notNull().default("cotacao_pendente"),
  dataColetaPrevista: timestamp("data_coleta_prevista"),
  dataEntregaPrevista: timestamp("data_entrega_prevista"),
  dataColetaReal: timestamp("data_coleta_real"),
  dataEntregaReal: timestamp("data_entrega_real"),
  // Fotos como prova de estado da carga — separadas por etapa (evita
  // disputa sobre quem causou avaria).
  fotosColetaUrls: jsonb("fotos_coleta_urls").$type<string[]>(),
  fotosEntregaUrls: jsonb("fotos_entrega_urls").$type<string[]>(),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFretesCargaSchema = createInsertSchema(fretesCargasTable, {
  pesoKg: decimalField.optional().nullable(),
  volumeM3: decimalField.optional().nullable(),
  valorCotado: decimalField.optional().nullable(),
  valorDeclarado: decimalField.optional().nullable(),
  fotosColetaUrls: z.array(z.string()).optional().nullable(),
  fotosEntregaUrls: z.array(z.string()).optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateFretesCargaSchema = createSelectSchema(fretesCargasTable, {
  pesoKg: decimalField.optional().nullable(),
  volumeM3: decimalField.optional().nullable(),
  valorCotado: decimalField.optional().nullable(),
  valorDeclarado: decimalField.optional().nullable(),
  fotosColetaUrls: z.array(z.string()).optional().nullable(),
  fotosEntregaUrls: z.array(z.string()).optional().nullable(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type FretesCarga = typeof fretesCargasTable.$inferSelect;
export type InsertFretesCarga = z.infer<typeof insertFretesCargaSchema>;
