#!/usr/bin/env tsx
/**
 * Enables login for the restricted vendorai_app PostgreSQL role.
 *
 * Required environment variables:
 *   VENDORAI_APP_DB_PASSWORD  - random password with at least 32 characters
 *   MIGRATION_DATABASE_URL    - privileged admin/migration connection
 *
 * The password is never printed. After provisioning, configure APP_DATABASE_URL
 * in Replit Secrets with vendorai_app as the database user.
 */
import pg from "pg";

const { Pool } = pg;
const APP_ROLE = "vendorai_app";

const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;
const password = process.env.VENDORAI_APP_DB_PASSWORD;

if (!connectionString) {
  console.error(
    "❌  MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL is required.",
  );
  process.exit(1);
}

if (!password || password.length < 32) {
  console.error(
    "❌  VENDORAI_APP_DB_PASSWORD must be configured with at least 32 characters.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function run(): Promise<void> {
  const client = await pool.connect();

  try {
    const currentRoleResult = await client.query<{
      current_role: string;
      is_superuser: boolean;
      can_create_role: boolean;
    }>(`
      SELECT
        current_user AS current_role,
        rolsuper AS is_superuser,
        rolcreaterole AS can_create_role
      FROM pg_roles
      WHERE rolname = current_user
    `);
    const currentRole = currentRoleResult.rows[0];

    if (!currentRole?.is_superuser && !currentRole?.can_create_role) {
      throw new Error(
        `Current database role ${currentRole?.current_role ?? "unknown"} cannot manage application roles.`,
      );
    }

    const appRoleResult = await client.query<{
      role_name: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
      can_create_db: boolean;
      can_create_role: boolean;
    }>(
      `SELECT
         rolname AS role_name,
         rolsuper AS is_superuser,
         rolbypassrls AS bypasses_rls,
         rolcreatedb AS can_create_db,
         rolcreaterole AS can_create_role
       FROM pg_roles
       WHERE rolname = $1`,
      [APP_ROLE],
    );
    const appRole = appRoleResult.rows[0];

    if (!appRole) {
      throw new Error(
        `${APP_ROLE} does not exist. Apply migration 032 before provisioning login.`,
      );
    }

    if (
      appRole.is_superuser ||
      appRole.bypasses_rls ||
      appRole.can_create_db ||
      appRole.can_create_role
    ) {
      throw new Error(
        `${APP_ROLE} has unsafe privileges. Refusing to enable login.`,
      );
    }

    const quotedResult = await client.query<{ password_literal: string }>(
      "SELECT quote_literal($1) AS password_literal",
      [password],
    );
    const passwordLiteral = quotedResult.rows[0]?.password_literal;
    if (!passwordLiteral) throw new Error("Could not safely quote role password.");

    try {
      await client.query(
        `ALTER ROLE ${APP_ROLE} LOGIN PASSWORD ${passwordLiteral} VALID UNTIL 'infinity'`,
      );
    } catch {
      throw new Error("Could not enable login for the restricted application role.");
    }

    const verification = await client.query<{
      can_login: boolean;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(
      `SELECT
         rolcanlogin AS can_login,
         rolsuper AS is_superuser,
         rolbypassrls AS bypasses_rls
       FROM pg_roles
       WHERE rolname = $1`,
      [APP_ROLE],
    );
    const verified = verification.rows[0];

    if (!verified?.can_login || verified.is_superuser || verified.bypasses_rls) {
      throw new Error("Application role verification failed after provisioning.");
    }

    console.log(
      "✓ vendorai_app login enabled securely. Configure APP_DATABASE_URL in Replit Secrets and run audit:rls:runtime.",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ Application-role provisioning failed: ${message}\n`);
  process.exit(1);
});
