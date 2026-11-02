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
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";

/**
 * Controle de sobras e desperdício — A&B.
 *
 * Tela de registro do fechamento do dia: para cada insumo preparado, quanto sobrou,
 * por quê, e uma foto como evidência. Sem backend ainda: os insumos são um mock e o
 * envio é simulado com `alert`. A foto também não sai do navegador — só guardamos o
 * nome do arquivo.
 *
 * Decisão: o motivo é obrigatório quando há peso. "Sobrou 3 kg" sem motivo não vira
 * ação nenhuma; o motivo é o que separa erro de produção (treinar equipe) de sobra de
 * buffet (ajustar a quantidade) de validade vencida (ajustar compra/estoque).
 */

const MOTIVOS = [
  { valor: "erro_producao", rotulo: "Erro de produção" },
  { valor: "sobra_buffet", rotulo: "Sobra de buffet" },
  { valor: "validade_vencida", rotulo: "Validade vencida" },
] as const;

type Motivo = (typeof MOTIVOS)[number]["valor"];

const INSUMOS = [
  { insumoId: "i-arroz", insumoNome: "Arroz" },
  { insumoId: "i-bife", insumoNome: "Bife" },
  { insumoId: "i-salada", insumoNome: "Salada" },
] as const;

type Linha = {
  insumoId: string;
  insumoNome: string;
  /** Texto do input — vazio significa "sem sobra", não "zero registrado". */
  pesoKg: string;
  motivo: Motivo | "";
  foto: string | null;
};

function linhasVazias(): Linha[] {
  return INSUMOS.map((insumo) => ({ ...insumo, pesoKg: "", motivo: "", foto: null }));
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function paraKg(texto: string): number {
  const valor = Number(texto.trim().replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function rotuloMotivo(motivo: Motivo | ""): string {
  return MOTIVOS.find((opcao) => opcao.valor === motivo)?.rotulo ?? "—";
}

export default function Sobras() {
  const [data, setData] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>(linhasVazias);
  const [erro, setErro] = useState<string | null>(null);

  const comSobra = linhas.filter((linha) => paraKg(linha.pesoKg) > 0);
  const totalKg = comSobra.reduce((soma, linha) => soma + paraKg(linha.pesoKg), 0);

  function atualizar(insumoId: string, parcial: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.insumoId === insumoId ? { ...linha, ...parcial } : linha)),
    );
  }

  function limpar() {
    setLinhas(linhasVazias());
    setErro(null);
  }

  function registrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!data) {
      setErro("Informe a data do registro.");
      return;
    }
    if (comSobra.length === 0) {
      setErro("Informe o peso da sobra de pelo menos um insumo.");
      return;
    }
    const semMotivo = comSobra.filter((linha) => !linha.motivo);
    if (semMotivo.length > 0) {
      setErro(`Informe o motivo da sobra de: ${semMotivo.map((l) => l.insumoNome).join(", ")}.`);
      return;
    }

    const detalhe = comSobra
      .map(
        (linha) =>
          `• ${linha.insumoNome}: ${NUMERO.format(paraKg(linha.pesoKg))} kg — ${rotuloMotivo(linha.motivo)}`,
      )
      .join("\n");

    // Sem backend ainda: confirmação local. Trocar por toast/registro persistido
    // quando o endpoint de sobras existir.
    window.alert(
      `Sobras registradas em ${formatarDataBR(data)} (${NUMERO.format(totalKg)} kg no total).\n\n${detalhe}`,
    );

    // Mantém a data: o fechamento do dia costuma ser lançado em sequência.
    setLinhas(linhasVazias());
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Controle de Sobras e Desperdício</h1>
        <p className="text-sm text-muted-foreground">
          Registro do fechamento: o que sobrou de cada preparo, por quê, e a foto como evidência.
        </p>
      </header>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Registro do dia</CardTitle>
            <Badge variant="outline">Simulado</Badge>
          </div>
          <CardDescription>
            Insumos de exemplo. O registro ainda não é gravado — a integração vem quando o endpoint
            de sobras existir.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={registrar} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="data-sobras">
                  Data <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="data-sobras"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  aria-invalid={erro !== null && !data ? true : undefined}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="total-sobras">Total com sobra</Label>
                <p
                  id="total-sobras"
                  className="flex h-10 items-center text-sm text-muted-foreground"
                >
                  {NUMERO.format(totalKg)} kg em {comSobra.length} de {linhas.length} insumo(s)
                </p>
              </div>
            </div>

            <Table>
              <TableCaption className="sr-only">
                Insumos do dia, peso da sobra, motivo e foto de evidência
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Peso da sobra (kg)</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((linha) => (
                  <TableRow key={linha.insumoId}>
                    <TableCell className="font-medium">{linha.insumoNome}</TableCell>

                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        value={linha.pesoKg}
                        onChange={(e) => atualizar(linha.insumoId, { pesoKg: e.target.value })}
                        placeholder="0"
                        aria-label={`Peso da sobra de ${linha.insumoNome}`}
                        className="max-w-28"
                      />
                    </TableCell>

                    <TableCell>
                      <select
                        value={linha.motivo}
                        onChange={(e) =>
                          atualizar(linha.insumoId, { motivo: e.target.value as Motivo | "" })
                        }
                        aria-label={`Motivo da sobra de ${linha.insumoNome}`}
                        className="h-10 w-full min-w-40 rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Selecione…</option>
                        {MOTIVOS.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.rotulo}
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={`foto-${linha.insumoId}`}
                          className="inline-flex cursor-pointer items-center rounded-md border border-border/80 bg-background/75 px-3 py-2 text-xs font-medium shadow-sm hover:bg-accent/70"
                        >
                          {linha.foto ? "Trocar foto" : "Anexar Foto"}
                        </label>
                        <input
                          id={`foto-${linha.insumoId}`}
                          type="file"
                          accept="image/*"
                          aria-label={`Foto de ${linha.insumoNome}`}
                          className="sr-only"
                          onChange={(e) => {
                            const arquivo = e.target.files?.[0];
                            atualizar(linha.insumoId, { foto: arquivo ? arquivo.name : null });
                            // Permite reescolher o mesmo arquivo depois de trocar.
                            e.target.value = "";
                          }}
                        />
                        {linha.foto && (
                          <span
                            className="max-w-40 truncate text-xs text-muted-foreground"
                            title={linha.foto}
                          >
                            {linha.foto}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {erro && (
              <p
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                {erro}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={limpar}>
                Limpar
              </Button>
              <Button type="submit">Registrar Sobras</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
