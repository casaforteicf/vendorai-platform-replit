import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appActionRegistryTable,
  appInstanceVersionsTable,
  appInstancesTable,
  appTemplateVersionsTable,
  appUserMembershipsTable,
  appUsersTable,
  db,
} from "@workspace/db";
import { verifyAppUserToken, type AppUserJwtPayload } from "../lib/app_user_jwt.js";

const router: IRouter = Router();
type JsonObject = Record<string, unknown>;
type AppUserRequest = Request & { appUser?: AppUserJwtPayload };

const ACTION_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_ITEMS = 40;
const MAX_FIELDS = 20;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function stringArray(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

function authEnabled(definition: unknown): boolean {
  const settings = asObject(asObject(definition).settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  return auth.enabled === true && stringArray(auth.methods).includes("email_code");
}

function enabledActionKeys(definition: unknown): Set<string> {
  const settings = asObject(asObject(definition).settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const actions = asObject(runtimeAccess.actions);
  if (actions.enabled !== true) return new Set();
  return new Set(stringArray(actions.keys).filter((key) => ACTION_KEY_PATTERN.test(key)));
}

function hasPermissions(current: string[], required: unknown): boolean {
  const needed = stringArray(required, 50);
  if (needed.length === 0) return true;
  const granted = new Set(current);
  return needed.every((permission) => granted.has(permission));
}

function safePrimitiveObject(value: unknown): JsonObject {
  const source = asObject(value);
  const entries = Object.entries(source).flatMap(([key, item]) => {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) return [];
    if (typeof item === "string") return [[key, item.slice(0, 500)] as [string, unknown]];
    if (typeof item === "number" && Number.isFinite(item)) return [[key, item] as [string, unknown]];
    if (typeof item === "boolean" || item === null) return [[key, item] as [string, unknown]];
    return [];
  }).slice(0, 20);
  return Object.fromEntries(entries);
}

function inputPropertyKeys(schema: unknown): Set<string> {
  const properties = asObject(asObject(schema).properties);
  return new Set(Object.keys(properties).filter((key) => /^[A-Za-z0-9_.-]{1,80}$/.test(key)));
}

function sanitizeFields(value: unknown, allowedKeys: Set<string>): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const field = asObject(raw);
    const key = text(field.key, 80);
    if (!key || !allowedKeys.has(key)) return [];
    const inputType = ["text", "email", "tel", "number", "textarea"].includes(String(field.inputType)) ? String(field.inputType) : "text";
    return [{
      key,
      label: text(field.label, 120) ?? key,
      inputType,
      ...(text(field.placeholder, 160) ? { placeholder: text(field.placeholder, 160) } : {}),
      required: field.required === true,
    }];
  }).slice(0, MAX_FIELDS);
}

const authenticateAppUser: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "UNAUTHENTICATED" });
  try {
    (req as AppUserRequest).appUser = verifyAppUserToken(authHeader.slice(7), String(req.params.appId));
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
};

router.get("/app-runtime/apps/:appId/action-ui", authenticateAppUser, async (req, res) => {
  const identity = (req as AppUserRequest).appUser!;
  const appInstanceId = String(req.params.appId);

  const [app] = await db
    .select({ id: appInstancesTable.id, tenantId: appInstancesTable.tenantId, templateId: appInstancesTable.templateId })
    .from(appInstancesTable)
    .where(and(eq(appInstancesTable.id, appInstanceId), eq(appInstancesTable.status, "published")))
    .limit(1);
  if (!app || app.tenantId !== identity.tenantId) return res.status(401).json({ error: "UNAUTHENTICATED" });

  const [snapshot] = await db
    .select({ definition: appInstanceVersionsTable.definition, templateVersionId: appInstanceVersionsTable.templateVersionId })
    .from(appInstanceVersionsTable)
    .where(and(
      eq(appInstanceVersionsTable.tenantId, app.tenantId),
      eq(appInstanceVersionsTable.appInstanceId, app.id),
      eq(appInstanceVersionsTable.status, "published"),
    ))
    .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
    .limit(1);
  if (!snapshot?.templateVersionId || !authEnabled(snapshot.definition)) return res.status(401).json({ error: "UNAUTHENTICATED" });

  const allowedActions = enabledActionKeys(snapshot.definition);
  if (allowedActions.size === 0) {
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ actionUiVersion: 1, items: [] });
  }

  const [current] = await db
    .select({
      userStatus: appUsersTable.status,
      membershipStatus: appUserMembershipsTable.status,
      permissions: appUserMembershipsTable.permissions,
    })
    .from(appUserMembershipsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, appUserMembershipsTable.appUserId))
    .where(and(
      eq(appUsersTable.id, identity.sub),
      eq(appUsersTable.tenantId, app.tenantId),
      eq(appUserMembershipsTable.id, identity.membershipId),
      eq(appUserMembershipsTable.tenantId, app.tenantId),
      eq(appUserMembershipsTable.appInstanceId, app.id),
    ))
    .limit(1);
  if (!current || current.userStatus !== "active" || current.membershipStatus !== "active") return res.status(401).json({ error: "UNAUTHENTICATED" });

  const [templateVersion] = await db
    .select({ definition: appTemplateVersionsTable.definition })
    .from(appTemplateVersionsTable)
    .where(and(eq(appTemplateVersionsTable.id, snapshot.templateVersionId), eq(appTemplateVersionsTable.templateId, app.templateId)))
    .limit(1);
  if (!templateVersion) return res.status(404).json({ error: "ACTION_UI_NOT_FOUND" });

  const registryRows = await db.select().from(appActionRegistryTable).where(eq(appActionRegistryTable.status, "active"));
  const registry = new Map(registryRows.map((row) => [row.key, row]));
  const configured = asObject(templateVersion.definition).actionUi;
  const items = Array.isArray(configured) ? configured.slice(0, MAX_ITEMS) : [];
  const permissions = current.permissions ?? [];

  const sanitized = items.flatMap((raw, index) => {
    const item = asObject(raw);
    const actionKey = text(item.actionKey, 100);
    const pageId = text(item.pageId, 100);
    const kind = item.kind === "form" ? "form" : item.kind === "cta" ? "cta" : null;
    if (!actionKey || !pageId || !kind || !allowedActions.has(actionKey) || !ACTION_KEY_PATTERN.test(actionKey)) return [];
    const action = registry.get(actionKey);
    if (!action || !hasPermissions(permissions, action.requiredPermissions)) return [];
    const allowedFields = inputPropertyKeys(action.inputSchema);
    return [{
      id: text(item.id, 100) ?? `action-${index + 1}`,
      pageId,
      kind,
      actionKey,
      title: text(item.title, 180) ?? action.name,
      ...(text(item.body, 1000) ? { body: text(item.body, 1000) } : {}),
      buttonLabel: text(item.buttonLabel, 100) ?? (kind === "form" ? "Salvar" : action.name),
      successMessage: text(item.successMessage, 300) ?? "Ação concluída.",
      ...(kind === "cta" ? { input: safePrimitiveObject(item.input) } : { fields: sanitizeFields(item.fields, allowedFields) }),
    }];
  });

  res.setHeader("Cache-Control", "private, no-store");
  return res.json({ actionUiVersion: 1, items: sanitized });
});

export default router;
