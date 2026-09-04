import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { appInstancesTable } from "./app_builder";

export const appUserStatusValues = ["invited", "active", "blocked", "archived"] as const;
export const appUserMembershipStatusValues = ["invited", "active", "suspended", "archived"] as const;

export const appUsersTable = pgTable(
  "app_users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    identityProvider: text("identity_provider").notNull().default("local"),
    authSubject: text("auth_subject"),
    status: text("status").notNull().default("invited"),
    locale: text("locale"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    emailVerifiedAt: timestamp("email_verified_at"),
    phoneVerifiedAt: timestamp("phone_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_users_tenant_email_uidx").on(table.tenantId, table.email),
    uniqueIndex("app_users_tenant_auth_subject_uidx").on(
      table.tenantId,
      table.identityProvider,
      table.authSubject,
    ),
    index("app_users_tenant_status_idx").on(table.tenantId, table.status),
    index("app_users_tenant_lead_idx").on(table.tenantId, table.leadId),
    index("app_users_tenant_phone_idx").on(table.tenantId, table.phone),
  ],
);

export const appUserMembershipsTable = pgTable(
  "app_user_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    appInstanceId: text("app_instance_id")
      .notNull()
      .references(() => appInstancesTable.id, { onDelete: "cascade" }),
    appUserId: text("app_user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    roleKey: text("role_key").notNull().default("customer"),
    status: text("status").notNull().default("invited"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_user_memberships_app_user_uidx").on(table.appInstanceId, table.appUserId),
    index("app_user_memberships_tenant_app_idx").on(
      table.tenantId,
      table.appInstanceId,
      table.status,
    ),
    index("app_user_memberships_tenant_user_idx").on(
      table.tenantId,
      table.appUserId,
      table.status,
    ),
    index("app_user_memberships_role_idx").on(table.tenantId, table.roleKey, table.status),
  ],
);

const metadataSchema = z.record(z.string(), z.unknown());

export const createAppUserSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.string().min(1).nullable().optional(),
  displayName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  identityProvider: z.string().trim().min(1).max(80).default("local"),
  authSubject: z.string().trim().min(1).max(255).nullable().optional(),
  status: z.enum(appUserStatusValues).default("invited"),
  locale: z.string().trim().min(2).max(35).nullable().optional(),
  metadata: metadataSchema.default({}),
});

export const createAppUserMembershipSchema = z.object({
  tenantId: z.string().min(1),
  appInstanceId: z.string().min(1),
  appUserId: z.string().min(1),
  roleKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "role_key inválido")
    .default("customer"),
  status: z.enum(appUserMembershipStatusValues).default("invited"),
  permissions: z.array(z.string().trim().min(1).max(160)).default([]),
  metadata: metadataSchema.default({}),
});

export type AppUser = typeof appUsersTable.$inferSelect;
export type AppUserMembership = typeof appUserMembershipsTable.$inferSelect;
