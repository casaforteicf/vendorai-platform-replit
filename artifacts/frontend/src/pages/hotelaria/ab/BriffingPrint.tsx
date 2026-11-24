import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listarCardapios,
  listarFichas,
  listarPrevisoesBriffing,
  mensagemDoErro,
  type AbAuth,
  type BriffingPrevisao,
  type Cardapio,
  type CardapioServico,
  type FichaTecnica,
} from "@/lib/ab/client";
import {
  calcularBriffing,
  formatarQuantidade,
  type CardapioDia,
  type Prato,
  type ResultadoBriffing,
} from "@/lib/ab/briffing";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";

const SERVICOS: Array<{ chave: CardapioServico; label: string }> = [
  { chave: "cafe_manha", label: "Café da manhã" },
  { chave: "almoco", label: "Almoço" },
  { chave: "jantar", label: "Jantar" },
  { chave: "outro", label: "Outro" },
];

function chaveInsumo(insumo: { insumoId: string | null; insumoNome: string }): string {
  return insumo.insumoId ?? `nome:${insumo.insumoNome.trim().toLowerCase()}`;
}

function fichaParaPrato(ficha: FichaTecnica, porcoesPorPax: number): Prato {
  return {
    id: ficha.id,
    nome: ficha.nome,
    porcoesPorPax,
    ficha: ficha.insumos.map((insumo) => {
      const fator = Number(insumo.fatorCorrecao);
      return {
        insumoId: chaveInsumo(insumo),
        insumoNome: insumo.insumoNome,
        unidadeBase: insumo.unidadeBase,
        gramaturaPorPorcao: Number(insumo.quantidadePorPorcao),
        fatorCorrecao: Number.isFinite(fator) && fator > 0 ? fator : 1,
      };
    }),
  };
}

type Secao = {
  servico: CardapioServico;
  label: string;
  previsao: BriffingPrevisao | null;
  menus: Cardapio[];
  pratos: Prato[];
  resultado: ResultadoBriffing | null;
  erro: string | null;
};

export default function BriffingPrint() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const search = useSearch();
  const data = new URLSearchParams(search).get("data") || hojeISO();

  const [previsoes, setPrevisoes] = useState<BriffingPrevisao[]>([]);
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    void Promise.all([
      listarPrevisoesBriffing(auth, { de: data, ate: data }),
      listarCardapios(auth, { data }),
      listarFichas(auth),
    ])
      .then(([previsaoList, menuList, fichaList]) => {
        if (cancelado) return;
        setPrevisoes(previsaoList);
        setCardapios(menuList);
        setFichas(fichaList);
      })
      .catch((falha) => {
        if (!cancelado) setErro(mensagemDoErro(falha));
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [auth, data, tenantId, token]);

  const secoes = useMemo<Secao[]>(() => {
    const porFicha = new Map(fichas.map((ficha) => [ficha.id, ficha]));
    return SERVICOS.map(({ chave, label }) => {
      const previsao = previsoes.find((item) => item.servico === chave) ?? null;
      const menus = cardapios.filter((menu) => menu.servico === chave);
      const pratos: Prato[] = [];
      for (const menu of menus) {
        for (const item of menu.itens) {
          const ficha = porFicha.get(item.fichaId);
          if (ficha) pratos.push(fichaParaPrato(ficha, Number(item.porcoesPorPax) || 1));
        }
      }
      if (!previsao && menus.length === 0) {
        return { servico: chave, label, previsao, menus, pratos, resultado: null, erro: null };
      }
      let resultado: ResultadoBriffing | null = null;
      let erro: string | null = null;
      if (previsao && pratos.length > 0) {
        try {
          resultado = calcularBriffing(previsao.ocupacao, { data, pratos });
        } catch (falha) {
          erro = falha instanceof Error ? falha.message : "Não foi possível calcular o briffing.";
        }
      }
      return { servico: chave, label, previsao, menus, pratos, resultado, erro };
    }).filter((secao) => secao.previsao || secao.menus.length > 0);
  }, [cardapios, data, fichas, previsoes]);

  const totalHospedes = secoes.reduce((soma, secao) => soma + (secao.previsao?.ocupacao ?? 0), 0);

  return (
    <main className="mx-auto max-w-5xl bg-white p-6 text-slate-900 print:max-w-none print:p-0">
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } .print-break { break-before: page; } @page { margin: 12mm; } }`}</style>

      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link href="/hotelaria/restaurante/ocupacao" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" /> Voltar à ocupação
        </Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
        </button>
      </div>

      <header className="border-b pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Briffing de produção</p>
        <h1 className="mt-1 text-2xl font-bold">{formatarDataBR(data)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {totalHospedes} hóspede(s) previsto(s) · {secoes.length} serviço(s) · cardápio e demandas por turno
        </p>
      </header>

      {carregando && <p className="mt-6 text-sm text-slate-500">Carregando...</p>}
      {erro && <p className="mt-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {!carregando && !erro && secoes.length === 0 && (
        <p className="mt-6 rounded border border-dashed p-6 text-sm text-slate-500">
          Nenhuma ocupação ou cardápio cadastrado para {formatarDataBR(data)}. Defina a ocupação em Ocupação.
        </p>
      )}

      {secoes.map((secao, indice) => (
        <section key={secao.servico} className={`mt-6 ${indice > 0 ? "print-break" : ""}`}>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
            <h2 className="text-lg font-bold uppercase tracking-wide">{secao.label}</h2>
            <p className="text-sm text-slate-600">
              {secao.previsao ? `${secao.previsao.ocupacao} hóspede(s)` : "Sem ocupação definida"}
              {secao.previsao?.evento ? ` · ${secao.previsao.evento}` : ""}
            </p>
          </div>

          {secao.erro && <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{secao.erro}</p>}

          {secao.menus.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhum cardápio cadastrado para este serviço.</p>}

          {secao.menus.map((menu) => (
            <div key={menu.id} className="mt-3">
              <h3 className="text-sm font-semibold">{menu.nome}</h3>
              <table className="mt-1 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-1">Preparação</th>
                    <th className="py-1">Porções/pax</th>
                  </tr>
                </thead>
                <tbody>
                  {menu.itens.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-1">{item.fichaNome}</td>
                      <td className="py-1">{Number(item.porcoesPorPax).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {secao.previsao && secao.resultado && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Demanda de insumos do turno</h3>
              {secao.resultado.consolidado.length === 0 ? (
                <p className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                  As fichas deste turno estão sem ingredientes. Complete as receitas para gerar a demanda.
                </p>
              ) : (
                <table className="mt-1 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-slate-500">
                      <th className="py-1">Ingrediente</th>
                      <th className="py-1 text-right">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secao.resultado.consolidado.map((insumo) => (
                      <tr key={`${insumo.insumoId}-${insumo.unidade}`} className="border-b border-slate-100">
                        <td className="py-1">{insumo.insumoNome}</td>
                        <td className="py-1 text-right">{formatarQuantidade(insumo.quantidadeBase, insumo.unidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {secao.previsao && !secao.resultado && secao.pratos.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">Nenhuma preparação selecionada neste turno.</p>
          )}
        </section>
      ))}

      <footer className="mt-8 border-t pt-3 text-xs text-slate-500">
        Gerado pelo Vendor.ai · {new Date().toLocaleString("pt-BR")}
      </footer>
    </main>
  );
}
