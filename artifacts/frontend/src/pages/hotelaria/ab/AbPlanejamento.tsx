import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  aplicarHospedesPeriodo,
  criarCotacao,
  criarOrdemCompraManual,
  listarFornecedores,
  listarNecessidadesPlanejamento,
  mensagemDoErro,
  type AbAuth,
  type CardapioServico,
  type RespostaPlanejamento,
} from "@/lib/ab/client";
import { hojeISO } from "@/lib/ab/datas";

const SERVICOS: Array<{ valor: CardapioServico; rotulo: string }> = [
  { valor: "cafe_manha", rotulo: "Café da manhã" },
  { valor: "almoco", rotulo: "Almoço" },
  { valor: "jantar", rotulo: "Jantar" },
  { valor: "outro", rotulo: "Outro" },
];

function maisDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function AbPlanejamento() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(maisDias(hojeISO(), 6));
  const [servico, setServico] = useState<CardapioServico>("almoco");
  const [hospedes, setHospedes] = useState(150);
  const [proteina, setProteina] = useState(300);
  const [acompanhamento, setAcompanhamento] = useState(150);
  const [dados, setDados] = useState<RespostaPlanejamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string; ativo: boolean }>>([]);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setBusy(true);
    setErro(null);
    try {
      if (fornecedores.length === 0) {
        setFornecedores((await listarFornecedores(auth)).filter((item) => item.ativo));
      }
      setDados(await listarNecessidadesPlanejamento(auth, {
        dataInicio: inicio,
        dataFim: fim,
        proteinaPorAdulto: proteina,
        acompanhamentoPorAdulto: acompanhamento,
      }));
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setBusy(false);
    }
  }, [acompanhamento, auth, fim, inicio, proteina, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function aplicar() {
    setBusy(true);
    setErro(null);
    setAviso(null);
    try {
      const resultado = await aplicarHospedesPeriodo(auth, {
        dataInicio: inicio,
        dataFim: fim,
        servico,
        ocupacao: hospedes,
      });
      await carregar();
      setAviso(`${resultado.dias} dia(s) com ${hospedes} hóspede(s) no serviço selecionado.`);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setBusy(false);
    }
  }

  async function gerarCotacao() {
    const itens = (dados?.necessidades ?? [])
      .filter((item) => item.comprar > 0)
      .filter((item) => /^[0-9a-f-]{36}$/i.test(item.insumoId))
      .map((item) => ({ insumoId: item.insumoId, quantidade: item.comprar }));
    if (itens.length === 0) { setErro("Não há faltas com insumo vinculado para cotar."); return; }
    const ativos = fornecedores.length > 0 ? fornecedores : (await listarFornecedores(auth)).filter((item) => item.ativo);
    if (ativos.length === 0) { setErro("Cadastre ao menos um fornecedor ativo para cotar."); return; }
    const ids = window.prompt(`Fornecedores (IDs separados por vírgula).\n\n${ativos.map((f) => `${f.nome}: ${f.id}`).join("\n")}`)?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const cotacao = await criarCotacao(auth, {
        dataInicio: inicio,
        dataFim: fim,
        observacao: "Gerada do planejamento integrado",
        itens,
        fornecedorIds: ids,
      });
      setAviso(`Cotação ${cotacao.id} criada com ${ids.length} fornecedor(es).`);
      window.location.href = "/hotelaria/restaurante/cotacoes";
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setBusy(false);
    }
  }

  async function gerarCompra() {
    const itens = (dados?.necessidades ?? [])
      .filter((item) => item.comprar > 0)
      .filter((item) => /^[0-9a-f-]{36}$/i.test(item.insumoId))
      .map((item) => ({ insumoId: item.insumoId, quantidade: item.comprar }));
    if (itens.length === 0) { setErro("Não há faltas com insumo vinculado para comprar."); return; }
    const fornecedor = window.prompt("Fornecedor da compra (opcional):")?.trim() || null;
    const entrega = window.prompt("Data prevista de entrega (AAAA-MM-DD, opcional):")?.trim() || null;
    setBusy(true);
    try {
      const ordem = await criarOrdemCompraManual(auth, { fornecedor, dataEntregaPrevista: entrega, itens });
      setAviso(`Ordem criada com ${ordem.itens.length} item(ns). Aprove em Compras.`);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setBusy(false);
    }
  }

  const faltas = (dados?.necessidades ?? []).filter((item) => item.comprar > 0);

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hotelaria · A&amp;B</p>
        <h1 className="mt-1 text-2xl font-semibold">Planejamento integrado</h1>
        <p className="text-sm text-muted-foreground">
          Hóspedes por período, cardápios do dia, produção necessária, estoque de insumos e compra.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/hotelaria/restaurante/cardapios" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cardápios do dia</Link>
          <Link href="/hotelaria/restaurante/compras" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Compras</Link>
          <Link href="/hotelaria/restaurante/cotacoes" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cotações</Link>
        </div>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm">Início<input type="date" className="mt-1 w-full rounded-md border p-2" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <label className="text-sm">Fim<input type="date" className="mt-1 w-full rounded-md border p-2" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
        <label className="text-sm">Serviço
          <select className="mt-1 w-full rounded-md border p-2" value={servico} onChange={(e) => setServico(e.target.value as CardapioServico)}>
            {SERVICOS.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
          </select>
        </label>
        <label className="text-sm">Hóspedes/dia<input type="number" min={0} className="mt-1 w-full rounded-md border p-2" value={hospedes} onChange={(e) => setHospedes(Number(e.target.value))} /></label>
        <label className="text-sm">Proteína/adulto (g)<input type="number" min={0} className="mt-1 w-full rounded-md border p-2" value={proteina} onChange={(e) => setProteina(Number(e.target.value))} /></label>
        <label className="text-sm">Acompanhamento/adulto (g)<input type="number" min={0} className="mt-1 w-full rounded-md border p-2" value={acompanhamento} onChange={(e) => setAcompanhamento(Number(e.target.value))} /></label>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
          <button type="button" disabled={busy} onClick={() => void aplicar()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Aplicar hóspedes ao período</button>
          <button type="button" disabled={busy} onClick={() => void carregar()} className="rounded-md border px-3 py-2 text-sm">Atualizar</button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold">Cardápios e hóspedes no período</h2>
          {(dados?.dias.length ?? 0) === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum cardápio com hóspede previsto. Gere a escala do cardápio e aplique os hóspedes.</p>}
          <div className="mt-2 space-y-1 text-sm">
            {dados?.dias.map((dia) => (
              <div key={`${dia.data}-${dia.servico}`} className="flex justify-between gap-2 border-b py-1">
                <span>{dia.data} · {SERVICOS.find((s) => s.valor === dia.servico)?.rotulo ?? dia.servico} · {dia.menu}</span>
                <strong>{dia.ocupacao} hóspedes</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Necessidades e compras</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || faltas.length === 0} onClick={() => void gerarCotacao()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                Gerar cotação ({faltas.length})
              </button>
              <button type="button" disabled={busy || faltas.length === 0} onClick={() => void gerarCompra()} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                Compra direta
              </button>
            </div>
          </div>
          {(dados?.necessidades.length ?? 0) === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhuma necessidade calculada.</p>}
          <div className="mt-2 max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-1">Insumo</th><th>Necessário</th><th>Disponível</th><th>Comprar</th></tr></thead>
              <tbody>
                {dados?.necessidades.map((item) => (
                  <tr key={item.insumoId} className="border-b">
                    <td className="py-1">{item.insumoNome}</td>
                    <td>{item.necessario} {item.unidade}</td>
                    <td>{item.disponivel} {item.unidade}</td>
                    <td className={item.comprar > 0 ? "font-medium text-amber-700" : ""}>{item.comprar} {item.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
