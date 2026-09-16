import { lazy, Suspense, useState, type ElementType } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  LayoutGrid,
  Mic2,
  Palette,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Scissors,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GraphicDesignDirectorPanel = lazy(() => import("@/components/video/GraphicDesignDirectorPanel"));
const GraphicDesignTimelineHandoff = lazy(() => import("@/components/video/GraphicDesignTimelineHandoff"));
const GuidedVideoCreationPanel = lazy(() => import("@/components/video/GuidedVideoCreationPanel"));
const VideoProjectsPanel = lazy(() => import("@/components/video/VideoProjectsPanel"));
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

const WORKFLOW_STEPS = [
  { number: 1, label: "Briefing", description: "Objetivo, produto, público e canal" },
  { number: 2, label: "Direção + roteiro", description: "Conceito, gancho, mensagem e CTA" },
  { number: 3, label: "Storyboard", description: "Cenas, mídias, textos e duração" },
  { number: 4, label: "Produção", description: "Mídias reais, voz e áudio" },
  { number: 5, label: "Finalização", description: "Verificação, render e publicação" },
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
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const planExecution = query.get("from") === "media-calendar";
  const advancedMode = query.get("advanced") === "1";
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSection, setAdvancedSection] = useState<AdvancedSection>(null);
  const [showTools, setShowTools] = useState(false);

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

  return (
    <div className="space-y-6 pb-28 sm:pb-10">
      <header className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-card to-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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
                Crie um vídeo profissional em cinco etapas. A VendorAI cuida de direção visual, seleção de mídia, consistência da marca e controle de qualidade nos bastidores.
              </p>
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

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW_STEPS.map((step) => (
            <div key={step.number} className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{step.number}</span>
                <p className="text-sm font-semibold text-foreground">{step.label}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.035] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Qualidade profissional sem exigir conhecimento técnico</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              O sistema prioriza mídias reais da empresa e do catálogo, mantém identidade visual, valida roteiro e cenas antes do render e usa IA generativa somente quando faltar material adequado.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {["Mídia real primeiro", "Marca consistente", "Verificação antes de gerar", "Troca de mídia por cena"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" />{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<LoadingPanel label="Carregando projetos de vídeo…" />}>
        <VideoProjectsPanel />
      </Suspense>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Criar vídeo</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Preencha o essencial, aprove o roteiro e deixe a VendorAI conduzir o restante do processo.</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">Rascunho salvo automaticamente</span>
        </div>

        <Suspense fallback={<LoadingPanel label="Carregando criador de vídeo…" />}>
          <GuidedVideoCreationPanel />
        </Suspense>
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
            <p className="mt-0.5 text-sm text-muted-foreground">Abra somente quando precisar controlar direção visual, Dublê, geração de cena ou padrão da marca.</p>
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-4.5 w-4.5" /></div>
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
            <p className="mt-0.5 text-sm text-muted-foreground">Recursos auxiliares para tarefas que não fazem parte do fluxo principal.</p>
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
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-4.5 w-4.5" /></div>
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
