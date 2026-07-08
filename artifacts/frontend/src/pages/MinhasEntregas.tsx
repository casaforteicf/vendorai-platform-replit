import { useState } from "react";
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

export default function MinhasEntregas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bloqueioOpen, setBloqueioOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ativas");

  const entregasParams = isAdmin ? undefined : { assignedTo: user?.id };
  const { data: entregas = [], isLoading } = useListEntregas(tenantId, entregasParams, {
    query: { enabled: !!tenantId, queryKey: getListEntregasQueryKey(tenantId, entregasParams) },
  });
  const updateEntrega = useUpdateEntrega();

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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Minhas Entregas
          </h1>
          <p className="text-sm text-muted-foreground">Acompanhe suas entregas por turno.</p>
        </div>
        <Button variant="outline" onClick={() => setBloqueioOpen(true)} data-testid="btn-bloquear-agenda">
          <Plus className="h-4 w-4 mr-1.5" />
          Bloquear agenda
        </Button>
      </div>

      <Tabs defaultValue="entregas">
        <TabsList>
          <TabsTrigger value="entregas" data-testid="tab-entregas">Entregas</TabsTrigger>
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
