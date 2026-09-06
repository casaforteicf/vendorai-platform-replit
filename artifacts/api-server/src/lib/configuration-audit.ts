import { db, erpAuditoriaTable } from "@workspace/db";

const SENSITIVE_KEY = /(token|secret|password|senha|authorization|cookie|api[_-]?key|access[_-]?key|refresh[_-]?token)/i;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 5;

export type ConfigurationAuditActor = {
  userId?: string | null;
  ip?: string | null;
};

export type ConfigurationAuditInput = {
  tenantId: string;
  action: "criar" | "atualizar" | "excluir";
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actor?: ConfigurationAuditActor;
};

/**
 * Remove credenciais e limita payloads antes de persistir snapshots de auditoria.
 * Configurações podem conter tokens de integrações; esses valores nunca devem
 * aparecer no histórico, mesmo quando uma rota futura passar o objeto inteiro.
 */
export function sanitizeConfigurationSnapshot(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_DEPTH) return "[limite de profundidade]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeConfigurationSnapshot(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[redigido]" : sanitizeConfigurationSnapshot(item, depth + 1),
      ]),
    );
  }

  return String(value).slice(0, MAX_STRING_LENGTH);
}

/**
 * Trilha única para mudanças feitas em Configurações.
 * Reutiliza erp_auditoria em vez de criar um segundo sistema de auditoria.
 * Falha de auditoria não deve derrubar a alteração principal; o chamador pode
 * registrar o erro caso precise de telemetria adicional.
 */
export async function writeConfigurationAudit(input: ConfigurationAuditInput): Promise<boolean> {
  try {
    await db.insert(erpAuditoriaTable).values({
      tenantId: input.tenantId,
      usuarioId: input.actor?.userId ?? null,
      modulo: "configuracoes",
      acao: input.action,
      entidade: input.entity,
      entidadeId: input.entityId ?? null,
      antes: input.before === undefined ? null : sanitizeConfigurationSnapshot(input.before),
      depois: input.after === undefined ? null : sanitizeConfigurationSnapshot(input.after),
      ip: input.actor?.ip ?? null,
    });
    return true;
  } catch {
    return false;
  }
}
