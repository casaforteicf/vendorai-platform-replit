import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  PackageCheck,
  Pill,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRoundCheck,
} from "lucide-react";

type PedidoStatus =
  | "aguardando_confirmacao"
  | "aguardando_receita"
  | "confirmado"
  | "em_separacao"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";

type Pedido = {
  id: string;
  status: PedidoStatus;
  temItemControlado: boolean;
  valorTotal: string | number;
  createdAt: string;
};

type Receita = {
  id: string;
  status: "ativa" | "vencida" | "utilizada" | "renovada";
  dataValidade: string;
};

type Produto = {
  id: string;
  estoque: number;
  ativo: boolean;
  exigeReceita: boolean;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error("Não foi possível carregar a operação da farmácia.");
  return response.json() as Promise<T>;
}

const FLOW = [
  {
    title: "Triagem",
    description: "Entender a intenção e confirmar os dados do pedido.",
    statuses: ["aguardando_confirmacao"] as PedidoStatus[],
    icon: Bot,
    href: "/farmacia/pedidos?status=aguardando_confirmacao",
  },
  {
    title: "Validação farmacêutica",
    description: "Receitas e itens controlados aguardando análise humana.",
    statuses: ["aguardando_receita"] as PedidoStatus[],
    icon: UserRoundCheck,
    href: "/farmacia/receitas",
  },
  {
    title: "Separação",
    description: "Pedidos liberados para conferência e picking.",
    statuses: ["confirmado", "em_separacao"] as PedidoStatus[],
    icon: PackageCheck,
    href: "/farmacia/pedidos?status=em_separacao",
  },
  {
    title: "Entrega",
    description: "Pedidos em rota até a confirmação de recebimento.",
    statuses: ["saiu_para_entrega"] as PedidoStatus[],
    icon: Truck,
    href: "/farmacia/pedidos?status=saiu_para_entrega",
  },
] as const;

export default function FarmaciaOperacao() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["farmacia-operacao", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const base = `/api/tenants/${tenantId}/farmacia`;
      const [pedidos, receitas, produtos] = await Promise.all([
        fetchJson<Pedido[]>(`${base}/pedidos`),
        fetchJson<Receita[]>(`${base}/receitas`),
        fetchJson<Produto[]>(`${base}/produtos`),
      ]);
      return { pedidos, receitas, produtos };
    },
  });

  const metrics = useMemo(() => {
    const pedidos = data?.pedidos ?? [];
    const receitas = data?.receitas ?? [];
    const produtos = data?.produtos ?? [];
    const agora = Date.now();
    const limiteRenovacao = agora + 30 * 24 * 60 * 60 * 1000;

    return {
      aguardandoAcao: pedidos.filter((p) => p.status === "aguardando_confirmacao" || p.status === "aguardando_receita").length,
      aguardandoFarmaceutico: pedidos.filter((p) => p.status === "aguardando_receita").length,
      emOperacao: pedidos.filter((p) => ["confirmado", "em_separacao", "saiu_para_entrega"].includes(p.status)).length,
      receitasRenovacao: receitas.filter((r) => {
        const validade = new Date(r.dataValidade).getTime();
        return r.status === "ativa" && validade >= agora && validade <= limiteRenovacao;
      }).length,
      estoqueCritico: produtos.filter((p) => p.ativo && Number(p.estoque) <= 5).length,
      controlados: produtos.filter((p) => p.ativo && p.exigeReceita).length,
    };
  }, [data]);

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Pill className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Central da Farmácia</h1>
              <p className="text-sm text-muted-foreground">Da recepção do pedido à entrega, com segurança e validação farmacêutica.</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {isError ? (
        <Card className="border-destructive/40 bg-destructive/5"><CardContent className="flex items-center gap-3 p-4 text-sm text-destructive"><AlertTriangle className="h-5 w-5" /> Não foi possível carregar os dados. Tente atualizar.</CardContent></Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Aguardando ação", value: metrics.aguardandoAcao, icon: ShoppingCart, tone: "text-amber-700 bg-amber-50" },
          { label: "Revisão farmacêutica", value: metrics.aguardandoFarmaceutico, icon: ShieldCheck, tone: "text-red-700 bg-red-50" },
          { label: "Em operação", value: metrics.emOperacao, icon: PackageCheck, tone: "text-blue-700 bg-blue-50" },
          { label: "Renovações em 30 dias", value: metrics.receitasRenovacao, icon: FileClock, tone: "text-violet-700 bg-violet-50" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
              <div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle className="text-base">Fluxo operacional</CardTitle><p className="mt-1 text-xs text-muted-foreground">As filas usam os pedidos e receitas já cadastrados.</p></div>
            <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Atualização automática</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-4">
          {FLOW.map((stage, index) => {
            const count = (data?.pedidos ?? []).filter((pedido) => (stage.statuses as readonly string[]).includes(pedido.status)).length;
            const Icon = stage.icon;
            return (
              <Link key={stage.title} href={stage.href} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-lg bg-muted p-2 group-hover:bg-primary/10 group-hover:text-primary"><Icon className="h-4 w-4" /></div>
                  <span className="text-2xl font-bold">{count}</span>
                </div>
                <p className="text-sm font-semibold">{index + 1}. {stage.title}</p>
                <p className="mt-1 min-h-10 text-xs text-muted-foreground">{stage.description}</p>
                <span className="mt-3 flex items-center text-xs font-medium text-primary">Abrir fila <ArrowRight className="ml-1 h-3 w-3" /></span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" /> Alertas operacionais</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link href="/farmacia/produtos" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40"><span>Produtos ativos com estoque até 5 unidades</span><Badge variant={metrics.estoqueCritico ? "destructive" : "secondary"}>{metrics.estoqueCritico}</Badge></Link>
            <Link href="/farmacia/receitas" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40"><span>Receitas com renovação prevista em 30 dias</span><Badge variant="secondary">{metrics.receitasRenovacao}</Badge></Link>
            <Link href="/farmacia/produtos" className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40"><span>Produtos controlados no catálogo</span><Badge variant="outline">{metrics.controlados}</Badge></Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Segurança clínica e regulatória</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"><p className="font-medium">Barreira de receita ativa</p><p className="mt-1 text-xs">Pedidos com item controlado permanecem bloqueados até receberem uma receita válida.</p></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><p className="font-medium">Integrações externas em preparação</p><p className="mt-1 text-xs">OCR e validações em sistemas regulatórios não estão automatizadas nesta versão. A decisão final é sempre do farmacêutico.</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
