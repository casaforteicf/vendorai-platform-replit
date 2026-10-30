import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appInstancesTable,
  appInstanceVersionsTable,
  appTemplateVersionsTable,
  db,
  tenantsTable,
} from "@workspace/db";
import appUserAuthRouter from "./app_user_auth";
import appUserRuntimeRouter from "./app_user_runtime";
import appUserDataSourcesRouter from "./app_user_data_sources";
import appUserActionsRouter from "./app_user_actions";
import { resolveAppTenantBranding } from "../lib/app_tenant_branding.js";

const router: IRouter = Router();

// Public App Builder authentication/runtime are intentionally mounted before the
// platform-wide JWT gate. They use the isolated App User token, never the
// internal VendorAI JWT shape.
router.use(appUserAuthRouter);
router.use(appUserRuntimeRouter);
router.use(appUserDataSourcesRouter);
router.use(appUserActionsRouter);

// Keep the generic PWA icon tied to the current Vendor.ai brand asset.
// Using the SVG avoids stale legacy raster icons on new desktop/PWA installs.
const GENERIC_ICONS = [
  { src: "/logo-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  { src: "/logo-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
];

const PUBLIC_APP_FIELDS = new Set(["name", "slug", "theme", "navigation", "whiteLabel"]);
const AUTH_SHELL_FIELDS = ["name", "theme", "whiteLabel"];
const PUBLIC_AUTH_METHODS = new Set(["email_code"]);

type JsonObject = Record<string, unknown>;

type PublicRuntimePolicy = {
  enabled: boolean;
  fields: string[];
  settingsKeys: string[];
  templateKeys: string[];
};

type RuntimeAuthCapabilities = {
  enabled: boolean;
  methods: string[];
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function publicRuntimePolicy(definition: unknown): PublicRuntimePolicy {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const publicPolicy = asObject(runtimeAccess.public);

  return {
    enabled: publicPolicy.enabled === true,
    fields: stringArray(publicPolicy.fields).filter((field) => PUBLIC_APP_FIELDS.has(field)),
    settingsKeys: stringArray(publicPolicy.settingsKeys).filter((key) => key !== "runtimeAccess"),
    templateKeys: stringArray(publicPolicy.templateKeys),
  };
}

function runtimeAuthCapabilities(definition: unknown): RuntimeAuthCapabilities {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  const methods = stringArray(auth.methods).filter((method) => PUBLIC_AUTH_METHODS.has(method));
  return {
    enabled: auth.enabled === true && methods.length > 0,
    methods,
  };
}

function pickKeys(source: unknown, keys: string[]): JsonObject {
  const object = asObject(source);
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(object, key)).map((key) => [key, object[key]]));
}

function sanitizePublishedDefinition(definition: unknown, policy: PublicRuntimePolicy): JsonObject {
  const source = asObject(definition);
  const result = pickKeys(source, policy.fields);
  if (policy.settingsKeys.length > 0) result.settings = pickKeys(source.settings, policy.settingsKeys);
  return result;
}

// Manifest do PWA é servido daqui (não do arquivo estático public/manifest.json)
// pra poder trocar nome/ícone pelo do tenant quando o lojista instala pelo
// link exclusivo dele (<slug>.app.appvendorai.com). Sem logo cadastrada, ou
// acessando pelo host genérico (app.appvendorai.com), cai no ícone padrão
// do Vendor.ai.
router.get("/manifest.json", async (req, res) => {
  const hostname = req.hostname || "";
  const match = hostname.match(/^([a-z0-9-]+)\.app\.appvendorai\.com$/);
  const slug = match?.[1] ?? null;

  let name = "Vendor.ai — Inteligência Comercial";
  let shortName = "Vendor.ai";
  let icons = GENERIC_ICONS;

  if (slug) {
    const [tenant] = await db.select({ name: tenantsTable.name, logoUrl: tenantsTable.logoUrl })
      .from(tenantsTable)
      .where(eq(tenantsTable.subdomainSlug, slug));

    if (tenant?.logoUrl) {
      name = tenant.name;
      shortName = tenant.name.substring(0, 30);
      icons = [
        { src: tenant.logoUrl, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: tenant.logoUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: tenant.logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
    } else if (tenant?.name) {
      name = tenant.name;
      shortName = tenant.name.substring(0, 30);
    }
  }

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    name,
    short_name: shortName,
    description: "CRM, conversas, agendamentos e IA em uma única interface pensada para velocidade e densidade de informação.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    lang: "pt-BR",
    icons,
  });
});

/**
 * Manifesto sanitizado de uma App Instance publicada.
 *
 * Default deny: publicar um app NÃO o torna automaticamente público. Existem
 * duas formas explícitas de habilitar uma superfície externa:
 * - runtimeAccess.public libera somente os campos allowlisted pelo SuperAdmin;
 * - runtimeAccess.auth libera apenas a identidade mínima do shell de login.
 *
 * Um app privado com autenticação habilitada não expõe navegação, settings nem
 * template antes da sessão. A regra é universal e não conhece nichos.
 */
router.get("/app-runtime/apps/:appId/manifest", async (req, res) => {
  const appInstanceId = String(req.params.appId);

  const [app] = await db
    .select({ id: appInstancesTable.id, tenantId: appInstancesTable.tenantId, templateId: appInstancesTable.templateId })
    .from(appInstancesTable)
    .where(and(eq(appInstancesTable.id, appInstanceId), eq(appInstancesTable.status, "published")));

  if (!app) {
    res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
    return;
  }

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

  if (!snapshot) {
    res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
    return;
  }

  const policy = publicRuntimePolicy(snapshot.definition);
  const auth = runtimeAuthCapabilities(snapshot.definition);
  if (!policy.enabled && !auth.enabled) {
    res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
    return;
  }

  let template: { versionId: string; version: number; definition: JsonObject } | undefined;
  if (policy.enabled && snapshot.templateVersionId) {
    const [templateVersion] = await db
      .select({ id: appTemplateVersionsTable.id, version: appTemplateVersionsTable.version, definition: appTemplateVersionsTable.definition })
      .from(appTemplateVersionsTable)
      .where(and(
        eq(appTemplateVersionsTable.id, snapshot.templateVersionId),
        eq(appTemplateVersionsTable.templateId, app.templateId),
      ));

    if (!templateVersion) {
      res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
      return;
    }

    template = {
      versionId: templateVersion.id,
      version: templateVersion.version,
      definition: pickKeys(templateVersion.definition, policy.templateKeys),
    };
  }

  const appDefinition = policy.enabled
    ? sanitizePublishedDefinition(snapshot.definition, policy)
    : pickKeys(snapshot.definition, AUTH_SHELL_FIELDS);
  const publishedDefinition = asObject(snapshot.definition);
  const branding = await resolveAppTenantBranding(
    app.tenantId,
    typeof appDefinition.name === "string" ? appDefinition.name : "Aplicativo",
    publishedDefinition.theme,
    publishedDefinition.whiteLabel,
  );
  appDefinition.theme = branding.theme;
  appDefinition.whiteLabel = branding.whiteLabel;

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  const brandingDigest = createHash("sha256").update(JSON.stringify(branding)).digest("hex").slice(0, 12);
  res.setHeader("ETag", `W/\"app-${app.id}-v${snapshot.version}-${brandingDigest}\"`);
  res.json({
    manifestVersion: 2,
    appInstanceId: app.id,
    publishedVersionId: snapshot.id,
    publishedVersion: snapshot.version,
    publishedAt: snapshot.publishedAt,
    capabilities: {
      publicContent: policy.enabled,
      auth,
    },
    app: appDefinition,
    ...(template ? { template } : {}),
  });
});

export default router;
