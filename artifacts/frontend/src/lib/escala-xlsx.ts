import { estadoInicial, horarioDoGrupo, metasDoDia, type EscalaStaff, type EscalaState } from "./escala-ab";

const MESES: Array<[string, number]> = [
  ["JANEIRO", 1], ["FEVEREIRO", 2], ["MARCO", 3], ["ABRIL", 4], ["MAIO", 5], ["JUNHO", 6],
  ["JULHO", 7], ["AGOSTO", 8], ["SETEMBRO", 9], ["OUTUBRO", 10], ["NOVEMBRO", 11], ["DEZEMBRO", 12],
];
const MES_NOME = Object.fromEntries(MESES.map(([nome, numero]) => [numero, nome])) as Record<number, string>;

const ADULTO = /^A\s*-\s*(\d+)$/;
const CRIANCA = /^C\s*-\s*(\d+)$/;

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mesDoTitulo(titulo: string): number | null {
  const t = normalizar(titulo);
  for (const [nome, numero] of MESES) if (t.includes(nome)) return numero;
  return null;
}

function setorDaAba(nome: string): string | null {
  const n = normalizar(nome);
  if (n.includes("SALAO")) return "Salão";
  if (n.includes("QUIOSQUE")) return "Quiosque";
  if (n.includes("CONFEITARIA")) return "Confeitaria";
  if (n.includes("COZINHA")) return "Cozinha";
  return null;
}

export type ResumoPlanilha = {
  colaboradores: number;
  setores: Record<string, number>;
  abas: string[];
  abasIgnoradas: string[];
  diasComOcupacao: number;
};

type Secao = { tipo: "ALMOCO" | "JANTAR"; linha: number };

/**
 * Lê a planilha mensal de A&B (abas por setor, blocos ALMOÇO/JANTAR, folgas "F"
 * e ocupação A/C) e devolve o estado da escala para o período `inicio`.
 * Abas cujo título indica outro mês são ignoradas.
 */
export async function lerPlanilhaEscala(
  arquivo: ArrayBuffer,
  inicio: string,
  atual: EscalaState,
): Promise<{ estado: EscalaState; resumo: ResumoPlanilha }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(arquivo), { type: "array" });
  const mes = Number(inicio.slice(5, 7));
  const staff: EscalaStaff[] = [];
  const setores: Record<string, number> = {};
  const abas: string[] = [];
  const abasIgnoradas: string[] = [];
  let almoco: number[] | null = null;
  let jantar: number[] | null = null;

  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
    const titulo = String(rows[0]?.[0] ?? "");
    const mesAba = mesDoTitulo(titulo);
    if (mesAba !== null && mesAba !== mes) {
      abasIgnoradas.push(`${nome.trim()} (mês ${MES_NOME[mesAba]})`);
      continue;
    }
    const setor = setorDaAba(nome);
    if (!setor) {
      abasIgnoradas.push(`${nome.trim()} (setor não reconhecido)`);
      continue;
    }

    const secoes: Secao[] = [];
    rows.forEach((linha, i) => {
      const a = normalizar(linha[0]);
      if (a === "ALMOCO") secoes.push({ tipo: "ALMOCO", linha: i });
      else if (a === "JANTAR") secoes.push({ tipo: "JANTAR", linha: i });
    });
    if (secoes.length === 0) {
      abasIgnoradas.push(`${nome.trim()} (sem ALMOÇO/JANTAR)`);
      continue;
    }

    const adicionadosAntes = staff.length;
    secoes.forEach((secao, indice) => {
      const fim = secoes[indice + 1]?.linha ?? rows.length;
      let adultos: number[] | null = null;
      let criancas: number[] | null = null;

      for (let i = secao.linha; i < fim; i += 1) {
        const valores = Array.from({ length: 30 }, (_, d) => normalizar(rows[i]?.[d + 1]));
        const nAdultos = valores.filter((v) => ADULTO.test(v)).length;
        const nCriancas = valores.filter((v) => CRIANCA.test(v)).length;
        if (!adultos && nAdultos >= 20) {
          adultos = valores.map((v) => Number(ADULTO.exec(v)?.[1] ?? 0));
        } else if (!criancas && nCriancas >= 20) {
          criancas = valores.map((v) => Number(CRIANCA.exec(v)?.[1] ?? 0));
        }
      }

      if (secao.tipo === "ALMOCO" && !almoco && adultos) {
        almoco = adultos.map((a, d) => a + (criancas?.[d] ?? 0));
      }
      if (secao.tipo === "JANTAR" && !jantar && adultos) {
        jantar = adultos.map((a, d) => a + (criancas?.[d] ?? 0));
      }

      for (let i = secao.linha; i < fim; i += 1) {
        const linha = rows[i] ?? [];
        const bruto = String(linha[0] ?? "").replace(/\s+/g, " ").trim();
        const chave = normalizar(bruto);
        if (!bruto || chave === "ALMOCO" || chave === "JANTAR") continue;
        if (chave.startsWith("OCUPACAO") || chave.startsWith("ATENCAO") || chave.startsWith("ESCALA")) continue;

        const folgas = new Set<number>();
        for (let d = 1; d <= 30; d += 1) {
          if (normalizar(linha[d]) === "F") folgas.add(d);
        }
        // Linhas de cabeçalho (dias/semana) não têm nome na coluna A; as de
        // ocupação já foram excluídas acima. Só entram nomes de pessoas.
        const turno = setor === "Quiosque" ? "M" : secao.tipo === "ALMOCO" ? "M" : "N";
        const trabalho = 30 - folgas.size;
        staff.push({
          name: bruto,
          role: "Auxiliar",
          sector: setor,
          shift: turno,
          regime: trabalho <= 18 ? "5x2 parcial" : "5x2 integral",
          ...horarioDoGrupo(setor, turno),
          sunday: 1,
          schedule: [...Array.from({ length: 30 }, (_, d) => (folgas.has(d + 1) ? "F" : "T")), ...Array(5).fill("F")],
        });
      }
    });

    if (staff.length > adicionadosAntes) {
      abas.push(nome.trim());
      setores[setor] = (setores[setor] ?? 0) + (staff.length - adicionadosAntes);
    }
  }

  const base = estadoInicial(inicio);
  const days = base.days.map((dia, d) => {
    if (d >= 30 || !almoco || !jantar) return dia;
    const manha = almoco[d] ?? 0;
    const noite = jantar[d] ?? 0;
    return { ...dia, pax: noite, morning: manha, targets: metasDoDia(manha, noite) };
  });

  return {
    estado: { ...atual, start: inicio, days, staff, holidays: {} },
    resumo: {
      colaboradores: staff.length,
      setores,
      abas,
      abasIgnoradas,
      diasComOcupacao: almoco && jantar ? 30 : 0,
    },
  };
}
