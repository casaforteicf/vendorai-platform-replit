import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import TadCentral from "./TadCentral";
import type { LauncherModule } from "@/lib/adaptiveModuleLauncher";

type NavItem = { moduleKey?: string; key?: string; isEnabled?: boolean };
const MAPPING: Record<string, LauncherModule> = {
  leads: "crm", campaigns: "marketing", content: "marketing", scheduler: "agenda", arch: "arqdor",
  obras: "obras", financeiro: "erp", praca_ai: "marketplace_casa", settings: "configuracoes", analytics: "inteligencia",
  sdr: "agentes_ia",
};
/**
 * TAD central: require both tenant entitlement and verified user permission.
 * Failed authorization checks must never expose a clickable module.
 */
export default function TadCentralRoute() {
  const { user, token } = useAuth();
  const [enabled, setEnabled] = useState<LauncherModule[]>([]);
  const [failed, setFailed] = useState(false);
  const [permitted, setPermitted] = useState<LauncherModule[]>([]);
  useEffect(() => {
    if (!user?.tenantId || !token) return;
    const controller = new AbortController();
    setFailed(false);
    setEnabled([]);
    setPermitted([]);
    Promise.all([fetch(`/api/tenants/${encodeURIComponent(user.tenantId)}/nav-modules`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }), fetch(`/api/tenants/${encodeURIComponent(user.tenantId)}/tad-effective-modules`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    })]).then(async ([response, rightsResponse]) => {
      if (!rightsResponse.ok || !response.ok) throw new Error("Unable to verify module access");
      const rights: unknown = await rightsResponse.json();
      if (!rights || typeof rights !== "object" || !("permittedModuleKeys" in rights) || !Array.isArray(rights.permittedModuleKeys)) throw new Error("Invalid permissions response");
      const verified = rights.permittedModuleKeys.filter((key: unknown): key is string => typeof key === "string")
        .map((key: string) => MAPPING[key]).filter((key): key is LauncherModule => Boolean(key));
      if (!controller.signal.aborted) setPermitted([...new Set(verified)]);
      if (!response.ok) throw new Error("Unable to load tenant services");
      return response.json();
    }).then((items: unknown) => {
      if (!Array.isArray(items)) throw new Error("Invalid module permissions response");
      const keys = items.filter((item: NavItem) => item.isEnabled === true)
        .map((item: NavItem) => MAPPING[item.moduleKey ?? item.key ?? ""])
        .filter((item): item is LauncherModule => Boolean(item));
      if (!controller.signal.aborted) setEnabled([...new Set(keys)]);
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
        permittedModules={permitted} previewModules={enabled} companyName={undefined} />
    </>
  );
}
