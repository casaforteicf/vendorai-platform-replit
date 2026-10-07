import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CalendarDays, CheckCircle2, Mail, MessageCircle, RefreshCw, Send, Sparkles, UserRound, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Stage =
  | "encontrado" | "analisado" | "em_contato" | "conta_mapeada"
  | "oportunidade_identificada" | "reuniao_em_negociacao" | "reuniao_agendada"
  | "qualificado" | "aquecimento" | "sem_aderencia" | "sem_contato" | "nao_contatar";

type Prospect = {
  id: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  segment?: string | null;
  city?: string | null;
  stage: Stage;
  fitScore?: number | null;
  vendoraiFitScore?: number | null;
  arqdorFitScore?: number | null;
  meetingReadinessScore?: number | null;
  recommendedSolution?: string | null;
  primaryHook?: string | null;
  currentState?: string | null;
  currentObjective?: string | null;
  nextBestAction?: string | null;
  nextBestActionReason?: string | null;
  opportunitySummary?: string | null;
  accountMap?: Array<{
    name: string;
    jobTitle?: string | null;
    roles: string[];
    confidence: number;
    confirmed: boolean;
  }>;
  qualification?: {
    confirmedPains?: string[];
    inferredPains?: string[];
  };
};

type Interaction = {
  id: string;
  direction: "inbound" | "outbound" | "system";
  channel: string;
  status: string;
  content?: string | null;
  occurredAt: string;
};

type ProspectRow = { prospect: Prospect; company?: unknown };
type ProspectDetail = { prospect: Prospect; interactions: Interaction[] };

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "encontrado", label: "Encontrado" },
  { key: "analisado", label: "Analisado" },
  { key: "em_contato", label: "Em contato" },
  { key: "conta_mapeada", label: "Conta mapeada" },
  { key: "oportunidade_identificada", label: "Oportunidade" },
  { key: "reuniao_em_negociacao", label: "Reunião" },
  { key: "reuniao_agendada", label: "Agendada" },
  { key: "qualificado", label: "Qualificado" },
];

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Falha na operação");
  return body as T;
}

export default function ColdProspectingWorkspace() {
  const { user, tenantOverride } = useAuth();
  const tenantId = user?.platformRole === "super_admin" && tenantOverride?.id ? tenantOverride.id : user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [message, setMessage] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");

  const list = useQuery({
    queryKey: ["cold-prospects", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => api<ProspectRow[]>(`/api/tenants/${tenantId}/prospects`),
    refetchInterval: 30_000,
  });

  const detail = useQuery({
    queryKey: ["cold-prospect", tenantId, selectedId],
    enabled: Boolean(tenantId && selectedId),
    queryFn: () => api<ProspectDetail>(`/api/tenants/${tenantId}/prospects/${selectedId}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cold-prospects", tenantId] });
    void qc.invalidateQueries({ queryKey: ["cold-prospect", tenantId, selectedId] });
  };

  const sendMutation = useMutation({
    mutationFn: () => api(`/api/tenants/${tenantId}/prospects/${selectedId}/send`, {
      method: "POST",
      body: JSON.stringify({ channel, content: message }),
    }),
    onSuccess: () => {
      toast({ title: "Abordagem registrada e enviada" });
      setMessage("");
      refresh();
    },
    onError: (error: Error) => toast({ title: "Não foi possível enviar", description: error.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => api<any>(`/api/tenants/${tenantId}/prospects/${selectedId}/content-generate`, {
      method: "POST",
      body: JSON.stringify({
        segment: detail.data?.prospect.segment ?? undefined,
        pains: detail.data?.prospect.qualification?.confirmedPains ?? [],
        objective: detail.data?.prospect.currentObjective ?? undefined,
        channel,
      }),
    }),
    onSuccess: (data) => toast({
      title: data.action === "reuse" ? "Material aprovado encontrado" : "Material criado para revisão",
      description: data.action === "generated" ? "O envio automático permanece bloqueado até aprovação." : undefined,
    }),
    onError: (error: Error) => toast({ title: "Falha ao preparar material", description: error.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: () => api<any>(`/api/tenants/${tenantId}/prospects/${selectedId}/convert`, { method: "POST", body: "{}" }),
    onSuccess: (data) => {
      toast({ title: "Prospect convertido", description: `Lead ${data.leadId} criado sem perder o histórico.` });
      refresh();
    },
    onError: (error: Error) => toast({ title: "Ainda não está pronto para virar Lead", description: error.message, variant: "destructive" }),
  });

  const meetingMutation = useMutation({
    mutationFn: () => api<any>(`/api/tenants/${tenantId}/prospects/${selectedId}/schedule-meeting`, {
      method: "POST",
      body: JSON.stringify({
        start: meetingStart,
        end: meetingEnd,
        modality: "meet",
      }),
    }),
    onSuccess: () => {
      toast({ title: "Reunião agendada", description: "Lead/Negócio, agenda e briefing foram atualizados." });
      refresh();
    },
    onError: (error: Error) => toast({ title: "Falha ao agendar", description: error.message, variant: "destructive" }),
  });

  const rows = list.data ?? [];
  const grouped = useMemo(() => {
    const map = new Map<Stage, Prospect[]>();
    for (const stage of STAGES) map.set(stage.key, []);
    for (const row of rows) {
      if (!map.has(row.prospect.stage)) map.set(row.prospect.stage, []);
      map.get(row.prospect.stage)!.push(row.prospect);
    }
    return map;
  }, [rows]);

  const selected = detail.data?.prospect;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Pipeline de Prospecção IA</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Pré-Lead: navegação da conta, dor, material, follow-up e reunião antes de entrar no CRM comercial.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: "repeat(8, minmax(210px, 1fr))" }}>
            {STAGES.map((stage) => (
              <div key={stage.key} className="min-h-40 rounded-xl border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">{stage.label}</span>
                  <Badge variant="secondary">{grouped.get(stage.key)?.length ?? 0}</Badge>
                </div>
                <div className="space-y-2">
                  {(grouped.get(stage.key) ?? []).map((prospect) => (
                    <button
                      key={prospect.id}
                      type="button"
                      onClick={() => setSelectedId(prospect.id)}
                      className="w-full rounded-lg border bg-background p-2 text-left shadow-sm hover:border-primary/40"
                    >
                      <p className="truncate text-xs font-semibold">{prospect.displayName ?? "Empresa em enriquecimento"}</p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{prospect.segment ?? prospect.city ?? "Sem segmento"}</p>
                      <div className="mt-2 flex gap-1">
                        <Badge variant="outline" className="text-[10px]">Fit {prospect.fitScore ?? "—"}</Badge>
                        {prospect.primaryHook && <Badge variant="outline" className="text-[10px]">{prospect.primaryHook}</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4" /> Vendi recomenda agora
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="font-medium">Estado:</span> {selected.currentState ?? "—"}</div>
                <div><span className="font-medium">Objetivo:</span> {selected.currentObjective ?? "—"}</div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="font-medium">{selected.nextBestAction ?? "Sem próxima ação definida"}</p>
                  {selected.nextBestActionReason && <p className="mt-1 text-xs text-muted-foreground">{selected.nextBestActionReason}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Vendor.ai {selected.vendoraiFitScore ?? "—"}</Badge>
                  <Badge>Arqdor {selected.arqdorFitScore ?? "—"}</Badge>
                  <Badge variant="secondary">Reunião {selected.meetingReadinessScore ?? 0}%</Badge>
                </div>
                {selected.qualification?.confirmedPains?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium">Dores confirmadas</p>
                    <div className="flex flex-wrap gap-1">{selected.qualification.confirmedPains.map((pain) => <Badge key={pain} variant="outline">{pain}</Badge>)}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Mapa da conta</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(selected.accountMap ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ainda não há pessoas mapeadas.</p>}
                {(selected.accountMap ?? []).map((person, index) => (
                  <div key={`${person.name}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.jobTitle ?? "Cargo ainda não confirmado"}</p>
                      <div className="mt-1 flex flex-wrap gap-1">{person.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</div>
                    </div>
                    <Badge variant={person.confirmed ? "default" : "outline"}>{person.confirmed ? "Confirmado" : "Inferido"}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Histórico da prospecção</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(detail.data?.interactions ?? []).slice(0, 30).map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {item.direction === "inbound" ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      <span>{item.direction === "inbound" ? "Prospect" : "Vendi/Equipe"} · {item.channel}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{item.content ?? "Evento registrado"}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Executar próxima ação</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={channel} onValueChange={(value) => setChannel(value as "whatsapp" | "email")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp"><span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</span></SelectItem>
                    <SelectItem value="email"><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />E-mail</span></SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem contextual para este prospect..." rows={6} />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => sendMutation.mutate()} disabled={!message.trim() || sendMutation.isPending}>
                    <Send className="mr-1 h-3.5 w-3.5" />Enviar
                  </Button>
                  <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />Gerar material
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Conversão</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" variant="outline" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Enviar para Lead/Negócio
                </Button>
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-medium">Agendar reunião</p>
                  <div className="space-y-2">
                    <Input type="datetime-local" value={meetingStart} onChange={(e) => setMeetingStart(e.target.value)} />
                    <Input type="datetime-local" value={meetingEnd} onChange={(e) => setMeetingEnd(e.target.value)} />
                    <Button className="w-full" onClick={() => meetingMutation.mutate()} disabled={!meetingStart || !meetingEnd || meetingMutation.isPending}>
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />Agendar e preparar briefing
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
