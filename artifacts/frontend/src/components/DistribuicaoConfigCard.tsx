import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shuffle } from "lucide-react";

type DistribuicaoConfig = { tenantId: string; criterios: string[] };

const OPCOES = [
  { value: "segmento,territorio", label: "Linha/segmento primeiro, região desempata" },
  { value: "territorio,segmento", label: "Região primeiro, linha/segmento desempata" },
] as const;

/**
 * Só existem 2 critérios hoje (segmento e território), então a "ordem
 * configurável" vira uma escolha simples entre as duas combinações
 * possíveis — não precisa de drag-and-drop pra 2 itens.
 */
export function DistribuicaoConfigCard({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["tenant-distribuicao-config", tenantId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(tenantId),
    queryFn: () => customFetch<DistribuicaoConfig>(`/api/tenants/${tenantId}/distribuicao-config`),
  });

  const [selected, setSelected] = useState<string>("segmento,territorio");

  useEffect(() => {
    if (data?.criterios?.length) setSelected(data.criterios.join(","));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (criterios: string[]) =>
      customFetch<DistribuicaoConfig>(`/api/tenants/${tenantId}/distribuicao-config`, {
        method: "PUT",
        body: JSON.stringify({ criterios }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Ordem de distribuição atualizada" });
    },
    onError: () => {
      toast({ title: "Não foi possível salvar", variant: "destructive" });
    },
  });

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Shuffle className="h-4 w-4" />
          Ordem de distribuição automática de leads
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Quando um lead novo tem linha/segmento e região identificados ao mesmo tempo, qual critério decide primeiro o vendedor responsável. O outro critério desempata dentro do grupo escolhido pelo primeiro.
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <Label>Critério prioritário</Label>
        <Select value={selected} onValueChange={setSelected} disabled={isLoading}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCOES.map((opcao) => (
              <SelectItem key={opcao.value} value={opcao.value}>
                {opcao.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={() => mutation.mutate(selected.split(","))}
        disabled={mutation.isPending || isLoading}
      >
        {mutation.isPending ? "Salvando…" : "Salvar ordem"}
      </Button>
    </div>
  );
}
