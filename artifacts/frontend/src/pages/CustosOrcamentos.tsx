import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getListComposicoesQueryKey,
  getListInsumosQueryKey,
  getListObrasQueryKey,
  useListComposicoes,
  useListInsumos,
  useListObras,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  Building2,
  Calculator,
  FileSpreadsheet,
  Layers,
  Package,
  Save,
} from "lucide-react";

type BudgetSummary = {
  id: string;
  obraId: string;
  versao: number;
  titulo?: string | null;
  status: string;
  bdiGlobal: string;
  modoPrecificacao?: "bdi" | "detalhada" | string;
  custosIndiretosPct?: string;
  administracaoPct?: string;
  riscoPct?: string;
  financeiroPct?: string;
  impostosPct?: string;
  comissaoPct?: string;
  margemPct?: string;
  descontoPct?: string;
  areaReferencia?: string | null;
};

type BudgetItem = {
  id: string;
  nome: string;
  codigo?: string | null;
  composicaoId?: string | null;
  origem?: string | null;
  origemReferencia?: string | null;
  unidade: string;
  quantidade: string;
  custoUnitario: string;
  bdi?: string | null;
};

type BudgetStage = {
  id: string;
  nome: string;
  ordem: number;
  itens: BudgetItem[];
};

type BudgetDetail = BudgetSummary & {
  etapas: BudgetStage[];
};

type PricingDraft = {
  modoPrecificacao: "bdi" | "detalhada";
  bdiGlobal: string;
  custosIndiretosPct: string;
  administracaoPct: string;
  riscoPct: string;
  financeiroPct: string;
  impostosPct: string;
  comissaoPct: string;
  margemPct: string;
  descontoPct: string;
  areaReferencia: string;
};

const EMPTY_PRICING: PricingDraft = {
  modoPrecificacao: "bdi",
  bdiGlobal: "0",
  custosIndiretosPct: "0",
  administracaoPct: "0",
  riscoPct: "0",
  financeiroPct: "0",
  impostosPct: "0",
  comissaoPct: "0",
  margemPct: "0",
  descontoPct: "0",
  areaReferencia: "",
};

function num(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function budgetStatus(status: string) {
  const map: Record<string, string> = {
    rascunho: "Rascunho",
    enviado: "Enviado",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
  };
  return map[status] ?? status;
}

export default function CustosOrcamentos() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [obraId, setObraId] = useState("");
  const [orcamentoId, setOrcamentoId] = useState("");
  const [draft, setDraft] = useState<PricingDraft>(EMPTY_PRICING);
  const [saving, setSaving] = useState(false);

  const { data: obras = [], isLoading: loadingObras } = useListObras(
    tenantId,
    {},
    { query: { enabled: !!tenantId, queryKey: getListObrasQueryKey(tenantId) } },
  );
  const { data: insumos = [] } = useListInsumos(
    tenantId,
    {},
    { query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) } },
  );
  const { data: composicoes = [] } = useListComposicoes(
    tenantId,
    {},
    { query: { enabled: !!tenantId, queryKey: getListComposicoesQueryKey(tenantId) } },
  );

  useEffect(() => {
    if (!obraId && obras.length > 0) setObraId(obras[0].id);
  }, [obraId, obras]);

  const budgetsQuery = useQuery<BudgetSummary[]>({
    queryKey: ["construction-pricing-budgets", tenantId, obraId],
    enabled: !!tenantId && !!obraId && !!token,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/orcamentos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Não foi possível carregar os orçamentos da obra.");
      return response.json();
    },
  });

  const budgets = budgetsQuery.data ?? [];

  useEffect(() => {
    if (budgets.length === 0) {
      setOrcamentoId("");
      return;
    }
    if (!budgets.some((item) => item.id === orcamentoId)) {
      setOrcamentoId(budgets[budgets.length - 1].id);
    }
  }, [budgets, orcamentoId]);

  const detailQuery = useQuery<BudgetDetail>({
    queryKey: ["construction-pricing-budget", tenantId, obraId, orcamentoId],
    enabled: !!tenantId && !!obraId && !!orcamentoId && !!token,
    queryFn: async () => {
      const response = await fetch(
        `/api/tenants/${tenantId}/obras/${obraId}/orcamentos/${orcamentoId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("Não foi possível carregar o orçamento.");
      return response.json();
    },
  });

  const budget = detailQuery.data;

  useEffect(() => {
    if (!budget) return;
    setDraft({
      modoPrecificacao: budget.modoPrecificacao === "detalhada" ? "detalhada" : "bdi",
      bdiGlobal: budget.bdiGlobal ?? "0",
      custosIndiretosPct: budget.custosIndiretosPct ?? "0",
      administracaoPct: budget.administracaoPct ?? "0",
      riscoPct: budget.riscoPct ?? "0",
      financeiroPct: budget.financeiroPct ?? "0",
      impostosPct: budget.impostosPct ?? "0",
      comissaoPct: budget.comissaoPct ?? "0",
      margemPct: budget.margemPct ?? "0",
      descontoPct: budget.descontoPct ?? "0",
      areaReferencia: budget.areaReferencia ?? "",
    });
  }, [budget]);

  const calc = useMemo(() => {
    const items = budget?.etapas.flatMap((etapa) => etapa.itens ?? []) ?? [];
    const custoDireto = items.reduce(
      (sum, item) => sum + num(item.quantidade) * num(item.custoUnitario),
      0,
    );

    const valorBdi = items.reduce((sum, item) => {
      const itemBdi = item.bdi == null ? num(draft.bdiGlobal) : num(item.bdi);
      return sum + num(item.quantidade) * num(item.custoUnitario) * (1 + itemBdi / 100);
    }, 0);

    const operacionalPct =
      num(draft.custosIndiretosPct) +
      num(draft.administracaoPct) +
      num(draft.riscoPct) +
      num(draft.financeiroPct);
    const custoEmpresarial = custoDireto * (1 + operacionalPct / 100);

    const vendaPct =
      num(draft.impostosPct) +
      num(draft.comissaoPct) +
      num(draft.margemPct);
    const percentuaisValidos = vendaPct < 100;
    const precoTabela = percentuaisValidos
      ? custoEmpresarial / Math.max(0.0001, 1 - vendaPct / 100)
      : 0;
    const precoDetalhado = precoTabela * (1 - Math.min(100, num(draft.descontoPct)) / 100);
    const precoVenda = draft.modoPrecificacao === "detalhada" ? precoDetalhado : valorBdi;
    const area = num(draft.areaReferencia);
    const precoM2 = area > 0 ? precoVenda / area : null;
    const margemValor =
      draft.modoPrecificacao === "detalhada"
        ? precoVenda - custoEmpresarial
        : precoVenda - custoDireto;

    return {
      items,
      custoDireto,
      custoEmpresarial,
      precoVenda,
      precoM2,
      margemValor,
      operacionalPct,
      vendaPct,
      percentuaisValidos,
    };
  }, [budget, draft]);

  function setField(key: keyof PricingDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function savePricing() {
    if (!budget || !obraId || !tenantId || !token) return;
    if (budget.status === "aprovado") {
      toast({
        title: "Orçamento aprovado",
        description: "Duplique a versão aprovada antes de alterar a precificação.",
        variant: "destructive",
      });
      return;
    }
    if (draft.modoPrecificacao === "detalhada" && !calc.percentuaisValidos) {
      toast({
        title: "Percentuais inválidos",
        description: "Impostos + comissão + margem precisam somar menos de 100%.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        modoPrecificacao: draft.modoPrecificacao,
        bdiGlobal: draft.bdiGlobal || "0",
        custosIndiretosPct: draft.custosIndiretosPct || "0",
        administracaoPct: draft.administracaoPct || "0",
        riscoPct: draft.riscoPct || "0",
        financeiroPct: draft.financeiroPct || "0",
        impostosPct: draft.impostosPct || "0",
        comissaoPct: draft.comissaoPct || "0",
        margemPct: draft.margemPct || "0",
        descontoPct: draft.descontoPct || "0",
        ...(draft.areaReferencia ? { areaReferencia: draft.areaReferencia } : {}),
      };
      const response = await fetch(
        `/api/tenants/${tenantId}/obras/${obraId}/orcamentos/${budget.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Não foi possível salvar a precificação.");
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["construction-pricing-budgets", tenantId, obraId] }),
        qc.invalidateQueries({ queryKey: ["construction-pricing-budget", tenantId, obraId, budget.id] }),
      ]);
      toast({ title: "Precificação atualizada", description: "Os parâmetros foram salvos nesta versão do orçamento." });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedObra = obras.find((obra) => obra.id === obraId);
  const approved = budget?.status === "aprovado";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Calculator className="h-6 w-6 text-primary" />
            Custos e Orçamentos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Motor central de custos da construção: insumos alimentam composições, composições formam serviços e o orçamento transforma custo em preço de venda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link href="/insumos"><Package className="mr-2 h-4 w-4" />Insumos</Link></Button>
          <Button variant="outline" size="sm" asChild><Link href="/composicoes"><Layers className="mr-2 h-4 w-4" />Composições</Link></Button>
          <Button size="sm" asChild><Link href="/obras"><Building2 className="mr-2 h-4 w-4" />Obras</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Insumos cadastrados</div><div className="mt-1 text-2xl font-semibold">{insumos.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Composições cadastradas</div><div className="mt-1 text-2xl font-semibold">{composicoes.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Obras</div><div className="mt-1 text-2xl font-semibold">{obras.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Selecione a obra e a versão do orçamento</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Obra</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={obraId}
              onChange={(event) => { setObraId(event.target.value); setOrcamentoId(""); }}
              disabled={loadingObras}
            >
              <option value="">{loadingObras ? "Carregando..." : "Selecione..."}</option>
              {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Versão do orçamento</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={orcamentoId}
              onChange={(event) => setOrcamentoId(event.target.value)}
              disabled={!obraId || budgetsQuery.isLoading}
            >
              <option value="">{budgetsQuery.isLoading ? "Carregando..." : "Selecione..."}</option>
              {budgets.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.versao} · {item.titulo || "Orçamento"} · {budgetStatus(item.status)}
                </option>
              ))}
            </select>
          </div>
          {selectedObra && budgets.length === 0 && !budgetsQuery.isLoading && (
            <div className="md:col-span-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Esta obra ainda não possui orçamento. Abra <Link href={`/obras/${selectedObra.id}`} className="font-medium text-primary underline">a obra</Link> e crie a primeira versão na aba Orçamento.
            </div>
          )}
        </CardContent>
      </Card>

      {budget && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Custo direto</div><div className="mt-1 text-xl font-semibold">{brl(calc.custoDireto)}</div></CardContent></Card>
            <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Custo empresarial</div><div className="mt-1 text-xl font-semibold">{brl(calc.custoEmpresarial)}</div></CardContent></Card>
            <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Preço de venda</div><div className="mt-1 text-xl font-semibold text-primary">{brl(calc.precoVenda)}</div></CardContent></Card>
            <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Preço por m²</div><div className="mt-1 text-xl font-semibold">{calc.precoM2 == null ? "—" : brl(calc.precoM2)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">2. Motor de precificação</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{budget.versao}</Badge>
                  <Badge variant={approved ? "default" : "secondary"}>{budgetStatus(budget.status)}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modo de precificação</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={draft.modoPrecificacao}
                    onChange={(event) => setField("modoPrecificacao", event.target.value as PricingDraft["modoPrecificacao"])}
                    disabled={approved}
                  >
                    <option value="bdi">BDI simples (compatibilidade)</option>
                    <option value="detalhada">Precificação detalhada</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Área de referência (m²)</Label>
                  <Input type="number" min="0" step="0.01" value={draft.areaReferencia} onChange={(event) => setField("areaReferencia", event.target.value)} disabled={approved} placeholder="Ex.: 227" />
                </div>
              </div>

              {draft.modoPrecificacao === "bdi" ? (
                <div className="max-w-sm space-y-2">
                  <Label>BDI global (%)</Label>
                  <Input type="number" min="0" step="0.01" value={draft.bdiGlobal} onChange={(event) => setField("bdiGlobal", event.target.value)} disabled={approved} />
                  <p className="text-xs text-muted-foreground">Mantém o cálculo já usado nos orçamentos atuais: custo do item × (1 + BDI).</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="mb-3">
                      <div className="text-sm font-semibold">Do custo direto ao custo empresarial</div>
                      <div className="text-xs text-muted-foreground">Percentuais aplicados sobre o custo direto da composição dos serviços.</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {([
                        ["custosIndiretosPct", "Custos indiretos (%)"],
                        ["administracaoPct", "Administração (%)"],
                        ["riscoPct", "Risco / reserva (%)"],
                        ["financeiroPct", "Custo financeiro (%)"],
                      ] as const).map(([key, label]) => (
                        <div className="space-y-2" key={key}>
                          <Label>{label}</Label>
                          <Input type="number" min="0" step="0.01" value={draft[key]} onChange={(event) => setField(key, event.target.value)} disabled={approved} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3">
                      <div className="text-sm font-semibold">Do custo empresarial ao preço de venda</div>
                      <div className="text-xs text-muted-foreground">Impostos, comissão e margem são tratados por dentro do preço de venda para preservar a margem definida.</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {([
                        ["impostosPct", "Impostos (%)"],
                        ["comissaoPct", "Comissão (%)"],
                        ["margemPct", "Margem desejada (%)"],
                        ["descontoPct", "Desconto comercial (%)"],
                      ] as const).map(([key, label]) => (
                        <div className="space-y-2" key={key}>
                          <Label>{label}</Label>
                          <Input type="number" min="0" step="0.01" value={draft[key]} onChange={(event) => setField(key, event.target.value)} disabled={approved} />
                        </div>
                      ))}
                    </div>
                    {!calc.percentuaisValidos && (
                      <p className="mt-2 text-sm font-medium text-destructive">Impostos + comissão + margem precisam somar menos de 100%.</p>
                    )}
                  </div>

                  <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><div className="text-xs text-muted-foreground">Acréscimos sobre custo</div><div className="font-semibold">{pct(calc.operacionalPct)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Encargos sobre venda</div><div className="font-semibold">{pct(calc.vendaPct)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Resultado sobre custo empresarial</div><div className="font-semibold">{brl(calc.margemValor)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Itens precificados</div><div className="font-semibold">{calc.items.length}</div></div>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {approved ? "Versão aprovada bloqueada para edição. Duplique a versão na obra para fazer alterações." : "Os parâmetros ficam vinculados à versão do orçamento; versões anteriores não são alteradas."}
                </p>
                <Button onClick={savePricing} disabled={saving || approved || !calc.percentuaisValidos}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar precificação"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. Estrutura que alimenta o preço</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm md:grid-cols-5">
                <div className="rounded-lg border p-3"><span className="font-semibold">Insumos</span><p className="text-xs text-muted-foreground">materiais, mão de obra e equipamentos</p></div>
                <div className="flex items-center justify-center"><ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" /></div>
                <div className="rounded-lg border p-3"><span className="font-semibold">Composições</span><p className="text-xs text-muted-foreground">consumo unitário e produtividade</p></div>
                <div className="flex items-center justify-center"><ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" /></div>
                <div className="rounded-lg border p-3"><span className="font-semibold">Orçamento</span><p className="text-xs text-muted-foreground">quantidade × custo × precificação</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link href="/insumos"><Package className="mr-2 h-4 w-4" />Abrir base de insumos</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/composicoes"><Layers className="mr-2 h-4 w-4" />Abrir composições</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href={`/obras/${obraId}`}><FileSpreadsheet className="mr-2 h-4 w-4" />Editar itens do orçamento</Link></Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Os itens do orçamento agora também aceitam vínculo de composição e origem. Isso prepara o próximo elo: quantitativos do Arqdor poderão criar itens com origem “arqdor” sem duplicar o motor de custos.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
