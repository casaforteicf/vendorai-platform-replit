/**
 * Bloco 4 — camadas, modos e exceções por objeto (lógica pura).
 *
 * D4 (descoberto ao codar): havia DUAS verdades de visibilidade — `camada.visivel` e
 * `modo.camadasVisiveis`. Fica uma: a camada manda; o modo é PRESET que reescreve as flags.
 * Toggle manual desmarca o modo ativo (estado deixa de corresponder ao preset).
 */

export interface Camada {
  id: string;
  nome: string;
  visivel: boolean;
  padrao: boolean;
  ordem: number;
}

export interface ModoVisualizacao {
  id: string;
  nome: string;
  camadasVisiveis: string[];
  padrao: boolean;
}

/** Sentinela: sólidos do modelador nunca são filtrados por camada. */
export const CAMADA_MODELADOR = '__modelador__';

export const CAMADAS_PADRAO: Camada[] = [
  { id: 'camada_estrutura', nome: 'Estrutura', visivel: true, padrao: true, ordem: 0 },
  { id: 'camada_mobiliario', nome: 'Mobiliário', visivel: true, padrao: true, ordem: 1 },
  { id: 'camada_frentes', nome: 'Frentes', visivel: true, padrao: true, ordem: 2 },
];

export const MODOS_PADRAO: ModoVisualizacao[] = [
  { id: 'modo_completo', nome: 'Completo', camadasVisiveis: CAMADAS_PADRAO.map((c) => c.id), padrao: true },
  { id: 'modo_estrutural', nome: 'Estrutural', camadasVisiveis: ['camada_estrutura'], padrao: true },
];

export interface EstadoCamadas {
  camadas: Camada[];
  modos: ModoVisualizacao[];
  camadaAtivaId: string;
  /** null = ajuste manual, sem preset correspondente. */
  modoAtivoId: string | null;
  /** Exceções locais (regra 9: estado de UI, não vai para o documento). */
  objetosOcultosIds: string[];
}

export type ErroCamadas =
  | { codigo: 'CAMADA_NAO_ENCONTRADA'; camadaId: string }
  | { codigo: 'CAMADA_PADRAO'; camadaId: string }
  | { codigo: 'MODO_NAO_ENCONTRADO'; modoId: string }
  | { codigo: 'MODO_PADRAO'; modoId: string }
  | { codigo: 'NOME_VAZIO' }
  | { codigo: 'MODO_SEM_CAMADA' }
  | { codigo: 'ESTADO_INCONSISTENTE'; detalhe: string };

export type ResultadoCamadas =
  | { ok: true; estado: EstadoCamadas }
  | { ok: false; erro: ErroCamadas };

function falha(erro: ErroCamadas): ResultadoCamadas {
  return { ok: false, erro };
}

function reindexar(camadas: Camada[]): Camada[] {
  return camadas.map((c, i) => ({ ...c, ordem: i }));
}

export function estadoInicialCamadas(): EstadoCamadas {
  return {
    camadas: CAMADAS_PADRAO.map((c) => ({ ...c })),
    modos: MODOS_PADRAO.map((m) => ({ ...m, camadasVisiveis: [...m.camadasVisiveis] })),
    camadaAtivaId: 'camada_estrutura',
    modoAtivoId: 'modo_completo',
    objetosOcultosIds: [],
  };
}

export function camadaPorId(estado: EstadoCamadas, id: string): Camada | undefined {
  return estado.camadas.find((c) => c.id === id);
}

export function camadaFallback(estado: EstadoCamadas): string {
  const padrao = estado.camadas.filter((c) => c.padrao).sort((a, b) => a.ordem - b.ordem)[0];
  if (padrao !== undefined) return padrao.id;
  const primeira = estado.camadas.slice().sort((a, b) => a.ordem - b.ordem)[0];
  return primeira !== undefined ? primeira.id : 'camada_estrutura';
}

export function camadasVisiveis(estado: EstadoCamadas): string[] {
  return estado.camadas.filter((c) => c.visivel).map((c) => c.id);
}

export function criarCamada(estado: EstadoCamadas, nome: string): ResultadoCamadas {
  const limpo = nome.trim();
  if (limpo.length === 0) return falha({ codigo: 'NOME_VAZIO' });

  let n = estado.camadas.length + 1;
  while (estado.camadas.some((c) => c.id === 'camada_' + String(n))) n += 1;
  const camada: Camada = { id: 'camada_' + String(n), nome: limpo, visivel: true, padrao: false, ordem: estado.camadas.length };

  return { ok: true, estado: { ...estado, camadas: [...estado.camadas, camada], camadaAtivaId: camada.id } };
}

export function renomearCamada(estado: EstadoCamadas, camadaId: string, nome: string): ResultadoCamadas {
  const limpo = nome.trim();
  if (limpo.length === 0) return falha({ codigo: 'NOME_VAZIO' });
  if (camadaPorId(estado, camadaId) === undefined) return falha({ codigo: 'CAMADA_NAO_ENCONTRADA', camadaId });
  return { ok: true, estado: { ...estado, camadas: estado.camadas.map((c) => (c.id === camadaId ? { ...c, nome: limpo } : c)) } };
}

export function alternarVisibilidade(estado: EstadoCamadas, camadaId: string): ResultadoCamadas {
  if (camadaPorId(estado, camadaId) === undefined) return falha({ codigo: 'CAMADA_NAO_ENCONTRADA', camadaId });
  const camadas = estado.camadas.map((c) => (c.id === camadaId ? { ...c, visivel: !c.visivel } : c));
  return { ok: true, estado: { ...estado, camadas, modoAtivoId: null } };
}

/** Best-effort: ids desconhecidos são ignorados; ausentes vão para o fim. */
export function reordenarCamadas(estado: EstadoCamadas, ordemDesejada: readonly string[]): ResultadoCamadas {
  const porId = new Map(estado.camadas.map((c) => [c.id, c]));
  const ordenadas: Camada[] = [];
  for (const id of ordemDesejada) {
    const camada = porId.get(id);
    if (camada !== undefined && !ordenadas.some((c) => c.id === id)) {
      ordenadas.push(camada);
      porId.delete(id);
    }
  }
  const restantes = [...porId.values()].sort((a, b) => a.ordem - b.ordem);
  return { ok: true, estado: { ...estado, camadas: reindexar([...ordenadas, ...restantes]) } };
}

export type ResultadoDelecaoCamada =
  | { ok: true; estado: EstadoCamadas; fallbackId: string }
  | { ok: false; erro: ErroCamadas };

export function deletarCamada(estado: EstadoCamadas, camadaId: string): ResultadoDelecaoCamada {
  const alvo = camadaPorId(estado, camadaId);
  if (alvo === undefined) return { ok: false, erro: { codigo: 'CAMADA_NAO_ENCONTRADA', camadaId } };
  if (alvo.padrao) return { ok: false, erro: { codigo: 'CAMADA_PADRAO', camadaId } };
  if (estado.camadas.length <= 1) {
    return { ok: false, erro: { codigo: 'ESTADO_INCONSISTENTE', detalhe: 'última camada não pode ser removida' } };
  }

  const fallbackId = camadaFallback(estado);
  const camadas = reindexar(estado.camadas.filter((c) => c.id !== camadaId));

  const modos = estado.modos.map((modo) => {
    const restantes = modo.camadasVisiveis.filter((id) => id !== camadaId);
    return { ...modo, camadasVisiveis: restantes.length > 0 ? restantes : [fallbackId] };
  });

  const camadaAtivaId = estado.camadaAtivaId === camadaId ? fallbackId : estado.camadaAtivaId;
  return { ok: true, estado: { ...estado, camadas, modos, camadaAtivaId }, fallbackId };
}

export function aplicarModo(estado: EstadoCamadas, modoId: string): ResultadoCamadas {
  const modo = estado.modos.find((m) => m.id === modoId);
  if (modo === undefined) return falha({ codigo: 'MODO_NAO_ENCONTRADO', modoId });
  const camadas = estado.camadas.map((c) => ({ ...c, visivel: modo.camadasVisiveis.includes(c.id) }));
  return { ok: true, estado: { ...estado, camadas, modoAtivoId: modoId } };
}

export function criarModo(estado: EstadoCamadas, nome: string, camadasVisiveisIds: readonly string[]): ResultadoCamadas {
  const limpo = nome.trim();
  if (limpo.length === 0) return falha({ codigo: 'NOME_VAZIO' });
  const validas = camadasVisiveisIds.filter((id) => camadaPorId(estado, id) !== undefined);
  if (validas.length === 0) return falha({ codigo: 'MODO_SEM_CAMADA' });

  let n = estado.modos.length + 1;
  while (estado.modos.some((m) => m.id === 'modo_' + String(n))) n += 1;
  const modo: ModoVisualizacao = { id: 'modo_' + String(n), nome: limpo, camadasVisiveis: validas, padrao: false };
  return { ok: true, estado: { ...estado, modos: [...estado.modos, modo] } };
}

export function editarModo(estado: EstadoCamadas, modoId: string, camadasVisiveisIds: readonly string[]): ResultadoCamadas {
  if (!estado.modos.some((m) => m.id === modoId)) return falha({ codigo: 'MODO_NAO_ENCONTRADO', modoId });
  const validas = camadasVisiveisIds.filter((id) => camadaPorId(estado, id) !== undefined);
  if (validas.length === 0) return falha({ codigo: 'MODO_SEM_CAMADA' });

  const modos = estado.modos.map((m) => (m.id === modoId ? { ...m, camadasVisiveis: validas } : m));
  if (estado.modoAtivoId === modoId) {
    const camadas = estado.camadas.map((c) => ({ ...c, visivel: validas.includes(c.id) }));
    return { ok: true, estado: { ...estado, modos, camadas } };
  }
  return { ok: true, estado: { ...estado, modos } };
}

export function deletarModo(estado: EstadoCamadas, modoId: string): ResultadoCamadas {
  const modo = estado.modos.find((m) => m.id === modoId);
  if (modo === undefined) return falha({ codigo: 'MODO_NAO_ENCONTRADO', modoId });
  if (modo.padrao) return falha({ codigo: 'MODO_PADRAO', modoId });

  const modos = estado.modos.filter((m) => m.id !== modoId);
  const primeiroPadrao = modos.find((m) => m.padrao);
  const modoAtivoId =
    estado.modoAtivoId === modoId ? (primeiroPadrao !== undefined ? primeiroPadrao.id : null) : estado.modoAtivoId;
  return { ok: true, estado: { ...estado, modos, modoAtivoId } };
}

export function alternarOcultoObjeto(estado: EstadoCamadas, objetoId: string): ResultadoCamadas {
  const oculto = estado.objetosOcultosIds.includes(objetoId);
  const objetosOcultosIds = oculto
    ? estado.objetosOcultosIds.filter((id) => id !== objetoId)
    : [...estado.objetosOcultosIds, objetoId];
  return { ok: true, estado: { ...estado, objetosOcultosIds } };
}

export function revelarTodosObjetos(estado: EstadoCamadas): ResultadoCamadas {
  return { ok: true, estado: { ...estado, objetosOcultosIds: [] } };
}

export interface ObjetoComCamada {
  id: string;
  camadaId?: string;
}

/** Sentinela > exceção local > camada. Objeto legado sem camada é visível. */
export function objetoVisivel(estado: EstadoCamadas, objeto: ObjetoComCamada): boolean {
  if (objeto.camadaId === CAMADA_MODELADOR) return true;
  if (estado.objetosOcultosIds.includes(objeto.id)) return false;
  if (objeto.camadaId === undefined) return true;
  const camada = camadaPorId(estado, objeto.camadaId);
  return camada === undefined ? true : camada.visivel;
}

export interface ResultadoMigracao<T> {
  objetos: T[];
  migrados: number;
}

/** Objetos legados (sem camadaId) caem na camada padrão. */
export function hidratarObjetos<T extends ObjetoComCamada>(estado: EstadoCamadas, objetos: readonly T[]): ResultadoMigracao<T> {
  const fallback = camadaFallback(estado);
  let migrados = 0;
  const saida = objetos.map((obj) => {
    if (obj.camadaId !== undefined) return obj;
    migrados += 1;
    return { ...obj, camadaId: fallback };
  });
  return { objetos: saida, migrados };
}

/** Objetos apontando para camada inexistente voltam para a camada padrão. */
export function faxineiroOrfaos<T extends ObjetoComCamada>(estado: EstadoCamadas, objetos: readonly T[]): ResultadoMigracao<T> {
  const fallback = camadaFallback(estado);
  const existentes = new Set(estado.camadas.map((c) => c.id));
  let migrados = 0;
  const saida = objetos.map((obj) => {
    const id = obj.camadaId;
    if (id === undefined || id === CAMADA_MODELADOR || existentes.has(id)) return obj;
    migrados += 1;
    return { ...obj, camadaId: fallback };
  });
  return { objetos: saida, migrados };
}