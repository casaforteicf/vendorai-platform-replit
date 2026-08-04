import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Package, Star, CheckCircle2, Truck, Clock } from "lucide-react";

interface RastreioData {
  status: string;
  enderecoColeta: string;
  enderecoEntrega: string;
  enderecoEntregaLat: number | null;
  enderecoEntregaLng: number | null;
  localizacaoLat: number | null;
  localizacaoLng: number | null;
  localizacaoAtualizadaEm: string | null;
  dataEntregaPrevista: string | null;
  dataEntregaReal: string | null;
  motoristaNome: string | null;
  avaliacaoNota: string | null;
  etaMinutos: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  cotacao_pendente: "Aguardando cotação",
  cotado: "Cotado",
  aprovado: "Aprovado — aguardando motorista",
  coletado: "Coletado",
  em_transito: "A caminho",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export default function RastreioFrete() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [avaliado, setAvaliado] = useState(false);

  const { data, isLoading, error } = useQuery<RastreioData>({
    queryKey: ["rastreio-frete", id],
    queryFn: () => fetch(`/api/public/fretes/${id}`).then((r) => {
      if (!r.ok) throw new Error("Entrega não encontrada");
      return r.json();
    }),
    enabled: !!id,
    refetchInterval: 15_000, // atualiza sozinho a cada 15s, sem precisar dar refresh
  });

  const avaliarMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/public/fretes/${id}/avaliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario: comentario || undefined }),
      }).then((r) => { if (!r.ok) throw new Error("Erro ao enviar avaliação"); return r.json(); }),
    onSuccess: () => {
      setAvaliado(true);
      qc.invalidateQueries({ queryKey: ["rastreio-frete", id] });
    },
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">Não encontramos essa entrega. Confira se o link está correto.</p>
        </div>
      </div>
    );
  }

  const jaAvaliado = avaliado || !!data.avaliacaoNota;
  const emAndamento = data.status === "coletado" || data.status === "em_transito";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center">
          <Truck className="h-8 w-8 mx-auto mb-2 text-primary" />
          <h1 className="text-xl font-bold">Acompanhe sua entrega</h1>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${data.status === "entregue" ? "bg-emerald-500" : data.status === "cancelado" ? "bg-red-500" : "bg-blue-500 animate-pulse"}`} />
            <span className="font-semibold">{STATUS_LABEL[data.status] ?? data.status}</span>
          </div>
          {emAndamento && data.etaMinutos != null && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Previsão de chegada: ~{data.etaMinutos} min
            </p>
          )}
          {data.motoristaNome && (
            <p className="text-sm text-muted-foreground">Motorista: {data.motoristaNome}</p>
          )}
          <div className="text-sm space-y-0.5 pt-1 border-t">
            <p className="text-muted-foreground">Destino</p>
            <p className="font-medium">{data.enderecoEntrega}</p>
          </div>
        </div>

        {emAndamento && data.localizacaoLat != null && data.localizacaoLng != null && (
          <div className="rounded-xl border overflow-hidden">
            <LiveDeliveryMap
              lat={data.localizacaoLat}
              lng={data.localizacaoLng}
              label="Localização atual"
              updatedAt={data.localizacaoAtualizadaEm}
              height={260}
              destination={data.enderecoEntregaLat != null && data.enderecoEntregaLng != null ? { lat: data.enderecoEntregaLat, lng: data.enderecoEntregaLng } : undefined}
            />
          </div>
        )}

        {data.status === "entregue" && (
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Entrega concluída</span>
            </div>
            {jaAvaliado ? (
              <p className="text-sm text-muted-foreground">Obrigado por avaliar! 🙌</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Como foi a entrega?</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setNota(n)} className="p-0.5">
                      <Star className={`h-7 w-7 ${n <= nota ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    </button>
                  ))}
                </div>
                <Textarea placeholder="Comentário (opcional)" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
                <Button className="w-full" disabled={nota === 0 || avaliarMutation.isPending} onClick={() => avaliarMutation.mutate()}>
                  {avaliarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar avaliação
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2">Powered by Vendor.ai</p>
      </div>
    </div>
  );
}
