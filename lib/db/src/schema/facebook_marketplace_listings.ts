import { index, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";
import { campaignsTable } from "./campaigns";

export const FACEBOOK_MARKETPLACE_STATUSES = [
  "draft",
  "ready",
  "published",
  "paused",
  "sold",
  "renewal_due",
  "failed",
] as const;

export type FacebookMarketplaceStatus = (typeof FACEBOOK_MARKETPLACE_STATUSES)[number];

export const facebookMarketplaceListingsTable = pgTable(
  "facebook_marketplace_listings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => produtosCatalogoTable.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
    channel: text("channel").notNull().default("facebook_marketplace"),
    publishMode: text("publish_mode").notNull().default("assisted"),
    status: text("status").$type<FacebookMarketplaceStatus>().notNull().default("draft"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    category: text("category"),
    condition: text("condition").notNull().default("new"),
    city: text("city"),
    state: text("state"),
    mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    publishedAt: timestamp("published_at"),
    lastRenewedAt: timestamp("last_renewed_at"),
    nextRenewalAt: timestamp("next_renewal_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_fb_marketplace_tenant").on(table.tenantId),
    index("idx_fb_marketplace_product").on(table.productId),
    index("idx_fb_marketplace_status").on(table.status),
    index("idx_fb_marketplace_campaign").on(table.campaignId),
  ],
);

export type FacebookMarketplaceListing = typeof facebookMarketplaceListingsTable.$inferSelect;
