import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type AgentDefault = {
  id: string;
  agentKey: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  systemPromptBase: string;
  parametrosBase: Record<string, unknown> | null;
  ativo: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function fetchDefaults(): Promise<AgentDefault[]> {
  const res = await fetch("/api/admin/agent-defaults", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ao buscar defaults: ${res.status}`);
  return res.json();
}

async function patchDefault(
  agentKey: string,
  body: { systemPromptBase: string; parametrosBase: Record<string, unknown> | null }
) {
  const res = await fetch(`/api/admin/agent-defaults/${agentKey}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ao salvar: ${res.status}`);
  return res.json() as Promise<AgentDefault>;
}

// ── Dialog de edição ───────────────────────────────────────────────────────────

function EditDialog({
  agent,
  onClose,
}: {
  agent: AgentDefault;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [systemPromptBase, setSystemPromptBase] = useState(agent.systemPromptBase);
  const [parametrosRaw, setParametrosRaw]       = useState(
    agent.parametrosBase ? JSON.stringify(agent.parametrosBase, null, 2) : "{}"
  );
  const [jsonError, setJsonError]               = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      let parametrosBase: Record<string, unknown> | null = null;
      try {
        parametrosBase = JSON.parse(parametrosRaw) as Record<string, unknown>;
        setJsonError(null);
      } catch {
        throw new Error("JSON inválido em Parâmetros Base");
      }
      return patchDefault(agent.agentKey, { systemPromptBase, parametrosBase });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AgentDefault[]>(["admin-agent-defaults"], (old) =>
        old?.map((a) => (a.agentKey === updated.agentKey ? updated : a)) ?? []
      );
      toast({ title: "Prompt salvo", description: `Padrão de "${agent.nome}" atualizado.` });
      onClose();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      if (msg.includes("JSON")) {
        setJsonError(msg);
      } else {
        toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
      }
    },
  });

  function handleSave() {
    setJsonError(null);
    try {
      JSON.parse(parametrosRaw);
    } catch {
      setJsonError("JSON inválido — corrija antes de salvar.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prompt padrão — {agent.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="systemPromptBase">System Prompt Base</Label>
            <Textarea
              id="systemPromptBase"
              value={systemPromptBase}
              onChange={(e) => setSystemPromptBase(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parametrosBase">Parâmetros Base (JSON)</Label>
            <Textarea
              id="parametrosBase"
              value={parametrosRaw}
              onChange={(e) => { setParametrosRaw(e.target.value); setJsonError(null); }}
              rows={4}
              className="font-mono text-xs"
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AgentDefaults() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<AgentDefault | null>(null);

  const { data: defaults, isLoading, isError, error } = useQuery<AgentDefault[]>({
    queryKey: ["admin-agent-defaults"],
    queryFn: fetchDefaults,
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prompts Padrão dos Agentes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie os prompts base de cada agente de IA usados por todos os tenants.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Erro ao carregar dados."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos os agentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                (defaults ?? []).map((agent) => (
                  <TableRow key={agent.agentKey}>
                    <TableCell className="font-medium">{agent.nome}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{agent.agentKey}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">
                      {agent.categoria ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={agent.ativo ? "default" : "secondary"}
                        className={agent.ativo ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ""}
                      >
                        {agent.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(agent)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <EditDialog
          agent={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
