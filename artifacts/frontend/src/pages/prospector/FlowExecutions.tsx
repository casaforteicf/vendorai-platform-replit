import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Flow = {
  id: string;
  nome: string;
};

type Execution = {
  id: string;
  flowId: string;
  stepId: string;
  leadId: string;
  stepOrdem: number;
  canal: "whatsapp" | "email";
  status:
    | "pendente"
    | "gerando"
    | "enviando"
    | "enviado"
    | "falhou"
    | "cancelado";
  agendadoPara: string;
  executadoEm: string | null;
  erroMsg: string | null;
  materialGeradoUrl: string | null;
  leadNome: string | null;
  leadEmpresa: string | null;
};

// ── API helper ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Execution["status"], string> = {
  pendente: "Pendente",
  gerando: "Gerando",
  enviando: "Enviando",
  enviado: "Enviado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};

function StatusBadge({ status }: { status: Execution["status"] }) {
  const base = "text-xs font-medium";
  if (status === "pendente")
    return (
      <Badge variant="secondary" className={base}>
        {STATUS_LABELS[status]}
      </Badge>
    );
  if (status === "gerando")
    return (
      <Badge
        className={`${base} animate-pulse bg-blue-500 text-white hover:bg-blue-500`}
      >
        {STATUS_LABELS[status]}
      </Badge>
    );
  if (status === "enviando")
    return (
      <Badge
        className={`${base} bg-yellow-400 text-yellow-900 hover:bg-yellow-400`}
      >
        {STATUS_LABELS[status]}
      </Badge>
    );
  if (status === "enviado")
    return (
      <Badge
        className={`${base} bg-green-500 text-white hover:bg-green-500`}
      >
        {STATUS_LABELS[status]}
      </Badge>
    );
  if (status === "falhou")
    return (
      <Badge variant="destructive" className={base}>
        {STATUS_LABELS[status]}
      </Badge>
    );
  // cancelado
  return (
    <Badge variant="outline" className={`${base} text-muted-foreground`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// ── Canal badge ───────────────────────────────────────────────────────────────

function CanalBadge({ canal }: { canal: "whatsapp" | "email" }) {
  if (canal === "whatsapp")
    return (
      <Badge className="bg-green-500 text-white hover:bg-green-500 text-xs font-medium gap-1">
        <MessageCircle className="h-3 w-3" />
        WhatsApp
      </Badge>
    );
  return (
    <Badge className="bg-blue-500 text-white hover:bg-blue-500 text-xs font-medium gap-1">
      <Mail className="h-3 w-3" />
      E-mail
    </Badge>
  );
}

// ── Format date ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── FlowExecutions ────────────────────────────────────────────────────────────

export default function FlowExecutions() {
  const { id: flowId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Filters ───────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // ── Sheet state ───────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // ── Flow name query ───────────────────────────────────────────────────────
  const { data: flow } = useQuery<Flow>({
    queryKey: ["prospector-flow", flowId],
    queryFn: () => apiFetch<Flow>(`/api/prospector/flows/${flowId}`),
    enabled: !!flowId,
  });

  // ── Executions query ──────────────────────────────────────────────────────
  const {
    data: executions = [],
    isLoading,
    refetch,
  } = useQuery<Execution[]>({
    queryKey: ["prospector-executions", flowId],
    queryFn: () =>
      apiFetch<Execution[]>(`/api/prospector/flows/${flowId}/executions`),
    enabled: !!flowId,
  });

  // ── Auto-refresh when in-progress executions exist ────────────────────────
  const execRef = useRef(executions);
  execRef.current = executions;

  useEffect(() => {
    const timer = setInterval(() => {
      const active = execRef.current.some(
        (e) => e.status === "gerando" || e.status === "enviando",
      );
      if (active) void refetch();
    }, 15_000);
    return () => clearInterval(timer);
  }, [refetch]);

  // ── Filtered executions ───────────────────────────────────────────────────
  const filtered = executions.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const nome = (e.leadNome ?? "").toLowerCase();
      const empresa = (e.leadEmpresa ?? "").toLowerCase();
      if (!nome.includes(q) && !empresa.includes(q)) return false;
    }
    return true;
  });

  // ── Timeline (all executions for selected lead) ───────────────────────────
  const timeline = executions
    .filter((e) => e.leadId === selectedLeadId)
    .sort(
      (a, b) =>
        new Date(a.agendadoPara).getTime() - new Date(b.agendadoPara).getTime(),
    );

  const selectedLead = timeline[0];

  function openSheet(leadId: string) {
    setSelectedLeadId(leadId);
    setSheetOpen(true);
  }

  // ── Retry mutation ────────────────────────────────────────────────────────
  const retryMutation = useMutation({
    mutationFn: (execId: string) =>
      apiFetch<Execution>(`/api/prospector/executions/${execId}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospector-executions", flowId] });
      toast({ title: "Execução reagendada" });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  // ── Cancel mutation ───────────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (execId: string) =>
      apiFetch<Execution>(`/api/prospector/executions/${execId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelado" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospector-executions", flowId] });
      toast({ title: "Execução cancelada" });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  // ── Trigger-flow mutation (Sheet footer) ──────────────────────────────────
  const triggerMutation = useMutation({
    mutationFn: (leadId: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/prospector/leads/${leadId}/trigger-flow`,
        {
          method: "POST",
          body: JSON.stringify({ flowId }),
        },
      ),
    onSuccess: () => {
      setSheetOpen(false);
      qc.invalidateQueries({ queryKey: ["prospector-executions", flowId] });
      toast({ title: "Fluxo disparado" });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="border-b px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setLocation("/prospector/flows")}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h1 className="font-semibold text-lg leading-tight">
            Execuções
            {flow?.nome ? (
              <span className="font-normal text-muted-foreground">
                {" "}— {flow.nome}
              </span>
            ) : null}
          </h1>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mt-3 flex-wrap">
          <div className="w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="gerando">Gerando</SelectItem>
                <SelectItem value="enviando">Enviando</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="falhou">Falhou</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            className="h-8 text-sm w-56"
            placeholder="Buscar por lead ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* ── Table ── */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">
              {executions.length === 0
                ? "Nenhuma execução encontrada para este fluxo."
                : "Nenhum resultado para os filtros aplicados."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="w-16">Step</TableHead>
                <TableHead className="w-28">Canal</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-24">Material</TableHead>
                <TableHead className="w-40">Enviado em</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((exec) => (
                <TableRow
                  key={exec.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openSheet(exec.leadId)}
                >
                  <TableCell className="font-medium">
                    {exec.leadNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {exec.leadEmpresa ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-center">
                    {exec.stepOrdem}
                  </TableCell>
                  <TableCell>
                    <CanalBadge canal={exec.canal} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={exec.status} />
                  </TableCell>
                  <TableCell>
                    {exec.materialGeradoUrl ? (
                      <a
                        href={exec.materialGeradoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(exec.executadoEm ?? exec.agendadoPara)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {exec.status === "falhou" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(exec.id)}
                        >
                          Re-tentar
                        </Button>
                      )}
                      {exec.status === "pendente" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2 text-muted-foreground"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(exec.id)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </main>

      {/* ── Sheet lateral — timeline do lead ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[400px] flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle className="text-base leading-snug">
              {selectedLead?.leadNome ?? "Lead"}
              {selectedLead?.leadEmpresa && (
                <span className="font-normal text-muted-foreground block text-sm mt-0.5">
                  {selectedLead.leadEmpresa}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma execução encontrada.
              </p>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-6">
                {timeline.map((exec) => (
                  <li key={exec.id} className="ml-5">
                    {/* Dot */}
                    <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-border">
                      {exec.canal === "whatsapp" ? (
                        <MessageCircle className="h-2.5 w-2.5 text-green-500" />
                      ) : (
                        <Mail className="h-2.5 w-2.5 text-blue-500" />
                      )}
                    </span>

                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-tight">
                        Step {exec.stepOrdem} —{" "}
                        {exec.canal === "whatsapp" ? "WhatsApp" : "E-mail"}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={exec.status} />
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(exec.executadoEm ?? exec.agendadoPara)}
                        </span>
                      </div>
                      {exec.status === "falhou" && exec.erroMsg && (
                        <p className="text-xs text-destructive mt-1 leading-snug">
                          {exec.erroMsg}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Footer */}
          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button
              className="w-full"
              disabled={!selectedLeadId || triggerMutation.isPending}
              onClick={() => {
                if (selectedLeadId) triggerMutation.mutate(selectedLeadId);
              }}
            >
              {triggerMutation.isPending ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Disparando...
                </>
              ) : (
                "Disparar fluxo agora"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
