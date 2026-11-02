import { useState } from "react";
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
  type ResultadoBriffing,
} from "@/lib/ab/briffing";

/**
 * Briffing — resumo de produção de A&B.
 *
 * Esta tela é o *ensaio* do motor: o cardápio vem de uma constante mock, porque a
 * ficha técnica real (Receitas) ainda não expõe os campos de A&B. Nenhuma chamada
 * de API acontece aqui — o cálculo é 100% local, o que permite conferir o número
 * contra a planilha antes de plugar dado de produção.
 */

function hojeISO(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const CARDAPIO_EXEMPLO: CardapioDia = {
  data: hojeISO(),
  pratos: [
    {
      id: "p-arroz",
      nome: "Arroz branco",
      porcoesPorPax: 1,
      ficha: [
        { insumoId: "i-arroz", insumoNome: "Arroz", unidadeBase: "g", gramaturaPorPorcao: 80 },
      ],
    },
    {
      id: "p-bife",
      nome: "Bife acebolado",
      porcoesPorPax: 1,
      ficha: [
        {
          insumoId: "i-bife",
          insumoNome: "Bife (patinho)",
          unidadeBase: "g",
          gramaturaPorPorcao: 150,
          fatorCorrecao: 1.2,
        },
        { insumoId: "i-cebola", insumoNome: "Cebola", unidadeBase: "g", gramaturaPorPorcao: 30 },
      ],
    },
    {
      id: "p-salada",
      nome: "Salada da casa",
      porcoesPorPax: 1,
      ficha: [
        {
          insumoId: "i-alface",
          insumoNome: "Alface",
          unidadeBase: "g",
          gramaturaPorPorcao: 40,
          fatorCorrecao: 1.15,
        },
        {
          insumoId: "i-tomate",
          insumoNome: "Tomate",
          unidadeBase: "g",
          gramaturaPorPorcao: 50,
          fatorCorrecao: 1.1,
        },
      ],
    },
    {
      id: "p-suco",
      nome: "Suco de laranja",
      porcoesPorPax: 1,
      ficha: [
        { insumoId: "i-laranja", insumoNome: "Laranja", unidadeBase: "un", gramaturaPorPorcao: 3 },
      ],
    },
    {
      id: "p-pudim",
      nome: "Pudim (meia porção)",
      porcoesPorPax: 0.5,
      ficha: [
        {
          insumoId: "i-leite-cond",
          insumoNome: "Leite condensado",
          unidadeBase: "g",
          gramaturaPorPorcao: 60,
        },
      ],
    },
  ],
};

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function formatarBase(quantidade: number, unidade: "g" | "ml" | "un"): string {
  return `${NUMERO.format(quantidade)} ${unidade}`;
}

export default function Briffing() {
  const [ocupacao, setOcupacao] = useState("150");
  const [resultado, setResultado] = useState<ResultadoBriffing | null>(null);
  const [ocupacaoCalculada, setOcupacaoCalculada] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const valorAtual = Number(ocupacao.trim().replace(",", "."));
  const desatualizado =
    resultado !== null && ocupacaoCalculada !== null && valorAtual !== ocupacaoCalculada;

  function calcular(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validada = validarOcupacao(ocupacao);
    if (!validada.ok) {
      setErro(validada.erro);
      return;
    }

    try {
      setResultado(calcularBriffing(validada.valor, CARDAPIO_EXEMPLO));
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

  const dataFormatada = new Date(`${CARDAPIO_EXEMPLO.data}T12:00:00`).toLocaleDateString("pt-BR");

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
            Informe quantos hóspedes serão servidos e calcule a produção do cardápio abaixo.
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
                <Label>Prato do dia</Label>
                <p className="flex h-10 items-center text-sm text-muted-foreground">
                  {dataFormatada} · {CARDAPIO_EXEMPLO.pratos.length} preparações
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
            <Badge variant="outline">Simulado</Badge>
          </div>
          <CardDescription>
            Dados de exemplo no estado da tela. A ficha técnica real virá do cadastro de Receitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableCaption className="sr-only">Pratos do cardápio e suas fichas técnicas</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Prato</TableHead>
                <TableHead>Porções / hóspede</TableHead>
                <TableHead>Porções totais</TableHead>
                <TableHead>Ficha técnica</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CARDAPIO_EXEMPLO.pratos.map((prato) => {
                const porcoes = porcoesDoPrato(prato.id);
                return (
                  <TableRow key={prato.id}>
                    <TableCell className="font-medium whitespace-normal">{prato.nome}</TableCell>
                    <TableCell>{NUMERO.format(prato.porcoesPorPax)}</TableCell>
                    <TableCell>
                      {porcoes === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        NUMERO.format(porcoes)
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {prato.ficha.map((item) => (
                          <li key={item.insumoId}>
                            {item.insumoNome} · {formatarQuantidade(item.gramaturaPorPorcao, item.unidadeBase)}
                            {item.fatorCorrecao ? ` · FC ${NUMERO.format(item.fatorCorrecao)}` : ""}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
              O cardápio não tem insumos cadastrados.
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
