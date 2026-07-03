// ─── Vendor Partner Network — Products / Catalog ─────────────────────────────
// Each partner can have a product catalog. Platform-level.

import { pgTable, text, boolean, timestamp, jsonb, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vpnPartnersTable } from "./vpn_partners";

export const vpnPartnerProductsTable = pgTable("vpn_partner_products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  partnerId: text("partner_id")
    .notNull()
    .references(() => vpnPartnersTable.id, { onDelete: "cascade" }),

  // Product info
  name:        text("name").notNull(),
  sku:         text("sku"),
  description: text("description"),
  category:    text("category"),
  subcategory: text("subcategory"),
  collection:  text("collection"),

  // Pricing
  price:     numeric("price", { precision: 12, scale: 2 }),
  priceUnit: text("price_unit").default("un"),   // un, m², m, kg, kit, cx
  currency:  text("currency").default("BRL"),

  // Availability
  inStock:       boolean("in_stock").notNull().default(true),
  leadTimeDays:  integer("lead_time_days"),
  minOrderQty:   integer("min_order_qty").default(1),

  // Media
  imageUrl: text("image_url"),
  images:   jsonb("images").$type<string[]>().default([]),

  // Technical specs & attributes
  specs:          jsonb("specs").$type<Record<string, unknown>>().default({}),
  certifications: jsonb("certifications").$type<string[]>().default([]),
  colors:         jsonb("colors").$type<string[]>().default([]),
  finishes:       jsonb("finishes").$type<string[]>().default([]),
  dimensions:     jsonb("dimensions").$type<Record<string, unknown>>().default({}),

  // Status
  active:       boolean("active").notNull().default(true),
  featured:     boolean("featured").notNull().default(false),
  totalQuotes:  integer("total_quotes").notNull().default(0),
  totalOrders:  integer("total_orders").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vpn_products_partner").on(t.partnerId),
  index("idx_vpn_products_category").on(t.category),
]);

export const insertVpnPartnerProductSchema = createInsertSchema(vpnPartnerProductsTable, {
  name:           z.string().min(1).max(255),
  price:          z.coerce.number().nonnegative().optional(),
  images:         z.array(z.string()).optional(),
  specs:          z.record(z.string(), z.unknown()).optional(),
  certifications: z.array(z.string()).optional(),
  colors:         z.array(z.string()).optional(),
  finishes:       z.array(z.string()).optional(),
  dimensions:     z.record(z.string(), z.unknown()).optional(),
});

export const selectVpnPartnerProductSchema = createSelectSchema(vpnPartnerProductsTable, {
  price:          z.string().nullable(),
  images:         z.array(z.string()),
  specs:          z.record(z.string(), z.unknown()),
  certifications: z.array(z.string()),
  colors:         z.array(z.string()),
  finishes:       z.array(z.string()),
  dimensions:     z.record(z.string(), z.unknown()),
});

export type VpnPartnerProduct       = typeof vpnPartnerProductsTable.$inferSelect;
export type InsertVpnPartnerProduct = typeof vpnPartnerProductsTable.$inferInsert;
