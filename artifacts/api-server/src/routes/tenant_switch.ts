import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  tenantsTable,
  usuariosOrganizacaoTable,
  tenantSwitchLogTable,
} from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middlewares/auth.js";

const router: IRouter = Router();

const switchTenantSchema = z.object({
  targetTenantId: z.string().min(1, "targetTenantId é obrigatório"),
});

/**
 * GET /api/auth/switchable-tenants
 * Retorna os tenants para os quais o usuário autenticado pode trocar,
 * com base em sua vinculação em usuarios_organizacao.
 * Nunca expõe tenants fora da(s) organização(ões) do usuário.
 */
router.get("/auth/switchable-tenants", authenticate, async (req, res) => {
  const userId = req.user!.sub;
  const currentTenantId = req.user!.tenantId;

  const memberships = await db
    .select({ organizacaoId: usuariosOrganizacaoTable.organizacaoId })
    .from(usuariosOrganizacaoTable)
    .where(eq(usuariosOrganizacaoTable.userId, userId));

  if (memberships.length === 0) {
    res.json({ currentTenant: null, tenants: [] });
    return;
  }

  const orgIds = memberships.map((m) => m.organizacaoId);

  const [currentTenantRow] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      organizacaoId: tenantsTable.organizacaoId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, currentTenantId));

  // Mesma regra do POST /auth/switch-tenant: só tenants da organização do
  // tenant atual, desde que o usuário seja membro dessa organização.
  const currentOrgId = currentTenantRow?.organizacaoId ?? null;
  const switchableTenants =
    currentOrgId && orgIds.includes(currentOrgId)
      ? await db
          .select({
            id: tenantsTable.id,
            name: tenantsTable.name,
            slug: tenantsTable.slug,
            organizacaoId: tenantsTable.organizacaoId,
          })
          .from(tenantsTable)
          .where(
            and(
              eq(tenantsTable.organizacaoId, currentOrgId),
              ne(tenantsTable.id, currentTenantId)
            )
          )
      : [];

  res.json({
    currentTenant: currentTenantRow
      ? { id: currentTenantRow.id, name: currentTenantRow.name }
      : null,
    tenants: switchableTenants,
  });
});

/**
 * POST /api/auth/switch-tenant
 * Emite um novo JWT escopado para o tenant de destino.
 *
 * Validações de segurança (todas obrigatórias, nenhuma pode ser pulada):
 *  1. targetTenantId deve ser informado e diferente do tenant atual
 *  2. Tenant de destino deve existir e ter organizacaoId preenchido
 *  3. Tenant atual deve pertencer à MESMA organização que o de destino
 *  4. Usuário autenticado deve estar em usuarios_organizacao para essa org
 *
 * NUNCA confia em dados do cliente para determinar a organização —
 * tudo é revalidado contra o banco de dados a cada chamada.
 */
router.post("/auth/switch-tenant", authenticate, async (req, res) => {
  const userId = req.user!.sub;
  const currentTenantId = req.user!.tenantId;

  const parsed = switchTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { targetTenantId } = parsed.data;

  if (targetTenantId === currentTenantId) {
    res.status(400).json({ error: "Tenant de destino é o mesmo que o atual" });
    return;
  }

  // ── 1. Verificar existência e org do tenant de destino ──────────────
  const [targetTenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      organizacaoId: tenantsTable.organizacaoId,
      status: tenantsTable.status,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, targetTenantId));

  if (!targetTenant) {
    res.status(404).json({ error: "Tenant de destino não encontrado" });
    return;
  }

  if (!targetTenant.organizacaoId) {
    res.status(403).json({
      error: "Tenant de destino não pertence a nenhuma organização",
    });
    return;
  }

  // ── 2. Verificar que o tenant atual pertence à mesma organização ─────
  const [currentTenant] = await db
    .select({ organizacaoId: tenantsTable.organizacaoId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, currentTenantId));

  if (
    !currentTenant?.organizacaoId ||
    currentTenant.organizacaoId !== targetTenant.organizacaoId
  ) {
    res.status(403).json({
      error:
        "Acesso negado: tenant de destino não pertence à mesma organização",
    });
    return;
  }

  const organizacaoId = targetTenant.organizacaoId;

  // ── 3. Verificar vínculo do usuário na organização ───────────────────
  const [membership] = await db
    .select({ id: usuariosOrganizacaoTable.id })
    .from(usuariosOrganizacaoTable)
    .where(
      and(
        eq(usuariosOrganizacaoTable.userId, userId),
        eq(usuariosOrganizacaoTable.organizacaoId, organizacaoId)
      )
    );

  if (!membership) {
    res.status(403).json({
      error: "Usuário não possui acesso a esta organização",
    });
    return;
  }

  // ── 4. Emitir novo token escopado para o tenant de destino ───────────
  const newToken = signToken({
    sub: userId,
    email: req.user!.email,
    platformRole: req.user!.platformRole,
    tenantId: targetTenantId,
    role: req.user!.role,
    userFunction: req.user!.userFunction,
    ...(req.user!.partnerId ? { partnerId: req.user!.partnerId } : {}),
  });

  // ── 5. Registrar troca para auditoria (fire-and-forget) ──────────────
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.ip ??
    null;

  db.insert(tenantSwitchLogTable)
    .values({
      userId,
      fromTenantId: currentTenantId,
      toTenantId: targetTenantId,
      organizacaoId,
      ipAddress: ip,
    })
    .catch(() => {});

  res.json({ token: newToken, tenantId: targetTenantId });
});

export default router;
