import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AppWindow,
  Boxes,
  Bot,
  Component,
  GitBranch,
  History,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewKey = "overview" | "apps" | "templates" | "verticals" | "registries";
type RegistryKind = "components" | "features" | "actions" | "workflows" | "ai-policies";

type AppVertical = { id: string; key: string; name: string; familyKey?: string | null; status: string };
type AppTemplate = {
  id: string;
  verticalId: string;
  parentTemplateId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  settings?: Record<string, unknown>;
};
type AppTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  changeLog?: string | null;
  publishedAt?: string | null;
};
type AppInstance = {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersionId: string;
  name: string;
  slug: string;
  status: string;
};
type TenantSummary = { id: string; name: string; slug?: string | null; status?: string | null };
type RegistryItem = { id: string; key: string; name: string; category?: string | null; description?: string | null; status?: string; riskLevel?: string };
type RegistriesResponse = { components: RegistryItem[]; features: RegistryItem[]; actions: RegistryItem[]; workflows: RegistryItem[]; aiPolicies: RegistryItem[] };

const EMPTY_REGISTRIES: RegistriesResponse = { components: [], features: [], actions: [], workflows: [], aiPolicies: [] };
const NAV: Array<{ key: ViewKey; label: string; icon: typeof Smartphone }> = [
  { key: "overview", label: "Visão Geral", icon: AppWindow },
  { key: "apps", label: "Apps", icon: Smartphone },
  { key: "templates", label: "Templates", icon: Layers3 },
  { key: "verticals", label: "Verticais", icon: GitBranch },
  { key: "registries", label: "Registries", icon: Boxes },
];
const REGISTRY_KIND_LABEL: Record<RegistryKind, string> = {
  components: "Componente",
  features: "Funcionalidade",
  actions: "Ação",
  workflows: "Workflow",
  "ai-policies": "Política de IA",
};

function statusLabel(status: string) {
  return ({ active: "Ativo", inactive: "Inativo", archived: "Arquivado", draft: "Rascunho", preview: "Preview", published: "Publicado", deprecated: "Descontinuado" } as Record<string, string>)[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("text-[10px]", status === "published" || status === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : status === "draft" || status === "preview" ? "border-amber-300 bg-amber-50 text-amber-700" : "text-muted-foreground")}>{statusLabel(status)}</Badge>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center"><Layers3 className="mx-auto h-8 w-8 text-muted-foreground/60" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p></div>;
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value || "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`${label} precisa ser um objeto JSON.`);
  return parsed as Record<string, unknown>;
}

export default function AdminAppBuilder() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<ViewKey>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verticals, setVerticals] = useState<AppVertical[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [apps, setApps] = useState<AppInstance[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [registries, setRegistries] = useState<RegistriesResponse>(EMPTY_REGISTRIES);

  const [appDialog, setAppDialog] = useState(false);
  const [appVersions, setAppVersions] = useState<AppTemplateVersion[]>([]);
  const [appVersionsLoading, setAppVersionsLoading] = useState(false);
  const [appForm, setAppForm] = useState({ tenantId: "", templateId: "", templateVersionId: "", name: "", slug: "" });

  const [verticalDialog, setVerticalDialog] = useState(false);
  const [editingVertical, setEditingVertical] = useState<AppVertical | null>(null);
  const [verticalForm, setVerticalForm] = useState({ key: "", name: "", familyKey: "", status: "active" });

  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AppTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ verticalId: "", parentTemplateId: "__none__", name: "", slug: "", description: "", status: "draft" });

  const [versionDialog, setVersionDialog] = useState(false);
  const [versionTemplate, setVersionTemplate] = useState<AppTemplate | null>(null);
  const [versions, setVersions] = useState<AppTemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionForm, setVersionForm] = useState({ definition: "{}", changeLog: "" });

  const [registryDialog, setRegistryDialog] = useState(false);
  const [registryForm, setRegistryForm] = useState({ kind: "components" as RegistryKind, key: "", name: "", category: "", description: "", riskLevel: "low", verticalId: "__global__", schemaJson: "{}", secondaryJson: "{}" });

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão não disponível.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null) as { error?: string } | T | null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error ? String(payload.error) : `Falha na operação (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [verticalRows, templateRows, appRows, tenantRows, registryRows] = await Promise.all([
        requestJson<AppVertical[]>("/admin/app-builder/verticals"),
        requestJson<AppTemplate[]>("/admin/app-builder/templates"),
        requestJson<AppInstance[]>("/admin/app-builder/apps"),
        requestJson<TenantSummary[]>("/tenants"),
        requestJson<RegistriesResponse>("/admin/app-builder/registries"),
      ]);
      setVerticals(verticalRows);
      setTemplates(templateRows);
      setApps(appRows);
      setTenants(tenantRows);
      setRegistries(registryRows);
    } catch (error) {
      toast({ title: "Não foi possível carregar o App Builder", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [requestJson, toast, token]);

  useEffect(() => { void load(); }, [load]);

  const verticalNameById = useMemo(() => new Map(verticals.map((vertical) => [vertical.id, vertical.name])), [verticals]);
  const templateNameById = useMemo(() => new Map(templates.map((template) => [template.id, template.name])), [templates]);
  const tenantNameById = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant.name])), [tenants]);
  const registryTotal = registries.components.length + registries.features.length + registries.actions.length + registries.workflows.length + registries.aiPolicies.length;
  const metrics = [
    { label: "Apps", value: apps.length, helper: "instâncias por tenant", icon: Smartphone },
    { label: "Templates", value: templates.length, helper: "modelos versionáveis", icon: Layers3 },
    { label: "Verticais", value: verticals.length, helper: "segmentos habilitados", icon: GitBranch },
    { label: "Registries", value: registryTotal, helper: "blocos reutilizáveis", icon: Boxes },
  ];

  async function selectAppTemplate(templateId: string) {
    setAppForm((current) => ({ ...current, templateId, templateVersionId: "" }));
    setAppVersions([]);
    if (!templateId) return;
    setAppVersionsLoading(true);
    try {
      const rows = await requestJson<AppTemplateVersion[]>(`/admin/app-builder/templates/${templateId}/versions`);
      const published = rows.filter((version) => version.status === "published");
      setAppVersions(published);
      if (published[0]) {
        setAppForm((current) => ({ ...current, templateId, templateVersionId: published[0].id }));
      }
    } catch (error) {
      toast({ title: "Erro ao carregar versões publicadas", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAppVersionsLoading(false);
    }
  }

  function openNewApp() {
    setAppForm({ tenantId: tenants[0]?.id ?? "", templateId: "", templateVersionId: "", name: "", slug: "" });
    setAppVersions([]);
    setAppDialog(true);
  }

  async function createApp() {
    if (!appForm.tenantId || !appForm.templateId || !appForm.templateVersionId || !appForm.name.trim() || !appForm.slug.trim()) return;
    setSaving(true);
    try {
      await requestJson("/admin/app-builder/apps", {
        method: "POST",
        body: JSON.stringify({
          tenantId: appForm.tenantId,
          templateId: appForm.templateId,
          templateVersionId: appForm.templateVersionId,
          name: appForm.name.trim(),
          slug: appForm.slug.trim(),
          status: "draft",
          theme: {},
          navigation: [],
          settings: {},
          whiteLabel: {},
        }),
      });
      setAppDialog(false);
      await load();
      toast({ title: "App Instance criado em rascunho" });
    } catch (error) {
      toast({ title: "Erro ao criar app", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openNewVertical() {
    setEditingVertical(null);
    setVerticalForm({ key: "", name: "", familyKey: "", status: "active" });
    setVerticalDialog(true);
  }
  function openEditVertical(vertical: AppVertical) {
    setEditingVertical(vertical);
    setVerticalForm({ key: vertical.key, name: vertical.name, familyKey: vertical.familyKey ?? "", status: vertical.status });
    setVerticalDialog(true);
  }
  async function saveVertical() {
    if (!verticalForm.name.trim() || (!editingVertical && !verticalForm.key.trim())) return;
    setSaving(true);
    try {
      if (editingVertical) {
        await requestJson(`/admin/app-builder/verticals/${editingVertical.id}`, { method: "PATCH", body: JSON.stringify({ name: verticalForm.name.trim(), familyKey: verticalForm.familyKey.trim() || null, status: verticalForm.status }) });
      } else {
        await requestJson("/admin/app-builder/verticals", { method: "POST", body: JSON.stringify({ key: verticalForm.key.trim(), name: verticalForm.name.trim(), familyKey: verticalForm.familyKey.trim() || null, status: verticalForm.status, metadata: {} }) });
      }
      setVerticalDialog(false);
      await load();
      toast({ title: editingVertical ? "Vertical atualizada" : "Vertical criada" });
    } catch (error) {
      toast({ title: "Erro ao salvar vertical", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function openNewTemplate() {
    setEditingTemplate(null);
    setTemplateForm({ verticalId: verticals[0]?.id ?? "", parentTemplateId: "__none__", name: "", slug: "", description: "", status: "draft" });
    setTemplateDialog(true);
  }
  function openEditTemplate(template: AppTemplate) {
    setEditingTemplate(template);
    setTemplateForm({ verticalId: template.verticalId, parentTemplateId: template.parentTemplateId ?? "__none__", name: template.name, slug: template.slug, description: template.description ?? "", status: template.status });
    setTemplateDialog(true);
  }
  async function saveTemplate() {
    if (!templateForm.verticalId || !templateForm.name.trim() || !templateForm.slug.trim()) return;
    setSaving(true);
    try {
      const editableFields = {
        parentTemplateId: templateForm.parentTemplateId === "__none__" ? null : templateForm.parentTemplateId,
        name: templateForm.name.trim(),
        slug: templateForm.slug.trim(),
        description: templateForm.description.trim() || null,
        status: templateForm.status,
      };
      if (editingTemplate) {
        await requestJson(`/admin/app-builder/templates/${editingTemplate.id}`, { method: "PATCH", body: JSON.stringify(editableFields) });
      } else {
        await requestJson("/admin/app-builder/templates", { method: "POST", body: JSON.stringify({ ...editableFields, verticalId: templateForm.verticalId, settings: {} }) });
      }
      setTemplateDialog(false);
      await load();
      toast({ title: editingTemplate ? "Template atualizado" : "Template criado" });
    } catch (error) {
      toast({ title: "Erro ao salvar template", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const loadVersions = useCallback(async (template: AppTemplate) => {
    setVersionsLoading(true);
    try { setVersions(await requestJson<AppTemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`)); }
    catch (error) { toast({ title: "Erro ao carregar versões", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); }
    finally { setVersionsLoading(false); }
  }, [requestJson, toast]);

  async function openVersions(template: AppTemplate) {
    setVersionTemplate(template);
    setVersionForm({ definition: "{}", changeLog: "" });
    setVersionDialog(true);
    await loadVersions(template);
  }
  async function createVersion() {
    if (!versionTemplate) return;
    setSaving(true);
    try {
      const definition = parseJsonObject(versionForm.definition, "Definition");
      await requestJson(`/admin/app-builder/templates/${versionTemplate.id}/versions`, { method: "POST", body: JSON.stringify({ definition, changeLog: versionForm.changeLog.trim() || null }) });
      setVersionForm({ definition: "{}", changeLog: "" });
      await loadVersions(versionTemplate);
      toast({ title: "Nova versão criada como rascunho" });
    } catch (error) {
      toast({ title: "Erro ao criar versão", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSaving(false); }
  }
  async function publishVersion(version: AppTemplateVersion) {
    if (!versionTemplate || version.status === "published") return;
    setSaving(true);
    try {
      await requestJson(`/admin/app-builder/templates/${versionTemplate.id}/versions/${version.id}/publish`, { method: "POST" });
      await loadVersions(versionTemplate);
      toast({ title: `Versão ${version.version} publicada` });
    } catch (error) {
      toast({ title: "Erro ao publicar versão", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function openNewRegistry() {
    setRegistryForm({ kind: "components", key: "", name: "", category: "", description: "", riskLevel: "low", verticalId: "__global__", schemaJson: "{}", secondaryJson: "{}" });
    setRegistryDialog(true);
  }
  async function saveRegistry() {
    if (!registryForm.key.trim() || !registryForm.name.trim()) return;
    setSaving(true);
    try {
      const schemaObject = parseJsonObject(registryForm.schemaJson, "Schema/configuração");
      const secondaryObject = parseJsonObject(registryForm.secondaryJson, "Propriedades padrão");
      const common = { key: registryForm.key.trim(), name: registryForm.name.trim() };
      let payload: Record<string, unknown>;
      if (registryForm.kind === "components") payload = { ...common, category: registryForm.category.trim() || null, configSchema: schemaObject, defaultProps: secondaryObject };
      else if (registryForm.kind === "features") payload = { ...common, description: registryForm.description.trim() || null, category: registryForm.category.trim() || null, configSchema: schemaObject };
      else if (registryForm.kind === "actions") payload = { ...common, description: registryForm.description.trim() || null, category: registryForm.category.trim() || null, inputSchema: schemaObject, riskLevel: registryForm.riskLevel };
      else if (registryForm.kind === "workflows") payload = { ...common, description: registryForm.description.trim() || null, triggerSchema: schemaObject };
      else payload = { ...common, verticalId: registryForm.verticalId === "__global__" ? null : registryForm.verticalId, riskLevel: registryForm.riskLevel, rules: schemaObject };
      await requestJson(`/admin/app-builder/registries/${registryForm.kind}`, { method: "POST", body: JSON.stringify(payload) });
      setRegistryDialog(false);
      await load();
      toast({ title: `${REGISTRY_KIND_LABEL[registryForm.kind]} criado` });
    } catch (error) {
      toast({ title: "Erro ao salvar registry", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const parentOptions = templates.filter((template) => template.verticalId === templateForm.verticalId && template.id !== editingTemplate?.id);
  const registryJsonLabel = registryForm.kind === "components" || registryForm.kind === "features" ? "Config schema (JSON)" : registryForm.kind === "actions" ? "Input schema (JSON)" : registryForm.kind === "workflows" ? "Trigger schema (JSON)" : "Regras / guardrails (JSON)";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Smartphone className="h-5 w-5 text-primary" />App Builder</h1>
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">SuperAdmin</Badge>
            <Badge variant="secondary">App Instances</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Crie apps por tenant somente a partir de templates versionados e publicados. A instância nasce em rascunho e permanece desacoplada de qualquer vertical específica.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "apps" && <Button type="button" onClick={openNewApp} disabled={tenants.length === 0 || templates.length === 0}><Plus className="mr-2 h-4 w-4" />Novo app</Button>}
          {view === "verticals" && <Button type="button" onClick={openNewVertical}><Plus className="mr-2 h-4 w-4" />Nova vertical</Button>}
          {view === "templates" && <Button type="button" onClick={openNewTemplate} disabled={verticals.length === 0}><Plus className="mr-2 h-4 w-4" />Novo template</Button>}
          {view === "registries" && <Button type="button" onClick={openNewRegistry}><Plus className="mr-2 h-4 w-4" />Novo registry</Button>}
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => <Card key={metric.label}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{loading ? "—" : metric.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{metric.helper}</p></div><div className="rounded-xl bg-primary/10 p-2 text-primary"><metric.icon className="h-4 w-4" /></div></div></CardContent></Card>)}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">{NAV.map((item) => <button key={item.key} type="button" onClick={() => setView(item.key)} className={cn("flex min-h-[38px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors", view === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="h-4 w-4" />{item.label}</button>)}</div>

      {loading ? <div className="flex min-h-[260px] items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div> : view === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <Card><CardContent className="p-5"><div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Engenharia oficial</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{[["1. Vertical", "Define segmento e família de negócio."], ["2. Template", "Modelo global administrado pelo SuperAdmin."], ["3. Versão", "Snapshot publicado e preservado no histórico."], ["4. App Instance", "Instância white-label isolada por tenant."]].map(([title, description]) => <div key={title} className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>)}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Guardrails</h2></div><div className="mt-4 space-y-3 text-xs text-muted-foreground"><p>• Autoria global exclusiva do SuperAdmin.</p><p>• App exige versão publicada do template.</p><p>• Nova instância sempre nasce em rascunho.</p><p>• PWA, iOS, Android e lojas continuam fora do escopo.</p></div></CardContent></Card>
        </div>
      ) : view === "apps" ? (
        apps.length === 0 ? <EmptyState title="Nenhum app criado" description="Crie o primeiro App Instance somente depois de existir uma versão de template publicada. Nenhum app vertical é gerado automaticamente." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{apps.map((app) => <Card key={app.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{app.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">/{app.slug}</p></div><StatusBadge status={app.status} /></div><div className="mt-4 space-y-1 text-xs text-muted-foreground"><p>Template: <span className="text-foreground">{templateNameById.get(app.templateId) ?? app.templateId}</span></p><p>Tenant: <span className="text-foreground">{tenantNameById.get(app.tenantId) ?? app.tenantId}</span></p></div></CardContent></Card>)}</div>
      ) : view === "templates" ? (
        templates.length === 0 ? <EmptyState title="Nenhum template criado" description="Crie primeiro uma vertical e depois cadastre o template base. A versão publicada será o contrato usado na criação de apps." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <Card key={template.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{template.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{verticalNameById.get(template.verticalId) ?? "Vertical"}</p></div><StatusBadge status={template.status} /></div>{template.description && <p className="mt-3 text-xs leading-5 text-muted-foreground">{template.description}</p>}<p className="mt-3 font-mono text-[10px] text-muted-foreground">{template.slug}</p><div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEditTemplate(template)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button><Button size="sm" variant="outline" onClick={() => void openVersions(template)}><History className="mr-1.5 h-3.5 w-3.5" />Versões</Button></div></CardContent></Card>)}</div>
      ) : view === "verticals" ? (
        verticals.length === 0 ? <EmptyState title="Nenhuma vertical de app cadastrada" description="Cadastre somente as verticais que realmente terão um modelo de app oficial. Isso não altera os segmentos comerciais já existentes do VendorAI." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{verticals.map((vertical) => <Card key={vertical.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{vertical.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{vertical.key}</p></div><StatusBadge status={vertical.status} /></div><p className="mt-3 text-xs text-muted-foreground">Família: {vertical.familyKey || "Ainda não definida"}</p><Button size="sm" variant="outline" className="mt-4" onClick={() => openEditVertical(vertical)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button></CardContent></Card>)}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{[["Componentes", registries.components, Component], ["Funcionalidades", registries.features, Layers3], ["Ações", registries.actions, AppWindow], ["Workflows", registries.workflows, GitBranch], ["Políticas de IA", registries.aiPolicies, Bot]].map(([label, rawItems, Icon]) => { const items = rawItems as RegistryItem[]; const RegistryIcon = Icon as typeof Smartphone; return <Card key={label as string}><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><RegistryIcon className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{label as string}</p></div><Badge variant="secondary">{items.length}</Badge></div>{items.length === 0 ? <p className="mt-4 text-xs leading-5 text-muted-foreground">Nenhum item registrado ainda.</p> : <div className="mt-3 space-y-2">{items.slice(0, 8).map((item) => <div key={item.id} className="rounded-lg border px-2.5 py-2"><div className="flex items-start justify-between gap-2"><p className="truncate text-xs font-medium">{item.name}</p>{item.riskLevel && <span className="text-[9px] uppercase text-muted-foreground">{item.riskLevel}</span>}</div><p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{item.key}</p></div>)}{items.length > 8 && <p className="text-[10px] text-muted-foreground">+ {items.length - 8} itens</p>}</div>}</CardContent></Card>; })}</div>
      )}

      <Dialog open={appDialog} onOpenChange={setAppDialog}>
        <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Novo App Instance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><p className="text-sm font-medium">Tenant</p><Select value={appForm.tenantId} onValueChange={(tenantId) => setAppForm({ ...appForm, tenantId })}><SelectTrigger><SelectValue placeholder="Selecione o tenant" /></SelectTrigger><SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}{tenant.status ? ` · ${tenant.status}` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Template</p><Select value={appForm.templateId} onValueChange={(templateId) => void selectAppTemplate(templateId)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {verticalNameById.get(template.verticalId) ?? "Vertical"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><p className="text-sm font-medium">Versão publicada</p><Select value={appForm.templateVersionId} disabled={!appForm.templateId || appVersionsLoading || appVersions.length === 0} onValueChange={(templateVersionId) => setAppForm({ ...appForm, templateVersionId })}><SelectTrigger><SelectValue placeholder={appVersionsLoading ? "Carregando..." : "Selecione"} /></SelectTrigger><SelectContent>{appVersions.map((version) => <SelectItem key={version.id} value={version.id}>Versão {version.version}</SelectItem>)}</SelectContent></Select>{appForm.templateId && !appVersionsLoading && appVersions.length === 0 && <p className="text-xs text-amber-700">Este template ainda não possui versão publicada.</p>}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Nome do app</p><Input value={appForm.name} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} placeholder="Nome interno / white-label" /></div><div className="space-y-1.5"><p className="text-sm font-medium">Slug</p><Input value={appForm.slug} onChange={(e) => setAppForm({ ...appForm, slug: e.target.value })} placeholder="meu-app" /></div></div>
            <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">A criação não publica nada. O App Instance nasce como <strong className="text-foreground">rascunho</strong>, associado ao tenant e à versão publicada escolhida.</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAppDialog(false)}>Cancelar</Button><Button onClick={() => void createApp()} disabled={saving || !appForm.templateVersionId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar app</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verticalDialog} onOpenChange={setVerticalDialog}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editingVertical ? "Editar vertical" : "Nova vertical"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Chave</p><Input value={verticalForm.key} disabled={!!editingVertical} onChange={(e) => setVerticalForm({ ...verticalForm, key: e.target.value })} placeholder="ex: advocacia" /></div><div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={verticalForm.name} onChange={(e) => setVerticalForm({ ...verticalForm, name: e.target.value })} placeholder="Nome da vertical" /></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Família</p><Input value={verticalForm.familyKey} onChange={(e) => setVerticalForm({ ...verticalForm, familyKey: e.target.value })} placeholder="ex: servicos" /></div><div className="space-y-1.5"><p className="text-sm font-medium">Status</p><Select value={verticalForm.status} onValueChange={(status) => setVerticalForm({ ...verticalForm, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativo</SelectItem><SelectItem value="inactive">Inativo</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div></div></div><DialogFooter><Button variant="outline" onClick={() => setVerticalDialog(false)}>Cancelar</Button><Button onClick={() => void saveVertical()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{editingTemplate ? "Editar template" : "Novo template"}</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Vertical</p><Select value={templateForm.verticalId} disabled={!!editingTemplate} onValueChange={(verticalId) => setTemplateForm({ ...templateForm, verticalId, parentTemplateId: "__none__" })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{verticals.map((vertical) => <SelectItem key={vertical.id} value={vertical.id}>{vertical.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><p className="text-sm font-medium">Template pai</p><Select value={templateForm.parentTemplateId} onValueChange={(parentTemplateId) => setTemplateForm({ ...templateForm, parentTemplateId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem herança</SelectItem>{parentOptions.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></div><div className="space-y-1.5"><p className="text-sm font-medium">Slug</p><Input value={templateForm.slug} onChange={(e) => setTemplateForm({ ...templateForm, slug: e.target.value })} placeholder="template-base" /></div></div><div className="space-y-1.5"><p className="text-sm font-medium">Descrição</p><Textarea rows={3} value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} /></div><div className="space-y-1.5"><p className="text-sm font-medium">Status do template</p><Select value={templateForm.status} onValueChange={(status) => setTemplateForm({ ...templateForm, status })}><SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancelar</Button><Button onClick={() => void saveTemplate()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={versionDialog} onOpenChange={setVersionDialog}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Versões · {versionTemplate?.name}</DialogTitle></DialogHeader><div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]"><div className="space-y-3"><div className="space-y-1.5"><p className="text-sm font-medium">Definition JSON</p><Textarea rows={10} className="font-mono text-xs" value={versionForm.definition} onChange={(e) => setVersionForm({ ...versionForm, definition: e.target.value })} /></div><div className="space-y-1.5"><p className="text-sm font-medium">Changelog</p><Textarea rows={3} value={versionForm.changeLog} onChange={(e) => setVersionForm({ ...versionForm, changeLog: e.target.value })} placeholder="O que mudou nesta versão" /></div><Button className="w-full" onClick={() => void createVersion()} disabled={saving}><Plus className="mr-2 h-4 w-4" />Criar versão rascunho</Button></div><div className="space-y-2"><p className="text-sm font-medium">Histórico</p>{versionsLoading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : versions.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-xs text-muted-foreground">Nenhuma versão criada.</p> : versions.map((version) => <div key={version.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Versão {version.version}</p><p className="mt-1 text-xs text-muted-foreground">{version.changeLog || "Sem changelog"}</p></div><StatusBadge status={version.status} /></div>{version.status !== "published" && <Button size="sm" variant="outline" className="mt-3" onClick={() => void publishVersion(version)} disabled={saving}><Rocket className="mr-1.5 h-3.5 w-3.5" />Publicar</Button>}</div>)}</div></div></DialogContent></Dialog>

      <Dialog open={registryDialog} onOpenChange={setRegistryDialog}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Novo registry</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><p className="text-sm font-medium">Tipo</p><Select value={registryForm.kind} onValueChange={(kind) => setRegistryForm({ ...registryForm, kind: kind as RegistryKind, riskLevel: kind === "ai-policies" ? "medium" : "low" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="components">Componente</SelectItem><SelectItem value="features">Funcionalidade</SelectItem><SelectItem value="actions">Ação</SelectItem><SelectItem value="workflows">Workflow</SelectItem><SelectItem value="ai-policies">Política de IA</SelectItem></SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><p className="text-sm font-medium">Chave</p><Input value={registryForm.key} onChange={(e) => setRegistryForm({ ...registryForm, key: e.target.value })} placeholder="ex: crm.contact-card" /></div><div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={registryForm.name} onChange={(e) => setRegistryForm({ ...registryForm, name: e.target.value })} /></div></div>{registryForm.kind !== "ai-policies" && registryForm.kind !== "workflows" && <div className="space-y-1.5"><p className="text-sm font-medium">Categoria</p><Input value={registryForm.category} onChange={(e) => setRegistryForm({ ...registryForm, category: e.target.value })} /></div>}{registryForm.kind !== "components" && registryForm.kind !== "ai-policies" && <div className="space-y-1.5"><p className="text-sm font-medium">Descrição</p><Textarea rows={2} value={registryForm.description} onChange={(e) => setRegistryForm({ ...registryForm, description: e.target.value })} /></div>}{(registryForm.kind === "actions" || registryForm.kind === "ai-policies") && <div className="space-y-1.5"><p className="text-sm font-medium">Nível de risco</p><Select value={registryForm.riskLevel} onValueChange={(riskLevel) => setRegistryForm({ ...registryForm, riskLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixo</SelectItem><SelectItem value="medium">Médio</SelectItem><SelectItem value="high">Alto</SelectItem><SelectItem value="critical">Crítico</SelectItem></SelectContent></Select></div>}{registryForm.kind === "ai-policies" && <div className="space-y-1.5"><p className="text-sm font-medium">Escopo da vertical</p><Select value={registryForm.verticalId} onValueChange={(verticalId) => setRegistryForm({ ...registryForm, verticalId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__global__">Global</SelectItem>{verticals.map((vertical) => <SelectItem key={vertical.id} value={vertical.id}>{vertical.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-1.5"><p className="text-sm font-medium">{registryJsonLabel}</p><Textarea rows={7} className="font-mono text-xs" value={registryForm.schemaJson} onChange={(e) => setRegistryForm({ ...registryForm, schemaJson: e.target.value })} /></div>{registryForm.kind === "components" && <div className="space-y-1.5"><p className="text-sm font-medium">Default props (JSON)</p><Textarea rows={5} className="font-mono text-xs" value={registryForm.secondaryJson} onChange={(e) => setRegistryForm({ ...registryForm, secondaryJson: e.target.value })} /></div>}</div><DialogFooter><Button variant="outline" onClick={() => setRegistryDialog(false)}>Cancelar</Button><Button onClick={() => void saveRegistry()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar registry</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
