import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppUsersDialog from "@/components/app-builder/AppUsersDialog";
import TemplateRuntimeEditorDialog from "@/components/app-builder/TemplateRuntimeEditorDialog";
import TemplateRuntimePreviewDialog from "@/components/app-builder/TemplateRuntimePreviewDialog";
import TemplateDataSourceEditorDialog from "@/components/app-builder/TemplateDataSourceEditorDialog";
import TemplateActionEditorDialog from "@/components/app-builder/TemplateActionEditorDialog";
import AppActionPolicyDialog from "@/components/app-builder/AppActionPolicyDialog";
import AdminAppBuilderLegacy from "./AdminAppBuilderLegacy";
import {
  AppWindow,
  Building2,
  DatabaseZap,
  ExternalLink,
  FormInput,
  Layers3,
  Loader2,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  UserRoundCog,
  Users,
  Workflow,
} from "lucide-react";

type AppInstance = {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
};

type AppTemplate = { id: string; name: string; slug: string; status: string };
type AppTemplateVersion = { id: string; templateId: string; version: number; status: string };
type TenantTarget = { id: string; name: string; status?: string | null };
type PortfolioApp = {
  id: string;
  tenantId: string | null;
  tenantName?: string | null;
  tenantCode?: string | null;
  templateId: string;
  templateVersionId: string;
  name: string;
  slug: string;
  status: string;
  ownerType: "tenant" | "prospect" | "internal";
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerCompany?: string | null;
};

type NewAppForm = {
  targetType: "tenant" | "prospect" | "internal";
  tenantId: string;
  ownerName: string;
  ownerEmail: string;
  ownerCompany: string;
  templateId: string;
  templateVersionId: string;
  name: string;
  slug: string;
};

const EMPTY_FORM: NewAppForm = {
  targetType: "tenant",
  tenantId: "",
  ownerName: "",
  ownerEmail: "",
  ownerCompany: "",
  templateId: "",
  templateVersionId: "",
  name: "",
  slug: "",
};

function statusPt(status: string) {
  return ({ draft: "Rascunho", preview: "Preview", published: "Publicado", archived: "Arquivado", active: "Ativo" } as Record<string, string>)[status] ?? status;
}

export default function AdminAppBuilder() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [apps, setApps] = useState<AppInstance[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [tenants, setTenants] = useState<TenantTarget[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [usersOpen, setUsersOpen] = useState(false);
  const [appActionsOpen, setAppActionsOpen] = useState(false);
  const [runtimeEditorOpen, setRuntimeEditorOpen] = useState(false);
  const [runtimePreviewOpen, setRuntimePreviewOpen] = useState(false);
  const [dataSourceEditorOpen, setDataSourceEditorOpen] = useState(false);
  const [templateActionsOpen, setTemplateActionsOpen] = useState(false);
  const [loadingControls, setLoadingControls] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newApp, setNewApp] = useState<NewAppForm>(EMPTY_FORM);
  const [publishedVersions, setPublishedVersions] = useState<AppTemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [linkingApp, setLinkingApp] = useState<PortfolioApp | null>(null);
  const [linkTenantId, setLinkTenantId] = useState("");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const loadControls = useCallback(async () => {
    if (!token) return;
    setLoadingControls(true);
    try {
      const [appsResponse, templatesResponse, targetsResponse, portfolioResponse] = await Promise.all([
        fetch("/api/admin/app-builder/apps", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/app-builder/templates", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/app-builder/app-targets", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/app-builder/portfolio", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (appsResponse.ok) {
        const rows = await appsResponse.json() as AppInstance[];
        setApps(rows);
        setSelectedAppId((current) => current && rows.some((app) => app.id === current) ? current : rows.find((app) => app.tenantId)?.id ?? "");
      }
      if (templatesResponse.ok) {
        const rows = await templatesResponse.json() as AppTemplate[];
        setTemplates(rows);
        setSelectedTemplateId((current) => current && rows.some((template) => template.id === current) ? current : rows[0]?.id ?? "");
      }
      if (targetsResponse.ok) {
        const data = await targetsResponse.json() as { tenants?: TenantTarget[] };
        setTenants(data.tenants ?? []);
      }
      if (portfolioResponse.ok) setPortfolio(await portfolioResponse.json() as PortfolioApp[]);
    } finally {
      setLoadingControls(false);
    }
  }, [token]);

  useEffect(() => { void loadControls(); }, [loadControls]);

  const selectedApp = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? null, [apps, selectedAppId]);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) ?? null, [selectedTemplateId, templates]);
  const standaloneCount = portfolio.filter((app) => !app.tenantId).length;
  const publishedCount = portfolio.filter((app) => app.status === "published").length;

  async function chooseTemplate(templateId: string) {
    setNewApp((current) => ({ ...current, templateId, templateVersionId: "" }));
    setPublishedVersions([]);
    if (!templateId || !token) return;
    setVersionsLoading(true);
    try {
      const response = await fetch(`/api/admin/app-builder/templates/${templateId}/versions`, { headers });
      const rows = response.ok ? await response.json() as AppTemplateVersion[] : [];
      const published = rows.filter((row) => row.status === "published");
      setPublishedVersions(published);
      if (published[0]) setNewApp((current) => ({ ...current, templateId, templateVersionId: published[0].id }));
    } finally {
      setVersionsLoading(false);
    }
  }

  function startCreate() {
    setNewApp({ ...EMPTY_FORM, tenantId: tenants[0]?.id ?? "" });
    setPublishedVersions([]);
    setCreateOpen(true);
  }

  async function createApp() {
    if (!token || !newApp.templateId || !newApp.templateVersionId || !newApp.name.trim() || !newApp.slug.trim()) return;
    if (newApp.targetType === "tenant" && !newApp.tenantId) return;
    if (newApp.targetType !== "tenant" && !newApp.ownerName.trim()) return;
    setSaving(true);
    try {
      const standalone = newApp.targetType !== "tenant";
      const endpoint = standalone ? "/api/admin/app-builder/standalone-apps" : "/api/admin/app-builder/apps";
      const body = standalone
        ? {
            ownerType: newApp.targetType,
            ownerName: newApp.ownerName.trim(),
            ownerEmail: newApp.ownerEmail.trim() || null,
            ownerCompany: newApp.ownerCompany.trim() || null,
            templateId: newApp.templateId,
            templateVersionId: newApp.templateVersionId,
            name: newApp.name.trim(),
            slug: newApp.slug.trim(),
          }
        : {
            tenantId: newApp.tenantId,
            templateId: newApp.templateId,
            templateVersionId: newApp.templateVersionId,
            name: newApp.name.trim(),
            slug: newApp.slug.trim(),
            status: "draft",
            theme: {}, navigation: [], settings: {}, whiteLabel: {},
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível criar o app");
      setCreateOpen(false);
      await loadControls();
      toast({
        title: standalone ? "App criado antes do tenant" : "App criado para o tenant",
        description: standalone ? "Você pode construir e versionar agora. A publicação fica bloqueada até vincular um tenant real." : "O app foi criado como rascunho e já pode ser configurado.",
      });
    } catch (error) {
      toast({ title: "Erro ao criar app", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function linkTenant() {
    if (!token || !linkingApp || !linkTenantId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/app-builder/apps/${linkingApp.id}/link-tenant`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: linkTenantId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível vincular o tenant");
      setLinkingApp(null);
      setLinkTenantId("");
      await loadControls();
      toast({ title: "App convertido para tenant", description: "Todo o histórico e snapshots foram preservados. Agora ele pode ser publicado." });
    } catch (error) {
      toast({ title: "Erro ao vincular tenant", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openRuntime() {
    if (!selectedApp?.tenantId) return;
    window.open(`/apps/${encodeURIComponent(selectedApp.id)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><AppWindow className="h-5 w-5 text-primary" /><h1 className="text-2xl font-bold">App Builder</h1><Badge variant="outline">SuperAdmin</Badge></div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Construa apps para clientes atuais, prospects que ainda não são tenants ou projetos internos. O projeto pode nascer antes do tenant e ser convertido depois sem perder versões.</p>
          </div>
          <div className="flex gap-2"><Button onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Novo app</Button><Button variant="outline" onClick={() => void loadControls()} disabled={loadingControls}><RefreshCw className={`mr-2 h-4 w-4 ${loadingControls ? "animate-spin" : ""}`} />Atualizar</Button></div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Apps</p><p className="mt-1 text-2xl font-semibold">{portfolio.length}</p><p className="text-[11px] text-muted-foreground">portfólio total</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com tenant</p><p className="mt-1 text-2xl font-semibold">{portfolio.length - standaloneCount}</p><p className="text-[11px] text-muted-foreground">prontos para operação</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pré-tenant</p><p className="mt-1 text-2xl font-semibold">{standaloneCount}</p><p className="text-[11px] text-muted-foreground">prospects / internos</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Publicados</p><p className="mt-1 text-2xl font-semibold">{publishedCount}</p><p className="text-[11px] text-muted-foreground">runtime ativo</p></CardContent></Card>
        </div>

        {portfolio.length > 0 && (
          <Card><CardContent className="p-4"><div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Portfólio de apps</h2></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{portfolio.slice(0, 9).map((app) => <div key={app.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{app.name}</p><p className="truncate text-xs text-muted-foreground">/{app.slug}</p></div><Badge variant="outline">{statusPt(app.status)}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{app.tenantId ? <><Users className="mr-1 inline h-3.5 w-3.5" />{app.tenantName ?? app.tenantCode ?? "Tenant"}</> : <><UserRoundCog className="mr-1 inline h-3.5 w-3.5" />{app.ownerCompany || app.ownerName || "Projeto pré-tenant"}</>}</p>{!app.tenantId && <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => { setLinkingApp(app); setLinkTenantId(tenants[0]?.id ?? ""); }}>Vincular a tenant</Button>}</div>)}</div></CardContent></Card>
        )}

        <div className="grid gap-2 lg:grid-cols-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-3 py-2">
            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><UserRoundCog className="h-4 w-4 text-primary" /><span>Usuários, papéis, permissões e Actions do app operacional</span></div>
            <Select value={selectedAppId} onValueChange={setSelectedAppId} disabled={loadingControls || apps.filter((app) => app.tenantId).length === 0}><SelectTrigger className="h-9 w-full sm:w-[250px]"><SelectValue placeholder="Selecione o app" /></SelectTrigger><SelectContent>{apps.filter((app) => app.tenantId).map((app) => <SelectItem key={app.id} value={app.id}>{app.name} · {statusPt(app.status)}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" variant="outline" onClick={openRuntime} disabled={!selectedApp?.tenantId || loadingControls}><ExternalLink className="mr-2 h-4 w-4" />Abrir</Button>
            <Button size="sm" variant="outline" onClick={() => setAppActionsOpen(true)} disabled={!selectedApp?.tenantId || loadingControls}><Workflow className="mr-2 h-4 w-4" />Actions</Button>
            <Button size="sm" onClick={() => setUsersOpen(true)} disabled={!selectedApp?.tenantId || loadingControls}><UserRoundCog className="mr-2 h-4 w-4" />Usuários</Button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card px-3 py-2">
            <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Layers3 className="h-4 w-4 text-primary" /><span>Construtor: layout, páginas, dados e formulários</span></div>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={loadingControls || templates.length === 0}><SelectTrigger className="h-9 w-full sm:w-[250px]"><SelectValue placeholder="Selecione o template" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {statusPt(template.status)}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" variant="outline" onClick={() => setRuntimePreviewOpen(true)} disabled={!selectedTemplate || loadingControls}><MonitorSmartphone className="mr-2 h-4 w-4" />Preview</Button>
            <Button size="sm" variant="outline" onClick={() => setDataSourceEditorOpen(true)} disabled={!selectedTemplate || loadingControls}><DatabaseZap className="mr-2 h-4 w-4" />Dados</Button>
            <Button size="sm" variant="outline" onClick={() => setTemplateActionsOpen(true)} disabled={!selectedTemplate || loadingControls}><FormInput className="mr-2 h-4 w-4" />Forms</Button>
            <Button size="sm" variant="outline" onClick={() => setRuntimeEditorOpen(true)} disabled={!selectedTemplate || loadingControls}><Layers3 className="mr-2 h-4 w-4" />Editor</Button>
          </div>
        </div>
      </div>

      <AdminAppBuilderLegacy />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo app</DialogTitle><DialogDescription>Escolha se o app já pertence a um tenant ou se será construído antes da contratação.</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid grid-cols-3 gap-2"><Button type="button" variant={newApp.targetType === "tenant" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "tenant" }))}>Tenant</Button><Button type="button" variant={newApp.targetType === "prospect" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "prospect" }))}>Prospect</Button><Button type="button" variant={newApp.targetType === "internal" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "internal" }))}>Interno</Button></div>{newApp.targetType === "tenant" ? <div className="space-y-2"><Label>Tenant</Label><Select value={newApp.tenantId} onValueChange={(tenantId) => setNewApp((current) => ({ ...current, tenantId }))}><SelectTrigger><SelectValue placeholder="Selecione o tenant" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent></Select></div> : <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>{newApp.targetType === "prospect" ? "Responsável / prospect" : "Responsável interno"}</Label><Input value={newApp.ownerName} onChange={(e) => setNewApp((current) => ({ ...current, ownerName: e.target.value }))} placeholder="Nome" /></div><div className="space-y-2"><Label>Empresa / projeto</Label><Input value={newApp.ownerCompany} onChange={(e) => setNewApp((current) => ({ ...current, ownerCompany: e.target.value }))} placeholder="Empresa ou nome do projeto" /></div><div className="space-y-2 sm:col-span-2"><Label>E-mail de referência</Label><Input type="email" value={newApp.ownerEmail} onChange={(e) => setNewApp((current) => ({ ...current, ownerEmail: e.target.value }))} placeholder="contato@empresa.com" /></div></div>}<div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Template</Label><Select value={newApp.templateId} onValueChange={(value) => void chooseTemplate(value)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Versão publicada</Label><Select value={newApp.templateVersionId} onValueChange={(templateVersionId) => setNewApp((current) => ({ ...current, templateVersionId }))} disabled={!newApp.templateId || versionsLoading || publishedVersions.length === 0}><SelectTrigger><SelectValue placeholder={versionsLoading ? "Carregando..." : "Selecione"} /></SelectTrigger><SelectContent>{publishedVersions.map((version) => <SelectItem key={version.id} value={version.id}>Versão {version.version}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Nome do app</Label><Input value={newApp.name} onChange={(e) => setNewApp((current) => ({ ...current, name: e.target.value }))} placeholder="Portal do Cliente" /></div><div className="space-y-2"><Label>Slug</Label><Input value={newApp.slug} onChange={(e) => setNewApp((current) => ({ ...current, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") }))} placeholder="portal-cliente" /></div></div>{newApp.targetType !== "tenant" && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">O app poderá ser construído, editado e versionado agora. A publicação e os usuários externos serão liberados quando você vincular um tenant real.</div>}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void createApp()} disabled={saving || !newApp.templateVersionId || !newApp.name.trim() || !newApp.slug.trim() || (newApp.targetType === "tenant" ? !newApp.tenantId : !newApp.ownerName.trim())}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar app</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(linkingApp)} onOpenChange={(open) => { if (!open) setLinkingApp(null); }}><DialogContent><DialogHeader><DialogTitle>Vincular app a um tenant</DialogTitle><DialogDescription>Converte o projeto pré-tenant em app operacional sem perder o histórico.</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-lg border p-3"><p className="text-sm font-medium">{linkingApp?.name}</p><p className="text-xs text-muted-foreground">Origem: {linkingApp?.ownerCompany || linkingApp?.ownerName || "pré-tenant"}</p></div><div className="space-y-2"><Label>Tenant de destino</Label><Select value={linkTenantId} onValueChange={setLinkTenantId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setLinkingApp(null)}>Cancelar</Button><Button onClick={() => void linkTenant()} disabled={!linkTenantId || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular e preservar histórico</Button></DialogFooter></DialogContent></Dialog>

      <AppUsersDialog app={selectedApp} open={usersOpen} token={token} onOpenChange={setUsersOpen} onAppChanged={loadControls} />
      <AppActionPolicyDialog app={selectedApp} token={token} open={appActionsOpen} onOpenChange={setAppActionsOpen} onAppChanged={loadControls} />
      <TemplateRuntimeEditorDialog template={selectedTemplate} token={token} open={runtimeEditorOpen} onOpenChange={setRuntimeEditorOpen} />
      <TemplateDataSourceEditorDialog template={selectedTemplate} token={token} open={dataSourceEditorOpen} onOpenChange={setDataSourceEditorOpen} />
      <TemplateActionEditorDialog template={selectedTemplate} token={token} open={templateActionsOpen} onOpenChange={setTemplateActionsOpen} />
      <TemplateRuntimePreviewDialog template={selectedTemplate} token={token} open={runtimePreviewOpen} onOpenChange={setRuntimePreviewOpen} />
    </>
  );
}
