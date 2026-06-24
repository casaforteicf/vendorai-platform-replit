import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTenantDuplicateLeads,
  getListTenantDuplicateLeadsQueryKey,
  useMergeLead,
  useDismissDuplicateLead,
  getListTenantLeadsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Merge,
  XCircle,
  Loader2,
  Copy,
  CheckCircle2,
} from "lucide-react";

interface LeadDuplicatasTabProps {
  leadId: string;
  tenantId: string;
}

export default function LeadDuplicatasTab({ leadId, tenantId }: LeadDuplicatasTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mergingId, setMergingId] = useState<string | null>(null);

  const resolvedTenantId = tenantId || user?.tenantId || "";

  const { data: allDuplicates, isLoading } = useListTenantDuplicateLeads(resolvedTenantId, {
    query: {
      enabled: !!resolvedTenantId,
      queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId),
    },
  });

  const myDuplicates = (allDuplicates ?? []).filter(
    (item: any) => item.lead?.id === leadId || item.similar?.id === leadId
  );

  const mergeLead = useMergeLead();
  const dismissLead = useDismissDuplicateLead();

  function handleMerge(duplicateId: string, targetLeadId: string) {
    setMergingId(duplicateId);
    mergeLead.mutate(
      { id: duplicateId, data: { targetLeadId } },
      {
        onSuccess: () => {
          toast({ title: "Leads mesclados com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId) });
          queryClient.invalidateQueries({ queryKey: getListTenantLeadsQueryKey(resolvedTenantId) });
          setMergingId(null);
        },
        onError: (err: any) => {
          toast({ title: err.message || "Erro ao mesclar", variant: "destructive" });
          setMergingId(null);
        },
      }
    );
  }

  function handleDismiss(flaggedLeadId: string) {
    dismissLead.mutate(
      { id: flaggedLeadId },
      {
        onSuccess: () => {
          toast({ title: "Duplicata descartada." });
          queryClient.invalidateQueries({ queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId) });
        },
        onError: (err: any) => {
          toast({ title: err.message || "Erro ao descartar", variant: "destructive" });
        },
      }
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Copy className="h-4 w-4" />
          Possíveis Duplicatas
          {!isLoading && myDuplicates.length > 0 && (
            <Badge variant="outline" className="text-xs ml-1 text-amber-600 border-amber-400">
              {myDuplicates.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando duplicatas...
          </div>
        ) : myDuplicates.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Nenhuma duplicata encontrada para este lead.
          </div>
        ) : (
          <div className="space-y-3">
            {myDuplicates.map((item: any) => {
              const flagged = item.lead;
              const similar = item.similar;
              const isFlaggedLead = flagged?.id === leadId;
              const other = isFlaggedLead ? similar : flagged;
              const flaggedId = flagged?.id;

              return (
                <div
                  key={flaggedId}
                  className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm space-y-2"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>
                      {isFlaggedLead
                        ? "Este lead foi marcado como possível duplicata"
                        : `"${flagged?.nome}" pode ser duplicata deste lead`}
                    </span>
                  </div>

                  {other ? (
                    <div className="bg-white/70 rounded border border-amber-100 p-2.5 space-y-1">
                      <p className="font-medium">{other.nome}</p>
                      <p className="text-muted-foreground text-xs">
                        {other.telefone && `Tel: ${other.telefone}`}
                        {other.documento && ` • Doc: ${other.documento}`}
                        {other.email && ` • ${other.email}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Lead similar não encontrado (pode ter sido deletado).
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {other && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleMerge(flaggedId, other.id)}
                        disabled={mergingId === flaggedId || mergeLead.isPending}
                      >
                        {mergingId === flaggedId ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        ) : (
                          <Merge className="h-3 w-3 mr-1.5" />
                        )}
                        Mesclar em {other.nome}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDismiss(flaggedId)}
                      disabled={dismissLead.isPending}
                    >
                      <XCircle className="h-3 w-3 mr-1.5" />
                      Manter separado
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
