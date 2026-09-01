import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Megaphone, ArrowRight } from "lucide-react";
import { LaunchCommandCenter } from "@/components/marketing/LaunchCommandCenter";

// Ponto de entrada único para campanhas: primeiro mostra o estado real do
// lançamento e o principal gargalo; depois o usuário escolhe criar campanha
// orgânica ou paga. A medição continua vindo do mesmo overview de Ads.
export default function CampanhasHub() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">Campanhas</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Acompanhe primeiro o que está virando intenção, trial, venda e receita. Depois crie ou ajuste campanhas com base no gargalo real do funil.
      </p>

      <LaunchCommandCenter />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setLocation("/campanhas")}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/campanhas")}
          className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Campanha orgânica</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              WhatsApp, e-mail ou Instagram. Mensagem direta pro seu público — sem custo de mídia, sem aprovação de plataforma.
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>Segmenta por risco de abandono, estágio do cliente ou etapa do funil</li>
              <li>Gera a imagem e o texto da mensagem com IA</li>
              <li>Envio direto, sem gasto de anúncio</li>
            </ul>
            <Button variant="secondary" className="w-full mt-2">
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
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Anúncio pago</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Google Ads ou Meta (Facebook/Instagram). Alcança gente nova, com investimento real em mídia.
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>Gera o criativo (texto ou imagem) com IA</li>
              <li>Passa por aprovação antes de publicar</li>
              <li>Você decide quando ativar o gasto real</li>
            </ul>
            <Button variant="secondary" className="w-full mt-2">
              Criar anúncio pago <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
