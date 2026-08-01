import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LiveDeliveryMap } from "@/components/LiveDeliveryMap";
import { Truck, MapPin, ArrowRight, Loader2, Navigation, Package } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const STATUS_LABELS: Record<string, string> = {
  cotacao_pendente: "Cotação pendente", cotado: "Cotado", aprovado: "Aprovado",
  coletado: "Coletado", em_transito: "Em trânsito", entregue: "Entregue", cancelado: "Cancelado",
};
const TIPO_VEICULO_LABELS: Record<string, string> = {
  utilitario: "Utilitário", van: "Van", caminhao_toco: "Caminhão toco",
  caminhao_truck: "Caminhão truck", carreta: "Carreta",
};
const STATUS_FLOW = ["aprovado", "coletado", "em_transito", "entregue"] as const;
function nextStatus(atual: string): string | null {
  const idx = STATUS_FLOW.indexOf(atual as any);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

// Compartilha a localização do navegador enquanto ativo — usado só na
// entrega em andamento (coletado/em_transito), pra não gastar bateria à toa.
function useLocationSharing(active: boolean, onUpdate: (lat: number, lng: number) => void) {
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => onUpdate(pos.coords.latitude, pos.coords.longitude),
      () => { /* usuário pode ter negado permissão — silencioso, não trava a tela */ },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

function CargaOfertaCard({ carga, tenantId, onAccepted }: { carga: any; tenantId: string; onAccepted: () => void }) {
  const { toast } = useToast();
  const accept = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${carga.id}/aceitar`, { method: "POST", headers: authHeaders() })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
          return r.json();
        }),
    onSuccess: () => { toast({ title: "Carga aceita! Já é sua." }); onAccepted(); },
    onError: (e: any) => toast({ title: "Não deu dessa vez", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{carga.cliente?.nome ?? "Cliente"}</span>
          {carga.tipoVeiculoDesejado && (
            <Badge variant="outline" className="text-xs">{TIPO_VEICULO_LABELS[carga.tipoVeiculoDesejado] ?? carga.tipoVeiculoDesejado}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <MapPin className="h-3 w-3 shrink-0 mt-0.5" /> {carga.enderecoColeta}
        </p>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" /> {carga.enderecoEntrega}
        </p>
        {carga.valorCotado != null && (
          <p className="text-sm font-bold text-emerald-700">
            {Number(carga.valorCotado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}
        <Button className="w-full mt-2" onClick={() => accept.mutate()} disabled={accept.isPending}>
          {accept.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Aceitar entrega
        </Button>
      </CardContent>
    </Card>
  );
}

function MinhaEntregaCard({ carga, tenantId }: { carga: any; tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(carga.status === "coletado" || carga.status === "em_transito");

  const updateLocation = useMutation({
    mutationFn: (coords: { lat: number; lng: number }) =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${carga.id}/localizacao`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(coords),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fretes-minhas-entregas", tenantId] }),
  });

  useLocationSharing(sharing, (lat, lng) => updateLocation.mutate({ lat, lng }));

  const advance = useMutation({
    mutationFn: (status: string) =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${carga.id}/status`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["fretes-minhas-entregas", tenantId] });
      setSharing(status === "coletado" || status === "em_transito");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const next = nextStatus(carga.status);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{carga.cliente?.nome ?? "Cliente"}</span>
          <Badge variant="outline" className="text-xs">{STATUS_LABELS[carga.status] ?? carga.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <MapPin className="h-3 w-3 shrink-0 mt-0.5" /> {carga.enderecoColeta}
        </p>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5" /> {carga.enderecoEntrega}
        </p>

        {(carga.status === "coletado" || carga.status === "em_transito") && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5" /> Compartilhar localização ao vivo</span>
            <Switch checked={sharing} onCheckedChange={setSharing} />
          </div>
        )}

        {carga.localizacaoLat != null && carga.localizacaoLng != null && (
          <LiveDeliveryMap
            lat={carga.localizacaoLat}
            lng={carga.localizacaoLng}
            label="Sua localização atual"
            updatedAt={carga.localizacaoAtualizadaEm}
            height={200}
          />
        )}

        {next && (
          <Button className="w-full" variant="outline" onClick={() => advance.mutate(next)} disabled={advance.isPending}>
            {advance.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Avançar → {STATUS_LABELS[next]}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function FretesMotorista() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [tab, setTab] = useState<"disponiveis" | "minhas">("disponiveis");

  const { data: disponiveis = [], isLoading: loadingDisponiveis } = useQuery<any[]>({
    queryKey: ["fretes-disponiveis", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/fretes/cargas/disponiveis`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && tab === "disponiveis",
    refetchInterval: 10_000,
  });

  const { data: minhas = [], isLoading: loadingMinhas } = useQuery<any[]>({
    queryKey: ["fretes-minhas-entregas", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/fretes/cargas/minhas`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
    refetchInterval: tab === "minhas" ? 15_000 : false,
  });

  const ativas = Array.isArray(minhas) ? minhas.filter((c: any) => c.status !== "entregue" && c.status !== "cancelado") : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-5 w-5" /> Minhas Entregas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Aceite ofertas disponíveis e acompanhe suas entregas em andamento</p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("disponiveis")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "disponiveis" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
        >
          Disponíveis {disponiveis.length > 0 && `(${disponiveis.length})`}
        </button>
        <button
          onClick={() => { setTab("minhas"); qc.invalidateQueries({ queryKey: ["fretes-minhas-entregas", tenantId] }); }}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "minhas" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
        >
          Em andamento {ativas.length > 0 && `(${ativas.length})`}
        </button>
      </div>

      {tab === "disponiveis" ? (
        loadingDisponiveis ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        ) : disponiveis.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Package className="h-8 w-8 opacity-30" />
            Nenhuma entrega disponível agora — volte em instantes.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {disponiveis.map((c: any) => (
              <CargaOfertaCard key={c.id} carga={c} tenantId={tenantId} onAccepted={() => { qc.invalidateQueries({ queryKey: ["fretes-disponiveis", tenantId] }); setTab("minhas"); }} />
            ))}
          </div>
        )
      ) : loadingMinhas ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : ativas.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">Nenhuma entrega em andamento.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ativas.map((c: any) => <MinhaEntregaCard key={c.id} carga={c} tenantId={tenantId} />)}
        </div>
      )}
    </div>
  );
}
