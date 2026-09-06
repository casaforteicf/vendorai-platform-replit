import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2, CheckCircle2, ChevronDown, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BugReportResult {
  bugReportId: string;
  protocolo: string;
  status: "aberto" | "em_analise" | "resolvido";
  resolvidoPor: "agente" | "humano" | null;
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

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [bugReport, setBugReport] = useState<BugReportResult | null>(null);
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

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
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Olá. Sou o JARVIS, seu assistente inteligente no VendorAI. Posso orientar sobre o sistema, ajudar com configurações e integrações e acompanhar problemas até a resolução. Você pode falar ou digitar.",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

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

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setBugReport(null);

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
    }
  }, [input, messages, streaming]);

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
    setBugReport(null);
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
                <div className="text-[10px] opacity-80 truncate">Assistente inteligente do VendorAI</div>
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
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="icon"
                variant={listening ? "default" : "outline"}
                className="h-9 w-9 shrink-0"
                onClick={startListening}
                disabled={streaming}
                title={listening ? "Parar de ouvir" : "Falar com JARVIS"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "Estou ouvindo..." : "Fale ou digite para o JARVIS..."}
                className="min-h-[40px] max-h-[120px] resize-none text-sm leading-relaxed py-2 px-3"
                disabled={streaming}
                rows={1}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || streaming}
                title="Enviar"
              >
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              {listening ? "Escutando em português do Brasil" : "Voz ou texto · Enter para enviar · Shift+Enter para nova linha"}
            </p>
          </div>
        </div>
      )}

      <Button
        size="icon"
        className={cn(
          "fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg transition-transform",
          open && "scale-90"
        )}
        onClick={() => setOpen((v) => !v)}
        title="JARVIS"
        aria-label="Abrir JARVIS"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-6 w-6" />}
      </Button>
    </>
  );
}
