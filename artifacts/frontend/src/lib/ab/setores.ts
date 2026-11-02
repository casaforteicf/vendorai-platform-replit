/**
 * Vocabulário de setores de A&B.
 *
 * O banco guarda `ab_cargos.setor` como texto livre (decisão registrada no lote
 * AB-01: virar ENUM só quando os setores estiverem estabilizados). Enquanto
 * isso, o frontend normaliza o valor para um slug estável — assim "Gerência",
 * "gerencia" e " GERÊNCIA " caem todos na mesma chave de agrupamento — e a
 * migração futura para ENUM é um `UPDATE` de normalização, não um cadastro novo.
 */

export const SETORES = [
  { valor: "cozinha", rotulo: "Cozinha" },
  { valor: "almoxarifado", rotulo: "Almoxarifado" },
  { valor: "saladeira", rotulo: "Saladeira" },
  { valor: "confeitaria", rotulo: "Confeitaria" },
  { valor: "gerencia", rotulo: "Gerência" },
] as const;

export type SetorConhecido = (typeof SETORES)[number]["valor"];

/** Valor sentinela do `<select>` que revela o campo de texto livre. */
export const OUTRO_SETOR = "__outro__";

/** Remove acentos, espaços e pontuação: "Cozinha Quente!" -> "cozinha-quente". */
export function normalizarSetor(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function setorEhConhecido(valor: string): valor is SetorConhecido {
  return SETORES.some((setor) => setor.valor === valor);
}

/** Rótulo humano: usa o vocabulário fixo ou deriva do slug ("cozinha-quente"). */
export function rotuloSetor(valor: string): string {
  const conhecido = SETORES.find((setor) => setor.valor === valor);
  if (conhecido) return conhecido.rotulo;
  const limpo = valor.trim();
  if (!limpo) return "Sem setor";
  const palavras = limpo.replace(/-+/g, " ").trim().toLowerCase();
  return palavras.charAt(0).toUpperCase() + palavras.slice(1);
}
