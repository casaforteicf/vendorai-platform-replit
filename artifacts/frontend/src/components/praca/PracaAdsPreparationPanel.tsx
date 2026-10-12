import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store } from "lucide-react";

type Item = { id: string; type: "product" | "service"; title: string; readyForReview: boolean; reason: string | null };
type Result = { publicationActive: boolean; totalSelected: number; readyForReview: number; items: Item[] };
export default function PracaAdsPreparationPanel() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId;
  const { data, isLoading, isError } = useQuery<Result>({
    queryKey: ["praca-preparacao", tenantId],
    enabled: !!tenantId && !!token,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/praca-ai/preparacao`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Falha na consulta");
      return r.json();
    },
  });
  return <Card>
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" />Praça.ai — anúncios selecionados</CardTitle>
      <p className="text-xs text-muted-foreground">Prévia privada. Itens preparados não são publicados automaticamente.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      {isLoading && <p className="text-sm">Carregando seleção...</p>}
      {isError && <p role="alert" className="text-sm text-destructive">Falha ao carregar preparação de anúncios.</p>}
      {data && <>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.totalSelected} selecionados</Badge>
          <Badge variant="outline">{data.readyForReview} aptos à revisão</Badge>
          <Badge variant="secondary">Publicação não ativada</Badge>
        </div>
        {!data.items.length && <p className="text-sm text-muted-foreground">Nenhum produto ou serviço selecionado.</p>}
        <ul className="divide-y">
          {data.items.map(i => <li key={`${i.type}:${i.id}`} className="flex justify-between gap-2 py-2 text-sm">
            <span className="truncate">{i.title} ({i.type === "product" ? "Produto" : "Serviço"})</span>
            <span className="text-xs text-muted-foreground shrink-0">{i.readyForReview ? "Apto à revisão" : i.reason === "inactive" ? "Inativo" : "Revisar categoria"}</span>
          </li>)}
        </ul>
      </>}
    </CardContent>
  </Card>;
}
