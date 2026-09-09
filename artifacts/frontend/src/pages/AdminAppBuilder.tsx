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
import { Textarea } from "@/components/ui/textarea";
import AppUsersDialog from "@/components/app-builder/AppUsersDialog";
import AppBuilderAiArchitectDialog from "@/components/app-builder/AppBuilderAiArchitectDialog";
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
  History,
  Loader2,
  MonitorSmartphone,
  PencilRuler,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
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
  templateId?: string;
  settings: Record<string, unknown>;
};

type AppTemplate = { id: string; name: string; slug: string; status: string; verticalId?: string };
type AppTemplateVersion = { id: string; templateId: string; version: number; status: string };
type TenantTarget = { id: string; name: string; status?: string | null };
type Vertical = { id: string; key: string; name: string };
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
  startMode: "ai" | "blank" | "template";
  tenantId: string;
  ownerName: string;
  ownerEmail: string;
  ownerCompany: string;
  templateId: string;
  templateVersionId: string;
  name: string;
  slug: string;
  objective: string;
};

const EMPTY_FORM: NewAppForm = {
  targetType: "tenant",
  startMode: "ai",
  tenantId: "",
  ownerName: "",
  ownerEmail: "",
  ownerCompany: "",
  templateId: "",
  templateVersionId: "",
  name: "",
  slug: "",
  objective: "",
};

const STARTER_DEFINITION = {
  runtime: {
    version: 1,
    defaultPageId: "home",
    pages: [
      {
        id: "home",
        title: "Início",
        blocks: [
          { id: "hero-home", type: "hero", props: { title: "Novo app", subtitle: "Estrutura inicial pronta para personalização." } },
        ],
      },
    ],
  },
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
  const [aiArchitectOpen, setAiArchitectOpen] = useState(false);
  const [runtimeEditorOpen, setRuntimeEditorOpen] = useState(false);
  const [runtimePreviewOpen, setRuntimePreviewOpen] = useState(false);
  const [dataSourceEditorOpen, setDataSourceEditorOpen] = useState(false);
  const [templateActionsOpen, setTemplateActionsOpen] = useState(false);
  const [loadingControls, setLoadingControls] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newApp, setNewApp] = useState<NewAppForm>(EMPTY_FORM);
  const [publishedVersions, setPublishedVersions] = useState<AppTemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [linkingApp, setLinkingApp] = useState<PortfolioApp | null>(null);
  const [linkTenantId, setLinkTenantId] = useState("");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const api = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `Erro ${response.status}`);
    return payload;
  }, [headers]);

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
        setSelectedAppId((current) => current && rows.some((app) => app.id === current) ? current : rows[0]?.id ?? "");
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
  const selectedPortfolioApp = useMemo(() => portfolio.find((app) => app.id === selectedAppId) ?? null, [portfolio, selectedAppId]);
  const standaloneCount = portfolio.filter((app) => !app.tenantId).length;
  const publishedCount = portfolio.filter((app) => app.status === "published").length;

  async function chooseTemplate(templateId: string) {
    setNewApp((current) => ({ ...current, templateId, templateVersionId: "" }));
    setPublishedVersions([]);
    if (!templateId || !token) return;
    setVersionsLoading(true);
    try {
      const rows = await api(`/api/admin/app-builder/templates/${templateId}/versions`) as AppTemplateVersion[];
      const published = rows.filter((row) => row.status === "published");
      setPublishedVersions(published);
      if (published[0]) setNewApp((current) => ({ ...current, templateId, templateVersionId: published[0].id }));
    } finally {
      setVersionsLoading(false);
    }
  }

  async function ensureStarterTemplate() {
    let verticals = await api("/api/admin/app-builder/verticals") as Vertical[];
    let vertical = verticals.find((item) => item.key === "app-builder-base") ?? null;
    if (!vertical) {
      try {
        vertical = await api("/api/admin/app-builder/verticals", {
          method: "POST",
          body: JSON.stringify({ key: "app-builder-base", name: "Base App Builder", status: "active", metadata: { system: true } }),
        }) as Vertical;
      } catch {
        verticals = await api("/api/admin/app-builder/verticals") as Vertical[];
        vertical = verticals.find((item) => item.key === "app-builder-base") ?? null;
      }
    }
    if (!vertical) throw new Error("Não foi possível preparar a base do App Builder");

    let baseTemplates = await api(`/api/admin/app-builder/templates?verticalId=${encodeURIComponent(vertical.id)}`) as AppTemplate[];
    let template = baseTemplates.find((item) => item.slug === "base-vazia") ?? null;
    if (!template) {
      try {
        template = await api("/api/admin/app-builder/templates", {
          method: "POST",
          body: JSON.stringify({
            verticalId: vertical.id,
            name: "Base vazia",
            slug: "base-vazia",
            description: "Template técnico inicial para apps criados do zero ou com IA.",
            status: "active",
            settings: { system: true, starter: true },
          }),
        }) as AppTemplate;
      } catch {
        baseTemplates = await api(`/api/admin/app-builder/templates?verticalId=${encodeURIComponent(vertical.id)}`) as AppTemplate[];
        template = baseTemplates.find((item) => item.slug === "base-vazia") ?? null;
      }
    }
    if (!template) throw new Error("Não foi possível preparar o template inicial");

    let versions = await api(`/api/admin/app-builder/templates/${template.id}/versions`) as AppTemplateVersion[];
    let version = versions.find((item) => item.status === "published") ?? null;
    if (!version) {
      const draft = await api(`/api/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ definition: STARTER_DEFINITION, changeLog: "Versão base automática do App Builder" }),
      }) as AppTemplateVersion;
      version = await api(`/api/admin/app-builder/templates/${template.id}/versions/${draft.id}/publish`, { method: "POST" }) as AppTemplateVersion;
    }
    return { templateId: template.id, templateVersionId: version.id };
  }

  function startCreate() {
    setNewApp({ ...EMPTY_FORM, tenantId: tenants[0]?.id ?? "" });
    setPublishedVersions([]);
    setCreateOpen(true);
  }

  async function createApp() {
    if (!token || !newApp.name.trim() || !newApp.slug.trim()) return;
    if (newApp.targetType === "tenant" && !newApp.tenantId) return;
    if (newApp.targetType !== "tenant" && !newApp.ownerName.trim()) return;
    if (newApp.startMode === "template" && (!newApp.templateId || !newApp.templateVersionId)) return;

    setSaving(true);
    try {
      const source = newApp.startMode === "template"
        ? { templateId: newApp.templateId, templateVersionId: newApp.templateVersionId }
        : await ensureStarterTemplate();
      const standalone = newApp.targetType !== "tenant";
      const endpoint = standalone ? "/api/admin/app-builder/standalone-apps" : "/api/admin/app-builder/apps";
      const body = standalone
        ? {
            ownerType: newApp.targetType,
            ownerName: newApp.ownerName.trim(),
            ownerEmail: newApp.ownerEmail.trim() || null,
            ownerCompany: newApp.ownerCompany.trim() || null,
            ...source,
            name: newApp.name.trim(),
            slug: newApp.slug.trim(),
          }
        : {
            tenantId: newApp.tenantId,
            ...source,
            name: newApp.name.trim(),
            slug: newApp.slug.trim(),
            status: "draft",
            theme: {}, navigation: [], settings: {}, whiteLabel: {},
          };
      const payload = await api(endpoint, { method: "POST", body: JSON.stringify(body) }) as { id?: string };
      setCreateOpen(false);
      await loadControls();
      setSelectedAppId(payload.id ?? "");
      setSelectedTemplateId(source.templateId);
      toast({
        title: standalone ? "App criado antes do tenant" : "App criado com sucesso",
        description: newApp.startMode === "ai"
          ? "A base foi criada. Agora o Arquiteto IA pode desenhar o produto, o App Admin e a conexão com o SaaS."
          : newApp.startMode === "blank"
            ? "A estrutura inicial foi criada e já pode ser editada."
            : "O app foi criado a partir do template selecionado.",
      });
      if (newApp.startMode === "ai") window.setTimeout(() => setAiArchitectOpen(true), 100);
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
      await api(`/api/admin/app-builder/apps/${linkingApp.id}/link-tenant`, { method: "POST", body: JSON.stringify({ tenantId: linkTenantId }) });
      setLinkingApp(null);
      setLinkTenantId("");
      await loadControls();
      toast({ title: "App convertido para tenant", description: "Todo o histórico foi preservado. Agora ele pode ser publicado." });
    } catch (error) {
      toast({ title: "Erro ao vincular tenant", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function selectForBuild(app: PortfolioApp) {
    setSelectedAppId(app.id);
    setSelectedTemplateId(app.templateId);
    document.getElementById("app-builder-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openRuntime() {
    if (!selectedApp?.tenantId) return;
    window.open(`/apps/${encodeURIComponent(selectedApp.id)}`, "_blank", "noopener,noreferrer");
  }

  function goAdvanced() {
    setAdvancedOpen(true);
    window.setTimeout(() => document.getElementById("app-builder-advanced")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const buildSteps = [
    { title: "1. Páginas e experiência", description: "Estrutura visual, blocos, navegação, visibilidade e composição.", icon: PencilRuler, action: () => setRuntimeEditorOpen(true), disabled: !selectedTemplate },
    { title: "2. Dados e integrações", description: "Fontes, bindings, listas, detalhes e atualização de dados.", icon: DatabaseZap, action: () => setDataSourceEditorOpen(true), disabled: !selectedTemplate },
    { title: "3. Formulários e ações", description: "Entradas, validações, ações, workflows e respostas.", icon: FormInput, action: () => setTemplateActionsOpen(true), disabled: !selectedTemplate },
    { title: "4. Preview responsivo", description: "Valide desktop, tablet e celular antes de publicar.", icon: MonitorSmartphone, action: () => setRuntimePreviewOpen(true), disabled: !selectedTemplate },
    { title: "5. Usuários e segurança", description: "Papéis, permissões e acesso do app operacional.", icon: ShieldCheck, action: () => setUsersOpen(true), disabled: !selectedApp?.tenantId },
    { title: "6. Publicação e histórico", description: "Versões, publicação, rollback e engenharia avançada.", icon: Rocket, action: goAdvanced, disabled: !selectedTemplate },
  ];

  const canCreate = Boolean(
    !saving && newApp.name.trim() && newApp.slug.trim() &&
    (newApp.targetType === "tenant" ? newApp.tenantId : newApp.ownerName.trim()) &&
    (newApp.startMode !== "template" || newApp.templateVersionId),
  );

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><AppWindow className="h-5 w-5 text-primary" /><h1 className="text-2xl font-bold">App Builder</h1><Badge variant="outline">SuperAdmin</Badge></div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Crie o produto que será vendido, o painel administrativo do app e a conexão opcional com o VendorAI SaaS — sem duplicar módulos ou fluxos.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Button onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Novo app</Button><Button variant="outline" onClick={() => void loadControls()} disabled={loadingControls}><RefreshCw className={`mr-2 h-4 w-4 ${loadingControls ? "animate-spin" : ""}`} />Atualizar</Button></div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Apps</p><p className="mt-1 text-2xl font-semibold">{portfolio.length}</p><p className="text-[11px] text-muted-foreground">portfólio total</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com tenant</p><p className="mt-1 text-2xl font-semibold">{portfolio.length - standaloneCount}</p><p className="text-[11px] text-muted-foreground">prontos para operação</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pré-tenant</p><p className="mt-1 text-2xl font-semibold">{standaloneCount}</p><p className="text-[11px] text-muted-foreground">prospects / internos</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Publicados</p><p className="mt-1 text-2xl font-semibold">{publishedCount}</p><p className="text-[11px] text-muted-foreground">apps ativos</p></CardContent></Card>
        </div>

        {portfolio.length > 0 && (
          <Card><CardContent className="p-4"><div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Portfólio de apps</h2></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{portfolio.map((app) => <div key={app.id} className={`rounded-xl border p-3 ${selectedAppId === app.id ? "ring-2 ring-primary/30" : ""}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{app.name}</p><p className="truncate text-xs text-muted-foreground">/{app.slug}</p></div><Badge variant="outline">{statusPt(app.status)}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{app.tenantId ? <><Users className="mr-1 inline h-3.5 w-3.5" />{app.tenantName ?? app.tenantCode ?? "Tenant"}</> : <><UserRoundCog className="mr-1 inline h-3.5 w-3.5" />{app.ownerCompany || app.ownerName || "Projeto pré-tenant"}</>}</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" onClick={() => selectForBuild(app)}><PencilRuler className="mr-1.5 h-3.5 w-3.5" />Construir</Button>{app.tenantId ? <Button size="sm" variant="outline" onClick={() => { setSelectedAppId(app.id); window.open(`/apps/${encodeURIComponent(app.id)}`, "_blank", "noopener,noreferrer"); }}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir</Button> : <Button size="sm" variant="outline" onClick={() => { setLinkingApp(app); setLinkTenantId(tenants[0]?.id ?? ""); }}>Vincular</Button>}</div></div>)}</div></CardContent></Card>
        )}

        <Card id="app-builder-workspace" className="scroll-mt-24"><CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><PencilRuler className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Construção do app</h2></div><p className="mt-1 text-sm text-muted-foreground">Um único fluxo para produto, administração, experiência, dados, segurança e publicação.</p></div><div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:min-w-[520px]"><Select value={selectedAppId} onValueChange={(id) => { setSelectedAppId(id); const app = portfolio.find((item) => item.id === id); if (app) setSelectedTemplateId(app.templateId); }} disabled={loadingControls || apps.length === 0}><SelectTrigger><SelectValue placeholder="Selecione o app" /></SelectTrigger><SelectContent>{apps.map((app) => <SelectItem key={app.id} value={app.id}>{app.name} · {app.tenantId ? "Tenant" : "Pré-tenant"}</SelectItem>)}</SelectContent></Select><Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={loadingControls || templates.length === 0}><SelectTrigger><SelectValue placeholder="Selecione o template" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {statusPt(template.status)}</SelectItem>)}</SelectContent></Select></div></div>

          <div className="mt-4 rounded-xl border bg-muted/20 p-3"><div className="flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline">App: {selectedPortfolioApp?.name ?? selectedApp?.name ?? "não selecionado"}</Badge><Badge variant="outline">Template: {selectedTemplate?.name ?? "não selecionado"}</Badge><Badge variant={selectedApp?.tenantId ? "default" : "secondary"}>{selectedApp?.tenantId ? "Tenant vinculado" : "Pré-tenant"}</Badge>{selectedPortfolioApp?.status && <Badge variant="outline">{statusPt(selectedPortfolioApp.status)}</Badge>}</div>{!selectedApp?.tenantId && selectedApp && <p className="mt-2 text-xs text-amber-700">Você pode construir e versionar normalmente. Usuários externos e publicação operacional ficam bloqueados até vincular um tenant.</p>}</div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2"><AppWindow className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">App Product</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Produto que será vendido. Deve funcionar com valor próprio e conter as funções nativas essenciais do segmento.</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2"><UserRoundCog className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">App Admin</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Painel básico para administrar conteúdo, usuários, cadastros e funções diretamente ligadas ao próprio app.</p></div>
            <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">VendorAI SaaS</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Produto recorrente separado para CRM, marketing, automações, agentes, inteligência, analytics e gestão ampliada do negócio.</p></div>
          </div>

          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.03] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Arquiteto IA</p><Badge variant="secondary">2 passagens</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Projeta as três camadas, reaproveita capacidades existentes, aponta gaps e cria somente uma nova versão em rascunho após sua aprovação.</p></div><Button onClick={() => setAiArchitectOpen(true)} disabled={!selectedTemplate}><Sparkles className="mr-2 h-4 w-4" />Construir com IA</Button></div></div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{buildSteps.map((step) => <button key={step.title} type="button" disabled={step.disabled} onClick={step.action} className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-primary/[0.02] disabled:cursor-not-allowed disabled:opacity-45"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><step.icon className="h-4 w-4" /></div><div><p className="text-sm font-semibold">{step.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p></div></div></button>)}</div>

          <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setAppActionsOpen(true)} disabled={!selectedApp?.tenantId}><Workflow className="mr-2 h-4 w-4" />Políticas avançadas</Button><Button variant="outline" onClick={openRuntime} disabled={!selectedApp?.tenantId}><ExternalLink className="mr-2 h-4 w-4" />Abrir app</Button><Button variant="outline" onClick={() => setAdvancedOpen((current) => !current)}><History className="mr-2 h-4 w-4" />{advancedOpen ? "Ocultar engenharia" : "Engenharia avançada"}</Button></div>
        </CardContent></Card>
      </div>

      {advancedOpen && <div id="app-builder-advanced" className="scroll-mt-24"><AdminAppBuilderLegacy /></div>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="min-w-0"><DialogTitle>Novo app</DialogTitle><DialogDescription>Defina para quem é o app e escolha como deseja começar.</DialogDescription></DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="space-y-2"><Label>Para quem?</Label><div className="grid grid-cols-3 gap-2"><Button type="button" size="sm" variant={newApp.targetType === "tenant" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "tenant" }))}>Tenant</Button><Button type="button" size="sm" variant={newApp.targetType === "prospect" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "prospect" }))}>Prospect</Button><Button type="button" size="sm" variant={newApp.targetType === "internal" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, targetType: "internal" }))}>Interno</Button></div></div>

            {newApp.targetType === "tenant" ? <div className="space-y-2"><Label>Tenant</Label><Select value={newApp.tenantId} onValueChange={(tenantId) => setNewApp((current) => ({ ...current, tenantId }))}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione o tenant" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent></Select></div> : <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0 space-y-2"><Label>{newApp.targetType === "prospect" ? "Responsável / prospect" : "Responsável interno"}</Label><Input className="w-full" value={newApp.ownerName} onChange={(e) => setNewApp((current) => ({ ...current, ownerName: e.target.value }))} placeholder="Nome" /></div><div className="min-w-0 space-y-2"><Label>Empresa / projeto</Label><Input className="w-full" value={newApp.ownerCompany} onChange={(e) => setNewApp((current) => ({ ...current, ownerCompany: e.target.value }))} placeholder="Empresa ou projeto" /></div><div className="min-w-0 space-y-2 sm:col-span-2"><Label>E-mail de referência</Label><Input className="w-full" type="email" value={newApp.ownerEmail} onChange={(e) => setNewApp((current) => ({ ...current, ownerEmail: e.target.value }))} placeholder="contato@empresa.com" /></div></div>}

            <div className="space-y-2"><Label>Como quer começar?</Label><div className="grid gap-2 sm:grid-cols-3"><Button type="button" variant={newApp.startMode === "ai" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, startMode: "ai" }))}><Sparkles className="mr-2 h-4 w-4" />Com IA</Button><Button type="button" variant={newApp.startMode === "blank" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, startMode: "blank" }))}>Do zero</Button><Button type="button" variant={newApp.startMode === "template" ? "default" : "outline"} onClick={() => setNewApp((current) => ({ ...current, startMode: "template" }))}>Template</Button></div><p className="text-xs text-muted-foreground">IA e Do zero não dependem de um template pré-existente: o sistema prepara automaticamente uma base versionável.</p></div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0 space-y-2"><Label>Nome do app</Label><Input className="w-full" value={newApp.name} onChange={(e) => setNewApp((current) => ({ ...current, name: e.target.value }))} placeholder="Portal do Cliente" /></div><div className="min-w-0 space-y-2"><Label>Slug</Label><Input className="w-full" value={newApp.slug} onChange={(e) => setNewApp((current) => ({ ...current, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") }))} placeholder="portal-cliente" /></div></div>

            {newApp.startMode === "ai" && <div className="space-y-2"><Label>Objetivo inicial <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea className="w-full resize-none" rows={3} value={newApp.objective} onChange={(e) => setNewApp((current) => ({ ...current, objective: e.target.value }))} placeholder="Ex.: app para clientes consultarem pedidos, receberem ofertas e falarem com um agente especializado." /><p className="text-xs text-muted-foreground">Após criar, o Arquiteto IA será aberto para completar a arquitetura.</p></div>}

            {newApp.startMode === "template" && <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0 space-y-2"><Label>Template</Label><Select value={newApp.templateId} onValueChange={(value) => void chooseTemplate(value)}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select>{templates.length === 0 && <p className="text-xs text-amber-700">Nenhum template cadastrado. Use “Com IA” ou “Do zero”.</p>}</div><div className="min-w-0 space-y-2"><Label>Versão publicada</Label><Select value={newApp.templateVersionId} onValueChange={(templateVersionId) => setNewApp((current) => ({ ...current, templateVersionId }))} disabled={!newApp.templateId || versionsLoading || publishedVersions.length === 0}><SelectTrigger className="w-full"><SelectValue placeholder={versionsLoading ? "Carregando..." : "Selecione"} /></SelectTrigger><SelectContent>{publishedVersions.map((version) => <SelectItem key={version.id} value={version.id}>Versão {version.version}</SelectItem>)}</SelectContent></Select>{newApp.templateId && !versionsLoading && publishedVersions.length === 0 && <p className="text-xs text-amber-700">Este template ainda não possui versão publicada.</p>}</div></div>}

            {newApp.targetType !== "tenant" && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">O app poderá ser construído, editado e versionado agora. Publicação operacional e usuários externos serão liberados quando você vincular um tenant real.</div>}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button className="w-full sm:w-auto" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button><Button className="w-full sm:w-auto" onClick={() => void createApp()} disabled={!canCreate}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{newApp.startMode === "ai" ? "Criar e abrir IA" : "Criar app"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkingApp)} onOpenChange={(open) => { if (!open) setLinkingApp(null); }}><DialogContent><DialogHeader><DialogTitle>Vincular app a um tenant</DialogTitle><DialogDescription>Converte o projeto pré-tenant em app operacional sem perder o histórico.</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-lg border p-3"><p className="text-sm font-medium">{linkingApp?.name}</p><p className="text-xs text-muted-foreground">Origem: {linkingApp?.ownerCompany || linkingApp?.ownerName || "pré-tenant"}</p></div><div className="space-y-2"><Label>Tenant de destino</Label><Select value={linkTenantId} onValueChange={setLinkTenantId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setLinkingApp(null)}>Cancelar</Button><Button onClick={() => void linkTenant()} disabled={!linkTenantId || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular e preservar histórico</Button></DialogFooter></DialogContent></Dialog>

      <AppBuilderAiArchitectDialog open={aiArchitectOpen} onOpenChange={setAiArchitectOpen} token={token} template={selectedTemplate} app={selectedPortfolioApp ?? selectedApp} onVersionCreated={loadControls} />
      <AppUsersDialog app={selectedApp} open={usersOpen} token={token} onOpenChange={setUsersOpen} onAppChanged={loadControls} />
      <AppActionPolicyDialog app={selectedApp} token={token} open={appActionsOpen} onOpenChange={setAppActionsOpen} onAppChanged={loadControls} />
      <TemplateRuntimeEditorDialog template={selectedTemplate} token={token} open={runtimeEditorOpen} onOpenChange={setRuntimeEditorOpen} />
      <TemplateDataSourceEditorDialog template={selectedTemplate} token={token} open={dataSourceEditorOpen} onOpenChange={setDataSourceEditorOpen} />
      <TemplateActionEditorDialog template={selectedTemplate} token={token} open={templateActionsOpen} onOpenChange={setTemplateActionsOpen} />
      <TemplateRuntimePreviewDialog template={selectedTemplate} token={token} open={runtimePreviewOpen} onOpenChange={setRuntimePreviewOpen} />
    </>
  );
}
