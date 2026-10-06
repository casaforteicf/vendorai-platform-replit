import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Question = {
  id: string;
  texto: string;
  tipo?: "texto" | "texto_longo" | "sim_nao" | "numero" | "data" | "opcoes";
  opcoes?: string[];
  quemResponde?: "cliente" | "usuario" | "ambos" | "automatico";
  obrigatoria?: boolean;
  editavelDepois?: boolean;
  evidenciaExigida?: string;
  evidence?: Array<{ id: string; name: string; mimeType?: string | null; uploadedAt?: string }>;
  answer?: unknown;
  answeredAt?: string | null;
};

type Activity = {
  id: string;
  title: string;
  description?: string | null;
  objective?: string | null;
  expectedResult?: string | null;
  status: string;
  dueAt?: string | null;
  stageKey?: string | null;
  required?: boolean;
  questions: Question[];
};

type Payload = {
  case: {
    id: string;
    code: string;
    title: string;
    description?: string | null;
    stage: string;
    priority: string;
    openedAt: string;
    updatedAt: string;
  };
  tenant: { name?: string | null; logoUrl?: string | null; primaryColor?: string | null };
  client: { name: string };
  stages: Array<{ key: string; label: string; order: number }>;
  activities: Activity[];
  timeline: Array<{ at?: string; userName?: string; text?: string; kind?: string }>;
};

function currentToken() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-1) ?? "");
}

function inputValue(value: unknown) {
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

export default function PublicSupportAssistance() {
  const token = useMemo(currentToken, []);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/public/support/${encodeURIComponent(token)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar o atendimento");
      setData(body);
      const next: Record<string, Record<string, unknown>> = {};
      for (const activity of body.activities ?? []) {
        next[activity.id] = {};
        for (const question of activity.questions ?? []) {
          next[activity.id][question.id] = question.answer ?? "";
        }
      }
      setDrafts(next);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveActivity(activity: Activity, complete: boolean) {
    setSavingId(activity.id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/public/support/${encodeURIComponent(token)}/activities/${encodeURIComponent(activity.id)}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: drafts[activity.id] ?? {}, complete }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar");
      if (complete && Array.isArray(body.missingRequired) && body.missingRequired.length > 0) {
        setMessage("Preencha as informações obrigatórias antes de concluir esta atividade.");
      } else {
        setMessage(complete ? "Informações enviadas e atividade concluída." : "Informações salvas.");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId(null);
    }
  }

  async function uploadEvidence(activity: Activity, question: Question, file: File) {
    const key = `${activity.id}:${question.id}`;
    setUploadingEvidence(key);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/public/support/${encodeURIComponent(token)}/activities/${encodeURIComponent(activity.id)}/questions/${encodeURIComponent(question.id)}/evidence`,
        { method: "POST", body: form },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível enviar a evidência");
      setMessage("Evidência enviada com sucesso.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingEvidence(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando assistência...
        </div>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Não foi possível abrir o atendimento</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentIndex = Math.max(0, data.stages.findIndex((stage) => stage.key === data.case.stage));
  const currentStage = data.stages[currentIndex];

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
          {data.tenant.logoUrl ? (
            <img src={data.tenant.logoUrl} alt={data.tenant.name || "Empresa"} className="h-10 max-w-40 object-contain" />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: data.tenant.primaryColor || "#111827" }}
            >
              {(data.tenant.name || "A").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{data.tenant.name || "Assistência"}</p>
            <p className="text-xs text-muted-foreground">Acompanhamento do atendimento</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{data.case.code}</Badge>
                <Badge>{currentStage?.label || data.case.stage.replaceAll("_", " ")}</Badge>
              </div>
              <h1 className="mt-3 text-xl font-semibold">{data.case.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Cliente: {data.client.name}</p>
              {data.case.description && <p className="mt-3 whitespace-pre-wrap text-sm">{data.case.description}</p>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-background p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Andamento</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {data.stages.map((stage, index) => {
              const done = index < currentIndex;
              const current = index === currentIndex;
              return (
                <div key={stage.key} className={`rounded-lg border p-3 ${current ? "bg-muted/40" : ""}`}>
                  <div className="flex items-center gap-2">
                    {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className={`h-4 w-4 ${current ? "fill-current" : "text-muted-foreground"}`} />}
                    <span className="text-xs font-medium">{stage.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {message && (
          <div className="rounded-lg border bg-background px-4 py-3 text-sm">{message}</div>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Informações do atendimento</h2>
            <p className="text-sm text-muted-foreground">
              Preencha ou complemente somente as informações solicitadas. Este mesmo link continuará válido durante toda a assistência.
            </p>
          </div>

          {data.activities.length === 0 ? (
            <div className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
              Não há informações pendentes para você neste momento. As próximas atualizações aparecerão aqui automaticamente.
            </div>
          ) : (
            data.activities.map((activity) => {
              const clientQuestions = activity.questions.filter((question) => question.quemResponde === "cliente" || question.quemResponde === "ambos");
              return (
                <div key={activity.id} className="rounded-xl border bg-background p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{activity.title}</h3>
                        {activity.status === "concluida" && <Badge variant="secondary">Concluída</Badge>}
                        {activity.required && activity.status !== "concluida" && <Badge variant="outline">Obrigatória</Badge>}
                      </div>
                      {activity.description && <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>}
                    </div>
                  </div>

                  {activity.questions.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {activity.questions.map((question) => {
                        const canEdit = question.quemResponde === "cliente" || question.quemResponde === "ambos";
                        const value = drafts[activity.id]?.[question.id] ?? "";
                        return (
                          <div key={question.id} className="space-y-1.5">
                            <label className="text-sm font-medium">
                              {question.texto}
                              {question.obrigatoria && <span className="ml-1 text-destructive">*</span>}
                            </label>
                            {!canEdit ? (
                              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                                {inputValue(question.answer) || "Aguardando preenchimento pela equipe"}
                              </div>
                            ) : question.tipo === "texto_longo" ? (
                              <Textarea
                                value={inputValue(value)}
                                disabled={activity.status === "concluida" && question.editavelDepois === false}
                                onChange={(event) => setDrafts((current) => ({
                                  ...current,
                                  [activity.id]: { ...(current[activity.id] ?? {}), [question.id]: event.target.value },
                                }))}
                              />
                            ) : question.tipo === "sim_nao" ? (
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={inputValue(value)}
                                onChange={(event) => setDrafts((current) => ({
                                  ...current,
                                  [activity.id]: { ...(current[activity.id] ?? {}), [question.id]: event.target.value === "sim" },
                                }))}
                              >
                                <option value="">Selecione</option>
                                <option value="sim">Sim</option>
                                <option value="nao">Não</option>
                              </select>
                            ) : question.tipo === "opcoes" ? (
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={inputValue(value)}
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
                                value={inputValue(value)}
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
                                {(question.evidence ?? []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {(question.evidence ?? []).map((item) => (
                                      <Badge key={item.id} variant="secondary" className="max-w-full truncate">
                                        {item.name}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {canEdit && (
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
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {clientQuestions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingId === activity.id}
                        onClick={() => void saveActivity(activity, false)}
                      >
                        {savingId === activity.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar informações
                      </Button>
                      {activity.status !== "concluida" && (
                        <Button
                          size="sm"
                          disabled={savingId === activity.id}
                          onClick={() => void saveActivity(activity, true)}
                        >
                          {savingId === activity.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          Enviar e concluir
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        {data.timeline.length > 0 && (
          <section className="rounded-xl border bg-background p-4 shadow-sm">
            <h2 className="text-base font-semibold">Atualizações</h2>
            <div className="mt-3 space-y-2">
              {[...data.timeline].reverse().slice(0, 30).map((entry, index) => (
                <div key={`${entry.at || index}-${index}`} className="border-l-2 pl-3">
                  <p className="text-sm">{entry.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.at ? new Date(entry.at).toLocaleString("pt-BR") : ""}
                    {entry.userName ? ` · ${entry.userName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
