import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppUsersDialog from "@/components/app-builder/AppUsersDialog";
import TemplateRuntimeEditorDialog from "@/components/app-builder/TemplateRuntimeEditorDialog";
import TemplateRuntimePreviewDialog from "@/components/app-builder/TemplateRuntimePreviewDialog";
import TemplateDataSourceEditorDialog from "@/components/app-builder/TemplateDataSourceEditorDialog";
import TemplateActionEditorDialog from "@/components/app-builder/TemplateActionEditorDialog";
import AppActionPolicyDialog from "@/components/app-builder/AppActionPolicyDialog";
import AdminAppBuilderLegacy from "./AdminAppBuilderLegacy";
import { DatabaseZap, ExternalLink, FormInput, Layers3, Loader2, MonitorSmartphone, UserRoundCog, Workflow } from "lucide-react";

type AppInstance = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
};

type AppTemplate = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export default function AdminAppBuilder() {
  const { token } = useAuth();
  const [apps, setApps] = useState<AppInstance[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [usersOpen, setUsersOpen] = useState(false);
  const [appActionsOpen, setAppActionsOpen] = useState(false);
  const [runtimeEditorOpen, setRuntimeEditorOpen] = useState(false);
  const [runtimePreviewOpen, setRuntimePreviewOpen] = useState(false);
  const [dataSourceEditorOpen, setDataSourceEditorOpen] = useState(false);
  const [templateActionsOpen, setTemplateActionsOpen] = useState(false);
  const [loadingControls, setLoadingControls] = useState(false);

  const loadControls = useCallback(async () => {
    if (!token) return;
    setLoadingControls(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [appsResponse, templatesResponse] = await Promise.all([
        fetch("/api/admin/app-builder/apps", { headers }),
        fetch("/api/admin/app-builder/templates", { headers }),
      ]);
      if (appsResponse.ok) {
        const rows = await appsResponse.json() as AppInstance[];
        setApps(rows);
        setSelectedAppId((current) => current && rows.some((app) => app.id === current) ? current : rows[0]?.id ?? "");
      }
      if (templatesResponse.ok) {
        const rows = await templatesResponse.json() as AppTemplate[];
        setTemplates(rows);
        setSelectedTemplateId((current) => current && rows.some((template) => template.id === current) ? current : rows[0]?.id ?? "");
      }
    } finally {
      setLoadingControls(false);
    }
  }, [token]);

  useEffect(() => { void loadControls(); }, [loadControls]);

  const selectedApp = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? null, [apps, selectedAppId]);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) ?? null, [selectedTemplateId, templates]);

  function openRuntime() {
    if (!selectedApp) return;
    window.open(`/apps/${encodeURIComponent(selectedApp.id)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="mx-auto mb-3 max-w-7xl space-y-2">
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <UserRoundCog className="h-4 w-4 text-primary" />
            <span>Usuários externos, papéis, permissões, login e Actions por App Instance</span>
          </div>
          <Select value={selectedAppId} onValueChange={setSelectedAppId} disabled={loadingControls || apps.length === 0}>
            <SelectTrigger className="h-9 w-full sm:w-[280px]"><SelectValue placeholder={loadingControls ? "Carregando apps..." : "Selecione o app"} /></SelectTrigger>
            <SelectContent>{apps.map((app) => <SelectItem key={app.id} value={app.id}>{app.name} · {app.status}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={openRuntime} disabled={!selectedApp || loadingControls}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir app
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAppActionsOpen(true)} disabled={!selectedApp || loadingControls}>
            <Workflow className="mr-2 h-4 w-4" />
            Actions publicadas
          </Button>
          <Button size="sm" onClick={() => setUsersOpen(true)} disabled={!selectedApp || loadingControls}>
            {loadingControls ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundCog className="mr-2 h-4 w-4" />}
            Gerenciar usuários
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Layers3 className="h-4 w-4 text-primary" />
            <span>Páginas, blocos, dados dinâmicos, formulários e regras de visibilidade do runtime publicado</span>
          </div>
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={loadingControls || templates.length === 0}>
            <SelectTrigger className="h-9 w-full sm:w-[280px]"><SelectValue placeholder={loadingControls ? "Carregando templates..." : "Selecione o template"} /></SelectTrigger>
            <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {template.status}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setRuntimePreviewOpen(true)} disabled={!selectedTemplate || loadingControls}>
            <MonitorSmartphone className="mr-2 h-4 w-4" />
            Pré-visualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDataSourceEditorOpen(true)} disabled={!selectedTemplate || loadingControls}>
            <DatabaseZap className="mr-2 h-4 w-4" />
            Dados dinâmicos
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTemplateActionsOpen(true)} disabled={!selectedTemplate || loadingControls}>
            <FormInput className="mr-2 h-4 w-4" />
            Formulários / Actions
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRuntimeEditorOpen(true)} disabled={!selectedTemplate || loadingControls}>
            <Layers3 className="mr-2 h-4 w-4" />
            Editor visual
          </Button>
        </div>
      </div>

      <AdminAppBuilderLegacy />

      <AppUsersDialog
        app={selectedApp}
        open={usersOpen}
        token={token}
        onOpenChange={setUsersOpen}
        onAppChanged={loadControls}
      />

      <AppActionPolicyDialog
        app={selectedApp}
        token={token}
        open={appActionsOpen}
        onOpenChange={setAppActionsOpen}
        onAppChanged={loadControls}
      />

      <TemplateRuntimeEditorDialog
        template={selectedTemplate}
        token={token}
        open={runtimeEditorOpen}
        onOpenChange={setRuntimeEditorOpen}
      />

      <TemplateDataSourceEditorDialog
        template={selectedTemplate}
        token={token}
        open={dataSourceEditorOpen}
        onOpenChange={setDataSourceEditorOpen}
      />

      <TemplateActionEditorDialog
        template={selectedTemplate}
        token={token}
        open={templateActionsOpen}
        onOpenChange={setTemplateActionsOpen}
      />

      <TemplateRuntimePreviewDialog
        template={selectedTemplate}
        token={token}
        open={runtimePreviewOpen}
        onOpenChange={setRuntimePreviewOpen}
      />
    </>
  );
}
