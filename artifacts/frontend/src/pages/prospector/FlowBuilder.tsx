import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDown, ChevronUp, GitBranch, Plus, Trash2, UploadCloud } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Flow = {
  id: string;
  nome: string;
  segmento: string | null;
  ativo: boolean;
  createdAt: string;
  stepCount: number;
};

type Step = {
  id: string;
  flowId: string;
  ordem: number;
  canal: "whatsapp" | "email";
  delayHoras: number;
  mensagemTemplate: string | null;
  materialTipo: string | null;
  materialPrompt: string | null;
  materialFonte: string | null;
  materialUploadUrl: string | null;
  materialUploadNome: string | null;
  materialPromptVars: Record<string, unknown> | null;
};

type MaterialMode = "none" | "ia" | "upload";

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
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VARS = ["{{nome}}", "{{empresa}}", "{{cidade}}", "{{segmento}}"];

function fonteModeFromServer(f: string | null): MaterialMode {
  if (f === "ia") return "ia";
  if (f === "upload") return "upload";
  return "none";
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
  v: string,
) {
  const el = ref.current;
  if (!el) { setValue(value + v); return; }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + v + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + v.length;
    el.setSelectionRange(pos, pos);
  });
}

// ── VarChips ─────────────────────────────────────────────────────────────────

function VarChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {VARS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="rounded border border-dashed px-2 py-0.5 text-xs font-mono text-primary hover:bg-primary/10 transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── StepCard ──────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: Step;
  steps: Step[];
  flowId: string;
}

function StepCard({ step, steps, flowId }: StepCardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Entrega state ─────────────────────────────────────────────────────────
  const [canal, setCanal] = useState<"whatsapp" | "email">(step.canal);
  const [delayHoras, setDelayHoras] = useState(step.delayHoras ?? 0);
  const [mensagem, setMensagem] = useState(step.mensagemTemplate ?? "");
  const mensagemRef = useRef<HTMLTextAreaElement>(null);

  // ── Material state ────────────────────────────────────────────────────────
  const [materialMode, setMaterialMode] = useState<MaterialMode>(
    fonteModeFromServer(step.materialFonte),
  );
  const [materialTipo, setMaterialTipo] = useState(step.materialTipo ?? "html");
  const [materialPrompt, setMaterialPrompt] = useState(step.materialPrompt ?? "");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadUrl, setUploadUrl] = useState<string | null>(step.materialUploadUrl);
  const [uploadNome, setUploadNome] = useState<string | null>(step.materialUploadNome);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Preview state ─────────────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Dialog/Alert state ────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isFirst = step.ordem === 1;
  const isLast = step.ordem === Math.max(...steps.map((s) => s.ordem));

  // ── Upload handler ────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/prospector/flows/${flowId}/steps/${step.id}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
          body: fd,
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }
      const data = (await res.json()) as { url: string; originalName: string };
      setUploadUrl(data.url);
      setUploadNome(data.originalName);
      toast({ title: "Arquivo enviado com sucesso" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Erro no upload",
        variant: "destructive",
      });
    } finally {
      setUploadLoading(false);
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<Step>(`/api/prospector/flows/${flowId}/steps/${step.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          canal,
          delayHoras,
          mensagemTemplate: mensagem,
          materialFonte: materialMode === "none" ? null : materialMode,
          materialTipo: materialMode === "ia" ? materialTipo : null,
          materialPrompt: materialMode === "ia" ? materialPrompt : null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospector-steps", flowId] });
      qc.invalidateQueries({ queryKey: ["prospector-flows"] });
      toast({ title: "Step salvo" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(
        `/api/prospector/flows/${flowId}/steps/${step.id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospector-steps", flowId] });
      qc.invalidateQueries({ queryKey: ["prospector-flows"] });
      toast({ title: "Step removido" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (direction: "up" | "down") => {
      const sorted = [...steps].sort((a, b) => a.ordem - b.ordem);
      const idx = sorted.findIndex((s) => s.id === step.id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const other = sorted[swapIdx]!;
      await Promise.all([
        apiFetch(`/api/prospector/flows/${flowId}/steps/${step.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ordem: other.ordem }),
        }),
        apiFetch(`/api/prospector/flows/${flowId}/steps/${other.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ordem: step.ordem }),
        }),
      ]);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["prospector-steps", flowId] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(
        `/api/prospector/flows/${flowId}/steps/${step.id}/preview`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: ({ url }) => {
      setPreviewUrl(url);
      setPreviewOpen(true);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Step {step.ordem}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ── ENTREGA ──────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Entrega
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Canal</Label>
                <Select
                  value={canal}
                  onValueChange={(v) => setCanal(v as "whatsapp" | "email")}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Enviar X horas após step anterior
                </Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-sm"
                  value={delayHoras}
                  onChange={(e) =>
                    setDelayHoras(Math.max(0, Number(e.target.value)))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                ref={mensagemRef}
                rows={4}
                className="text-sm resize-none"
                placeholder="Digite a mensagem... use as variáveis abaixo"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
              <VarChips
                onInsert={(v) =>
                  insertAtCursor(mensagemRef, mensagem, setMensagem, v)
                }
              />
            </div>
          </div>

          {/* ── MATERIAL ─────────────────────────────────────────────────── */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Material
            </p>

            <RadioGroup
              value={materialMode}
              onValueChange={(v) => setMaterialMode(v as MaterialMode)}
              className="flex gap-5"
            >
              {[
                { value: "none", label: "Sem material" },
                { value: "ia", label: "Gerar com IA" },
                { value: "upload", label: "Upload manual" },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-1.5">
                  <RadioGroupItem
                    value={value}
                    id={`material-${step.id}-${value}`}
                  />
                  <Label
                    htmlFor={`material-${step.id}-${value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* ── IA ── */}
            {materialMode === "ia" && (
              <div className="space-y-3 pt-1 rounded-md border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de material</Label>
                  <Select value={materialTipo} onValueChange={setMaterialTipo}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="imagem">Imagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Prompt</Label>
                  <Textarea
                    ref={promptRef}
                    rows={6}
                    className="text-sm resize-none"
                    placeholder="Descreva o material. Use {{nome}}, {{empresa}}, {{cidade}}, {{segmento}} para personalizar."
                    value={materialPrompt}
                    onChange={(e) => setMaterialPrompt(e.target.value)}
                  />
                  <VarChips
                    onInsert={(v) =>
                      insertAtCursor(promptRef, materialPrompt, setMaterialPrompt, v)
                    }
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending || !materialPrompt.trim()}
                >
                  {previewMutation.isPending ? (
                    <>
                      <Spinner className="h-3.5 w-3.5 mr-1.5" />
                      Gerando...
                    </>
                  ) : (
                    "Preview"
                  )}
                </Button>
              </div>
            )}

            {/* ── UPLOAD ── */}
            {materialMode === "upload" && (
              <div className="space-y-2 pt-1">
                {uploadUrl && (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {uploadNome ?? uploadUrl}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Substituir
                    </Button>
                  </div>
                )}

                <div
                  className={[
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
                    uploadLoading
                      ? "opacity-50 pointer-events-none"
                      : "hover:border-primary/50 hover:bg-muted/30",
                  ].join(" ")}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) void handleUpload(file);
                  }}
                >
                  {uploadLoading ? (
                    <>
                      <Spinner className="h-5 w-5" />
                      <p className="text-sm text-muted-foreground">Enviando...</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-6 w-6 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Arraste o arquivo ou clique para selecionar
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        .html, .pdf, .jpg, .png
                      </p>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between pt-2 pb-4">
          {/* Reorder */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isFirst || reorderMutation.isPending}
              onClick={() => reorderMutation.mutate("up")}
              title="Mover para cima"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isLast || reorderMutation.isPending}
              onClick={() => reorderMutation.mutate("down")}
              title="Mover para baixo"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Save + Delete */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              title="Excluir step"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* AlertDialog — confirmação de exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover step {step.ordem}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O step será excluído
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — Preview do material */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview do Material</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {previewUrl ? (
              materialTipo === "imagem" ? (
                <img
                  src={previewUrl}
                  alt="preview"
                  style={{ maxWidth: "100%" }}
                  className="rounded"
                />
              ) : materialTipo === "pdf" ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline text-sm"
                >
                  Abrir PDF em nova aba
                </a>
              ) : (
                <iframe
                  src={previewUrl}
                  title="preview-html"
                  style={{ width: "100%", height: "500px", border: "none" }}
                  className="rounded border"
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum preview disponível.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── FlowBuilder ───────────────────────────────────────────────────────────────

export default function FlowBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newNome, setNewNome] = useState("");
  const [newSegmento, setNewSegmento] = useState("");
  const [newAtivo, setNewAtivo] = useState(true);

  // ── Flows query ───────────────────────────────────────────────────────────

  const { data: flows = [], isLoading } = useQuery<Flow[]>({
    queryKey: ["prospector-flows"],
    queryFn: () => apiFetch<Flow[]>("/api/prospector/flows"),
  });

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? null;

  // ── Steps query ───────────────────────────────────────────────────────────

  const { data: steps = [], isLoading: stepsLoading } = useQuery<Step[]>({
    queryKey: ["prospector-steps", selectedFlowId],
    queryFn: () =>
      apiFetch<Step[]>(`/api/prospector/flows/${selectedFlowId}/steps`),
    enabled: !!selectedFlowId,
  });

  const sortedSteps = [...steps].sort((a, b) => a.ordem - b.ordem);

  // ── Mutations ─────────────────────────────────────────────────────────────

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
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      ativo?: boolean;
      nome?: string;
      segmento?: string | null;
    }) =>
      apiFetch<Flow>(`/api/prospector/flows/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospector-flows"] }),
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const addStep = useMutation({
    mutationFn: () => {
      const nextOrdem =
        sortedSteps.length > 0
          ? sortedSteps[sortedSteps.length - 1]!.ordem + 1
          : 1;
      return apiFetch<Step>(
        `/api/prospector/flows/${selectedFlowId}/steps`,
        {
          method: "POST",
          body: JSON.stringify({
            ordem: nextOrdem,
            canal: "whatsapp",
            delayHoras: 24,
          }),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospector-steps", selectedFlowId] });
      qc.invalidateQueries({ queryKey: ["prospector-flows"] });
    },
    onError: (err: Error) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

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
                    setLocation(
                      `/prospector/flows/${selectedFlow.id}/executions`,
                    )
                  }
                >
                  Ver Execuções
                </Button>
              </div>
            </div>

            {/* Steps */}
            {stepsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Carregando steps...
              </div>
            ) : (
              <div className="space-y-4">
                {sortedSteps.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum step ainda. Adicione o primeiro abaixo.
                  </p>
                )}

                {sortedSteps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    steps={steps}
                    flowId={selectedFlow.id}
                  />
                ))}

                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => addStep.mutate()}
                  disabled={addStep.isPending}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  {addStep.isPending ? "Adicionando..." : "Adicionar Step"}
                </Button>
              </div>
            )}
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
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
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
