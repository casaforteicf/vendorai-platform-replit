import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Megaphone, ArrowRight, Layers3 } from "lucide-react";

// Ponto de entrada único para marketing: o usuário pode iniciar campanha
// orgânica, mídia paga ou escolher primeiro a arquitetura de mercado.
export default function CampanhasHub() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">Campanhas</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Escolha como quer começar. Você pode partir do canal ou selecionar primeiro o mercado para usar a jornada, a dor, os agentes e a LP oficiais daquela vertical.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setLocation("/campanhas")}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/campanhas")}
          className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Campanha orgânica</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              WhatsApp, e-mail ou Instagram. Mensagem direta para o público — sem custo de mídia e sem aprovação de plataforma.
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>Segmenta por risco, estágio do cliente ou etapa do funil</li>
              <li>Gera imagem e texto com IA</li>
              <li>Envio direto, sem gasto de anúncio</li>
            </ul>
            <Button variant="secondary" className="w-full mt-auto">
              Criar campanha orgânica <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setLocation("/ads")}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/ads")}
          className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Anúncio pago</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Google Ads ou Meta (Facebook/Instagram). Alcance gente nova com investimento real em mídia.
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>Gera o criativo com IA</li>
              <li>Usa intenção e contexto comercial</li>
              <li>Você controla quando ativar gasto real</li>
            </ul>
            <Button variant="secondary" className="w-full mt-auto">
              Criar anúncio pago <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => setLocation("/marketing/mercados")}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/marketing/mercados")}
          className="cursor-pointer border-primary/20 bg-primary/[0.02] transition-colors hover:border-primary/50 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardContent className="pt-6 space-y-3 h-full flex flex-col">
            <div className="flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Mercados & LPs</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Escolha uma das 50 verticais oficiais antes de criar a campanha e veja a arquitetura comercial daquele mercado.
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>6 macrosegmentos e 50 mercados</li>
              <li>Jornada, pipeline e agentes específicos</li>
              <li>LP, Revenue Scout e intenção Google por vertical</li>
            </ul>
            <Button className="w-full mt-auto">
              Escolher mercado <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
