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
import {
  calcularBriffing,
  formatarQuantidade,
  validarOcupacao,
  type CardapioDia,
  type Prato,
  type ResultadoBriffing,
} from "@/lib/ab/briffing";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";
import { useAuth } from "@/contexts/AuthContext";
import { listarFichas, mensagemDoErro, type AbAuth, type FichaTecnica } from "@/lib/ab/client";

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

function fichaParaPrato(ficha: FichaTecnica): Prato {
  return {
    id: ficha.id,
    nome: ficha.nome,
    porcoesPorPax: 1,
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

export default function Briffing() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [ocupacao, setOcupacao] = useState("150");
  const [resultado, setResultado] = useState<ResultadoBriffing | null>(null);
  const [ocupacaoCalculada, setOcupacaoCalculada] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const carregarFichas = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErroLista(null);
    try {
      const carregadas = await listarFichas(auth);
      setFichas(carregadas);
      // Começa com todas as fichas ativas selecionadas — o caso comum é o
      // cardápio usar a maior parte do que está cadastrado.
      setSelecionadas(new Set(carregadas.filter((f) => f.ativo).map((f) => f.id)));
    } catch (falha) {
      setErroLista(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, tenantId, token]);

  useEffect(() => {
    void carregarFichas();
  }, [carregarFichas]);

  const selecionadasLista = useMemo(
    () => fichas.filter((ficha) => selecionadas.has(ficha.id)),
    [fichas, selecionadas],
  );

  const cardapio: CardapioDia = useMemo(
    () => ({ data: hojeISO(), pratos: selecionadasLista.map(fichaParaPrato) }),
    [selecionadasLista],
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

    try {
      setResultado(calcularBriffing(validada.valor, cardapio));
      setOcupacaoCalculada(validada.valor);
    } catch (falha) {
      setResultado(null);
      setOcupacaoCalculada(null);
      setErro(falha instanceof Error ? falha.message : "Não foi possível calcular a produção.");
    }
  }

  function limpar() {
    setResultado(null);
    setOcupacaoCalculada(null);
    setErro(null);
  }

  function porcoesDoPrato(pratoId: string): number | null {
    return resultado?.porPrato.find((prato) => prato.pratoId === pratoId)?.porcoesTotais ?? null;
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
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros do serviço</CardTitle>
          <CardDescription>
            Informe quantos hóspedes serão servidos e calcule a produção do cardápio selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={calcular} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ocupacao">
                  Ocupação (hóspedes) <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="ocupacao"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={ocupacao}
                  onChange={(e) => setOcupacao(e.target.value)}
                  placeholder="Ex.: 150"
                  aria-invalid={erro !== null ? true : undefined}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Cardápio do dia</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">
                  {dataFormatada} · {cardapio.pratos.length} preparação(ões)
                </p>
              </div>

              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1">
                  Calcular Produção
                </Button>
                {resultado && (
                  <Button type="button" variant="outline" onClick={limpar}>
                    Limpar
                  </Button>
                )}
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
                <strong>{NUMERO.format(ocupacaoCalculada ?? 0)} hóspedes</strong>. Clique em
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
                {NUMERO.format(resultado.ocupacao)} hóspedes · {resultado.consolidado.length}{" "}
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
                  <TableHead>Insumo</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Quantidade base</TableHead>
                  <TableHead className="text-right">Quantidade (kg / L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.consolidado.map((insumo) => (
                  <TableRow key={`${insumo.insumoId}::${insumo.unidade}`}>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
