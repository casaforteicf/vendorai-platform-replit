/**
 * Render — transporte HTTP para o worker legado da VPS (vendorai-prod-browser).
 *
 * O contrato `TransporteRender` é preservado: `enviar` (POST) e `consultar` (GET). A URL vem do
 * ambiente (`RENDER_WORKER_URL`), nunca do código — e a imagem é devolvida PRESIGNADA (R2) pelo
 * worker, não como caminho público fixo.
 */

import type { RespostaEnvio, RespostaEstado, TransporteRender } from './cliente';
import type { PedidoRender } from './pedido';

export interface ConfiguracaoWorker {
  baseUrl: string;
  token?: string;
  fetch: typeof fetch;
  /** Default: `${baseUrl}/render` */
  caminhoEnvio?: string;
  /** Default: `${baseUrl}/render/:id` */
  caminhoEstado?: string;
}

function semBarraFinal(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function criarTransporteHttp(config: ConfiguracaoWorker): TransporteRender {
  const base = semBarraFinal(config.baseUrl);
  const envio = config.caminhoEnvio ?? '/render';
  const estado = config.caminhoEstado ?? '/render';

  const cabecalhos = (): Record<string, string> =>
    config.token === undefined || config.token.trim().length === 0
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token };

  const ler = async (resposta: Response): Promise<unknown> => {
    if (!resposta.ok) {
      throw new Error('worker respondeu ' + String(resposta.status));
    }
    return resposta.json();
  };

  return {
    async enviar(pedido: PedidoRender): Promise<RespostaEnvio> {
      const resposta = await config.fetch(base + envio, {
        method: 'POST',
        headers: cabecalhos(),
        body: JSON.stringify(pedido),
      });
      const corpo = (await ler(resposta)) as { jobId?: unknown };
      if (typeof corpo.jobId !== 'string' || corpo.jobId.length === 0) {
        throw new Error('worker não devolveu jobId');
      }
      return { jobId: corpo.jobId };
    },

    async consultar(jobId: string): Promise<RespostaEstado> {
      const resposta = await config.fetch(base + estado + '/' + encodeURIComponent(jobId), {
        method: 'GET',
        headers: cabecalhos(),
      });
      const corpo = (await ler(resposta)) as { estado?: unknown; url?: unknown; erro?: unknown };
      const possiveis = ['na_fila', 'processando', 'pronto', 'falhou'];
      if (typeof corpo.estado !== 'string' || !possiveis.includes(corpo.estado)) {
        throw new Error('estado desconhecido do worker');
      }
      return {
        estado: corpo.estado as RespostaEstado['estado'],
        ...(typeof corpo.url === 'string' ? { url: corpo.url } : {}),
        ...(typeof corpo.erro === 'string' ? { erro: corpo.erro } : {}),
      };
    },
  };
}

export interface AmbienteRender {
  RENDER_WORKER_URL?: string;
  RENDER_WORKER_TOKEN?: string;
  R2_BUCKET?: string;
  R2_ENDPOINT?: string;
}

export interface ConfiguracaoRenderResolvida {
  worker: TransporteRender;
  bucketR2: string | null;
}

/**
 * Monta o transporte a partir do ambiente. Sem `RENDER_WORKER_URL`, devolve `null` — a UI deve
 * mostrar "render não configurado" em vez de tentar e falhar.
 */
export function transporteDeAmbiente(
  ambiente: AmbienteRender,
  buscar: typeof fetch,
): ConfiguracaoRenderResolvida | null {
  const url = ambiente.RENDER_WORKER_URL;
  if (url === undefined || url.trim().length === 0) return null;
  return {
    worker: criarTransporteHttp({ baseUrl: url, token: ambiente.RENDER_WORKER_TOKEN, fetch: buscar }),
    bucketR2: ambiente.R2_BUCKET === undefined || ambiente.R2_BUCKET.trim().length === 0 ? null : ambiente.R2_BUCKET,
  };
}
