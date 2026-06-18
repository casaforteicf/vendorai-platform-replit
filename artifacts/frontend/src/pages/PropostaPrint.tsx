import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetProposta,
  getGetPropostaQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
} from "@workspace/api-client-react";
import { Loader2, Printer, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const { data: proposta, isLoading: propostaLoading } = useGetProposta(id ?? "", {
    query: { enabled: !!id, queryKey: getGetPropostaQueryKey(id ?? "") },
  });

  const { data: lead, isLoading: leadLoading } = useGetLead(proposta?.leadId ?? "", {
    query: { enabled: !!proposta?.leadId, queryKey: getGetLeadQueryKey(proposta?.leadId ?? "") },
  });

  const { data: tenant } = useGetTenant(user?.tenantId ?? "", {
    query: { enabled: !!user?.tenantId, queryKey: getGetTenantQueryKey(user?.tenantId ?? "") },
  });

  useEffect(() => {
    if (proposta && lead && !propostaLoading && !leadLoading) {
      document.title = `Orçamento ${proposta.numero ?? proposta.id.slice(0, 8)} — ${proposta.titulo}`;
    }
  }, [proposta, lead, propostaLoading, leadLoading]);

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

  const total = proposta.itens.reduce(
    (s, i) => s + i.quantidade * i.valorUnitario,
    0
  );
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Action bar — hidden on print */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b px-6 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => navigate("/propostas")}>
          ← Voltar
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
          asChild
        >
          <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" />
            Enviar por WhatsApp
          </a>
        </Button>
        <Button size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / Salvar PDF
        </Button>
      </div>

      {/* Print content */}
      <div className="pt-20 no-print-padding">
        <div
          id="proposta-print"
          className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 p-12"
          style={{ minHeight: "297mm" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-200">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {(tenant as any)?.nomeFantasia || (tenant as any)?.razaoSocial || "Empresa"}
              </h1>
              {(tenant as any)?.cnpj && (
                <p className="text-sm text-gray-500 mt-0.5">CNPJ: {(tenant as any).cnpj}</p>
              )}
            </div>
            <div className="text-right">
              <div className="inline-block bg-gray-100 rounded-lg px-4 py-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Orçamento</p>
                <p className="text-lg font-bold text-gray-900 font-mono">
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

          {/* Cliente */}
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

          {/* Título */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">{proposta.titulo}</h2>
          </div>

          {/* Itens */}
          <div className="mb-6">
            <table className="w-full text-sm">
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
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
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

          {/* Recorrência */}
          {proposta.recorrente && proposta.valorMensal && (
            <div className="mb-6 bg-violet-50 border border-violet-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-violet-800 mb-3">Cobrança Recorrente Mensal</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Mensalidade</p>
                  <p className="font-semibold text-violet-900">{fmtCurrency(proposta.valorMensal)}</p>
                </div>
                {proposta.prazoContratoMeses && (
                  <div>
                    <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Prazo do Contrato</p>
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

          {/* Condições Comerciais */}
          {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega) && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Condições Comerciais
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
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
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Condição de Pagamento</p>
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

          {/* Observações */}
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

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              Orçamento gerado em {fmtDateTime(proposta.createdAt)} · Número {proposta.numero ?? proposta.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: white; }
          #proposta-print {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            padding: 8mm 12mm !important;
          }
          .no-print-padding { padding-top: 0 !important; }
        }
      `}</style>
    </div>
  );
}
