import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Plus, Store, Users, ShoppingCart,
  MessageSquare, RefreshCw, Loader2, Settings, Unlink, Link,
  ChevronDown, ChevronRight, DollarSign, AlertTriangle,
} from "lucide-react";

interface Loja {
  tenantId: string;
  nome: string;
  status: string;
  mrr: number;
  totalLeads: number;
  dealsGanhos: number;
  receitaGanha: number;
  mensagens30d: number;
  custoIaMes: number;
  margemMes: number;
}

interface Totais {
  totalLeads: number;
  totalDealsGanhos: number;
  faturamentoTotalGanho: number;
  totalMensagens30d: number;
  mrrTotal: number;
  custoIaTotalMes: number;
  margemTotalMes: number;
}

interface Organizacao {
  id: string;
  nome: string;
  ownerId: string;
  tenantCount: number;
  tenants: Array<{ id: string; name: string; status: string }>;
}

interface PainelData {
  organizacao: Organizacao;
  lojas: Loja[];
  totais: Totais;
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtN(value: number): string {
  return value.toLocaleString("pt-BR");
}

export default function OrganizacaoPainel() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organizacao | null>(null);
  const [painel, setPainel] = useState<PainelData | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingPainel, setLoadingPainel] = useState(false);

  const [newOrgOpen, setNewOrgOpen] = useState(false);
  const [newOrgNome, setNewOrgNome] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  const [linkTenantOpen, setLinkTenantOpen] = useState(false);
  const [linkTenantId, setLinkTenantId] = useState("");
  const [linkingTenant, setLinkingTenant] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function loadOrgs() {
    setLoadingOrgs(true);
    try {
      const res = await fetch("/api/organizacoes", { headers });
      if (!res.ok) throw new Error(await res.text());
      setOrgs(await res.json());
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar organizações", variant: "destructive" });
    } finally {
      setLoadingOrgs(false);
    }
  }

  async function loadPainel(org: Organizacao) {
    setSelectedOrg(org);
    setPainel(null);
    setLoadingPainel(true);
    try {
      const res = await fetch(`/api/organizacoes/${org.id}/painel`, { headers });
      if (!res.ok) throw new Error(await res.text());
      setPainel(await res.json());
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar o painel", variant: "destructive" });
    } finally {
      setLoadingPainel(false);
    }
  }

  async function createOrg() {
    if (!newOrgNome.trim()) return;
    setSavingOrg(true);
    try {
      const res = await fetch("/api/organizacoes", {
        method: "POST",
        headers,
        body: JSON.stringify({ nome: newOrgNome.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Organização criada com sucesso" });
      setNewOrgOpen(false);
      setNewOrgNome("");
      await loadOrgs();
    } catch {
      toast({ title: "Erro ao criar organização", variant: "destructive" });
    } finally {
      setSavingOrg(false);
    }
  }

  async function linkTenant() {
    if (!selectedOrg || !linkTenantId.trim()) return;
    setLinkingTenant(true);
    try {
      const res = await fetch(`/api/organizacoes/${selectedOrg.id}/tenants/${linkTenantId.trim()}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Loja vinculada com sucesso" });
      setLinkTenantOpen(false);
      setLinkTenantId("");
      await loadPainel(selectedOrg);
      await loadOrgs();
    } catch {
      toast({ title: "Erro ao vincular loja", variant: "destructive" });
    } finally {
      setLinkingTenant(false);
    }
  }

  async function unlinkTenant(tenantId: string) {
    if (!selectedOrg) return;
    try {
      const response = await fetch(`/api/organizacoes/${selectedOrg.id}/tenants/${tenantId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) throw new Error("unlink_tenant_failed");
      toast({ title: "Loja desvinculada" });
      await loadPainel(selectedOrg);
      await loadOrgs();
    } catch {
      toast({ title: "Erro ao desvincular loja", variant: "destructive" });
    }
  }

  useEffect(() => { loadOrgs(); }, []);

  const totais = painel?.totais;
  const lojas = painel?.lojas ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-violet-500" />
          <div>
            <h1 className="text-2xl font-bold">Painel Consolidado</h1>
            <p className="text-sm text-muted-foreground">
              Visão agregada da rede de lojas — dados isolados por loja, agregados aqui
            </p>
          </div>
        </div>
        <Button onClick={() => setNewOrgOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Organização
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de organizações */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Organizações
            </h2>
            <Button variant="ghost" size="icon" onClick={loadOrgs} disabled={loadingOrgs}>
              <RefreshCw className={`h-4 w-4 ${loadingOrgs ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {loadingOrgs ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : orgs.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma organização</p>
              <p className="text-xs mt-1">Crie uma para agrupar suas lojas</p>
            </div>
          ) : (
            orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => loadPainel(org)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedOrg?.id === org.id
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20"
                    : "border-border hover:border-violet-300 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{org.nome}</span>
                  <Badge variant="secondary" className="text-xs">
                    {org.tenantCount} {org.tenantCount === 1 ? "loja" : "lojas"}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Painel da organização selecionada */}
        <div className="lg:col-span-3 space-y-5">
          {!selectedOrg ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
              <Building2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">Selecione uma organização</p>
              <p className="text-sm mt-1">Veja métricas consolidadas de todas as lojas</p>
            </div>
          ) : loadingPainel ? (
            <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Carregando painel consolidado...</span>
            </div>
          ) : painel ? (
            <>
              {/* Cabeçalho do painel */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{painel.organizacao.nome}</h2>
                  <p className="text-sm text-muted-foreground">
                    {lojas.length} {lojas.length === 1 ? "loja vinculada" : "lojas vinculadas"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLinkTenantOpen(true)}>
                  <Link className="h-4 w-4 mr-2" /> Vincular Loja
                </Button>
              </div>

              {/* Cards de totais */}
              {totais && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-muted-foreground">MRR Total</span>
                      </div>
                      <p className="text-xl font-bold text-emerald-600">{fmt(totais.mrrTotal)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-muted-foreground">Total de Leads</span>
                      </div>
                      <p className="text-xl font-bold">{fmtN(totais.totalLeads)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <ShoppingCart className="h-4 w-4 text-violet-500" />
                        <span className="text-xs text-muted-foreground">Negócios Fechados</span>
                      </div>
                      <p className="text-xl font-bold">{fmtN(totais.totalDealsGanhos)}</p>
                      <p className="text-xs text-muted-foreground">{fmt(totais.faturamentoTotalGanho)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground">Msgs (30d)</span>
                      </div>
                      <p className="text-xl font-bold">{fmtN(totais.totalMensagens30d)}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Tabela comparativa por loja */}
              {lojas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Store className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma loja vinculada ainda</p>
                  <Button variant="outline" className="mt-3" onClick={() => setLinkTenantOpen(true)}>
                    <Link className="h-4 w-4 mr-2" /> Vincular primeira loja
                  </Button>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Comparativo por Loja</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Loja</TableHead>
                          <TableHead className="text-right">MRR</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead className="text-right">Fechados</TableHead>
                          <TableHead className="text-right">Receita</TableHead>
                          <TableHead className="text-right">Msgs 30d</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lojas.map((loja) => (
                          <TableRow key={loja.tenantId}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Store className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{loja.nome}</span>
                                {loja.status !== "active" && (
                                  <Badge variant="secondary" className="text-xs">
                                    {loja.status}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {loja.mrr > 0 ? fmt(loja.mrr) : "—"}
                            </TableCell>
                            <TableCell className="text-right">{fmtN(loja.totalLeads)}</TableCell>
                            <TableCell className="text-right">{fmtN(loja.dealsGanhos)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {loja.receitaGanha > 0 ? fmt(loja.receitaGanha) : "—"}
                            </TableCell>
                            <TableCell className="text-right">{fmtN(loja.mensagens30d)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                onClick={() => unlinkTenant(loja.tenantId)}
                                title="Desvincular loja"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Dialog — criar organização */}
      <Dialog open={newOrgOpen} onOpenChange={setNewOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome da rede / organização</Label>
              <Input
                value={newOrgNome}
                onChange={(e) => setNewOrgNome(e.target.value)}
                placeholder="Ex: Rede Exemplo — Matriz + Filiais"
                onKeyDown={(e) => e.key === "Enter" && createOrg()}
              />
            </div>
            <Button onClick={createOrg} disabled={savingOrg || !newOrgNome.trim()} className="w-full">
              {savingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Criar Organização
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — vincular loja (tenant) */}
      <Dialog open={linkTenantOpen} onOpenChange={setLinkTenantOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o ID do tenant (loja) que deseja incluir em <strong>{selectedOrg?.nome}</strong>.
              O login e a sessão da loja não mudam — apenas os dados aparecem neste painel agregado.
            </p>
            <div className="space-y-1">
              <Label>ID do Tenant</Label>
              <Input
                value={linkTenantId}
                onChange={(e) => setLinkTenantId(e.target.value)}
                placeholder="ex: abc123..."
                onKeyDown={(e) => e.key === "Enter" && linkTenant()}
              />
            </div>
            <Button onClick={linkTenant} disabled={linkingTenant || !linkTenantId.trim()} className="w-full">
              {linkingTenant ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link className="h-4 w-4 mr-2" />}
              Vincular Loja
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}