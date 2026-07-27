import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { servicosPrestadoresTable } from "./servicos_prestadores";
import { servicosTiposTable } from "./servicos_tipos";

// status: orcamento_pendente | orcamento_enviado | aprovado | agendado |
//         em_andamento | concluido | cancelado
// Diferente de beauty/clinic: aqui o prestador vai até o endereço do
// cliente, e normalmente passa por uma etapa de orçamento antes da
// execução — não é hora marcada direto como corte de cabelo ou consulta.
export const servicosOrdensTable = pgTable("servicos_ordens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "restrict" }),
  prestadorId: text("prestador_id")
    .references(() => servicosPrestadoresTable.id, { onDelete: "set null" }),
  tipoServicoId: text("tipo_servico_id")
    .notNull()
    .references(() => servicosTiposTable.id, { onDelete: "restrict" }),
  enderecoAtendimento: text("endereco_atendimento").notNull(),
  status:              varchar("status", { length: 25 }).default("orcamento_pendente"),
  dataHoraVisita:      timestamp("data_hora_visita"),
  valorOrcado:         numeric("valor_orcado", { precision: 10, scale: 2 }),
  valorFinal:          numeric("valor_final",  { precision: 10, scale: 2 }),
  fotosAntes:          jsonb("fotos_antes").$type<string[]>(),
  fotosDepois:         jsonb("fotos_depois").$type<string[]>(),
  observacoes:         text("observacoes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
});

const STATUS_VALUES = [
  "orcamento_pendente",
  "orcamento_enviado",
  "aprovado",
  "agendado",
  "em_andamento",
  "concluido",
  "cancelado",
] as const;

export const insertServicosOrdemSchema = createInsertSchema(servicosOrdensTable, {
  valorOrcado: z.coerce.number().nonnegative().optional().nullable(),
  valorFinal: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  fotosAntes: z.array(z.string()).optional(),
  fotosDepois: z.array(z.string()).optional(),
}).omit({ id: true, createdAt: true });

export const updateServicosOrdemSchema = createSelectSchema(servicosOrdensTable, {
  valorOrcado: z.coerce.number().nonnegative().optional().nullable(),
  valorFinal: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  fotosAntes: z.array(z.string()).optional(),
  fotosDepois: z.array(z.string()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type InsertServicosOrdem = z.infer<typeof insertServicosOrdemSchema>;
export type UpdateServicosOrdem = z.infer<typeof updateServicosOrdemSchema>;
export type ServicosOrdem       = typeof servicosOrdensTable.$inferSelect;
