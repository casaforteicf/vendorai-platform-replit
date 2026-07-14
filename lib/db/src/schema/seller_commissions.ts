import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";

export const sellerCommissionsTable = pgTable(
  "seller_commissions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sellerUserId: text("seller_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    clienteTenantId: text("cliente_tenant_id").references(
      () => tenantsTable.id, { onDelete: "set null" }
    ),
    dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
    planSlug: text("plan_slug"),
    clienteNome: text("cliente_nome"),
    valorImplantacaoCents: integer("valor_implantacao_cents").notNull(),
    percentual: integer("percentual").notNull().default(20),
    valorComissaoCents: integer("valor_comissao_cents").notNull(),
    status: text("status").notNull().default("pendente"),
    observacoes: text("observacoes"),
    paidAt: timestamp("paid_at"),
    paidByUserId: text("paid_by_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("seller_commissions_tenant_idx").on(table.tenantId),
    index("seller_commissions_seller_idx").on(table.sellerUserId),
    index("seller_commissions_deal_idx").on(table.dealId),
  ]
);

export const insertSellerCommissionSchema = createInsertSchema(
  sellerCommissionsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSellerCommissionSchema = createSelectSchema(
  sellerCommissionsTable
).omit({ id: true, createdAt: true, updatedAt: true }).partial();

export type InsertSellerCommission = z.infer<typeof insertSellerCommissionSchema>;
export type SellerCommission = typeof sellerCommissionsTable.$inferSelect;
