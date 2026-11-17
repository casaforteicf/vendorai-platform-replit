/**
 * Persistência pura — documento versionado (JSON), validação e migração.
 *
 * Regra 9 na prática: `objetosOcultosIds` é estado de UI e NÃO é serializado.
 * Ao carregar, ele volta vazio — o filtro de camadas é do documento, a exceção é da sessão.
 */

import type { Camada, EstadoCamadas, ModoVisualizacao } from '../bim/camadas';
import { MODOS_PADRAO } from '../bim/camadas';
import type { ElementoBim } from '../bim/schema';
import type { ElementoMEP } from '../mep/schema';
import type { Solido } from '../modelador/schema';
import type { EstadoModelador } from '../modelador/store-core';

/** Versão corrente do formato. Subir junto com uma migração. */
export const VERSAO_DOCUMENTO = 2;

export interface ProjetoDoc {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CamadasDoc {
  camadas: Camada[];
  modos: ModoVisualizacao[];
  camadaAtivaId: string;
  modoAtivoId: string | null;
}

export interface DocumentoArqdor {
  versao: number;
  projeto: ProjetoDoc;
  camadas: CamadasDoc;
  bim: ElementoBim[];
  modelador: EstadoModelador;
  mep: ElementoMEP[];
}

export type ProblemaDoc = { caminho: string; problema: string };

export type ErroDocumento =
  | { codigo: 'JSON_INVALIDO'; detalhe: string }
  | { codigo: 'VERSAO_DESCONHECIDA'; versao: number }
  | { codigo: 'VERSAO_A_FRENTE'; versao: number; suportada: number }
  | { codigo: 'INVALIDO'; problemas: ProblemaDoc[] };

export type ResultadoDocumento =
  | { ok: true; documento: DocumentoArqdor; migrado: boolean; avisos: string[] }
  | { ok: false; erro: ErroDocumento };

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function stringOu(valor: unknown, padrao: string): string {
  return typeof valor === 'string' ? valor : padrao;
}

function numeroOu(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao;
}

/** Serializa em ordem fixa de chaves — dois documentos iguais geram a mesma string. */
export function serializar(entrada: {
  projeto: ProjetoDoc;
  camadas: EstadoCamadas;
  bim: readonly ElementoBim[];
  modelador: EstadoModelador;
  mep: readonly ElementoMEP[];
}): string {
  const documento: DocumentoArqdor = {
    versao: VERSAO_DOCUMENTO,
    projeto: {
      id: entrada.projeto.id,
      nome: entrada.projeto.nome,
      criadoEm: entrada.projeto.criadoEm,
      atualizadoEm: entrada.projeto.atualizadoEm,
    },
    camadas: {
      camadas: entrada.camadas.camadas.map((c) => ({
        id: c.id,
        nome: c.nome,
        visivel: c.visivel,
        padrao: c.padrao,
        ordem: c.ordem,
      })),
      modos: entrada.camadas.modos.map((m) => ({
        id: m.id,
        nome: m.nome,
        camadasVisiveis: [...m.camadasVisiveis],
        padrao: m.padrao,
      })),
      camadaAtivaId: entrada.camadas.camadaAtivaId,
      modoAtivoId: entrada.camadas.modoAtivoId,
    },
    bim: entrada.bim.map((e) => ({ ...e })),
    modelador: {
      solidos: entrada.modelador.solidos.map((s) => ({ ...s })),
      proximoSolidoN: entrada.modelador.proximoSolidoN,
    },
    mep: entrada.mep.map((e) => ({ ...e })),
  };
  return JSON.stringify(documento);
}

/** Migra um documento bruto até a versão corrente. Lança para versão desconhecida. */
export function migrar(bruto: unknown): { documento: unknown; migrado: boolean; avisos: string[] } {
  if (!ehObjeto(bruto)) throw new Error('documento nao e objeto');
  const avisos: string[] = [];
  let versao = numeroOu(bruto.versao, 0);
  let atual: Record<string, unknown> = bruto;

  if (versao === 1) {
    // v1: { versao, projeto, camadas: Camada[], elementos: ElementoBim[] }
    const camadasV1 = Array.isArray(bruto.camadas) ? (bruto.camadas as Camada[]) : [];
    const elementos = Array.isArray(bruto.elementos) ? (bruto.elementos as ElementoBim[]) : [];
    atual = {
      versao: 2,
      projeto: bruto.projeto,
      camadas: {
        camadas: camadasV1,
        modos: MODOS_PADRAO.map((m) => ({ ...m, camadasVisiveis: [...m.camadasVisiveis] })),
        camadaAtivaId: camadasV1.length > 0 ? camadasV1[0].id : 'camada_estrutura',
        modoAtivoId: 'modo_completo',
      },
      bim: elementos,
      modelador: { solidos: [], proximoSolidoN: 0 },
      mep: [],
    };
    versao = 2;
    avisos.push('documento v1 migrado para v2 (elementos → bim, camadas → objeto, modelador/mep vazios)');
  }

  if (versao !== VERSAO_DOCUMENTO) {
    throw new Error('versao desconhecida: ' + String(versao));
  }
  return { documento: atual, migrado: avisos.length > 0, avisos };
}

function numeroDoId(id: string): number {
  const partes = id.split('_');
  const ultimo = Number(partes[partes.length - 1]);
  return Number.isFinite(ultimo) ? ultimo : 0;
}

/** Valida e normaliza. Reparos seguros (proximoSolidoN) viram aviso, não erro. */
export function validar(bruto: unknown): ResultadoDocumento {
  if (!ehObjeto(bruto)) return { ok: false, erro: { codigo: 'INVALIDO', problemas: [{ caminho: '', problema: 'documento nao e objeto' }] } };

  const problemas: ProblemaDoc[] = [];
  const avisos: string[] = [];

  const versaoBruta = bruto.versao;
  if (typeof versaoBruta !== 'number') {
    return { ok: false, erro: { codigo: 'VERSAO_DESCONHECIDA', versao: numeroOu(versaoBruta, 0) } };
  }
  if (versaoBruta > VERSAO_DOCUMENTO) {
    return { ok: false, erro: { codigo: 'VERSAO_A_FRENTE', versao: versaoBruta, suportada: VERSAO_DOCUMENTO } };
  }

  let migrado = false;
  let normalizado: unknown = bruto;
  if (versaoBruta < VERSAO_DOCUMENTO) {
    try {
      const m = migrar(bruto);
      normalizado = m.documento;
      migrado = m.migrado;
      avisos.push(...m.avisos);
    } catch (erro) {
      return { ok: false, erro: { codigo: 'VERSAO_DESCONHECIDA', versao: versaoBruta } };
    }
  }

  const doc = normalizado as Record<string, unknown>;

  const projeto = ehObjeto(doc.projeto) ? doc.projeto : {};
  if (stringOu(projeto.id, '').length === 0) problemas.push({ caminho: 'projeto.id', problema: 'ausente' });
  if (stringOu(projeto.nome, '').length === 0) problemas.push({ caminho: 'projeto.nome', problema: 'ausente' });

  const camadasObj = ehObjeto(doc.camadas) ? doc.camadas : {};
  const camadas = Array.isArray(camadasObj.camadas) ? (camadasObj.camadas as Camada[]) : [];
  if (camadas.length === 0) problemas.push({ caminho: 'camadas', problema: 'nenhuma camada' });

  const idsCamadas = new Set(camadas.map((c) => c.id));
  if (!idsCamadas.has(stringOu(camadasObj.camadaAtivaId, ''))) {
    problemas.push({ caminho: 'camadas.camadaAtivaId', problema: 'aponta para camada inexistente' });
  }

  const modos = Array.isArray(camadasObj.modos) ? (camadasObj.modos as ModoVisualizacao[]) : [];
  const modoAtivo = camadasObj.modoAtivoId;
  if (modoAtivo !== null && typeof modoAtivo === 'string' && !modos.some((m) => m.id === modoAtivo)) {
    problemas.push({ caminho: 'camadas.modoAtivoId', problema: 'aponta para modo inexistente' });
  }

  const bim = Array.isArray(doc.bim) ? (doc.bim as ElementoBim[]) : [];
  for (let i = 0; i < bim.length; i += 1) {
    const el = bim[i];
    if (typeof el.id !== 'string' || el.id.length === 0) problemas.push({ caminho: 'bim[' + String(i) + '].id', problema: 'ausente' });
    if (typeof el.tipo !== 'string') problemas.push({ caminho: 'bim[' + String(i) + '].tipo', problema: 'ausente' });
    if (typeof el.camadaId !== 'string' || (!idsCamadas.has(el.camadaId) && el.camadaId !== '__modelador__')) {
      problemas.push({ caminho: 'bim[' + String(i) + '].camadaId', problema: 'camada inexistente' });
    }
    if (!ehObjeto(el.geometria)) problemas.push({ caminho: 'bim[' + String(i) + '].geometria', problema: 'ausente' });
  }

  const modeladorBruto = ehObjeto(doc.modelador) ? doc.modelador : {};
  const solidos = Array.isArray(modeladorBruto.solidos) ? (modeladorBruto.solidos as Solido[]) : [];
  let proximo = numeroOu(modeladorBruto.proximoSolidoN, 0);

  // Invariante 10: o contador é monotônico. Se veio menor que o maior id, repara.
  let maiorId = 0;
  for (const solido of solidos) {
    if (typeof solido.id === 'string') maiorId = Math.max(maiorId, numeroDoId(solido.id));
  }
  if (proximo < maiorId) {
    avisos.push('proximoSolidoN ajustado de ' + String(proximo) + ' para ' + String(maiorId));
    proximo = maiorId;
  }

  const mep = Array.isArray(doc.mep) ? (doc.mep as ElementoMEP[]) : [];
  for (let i = 0; i < mep.length; i += 1) {
    const el = mep[i];
    if (typeof el.id !== 'string' || el.id.length === 0) problemas.push({ caminho: 'mep[' + String(i) + '].id', problema: 'ausente' });
    if (!Array.isArray(el.caminho)) problemas.push({ caminho: 'mep[' + String(i) + '].caminho', problema: 'ausente' });
  }

  if (problemas.length > 0) return { ok: false, erro: { codigo: 'INVALIDO', problemas } };

  const documento: DocumentoArqdor = {
    versao: VERSAO_DOCUMENTO,
    projeto: {
      id: stringOu(projeto.id, ''),
      nome: stringOu(projeto.nome, ''),
      criadoEm: stringOu(projeto.criadoEm, ''),
      atualizadoEm: stringOu(projeto.atualizadoEm, ''),
    },
    camadas: {
      camadas,
      modos,
      camadaAtivaId: stringOu(camadasObj.camadaAtivaId, camadas[0].id),
      modoAtivoId: typeof modoAtivo === 'string' ? modoAtivo : null,
    },
    bim,
    modelador: { solidos, proximoSolidoN: proximo },
    mep,
  };

  return { ok: true, documento, migrado, avisos };
}

export function desserializar(texto: string): ResultadoDocumento {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : 'falha ao interpretar';
    return { ok: false, erro: { codigo: 'JSON_INVALIDO', detalhe } };
  }
  return validar(bruto);
}

/** Estado de execução a partir do documento — UI volta ao padrão (regra 9). */
export function paraEstadoExecucao(documento: DocumentoArqdor): {
  camadas: EstadoCamadas;
  bim: ElementoBim[];
  modelador: EstadoModelador;
  mep: ElementoMEP[];
} {
  return {
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
  };
}