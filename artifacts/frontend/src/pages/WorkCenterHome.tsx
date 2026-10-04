import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getListActivitiesQueryKey,
  getListDealsQueryKey,
  getListPipelineStagesQueryKey,
  getListTenantLeadsQueryKey,
  getListTenantUsersQueryKey,
  useListDeals,
  useListPipelineStages,
  useListTenantLeads,
  useListTenantUsers,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BriefcaseBusiness, CalendarClock, ChevronRight, CircleAlert, Clock3, Loader2, Search, UserRound, UsersRound } from "lucide-react";

const TERMINAL_STAGE_KEYS = new Set(["ganho", "perdido", "entregue", "concluido", "cancelado"]);
const TERMINAL_STAGE_LABELS = new Set([
  "ganho", "ganha", "perdido", "perdida", "entregue", "concluido", "concluida",
  "cancelado", "cancelada", "fechado", "fechada",
]);
const FALLBACK_LABELS: Record<string, string> = {
  novo: "Novo", em_aquecimento: "Em aquecimento", qualificado: "Qualificado",
  proposta: "Proposta", negociacao: "Negociação", conferencia_estoque: "Conferência de estoque",
  ganho: "Ganho", em_execucao: "Em execução", entregue: "Entregue", perdido: "Perdido",
};

type QueueItem = {
  key: string;
  leadId?: string;
  dataIssue?: boolean;
  dealId?: string;
  leadName: string;
  company?: string | null;
  dealTitle: string;
  stage: string;
  ownerId?: string | null;
  nextActivity?: { titulo: string; dataVencimento?: string | null; responsavelId?: string | null };
  updatedAt?: string | null;
};

type AttentionFilter = "todos" | "vencidos" | "sem_responsavel" | "incompletos";

function normalizeStageLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function sameText(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.trim().localeCompare(b.trim(), "pt-BR", { sensitivity: "base" }) === 0);
}

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Prazo inválido";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function WorkCenterHome() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";
  const enabled = Boolean(tenantId && token);
  const request = { headers: { Authorization: "Bearer " + token } };
  const { data: leads = [], isLoading: loadingLeads } = useListTenantLeads(tenantId, undefined, { request, query: { enabled, queryKey: getListTenantLeadsQueryKey(tenantId) } });
  const { data: deals = [], isLoading: loadingDeals } = useListDeals(tenantId, undefined, { request, query: { enabled, queryKey: getListDealsQueryKey(tenantId) } });
  const { data: activities = [], isLoading: loadingActivities } = useQuery<any[]>({
    queryKey: getListActivitiesQueryKey(tenantId),
    enabled,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/activities`, {
        headers: request.headers,
      });
      if (!response.ok) {
        throw new Error(`Falha ao carregar atividades (${response.status})`);
      }
      const body = await response.json();
      return Array.isArray(body) ? body : [];
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const { data: users = [] } = useListTenantUsers(tenantId, { request, query: { enabled, queryKey: getListTenantUsersQueryKey(tenantId) } });
  const { data: stages = [] } = useListPipelineStages(tenantId, { request, query: { enabled, queryKey: getListPipelineStagesQueryKey(tenantId) } });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [stageFilter, setStageFilter] = useState("ativos");
  const [ownerFilter, setOwnerFilter] = useState("todos");
  const initialParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialAttention = initialParams?.get("attention");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>(
    initialAttention === "vencidos" || initialAttention === "sem_responsavel" || initialAttention === "incompletos"
      ? initialAttention
      : "todos",
  );
  const autoOpenSingle = initialParams?.get("autoOpen") === "single";
  const autoOpenHandled = useRef(false);

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const userById = useMemo(() => new Map(users.map((person) => [person.id, person.name || person.email || person.id])), [users]);
  const stageLabel = useMemo(() => new Map(stages.map((stage) => [stage.key, stage.label])), [stages]);
  const terminalStageKeys = useMemo(() => {
    const terminal = new Set(TERMINAL_STAGE_KEYS);
    for (const stage of stages) {
      if (TERMINAL_STAGE_LABELS.has(normalizeStageLabel(stage.label))) terminal.add(stage.key);
    }
    return terminal;
  }, [stages]);

  const { pendingByDeal, pendingByLead } = useMemo(() => {
    const byDeal = new Map<string, typeof activities>();
    const byLead = new Map<string, typeof activities>();
    for (const activity of activities) {
      if (!["pendente", "planejado"].includes(activity.status)) continue;
      if (activity.dealId) {
        const dealList = byDeal.get(activity.dealId) ?? [];
        dealList.push(activity);
        byDeal.set(activity.dealId, dealList);
      }
      if (activity.leadId) {
        const leadList = byLead.get(activity.leadId) ?? [];
        leadList.push(activity);
        byLead.set(activity.leadId, leadList);
      }
    }
    const sortPending = (list: typeof activities) =>
      list.sort((a, b) => new Date(a.dataVencimento ?? "9999-12-31").getTime() - new Date(b.dataVencimento ?? "9999-12-31").getTime());
    for (const list of byDeal.values()) sortPending(list);
    for (const list of byLead.values()) sortPending(list);
    return { pendingByDeal: byDeal, pendingByLead: byLead };
  }, [activities]);

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    const leadsWithDeal = new Set<string>();
    for (const deal of deals) {
      const lead = deal.leadId ? leadById.get(deal.leadId) : undefined;
      if (deal.leadId && lead) leadsWithDeal.add(deal.leadId);
      items.push({
        key: deal.id,
        leadId: lead?.id,
        dealId: deal.id,
        leadName: lead?.nome ?? deal.titulo ?? "Negócio sem identificação",
        company: lead?.empresa,
        dealTitle: deal.titulo,
        stage: deal.etapa,
        ownerId: deal.assignedTo ?? lead?.assignedTo,
        nextActivity: pendingByDeal.get(deal.id)?.[0] ?? (lead?.id ? pendingByLead.get(lead.id)?.[0] : undefined),
        updatedAt: deal.updatedAt,
        dataIssue: !lead,
      });
    }
    for (const lead of leads) {
      if (leadsWithDeal.has(lead.id)) continue;
      items.push({
        key: "lead-" + lead.id,
        leadId: lead.id,
        leadName: lead.nome,
        company: lead.empresa,
        dealTitle: "Atendimento ainda não iniciado",
        stage: "sem_negocio",
        ownerId: lead.assignedTo,
        nextActivity: pendingByLead.get(lead.id)?.[0],
      });
    }

    const now = Date.now();
    return items.sort((a, b) => {
      const aDue = a.nextActivity?.dataVencimento ? new Date(a.nextActivity.dataVencimento).getTime() : null;
      const bDue = b.nextActivity?.dataVencimento ? new Date(b.nextActivity.dataVencimento).getTime() : null;
      const aPriority = aDue != null && aDue < now ? 0 : (!a.nextActivity || aDue == null ? 1 : 2);
      const bPriority = bDue != null && bDue < now ? 0 : (!b.nextActivity || bDue == null ? 1 : 2);
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (aDue != null && bDue != null && aDue !== bDue) return aDue - bDue;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    });
  }, [deals, leadById, leads, pendingByDeal, pendingByLead]);

  const now = Date.now();
  const activeQueue = queue.filter((item) => !terminalStageKeys.has(item.stage));
  const overdue = activeQueue.filter((item) => item.nextActivity?.dataVencimento && new Date(item.nextActivity.dataVencimento).getTime() < now).length;
  const unassigned = activeQueue.filter((item) => !item.ownerId).length;
  const mine = activeQueue.filter((item) => item.ownerId === user?.id).length;
  const missingNextActivity = activeQueue.filter((item) => !item.nextActivity).length;
  const missingDeadline = activeQueue.filter((item) => item.nextActivity && !item.nextActivity.dataVencimento).length;
  const incompleteNextStep = missingNextActivity + missingDeadline;

  const visibleQueue = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase("pt-BR");
    return queue.filter((item) => {
      const isTerminal = terminalStageKeys.has(item.stage);
      const isOverdue = Boolean(item.nextActivity?.dataVencimento && new Date(item.nextActivity.dataVencimento).getTime() < now);
      const isIncomplete = !item.nextActivity || !item.nextActivity.dataVencimento;

      if (stageFilter === "ativos" && isTerminal) return false;
      if (stageFilter !== "todos" && stageFilter !== "ativos" && item.stage !== stageFilter) return false;
      if (ownerFilter === "meus" && item.ownerId !== user?.id) return false;
      if (ownerFilter === "sem_responsavel" && item.ownerId) return false;
      if (ownerFilter !== "todos" && ownerFilter !== "meus" && ownerFilter !== "sem_responsavel" && item.ownerId !== ownerFilter) return false;
      if (attentionFilter === "vencidos" && !isOverdue) return false;
      if (attentionFilter === "sem_responsavel" && item.ownerId) return false;
      if (attentionFilter === "incompletos" && !isIncomplete) return false;

      return !needle || [item.leadName, item.company, item.dealTitle].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [attentionFilter, deferredSearch, now, ownerFilter, queue, stageFilter, terminalStageKeys, user?.id]);

  const loading = loadingLeads || loadingDeals || loadingActivities;

  function selectMetric(metric: "active" | "overdue" | "unassigned" | "incomplete" | "mine") {
    setStageFilter("ativos");
    setSearch("");
    if (metric === "active") {
      setOwnerFilter("todos");
      setAttentionFilter("todos");
      return;
    }
    if (metric === "overdue") {
      setOwnerFilter("todos");
      setAttentionFilter("vencidos");
      return;
    }
    if (metric === "unassigned") {
      setOwnerFilter("todos");
      setAttentionFilter("sem_responsavel");
      return;
    }
    if (metric === "incomplete") {
      setOwnerFilter("todos");
      setAttentionFilter("incompletos");
      return;
    }
    setOwnerFilter("meus");
    setAttentionFilter("todos");
  }

  function openItem(item: QueueItem) {
    if (!item.leadId) {
      navigate("/deals?dealId=" + item.dealId + "&cadastro=incompleto");
      return;
    }
    const query = item.dealId ? "?dealId=" + item.dealId + "&from=work-center" : "?from=work-center";
    navigate("/trabalho/" + item.leadId + query);
  }

  useEffect(() => {
    if (!autoOpenSingle || loading || autoOpenHandled.current) return;
    if (attentionFilter !== "vencidos") return;
    autoOpenHandled.current = true;

    if (visibleQueue.length === 1) {
      openItem(visibleQueue[0]);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.delete("autoOpen");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
  }, [attentionFilter, autoOpenSingle, loading, visibleQueue]);

  return <div className="vendor-product-page">
    <div className="vendor-product-hero">
      <div>
        <Badge variant="outline" className="vendor-product-kicker">Estação operacional</Badge>
        <h1 className="vendor-product-title">Central de Trabalho</h1>
        <p className="vendor-product-subtitle">Veja quem atender, o que fazer e até quando — sem procurar trabalho em várias telas.</p>
      </div>
    </div>

    <div className="vendor-kpi-grid sm:grid-cols-2 xl:grid-cols-5 mb-5">
      <Metric icon={<BriefcaseBusiness className="h-5 w-5" />} label="Em atendimento" value={activeQueue.length} detail="Itens ativos agora" active={stageFilter === "ativos" && ownerFilter === "todos" && attentionFilter === "todos"} onClick={() => selectMetric("active")} />
      <Metric icon={<CircleAlert className="h-5 w-5 text-destructive" />} label="Atividades vencidas" value={overdue} detail="Ação imediata" active={attentionFilter === "vencidos"} onClick={() => selectMetric("overdue")} />
      <Metric icon={<UsersRound className="h-5 w-5" />} label="Sem responsável" value={unassigned} detail="Precisa de atribuição" active={attentionFilter === "sem_responsavel"} onClick={() => selectMetric("unassigned")} />
      <Metric icon={<CalendarClock className="h-5 w-5" />} label="Próximo passo incompleto" value={incompleteNextStep} detail={`${missingNextActivity} sem ação · ${missingDeadline} sem prazo`} active={attentionFilter === "incompletos"} onClick={() => selectMetric("incomplete")} />
      <Metric icon={<UserRound className="h-5 w-5" />} label="Meus atendimentos" value={mine} detail="Atribuídos a mim" active={ownerFilter === "meus"} onClick={() => selectMetric("mine")} />
    </div>

    <Card className="vendor-work-surface">
      <CardHeader className="gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <CardTitle>Fila de trabalho</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{visibleQueue.length} {visibleQueue.length === 1 ? "item encontrado" : "itens encontrados"}</p>
        </div>
        <div className="vendor-filter-strip sm:grid-cols-2 xl:w-[900px] xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Buscar atendimento" className="pl-9" placeholder="Buscar lead, empresa ou negócio" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger aria-label="Filtrar por etapa"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Etapas ativas</SelectItem>
              <SelectItem value="todos">Todas as etapas</SelectItem>
              <SelectItem value="sem_negocio">Sem negócio</SelectItem>
              {stages.map((stage) => <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value="meus">Meus atendimentos</SelectItem>
              <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
              {users.map((person) => <SelectItem key={person.id} value={person.id}>{person.name || person.email || person.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={attentionFilter} onValueChange={(value) => setAttentionFilter(value as AttentionFilter)}>
            <SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              <SelectItem value="vencidos">Atividades vencidas</SelectItem>
              <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
              <SelectItem value="incompletos">Próximo passo incompleto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Carregando fila" /></div> :
        visibleQueue.length === 0 ? <div className="vendor-empty-state min-h-56 p-10 text-center text-muted-foreground">Nenhum item corresponde aos filtros atuais.</div> :
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{visibleQueue.map((item) => {
          const isTerminal = terminalStageKeys.has(item.stage);
          const isOverdue = Boolean(item.nextActivity?.dataVencimento && new Date(item.nextActivity.dataVencimento).getTime() < now);
          const ownerName = userById.get(item.ownerId ?? "");
          const subtitle = item.company && !sameText(item.company, item.leadName)
            ? item.company
            : !sameText(item.dealTitle, item.leadName)
              ? item.dealTitle
              : item.dealId ? "Negócio comercial" : "Lead sem negócio";
          const showDealContext = Boolean(item.dealId && !sameText(item.dealTitle, item.leadName) && !sameText(item.dealTitle, subtitle));

          return <button
            key={item.key}
            type="button"
            onClick={() => openItem(item)}
            className="vendor-work-item group p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{item.leadName}</h2>
                <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
                {showDealContext ? <p className="mt-1 truncate text-xs text-muted-foreground">Negócio: {item.dealTitle}</p> : null}
                {item.dataIssue ? <Badge variant="outline" className="mt-2 text-amber-700">Cadastro incompleto</Badge> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={isTerminal ? "outline" : "secondary"}>{stageLabel.get(item.stage) ?? FALLBACK_LABELS[item.stage] ?? "Sem negócio"}</Badge>
                {isOverdue && !isTerminal ? <Badge variant="destructive">Vencido</Badge> : null}
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p className={"flex items-center gap-2 " + (!ownerName ? "font-medium text-amber-700" : "")}>
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <span>{ownerName ?? "Responsável não definido"}</span>
              </p>
              <p className={"flex items-center gap-2 " + (!item.nextActivity ? "font-medium text-amber-700" : "")}>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{item.nextActivity?.titulo ?? "Próxima ação não definida"}</span>
              </p>
              <p className={"flex items-center gap-2 " + (isOverdue ? "font-medium text-destructive" : !item.nextActivity?.dataVencimento ? "font-medium text-amber-700" : "text-muted-foreground")}>
                <Clock3 className="h-4 w-4" />
                <span>{item.nextActivity?.dataVencimento ? `${isOverdue ? "Vencida" : "Prazo"} · ${formatDeadline(item.nextActivity.dataVencimento)}` : "Prazo não definido"}</span>
                <ChevronRight className="ml-auto h-4 w-4 transition group-hover:translate-x-1" />
              </p>
            </div>
          </button>;
        })}</div>}
      </CardContent>
    </Card>
  </div>;
}

function Metric({ icon, label, value, detail, active = false, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return <button type="button" onClick={onClick} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
    <div className="vendor-kpi-card h-full" data-active={active ? "true" : "false"}>
      <div className="flex items-center gap-3 p-4">
        <div className="vendor-kpi-icon">{icon}</div>
        <div className="min-w-0">
          <p className="vendor-kpi-value">{value}</p>
          <p className="vendor-kpi-label">{label}</p>
          {detail ? <p className="vendor-kpi-detail truncate">{detail}</p> : null}
        </div>
      </div>
    </div>
  </button>;
}
