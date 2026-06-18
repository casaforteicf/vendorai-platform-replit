import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProposta,
  getGetPropostaQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  useUpdatePropostaStatus,
  useUpdateDeal,
} from "@workspace/api-client-react";
import { Loader2, Printer, MessageCircle, Pencil, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
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

export default function PropostaPrint() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [markingVendido, setMarkingVendido] = useState(false);

  const { data: proposta, isLoading: propostaLoading } = useGetProposta(id ?? "", {
    query: { enabled: !!id, queryKey: getGetPropostaQueryKey(id ?? "") },
  });

  const { data: lead, isLoading: leadLoading } = useGetLead(proposta?.leadId ?? "", {
    query: { enabled: !!proposta?.leadId, queryKey: getGetLeadQueryKey(proposta?.leadId ?? "") },
  });

  const { data: bp } = useGetBusinessProfileByTenant(user?.tenantId ?? "", {
    query: { enabled: !!user?.tenantId, queryKey: getGetBusinessProfileByTenantQueryKey(user?.tenantId ?? "") },
  });

  const updateStatus = useUpdatePropostaStatus();
  const updateDeal = useUpdateDeal();

  useEffect(() => {
    if (proposta && lead && !propostaLoading && !leadLoading) {
      document.title = `Orçamento ${proposta.numero ?? proposta.id.slice(0, 8)} — ${proposta.titulo}`;
    }
  }, [proposta, lead, propostaLoading, leadLoading]);

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
        description: proposta.dealId ? "Proposta aceita e card movido para Ganho na pipeline." : "Proposta marcada como aceita.",
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

  if (propostaLoading || leadLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
  const logoUrl = bp?.logoUrl;
  const jaVendido = proposta.status === "aceita";
  const podeVender = proposta.status === "rascunho" || proposta.status === "enviada";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Action bar (hidden on print) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b px-3 sm:px-6 py-2.5 flex items-center gap-2 shadow-sm flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate(proposta.leadId ? `/leads/${proposta.leadId}` : "/propostas")}>
          ← Voltar
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(proposta.leadId ? `/leads/${proposta.leadId}` : "/propostas")}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Editar</span>
        </Button>

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

        <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
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

            {/* Direita: número + datas + status */}
            <div className="text-right shrink-0">
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
                proposta.status === "rejeitada" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {STATUS_LABELS[proposta.status] ?? proposta.status}
              </span>
            </div>
          </div>

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

          {/* ── Itens ── */}
          <div className="mb-6 -mx-6 sm:mx-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-4 py-2.5 rounded-tl-lg font-medium">Descrição</th>
                  <th className="text-center px-4 py-2.5 font-medium w-20">Qtd</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Valor Unit.</th>
                  <th className="text-right px-4 py-2.5 rounded-tr-lg font-medium w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {proposta.itens.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
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
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">
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
          {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega) && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Condições Comerciais
              </h3>
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
                    <p className="font-medium text-gray-800">{proposta.prazoEntrega}</p>
                  </div>
                )}
              </div>
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

      <style>{`
        @media print {
          /* Esconde tudo — sidebar, header, action bar */
          body * { visibility: hidden !important; }
          /* Mostra apenas o conteúdo do orçamento */
          #proposta-print,
          #proposta-print * { visibility: visible !important; }
          #proposta-print {
            position: fixed !important;
            inset: 0 !important;
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
