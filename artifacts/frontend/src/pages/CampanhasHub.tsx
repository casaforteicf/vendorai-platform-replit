import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Megaphone, ArrowLeft, ArrowRight, Layers3, Store } from "lucide-react";
import MarketingVerticals from "@/pages/MarketingVerticals";
import PracaVariedades from "@/pages/supermercado/SupermercadoCampanhas";
import { LaunchCommandCenter } from "@/components/marketing/LaunchCommandCenter";
import { AssistedMarketingManager } from "@/components/marketing/AssistedMarketingManager";

// Visão geral das campanhas dentro do hub canônico de Marketing.
// As URLs antigas continuam disponíveis por compatibilidade, mas todos os
// fluxos novos retornam para /content?tab=campanhas para evitar telas paralelas.
export default function CampanhasHub() {
  const [location, setLocation] = useLocation();
  const queryString = location.includes("?") ? location.split("?")[1] ?? "" : "";
  const view = new URLSearchParams(queryString).get("view");
  const showMarkets = view === "mercados";
  const showPraca = view === "praca" || new URLSearchParams(window.location.search).get("tab") === "variedades";

  if (showMarkets) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setLocation("/content?tab=campanhas")}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para Campanhas
        </Button>
        <MarketingVerticals />
      </div>
    );
  }

  if (showPraca) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setLocation("/content?tab=campanhas")}
        >
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
        Acompanhe intenção, trial, venda, receita e retenção. Depois gere uma ação assistida, escolha o canal ou selecione o mercado oficial para usar a jornada, os agentes e a LP daquela vertical.
      </p>

      <LaunchCommandCenter />
      <AssistedMarketingManager />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=organicas")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=organicas")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /><h2 className="font-semibold">Campanha orgânica</h2></div>
            <p className="text-sm text-muted-foreground">WhatsApp, e-mail ou Instagram. Mensagem direta para o público — sem custo de mídia e sem aprovação de plataforma.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Segmenta por risco, estágio do cliente ou etapa do funil</li><li>Gera imagem e texto com IA</li><li>Envio direto, sem gasto de anúncio</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Criar campanha orgânica <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/ads")} onKeyDown={(e) => e.key === "Enter" && setLocation("/ads")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /><h2 className="font-semibold">Anúncio pago</h2></div>
            <p className="text-sm text-muted-foreground">Google Ads ou Meta (Facebook/Instagram). Alcance gente nova com investimento real em mídia.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Gera o criativo com IA</li><li>Usa intenção e contexto comercial</li><li>Você controla quando ativar gasto real</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Criar anúncio pago <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=praca")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=praca")} className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><h2 className="font-semibold">Praça.ai</h2></div>
            <p className="text-sm text-muted-foreground">Publique conteúdo e ofertas no Praça.ai e, quando fizer sentido, envie também pelo WhatsApp.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>Conteúdo e promoções no Praça.ai</li><li>Oferta programada</li><li>Disparo opcional para contatos</li></ul>
            <Button variant="secondary" className="w-full mt-auto">Gerenciar Praça.ai <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => setLocation("/content?tab=campanhas&view=mercados")} onKeyDown={(e) => e.key === "Enter" && setLocation("/content?tab=campanhas&view=mercados")} className="cursor-pointer border-primary/20 bg-primary/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Mercados & LPs</h2></div>
            <p className="text-sm text-muted-foreground">Escolha uma das 50 verticais oficiais antes de criar a campanha e veja a arquitetura comercial daquele mercado.</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5"><li>6 macrosegmentos e 50 mercados</li><li>Jornada, pipeline e agentes específicos</li><li>LP, Revenue Scout e intenção Google por vertical</li></ul>
            <Button className="w-full mt-auto">Escolher mercado <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
