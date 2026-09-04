import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useListPropostas } from "@workspace/api-client-react";
import { History, Paperclip, Plus, FileText, Loader2, Trash2, X, Receipt, ArrowRight } from "lucide-react";

type Anexo = { nome: string; url: string; mimeType?: string; tamanho?: number };
type Revisao = {
  id: string;
  numeroOrcamento: string;
  dataOrcamento: string;
  apresentacao: string | null;
  observacao: string | null;
  anexos: Anexo[];
  createdAt: string;
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}
function authHeadersJson() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}
async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Falha na operação.");
  return data;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function OrcamentoRevisoesCard({ leadId, tenantId, dealId }: { leadId: string; tenantId: string; dealId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const token = localStorage.getItem("vendorai_token") ?? "";
  const queryKey = ["orcamento-revisoes", leadId];

  const { data: revisoes = [], isLoading } = useQuery<Revisao[]>({
    queryKey,
    queryFn: () => fetch(`/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes`, { headers: authHeaders() }).then(readJson),
    enabled: !!leadId && !!tenantId,
  });

  const { data: orcamentos = [], isLoading: loadingOrcamentos } = useListPropostas(
    tenantId,
    { leadId },
    { request: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const hasOrcamento = orcamentos.length > 0;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(todayISO());
  const [apresentacao, setApresentacao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewerAnexos, setViewerAnexos] = useState<{ titulo: string; anexos: Anexo[] } | null>(null);

  function openBudgetCreation() {
    const budgetButton = document.querySelector<HTMLElement>('[data-testid="btn-new-budget"]');
    if (budgetButton) {
      budgetButton.click();
      return;
    }
    toast({
      title: "Crie primeiro o orçamento deste cliente",
      description: "Use a ação “Gerar orçamento” no topo do atendimento para manter o contexto do lead.",
    });
  }

  function openNew() {
    if (!hasOrcamento) {
      openBudgetCreation();
      return;
    }
    const latestBudget = orcamentos[0] as any;
    setEditingId(null);
    setNumero(latestBudget?.titulo ?? "");
    setData(todayISO());
    setApresentacao("");
    setObservacao("");
    setAnexos([]);
    setFormOpen(true);
  }

  function openEdit(r: Revisao) {
    setEditingId(r.id);
    setNumero(r.numeroOrcamento);
    setData(r.dataOrcamento.slice(0, 10));
    setApresentacao(r.apresentacao ?? "");
    setObservacao(r.observacao ?? "");
    setAnexos(r.anexos ?? []);
    setFormOpen(true);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!metaRes.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!putRes.ok) throw new Error("Falha ao enviar arquivo");

      const url = `${window.location.origin}/api/storage${objectPath}`;
      setAnexos((prev) => [...prev, { nome: file.name, url, mimeType: file.type, tamanho: file.size }]);
    } catch (error) {
      toast({ title: "Erro no upload", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!editingId && !hasOrcamento) {
      setFormOpen(false);
      openBudgetCreation();
      return;
    }
    if (!numero.trim() || !data) {
      toast({ title: "Preencha ao menos o número e a data do orçamento.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        numeroOrcamento: numero.trim(),
        dataOrcamento: data,
        apresentacao: apresentacao.trim() || null,
        observacao: observacao.trim() || null,
        anexos,
        dealId: dealId ?? null,
      };
      const url = editingId
        ? `/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes/${editingId}`
        : `/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes`;
      await fetch(url, { method: editingId ? "PATCH" : "POST", headers: authHeadersJson(), body: JSON.stringify(payload) }).then(readJson);
      await qc.invalidateQueries({ queryKey });
      toast({ title: editingId ? "Revisão atualizada." : "Revisão registrada." });
      setFormOpen(false);
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function removeRevisao(id: string) {
    if (!confirm("Excluir esta revisão do histórico? Essa ação não pode ser desfeita.")) return;
    try {
      await fetch(`/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes/${id}`, { method: "DELETE", headers: authHeaders() }).then(readJson);
      await qc.invalidateQueries({ queryKey });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <Card data-testid="card-orcamento-revisoes">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <History className="h-4 w-4 shrink-0" />
            Negociação e revisões
            {revisoes.length > 0 && <Badge variant="outline" className="text-xs">{revisoes.length}</Badge>}
          </span>
          {hasOrcamento ? (
            <Button size="sm" className="h-7 text-xs gap-1" onClick={openNew}>
              <Plus className="h-3 w-3" />
              Nova revisão
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openBudgetCreation} disabled={loadingOrcamentos}>
              <Receipt className="h-3 w-3" />
              Criar orçamento
            </Button>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Registre aqui cada nova rodada depois que um orçamento real for criado e apresentado ao cliente.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading || loadingOrcamentos ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
          </div>
        ) : !hasOrcamento ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Crie o primeiro orçamento antes de iniciar as revisões.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assim o histórico representa uma negociação real e não cria revisões soltas sem orçamento de origem.
            </p>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={openBudgetCreation}>
              Gerar orçamento para este cliente
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : revisoes.length === 0 ? (
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">Orçamento criado. Nenhuma revisão necessária até agora.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use “Nova revisão” somente quando houver uma nova rodada de negociação, alteração solicitada ou novo documento apresentado ao cliente.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orçamento</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Apresentação</TableHead>
                <TableHead>O que mudou</TableHead>
                <TableHead>Anexos</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisoes.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEdit(r)}>
                  <TableCell className="font-medium">{r.numeroOrcamento}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.dataOrcamento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{r.apresentacao || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.observacao || "—"}</TableCell>
                  <TableCell>
                    {r.anexos?.length ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={(e) => { e.stopPropagation(); setViewerAnexos({ titulo: r.numeroOrcamento, anexos: r.anexos }); }}
                      >
                        <Paperclip className="h-3 w-3" />
                        {r.anexos.length}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); removeRevisao(r.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar revisão" : "Registrar nova rodada de negociação"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Esta revisão deve corresponder a um orçamento já criado para este cliente. Registre apenas o que mudou nesta rodada.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Orçamento de referência</Label>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: ORC-0123" />
              </div>
              <div className="grid gap-1.5">
                <Label>Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Como foi apresentado</Label>
              <Input value={apresentacao} onChange={(e) => setApresentacao(e.target.value)} placeholder="Ex: WhatsApp, reunião, e-mail…" />
            </div>
            <div className="grid gap-1.5">
              <Label>O que mudou nesta revisão</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: cliente pediu retirada de item, nova condição, desconto, alteração de prazo…" rows={3} />
            </div>
            <div className="grid gap-1.5">
              <Label>Documentos desta rodada</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  files.forEach((f) => void uploadFile(f));
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 justify-start" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {uploading ? "Enviando…" : "Anexar documento"}
              </Button>
              {anexos.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {anexos.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 hover:underline">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.nome}</span>
                      </a>
                      <button type="button" onClick={() => setAnexos((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar revisão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewerAnexos} onOpenChange={(open) => !open && setViewerAnexos(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Documentos — {viewerAnexos?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {viewerAnexos?.anexos.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded border px-2 py-2 text-sm hover:bg-muted/50">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.nome}</span>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
