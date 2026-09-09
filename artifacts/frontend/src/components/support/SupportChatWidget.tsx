import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2, CheckCircle2, ChevronDown, Mic, MicOff, ShieldCheck, Check, Ban, Play, Paperclip, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface JarvisAttachment {
  name: string;
  mimeType: string;
  content: string;
}

interface BugReportResult {
  bugReportId: string;
  protocolo: string;
  status: "aberto" | "em_analise" | "resolvido";
  resolvidoPor: "agente" | "humano" | null;
}

interface AgentTaskApproval {
  id: string;
  agentName: string;
  actionType: string;
  status: "pendente_aprovacao" | "aprovado" | "executando" | "concluido" | "rejeitado" | "erro";
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

interface JarvisProactiveItem {
  id: string;
  title: string;
  priorityScore: number;
  severity: string;
  confidence: number | null;
  impact: number | null;
  recommendedAction: string | null;
  explicitFinancialImpact?: { amount: number } | null;
  historicalFinancialEstimate?: {
    medianAmount: number;
    sampleSize: number;
    confidence: number;
  } | null;
}

interface JarvisProactivityResponse {
  proactivity: {
    interruptNow: JarvisProactiveItem[];
    briefing: JarvisProactiveItem[];
    silentCount: number;
  };
}

interface JarvisClientAction {
  type: "open_external_url";
  provider?: string;
  uri?: string;
  fallbackUrl: string;
  label?: string;
}

interface BrowserSpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
    };
  };
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

function approvalLabel(task: AgentTaskApproval) {
  const payload = task.payload ?? {};
  if (task.actionType === "aprovacao_desconto") {
    const discount = typeof payload.discountPercent === "number" ? payload.discountPercent : null;
    return discount == null ? "Aprovação de desconto" : `Desconto de ${discount}%`;
  }
  if (task.actionType === "aprovacao_fechamento") return "Fechamento de negócio";
  if (task.actionType === "conferencia_estoque") return "Conferência de estoque";
  if (task.actionType === "enviar_whatsapp") return "Envio de mensagem WhatsApp";
  return task.actionType.replace(/_/g, " ");
}

function approvalRiskLevel(actionType: string) {
  if (["enviar_whatsapp", "aprovacao_fechamento", "aprovacao_desconto"].includes(actionType)) return 3;
  if (taskActionIsStock(actionType)) return 2;
  return 2;
}

function taskActionIsStock(actionType: string) {
  return actionType === "conferencia_estoque";
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function defaultGreeting() {
  return "Olá. Sou o JARVIS, seu Agente Mestre no VendorAI. Posso analisar o negócio, orientar o uso do sistema, mostrar prioridades e acompanhar ações que precisam da sua aprovação. Você pode falar, digitar ou anexar documentos e imagens.";
}

function buildProactiveGreeting(data: JarvisProactivityResponse) {
  const urgent = data.proactivity.interruptNow ?? [];
  const briefing = data.proactivity.briefing ?? [];

  if (urgent.length) {
    const lines = [
      `Tenho ${urgent.length === 1 ? "1 ponto que merece sua atenção agora" : `${urgent.length} pontos que merecem sua atenção agora`}:`,
    ];
    urgent.slice(0, 3).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title} — prioridade ${item.priorityScore}/100.`);
      if (item.explicitFinancialImpact?.amount != null) {
        lines.push(`   Impacto financeiro atual informado: ${formatBrl(item.explicitFinancialImpact.amount)}.`);
      } else if (item.historicalFinancialEstimate) {
        lines.push(
          `   Precedente histórico do tenant: mediana ${formatBrl(item.historicalFinancialEstimate.medianAmount)} em ${item.historicalFinancialEstimate.sampleSize} casos, confiança ${item.historicalFinancialEstimate.confidence}%.`,
        );
      }
      if (item.recommendedAction) lines.push(`   Próxima ação sugerida: ${item.recommendedAction}`);
    });
    lines.push("Posso detalhar qualquer um deles antes de você decidir o que fazer.");
    return lines.join("\n");
  }

  if (briefing.length) {
    const lines = [
      "Não encontrei nada que justifique interromper você agora.",
      `Tenho ${briefing.length === 1 ? "1 ponto" : `${briefing.length} pontos`} para o próximo briefing:`,
    ];
    briefing.slice(0, 5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title} — prioridade ${item.priorityScore}/100.`);
    });
    lines.push("Se quiser, eu abro o mais importante primeiro.");
    return lines.join("\n");
  }

  return "Não encontrei nenhuma prioridade que justifique interromper você agora. Continuo acompanhando os sinais do negócio e posso analisar qualquer área que você quiser.";
}

export function SupportChatWidget() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState<JarvisAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [bugReport, setBugReport] = useState<BugReportResult | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<AgentTaskApproval[]>([]);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [externalActionFallback, setExternalActionFallback] = useState<JarvisClientAction | null>(null);
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const loadApprovalQueue = useCallback(async () => {
    if (!tenantId) {
      setApprovalQueue([]);
      return;
    }

    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-tasks`);
      if (!res.ok) return;
      const rows = (await res.json()) as AgentTaskApproval[];
      const queue = rows
        .filter((task) => task.status === "pendente_aprovacao" || task.status === "aprovado")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);
      setApprovalQueue(queue);
    } catch {
      // A fila é auxiliar e nunca deve bloquear a conversa com o JARVIS.
    }
  }, [tenantId]);

  const loadProactiveGreeting = useCallback(async () => {
    if (!tenantId) {
      setMessages((current) => current.length ? current : [{ role: "assistant", content: defaultGreeting() }]);
      return;
    }

    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch("/api/jarvis/proactivity", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Falha ao carregar prioridades proativas");
      const data = await res.json() as JarvisProactivityResponse;
      setMessages((current) => current.length
        ? current
        : [{ role: "assistant", content: buildProactiveGreeting(data) }]);
    } catch {
      setMessages((current) => current.length ? current : [{ role: "assistant", content: defaultGreeting() }]);
    }
  }, [tenantId]);

  useEffect(() => {
    const openFromHelp = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      const question = detail?.question?.trim();
      setOpen(true);
      if (question) setInput(`Preciso de ajuda com: ${question}`);
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener("vendorai:open-support", openFromHelp);
    return () => window.removeEventListener("vendorai:open-support", openFromHelp);
  }, []);

  useEffect(() => {
    if (open) void loadApprovalQueue();
  }, [open, loadApprovalQueue]);

  useEffect(() => {
    if (open && messages.length === 0) void loadProactiveGreeting();
  }, [open, messages.length, loadProactiveGreeting]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, externalActionFallback]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }

    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionImpl = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "A entrada por voz não está disponível neste navegador. Você ainda pode conversar comigo por texto.",
        },
      ]);
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setInput((current) => (current ? `${current} ${transcript}` : transcript));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening, stopListening]);

  const handleFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingAttachment || attachments.length >= 3) return;

    setUploadingAttachment(true);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheets = workbook.SheetNames.slice(0, 6).map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return `### Aba: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
        });
        setAttachments((current) => [
          ...current,
          {
            name: file.name,
            mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            content: `[Planilha Excel: \"${file.name}\"]\n${sheets.join("\n\n").slice(0, 16000)}`,
          },
        ]);
        return;
      }

      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch("/api/support/file/interpret", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const result = await res.json() as JarvisAttachment & { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Não foi possível interpretar o arquivo.");
      setAttachments((current) => [...current, result]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Não foi possível interpretar o arquivo anexado.",
        },
      ]);
    } finally {
      setUploadingAttachment(false);
    }
  }, [attachments.length, uploadingAttachment]);

  const runApprovalAction = useCallback(async (
    task: AgentTaskApproval,
    action: "approve" | "reject" | "execute",
  ) => {
    if (!tenantId || approvalBusyId) return;
    setApprovalBusyId(task.id);

    const labels = {
      approve: "aprovada",
      reject: "rejeitada",
      execute: "executada",
    } as const;

    try {
      const res = await fetch(`/api/tenants/${tenantId}/agent-tasks/${task.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json() as AgentTaskApproval & { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Falha ao processar aprovação");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${approvalLabel(task)} ${labels[action]}. Status atual: ${result.status}.`,
        },
      ]);
      await loadApprovalQueue();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Não foi possível processar esta aprovação.",
        },
      ]);
    } finally {
      setApprovalBusyId(null);
    }
  }, [approvalBusyId, loadApprovalQueue, tenantId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim() || (attachments.length ? "Analise o arquivo anexado." : "");
    if (!text || streaming || uploadingAttachment) return;

    const sentAttachments = attachments;
    const userMsg: Message = {
      role: "user",
      content: sentAttachments.length ? `${text}\n\n[Anexo: ${sentAttachments.map((item) => item.name).join(", ")}]` : text,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setBugReport(null);
    setExternalActionFallback(null);

    const token = localStorage.getItem("vendorai_token");
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: newMessages,
          conversationId: conversationIdRef.current,
          attachments: sentAttachments,
          context: {
            route: window.location.pathname,
            title: document.title,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Falha na conexão com o JARVIS");
      }
      setAttachments([]);

      let assistantContent = "";
      const assistantMsg: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              content?: string;
              done?: boolean;
              bugReportId?: string | null;
              protocolo?: string | null;
              status?: "aberto" | "em_analise" | "resolvido";
              resolvidoPor?: "agente" | "humano" | null;
              clientAction?: JarvisClientAction;
              error?: string;
            };

            if (payload.content) {
              assistantContent += payload.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            }

            if (payload.done && payload.bugReportId && payload.protocolo) {
              setBugReport({
                bugReportId: payload.bugReportId,
                protocolo: payload.protocolo,
                status: payload.status ?? "aberto",
                resolvidoPor: payload.resolvidoPor ?? null,
              });
            }

            if (payload.done && payload.clientAction?.type === "open_external_url") {
              const action = payload.clientAction;
              const opened = window.open(action.fallbackUrl, "_blank", "noopener,noreferrer");
              if (!opened) setExternalActionFallback(action);
            }

            if (payload.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: "Ocorreu um erro ao processar sua mensagem. Tente novamente.",
                };
                return updated;
              });
            }
          } catch {
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          return [
            ...prev.slice(0, -1),
            {
              role: "assistant",
              content: "Não foi possível conectar ao JARVIS. Verifique sua conexão e tente novamente.",
            },
          ];
        }
        return prev;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
      void loadApprovalQueue();
    }
  }, [attachments, input, loadApprovalQueue, messages, streaming, uploadingAttachment]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    stopListening();
    setOpen(false);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    stopListening();
    setMessages([]);
    setAttachments([]);
    setBugReport(null);
    setExternalActionFallback(null);
    conversationIdRef.current = crypto.randomUUID();
    setInput("");
    setStreaming(false);
  };

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border border-border bg-background overflow-hidden"
          style={{ height: "clamp(420px, 64vh, 640px)" }}
          aria-label="JARVIS"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary-foreground/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm leading-tight">JARVIS</div>
                <div className="text-[10px] opacity-80 truncate">Agente Mestre do VendorAI</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={handleReset}
                title="Nova conversa"
              >
                <ChevronDown className="h-4 w-4 rotate-180" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={handleClose}
                title="Fechar JARVIS"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {approvalQueue.length > 0 && (
            <div className="shrink-0 border-b border-border bg-muted/30">
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center justify-between text-left"
                onClick={() => setApprovalsOpen((value) => !value)}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Fila de aprovações
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                    {approvalQueue.length}
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", approvalsOpen && "rotate-180")} />
              </button>

              {approvalsOpen && (
                <div className="max-h-48 overflow-y-auto px-3 pb-2 space-y-2">
                  {approvalQueue.map((task) => {
                    const busy = approvalBusyId === task.id;
                    const riskLevel = approvalRiskLevel(task.actionType);
                    return (
                      <div key={task.id} className="rounded-lg border bg-background p-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{approvalLabel(task)}</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {task.agentName} · Nível {riskLevel} · {task.status === "aprovado" ? "aprovado, aguardando execução" : "aguardando decisão"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 flex gap-1.5">
                          {task.status === "pendente_aprovacao" ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={busy}
                                onClick={() => void runApprovalAction(task, "approve")}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 text-xs"
                                disabled={busy}
                                onClick={() => void runApprovalAction(task, "reject")}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Rejeitar
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 w-full text-xs"
                              disabled={busy}
                              onClick={() => void runApprovalAction(task, "execute")}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                              Executar ação aprovada
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.content || (
                    <span className="flex gap-1 items-center text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {externalActionFallback && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-background px-3 py-2 text-sm">
                  <div className="font-medium">Ação externa pronta</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    O navegador bloqueou a abertura automática. Nada foi marcado como executado.
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 h-8 text-xs"
                    onClick={() => window.open(externalActionFallback.fallbackUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Abrir {externalActionFallback.provider ?? "serviço"}
                  </Button>
                </div>
              </div>
            )}

            {bugReport && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-green-50 border border-green-200 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5 text-green-700 font-medium mb-0.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Atendimento registrado
                  </div>
                  <p className="text-green-600 text-xs">
                    Protocolo <strong>{bugReport.protocolo}</strong>.{" "}
                    {bugReport.status === "resolvido" && bugReport.resolvidoPor === "agente"
                      ? "Resolvido pelo JARVIS e disponível no histórico."
                      : bugReport.status === "em_analise"
                        ? "Em análise pela equipe."
                        : "Encaminhado para acompanhamento da equipe."}
                  </p>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="px-3 pb-3 pt-2 shrink-0 border-t border-border">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((attachment, index) => (
                  <span key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[10px]">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="max-w-[240px] truncate">{attachment.name}</span>
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index)}
                      aria-label={`Remover ${attachment.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.docx,.txt,.csv,.md,.xlsx,.xls"
              onChange={(event) => void handleFileSelected(event)}
            />
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || uploadingAttachment || attachments.length >= 3}
                title="Anexar arquivo"
              >
                {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant={listening ? "default" : "outline"}
                className="h-9 w-9 shrink-0"
                onClick={startListening}
                disabled={streaming || uploadingAttachment}
                title={listening ? "Parar de ouvir" : "Falar com JARVIS"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "Estou ouvindo..." : attachments.length ? "Diga o que quer fazer com o arquivo..." : "Fale ou digite para o JARVIS..."}
                className="min-h-[40px] max-h-[120px] resize-none text-sm leading-relaxed py-2 px-3"
                disabled={streaming || uploadingAttachment}
                rows={1}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => void sendMessage()}
                disabled={(!input.trim() && attachments.length === 0) || streaming || uploadingAttachment}
                title="Enviar"
              >
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              {uploadingAttachment
                ? "Interpretando arquivo..."
                : listening
                  ? "Escutando em português do Brasil"
                  : "Voz, texto ou arquivo · PDF, imagem, Word, Excel, CSV e TXT"}
            </p>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-50">
        {approvalQueue.length > 0 && !open && (
          <span className="absolute -right-1 -top-1 z-10 min-w-5 h-5 rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground flex items-center justify-center">
            {approvalQueue.length}
          </span>
        )}
        <Button
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full shadow-lg transition-transform",
            open && "scale-90"
          )}
          onClick={() => setOpen((v) => !v)}
          title="JARVIS"
          aria-label="Abrir JARVIS"
        >
          {open ? <X className="h-5 w-5" /> : <Sparkles className="h-6 w-6" />}
        </Button>
      </div>
    </>
  );
}