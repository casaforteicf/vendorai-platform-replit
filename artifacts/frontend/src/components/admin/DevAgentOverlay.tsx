import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Bug,
  CheckCircle2,
  Clock3,
  Code2,
  ExternalLink,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type DevStatus = "analisando" | "diagnosticado" | "github_task" | "erro";
type DevRequest = {
  id: string;
  text: string;
  route: string;
  createdAt: string;
  status: DevStatus;
  diagnosis?: string;
  issueNumber?: number;
  issueUrl?: string;
};

type CachedUser = { platformRole?: string | null; name?: string | null; email?: string | null };

const STORAGE_MESSAGES = "vendorai_dev_ia_messages_v1";
const STORAGE_REQUESTS = "vendorai_dev_ia_requests_v1";

const DEV_BOOTSTRAP = `MODO DEV IA DO SUPER ADMIN.
Você é o desenvolvedor residente da plataforma VendorAI.
Responda em português brasileiro e aja como engenheiro responsável pela plataforma.
Regras permanentes: preservar arquitetura e fluxos existentes; não criar módulos paralelos sem necessidade; diagnosticar antes de alterar; preferir a menor correção segura; separar diagnóstico, mudança proposta, risco e validação; mudanças destrutivas, financeiras, autenticação, exclusão de dados, migrações críticas, permissões globais ou infraestrutura exigem aprovação explícita do Super Admin; nunca afirmar que algo foi corrigido sem evidência de alteração, teste e deploy.
Quando eu disser "esta tela", "aqui" ou "isso", use a rota atual enviada no contexto.`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function quickPrompt(label: string, route: string) {
  if (label === "Auditar esta tela") return `Audite a tela atual (${route}). Procure inconsistências de UX, bugs prováveis, duplicidades e riscos técnicos. Priorize correções pequenas e seguras.`;
  if (label === "Reportar bug") return `Tenho um bug na tela atual (${route}). Diagnostique a causa provável e organize a menor correção possível.`;
  return `Quero melhorar a tela atual (${route}). Analise o fluxo existente e proponha melhorias sem criar módulos paralelos.`;
}

function statusLabel(status: DevStatus) {
  if (status === "analisando") return "Analisando";
  if (status === "diagnosticado") return "Diagnosticado";
  if (status === "github_task") return "Tarefa criada";
  return "Falhou";
}

function shortTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= 92 ? normalized : `${normalized.slice(0, 89)}...`;
}

export default function DevAgentOverlay() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "history">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(() => readJson(STORAGE_MESSAGES, []));
  const [requests, setRequests] = useState<DevRequest[]>(() => readJson(STORAGE_REQUESTS, []));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const user = useMemo(() => readJson<CachedUser | null>("vendorai_user_cache", null), [open]);
  const isSuperAdmin = user?.platformRole === "super_admin";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  useEffect(() => {
    localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_REQUESTS, JSON.stringify(requests.slice(0, 100)));
  }, [requests]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, tab]);

  if (!isSuperAdmin) return null;

  function clearHistory() {
    setMessages([]);
    setRequests([]);
    localStorage.removeItem(STORAGE_MESSAGES);
    localStorage.removeItem(STORAGE_REQUESTS);
  }

  async function createGithubTask(request: DevRequest) {
    if (!request.diagnosis || creatingTaskId) return;
    setCreatingTaskId(request.id);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch("/api/support/dev/github-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requestId: request.id,
          title: shortTitle(request.text),
          request: request.text,
          diagnosis: request.diagnosis,
          route: request.route,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? `Falha ao criar tarefa (${response.status})`);

      setRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, status: "github_task", issueNumber: data.issueNumber, issueUrl: data.issueUrl }
        : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setMessages((current) => [...current, { role: "assistant", content: `Não consegui criar a tarefa no GitHub: ${message}` }]);
      setTab("chat");
    } finally {
      setCreatingTaskId(null);
    }
  }

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;

    const requestId = crypto.randomUUID();
    const route = `${window.location.pathname}${window.location.search}`;
    const prior = messages;
    setRequests((current) => [{ id: requestId, text, route, createdAt: new Date().toISOString(), status: "analisando" }, ...current].slice(0, 100));
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const token = localStorage.getItem("vendorai_token");
      const contextMessage: ChatMessage = {
        role: "user",
        content: `${DEV_BOOTSTRAP}\n\nCONTEXTO ATUAL:\n- rota: ${route}\n- usuário: Super Admin\n- requestId: ${requestId}\n\nPEDIDO:\n${text}`,
      };
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: [contextMessage, ...prior.slice(-10)] }),
      });
      if (!response.ok || !response.body) throw new Error(`Falha no Dev IA (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (typeof data?.content !== "string") continue;
            assistant += data.content;
            setMessages((current) => {
              const next = [...current];
              if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = { role: "assistant", content: assistant };
              return next;
            });
          } catch {
            // ignora frames SSE auxiliares
          }
        }
      }

      if (!assistant.trim()) throw new Error("Resposta vazia do serviço de IA");
      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, status: "diagnosticado", diagnosis: assistant } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, status: "erro" } : item));
      setMessages((current) => [...current, { role: "assistant", content: `Não consegui concluir a análise: ${message}.` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-[1.02]" aria-label="Abrir Dev IA">
        <Code2 className="h-4 w-4" /> Dev IA <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-end bg-black/20 p-0 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section className="flex h-[92vh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[82vh] sm:max-w-[580px] sm:rounded-2xl sm:border">
            <header className="border-b bg-slate-950 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold"><Bot className="h-5 w-5" /> Dev IA · Engenharia</div>
                  <p className="mt-1 text-xs text-slate-300">Desenvolvedor residente · contexto: {pathname}</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Fechar"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-200">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1"><ShieldCheck className="h-3 w-3" /> crítico exige aprovação</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1"><GitBranch className="h-3 w-3" /> GitHub via tarefa controlada</span>
              </div>
            </header>

            <div className="flex items-center gap-1 border-b bg-white px-3 py-2">
              <button onClick={() => setTab("chat")} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${tab === "chat" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><MessageSquare className="h-3.5 w-3.5" /> Conversa</button>
              <button onClick={() => setTab("history")} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${tab === "history" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><History className="h-3.5 w-3.5" /> Histórico {requests.length ? `(${requests.length})` : ""}</button>
              <button onClick={clearHistory} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Limpar histórico"><RotateCcw className="h-3.5 w-3.5" /></button>
            </div>

            {tab === "chat" ? (
              <>
                <div className="border-b bg-slate-50 px-4 py-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {["Auditar esta tela", "Reportar bug", "Melhorar esta tela"].map((label) => (
                      <button key={label} onClick={() => sendMessage(quickPrompt(label, pathname))} disabled={sending} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                        {label === "Reportar bug" ? <Bug className="mr-1 inline h-3 w-3" /> : <Sparkles className="mr-1 inline h-3 w-3" />}{label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                  {messages.length === 0 && <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700 shadow-sm"><p className="font-semibold text-slate-900">Fale comigo como fala com seu desenvolvedor.</p><p className="mt-2">A rota atual entra automaticamente. Depois do diagnóstico, você pode transformar o pedido em tarefa real no GitHub pela aba Histórico.</p></div>}
                  {messages.map((message, index) => (
                    <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-slate-950 text-white" : "border bg-white text-slate-800 shadow-sm"}`}>
                        {message.content || (sending && index === messages.length - 1 ? <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> analisando...</span> : "")}
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <form className="border-t bg-white p-3" onSubmit={(e) => { e.preventDefault(); void sendMessage(input); }}>
                  <div className="flex items-end gap-2 rounded-2xl border bg-slate-50 p-2 focus-within:border-slate-400">
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }} rows={2} placeholder="Fale o que quer corrigir, melhorar ou construir..." className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" />
                    <button type="submit" disabled={!input.trim() || sending} className="rounded-xl bg-slate-950 p-2.5 text-white disabled:opacity-40" aria-label="Enviar">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                  </div>
                  <p className="mt-2 px-1 text-[10px] text-slate-500">Diagnóstico não altera código. A execução começa ao criar uma tarefa técnica controlada.</p>
                </form>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4">
                {requests.length === 0 ? <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Nenhum pedido técnico registrado.</div> : (
                  <div className="space-y-3">
                    {requests.map((request) => (
                      <article key={request.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium text-slate-900">{request.text}</p><p className="mt-1 truncate text-[11px] text-slate-500">{request.route}</p></div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">{statusLabel(request.status)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" /> {new Date(request.createdAt).toLocaleString("pt-BR")}</div>
                        {request.diagnosis && <p className="mt-3 line-clamp-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{request.diagnosis}</p>}
                        {request.status === "diagnosticado" && request.diagnosis && (
                          <button onClick={() => void createGithubTask(request)} disabled={creatingTaskId === request.id} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                            {creatingTaskId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />} Criar tarefa no GitHub
                          </button>
                        )}
                        {request.issueUrl && (
                          <a href={request.issueUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CheckCircle2 className="h-3.5 w-3.5" /> Issue #{request.issueNumber} <ExternalLink className="h-3 w-3" /></a>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
