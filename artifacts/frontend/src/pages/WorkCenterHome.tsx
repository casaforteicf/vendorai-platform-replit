import { useDeferredValue, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  getListActivitiesQueryKey,
  getListDealsQueryKey,
  getListPipelineStagesQueryKey,
  getListTenantLeadsQueryKey,
  getListTenantUsersQueryKey,
  useListActivities,
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

const TERMINAL_STAGES = new Set(["ganho", "perdido", "entregue"]);
const FALLBACK_LABELS: Record<string, string> = {
  novo: "Novo", em_aquecimento: "Em aquecimento", qualificado: "Qualificado",
  proposta: "Proposta", negociacao: "Negociação", conferencia_estoque: "Conferência de estoque",
  ganho: "Ganho", em_execucao: "Em execução", entregue: "Entregue", perdido: "Perdido",
};

type QueueItem = {
  key: string;
  leadId: string;
  dealId?: string;
  leadName: string;
  company?: string | null;
  dealTitle: string;
  stage: string;
  ownerId?: string | null;
  nextActivity?: { titulo: string; dataVencimento?: string | null; responsavelId?: string | null };
  updatedAt?: string | null;
};

export default function WorkCenterHome() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";
  const enabled = Boolean(tenantId && token);
  const request = { headers: { Authorization: "Bearer " + token } };
  const { data: leads = [], isLoading: loadingLeads } = useListTenantLeads(tenantId, undefined, { request, query: { enabled, queryKey: getListTenantLeadsQueryKey(tenantId) } });
  const { data: deals = [], isLoading: loadingDeals } = useListDeals(tenantId, undefined, { request, query: { enabled, queryKey: getListDealsQueryKey(tenantId) } });
  const { data: activities = [], isLoading: loadingActivities } = useListActivities(tenantId, undefined, { request, query: { enabled, queryKey: getListActivitiesQueryKey(tenantId) } });
  const { data: users = [] } = useListTenantUsers(tenantId, { request, query: { enabled, queryKey: getListTenantUsersQueryKey(tenantId) } });
  const { data: stages = [] } = useListPipelineStages(tenantId, { request, query: { enabled, queryKey: getListPipelineStagesQueryKey(tenantId) } });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [stageFilter, setStageFilter] = useState("ativos");
  const [ownerFilter, setOwnerFilter] = useState("todos");

  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const userById = useMemo(() => new Map(users.map((person) => [person.id, person.name || person.email || person.id])), [users]);
  const stageLabel = useMemo(() => new Map(stages.map((stage) => [stage.key, stage.label])), [stages]);
  const pendingByDeal = useMemo(() => {
    const grouped = new Map<string, typeof activities>();
    for (const activity of activities) {
      if (activity.status === "concluida" || !activity.dealId) continue;
      const list = grouped.get(activity.dealId) ?? [];
      list.push(activity);
      grouped.set(activity.dealId, list);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => new Date(a.dataVencimento ?? "9999-12-31").getTime() - new Date(b.dataVencimento ?? "9999-12-31").getTime());
    }
    return grouped;
  }, [activities]);

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    const leadsWithDeal = new Set<string>();
    for (const deal of deals) {
      if (!deal.leadId) continue;
      const lead = leadById.get(deal.leadId);
      if (!lead) continue;
      leadsWithDeal.add(deal.leadId);
      items.push({
        key: deal.id, leadId: deal.leadId, dealId: deal.id, leadName: lead.nome,
        company: lead.empresa, dealTitle: deal.titulo, stage: deal.etapa,
        ownerId: deal.assignedTo ?? lead.assignedTo, nextActivity: pendingByDeal.get(deal.id)?.[0],
        updatedAt: deal.updatedAt,
      });
    }
    for (const lead of leads) {
      if (leadsWithDeal.has(lead.id)) continue;
      items.push({
        key: "lead-" + lead.id, leadId: lead.id, leadName: lead.nome, company: lead.empresa,
        dealTitle: "Atendimento ainda não iniciado", stage: "sem_negocio", ownerId: lead.assignedTo,
      });
    }
    return items.sort((a, b) => {
      const aDue = new Date(a.nextActivity?.dataVencimento ?? "9999-12-31").getTime();
      const bDue = new Date(b.nextActivity?.dataVencimento ?? "9999-12-31").getTime();
      if (aDue !== bDue) return aDue - bDue;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    });
  }, [deals, leadById, leads, pendingByDeal]);

  const visibleQueue = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase("pt-BR");
    return queue.filter((item) => {
      if (stageFilter === "ativos" && TERMINAL_STAGES.has(item.stage)) return false;
      if (stageFilter !== "todos" && stageFilter !== "ativos" && item.stage !== stageFilter) return false;
      if (ownerFilter === "meus" && item.ownerId !== user?.id) return false;
      if (ownerFilter === "sem_responsavel" && item.ownerId) return false;
      if (ownerFilter !== "todos" && ownerFilter !== "meus" && ownerFilter !== "sem_responsavel" && item.ownerId !== ownerFilter) return false;
      return !needle || [item.leadName, item.company, item.dealTitle].some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [deferredSearch, ownerFilter, queue, stageFilter, user?.id]);

  const now = Date.now();
  const active = queue.filter((item) => !TERMINAL_STAGES.has(item.stage)).length;
  const overdue = queue.filter((item) => item.nextActivity?.dataVencimento && new Date(item.nextActivity.dataVencimento).getTime() < now).length;
  const unassigned = queue.filter((item) => !item.ownerId && !TERMINAL_STAGES.has(item.stage)).length;
  const mine = queue.filter((item) => item.ownerId === user?.id && !TERMINAL_STAGES.has(item.stage)).length;
  const loading = loadingLeads || loadingDeals || loadingActivities;

  function openItem(item: QueueItem) {
    const query = item.dealId ? "?dealId=" + item.dealId + "&from=work-center" : "?from=work-center";
    navigate("/trabalho/" + item.leadId + query);
  }

  return <div className="space-y-6">
    <div>
      <Badge variant="outline" className="mb-2">Estação operacional</Badge>
      <h1 className="text-3xl font-semibold tracking-tight">Central de Trabalho</h1>
      <p className="mt-1 text-muted-foreground">Atendimentos, responsáveis e próximas ações em um único lugar.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<BriefcaseBusiness className="h-5 w-5" />} label="Em atendimento" value={active} />
      <Metric icon={<CircleAlert className="h-5 w-5 text-destructive" />} label="Atividades vencidas" value={overdue} />
      <Metric icon={<UsersRound className="h-5 w-5" />} label="Sem responsável" value={unassigned} />
      <Metric icon={<UserRound className="h-5 w-5" />} label="Meus atendimentos" value={mine} />
    </div>

    <Card>
      <CardHeader className="gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><CardTitle>Fila de trabalho</CardTitle><p className="mt-1 text-sm text-muted-foreground">{visibleQueue.length} atendimentos encontrados</p></div>
        <div className="grid gap-2 sm:grid-cols-3 xl:w-[760px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar atendimento" className="pl-9" placeholder="Buscar lead, empresa ou negócio" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger aria-label="Filtrar por etapa"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativos">Etapas ativas</SelectItem><SelectItem value="todos">Todas as etapas</SelectItem><SelectItem value="sem_negocio">Sem negócio</SelectItem>{stages.map((stage) => <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>)}</SelectContent></Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}><SelectTrigger aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os responsáveis</SelectItem><SelectItem value="meus">Meus atendimentos</SelectItem><SelectItem value="sem_responsavel">Sem responsável</SelectItem>{users.map((person) => <SelectItem key={person.id} value={person.id}>{person.name || person.email || person.id}</SelectItem>)}</SelectContent></Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Carregando fila" /></div> :
        visibleQueue.length === 0 ? <div className="min-h-56 rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nenhum atendimento corresponde aos filtros.</div> :
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{visibleQueue.map((item) => {
          const isOverdue = Boolean(item.nextActivity?.dataVencimento && new Date(item.nextActivity.dataVencimento).getTime() < now);
          return <button key={item.key} type="button" onClick={() => openItem(item)} className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{item.leadName}</h2><p className="truncate text-sm text-muted-foreground">{item.company || item.dealTitle}</p></div><Badge variant={isOverdue ? "destructive" : "secondary"}>{stageLabel.get(item.stage) ?? FALLBACK_LABELS[item.stage] ?? "Sem negócio"}</Badge></div>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" /><span>{userById.get(item.ownerId ?? "") ?? "Responsável não definido"}</span></p>
              <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /><span className="truncate">{item.nextActivity?.titulo ?? "Próxima atividade não definida"}</span></p>
              <p className={"flex items-center gap-2 " + (isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}><Clock3 className="h-4 w-4" /><span>{item.nextActivity?.dataVencimento ? new Date(item.nextActivity.dataVencimento).toLocaleString("pt-BR") : "Sem prazo definido"}</span><ChevronRight className="ml-auto h-4 w-4 transition group-hover:translate-x-1" /></p>
            </div>
          </button>;
        })}</div>}
      </CardContent>
    </Card>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-muted p-2">{icon}</div><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>;
}