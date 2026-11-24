/**
 * FEFO (First Expired, First Out) e sanidade do recebimento — A&B (AB-06).
 *
 * Função pura: recebe a validade e a temperatura, devolve a etiqueta e o status.
 * O servidor SEMPRE recalcula no POST — a etiqueta nunca vem do cliente, senão
 * um recebedor poderia "aprovar" uma carne a 5 °C mandando etiqueta verde.
 */

export type EtiquetaFefo = "verde" | "amarelo" | "vermelho";
export type StatusRecebimento = "aprovado" | "bloqueado";

/** Limite sanitário para carne refrigerada. Acima disso, bloqueia. */
export const TEMPERATURA_MAXIMA_CARNE_C = -12.0;

/** Vira o FEFO vermelho: menos de uma semana para vencer. */
export const DIAS_CRITICOS = 7;

/** Faixa de atenção: de 7 a 30 dias. Acima disso, verde. */
export const DIAS_ATENCAO = 30;

const MS_POR_DIA = 86_400_000;

function dataUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Dias inteiros entre hoje e a validade. Negativo = já vencido. */
export function diasAteValidade(dataValidade: string, hoje: string): number {
  const validade = dataUtc(dataValidade);
  const referencia = dataUtc(hoje);
  if (Number.isNaN(validade) || Number.isNaN(referencia)) {
    throw new Error(`Data inválida: validade="${dataValidade}" hoje="${hoje}"`);
  }
  return Math.round((validade - referencia) / MS_POR_DIA);
}

/**
 * Etiqueta FEFO:
 *  - menos de 7 dias (incluindo vencido) → vermelho;
 *  - de 7 a 30 dias → amarelo;
 *  - mais de 30 dias → verde.
 */
export function classificarFefo(dataValidade: string, hoje: string): EtiquetaFefo {
  const dias = diasAteValidade(dataValidade, hoje);
  if (dias < DIAS_CRITICOS) return "vermelho";
  if (dias <= DIAS_ATENCAO) return "amarelo";
  return "verde";
}

/** Normaliza para comparar categoria sem acento/caixa: "Carnes Bovina" → "carnes bovina". */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Categoria que exige controle de temperatura. Olha o nome da categoria porque
 * o cadastro é livre ("Carnes", "Carnes Bovinas", "Açougue"…), mas AO MESMO
 * TEMPO qualquer temperatura informada acima do limite bloqueia — não importa a
 * categoria. Um queijo a 8 °C também é risco, e ignorar isso seria pior que
 * bloquear a mais.
 */
export function exigeTemperatura(categoriaNome: string | null | undefined): boolean {
  return normalizar(categoriaNome).includes("carne");
}

export type AvaliacaoSanidade = {
  status: StatusRecebimento;
  motivoBloqueio: string | null;
  /** true quando a categoria obriga informar temperatura. */
  temperaturaObrigatoria: boolean;
  temperaturaInadequada: boolean;
};

/**
 * Avalia a sanidade do recebimento.
 *
 * `temperaturaC` nula em categoria que exige temperatura é ERRO de payload
 * (o chamador responde 422), não "aprovado por omissão": sem medir, não se
 * declara apto.
 */
export function avaliarSanidade(params: {
  categoriaNome: string | null | undefined;
  temperaturaC: number | null | undefined;
}): AvaliacaoSanidade {
  const { categoriaNome, temperaturaC } = params;
  const temperaturaObrigatoria = exigeTemperatura(categoriaNome);

  if (temperaturaC === null || temperaturaC === undefined) {
    return {
      status: temperaturaObrigatoria ? "bloqueado" : "aprovado",
      motivoBloqueio: temperaturaObrigatoria ? "Temperatura não informada" : null,
      temperaturaObrigatoria,
      temperaturaInadequada: false,
    };
  }

  const temperaturaInadequada = temperaturaC > TEMPERATURA_MAXIMA_CARNE_C;

  if (!temperaturaInadequada) {
    return { status: "aprovado", motivoBloqueio: null, temperaturaObrigatoria, temperaturaInadequada: false };
  }

  return {
    status: "bloqueado",
    motivoBloqueio:
      `Temperatura ${temperaturaC.toFixed(1)} °C acima do limite de ` +
      `${TEMPERATURA_MAXIMA_CARNE_C.toFixed(1)} °C` +
      (temperaturaObrigatoria ? " para carnes" : " (risco sanitário)"),
    temperaturaObrigatoria,
    temperaturaInadequada: true,
  };
}
