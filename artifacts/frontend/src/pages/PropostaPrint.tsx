import { CompleteBudgetPrint } from "@/components/CompleteBudgetPrint";
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProposta,
  getProposta,
  getLead,
  getGetPropostaQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  useUpdatePropostaStatus,
  useUpdateDeal,
  useUpdateProposta,
} from "@workspace/api-client-react";
import {
  Loader2, Printer, MessageCircle, Pencil, CheckCircle2,
  Plus, Trash2, X, CalendarIcon, ExternalLink, Play, LockKeyhole, CopyPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  pendente: "Pendente",
  aceita: "Aceita",
  rejeitada: "Rejeitada",
  expirada: "Expirada",
};

const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  a_combinar: "A Combinar",
};

function fmtCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateStr));
}

function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(dateStr));
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function isIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function buildGoogleCalendarUrl(title: string, dateIso: string, description: string): string {
  const d = new Date(dateIso + "T12:00:00");
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Entrega — ${title}`,
    dates: `${ymd}/${ymd}`,
    details: description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

type ItemExecucaoStatus = "pendente" | "em_execucao" | "concluida";

interface ItemEdit {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  sku?: string;
  descricao?: string;
  unidade?: string;
  produtoId?: string;
  composicaoId?: string;
  ordemExecucao?: number;
  statusExecucao?: ItemExecucaoStatus;
  iniciadoEm?: string;
  executadoEm?: string;
}

export default function PropostaPrint() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [markingVendido, setMarkingVendido] = useState(false);
  const [completePrintOpen, setCompletePrintOpen] = useState(true);
  const [updatingExecutionIndex, setUpdatingExecutionIndex] = useState<number | null>(null);
  const [creatingRevision, setCreatingRevision] = useState(false);

  // ── Edit sheet state ──────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eTitulo, setETitulo] = useState("");
  const [eValidade, setEValidade] = useState("");
  const [eFormaPagamento, setEFormaPagamento] = useState("");
  const [eCondPagamento, setECondPagamento] = useState("");
  const [ePrazoEntrega, setEPrazoEntrega] = useState("");
  const [eObservacoes, setEObservacoes] = useState("");
  const [eRecorrente, setERecorrente] = useState(false);
  const [eValorMensal, setEValorMensal] = useState("");
  const [ePrazoContrato, setEPrazoContrato] = useState("");
  const [eFormaPagamentoMensalidade, setEFormaPagamentoMensalidade] = useState("");
  const [eCondPagamentoMensalidade, setECondPagamentoMensalidade] = useState("");
  const [eItens, setEItens] = useState<ItemEdit[]>([]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: proposta, isLoading: propostaLoading, isError: propostaError, refetch: retryProposta } = useGetProposta(id ?? "", {
    query: {
      enabled: !!id,
      queryKey: getGetPropostaQueryKey(id ?? ""),
      retry: false,
      queryFn: ({ signal }) => getProposta(id ?? "", {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      }),
    },
  });

  const { data: lead, isLoading: leadLoading, isError: leadError, refetch: retryLead } = useGetLead(proposta?.leadId ?? "", {
    query: {
      enabled: !!proposta?.leadId,
      queryKey: getGetLeadQueryKey(proposta?.leadId ?? ""),
      retry: false,
      queryFn: ({ signal }) => getLead(proposta?.leadId ?? "", {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      }),
    },
  });

  const { data: bp } = useGetBusinessProfileByTenant(user?.tenantId ?? "", {
    query: { enabled: !!user?.tenantId, queryKey: getGetBusinessProfileByTenantQueryKey(user?.tenantId ?? "") },
  });

  const updateStatus = useUpdatePropostaStatus();
  const updateDeal = useUpdateDeal();
  const updateProposta = useUpdateProposta();

  useEffect(() => {
    if (proposta) {
      document.title = `Orçamento ${proposta.numero ?? proposta.id.slice(0, 8)} — ${proposta.titulo}`;
    }
  }, [proposta, lead, propostaLoading, leadLoading]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openEdit() {
    if (!proposta) return;
    const returnTo = `/propostas/${proposta.id}/print`;
    navigate(`/propostas?edit=${encodeURIComponent(proposta.id)}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function createCommercialRevision() {
    if (!proposta?.leadId || !proposta.tenantId) return;
    setCreatingRevision(true);
    try {
      const isAddendum = proposta.status === "aceita";
      const response = await fetch(
        `/api/tenants/${proposta.tenantId}/leads/${proposta.leadId}/orcamento-revisoes`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
          },
          body: JSON.stringify({
            basePropostaId: proposta.id,
            dealId: proposta.dealId ?? undefined,
            numeroOrcamento: proposta.numero ?? proposta.id,
            dataOrcamento: new Date().toISOString().slice(0, 10),
            apresentacao: isAddendum ? "Aditivo contratual" : "Revisão comercial",
            observacao: isAddendum
              ? "Aditivo criado a partir da versão contratada. A linha de base anterior permanece preservada."
              : "Revisão criada a partir da versão emitida. A versão anterior permanece preservada.",
            anexos: [],
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível criar a nova versão.");
      const revisionId = body?.propostaRevisao?.id;
      if (!revisionId) throw new Error("A revisão foi criada sem orçamento vinculado.");

      toast({
        title: isAddendum ? `Aditivo ${body.revisaoNumero ?? ""} criado` : `Revisão ${body.revisaoNumero ?? ""} criada`,
        description: "A versão anterior foi preservada. Edite apenas a nova versão.",
      });

      const returnTo = `/propostas/${proposta.id}/print`;
      navigate(`/propostas?edit=${encodeURIComponent(revisionId)}&returnTo=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      toast({
        title: proposta.status === "aceita" ? "Erro ao criar aditivo" : "Erro ao criar revisão",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreatingRevision(false);
    }
  }

  async function handleSave() {
    if (!proposta) return;
    const itensValidos = eItens.filter((it) => it.nome.trim());
    if (itensValidos.length === 0) {
      toast({ title: "Adicione pelo menos um item", variant: "destructive" });
      return;
    }
    const valorTotal = itensValidos.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
    setSaving(true);
    try {
      await updateProposta.mutateAsync({
        id: proposta.id,
        data: {
          titulo: eTitulo.trim() || proposta.titulo,
          itens: itensValidos.map((item, index) => ({
            ...item,
            ordemExecucao: index + 1,
            statusExecucao: item.statusExecucao ?? "pendente",
          })),
          valorTotal,
          validadeAte: eValidade ? new Date(eValidade + "T23:59:59").toISOString() : undefined,
          formaPagamento: (eFormaPagamento as any) || undefined,
          condPagamento: eCondPagamento || undefined,
          prazoEntrega: ePrazoEntrega || undefined,
          observacoes: eObservacoes || undefined,
          recorrente: eRecorrente,
          valorMensal: eRecorrente && eValorMensal ? parseFloat(eValorMensal) : undefined,
          prazoContratoMeses: eRecorrente && ePrazoContrato ? parseInt(ePrazoContrato) : undefined,
          formaPagamentoMensalidade: eFormaPagamentoMensalidade || undefined,
          condPagamentoMensalidade: eCondPagamentoMensalidade || undefined,
        } as any,
      });
      await qc.invalidateQueries({ queryKey: getGetPropostaQueryKey(proposta.id) });
      toast({ title: "Orçamento atualizado!" });
      setEditOpen(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleMarcarVendido() {
    if (!proposta) return;
    setMarkingVendido(true);
    try {
      const isRascunho = proposta.status === "rascunho";
      if (isRascunho) {
        await updateStatus.mutateAsync({ id: proposta.id, data: { status: "enviada" } });
      }
      await updateStatus.mutateAsync({ id: proposta.id, data: { status: "aceita" } });
      if (proposta.dealId) {
        await updateDeal.mutateAsync({ id: proposta.dealId, data: { etapa: "ganho" } });
      }
      await qc.invalidateQueries({ queryKey: getGetPropostaQueryKey(proposta.id) });
      toast({
        title: "Negócio marcado como vendido!",
        description: proposta.dealId
          ? "Proposta aceita e card movido para Ganho na pipeline."
          : "Proposta marcada como aceita.",
      });
    } catch {
      toast({ title: "Erro ao marcar como vendido", variant: "destructive" });
    } finally {
      setMarkingVendido(false);
    }
  }

  function handleWhatsApp() {
    if (!proposta) return;
    toast({
      title: "Dica",
      description: 'Use "Imprimir / PDF" para salvar o PDF e depois anexe no WhatsApp.',
    });
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank");
  }

  async function updateExecutionStatus(itemIndex: number, status: "em_execucao" | "concluida") {
    if (!proposta) return;
    setUpdatingExecutionIndex(itemIndex);
    try {
      const response = await fetch(`/api/propostas/${proposta.id}/execucao/${itemIndex}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "Não foi possível atualizar a execução.");
      }

      await qc.invalidateQueries({ queryKey: getGetPropostaQueryKey(proposta.id) });
      toast({
        title: status === "em_execucao" ? "Etapa iniciada" : "Etapa concluída",
        description: status === "concluida"
          ? "A etapa saiu da fila ativa e a próxima foi liberada."
          : "Somente esta etapa está liberada para execução.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível avançar a etapa",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUpdatingExecutionIndex(null);
    }
  }

  // ── Item helpers ──────────────────────────────────────────────────────────
  function addItem() {
    setEItens((prev) => [
      ...prev,
      {
        nome: "",
        quantidade: 1,
        valorUnitario: 0,
        ordemExecucao: prev.length + 1,
        statusExecucao: "pendente",
      },
    ]);
  }

  function removeItem(i: number) {
    setEItens((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((item, index) => ({ ...item, ordemExecucao: index + 1 }))
    );
  }

  function updateItem(i: number, field: keyof ItemEdit, raw: string) {
    setEItens((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        if (field === "nome") return { ...it, nome: raw };
        const n = parseFloat(raw) || 0;
        return { ...it, [field]: n };
      })
    );
  }

  // ── Loading / not found ───────────────────────────────────────────────────
  if (id && propostaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (propostaError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" role="alert">
        <p>Não foi possível carregar o orçamento. Verifique sua conexão e tente novamente.</p>
        <Button onClick={() => void retryProposta()}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => navigate("/propostas")}>Voltar aos orçamentos</Button>
      </div>
    );
  }

  if (!proposta) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Orçamento não encontrado.</p>
      </div>
    );
  }

  const total = proposta.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totalExibido = proposta.valorTotal ? parseFloat(proposta.valorTotal) : total;
  const recorrenteTotal =
    proposta.recorrente && proposta.valorMensal && proposta.prazoContratoMeses
      ? parseFloat(proposta.valorMensal) * proposta.prazoContratoMeses
      : null;

  const whatsappText = encodeURIComponent(
    `Olá! Segue o orçamento *${proposta.numero ?? proposta.id.slice(0, 8)}* — *${proposta.titulo}*.\n` +
    `Valor: *${fmtCurrency(totalExibido)}*${recorrenteTotal ? ` (recorrente: ${fmtCurrency(proposta.valorMensal)}/mês por ${proposta.prazoContratoMeses} meses)` : ""}.\n` +
    (proposta.validadeAte ? `Válido até ${fmtDate(proposta.validadeAte)}.\n` : "") +
    `\nEntre em contato para confirmar.`
  );

  const nomeEmpresa = bp?.nomeFantasia || bp?.razaoSocial || "";
  const rawLogoUrl = bp?.logoUrl;
  const logoUrl = rawLogoUrl
    ? (rawLogoUrl.startsWith("/objects/") ? `/api/storage${rawLogoUrl}` : rawLogoUrl)
    : undefined;
  const jaVendido = proposta.status === "aceita";
  const podeVender = proposta.status === "rascunho" || proposta.status === "enviada" || proposta.status === "pendente";
  const podeEditar = proposta.status === "rascunho";
  const precisaNovaVersao = proposta.status !== "rascunho";

  const itensExecucao = proposta.itens
    .map((raw, originalIndex) => {
      const item = raw as typeof raw & Partial<ItemEdit>;
      return {
        ...item,
        originalIndex,
        ordemExecucao: item.ordemExecucao ?? originalIndex + 1,
        statusExecucao: item.statusExecucao ?? "pendente" as ItemExecucaoStatus,
      };
    })
    .sort((a, b) => a.ordemExecucao - b.ordemExecucao);
  const itensAtivosExecucao = itensExecucao.filter((item) => item.statusExecucao !== "concluida");
  const etapaAtualExecucao = itensAtivosExecucao[0];
  const etapasConcluidas = itensExecucao.length - itensAtivosExecucao.length;
  const valorRestanteExecucao = itensAtivosExecucao.reduce(
    (sum, item) => sum + item.quantidade * item.valorUnitario,
    0
  );

  // ── Edit sheet totals (live) ──────────────────────────────────────────────
  const editTotal = eItens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <CompleteBudgetPrint id={proposta.id} open={completePrintOpen} onOpenChange={setCompletePrintOpen} />

      {/* ── Action bar (hidden on print) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b px-3 sm:px-6 py-2.5 flex items-center gap-2 shadow-sm flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate(proposta.leadId ? `/leads/${proposta.leadId}` : "/propostas")}>
          ← Voltar
        </Button>

        {podeEditar && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={openEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        )}

        {precisaNovaVersao && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={createCommercialRevision}
            disabled={creatingRevision}
          >
            {creatingRevision ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CopyPlus className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {jaVendido ? "Criar aditivo" : "Criar revisão"}
            </span>
          </Button>
        )}

        <div className="flex-1" />

        {podeVender && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={handleMarcarVendido}
            disabled={markingVendido}
          >
            {markingVendido ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Marcar como Vendido</span>
          </Button>
        )}

        {jaVendido && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Vendido
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
          onClick={handleWhatsApp}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden xs:inline">WhatsApp</span>
        </Button>

        <Button size="sm" className="gap-1.5" onClick={() => setCompletePrintOpen(true)}>
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimir / PDF</span>
        </Button>
      </div>

      {/* ── Print content ── */}
      <div className="pt-16 sm:pt-20 no-print-padding px-0 sm:px-4">
        <div
          id="proposta-print"
          className="max-w-[210mm] mx-auto bg-white shadow-lg sm:my-6 p-6 sm:p-12"
          style={{ minHeight: "297mm" }}
        >

          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-200 gap-4">

            {/* Esquerda: logo + dados da empresa */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={nomeEmpresa || "Logo"}
                  className="h-14 w-auto object-contain shrink-0 rounded"
                  style={{ maxWidth: "100px" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="min-w-0">
                {nomeEmpresa && (
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
                    {nomeEmpresa}
                  </h1>
                )}
                {bp?.razaoSocial && bp.razaoSocial !== nomeEmpresa && (
                  <p className="text-xs text-gray-500 mt-0.5">{bp.razaoSocial}</p>
                )}
                {bp?.cnpj && (
                  <p className="text-xs text-gray-500 mt-0.5">CNPJ: {bp.cnpj}</p>
                )}
                {bp?.endereco && (
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{bp.endereco}</p>
                )}
                {(bp?.telefone || bp?.email) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[bp.telefone, bp.email].filter(Boolean).join("  ·  ")}
                  </p>
                )}
              </div>
            </div>

            {/* Direita: logo do cliente + número + datas + status */}
            <div className="text-right shrink-0 flex flex-col items-end gap-3">
              {lead?.logoUrl && (
                <img
                  src={lead.logoUrl}
                  alt={lead.nome ?? "Logo cliente"}
                  className="h-12 w-auto object-contain rounded"
                  style={{ maxWidth: "120px" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="inline-block bg-gray-100 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Orçamento</p>
                <p className="text-base sm:text-lg font-bold text-gray-900 font-mono">
                  {proposta.numero ?? proposta.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Emitido em {fmtDateTime(proposta.createdAt)}
              </p>
              {proposta.validadeAte && (
                <p className="text-xs text-gray-500">
                  Válido até {fmtDate(proposta.validadeAte)}
                </p>
              )}
              <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                proposta.status === "aceita" ? "bg-green-100 text-green-700" :
                proposta.status === "enviada" ? "bg-blue-100 text-blue-700" :
                proposta.status === "pendente" ? "bg-violet-100 text-violet-700" :
                proposta.status === "rejeitada" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {STATUS_LABELS[proposta.status] ?? proposta.status}
              </span>
            </div>
          </div>

          {proposta.leadId && (leadLoading || leadError) && (
            <div className="no-print mb-4 rounded border p-4" role="status">
              {leadLoading ? "Carregando dados do cliente…" : "Não foi possível carregar os dados do cliente. Recarregue antes de imprimir."}
              {leadError && <Button variant="outline" className="ml-3" onClick={() => void retryLead()}>Tentar novamente</Button>}
            </div>
          )}
          {/* ── Cliente ── */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Cliente
            </h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-900 text-lg">{lead?.nome ?? "—"}</p>
              {lead?.email && <p className="text-sm text-gray-600">{lead.email}</p>}
              {lead?.telefone && <p className="text-sm text-gray-600">{lead.telefone}</p>}
              {(lead as any)?.empresa && <p className="text-sm text-gray-600">{(lead as any).empresa}</p>}
            </div>
          </div>

          {/* ── Título ── */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">{proposta.titulo}</h2>
          </div>

          {/* ── Execução operacional: itens concluídos somem da fila ativa ── */}
          {jaVendido && (
            <div className="screen-execution mb-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Execução do orçamento</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A sequência é obrigatória: conclua a etapa atual para liberar a próxima.
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{etapasConcluidas} concluída{etapasConcluidas === 1 ? "" : "s"} · {itensAtivosExecucao.length} restante{itensAtivosExecucao.length === 1 ? "" : "s"}</p>
                  <p className="font-medium text-gray-700 mt-0.5">Saldo a executar: {fmtCurrency(valorRestanteExecucao)}</p>
                </div>
              </div>

              {itensAtivosExecucao.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Todas as etapas foram executadas.</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Os itens concluídos permanecem preservados no histórico e no PDF do orçamento.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {itensAtivosExecucao.map((item, position) => {
                    const isCurrent = etapaAtualExecucao?.originalIndex === item.originalIndex;
                    const isRunning = item.statusExecucao === "em_execucao";
                    const isUpdating = updatingExecutionIndex === item.originalIndex;

                    return (
                      <div
                        key={item.originalIndex}
                        className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                          isCurrent ? "border-violet-300 bg-violet-50/60" : "border-gray-200 bg-gray-50/60"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`h-9 min-w-16 rounded-md flex items-center justify-center text-xs font-bold ${
                            isCurrent ? "bg-violet-600 text-white" : "bg-gray-200 text-gray-600"
                          }`}>
                            Etapa {item.ordemExecucao}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{item.nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.quantidade} {item.unidade ?? "un"} × {fmtCurrency(item.valorUnitario)}
                              <span className="mx-1.5">·</span>
                              {fmtCurrency(item.quantidade * item.valorUnitario)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:justify-end">
                          {!isCurrent ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                              <LockKeyhole className="h-3.5 w-3.5" />
                              Aguardando etapa anterior
                            </span>
                          ) : isRunning ? (
                            <>
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                                Em execução
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                disabled={isUpdating}
                                onClick={() => updateExecutionStatus(item.originalIndex, "concluida")}
                              >
                                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Concluir etapa
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-medium text-violet-700 bg-violet-100 rounded-md px-2 py-1">
                                Próxima etapa
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                                disabled={isUpdating || position !== 0}
                                onClick={() => updateExecutionStatus(item.originalIndex, "em_execucao")}
                              >
                                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                Iniciar etapa
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {etapasConcluidas > 0 && (
                <p className="text-[11px] text-gray-400">
                  Etapas já executadas ficam ocultas desta fila para não poluir a operação.
                </p>
              )}
            </div>
          )}

          {/* ── Itens comerciais / histórico original ── */}
          <div className={`mb-6 -mx-6 sm:mx-0 overflow-x-auto ${jaVendido ? "sold-historical-table" : ""}`}>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-center px-3 py-2.5 rounded-tl-lg font-medium w-20">Etapa</th>
                  <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                  <th className="text-center px-4 py-2.5 font-medium w-20">Qtd</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Valor Unit.</th>
                  <th className="text-right px-4 py-2.5 rounded-tr-lg font-medium w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {itensExecucao.map((item, i) => (
                  <tr key={item.originalIndex} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-2.5 text-center text-gray-500 font-semibold">{item.ordemExecucao}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{item.nome}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{item.quantidade}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 font-mono">
                      {fmtCurrency(item.valorUnitario)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-semibold font-mono">
                      {fmtCurrency(item.quantidade * item.valorUnitario)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900">
                  <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 text-lg font-mono">
                    {fmtCurrency(totalExibido)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Recorrência ── */}
          {proposta.recorrente && proposta.valorMensal && (
            <div className="mb-6 bg-violet-50 border border-violet-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-violet-800 mb-3">Cobrança Recorrente Mensal</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Mensalidade</p>
                  <p className="font-semibold text-violet-900">{fmtCurrency(proposta.valorMensal)}</p>
                </div>
                {proposta.prazoContratoMeses && (
                  <div>
                    <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Prazo</p>
                    <p className="font-semibold text-violet-900">
                      {proposta.prazoContratoMeses} {proposta.prazoContratoMeses === 1 ? "mês" : "meses"}
                    </p>
                  </div>
                )}
                {recorrenteTotal && (
                  <div>
                    <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Total do Contrato</p>
                    <p className="font-bold text-violet-900">{fmtCurrency(recorrenteTotal)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Condições Comerciais ── */}
          {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega ||
            (proposta as any).formaPagamentoMensalidade || (proposta as any).condPagamentoMensalidade) && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Condições Comerciais
              </h3>

              {/* Licença / Implantação */}
              {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega) && (
                <div className="mb-3">
                  {proposta.recorrente && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Licença / Implantação
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {proposta.formaPagamento && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Forma de Pagamento</p>
                        <p className="font-medium text-gray-800">
                          {FORMA_PAGAMENTO_LABELS[proposta.formaPagamento] ?? proposta.formaPagamento}
                        </p>
                      </div>
                    )}
                    {proposta.condPagamento && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Condição</p>
                        <p className="font-medium text-gray-800">{proposta.condPagamento}</p>
                      </div>
                    )}
                    {proposta.prazoEntrega && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Prazo de Entrega</p>
                        <p className="font-medium text-gray-800">
                          {isIsoDate(proposta.prazoEntrega) ? fmtDate(proposta.prazoEntrega) : proposta.prazoEntrega}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mensalidade */}
              {proposta.recorrente && ((proposta as any).formaPagamentoMensalidade || (proposta as any).condPagamentoMensalidade) && (
                <div className="mt-3 pt-3 border-t border-violet-100">
                  <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">
                    Mensalidade
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    {(proposta as any).formaPagamentoMensalidade && (
                      <div>
                        <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Forma de Pagamento</p>
                        <p className="font-medium text-gray-800">
                          {FORMA_PAGAMENTO_LABELS[(proposta as any).formaPagamentoMensalidade] ?? (proposta as any).formaPagamentoMensalidade}
                        </p>
                      </div>
                    )}
                    {(proposta as any).condPagamentoMensalidade && (
                      <div>
                        <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Condição</p>
                        <p className="font-medium text-gray-800">{(proposta as any).condPagamentoMensalidade}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Observações ── */}
          {proposta.observacoes && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Observações
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-line">
                {proposta.observacoes}
              </div>
            </div>
          )}

          {/* ── Footer: vendedor + número ── */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
              {user?.name && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Responsável / Vendedor</p>
                  <p className="text-sm font-medium text-gray-700">{user.name}</p>
                  {user.email && <p className="text-xs text-gray-500">{user.email}</p>}
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  Emitido em {fmtDateTime(proposta.createdAt)}
                </p>
                <p className="text-xs text-gray-400 font-mono">
                  Nº {proposta.numero ?? proposta.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-full sm:max-w-2xl p-0 flex flex-col max-h-[90vh] overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Editar Orçamento</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-5 space-y-6">

              {/* Título */}
              <div className="space-y-1.5">
                <Label htmlFor="e-titulo">Título</Label>
                <Input
                  id="e-titulo"
                  value={eTitulo}
                  onChange={(e) => setETitulo(e.target.value)}
                  placeholder="Ex: Proposta de Desenvolvimento Web"
                />
              </div>

              {/* Validade */}
              <div className="space-y-1.5">
                <Label htmlFor="e-validade">Válido até</Label>
                <Input
                  id="e-validade"
                  type="date"
                  value={eValidade}
                  onChange={(e) => setEValidade(e.target.value)}
                />
              </div>

              {/* ── Itens ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Itens</Label>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar item
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_72px_96px_36px] gap-1 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b">
                    <span>Descrição</span>
                    <span className="text-center">Qtd</span>
                    <span className="text-right">Valor Unit.</span>
                    <span />
                  </div>

                  {eItens.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-6">
                      Nenhum item. Clique em "Adicionar item".
                    </p>
                  )}

                  {eItens.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_72px_96px_36px] gap-1 items-center px-2 py-1.5 border-b last:border-0"
                    >
                      <Input
                        value={item.nome}
                        onChange={(e) => updateItem(i, "nome", e.target.value)}
                        placeholder="Nome do item"
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantidade || ""}
                        onChange={(e) => updateItem(i, "quantidade", e.target.value)}
                        className="h-8 text-sm text-center"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.valorUnitario || ""}
                        onChange={(e) => updateItem(i, "valorUnitario", e.target.value)}
                        className="h-8 text-sm text-right font-mono"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeItem(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  {eItens.length > 0 && (
                    <div className="flex justify-end px-3 py-2 bg-gray-50 border-t text-sm font-semibold">
                      Total: {fmtCurrency(editTotal)}
                    </div>
                  )}
                </div>
              </div>

              {/* Condições Comerciais — Licença / Implantação */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {eRecorrente ? "Condições — Licença / Implantação" : "Condições Comerciais"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Forma de Pagamento</Label>
                    <Select value={eFormaPagamento} onValueChange={setEFormaPagamento}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="a_combinar">A Combinar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-cond">Condição de Pagamento</Label>
                    <Input
                      id="e-cond"
                      value={eCondPagamento}
                      onChange={(e) => setECondPagamento(e.target.value)}
                      placeholder="Ex: 50% entrada + 50% entrega"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Condições Comerciais — Mensalidade (apenas quando recorrente) */}
              {eRecorrente && (
                <div>
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">
                    Condições — Mensalidade
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Forma de Pagamento da Mensalidade</Label>
                      <Select value={eFormaPagamentoMensalidade} onValueChange={setEFormaPagamentoMensalidade}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                          <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="a_combinar">A Combinar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-cond-mensal">Condição da Mensalidade</Label>
                      <Input
                        id="e-cond-mensal"
                        value={eCondPagamentoMensalidade}
                        onChange={(e) => setECondPagamentoMensalidade(e.target.value)}
                        placeholder="Ex: Todo dia 10 via boleto"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Prazo de Entrega */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e-prazo">Prazo de Entrega</Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="e-prazo"
                      type="date"
                      value={ePrazoEntrega}
                      onChange={(e) => setEPrazoEntrega(e.target.value)}
                      className="h-9 flex-1"
                    />
                    {ePrazoEntrega && isIsoDate(ePrazoEntrega) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 px-2.5 gap-1.5 text-xs whitespace-nowrap"
                        onClick={() => {
                          const desc = `Orçamento: ${eTitulo}\nLead: ${lead?.nome ?? ""}\nTotal: ${fmtCurrency(eItens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0))}`;
                          window.open(buildGoogleCalendarUrl(eTitulo, ePrazoEntrega, desc), "_blank");
                        }}
                      >
                        <CalendarIcon className="h-3.5 w-3.5 text-blue-600" />
                        <span className="hidden sm:inline text-blue-600">Google Agenda</span>
                        <ExternalLink className="h-3 w-3 text-blue-500" />
                      </Button>
                    )}
                  </div>
                  {ePrazoEntrega && isIsoDate(ePrazoEntrega) && (
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(ePrazoEntrega)} · Clique em "Google Agenda" para criar o evento de entrega
                    </p>
                  )}
                </div>
              </div>

              {/* Recorrência */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Cobrança Recorrente Mensal</p>
                    <p className="text-xs text-muted-foreground">Ativar para contratos com mensalidade</p>
                  </div>
                  <Switch checked={eRecorrente} onCheckedChange={setERecorrente} />
                </div>

                {eRecorrente && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="e-mensal">Mensalidade (R$)</Label>
                      <Input
                        id="e-mensal"
                        type="number"
                        min="0"
                        step="0.01"
                        value={eValorMensal}
                        onChange={(e) => setEValorMensal(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="e-prazocontrato">Prazo (meses)</Label>
                      <Input
                        id="e-prazocontrato"
                        type="number"
                        min="1"
                        step="1"
                        value={ePrazoContrato}
                        onChange={(e) => setEPrazoContrato(e.target.value)}
                        placeholder="12"
                      />
                    </div>
                    {eValorMensal && ePrazoContrato && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Total do contrato: {fmtCurrency(parseFloat(eValorMensal) * parseInt(ePrazoContrato))}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label htmlFor="e-obs">Observações</Label>
                <Textarea
                  id="e-obs"
                  value={eObservacoes}
                  onChange={(e) => setEObservacoes(e.target.value)}
                  placeholder="Notas adicionais, condições especiais…"
                  rows={4}
                />
              </div>

            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t shrink-0 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .sold-historical-table {
          display: none;
        }
        @media print {
          .screen-execution {
            display: none !important;
          }
          .sold-historical-table {
            display: block !important;
          }
          body * { visibility: hidden !important; }
          #proposta-print,
          #proposta-print * { visibility: visible !important; }
          #proposta-print {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 8mm 12mm !important;
            box-shadow: none !important;
            background: white !important;
            overflow: visible !important;
          }
        }
        @media (max-width: 480px) {
          #proposta-print {
            padding: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
}
