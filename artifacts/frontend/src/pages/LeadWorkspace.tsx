import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDeal, useGetLead, useListActivities, useListDeals, useListPipelineStages, useListTenantUsers, useUpdatePipelineStage, getGetLeadQueryKey, getListActivitiesQueryKey, getListDealsQueryKey, getListPipelineStagesQueryKey, getListTenantUsersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import LeadDetail from "@/pages/LeadDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Loader2, Settings2, UserRound } from "lucide-react";

const fallbackStages = [
  { key: "novo", label: "Novo", ordem: 10 }, { key: "em_aquecimento", label: "Em aquecimento", ordem: 20 },
  { key: "qualificado", label: "Qualificado", ordem: 30 }, { key: "proposta", label: "Proposta", ordem: 40 },
  { key: "negociacao", label: "Negociação", ordem: 50 }, { key: "conferencia_estoque", label: "Conferência de estoque", ordem: 60 },
  { key: "ganho", label: "Ganho", ordem: 70 }, { key: "em_execucao", label: "Em execução", ordem: 80 },
  { key: "entregue", label: "Entregue", ordem: 90 }, { key: "perdido", label: "Perdido", ordem: 100 },
];
const guidance: Record<string, [string, string]> = {
  novo: ["Primeiro atendimento", "Realizar primeiro contato"], em_aquecimento: ["Nutrição e relacionamento", "Fazer acompanhamento do lead"],
  qualificado: ["Diagnóstico da oportunidade", "Preparar solução e proposta"], proposta: ["Apresentação da proposta", "Apresentar proposta ao cliente"],
  negociacao: ["Negociação e fechamento", "Retomar negociação"], conferencia_estoque: ["Conferência operacional", "Confirmar estoque e prazo"],
  ganho: ["Venda confirmada", "Iniciar onboarding ou entrega"], em_execucao: ["Execução do combinado", "Atualizar andamento da execução"],
  entregue: ["Pós-venda", "Realizar contato de pós-venda"], perdido: ["Perda e reativação", "Programar tentativa de reativação"],
};
function tomorrow() { const d = new Date(Date.now() + 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }

export default function LeadWorkspace() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const search = new URLSearchParams(window.location.search);
  const requestedDealId = search.get("dealId");
  const requestedStage = search.get("targetStage");
  const request = { headers: { Authorization: "Bearer " + token } };
  const enabled = Boolean(tenantId && token && id);
  const { data: lead, isLoading: leadLoading } = useGetLead(id, { query: { enabled: Boolean(id), queryKey: getGetLeadQueryKey(id) } });
  const { data: deals = [], isLoading: dealsLoading } = useListDeals(tenantId, { leadId: id }, { request, query: { enabled, queryKey: getListDealsQueryKey(tenantId, { leadId: id }) } });
  const { data: activities = [] } = useListActivities(tenantId, { leadId: id }, { request, query: { enabled, queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) } });
  const { data: users = [] } = useListTenantUsers(tenantId, { request, query: { enabled, queryKey: getListTenantUsersQueryKey(tenantId) } });
  const { data: configuredStages = [] } = useListPipelineStages(tenantId, { request, query: { enabled, queryKey: getListPipelineStagesQueryKey(tenantId) } });
  const createDeal = useCreateDeal({ request });
  const updateStage = useUpdatePipelineStage();
  const deal = useMemo(() => deals.find((d) => d.id === requestedDealId) ?? deals.find((d) => !["ganho", "perdido", "entregue"].includes(d.etapa)) ?? deals[0] ?? null, [deals, requestedDealId]);
  const stages = useMemo(() => [...(configuredStages.length ? configuredStages : fallbackStages)].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), [configuredStages]);
  const currentIndex = stages.findIndex((s) => s.key === deal?.etapa);
  const currentStage = stages[currentIndex];
  const initialNext = requestedStage ?? stages[currentIndex + 1]?.key ?? "";
  const pending = activities.filter((a) => a.status !== "concluida" && (!deal || !a.dealId || a.dealId === deal.id)).sort((a, b) => new Date(a.dataVencimento ?? "9999").getTime() - new Date(b.dataVencimento ?? "9999").getTime());
  const displayUser = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? users.find((u) => u.id === uid)?.email ?? "Não definido";
  const [open, setOpen] = useState(Boolean(requestedStage));
  const [nextStage, setNextStage] = useState(initialNext);
  const [owner, setOwner] = useState(deal?.assignedTo ?? "");
  const [title, setTitle] = useState(guidance[initialNext]?.[1] ?? "Dar continuidade ao atendimento");
  const [due, setDue] = useState(tomorrow());
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editEligible, setEditEligible] = useState(false);

  // Etapa de destino escolhida no diálogo — usada pra filtrar quem pode
  // ser responsável (só quem está habilitado nela, se configurado).
  const targetStage = stages.find((s) => s.key === nextStage);
  const eligibleIds = (targetStage as { elegiveisUserIds?: string[] | null } | undefined)?.elegiveisUserIds ?? null;
  const eligibleUsers = eligibleIds && eligibleIds.length > 0 ? users.filter((u) => eligibleIds.includes(u.id)) : users;
  const [draftEligible, setDraftEligible] = useState<string[]>([]);
  useEffect(() => { setDraftEligible(eligibleIds ?? []); }, [nextStage]); // eslint-disable-line react-hooks/exhaustive-deps

  function startAttendance() {
    if (!lead) return;
    createDeal.mutate(
      { data: { tenantId, leadId: id, titulo: "Atendimento - " + lead.nome, etapa: "novo" } },
      {
        onSuccess: async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }),
            qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }),
          ]);
          toast({ title: "Atendimento iniciado", description: "Defina agora o responsável e a próxima atividade." });
        },
        onError: () => toast({ title: "Erro ao iniciar atendimento", variant: "destructive" }),
      },
    );
  }
  function showAdvance() {
    const stage = requestedStage ?? stages[currentIndex + 1]?.key ?? "";
    setNextStage(stage); setOwner(deal?.assignedTo ?? user?.id ?? ""); setTitle(guidance[stage]?.[1] ?? "Dar continuidade ao atendimento"); setEditEligible(false); setOpen(true);
  }
  function saveEligible() {
    if (!targetStage) return;
    updateStage.mutate(
      { tenantId, id: targetStage.id, data: { elegiveisUserIds: draftEligible } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) });
          toast({ title: "Usuários habilitados atualizados para " + targetStage.label + "." });
          setEditEligible(false);
          if (draftEligible.length > 0 && !draftEligible.includes(owner)) setOwner(draftEligible[0]);
        },
        onError: () => toast({ title: "Erro ao salvar usuários habilitados", variant: "destructive" }),
      },
    );
  }
  async function advance() {
    if (!deal || !nextStage || !owner || title.trim().length < 3) { toast({ title: "Preencha etapa, responsável e próxima atividade.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/deals/" + deal.id, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ etapa: nextStage, handoff: { responsavelId: owner, atividadeTitulo: title.trim(), atividadeDescricao: description.trim() || undefined, dataVencimento: due ? new Date(due).toISOString() : undefined, observacaoPassagem: note.trim() || undefined } }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 202 && result.pendingApproval) { toast({ title: "Movimentação enviada para aprovação." }); return; }
      if (!response.ok) throw new Error(result.error ?? "Não foi possível avançar.");
      await Promise.all([qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId, { leadId: id }) }), qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }), qc.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) })]);
      setOpen(false); toast({ title: "Etapa avançada", description: "Próxima atividade atribuída a " + displayUser(owner) + "." });
    } catch (e) { toast({ title: "Erro ao avançar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" }); } finally { setSaving(false); }
  }
  if (leadLoading || dealsLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" aria-label="Carregando" /></div>;
  if (!lead) return <Card><CardContent className="p-8 text-center">Lead não encontrado.</CardContent></Card>;

  return <div className="space-y-6">
    <Card className="border-primary/20"><CardContent className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" aria-label="Voltar à pipeline" onClick={() => navigate("/deals")}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="mb-2 flex gap-2"><Badge>Central de Trabalho</Badge><Badge variant="outline">{currentStage?.label ?? deal?.etapa ?? "Sem negócio"}</Badge></div>
            <h1 className="text-2xl font-semibold">{lead.nome}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" /> Responsável: {displayUser(deal?.assignedTo ?? lead.assignedTo)}
              {pending[0] && <span className="ml-2">· Próxima atividade: {pending[0].titulo}</span>}
            </p>
          </div>
        </div>
        {deal ? <Button onClick={showAdvance}>Avançar atendimento <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={createDeal.isPending} onClick={startAttendance}>{createDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar atendimento</Button>}
      </div>
    </CardContent></Card>
    <LeadDetail />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Avançar e definir a sequência</DialogTitle></DialogHeader><div className="grid gap-4 py-2">
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">Atual: <strong>{currentStage?.label ?? deal?.etapa}</strong> — responsável: <strong>{displayUser(deal?.assignedTo)}</strong></div>
      <Field label="Nova etapa"><Select value={nextStage} onValueChange={(v) => { setNextStage(v); setTitle(guidance[v]?.[1] ?? "Dar continuidade ao atendimento"); setEditEligible(false); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{stages.filter((s) => s.key !== deal?.etapa).map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent></Select></Field>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Responsável pela próxima atividade</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setEditEligible((v) => !v)}>
            <Settings2 className="h-3.5 w-3.5" /> Quem pode ser responsável nesta etapa
          </Button>
        </div>
        {editEligible && targetStage ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Marque quem pode ser escolhido como responsável quando um negócio chega em <strong>{targetStage.label}</strong>. Deixe tudo desmarcado para permitir qualquer usuário.</p>
            <div className="grid gap-1.5 max-h-40 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draftEligible.includes(u.id)} onCheckedChange={(checked) => setDraftEligible((prev) => checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))} />
                  {u.name || u.email || u.id}
                </label>
              ))}
            </div>
            <Button type="button" size="sm" disabled={updateStage.isPending} onClick={saveEligible}>{updateStage.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Salvar habilitados</Button>
          </div>
        ) : (
          <Select value={owner} onValueChange={setOwner}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{eligibleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email || u.id}</SelectItem>)}</SelectContent></Select>
        )}
      </div>

      <Field label="Próxima atividade"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="Prazo"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Orientações"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field><Field label="Observação da passagem"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={advance}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar passagem</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
