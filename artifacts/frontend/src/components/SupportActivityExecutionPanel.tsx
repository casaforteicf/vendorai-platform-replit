import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Question = {
  id: string;
  texto: string;
  tipo?: "texto" | "texto_longo" | "sim_nao" | "numero" | "data" | "opcoes";
  opcoes?: string[];
  quemResponde?: "cliente" | "usuario" | "ambos" | "automatico";
  obrigatoria?: boolean;
  visivelCliente?: boolean;
  editavelDepois?: boolean;
  evidenciaExigida?: string;
};

type StoredAnswer = {
  value?: unknown;
  answeredAt?: string;
  actorType?: string;
  actorName?: string | null;
  evidence?: Array<{ id: string; name: string; mimeType?: string | null; uploadedAt?: string }>;
};

type Activity = {
  id: string;
  titulo: string;
  descricao?: string | null;
  objetivo?: string | null;
  resultadoEsperado?: string | null;
  status: string;
  origemEtapaKey?: string | null;
  bloqueiaAvanco?: boolean;
  questions: Question[];
  answers: Record<string, StoredAnswer>;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return String(value);
}

function evidenceAccept(type?: string) {
  if (type === "foto") return "image/*";
  if (type === "video") return "video/*";
  if (type === "audio") return "audio/*";
  if (type === "midia") return "image/*,video/*,audio/*";
  if (type === "documento") return ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*";
  return undefined;
}

export function SupportActivityExecutionPanel({
  card,
  token,
  onChanged,
}: {
  card: { id: string; etapa: string; metadata?: Record<string, unknown> | null };
  token: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/work-cards/${card.id}/support-activities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body.error || "Falha ao carregar atividades");
      setActivities(body);
      const next: Record<string, Record<string, unknown>> = {};
      for (const activity of body as Activity[]) {
        next[activity.id] = {};
        for (const question of activity.questions ?? []) {
          next[activity.id][question.id] = activity.answers?.[question.id]?.value ?? "";
        }
      }
      setDrafts(next);
    } catch (error) {
      toast({ title: "Não foi possível carregar as atividades", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [card.id, token, toast]);

  useEffect(() => {
    void load();
  }, [load, card.etapa]);

  const currentActivities = activities.filter((activity) => activity.origemEtapaKey === card.etapa);
  const publicAccess = card.metadata?.supportPublicAccess as { token?: string; enabled?: boolean; lastSentAt?: string; lastViewedAt?: string } | undefined;
  const publicUrl = publicAccess?.token
    ? `${window.location.origin}/assistencia/${encodeURIComponent(publicAccess.token)}`
    : null;

  async function save(activity: Activity, complete: boolean) {
    setSavingId(activity.id);
    try {
      const response = await fetch(
        `/api/work-cards/${card.id}/support-activities/${activity.id}/answers`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ answers: drafts[activity.id] ?? {}, complete }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao salvar atividade");
      if (complete && body.missingRequired?.length) {
        toast({
          title: "Ainda faltam informações obrigatórias",
          description: "Preencha as perguntas obrigatórias antes de concluir.",
          variant: "destructive",
        });
      } else {
        toast({ title: complete ? "Atividade concluída" : "Informações salvas" });
      }
      await load();
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: String(error), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function uploadEvidence(activity: Activity, question: Question, file: File) {
    const key = `${activity.id}:${question.id}`;
    setUploadingEvidence(key);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/work-cards/${card.id}/support-activities/${activity.id}/questions/${question.id}/evidence`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao enviar evidência");
      toast({ title: "Evidência registrada" });
      await load();
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível enviar a evidência", description: String(error), variant: "destructive" });
    } finally {
      setUploadingEvidence(null);
    }
  }

  async function resendLink() {
    setResending(true);
    try {
      const response = await fetch(`/api/work-cards/${card.id}/support-public-link/resend`, {
        method: "POST",
        headers,
        body: "{}",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao reenviar link");
      toast({ title: "Link reenviado ao cliente", description: "Foi usado o mesmo link permanente deste atendimento." });
      await onChanged?.();
    } catch (error) {
      toast({ title: "Não foi possível reenviar o link", description: String(error), variant: "destructive" });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Execução da etapa atual</p>
          <p className="text-xs text-muted-foreground">
            Cliente e equipe alimentam o mesmo histórico. As respostas ficam vinculadas à atividade e ao relatório vivo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {publicUrl && (
            <Button type="button" size="sm" variant="outline" onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Acompanhamento do cliente
            </Button>
          )}
          {publicUrl && (
            <Button type="button" size="sm" variant="outline" disabled={resending} onClick={() => void resendLink()}>
              {resending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Reenviar mesmo link
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {publicUrl && (
        <div className="grid gap-2 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-2">
          <div>
            <span className="font-medium">Link permanente:</span>
            <p className="mt-1 truncate text-muted-foreground">{publicUrl}</p>
          </div>
          <div className="sm:text-right">
            <span className="font-medium">Cliente visualizou:</span>
            <p className="mt-1 text-muted-foreground">
              {publicAccess?.lastViewedAt ? new Date(publicAccess.lastViewedAt).toLocaleString("pt-BR") : "Ainda não"}
            </p>
          </div>
        </div>
      )}

      {!loading && currentActivities.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma atividade configurada para esta etapa. Edite a etapa para definir atividades e perguntas padrão.
        </div>
      )}

      {currentActivities.map((activity) => (
        <div key={activity.id} className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{activity.titulo.replace(/\s+—\s+AST-[^\s]+$/i, "")}</p>
                {activity.status === "concluida" ? (
                  <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Concluída</Badge>
                ) : activity.bloqueiaAvanco ? (
                  <Badge variant="outline">Obrigatória</Badge>
                ) : (
                  <Badge variant="outline">Em andamento</Badge>
                )}
              </div>
              {activity.descricao && <p className="mt-1 text-xs text-muted-foreground">{activity.descricao}</p>}
            </div>
          </div>

          {(activity.questions ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Esta atividade não possui perguntas configuradas.</p>
          ) : (
            <div className="space-y-3">
              {activity.questions.map((question) => {
                const answer = activity.answers?.[question.id];
                const canUserEdit = question.quemResponde !== "cliente" && question.quemResponde !== "automatico";
                const value = drafts[activity.id]?.[question.id] ?? "";
                return (
                  <div key={question.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-medium">
                        {question.texto}{question.obrigatoria ? " *" : ""}
                      </label>
                      <Badge variant="outline" className="text-[10px]">
                        {question.quemResponde === "cliente" ? "Cliente" : question.quemResponde === "ambos" ? "Cliente + equipe" : question.quemResponde === "automatico" ? "Sistema / IA" : "Equipe"}
                      </Badge>
                      {question.visivelCliente && <Badge variant="outline" className="text-[10px]">Visível ao cliente</Badge>}
                    </div>

                    {!canUserEdit ? (
                      <div className="rounded-md border bg-background px-3 py-2 text-sm">
                        {displayValue(answer?.value) || (question.quemResponde === "cliente" ? "Aguardando cliente" : "Aguardando sistema / IA")}
                      </div>
                    ) : question.tipo === "texto_longo" ? (
                      <Textarea
                        rows={3}
                        value={displayValue(value)}
                        disabled={activity.status === "concluida" && question.editavelDepois === false}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [activity.id]: { ...(current[activity.id] ?? {}), [question.id]: event.target.value },
                        }))}
                      />
                    ) : question.tipo === "sim_nao" ? (
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={displayValue(value)}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [activity.id]: {
                            ...(current[activity.id] ?? {}),
                            [question.id]: event.target.value === "" ? "" : event.target.value === "sim",
                          },
                        }))}
                      >
                        <option value="">Selecione</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    ) : question.tipo === "opcoes" ? (
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={displayValue(value)}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [activity.id]: { ...(current[activity.id] ?? {}), [question.id]: event.target.value },
                        }))}
                      >
                        <option value="">Selecione</option>
                        {(question.opcoes ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <Input
                        type={question.tipo === "numero" ? "number" : question.tipo === "data" ? "date" : "text"}
                        value={displayValue(value)}
                        disabled={activity.status === "concluida" && question.editavelDepois === false}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [activity.id]: { ...(current[activity.id] ?? {}), [question.id]: event.target.value },
                        }))}
                      />
                    )}

                    {question.evidenciaExigida && question.evidenciaExigida !== "nenhuma" && (
                      <div className="space-y-2 rounded-md border border-dashed p-2.5">
                        <p className="text-xs font-medium">Evidência obrigatória: {question.evidenciaExigida}</p>
                        {(answer?.evidence ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {(answer?.evidence ?? []).map((item) => (
                              <Badge key={item.id} variant="secondary" className="max-w-full truncate">
                                {item.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {canUserEdit && (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium">
                            {uploadingEvidence === `${activity.id}:${question.id}`
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Send className="h-3.5 w-3.5" />}
                            {uploadingEvidence === `${activity.id}:${question.id}` ? "Enviando..." : "Adicionar evidência"}
                            <input
                              type="file"
                              className="hidden"
                              accept={evidenceAccept(question.evidenciaExigida)}
                              disabled={uploadingEvidence === `${activity.id}:${question.id}`}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) void uploadEvidence(activity, question, file);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    {answer?.answeredAt && (
                      <p className="text-[11px] text-muted-foreground">
                        Última resposta: {new Date(answer.answeredAt).toLocaleString("pt-BR")}
                        {answer.actorName ? ` · ${answer.actorName}` : answer.actorType ? ` · ${answer.actorType}` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activity.status !== "concluida" && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={savingId === activity.id} onClick={() => void save(activity, false)}>
                {savingId === activity.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
              <Button type="button" size="sm" disabled={savingId === activity.id} onClick={() => void save(activity, true)}>
                {savingId === activity.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Concluir atividade
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
