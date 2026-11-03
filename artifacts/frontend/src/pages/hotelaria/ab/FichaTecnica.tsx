// FichaTecnica.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, X, ChefHat, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  criarFicha,
  listarFichas,
  mensagemDoErro,
  type AbAuth,
  type FichaTecnica as FichaSalva,
} from '@/lib/ab/client';

type Unidade = 'g' | 'ml' | 'un';

interface Insumo {
  id: string;
  nome: string;
  quantidade: string;
  unidade: Unidade;
  fatorCorrecao: string;
}

const novoInsumo = (): Insumo => ({
  id: crypto.randomUUID(),
  nome: '',
  quantidade: '',
  unidade: 'g',
  fatorCorrecao: '1',
});

export default function FichaTecnica() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const auth = useMemo<AbAuth>(() => ({ token: token ?? '', tenantId }), [token, tenantId]);

  const [nomePrato, setNomePrato] = useState('');
  const [rendimento, setRendimento] = useState('');
  const [insumos, setInsumos] = useState<Insumo[]>([novoInsumo()]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fichas, setFichas] = useState<FichaSalva[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);

  const carregarFichas = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregandoLista(true);
    try {
      setFichas(await listarFichas(auth));
    } catch (falha) {
      setErro(`Não foi possível carregar as fichas: ${mensagemDoErro(falha)}`);
    } finally {
      setCarregandoLista(false);
    }
  }, [auth, tenantId, token]);

  useEffect(() => {
    void carregarFichas();
  }, [carregarFichas]);

  const atualizarInsumo = (id: string, campo: keyof Insumo, valor: string) => {
    setInsumos((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [campo]: valor } : i))
    );
  };

  const adicionarInsumo = () => {
    setInsumos((prev) => [...prev, novoInsumo()]);
  };

  const removerInsumo = (id: string) => {
    setInsumos((prev) => prev.filter((i) => i.id !== id));
  };

  const salvar = async () => {
    setErro(null);
    setAviso(null);

    if (!tenantId) {
      setErro('Sessão sem hotel identificado. Entre novamente.');
      return;
    }

    const nome = nomePrato.trim();
    const porcoes = Number(rendimento);
    if (!nome) {
      setErro('Informe o nome do prato.');
      return;
    }
    if (!Number.isFinite(porcoes) || porcoes <= 0) {
      setErro('Informe o rendimento em porções (maior que zero).');
      return;
    }

    // A API recusa ficha sem insumo e insumo repetido: barra aqui para o erro
    // sair no campo, não como 422 genérico.
    const incompletos = insumos.filter(
      (i) => !i.nome.trim() || !(Number(i.quantidade) > 0),
    );
    if (insumos.length === 0 || incompletos.length > 0) {
      setErro('Todo insumo precisa de nome e quantidade maior que zero.');
      return;
    }
    const nomes = insumos.map((i) => i.nome.trim().toLowerCase());
    if (new Set(nomes).size !== nomes.length) {
      setErro('Há insumo repetido na ficha.');
      return;
    }

    setEnviando(true);
    try {
      await criarFicha(auth, {
        nome,
        rendimentoPorcoes: porcoes,
        insumos: insumos.map((i) => ({
          insumoNome: i.nome.trim(),
          unidadeBase: i.unidade,
          quantidadePorPorcao: Number(i.quantidade),
          fatorCorrecao: Number(i.fatorCorrecao) || 1,
        })),
      });
      setAviso(`Ficha "${nome}" salva.`);
      cancelar();
      await carregarFichas();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = () => {
    setNomePrato('');
    setRendimento('');
    setInsumos([novoInsumo()]);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto p-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Ficha Técnica de Receitas
              </h1>
              <p className="text-sm text-gray-500">
                Cadastre e gerencie os detalhes da sua preparação
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelar}
            title="Limpar formulário para nova receita"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Receita
          </button>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-2xl shadow-sm shadow-gray-200 ring-1 ring-gray-100 overflow-hidden">
          {/* Seção: Dados Gerais */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">
                Dados Gerais
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nome do Prato
                </label>
                <input
                  type="text"
                  value={nomePrato}
                  onChange={(e) => setNomePrato(e.target.value)}
                  placeholder="Ex.: Risoto de Cogumelos"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Rendimento (porções)
                </label>
                <input
                  type="number"
                  min={1}
                  value={rendimento}
                  onChange={(e) => setRendimento(e.target.value)}
                  placeholder="Ex.: 4"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Seção: Insumos */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                Insumos
              </h2>
              <button
                type="button"
                onClick={adicionarInsumo}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar Insumo
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl ring-1 ring-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left font-medium px-4 py-3">Insumo</th>
                    <th className="text-left font-medium px-4 py-3 w-32">Quantidade</th>
                    <th className="text-left font-medium px-4 py-3 w-28">Unidade</th>
                    <th className="text-left font-medium px-4 py-3 w-32">Fator de Correção</th>
                    <th className="w-14 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {insumos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        Nenhum insumo adicionado. Clique em "Adicionar Insumo".
                      </td>
                    </tr>
                  )}
                  {insumos.map((insumo) => (
                    <tr key={insumo.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={insumo.nome}
                          onChange={(e) => atualizarInsumo(insumo.id, 'nome', e.target.value)}
                          placeholder="Ex.: Arroz arbóreo"
                          className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={insumo.quantidade}
                          onChange={(e) => atualizarInsumo(insumo.id, 'quantidade', e.target.value)}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={insumo.unidade}
                          onChange={(e) => atualizarInsumo(insumo.id, 'unidade', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                        >
                          <option value="g">g</option>
                          <option value="ml">ml</option>
                          <option value="un">un</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          step="0.01"
                          value={insumo.fatorCorrecao}
                          onChange={(e) => atualizarInsumo(insumo.id, 'fatorCorrecao', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition"
                        />
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removerInsumo(insumo.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remover insumo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer de Ações */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={cancelar}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-700 text-sm font-medium ring-1 ring-gray-200 hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={enviando}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {enviando ? 'Salvando…' : 'Salvar Ficha Técnica'}
            </button>
          </div>

          {(erro || aviso) && (
            <div
              role={erro ? 'alert' : 'status'}
              className={`px-6 py-3 text-sm border-t ${
                erro
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {erro ?? aviso}
            </div>
          )}
        </div>

        {/* Fichas já cadastradas (GET /ab/fichas-tecnicas) */}
        <div className="bg-white rounded-2xl shadow-sm shadow-gray-200 ring-1 ring-gray-100 mt-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-gray-900">Fichas cadastradas</h2>
            </div>
            <span className="text-xs text-gray-500">
              {carregandoLista ? 'Carregando…' : `${fichas.length} ficha(s)`}
            </span>
          </div>

          {!carregandoLista && fichas.length === 0 && (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              Nenhuma ficha cadastrada ainda. Salve a primeira acima.
            </p>
          )}

          {fichas.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {fichas.map((ficha) => (
                <li key={ficha.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{ficha.nome}</p>
                    <p className="text-xs text-gray-500">
                      rende {Number(ficha.rendimentoPorcoes)} porção(ões) · {ficha.insumos.length} insumo(s)
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {ficha.insumos
                      .map(
                        (insumo) =>
                          `${insumo.insumoNome} ${Number(insumo.quantidadePorPorcao)}${insumo.unidadeBase}`,
                      )
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          As fichas são gravadas na API (ab_fichas_tecnicas + ab_ficha_insumos, na mesma transação).
        </p>
      </div>
    </div>
  );
}