import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appInstanceVersionsTable,
  appInstancesTable,
  appTemplateVersionsTable,
  appUserMembershipsTable,
  appUsersTable,
  db,
} from "@workspace/db";
import { verifyAppUserToken, type AppUserJwtPayload } from "../lib/app_user_jwt.js";
import {
  applyRuntimeBindings,
  type AppRuntimeBindingContext,
} from "../lib/app_runtime_bindings.js";
import {
  normalizeRuntimeDataSourceKeys,
  resolveRuntimeDataSources,
  runtimeDataSourceBindings,
  type RuntimeViewer,
} from "../lib/app_runtime_data_sources.js";
import {
  loadInteractiveRuntimeActions,
  type RuntimeActionDescriptor,
} from "../lib/app_runtime_actions.js";
import { resolveAppTenantBranding } from "../lib/app_tenant_branding.js";

const router: IRouter = Router();
type JsonObject = Record<string, unknown>;
type AppUserRequest = Request & { appUser?: AppUserJwtPayload };

type SanitizedRuntime = {
  definition: JsonObject;
  dataSourceKeys: string[];
};

const ALLOWED_BLOCK_TYPES = new Set(["hero", "text", "callout", "metrics", "list", "cards", "divider", "action_form"]);
const ALLOWED_TONES = new Set(["neutral", "info", "success", "warning", "danger"]);
const ACTION_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const MAX_RUNTIME_DATA_SOURCES = 20;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function stringArray(value: unknown, maxItems = 50, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function safeImageUrl(value: unknown): string | undefined {
  const candidate = text(value, 1200);
  if (!candidate) return undefined;
  if (candidate.startsWith("/")) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function authEnabled(definition: unknown): boolean {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  return auth.enabled === true && stringArray(auth.methods).includes("email_code");
}

function enabledActionKeys(definition: unknown): string[] {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const actions = asObject(runtimeAccess.actions);
  if (actions.enabled !== true) return [];
  return stringArray(actions.keys, 30, 100).filter((key) => ACTION_KEY_PATTERN.test(key));
}

function visibleTo(value: unknown, roleKey: string, permissions: string[]): boolean {
  const visibility = asObject(value);
  const roles = stringArray(visibility.roles, 30, 80);
  const required = stringArray(visibility.permissions, 50, 120);
  const mode = visibility.permissionMode === "any" ? "any" : "all";
  if (roles.length > 0 && !roles.includes(roleKey)) return false;
  if (required.length === 0) return true;
  const current = new Set(permissions);
  return mode === "any" ? required.some((permission) => current.has(permission)) : required.every((permission) => current.has(permission));
}

function collectBlockDataSources(value: unknown, target: Set<string>): void {
  for (const sourceKey of normalizeRuntimeDataSourceKeys(value)) {
    if (target.size >= MAX_RUNTIME_DATA_SOURCES) return;
    target.add(sourceKey);
  }
}

function sanitizeMetricItem(value: unknown): JsonObject | null {
  const source = asObject(value);
  const label = text(source.label, 100);
  const metricValue = text(source.value, 100);
  if (!label || !metricValue) return null;
  return {
    label,
    value: metricValue,
    ...(text(source.detail, 300) ? { detail: text(source.detail, 300) } : {}),
  };
}

function sanitizeListItem(value: unknown): JsonObject | null {
  const source = asObject(value);
  const title = text(source.title, 150);
  const body = text(source.body, 800);
  const label = text(source.label, 80);
  if (!title && !body && !label) return null;
  return {
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    ...(label ? { label } : {}),
  };
}

function sanitizeCardItem(value: unknown): JsonObject | null {
  const source = asObject(value);
  const title = text(source.title, 150);
  if (!title) return null;
  const body = text(source.body, 1000);
  const badge = text(source.badge, 80);
  const imageUrl = safeImageUrl(source.imageUrl);
  return {
    title,
    ...(body ? { body } : {}),
    ...(badge ? { badge } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function schemaTypes(schema: JsonObject): string[] {
  if (typeof schema.type === "string") return [schema.type];
  return stringArray(schema.type, 6, 20);
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function actionFieldType(name: string, schema: JsonObject): string | null {
  const types = schemaTypes(schema);
  const enumValues = stringArray(schema.enum, 50, 160);
  if (enumValues.length > 0) return "select";
  if (types.includes("boolean")) return "checkbox";
  if (types.includes("number") || types.includes("integer")) return "number";
  if (!types.includes("string")) return null;
  if (schema.format === "email") return "email";
  if (/phone|telefone|celular/i.test(name)) return "tel";
  if (/message|description|descricao|notes|observa|body/i.test(name)) return "textarea";
  return "text";
}

function sanitizeActionField(
  value: unknown,
  schemaProperties: JsonObject,
  requiredNames: Set<string>,
): JsonObject | null {
  const source = asObject(value);
  const name = text(source.name, 100);
  if (!name || !FIELD_NAME_PATTERN.test(name) || !Object.prototype.hasOwnProperty.call(schemaProperties, name)) return null;
  const fieldSchema = asObject(schemaProperties[name]);
  const type = actionFieldType(name, fieldSchema);
  if (!type) return null;
  const options = type === "select" ? stringArray(fieldSchema.enum, 50, 160) : [];
  return {
    name,
    label: text(source.label, 120) ?? humanizeFieldName(name),
    type,
    required: requiredNames.has(name) || source.required === true,
    ...(text(source.placeholder, 200) ? { placeholder: text(source.placeholder, 200) } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

function defaultActionFields(descriptor: RuntimeActionDescriptor): JsonObject[] {
  const schema = asObject(descriptor.inputSchema);
  const properties = asObject(schema.properties);
  const requiredNames = new Set(stringArray(schema.required, 50, 100));
  return Object.keys(properties)
    .slice(0, 20)
    .map((name) => sanitizeActionField({ name }, properties, requiredNames))
    .filter((field): field is JsonObject => Boolean(field));
}

function sanitizeActionForm(
  props: JsonObject,
  descriptors: Map<string, RuntimeActionDescriptor>,
): JsonObject | null {
  const actionKey = text(props.actionKey, 100);
  if (!actionKey || !ACTION_KEY_PATTERN.test(actionKey)) return null;
  const descriptor = descriptors.get(actionKey);
  if (!descriptor) return null;

  const schema = asObject(descriptor.inputSchema);
  const properties = asObject(schema.properties);
  const requiredNames = new Set(stringArray(schema.required, 50, 100));
  const configuredFields = Array.isArray(props.fields)
    ? props.fields
        .map((field) => sanitizeActionField(field, properties, requiredNames))
        .filter((field): field is JsonObject => Boolean(field))
        .slice(0, 20)
    : [];
  const fields = configuredFields.length > 0 ? configuredFields : defaultActionFields(descriptor);
  if (fields.length === 0) return null;

  const rawMinProperties = typeof schema.minProperties === "number" ? schema.minProperties : 0;
  const minProperties = Number.isFinite(rawMinProperties)
    ? Math.max(0, Math.min(fields.length, Math.floor(rawMinProperties)))
    : 0;

  return {
    actionKey,
    fields,
    minProperties,
    title: text(props.title, 180) ?? "Formulário",
    ...(text(props.body, 1600) ? { body: text(props.body, 1600) } : {}),
    submitLabel: text(props.submitLabel, 100) ?? "Enviar",
    successMessage: text(props.successMessage, 300) ?? "Dados salvos com sucesso.",
  };
}

function sanitizeBlock(
  value: unknown,
  index: number,
  roleKey: string,
  permissions: string[],
  dataSourceKeys: Set<string>,
  actionDescriptors: Map<string, RuntimeActionDescriptor>,
): JsonObject | null {
  const source = asObject(value);
  const type = text(source.type, 40);
  if (!type || !ALLOWED_BLOCK_TYPES.has(type) || !visibleTo(source.visibility, roleKey, permissions)) return null;

  collectBlockDataSources(source.dataSources, dataSourceKeys);

  const props = asObject(source.props);
  const id = text(source.id, 100) ?? `block-${index + 1}`;
  const base: JsonObject = { id, type };

  if (type === "hero") {
    const title = text(props.title, 180);
    if (!title) return null;
    const align = props.align === "center" ? "center" : "left";
    return {
      ...base,
      props: {
        title,
        align,
        ...(text(props.eyebrow, 100) ? { eyebrow: text(props.eyebrow, 100) } : {}),
        ...(text(props.body, 2000) ? { body: text(props.body, 2000) } : {}),
        ...(text(props.badge, 80) ? { badge: text(props.badge, 80) } : {}),
        ...(safeImageUrl(props.imageUrl) ? { imageUrl: safeImageUrl(props.imageUrl) } : {}),
      },
    };
  }

  if (type === "text") {
    const body = text(props.body, 6000);
    if (!body) return null;
    return { ...base, props: { ...(text(props.title, 160) ? { title: text(props.title, 160) } : {}), body } };
  }

  if (type === "callout") {
    const body = text(props.body, 3000);
    if (!body) return null;
    const tone = typeof props.tone === "string" && ALLOWED_TONES.has(props.tone) ? props.tone : "neutral";
    return { ...base, props: { ...(text(props.title, 160) ? { title: text(props.title, 160) } : {}), body, tone } };
  }

  if (type === "metrics") {
    const items = Array.isArray(props.items) ? props.items.map(sanitizeMetricItem).filter(Boolean).slice(0, 12) : [];
    if (items.length === 0) return null;
    return { ...base, props: { ...(text(props.title, 160) ? { title: text(props.title, 160) } : {}), items } };
  }

  if (type === "list") {
    const items = Array.isArray(props.items) ? props.items.map(sanitizeListItem).filter(Boolean).slice(0, 30) : [];
    if (items.length === 0) return null;
    return { ...base, props: { ...(text(props.title, 160) ? { title: text(props.title, 160) } : {}), items } };
  }

  if (type === "cards") {
    const items = Array.isArray(props.items) ? props.items.map(sanitizeCardItem).filter(Boolean).slice(0, 24) : [];
    if (items.length === 0) return null;
    return { ...base, props: { ...(text(props.title, 160) ? { title: text(props.title, 160) } : {}), items } };
  }

  if (type === "action_form") {
    const actionProps = sanitizeActionForm(props, actionDescriptors);
    return actionProps ? { ...base, props: actionProps } : null;
  }

  return { ...base, props: { ...(text(props.label, 100) ? { label: text(props.label, 100) } : {}) } };
}

function sanitizeRuntime(
  value: unknown,
  roleKey: string,
  permissions: string[],
  actionDescriptors: Map<string, RuntimeActionDescriptor>,
): SanitizedRuntime {
  const source = asObject(value);
  const dataSourceKeys = new Set<string>();
  const rawPages = Array.isArray(source.pages) ? source.pages.slice(0, 50) : [];
  const pages = rawPages.flatMap((pageValue, pageIndex) => {
    const page = asObject(pageValue);
    if (!visibleTo(page.visibility, roleKey, permissions)) return [];
    const id = text(page.id, 100) ?? `page-${pageIndex + 1}`;
    const title = text(page.title, 160) ?? id;
    const blocks = Array.isArray(page.blocks)
      ? page.blocks
          .map((block, blockIndex) =>
            sanitizeBlock(
              block,
              blockIndex,
              roleKey,
              permissions,
              dataSourceKeys,
              actionDescriptors,
            ),
          )
          .filter(Boolean)
          .slice(0, 100)
      : [];
    return [{
      id,
      title,
      ...(text(page.subtitle, 300) ? { subtitle: text(page.subtitle, 300) } : {}),
      ...(text(page.icon, 80) ? { icon: text(page.icon, 80) } : {}),
      blocks,
    }];
  });
  const requestedDefault = text(source.defaultPageId, 100);
  const defaultPageId = requestedDefault && pages.some((page) => page.id === requestedDefault) ? requestedDefault : pages[0]?.id ?? null;
  return {
    definition: { version: 1, defaultPageId, pages },
    dataSourceKeys: Array.from(dataSourceKeys).slice(0, MAX_RUNTIME_DATA_SOURCES),
  };
}

function sanitizeTheme(value: unknown): JsonObject {
  const source = asObject(value);
  return Object.fromEntries([
    ["primaryColor", text(source.primaryColor, 40)],
    ["primary", text(source.primary, 40)],
    ["surfaceColor", text(source.surfaceColor, 40)],
    ["backgroundColor", text(source.backgroundColor, 40)],
    ["radius", text(source.radius, 30)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function sanitizeWhiteLabel(value: unknown): JsonObject {
  const source = asObject(value);
  const logoUrl = safeImageUrl(source.logoUrl) ?? safeImageUrl(source.logo) ?? safeImageUrl(source.iconUrl) ?? safeImageUrl(source.appIcon);
  return {
    ...(logoUrl ? { logoUrl } : {}),
    ...(text(source.appName, 120) ? { appName: text(source.appName, 120) } : {}),
  };
}

function sanitizeNavigation(value: unknown, pageIds: Set<string>): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const source = asObject(item);
    const label = text(source.label, 120) ?? text(source.title, 120) ?? text(source.name, 120);
    const pageId = text(source.pageId, 100) ?? text(source.key, 100) ?? text(source.id, 100);
    if (!label || !pageId || !pageIds.has(pageId)) return [];
    return [{ id: text(source.id, 100) ?? `nav-${index + 1}`, label, pageId, ...(text(source.icon, 80) ? { icon: text(source.icon, 80) } : {}) }];
  }).slice(0, 50);
}

const authenticateAppUser: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "UNAUTHENTICATED" }); return; }
  try {
    (req as AppUserRequest).appUser = verifyAppUserToken(authHeader.slice(7), String(req.params.appId));
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHENTICATED" }); return;
  }
};

router.get("/app-runtime/apps/:appId/runtime", authenticateAppUser, async (req, res) => {
  const identity = (req as AppUserRequest).appUser!;
  const appId = String(req.params.appId);

  const [app] = await db
    .select({ id: appInstancesTable.id, tenantId: appInstancesTable.tenantId, templateId: appInstancesTable.templateId })
    .from(appInstancesTable)
    .where(and(eq(appInstancesTable.id, appId), eq(appInstancesTable.status, "published")))
    .limit(1);
  if (!app || app.tenantId !== identity.tenantId) return res.status(401).json({ error: "UNAUTHENTICATED" });

  const [snapshot] = await db
    .select({
      id: appInstanceVersionsTable.id,
      version: appInstanceVersionsTable.version,
      definition: appInstanceVersionsTable.definition,
      templateVersionId: appInstanceVersionsTable.templateVersionId,
      publishedAt: appInstanceVersionsTable.publishedAt,
    })
    .from(appInstanceVersionsTable)
    .where(and(
      eq(appInstanceVersionsTable.tenantId, app.tenantId),
      eq(appInstanceVersionsTable.appInstanceId, app.id),
      eq(appInstanceVersionsTable.status, "published"),
    ))
    .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
    .limit(1);
  if (!snapshot?.templateVersionId || !authEnabled(snapshot.definition)) return res.status(401).json({ error: "UNAUTHENTICATED" });

  const [current] = await db
    .select({
      id: appUsersTable.id,
      leadId: appUsersTable.leadId,
      userStatus: appUsersTable.status,
      displayName: appUsersTable.displayName,
      email: appUsersTable.email,
      phone: appUsersTable.phone,
      locale: appUsersTable.locale,
      membershipStatus: appUserMembershipsTable.status,
      roleKey: appUserMembershipsTable.roleKey,
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
    .select({ id: appTemplateVersionsTable.id, version: appTemplateVersionsTable.version, definition: appTemplateVersionsTable.definition })
    .from(appTemplateVersionsTable)
    .where(and(eq(appTemplateVersionsTable.id, snapshot.templateVersionId), eq(appTemplateVersionsTable.templateId, app.templateId)))
    .limit(1);
  if (!templateVersion) return res.status(404).json({ error: "RUNTIME_NOT_FOUND" });

  const snapshotDefinition = asObject(snapshot.definition);
  const templateDefinition = asObject(templateVersion.definition);
  const appName = text(snapshotDefinition.name, 120) ?? "Aplicativo";
  const branding = await resolveAppTenantBranding(
    app.tenantId,
    appName,
    snapshotDefinition.theme,
    snapshotDefinition.whiteLabel,
  );
  const permissions = current.permissions ?? [];
  const baseBindings: AppRuntimeBindingContext = {
    "viewer.name": current.displayName ?? "",
    "viewer.email": current.email ?? "",
    "viewer.phone": current.phone ?? "",
    "viewer.locale": current.locale ?? "",
    "viewer.role": current.roleKey,
    "app.name": appName,
  };
  const interactiveActions = await loadInteractiveRuntimeActions(
    enabledActionKeys(snapshotDefinition),
    permissions,
  );

  const sanitized = sanitizeRuntime(
    templateDefinition.runtime,
    current.roleKey,
    permissions,
    interactiveActions,
  );
  const viewer: RuntimeViewer = {
    id: current.id,
    tenantId: app.tenantId,
    leadId: current.leadId,
    displayName: current.displayName,
    email: current.email,
    phone: current.phone,
    locale: current.locale,
    roleKey: current.roleKey,
    permissions,
  };
  const dataSourceResolutions = await resolveRuntimeDataSources(
    sanitized.dataSourceKeys,
    {
      tenantId: app.tenantId,
      appInstanceId: app.id,
      viewer,
    },
  );
  const runtimeBindings: AppRuntimeBindingContext = {
    ...baseBindings,
    ...runtimeDataSourceBindings(dataSourceResolutions),
  };

  const runtime = applyRuntimeBindings(
    sanitized.definition,
    runtimeBindings,
  ) as JsonObject;
  const pageIds = new Set((runtime.pages as JsonObject[]).map((page) => String(page.id)));
  const navigation = applyRuntimeBindings(
    sanitizeNavigation(snapshotDefinition.navigation, pageIds),
    baseBindings,
  ) as JsonObject[];

  res.setHeader("Cache-Control", "private, no-store");
  return res.json({
    runtimeVersion: 1,
    bindingVersion: 2,
    publishedVersionId: snapshot.id,
    publishedVersion: snapshot.version,
    publishedAt: snapshot.publishedAt,
    app: {
      id: app.id,
      name: appName,
      slug: text(snapshotDefinition.slug, 100) ?? "",
      theme: sanitizeTheme(branding.theme),
      whiteLabel: sanitizeWhiteLabel(branding.whiteLabel),
      navigation,
    },
    template: { versionId: templateVersion.id, version: templateVersion.version },
    runtime,
  });
});

export default router;
