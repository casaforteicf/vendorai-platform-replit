import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, Trash2, Loader2, TrendingUp } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface OportunidadePrevista {
  id: string;
  descricao: string;
  valorEstimado: string | null;
  previsaoData: string | null;
  status: string;
  createdAt: string;
}

export function OportunidadesPrevistasCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");

  const { data: oportunidades = [], isLoading } = useQuery<OportunidadePrevista[]>({
    queryKey: ["oportunidades-previstas", leadId],
    queryFn: () => fetch(`/api/leads/${leadId}/oportunidades-previstas`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!leadId,
  });

  const criar = useMutation({
    mutationFn: () => fetch(`/api/leads/${leadId}/oportunidades-previstas`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ descricao, valorEstimado: valor ? Number(valor) : undefined, previsaoData: data || undefined }),
    }).then((r) => { if (!r.ok) throw new Error("Falha ao salvar"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oportunidades-previstas", leadId] });
      setDescricao(""); setValor(""); setData(""); setAberto(false);
      toast({ title: "Oportunidade prevista registrada" });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => fetch(`/api/oportunidades-previstas/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades-previstas", leadId] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Oportunidades futuras previstas
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}><Plus className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground -mt-2">
          O que você acha que esse cliente vai precisar mais pra frente — mesmo sem ter sido dito ainda. Vira contexto extra pra IA na hora de qualificar e conduzir a conversa.
        </p>

        {aberto && (
          <div className="space-y-2 rounded-lg border p-3">
            <Textarea placeholder="Ex: Deve precisar de manutenção preventiva em uns 6 meses" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Input type="number" placeholder="Valor estimado (opcional)" value={valor} onChange={(e) => setValor(e.target.value)} className="text-sm" />
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="text-sm" />
            </div>
            <Button size="sm" disabled={!descricao.trim() || criar.isPending} onClick={() => criar.mutate()}>
              {criar.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : oportunidades.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Sparkles className="h-3.5 w-3.5" /> Nenhuma previsão registrada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {oportunidades.map((op) => (
              <div key={op.id} className="flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p>{op.descricao}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {op.valorEstimado && <Badge variant="outline" className="text-xs">R$ {Number(op.valorEstimado).toFixed(2)}</Badge>}
                    {op.previsaoData && <Badge variant="outline" className="text-xs">{new Date(op.previsaoData).toLocaleDateString("pt-BR")}</Badge>}
                  </div>
                </div>
                <button onClick={() => remover.mutate(op.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
