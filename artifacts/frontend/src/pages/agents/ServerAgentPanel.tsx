import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Server, Terminal, Loader2, ShieldCheck, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type ServerStatus = {
  configured: boolean;
  host: string | null;
  port: number;
  user: string | null;
  approvalRequiredForWrites: boolean;
};

type ExecutionResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

function headers() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ServerAgentPanel() {
  const { toast } = useToast();
  const [command, setCommand] = useState("cd /home/vendorai/vendorai-platform-replit && git status --short && curl -fsS http://127.0.0.1:5001/api/auth/healthz");
  const [writeMode, setWriteMode] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const statusQuery = useQuery<ServerStatus>({
    queryKey: ["server-agent-status"],
    queryFn: async () => {
      const res = await fetch("/api/server-agent/status", { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Server Agent indisponível");
      return body;
    },
    retry: false,
  });

  const target = useMemo(() => {
    const status = statusQuery.data;
    if (!status?.host) return "Servidor não configurado";
    return `${status.user ?? "user"}@${status.host}:${status.port}`;
  }, [statusQuery.data]);

  const execute = useMutation({
    mutationFn: async () => {
      const approved = !writeMode || window.confirm("Este comando pode alterar o servidor. Autorizar esta execução?");
      if (!approved) throw new Error("Execução cancelada");
      const res = await fetch("/api/server-agent/execute", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          command,
          mode: writeMode ? "write" : "read",
          approved,
          timeoutMs: 120000,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || "Falha ao executar");
      return body as ExecutionResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: data.ok ? "Comando concluído" : "Comando terminou com erro", description: `Exit code: ${data.exitCode ?? "n/a"}` });
    },
    onError: (error: Error) => toast({ title: "Server Agent", description: error.message, variant: "destructive" }),
  });

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Vendi — Agente de Servidor</h3>
              <Badge variant="secondary">Server / Terminal Agent</Badge>
              <Badge variant={statusQuery.data?.configured ? "outline" : "destructive"}>
                {statusQuery.data?.configured ? "Conectado" : "Não configurado"}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Executa diagnósticos, builds, healthchecks e operações controladas no servidor por SSH. Ações de escrita exigem aprovação explícita.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Somente Superadmin</span>
              <span className="inline-flex items-center gap-1"><Terminal className="h-3.5 w-3.5" />{target}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t p-5">
        <div>
          <Label>Comando</Label>
          <Textarea
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            rows={5}
            className="font-mono text-xs"
            placeholder="cd /home/vendorai/vendorai-platform-replit && git status"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={writeMode} onChange={(event) => setWriteMode(event.target.checked)} />
          Permitir alteração no servidor nesta execução
        </label>

        <Button
          disabled={!statusQuery.data?.configured || !command.trim() || execute.isPending}
          onClick={() => execute.mutate()}
        >
          {execute.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Executar no servidor
        </Button>

        {result && (
          <div className="space-y-2 rounded-lg border bg-black p-3 font-mono text-xs text-white">
            <div>exit={String(result.exitCode)} · {result.durationMs}ms</div>
            {result.stdout && <pre className="max-h-72 overflow-auto whitespace-pre-wrap">{result.stdout}</pre>}
            {result.stderr && <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-red-300">{result.stderr}</pre>}
          </div>
        )}
      </div>
    </Card>
  );
}
