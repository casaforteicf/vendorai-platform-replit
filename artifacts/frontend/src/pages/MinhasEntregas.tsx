import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEntregas,
  getListEntregasQueryKey,
  useUpdateEntrega,
  useListBloqueiosAgenda,
  useCreateBloqueioAgenda,
  useDeleteBloqueioAgenda,
  getListBloqueiosAgendaQueryKey,
  useListTenantUsers,
  getListTenantUsersQueryKey,
  Entrega,
  EntregaStatus,
  BloqueioAgenda,
  BloqueioPeriodo,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Truck,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  Ban,
  Loader2,
  CalendarOff,
  Trash2,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Route,
  Navigation,
  RefreshCw,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG: Record<EntregaStatus, { label: string; className: string }> = {
  aguardando: { label: "Aguardando", className: "bg-slate-100 text-slate-600 border-slate-200" },
  agendada: { label: "Agendada", className: "border-blue-300 text-blue-600 bg-blue-50" },
  em_transito: { label: "Em trânsito", className: "bg-amber-100 text-amber-700 border-amber-200" },
  entregue: { label: "Entregue", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelada: { label: "Cancelada", className: "bg-red-100 text-red-600 border-red-200" },
};

const PERIODO_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
};

function EntregaCard({
  entrega,
  onUpdateStatus,
  isUpdating,
}: {
  entrega: Entrega;
  onUpdateStatus: (id: string, status: EntregaStatus) => void;
  isUpdating: boolean;
}) {
  const statusCfg = STATUS_CONFIG[entrega.status];
  const isDone = entrega.status === "entregue" || entrega.status === "cancelada";

  return (
    <div
      data-testid={`entrega-card-${entrega.id}`}
      className={`flex flex-col gap-2 p-4 rounded-xl border border-border bg-card ${isDone ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold">
            {entrega.itens?.map((i) => `${i.quantidade}x ${i.nome}`).join(", ") || "Entrega"}
          </span>
        </div>
        <Badge className={`text-[10px] px-1.5 py-0 h-5 border font-medium ${statusCfg.className}`}>
          {statusCfg.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {entrega.dataPrevista && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(parseISO(entrega.dataPrevista as unknown as string), "dd/MM/yyyy", { locale: ptBR })}
            {entrega.periodo ? ` — ${PERIODO_LABEL[entrega.periodo]}` : ""}
          </span>
        )}
        {entrega.enderecoEntrega && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {entrega.enderecoEntrega}
          </span>
        )}
      </div>

      {entrega.observacoes && (
        <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">{entrega.observacoes}</p>
      )}

      {entrega.feedbackStatus === "negativo" && (
        <div className="flex items-start gap-1.5 text-xs bg-red-50 border border-red-200 text-red-700 rounded-md p-2">
          <ThumbsDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Cliente insatisfeito com a entrega</span>
            {entrega.feedbackMotivo && <p className="mt-0.5">{entrega.feedbackMotivo}</p>}
          </div>
        </div>
      )}

      {entrega.feedbackStatus === "positivo" && (
        <div className="flex items-center gap-1.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md p-2">
          <ThumbsUp className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">
            Cliente satisfeito{entrega.avaliacaoSolicitada ? " — avaliação solicitada" : ""}
          </span>
        </div>
      )}

      {!isDone && (
        <div className="flex gap-2 pt-2">
          {entrega.status !== "em_transito" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isUpdating}
              onClick={() => onUpdateStatus(entrega.id, "em_transito")}
              data-testid={`btn-transito-${entrega.id}`}
            >
              <Truck className="h-3.5 w-3.5 mr-1.5" />
              Saiu para entrega
            </Button>
          )}
          <Button
            size="sm"
            disabled={isUpdating}
            onClick={() => onUpdateStatus(entrega.id, "entregue")}
            data-testid={`btn-entregue-${entrega.id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Marcar entregue
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isUpdating}
            onClick={() => onUpdateStatus(entrega.id, "cancelada")}
            data-testid={`btn-cancelar-${entrega.id}`}
          >
            <Ban className="h-3.5 w-3.5 mr-1.5" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function BloquearAgendaDialog({
  open,
  onClose,
  tenantId,
  isAdmin,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  isAdmin: boolean;
  userId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users = [] } = useListTenantUsers(tenantId, {
    query: { enabled: isAdmin, queryKey: getListTenantUsersQueryKey(tenantId) },
  });
  const motoristas = users.filter((u) => u.userFunction === "entrega" && u.active);

  const [responsavelId, setResponsavelId] = useState<string>(userId ?? "");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [periodo, setPeriodo] = useState<string>(BloqueioPeriodo.dia_inteiro);
  const [motivo, setMotivo] = useState<string>("");

  const createBloqueio = useCreateBloqueioAgenda();

  function handleSubmit() {
    if (!responsavelId || !dataInicio || !dataFim) {
      toast({ title: "Preencha responsável, data início e data fim", variant: "destructive" });
      return;
    }

    createBloqueio.mutate(
      {
        tenantId,
        data: {
          tenantId,
          responsavelId,
          dataInicio: new Date(`${dataInicio}T00:00:00`).toISOString(),
          dataFim: new Date(`${dataFim}T23:59:59`).toISOString(),
          periodo: periodo as BloqueioPeriodo,
          motivo: motivo || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Agenda bloqueada com sucesso" });
          queryClient.invalidateQueries({ queryKey: getListBloqueiosAgendaQueryKey(tenantId) });
          onClose();
        },
        onError: (err: any) => {
          toast({ title: err?.response?.data?.error ?? "Erro ao bloquear agenda", variant: "destructive" });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Bloquear agenda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável…" />
                </SelectTrigger>
                <SelectContent>
                  {motoristas.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data início</Label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label>Data fim</Label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BloqueioPeriodo.dia_inteiro}>Dia inteiro</SelectItem>
                <SelectItem value={BloqueioPeriodo.manha}>Manhã</SelectItem>
                <SelectItem value={BloqueioPeriodo.tarde}>Tarde</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motivo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Férias, folga, manutenção do veículo…"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={createBloqueio.isPending}
              type="button"
            >
              {createBloqueio.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Bloqueando…</>
              ) : "Bloquear agenda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BloqueiosList({ tenantId, isAdmin, userId }: { tenantId: string; isAdmin: boolean; userId?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: bloqueios = [] } = useListBloqueiosAgenda(
    tenantId,
    isAdmin ? undefined : { responsavelId: userId }
  );
  const deleteBloqueio = useDeleteBloqueioAgenda();

  function handleDelete(id: string) {
    deleteBloqueio.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bloqueio removido" });
          queryClient.invalidateQueries({ queryKey: getListBloqueiosAgendaQueryKey(tenantId) });
        },
        onError: () => toast({ title: "Erro ao remover bloqueio", variant: "destructive" }),
      }
    );
  }

  if (!bloqueios.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Nenhum bloqueio de agenda cadastrado.</p>;
  }

  return (
    <div className="space-y-2">
      {bloqueios.map((b: BloqueioAgenda) => (
        <div
          key={b.id}
          className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-card"
          data-testid={`bloqueio-row-${b.id}`}
        >
          <div className="text-sm">
            <p className="font-medium">
              {format(parseISO(b.dataInicio as unknown as string), "dd/MM/yyyy", { locale: ptBR })}
              {" – "}
              {format(parseISO(b.dataFim as unknown as string), "dd/MM/yyyy", { locale: ptBR })}
              {" · "}
              {PERIODO_LABEL[b.periodo] ?? "Dia inteiro"}
            </p>
            {b.motivo && <p className="text-xs text-muted-foreground">{b.motivo}</p>}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive hover:text-destructive shrink-0"
            onClick={() => handleDelete(b.id)}
            data-testid={`btn-delete-bloqueio-${b.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

type RouteGroup = {
  key: string;
  motorista: string;
  periodo: string;
  data: string;
  entregas: Entrega[];
};

function RouteBoard({ routes, onUpdateStatus, isUpdating }: {
  routes: RouteGroup[];
  onUpdateStatus: (id: string, status: EntregaStatus) => void;
  isUpdating: boolean;
}) {
  if (!routes.length) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma rota gerada. Os pedidos aguardando aparecem na fila logística.</p>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {routes.map((route) => {
        const completed = route.entregas.filter((e) => e.status === "entregue").length;
        return (
          <section key={route.key} className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b bg-muted/35 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold flex items-center gap-2"><Route className="h-4 w-4 text-primary" />{route.motorista}</p>
                <p className="text-xs text-muted-foreground mt-1">{route.data} · {route.periodo} · {route.entregas.length} paradas</p>
              </div>
              <Badge variant="outline">{completed}/{route.entregas.length} concluídas</Badge>
            </div>
            <div className="p-3 space-y-2">
              {route.entregas.map((entrega, index) => (
                <div key={entrega.id} className="flex gap-3 rounded-lg border p-3">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{entrega.enderecoEntrega || "Endereço ainda não informado"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{entrega.itens?.map((i) => `${i.quantidade}x ${i.nome}`).join(", ") || "Volume"}</p>
                    {entrega.status === "agendada" && (
                      <Button size="sm" variant="outline" className="mt-2 h-7" disabled={isUpdating} onClick={() => onUpdateStatus(entrega.id, "em_transito")}>
                        <Navigation className="h-3 w-3 mr-1" />Iniciar parada
                      </Button>
                    )}
                    {entrega.status === "em_transito" && (
                      <Button size="sm" className="mt-2 h-7" disabled={isUpdating} onClick={() => onUpdateStatus(entrega.id, "entregue")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Confirmar entrega
                      </Button>
                    )}
                  </div>
                  <Badge className={`text-[10px] h-5 border ${STATUS_CONFIG[entrega.status].className}`}>{STATUS_CONFIG[entrega.status].label}</Badge>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function MinhasEntregas() {
  const { user, isEffectiveAdmin: isAdmin } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bloqueioOpen, setBloqueioOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ativas");
  const [isDispatching, setIsDispatching] = useState(false);

  const entregasParams = isAdmin ? undefined : { assignedTo: user?.id };
  const { data: entregas = [], isLoading } = useListEntregas(tenantId, entregasParams, {
    query: { enabled: !!tenantId, queryKey: getListEntregasQueryKey(tenantId, entregasParams) },
  });
  const updateEntrega = useUpdateEntrega();
  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId && isAdmin, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const userNames = useMemo(() => new Map(tenantUsers.map((u) => [u.id, u.name])), [tenantUsers]);
  const routes = useMemo<RouteGroup[]>(() => {
    const groups = new Map<string, RouteGroup>();
    for (const entrega of entregas) {
      if (!entrega.assignedTo || !entrega.dataPrevista || entrega.status === "cancelada") continue;
      const rawDate = entrega.dataPrevista as unknown as string;
      const day = format(parseISO(rawDate), "dd/MM/yyyy", { locale: ptBR });
      const key = `${entrega.assignedTo}-${day}-${entrega.periodo ?? "turno"}`;
      const existing = groups.get(key) ?? {
        key,
        motorista: userNames.get(entrega.assignedTo) ?? "Motorista designado",
        periodo: PERIODO_LABEL[entrega.periodo ?? ""] ?? "Turno livre",
        data: day,
        entregas: [],
      };
      existing.entregas.push(entrega);
      groups.set(key, existing);
    }
    return Array.from(groups.values());
  }, [entregas, userNames]);

  async function dispatchQueue() {
    setIsDispatching(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/entregas/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ periodo: new Date().getHours() < 12 ? "tarde" : "manha" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível gerar as rotas");
      toast({ title: `${result.scheduled} entrega(s) distribuída(s)`, description: result.skipped ? `${result.skipped} ficaram na fila por falta de capacidade.` : "Rotas atualizadas com sucesso." });
      queryClient.invalidateQueries({ queryKey: getListEntregasQueryKey(tenantId) });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao gerar rotas", variant: "destructive" });
    } finally {
      setIsDispatching(false);
    }
  }

  function handleUpdateStatus(id: string, status: EntregaStatus) {
    updateEntrega.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: status === "entregue" ? "Entrega concluída!" : "Status atualizado" });
          queryClient.invalidateQueries({ queryKey: getListEntregasQueryKey(tenantId) });
        },
        onError: (err: any) => {
          toast({ title: err?.response?.data?.error ?? "Erro ao atualizar entrega", variant: "destructive" });
        },
      }
    );
  }

  const filtered = entregas.filter((e) => {
    if (statusFilter === "ativas") return e.status !== "entregue" && e.status !== "cancelada";
    if (statusFilter === "concluidas") return e.status === "entregue" || e.status === "cancelada";
    return true;
  });

  const queueCount = entregas.filter((e) => e.status === "aguardando").length;
  const transitCount = entregas.filter((e) => e.status === "em_transito").length;
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const deliveredToday = entregas.filter((e) => e.status === "entregue" && e.dataEntregue && String(e.dataEntregue).startsWith(todayKey)).length;
  const attentionCount = entregas.filter((e) => e.status === "aguardando" && Date.now() - new Date(e.createdAt as unknown as string).getTime() > 24 * 60 * 60 * 1000).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Central Logística
          </h1>
          <p className="text-sm text-muted-foreground">Fila, rotas, motoristas e acompanhamento das entregas em um só lugar.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button onClick={dispatchQueue} disabled={isDispatching || queueCount === 0} data-testid="btn-gerar-rotas">
            {isDispatching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Route className="h-4 w-4 mr-1.5" />}Gerar rotas agora
          </Button>}
          <Button variant="outline" onClick={() => setBloqueioOpen(true)} data-testid="btn-bloquear-agenda"><Plus className="h-4 w-4 mr-1.5" />Bloquear agenda</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Na fila", value: queueCount, icon: ListChecks, tone: "text-blue-600 bg-blue-50" },
          { label: "Em rota", value: transitCount, icon: Navigation, tone: "text-amber-600 bg-amber-50" },
          { label: "Entregues hoje", value: deliveredToday, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
          { label: "Precisam atenção", value: attentionCount, icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-5 w-5" /></div>
            <div><p className="text-2xl font-bold leading-none">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>
          </div>
        ))}
      </div>

      {isAdmin && <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap">
        <span><RefreshCw className="h-4 w-4 inline mr-2" />A fila é distribuída automaticamente às 11h e 17h, respeitando bloqueios e capacidade dos motoristas.</span>
        <Badge variant="outline" className="border-blue-300">Automação ativa</Badge>
      </div>}

      <Tabs defaultValue="entregas">
        <TabsList>
          <TabsTrigger value="entregas" data-testid="tab-entregas">Fila logística</TabsTrigger>
          <TabsTrigger value="rotas" data-testid="tab-rotas">Rotas do dia</TabsTrigger>
          <TabsTrigger value="bloqueios" data-testid="tab-bloqueios">Bloqueios de agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="entregas" className="space-y-4 mt-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativas">Ativas</SelectItem>
              <SelectItem value="concluidas">Concluídas / Canceladas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma entrega encontrada.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((entrega) => (
                <EntregaCard
                  key={entrega.id}
                  entrega={entrega}
                  onUpdateStatus={handleUpdateStatus}
                  isUpdating={updateEntrega.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rotas" className="mt-4">
          <RouteBoard routes={routes} onUpdateStatus={handleUpdateStatus} isUpdating={updateEntrega.isPending} />
        </TabsContent>

        <TabsContent value="bloqueios" className="mt-4">
          <BloqueiosList tenantId={tenantId} isAdmin={isAdmin} userId={user?.id} />
        </TabsContent>
      </Tabs>

      <BloquearAgendaDialog
        open={bloqueioOpen}
        onClose={() => setBloqueioOpen(false)}
        tenantId={tenantId}
        isAdmin={isAdmin}
        userId={user?.id}
      />
    </div>
  );
}
