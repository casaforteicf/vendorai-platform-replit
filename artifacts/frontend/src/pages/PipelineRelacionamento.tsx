import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRound, ArrowRight, CalendarDays, Search, X } from "lucide-react";
import { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";
import { AdminDeleteLeadButton } from "@/components/AdminDeleteLeadButton";

type Deal = {
  id: string;
  tenantId: string;
  leadId?: string | null;
  titulo: string;
  etapa: string;
  assignedTo?: string | null;
  aquecimentoTipo?: string | null;
  relationshipStage?: string | null;
  dataFechamentoPrevista?: string | null;
};
type Lead = {
  id: string;
  nome?: string | null;
  empresa?: string | null;
  telefone?: string | null;
  naoLeadTipo?: string | null;
  naoLeadNotas?: string | null;
};
type User = { id: string; name?: string | null; email?: string | null };
type NonLeadClassification = { id: string; label: string; active?: boolean };

const PARTNER_STAGES = [
  ["parceiro_identificado", "Parceiro identificado"],
  ["contato", "Contato"],
  ["qualificacao", "Qualificação"],
  ["proposta_parceria", "Proposta de parceria"],
  ["negociacao", "Negociação"],
  ["parceiro_ativo", "Parceiro ativo"],
  ["inativo", "Inativo"],
] as const;

export default function PipelineRelacionamento() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);
  const tab = pathTab === "parceiros" || params.get("tab") === "parceiros" ? "parceiros" : "aquecimento";
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [resumingDealId, setResumingDealId] = useState<string | null>(null);
  const [warmingTab, setWarmingTab] = useState<"lead" | "cliente" | "nao_lead">("lead");
  const [searchTerm, setSearchTerm] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const jsonHeaders = useMemo(() => ({ ...headers, "Content-Type": "application/json" }), [headers]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Erro ${response.status}`);
    return body as T;
  }

  const dealsQuery = useQuery<Deal[]>({ queryKey: ["relationship-deals", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/deals?includeNaoLead=true`) });
  const leadsQuery = useQuery<Lead[]>({ queryKey: ["relationship-leads", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/leads?incluirNaoLeads=incluir`) });
  const usersQuery = useQuery<User[]>({ queryKey: ["relationship-users", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/users`) });
  const classificationsQuery = useQuery<NonLeadClassification[]>({ queryKey: ["relationship-non-lead-classifications", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/non-lead-classifications`) });

  const leadMap = useMemo(() => new Map((leadsQuery.data ?? []).map((l) => [l.id, l])), [leadsQuery.data]);
  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u])), [usersQuery.data]);

  const patchDeal = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api(`/api/deals/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["relationship-deals", tenantId] }); },
    onError: (error) => toast({ title: "Não foi possível atualizar o card", description: String(error), variant: "destructive" }),
  });

  const resumeCommercial = useMutation({
    mutationFn: async (deal: Deal) => {
      if (!deal.leadId) throw new Error("O processo precisa estar vinculado a um cliente.");
      const created = await api<Deal>("/api/deals", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ tenantId, leadId: deal.leadId, titulo: `${deal.titulo} — Retomada`, etapa: "novo", assignedTo: deal.assignedTo ?? null }),
      });
      await api(`/api/deals/${deal.id}`, {
        method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ relationshipStage: "aquecimento_retomado" }),
      });
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["relationship-deals", tenantId] });
      toast({ title: "Novo ciclo comercial criado", description: "O card de aquecimento foi encerrado no histórico e uma nova oportunidade entrou em Novo." });
      navigate("/deals");
    },
    onError: (error) => toast({ title: "Não foi possível retomar o comercial", description: String(error), variant: "destructive" }),
    onSettled: () => setResumingDealId(null),
  });

  const deals = dealsQuery.data ?? [];
  const warmingDeals = deals.filter((d) => d.etapa === "em_aquecimento" && d.relationshipStage !== "aquecimento_retomado");
  const partnerDeals = deals.filter((d) => d.etapa === "parceiro" && !["parceiro_ativo", "inativo"].includes(d.relationshipStage || "parceiro_identificado"));

  const warmingKind = (deal: Deal): "lead" | "cliente" | "nao_lead" => {
    const lead = deal.leadId ? leadMap.get(deal.leadId) : undefined;
    if (lead?.naoLeadTipo || deal.relationshipStage === "aquecimento_nao_lead") return "nao_lead";
    if (deal.relationshipStage === "aquecimento_cliente" || deal.aquecimentoTipo === "cliente" || deal.aquecimentoTipo === "aquecimento_cliente") return "cliente";
    return "lead";
  };

  const warmingCounts = {
    lead: warmingDeals.filter((deal) => warmingKind(deal) === "lead").length,
    cliente: warmingDeals.filter((deal) => warmingKind(deal) === "cliente").length,
    nao_lead: warmingDeals.filter((deal) => warmingKind(deal) === "nao_lead").length,
  };

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("pt-BR");
  const visibleWarmingDeals = warmingDeals.filter((deal) => {
    if (warmingKind(deal) !== warmingTab) return false;
    if (responsibleFilter !== "all" && (deal.assignedTo || "unassigned") !== responsibleFilter) return false;
    const lead = deal.leadId ? leadMap.get(deal.leadId) : undefined;
    if (warmingTab === "nao_lead" && classificationFilter !== "all" && lead?.naoLeadTipo !== classificationFilter) return false;
    if (!normalizedSearch) return true;
    const haystack = [deal.titulo, lead?.nome, lead?.empresa, lead?.telefone, lead?.naoLeadTipo].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(normalizedSearch);
  });

  const activeWarmingLabel = warmingTab === "cliente" ? "Clientes em aquecimento" : warmingTab === "nao_lead" ? "Não Leads" : "Leads em aquecimento";
  const hasActiveFilters = Boolean(searchTerm.trim()) || responsibleFilter !== "all" || classificationFilter !== "all";

  const nav = (next: string) => {
    if (next === "comercial") navigate("/deals");
    else if (next === "execucao" || next === "suporte") navigate(`/pipeline-operacional/${next}`);
    else navigate(`/pipeline-relacionamento/${next}`);
  };

  function Card({ deal }: { deal: Deal }) {
    const lead = deal.leadId ? leadMap.get(deal.leadId) : undefined;
    const responsible = deal.assignedTo ? userMap.get(deal.assignedTo) : undefined;
    return (
      <article draggable onDragStart={() => setDraggedId(deal.id)} onDragEnd={() => setDraggedId(null)} onClick={() => deal.leadId && navigate(`/leads/${deal.leadId}`)} className={PIPELINE_CARD_CLASS}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{deal.titulo}</p>
          <AdminDeleteLeadButton leadId={deal.leadId} leadName={lead?.nome || lead?.empresa || deal.titulo} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{lead?.nome || lead?.empresa || "Sem cliente vinculado"}</p>
        {responsible && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />{responsible.name || responsible.email}</p>}
        {deal.dataFechamentoPrevista && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" />{new Date(deal.dataFechamentoPrevista).toLocaleDateString("pt-BR")}</p>}
      </article>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Comercial, execução, suporte, aquecimento e parceiros sem misturar processos.</p>
      </div>
      <PipelineNav active={tab} />

      {tab === "aquecimento" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            {(
              [
                ["lead", "Leads em aquecimento"],
                ["cliente", "Clientes em aquecimento"],
                ["nao_lead", "Não Leads"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant={warmingTab === key ? "default" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => {
                  setWarmingTab(key);
                  if (key !== "nao_lead") setClassificationFilter("all");
                }}
              >
                {label}
                <Badge variant={warmingTab === key ? "secondary" : "outline"}>
                  {warmingCounts[key]}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nome, empresa, telefone ou negócio..."
                className="pl-9"
              />
            </div>
            <Select
              value={responsibleFilter}
              onValueChange={setResponsibleFilter}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                <SelectItem value="unassigned">Sem responsável</SelectItem>
                {(usersQuery.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name || item.email || "Usuário"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {warmingTab === "nao_lead" && (
              <Select
                value={classificationFilter}
                onValueChange={setClassificationFilter}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Classificação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as classificações</SelectItem>
                  {(classificationsQuery.data ?? [])
                    .filter((item) => item.active !== false)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setSearchTerm("");
                  setResponsibleFilter("all");
                  setClassificationFilter("all");
                }}
              >
                <X className="h-4 w-4" /> Limpar filtros
              </Button>
            )}
          </div>

          <section
            className={`${PIPELINE_COLUMN_CLASS} min-h-0 w-full flex-1`}
            onDragOver={(event) => {
              if (warmingTab !== "nao_lead") event.preventDefault();
            }}
            onDrop={() => {
              if (
                !draggedId ||
                patchDeal.isPending ||
                warmingTab === "nao_lead"
              )
                return;
              patchDeal.mutate({
                id: draggedId,
                data: {
                  etapa: "em_aquecimento",
                  aquecimentoTipo:
                    warmingTab === "cliente" ? "cliente" : "nao_cliente",
                  relationshipStage:
                    warmingTab === "cliente"
                      ? "aquecimento_cliente"
                      : "aquecimento_lead",
                },
              });
              setDraggedId(null);
            }}
          >
            <div className={PIPELINE_COLUMN_HEADER_CLASS}>
              <div>
                <h2 className="text-sm font-semibold">{activeWarmingLabel}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {warmingTab === "nao_lead"
                    ? "Contatos classificados como Não Lead ficam separados e não ocupam a pipeline comercial."
                    : "Negócios movidos do Comercial para Aquecimento aparecem aqui, preservando responsável e histórico."}
                </p>
              </div>
              <Badge variant="secondary">{visibleWarmingDeals.length}</Badge>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {visibleWarmingDeals.map((deal) => {
                const lead = deal.leadId ? leadMap.get(deal.leadId) : undefined;
                const classification = lead?.naoLeadTipo
                  ? classificationsQuery.data?.find(
                      (item) => item.id === lead.naoLeadTipo,
                    )
                  : undefined;
                return (
                  <div key={deal.id}>
                    <Card deal={deal} />
                    {warmingTab === "nao_lead" ? (
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                        <span>
                          {classification?.label ||
                            lead?.naoLeadTipo ||
                            "Não Lead"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            deal.leadId && navigate(`/leads/${deal.leadId}`)
                          }
                        >
                          Abrir cadastro
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 w-full gap-1 text-xs"
                        disabled={
                          resumingDealId !== null || resumeCommercial.isPending
                        }
                        onClick={() => {
                          if (resumingDealId || resumeCommercial.isPending)
                            return;
                          setResumingDealId(deal.id);
                          resumeCommercial.mutate(deal);
                        }}
                      >
                        {resumingDealId === deal.id
                          ? "Retomando..."
                          : "Retomar comercial"}{" "}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {!visibleWarmingDeals.length && (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado nesta aba com os filtros atuais.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-3">
          {PARTNER_STAGES.map(([key, label]) => {
            const columnDeals = partnerDeals.filter((d) => (d.relationshipStage || "parceiro_identificado") === key);
            return (
              <section key={key} className={PIPELINE_COLUMN_CLASS} onDragOver={(e) => e.preventDefault()} onDrop={() => {
                const dragged = partnerDeals.find((deal) => deal.id === draggedId);
                const currentIndex = PARTNER_STAGES.findIndex(([stage]) => stage === (dragged?.relationshipStage || "parceiro_identificado"));
                const targetIndex = PARTNER_STAGES.findIndex(([stage]) => stage === key);
                if (dragged && targetIndex < currentIndex) {
                  toast({ title: "Movimento não permitido", description: "O card de parceiro só pode avançar. Etapas anteriores ficam no histórico.", variant: "destructive" });
                } else if (draggedId && !patchDeal.isPending) {
                  patchDeal.mutate({ id: draggedId, data: { etapa: "parceiro", relationshipStage: key } });
                }
                setDraggedId(null);
              }}>
                <div className={PIPELINE_COLUMN_HEADER_CLASS}><h2 className="text-sm font-semibold">{label}</h2><Badge variant="secondary">{columnDeals.length}</Badge></div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">{columnDeals.map((deal) => <Card key={deal.id} deal={deal} />)}{!columnDeals.length && <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Arraste um parceiro para esta etapa</div>}</div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}