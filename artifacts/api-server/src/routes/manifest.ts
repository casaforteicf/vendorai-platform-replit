import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  appInstancesTable,
  appInstanceVersionsTable,
  appTemplateVersionsTable,
  db,
  tenantsTable,
} from "@workspace/db";

const router: IRouter = Router();

const GENERIC_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const PUBLIC_APP_FIELDS = new Set(["name", "slug", "theme", "navigation", "whiteLabel"]);

type JsonObject = Record<string, unknown>;

type PublicRuntimePolicy = {
  enabled: boolean;
  fields: string[];
  settingsKeys: string[];
  templateKeys: string[];
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
      // Não sabemos o tamanho real da imagem que o lojista subiu — os
      // navegadores escalam sem problema, então usa a mesma URL nas 3
      // entradas em vez de gerar variações que não existem.
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
    theme_color: "#1E3A5F",
    lang: "pt-BR",
    icons,
  });
});

/**
 * Manifesto público e sanitizado de uma App Instance publicada.
 *
 * Default deny: publicar um app NÃO o torna automaticamente público. O próprio
 * snapshot publicado precisa declarar settings.runtimeAccess.public.enabled=true
 * e listar os campos liberados. A regra é universal e não conhece nichos.
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

  if (!snapshot?.templateVersionId) {
    res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
    return;
  }

  const policy = publicRuntimePolicy(snapshot.definition);
  if (!policy.enabled) {
    // Mesma resposta de inexistência para não revelar apps privados.
    res.status(404).json({ error: "APP_MANIFEST_NOT_FOUND" });
    return;
  }

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

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("ETag", `W/\"app-${app.id}-v${snapshot.version}\"`);
  res.json({
    manifestVersion: 1,
    appInstanceId: app.id,
    publishedVersionId: snapshot.id,
    publishedVersion: snapshot.version,
    publishedAt: snapshot.publishedAt,
    app: sanitizePublishedDefinition(snapshot.definition, policy),
    template: {
      versionId: templateVersion.id,
      version: templateVersion.version,
      definition: pickKeys(templateVersion.definition, policy.templateKeys),
    },
  });
});

export default router;
