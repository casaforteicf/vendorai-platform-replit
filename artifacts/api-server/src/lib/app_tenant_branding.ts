import { eq } from "drizzle-orm";
import { businessProfilesTable, db, tenantsTable } from "@workspace/db";

type JsonObject = Record<string, unknown>;

type TenantBranding = {
  tenantName?: string;
  logoUrl?: string;
  primaryColor?: string;
  faviconUrl?: string;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function omit(source: JsonObject, keys: string[]): JsonObject {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key)));
}

/** App overrides > tenant/business profile > VendorAI runtime defaults. */
export function mergeAppTenantBranding(
  appName: string,
  themeValue: unknown,
  whiteLabelValue: unknown,
  tenantBranding: TenantBranding,
) {
  const theme = asObject(themeValue);
  const whiteLabel = asObject(whiteLabelValue);
  const inheritTheme = theme.inheritFromTenant !== false;
  const inheritWhiteLabel = whiteLabel.inheritFromTenant !== false;

  const resolvedTheme = inheritTheme
    ? {
        ...omit(theme, ["primaryColor", "primary", "source"]),
        ...(tenantBranding.primaryColor ? { primaryColor: tenantBranding.primaryColor } : {}),
        inheritFromTenant: true,
        source: "tenant",
      }
    : { ...theme, inheritFromTenant: false, source: "app" };

  const resolvedWhiteLabel = inheritWhiteLabel
    ? {
        ...omit(whiteLabel, ["companyName", "logoUrl", "logo", "faviconUrl", "appName", "source"]),
        ...(tenantBranding.tenantName ? { companyName: tenantBranding.tenantName } : {}),
        ...(tenantBranding.logoUrl ? { logoUrl: tenantBranding.logoUrl } : {}),
        ...(tenantBranding.faviconUrl ? { faviconUrl: tenantBranding.faviconUrl } : {}),
        appName,
        inheritFromTenant: true,
        source: "tenant",
      }
    : { appName, ...whiteLabel, inheritFromTenant: false, source: "app" };

  return { theme: resolvedTheme, whiteLabel: resolvedWhiteLabel };
}

export async function resolveAppTenantBranding(
  tenantId: string,
  appName: string,
  themeValue: unknown,
  whiteLabelValue: unknown,
) {
  const theme = asObject(themeValue);
  const whiteLabel = asObject(whiteLabelValue);
  const inheritTheme = theme.inheritFromTenant !== false;
  const inheritWhiteLabel = whiteLabel.inheritFromTenant !== false;
  if (!inheritTheme && !inheritWhiteLabel) return mergeAppTenantBranding(appName, theme, whiteLabel, {});

  const [[tenant], [profile]] = await Promise.all([
    db.select({ name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa, logoUrl: tenantsTable.logoUrl, corPrimaria: tenantsTable.corPrimaria })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial, logoUrl: businessProfilesTable.logoUrl, faviconUrl: businessProfilesTable.faviconUrl })
      .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
  ]);

  return mergeAppTenantBranding(appName, theme, whiteLabel, {
    tenantName: text(profile?.nomeFantasia) ?? text(tenant?.nomeEmpresa) ?? text(tenant?.name) ?? text(profile?.razaoSocial),
    logoUrl: text(profile?.logoUrl) ?? text(tenant?.logoUrl),
    primaryColor: text(tenant?.corPrimaria),
    faviconUrl: text(profile?.faviconUrl),
  });
}