import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AppWindow,
  Boxes,
  Bot,
  Component,
  GitBranch,
  Layers3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewKey = "overview" | "apps" | "templates" | "verticals" | "registries";

type AppVertical = {
  id: string;
  key: string;
  name: string;
  familyKey?: string | null;
  status: string;
};

type AppTemplate = {
  id: string;
  verticalId: string;
  parentTemplateId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
};

type AppInstance = {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersionId: string;
  name: string;
  slug: string;
  status: string;
  updatedAt?: string;
};

type RegistryItem = {
  id: string;
  key: string;
  name: string;
  category?: string | null;
  status?: string;
  riskLevel?: string;
};

type RegistriesResponse = {
  components: RegistryItem[];
  features: RegistryItem[];
  actions: RegistryItem[];
  workflows: RegistryItem[];
  aiPolicies: RegistryItem[];
};

const EMPTY_REGISTRIES: RegistriesResponse = {
  components: [],
  features: [],
  actions: [],
  workflows: [],
  aiPolicies: [],
};

const NAV: Array<{ key: ViewKey; label: string; icon: typeof Smartphone }> = [
  { key: "overview", label: "Visão Geral", icon: AppWindow },
  { key: "apps", label: "Apps", icon: Smartphone },
  { key: "templates", label: "Templates", icon: Layers3 },
  { key: "verticals", label: "Verticais", icon: GitBranch },
  { key: "registries", label: "Registries", icon: Boxes },
];

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    archived: "Arquivado",
    draft: "Rascunho",
    preview: "Preview",
    published: "Publicado",
    deprecated: "Descontinuado",
  };
  return labels[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        status === "published" || status === "active"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : status === "draft" || status === "preview"
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "text-muted-foreground",
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <Layers3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export default function AdminAppBuilder() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<ViewKey>("overview");
  const [loading, setLoading] = useState(true);
  const [verticals, setVerticals] = useState<AppVertical[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [apps, setApps] = useState<AppInstance[]>([]);
  const [registries, setRegistries] = useState<RegistriesResponse>(EMPTY_REGISTRIES);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [verticalsResponse, templatesResponse, appsResponse, registriesResponse] = await Promise.all([
        fetch("/api/admin/app-builder/verticals", { headers }),
        fetch("/api/admin/app-builder/templates", { headers }),
        fetch("/api/admin/app-builder/apps", { headers }),
        fetch("/api/admin/app-builder/registries", { headers }),
      ]);

      const responses = [verticalsResponse, templatesResponse, appsResponse, registriesResponse];
      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(`Falha ao carregar App Builder (${failed.status})`);

      const [verticalRows, templateRows, appRows, registryRows] = await Promise.all([
        verticalsResponse.json() as Promise<AppVertical[]>,
        templatesResponse.json() as Promise<AppTemplate[]>,
        appsResponse.json() as Promise<AppInstance[]>,
        registriesResponse.json() as Promise<RegistriesResponse>,
      ]);

      setVerticals(verticalRows);
      setTemplates(templateRows);
      setApps(appRows);
      setRegistries(registryRows);
    } catch (error) {
      toast({
        title: "Não foi possível carregar o App Builder",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const verticalNameById = useMemo(
    () => new Map(verticals.map((vertical) => [vertical.id, vertical.name])),
    [verticals],
  );

  const templateNameById = useMemo(
    () => new Map(templates.map((template) => [template.id, template.name])),
    [templates],
  );

  const registryTotal =
    registries.components.length +
    registries.features.length +
    registries.actions.length +
    registries.workflows.length +
    registries.aiPolicies.length;

  const metrics = [
    { label: "Apps", value: apps.length, helper: "instâncias por tenant", icon: Smartphone },
    { label: "Templates", value: templates.length, helper: "modelos versionáveis", icon: Layers3 },
    { label: "Verticais", value: verticals.length, helper: "segmentos habilitados", icon: GitBranch },
    { label: "Registries", value: registryTotal, helper: "blocos reutilizáveis", icon: Boxes },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Smartphone className="h-5 w-5 text-primary" />
              App Builder
            </h1>
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              SuperAdmin
            </Badge>
            <Badge variant="secondary">Fundação</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Núcleo para criar e administrar apps white-label por vertical usando templates,
            componentes e funções reutilizáveis. Nesta etapa nenhum app vertical é gerado automaticamente.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{loading ? "—" : metric.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{metric.helper}</p>
                </div>
                <div className="rounded-xl bg-primary/8 p-2 text-primary">
                  <metric.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            className={cn(
              "flex min-h-[38px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              view === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : view === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Engenharia oficial</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["1. Vertical", "Define o segmento e a família de negócio."],
                  ["2. Template", "Modelo global administrado pelo SuperAdmin."],
                  ["3. Versão", "Snapshot publicado e preservado no histórico."],
                  ["4. App Instance", "Instância white-label isolada por tenant."],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-xl border bg-muted/20 p-4">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Regras desta fase</h2>
              </div>
              <div className="mt-4 space-y-3 text-xs text-muted-foreground">
                <div className="flex gap-2"><span className="font-semibold text-foreground">•</span><span>Autoria global exclusiva do SuperAdmin.</span></div>
                <div className="flex gap-2"><span className="font-semibold text-foreground">•</span><span>Apps pertencem a um tenant e respeitam isolamento de dados.</span></div>
                <div className="flex gap-2"><span className="font-semibold text-foreground">•</span><span>Templates e versões não são substituídos silenciosamente.</span></div>
                <div className="flex gap-2"><span className="font-semibold text-foreground">•</span><span>Editor visual, runtime PWA/iOS/Android e publicação ficam para próximas fases.</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : view === "apps" ? (
        apps.length === 0 ? (
          <EmptyState
            title="Nenhum app criado"
            description="Correto para esta fase: a engenharia está pronta para receber futuras instâncias, mas ainda não foi criado nenhum app de Advocacia, Farmácia, Fruteira ou outra vertical."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => (
              <Card key={app.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{app.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">/{app.slug}</p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    <p>Template: <span className="text-foreground">{templateNameById.get(app.templateId) ?? app.templateId}</span></p>
                    <p>Tenant: <span className="font-mono text-[11px] text-foreground">{app.tenantId}</span></p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : view === "templates" ? (
        templates.length === 0 ? (
          <EmptyState
            title="Nenhum template criado"
            description="Os templates verticais serão cadastrados depois que o catálogo de componentes, funções e políticas estiver definido."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{template.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{verticalNameById.get(template.verticalId) ?? "Vertical"}</p>
                    </div>
                    <StatusBadge status={template.status} />
                  </div>
                  {template.description && <p className="mt-3 text-xs leading-5 text-muted-foreground">{template.description}</p>}
                  <p className="mt-3 font-mono text-[10px] text-muted-foreground">{template.slug}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : view === "verticals" ? (
        verticals.length === 0 ? (
          <EmptyState
            title="Nenhuma vertical de app cadastrada"
            description="As verticais do App Builder são independentes dos segmentos comerciais existentes até que o SuperAdmin decida quais modelos de app serão oficialmente preparados."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {verticals.map((vertical) => (
              <Card key={vertical.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{vertical.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{vertical.key}</p>
                    </div>
                    <StatusBadge status={vertical.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Família: {vertical.familyKey || "Ainda não definida"}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["Componentes", registries.components, Component],
            ["Funcionalidades", registries.features, Layers3],
            ["Ações", registries.actions, AppWindow],
            ["Workflows", registries.workflows, GitBranch],
            ["Políticas de IA", registries.aiPolicies, Bot],
          ].map(([label, rawItems, Icon]) => {
            const items = rawItems as RegistryItem[];
            const RegistryIcon = Icon as typeof Smartphone;
            return (
              <Card key={label as string}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RegistryIcon className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">{label as string}</p>
                    </div>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  {items.length === 0 ? (
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">Nenhum item registrado ainda.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {items.slice(0, 6).map((item) => (
                        <div key={item.id} className="rounded-lg border px-2.5 py-2">
                          <p className="truncate text-xs font-medium">{item.name}</p>
                          <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{item.key}</p>
                        </div>
                      ))}
                      {items.length > 6 && <p className="text-[10px] text-muted-foreground">+ {items.length - 6} itens</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
