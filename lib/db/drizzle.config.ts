import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "APP_DATABASE_URL, MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL must be set",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
