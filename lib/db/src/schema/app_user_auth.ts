import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { appInstancesTable } from "./app_builder";
import { appUsersTable } from "./app_users";

export const appUserAuthChallengesTable = pgTable(
  "app_user_auth_challenges",
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
    channel: text("channel").notNull().default("email"),
    purpose: text("purpose").notNull().default("login"),
    tokenHash: text("token_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("app_user_auth_challenges_lookup_idx").on(
      table.tenantId,
      table.appInstanceId,
      table.appUserId,
      table.requestedAt,
    ),
    index("app_user_auth_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export type AppUserAuthChallenge = typeof appUserAuthChallengesTable.$inferSelect;
