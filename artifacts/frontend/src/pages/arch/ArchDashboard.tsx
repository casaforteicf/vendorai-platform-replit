import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, TrendingUp, DollarSign, ImageIcon, Plus, ArrowRight } from "lucide-react";

function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Projeto = {
  id: string;
  titulo: string;
  clienteNome: string | null;
  status: string;
  orcamentoTotal: string | null;
  tipoObra: string | null;
  totalAmbientes: number;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  briefing:    "Briefing",
  orcamento:   "Orçamento",
  aprovado:    "Aprovado",
  em_execucao: "Em Execução",
  entregue:    "Entregue",
  cancelado:   "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  briefing:    "bg-gray-100 text-gray-700 border-gray-200",
  orcamento:   "bg-blue-50 text-blue-700 border-blue-200",
  aprovado:    "bg-green-50 text-green-700 border-green-200",
  em_execucao: "bg-amber-50 text-amber-700 border-amber-200",
  entregue:    "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelado:   "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function ArchDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    fetch(`${getBase()}/api/arch/projetos`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setProjetos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Erro ao carregar projetos."); setLoading(false); });
  }, [tenantId]);

  const totalProjetos   = projetos.length;
  const emExecucao      = projetos.filter((p) => p.status === "em_execucao").length;
  const valorTotal      = projetos.reduce((acc, p) => acc + Number(p.orcamentoTotal ?? 0), 0);
  const recentes        = [...projetos].slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Arch — Design de Interiores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie projetos, orçamentos, cenas 3D e marketplace</p>
        </div>
        <Button onClick={() => navigate("/arch/projetos/novo")}>
          <Plus className="h-4 w-4 mr-2" /> Novo Projeto
        </Button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Projetos</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalProjetos}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em Execução</CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-600">{emExecucao}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Valor em Orçamentos</CardTitle>
                <DollarSign className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-700">{fmt(valorTotal)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Renders Gerados</CardTitle>
                <ImageIcon className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-purple-700">—</p>
                <p className="text-xs text-muted-foreground mt-1">via IA</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Projetos recentes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Projetos Recentes</CardTitle>
          <Link href="/arch/projetos">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todos <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : recentes.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum projeto ainda.</p>
              <Button className="mt-4" size="sm" onClick={() => navigate("/arch/projetos/novo")}>
                <Plus className="h-4 w-4 mr-1" /> Criar primeiro projeto
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {recentes.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.clienteNome ?? "—"} · {p.tipoObra ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <StatusBadge status={p.status} />
                    <span className="text-sm font-medium text-green-700">{p.orcamentoTotal ? fmt(Number(p.orcamentoTotal)) : "—"}</span>
                    <Link href={`/arch/projetos/${p.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">Abrir</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
