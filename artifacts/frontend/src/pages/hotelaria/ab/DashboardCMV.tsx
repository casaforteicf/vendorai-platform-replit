import { useCallback, useEffect, useMemo, useState } from "react";
import HotelModulesNav from "../HotelModulesNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { hojeISO } from "@/lib/ab/datas";
import { buscarCmv, mensagemDoErro, type AbAuth, type CmvDashboard } from "@/lib/ab/client";

/**
 * Dashboard de CMV (AB-09).
 *
 * Números que não existem no banco aparecem como "—" com o motivo, nunca como
 * zero: produção depende do briffing (não persistido) e a receita vem do PMS.
 * Um dashboard que mostra "0" onde falta dado é pior que um que admite a falta.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function hojeMes(): string {
  return hojeISO().slice(0, 7);
}

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default function DashboardCMV() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [mes, setMes] = useState(hojeMes());
  const [receita, setReceita] = useState("");
  const [dados, setDados] = useState<CmvDashboard | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErro(null);
    try {
      const receitaNumero = Number(receita.replace(",", "."));
      setDados(
        await buscarCmv(auth, {
          mes,
          receita: Number.isFinite(receitaNumero) && receitaNumero > 0 ? receitaNumero : undefined,
        }),
      );
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, tenantId, token, mes, receita]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maiorDia = dados
    ? Math.max(1, ...dados.desperdicio.porDia.map((dia) => dia.valor || dia.kg))
    : 1;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hotelaria · A&amp;B
        </p>
        <h1 className="text-2xl font-semibold">Dashboard de CMV</h1>
        <p className="text-sm text-muted-foreground">
          Compras, desperdício e custo da mercadoria no mês. O que falta de dado aparece com o
          motivo — não como zero.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Competência</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="mes">Mês</Label>
              <Input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receita">Receita do mês (mock)</Label>
              <Input
                id="receita"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={receita}
                onChange={(e) => setReceita(e.target.value)}
                placeholder="Ex.: 120000"
              />
              <p className="text-xs text-muted-foreground">
                Vem do PMS; aqui é simulação para calcular o % de CMV.
              </p>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={() => void carregar()} disabled={carregando}>
                {carregando ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          </div>

          {erro && (
            <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {erro}
            </p>
          )}
        </CardContent>
      </Card>

      {dados && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="gap-1 pb-2">
                <CardDescription>Custo de compras</CardDescription>
                <CardTitle className="text-2xl">{MOEDA.format(dados.compras.valor)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {dados.compras.recebimentos} recebimento(s)
                {dados.compras.semCusto > 0 && ` · ${dados.compras.semCusto} sem custo`}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-1 pb-2">
                <CardDescription>Desperdício (7 dias)</CardDescription>
                <CardTitle className="text-2xl">{MOEDA.format(dados.desperdicio.valor)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {NUMERO.format(dados.desperdicio.kg)} kg registrados
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-1 pb-2">
                <CardDescription>Estoque final</CardDescription>
                <CardTitle className="text-2xl">{MOEDA.format(dados.estoque.valor)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {dados.estoque.insumosSemPreco > 0
                  ? `${dados.estoque.insumosSemPreco} insumo(s) sem preço`
                  : "Todos os insumos com preço"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-1 pb-2">
                <CardDescription>CMV</CardDescription>
                <CardTitle className="text-2xl">
                  {dados.cmv.percentual === null ? "—" : `${NUMERO.format(dados.cmv.percentual)}%`}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {dados.cmv.percentual === null
                  ? "Informe a receita para calcular"
                  : dados.cmv.formula}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Desperdício na semana</CardTitle>
                <Badge variant="outline">{dados.desperdicio.porDia.length} dias</Badge>
              </div>
              <CardDescription>
                {dados.desperdicio.semCusto > 0
                  ? `${dados.desperdicio.semCusto} sobra(s) sem preço — a barra mostra o peso.`
                  : "Valor por dia, das sobras registradas."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-end gap-2">
                {dados.desperdicio.porDia.map((dia) => {
                  const valor = dia.valor || dia.kg;
                  const altura = Math.max(2, Math.round((valor / maiorDia) * 100));
                  const data = new Date(`${dia.data}T12:00:00`);
                  return (
                    <div key={dia.data} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-[var(--primary)]/80"
                        style={{ height: `${altura}%` }}
                        title={`${dia.data}: ${MOEDA.format(dia.valor)} · ${NUMERO.format(dia.kg)} kg`}
                        aria-label={`${dia.data}: ${NUMERO.format(dia.kg)} kg`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {DIAS_CURTOS[data.getDay()]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custo de produção</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">
                {dados.producao.valor === null
                  ? "Não calculável com o dado atual"
                  : MOEDA.format(dados.producao.valor)}
              </p>
              <p className="text-muted-foreground">{dados.producao.motivo}</p>
              <p className="text-xs text-muted-foreground">{dados.compras.observacao}</p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
