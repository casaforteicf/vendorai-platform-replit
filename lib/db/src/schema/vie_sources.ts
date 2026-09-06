import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const vieSourcesTable = pgTable("vie_sources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("news"),
  scope: text("scope").notNull(),
  sourceType: text("source_type").notNull(),
  endpointUrl: text("endpoint_url"),
  websiteUrl: text("website_url"),
  countryCode: text("country_code"),
  regionCode: text("region_code"),
  city: text("city"),
  categories: jsonb("categories").$type<string[] | null>(),
  reliabilityScore: integer("reliability_score"),
  active: boolean("active").notNull().default(true),
  licenseNotes: text("license_notes"),
  termsUrl: text("terms_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => ({
  codeUnique: uniqueIndex("vie_sources_code_idx").on(table.code),
  activeDomainScopeIdx: index("vie_sources_active_domain_scope_idx").on(table.active, table.domain, table.scope),
}));
