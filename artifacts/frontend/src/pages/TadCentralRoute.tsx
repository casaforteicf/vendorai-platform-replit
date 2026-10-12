import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import TadCentral from "./TadCentral";
import type { LauncherModule } from "@/lib/adaptiveModuleLauncher";

type NavItem = { moduleKey?: string; key?: string; isEnabled?: boolean };
const MAPPING: Record<string, LauncherModule> = {
  crm: "crm", marketing: "marketing", scheduler: "agenda", arch: "arqdor",
  obras: "obras", financeiro: "erp", praca_ai: "marketplace_casa",
};
/**
 * Conservative gateway: tenant navigation flags only indicate ENABLEMENT,
 * not a user's effective permission. No sensitive module link is granted
 * until a separate effective-permissions API has been integrated.
 */
export default function TadCentralRoute() {
  const { user, token } = useAuth();
  const [enabled, setEnabled] = useState<LauncherModule[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!user?.tenantId || !token) return;
    const controller = new AbortController();
    setFailed(false);
    setEnabled([]);
    fetch(`/api/tenants/${encodeURIComponent(user.tenantId)}/nav-modules`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Unable to load tenant services");
      return response.json();
    }).then((items: unknown) => {
      if (!Array.isArray(items)) throw new Error("Invalid module permissions response");
      const keys = items.filter((item: NavItem) => item.isEnabled === true)
        .map((item: NavItem) => MAPPING[item.moduleKey ?? item.key ?? ""])
        .filter((item): item is LauncherModule => Boolean(item));
      setEnabled([...new Set(keys)]);
    }).catch(error => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [user?.tenantId, token]);
  return (
    <>
      {failed && <div role="alert" className="mx-auto max-w-7xl px-4 pt-4 text-sm text-destructive">
        Não foi possível conferir os serviços habilitados. Nenhum acesso adicional foi liberado.
      </div>}
      <TadCentral audience="business" enabledModules={enabled}
        permittedModules={[]} companyName={undefined} />
    </>
  );
}
