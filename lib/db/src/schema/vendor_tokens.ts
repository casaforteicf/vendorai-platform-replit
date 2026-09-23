import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type VendorTokenTransactionKind =
  | "purchase"
  | "consumption"
  | "refund"
  | "promotion"
  | "adjustment"
  | "migration";

export const vendorTokenTransactionsTable = pgTable(
  "vendor_token_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    tokensDelta: bigint("tokens_delta", { mode: "number" }).notNull(),
    kind: text("kind").$type<VendorTokenTransactionKind>().notNull(),
    source: text("source").notNull(),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("vendor_token_transactions_tenant_created_idx").on(table.tenantId, table.createdAt),
    sourceReferenceUq: uniqueIndex("vendor_token_transactions_source_reference_uq")
      .on(table.source, table.referenceId),
  }),
);

export type VendorTokenTransaction = typeof vendorTokenTransactionsTable.$inferSelect;
