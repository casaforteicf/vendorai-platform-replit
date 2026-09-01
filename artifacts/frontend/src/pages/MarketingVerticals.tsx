import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  MARKETING_VERTICALS,
  type MarketingMacrosegmentKey,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ExternalLink,
  Megaphone,
  MessageCircle,
  Radar,
  Route,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

const MACROSEGMENTS: Record<
  MarketingMacrosegmentKey,
  { label: string; description: string }
> = {
  retail: {
    label: "Lojas e Varejo",
    description: "Venda, recompra e relacionamento com consumidor final.",
  },
  clinics: {
    label: "Clínicas e Saúde",
    description: "Agenda, retorno, relacionamento e recorrência com contexto.",
  },
  dealerships: {
    label: "Concessionárias e Automotivo",
    description: "Lead, avaliação, proposta, fechamento e próxima troca.",
  },
  distributors: {
    label: "Distribuidores e Atacado",
    description: "Carteira, mix, frequência, share of wallet e reativação B2B.",
  },
  services: {
    label: "Serviços Profissionais",
    description: "Orçamento, follow-up, decisão e recorrência em vendas consultivas.",
  },
  industries: {
    label: "Indústrias e B2B",
    description: "Especificação, múltiplos decisores, proposta técnica e expansão de conta.",
  },
};

const ALL = "all";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function publicLpUrl(slug: string) {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
  const base = configured || "https://appvendorai.com";
  return `${base}/lp/${slug}`;
}

function ProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: MarketingVerticalProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  if (!profile) return null;

  const segment = MACROSEGMENTS[profile.macrosegment];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="secondary">{segment.label}</Badge>
            <Badge variant="outline">{profile.audience}</Badge>
            {profile.compliance && profile.compliance !== "standard" && (
              <Badge variant="outline">Compliance: {profile.compliance}</Badge>
            )}
          </div>
          <DialogTitle className="text-xl">{profile.name}</DialogTitle>
          <DialogDescription>{profile.promise}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Dor central
            </p>
            <p className="text-sm font-medium">{profile.corePain}</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Route className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Jornada comercial</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.journey.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    {index + 1}. {step}
                  </Badge>
                  {index < profile.journey.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Agentes prioritários</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.priorityAgents.map((agent) => (
                  <Badge key={agent} variant="secondary">{agent}</Badge>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Radar className="h-4 w-4 text-emerald-600" />
                <h3 className="font-semibold text-sm">Revenue Scout</h3>
              </div>
              <div className="space-y-1.5">
                {profile.revenueScout.signals.slice(0, 5).map((signal) => (
                  <div key={signal} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Headline da LP
            </p>
            <p className="text-sm font-semibold">{profile.lp.headline}</p>
            <p className="text-sm text-muted-foreground mt-1">{profile.lp.subheadline}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 pt-2">
            <Button
              variant="outline"
              onClick={() => window.open(publicLpUrl(profile.slug), "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir LP
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLocation(`/campanhas?vertical=${encodeURIComponent(profile.slug)}`)}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Campanha orgânica
            </Button>
            <Button
              onClick={() => setLocation(`/ads?vertical=${encodeURIComponent(profile.slug)}`)}
            >
              <Megaphone className="h-4 w-4 mr-2" />
              Anúncio pago
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MarketingVerticals() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [macrosegment, setMacrosegment] = useState<string>(ALL);
  const [selected, setSelected] = useState<MarketingVerticalProfile | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return MARKETING_VERTICALS.filter((profile) => {
      if (macrosegment !== ALL && profile.macrosegment !== macrosegment) return false;
      if (!q) return true;
      const haystack = normalize(
        [
          profile.name,
          profile.slug,
          profile.corePain,
          profile.promise,
          ...profile.decisionMakers,
          ...profile.priorityAgents,
          ...profile.googleIntentSeeds,
        ].join(" "),
      );
      return haystack.includes(q);
    });
  }, [query, macrosegment]);

  const counts = useMemo(() => {
    return Object.keys(MACROSEGMENTS).reduce<Record<string, number>>((acc, key) => {
      acc[key] = MARKETING_VERTICALS.filter((item) => item.macrosegment === key).length;
      return acc;
    }, {});
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3"
            onClick={() => setLocation("/campanhas-nova")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar para Campanhas
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Mercados & LPs</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
            Fonte oficial do Marketing Vertical do VendorAI. Os mesmos perfis alimentam LP, jornada, pipeline,
            agentes, Revenue Scout, campanhas e otimização comercial.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-3 py-1.5">6 macrosegmentos</Badge>
          <Badge variant="secondary" className="px-3 py-1.5">{MARKETING_VERTICALS.length} mercados</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar mercado, dor, agente, decisor ou intenção Google..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={macrosegment === ALL ? "default" : "outline"}
              onClick={() => setMacrosegment(ALL)}
            >
              Todos ({MARKETING_VERTICALS.length})
            </Button>
            {(Object.keys(MACROSEGMENTS) as MarketingMacrosegmentKey[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={macrosegment === key ? "default" : "outline"}
                onClick={() => setMacrosegment(key)}
              >
                {MACROSEGMENTS[key].label} ({counts[key] ?? 0})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "mercado encontrado" : "mercados encontrados"}
        </p>
        {(query || macrosegment !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setMacrosegment(ALL);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((profile) => {
          const segment = MACROSEGMENTS[profile.macrosegment];
          return (
            <Card key={profile.id} className="flex flex-col hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Badge variant="outline">{segment.label}</Badge>
                    <CardTitle className="text-base leading-snug">{profile.name}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{profile.audience}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Dor</p>
                  <p className="text-sm leading-relaxed line-clamp-3">{profile.corePain}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Promessa</p>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{profile.promise}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.priorityAgents.slice(0, 4).map((agent) => (
                    <Badge key={agent} variant="secondary" className="font-normal">{agent}</Badge>
                  ))}
                  {profile.priorityAgents.length > 4 && (
                    <Badge variant="secondary" className="font-normal">+{profile.priorityAgents.length - 4}</Badge>
                  )}
                </div>
                <div className="mt-auto pt-2 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(profile)}>
                    Ver modelo
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => window.open(publicLpUrl(profile.slug), "_blank", "noopener,noreferrer")}
                  >
                    Abrir LP <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Nenhum mercado encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">Ajuste a busca ou limpe os filtros.</p>
          </CardContent>
        </Card>
      )}

      <ProfileDialog
        profile={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
