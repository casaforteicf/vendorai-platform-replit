import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Bot, CheckCircle2, FileSearch, Globe2, Loader2, MapPin, MessageCircle, Radar, Rocket, ShieldCheck, SlidersHorizontal, Sparkles, Target } from "lucide-react";

type ConfigResponse = {
  config: {
    setores: string[];
    cidades: string[];
    ritmoDiario: number;
    ativo: boolean;
  } | null;
  error?: string;
};

const DEFAULT_NICHES = ["clínicas odontológicas implantes", "odontologia estética"];
const DEFAULT_LOCATIONS = [
  "São Paulo, SP",
  "Rio de Janeiro, RJ",
  "Belo Horizonte, MG",
  "Curitiba, PR",
  "Porto Alegre, RS",
  "Brasília, DF",
  "Salvador, BA",
  "Recife, PE",
  "Fortaleza, CE",
  "Goiânia, GO",
];

const AUTOMATIC_RULES = [
  "Deduplicação, enriquecimento e dossiê com fontes/confiança",
  "Fit Score + Pain Score + Intent Score",
  "Contato válido + segmento + mínimo de 2 evidências",
  "LP personalizada obrigatória antes do SDR frio",
  "Tracking da LP e handoff para Closer quando houver intenção alta",
  "Bloqueio de não-lead, exclusão, agente desativado e opt-out",
  "Sem afirmações internas não comprovadas ou estimativas apresentadas como fato",
];

const EDITABLE_STRATEGY = [
  "Nicho/subnicho e ICP",
  "Região e cidades",
  "Ritmo máximo por dia",
  "Oferta, argumento e criativos",
  "Canais e mídia paga",
  "Cadência e thresholds avançados",
  "Orçamento, período e autonomia da IA",
];

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

function parseList(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter((item) => {
      if (item.length < 2) return false;
      const key = item.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function ColdProspectingCampaignPlanner() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";

  const [nichesText, setNichesText] = useState(DEFAULT_NICHES.join("; "));
  const [locationsText, setLocationsText] = useState(DEFAULT_LOCATIONS.join("; "));
  const [dailyPace, setDailyPace] = useState(5);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<"plan" | "activate" | null>(null);
  const [currentlyActive, setCurrentlyActive] = useState(false);

  const niches = useMemo(() => parseList(nichesText), [nichesText]);
  const locations = useMemo(() => parseList(locationsText), [locationsText]);
  const combinations = niches.length * locations.length;

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/prospector/config-multi${isSuperAdmin ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar a configuração do Prospector");
        return response.json() as Promise<ConfigResponse>;
      })
      .then((data) => {
        if (cancelled || !data.config) return;
        if (data.config.setores?.length) setNichesText(data.config.setores.join("; "));
        if (data.config.cidades?.length) setLocationsText(data.config.cidades.join("; "));
        if (data.config.ritmoDiario) setDailyPace(data.config.ritmoDiario);
        setCurrentlyActive(Boolean(data.config.ativo));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, tenantId]);

  async function save(activate: boolean) {
    if (!tenantId) {
      toast({ title: "Selecione um tenant antes de configurar a campanha", variant: "destructive" });
      return;
    }
    if (!niches.length || !locations.length) {
      toast({ title: "Informe pelo menos um nicho e uma localidade", variant: "destructive" });
      return;
    }
    if (combinations > 60) {
      toast({ title: "Máximo de 60 combinações de nicho × localidade", variant: "destructive" });
      return;
    }

    setSavingMode(activate ? "activate" : "plan");
    try {
      const response = await fetch("/api/prospector/config-multi", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          setores: niches,
          cidades: locations,
          ritmoDiario: dailyPace,
          ativo: activate,
          ...(isSuperAdmin ? { tenantId } : {}),
        }),
      });
      const data = await response.json().catch(() => ({})) as ConfigResponse;
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar a campanha");
      setCurrentlyActive(activate);
      toast({
        title: activate ? "Prospecção inteligente ativada" : "Planejamento salvo",
        description: activate
          ? `Piloto Brasil ativo: ${niches.length} nicho(s), ${locations.length} mercados, até ${dailyPace} prospects/dia.`
          : "A busca permanece pausada até você aprovar e iniciar.",
      });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingMode(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando planejamento de prospecção…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">Prospecção Inteligente</h2>
            <Badge className={currentlyActive ? "bg-emerald-600" : ""}>{currentlyActive ? "Busca ativa" : "Planejamento"}</Badge>
            <Badge variant="outline">Piloto: Odontologia Brasil</Badge>
            <Badge variant="secondary">Validação inicial: 5/dia</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">O VendorAI encontra empresas frias em diferentes mercados do Brasil, valida sinais públicos, monta o dossiê, cria uma LP individual e só então libera a primeira abordagem.</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/prospector?tab=fila")}>Abrir fila do Prospector</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" />1. Público e nicho</CardTitle>
          <CardDescription>Piloto nacional preparado para comparar mercados antes de escalar o volume.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Nichos / ICP</Label>
            <Input value={nichesText} onChange={(event) => setNichesText(event.target.value)} placeholder="Ex: clínicas odontológicas implantes; odontologia estética" />
            <p className="text-xs text-muted-foreground">Separe por ponto e vírgula. Para o piloto: implantodontia + estética.</p>
          </div>
          <div className="space-y-2">
            <Label>Mercados / cidades</Label>
            <Input value={locationsText} onChange={(event) => setLocationsText(event.target.value)} placeholder="Ex: São Paulo, SP; Curitiba, PR; Recife, PE" />
            <p className="text-xs text-muted-foreground">O piloto Brasil distribui a busca entre mercados diferentes para descobrir onde há melhor qualidade e resposta antes de aumentar o volume.</p>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between gap-2"><Label>Ritmo máximo: {dailyPace} prospects/dia</Label><Badge variant="secondary">{combinations} combinações</Badge></div>
            <input className="w-full accent-primary" type="range" min={5} max={100} step={5} value={dailyPace} onChange={(event) => setDailyPace(Number(event.target.value))} />
            <p className="text-xs text-muted-foreground">Recomendação do piloto nacional: 5/dia. Depois da validação, aumente para 20, 50 ou mais conforme qualidade e conversão.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="pt-5 space-y-2"><Radar className="h-5 w-5 text-primary" /><p className="font-semibold text-sm">2. Descoberta</p><p className="text-xs text-muted-foreground">Google/Places, site, Instagram, CNPJ/CNAE, sinais de anúncios e outras fontes públicas habilitadas.</p></CardContent></Card>
        <Card><CardContent className="pt-5 space-y-2"><FileSearch className="h-5 w-5 text-primary" /><p className="font-semibold text-sm">3. Dossiê</p><p className="text-xs text-muted-foreground">Empresa, contato comercial, segmento, presença digital, reviews, agendamento, anúncios, unidades, fontes e confiança.</p></CardContent></Card>
        <Card><CardContent className="pt-5 space-y-2"><ShieldCheck className="h-5 w-5 text-primary" /><p className="font-semibold text-sm">4. Gate de qualidade</p><p className="text-xs text-muted-foreground">Exige segmento, contato utilizável, score mínimo e pelo menos 2 evidências verificáveis. Sem isso, não aborda.</p></CardContent></Card>
        <Card><CardContent className="pt-5 space-y-2"><Globe2 className="h-5 w-5 text-primary" /><p className="font-semibold text-sm">5. LP individual</p><p className="text-xs text-muted-foreground">Cria diagnóstico externo por empresa, com evidências, Fit/Pain, módulos relevantes e CTA de demonstração.</p></CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-emerald-200/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-600" />Programado pelo sistema</CardTitle>
            <CardDescription>Regras de segurança e inteligência aplicadas automaticamente em todas as campanhas frias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {AUTOMATIC_RULES.map((rule) => <div key={rule} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{rule}</span></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4 text-primary" />Estratégia editável</CardTitle>
            <CardDescription>O usuário decide o negócio e a campanha; a plataforma executa o processo técnico.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {EDITABLE_STRATEGY.map((rule) => <div key={rule} className="flex items-start gap-2 text-sm"><Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{rule}</span></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Planejamento operacional</CardTitle>
          <CardDescription>O que acontece automaticamente depois da aprovação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-3"><strong>Oferta</strong><p className="mt-1 text-muted-foreground">Diagnóstico comercial externo + demonstração personalizada do VendorAI.</p></div>
            <div className="rounded-lg border bg-background p-3"><strong>Mensagem</strong><p className="mt-1 text-muted-foreground">Baseada somente nos fatos/evidências do dossiê. Estimativas financeiras nunca são apresentadas como fatos.</p></div>
            <div className="rounded-lg border bg-background p-3"><strong>Cadeia de agentes</strong><p className="mt-1 text-muted-foreground">Prospector → Revenue Scout/score → LP → SDR → Follow-up 48h → Closer → CRM/JARVIS.</p></div>
            <div className="rounded-lg border bg-background p-3"><strong>Intenção</strong><p className="mt-1 text-muted-foreground">Visita à LP, clique no CTA e formulário elevam o Intent Score e ajudam a priorizar o Closer.</p></div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Nenhum prospect frio recebe abordagem automática apenas por score. A campanha exige evidências mínimas e LP publicada.</span></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" disabled={savingMode !== null} onClick={() => save(false)}>{savingMode === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar sem ativar</Button>
        <Button disabled={savingMode !== null || combinations === 0 || combinations > 60} onClick={() => save(true)}>{savingMode === "activate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Aprovar e iniciar piloto Brasil</Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" />A automação respeita o ritmo diário, compara resultados por mercado e pode ser pausada a qualquer momento no Prospector.</div>
      <div className="hidden"><MapPin /><MessageCircle /></div>
    </div>
  );
}
