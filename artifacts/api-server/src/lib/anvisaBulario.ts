/**
 * Cliente pro Bulário Eletrônico da ANVISA (consultas.anvisa.gov.br).
 *
 * IMPORTANTE — leia antes de usar em produção:
 * Este NÃO é um endpoint oficial documentado pela ANVISA. É o mesmo backend
 * que o site https://consultas.anvisa.gov.br/#/bulario/ usa por trás da busca
 * (descoberto via engenharia reversa por projetos open-source como
 * github.com/iuryLandin/bulario e usado por serviços como a Infosimples).
 * Não tem SLA, não tem contrato de API estável, e pode mudar de formato ou
 * ficar fora do ar sem aviso — a ANVISA pode até bloquear tráfego automatizado.
 *
 * Este código foi escrito sem conseguir testar contra o endpoint real (o
 * sandbox onde foi desenvolvido não tem acesso de rede a consultas.anvisa.gov.br,
 * só a registries de pacote). A parte de parsing da resposta de busca é
 * defensiva por causa disso: tenta os formatos de resposta mais prováveis e,
 * se não reconhecer o formato, loga o corpo bruto em vez de falhar em
 * silêncio — para dar pra ajustar rápido rodando de verdade em produção
 * (Railway tem saída de rede irrestrita, deve alcançar o site sem problema).
 *
 * Rode primeiro pra 1-2 produtos reais e confira o log antes de rodar em lote
 * pro catálogo inteiro.
 */
import type { Logger } from "pino";

const SEARCH_URL = "https://consultas.anvisa.gov.br/api/consulta/bulario";
const DOWNLOAD_URL_BASE = "https://consultas.anvisa.gov.br/api/consulta/downloadPDF";
const TIMEOUT_MS = 15_000;
const USER_AGENT = "VendorAI-BularioSync/1.0 (+https://appvendorai.com)";

export interface BulaEncontrada {
  /** ID usado pra baixar o PDF (formato exato ainda a confirmar em produção) */
  id: string;
  nomeProduto: string;
  empresa: string | null;
  numeroRegistro: string | null;
  tipoBula: string | null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca bulas pelo nome do medicamento (nome comercial ou princípio ativo).
 * Retorna null se a chamada falhar ou o formato de resposta não for
 * reconhecido (loga o motivo); retorna [] se a busca funcionou mas não achou
 * nada.
 */
export async function searchBulaAnvisa(
  nomeMedicamento: string,
  log: Logger,
): Promise<BulaEncontrada[] | null> {
  const params = new URLSearchParams({
    nomeMedicamento,
    numeroRegistro: "",
    numeroExpediente: "",
    count: "10",
    page: "1",
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`);
  } catch (err) {
    log.warn({ err, nomeMedicamento }, "anvisaBulario: falha de rede na busca");
    return null;
  }

  if (!res.ok) {
    log.warn(
      { status: res.status, nomeMedicamento },
      "anvisaBulario: busca retornou status não-OK — endpoint pode ter mudado ou bloqueado o request",
    );
    return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    log.warn({ err, nomeMedicamento }, "anvisaBulario: resposta não é JSON válido");
    return null;
  }

  // Formatos possíveis observados em implementações de terceiros — tenta em
  // ordem. Se nenhum bater, loga o corpo bruto (truncado) pra ajuste manual.
  const candidateArrays: unknown[] = [
    (body as any)?.content,
    (body as any)?.data,
    (body as any)?.items,
    Array.isArray(body) ? body : undefined,
  ].filter(Boolean);

  const rawList = candidateArrays[0] as Record<string, unknown>[] | undefined;

  if (!rawList || !Array.isArray(rawList)) {
    log.warn(
      { nomeMedicamento, bodyPreview: JSON.stringify(body).slice(0, 500) },
      "anvisaBulario: formato de resposta não reconhecido — ajustar parsing em anvisaBulario.ts com base nesse preview",
    );
    return null;
  }

  const resultados: BulaEncontrada[] = rawList
    .map((item): BulaEncontrada | null => {
      const id = (item.id ?? item.idBula ?? item.numeroBula ?? item.bulaId) as string | undefined;
      const nomeProduto = (item.nomeProduto ?? item.nome ?? item.produto) as string | undefined;
      if (!id || !nomeProduto) return null;
      return {
        id: String(id),
        nomeProduto,
        empresa: (item.empresa ?? item.razaoSocial ?? null) as string | null,
        numeroRegistro: (item.numeroRegistro ?? item.registro ?? null) as string | null,
        tipoBula: (item.tipoBula ?? item.tipo ?? null) as string | null,
      };
    })
    .filter((x): x is BulaEncontrada => x !== null);

  if (resultados.length === 0 && rawList.length > 0) {
    log.warn(
      { nomeMedicamento, itemPreview: JSON.stringify(rawList[0]).slice(0, 500) },
      "anvisaBulario: itens encontrados mas campos esperados (id/nomeProduto) não bateram — ajustar mapeamento",
    );
  }

  return resultados;
}

/** Baixa o PDF de uma bula pelo id retornado por searchBulaAnvisa. */
export async function downloadBulaPdf(bulaId: string, log: Logger): Promise<Buffer | null> {
  try {
    const res = await fetchWithTimeout(`${DOWNLOAD_URL_BASE}/${encodeURIComponent(bulaId)}`);
    if (!res.ok) {
      log.warn({ status: res.status, bulaId }, "anvisaBulario: download do PDF falhou");
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    log.warn({ err, bulaId }, "anvisaBulario: erro de rede baixando PDF");
    return null;
  }
}
