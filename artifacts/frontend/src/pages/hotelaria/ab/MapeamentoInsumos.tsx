import { useCallback, useEffect, useMemo, useState } from "react";
import HotelModulesNav from "../HotelModulesNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import {
  listarInsumos,
  listarMapeamentos,
  mensagemDoErro,
  removerMapeamento,
  salvarMapeamento,
  type AbAuth,
  type InsumoCatalogo,
  type MapeamentoInsumoProduto,
} from "@/lib/ab/client";

/**
 * Mapeamento (de-para) entre o estoque do hotel e os insumos do A&B.
 *
 * Por que existe: o saldo físico mora em `hotel_stock_location_balances` (ligado
 * a `produtos_catalogo`), e o motor preditivo trabalha com `insumos`. São
 * catálogos sem FK entre si — sem este de-para o job de sincronização não sabe
 * que o produto "ARROZ T1 5kg" é o insumo "Arroz", e o saldo nunca chega no
 * motor.
 *
 * Estado atual: o catálogo antigo é MOCK (não há endpoint de produtos), mas a
 * gravação é real (`POST /ab/insumo-produto`) e a lista de insumos vem da API —
 * senão a tela não teria como salvar nada de verdade.
 */

/** Catálogo de estoque de exemplo. Trocar pela API quando o endpoint existir. */
const PRODUTOS_ESTOQUE_MOCK = [
  {
    produtoCatalogoId: "11111111-1111-4111-8111-111111111111",
    nome: "ARROZ T1 5kg",
    sku: "ARR-T1-5",
    unidadeEstoque: "saco",
    saldoAtual: 12,
  },
  {
    produtoCatalogoId: "22222222-2222-4222-8222-222222222222",
    nome: "Bife de patinho",
    sku: "BF-PAT",
    unidadeEstoque: "kg",
    saldoAtual: 8.5,
  },
  {
    produtoCatalogoId: "33333333-3333-4333-8333-333333333333",
    nome: "Alface crespa",
    sku: "ALF-CR",
    unidadeEstoque: "un",
    saldoAtual: 14,
  },
  {
    produtoCatalogoId: "44444444-4444-4444-8444-444444444444",
    nome: "Óleo de soja 900ml",
    sku: "OL-SO-900",
    unidadeEstoque: "caixa",
    saldoAtual: 6,
  },
] as const;

/** Unidades que convertem sozinhas para a base (sem fator de embalagem). */
const UNIDADES_METRICAS = new Set(["g", "gr", "grama", "gramas", "kg", "quilo", "quilos", "kilo", "kilos", "mg", "ml", "mililitro", "mililitros", "l", "lt", "litro", "litros", "un", "und", "unid", "unidade"]);

function ehMetrica(unidade: string): boolean {
  return UNIDADES_METRICAS.has(
    unidade
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase(),
  );
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

type Rascunho = { insumoId: string; fator: string };

export default function MapeamentoInsumos() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([]);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoInsumoProduto[]>([]);
  const [rascunho, setRascunho] = useState<Record<string, Rascunho>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErro(null);
    try {
      const [catalogo, atuais] = await Promise.all([listarInsumos(auth), listarMapeamentos(auth)]);
      setInsumos(catalogo);
      setMapeamentos(atuais);

      const inicial: Record<string, Rascunho> = {};
      for (const produto of PRODUTOS_ESTOQUE_MOCK) {
        const existente = atuais.find((m) => m.produtoCatalogoId === produto.produtoCatalogoId);
        inicial[produto.produtoCatalogoId] = {
          insumoId: existente?.insumoId ?? "",
          fator: existente?.fatorEmbalagem ? String(Number(existente.fatorEmbalagem)) : "",
        };
      }
      setRascunho(inicial);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, tenantId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mapeamentoDo(produtoId: string): MapeamentoInsumoProduto | undefined {
    return mapeamentos.find((m) => m.produtoCatalogoId === produtoId);
  }

  function atualizarRascunho(produtoId: string, parcial: Partial<Rascunho>) {
    setRascunho((atual) => ({
      ...atual,
      [produtoId]: { ...(atual[produtoId] ?? { insumoId: "", fator: "" }), ...parcial },
    }));
  }

  async function salvar(produtoId: string) {
    setErro(null);
    setAviso(null);

    const linha = rascunho[produtoId];
    if (!linha?.insumoId) {
      setErro("Selecione o insumo correspondente antes de salvar.");
      return;
    }

    const produto = PRODUTOS_ESTOQUE_MOCK.find((p) => p.produtoCatalogoId === produtoId);
    const fatorTexto = linha.fator.trim();
    const fator = fatorTexto ? Number(fatorTexto.replace(",", ".")) : null;

    if (fator !== null && (!Number.isFinite(fator) || fator <= 0)) {
      setErro("O fator de embalagem precisa ser um número maior que zero.");
      return;
    }
    if (fator === null && produto && !ehMetrica(produto.unidadeEstoque)) {
      // Não bloqueia (o backend também aceita e o sync recusa depois), mas avisa:
      // converter "saco" sem fator é exatamente o erro que some com o saldo.
      setErro(
        `A unidade "${produto.unidadeEstoque}" não é métrica: informe quantas unidades base do insumo há em 1 ${produto.unidadeEstoque}.`,
      );
      return;
    }

    setSalvando(produtoId);
    try {
      await salvarMapeamento(auth, {
        produtoCatalogoId: produtoId,
        insumoId: linha.insumoId,
        fatorEmbalagem: fator,
      });
      const atualizados = await listarMapeamentos(auth);
      setMapeamentos(atualizados);
      setAviso(`Mapeamento de "${produto?.nome ?? produtoId}" salvo.`);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(null);
    }
  }

  async function desvincular(produtoId: string) {
    setErro(null);
    setAviso(null);
    setSalvando(produtoId);
    try {
      await removerMapeamento(auth, produtoId);
      setMapeamentos(await listarMapeamentos(auth));
      atualizarRascunho(produtoId, { insumoId: "", fator: "" });
      setAviso("Vínculo removido.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(null);
    }
  }

  const mapeados = PRODUTOS_ESTOQUE_MOCK.filter((p) => mapeamentoDo(p.produtoCatalogoId)).length;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Mapeamento de insumos (de-para)</h1>
        <p className="text-sm text-muted-foreground">
          Ligue cada produto do estoque ao insumo que o motor preditivo usa. Sem isso o saldo
          físico não chega em <code className="text-xs">ab_estoque_saldos</code> e a compra não é
          prevista.
        </p>
      </header>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Produtos do estoque</CardTitle>
            <Badge variant="outline">
              {mapeados} de {PRODUTOS_ESTOQUE_MOCK.length} mapeados
            </Badge>
          </div>
          <CardDescription>
            Catálogo de exemplo (mock). A gravação é real em{" "}
            <code className="text-xs">ab_insumo_produto</code>; os insumos vêm da API.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {carregando && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando catálogo…</p>
          )}

          {erro && (
            <p
              role="alert"
              className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              {erro}
            </p>
          )}
          {aviso && (
            <p
              role="status"
              className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              {aviso}
            </p>
          )}

          {!carregando && insumos.length === 0 && !erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum insumo cadastrado no catálogo. Cadastre insumos antes de mapear.
            </p>
          )}

          {!carregando && insumos.length > 0 && (
            <Table>
              <TableCaption className="sr-only">
                Produtos do estoque e o insumo correspondente no A&amp;B
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto do estoque</TableHead>
                  <TableHead>Saldo / unidade</TableHead>
                  <TableHead>Insumo correspondente</TableHead>
                  <TableHead>Fator de embalagem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PRODUTOS_ESTOQUE_MOCK.map((produto) => {
                  const linha = rascunho[produto.produtoCatalogoId] ?? { insumoId: "", fator: "" };
                  const mapeado = mapeamentoDo(produto.produtoCatalogoId);
                  const metrica = ehMetrica(produto.unidadeEstoque);
                  const ocupado = salvando === produto.produtoCatalogoId;

                  return (
                    <TableRow key={produto.produtoCatalogoId}>
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{produto.nome}</p>
                        <p className="text-xs text-muted-foreground">{produto.sku}</p>
                      </TableCell>

                      <TableCell className="whitespace-nowrap tabular-nums">
                        {NUMERO.format(produto.saldoAtual)} {produto.unidadeEstoque}
                      </TableCell>

                      <TableCell>
                        <Label className="sr-only" htmlFor={`insumo-${produto.produtoCatalogoId}`}>
                          Insumo de {produto.nome}
                        </Label>
                        <select
                          id={`insumo-${produto.produtoCatalogoId}`}
                          value={linha.insumoId}
                          onChange={(e) =>
                            atualizarRascunho(produto.produtoCatalogoId, { insumoId: e.target.value })
                          }
                          aria-label={`Insumo de ${produto.nome}`}
                          className="h-10 w-full min-w-48 rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Selecione o insumo…</option>
                          {insumos.map((insumo) => (
                            <option key={insumo.id} value={insumo.id}>
                              {insumo.nome}
                              {insumo.codigo ? ` · ${insumo.codigo}` : ""} ({insumo.unidade})
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.000001"
                            value={linha.fator}
                            onChange={(e) =>
                              atualizarRascunho(produto.produtoCatalogoId, { fator: e.target.value })
                            }
                            placeholder={metrica ? "não precisa" : "ex.: 50000"}
                            aria-label={`Fator de embalagem de ${produto.nome}`}
                            className="max-w-36"
                          />
                          {!metrica && (
                            <Badge variant="outline" className="whitespace-nowrap">
                              obrigatório
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void salvar(produto.produtoCatalogoId)}
                            disabled={ocupado}
                          >
                            {ocupado ? "Salvando…" : mapeado ? "Atualizar" : "Salvar"}
                          </Button>
                          {mapeado && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void desvincular(produto.produtoCatalogoId)}
                              disabled={ocupado}
                            >
                              Desvincular
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Como o fator de embalagem é usado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            É quantas <strong>unidades base do insumo</strong> existem em <strong>1 unidade de
            estoque</strong>. Ex.: 1 saco de arroz = 50 kg = <code>50000</code> em g.
          </p>
          <p>
            Unidades métricas (kg, g, l, ml, un) convertem sozinhas — o fator pode ficar vazio.
            Saco, caixa e fardo <strong>exigem</strong> o fator: sem ele o job de sincronização
            recusa a conversão em vez de chutar.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
