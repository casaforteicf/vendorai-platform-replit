import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle, Loader2, Send } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function PerguntaCard({ pergunta, tenantId }: { pergunta: any; tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [resposta, setResposta] = useState("");

  const responder = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/praca-perguntas-pendentes/${pergunta.id}/responder`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ resposta }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["praca-perguntas-pendentes", tenantId] });
      toast({ title: "Resposta enviada!" });
    },
    onError: (e: any) => toast({ title: "Erro ao responder", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="px-4 py-3 border-b last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium flex-1">{pergunta.pergunta}</p>
        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
          {formatDistanceToNow(parseISO(pergunta.createdAt), { locale: ptBR, addSuffix: true })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Produto: {pergunta.productId}</p>
      <div className="flex gap-2">
        <Textarea
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="Escreva a resposta pro cliente..."
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!resposta.trim() || responder.isPending}
          onClick={() => responder.mutate()}
        >
          {responder.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Responder
        </Button>
      </div>
    </div>
  );
}

export default function PracaPerguntas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: perguntas = [], isLoading, error } = useQuery<any[]>({
    queryKey: ["praca-perguntas-pendentes", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/praca-perguntas-pendentes`, { headers: authHeaders() })
        .then(async (r) => {
          if (!r.ok) throw new Error("Não foi possível carregar as perguntas do Praça.ai agora.");
          return r.json();
        }),
    enabled: !!tenantId,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HelpCircle className="h-5 w-5" /> Perguntas — Praça.ai
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Perguntas de clientes sobre seus produtos que a IA não conseguiu responder sozinha
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : error ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Não foi possível carregar agora — o Praça.ai pode estar fora do ar. Tente de novo mais tarde.
            </p>
          ) : perguntas.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Nenhuma pergunta pendente — tudo respondido! 🎉
            </p>
          ) : (
            perguntas.map((p: any) => <PerguntaCard key={p.id} pergunta={p} tenantId={tenantId} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
