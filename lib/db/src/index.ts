import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Runtime database connection.
 *
 * APP_DATABASE_URL is reserved for the restricted vendorai_app role. The
 * existing variables remain as fallbacks so this change is backwards
 * compatible until the restricted role is provisioned in Replit Secrets.
 */
const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "APP_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL must be set.",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
