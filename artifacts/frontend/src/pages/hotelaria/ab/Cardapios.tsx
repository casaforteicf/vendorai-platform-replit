import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  atualizarCardapio,
  criarCardapio,
  excluirCardapio,
  listarCardapios,
  listarFichas,
  mensagemDoErro,
  type AbAuth,
  type Cardapio,
  type CardapioServico,
  type FichaTecnica,
} from "@/lib/ab/client";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";

const SERVICOS: Array<{ valor: CardapioServico; rotulo: string }> = [
  { valor: "cafe_manha", rotulo: "Café da manhã" },
  { valor: "almoco", rotulo: "Almoço" },
  { valor: "jantar", rotulo: "Jantar" },
  { valor: "outro", rotulo: "Outro" },
];

const rotuloServico = (servico: CardapioServico) =>
  SERVICOS.find((item) => item.valor === servico)?.rotulo ?? servico;

type Selecao = Record<string, string>;

export default function Cardapios() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [data, setData] = useState(hojeISO());
  const [servico, setServico] = useState<CardapioServico>("almoco");
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);
  const [selecao, setSelecao] = useState<Selecao>({});
  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregarFichas = useCallback(async () => {
    if (!tenantId || !token) return;
    try {
      setFichas((await listarFichas(auth)).filter((ficha) => ficha.ativo));
    } catch (falha) {
      setErro(`Não foi possível carregar as fichas: ${mensagemDoErro(falha)}`);
    }
  }, [auth, tenantId, token]);

  const carregarCardapios = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    try {
      setCardapios(await listarCardapios(auth, { data, servico }));
    } catch (falha) {
      setErro(`Não foi possível carregar os cardápios: ${mensagemDoErro(falha)}`);
    } finally {
      setCarregando(false);
    }
  }, [auth, data, servico, tenantId, token]);

  useEffect(() => {
    void carregarFichas();
  }, [carregarFichas]);

  useEffect(() => {
    void carregarCardapios();
  }, [carregarCardapios]);

  function limparFormulario() {
    setEditandoId(null);
    setNome("");
    setObservacao("");
    setSelecao({});
  }

  function alternarFicha(fichaId: string) {
    setSelecao((anterior) => {
      if (fichaId in anterior) {
        const copia = { ...anterior };
        delete copia[fichaId];
        return copia;
      }
      return { ...anterior, [fichaId]: "1" };
    });
  }

  function editar(cardapio: Cardapio) {
    setEditandoId(cardapio.id);
    setNome(cardapio.nome);
    setObservacao(cardapio.observacao ?? "");
    setSelecao(
      Object.fromEntries(cardapio.itens.map((item) => [item.fichaId, item.porcoesPorPax])),
    );
    setErro(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    const itens = Object.entries(selecao).map(([fichaId, porcoesPorPax], ordem) => ({
      fichaId,
      porcoesPorPax: Number(String(porcoesPorPax).replace(",", ".")),
      ordem,
    }));
    if (!nome.trim()) {
      setErro("Informe o nome do cardápio.");
      return;
    }
    if (itens.length === 0) {
      setErro("Selecione pelo menos um prato.");
      return;
    }
    if (itens.some((item) => !Number.isFinite(item.porcoesPorPax) || item.porcoesPorPax <= 0)) {
      setErro("As porções por hóspede precisam ser maiores que zero.");
      return;
    }
    if (new Set(itens.map((item) => item.fichaId)).size !== itens.length) {
      setErro("O mesmo prato não pode aparecer duas vezes.");
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        nome: nome.trim(),
        data,
        servico,
        observacao: observacao.trim() || null,
        itens,
      };
      if (editandoId) {
        await atualizarCardapio(auth, editandoId, corpo);
        setAviso("Cardápio atualizado.");
      } else {
        await criarCardapio(auth, corpo);
        setAviso("Cardápio criado.");
      }
      limparFormulario();
      await carregarCardapios();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(cardapio: Cardapio) {
    if (!window.confirm(`Excluir o cardápio "${cardapio.nome}"?`)) return;
    setErro(null);
    try {
      await excluirCardapio(auth, cardapio.id);
      if (editandoId === cardapio.id) limparFormulario();
      setAviso("Cardápio excluído.");
      await carregarCardapios();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <HotelModulesNav />
      <header>
        <h1 className="text-2xl font-semibold">Cardápios · A&amp;B</h1>
        <p className="text-sm text-muted-foreground">
          O que será servido no dia e quantas porções por hóspede. O briffing usa este cardápio
          para calcular a produção e a compra.
        </p>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Data
          <input
            type="date"
            className="mt-1 block rounded-md border p-2"
            value={data}
            onChange={(event) => {
              setData(event.target.value);
              limparFormulario();
            }}
          />
        </label>
        <label className="text-sm">
          Serviço
          <select
            className="mt-1 block rounded-md border p-2"
            value={servico}
            onChange={(event) => {
              setServico(event.target.value as CardapioServico);
              limparFormulario();
            }}
          >
            {SERVICOS.map((item) => (
              <option key={item.valor} value={item.valor}>{item.rotulo}</option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-sm text-muted-foreground">
          {cardapios.length} cardápio(s) neste serviço
        </span>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{editandoId ? "Editar cardápio" : "Novo cardápio"}</h2>
          <label className="block text-sm">
            Nome
            <input
              className="mt-1 w-full rounded-md border p-2"
              maxLength={120}
              placeholder={`${rotuloServico(servico)} ${formatarDataBR(data)}`}
              value={nome}
              onChange={(event) => setNome(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Observação (opcional)
            <textarea
              className="mt-1 w-full rounded-md border p-2"
              maxLength={2000}
              rows={2}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
            />
          </label>

          <div>
            <h3 className="mb-2 text-sm font-medium">Pratos e porções por hóspede</h3>
            {fichas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ficha técnica ativa. Cadastre uma ficha primeiro.</p>}
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {fichas.map((ficha) => {
                const selecionada = ficha.id in selecao;
                return (
                  <div key={ficha.id} className={`flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm ${selecionada ? "bg-muted/40" : ""}`}>
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={() => alternarFicha(ficha.id)}
                      />
                      <span>{ficha.nome}</span>
                    </label>
                    {selecionada && (
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">porções/pax</span>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          className="w-24 rounded-md border p-1"
                          value={selecao[ficha.id] ?? "1"}
                          onChange={(event) => setSelecao((anterior) => ({ ...anterior, [ficha.id]: event.target.value }))}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={salvando}
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void salvar()}
            >
              {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Criar cardápio"}
            </button>
            {editandoId && (
              <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={limparFormulario}>
                Cancelar edição
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Cardápios de {formatarDataBR(data)} · {rotuloServico(servico)}</h2>
          {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!carregando && cardapios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cardápio cadastrado para este serviço.</p>}
          <div className="space-y-3">
            {cardapios.map((cardapio) => (
              <article key={cardapio.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <strong>{cardapio.nome}</strong>
                    <p className="text-xs text-muted-foreground">
                      {cardapio.itens.length} prato(s){cardapio.observacao ? ` · ${cardapio.observacao}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/hotelaria/ab/briffing?cardapio=${encodeURIComponent(cardapio.id)}`}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      Calcular briffing
                    </Link>
                    <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => editar(cardapio)}>
                      Editar
                    </button>
                    <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => void excluir(cardapio)}>
                      Excluir
                    </button>
                  </div>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {cardapio.itens.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>{item.fichaNome}</span>
                      <span className="text-muted-foreground">{Number(item.porcoesPorPax)} porção(ões)/hóspede</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
