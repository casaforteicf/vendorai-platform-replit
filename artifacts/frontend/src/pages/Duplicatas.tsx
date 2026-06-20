import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Merge, XCircle, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListTenantDuplicateLeads,
  getListTenantDuplicateLeadsQueryKey,
  useMergeLead,
  useDismissDuplicateLead,
  getListTenantLeadsQueryKey,
} from "@workspace/api-client-react";

export default function Duplicatas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [mergingId, setMergingId] = useState<string | null>(null);

  const resolvedTenantId = user?.tenantId ?? "";

  const { data: duplicates, isLoading } = useListTenantDuplicateLeads(
    resolvedTenantId,
    {
      query: {
        enabled: !!resolvedTenantId,
        queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId),
      },
    }
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
          queryClient.invalidateQueries({
            queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId),
          });
          queryClient.invalidateQueries({
            queryKey: getListTenantLeadsQueryKey(resolvedTenantId),
          });
          setMergingId(null);
        },
        onError: (err: any) => {
          toast({ title: err.message || "Erro ao mesclar", variant: "destructive" });
          setMergingId(null);
        },
      }
    );
  }

  function handleDismiss(leadId: string) {
    dismissLead.mutate(
      { id: leadId },
      {
        onSuccess: () => {
          toast({ title: "Duplicata descartada." });
          queryClient.invalidateQueries({
            queryKey: getListTenantDuplicateLeadsQueryKey(resolvedTenantId),
          });
        },
        onError: (err: any) => {
          toast({ title: err.message || "Erro ao descartar", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/leads")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Possíveis Duplicatas</h1>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      )}

      {!isLoading && (!duplicates || duplicates.length === 0) && (
        <p className="text-muted-foreground">Nenhuma duplicata encontrada.</p>
      )}

      <div className="grid gap-4">
        {duplicates?.map((item: any) => {
          const lead = item.lead;
          const similar = item.similar;
          return (
            <Card key={lead.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {lead.nome}
                  </CardTitle>
                  <Badge variant="outline">{lead.source}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {similar && (
                  <div className="bg-muted rounded-md p-3 text-sm">
                    <p className="font-medium text-muted-foreground mb-1">
                      Similar a:
                    </p>
                    <p className="font-medium">{similar.nome}</p>
                    <p className="text-muted-foreground">
                      {similar.telefone && `Tel: ${similar.telefone}`}
                      {similar.documento && ` • Doc: ${similar.documento}`}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleMerge(lead.id, similar.id)}
                        disabled={mergingId === lead.id}
                      >
                        {mergingId === lead.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Merge className="h-3 w-3 mr-1" />
                        )}
                        Mesclar em {similar.nome}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDismiss(lead.id)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Manter separado
                      </Button>
                    </div>
                  </div>
                )}
                {!similar && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Lead similar não encontrado (pode ter sido deletado).
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDismiss(lead.id)}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Limpar flag
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
