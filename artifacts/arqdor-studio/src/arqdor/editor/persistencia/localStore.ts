/**
 * Ponteiro de sessão + criação de documento novo.
 *
 * IMPORTANTE: este arquivo NÃO guarda mais documentos. A fonte da verdade é o servidor
 * (`/api/projetos`, Postgres ou disco). O navegador guarda apenas QUAL projeto está aberto,
 * que é estado de UI e não pode ser confundido com o dado.
 */

import { estadoInicialCamadas } from '../bim/camadas';
import { ESTADO_INICIAL } from '../modelador/store-core';
import type { DocumentoArqdor } from './documento';
import { VERSAO_DOCUMENTO } from './documento';

const CHAVE_ATIVO = 'arqdor.projetoAtivo';

function banco(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function idNovo(): string {
  return 'proj_' + Math.random().toString(36).slice(2, 10);
}

/** Documento v2 vazio, pronto para ser enviado ao servidor. Não persiste nada. */
export function novoDocumento(nome: string): DocumentoArqdor {
  const agora = new Date().toISOString();
  const inicial = estadoInicialCamadas();
  return {
    versao: VERSAO_DOCUMENTO,
    projeto: {
      id: idNovo(),
      nome: nome.trim().length > 0 ? nome.trim() : 'Projeto sem nome',
      criadoEm: agora,
      atualizadoEm: agora,
    },
    camadas: {
      camadas: inicial.camadas,
      modos: inicial.modos,
      camadaAtivaId: inicial.camadaAtivaId,
      modoAtivoId: inicial.modoAtivoId,
    },
    bim: [],
    modelador: { solidos: [], proximoSolidoN: ESTADO_INICIAL.proximoSolidoN },
    mep: [],
  };
}

export function definirAtivo(id: string): void {
  banco()?.setItem(CHAVE_ATIVO, id);
}

export function projetoAtivoId(): string | null {
  return banco()?.getItem(CHAVE_ATIVO) ?? null;
}

export function limparAtivo(): void {
  banco()?.removeItem(CHAVE_ATIVO);
}
