import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Globe2,
  Hand,
  KeyRound,
  Keyboard,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Connection = {
  id: string;
  name: string;
  startUrl: string;
  allowedHosts: string[];
  loginConfigured: boolean;
  passcodeConfigured: boolean;
  hasPersistentSession: boolean;
  lastUsedAt: string | null;
};

type LiveSession = {
  id: string;
  connectionId: string | null;
  status: "idle" | "running" | "paused" | "completed" | "error" | "closed";
  goal: string | null;
  answer: string | null;
  error: string | null;
  url: string;
  title: string | null;
  screenshotDataUrl?: string;
  pauseReason: "manual" | "human_verification" | "approval_required" | null;
  steps: Array<{ index: number; action: string; url: string; detail?: string }>;
};

function headers() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchConnections(): Promise<Connection[]> {
  const res = await fetch("/api/browser-agent/connections", { headers: headers() });
  if (!res.ok) throw new Error("Não foi possível carregar as conexões");
  return res.json();
}

async function fetchLiveScreenshot(sessionId: string, handoffToken?: string): Promise<LiveSession> {
  const endpoint = handoffToken
    ? `/api/browser-agent/handoff/${sessionId}/screenshot?handoff=${encodeURIComponent(handoffToken)}`
    : `/api/browser-agent/live/${sessionId}/screenshot`;
  const res = await fetch(endpoint, { headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Sessão ao vivo indisponível");
  return body;
}

export default function BrowserAgentPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [login, setLogin] = useState("");
  const [passcode, setPasscode] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [goal, setGoal] = useState("");
  const [allowWrite, setAllowWrite] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState(() => new URLSearchParams(window.location.search).get("browserSession") || sessionStorage.getItem("vendi_live_session") || "");
  const [handoffToken, setHandoffToken] = useState(() => new URLSearchParams(window.location.search).get("handoff") || sessionStorage.getItem("vendi_live_handoff") || "");
  const [requestedManual, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["browser-agent-connections"],
    queryFn: fetchConnections,
  });

  const { data: liveSession, error: liveError } = useQuery<LiveSession>({
    queryKey: ["browser-agent-live", liveSessionId],
    queryFn: () => fetchLiveScreenshot(liveSessionId, handoffToken || undefined),
    enabled: Boolean(liveSessionId),
    refetchInterval: (query) => {
      const status = (query.state.data as LiveSession | undefined)?.status;
      return status === "closed" ? false : 1200;
    },
    retry: 1,
  });

  const manualMode = requestedManual || liveSession?.status === "paused";
  const humanVerification = liveSession?.status === "paused" && liveSession.pauseReason === "human_verification";
  useEffect(() => {
    if (liveSessionId) sessionStorage.setItem("vendi_live_session", liveSessionId);
    else sessionStorage.removeItem("vendi_live_session");
    if (handoffToken) sessionStorage.setItem("vendi_live_handoff", handoffToken);
    else sessionStorage.removeItem("vendi_live_handoff");
  }, [liveSessionId, handoffToken]);

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId) ?? connections[0] ?? null,
    [connections, selectedId],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/browser-agent/connections", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name, startUrl, login: login || undefined, passcode: passcode || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível salvar a conexão");
      return body as Connection;
    },
    onSuccess: (connection) => {
      setSelectedId(connection.id);
      setName("");
      setStartUrl("");
      setLogin("");
      setPasscode("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["browser-agent-connections"] });
      toast({ title: "Conexão salva", description: "O acesso ficou protegido no cofre do Vendor.ai." });
    },
    onError: (error: Error) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/browser-agent/connections/${id}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error("Não foi possível remover a conexão");
    },
    onSuccess: () => {
      setSelectedId("");
      void queryClient.invalidateQueries({ queryKey: ["browser-agent-connections"] });
    },
  });

  const startLiveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Cadastre ou selecione uma conexão");
      const createRes = await fetch("/api/browser-agent/live", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ connectionId: selected.id, allowWrite }),
      });
      const session = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(session?.error ?? "Não foi possível abrir a sessão");

      setLiveSessionId(session.id);
      const missionRes = await fetch(`/api/browser-agent/live/${session.id}/mission`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ goal, maxSteps: 24 }),
      });
      const mission = await missionRes.json().catch(() => ({}));
      if (!missionRes.ok) throw new Error(mission?.error ?? "Não foi possível iniciar a missão");
      return mission as LiveSession;
    },
    onSuccess: (session) => {
      setLiveSessionId(session.id);
      setManualMode(false);
      toast({ title: "Missão iniciada", description: "Você pode acompanhar a navegação em tempo real." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível iniciar", description: error.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!liveSessionId) return;
      const base = handoffToken ? `/api/browser-agent/handoff/${liveSessionId}/pause?handoff=${encodeURIComponent(handoffToken)}` : `/api/browser-agent/live/${liveSessionId}/pause`;
      const res = await fetch(base, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ paused }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível alterar o controle");
      return body as LiveSession;
    },
    onSuccess: (_data, paused) => {
      setManualMode(paused);
      void queryClient.invalidateQueries({ queryKey: ["browser-agent-live", liveSessionId] });
    },
    onError: (error: Error) => toast({ title: "Retomada do Vendi", description: error.message, variant: "destructive" }),
  });

  const controlMutation = useMutation({
    mutationFn: async (command: Record<string, unknown>) => {
      if (!liveSessionId) throw new Error("Sessão não iniciada");
      const base = handoffToken ? `/api/browser-agent/handoff/${liveSessionId}/control?handoff=${encodeURIComponent(handoffToken)}` : `/api/browser-agent/live/${liveSessionId}/control`;
      const res = await fetch(base, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(command),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Controle manual falhou");
      return body as LiveSession;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["browser-agent-live", liveSessionId] }),
    onError: (error: Error) => toast({ title: "Controle manual", description: error.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!liveSessionId) return;
      const base = handoffToken ? `/api/browser-agent/handoff/${liveSessionId}?handoff=${encodeURIComponent(handoffToken)}` : `/api/browser-agent/live/${liveSessionId}`;
      const res = await fetch(base, { method: "DELETE", headers: headers() });
      if (!res.ok && res.status !== 404) throw new Error("Não foi possível encerrar a sessão");
    },
    onSuccess: () => {
      setLiveSessionId("");
      setHandoffToken("");
      setManualMode(false);
      setManualText("");
      setManualUrl("");
      const url = new URL(window.location.href);
      url.searchParams.delete("browserSession");
      url.searchParams.delete("handoff");
      window.history.replaceState(null, "", url);
    },
    onError: (error: Error) => toast({ title: "Sessão", description: error.message, variant: "destructive" }),
  });

  function handleScreenshotClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!manualMode || pauseMutation.isPending || controlMutation.isPending || !liveSession?.screenshotDataUrl) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const naturalWidth = event.currentTarget.naturalWidth || 1365;
    const naturalHeight = event.currentTarget.naturalHeight || 768;
    const x = ((event.clientX - rect.left) / rect.width) * naturalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * naturalHeight;
    controlMutation.mutate({ action: "click", x, y });
  }

  const liveStatusLabel: Record<LiveSession["status"], string> = {
    idle: "Aguardando missão",
    running: "Agente navegando",
    paused: "Pausado",
    completed: "Concluído",
    error: "Erro",
    closed: "Encerrado",
  };

  return (
    <Card className="mt-4 overflow-hidden border-primary/20">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Vendi — Agente Navegador</h3>
              <Badge variant="secondary">Browser Agent</Badge>
              {liveSession && <Badge variant="outline">{liveStatusLabel[liveSession.status]}</Badge>}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Os agentes do Vendor.ai podem acessar portais e sistemas web. Você acompanha a tela ao vivo e pode assumir o controle quando precisar.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Segredos não passam pela IA</span>
              <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" />Sessão persistente por tenant</span>
              <span className="inline-flex items-center gap-1"><Hand className="h-3.5 w-3.5" />Controle manual assistido</span>
            </div>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Plus className="mr-1.5 h-4 w-4" />Nova conexão</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Conectar sistema ao Agente Navegador</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal do fornecedor" /></div>
              <div><Label>URL inicial</Label><Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://portal.exemplo.com" /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Login</Label><Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" /></div>
                <div><Label>Chave de acesso</Label><Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="new-password" /></div>
              </div>
              <p className="text-xs text-muted-foreground">O segredo é criptografado no backend e nunca é devolvido pela API.</p>
              <Button className="w-full" disabled={!name || !startUrl || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar conexão
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 border-t p-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Label>Sistema conectado</Label>
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId} disabled={Boolean(liveSessionId)}>
            <SelectTrigger><SelectValue placeholder={isLoading ? "Carregando..." : "Selecionar conexão"} /></SelectTrigger>
            <SelectContent>
              {connections.map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>{connection.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selected && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs">
              <p className="truncate font-medium">{selected.startUrl}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{selected.loginConfigured ? "Login salvo" : "Sem login"}</Badge>
                <Badge variant="outline">{selected.hasPersistentSession ? "Sessão salva" : "Nova sessão"}</Badge>
              </div>
              {!liveSessionId && (
                <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-destructive" onClick={() => deleteMutation.mutate(selected.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
                </Button>
              )}
            </div>
          )}

          {liveSession && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs">
              <p className="font-medium">Sessão ativa</p>
              <p className="mt-1 truncate text-muted-foreground">{liveSession.title || liveSession.url}</p>
              <p className="mt-1 truncate text-muted-foreground">{liveSession.url}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!liveSessionId ? (
            <>
              <div>
                <Label>Missão</Label>
                <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="Ex.: entre no portal, localize o pedido 123 e informe o prazo de entrega." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />
                Autorizar alterações no sistema externo nesta execução
              </label>
              <Button disabled={!selected || !goal.trim() || startLiveMutation.isPending} onClick={() => startLiveMutation.mutate()}>
                {startLiveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Executar e acompanhar ao vivo
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {!manualMode ? (
                  <Button variant="outline" onClick={() => pauseMutation.mutate(true)} disabled={pauseMutation.isPending || Boolean(liveError)}>
                    <Pause className="mr-2 h-4 w-4" />Assumir controle
                  </Button>
                ) : (
                  <Button onClick={() => pauseMutation.mutate(false)} disabled={pauseMutation.isPending || controlMutation.isPending || liveSession?.status !== "paused"}>
                    <Bot className="mr-2 h-4 w-4" />{humanVerification ? "Concluir verificação e devolver ao Vendi" : "Devolver para IA"}
                  </Button>
                )}
                <Button variant="outline" size="icon" onClick={() => controlMutation.mutate({ action: "back" })} disabled={!manualMode}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => controlMutation.mutate({ action: "reload" })} disabled={!manualMode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="destructive" className="ml-auto" onClick={() => closeMutation.mutate()}>
                  <Square className="mr-2 h-4 w-4" />Encerrar sessão
                </Button>
              </div>

              {liveError && <p role="alert" className="text-sm text-destructive">{liveError.message}. Encerre esta sessão e abra uma nova.</p>}
              {liveSession?.status === "paused" && (
                <p role="status" className="rounded-lg border p-3 text-sm">
                  {humanVerification
                    ? "Verificação humana necessária. Resolva o CAPTCHA/2FA na tela abaixo e depois devolva o controle ao Vendi. Ele continuará a mesma missão do ponto onde parou."
                    : liveSession.pauseReason === "approval_required"
                      ? "A missão chegou a uma ação protegida. Revise a tela antes de devolver o controle ao Vendi."
                      : "O Vendi está pausado. Você pode controlar a sessão manualmente e depois devolver para a IA."}
                </p>
              )}
              <div className="overflow-hidden rounded-xl border bg-black">
                {liveSession?.screenshotDataUrl ? (
                  <img
                    src={liveSession.screenshotDataUrl}
                    alt="Tela ao vivo do Agente Navegador"
                    className={`block w-full select-none ${manualMode ? "cursor-crosshair" : "cursor-default"}`}
                    draggable={false}
                    onClick={handleScreenshotClick}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-white/70">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />Conectando à sessão...
                  </div>
                )}
              </div>

              {manualMode && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Hand className="h-4 w-4" />Controle manual ativo
                  </div>
                  <p className="text-xs text-muted-foreground">Clique diretamente na imagem para interagir com a página. O agente permanece pausado.</p>
                  <div className="flex gap-2">
                    <Input value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="Texto para digitar no campo focado" />
                    <Button
                      variant="outline"
                      disabled={!manualText || controlMutation.isPending}
                      onClick={() => {
                        controlMutation.mutate({ action: "type", text: manualText });
                        setManualText("");
                      }}
                    >
                      <Keyboard className="mr-2 h-4 w-4" />Digitar
                    </Button>
                    <Button variant="outline" onClick={() => controlMutation.mutate({ action: "key", key: "Enter" })}>Enter</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://..." />
                    <Button
                      variant="outline"
                      disabled={!manualUrl}
                      onClick={() => controlMutation.mutate({ action: "navigate", url: manualUrl })}
                    >
                      Ir
                    </Button>
                  </div>
                </div>
              )}

              {(liveSession?.answer || liveSession?.error) && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <p className="font-medium">{liveSession.error ? "Missão interrompida" : "Resultado"}</p>
                  </div>
                  <p className="mt-2 text-sm">{liveSession.error || liveSession.answer}</p>
                </div>
              )}

              {liveSession?.steps?.length ? (
                <div className="max-h-52 overflow-auto rounded-lg border p-3 text-xs">
                  {liveSession.steps.slice().reverse().map((step) => (
                    <div key={`${step.index}-${step.action}`} className="flex gap-2 border-t py-1.5 first:border-0">
                      <span className="font-mono">{step.index}.</span>
                      <span className="font-medium">{step.action}</span>
                      <span className="truncate text-muted-foreground">{step.detail || step.url}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

