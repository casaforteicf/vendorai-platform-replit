import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, Trash2, Loader2, TrendingUp, MousePointerClick, Eye, FileText, Zap } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface OportunidadePrevista {
  id: string;
  descricao: string;
  valorEstimado: string | null;
  previsaoData: string | null;
  status: string;
  createdAt: string;
}

interface BehaviorIntent {
  score: number;
  tier?: "baixo" | "medio" | "alto" | "muito_alto";
  tierLabel?: string;
  recommendedAction?: string;
  reasons?: string[];
  signals?: {
    pageViews?: number;
    ctaClicks?: number;
    formStarts?: number;
    formSubmits?: number;
    maxEngagedMs?: number;
    maxScrollDepth?: number;
    pricingViews?: number;
  };
  computedAt?: string;
}

interface LeadBehaviorResponse {
  discoveryData?: {
    behaviorIntent?: BehaviorIntent;
  } | null;
}

function intentStyle(tier?: BehaviorIntent["tier"]) {
  if (tier === "muito_alto") return "bg-red-100 text-red-700 border-red-200";
  if (tier === "alto") return "bg-orange-100 text-orange-700 border-orange-200";
  if (tier === "medio") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function fallbackTier(score: number): Pick<BehaviorIntent, "tier" | "tierLabel" | "recommendedAction"> {
  if (score >= 80) return { tier: "muito_alto", tierLabel: "Intenção muito alta", recommendedAction: "Contato comercial imediato." };
  if (score >= 60) return { tier: "alto", tierLabel: "Intenção alta", recommendedAction: "Priorizar contato comercial hoje." };
  if (score >= 35) return { tier: "medio", tierLabel: "Intenção média", recommendedAction: "Realizar abordagem consultiva e manter follow-up ativo." };
  return { tier: "baixo", tierLabel: "Intenção baixa", recommendedAction: "Nutrir e acompanhar novos sinais antes de pressionar a venda." };
}

function BehaviorIntentCard({ leadId }: { leadId: string }) {
  const { data: lead } = useQuery<LeadBehaviorResponse>({
    queryKey: ["lead-behavior-intent", leadId],
    queryFn: async () => {
      const response = await fetch(`/api/leads/${leadId}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Falha ao carregar intenção comportamental");
      return response.json();
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const intent = lead?.discoveryData?.behaviorIntent;
  if (!intent || typeof intent.score !== "number") return null;

  const classification = {
    ...fallbackTier(intent.score),
    ...intent,
  };
  const signals = classification.signals ?? {};
  const engagementSeconds = Math.round((signals.maxEngagedMs ?? 0) / 1000);

  return (
    <Card data-testid="card-behavior-intent" className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Intenção comportamental
          </span>
          <Badge variant="outline" className={intentStyle(classification.tier)} data-testid="badge-behavior-intent-tier">
            {classification.tierLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold tabular-nums" data-testid="text-behavior-intent-score">{classification.score}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
            <span className="text-xs text-muted-foreground">Sinais observados no site</span>
          </div>
          <Progress value={classification.score} className="h-2" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><Eye className="h-3.5 w-3.5" /><span className="text-[11px]">Páginas</span></div>
            <p className="mt-1 text-lg font-semibold">{signals.pageViews ?? 0}</p>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" /><span className="text-[11px]">CTAs</span></div>
            <p className="mt-1 text-lg font-semibold">{signals.ctaClicks ?? 0}</p>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5" /><span className="text-[11px]">Formulário</span></div>
            <p className="mt-1 text-lg font-semibold">{signals.formSubmits ?? 0}</p>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /><span className="text-[11px]">Engajamento</span></div>
            <p className="mt-1 text-lg font-semibold">{engagementSeconds}s</p>
          </div>
        </div>

        {classification.reasons && classification.reasons.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por que recebeu esse score</p>
            <ul className="space-y-1">
              {classification.reasons.slice(0, 6).map((reason, index) => (
                <li key={`${reason}-${index}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-primary">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Ação recomendada</span>
          </div>
          <p className="mt-1.5 text-sm leading-snug" data-testid="text-behavior-intent-action">
            {classification.recommendedAction}
          </p>
        </div>

        {classification.computedAt && (
          <p className="text-[10px] text-muted-foreground/70">
            Atualizado em {new Date(classification.computedAt).toLocaleString("pt-BR")}. O score comportamental é separado do Revenue Scout e da análise de churn.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function OportunidadesPrevistasCard({ leadId, summaryOnly = false }: { leadId: string; summaryOnly?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");

  const { data: oportunidades = [], isLoading } = useQuery<OportunidadePrevista[]>({
    queryKey: ["oportunidades-previstas", leadId],
    queryFn: () => fetch(`/api/leads/${leadId}/oportunidades-previstas`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!leadId,
  });

  const criar = useMutation({
    mutationFn: () => fetch(`/api/leads/${leadId}/oportunidades-previstas`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ descricao, valorEstimado: valor ? Number(valor) : undefined, previsaoData: data || undefined }),
    }).then((r) => { if (!r.ok) throw new Error("Falha ao salvar"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades-previstas", leadId] });
      setDescricao(""); setValor(""); setData(""); setAberto(false);
      toast({ title: "Oportunidade prevista registrada" });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => fetch(`/api/oportunidades-previstas/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades-previstas", leadId] }),
  });

  return (
    <div className="space-y-4">
      <BehaviorIntentCard leadId={leadId} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Oportunidades futuras previstas
          </CardTitle>
          {!summaryOnly && <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}><Plus className="h-4 w-4" /></Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground -mt-2">
            O que você acha que esse cliente vai precisar mais pra frente — mesmo sem ter sido dito ainda. Vira contexto extra pra IA na hora de qualificar e conduzir a conversa.
          </p>

          {!summaryOnly && aberto && (
            <div className="space-y-2 rounded-lg border p-3">
              <Textarea placeholder="Ex: Deve precisar de manutenção preventiva em uns 6 meses" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Input type="number" placeholder="Valor estimado (opcional)" value={valor} onChange={(e) => setValor(e.target.value)} className="text-sm" />
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="text-sm" />
              </div>
              <Button size="sm" disabled={!descricao.trim() || criar.isPending} onClick={() => criar.mutate()}>
                {criar.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Salvar
              </Button>
            </div>
          )}

          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : oportunidades.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Sparkles className="h-3.5 w-3.5" /> Nenhuma previsão registrada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {oportunidades.map((op) => (
                <div key={op.id} className="flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p>{op.descricao}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {op.valorEstimado && <Badge variant="outline" className="text-xs">R$ {Number(op.valorEstimado).toFixed(2)}</Badge>}
                      {op.previsaoData && <Badge variant="outline" className="text-xs">{new Date(op.previsaoData).toLocaleDateString("pt-BR")}</Badge>}
                    </div>
                  </div>
                  {!summaryOnly && <button onClick={() => remover.mutate(op.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
