import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserRound, Flame, Handshake, ArrowRight, CalendarDays } from "lucide-react";

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
  const tab = params.get("tab") === "parceiros" ? "parceiros" : "aquecimento";
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const jsonHeaders = useMemo(() => ({ ...headers, "Content-Type": "application/json" }), [headers]);

  async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Erro ${response.status}`);
    return body as T;
  }

  const dealsQuery = useQuery<Deal[]>({ queryKey: ["relationship-deals", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/deals`) });
  const leadsQuery = useQuery<Lead[]>({ queryKey: ["relationship-leads", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/leads`) });
  const usersQuery = useQuery<User[]>({ queryKey: ["relationship-users", tenantId], enabled: !!tenantId, queryFn: () => api(`/api/tenants/${tenantId}/users`) });

  const leadMap = useMemo(() => new Map((leadsQuery.data ?? []).map((l) => [l.id, l])), [leadsQuery.data]);
  const userMap = useMemo(() => new Map((usersQuery.data ?? []).map((u) => [u.id, u])), [usersQuery.data]);

  const patchDeal = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api(`/api/deals/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["relationship-deals", tenantId] }); },
    onError: (error) => toast({ title: "Não foi possível atualizar o card", description: String(error), variant: "destructive" }),
  });

  const deals = dealsQuery.data ?? [];
  const warmingDeals = deals.filter((d) => d.etapa === "em_aquecimento");
  const partnerDeals = deals.filter((d) => d.etapa === "parceiro");

  const nav = (next: string) => {
    if (next === "comercial") navigate("/deals");
    else if (next === "execucao" || next === "suporte") navigate(`/pipeline-operacional?tab=${next}`);
    else navigate(`/pipeline-relacionamento?tab=${next}`);
  };

  function Card({ deal }: { deal: Deal }) {
    const lead = deal.leadId ? leadMap.get(deal.leadId) : undefined;
    const responsible = deal.assignedTo ? userMap.get(deal.assignedTo) : undefined;
    return (
      <article draggable onDragStart={() => setDraggedId(deal.id)} onDragEnd={() => setDraggedId(null)} onClick={() => deal.leadId && navigate(`/leads/${deal.leadId}`)} className="cursor-pointer rounded-lg border bg-card p-3 shadow-sm hover:shadow-md">
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
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
        <Button size="sm" variant="ghost" onClick={() => nav("comercial")}>Comercial</Button>
        <Button size="sm" variant="ghost" onClick={() => nav("execucao")}>Execução / Pedidos</Button>
        <Button size="sm" variant="ghost" onClick={() => nav("suporte")}>Suporte / Assistência</Button>
        <Button size="sm" variant={tab === "aquecimento" ? "default" : "ghost"} onClick={() => nav("aquecimento")}><Flame className="mr-1 h-3.5 w-3.5" />Aquecimento</Button>
        <Button size="sm" variant={tab === "parceiros" ? "default" : "ghost"} onClick={() => nav("parceiros")}><Handshake className="mr-1 h-3.5 w-3.5" />Parceiros</Button>
      </div>

      {tab === "aquecimento" ? (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2">
          {([
            ["nao_cliente", "Em Aquecimento — Leads"],
            ["cliente", "Em Aquecimento — Clientes"],
          ] as const).map(([kind, label]) => {
            const columnDeals = warmingDeals.filter((d) => (d.aquecimentoTipo === "cliente" ? "cliente" : "nao_cliente") === kind);
            return (
              <section key={kind} className="min-h-[420px] rounded-xl border bg-muted/20" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggedId) patchDeal.mutate({ id: draggedId, data: { etapa: "em_aquecimento", aquecimentoTipo: kind, relationshipStage: kind === "cliente" ? "aquecimento_cliente" : "aquecimento_lead" } }); setDraggedId(null); }}>
                <div className="flex items-center justify-between border-b px-3 py-2.5"><h2 className="text-sm font-semibold">{label}</h2><Badge variant="secondary">{columnDeals.length}</Badge></div>
                <div className="space-y-2 p-2">{columnDeals.map((deal) => <div key={deal.id}><Card deal={deal} /><Button size="sm" variant="ghost" className="mt-1 w-full gap-1 text-xs" onClick={() => patchDeal.mutate({ id: deal.id, data: { etapa: "novo", aquecimentoTipo: null, relationshipStage: null } })}>Retomar comercial <ArrowRight className="h-3 w-3" /></Button></div>)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-3">
          {PARTNER_STAGES.map(([key, label]) => {
            const columnDeals = partnerDeals.filter((d) => (d.relationshipStage || "parceiro_identificado") === key);
            return (
              <section key={key} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggedId) patchDeal.mutate({ id: draggedId, data: { etapa: "parceiro", relationshipStage: key } }); setDraggedId(null); }}>
                <div className="flex items-center justify-between border-b px-3 py-2.5"><h2 className="text-sm font-semibold">{label}</h2><Badge variant="secondary">{columnDeals.length}</Badge></div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">{columnDeals.map((deal) => <Card key={deal.id} deal={deal} />)}{!columnDeals.length && <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Arraste um parceiro para esta etapa</div>}</div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
