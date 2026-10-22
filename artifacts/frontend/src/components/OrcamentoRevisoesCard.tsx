import { getListPropostasQueryKey } from "@workspace/api-client-react";
import { Fragment, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useListPropostas, useUpdatePropostaStatus } from "@workspace/api-client-react";
import {
  Download,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";

type Anexo = { nome: string; url: string; mimeType?: string; tamanho?: number };
type Revisao = {
  id: string;
  basePropostaId?: string | null;
  propostaRevisaoId?: string | null;
  revisaoNumero?: string | null;
  numeroOrcamento: string;
  dataOrcamento: string;
  apresentacao: string | null;
  observacao: string | null;
  anexos: Anexo[];
  createdAt: string;
};

type Orcamento = {
  id: string;
  numero?: string | null;
  titulo: string;
  valorTotal?: string | number | null;
  status: string;
  createdAt?: string | null;
  validadeAte?: string | null;
};

const ORCAMENTO_LABELS = [
  { value: "em_analise", label: "Em análise", targetStatus: "enviada", className: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "aprovado", label: "Aprovado", targetStatus: "aceita", className: "bg-green-50 text-green-700 border-green-200" },
  { value: "descartado", label: "Descartado", targetStatus: "rejeitada", className: "bg-red-50 text-red-600 border-red-200" },
  { value: "finalizado", label: "Finalizado", targetStatus: "expirada", className: "bg-gray-100 text-gray-600 border-gray-200" },
] as const;

type OrcLabel = (typeof ORCAMENTO_LABELS)[number]["value"];

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function formatMoney(value?: string | number | null) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getOrcLabel(status: string): OrcLabel {
  if (status === "aceita") return "aprovado";
  if (status === "rejeitada") return "descartado";
  if (status === "expirada") return "finalizado";
  return "em_analise";
}

function isTerminalStatus(status: string) {
  return status === "aceita" || status === "rejeitada" || status === "expirada";
}

function budgetReference(orc: Orcamento) {
  return String(orc.numero || orc.id);
}

function revisionMatchesBudget(revisao: Revisao, orc: Orcamento) {
  if (revisao.basePropostaId) return revisao.basePropostaId === orc.id;
  const refs = [orc.numero, orc.id, orc.titulo].filter(Boolean).map(String);
  const revisionRef = String(revisao.numeroOrcamento);
  return refs.includes(revisionRef)
    || (!!orc.numero && revisionRef.startsWith(`${orc.numero}-R`));
}

export function OrcamentoRevisoesCard({ leadId, tenantId, dealId, onCreateBudget }: { leadId: string; tenantId: string; dealId?: string; onCreateBudget?: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const token = localStorage.getItem("vendorai_token") ?? "";
  const queryKey = ["orcamento-revisoes", leadId];

  const { data: revisoes = [], isLoading } = useQuery<Revisao[]>({
    queryKey,
    queryFn: () => fetch(`/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes`, { headers: authHeaders() }).then(readJson),
    enabled: !!leadId && !!tenantId,
  });

  const { data: propostasLeadData = [], isLoading: loadingOrcamentosLead } = useListPropostas(
    tenantId,
    { leadId },
    { request: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: propostasDealData = [], isLoading: loadingOrcamentosDeal } = useListPropostas(
    tenantId,
    { dealId: dealId ?? "" },
    {
      query: { queryKey: getListPropostasQueryKey(tenantId, { dealId: dealId ?? "" }), enabled: !!tenantId && !!dealId },
      request: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const orcamentos = Array.from(
    new Map(
      [
        ...(propostasLeadData as unknown as Orcamento[]),
        ...(propostasDealData as unknown as Orcamento[]),
      ].map((orc) => [orc.id, orc] as const),
    ).values(),
  );
  const revisionProposalIds = new Set(
    revisoes.map((revisao) => revisao.propostaRevisaoId).filter((id): id is string => Boolean(id)),
  );
  const baseOrcamentos = orcamentos.filter((orc) => !revisionProposalIds.has(orc.id));
  const loadingOrcamentos = loadingOrcamentosLead || (!!dealId && loadingOrcamentosDeal);
  const hasOrcamento = baseOrcamentos.length > 0;

  const updatePropostaStatus = useUpdatePropostaStatus({
    request: { headers: { Authorization: `Bearer ${token}` } },
  });

  const [changingStatus, setChangingStatus] = useState<string | null>(null);
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
    if (onCreateBudget) {
      onCreateBudget();
      return;
    }
    toast({
      title: "Criar orçamento",
      description: "Abra a ação de orçamento deste atendimento para criar a primeira versão comercial.",
    });
  }

  function openNew(orc?: Orcamento) {
    if (!hasOrcamento) {
      openBudgetCreation();
      return;
    }
    const selected = orc ?? baseOrcamentos[0];
    setEditingId(null);
    setNumero(selected ? budgetReference(selected) : "");
    setData(todayISO());
    setApresentacao("");
    setObservacao("");
    setAnexos([]);
    setFormOpen(true);
  }

  function openEdit(revisao: Revisao) {
    setEditingId(revisao.id);
    setNumero(revisao.numeroOrcamento);
    setData(revisao.dataOrcamento.slice(0, 10));
    setApresentacao(revisao.apresentacao ?? "");
    setObservacao(revisao.observacao ?? "");
    setAnexos(revisao.anexos ?? []);
    setFormOpen(true);
  }

  async function handleChangeStatus(orc: Orcamento, newLabel: string) {
    const config = ORCAMENTO_LABELS.find((item) => item.value === newLabel);
    if (!config || getOrcLabel(orc.status) === newLabel) return;
    setChangingStatus(orc.id);
    try {
      await updatePropostaStatus.mutateAsync({ id: orc.id, data: { status: config.targetStatus } });
      await qc.invalidateQueries();
      toast({ title: "Situação do orçamento atualizada." });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar o orçamento",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setChangingStatus(null);
    }
  }

  async function downloadOrcamentoPdf(orc: Orcamento) {
    try {
      const response = await fetch(`/api/propostas/${orc.id}/pdf`, { headers: authHeaders() });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Não foi possível gerar o PDF.");
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error("O servidor não retornou um PDF válido.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${orc.numero || orc.titulo || "orcamento"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erro ao baixar orçamento",
        description: error instanceof Error ? error.message : "Não foi possível gerar o PDF.",
        variant: "destructive",
      });
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const response = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!response.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadURL, objectPath } = (await response.json()) as { uploadURL: string; objectPath: string };
      const result = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!result.ok) throw new Error("Falha ao enviar arquivo");
      const url = `${window.location.origin}/api/storage${objectPath}`;
      setAnexos((prev) => [...prev, { nome: file.name, url, mimeType: file.type, tamanho: file.size }]);
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!hasOrcamento) {
      setFormOpen(false);
      openBudgetCreation();
      return;
    }
    if (!numero.trim() || !data) {
      toast({ title: "Selecione o orçamento e informe a data.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        numeroOrcamento: numero.trim(),
        dataOrcamento: data,
        ...(editingId ? {} : {
          basePropostaId: baseOrcamentos.find((orc) => budgetReference(orc) === numero)?.id,
        }),
        apresentacao: apresentacao.trim() || null,
        observacao: observacao.trim() || null,
        anexos,
        dealId: dealId ?? null,
      };
      const url = editingId
        ? `/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes/${editingId}`
        : `/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes`;
      const saved = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: authHeadersJson(),
        body: JSON.stringify(payload),
      }).then(readJson);
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries();
      toast({
        title: editingId ? "Revisão atualizada." : `${saved.revisaoNumero ?? "Nova revisão"} criada`,
        description: !editingId && saved.propostaRevisaoId
          ? "Uma nova versão editável do orçamento foi criada a partir da versão anterior."
          : undefined,
      });
      setFormOpen(false);
      if (!editingId && saved.propostaRevisaoId) {
        window.location.href = `${import.meta.env.BASE_URL}propostas?edit=${encodeURIComponent(saved.propostaRevisaoId)}&returnTo=${encodeURIComponent(`/leads/${leadId}`)}`;
      }
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeRevisao(id: string) {
    if (!confirm("Excluir esta revisão do histórico? Essa ação não pode ser desfeita.")) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/leads/${leadId}/orcamento-revisoes/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await readJson(response);
      await qc.invalidateQueries({ queryKey });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  const matchedRevisionIds = new Set(
    revisoes
      .filter((revisao) => baseOrcamentos.some((orc) => revisionMatchesBudget(revisao, orc)))
      .map((revisao) => revisao.id),
  );
  const orphanRevisions = revisoes.filter((revisao) => !matchedRevisionIds.has(revisao.id));
  const currentBudgetRefs = new Set(baseOrcamentos.map(budgetReference));
  const selectedReferenceIsLegacy = !!numero && !currentBudgetRefs.has(numero);

  return (
    <>
      <Card data-testid="card-orcamento-revisoes" className="min-w-0 max-w-full overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 min-w-0">
              <Receipt className="h-4 w-4 shrink-0" />
              Orçamentos, negociações e revisões
              {baseOrcamentos.length > 0 && <Badge variant="outline" className="text-xs">{baseOrcamentos.length}</Badge>}
            </span>
            <Button size="sm" variant="outline" className="h-9 w-full text-xs gap-1 sm:h-7 sm:w-auto" onClick={openBudgetCreation}>
              <Plus className="h-3 w-3" />
              Novo orçamento
            </Button>
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            O orçamento base e todas as rodadas de negociação ficam no mesmo histórico, sem duplicar informações em cards separados.
          </p>
        </CardHeader>

        <CardContent className="min-w-0 overflow-hidden">
          {isLoading || loadingOrcamentos ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => <div key={item} className="h-11 bg-muted animate-pulse rounded" />)}
            </div>
          ) : !hasOrcamento ? (
            <div className="rounded-lg border border-dashed p-5 text-center">
              <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">Nenhum orçamento criado para este cliente.</p>
              <p className="mt-1 text-xs text-muted-foreground">Crie o primeiro orçamento; depois as revisões serão registradas abaixo dele nesta mesma tabela.</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={openBudgetCreation}>
                <Plus className="h-3.5 w-3.5" />
                Criar orçamento
              </Button>
            </div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {baseOrcamentos.map((orc) => {
                const labelValue = getOrcLabel(orc.status);
                const labelConfig = ORCAMENTO_LABELS.find((item) => item.value === labelValue)!;
                const terminal = isTerminalStatus(orc.status);
                const changing = changingStatus === orc.id;
                const revisions = revisoes.filter((revisao) => revisionMatchesBudget(revisao, orc));

                return (
                  <div key={orc.id} className="min-w-0 rounded-xl border bg-background p-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{orc.titulo}</p>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          {orc.numero && <span className="break-all">Nº {orc.numero}</span>}
                          <span>{formatDate(orc.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</p>
                        <p className="mt-0.5 text-sm font-semibold">{formatMoney(orc.valorTotal)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</p>
                        {terminal ? (
                          <Badge variant="outline" className={`mt-1 max-w-full text-[10px] ${labelConfig.className}`}>
                            {labelConfig.label}
                          </Badge>
                        ) : (
                          <Select value={labelValue} onValueChange={(value) => handleChangeStatus(orc, value)} disabled={changing}>
                            <SelectTrigger className={`mt-1 h-8 min-w-0 w-full text-[10px] ${labelConfig.className}`}>
                              {changing ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                            </SelectTrigger>
                            <SelectContent>
                              {ORCAMENTO_LABELS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {revisions.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {revisions.length} rodada{revisions.length === 1 ? "" : "s"} de negociação/revisão
                        </p>
                        {revisions.map((revisao, index) => {
                          const revisionProposal = revisao.propostaRevisaoId
                            ? orcamentos.find((item) => item.id === revisao.propostaRevisaoId)
                            : null;
                          return (
                          <div key={revisao.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium">
                                {revisao.revisaoNumero ?? `Revisão ${index + 1}`}
                                {revisionProposal?.numero ? ` · ${revisionProposal.numero}` : ""}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {revisao.observacao || "Sem alteração descrita."}
                                {revisionProposal ? ` · ${formatMoney(revisionProposal.valorTotal)}` : ""}
                              </p>
                            </div>
                            <a
                              className="shrink-0"
                              href={`${import.meta.env.BASE_URL}propostas?edit=${encodeURIComponent(revisao.propostaRevisaoId || orc.id)}&returnTo=${encodeURIComponent(`/leads/${leadId}`)}`}
                            >
                              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                                <ExternalLink className="h-3.5 w-3.5" />
                                Abrir
                              </Button>
                            </a>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a className="min-w-0" href={`${import.meta.env.BASE_URL}propostas/${orc.id}/print`}>
                        <Button size="sm" variant="outline" className="w-full gap-1 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir
                        </Button>
                      </a>
                      <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={() => downloadOrcamentoPdf(orc)}>
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[210px]">Orçamento / rodada</TableHead>
                    <TableHead className="min-w-[100px]">Data</TableHead>
                    <TableHead className="min-w-[110px]">Valor</TableHead>
                    <TableHead className="min-w-[130px]">Situação</TableHead>
                    <TableHead className="min-w-[240px]">Negociação / alteração</TableHead>
                    <TableHead className="min-w-[210px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baseOrcamentos.map((orc) => {
                    const revisions = revisoes.filter((revisao) => revisionMatchesBudget(revisao, orc));
                    const labelValue = getOrcLabel(orc.status);
                    const labelConfig = ORCAMENTO_LABELS.find((item) => item.value === labelValue)!;
                    const terminal = isTerminalStatus(orc.status);
                    const changing = changingStatus === orc.id;

                    return (
                      <Fragment key={orc.id}>
                        <TableRow className="bg-muted/20">
                          <TableCell>
                            <div className="flex items-start gap-2">
                              <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{orc.titulo}</p>
                                <p className="text-[11px] text-muted-foreground">{orc.numero ? `Nº ${orc.numero}` : `ID ${orc.id.slice(0, 8)}`}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(orc.createdAt)}</TableCell>
                          <TableCell className="text-sm font-medium whitespace-nowrap">{formatMoney(orc.valorTotal)}</TableCell>
                          <TableCell>
                            {terminal ? (
                              <Badge variant="outline" className={`text-[10px] ${labelConfig.className}`}>{labelConfig.label}</Badge>
                            ) : (
                              <Select value={labelValue} onValueChange={(value) => void handleChangeStatus(orc, value)} disabled={changing}>
                                <SelectTrigger className={`h-7 w-32 text-[10px] font-medium ${labelConfig.className}`}>
                                  {changing ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
                                </SelectTrigger>
                                <SelectContent>
                                  {ORCAMENTO_LABELS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Orçamento base</span>
                              <span className="ml-2">{revisions.length} {revisions.length === 1 ? "revisão" : "revisões"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openNew(orc)}>
                                <History className="h-3 w-3" />
                                Nova revisão
                              </Button>
                              <a href={`${import.meta.env.BASE_URL}propostas/${orc.id}/print`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" title="Abrir orçamento existente">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Abrir orçamento
                                </Button>
                              </a>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Baixar PDF" onClick={() => void downloadOrcamentoPdf(orc)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {revisions.map((revisao, index) => {
                          const revisionProposal = revisao.propostaRevisaoId
                            ? orcamentos.find((item) => item.id === revisao.propostaRevisaoId)
                            : null;
                          return (
                          <TableRow key={revisao.id} className="bg-background/70 hover:bg-muted/30">
                            <TableCell>
                              <div className="pl-6 flex items-start gap-2">
                                <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-medium">{revisao.revisaoNumero ?? `Revisão ${index + 1}`}</p>
                                  <p className="text-[11px] text-muted-foreground">do orçamento {orc.numero || orc.titulo}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(revisao.dataOrcamento)}</TableCell>
                            <TableCell className="text-sm font-medium whitespace-nowrap">
                              {revisionProposal ? formatMoney(revisionProposal.valorTotal) : "—"}
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px]">Negociação</Badge></TableCell>
                            <TableCell>
                              <p className="text-xs line-clamp-2">{revisao.observacao || "Sem alteração descrita."}</p>
                              {revisao.apresentacao && <p className="mt-1 text-[11px] text-muted-foreground">Apresentado por: {revisao.apresentacao}</p>}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {revisao.anexos?.length ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => setViewerAnexos({ titulo: `Revisão ${index + 1}`, anexos: revisao.anexos })}
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    {revisao.anexos.length}
                                  </Button>
                                ) : null}
                                <a
                                  href={`${import.meta.env.BASE_URL}propostas?edit=${encodeURIComponent(revisao.propostaRevisaoId || orc.id)}&returnTo=${encodeURIComponent(`/leads/${leadId}`)}`}
                                >
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    title={`Abrir ${revisao.revisaoNumero ?? `revisão ${index + 1}`}`}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Abrir {revisao.revisaoNumero ?? `R${index + 1}`}
                                  </Button>
                                </a>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar revisão" onClick={() => openEdit(revisao)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir revisão" onClick={() => void removeRevisao(revisao.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}

                  {orphanRevisions.map((revisao) => (
                    <TableRow key={revisao.id} className="bg-amber-50/30">
                      <TableCell>
                        <div className="pl-6">
                          <p className="text-sm font-medium">Revisão anterior</p>
                          <p className="text-[11px] text-muted-foreground">Referência antiga: {revisao.numeroOrcamento}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(revisao.dataOrcamento)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Histórico</Badge></TableCell>
                      <TableCell>
                        <p className="text-xs line-clamp-2">{revisao.observacao || "Sem alteração descrita."}</p>
                        {revisao.apresentacao && <p className="mt-1 text-[11px] text-muted-foreground">Apresentado por: {revisao.apresentacao}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {revisao.anexos?.length ? (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setViewerAnexos({ titulo: "Revisão anterior", anexos: revisao.anexos })}>
                              <Paperclip className="h-3 w-3" />
                              {revisao.anexos.length}
                            </Button>
                          ) : null}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(revisao)} title="Editar revisão">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void removeRevisao(revisao.id)} title="Excluir revisão">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl overflow-x-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar revisão" : "Registrar nova rodada de negociação"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              A revisão fica vinculada ao orçamento selecionado e aparece imediatamente abaixo dele na tabela única.
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <div className="grid min-w-0 gap-1.5">
                <Label>Orçamento de referência</Label>
                <Select value={numero} onValueChange={setNumero}>
                  <SelectTrigger className="min-w-0 w-full">
                    <SelectValue placeholder="Selecione o orçamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {baseOrcamentos.map((orc) => (
                      <SelectItem key={orc.id} value={budgetReference(orc)}>
                        {orc.numero ? `${orc.numero} — ` : ""}{orc.titulo}
                      </SelectItem>
                    ))}
                    {selectedReferenceIsLegacy && <SelectItem value={numero}>Referência antiga — {numero}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label>Data</Label>
                <Input
                  className="min-w-0 w-full"
                  type="date"
                  value={data}
                  onChange={(event) => setData(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Como foi apresentado</Label>
              <Input value={apresentacao} onChange={(event) => setApresentacao(event.target.value)} placeholder="Ex: WhatsApp, reunião, e-mail…" />
            </div>

            <div className="grid gap-1.5">
              <Label>O que mudou nesta revisão</Label>
              <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Ex: retirada de item, desconto, nova condição, alteração de prazo…" rows={3} />
            </div>

            <div className="grid gap-1.5">
              <Label>Documentos desta rodada</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  files.forEach((file) => void uploadFile(file));
                  event.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 justify-start" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {uploading ? "Enviando…" : "Anexar documento"}
              </Button>

              {anexos.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {anexos.map((anexo, index) => (
                    <div key={`${anexo.url}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
                      <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 hover:underline">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{anexo.nome}</span>
                      </a>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAnexos((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button disabled={saving || uploading || !numero} onClick={() => void save()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewerAnexos} onOpenChange={(open) => !open && setViewerAnexos(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{viewerAnexos?.titulo ?? "Documentos"}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {viewerAnexos?.anexos.map((anexo, index) => (
              <a key={`${anexo.url}-${index}`} href={anexo.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/40">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{anexo.nome}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
