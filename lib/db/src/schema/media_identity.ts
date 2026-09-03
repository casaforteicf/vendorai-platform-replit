import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { mediaAssetsTable } from "./media_core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const mediaIdentitiesTable = pgTable("media_identities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull().default("person"),
  status: text("status").notNull().default("draft"),
  faceReferenceAssetId: text("face_reference_asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({ tenantStatusIdx: index("media_identities_tenant_status_idx").on(table.tenantId, table.status) }));

export const mediaVoiceProfilesTable = pgTable("media_voice_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  identityId: text("identity_id").notNull().references(() => mediaIdentitiesTable.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  referenceAssetId: text("reference_asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("vendorai"),
  modelConfig: jsonb("model_config").$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({ identityStatusIdx: index("media_voice_profiles_identity_status_idx").on(table.identityId, table.status) }));

export const mediaIdentityConsentsTable = pgTable("media_identity_consents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  identityId: text("identity_id").notNull().references(() => mediaIdentitiesTable.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  status: text("status").notNull().default("active"),
  grantedByUserId: text("granted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  evidenceAssetId: text("evidence_asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  consentVersion: text("consent_version").notNull().default("1"),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({ lookupIdx: index("media_identity_consents_lookup_idx").on(table.tenantId, table.identityId, table.scope, table.status) }));

export const mediaIdentityConsentEventsTable = pgTable("media_identity_consent_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  identityId: text("identity_id").notNull().references(() => mediaIdentitiesTable.id, { onDelete: "cascade" }),
  consentId: text("consent_id").references(() => mediaIdentityConsentsTable.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  scope: text("scope").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({ identityCreatedIdx: index("media_identity_consent_events_identity_created_idx").on(table.identityId, table.createdAt) }));
