import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppUsersDialog from "@/components/app-builder/AppUsersDialog";
import AdminAppBuilderLegacy from "./AdminAppBuilderLegacy";
import { ExternalLink, Loader2, UserRoundCog } from "lucide-react";

type AppInstance = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
};

export default function AdminAppBuilder() {
  const { token } = useAuth();
  const [apps, setApps] = useState<AppInstance[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [usersOpen, setUsersOpen] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);

  const loadApps = useCallback(async () => {
    if (!token) return;
    setLoadingApps(true);
    try {
      const response = await fetch("/api/admin/app-builder/apps", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const rows = await response.json() as AppInstance[];
      setApps(rows);
      setSelectedAppId((current) => current && rows.some((app) => app.id === current) ? current : rows[0]?.id ?? "");
    } finally {
      setLoadingApps(false);
    }
  }, [token]);

  useEffect(() => { void loadApps(); }, [loadApps]);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppId) ?? null,
    [apps, selectedAppId],
  );

  function openRuntime() {
    if (!selectedApp) return;
    window.open(`/apps/${encodeURIComponent(selectedApp.id)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="mx-auto mb-3 flex max-w-7xl flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-3 py-2">
        <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
          <UserRoundCog className="h-4 w-4 text-primary" />
          <span>Usuários externos, papéis, permissões e login por App Instance</span>
        </div>
        <Select value={selectedAppId} onValueChange={setSelectedAppId} disabled={loadingApps || apps.length === 0}>
          <SelectTrigger className="h-9 w-full sm:w-[280px]"><SelectValue placeholder={loadingApps ? "Carregando apps..." : "Selecione o app"} /></SelectTrigger>
          <SelectContent>{apps.map((app) => <SelectItem key={app.id} value={app.id}>{app.name} · {app.status}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={openRuntime} disabled={!selectedApp || loadingApps}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir app
        </Button>
        <Button size="sm" onClick={() => setUsersOpen(true)} disabled={!selectedApp || loadingApps}>
          {loadingApps ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundCog className="mr-2 h-4 w-4" />}
          Gerenciar usuários
        </Button>
      </div>

      <AdminAppBuilderLegacy />

      <AppUsersDialog
        app={selectedApp}
        open={usersOpen}
        token={token}
        onOpenChange={setUsersOpen}
        onAppChanged={loadApps}
      />
    </>
  );
}
