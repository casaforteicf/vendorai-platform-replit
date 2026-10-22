import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appInstanceVersionsTable,
  appInstancesTable,
  appUserMembershipsTable,
  appUsersTable,
  db,
} from "@workspace/db";
import { verifyAppUserToken, type AppUserJwtPayload } from "../lib/app_user_jwt.js";
import {
  resolveRuntimeDataSource,
  type RuntimeViewer,
} from "../lib/app_runtime_data_sources.js";

const router: IRouter = Router();
type JsonObject = Record<string, unknown>;
type AppUserRequest = Request & { appUser?: AppUserJwtPayload };

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function authEnabled(definition: unknown): boolean {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  return auth.enabled === true && stringArray(auth.methods).includes("email_code");
}

const authenticateAppUser: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "UNAUTHENTICATED" }); return;
  }
  try {
    (req as AppUserRequest).appUser = verifyAppUserToken(
      authHeader.slice(7),
      String(req.params.appId),
    );
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHENTICATED" }); return;
  }
};

router.get(
  "/app-runtime/apps/:appId/data/:sourceKey",
  authenticateAppUser,
  async (req, res) => {
    const identity = (req as AppUserRequest).appUser!;
    const appInstanceId = String(req.params.appId);
    const sourceKey = String(req.params.sourceKey);

    const [app] = await db
      .select({ id: appInstancesTable.id, tenantId: appInstancesTable.tenantId })
      .from(appInstancesTable)
      .where(
        and(
          eq(appInstancesTable.id, appInstanceId),
          eq(appInstancesTable.status, "published"),
        ),
      )
      .limit(1);
    if (!app || app.tenantId !== identity.tenantId) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const [snapshot] = await db
      .select({ definition: appInstanceVersionsTable.definition })
      .from(appInstanceVersionsTable)
      .where(
        and(
          eq(appInstanceVersionsTable.tenantId, app.tenantId),
          eq(appInstanceVersionsTable.appInstanceId, app.id),
          eq(appInstanceVersionsTable.status, "published"),
        ),
      )
      .orderBy(
        desc(appInstanceVersionsTable.publishedAt),
        desc(appInstanceVersionsTable.version),
      )
      .limit(1);
    if (!snapshot || !authEnabled(snapshot.definition)) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const [current] = await db
      .select({
        id: appUsersTable.id,
        leadId: appUsersTable.leadId,
        displayName: appUsersTable.displayName,
        email: appUsersTable.email,
        phone: appUsersTable.phone,
        locale: appUsersTable.locale,
        userStatus: appUsersTable.status,
        membershipStatus: appUserMembershipsTable.status,
        roleKey: appUserMembershipsTable.roleKey,
        permissions: appUserMembershipsTable.permissions,
      })
      .from(appUserMembershipsTable)
      .innerJoin(
        appUsersTable,
        eq(appUsersTable.id, appUserMembershipsTable.appUserId),
      )
      .where(
        and(
          eq(appUsersTable.id, identity.sub),
          eq(appUsersTable.tenantId, app.tenantId),
          eq(appUserMembershipsTable.id, identity.membershipId),
          eq(appUserMembershipsTable.tenantId, app.tenantId),
          eq(appUserMembershipsTable.appInstanceId, app.id),
        ),
      )
      .limit(1);
    if (
      !current ||
      current.userStatus !== "active" ||
      current.membershipStatus !== "active"
    ) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const viewer: RuntimeViewer = {
      id: current.id,
      tenantId: app.tenantId,
      leadId: current.leadId,
      displayName: current.displayName,
      email: current.email,
      phone: current.phone,
      locale: current.locale,
      roleKey: current.roleKey,
      permissions: current.permissions ?? [],
    };

    const resolution = await resolveRuntimeDataSource(sourceKey, {
      tenantId: app.tenantId,
      appInstanceId: app.id,
      viewer,
    });

    if (resolution.status === "not_found") {
      return res.status(404).json({ error: "DATA_SOURCE_NOT_FOUND" });
    }
    if (resolution.status === "forbidden") {
      return res.status(403).json({ error: "DATA_SOURCE_FORBIDDEN" });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      dataSourceVersion: 1,
      sourceKey: resolution.sourceKey,
      data: resolution.data,
    });
  },
);

export default router;
