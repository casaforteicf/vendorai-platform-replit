import { useCallback, useEffect, useMemo, useState } from "react";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  atualizarItemOrdemCompra,
  atualizarOrdemCompra,
  gerarOrdemCompra,
  listarOrdensCompra,
  mensagemDoErro,
  removerItemOrdemCompra,
  type AbAuth,
  type OrdemCompra,
  type OrdemCompraItem,
  type OrdemCompraStatus,
  type ResumoMotorPreditivo,
} from "@/lib/ab/client";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";

const STATUS: Array<{ valor: OrdemCompraStatus; rotulo: string; classe: string }> = [
  { valor: "sugerida", rotulo: "Sugerida", classe: "bg-amber-100 text-amber-900" },
  { valor: "aprovada", rotulo: "Aprovada", classe: "bg-sky-100 text-sky-900" },
  { valor: "enviada", rotulo: "Enviada", classe: "bg-indigo-100 text-indigo-900" },
  { valor: "recebida", rotulo: "Recebida", classe: "bg-emerald-100 text-emerald-900" },
  { valor: "cancelada", rotulo: "Cancelada", classe: "bg-muted text-muted-foreground" },
];

const rotuloStatus = (status: OrdemCompraStatus) =>
  STATUS.find((item) => item.valor === status)?.rotulo ?? status;
const classeStatus = (status: OrdemCompraStatus) =>
  STATUS.find((item) => item.valor === status)?.classe ?? "bg-muted";

const numero = (valor: string) => {
  const parsed = Number(String(valor).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export default function OrdensCompra() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [ordens, setOrdens] = useState<OrdemCompra[]>([]);
  const [filtro, setFiltro] = useState<OrdemCompraStatus | "">("");
  const [selecionada, setSelecionada] = useState<OrdemCompra | null>(null);
  const [dataReferencia, setDataReferencia] = useState(hojeISO());
  const [diasCobertura, setDiasCobertura] = useState("7");
  const [resumo, setResumo] = useState<ResumoMotorPreditivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    try {
      const lista = await listarOrdensCompra(auth, filtro ? { status: filtro } : {});
      setOrdens(lista);
      setSelecionada((atual) => {
        if (!atual) return lista[0] ?? null;
        return lista.find((ordem) => ordem.id === atual.id) ?? lista[0] ?? null;
      });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, filtro, tenantId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gerar() {
    setErro(null);
    setAviso(null);
    setResumo(null);
    const cobertura = Number(diasCobertura);
    if (!Number.isFinite(cobertura) || cobertura <= 0) {
      setErro("Informe os dias de cobertura (maior que zero).");
      return;
    }
    setGerando(true);
    try {
      const resultado = await gerarOrdemCompra(auth, {
        ...(dataReferencia ? { dataReferencia } : {}),
        diasCobertura: cobertura,
      });
      setResumo(resultado.resumo);
      if (resultado.ordem) {
        setSelecionada(resultado.ordem);
        setAviso("Ordem de compra disponível para revisão.");
      } else {
        setAviso("Nenhum insumo abaixo do ponto de pedido. Nada a comprar.");
      }
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setGerando(false);
    }
  }

  async function mudarStatus(ordem: OrdemCompra, status: OrdemCompraStatus) {
    if (["cancelada", "recebida"].includes(status) && !window.confirm(`Confirmar status "${rotuloStatus(status)}"?`)) return;
    setErro(null);
    try {
      const atualizada = await atualizarOrdemCompra(auth, ordem.id, { status });
      setSelecionada(atualizada);
      setAviso(`Ordem marcada como ${rotuloStatus(status).toLowerCase()}.`);
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function salvarItem(ordem: OrdemCompra, item: OrdemCompraItem, campo: "quantidade" | "custoEstimado", valor: string) {
    if (ordem.status !== "sugerida") return;
    const parsed = valor.trim() === "" ? null : numero(valor);
    if (campo === "quantidade" && (!parsed || parsed <= 0)) {
      setErro("A quantidade precisa ser maior que zero.");
      return;
    }
    if (campo === "custoEstimado" && parsed !== null && parsed < 0) {
      setErro("O custo não pode ser negativo.");
      return;
    }
    setSalvandoItem(item.id);
    setErro(null);
    try {
      const atualizada = await atualizarItemOrdemCompra(auth, ordem.id, item.id, {
        [campo]: parsed,
      });
      setSelecionada(atualizada);
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvandoItem(null);
    }
  }

  async function removerItem(ordem: OrdemCompra, item: OrdemCompraItem) {
    if (!window.confirm(`Remover "${item.insumoNome}" da ordem?`)) return;
    setErro(null);
    try {
      const atualizada = await removerItemOrdemCompra(auth, ordem.id, item.id);
      setSelecionada(atualizada);
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  const totalEstimado = (ordem: OrdemCompra) =>
    ordem.itens.reduce((soma, item) => {
      const custo = item.custoEstimado ? Number(item.custoEstimado) : 0;
      return soma + Number(item.quantidade) * custo;
    }, 0);

  return (
    <main className="space-y-5 p-4 md:p-6">
      <HotelModulesNav />
      <header>
        <h1 className="text-2xl font-semibold">Ordens de compra · A&amp;B</h1>
        <p className="text-sm text-muted-foreground">
          Geradas pelo estoque preditivo (saldo, ponto de pedido, consumo e cobertura). A aprovação
          é humana; a entrada de estoque continua no recebimento.
        </p>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <section className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="text-sm">
          Data de referência
          <input type="date" className="mt-1 block rounded-md border p-2" value={dataReferencia} onChange={(event) => setDataReferencia(event.target.value)} />
        </label>
        <label className="text-sm">
          Dias de cobertura
          <input type="number" min="1" max="365" className="mt-1 block w-32 rounded-md border p-2" value={diasCobertura} onChange={(event) => setDiasCobertura(event.target.value)} />
        </label>
        <button type="button" disabled={gerando} className="rounded-md border px-3 py-2 text-sm" onClick={() => void gerar()}>
          {gerando ? "Gerando..." : "Gerar ordem pelo estoque"}
        </button>
        <label className="text-sm">
          Filtrar status
          <select className="mt-1 block rounded-md border p-2" value={filtro} onChange={(event) => setFiltro(event.target.value as OrdemCompraStatus | "")}>
            <option value="">Todos</option>
            {STATUS.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
          </select>
        </label>
      </section>

      {resumo && (
        <section className="rounded-md border bg-muted/30 p-3 text-sm">
          <strong>Motor preditivo:</strong> {resumo.itensGerados} item(ns) em {resumo.ordensGeradas} ordem(ns) gerada(s);{" "}
          {resumo.ordensJaExistentes} já existente(s). Cobertura até {formatarDataBR(resumo.coberturaFim)}.
          {resumo.erros.length > 0 && <span className="text-red-700"> Falhas: {resumo.erros.map((e) => e.erro).join("; ")}</span>}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-lg border p-4 lg:col-span-1">
          <h2 className="font-semibold">Ordens</h2>
          {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!carregando && ordens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem encontrada.</p>}
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {ordens.map((ordem) => (
              <button
                type="button"
                key={ordem.id}
                onClick={() => setSelecionada(ordem)}
                className={`w-full rounded-md border p-3 text-left text-sm ${selecionada?.id === ordem.id ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{formatarDataBR(ordem.coberturaInicio)} → {formatarDataBR(ordem.coberturaFim)}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${classeStatus(ordem.status)}`}>{rotuloStatus(ordem.status)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ordem.itens.length} item(ns) · estimado R$ {totalEstimado(ordem).toFixed(2)}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4 lg:col-span-2">
          {!selecionada && <p className="text-sm text-muted-foreground">Selecione uma ordem para revisar.</p>}
          {selecionada && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-medium">
                    {formatarDataBR(selecionada.coberturaInicio)} → {formatarDataBR(selecionada.coberturaFim)}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {rotuloStatus(selecionada.status)} · {selecionada.itens.length} item(ns) · estimado R$ {totalEstimado(selecionada).toFixed(2)}
                    {selecionada.observacao ? ` · ${selecionada.observacao}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selecionada.status === "sugerida" && (
                    <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void mudarStatus(selecionada, "aprovada")}>Aprovar</button>
                  )}
                  {selecionada.status === "aprovada" && (
                    <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void mudarStatus(selecionada, "enviada")}>Marcar enviada</button>
                  )}
                  {selecionada.status === "enviada" && (
                    <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void mudarStatus(selecionada, "recebida")}>Marcar recebida</button>
                  )}
                  {["sugerida", "aprovada", "enviada"].includes(selecionada.status) && (
                    <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void mudarStatus(selecionada, "cancelada")}>Cancelar</button>
                  )}
                </div>
              </div>

              {selecionada.itens.length === 0 && <p className="text-sm text-muted-foreground">Ordem sem itens.</p>}
              <div className="space-y-2">
                {selecionada.itens.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_120px_140px_120px] sm:items-end">
                    <div>
                      <strong className="text-sm">{item.insumoNome}</strong>
                      <p className="text-xs text-muted-foreground">Unidade base: {item.unidade}</p>
                    </div>
                    <label className="text-xs">
                      Quantidade
                      <input
                        key={`${item.id}-${item.quantidade}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        disabled={selecionada.status !== "sugerida" || salvandoItem === item.id}
                        defaultValue={item.quantidade}
                        className="mt-1 w-full rounded-md border p-1.5 text-sm"
                        onBlur={(event) => {
                          if (Number(event.target.value) !== Number(item.quantidade)) void salvarItem(selecionada, item, "quantidade", event.target.value);
                        }}
                      />
                    </label>
                    <label className="text-xs">
                      Custo estimado (R$)
                      <input
                        key={`${item.id}-${item.custoEstimado ?? ""}`}
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={selecionada.status !== "sugerida" || salvandoItem === item.id}
                        defaultValue={item.custoEstimado ?? ""}
                        className="mt-1 w-full rounded-md border p-1.5 text-sm"
                        onBlur={(event) => {
                          if (Number(event.target.value || 0) !== Number(item.custoEstimado ?? 0)) void salvarItem(selecionada, item, "custoEstimado", event.target.value);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={selecionada.status !== "sugerida"}
                      className="rounded-md border px-2 py-1.5 text-xs"
                      onClick={() => void removerItem(selecionada, item)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
              {selecionada.status !== "sugerida" && (
                <p className="text-xs text-muted-foreground">
                  Itens bloqueados após a aprovação. Para corrigir, cancele e gere uma nova ordem.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
