import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Megaphone, ArrowLeft, ArrowRight, Layers3, Store, BrainCircuit, ShieldCheck, Sparkles, Radar } from "lucide-react";
import MarketingVerticals from "@/pages/MarketingVerticals";
import PracaVariedades from "@/pages/supermercado/SupermercadoCampanhas";
import { LaunchCommandCenter } from "@/components/marketing/LaunchCommandCenter";
import { AssistedMarketingManager } from "@/components/marketing/AssistedMarketingManager";
import ColdProspectingCampaignPlanner from "@/components/marketing/ColdProspectingCampaignPlanner";

// Visão geral das campanhas dentro do hub canônico de Marketing.
// As URLs antigas continuam disponíveis por compatibilidade, mas todos os
// fluxos novos retornam para /content?tab=campanhas para evitar telas paralelas.
export default function CampanhasHub() {
  const [location, setLocation] = useLocation();
  const queryString = location.includes("?") ? location.split("?")[1] ?? "" : "";
  const view = new URLSearchParams(queryString).get("view");
  const showMarkets = view === "mercados";
  const showProspecting = view === "prospeccao";
  const showPraca = view === "praca" || new URLSearchParams(window.location.search).get("tab") === "variedades";

  if (showMarkets) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar para Campanhas
        </Button>
        <MarketingVerticals />
      </div>
    );
  }

  if (showProspecting) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar para Campanhas
        </Button>
        <ColdProspectingCampaignPlanner />
      </div>
    );
  }

  if (showPraca) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/content?tab=campanhas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar para Campanhas
        </Button>
        <PracaVariedades />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">Campanhas</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Planeje aquisição, prospecção fria, campanhas orgânicas e mídia paga em uma única área. Para leads frios, o VendorAI valida dados públicos, cria dossiê e LP individual antes de permitir abordagem automática.
      </p>

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/[0.08] via-background to-background shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-primary/25 bg-primary/10 p-2.5 text-primary">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Agente de Marketing ativo nesta área</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="h-3 w-3" /> Contextual
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" /> Autonomia controlada
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  Ele acompanha campanha, objetivo, público, produto, canal e regras do tenant. Na prospecção fria, usa apenas o dossiê de evidências verificáveis para orientar LP, abordagem e priorização.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation("/content?tab=planejamento")}>Planejar campanha</Button>
              <Button size="sm" onClick={() => setLocation("/content?tab=campanhas&view=prospeccao")}>Prospecção inteligente <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <LaunchCommandCenter />
      <AssistedMarketingManager />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=prospeccao")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=prospeccao")} className="cursor-pointer border-primary/30 bg-primary/[0.03] transition-colors hover:border-primary/60 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Radar className="h-5 w-5 text-primary" /><h2 className="font-semibold">Prospecção inteligente</h2></div>
            <p className="text-sm text-muted-foreground">Encontre empresas frias por nicho e região e transforme sinais públicos em abordagem personalizada.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Dossiê com fontes e evidências</li><li>Fit, Pain e Intent Score</li><li>LP individual antes do SDR</li></ul>
            <Button className="w-full mt-auto">Planejar prospecção <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=organicas")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=organicas")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /><h2 className="font-semibold">Campanha orgânica</h2></div>
            <p className="text-sm text-muted-foreground">WhatsApp, e-mail ou Instagram. Mensagem direta para público já definido, sem custo de mídia.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Segmentação por estágio e perfil</li><li>Texto e imagem com IA</li><li>Envio pelos canais conectados</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Criar campanha orgânica <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/ads")} onKeyDown={(e) => e.key === "Enter" && setLocation("/ads")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h2 className="font-semibold">Anúncio pago</h2></div>
            <p className="text-sm text-muted-foreground">Google Ads ou Meta. Alcance gente nova com investimento real em mídia.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Gera criativo com IA</li><li>Usa intenção e contexto comercial</li><li>Você controla ativação e gasto</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Criar anúncio pago <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=praca")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=praca")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><h2 className="font-semibold">Praça.ai</h2></div>
            <p className="text-sm text-muted-foreground">Publique conteúdo e ofertas no Praça.ai e, quando fizer sentido, envie também pelo WhatsApp.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Conteúdo e promoções</li><li>Oferta programada</li><li>Disparo opcional</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Gerenciar Praça.ai <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=mercados")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=mercados")} className="cursor-pointer border-primary/20 bg-primary/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Mercados & LPs</h2></div>
            <p className="text-sm text-muted-foreground">Escolha uma vertical oficial e veja a arquitetura comercial daquele mercado.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Segmentos e nichos</li><li>Jornada, pipeline e agentes</li><li>LP e Revenue Scout</li></ul>
            <Button className="w-full mt-auto">Escolher mercado <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
