import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  HelpCircle,
  History,
  Loader2,
  MessageCircle,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Wrench,
} from "lucide-react";

type Mode = "guided" | "assisted" | "automatic";
type Step = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  hardBlocker: boolean;
  canAcknowledge: boolean;
  source: "system" | "manual";
};
type Followup = {
  day: "1" | "3" | "7" | "15" | "30";
  label: string;
  dueAt: string;
  status: "upcoming" | "due" | "completed";
  completedAt: string | null;
};
type ImplementationSnapshot = {
  tenant: { id: string; name: string; segment: string };
  status: "implementing" | "ready" | "live";
  mode: Mode;
  progress: { completed: number; total: number; percent: number };
  plan: Step[];
  nextAction: Step | null;
  readiness: {
    ready: boolean;
    score: number;
    hardScore: number;
    blockers: Array<{ id: string; title: string; href: string }>;
  };
  safeActions: Array<{ id: string; label: string; description: string }>;
  timeline: Array<{ id: string; type: string; label: string; at: string }>;
  goLiveAt: string | null;
  followups: Followup[];
  handoffs: {
    customerSuccessAt: string | null;
    devAt: string | null;
    devTicketId: string | null;
  };
};

type AssistantReply = {
  resposta: string;
  progress?: { completed: number; total: number };
  nextAction?: { key: string; label: string; href: string } | null;
};

const COPY = {
  "pt-BR": {
    eyebrow: "Agente de Implantação",
    title: "Coloque sua operação para funcionar com segurança",
    subtitle: "O agente lê o estado real do sistema, mostra o próximo passo e só libera o go-live quando os pontos críticos estiverem prontos.",
    progress: "Progresso real",
    readiness: "Readiness",
    next: "Próxima ação",
    open: "Abrir etapa",
    confirm: "Confirmar teste concluído",
    reopen: "Reabrir teste",
    blockers: "Bloqueios para go-live",
    noBlockers: "Nenhum bloqueio crítico. A operação pode ser liberada.",
    safeActions: "Ações seguras disponíveis",
    runSafe: "Executar ações seguras",
    goLive: "Liberar go-live",
    live: "Operação em go-live",
    followups: "Acompanhamento pós-go-live",
    completeFollowup: "Concluir acompanhamento",
    timeline: "Linha do tempo",
    handoff: "Escalonamento",
    customerSuccess: "Encaminhar para Customer Success",
    dev: "Encaminhar bloqueio técnico para Dev IA",
    assistant: "Fale com o Agente de Implantação",
    assistantPlaceholder: "Ex.: o que falta para eu entrar em operação?",
    send: "Enviar",
    laterTitle: "O que continua podendo ficar para depois",
    laterText: "ERP, estoque avançado, impostos, financeiro completo e automações especiais continuam fora dos bloqueios do go-live quando não são essenciais ao segmento.",
  },
  es: {
    eyebrow: "Agente de Implementación",
    title: "Pon tu operación en marcha con seguridad",
    subtitle: "El agente lee el estado real del sistema, indica el próximo paso y solo habilita el go-live cuando los puntos críticos están listos.",
    progress: "Progreso real",
    readiness: "Readiness",
    next: "Próxima acción",
    open: "Abrir etapa",
    confirm: "Confirmar prueba completada",
    reopen: "Reabrir prueba",
    blockers: "Bloqueos para go-live",
    noBlockers: "No hay bloqueos críticos. La operación puede ser habilitada.",
    safeActions: "Acciones seguras disponibles",
    runSafe: "Ejecutar acciones seguras",
    goLive: "Habilitar go-live",
    live: "Operación en go-live",
    followups: "Seguimiento post go-live",
    completeFollowup: "Completar seguimiento",
    timeline: "Línea de tiempo",
    handoff: "Escalamiento",
    customerSuccess: "Enviar a Customer Success",
    dev: "Enviar bloqueo técnico a Dev IA",
    assistant: "Habla con el Agente de Implementación",
    assistantPlaceholder: "Ej.: ¿qué falta para entrar en operación?",
    send: "Enviar",
    laterTitle: "Qué puede continuar para después",
    laterText: "ERP, inventario avanzado, impuestos, finanzas completas y automatizaciones especiales quedan fuera de los bloqueos de go-live cuando no son esenciales para el segmento.",
  },
} as const;

const MODE_COPY: Record<Mode, { title: string; description: string }> = {
  guided: { title: "Guiado", description: "O agente orienta e você executa cada etapa." },
  assisted: { title: "Assistido", description: "O agente orienta e pode executar ações internas seguras quando você pedir." },
  automatic: { title: "Automático", description: "O agente executa o que for seguro e pausa quando precisar de credencial, decisão humana ou go-live." },
};

function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function GuiaImplantacao() {
  const { locale } = useI18n();
  const [, navigate] = useLocation();
  const content = locale === "pt-BR" ? COPY["pt-BR"] : COPY.es;
  const [snapshot, setSnapshot] = useState<ImplementationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [assistantReply, setAssistantReply] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest<ImplementationSnapshot>("/api/onboarding/implementation");
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a implantação.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(key: string, path: string, body?: unknown, method = "POST") {
    setBusy(key);
    setError(null);
    try {
      const result = await apiRequest<ImplementationSnapshot | { snapshot: ImplementationSnapshot }>(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      setSnapshot("snapshot" in result ? result.snapshot : result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível executar esta ação.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function askAssistant() {
    const message = question.trim();
    if (!message) return;
    setBusy("assistant");
    setError(null);
    try {
      const reply = await apiRequest<AssistantReply>("/api/onboarding/assistant", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setAssistantReply(reply.resposta);
      setQuestion("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o agente.");
    } finally {
      setBusy(null);
    }
  }

  const dueFollowups = useMemo(
    () => snapshot?.followups.filter((item) => item.status === "due").length ?? 0,
    [snapshot?.followups],
  );

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border p-6">
        <p className="font-semibold">Não foi possível abrir o Agente de Implantação.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => void load()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Bot className="h-4 w-4" />{content.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{content.title}</h1>
            <p className="mt-3 text-muted-foreground">{content.subtitle}</p>
            <p className="mt-3 text-xs text-muted-foreground">{snapshot.tenant.name}{snapshot.tenant.segment ? ` · ${snapshot.tenant.segment}` : ""}</p>
          </div>
          <Badge variant="outline" className="w-fit px-3 py-1.5 text-sm">
            {snapshot.status === "live" ? content.live : snapshot.readiness.ready ? "Ready" : "Em implantação"}
          </Badge>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex justify-between text-sm"><span>{content.progress}</span><strong>{snapshot.progress.percent}%</strong></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${snapshot.progress.percent}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{snapshot.progress.completed} de {snapshot.progress.total} etapas verificadas</p>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm"><span>{content.readiness}</span><strong>{snapshot.readiness.hardScore}%</strong></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${snapshot.readiness.hardScore}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{snapshot.readiness.blockers.length} bloqueio(s) crítico(s)</p>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-semibold">Modo de implantação</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(Object.keys(MODE_COPY) as Mode[]).map((mode) => {
            const active = snapshot.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => void mutate(`mode-${mode}`, "/api/onboarding/implementation/mode", { mode }, "PATCH")}
                disabled={busy !== null}
                className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{MODE_COPY[mode].title}</strong>{active && <CheckCircle2 className="h-4 w-4 text-primary" />}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{MODE_COPY[mode].description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {snapshot.nextAction && snapshot.status !== "live" && (
        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{content.next}</p>
            <h2 className="mt-1 font-semibold">{snapshot.nextAction.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{snapshot.nextAction.description}</p>
          </div>
          <Button onClick={() => navigate(snapshot.nextAction!.href)}>{content.open}<ChevronRight className="ml-2 h-4 w-4" /></Button>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="space-y-4">
          {snapshot.plan.map((step, index) => (
            <article key={step.id} className={`rounded-2xl border bg-card p-5 ${step.done ? "border-emerald-200 bg-emerald-50/30" : step.hardBlocker ? "border-amber-200" : ""}`}>
              <div className="flex gap-4">
                <div className="mt-0.5 shrink-0">{step.done ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Circle className="h-6 w-6 text-muted-foreground/40" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">ETAPA {index + 1}</span>
                    {step.hardBlocker && <Badge variant="outline" className="text-[10px]">Go-live</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{step.source === "system" ? "Validada pelo sistema" : "Confirmação humana"}</Badge>
                  </div>
                  <h3 className="mt-2 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate(step.href)}>{content.open}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
                    {step.canAcknowledge && (
                      <Button
                        size="sm"
                        onClick={() => void mutate(`ack-${step.id}`, "/api/onboarding/implementation/acknowledge", { stepId: step.id, done: !step.done })}
                        disabled={busy !== null}
                      >
                        {busy === `ack-${step.id}` && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {step.done ? content.reopen : content.confirm}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="space-y-5">
          <section className={`rounded-2xl border p-5 ${snapshot.readiness.ready ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/20"}`}>
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h2 className="font-semibold">{content.blockers}</h2></div>
            {snapshot.readiness.blockers.length ? (
              <div className="mt-4 space-y-2">
                {snapshot.readiness.blockers.map((blocker) => (
                  <button key={blocker.id} type="button" onClick={() => navigate(blocker.href)} className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left text-sm hover:bg-muted/40">
                    <span>{blocker.title}</span><ChevronRight className="h-4 w-4 shrink-0" />
                  </button>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">{content.noBlockers}</p>}

            <Button
              className="mt-4 w-full"
              disabled={!snapshot.readiness.ready || snapshot.status === "live" || busy !== null}
              onClick={() => void mutate("go-live", "/api/onboarding/implementation/go-live")}
            >
              {busy === "go-live" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {snapshot.status === "live" ? content.live : content.goLive}
            </Button>
          </section>

          {snapshot.safeActions.length > 0 && (
            <section className="rounded-2xl border p-5">
              <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /><h2 className="font-semibold">{content.safeActions}</h2></div>
              <div className="mt-3 space-y-3">
                {snapshot.safeActions.map((action) => <div key={action.id}><p className="text-sm font-medium">{action.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p></div>)}
              </div>
              <Button className="mt-4 w-full" variant="outline" disabled={busy !== null} onClick={() => void mutate("safe", "/api/onboarding/implementation/run-safe-actions")}>
                {busy === "safe" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{content.runSafe}
              </Button>
            </section>
          )}

          <section className="rounded-2xl border p-5">
            <div className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">{content.handoff}</h2></div>
            <div className="mt-4 space-y-2">
              <Button className="w-full justify-start" variant="outline" disabled={!!snapshot.handoffs.customerSuccessAt || busy !== null} onClick={() => void mutate("cs", "/api/onboarding/implementation/handoff", { target: "customer_success" })}>
                <UserRoundCheck className="mr-2 h-4 w-4" />{snapshot.handoffs.customerSuccessAt ? "Customer Success acionado" : content.customerSuccess}
              </Button>
              <Button className="w-full justify-start" variant="outline" disabled={!!snapshot.handoffs.devTicketId || busy !== null} onClick={() => void mutate("dev", "/api/onboarding/implementation/handoff", { target: "dev" })}>
                <Wrench className="mr-2 h-4 w-4" />{snapshot.handoffs.devTicketId ? `Dev IA · ${snapshot.handoffs.devTicketId.slice(0, 8)}` : content.dev}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border p-5 md:p-6">
        <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /><h2 className="font-semibold">{content.assistant}</h2></div>
        {assistantReply && <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm leading-6">{assistantReply}</div>}
        <div className="mt-4 flex gap-2">
          <Input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askAssistant(); }} placeholder={content.assistantPlaceholder} maxLength={2000} />
          <Button onClick={() => void askAssistant()} disabled={!question.trim() || busy !== null} aria-label={content.send}>{busy === "assistant" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </div>
      </section>

      {snapshot.goLiveAt && (
        <section className="rounded-2xl border p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /><h2 className="font-semibold">{content.followups}</h2></div>
            {dueFollowups > 0 && <Badge>{dueFollowups} pendente(s)</Badge>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Go-live: {formatDate(snapshot.goLiveAt, locale)}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {snapshot.followups.map((item) => (
              <div key={item.day} className={`rounded-xl border p-4 ${item.status === "due" ? "border-amber-300 bg-amber-50/40" : item.status === "completed" ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
                <div className="flex items-center justify-between gap-2"><strong>{item.label}</strong>{item.status === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(item.dueAt, locale)}</p>
                {item.status !== "completed" && <Button className="mt-3 h-auto w-full whitespace-normal py-2 text-xs" size="sm" variant="outline" disabled={busy !== null} onClick={() => void mutate(`followup-${item.day}`, `/api/onboarding/implementation/followups/${item.day}/complete`)}>{content.completeFollowup}</Button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border p-5 md:p-6">
        <div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><h2 className="font-semibold">{content.timeline}</h2></div>
        {snapshot.timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">A linha do tempo será criada conforme a implantação avançar.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {[...snapshot.timeline].reverse().slice(0, 12).map((event) => (
              <div key={event.id} className="flex gap-3 border-l-2 pl-4">
                <div className="min-w-0"><p className="text-sm font-medium">{event.label}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(event.at, locale)}</p></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5">
        <h2 className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4" />{content.laterTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{content.laterText}</p>
      </section>
    </div>
  );
}
