import { pool } from "@workspace/db";

/**
 * Autorização comum das rotas de Hotelaria.
 *
 * Leitura: qualquer usuário humano do próprio tenant.
 * Escrita: administrador do tenant (platformRole tenant_admin, role admin ou
 * função "administrador"). A recepção do hotel opera com perfil administrativo
 * nesta primeira versão; papéis operacionais específicos ficam para um lote
 * próprio de permissões.
 */
export function hotelAllowed(req: Express.Request, tenantId: string, write = false): boolean {
  const user = req.user;
  return Boolean(
    user?.sub
    && user.tenantId === tenantId
    && user.actorType !== "ai"
    && user.actorType !== "system"
    && (!write || user.platformRole === "tenant_admin" || user.role === "admin" || user.userFunction === "administrador"),
  );
}

export async function hotelTransaction<T>(
  tenantId: string,
  action: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const value = await action(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
