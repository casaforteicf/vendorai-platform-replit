/**
 * FEFO e sanidade — espelho do cálculo do servidor (AB-06).
 *
 * Duplicação consciente: a API recalcula e é a fonte de verdade (o cliente não
 * decide status). Aqui a cópia serve para o feedback ao vivo — a etiqueta colorida
 * e o alerta de temperatura antes de salvar. As fronteiras (7/30 dias, -12 °C)
 * são as mesmas; se mudarem, mudam nos dois arquivos.
 */

export type EtiquetaFefo = "verde" | "amarelo" | "vermelho";
export type StatusRecebimento = "aprovado" | "bloqueado";

export const TEMPERATURA_MAXIMA_CARNE_C = -12.0;
export const DIAS_CRITICOS = 7;
export const DIAS_ATENCAO = 30;

const MS_POR_DIA = 86_400_000;

function dataUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function diasAteValidade(dataValidade: string, hoje: string): number {
  const validade = dataUtc(dataValidade);
  const referencia = dataUtc(hoje);
  if (Number.isNaN(validade) || Number.isNaN(referencia)) {
    throw new Error(`Data inválida: validade="${dataValidade}" hoje="${hoje}"`);
  }
  return Math.round((validade - referencia) / MS_POR_DIA);
}

export function classificarFefo(dataValidade: string, hoje: string): EtiquetaFefo {
  const dias = diasAteValidade(dataValidade, hoje);
  if (dias < DIAS_CRITICOS) return "vermelho";
  if (dias <= DIAS_ATENCAO) return "amarelo";
  return "verde";
}

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function exigeTemperatura(categoriaNome: string | null | undefined): boolean {
  return normalizar(categoriaNome).includes("carne");
}

export type AvaliacaoSanidade = {
  status: StatusRecebimento;
  motivoBloqueio: string | null;
  temperaturaObrigatoria: boolean;
  temperaturaInadequada: boolean;
};

export function avaliarSanidade(params: {
  categoriaNome: string | null | undefined;
  temperaturaC: number | null | undefined;
}): AvaliacaoSanidade {
  const { categoriaNome, temperaturaC } = params;
  const temperaturaObrigatoria = exigeTemperatura(categoriaNome);

  if (temperaturaC === null || temperaturaC === undefined || !Number.isFinite(temperaturaC)) {
    return {
      status: temperaturaObrigatoria ? "bloqueado" : "aprovado",
      motivoBloqueio: temperaturaObrigatoria ? "Temperatura não informada" : null,
      temperaturaObrigatoria,
      temperaturaInadequada: false,
    };
  }

  const temperaturaInadequada = temperaturaC > TEMPERATURA_MAXIMA_CARNE_C;
  if (!temperaturaInadequada) {
    return {
      status: "aprovado",
      motivoBloqueio: null,
      temperaturaObrigatoria,
      temperaturaInadequada: false,
    };
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

export const ROTULO_FEFO: Record<EtiquetaFefo, string> = {
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
};
