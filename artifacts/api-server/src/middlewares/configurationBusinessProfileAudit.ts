import type { RequestHandler } from "express";
import { db, businessProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeConfigurationAudit } from "../lib/configuration-audit";

function isSuccessfulWrite(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function actorFromRequest(req: any) {
  return {
    userId: req.user?.id ?? null,
    ip: req.ip ?? null,
  };
}

/**
 * Audita somente mutações do Perfil/Empresa feitas pelas rotas canônicas de
 * business_profiles. Fica antes do router existente para não duplicar regras
 * de negócio nem alterar o contrato da API.
 */
export const configurationBusinessProfileAudit: RequestHandler = async (req, res, next) => {
  const method = req.method.toUpperCase();
  const isCreate = method === "POST" && req.path === "/business-profiles";
  const match = req.path.match(/^\/business-profiles\/([^/]+)$/);
  const isUpdate = method === "PATCH" && Boolean(match);
  const isDelete = method === "DELETE" && Boolean(match);

  if (!isCreate && !isUpdate && !isDelete) {
    next();
    return;
  }

  const profileId = match?.[1] ? decodeURIComponent(match[1]) : null;
  const before = profileId
    ? await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId)).limit(1).then((rows) => rows[0] ?? null)
    : null;

  res.once("finish", () => {
    if (!isSuccessfulWrite(res.statusCode)) return;

    void (async () => {
      if (isCreate) {
        const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : req.user?.tenantId;
        if (!tenantId) return;
        const after = await db.select().from(businessProfilesTable)
          .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1)
          .then((rows) => rows[0] ?? null);
        if (!after) return;
        const audited = await writeConfigurationAudit({
          tenantId,
          action: "criar",
          entity: "business_profile",
          entityId: after.id,
          after,
          actor: actorFromRequest(req),
        });
        if (!audited) req.log?.warn({ tenantId, entityId: after.id }, "configuracoes: falha ao auditar criação do perfil");
        return;
      }

      if (!before || !profileId) return;

      if (isDelete) {
        const audited = await writeConfigurationAudit({
          tenantId: before.tenantId,
          action: "excluir",
          entity: "business_profile",
          entityId: profileId,
          before,
          actor: actorFromRequest(req),
        });
        if (!audited) req.log?.warn({ tenantId: before.tenantId, entityId: profileId }, "configuracoes: falha ao auditar exclusão do perfil");
        return;
      }

      const after = await db.select().from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, profileId)).limit(1)
        .then((rows) => rows[0] ?? null);
      if (!after) return;
      const audited = await writeConfigurationAudit({
        tenantId: before.tenantId,
        action: "atualizar",
        entity: "business_profile",
        entityId: profileId,
        before,
        after,
        actor: actorFromRequest(req),
      });
      if (!audited) req.log?.warn({ tenantId: before.tenantId, entityId: profileId }, "configuracoes: falha ao auditar atualização do perfil");
    })().catch((error) => {
      req.log?.warn({ error, profileId }, "configuracoes: auditoria do perfil indisponível");
    });
  });

  next();
};
