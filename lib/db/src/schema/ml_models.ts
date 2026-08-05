import { pgTable, text, timestamp, jsonb, boolean, customType } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

// bytea genérico — Drizzle não tem um tipo nativo pra isso ainda.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Modelo de ML treinado (LightGBM) — cada linha é 1 versão de modelo
// pronta pra inferência. Guarda o binário serializado direto no Postgres
// (bytea) em vez de Storage externo — evita mais uma dependência de
// infra pra um arquivo pequeno (KB, no máximo poucos MB pra dado
// tabular). O microserviço Python lê/escreve aqui direto.
export const mlModelsTable = pgTable("ml_models", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // null = modelo global (todos os tenants); preenchido = modelo
  // específico de 1 tenant, se algum dia fizer sentido treinar por
  // tenant em vez de um modelo compartilhado entre todos.
  tenantId: text("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull().default("propensao_conversao"),
  modeloBinario: bytea("modelo_binario").notNull(),
  // Métricas de avaliação do treino (AUC, quantidade de exemplos etc) —
  // pra decidir se um modelo novo é bom o suficiente pra substituir o
  // anterior, e pra dar transparência de "quão confiável é isso".
  metricas: jsonb("metricas").$type<{
    auc?: number;
    numExemplos: number;
    numGanhos: number;
    numPerdidos: number;
    features: string[];
  }>().notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MlModel = typeof mlModelsTable.$inferSelect;
