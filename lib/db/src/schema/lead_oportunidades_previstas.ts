import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { usersTable } from "./users";

// Oportunidade futura PREVISTA pelo vendedor — diferente de um deal real
// (dealsTable), isso é uma expectativa/palpite registrado à mão ("acho
// que esse cliente vai precisar de X daqui a 3 meses"), sem compromisso
// nenhum do lead. Serve de contexto extra pra IA na extração SPIN e no
// desenvolvimento dos estágios de venda — o vendedor sabe coisas que
// não apareceram ainda na conversa.
export const leadOportunidadesPrevistasTable = pgTable("lead_oportunidades_previstas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  valorEstimado: numeric("valor_estimado", { precision: 12, scale: 2 }),
  previsaoData: timestamp("previsao_data"),
  criadoPor: text("criado_por").references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("aberta"), // "aberta" | "convertida" | "descartada"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type LeadOportunidadePrevista = typeof leadOportunidadesPrevistasTable.$inferSelect;
