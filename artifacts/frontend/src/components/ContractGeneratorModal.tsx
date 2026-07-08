import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Send,
  User,
  Package,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Building2,
  Mail,
  Phone,
  DollarSign,
} from "lucide-react";

interface ActiveDeal {
  id: string;
  titulo: string;
  valor: string | null;
  etapa: string;
  tipoFechamento: string | null;
  planoContratado: string | null;
}

interface DealDetail {
  id: string;
  titulo: string;
  valor: string | null;
  leadId: string | null;
  lead?: {
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    empresa: string | null;
    documento: string | null;
  } | null;
}

interface ContractGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  tenantId: string;
}

export function ContractGeneratorModal({
  open,
  onClose,
  dealId,
  tenantId,
}: ContractGeneratorModalProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set([dealId]));
  const [result, setResult] = useState<{ signUrl: string | null; zapsignDocId: string } | null>(null);

  // Load deal details (including lead)
  const dealQuery = useQuery({
    queryKey: ["deal-detail-contract", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}?includeLead=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar negócio");
      return res.json() as Promise<DealDetail>;
    },
    enabled: open,
  });

  const deal = dealQuery.data;
  const lead = deal?.lead;
  const leadId = deal?.leadId ?? null;

  // Load active deals for this lead (for pedido selection)
  const activeDealsQuery = useQuery({
    queryKey: ["active-deals-contract", tenantId, leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/leads/${leadId}/active-deals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar negócios");
      return res.json() as Promise<ActiveDeal[]>;
    },
    enabled: open && !!leadId,
  });

  // Load template info
  const templateQuery = useQuery({
    queryKey: ["contract-template", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/contract-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { hasTemplate: false, templateName: null };
      return res.json() as Promise<{ hasTemplate: boolean; templateName: string | null }>;
    },
    enabled: open,
  });

  // Load business profile (CNPJ/endereço da empresa usados no contrato)
  const businessProfileQuery = useQuery({
    queryKey: ["business-profile-contract", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/business-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ cnpj: string | null; endereco: string | null }>;
    },
    enabled: open,
  });
  const businessProfileIncompleto =
    !businessProfileQuery.isLoading &&
    (!businessProfileQuery.data?.cnpj || !businessProfileQuery.data?.endereco);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/generate-contract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selectedDealIds: Array.from(selectedDealIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar contrato");
      return data as { success: boolean; zapsignDocId: string; signUrl: string | null; warning?: string | null };
    },
    onSuccess: (data) => {
      setResult({ signUrl: data.signUrl, zapsignDocId: data.zapsignDocId });
      toast({
        title: "Contrato enviado!",
        description: "O cliente receberá o link de assinatura por e-mail via ZapSign.",
      });
      if (data.warning) {
        toast({
          title: "Atenção: perfil da empresa incompleto",
          description: data.warning,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao gerar contrato",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const toggleDeal = (id: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (id === dealId) return next; // can't deselect the current deal
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const activeDeals = activeDealsQuery.data ?? [];
  const selectedDeals = activeDeals.filter((d) => selectedDealIds.has(d.id));
  const totalValor = selectedDeals.reduce((sum, d) => sum + (d.valor ? Number(d.valor) : 0), 0);

  function fmtVal(val: string | null | undefined) {
    if (!val) return null;
    const n = Number(val);
    if (isNaN(n)) return val;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              Contrato Enviado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-1.5">
              <p className="text-sm text-green-800 font-medium">
                Contrato gerado e enviado para assinatura via ZapSign.
              </p>
              <p className="text-xs text-green-700">
                O cliente receberá um e-mail com o link para assinar digitalmente.
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">ID ZapSign</p>
              <p className="text-sm font-mono">{result.zapsignDocId}</p>
            </div>
            {result.signUrl && (
              <a
                href={result.signUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir link de assinatura do cliente
              </a>
            )}
            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  const isLoading = dealQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Contrato
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {/* Template info */}
            <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${
              templateQuery.data?.hasTemplate
                ? "bg-violet-50 border-violet-200 text-violet-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              <FileText className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {templateQuery.data?.hasTemplate ? (
                  <>
                    <p className="font-medium">Modelo personalizado ativo</p>
                    <p className="text-xs mt-0.5 opacity-80">{templateQuery.data.templateName}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Nenhum modelo personalizado</p>
                    <p className="text-xs mt-0.5 opacity-80">
                      Será usado o modelo padrão. Configure um modelo em{" "}
                      <strong>Configurações → Negócios → Modelo de Contrato</strong>.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Business profile warning */}
            {businessProfileIncompleto && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Perfil da empresa incompleto — CNPJ e/ou endereço não cadastrados. As variáveis{" "}
                  <code className="bg-background border rounded px-1 py-0.5 font-mono">{"{{empresa_cnpj}}"}</code>{" "}
                  e{" "}
                  <code className="bg-background border rounded px-1 py-0.5 font-mono">{"{{empresa_endereco}}"}</code>{" "}
                  ficarão em branco no contrato. Complete em{" "}
                  <strong>Configurações → Perfil da Empresa</strong>.
                </span>
              </div>
            )}

            {/* Lead info */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Dados do Cliente
              </h3>
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
                {lead ? (
                  <>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{lead.nome ?? "—"}</span>
                    </div>
                    {lead.empresa && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span>{lead.empresa}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.email ? (
                        <span className="text-muted-foreground">{lead.email}</span>
                      ) : (
                        <span className="text-destructive font-medium text-xs">
                          E-mail não cadastrado — obrigatório para envio
                        </span>
                      )}
                    </div>
                    {lead.telefone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{lead.telefone}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">Nenhum lead vinculado a este negócio.</p>
                )}
              </div>

              {lead && !lead.email && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-red-50 rounded-lg p-3 border border-red-200">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Cadastre o e-mail do cliente antes de enviar o contrato.</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Pedidos / deals selection */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Pedidos / Negócios a incluir
              </h3>
              <p className="text-xs text-muted-foreground">
                Selecione os negócios que serão listados como itens do contrato.
              </p>

              {activeDealsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : activeDeals.length === 0 ? (
                <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  Nenhum outro negócio ativo para este lead.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeDeals.map((d) => {
                    const isSelected = selectedDealIds.has(d.id);
                    const isCurrent = d.id === dealId;
                    return (
                      <div
                        key={d.id}
                        onClick={() => toggleDeal(d.id)}
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer transition-colors flex items-start gap-3 ${
                          isSelected
                            ? "bg-violet-50 border-violet-300"
                            : "bg-card border-border hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isCurrent}
                          className="mt-0.5 shrink-0"
                          onCheckedChange={() => toggleDeal(d.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{d.titulo}</span>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">negócio atual</Badge>
                            )}
                          </div>
                          {d.planoContratado && (
                            <p className="text-xs text-muted-foreground">{d.planoContratado}</p>
                          )}
                        </div>
                        {d.valor && (
                          <span className="text-sm font-semibold shrink-0">
                            {fmtVal(d.valor)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total */}
            {totalValor > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Valor total do contrato</p>
                  <p className="text-base font-bold text-primary">
                    {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={onClose} disabled={generateMutation.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !lead?.email}
                className="gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando contrato...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Gerar e Enviar para Assinatura
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
