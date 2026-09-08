import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Layers3,
  ListChecks,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

const TYPE_LABELS: Record<string, string> = {
  recompra: "Recompra",
  cross_sell: "Cross-sell",
  reativacao: "Reativação",
  reativacao_sazonal: "Reativação sazonal",
  upgrade: "Upgrade",
  aniversario: "Relacionamento",
  follow_up: "Follow-up",
  renovacao: "Renovação",
  renovacao_seguro: "Renovação",
  manutencao: "Manutenção",
  sequencia_produto: "Próxima compra",
  grade_incompleta: "Complemento de grade",
  orcamento_parado: "Orçamento parado",
  receita_vencendo: "Receita vencendo",
  produto_vencendo: "Produto vencendo",
  limite_credito_disponivel: "Crédito disponível",
  whitespace_seguro: "Espaço de carteira",
  risco_nao_renovacao: "Risco de renovação",
  sinal_praca_ai: "Intenção em alta",
  potencial_carteira: "Potencial de carteira",
  sinal_expansao: "Expansão",
  risco_competitivo: "Risco competitivo",
  indicacao: "Indicação",
};

const PROTECTED_TYPES = new Set([
  "renovacao", "renovacao_seguro", "manutencao", "risco_nao_renovacao",
  "receita_vencendo", "produto_vencendo", "risco_competitivo",
]);
const RECOVERED_TYPES = new Set([
  "reativacao", "reativacao_sazonal", "orcamento_parado", "follow_up",
]);

function revenueClass(tipo: string | null | undefined) {
  if (PROTECTED_TYPES.has(tipo ?? "")) return "Receita protegida";
  if (RECOVERED_TYPES.has(tipo ?? "")) return "Receita recuperada";
  return "Receita nova";
}

function scoreOf(op: any) {
  const n = Number(op?.scoreOportunidade ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function confidenceOf(op: any) {
  const engineConfidence = Number(op?.explanation?.inference?.confidenceScore ?? op?.justificativa?.confidenceScore);
  if (Number.isFinite(engineConfidence) && engineConfidence >= 0) return Math.min(100, engineConfidence);
  let score = 35;
  if (op?.valorEstimado) score += 15;
  if (op?.propostaId || op?.dealId) score += 20;
  if (op?.justificativa && Object.keys(op.justificativa).length >= 2) score += 15;
  if (scoreOf(op) >= 75) score += 10;
  if (op?.cliente?.intentScore >= 50) score += 5;
  return Math.min(100, score);
}

function nextBestAction(op: any) {
  const tipo = op?.tipo ?? "";
  if (tipo === "orcamento_parado") return "Retomar a proposta com contexto e prazo claro";
  if (tipo === "renovacao" || tipo === "renovacao_seguro") return "Antecipar a renovação antes da janela crítica";
  if (tipo === "reativacao" || tipo === "reativacao_sazonal") return "Reativar o relacionamento com uma abordagem personalizada";
  if (tipo === "cross_sell" || tipo === "grade_incompleta") return "Oferecer o complemento mais aderente ao histórico";
  if (tipo === "upgrade") return "Apresentar a evolução de solução com ganho concreto";
  if (tipo === "sequencia_produto" || tipo === "recompra") return "Abordar no momento provável de nova compra";
  if (tipo === "manutencao") return "Antecipar a manutenção e reduzir risco de parada";
  if (tipo === "limite_credito_disponivel") return "Usar a capacidade disponível em uma oferta adequada";
  if (tipo === "potencial_carteira") return "Investigar onde aumentar participação na carteira sem forçar oferta";
  if (tipo === "sinal_expansao") return "Validar a mudança e mapear a nova demanda antes do concorrente";
  if (tipo === "risco_competitivo") return "Proteger o relacionamento e entender o motivo da possível migração";
  if (tipo === "indicacao") return "Pedir indicação no momento adequado, sem pressionar nova compra";
  if (tipo === "sinal_praca_ai") return "Agir enquanto a intenção ainda está recente";
  return "Validar o contexto e escolher a melhor abordagem comercial";
}

function priorityLabel(score: number) {
  if (score >= 85) return "Crítica";
  if (score >= 70) return "Alta";
  if (score >= 50) return "Média";
  return "Monitorar";
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    pendente: "Aguardando confirmação",
    pendente_aprovacao: "Aguardando aprovação",
    aprovado: "Aprovada",
    enviado: "Contato enviado",
    respondeu: "Respondeu",
    em_negociacao: "Em negociação",
    converteu: "Convertida",
    ignorado: "Ignorada",
    adiado: "Adiada",
    aguardando_etapa: "Aguardando etapa",
    pendente_revisao_bot: "Revisão humana",
  };
  return labels[status ?? ""] ?? status ?? "—";
}

function OpportunityCard({ op, onConfirm, onIgnore, busy }: {
  op: any;
  onConfirm: (id: string) => void;
  onIgnore: (id: string) => void;
  busy: boolean;
}) {
  const score = scoreOf(op);
  const confidence = confidenceOf(op);
  const confirmable = op.status === "pendente";
  const legacyApproval = op.status === "pendente_aprovacao";
  const recommendedWindow = Number(op?.explanation?.inference?.recommendedWindowDays ?? 0);
  const optimalHour = Number(op?.explanation?.inference?.optimalContactHour);
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{TYPE_LABELS[op.tipo] ?? op.tipo ?? "Oportunidade"}</Badge>
            <Badge variant="secondary">{revenueClass(op.tipo)}</Badge>
            <Badge variant="outline">{priorityLabel(score)} · {Math.round(score)}</Badge>
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {op.clienteId ? (
                <Link href={`/leads/${op.clienteId}`} className="inline-flex max-w-full items-center gap-1 font-semibold hover:underline">
                  <span className="truncate">{op.clienteNome ?? "Cliente"}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </Link>
              ) : <p className="font-semibold">Cliente</p>}
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{op.descricao ?? op.percepcao ?? "Oportunidade identificada pelo Revenue Scout."}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Potencial</p>
              <p className="font-bold">{op.valorEstimado ? money(op.valorEstimado) : "—"}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Por que apareceu</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">{op.percepcao ?? op.justificativa?.sinal_observado ?? "Sinal encontrado no histórico e contexto do cliente."}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Próxima melhor ação</p>
              <p className="mt-1 text-xs leading-relaxed">{nextBestAction(op)}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Confiança: <strong className="text-foreground">{Math.round(confidence)}%</strong></span>
            <span>Status: <strong className="text-foreground">{statusLabel(op.status)}</strong></span>
            {recommendedWindow > 0 && <span>Janela: <strong className="text-foreground">até {recommendedWindow} dia(s)</strong></span>}
            {Number.isFinite(optimalHour) && <span>Melhor horário: <strong className="text-foreground">{String(optimalHour).padStart(2, "0")}:00</strong></span>}
            {op.responsavelNome && <span>Responsável: <strong className="text-foreground">{op.responsavelNome}</strong></span>}
          </div>
        </div>
      </div>

      {confirmable && (
        <div className="mt-4 flex gap-2 border-t pt-3">
          <Button className="flex-1" size="sm" disabled={busy} onClick={() => onConfirm(op.id)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirmar
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onIgnore(op.id)}>
            <X className="mr-1.5 h-4 w-4" /> Ignorar
          </Button>
        </div>
      )}
      {legacyApproval && (
        <div className="mt-4 border-t pt-3">
          <Link href="/scout/oportunidades"><Button className="w-full" variant="outline" size="sm">Revisar aprovação especializada <ArrowRight className="ml-1.5 h-4 w-4" /></Button></Link>
        </div>
      )}
    </Card>
  );
}

export default function RevenueDashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("radar");

  const { data: dash, refetch: refetchDash } = useQuery<any>({
    queryKey: ["scout-dashboard", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/scout/dashboard`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: opportunities = [], isLoading: loadingOps, refetch: refetchOps } = useQuery<any[]>({
    queryKey: ["scout-oportunidades", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/scout/oportunidades`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery<any[]>({
    queryKey: ["scout-regras", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/scout/regras`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const runScout = useMutation({
    mutationFn: () => fetch(`/api/tenants/${tenantId}/scout/run`, { method: "POST", headers: authHeaders() }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Falha ao executar análise");
      return body;
    }),
    onSuccess: (data) => {
      void refetchDash();
      void refetchOps();
      toast({ title: "Análise concluída", description: `${data.clientesAnalisados ?? 0} clientes analisados · ${data.oportunidadesGeradas ?? 0} novas oportunidades.` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/confirmar`, { method: "POST", headers: authHeaders(), body: "{}" }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível confirmar");
      return body;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scout-oportunidades", tenantId] });
      qc.invalidateQueries({ queryKey: ["scout-dashboard", tenantId] });
      toast({ title: "Oportunidade confirmada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const ignore = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/rejeitar`, { method: "POST", headers: authHeaders() }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível ignorar");
      return body;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scout-oportunidades", tenantId] });
      qc.invalidateQueries({ queryKey: ["scout-dashboard", tenantId] });
      toast({ title: "Oportunidade ignorada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleRule = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/regras/${id}/toggle`, { method: "PATCH", headers: authHeaders() }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scout-regras", tenantId] }),
  });

  const ops = Array.isArray(opportunities) ? opportunities : [];
  const rulesArr = Array.isArray(rules) ? rules : [];

  const openOps = useMemo(() => ops.filter((o) => !["converteu", "ignorado"].includes(o.status)), [ops]);
  const urgentOps = useMemo(() => openOps.filter((o) => scoreOf(o) >= 80).sort((a, b) => scoreOf(b) - scoreOf(a)), [openOps]);
  const pendingApproval = useMemo(() => openOps.filter((o) => ["pendente", "pendente_aprovacao"].includes(o.status)), [openOps]);
  const actionOps = useMemo(() => openOps.filter((o) => ["aprovado", "enviado", "respondeu", "em_negociacao", "adiado", "aguardando_etapa", "pendente_revisao_bot"].includes(o.status)), [openOps]);
  const converted = useMemo(() => ops.filter((o) => o.status === "converteu" || o.converteu === true), [ops]);
  const potentialOpen = openOps.reduce((sum, o) => sum + Number(o.valorEstimado ?? 0), 0);
  const convertedValue = converted.reduce((sum, o) => sum + Number(o.valorEstimado ?? 0), 0);

  const byClient = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; value: number; best: number }>();
    for (const op of openOps) {
      const id = op.clienteId ?? "sem-cliente";
      const current = map.get(id) ?? { id, name: op.clienteNome ?? "Cliente", count: 0, value: 0, best: 0 };
      current.count += 1;
      current.value += Number(op.valorEstimado ?? 0);
      current.best = Math.max(current.best, scoreOf(op));
      map.set(id, current);
    }
    return Array.from(map.values()).sort((a, b) => b.best - a.best || b.value - a.value).slice(0, 6);
  }, [openOps]);

  const classes = useMemo(() => {
    const values = { nova: 0, recuperada: 0, protegida: 0 };
    for (const op of openOps) {
      const c = revenueClass(op.tipo);
      if (c === "Receita protegida") values.protegida += Number(op.valorEstimado ?? 0);
      else if (c === "Receita recuperada") values.recuperada += Number(op.valorEstimado ?? 0);
      else values.nova += Number(op.valorEstimado ?? 0);
    }
    return values;
  }, [openOps]);

  const activeRules = rulesArr.filter((r) => r.ativo !== false).length;
  const busy = confirm.isPending || ignore.isPending;

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Revenue Scout</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Encontra receita nova, recuperável e em risco em toda a carteira — e mostra o que fazer agora.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5"><Bot className="h-3.5 w-3.5" /> Análise automática</Badge>
          {dash?.verticalProfile?.label && <Badge variant="secondary">{dash.verticalProfile.label}</Badge>}
          <Button variant="outline" size="sm" onClick={() => { void refetchDash(); void refetchOps(); }}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card className="p-3 md:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Potencial em aberto</p>{loadingOps ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1 text-xl font-bold">{money(potentialOpen)}</p>}</Card>
        <Card className="p-3 md:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Oportunidades</p>{loadingOps ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-xl font-bold">{openOps.length}</p>}</Card>
        <Card className="p-3 md:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Urgentes</p>{loadingOps ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-xl font-bold">{urgentOps.length}</p>}</Card>
        <Card className="p-3 md:p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Aguardando você</p>{loadingOps ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-xl font-bold">{pendingApproval.length}</p>}</Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1">
          <TabsTrigger value="radar" className="shrink-0">Radar</TabsTrigger>
          <TabsTrigger value="oportunidades" className="shrink-0">Oportunidades</TabsTrigger>
          <TabsTrigger value="acoes" className="shrink-0">Ações</TabsTrigger>
          <TabsTrigger value="resultados" className="shrink-0">Resultados</TabsTrigger>
          <TabsTrigger value="config" className="shrink-0">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="radar" className="mt-4 space-y-4">
          <Card className="p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><p className="font-semibold">Leitura executiva da carteira</p></div><p className="mt-1 text-sm text-muted-foreground">{openOps.length === 0 ? "Nenhuma oportunidade aberta neste momento. O Scout continua analisando a carteira automaticamente." : `${openOps.length} oportunidade(s) abertas somam ${money(potentialOpen)} de potencial. ${urgentOps.length} exigem atenção prioritária.`}</p></div>
              <div className="grid grid-cols-3 gap-2 text-center md:min-w-[360px]"><div className="rounded-xl border p-2"><p className="text-[10px] text-muted-foreground">Nova</p><p className="text-sm font-bold">{money(classes.nova)}</p></div><div className="rounded-xl border p-2"><p className="text-[10px] text-muted-foreground">Recuperar</p><p className="text-sm font-bold">{money(classes.recuperada)}</p></div><div className="rounded-xl border p-2"><p className="text-[10px] text-muted-foreground">Proteger</p><p className="text-sm font-bold">{money(classes.protegida)}</p></div></div>
            </div>
          </Card>

          {pendingApproval.length > 0 && <Card className="border-primary/20 bg-primary/[0.025] p-4 md:p-5"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Próxima ação recomendada</p><p className="text-sm text-muted-foreground">Revisar {pendingApproval.length} oportunidade(s) aguardando confirmação.</p></div><Button size="sm" onClick={() => setTab("oportunidades")}>Revisar <ArrowRight className="ml-1 h-4 w-4" /></Button></div></Card>}

          <div>
            <div className="mb-2 flex items-center justify-between"><div><p className="font-semibold">Prioridades de agora</p><p className="text-xs text-muted-foreground">Maior combinação de urgência, valor e contexto.</p></div><Button variant="ghost" size="sm" onClick={() => setTab("oportunidades")}>Ver todas</Button></div>
            <div className="grid gap-3 lg:grid-cols-2">{loadingOps ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-52 w-full" />) : (urgentOps.length ? urgentOps : openOps).slice(0, 4).map((op) => <OpportunityCard key={op.id} op={op} onConfirm={(id) => confirm.mutate(id)} onIgnore={(id) => ignore.mutate(id)} busy={busy} />)}</div>
          </div>

          {byClient.length > 0 && <Card className="p-4 md:p-5"><div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4" /><p className="font-semibold">Mapa de oportunidades por cliente</p></div><div className="divide-y">{byClient.map((client) => <div key={client.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0">{client.id !== "sem-cliente" ? <Link href={`/leads/${client.id}`} className="font-medium hover:underline">{client.name}</Link> : <span className="font-medium">{client.name}</span>}<p className="text-xs text-muted-foreground">{client.count} oportunidade(s) · melhor prioridade {Math.round(client.best)}/100</p></div><p className="shrink-0 font-semibold">{client.value > 0 ? money(client.value) : "—"}</p></div>)}</div></Card>}
        </TabsContent>

        <TabsContent value="oportunidades" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Todas as oportunidades</p><p className="text-xs text-muted-foreground">Um cliente pode ter várias oportunidades ao mesmo tempo; o Scout mantém cada hipótese separada e priorizada.</p></div><Badge variant="outline">{openOps.length} abertas</Badge></div>
          {loadingOps ? [1,2,3].map((i) => <Skeleton key={i} className="h-52 w-full" />) : openOps.length === 0 ? <Card className="p-8 text-center"><Radar className="mx-auto h-8 w-8 opacity-30" /><p className="mt-2 text-sm text-muted-foreground">Nenhuma oportunidade aberta.</p></Card> : [...openOps].sort((a, b) => scoreOf(b) - scoreOf(a)).map((op) => <OpportunityCard key={op.id} op={op} onConfirm={(id) => confirm.mutate(id)} onIgnore={(id) => ignore.mutate(id)} busy={busy} />)}
        </TabsContent>

        <TabsContent value="acoes" className="mt-4 space-y-4">
          <Card className="p-4 md:p-5"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-semibold">Fila operacional</p><p className="text-sm text-muted-foreground">Ações aprovadas, contatos enviados, respostas, negociações e itens que precisam de intervenção humana.</p></div></div></Card>
          {actionOps.length === 0 ? <Card className="p-8 text-center"><ListChecks className="mx-auto h-8 w-8 opacity-30" /><p className="mt-2 text-sm text-muted-foreground">Nenhuma ação em execução agora.</p></Card> : actionOps.map((op) => <Card key={op.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold truncate">{op.clienteNome ?? "Cliente"}</p><p className="mt-1 text-sm text-muted-foreground line-clamp-2">{nextBestAction(op)}</p></div><Badge variant="outline" className="shrink-0">{statusLabel(op.status)}</Badge></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{TYPE_LABELS[op.tipo] ?? op.tipo}</span>{op.canal && <span>· {op.canal}</span>}{op.valorEstimado && <span>· {money(op.valorEstimado)}</span>}</div></Card>)}
          <div className="text-center"><Link href="/scout/pipeline"><Button variant="outline" size="sm">Ver fluxo operacional avançado</Button></Link></div>
        </TabsContent>

        <TabsContent value="resultados" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Card className="p-4"><CircleDollarSign className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Receita convertida</p><p className="mt-1 text-lg font-bold">{money(convertedValue || dash?.receitaGerada)}</p></Card><Card className="p-4"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Convertidas</p><p className="mt-1 text-lg font-bold">{converted.length || dash?.convertidas || 0}</p></Card><Card className="p-4"><Gauge className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Conversão</p><p className="mt-1 text-lg font-bold">{Number(dash?.taxaConversao ?? 0).toFixed(1)}%</p></Card><Card className="p-4"><Target className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Oportunidades totais</p><p className="mt-1 text-lg font-bold">{dash?.totalOportunidades ?? ops.length}</p></Card></div>
          <Card className="p-4 md:p-5"><p className="font-semibold">O que o Scout está aprendendo</p><p className="mt-1 text-sm text-muted-foreground">Cada resultado confirmado alimenta o histórico para melhorar prioridade, timing e próxima ação. O objetivo é medir não só volume de oportunidades, mas receita realmente recuperada, protegida e expandida.</p><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border p-3"><WalletCards className="h-4 w-4" /><p className="mt-2 text-xs text-muted-foreground">Receita nova em aberto</p><p className="font-bold">{money(classes.nova)}</p></div><div className="rounded-xl border p-3"><RefreshCw className="h-4 w-4" /><p className="mt-2 text-xs text-muted-foreground">Receita para recuperar</p><p className="font-bold">{money(classes.recuperada)}</p></div><div className="rounded-xl border p-3"><ShieldCheck className="h-4 w-4" /><p className="mt-2 text-xs text-muted-foreground">Receita para proteger</p><p className="font-bold">{money(classes.protegida)}</p></div></div></Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          <Card className="p-4 md:p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><Settings2 className="h-5 w-5" /><p className="font-semibold">Estratégias do Scout</p></div><p className="mt-1 text-sm text-muted-foreground">O motor mantém a complexidade técnica em segundo plano. Aqui você só decide quais estratégias ficam ativas.</p></div><Badge variant="outline">{activeRules} de {rulesArr.length} ativas</Badge></div></Card>
          {loadingRules ? [1,2,3].map((i) => <Skeleton key={i} className="h-24 w-full" />) : <div className="grid gap-2 md:grid-cols-2">{rulesArr.map((rule) => <Card key={rule.id} className="p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-semibold truncate">{TYPE_LABELS[rule.tipo] ?? rule.nome}</p><p className="mt-1 text-xs text-muted-foreground line-clamp-2">{rule.nome}</p></div><Button variant={rule.ativo !== false ? "secondary" : "outline"} size="sm" disabled={toggleRule.isPending} onClick={() => toggleRule.mutate(rule.id)}>{rule.ativo !== false ? "Ativa" : "Inativa"}</Button></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{rule.totalDisparos ?? 0} achados</span><span>·</span><span>{rule.acao?.requiresApproval !== false ? "Aprovação humana" : "Execução automática"}</span></div></Card>)}</div>}
          <Card className="p-4 md:p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">Análise</p><p className="text-sm text-muted-foreground">O Scout já roda automaticamente. Use a execução manual apenas quando quiser reavaliar a carteira imediatamente.</p></div><Button variant="outline" disabled={runScout.isPending} onClick={() => runScout.mutate()}>{runScout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Executar agora</Button></div></Card>
          <div className="flex flex-wrap gap-2"><Link href="/scout/regras"><Button variant="ghost" size="sm"><Layers3 className="mr-1.5 h-4 w-4" /> Configuração avançada de regras</Button></Link><Link href="/scout/oportunidades"><Button variant="ghost" size="sm"><ListChecks className="mr-1.5 h-4 w-4" /> Visão técnica de oportunidades</Button></Link></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
