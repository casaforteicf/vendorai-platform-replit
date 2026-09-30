import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Globe2, KeyRound, Loader2, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
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

type RunResult = {
  runId?: string;
  ok: boolean;
  finalUrl: string;
  answer: string;
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
  const [result, setResult] = useState<RunResult | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["browser-agent-connections"],
    queryFn: fetchConnections,
  });

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
      setResult(null);
      void queryClient.invalidateQueries({ queryKey: ["browser-agent-connections"] });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Cadastre ou selecione uma conexão");
      const res = await fetch("/api/browser-agent/run", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          connectionId: selected.id,
          goal,
          mode: "assistido",
          allowWrite,
          maxSteps: 18,
          agentName: "browser",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.approvalRequired) {
          throw new Error("O agente encontrou uma ação sensível. Ative a autorização de alterações somente se quiser permitir essa ação.");
        }
        throw new Error(body?.error ?? "Falha ao executar a missão");
      }
      return body as RunResult;
    },
    onSuccess: setResult,
    onError: (error: Error) => toast({ title: "Missão interrompida", description: error.message, variant: "destructive" }),
  });

  return (
    <Card className="mt-4 overflow-hidden border-primary/20">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Agente Navegador</h3>
              <Badge variant="secondary">Browser Agent</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Permite aos agentes do Vendor.ai acessar portais e sistemas web, manter sessão e executar tarefas com auditoria e aprovação para ações sensíveis.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Segredos não passam pela IA</span>
              <span className="inline-flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" />Sessão persistente por tenant</span>
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
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
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
                <Badge variant="outline">{selected.hasPersistentSession ? "Sessão ativa" : "Nova sessão"}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-destructive" onClick={() => deleteMutation.mutate(selected.id)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label>Missão</Label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="Ex.: entre no portal, localize o pedido 123 e informe o prazo de entrega." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />
            Autorizar alterações no sistema externo nesta execução
          </label>
          <Button disabled={!selected || !goal.trim() || runMutation.isPending} onClick={() => runMutation.mutate()}>
            {runMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Executar missão
          </Button>

          {result && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <p className="font-medium">{result.ok ? "Missão concluída" : "Missão incompleta"}</p>
              </div>
              <p className="mt-2 text-sm">{result.answer}</p>
              <div className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                {result.steps.map((step) => (
                  <div key={step.index} className="flex gap-2 border-t py-1.5 first:border-0">
                    <span className="font-mono">{step.index}.</span>
                    <span className="font-medium text-foreground">{step.action}</span>
                    <span className="truncate">{step.detail || step.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
