import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserRound, ArrowRight, CalendarDays } from "lucide-react";
import { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";

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
type Lead = { id: string; nome?: string | null; empresa?: string | null; telefone?: string | null };
type User = { id: string; name?: string | null; email?: string | null };

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

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const jsonHeaders = useMemo(() => ({ ...headers, "Content-Type": "application/json" }), [headers]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Erro ${response.status}`);
    return body as T;
  }

  const dealsQuery = useQuery<Deal[]>({ queryKey: ["relationship-deals", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/deals?includeNaoLead=true`) });
  const leadsQuery = useQuery<Lead[]>({ queryKey: ["relationship-leads", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/leads`) });
  const usersQuery = useQuery<User[]>({ queryKey: ["relationship-users", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/users`) });

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
        <p className="text-sm font-semibold">{deal.titulo}</p>
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
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2">
          {([
            ["nao_cliente", "Em Aquecimento — Leads"],
            ["cliente", "Em Aquecimento — Clientes"],
          ] as const).map(([kind, label]) => {
            const columnDeals = warmingDeals.filter((d) => (d.aquecimentoTipo === "cliente" ? "cliente" : "nao_cliente") === kind);
            return (
              <section key={kind} className={`${PIPELINE_COLUMN_CLASS} min-h-[420px] w-full`} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggedId && !patchDeal.isPending) patchDeal.mutate({ id: draggedId, data: { etapa: "em_aquecimento", aquecimentoTipo: kind, relationshipStage: kind === "cliente" ? "aquecimento_cliente" : "aquecimento_lead" } }); setDraggedId(null); }}>
                <div className={PIPELINE_COLUMN_HEADER_CLASS}><h2 className="text-sm font-semibold">{label}</h2><Badge variant="secondary">{columnDeals.length}</Badge></div>
                <div className="space-y-2 p-2">{columnDeals.map((deal) => <div key={deal.id}><Card deal={deal} /><Button size="sm" variant="ghost" className="mt-1 w-full gap-1 text-xs" disabled={resumingDealId !== null || resumeCommercial.isPending} onClick={() => { if (resumingDealId || resumeCommercial.isPending) return; setResumingDealId(deal.id); resumeCommercial.mutate(deal); }}>{resumingDealId === deal.id ? "Retomando..." : "Retomar comercial"} <ArrowRight className="h-3 w-3" /></Button></div>)}</div>
              </section>
            );
          })}
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