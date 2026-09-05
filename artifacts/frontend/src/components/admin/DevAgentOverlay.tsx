import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  Bug,
  CheckCircle2,
  Clock3,
  Code2,
  ExternalLink,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type DevStatus = "analisando" | "diagnosticado" | "executando" | "concluido" | "approval_required" | "github_task" | "erro";
type Cognition = {
  intent: "conversation" | "question" | "diagnose" | "audit" | "improve" | "build" | "execute";
  shouldExecute: boolean;
  shouldInspectCode: boolean;
  needsApproval: boolean;
  risk: "low" | "medium" | "high" | "critical";
  confidence: number;
  cognitiveEffort: number;
  objective: string;
  reasoningSummary: string;
  investigationPlan: string[];
  executionDirective?: string;
};
type Investigation = {
  summary: string;
  likelyCause: string;
  confidence: number;
  relevantFiles: string[];
  evidence: Array<{ path?: string; finding?: string }>;
  unknowns: string[];
  recommendedNextStep: string;
};
type DevRequest = {
  id: string;
  text: string;
  route: string;
  createdAt: string;
  status: DevStatus;
  diagnosis?: string;
  cognition?: Cognition;
  investigation?: Investigation;
  executionSummary?: string;
  issueNumber?: number;
  issueUrl?: string;
};

type CachedUser = { platformRole?: string | null; name?: string | null; email?: string | null };

const STORAGE_MESSAGES = "vendorai_dev_ia_messages_v1";
const STORAGE_REQUESTS = "vendorai_dev_ia_requests_v1";
const STORAGE_AUTONOMY = "vendorai_dev_ia_autonomy_v1";

const DEV_BOOTSTRAP = `MODO DEV IA DO SUPER ADMIN.
Você é o desenvolvedor residente da plataforma VendorAI.
Responda em português brasileiro e aja como engenheiro responsável pela plataforma.
Preserve arquitetura e fluxos existentes, não crie módulos paralelos sem necessidade, diagnostique antes de alterar e nunca afirme conclusão sem evidência real.
Converse naturalmente quando o pedido for conversa ou dúvida. Não diga que iniciou execução sem evidência real de que o executor foi acionado.
Quando houver INVESTIGAÇÃO REAL DO REPOSITÓRIO no contexto, use-a como evidência primária e diferencie fatos observados de hipóteses.`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* auxiliar */ }
}

function removeStored(key: string) {
  try { localStorage.removeItem(key); } catch { /* auxiliar */ }
}

function fallbackUuid() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function safeRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* fallback abaixo */ }
  return fallbackUuid();
}

function quickPrompt(label: string, route: string) {
  if (label === "Auditar esta tela") return `Audite a tela atual (${route}). Procure inconsistências de UX, bugs prováveis, duplicidades e riscos técnicos. Investigue antes de propor mudanças.`;
  if (label === "Reportar bug") return `Tenho um bug na tela atual (${route}). Diagnostique e, se houver correção clara e de baixo risco, corrija com a menor mudança segura possível.`;
  return `Melhore a tela atual (${route}) sem criar módulos paralelos. Investigue o código relacionado e execute apenas mudanças claras, reversíveis e seguras.`;
}

function statusLabel(status: DevStatus) {
  if (status === "analisando") return "Analisando";
  if (status === "diagnosticado") return "Diagnosticado";
  if (status === "executando") return "Executando";
  if (status === "concluido") return "Concluído";
  if (status === "approval_required") return "Aprovação necessária";
  if (status === "github_task") return "Tarefa criada";
  return "Falhou";
}

function intentLabel(intent?: Cognition["intent"]) {
  if (!intent) return null;
  const labels: Record<Cognition["intent"], string> = {
    conversation: "Conversa",
    question: "Dúvida",
    diagnose: "Diagnóstico",
    audit: "Auditoria",
    improve: "Melhoria",
    build: "Construção",
    execute: "Execução",
  };
  return labels[intent];
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
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [autonomous, setAutonomous] = useState<boolean>(() => readJson(STORAGE_AUTONOMY, true));
  const endRef = useRef<HTMLDivElement | null>(null);

  const user = useMemo(() => readJson<CachedUser | null>("vendorai_user_cache", null), [open]);
  const isSuperAdmin = user?.platformRole === "super_admin";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  useEffect(() => { writeJson(STORAGE_MESSAGES, messages.slice(-100)); }, [messages]);
  useEffect(() => { writeJson(STORAGE_REQUESTS, requests.slice(0, 100)); }, [requests]);
  useEffect(() => { writeJson(STORAGE_AUTONOMY, autonomous); }, [autonomous]);
  useEffect(() => {
    try {
      const element = endRef.current;
      if (element && typeof element.scrollIntoView === "function") element.scrollIntoView({ block: "end" });
    } catch { /* WebView antigo */ }
  }, [messages, sending, tab]);

  if (!isSuperAdmin) return null;

  function authHeaders() {
    let token: string | null = null;
    try { token = localStorage.getItem("vendorai_token"); } catch { token = null; }
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }

  function clearHistory() {
    setMessages([]);
    setRequests([]);
    removeStored(STORAGE_MESSAGES);
    removeStored(STORAGE_REQUESTS);
  }

  async function decide(request: DevRequest, prior: ChatMessage[]): Promise<Cognition | null> {
    try {
      const recentMessages = prior
        .filter((message) => message.content.trim())
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content.slice(0, 12000) }));
      const response = await fetch("/api/support/dev/cognition", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ requestId: request.id, request: request.text, route: request.route, recentMessages }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.cognition) return null;
      return data.cognition as Cognition;
    } catch {
      return null;
    }
  }

  async function investigate(request: DevRequest, cognition: Cognition): Promise<Investigation | null> {
    try {
      const response = await fetch("/api/support/dev/investigate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          requestId: request.id,
          request: request.text,
          route: request.route,
          cognition: {
            intent: cognition.intent,
            objective: cognition.objective,
            risk: cognition.risk,
            cognitiveEffort: cognition.cognitiveEffort,
            investigationPlan: cognition.investigationPlan,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.investigation) return null;
      return data.investigation as Investigation;
    } catch {
      return null;
    }
  }

  async function createGithubTask(request: DevRequest) {
    if (!request.diagnosis || workingId) return;
    setWorkingId(request.id);
    try {
      const response = await fetch("/api/support/dev/github-task", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ requestId: request.id, title: shortTitle(request.text), request: request.text, diagnosis: request.diagnosis, route: request.route }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? `Falha ao criar tarefa (${response.status})`);
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "github_task", issueNumber: data.issueNumber, issueUrl: data.issueUrl } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setMessages((current) => [...current, { role: "assistant", content: `Falha ao criar tarefa no GitHub: ${message}` }]);
      setTab("chat");
    } finally { setWorkingId(null); }
  }

  async function executeRequest(request: DevRequest, diagnosisOverride?: string) {
    const diagnosis = diagnosisOverride ?? request.diagnosis ?? "";
    if (workingId) return;
    setWorkingId(request.id);
    setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "executando", diagnosis } : item));
    setMessages((current) => [...current, { role: "assistant", content: "Cérebro Executivo autorizou execução. Iniciando trabalho técnico no repositório..." }]);

    try {
      const directive = request.cognition?.executionDirective;
      const evidenceContext = request.investigation
        ? `\n\nEVIDÊNCIA DO INVESTIGADOR:\n${JSON.stringify(request.investigation)}`
        : "";
      const executionContext = `${diagnosis}${evidenceContext}${directive ? `\n\nDIRETRIZ DO CÉREBRO EXECUTIVO:\n${directive}` : ""}`;
      const response = await fetch("/api/support/dev/execute", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ requestId: request.id, request: request.text, diagnosis: executionContext, route: request.route }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data?.status === "approval_required") {
        const summary = `A execução chegou a uma ação crítica e foi bloqueada: ${data?.error ?? "aprovação necessária"}.`;
        setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "approval_required", executionSummary: summary } : item));
        setMessages((current) => [...current, { role: "assistant", content: summary }]);
        return;
      }
      if (!response.ok) throw new Error(data?.error ?? `Falha na execução (${response.status})`);
      const summary = data?.summary ?? "Execução finalizada.";
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "concluido", executionSummary: summary } : item));
      setMessages((current) => [...current, { role: "assistant", content: `Execução autônoma:\n${summary}` }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "erro" } : item));
      setMessages((current) => [...current, { role: "assistant", content: `Execução interrompida: ${message}` }]);
    } finally { setWorkingId(null); }
  }

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || sending || workingId) return;

    const requestId = safeRequestId();
    const route = `${window.location.pathname}${window.location.search}`;
    const request: DevRequest = { id: requestId, text, route, createdAt: new Date().toISOString(), status: "analisando" };
    const prior = messages.filter((message) => message.content.trim());
    setRequests((current) => [request, ...current].slice(0, 100));
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const cognition = await decide(request, prior);
      if (!cognition) {
        throw new Error("Cérebro Executivo indisponível; nenhuma ação foi executada");
      }

      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, cognition } : item));

      let investigation: Investigation | null = null;
      if (cognition.shouldInspectCode) {
        investigation = await investigate(request, cognition);
      }

      const enrichedRequest: DevRequest = {
        ...request,
        cognition,
        ...(investigation ? { investigation } : {}),
      };
      setRequests((current) => current.map((item) => item.id === requestId ? enrichedRequest : item));

      const evidenceBlock = investigation
        ? `\n\nINVESTIGAÇÃO REAL DO REPOSITÓRIO:\n${JSON.stringify(investigation)}`
        : "";
      const cognitionBlock = `\n\nDECISÃO DO CÉREBRO EXECUTIVO:\n${JSON.stringify(cognition)}`;
      const contextMessage: ChatMessage = {
        role: "user",
        content: `${DEV_BOOTSTRAP}\n\nCONTEXTO ATUAL:\n- rota: ${route}\n- usuário: Super Admin\n- requestId: ${requestId}\n- modo autônomo: ${autonomous ? "ATIVO" : "DESATIVADO"}${cognitionBlock}${evidenceBlock}\n\nPEDIDO:\n${text}`,
      };
      const response = await fetch("/api/support/dev/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ messages: [...prior.slice(-10), contextMessage] }),
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
          } catch { /* frame auxiliar */ }
        }
      }

      if (!assistant.trim()) throw new Error("Resposta vazia do serviço de IA");
      const diagnosed: DevRequest = {
        ...enrichedRequest,
        status: cognition.needsApproval ? "approval_required" : "diagnosticado",
        diagnosis: assistant,
      };
      setRequests((current) => current.map((item) => item.id === requestId ? diagnosed : item));
      setSending(false);

      if (cognition.needsApproval) {
        setMessages((current) => [...current, { role: "assistant", content: `Ação classificada como ${cognition.risk.toUpperCase()} (esforço cognitivo ${cognition.cognitiveEffort}/10). Não executei automaticamente porque exige aprovação.` }]);
        return;
      }

      if (autonomous && cognition.shouldExecute) {
        await executeRequest(diagnosed, assistant);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setRequests((current) => current.map((item) => item.id === requestId ? { ...item, status: "erro" } : item));
      setMessages((current) => [...current, { role: "assistant", content: `Não consegui concluir a análise: ${message}.` }]);
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:scale-[1.02]" aria-label="Abrir Dev IA">
        <Code2 className="h-4 w-4" /> Dev IA <span className={`h-2 w-2 rounded-full ${autonomous ? "bg-emerald-400" : "bg-amber-400"}`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-end bg-black/20 p-0 sm:p-5">
          <section className="flex h-[92vh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[84vh] sm:max-w-[600px] sm:rounded-2xl sm:border">
            <header className="border-b bg-slate-950 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold"><BrainCircuit className="h-5 w-5" /> Dev IA · Cérebro Executivo</div>
                  <p className="mt-1 text-xs text-slate-300">Engenharia cognitiva residente · {pathname}</p>
                </div>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Fechar"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2">
                <div className="flex items-center gap-2 text-xs"><PlayCircle className="h-4 w-4" /><span className="font-semibold">Autonomia cognitiva</span><span className="text-slate-300">entender → investigar → decidir → executar</span></div>
                <button type="button" onClick={() => setAutonomous((value) => !value)} className={`relative h-6 w-11 rounded-full transition ${autonomous ? "bg-emerald-500" : "bg-slate-600"}`} aria-label="Alternar modo autônomo"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${autonomous ? "left-6" : "left-1"}`} /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-300">
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> risco crítico exige aprovação</span>
                <span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" /> evidência real antes de editar</span>
              </div>
            </header>

            <div className="flex items-center gap-1 border-b bg-white px-3 py-2">
              <button onClick={() => setTab("chat")} className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === "chat" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Conversa</button>
              <button onClick={() => setTab("history")} className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === "history" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><History className="mr-1 inline h-3.5 w-3.5" /> Histórico {requests.length ? `(${requests.length})` : ""}</button>
              <button onClick={clearHistory} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Limpar histórico"><RotateCcw className="h-3.5 w-3.5" /></button>
            </div>

            {tab === "chat" ? (
              <>
                <div className="border-b bg-slate-50 px-4 py-3"><div className="flex gap-2 overflow-x-auto pb-1">{["Auditar esta tela", "Reportar bug", "Melhorar esta tela"].map((label) => <button key={label} onClick={() => void sendMessage(quickPrompt(label, pathname))} disabled={sending || Boolean(workingId)} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50">{label === "Reportar bug" ? <Bug className="mr-1 inline h-3 w-3" /> : <Sparkles className="mr-1 inline h-3 w-3" />}{label}</button>)}</div></div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                  {messages.length === 0 && <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700"><p className="font-semibold text-slate-900">Cérebro Executivo {autonomous ? "ativo" : "em modo consultivo"}.</p><p className="mt-2">Conversa simples não vira execução. Quando o pedido exige evidência, o Investigador lê o código real da rota antes da resposta.</p></div>}
                  {messages.map((message, index) => <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-slate-950 text-white" : "border bg-white text-slate-800"}`}>{message.content || (sending ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> analisando...</span> : "")}</div></div>)}
                  {(sending || workingId) && <div className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />{workingId ? "Dev IA executando trabalho autorizado..." : "Cérebro Executivo classificando e coletando evidências..."}</div>}
                  <div ref={endRef} />
                </div>
                <form className="border-t bg-white p-3" onSubmit={(e) => { e.preventDefault(); void sendMessage(input); }}><div className="flex items-end gap-2 rounded-2xl border bg-slate-50 p-2"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }} rows={2} placeholder="Converse, investigue, audite ou peça uma execução..." className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" /><button type="submit" disabled={!input.trim() || sending || Boolean(workingId)} className="rounded-xl bg-slate-950 p-2.5 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></div></form>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4">
                {requests.length === 0 ? <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Nenhum pedido técnico registrado.</div> : <div className="space-y-3">{requests.map((request) => <article key={request.id} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-sm font-medium text-slate-900">{request.text}</p><p className="mt-1 truncate text-[11px] text-slate-500">{request.route}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">{statusLabel(request.status)}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {new Date(request.createdAt).toLocaleString("pt-BR")}</span>{request.cognition && <><span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{intentLabel(request.cognition.intent)}</span><span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Risco {request.cognition.risk}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Esforço {request.cognition.cognitiveEffort}/10</span><span>{Math.round(request.cognition.confidence * 100)}% confiança</span></>}</div>{request.cognition?.objective && <p className="mt-3 rounded-xl bg-indigo-50/60 p-3 text-xs leading-relaxed text-slate-700"><span className="font-semibold">Objetivo:</span> {request.cognition.objective}</p>}{request.investigation && <div className="mt-3 rounded-xl bg-emerald-50/60 p-3 text-xs leading-relaxed text-slate-700"><p><span className="font-semibold">Investigação:</span> {request.investigation.summary}</p><p className="mt-1"><span className="font-semibold">Causa provável:</span> {request.investigation.likelyCause}</p>{request.investigation.relevantFiles.length > 0 && <p className="mt-1 break-words"><span className="font-semibold">Arquivos:</span> {request.investigation.relevantFiles.join(", ")}</p>}</div>}{request.executionSummary && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{request.executionSummary}</p>}<div className="mt-3 flex flex-wrap gap-2">{request.status === "diagnosticado" && request.diagnosis && !request.cognition?.needsApproval && <button onClick={() => void executeRequest(request)} disabled={Boolean(workingId)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"><PlayCircle className="h-3.5 w-3.5" /> Executar agora</button>}{request.status === "diagnosticado" && request.diagnosis && <button onClick={() => void createGithubTask(request)} disabled={Boolean(workingId)} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700"><GitBranch className="h-3.5 w-3.5" /> Criar tarefa</button>}{request.issueUrl && <a href={request.issueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700"><CheckCircle2 className="h-3.5 w-3.5" /> Issue #{request.issueNumber}<ExternalLink className="h-3 w-3" /></a>}</div></article>)}</div>}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
