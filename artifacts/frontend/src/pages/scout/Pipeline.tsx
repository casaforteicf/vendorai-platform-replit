import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PipelineNav,
  PIPELINE_CARD_CLASS,
  PIPELINE_COLUMN_CLASS,
  PIPELINE_COLUMN_HEADER_CLASS,
} from "@/components/PipelineNav";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Bot, ExternalLink, Trash2, UserRound } from "lucide-react";
import { Link } from "wouter";

const STAGES = [
  ["identificada", "Identificadas"], ["em_analise", "Em análise"],
  ["encaminhada", "Encaminhadas"], ["ia_aprovada", "IA aprovada"],
  ["em_contato", "Em contato"], ["convertida", "Convertidas"],
] as const;

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`, "Content-Type": "application/json" };
}
function pretty(value: unknown): string {
  if (!value) return "Não informado";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(pretty).join("; ");
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${pretty(item)}`).join("; ");
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Não foi possível concluir a operação.");
  return data;
}

export default function ScoutPipeline() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<any>(null);
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin";

  const { data: opportunities = [] } = useQuery<any[]>({
    queryKey: ["scout-pipeline", tenantId], enabled: !!tenantId,
    queryFn: () => fetch(`/api/tenants/${tenantId}/scout/oportunidades`, { headers: headers() }).then(readJson),
  });
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["tenant-users", tenantId], enabled: !!tenantId,
    queryFn: () => fetch(`/api/tenants/${tenantId}/users`, { headers: headers() }).then(readJson),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["scout-pipeline", tenantId] });
    qc.invalidateQueries({ queryKey: ["scout-oportunidades", tenantId] });
    qc.invalidateQueries({ queryKey: ["scout-dashboard", tenantId] });
  };
  const assign = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/encaminhar`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ userId }),
    }).then(readJson),
    onSuccess: (data) => { refresh(); setSelected((old: any) => ({ ...old, ...data })); toast({ title: "Lead encaminhado" }); },
  });
  const move = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: string }) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/etapa`, {
      method: "PATCH", headers: headers(), body: JSON.stringify({ etapa }),
    }).then(readJson),
    onSuccess: (data) => { refresh(); setSelected((old: any) => ({ ...old, ...data })); },
    onError: (error: Error) => toast({ title: "Não foi possível mover", description: error.message, variant: "destructive" }),
  });
  const executeWithAgent = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/executar-com-agente`, { method: "POST", headers: headers(), body: "{}" })
      .then(readJson),
    onSuccess: (data) => {
      refresh();
      setSelected((old: any) => ({
        ...old,
        pipelineStage: data?.result?.status === "failed" ? "em_analise" : "em_contato",
        explanation: {
          ...(old?.explanation ?? {}),
          orchestration: { agent: data?.agent, resultStatus: data?.result?.status, nextBestAction: data?.nextBestAction },
        },
      }));
      toast({ title: "Agente acionado", description: `${data?.agent ?? "IA"} recebeu o contexto completo do Revenue Scout.` });
    },
    onError: (error: Error) => toast({ title: "Não foi possível executar com IA", description: error.message, variant: "destructive" }),
  });
  const removeOpportunity = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}`, {
      method: "DELETE", headers: headers(),
    }).then(readJson),
    onSuccess: () => { refresh(); setSelected(null); toast({ title: "Oportunidade excluída" }); },
    onError: (error: Error) => toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }),
  });
  const removeLead = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/leads/${id}`, { method: "DELETE", headers: headers() });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Não foi possível excluir o lead.");
      }
    },
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["leads"] }); setSelected(null); toast({ title: "Lead excluído definitivamente" }); },
    onError: (error: Error) => toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" }),
  });

  const confirmedOpportunities = useMemo(
    () => opportunities.filter(op => op.status !== "pendente" && op.status !== "ignorado"),
    [opportunities],
  );
  const columns = useMemo(
    () => STAGES.map(([id, label]) => ({ id, label, items: confirmedOpportunities.filter(o => (o.pipelineStage ?? "identificada") === id) })),
    [confirmedOpportunities],
  );

  return <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Revenue Scout — oportunidades confirmadas, agentes responsáveis e execução acompanhada em um só fluxo.</p>
      </div>
      <Link href="/scout/oportunidades"><Button variant="outline">Ver lista completa</Button></Link>
    </div>

    <PipelineNav active="scout" />

    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-3">
      {columns.map(column => <section key={column.id} className={PIPELINE_COLUMN_CLASS}>
        <div className={PIPELINE_COLUMN_HEADER_CLASS}>
          <h2 className="text-sm font-semibold">{column.label}</h2>
          <Badge variant="secondary">{column.items.length}</Badge>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {column.items.map(op => <Card key={op.id} role="button" tabIndex={0} onClick={() => setSelected(op)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelected(op); }} className={`${PIPELINE_CARD_CLASS} hover:border-primary`}>
            <div className="flex justify-between gap-2"><p className="truncate text-sm font-semibold">{op.clienteNome}</p><ArrowRight className="h-4 w-4" /></div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{op.descricao || op.tipo}</p>
            <div className="mt-3 flex flex-wrap gap-1"><Badge variant="outline">{op.tipo}</Badge>{op.responsavelNome && <Badge variant="secondary">{op.responsavelNome}</Badge>}{op.explanation?.orchestration?.agent && <Badge variant="secondary">IA: {op.explanation.orchestration.agent}</Badge>}</div>
          </Card>)}
          {!column.items.length && <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Nenhuma oportunidade nesta etapa</div>}
        </div>
      </section>)}
    </div>

    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.clienteNome} - oportunidade percebida</DialogTitle></DialogHeader>
        {selected && <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Oportunidade</p><p className="font-semibold mt-1">{selected.descricao || selected.tipo}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Regra que identificou</p><p className="font-semibold mt-1">{selected.regraNome || "Revenue Scout"}</p></Card>
          </div>
          <div><h3 className="font-semibold">Percepção da oportunidade</h3><p className="text-sm text-muted-foreground mt-1">{pretty(selected.percepcao)}</p></div>
          <div><h3 className="font-semibold">Justificativa e sinais observados</h3><p className="text-sm text-muted-foreground mt-1">{pretty(selected.justificativa)}</p></div>
          {selected.explanation?.orchestration && <Card className="p-4"><p className="text-xs text-muted-foreground">Orquestração de IA</p><p className="mt-1 font-semibold">Agente: {selected.explanation.orchestration.agent ?? "—"}</p><p className="mt-1 text-sm text-muted-foreground">{selected.explanation.orchestration.nextBestAction ?? "Próxima ação definida pelo Revenue Scout."}</p></Card>}
          <div><h3 className="font-semibold">Dados completos do lead</h3><div className="grid sm:grid-cols-2 gap-2 text-sm mt-2">
            <p><b>Email:</b> {selected.cliente?.email || "Não informado"}</p><p><b>Telefone:</b> {selected.cliente?.telefone || "Não informado"}</p>
            <p><b>Empresa:</b> {selected.cliente?.empresa || "Não informado"}</p><p><b>Status:</b> {selected.cliente?.status || "Não informado"}</p>
            <p><b>Dor principal:</b> {selected.cliente?.dorPrincipal || "Não informado"}</p><p><b>Próxima ação:</b> {selected.cliente?.proximaAcao || "Não informado"}</p>
          </div><Link href={`/leads/${selected.clienteId}`}><Button variant="link" className="px-0 mt-1">Abrir cadastro completo <ExternalLink className="h-4 w-4 ml-1" /></Button></Link></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="text-sm font-medium flex items-center gap-1"><UserRound className="h-4 w-4" /> Encaminhar para</label><Select value={selected.assignedTo ?? "sem"} onValueChange={value => assign.mutate({ id: selected.id, userId: value === "sem" ? "" : value })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem">Sem responsável</SelectItem>{users.filter(u => u.active).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-sm font-medium">Etapa da pipeline</label><Select value={selected.pipelineStage ?? "identificada"} onValueChange={etapa => move.mutate({ id: selected.id, etapa })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button className="w-full" disabled={executeWithAgent.isPending || selected.pipelineStage === "em_contato"} onClick={() => executeWithAgent.mutate(selected.id)}><Bot className="h-4 w-4 mr-2" />{selected.pipelineStage === "em_contato" ? "Agente em execução" : "Executar próxima ação com IA"}</Button>
          {isAdmin && <div className="border-t pt-4 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="text-destructive" disabled={removeOpportunity.isPending} onClick={() => {
              if (window.confirm("Excluir somente esta oportunidade do Revenue Scout? O cadastro do lead será mantido.")) removeOpportunity.mutate(selected.id);
            }}><Trash2 className="h-4 w-4 mr-2" /> Excluir oportunidade</Button>
            <Button variant="destructive" disabled={removeLead.isPending} onClick={() => {
              if (window.confirm(`Excluir definitivamente o lead ${selected.clienteNome} e seus dados relacionados? Esta ação não pode ser desfeita.`)) removeLead.mutate(selected.clienteId);
            }}><Trash2 className="h-4 w-4 mr-2" /> Excluir lead completo</Button>
          </div>}
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}