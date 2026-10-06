import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ElementType } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Film,
  FolderOpen,
  Images,
  LayoutGrid,
  Loader2,
  Mic2,
  MoreHorizontal,
  Package,
  PlaySquare,
  Scissors,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const GuidedVideoCreationPanel = lazy(() => import("@/components/video/GuidedVideoCreationPanel"));
const VideoProjectsPanel = lazy(() => import("@/components/video/VideoProjectsPanel"));
const VideoPublishPanel = lazy(() => import("@/components/video/VideoPublishPanel"));
const MediaPlanReviewWorkspace = lazy(() => import("@/components/video/MediaPlanReviewWorkspace"));

type HomeView = "studio" | "origin" | "create" | "projects" | "publish" | "more";

type MediaProject = {
  id: string;
  title: string;
  kind: string;
  status: string;
  context?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MediaAsset = {
  id: string;
  type: string;
  role?: string | null;
  storageUrl?: string | null;
  storage_url?: string | null;
  accessUrl?: string | null;
  access_url?: string | null;
};

type MediaVersion = {
  assetId?: string | null;
  operation?: string | null;
  createdAt?: string | null;
};

type MediaJob = {
  status: string;
  output?: { videoAssetId?: string; assetId?: string } | null;
  updatedAt?: string | null;
};

type RecentProject = {
  key: string;
  title: string;
  project: MediaProject;
  versionCount: number;
  latestVersionNumber: number | null;
  previewUrl: string;
  assetId: string;
};

type MediaIdentity = {
  id: string;
  display_name: string;
  status: string;
  face_reference_asset_id?: string | null;
  voice_profile_count?: number;
  active_consent_count?: number;
};

type ResourceCard = {
  title: string;
  description: string;
  route: string;
  icon: ElementType;
};

const RESOURCES: ResourceCard[] = [
  { title: "Dublê Digital", description: "Gerencie seu apresentador", route: "/content-studio/video/avatar", icon: UserRound },
  { title: "Editor", description: "Ajuste vídeos quando precisar", route: "/content-studio/video/edicao", icon: Scissors },
  { title: "Clipes", description: "Transforme vídeos em cortes curtos", route: "/content-studio/video/clipes", icon: PlaySquare },
  { title: "Vídeos em lote", description: "Produza várias versões de uma vez", route: "/content-studio/video/lote", icon: LayoutGrid },
];

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function timestamp(project: MediaProject) {
  const value = new Date(project.updatedAt || project.createdAt || "").getTime();
  return Number.isFinite(value) ? value : 0;
}

function assetUrl(asset?: MediaAsset | null) {
  const raw = asset?.accessUrl ?? asset?.access_url ?? asset?.storageUrl ?? asset?.storage_url ?? "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

function projectStatusLabel(status: string) {
  if (status === "ready") return "Pronto";
  if (status === "processing") return "Em produção";
  if (status === "archived") return "Arquivado";
  return "Em edição";
}

function projectStatusClass(status: string) {
  if (status === "ready") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "processing") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function groupRecent(projects: MediaProject[]) {
  const groups = new Map<string, MediaProject[]>();
  for (const project of projects) {
    const context = asRecord(project.context);
    const seriesId = String(context.guidedVideoSeriesId ?? "").trim();
    const key = seriesId ? `guided:${seriesId}` : `project:${project.id}`;
    const current = groups.get(key) ?? [];
    current.push(project);
    groups.set(key, current);
  }
  return Array.from(groups.entries())
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => timestamp(b) - timestamp(a));
      const project = sorted[0]!;
      const context = asRecord(project.context);
      const explicitTitle = String(context.guidedVideoTitle ?? "").trim();
      const cleanTitle = project.title.replace(/\s*[·-]\s*V\d+\s*$/i, "").trim();
      const versions = sorted.map((item) => Math.max(1, Number(asRecord(item.context).guidedVideoVersion ?? 1) || 1));
      return {
        key,
        project,
        title: explicitTitle || cleanTitle || project.title,
        versionCount: sorted.length,
        latestVersionNumber: key.startsWith("guided:") ? Math.max(...versions) : null,
      };
    })
    .sort((a, b) => timestamp(b.project) - timestamp(a.project))
    .slice(0, 3);
}

function LoadingPanel({ label }: { label: string }) {
  return <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{label}</div>;
}

export default function VideoHome() {
  const [, navigate] = useLocation();
  const { user, tenantOverride, setTenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const targetTenantId = query.get("tenantId")?.trim() ?? "";
  const targetTenantName = query.get("tenantName")?.trim() || "Tenant selecionado";
  const isSuperAdmin = user?.platformRole === "super_admin";
  const planExecution = query.get("from") === "media-calendar";
  const advancedMode = query.get("advanced") === "1";

  const [view, setView] = useState<HomeView>("studio");
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [openingProjectId, setOpeningProjectId] = useState("");
  const [identity, setIdentity] = useState<MediaIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);

  useEffect(() => {
    if (!targetTenantId || !isSuperAdmin || targetTenantId === tenantId) return;
    setTenantOverride({ id: targetTenantId, name: targetTenantName, vertical: "" });
  }, [targetTenantId, targetTenantName, isSuperAdmin, tenantId, setTenantOverride]);

  const loadStudioSummary = useCallback(async () => {
    if (!tenantId) return;
    setProjectsLoading(true);
    setIdentityLoading(true);

    const projectsPromise = fetch(`/api/tenants/${tenantId}/media/projects?limit=50`, { headers: authHeaders() })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? "Falha ao carregar projetos");
        const projects = (Array.isArray(body.projects) ? body.projects : []) as MediaProject[];
        const videoProjects = projects.filter((project) => ["video", "reel", "story", "mixed"].includes(project.kind));
        const groups = groupRecent(videoProjects);
        const enriched = await Promise.all(groups.map(async (group) => {
          try {
            const detailResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${group.project.id}`, { headers: authHeaders() });
            const detail = await detailResponse.json().catch(() => ({})) as { assets?: MediaAsset[]; versions?: MediaVersion[]; jobs?: MediaJob[] };
            if (!detailResponse.ok) throw new Error("Falha ao abrir projeto");
            const outputAsset = (detail.assets ?? []).find((asset) => asset.type === "video" && asset.role === "output")
              ?? (detail.assets ?? []).find((asset) => asset.type === "video")
              ?? null;
            const latestVersion = [...(detail.versions ?? [])]
              .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
              .find((item) => item.assetId && item.operation !== "video_generate_scene");
            const latestJob = [...(detail.jobs ?? [])]
              .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
              .find((item) => item.status === "done" && (item.output?.videoAssetId || item.output?.assetId));
            return {
              ...group,
              previewUrl: assetUrl(outputAsset),
              assetId: latestVersion?.assetId || latestJob?.output?.videoAssetId || latestJob?.output?.assetId || outputAsset?.id || "",
            } satisfies RecentProject;
          } catch {
            return { ...group, previewUrl: "", assetId: "" } satisfies RecentProject;
          }
        }));
        setRecentProjects(enriched);
      })
      .catch(() => setRecentProjects([]))
      .finally(() => setProjectsLoading(false));

    const identityPromise = fetch(`/api/tenants/${tenantId}/media-engine/identities`, { headers: authHeaders() })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { identities?: MediaIdentity[] };
        if (!response.ok) throw new Error("Falha ao carregar Dublê");
        const identities = (body.identities ?? []).filter((item) => item.status !== "archived");
        setIdentity(identities.find((item) => item.status === "active") ?? identities[0] ?? null);
      })
      .catch(() => setIdentity(null))
      .finally(() => setIdentityLoading(false));

    await Promise.allSettled([projectsPromise, identityPromise]);
  }, [tenantId]);

  useEffect(() => { void loadStudioSummary(); }, [loadStudioSummary]);

  const openRecentProject = (project: RecentProject) => {
    if (openingProjectId) return;
    setOpeningProjectId(project.key);
    if (project.assetId) {
      navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(project.assetId)}`);
    } else {
      setView("projects");
      setOpeningProjectId("");
    }
  };

  const identityReady = useMemo(() => Boolean(
    identity
    && identity.status === "active"
    && (identity.voice_profile_count ?? 0) > 0
    && (identity.active_consent_count ?? 0) > 0,
  ), [identity]);

  if (planExecution && !advancedMode) {
    return (
      <Suspense fallback={<LoadingPanel label="Carregando revisão do material…" />}>
        <MediaPlanReviewWorkspace />
      </Suspense>
    );
  }

  if (view === "origin") {
    return (
      <div className="mx-auto max-w-5xl space-y-5 pb-12">
        <button type="button" onClick={() => setView("studio")} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Voltar ao Estúdio
        </button>
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Criar vídeo</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Como deseja começar?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha apenas a origem. Depois o Estúdio conduz briefing, roteiro, cenas e produção no mesmo fluxo.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setView("create")} className="group rounded-2xl border border-border bg-background p-5 text-left transition hover:border-primary/35 hover:bg-primary/[0.025]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
              <p className="mt-4 text-base font-semibold text-foreground">Briefing livre</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Comece do zero com objetivo, público, produto e canal.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Começar<ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
            <button type="button" onClick={() => navigate("/marketing/campanhas")} className="group rounded-2xl border border-border bg-background p-5 text-left transition hover:border-primary/35 hover:bg-primary/[0.025]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Send className="h-5 w-5" /></div>
              <p className="mt-4 text-base font-semibold text-foreground">Da campanha</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Use automaticamente objetivo, público, oferta e direção já definidos no Marketing.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Selecionar campanha<ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
            <button type="button" onClick={() => navigate("/produtos")} className="group rounded-2xl border border-border bg-background p-5 text-left transition hover:border-primary/35 hover:bg-primary/[0.025]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="h-5 w-5" /></div>
              <p className="mt-4 text-base font-semibold text-foreground">Do produto</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Escolha um produto ou serviço e aproveite informações e mídias já cadastradas.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Selecionar produto<ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
            <button type="button" onClick={() => navigate("/midias")} className="group rounded-2xl border border-border bg-background p-5 text-left transition hover:border-primary/35 hover:bg-primary/[0.025]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Images className="h-5 w-5" /></div>
              <p className="mt-4 text-base font-semibold text-foreground">Da Biblioteca</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Comece por fotos ou vídeos reais que já estão disponíveis para a empresa.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">Abrir Biblioteca<ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (view === "create") {
    return (
      <div className="space-y-4 pb-12">
        <button type="button" onClick={() => setView("studio")} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Voltar ao Estúdio
        </button>
        <Suspense fallback={<LoadingPanel label="Carregando criador de vídeo…" />}>
          <GuidedVideoCreationPanel />
        </Suspense>
      </div>
    );
  }

  if (view === "projects") {
    return (
      <div className="space-y-4 pb-12">
        <button type="button" onClick={() => setView("studio")} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Voltar ao Estúdio
        </button>
        <Suspense fallback={<LoadingPanel label="Carregando projetos…" />}>
          <VideoProjectsPanel />
        </Suspense>
      </div>
    );
  }

  if (view === "publish") {
    return (
      <div className="space-y-4 pb-12">
        <button type="button" onClick={() => setView("studio")} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Voltar ao Estúdio
        </button>
        <Suspense fallback={<LoadingPanel label="Carregando publicações…" />}>
          <VideoPublishPanel />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-28 sm:pb-12">
      {targetTenantId && !isSuperAdmin && targetTenantId !== tenantId && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Este link aponta para um projeto de outro tenant. Entre com um usuário autorizado nesse tenant para visualizar o projeto.
        </div>
      )}

      <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Estúdio de Vídeo</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Crie vídeos que vendem</h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">Com IA, suas mídias e o Dublê Digital da sua empresa.</p>
          </div>
          <div className="hidden h-40 items-center justify-center rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.06] via-background to-primary/[0.03] lg:flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border">
              <Film className="h-9 w-9 text-primary" />
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
          <button type="button" onClick={() => setView("origin")} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-95">
            <Sparkles className="h-5 w-5" />Criar vídeo<ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Escolha a origem na próxima etapa. O fluxo principal continua simples e guiado.</p>


        </div>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Projetos recentes</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Continue exatamente de onde parou.</p>
          </div>
          <button type="button" onClick={() => setView("projects")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Ver todos<ArrowRight className="h-4 w-4" /></button>
        </div>

        {projectsLoading ? (
          <LoadingPanel label="Carregando projetos recentes…" />
        ) : recentProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
            <Film className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold text-foreground">Nenhum projeto de vídeo ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro vídeo e ele aparecerá aqui automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentProjects.map((item) => (
              <button key={item.key} type="button" onClick={() => openRecentProject(item)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/25 hover:bg-muted/20 sm:p-4">
                <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {item.previewUrl ? <video src={item.previewUrl} muted preload="metadata" className="h-full w-full object-cover" /> : <Film className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.project.kind}{item.latestVersionNumber ? ` · V${item.latestVersionNumber}` : ""}{item.versionCount > 1 ? ` · ${item.versionCount} versões` : ""}</p>
                  <span className={cn("mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", projectStatusClass(item.project.status))}>{projectStatusLabel(item.project.status)}</span>
                </div>
                {openingProjectId === item.key ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <MoreHorizontal className="h-5 w-5 text-muted-foreground" />}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Seu Dublê Digital</p>
              {identityLoading ? (
                <p className="mt-1 text-xs text-muted-foreground">Carregando apresentador…</p>
              ) : identity ? (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-foreground">{identity.display_name}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", identityReady ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{identityReady ? "Pronto" : "Precisa concluir"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Seu apresentador para os vídeos da empresa.</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium text-foreground">Nenhum Dublê configurado</p>
                  <p className="mt-1 text-xs text-muted-foreground">Crie uma vez e reutilize nos próximos vídeos.</p>
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={() => navigate("/content-studio/video/avatar")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40">
            {identity ? "Gerenciar" : "Criar Dublê"}<ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Recursos do Estúdio</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Ferramentas secundárias ficam disponíveis sem poluir o fluxo principal.</p>
          </div>
          <button type="button" onClick={() => setView("more")} className="hidden items-center gap-1.5 text-sm font-semibold text-primary sm:inline-flex">Ver todos<ArrowRight className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {RESOURCES.map((resource) => {
            const Icon = resource.icon;
            return (
              <button key={resource.route} type="button" onClick={() => navigate(resource.route)} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/25 hover:bg-muted/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary"><Icon className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-foreground">{resource.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{resource.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: "studio" as const, label: "Estúdio", icon: Film },
            { id: "projects" as const, label: "Projetos", icon: FolderOpen },
            { id: "publish" as const, label: "Publicações", icon: Send },
            { id: "more" as const, label: "Mais", icon: MoreHorizontal },
          ].map((item) => {
            const Icon = item.icon;
            const active = item.id === view;
            return (
              <button key={item.id} type="button" onClick={() => item.id === "more" ? document.getElementById("video-studio-more")?.scrollIntoView({ behavior: "smooth" }) : setView(item.id)} className={cn("flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium", active ? "bg-primary/8 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
                <Icon className="h-5 w-5" />{item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {view === "more" && (
        <section id="video-studio-more" className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Mais recursos</h2></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => navigate("/content-studio/video/legenda")} className="rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-muted/40">Legendas automáticas</button>
            <button type="button" onClick={() => navigate("/content-studio/video/produto")} className="rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-muted/40">Vídeo de produto</button>
          </div>
        </section>
      )}
    </div>
  );
}
