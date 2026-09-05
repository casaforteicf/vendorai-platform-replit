import { useMemo, useState } from "react";
import { Sparkles, X, ShieldCheck, BrainCircuit, Layers3 } from "lucide-react";
import { buildMarketingAgentUiCard, inferMarketingSurface } from "@workspace/vendor-brain/marketing-agent-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MARKETING_PATH_HINTS = [
  "marketing",
  "campanh",
  "content",
  "conteudo",
  "media",
  "midia",
  "ads",
  "anuncio",
  "calendar",
  "calendario",
  "performance",
  "analytics",
  "site",
  "landing",
  "video",
  "planej",
];

function isMarketingPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return MARKETING_PATH_HINTS.some((hint) => path.includes(hint));
}

export function MarketingAgentDock({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const visible = isMarketingPath(pathname);
  const card = useMemo(() => buildMarketingAgentUiCard(pathname), [pathname]);
  const surface = useMemo(() => inferMarketingSurface(pathname), [pathname]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {open && (
        <Card className="pointer-events-auto w-[360px] max-w-[calc(100vw-2rem)] border-primary/20 bg-background/95 shadow-2xl backdrop-blur">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{card.title}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Contexto: {surface}</Badge>
              <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> modo preparar</Badge>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <Layers3 className="h-3.5 w-3.5 text-primary" />
                Ações disponíveis nesta área
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{card.primaryAction}</Badge>
                {card.secondaryActions.map((action) => (
                  <Badge key={action} variant="outline">{action}</Badge>
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-4 text-muted-foreground">
              O agente usa a campanha, vertical, tenant, Brand Profile e dados da tela atual como contexto. Publicação e alteração de verba continuam sujeitas às permissões e ao nível de autonomia configurado.
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        className="pointer-events-auto gap-2 rounded-full px-4 shadow-lg"
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles className="h-4 w-4" />
        Marketing AI
      </Button>
    </div>
  );
}
