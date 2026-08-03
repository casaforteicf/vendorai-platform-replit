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

// Pool sem `max` explícito cai no default do node-postgres (10 conexões
// simultâneas). O front dispara ~10-15 chamadas em paralelo por troca de
// tela (visto nos logs do Railway) — acima de 10, as requisições extras
// ficam na fila esperando uma conexão liberar, e é exatamente esse
// enfileiramento que produzia respostas de 1-2,8s mesmo com o servidor
// praticamente ocioso (CPU <1%) e o Postgres longe de saturado (18/60
// conexões em uso). O banco tem folga de sobra pra um pool maior.
export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
