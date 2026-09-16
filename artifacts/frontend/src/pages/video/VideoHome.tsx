import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  LayoutGrid,
  Mic2,
  Palette,
  Settings2,
  ShoppingBag,
  Sparkles,
  Scissors,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GraphicDesignDirectorPanel = lazy(() => import("@/components/video/GraphicDesignDirectorPanel"));
const GraphicDesignTimelineHandoff = lazy(() => import("@/components/video/GraphicDesignTimelineHandoff"));
const ProfessionalCreationModelPanel = lazy(() => import("@/components/video/ProfessionalCreationModelPanel"));
const ProfessionalVideoStudioPanel = lazy(() => import("@/components/video/ProfessionalVideoStudioPanel"));
const VideoGeneratePanel = lazy(() => import("@/components/video/VideoGeneratePanel"));
const BrandVideoKitPanel = lazy(() => import("@/components/video/BrandVideoKitPanel"));
const MediaPlanReviewWorkspace = lazy(() => import("@/components/video/MediaPlanReviewWorkspace"));

interface VideoCard {
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  action: string;
}

const CARDS: VideoCard[] = [
  { title: "Pessoas & Vozes", description: "Dublês autorizados, vozes, consentimentos e Fidelity Score.", icon: Mic2, route: "/content-studio/video/avatar", action: "Gerenciar" },
  { title: "Vídeo de Produto", description: "Fotos e vídeos reais viram Reels, Stories e campanhas.", icon: ShoppingBag, route: "/content-studio/video/produto", action: "Criar vídeo" },
  { title: "Edição profissional", description: "Timeline, áudio, música, efeitos, textos, cortes e finalização.", icon: Scissors, route: "/content-studio/video/edicao", action: "Editar vídeo" },
  { title: "Legendagem", description: "Transcreva e aplique legendas automaticamente.", icon: Captions, route: "/content-studio/video/legenda", action: "Gerar legenda" },
  { title: "Clipes automáticos", description: "Transforme vídeos longos em cortes curtos.", icon: Clapperboard, route: "/content-studio/video/clipes", action: "Criar clipes" },
  { title: "Vídeo em lote", description: "Produza vários vídeos com dados estruturados.", icon: LayoutGrid, route: "/content-studio/video/lote", action: "Iniciar lote" },
];

function LoadingPanel({ label }: { label: string }) {
  return <div className="rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{label}</div>;
}

export default function VideoHome() {
  const [, navigate] = useLocation();
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const planExecution = query.get("from") === "media-calendar";
  const advancedMode = query.get("advanced") === "1";
  const [showGraphicDesign, setShowGraphicDesign] = useState(true);
  const [showProfessionalModel, setShowProfessionalModel] = useState(false);
  const [showDubleStudio, setShowDubleStudio] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showBrandKit, setShowBrandKit] = useState(false);

  if (planExecution && !advancedMode) {
    return (
      <Suspense fallback={<LoadingPanel label="Carregando revisão do material…" />}>
        <MediaPlanReviewWorkspace />
      </Suspense>
    );
  }

  return (
    <div className="space-y-6 pb-28 sm:pb-10">
      <header className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] via-card to-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Creative Studio Profissional</h1>
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">Design → layout → produção → QA</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {planExecution
                  ? "Editor avançado do material. Use somente quando precisar alterar direção de arte, mídia, roteiro, Dublê, áudio ou produção."
                  : "O design vem primeiro: direção de arte, grid, tipografia, hierarquia, paleta e safe area. Depois a peça ganha roteiro, movimento, Dublê, áudio e versões por canal."}
              </p>
            </div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            {planExecution && (
              <Button variant="outline" onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("advanced");
                navigate(`${window.location.pathname}?${params.toString()}`);
              }} className="flex-1 rounded-xl lg:flex-none">
                Voltar à revisão
              </Button>
            )}
            <Button onClick={() => setShowGraphicDesign((value) => !value)} className="flex-1 rounded-xl lg:flex-none">
              <Sparkles className="mr-2 h-4 w-4" />{showGraphicDesign ? "Recolher Design Director" : "Criar direção visual"}
            </Button>
          </div>
        </div>
      </header>

      {showGraphicDesign && (
        <Suspense fallback={<LoadingPanel label="Carregando Graphic Design Director…" />}>
          <GraphicDesignDirectorPanel />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <GraphicDesignTimelineHandoff />
      </Suspense>

      <section className="rounded-2xl border border-border bg-card">
        <button type="button" onClick={() => setShowProfessionalModel((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clapperboard className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Produção profissional após o design</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Briefing, roteiro aprovado, storyboard, mídias reais, áudio, preflight, render e QA final.</p>
          </div>
          <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary sm:inline">Etapa seguinte</span>
          <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${showProfessionalModel ? "rotate-90" : ""}`} />
        </button>
      </section>

      {showProfessionalModel && (
        <Suspense fallback={<LoadingPanel label="Carregando produção profissional…" />}>
          <ProfessionalCreationModelPanel />
        </Suspense>
      )}

      <section className="rounded-2xl border border-border bg-card">
        <button type="button" onClick={() => setShowDubleStudio((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Mic2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Produção com Dublê Digital validado</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Use quando a peça precisar de apresentador: Fidelity Score, voz, lip-sync, B-roll real e finalização.</p>
          </div>
          <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary sm:inline">Fluxo especializado</span>
          <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${showDubleStudio ? "rotate-90" : ""}`} />
        </button>
      </section>

      {showDubleStudio && (
        <Suspense fallback={<LoadingPanel label="Carregando produção com Dublê…" />}>
          <ProfessionalVideoStudioPanel />
        </Suspense>
      )}

      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04]">
        <button type="button" onClick={() => setShowGenerator((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300"><WandSparkles className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">B-roll / geração visual com IA</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Ferramenta auxiliar. Use somente para completar cenas específicas quando a Biblioteca não tiver material adequado.</p>
          </div>
          <span className="hidden rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 sm:inline dark:text-amber-300">Não é o fluxo principal</span>
          <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${showGenerator ? "rotate-90" : ""}`} />
        </button>
      </section>

      {showGenerator && (
        <Suspense fallback={<LoadingPanel label="Carregando ferramenta de B-roll…" />}>
          <VideoGeneratePanel />
        </Suspense>
      )}

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold text-foreground">Ferramentas</h2><p className="text-sm text-muted-foreground">Recursos especializados para captura, edição e distribuição.</p></div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {CARDS.map((card, index) => {
            const Icon = card.icon;
            return (
              <button
                key={card.route}
                type="button"
                onClick={() => navigate(card.route)}
                className={`flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted/50 sm:px-5 ${index !== CARDS.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{card.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{card.description}</p></div>
                <div className="hidden items-center gap-1 text-sm font-medium text-primary sm:flex">{card.action}<ArrowRight className="h-4 w-4" /></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <button type="button" onClick={() => setShowBrandKit((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Settings2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="font-semibold text-foreground">Padrão visual e sonoro dos vídeos</p><p className="mt-0.5 text-sm text-muted-foreground">Logo, abertura, encerramento, trilha, B-roll e legendas.</p></div>
          <span className="hidden rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">Brand Video Kit</span>
          <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${showBrandKit ? "rotate-90" : ""}`} />
        </button>
      </section>

      {showBrandKit && (
        <Suspense fallback={<LoadingPanel label="Carregando Brand Video Kit…" />}>
          <BrandVideoKitPanel />
        </Suspense>
      )}
    </div>
  );
}