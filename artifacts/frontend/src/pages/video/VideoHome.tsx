import { lazy, Suspense, useEffect, useState, type ElementType } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FolderOpen,
  LayoutGrid,
  Mic2,
  Palette,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Scissors,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const GraphicDesignDirectorPanel = lazy(() => import("@/components/video/GraphicDesignDirectorPanel"));
const GraphicDesignTimelineHandoff = lazy(() => import("@/components/video/GraphicDesignTimelineHandoff"));
const GuidedVideoCreationPanel = lazy(() => import("@/components/video/GuidedVideoCreationPanel"));
const VideoProjectsPanel = lazy(() => import("@/components/video/VideoProjectsPanel"));
const VideoPublishPanel = lazy(() => import("@/components/video/VideoPublishPanel"));
const VideoPerformancePanel = lazy(() => import("@/components/video/VideoPerformancePanel"));
const ProfessionalVideoStudioPanel = lazy(() => import("@/components/video/ProfessionalVideoStudioPanel"));
const VideoGeneratePanel = lazy(() => import("@/components/video/VideoGeneratePanel"));
const BrandVideoKitPanel = lazy(() => import("@/components/video/BrandVideoKitPanel"));
const MediaPlanReviewWorkspace = lazy(() => import("@/components/video/MediaPlanReviewWorkspace"));

interface VideoCard {
  title: string;
  description: string;
  icon: ElementType;
  route: string;
  action: string;
}

type AdvancedSection = "design" | "duble" | "broll" | "brand" | null;
type WorkspaceTab = "projects" | "create" | "publish" | "results";

const WORKFLOW_STEPS = ["Briefing", "Roteiro", "Storyboard", "Produção", "Finalização"];

const WORKSPACE_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  description: string;
  icon: ElementType;
}> = [
  { id: "projects", label: "Projetos", description: "Retomar e acompanhar", icon: FolderOpen },
  { id: "create", label: "Criar vídeo", description: "Fluxo guiado", icon: Sparkles },
  { id: "publish", label: "Publicar", description: "Publicar ou agendar", icon: Send },
  { id: "results", label: "Resultados", description: "Desempenho e aprendizado", icon: BarChart3 },
];

const CARDS: VideoCard[] = [
  { title: "Pessoas & Vozes", description: "Gerencie Dublês autorizados, vozes e consentimentos.", icon: Mic2, route: "/content-studio/video/avatar", action: "Gerenciar" },
  { title: "Vídeo de Produto", description: "Transforme fotos e vídeos reais do produto em peças comerciais.", icon: ShoppingBag, route: "/content-studio/video/produto", action: "Criar" },
  { title: "Editor de vídeo", description: "Ajuste timeline, áudio, música, textos, cortes e finalização.", icon: Scissors, route: "/content-studio/video/edicao", action: "Editar" },
  { title: "Legendas", description: "Transcreva e aplique legendas automaticamente.", icon: Captions, route: "/content-studio/video/legenda", action: "Gerar" },
  { title: "Clipes automáticos", description: "Transforme vídeos longos em cortes curtos para redes sociais.", icon: Clapperboard, route: "/content-studio/video/clipes", action: "Criar" },
  { title: "Vídeos em lote", description: "Produza várias versões a partir de dados estruturados.", icon: LayoutGrid, route: "/content-studio/video/lote", action: "Iniciar" },
];

const ADVANCED_SECTIONS: Array<{
  id: Exclude<AdvancedSection, null>;
  title: string;
  description: string;
  icon: ElementType;
}> = [
  {
    id: "design",
    title: "Direção visual avançada",
    description: "Controle de layout, tipografia, hierarquia, paleta e safe area.",
    icon: Palette,
  },
  {
    id: "duble",
    title: "Produção com Dublê Digital",
    description: "Fluxo especializado para apresentador, voz, lip-sync e Fidelity Score.",
    icon: Mic2,
  },
  {
    id: "broll",
    title: "Gerar cena ou B-roll com IA",
    description: "Use apenas quando a Biblioteca e o catálogo não tiverem mídia adequada.",
    icon: WandSparkles,
  },
  {
    id: "brand",
    title: "Padrão visual e sonoro",
    description: "Logo, abertura, encerramento, trilha, B-roll e legendas da marca.",
    icon: Settings2,
  },
];

function LoadingPanel({ label }: { label: string }) {
  return <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{label}</div>;
}

function AdvancedPanel({ section }: { section: Exclude<AdvancedSection, null> }) {
  if (section === "design") {
    return (
      <div className="space-y-4">
        <Suspense fallback={<LoadingPanel label="Carregando direção visual…" />}>
          <GraphicDesignDirectorPanel />
        </Suspense>
        <Suspense fallback={null}>
          <GraphicDesignTimelineHandoff />
        </Suspense>
      </div>
    );
  }

  if (section === "duble") {
    return (
      <Suspense fallback={<LoadingPanel label="Carregando produção com Dublê…" />}>
        <ProfessionalVideoStudioPanel />
      </Suspense>
    );
  }

  if (section === "broll") {
    return (
      <Suspense fallback={<LoadingPanel label="Carregando geração visual…" />}>
        <VideoGeneratePanel />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingPanel label="Carregando padrão da marca…" />}>
      <BrandVideoKitPanel />
    </Suspense>
  );
}

export default function VideoHome() {
  const [, navigate] = useLocation();
  const { user, tenantOverride, setTenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const targetTenantId = query.get("tenantId")?.trim() ?? "";
  const targetTenantName = query.get("tenantName")?.trim() || "Tenant selecionado";
  const targetProjectId = query.get("projectId")?.trim() ?? "";
  const isSuperAdmin = user?.platformRole === "super_admin";
  const planExecution = query.get("from") === "media-calendar";
  const advancedMode = query.get("advanced") === "1";
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("projects");
  const [resultsAvailable, setResultsAvailable] = useState<boolean | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSection, setAdvancedSection] = useState<AdvancedSection>(null);
  const [showTools, setShowTools] = useState(false);

  useEffect(() => {
    if (!targetTenantId || !isSuperAdmin || targetTenantId === tenantId) return;
    setTenantOverride({
      id: targetTenantId,
      name: targetTenantName,
      vertical: "",
    });
  }, [targetTenantId, targetTenantName, isSuperAdmin, tenantId, setTenantOverride]);

  useEffect(() => {
    if (!tenantId || planExecution) return;
    let disposed = false;

    const checkResults = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/social-publications`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` },
        });
        if (!response.ok) return;
        const body = await response.json().catch(() => ({})) as { publications?: Array<{ metadata?: Record<string, unknown> | null }> };
        const available = (body.publications ?? []).some((publication) => publication.metadata?.source === "video-studio");
        if (!disposed) setResultsAvailable(available);
      } catch {
        if (!disposed) setResultsAvailable((current) => current ?? false);
      }
    };

    void checkResults();
    const timer = window.setInterval(() => { void checkResults(); }, 12_000);
    const handleFocus = () => { void checkResults(); };
    window.addEventListener("focus", handleFocus);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [tenantId, planExecution]);

  useEffect(() => {
    if (workspaceTab === "results" && resultsAvailable === false) setWorkspaceTab("projects");
  }, [workspaceTab, resultsAvailable]);

  if (planExecution && !advancedMode) {
    return (
      <Suspense fallback={<LoadingPanel label="Carregando revisão do material…" />}>
        <MediaPlanReviewWorkspace />
      </Suspense>
    );
  }

  const openAdvanced = (section: Exclude<AdvancedSection, null>) => {
    setAdvancedSection((current) => (current === section ? null : section));
  };

  const visibleTabs = WORKSPACE_TABS.filter((tab) => tab.id !== "results" || resultsAvailable === true);

  return (
    <div className="space-y-5 pb-28 sm:pb-10">
      {targetTenantId && !isSuperAdmin && targetTenantId !== tenantId ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Este link aponta para um projeto de outro tenant. Entre com um usuário autorizado nesse tenant para visualizar o projeto.
        </div>
      ) : null}
      {targetProjectId ? (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-muted-foreground">
          Projeto solicitado: <span className="font-mono text-xs text-foreground">{targetProjectId}</span>
        </div>
      ) : null}
      <header className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-card to-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vídeos com IA</h1>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Modo guiado</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Crie, publique e acompanhe vídeos profissionais sem precisar dominar ferramentas técnicas.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {WORKFLOW_STEPS.map((step, index) => (
                  <span key={step} className="inline-flex items-center gap-1.5">
                    {index > 0 && <ArrowRight className="h-3 w-3 opacity-45" />}
                    <span>{step}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {planExecution && (
            <Button
              variant="outline"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("advanced");
                navigate(`${window.location.pathname}?${params.toString()}`);
              }}
              className="rounded-xl"
            >
              Voltar à revisão
            </Button>
          )}
        </div>
      </header>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.035] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold text-foreground">Qualidade automática nos bastidores</span>
            <span className="hidden text-muted-foreground md:inline">Mídia real primeiro, roteiro aprovado, marca consistente e verificação antes de gerar.</span>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground md:hidden">
            {["Mídia real primeiro", "Roteiro aprovado", "Verificação final"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid gap-1 border-b border-border bg-muted/20 p-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspaceTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                  active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{tab.label}</p>
                  <p className="mt-0.5 truncate text-[11px] opacity-75">{tab.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 sm:p-4">
          {workspaceTab === "projects" && (
            <Suspense fallback={<LoadingPanel label="Carregando projetos de vídeo…" />}>
              <VideoProjectsPanel />
            </Suspense>
          )}

          {workspaceTab === "create" && (
            <section className="space-y-3">
              <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Criar vídeo</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Preencha o essencial, aprove o roteiro e deixe a VendorAI conduzir o restante.</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Rascunho salvo automaticamente</span>
              </div>
              <Suspense fallback={<LoadingPanel label="Carregando criador de vídeo…" />}>
                <GuidedVideoCreationPanel />
              </Suspense>
            </section>
          )}

          {workspaceTab === "publish" && (
            <Suspense fallback={<LoadingPanel label="Carregando publicação e agendamento…" />}>
              <VideoPublishPanel />
            </Suspense>
          )}

          {workspaceTab === "results" && resultsAvailable === true && (
            <Suspense fallback={<LoadingPanel label="Carregando resultados e aprendizado…" />}>
              <VideoPerformancePanel />
            </Suspense>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => {
            setShowAdvanced((value) => !value);
            if (showAdvanced) setAdvancedSection(null);
          }}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted/40 sm:px-5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><SlidersHorizontal className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Opções avançadas</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Direção visual, Dublê, geração de cena e padrão da marca.</p>
          </div>
          <span className="hidden rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">Opcional</span>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvanced && (
          <div className="border-t border-border p-3 sm:p-4">
            <div className="grid gap-2 md:grid-cols-2">
              {ADVANCED_SECTIONS.map((item) => {
                const Icon = item.icon;
                const active = advancedSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openAdvanced(item.id)}
                    className={`rounded-2xl border p-4 text-left transition ${active ? "border-primary/40 bg-primary/[0.045]" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                      </div>
                      <ArrowRight className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${active ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {advancedSection && (
              <div className="mt-4 border-t border-border pt-4">
                <AdvancedPanel section={advancedSection} />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowTools((value) => !value)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted/40 sm:px-5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Settings2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Ferramentas específicas</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Editor, legendas, clipes, lote e recursos especializados.</p>
          </div>
          {showTools ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showTools && (
          <div className="grid gap-2 border-t border-border p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.route}
                  type="button"
                  onClick={() => navigate(card.route)}
                  className="group rounded-2xl border border-border p-4 text-left transition hover:border-primary/30 hover:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">{card.action}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
