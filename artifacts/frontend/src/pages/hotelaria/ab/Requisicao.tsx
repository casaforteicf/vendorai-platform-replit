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
import { SETORES, rotuloSetor } from "@/lib/ab/setores";
import {
  criarRequisicao,
  entregarRequisicao,
  listarInsumos,
  listarRequisicoes,
  mensagemDoErro,
  type AbAuth,
  type InsumoCatalogo,
  type Requisicao,
} from "@/lib/ab/client";

/**
 * Requisição de estoque — saída por setor (AB-08).
 *
 * Pedir não tira nada da prateleira: a baixa acontece só em "Entregar e Baixar",
 * e é o servidor que subtrai do saldo físico (com conversão para a unidade do
 * estoque). Se faltar saldo, a entrega é recusada e a requisição continua
 * pendente — a tela mostra o motivo vindo da API.
 */

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export default function Requisicao() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([]);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [setor, setSetor] = useState<string>(SETORES[0].valor);
  const [insumoId, setInsumoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [entregando, setEntregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErro(null);
    try {
      const [catalogo, lista] = await Promise.all([listarInsumos(auth), listarRequisicoes(auth)]);
      setInsumos(catalogo);
      setRequisicoes(lista.requisicoes);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, tenantId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function solicitar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);

    if (!insumoId) {
      setErro("Selecione o insumo.");
      return;
    }
    const quantidadeNumero = Number(quantidade.trim().replace(",", "."));
    if (!Number.isFinite(quantidadeNumero) || quantidadeNumero <= 0) {
      setErro("Informe a quantidade (maior que zero).");
      return;
    }

    setEnviando(true);
    try {
      await criarRequisicao(auth, {
        setor,
        insumoId,
        quantidadeBase: quantidadeNumero,
      });
      setQuantidade("");
      setAviso("Requisição registrada como pendente.");
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function entregar(requisicao: Requisicao) {
    setErro(null);
    setAviso(null);
    setEntregando(requisicao.id);
    try {
      const resultado = await entregarRequisicao(auth, requisicao.id);
      setAviso(
        `Entregue e baixado: ${NUMERO.format(resultado.baixa.quantidadeEstoque)} ${resultado.baixa.unidadeEstoque}.`,
      );
      await carregar();
    } catch (falha) {
      // Saldo insuficiente volta como 422 com a mensagem da API.
      setErro(mensagemDoErro(falha));
    } finally {
      setEntregando(null);
    }
  }

  const pendentes = requisicoes.filter((r) => r.status !== "entregue");

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Requisição de estoque</h1>
        <p className="text-sm text-muted-foreground">
          Pedido de retirada por setor. A baixa no saldo acontece na entrega, não no pedido.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Novo pedido</CardTitle>
          <CardDescription>
            A quantidade é informada na unidade do insumo (g, ml ou un).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={solicitar} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="setor">Setor</Label>
                <select
                  id="setor"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {SETORES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="insumo">Insumo</Label>
                <select
                  id="insumo"
                  value={insumoId}
                  onChange={(e) => setInsumoId(e.target.value)}
                  className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Selecione o insumo…</option>
                  {insumos.map((insumo) => (
                    <option key={insumo.id} value={insumo.id}>
                      {insumo.nome} ({insumo.unidade})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input
                  id="quantidade"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="Ex.: 500"
                />
              </div>
            </div>

            {erro && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                {erro}
              </p>
            )}
            {aviso && (
              <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                {aviso}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={enviando}>
                {enviando ? "Solicitando…" : "Solicitar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Pedidos</CardTitle>
            <Badge variant="outline">{pendentes.length} pendente(s)</Badge>
          </div>
          <CardDescription>Entregar dá baixa no saldo físico do insumo.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {carregando && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando requisições…</p>
          )}

          {!carregando && requisicoes.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma requisição registrada.
            </p>
          )}

          {requisicoes.length > 0 && (
            <Table>
              <TableCaption className="sr-only">Requisições de estoque do hotel</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisicoes.map((requisicao) => {
                  const ocupado = entregando === requisicao.id;
                  return (
                    <TableRow key={requisicao.id}>
                      <TableCell className="font-medium whitespace-normal">
                        {requisicao.insumoNome ?? requisicao.insumoId}
                      </TableCell>
                      <TableCell>{rotuloSetor(requisicao.setor)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {NUMERO.format(Number(requisicao.quantidadeBase))} {requisicao.unidadeBase}
                      </TableCell>
                      <TableCell>
                        <Badge variant={requisicao.status === "entregue" ? "secondary" : "default"}>
                          {requisicao.status === "entregue"
                            ? "Entregue"
                            : requisicao.status === "aprovada"
                              ? "Aprovada"
                              : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {requisicao.status !== "entregue" && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void entregar(requisicao)}
                            disabled={ocupado}
                          >
                            {ocupado ? "Baixando…" : "Entregar e Baixar"}
                          </Button>
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
