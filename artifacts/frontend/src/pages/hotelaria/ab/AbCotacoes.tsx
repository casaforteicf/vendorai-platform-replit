import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  listarCotacoes,
  obterCotacao,
  mensagemDoErro,
  responderCotacao,
  selecionarCotacao,
  type AbAuth,
  type Cotacao,
} from "@/lib/ab/client";

export default function AbCotacoes() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [selecionada, setSelecionada] = useState<Cotacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    try {
      const lista = await listarCotacoes(auth);
      setCotacoes(lista);
      setSelecionada((atual) => {
        if (!atual) return lista[0] ? null : null;
        return lista.find((item) => item.id === atual.id) ?? null;
      });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }, [auth, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function abrir(cotacao: Cotacao) {
    try {
      setSelecionada(await obterCotacao(auth, cotacao.id));
      setErro(null);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function responder(cotacao: Cotacao, fornecedorId: string, nome: string | null) {
    const valor = Number(window.prompt(`Valor total da proposta de ${nome ?? fornecedorId} (R$):`));
    const prazo = Number(window.prompt("Prazo de entrega em dias:"));
    const condicoes = window.prompt("Condições de pagamento:") ?? "";
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(prazo) || prazo < 0) {
      setErro("Valor ou prazo inválido.");
      return;
    }
    try {
      setSelecionada(await responderCotacao(auth, cotacao.id, {
        fornecedorId, valorTotal: valor, prazoEntregaDias: prazo, condicoesPagamento: condicoes || null,
      }));
      await carregar();
      setAviso("Proposta registrada.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function escolher(cotacao: Cotacao, fornecedorId: string, nome: string | null) {
    if (!window.confirm(`Escolher ${nome ?? fornecedorId} e gerar a ordem de compra?`)) return;
    try {
      const resultado = await selecionarCotacao(auth, cotacao.id, fornecedorId);
      setAviso(`Ordem ${resultado.ordemId} criada para ${resultado.fornecedor ?? "fornecedor"}. Aprove em Compras.`);
      await carregar();
      window.location.href = "/hotelaria/restaurante/compras";
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hotelaria · A&amp;B</p>
        <h1 className="mt-1 text-2xl font-semibold">Cotações de compra</h1>
        <p className="text-sm text-muted-foreground">Compare fornecedores, registre propostas e gere a ordem de compra do escolhido.</p>
        <div className="mt-2 flex gap-2">
          <Link href="/hotelaria/restaurante/planejamento" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Planejamento</Link>
          <Link href="/hotelaria/restaurante/compras" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Compras</Link>
        </div>
      </header>
      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="font-semibold">Cotações</h2>
          {cotacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma cotação.</p>}
          {cotacoes.map((cotacao) => (
            <button key={cotacao.id} type="button" onClick={() => void abrir(cotacao)} className={`w-full rounded-md border p-3 text-left text-sm ${selecionada?.id === cotacao.id ? "ring-2 ring-primary" : ""}`}>
              <p className="font-medium">{cotacao.dataInicio} → {cotacao.dataFim}</p>
              <p className="text-xs text-muted-foreground">{cotacao.status}</p>
            </button>
          ))}
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          {!selecionada && <p className="text-sm text-muted-foreground">Selecione uma cotação.</p>}
          {selecionada && (
            <>
              <div>
                <h2 className="font-semibold">Cotação {selecionada.dataInicio} → {selecionada.dataFim}</h2>
                <p className="text-sm text-muted-foreground">Status: {selecionada.status}</p>
              </div>
              <div className="space-y-1 text-sm">
                {(selecionada.itens ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between border-b py-1">
                    <span>{item.insumoNome}</span>
                    <strong>{Number(item.quantidade)} {item.unidade}</strong>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">Fornecedores</h3>
                {(selecionada.fornecedores ?? []).map((fornecedor) => (
                  <div key={fornecedor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{fornecedor.nome ?? fornecedor.fornecedorId}</p>
                      <p className="text-xs text-muted-foreground">
                        {fornecedor.status}
                        {fornecedor.valorTotal ? ` · R$ ${fornecedor.valorTotal}` : ""}
                        {fornecedor.prazoEntregaDias !== null ? ` · ${fornecedor.prazoEntregaDias} dia(s)` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {["convidado", "respondido"].includes(fornecedor.status) && (
                        <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => void responder(selecionada, fornecedor.fornecedorId, fornecedor.nome)}>
                          {fornecedor.status === "respondido" ? "Atualizar proposta" : "Registrar proposta"}
                        </button>
                      )}
                      {fornecedor.status === "respondido" && (
                        <button type="button" className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white" onClick={() => void escolher(selecionada, fornecedor.fornecedorId, fornecedor.nome)}>
                          Escolher e gerar ordem
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
