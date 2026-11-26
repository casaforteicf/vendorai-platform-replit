import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, Printer, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatarDataBR, hojeISO } from "@/lib/ab/datas";
import {
  excluirPrevisaoBriffing,
  listarPrevisoesBriffing,
  mensagemDoErro,
  salvarPrevisaoBriffing,
  type AbAuth,
  type BriffingPrevisao,
  type CardapioServico,
} from "@/lib/ab/client";
import RestaurantModulesNav from "../RestaurantModulesNav";

type Linha = { data: string; cafe_manha: string; almoco: string; jantar: string };

function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T12:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function gerarLinhas(inicio: string): Linha[] {
  return Array.from({ length: 7 }, (_, indice) => ({
    data: somarDias(inicio, indice),
    cafe_manha: "",
    almoco: "",
    jantar: "",
  }));
}

const SERVICOS_DIA: Array<{ chave: Exclude<CardapioServico, "outro">; label: string }> = [
  { chave: "cafe_manha", label: "Café da manhã" },
  { chave: "almoco", label: "Almoço" },
  { chave: "jantar", label: "Jantar" },
];

function chave(data: string, servico: string): string {
  return `${data}|${servico}`;
}

export default function Ocupacao() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const [inicio, setInicio] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>(() => gerarLinhas(hojeISO()));
  const [ids, setIds] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const fim = useMemo(() => somarDias(inicio, 6), [inicio]);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErro(null);
    try {
      const previsoes = await listarPrevisoesBriffing(auth, { de: inicio, ate: fim });
      const mapa = new Map<string, BriffingPrevisao>(previsoes.map((item) => [chave(item.data, item.servico), item]));
      const novosIds: Record<string, string> = {};
      const novasLinhas = gerarLinhas(inicio).map((linha) => {
        const atualizada = { ...linha };
        for (const servico of SERVICOS_DIA) {
          const previsao = mapa.get(chave(linha.data, servico.chave));
          if (previsao) {
            atualizada[servico.chave] = String(previsao.ocupacao);
            novosIds[chave(linha.data, servico.chave)] = previsao.id;
          }
        }
        return atualizada;
      });
      setLinhas(novasLinhas);
      setIds(novosIds);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [auth, fim, inicio, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  function atualizar(data: string, servico: Exclude<CardapioServico, "outro">, valor: string) {
    setLinhas((lista) => lista.map((linha) => linha.data === data ? { ...linha, [servico]: valor } : linha));
  }

  async function salvarLinha(linha: Linha) {
    setErro(null);
    setAviso(null);
    setSalvando(linha.data);
    try {
      const proximosIds = { ...ids };
      for (const servico of SERVICOS_DIA) {
        const bruto = linha[servico.chave].trim();
        const valor = bruto ? Number(bruto) : 0;
        if (!Number.isInteger(valor) || valor < 0) throw new Error(`Ocupação inválida em ${servico.label}.`);
        const chaveServico = chave(linha.data, servico.chave);
        const existente = proximosIds[chaveServico];
        if (valor > 0) {
          const salva = await salvarPrevisaoBriffing(auth, { data: linha.data, servico: servico.chave, ocupacao: valor });
          proximosIds[chaveServico] = salva.id;
        } else if (existente) {
          await excluirPrevisaoBriffing(auth, existente);
          delete proximosIds[chaveServico];
        }
      }
      setIds(proximosIds);
      setAviso(`Ocupação de ${formatarDataBR(linha.data)} salva.`);
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(null);
    }
  }

  async function salvarTudo() {
    setErro(null);
    setAviso(null);
    setSalvando("todos");
    try {
      const proximosIds = { ...ids };
      for (const linha of linhas) {
        for (const servico of SERVICOS_DIA) {
          const bruto = linha[servico.chave].trim();
          const valor = bruto ? Number(bruto) : 0;
          if (!Number.isInteger(valor) || valor < 0) throw new Error(`Ocupação inválida em ${formatarDataBR(linha.data)} · ${servico.label}.`);
          const chaveServico = chave(linha.data, servico.chave);
          const existente = proximosIds[chaveServico];
          if (valor > 0) {
            const salva = await salvarPrevisaoBriffing(auth, { data: linha.data, servico: servico.chave, ocupacao: valor });
            proximosIds[chaveServico] = salva.id;
          } else if (existente) {
            await excluirPrevisaoBriffing(auth, existente);
            delete proximosIds[chaveServico];
          }
        }
      }
      setIds(proximosIds);
      setAviso("Ocupação do período salva.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <RestaurantModulesNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Restaurante</p>
          <h1 className="mt-1 text-2xl font-semibold">Ocupação por data e refeição</h1>
          <p className="text-sm text-muted-foreground">
            A ocupação pode ser digitada ou importada por planilha/API. Defina a data, o serviço e salve; o Briffing usa essa previsão para calcular a produção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hotelaria/restaurante/importar?tipo=briffing" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Importar ocupação/API</Link>
          <Link href={`/hotelaria/restaurante/briffing/imprimir?data=${inicio}`} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Printer className="h-4 w-4" /> Imprimir briffing
          </Link>
        </div>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label className="text-sm">Início do período
          <input type="date" className="mt-1 block rounded-md border p-2" value={inicio} onChange={(event) => setInicio(event.target.value || hojeISO())} />
        </label>
        <p className="pb-2 text-sm text-muted-foreground">Até {formatarDataBR(fim)} (7 dias)</p>
        <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => void carregar()}><CalendarDays className="mr-1 inline h-4 w-4" />Atualizar</button>
        <button type="button" disabled={salvando !== null} className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" onClick={() => void salvarTudo()}>
          <Save className="h-4 w-4" /> {salvando === "todos" ? "Salvando..." : "Salvar período"}
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3">Data</th>
              {SERVICOS_DIA.map((servico) => <th key={servico.chave} className="p-3">{servico.label} (hóspedes)</th>)}
              <th className="p-3">Total</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => {
              const total = SERVICOS_DIA.reduce((soma, servico) => soma + (Number(linha[servico.chave]) || 0), 0);
              return (
                <tr key={linha.data} className="border-t">
                  <td className="p-3 font-medium">{formatarDataBR(linha.data)}</td>
                  {SERVICOS_DIA.map((servico) => (
                    <td key={servico.chave} className="p-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="w-28 rounded-md border p-2"
                        value={linha[servico.chave]}
                        placeholder="0"
                        aria-label={`${servico.label} de ${formatarDataBR(linha.data)}`}
                        onChange={(event) => atualizar(linha.data, servico.chave, event.target.value)}
                      />
                    </td>
                  ))}
                  <td className="p-3 font-semibold">{total}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/hotelaria/restaurante/briffing/imprimir?data=${linha.data}`} className="rounded border px-2 py-1 text-xs hover:bg-muted">Relatório</Link>
                      <button type="button" disabled={salvando !== null} className="rounded border px-2 py-1 text-xs hover:bg-muted" onClick={() => void salvarLinha(linha)}>
                        {salvando === linha.data ? "Salvando..." : "Salvar dia"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {carregando && <p className="text-sm text-muted-foreground">Carregando ocupação...</p>}
    </main>
  );
}
