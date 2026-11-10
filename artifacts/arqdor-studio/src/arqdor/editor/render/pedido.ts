/**
 * Render — contrato do pedido (Frente C).
 *
 * O pedido carrega o **fingerprint do documento**: render de versão velha é o defeito clássico
 * (o arquiteto muda a parede, recebe a imagem antiga). Sem hash, não há como saber.
 *
 * Puro: sem rede, sem three, sem React.
 */

import type { Vetor3 } from '../modelador/schema';

export type QualidadeRender = 'preview' | 'final';

export interface CameraRender {
  posicao: Vetor3;
  alvo: Vetor3;
  /** Campo de visão vertical, em graus. */
  fov: number;
}

export interface PedidoRender {
  projetoId: string;
  /** Fingerprint do documento no momento do pedido. */
  documentoHash: string;
  camera: CameraRender;
  qualidade: QualidadeRender;
  resolucao: { largura: number; altura: number };
  /** ISO 8601 — momento do pedido. */
  criadoEm: string;
}

export type ErroPedido =
  | { codigo: 'DOCUMENTO_VAZIO' }
  | { codigo: 'PROJETO_INVALIDO' }
  | { codigo: 'CAMERA_INVALIDA'; detalhe: string }
  | { codigo: 'RESOLUCAO_INVALIDA'; detalhe: string };

export type ResultadoPedido = { ok: true; pedido: PedidoRender } | { ok: false; erro: ErroPedido };

/** Serialização estável: chaves ordenadas, para o mesmo documento dar sempre o mesmo hash. */
export function serializarEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) {
    return '[' + valor.map((item) => serializarEstavel(item)).join(',') + ']';
  }
  const registro = valor as Record<string, unknown>;
  const chaves = Object.keys(registro).sort();
  return '{' + chaves.map((chave) => JSON.stringify(chave) + ':' + serializarEstavel(registro[chave])).join(',') + '}';
}

/**
 * Fingerprint FNV-1a de 32 bits + comprimento. Não é hash criptográfico: serve para carimbar
 * versão, não para segurança.
 */
export function fingerprintDocumento(documento: unknown): string {
  const texto = serializarEstavel(documento);
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0') + '-' + texto.length.toString(16);
}

const MAX_LADO = 8192;
const MAX_PREVIEW = 2560;

export interface EntradaPedido {
  projetoId: string;
  documento: unknown;
  camera: CameraRender;
  qualidade: QualidadeRender;
  resolucao: { largura: number; altura: number };
  /** Injetável para teste; default = agora. */
  criadoEm?: string;
}

export function criarPedidoRender(entrada: EntradaPedido): ResultadoPedido {
  if (entrada.documento === null || entrada.documento === undefined) {
    return { ok: false, erro: { codigo: 'DOCUMENTO_VAZIO' } };
  }
  if (typeof entrada.projetoId !== 'string' || entrada.projetoId.trim().length === 0) {
    return { ok: false, erro: { codigo: 'PROJETO_INVALIDO' } };
  }

  const { posicao, alvo, fov } = entrada.camera;
  if (
    posicao.some((valor) => !Number.isFinite(valor)) ||
    alvo.some((valor) => !Number.isFinite(valor)) ||
    !Number.isFinite(fov) ||
    fov < 10 ||
    fov > 120
  ) {
    return { ok: false, erro: { codigo: 'CAMERA_INVALIDA', detalhe: 'posição/alvo finitos e fov entre 10° e 120°' } };
  }
  const distancia = Math.hypot(posicao[0] - alvo[0], posicao[1] - alvo[1], posicao[2] - alvo[2]);
  if (distancia < 1e-6) {
    return { ok: false, erro: { codigo: 'CAMERA_INVALIDA', detalhe: 'câmera na mesma posição do alvo' } };
  }

  const { largura, altura } = entrada.resolucao;
  const limite = entrada.qualidade === 'preview' ? MAX_PREVIEW : MAX_LADO;
  if (
    !Number.isInteger(largura) ||
    !Number.isInteger(altura) ||
    largura <= 0 ||
    altura <= 0 ||
    largura > limite ||
    altura > limite
  ) {
    return {
      ok: false,
      erro: { codigo: 'RESOLUCAO_INVALIDA', detalhe: 'inteiros entre 1 e ' + String(limite) + ' para ' + entrada.qualidade },
    };
  }

  return {
    ok: true,
    pedido: {
      projetoId: entrada.projetoId.trim(),
      documentoHash: fingerprintDocumento(entrada.documento),
      camera: { posicao: [...posicao] as Vetor3, alvo: [...alvo] as Vetor3, fov },
      qualidade: entrada.qualidade,
      resolucao: { largura, altura },
      criadoEm: entrada.criadoEm ?? new Date().toISOString(),
    },
  };
}
