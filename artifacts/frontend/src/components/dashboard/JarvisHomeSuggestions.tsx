import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

type JarvisCase = {
  id: string;
  title: string;
  detail?: string | null;
  recommendedAction?: string | null;
  severity?: "opportunity" | "attention" | "risk";
  status?: string | null;
  updatedAt?: string;
};

/** Read-only tenant-scoped suggestions; never executes actions or implies approval. */
export function JarvisHomeSuggestions({ tenantId, token }: { tenantId: string; token: string }) {
  const query = useQuery<JarvisCase[]>({
    queryKey: ["ui20-jarvis-home-cases", tenantId],
    enabled: Boolean(tenantId && token),
    queryFn: async () => {
      const response = await fetch("/api/jarvis/cases", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar recomendações");
      const payload: unknown = await response.json();
      return Array.isArray(payload) ? payload as JarvisCase[] : [];
    },
    retry: false,
    staleTime: 60_000,
  });
  const suggestions = (query.data ?? []).filter(item => !item.status || item.status === "open")
    .filter(item => typeof item.title === "string" && item.title.trim().length > 0)
    .slice(0, 3);
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Recomendações do Jarvis">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Jarvis recomenda</h2>
      {query.isPending ? <p className="text-sm text-muted-foreground">Consultando recomendações…</p> :
       query.isError ? <p className="text-sm text-muted-foreground">Recomendações indisponíveis no momento.</p> :
       suggestions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma recomendação aberta no momento.</p> :
       <ul className="space-y-3">{suggestions.map(item => (
         <li key={item.id} className="border-b pb-2 last:border-b-0 last:pb-0">
           <p className="text-sm font-medium">{item.title}</p>
           {item.recommendedAction ? <p className="mt-1 text-xs text-muted-foreground">Próxima ação sugerida: {item.recommendedAction}</p> :
             item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
         </li>
       ))}</ul>}
      <p className="mt-3 text-xs text-muted-foreground">Sugestões para análise; nenhuma ação é executada automaticamente.</p>
    </section>
  );
}
