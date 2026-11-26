import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Trash2 } from "lucide-react";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  atualizarModeloCardapio,
  criarModeloCardapio,
  excluirModeloCardapio,
  excluirRegraGrade,
  gerarEscalaCardapio,
  listarFichas,
  listarGradeCardapio,
  listarModelosCardapio,
  mensagemDoErro,
  salvarRegraGrade,
  type AbAuth,
  type CardapioGradeRegra,
  type CardapioModelo,
  type CardapioServico,
  type CategoriaItemCardapio,
  type FichaTecnica,
} from "@/lib/ab/client";
import { hojeISO } from "@/lib/ab/datas";

const SERVICOS: Array<{ valor: CardapioServico; rotulo: string }> = [
  { valor: "cafe_manha", rotulo: "Café da manhã" },
  { valor: "almoco", rotulo: "Almoço" },
  { valor: "jantar", rotulo: "Jantar" },
  { valor: "outro", rotulo: "Outro" },
];

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type ItemModelo = { categoria: CategoriaItemCardapio; percentual: string };

export default function CardapiosModelos() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);

  const [aba, setAba] = useState<"modelos" | "grade">("modelos");
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [modelos, setModelos] = useState<CardapioModelo[]>([]);
  const [grade, setGrade] = useState<CardapioGradeRegra[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [servico, setServico] = useState<CardapioServico>("almoco");
  const [selecao, setSelecao] = useState<Record<string, ItemModelo>>({});
  const [salvando, setSalvando] = useState(false);

  const [diaSemana, setDiaSemana] = useState(1);
  const [servicoGrade, setServicoGrade] = useState<CardapioServico>("almoco");
  const [modeloGrade, setModeloGrade] = useState("");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setErro(null);
    try {
      const [fs, ms, gs] = await Promise.all([
        listarFichas(auth),
        listarModelosCardapio(auth),
        listarGradeCardapio(auth),
      ]);
      setFichas(fs.filter((ficha) => ficha.ativo));
      setModelos(ms);
      setGrade(gs);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }, [auth, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  function limpar() {
    setEditandoId(null);
    setNome("");
    setServico("almoco");
    setSelecao({});
  }

  function alternarFicha(fichaId: string) {
    setSelecao((anterior) => {
      if (fichaId in anterior) {
        const copia = { ...anterior };
        delete copia[fichaId];
        return copia;
      }
      return { ...anterior, [fichaId]: { categoria: "outro", percentual: "" } };
    });
  }

  function editar(modelo: CardapioModelo) {
    setEditandoId(modelo.id);
    setNome(modelo.nome);
    setServico(modelo.servico);
    setSelecao(Object.fromEntries(modelo.itens.map((item) => [item.fichaId, {
      categoria: item.categoria,
      percentual: item.percentualRateio ?? "",
    }])));
    setErro(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarModelo() {
    setErro(null);
    setAviso(null);
    if (!nome.trim()) { setErro("Informe o nome do modelo."); return; }
    const itens = Object.entries(selecao).map(([fichaId, item], ordem) => ({
      fichaId,
      categoria: item.categoria,
      percentualRateio: item.categoria === "outro" ? null : Number(String(item.percentual || "0").replace(",", ".")),
      ordem,
    }));
    if (itens.length === 0) { setErro("Selecione pelo menos um prato."); return; }
    for (const categoria of ["proteina", "acompanhamento"] as const) {
      const grupo = itens.filter((item) => item.categoria === categoria);
      if (grupo.length === 0) continue;
      const soma = grupo.reduce((total, item) => total + (item.percentualRateio ?? 0), 0);
      if (grupo.some((item) => item.percentualRateio === null)) {
        setErro(`Informe o percentual de cada prato de ${categoria}.`);
        return;
      }
      if (Math.abs(soma - 100) > 0.01) {
        setErro(`A soma dos percentuais de ${categoria} precisa ser 100% (está ${soma.toFixed(2)}%).`);
        return;
      }
    }
    setSalvando(true);
    try {
      const corpo = { nome: nome.trim(), servico, itens };
      if (editandoId) {
        await atualizarModeloCardapio(auth, editandoId, corpo);
        setAviso("Modelo atualizado.");
      } else {
        await criarModeloCardapio(auth, corpo);
        setAviso("Modelo criado.");
      }
      limpar();
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function excluirModelo(modelo: CardapioModelo) {
    if (!window.confirm(`Excluir o modelo "${modelo.nome}"?`)) return;
    try {
      await excluirModeloCardapio(auth, modelo.id);
      if (editandoId === modelo.id) limpar();
      await carregar();
      setAviso("Modelo excluído.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function adicionarRegra() {
    setErro(null);
    if (!modeloGrade) { setErro("Escolha o modelo da grade."); return; }
    try {
      await salvarRegraGrade(auth, { diaSemana, servico: servicoGrade, modeloId: modeloGrade, ativo: true });
      await carregar();
      setAviso("Grade atualizada.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function removerRegra(regra: CardapioGradeRegra) {
    try {
      await excluirRegraGrade(auth, regra.id);
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  async function gerar() {
    setErro(null);
    setGerando(true);
    try {
      const resultado = await gerarEscalaCardapio(auth, { dataInicio, dias: 30 });
      setAviso(`Escala gerada: ${resultado.totalCriados} dia(s) criado(s), ${resultado.totalIgnorados} já existente(s).`);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setGerando(false);
    }
  }

  const modelosDoServico = modelos.filter((modelo) => modelo.servico === servicoGrade);
  const nomeModelo = (id: string) => modelos.find((modelo) => modelo.id === id)?.nome ?? id;

  return (
    <main className="space-y-5 p-4 md:p-6">
      <HotelModulesNav />
      <header>
        <h1 className="text-2xl font-semibold">Modelos de cardápio e grade semanal</h1>
        <p className="text-sm text-muted-foreground">
          Monte o cardápio uma vez, agende na grade e gere os próximos 30 dias sem sobrescrever o que já existe.
        </p>
        <Link href="/hotelaria/restaurante/cardapios" className="mt-2 inline-flex rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Voltar para o cardápio do dia
        </Link>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <div className="flex gap-2 border-b">
        <button type="button" className={`px-3 py-2 text-sm ${aba === "modelos" ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-muted-foreground"}`} onClick={() => setAba("modelos")}>Modelos</button>
        <button type="button" className={`px-3 py-2 text-sm ${aba === "grade" ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-muted-foreground"}`} onClick={() => setAba("grade")}>Grade semanal</button>
      </div>

      {aba === "modelos" && (
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{editandoId ? "Editar modelo" : "Novo modelo"}</h2>
            <label className="block text-sm">Nome
              <input className="mt-1 w-full rounded-md border p-2" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Almoço Executivo" />
            </label>
            <label className="block text-sm">Serviço
              <select className="mt-1 w-full rounded-md border p-2" value={servico} onChange={(event) => setServico(event.target.value as CardapioServico)}>
                {SERVICOS.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
              </select>
            </label>
            <div className="space-y-2">
              <p className="text-sm font-medium">Pratos e rateio</p>
              <p className="text-xs text-muted-foreground">Proteína e acompanhamento usam percentual; a soma de cada grupo deve dar 100%.</p>
              <div className="max-h-80 space-y-2 overflow-auto pr-1">
                {fichas.map((ficha) => {
                  const item = selecao[ficha.id];
                  return (
                    <div key={ficha.id} className="rounded-md border p-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={!!item} onChange={() => alternarFicha(ficha.id)} />
                        <span className="flex-1">{ficha.nome}</span>
                      </label>
                      {item && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            className="rounded-md border p-1 text-xs"
                            value={item.categoria}
                            onChange={(event) => setSelecao((anterior) => ({ ...anterior, [ficha.id]: { ...item, categoria: event.target.value as CategoriaItemCardapio } }))}
                          >
                            <option value="proteina">Proteína</option>
                            <option value="acompanhamento">Acompanhamento</option>
                            <option value="outro">Outro</option>
                          </select>
                          {item.categoria !== "outro" && (
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              %
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                className="w-20 rounded-md border p-1"
                                value={item.percentual}
                                onChange={(event) => setSelecao((anterior) => ({ ...anterior, [ficha.id]: { ...item, percentual: event.target.value } }))}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={salvando} onClick={() => void salvarModelo()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Criar modelo"}
              </button>
              {editandoId && <button type="button" onClick={limpar} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>}
            </div>
          </section>

          <section className="space-y-3">
            {modelos.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum modelo criado ainda.</p>}
            {modelos.map((modelo) => (
              <article key={modelo.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{modelo.nome}</p>
                    <p className="text-xs text-muted-foreground">{SERVICOS.find((item) => item.valor === modelo.servico)?.rotulo ?? modelo.servico} · {modelo.itens.length} prato(s)</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => editar(modelo)}>Editar</button>
                    <button type="button" className="rounded-md border px-2 py-1 text-xs text-red-700" onClick={() => void excluirModelo(modelo)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {modelo.itens.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>{item.fichaNome}</span>
                      <span className="text-xs text-muted-foreground">{item.categoria} {item.percentualRateio ? `· ${Number(item.percentualRateio)}%` : ""}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </div>
      )}

      {aba === "grade" && (
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">Adicionar regra</h2>
            <label className="block text-sm">Dia da semana
              <select className="mt-1 w-full rounded-md border p-2" value={diaSemana} onChange={(event) => setDiaSemana(Number(event.target.value))}>
                {DIAS.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}
              </select>
            </label>
            <label className="block text-sm">Serviço
              <select className="mt-1 w-full rounded-md border p-2" value={servicoGrade} onChange={(event) => { setServicoGrade(event.target.value as CardapioServico); setModeloGrade(""); }}>
                {SERVICOS.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
              </select>
            </label>
            <label className="block text-sm">Modelo
              <select className="mt-1 w-full rounded-md border p-2" value={modeloGrade} onChange={(event) => setModeloGrade(event.target.value)}>
                <option value="">Selecione</option>
                {modelosDoServico.map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nome}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void adicionarRegra()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white"><Plus className="mr-1 inline h-3.5 w-3.5" />Salvar regra</button>
            <hr />
            <h2 className="font-semibold">Gerar escala</h2>
            <label className="block text-sm">A partir de
              <input type="date" className="mt-1 w-full rounded-md border p-2" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} />
            </label>
            <button type="button" disabled={gerando} onClick={() => void gerar()} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              {gerando ? "Gerando…" : "Gerar próximos 30 dias"}
            </button>
          </section>

          <section className="space-y-3">
            {grade.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhuma regra na grade.</p>}
            {grade.map((regra) => (
              <article key={regra.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm">
                <div>
                  <p className="font-medium">{DIAS[regra.diaSemana]} · {SERVICOS.find((item) => item.valor === regra.servico)?.rotulo ?? regra.servico}</p>
                  <p className="text-xs text-muted-foreground">{nomeModelo(regra.modeloId)}</p>
                </div>
                <button type="button" className="rounded-md border px-2 py-1 text-xs text-red-700" onClick={() => void removerRegra(regra)}><Trash2 className="h-3.5 w-3.5" /></button>
              </article>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
