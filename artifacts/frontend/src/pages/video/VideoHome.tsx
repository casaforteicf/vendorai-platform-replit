import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  LayoutGrid,
  Mic2,
  Settings2,
  ShoppingBag,
  Sparkles,
  Scissors,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const VideoGeneratePanel = lazy(() => import("@/components/video/VideoGeneratePanel"));
const BrandVideoKitPanel = lazy(() => import("@/components/video/BrandVideoKitPanel"));

interface VideoCard {
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  action: string;
}

const CARDS: VideoCard[] = [
  {
    title: "Pessoas & Vozes",
    description: "Cadastre pessoas, personas autorizadas, referências de voz e permissões de uso.",
    icon: Mic2,
    route: "/content-studio/video/avatar",
    action: "Gerenciar",
  },
  {
    title: "Vídeo de Produto",
    description: "Transforme fotos reais do produto em vídeos para Reels, Stories e campanhas.",
    icon: ShoppingBag,
    route: "/content-studio/video/produto",
    action: "Criar vídeo",
  },
  {
    title: "Edição automática",
    description: "Envie um vídeo bruto e deixe a IA remover silêncios e trechos desnecessários.",
    icon: Scissors,
    route: "/content-studio/video/edicao",
    action: "Editar vídeo",
  },
  {
    title: "Legendagem automática",
    description: "Transcreva e aplique legendas prontas para conteúdo de redes sociais.",
    icon: Captions,
    route: "/content-studio/video/legenda",
    action: "Gerar legenda",
  },
  {
    title: "Clipes automáticos",
    description: "Transforme vídeos longos em cortes curtos no formato vertical para redes sociais.",
    icon: Clapperboard,
    route: "/content-studio/video/clipes",
    action: "Criar clipes",
  },
  {
    title: "Vídeo em lote",
    description: "Gere vários vídeos personalizados de uma vez usando dados estruturados.",
    icon: LayoutGrid,
    route: "/content-studio/video/lote",
    action: "Iniciar lote",
  },
];

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-sm">
      {label}
    </div>
  );
}

export default function VideoHome() {
  const [, navigate] = useLocation();
  const planExecution = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "media-calendar";
  const [showGenerator, setShowGenerator] = useState(planExecution);
  const [showBrandKit, setShowBrandKit] = useState(false);

  return (
    <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vídeo com IA</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {planExecution
                  ? "O briefing aprovado do Plano de Mídia já foi carregado. Revise as referências e gere o vídeo."
                  : "Crie, edite e padronize vídeos com o VendorAI Media Engine."}
              </p>
            </div>
          </div>
        </div>

        <Button onClick={() => setShowGenerator((value) => !value)} className="w-full lg:w-auto">
          <WandSparkles className="mr-2 h-4 w-4" />
          {showGenerator ? "Fechar gerador" : "Novo vídeo"}
        </Button>
      </header>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground sm:text-sm">{planExecution ? "Produzir vídeo do planejamento" : "Criar vídeo do zero"}</h2>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {planExecution ? "Briefing do plano" : "Media Engine"}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {planExecution
                  ? "Campanha, objetivo, público, oferta, canal e direção criativa vêm do calendário; você não precisa preencher a estratégia novamente."
                  : "Descreva a ideia, escolha formato e duração. O gerador abre somente quando necessário para manter a tela leve."}
              </p>
            </div>
          </div>
          <Button
            variant={showGenerator ? "outline" : "default"}
            onClick={() => setShowGenerator((value) => !value)}
            className="w-full sm:w-auto sm:shrink-0"
          >
            {showGenerator ? "Fechar" : "Abrir gerador"}
          </Button>
        </div>
      </section>

      {showGenerator && (
        <Suspense fallback={<LoadingPanel label="Carregando gerador de vídeo…" />}>
          <VideoGeneratePanel />
        </Suspense>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground sm:text-base">Ferramentas de vídeo</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Escolha o fluxo conforme o material que você já possui.</p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">6 ferramentas disponíveis</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 sm:gap-4">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.route}
                type="button"
                onClick={() => navigate(card.route)}
                className={cn(
                  "group flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm sm:min-h-[190px] sm:p-5",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Disponível
                  </span>
                </div>

                <div className="mt-3 flex-1 sm:mt-4">
                  <h3 className="text-base font-semibold text-foreground sm:text-sm">{card.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary sm:mt-4 sm:text-xs">
                  {card.action}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Padrão visual dos vídeos</h2>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Brand Video Kit</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Defina logo, abertura, encerramento, trilha e padrão de legendas usados automaticamente nos vídeos.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowBrandKit((value) => !value)} className="w-full sm:w-auto sm:shrink-0">
            {showBrandKit ? "Fechar configurações" : "Configurar padrão"}
          </Button>
        </div>
      </section>

      {showBrandKit && (
        <Suspense fallback={<LoadingPanel label="Carregando Brand Video Kit…" />}>
          <BrandVideoKitPanel />
        </Suspense>
      )}
    </div>
  );
}
