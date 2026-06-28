import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitBranch, Plus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Flow = {
  id: string;
  nome: string;
  segmento: string | null;
  ativo: boolean;
  createdAt: string;
  stepCount: number;
};

// ── API helper ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FlowBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newNome, setNewNome] = useState("");
  const [newSegmento, setNewSegmento] = useState("");
  const [newAtivo, setNewAtivo] = useState(true);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: flows = [], isLoading } = useQuery<Flow[]>({
    queryKey: ["prospector-flows"],
    queryFn: () => apiFetch<Flow[]>("/api/prospector/flows"),
  });

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? null;

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createFlow = useMutation({
    mutationFn: (body: { nome: string; segmento?: string; ativo: boolean }) =>
      apiFetch<Flow>("/api/prospector/flows", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["prospector-flows"] });
      setSelectedFlowId(flow.id);
      setDialogOpen(false);
      setNewNome("");
      setNewSegmento("");
      setNewAtivo(true);
      toast({ title: "Fluxo criado com sucesso" });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const patchFlow = useMutation({
    mutationFn: ({ id, ...body }: { id: string; ativo?: boolean; nome?: string; segmento?: string | null }) =>
      apiFetch<Flow>(`/api/prospector/flows/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospector-flows"] }),
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleCreate() {
    if (!newNome.trim()) return;
    createFlow.mutate({
      nome: newNome.trim(),
      ...(newSegmento.trim() ? { segmento: newSegmento.trim() } : {}),
      ativo: newAtivo,
    });
  }

  function handleOpenDialog() {
    setNewNome("");
    setNewSegmento("");
    setNewAtivo(true);
    setDialogOpen(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <aside
        className="w-[280px] shrink-0 border-r flex flex-col overflow-y-auto"
        style={{ height: "100vh" }}
      >
        <div className="p-4 border-b space-y-3">
          <h2 className="font-semibold text-base">Meus Fluxos</h2>
          <Button className="w-full" size="sm" onClick={handleOpenDialog}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Fluxo
          </Button>
        </div>

        <div className="flex-1 p-2 space-y-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              Carregando...
            </p>
          ) : flows.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              Nenhum fluxo criado ainda.
            </p>
          ) : (
            flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => setSelectedFlowId(flow.id)}
                className={[
                  "w-full text-left rounded-md px-3 py-2.5 transition-colors",
                  flow.id === selectedFlowId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted",
                ].join(" ")}
              >
                <p className="font-semibold text-sm leading-snug truncate">
                  {flow.nome}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {flow.segmento && (
                    <Badge variant="secondary" className="text-xs h-4 px-1.5">
                      {flow.segmento}
                    </Badge>
                  )}
                  <Badge
                    variant={flow.ativo ? "default" : "outline"}
                    className="text-xs h-4 px-1.5"
                  >
                    {flow.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  {flow.stepCount > 0 && (
                    <Badge variant="outline" className="text-xs h-4 px-1.5">
                      {flow.stepCount} step{flow.stepCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Editor ── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedFlow ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <GitBranch className="h-12 w-12 opacity-25" />
            <p className="text-sm">
              Selecione um fluxo na barra lateral ou crie um novo
            </p>
          </div>
        ) : (
          <div className="p-6 max-w-3xl space-y-6">
            {/* Header */}
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-semibold text-xl leading-tight truncate">
                    {selectedFlow.nome}
                  </h1>
                  {selectedFlow.segmento && (
                    <Badge variant="secondary">{selectedFlow.segmento}</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedFlow.ativo ? "Ativo" : "Inativo"}
                  </span>
                  <Switch
                    checked={selectedFlow.ativo}
                    onCheckedChange={(checked) =>
                      patchFlow.mutate({ id: selectedFlow.id, ativo: checked })
                    }
                    disabled={patchFlow.isPending}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLocation(`/prospector/flows/${selectedFlow.id}/executions`)
                  }
                >
                  Ver Execuções
                </Button>
              </div>
            </div>

            {/* Steps placeholder */}
            <p className="text-sm text-muted-foreground">Carregando steps...</p>
          </div>
        )}
      </main>

      {/* ── Dialog: Novo Fluxo ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fluxo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="flow-nome">Nome *</Label>
              <Input
                id="flow-nome"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                placeholder="ex: Nutrição de Parceiros"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flow-segmento">Segmento</Label>
              <Input
                id="flow-segmento"
                value={newSegmento}
                onChange={(e) => setNewSegmento(e.target.value)}
                placeholder="ex: materiais de construção"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="flow-ativo"
                checked={newAtivo}
                onCheckedChange={setNewAtivo}
              />
              <Label htmlFor="flow-ativo">Ativo</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newNome.trim() || createFlow.isPending}
              >
                {createFlow.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
