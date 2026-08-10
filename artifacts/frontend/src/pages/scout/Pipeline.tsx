import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Bot, ExternalLink, KanbanSquare, UserRound } from "lucide-react";
import { Link } from "wouter";

const STAGES = [
  ["identificada", "Identificadas"], ["em_analise", "Em analise"],
  ["encaminhada", "Encaminhadas"], ["ia_aprovada", "IA aprovada"],
  ["em_contato", "Em contato"], ["convertida", "Convertidas"],
] as const;

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`, "Content-Type": "application/json" };
}
function pretty(value: unknown) {
  if (!value) return "Nao informado";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(pretty).join("; ");
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${pretty(item)}`).join("; ");
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Nao foi possivel concluir a operacao.");
  return data;
}

export default function ScoutPipeline() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<any>(null);

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
    onError: (error: Error) => toast({ title: "Nao foi possivel mover", description: error.message, variant: "destructive" }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/scout/oportunidades/${id}/aprovar`, { method: "POST", headers: headers(), body: "{}" })
      .then(readJson),
    onSuccess: (data) => { refresh(); setSelected((old: any) => ({ ...old, ...data })); toast({ title: "IA aprovada e sequencia iniciada" }); },
    onError: (error: Error) => toast({ title: "Nao foi possivel aprovar", description: error.message, variant: "destructive" }),
  });

  const columns = useMemo(() => STAGES.map(([id, label]) => ({ id, label, items: opportunities.filter(o => (o.pipelineStage ?? "identificada") === id) })), [opportunities]);

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><KanbanSquare className="h-6 w-6" /> Pipeline Revenue Scout</h1>
      <p className="text-sm text-muted-foreground">Somente clientes com oportunidades identificadas pelo Scout.</p></div>
      <Link href="/scout/oportunidades"><Button variant="outline">Ver lista completa</Button></Link>
    </div>
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(column => <section key={column.id} className="w-[285px] shrink-0 rounded-xl bg-muted/40 border p-3">
        <div className="flex justify-between mb-3"><strong className="text-sm">{column.label}</strong><Badge variant="secondary">{column.items.length}</Badge></div>
        <div className="space-y-3">{column.items.map(op => <Card key={op.id} role="button" tabIndex={0} onClick={() => setSelected(op)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelected(op); }} className="p-3 cursor-pointer hover:border-primary transition-colors">
          <div className="flex justify-between gap-2"><p className="font-semibold truncate">{op.clienteNome}</p><ArrowRight className="h-4 w-4" /></div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{op.descricao || op.tipo}</p>
          <div className="flex gap-1 mt-3 flex-wrap"><Badge variant="outline">{op.tipo}</Badge>{op.responsavelNome && <Badge variant="secondary">{op.responsavelNome}</Badge>}</div>
        </Card>)}</div>
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
          <div><h3 className="font-semibold">Percepcao da oportunidade</h3><p className="text-sm text-muted-foreground mt-1">{pretty(selected.percepcao)}</p></div>
          <div><h3 className="font-semibold">Justificativa e sinais observados</h3><p className="text-sm text-muted-foreground mt-1">{pretty(selected.justificativa)}</p></div>
          <div><h3 className="font-semibold">Dados completos do lead</h3><div className="grid sm:grid-cols-2 gap-2 text-sm mt-2">
            <p><b>Email:</b> {selected.cliente?.email || "Nao informado"}</p><p><b>Telefone:</b> {selected.cliente?.telefone || "Nao informado"}</p>
            <p><b>Empresa:</b> {selected.cliente?.empresa || "Nao informado"}</p><p><b>Status:</b> {selected.cliente?.status || "Nao informado"}</p>
            <p><b>Dor principal:</b> {selected.cliente?.dorPrincipal || "Nao informado"}</p><p><b>Proxima acao:</b> {selected.cliente?.proximaAcao || "Nao informado"}</p>
          </div><Link href={`/leads/${selected.clienteId}`}><Button variant="link" className="px-0 mt-1">Abrir cadastro completo <ExternalLink className="h-4 w-4 ml-1" /></Button></Link></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="text-sm font-medium flex items-center gap-1"><UserRound className="h-4 w-4" /> Encaminhar para</label><Select value={selected.assignedTo ?? "sem"} onValueChange={value => assign.mutate({ id: selected.id, userId: value === "sem" ? "" : value })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem">Sem responsavel</SelectItem>{users.filter(u => u.active).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-sm font-medium">Etapa da pipeline</label><Select value={selected.pipelineStage ?? "identificada"} onValueChange={etapa => move.mutate({ id: selected.id, etapa })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button className="w-full" disabled={approve.isPending || selected.status === "enviado"} onClick={() => approve.mutate(selected.id)}><Bot className="h-4 w-4 mr-2" />{selected.status === "enviado" ? "IA aprovada - contato iniciado" : "Aprovar IA para dar sequencia"}</Button>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
