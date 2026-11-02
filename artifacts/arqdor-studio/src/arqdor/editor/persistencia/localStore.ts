'use client';

/**
 * Repositório local de projetos (localStorage) sobre o documento versionado do motor.
 * Persistência real: a lista vem de `validar`, a gravação passa por `serializar`.
 */

import { estadoInicialCamadas } from '../bim/camadas';
import { ESTADO_INICIAL } from '../modelador/store-core';
import type { DocumentoArqdor } from './documento';
import { VERSAO_DOCUMENTO, desserializar, serializar, validar } from './documento';

const CHAVE_PROJETOS = 'arqdor.projetos.v1';
const CHAVE_ATIVO = 'arqdor.projetoAtivo';
const LIMITE_PROJETOS = 20;

export interface ResumoProjeto {
  id: string;
  nome: string;
  atualizadoEm: string;
  objetos: number;
}

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

function lerBrutos(): unknown[] {
  const store = banco();
  if (store === null) return [];
  const bruto = store.getItem(CHAVE_PROJETOS);
  if (bruto === null) return [];
  try {
    const lista = JSON.parse(bruto) as unknown;
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarBrutos(itens: readonly unknown[]): void {
  const store = banco();
  if (store === null) return;
  store.setItem(CHAVE_PROJETOS, JSON.stringify(itens.slice(0, LIMITE_PROJETOS)));
}

export function listarProjetos(): ResumoProjeto[] {
  const resumos: ResumoProjeto[] = [];
  for (const item of lerBrutos()) {
    const lido = validar(item);
    if (!lido.ok) continue;
    resumos.push({
      id: lido.documento.projeto.id,
      nome: lido.documento.projeto.nome,
      atualizadoEm: lido.documento.projeto.atualizadoEm,
      objetos: lido.documento.bim.length + lido.documento.modelador.solidos.length,
    });
  }
  return resumos.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
}

export function obterProjeto(id: string): DocumentoArqdor | null {
  for (const item of lerBrutos()) {
    const lido = validar(item);
    if (lido.ok && lido.documento.projeto.id === id) return lido.documento;
  }
  return null;
}

export function criarProjeto(nome: string): DocumentoArqdor {
  const agora = new Date().toISOString();
  const inicial = estadoInicialCamadas();
  const documento: DocumentoArqdor = {
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
  salvarProjeto(documento);
  definirAtivo(documento.projeto.id);
  return documento;
}

export function salvarProjeto(documento: DocumentoArqdor): void {
  const texto = serializar({
    projeto: { ...documento.projeto, atualizadoEm: new Date().toISOString() },
    camadas: {
      camadas: documento.camadas.camadas,
      modos: documento.camadas.modos,
      camadaAtivaId: documento.camadas.camadaAtivaId,
      modoAtivoId: documento.camadas.modoAtivoId,
      objetosOcultosIds: [],
    },
    bim: documento.bim,
    modelador: documento.modelador,
    mep: documento.mep,
  });

  const lido = desserializar(texto);
  if (!lido.ok) return;

  const outros = lerBrutos().filter((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const id = (item as { projeto?: { id?: unknown } }).projeto?.id;
    return id !== lido.documento.projeto.id;
  });

  gravarBrutos([lido.documento, ...outros]);
}

export function definirAtivo(id: string): void {
  banco()?.setItem(CHAVE_ATIVO, id);
}

export function projetoAtivoId(): string | null {
  return banco()?.getItem(CHAVE_ATIVO) ?? null;
}