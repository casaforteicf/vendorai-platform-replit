import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Loader2, FileText } from "lucide-react";

const BASE = typeof import.meta.env !== "undefined" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/$/, "")
  : "";

function api(path: string) {
  return `${BASE}${path}`;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type PropostaPublic =
  | {
      kind: "budget";
      id: string;
      titulo: string;
      itens: Array<{ nome: string; quantidade: number; valorUnitario: number; descricao?: string }>;
      valorTotal: string | null;
      status: string;
      validadeAte: string | null;
      numero: string | null;
      observacoes: string | null;
      condPagamento: string | null;
    }
  | {
      kind: "generated";
      id: string;
      version: number;
      status: string;
      createdAt: string;
    };

export default function PublicProposta() {
  const { token } = useParams<{ token: string }>();
  const [accepted, setAccepted] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);

  const { data: proposta, isLoading, error } = useQuery<PropostaPublic>({
    queryKey: ["public-proposta", token],
    queryFn: async () => {
      const res = await fetch(api(`/api/public/proposals/${token}`));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Proposta não encontrada");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api(`/api/public/proposals/${token}/accept`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setAlreadyAccepted(true);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Erro ao aceitar proposta");
    },
    onSuccess: () => {
      setAccepted(true);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error || !proposta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Proposta não encontrada</h2>
            <p className="text-sm text-gray-500">
              {error instanceof Error ? error.message : "Este link é inválido ou a proposta não existe."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (proposta.kind === "generated") {
    return (
      <div className="min-h-screen bg-white">
        <iframe
          title={`Proposta v${proposta.version}`}
          src={api(`/api/public/generated-proposals/${proposta.id}/html`)}
          className="w-full min-h-screen border-0"
          style={{ height: "100vh" }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    );
  }

  const isExpired = proposta.validadeAte && new Date(proposta.validadeAte) < new Date();
  const isTerminal = proposta.status === "aceita" || proposta.status === "rejeitada" || proposta.status === "expirada";
  const canAccept = !isExpired && !isTerminal && !accepted && !alreadyAccepted;

  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-10 pb-10 text-center">
            <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Proposta aceita!</h2>
            <p className="text-sm text-gray-500 mt-2">
              Obrigado! Nossa equipe entrará em contato em breve com os próximos passos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadyAccepted || proposta.status === "aceita") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-10 pb-10 text-center">
            <CheckCircle className="h-14 w-14 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Esta proposta já foi aceita</h2>
            <p className="text-sm text-gray-500">Nenhuma ação adicional é necessária.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <Card className="shadow-xl border-0">
          <CardHeader className="border-b bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-t-lg px-6 py-6">
            <div className="flex items-center gap-3">
              <FileText className="h-7 w-7" />
              <div>
                <CardTitle className="text-xl font-bold text-white">
                  {proposta.titulo}
                </CardTitle>
                {proposta.numero && (
                  <p className="text-violet-100 text-sm mt-0.5">{proposta.numero}</p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Status / validade */}
            <div className="flex items-center gap-3">
              {isExpired ? (
                <Badge variant="destructive">Expirada</Badge>
              ) : proposta.validadeAte ? (
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  Válida até {new Date(proposta.validadeAte).toLocaleDateString("pt-BR")}
                </Badge>
              ) : null}
              {(proposta.status === "rejeitada") && (
                <Badge variant="destructive">Recusada</Badge>
              )}
            </div>

            {/* Itens */}
            {proposta.itens.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Itens da proposta</h3>
                <div className="divide-y rounded-lg border overflow-hidden">
                  {proposta.itens.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-white">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                        {item.descricao && (
                          <p className="text-xs text-gray-500 mt-0.5">{item.descricao}</p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xs text-gray-500">
                          {item.quantidade}× {formatCurrency(item.valorUnitario)}
                        </p>
                        <p className="text-sm font-semibold text-gray-800">
                          {formatCurrency(item.quantidade * item.valorUnitario)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between py-3 px-4 bg-violet-50 rounded-lg">
              <span className="text-sm font-semibold text-gray-700">Total</span>
              <span className="text-xl font-bold text-violet-700">
                {formatCurrency(proposta.valorTotal)}
              </span>
            </div>

            {/* Condição de pagamento */}
            {proposta.condPagamento && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Condição de pagamento:</span> {proposta.condPagamento}
              </div>
            )}

            {/* Observações */}
            {proposta.observacoes && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                <span className="font-medium block mb-1">Observações:</span>
                {proposta.observacoes}
              </div>
            )}

            {/* CTA */}
            {canAccept && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 text-base"
                size="lg"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  "✓ Aceitar Proposta"
                )}
              </Button>
            )}

            {acceptMutation.error && (
              <p className="text-sm text-red-600 text-center">
                {acceptMutation.error instanceof Error
                  ? acceptMutation.error.message
                  : "Erro ao aceitar proposta"}
              </p>
            )}

            {!canAccept && !accepted && !alreadyAccepted && (
              <div className="text-center text-sm text-gray-500 py-2">
                {isExpired
                  ? "Esta proposta expirou e não pode mais ser aceita."
                  : "Esta proposta não está disponível para aceite."}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by VendorAI
        </p>
      </div>
    </div>
  );
}
