/**
 * Render — cliente de fila (Frente C).
 *
 * O cliente não conhece HTTP: fala com um `TransporteRender`. O adaptador do worker legado da
 * Contabo (`vendorai-prod-browser`) é uma dessas implementações — trocar transporte não muda a
 * regra de estados nem o polling.
 *
 * Relógio e sono são injetáveis para o teste não esperar de verdade.
 */

import type { PedidoRender } from './pedido';

export type EstadoJob = 'na_fila' | 'processando' | 'pronto' | 'falhou';

export interface RespostaEnvio {
  jobId: string;
}

export interface RespostaEstado {
  estado: EstadoJob;
  /** Obrigatória quando `pronto`. Preferir URL presignada (R2) — nunca caminho público fixo. */
  url?: string;
  erro?: string;
}

export interface TransporteRender {
  enviar(pedido: PedidoRender): Promise<RespostaEnvio>;
  consultar(jobId: string): Promise<RespostaEstado>;
}

export interface OpcoesCliente {
  intervaloMs?: number;
  timeoutMs?: number;
  dormir?: (ms: number) => Promise<void>;
  agora?: () => number;
}

export type ResultadoEnvio =
  | { ok: true; jobId: string }
  | { ok: false; erro: 'FALHA_ENVIO'; detalhe: string };

export type ResultadoEspera =
  | { ok: true; url: string; estado: 'pronto' }
  | { ok: false; erro: 'FALHOU' | 'TIMEOUT' | 'SEM_URL'; detalhe?: string };

export interface ClienteRender {
  enfileirar(pedido: PedidoRender): Promise<ResultadoEnvio>;
  consultar(jobId: string): Promise<RespostaEstado | null>;
  aguardar(jobId: string, opcoes?: OpcoesCliente): Promise<ResultadoEspera>;
}

const INTERVALO_PADRAO = 1500;
const TIMEOUT_PADRAO = 120_000;

export function criarClienteRender(
  transporte: TransporteRender,
  opcoesBase: OpcoesCliente = {},
): ClienteRender {
  const dormir = opcoesBase.dormir ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  const agora = opcoesBase.agora ?? (() => Date.now());

  return {
    async enfileirar(pedido) {
      try {
        const resposta = await transporte.enviar(pedido);
        if (typeof resposta.jobId !== 'string' || resposta.jobId.length === 0) {
          return { ok: false, erro: 'FALHA_ENVIO', detalhe: 'worker não devolveu jobId' };
        }
        return { ok: true, jobId: resposta.jobId };
      } catch (erro) {
        return { ok: false, erro: 'FALHA_ENVIO', detalhe: erro instanceof Error ? erro.message : String(erro) };
      }
    },

    async consultar(jobId) {
      try {
        return await transporte.consultar(jobId);
      } catch {
        return null;
      }
    },

    async aguardar(jobId, opcoes = {}) {
      const intervalo = opcoes.intervaloMs ?? opcoesBase.intervaloMs ?? INTERVALO_PADRAO;
      const timeout = opcoes.timeoutMs ?? opcoesBase.timeoutMs ?? TIMEOUT_PADRAO;
      const inicio = agora();

      for (;;) {
        const estado = await this.consultar(jobId);
        if (estado !== null) {
          if (estado.estado === 'falhou') {
            return { ok: false, erro: 'FALHOU', detalhe: estado.erro };
          }
          if (estado.estado === 'pronto') {
            if (estado.url === undefined || estado.url.length === 0) {
              return { ok: false, erro: 'SEM_URL', detalhe: 'job pronto sem URL' };
            }
            return { ok: true, url: estado.url, estado: 'pronto' };
          }
        }

        if (agora() - inicio >= timeout) {
          return { ok: false, erro: 'TIMEOUT', detalhe: 'excedeu ' + String(timeout) + ' ms' };
        }
        await dormir(intervalo);
      }
    },
  };
}
