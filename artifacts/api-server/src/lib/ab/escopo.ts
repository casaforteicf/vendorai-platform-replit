import { sql } from "drizzle-orm";
import type { Request } from "express";
import { db } from "@workspace/db";

/**
 * Base compartilhada das rotas de A&B.
 *
 * Duas regras que valem para todas as rotas do módulo:
 *
 *  1. **O tenant vem do JWT, nunca do corpo.** `abAllowed` compara o
 *     `tenantId` da URL com o do token e recusa ator de máquina (ai/system).
 *     Nenhum handler lê `tenantId` de `req.body`.
 *  2. **Toda query roda em transação com `set_config('app.tenant_id')`.** A
 *     RLS das tabelas `ab_*` filtra por essa variável; sem ela a policy não
 *     libera nada. É a segunda camada além do guard.
 */

export type AbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Mesmo critério de escrita do ab_cargos: leitura livre para o hotel, escrita
 * só para admin.
 */
export function abAllowed(req: Request, tenantId: string, write = false): boolean {
  const u = req.user;
  return !!(
    u?.sub &&
    u.tenantId === tenantId &&
    u.actorType !== "ai" &&
    u.actorType !== "system" &&
    (!write ||
      u.platformRole === "tenant_admin" ||
      u.role === "admin" ||
      u.userFunction === "administrador")
  );
}

/**
 * Abre a transação e fixa o tenant para a RLS.
 *
 * `set_config(..., true)` é local à transação: morre no COMMIT/ROLLBACK e não
 * vaza para a próxima query do pool.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: AbTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** Erro de unicidade do Postgres (23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** Erro de FK (23503) — referência a insumo inexistente no tenant, por exemplo. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23503";
}

export function camposInvalidos(error: { issues: Array<{ path: Array<string | number | symbol> }> }): string[] {
  return error.issues.map((issue) => issue.path.join(".") || "(corpo)");
}
