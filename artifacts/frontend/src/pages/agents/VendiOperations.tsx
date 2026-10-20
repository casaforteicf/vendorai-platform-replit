import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type ToolInfo = {
  id: string;
  domain: string;
  description: string;
  risk: "low" | "medium" | "high";
  mutates: boolean;
  externalEffect: boolean;
  inputHint: string;
};

type Mission = {
  id: string;
  objective: string;
  source: string;
  status: string;
  priority: number;
  riskPolicy: string;
  plan: Array<Record<string, unknown>>;
  successCriteria: string[];
  result: Record<string, unknown> | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type MissionEvent = {
  id: string;
  sequence: number;
  type: string;
  toolId: string | null;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
};

type MissionDetail = {
  mission: Mission;
  events: MissionEvent[];
};

function headers() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : `Não foi possível concluir a operação (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body as T;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Na fila",
  planning: "Planejando",
  running: "Executando",
  paused_approval: "Aguardando aprovação",
  completed: "Concluída",
  failed: "Falhou",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  planning: "secondary",
  running: "default",
  paused_approval: "outline",
  completed: "secondary",
  failed: "destructive",
};

function fmt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function jsonPreview(value: unknown) {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function VendiOperations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [objective, setObjective] = useState("");
  const [priority, setPriority] = useState("50");
  const [riskPolicy, setRiskPolicy] = useState("standard");
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [toolFilter, setToolFilter] = useState("all");

  const toolsQuery = useQuery({
    queryKey: ["vendi-tools"],
    queryFn: () => api<{ tools: ToolInfo[]; domains: Array<{ domain: string; count: number }> }>("/api/vendi/tools"),
  });

  const missionsQuery = useQuery({
    queryKey: ["vendi-missions"],
    queryFn: () => api<Mission[]>("/api/vendi/missions"),
    refetchInterval: 4000,
  });

  const missionId = selectedMissionId || missionsQuery.data?.[0]?.id || "";
  const detailQuery = useQuery({
    queryKey: ["vendi-mission", missionId],
    queryFn: () => api<MissionDetail>(`/api/vendi/missions/${missionId}`),
    enabled: Boolean(missionId),
    refetchInterval: (query) => {
      const status = (query.state.data as MissionDetail | undefined)?.mission.status;
      return status === "queued" || status === "running" || status === "planning" || status === "paused_approval" ? 2000 : false;
    },
  });

  const createMission = useMutation({
    mutationFn: () => api<{ missionId: string; status?: string; execution?: { status?: string } }>("/api/vendi/missions", {
      method: "POST",
      body: JSON.stringify({
        objective,
        priority: Number(priority),
        riskPolicy,
        autoExecute: true,
      }),
    }),
    onSuccess: (data) => {
      setObjective("");
      setSelectedMissionId(data.missionId);
      void queryClient.invalidateQueries({ queryKey: ["vendi-missions"] });
      void queryClient.invalidateQueries({ queryKey: ["vendi-mission", data.missionId] });
      toast({
        title: "Missão criada",
        description: data.execution?.status === "paused_approval"
          ? "O Vendi executou até encontrar uma ação que precisa da sua aprovação."
          : data.status === "queued"
            ? "A missão foi salva e entrou na fila de execução do Vendi."
            : "O Vendi iniciou a operação.",
      });
    },
    onError: (error: Error) => toast({ title: "Não foi possível criar a missão", description: error.message, variant: "destructive" }),
  });

  const runMission = useMutation({
    mutationFn: (id: string) => api(`/api/vendi/missions/${id}/run`, { method: "POST" }),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["vendi-missions"] });
      void queryClient.invalidateQueries({ queryKey: ["vendi-mission", id] });
    },
    onError: (error: Error) => toast({ title: "Execução", description: error.message, variant: "destructive" }),
  });

  const approveMission = useMutation({
    mutationFn: ({ id, toolId }: { id: string; toolId: string }) => api(`/api/vendi/missions/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ toolIds: [toolId] }),
    }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["vendi-missions"] });
      void queryClient.invalidateQueries({ queryKey: ["vendi-mission", input.id] });
      toast({ title: "Ação aprovada", description: "O Vendi retomou a missão." });
    },
    onError: (error: Error) => toast({ title: "Aprovação", description: error.message, variant: "destructive" }),
  });

  const tools = toolsQuery.data?.tools ?? [];
  const domains = toolsQuery.data?.domains ?? [];
  const filteredTools = useMemo(
    () => toolFilter === "all" ? tools : tools.filter((tool) => tool.domain === toolFilter),
    [tools, toolFilter],
  );

  const detail = detailQuery.data;
  const pendingApproval = detail?.mission.status === "paused_approval"
    ? [...(detail.events ?? [])]
        .reverse()
        .find((event) => event.type === "approval_required" && event.status === "pending")
    : undefined;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
      <Card className="overflow-hidden border-primary/20 bg-primary/[0.025]">
        <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">Vendi · Central de Operações</h1>
                <Badge variant="secondary">Mission Supervisor</Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Diga o resultado que você quer. O Vendi escolhe as ferramentas internas corretas, executa os passos permitidos, registra evidências e pausa quando uma ação exige aprovação.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" />{tools.length} capabilities registradas</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Risco e aprovação centralizados</span>
                <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />CRM, MKT, Prospector, agentes, Web e operação</span>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => {
            void missionsQuery.refetch();
            if (missionId) void detailQuery.refetch();
          }}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="font-semibold">Nova missão</h2>
            <p className="mt-1 text-xs text-muted-foreground">Descreva o objetivo em linguagem natural.</p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Objetivo</Label>
                <Textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={5}
                  placeholder="Ex.: Analise os negócios parados, encontre os mais prioritários e prepare os próximos passos."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prioridade</Label>
                  <Input type="number" min={0} max={100} value={priority} onChange={(e) => setPriority(e.target.value)} />
                </div>
                <div>
                  <Label>Política</Label>
                  <Select value={riskPolicy} onValueChange={setRiskPolicy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Padrão</SelectItem>
                      <SelectItem value="read_only">Somente leitura</SelectItem>
                      <SelectItem value="strict">Estrita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={objective.trim().length < 3 || createMission.isPending}
                onClick={() => createMission.mutate()}
              >
                {createMission.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Executar com Vendi
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Missões</h2>
              <p className="text-xs text-muted-foreground">Histórico real do tenant.</p>
            </div>
            <div className="max-h-[540px] overflow-auto">
              {(missionsQuery.data ?? []).map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => setSelectedMissionId(mission.id)}
                  className={`w-full border-b p-4 text-left transition hover:bg-muted/40 ${missionId === mission.id ? "bg-primary/[0.05]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{mission.objective}</p>
                    <Badge variant={STATUS_VARIANT[mission.status] ?? "outline"} className="shrink-0 text-[10px]">
                      {STATUS_LABELS[mission.status] ?? mission.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{mission.source} · prioridade {mission.priority}</span>
                    <span>{fmt(mission.createdAt)}</span>
                  </div>
                </button>
              ))}
              {!missionsQuery.isLoading && (missionsQuery.data?.length ?? 0) === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma missão criada ainda.</div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {!detail ? (
            <Card className="flex min-h-[360px] items-center justify-center p-8 text-center">
              <div>
                <Bot className="mx-auto h-9 w-9 text-muted-foreground/50" />
                <p className="mt-3 font-medium">Selecione ou crie uma missão</p>
                <p className="mt-1 text-sm text-muted-foreground">O plano, as ferramentas e as evidências aparecerão aqui.</p>
              </div>
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[detail.mission.status] ?? "outline"}>
                        {STATUS_LABELS[detail.mission.status] ?? detail.mission.status}
                      </Badge>
                      <Badge variant="outline">{detail.mission.riskPolicy}</Badge>
                      <Badge variant="outline">{detail.mission.source}</Badge>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{detail.mission.objective}</h2>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Criada {fmt(detail.mission.createdAt)} · Início {fmt(detail.mission.startedAt)} · Fim {fmt(detail.mission.completedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={runMission.isPending || ["queued", "running", "completed"].includes(detail.mission.status)}
                    onClick={() => runMission.mutate(detail.mission.id)}
                  >
                    {runMission.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Executar / retomar
                  </Button>
                </div>

                {detail.mission.lastError && (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Falha registrada</div>
                    <p className="mt-1">{detail.mission.lastError}</p>
                  </div>
                )}

                {pendingApproval?.toolId && (
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <ShieldCheck className="h-4 w-4" />
                          Aprovação necessária
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {pendingApproval.toolId} · risco {String((pendingApproval.output as any)?.risk ?? "high")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {String((pendingApproval.output as any)?.reason ?? "Ação protegida")}
                        </p>
                      </div>
                      <Button
                        disabled={approveMission.isPending}
                        onClick={() => approveMission.mutate({ id: detail.mission.id, toolId: pendingApproval.toolId! })}
                      >
                        {approveMission.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Aprovar e continuar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="font-semibold">Plano</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Capabilities escolhidas pelo supervisor.</p>
                  <div className="mt-3 space-y-2">
                    {(detail.mission.plan ?? []).map((step: any, index) => (
                      <div key={index} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                          <code className="text-xs font-medium">{String(step.toolId ?? "")}</code>
                        </div>
                        {step.reason && <p className="mt-2 text-xs text-muted-foreground">{String(step.reason)}</p>}
                      </div>
                    ))}
                    {(detail.mission.plan?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">O plano ainda não foi gerado.</p>}
                  </div>
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold">Critérios de sucesso</h3>
                  <div className="mt-3 space-y-2">
                    {(detail.mission.successCriteria ?? []).map((item, index) => (
                      <div key={index} className="flex gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </div>
                    ))}
                    {(detail.mission.successCriteria?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Sem critérios explícitos ainda.</p>}
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b p-4">
                  <h3 className="font-semibold">Timeline da missão</h3>
                  <p className="text-xs text-muted-foreground">Execução, aprovações, evidências e erros em ordem cronológica.</p>
                </div>
                <div className="divide-y">
                  {(detail.events ?? []).map((event) => (
                    <div key={event.id} className="grid gap-3 p-4 md:grid-cols-[44px_180px_minmax(0,1fr)]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">{event.sequence}</div>
                      <div>
                        <div className="text-sm font-medium">{event.type}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{event.toolId || "supervisor"}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{fmt(event.createdAt)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Badge variant={event.status === "failed" ? "destructive" : "outline"}>{event.status}</Badge>
                          {event.evidence && <Badge variant="secondary">evidência</Badge>}
                        </div>
                        {event.error && <p className="mb-2 text-sm text-destructive">{event.error}</p>}
                        {(event.evidence || event.output) && (
                          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-[11px]">
                            {jsonPreview(event.evidence ?? event.output)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                  {(detail.events?.length ?? 0) === 0 && <div className="p-6 text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>}
                </div>
              </Card>
            </>
          )}

          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Ferramentas disponíveis</h3>
                <p className="text-xs text-muted-foreground">Registry real usado pelo Mission Supervisor.</p>
              </div>
              <Select value={toolFilter} onValueChange={setToolFilter}>
                <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {domains.map((item) => (
                    <SelectItem key={item.domain} value={item.domain}>{item.domain} · {item.count}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredTools.map((tool) => (
                <div key={tool.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs font-semibold">{tool.id}</code>
                    <Badge variant="outline" className="text-[10px]">{tool.domain}</Badge>
                    <Badge variant={tool.risk === "high" ? "destructive" : "secondary"} className="text-[10px]">{tool.risk}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{tool.description}</p>
                  <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                    <span>{tool.mutates ? "altera dados" : "somente leitura"}</span>
                    <span>{tool.externalEffect ? "efeito externo" : "interno"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
