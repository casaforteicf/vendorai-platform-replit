import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
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
import {
  calcularBriffing,
  formatarQuantidade,
  hospedesEquivalentes,
  validarOcupacao,
  type CardapioDia,
  type Prato,
  type ResultadoBriffing,
} from "@/lib/ab/briffing";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";
import { useAuth } from "@/contexts/AuthContext";
import {
  criarCotacao,
  criarOrdemCompraManual,
  listarFichas,
  listarFornecedores,
  listarPrevisoesBriffing,
  mensagemDoErro,
  obterCardapio,
  type AbAuth,
  type BriffingPrevisao,
  type Cardapio as CardapioSalvo,
  type CardapioServico,
  type FichaTecnica,
} from "@/lib/ab/client";

/**
 * Briffing — resumo de produção de A&B.
 *
 * O cardápio agora vem das fichas técnicas reais (`GET /ab/fichas-tecnicas`).
 * Cada ficha é um prato; o usuário escolhe quais preparam no serviço do dia.
 *
 * Decisão: `porcoesPorPax` não existe na ficha (é decisão do menu, não da
 * receita), então cada prato selecionado entra com 1 porção por hóspede.
 *
 * Chave de consolidação do insumo: o id do catálogo quando existe, senão o nome
 * normalizado — é isso que faz o mesmo "Arroz" de duas fichas virar uma linha só
 * no consolidado.
 */

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function formatarBase(quantidade: number, unidade: "g" | "ml" | "un"): string {
  return `${NUMERO.format(quantidade)} ${unidade}`;
}

function chaveInsumo(insumo: { insumoId: string | null; insumoNome: string }): string {
  return insumo.insumoId ?? `nome:${insumo.insumoNome.trim().toLowerCase()}`;
}

function fichaParaPrato(ficha: FichaTecnica, porcoesPorPax = 1): Prato {
  return {
    id: ficha.id,
    nome: ficha.nome,
    porcoesPorPax,
    ficha: ficha.insumos.map((insumo) => {
      const fator = Number(insumo.fatorCorrecao);
      return {
        insumoId: chaveInsumo(insumo),
        insumoNome: insumo.insumoNome,
        unidadeBase: insumo.unidadeBase,
        gramaturaPorPorcao: Number(insumo.quantidadePorPorcao),
        fatorCorrecao: Number.isFinite(fator) && fator > 0 ? fator : 1,
      };
    }),
  };
}

const CATEGORIA_LABEL: Record<string, string> = {
  proteina: "Proteína",
  acompanhamento: "Acompanhamento",
  outro: "Outro",
};

const SERVICO_LABEL: Record<string, string> = {
  cafe_manha: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar",
  outro: "Outro",
};

export default function Briffing() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const search = useSearch();
  const cardapioId = new URLSearchParams(search).get("cardapio");

  const [ocupacao, setOcupacao] = useState("150");
  const [criancas712, setCriancas712] = useState("0");
  const [criancas06, setCriancas06] = useState("0");
  const [proteinaPorAdulto, setProteinaPorAdulto] = useState("300");
  const [acompanhamentoPorAdulto, setAcompanhamentoPorAdulto] = useState("150");
  const [resultado, setResultado] = useState<ResultadoBriffing | null>(null);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [comprando, setComprando] = useState(false);
  const [ocupacaoCalculada, setOcupacaoCalculada] = useState<number | null>(null);
  const [equivalentesCalculados, setEquivalentesCalculados] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [porcoesPorFicha, setPorcoesPorFicha] = useState<Record<string, number>>({});
  const [cardapioSalvo, setCardapioSalvo] = useState<CardapioSalvo | null>(null);
  const [previsao, setPrevisao] = useState<BriffingPrevisao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const dataPrevisao = cardapioSalvo?.data ?? hojeISO();
  const servicoPrevisao = (cardapioSalvo?.servico ?? "almoco") as CardapioServico;

  const carregarFichas = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErroLista(null);
    try {
      const carregadas = await listarFichas(auth);
      setFichas(carregadas);

      if (cardapioId) {
        try {
          const menu = await obterCardapio(auth, cardapioId);
          setCardapioSalvo(menu);
          setPorcoesPorFicha(
            Object.fromEntries(menu.itens.map((item) => [item.fichaId, Number(item.porcoesPorPax)])),
          );
          setSelecionadas(new Set(menu.itens.map((item) => item.fichaId)));
        } catch (falha) {
          setCardapioSalvo(null);
          setPorcoesPorFicha({});
          setSelecionadas(new Set(carregadas.filter((f) => f.ativo).map((f) => f.id)));
          setErroLista(`Cardápio não carregado: ${mensagemDoErro(falha)}. Usando todas as fichas ativas.`);
        }
      } else {
        // Sem cardápio na URL, mantém o comportamento de produção: todas as
        // fichas ativas entram com uma porção por hóspede.
        setCardapioSalvo(null);
        setPorcoesPorFicha({});
        setSelecionadas(new Set(carregadas.filter((f) => f.ativo).map((f) => f.id)));
      }
    } catch (falha) {
      setErroLista(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, cardapioId, tenantId, token]);

  useEffect(() => {
    void carregarFichas();
  }, [carregarFichas]);
  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelado = false;
    listarPrevisoesBriffing(auth, { data: dataPrevisao, servico: servicoPrevisao })
      .then((lista) => {
        if (!cancelado) setPrevisao(lista.find((item) => item.data === dataPrevisao && item.servico === servicoPrevisao) ?? null);
      })
      .catch(() => {
        if (!cancelado) setPrevisao(null);
      });
    return () => { cancelado = true; };
  }, [auth, dataPrevisao, servicoPrevisao, tenantId, token]);

  const selecionadasLista = useMemo(
    () => fichas.filter((ficha) => selecionadas.has(ficha.id)),
    [fichas, selecionadas],
  );

  const criancas712Num = Math.max(0, Number(criancas712.replace(",", ".")) || 0);
  const criancas06Num = Math.max(0, Number(criancas06.replace(",", ".")) || 0);
  const criancasTotal = criancas712Num + criancas06Num;
  const totalNum = Math.max(0, Number(ocupacao.replace(",", ".")) || 0);
  const adultosNum = Math.max(0, totalNum - criancasTotal);
  const equivalentes = hospedesEquivalentes(adultosNum, criancas712Num, criancas06Num);
  const proteinaNum = Math.max(0, Number(proteinaPorAdulto.replace(",", ".")) || 0);
  const acompanhamentoNum = Math.max(0, Number(acompanhamentoPorAdulto.replace(",", ".")) || 0);

  function itemDoMenu(fichaId: string) {
    return cardapioSalvo?.itens.find((item) => item.fichaId === fichaId) ?? null;
  }

  function referenciaGramas(ficha: FichaTecnica): number {
    const grams = ficha.insumos
      .filter((insumo) => insumo.unidadeBase !== "un")
      .map((insumo) => Number(insumo.quantidadePorPorcao))
      .filter((valor) => Number.isFinite(valor) && valor > 0);
    return grams.length > 0 ? Math.max(...grams) : 0;
  }

  function categoriaDaFicha(fichaId: string) {
    return itemDoMenu(fichaId)?.categoria ?? "outro";
  }

  function percentualDaFicha(fichaId: string): number {
    const item = itemDoMenu(fichaId);
    if (!item) return 0;
    if (item.percentualRateio) return Number(item.percentualRateio);
    const categoria = item.categoria;
    const doGrupo = selecionadasLista.filter((ficha) => categoriaDaFicha(ficha.id) === categoria);
    return doGrupo.length > 0 ? 100 / doGrupo.length : 0;
  }

  function porcoesDoPratoCalculado(ficha: FichaTecnica): number {
    const categoria = categoriaDaFicha(ficha.id);
    if (categoria === "outro") return porcoesPorFicha[ficha.id] ?? 1;
    const referencia = referenciaGramas(ficha);
    if (referencia <= 0) return porcoesPorFicha[ficha.id] ?? 1;
    const alvo = (categoria === "proteina" ? proteinaNum : acompanhamentoNum) * (percentualDaFicha(ficha.id) / 100);
    return alvo > 0 ? alvo / referencia : 0;
  }

  const cardapio: CardapioDia = useMemo(
    () => ({
      data: cardapioSalvo?.data ?? hojeISO(),
      pratos: selecionadasLista.map((ficha) => fichaParaPrato(ficha, porcoesDoPratoCalculado(ficha))),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardapioSalvo?.data, porcoesPorFicha, selecionadasLista, proteinaNum, acompanhamentoNum],
  );

  const valorAtual = Number(ocupacao.trim().replace(",", "."));
  const desatualizado =
    resultado !== null && ocupacaoCalculada !== null && valorAtual !== ocupacaoCalculada;

  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function calcular(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validada = validarOcupacao(ocupacao);
    if (!validada.ok) {
      setErro(validada.erro);
      return;
    }
    if (cardapio.pratos.length === 0) {
      setErro("Selecione pelo menos uma ficha no cardápio do dia.");
      return;
    }

    if (criancasTotal > validada.valor) {
      setErro("A soma de crianças não pode ser maior que a ocupação total.");
      return;
    }
    if (proteinaNum <= 0 && selecionadasLista.some((ficha) => categoriaDaFicha(ficha.id) === "proteina")) {
      setErro("Informe a proteína por adulto.");
      return;
    }

    try {
      const equivalentesCalculados = hospedesEquivalentes(validada.valor - criancasTotal, criancas712Num, criancas06Num);
      const calculado = calcularBriffing(equivalentesCalculados, cardapio);
      setResultado(calculado);
      setSelecionados(Object.fromEntries(calculado.consolidado.map((item) => [`${item.insumoId}::${item.unidade}`, true])));
      setOcupacaoCalculada(validada.valor);
      setEquivalentesCalculados(equivalentesCalculados);
    } catch (falha) {
      setResultado(null);
      setOcupacaoCalculada(null);
      setEquivalentesCalculados(null);
      setErro(falha instanceof Error ? falha.message : "Não foi possível calcular a produção.");
    }
  }

  function limpar() {
    setResultado(null);
    setSelecionados({});
    setOcupacaoCalculada(null);
    setEquivalentesCalculados(null);
    setErro(null);
  }

  function porcoesDoPrato(pratoId: string): number | null {
    return resultado?.porPrato.find((prato) => prato.pratoId === pratoId)?.porcoesTotais ?? null;
  }

  function itensSelecionados() {
    return (resultado?.consolidado ?? []).filter((item) => {
      const chave = `${item.insumoId}::${item.unidade}`;
      return selecionados[chave] && /^[0-9a-f-]{36}$/i.test(item.insumoId);
    });
  }

  async function comprarSelecionados(modo: "ordem" | "cotacao") {
    const itens = itensSelecionados();
    if (itens.length === 0) { setErro("Selecione ao menos um insumo cadastrado no catálogo."); return; }
    setComprando(true);
    setErro(null);
    try {
      if (modo === "ordem") {
        const fornecedor = window.prompt("Fornecedor da compra (opcional):")?.trim() || null;
        const entrega = window.prompt("Data prevista de entrega (AAAA-MM-DD, opcional):")?.trim() || null;
        const ordem = await criarOrdemCompraManual(auth, {
          fornecedor,
          dataEntregaPrevista: entrega && /^\d{4}-\d{2}-\d{2}$/.test(entrega) ? entrega : null,
          itens: itens.map((item) => ({ insumoId: item.insumoId, quantidade: item.quantidadeBase })),
        });
        setAviso(`Ordem criada com ${ordem.itens.length} item(ns). Aprove em Compras.`);
      } else {
        const ativos = (await listarFornecedores(auth)).filter((f) => f.ativo);
        if (ativos.length === 0) throw new Error("Cadastre um fornecedor ativo para cotar.");
        const ids = window.prompt(`Fornecedores (IDs separados por vírgula):\n${ativos.map((f) => `${f.nome}: ${f.id}`).join("\n")}`)?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
        if (ids.length === 0) return;
        await criarCotacao(auth, {
          dataInicio: cardapio.data,
          dataFim: cardapio.data,
          observacao: `Briffing ${cardapio.data}`,
          itens: itens.map((item) => ({ insumoId: item.insumoId, quantidade: item.quantidadeBase })),
          fornecedorIds: ids,
        });
        setAviso("Cotação criada. Abra Cotações para registrar as propostas.");
        window.location.href = "/hotelaria/restaurante/cotacoes";
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível gerar a compra.");
    } finally {
      setComprando(false);
    }
  }

  const dataFormatada = formatarDataBR(cardapio.data);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Briffing — resumo de produção</h1>
        <p className="text-sm text-muted-foreground">
          Ocupação × porções por hóspede × gramatura × fator de correção. O resultado é a lista que
          alimenta a requisição de compra do dia.
        </p>
        <Link
          href={`/hotelaria/restaurante/briffing/imprimir?data=${cardapio.data}`}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Imprimir briffing do dia
        </Link>
      </header>

      {previsao && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              Previsão importada: {NUMERO.format(previsao.ocupacao)} hóspedes
            </p>
            <p className="text-xs text-emerald-900">
              {formatarDataBR(previsao.data)} · {SERVICO_LABEL[previsao.servico] ?? previsao.servico}
              {previsao.evento ? ` · ${previsao.evento}` : ""}
              {previsao.observacoes ? ` · ${previsao.observacoes}` : ""}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setOcupacao(String(previsao.ocupacao))}>
            Usar ocupação
          </Button>
        </div>
      )}

      {cardapioSalvo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span>
            Cardápio: <strong>{cardapioSalvo.nome}</strong> · {formatarDataBR(cardapioSalvo.data)} ·{" "}
            {SERVICO_LABEL[cardapioSalvo.servico] ?? cardapioSalvo.servico}
          </span>
          <Link href="/hotelaria/ab/cardapios" className="rounded-md border px-3 py-1.5">
            Trocar cardápio
          </Link>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros do serviço</CardTitle>
          <CardDescription>
            Informe quantos hóspedes serão servidos e calcule a produção do cardápio selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={calcular} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="ocupacao">Ocupação total (hóspedes) <span className="text-red-600">*</span></Label>
                <Input id="ocupacao" type="number" inputMode="numeric" min={0} step={1} value={ocupacao} onChange={(e) => setOcupacao(e.target.value)} placeholder="Ex.: 150" aria-invalid={erro !== null ? true : undefined} />
                <p className="text-xs text-muted-foreground">{NUMERO.format(adultosNum)} adulto(s) · {NUMERO.format(criancasTotal)} criança(s)</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="criancas712">Crianças 7–12 anos (50%)</Label>
                <Input id="criancas712" type="number" min={0} step={1} value={criancas712} onChange={(e) => setCriancas712(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="criancas06">Crianças 0–6 anos (30%)</Label>
                <Input id="criancas06" type="number" min={0} step={1} value={criancas06} onChange={(e) => setCriancas06(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cardápio do dia</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">
                  {cardapioSalvo ? `${cardapioSalvo.nome} · ${cardapio.pratos.length} preparação(ões)` : `${dataFormatada} · ${cardapio.pratos.length} preparação(ões)`}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proteina">Proteína por adulto (g)</Label>
                <Input id="proteina" type="number" min={0} step={1} value={proteinaPorAdulto} onChange={(e) => setProteinaPorAdulto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acompanhamento">Acompanhamento por adulto (g)</Label>
                <Input id="acompanhamento" type="number" min={0} step={1} value={acompanhamentoPorAdulto} onChange={(e) => setAcompanhamentoPorAdulto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hóspedes equivalentes</Label>
                <p className="flex h-10 items-center text-sm font-medium">{NUMERO.format(equivalentes)}</p>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1">Calcular Produção</Button>
                {resultado && <Button type="button" variant="outline" onClick={limpar}>Limpar</Button>}
              </div>
            </div>

            {erro && (
              <p
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                {erro}
              </p>
            )}

            {desatualizado && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                A ocupação mudou — o resultado abaixo ainda é de{" "}
                <strong>{NUMERO.format(ocupacaoCalculada ?? 0)} hóspedes</strong>
                {equivalentesCalculados !== null ? ` (${NUMERO.format(equivalentesCalculados)} equivalentes)` : ""}. Clique em
                Calcular Produção para atualizar.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Cardápio do dia</CardTitle>
            <Badge variant="outline">{selecionadasLista.length} selecionada(s)</Badge>
          </div>
          <CardDescription>
            Fichas técnicas cadastradas. Marque as que entram no serviço de hoje.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {carregando && <p className="py-6 text-center text-sm text-muted-foreground">Carregando fichas…</p>}

          {!carregando && erroLista && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p>{erroLista}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void carregarFichas()}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erroLista && fichas.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma ficha técnica cadastrada. Cadastre em{" "}
              <a href="/hotelaria/ab/fichas-tecnicas" className="underline">
                Fichas técnicas
              </a>{" "}
              para calcular a produção.
            </p>
          )}

          {fichas.length > 0 && (
            <Table>
              <TableCaption className="sr-only">
                Fichas técnicas disponíveis para o cardápio do dia
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Dia</TableHead>
                  <TableHead>Prato</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Rateio</TableHead>
                  <TableHead>Porções totais</TableHead>
                  <TableHead>Ficha técnica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fichas.map((ficha) => {
                  const porcoes = porcoesDoPrato(ficha.id);
                  const marcada = selecionadas.has(ficha.id);
                  return (
                    <TableRow key={ficha.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => alternarSelecao(ficha.id)}
                          aria-label={`Incluir ${ficha.nome} no cardápio do dia`}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-normal">
                        {ficha.nome}
                        {!ficha.ativo && (
                          <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {CATEGORIA_LABEL[categoriaDaFicha(ficha.id)] ?? "Outro"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {categoriaDaFicha(ficha.id) === "outro"
                          ? "1 porção"
                          : `${NUMERO.format(percentualDaFicha(ficha.id))}% · ${NUMERO.format(
                              (categoriaDaFicha(ficha.id) === "proteina" ? proteinaNum : acompanhamentoNum)
                              * (percentualDaFicha(ficha.id) / 100),
                            )} g/adulto`}
                      </TableCell>
                      <TableCell>
                        {porcoes === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          NUMERO.format(porcoes)
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {ficha.insumos.map((insumo) => (
                            <li key={insumo.id}>
                              {insumo.insumoNome} ·{" "}
                              {formatarQuantidade(Number(insumo.quantidadePorPorcao), insumo.unidadeBase)}
                              {Number(insumo.fatorCorrecao) !== 1
                                ? ` · FC ${NUMERO.format(Number(insumo.fatorCorrecao))}`
                                : ""}
                            </li>
                          ))}
                        </ul>
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
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Produção consolidada</CardTitle>
            {resultado && (
              <p className="text-xs text-muted-foreground">
                {NUMERO.format(resultado.ocupacao)} hóspedes equivalentes · {resultado.consolidado.length}{" "}
                insumo(s)
              </p>
            )}
          </div>
          <CardDescription>
            Quantidades já com fator de correção. Para insumos medidos em ml, a coluna de conversão
            aparece em litros.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {resultado && resultado.consolidado.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{itensSelecionados().length} item(ns) selecionado(s)</span>
              <Button type="button" size="sm" disabled={comprando} onClick={() => void comprarSelecionados("cotacao")}>Gerar cotação</Button>
              <Button type="button" size="sm" variant="outline" disabled={comprando} onClick={() => void comprarSelecionados("ordem")}>Compra direta</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelecionados(Object.fromEntries(resultado.consolidado.map((item) => [`${item.insumoId}::${item.unidade}`, true])))}>Selecionar todos</Button>
            </div>
          )}
          {!resultado && !erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Informe a ocupação e clique em <strong>Calcular Produção</strong> para ver o resumo.
            </p>
          )}

          {resultado && resultado.consolidado.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              O cardápio selecionado não tem insumos cadastrados.
            </p>
          )}

          {resultado && resultado.consolidado.length > 0 && (
            <Table>
              <TableCaption className="sr-only">
                Quantidade de cada insumo para {NUMERO.format(resultado.ocupacao)} hóspedes
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Sel.</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Quantidade base</TableHead>
                  <TableHead className="text-right">Quantidade (kg / L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.consolidado.map((insumo) => {
                  const chave = `${insumo.insumoId}::${insumo.unidade}`;
                  const compravel = /^[0-9a-f-]{36}$/i.test(insumo.insumoId);
                  return (
                  <TableRow key={chave}>
                    <TableCell>
                      <input
                        type="checkbox"
                        disabled={!compravel}
                        checked={!!selecionados[chave]}
                        aria-label={`Selecionar ${insumo.insumoNome}`}
                        onChange={(event) => setSelecionados((atual) => ({ ...atual, [chave]: event.target.checked }))}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{insumo.insumoNome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{insumo.unidade}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarBase(insumo.quantidadeBase, insumo.unidade)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {insumo.quantidadeKg === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${NUMERO.format(insumo.quantidadeKg)} ${insumo.unidade === "g" ? "kg" : "L"}`
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
