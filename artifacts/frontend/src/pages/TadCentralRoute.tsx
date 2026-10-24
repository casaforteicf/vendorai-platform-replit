import { useEffect, useState } from "react";
import {
  getGetTenantQueryKey,
  getGetBusinessProfileByTenantQueryKey,
  useGetBusinessProfileByTenant,
  useGetTenant,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import TadCentral from "./TadCentral";
import type { LauncherModule } from "@/lib/adaptiveModuleLauncher";

type NavItem = { moduleKey?: string; key?: string; isEnabled?: boolean };
const MAPPING: Record<string, LauncherModule> = {
  leads: "crm", prospector: "prospector", campaigns: "marketing", content: "marketing", scheduler: "agenda", arch: "arqdor",
  obras: "obras", financeiro: "erp", praca_ai: "marketplace_casa", settings: "configuracoes", analytics: "inteligencia",
  vendi_studio: "vendi_studio",
  sdr: "agentes_ia",
  dashboard: "suporte",
};
/**
 * TAD central: require both tenant entitlement and verified user permission.
 * Failed authorization checks must never expose a clickable module.
 */
export default function TadCentralRoute() {
  const { user, token, tenantOverride } = useAuth();
  const [enabled, setEnabled] = useState<LauncherModule[]>([]);
  const [failed, setFailed] = useState(false);
  const [permitted, setPermitted] = useState<LauncherModule[]>([]);
  const tenantId = user?.tenantId ?? "";

  // Nome da empresa para o seletor de tenant — mesma fonte do SidebarLayout.
  const tenantQuery = useGetTenant(tenantId, {
    query: { queryKey: getGetTenantQueryKey(tenantId), enabled: !!tenantId && !!token, staleTime: 5 * 60_000 },
  });
  const businessProfileQuery = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId && !!token, staleTime: 5 * 60_000 },
  });
  const companyName =
    businessProfileQuery.data?.nomeFantasia?.trim() ||
    businessProfileQuery.data?.razaoSocial?.trim() ||
    tenantQuery.data?.name?.trim() ||
    tenantOverride?.name ||
    (user as { tenantName?: string | null } | null)?.tenantName?.trim() ||
    undefined;

  useEffect(() => {
    if (!user?.tenantId || !token) return;
    const controller = new AbortController();
    setFailed(false);
    setEnabled([]);
    setPermitted([]);
    Promise.all([
      fetch(`/api/tenants/${encodeURIComponent(user.tenantId)}/nav-modules`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      }),
      fetch(`/api/tenants/${encodeURIComponent(user.tenantId)}/tad-effective-modules`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      }),
    ]).then(async ([modulesResponse, rightsResponse]) => {
      if (!modulesResponse.ok || !rightsResponse.ok) throw new Error("Access verification failed");
      const modules: unknown = await modulesResponse.json();
      const rights: unknown = await rightsResponse.json();
      if (!Array.isArray(modules) || !rights || typeof rights !== "object" ||
          !("permittedModuleKeys" in rights) || !Array.isArray(rights.permittedModuleKeys)) {
        throw new Error("Invalid access verification data");
      }
      const enabledKeys = modules.filter((item: NavItem) => item.isEnabled === true)
        .map((item: NavItem) => MAPPING[item.moduleKey ?? item.key ?? ""])
        .filter((key): key is LauncherModule => Boolean(key));
      const permittedKeys = rights.permittedModuleKeys
        .filter((key: unknown): key is string => typeof key === "string")
        .map((key: string) => MAPPING[key])
        .filter((key): key is LauncherModule => Boolean(key));
      if (!controller.signal.aborted) {
        setEnabled([...new Set(enabledKeys)]);
        setPermitted([...new Set(permittedKeys)]);
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setEnabled([]);
        setPermitted([]);
        setFailed(true);
      }
    });
    return () => controller.abort();
  }, [user?.tenantId, token]);
  return (
    <>
      {failed && <div role="alert" className="mx-auto max-w-7xl px-4 pt-4 text-sm text-destructive">
        Não foi possível conferir os serviços habilitados. Nenhum acesso adicional foi liberado.
      </div>}
      <TadCentral audience="business" enabledModules={enabled}
        permittedModules={permitted} previewModules={enabled}
        companyName={companyName} />
    </>
  );
}
